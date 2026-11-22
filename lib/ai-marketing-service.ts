/**
 * ai-marketing-service.ts
 * 盛隆瓦斯行銷與業務 AI 核心服務：52 天動態用氣週期與沉睡客召回引擎
 */

export interface CustomerCycleInfo {
  id: number | string;
  name: string;
  tel?: string;
  address?: string;
  lastOrderDate: string;
  spec?: string;
  orderCount?: number;
}

export type CycleCategory = "NORMAL" | "DEPLETING" | "OVERDUE" | "DORMANT_60" | "CRITICAL_90";

export interface CustomerCycleStatus {
  customer: CustomerCycleInfo;
  daysElapsed: number;
  daysRemaining: number;
  category: CycleCategory;
  categoryName: string;
  recallCopy: string;
}

export interface DormantAnalysisSummary {
  total: number;
  normalCount: number;
  depletingCount: number;
  overdueCount: number;
  dormant60Count: number;
  critical90Count: number;
  customers: CustomerCycleStatus[];
}

export function categorizeCustomerCycle(
  customer: CustomerCycleInfo,
  referenceDate: Date = new Date()
): CustomerCycleStatus {
  const lastTime = new Date(customer.lastOrderDate).getTime();
  const refTime = referenceDate.getTime();
  const diffMs = refTime - lastTime;
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  const baseCycle = customer.spec?.includes("50") ? 12 : 52;
  const daysRemaining = baseCycle - daysElapsed;

  let category: CycleCategory = "NORMAL";
  let categoryName = "🟢 正常用氣中";

  if (daysElapsed >= 90) {
    category = "CRITICAL_90";
    categoryName = "🛑 90天呆瓶壓桶警戒";
  } else if (daysElapsed >= 60) {
    category = "DORMANT_60";
    categoryName = "😴 60天沉睡回訪客";
  } else if (daysElapsed > baseCycle) {
    category = "OVERDUE";
    categoryName = "🚨 超期用盡預警";
  } else if (daysElapsed >= 45 || daysRemaining <= 4) {
    category = "DEPLETING";
    categoryName = "🔥 52天即將斷氣警戒";
  }

  const recallCopy = generateRecallCopy(customer, category);

  return {
    customer,
    daysElapsed,
    daysRemaining,
    category,
    categoryName,
    recallCopy,
  };
}

export function generateRecallCopy(
  customer: CustomerCycleInfo,
  category: CycleCategory
): string {
  const spec = customer.spec || "20kg";
  const name = customer.name || "貴賓";

  switch (category) {
    case "DEPLETING":
      return `【盛隆瓦斯 安全關懷提醒】${name} 您好！盛隆智慧瓦斯推估您的 ${spec} 瓦斯即將用盡（依照52天週期倒數中）。為避免洗澡或烹飪中途中斷，歡迎提早來電 2976-3869 或直接 LINE 叫貨，我們將優先為您安排機車外送！`;
    case "OVERDUE":
      return `【盛隆瓦斯 存量警戒通報】${name} 您好！您的 ${spec} 瓦斯已超過一般用氣天數，若已開至備用桶請儘快回覆，盛隆專業師傅將火速為您送達換新！`;
    case "DORMANT_60":
      return `【盛隆瓦斯 老客戶安全安檢回饋】${name} 您好！盛隆瓦斯感謝您長期支持，我們特派專業技師為久未叫貨的尊榮客戶提供免費瓦斯管線與防爆開關安全巡檢，並附贈老客戶專屬優惠！敬請來電洽詢 2976-3869。`;
    case "CRITICAL_90":
      return `【盛隆瓦斯 鋼瓶資產與安全提醒】${name} 您好！系統顯示您家中備有盛隆鋼瓶已逾 90 天未週轉。依照瓦斯安全法規，長期未動用鋼瓶需進行鋼瓶安全檢驗或安排回收空瓶。請隨時聯絡盛隆協助處理，感謝您的配合！`;
    default:
      return `【盛隆瓦斯】${name} 您好，盛隆瓦斯祝您順心！如需配送隨時為您服務。`;
  }
}

export function analyzeDormantCustomers(
  customers: CustomerCycleInfo[],
  referenceDate: Date = new Date()
): DormantAnalysisSummary {
  let normalCount = 0;
  let depletingCount = 0;
  let overdueCount = 0;
  let dormant60Count = 0;
  let critical90Count = 0;

  const results = customers.map((c) => {
    const status = categorizeCustomerCycle(c, referenceDate);
    if (status.category === "NORMAL") normalCount++;
    else if (status.category === "DEPLETING") depletingCount++;
    else if (status.category === "OVERDUE") overdueCount++;
    else if (status.category === "DORMANT_60") dormant60Count++;
    else if (status.category === "CRITICAL_90") critical90Count++;
    return status;
  });

  return {
    total: customers.length,
    normalCount,
    depletingCount,
    overdueCount,
    dormant60Count,
    critical90Count,
    customers: results,
  };
}
