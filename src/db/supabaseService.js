import { apiFetch } from './apiClient';
import { sanitizeInactiveCompanies } from '../utils/companyState';

const LOCAL_UPDATED_AT_KEY = 'bp_supabase_updated_at';
const CLOUD_UPDATED_AT_KEY = 'bp_cloud_updated_at';
const CLOUD_SESSION_TOKEN_KEY = 'bp_cloud_session_token';
const CLOUD_SYNC_LAST_ERROR_KEY = 'bp_cloud_sync_last_error';

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
  gasPurchases: 'bp_gas_purchases',
  gasCylinders: 'bp_gas_cylinders',
  gasCylinderMovements: 'bp_gas_cylinder_movements',
  gasDeliveryVehicles: 'bp_gas_delivery_vehicles',
  gasVehicleInventory: 'bp_gas_vehicle_inventory',
  customerCylinderDeposits: 'bp_customer_cylinder_deposits',
  journalEntries: 'bp_journal_entries',
  journalLines: 'bp_journal_lines',
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
  databaseTablePlan: 'bp_database_table_plan',
  domainReadiness: 'bp_domain_readiness',
  adminSecurity: 'bp_admin_security'
};

let pollTimer = null;
let isSyncing = false;
let hasPendingSync = false;
let pendingSyncOperator = '系統';
let pendingSyncPromiseResolvers = [];

export const getSupabaseConfig = () => ({ viaApi: true });
export const isSupabaseConnected = () => true;

const getSessionTokenStorage = () => (
  typeof sessionStorage === 'undefined' ? null : sessionStorage
);

export const getCloudSessionToken = () => {
  const sessionStore = getSessionTokenStorage();
  const activeToken = sessionStore?.getItem(CLOUD_SESSION_TOKEN_KEY) || '';
  if (activeToken) return activeToken;

  const legacyToken = localStorage.getItem(CLOUD_SESSION_TOKEN_KEY) || '';
  if (legacyToken && sessionStore) {
    sessionStore.setItem(CLOUD_SESSION_TOKEN_KEY, legacyToken);
    localStorage.removeItem(CLOUD_SESSION_TOKEN_KEY);
  }
  return legacyToken;
};
export const setCloudSessionToken = (token) => {
  if (!token) return;
  const sessionStore = getSessionTokenStorage();
  if (sessionStore) {
    sessionStore.setItem(CLOUD_SESSION_TOKEN_KEY, token);
    localStorage.removeItem(CLOUD_SESSION_TOKEN_KEY);
    return;
  }
  localStorage.setItem(CLOUD_SESSION_TOKEN_KEY, token);
};
export const clearCloudSessionToken = () => {
  getSessionTokenStorage()?.removeItem(CLOUD_SESSION_TOKEN_KEY);
  localStorage.removeItem(CLOUD_SESSION_TOKEN_KEY);
};

const setLastCloudSyncError = ({ status = 0, error = '雲端同步失敗。' } = {}) => {
  localStorage.setItem(CLOUD_SYNC_LAST_ERROR_KEY, JSON.stringify({ status, error, at: new Date().toISOString() }));
};

export const clearLastCloudSyncError = () => {
  localStorage.removeItem(CLOUD_SYNC_LAST_ERROR_KEY);
};

