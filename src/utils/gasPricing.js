const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const applyMonthlyGasPrice = ({
  purchases = [],
  companyId,
  yearMonth,
  monthlyGasPrice,
  updatedAt = new Date().toISOString()
}) => {
  const price = Math.max(0, toNumber(monthlyGasPrice));
  const changed = [];
  let purchaseKg = 0;
  let purchaseAmount = 0;

  const updatedPurchases = purchases.map((purchase) => {
    const belongsToMonth = purchase.companyId === companyId &&
      String(purchase.date || '').startsWith(yearMonth);
    if (!belongsToMonth) return purchase;

    const totalKg = Math.max(0, toNumber(purchase.totalKg));
    const amount = Math.round(totalKg * price);
    purchaseKg += totalKg;
    purchaseAmount += amount;

    const after = {
      ...purchase,
      monthlyGasPrice: price,
      amount,
      updatedAt
    };

    if (toNumber(purchase.monthlyGasPrice) !== price || toNumber(purchase.amount) !== amount) {
      changed.push({ before: purchase, after });
    }
    return after;
  });

  return {
    purchases: updatedPurchases,
    changed,
    purchaseKg,
    purchaseAmount,
    monthlyGasPrice: price
  };
};
