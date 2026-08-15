export const RECEIVABLE_TYPES = Object.freeze({
  MONTHLY: 'monthly',
  CURRENT_DEBT: 'current_debt',
  OTHER: 'other'
});

const asNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const isApproved = (item) => !item?.status || item.status === 'approved';

export const getReceivableType = (item = {}) => {
  if (Object.values(RECEIVABLE_TYPES).includes(item.receivableType)) return item.receivableType;

  const remarks = String(item.remarks || '');
  if (remarks.includes('當日營業彙總 - 月結')) return RECEIVABLE_TYPES.MONTHLY;
  if (remarks.includes('當日營業彙總 - 賒欠')) return RECEIVABLE_TYPES.CURRENT_DEBT;
  if (item.paymentMethod === 'receivable') return RECEIVABLE_TYPES.MONTHLY;
  return RECEIVABLE_TYPES.OTHER;
};

export const getSettlementType = (item = {}) => {
  if (Object.values(RECEIVABLE_TYPES).includes(item.settlementCategory)) return item.settlementCategory;
  if (Object.values(RECEIVABLE_TYPES).includes(item.receivableType)) return item.receivableType;

  const remarks = String(item.remarks || '');
  if (remarks.includes('月結收款')) return RECEIVABLE_TYPES.MONTHLY;
  if (remarks.includes('當日營業彙總 - 還款') || remarks.includes('現結欠款還款')) {
    return RECEIVABLE_TYPES.CURRENT_DEBT;
  }
  return null;
};

export const resolveSettlementType = (item = {}, sourceIncome = null) => {
  const explicitType = getSettlementType(item);
  if (explicitType) return explicitType;
  if (sourceIncome) return getReceivableType(sourceIncome);

  // Legacy per-record settlements did not store a category. That workflow
  // collected current customer debt, so preserve its original meaning.
  if (item.sourceType === 'settlement' && item.direction === 'in') {
    return RECEIVABLE_TYPES.CURRENT_DEBT;
  }
  return null;
};

export const isActiveSettlementReceipt = (item = {}) => (
  isApproved(item) &&
  item.correctionStatus !== 'corrected' &&
  item.correctionType !== 'reversal' &&
  item.direction === 'in' &&
  item.sourceType === 'settlement'
);

const isLegacyImportedSettlement = (item = {}) => (
  item.syncSource === 'shenglong' || String(item.id || '').startsWith('SL-SYNC-SET-')
);

const getMonthKey = value => String(value || '').slice(0, 7);

/**
 * Expands one cash receipt into the receivable periods it settles.
 *
 * The cash date remains `actualPaymentDate`, while `attributionDate` points
 * to the original customer charge. This lets July operating reports include
 * a July receivable collected in August without changing the real cash date.
 */
export const expandSettlementAttributions = ({ settlements = [], incomes = [] } = {}) => {
  const incomeById = new Map(incomes.filter(Boolean).map(item => [item.id, item]));

  return settlements.flatMap(settlement => {
    if (!settlement) return [];
    const actualPaymentDate = settlement.actualPaymentDate || settlement.date || '';
    const allocations = Array.isArray(settlement.receivableAllocations)
      ? settlement.receivableAllocations.filter(item => asNumber(item?.amount) > 0)
      : [];

    if (allocations.length > 0) {
      return allocations.map((allocation, index) => {
        const sourceIncome = incomeById.get(allocation.incomeId);
        const attributionDate = allocation.attributionDate
          || sourceIncome?.date
          || (allocation.originMonth ? `${allocation.originMonth}-01` : '')
          || settlement.attributionDate
          || settlement.date
          || '';
        return {
          ...settlement,
          id: `${settlement.id || 'SETTLEMENT'}::${allocation.incomeId || index}`,
          sourceSettlementId: settlement.id || null,
          sourceIncomeId: allocation.incomeId || sourceIncome?.id || null,
          amount: asNumber(allocation.amount),
          attributionDate,
          attributionMonth: getMonthKey(attributionDate),
          actualPaymentDate
        };
      });
    }

    const sourceIncome = incomeById.get(settlement.sourceId || settlement.incomeId);
    const attributionDate = settlement.attributionDate
      || sourceIncome?.date
      || settlement.date
      || '';
    return [{
      ...settlement,
      sourceSettlementId: settlement.id || null,
      sourceIncomeId: sourceIncome?.id || settlement.sourceId || settlement.incomeId || null,
      attributionDate,
      attributionMonth: getMonthKey(attributionDate),
      actualPaymentDate
    }];
  });
};

const applyAmountToRow = (row, amount) => {
  const applied = Math.min(row.outstandingAmount, Math.max(0, asNumber(amount)));
  row.settledAmount += applied;
  row.outstandingAmount -= applied;
  return applied;
};

