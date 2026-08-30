import crypto from 'node:crypto';
import { captureServerException } from './_monitoring.js';
import { sendJson } from './_auth.js';

const KV_BACKUP_STATUS_URL = 'https://kvdb.io/XwdpBD41akmYGtk8ReuBTE/backup_status_v1';
const KV_STATUS_LOGS_URL = 'https://kvdb.io/XwdpBD41akmYGtk8ReuBTE/system_logs_v1';

const safeEqual = (received, expected) => {
  const actualBuffer = Buffer.from(String(received || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const isAuthorized = (req) => {
  const expected = String(process.env.SYSTEM_STATUS_REPORT_TOKEN || '').trim();
  const received = String(req.headers['x-system-status-token'] || '').trim();
  return Boolean(expected && received) && safeEqual(received, expected);
};

const asString = (value, maxLength = 256) => (
  typeof value === 'string' ? value.slice(0, maxLength) : ''
);

const asNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    throw new Error(`Status storage returned ${response.status}.`);
  }
  return response.json().catch(() => null);
};

const writeJson = async (url, value) => {
  await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
};

const loadPreviousStatus = async () => {
  try {
    const status = await fetchJson(KV_BACKUP_STATUS_URL, { cache: 'no-store' });
    return status && typeof status === 'object' ? status : {};
  } catch {
    return {};
  }
};

const addFailureLog = async (status) => {
  let logs = [];
  try {
    const stored = await fetchJson(KV_STATUS_LOGS_URL, { cache: 'no-store' });
    if (Array.isArray(stored)) logs = stored;
  } catch {}

  const duplicate = logs.some((log) => (
    log?.module === 'BACKUP' &&
    log?.severity === 'CRITICAL' &&
    log?.message === status.message &&
    Date.now() - Date.parse(log.timestamp || '') < 6 * 60 * 60 * 1000
  ));
  if (duplicate) return;

  const errorLog = {
    id: `backup_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: status.checkedAt,
    module: 'BACKUP',
    severity: 'CRITICAL',
    title: '資料庫備份失敗',
    message: status.message,
    suggestedAction: '請確認每小時備份工作、磁碟空間與 SQL Server 是否正常。'
  };
  await writeJson(KV_STATUS_LOGS_URL, [errorLog, ...logs].slice(0, 50));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.type !== 'backup') {
      return sendJson(res, 400, { ok: false, error: 'Invalid report type' });
    }

    const previous = await loadPreviousStatus();
    const healthy = body.success === true;
    const checkedAt = asString(body.checkedAt, 64) || new Date().toISOString();
    const status = {
      healthy,
      checkedAt,
      lastSuccessAt: healthy ? checkedAt : asString(previous.lastSuccessAt, 64),
      sourceUpdatedAt: asString(body.sourceUpdatedAt, 64),
      ageHours: body.ageHours == null ? null : asNonNegativeNumber(body.ageHours, null),
      sizeBytes: asNonNegativeNumber(body.sizeBytes),
      verified: body.verified === true,
      message: asString(body.message, 500) || (healthy ? '備份檢查成功。' : '備份檢查失敗。')
    };

    await writeJson(KV_BACKUP_STATUS_URL, status);
    if (!healthy) await addFailureLog(status);

    return sendJson(res, 200, { ok: true, backupStatus: status });
  } catch (error) {
    console.error('backup status report failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/backup-status', method: req.method, status: 500 }
    });
    return sendJson(res, 500, { ok: false, error: 'Backup status report failed.' });
  }
}
