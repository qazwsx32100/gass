import { captureServerException } from './_monitoring.js';
import { fetchAppState, sendJson } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const startedAt = Date.now();

  try {
    await fetchAppState();
    return sendJson(res, 200, {
      ok: true,
      service: 'gass-erp-api',
      database: 'reachable',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    console.error('health check failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/health', method: req.method, status: 503 }
    });
    return sendJson(res, 503, {
      ok: false,
      service: 'gass-erp-api',
      database: 'unreachable',
      timestamp: new Date().toISOString()
    });
  }
}
