export const FINANCIAL_REPORT_START_DATE = '2026-07-01';

export const getRepaymentOriginDate = (transaction, incomes = []) => {
  if (!transaction) return '';
  const explicitDate = transaction.debtOriginDate || transaction.receivableDate || transaction.originalDebtDate;
  if (explicitDate) return explicitDate;
  if (!transaction.sourceId) return '';
  return incomes.find(item => item.id === transaction.sourceId)?.date || '';
};

export const isReportableRepayment = (transaction, incomes = []) => {
  const originDate = getRepaymentOriginDate(transaction, incomes);
  return Boolean(originDate && originDate >= FINANCIAL_REPORT_START_DATE);
};
