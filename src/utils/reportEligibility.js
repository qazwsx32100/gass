const SUPERSEDED_STATUSES = new Set(['corrected', 'superseded']);
const NON_REPORTABLE_CORRECTION_TYPES = new Set(['reversal', 'void']);

/**
 * The single ledger rule used by reports, cash calculations, bank balances,
 * and dividends. Collection status does not determine whether a sale/expense
 * happened; it only affects the cash-basis views.
 */
export const isEffectiveForReport = (item = {}) => {
  const status = item.status || 'approved';
  const derivedEligibility = status === 'approved' &&
    !SUPERSEDED_STATUSES.has(String(item.correctionStatus || '').toLowerCase()) &&
    !NON_REPORTABLE_CORRECTION_TYPES.has(String(item.correctionType || '').toLowerCase());
  return derivedEligibility && (item.effectiveForReport === undefined || item.effectiveForReport === true);
};

export const normalizeReportEligibility = (item = {}) => {
  const normalized = { ...item };
  if (normalized.correctionStatus === 'corrected' && !normalized.correctionType) {
    normalized.correctionType = 'superseded';
  }
  if (normalized.correctionType && !normalized.correctionStatus) {
    normalized.correctionStatus = normalized.status === 'approved'
      ? 'applied'
      : normalized.status === 'void' ? 'void' : 'pending';
  }
  delete normalized.effectiveForReport;
  normalized.effectiveForReport = isEffectiveForReport(normalized);
  return normalized;
};
