// Financial and Equity Math Engine for BusinessPilot ERP v1.0

import { getIncomes, getExpenses, getShareholderLedger, getShareholders, getBanks, getLoans, getChartOfAccounts, getGasInventoryPeriods, getGasPurchases, getFixedAssets, getCustomers, getSuppliers, getJournalEntries as getStoredJournalEntries, getJournalLines as getStoredJournalLines, getBankTransactions, getPeriodLocks } from '../db/storage';
import { calculateAggregateReceivables, calculateReceivablesByOriginMonth, isActiveSettlementReceipt } from './receivables';
import { calculateCashRevenue } from './cashRevenue';
import { calculateCashExpenses } from './cashExpenses';

const isBankTransfer = (item) => !!item.bankId;

// Helper: Check if date falls within a period
// periodType: 'month' (e.g. '2026-06'), 'quarter' (e.g. '2026-Q2'), 'year' (e.g. '2026'), 'all'
export const isDateInPeriod = (dateStr, periodType, periodVal) => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (periodType === 'all') return true;
  if (periodType === 'date') return dateStr === periodVal;
  if (periodType === 'range') {
    const { startDate, endDate } = periodVal || {};
    return (!startDate || dateStr >= startDate) && (!endDate || dateStr <= endDate);
  }

  const parts = dateStr.split('-');
  if (parts.length < 2) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  if (periodType === 'month') {
    if (!periodVal || typeof periodVal !== 'string') return false;
    const pParts = periodVal.split('-');
    if (pParts.length < 2) return false;
    const [targetYear, targetMonth] = pParts.map(Number);
    return year === targetYear && month === targetMonth;
  }

  if (periodType === 'quarter') {
    if (!periodVal || typeof periodVal !== 'string') return false;
    const pParts = periodVal.split('-');
    if (pParts.length < 2) return false;
    const [targetYear, qStr] = pParts;
    const q = parseInt(qStr.replace('Q', ''), 10);
    const targetYearNum = parseInt(targetYear, 10);
    if (year !== targetYearNum) return false;
    const quarter = Math.ceil(month / 3);
    return quarter === q;
  }

  if (periodType === 'year') {
    const targetYearNum = parseInt(periodVal, 10);
    return year === targetYearNum;
  }

  return false;
};

export const getCashRevenueSummary = (companyId, periodType, periodVal) => calculateCashRevenue({
  incomes: getIncomes().filter(item => item.companyId === companyId),
  bankTransactions: getBankTransactions().filter(item => item.companyId === companyId),
  isDateIncluded: date => isDateInPeriod(date, periodType, periodVal)
});

export const getCashExpenseSummary = (companyId, periodType, periodVal) => calculateCashExpenses({
  expenses: getExpenses().filter(item => item.companyId === companyId),
  bankTransactions: getBankTransactions().filter(item => item.companyId === companyId),
  isDateIncluded: date => isDateInPeriod(date, periodType, periodVal)
});

export const getCashNetProfitSummary = (companyId, periodType, periodVal) => {
  const revenue = getCashRevenueSummary(companyId, periodType, periodVal);
  const expenses = getCashExpenseSummary(companyId, periodType, periodVal);
  return {
    revenue,
    expenses,
    totalRevenue: revenue.totalRevenue,
    totalExpenses: expenses.totalExpenses,
    netProfit: revenue.totalRevenue - expenses.totalExpenses
  };
};

const isDepositIncome = item => (
  item?.syncType === 'revenue_deposit' ||
  String(item?.remarks || '').includes('押瓶') ||
  String(item?.remarks || '').includes('押金')
);

/**
 * Monthly operating view used by the dashboard and management reports.
 * Revenue is recognized in its origin month. Later collections reduce that
 * same month's receivable balance instead of inflating the collection month.
 * Customer deposits are balance-sheet money and are deliberately excluded.
 */
export const getMonthlyOperatingSummary = (companyId, yearMonth) => {
  const incomes = getIncomes();
  const bankTransactions = getBankTransactions();
  const receivables = calculateReceivablesByOriginMonth({
    companyId,
    asOfDate: new Date().toISOString().split('T')[0],
    originMonth: yearMonth,
    incomes,
    bankTransactions
  });
  const entries = incomes.filter(item =>
    item?.companyId === companyId &&
    isActivePostedRecord(item) &&
    String(item.date || '').startsWith(yearMonth) &&
    item.syncType !== 'receivable_opening' &&
    !String(item.remarks || '').includes('尚未核銷') &&
    !String(item.remarks || '').includes('欠款餘額') &&
    !isDepositIncome(item)
  );
  const totalRevenue = entries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outstandingReceivables = receivables.total.outstandingAmount;

  return {
    yearMonth,
    entries,
    receivables,
    totalRevenue,
    actualRevenue: Math.max(0, totalRevenue - outstandingReceivables),
    outstandingReceivables
  };
};

const isActivePostedRecord = item => (
  item?.status === 'approved' &&
  item.correctionStatus !== 'corrected' &&
  item.correctionType !== 'reversal'
);

const daysBetween = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.max(0, Math.floor((to - from) / 86400000));
};

const getAgingBucket = (days) => {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
};

export const getAgingReport = (companyId, asOfDate = new Date().toISOString().split('T')[0]) => {
  const makeRow = (item, type) => {
    const dueDate = item.dueDate || item.checkDueDate || item.date;
    const daysOverdue = daysBetween(dueDate, asOfDate);
    return {
      ...item,
      type,
      dueDate,
      daysOverdue,
      bucket: getAgingBucket(daysOverdue)
    };
  };

  const aggregateReceivables = calculateAggregateReceivables({
    companyId,
    asOfDate,
    incomes: getIncomes(),
    bankTransactions: getBankTransactions()
  });
  const receivables = aggregateReceivables.rows
    .map(item => makeRow({ ...item, amount: item.outstandingAmount }, 'receivable'));

  const payables = getExpenses()
    .filter(item => item.companyId === companyId && item.status === 'approved' && item.paymentStatus === 'unpaid')
    .map(item => makeRow(item, 'payable'));

  const summarize = (rows) => {
    const summary = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
    rows.forEach(row => {
      summary[row.bucket] += Number(row.amount || 0);
      summary.total += Number(row.amount || 0);
    });
    return summary;
  };

  const receivableSummary = summarize(receivables);
  const payableSummary = summarize(payables);

  return {
    asOfDate,
    receivableRows: receivables,
    payableRows: payables,
    receivableSummary,
    payableSummary,
    receivables: {
      rows: receivables,
      total: receivableSummary.total,
      buckets: {
        current: { total: receivableSummary['0-30'] },
        days31to60: { total: receivableSummary['31-60'] },
        days61to90: { total: receivableSummary['61-90'] },
        over90: { total: receivableSummary['90+'] }
      }
    },
    payables: {
      rows: payables,
      total: payableSummary.total,
      buckets: {
        current: { total: payableSummary['0-30'] },
        days31to60: { total: payableSummary['31-60'] },
        days61to90: { total: payableSummary['61-90'] },
        over90: { total: payableSummary['90+'] }
      }
    },
  };
};

export const getAggregateReceivableSummary = (companyId, asOfDate = new Date().toISOString().split('T')[0]) => (
  calculateAggregateReceivables({
    companyId,
    asOfDate,
    incomes: getIncomes(),
    bankTransactions: getBankTransactions()
  })
);

const matchCustomerIncome = (income, customer) => {
  if (!income || !customer) return false;
  if (income.customerId && income.customerId === customer.id) return true;
  const target = String(customer.name || '').trim();
  if (!target) return false;
  return [income.counterpartyName, income.customerName, income.clientName, income.remarks]
    .some(value => String(value || '').includes(target));
};

const matchSupplierExpense = (expense, supplier) => {
  if (!expense || !supplier) return false;
  if (expense.supplierId && expense.supplierId === supplier.id) return true;
  const target = String(supplier.name || '').trim();
  if (!target) return false;
  return [expense.counterpartyName, expense.supplierName, expense.vendorName, expense.remarks]
    .some(value => String(value || '').includes(target));
};

