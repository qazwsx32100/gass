import React, { useEffect, useState, useMemo } from 'react';
import { getIncomeStatement, getBalanceSheet, getDividendsForPeriod, getPeriodEndDate, getPeriodLabel, generateLineShareText, getGasGrossProfitForPeriod, getCompanyProfitReport, getGasInventoryForMonth, getGasInventoryValuationAtDate, getJournalEntries, getTrialBalance, getGeneralLedger, getCashFlowStatement, getVatReport, getPayrollReport, getAuditReadinessReport, getAgingReport, getCustomerReceivableSummary, getSupplierPayableSummary, isDateInPeriod, getPartsGrossProfitReport } from '../utils/financials';
import { getCompanies, getShareholders, getShareholderLedger, getIncomes, getExpenses, getCustomers, getSuppliers, getBankTransactions, getChartOfAccounts, saveIncomes, saveExpenses, getPeriodLocks, savePeriodLocks } from '../db/storage';
import { canExportReports, canViewShareholderReports } from '../utils/permissions';
import PieChart from '../components/PieChart';
import { getCloudAttachmentUrl, revokeCloudAttachmentUrl, uploadCloudAttachment } from '../db/attachmentService';
import { syncLocalToSupabase } from '../db/supabaseService';

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString()}`;

export default function ReportsView({ companyId, year, month, triggerRefresh, showToast, userRole, restrictToShareholder = false, restrictToAudit = false }) {
  const [reportType, setReportType] = useState(() => {
    if (restrictToShareholder) return 'dividend';
    if (restrictToAudit) return 'auditReady';
    return 'pnl';
  }); // pnl, balance, gas, investor, dividend
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [reserveRatio, setReserveRatio] = useState(0.1); // 10% reserve by default
  const [periodMode, setPeriodMode] = useState('month');
  const [singleDate, setSingleDate] = useState(`${year}-${month}-01`);
  const [rangeStart, setRangeStart] = useState(`${year}-${month}-01`);
  const [rangeEnd, setRangeEnd] = useState(getPeriodEndDate('month', `${year}-${month}`));
  const showShareholderReports = canViewShareholderReports(userRole);
  const allowExportReports = canExportReports(userRole);

  const [drillDownCode, setDrillDownCode] = useState(null);
  const [drillDownName, setDrillDownName] = useState('');
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null);
  const [selectedAuditCategory, setSelectedAuditCategory] = useState(null);

  const handleQuickUpdate = async (id, isIncome, updates) => {
    if (isIncome) {
      const list = getIncomes();
      const idx = list.findIndex(x => x.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates };
        saveIncomes(list);
      }
    } else {
      const list = getExpenses();
      const idx = list.findIndex(x => x.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates };
        saveExpenses(list);
      }
    }

    // Dispatch global refresh event
    window.dispatchEvent(new Event('bp_data_changed'));

    // Sync to Supabase in the background
    try {
      await syncLocalToSupabase('系統查帳快速核對更新');
      showToast('☁️ 變更已成功同步至雲端。', 'success');
    } catch (err) {
      showToast('❌ 同步失敗，已先儲存於本機。', 'error');
    }
  };

  useEffect(() => () => revokeCloudAttachmentUrl(viewingReceiptUrl), [viewingReceiptUrl]);

  const closeReceiptPreview = () => {
    revokeCloudAttachmentUrl(viewingReceiptUrl);
    setViewingReceiptUrl(null);
  };

  const openReceiptPreview = async (attachment) => {
    try {
      setViewingReceiptUrl(await getCloudAttachmentUrl(attachment));
    } catch (error) {
      showToast(error.message || '附件讀取失敗。', 'error');
    }
  };

  const monthPeriodVal = `${year}-${month}`;
  const activePeriodType = periodMode;
  const activePeriodVal = useMemo(() => {
    if (periodMode === 'date') return singleDate;
    if (periodMode === 'range') return { startDate: rangeStart, endDate: rangeEnd };
    return monthPeriodVal;
  }, [periodMode, singleDate, rangeStart, rangeEnd, monthPeriodVal]);
  const activePeriodLabel = getPeriodLabel(activePeriodType, activePeriodVal);

  useEffect(() => {
    if (activePeriodType === 'month') {
      const locks = getPeriodLocks();
      const match = locks.find(item => item.companyId === companyId && item.yearMonth === activePeriodVal);
      if (match && match.reserveRatio !== null && match.reserveRatio !== undefined) {
        setReserveRatio(match.reserveRatio);
      } else {
        setReserveRatio(0.1);
      }
    } else {
      setReserveRatio(0.1);
    }
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const companies = useMemo(() => getCompanies(), [triggerRefresh]);
  const companyName = useMemo(() => {
    return companies.find(c => c.id === companyId)?.name || '未名公司';
  }, [companyId, companies]);

  // 1. Compute P&L Data
  const pnl = useMemo(() => {
    return getIncomeStatement(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  // 2. Compute Balance Sheet Data
  const balanceSheet = useMemo(() => {
    const endDate = getPeriodEndDate(activePeriodType, activePeriodVal);
    return getBalanceSheet(companyId, endDate);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  // 3. Compute Dividend Data
  const dividends = useMemo(() => {
    return getDividendsForPeriod(companyId, activePeriodType, activePeriodVal, reserveRatio);
  }, [companyId, activePeriodType, activePeriodVal, reserveRatio, triggerRefresh]);

  const [customAmountText, setCustomAmountText] = useState('');
  const [reservePercentText, setReservePercentText] = useState('');
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isPercentFocused, setIsPercentFocused] = useState(false);

  useEffect(() => {
    if (!isAmountFocused && dividends) {
      setCustomAmountText(String(Math.round(dividends.reserveAmount || 0)));
    }
  }, [dividends?.reserveAmount, isAmountFocused]);

  useEffect(() => {
    if (!isPercentFocused) {
      setReservePercentText(String(Math.round(reserveRatio * 100)));
    }
  }, [reserveRatio, isPercentFocused]);

  // 4. Drill Down Transactions Query
  const drillDownTransactions = useMemo(() => {
    if (!drillDownCode) return [];
    const incs = getIncomes().filter(i => i.companyId === companyId && i.accountCode === drillDownCode && i.status === 'approved');
    const exps = getExpenses().filter(e => e.companyId === companyId && e.accountCode === drillDownCode && e.status === 'approved');
    
    const all = [
      ...incs.map(i => ({ ...i, type: 'income' })),
      ...exps.map(e => ({ ...e, type: 'expense' }))
    ];
    
    const filtered = all.filter(item => {
      if (activePeriodType === 'month') {
        return item.date && typeof item.date === 'string' && item.date.startsWith(activePeriodVal);
      }
      if (activePeriodType === 'date') {
        return item.date === activePeriodVal;
      }
      if (activePeriodType === 'range') {
        return item.date >= activePeriodVal.startDate && item.date <= activePeriodVal.endDate;
      }
      return true;
    });
    
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    return filtered;
  }, [companyId, drillDownCode, activePeriodType, activePeriodVal, triggerRefresh]);

  // 5. Compute Shareholder Equity Changes
  const shareholderChanges = useMemo(() => {
    const ledger = getShareholderLedger().filter(s => s.companyId === companyId);
    const list = getShareholders();
    
    const endDate = getPeriodEndDate(activePeriodType, activePeriodVal);
    let startDate = '2026-06-01';
    if (activePeriodType === 'date') startDate = activePeriodVal;
    else if (activePeriodType === 'range') startDate = activePeriodVal.startDate;
    else {
      startDate = `${activePeriodVal}-01`;
    }
    
    const allIncomes = getIncomes().filter(i => i.companyId === companyId && i.status === 'approved' && i.date < startDate);
    const allExpenses = getExpenses().filter(e => e.companyId === companyId && e.status === 'approved' && e.date < startDate);
    const companyPriorProfit = allIncomes.reduce((s, i) => s + i.amount, 0) - allExpenses.reduce((s, e) => s + (e.amount + (e.cogsAmount || 0)), 0);
    
    // Ownership shares at end of period
    const getShareholderSharesAtDate = (cid, dateStr) => {
      // Inline simple ownership logic
      const events = getShareholderLedger().filter(e => e.companyId === cid && e.date <= dateStr);
      const capMap = {};
      events.forEach(e => {
        if (!capMap[e.shareholderId]) capMap[e.shareholderId] = 0;
        if (e.type === 'join' || e.type === 'increase') capMap[e.shareholderId] += e.amount;
        if (e.type === 'decrease') capMap[e.shareholderId] -= e.amount;
      });
      const totalCap = Object.values(capMap).reduce((s, v) => s + v, 0);
      return list.map(sh => {
        const cap = capMap[sh.id] || 0;
        const ratio = totalCap > 0 ? (cap / totalCap) * 100 : 0;
        return { shareholderId: sh.id, shareRatio: ratio, capital: cap };
      });
    };

    const shShares = getShareholderSharesAtDate(companyId, endDate);
    
    return list.map(sh => {
      const shRatioInfo = shShares.find(s => s.shareholderId === sh.id);
      const ratioPercent = shRatioInfo ? shRatioInfo.shareRatio : 0;
      
      const priorCapital = ledger
        .filter(item => item.shareholderId === sh.id && item.date < startDate)
        .reduce((sum, item) => {
          if (item.type === 'join' || item.type === 'increase') return sum + item.amount;
          if (item.type === 'decrease') return sum - item.amount;
          return sum;
        }, 0);
        
      const periodCapital = ledger
        .filter(item => item.shareholderId === sh.id && item.date >= startDate && item.date <= endDate)
        .reduce((sum, item) => {
          if (item.type === 'join' || item.type === 'increase') return sum + item.amount;
          if (item.type === 'decrease') return sum - item.amount;
          return sum;
        }, 0);
        
      const priorProfitShare = companyPriorProfit * (ratioPercent / 100);
      const openingEquity = priorCapital + priorProfitShare;
      const periodProfitShare = pnl.netProfit * (ratioPercent / 100);
      
      const periodDivInfo = dividends.shareholderDividends.find(s => s.shareholderId === sh.id);
      const periodDividend = periodDivInfo ? periodDivInfo.dividend : 0;
      
      const endingEquity = openingEquity + periodCapital + periodProfitShare - periodDividend;
      
      return {
        id: sh.id,
        name: sh.name,
        ratio: ratioPercent,
        openingEquity,
        periodCapital,
        periodProfitShare,
        periodDividend,
        endingEquity
      };
    });
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh, pnl.netProfit, dividends]);

  const gasProfit = useMemo(() => {
    return getGasGrossProfitForPeriod(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const companyProfit = useMemo(() => {
    return getCompanyProfitReport(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const partsProfitReport = useMemo(() => {
    return getPartsGrossProfitReport(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const gasInventory = useMemo(() => {
    return getGasInventoryValuationAtDate(companyId, getPeriodEndDate(activePeriodType, activePeriodVal));
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const journalEntries = useMemo(() => {
    return getJournalEntries(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const trialBalance = useMemo(() => {
    return getTrialBalance(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const generalLedger = useMemo(() => {
    return getGeneralLedger(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const cashFlow = useMemo(() => {
    return getCashFlowStatement(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const vatReport = useMemo(() => {
    return getVatReport(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const payrollReport = useMemo(() => {
    return getPayrollReport(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const auditReadiness = useMemo(() => {
    return getAuditReadinessReport(companyId, activePeriodType, activePeriodVal);
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const arapAsOfDate = useMemo(() => getPeriodEndDate(activePeriodType, activePeriodVal), [activePeriodType, activePeriodVal]);
  const agingReport = useMemo(() => getAgingReport(companyId, arapAsOfDate), [companyId, arapAsOfDate, triggerRefresh]);
  const customerReceivables = useMemo(() => getCustomerReceivableSummary(companyId, arapAsOfDate), [companyId, arapAsOfDate, triggerRefresh]);
  const supplierPayables = useMemo(() => getSupplierPayableSummary(companyId, arapAsOfDate), [companyId, arapAsOfDate, triggerRefresh]);
  const customers = useMemo(() => getCustomers().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);
  const suppliers = useMemo(() => getSuppliers().filter(item => item.companyId === companyId), [companyId, triggerRefresh]);

  const dailySales = useMemo(() => {
    // Get all Incomes and Expenses in active period
    const allIncomes = getIncomes().filter(item =>
      item.companyId === companyId &&
      item.status === 'approved' &&
      isDateInPeriod(item.date, activePeriodType, activePeriodVal)
    );
    const allExpenses = getExpenses().filter(item =>
      item.companyId === companyId &&
      item.status === 'approved' &&
      isDateInPeriod(item.date, activePeriodType, activePeriodVal)
    );

    // Gas Sales (4101)
    const gasSales = allIncomes.filter(item => item.accountCode === '4101');
    const gasSalesAmount = gasSales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Gas Sales Already Collected (現收)
    const gasSalesPaid = gasSales.filter(item => item.paymentStatus === 'paid' && item.paymentMethod !== 'receivable');
    const gasSalesPaidAmount = gasSalesPaid.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Repayments (還款金額)
    const repayments = getBankTransactions().filter(bt =>
      bt.companyId === companyId &&
      bt.direction === 'in' &&
      bt.sourceType === 'settlement' &&
      isDateInPeriod(bt.date, activePeriodType, activePeriodVal)
    );
    const repaymentAmount = repayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Monthly Accounts Receivable (月結應收帳款)
    const monthlyAr = gasSales.filter(item => item.paymentMethod === 'receivable');
    const monthlyArAmount = monthlyAr.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Unpaid/Debt Amount (欠款金額)
    const unpaidAr = gasSales.filter(item => item.paymentStatus === 'unpaid' && item.paymentMethod !== 'receivable');
    const unpaidArAmount = unpaidAr.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Quantity & Weight
    const cylinderQty = gasSales.reduce((sum, item) => sum + Number(item.cylinderQty || 0), 0);
    const gasKg = gasSales.reduce((sum, item) => sum + Number(item.gasKg || 0), 0);

    // Average price
    const avgPricePerCylinder = cylinderQty > 0 ? gasSalesAmount / cylinderQty : 0;
    const avgPricePerKg = gasKg > 0 ? gasSalesAmount / gasKg : 0;

    // Daily Gross Profit
    let totalGrossProfit = 0;
    try {
      if (activePeriodType === 'date') {
        const profitRes = getGasGrossProfitForPeriod(companyId, 'date', activePeriodVal);
        totalGrossProfit = profitRes.grossProfit || 0;
      } else if (activePeriodType === 'month') {
        const profitRes = getGasInventoryForMonth(companyId, activePeriodVal);
        totalGrossProfit = profitRes.grossProfit || 0;
      } else {
        const start = new Date(activePeriodVal.startDate);
        const end = new Date(activePeriodVal.endDate);
        let curr = new Date(start);
        while (curr <= end) {
          const dateStr = curr.toISOString().split('T')[0];
          const profitRes = getGasGrossProfitForPeriod(companyId, 'date', dateStr);
          totalGrossProfit += profitRes.grossProfit || 0;
          curr.setDate(curr.getDate() + 1);
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Expense Categories Mapping
    let buyCylinderAmount = 0;
    let repairAmount = 0;
    let stoveAmount = 0;
    let otherExpenseAmount = 0;

    allExpenses.forEach(exp => {
      const code = exp.accountCode;
      const accountName = getChartOfAccounts().find(a => a.code === code)?.name || '';

      const isBuyCylinder = accountName.includes('買桶') || accountName.includes('鋼瓶') || accountName.includes('購桶');
      const isRepair = accountName.includes('維修') || accountName.includes('修繕') || accountName.includes('保養');
      const isStove = accountName.includes('爐具') || accountName.includes('零件') || accountName.includes('材料');

      if (isBuyCylinder) {
        buyCylinderAmount += Number(exp.amount || 0);
      } else if (isRepair) {
        repairAmount += Number(exp.amount || 0);
      } else if (isStove) {
        stoveAmount += Number(exp.amount || 0);
      } else {
        otherExpenseAmount += Number(exp.amount || 0);
      }
    });

    // Stove Income (爐具收入) - Code 4104 or name containing "爐具"
    const stoveIncomes = allIncomes.filter(item => item.accountCode === '4104' || (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('爐具'));
    const stoveIncomeAmount = stoveIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Repair Income (維修收入) - Code 4102 or name containing "維修" / "服務"
    const repairIncomes = allIncomes.filter(item => item.accountCode === '4102' || (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('維修') || (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('服務'));
    const repairIncomeAmount = repairIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Cylinder Incomes (買桶收入)
    const cylinderIncomes = allIncomes.filter(item => 
      item.remarks?.includes('買桶') || 
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('買桶') ||
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('鋼瓶') ||
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('購桶')
    );
    const cylinderIncomeAmount = cylinderIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Inspection Incomes (檢驗費收入)
    const inspectionIncomes = allIncomes.filter(item => 
      item.remarks?.includes('檢驗') || 
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('檢驗')
    );
    const inspectionIncomeAmount = inspectionIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Deposit Incomes (押瓶收入)
    const depositIncomes = allIncomes.filter(item => 
      item.remarks?.includes('押瓶') || 
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('押瓶') ||
      (getChartOfAccounts().find(a => a.code === item.accountCode)?.name || '').includes('押金')
    );
    const depositIncomeAmount = depositIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    // Other Incomes (其他營業收入)
    const otherIncomes = allIncomes.filter(item =>
      !gasSales.some(g => g.id === item.id) &&
      !stoveIncomes.some(s => s.id === item.id) &&
      !repairIncomes.some(r => r.id === item.id) &&
      !cylinderIncomes.some(c => c.id === item.id) &&
      !inspectionIncomes.some(i => i.id === item.id) &&
      !depositIncomes.some(d => d.id === item.id)
    );
    const otherIncomeAmount = otherIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      gasSalesAmount: gasSalesAmount || 0,
      gasSalesPaidAmount: gasSalesPaidAmount || 0,
      repaymentAmount: repaymentAmount || 0,
      monthlyArAmount: monthlyArAmount || 0,
      unpaidArAmount: unpaidArAmount || 0,
      cylinderQty: cylinderQty || 0,
      gasKg: gasKg || 0,
      avgPricePerCylinder: avgPricePerCylinder || 0,
      avgPricePerKg: avgPricePerKg || 0,
      grossProfit: totalGrossProfit || 0,
      buyCylinderAmount: buyCylinderAmount || 0,
      repairAmount: repairAmount || 0,
      stoveAmount: stoveAmount || 0,
      otherExpenseAmount: otherExpenseAmount || 0,
      stoveIncomeAmount: stoveIncomeAmount || 0,
      repairIncomeAmount: repairIncomeAmount || 0,
      cylinderIncomeAmount: cylinderIncomeAmount || 0,
      inspectionIncomeAmount: inspectionIncomeAmount || 0,
      depositIncomeAmount: depositIncomeAmount || 0,
      otherIncomeAmount: otherIncomeAmount || 0
    };
  }, [companyId, activePeriodType, activePeriodVal, triggerRefresh]);

  const revenuePieItems = useMemo(() => (
    pnl.revenueItems.map(item => ({ label: `${item.code} ${item.name}`, amount: item.amount }))
  ), [pnl]);

  const expensePieItems = useMemo(() => (
    [...pnl.cogsItems, ...pnl.expenseItems].map(item => ({ label: `${item.code} ${item.name}`, amount: item.amount }))
  ), [pnl]);

  useEffect(() => {
    if (!showShareholderReports && reportType === 'dividend') {
      setReportType('pnl');
    }
  }, [showShareholderReports, reportType]);

  // Copy LINE text
  const handleCopyLine = () => {
    const text = generateLineShareText(companyName, dividends);
    navigator.clipboard.writeText(text);
    showToast('📋 分紅明細已複製到剪貼簿，可直接在 LINE 貼上！', 'success');
  };

  // Trigger Print Report
  const handlePrint = () => {
    window.print();
  };

  // Export report to Excel-compatible CSV (BOM UTF-8)
  const handleExportExcel = () => {
    let csvRows = [];
    
    if (reportType === 'pnl') {
      csvRows = [
        [`${companyName} - 損益表 (P&L)`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['科目代碼', '會計科目項目', '金額 (TWD)'],
        ['一、營業收入', '', pnl.totalRevenue],
        ...pnl.revenueItems.map(item => [item.code, item.name, item.amount]),
        [],
        ['二、營業成本 (銷貨成本)', '', pnl.totalCogs],
        ...pnl.cogsItems.map(item => [item.code, item.name, item.amount]),
        ['營業毛利 (Gross Profit)', '', pnl.grossProfit],
        [],
        ['三、營業費用', '', pnl.totalExpenses],
        ...pnl.expenseItems.map(item => [item.code, item.name, item.amount]),
        [],
        ['本期淨利潤 (Net Profit)', '', pnl.netProfit]
      ];
    } else if (reportType === 'balance') {
      csvRows = [
        [`${companyName} - 資產負債表 (Balance Sheet)`],
        [`基準日期: ${getPeriodEndDate(activePeriodType, activePeriodVal)}`],
        [],
        ['資產項目', '金額 (TWD)', '負債與股東權益項目', '金額 (TWD)'],
        ['一、流動資產', '', '一、流動負債', ''],
        ['  現金與銀行存款', balanceSheet.assets.totalCash, '  應付帳款 (AP)', balanceSheet.liabilities.totalAP],
        ['  瓦斯存貨', balanceSheet.assets.inventoryAsset, '', ''],
        ['  應收帳款 (AR)', balanceSheet.assets.totalAR, '二、非流動負債', ''],
        ['二、非流動資產', '', '  長期借款與貸款', balanceSheet.liabilities.loanLiabilities],
        ['  固定資產淨值', balanceSheet.assets.fixedAssetsBookValue, '負債總計 (Total Liabilities)', balanceSheet.liabilities.totalLiabilities],
        [],
        ['', '', '三、股東權益 (Owner\'s Equity)', ''],
        ['', '', '  股東實收資本額', balanceSheet.equity.paidInCapital],
        ['', '', '  本期累積未分配盈餘', balanceSheet.equity.retainedEarnings],
        ['資產總計 (Total Assets)', balanceSheet.assets.totalAssets, '權益總計 (Total Equity)', balanceSheet.equity.totalEquity],
        [],
        ['', '', '負債與權益總計 (Total L&E)', balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.totalEquity]
      ];
    } else if (reportType === 'trialBalance') {
      csvRows = [
        [`${companyName} - 試算表`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['科目代碼', '科目名稱', '借方發生額', '貸方發生額', '借方餘額', '貸方餘額'],
        ...trialBalance.rows.map(row => [row.accountCode, row.accountName, row.debit, row.credit, row.debitBalance, row.creditBalance]),
        ['合計', '', trialBalance.totalDebit, trialBalance.totalCredit, trialBalance.totalDebitBalance, trialBalance.totalCreditBalance]
      ];
    } else if (reportType === 'generalLedger') {
      csvRows = [
        [`${companyName} - 總分類帳`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['科目代碼', '科目名稱', '日期', '傳票編號', '摘要', '借方', '貸方', '餘額'],
        ...generalLedger.flatMap(account => [
          [account.accountCode, account.accountName, '', '', '期初餘額', '', '', account.openingBalance],
          ...account.rows.map(row => [account.accountCode, account.accountName, row.date, row.entryId, row.description, row.debit, row.credit, row.runningBalance])
        ])
      ];
    } else if (reportType === 'cashFlow') {
      csvRows = [
        [`${companyName} - 現金流量表`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['活動類別', '日期', '傳票編號', '摘要', '現金增減'],
        ...Object.values(cashFlow.sections).flatMap(section => [
          ...section.rows.map(row => [section.label, row.date, row.entryId, row.description, row.amount]),
          [`${section.label}小計`, '', '', '', section.total]
        ]),
        [],
        ['期初現金', '', '', '', cashFlow.openingCash],
        ['本期現金淨增減', '', '', '', cashFlow.netChange],
        ['期末現金', '', '', '', cashFlow.closingCash]
      ];
    } else if (reportType === 'arap') {
      csvRows = [
        [`${companyName} - 應收應付帳齡表`],
        [`基準日: ${arapAsOfDate}`],
        [],
        ['項目', '0-30', '31-60', '61-90', '90+', '合計'],
        ['應收帳款', agingReport.receivables.buckets.current.total, agingReport.receivables.buckets.days31to60.total, agingReport.receivables.buckets.days61to90.total, agingReport.receivables.buckets.over90.total, agingReport.receivables.total],
        ['應付帳款', agingReport.payables.buckets.current.total, agingReport.payables.buckets.days31to60.total, agingReport.payables.buckets.days61to90.total, agingReport.payables.buckets.over90.total, agingReport.payables.total],
        [],
        ['客戶', '統編', '未收款', '未收筆數', '最長帳齡'],
        ...customerReceivables.map(row => [row.name, row.taxId || '', row.receivableTotal, row.unpaidCount, row.oldestDays]),
        [],
        ['供應商', '統編', '未付款', '未付筆數', '最長帳齡'],
        ...supplierPayables.map(row => [row.name, row.taxId || '', row.payableTotal, row.unpaidCount, row.oldestDays])
      ];
    } else if (reportType === 'dailySales') {
      csvRows = [
        [`${companyName} - 營業狀況`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['資料項目', '數值 / 金額'],
        ['瓦斯銷售總金額', dailySales.gasSalesAmount],
        ['瓦斯銷售已收款', dailySales.gasSalesPaidAmount],
        ['還款金額', dailySales.repaymentAmount],
        ['月結應收帳款', dailySales.monthlyArAmount],
        ['欠款金額', dailySales.unpaidArAmount],
        ['當日數量 (桶)', dailySales.cylinderQty],
        ['當日重量 (kg)', dailySales.gasKg],
        ['平均單價 (元/桶)', dailySales.avgPricePerCylinder ? dailySales.avgPricePerCylinder.toFixed(2) : '0.00'],
        ['平均單價 (元/kg)', dailySales.avgPricePerKg ? dailySales.avgPricePerKg.toFixed(2) : '0.00'],
        ['當日毛利', dailySales.grossProfit],
        ['爐具收入', dailySales.stoveIncomeAmount],
        ['維修/安裝 收入', dailySales.repairIncomeAmount],
        ['買桶收入', dailySales.cylinderIncomeAmount],
        ['檢驗費收入', dailySales.inspectionIncomeAmount],
        ['押瓶收入', dailySales.depositIncomeAmount],
        ['其他營業收入', dailySales.otherIncomeAmount],
        ['買桶金額', dailySales.buyCylinderAmount],
        ['維修費用', dailySales.repairAmount],
        ['爐具費用', dailySales.stoveAmount],
        ['其他費用', dailySales.otherExpenseAmount]
      ];
    } else if (reportType === 'gas') {
      csvRows = [
        [`${companyName} - 毛利表`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['日期', '瓦斯毛利', '爐具毛利', '維修安裝毛利', '買桶毛利', '檢驗費毛利', '押瓶毛利', '其它毛利', '總收入', '總成本', '總毛利', '毛利率'],
        ...companyProfit.dailyRows.map(row => [
          row.date,
          row.gasRevenue - row.gasCogs,
          row.stoveRevenue - row.stoveCogs,
          row.repairRevenue - row.repairCogs,
          row.cylinderRevenue - row.cylinderCogs,
          row.inspectionRevenue - row.inspectionCogs,
          row.depositRevenue - row.depositCogs,
          row.otherRevenue - row.otherCogs,
          row.totalRevenue,
          row.totalCogs,
          row.totalProfit,
          `${row.totalMargin.toFixed(2)}%`
        ]),
        [],
        [
          '合計',
          companyProfit.totalGasRevenue - companyProfit.totalGasCogs,
          companyProfit.totalStoveRevenue - companyProfit.totalStoveCogs,
          companyProfit.totalRepairRevenue - companyProfit.totalRepairCogs,
          companyProfit.totalCylinderRevenue - companyProfit.totalCylinderCogs,
          companyProfit.totalInspectionRevenue - companyProfit.totalInspectionCogs,
          companyProfit.totalDepositRevenue - companyProfit.totalDepositCogs,
          companyProfit.totalOtherRevenue - companyProfit.totalOtherCogs,
          companyProfit.totalRevenue,
          companyProfit.totalCogs,
          companyProfit.grossProfit,
          `${companyProfit.grossMargin.toFixed(2)}%`
        ]
      ];
    } else if (reportType === 'investor') {
      csvRows = [
        [`${companyName} - 投資人營運摘要`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['指標', '金額/數值'],
        ['營業收入', pnl.totalRevenue],
        ['營業毛利', pnl.grossProfit],
        ['毛利率', `${pnl.grossMargin.toFixed(2)}%`],
        ['稅前淨利', pnl.netProfit],
        ['瓦斯銷售公斤', gasProfit.totalKg],
        ['瓦斯毛利', gasProfit.grossProfit],
        ['期末瓦斯庫存公斤', gasInventory.endingKg],
        ['期末瓦斯庫存金額', gasInventory.endingCost],
        ['現金與銀行存款', balanceSheet.assets.totalCash],
        ['資產總計', balanceSheet.assets.totalAssets],
        ['負債總計', balanceSheet.liabilities.totalLiabilities],
        ['股東權益', balanceSheet.equity.totalEquity]
      ];
    } else if (reportType === 'dividend') {
      csvRows = [
        [`${companyName} - 股東分紅明細表`],
        [`報表期間: ${activePeriodLabel}`],
        [`保留公積比例: ${(reserveRatio * 100).toFixed(0)}% (金額: $${dividends.reserveAmount.toLocaleString()} TWD)`],
        [`可分配利潤總額: $${dividends.totalDividends.toLocaleString()} TWD`],
        [],
        ['股東姓名', '持股比例 (%)', '出資總額 (TWD)', '獲分紅金額 (TWD)'],
        ...dividends.shareholderDividends.map(s => [
          s.name, 
          `${s.ratio}%`, 
          s.activeCapital, 
          s.dividend
        ])
      ];
    } else if (reportType === 'equity') {
      csvRows = [
        [`${companyName} - 股東權益變動表`],
        [`報表期間: ${activePeriodLabel}`],
        [],
        ['股東姓名', '持股比例 (%)', '期初權益 (TWD)', '本期認股/增資 (TWD)', '分配本期淨利 (TWD)', '本期已發紅利 (TWD)', '期末權益 (TWD)'],
        ...shareholderChanges.map(s => [
          s.name,
          `${s.ratio}%`,
          s.openingEquity,
          s.periodCapital,
          s.periodProfitShare,
          s.periodDividend,
          s.endingEquity
        ]),
        [],
        [
          '合計',
          '100%',
          shareholderChanges.reduce((sum, s) => sum + s.openingEquity, 0),
          shareholderChanges.reduce((sum, s) => sum + s.periodCapital, 0),
          shareholderChanges.reduce((sum, s) => sum + s.periodProfitShare, 0),
          shareholderChanges.reduce((sum, s) => sum + s.periodDividend, 0),
          shareholderChanges.reduce((sum, s) => sum + s.endingEquity, 0)
        ]
      ];
    }

    const csvString = '\ufeff' + csvRows.map(row => 
      row.map(cell => {
        let valStr = cell === null || cell === undefined ? '' : String(cell);
        if (/^[=+\-@\t\r]/.test(valStr)) {
          valStr = "'" + valStr;
        }
        return `"${valStr.replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\r\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const reportFileNames = {
      pnl: '損益表',
      balance: '資產負債表',
      trialBalance: '試算表',
      generalLedger: '總分類帳',
      cashFlow: '現金流量表',
      arap: '應收應付帳齡表',
      equity: '股東權益變動表',
      gas: '毛利表',
      dailySales: '營業狀況',
      investor: '投資人摘要',
      journal: '傳票總覽',
      vat: '營業稅彙整',
      payroll: '薪資彙整',
      auditReady: '查帳準備度',
      dividend: '股東分紅表'
    };
    const filename = `${companyName}_${reportFileNames[reportType] || '營運報表'}_${activePeriodLabel}.csv`;
    
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Selector Header */}
      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-header report-toolbar" style={{ borderBottom: 'none' }}>
          {(allowExportReports || userRole === USER_ROLES.BOOKKEEPER || showShareholderReports) && !restrictToAudit && (
          <div className="report-tabs">
            {restrictToShareholder ? (
              <>
                <button className={`tab-btn ${reportType === 'dividend' ? 'active' : ''}`} onClick={() => setReportType('dividend')}>
                  👑 股東分紅與 LINE 報表
                </button>
                <button className={`tab-btn ${reportType === 'equity' ? 'active' : ''}`} onClick={() => setReportType('equity')}>
                  📈 股東權益變動表
                </button>
                <button className={`tab-btn ${reportType === 'investor' ? 'active' : ''}`} onClick={() => setReportType('investor')}>
                  🧾 投資人摘要
                </button>
              </>
            ) : (
              <>
                <button className={`tab-btn ${reportType === 'pnl' ? 'active' : ''}`} onClick={() => setReportType('pnl')}>
                  📊 損益表
                </button>
                <button className={`tab-btn ${reportType === 'balance' ? 'active' : ''}`} onClick={() => setReportType('balance')}>
                  ⚖️ 資產負債表
                </button>
                <button className={`tab-btn ${reportType === 'gas' ? 'active' : ''}`} onClick={() => setReportType('gas')}>
                  🛢️ 毛利表
                </button>
                <button className={`tab-btn ${reportType === 'dailySales' ? 'active' : ''}`} onClick={() => setReportType('dailySales')}>
                  🛍️ 營業狀況
                </button>
                <button className={`tab-btn ${reportType === 'arap' ? 'active' : ''}`} onClick={() => setReportType('arap')}>
                  應收/應付
                </button>
                <button className={`tab-btn ${reportType === 'journal' ? 'active' : ''}`} onClick={() => setReportType('journal')}>
                  傳票總覽
                </button>
                <button className={`tab-btn ${reportType === 'trialBalance' ? 'active' : ''}`} onClick={() => setReportType('trialBalance')}>
                  試算表
                </button>
                <button className={`tab-btn ${reportType === 'generalLedger' ? 'active' : ''}`} onClick={() => setReportType('generalLedger')}>
                  總分類帳
                </button>
                <button className={`tab-btn ${reportType === 'cashFlow' ? 'active' : ''}`} onClick={() => setReportType('cashFlow')}>
                  現金流量表
                </button>
                <button className={`tab-btn ${reportType === 'vat' ? 'active' : ''}`} onClick={() => setReportType('vat')}>
                  營業稅
                </button>
                <button className={`tab-btn ${reportType === 'payroll' ? 'active' : ''}`} onClick={() => setReportType('payroll')}>
                  薪資
                </button>
              </>
            )}
          </div>
          )}

          <div className="report-actions">
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
              🖨️ 列印報表
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExportExcel}>
              📥 匯出 Excel
            </button>
          </div>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 0 }}>
        <div className="card-body" style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ minWidth: '160px', marginBottom: 0 }}>
            <label className="form-label">查詢期間</label>
            <select className="select-dropdown" style={{ width: '100%' }} value={periodMode} onChange={e => setPeriodMode(e.target.value)}>
              <option value="month">目前月份</option>
              <option value="date">單一日期</option>
              <option value="range">自訂日期範圍</option>
            </select>
          </div>

          {periodMode === 'date' && (
            <div className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
              <label className="form-label">單一日期</label>
              <input type="date" className="form-control" value={singleDate} onChange={e => setSingleDate(e.target.value)} />
            </div>
          )}

          {periodMode === 'range' && (
            <>
              <div className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
                <label className="form-label">起始日期</label>
                <input type="date" className="form-control" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
              </div>
              <div className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
                <label className="form-label">結束日期</label>
                <input type="date" className="form-control" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
              </div>
            </>
          )}

          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', paddingBottom: '10px' }}>
            目前報表期間：{activePeriodLabel}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <span className="card-title">📄 PDF / Excel 報表格式參考</span>
        </div>
        <div className="card-body">
          <div className="report-format-grid">
            <div className="report-format-item">
              <h4>版本 A：管理摘要版</h4>
              <p>適合老闆快速看營收、支出、淨利、現金餘額與圓餅圖。頁數少，重點是趨勢與比例。</p>
            </div>
            <div className="report-format-item">
              <h4>版本 B：會計明細版</h4>
              <p>適合對帳與審核。包含科目彙總、收入明細、支出明細、建立人、審核狀態與備註。</p>
            </div>
            <div className="report-format-item">
              <h4>版本 C：股東分享版</h4>
              <p>適合給股東看。顯示本期損益、股東出資比例、可分紅金額、保留公積金與 LINE 文字。</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Print Container */}
      <div id="print-area">
        {/* 1. Profit & Loss Statement */}
        {reportType === 'pnl' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 損益表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                期間：{activePeriodLabel}
              </span>
            </div>
            <div className="card-body">
              <div className="grid-2col" style={{ marginBottom: '24px' }}>
                <PieChart title="收入科目比例" items={revenuePieItems} emptyText="此期間沒有收入資料" />
                <PieChart title="支出科目比例" items={expensePieItems} emptyText="此期間沒有支出資料" />
              </div>

              <div className="financial-row header-row">
                <span>科目項目</span>
                <span>金額 (TWD)</span>
              </div>

              {/* Revenue */}
              <div className="financial-row header-row" style={{ marginTop: '12px', fontSize: '0.95rem' }}>
                <span>一、營業收入</span>
                <span>${pnl.totalRevenue.toLocaleString()}</span>
              </div>
              {pnl.revenueItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className="financial-row indent" 
                  style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onClick={() => { setDrillDownCode(item.code); setDrillDownName(item.name); }}
                  title="點擊檢視科目明細"
                >
                  <span style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{item.code} {item.name}</span>
                  <span>${item.amount.toLocaleString()}</span>
                </div>
              ))}

              {/* COGS */}
              <div className="financial-row header-row" style={{ marginTop: '12px', fontSize: '0.95rem' }}>
                <span>二、營業成本</span>
                <span>${pnl.totalCogs.toLocaleString()}</span>
              </div>
              {pnl.cogsItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className="financial-row indent" 
                  style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onClick={() => { setDrillDownCode(item.code); setDrillDownName(item.name); }}
                  title="點擊檢視科目明細"
                >
                  <span style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{item.code} {item.name}</span>
                  <span>${item.amount.toLocaleString()}</span>
                </div>
              ))}

              {/* Gross Profit */}
              <div className="financial-row total-row" style={{ marginTop: '12px' }}>
                <span>三、營業毛利</span>
                <span>${pnl.grossProfit.toLocaleString()}</span>
              </div>

              {/* Expenses */}
              <div className="financial-row header-row" style={{ marginTop: '12px', fontSize: '0.95rem' }}>
                <span>四、營業費用</span>
                <span>${pnl.totalExpenses.toLocaleString()}</span>
              </div>
              {pnl.expenseItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className="financial-row indent" 
                  style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onClick={() => { setDrillDownCode(item.code); setDrillDownName(item.name); }}
                  title="點擊檢視科目明細"
                >
                  <span style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>{item.code} {item.name}</span>
                  <span>${item.amount.toLocaleString()}</span>
                </div>
              ))}

              {/* Net Profit */}
              <div className={`financial-row ${pnl.netProfit >= 0 ? 'total-row' : 'loss-row'}`} style={{ marginTop: '24px', fontSize: '1.05rem' }}>
                <span>本期稅前淨利</span>
                <span>${pnl.netProfit.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Balance Sheet */}
        {reportType === 'balance' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">⚖️ 資產負債表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                基準日：{balanceSheet.date}
              </span>
            </div>
            <div className="card-body">
              <div className="grid-2col" style={{ gap: '32px' }}>
                {/* Left Column: Assets */}
                <div>
                  <h3 style={{ fontSize: '1.05rem', borderBottom: '2px solid var(--accent-green)', paddingBottom: '6px', color: 'var(--accent-green)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>資產</span>
                    <span>金額 (TWD)</span>
                  </h3>
                  
                  <div className="financial-row header-row" style={{ marginTop: '8px' }}>
                    <span>流動資產 - 現金與銀行存款</span>
                    <span>${balanceSheet.assets.totalCash.toLocaleString()}</span>
                  </div>
                  {balanceSheet.assets.banks.map((b, idx) => (
                    <div key={idx} className="financial-row indent">
                      <span style={{ fontSize: '0.85rem' }}>{b.name}</span>
                      <span>${b.currentBalance.toLocaleString()}</span>
                    </div>
                  ))}

                  <div className="financial-row header-row" style={{ marginTop: '12px' }}>
                    <span>流動資產 - 瓦斯存貨</span>
                    <span>${balanceSheet.assets.inventoryAsset.toLocaleString()}</span>
                  </div>
                  <div className="financial-row indent">
                    <span style={{ fontSize: '0.85rem' }}>
                      期末瓦斯庫存 {balanceSheet.assets.gasInventory.endingKg.toLocaleString()} kg，
                      平均成本 ${balanceSheet.assets.gasInventory.averageCostPerKg.toFixed(2)} / kg
                    </span>
                    <span>${balanceSheet.assets.gasInventory.endingCost.toLocaleString()}</span>
                  </div>

                  <div className="financial-row header-row" style={{ marginTop: '12px' }}>
                    <span>流動資產 - 應收帳款</span>
                    <span>${(balanceSheet.assets.totalAR || 0).toLocaleString()}</span>
                  </div>
                  <div className="financial-row indent">
                    <span style={{ fontSize: '0.85rem' }}>未結清客戶應收款</span>
                    <span>${(balanceSheet.assets.totalAR || 0).toLocaleString()}</span>
                  </div>

                  <div className="financial-row header-row" style={{ marginTop: '12px' }}>
                    <span>非流動資產 - 固定資產</span>
                    <span>${(balanceSheet.assets.fixedAssetsBookValue || 0).toLocaleString()}</span>
                  </div>
                  <div className="financial-row indent">
                    <span style={{ fontSize: '0.85rem' }}>固定資產取得成本</span>
                    <span>${(balanceSheet.assets.fixedAssetsCost || 0).toLocaleString()}</span>
                  </div>
                  <div className="financial-row indent">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>減：累計折舊</span>
                    <span style={{ color: 'var(--text-secondary)' }}>-${(balanceSheet.assets.fixedAssetsAccumulatedDepreciation || 0).toLocaleString()}</span>
                  </div>

                  <div className="financial-row total-row" style={{ marginTop: '24px' }}>
                    <span>資產總計</span>
                    <span>${balanceSheet.assets.totalAssets.toLocaleString()}</span>
                  </div>
                </div>

                {/* Right Column: Liabilities & Equity */}
                <div>
                  {/* Liabilities */}
                  <h3 style={{ fontSize: '1.05rem', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '6px', color: 'var(--accent-blue)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>負債</span>
                    <span>金額 (TWD)</span>
                  </h3>
                  
                  <div className="financial-row header-row" style={{ marginTop: '8px' }}>
                    <span>流動負債 - 應付帳款</span>
                    <span>${(balanceSheet.liabilities.totalAP || 0).toLocaleString()}</span>
                  </div>
                  <div className="financial-row indent">
                    <span style={{ fontSize: '0.85rem' }}>未結清供應商貨款</span>
                    <span>${(balanceSheet.liabilities.totalAP || 0).toLocaleString()}</span>
                  </div>

                  <div className="financial-row header-row" style={{ marginTop: '12px' }}>
                    <span>非流動負債 - 長期借款與貸款</span>
                    <span>${(balanceSheet.liabilities.loanLiabilities || 0).toLocaleString()}</span>
                  </div>
                  {balanceSheet.liabilities.loans.map((l, idx) => (
                    <div key={idx} className="financial-row indent">
                      <span style={{ fontSize: '0.85rem' }}>{l.name}</span>
                      <span>${l.remainingPrincipal.toLocaleString()}</span>
                    </div>
                  ))}
                  {balanceSheet.liabilities.loans.length === 0 && (
                    <div className="financial-row indent" style={{ color: 'var(--text-tertiary)' }}>
                      <span>無負債/銀行貸款</span>
                      <span>$0</span>
                    </div>
                  )}

                  <div className="financial-row total-row" style={{ marginTop: '24px' }}>
                    <span>負債總計</span>
                    <span>${balanceSheet.liabilities.totalLiabilities.toLocaleString()}</span>
                  </div>

                  {showShareholderReports && (
                    <>
                      <h3 style={{ fontSize: '1.05rem', borderBottom: '2px solid var(--accent-gold)', paddingBottom: '6px', color: 'var(--accent-gold)', display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                        <span>權益</span>
                        <span>金額 (TWD)</span>
                      </h3>
                      <div className="financial-row">
                        <span>股東實收資本額</span>
                        <span>${balanceSheet.equity.paidInCapital.toLocaleString()}</span>
                      </div>
                      <div className="financial-row">
                        <span>累積盈餘 / (虧損)</span>
                        <span style={{ color: balanceSheet.equity.retainedEarnings < 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                          ${balanceSheet.equity.retainedEarnings.toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="financial-row total-row" style={{ marginTop: '24px', backgroundColor: 'rgba(245, 158, 11, 0.05)', color: 'var(--accent-gold)', borderBottomDouble: '2px solid var(--accent-gold)' }}>
                        <span>權益總計</span>
                        <span>${balanceSheet.equity.totalEquity.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Accounting Identity check */}
              {showShareholderReports && (
                <div className={`alert-box ${balanceSheet.equity.balancingAdjustment === 0 ? 'success' : 'warning'}`} style={{ marginTop: '32px', marginBottom: 0, justifyContent: 'center' }}>
                  {balanceSheet.equity.balancingAdjustment === 0 ? '✅' : '⚠️'} 資產與負債權益平衡檢驗：
                  資產 (${balanceSheet.assets.totalAssets.toLocaleString()})
                  ，負債與權益之和 (${(balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.totalEquity).toLocaleString()})。
                  差額：${balanceSheet.equity.balancingAdjustment.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        )}

        {reportType === 'arap' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">應收 / 應付帳齡表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>基準日：{arapAsOfDate}</span>
            </div>
            <div className="card-body">
              <div className="summary-grid" style={{ marginBottom: '16px' }}>
                <div className="summary-card">
                  <div className="summary-label">應收帳款</div>
                  <div className="summary-value income">${agingReport.receivables.total.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">應付帳款</div>
                  <div className="summary-value expense">${agingReport.payables.total.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">逾期 90 天以上應收</div>
                  <div className="summary-value expense">${agingReport.receivables.buckets.over90.total.toLocaleString()}</div>
                </div>
              </div>

              <div className="grid-2col" style={{ marginBottom: '20px' }}>
                <div>
                  <div className="financial-row header-row"><span>應收帳齡</span><span>金額</span></div>
                  <div className="financial-row"><span>0-30 天</span><span>${agingReport.receivables.buckets.current.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>31-60 天</span><span>${agingReport.receivables.buckets.days31to60.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>61-90 天</span><span>${agingReport.receivables.buckets.days61to90.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>90 天以上</span><span>${agingReport.receivables.buckets.over90.total.toLocaleString()}</span></div>
                </div>
                <div>
                  <div className="financial-row header-row"><span>應付帳齡</span><span>金額</span></div>
                  <div className="financial-row"><span>0-30 天</span><span>${agingReport.payables.buckets.current.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>31-60 天</span><span>${agingReport.payables.buckets.days31to60.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>61-90 天</span><span>${agingReport.payables.buckets.days61to90.total.toLocaleString()}</span></div>
                  <div className="financial-row"><span>90 天以上</span><span>${agingReport.payables.buckets.over90.total.toLocaleString()}</span></div>
                </div>
              </div>

              <h3 style={{ fontSize: '1rem', margin: '16px 0 8px' }}>客戶未收款</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>客戶</th><th>統編</th><th style={{ textAlign: 'right' }}>未收款</th><th>未收筆數</th><th>最長帳齡</th></tr></thead>
                  <tbody>
                    {customerReceivables.map(row => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.taxId || '-'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${Number(row.receivableTotal || 0).toLocaleString()}</td>
                        <td>{row.unpaidCount}</td>
                        <td>{row.unpaidCount ? `${row.oldestDays} 天` : '-'}</td>
                      </tr>
                    ))}
                    {customers.length === 0 && (
                      <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>尚未建立客戶主檔</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '1rem', margin: '20px 0 8px' }}>供應商未付款</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>供應商</th><th>統編</th><th style={{ textAlign: 'right' }}>未付款</th><th>未付筆數</th><th>最長帳齡</th></tr></thead>
                  <tbody>
                    {supplierPayables.map(row => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.taxId || '-'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${Number(row.payableTotal || 0).toLocaleString()}</td>
                        <td>{row.unpaidCount}</td>
                        <td>{row.unpaidCount ? `${row.oldestDays} 天` : '-'}</td>
                      </tr>
                    ))}
                    {suppliers.length === 0 && (
                      <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>尚未建立供應商主檔</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'dailySales' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">🛍️ 營業報表 - 營業狀況</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">

              {dailySales.gasSalesAmount === 0 && dailySales.cylinderQty === 0 && (
                <div style={{
                  textAlign: 'center', padding: '32px 16px',
                  color: 'var(--text-secondary)', background: 'var(--bg-secondary)',
                  borderRadius: '12px', marginBottom: '24px'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
                  <div style={{ fontWeight: 600 }}>此期間無瓦斯銷售紀錄</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>請確認已選取正確日期，且銷售單據狀態為「已審核」</div>
                </div>
              )}

              {/* Financial Metrics */}
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '6px', color: 'var(--text-primary)' }}>💰 銷貨金流指標</h3>
              <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="metric-card accent-blue">
                  <span className="metric-label">瓦斯銷售總金額</span>
                  <span className="metric-value">{formatCurrency(dailySales.gasSalesAmount)}</span>
                </div>
                <div className="metric-card accent-green">
                  <span className="metric-label">瓦斯銷售已收款</span>
                  <span className="metric-value">{formatCurrency(dailySales.gasSalesPaidAmount)}</span>
                </div>
                <div className="metric-card accent-gold">
                  <span className="metric-label">還款金額 (收回舊欠)</span>
                  <span className="metric-value">{formatCurrency(dailySales.repaymentAmount)}</span>
                </div>
                <div className="metric-card accent-purple">
                  <span className="metric-label">月結應收帳款</span>
                  <span className="metric-value">{formatCurrency(dailySales.monthlyArAmount)}</span>
                </div>
                <div className="metric-card accent-red">
                  <span className="metric-label">欠款金額 (現結未付)</span>
                  <span className="metric-value">{formatCurrency(dailySales.unpaidArAmount)}</span>
                </div>
              </div>

              {/* Other Revenues */}
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '6px', color: 'var(--text-primary)' }}>💵 其它營業收入</h3>
              <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="metric-card accent-blue">
                  <span className="metric-label">爐具收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.stoveIncomeAmount)}</span>
                </div>
                <div className="metric-card accent-green">
                  <span className="metric-label">維修/安裝 收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.repairIncomeAmount)}</span>
                </div>
                <div className="metric-card accent-gold">
                  <span className="metric-label">買桶收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.cylinderIncomeAmount)}</span>
                </div>
                <div className="metric-card accent-purple">
                  <span className="metric-label">檢驗費收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.inspectionIncomeAmount)}</span>
                </div>
                <div className="metric-card accent-gold">
                  <span className="metric-label">押瓶收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.depositIncomeAmount)}</span>
                </div>
                <div className="metric-card accent-blue">
                  <span className="metric-label">其他營業收入</span>
                  <span className="metric-value">{formatCurrency(dailySales.otherIncomeAmount)}</span>
                </div>
              </div>

              {/* Quantity & Weight Metrics */}
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', borderBottom: '2px solid var(--accent-green)', paddingBottom: '6px', color: 'var(--text-primary)' }}>📦 數量與毛利指標</h3>
              <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="metric-card">
                  <span className="metric-label">當日銷售數量</span>
                  <span className="metric-value">{(dailySales.cylinderQty || 0).toLocaleString()} 桶</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">當日銷售重量</span>
                  <span className="metric-value">{(dailySales.gasKg || 0).toLocaleString()} kg</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">平均單價 (元/桶)</span>
                  <span className="metric-value">{formatCurrency(dailySales.avgPricePerCylinder || 0)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">平均單價 (元/kg)</span>
                  <span className="metric-value">${(dailySales.avgPricePerKg || 0).toFixed(2)}</span>
                </div>
                <div className="metric-card accent-green">
                  <span className="metric-label">當日估算毛利</span>
                  <span className="metric-value">{formatCurrency(dailySales.grossProfit || 0)}</span>
                </div>
              </div>

              {/* Expense Metrics */}
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', borderBottom: '2px solid var(--accent-red)', paddingBottom: '6px', color: 'var(--text-primary)' }}>💸 其它費用支出</h3>
              <div className="metrics-grid" style={{ marginBottom: '12px' }}>
                <div className="metric-card">
                  <span className="metric-label">買桶金額</span>
                  <span className="metric-value">{formatCurrency(dailySales.buyCylinderAmount)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">維修費用</span>
                  <span className="metric-value">{formatCurrency(dailySales.repairAmount)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">爐具費用</span>
                  <span className="metric-value">{formatCurrency(dailySales.stoveAmount)}</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">其他營業費用</span>
                  <span className="metric-value">{formatCurrency(dailySales.otherExpenseAmount)}</span>
                </div>
              </div>

              {/* Detail: Sales breakdown by account code */}
              <h3 style={{ fontSize: '1.1rem', margin: '16px 0 16px 0', borderBottom: '2px solid var(--border-color)', paddingBottom: '6px', color: 'var(--text-primary)' }}>📋 說明</h3>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                <p>• <strong>瓦斯銷售總金額</strong>：期間內所有科目代碼 4101 且狀態為「已審核」的收入合計。</p>
                <p>• <strong>已收款</strong>：付款狀態為「已付清」且付款方式非月結應收的項目。</p>
                <p>• <strong>月結應收帳款</strong>：付款方式設定為「月結應收」的項目。</p>
                <p>• <strong>欠款金額</strong>：現結但尚未付款（未結清）的項目。</p>
                <p>• <strong>還款金額</strong>：期間內來自「收款結算」的入帳銀行交易。</p>
                <p>• <strong>當日估算毛利</strong>：瓦斯銷售收入扣除以日為單位估算的當日進貨成本。</p>
              </div>
            </div>
          </div>
        )}

        {reportType === 'gas' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">🛢️ 營運毛利表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="metric-card accent-blue">
                  <span className="metric-label">營業總收入</span>
                  <span className="metric-value">{formatCurrency(companyProfit.totalRevenue)}</span>
                </div>
                <div className="metric-card accent-red">
                  <span className="metric-label">自動銷貨成本</span>
                  <span className="metric-value">{formatCurrency(companyProfit.totalCogs)}</span>
                </div>
                <div className="metric-card accent-gold">
                  <span className="metric-label">營業總毛利 / 毛利率</span>
                  <span className={`metric-value ${companyProfit.grossProfit < 0 ? 'text-danger' : ''}`}>{formatCurrency(companyProfit.grossProfit)}</span>
                  <span className="metric-change neutral">{companyProfit.grossMargin.toFixed(1)}%</span>
                </div>
              </div>

              {/* Category Profit Summary Table */}
              <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <div className="card-header" style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📊 各類銷售項目毛利彙總</span>
                </div>
                <div className="table-responsive">
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th style={{ textAlign: 'right' }}>營業收入</th>
                        <th style={{ textAlign: 'right' }}>銷貨成本</th>
                        <th style={{ textAlign: 'right' }}>銷貨毛利</th>
                        <th style={{ textAlign: 'right' }}>毛利率</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>🛢️ 瓦斯銷售</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalGasRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalGasCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalGasRevenue - companyProfit.totalGasCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalGasRevenue - companyProfit.totalGasCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalGasRevenue > 0 ? ((companyProfit.totalGasRevenue - companyProfit.totalGasCogs) / companyProfit.totalGasRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>🍳 爐具銷售</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalStoveRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalStoveCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalStoveRevenue - companyProfit.totalStoveCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalStoveRevenue - companyProfit.totalStoveCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalStoveRevenue > 0 ? ((companyProfit.totalStoveRevenue - companyProfit.totalStoveCogs) / companyProfit.totalStoveRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>🔧 維修/安裝</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalRepairRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalRepairCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalRepairRevenue - companyProfit.totalRepairCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalRepairRevenue - companyProfit.totalRepairCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalRepairRevenue > 0 ? ((companyProfit.totalRepairRevenue - companyProfit.totalRepairCogs) / companyProfit.totalRepairRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>🪣 鋼瓶/買桶</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalCylinderRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalCylinderCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalCylinderRevenue - companyProfit.totalCylinderCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalCylinderRevenue - companyProfit.totalCylinderCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalCylinderRevenue > 0 ? ((companyProfit.totalCylinderRevenue - companyProfit.totalCylinderCogs) / companyProfit.totalCylinderRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>🔍 檢驗費</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalInspectionRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalInspectionCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalInspectionRevenue - companyProfit.totalInspectionCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalInspectionRevenue - companyProfit.totalInspectionCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalInspectionRevenue > 0 ? ((companyProfit.totalInspectionRevenue - companyProfit.totalInspectionCogs) / companyProfit.totalInspectionRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>🏺 鋼瓶押金/押瓶</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalDepositRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalDepositCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalDepositRevenue - companyProfit.totalDepositCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalDepositRevenue - companyProfit.totalDepositCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalDepositRevenue > 0 ? ((companyProfit.totalDepositRevenue - companyProfit.totalDepositCogs) / companyProfit.totalDepositRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr>
                        <td>📦 其它銷售</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalOtherRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalOtherCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: companyProfit.totalOtherRevenue - companyProfit.totalOtherCogs >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalOtherRevenue - companyProfit.totalOtherCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.totalOtherRevenue > 0 ? ((companyProfit.totalOtherRevenue - companyProfit.totalOtherCogs) / companyProfit.totalOtherRevenue * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                      <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <td>合計</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(companyProfit.totalRevenue)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(companyProfit.totalCogs)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: companyProfit.grossProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{formatCurrency(companyProfit.grossProfit)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{companyProfit.grossMargin.toFixed(1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Materials & Parts Detailed Profit Analysis Table */}
              <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <div className="card-header" style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📦 材料與零件商品明細毛利分析表</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>依子分類分組小計</span>
                </div>
                <div className="table-responsive">
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>分類 / 商品科目</th>
                        <th style={{ textAlign: 'center' }}>出貨量</th>
                        <th style={{ textAlign: 'right' }}>出貨金額 (收入)</th>
                        <th style={{ textAlign: 'center' }}>進貨量</th>
                        <th style={{ textAlign: 'right' }}>進貨金額 (成本)</th>
                        <th style={{ textAlign: 'right' }}>商品毛利</th>
                        <th style={{ textAlign: 'right' }}>毛利率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        if (!partsProfitReport || partsProfitReport.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                                該期間無任何材料零件（5102 / 4104）交易紀錄。
                              </td>
                            </tr>
                          );
                        }

                        // Group rows by subGroup
                        const groups = {};
                        partsProfitReport.forEach(row => {
                          const gName = row.subGroup || '其他零件';
                          if (!groups[gName]) groups[gName] = [];
                          groups[gName].push(row);
                        });

                        const elements = [];
                        let grandSalesQty = 0;
                        let grandSalesRev = 0;
                        let grandPurQty = 0;
                        let grandPurCost = 0;

                        Object.keys(groups).sort().forEach(gName => {
                          const items = groups[gName];
                          let groupSalesQty = 0;
                          let groupSalesRev = 0;
                          let groupPurQty = 0;
                          let groupPurCost = 0;

                          items.forEach(item => {
                            groupSalesQty += item.salesQty;
                            groupSalesRev += item.salesRevenue;
                            groupPurQty += item.purchaseQty;
                            groupPurCost += item.purchaseCost;
                          });

                          grandSalesQty += groupSalesQty;
                          grandSalesRev += groupSalesRev;
                          grandPurQty += groupPurQty;
                          grandPurCost += groupPurCost;

                          const groupProfit = groupSalesRev - groupPurCost;
                          const groupMargin = groupSalesRev > 0 ? (groupProfit / groupSalesRev) * 100 : 0;

                          // Render group header
                          elements.push(
                            <tr key={`gheader-${gName}`} style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 600 }}>
                              <td colSpan={7} style={{ color: 'var(--text-primary)' }}>
                                📁 {gName}
                              </td>
                            </tr>
                          );

                          // Render group items
                          items.forEach(item => {
                            elements.push(
                              <tr key={`item-${item.cogsCode}`}>
                                <td style={{ paddingLeft: '24px' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>[{item.cogsCode.replace('5102', '')}] </span>
                                  {item.name}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{item.salesQty || '-'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.salesRevenue)}</td>
                                <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{item.purchaseQty || '-'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(item.purchaseCost)}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: item.grossProfit >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(item.grossProfit)}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{item.salesRevenue > 0 ? `${item.grossMargin.toFixed(1)}%` : '-'}</td>
                              </tr>
                            );
                          });

                          // Render group subtotal
                          elements.push(
                            <tr key={`gsubtotal-${gName}`} style={{ fontWeight: 600, borderBottom: '1.5px solid var(--border-color)', backgroundColor: 'rgba(5, 178, 165, 0.03)' }}>
                              <td style={{ paddingLeft: '24px', fontStyle: 'italic' }}>↳ {gName} 小計</td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{groupSalesQty || '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(groupSalesRev)}</td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{groupPurQty || '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(groupPurCost)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: groupProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{formatCurrency(groupProfit)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{groupSalesRev > 0 ? `${groupMargin.toFixed(1)}%` : '0.0%'}</td>
                            </tr>
                          );
                        });

                        // Render grand total row
                        const grandProfit = grandSalesRev - grandPurCost;
                        const grandMargin = grandSalesRev > 0 ? (grandProfit / grandSalesRev) * 100 : 0;

                        elements.push(
                          <tr key="grandtotal" style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 700 }}>
                            <td>材料與零件商品 合計</td>
                            <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{grandSalesQty || '-'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(grandSalesRev)}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{grandPurQty || '-'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(grandPurCost)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: grandProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{formatCurrency(grandProfit)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{grandSalesRev > 0 ? `${grandMargin.toFixed(1)}%` : '0.0%'}</td>
                          </tr>
                        );

                        return elements;
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="alert-box info" style={{ marginTop: 0 }}>
                本表包含瓦斯（採月加權平均）、爐具、維修/安裝、買桶、檢驗費、押瓶及其它銷售項目之毛利統計。非瓦斯類項目成本由相應支出的科目（材料、修繕、押金退回等）依日期歸帳。
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th style={{ textAlign: 'right' }}>瓦斯毛利</th>
                      <th style={{ textAlign: 'right' }}>爐具毛利</th>
                      <th style={{ textAlign: 'right' }}>維修安裝毛利</th>
                      <th style={{ textAlign: 'right' }}>買桶毛利</th>
                      <th style={{ textAlign: 'right' }}>檢驗費毛利</th>
                      <th style={{ textAlign: 'right' }}>押瓶毛利</th>
                      <th style={{ textAlign: 'right' }}>其它毛利</th>
                      <th style={{ textAlign: 'right' }}>當日總收入</th>
                      <th style={{ textAlign: 'right' }}>當日總成本</th>
                      <th style={{ textAlign: 'right' }}>當日總毛利</th>
                      <th style={{ textAlign: 'right' }}>毛利率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyProfit.dailyRows.map(row => {
                      const gasProfitVal = row.gasRevenue - row.gasCogs;
                      const stoveProfitVal = row.stoveRevenue - row.stoveCogs;
                      const repairProfitVal = row.repairRevenue - row.repairCogs;
                      const cylinderProfitVal = row.cylinderRevenue - row.cylinderCogs;
                      const inspectionProfitVal = row.inspectionRevenue - row.inspectionCogs;
                      const depositProfitVal = row.depositRevenue - row.depositCogs;
                      const otherProfitVal = row.otherRevenue - row.otherCogs;

                      return (
                        <tr key={row.date}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{row.date}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: gasProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(gasProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: stoveProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(stoveProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: repairProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(repairProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: cylinderProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(cylinderProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: inspectionProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(inspectionProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: depositProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(depositProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: otherProfitVal >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>{formatCurrency(otherProfitVal)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>{formatCurrency(row.totalRevenue)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{formatCurrency(row.totalCogs)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: row.totalProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{formatCurrency(row.totalProfit)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.totalMargin.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {companyProfit.dailyRows.length === 0 && (
                      <tr>
                        <td colSpan="12" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                          此期間尚未有已核准的銷售或收入資料。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'investor' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">🧾 投資人營運摘要</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="grid-2col" style={{ marginBottom: '24px' }}>
                <div>
                  <div className="financial-row header-row"><span>營業收入</span><span>${pnl.totalRevenue.toLocaleString()}</span></div>
                  <div className="financial-row"><span>營業毛利</span><span>${pnl.grossProfit.toLocaleString()}</span></div>
                  <div className="financial-row"><span>毛利率</span><span>{pnl.grossMargin.toFixed(1)}%</span></div>
                  <div className={`financial-row ${pnl.netProfit >= 0 ? 'total-row' : 'loss-row'}`}><span>稅前淨利</span><span>${pnl.netProfit.toLocaleString()}</span></div>
                </div>
                <div>
                  <div className="financial-row header-row"><span>瓦斯銷售公斤</span><span>{gasProfit.totalKg.toLocaleString()} kg</span></div>
                  <div className="financial-row"><span>瓦斯毛利</span><span>${gasProfit.grossProfit.toLocaleString()}</span></div>
                  <div className="financial-row"><span>期末瓦斯庫存</span><span>{gasInventory.endingKg.toLocaleString()} kg</span></div>
                  <div className="financial-row total-row"><span>期末存貨金額</span><span>${gasInventory.endingCost.toLocaleString()}</span></div>
                </div>
              </div>

              <div className="grid-2col">
                <PieChart
                  title="投資人營運結構"
                  items={[
                    { label: '瓦斯銷貨成本', amount: gasProfit.totalCogs, color: '#ef4444' },
                    { label: '營業費用', amount: pnl.totalExpenses, color: '#f59e0b' },
                    { label: '營業毛利', amount: Math.max(0, pnl.grossProfit), color: '#05b2a5' }
                  ]}
                  emptyText="此期間尚無營運資料"
                />
                <div className="alert-box info" style={{ margin: 0, alignItems: 'flex-start' }}>
                  <div>
                    <strong>瓦斯行後續營運追蹤項目</strong>
                    <div style={{ marginTop: '8px', lineHeight: 1.8 }}>
                      鋼瓶押金、鋼瓶借出與回收、空瓶/滿瓶/殘氣、車輛配送成本、客戶月結帳齡、客戶價格等級、安檢保險證照、瓦斯損耗與盤差、每車次毛利、每客戶毛利。
                    </div>
                  </div>
                </div>
              </div>

              <div className="alert-box warning" style={{ marginBottom: 0 }}>
                此摘要是內部 ERP 管理報表格式；若要正式對外作為上市櫃等級財報，仍需會計師依 IFRS 與主管機關格式覆核、調整與附註揭露。
              </div>
            </div>
          </div>
        )}

        {reportType === 'journal' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">傳票總覽</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="alert-box info" style={{ marginTop: 0 }}>
                這裡是由收入、支出、股東往來與固定資產折舊自動產生的複式傳票檢視。借方與貸方必須相等，才符合標準會計系統的基本要求。
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>傳票號</th>
                      <th>日期</th>
                      <th>摘要</th>
                      <th>借方</th>
                      <th>貸方</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries.map(entry => (
                      <tr key={entry.id}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{entry.id}</td>
                        <td>{entry.date}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{entry.description}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                            {entry.lines.map((line, idx) => (
                              <div key={idx}>{line.side === 'debit' ? '借' : '貸'}：{line.accountCode} {line.accountName} ${Number(line.amount || 0).toLocaleString()}</div>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{entry.debit.toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{entry.credit.toLocaleString()}</td>
                        <td><span className={`badge ${entry.balanced ? 'approved' : 'void'}`}>{entry.balanced ? '平衡' : '不平衡'}</span></td>
                      </tr>
                    ))}
                    {journalEntries.length === 0 && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>本期間沒有可產生傳票的資料</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'trialBalance' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">試算表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className={`alert-box ${Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01 ? 'success' : 'warning'}`} style={{ marginTop: 0 }}>
                借貸平衡檢查：借方 ${trialBalance.totalDebit.toLocaleString()}，貸方 ${trialBalance.totalCredit.toLocaleString()}。
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>科目代碼</th><th>科目名稱</th><th>借方發生額</th><th>貸方發生額</th><th>借方餘額</th><th>貸方餘額</th></tr></thead>
                  <tbody>
                    {trialBalance.rows.map(row => (
                      <tr key={`${row.accountCode}:${row.accountName}`}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.accountCode}</td><td>{row.accountName}</td>
                        <td>${row.debit.toLocaleString()}</td><td>${row.credit.toLocaleString()}</td>
                        <td>${row.debitBalance.toLocaleString()}</td><td>${row.creditBalance.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 800 }}><td colSpan="2">合計</td><td>${trialBalance.totalDebit.toLocaleString()}</td><td>${trialBalance.totalCredit.toLocaleString()}</td><td>${trialBalance.totalDebitBalance.toLocaleString()}</td><td>${trialBalance.totalCreditBalance.toLocaleString()}</td></tr>
                    {trialBalance.rows.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>此期間尚無傳票資料</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'generalLedger' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">總分類帳</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>日期</th><th>傳票編號</th><th>摘要</th><th>借方</th><th>貸方</th><th>餘額</th></tr></thead>
                  <tbody>
                    {generalLedger.flatMap(account => [
                      <tr key={`account-${account.accountCode}`} style={{ background: 'var(--bg-secondary)', fontWeight: 800 }}><td colSpan="5">{account.accountCode} {account.accountName}（期初餘額）</td><td>${account.openingBalance.toLocaleString()}</td></tr>,
                      ...account.rows.map(row => <tr key={`${account.accountCode}-${row.entryId}`}><td>{row.date}</td><td style={{ fontFamily: 'var(--font-mono)' }}>{row.entryId}</td><td>{row.description}</td><td>{row.debit ? `$${row.debit.toLocaleString()}` : ''}</td><td>{row.credit ? `$${row.credit.toLocaleString()}` : ''}</td><td>${row.runningBalance.toLocaleString()}</td></tr>)
                    ])}
                    {generalLedger.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>此期間尚無總帳資料</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'cashFlow' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">現金流量表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="summary-grid" style={{ marginBottom: '18px' }}>
                <div className="summary-card"><div className="summary-label">期初現金</div><div className="summary-value">${cashFlow.openingCash.toLocaleString()}</div></div>
                <div className="summary-card"><div className="summary-label">本期淨增減</div><div className={`summary-value ${cashFlow.netChange >= 0 ? 'income' : 'expense'}`}>${cashFlow.netChange.toLocaleString()}</div></div>
                <div className="summary-card"><div className="summary-label">期末現金</div><div className="summary-value">${cashFlow.closingCash.toLocaleString()}</div></div>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>活動類別</th><th>日期</th><th>傳票編號</th><th>摘要</th><th>現金增減</th></tr></thead>
                  <tbody>
                    {Object.entries(cashFlow.sections).flatMap(([key, section]) => [
                      ...section.rows.map(row => <tr key={`${key}-${row.entryId}`}><td>{section.label}</td><td>{row.date}</td><td style={{ fontFamily: 'var(--font-mono)' }}>{row.entryId}</td><td>{row.description}</td><td style={{ color: row.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>${row.amount.toLocaleString()}</td></tr>),
                      <tr key={`${key}-total`} style={{ fontWeight: 800 }}><td colSpan="4">{section.label}現金流量小計</td><td>${section.total.toLocaleString()}</td></tr>
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'vat' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">營業稅估算</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="alert-box warning" style={{ marginTop: 0 }}>
                目前以含稅金額用 5% 營業稅估算，薪資等非進項稅項目先排除。正式申報仍建議交由會計師確認發票與401資料。
              </div>
              <div className="summary-grid" style={{ marginBottom: '16px' }}>
                <div className="summary-card">
                  <div className="summary-label">銷售額 未稅</div>
                  <div className="summary-value income">${vatReport.salesNet.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">銷項稅額</div>
                  <div className="summary-value">${vatReport.outputTax.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">進項稅額</div>
                  <div className="summary-value">${vatReport.inputTax.toLocaleString()}</div>
                </div>
              </div>
              <div className={`financial-row ${vatReport.netTaxPayable >= 0 ? 'total-row' : 'loss-row'}`}>
                <span>{vatReport.netTaxPayable >= 0 ? '本期預估應納稅額' : '本期預估留抵稅額'}</span>
                <span>${Math.abs(vatReport.netTaxPayable).toLocaleString()}</span>
              </div>
              <div className="table-responsive" style={{ marginTop: '16px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>類別</th>
                      <th>日期</th>
                      <th>發票號碼</th>
                      <th>對象/統編</th>
                      <th>稅別</th>
                      <th>未稅金額</th>
                      <th>稅額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...vatReport.incomeRows.map(row => ({ ...row, kind: '銷項' })), ...vatReport.expenseRows.map(row => ({ ...row, kind: '進項' }))].map(row => (
                      <tr key={`${row.kind}-${row.id}`}>
                        <td><span className={`badge ${row.kind === '銷項' ? 'approved' : 'pending'}`}>{row.kind}</span></td>
                        <td>{row.invoiceDate || row.date}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{row.invoiceNo || '-'}</td>
                        <td>{row.counterpartyName || '-'} {row.counterpartyTaxId ? `(${row.counterpartyTaxId})` : ''}</td>
                        <td>{row.taxType === 'taxable' ? '應稅' : row.taxType === 'zero' ? '零稅率' : row.taxType === 'exempt' ? '免稅' : '非營業稅'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(row.taxableAmount || 0).toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(row.vatAmountCalculated || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'payroll' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">薪資成本估算</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="alert-box warning" style={{ marginTop: 0 }}>
                目前先以薪資支出科目估算雇主負擔，勞保、健保、勞退會因投保級距與員工身分不同而變動，正式發薪前仍需核對實際級距。
              </div>
              <div className="summary-grid" style={{ marginBottom: '16px' }}>
                <div className="summary-card">
                  <div className="summary-label">薪資總額</div>
                  <div className="summary-value">${payrollReport.grossSalary.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">預估雇主負擔</div>
                  <div className="summary-value expense">${(payrollReport.estimatedLaborInsurance + payrollReport.estimatedHealthInsurance + payrollReport.estimatedPension).toLocaleString()}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">公司總成本</div>
                  <div className="summary-value">${payrollReport.totalEmployerCost.toLocaleString()}</div>
                </div>
              </div>
              <div className="financial-row"><span>勞保預估</span><span>${payrollReport.estimatedLaborInsurance.toLocaleString()}</span></div>
              <div className="financial-row"><span>健保預估</span><span>${payrollReport.estimatedHealthInsurance.toLocaleString()}</span></div>
              <div className="financial-row"><span>勞退預估</span><span>${payrollReport.estimatedPension.toLocaleString()}</span></div>
              <div className="financial-row"><span>代扣所得稅</span><span>${payrollReport.withholdingTax.toLocaleString()}</span></div>
              <div className="table-responsive" style={{ marginTop: '16px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>員工</th>
                      <th>薪資月份</th>
                      <th>薪資金額</th>
                      <th>勞保</th>
                      <th>健保</th>
                      <th>勞退</th>
                      <th>扣繳稅</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollReport.salaryRows.map(row => (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>{row.employeeName || row.counterpartyName || '-'}</td>
                        <td>{row.payrollMonth || String(row.date || '').slice(0, 7)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>${Number(row.amount || 0).toLocaleString()}</td>
                        <td>${Number(row.laborInsurance || 0).toLocaleString()}</td>
                        <td>${Number(row.healthInsurance || 0).toLocaleString()}</td>
                        <td>${Number(row.pension || 0).toLocaleString()}</td>
                        <td>${Number(row.withholdingTax || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    {payrollReport.salaryRows.length === 0 && (
                      <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>本期間沒有薪資支出資料</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {reportType === 'auditReady' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">查帳檢核</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>期間：{activePeriodLabel}</span>
            </div>
            <div className="card-body">
              <div className="summary-grid" style={{ marginBottom: '24px' }}>
                <div className="summary-card" style={{ padding: '16px', borderRadius: 'var(--border-radius)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="summary-label">查帳準備分數</div>
                  <div className="summary-value" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-green)' }}>{auditReadiness.score}</div>
                </div>
                <div 
                  className={`summary-card ${selectedAuditCategory === 'missingAttachment' ? 'active-card' : ''}`} 
                  onClick={() => setSelectedAuditCategory(selectedAuditCategory === 'missingAttachment' ? null : 'missingAttachment')}
                  style={{ 
                    padding: '16px', 
                    borderRadius: 'var(--border-radius)', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: selectedAuditCategory === 'missingAttachment' ? '2px solid var(--accent-red)' : '1px solid var(--border-color)', 
                    cursor: 'pointer',
                    transform: selectedAuditCategory === 'missingAttachment' ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="summary-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>缺憑證筆數</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👉 點擊查核</span>
                  </div>
                  <div className="summary-value expense" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-red)' }}>{auditReadiness.approvedWithoutAttachment.length}</div>
                </div>
                <div 
                  className={`summary-card ${selectedAuditCategory === 'pending' ? 'active-card' : ''}`}
                  onClick={() => setSelectedAuditCategory(selectedAuditCategory === 'pending' ? null : 'pending')}
                  style={{ 
                    padding: '16px', 
                    borderRadius: 'var(--border-radius)', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: selectedAuditCategory === 'pending' ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)', 
                    cursor: 'pointer',
                    transform: selectedAuditCategory === 'pending' ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="summary-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>未完成審核</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👉 點擊查核</span>
                  </div>
                  <div className="summary-value" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{auditReadiness.pendingRows.length}</div>
                </div>
                <div 
                  className={`summary-card ${selectedAuditCategory === 'missingInvoice' ? 'active-card' : ''}`}
                  onClick={() => setSelectedAuditCategory(selectedAuditCategory === 'missingInvoice' ? null : 'missingInvoice')}
                  style={{ 
                    padding: '16px', 
                    borderRadius: 'var(--border-radius)', 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: selectedAuditCategory === 'missingInvoice' ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)', 
                    cursor: 'pointer',
                    transform: selectedAuditCategory === 'missingInvoice' ? 'scale(1.02)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="summary-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>應稅缺發票</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👉 點擊查核</span>
                  </div>
                  <div className="summary-value expense" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{auditReadiness.taxableWithoutInvoice.length}</div>
                </div>
              </div>

              {selectedAuditCategory && (
                <div className="card" style={{ marginTop: '0px', marginBottom: '24px', border: '1px solid var(--border-color)', boxShadow: 'none' }}>
                  <div className="card-header" style={{ padding: '12px 16px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {selectedAuditCategory === 'missingAttachment' && '📂 缺憑證項目明細'}
                      {selectedAuditCategory === 'pending' && '⏳ 待審核項目明細'}
                      {selectedAuditCategory === 'missingInvoice' && '🧾 應稅缺發票項目明細'}
                    </span>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => setSelectedAuditCategory(null)}>關閉明細</button>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>類型</th>
                          <th>會計科目</th>
                          <th>金額</th>
                          <th>備註</th>
                          <th style={{ width: '220px', textAlign: 'center' }}>快速查核 / 修正操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const list = 
                            selectedAuditCategory === 'missingAttachment' ? auditReadiness.approvedWithoutAttachment :
                            selectedAuditCategory === 'pending' ? auditReadiness.pendingRows :
                            auditReadiness.taxableWithoutInvoice;

                          if (list.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                                  該分類目前無任何異常傳票。
                                </td>
                              </tr>
                            );
                          }

                          return list.map(item => {
                            const isRealIncome = getIncomes().some(x => x.id === item.id);
                            return (
                              <tr 
                                key={item.id}
                                onClick={() => {
                                  const tx = getIncomes().find(x => x.id === item.id) || getExpenses().find(x => x.id === item.id);
                                  if (tx) {
                                    setSelectedTransaction({
                                      ...tx,
                                      type: isRealIncome ? 'income' : 'expense'
                                    });
                                  } else {
                                    setSelectedTransaction({
                                      ...item,
                                      type: isRealIncome ? 'income' : 'expense'
                                    });
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                                title="點擊點入看交易明細"
                              >
                                <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date}</td>
                                <td>
                                  <span className={`badge ${isRealIncome ? 'badge-success' : 'badge-danger'}`} style={{ padding: '2px 6px', fontSize: '0.8rem' }}>
                                    {isRealIncome ? '收入' : '支出'}
                                  </span>
                                </td>
                                <td>{item.accountCode} - {item.accountName || ''}</td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(item.amount || item.calculatedAmount)}</td>
                                <td style={{ fontSize: '0.85rem' }}>{item.remarks || item.desc || '-'}</td>
                                <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                  <QuickAuditAction 
                                    item={item} 
                                    isIncome={isRealIncome} 
                                    category={selectedAuditCategory} 
                                    onUpdate={handleQuickUpdate} 
                                  />
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>檢核項目</th>
                      <th>結果</th>
                      <th>建議處理</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>傳票借貸平衡</td>
                      <td>{auditReadiness.unbalancedEntries.length === 0 ? '通過' : `${auditReadiness.unbalancedEntries.length} 筆不平衡`}</td>
                      <td>不平衡傳票需先修正才能交給會計師。</td>
                    </tr>
                    <tr>
                      <td style={{ cursor: 'pointer', color: 'var(--accent-red)', textDecoration: 'underline' }} onClick={() => setSelectedAuditCategory('missingAttachment')}>已核准資料憑證</td>
                      <td>{auditReadiness.approvedWithoutAttachment.length === 0 ? '通過' : `${auditReadiness.approvedWithoutAttachment.length} 筆缺憑證`}</td>
                      <td>補上發票、收據、匯款或支票影像。</td>
                    </tr>
                    <tr>
                      <td style={{ cursor: 'pointer', color: 'var(--accent-gold)', textDecoration: 'underline' }} onClick={() => setSelectedAuditCategory('pending')}>待審資料</td>
                      <td>{auditReadiness.pendingRows.length === 0 ? '通過' : `${auditReadiness.pendingRows.length} 筆待審`}</td>
                      <td>月底關帳前需核准、退回或作廢。</td>
                    </tr>
                    <tr>
                      <td style={{ cursor: 'pointer', color: 'var(--accent-blue)', textDecoration: 'underline' }} onClick={() => setSelectedAuditCategory('missingInvoice')}>營業稅發票資訊</td>
                      <td>{auditReadiness.taxableWithoutInvoice.length === 0 ? '通過' : `${auditReadiness.taxableWithoutInvoice.length} 筆應稅資料缺發票號碼`}</td>
                      <td>補上發票號碼、發票日期與統編，方便401申報整理。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. Shareholder Dividends and LINE export */}
        {reportType === 'dividend' && (
          <div className="grid-2col" style={{ gridTemplateColumns: '3fr 2fr' }}>
            {/* Left Side: Dividends details */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">👑 股東分紅明細表</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  期間：{activePeriodLabel}
                </span>
              </div>
              <div className="card-body">
                {/* Profit Metrics */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 'var(--border-radius-sm)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>本月淨利潤</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: dividends.isLoss ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                      ${dividends.netProfit.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>保留公積金 ({Math.round(reserveRatio * 100)}%)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
                      -${dividends.reserveAmount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>本月可發放紅利</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                      ${dividends.totalDividends.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Interactive Reserve Input & Slider */}
                {!dividends.isLoss && (
                  <div className="form-group" style={{ marginBottom: '24px', backgroundColor: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '12px', display: 'block' }}>調整保留公積金</label>
                    
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* TWD Amount Input */}
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>自訂保留金額 (TWD)</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="例如：20000" 
                          value={customAmountText} 
                          onFocus={() => setIsAmountFocused(true)}
                          onBlur={() => {
                            setIsAmountFocused(false);
                            setCustomAmountText(String(Math.round(dividends.reserveAmount || 0)));
                          }}
                          onChange={e => {
                            const valText = e.target.value;
                            setCustomAmountText(valText);
                            const valNum = Number(valText || 0);
                            const val = Math.max(0, isNaN(valNum) ? 0 : valNum);
                            const maxVal = dividends.netProfit;
                            const finalVal = val > maxVal ? maxVal : val;
                            setReserveRatio(dividends.netProfit > 0 ? finalVal / dividends.netProfit : 0);
                          }} 
                        />
                      </div>

                      {/* Percentage Input */}
                      <div style={{ flex: '1', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>提撥比例 (%)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input 
                            type="number" 
                            className="form-control" 
                            style={{ width: '80px' }}
                            value={reservePercentText} 
                            onFocus={() => setIsPercentFocused(true)}
                            onBlur={() => {
                              setIsPercentFocused(false);
                              setReservePercentText(String(Math.round(reserveRatio * 100)));
                            }}
                            onChange={e => {
                              const valText = e.target.value;
                              setReservePercentText(valText);
                              const valNum = Number(valText || 0);
                              const val = Math.max(0, Math.min(100, isNaN(valNum) ? 0 : valNum));
                              setReserveRatio(val / 100);
                            }} 
                          />
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>%</span>
                        </div>
                      </div>
                    </div>

                    {/* Slider covering 0% to 100% */}
                    <div style={{ marginTop: '16px' }}>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.01" 
                        className="form-control" 
                        style={{ padding: '0', cursor: 'pointer', height: '6px' }} 
                        value={reserveRatio} 
                        onChange={e => setReserveRatio(parseFloat(e.target.value))} 
                      />
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        * 公積金將保留在公司銀行存款中做為營運週轉金，不予發放分紅。
                      </span>
                      <button 
                        type="button" 
                        className="btn btn-primary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
                        onClick={async () => {
                          const locks = getPeriodLocks();
                          const idx = locks.findIndex(item => item.companyId === companyId && item.yearMonth === activePeriodVal);
                          if (idx !== -1) {
                            locks[idx] = {
                              ...locks[idx],
                              reserveRatio: reserveRatio
                            };
                          } else {
                            locks.push({
                              companyId,
                              yearMonth: activePeriodVal,
                              locked: false,
                              reserveRatio: reserveRatio
                            });
                          }
                          savePeriodLocks(locks);
                          
                          // Dispatch global refresh event & sync to Supabase
                          window.dispatchEvent(new Event('bp_data_changed'));
                          showToast('💾 公積金設定已成功儲存並同步！', 'success');
                        }}
                      >
                        💾 儲存設定
                      </button>
                    </div>
                  </div>
                )}

                {/* Table */}
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>股東姓名</th>
                        <th style={{ textAlign: 'right' }}>入股本金</th>
                        <th style={{ textAlign: 'right' }}>股權佔比</th>
                        <th style={{ textAlign: 'right' }}>應得紅利 (TWD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.shareholderDividends.map((sh, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600' }}>{sh.name}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            ${sh.activeCapital.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {sh.ratio}%
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                            ${sh.dividend.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {dividends.shareholderDividends.length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            尚未有股東出資記錄
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {dividends.isLoss && (
                  <div className="alert-box error" style={{ marginTop: '24px', marginBottom: 0 }}>
                    ⚠️ 本月因營業額低於支出而處於虧損狀態。按照股東協議，本月不分配任何紅利，亦不轉嫁虧損給個人股東（不攤還），該筆虧損將自動滾入公司保留盈餘中。
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: LINE Share Preview and Copy */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">💬 LINE 股東群分享預覽</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <pre style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-sm)',
                  padding: '16px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  overflowY: 'auto',
                  maxHeight: '320px'
                }}>
                  {generateLineShareText(companyName, dividends)}
                </pre>

                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCopyLine}>
                  📋 一鍵複製 LINE 格式文字
                </button>
              </div>
            </div>
          </div>
        )}

        {reportType === 'equity' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📈 股東權益變動表</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                期間：{activePeriodLabel}
              </span>
            </div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>股東姓名</th>
                      <th style={{ textAlign: 'right' }}>持股比例</th>
                      <th style={{ textAlign: 'right' }}>期初權益</th>
                      <th style={{ textAlign: 'right' }}>本期認股/增資</th>
                      <th style={{ textAlign: 'right' }}>分配本期淨利</th>
                      <th style={{ textAlign: 'right' }}>本期已發紅利 (扣減)</th>
                      <th style={{ textAlign: 'right' }}>期末權益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shareholderChanges.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: '600' }}>{s.name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {s.ratio.toFixed(2)}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          ${s.openingEquity.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: s.periodCapital > 0 ? 'var(--accent-green)' : 'inherit' }}>
                          {s.periodCapital > 0 ? `+$${s.periodCapital.toLocaleString()}` : `$0`}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: s.periodProfitShare >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {s.periodProfitShare >= 0 ? `+$${s.periodProfitShare.toLocaleString()}` : `-$${Math.abs(s.periodProfitShare).toLocaleString()}`}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                          {s.periodDividend > 0 ? `-$${s.periodDividend.toLocaleString()}` : `$0`}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--accent-blue)' }}>
                          ${s.endingEquity.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 'bold', backgroundColor: 'var(--bg-secondary)' }}>
                      <td>合計</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>100%</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        ${shareholderChanges.reduce((sum, s) => sum + s.openingEquity, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>
                        ${shareholderChanges.reduce((sum, s) => sum + s.periodCapital, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>
                        ${shareholderChanges.reduce((sum, s) => sum + s.periodProfitShare, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>
                        -${shareholderChanges.reduce((sum, s) => sum + s.periodDividend, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontSize: '1.05rem' }}>
                        ${shareholderChanges.reduce((sum, s) => sum + s.endingEquity, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="alert-box note" style={{ marginTop: '24px', marginBottom: 0 }}>
                💡 <strong>會計說明：</strong>
                <ul style={{ margin: '8px 0 0 16px', paddingLeft: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>
                  <li>期初權益 = 期初累積原始出資額 + 歷年累積盈餘分配。</li>
                  <li>本期已發紅利為從公司帳戶扣減並發放給股東的股息紅利，此動作會使股東在公司內的保留權益相應減少。</li>
                  <li>期末權益 = 期初權益 + 本期認股/增資 + 分配本期淨利 - 本期已發紅利。</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drill Down Modal */}
      {drillDownCode && (
        <div className="modal-overlay no-print" style={{ zIndex: 1200 }} onClick={() => setDrillDownCode(null)}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                🔍 科目交易明細：{drillDownCode} {drillDownName} (期間: {activePeriodLabel})
              </span>
              <button type="button" className="modal-close" onClick={() => setDrillDownCode(null)}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto' }}>
              {drillDownTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0' }}>
                  此會計期間無已核准之交易記錄。
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>記帳日期</th>
                        <th>項目</th>
                        <th>收付款方式 / 狀態</th>
                        <th>備註</th>
                        <th style={{ textAlign: 'right' }}>金額 (TWD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillDownTransactions.map(tx => (
                        <tr key={tx.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{tx.date}</td>
                          <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {getChartOfAccounts().find(a => a.code === tx.accountCode)?.name || '一般收支'}
                          </td>
                          <td>
                            {tx.paymentMethod === 'cash' ? '現金(零用金)' : tx.paymentMethod === 'bank_transfer' ? '銀行轉帳' : tx.paymentMethod === 'receivable' ? '月結應收' : tx.paymentMethod === 'payable' ? '月結應付' : '支票'}
                            {tx.paymentStatus === 'unpaid' ? (
                              <span style={{ color: 'var(--accent-red)', marginLeft: '6px', fontWeight: 'bold' }}>🔴 未結清</span>
                            ) : (
                              <span style={{ color: 'var(--accent-green)', marginLeft: '6px' }}>✓ 已結清</span>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'normal', maxWidth: '250px' }}>
                            {tx.remarks}
                            {tx.receiptAttachment && (
                              <div style={{ marginTop: '4px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                  onClick={() => openReceiptPreview(tx.receiptAttachment)}
                                >
                                  📷 檢視憑證
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDrillDownCode(null)}>
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom Receipt Modal */}
      {viewingReceiptUrl && (
        <div className="modal-overlay no-print" style={{ zIndex: 1300 }} onClick={closeReceiptPreview}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📷 憑證照片檢視</span>
              <button type="button" className="modal-close" onClick={closeReceiptPreview}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px' }}>
              <img 
                src={viewingReceiptUrl} 
                alt="Receipt" 
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeReceiptPreview}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="modal-overlay no-print" style={{ zIndex: 1250 }} onClick={() => setSelectedTransaction(null)}>
          <div className="modal-content" style={{ maxWidth: '600px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                🔍 交易傳票詳細資料
              </span>
              <button type="button" className="modal-close" onClick={() => setSelectedTransaction(null)}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: '20px', overflowY: 'auto', maxHeight: '70vh' }}>
              {/* Section 1: Basic Information */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>交易編號 (ID)</label>
                  <div style={{ fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>{selectedTransaction.id}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>交易類型</label>
                  <div>
                    <span className={`badge ${selectedTransaction.type === 'income' ? 'badge-success' : 'badge-danger'}`} style={{ padding: '3px 6px', fontSize: '0.8rem' }}>
                      {selectedTransaction.type === 'income' ? '收入' : '支出'}
                    </span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>記帳日期</label>
                  <div style={{ fontWeight: '600' }}>{selectedTransaction.date}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>會計科目</label>
                  <div style={{ fontWeight: '600' }}>
                    {(() => {
                      const coa = getChartOfAccounts();
                      const match = coa.find(a => a.code === selectedTransaction.accountCode);
                      return match ? `${match.code} - ${match.name}` : selectedTransaction.accountCode;
                    })()}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>實收/實付金額</label>
                  <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: selectedTransaction.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    ${Number(selectedTransaction.amount || selectedTransaction.calculatedAmount || 0).toLocaleString()} TWD
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>收付款方式</label>
                  <div style={{ fontWeight: '600' }}>
                    {selectedTransaction.paymentMethod === 'cash' ? '現金(零用金)' : selectedTransaction.paymentMethod === 'bank_transfer' ? '銀行轉帳' : selectedTransaction.paymentMethod === 'receivable' ? '月結應收' : selectedTransaction.paymentMethod === 'payable' ? '月結應付' : '支票'}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>付款狀態</label>
                  <div style={{ fontWeight: '600' }}>
                    {selectedTransaction.paymentStatus === 'unpaid' ? (
                      <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>🔴 未結清</span>
                    ) : (
                      <span style={{ color: 'var(--accent-green)' }}>✓ 已結清</span>
                    )}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>審核狀態</label>
                  <div style={{ fontWeight: '600' }}>
                    {selectedTransaction.status === 'approved' ? (
                      <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>✓ 已核准</span>
                    ) : selectedTransaction.status === 'draft' ? (
                      <span style={{ color: 'var(--text-tertiary)' }}>草稿</span>
                    ) : selectedTransaction.status === 'rejected' ? (
                      <span style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>已駁回</span>
                    ) : (
                      <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>⏳ 待審核</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Salary Detail (Only if it's 6101 Salary expense) */}
              {selectedTransaction.accountCode && selectedTransaction.accountCode.startsWith('6101') && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📝 薪資與保費代扣明細
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>員工姓名：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.employeeName || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>薪資月份：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.payrollMonth || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>勞保扣款：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${Number(selectedTransaction.laborInsurance || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>健保扣款：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${Number(selectedTransaction.healthInsurance || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>勞退提撥：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${Number(selectedTransaction.pension || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>代扣所得稅：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${Number(selectedTransaction.withholdingTax || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Invoice & VAT details (Only if present and not a salary/rent/tax) */}
              {selectedTransaction.invoiceNo || selectedTransaction.counterpartyTaxId || (selectedTransaction.taxType && selectedTransaction.taxType !== 'non_vat') ? (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    🧾 發票與稅務明細
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>發票號碼：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{selectedTransaction.invoiceNo || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>發票日期：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.invoiceDate || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>對象統編：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{selectedTransaction.counterpartyTaxId || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>交易對象：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.counterpartyName || '未填寫'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>稅別：</span>
                      <span style={{ fontWeight: '600' }}>
                        {selectedTransaction.taxType === 'taxable' ? '應稅 5%' : selectedTransaction.taxType === 'zero' ? '零稅率' : selectedTransaction.taxType === 'exempt' ? '免稅' : '非營業稅'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>稅額：</span>
                      <span style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>${Number(selectedTransaction.vatAmount || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>金額稅別：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.taxIncluded ? '含稅' : '未稅'}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Section 4: Project & Other Metadata */}
              {(selectedTransaction.projectName || selectedTransaction.counterpartyName) && !selectedTransaction.invoiceNo && !selectedTransaction.accountCode?.startsWith('6101') && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
                    👤 交易對象與專案
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>對象名稱：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.counterpartyName || '無'}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>專案名稱：</span>
                      <span style={{ fontWeight: '600' }}>{selectedTransaction.projectName || '無'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 5: Remarks */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>備註備忘</label>
                <div style={{ whiteSpace: 'pre-wrap', backgroundColor: 'var(--bg-secondary)', padding: '10px', borderRadius: '6px', fontSize: '0.9rem', border: '1px solid var(--border-color)', lineHeight: '1.4' }}>
                  {selectedTransaction.remarks || '（無備註說明）'}
                </div>
              </div>

              {/* Section 6: User Logs */}
              {selectedTransaction.creatorName && (
                <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  <div>登錄人員：{selectedTransaction.creatorName}</div>
                  {selectedTransaction.createdAt && <div>登錄時間：{new Date(selectedTransaction.createdAt).toLocaleString()}</div>}
                </div>
              )}

              {/* Section 7: Attachment */}
              {selectedTransaction.receiptAttachment && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => openReceiptPreview(selectedTransaction.receiptAttachment)}
                  >
                    📷 檢視大圖憑證照片
                  </button>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedTransaction(null)}>
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAuditAction({ item, isIncome, category, onUpdate }) {
  const [invoiceNo, setInvoiceNo] = useState(item.invoiceNo || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (category === 'pending') {
    return (
      <button 
        className="btn btn-success btn-sm" 
        onClick={async () => {
          setSaving(true);
          try {
            await onUpdate(item.id, isIncome, { status: 'approved' });
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving}
        style={{ padding: '4px 10px', fontSize: '0.8rem', backgroundColor: 'var(--accent-green)', borderColor: 'var(--accent-green)', color: '#fff' }}
      >
        {saving ? '處理中...' : '👍 快速核准'}
      </button>
    );
  }

  if (category === 'missingAttachment') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <input 
          type="file" 
          accept="image/*" 
          id={`upload-audit-${item.id}`} 
          style={{ display: 'none' }} 
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const reader = new FileReader();
              reader.onload = async (event) => {
                const img = new Image();
                img.onload = async () => {
                  const canvas = document.createElement('canvas');
                  let w = img.width;
                  let h = img.height;
                  const MAX_WIDTH = 1200;
                  const MAX_HEIGHT = 1200;
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
                  
                  const attachment = await uploadCloudAttachment({ dataUrl: compressed, filename: file.name });
                  await onUpdate(item.id, isIncome, { receiptAttachment: attachment });
                };
                img.src = event.target.result;
              };
              reader.readAsDataURL(file);
            } catch (err) {
              window.alert(err.message || '上傳失敗');
            } finally {
              setUploading(false);
            }
          }}
        />
        <label 
          htmlFor={`upload-audit-${item.id}`} 
          className="btn btn-primary btn-sm" 
          style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '0.8rem', margin: 0 }}
        >
          {uploading ? '上傳中...' : '📂 上傳憑證'}
        </label>
      </div>
    );
  }

  if (category === 'missingInvoice') {
    return (
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="發票號碼"
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
          style={{ width: '120px', padding: '4px 8px', fontSize: '0.8rem', margin: 0, height: '28px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
        />
        <button 
          className="btn btn-primary btn-sm" 
          onClick={async () => {
            if (!invoiceNo.trim()) return;
            setSaving(true);
            try {
              await onUpdate(item.id, isIncome, { invoiceNo: invoiceNo.trim() });
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving || !invoiceNo.trim()}
          style={{ padding: '4px 8px', fontSize: '0.8rem', height: '28px' }}
        >
          儲存
        </button>
      </div>
    );
  }

  return null;
}