export const getLastCloudSyncError = () => {
  try {
    const value = localStorage.getItem(CLOUD_SYNC_LAST_ERROR_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const getResponseError = async (response, fallback = '雲端同步失敗。') => {
  const text = await response.text().catch(() => '');
  if (!text) return fallback;
  try {
    const data = JSON.parse(text);
    return data.error || data.message || fallback;
  } catch {
    return text.slice(0, 240) || fallback;
  }
};

const normalizeCloudError = (status, error = '', fallback = '雲端同步失敗。') => {
  const message = String(error || '');
  if (status === 401 || /Unauthorized/i.test(message)) {
    return '雲端登入已失效，請登出後重新登入再儲存。';
  }
  if (/Session is no longer allowed/i.test(message)) {
    return '這個帳號或裝置已不在允許清單內，請重新登入或請管理員核准裝置。';
  }
  if (/Insufficient role permissions/i.test(message) || /read-only/i.test(message)) {
    return '目前雲端登入帳號沒有修改資料權限，請登出後用系統管理員重新登入。';
  }
  if (/protected data/i.test(message)) {
    return '目前雲端登入帳號不能修改這類資料，請改用系統管理員帳號。';
  }
  if (/locked period/i.test(message)) {
    return '這筆資料屬於已鎖定月份，不能直接新增、修改或刪除。';
  }
  if (status === 409 || /Cloud data changed before this save/i.test(message)) {
    return '其他使用者已先更新雲端資料，系統已停止覆蓋。請重新整理頁面後再輸入這筆資料。';
  }
  if (status === 413 || /Cloud state is too large/i.test(message)) {
    return '雲端資料量過大，憑證附件必須改存私密檔案空間。';
  }
  if (status === 504 || status === 502 || status === 503 || /timed out|network|fetch|abort/i.test(message)) {
    return '網路或伺服器連線較慢，資料已安全保存在您的本機，系統會在背景自動連線同步。';
  }
  if (/Cloud sync failed/i.test(message)) {
    return '雲端資料庫寫入失敗，請稍後再試或檢查雲端設定。';
  }
  return message || fallback;
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
  return sanitizeInactiveCompanies(state);
};

const writeLocalState = (state) => {
  if (!state) return;
  const sanitizedState = sanitizeInactiveCompanies(state);
  Object.entries(DATA_KEYS).forEach(([stateKey, storageKey]) => {
    if (Array.isArray(sanitizedState[stateKey]) || (sanitizedState[stateKey] && typeof sanitizedState[stateKey] === 'object')) {
      localStorage.setItem(storageKey, JSON.stringify(sanitizedState[stateKey]));
    }
  });
};

const rememberCloudUpdatedAt = (updatedAt) => {
  const value = String(updatedAt || '');
  if (value) localStorage.setItem(CLOUD_UPDATED_AT_KEY, value);
  localStorage.setItem(LOCAL_UPDATED_AT_KEY, String(new Date(value || Date.now()).getTime() || Date.now()));
};

export const pullSupabaseToLocal = async () => {
  if (!getCloudSessionToken()) return false;
  clearLastCloudSyncError();
  const response = await apiFetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });

  if (!response.ok) {
    const error = normalizeCloudError(response.status, await getResponseError(response, '雲端資料讀取失敗。'));
    setLastCloudSyncError({ status: response.status, error });
    if (response.status === 401) clearCloudSessionToken();
    console.error('Supabase pull failed', error);
    return false;
  }

  const data = await response.json();
  if (!data?.state) return false;

  writeLocalState(data.state);
  rememberCloudUpdatedAt(data.updated_at);
  return true;
};

export const pullAndMergeCloudState = async () => {
  if (!getCloudSessionToken()) return false;
  const response = await apiFetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });

  if (!response.ok) return false;

  const data = await response.json();
  if (!data?.state) return false;

  const cloudState = data.state;
  const localState = readLocalState();
  const mergedState = {};

  Object.keys(DATA_KEYS).forEach(key => {
    const localList = localState[key] || [];
    const cloudList = cloudState[key] || [];

    if (Array.isArray(localList) && Array.isArray(cloudList)) {
      const mergedMap = new Map();
      
      cloudList.forEach(item => {
        if (item && typeof item === 'object') {
          const itemId = item.id || item.code || JSON.stringify(item);
          mergedMap.set(itemId, item);
        }
      });

      localList.forEach(item => {
        if (item && typeof item === 'object') {
          const itemId = item.id || item.code || JSON.stringify(item);
          if (mergedMap.has(itemId)) {
            const cloudItem = mergedMap.get(itemId);
            mergedMap.set(itemId, { ...cloudItem, ...item });
          } else {
            mergedMap.set(itemId, item);
          }
        }
      });

      mergedState[key] = Array.from(mergedMap.values());
    } else {
      mergedState[key] = localList || cloudList;
    }
  });

  writeLocalState(mergedState);
  rememberCloudUpdatedAt(data.updated_at);
  return true;
};

