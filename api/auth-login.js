import { waitUntil } from '@vercel/functions';
import { captureServerException } from './_monitoring.js';
import {
  fetchAppState,
  getClientIp,
  hashPassword,
  sanitizeStateForClient,
  saveAppState,
  sendJson,
  signToken,
  verifyPassword
} from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';

const ADMIN_EMAIL = 'qazwsx32100@gmail.com';
const getAdminDefaultPassword = () => process.env.ADMIN_DEFAULT_PASSWORD || '';
const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_PER_IDENTITY = 12;
const LOGIN_RATE_LIMIT_MAX_PER_IP = 60;
const MAX_LOGIN_BODY_BYTES = 32 * 1024;
const loginRateLimiter = createBoundedRateLimiter({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  maxEntries: 5000
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const rateLimitKeys = (req, email) => {
  const ip = getClientIp(req) || 'unknown';
  return {
    identity: `identity:${ip}:${email || 'unknown'}`,
    ip: `ip:${ip}`
  };
};

const isLoginRateLimited = (req, email) => {
  const keys = rateLimitKeys(req, email);
  return loginRateLimiter.check([
    { key: keys.identity, max: LOGIN_RATE_LIMIT_MAX_PER_IDENTITY },
    { key: keys.ip, max: LOGIN_RATE_LIMIT_MAX_PER_IP }
  ]);
};

const clearLoginRateLimit = (req, email) => {
  loginRateLimiter.clear([rateLimitKeys(req, email).identity]);
};

const createLog = (operator, action, details) => ({
  id: `LOG${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }),
  operator,
  action,
  details
});

const appendLog = (state, operator, action, details) => ({
  ...state,
  logs: [createLog(operator, action, details), ...(state.logs || [])].slice(0, 1000)
});

const persistSuccessfulLogin = ({ state, updatedBy, requestIp, previousState }) => {
  const task = saveAppState({ state, updatedBy, requestIp, previousState }).catch(async (error) => {
    console.error('login audit persistence failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/auth-login', operation: 'login-audit', status: 500 }
    });
  });

  try {
    waitUntil(task);
  } catch {
    void task;
  }
};

const getAdminDisplayName = (state) => {
  const shareholders = state.shareholders || [];
  const owner = shareholders.find(s => s.id === 'SH001' || normalizeEmail(s.email) === ADMIN_EMAIL);
  return owner?.name || '主管理員';
};

const publicUserFromState = (state, id, fallback) => (
  (state.shareholders || []).find(item => item.id === id) || fallback
);

const BANNED_WEAK_PASSWORDS = new Set([
  '1234',
  '6789',
  '0000',
  '1111',
  '8888',
  '123456',
  'password',
  'admin'
]);

export const isWeakBannedPassword = (password = '') =>
  BANNED_WEAK_PASSWORDS.has(String(password || '').trim().toLowerCase());

export const FALLBACK_SHAREHOLDERS = [
  {
    id: 'SH002',
    name: '周子傑',
    email: 'zijie@shenglonggas.com',
    role: 'business_reviewer',
    requiresPasswordChange: false,
    passwordHash: '5184eede40351670a55e1cd16eb5e4d0313f7d8bee5b0334c373a71511ba7a38',
    passwordSalt: 'c73846f41240c67b94054ec6cabe8a14',
    passwordAlgo: 'pbkdf2_sha256_120000',
    allowedTabs: ['dashboard', 'reports', 'inputs', 'cylinders', 'settings', 'shareholderZone', 'auditZone'],
    allowedCompanies: ['COMP001']
  },
  {
    id: 'SH003',
    name: '林曄鏵',
    email: 'yehua@shenglonggas.com',
    role: 'business_reviewer',
    requiresPasswordChange: false,
    passwordHash: '6fa80adaf72b70e1f4decffb1c7ff85ce494498ff144492269748a8ac7d5c222',
    passwordSalt: 'c4e37fe6bb5627d91c3036521e4c1281',
    passwordAlgo: 'pbkdf2_sha256_120000',
    allowedTabs: ['dashboard', 'reports', 'inputs', 'cylinders', 'settings', 'shareholderZone', 'auditZone'],
    allowedCompanies: ['COMP001']
  }
];

const hasCredential = (record = {}) => Boolean(
  (record.password && !isWeakBannedPassword(record.password)) ||
  (record.passwordHash && record.passwordSalt)
);

export const authenticateShareholder = (state = {}, emailInput = '', passwordInput = '') => {
  const email = normalizeEmail(emailInput);
  const password = String(passwordInput || '').trim();
  const shareholders = Array.isArray(state.shareholders) ? [...state.shareholders] : [];

  if (!email || !password || isWeakBannedPassword(password)) {
    return { matched: false, idx: -1, user: null, shareholders };
  }

  let idx = shareholders.findIndex((s) => {
    const isTarget =
      normalizeEmail(s.email) === email ||
      String(s.name || '').trim().toLowerCase() === email;
    if (!isTarget) return false;

    if (hasCredential(s) && verifyPassword(password, s)) {
      return true;
    }

    // 若資料庫舊紀錄尚未初始化有效憑證（或僅存舊版預設簡易碼），僅允許匹配預設 PBKDF2 強雜湊憑證
    if (!hasCredential(s)) {
      const fb = FALLBACK_SHAREHOLDERS.find(
        (f) => f.id === s.id || normalizeEmail(f.email) === email || f.name.toLowerCase() === email
      );
      if (fb && verifyPassword(password, fb)) {
        return true;
      }
    }
    return false;
  });

  if (idx !== -1 && !hasCredential(shareholders[idx])) {
    const fb = FALLBACK_SHAREHOLDERS.find(
      (f) => f.id === shareholders[idx].id || normalizeEmail(f.email) === email || f.name.toLowerCase() === email
    );
    if (fb) {
      const upgraded = {
        ...shareholders[idx],
        passwordHash: fb.passwordHash,
        passwordSalt: fb.passwordSalt,
        passwordAlgo: fb.passwordAlgo
      };
      delete upgraded.password;
      shareholders[idx] = upgraded;
    }
  }

  if (idx === -1) {
    const fb = FALLBACK_SHAREHOLDERS.find(
      (f) =>
        (normalizeEmail(f.email) === email || f.name.toLowerCase() === email) &&
        verifyPassword(password, f)
    );
    if (fb) {
      idx = shareholders.length;
      shareholders.push({ ...fb });
    }
  }

  if (idx === -1) {
    return { matched: false, idx: -1, user: null, shareholders };
  }

  const user = {
    ...shareholders[idx],
    role: shareholders[idx].role || 'readonly_shareholder'
  };

  return { matched: true, idx, user, shareholders };
};

export const resolveAdminCredential = (state = {}, security = {}, defaultPassword = '') => {
  if (hasCredential(security)) {
    return { record: security, fallbackPassword: '', source: 'adminSecurity' };
  }

  const owner = (state.shareholders || []).find(
    item => item.id === 'SH001' || normalizeEmail(item.email) === ADMIN_EMAIL
  );
  if (hasCredential(owner)) {
    return { record: owner, fallbackPassword: '', source: 'ownerAccount' };
  }

  if (defaultPassword && !isWeakBannedPassword(defaultPassword)) {
    return { record: security, fallbackPassword: defaultPassword, source: 'environment' };
  }

  return { record: security, fallbackPassword: '', source: 'missing' };
};

// Emergency recovery only. A successful login using ADMIN_DEFAULT_PASSWORD
// replaces the stale stored credential; remove the variable after recovery.
export const resolveAdminLoginCredential = (
  state = {},
  security = {},
  attemptedPassword = '',
  defaultPassword = ''
) => {
  const stored = resolveAdminCredential(state, security, '');
  if (isWeakBannedPassword(attemptedPassword)) {
    return stored;
  }

  if (
    stored.source !== 'missing' &&
    verifyPassword(attemptedPassword, stored.record, stored.fallbackPassword)
  ) {
    return stored;
  }

  if (
    defaultPassword &&
    !isWeakBannedPassword(defaultPassword) &&
    verifyPassword(attemptedPassword, {}, defaultPassword)
  ) {
    return { record: {}, fallbackPassword: defaultPassword, source: 'environmentRecovery' };
  }

  return stored;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}');
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_LOGIN_BODY_BYTES) {
      return sendJson(res, 413, { success: false, error: '登入資料過大。' });
    }
    const email = normalizeEmail(body.email);
    const password = String(body.password || '').trim();
    const device = body.device || {};

    if (!email || email.length > 254 || !password || password.length > 256) {
      return sendJson(res, 400, { success: false, error: '登入資料格式不正確。' });
    }
    if (String(device.id || '').length > 200) {
      return sendJson(res, 400, { success: false, error: '登入裝置識別資料不正確。' });
    }

    if (isLoginRateLimited(req, email)) {
      res.setHeader('Retry-After', '300');
      return sendJson(res, 429, { success: false, error: '登入嘗試過多，請稍後再試。' });
    }

    if (isWeakBannedPassword(password)) {
      console.warn('blocked weak password login attempt', { email: email || 'unknown', ip: getClientIp(req) });
      return sendJson(res, 401, { success: false, error: '帳號或密碼錯誤。' });
    }

    const row = await fetchAppState();
    const previousState = row.state || {};
    let state = { ...previousState };

    if (email === ADMIN_EMAIL) {
      const security = {
        emailVerified: true,
        requiresPasswordChange: false,
        disabled: false,
        approvedDevices: [],
        pendingDevices: [],
        ...(state.adminSecurity || {})
      };
      const displayName = getAdminDisplayName(state);
      const defaultPassword = getAdminDefaultPassword();
      const hasStoredAdminPassword = Boolean(security.password || (security.passwordHash && security.passwordSalt));
      const adminCredential = resolveAdminLoginCredential(
        state,
        security,
        password,
        defaultPassword
      );

      if (adminCredential.source === 'missing') {
        console.warn('Admin password not initialized in admin security, owner account, or environment.');
        return sendJson(res, 500, { success: false, error: '系統管理員密碼尚未初始化，請聯絡系統管理員設定環境變數。' });
      }

      if (!verifyPassword(password, adminCredential.record, adminCredential.fallbackPassword)) {
        console.warn('admin login failed', { email, ip: getClientIp(req) });
        return sendJson(res, 401, { success: false, error: '帳號或密碼錯誤。' });
      }

      if (adminCredential.source === 'environmentRecovery') {
        Object.assign(security, hashPassword(password));
        delete security.password;
      } else if (!hasStoredAdminPassword) {
        if (adminCredential.record.passwordHash && adminCredential.record.passwordSalt) {
          security.passwordHash = adminCredential.record.passwordHash;
          security.passwordSalt = adminCredential.record.passwordSalt;
          security.passwordAlgo = adminCredential.record.passwordAlgo;
        } else {
          security.password = adminCredential.record.password || adminCredential.fallbackPassword;
        }
      }

      if (security.disabled) {
        state = appendLog({ ...state, adminSecurity: security }, displayName, 'LOGIN_BLOCKED', '主管理員帳號已停用');
        await saveAppState({ state, updatedBy: displayName, requestIp: getClientIp(req), previousState });
        return sendJson(res, 403, { success: false, error: '此帳號已停用，請聯絡主管理員。' });
      }

      state = appendLog({ ...state, adminSecurity: security }, displayName, 'LOGIN_SUCCESS', '主管理員登入成功');
      persistSuccessfulLogin({
        state,
        updatedBy: displayName,
        requestIp: getClientIp(req),
        previousState
      });
      clearLoginRateLimit(req, email);

      const user = {
        id: 'ADMIN',
        name: displayName,
        email: ADMIN_EMAIL,
        role: 'admin',
        shareholderId: 'SH001',
        requiresPasswordChange: false
      };
      const publicState = sanitizeStateForClient(state, user);

      return sendJson(res, 200, {
        success: true,
        role: 'admin',
        user,
        token: signToken({ id: user.id, role: user.role, email: user.email, name: user.name, deviceId: device.id }),
        state: publicState,
        updated_at: new Date().toISOString(),
        updated_by: displayName
      });
    }

    const authResult = authenticateShareholder(state, email, password);
    if (!authResult.matched) {
      console.warn('user login failed', { email: email || 'unknown', ip: getClientIp(req) });
      return sendJson(res, 401, { success: false, error: '帳號或密碼錯誤。' });
    }

    const { user, shareholders } = authResult;

    if (user.disabled) {
      state = appendLog(state, user.name || email, 'LOGIN_BLOCKED', '帳號已停用');
      await saveAppState({ state, updatedBy: user.name || email, requestIp: getClientIp(req), previousState });
      return sendJson(res, 403, { success: false, error: '此帳號已停用，請聯絡主管理員。' });
    }

    state = appendLog({ ...state, shareholders }, user.name || email, 'LOGIN_SUCCESS', '登入成功');
    persistSuccessfulLogin({
      state,
      updatedBy: user.name || email,
      requestIp: getClientIp(req),
      previousState
    });
    clearLoginRateLimit(req, email);

    const publicState = sanitizeStateForClient(state, user);
    const publicUser = publicUserFromState(publicState, user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requiresPasswordChange: Boolean(user.requiresPasswordChange === true)
    });

    return sendJson(res, 200, {
      success: true,
      role: user.role,
      user: publicUser,
      token: signToken({ id: user.id, role: user.role, email: user.email, name: user.name, deviceId: device.id }),
      state: publicState,
      updated_at: new Date().toISOString(),
      updated_by: user.name || email
    });
  } catch (error) {
    console.error('auth-login failed', error);
    await captureServerException(error, {
      tags: { endpoint: '/api/auth-login', method: req.method, status: 500 }
    });
    return sendJson(res, 500, { success: false, error: '登入服務暫時無法使用，請稍後再試。' });
  }
}
