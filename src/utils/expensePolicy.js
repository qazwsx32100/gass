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
