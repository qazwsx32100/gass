const isActiveOperatingRevenue = item => (
  item?.status === 'approved' &&
  item.correctionStatus !== 'corrected' &&
  item.correctionType !== 'reversal'
);

export const selectMonthlyOperatingRevenueEntries = ({ incomes = [], companyId, yearMonth }) => (
  incomes.filter(item =>
    item?.companyId === companyId &&
    isActiveOperatingRevenue(item) &&
    String(item.date || '').startsWith(yearMonth) &&
    item.syncType !== 'receivable_opening' &&
    !String(item.remarks || '').includes('尚未核銷') &&
    !String(item.remarks || '').includes('欠款餘額')
  )
);
