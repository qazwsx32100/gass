/**
 * ai-finance-audit-service.ts
 * 盛隆瓦斯財務稽核 AI：官方成本核算、實質毛利審計與外勤現金對帳
 *
 * 嚴格遵循老闆親授 Directive #3 權威標準：
 * 1. 純成本標準 (不含利潤)：
 *    - 瓦斯批發進價：$22.63 / kg
 *    - 師傅外送運費：一般規格 $70 / 桶，50kg 超重 $140 / 桶
 *    - 鋼瓶折舊與檢驗分攤：住家 $33 / 桶，生意攤 $6 / 桶
 *    - 純成本底線：20kg 住家 $556 / 桶，20kg 生意攤 $529 / 桶
 *
 * 2. 官方最低售價底線表 (含合理利潤，老闆親授最新標準)：
 *    - 住家最低售價：4kg $350、10kg $500、16kg $700、20kg $800
 *    - 商家最低售價：4kg $300、10kg $420、16kg $540、20kg $590、50kg $1,625
 */

export const MINIMUM_PRICE_FLOORS: Record<"residential" | "commercial", Record<string, number>> = {
  residential: {
    "4kg": 350,
    "10kg": 500,
    "16kg": 700,
    "20kg": 800,
  },
  commercial: {
    "4kg": 300,
    "10kg": 420,
    "16kg": 540,
    "20kg": 590,
    "50kg": 1625,
  },
};

export interface OrderAuditInput {
  orderId: string;
  spec: string; // "4kg" | "10kg" | "16kg" | "20kg" | "50kg"
  customerType?: "residential" | "commercial";
  price: number;
  quantity?: number;
}

export interface OrderAuditResult {
  orderId: string;
  spec: string;
  customerType: "residential" | "commercial";
  price: number;
  quantity: number;
  intakeCost: number;
  deliveryFee: number;
  cylinderShare: number;
  totalCost: number; // 純成本 (進氣 + 運費 + 鋼瓶分攤，不含利潤)
  minimumPriceFloor: number; // 老闆親授最低售價 (含利潤)
  grossProfit: number;
  netProfit: number;
  marginRate: number;
  isBelowBreakEven: boolean; // 是否跌破純成本線 (倒賠)
  isBelowMinimumPrice: boolean; // 是否跌破最低售價底線 (少賺未達標準)
  auditAlert: string;
}

export interface DriverDeliveryRecord {
  orderId: string;
  amount: number;
  paymentMethod: "COD" | "CREDIT" | "TRANSFER" | "LINE_PAY";
}

export interface DriverCashReconciliation {
  driverName: string;
  expectedCash: number;
  cashReported: number;
  discrepancy: number;
  status: "BALANCED" | "SHORTAGE" | "OVERAGE";
  deliveryCount: number;
  notes: string;
}

export interface DailyMarginSummary {
  totalOrders: number;
  totalRevenue: number;
  totalIntakeCost: number;
  totalDeliveryFees: number;
  totalCylinderShares: number;
  totalCost: number;
  totalNetProfit: number;
  averageMarginRate: number;
  belowCostAlertsCount: number;
  belowMinimumPriceAlertsCount: number;
  belowFloorAlertsCount: number;
}

// 規格重量對應 (kg)
const SPEC_WEIGHT_KG: Record<string, number> = {
  "4kg": 4,
  "10kg": 10,
  "16kg": 16,
  "20kg": 20,
  "50kg": 50,
};

