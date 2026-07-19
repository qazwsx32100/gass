import React, { useEffect, useState, useMemo } from 'react';
import {
  getIncomes, saveIncomes,
  getExpenses, saveExpenses,
  getShareholderLedger, saveShareholderLedger,
  getLoans, saveLoans,
  getGasInventoryPeriods, saveGasInventoryPeriods,
  getGasCylinders, saveGasCylinders,
  getGasCylinderMovements, saveGasCylinderMovements,
  getGasDeliveryVehicles, saveGasDeliveryVehicles,
  getCustomerCylinderDeposits, saveCustomerCylinderDeposits,
  getBankTransactions, saveBankTransactions,
  getBankReconciliations, saveBankReconciliations,
  getFixedAssets, saveFixedAssets,
  getLogs, addLog,
  getShareholders, getBanks, getChartOfAccounts, getCustomers, getSuppliers,
  USER_ROLES,
  archiveChange, archiveDeletion,
  isPeriodLocked
} from '../db/storage';
import {
  canInputBasicLedger,
  canManageShareholderLedger,
  canReviewLedger,
  canViewAuditLogs,
  canViewCreatorAudit,
  canViewLoans,
  canViewShareholderLedger,
  canVoidLedger
} from '../utils/permissions';
import {
  buildBankReconciliation,
  getAgingReport,
  getFixedAssetSummary,
  getGasInventoryForMonth,
  parseBankStatementText
} from '../utils/financials';
import {
  getCloudAttachmentUrl,
  revokeCloudAttachmentUrl,
  uploadCloudAttachment
} from '../db/attachmentService';

const STATUS_LABELS = {
  draft: '草稿',
  pending_admin_review: '待管理員審核',
  pending_business_review: '待審核管理者審核',
  pending_second_admin_review: '待第二管理員覆核',
  approved: '已核准',
  returned: '已退回',
  void: '已作廢'
};

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: '現金' },
  { value: 'bank_transfer', label: '銀行轉帳' },
  { value: 'check', label: '支票' },
  { value: 'receivable', label: '應收款' },
  { value: 'payable', label: '應付款' },
  { value: 'other', label: '其他' }
];

const getPaymentMethodLabel = (method) => {
  const value = method || 'cash';
  return PAYMENT_METHOD_OPTIONS.find(option => option.value === value)?.label || value;
};

const GAS_CYLINDER_STATUS_OPTIONS = [
  { value: 'empty', label: '空瓶' },
  { value: 'full', label: '實瓶' },
  { value: 'residual', label: '殘氣' },
  { value: 'maintenance', label: '維修中' },
  { value: 'scrapped', label: '報廢' }
];

const GAS_LOCATION_OPTIONS = [
  { value: 'warehouse', label: '倉庫' },
  { value: 'vehicle', label: '配送車' },
  { value: 'customer', label: '客戶' },
  { value: 'filling_station', label: '分裝廠' },
  { value: 'maintenance_vendor', label: '維修廠' }
];

const GAS_OWNERSHIP_OPTIONS = [
  { value: 'owned', label: '自有瓶' },
  { value: 'leased', label: '租賃瓶' },
  { value: 'customer_owned', label: '客戶瓶' },
  { value: 'supplier_owned', label: '供應商瓶' }
];

const GAS_DEPOSIT_STATUS_OPTIONS = [
  { value: 'active', label: '押瓶中' },
  { value: 'returned', label: '已退瓶' },
  { value: 'disputed', label: '爭議' },
  { value: 'lost', label: '遺失' }
];

const GAS_MOVEMENT_TYPE_OPTIONS = [
  { value: 'inbound', label: '入庫' },
  { value: 'load_vehicle', label: '裝車' },
  { value: 'deliver_customer', label: '配送給客戶' },
  { value: 'return_from_customer', label: '客戶退瓶' },
  { value: 'return_to_warehouse', label: '車輛回庫' },
  { value: 'send_maintenance', label: '送檢 / 維修' },
  { value: 'scrap', label: '報廢' },
  { value: 'manual_adjustment', label: '人工調整' }
];

const optionLabel = (options, value) => options.find(option => option.value === value)?.label || value || '-';
const GAS_OPERATION_TABS = ['gasCylinders', 'gasVehicles', 'gasDeposits', 'gasMovements'];

const getStoredPaymentMethod = (item) => item.paymentMethod || (item.bankId ? 'bank_transfer' : 'cash');

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatusBadgeClass = (status) => {
  if (status === 'approved') return 'approved';
  if (status === 'void' || status === 'returned') return 'void';
  if (status === 'draft') return 'draft';
  return 'pending';
};

