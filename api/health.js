import crypto from 'node:crypto';
import { captureServerException } from './_monitoring.js';
import { fetchAppState, saveAppState, getClientIp, sendJson } from './_auth.js';

function verifyCmsBridgeSignature(rawBody = '', providedSig = '') {
  const secret = process.env.WEBSITE_CMS_BRIDGE_KEY?.trim();
  if (!secret || !providedSig) return false;
  const expected = crypto.createHmac('sha256', secret).update(String(rawBody)).digest('hex');
  const bufA = Buffer.from(String(providedSig));
  const bufB = Buffer.from(expected);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function verifyInternalHealthAuth(req) {
  const secret = process.env.ERP_SYNC_SECRET?.trim() || process.env.WEBSITE_CMS_BRIDGE_KEY?.trim();
  if (!secret) return false;
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.headers?.['x-sync-secret'] || '');
  if (!token) return false;
  const cand = crypto.createHash('sha256').update(String(token)).digest();
  const exp = crypto.createHash('sha256').update(String(secret)).digest();
  return cand.length === exp.length && crypto.timingSafeEqual(cand, exp);
}

export default async function handler(req, res) {
  // 官網後台 CMS 雲端資料庫持久化橋接模式 (?scope=website-cms)
  if (req.query?.scope === 'website-cms') {
    if (req.method === 'GET') {
      try {
        const row = await fetchAppState();
        return sendJson(res, 200, {
          ok: true,
          persisted: true,
          data: row?.state?.websiteCms || null,
          updatedAt: row?.updated_at || null
        });
      } catch (err) {
        return sendJson(res, 503, { ok: false, error: 'Database temporarily unavailable' });
      }
    }

    if (req.method === 'POST') {
      try {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
        const sig = req.headers['x-cms-bridge-sig'] || '';
        if (!verifyCmsBridgeSignature(rawBody, sig)) {
          return sendJson(res, 401, { ok: false, error: 'Unauthorized CMS bridge request' });
        }

        const body = typeof req.body === 'object' ? req.body : JSON.parse(rawBody || '{}');
        const current = await fetchAppState();
        const prevState = current?.state || {};
        const prevCms = prevState.websiteCms || body.fallbackState || {};

        let updatedCms;
        if (body.action === 'track') {
          const prevStats = prevCms.stats || {
            lineClicks: 142,
            phoneClicks: 68,
            leakSopClicks: 53,
            calcClicks: 89
          };
          const event = String(body.event || '').toLowerCase();
          const nextStats = { ...prevStats };
          if (event === 'line') nextStats.lineClicks = (Number(nextStats.lineClicks) || 0) + 1;
          else if (event === 'phone') nextStats.phoneClicks = (Number(nextStats.phoneClicks) || 0) + 1;
          else if (event === 'leak') nextStats.leakSopClicks = (Number(nextStats.leakSopClicks) || 0) + 1;
          else if (event === 'calc') nextStats.calcClicks = (Number(nextStats.calcClicks) || 0) + 1;
          nextStats.lastUpdated = new Date().toISOString();

          updatedCms = {
            ...prevCms,
            stats: nextStats
          };
        } else if (body.action === 'save' && body.cmsState && typeof body.cmsState === 'object') {
          const prevStats = prevCms.stats || {};
          const incomingStats = body.cmsState.stats || {};
          updatedCms = {
            ...prevCms,
            ...body.cmsState,
            stats: {
              lineClicks: Math.max(Number(prevStats.lineClicks) || 0, Number(incomingStats.lineClicks) || 0),
              phoneClicks: Math.max(Number(prevStats.phoneClicks) || 0, Number(incomingStats.phoneClicks) || 0),
              leakSopClicks: Math.max(Number(prevStats.leakSopClicks) || 0, Number(incomingStats.leakSopClicks) || 0),
              calcClicks: Math.max(Number(prevStats.calcClicks) || 0, Number(incomingStats.calcClicks) || 0),
              lastUpdated: new Date().toISOString()
            },
            lastUpdated: new Date().toISOString(),
            updatedBy: String(body.updatedBy || body.cmsState.updatedBy || '官網管理員').slice(0, 60)
          };
        } else {
          return sendJson(res, 400, { ok: false, error: 'Invalid CMS action' });
        }

        const nextState = {
          ...prevState,
          websiteCms: updatedCms
        };

        await saveAppState({
          state: nextState,
          updatedBy: String(body.updatedBy || 'WEBSITE_CMS').slice(0, 60),
          requestIp: getClientIp(req),
          previousState: prevState
        });

        return sendJson(res, 200, {
          ok: true,
          persisted: true,
          data: updatedCms
        });
      } catch (err) {
        console.error('CMS persistence error:', err);
        return sendJson(res, 500, { ok: false, error: 'Failed to persist CMS state' });
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

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

    const isInternalAdmin = verifyInternalHealthAuth(req);
    const errorPayload = {
      ok: false,
      service: 'gass-erp-api',
      database: 'unreachable',
      timestamp: new Date().toISOString()
    };

    if (isInternalAdmin) {
      errorPayload.errorMessage = String(error?.message || error);
      errorPayload.hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
      errorPayload.hasSyncSecret = Boolean(process.env.ERP_SYNC_SECRET);
      errorPayload.hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    }

    return sendJson(res, 503, errorPayload);
  }
}
