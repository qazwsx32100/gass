export const calculateDividendReserve = (netProfit, reserveRatio = 0.1, reserveAmountOverride = null) => {
  const profit = Math.max(0, Number(netProfit || 0));
  const ratio = Math.max(0, Math.min(1, Number(reserveRatio || 0)));
  const hasAmountOverride = reserveAmountOverride !== null && reserveAmountOverride !== undefined;
  const requestedAmount = Math.max(0, Number(reserveAmountOverride || 0));
  const reserveAmount = hasAmountOverride
    ? Math.min(profit, Math.round(requestedAmount))
    : Math.round(profit * ratio);

  return {
    reserveAmount,
    reserveRatio: profit > 0 ? reserveAmount / profit : 0,
    reserveMode: hasAmountOverride ? 'amount' : 'ratio',
    totalDividends: profit - reserveAmount
  };
};
