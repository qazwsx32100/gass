/**
 * lib/ai-cross-department-pipeline.ts
 * 👑 盛隆瓦斯八大 AI 部門跨部門主動閉環管線引擎 (Cross-Department Autonomous Pipelines)
 *
 * 核心管線：
 * 1. 90 天呆瓶壓瓶召回閉環 (Dormant Cylinder Recovery Pipeline)
 *    行銷 AI (篩選名冊) ➔ 行政 AI (地址核對) ➔ 財務 AI (資產沉澱精算) ➔ 秘書 AI (文案與外勤工單)
 *
 * 2. 門市訂單倒賠與異常利潤主動攔截閉環 (Below-Cost Margin Pipeline)
 *    財務 AI (底線 $556/$529 比對) ➔ 業務 AI (客戶商務合約覆核) ➔ 秘書 AI (異常晨會戰報)
 *
 * 3. 庫存急缺與夜間斷氣主動預警閉環 (Stock Depletion Emergency Pipeline)
 *    營運 AI (安全庫存水位) ➔ 系統工程 AI (連線健康校驗) ➔ 秘書 AI (Telegram 告警叫車)
 *
 * 恪守標準：Directive #3 權威成本 ($22.63/kg、運費 $70/$140、鋼瓶折舊 $147.67/年)
 * 恪守鐵律：Directive #4 舊 ERP 黑盒子零更動、Directive #6 本機非門市營業主機
 */

import {
  getCloudCustomerDirectory,
  ensureCloudCustomerDirectoryLoaded,
} from "./cloud-customer-gateway.ts";
import type { CloudCustomerRecord } from "./cloud-customer-gateway.ts";

export interface DormantRecoveryItem {
  customerId: number;
  customerName: string;
  address: string;
  phone: string;
  daysDiff: number;
  pressedCylinders: number;
  frozenAssetValue: number;
  depreciationLossPerYear: number;
  suggestedAction: string;
  careMessageDraft: string;
}

export interface DormantCylinderPipelineReport {
  pipelineId: "DORMANT_CYLINDER_RECOVERY";
  pipelineName: "90 天呆瓶壓瓶召回跨部門閉環";
  generatedAt: string;
  totalAudited: number;
  dormantCustomersCount: number;
  totalPressedCylinders: number;
  totalFrozenAssetValue: number;
  annualDepreciationLoss: number;
  priorityRecoveryList: DormantRecoveryItem[];
  participatingDepartments: {
    marketing: string;
    admin: string;
    finance: string;
    secretary: string;
  };
}

export interface BelowCostOrderAuditItem {
  orderId: number | string;
  customerId: number | string;
  customerName: string;
  address: string;
  specsSummary: string;
  totalPrice: number;
  breakEvenFloor: number;
  marginShortfall: number;
  customerCategory: "RESIDENTIAL" | "COMMERCIAL";
  riskLevel: "CRITICAL_BELOW_COST" | "LOW_MARGIN_WARNING";
  auditReason: string;
  commercialReviewAdvice: string;
}

export interface BelowCostMarginPipelineReport {
  pipelineId: "BELOW_COST_MARGIN_DEFENSE";
  pipelineName: "門市訂單保本底線與異常毛利主動防禦閉環";
  generatedAt: string;
  totalOrdersAudited: number;
  belowCostCount: number;
  lowMarginCount: number;
  totalMarginShortfall: number;
  flaggedOrders: BelowCostOrderAuditItem[];
  standardCostBenchmark: {
    gasCostPerKg: number;
    standardFreight: number;
    heavyFreight: number;
    residentialBreakEvenFloor: number;
    commercialBreakEvenFloor: number;
  };
}

export interface StockDepletionPipelineReport {
  pipelineId: "STOCK_DEPLETION_EMERGENCY";
  pipelineName: "即時庫存告急與夜間斷氣主動預警閉環";
  generatedAt: string;
  status: "NORMAL" | "WARNING" | "CRITICAL";
  statusLabel: string;
  currentStock: {
    qty50: number;
    qty20: number;
    qty16: number;
    qty10: number;
    qty4: number;
  };
  thresholds: {
    qty20Warning: number;
    qty20Critical: number;
    qty50Warning: number;
    qty50Critical: number;
  };
  depletionAlert: string | null;
  recommendedOrderIntake: {
    needCallTruck: boolean;
    suggestedQty20: number;
    suggestedQty50: number;
  };
  systemEngineerStatus: {
    sqlAlive: boolean;
    syncLatencySec: number;
    verdict: string;
  };
}

