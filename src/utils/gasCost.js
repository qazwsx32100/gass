/**
 * 👑 盛隆瓦斯 官方標準成本、運費與利潤核算權威數據模組 (Master Financial & Costing Truth)
 * 最高決策者：老闆 (Telegram ID: 8862712587)
 * 供全系統報價引擎、財務報表與 AI 矩陣統一引用
 */

export const GAS_PURCHASE_PRICE_PER_KG = 22.63; // 批發進氣單價 ($/kg)

export const DRIVER_DELIVERY_FEES = {
  default: 70, // 4kg, 10kg, 16kg, 20kg 師傅外送運費 ($/趟/桶)
  b50: 140, // 50kg 師傅外送運費 ($/趟/桶)
};

export const CYLINDER_PURCHASE_COSTS = {
  b4: 1080,
  b10: 1480,
  b16: 1480,
  b20: 1550,
  b50: 3400,
};

export const CYLINDER_HOLDING_ANNUAL_COSTS = {
  b4: 132.0,
  b10: 145.33,
  b16: 145.33,
  b20: 147.67,
  b50: 250.0,
};

export const RESIDENTIAL_AVERAGES_BENCHMARK = {
  cylinderAllocationPerHousehold: 1.34, // 客端壓 1.26 支 + 店端後勤流通備瓶 0.08 支
  annualBarrels: 6.0,
  annualOrders: 5.0,
  daysInterval: 52,
  cylinderAmortizationPerBarrel: 33,
  breakEvenFloor: 556, // 進氣 $453 + 運費 $70 + 鋼瓶 $33
};

export const COMMERCIAL_1TO1_BENCHMARK = {
  cylinderAllocationPerHousehold: 2.0, // 現場 1 支 + 店端備 1 支
  annualBarrels: 50.0,
  daysInterval: 7.3,
  cylinderAmortizationPerBarrel: 6,
  breakEvenFloor: 529, // 進氣 $453 + 運費 $70 + 鋼瓶 $6
};

export const STORE_PRICING_POLICY = {
  b4_retail: 400,
  b10_retail: 530,
  b16_retail: 680,
  b20_residential_retail: 750,
  b20_commercial_retail: 620,
  b50_retail: 1600,
};

export const getWeightedGasPurchaseCost = (purchases = []) => (
  purchases.reduce((sum, purchase) => {
    const kg = Number(purchase?.totalKg || 0);
    const unitPrice = Number(purchase?.monthlyGasPrice || 0);
    const recordedAmount = Number(purchase?.amount || 0);

    return sum + (kg > 0 && unitPrice > 0 ? kg * unitPrice : recordedAmount);
  }, 0)
);
