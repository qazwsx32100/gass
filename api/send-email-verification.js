import {
  fetchAppState,
  getBearerToken,
  getClientIp,
  sendJson,
  verifyToken
} from './_auth.js';

const EMAIL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const EMAIL_RATE_LIMIT_MAX = 20;
const emailAttempts = new Map();

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

const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  return JSON.parse(req.body || '{}');
};

const rateLimitKey = (req, session) => `${session?.id || 'unknown'}:${getClientIp(req) || 'unknown'}`;

const isRateLimited = (req, session) => {
  const key = rateLimitKey(req, session);
  const now = Date.now();
  const current = emailAttempts.get(key) || { count: 0, resetAt: now + EMAIL_RATE_LIMIT_WINDOW_MS };
  if (current.resetAt <= now) {
    emailAttempts.set(key, { count: 1, resetAt: now + EMAIL_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  emailAttempts.set(key, current);
  return current.count > EMAIL_RATE_LIMIT_MAX;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  const session = verifyToken(getBearerToken(req));
  if (!session) {
    return sendJson(res, 401, { success: false, error: 'Unauthorized' });
  }

  try {
    const current = await fetchAppState();
    if (!isAdminSessionAllowed(current.state, session)) {
      return sendJson(res, 403, { success: false, error: 'Only the main administrator can send verification email.' });
    }

    if (isRateLimited(req, session)) {
      return sendJson(res, 429, { success: false, error: 'Too many email requests. Please try again later.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return sendJson(res, 503, { success: false, error: 'RESEND_API_KEY is not configured.' });
    }

    let payload;
    try {
      payload = parseBody(req);
    } catch {
      return sendJson(res, 400, { success: false, error: 'Invalid email payload.' });
    }

    const to = String(payload?.to || '').trim();
    if (!to) {
      return sendJson(res, 400, { success: false, error: 'Missing recipient email.' });
    }

    // Hardcode subject and content on the server to prevent email relay abuse
    const subject = 'Gass ERP 系統電子信箱驗證信';
    const text = '您好，這是 Gass ERP 系統的驗證信件。請回到系統完成驗證。';
    const html = `
      <div style="font-family: sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #007bff; margin-top: 0;">Gass ERP 電子信箱驗證</h2>
        <p>您好，系統管理員已為您申請或重送驗證郵件。</p>
        <p>請回到系統繼續完成您的操作。</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #888; font-size: 12px; margin-bottom: 0;">此郵件為系統自動發送，請勿直接回覆。</p>
      </div>
    `;

    const from = process.env.RESEND_FROM_EMAIL || 'BusinessPilot ERP <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, text, html })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return sendJson(res, response.status, {
        success: false,
        error: data?.message || data?.error || 'Email sending failed.'
      });
    }

    return sendJson(res, 200, { success: true, id: data?.id || '' });
  } catch (error) {
    console.error('send-email-verification failed', error);
    return sendJson(res, 500, { success: false, error: 'Email sending failed.' });
  }
}
