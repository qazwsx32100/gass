import React, { useMemo, useState } from 'react';
import { getIncomeStatement, getBankBalancesAtDate, getDividendsForMonth, getPeriodEndDate, getGasGrossProfitForPeriod, getGasInventoryForMonth, getCashNetProfitSummary, getMonthlyOperatingSummary } from '../utils/financials';
import { getIncomes, getExpenses, getBudgets, getSystemConfig, getBanks, getChartOfAccounts, getCustomers } from '../db/storage';
import { canViewShareholderReports } from '../utils/permissions';
import PieChart from '../components/PieChart';
import TrendChart from '../components/TrendChart';
import LedgerCategoryBreakdown from '../components/LedgerCategoryBreakdown';
import { entriesForCategory, groupLedgerEntriesByCategory } from '../utils/ledgerCategories';

export default function DashboardView({ companyId, year, month, triggerRefresh, userRole, onNavigate }) {
  const periodVal = `${year}-${month}`;
  const showShareholderReports = canViewShareholderReports(userRole);
  const [activeDetailModal, setActiveDetailModal] = useState(null);
  const [selectedDetailCategory, setSelectedDetailCategory] = useState('');

  const openDetailModal = (modalName) => {
    setSelectedDetailCategory('');
    setActiveDetailModal(modalName);
  };

  const handleNavigateToChecks = () => {
    sessionStorage.setItem('inputsActiveSubTab', 'checks');
    if (onNavigate) {
      onNavigate('inputs');
    }
  };
  
  // Calculate P&L for current month
  const pnl = useMemo(() => {
    void triggerRefresh;
    const res = getIncomeStatement(companyId, 'month', periodVal);
    return res || { totalRevenue: 0, totalCogs: 0, totalExpenses: 0, grossProfit: 0, netProfit: 0 };
  }, [companyId, periodVal, triggerRefresh]);

  const cashNetProfit = useMemo(() => {
    void triggerRefresh;
    return getCashNetProfitSummary(companyId, 'month', periodVal);
  }, [companyId, periodVal, triggerRefresh]);

  const monthlyOperating = useMemo(() => {
    void triggerRefresh;
    return getMonthlyOperatingSummary(companyId, periodVal);
  }, [companyId, periodVal, triggerRefresh]);

  const gasProfit = useMemo(() => {
    void triggerRefresh;
    const res = getGasGrossProfitForPeriod(companyId, 'month', periodVal);
    return res || { totalKg: 0, totalRevenue: 0, totalCogs: 0, grossProfit: 0, grossMargin: 0 };
  }, [companyId, periodVal, triggerRefresh]);

  const gasInventory = useMemo(() => {
    void triggerRefresh;
    const res = getGasInventoryForMonth(companyId, periodVal);
    return res || { beginningKg: 0, purchasedKg: 0, endingKg: 0, endingCost: 0, averageCostPerKg: 0 };
  }, [companyId, periodVal, triggerRefresh]);

  // Calculate P&L for previous month for comparison
  const prevPeriodVal = useMemo(() => {
    const mNum = parseInt(month, 10);
    if (mNum === 1) {
      return `${year - 1}-12`;
    }
    return `${year}-${String(mNum - 1).padStart(2, '0')}`;
  }, [year, month]);

  const prevCashNetProfit = useMemo(() => {
    void triggerRefresh;
    return getCashNetProfitSummary(companyId, 'month', prevPeriodVal);
  }, [companyId, prevPeriodVal, triggerRefresh]);

  const prevMonthlyOperating = useMemo(() => {
    void triggerRefresh;
    return getMonthlyOperatingSummary(companyId, prevPeriodVal);
  }, [companyId, prevPeriodVal, triggerRefresh]);

  // Cash / Bank balance at the end of the month
  const cashBalance = useMemo(() => {
    void triggerRefresh;
    const lastDayStr = getPeriodEndDate('month', periodVal);
    const balances = getBankBalancesAtDate(companyId, lastDayStr) || [];
    return balances.reduce((sum, b) => sum + (b?.currentBalance || 0), 0);
  }, [companyId, periodVal, triggerRefresh]);

  // Dividends for the month
  const dividendData = useMemo(() => {
    void triggerRefresh;
    return getDividendsForMonth(companyId, periodVal, 0.1) || { reserveAmount: 0, distributableAmount: 0, shareholders: [] };
  }, [companyId, periodVal, triggerRefresh]);

  // Cash / Bank balance of Petty Cash at the end of the month
  const pettyCashBalance = useMemo(() => {
    void triggerRefresh;
    const lastDayStr = getPeriodEndDate('month', periodVal);
    const balances = getBankBalancesAtDate(companyId, lastDayStr) || [];
    const petty = balances.find(b => b && (b.id === 'BANK_PETTY' || b.bankId === 'BANK_PETTY'));
    return petty ? (petty.currentBalance || 0) : 0;
  }, [companyId, periodVal, triggerRefresh]);

  // Accounts Receivable at the end of the month
  const receivablesSummary = monthlyOperating.receivables;

  const receivablesTotal = receivablesSummary?.total?.outstandingAmount || 0;
  const monthlyReceivablesTotal = receivablesSummary?.monthly?.outstandingAmount || 0;
  const currentDebtTotal = receivablesSummary?.currentDebt?.outstandingAmount || 0;
  const customerDetails = useMemo(() => {
    void triggerRefresh;
    return new Map((getCustomers() || []).map(item => [item.id, item]));
  }, [triggerRefresh]);

  // Approved Expenses for current month
  const currentMonthExpenses = useMemo(() => {
    void triggerRefresh;
    const list = getExpenses() || [];
    return list.filter(e =>
      e && e.companyId === companyId &&
      e.status === 'approved' &&
      e.date && typeof e.date === 'string' && e.date.startsWith(periodVal)
    );
  }, [companyId, periodVal, triggerRefresh]);

  const topCashIncomeSources = useMemo(() => {
    const names = Object.fromEntries((getChartOfAccounts() || []).filter(item => item?.code).map(item => [item.code, item.name]));
    const grouped = new Map();
    (cashNetProfit?.revenue?.entries || []).forEach(item => {
      const isSettlement = item.recognitionType === 'receivable_settlement';
      const key = isSettlement ? 'customer-settlement' : `income-${item.accountCode || 'other'}`;
      const label = isSettlement ? '客戶還款（應收／欠款）' : (names[item.accountCode] || item.accountCode || '其他收入');
      grouped.set(key, { label, amount: (grouped.get(key)?.amount || 0) + Number(item.amount || 0) });
    });
    return [...grouped.values()].filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
  }, [cashNetProfit]);

  const topCashExpenseSources = useMemo(() => {
    const names = Object.fromEntries((getChartOfAccounts() || []).filter(item => item?.code).map(item => [item.code, item.name]));
    const grouped = new Map();
    (cashNetProfit?.expenses?.entries || []).forEach(item => {
      const isSettlement = item.recognitionType === 'payable_settlement';
      const key = isSettlement ? 'payable-settlement' : `expense-${item.accountCode || 'other'}`;
      const label = isSettlement ? '應付帳款還款' : (names[item.accountCode] || item.accountCode || '其他支出');
      grouped.set(key, { label, amount: (grouped.get(key)?.amount || 0) + Number(item.amount || 0) });
    });
    return [...grouped.values()].filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
  }, [cashNetProfit]);

  // All Bank Balances
  const bankBalancesList = useMemo(() => {
    void triggerRefresh;
    const lastDayStr = getPeriodEndDate('month', periodVal);
    return getBankBalancesAtDate(companyId, lastDayStr) || [];
  }, [companyId, periodVal, triggerRefresh]);

  // Budgets & Actual Expenditures
  const budgetProgressItems = useMemo(() => {
    void triggerRefresh;
    const allBudgets = (getBudgets() || []).filter(b => b && b.companyId === companyId && String(b.year) === String(year) && String(b.month) === String(month));
    const accounts = getChartOfAccounts() || [];
    
    return allBudgets.map(b => {
      const account = accounts.find(a => a && a.code === b.accountCode);
      const accName = account ? account.name : b.accountCode;
      const actualSum = (currentMonthExpenses || []).filter(e => e && e.accountCode === b.accountCode).reduce((sum, e) => sum + (e.amount || 0), 0);
      const pct = (b.budgetAmount || 0) > 0 ? (actualSum / b.budgetAmount) * 100 : 0;
      return {
        code: b.accountCode,
        name: accName,
        budget: b.budgetAmount || 0,
        actual: actualSum,
        percentage: pct
      };
    });
  }, [companyId, year, month, currentMonthExpenses, triggerRefresh]);

  // Pending Checks Alerts
  const checkAlerts = useMemo(() => {
    void triggerRefresh;
    const config = getSystemConfig() || {};
    if (!config.enableCheckMaturityAlert) return [];
    
    const incomes = (getIncomes() || []).filter(i => i && i.companyId === companyId && i.paymentMethod === 'check' && i.paymentStatus === 'unpaid' && i.status === 'approved');
    const expenses = (getExpenses() || []).filter(e => e && e.companyId === companyId && e.paymentMethod === 'check' && e.paymentStatus === 'unpaid' && e.status === 'approved');
    
    const today = new Date();
    const parseDate = (dStr) => dStr ? new Date(dStr) : null;
    
    const list = [
      ...incomes.map(i => ({ ...i, type: 'income', label: '應收票據' })),
      ...expenses.map(e => ({ ...e, type: 'expense', label: '應付票據' }))
    ].map(item => {
      const dueDateObj = parseDate(item.checkDueDate);
      const daysLeft = dueDateObj ? Math.ceil((dueDateObj - today) / (1000 * 60 * 60 * 24)) : 999;
      return {
        ...item,
        daysLeft
      };
    });
    
    return list.filter(item => item.daysLeft <= 3).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [companyId, triggerRefresh]);

  // Get recent 5 transactions
  const recentTransactions = useMemo(() => {
    void triggerRefresh;
    const incs = (getIncomes() || [])
      .filter(i => i && i.companyId === companyId)
      .map(i => ({ ...i, type: 'income', label: '收入' }));
    const exps = (getExpenses() || [])
      .filter(e => e && e.companyId === companyId)
      .map(e => ({ ...e, type: 'expense', label: '支出' }));
    
    return [...incs, ...exps]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);
  }, [companyId, triggerRefresh]);

  // Percent changes for metrics
  const revChange = (prevMonthlyOperating?.totalRevenue || 0) > 0
    ? (((monthlyOperating?.totalRevenue || 0) - (prevMonthlyOperating?.totalRevenue || 0)) / (prevMonthlyOperating?.totalRevenue || 1)) * 100
    : 0;
  const expChange = (prevCashNetProfit?.totalExpenses || 0) > 0
    ? (((cashNetProfit?.totalExpenses || 0) - (prevCashNetProfit?.totalExpenses || 0)) / (prevCashNetProfit?.totalExpenses || 1)) * 100
    : 0;
  const profitChange = (prevCashNetProfit?.netProfit || 0) !== 0
    ? (((cashNetProfit?.netProfit || 0) - (prevCashNetProfit?.netProfit || 0)) / Math.abs(prevCashNetProfit?.netProfit || 1)) * 100
    : 0;

  // AI Insights generator
  const insights = useMemo(() => {
    const list = [];
    const margin = (pnl?.totalRevenue || 0) > 0 ? ((pnl?.netProfit || 0) / (pnl?.totalRevenue || 1)) * 100 : 0;
    
    if (margin > 25) {
      list.push({ type: 'success', text: `✨ 營運績效亮眼：本月淨利率達 ${margin.toFixed(1)}%，整體獲利能力良好。` });
    } else if (margin < 5 && (pnl?.totalRevenue || 0) > 0) {
      list.push({ type: 'warning', text: `⚠️ 獲利警訊：本月淨利率僅 ${margin.toFixed(1)}%，請檢視固定成本與管銷費用。` });
    }

    const fuelExp = (currentMonthExpenses || []).filter(e => e && e.accountCode === '6104').reduce((sum, e) => sum + (e.amount || 0), 0);
    const prevFuelExp = (getExpenses() || [])
      .filter(e => e && e.companyId === companyId && e.status === 'approved' && e.accountCode === '6104' && e.date && typeof e.date === 'string' && e.date.startsWith(prevPeriodVal))
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    if (fuelExp > prevFuelExp * 1.15 && prevFuelExp > 0) {
      const fuelIncrease = ((fuelExp - prevFuelExp) / prevFuelExp) * 100;
      list.push({ type: 'warning', text: `🚗 費用警告：本月「車輛油資」達 $${fuelExp.toLocaleString()}，較上月增加 ${fuelIncrease.toFixed(1)}%。建議確認送貨路線是否重疊或車輛耗油異常。` });
    }

    if (list.length === 0) {
      list.push({ type: 'info', text: '💡 本月目前無特殊異常金流。資產負債表處於平衡狀態。' });
    }
    return list;
  }, [pnl, currentMonthExpenses, companyId, prevPeriodVal]);

  const accountsMap = useMemo(() => {
    const map = {};
    (getChartOfAccounts() || []).forEach(a => { if (a && a.code) map[a.code] = a.name; });
    return map;
  }, []);

  const getAccountName = (code) => accountsMap[code] || code || '其他';
  const getBankName = (id) => (getBanks() || []).find(b => b && b.id === id)?.name || id || '現金/未指定';

  const ledgerCategoryData = useMemo(() => {
    void triggerRefresh;
    const accounts = getChartOfAccounts() || [];
    const incomeSources = (getIncomes() || []).filter(item => item?.companyId === companyId);
    const expenseSources = (getExpenses() || []).filter(item => item?.companyId === companyId);
    return {
      revenue: groupLedgerEntriesByCategory({
        entries: monthlyOperating?.entries || [],
        accounts,
        sourceRecords: incomeSources
      }),
      expenses: groupLedgerEntriesByCategory({
        entries: cashNetProfit?.expenses?.entries || [],
        accounts,
        sourceRecords: expenseSources
      })
    };
  }, [cashNetProfit, monthlyOperating, companyId, triggerRefresh]);

  const visibleRevenueEntries = selectedDetailCategory
    ? entriesForCategory(ledgerCategoryData.revenue, selectedDetailCategory)
    : monthlyOperating?.entries || [];
  const visibleExpenseEntries = selectedDetailCategory
    ? entriesForCategory(ledgerCategoryData.expenses, selectedDetailCategory)
    : cashNetProfit?.expenses?.entries || [];

  const operatingPieItems = [
    { label: '銷售收入（含應收）', amount: pnl?.totalRevenue || 0, color: '#05b2a5' },
    { label: '營業成本', amount: pnl?.totalCogs || 0, color: '#ef4444' },
    { label: '營業費用', amount: pnl?.totalExpenses || 0, color: '#f59e0b' }
  ];

  return (
    <div>
      {/* Petty Cash Threshold Warning */}
      {pettyCashBalance < 2000 && (
        <div className="alert-box warning" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px' }}>
          ⚠️ <strong>營運警訊：</strong> 店內零用金 (現金) 餘額過低！目前水位僅為 <strong>${pettyCashBalance.toLocaleString()} 元</strong>，低於安全限額 $2,000 元，請管理員儘速提現撥補！
        </div>
      )}

      {/* Pending Checks Alert */}
      {checkAlerts.length > 0 && (
        <div className="alert-box warning" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '800', color: 'var(--accent-gold)', fontSize: '1rem', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⏰ 票據兌現到期提醒 (待處理支票)：
            </div>
            {onNavigate && (
              <button 
                onClick={handleNavigateToChecks}
                className="btn btn-secondary btn-sm"
                style={{ 
                  padding: '4px 10px', 
                  fontSize: '0.78rem', 
                  borderRadius: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  color: 'var(--accent-gold)'
                }}
              >
                🔍 前往票據管理兌現 ➔
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            {checkAlerts.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed rgba(245, 158, 11, 0.15)', paddingBottom: '4px' }}>
                <span>
                  📌 <strong>{c.label}</strong> (票號: {c.checkNo || '無'}) | 對象: {c.counterpartyName || '未記'} | 到期日: {c.checkDueDate} 
                  {c.daysLeft < 0 ? (
                    <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', marginLeft: '6px' }}>[已逾期 {Math.abs(c.daysLeft)} 天]</span>
                  ) : c.daysLeft === 0 ? (
                    <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', marginLeft: '6px' }}>[今天到期]</span>
                  ) : (
                    <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold', marginLeft: '6px' }}>[剩餘 {c.daysLeft} 天兌現]</span>
                  )}
                </span>
                <span style={{ fontWeight: '700' }}>${(c.amount || 0).toLocaleString()} 元</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Row - Interactive Metric Cards */}
      <div className="metrics-grid">
        {/* Card 1: 當月總營業額 */}
        <div
          className="metric-card accent-green"
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('revenue')}
          title="點擊查看當月發生的營業額，已收與未收都列入"
        >
          <div className="metric-card-header">
            <span className="metric-label">當月總營業額（發生制）</span>
            <div className="metric-icon-wrapper green">📈</div>
          </div>
          <span className="metric-value">${(monthlyOperating?.totalRevenue || 0).toLocaleString()}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`metric-change ${revChange >= 0 ? 'up' : 'down'}`}>
              {revChange >= 0 ? '↑' : '↓'} {Math.abs(revChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700 }}>🔍 點擊查看明細 ➔</span>
          </div>
        </div>

        {/* Card 2: 實收營業額（歸屬原發生月份） */}
        <div
          className="metric-card accent-blue"
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('revenue')}
          title="包含此月份營業收入中已收回的款項；跨月還款仍歸回原欠款月份"
        >
          <div className="metric-card-header">
            <span className="metric-label">實收營業額</span>
            <div className="metric-icon-wrapper blue">💳</div>
          </div>
          <span className="metric-value">${(monthlyOperating?.actualRevenue || 0).toLocaleString()}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-change neutral">未收 ${(monthlyOperating?.outstandingReceivables || 0).toLocaleString()}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700 }}>依原月份歸屬</span>
          </div>
        </div>

        {/* Card 3: 應收帳款 */}
        <div 
          className="metric-card accent-red" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('receivables')}
          title="點擊查看月結與現結欠款明細"
        >
          <div className="metric-card-header">
            <span className="metric-label">{periodVal} 應收帳款</span>
            <div className="metric-icon-wrapper red">💵</div>
          </div>
          <span className="metric-value">${(receivablesTotal || 0).toLocaleString()}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-change neutral">月結 ${(monthlyReceivablesTotal || 0).toLocaleString()} · 欠款 ${(currentDebtTotal || 0).toLocaleString()}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-red)', fontWeight: 700 }}>🔍 點擊查看明細 ➔</span>
          </div>
        </div>

        {/* Card 4: 當月已付成本 */}
        <div 
          className="metric-card accent-red" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('expenses')}
          title="點擊查看當月支出與進貨成本明細"
        >
          <div className="metric-card-header">
            <span className="metric-label">當月已付成本</span>
            <div className="metric-icon-wrapper red">📉</div>
          </div>
          <span className="metric-value">${(cashNetProfit?.totalExpenses || 0).toLocaleString()}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`metric-change ${expChange <= 0 ? 'up' : 'down'}`}>
              {expChange >= 0 ? '↑' : '↓'} {Math.abs(expChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-red)', fontWeight: 700 }}>🔍 點擊查看明細 ➔</span>
          </div>
        </div>

        {/* Card 5: 本月現金結餘 */}
        <div 
          className="metric-card accent-gold" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('profit')}
          title="點擊查看本月損益結構拆解"
        >
          <div className="metric-card-header">
            <span className="metric-label">本月現金結餘</span>
            <div className="metric-icon-wrapper gold">💰</div>
          </div>
          <span className={`metric-value ${(cashNetProfit?.netProfit || 0) < 0 ? 'text-danger' : ''}`}>
            ${(cashNetProfit?.netProfit || 0).toLocaleString()}
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`metric-change ${profitChange >= 0 ? 'up' : 'down'}`}>
              {profitChange >= 0 ? '↑' : '↓'} {Math.abs(profitChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-gold)', fontWeight: 700 }}>🔍 點擊查看結構 ➔</span>
          </div>
        </div>

        {/* Card 5: 可用現金餘額 (暫不顯示) */}

        {/* Card 6: 本月瓦斯銷售公斤 */}
        <div 
          className="metric-card accent-green" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('gasKg')}
          title="點擊查看瓦斯銷貨公斤數與成本分析"
        >
          <div className="metric-card-header">
            <span className="metric-label">本月瓦斯銷售公斤</span>
            <div className="metric-icon-wrapper green">🛢️</div>
          </div>
          <span className="metric-value">{(gasProfit?.totalKg || 0).toLocaleString()} kg</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-change neutral">平均成本 ${(gasInventory?.averageCostPerKg || 0).toFixed(2)} / kg</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700 }}>🔍 點擊查看分析 ➔</span>
          </div>
        </div>

        {/* Card 7: 本月瓦斯毛利 */}
        <div 
          className="metric-card accent-gold" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('gasProfit')}
          title="點擊查看瓦斯銷貨毛利詳細計算"
        >
          <div className="metric-card-header">
            <span className="metric-label">本月瓦斯毛利</span>
            <div className="metric-icon-wrapper gold">📊</div>
          </div>
          <span className={`metric-value ${(gasProfit?.grossProfit || 0) < 0 ? 'text-danger' : ''}`}>${(gasProfit?.grossProfit || 0).toLocaleString()}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-change neutral">毛利率 {(gasProfit?.grossMargin || 0).toFixed(1)}%</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-gold)', fontWeight: 700 }}>🔍 點擊查看細節 ➔</span>
          </div>
        </div>

        {/* Card 8: 期末瓦斯庫存 */}
        <div 
          className="metric-card accent-blue" 
          style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
          onClick={() => openDetailModal('gasStock')}
          title="點擊查看期末鋼瓶與瓦斯庫存分佈"
        >
          <div className="metric-card-header">
            <span className="metric-label">期末瓦斯庫存</span>
            <div className="metric-icon-wrapper blue">📦</div>
          </div>
          <span className="metric-value">{(gasInventory?.endingKg || 0).toLocaleString()} kg</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-change neutral">${(gasInventory?.endingCost || 0).toLocaleString()} 存貨金額</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 700 }}>🔍 點擊查看分佈 ➔</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Charts & Shareholder Split */}
      <div className="grid-2col">
        {/* Left Column: Visual Trends & AI Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <TrendChart companyId={companyId} year={year} month={month} triggerRefresh={triggerRefresh} />

          {/* Budget Execution Card */}
          {(budgetProgressItems || []).length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">📊 當月主要支出科目預算執行率</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(budgetProgressItems || []).map(item => {
                  const isOver = item.percentage > 100;
                  const barColor = item.percentage <= 80 
                    ? 'var(--accent-blue)' 
                    : item.percentage <= 100 
                    ? 'var(--accent-gold)' 
                    : 'var(--accent-red)';
                    
                  return (
                    <div key={item.code} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                        <span style={{ fontWeight: '600' }}>{item.name} ({item.code})</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>
                          ${(item.actual || 0).toLocaleString()} / ${(item.budget || 0).toLocaleString()} 
                          <strong style={{ marginLeft: '8px', color: isOver ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                            ({(item.percentage || 0).toFixed(1)}%)
                          </strong>
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(item.percentage || 0, 100)}%`, height: '100%', backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intelligent Insights Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🤖 營運智慧診斷與警訊提醒</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(insights || []).map((item, idx) => (
                <div key={idx} className={`alert-box ${item.type}`} style={{ fontSize: '0.9rem', padding: '12px 16px', borderRadius: '10px' }}>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Operating Structure Pie Chart & Dividends */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <PieChart items={operatingPieItems} title={`月度經營收支結構 (${periodVal})`} />

          {/* Shareholder Dividend Split (Admin / Shareholder only) */}
          {showShareholderReports && dividendData && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title">👑 當月預估股東分紅與留存公積金</span>
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigate && onNavigate('shareholderZone')}>
                  查看股東專區 ➔
                </button>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>法定/特別公積金 (10%)</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                      ${(dividendData.reserveAmount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ padding: '12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>可分配股東紅利總額</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      ${(dividendData.distributableAmount ?? dividendData.totalDividends ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px' }}>各股東分紅試算表：</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>股東姓名</th>
                        <th>持股比例</th>
                        <th>本月可分得紅利</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dividendData.shareholders || dividendData.shareholderDividends || []).map(s => {
                        const ratioVal = s.ratio !== undefined ? s.ratio : ((s.shareRatio || 0) * 100);
                        const divVal = s.dividend !== undefined ? s.dividend : (s.dividendAmount || 0);
                        return (
                          <tr key={s.id || s.shareholderId}>
                            <td style={{ fontWeight: '600' }}>{s.name}</td>
                            <td>{Number(ratioVal || 0).toFixed(1)}%</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-blue)' }}>
                              ${Number(divVal || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                      {(dividendData.shareholders || dividendData.shareholderDividends || []).length === 0 && (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>尚未設定股東資料</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity Stream */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📝 歷史最近流水帳</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>類別</th>
                      <th>金額</th>
                      <th>狀態</th>
                      <th>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentTransactions || []).map((tx, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{tx.date}</td>
                        <td>
                          <span style={{ color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: '600' }}>
                            {tx.label}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          ${(tx.amount || 0).toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge ${tx.status}`}>
                            {tx.status === 'approved' ? '已確認' : tx.status === 'pending' ? '待對帳' : tx.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.remarks}>
                          {tx.remarks}
                        </td>
                      </tr>
                    ))}
                    {(recentTransactions || []).length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>本月暫無收支紀錄</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DETAILED INTERACTIVE BREAKDOWN MODALS FOR ALL 8 METRIC CARDS */}
      {/* ========================================================================= */}
      {activeDetailModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }} onClick={() => setActiveDetailModal(null)}>
          <div 
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '2px solid rgba(5, 178, 165, 0.25)',
              padding: '28px',
              position: 'relative'
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid rgba(5, 178, 165, 0.15)', paddingBottom: '16px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeDetailModal === 'revenue' && '📈 當月營業額與實收明細'}
                {activeDetailModal === 'receivables' && '💵 應收帳款與收款狀態'}
                {activeDetailModal === 'expenses' && '📉 當月已付成本明細'}
                {activeDetailModal === 'profit' && '💰 本月現金結餘（現金基礎）'}
                {activeDetailModal === 'cash' && '🏦 資金與銀行帳戶/零用金水位'}
                {activeDetailModal === 'gasKg' && '🛢️ 本月瓦斯銷售公斤與進貨成本'}
                {activeDetailModal === 'gasProfit' && '📊 本月瓦斯銷貨毛利詳細分析'}
                {activeDetailModal === 'gasStock' && '📦 期末瓦斯庫存與全區鋼瓶分佈'}
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue)', backgroundColor: 'rgba(5, 178, 165, 0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                  {periodVal}
                </span>
              </div>
              <button 
                onClick={() => setActiveDetailModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content Switcher */}
            {activeDetailModal === 'revenue' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>當月總營業額（發生制）</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      ${(monthlyOperating?.totalRevenue || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-green)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>實收營業額（歸屬原月份）</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      ${(monthlyOperating?.actualRevenue || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-gold)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{periodVal} 尚未收回</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                      ${(receivablesTotal || 0).toLocaleString()} 元
                    </div>
                  </div>
                </div>

                <LedgerCategoryBreakdown
                  groups={ledgerCategoryData.revenue}
                  selectedKey={selectedDetailCategory}
                  onSelect={setSelectedDetailCategory}
                  tone="revenue"
                />

                <div style={{ fontWeight: '700', marginBottom: '10px' }}>
                  {selectedDetailCategory
                    ? `${ledgerCategoryData.revenue.find(group => group.key === selectedDetailCategory)?.label || ''}明細：`
                    : '當月全部實收入帳明細：'}
                </div>
                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>傳票編號</th>
                        <th>客戶/項目</th>
                        <th>會計科目</th>
                        <th>金額</th>
                        <th>付款方式</th>
                        <th>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRevenueEntries.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{item.recognitionDate || item.date}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.id}</td>
                          <td style={{ fontWeight: '600' }}>{item.recognitionType === 'receivable_settlement' ? '應收款入帳' : item.customerName || item.counterpartyName || '一般營業'}</td>
                          <td>{item.recognitionType === 'receivable_settlement' ? '收回應收款' : getAccountName(item.accountCode)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-blue)' }}>
                            ${(item.amount || 0).toLocaleString()}
                          </td>
                          <td>{item.paymentMethod === 'cash' ? '現金 (零用金)' : item.bankId ? getBankName(item.bankId) : '銀行轉帳'}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.remarks || '-'}</td>
                        </tr>
                      ))}
                      {visibleRevenueEntries.length === 0 && (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>
                            本月尚無實際入帳的營業收入
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeDetailModal === 'receivables' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-red)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>目前尚未收回合計</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                      ${(receivablesTotal || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-gold)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>月結尚未收款</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      ${(receivablesSummary?.monthly?.outstandingAmount || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>現結欠款尚未收款</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      ${(receivablesSummary?.currentDebt?.outstandingAmount || 0).toLocaleString()} 元
                    </div>
                  </div>
                </div>

                {(receivablesSummary?.unmatchedSettlementAmount || 0) > 0 && (
                  <div style={{ marginBottom: '14px', padding: '10px 12px', border: '1px solid rgba(245, 158, 11, 0.35)', background: 'rgba(245, 158, 11, 0.08)', color: 'var(--accent-gold)', borderRadius: '6px', fontSize: '0.85rem' }}>
                    待核對收款：${Number(receivablesSummary.unmatchedSettlementAmount).toLocaleString()}。舊收款超過可沖抵欠款，系統未將差額列為營業收入。
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '700' }}>尚未收款明細（最舊欠款優先沖抵）</div>
                  <button className="btn btn-primary btn-sm" onClick={() => { setActiveDetailModal(null); if (onNavigate) onNavigate('inputs'); }}>
                    前往日常金流入帳
                  </button>
                </div>
                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>發生日期</th>
                        <th>客戶</th>
                        <th>欠款類型</th>
                        <th>原始金額</th>
                        <th>已收金額</th>
                        <th>尚未收款</th>
                        <th>狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(receivablesSummary?.rows || []).map(item => {
                        const customer = customerDetails.get(item.customerId);
                        const customerName = item.customerName || customer?.name || customer?.shortName || '未標示客戶';
                        const typeLabel = item.receivableType === 'monthly' ? '月結應收' : item.receivableType === 'current_debt' ? '現結欠款' : '其他應收';
                        return (
                        <tr
                          key={item.id}
                          data-detail-title={`${customerName}｜${typeLabel}`}
                          data-detail-json={JSON.stringify({
                            '客戶編號': item.customerId || '—',
                            '聯絡電話': customer?.phone || item.phone || '—',
                            '客戶地址': customer?.address || item.address || '—',
                            '原始紀錄編號': item.id || '—',
                            '原始發生日期': item.date || '—',
                            '到期日': item.dueDate || '—',
                            '備註': item.remarks || '—',
                            '資料來源': item.syncSource === 'shenglong' ? '舊系統同步' : '新系統建立'
                          })}
                        >
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{item.date || '-'}</td>
                          <td style={{ fontWeight: '600' }}>{customerName}</td>
                          <td style={{ fontWeight: '600' }}>{typeLabel}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>${Number(item.originalAmount || 0).toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>${Number(item.settledAmount || 0).toLocaleString()}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-red)' }}>${Number(item.outstandingAmount || 0).toLocaleString()}</td>
                          <td>
                            <span className="badge void">{item.settledAmount > 0 ? '部分收款' : '尚未收款'}</span>
                          </td>
                        </tr>
                        );
                      })}
                      {(receivablesSummary?.rows || []).length === 0 && (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>
                            目前沒有尚未收款的應收帳款。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeDetailModal === 'expenses' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-red)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>當月已付成本與費用</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                      ${(cashNetProfit?.totalExpenses || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-gold)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>直接付款</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      ${(cashNetProfit?.expenses?.directExpenseAmount || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>本月結清舊應付款</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      ${(cashNetProfit?.expenses?.settlementAmount || 0).toLocaleString()} 元
                    </div>
                  </div>
                </div>

                <LedgerCategoryBreakdown
                  groups={ledgerCategoryData.expenses}
                  selectedKey={selectedDetailCategory}
                  onSelect={setSelectedDetailCategory}
                  tone="expense"
                />

                <div style={{ fontWeight: '700', marginBottom: '10px' }}>
                  {selectedDetailCategory
                    ? `${ledgerCategoryData.expenses.find(group => group.key === selectedDetailCategory)?.label || ''}明細：`
                    : '當月全部實際付款明細：'}
                </div>
                <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>傳票編號</th>
                        <th>廠商/受款人</th>
                        <th>會計科目</th>
                        <th>金額</th>
                        <th>付款方式</th>
                        <th>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenseEntries.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{item.recognitionDate || item.date}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.id}</td>
                          <td style={{ fontWeight: '600' }}>{item.supplierName || item.counterpartyName || item.remarks?.split(' ')[0] || '營業支出'}</td>
                          <td>{item.recognitionType === 'payable_settlement' ? '應付款結清' : getAccountName(item.accountCode)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-red)' }}>
                            ${(item.amount || 0).toLocaleString()}
                          </td>
                          <td>{item.paymentMethod === 'cash' ? '現金 (零用金)' : item.bankId ? getBankName(item.bankId) : '銀行轉帳'}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.remarks || '-'}</td>
                        </tr>
                      ))}
                      {visibleExpenseEntries.length === 0 && (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>
                            本月尚無實際付款紀錄
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeDetailModal === 'profit' && (
              <div>
                <div style={{ padding: '20px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(5, 178, 165, 0.2)' }}>
                  <div style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '16px', color: 'var(--accent-blue)' }}>
                    📊 {periodVal} 現金淨利計算：
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.95rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>➕ 本月實收金額</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>${(cashNetProfit?.totalRevenue || 0).toLocaleString()} 元</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>➖ 本月已付成本與費用</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>-${(cashNetProfit?.totalExpenses || 0).toLocaleString()} 元</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--accent-blue)', paddingTop: '10px', fontSize: '1.1rem', fontWeight: '800' }}>
                      <span>💰 本月現金結餘 [結餘率 {((cashNetProfit?.totalRevenue || 0) > 0 ? ((cashNetProfit?.netProfit || 0) / cashNetProfit.totalRevenue * 100) : 0).toFixed(1)}%]</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: (cashNetProfit?.netProfit || 0) >= 0 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
                        ${(cashNetProfit?.netProfit || 0).toLocaleString()} 元
                      </strong>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      未收應收帳款與尚未付款的應付款不列入；正式會計損益請以報表中心為準。
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'rgba(5, 178, 165, 0.05)', borderRadius: '12px', border: '1px solid rgba(5, 178, 165, 0.15)' }}>
                    <div style={{ fontWeight: '700', marginBottom: '10px', color: 'var(--accent-blue)' }}>前三大收入來源：</div>
                    {topCashIncomeSources.length > 0 ? (
                      topCashIncomeSources.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '6px' }}>
                          <span>{i + 1}. {item.label}</span>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>${(item.amount || 0).toLocaleString()}</strong>
                        </div>
                      ))
                    ) : <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>尚無收入資料</div>}
                  </div>

                  <div style={{ padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                    <div style={{ fontWeight: '700', marginBottom: '10px', color: 'var(--accent-red)' }}>前三大費用支出：</div>
                    {topCashExpenseSources.length > 0 ? (
                      topCashExpenseSources.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '6px' }}>
                          <span>{i + 1}. {item.label}</span>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>${(item.amount || 0).toLocaleString()}</strong>
                        </div>
                      ))
                    ) : <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>尚無支出資料</div>}
                  </div>
                </div>
              </div>
            )}

            {activeDetailModal === 'cash' && (
              <div>
                <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', marginBottom: '20px', borderLeft: '4px solid var(--accent-blue)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>截至月底全公司總資金水位 (現金 + 銀行存款)</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                    ${(cashBalance || 0).toLocaleString()} 元
                  </div>
                </div>

                <div style={{ fontWeight: '700', marginBottom: '10px' }}>各資金與銀行帳戶水位列表：</div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>帳戶種類 / 名稱</th>
                        <th>帳號/編號</th>
                        <th>初始餘額</th>
                        <th>當前可用餘額</th>
                        <th>狀態提醒</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bankBalancesList || []).map(b => {
                        const isPetty = b.id === 'BANK_PETTY' || b.bankId === 'BANK_PETTY';
                        const isLowPetty = isPetty && (b.currentBalance || 0) < 2000;
                        return (
                          <tr key={b.id} style={{ backgroundColor: isPetty ? 'rgba(245, 158, 11, 0.05)' : 'transparent' }}>
                            <td style={{ fontWeight: '700' }}>
                              {isPetty ? '💵 店內零用金 (現金)' : `🏦 ${b.name}`}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{b.accountNo || '-'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>${(b.initialBalance || 0).toLocaleString()}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '800', fontSize: '1.05rem', color: isLowPetty ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
                              ${(b.currentBalance || 0).toLocaleString()} 元
                            </td>
                            <td>
                              {isLowPetty ? (
                                <span className="badge void">⚠️ 餘額低於安全限額 ($2,000)！請撥補</span>
                              ) : (
                                <span className="badge approved">水位正常</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeDetailModal === 'gasKg' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>本月總銷售公斤數</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      {(gasProfit?.totalKg || 0).toLocaleString()} kg
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-gold)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>平均售價 $/kg</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                      ${(gasProfit?.totalKg || 0) > 0 ? ((gasProfit?.totalRevenue || 0) / gasProfit.totalKg).toFixed(2) : '0.00'} / kg
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-red)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>平均進貨成本 $/kg</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                      ${(gasInventory?.averageCostPerKg || 0).toFixed(2)} / kg
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', backgroundColor: 'rgba(5, 178, 165, 0.05)', borderRadius: '12px', border: '1px solid rgba(5, 178, 165, 0.2)' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--accent-blue)', marginBottom: '8px' }}>
                    🛢️ 瓦斯進銷存數量評估公式：
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>• <strong>期初庫存公斤數</strong>：{(gasInventory?.beginningKg || 0).toLocaleString()} kg</div>
                    <div>• <strong>本月進貨總公斤數</strong>：{(gasInventory?.purchasedKg || 0).toLocaleString()} kg</div>
                    <div>• <strong>本月銷售公斤數</strong>：{(gasProfit?.totalKg || 0).toLocaleString()} kg</div>
                    <div>• <strong>期末庫存公斤數</strong>：{(gasInventory?.endingKg || 0).toLocaleString()} kg</div>
                  </div>
                </div>
              </div>
            )}

            {activeDetailModal === 'gasProfit' && (
              <div>
                <div style={{ padding: '20px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '16px', marginBottom: '20px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '16px', color: 'var(--accent-gold)' }}>
                    📊 本月瓦斯銷貨毛利詳細計算：
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.95rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>➕ 瓦斯銷貨總收入</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>${(gasProfit?.totalRevenue || 0).toLocaleString()} 元</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>➖ 瓦斯銷貨總成本 ({(gasProfit?.totalKg || 0).toLocaleString()} kg × ${(gasInventory?.averageCostPerKg || 0).toFixed(2)})</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>-${(gasProfit?.totalCogs || 0).toLocaleString()} 元</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--accent-gold)', paddingTop: '10px', fontSize: '1.1rem', fontWeight: '800' }}>
                      <span>💰 瓦斯銷貨毛利金額 (Gross Profit)</span>
                      <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>${(gasProfit?.grossProfit || 0).toLocaleString()} 元</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'rgba(5, 178, 165, 0.05)', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>瓦斯銷貨毛利率</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      {(gasProfit?.grossMargin || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'rgba(245, 158, 11, 0.05)', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>平均每 kg 毛利獲利</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                      ${(gasProfit?.totalKg || 0) > 0 ? ((gasProfit?.grossProfit || 0) / gasProfit.totalKg).toFixed(2) : '0.00'} / kg
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDetailModal === 'gasStock' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>期末瓦斯總存貨</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                      {(gasInventory?.endingKg || 0).toLocaleString()} kg
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-gold)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>存貨評估總金額</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                      ${(gasInventory?.endingCost || 0).toLocaleString()} 元
                    </div>
                  </div>
                  <div style={{ padding: '16px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '12px', borderLeft: '4px solid var(--accent-green)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>平均庫存成本 $/kg</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                      ${(gasInventory?.averageCostPerKg || 0).toFixed(2)} / kg
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', backgroundColor: 'rgba(5, 178, 165, 0.05)', borderRadius: '12px', border: '1px solid rgba(5, 178, 165, 0.2)' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--accent-blue)', marginBottom: '8px' }}>
                    📦 庫存管理提示：
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    如需查看鋼瓶在門市、車輛、客戶端與氣廠的詳細流向動態，請點擊左側選單 **【🍼 鋼瓶狀態】** 模組，進行即時鋼瓶定位與盤點。
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ marginTop: '24px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setActiveDetailModal(null)}>
                關閉視窗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
