import { isActiveSettlementReceipt } from './receivables.js';

const isActiveApprovedRecord = (item) => (
  (!item?.status || item.status === 'approved') &&
  item.correctionStatus !== 'corrected' &&
  item.correctionType !== 'reversal'
);

const isDirectlyCollectedIncome = (item) => (
  isActiveApprovedRecord(item) &&
  item.paymentStatus !== 'unpaid' &&
  item.paymentMethod !== 'receivable' &&
  !item.settlementId
);

export const calculateCashRevenue = ({
  incomes = [],
  bankTransactions = [],
  isDateIncluded = () => true
} = {}) => {
  const directIncomeEntries = incomes
    .filter(item => isDirectlyCollectedIncome(item) && isDateIncluded(item.date))
    .map(item => ({ ...item, recognitionType: 'direct_income', recognitionDate: item.date }));

  const settlementEntries = bankTransactions
    .filter(item => isActiveSettlementReceipt(item))
    .map(item => ({
      ...item,
      recognitionType: 'receivable_settlement',
      recognitionDate: item.actualPaymentDate || item.date
    }))
    .filter(item => isDateIncluded(item.recognitionDate));

  const entries = [...directIncomeEntries, ...settlementEntries]
    .sort((a, b) => String(b.recognitionDate || '').localeCompare(String(a.recognitionDate || '')));

  return {
    entries,
    directIncomeAmount: directIncomeEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    settlementAmount: settlementEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    totalRevenue: entries.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
};
