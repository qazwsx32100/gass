const SYSTEM_ESTIMATE_MARKERS = new Set([
  'estimate',
  'estimated',
  'system_estimate',
  'system_estimated',
  'gas_cost_estimate',
  'inventory_cost_estimate'
]);

// Only explicit system estimates are excluded from cash expenses. A normal 5101
// voucher is a real, manually entered gas purchase and must remain in expenses.
export const isSystemEstimatedExpenseEntry = (item = {}) => {
  if (item.isEstimated === true || item.systemEstimated === true) return true;
  return [item.sourceType, item.syncType, item.entryType]
    .map(value => String(value || '').trim().toLowerCase())
    .some(value => SYSTEM_ESTIMATE_MARKERS.has(value));
};

export const isManualGasCostExpenseEntry = (item = {}) => (
  String(item.accountCode || '').startsWith('5101') &&
  !isSystemEstimatedExpenseEntry(item)
);

// Dividend payments are distributions of retained earnings. They reduce cash
// and equity, but are not operating expenses and must not reduce net profit a
// second time.
export const isShareholderDistributionEntry = (item = {}) => (
  String(item.accountCode || '').startsWith('6110') ||
  String(item.entryNature || '').trim().toLowerCase() === 'equity_distribution'
);
