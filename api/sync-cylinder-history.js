import crypto from 'node:crypto';
import { getSupabase, sendJson, getClientIp } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import { isGoogleDriveBackupConfigured, uploadPrivateFileToGoogleDrive } from './_google-drive.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  },
  maxDuration: 60
};

// 🛡️ 限制同來源連線速率：每分鐘最多 10 次，防範無效重複轟炸
const syncRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 100
});

function verifySyncAuth(req) {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const candidates = [
    req.headers['x-erp-sync-secret'],
    req.headers['x-status-token'],
    req.headers['x-system-status-token'],
    bearerToken
  ].map(s => String(s || '').trim()).filter(Boolean);

  if (candidates.length === 0) return false;

  const validTokens = [
    process.env.SYSTEM_STATUS_REPORT_TOKEN?.trim(),
    process.env.ERP_SYNC_SECRET?.trim(),
    process.env.CRON_SECRET?.trim()
  ].filter(Boolean);

  if (validTokens.length === 0) return false;

  for (const cand of candidates) {
    for (const valid of validTokens) {
      try {
        const b1 = Buffer.from(cand);
        const b2 = Buffer.from(valid);
        if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
          return true;
        }
      } catch {}
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  // 1. 驗證密鑰 (支援 X-Status-Token, X-ERP-Sync-Secret 或 Bearer Token)
  if (!verifySyncAuth(req)) {
    return sendJson(res, 401, { error: 'Unauthorized: Invalid cylinder sync or status token' });
  }

  // 2. 限流防護
  const clientIp = getClientIp(req) || 'unknown';
  if (syncRateLimiter.check([{ key: `sync_cylinder:${clientIp}`, max: 10 }])) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: 'Too many sync requests. Please try again later.' });
  }

  // 3. 解析傳入 Payload
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body' });
    }
  }

  const payload = (body?.params?.p_payload || body?.payload || body);
  if (!payload || payload.source !== 'shenglong_cylinder') {
    return sendJson(res, 400, { error: 'Invalid cylinder sync payload: missing source=shenglong_cylinder' });
  }

  const companyId = payload.companyId || 'COMP001';
  const businessDate = payload.businessDate || new Date().toISOString().slice(0, 10);
  const totalRecords = Number(payload.totalHistoricalRecords || payload.total || 0);
  const depositCount = Number(payload.depositCount || 0);
  const refundCount = Number(payload.refundCount || 0);
  const movementRows = Array.isArray(payload.recentMovements) ? payload.recentMovements.length : 0;

  let backupId = `CYLINDER-FALLBACK-${Date.now()}`;
  let supabaseSynced = false;
  let syncNotice = '';

  // 4. 嘗試直接呼叫 Supabase RPC（若非 402 受限環境則自動灌入）
  try {
    const supabase = getSupabase(25000);
    if (payload.recentMovements && payload.recentMovements.length > 0) {
      const { data, error } = await supabase.rpc('erp_upsert_legacy_cylinder_movements', {
        p_company_id: companyId,
        p_rows: payload.recentMovements
      });
      if (!error && data) {
        supabaseSynced = true;
        syncNotice = 'Supabase direct RPC succeeded for recent movements';
      } else if (error) {
        syncNotice = `Supabase direct RPC restricted or bypassed: ${error.message || error}`;
      }
    }
  } catch (err) {
    syncNotice = `Supabase unreachable: ${err?.message || err}`;
  }

  // 5. 雲端 Google Drive 備援封存 (若配置 Drive 則保存快照)
  let driveBackupLink = null;
  if (isGoogleDriveBackupConfigured()) {
    try {
      const filename = `cylinder_sync_${businessDate}_${Date.now()}.json`;
      const driveRes = await uploadPrivateFileToGoogleDrive({
        filename,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
        description: `盛隆鋼瓶進出歷史備援快照: ${businessDate}, 總數=${totalRecords}, 押瓶=${depositCount}, 退押=${refundCount}`
      });
      driveBackupLink = driveRes?.webViewLink || driveRes?.id || 'uploaded';
    } catch (driveErr) {
      console.warn('Google Drive backup archive notice:', driveErr?.message || driveErr);
    }
  }

  // 6. 回傳標準成功回應 (相容地端預期)
  const resultData = {
    success: true,
    channel: 'vercel_backup_channel',
    companyId,
    businessDate,
    totalHistoricalRecords: totalRecords,
    depositCount,
    refundCount,
    movementRows,
    supabaseSynced,
    backupId,
    driveBackupLink,
    syncedAt: new Date().toISOString(),
    notice: syncNotice
  };

  return sendJson(res, 200, {
    ...resultData,
    data: resultData
  });
}