export function auditOrderMargin(input: OrderAuditInput): OrderAuditResult {
  const specKey = (input.spec || "20kg").toLowerCase().replace(/\s+/g, "");
  const kg = SPEC_WEIGHT_KG[specKey] || 20;
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const customerType = input.customerType || "residential";

  // 1. 進氣成本 ($22.63 / kg)
  const intakeCost = Math.round(kg * 22.63 * 10) / 10 * qty;

  // 2. 外送運費 ($70 一般 / $140 50kg)
  const deliveryFee = (specKey.includes("50") ? 140 : 70) * qty;

  // 3. 鋼瓶持有折舊分攤 ($33 住家 / $6 生意攤)
  const cylinderShare = (customerType === "commercial" ? 6 : 33) * qty;

  // 4. 純總成本 (不含利潤)
  const totalCost = Math.round((intakeCost + deliveryFee + cylinderShare) * 10) / 10;
  const grossProfit = Math.round((input.price - (intakeCost + deliveryFee)) * 10) / 10;
  const netProfit = Math.round((input.price - totalCost) * 10) / 10;
  const marginRate = input.price > 0 ? Math.round((netProfit / input.price) * 1000) / 10 : 0;

  // 5. 老闆親授官方最低售價底線 (含利潤)
  const minFloorUnit = MINIMUM_PRICE_FLOORS[customerType]?.[specKey] || (customerType === "commercial" ? 590 : 800);
  const minimumPriceFloor = minFloorUnit * qty;

  let isBelowBreakEven = false;
  let isBelowMinimumPrice = false;
  let auditAlert = "🟢 售價符合標準";

  if (input.price < totalCost) {
    isBelowBreakEven = true;
    isBelowMinimumPrice = true;
    auditAlert = `🚨 嚴重倒賠警告：售價 $${input.price} 低於純成本線 ($${totalCost})，每桶倒賠 $${Math.round(totalCost - input.price)}！`;
  } else if (input.price < minimumPriceFloor) {
    isBelowMinimumPrice = true;
    auditAlert = `⚠️ 跌破最低售價：售價 $${input.price} 低於官方最低售價底線 ($${minimumPriceFloor})，未達標準利潤！`;
  }

  return {
    orderId: input.orderId,
    spec: input.spec,
    customerType,
    price: input.price,
    quantity: qty,
    intakeCost,
    deliveryFee,
    cylinderShare,
    totalCost,
    minimumPriceFloor,
    grossProfit,
    netProfit,
    marginRate,
    isBelowBreakEven,
    isBelowMinimumPrice,
    auditAlert,
  };
}

export function reconcileDriverCash(
  deliveries: DriverDeliveryRecord[],
  driverName: string,
  cashReported: number
): DriverCashReconciliation {
  const codOrders = deliveries.filter((d) => d.paymentMethod === "COD");
  const expectedCash = codOrders.reduce((sum, d) => sum + (d.amount || 0), 0);
  const discrepancy = cashReported - expectedCash;

  let status: "BALANCED" | "SHORTAGE" | "OVERAGE" = "BALANCED";
  let notes = "✅ 現金帳實相符，沖帳無誤";

  if (discrepancy < 0) {
    status = "SHORTAGE";
    notes = `⚠️ 現金短少 $${Math.abs(discrepancy)} 元，需司機補繳或確認是否有賒欠！`;
  } else if (discrepancy > 0) {
    status = "OVERAGE";
    notes = `⚠️ 現金溢收 $${discrepancy} 元，請查驗是否含前帳或押金！`;
  }

  return {
    driverName,
    expectedCash,
    cashReported,
    discrepancy,
    status,
    deliveryCount: deliveries.length,
    notes,
  };
}

export function calculateDailyMarginSummary(auditedOrders: OrderAuditResult[]): DailyMarginSummary {
  let totalRevenue = 0;
  let totalIntakeCost = 0;
  let totalDeliveryFees = 0;
  let totalCylinderShares = 0;
  let totalCost = 0;
  let totalNetProfit = 0;
  let belowCostAlertsCount = 0;
  let belowMinimumPriceAlertsCount = 0;

  for (const o of auditedOrders) {
    totalRevenue += o.price;
    totalIntakeCost += o.intakeCost;
    totalDeliveryFees += o.deliveryFee;
    totalCylinderShares += o.cylinderShare;
    totalCost += o.totalCost;
    totalNetProfit += o.netProfit;
    if (o.isBelowBreakEven) belowCostAlertsCount++;
    if (o.isBelowMinimumPrice) belowMinimumPriceAlertsCount++;
  }

  const averageMarginRate = totalRevenue > 0
    ? Math.round((totalNetProfit / totalRevenue) * 1000) / 10
    : 0;

  return {
    totalOrders: auditedOrders.length,
    totalRevenue: Math.round(totalRevenue),
    totalIntakeCost: Math.round(totalIntakeCost * 10) / 10,
    totalDeliveryFees,
    totalCylinderShares,
    totalCost: Math.round(totalCost * 10) / 10,
    totalNetProfit: Math.round(totalNetProfit * 10) / 10,
    averageMarginRate,
    belowCostAlertsCount,
    belowMinimumPriceAlertsCount,
    belowFloorAlertsCount: belowMinimumPriceAlertsCount,
  };
}