export const getCustomerReceivableSummary = (companyId, asOfDate = new Date().toISOString().split('T')[0]) => {
  const customers = getCustomers().filter(item => item.companyId === companyId && item.status !== 'inactive');
  const unpaidIncomes = getIncomes().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    item.paymentStatus === 'unpaid'
  );

  return customers.map(customer => {
    const rows = unpaidIncomes.filter(income => matchCustomerIncome(income, customer));
    const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const oldestDays = rows.reduce((max, item) => {
      const dueDate = item.dueDate || item.checkDueDate || item.date;
      return Math.max(max, daysBetween(dueDate, asOfDate));
    }, 0);
    return {
      ...customer,
      receivableTotal: total,
      unpaidCount: rows.length,
      oldestDays,
      agingBucket: getAgingBucket(oldestDays)
    };
  }).sort((a, b) => b.receivableTotal - a.receivableTotal);
};

export const getSupplierPayableSummary = (companyId, asOfDate = new Date().toISOString().split('T')[0]) => {
  const suppliers = getSuppliers().filter(item => item.companyId === companyId && item.status !== 'inactive');
  const unpaidExpenses = getExpenses().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    item.paymentStatus === 'unpaid'
  );

  return suppliers.map(supplier => {
    const rows = unpaidExpenses.filter(expense => matchSupplierExpense(expense, supplier));
    const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const oldestDays = rows.reduce((max, item) => {
      const dueDate = item.dueDate || item.checkDueDate || item.date;
      return Math.max(max, daysBetween(dueDate, asOfDate));
    }, 0);
    return {
      ...supplier,
      payableTotal: total,
      unpaidCount: rows.length,
      oldestDays,
      agingBucket: getAgingBucket(oldestDays)
    };
  }).sort((a, b) => b.payableTotal - a.payableTotal);
};

export const getCustomerStatement = (companyId, customerId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const customer = getCustomers().find(item => item.companyId === companyId && item.id === customerId);
  if (!customer) return { customer: null, rows: [], total: 0, unpaidTotal: 0 };
  const rows = getIncomes()
    .filter(item => item.companyId === companyId && matchCustomerIncome(item, customer) && isDateInPeriod(item.date, periodType, periodVal))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  return {
    customer,
    rows,
    total: rows.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    unpaidTotal: rows
      .filter(item => item.paymentStatus === 'unpaid')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
};

export const getSupplierStatement = (companyId, supplierId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const supplier = getSuppliers().find(item => item.companyId === companyId && item.id === supplierId);
  if (!supplier) return { supplier: null, rows: [], total: 0, unpaidTotal: 0 };
  const rows = getExpenses()
    .filter(item => item.companyId === companyId && matchSupplierExpense(item, supplier) && isDateInPeriod(item.date, periodType, periodVal))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  return {
    supplier,
    rows,
    total: rows.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    unpaidTotal: rows
      .filter(item => item.paymentStatus === 'unpaid')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
};

const normalizeImportAmount = (value) => {
  const cleaned = String(value || '').replace(/,/g, '').trim();
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
};

export const parseBankStatementText = (text) => {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/,|\t/).map(part => part.trim());
      const [date, description, withdrawal, deposit, balance] = parts;
      const withdrawalAmount = normalizeImportAmount(withdrawal);
      const depositAmount = normalizeImportAmount(deposit);
      const signedAmount = depositAmount > 0 ? depositAmount : -Math.abs(withdrawalAmount);
      return {
        id: `stmt-${index + 1}`,
        date,
        description: description || '',
        withdrawal: withdrawalAmount,
        deposit: depositAmount,
        amount: signedAmount,
        balance: normalizeImportAmount(balance),
        raw: line
      };
    })
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.amount !== 0);
};

export const buildBankReconciliation = ({ companyId, bankId, statementDate, statementRows }) => {
  const rows = Array.isArray(statementRows) ? statementRows : [];
  const systemRows = [
    ...getIncomes()
      .filter(item => item.companyId === companyId && item.bankId === bankId && item.status === 'approved')
      .map(item => ({ ...item, type: 'income', signedAmount: Number(item.amount || 0) })),
    ...getExpenses()
      .filter(item => item.companyId === companyId && item.bankId === bankId && item.status === 'approved')
      .map(item => ({ ...item, type: 'expense', signedAmount: -Number(item.amount || 0) }))
  ].filter(item => !statementDate || item.date <= statementDate);

  const usedSystemIds = new Set();
  const matchedRows = [];
  const unmatchedStatementRows = [];

  rows.forEach(row => {
    const match = systemRows.find(item => (
      !usedSystemIds.has(item.id) &&
      item.date === row.date &&
      Number(item.signedAmount || 0) === Number(row.amount || 0)
    ));
    if (match) {
      usedSystemIds.add(match.id);
      matchedRows.push({ statementRow: row, systemRow: match });
    } else {
      unmatchedStatementRows.push(row);
    }
  });

  const unmatchedSystemRows = systemRows.filter(item => !usedSystemIds.has(item.id));
  const statementBalance = rows.length ? Number(rows[rows.length - 1].balance || 0) : 0;
  const systemBalance = getBankBalancesAtDate(companyId, statementDate)
    .find(bank => bank.id === bankId)?.currentBalance || 0;

  return {
    statementBalance,
    systemBalance,
    difference: statementBalance - systemBalance,
    matchedRows,
    unmatchedStatementRows,
    unmatchedSystemRows
  };
};

export const calculateAssetDepreciation = (asset, asOfDate = new Date().toISOString().split('T')[0]) => {
  const cost = Number(asset.acquisitionCost || 0);
  const residual = Number(asset.residualValue || 0);
  const usefulLifeMonths = Number(asset.usefulLifeMonths || 0);
  const depreciable = Math.max(0, cost - residual);
  const monthlyDepreciation = usefulLifeMonths > 0 ? depreciable / usefulLifeMonths : 0;
  const start = new Date(`${asset.acquisitionDate}T00:00:00`);
  const end = new Date(`${asOfDate}T00:00:00`);
  const elapsedMonths = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
  const monthsUsed = Math.min(usefulLifeMonths || 0, elapsedMonths);
  const accumulatedDepreciation = Math.round(monthlyDepreciation * monthsUsed);
  const bookValue = Math.max(residual, cost - accumulatedDepreciation);

  return {
    monthlyDepreciation: Math.round(monthlyDepreciation),
    monthsUsed,
    accumulatedDepreciation,
    bookValue
  };
};

export const getFixedAssetSummary = (companyId, asOfDate = new Date().toISOString().split('T')[0]) => {
  const assets = getFixedAssets()
    .filter(asset => asset.companyId === companyId)
    .map(asset => ({ ...asset, depreciation: calculateAssetDepreciation(asset, asOfDate) }));

  return {
    assets,
    totalCost: assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || 0), 0),
    totalAccumulatedDepreciation: assets.reduce((sum, asset) => sum + asset.depreciation.accumulatedDepreciation, 0),
    totalBookValue: assets.reduce((sum, asset) => sum + asset.depreciation.bookValue, 0)
  };
};

const accountName = (code, fallback = '') => {
  const account = getChartOfAccounts().find(item => item.code === code);
  return account?.name || fallback || code;
};

const cashAccountName = (item) => {
  if (item.paymentStatus === 'unpaid' && item.paymentMethod !== 'check') return item.amount >= 0 ? '應收帳款' : '應付帳款';
  if (item.paymentMethod === 'cash') return '現金';
  if (item.paymentMethod === 'receivable') return '應收帳款';
  if (item.paymentMethod === 'payable') return '應付帳款';
  if (item.paymentMethod === 'check') return item.amount >= 0 ? '應收票據' : '應付票據';
  const bank = getBanks().find(bankItem => bankItem.id === item.bankId);
  return bank?.name || '銀行存款';
};

