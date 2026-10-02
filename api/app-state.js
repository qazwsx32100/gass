import { captureServerException } from './_monitoring.js';
import { fetchAppState, fetchAppStateMeta, getBearerToken, getClientIp, isAccountSessionAllowed, sanitizeStateForClient, saveAppState, sendJson, verifyToken } from './_auth.js';
import { createBoundedRateLimiter } from './_rateLimit.js';
import { sanitizeInactiveCompanies } from '../src/utils/companyState.js';
import { validateGasInventoryState } from '../src/utils/stateIntegrity.js';
import { validateStateTransactionAmounts } from '../src/utils/transactionAmount.js';

const getSessionUser = (state, session) => {
  if (!state || !session?.id) return null;
  if (session.id === 'ADMIN') {
    return {
      id: 'ADMIN',
      role: 'admin',
      name: session.name || 'admin',
      email: session.email || '',
      requiresPasswordChange: Boolean(state.adminSecurity?.requiresPasswordChange)
    };
  }
  return (state.shareholders || []).find(item => item.id === session.id) || null;
};

export const getPublicSessionForClient = (state, session) => {
  const user = getSessionUser(state, session);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || session.name || '',
    email: user.email || session.email || '',
    role: session.id === 'ADMIN' ? 'admin' : (user.role || 'readonly_shareholder'),
    requiresPasswordChange: Boolean(user.requiresPasswordChange)
  };
};

const canonicalJson = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(canonicalJson);
  const sorted = {};
  Object.keys(val).sort().forEach(k => {
    sorted[k] = canonicalJson(val[k]);
  });
  return sorted;
};

const stableStringify = (value) => JSON.stringify(canonicalJson(value));

const isEffectivelyEmpty = (val) => {
  if (val === null || val === undefined) return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && Object.keys(val).length === 0) return true;
  return false;
};

const changedTopLevelKeys = (before = {}, after = {}) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => {
    const valBefore = before?.[key];
    const valAfter = after?.[key];
    if (isEffectivelyEmpty(valBefore) && isEffectivelyEmpty(valAfter)) return false;
    return stableStringify(valBefore) !== stableStringify(valAfter);
  });
};

// CORE IMMUTABLE TRANSACTION FIELDS:
// An approved transaction's financial integrity is defined by its core financial facts:
// amount, date, companyId, and original paymentMethod.
// Non-admins can NEVER directly tamper with these fields on an approved record.
// All schema normalization, UI metadata, tax calculations, audit tags, and settlement tracking
// are safe and will never be falsely rejected as "material edits".
const CORE_IMMUTABLE_TRANSACTION_FIELDS = [
  { field: 'amount', isChanged: (b, a) => Math.abs(Number(b.amount ?? 0) - Number(a.amount ?? 0)) > 0.001 },
  { field: 'date', isChanged: (b, a) => String(b.date || '').slice(0, 10) !== String(a.date || '').slice(0, 10) },
  { field: 'companyId', isChanged: (b, a) => String(b.companyId || '').trim() !== String(a.companyId || '').trim() },
  { field: 'paymentMethod', isChanged: (b, a) => String(b.paymentMethod || '').trim() !== String(a.paymentMethod || '').trim() }
];

const ALLOWED_APPROVED_TRANSITION_STATUSES = new Set([
  'approved',
  'void',
  'pending_edit_review',
  'pending_delete_review'
]);

const isApprovedTransactionChangeAllowed = (before, after) => {
  if (before?.status !== 'approved') return true;
  if (!after) return false;

  // Status transitions must follow defined workflows
  if (!ALLOWED_APPROVED_TRANSITION_STATUSES.has(after.status)) {
    return false;
  }

  // Core immutable financial facts (amount, date, companyId, paymentMethod)
  // cannot be changed directly on an approved transaction.
  // Any material change must go through the correction / void workflow.
  for (const { isChanged } of CORE_IMMUTABLE_TRANSACTION_FIELDS) {
    if (isChanged(before, after)) {
      return false;
    }
  }

  return true;
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
      if (previousRow.remarks && previousRow.remarks.startsWith('當日營業彙總 - ')) continue;
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

// Leave headroom below Vercel's 4.5 MB request/response payload ceiling.
const MAX_STATE_BYTES = 4 * 1024 * 1024;

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
    'journalEntries',
    'journalLines',
    'dailyBackups',
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
    'journalEntries',
    'journalLines',
    'shareholderLedger',
    'loans',
    'dailyBackups',
    'logs',
    'auditArchive',
    'outboundEmails'
  ])
};

const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX = 30;
const writeRateLimiter = createBoundedRateLimiter({
  windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
  maxEntries: 5000
});