/**
 * Builds receivable balances without mixing their origin months.
 *
 * Shenglong imports contain two different datasets: `receivable_opening`
 * rows are the remaining open items, while `SL-SYNC-SET-*` rows are already
 * collected items. Applying the imported settlements to the opening rows a
 * second time is what previously made July reduce August (and vice versa).
 */
export const calculateReceivablesByOriginMonth = ({
  companyId,
  asOfDate,
  originMonth,
  incomes = [],
  bankTransactions = []
} = {}) => {
  const allRows = incomes
    .filter(item =>
      item?.companyId === companyId &&
      isApproved(item) &&
      item.correctionStatus !== 'corrected' &&
      item.correctionType !== 'reversal' &&
      item.paymentStatus === 'unpaid' &&
      (!asOfDate || String(item.date || '') <= asOfDate)
    )
    .map(item => ({
      ...item,
      originMonth: getMonthKey(item.date),
      receivableType: getReceivableType(item),
      originalAmount: asNumber(item.amount),
      settledAmount: 0,
      outstandingAmount: asNumber(item.amount)
    }))
    .sort((a, b) => `${a.date || ''}:${a.id || ''}`.localeCompare(`${b.date || ''}:${b.id || ''}`));

  const rowsById = new Map(allRows.map(row => [row.id, row]));
  const activeSettlements = bankTransactions
    .filter(item =>
      item?.companyId === companyId &&
      isActiveSettlementReceipt(item) &&
      !isLegacyImportedSettlement(item) &&
      (!asOfDate || String(item.actualPaymentDate || item.date || '') <= asOfDate)
    )
    .sort((a, b) => `${a.actualPaymentDate || a.date || ''}:${a.id || ''}`.localeCompare(`${b.actualPaymentDate || b.date || ''}:${b.id || ''}`));

  for (const settlement of activeSettlements) {
    const allocations = Array.isArray(settlement.receivableAllocations)
      ? settlement.receivableAllocations
      : [];

    if (allocations.length > 0) {
      allocations.forEach(allocation => {
        const row = rowsById.get(allocation.incomeId);
        if (row) applyAmountToRow(row, allocation.amount);
      });
      continue;
    }

    const sourceIncomeId = settlement.sourceId || settlement.incomeId;
    if (sourceIncomeId && rowsById.has(sourceIncomeId)) {
      applyAmountToRow(rowsById.get(sourceIncomeId), settlement.amount);
      continue;
    }

    // Compatibility for older native aggregate settlements. Allocate FIFO,
    // but keep each row's own originMonth so reports remain month-separated.
    const type = resolveSettlementType(settlement, null);
    let remaining = asNumber(settlement.amount);
    for (const row of allRows) {
      if (remaining <= 0) break;
      if (row.receivableType !== type || row.outstandingAmount <= 0) continue;
      remaining -= applyAmountToRow(row, remaining);
    }
  }

  const selectedRows = originMonth
    ? allRows.filter(row => row.originMonth === originMonth)
    : allRows;
  const makeSummary = type => {
    const rows = selectedRows.filter(row => row.receivableType === type);
    return {
      type,
      originalAmount: rows.reduce((sum, row) => sum + row.originalAmount, 0),
      settledAmount: rows.reduce((sum, row) => sum + row.settledAmount, 0),
      outstandingAmount: rows.reduce((sum, row) => sum + row.outstandingAmount, 0),
      rows
    };
  };
  const monthly = makeSummary(RECEIVABLE_TYPES.MONTHLY);
  const currentDebt = makeSummary(RECEIVABLE_TYPES.CURRENT_DEBT);
  const other = makeSummary(RECEIVABLE_TYPES.OTHER);
  const rows = selectedRows.filter(row => row.outstandingAmount > 0);

  return {
    asOfDate: asOfDate || null,
    originMonth: originMonth || null,
    monthly,
    currentDebt,
    other,
    rows,
    total: {
      originalAmount: monthly.originalAmount + currentDebt.originalAmount + other.originalAmount,
      settledAmount: monthly.settledAmount + currentDebt.settledAmount + other.settledAmount,
      outstandingAmount: monthly.outstandingAmount + currentDebt.outstandingAmount + other.outstandingAmount
    }
  };
};

export const buildReceivableSettlementAllocations = ({
  companyId,
  asOfDate,
  type,
  amount,
  incomes = [],
  bankTransactions = []
} = {}) => {
  const summary = calculateReceivablesByOriginMonth({
    companyId,
    asOfDate,
    incomes,
    bankTransactions
  });
  const rows = (summary[type === RECEIVABLE_TYPES.CURRENT_DEBT ? 'currentDebt' : 'monthly']?.rows || [])
    .filter(row => row.outstandingAmount > 0);
  const allocations = [];
  let remaining = asNumber(amount);

  for (const row of rows) {
    if (remaining <= 0) break;
    const applied = Math.min(row.outstandingAmount, remaining);
    allocations.push({ incomeId: row.id, originMonth: row.originMonth, amount: applied });
    remaining -= applied;
  }

  return { allocations, unallocatedAmount: Math.max(0, remaining), summary };
};

