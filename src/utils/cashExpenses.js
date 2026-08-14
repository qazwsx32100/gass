const isActiveApprovedRecord = (item) => (
  item?.status === 'approved' &&
  item.correctionStatus !== 'corrected' &&
  item.correctionType !== 'reversal'
);

const isActiveSettlement = (item) => (
  item?.status !== 'void' &&
  item?.correctionStatus !== 'corrected' &&
  item?.correctionType !== 'reversal'
);

const isDirectlyPaidExpense = (item) => (
  isActiveApprovedRecord(item) &&
  item.paymentStatus !== 'unpaid' &&
  item.paymentMethod !== 'payable' &&
  !item.settlementId
);

const isPayableSettlement = (item) => (
  isActiveSettlement(item) &&
  item.direction === 'out' &&
  item.sourceType === 'settlement'
);

export const calculateCashExpenses = ({
  expenses = [],
  bankTransactions = [],
  isDateIncluded = () => true
} = {}) => {
  const directExpenseEntries = expenses
    .filter(item => isDirectlyPaidExpense(item) && isDateIncluded(item.date))
    .map(item => ({ ...item, recognitionType: 'direct_expense', recognitionDate: item.date }));

  const settlementEntries = bankTransactions
    .filter(item => isPayableSettlement(item) && isDateIncluded(item.date))
    .map(item => ({ ...item, recognitionType: 'payable_settlement', recognitionDate: item.date }));

  const entries = [...directExpenseEntries, ...settlementEntries]
    .sort((a, b) => String(b.recognitionDate || '').localeCompare(String(a.recognitionDate || '')));

  return {
    entries,
    directExpenseAmount: directExpenseEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    settlementAmount: settlementEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    totalExpenses: entries.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
};
