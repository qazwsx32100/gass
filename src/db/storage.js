// LocalStorage Database Layer for BusinessPilot ERP v1.0
import {
  INITIAL_COMPANIES,
  INITIAL_SHAREHOLDERS,
  INITIAL_BANKS,
  INITIAL_CHART_OF_ACCOUNTS,
  INITIAL_SHAREHOLDER_LEDGER,
  INITIAL_INCOMES,
  INITIAL_EXPENSES,
  INITIAL_LOANS,
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_GAS_INVENTORY_PERIODS,
  INITIAL_LOGS
} from './mockData';

const KEYS = {
  COMPANIES: 'bp_companies',
  SHAREHOLDERS: 'bp_shareholders',
  BANKS: 'bp_banks',
  CHART_OF_ACCOUNTS: 'bp_chart_of_accounts',
  SHAREHOLDER_LEDGER: 'bp_shareholder_ledger',
  INCOMES: 'bp_incomes',
  EXPENSES: 'bp_expenses',
  LOANS: 'bp_loans',
  BANK_TRANSACTIONS: 'bp_bank_transactions',
  BANK_RECONCILIATIONS: 'bp_bank_reconciliations',
  FIXED_ASSETS: 'bp_fixed_assets',
  GAS_INVENTORY_PERIODS: 'bp_gas_inventory_periods',
  LOGS: 'bp_logs',
  AUDIT_ARCHIVE: 'bp_audit_archive',
  RESET_SNAPSHOTS: 'bp_reset_snapshots',
  DAILY_BACKUPS: 'bp_daily_backups',
  OUTBOUND_EMAILS: 'bp_outbound_emails',
  PERIOD_LOCKS: 'bp_period_locks',
  CUSTOMERS: 'bp_customers',
  SUPPLIERS: 'bp_suppliers',
  GO_LIVE_CHECKS: 'bp_go_live_checks',
  BACKUP_RESTORE_DRILLS: 'bp_backup_restore_drills',
  PRODUCTION_INITIALIZATION: 'bp_production_initialization',
  GAS_INVENTORY_MODULE_PLAN: 'bp_gas_inventory_module_plan',
  DATABASE_TABLE_PLAN: 'bp_database_table_plan',
  FIREBASE_CONFIG: 'bp_firebase_config',
  ADMIN_PASSWORD: 'bp_admin_password',
  ADMIN_SECURITY: 'bp_admin_security',
  BUDGETS: 'bp_budgets',
  SYSTEM_CONFIG: 'bp_system_config'
};

export const USER_ROLES = {
  ADMIN: 'admin',
  BUSINESS_REVIEWER: 'business_reviewer',
  BOOKKEEPER: 'bookkeeper',
  READONLY_SHAREHOLDER: 'readonly_shareholder'
};

const LEGACY_STATUS_MAP = {
  pending: 'pending_admin_review'
};

export const getRoleLabel = (role) => {
  if (role === USER_ROLES.ADMIN) return '系統管理員';
  if (role === USER_ROLES.BUSINESS_REVIEWER) return '審核管理者/經營股東';
  if (role === USER_ROLES.BOOKKEEPER) return '記帳人員';
  return '只讀股東';
};

export const normalizeTransaction = (item) => {
  const status = LEGACY_STATUS_MAP[item.status] || item.status || 'pending_admin_review';
  const paymentMethod = item.paymentMethod || (item.bankId ? 'bank_transfer' : 'cash');
  const unitPrice = Number(item.unitPrice) || 0;
  const quantity = Number(item.quantity) || 0;
  const calculatedAmount = Number(item.calculatedAmount) || (unitPrice > 0 && quantity > 0 ? unitPrice * quantity : 0);
  const paymentStatus = item.paymentStatus || (['receivable', 'payable', 'check'].includes(paymentMethod) ? 'unpaid' : 'paid');
  const receiptAttachment = item.receiptAttachment || '';
  const gasKg = Number(item.gasKg) || 0;
  const cylinderQty = Number(item.cylinderQty) || 0;
  const deliveryTrips = Number(item.deliveryTrips) || 0;
  const taxType = item.taxType || 'taxable';
  const taxIncluded = item.taxIncluded ?? true;
  const vatAmount = item.vatAmount === '' || item.vatAmount === null || item.vatAmount === undefined
    ? null
    : Number(item.vatAmount) || 0;

  return {
    ...item,
    status,
    paymentMethod,
    paymentStatus,
    receiptAttachment,
    bankId: paymentMethod === 'cash' ? (item.bankId || 'BANK_PETTY') :
            ['bank_transfer', 'check'].includes(paymentMethod) ? item.bankId || '' : '',
    unitPrice,
    quantity,
    calculatedAmount,
    gasKg,
    cylinderQty,
    deliveryTrips,
    customerId: item.customerId || '',
    supplierId: item.supplierId || '',
    customerType: item.customerType || '',
    checkNo: item.checkNo || '',
    checkDueDate: item.checkDueDate || '',
    counterpartyName: item.counterpartyName || '',
    invoiceNo: item.invoiceNo || '',
    invoiceDate: item.invoiceDate || item.date || '',
    counterpartyTaxId: item.counterpartyTaxId || '',
    taxType,
    taxIncluded,
    vatAmount,
    employeeName: item.employeeName || '',
    payrollMonth: item.payrollMonth || String(item.date || '').slice(0, 7),
    laborInsurance: Number(item.laborInsurance) || 0,
    healthInsurance: Number(item.healthInsurance) || 0,
    pension: Number(item.pension) || 0,
    withholdingTax: Number(item.withholdingTax) || 0,
    createdBy: item.createdBy || 'SYSTEM',
    createdByName: item.createdByName || '系統管理員',
    createdByRole: item.createdByRole || USER_ROLES.ADMIN,
    createdAt: item.createdAt || `${item.date || new Date().toISOString().split('T')[0]}T00:00:00+08:00`,
    firstReviewedBy: item.firstReviewedBy || null,
    firstReviewedByName: item.firstReviewedByName || null,
    firstReviewedByRole: item.firstReviewedByRole || null,
    firstReviewedAt: item.firstReviewedAt || null,
    adminReviewedBy: item.adminReviewedBy || (status === 'approved' ? 'SYSTEM' : null),
    adminReviewedByName: item.adminReviewedByName || (status === 'approved' ? '系統管理員' : null),
    adminReviewedAt: item.adminReviewedAt || null,
    requiresDualApproval: Boolean(item.requiresDualApproval),
    secondAdminReviewedBy: item.secondAdminReviewedBy || null,
    secondAdminReviewedByName: item.secondAdminReviewedByName || null,
    secondAdminReviewedAt: item.secondAdminReviewedAt || null,
    returnedBy: item.returnedBy || null,
    returnedByName: item.returnedByName || null,
    returnedAt: item.returnedAt || null,
    returnReason: item.returnReason || null,
    voidedBy: item.voidedBy || null,
    voidedByName: item.voidedByName || null,
    voidedAt: item.voidedAt || null,
    voidReason: item.voidReason || null,
    correctionStatus: item.correctionStatus || null,
    correctedBy: item.correctedBy || null,
    correctedByName: item.correctedByName || null,
    correctedAt: item.correctedAt || null,
    correctionReason: item.correctionReason || null,
    correctionOf: item.correctionOf || null,
    correctionType: item.correctionType || null
  };
};

const normalizeShareholder = (item) => ({
  role: USER_ROLES.READONLY_SHAREHOLDER,
  ...item,
  email: item.id === 'SH001' && item.email === 'shunan@example.com'
    ? 'qazwsx32100@gmail.com'
    : item.email,
  emailVerified: item.emailVerified ?? false,
  emailVerificationSentAt: item.emailVerificationSentAt || null,
  requiresPasswordChange: item.requiresPasswordChange ?? true,
  disabled: item.disabled ?? false,
  disabledAt: item.disabledAt || null,
  disabledReason: item.disabledReason || '',
  approvedDevices: Array.isArray(item.approvedDevices) ? item.approvedDevices : [],
  pendingDevices: Array.isArray(item.pendingDevices) ? item.pendingDevices : []
});

