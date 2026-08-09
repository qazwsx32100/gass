export const getWeightedGasPurchaseCost = (purchases = []) => (
  purchases.reduce((sum, purchase) => {
    const kg = Number(purchase?.totalKg || 0);
    const unitPrice = Number(purchase?.monthlyGasPrice || 0);
    const recordedAmount = Number(purchase?.amount || 0);

    return sum + (kg > 0 && unitPrice > 0 ? kg * unitPrice : recordedAmount);
  }, 0)
);
