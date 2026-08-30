import { isSystemEstimatedExpenseEntry } from './expensePolicy.js';

const FIXED_ACCOUNT_PREFIXES = ['6101', '6102', '6201'];
const FIXED_COST_KEYWORDS = [
  '薪資', '工資', '薪水', '店租', '房租', '租金',
  '勞保', '健保', '勞退', '退休金', '保險費',
  '電話費', '電信費', '網路費', '寬頻費', '折舊費',
  '會計費', '記帳費'
];
const VARIABLE_COST_KEYWORDS = ['維修', '修繕', '保養', '油資', '燃料', '餐飲', '耗材'];
const GAS_PURCHASE_KEYWORDS = ['進氣成本', '瓦斯進貨', '瓦斯進氣', '進貨瓦斯', '瓦斯採購'];

const numberValue = value => Number(value || 0);

const expenseSearchText = (expense, accountName = '') => [
  accountName,
  expense?.remarks,
  expense?.category,
  expense?.description,
  expense?.projectName
].map(value => String(value || '').trim()).join(' ');

export const isGasInventoryPurchaseExpense = (expense = {}, accountName = '') => {
  if (String(expense.accountCode || '') === '5101') return true;
  const text = expenseSearchText(expense, accountName);
  return GAS_PURCHASE_KEYWORDS.some(keyword => text.includes(keyword));
};

export const isFixedOperatingExpense = (expense = {}, accountName = '') => {
  const explicitType = String(
    expense.costBehavior || expense.costType || expense.expenseNature || ''
  ).trim().toLowerCase();
  if (['fixed', 'fixed_cost', '固定', '固定成本'].includes(explicitType)) return true;
  if (['variable', 'variable_cost', '變動', '變動成本'].includes(explicitType)) return false;

  const text = expenseSearchText(expense, accountName);
  if (VARIABLE_COST_KEYWORDS.some(keyword => text.includes(keyword))) return false;

  const accountCode = String(expense.accountCode || '');
  if (FIXED_ACCOUNT_PREFIXES.some(prefix => accountCode.startsWith(prefix))) return true;
  return FIXED_COST_KEYWORDS.some(keyword => text.includes(keyword));
};

const parseDateKey = dateKey => {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateKey = date => date.toISOString().slice(0, 10);

const getPeriodDateKeys = (periodType, periodValue) => {
  if (periodType === 'date') return [String(periodValue || '')].filter(Boolean);

  let startKey;
  let endKey;
  if (periodType === 'month') {
    const [year, month] = String(periodValue || '').split('-').map(Number);
    if (!year || !month) return [];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    startKey = `${year}-${String(month).padStart(2, '0')}-01`;
    endKey = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    startKey = periodValue?.startDate;
    endKey = periodValue?.endDate;
  }

  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || start > end) return [];

  const dates = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    dates.push(formatDateKey(cursor));
  }
  return dates;
};

const getDaysInMonth = monthKey => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  return year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
};

const isActiveExpense = expense => (
  (!expense.status || expense.status === 'approved') &&
  expense.correctionStatus !== 'corrected' &&
  expense.correctionType !== 'reversal'
);

export const calculateOperatingProfit = ({
  companyExpenses = [],
  activeExpenses = [],
  chartOfAccounts = [],
  periodType,
  periodValue,
  totalRevenue = 0,
  gasSalesAmount = 0,
  gasGrossProfit = 0
}) => {
  const accountNames = new Map(chartOfAccounts.map(account => [account.code, account.name || '']));
  const selectedDaysByMonth = new Map();
  getPeriodDateKeys(periodType, periodValue).forEach(dateKey => {
    const monthKey = dateKey.slice(0, 7);
    selectedDaysByMonth.set(monthKey, (selectedDaysByMonth.get(monthKey) || 0) + 1);
  });

  const fixedExpenseDetails = companyExpenses
    .filter(isActiveExpense)
    .filter(expense => selectedDaysByMonth.has(String(expense.date || '').slice(0, 7)))
    .filter(expense => !isSystemEstimatedExpenseEntry(expense))
    .filter(expense => !isGasInventoryPurchaseExpense(expense, accountNames.get(expense.accountCode)))
    .filter(expense => isFixedOperatingExpense(expense, accountNames.get(expense.accountCode)))
    .map(expense => {
      const monthKey = String(expense.date || '').slice(0, 7);
      const selectedDays = selectedDaysByMonth.get(monthKey) || 0;
      const daysInMonth = getDaysInMonth(monthKey);
      const amount = numberValue(expense.amount ?? expense.calculatedAmount);
      return {
        ...expense,
        accountName: accountNames.get(expense.accountCode) || '其他固定支出',
        amount,
        selectedDays,
        daysInMonth,
        allocatedAmount: daysInMonth > 0 ? amount * selectedDays / daysInMonth : 0
      };
    });

  const variableExpenseDetails = activeExpenses
    .filter(isActiveExpense)
    .filter(expense => !isSystemEstimatedExpenseEntry(expense))
    .filter(expense => !isGasInventoryPurchaseExpense(expense, accountNames.get(expense.accountCode)))
    .filter(expense => !isFixedOperatingExpense(expense, accountNames.get(expense.accountCode)))
    .map(expense => ({
      ...expense,
      accountName: accountNames.get(expense.accountCode) || '其他變動支出',
      amount: numberValue(expense.amount ?? expense.calculatedAmount)
    }));

  const fixedCostAllocated = fixedExpenseDetails.reduce((sum, item) => sum + item.allocatedAmount, 0);
  const variableExpenses = variableExpenseDetails.reduce((sum, item) => sum + item.amount, 0);
  const gasCost = Math.max(0, numberValue(gasSalesAmount) - numberValue(gasGrossProfit));
  const operatingProfit = numberValue(totalRevenue) - gasCost - variableExpenses - fixedCostAllocated;
  const operatingMargin = numberValue(totalRevenue) === 0
    ? 0
    : operatingProfit / numberValue(totalRevenue) * 100;

  return {
    totalRevenue: numberValue(totalRevenue),
    gasCost,
    variableExpenses,
    fixedCostAllocated,
    operatingProfit,
    operatingMargin,
    fixedExpenseDetails,
    variableExpenseDetails
  };
};
