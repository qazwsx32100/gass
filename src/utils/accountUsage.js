import { findParentAccount } from './accountHierarchy.js';

export const getAccountUsage = (accountCode, {
  incomes = [],
  expenses = [],
  budgets = [],
  accounts = []
} = {}) => {
  const code = String(accountCode || '');
  const count = list => list.filter(item => String(item?.accountCode || '') === code).length;
  const childCount = accounts.filter(item => item?.code !== code && findParentAccount(item, accounts)?.code === code).length;
  const incomeCount = count(incomes);
  const expenseCount = count(expenses);
  const budgetCount = count(budgets);
  return {
    incomeCount,
    expenseCount,
    budgetCount,
    childCount,
    transactionCount: incomeCount + expenseCount,
    isUsed: incomeCount + expenseCount + budgetCount > 0,
    canDelete: incomeCount + expenseCount + budgetCount + childCount === 0
  };
};

export const activeAccountsOnly = account => account?.disabled !== true;
