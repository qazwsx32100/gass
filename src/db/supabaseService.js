const LOCAL_UPDATED_AT_KEY = 'bp_supabase_updated_at';
const CLOUD_SESSION_TOKEN_KEY = 'bp_cloud_session_token';

const DATA_KEYS = {
  companies: 'bp_companies',
  shareholders: 'bp_shareholders',
  banks: 'bp_banks',
  chartOfAccounts: 'bp_chart_of_accounts',
  shareholderLedger: 'bp_shareholder_ledger',
  incomes: 'bp_incomes',
  expenses: 'bp_expenses',
  loans: 'bp_loans',
  bankTransactions: 'bp_bank_transactions',
  bankReconciliations: 'bp_bank_reconciliations',
  fixedAssets: 'bp_fixed_assets',
  gasInventoryPeriods: 'bp_gas_inventory_periods',
  logs: 'bp_logs',
  auditArchive: 'bp_audit_archive',
  resetSnapshots: 'bp_reset_snapshots',
  dailyBackups: 'bp_daily_backups',
  outboundEmails: 'bp_outbound_emails',
  periodLocks: 'bp_period_locks',
  customers: 'bp_customers',
  suppliers: 'bp_suppliers',
  goLiveChecks: 'bp_go_live_checks',
  backupRestoreDrills: 'bp_backup_restore_drills',
  productionInitialization: 'bp_production_initialization',
  gasInventoryModulePlan: 'bp_gas_inventory_module_plan',
  adminSecurity: 'bp_admin_security'
};

let pollTimer = null;
let isSyncing = false;

export const getSupabaseConfig = () => ({ viaApi: true });
export const isSupabaseConnected = () => true;

export const getCloudSessionToken = () => localStorage.getItem(CLOUD_SESSION_TOKEN_KEY) || '';
export const setCloudSessionToken = (token) => {
  if (token) localStorage.setItem(CLOUD_SESSION_TOKEN_KEY, token);
};
export const clearCloudSessionToken = () => {
  localStorage.removeItem(CLOUD_SESSION_TOKEN_KEY);
};

const authHeaders = () => {
  const token = getCloudSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const readLocalJson = (key) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};

const readLocalState = () => {
  const state = {};
  Object.entries(DATA_KEYS).forEach(([stateKey, storageKey]) => {
    state[stateKey] = readLocalJson(storageKey);
  });
  return state;
};

const writeLocalState = (state) => {
  if (!state) return;
  Object.entries(DATA_KEYS).forEach(([stateKey, storageKey]) => {
    if (Array.isArray(state[stateKey]) || (state[stateKey] && typeof state[stateKey] === 'object')) {
      localStorage.setItem(storageKey, JSON.stringify(state[stateKey]));
    }
  });
};

export const pullSupabaseToLocal = async () => {
  if (!getCloudSessionToken()) return false;
  const response = await fetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });

  if (!response.ok) {
    console.error('Supabase pull failed', await response.text());
    return false;
  }

  const data = await response.json();
  if (!data?.state) return false;

  writeLocalState(data.state);
  localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(new Date(data.updated_at).getTime() || Date.now()));
  return true;
};

export const syncLocalToSupabase = async (operatorName = '系統') => {
  if (isSyncing || !getCloudSessionToken()) return false;

  isSyncing = true;
  try {
    const now = new Date().toISOString();
    const response = await fetch('/api/app-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify({
      state: readLocalState(),
        updatedBy: operatorName
      })
    });

    if (!response.ok) {
      console.error('Supabase sync failed', await response.text());
      return false;
    }

    const data = await response.json().catch(() => ({}));
    if (data?.state) {
      writeLocalState(data.state);
    }
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(new Date(data.updated_at || now).getTime()));
    return true;
  } finally {
    isSyncing = false;
  }
};

export const seedSupabaseIfEmpty = async (operatorName = '系統') => {
  if (!getCloudSessionToken()) return false;
  const response = await fetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });
  if (!response.ok) return false;

  const data = await response.json();
  if (data?.state) return true;
  return syncLocalToSupabase(operatorName);
};

export const initSupabaseSync = async (onSync) => {
  if (!getCloudSessionToken()) return false;
  await seedSupabaseIfEmpty('系統初始化');
  await pullSupabaseToLocal();

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  pollTimer = window.setInterval(async () => {
    if (isSyncing) return;
    try {
      const response = await fetch('/api/app-state', {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders() }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.state) return;
      const remoteUpdatedAt = new Date(data.updated_at).getTime();
        const localUpdatedAt = Number(localStorage.getItem(LOCAL_UPDATED_AT_KEY) || 0);
        if (remoteUpdatedAt <= localUpdatedAt) return;

      writeLocalState(data.state);
        localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(remoteUpdatedAt));
      if (onSync) onSync(data.updated_by || '其他使用者');
    } catch (error) {
      console.error('Supabase polling failed', error);
    }
  }, 30000);

  return true;
};

export const loginViaCloud = async ({ email, password, device }) => {
  const response = await fetch('/api/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, device })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    return { success: false, error: data.error || '登入失敗，請稍後再試。' };
  }

  setCloudSessionToken(data.token);
  if (data.state) {
    writeLocalState(data.state);
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(new Date(data.updated_at || Date.now()).getTime() || Date.now()));
  }
  return data;
};

export const listCloudBackups = async () => {
  const response = await fetch('/api/backups', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || '讀取雲端備份失敗。' };
  }
  return data;
};

export const createManualCloudBackup = async (reason = 'manual') => {
  const response = await fetch('/api/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ action: 'create', reason })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || '建立雲端備份失敗。' };
  }
  return data;
};

export const restoreCloudBackup = async (backupId) => {
  const response = await fetch('/api/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
    body: JSON.stringify({ action: 'restore', backupId, confirm: 'RESTORE' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || '還原雲端備份失敗。' };
  }
  if (data.state) {
    writeLocalState(data.state);
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(new Date(data.updated_at || Date.now()).getTime() || Date.now()));
  }
  return data;
};