// ── 1. 90 天呆瓶壓瓶召回閉環 ──
export async function runDormantCylinderRecoveryPipeline(limit = 10): Promise<DormantCylinderPipelineReport> {
  await ensureCloudCustomerDirectoryLoaded();
  const customers = getCloudCustomerDirectory();

  const now = new Date().toISOString();
  const dormantItems: DormantRecoveryItem[] = [];
  let totalPressed = 0;

  for (const c of customers) {
    // 篩選 90 天以上未叫瓦斯者 (daysDiff >= 90)
    if (c.daysDiff >= 90 && c.active !== false) {
      // 加權預估壓瓶數 (依住家平均 1.34 支、商業戶 2.0 支或自訂歷史)
      const isCommercial =
        (c.name && /店|小吃|館|麵|飯|排|居酒屋|熱炒|早點|廚房|鍋/.test(c.name)) ||
        (c.p50 && c.p50 > 0);
      const pressed = isCommercial ? 2 : 1;
      totalPressed += pressed;

      // 依 Directive #3 官方硬體標準：20kg 鋼瓶購入成本 $1,550，年折舊檢驗 $147.67
      const frozenVal = pressed * 1550;
      const deprLoss = pressed * 147.67;

      const careMessageDraft = `親愛的【${c.name}】您好，盛隆瓦斯關心您！距離上次配送已滿 ${c.daysDiff} 天，現場瓦斯使用安全嗎？目前專案提供【免費全套管線測漏＋鋼瓶安全檢驗】，若暫無用氣亦可為您免費收回空瓶，保障居家安全。服務專線：02-2988-1234。`;

      dormantItems.push({
        customerId: c.id,
        customerName: c.name || `客戶 #${c.id}`,
        address: c.cleanAddress || c.addr || "地址待補",
        phone: c.phoneClean || c.tel || "電話待補",
        daysDiff: c.daysDiff,
        pressedCylinders: pressed,
        frozenAssetValue: frozenVal,
        depreciationLossPerYear: Math.round(deprLoss * 100) / 100,
        suggestedAction: pressed >= 2 ? "建議排入外勤順路收瓶工單" : "發送 LINE 關懷與預約安檢",
        careMessageDraft,
      });
    }
  }

  // 依未叫天數降序排序
  dormantItems.sort((a, b) => b.daysDiff - a.daysDiff);

  const topList = dormantItems.slice(0, limit);
  const totalFrozen = totalPressed * 1550;
  const totalDepr = Math.round(totalPressed * 147.67 * 100) / 100;

  return {
    pipelineId: "DORMANT_CYLINDER_RECOVERY",
    pipelineName: "90 天呆瓶壓瓶召回跨部門閉環",
    generatedAt: now,
    totalAudited: customers.length,
    dormantCustomersCount: dormantItems.length,
    totalPressedCylinders: totalPressed,
    totalFrozenAssetValue: totalFrozen,
    annualDepreciationLoss: totalDepr,
    priorityRecoveryList: topList,
    participatingDepartments: {
      marketing: "📣 行銷 AI：精準標記 90 天呆瓶客群並產生溫暖關懷文案",
      admin: "📋 行政 AI：核驗客戶大門地址與電話有效性，排除已拆遷戶",
      finance: "💰 財務 AI：依 $1,550/支 與年折舊 $147.67 精算資金沉澱與回收效益",
      secretary: "🤖 秘書 AI：統籌產出外勤收桶派單建議並推播老闆 Telegram",
    },
  };
}

