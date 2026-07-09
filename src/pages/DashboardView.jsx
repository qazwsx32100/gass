import React, { useMemo } from 'react';
import { getIncomeStatement, getBankBalancesAtDate, getDividendsForMonth, getPeriodEndDate, getGasGrossProfitForPeriod, getGasInventoryForMonth } from '../utils/financials';
import { getIncomes, getExpenses, getBudgets, getSystemConfig, getBanks, getChartOfAccounts } from '../db/storage';
import { canViewShareholderReports } from '../utils/permissions';
import PieChart from '../components/PieChart';
import TrendChart from '../components/TrendChart';

export default function DashboardView({ companyId, year, month, triggerRefresh, userRole, onNavigate }) {
  const periodVal = `${year}-${month}`;
  const showShareholderReports = canViewShareholderReports(userRole);
  
  const handleNavigateToChecks = () => {
    sessionStorage.setItem('inputsActiveSubTab', 'checks');
    if (onNavigate) {
      onNavigate('inputs');
    }
  };
  
  // Calculate P&L for current month
  const pnl = useMemo(() => {
    return getIncomeStatement(companyId, 'month', periodVal);
  }, [companyId, periodVal, triggerRefresh]);

  const gasProfit = useMemo(() => {
    return getGasGrossProfitForPeriod(companyId, 'month', periodVal);
  }, [companyId, periodVal, triggerRefresh]);

  const gasInventory = useMemo(() => {
    return getGasInventoryForMonth(companyId, periodVal);
  }, [companyId, periodVal, triggerRefresh]);

  // Calculate P&L for previous month for comparison
  const prevPeriodVal = useMemo(() => {
    const mNum = parseInt(month, 10);
    if (mNum === 1) {
      return `${year - 1}-12`;
    }
    return `${year}-${String(mNum - 1).padStart(2, '0')}`;
  }, [year, month]);

  const prevPnl = useMemo(() => {
    return getIncomeStatement(companyId, 'month', prevPeriodVal);
  }, [companyId, prevPeriodVal, triggerRefresh]);

  // Cash / Bank balance at the end of the month
  const cashBalance = useMemo(() => {
    const lastDayStr = getPeriodEndDate('month', periodVal);
    const balances = getBankBalancesAtDate(companyId, lastDayStr);
    return balances.reduce((sum, b) => sum + b.currentBalance, 0);
  }, [companyId, periodVal, triggerRefresh]);

  // Dividends for the month
  const dividendData = useMemo(() => {
    return getDividendsForMonth(companyId, periodVal, 0.1); // 10% reserve ratio
  }, [companyId, periodVal, triggerRefresh]);

  // Cash / Bank balance of Petty Cash at the end of the month
  const pettyCashBalance = useMemo(() => {
    const lastDayStr = getPeriodEndDate('month', periodVal);
    const balances = getBankBalancesAtDate(companyId, lastDayStr);
    const petty = balances.find(b => b.bankId === 'BANK_PETTY');
    return petty ? petty.currentBalance : 0;
  }, [companyId, periodVal, triggerRefresh]);

  // Budgets & Actual Expenditures
  const budgetProgressItems = useMemo(() => {
    const allBudgets = getBudgets().filter(b => b.companyId === companyId && b.year === year && b.month === month);
    const accounts = getChartOfAccounts();
    const expensesList = getExpenses().filter(e => e.companyId === companyId && e.status === 'approved' && e.date.startsWith(periodVal));
    
    return allBudgets.map(b => {
      const account = accounts.find(a => a.code === b.accountCode);
      const accName = account ? account.name : b.accountCode;
      const actualSum = expensesList.filter(e => e.accountCode === b.accountCode).reduce((sum, e) => sum + e.amount, 0);
      const pct = b.budgetAmount > 0 ? (actualSum / b.budgetAmount) * 100 : 0;
      return {
        code: b.accountCode,
        name: accName,
        budget: b.budgetAmount,
        actual: actualSum,
        percentage: pct
      };
    });
  }, [companyId, year, month, periodVal, triggerRefresh]);

  // Pending Checks Alerts
  const checkAlerts = useMemo(() => {
    const config = getSystemConfig();
    if (!config.enableCheckMaturityAlert) return [];
    
    const incomes = getIncomes().filter(i => i.companyId === companyId && i.paymentMethod === 'check' && i.paymentStatus === 'unpaid' && i.status === 'approved');
    const expenses = getExpenses().filter(e => e.companyId === companyId && e.paymentMethod === 'check' && e.paymentStatus === 'unpaid' && e.status === 'approved');
    
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
    const incs = getIncomes()
      .filter(i => i.companyId === companyId)
      .map(i => ({ ...i, type: 'income', label: '收入' }));
    const exps = getExpenses()
      .filter(e => e.companyId === companyId)
      .map(e => ({ ...e, type: 'expense', label: '支出' }));
    
    return [...incs, ...exps]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [companyId, triggerRefresh]);

  // Percent changes for metrics
  const revChange = prevPnl.totalRevenue > 0 
    ? ((pnl.totalRevenue - prevPnl.totalRevenue) / prevPnl.totalRevenue) * 100 
    : 0;
  const expChange = prevPnl.totalExpenses + prevPnl.totalCogs > 0
    ? (((pnl.totalExpenses + pnl.totalCogs) - (prevPnl.totalExpenses + prevPnl.totalCogs)) / (prevPnl.totalExpenses + prevPnl.totalCogs)) * 100
    : 0;
  const profitChange = prevPnl.netProfit !== 0
    ? ((pnl.netProfit - prevPnl.netProfit) / Math.abs(prevPnl.netProfit)) * 100
    : 0;

  // AI Insights generator
  const insights = useMemo(() => {
    const list = [];
    
    // Profit margin check
    const margin = pnl.totalRevenue > 0 ? (pnl.netProfit / pnl.totalRevenue) * 100 : 0;
    if (margin > 30) {
      list.push({ type: 'success', text: `✨ 營收表現極佳！本月淨利率達 ${margin.toFixed(1)}%，高於行業平均水準。` });
    } else if (margin > 10) {
      list.push({ type: 'info', text: `💡 營運狀況平穩。本月淨利率為 ${margin.toFixed(1)}%，獲利正常。` });
    } else if (margin > 0) {
      list.push({ type: 'warning', text: `⚠️ 警訊：利潤率偏低（${margin.toFixed(1)}%），請檢視各項營業成本是否能進一步優化。` });
    } else if (pnl.totalRevenue > 0) {
      list.push({ type: 'error', text: `🚨 虧損警告：本月處於淨虧損狀態，淨利潤為 $${pnl.netProfit.toLocaleString()}。依股東協議，本月將不分配任何紅利。` });
    }

    // Expense check
    const totalOut = pnl.totalExpenses + pnl.totalCogs;
    if (totalOut > pnl.totalRevenue && pnl.totalRevenue > 0) {
      list.push({ type: 'error', text: `🚨 支出大於收入！本月總流出為 $${totalOut.toLocaleString()}，大於總流入。請注意資金流動性。` });
    }

    // Individual category checks (e.g. check salary or vehicle expenses)
    const fuelExp = pnl.expenseItems.find(i => i.code === '6103')?.amount || 0;
    const prevFuelExp = prevPnl.expenseItems.find(i => i.code === '6103')?.amount || 0;
    if (fuelExp > prevFuelExp * 1.15 && prevFuelExp > 0) {
      const fuelIncrease = ((fuelExp - prevFuelExp) / prevFuelExp) * 100;
      list.push({ type: 'warning', text: `🚗 費用警告：本月「車輛油資」達 $${fuelExp.toLocaleString()}，較上月增加 ${fuelIncrease.toFixed(1)}%。建議確認送貨路線是否重疊或車輛耗油異常。` });
    }

    if (list.length === 0) {
      list.push({ type: 'info', text: '💡 本月目前無特殊異常金流。資產負債表處於平衡狀態。' });
    }
    return list;
  }, [pnl, prevPnl]);

  // Max value for chart scaling
  const maxChartVal = Math.max(pnl.totalRevenue, pnl.totalCogs + pnl.totalExpenses, prevPnl.totalRevenue, prevPnl.totalExpenses + prevPnl.totalCogs, 10000);
  const operatingPieItems = [
    { label: '營業收入', amount: pnl.totalRevenue, color: '#05b2a5' },
    { label: '營業成本', amount: pnl.totalCogs, color: '#ef4444' },
    { label: '營業費用', amount: pnl.totalExpenses, color: '#f59e0b' }
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
                <span style={{ fontWeight: '700' }}>${c.amount.toLocaleString()} 元</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card accent-green">
          <div className="metric-card-header">
            <span className="metric-label">當月營業總額</span>
            <div className="metric-icon-wrapper green">📈</div>
          </div>
          <span className="metric-value">${pnl.totalRevenue.toLocaleString()}</span>
          <span className={`metric-change ${revChange >= 0 ? 'up' : 'down'}`}>
            {revChange >= 0 ? '↑' : '↓'} {Math.abs(revChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
          </span>
        </div>

        <div className="metric-card accent-red">
          <div className="metric-card-header">
            <span className="metric-label">當月支出總額</span>
            <div className="metric-icon-wrapper red">📉</div>
          </div>
          <span className="metric-value">${(pnl.totalExpenses + pnl.totalCogs).toLocaleString()}</span>
          <span className={`metric-change ${expChange <= 0 ? 'up' : 'down'}`}>
            {expChange >= 0 ? '↑' : '↓'} {Math.abs(expChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
          </span>
        </div>

        <div className="metric-card accent-gold">
          <div className="metric-card-header">
            <span className="metric-label">本月淨利潤</span>
            <div className="metric-icon-wrapper gold">💰</div>
          </div>
          <span className={`metric-value ${pnl.netProfit < 0 ? 'text-danger' : ''}`}>
            ${pnl.netProfit.toLocaleString()}
          </span>
          <span className={`metric-change ${profitChange >= 0 ? 'up' : 'down'}`}>
            {profitChange >= 0 ? '↑' : '↓'} {Math.abs(profitChange).toFixed(1)}% <span style={{color: 'var(--text-tertiary)'}}>較上月</span>
          </span>
        </div>

        <div className="metric-card accent-blue">
          <div className="metric-card-header">
            <span className="metric-label">可用現金餘額</span>
            <div className="metric-icon-wrapper blue">🏦</div>
          </div>
          <span className="metric-value">${cashBalance.toLocaleString()}</span>
          <span className="metric-change neutral">截至本月底</span>
        </div>

        <div className="metric-card accent-green">
          <div className="metric-card-header">
            <span className="metric-label">本月瓦斯銷售公斤</span>
            <div className="metric-icon-wrapper green">🛢️</div>
          </div>
          <span className="metric-value">{gasProfit.totalKg.toLocaleString()} kg</span>
          <span className="metric-change neutral">平均成本 ${gasInventory.averageCostPerKg.toFixed(2)} / kg</span>
        </div>

        <div className="metric-card accent-gold">
          <div className="metric-card-header">
            <span className="metric-label">本月瓦斯毛利</span>
            <div className="metric-icon-wrapper gold">📊</div>
          </div>
          <span className={`metric-value ${gasProfit.grossProfit < 0 ? 'text-danger' : ''}`}>${gasProfit.grossProfit.toLocaleString()}</span>
          <span className="metric-change neutral">毛利率 {gasProfit.grossMargin.toFixed(1)}%</span>
        </div>

        <div className="metric-card accent-blue">
          <div className="metric-card-header">
            <span className="metric-label">期末瓦斯庫存</span>
            <div className="metric-icon-wrapper blue">📦</div>
          </div>
          <span className="metric-value">{gasInventory.endingKg.toLocaleString()} kg</span>
          <span className="metric-change neutral">${gasInventory.endingCost.toLocaleString()} 存貨金額</span>
        </div>
      </div>

      {/* Main Grid: Charts & Shareholder Split */}
      <div className="grid-2col">
        {/* Left Column: Visual Trends & AI Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <TrendChart companyId={companyId} year={year} month={month} triggerRefresh={triggerRefresh} />

          {/* Budget Execution Card */}
          {budgetProgressItems.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">📊 當月主要支出科目預算執行率</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {budgetProgressItems.map(item => {
                  const isOver = item.percentage > 100;
                  const barColor = item.percentage <= 80 
                    ? 'var(--accent-green)' 
                    : item.percentage <= 100 
                      ? 'var(--accent-gold)' 
                      : 'var(--accent-red)';
                  
                  return (
                    <div key={item.code} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        <span>📁 {item.code} {item.name}</span>
                        <span style={{ color: isOver ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                          實際: ${item.actual.toLocaleString()} / 預算: ${item.budget.toLocaleString()} ({item.percentage.toFixed(1)}%)
                          {isOver && <span style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.1)', fontSize: '0.75rem' }}>⚠️ 預算超支</span>}
                        </span>
                      </div>
                      <div style={{ height: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            height: '100%', 
                            width: `${Math.min(item.percentage, 100)}%`, 
                            backgroundColor: barColor, 
                            borderRadius: '4px',
                            transition: 'width 0.5s ease-in-out'
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trend Chart Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 營收與支出對比趨勢</span>
            </div>
            <div className="card-body">
              <div className="bar-chart-container">
                <div className="bar-chart-row">
                  <span className="bar-chart-label">上月總營收</span>
                  <div className="bar-chart-wrapper">
                    <div className="bar-chart-fill green" style={{ width: `${(prevPnl.totalRevenue / maxChartVal) * 100}%` }}></div>
                  </div>
                  <span className="bar-chart-value">${prevPnl.totalRevenue.toLocaleString()}</span>
                </div>

                <div className="bar-chart-row">
                  <span className="bar-chart-label">上月總支出</span>
                  <div className="bar-chart-wrapper">
                    <div className="bar-chart-fill red" style={{ width: `${((prevPnl.totalCogs + prevPnl.totalExpenses) / maxChartVal) * 100}%` }}></div>
                  </div>
                  <span className="bar-chart-value">${(prevPnl.totalCogs + prevPnl.totalExpenses).toLocaleString()}</span>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

                <div className="bar-chart-row">
                  <span className="bar-chart-label">本月總營收</span>
                  <div className="bar-chart-wrapper">
                    <div className="bar-chart-fill green" style={{ width: `${(pnl.totalRevenue / maxChartVal) * 100}%` }}></div>
                  </div>
                  <span className="bar-chart-value">${pnl.totalRevenue.toLocaleString()}</span>
                </div>

                <div className="bar-chart-row">
                  <span className="bar-chart-label">本月總支出</span>
                  <div className="bar-chart-wrapper">
                    <div className="bar-chart-fill red" style={{ width: `${((pnl.totalCogs + pnl.totalExpenses) / maxChartVal) * 100}%` }}></div>
                  </div>
                  <span className="bar-chart-value">${(pnl.totalCogs + pnl.totalExpenses).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">🥧 本月營運結構圓餅圖</span>
            </div>
            <div className="card-body">
              <PieChart
                title="收入、成本、費用比例"
                items={operatingPieItems}
                emptyText="本月尚無收入或支出資料"
              />
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">🤖 AI 財務分析與預警</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {insights.map((ins, idx) => (
                <div key={idx} className={`alert-box ${ins.type}`}>
                  <div>{ins.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Shareholder Dividend & Recent Activities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {showShareholderReports && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">👑 本月股東預估分紅 ({year}年{parseInt(month, 10)}月)</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', fontWeight: '600' }}>
                  公積金提撥率: {dividendData.reserveRatio * 100}%
                </span>
              </div>
              <div className="card-body">
                {dividendData.isLoss ? (
                  <div className="alert-box error" style={{ margin: 0 }}>
                    本月處於虧損狀態，依股東會決議不發放分紅，虧損將留存於保留盈餘。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <span>淨利潤：${dividendData.netProfit.toLocaleString()}</span>
                      <span>提撥公積金：-${dividendData.reserveAmount.toLocaleString()}</span>
                      <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>可分紅總額：${dividendData.totalDividends.toLocaleString()}</span>
                    </div>

                    <div className="bar-chart-container" style={{ marginTop: 0 }}>
                      {dividendData.shareholderDividends.map((sh, idx) => (
                        <div key={idx} className="bar-chart-row">
                          <span className="bar-chart-label" style={{ fontWeight: '600' }}>
                            {sh.name} ({sh.ratio}%)
                          </span>
                          <div className="bar-chart-wrapper">
                            <div className="bar-chart-fill gold" style={{ width: `${sh.ratio}%` }}></div>
                          </div>
                          <span className="bar-chart-value" style={{ color: 'var(--accent-gold)' }}>
                            ${sh.dividend.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Ledger Entries */}
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
                    {recentTransactions.map((tx, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{tx.date}</td>
                        <td>
                          <span style={{ color: tx.type === 'income' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: '600' }}>
                            {tx.label}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          ${tx.amount.toLocaleString()}
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
                    {recentTransactions.length === 0 && (
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
    </div>
  );
}