const rateLimitKey = (req, session) => `${session?.id || 'unknown'}:${getClientIp(req) || 'unknown'}`;

const isWriteRateLimited = (req, session) => {
  const key = rateLimitKey(req, session);
  return writeRateLimiter.check([{ key, max: WRITE_RATE_LIMIT_MAX }]);
};

export const validateStateWriteScope = (previousState, nextState, sessionUser) => {
  const amounts = validateStateTransactionAmounts(nextState);
  if (!amounts.ok) return amounts;

  if (sessionUser?.role === 'admin') return { ok: true };

  const approvedIntegrity = validateApprovedTransactionIntegrity(previousState, nextState);
  if (!approvedIntegrity.ok) return approvedIntegrity;

  const settlementIntegrity = validateSettlementIntegrity(previousState, nextState);
  if (!settlementIntegrity.ok) return settlementIntegrity;

  const gasIntegrity = validateGasInventoryState(previousState, nextState);
  if (!gasIntegrity.ok) return gasIntegrity;

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

    const hasMaterialChangesInLockedPeriod = (prev, item) => {
      if (!prev || !item) return true;
      if (Math.abs(Number(prev.amount ?? 0) - Number(item.amount ?? 0)) > 0.001) return true;
      if (String(prev.date || '').slice(0, 10) !== String(item.date || '').slice(0, 10)) return true;
      if (String(prev.accountCode || '').trim() !== String(item.accountCode || '').trim()) return true;
      if (String(prev.companyId || '').trim() !== String(item.companyId || '').trim()) return true;
      if (String(prev.paymentMethod || '').trim() !== String(item.paymentMethod || '').trim()) return true;
      if (String(prev.status || '').trim() !== String(item.status || '').trim()) return true;
      return false;
    };

    for (const item of nextIncomes) {
      const prev = prevIncomesMap.get(item.id);
      if (!prev) {
        if (isPeriodLocked(item.date)) {
          return { ok: false, error: `Cannot add transactions to a locked period (${getPeriod(item.date)}).` };
        }
      } else {
        if (hasMaterialChangesInLockedPeriod(prev, item)) {
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
        if (hasMaterialChangesInLockedPeriod(prev, item)) {
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
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { error: 'Too many write requests. Please try again later.' });
    }
  }

  try {
    if (req.method === 'GET') {
      if (String(req.query?.meta || '') === '1') {
        const meta = await fetchAppStateMeta({ userId: session.id, deviceId: session.deviceId });
        if (!meta.session_allowed) {
          const row = await fetchAppState();
          if (!isAccountSessionAllowed(row?.state || {}, session)) {
            return sendJson(res, 401, { error: 'Session is no longer allowed.' });
          }
          meta.session_allowed = true;
        }
        return sendJson(res, 200, meta);
      }

      const row = await fetchAppState();
      const activeState = sanitizeInactiveCompanies(row.state || {});
      if (!isAccountSessionAllowed(activeState, session)) {
        return sendJson(res, 401, { error: 'Session is no longer allowed.' });
      }
      const publicSession = getPublicSessionForClient(activeState, session);
      return sendJson(res, 200, {
        ...(row || { state: null, updated_at: null, updated_by: null }),
        state: sanitizeStateForClient(activeState, publicSession),
        session: publicSession
      });
    }

    const current = await fetchAppState();
    if (!isAccountSessionAllowed(current.state, session)) {
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

    const nextState = sanitizeInactiveCompanies(body.state, current.state);
    const sessionUser = getSessionUser(current.state, session);
    const comparablePreviousState = sanitizeStateForClient(current.state || {}, sessionUser);
    const writeScope = validateStateWriteScope(comparablePreviousState, nextState, sessionUser);
    if (!writeScope.ok) {
      return sendJson(res, 403, { error: writeScope.error });
    }

    const updatedBy = String(body.updatedBy || session.name || '系統').slice(0, 80);
    const saved = await saveAppState({
      state: nextState,
      updatedBy,
      requestIp: getClientIp(req),
      previousState: current.state,
      expectedUpdatedAt: body.expectedUpdatedAt || null
    });
    return sendJson(res, 200, {
      ok: true,
      updated_at: saved?.updated_at || new Date().toISOString(),
      updated_by: saved?.updated_by || updatedBy
    });
  } catch (error) {
    console.error('app-state API failed', error);
    if (error?.code === '40001' || error?.code === 'P0001' || /state conflict/i.test(error?.message || error?.details || '')) {
      return sendJson(res, 409, { error: 'Cloud data changed before this save. Refresh before trying again.' });
    }
    await captureServerException(error, {
      tags: { endpoint: '/api/app-state', method: req.method, status: 500 }
    });
    return sendJson(res, 500, { error: 'Cloud sync failed.' });
  }
}