const pushEntry = (entries, header) => {
  const debit = header.lines.filter(line => line.side === 'debit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const credit = header.lines.filter(line => line.side === 'credit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  entries.push({
    ...header,
    debit,
    credit,
    balanced: Math.round(debit) === Math.round(credit)
  });
};

export const getJournalEntries = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const storedEntries = getStoredJournalEntries()
    .filter(item => item.companyId === companyId && isDateInPeriod(item.date, periodType, periodVal));
  if (storedEntries.length > 0) {
    const storedLines = getStoredJournalLines();
    return storedEntries.map((entry) => {
      const lines = storedLines.filter(line => line.entryId === entry.id);
      const debit = lines.filter(line => line.side === 'debit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const credit = lines.filter(line => line.side === 'credit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
      return {
        ...entry,
        description: entry.memo,
        lines,
        debit,
        credit,
        balanced: Math.abs(debit - credit) < 0.01
      };
    }).sort((a, b) => `${a.date}:${a.id}`.localeCompare(`${b.date}:${b.id}`));
  }

  const entries = [];

  getIncomes()
    .filter(item => item.companyId === companyId && item.status === 'approved' && isDateInPeriod(item.date, periodType, periodVal))
    .forEach(item => {
      pushEntry(entries, {
        id: `J-${item.id}`,
        sourceId: item.id,
        sourceType: 'income',
        date: item.date,
        description: item.remarks || '收入傳票',
        lines: [
          { side: 'debit', accountCode: item.paymentStatus === 'unpaid' && item.paymentMethod !== 'check' ? '1102' : item.paymentMethod === 'cash' ? '1100' : '1101', accountName: cashAccountName(item), amount: Number(item.amount || 0) },
          { side: 'credit', accountCode: item.accountCode, accountName: accountName(item.accountCode, '營業收入'), amount: Number(item.amount || 0) }
        ]
      });
    });

  getExpenses()
    .filter(item => item.companyId === companyId && item.status === 'approved' && isDateInPeriod(item.date, periodType, periodVal))
    .forEach(item => {
      pushEntry(entries, {
        id: `J-${item.id}`,
        sourceId: item.id,
        sourceType: 'expense',
        date: item.date,
        description: item.remarks || '支出傳票',
        lines: [
          { side: 'debit', accountCode: item.accountCode, accountName: accountName(item.accountCode, '營業費用'), amount: Number(item.amount || 0) },
          { side: 'credit', accountCode: item.paymentMethod === 'payable' ? '2102' : '1101', accountName: cashAccountName({ ...item, amount: -Number(item.amount || 0) }), amount: Number(item.amount || 0) }
        ]
      });
    });

  getShareholderLedger()
    .filter(item => item.companyId === companyId && isDateInPeriod(item.date, periodType, periodVal))
    .forEach(item => {
      const isCapitalIn = item.type === 'join' || item.type === 'increase';
      pushEntry(entries, {
        id: `J-${item.id}`,
        sourceId: item.id,
        sourceType: 'equity',
        date: item.date,
        description: item.remarks || '股東權益傳票',
        lines: isCapitalIn
          ? [
              { side: 'debit', accountCode: '1101', accountName: '銀行存款/現金', amount: Number(item.amount || 0) },
              { side: 'credit', accountCode: '3101', accountName: '股本', amount: Number(item.amount || 0) }
            ]
          : [
              { side: 'debit', accountCode: '3101', accountName: '股本', amount: Number(item.amount || 0) },
              { side: 'credit', accountCode: '1101', accountName: '銀行存款/現金', amount: Number(item.amount || 0) }
            ]
      });
    });

  getFixedAssets()
    .filter(asset => asset.companyId === companyId && isDateInPeriod(asset.acquisitionDate, periodType, periodVal))
    .forEach(asset => {
      pushEntry(entries, {
        id: `J-AST-${asset.id}`,
        sourceId: asset.id,
        sourceType: 'fixed_asset',
        date: asset.acquisitionDate,
        description: `${asset.assetName} 固定資產購入`,
        lines: [
          { side: 'debit', accountCode: '1501', accountName: '固定資產', amount: Number(asset.acquisitionCost || 0) },
          { side: 'credit', accountCode: '1101', accountName: '銀行存款/現金', amount: Number(asset.acquisitionCost || 0) }
        ]
      });
    });

  const asOfDate = getPeriodEndDate(periodType, periodVal);
  getFixedAssets()
    .filter(asset => asset.companyId === companyId && asset.status === 'active' && isDateInPeriod(asOfDate, periodType, periodVal))
    .forEach(asset => {
      const dep = calculateAssetDepreciation(asset, asOfDate);
      if (dep.monthlyDepreciation <= 0) return;
      pushEntry(entries, {
        id: `J-DEP-${asset.id}-${String(asOfDate).slice(0, 7)}`,
        sourceId: asset.id,
        sourceType: 'depreciation',
        date: asOfDate,
        description: `${asset.assetName} 每月折舊`,
        lines: [
          { side: 'debit', accountCode: '6201', accountName: '折舊費用', amount: dep.monthlyDepreciation },
          { side: 'credit', accountCode: '1599', accountName: '累計折舊', amount: dep.monthlyDepreciation }
        ]
      });
    });

  return entries.sort((a, b) => a.date.localeCompare(b.date));
};

const getPeriodBounds = (periodType, periodVal) => {
  if (periodType === 'date') return { startDate: periodVal || '', endDate: periodVal || '' };
  if (periodType === 'range') {
    return {
      startDate: periodVal?.startDate || '',
      endDate: periodVal?.endDate || '2099-12-31'
    };
  }
  if (periodType === 'month') {
    return {
      startDate: `${periodVal}-01`,
      endDate: getPeriodEndDate(periodType, periodVal)
    };
  }
  if (periodType === 'quarter') {
    const [year, quarterText] = String(periodVal || '').split('-');
    const quarter = Number(String(quarterText || '').replace('Q', '')) || 1;
    const startMonth = String((quarter - 1) * 3 + 1).padStart(2, '0');
    return { startDate: `${year}-${startMonth}-01`, endDate: getPeriodEndDate(periodType, periodVal) };
  }
  if (periodType === 'year') return { startDate: `${periodVal}-01-01`, endDate: `${periodVal}-12-31` };
  return { startDate: '', endDate: '2099-12-31' };
};

export const getTrialBalance = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const accounts = new Map();
  getJournalEntries(companyId, periodType, periodVal).forEach((entry) => {
    entry.lines.forEach((line) => {
      const key = `${line.accountCode}:${line.accountName}`;
      const current = accounts.get(key) || {
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: 0,
        credit: 0
      };
      current[line.side] += Number(line.amount || 0);
      accounts.set(key, current);
    });
  });

  const rows = [...accounts.values()]
    .map((row) => {
      const balance = row.debit - row.credit;
      return {
        ...row,
        debitBalance: Math.max(0, balance),
        creditBalance: Math.max(0, -balance)
      };
    })
    .sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));

  return {
    rows,
    totalDebit: rows.reduce((sum, row) => sum + row.debit, 0),
    totalCredit: rows.reduce((sum, row) => sum + row.credit, 0),
    totalDebitBalance: rows.reduce((sum, row) => sum + row.debitBalance, 0),
    totalCreditBalance: rows.reduce((sum, row) => sum + row.creditBalance, 0)
  };
};