export default function InputsView({ companyId, triggerRefresh, onDataChange, operatorName = '未知使用者', currentUser, userRole }) {
  const [activeSubTab, setActiveSubTab] = useState(() => {
    const saved = sessionStorage.getItem('inputsActiveSubTab');
    if (saved) {
      sessionStorage.removeItem('inputsActiveSubTab');
      return saved;
    }
    return 'income';
  }); // income, expense, shareholder, loan, log, checks
  const isAdmin = userRole === USER_ROLES.ADMIN;
  const canReview = canReviewLedger(userRole);
  const canWriteBasicLedger = canInputBasicLedger(userRole);
  const showCreatorAudit = canViewCreatorAudit(userRole);
  const showShareholderLedger = canViewShareholderLedger(userRole);
  const manageShareholderLedger = canManageShareholderLedger(userRole);
  const showLoans = canViewLoans(userRole);
  const showAuditLogs = canViewAuditLogs(userRole);
  const allowVoid = canVoidLedger(userRole);
  const getRecordPeriod = (item = formData, tab = activeSubTab) => {
    if (tab === 'gas') return item.yearMonth;
    if (GAS_OPERATION_TABS.includes(tab)) return item.movementDate || item.startedAt || item.date || new Date().toISOString().split('T')[0];
    if (tab === 'loan') return item.startDate;
    if (tab === 'assets') return item.acquisitionDate;
    return item.date;
  };
  const blockIfPeriodLocked = (dateOrYearMonth, actionLabel = '新增') => {
    if (!isPeriodLocked(companyId, dateOrYearMonth)) return false;
    window.alert(`此月份已鎖帳，不能${actionLabel}。請改用更正沖銷或請系統管理員重新開放月份。`);
    return true;
  };
  const getDailySalesSummaries = () => {
    const allIncomes = getIncomes().filter(item => item.companyId === companyId && item.status === 'approved');
    const allBankTransactions = getBankTransactions().filter(item => item.companyId === companyId && item.status === 'approved');

    const summaryByDate = {};

    allIncomes.forEach(inc => {
      if (inc.remarks && inc.remarks.startsWith('當日營業彙總 - ')) {
        const date = inc.date;
        if (!summaryByDate[date]) {
          summaryByDate[date] = {
            date,
            salesAmount: 0,
            paidAmount: 0,
            arAmount: 0,
            unpaidAmount: 0,
            totalCylinders: 0,
            totalWeight: 0,
            stoveIncome: 0,
            repairIncome: 0,
            cylinderIncome: 0,
            inspectionIncome: 0,
            depositIncome: 0,
            repaymentAmount: 0
          };
        }

        if (inc.remarks === '當日營業彙總 - 現收') {
          summaryByDate[date].paidAmount = Number(inc.amount || 0);
          summaryByDate[date].totalCylinders = Number(inc.cylinderQty || 0);
          summaryByDate[date].totalWeight = Number(inc.gasKg || 0);
        } else if (inc.remarks === '當日營業彙總 - 月結') {
          summaryByDate[date].arAmount = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 賒欠') {
          summaryByDate[date].unpaidAmount = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 爐具收入') {
          summaryByDate[date].stoveIncome = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 維修收入') {
          summaryByDate[date].repairIncome = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 買桶收入') {
          summaryByDate[date].cylinderIncome = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 檢驗費收入') {
          summaryByDate[date].inspectionIncome = Number(inc.amount || 0);
        } else if (inc.remarks === '當日營業彙總 - 押瓶收入') {
          summaryByDate[date].depositIncome = Number(inc.amount || 0);
        }
      }
    });

    allBankTransactions.forEach(bt => {
      if (bt.remarks && bt.remarks.startsWith('當日營業彙總 - ')) {
        const date = bt.date;
        if (!summaryByDate[date]) {
          summaryByDate[date] = {
            date,
            salesAmount: 0,
            paidAmount: 0,
            arAmount: 0,
            unpaidAmount: 0,
            totalCylinders: 0,
            totalWeight: 0,
            stoveIncome: 0,
            repairIncome: 0,
            cylinderIncome: 0,
            inspectionIncome: 0,
            depositIncome: 0,
            repaymentAmount: 0
          };
        }

        if (bt.remarks === '當日營業彙總 - 還款') {
          summaryByDate[date].repaymentAmount = Number(bt.amount || 0);
        }
      }
    });

    return Object.values(summaryByDate).map(s => {
      s.gasTotalIncome = s.paidAmount + s.arAmount + s.unpaidAmount;
      s.avgPrice = s.totalWeight > 0 ? s.gasTotalIncome / s.totalWeight : 0;
      s.salesAmount = s.gasTotalIncome + s.repaymentAmount + s.stoveIncome + s.repairIncome + s.cylinderIncome + s.inspectionIncome + (s.depositIncome || 0);
      return s;
    }).sort((a, b) => b.date.localeCompare(a.date));
  };
  useEffect(() => {
    if (activeSubTab === 'shareholder' && !showShareholderLedger) setActiveSubTab('income');
    if (activeSubTab === 'loan' && !showLoans) setActiveSubTab('income');
    if (activeSubTab === 'log' && !showAuditLogs) setActiveSubTab('income');
    if (activeSubTab === 'gas' && !canWriteBasicLedger) setActiveSubTab('income');
    if (GAS_OPERATION_TABS.includes(activeSubTab) && !canWriteBasicLedger) setActiveSubTab('income');
  }, [activeSubTab, showShareholderLedger, showLoans, showAuditLogs, canWriteBasicLedger]);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // If null, we are adding new
  const [detailItem, setDetailItem] = useState(null);

  const handleRowClick = (e, item, type) => {
    if (
      e.target.closest('button') ||
      e.target.closest('a') ||
      e.target.closest('input') ||
      e.target.closest('select') ||
      e.target.closest('.btn') ||
      e.target.tagName === 'BUTTON' ||
      e.target.tagName === 'A'
    ) {
      return;
    }
    setDetailItem({ type, item });
  };

  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [clearingItem, setClearingItem] = useState(null);
  const [clearData, setClearData] = useState({
    method: 'bank_transfer',
    bankId: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [checkTypeFilter, setCheckTypeFilter] = useState('all');
  const [checkStatusFilter, setCheckStatusFilter] = useState('all');
  const [agingAsOfDate, setAgingAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementText, setStatementText] = useState('');
  const [reconciliationBankId, setReconciliationBankId] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(new Date().toISOString().split('T')[0]);
  const [assetAsOfDate, setAssetAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => () => revokeCloudAttachmentUrl(viewingReceiptUrl), [viewingReceiptUrl]);

  const closeReceiptPreview = () => {
    revokeCloudAttachmentUrl(viewingReceiptUrl);
    setViewingReceiptUrl(null);
  };

  const openReceiptPreview = async (attachment) => {
    try {
      const url = await getCloudAttachmentUrl(attachment);
      setViewingReceiptUrl(url);
    } catch (error) {
      window.alert(error.message || '附件讀取失敗。');
    }
  };

  const checkItems = useMemo(() => {
    const incs = getIncomes().filter(i => 
      i.companyId === companyId && 
      i.paymentMethod === 'check' && 
      i.status === 'approved' &&
      i.correctionStatus !== 'corrected' &&
      i.correctionType !== 'reversal'
    );
    const exps = getExpenses().filter(e => 
      e.companyId === companyId && 
      e.paymentMethod === 'check' && 
      e.status === 'approved' &&
      e.correctionStatus !== 'corrected' &&
      e.correctionType !== 'reversal'
    );

    const all = [
      ...incs.map(i => ({ ...i, type: 'income', label: '應收支票' })),
      ...exps.map(e => ({ ...e, type: 'expense', label: '應付支票' }))
    ];

    return all.filter(item => {
      const typeMatch = checkTypeFilter === 'all' 
        ? true 
        : checkTypeFilter === 'receivable' 
          ? item.type === 'income' 
          : item.type === 'expense';
      const statusMatch = checkStatusFilter === 'all' 
        ? true 
        : item.paymentStatus === checkStatusFilter;
      return typeMatch && statusMatch;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [companyId, checkTypeFilter, checkStatusFilter, triggerRefresh]);

  const handleOpenClearModal = (item) => {
    setClearingItem(item);
    setClearData({
      method: item.paymentMethod === 'check' ? 'check' : 'bank_transfer',
      bankId: item.bankId || banks[0]?.id || '',
      date: new Date().toISOString().split('T')[0]
    });
  };

  const handleClearSubmit = (e) => {
    e.preventDefault();
    if (!clearingItem) return;
    if (blockIfPeriodLocked(clearData.date, '結清入帳')) return;

    const isIncome = clearingItem.type === 'income';
    const db = isIncome ? getIncomes() : getExpenses();
    const index = db.findIndex(x => x.id === clearingItem.id);
    if (index === -1) return;

    const before = { ...db[index] };
    const isClearingCheck = clearingItem.paymentMethod === 'check';
    const settlementId = `SET${Date.now()}`;
    let targetBankName = '';
    let methodLabel = '';
    let settlementMethod = clearData.method;
    let settlementBankId = '';

    if (isClearingCheck) {
      targetBankName = getBankName(clearData.bankId) || '未指定銀行';
      settlementMethod = 'bank_transfer';
      settlementBankId = clearData.bankId;
    } else {
      methodLabel = PAYMENT_METHOD_OPTIONS.find(o => o.value === clearData.method)?.label || clearData.method;
      targetBankName = clearData.method === 'bank_transfer' ? getBankName(clearData.bankId) : '現金';
      settlementBankId = clearData.method === 'bank_transfer' ? clearData.bankId : (clearData.method === 'cash' ? 'BANK_PETTY' : '');
    }

    db[index] = {
      ...db[index],
      paymentStatus: 'paid',
      paidAt: clearData.date,
      paidByMethod: settlementMethod,
      paidBankId: settlementBankId,
      settlementId,
      remarks: `${db[index].remarks || ''} (${clearData.date} ${isClearingCheck ? '支票兌現入帳' : `以 ${methodLabel} 結清`}：${targetBankName})`.trim()
    };

    const bankTransactions = getBankTransactions();
    bankTransactions.push({
      id: settlementId,
      companyId,
      bankId: settlementBankId,
      date: clearData.date,
      direction: isIncome ? 'in' : 'out',
      transactionType: isIncome ? 'income' : 'expense',
      sourceType: 'settlement',
      sourceId: clearingItem.id,
      paymentMethod: settlementMethod,
      amount: Number(clearingItem.amount || 0),
      counterpartyName: clearingItem.counterpartyName || '',
      remarks: isClearingCheck ? `支票 ${clearingItem.checkNo || clearingItem.id} 兌現` : `結清 ${clearingItem.id}`,
      createdBy: currentUser?.id || 'SYSTEM',
      createdByName: operatorName,
      createdAt: new Date().toISOString()
    });

    if (isIncome) saveIncomes(db);
    else saveExpenses(db);
    saveBankTransactions(bankTransactions);

    archiveChange({
      collection: isIncome ? 'incomes' : 'expenses',
      recordId: clearingItem.id,
      action: isClearingCheck ? 'clear_check' : 'clear_payment',
      before,
      after: db[index],
      actor: operatorName,
      reason: isClearingCheck ? '支票兌現' : '結清應收應付'
    });

    addLog(operatorName, isClearingCheck ? '支票兌現' : '結清應收應付', `資料 ${clearingItem.id} 已結清，金額 $${clearingItem.amount.toLocaleString()}。`);
    setClearingItem(null);
    onDataChange();
  };
  // Common lookups
  const shareholders = useMemo(() => getShareholders(), [triggerRefresh]);
  const banks = useMemo(() => getBanks().filter(b => b.companyId === companyId), [companyId, triggerRefresh]);
  const accounts = useMemo(() => getChartOfAccounts(), [triggerRefresh]);
  const customers = useMemo(() => getCustomers().filter(c => c.companyId === companyId && c.status !== 'inactive'), [companyId, triggerRefresh]);
  const suppliers = useMemo(() => getSuppliers().filter(s => s.companyId === companyId && s.status !== 'inactive'), [companyId, triggerRefresh]);
  const auditLogs = useMemo(() => getLogs(), [triggerRefresh]);
  const bankReconciliations = useMemo(() => getBankReconciliations().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasCylinders = useMemo(() => getGasCylinders().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasCylinderMovements = useMemo(() => getGasCylinderMovements().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const gasDeliveryVehicles = useMemo(() => getGasDeliveryVehicles().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const customerCylinderDeposits = useMemo(() => getCustomerCylinderDeposits().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const agingReport = useMemo(() => getAgingReport(companyId, agingAsOfDate), [companyId, agingAsOfDate, triggerRefresh]);
  const fixedAssetSummary = useMemo(() => getFixedAssetSummary(companyId, assetAsOfDate), [companyId, assetAsOfDate, triggerRefresh]);
  const parsedStatementRows = useMemo(() => parseBankStatementText(statementText), [statementText]);
  const reconciliationPreview = useMemo(() => buildBankReconciliation({
    companyId,
    bankId: reconciliationBankId || banks[0]?.id || '',
    statementDate: reconciliationDate,
    statementRows: parsedStatementRows
  }), [companyId, reconciliationBankId, reconciliationDate, parsedStatementRows, banks]);

  useEffect(() => {
    if (!reconciliationBankId && banks[0]?.id) setReconciliationBankId(banks[0].id);
  }, [banks, reconciliationBankId]);

  const revenueAccounts = useMemo(() => accounts.filter(a => a.type === 'revenue'), [accounts]);
  const cogsExpenseAccounts = useMemo(() => accounts.filter(a => a.type === 'cogs' || a.type === 'expense'), [accounts]);
  const gasInventoryStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const activeDeposits = customerCylinderDeposits.filter(item => item.depositStatus === 'active');
    return {
      total: gasCylinders.length,
      warehouse: gasCylinders.filter(item => item.locationType === 'warehouse').length,
      vehicle: gasCylinders.filter(item => item.locationType === 'vehicle').length,
      customer: gasCylinders.filter(item => item.locationType === 'customer').length,
      full: gasCylinders.filter(item => item.status === 'full').length,
      empty: gasCylinders.filter(item => item.status === 'empty').length,
      activeDeposits: activeDeposits.length,
      overdueInspection: gasCylinders.filter(item => item.inspectionDueDate && item.inspectionDueDate < today && item.status !== 'scrapped').length
    };
  }, [gasCylinders, customerCylinderDeposits]);

  // Form States
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    unitPrice: '',
    quantity: '',
    calculatedAmount: 0,
    accountCode: '',
    bankId: '',
    paymentMethod: 'cash',
    checkNo: '',
    checkDueDate: '',
    customerId: '',
    supplierId: '',
    counterpartyName: '',
    remarks: '',
    status: 'pending_admin_review',
    receiptAttachment: '',
    paymentStatus: 'paid',
    dueDate: '',
    gasKg: '',
    cylinderQty: '',
    deliveryTrips: '',
    customerType: '',
    yearMonth: new Date().toISOString().slice(0, 7),
    openingKg: '',
    openingCost: '',
    purchaseKg: '',
    purchaseAmount: '',
    shrinkageKg: '',
    physicalEndingKg: '',
    cylinderNo: '',
    barcode: '',
    qrCode: '',
    specKg: '20',
    ownershipStatus: 'owned',
    locationType: 'warehouse',
    locationId: '',
    vehicleId: '',
    depositAmount: '',
    lastInspectionDate: '',
    nextInspectionDate: '',
    inspectionDueDate: '',
    movementDate: new Date().toISOString().split('T')[0],
    movementType: 'manual_adjustment',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    cylinderId: '',
    cylinderSpecKg: '',
    depositStatus: 'active',
    startedAt: new Date().toISOString().split('T')[0],
    returnedAt: '',
    plateNo: '',
    driverName: '',
    capacityCylinders: '',
    capacityKg: '',
    active: true,
    // Shareholder specific
    shareholderId: '',
    type: 'increase', // join, increase, decrease
    // Loan specific
    name: '',
    principal: '',
    interestRate: '',
    months: '',
    startDate: new Date().toISOString().split('T')[0],
    monthlyPayment: '',
    assetName: '',
    category: 'truck',
    acquisitionDate: new Date().toISOString().split('T')[0],
    acquisitionCost: '',
    usefulLifeMonths: '60',
    residualValue: '',
    depreciationMethod: 'straight_line',
    disposalDate: '',
    disposalAmount: ''
  });

  // Combined unpaid AR/AP items
  const unpaidArapItems = useMemo(() => {
    const incomes = getIncomes().filter(i => 
      i.companyId === companyId && 
      i.paymentStatus === 'unpaid' && 
      i.status === 'approved' &&
      i.correctionStatus !== 'corrected' &&
      i.correctionType !== 'reversal'
    );
    const expenses = getExpenses().filter(e => 
      e.companyId === companyId && 
      e.paymentStatus === 'unpaid' && 
      e.status === 'approved' &&
      e.correctionStatus !== 'corrected' &&
      e.correctionType !== 'reversal'
    );
    
    const combined = [
      ...incomes.map(i => ({ ...i, type: 'income' })),
      ...expenses.map(e => ({ ...e, type: 'expense' }))
    ];
    combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    return combined;
  }, [companyId, triggerRefresh]);

  // Load items based on active sub tab
  const items = useMemo(() => {
    if (activeSubTab === 'income') {
      const rows = getIncomes().filter(i => 
        i.companyId === companyId &&
        i.correctionStatus !== 'corrected' &&
        i.correctionType !== 'reversal'
      );
      const filtered = userRole === USER_ROLES.BOOKKEEPER ? rows.filter(i => !i.createdBy || i.createdBy === currentUser?.id) : rows;
      return filtered.sort((a, b) => {
        const dateComp = (b.date || '').localeCompare(a.date || '');
        if (dateComp !== 0) return dateComp;
        return (b.id || '').localeCompare(a.id || '');
      });
    }
    if (activeSubTab === 'expense') {
      const rows = getExpenses().filter(e => 
        e.companyId === companyId &&
        e.correctionStatus !== 'corrected' &&
        e.correctionType !== 'reversal'
      );
      const filtered = userRole === USER_ROLES.BOOKKEEPER ? rows.filter(e => !e.createdBy || e.createdBy === currentUser?.id) : rows;
      return filtered.sort((a, b) => {
        const dateComp = (b.date || '').localeCompare(a.date || '');
        if (dateComp !== 0) return dateComp;
        return (b.id || '').localeCompare(a.id || '');
      });
    }
    if (activeSubTab === 'gas') return getGasInventoryPeriods().filter(item => item.companyId === companyId).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    if (activeSubTab === 'gasCylinders') return gasCylinders.sort((a, b) => String(a.cylinderNo || '').localeCompare(String(b.cylinderNo || '')));
    if (activeSubTab === 'gasVehicles') return gasDeliveryVehicles.sort((a, b) => String(a.plateNo || a.id).localeCompare(String(b.plateNo || b.id)));
    if (activeSubTab === 'gasDeposits') return customerCylinderDeposits.sort((a, b) => new Date(b.startedAt || b.createdAt) - new Date(a.startedAt || a.createdAt));
    if (activeSubTab === 'gasMovements') return gasCylinderMovements.sort((a, b) => new Date(b.createdAt || b.movementDate) - new Date(a.createdAt || a.movementDate));
    if (activeSubTab === 'assets') return getFixedAssets().filter(item => item.companyId === companyId).sort((a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate));
    if (activeSubTab === 'shareholder') return getShareholderLedger().filter(s => s.companyId === companyId);
    if (activeSubTab === 'loan') return getLoans().filter(l => l.companyId === companyId);
    if (activeSubTab === 'dailySummary') return getDailySalesSummaries();
    return [];
  }, [activeSubTab, companyId, triggerRefresh, userRole, currentUser, gasCylinders, gasDeliveryVehicles, customerCylinderDeposits, gasCylinderMovements]);

  // Generate Unique ID
  const generateId = (type, date) => {
    const datePrefix = date ? date.replace(/-/g, '').substring(0, 6) : new Date().toISOString().replace(/-/g, '').substring(0, 6);
    const prefix = {
      income: `REV${datePrefix}`,
      expense: `EXP${datePrefix}`,
      gas: `GAS${datePrefix}`,
      gasCylinder: `CYL${datePrefix}`,
      gasVehicle: `VEH${datePrefix}`,
      gasDeposit: `DEP${datePrefix}`,
      gasMovement: `MOV${datePrefix}`,
      shareholder: `SHL${datePrefix}`,
      loan: 'LOAN',
      asset: `AST${datePrefix}`
    }[type];

    // Find highest sequence number
    let list = [];
    if (type === 'income') list = getIncomes();
    if (type === 'expense') list = getExpenses();
    if (type === 'gas') list = getGasInventoryPeriods();
    if (type === 'gasCylinder') list = getGasCylinders();
    if (type === 'gasVehicle') list = getGasDeliveryVehicles();
    if (type === 'gasDeposit') list = getCustomerCylinderDeposits();
    if (type === 'gasMovement') list = getGasCylinderMovements();
    if (type === 'shareholder') list = getShareholderLedger();
    if (type === 'loan') list = getLoans();
    if (type === 'asset') list = getFixedAssets();

    const matches = list
      .map(item => item.id)
      .filter(id => id && id.startsWith(prefix));
    
    if (matches.length === 0) {
      return `${prefix}001`;
    }

    const seqs = matches.map(id => parseInt(id.replace(prefix, ''), 10));
    const nextSeq = Math.max(...seqs) + 1;
    return `${prefix}${String(nextSeq).padStart(3, '0')}`;
  };

  // Open modal to add
  const handleOpenAdd = () => {
    setEditingItem(null);
    setAttachmentPreviewUrl('');
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      unitPrice: '',
      quantity: '',
      calculatedAmount: 0,
      accountCode: activeSubTab === 'income' 
        ? (revenueAccounts[0]?.code || '') 
        : (cogsExpenseAccounts[0]?.code || ''),
      bankId: activeSubTab === 'loan' ? (banks[0]?.id || '') : '',
      paymentMethod: 'cash',
      checkNo: '',
      checkDueDate: '',
      customerId: '',
      supplierId: '',
      counterpartyName: '',
      invoiceNo: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      counterpartyTaxId: '',
      taxType: 'taxable',
      taxIncluded: true,
      vatAmount: '',
      employeeName: '',
      payrollMonth: new Date().toISOString().slice(0, 7),
      laborInsurance: '',
      healthInsurance: '',
      pension: '',
      withholdingTax: '',
      remarks: '',
      status: activeSubTab === 'gasCylinders' ? 'empty' : activeSubTab === 'assets' ? 'active' : 'pending_admin_review',
      gasKg: '',
      cylinderQty: '',
      deliveryTrips: '',
      customerType: '',
      yearMonth: new Date().toISOString().slice(0, 7),
      openingKg: '',
      openingCost: '',
      purchaseKg: '',
      purchaseAmount: '',
      shrinkageKg: '',
      physicalEndingKg: '',
      cylinderNo: '',
      barcode: '',
      qrCode: '',
      specKg: '20',
      ownershipStatus: 'owned',
      locationType: 'warehouse',
      locationId: '',
      vehicleId: '',
      depositAmount: '',
      lastInspectionDate: '',
      nextInspectionDate: '',
      inspectionDueDate: '',
      movementDate: new Date().toISOString().split('T')[0],
      movementType: 'manual_adjustment',
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      cylinderId: '',
      cylinderSpecKg: '',
      depositStatus: 'active',
      startedAt: new Date().toISOString().split('T')[0],
      returnedAt: '',
      plateNo: '',
      driverName: '',
      capacityCylinders: '',
      capacityKg: '',
      active: true,
      shareholderId: shareholders[0]?.id || '',
      type: 'increase',
      name: '',
      principal: '',
      interestRate: '2.1',
      months: '36',
      startDate: new Date().toISOString().split('T')[0],
      monthlyPayment: '',
      assetName: '',
      category: 'truck',
      acquisitionDate: new Date().toISOString().split('T')[0],
      acquisitionCost: '',
      usefulLifeMonths: '60',
      residualValue: '',
      depreciationMethod: 'straight_line',
      disposalDate: '',
      disposalAmount: '',
      // dailySummary fields
      paidAmount: '',
      arAmount: '',
      unpaidAmount: '',
      repaymentAmount: '',
      totalCylinders: '',
      totalWeight: '',
      stoveIncome: '',
      repairIncome: '',
      cylinderIncome: '',
      inspectionIncome: '',
      depositIncome: ''
    });
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setAttachmentPreviewUrl(typeof item.receiptAttachment === 'string' ? item.receiptAttachment : '');
    setFormData({
      ...formData,
      ...item,
      status: item.status === 'returned' ? 'pending_admin_review' : item.status,
      amount: item.amount || '',
      unitPrice: item.unitPrice || '',
      quantity: item.quantity || '',
      calculatedAmount: item.calculatedAmount || 0,
      gasKg: item.gasKg || '',
      cylinderQty: item.cylinderQty || '',
      deliveryTrips: item.deliveryTrips || '',
      customerType: item.customerType || '',
      yearMonth: item.yearMonth || new Date().toISOString().slice(0, 7),
      openingKg: item.openingKg ?? '',
      openingCost: item.openingCost ?? '',
      purchaseKg: item.purchaseKg ?? '',
      purchaseAmount: item.purchaseAmount ?? '',
      shrinkageKg: item.shrinkageKg ?? '',
      physicalEndingKg: item.physicalEndingKg ?? '',
      cylinderNo: item.cylinderNo || '',
      barcode: item.barcode || '',
      qrCode: item.qrCode || '',
      specKg: item.specKg || '',
      ownershipStatus: item.ownershipStatus || 'owned',
      locationType: item.locationType || 'warehouse',
      locationId: item.locationId || '',
      vehicleId: item.vehicleId || '',
      depositAmount: item.depositAmount || '',
      lastInspectionDate: item.lastInspectionDate || '',
      nextInspectionDate: item.nextInspectionDate || '',
      inspectionDueDate: item.inspectionDueDate || '',
      movementDate: item.movementDate || new Date().toISOString().split('T')[0],
      movementType: item.movementType || 'manual_adjustment',
      customerName: item.customerName || '',
      customerPhone: item.customerPhone || '',
      customerAddress: item.customerAddress || '',
      cylinderId: item.cylinderId || '',
      cylinderSpecKg: item.cylinderSpecKg || '',
      depositStatus: item.depositStatus || 'active',
      startedAt: item.startedAt || new Date().toISOString().split('T')[0],
      returnedAt: item.returnedAt || '',
      plateNo: item.plateNo || '',
      driverName: item.driverName || '',
      capacityCylinders: item.capacityCylinders || '',
      capacityKg: item.capacityKg || '',
      active: item.active ?? true,
      paymentMethod: getStoredPaymentMethod(item),
      checkNo: item.checkNo || '',
      checkDueDate: item.checkDueDate || '',
      customerId: item.customerId || '',
      supplierId: item.supplierId || '',
      counterpartyName: item.counterpartyName || '',
      invoiceNo: item.invoiceNo || '',
      invoiceDate: item.invoiceDate || item.date || '',
      counterpartyTaxId: item.counterpartyTaxId || '',
      taxType: item.taxType || 'taxable',
      taxIncluded: item.taxIncluded ?? true,
      vatAmount: item.vatAmount ?? '',
      employeeName: item.employeeName || '',
      payrollMonth: item.payrollMonth || String(item.date || '').slice(0, 7),
      laborInsurance: item.laborInsurance || '',
      healthInsurance: item.healthInsurance || '',
      pension: item.pension || '',
      withholdingTax: item.withholdingTax || '',
      principal: item.principal || '',
      interestRate: item.interestRate || '',
      months: item.months || '',
      monthlyPayment: item.monthlyPayment || '',
      assetName: item.assetName || '',
      category: item.category || 'truck',
      acquisitionDate: item.acquisitionDate || new Date().toISOString().split('T')[0],
      acquisitionCost: item.acquisitionCost || '',
      usefulLifeMonths: item.usefulLifeMonths || '60',
      residualValue: item.residualValue || '',
      disposalDate: item.disposalDate || '',
      disposalAmount: item.disposalAmount || '',
      cylinderIncome: item.cylinderIncome ?? '',
      inspectionIncome: item.inspectionIncome ?? '',
      depositIncome: item.depositIncome ?? ''
    });
    setIsModalOpen(true);
  };

  const updateAmountCalculation = (changes) => {
    const next = { ...formData, ...changes };
    const unitPriceVal = parseFloat(next.unitPrice) || 0;
    const quantityVal = parseFloat(next.quantity) || 0;
    const calculatedAmount = unitPriceVal > 0 && quantityVal > 0 ? unitPriceVal * quantityVal : 0;

    setFormData({
      ...next,
      calculatedAmount,
      amount: calculatedAmount > 0 ? String(calculatedAmount) : next.amount
    });
  };

  const appendGasCylinderMovement = ({ before = null, after, movementType = 'manual_adjustment', remarks = '' }) => {
    if (!after?.id) return;
    const movementDate = formData.movementDate || new Date().toISOString().split('T')[0];
    const db = getGasCylinderMovements();
    const fromLocationType = before?.locationType || '';
    const fromLocationId = before?.locationId || before?.vehicleId || before?.customerId || '';
    const toLocationType = after.locationType || '';
    const toLocationId = after.locationId || after.vehicleId || after.customerId || '';

    db.push({
      id: generateId('gasMovement', movementDate),
      companyId,
      cylinderId: after.id,
      movementDate,
      movementType,
      fromLocationType,
      fromLocationId,
      toLocationType,
      toLocationId,
      customerId: after.customerId || '',
      vehicleId: after.vehicleId || '',
      operator: operatorName,
      remarks: remarks || formData.remarks || '',
      createdAt: new Date().toISOString()
    });
    saveGasCylinderMovements(db);
  };

  // Save form data
  const handleSave = (e) => {
    e.preventDefault();
    if (activeSubTab === 'dailySummary') {
      const targetDate = formData.date;

      if (blockIfPeriodLocked(targetDate, editingItem ? '修改資料' : '新增資料')) return;

      const currentIncomes = getIncomes();
      const currentBankTx = getBankTransactions();

      const originalDate = editingItem ? editingItem.date : targetDate;

      const filteredIncomes = currentIncomes.filter(item => 
        !(item.companyId === companyId && item.date === originalDate && item.remarks && item.remarks.startsWith('當日營業彙總 - '))
      );
      const filteredBankTx = currentBankTx.filter(item =>
        !(item.companyId === companyId && item.date === originalDate && item.remarks && item.remarks.startsWith('當日營業彙總 - '))
      );

      const createGenIncome = (amount, accountCode, remarks, qty = 0, kg = 0, status = 'paid', method = 'cash') => {
        const val = Number(amount) || 0;
        if (val <= 0) return null;
        return {
          id: `INC-GEN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyId,
          date: targetDate,
          accountCode,
          paymentMethod: method,
          paymentStatus: status,
          price: 0,
          qty: 0,
          cylinderQty: qty,
          gasKg: kg,
          amount: val,
          status: 'approved',
          operator: currentUser?.name || '系統自動生成',
          remarks,
          createdAt: new Date().toISOString()
        };
      };

      const newIncomes = [
        createGenIncome(formData.paidAmount, '4101', '當日營業彙總 - 現收', Number(formData.totalCylinders) || 0, Number(formData.totalWeight) || 0, 'paid', 'cash'),
        createGenIncome(formData.arAmount, '4101', '當日營業彙總 - 月結', 0, 0, 'unpaid', 'receivable'),
        createGenIncome(formData.unpaidAmount, '4101', '當日營業彙總 - 賒欠', 0, 0, 'unpaid', 'cash'),
        createGenIncome(formData.stoveIncome, '4104', '當日營業彙總 - 爐具收入', 0, 0, 'paid', 'cash'),
        createGenIncome(formData.repairIncome, '4102', '當日營業彙總 - 維修收入', 0, 0, 'paid', 'cash'),
        createGenIncome(formData.cylinderIncome, '4103', '當日營業彙總 - 買桶收入', 0, 0, 'paid', 'cash'),
        createGenIncome(formData.inspectionIncome, '4103', '當日營業彙總 - 檢驗費收入', 0, 0, 'paid', 'cash'),
        createGenIncome(formData.depositIncome, '4103', '當日營業彙總 - 押瓶收入', 0, 0, 'paid', 'cash')
      ].filter(Boolean);

      filteredIncomes.push(...newIncomes);

      const repaymentVal = Number(formData.repaymentAmount) || 0;
      if (repaymentVal > 0) {
        const defaultBank = getBanks().find(b => b.companyId === companyId) || { id: 'BANK001' };
        const newBankTx = {
          id: `BTX-GEN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyId,
          bankId: defaultBank.id,
          date: targetDate,
          direction: 'in',
          sourceType: 'settlement',
          amount: repaymentVal,
          status: 'approved',
          operator: currentUser?.name || '系統自動生成',
          remarks: '當日營業彙總 - 還款',
          createdAt: new Date().toISOString()
        };
        filteredBankTx.push(newBankTx);
      }

      saveIncomes(filteredIncomes);
      saveBankTransactions(filteredBankTx);
      onDataChange();
      setIsModalOpen(false);
      return;
    }
    if (blockIfPeriodLocked(getRecordPeriod(formData, activeSubTab), editingItem ? '修改資料' : '新增資料')) return;
    if (editingItem && blockIfPeriodLocked(getRecordPeriod(editingItem, activeSubTab), '修改原資料')) return;
    const unitPriceVal = parseFloat(formData.unitPrice) || 0;
    const quantityVal = parseFloat(formData.quantity) || 0;
    const calculatedAmountVal = unitPriceVal > 0 && quantityVal > 0 ? unitPriceVal * quantityVal : 0;
    const amountVal = parseFloat(formData.amount) || calculatedAmountVal || 0;
    const principalVal = parseFloat(formData.principal) || 0;
    const interestVal = parseFloat(formData.interestRate) || 0;
    const monthsVal = parseInt(formData.months, 10) || 0;
    const paymentVal = parseFloat(formData.monthlyPayment) || 0;
    const gasKgVal = parseFloat(formData.gasKg) || 0;
    const cylinderQtyVal = parseFloat(formData.cylinderQty) || 0;
    const deliveryTripsVal = parseFloat(formData.deliveryTrips) || 0;
    const acquisitionCostVal = parseFloat(formData.acquisitionCost) || 0;
    const usefulLifeMonthsVal = parseInt(formData.usefulLifeMonths, 10) || 0;
    const residualValueVal = parseFloat(formData.residualValue) || 0;
    const disposalAmountVal = parseFloat(formData.disposalAmount) || 0;
    const vatAmountVal = formData.vatAmount === '' ? null : parseFloat(formData.vatAmount) || 0;
    const paymentMethod = formData.paymentMethod || 'cash';
    const normalizedBankId = paymentMethod === 'bank_transfer' || activeSubTab === 'loan' ? formData.bankId : '';
    const paymentStatus = formData.paymentStatus || (['receivable', 'payable', 'check'].includes(paymentMethod) ? 'unpaid' : 'paid');
    const paymentFields = {
      paymentMethod,
      bankId: normalizedBankId,
      checkNo: paymentMethod === 'check' ? formData.checkNo : '',
      checkDueDate: paymentMethod === 'check' ? formData.checkDueDate : '',
      customerId: activeSubTab === 'income' ? formData.customerId || '' : '',
      supplierId: activeSubTab === 'expense' ? formData.supplierId || '' : '',
      counterpartyName: formData.counterpartyName || '',
      paymentStatus,
      dueDate: ['receivable', 'payable'].includes(paymentMethod) ? formData.dueDate || '' : '',
      receiptAttachment: formData.receiptAttachment || '',
      invoiceNo: formData.invoiceNo || '',
      invoiceDate: formData.invoiceDate || formData.date,
      counterpartyTaxId: formData.counterpartyTaxId || '',
      taxType: formData.taxType || 'taxable',
      taxIncluded: formData.taxIncluded ?? true,
      vatAmount: vatAmountVal,
      employeeName: formData.employeeName || '',
      payrollMonth: formData.payrollMonth || String(formData.date || '').slice(0, 7),
      laborInsurance: parseFloat(formData.laborInsurance) || 0,
      healthInsurance: parseFloat(formData.healthInsurance) || 0,
      pension: parseFloat(formData.pension) || 0,
      withholdingTax: parseFloat(formData.withholdingTax) || 0
    };
    const calculationFields = {
      unitPrice: unitPriceVal,
      quantity: quantityVal,
      calculatedAmount: calculatedAmountVal,
      gasKg: gasKgVal,
      cylinderQty: cylinderQtyVal,
      deliveryTrips: deliveryTripsVal,
      customerType: formData.customerType || ''
    };

    let success = false;
    const now = new Date().toISOString();
    const initialStatus = formData.status || 'pending_admin_review';
    const baseAuditFields = {
      status: initialStatus,
      createdBy: currentUser?.id || 'UNKNOWN',
      createdByName: currentUser?.name || operatorName,
      createdByRole: userRole || USER_ROLES.BOOKKEEPER,
      createdAt: now,
      firstReviewedBy: null,
      firstReviewedByName: null,
      firstReviewedByRole: null,
      firstReviewedAt: null,
      adminReviewedBy: initialStatus === 'approved' && isAdmin ? currentUser?.id || 'ADMIN' : null,
      adminReviewedByName: initialStatus === 'approved' && isAdmin ? currentUser?.name || operatorName : null,
      adminReviewedAt: initialStatus === 'approved' && isAdmin ? now : null,
      requiresDualApproval: false,
      secondAdminReviewedBy: null,
      secondAdminReviewedByName: null,
      secondAdminReviewedAt: null,
      returnedBy: null,
      returnedByName: null,
      returnedAt: null,
      returnReason: null,
      voidedBy: null,
      voidedByName: null,
      voidedAt: null,
      voidReason: null
    };

    if (activeSubTab === 'income') {
      const db = getIncomes();
      if (editingItem) {
        if (editingItem.status === 'approved' || editingItem.status === 'void') {
          window.alert('已核准或已作廢的收入不能直接修改，請使用更正沖銷流程。');
          return;
        }
        const index = db.findIndex(i => i.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], date: formData.date, accountCode: formData.accountCode, ...paymentFields, ...calculationFields, amount: amountVal, remarks: formData.remarks, status: formData.status };
          archiveChange({ collection: 'incomes', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '收入資料修改' });
          saveIncomes(db);
          addLog(operatorName, 'UPDATE_INCOME', `Update income ${editingItem.id}: $${editingItem.amount.toLocaleString()} -> $${amountVal.toLocaleString()}.`);
          success = true;
        }
      } else {
        const newId = generateId('income', formData.date);
        db.push({ id: newId, companyId, date: formData.date, accountCode: formData.accountCode, ...paymentFields, ...calculationFields, amount: amountVal, remarks: formData.remarks, ...baseAuditFields });
        saveIncomes(db);
        addLog(operatorName, 'CREATE_INCOME', `Create income ${newId}: $${amountVal.toLocaleString()}.`);
        success = true;
      }
    } else if (activeSubTab === 'expense') {
      const db = getExpenses();
      if (editingItem) {
        if (editingItem.status === 'approved' || editingItem.status === 'void') {
          window.alert('已核准或已作廢的支出不能直接修改，請使用更正沖銷流程。');
          return;
        }
        const index = db.findIndex(e => e.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], date: formData.date, accountCode: formData.accountCode, ...paymentFields, ...calculationFields, amount: amountVal, remarks: formData.remarks, status: formData.status };
          archiveChange({ collection: 'expenses', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '支出資料修改' });
          saveExpenses(db);
          addLog(operatorName, 'UPDATE_EXPENSE', `Update expense ${editingItem.id}: $${editingItem.amount.toLocaleString()} -> $${amountVal.toLocaleString()}.`);
          success = true;
        }
      } else {
        const newId = generateId('expense', formData.date);
        db.push({ id: newId, companyId, date: formData.date, accountCode: formData.accountCode, ...paymentFields, ...calculationFields, amount: amountVal, remarks: formData.remarks, ...baseAuditFields });
        saveExpenses(db);
        addLog(operatorName, 'CREATE_EXPENSE', `Create expense ${newId}: $${amountVal.toLocaleString()}.`);
        success = true;
      }
    } else if (activeSubTab === 'shareholder') {
      const db = getShareholderLedger();
      const typeLabel = formData.type === 'join' ? '入股' : formData.type === 'increase' ? '增資' : '減資/提領';
      const shName = shareholders.find(s => s.id === formData.shareholderId)?.name || '未知股東';
      
      if (editingItem) {
        const index = db.findIndex(s => s.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], date: formData.date, shareholderId: formData.shareholderId, type: formData.type, amount: amountVal, remarks: formData.remarks };
          archiveChange({ collection: 'shareholderLedger', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '股東往來修改' });
          saveShareholderLedger(db);
          addLog(operatorName, 'UPDATE_SHAREHOLDER_LEDGER', `Update shareholder ledger ${editingItem.id}: $${amountVal.toLocaleString()}.`);
          success = true;
        }
      } else {
        const newId = generateId('shareholder', formData.date);
        db.push({ id: newId, companyId, date: formData.date, shareholderId: formData.shareholderId, type: formData.type, amount: amountVal, remarks: formData.remarks });
        saveShareholderLedger(db);
        addLog(operatorName, 'CREATE_SHAREHOLDER_LEDGER', `Create shareholder ledger ${newId}: $${amountVal.toLocaleString()}.`);
        success = true;
      }
    } else if (activeSubTab === 'gas') {
      const db = getGasInventoryPeriods();
      const payload = {
        companyId,
        yearMonth: formData.yearMonth,
        openingKg: parseFloat(formData.openingKg) || 0,
        openingCost: parseFloat(formData.openingCost) || 0,
        purchaseKg: parseFloat(formData.purchaseKg) || 0,
        purchaseAmount: parseFloat(formData.purchaseAmount) || 0,
        shrinkageKg: parseFloat(formData.shrinkageKg) || 0,
        physicalEndingKg: formData.physicalEndingKg === '' ? null : parseFloat(formData.physicalEndingKg) || 0,
        remarks: formData.remarks,
        updatedAt: now
      };

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          const duplicated = db.some(item => item.id !== editingItem.id && item.companyId === companyId && item.yearMonth === payload.yearMonth);
          if (duplicated) {
            window.alert('此月份已存在瓦斯進貨設定，請改用原資料修改。');
            return;
          }
          db[index] = { ...db[index], ...payload };
          archiveChange({ collection: 'gasInventoryPeriods', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '瓦斯進貨設定修改' });
          saveGasInventoryPeriods(db);
          addLog(operatorName, 'UPDATE_GAS_INVENTORY', `Update gas inventory ${payload.yearMonth}: ${payload.purchaseKg.toLocaleString()} kg, $${payload.purchaseAmount.toLocaleString()}.`);
          success = true;
        }
      } else {
        if (db.some(item => item.companyId === companyId && item.yearMonth === payload.yearMonth)) {
          window.alert('此月份已存在瓦斯進貨設定，請改用修改。');
          return;
        }
        const newId = generateId('gas', `${payload.yearMonth}-01`);
        const newRecord = { id: newId, ...payload, createdAt: now };
        db.push(newRecord);
        saveGasInventoryPeriods(db);
        addLog(operatorName, 'CREATE_GAS_INVENTORY', `Create gas inventory ${payload.yearMonth}: ${payload.purchaseKg.toLocaleString()} kg, $${payload.purchaseAmount.toLocaleString()}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasCylinders') {
      const db = getGasCylinders();
      const movementDate = formData.movementDate || new Date().toISOString().split('T')[0];
      const selectedCustomer = customers.find(item => item.id === formData.customerId);
      const selectedVehicle = gasDeliveryVehicles.find(item => item.id === formData.vehicleId);
      const payload = {
        companyId,
        cylinderNo: String(formData.cylinderNo || '').trim(),
        barcode: String(formData.barcode || '').trim(),
        qrCode: String(formData.qrCode || '').trim(),
        specKg: parseFloat(formData.specKg) || 0,
        ownershipStatus: formData.ownershipStatus || 'owned',
        status: formData.status || 'empty',
        locationType: formData.locationType || 'warehouse',
        locationId: formData.locationType === 'vehicle'
          ? formData.vehicleId || ''
          : formData.locationType === 'customer'
            ? formData.customerId || ''
            : formData.locationId || '',
        customerId: formData.locationType === 'customer' ? formData.customerId || '' : '',
        customerName: formData.locationType === 'customer' ? selectedCustomer?.name || formData.customerName || '' : '',
        vehicleId: formData.locationType === 'vehicle' ? formData.vehicleId || '' : '',
        vehicleName: formData.locationType === 'vehicle' ? selectedVehicle?.plateNo || formData.vehicleId || '' : '',
        depositAmount: parseFloat(formData.depositAmount) || 0,
        lastInspectionDate: formData.lastInspectionDate || '',
        nextInspectionDate: formData.nextInspectionDate || '',
        inspectionDueDate: formData.inspectionDueDate || '',
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.cylinderNo) {
        window.alert('請輸入鋼瓶編號。');
        return;
      }

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          const duplicated = db.some(item => item.id !== editingItem.id && item.companyId === companyId && item.cylinderNo === payload.cylinderNo);
          if (duplicated) {
            window.alert('鋼瓶編號已存在，請確認是否重複建立。');
            return;
          }
          db[index] = { ...db[index], ...payload };
          saveGasCylinders(db);
          const locationChanged = editingItem.locationType !== db[index].locationType ||
            editingItem.locationId !== db[index].locationId ||
            editingItem.status !== db[index].status;
          if (locationChanged) {
            appendGasCylinderMovement({
              before: editingItem,
              after: db[index],
              movementType: formData.movementType || 'manual_adjustment',
              remarks: formData.remarks || `鋼瓶 ${payload.cylinderNo} 異動`
            });
          }
          archiveChange({ collection: 'gasCylinders', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '鋼瓶資料修改' });
          addLog(operatorName, 'UPDATE_GAS_CYLINDER', `Update gas cylinder ${payload.cylinderNo}.`);
          success = true;
        }
      } else {
        const duplicated = db.some(item => item.companyId === companyId && item.cylinderNo === payload.cylinderNo);
        if (duplicated) {
          window.alert('鋼瓶編號已存在，請確認是否重複建立。');
          return;
        }
        const newId = generateId('gasCylinder', movementDate);
        const newRecord = { id: newId, ...payload, createdAt: now };
        db.push(newRecord);
        saveGasCylinders(db);
        appendGasCylinderMovement({
          before: null,
          after: newRecord,
          movementType: formData.movementType || 'inbound',
          remarks: formData.remarks || `新增鋼瓶 ${payload.cylinderNo}`
        });
        addLog(operatorName, 'CREATE_GAS_CYLINDER', `Create gas cylinder ${payload.cylinderNo}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasVehicles') {
      const db = getGasDeliveryVehicles();
      const payload = {
        companyId,
        plateNo: String(formData.plateNo || '').trim(),
        name: formData.name || '',
        driverName: formData.driverName || '',
        capacityCylinders: parseInt(formData.capacityCylinders, 10) || 0,
        capacityKg: parseFloat(formData.capacityKg) || 0,
        active: formData.active ?? true,
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.plateNo) {
        window.alert('請輸入車牌號碼。');
        return;
      }

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          const duplicated = db.some(item => item.id !== editingItem.id && item.companyId === companyId && item.plateNo === payload.plateNo);
          if (duplicated) {
            window.alert('車牌號碼已存在，請確認是否重複建立。');
            return;
          }
          db[index] = { ...db[index], ...payload };
          saveGasDeliveryVehicles(db);
          archiveChange({ collection: 'gasDeliveryVehicles', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '配送車資料修改' });
          addLog(operatorName, 'UPDATE_GAS_VEHICLE', `Update gas delivery vehicle ${payload.plateNo}.`);
          success = true;
        }
      } else {
        const duplicated = db.some(item => item.companyId === companyId && item.plateNo === payload.plateNo);
        if (duplicated) {
          window.alert('車牌號碼已存在，請確認是否重複建立。');
          return;
        }
        const newId = generateId('gasVehicle', formData.date);
        db.push({ id: newId, ...payload, createdAt: now });
        saveGasDeliveryVehicles(db);
        addLog(operatorName, 'CREATE_GAS_VEHICLE', `Create gas delivery vehicle ${payload.plateNo}.`);
        success = true;
      }
    } else if (activeSubTab === 'gasDeposits') {
      const db = getCustomerCylinderDeposits();
      const cylinders = getGasCylinders();
      const selectedCylinder = cylinders.find(item => item.id === formData.cylinderId);
      const selectedCustomer = customers.find(item => item.id === formData.customerId);
      const payload = {
        companyId,
        customerId: formData.customerId || '',
        customerName: formData.customerName || selectedCustomer?.name || '',
        customerPhone: formData.customerPhone || selectedCustomer?.phone || '',
        customerAddress: formData.customerAddress || selectedCustomer?.address || '',
        cylinderId: formData.cylinderId || '',
        cylinderSpecKg: parseFloat(formData.cylinderSpecKg) || selectedCylinder?.specKg || 0,
        depositAmount: parseFloat(formData.depositAmount) || 0,
        depositStatus: formData.depositStatus || 'active',
        startedAt: formData.startedAt || new Date().toISOString().split('T')[0],
        returnedAt: formData.depositStatus === 'returned' ? formData.returnedAt || new Date().toISOString().split('T')[0] : formData.returnedAt || '',
        remarks: formData.remarks || '',
        updatedAt: now
      };

      if (!payload.customerName) {
        window.alert('請輸入客戶名稱。');
        return;
      }

      let savedDeposit = null;
      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], ...payload };
          savedDeposit = db[index];
          saveCustomerCylinderDeposits(db);
          archiveChange({ collection: 'customerCylinderDeposits', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '客戶押瓶修改' });
          addLog(operatorName, 'UPDATE_GAS_DEPOSIT', `Update customer cylinder deposit ${payload.customerName}.`);
          success = true;
        }
      } else {
        const newId = generateId('gasDeposit', payload.startedAt);
        savedDeposit = { id: newId, ...payload, createdAt: now };
        db.push(savedDeposit);
        saveCustomerCylinderDeposits(db);
        addLog(operatorName, 'CREATE_GAS_DEPOSIT', `Create customer cylinder deposit ${payload.customerName}.`);
        success = true;
      }

      if (savedDeposit?.cylinderId) {
        const cylinderIndex = cylinders.findIndex(item => item.id === savedDeposit.cylinderId);
        if (cylinderIndex !== -1) {
          const beforeCylinder = { ...cylinders[cylinderIndex] };
          if (savedDeposit.depositStatus === 'returned') {
            cylinders[cylinderIndex] = {
              ...cylinders[cylinderIndex],
              locationType: 'warehouse',
              locationId: '',
              customerId: '',
              customerName: '',
              vehicleId: '',
              status: 'empty',
              updatedAt: now
            };
          } else if (savedDeposit.depositStatus === 'active') {
            cylinders[cylinderIndex] = {
              ...cylinders[cylinderIndex],
              locationType: 'customer',
              locationId: savedDeposit.customerId || savedDeposit.customerName,
              customerId: savedDeposit.customerId || '',
              customerName: savedDeposit.customerName,
              vehicleId: '',
              depositAmount: savedDeposit.depositAmount,
              updatedAt: now
            };
          }
          saveGasCylinders(cylinders);
          appendGasCylinderMovement({
            before: beforeCylinder,
            after: cylinders[cylinderIndex],
            movementType: savedDeposit.depositStatus === 'returned' ? 'return_from_customer' : 'deliver_customer',
            remarks: savedDeposit.depositStatus === 'returned'
              ? `Customer ${savedDeposit.customerName} returned cylinder`
              : `Customer ${savedDeposit.customerName} cylinder deposit`
          });
        }
      }
    } else if (activeSubTab === 'loan') {
      const db = getLoans();
      if (editingItem) {
        const index = db.findIndex(l => l.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], name: formData.name, bankId: formData.bankId, principal: principalVal, interestRate: interestVal, months: monthsVal, startDate: formData.startDate, monthlyPayment: paymentVal, remarks: formData.remarks, status: formData.status };
          archiveChange({ collection: 'loans', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '貸款資料修改' });
          saveLoans(db);
          addLog(operatorName, 'UPDATE_LOAN', `Update loan ${editingItem.id} (${formData.name}): $${principalVal.toLocaleString()}.`);
          success = true;
        }
      } else {
        const newId = generateId('loan');
        db.push({ id: newId, companyId, name: formData.name, bankId: formData.bankId, principal: principalVal, interestRate: interestVal, months: monthsVal, startDate: formData.startDate, monthlyPayment: paymentVal, remarks: formData.remarks, status: formData.status });
        saveLoans(db);
        addLog(operatorName, 'CREATE_LOAN', `Create loan ${newId} (${formData.name}): $${principalVal.toLocaleString()}.`);
        success = true;
      }
    }

    if (activeSubTab === 'assets') {
      const db = getFixedAssets();
      const payload = {
        companyId,
        assetName: formData.assetName,
        category: formData.category,
        acquisitionDate: formData.acquisitionDate,
        acquisitionCost: acquisitionCostVal,
        usefulLifeMonths: usefulLifeMonthsVal,
        residualValue: residualValueVal,
        depreciationMethod: 'straight_line',
        status: formData.status || 'active',
        disposalDate: formData.disposalDate || '',
        disposalAmount: disposalAmountVal,
        remarks: formData.remarks,
        updatedAt: now
      };

      if (editingItem) {
        const index = db.findIndex(item => item.id === editingItem.id);
        if (index !== -1) {
          db[index] = { ...db[index], ...payload };
          archiveChange({ collection: 'fixedAssets', recordId: editingItem.id, action: 'update', before: editingItem, after: db[index], actor: operatorName, reason: '固定資產修改' });
          saveFixedAssets(db);
          addLog(operatorName, 'UPDATE_FIXED_ASSET', `Update fixed asset ${editingItem.id} (${formData.assetName}): $${acquisitionCostVal.toLocaleString()}.`);
          success = true;
        }
      } else {
        const newId = generateId('asset', formData.acquisitionDate);
        const newRecord = { id: newId, ...payload, createdAt: now };
        db.push(newRecord);
        saveFixedAssets(db);
        addLog(operatorName, 'CREATE_FIXED_ASSET', `Create fixed asset ${newId} (${formData.assetName}): $${acquisitionCostVal.toLocaleString()}.`);
        success = true;
      }
    }

    if (success) {
      setIsModalOpen(false);
      onDataChange(); // Trigger state refresh
    }
  };

  const updateReviewStatus = (id, nextStatus) => {
    const isIncome = activeSubTab === 'income';
    const db = isIncome ? getIncomes() : getExpenses();
    const index = db.findIndex(item => item.id === id);
    if (index === -1) return;

    const item = db[index];
    if (blockIfPeriodLocked(item.date, '審核資料')) return;
    const beforeItem = { ...item };
    const now = new Date().toISOString();
    const actor = currentUser?.name || operatorName;
    const actorId = currentUser?.id || 'UNKNOWN';

    if (nextStatus === 'approved') {
      db[index] = {
        ...item,
        status: 'approved',
        adminReviewedBy: isAdmin ? actorId : item.adminReviewedBy,
        adminReviewedByName: isAdmin ? actor : item.adminReviewedByName,
        adminReviewedAt: isAdmin ? now : item.adminReviewedAt,
        firstReviewedBy: !isAdmin ? actorId : item.firstReviewedBy,
        firstReviewedByName: !isAdmin ? actor : item.firstReviewedByName,
        firstReviewedByRole: !isAdmin ? userRole : item.firstReviewedByRole,
        firstReviewedAt: !isAdmin ? now : item.firstReviewedAt
      };
      addLog(actor, '核准資料', `已核准${isIncome ? '收入' : '支出'} ${id}，金額 $${item.amount.toLocaleString()}。`);
    } else if (nextStatus === 'returned') {
      const reason = window.prompt('請輸入退回原因。') || '管理員退回';
      db[index] = { ...item, status: 'returned', returnedBy: actorId, returnedByName: actor, returnedAt: now, returnReason: reason };
      addLog(actor, '退回資料', `已退回${isIncome ? '收入' : '支出'} ${id}，原因：${reason}`);
    } else if (nextStatus === 'void') {
      window.alert('已核准資料請使用更正沖銷流程，不直接作廢。');
      return;
    }

    if (isIncome) saveIncomes(db);
    else saveExpenses(db);
    archiveChange({
      collection: isIncome ? 'incomes' : 'expenses',
      recordId: id,
      action: nextStatus,
      before: beforeItem,
      after: db[index],
      actor,
      reason: nextStatus === 'returned' ? db[index].returnReason : '審核狀態變更'
    });
    onDataChange();
  };
  // Delete transaction and log it
  const handleDelete = (id) => {
    if (!window.confirm('確定要刪除這筆資料？刪除資料會保留一年稽核紀錄。')) return;
    const reason = window.prompt('請輸入刪除原因，系統會保留一年稽核紀錄。');
    if (!reason) {
      window.alert('未輸入原因，刪除已取消。');
      return;
    }

    if (activeSubTab === 'dailySummary') {
      const date = id;
      if (blockIfPeriodLocked(date, '刪除資料')) return;
      const currentIncomes = getIncomes();
      const currentBankTx = getBankTransactions();

      const incs = currentIncomes.filter(item => 
        item.companyId === companyId && item.date === date && item.remarks && item.remarks.startsWith('當日營業彙總 - ')
      );
      const btxs = currentBankTx.filter(item =>
        item.companyId === companyId && item.date === date && item.remarks && item.remarks.startsWith('當日營業彙總 - ')
      );

      incs.forEach(inc => {
        archiveDeletion({ collection: 'incomes', record: inc, actor: operatorName, reason });
      });
      btxs.forEach(bt => {
        archiveDeletion({ collection: 'bankTransactions', record: bt, actor: operatorName, reason });
      });

      const filteredIncomes = currentIncomes.filter(item => 
        !(item.companyId === companyId && item.date === date && item.remarks && item.remarks.startsWith('當日營業彙總 - '))
      );
      const filteredBankTx = currentBankTx.filter(item =>
        !(item.companyId === companyId && item.date === date && item.remarks && item.remarks.startsWith('當日營業彙總 - '))
      );

      saveIncomes(filteredIncomes);
      saveBankTransactions(filteredBankTx);
      addLog(operatorName, '刪除每日營業彙總', `刪除 ${date} 的每日營業彙總資料。`);
      onDataChange();
      return;
    }

    if (activeSubTab === 'income') {
      const db = getIncomes();
      const item = db.find(i => i.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.date, '刪除資料')) return;
        if (item.status === 'approved') {
          window.alert('已核准收入不能刪除，請使用更正沖銷。');
          return;
        }
        archiveDeletion({ collection: 'incomes', record: item, actor: operatorName, reason });
        saveIncomes(db.filter(i => i.id !== id));
        addLog(operatorName, '刪除收入', `刪除收入 ${id}，金額 $${item.amount.toLocaleString()}。`);
      }
    } else if (activeSubTab === 'expense') {
      const db = getExpenses();
      const item = db.find(e => e.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.date, '刪除資料')) return;
        if (item.status === 'approved') {
          window.alert('已核准支出不能刪除，請使用更正沖銷。');
          return;
        }
        archiveDeletion({ collection: 'expenses', record: item, actor: operatorName, reason });
        saveExpenses(db.filter(e => e.id !== id));
        addLog(operatorName, '刪除支出', `刪除支出 ${id}，金額 $${item.amount.toLocaleString()}。`);
      }
    } else if (activeSubTab === 'shareholder') {
      const db = getShareholderLedger();
      const item = db.find(s => s.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.date, '刪除資料')) return;
        archiveDeletion({ collection: 'shareholderLedger', record: item, actor: operatorName, reason });
        saveShareholderLedger(db.filter(s => s.id !== id));
        addLog(operatorName, '刪除股東往來', `刪除股東往來 ${id}。`);
      }
    } else if (activeSubTab === 'gas') {
      const db = getGasInventoryPeriods();
      const item = db.find(g => g.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.yearMonth, '刪除資料')) return;
        archiveDeletion({ collection: 'gasInventoryPeriods', record: item, actor: operatorName, reason });
        saveGasInventoryPeriods(db.filter(g => g.id !== id));
        addLog(operatorName, '刪除瓦斯進貨設定', `刪除 ${item.yearMonth} 瓦斯進貨設定。`);
      }
    } else if (activeSubTab === 'gasCylinders') {
      const db = getGasCylinders();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'gasCylinders', record: item, actor: operatorName, reason });
        saveGasCylinders(db.filter(g => g.id !== id));
        addLog(operatorName, '刪除鋼瓶資料', `刪除鋼瓶 ${item.cylinderNo || id}。`);
      }
    } else if (activeSubTab === 'gasVehicles') {
      const db = getGasDeliveryVehicles();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'gasDeliveryVehicles', record: item, actor: operatorName, reason });
        saveGasDeliveryVehicles(db.filter(g => g.id !== id));
        addLog(operatorName, '刪除配送車資料', `刪除配送車 ${item.plateNo || id}。`);
      }
    } else if (activeSubTab === 'gasDeposits') {
      const db = getCustomerCylinderDeposits();
      const item = db.find(g => g.id === id);
      if (item) {
        archiveDeletion({ collection: 'customerCylinderDeposits', record: item, actor: operatorName, reason });
        saveCustomerCylinderDeposits(db.filter(g => g.id !== id));
        addLog(operatorName, '刪除客戶押瓶', `刪除客戶押瓶 ${item.customerName || id}。`);
      }
    } else if (activeSubTab === 'loan') {
      const db = getLoans();
      const item = db.find(l => l.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.startDate, '刪除資料')) return;
        archiveDeletion({ collection: 'loans', record: item, actor: operatorName, reason });
        saveLoans(db.filter(l => l.id !== id));
        addLog(operatorName, '刪除貸款', `刪除貸款 ${id}。`);
      }
    } else if (activeSubTab === 'assets') {
      const db = getFixedAssets();
      const item = db.find(asset => asset.id === id);
      if (item) {
        if (blockIfPeriodLocked(item.acquisitionDate, '刪除資料')) return;
        archiveDeletion({ collection: 'fixedAssets', record: item, actor: operatorName, reason });
        saveFixedAssets(db.filter(asset => asset.id !== id));
        addLog(operatorName, '刪除固定資產', `刪除固定資產 ${id}。`);
      }
    }
    onDataChange();
  };
  // Lookups helper
  const getAccountName = (code) => {
    return accounts.find(a => a.code === code)?.name || code || '未知科目';
  };

  const getBankName = (id) => {
    return banks.find(b => b.id === id)?.name || id || '未知銀行';
  };

  const getPaymentDisplay = (item) => {
    const method = getStoredPaymentMethod(item);
    const label = getPaymentMethodLabel(method);
    if (item.paymentStatus === 'unpaid') return `${label} / 未結清`;
    if (method === 'bank_transfer') return item.bankId ? `${label} / ${getBankName(item.bankId)}` : label;
    if (method === 'check') return item.checkNo ? `${label} / ${item.checkNo}` : label;
    return label;
  };
  const getShareholderName = (id) => {
    return shareholders.find(s => s.id === id)?.name || id || '未知股東';
  };

  const getCylinderLabel = (id) => {
    const cylinder = gasCylinders.find(item => item.id === id);
    return cylinder?.cylinderNo || id || '-';
  };

  const getVehicleLabel = (id) => {
    const vehicle = gasDeliveryVehicles.find(item => item.id === id || item.plateNo === id);
    return vehicle ? `${vehicle.plateNo}${vehicle.name ? ` / ${vehicle.name}` : ''}` : id || '-';
  };

  const getGasLocationDisplay = (type, id, item = {}) => {
    if (type === 'vehicle') return getVehicleLabel(id || item.vehicleId);
    if (type === 'customer') return item.customerName || customers.find(customer => customer.id === (id || item.customerId))?.name || id || '客戶';
    return optionLabel(GAS_LOCATION_OPTIONS, type);
  };

  const getVehicleCylinderSummary = (vehicle) => {
    const vehicleCylinders = gasCylinders.filter(cylinder =>
      cylinder.locationType === 'vehicle' &&
      (cylinder.vehicleId === vehicle.id || cylinder.locationId === vehicle.id || cylinder.locationId === vehicle.plateNo)
    );
    const fullCount = vehicleCylinders.filter(cylinder => cylinder.status === 'full').length;
    const emptyCount = vehicleCylinders.filter(cylinder => cylinder.status === 'empty').length;
    const totalKg = vehicleCylinders
      .filter(cylinder => ['full', 'residual'].includes(cylinder.status))
      .reduce((sum, cylinder) => sum + Number(cylinder.specKg || 0), 0);
    return { fullCount, emptyCount, totalKg, totalCount: vehicleCylinders.length };
  };

  const handleCreateCorrection = (item) => {
    if (!isAdmin || !['income', 'expense'].includes(activeSubTab)) return;
    if (item.status !== 'approved') {
      window.alert('只有已核准的收入或支出可以建立更正沖銷。');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (blockIfPeriodLocked(today, '建立更正沖銷')) return;

    const reason = window.prompt('請輸入更正原因。');
    if (!reason || !reason.trim()) return;

    const isIncome = activeSubTab === 'income';
    const db = isIncome ? getIncomes() : getExpenses();
    const index = db.findIndex(row => row.id === item.id);
    if (index === -1) return;

    const now = new Date().toISOString();
    const originalPeriodLocked = isPeriodLocked(companyId, item.date);
    const correctionDate = originalPeriodLocked ? today : item.date;
    const reversalId = generateId(activeSubTab, correctionDate);
    const correctedId = `${generateId(activeSubTab, correctionDate)}C`;
    const actor = currentUser?.name || operatorName;
    const actorId = currentUser?.id || 'ADMIN';
    const before = { ...db[index] };

    db[index] = {
      ...db[index],
      correctionStatus: 'corrected',
      correctedBy: actorId,
      correctedByName: actor,
      correctedAt: now,
      correctionReason: reason
    };

    const reversal = {
      ...item,
      id: reversalId,
      date: correctionDate,
      amount: -Math.abs(Number(item.amount || 0)),
      calculatedAmount: -Math.abs(Number(item.calculatedAmount || item.amount || 0)),
      status: 'approved',
      remarks: `沖銷 ${item.id}：${reason}`,
      createdBy: actorId,
      createdByName: actor,
      createdByRole: userRole,
      createdAt: now,
      adminReviewedBy: actorId,
      adminReviewedByName: actor,
      adminReviewedAt: now,
      correctionOf: item.id,
      correctionType: 'reversal'
    };

    const corrected = {
      ...item,
      id: correctedId,
      date: correctionDate,
      status: 'pending_admin_review',
      remarks: `更正 ${item.id}：請編輯此筆後送審。原因：${reason}`,
      createdBy: actorId,
      createdByName: actor,
      createdByRole: userRole,
      createdAt: now,
      firstReviewedBy: null,
      firstReviewedByName: null,
      firstReviewedByRole: null,
      firstReviewedAt: null,
      adminReviewedBy: null,
      adminReviewedByName: null,
      adminReviewedAt: null,
      correctionOf: item.id,
      correctionType: 'replacement'
    };

    db.push(reversal, corrected);
    if (isIncome) saveIncomes(db);
    else saveExpenses(db);

    archiveChange({
      collection: isIncome ? 'incomes' : 'expenses',
      recordId: item.id,
      action: 'correction',
      before,
      after: { original: db[index], reversal, corrected },
      actor,
      reason
    });
    addLog(actor, '建立更正沖銷', `原資料 ${item.id} 保留不動，建立沖銷 ${reversalId} 與待審更正 ${correctedId}。原因：${reason}`);
    onDataChange();
  };
  const handleSaveReconciliation = () => {
    if (!isAdmin) return;
    if (!reconciliationBankId) {
      window.alert('請先選擇銀行帳戶。');
      return;
    }
    if (parsedStatementRows.length === 0) {
      window.alert('請貼上銀行對帳資料，格式需包含日期、摘要、支出、收入、餘額。');
      return;
    }
    const records = getBankReconciliations();
    const newRecord = {
      id: `REC${reconciliationDate.replace(/-/g, '').slice(0, 6)}${String(Date.now()).slice(-5)}`,
      companyId,
      bankId: reconciliationBankId,
      statementDate: reconciliationDate,
      statementBalance: reconciliationPreview.statementBalance,
      systemBalance: reconciliationPreview.systemBalance,
      difference: reconciliationPreview.difference,
      importedRows: parsedStatementRows,
      matchedRows: reconciliationPreview.matchedRows,
      unmatchedStatementRows: reconciliationPreview.unmatchedStatementRows,
      unmatchedSystemRows: reconciliationPreview.unmatchedSystemRows,
      status: Math.abs(reconciliationPreview.difference) < 1 ? 'balanced' : 'difference',
      createdAt: new Date().toISOString(),
      createdBy: operatorName,
      remarks: ''
    };
    records.unshift(newRecord);
    saveBankReconciliations(records);
    archiveChange({ collection: 'bankReconciliations', recordId: newRecord.id, action: 'create', after: newRecord, actor: operatorName, reason: '銀行對帳' });
    addLog(operatorName, '新增銀行對帳', `新增銀行對帳 ${newRecord.id}，差額 $${Number(newRecord.difference || 0).toLocaleString()}。`);
    setStatementText('');
    onDataChange();
  };
  return (
    <div className="card">
      <div className="card-header" style={{ borderBottom: 'none' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`tab-btn ${activeSubTab === 'income' ? 'active' : ''}`} onClick={() => setActiveSubTab('income')}>
            收入
          </button>
          <button className={`tab-btn ${activeSubTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveSubTab('expense')}>
            支出
          </button>
          <button className={`tab-btn ${activeSubTab === 'dailySummary' ? 'active' : ''}`} onClick={() => setActiveSubTab('dailySummary')} style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
            每日營業額
          </button>
          <button className={`tab-btn ${activeSubTab === 'arap' ? 'active' : ''}`} onClick={() => setActiveSubTab('arap')} style={{ color: 'var(--accent-blue)', fontWeight: '700' }}>
            應收應付
          </button>
          <button className={`tab-btn ${activeSubTab === 'checks' ? 'active' : ''}`} onClick={() => setActiveSubTab('checks')} style={{ color: 'var(--accent-gold)', fontWeight: '700' }}>
            支票管理
          </button>
          {isAdmin && (
            <button className={`tab-btn ${activeSubTab === 'bankRecon' ? 'active' : ''}`} onClick={() => setActiveSubTab('bankRecon')} style={{ color: 'var(--accent-blue)', fontWeight: '700' }}>
              銀行對帳
            </button>
          )}
          {isAdmin && (
            <button className={`tab-btn ${activeSubTab === 'aging' ? 'active' : ''}`} onClick={() => setActiveSubTab('aging')} style={{ color: 'var(--accent-red)', fontWeight: '700' }}>
              帳齡分析
            </button>
          )}
          {isAdmin && (
            <button className={`tab-btn ${activeSubTab === 'assets' ? 'active' : ''}`} onClick={() => setActiveSubTab('assets')} style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
              固定資產
            </button>
          )}

          {showShareholderLedger && (
            <button className={`tab-btn ${activeSubTab === 'shareholder' ? 'active' : ''}`} onClick={() => setActiveSubTab('shareholder')}>
              股東往來
            </button>
          )}
          {showLoans && (
            <button className={`tab-btn ${activeSubTab === 'loan' ? 'active' : ''}`} onClick={() => setActiveSubTab('loan')}>
              貸款
            </button>
          )}
        </div>
        {activeSubTab !== 'log' && activeSubTab !== 'arap' && activeSubTab !== 'checks' && activeSubTab !== 'bankRecon' && activeSubTab !== 'aging' && activeSubTab !== 'gasMovements' && canWriteBasicLedger && (isAdmin || activeSubTab === 'gas' || GAS_OPERATION_TABS.includes(activeSubTab) || manageShareholderLedger || (activeSubTab !== 'shareholder' && activeSubTab !== 'loan')) && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            新增記錄
          </button>
        )}
      </div>

      <div className="card-body" style={{ paddingTop: 0 }}>
        {activeSubTab === 'arap' ? (
          <div className="table-responsive">
            <div className="alert-box info" style={{ marginBottom: '16px' }}>
              這裡彙整尚未結清的應收款、應付款與支票資料，結清後會保留原始紀錄並更新付款狀態。
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>資料 ID</th>
                  <th>記帳日期</th>
                  <th>收付類型</th>
                  <th>會計科目</th>
                  <th>金額 (TWD)</th>
                  <th>對象 / 備註</th>
                  <th>到期日</th>
                  <th>附件</th>
                  <th>備註</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {unpaidArapItems.map((item, idx) => (
                  <tr key={idx} onClick={(e) => handleRowClick(e, item, item.type)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                    <td>
                      <span className={`badge ${item.type === 'income' ? 'approved' : 'void'}`}>
                        {item.type === 'income' ? '應收' : '應付'}
                      </span>
                    </td>
                    <td>{getAccountName(item.accountCode)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: item.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {formatCurrency(item.amount)}
                    </td>
                    <td>{item.counterpartyName || '-'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: '600' }}>
                      {item.dueDate ? item.dueDate : '未填'}
                    </td>
                    <td>
                      {item.receiptAttachment ? (
                        <button 
                          type="button"
                          className="btn btn-secondary btn-sm" 
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                          onClick={() => openReceiptPreview(item.receiptAttachment)}
                        >
                          查看附件
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>無</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{item.remarks}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleOpenClearModal(item)}
                      >
                        結清入帳
                      </button>
                    </td>
                  </tr>
                ))}
                {unpaidArapItems.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                      目前沒有應收、應付或待結清資料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : activeSubTab === 'aging' ? (
          <div>
            <div className="alert-box info" style={{ marginBottom: '16px' }}>
              依未收、未付天數統計帳齡，協助追蹤逾期款項與催收風險。
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
                <label className="form-label">計算日期</label>
                <input type="date" className="form-control" value={agingAsOfDate} onChange={e => setAgingAsOfDate(e.target.value)} />
              </div>
            </div>
            <div className="summary-grid" style={{ marginBottom: '16px' }}>
              <div className="summary-card">
                <div className="summary-label">應收總額</div>
                <div className="summary-value income">{formatCurrency(agingReport.receivables.total)}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">應付總額</div>
                <div className="summary-value expense">{formatCurrency(agingReport.payables.total)}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">逾期 90 天以上</div>
                <div className="summary-value">{formatCurrency(agingReport.receivables.buckets.over90.total)}</div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>類型</th>
                    <th>0-30 天</th>
                    <th>31-60 天</th>
                    <th>61-90 天</th>
                    <th>90 天以上</th>
                    <th>合計</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 700 }}>應收帳款</td>
                    <td>{formatCurrency(agingReport.receivables.buckets.current.total)}</td>
                    <td>{formatCurrency(agingReport.receivables.buckets.days31to60.total)}</td>
                    <td>{formatCurrency(agingReport.receivables.buckets.days61to90.total)}</td>
                    <td>{formatCurrency(agingReport.receivables.buckets.over90.total)}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(agingReport.receivables.total)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>應付帳款</td>
                    <td>{formatCurrency(agingReport.payables.buckets.current.total)}</td>
                    <td>{formatCurrency(agingReport.payables.buckets.days31to60.total)}</td>
                    <td>{formatCurrency(agingReport.payables.buckets.days61to90.total)}</td>
                    <td>{formatCurrency(agingReport.payables.buckets.over90.total)}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(agingReport.payables.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : activeSubTab === 'bankRecon' ? (
          <div>
            <div className="alert-box info" style={{ marginBottom: '16px' }}>
              可貼上銀行對帳單 CSV 內容，系統會比對帳面餘額與銀行餘額。建議欄位順序：日期、摘要、支出、收入、餘額。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">銀行帳戶</label>
                <select className="select-dropdown" style={{ width: '100%' }} value={reconciliationBankId} onChange={e => setReconciliationBankId(e.target.value)}>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.name} ({bank.accountNo})</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">對帳日期</label>
                <input type="date" className="form-control" value={reconciliationDate} onChange={e => setReconciliationDate(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">銀行對帳單內容</label>
              <textarea
                className="form-control"
                style={{ minHeight: '130px' }}
                placeholder={'2026-07-01,現金存入,0,50000,150000\n2026-07-02,瓦斯貨款,12000,0,138000'}
                value={statementText}
                onChange={e => setStatementText(e.target.value)}
              />
            </div>
            <div className="summary-grid" style={{ marginBottom: '16px' }}>
              <div className="summary-card">
                <div className="summary-label">銀行帳餘額</div>
                <div className="summary-value">{formatCurrency(reconciliationPreview.statementBalance)}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">系統帳餘額</div>
                <div className="summary-value">{formatCurrency(reconciliationPreview.systemBalance)}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">差額</div>
                <div className={`summary-value ${Math.abs(reconciliationPreview.difference) < 1 ? 'income' : 'expense'}`}>
                  {formatCurrency(reconciliationPreview.difference)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button type="button" className="btn btn-primary" onClick={handleSaveReconciliation}>儲存對帳結果</button>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>對帳日期</th>
                    <th>銀行</th>
                    <th>狀態</th>
                    <th>銀行餘額</th>
                    <th>系統餘額</th>
                    <th>差額</th>
                    <th>結果</th>
                  </tr>
                </thead>
                <tbody>
                  {bankReconciliations.map(item => (
                    <tr key={item.id} onClick={(e) => handleRowClick(e, item, 'bankReconciliation')} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.id}</td>
                      <td>{item.statementDate}</td>
                      <td>{getBankName(item.bankId)}</td>
                      <td>{formatCurrency(item.statementBalance)}</td>
                      <td>{formatCurrency(item.systemBalance)}</td>
                      <td style={{ color: Math.abs(item.difference) < 1 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>{formatCurrency(item.difference)}</td>
                      <td><span className={`badge ${item.status === 'balanced' ? 'approved' : 'pending'}`}>{item.status === 'balanced' ? '已平衡' : '有差額'}</span></td>
                    </tr>
                  ))}
                  {bankReconciliations.length === 0 && (
                    <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>目前沒有銀行對帳紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeSubTab === 'checks' ? (
          <div>
            <div className="alert-box info" style={{ marginBottom: '16px' }}>
              支票管理會彙整所有應收支票與應付支票，方便追蹤到期日、兌現狀態與入帳銀行。
            </div>
            
            {/* Filter controls */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }} className="no-print">
              <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>支票類型</label>
                <select className="select-dropdown" style={{ width: '100%' }} value={checkTypeFilter} onChange={e => setCheckTypeFilter(e.target.value)}>
                  <option value="all">全部支票</option>
                  <option value="receivable">應收支票（收款支票）</option>
                  <option value="payable">應付支票（付款支票）</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>兌現狀態</label>
                <select className="select-dropdown" style={{ width: '100%' }} value={checkStatusFilter} onChange={e => setCheckStatusFilter(e.target.value)}>
                  <option value="all">全部狀態</option>
                  <option value="unpaid">未兌現（待處理）</option>
                  <option value="paid">已兌現（已入帳）</option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>支票類型</th>
                    <th>支票號碼</th>
                    <th>到期日</th>
                    <th>對象</th>
                    <th style={{ textAlign: 'right' }}>金額 (TWD)</th>
                    <th>關聯科目</th>
                    <th>兌現狀態</th>
                    <th>附件</th>
                    <th>備註</th>
                    <th style={{ textAlign: 'right', width: '120px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {checkItems.map(item => {
                    const isIncome = item.type === 'income';
                    const isPaid = item.paymentStatus === 'paid';
                    
                    return (
                      <tr key={item.id} onClick={(e) => handleRowClick(e, item, 'checks')} style={{ cursor: 'pointer' }}>
                        <td>
                          <span className={`badge ${isIncome ? 'success' : 'danger'}`}>
                            {isIncome ? '應收支票' : '應付支票'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{item.checkNo || '未填支票號碼'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: '600' }}>
                          {item.checkDueDate ? item.checkDueDate : '未填'}
                        </td>
                        <td>{item.counterpartyName || '-'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: isIncome ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          ${item.amount.toLocaleString()}
                        </td>
                        <td>{item.accountCode} {getAccountName(item.accountCode)}</td>
                        <td>
                          <span className={`badge ${isPaid ? 'approved' : 'draft'}`}>
                            {isPaid ? '已結清' : '未結清'}
                          </span>
                        </td>
                        <td>
                          {item.receiptAttachment ? (
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                              onClick={() => openReceiptPreview(item.receiptAttachment)}
                            >
                              查看附件
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>無</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{item.remarks}</td>
                        <td style={{ textAlign: 'right' }}>
                          {!isPaid ? (
                            <button 
                              type="button" 
                              className="btn btn-primary btn-sm"
                              onClick={() => handleOpenClearModal(item)}
                            >
                              兌現入帳
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>已兌現</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {checkItems.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                        目前沒有符合條件的支票資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Normal Transaction Tables */
          <>
          {GAS_OPERATION_TABS.includes(activeSubTab) && (
            <div className="summary-grid" style={{ marginBottom: '16px' }}>
              <div className="summary-card">
                <div className="summary-label">總鋼瓶數</div>
                <div className="summary-value">{gasInventoryStats.total.toLocaleString()}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">倉庫鋼瓶</div>
                <div className="summary-value income">{gasInventoryStats.warehouse.toLocaleString()}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">配送車上</div>
                <div className="summary-value">{gasInventoryStats.vehicle.toLocaleString()}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">客戶押瓶</div>
                <div className="summary-value">{gasInventoryStats.activeDeposits.toLocaleString()}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">檢驗逾期</div>
                <div className={`summary-value ${gasInventoryStats.overdueInspection > 0 ? 'expense' : 'income'}`}>
                  {gasInventoryStats.overdueInspection.toLocaleString()}
                </div>
              </div>
            </div>
          )}
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                {activeSubTab === 'income' && (
                  <tr>
                    <th>流水號 ID</th>
                    <th>記帳日期</th>
                    <th>科目</th>
                    <th>收款方式</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th>銷售公斤數</th>
                    <th>金額</th>
                    <th>狀態</th>
                    {showCreatorAudit && <th>建立人</th>}
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'expense' && (
                  <tr>
                    <th>流水號 ID</th>
                    <th>記帳日期</th>
                    <th>科目</th>
                    <th>付款方式</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th>金額</th>
                    <th>狀態</th>
                    {showCreatorAudit && <th>建立人</th>}
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'dailySummary' && (
                  <tr>
                    <th>記帳日期</th>
                    <th>瓦斯總收入</th>
                    <th>已收金額</th>
                    <th>欠款金額</th>
                    <th>應收帳款</th>
                    <th>還款金額</th>
                    <th>合計重量</th>
                    <th>合計桶數</th>
                    <th>平均單價</th>
                    <th>爐具收入</th>
                    <th>維修/安裝 收入</th>
                    <th>買桶收入</th>
                    <th>檢驗費收入</th>
                    <th>押瓶收入</th>
                    <th>營業額</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'gas' && (
                  <tr>
                    <th>月份</th>
                    <th>期初公斤數 / 成本</th>
                    <th>進貨公斤數 / 金額</th>
                    <th>平均成本</th>
                    <th>銷售公斤數</th>
                    <th>銷貨成本</th>
                    <th>期末庫存</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'gasCylinders' && (
                  <tr>
                    <th>鋼瓶 ID</th>
                    <th>瓶號 / 規格</th>
                    <th>狀態</th>
                    <th>目前位置</th>
                    <th>條碼 / QR Code</th>
                    <th>檢驗期限</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'gasVehicles' && (
                  <tr>
                    <th>車輛 ID</th>
                    <th>車牌 / 名稱</th>
                    <th>司機</th>
                    <th>車上實瓶</th>
                    <th>車上空瓶</th>
                    <th>車上公斤數</th>
                    <th>容量 / 狀態</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'gasDeposits' && (
                  <tr>
                    <th>押瓶 ID</th>
                    <th>客戶</th>
                    <th>鋼瓶</th>
                    <th>規格</th>
                    <th>押金</th>
                    <th>狀態</th>
                    <th>押瓶 / 退瓶日期</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'gasMovements' && (
                  <tr>
                    <th>異動 ID</th>
                    <th>日期</th>
                    <th>鋼瓶</th>
                    <th>異動類型</th>
                    <th>從</th>
                    <th>到</th>
                    <th>操作人</th>
                    <th>備註</th>
                  </tr>
                )}
                {activeSubTab === 'shareholder' && (
                  <tr>
                    <th>流水號 ID</th>
                    <th>記帳日期</th>
                    <th>股東姓名</th>
                    <th>異動類型</th>
                    <th>異動金額</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'loan' && (
                  <tr>
                    <th>貸款 ID</th>
                    <th>貸款名稱</th>
                    <th>貸款銀行</th>
                    <th>本金</th>
                    <th>利率</th>
                    <th>期數</th>
                    <th>月付款</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
                {activeSubTab === 'assets' && (
                  <tr>
                    <th>資產 ID</th>
                    <th>資產名稱</th>
                    <th>類型</th>
                    <th>購入日期</th>
                    <th>購入成本</th>
                    <th>累計折舊</th>
                    <th>帳面價值</th>
                    <th>狀態</th>
                    <th>備註</th>
                    {isAdmin && <th style={{ textAlign: 'right' }}>操作</th>}
                  </tr>
                )}
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} onClick={(e) => handleRowClick(e, item, activeSubTab)} style={{ cursor: 'pointer' }}>
                    {!['dailySummary', 'gas'].includes(activeSubTab) && (
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.id}</td>
                    )}
                    
                    {activeSubTab === 'income' && (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                        <td>{getAccountName(item.accountCode)}</td>
                        <td>{getPaymentDisplay(item)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {item.quantity || '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: Number(item.gasKg || 0) > 0 ? 700 : 400 }}>
                          {item.gasKg ? `${Number(item.gasKg).toLocaleString()} kg` : '-'}
                          {item.cylinderQty ? <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.cylinderQty} 桶</div> : null}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', fontWeight: 'bold' }}>
                          {formatCurrency(item.amount)}
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(item.status)}`}>
                            {STATUS_LABELS[item.status] || item.status}
                          </span>
                        </td>
                        {showCreatorAudit && (
                          <td style={{ minWidth: '110px' }}>
                            <div style={{ fontWeight: 600 }}>{item.createdByName || '系統管理員'}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatDateTime(item.createdAt)}</div>
                          </td>
                        )}
                        <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>
                          {item.remarks}
                          {item.receiptAttachment && (
                            <div style={{ marginTop: '4px' }}>
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm" 
                                style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => openReceiptPreview(item.receiptAttachment)}
                              >
                                查看附件
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}

                    {activeSubTab === 'dailySummary' && (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.gasTotalIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{formatCurrency(item.paidAmount)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(item.unpaidAmount)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{formatCurrency(item.arAmount)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{formatCurrency(item.repaymentAmount)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(item.totalWeight).toLocaleString()} kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(item.totalCylinders).toLocaleString()} 桶</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(item.avgPrice).toFixed(2)} / kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.stoveIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.repairIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.cylinderIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.inspectionIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.depositIncome)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{formatCurrency(item.salesAmount)}</td>
                      </>
                    )}

                    {activeSubTab === 'gas' && (() => {
                      const calc = getGasInventoryForMonth(companyId, item.yearMonth);
                      return (
                        <>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{item.yearMonth}</td>
                          <td>
                            <div>{calc.openingKg.toLocaleString()} kg</div>
                            <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(calc.openingCost)}</div>
                          </td>
                          <td>
                            <div>{calc.purchaseKg.toLocaleString()} kg</div>
                            <div style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(calc.purchaseAmount)}</div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            ${calc.averageCostPerKg.toFixed(2)} / kg
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{calc.soldKg.toLocaleString()} kg</td>
                          <td style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(calc.gasCogs)}</td>
                          <td>
                            <div style={{ fontFamily: 'var(--font-mono)' }}>{calc.endingKg.toLocaleString()} kg</div>
                            <div style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(calc.endingCost)}</div>
                          </td>
                          <td>{item.remarks}</td>
                        </>
                      );
                    })()}

                    {activeSubTab === 'gasCylinders' && (
                      <>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.cylinderNo || '-'}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {Number(item.specKg || 0).toLocaleString()} kg / {optionLabel(GAS_OWNERSHIP_OPTIONS, item.ownershipStatus)}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${item.status === 'full' ? 'approved' : item.status === 'scrapped' ? 'void' : item.status === 'maintenance' ? 'pending' : 'draft'}`}>
                            {optionLabel(GAS_CYLINDER_STATUS_OPTIONS, item.status)}
                          </span>
                        </td>
                        <td>
                          <div>{optionLabel(GAS_LOCATION_OPTIONS, item.locationType)}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {getGasLocationDisplay(item.locationType, item.locationId, item)}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                          <div>{item.barcode || '-'}</div>
                          <div style={{ color: 'var(--text-secondary)' }}>{item.qrCode || '-'}</div>
                        </td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-mono)', color: item.inspectionDueDate && item.inspectionDueDate < new Date().toISOString().split('T')[0] ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: item.inspectionDueDate && item.inspectionDueDate < new Date().toISOString().split('T')[0] ? 700 : 400 }}>
                            {item.inspectionDueDate || item.nextInspectionDate || '未填'}
                          </div>
                          {item.lastInspectionDate && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>上次：{item.lastInspectionDate}</div>
                          )}
                        </td>
                        <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>{item.remarks}</td>
                      </>
                    )}

                    {activeSubTab === 'gasVehicles' && (() => {
                      const vehicleSummary = getVehicleCylinderSummary(item);
                      return (
                        <>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.plateNo || '-'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.name || '配送車'}</div>
                          </td>
                          <td>{item.driverName || '-'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{vehicleSummary.fullCount.toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{vehicleSummary.emptyCount.toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 700 }}>{vehicleSummary.totalKg.toLocaleString()} kg</td>
                          <td>
                            <div>{Number(item.capacityCylinders || 0).toLocaleString()} 支 / {Number(item.capacityKg || 0).toLocaleString()} kg</div>
                            <span className={`badge ${item.active === false ? 'void' : 'approved'}`}>{item.active === false ? '停用' : '使用中'}</span>
                          </td>
                          <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>{item.remarks}</td>
                        </>
                      );
                    })()}

                    {activeSubTab === 'gasDeposits' && (
                      <>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.customerName || '-'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.customerPhone || '-'}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{getCylinderLabel(item.cylinderId)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(item.cylinderSpecKg || 0).toLocaleString()} kg</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>{formatCurrency(item.depositAmount || 0)}</td>
                        <td>
                          <span className={`badge ${item.depositStatus === 'active' ? 'approved' : item.depositStatus === 'returned' ? 'draft' : item.depositStatus === 'lost' ? 'void' : 'pending'}`}>
                            {optionLabel(GAS_DEPOSIT_STATUS_OPTIONS, item.depositStatus)}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontFamily: 'var(--font-mono)' }}>{item.startedAt || '-'}</div>
                          {item.returnedAt && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>退：{item.returnedAt}</div>}
                        </td>
                        <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>{item.remarks}</td>
                      </>
                    )}

                    {activeSubTab === 'gasMovements' && (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.movementDate || '-'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{getCylinderLabel(item.cylinderId)}</td>
                        <td>
                          <span className="badge pending">{optionLabel(GAS_MOVEMENT_TYPE_OPTIONS, item.movementType)}</span>
                        </td>
                        <td>{getGasLocationDisplay(item.fromLocationType, item.fromLocationId, item)}</td>
                        <td>{getGasLocationDisplay(item.toLocationType, item.toLocationId, item)}</td>
                        <td>{item.operator || '-'}</td>
                        <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>{item.remarks}</td>
                      </>
                    )}

                    {activeSubTab === 'expense' && (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                        <td>{getAccountName(item.accountCode)}</td>
                        <td>{getPaymentDisplay(item)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {item.quantity || '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-red)', fontWeight: 'bold' }}>
                          {formatCurrency(item.amount)}
                        </td>
                        <td>
                          <span className={`badge ${getStatusBadgeClass(item.status)}`}>
                            {STATUS_LABELS[item.status] || item.status}
                          </span>
                        </td>
                        {showCreatorAudit && (
                          <td style={{ minWidth: '110px' }}>
                            <div style={{ fontWeight: 600 }}>{item.createdByName || '系統管理員'}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatDateTime(item.createdAt)}</div>
                          </td>
                        )}
                        <td style={{ minWidth: '160px', maxWidth: '240px', whiteSpace: 'normal' }}>
                          {item.remarks}
                          {item.receiptAttachment && (
                            <div style={{ marginTop: '4px' }}>
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm" 
                                style={{ padding: '2px 6px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => openReceiptPreview(item.receiptAttachment)}
                              >
                                查看附件
                              </button>
                            </div>
                          )}
                        </td>
                      </>
                    )}

                    {activeSubTab === 'shareholder' && (
                      <>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                        <td style={{ fontWeight: '600' }}>{getShareholderName(item.shareholderId)}</td>
                        <td>
                          <span className={`badge ${item.type === 'join' ? 'approved' : item.type === 'increase' ? 'paid' : 'void'}`}>
                            {item.type === 'join' ? '入股' : item.type === 'increase' ? '增資' : '減資/提領'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: item.type === 'decrease' ? 'var(--accent-red)' : 'var(--accent-gold)', fontWeight: 'bold' }}>
                          ${item.amount.toLocaleString()}
                        </td>
                        <td>{item.remarks}</td>
                      </>
                    )}

                    {activeSubTab === 'loan' && (
                      <>
                        <td style={{ fontWeight: '600' }}>{item.name}</td>
                        <td>{getBankName(item.bankId)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>${item.principal.toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.interestRate}%</td>
                        <td>{item.months} 期</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                          ${item.monthlyPayment.toLocaleString()}
                        </td>
                        <td>{item.remarks}</td>
                      </>
                    )}

                    {activeSubTab === 'assets' && (() => {
                      const assetWithDep = fixedAssetSummary.assets.find(asset => asset.id === item.id);
                      const depreciation = assetWithDep?.depreciation || {};
                      return (
                        <>
                          <td style={{ fontWeight: 600 }}>{item.assetName}</td>
                          <td>{item.category}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{item.acquisitionDate}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.acquisitionCost)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-red)', fontWeight: 700 }}>{formatCurrency(depreciation.accumulatedDepreciation || 0)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontWeight: 700 }}>{formatCurrency(depreciation.bookValue || item.acquisitionCost || 0)}</td>
                          <td><span className={`badge ${item.status === 'active' ? 'approved' : 'void'}`}>{item.status === 'active' ? '使用中' : '已處分'}</span></td>
                          <td>{item.remarks}</td>
                        </>
                      );
                    })()}

                    {isAdmin && activeSubTab !== 'gasMovements' && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          {activeSubTab === 'dailySummary' && (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(item)}>
                                編輯
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.date)}>
                                刪除
                              </button>
                            </>
                          )}
                          {activeSubTab !== 'dailySummary' && (
                            <>
                              {(activeSubTab === 'income' || activeSubTab === 'expense') && canReview && item.status.startsWith('pending') && (
                                <>
                                  <button className="btn btn-primary btn-sm" onClick={() => updateReviewStatus(item.id, 'approved')}>
                                    核准
                                  </button>
                                  <button className="btn btn-secondary btn-sm" onClick={() => updateReviewStatus(item.id, 'returned')}>
                                    退回
                                  </button>
                                </>
                              )}
                              {(activeSubTab === 'income' || activeSubTab === 'expense') && allowVoid && item.status === 'approved' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleCreateCorrection(item)}>
                                  更正
                                </button>
                              )}
                              {item.status !== 'approved' && item.status !== 'void' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(item)}>
                                  編輯
                                </button>
                              )}
                              {item.status !== 'approved' && (
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>
                                  刪除
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan="12" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                      目前沒有資料，請新增一筆記錄。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Form Dialog Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">
                {editingItem ? '編輯' : '新增'} - {
                  activeSubTab === 'dailySummary' ? '當日營業額' :
                  activeSubTab === 'income' ? '收入' :
                  activeSubTab === 'expense' ? '支出' :
                  activeSubTab === 'shareholder' ? '股東往來' :
                  activeSubTab === 'gas' ? '瓦斯進貨 / 毛利' :
                  activeSubTab === 'gasCylinders' ? '鋼瓶清冊' :
                  activeSubTab === 'gasVehicles' ? '配送車庫存' :
                  activeSubTab === 'gasDeposits' ? '客戶押瓶' :
                  activeSubTab === 'loan' ? '貸款' :
                  activeSubTab === 'assets' ? '固定資產' : '資料'
                }
              </span>
              <button type="button" className="modal-close" onClick={() => setIsModalOpen(false)}>x</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {/* ===== 每日營業額 獨立表單 (完全隔離，避免其他 required 欄位干擾) ===== */}
                {activeSubTab === 'dailySummary' ? (() => {
                  const paid = Number(formData.paidAmount) || 0;
                  const ar = Number(formData.arAmount) || 0;
                  const unpaid = Number(formData.unpaidAmount) || 0;
                  const computedSales = paid + ar + unpaid;
                  const repayment = Number(formData.repaymentAmount) || 0;
                  const stove = Number(formData.stoveIncome) || 0;
                  const repair = Number(formData.repairIncome) || 0;
                  const cylinder = Number(formData.cylinderIncome) || 0;
                  const inspection = Number(formData.inspectionIncome) || 0;
                  const deposit = Number(formData.depositIncome) || 0;
                  const totalRevenue = computedSales + repayment + stove + repair + cylinder + inspection + deposit;

                  return (
                    <>
                      <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', padding: '8px 12px', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent-blue)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        建立人：<strong>{operatorName}</strong>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>記帳日期</label>
                          <input type="date" required className="form-control" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>瓦斯總收入 (自動加總)</label>
                          <input type="text" disabled className="form-control" style={{ background: 'var(--bg-card)', fontWeight: 'bold', color: 'var(--accent-blue)' }} value={formatCurrency(computedSales)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>營業額 (當日總收入加總)</label>
                          <input type="text" disabled className="form-control" style={{ background: 'var(--bg-card)', fontWeight: 'bold', color: 'var(--accent-green)' }} value={formatCurrency(totalRevenue)} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>已收金額 (現收)</label>
                          <input type="number" min="0" required placeholder="請輸入當日已收款" className="form-control" value={formData.paidAmount} onChange={e => setFormData({ ...formData, paidAmount: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>應收帳款 (月結簽單)</label>
                          <input type="number" min="0" placeholder="請輸入當日應收帳款" className="form-control" value={formData.arAmount} onChange={e => setFormData({ ...formData, arAmount: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>欠款金額 (現結未付)</label>
                          <input type="number" min="0" placeholder="請輸入當日欠款金額" className="form-control" value={formData.unpaidAmount} onChange={e => setFormData({ ...formData, unpaidAmount: e.target.value })} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>還款金額 (收回舊欠)</label>
                          <input type="number" min="0" placeholder="請輸入收回舊欠金額" className="form-control" value={formData.repaymentAmount} onChange={e => setFormData({ ...formData, repaymentAmount: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>合計重量 (kg)</label>
                          <input type="number" min="0" placeholder="請輸入當日總公斤數" className="form-control" value={formData.totalWeight} onChange={e => setFormData({ ...formData, totalWeight: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>合計桶數</label>
                          <input type="number" min="0" placeholder="請輸入當日總桶數" className="form-control" value={formData.totalCylinders} onChange={e => setFormData({ ...formData, totalCylinders: e.target.value })} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>爐具收入</label>
                          <input type="number" min="0" placeholder="請輸入爐具收入" className="form-control" value={formData.stoveIncome} onChange={e => setFormData({ ...formData, stoveIncome: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>維修/安裝 收入</label>
                          <input type="number" min="0" placeholder="請輸入檢修/安裝收入" className="form-control" value={formData.repairIncome} onChange={e => setFormData({ ...formData, repairIncome: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>買桶收入</label>
                          <input type="number" min="0" placeholder="請輸入買桶收入" className="form-control" value={formData.cylinderIncome} onChange={e => setFormData({ ...formData, cylinderIncome: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ marginTop: '12px' }}>
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>檢驗費收入</label>
                          <input type="number" min="0" placeholder="請輸入檢驗費收入" className="form-control" value={formData.inspectionIncome} onChange={e => setFormData({ ...formData, inspectionIncome: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ marginTop: '12px' }}>
                          <label className="form-label" style={{ minHeight: '38px', display: 'block' }}>押瓶收入</label>
                          <input type="number" min="0" placeholder="請輸入押瓶收入" className="form-control" value={formData.depositIncome} onChange={e => setFormData({ ...formData, depositIncome: e.target.value })} />
                        </div>
                      </div>
                    </>
                  );
                })() : (
                  <>
                {/* Operator tag for visual reference in modal */}
                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', padding: '8px 12px', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent-blue)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  建立人：<strong>{operatorName}</strong>
                </div>

                {/* 1. Date Field */}
                {activeSubTab !== 'loan' && activeSubTab !== 'gas' && activeSubTab !== 'assets' && !GAS_OPERATION_TABS.includes(activeSubTab) && (
                  <div className="form-group">
                    <label className="form-label">記帳日期</label>
                    <input type="date" required className="form-control" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                  </div>
                )}

                {activeSubTab === 'gas' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">成本期間</label>
                      <input type="month" required className="form-control" value={formData.yearMonth} onChange={e => setFormData({ ...formData, yearMonth: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">期初庫存公斤數</label>
                        <input type="number" min="0" step="0.01" className="form-control" value={formData.openingKg} onChange={e => setFormData({ ...formData, openingKg: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">期初庫存成本</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.openingCost} onChange={e => setFormData({ ...formData, openingCost: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">當月進貨公斤數</label>
                        <input type="number" min="0" step="0.01" required className="form-control" value={formData.purchaseKg} onChange={e => setFormData({ ...formData, purchaseKg: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">當月進貨金額</label>
                        <input type="number" min="0" step="1" required className="form-control" value={formData.purchaseAmount} onChange={e => setFormData({ ...formData, purchaseAmount: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">損耗 / 調整公斤數</label>
                        <input type="number" min="0" step="0.01" className="form-control" value={formData.shrinkageKg} onChange={e => setFormData({ ...formData, shrinkageKg: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">實際期末庫存公斤數</label>
                        <input type="number" min="0" step="0.01" placeholder="留空則由系統計算" className="form-control" value={formData.physicalEndingKg} onChange={e => setFormData({ ...formData, physicalEndingKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="alert-box info" style={{ marginTop: 0 }}>
                      系統會以期初庫存加當月進貨計算平均成本，並依收入資料中的銷售公斤數估算銷貨成本與毛利。
                    </div>
                  </>
                )}

                {activeSubTab === 'gasCylinders' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">鋼瓶編號</label>
                        <input type="text" required placeholder="例如：CYL-0001" className="form-control" value={formData.cylinderNo} onChange={e => setFormData({ ...formData, cylinderNo: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">規格公斤數</label>
                        <input type="number" min="0" step="0.1" required className="form-control" value={formData.specKg} onChange={e => setFormData({ ...formData, specKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">鋼瓶狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                          {GAS_CYLINDER_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">瓶權狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.ownershipStatus} onChange={e => setFormData({ ...formData, ownershipStatus: e.target.value })}>
                          {GAS_OWNERSHIP_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">條碼欄位</label>
                        <input type="text" placeholder="預留掃碼用" className="form-control" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">QR Code 欄位</label>
                        <input type="text" placeholder="預留 QR Code 用" className="form-control" value={formData.qrCode} onChange={e => setFormData({ ...formData, qrCode: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">目前位置</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.locationType} onChange={e => setFormData({ ...formData, locationType: e.target.value, locationId: '', vehicleId: '', customerId: '' })}>
                          {GAS_LOCATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">異動日期</label>
                        <input type="date" className="form-control" value={formData.movementDate} onChange={e => setFormData({ ...formData, movementDate: e.target.value })} />
                      </div>
                    </div>
                    {formData.locationType === 'vehicle' && (
                      <div className="form-group">
                        <label className="form-label">所在配送車</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.vehicleId || formData.locationId} onChange={e => setFormData({ ...formData, vehicleId: e.target.value, locationId: e.target.value })}>
                          <option value="">請選擇配送車</option>
                          {gasDeliveryVehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNo} {vehicle.name ? `/ ${vehicle.name}` : ''}</option>)}
                        </select>
                      </div>
                    )}
                    {formData.locationType === 'customer' && (
                      <>
                        <div className="form-group">
                          <label className="form-label">所在客戶</label>
                          <select
                            className="select-dropdown"
                            style={{ width: '100%' }}
                            value={formData.customerId}
                            onChange={e => {
                              const selected = customers.find(item => item.id === e.target.value);
                              setFormData({
                                ...formData,
                                customerId: e.target.value,
                                locationId: e.target.value,
                                customerName: selected?.name || formData.customerName,
                                customerPhone: selected?.phone || formData.customerPhone,
                                customerAddress: selected?.address || formData.customerAddress
                              });
                            }}
                          >
                            <option value="">不綁定客戶主檔</option>
                            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">客戶名稱</label>
                          <input type="text" className="form-control" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">上次檢驗日期</label>
                        <input type="date" className="form-control" value={formData.lastInspectionDate} onChange={e => setFormData({ ...formData, lastInspectionDate: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">下次檢驗期限</label>
                        <input type="date" className="form-control" value={formData.inspectionDueDate || formData.nextInspectionDate} onChange={e => setFormData({ ...formData, inspectionDueDate: e.target.value, nextInspectionDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">本次異動類型</label>
                      <select className="select-dropdown" style={{ width: '100%' }} value={formData.movementType} onChange={e => setFormData({ ...formData, movementType: e.target.value })}>
                        {GAS_MOVEMENT_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {activeSubTab === 'gasVehicles' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">車牌號碼</label>
                        <input type="text" required placeholder="例如：ABC-1234" className="form-control" value={formData.plateNo} onChange={e => setFormData({ ...formData, plateNo: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">車輛名稱</label>
                        <input type="text" placeholder="例如：1號車" className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">司機 / 負責人</label>
                      <input type="text" className="form-control" value={formData.driverName} onChange={e => setFormData({ ...formData, driverName: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">可載鋼瓶數</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.capacityCylinders} onChange={e => setFormData({ ...formData, capacityCylinders: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">可載公斤數</label>
                        <input type="number" min="0" step="0.1" className="form-control" value={formData.capacityKg} onChange={e => setFormData({ ...formData, capacityKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">車輛狀態</label>
                      <select className="select-dropdown" style={{ width: '100%' }} value={formData.active === false ? 'inactive' : 'active'} onChange={e => setFormData({ ...formData, active: e.target.value === 'active' })}>
                        <option value="active">使用中</option>
                        <option value="inactive">停用</option>
                      </select>
                    </div>
                  </>
                )}

                {activeSubTab === 'gasDeposits' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">客戶主檔</label>
                      <select
                        className="select-dropdown"
                        style={{ width: '100%' }}
                        value={formData.customerId}
                        onChange={e => {
                          const selected = customers.find(item => item.id === e.target.value);
                          setFormData({
                            ...formData,
                            customerId: e.target.value,
                            customerName: selected?.name || formData.customerName,
                            customerPhone: selected?.phone || formData.customerPhone,
                            customerAddress: selected?.address || formData.customerAddress
                          });
                        }}
                      >
                        <option value="">不綁定客戶主檔</option>
                        {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">客戶名稱</label>
                        <input type="text" required className="form-control" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">客戶電話</label>
                        <input type="text" className="form-control" value={formData.customerPhone} onChange={e => setFormData({ ...formData, customerPhone: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">客戶地址</label>
                      <input type="text" className="form-control" value={formData.customerAddress} onChange={e => setFormData({ ...formData, customerAddress: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">押瓶鋼瓶</label>
                        <select
                          className="select-dropdown"
                          style={{ width: '100%' }}
                          value={formData.cylinderId}
                          onChange={e => {
                            const selected = gasCylinders.find(item => item.id === e.target.value);
                            setFormData({ ...formData, cylinderId: e.target.value, cylinderSpecKg: selected?.specKg || formData.cylinderSpecKg });
                          }}
                        >
                          <option value="">不指定鋼瓶</option>
                          {gasCylinders.map(cylinder => <option key={cylinder.id} value={cylinder.id}>{cylinder.cylinderNo} / {Number(cylinder.specKg || 0).toLocaleString()}kg / {optionLabel(GAS_CYLINDER_STATUS_OPTIONS, cylinder.status)}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">規格公斤數</label>
                        <input type="number" min="0" step="0.1" className="form-control" value={formData.cylinderSpecKg} onChange={e => setFormData({ ...formData, cylinderSpecKg: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">押金金額</label>
                        <input type="number" min="0" step="1" className="form-control" value={formData.depositAmount} onChange={e => setFormData({ ...formData, depositAmount: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">押瓶狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.depositStatus} onChange={e => setFormData({ ...formData, depositStatus: e.target.value })}>
                          {GAS_DEPOSIT_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">押瓶日期</label>
                        <input type="date" className="form-control" value={formData.startedAt} onChange={e => setFormData({ ...formData, startedAt: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">退瓶日期</label>
                        <input type="date" className="form-control" value={formData.returnedAt} onChange={e => setFormData({ ...formData, returnedAt: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Amount Field */}
                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">單價 (TWD)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="例如：850"
                          className="form-control"
                          value={formData.unitPrice}
                          onChange={e => updateAmountCalculation({ unitPrice: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">數量</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="例如：12"
                          className="form-control"
                          value={formData.quantity}
                          onChange={e => updateAmountCalculation({ quantity: e.target.value })}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
                      系統計算金額：{Number(formData.calculatedAmount || 0).toLocaleString()}
                    </div>
                    {activeSubTab === 'income' && (
                      <>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">銷售瓦斯公斤數</label>
                            <input type="number" min="0" step="0.01" placeholder="例如：240" className="form-control" value={formData.gasKg} onChange={e => setFormData({ ...formData, gasKg: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">鋼瓶 / 桶數</label>
                            <input type="number" min="0" step="1" placeholder="例如：20" className="form-control" value={formData.cylinderQty} onChange={e => setFormData({ ...formData, cylinderQty: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">配送趟數</label>
                            <input type="number" min="0" step="1" placeholder="例如：8" className="form-control" value={formData.deliveryTrips} onChange={e => setFormData({ ...formData, deliveryTrips: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">客戶類型</label>
                            <select className="select-dropdown" style={{ width: '100%' }} value={formData.customerType} onChange={e => setFormData({ ...formData, customerType: e.target.value })}>
                              <option value="">未分類</option>
                              <option value="home">家庭客戶</option>
                              <option value="restaurant">餐飲客戶</option>
                              <option value="business">營業客戶</option>
                              <option value="dealer">經銷 / 同業</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {activeSubTab !== 'loan' && activeSubTab !== 'gas' && activeSubTab !== 'dailySummary' && !GAS_OPERATION_TABS.includes(activeSubTab) && (
                  <div className="form-group">
                    <label className="form-label">{activeSubTab === 'income' ? '收入金額' : '支出金額'}</label>
                    <input type="number" required placeholder="請輸入金額" className="form-control" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                  </div>
                )}

                {/* 3. Account Category */}
                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">會計科目</label>
                    <select required className="select-dropdown" style={{ width: '100%' }} value={formData.accountCode} onChange={e => setFormData({ ...formData, accountCode: e.target.value })}>
                      {activeSubTab === 'income' 
                        ? revenueAccounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name} ({a.desc})</option>)
                        : cogsExpenseAccounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name} ({a.desc})</option>)
                      }
                    </select>
                  </div>
                )}

                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">{activeSubTab === 'income' ? '收款方式' : '付款方式'}</label>
                    <select
                      required
                      className="select-dropdown"
                      style={{ width: '100%' }}
                      value={formData.paymentMethod}
                      onChange={e => setFormData({
                        ...formData,
                        paymentMethod: e.target.value,
                        bankId: e.target.value === 'bank_transfer' ? (formData.bankId || banks[0]?.id || '') : ''
                      })}
                    >
                      {PAYMENT_METHOD_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {formData.paymentMethod === 'check' && (activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">支票號碼</label>
                      <input type="text" className="form-control" value={formData.checkNo} onChange={e => setFormData({ ...formData, checkNo: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">支票到期日</label>
                      <input type="date" className="form-control" value={formData.checkDueDate} onChange={e => setFormData({ ...formData, checkDueDate: e.target.value })} />
                    </div>
                  </div>
                )}

                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">{activeSubTab === 'income' ? '客戶主檔' : '供應商主檔'}</label>
                    <select
                      className="select-dropdown"
                      style={{ width: '100%' }}
                      value={activeSubTab === 'income' ? formData.customerId || '' : formData.supplierId || ''}
                      onChange={e => {
                        if (activeSubTab === 'income') {
                          const selected = customers.find(item => item.id === e.target.value);
                          setFormData({
                            ...formData,
                            customerId: e.target.value,
                            counterpartyName: selected?.name || formData.counterpartyName,
                            counterpartyTaxId: selected?.taxId || formData.counterpartyTaxId
                          });
                        } else {
                          const selected = suppliers.find(item => item.id === e.target.value);
                          setFormData({
                            ...formData,
                            supplierId: e.target.value,
                            counterpartyName: selected?.name || formData.counterpartyName,
                            counterpartyTaxId: selected?.taxId || formData.counterpartyTaxId
                          });
                        }
                      }}
                    >
                      <option value="">不綁定主檔</option>
                      {(activeSubTab === 'income' ? customers : suppliers).map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">{activeSubTab === 'income' ? '客戶 / 對象名稱' : '供應商 / 對象名稱'}</label>
                    <input type="text" placeholder="可輸入對方名稱" className="form-control" value={formData.counterpartyName} onChange={e => setFormData({ ...formData, counterpartyName: e.target.value })} />
                  </div>
                )}

                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">發票號碼</label>
                        <input type="text" placeholder="例如：AB12345678" className="form-control" value={formData.invoiceNo} onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">發票日期</label>
                        <input type="date" className="form-control" value={formData.invoiceDate || formData.date} onChange={e => setFormData({ ...formData, invoiceDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">統一編號</label>
                        <input type="text" maxLength="8" placeholder="8 碼統編" className="form-control" value={formData.counterpartyTaxId} onChange={e => setFormData({ ...formData, counterpartyTaxId: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">稅別</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.taxType} onChange={e => setFormData({ ...formData, taxType: e.target.value })}>
                          <option value="taxable">應稅 5%</option>
                          <option value="zero">零稅率</option>
                          <option value="exempt">免稅</option>
                          <option value="non_vat">非營業稅</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">稅額</label>
                        <input type="number" min="0" placeholder="可留空由系統估算" className="form-control" value={formData.vatAmount} onChange={e => setFormData({ ...formData, vatAmount: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">金額稅別</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.taxIncluded ? 'included' : 'excluded'} onChange={e => setFormData({ ...formData, taxIncluded: e.target.value === 'included' })}>
                          <option value="included">含稅</option>
                          <option value="excluded">未稅</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {activeSubTab === 'expense' && formData.accountCode === '6101' && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">員工姓名</label>
                        <input type="text" className="form-control" value={formData.employeeName} onChange={e => setFormData({ ...formData, employeeName: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">薪資月份</label>
                        <input type="month" className="form-control" value={formData.payrollMonth} onChange={e => setFormData({ ...formData, payrollMonth: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">勞保扣款</label>
                        <input type="number" min="0" className="form-control" value={formData.laborInsurance} onChange={e => setFormData({ ...formData, laborInsurance: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">健保扣款</label>
                        <input type="number" min="0" className="form-control" value={formData.healthInsurance} onChange={e => setFormData({ ...formData, healthInsurance: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">勞退自提</label>
                        <input type="number" min="0" className="form-control" value={formData.pension} onChange={e => setFormData({ ...formData, pension: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">代扣所得稅</label>
                        <input type="number" min="0" className="form-control" value={formData.withholdingTax} onChange={e => setFormData({ ...formData, withholdingTax: e.target.value })} />
                      </div>
                    </div>
                  </>
                )}

                {['receivable', 'payable'].includes(formData.paymentMethod) && (activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">預計結清日期（選填）</label>
                    <input type="date" className="form-control" value={formData.dueDate || ''} onChange={e => setFormData({ ...formData, dueDate: e.target.value })} />
                  </div>
                )}

                {(activeSubTab === 'income' || activeSubTab === 'expense') && (
                  <div className="form-group">
                    <label className="form-label">憑證 / 發票照片附件（選填，限 5MB）</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="form-control" 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_WIDTH = 400;
                            const MAX_HEIGHT = 400;
                            let w = img.width;
                            let h = img.height;
                            if (w > h) {
                              if (w > MAX_WIDTH) {
                                h *= MAX_WIDTH / w;
                                w = MAX_WIDTH;
                              }
                            } else {
                              if (h > MAX_HEIGHT) {
                                w *= MAX_HEIGHT / h;
                                h = MAX_HEIGHT;
                              }
                            }
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            const compressed = canvas.toDataURL('image/jpeg', 0.7);
                            setAttachmentPreviewUrl(compressed);
                            setAttachmentUploading(true);
                            uploadCloudAttachment({ dataUrl: compressed, filename: file.name })
                              .then(attachment => {
                                setFormData(prev => ({ ...prev, receiptAttachment: attachment }));
                              })
                              .catch(error => {
                                setAttachmentPreviewUrl('');
                                setFormData(prev => ({ ...prev, receiptAttachment: '' }));
                                window.alert(error.message || '附件上傳失敗。');
                              })
                              .finally(() => setAttachmentUploading(false));
                          };
                          img.src = event.target.result;
                        };
                        reader.readAsDataURL(file);
                      }} 
                    />
                    {attachmentUploading && (
                      <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>附件正在上傳，完成後才能儲存。</div>
                    )}
                    {formData.receiptAttachment && (
                      <div style={{ marginTop: '8px', position: 'relative', display: 'inline-block' }}>
                        {attachmentPreviewUrl ? (
                          <img
                            src={attachmentPreviewUrl}
                            alt="憑證附件預覽"
                            style={{ maxWidth: '120px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                          />
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openReceiptPreview(formData.receiptAttachment)}>
                            預覽已上傳附件
                          </button>
                        )}
                        <button 
                          type="button" 
                          onClick={() => {
                            setAttachmentPreviewUrl('');
                            setFormData({ ...formData, receiptAttachment: '' });
                          }}
                          style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: 'var(--accent-red)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}
                        >
                          x
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Bank ID */}
                {(activeSubTab === 'loan' || ((activeSubTab === 'income' || activeSubTab === 'expense') && formData.paymentMethod === 'bank_transfer')) && (
                  <div className="form-group">
                    <label className="form-label">{activeSubTab === 'loan' ? '貸款銀行' : '收付款銀行'}</label>
                    <select required className="select-dropdown" style={{ width: '100%' }} value={formData.bankId} onChange={e => setFormData({ ...formData, bankId: e.target.value })}>
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.accountNo})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 5. Shareholder specifics */}
                {activeSubTab === 'shareholder' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">選擇股東</label>
                      <select required className="select-dropdown" style={{ width: '100%' }} value={formData.shareholderId} onChange={e => setFormData({ ...formData, shareholderId: e.target.value })}>
                        {shareholders.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">異動類型</label>
                      <select required className="select-dropdown" style={{ width: '100%' }} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                        <option value="join">加入股東 (Join)</option>
                        <option value="increase">增資 (Capital Increase)</option>
                        <option value="decrease">減資 / 提領 (Capital Reduction)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* 6. Loan specific fields */}
                {activeSubTab === 'loan' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">貸款名稱</label>
                      <input type="text" required placeholder="例如：營業週轉金貸款" className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">貸款本金</label>
                        <input type="number" required placeholder="請輸入金額" className="form-control" value={formData.principal} onChange={e => setFormData({ ...formData, principal: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">利率 (%)</label>
                        <input type="number" step="0.01" required placeholder="例如：2.1" className="form-control" value={formData.interestRate} onChange={e => setFormData({ ...formData, interestRate: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">貸款期數（月）</label>
                        <input type="number" required placeholder="期數" className="form-control" value={formData.months} onChange={e => setFormData({ ...formData, months: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">貸款日期</label>
                        <input type="date" required className="form-control" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">每月付款金額 (TWD)</label>
                      <input type="number" required placeholder="請輸入金額" className="form-control" value={formData.monthlyPayment} onChange={e => setFormData({ ...formData, monthlyPayment: e.target.value })} />
                    </div>
                  </>
                )}

                {activeSubTab === 'assets' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">資產名稱</label>
                      <input type="text" required className="form-control" value={formData.assetName} onChange={e => setFormData({ ...formData, assetName: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">資產類型</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                          <option value="truck">貨車</option>
                          <option value="cylinder">鋼瓶</option>
                          <option value="equipment">設備</option>
                          <option value="office">辦公設備</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">購入日期</label>
                        <input type="date" required className="form-control" value={formData.acquisitionDate} onChange={e => setFormData({ ...formData, acquisitionDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">購入成本</label>
                        <input type="number" min="0" required className="form-control" value={formData.acquisitionCost} onChange={e => setFormData({ ...formData, acquisitionCost: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">耐用月數</label>
                        <input type="number" min="1" required className="form-control" value={formData.usefulLifeMonths} onChange={e => setFormData({ ...formData, usefulLifeMonths: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">殘值</label>
                        <input type="number" min="0" className="form-control" value={formData.residualValue} onChange={e => setFormData({ ...formData, residualValue: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">資產狀態</label>
                        <select className="select-dropdown" style={{ width: '100%' }} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                          <option value="active">使用中</option>
                          <option value="disposed">已處分</option>
                        </select>
                      </div>
                    </div>
                    {formData.status === 'disposed' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">處分日期</label>
                          <input type="date" className="form-control" value={formData.disposalDate} onChange={e => setFormData({ ...formData, disposalDate: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">處分金額</label>
                          <input type="number" min="0" className="form-control" value={formData.disposalAmount} onChange={e => setFormData({ ...formData, disposalAmount: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 7. Status field */}
                {activeSubTab !== 'shareholder' && activeSubTab !== 'gas' && activeSubTab !== 'assets' && !GAS_OPERATION_TABS.includes(activeSubTab) && (
                  <div className="form-group">
                    <label className="form-label">審核狀態</label>
                    <select required className="select-dropdown" style={{ width: '100%' }} value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                      <option value="pending_admin_review">待審核</option>
                      <option value="draft">草稿</option>
                    </select>
                  </div>
                )}

                {/* 8. Remarks */}
                <div className="form-group">
                  <label className="form-label">備註 / 補充說明</label>
                  <input type="text" placeholder="可輸入備註" className="form-control" value={formData.remarks} onChange={e => setFormData({ ...formData, remarks: e.target.value })} />
                </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={attachmentUploading}>
                  {attachmentUploading ? '附件上傳中' : '儲存資料'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AR/AP Clearance Modal */}
      {clearingItem && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {clearingItem.paymentMethod === 'check' ? '支票兌現入帳' : '應收 / 應付結清'}
              </span>
              <button type="button" className="modal-close" onClick={() => setClearingItem(null)}>x</button>
            </div>
            <form onSubmit={handleClearSubmit}>
              <div className="modal-body">
                <div style={{ backgroundColor: 'var(--card-bg-hover)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>結清資料：{clearingItem.id} ({getAccountName(clearingItem.accountCode)})</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: clearingItem.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)', marginTop: '4px' }}>
                    待結清金額：{Number(clearingItem.amount).toLocaleString()} TWD
                  </div>
                  {clearingItem.checkNo && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: '600' }}>支票號碼：{clearingItem.checkNo}</div>}
                  {clearingItem.counterpartyName && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>對象：{clearingItem.counterpartyName}</div>}
                </div>

                {clearingItem.paymentMethod === 'check' ? (
                  <div className="form-group">
                    <label className="form-label">兌現存入 / 付款銀行</label>
                    <select 
                      required 
                      className="select-dropdown" 
                      style={{ width: '100%' }}
                      value={clearData.bankId}
                      onChange={e => setClearData({ ...clearData, bankId: e.target.value })}
                    >
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.accountNo})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">收款 / 付款方式</label>
                      <select 
                        required 
                        className="select-dropdown" 
                        style={{ width: '100%' }}
                        value={clearData.method}
                        onChange={e => setClearData({ 
                          ...clearData, 
                          method: e.target.value,
                          bankId: e.target.value === 'bank_transfer' ? (clearData.bankId || banks[0]?.id || '') : ''
                        })}
                      >
                        <option value="bank_transfer">銀行轉帳</option>
                        <option value="cash">現金（不進銀行帳）</option>
                        <option value="check">支票</option>
                        <option value="other">其他</option>
                      </select>
                    </div>

                    {clearData.method === 'bank_transfer' && (
                      <div className="form-group">
                        <label className="form-label">入帳銀行帳戶</label>
                        <select 
                          required 
                          className="select-dropdown" 
                          style={{ width: '100%' }}
                          value={clearData.bankId}
                          onChange={e => setClearData({ ...clearData, bankId: e.target.value })}
                        >
                          {banks.map(b => (
                            <option key={b.id} value={b.id}>{b.name} ({b.accountNo})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">實際結清日期</label>
                  <input 
                    type="date" 
                    required 
                    className="form-control" 
                    value={clearData.date} 
                    onChange={e => setClearData({ ...clearData, date: e.target.value })} 
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setClearingItem(null)}>取消</button>
                <button type="submit" className="btn btn-primary">確認結清並入帳</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Viewer Modal */}
      {detailItem && (() => {
        const { type, item } = detailItem;
        const fmtVal = (val) => `$${Number(val || 0).toLocaleString()}`;
        
        // Compute correction history chain
        const chain = ['income', 'expense'].includes(type) ? (() => {
          const isIncome = type === 'income';
          const db = isIncome ? getIncomes() : getExpenses();
          const list = [];
          
          let current = item;
          // Traverse up to find root
          while (current && current.correctionOf) {
            const parent = db.find(row => row.id === current.correctionOf);
            if (!parent) break;
            current = parent;
          }
          
          if (!current) return [];
          list.push({ role: 'original', item: current });
          
          const findCorrectionsFor = (parentId) => {
            const children = db.filter(row => row.correctionOf === parentId);
            children.forEach(child => {
              list.push({
                role: child.correctionType || (child.amount < 0 ? 'reversal' : 'replacement'),
                item: child
              });
              if (child.correctionStatus === 'corrected') {
                findCorrectionsFor(child.id);
              }
            });
          };
          
          findCorrectionsFor(current.id);
          return list;
        })() : [];

        const DetailRow = ({ label, value, isBold, color }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{label}</span>
            <span style={{ fontWeight: isBold ? 700 : 400, color: color || 'var(--text-primary)', textAlign: 'right', fontSize: '0.95rem' }}>{value || '-'}</span>
          </div>
        );

        const SectionHeader = ({ title }) => (
          <h4 style={{ margin: '18px 0 8px 0', fontSize: '0.92rem', color: 'var(--accent-blue)', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '4px', fontWeight: 'bold' }}>{title}</h4>
        );

        return (
          <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={() => setDetailItem(null)}>
            <div className="modal-content" style={{ maxWidth: '650px', width: '90%', textAlign: 'left', padding: '20px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <span className="modal-title" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  📋 明細詳情 {['income', 'expense'].includes(type) ? `(${item.id})` : ''}
                </span>
                <button type="button" className="modal-close" onClick={() => setDetailItem(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
              </div>

              <div className="modal-body" style={{ padding: '12px 0', overflowY: 'auto', flex: 1 }}>
                
                {['income', 'expense'].includes(type) && (
                  <div>
                    <SectionHeader title="💰 基本交易明細" />
                    <DetailRow label="交易單號 (ID)" value={item.id} isBold={true} />
                    <DetailRow label="記帳日期" value={item.date} />
                    <DetailRow label="交易類型" value={type === 'income' ? '收入' : '支出'} color={type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    <DetailRow label="會計科目" value={`${item.accountCode || ''} ${getAccountName(item.accountCode)}`} isBold={true} />
                    {item.accountCode === '6101' && item.employeeName && (
                      <DetailRow label="員工姓名" value={item.employeeName} isBold={true} color="var(--accent-blue)" />
                    )}
                    {item.accountCode === '6101' && item.payrollMonth && (
                      <DetailRow label="薪資月份" value={item.payrollMonth} />
                    )}
                    
                    <SectionHeader title="💵 金流與計量資訊" />
                    {item.unitPrice && <DetailRow label="交易單價" value={fmtVal(item.unitPrice)} />}
                    {item.quantity && <DetailRow label="交易數量" value={`${item.quantity} 桶`} />}
                    {item.gasKg && <DetailRow label="瓦斯重量" value={`${Number(item.gasKg).toLocaleString()} kg`} isBold={true} />}
                    {item.cylinderQty && <DetailRow label="鋼瓶數量" value={`${item.cylinderQty} 桶`} />}
                    {item.deliveryTrips && <DetailRow label="配送車次" value={`${item.deliveryTrips} 次`} />}
                    <DetailRow label="實收/實付金額" value={fmtVal(item.amount)} color={type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    
                    {item.accountCode === '6101' && (Number(item.laborInsurance) > 0 || Number(item.healthInsurance) > 0 || Number(item.pension) > 0 || Number(item.withholdingTax) > 0) && (
                      <>
                        <SectionHeader title="📝 薪資扣款明細" />
                        {Number(item.laborInsurance) > 0 && <DetailRow label="勞保扣款" value={fmtVal(item.laborInsurance)} />}
                        {Number(item.healthInsurance) > 0 && <DetailRow label="健保扣款" value={fmtVal(item.healthInsurance)} />}
                        {Number(item.pension) > 0 && <DetailRow label="勞退自提" value={fmtVal(item.pension)} />}
                        {Number(item.withholdingTax) > 0 && <DetailRow label="代扣所得稅" value={fmtVal(item.withholdingTax)} />}
                      </>
                    )}
                    
                    <SectionHeader title="👤 交易對象與憑證" />
                    <DetailRow label="交易對象名稱" value={item.counterpartyName} />
                    {item.taxId && <DetailRow label="統一編號" value={item.taxId} />}
                    {item.invoiceNo && <DetailRow label="發票號碼" value={item.invoiceNo} />}
                    {item.invoiceDate && <DetailRow label="發票日期" value={item.invoiceDate} />}
                    
                    <SectionHeader title="💳 收付款與審核狀態" />
                    <DetailRow label="付款方式" value={getPaymentDisplay(item)} />
                    <DetailRow label="付款狀態" value={item.paymentStatus === 'paid' ? '已結清' : '未結清'} color={item.paymentStatus === 'paid' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    {item.bankId && <DetailRow label="交易銀行" value={getBankName(item.bankId)} />}
                    {item.checkNo && <DetailRow label="支票號碼" value={item.checkNo} />}
                    {item.checkDueDate && <DetailRow label="支票到期日" value={item.checkDueDate} />}
                    <DetailRow label="審核狀態" value={STATUS_LABELS[item.status] || item.status} color={item.status === 'approved' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    
                    <SectionHeader title="📝 備註與建立資訊" />
                    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>備註</span>
                      <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{item.remarks || '（無備註說明）'}</div>
                    </div>
                    <DetailRow label="經辦人員" value={item.createdByName || '系統管理員'} />
                    <DetailRow label="建立時間" value={formatDateTime(item.createdAt)} />

                    {/* History Chain Timeline */}
                    {chain.length > 1 && (
                      <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px dashed var(--accent-blue)' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '0.95rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🔄 沖銷與更正歷史紀錄
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--border-color)', margin: '10px 0' }}>
                          {chain.map((step, sIdx) => {
                            const stepItem = step.item;
                            const isCurrent = stepItem.id === item.id;
                            const isReversal = step.role === 'reversal' || stepItem.amount < 0;
                            
                            return (
                              <div key={stepItem.id} style={{ position: 'relative', fontSize: '0.85rem' }}>
                                {/* Timeline Dot */}
                                <div style={{
                                  position: 'absolute',
                                  left: '-27px',
                                  top: '2px',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  backgroundColor: isCurrent ? 'var(--accent-blue)' : isReversal ? 'var(--accent-red)' : 'var(--text-tertiary)',
                                  border: '2px solid var(--bg-secondary)'
                                }} />
                                
                                {/* Step Card Content */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 'bold', color: isCurrent ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                                      {stepItem.id} ({step.role === 'original' ? '原始單據' : isReversal ? '沖銷傳票' : '更正後新單據'})
                                      {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.72rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--accent-blue)', color: '#fff' }}>本單據</span>}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{stepItem.date}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                                    <span>金額：<strong style={{ color: stepItem.amount < 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{fmtVal(stepItem.amount)}</strong></span>
                                    <span>經辦：{stepItem.createdByName || '系統'}</span>
                                    {stepItem.status && <span>狀態：{STATUS_LABELS[stepItem.status] || stepItem.status}</span>}
                                  </div>
                                  {stepItem.remarks && (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px', fontStyle: 'italic' }}>
                                      備註/更正原因：{stepItem.remarks}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {item.status === 'void' && (
                      <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', borderLeft: '4px solid var(--accent-red)' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--accent-red)', fontSize: '0.9rem', marginBottom: '6px' }}>🚫 此單據已沖銷/更正</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>更正經辦：{item.voidedBy || item.correctedBy || '系統'}</div>
                        {item.correctionReason && <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: '4px' }}>更正原因：{item.correctionReason}</div>}
                      </div>
                    )}

                    {item.receiptAttachment && (
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginTop: '16px', backgroundColor: 'var(--bg-secondary)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>📎 憑證附件預覽</div>
                        <div style={{ textAlign: 'center' }}>
                          <img 
                            src={getCloudAttachmentUrl(item.receiptAttachment)} 
                            alt="Attachment Preview" 
                            style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '4px', cursor: 'pointer', objectFit: 'contain' }} 
                            onClick={() => openReceiptPreview(item.receiptAttachment)}
                            title="點擊圖片放大檢視憑證"
                          />
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            點擊圖片可放大檢視憑證
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {type === 'dailySummary' && (() => {
                  const relatedEntries = [
                    ...getIncomes().filter(inc => inc.companyId === companyId && inc.date === item.date && inc.remarks && inc.remarks.startsWith('當日營業彙總 -')),
                    ...getExpenses().filter(exp => exp.companyId === companyId && exp.date === item.date && exp.remarks && exp.remarks.startsWith('當日營業彙總 -')),
                    ...getBankTransactions().filter(bt => bt.companyId === companyId && bt.date === item.date && bt.remarks && bt.remarks.startsWith('當日營業彙總 -'))
                  ];

                  return (
                    <div>
                      <SectionHeader title="📅 每日彙總主資訊" />
                      <DetailRow label="彙總日期" value={item.date} isBold={true} />
                      <DetailRow label="瓦斯總收入 (應計)" value={fmtVal(item.gasTotalIncome)} isBold={true} />
                      <DetailRow label="當日總營業額 (合計)" value={fmtVal(item.salesAmount)} color="var(--accent-green)" isBold={true} />
                      
                      <SectionHeader title="💵 營收金流拆分" />
                      <DetailRow label="現場收款 (現收)" value={fmtVal(item.paidAmount)} color="var(--accent-green)" />
                      <DetailRow label="欠款金額 (現結未付)" value={fmtVal(item.unpaidAmount)} color="var(--accent-red)" />
                      <DetailRow label="月結應收帳款 (月結)" value={fmtVal(item.arAmount)} color="var(--accent-purple)" />
                      <DetailRow label="還款金額 (收回舊欠)" value={fmtVal(item.repaymentAmount)} color="var(--accent-gold)" />

                      <SectionHeader title="📦 數量與計量指標" />
                      <DetailRow label="合計銷售重量" value={`${Number(item.totalWeight).toLocaleString()} kg`} />
                      <DetailRow label="合計銷售數量" value={`${Number(item.totalCylinders).toLocaleString()} 桶`} />
                      <DetailRow label="平均公斤單價" value={`$${Number(item.avgPrice).toFixed(2)} / kg`} />

                      <SectionHeader title="🍳 其它營業收入" />
                      <DetailRow label="爐具收入" value={fmtVal(item.stoveIncome)} />
                      <DetailRow label="維修/安裝 收入" value={fmtVal(item.repairIncome)} />
                      <DetailRow label="買桶收入" value={fmtVal(item.cylinderIncome)} />
                      <DetailRow label="檢驗費收入" value={fmtVal(item.inspectionIncome)} />
                      <DetailRow label="押瓶收入" value={fmtVal(item.depositIncome)} />

                      <SectionHeader title={`📋 系統關聯拆帳傳票 (${relatedEntries.length} 筆)`} />
                      <div className="table-responsive" style={{ maxHeight: '200px', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '8px' }}>
                        <table className="data-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                              <th>流水號</th>
                              <th>會計科目</th>
                              <th>付款方式</th>
                              <th style={{ textAlign: 'right' }}>金額</th>
                              <th>狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {relatedEntries.map(entry => (
                              <tr key={entry.id} style={{ cursor: 'pointer' }} onClick={() => setDetailItem({ type: entry.gasKg !== undefined ? 'income' : 'expense', item: entry })}>
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{entry.id}</td>
                                <td>{getAccountName(entry.accountCode)}</td>
                                <td>{getPaymentDisplay(entry)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: entry.remarks.includes('支出') || entry.amount < 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{fmtVal(entry.amount)}</td>
                                <td><span className="badge approved" style={{ padding: '2px 4px', fontSize: '0.7rem' }}>已核准</span></td>
                              </tr>
                            ))}
                            {relatedEntries.length === 0 && (
                              <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>無自動拆帳明細 (可能以歷史方式保留)</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        * 點擊上方表格中的拆帳單據，可進一步查看該筆單據的詳細明細。
                      </div>
                    </div>
                  );
                })()}

                {type === 'checks' && (
                  <div>
                    <SectionHeader title="🧾 支票票據明細" />
                    <DetailRow label="支票號碼" value={item.checkNo || '未填寫'} isBold={true} />
                    <DetailRow label="到期日" value={item.checkDueDate || '未填寫'} isBold={true} color="var(--accent-blue)" />
                    <DetailRow label="票據類型" value={item.type === 'income' ? '應收支票 (客票)' : '應付支票 (本票)'} color={item.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    <DetailRow label="對象 (客戶/廠商)" value={item.counterpartyName} />
                    <DetailRow label="票面金額" value={fmtVal(item.amount)} isBold={true} color={item.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)'} />
                    <DetailRow label="關聯科目" value={`${item.accountCode || ''} ${getAccountName(item.accountCode)}`} />
                    <DetailRow label="兌現狀態" value={item.paymentStatus === 'paid' ? '已結清兌現' : '未兌現 (待兌現)'} color={item.paymentStatus === 'paid' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    {item.bankId && <DetailRow label="入帳/扣款銀行" value={getBankName(item.bankId)} />}
                    <DetailRow label="備註" value={item.remarks} />

                    {item.receiptAttachment && (
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', marginTop: '16px', backgroundColor: 'var(--bg-secondary)' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.9rem' }}>📎 支票正反面影本預覽</div>
                        <div style={{ textAlign: 'center' }}>
                          <img 
                            src={getCloudAttachmentUrl(item.receiptAttachment)} 
                            alt="Attachment Preview" 
                            style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '4px', cursor: 'pointer', objectFit: 'contain' }} 
                            onClick={() => openReceiptPreview(item.receiptAttachment)}
                            title="點擊圖片放大檢視憑證"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {type === 'bankReconciliation' && (
                  <div>
                    <SectionHeader title="⚖️ 銀行對帳明細" />
                    <DetailRow label="對帳單號 (ID)" value={item.id} isBold={true} />
                    <DetailRow label="對帳截止日" value={item.statementDate} isBold={true} />
                    <DetailRow label="核對銀行" value={getBankName(item.bankId)} isBold={true} />
                    <DetailRow label="對帳單銀行餘額" value={fmtVal(item.statementBalance)} />
                    <DetailRow label="系統帳面餘額" value={fmtVal(item.systemBalance)} />
                    <DetailRow label="對帳差額" value={fmtVal(item.difference)} color={Math.abs(item.difference) < 1 ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                    <DetailRow label="對帳結果" value={item.status === 'balanced' ? '核對平衡' : '核對有差額'} color={item.status === 'balanced' ? 'var(--accent-green)' : 'var(--accent-red)'} isBold={true} />
                  </div>
                )}

                {type === 'gasCylinders' && (
                  <div>
                    <SectionHeader title="🛢️ 鋼瓶基本規格" />
                    <DetailRow label="鋼瓶序號" value={item.cylinderNo} isBold={true} />
                    <DetailRow label="規格容量 (kg)" value={`${item.specKg} kg`} isBold={true} />
                    <DetailRow label="所有權屬" value={optionLabel(GAS_OWNERSHIP_OPTIONS, item.ownershipStatus)} />
                    <DetailRow label="條碼 (Barcode)" value={item.barcode} />
                    <DetailRow label="QR Code 內容" value={item.qrCode} />
                    
                    <SectionHeader title="📦 存放位置與檢驗期限" />
                    <DetailRow label="目前位置" value={`${optionLabel(GAS_LOCATION_OPTIONS, item.locationType)} - ${getGasLocationDisplay(item.locationType, item.locationId, item)}`} isBold={true} />
                    <DetailRow label="鋼瓶狀態" value={optionLabel(GAS_CYLINDER_STATUS_OPTIONS, item.status)} isBold={true} />
                    <DetailRow label="上次檢驗日期" value={item.lastInspectionDate} />
                    <DetailRow label="檢驗到期日" value={item.inspectionDueDate || item.nextInspectionDate} color={item.inspectionDueDate && item.inspectionDueDate < new Date().toISOString().split('T')[0] ? 'var(--accent-red)' : 'var(--accent-blue)'} isBold={true} />
                    
                    <DetailRow label="備註說明" value={item.remarks} />
                  </div>
                )}

                {type === 'assets' && (() => {
                  const assetWithDep = fixedAssetSummary.assets.find(asset => asset.id === item.id);
                  const depreciation = assetWithDep?.depreciation || {};
                  return (
                    <div>
                      <SectionHeader title="🚒 固定資產規格" />
                      <DetailRow label="資產代號 (ID)" value={item.id} isBold={true} />
                      <DetailRow label="資產名稱" value={item.assetName} isBold={true} />
                      <DetailRow label="資產類別" value={item.category} />
                      <DetailRow label="購入日期" value={item.acquisitionDate} />
                      
                      <SectionHeader title="📈 折舊與帳面估值" />
                      <DetailRow label="購置取得成本" value={fmtVal(item.acquisitionCost)} isBold={true} />
                      <DetailRow label="折舊年限 (月)" value={`${item.depreciationMonths || '-'} 個月`} />
                      <DetailRow label="月折舊額" value={fmtVal(depreciation.monthlyDepreciation || 0)} />
                      <DetailRow label="累計已折舊金額" value={fmtVal(depreciation.accumulatedDepreciation || 0)} color="var(--accent-red)" isBold={true} />
                      <DetailRow label="目前資產帳面淨值" value={fmtVal(depreciation.bookValue || item.acquisitionCost || 0)} color="var(--accent-blue)" isBold={true} />
                      <DetailRow label="資產狀態" value={item.status === 'active' ? '使用中固定資產' : '已處分'} color={item.status === 'active' ? 'var(--accent-green)' : 'var(--text-secondary)'} isBold={true} />
                      
                      <DetailRow label="備註說明" value={item.remarks} />
                    </div>
                  );
                })()}

                {type === 'shareholder' && (
                  <div>
                    <SectionHeader title="👤 股東權益異動" />
                    <DetailRow label="流水號 (ID)" value={item.id} isBold={true} />
                    <DetailRow label="記帳日期" value={item.date} />
                    <DetailRow label="股東姓名" value={getShareholderName(item.shareholderId)} isBold={true} />
                    <DetailRow label="權益異動類型" value={item.type === 'join' ? '原始入股' : item.type === 'increase' ? '股東增資' : '減資提領'} color={item.type === 'decrease' ? 'var(--accent-red)' : 'var(--accent-gold)'} isBold={true} />
                    <DetailRow label="異動金額" value={fmtVal(item.amount)} color={item.type === 'decrease' ? 'var(--accent-red)' : 'var(--accent-gold)'} isBold={true} />
                    <DetailRow label="備註說明" value={item.remarks} />
                  </div>
                )}

                {type === 'loan' && (
                  <div>
                    <SectionHeader title="🏦 銀行借貸款資訊" />
                    <DetailRow label="貸款合約 ID" value={item.id} isBold={true} />
                    <DetailRow label="貸款名稱" value={item.name} isBold={true} />
                    <DetailRow label="承貸銀行" value={getBankName(item.bankId)} isBold={true} />
                    <DetailRow label="貸款本金金額" value={fmtVal(item.principal)} isBold={true} />
                    <DetailRow label="貸款年利率" value={`${item.interestRate}%`} />
                    <DetailRow label="償還總期數" value={`${item.months} 個月`} />
                    <DetailRow label="每月應付本息" value={fmtVal(item.monthlyPayment)} color="var(--accent-blue)" isBold={true} />
                    <DetailRow label="備註說明" value={item.remarks} />
                  </div>
                )}

                {!['income', 'expense', 'dailySummary', 'checks', 'bankReconciliation', 'gasCylinders', 'assets', 'shareholder', 'loan'].includes(type) && (
                  <div>
                    <SectionHeader title="📋 詳細屬性資料" />
                    {Object.entries(item).map(([key, val]) => {
                      if (typeof val === 'object' && val !== null) {
                        return <DetailRow key={key} label={key} value={JSON.stringify(val)} />;
                      }
                      return <DetailRow key={key} label={key} value={String(val || '')} />;
                    })}
                  </div>
                )}

              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setDetailItem(null)}>關閉詳情</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Viewing Receipt Image Modal */}
      {viewingReceiptUrl && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={closeReceiptPreview}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', textAlign: 'center', padding: '16px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">憑證 / 發票附件預覽</span>
              <button type="button" className="modal-close" onClick={closeReceiptPreview}>x</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 0', overflowY: 'auto' }}>
              <img 
                src={viewingReceiptUrl} 
                alt="Receipt Attachment" 
                style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '6px', border: '1px solid var(--border-color)', objectFit: 'contain', cursor: 'zoom-in' }} 
                onClick={() => {
                  const newWindow = window.open('', '_blank', 'noopener,noreferrer');
                  if (newWindow) {
                    const img = newWindow.document.createElement('img');
                    img.src = viewingReceiptUrl;
                    img.alt = 'Receipt Attachment';
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    newWindow.document.body.style.margin = '0';
                    newWindow.document.body.appendChild(img);
                  }
                }}
                title="點擊圖片可另開新視窗查看原圖"
              />
              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                點擊圖片可另開新視窗檢視，方便放大核對憑證。
              </div>
            </div>
            <div className="modal-footer" style={{ paddingBottom: 0 }}>
              <button type="button" className="btn btn-secondary" onClick={closeReceiptPreview}>關閉附件</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

