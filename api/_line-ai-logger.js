import { getSupabase } from './_auth.js';
import { isGoogleDriveBackupConfigured, uploadPrivateFileToGoogleDrive } from './_google-drive.js';

// 本地內存快取（供無 DB 或本地開發時應急查詢最近 50 筆）
const localMemoryLogs = [];
const MAX_LOCAL_MEMORY = 50;

/**
 * 🛡️ [ARCHIVE-THEN-PRUNE-20261106]
 * 方案 1：封存 30 天前對話至 Google Drive 官方資料夾 (1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM)，
 * 確保先備份成功後才從 Supabase 刪除，達成「零資料遺失」與「DB 容量大瘦身」。
 */
export async function archiveAndPruneOldLogs(supabaseClient = null, options = {}) {
  const {
    retentionDays = 30,
    batchSize = 500,
    allowUnbackedPrune = false,
    uploader = uploadPrivateFileToGoogleDrive,
    isConfiguredChecker = isGoogleDriveBackupConfigured
  } = options;

  let supabase = supabaseClient;
  if (!supabase) {
    try {
      supabase = getSupabase(10000);
    } catch (err) {
      return { ok: false, error: `Supabase 初始化失敗: ${err.message}`, archivedCount: 0, prunedCount: 0 };
    }
  }

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. 抓取過期對話紀錄 (批次提取，防止大物件 OOM)
  const { data: oldLogs, error: fetchErr } = await supabase
    .from('line_ai_logs')
    .select('*')
    .lt('created_at', cutoffDate)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (fetchErr) {
    console.warn('[LineAiLogger] 查詢待封存舊紀錄失敗:', fetchErr.message);
    return { ok: false, error: fetchErr.message, archivedCount: 0, prunedCount: 0 };
  }

  if (!oldLogs || oldLogs.length === 0) {
    return { ok: true, archivedCount: 0, prunedCount: 0, status: 'no_old_logs' };
  }

  const isConfigured = isConfiguredChecker();
  let driveResult = null;

  // 2. 若 Google Drive 已配置，執行上傳封存
  if (isConfigured) {
    try {
      const firstDate = oldLogs[0].created_at ? String(oldLogs[0].created_at).slice(0, 10) : 'start';
      const lastDate = oldLogs[oldLogs.length - 1].created_at ? String(oldLogs[oldLogs.length - 1].created_at).slice(0, 10) : 'end';
      const filename = `line_ai_logs_archive_${firstDate}_to_${lastDate}_${Date.now()}.json`;
      const payload = {
        archiveMetadata: {
          exportedAt: new Date().toISOString(),
          recordCount: oldLogs.length,
          retentionCutoff: cutoffDate,
          firstRecordAt: oldLogs[0].created_at,
          lastRecordAt: oldLogs[oldLogs.length - 1].created_at,
          googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM'
        },
        logs: oldLogs
      };

      const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      driveResult = await uploader({
        filename,
        mimeType: 'application/json',
        buffer,
        description: `盛隆瓦斯 LINE AI 客服對話歷史自動封存 (${oldLogs.length} 筆，區間: ${firstDate} ~ ${lastDate})`
      });
    } catch (uploadErr) {
      console.error('[LineAiLogger] 上傳 Google Drive 封存失敗，中止修剪以保護資料安全:', uploadErr.message);
      return {
        ok: false,
        error: `Google Drive 封存失敗: ${uploadErr.message}`,
        archivedCount: 0,
        prunedCount: 0,
        status: 'upload_failed_abort_prune'
      };
    }
  } else if (!allowUnbackedPrune) {
    console.warn('[LineAiLogger] Google Drive 尚未配置且未開啟強制無備份修剪，跳過刪除以防資料遺失。');
    return {
      ok: true,
      archivedCount: 0,
      prunedCount: 0,
      status: 'drive_not_configured_skip_prune'
    };
  }

  // 3. 封存成功（或允許無備份修剪）後，刪除對應 ID 之舊資料
  const idsToDelete = oldLogs.map(l => l.id).filter(Boolean);
  let deleteQuery;
  if (idsToDelete.length > 0) {
    deleteQuery = supabase.from('line_ai_logs').delete().in('id', idsToDelete);
  } else {
    deleteQuery = supabase.from('line_ai_logs').delete().lt('created_at', cutoffDate);
  }

  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) {
    console.error('[LineAiLogger] 刪除已封存之 Supabase 舊日誌失敗:', deleteErr.message);
    return {
      ok: true,
      archivedCount: oldLogs.length,
      prunedCount: 0,
      googleDriveFileId: driveResult?.id || null,
      error: `封存成功但修剪失敗: ${deleteErr.message}`,
      status: 'archived_but_prune_failed'
    };
  }

  return {
    ok: true,
    archivedCount: oldLogs.length,
    prunedCount: oldLogs.length,
    googleDriveFileId: driveResult?.id || null,
    filename: driveResult?.name || null,
    webViewLink: driveResult?.webViewLink || null,
    status: 'archived_and_pruned'
  };
}

