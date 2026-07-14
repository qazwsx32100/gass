import React, { useEffect, useState, useMemo } from 'react';
import {
  getIncomes, saveIncomes,
  getExpenses, saveExpenses,
  getShareholderLedger, saveShareholderLedger,
  getLoans, saveLoans,
  getGasInventoryPeriods, saveGasInventoryPeriods,
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
    if (tab === 'loan') return item.startDate;
    if (tab === 'assets') return item.acquisitionDate;
    return item.date;
  };
  const blockIfPeriodLocked = (dateOrYearMonth, actionLabel = '新增') => {
    if (!isPeriodLocked(companyId, dateOrYearMonth)) return false;
    window.alert(`此月份已鎖帳，不能${actionLabel}。請改用更正沖銷或請系統管理員重新開放月份。`);
    return true;
  };

  useEffect(() => {
    if (activeSubTab === 'shareholder' && !showShareholderLedger) setActiveSubTab('income');
    if (activeSubTab === 'loan' && !showLoans) setActiveSubTab('income');
    if (activeSubTab === 'log' && !showAuditLogs) setActiveSubTab('income');
    if (activeSubTab === 'gas' && !canWriteBasicLedger) setActiveSubTab('income');
  }, [activeSubTab, showShareholderLedger, showLoans, showAuditLogs, canWriteBasicLedger]);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // If null, we are adding new

  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null);
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

  const checkItems = useMemo(() => {
    const incs = getIncomes().filter(i => i.companyId === companyId && i.paymentMethod === 'check' && i.status === 'approved');
    const exps = getExpenses().filter(e => e.companyId === companyId && e.paymentMethod === 'check' && e.status === 'approved');

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
    if (blockIfPeriodLocked(clearingItem.date, '結清原應收應付')) return;
    if (blockIfPeriodLocked(clearData.date, '結清入帳')) return;

    const isIncome = clearingItem.type === 'income';
    const db = isIncome ? getIncomes() : getExpenses();
    const index = db.findIndex(x => x.id === clearingItem.id);
    if (index === -1) return;

    const before = { ...db[index] };
    const isClearingCheck = clearingItem.paymentMethod === 'check';
    let targetBankName = '';
    let methodLabel = '';

    if (isClearingCheck) {
      targetBankName = getBankName(clearData.bankId) || '未指定銀行';
      db[index] = {
        ...db[index],
        bankId: clearData.bankId,
        paymentStatus: 'paid',
        remarks: `${db[index].remarks || ''} (${clearData.date} 支票兌現入帳：${targetBankName})`.trim()
      };
    } else {
      methodLabel = PAYMENT_METHOD_OPTIONS.find(o => o.value === clearData.method)?.label || clearData.method;
      targetBankName = clearData.method === 'bank_transfer' ? getBankName(clearData.bankId) : '現金';
      db[index] = {
        ...db[index],
        paymentMethod: clearData.method,
        bankId: clearData.method === 'bank_transfer' ? clearData.bankId : (clearData.method === 'cash' ? 'BANK_PETTY' : ''),
        paymentStatus: 'paid',
        remarks: `${db[index].remarks || ''} (${clearData.date} 以 ${methodLabel} 結清：${targetBankName})`.trim()
      };
    }

    if (isIncome) saveIncomes(db);
    else saveExpenses(db);

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
    const incomes = getIncomes().filter(i => i.companyId === companyId && i.paymentStatus === 'unpaid' && i.status === 'approved');
    const expenses = getExpenses().filter(e => e.companyId === companyId && e.paymentStatus === 'unpaid' && e.status === 'approved');
    
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
      const rows = getIncomes().filter(i => i.companyId === companyId);
      return userRole === USER_ROLES.BOOKKEEPER ? rows.filter(i => !i.createdBy || i.createdBy === currentUser?.id) : rows;
    }
    if (activeSubTab === 'expense') {
      const rows = getExpenses().filter(e => e.companyId === companyId);
      return userRole === USER_ROLES.BOOKKEEPER ? rows.filter(e => !e.createdBy || e.createdBy === currentUser?.id) : rows;
    }
    if (activeSubTab === 'gas') return getGasInventoryPeriods().filter(item => item.companyId === companyId).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
    if (activeSubTab === 'assets') return getFixedAssets().filter(item => item.companyId === companyId).sort((a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate));
    if (activeSubTab === 'shareholder') return getShareholderLedger().filter(s => s.companyId === companyId);
    if (activeSubTab === 'loan') return getLoans().filter(l => l.companyId === companyId);
    return [];
  }, [activeSubTab, companyId, triggerRefresh, userRole, currentUser]);

  // Generate Unique ID
  const generateId = (type, date) => {
    const datePrefix = date ? date.replace(/-/g, '').substring(0, 6) : new Date().toISOString().replace(/-/g, '').substring(0, 6);
    const prefix = {
      income: `REV${datePrefix}`,
      expense: `EXP${datePrefix}`,
      gas: `GAS${datePrefix}`,
      shareholder: `SHL${datePrefix}`,
      loan: 'LOAN',
      asset: `AST${datePrefix}`
    }[type];

    // Find highest sequence number
    let list = [];
    if (type === 'income') list = getIncomes();
    if (type === 'expense') list = getExpenses();
    if (type === 'gas') list = getGasInventoryPeriods();
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
      status: 'pending_admin_review',
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
      disposalAmount: ''
    });
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEdit = (item) => {
    setEditingItem(item);
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
      depreciationMethod: item.depreciationMethod || 'straight_line',
      disposalDate: item.disposalDate || '',
      disposalAmount: item.disposalAmount || ''
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

  // Save form data
  const handleSave = (e) => {
    e.preventDefault();
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
            收入 (Income)
          </button>
          <button className={`tab-btn ${activeSubTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveSubTab('expense')}>
            支出 (Expense)
          </button>
          <button className={`tab-btn ${activeSubTab === 'arap' ? 'active' : ''}`} onClick={() => setActiveSubTab('arap')} style={{ color: 'var(--accent-blue)', fontWeight: '700' }}>
            應收應付 (AR/AP)
          </button>
          <button className={`tab-btn ${activeSubTab === 'checks' ? 'active' : ''}`} onClick={() => setActiveSubTab('checks')} style={{ color: 'var(--accent-gold)', fontWeight: '700' }}>
            支票管理 (Check Ledger)
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
          {canWriteBasicLedger && (
            <button className={`tab-btn ${activeSubTab === 'gas' ? 'active' : ''}`} onClick={() => setActiveSubTab('gas')} style={{ color: 'var(--accent-green)', fontWeight: '700' }}>
              瓦斯進貨 / 毛利
            </button>
          )}
          {showShareholderLedger && (
            <button className={`tab-btn ${activeSubTab === 'shareholder' ? 'active' : ''}`} onClick={() => setActiveSubTab('shareholder')}>
              股東往來 (Shareholder Ledger)
            </button>
          )}
          {showLoans && (
            <button className={`tab-btn ${activeSubTab === 'loan' ? 'active' : ''}`} onClick={() => setActiveSubTab('loan')}>
              貸款 (Loans)
            </button>
          )}
          {showAuditLogs && (
            <button className={`tab-btn ${activeSubTab === 'log' ? 'active' : ''}`} onClick={() => setActiveSubTab('log')} style={{ color: 'var(--accent-gold)' }}>
              操作稽核日誌 (Audit Logs)
            </button>
          )}
        </div>
        {activeSubTab !== 'log' && activeSubTab !== 'arap' && activeSubTab !== 'checks' && activeSubTab !== 'bankRecon' && activeSubTab !== 'aging' && canWriteBasicLedger && (isAdmin || activeSubTab === 'gas' || manageShareholderLedger || (activeSubTab !== 'shareholder' && activeSubTab !== 'loan')) && (
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            新增記錄
          </button>
        )}
      </div>

      <div className="card-body" style={{ paddingTop: 0 }}>
        {/* Audit Log Table (Only visible to Admin) */}
        {activeSubTab === 'log' ? (
          <div className="table-responsive">
            <div className="alert-box info" style={{ marginBottom: '16px' }}>
              記錄系統操作、審核、退回、作廢、更正與資料異動，方便後續追蹤責任。
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>日誌 ID</th>
                  <th>操作時間</th>
                  <th>操作人員</th>
                  <th>操作類型</th>
                  <th>操作內容</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{log.id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{log.timestamp}</td>
                    <td style={{ fontWeight: '600', color: log.operator === '主管理員' ? 'var(--accent-blue)' : 'var(--accent-gold)' }}>
                      {log.operator}
                    </td>
                    <td>
                      <span className={`badge ${
                        log.action.includes('核准') || log.action.includes('成功') ? 'approved' :
                        log.action.includes('待') ? 'pending' : 'void'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{log.details}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>目前沒有操作紀錄</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : activeSubTab === 'arap' ? (
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
                  <tr key={idx}>
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
                          onClick={() => setViewingReceiptUrl(item.receiptAttachment)}
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
                    <tr key={item.id}>
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
                      <tr key={item.id}>
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
                              onClick={() => setViewingReceiptUrl(item.receiptAttachment)}
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
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.id}</td>
                    
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
                                onClick={() => setViewingReceiptUrl(item.receiptAttachment)}
                              >
                                查看附件
                              </button>
                            </div>
                          )}
                        </td>
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
                                onClick={() => setViewingReceiptUrl(item.receiptAttachment)}
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

                    {isAdmin && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
        )}
      </div>

      {/* Form Dialog Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">
                {editingItem ? '編輯' : '新增'} - {
                  activeSubTab === 'income' ? '收入' :
                  activeSubTab === 'expense' ? '支出' :
                  activeSubTab === 'shareholder' ? '股東往來' :
                  activeSubTab === 'gas' ? '瓦斯進貨 / 毛利' :
                  activeSubTab === 'loan' ? '貸款' :
                  activeSubTab === 'assets' ? '固定資產' : '資料'
                }
              </span>
              <button type="button" className="modal-close" onClick={() => setIsModalOpen(false)}>x</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {/* Operator tag for visual reference in modal */}
                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', padding: '8px 12px', border: '1px solid rgba(59, 130, 246, 0.15)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--accent-blue)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  建立人：<strong>{operatorName}</strong>
                </div>

                {/* 1. Date Field */}
                {activeSubTab !== 'loan' && activeSubTab !== 'gas' && activeSubTab !== 'assets' && (
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

                {activeSubTab !== 'loan' && activeSubTab !== 'gas' && (
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
                            setFormData(prev => ({ ...prev, receiptAttachment: compressed }));
                          };
                          img.src = event.target.result;
                        };
                        reader.readAsDataURL(file);
                      }} 
                    />
                    {formData.receiptAttachment && (
                      <div style={{ marginTop: '8px', position: 'relative', display: 'inline-block' }}>
                        <img 
                          src={formData.receiptAttachment} 
                          alt="Receipt Attachment" 
                          style={{ maxWidth: '120px', borderRadius: '4px', border: '1px solid var(--border-color)' }} 
                        />
                        <button 
                          type="button" 
                          onClick={() => setFormData({ ...formData, receiptAttachment: '' })} 
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
                {activeSubTab !== 'shareholder' && activeSubTab !== 'gas' && activeSubTab !== 'assets' && (
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
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  儲存資料
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

      {/* Viewing Receipt Image Modal */}
      {viewingReceiptUrl && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setViewingReceiptUrl(null)}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', textAlign: 'center', padding: '16px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">憑證 / 發票附件預覽</span>
              <button type="button" className="modal-close" onClick={() => setViewingReceiptUrl(null)}>x</button>
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
              <button type="button" className="btn btn-secondary" onClick={() => setViewingReceiptUrl(null)}>關閉附件</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