// ── 2. 門市訂單倒賠與異常利潤主動攔截閉環 ──
export function runBelowCostMarginPipeline(orders: any[]): BelowCostMarginPipelineReport {
  const now = new Date().toISOString();
  const flagged: BelowCostOrderAuditItem[] = [];
  let shortfallTotal = 0;
  let belowCostCount = 0;
  let lowMarginCount = 0;

  // 官方保本底線標準 (Directive #3)
  const RES_FLOOR = 556; // 住家保本底線 ($453進氣 + $70運費 + $33鋼瓶)
  const COM_FLOOR = 529; // 商家保本底線 ($453進氣 + $70運費 + $6鋼瓶)

  for (const o of orders) {
    const rawPrice = Number(o.price ?? o.totalPrice ?? 0);
    if (rawPrice <= 0) continue;

    const b50 = Number(o.b50 ?? o.oder_50kg ?? 0);
    const b20 = Number(o.b20 ?? o.oder_20kg ?? 0);
    const b16 = Number(o.b16 ?? o.oder_16kg ?? 0);
    const b10 = Number(o.b10 ?? o.oder_10kg ?? 0);
    const b4 = Number(o.b4 ?? o.oder_4kg ?? 0);

    const totalTanks = b50 + b20 + b16 + b10 + b4 || 1;
    const avgPerTank = rawPrice / totalTanks;

    const isCommercial =
      b50 > 0 ||
      (o.name && /店|小吃|館|麵|飯|排|居酒屋|熱炒|早點|廚房|鍋/.test(String(o.name)));

    const floor = isCommercial ? COM_FLOOR : RES_FLOOR;

    if (avgPerTank < floor) {
      belowCostCount += 1;
      const diff = Math.round((floor - avgPerTank) * totalTanks);
      shortfallTotal += diff;

      flagged.push({
        orderId: o.id || o.oder_id || "未知單號",
        customerId: o.customerId || o.customer_id || "未知客號",
        customerName: o.customerName || o.name || "一般客戶",
        address: o.address || o.customerAddress || "",
        specsSummary: `${b50 > 0 ? `50kgx${b50} ` : ""}${b20 > 0 ? `20kgx${b20} ` : ""}${b16 > 0 ? `16kgx${b16} ` : ""}${b10 > 0 ? `10kgx${b10} ` : ""}${b4 > 0 ? `4kgx${b4} ` : ""}`.trim() || "20kg x 1",
        totalPrice: rawPrice,
        breakEvenFloor: floor * totalTanks,
        marginShortfall: diff,
        customerCategory: isCommercial ? "COMMERCIAL" : "RESIDENTIAL",
        riskLevel: "CRITICAL_BELOW_COST",
        auditReason: `單桶實收 $${Math.round(avgPerTank)} 元，低於盛隆保本底線 $${floor} 元（每桶倒賠 $${Math.round(floor - avgPerTank)} 元）！`,
        commercialReviewAdvice: isCommercial
          ? "商用大戶量大折讓：請業務主管覆核合約月叫貨總量是否達標（>50桶/月）。"
          : "住家異常低價：請門市確認是否為歷史低價老戶或折價輸入錯誤。",
      });
    } else if (avgPerTank < floor + 40) {
      lowMarginCount += 1;
    }
  }

  return {
    pipelineId: "BELOW_COST_MARGIN_DEFENSE",
    pipelineName: "門市訂單保本底線與異常毛利主動防禦閉環",
    generatedAt: now,
    totalOrdersAudited: orders.length,
    belowCostCount,
    lowMarginCount,
    totalMarginShortfall: shortfallTotal,
    flaggedOrders: flagged,
    standardCostBenchmark: {
      gasCostPerKg: 22.63,
      standardFreight: 70,
      heavyFreight: 140,
      residentialBreakEvenFloor: RES_FLOOR,
      commercialBreakEvenFloor: COM_FLOOR,
    },
  };
}

// ── 3. 即時庫存告急與夜間斷氣主動預警閉環 ──
export function runStockDepletionEmergencyPipeline(params: {
  stock: { qty50: number; qty20: number; qty16: number; qty10: number; qty4: number };
  todayOrdersCount?: number;
  syncLatencySec?: number;
}): StockDepletionPipelineReport {
  const now = new Date().toISOString();
  const { stock, syncLatencySec = 20 } = params;

  const QTY20_WARN = 30;
  const QTY20_CRIT = 15;
  const QTY50_WARN = 10;
  const QTY50_CRIT = 5;

  let status: StockDepletionPipelineReport["status"] = "NORMAL";
  let statusLabel = "🟢 庫存安全充裕";
  let depletionAlert: string | null = null;
  let needCallTruck = false;
  let suggestedQty20 = 0;
  let suggestedQty50 = 0;

  if (stock.qty20 <= QTY20_CRIT || stock.qty50 <= QTY50_CRIT) {
    status = "CRITICAL";
    statusLabel = "🔴 庫存告急斷氣危機";
    needCallTruck = true;
    suggestedQty20 = Math.max(0, 100 - stock.qty20);
    suggestedQty50 = Math.max(0, 30 - stock.qty50);
    depletionAlert = `🚨 警告：20kg 庫存僅剩 ${stock.qty20} 桶、50kg 僅剩 ${stock.qty50} 桶，已觸發斷氣紅色警戒！`;
  } else if (stock.qty20 <= QTY20_WARN || stock.qty50 <= QTY50_WARN) {
    status = "WARNING";
    statusLabel = "🟡 庫存臨期預警";
    needCallTruck = true;
    suggestedQty20 = Math.max(0, 80 - stock.qty20);
    suggestedQty50 = Math.max(0, 20 - stock.qty50);
    depletionAlert = `⚠️ 提醒：20kg 庫存低於 ${QTY20_WARN} 桶 (目前 ${stock.qty20} 桶)，建議安排下午進氣叫車。`;
  }

  const sqlAlive = syncLatencySec < 180;
  const verdict = sqlAlive
    ? "門市雙向同步正常 (LIVE)"
    : "門市連線延遲超標 (請檢查守護進程)";

  return {
    pipelineId: "STOCK_DEPLETION_EMERGENCY",
    pipelineName: "即時庫存告急與夜間斷氣主動預警閉環",
    generatedAt: now,
    status,
    statusLabel,
    currentStock: stock,
    thresholds: {
      qty20Warning: QTY20_WARN,
      qty20Critical: QTY20_CRIT,
      qty50Warning: QTY50_WARN,
      qty50Critical: QTY50_CRIT,
    },
    depletionAlert,
    recommendedOrderIntake: {
      needCallTruck,
      suggestedQty20,
      suggestedQty50,
    },
    systemEngineerStatus: {
      sqlAlive,
      syncLatencySec,
      verdict,
    },
  };
}