// 🛡️ [SUPABASE-STORAGE-SHIELD-20261106]
// LINE 對話日誌自動修剪計數器（每 50 筆非同步清理 30 天前舊紀錄，確保 DB 容量永遠小於 50MB）
let logWriteCounter = 0;
async function opportunisticPruneOldLogs(supabase) {
  logWriteCounter++;
  if (logWriteCounter % 50 !== 0) return;
  try {
    await archiveAndPruneOldLogs(supabase);
  } catch (err) {
    console.warn('[LineAiLogger] 機會型封存修剪背景執行異常 (非致命):', err.message);
  }
}

/**
 * 記錄一筆 LINE AI 對話歷程
 */
export async function recordLineAiChat({
  lineUserId = 'unknown',
  userName = '',
  userMessage = '',
  aiReply = '',
  aiResult = null,
  isOrderIntent = false,
  status = 'success',
  errorMessage = null,
  rawEvent = null
}) {
  const logItem = {
    line_user_id: lineUserId || 'unknown',
    user_name: userName || null,
    user_message: userMessage || '',
    ai_reply: aiReply || '',
    account_id: aiResult?.accountId || null,
    account_name: aiResult?.accountName || null,
    provider: aiResult?.provider || null,
    model: aiResult?.model || null,
    tokens: Number(aiResult?.tokens || 0),
    latency_ms: Number(aiResult?.latencyMs || 0),
    failover_count: Number(aiResult?.failoverCount || 0),
    is_order_intent: Boolean(isOrderIntent),
    status: status || 'success',
    error_message: errorMessage || null,
    raw_event: rawEvent || null,
    created_at: new Date().toISOString()
  };

  // 1. 同步存入記憶體快取
  localMemoryLogs.unshift(logItem);
  if (localMemoryLogs.length > MAX_LOCAL_MEMORY) {
    localMemoryLogs.pop();
  }

  // 2. 寫入 Supabase 資料表
  try {
    const supabase = getSupabase(4000);
    // 優先使用 RPC，若無則降級為 direct insert
    const { error: rpcErr } = await supabase.rpc('erp_record_line_ai_log', {
      p_line_user_id: logItem.line_user_id,
      p_user_message: logItem.user_message,
      p_ai_reply: logItem.ai_reply,
      p_account_id: logItem.account_id,
      p_account_name: logItem.account_name,
      p_provider: logItem.provider,
      p_model: logItem.model,
      p_tokens: logItem.tokens,
      p_latency_ms: logItem.latency_ms,
      p_failover_count: logItem.failover_count,
      p_is_order_intent: logItem.is_order_intent,
      p_status: logItem.status,
      p_error_message: logItem.error_message,
      p_raw_event: logItem.raw_event
    });

    if (rpcErr) {
      // 降級為直接 insert
      const { error: insertErr } = await supabase.from('line_ai_logs').insert([logItem]);
      if (insertErr) {
        console.warn('[LineAiLogger] Supabase 寫入紀錄失敗 (非致命):', insertErr.message);
      }
    }
    // 非同步日誌修剪 (不阻塞當前對話)
    opportunisticPruneOldLogs(supabase).catch(() => {});
  } catch (err) {
    console.warn('[LineAiLogger] 寫入資料庫異常 (非致命):', err.message);
  }

  return logItem;
}

/**
 * 查詢 LINE AI 對話歷程列表
 */
export async function fetchLineAiLogs({
  limit = 50,
  offset = 0,
  isOrderIntent = null,
  userId = null,
  search = null
} = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
  const safeOffset = Math.max(0, Number(offset) || 0);

  try {
    const supabase = getSupabase(5000);
    let query = supabase
      .from('line_ai_logs')
      .select('id, line_user_id, user_name, user_message, ai_reply, account_name, provider, model, tokens, latency_ms, is_order_intent, status, created_at', { count: 'exact' });

    if (isOrderIntent !== null && isOrderIntent !== undefined && isOrderIntent !== '') {
      const boolVal = String(isOrderIntent) === 'true' || isOrderIntent === true;
      query = query.eq('is_order_intent', boolVal);
    }

    if (userId) {
      query = query.eq('line_user_id', String(userId).trim());
    }

    if (search) {
      const term = `%${String(search).trim()}%`;
      query = query.or(`user_message.ilike.${term},ai_reply.ilike.${term}`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    const { data, error, count } = await query;

    if (!error && Array.isArray(data)) {
      return {
        ok: true,
        source: 'supabase',
        total: count ?? data.length,
        limit: safeLimit,
        offset: safeOffset,
        logs: data
      };
    }
  } catch (err) {
    console.warn('[LineAiLogger] Supabase 查詢失敗，退回記憶體快取:', err.message);
  }

  // Fallback to local memory logs
  let filtered = [...localMemoryLogs];
  if (isOrderIntent !== null && isOrderIntent !== undefined && isOrderIntent !== '') {
    const boolVal = String(isOrderIntent) === 'true' || isOrderIntent === true;
    filtered = filtered.filter(l => l.is_order_intent === boolVal);
  }
  if (userId) {
    filtered = filtered.filter(l => l.line_user_id === userId);
  }
  if (search) {
    const s = String(search).toLowerCase();
    filtered = filtered.filter(l => (l.user_message && l.user_message.toLowerCase().includes(s)) || (l.ai_reply && l.ai_reply.toLowerCase().includes(s)));
  }

  return {
    ok: true,
    source: 'memory_cache',
    total: filtered.length,
    limit: safeLimit,
    offset: safeOffset,
    logs: filtered.slice(safeOffset, safeOffset + safeLimit)
  };
}