const createTypeSummary = (type) => ({
  type,
  originalAmount: 0,
  settledAmount: 0,
  outstandingAmount: 0,
  rows: []
});

export const calculateAggregateReceivables = ({
  companyId,
  asOfDate,
  incomes = [],
  bankTransactions = []
} = {}) => {
  const summaries = {
    [RECEIVABLE_TYPES.MONTHLY]: createTypeSummary(RECEIVABLE_TYPES.MONTHLY),
    [RECEIVABLE_TYPES.CURRENT_DEBT]: createTypeSummary(RECEIVABLE_TYPES.CURRENT_DEBT),
    [RECEIVABLE_TYPES.OTHER]: createTypeSummary(RECEIVABLE_TYPES.OTHER)
  };

  const receivableRows = incomes
    .filter(item =>
      item?.companyId === companyId &&
      isApproved(item) &&
      item.paymentStatus === 'unpaid' &&
      (!asOfDate || String(item.date || '') <= asOfDate)
    )
    .map(item => ({
      ...item,
      receivableType: getReceivableType(item),
      originalAmount: asNumber(item.amount),
      settledAmount: 0,
      outstandingAmount: asNumber(item.amount)
    }))
    .sort((a, b) => `${a.date || ''}:${a.id || ''}`.localeCompare(`${b.date || ''}:${b.id || ''}`));

  for (const row of receivableRows) {
    const summary = summaries[row.receivableType] || summaries[RECEIVABLE_TYPES.OTHER];
    summary.originalAmount += row.originalAmount;
    summary.rows.push(row);
  }

  const settlementTotals = {
    [RECEIVABLE_TYPES.MONTHLY]: 0,
    [RECEIVABLE_TYPES.CURRENT_DEBT]: 0,
    [RECEIVABLE_TYPES.OTHER]: 0
  };
  const incomeById = new Map(incomes.map(item => [item?.id, item]));

  for (const item of bankTransactions) {
    if (item?.companyId !== companyId || item.direction !== 'in' || item.sourceType !== 'settlement') continue;
    if (!isApproved(item) || (asOfDate && String(item.date || '') > asOfDate)) continue;

    // Shenglong opening rows already represent the net amount that is still
    // outstanding. Its imported historical collections are kept for cash-flow
    // reporting only; subtracting them here again would turn a real balance
    // (for example $3,755) into zero.
    if (isLegacyImportedSettlement(item)) continue;

    // A per-record settlement also marks its source income as paid. That source
    // is already absent from receivableRows, so applying the settlement again
    // would reduce the remaining customer debt twice.
    const sourceIncome = item.sourceId ? incomeById.get(item.sourceId) : null;
    if (sourceIncome && sourceIncome.paymentStatus !== 'unpaid') continue;

    const type = resolveSettlementType(item, sourceIncome);
    if (!type) continue;
    settlementTotals[type] += asNumber(item.amount);
  }

  let unmatchedSettlementAmount = 0;
  for (const type of Object.values(RECEIVABLE_TYPES)) {
    const summary = summaries[type];
    let remainingSettlement = settlementTotals[type];

    for (const row of summary.rows) {
      const applied = Math.min(row.outstandingAmount, remainingSettlement);
      row.settledAmount = applied;
      row.outstandingAmount -= applied;
      remainingSettlement -= applied;
      if (remainingSettlement <= 0) break;
    }

    summary.settledAmount = settlementTotals[type] - Math.max(0, remainingSettlement);
    summary.outstandingAmount = summary.rows.reduce((sum, row) => sum + row.outstandingAmount, 0);
    unmatchedSettlementAmount += Math.max(0, remainingSettlement);
  }

  const rows = Object.values(summaries)
    .flatMap(summary => summary.rows)
    .filter(row => row.outstandingAmount > 0)
    .sort((a, b) => `${a.date || ''}:${a.id || ''}`.localeCompare(`${b.date || ''}:${b.id || ''}`));

  return {
    asOfDate: asOfDate || null,
    monthly: summaries[RECEIVABLE_TYPES.MONTHLY],
    currentDebt: summaries[RECEIVABLE_TYPES.CURRENT_DEBT],
    other: summaries[RECEIVABLE_TYPES.OTHER],
    rows,
    total: {
      originalAmount: Object.values(summaries).reduce((sum, item) => sum + item.originalAmount, 0),
      settledAmount: Object.values(summaries).reduce((sum, item) => sum + item.settledAmount, 0),
      outstandingAmount: Object.values(summaries).reduce((sum, item) => sum + item.outstandingAmount, 0)
    },
    unmatchedSettlementAmount
  };
};