export const syncLocalToSupabase = async (operatorName = '系統') => {
  if (!getCloudSessionToken()) {
    setLastCloudSyncError({ status: 401, error: '雲端登入已失效，請重新登入後再儲存。' });
    return false;
  }

  if (isSyncing) {
    hasPendingSync = true;
    if (operatorName !== '系統') {
      pendingSyncOperator = operatorName;
    }
    return new Promise((resolve) => {
      pendingSyncPromiseResolvers.push(resolve);
    });
  }

  isSyncing = true;
  let success = false;
  try {
    clearLastCloudSyncError();
    const now = new Date().toISOString();
    const currentState = readLocalState();
    const expectedUpdatedAt = localStorage.getItem(CLOUD_UPDATED_AT_KEY) || null;

    const response = await apiFetch('/api/app-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify({
        state: currentState,
        updatedBy: operatorName,
        expectedUpdatedAt: expectedUpdatedAt
      })
    });

    if (!response.ok) {
      if (response.status === 409) {
        console.warn('Sync conflict (409) detected. Pulling latest cloud state to merge...');
        const merged = await pullAndMergeCloudState();
        if (merged) {
          isSyncing = false;
          return await syncLocalToSupabase(operatorName);
        }
      }
      const error = normalizeCloudError(response.status, await getResponseError(response, '雲端同步失敗。'));
      setLastCloudSyncError({ status: response.status, error });
      if (response.status === 401) clearCloudSessionToken();
      console.error('Supabase sync failed', error);
      success = false;
    } else {
      const data = await response.json().catch(() => ({}));
      if (data?.state && !hasPendingSync) {
        writeLocalState(data.state);
      }
      rememberCloudUpdatedAt(data.updated_at || now);
      success = true;
    }
  } catch (err) {
    const errorMsg = err.message || '雲端同步時發生非預期錯誤。';
    setLastCloudSyncError({ status: 500, error: errorMsg });
    console.error('Supabase sync caught error', err);
    success = false;
  } finally {
    isSyncing = false;

    if (hasPendingSync) {
      hasPendingSync = false;
      const nextOperator = pendingSyncOperator;
      const resolvers = [...pendingSyncPromiseResolvers];
      pendingSyncPromiseResolvers = [];

      const nextSuccess = await syncLocalToSupabase(nextOperator);
      resolvers.forEach(resolve => resolve(nextSuccess));
    }
  }
  return success;
};

export const seedSupabaseIfEmpty = async (operatorName = '系統') => {
  if (!getCloudSessionToken()) return false;
  const response = await apiFetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });
  if (!response.ok) {
    const error = normalizeCloudError(response.status, await getResponseError(response, '雲端資料讀取失敗。'));
    setLastCloudSyncError({ status: response.status, error });
    if (response.status === 401) clearCloudSessionToken();
    return false;
  }

  const data = await response.json();
  if (data?.state) return true;
  return syncLocalToSupabase(operatorName);
};

export const initSupabaseSync = async (onSync) => {
  if (!getCloudSessionToken()) return false;
  clearLastCloudSyncError();

  // Combined fetch to avoid double roundtrips (seed + pull)
  const response = await apiFetch('/api/app-state', {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() }
  });

  if (!response.ok) {
    const error = normalizeCloudError(response.status, await getResponseError(response, '雲端資料讀取失敗。'));
    setLastCloudSyncError({ status: response.status, error });
    if (response.status === 401) clearCloudSessionToken();
    console.error('Supabase init pull failed', error);
    return false;
  }

  const data = await response.json();
  if (data?.state) {
    writeLocalState(data.state);
    rememberCloudUpdatedAt(data.updated_at);
  } else {
    // If cloud is empty, seed it with the current local state
    const seeded = await syncLocalToSupabase('系統初始化');
    if (!seeded) return false;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  pollTimer = window.setInterval(async () => {
    if (isSyncing) return;
    try {
      const metaResponse = await apiFetch('/api/app-state?meta=1', {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders() }
      });
      if (!metaResponse.ok) {
        if (metaResponse.status === 401) clearCloudSessionToken();
        return;
      }
      const metadata = await metaResponse.json();
      if (!metadata?.has_state || !metadata?.updated_at) return;
      const syncError = getLastCloudSyncError();
      if (syncError?.status === 409) return;
      const remoteUpdatedAt = new Date(metadata.updated_at).getTime();
      const localUpdatedAt = Number(localStorage.getItem(LOCAL_UPDATED_AT_KEY) || 0);
      if (remoteUpdatedAt <= localUpdatedAt) return;

      const response = await apiFetch('/api/app-state', {
        method: 'GET',
        headers: { Accept: 'application/json', ...authHeaders() }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.state) return;
      writeLocalState(data.state);
      rememberCloudUpdatedAt(data.updated_at);
      if (onSync) onSync(data.updated_by || metadata.updated_by || '其他使用者');
    } catch (error) {
      console.error('Supabase polling failed', error);
    }
  }, 30000);

  return data.session || true;
};

export const loginViaCloud = async ({ email, password, device }) => {
  clearLastCloudSyncError();
  const response = await apiFetch('/api/auth-login', {
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
    rememberCloudUpdatedAt(data.updated_at || new Date().toISOString());
  }
  return data;
};

export const listCloudBackups = async () => {
  const response = await apiFetch('/api/backups', {
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
  const response = await apiFetch('/api/backups', {
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
  const response = await apiFetch('/api/backups', {
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
    rememberCloudUpdatedAt(data.updated_at || new Date().toISOString());
  }
  return data;
};
