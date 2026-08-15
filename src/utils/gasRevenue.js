export const isGasRevenueEntry = item => (
  Number(item?.gasKg || 0) > 0 ||
  (
    item?.summaryOnly === true &&
    ['daily_summary_monthly', 'daily_summary_debt'].includes(item?.syncType)
  )
);
