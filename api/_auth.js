import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { prepareStateForPersistence } from '../src/utils/stateIntegrity.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const PASSWORD_ALGO = 'pbkdf2_sha256_120000';
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEYLEN = 32;

const base64url = (input) => Buffer.from(input).toString('base64url');
const cloneJson = (value) => JSON.parse(JSON.stringify(value || {}));
const normalizePassword = (password) => String(password || '').trim();

export const getSyncSecret = () => {
  if (!process.env.ERP_SYNC_SECRET) {
    throw new Error('ERP_SYNC_SECRET is not configured.');
  }
  return process.env.ERP_SYNC_SECRET;
};

export const getSupabase = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

export const signToken = (payload) => {
  const body = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encoded = base64url(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', getSyncSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

export const verifyToken = (token) => {
  try {
    if (!token || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac('sha256', getSyncSecret()).update(encoded).digest('base64url');
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const normalized = normalizePassword(password);
  if (!normalized) return null;
  const hash = crypto.pbkdf2Sync(normalized, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, 'sha256').toString('hex');
  return {
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgo: PASSWORD_ALGO
  };
};

export const verifyPassword = (password, record = {}, fallbackPassword = '') => {
  const normalized = normalizePassword(password);
  if (!normalized) return false;

  if (record.passwordHash && record.passwordSalt) {
    const candidate = hashPassword(normalized, record.passwordSalt);
    const expected = Buffer.from(String(record.passwordHash), 'hex');
    const actual = Buffer.from(candidate.passwordHash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  const legacyPassword = normalizePassword(record.password || fallbackPassword);
  return Boolean(legacyPassword) && legacyPassword === normalized;
};

const stripCredentialFields = (record = {}) => {
  const cleaned = { ...record };
  delete cleaned.password;
  delete cleaned.passwordHash;
  delete cleaned.passwordSalt;
  delete cleaned.passwordAlgo;
  return cleaned;
};

const stripClientSensitiveFields = (record = {}, { includeDeviceManagement = false } = {}) => {
  const cleaned = stripCredentialFields(record);
  delete cleaned.emailVerificationToken;
  delete cleaned.emailVerificationExpiresAt;

  if (!includeDeviceManagement) {
    delete cleaned.approvedDevices;
    delete cleaned.pendingDevices;
  }

  return cleaned;
};

const preserveHiddenSecurityFields = (incoming = {}, previous = {}) => {
  const merged = { ...incoming };
  [
    'approvedDevices',
    'pendingDevices',
    'emailVerificationToken',
    'emailVerificationExpiresAt'
  ].forEach((field) => {
    if (merged[field] === undefined && previous[field] !== undefined) {
      merged[field] = previous[field];
    }
  });
  return merged;
};

const getCredentialFields = (record = {}, fallbackPassword = '') => {
  if (record.passwordHash && record.passwordSalt) {
    return {
      passwordHash: record.passwordHash,
      passwordSalt: record.passwordSalt,
      passwordAlgo: record.passwordAlgo || PASSWORD_ALGO
    };
  }

  const legacyPassword = normalizePassword(record.password || fallbackPassword);
  return legacyPassword ? hashPassword(legacyPassword) : {};
};

export const sanitizeStateForClient = (state = {}, session = null) => {
  const sanitized = cloneJson(state);
  const isAdmin = session?.id === 'ADMIN' || session?.role === 'admin';
  sanitized.adminSecurity = stripClientSensitiveFields(sanitized.adminSecurity || {}, {
    includeDeviceManagement: isAdmin
  });
  sanitized.shareholders = Array.isArray(sanitized.shareholders)
    ? sanitized.shareholders.map(item => stripClientSensitiveFields(item, {
        includeDeviceManagement: isAdmin
      }))
    : [];
  return sanitized;
};

export const secureStateForSave = (incomingState = {}, previousState = {}) => {
  const state = cloneJson(incomingState);
  const previousShareholders = Array.isArray(previousState.shareholders) ? previousState.shareholders : [];

  const previousByKey = new Map();
  previousShareholders.forEach((item) => {
    if (item?.id) previousByKey.set(`id:${item.id}`, item);
    if (item?.email) previousByKey.set(`email:${String(item.email).trim().toLowerCase()}`, item);
  });

  const adminInput = preserveHiddenSecurityFields(state.adminSecurity || {}, previousState.adminSecurity || {});
  const adminPrevious = previousState.adminSecurity || {};
  const adminCredential = normalizePassword(adminInput.password)
    ? hashPassword(adminInput.password)
    : getCredentialFields(adminPrevious);
  state.adminSecurity = {
    ...stripCredentialFields(adminInput),
    ...adminCredential
  };

  state.shareholders = Array.isArray(state.shareholders)
    ? state.shareholders.map((item) => {
        const previous = previousByKey.get(`id:${item.id}`) ||
          previousByKey.get(`email:${String(item.email || '').trim().toLowerCase()}`) ||
          {};
        const mergedItem = preserveHiddenSecurityFields(item, previous);
        const credential = normalizePassword(mergedItem.password)
          ? hashPassword(mergedItem.password)
          : getCredentialFields(previous);
        return {
          ...stripCredentialFields(mergedItem),
          ...credential
        };
      })
    : [];

  return state;
};

export const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export const sendJson = (res, status, body) => {
  res
    .status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('Cache-Control', 'no-store, max-age=0')
    .setHeader('Pragma', 'no-cache')
    .setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};

export const fetchAppState = async () => {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('erp_get_app_state', {
    p_secret: getSyncSecret()
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || { state: null, updated_at: null, updated_by: null };
};

export const saveAppState = async ({ state, updatedBy, requestIp = null, previousState = null, expectedUpdatedAt = null }) => {
  const supabase = getSupabase();
  const previous = previousState || (await fetchAppState()).state || {};
  const securedState = secureStateForSave(prepareStateForPersistence(state), previous);
  const { data, error } = await supabase.rpc('erp_set_app_state', {
    p_secret: getSyncSecret(),
    p_state: securedState,
    p_updated_by: updatedBy,
    p_request_ip: requestIp,
    p_expected_updated_at: expectedUpdatedAt || null
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || { ok: true };
};

export const createCloudBackup = async ({ reason = 'scheduled', actor = 'system', requestIp = null }) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('erp_create_backup', {
    p_secret: getSyncSecret(),
    p_reason: reason,
    p_actor: actor,
    p_request_ip: requestIp
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
};

export const markBackupDriveResult = async ({ backupId, status, fileId = null, errorMessage = null }) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('erp_mark_backup_drive_result', {
    p_secret: getSyncSecret(),
    p_backup_id: backupId,
    p_drive_status: status,
    p_drive_file_id: fileId,
    p_drive_error: errorMessage
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || { ok: true };
};

export const listCloudBackups = async (limit = 20) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('erp_list_backups', {
    p_secret: getSyncSecret(),
    p_limit: limit
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const restoreCloudBackup = async ({ backupId, actor = 'system', requestIp = null }) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('erp_restore_backup', {
    p_secret: getSyncSecret(),
    p_backup_id: backupId,
    p_actor: actor,
    p_request_ip: requestIp
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || { ok: true };
};

export const getClientIp = (req) => {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim();
  const forwarded = req.headers['x-forwarded-for'];
  return Array.isArray(forwarded) ? forwarded[0].trim() : String(forwarded || req.socket?.remoteAddress || '').split(',')[0].trim();
};
