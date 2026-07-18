import { fetchAppState, getBearerToken, getClientIp, sanitizeStateForClient, saveAppState, sendJson, verifyToken } from './_auth.js';
import { validateGasInventoryState } from '../src/utils/stateIntegrity.js';

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

const changedRecordKeys = (before = {}, after = {}) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => stableStringify(before?.[key]) !== stableStringify(after?.[key]));
};

const APPROVED_TRANSACTION_MUTABLE_KEYS = new Set([
  'paymentStatus',
  'remarks',
  'receiptAttachment',
  'paidAt',
  'paidByMethod',
  'paidBankId',
  'settlementId',
  'correctionStatus',
  'correctedBy',
  'correctedByName',
  'correctedAt',
  'correctionReason'
]);

const APPROVED_TRANSACTION_VOID_KEYS = new Set([
  ...APPROVED_TRANSACTION_MUTABLE_KEYS,
  'status',
  'voidedBy',
  'voidedByName',
  'voidedAt',
  'voidReason'
]);

const isApprovedTransactionChangeAllowed = (before, after) => {
  if (before?.status !== 'approved') return true;
  if (!after) return false;

  const changedKeys = changedRecordKeys(before, after);
  if (changedKeys.length === 0) return true;

  if (after.status === 'void') {
    return changedKeys.every(key => APPROVED_TRANSACTION_VOID_KEYS.has(key));
  }

  if (after.status !== 'approved') return false;
  return changedKeys.every(key => APPROVED_TRANSACTION_MUTABLE_KEYS.has(key));
};

const validateApprovedTransactionIntegrity = (previousState = {}, nextState = {}) => {
  const collections = [
    { key: 'incomes', label: 'income' },
    { key: 'expenses', label: 'expense' }
  ];

  for (const collection of collections) {
    const previousRows = Array.isArray(previousState[collection.key]) ? previousState[collection.key] : [];
    const nextRows = Array.isArray(nextState[collection.key]) ? nextState[collection.key] : [];
    const nextMap = new Map(nextRows.map(item => [item.id, item]));

    for (const previousRow of previousRows) {
      if (previousRow?.status !== 'approved') continue;
      const nextRow = nextMap.get(previousRow.id);
      if (!nextRow) {
        return {
          ok: false,
          error: `Approved ${collection.label} ${previousRow.id} cannot be deleted. Use correction or void workflow.`
        };
      }
      if (!isApprovedTransactionChangeAllowed(previousRow, nextRow)) {
        return {
          ok: false,
          error: `Approved ${collection.label} ${previousRow.id} cannot be materially changed. Use correction workflow.`
        };
      }
    }
  }

  return { ok: true };
};

const validateSettlementIntegrity = (previousState = {}, nextState = {}) => {
  const settlements = new Map(
    (Array.isArray(nextState.bankTransactions) ? nextState.bankTransactions : [])
      .filter(item => item?.sourceType === 'settlement')
      .map(item => [item.id, item])
  );

  for (const [key, transactionType] of [['incomes', 'income'], ['expenses', 'expense']]) {
    const previousRows = new Map((Array.isArray(previousState[key]) ? previousState[key] : []).map(item => [item.id, item]));
    for (const nextRow of (Array.isArray(nextState[key]) ? nextState[key] : [])) {
      const previousRow = previousRows.get(nextRow.id);
      if (!previousRow || previousRow.paymentStatus === 'paid' || nextRow.paymentStatus !== 'paid') continue;
      const settlement = settlements.get(nextRow.settlementId);
      if (!settlement || settlement.sourceId !== nextRow.id || settlement.transactionType !== transactionType) {
        return { ok: false, error: `Settlement record is required for ${transactionType} ${nextRow.id}.` };
      }
      if (Math.abs(Number(settlement.amount || 0) - Number(nextRow.amount || 0)) >= 0.01) {
        return { ok: false, error: `Settlement amount does not match ${transactionType} ${nextRow.id}.` };
      }
    }
  }

  return { ok: true };
};

const MAX_STATE_BYTES = 8 * 1024 * 1024;

const allowedWriteKeysByRole = {
  bookkeeper: new Set([
    'incomes',
    'expenses',
    'bankTransactions',
    'bankReconciliations',
    'gasInventoryPeriods',
    'gasPurchases',
    'gasCylinders',
    'gasCylinderMovements',
    'gasDeliveryVehicles',
    'gasVehicleInventory',
    'customerCylinderDeposits',
    'logs',
    'auditArchive',
    'outboundEmails'
  ]),
  business_reviewer: new Set([
    'incomes',
    'expenses',
    'bankTransactions',
    'bankReconciliations',
    'gasInventoryPeriods',
    'gasPurchases',
    'gasCylinders',
    'gasCylinderMovements',
    'gasDeliveryVehicles',
    'gasVehicleInventory',
    'customerCylinderDeposits',
    'shareholderLedger',
    'loans',
    'logs',
    'auditArchive',
    'outboundEmails'
  ])
};

const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX = 30;
const writeAttempts = new Map();

const rateLimitKey = (req, session) => `${session?.id || 'unknown'}:${getClientIp(req) || 'unknown'}`;

const isWriteRateLimited = (req, session) => {
  const key = rateLimitKey(req, session);
  const now = Date.now();
  const current = writeAttempts.get(key) || { count: 0, resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS };
  if (current.resetAt <= now) {
    writeAttempts.set(key, { count: 1, resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  writeAttempts.set(key, current);
  return current.count > WRITE_RATE_LIMIT_MAX;
};

export const validateStateWriteScope = (previousState, nextState, sessionUser) => {
  const approvedIntegrity = validateApprovedTransactionIntegrity(previousState, nextState);
  if (!approvedIntegrity.ok) return approvedIntegrity;

  const settlementIntegrity = validateSettlementIntegrity(previousState, nextState);
  if (!settlementIntegrity.ok) return settlementIntegrity;

  const gasIntegrity = validateGasInventoryState(previousState, nextState);
  if (!gasIntegrity.ok) return gasIntegrity;

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
    if (isWriteRateLimited(req, session)) {
      return sendJson(res, 429, { error: 'Too many write requests. Please try again later.' });
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

    if (Buffer.byteLength(JSON.stringify(body.state), 'utf8') > MAX_STATE_BYTES) {
      return sendJson(res, 413, { error: 'Cloud state is too large. Upload attachments to private storage instead.' });
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
      previousState: current.state,
      expectedUpdatedAt: body.expectedUpdatedAt || null
    });
    const updated = await fetchAppState();
    return sendJson(res, 200, {
      ...(updated || { state: null, updated_at: null, updated_by: updatedBy }),
      ok: true,
      state: sanitizeStateForClient(updated.state || {}, session)
    });
  } catch (error) {
    console.error('app-state API failed', error);
    if (error?.code === '40001' || /state conflict/i.test(error?.message || '')) {
      return sendJson(res, 409, { error: 'Cloud data changed before this save. Refresh before trying again.' });
    }
    return sendJson(res, 500, { error: 'Cloud sync failed.' });
  }
}