export const getGeneralLedger = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const selectedEntries = getJournalEntries(companyId, periodType, periodVal);
  const storedHeaders = getStoredJournalEntries().filter(item => item.companyId === companyId);
  const storedLines = getStoredJournalLines();
  const { startDate } = getPeriodBounds(periodType, periodVal);
  const openingByAccount = new Map();

  storedHeaders
    .filter(entry => !startDate || entry.date < startDate)
    .forEach((entry) => {
      storedLines.filter(line => line.entryId === entry.id).forEach((line) => {
        const key = `${line.accountCode}:${line.accountName}`;
        const delta = line.side === 'debit' ? Number(line.amount || 0) : -Number(line.amount || 0);
        openingByAccount.set(key, (openingByAccount.get(key) || 0) + delta);
      });
    });

  const accounts = new Map();
  selectedEntries.forEach((entry) => {
    entry.lines.forEach((line) => {
      const key = `${line.accountCode}:${line.accountName}`;
      if (!accounts.has(key)) {
        accounts.set(key, {
          accountCode: line.accountCode,
          accountName: line.accountName,
          openingBalance: openingByAccount.get(key) || 0,
          rows: []
        });
      }
      accounts.get(key).rows.push({
        date: entry.date,
        entryId: entry.id,
        description: entry.description,
        debit: line.side === 'debit' ? Number(line.amount || 0) : 0,
        credit: line.side === 'credit' ? Number(line.amount || 0) : 0
      });
    });
  });

  return [...accounts.values()]
    .map((account) => {
      let runningBalance = account.openingBalance;
      const rows = account.rows
        .sort((a, b) => `${a.date}:${a.entryId}`.localeCompare(`${b.date}:${b.entryId}`))
        .map((row) => {
          runningBalance += row.debit - row.credit;
          return { ...row, runningBalance };
        });
      return { ...account, rows, closingBalance: runningBalance };
    })
    .sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));
};

const CASH_ACCOUNT_CODES = new Set(['1100', '1101']);

const cashDeltaForEntry = (entry) => entry.lines.reduce((sum, line) => {
  if (!CASH_ACCOUNT_CODES.has(String(line.accountCode))) return sum;
  return sum + (line.side === 'debit' ? Number(line.amount || 0) : -Number(line.amount || 0));
}, 0);

const cashFlowSectionForEntry = (entry) => {
  if (entry.sourceType === 'fixed_asset' || entry.lines.some(line => String(line.accountCode).startsWith('15'))) return 'investing';
  if (entry.sourceType === 'equity' || entry.sourceType === 'loan' || entry.lines.some(line => /^(21|31)/.test(String(line.accountCode)))) return 'financing';
  return 'operating';
};

export const getCashFlowStatement = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const sections = {
    operating: { label: '營業活動', rows: [], total: 0 },
    investing: { label: '投資活動', rows: [], total: 0 },
    financing: { label: '籌資活動', rows: [], total: 0 }
  };
  const entries = getJournalEntries(companyId, periodType, periodVal);

  entries.forEach((entry) => {
    const amount = cashDeltaForEntry(entry);
    if (Math.abs(amount) < 0.01) return;
    const section = sections[cashFlowSectionForEntry(entry)];
    section.rows.push({
      date: entry.date,
      entryId: entry.id,
      description: entry.description,
      amount
    });
    section.total += amount;
  });

  const { startDate } = getPeriodBounds(periodType, periodVal);
  const storedLines = getStoredJournalLines();
  const openingCash = getStoredJournalEntries()
    .filter(entry => entry.companyId === companyId && (!startDate || entry.date < startDate))
    .reduce((sum, entry) => sum + storedLines
      .filter(line => line.entryId === entry.id && CASH_ACCOUNT_CODES.has(String(line.accountCode)))
      .reduce((lineSum, line) => lineSum + (line.side === 'debit' ? Number(line.amount || 0) : -Number(line.amount || 0)), 0), 0);
  const netChange = Object.values(sections).reduce((sum, section) => sum + section.total, 0);

  return {
    sections,
    openingCash,
    netChange,
    closingCash: openingCash + netChange
  };
};

const VAT_RATE = 0.05;
const isVatTaxable = (item) => (item.taxType || 'taxable') === 'taxable';
const taxFromAmount = (item) => {
  if (!isVatTaxable(item)) return 0;
  if (item.vatAmount !== null && item.vatAmount !== undefined && item.vatAmount !== '') return Number(item.vatAmount) || 0;
  const amount = Number(item.amount || 0);
  return item.taxIncluded === false ? Math.round(amount * VAT_RATE) : Math.round(amount * VAT_RATE / (1 + VAT_RATE));
};
const netSalesAmount = (item) => {
  const amount = Number(item.amount || 0);
  if (!isVatTaxable(item)) return amount;
  return item.taxIncluded === false ? amount : amount - taxFromAmount(item);
};

export const getVatReport = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const taxableIncomes = getIncomes().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    isDateInPeriod(item.date, periodType, periodVal)
  );
  const taxableExpenses = getExpenses().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    !(item.accountCode && item.accountCode.startsWith('6101')) &&
    isDateInPeriod(item.date, periodType, periodVal)
  );

  const incomeRows = taxableIncomes.map(item => ({
    ...item,
    taxableAmount: netSalesAmount(item),
    vatAmountCalculated: taxFromAmount(item)
  }));
  const expenseRows = taxableExpenses.map(item => ({
    ...item,
    taxableAmount: netSalesAmount(item),
    vatAmountCalculated: taxFromAmount(item)
  }));
  const outputTax = incomeRows.reduce((sum, item) => sum + item.vatAmountCalculated, 0);
  const inputTax = expenseRows.reduce((sum, item) => sum + item.vatAmountCalculated, 0);
  const salesNet = incomeRows.reduce((sum, item) => sum + item.taxableAmount, 0);
  const purchaseNet = expenseRows.reduce((sum, item) => sum + item.taxableAmount, 0);

  return {
    rate: VAT_RATE,
    outputTax,
    inputTax,
    netTaxPayable: outputTax - inputTax,
    salesGross: taxableIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    salesNet,
    purchaseGross: taxableExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    purchaseNet,
    incomeRows,
    expenseRows
  };
};

export const getPayrollReport = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const salaryRows = getExpenses().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    item.correctionStatus !== 'corrected' &&
    item.correctionType !== 'reversal' &&
    item.accountCode && item.accountCode.startsWith('6101') &&
    isDateInPeriod(item.payrollMonth ? `${item.payrollMonth}-01` : item.date, periodType, periodVal)
  );
  const grossSalary = salaryRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const manualLaborInsurance = salaryRows.reduce((sum, item) => sum + Number(item.laborInsurance || 0), 0);
  const manualHealthInsurance = salaryRows.reduce((sum, item) => sum + Number(item.healthInsurance || 0), 0);
  const manualPension = salaryRows.reduce((sum, item) => sum + Number(item.pension || 0), 0);
  const estimatedLaborInsurance = manualLaborInsurance || Math.round(grossSalary * 0.08);
  const estimatedHealthInsurance = manualHealthInsurance || Math.round(grossSalary * 0.05);
  const estimatedPension = manualPension || Math.round(grossSalary * 0.06);
  const withholdingTax = salaryRows.reduce((sum, item) => sum + Number(item.withholdingTax || 0), 0);
  const totalEmployerCost = grossSalary + estimatedLaborInsurance + estimatedHealthInsurance + estimatedPension;

  return {
    salaryRows,
    grossSalary,
    estimatedLaborInsurance,
    estimatedHealthInsurance,
    estimatedPension,
    withholdingTax,
    totalEmployerCost
  };
};

export const getAuditReadinessReport = (companyId, periodType = 'month', periodVal = new Date().toISOString().slice(0, 7)) => {
  const entries = getJournalEntries(companyId, periodType, periodVal);
  const incomes = getIncomes().filter(item => item.companyId === companyId && isDateInPeriod(item.date, periodType, periodVal));
  const expenses = getExpenses().filter(item => item.companyId === companyId && isDateInPeriod(item.date, periodType, periodVal));
  const approvedWithoutAttachment = [...incomes, ...expenses].filter(item => item.status === 'approved' && !item.receiptAttachment);
  const taxableWithoutInvoice = [...incomes, ...expenses].filter(item => item.status === 'approved' && isVatTaxable(item) && !item.invoiceNo);
  const pendingRows = [...incomes, ...expenses].filter(item => String(item.status || '').startsWith('pending'));
  const unbalancedEntries = entries.filter(entry => !entry.balanced);

  return {
    entries,
    approvedWithoutAttachment,
    taxableWithoutInvoice,
    pendingRows,
    unbalancedEntries,
    score: Math.max(0, 100 - approvedWithoutAttachment.length * 5 - taxableWithoutInvoice.length * 5 - pendingRows.length * 8 - unbalancedEntries.length * 20)
  };
};

