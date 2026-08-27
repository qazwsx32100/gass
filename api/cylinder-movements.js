import { captureServerException } from './_monitoring.js';
import {
  fetchAppState,
  getBearerToken,
  getClientIp,
  getSyncSecret,
  sendJson,
  verifyToken
} from './_auth.js';
import { fetchWithTimeout } from './_fetch.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_CODE_PATTERN = /^[A-Z]?$/;
const queryRateLimiter = createBoundedRateLimiter({
  windowMs: 60 * 1000,
  maxEntries: 5000
});

const getSupabaseUrl = () => {
  const value = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!value) throw new Error('SUPABASE_URL is not configured.');
  return value.replace(/\/$/, '');
};

const getSupabaseEdgeJwt = () => {
  const value = String(
    process.env.SUPABASE_EDGE_JWT ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!value.startsWith('eyJ') || value.split('.').length !== 3) {
    throw new Error('SUPABASE_EDGE_JWT is not configured.');
  }
  return value;
};

const listLegacyCylinderMovements = async (params) => {
  const edgeJwt = getSupabaseEdgeJwt();
  const response = await fetchWithTimeout(`${getSupabaseUrl()}/functions/v1/erp-privileged-rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${edgeJwt}`,
      apikey: edgeJwt,
      'X-ERP-Sync-Secret': getSyncSecret()
    },
    body: JSON.stringify({
      functionName: 'erp_list_legacy_cylinder_movements',
      params
    })
  }, 12000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Privileged RPC failed with status ${response.status}.`);
  }
  const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  return row || { items: [], total: 0 };
};

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
  return Boolean(user && !user.disabled && isApprovedDevice(user, session.deviceId));
};

const cleanDate = (value) => {
  const date = String(value || '').trim();
  return DATE_PATTERN.test(date) ? date : null;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const session = verifyToken(getBearerToken(req));
  if (!session) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  const rateLimitKey = `${session.id}:${getClientIp(req) || 'unknown'}`;
  if (queryRateLimiter.check([{ key: rateLimitKey, max: 120 }])) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { ok: false, error: 'Too many requests.' });
  }

  try {
    const current = await fetchAppState();
    if (!isSessionAllowed(current.state || {}, session)) {
      return sendJson(res, 401, { ok: false, error: 'Session is no longer allowed.' });
    }

    const companyId = String(req.query?.companyId || '').trim();
    const companyExists = (current.state?.companies || []).some(company => company.id === companyId);
    if (!companyExists) {
      return sendJson(res, 400, { ok: false, error: 'Unknown company.' });
    }

    const statusCode = String(req.query?.statusCode || '').trim().toUpperCase();
    if (!STATUS_CODE_PATTERN.test(statusCode)) {
      return sendJson(res, 400, { ok: false, error: 'Unknown movement type.' });
    }

    const startDateInput = String(req.query?.startDate || '').trim();
    const endDateInput = String(req.query?.endDate || '').trim();
    const page = Number(req.query?.page || 1);
    if (
      (startDateInput && !cleanDate(startDateInput)) ||
      (endDateInput && !cleanDate(endDateInput)) ||
      !Number.isSafeInteger(page) || page < 1 || page > 10000
    ) {
      return sendJson(res, 400, { ok: false, error: 'Invalid date or page.' });
    }

    const result = await listLegacyCylinderMovements({
      p_company_id: companyId,
      p_search: String(req.query?.search || '').trim().slice(0, 80),
      p_status_code: statusCode,
      p_start_date: cleanDate(startDateInput),
      p_end_date: cleanDate(endDateInput),
      p_offset: (page - 1) * 100,
      p_limit: 100
    });

    return sendJson(res, 200, {
      ok: true,
      items: Array.isArray(result.items) ? result.items : [],
      total: Number(result.total || 0),
      page
    });
  } catch (error) {
    console.error('cylinder movements API failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/cylinder-movements', method: req.method, status: 500 }
    });
    return sendJson(res, 500, { ok: false, error: 'Cylinder movement history query failed.' });
  }
}
