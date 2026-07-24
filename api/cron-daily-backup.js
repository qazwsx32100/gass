import { captureServerException } from './_monitoring.js';
import {
  createCloudBackup,
  fetchAppState,
  getClientIp,
  markBackupDriveResult,
  sendJson
} from './_auth.js';
import { uploadBackupToGoogleDrive } from './_google-drive.js';

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
    return sendJson(res, 500, { ok: false, error: 'Backup failed.' });
  }
}
