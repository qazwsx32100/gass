import { getSupabase } from './_auth.js';

// 本地內存快取（供無 DB 或本地開發時應急查詢最近 50 筆）
const localMemoryLogs = [];
const MAX_LOCAL_MEMORY = 50;

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
