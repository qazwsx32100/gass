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

const getSessionUser = (state, session) => {
  if (!state || !session?.id) return null;
  if (session.id === 'ADMIN') return { id: 'ADMIN', role: 'admin', name: session.name || 'admin' };
  return (state.shareholders || []).find(item => item.id === session.id) || null;
};

const stableStringify = (value) => JSON.stringify(value ?? null);

const changedTopLevelKeys = (before = {}, after = {}) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => stableStringify(before?.[key]) !== stableStringify(after?.[key]));
};

const allowedWriteKeysByRole = {
  bookkeeper: new Set([
    'incomes',
    'expenses',
    'bankTransactions',
    'bankReconciliations',
    'logs',
    'auditArchive',
    'outboundEmails'
  ]),
  business_reviewer: new Set([
    'incomes',
    'expenses',
    'bankTransactions',
    'bankReconciliations',
    'shareholderLedger',
    'loans',
    'logs',
    'auditArchive',
    'outboundEmails'
  ])
};

const validateStateWriteScope = (previousState, nextState, sessionUser) => {
  if (sessionUser?.role === 'admin') return { ok: true };
  const allowedKeys = allowedWriteKeysByRole[sessionUser?.role];
  if (!allowedKeys) {
    return { ok: false, error: 'This account is read-only and cannot update cloud data.' };
  }

  const blockedKeys = changedTopLevelKeys(previousState, nextState).filter(key => !allowedKeys.has(key));
  if (blockedKeys.length > 0) {
    return {
      ok: false,
      error: `This account cannot update protected data: ${blockedKeys.join(', ')}.`
    };
  }

  // --- Enforce Backend Period Locks for Non-Admins ---
  const locks = Array.isArray(nextState.periodLocks) ? nextState.periodLocks : [];
  const lockedPeriods = new Set(locks.filter(l => l.locked).map(l => l.yearMonth));

  if (lockedPeriods.size > 0) {
    const getPeriod = (dateStr) => String(dateStr || '').slice(0, 7);
    const isPeriodLocked = (dateStr) => lockedPeriods.has(getPeriod(dateStr));

    // Compare incomes
    const prevIncomes = Array.isArray(previousState.incomes) ? previousState.incomes : [];
    const nextIncomes = Array.isArray(nextState.incomes) ? nextState.incomes : [];
    const prevIncomesMap = new Map(prevIncomes.map(i => [i.id, i]));
    const nextIncomesMap = new Map(nextIncomes.map(i => [i.id, i]));

    for (const item of nextIncomes) {
      const prev = prevIncomesMap.get(item.id);
      if (!prev) {
        if (isPeriodLocked(item.date)) {
          return { ok: false, error: `Cannot add transactions to a locked period (${getPeriod(item.date)}).` };
        }
      } else {
        if (JSON.stringify(prev) !== JSON.stringify(item)) {
          if (isPeriodLocked(prev.date) || isPeriodLocked(item.date)) {
            return { ok: false, error: `Cannot modify transactions in a locked period (${getPeriod(prev.date)}).` };
          }
        }
      }
    }

    for (const item of prevIncomes) {
      if (!nextIncomesMap.has(item.id)) {
        if (isPeriodLocked(item.date)) {
          return { ok: false, error: `Cannot delete transactions in a locked period (${getPeriod(item.date)}).` };
        }
      }
    }

    // Compare expenses
    const prevExpenses = Array.isArray(previousState.expenses) ? previousState.expenses : [];
    const nextExpenses = Array.isArray(nextState.expenses) ? nextState.expenses : [];
    const prevExpensesMap = new Map(prevExpenses.map(e => [e.id, e]));
    const nextExpensesMap = new Map(nextExpenses.map(e => [e.id, e]));

    for (const item of nextExpenses) {
      const prev = prevExpensesMap.get(item.id);
      if (!prev) {
        if (isPeriodLocked(item.date)) {
          return { ok: false, error: `Cannot add transactions to a locked period (${getPeriod(item.date)}).` };
        }
      } else {
        if (JSON.stringify(prev) !== JSON.stringify(item)) {
          if (isPeriodLocked(prev.date) || isPeriodLocked(item.date)) {
            return { ok: false, error: `Cannot modify transactions in a locked period (${getPeriod(prev.date)}).` };
          }
        }
      }
    }

    for (const item of prevExpenses) {
      if (!nextExpensesMap.has(item.id)) {
        if (isPeriodLocked(item.date)) {
          return { ok: false, error: `Cannot delete transactions in a locked period (${getPeriod(item.date)}).` };
        }
      }
    }
  }

  return { ok: true };
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

  if (req.method === 'POST') {
    const writeAllowedRoles = ['admin', 'business_reviewer', 'bookkeeper'];
    if (!writeAllowedRoles.includes(session.role)) {
      return sendJson(res, 403, { error: 'Forbidden: Insufficient role permissions to modify database.' });
    }
  }

  try {
    if (req.method === 'GET') {
      const row = await fetchAppState();
      if (!isSessionAllowed(row.state, session)) {
        return sendJson(res, 401, { error: 'Session is no longer allowed.' });
      }
      return sendJson(res, 200, {
        ...(row || { state: null, updated_at: null, updated_by: null }),
        state: sanitizeStateForClient(row.state || {}, session)
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

    const sessionUser = getSessionUser(current.state, session);
    const comparablePreviousState = sanitizeStateForClient(current.state || {}, sessionUser);
    const writeScope = validateStateWriteScope(comparablePreviousState, body.state, sessionUser);
    if (!writeScope.ok) {
      return sendJson(res, 403, { error: writeScope.error });
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
      state: sanitizeStateForClient(updated.state || {}, session)
    });
  } catch (error) {
    console.error('app-state API failed', error);
    return sendJson(res, 500, { error: 'Cloud sync failed.' });
  }
}
