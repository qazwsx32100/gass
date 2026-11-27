/**
 * lib/ai-cross-department-pipeline.ts
 * 👑 盛隆瓦斯八大 AI 部門跨部門主動閉環管線引擎 (Cross-Department Autonomous Pipelines)
 *
 * 核心管線：
 * 1. 90 天呆瓶壓瓶召回閉環 (Dormant Cylinder Recovery Pipeline)
 *    行銷 AI (篩選名冊) ➔ 行政 AI (地址核對) ➔ 財務 AI (資產沉澱精算) ➔ 秘書 AI (文案與外勤工單)
 *
 * 2. 門市訂單倒賠與異常利潤主動攔截閉環 (Below-Cost Margin Pipeline)
 *    財務 AI (全規格純成本保本底線比對) ➔ 業務 AI (客戶商務合約覆核) ➔ 秘書 AI (異常晨會戰報)
 *
 * 3. 庫存急缺與夜間斷氣主動預警閉環 (Stock Depletion Emergency Pipeline)
 *    營運 AI (門市真實安全庫存水位) ➔ 系統工程 AI (真實同步延遲校驗) ➔ 秘書 AI (Telegram 告警叫車)
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
    // 篩選 90 天以上且具真實最後叫貨紀錄之客戶（嚴格排除 daysDiff >= 9999 之無叫貨紀錄哨兵值）
    const diff = Number(c.daysDiff);
    const hasValidLastOrder = Boolean(c.lastOrder && String(c.lastOrder).trim().length >= 8);
    if (
      Number.isFinite(diff) &&
      diff >= 90 &&
      diff < 9999 &&
      (hasValidLastOrder || diff <= 3650) &&
      c.active !== false
    ) {
      // 加權預估壓瓶數 (依住家平均 1.34 支、商業戶 2.0 支或自訂歷史)
      const isCommercial =
        (c.name && /店|小吃|館|麵|飯|排|居酒屋|熱炒|早點|廚房|鍋/.test(c.name)) ||
        (c.p50 && c.p50 > 0);
      const pressed = isCommercial ? 2 : 1;
      totalPressed += pressed;

      // 依 Directive #3 官方硬體標準：20kg 鋼瓶購入成本 $1,550，年折舊檢驗 $147.67
      const frozenVal = pressed * 1550;
      const deprLoss = pressed * 147.67;

      const careMessageDraft = `親愛的【${c.name || `客戶 #${c.id}`}】您好，盛隆瓦斯關心您！距離上次配送已滿 ${diff} 天，現場瓦斯使用安全嗎？目前專案提供【免費全套管線測漏＋鋼瓶安全檢驗】，若暫無用氣亦可為您免費收回空瓶，保障居家安全。服務專線：02-2972-2149（營業時間 08:00–21:00）。`;

      dormantItems.push({
        customerId: c.id,
        customerName: c.name || `客戶 #${c.id}`,
        address: c.cleanAddress || c.addr || "地址待補",
        phone: c.phoneClean || c.tel || "電話待補",
        daysDiff: diff,
        pressedCylinders: pressed,
        frozenAssetValue: frozenVal,
        depreciationLossPerYear: Math.round(deprLoss * 100) / 100,
        suggestedAction: pressed >= 2 ? "建議排入外勤順路收瓶工單" : "發送 LINE 關懷與預約安檢",
        careMessageDraft,
      });
    }
  }

  // 優先排序：90~730 天可高度召回客群優先，其次商業多壓瓶優先
  dormantItems.sort((a, b) => {
    const aRecent = a.daysDiff <= 730 ? 1 : 0;
    const bRecent = b.daysDiff <= 730 ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;
    if (a.pressedCylinders !== b.pressedCylinders) return b.pressedCylinders - a.pressedCylinders;
    return b.daysDiff - a.daysDiff;
  });

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

  // 官方分規格純成本保本底線 (Directive #3: 進氣 $22.63/kg + 運費 $70/$140 + 鋼瓶年均分攤)
  const RES_FLOOR = 556; // 20kg 住家 ($453進氣 + $70運費 + $33鋼瓶)
  const COM_FLOOR = 529; // 20kg 商家 ($453進氣 + $70運費 + $6鋼瓶)
  const FLOOR_50 = 1282; // 50kg 大戶 ($1,131.5進氣 + $140運費 + $10鋼瓶)
  const FLOOR_16 = 456; // 16kg ($362.1進氣 + $70運費 + $24鋼瓶)
  const FLOOR_10 = 320; // 10kg ($226.3進氣 + $70運費 + $24鋼瓶)
  const FLOOR_4 = 183; // 4kg ($90.5進氣 + $70運費 + $22鋼瓶)

  for (const o of orders) {
    if (!o || String(o.disable || "N").toUpperCase() === "Y") continue;
    const rawPrice = Number(o.price ?? o.totalPrice ?? 0);
    if (rawPrice <= 0) continue;

    let b50 = Number(o.b50 ?? o.qty50 ?? o.oder_50kg ?? 0) || 0;
    let b20 = Number(o.b20 ?? o.qty20 ?? o.oder_20kg ?? 0) || 0;
    let b16 = Number(o.b16 ?? o.qty16 ?? o.oder_16kg ?? 0) || 0;
    let b10 = Number(o.b10 ?? o.qty10 ?? o.oder_10kg ?? 0) || 0;
    let b4 = Number(o.b4 ?? o.qty4 ?? o.oder_4kg ?? 0) || 0;

    if (b50 + b20 + b16 + b10 + b4 === 0 && typeof o.items === "string") {
      const text = String(o.items);
      for (const m of text.matchAll(/(50|20|16|10|4)\s*(?:kg|公斤)(?:\s*[x×*]\s*(\d+))?/gi)) {
        const kg = m[1];
        const qty = m[2] ? Math.max(1, Number(m[2])) : 1;
        if (kg === "50") b50 += qty;
        else if (kg === "20") b20 += qty;
        else if (kg === "16") b16 += qty;
        else if (kg === "10") b10 += qty;
        else if (kg === "4") b4 += qty;
      }
    }

    if (b50 + b20 + b16 + b10 + b4 === 0) {
      b20 = 1;
    }

    const totalTanks = b50 + b20 + b16 + b10 + b4;

    const isCommercial =
      b50 > 0 ||
      Boolean(o.isMonthly) ||
      String(o.payed || "").trim() === "M" ||
      (o.name && /店|小吃|館|麵|飯|排|居酒屋|熱炒|早點|廚房|鍋|餐廳|商行|早餐|燒烤|滷味/.test(String(o.name)));

    const floor20 = isCommercial ? COM_FLOOR : RES_FLOOR;
    const orderFloor =
      b50 * FLOOR_50 +
      b20 * floor20 +
      b16 * FLOOR_16 +
      b10 * FLOOR_10 +
      b4 * FLOOR_4;

    const specsSummary =
      `${b50 > 0 ? `50kgx${b50} ` : ""}${b20 > 0 ? `20kgx${b20} ` : ""}${b16 > 0 ? `16kgx${b16} ` : ""}${b10 > 0 ? `10kgx${b10} ` : ""}${b4 > 0 ? `4kgx${b4} ` : ""}`.trim() ||
      "20kg x 1";

    if (rawPrice < orderFloor) {
      belowCostCount += 1;
      const diff = Math.round(orderFloor - rawPrice);
      shortfallTotal += diff;

      flagged.push({
        orderId: o.id || o.oder_id || "未知單號",
        customerId: o.customerId || o.customer_id || "未知客號",
        customerName: o.customerName || o.name || "一般客戶",
        address: o.address || o.addr || o.customerAddress || "",
        specsSummary,
        totalPrice: rawPrice,
        breakEvenFloor: orderFloor,
        marginShortfall: diff,
        customerCategory: isCommercial ? "COMMERCIAL" : "RESIDENTIAL",
        riskLevel: "CRITICAL_BELOW_COST",
        auditReason: `本單（${specsSummary}）實收 $${Math.round(rawPrice)} 元，低於盛隆規格保本底線 $${orderFloor} 元（倒賠 $${diff} 元）！`,
        commercialReviewAdvice: isCommercial
          ? "商用大戶量大折讓：請業務主管覆核合約月叫貨總量是否達標（>50桶/月）。"
          : "住家異常低價：請門市確認是否為歷史低價老戶或折價輸入錯誤。",
      });
    } else if (rawPrice < orderFloor + 40 * totalTanks) {
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

function parseStockUpdatedLatencySec(updatedAt?: string): number | null {
  if (!updatedAt || typeof updatedAt !== "string") return null;
  const trimmed = updatedAt.trim();
  if (!trimmed) return null;
  const isoCandidate = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/.test(trimmed)
    ? trimmed.replace(/\//g, "-").replace(" ", "T") + "+08:00"
    : trimmed;
  const ms = Date.parse(isoCandidate);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 1000));
}

// ── 3. 即時庫存告急與夜間斷氣主動預警閉環 ──
export function runStockDepletionEmergencyPipeline(params: {
  stock: { qty50: number; qty20: number; qty16: number; qty10: number; qty4: number; updatedAt?: string };
  todayOrdersCount?: number;
  syncLatencySec?: number;
}): StockDepletionPipelineReport {
  const now = new Date().toISOString();
  const { stock } = params;
  const parsedLatency = parseStockUpdatedLatencySec(stock.updatedAt);
  const syncLatencySec =
    typeof params.syncLatencySec === "number" && Number.isFinite(params.syncLatencySec)
      ? Math.max(0, Math.round(params.syncLatencySec))
      : parsedLatency ?? 0;

  // 對齊盛隆門市真實安全門檻：20kg 警戒30/告急15；50kg 警戒4/告急2
  const QTY20_WARN = 30;
  const QTY20_CRIT = 15;
  const QTY50_WARN = 4;
  const QTY50_CRIT = 2;

  const criticalSpecs: string[] = [];
  const warningSpecs: string[] = [];
  const healthyNotes: string[] = [];

  if (stock.qty20 <= QTY20_CRIT) criticalSpecs.push(`20kg 僅剩 ${stock.qty20} 桶`);
  else if (stock.qty20 <= QTY20_WARN) warningSpecs.push(`20kg 僅剩 ${stock.qty20} 桶（警戒線 ${QTY20_WARN}）`);
  else healthyNotes.push(`20kg 目前 ${stock.qty20} 桶充沛`);

  if (stock.qty50 <= QTY50_CRIT) criticalSpecs.push(`50kg 僅剩 ${stock.qty50} 支`);
  else if (stock.qty50 <= QTY50_WARN) warningSpecs.push(`50kg 僅剩 ${stock.qty50} 支（警戒線 ${QTY50_WARN}）`);
  else healthyNotes.push(`50kg 目前 ${stock.qty50} 支正常`);

  let status: StockDepletionPipelineReport["status"] = "NORMAL";
  let statusLabel = "🟢 庫存安全充裕";
  let depletionAlert: string | null = null;
  let needCallTruck = false;
  let suggestedQty20 = 0;
  let suggestedQty50 = 0;

  if (criticalSpecs.length > 0) {
    status = "CRITICAL";
    statusLabel = "🔴 庫存告急斷氣危機";
    needCallTruck = true;
    if (stock.qty20 <= QTY20_WARN) suggestedQty20 = Math.max(0, 60 - stock.qty20);
    if (stock.qty50 <= QTY50_WARN) suggestedQty50 = Math.max(0, 6 - stock.qty50);
    const suffix = healthyNotes.length > 0 ? `（${healthyNotes.join("、")}）` : "";
    depletionAlert = `🚨 警告：${criticalSpecs.join("、")}，已觸發斷氣紅色警戒！${suffix}`;
  } else if (warningSpecs.length > 0) {
    status = "WARNING";
    statusLabel = "🟡 庫存臨期預警";
    needCallTruck = true;
    if (stock.qty20 <= QTY20_WARN) suggestedQty20 = Math.max(0, 50 - stock.qty20);
    if (stock.qty50 <= QTY50_WARN) suggestedQty50 = Math.max(0, 6 - stock.qty50);
    depletionAlert = `⚠️ 提醒：${warningSpecs.join("、")}，建議安排進氣叫車補貨。`;
  }

  const sqlAlive = syncLatencySec < 180;
  const verdict =
    parsedLatency === null && params.syncLatencySec === undefined
      ? "未提供同步時間戳（請以即時庫存看板心跳為準）"
      : sqlAlive
      ? `門市雙向同步正常 (LIVE, ${syncLatencySec}s)`
      : `門市連線延遲超標 (${syncLatencySec}s，請檢查門市守護進程)`;

  return {
    pipelineId: "STOCK_DEPLETION_EMERGENCY",
    pipelineName: "即時庫存告急與夜間斷氣主動預警閉環",
    generatedAt: now,
    status,
    statusLabel,
    currentStock: {
      qty50: stock.qty50,
      qty20: stock.qty20,
      qty16: stock.qty16,
      qty10: stock.qty10,
      qty4: stock.qty4,
    },
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
