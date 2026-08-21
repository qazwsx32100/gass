const PAYMENT_METHOD_LABELS = {
  cash: '現金',
  bank_transfer: '銀行轉帳',
  check: '支票',
  receivable: '應收款',
  payable: '應付款',
  other: '其他'
};

const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('zh-TW')
  .replace(/\s+/g, ' ')
  .trim();

// Ledger periods always follow the date on which the transaction actually
// occurred. `payrollMonth` is descriptive payroll metadata only; using it as
// the ledger month can move a July expense into the August expense list.
const getTransactionMonth = (item) => String(item?.date || '').slice(0, 7);

export const filterLedgerTransactions = (items = [], options = {}) => {
  const {
    query = '',
    yearMonth = '',
    allMonths = false,
    accountNames = {}
  } = options;

  const keywords = normalizeSearchText(query).split(' ').filter(Boolean);

  return items.filter(item => {
    if (!allMonths && yearMonth && getTransactionMonth(item) !== yearMonth) return false;
    if (keywords.length === 0) return true;

    const paymentMethod = item.paymentMethod || (item.bankId ? 'bank_transfer' : 'cash');
    const accountCode = String(item.accountCode || '');
    const parentAccountCode = accountCode.length > 4 ? accountCode.slice(0, 4) : '';
    const searchableText = normalizeSearchText([
      item.id,
      item.date,
      accountCode,
      accountNames[accountCode],
      parentAccountCode,
      accountNames[parentAccountCode],
      item.employeeName,
      item.payrollMonth,
      item.counterpartyName,
      item.customerName,
      item.supplierName,
      item.createdByName,
      item.remarks,
      item.checkNo,
      PAYMENT_METHOD_LABELS[paymentMethod],
      paymentMethod
    ].filter(Boolean).join(' '));

    return keywords.every(keyword => searchableText.includes(keyword));
  });
};

export const summarizeLedgerTransactions = (items = []) => ({
  count: items.length,
  excludedCount: items.filter(item => item.status === 'void').length,
  amount: items
    .filter(item => item.status !== 'void')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
});
