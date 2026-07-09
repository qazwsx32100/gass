import {
  createCloudBackup,
  fetchAppState,
  getBearerToken,
  getClientIp,
  listCloudBackups,
  restoreCloudBackup,
  sanitizeStateForClient,
  sendJson,
  verifyToken
} from './_auth.js';

const isApprovedDevice = (security, deviceId) => (
  Boolean(deviceId) &&
  Array.isArray(security?.approvedDevices) &&
  security.approvedDevices.some(device => device.id === deviceId)
);

const isAdminSessionAllowed = (state, session) => {
  if (!state || session?.id !== 'ADMIN') return false;
  const security = state.adminSecurity || {};
  return !security.disabled && isApprovedDevice(security, session.deviceId);
};

const parseBody = (req) => (
  req.body && typeof req.body === 'object'
    ? req.body
    : JSON.parse(req.body || '{}')
);

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const session = verifyToken(getBearerToken(req));
  if (!session) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const current = await fetchAppState();
    if (!isAdminSessionAllowed(current.state, session)) {
      return sendJson(res, 403, { ok: false, error: 'Only the main administrator can manage backups.' });
    }

    if (req.method === 'GET') {
      const backups = await listCloudBackups(50);
      return sendJson(res, 200, { ok: true, backups });
    }

    const body = parseBody(req);
    const action = String(body.action || 'create');

    if (action === 'create') {
      const backup = await createCloudBackup({
        reason: body.reason || 'manual',
        actor: session.name || '主管理員',
        requestIp: getClientIp(req)
      });
      return sendJson(res, 200, { ok: true, backup });
    }

    if (action === 'restore') {
      if (body.confirm !== 'RESTORE') {
        return sendJson(res, 400, { ok: false, error: 'Restore confirmation is required.' });
      }
      if (!body.backupId) {
        return sendJson(res, 400, { ok: false, error: 'backupId is required.' });
      }

      const restored = await restoreCloudBackup({
        backupId: body.backupId,
        actor: session.name || '主管理員',
        requestIp: getClientIp(req)
      });
      const row = await fetchAppState();
      return sendJson(res, 200, {
        ok: true,
        restored,
        state: sanitizeStateForClient(row.state || {}),
        updated_at: row.updated_at,
        updated_by: row.updated_by
      });
    }

    return sendJson(res, 400, { ok: false, error: 'Unsupported backup action.' });
  } catch (error) {
    console.error('backups API failed', error);
    return sendJson(res, 500, { ok: false, error: 'Backup API failed.' });
  }
}