export const normalizeGasInventoryPeriod = (item) => {
  const openingKg = Number(item.openingKg) || 0;
  const openingCost = Number(item.openingCost) || 0;
  const purchaseKg = Number(item.purchaseKg) || 0;
  const purchaseAmount = Number(item.purchaseAmount) || 0;
  const shrinkageKg = Number(item.shrinkageKg) || 0;
  const physicalEndingKg = item.physicalEndingKg === '' || item.physicalEndingKg === null || item.physicalEndingKg === undefined
    ? null
    : Number(item.physicalEndingKg) || 0;

  return {
    ...item,
    openingKg,
    openingCost,
    purchaseKg,
    purchaseAmount,
    shrinkageKg,
    physicalEndingKg,
    remarks: item.remarks || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
};

export const normalizeBankReconciliation = (item) => ({
  id: item.id || createArchiveId('REC'),
  companyId: item.companyId || 'COMP001',
  bankId: item.bankId || '',
  statementDate: item.statementDate || new Date().toISOString().split('T')[0],
  statementBalance: Number(item.statementBalance) || 0,
  systemBalance: Number(item.systemBalance) || 0,
  difference: Number(item.difference) || 0,
  importedRows: Array.isArray(item.importedRows) ? item.importedRows : [],
  matchedRows: Array.isArray(item.matchedRows) ? item.matchedRows : [],
  unmatchedStatementRows: Array.isArray(item.unmatchedStatementRows) ? item.unmatchedStatementRows : [],
  unmatchedSystemRows: Array.isArray(item.unmatchedSystemRows) ? item.unmatchedSystemRows : [],
  status: item.status || 'draft',
  createdAt: item.createdAt || new Date().toISOString(),
  createdBy: item.createdBy || '',
  remarks: item.remarks || '',
  closeChecklist: item.closeChecklist || null,
  closeScore: Number(item.closeScore) || 0
});

export const normalizeFixedAsset = (item) => {
  const acquisitionCost = Number(item.acquisitionCost) || 0;
  const usefulLifeMonths = Number(item.usefulLifeMonths) || 0;
  const residualValue = Number(item.residualValue) || 0;
  return {
    id: item.id || createArchiveId('AST'),
    companyId: item.companyId || 'COMP001',
    assetName: item.assetName || '',
    category: item.category || 'equipment',
    acquisitionDate: item.acquisitionDate || new Date().toISOString().split('T')[0],
    acquisitionCost,
    usefulLifeMonths,
    residualValue,
    depreciationMethod: item.depreciationMethod || 'straight_line',
    status: item.status || 'active',
    disposalDate: item.disposalDate || '',
    disposalAmount: Number(item.disposalAmount) || 0,
    remarks: item.remarks || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
  };
};

export const normalizePeriodLock = (item) => ({
  companyId: item.companyId || 'COMP001',
  yearMonth: String(item.yearMonth || '').slice(0, 7),
  locked: Boolean(item.locked),
  lockedAt: item.lockedAt || null,
  lockedBy: item.lockedBy || '',
  unlockedAt: item.unlockedAt || null,
  unlockedBy: item.unlockedBy || '',
  remarks: item.remarks || ''
});

export const normalizeCustomer = (item = {}) => ({
  id: item.id || createArchiveId('CUS'),
  companyId: item.companyId || 'COMP001',
  name: item.name || '',
  taxId: item.taxId || '',
  contactPerson: item.contactPerson || '',
  phone: item.phone || '',
  email: item.email || '',
  address: item.address || '',
  creditLimit: Number(item.creditLimit) || 0,
  paymentTermsDays: Number(item.paymentTermsDays) || 30,
  status: item.status || 'active',
  remarks: item.remarks || '',
  createdAt: item.createdAt || new Date().toISOString(),
  updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
});

export const normalizeSupplier = (item = {}) => ({
  id: item.id || createArchiveId('SUP'),
  companyId: item.companyId || 'COMP001',
  name: item.name || '',
  taxId: item.taxId || '',
  contactPerson: item.contactPerson || '',
  phone: item.phone || '',
  email: item.email || '',
  address: item.address || '',
  paymentTermsDays: Number(item.paymentTermsDays) || 30,
  status: item.status || 'active',
  remarks: item.remarks || '',
  createdAt: item.createdAt || new Date().toISOString(),
  updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
});

export const normalizeGoLiveCheck = (item = {}) => ({
  id: item.id || createArchiveId('GLC'),
  title: item.title || '',
  category: item.category || 'operations',
  status: item.status || 'pending',
  notes: item.notes || '',
  checkedAt: item.checkedAt || null,
  checkedBy: item.checkedBy || ''
});

export const normalizeBackupRestoreDrill = (item = {}) => ({
  id: item.id || createArchiveId('DRL'),
  drillDate: item.drillDate || new Date().toISOString().split('T')[0],
  backupSource: item.backupSource || 'manual_backup',
  backupId: item.backupId || '',
  restoredTo: item.restoredTo || 'test_environment',
  result: item.result || 'pending',
  operator: item.operator || '',
  recordCountsVerified: Boolean(item.recordCountsVerified),
  loginVerified: Boolean(item.loginVerified),
  reportsVerified: Boolean(item.reportsVerified),
  rollbackVerified: Boolean(item.rollbackVerified),
  verifiedAt: item.verifiedAt || null,
  remarks: item.remarks || '',
  createdAt: item.createdAt || new Date().toISOString()
});

export const normalizeDatabaseTablePlanItem = (item = {}) => ({
  id: item.id || createArchiveId('DBT'),
  phase: item.phase || 'phase1',
  title: item.title || '',
  targetTables: Array.isArray(item.targetTables) ? item.targetTables : [],
  status: item.status || 'planned',
  risk: item.risk || 'medium',
  owner: item.owner || '主管理員',
  targetDate: item.targetDate || '',
  notes: item.notes || '',
  updatedAt: item.updatedAt || null
});

const DEFAULT_GO_LIVE_CHECKS = [
  { id: 'GLC_PERMISSIONS', category: 'security', title: '權限角色與裝置白名單已測試' },
  { id: 'GLC_SUPABASE', category: 'security', title: 'Supabase 舊表格已清理或關閉權限' },
  { id: 'GLC_BACKUP', category: 'backup', title: '雲端備份與地端備份已建立' },
  { id: 'GLC_RESTORE', category: 'backup', title: '備份還原演練已完成' },
  { id: 'GLC_INITIAL_DATA', category: 'launch', title: '正式資料已初始化，測試資料已清空' },
  { id: 'GLC_REPORTS', category: 'reports', title: '營運報表、圓餅圖、日期範圍報表已確認' },
  { id: 'GLC_CUSTOMERS_AR', category: 'accounting', title: '客戶資料與應收帳款流程已確認' },
  { id: 'GLC_SUPPLIERS_AP', category: 'accounting', title: '供應商資料與應付帳款流程已確認' },
  { id: 'GLC_IMMUTABLE_LEDGER', category: 'accounting', title: '已核准資料改用作廢或更正流程' },
  { id: 'GLC_GAS_INVENTORY_RESERVED', category: 'gas_inventory', title: '完整瓦斯庫存模組已預留欄位與頁面空間' }
].map(normalizeGoLiveCheck);

const DEFAULT_PRODUCTION_INITIALIZATION = {
  testDataCleared: false,
  companyProfileReady: false,
  chartOfAccountsReady: false,
  shareholdersReady: false,
  bankOpeningBalancesReady: false,
  customersReady: false,
  suppliersReady: false,
  openingInventoryReserved: false,
  lastInitializedAt: null,
  initializedBy: '',
  notes: ''
};

const DEFAULT_GAS_INVENTORY_MODULE_PLAN = {
  enabled: false,
  reserved: true,
  plannedFields: [
    '鋼瓶編號',
    '瓦斯規格與公斤數',
    '空瓶/實瓶狀態',
    '客戶寄存瓶',
    '配送車庫存',
    '盤點差異',
    '異動紀錄',
    '月結庫存成本'
  ],
  notes: '目前先保留完整庫存模組空間；現階段仍以當月進貨公斤數與銷售公斤數計算毛利。'
};

const DEFAULT_DATABASE_TABLE_PLAN = [
  {
    id: 'DBT_APP_STATE',
    phase: 'phase1',
    title: '保留 app_state 作為正式回滾主資料',
    targetTables: ['app_state', 'app_state_backups'],
    status: 'active',
    risk: 'low',
    owner: '主管理員',
    notes: '目前正式系統仍以整包狀態同步；表格化前保留此表作為回滾點。'
  },
  {
    id: 'DBT_MASTER_DATA',
    phase: 'phase2',
    title: '拆分公司、股東、銀行、科目主檔',
    targetTables: ['companies', 'shareholders', 'banks', 'chart_of_accounts'],
    status: 'planned',
    risk: 'medium',
    owner: '主管理員',
    notes: '先建立平行表與匯入檢核，不直接取代現有正式資料。'
  },
  {
    id: 'DBT_LEDGER',
    phase: 'phase2',
    title: '拆分收入、支出、傳票與股東往來',
    targetTables: ['incomes', 'expenses', 'journal_entries', 'journal_lines', 'shareholder_ledger'],
    status: 'planned',
    risk: 'high',
    owner: '主管理員',
    notes: '需要保留不可竄改稽核軌跡；已核准資料只能作廢或沖銷。'
  },
  {
    id: 'DBT_AR_AP',
    phase: 'phase3',
    title: '拆分客戶、供應商、應收應付與支票',
    targetTables: ['customers', 'suppliers', 'receivables', 'payables', 'checks'],
    status: 'planned',
    risk: 'medium',
    owner: '主管理員',
    notes: '先以現有日常金流資料反推應收、應付與支票狀態。'
  },
  {
    id: 'DBT_GAS_INVENTORY',
    phase: 'reserved',
    title: '瓦斯完整庫存資料表預留',
    targetTables: ['gas_inventory_periods', 'gas_cylinders', 'gas_stock_movements'],
    status: 'reserved',
    risk: 'medium',
    owner: '主管理員',
    notes: '目前先預留，不在本階段啟用逐瓶庫存。'
  },
  {
    id: 'DBT_AUDIT_BACKUP',
    phase: 'phase2',
    title: '拆分操作日誌、備份、還原演練',
    targetTables: ['audit_logs', 'audit_archive', 'backups', 'backup_restore_drills'],
    status: 'planned',
    risk: 'medium',
    owner: '主管理員',
    notes: '操作紀錄與刪修紀錄需保留一年，未來應改成只能追加不可覆蓋。'
  }
].map(normalizeDatabaseTablePlanItem);

const toYearMonth = (value) => String(value || '').slice(0, 7);

const getDefaultAdminSecurity = () => ({
  emailVerified: true,
  emailVerificationSentAt: null,
  requiresPasswordChange: false,
  disabled: false,
  disabledAt: null,
  disabledReason: '',
  approvedDevices: [],
  pendingDevices: []
});

export const getAdminSecurity = () => ({
  ...getDefaultAdminSecurity(),
  ...read(KEYS.ADMIN_SECURITY, {})
});

export const saveAdminSecurity = (data) => write(KEYS.ADMIN_SECURITY, {
  ...getDefaultAdminSecurity(),
  ...data
});

export const getCurrentDevice = () => {
  let deviceId = localStorage.getItem('bp_device_id');
  if (!deviceId) {
    deviceId = `DEV${new Date().toISOString().replace(/[-:.TZ]/g, '')}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    localStorage.setItem('bp_device_id', deviceId);
  }
  return {
    id: deviceId,
    label: localStorage.getItem('bp_device_label') || navigator.userAgent.split(')')[0].replace('(', '').slice(0, 80),
    userAgent: navigator.userAgent,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
};

const getRetentionExpiry = (date = new Date()) => {
  const expiry = new Date(date);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry.toISOString();
};

const createArchiveId = (prefix) => `${prefix}${new Date().toISOString().replace(/[-:.TZ]/g, '')}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const createVerificationToken = () => `EVT${new Date().toISOString().replace(/[-:.TZ]/g, '')}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

const getAppBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://erp-weld-three-96.vercel.app';
};

const encodeHtmlEntities = (text) => String(text || '').replace(/[\u0080-\uFFFF]/g, (ch) => `&#x${ch.charCodeAt(0).toString(16)};`);

// Initialize database with mock data if empty or outdated
export const initializeDB = (forceReset = false) => {
  const currentDbVersion = 'v8';
  let needsInitialization = forceReset || 
                         !localStorage.getItem(KEYS.COMPANIES) || 
                         localStorage.getItem('bp_db_version') !== currentDbVersion;

  if (needsInitialization) {
    const keepOrSeed = (key, seed) => forceReset ? seed : read(key, seed);
    localStorage.setItem(KEYS.COMPANIES, JSON.stringify(keepOrSeed(KEYS.COMPANIES, INITIAL_COMPANIES)));
    localStorage.setItem(KEYS.SHAREHOLDERS, JSON.stringify(keepOrSeed(KEYS.SHAREHOLDERS, INITIAL_SHAREHOLDERS).map(normalizeShareholder)));
    localStorage.setItem(KEYS.BANKS, JSON.stringify(keepOrSeed(KEYS.BANKS, INITIAL_BANKS)));
    localStorage.setItem(KEYS.CHART_OF_ACCOUNTS, JSON.stringify(keepOrSeed(KEYS.CHART_OF_ACCOUNTS, INITIAL_CHART_OF_ACCOUNTS)));
    localStorage.setItem(KEYS.SHAREHOLDER_LEDGER, JSON.stringify(keepOrSeed(KEYS.SHAREHOLDER_LEDGER, INITIAL_SHAREHOLDER_LEDGER)));
    localStorage.setItem(KEYS.INCOMES, JSON.stringify(keepOrSeed(KEYS.INCOMES, INITIAL_INCOMES).map(normalizeTransaction)));
    localStorage.setItem(KEYS.EXPENSES, JSON.stringify(keepOrSeed(KEYS.EXPENSES, INITIAL_EXPENSES).map(normalizeTransaction)));
    localStorage.setItem(KEYS.LOANS, JSON.stringify(keepOrSeed(KEYS.LOANS, INITIAL_LOANS)));
    localStorage.setItem(KEYS.BANK_TRANSACTIONS, JSON.stringify(keepOrSeed(KEYS.BANK_TRANSACTIONS, INITIAL_BANK_TRANSACTIONS)));
    localStorage.setItem(KEYS.BANK_RECONCILIATIONS, JSON.stringify(keepOrSeed(KEYS.BANK_RECONCILIATIONS, []).map(normalizeBankReconciliation)));
    localStorage.setItem(KEYS.FIXED_ASSETS, JSON.stringify(keepOrSeed(KEYS.FIXED_ASSETS, []).map(normalizeFixedAsset)));
    localStorage.setItem(KEYS.GAS_INVENTORY_PERIODS, JSON.stringify(keepOrSeed(KEYS.GAS_INVENTORY_PERIODS, INITIAL_GAS_INVENTORY_PERIODS).map(normalizeGasInventoryPeriod)));
    localStorage.setItem(KEYS.LOGS, JSON.stringify(keepOrSeed(KEYS.LOGS, INITIAL_LOGS)));
    localStorage.setItem(KEYS.AUDIT_ARCHIVE, JSON.stringify(keepOrSeed(KEYS.AUDIT_ARCHIVE, [])));
    localStorage.setItem(KEYS.RESET_SNAPSHOTS, JSON.stringify(keepOrSeed(KEYS.RESET_SNAPSHOTS, [])));
    localStorage.setItem(KEYS.DAILY_BACKUPS, JSON.stringify(keepOrSeed(KEYS.DAILY_BACKUPS, [])));
    localStorage.setItem(KEYS.OUTBOUND_EMAILS, JSON.stringify(keepOrSeed(KEYS.OUTBOUND_EMAILS, [])));
    localStorage.setItem(KEYS.PERIOD_LOCKS, JSON.stringify(keepOrSeed(KEYS.PERIOD_LOCKS, []).map(normalizePeriodLock)));
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(keepOrSeed(KEYS.CUSTOMERS, []).map(normalizeCustomer)));
    localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify(keepOrSeed(KEYS.SUPPLIERS, []).map(normalizeSupplier)));
    localStorage.setItem(KEYS.GO_LIVE_CHECKS, JSON.stringify(keepOrSeed(KEYS.GO_LIVE_CHECKS, DEFAULT_GO_LIVE_CHECKS).map(normalizeGoLiveCheck)));
    localStorage.setItem(KEYS.BACKUP_RESTORE_DRILLS, JSON.stringify(keepOrSeed(KEYS.BACKUP_RESTORE_DRILLS, []).map(normalizeBackupRestoreDrill)));
    localStorage.setItem(KEYS.PRODUCTION_INITIALIZATION, JSON.stringify({
      ...DEFAULT_PRODUCTION_INITIALIZATION,
      ...keepOrSeed(KEYS.PRODUCTION_INITIALIZATION, {})
    }));
    localStorage.setItem(KEYS.GAS_INVENTORY_MODULE_PLAN, JSON.stringify({
      ...DEFAULT_GAS_INVENTORY_MODULE_PLAN,
      ...keepOrSeed(KEYS.GAS_INVENTORY_MODULE_PLAN, {})
    }));
    localStorage.setItem(KEYS.DATABASE_TABLE_PLAN, JSON.stringify(
      keepOrSeed(KEYS.DATABASE_TABLE_PLAN, DEFAULT_DATABASE_TABLE_PLAN).map(normalizeDatabaseTablePlanItem)
    ));
    localStorage.setItem(KEYS.ADMIN_SECURITY, JSON.stringify({
      ...getDefaultAdminSecurity(),
      ...read(KEYS.ADMIN_SECURITY, {})
    }));
    localStorage.setItem(KEYS.BUDGETS, JSON.stringify(keepOrSeed(KEYS.BUDGETS, [
      { id: 'BGT001', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6103', budgetAmount: 15000 },
      { id: 'BGT002', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6102', budgetAmount: 120000 },
      { id: 'BGT003', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6201', budgetAmount: 8000 },
      { id: 'BGT004', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6101', budgetAmount: 50000 },
      { id: 'BGT005', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6202', budgetAmount: 5000 },
      { id: 'BGT006', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6103', budgetAmount: 20000 },
      { id: 'BGT007', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6102', budgetAmount: 150000 },
      { id: 'BGT008', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6201', budgetAmount: 10000 },
      { id: 'BGT009', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6101', budgetAmount: 50000 },
      { id: 'BGT010', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6202', budgetAmount: 10000 }
    ])));
    localStorage.setItem(KEYS.SYSTEM_CONFIG, JSON.stringify(keepOrSeed(KEYS.SYSTEM_CONFIG, {
      enableCheckMaturityAlert: true
    })));
    localStorage.setItem('bp_db_version', currentDbVersion);
    console.log(`Database initialized/migrated to version ${currentDbVersion} successfully!`);
  }

  // Non-destructive migration for existing installations
  if (!localStorage.getItem(KEYS.BUDGETS)) {
    localStorage.setItem(KEYS.BUDGETS, JSON.stringify([
      { id: 'BGT001', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6103', budgetAmount: 15000 },
      { id: 'BGT002', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6102', budgetAmount: 120000 },
      { id: 'BGT003', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6201', budgetAmount: 8000 },
      { id: 'BGT004', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6101', budgetAmount: 50000 },
      { id: 'BGT005', companyId: 'COMP001', year: 2026, month: '06', accountCode: '6202', budgetAmount: 5000 },
      { id: 'BGT006', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6103', budgetAmount: 20000 },
      { id: 'BGT007', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6102', budgetAmount: 150000 },
      { id: 'BGT008', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6201', budgetAmount: 10000 },
      { id: 'BGT009', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6101', budgetAmount: 50000 },
      { id: 'BGT010', companyId: 'COMP001', year: 2026, month: '07', accountCode: '6202', budgetAmount: 10000 }
    ]));
  }

  if (!localStorage.getItem(KEYS.BANK_RECONCILIATIONS)) {
    localStorage.setItem(KEYS.BANK_RECONCILIATIONS, JSON.stringify([]));
  }

  if (!localStorage.getItem(KEYS.FIXED_ASSETS)) {
    localStorage.setItem(KEYS.FIXED_ASSETS, JSON.stringify([]));
  }

  if (!localStorage.getItem(KEYS.CUSTOMERS)) {
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify([]));
  }

  if (!localStorage.getItem(KEYS.SUPPLIERS)) {
    localStorage.setItem(KEYS.SUPPLIERS, JSON.stringify([]));
  }

  if (!localStorage.getItem(KEYS.GO_LIVE_CHECKS)) {
    localStorage.setItem(KEYS.GO_LIVE_CHECKS, JSON.stringify(DEFAULT_GO_LIVE_CHECKS));
  }

  if (!localStorage.getItem(KEYS.BACKUP_RESTORE_DRILLS)) {
    localStorage.setItem(KEYS.BACKUP_RESTORE_DRILLS, JSON.stringify([]));
  }

  if (!localStorage.getItem(KEYS.PRODUCTION_INITIALIZATION)) {
    localStorage.setItem(KEYS.PRODUCTION_INITIALIZATION, JSON.stringify(DEFAULT_PRODUCTION_INITIALIZATION));
  }

  if (!localStorage.getItem(KEYS.GAS_INVENTORY_MODULE_PLAN)) {
    localStorage.setItem(KEYS.GAS_INVENTORY_MODULE_PLAN, JSON.stringify(DEFAULT_GAS_INVENTORY_MODULE_PLAN));
  }
  
  // Force migration for SYSTEM_CONFIG to enable check alerts
  const currentConfig = read(KEYS.SYSTEM_CONFIG, null);
  if (!currentConfig || currentConfig.enableCheckMaturityAlert === undefined || currentConfig.enableCheckMaturityAlert === false) {
    localStorage.setItem(KEYS.SYSTEM_CONFIG, JSON.stringify({
      enableCheckMaturityAlert: true
    }));
  }

  // --- DATABASE DOCTOR & REPAIR SYSTEM ---
  try {
    // 0. One-time clean-up of original mock data
    if (!localStorage.getItem('bp_mock_cleared_v2')) {
      const MOCK_INCOME_IDS = [
        'REV202605001', 'REV202605002', 'REV202605003', 'REV202605004', 'REV202605005',
        'REV202606001', 'REV202606002', 'REV202606003', 'REV202606004', 'REV202606005',
        'REV202607001', 'REV202607002', 'REV202606101', 'REV202606102'
      ];
      const MOCK_EXPENSE_IDS = [
        'EXP202605001', 'EXP202605002', 'EXP202605003', 'EXP202605004', 'EXP202605005', 'EXP202605006',
        'EXP202606001', 'EXP202606002', 'EXP202606003', 'EXP202606004', 'EXP202606005', 'EXP202606006', 'EXP202606007',
        'EXP202607001', 'EXP202607002', 'EXP202606101', 'EXP202606102', 'EXP202606103'
      ];

      const incomesVal = read(KEYS.INCOMES, []);
      const filteredIncomes = incomesVal.filter(item => !MOCK_INCOME_IDS.includes(item.id));
      write(KEYS.INCOMES, filteredIncomes);

      const expensesVal = read(KEYS.EXPENSES, []);
      const filteredExpenses = expensesVal.filter(item => !MOCK_EXPENSE_IDS.includes(item.id));
      write(KEYS.EXPENSES, filteredExpenses);

      localStorage.setItem('bp_mock_cleared_v2', 'true');
      console.log("Original mock transactions cleared successfully!");
    }

    // 0.1 Clear specific voided transaction REV202607001 requested by user
    if (!localStorage.getItem('bp_mock_cleared_v3')) {
      const incomesVal = read(KEYS.INCOMES, []);
      const filteredIncomes = incomesVal.filter(item => item.id !== 'REV202607001');
      write(KEYS.INCOMES, filteredIncomes);
      localStorage.setItem('bp_mock_cleared_v3', 'true');
      console.log("REV202607001 cleared!");
    }

    // 1. Clean Incomes
    const incomes = read(KEYS.INCOMES, null);
    if (Array.isArray(incomes)) {
      let changed = false;
      const cleaned = incomes.map(item => {
        let isItemChanged = false;
        const normalized = normalizeTransaction(item);
        
        // Safety check properties
        if (!normalized.date || typeof normalized.date !== 'string') {
          normalized.date = new Date().toISOString().split('T')[0];
          isItemChanged = true;
        }
        if (isNaN(normalized.amount) || normalized.amount === null || normalized.amount === undefined) {
          normalized.amount = 0;
          isItemChanged = true;
        }
        if (!normalized.accountCode || typeof normalized.accountCode !== 'string') {
          normalized.accountCode = '4101';
          isItemChanged = true;
        }
        
        if (isItemChanged) changed = true;
        return normalized;
      });
      if (changed) write(KEYS.INCOMES, cleaned);
    }

    // 2. Clean Expenses
    const expenses = read(KEYS.EXPENSES, null);
    if (Array.isArray(expenses)) {
      let changed = false;
      const cleaned = expenses.map(item => {
        let isItemChanged = false;
        const normalized = normalizeTransaction(item);
        
        if (!normalized.date || typeof normalized.date !== 'string') {
          normalized.date = new Date().toISOString().split('T')[0];
          isItemChanged = true;
        }
        if (isNaN(normalized.amount) || normalized.amount === null || normalized.amount === undefined) {
          normalized.amount = 0;
          isItemChanged = true;
        }
        if (!normalized.accountCode || typeof normalized.accountCode !== 'string') {
          normalized.accountCode = '6101';
          isItemChanged = true;
        }
        
        if (isItemChanged) changed = true;
        return normalized;
      });
      if (changed) write(KEYS.EXPENSES, cleaned);
    }

    // 3. Clean Shareholder Ledger
    const shLedger = read(KEYS.SHAREHOLDER_LEDGER, null);
    if (Array.isArray(shLedger)) {
      let changed = false;
      const cleaned = shLedger.map(item => {
        let isItemChanged = false;
        if (!item.date || typeof item.date !== 'string') {
          item.date = new Date().toISOString().split('T')[0];
          isItemChanged = true;
        }
        if (isNaN(item.amount) || item.amount === null || item.amount === undefined) {
          item.amount = 0;
          isItemChanged = true;
        }
        if (!item.type || typeof item.type !== 'string') {
          item.type = 'join';
          isItemChanged = true;
        }
        if (isItemChanged) changed = true;
        return item;
      });
      if (changed) write(KEYS.SHAREHOLDER_LEDGER, cleaned);
    }

    // 4. Clean Gas Inventory Periods
    const gasPeriods = read(KEYS.GAS_INVENTORY_PERIODS, null);
    if (Array.isArray(gasPeriods)) {
      let changed = false;
      const cleaned = gasPeriods.map(item => {
        let isItemChanged = false;
        const normalized = normalizeGasInventoryPeriod(item);
        if (!normalized.yearMonth || typeof normalized.yearMonth !== 'string' || !normalized.yearMonth.includes('-')) {
          normalized.yearMonth = new Date().toISOString().slice(0, 7);
          isItemChanged = true;
        }
        if (isItemChanged) changed = true;
        return normalized;
      });
      if (changed) write(KEYS.GAS_INVENTORY_PERIODS, cleaned);
    }
  } catch (doctorErr) {
    console.error("Database Doctor failed to run:", doctorErr);
  }

  purgeExpiredRetainedData();
};

// Generic read/write helpers
const read = (key, fallback = []) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.error(`Error reading key ${key} from localStorage`, e);
    return fallback;
  }
};

const write = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error writing key ${key} to localStorage`, e);
  }
};

// Companies API
export const getCompanies = () => read(KEYS.COMPANIES);
export const saveCompanies = (data) => write(KEYS.COMPANIES, data);

// Shareholders API
export const getShareholders = () => read(KEYS.SHAREHOLDERS).map(normalizeShareholder);
export const saveShareholders = (data) => write(KEYS.SHAREHOLDERS, data);

export const getAdminDisplayName = () => {
  const shareholder = getShareholders().find(s => s.id === 'SH001' || String(s.email || '').trim().toLowerCase() === 'qazwsx32100@gmail.com');
  return shareholder?.name || '主管理員';
};

// Banks API
export const getBanks = () => {
  const list = read(KEYS.BANKS);
  if (list && list.length > 0 && !list.some(b => b.id === 'BANK_PETTY')) {
    list.push({
      id: 'BANK_PETTY',
      companyId: 'COMP001',
      name: '零用金 / 現金',
      accountNo: 'CASH-BOX-01',
      initialBalance: 10000
    });
    write(KEYS.BANKS, list);
  }
  return list;
};
export const saveBanks = (data) => write(KEYS.BANKS, data);

// Chart of Accounts API
export const getChartOfAccounts = () => read(KEYS.CHART_OF_ACCOUNTS);
export const saveChartOfAccounts = (data) => write(KEYS.CHART_OF_ACCOUNTS, data);

// Shareholder Ledger API (Historical shareholder events)
export const getShareholderLedger = () => read(KEYS.SHAREHOLDER_LEDGER);
export const saveShareholderLedger = (data) => write(KEYS.SHAREHOLDER_LEDGER, data);

// Incomes API
export const getIncomes = () => read(KEYS.INCOMES);
export const saveIncomes = (data) => write(KEYS.INCOMES, data);

// Expenses API
export const getExpenses = () => read(KEYS.EXPENSES);
export const saveExpenses = (data) => write(KEYS.EXPENSES, data);

// Loans API
export const getLoans = () => read(KEYS.LOANS);
export const saveLoans = (data) => write(KEYS.LOANS, data);

// Bank Transactions API
export const getBankTransactions = () => read(KEYS.BANK_TRANSACTIONS);
export const saveBankTransactions = (data) => write(KEYS.BANK_TRANSACTIONS, data);
export const getBankReconciliations = () => read(KEYS.BANK_RECONCILIATIONS, []).map(normalizeBankReconciliation);
export const saveBankReconciliations = (data) => write(KEYS.BANK_RECONCILIATIONS, data.map(normalizeBankReconciliation));
export const getFixedAssets = () => read(KEYS.FIXED_ASSETS, []).map(normalizeFixedAsset);
export const saveFixedAssets = (data) => write(KEYS.FIXED_ASSETS, data.map(normalizeFixedAsset));
export const getGasInventoryPeriods = () => read(KEYS.GAS_INVENTORY_PERIODS).map(normalizeGasInventoryPeriod);
export const saveGasInventoryPeriods = (data) => write(KEYS.GAS_INVENTORY_PERIODS, data.map(normalizeGasInventoryPeriod));

// Logs API
export const getLogs = () => read(KEYS.LOGS);
export const saveLogs = (data) => write(KEYS.LOGS, data);
export const getAuditArchive = () => read(KEYS.AUDIT_ARCHIVE);
export const saveAuditArchive = (data) => write(KEYS.AUDIT_ARCHIVE, data);
export const getResetSnapshots = () => read(KEYS.RESET_SNAPSHOTS);
export const saveResetSnapshots = (data) => write(KEYS.RESET_SNAPSHOTS, data);
export const getDailyBackups = () => read(KEYS.DAILY_BACKUPS);
export const saveDailyBackups = (data) => write(KEYS.DAILY_BACKUPS, data);
export const getOutboundEmails = () => read(KEYS.OUTBOUND_EMAILS);
export const saveOutboundEmails = (data) => write(KEYS.OUTBOUND_EMAILS, data);
export const getPeriodLocks = () => read(KEYS.PERIOD_LOCKS).map(normalizePeriodLock);
export const savePeriodLocks = (data) => write(KEYS.PERIOD_LOCKS, data.map(normalizePeriodLock));

export const getBudgets = () => read(KEYS.BUDGETS, []);
export const saveBudgets = (data) => write(KEYS.BUDGETS, data);

export const getCustomers = () => read(KEYS.CUSTOMERS, []).map(normalizeCustomer);
export const saveCustomers = (data) => write(KEYS.CUSTOMERS, data.map(normalizeCustomer));
export const getSuppliers = () => read(KEYS.SUPPLIERS, []).map(normalizeSupplier);
export const saveSuppliers = (data) => write(KEYS.SUPPLIERS, data.map(normalizeSupplier));
export const getGoLiveChecks = () => {
  const saved = read(KEYS.GO_LIVE_CHECKS, []);
  const savedMap = new Map(saved.map(item => [item.id, item]));
  return DEFAULT_GO_LIVE_CHECKS.map(defaultItem => normalizeGoLiveCheck({
    ...defaultItem,
    ...(savedMap.get(defaultItem.id) || {})
  }));
};
export const saveGoLiveChecks = (data) => write(KEYS.GO_LIVE_CHECKS, data.map(normalizeGoLiveCheck));
export const getBackupRestoreDrills = () => read(KEYS.BACKUP_RESTORE_DRILLS, []).map(normalizeBackupRestoreDrill);
export const saveBackupRestoreDrills = (data) => write(KEYS.BACKUP_RESTORE_DRILLS, data.map(normalizeBackupRestoreDrill));
export const getProductionInitialization = () => ({
  ...DEFAULT_PRODUCTION_INITIALIZATION,
  ...read(KEYS.PRODUCTION_INITIALIZATION, {})
});
export const saveProductionInitialization = (data) => write(KEYS.PRODUCTION_INITIALIZATION, {
  ...DEFAULT_PRODUCTION_INITIALIZATION,
  ...data
});
export const getGasInventoryModulePlan = () => ({
  ...DEFAULT_GAS_INVENTORY_MODULE_PLAN,
  ...read(KEYS.GAS_INVENTORY_MODULE_PLAN, {})
});
export const saveGasInventoryModulePlan = (data) => write(KEYS.GAS_INVENTORY_MODULE_PLAN, {
  ...DEFAULT_GAS_INVENTORY_MODULE_PLAN,
  ...data
});

export const getDatabaseTablePlan = () => {
  const saved = read(KEYS.DATABASE_TABLE_PLAN, []);
  const savedMap = new Map(saved.map(item => [item.id, item]));
  return DEFAULT_DATABASE_TABLE_PLAN.map(defaultItem => normalizeDatabaseTablePlanItem({
    ...defaultItem,
    ...(savedMap.get(defaultItem.id) || {})
  }));
};
export const saveDatabaseTablePlan = (data) => write(KEYS.DATABASE_TABLE_PLAN, data.map(normalizeDatabaseTablePlanItem));

export const getSystemConfig = () => read(KEYS.SYSTEM_CONFIG, { enableCheckMaturityAlert: false });
export const saveSystemConfig = (data) => write(KEYS.SYSTEM_CONFIG, data);

export const isPeriodLocked = (companyId, dateOrYearMonth) => {
  const yearMonth = toYearMonth(dateOrYearMonth);
  if (!companyId || !yearMonth) return false;
  return getPeriodLocks().some(item => item.companyId === companyId && item.yearMonth === yearMonth && item.locked);
};

export const setPeriodLock = (payload) => {
  const { companyId, yearMonth, locked, actor = '主管理員', remarks = '', closeChecklist = null, closeScore = 0 } = payload || {};
  const normalizedMonth = toYearMonth(yearMonth);
  if (!companyId || !normalizedMonth) return false;

  const now = new Date().toISOString();
  const locks = getPeriodLocks();
  const idx = locks.findIndex(item => item.companyId === companyId && item.yearMonth === normalizedMonth);
  const closingScoreValue = Number(closeScore || 0);
  const next = {
    ...(idx >= 0 ? locks[idx] : { companyId, yearMonth: normalizedMonth }),
    companyId,
    yearMonth: normalizedMonth,
    locked: Boolean(locked),
    remarks,
    closeChecklist: locked ? closeChecklist : (idx >= 0 ? locks[idx].closeChecklist : null),
    closeScore: locked ? closingScoreValue : (idx >= 0 ? Number(locks[idx].closeScore || 0) : 0),
    ...(locked
      ? { lockedAt: now, lockedBy: actor }
      : { unlockedAt: now, unlockedBy: actor })
  };

  if (idx >= 0) locks[idx] = next;
  else locks.unshift(next);

  savePeriodLocks(locks);
  addLog(actor, locked ? 'PERIOD_LOCKED' : 'PERIOD_UNLOCKED', `${companyId} ${normalizedMonth}`);
  return true;
};

export const getDatabaseState = () => ({
  companies: getCompanies(),
  shareholders: getShareholders(),
  banks: getBanks(),
  chartOfAccounts: getChartOfAccounts(),
  shareholderLedger: getShareholderLedger(),
  incomes: getIncomes(),
  expenses: getExpenses(),
  loans: getLoans(),
  bankTransactions: getBankTransactions(),
  bankReconciliations: getBankReconciliations(),
  fixedAssets: getFixedAssets(),
  gasInventoryPeriods: getGasInventoryPeriods(),
  logs: getLogs(),
  auditArchive: getAuditArchive(),
  resetSnapshots: getResetSnapshots(),
  dailyBackups: getDailyBackups(),
  outboundEmails: getOutboundEmails(),
  periodLocks: getPeriodLocks(),
  customers: getCustomers(),
  suppliers: getSuppliers(),
  goLiveChecks: getGoLiveChecks(),
  backupRestoreDrills: getBackupRestoreDrills(),
  productionInitialization: getProductionInitialization(),
  gasInventoryModulePlan: getGasInventoryModulePlan(),
  databaseTablePlan: getDatabaseTablePlan(),
  adminSecurity: getAdminSecurity()
});

export const archiveChange = ({ collection, recordId, action, before = null, after = null, actor = '系統管理員', reason = '' }) => {
  const now = new Date();
  const archive = getAuditArchive();
  archive.unshift({
    id: createArchiveId('AUD'),
    collection,
    recordId,
    action,
    before,
    after,
    actor,
    reason,
    archivedAt: now.toISOString(),
    purgeAfter: getRetentionExpiry(now)
  });
  saveAuditArchive(archive);
};

export const archiveDeletion = ({ collection, record, actor = '系統管理員', reason = '' }) => {
  archiveChange({
    collection,
    recordId: record?.id || record?.code || '',
    action: 'delete',
    before: record,
    after: null,
    actor,
    reason
  });
};

export const archiveResetSnapshot = (actor = '系統管理員', reason = '系統資料重置') => {
  const now = new Date();
  const snapshots = getResetSnapshots();
  snapshots.unshift({
    id: createArchiveId('RST'),
    reason,
    actor,
    snapshot: getDatabaseState(),
    archivedAt: now.toISOString(),
    purgeAfter: getRetentionExpiry(now)
  });
  saveResetSnapshots(snapshots);
};

export const createDailyBackupIfNeeded = (actor = '系統管理員') => {
  const today = new Date().toISOString().split('T')[0];
  const backups = getDailyBackups();
  if (backups.some(item => item.backupDate === today)) return false;

  const now = new Date();
  backups.unshift({
    id: createArchiveId('BAK'),
    backupDate: today,
    actor,
    snapshot: getDatabaseState(),
    archivedAt: now.toISOString(),
    purgeAfter: getRetentionExpiry(now)
  });
  saveDailyBackups(backups);
  return true;
};

export const purgeExpiredRetainedData = () => {
  const now = new Date().toISOString();
  saveAuditArchive(getAuditArchive().filter(item => !item.purgeAfter || item.purgeAfter > now));
  saveResetSnapshots(getResetSnapshots().filter(item => !item.purgeAfter || item.purgeAfter > now));
  saveDailyBackups(getDailyBackups().filter(item => !item.purgeAfter || item.purgeAfter > now));
};

const enqueueEmail = ({ to, subject, body, html, type, userId, token }) => {
  const emails = getOutboundEmails();
  const email = {
    id: createArchiveId('EML'),
    to,
    subject,
    body,
    html: html || body,
    type,
    userId,
    token,
    status: 'queued',
    createdAt: new Date().toISOString(),
    sentAt: null,
    providerMessageId: null
  };
  emails.unshift(email);
  saveOutboundEmails(emails);
  return email;
};

export const markOutboundEmailSent = (emailId, providerMessageId = '') => {
  const emails = getOutboundEmails();
  const idx = emails.findIndex(item => item.id === emailId);
  if (idx === -1) return false;
  emails[idx] = {
    ...emails[idx],
    status: 'sent',
    sentAt: new Date().toISOString(),
    providerMessageId
  };
  saveOutboundEmails(emails);
  return true;
};

export const markOutboundEmailFailed = (emailId, error = '') => {
  const emails = getOutboundEmails();
  const idx = emails.findIndex(item => item.id === emailId);
  if (idx === -1) return false;
  emails[idx] = {
    ...emails[idx],
    status: 'failed',
    lastError: error,
    failedAt: new Date().toISOString()
  };
  saveOutboundEmails(emails);
  return true;
};

export const addLog = (operator, action, details) => {
  const logs = getLogs();
  const dateStr = new Date().toISOString().replace(/-/g, '').substring(0, 6);
  
  // Create Log ID
  const prefix = `LOG${dateStr}`;
  const matches = logs.map(l => l.id).filter(id => id && id.startsWith(prefix));
  let nextSeq = 1;
  if (matches.length > 0) {
    const seqs = matches.map(id => parseInt(id.replace(prefix, ''), 10));
    nextSeq = Math.max(...seqs) + 1;
  }
  const nextId = `${prefix}${String(nextSeq).padStart(3, '0')}`;

  // Timestamp format YYYY-MM-DD HH:MM:SS local
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  logs.unshift({
    id: nextId,
    timestamp,
    operator,
    action,
    details
  });
  saveLogs(logs);
};

const upsertDevice = (devices, device, status = 'pending') => {
  const existing = (devices || []).find(item => item.id === device.id);
  if (existing) {
    existing.lastSeenAt = new Date().toISOString();
    existing.label = existing.label || device.label;
    existing.status = status;
    return devices;
  }
  return [
    ...(devices || []),
    {
      ...device,
      status,
      requestedAt: new Date().toISOString(),
      approvedAt: status === 'approved' ? new Date().toISOString() : null,
      approvedBy: status === 'approved' ? '系統管理員' : null
    }
  ];
};

const isDeviceApproved = (security, device) => {
  if (!security.approvedDevices || security.approvedDevices.length === 0) return false;
  return security.approvedDevices.some(item => item.id === device.id);
};

export const sendVerificationEmail = (userId, operator = '系統管理員') => {
  // Email verification is currently disabled in the UI, but the data model remains for future use.
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const token = createVerificationToken();
  const verificationUrl = `${getAppBaseUrl()}/?verifyEmailToken=${encodeURIComponent(token)}`;
  const emailSubject = 'BusinessPilot ERP Email Verification';
  const emailBodyText = `Please click the verification link within 24 hours: ${verificationUrl}`;
  if (userId === 'ADMIN') {
    const security = getAdminSecurity();
    saveAdminSecurity({
      ...security,
      emailVerificationSentAt: now,
      emailVerificationToken: token,
      emailVerificationExpiresAt: expiresAt
    });
    const email = enqueueEmail({
      to: 'qazwsx32100@gmail.com',
      subject: emailSubject,
      body: emailBodyText,
      html: `<p>${encodeHtmlEntities('請點擊以下連結完成 BusinessPilot ERP Email 驗證。')}</p><p><a href="${verificationUrl}">${encodeHtmlEntities('完成 Email 驗證')}</a></p><p>${encodeHtmlEntities('此連結 24 小時後失效。')}</p>`,
      type: 'email_verification',
      userId,
      token
    });
    addLog(operator, 'EMAIL_VERIFICATION_SENT', '已建立 Email 驗證信。');
    return { success: true, email };
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return { success: false };
  shareholders[idx] = {
    ...shareholders[idx],
    emailVerificationSentAt: now,
    emailVerificationToken: token,
    emailVerificationExpiresAt: expiresAt
  };
  saveShareholders(shareholders);
  const email = enqueueEmail({
    to: shareholders[idx].email,
    subject: emailSubject,
    body: emailBodyText,
    html: `<p>${encodeHtmlEntities(`${shareholders[idx].name} 您好：`)}</p><p>${encodeHtmlEntities('請點擊以下連結完成 BusinessPilot ERP Email 驗證。')}</p><p><a href="${verificationUrl}">${encodeHtmlEntities('完成 Email 驗證')}</a></p><p>${encodeHtmlEntities('此連結 24 小時後失效。')}</p>`,
    type: 'email_verification',
    userId,
    token
  });
  addLog(operator, 'EMAIL_VERIFICATION_SENT', `已建立 Email 驗證信：${shareholders[idx].name}`);
  return { success: true, email };
};

export const markEmailVerified = (userId, operator = '系統管理員') => {
  if (userId === 'ADMIN') {
    saveAdminSecurity({ ...getAdminSecurity(), emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null });
    addLog(operator, 'EMAIL_VERIFIED', '管理員 Email 已驗證。');
    return true;
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return false;
  shareholders[idx] = { ...shareholders[idx], emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null };
  saveShareholders(shareholders);
  addLog(operator, 'EMAIL_VERIFIED', `Email 已驗證：${shareholders[idx].name}`);
  return true;
};

export const verifyEmailByToken = (token) => {
  // Disabled at the application level for now; retain for future reactivation.
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return { success: false, error: '驗證連結無效。' };
  const now = new Date();

  const adminSecurity = getAdminSecurity();
  if (adminSecurity.emailVerificationToken === normalizedToken) {
    if (adminSecurity.emailVerificationExpiresAt && new Date(adminSecurity.emailVerificationExpiresAt) < now) {
      return { success: false, error: '驗證連結已過期，請重新寄送。' };
    }
    saveAdminSecurity({
      ...adminSecurity,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null
    });
    addLog('系統管理員', 'EMAIL_VERIFIED', '管理員已完成 Email 驗證。');
    return { success: true, userName: '系統管理員' };
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.emailVerificationToken === normalizedToken);
  if (idx === -1) return { success: false, error: '驗證連結不存在，請確認是否使用最新驗證信。' };
  if (shareholders[idx].emailVerificationExpiresAt && new Date(shareholders[idx].emailVerificationExpiresAt) < now) {
    return { success: false, error: '驗證連結已過期，請重新寄送。' };
  }

  shareholders[idx] = {
    ...shareholders[idx],
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpiresAt: null
  };
  saveShareholders(shareholders);
  addLog(shareholders[idx].name, 'EMAIL_VERIFIED', '使用者已完成 Email 驗證。');
  return { success: true, userName: shareholders[idx].name };
};

export const setAccountDisabled = (userId, disabled, reason = '', operator = '系統管理員') => {
  const disabledAt = disabled ? new Date().toISOString() : null;
  if (userId === 'ADMIN') {
    saveAdminSecurity({ ...getAdminSecurity(), disabled, disabledAt, disabledReason: reason });
    addLog(operator, disabled ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED', `管理員帳號${disabled ? '已停用' : '已啟用'}：${reason}`);
    return true;
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return false;
  shareholders[idx] = { ...shareholders[idx], disabled, disabledAt, disabledReason: reason };
  saveShareholders(shareholders);
  addLog(operator, disabled ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED', `${shareholders[idx].name} 帳號${disabled ? '已停用' : '已啟用'}：${reason}`);
  return true;
};

export const approveDevice = (userId, deviceId, operator = '系統管理員') => {
  const approve = (security) => {
    const pending = security.pendingDevices || [];
    const device = pending.find(item => item.id === deviceId);
    if (!device) return null;
    return {
      ...security,
      pendingDevices: pending.filter(item => item.id !== deviceId),
      approvedDevices: upsertDevice(security.approvedDevices || [], device, 'approved')
    };
  };

  if (userId === 'ADMIN') {
    const next = approve(getAdminSecurity());
    if (!next) return false;
    saveAdminSecurity(next);
    addLog(operator, 'DEVICE_APPROVED', '已核准管理員登入裝置。');
    return true;
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return false;
  const next = approve(shareholders[idx]);
  if (!next) return false;
  shareholders[idx] = next;
  saveShareholders(shareholders);
  addLog(operator, 'DEVICE_APPROVED', `已核准登入裝置：${shareholders[idx].name}`);
  return true;
};

export const rejectDevice = (userId, deviceId, operator = '系統管理員') => {
  const reject = (security) => ({
    ...security,
    pendingDevices: (security.pendingDevices || []).filter(item => item.id !== deviceId)
  });

  if (userId === 'ADMIN') {
    saveAdminSecurity(reject(getAdminSecurity()));
    addLog(operator, 'DEVICE_REJECTED', '已拒絕管理員登入裝置。');
    return true;
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return false;
  shareholders[idx] = reject(shareholders[idx]);
  saveShareholders(shareholders);
  addLog(operator, 'DEVICE_REJECTED', `已拒絕登入裝置：${shareholders[idx].name}`);
  return true;
};

export const revokeDevice = (userId, deviceId, operator = '系統管理員') => {
  const revoke = (security) => ({
    ...security,
    approvedDevices: (security.approvedDevices || []).filter(item => item.id !== deviceId)
  });

  if (userId === 'ADMIN') {
    saveAdminSecurity(revoke(getAdminSecurity()));
    addLog(operator, 'DEVICE_REVOKED', '已撤銷管理員登入裝置。');
    return true;
  }

  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx === -1) return false;
  shareholders[idx] = revoke(shareholders[idx]);
  saveShareholders(shareholders);
  addLog(operator, 'DEVICE_REVOKED', `已撤銷登入裝置：${shareholders[idx].name}`);
  return true;
};

// Login Validation Helper
export const verifyLogin = (email, password) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '').trim();
  const device = getCurrentDevice();

  // 1. Check if admin credentials
  const adminPassword = localStorage.getItem(KEYS.ADMIN_PASSWORD) || 'windsboy123';
  if (normalizedEmail === 'qazwsx32100@gmail.com' && normalizedPassword === String(adminPassword).trim()) {
    const security = getAdminSecurity();
    const displayName = getAdminDisplayName();
    if (security.disabled) {
      addLog(displayName, 'LOGIN_BLOCKED', '管理員帳號已停用。');
      return { success: false, error: '此帳號已停用，請聯絡系統管理員。' };
    }
    if ((security.approvedDevices || []).length === 0 && (security.pendingDevices || []).length === 0) {
      const initializedSecurity = {
        ...security,
        approvedDevices: upsertDevice(security.approvedDevices || [], device, 'approved')
      };
      saveAdminSecurity(initializedSecurity);
      addLog(displayName, 'DEVICE_APPROVED', '管理員首次登入裝置已自動核准。');
      security.approvedDevices = initializedSecurity.approvedDevices;
    }
    if (!isDeviceApproved(security, device)) {
      saveAdminSecurity({ ...security, pendingDevices: upsertDevice(security.pendingDevices || [], device, 'pending') });
      addLog(displayName, 'DEVICE_PENDING', '管理員新裝置登入待核准。');
      return { success: false, error: '此裝置尚未核准，已送出裝置白名單申請，請由管理員核准。' };
    }
    addLog(displayName, 'LOGIN_SUCCESS', '管理員登入成功。');
    return {
      success: true,
      role: USER_ROLES.ADMIN,
      user: {
        name: displayName,
        email: 'qazwsx32100@gmail.com',
        id: 'ADMIN',
        role: USER_ROLES.ADMIN,
        shareholderId: 'SH001',
        requiresPasswordChange: security.requiresPasswordChange
      }
    };
  }

  // 2. Check shareholders list
  const shareholders = getShareholders();
  const user = shareholders.find(s => (
    String(s.email || '').trim().toLowerCase() === normalizedEmail &&
    String(s.password || '').trim() === normalizedPassword
  ));
  if (user) {
    const role = user.role || USER_ROLES.READONLY_SHAREHOLDER;
    if (user.disabled) {
      addLog(user.name || normalizedEmail, 'LOGIN_BLOCKED', '帳號已停用。');
      return { success: false, error: '此帳號已停用，請聯絡系統管理員。' };
    }
    if (!isDeviceApproved(user, device)) {
      const updated = getShareholders();
      const idx = updated.findIndex(s => s.id === user.id);
      updated[idx] = {
        ...updated[idx],
        pendingDevices: upsertDevice(updated[idx].pendingDevices || [], device, 'pending')
      };
      saveShareholders(updated);
      addLog(user.name || normalizedEmail, 'DEVICE_PENDING', '新裝置登入待核准。');
      return { success: false, error: '此裝置尚未核准，已送出裝置白名單申請，請由管理員核准。' };
    }
    addLog(user.name || normalizedEmail, 'LOGIN_SUCCESS', '登入成功。');
    return { success: true, role, user: { ...user, role } };
  }

  addLog(normalizedEmail || '未知帳號', 'LOGIN_FAILED', '帳號或密碼錯誤。');
  return { success: false, error: '帳號或密碼錯誤，請重新輸入。' };
};

// Update Password Helper
export const updatePassword = (userId, newPassword) => {
  if (userId === 'ADMIN') {
    localStorage.setItem(KEYS.ADMIN_PASSWORD, newPassword);
    saveAdminSecurity({ ...getAdminSecurity(), password: newPassword, requiresPasswordChange: false });
    addLog(getAdminDisplayName(), 'PASSWORD_CHANGED', '管理員已修改登入密碼。');
    return true;
  }
  const shareholders = getShareholders();
  const idx = shareholders.findIndex(s => s.id === userId);
  if (idx !== -1) {
    shareholders[idx].password = newPassword;
    shareholders[idx].requiresPasswordChange = false;
    saveShareholders(shareholders);
    addLog(shareholders[idx].name, 'PASSWORD_CHANGED', '使用者已完成首次改密碼。');
    return true;
  }
  return false;
};

// Firebase Config API
export const getFirebaseConfig = () => read(KEYS.FIREBASE_CONFIG, null);
export const saveFirebaseConfig = (data) => write(KEYS.FIREBASE_CONFIG, data);

// Export whole database as a backup JSON object
export const exportBackup = () => {
  const cleanShareholders = getShareholders().map(s => {
    const cleaned = { ...s };
    delete cleaned.password;
    return cleaned;
  });

  const adminSec = getAdminSecurity();
  const cleanAdminSecurity = adminSec ? { ...adminSec } : null;
  if (cleanAdminSecurity) {
    delete cleanAdminSecurity.password;
  }

  const backup = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    companies: getCompanies(),
    shareholders: cleanShareholders,
    banks: getBanks(),
    chartOfAccounts: getChartOfAccounts(),
    shareholderLedger: getShareholderLedger(),
    incomes: getIncomes(),
    expenses: getExpenses(),
    loans: getLoans(),
    bankTransactions: getBankTransactions(),
    bankReconciliations: getBankReconciliations(),
    fixedAssets: getFixedAssets(),
    gasInventoryPeriods: getGasInventoryPeriods(),
    logs: getLogs(),
    auditArchive: getAuditArchive(),
    resetSnapshots: getResetSnapshots(),
    dailyBackups: getDailyBackups(),
    outboundEmails: getOutboundEmails(),
    periodLocks: getPeriodLocks(),
    customers: getCustomers(),
    suppliers: getSuppliers(),
    goLiveChecks: getGoLiveChecks(),
    backupRestoreDrills: getBackupRestoreDrills(),
    productionInitialization: getProductionInitialization(),
    gasInventoryModulePlan: getGasInventoryModulePlan(),
    databaseTablePlan: getDatabaseTablePlan(),
    adminSecurity: cleanAdminSecurity
  };
  return JSON.stringify(backup, null, 2);
};

// Import backup JSON object
export const importBackup = (jsonString) => {
  try {
    let backup = JSON.parse(jsonString);
    
    // Automatically unpack Supabase Table Editor row export format
    if (backup && backup.data && backup.data.state) {
      backup = backup.data.state;
    }

    if (!backup.companies || !backup.shareholders || !backup.incomes) {
      throw new Error('Invalid backup file format');
    }
    write(KEYS.COMPANIES, backup.companies);
    write(KEYS.SHAREHOLDERS, (backup.shareholders || []).map(normalizeShareholder));
    write(KEYS.BANKS, backup.banks || []);
    write(KEYS.CHART_OF_ACCOUNTS, backup.chartOfAccounts || []);
    write(KEYS.SHAREHOLDER_LEDGER, backup.shareholderLedger || []);
    write(KEYS.INCOMES, (backup.incomes || []).map(normalizeTransaction));
    write(KEYS.EXPENSES, (backup.expenses || []).map(normalizeTransaction));
    write(KEYS.LOANS, backup.loans || []);
    write(KEYS.BANK_TRANSACTIONS, backup.bankTransactions || []);
    write(KEYS.BANK_RECONCILIATIONS, (backup.bankReconciliations || []).map(normalizeBankReconciliation));
    write(KEYS.FIXED_ASSETS, (backup.fixedAssets || []).map(normalizeFixedAsset));
    write(KEYS.GAS_INVENTORY_PERIODS, (backup.gasInventoryPeriods || []).map(normalizeGasInventoryPeriod));
    write(KEYS.LOGS, backup.logs || INITIAL_LOGS);
    write(KEYS.AUDIT_ARCHIVE, backup.auditArchive || []);
    write(KEYS.RESET_SNAPSHOTS, backup.resetSnapshots || []);
    write(KEYS.DAILY_BACKUPS, backup.dailyBackups || []);
    write(KEYS.OUTBOUND_EMAILS, backup.outboundEmails || []);
    write(KEYS.PERIOD_LOCKS, (backup.periodLocks || []).map(normalizePeriodLock));
    write(KEYS.CUSTOMERS, (backup.customers || []).map(normalizeCustomer));
    write(KEYS.SUPPLIERS, (backup.suppliers || []).map(normalizeSupplier));
    write(KEYS.GO_LIVE_CHECKS, (backup.goLiveChecks || DEFAULT_GO_LIVE_CHECKS).map(normalizeGoLiveCheck));
    write(KEYS.BACKUP_RESTORE_DRILLS, (backup.backupRestoreDrills || []).map(normalizeBackupRestoreDrill));
    write(KEYS.PRODUCTION_INITIALIZATION, {
      ...DEFAULT_PRODUCTION_INITIALIZATION,
      ...(backup.productionInitialization || {})
    });
    write(KEYS.GAS_INVENTORY_MODULE_PLAN, {
      ...DEFAULT_GAS_INVENTORY_MODULE_PLAN,
      ...(backup.gasInventoryModulePlan || {})
    });
    write(KEYS.DATABASE_TABLE_PLAN, (backup.databaseTablePlan || DEFAULT_DATABASE_TABLE_PLAN).map(normalizeDatabaseTablePlanItem));
    write(KEYS.ADMIN_SECURITY, backup.adminSecurity || getDefaultAdminSecurity());
    return { success: true };
  } catch (e) {
    console.error('Backup import failed', e);
    return { success: false, error: e.message };
  }
};
