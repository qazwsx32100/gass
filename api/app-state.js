import { fetchAppState, getBearerToken, getClientIp, sanitizeStateForClient, saveAppState, sendJson, verifyToken } from './_auth.js';

const isApprovedDevice = (security, deviceId) => (
  Boolean(deviceId) &&
  Array.isArray(security?.approvedDevices) &&
  security.approvedDevices.some(device => device.id === deviceId)
);

const isSessionAllowed = (state, session) => {
  if (!state || !session?.id) return false;

  if (session.id === 'ADMIN') {
    const security = state.adminSecurity || {};
    return !security.disabled && isApprovedDevice(security, session.deviceId);
  }

  const user = (state.shareholders || []).find(item => item.id === session.id);
  if (!user || user.disabled) return false;
  return isApprovedDevice(user, session.deviceId);
};

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const session = verifyToken(getBearerToken(req));
  if (!session) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const row = await fetchAppState();
      if (!isSessionAllowed(row.state, session)) {
        return sendJson(res, 401, { error: 'Session is no longer allowed.' });
      }
      return sendJson(res, 200, {
        ...(row || { state: null, updated_at: null, updated_by: null }),
        state: sanitizeStateForClient(row.state || {})
      });
    }

    const current = await fetchAppState();
    if (!isSessionAllowed(current.state, session)) {
      return sendJson(res, 401, { error: 'Session is no longer allowed.' });
    }

    const body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}');

    if (!body.state || typeof body.state !== 'object') {
      return sendJson(res, 400, { error: 'Invalid app state payload.' });
    }

    const updatedBy = String(body.updatedBy || session.name || '系統').slice(0, 80);
    await saveAppState({
      state: body.state,
      updatedBy,
      requestIp: getClientIp(req),
      previousState: current.state
    });
    const updated = await fetchAppState();
    return sendJson(res, 200, {
      ...(updated || { state: null, updated_at: null, updated_by: updatedBy }),
      ok: true,
      state: sanitizeStateForClient(updated.state || {})
    });
  } catch (error) {
    console.error('app-state API failed', error);
    return sendJson(res, 500, { error: 'Cloud sync failed.' });
  }
}
