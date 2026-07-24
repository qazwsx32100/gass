import {
  fetchAppState,
  getBearerToken,
  getClientIp,
  sanitizeStateForClient,
  sendJson,
  verifyToken
} from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import {
  downloadPrivateFileFromGoogleDrive,
  uploadPrivateFileToGoogleDrive
} from './_google-drive.js';

// Base64 adds roughly 33%, so 3 MB stays below Vercel's 4.5 MB body limit.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const WRITE_ROLES = new Set(['admin', 'business_reviewer', 'bookkeeper']);

const ATTACHMENT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ATTACHMENT_RATE_LIMIT_MAX = 20;
const attachmentRateLimiter = createBoundedRateLimiter({
  windowMs: ATTACHMENT_RATE_LIMIT_WINDOW_MS,
  maxEntries: 5000
});

const rateLimitKey = (req, session) => `${session?.id || 'unknown'}:${getClientIp(req) || 'unknown'}`;

const isAttachmentRateLimited = (req, session) => {
  const key = rateLimitKey(req, session);
  return attachmentRateLimiter.check([{ key, max: ATTACHMENT_RATE_LIMIT_MAX }]);
};

const isApprovedDevice = (security, deviceId) => (
  Boolean(deviceId) &&
  Array.isArray(security?.approvedDevices) &&
  security.approvedDevices.some(device => device.id === deviceId)
);

const getSessionUser = (state, session) => {
  if (session?.id === 'ADMIN') {
    const security = state.adminSecurity || {};
    return !security.disabled && isApprovedDevice(security, session.deviceId)
      ? { id: 'ADMIN', role: 'admin', name: session.name || '主管理員' }
      : null;
  }
  const user = (state.shareholders || []).find(item => item.id === session?.id);
  if (!user || user.disabled || !isApprovedDevice(user, session.deviceId)) return null;
  return user;
};

const attachmentIsReferenced = (state, fileId) => (
  [...(state.incomes || []), ...(state.expenses || [])]
    .some(item => item?.receiptAttachment?.id === fileId)
);

const parseBody = (req) => (
  req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
);

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const session = verifyToken(getBearerToken(req));
  if (!session) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  try {
    const current = await fetchAppState();
    const sessionUser = getSessionUser(current.state || {}, session);
    if (!sessionUser) return sendJson(res, 401, { ok: false, error: 'Session is no longer allowed.' });

    if (req.method === 'GET') {
      const fileId = String(req.query?.id || '').trim();
      if (!fileId || !attachmentIsReferenced(current.state || {}, fileId)) {
        return sendJson(res, 404, { ok: false, error: 'Attachment was not found.' });
      }
      const file = await downloadPrivateFileFromGoogleDrive(fileId);
      res.status(200);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.end(file.buffer);
    }

    if (!WRITE_ROLES.has(sessionUser.role)) {
      return sendJson(res, 403, { ok: false, error: 'This account cannot upload attachments.' });
    }
    if (isAttachmentRateLimited(req, session)) {
      res.setHeader('Retry-After', '600');
      return sendJson(res, 429, { ok: false, error: 'Too many attachment upload requests. Please try again later.' });
    }
    const body = parseBody(req);
    const match = String(body.dataUrl || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !ALLOWED_MIME_TYPES.has(match[1])) {
      return sendJson(res, 400, { ok: false, error: 'Only JPEG, PNG, WebP, or PDF attachments are allowed.' });
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) {
      return sendJson(res, 413, { ok: false, error: 'Attachment must be 3MB or smaller.' });
    }

    const extension = match[1] === 'application/pdf'
      ? 'pdf'
      : match[1].split('/')[1].replace('jpeg', 'jpg');
    const uploaded = await uploadPrivateFileToGoogleDrive({
      filename: `ERP_Attachment_${Date.now()}_${String(body.filename || 'receipt').replace(/\.[^.]+$/, '')}.${extension}`,
      mimeType: match[1],
      buffer,
      description: `ERP receipt uploaded by ${sessionUser.name || sessionUser.id}`
    });

    return sendJson(res, 200, {
      ok: true,
      attachment: {
        provider: 'google_drive_private',
        id: uploaded.id,
        name: uploaded.name,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: sessionUser.id
      },
      state: sanitizeStateForClient(current.state || {}, session)
    });
  } catch (error) {
    console.error('attachments API failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/attachments', method: req.method, status: 500 }
    });
    return sendJson(res, 500, { ok: false, error: 'Attachment storage failed.' });
  }
}