// Helper: Get end date of a month as a comparison string
export const getPeriodEndDate = (periodType, periodVal) => {
  if (periodType === 'date') return periodVal || '';
  if (periodType === 'range') return periodVal?.endDate || '2099-12-31';
  if (periodType === 'month') {
    if (!periodVal || typeof periodVal !== 'string') return '2099-12-31';
    const parts = periodVal.split('-');
    if (parts.length < 2) return '2099-12-31';
    const [year, month] = parts.map(Number);
    // Last day of month
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  if (periodType === 'quarter') {
    if (!periodVal || typeof periodVal !== 'string') return '2099-12-31';
    const parts = periodVal.split('-');
    if (parts.length < 2) return '2099-12-31';
    const [year, qStr] = parts;
    const q = parseInt(qStr.replace('Q', ''), 10);
    const months = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
    return `${year}-${months[q] || '12-31'}`;
  }
  if (periodType === 'year') {
    return periodVal ? `${periodVal}-12-31` : '2099-12-31';
  }
  return '2099-12-31';
};

export const getPeriodLabel = (periodType, periodVal) => {
  if (periodType === 'date') return `${periodVal || ''} 單日`;
  if (periodType === 'range') return `${periodVal?.startDate || '最早'} 至 ${periodVal?.endDate || '今日'}`;
  if (periodType === 'month') {
    if (!periodVal || typeof periodVal !== 'string') return '全部期間';
    const parts = periodVal.split('-');
    if (parts.length < 2) return '全部期間';
    const [year, month] = parts;
    return `${year} 年 ${parseInt(month, 10)} 月`;
  }
  if (periodType === 'quarter') return periodVal || '';
  if (periodType === 'year') return periodVal ? `${periodVal} 年` : '';
  return '全部期間';
};

const toYearMonth = (dateStr) => String(dateStr || '').slice(0, 7);

const getApprovedGasSales = (companyId, periodType = 'all', periodVal = null) => (
  getIncomes().filter(item =>
    item.companyId === companyId &&
    isActivePostedRecord(item) &&
    Number(item.gasKg || 0) > 0 &&
    isDateInPeriod(item.date, periodType, periodVal)
  )
);

export const getGasInventoryForMonth = (companyId, yearMonth) => {
  const config = getGasInventoryPeriods().find(item => item.companyId === companyId && item.yearMonth === yearMonth);
  const openingKg = Number(config?.openingKg || 0);
  const openingCost = Number(config?.openingCost || 0);

  // Aggregate from daily purchases
  const monthDailyPurchases = getGasPurchases().filter(p => p.companyId === companyId && p.date && typeof p.date === 'string' && p.date.startsWith(yearMonth));

  const purchaseKg = monthDailyPurchases.length > 0
    ? monthDailyPurchases.reduce((sum, p) => sum + Number(p.totalKg || 0), 0)
    : Number(config?.purchaseKg || 0);

  const purchaseAmount = monthDailyPurchases.length > 0
    ? monthDailyPurchases.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : Number(config?.purchaseAmount || 0);

  const shrinkageKg = Number(config?.shrinkageKg || 0);
  const availableKg = openingKg + purchaseKg;
  const availableCost = openingCost + purchaseAmount;
  const averageCostPerKg = availableKg > 0 ? availableCost / availableKg : 0;
  const monthSales = getApprovedGasSales(companyId, 'month', yearMonth);
  const soldKg = monthSales.reduce((sum, item) => sum + Number(item.gasKg || 0), 0);
  
  // 應計基礎：當月發生的瓦斯銷售全數列入；後續還款不重複增加營業額。
  const gasRevenue = monthSales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const gasCogs = Math.round(soldKg * averageCostPerKg);
  const bookEndingKg = Math.max(0, availableKg - soldKg - shrinkageKg);
  const endingKg = config?.physicalEndingKg === null || config?.physicalEndingKg === undefined ? bookEndingKg : Number(config.physicalEndingKg || 0);
  const endingCost = Math.round(endingKg * averageCostPerKg);
  const grossProfit = gasRevenue - gasCogs;

  return {
    config,
    yearMonth,
    openingKg,
    openingCost,
    purchaseKg,
    purchaseAmount,
    shrinkageKg,
    availableKg,
    availableCost,
    averageCostPerKg,
    soldKg,
    gasRevenue,
    gasCogs,
    grossProfit,
    grossMargin: gasRevenue > 0 ? (grossProfit / gasRevenue) * 100 : 0,
    bookEndingKg,
    endingKg,
    endingCost
  };
};

export const getGasInventoryValuationAtDate = (companyId, dateStr) => {
  const targetYearMonth = toYearMonth(dateStr);
  const periods = getGasInventoryPeriods()
    .filter(item => item.companyId === companyId && item.yearMonth && typeof item.yearMonth === 'string' && targetYearMonth && item.yearMonth <= targetYearMonth)
    .map(item => getGasInventoryForMonth(companyId, item.yearMonth))
    .sort((a, b) => (b.yearMonth || '').localeCompare(a.yearMonth || ''));
  return periods[0] || getGasInventoryForMonth(companyId, targetYearMonth);
};

export const getGasGrossProfitForPeriod = (companyId, periodType, periodVal) => {
  const sales = getApprovedGasSales(companyId, periodType, periodVal);

  const dailyMap = {};
  let totalKg = 0;
  let totalRevenue = 0;
  let totalCogs = 0;

  sales.forEach(item => {
    const monthCost = getGasInventoryForMonth(companyId, toYearMonth(item.date));
    const kg = Number(item.gasKg || 0);
    
    const revenue = Number(item.amount || 0);

    const cogs = Math.round(kg * monthCost.averageCostPerKg);
    if (!dailyMap[item.date]) {
      dailyMap[item.date] = { date: item.date, gasKg: 0, revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0 };
    }
    dailyMap[item.date].gasKg += kg;
    dailyMap[item.date].revenue += revenue;
    dailyMap[item.date].cogs += cogs;
    totalKg += kg;
    totalRevenue += revenue;
    totalCogs += cogs;
  });

  const dailyRows = Object.values(dailyMap)
    .map(row => ({
      ...row,
      grossProfit: row.revenue - row.cogs,
      grossMargin: row.revenue > 0 ? ((row.revenue - row.cogs) / row.revenue) * 100 : 0
    }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return {
    dailyRows,
    totalKg,
    totalRevenue,
    totalCogs,
    grossProfit: totalRevenue - totalCogs,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0
  };
};

export const getCompanyProfitReport = (companyId, periodType, periodVal) => {
  const allIncomes = getIncomes().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    isDateInPeriod(item.date, periodType, periodVal)
  );

  const allExpenses = getExpenses().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    isDateInPeriod(item.date, periodType, periodVal)
  );

  const allRepayments = getBankTransactions().filter(bt =>
    bt.companyId === companyId &&
    isActiveSettlementReceipt(bt) &&
    isDateInPeriod(bt.date, periodType, periodVal)
  );

  const dailyMap = {};

  const ensureDateRow = (dateStr) => {
    const date = dateStr || '未知日期';
    if (!dailyMap[date]) {
      dailyMap[date] = {
        date,
        gasKg: 0,
        gasRevenue: 0,
        gasCogs: 0,
        stoveRevenue: 0,
        stoveCogs: 0,
        repairRevenue: 0,
        repairCogs: 0,
        cylinderRevenue: 0,
        cylinderCogs: 0,
        inspectionRevenue: 0,
        inspectionCogs: 0,
        depositRevenue: 0,
        depositCogs: 0,
        otherRevenue: 0,
        otherCogs: 0,
        totalRevenue: 0,
        totalCogs: 0,
        totalProfit: 0,
        totalMargin: 0
      };
    }
    return dailyMap[date];
  };

  allIncomes.forEach(item => {
    const row = ensureDateRow(item.date);
    const remarks = item.remarks || '';
    const accountCode = item.accountCode || '';
    const accountName = getChartOfAccounts().find(a => a.code === accountCode)?.name || '';

    if (remarks === '當日營業彙總 - 現收') {
      const kg = Number(item.gasKg || 0);
      const monthCost = getGasInventoryForMonth(companyId, toYearMonth(item.date));
      const cogs = Math.round(kg * monthCost.averageCostPerKg);

      const revenue = Number(item.amount || 0);

      row.gasKg += kg;
      row.gasRevenue += revenue;
      row.gasCogs += cogs;
    } else if (remarks === '當日營業彙總 - 月結' || remarks === '當日營業彙總 - 賒欠') {
      return;
    } else if (accountCode === '4101') {
      const isCashPaid = item.paymentStatus === 'paid' && item.paymentMethod !== 'receivable';
      if (isCashPaid) {
        const kg = Number(item.gasKg || 0);
        const monthCost = getGasInventoryForMonth(companyId, toYearMonth(item.date));
        const cogs = Math.round(kg * monthCost.averageCostPerKg);
        row.gasKg += kg;
        row.gasRevenue += Number(item.amount || 0);
        row.gasCogs += cogs;
      }
    } else if (remarks === '當日營業彙總 - 爐具收入' || accountCode === '4104' || accountName.includes('爐具')) {
      row.stoveRevenue += Number(item.amount || 0);
    } else if (remarks === '當日營業彙總 - 維修收入' || accountCode === '4102' || accountName.includes('維修') || accountName.includes('服務') || remarks.includes('安裝')) {
      row.repairRevenue += Number(item.amount || 0);
    } else if (remarks === '當日營業彙總 - 買桶收入' || remarks.includes('買桶') || accountName.includes('買桶') || accountName.includes('鋼瓶') || accountName.includes('購桶')) {
      row.cylinderRevenue += Number(item.amount || 0);
    } else if (remarks === '當日營業彙總 - 檢驗費收入' || remarks.includes('檢驗') || accountName.includes('檢驗')) {
      row.inspectionRevenue += Number(item.amount || 0);
    } else if (remarks === '當日營業彙總 - 押瓶收入' || remarks.includes('押瓶') || remarks.includes('押金') || accountName.includes('押瓶') || accountName.includes('押金')) {
      row.depositRevenue += Number(item.amount || 0);
    } else {
      row.otherRevenue += Number(item.amount || 0);
    }
  });

  allRepayments.forEach(bt => {
    const row = ensureDateRow(bt.date);
    row.gasRevenue += Number(bt.amount || 0);
  });

  allExpenses.forEach(item => {
    const row = ensureDateRow(item.date);
    const remarks = item.remarks || '';
    const accountCode = item.accountCode || '';
    const accountName = getChartOfAccounts().find(a => a.code === accountCode)?.name || '';

    const isBuyCylinder = remarks.includes('買桶') || remarks.includes('鋼瓶') || remarks.includes('購桶') || accountName.includes('買桶') || accountName.includes('鋼瓶') || accountName.includes('購桶');
    const isRepair = remarks.includes('維修') || remarks.includes('修繕') || remarks.includes('保養') || remarks.includes('安裝') || accountName.includes('維修') || accountName.includes('修繕') || accountName.includes('保養');
    const isStove = remarks.includes('爐具') || remarks.includes('零件') || remarks.includes('材料') || accountName.includes('爐具') || accountName.includes('零件') || accountName.includes('材料');
    const isInspection = remarks.includes('檢驗') || accountName.includes('檢驗');
    const isDeposit = remarks.includes('押瓶') || remarks.includes('押金') || accountName.includes('押瓶') || accountName.includes('押金');

    if (isStove) {
      row.stoveCogs += Number(item.amount || 0);
    } else if (isRepair) {
      row.repairCogs += Number(item.amount || 0);
    } else if (isBuyCylinder) {
      row.cylinderCogs += Number(item.amount || 0);
    } else if (isInspection) {
      row.inspectionCogs += Number(item.amount || 0);
    } else if (isDeposit) {
      row.depositCogs += Number(item.amount || 0);
    } else {
      row.otherCogs += Number(item.amount || 0);
    }
  });

  const dailyRows = Object.values(dailyMap).map(row => {
    row.totalRevenue = row.gasRevenue + row.stoveRevenue + row.repairRevenue + row.cylinderRevenue + row.inspectionRevenue + row.depositRevenue + row.otherRevenue;
    row.totalCogs = row.gasCogs + row.stoveCogs + row.repairCogs + row.cylinderCogs + row.inspectionCogs + row.depositCogs + row.otherCogs;
    row.totalProfit = row.totalRevenue - row.totalCogs;
    row.totalMargin = row.totalRevenue > 0 ? (row.totalProfit / row.totalRevenue) * 100 : 0;
    return row;
  }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let totalKg = 0;
  let totalGasRevenue = 0;
  let totalGasCogs = 0;
  let totalStoveRevenue = 0;
  let totalStoveCogs = 0;
  let totalRepairRevenue = 0;
  let totalRepairCogs = 0;
  let totalCylinderRevenue = 0;
  let totalCylinderCogs = 0;
  let totalInspectionRevenue = 0;
  let totalInspectionCogs = 0;
  let totalDepositRevenue = 0;
  let totalDepositCogs = 0;
  let totalOtherRevenue = 0;
  let totalOtherCogs = 0;
  let totalRevenue = 0;
  let totalCogs = 0;

  dailyRows.forEach(row => {
    totalKg += row.gasKg;
    totalGasRevenue += row.gasRevenue;
    totalGasCogs += row.gasCogs;
    totalStoveRevenue += row.stoveRevenue;
    totalStoveCogs += row.stoveCogs;
    totalRepairRevenue += row.repairRevenue;
    totalRepairCogs += row.repairCogs;
    totalCylinderRevenue += row.cylinderRevenue;
    totalCylinderCogs += row.cylinderCogs;
    totalInspectionRevenue += row.inspectionRevenue;
    totalInspectionCogs += row.inspectionCogs;
    totalDepositRevenue += row.depositRevenue;
    totalDepositCogs += row.depositCogs;
    totalOtherRevenue += row.otherRevenue;
    totalOtherCogs += row.otherCogs;
    totalRevenue += row.totalRevenue;
    totalCogs += row.totalCogs;
  });

  const grossProfit = totalRevenue - totalCogs;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  return {
    dailyRows,
    totalKg,
    totalGasRevenue,
    totalGasCogs,
    totalStoveRevenue,
    totalStoveCogs,
    totalRepairRevenue,
    totalRepairCogs,
    totalCylinderRevenue,
    totalCylinderCogs,
    totalInspectionRevenue,
    totalInspectionCogs,
    totalDepositRevenue,
    totalDepositCogs,
    totalOtherRevenue,
    totalOtherCogs,
    totalRevenue,
    totalCogs,
    grossProfit,
    grossMargin
  };
};

/**
 * 1. Dynamic Shareholder Equity Timeline
 * Calculates the active capital and ratio of all shareholders for a company up to a specific date.
 */
export const getShareholderSharesAtDate = (companyId, endDateStr) => {
  const ledger = getShareholderLedger().filter(
    item => item.companyId === companyId && item.date <= endDateStr
  );
  const shareholders = getShareholders();
  
  // Group capital by shareholder
  const capitalMap = {};
  shareholders.forEach(sh => {
    capitalMap[sh.id] = Number(sh.initialCapital || 0);
  });

  ledger.forEach(tx => {
    if (tx.type === 'join' || tx.type === 'increase') {
      capitalMap[tx.shareholderId] = (capitalMap[tx.shareholderId] || 0) + tx.amount;
    } else if (tx.type === 'decrease') {
      capitalMap[tx.shareholderId] = (capitalMap[tx.shareholderId] || 0) - tx.amount;
      if (capitalMap[tx.shareholderId] < 0) capitalMap[tx.shareholderId] = 0; // Avoid negative capital
    }
  });

  // Calculate totals and percentages
  const totalCapital = Object.values(capitalMap).reduce((sum, cap) => sum + cap, 0);

  const results = shareholders
    .map(sh => {
      const activeCapital = capitalMap[sh.id] || 0;
      const hasManualRatio = sh.shareRatio !== undefined && sh.shareRatio !== null && String(sh.shareRatio).trim() !== '';
      const ratio = hasManualRatio ? Number(sh.shareRatio) : (totalCapital > 0 ? (activeCapital / totalCapital) * 100 : 0);
      return {
        shareholderId: sh.id,
        name: sh.name,
        activeCapital,
        ratio: Math.round(ratio * 100) / 100 // 2 decimal places
      };
    })
    .filter(item => item.activeCapital > 0 || item.ratio > 0);

  return {
    shareholders: results,
    totalCapital
  };
};

/**
 * 2. Income Statement (P&L) Engine
 */
export const getIncomeStatement = (companyId, periodType, periodVal) => {
  const incomes = getIncomes().filter(
    item => item.companyId === companyId &&
      isActivePostedRecord(item) &&
      !item.summaryOnly &&
      item.syncType !== 'receivable_opening' &&
      !String(item.remarks || '').includes('尚未核銷') &&
      !String(item.remarks || '').includes('欠款餘額') &&
      isDateInPeriod(item.date, periodType, periodVal)
  );
  
  const expenses = getExpenses().filter(
    item => item.companyId === companyId && isActivePostedRecord(item) && isDateInPeriod(item.date, periodType, periodVal)
  );

  const accounts = getChartOfAccounts();

  // Create lookup dictionary for accounts
  const accountMap = {};
  accounts.forEach(acc => {
    accountMap[acc.code] = acc;
  });

  // Aggregate Revenues by 4-digit main account
  const revenueItems = {};
  incomes.forEach(inc => {
    const originalCode = inc.accountCode || '';
    const mainCode = originalCode.length >= 4 ? originalCode.substring(0, 4) : originalCode;
    const acc = accountMap[mainCode] || accountMap[originalCode] || { name: '其他收入', type: 'revenue' };
    
    if (!revenueItems[mainCode]) {
      revenueItems[mainCode] = { code: mainCode, name: acc.name, amount: 0 };
    }
    revenueItems[mainCode].amount += inc.amount;
  });

  // Aggregate Expenses and COGS by 4-digit main account
  const cogsItems = {};
  const expenseItems = {};
  expenses.forEach(exp => {
    const originalCode = exp.accountCode || '';
    const isGasPurchaseInventory = originalCode === '5101';
    if (isGasPurchaseInventory) return;

    const mainCode = originalCode.length >= 4 ? originalCode.substring(0, 4) : originalCode;
    const acc = accountMap[mainCode] || accountMap[originalCode] || { name: '其他支出', type: 'expense' };
    
    const targetMap = acc.type === 'cogs' ? cogsItems : expenseItems;
    if (!targetMap[mainCode]) {
      targetMap[mainCode] = { code: mainCode, name: acc.name, amount: 0 };
    }
    targetMap[mainCode].amount += exp.amount;
  });

  const totalRevenue = Object.values(revenueItems).reduce((sum, i) => sum + i.amount, 0);
  const gasProfit = getGasGrossProfitForPeriod(companyId, periodType, periodVal);
  if (gasProfit.totalCogs > 0) {
    cogsItems.AUTO_GAS_COGS = {
      code: 'AUTO',
      name: '瓦斯銷貨成本（月加權平均）',
      amount: gasProfit.totalCogs
    };
  }
  const totalCogs = Object.values(cogsItems).reduce((sum, i) => sum + i.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses = Object.values(expenseItems).reduce((sum, i) => sum + i.amount, 0);
  const netProfit = grossProfit - totalExpenses;

  return {
    revenueItems: Object.values(revenueItems),
    cogsItems: Object.values(cogsItems),
    expenseItems: Object.values(expenseItems),
    totalRevenue,
    totalCogs,
    grossProfit,
    grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    gasProfit,
    totalExpenses,
    netProfit
  };
};

/**
 * 3. Bank Account Balances Engine
 * Calculates current cash and bank balances dynamically up to a date.
 */
export const getBankBalancesAtDate = (companyId, dateStr) => {
  const banks = getBanks().filter(b => b.companyId === companyId);
  const incomes = getIncomes().filter(i => i.companyId === companyId && i.date <= dateStr && i.status === 'approved' && isBankTransfer(i));
  const expenses = getExpenses().filter(e => e.companyId === companyId && e.date <= dateStr && e.status === 'approved' && isBankTransfer(e));
  const shLedger = getShareholderLedger().filter(s => s.companyId === companyId && s.date <= dateStr);
  const receivableSettlements = getBankTransactions().filter(item =>
    item.companyId === companyId &&
    isActiveSettlementReceipt(item) &&
    item.date <= dateStr
  );
  // Note: For simplicity, assume all shareholder investments/reductions went through BANK001/002/003 based on first bank found
  
  const balanceMap = {};
  banks.forEach(b => {
    balanceMap[b.id] = b.initialBalance;
  });

  // Add Approved Incomes
  incomes.forEach(i => {
    if (balanceMap[i.bankId] !== undefined) {
      balanceMap[i.bankId] += i.amount;
    }
  });

  // Subtract Approved Expenses
  expenses.forEach(e => {
    if (balanceMap[e.bankId] !== undefined) {
      balanceMap[e.bankId] -= e.amount;
    }
  });

  receivableSettlements.forEach(item => {
    if (balanceMap[item.bankId] !== undefined) {
      balanceMap[item.bankId] += Number(item.amount || 0);
    }
  });

  // Add/Subtract Shareholder investments
  // Default to the first bank of the company if not specified
  const primaryBankId = banks[0]?.id;
  shLedger.forEach(tx => {
    const bankId = tx.bankId || primaryBankId;
    if (balanceMap[bankId] !== undefined) {
      if (tx.type === 'join' || tx.type === 'increase') {
        balanceMap[bankId] += tx.amount;
      } else if (tx.type === 'decrease') {
        balanceMap[bankId] -= tx.amount;
      }
    }
  });

  return banks.map(b => ({
    ...b,
    currentBalance: balanceMap[b.id] || 0
  }));
};

/**
 * 4. Balance Sheet Engine
 */
export const getBalanceSheet = (companyId, dateStr) => {
  const bankBalances = getBankBalancesAtDate(companyId, dateStr);
  const totalCash = bankBalances.reduce((sum, b) => sum + b.currentBalance, 0);
  const gasInventory = getGasInventoryValuationAtDate(companyId, dateStr);
  const inventoryAsset = gasInventory.endingCost;

  // Fixed Assets (Non-current assets)
  const fixedAssetSummary = getFixedAssetSummary(companyId, dateStr);
  const fixedAssetsBookValue = fixedAssetSummary.totalBookValue;

  // Accounts Receivable (AR)
  const agingReport = getAgingReport(companyId, dateStr);
  const totalAR = agingReport.receivables.total;

  // Liabilities (Loans outstanding)
  const loans = getLoans().filter(l => l.companyId === companyId && l.startDate <= dateStr);
  // For simplicity, calculate loan remaining principal: 
  // Initial Principal - monthly repayments * months elapsed since start
  let loanLiabilities = 0;
  const loanDetails = loans.map(loan => {
    const start = new Date(loan.startDate);
    const end = new Date(dateStr);
    const monthsElapsed = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    
    // Total payments made
    const paidAmount = Math.min(loan.principal, monthsElapsed * (loan.monthlyPayment || 10000)); 
    const remainingPrincipal = loan.principal - paidAmount;
    loanLiabilities += remainingPrincipal;

    return {
      ...loan,
      remainingPrincipal
    };
  });

  // Accounts Payable (AP)
  const totalAP = agingReport.payables.total;

  const totalLiabilities = loanLiabilities + totalAP;

  // Equity
  // Paid-in Capital
  const equityCalc = getShareholderSharesAtDate(companyId, dateStr);
  const paidInCapital = equityCalc.totalCapital;

  const totalAssets = totalCash + inventoryAsset + fixedAssetsBookValue + totalAR;

  // Retained Earnings (Cumulative Net Profit up to this date)
  // Calculated as Assets - Liabilities - Paid-in Capital to ensure perfect balance
  const retainedEarnings = totalAssets - totalLiabilities - paidInCapital;
  const totalEquity = paidInCapital + retainedEarnings;

  // Balance Check (Accounting identity: Assets = Liabilities + Equity)
  const balancingAdjustment = 0;

  return {
    date: dateStr,
    assets: {
      banks: bankBalances,
      totalCash,
      inventoryAsset,
      gasInventory,
      fixedAssetsCost: fixedAssetSummary.totalCost,
      fixedAssetsAccumulatedDepreciation: fixedAssetSummary.totalAccumulatedDepreciation,
      fixedAssetsBookValue,
      totalAR,
      totalAssets
    },
    liabilities: {
      loans: loanDetails,
      loanLiabilities,
      totalAP,
      totalLiabilities
    },
    equity: {
      paidInCapital,
      retainedEarnings,
      balancingAdjustment,
      totalEquity
    }
  };
};

/**
 * 5. Dividend Distribution Generator
 */
export const getDividendsForMonth = (companyId, yearMonthStr, reserveRatio = 0.1) => {
  // Try to resolve saved reserveRatio from periodLocks
  let activeRatio = reserveRatio;
  const locks = getPeriodLocks();
  const match = locks.find(item => item.companyId === companyId && item.yearMonth === yearMonthStr);
  if (match && match.reserveRatio !== null && match.reserveRatio !== undefined) {
    activeRatio = match.reserveRatio;
  }

  // 1. Calculate P&L for this month
  const pnl = getIncomeStatement(companyId, 'month', yearMonthStr);
  const netProfit = pnl.netProfit;

  // 2. Get Shareholder percentages at the end of this month
  const lastDayOfMonth = getPeriodEndDate('month', yearMonthStr);
  const equity = getShareholderSharesAtDate(companyId, lastDayOfMonth);
  
  // 3. Calculate Dividends
  let totalDividends = 0;
  let reserveAmount = 0;
  let isLoss = netProfit <= 0;

  if (!isLoss) {
    reserveAmount = Math.round(netProfit * activeRatio);
    totalDividends = netProfit - reserveAmount;
  }

  const shareholderDividends = (equity.shareholders || []).map(sh => {
    const dividend = isLoss ? 0 : Math.round(totalDividends * (sh.ratio / 100));
    return {
      ...sh,
      id: sh.shareholderId || sh.id,
      shareholderId: sh.shareholderId || sh.id,
      name: sh.name,
      ratio: sh.ratio,
      shareRatio: (sh.ratio || 0) / 100,
      dividend,
      dividendAmount: dividend
    };
  });

  return {
    yearMonth: yearMonthStr,
    netProfit,
    isLoss,
    reserveRatio: activeRatio,
    reserveAmount,
    totalDividends,
    distributableAmount: totalDividends,
    shareholderDividends,
    shareholders: shareholderDividends
  };
};

export const getDividendsForPeriod = (companyId, periodType, periodVal, reserveRatio = 0.1) => {
  // Try to resolve saved reserveRatio from periodLocks
  let activeRatio = reserveRatio;
  if (periodType === 'month') {
    const locks = getPeriodLocks();
    const match = locks.find(item => item.companyId === companyId && item.yearMonth === periodVal);
    if (match && match.reserveRatio !== null && match.reserveRatio !== undefined) {
      activeRatio = match.reserveRatio;
    }
  }

  const pnl = getIncomeStatement(companyId, periodType, periodVal);
  const netProfit = pnl.netProfit;
  const endDate = getPeriodEndDate(periodType, periodVal);
  const equity = getShareholderSharesAtDate(companyId, endDate);

  let totalDividends = 0;
  let reserveAmount = 0;
  const isLoss = netProfit <= 0;

  if (!isLoss) {
    reserveAmount = Math.round(netProfit * activeRatio);
    totalDividends = netProfit - reserveAmount;
  }

  const shareholderDividends = equity.shareholders.map(sh => ({
    ...sh,
    dividend: isLoss ? 0 : Math.round(totalDividends * (sh.ratio / 100))
  }));

  return {
    yearMonth: getPeriodLabel(periodType, periodVal),
    netProfit,
    isLoss,
    reserveRatio: activeRatio,
    reserveAmount,
    totalDividends,
    shareholderDividends
  };
};

/**
 * 6. Generate LINE Sharing Text
 */
export const generateLineShareText = (companyName, divData) => {
  const label = divData.yearMonth?.includes('-') && divData.yearMonth.length === 7
    ? `${divData.yearMonth.split('-')[0]}年${parseInt(divData.yearMonth.split('-')[1], 10)}月份`
    : divData.yearMonth;
  let text = `📢 【${companyName}】${label} 股東分紅明細\n`;
  text += `=========================\n`;
  text += `📊 本月營運成果：\n`;
  text += `  - 淨利潤：$${divData.netProfit.toLocaleString()}\n`;
  
  if (divData.isLoss) {
    text += `  - 說明：因本月無盈餘/虧損，故不執行分紅分配。\n`;
  } else {
    text += `  - 提撥公積金 (${divData.reserveRatio * 100}%)：$${divData.reserveAmount.toLocaleString()}\n`;
    text += `  - 可分配紅利：$${divData.totalDividends.toLocaleString()}\n`;
    text += `=========================\n`;
    text += `💰 股東分紅明細：\n`;
    divData.shareholderDividends.forEach(sh => {
      text += `  👤 ${sh.name} (${sh.ratio}%)：$${sh.dividend.toLocaleString()}\n`;
    });
  }
  
  text += `=========================\n`;
  text += `💡 本報表由 BusinessPilot ERP 自動生成。`;
  return text;
};

/**
 * 7. Materials & Parts Gross Profit Report
 */
export const getPartsGrossProfitReport = (companyId, periodType, periodVal) => {
  const allAccounts = getChartOfAccounts();
  const allIncomes = getIncomes().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    isDateInPeriod(item.date, periodType, periodVal)
  );

  const allExpenses = getExpenses().filter(item =>
    item.companyId === companyId &&
    item.status === 'approved' &&
    isDateInPeriod(item.date, periodType, periodVal)
  );

  // Find all 5102 sub-accounts
  const cogs5102 = allAccounts.filter(a => a.code.startsWith('5102') && a.code !== '5102');

  const rows = cogs5102.map(cogsAcc => {
    // Extract suffix
    const suffix = cogsAcc.code.replace('5102', '');
    const revenueCode = '4104' + suffix;
    const revAcc = allAccounts.find(a => a.code === revenueCode) || null;

    // Filter transactions
    const itemIncomes = allIncomes.filter(i => i.accountCode === revenueCode);
    const itemExpenses = allExpenses.filter(e => e.accountCode === cogsAcc.code);

    // Sum quantities & amounts
    const salesQty = itemIncomes.reduce((sum, i) => sum + Number(i.quantity || i.cylinderQty || 0), 0);
    const salesRevenue = itemIncomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);

    const purchaseQty = itemExpenses.reduce((sum, e) => sum + Number(e.quantity || e.cylinderQty || 0), 0);
    const purchaseCost = itemExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const grossProfit = salesRevenue - purchaseCost;
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

    // Determine subGroup category name
    let groupName = (cogsAcc.subGroup || revAcc?.subGroup || '').trim();
    if (!groupName) {
      const searchStr = `${cogsAcc.name} ${cogsAcc.desc || ''}`;
      if (searchStr.includes('爐具') || searchStr.includes('爐')) {
        groupName = '爐具類';
      } else if (searchStr.includes('調整器') || searchStr.includes('中壓') || searchStr.includes('低壓')) {
        groupName = '調整器類';
      } else if (searchStr.includes('熱水器')) {
        groupName = '熱水器類';
      } else {
        groupName = '其他零件類';
      }
    }

    return {
      cogsCode: cogsAcc.code,
      revenueCode: revenueCode,
      name: cogsAcc.name,
      subGroup: groupName,
      salesQty,
      salesRevenue,
      purchaseQty,
      purchaseCost,
      grossProfit,
      grossMargin
    };
  });

  return rows;
};
