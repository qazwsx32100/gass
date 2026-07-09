import {
  fetchAppState,
  getClientIp,
  sanitizeStateForClient,
  saveAppState,
  sendJson,
  signToken,
  verifyPassword
} from './_auth.js';

const ADMIN_EMAIL = 'qazwsx32100@gmail.com';
const ADMIN_DEFAULT_PASSWORD = 'windsboy123';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const upsertDevice = (devices = [], device = {}, status = 'pending') => {
  const now = new Date().toISOString();
  const list = Array.isArray(devices) ? [...devices] : [];
  const id = device.id || `DEV${Date.now()}`;
  const idx = list.findIndex(item => item.id === id);

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      label: list[idx].label || device.label || id,
      userAgent: list[idx].userAgent || device.userAgent || '',
      lastSeenAt: now
    };
    return list;
  }

  return [
    ...list,
    {
      id,
      label: device.label || id,
      userAgent: device.userAgent || '',
      firstSeenAt: device.firstSeenAt || now,
      lastSeenAt: now,
      status,
      requestedAt: status === 'pending' ? now : null,
      approvedAt: status === 'approved' ? now : null
    }
  ];
};

const isDeviceApproved = (security, device) => (
  Boolean(device?.id) &&
  Array.isArray(security?.approvedDevices) &&
  security.approvedDevices.some(item => item.id === device.id)
);

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

const getAdminDisplayName = (state) => {
  const shareholders = state.shareholders || [];
  const owner = shareholders.find(s => s.id === 'SH001' || normalizeEmail(s.email) === ADMIN_EMAIL);
  return owner?.name || '主管理員';
};

const publicUserFromState = (state, id, fallback) => (
  (state.shareholders || []).find(item => item.id === id) || fallback
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object'
      ? req.body
      : JSON.parse(req.body || '{}');
    const email = normalizeEmail(body.email);
    const password = String(body.password || '').trim();
    const device = body.device || {};

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
      const hasStoredAdminPassword = Boolean(security.password || (security.passwordHash && security.passwordSalt));

      if (!verifyPassword(password, security, ADMIN_DEFAULT_PASSWORD)) {
        state = appendLog(state, email, 'LOGIN_FAILED', '主管理員密碼錯誤');
        await saveAppState({ state, updatedBy: '登入失敗', requestIp: getClientIp(req), previousState });
        return sendJson(res, 401, { success: false, error: '帳號或密碼不正確。' });
      }

      if (!hasStoredAdminPassword) {
        security.password = ADMIN_DEFAULT_PASSWORD;
      }

      if (security.disabled) {
        state = appendLog({ ...state, adminSecurity: security }, displayName, 'LOGIN_BLOCKED', '主管理員帳號已停用');
        await saveAppState({ state, updatedBy: displayName, requestIp: getClientIp(req), previousState });
        return sendJson(res, 403, { success: false, error: '此帳號已停用，請聯絡主管理員。' });
      }

      if ((security.approvedDevices || []).length === 0 && (security.pendingDevices || []).length === 0) {
        security.approvedDevices = upsertDevice(security.approvedDevices, device, 'approved');
      }

      if (!isDeviceApproved(security, device)) {
        security.pendingDevices = upsertDevice(security.pendingDevices, device, 'pending');
        state = appendLog({ ...state, adminSecurity: security }, displayName, 'DEVICE_PENDING', '主管理員使用新裝置登入，等待核准');
        await saveAppState({ state, updatedBy: displayName, requestIp: getClientIp(req), previousState });
        return sendJson(res, 403, { success: false, error: '此裝置尚未核准，請先由主管理員核准裝置。' });
      }

      state = appendLog({ ...state, adminSecurity: security }, displayName, 'LOGIN_SUCCESS', '主管理員登入成功');
      await saveAppState({ state, updatedBy: displayName, requestIp: getClientIp(req), previousState });

      const publicState = sanitizeStateForClient(state);
      const user = {
        id: 'ADMIN',
        name: displayName,
        email: ADMIN_EMAIL,
        role: 'admin',
        shareholderId: 'SH001',
        requiresPasswordChange: security.requiresPasswordChange
      };

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

    const shareholders = Array.isArray(state.shareholders) ? state.shareholders : [];
    const idx = shareholders.findIndex(s => normalizeEmail(s.email) === email && verifyPassword(password, s));

    if (idx === -1) {
      state = appendLog(state, email || '未知帳號', 'LOGIN_FAILED', '帳號或密碼錯誤');
      await saveAppState({ state, updatedBy: '登入失敗', requestIp: getClientIp(req), previousState });
      return sendJson(res, 401, { success: false, error: '帳號或密碼不正確。' });
    }

    const user = {
      ...shareholders[idx],
      role: shareholders[idx].role || 'readonly_shareholder'
    };

    if (user.disabled) {
      state = appendLog(state, user.name || email, 'LOGIN_BLOCKED', '帳號已停用');
      await saveAppState({ state, updatedBy: user.name || email, requestIp: getClientIp(req), previousState });
      return sendJson(res, 403, { success: false, error: '此帳號已停用，請聯絡主管理員。' });
    }

    if (!isDeviceApproved(user, device)) {
      shareholders[idx] = {
        ...shareholders[idx],
        pendingDevices: upsertDevice(shareholders[idx].pendingDevices, device, 'pending')
      };
      state = appendLog({ ...state, shareholders }, user.name || email, 'DEVICE_PENDING', '新裝置登入，等待核准');
      await saveAppState({ state, updatedBy: user.name || email, requestIp: getClientIp(req), previousState });
      return sendJson(res, 403, { success: false, error: '此裝置尚未核准，請先由主管理員核准裝置。' });
    }

    state = appendLog(state, user.name || email, 'LOGIN_SUCCESS', '登入成功');
    await saveAppState({ state, updatedBy: user.name || email, requestIp: getClientIp(req), previousState });

    const publicState = sanitizeStateForClient(state);
    const publicUser = publicUserFromState(publicState, user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requiresPasswordChange: user.requiresPasswordChange
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
    return sendJson(res, 500, { success: false, error: '登入服務暫時無法使用，請稍後再試。' });
  }
}
