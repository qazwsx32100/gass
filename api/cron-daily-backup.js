import { captureServerException } from './_monitoring.js';
import {
  createCloudBackup,
  fetchAppState,
  getClientIp,
  markBackupDriveResult,
  sendJson
} from './_auth.js';
import { uploadBackupToGoogleDrive } from './_google-drive.js';
import { sendErrorAlert, sendSystemReport } from './_telegram.js';

const isAuthorizedCron = (req) => {
  const authHeader = req.headers.authorization || '';
  const expectedCronSecret = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const expectedSyncSecret = process.env.ERP_SYNC_SECRET ? `Bearer ${process.env.ERP_SYNC_SECRET}` : '';
  return Boolean(authHeader) && (authHeader === expectedCronSecret || authHeader === expectedSyncSecret);
};

const taipeiStamp = () => (
  new Date()
    .toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(' ', 'T')
    .replace(/[:]/g, '')
);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const backup = await createCloudBackup({
      reason: 'scheduled_daily',
      actor: 'vercel_cron',
      requestIp: getClientIp(req)
    });

    const row = await fetchAppState();
    const backupPayload = {
      version: 'erp-backup-v1',
      backupId: backup.backup_id,
      createdAt: backup.created_at,
      stateHash: backup.state_hash,
      state: row.state
    };
    const jsonText = JSON.stringify(backupPayload, null, 2);
    const filename = `ERP_Backup_${taipeiStamp()}_${String(backup.backup_id).slice(0, 8)}.json`;

    let drive = { skipped: true, status: 'not_configured' };
    try {
      drive = await uploadBackupToGoogleDrive({ filename, jsonText });
      await markBackupDriveResult({
        backupId: backup.backup_id,
        status: drive.status,
        fileId: drive.fileId || null
      });

      // 備份成功：推播至匯報中心
      await sendSystemReport({
        title: '每日排程備份成功',
        content: `💾 *備份編號*：\`${String(backup.backup_id).slice(0, 8)}\`\n📦 *檔案名稱*：\`${filename}\`\n☁️ *Google Drive 狀態*：${drive.status || '成功'}\n📊 *資料大小*：${Math.round((backup.state_bytes || 0) / 1024)} KB`
      }).catch(() => {});
    } catch (driveError) {
      await captureServerException(driveError, {
        tags: { endpoint: '/api/cron-daily-backup', operation: 'google-drive-upload' }
      });
      await markBackupDriveResult({
        backupId: backup.backup_id,
        status: 'failed',
        errorMessage: driveError.message
      });
      drive = { skipped: false, status: 'failed', error: driveError.message };

      // 備份失敗：推播至回報群與匯報中心（附帶一鍵排錯重試按鈕）
      await sendErrorAlert({
        title: '雲端硬碟備份上傳失敗',
        error: driveError,
        source: 'Cron 每日備份',
        errorType: 'backup',
        actionId: String(backup.backup_id).slice(0, 8)
      }).catch(() => {});
    }

    return sendJson(res, 200, {
      ok: true,
      backupId: backup.backup_id,
      createdAt: backup.created_at,
      stateHash: backup.state_hash,
      stateBytes: backup.state_bytes,
      drive
    });
  } catch (error) {
    console.error('daily backup failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/cron-daily-backup', method: req.method, status: 500 }
    });

    await sendErrorAlert({
      title: '每日備份任務執行例外',
      error,
      source: 'Cron 每日備份',
      errorType: 'backup'
    }).catch(() => {});

    return sendJson(res, 500, { ok: false, error: 'Backup failed.' });
  }
}
