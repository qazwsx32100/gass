import { operationsKvFetch } from "./operations-kv-fetch.ts";
import { getTelegramBotToken } from "./reporter-auth.ts";

export type BossApprovalTaskType =
  | "dispatch_unassigned"
  | "marketing_orange_wakeup"
  | "marketing_red_barrel_recovery"
  | "finance_debt_collection_tag"
  | "custom_ai_department_approval";

export interface BossPendingApprovalItem {
  id: string;
  type: BossApprovalTaskType;
  agentBadge: string;
  title: string;
  summary: string;
  impactValue: string;
  approveLabel: string;
  secondaryApproveLabel?: string;
  status: "pending" | "approved" | "dismissed";
  approvedAt?: string;
  approvedBy?: string;
  createdAt?: string;
  payload?: Record<string, unknown>;
}

export type BossApprovalItem = BossPendingApprovalItem;

const APPROVALS_STATE_KV_URL = "https://kvdb.io/XwdpBD41akmYGtk8ReuBTE/boss_approvals_state_v1";
const BOSS_TELEGRAM_ID = "8862712587";

const memoryApprovedIds = new Set<string>();
const memoryCustomApprovals = new Map<string, BossPendingApprovalItem>();

export async function loadBossApprovalState(): Promise<{
  approvedIds: Set<string>;
  customItems: BossPendingApprovalItem[];
}> {
  if (process.env.SHENGLONG_DISABLE_REMOTE_APPROVAL_KV === "1") {
    return {
      approvedIds: new Set(memoryApprovedIds),
      customItems: Array.from(memoryCustomApprovals.values()),
    };
  }
  try {
    const res = await operationsKvFetch(`${APPROVALS_STATE_KV_URL}?_t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.approvedIds)) {
        data.approvedIds.forEach((id: string) => memoryApprovedIds.add(id));
      }
      if (Array.isArray(data?.customItems)) {
        for (const item of data.customItems) {
          if (item && typeof item.id === "string") {
            memoryCustomApprovals.set(item.id, item);
          }
        }
      }
    }
  } catch {}

  return {
    approvedIds: new Set(memoryApprovedIds),
    customItems: Array.from(memoryCustomApprovals.values()),
  };
}

export async function persistBossApprovalState(): Promise<void> {
  if (process.env.SHENGLONG_DISABLE_REMOTE_APPROVAL_KV === "1") return;
  try {
    await operationsKvFetch(APPROVALS_STATE_KV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        approvedIds: Array.from(memoryApprovedIds),
        customItems: Array.from(memoryCustomApprovals.values()).slice(0, 50),
      }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {}
}

export async function notifyBossTelegramApproval(item: BossPendingApprovalItem): Promise<boolean> {
  if (process.env.SHENGLONG_DISABLE_REMOTE_APPROVAL_KV === "1") return false;
  const token = process.env.ADVISOR_BOT_TOKEN?.trim() || getTelegramBotToken();
  if (!token) return false;
  try {
    const text =
      `📨 <b>【八大部門 AI 審批申請】</b>\n\n` +
      `🏢 <b>申請部門</b>：${item.agentBadge}\n` +
      `📌 <b>申請事項</b>：${item.title}\n` +
      `📝 <b>執行摘要</b>：${item.summary}\n` +
      `💰 <b>預估影響</b>：${item.impactValue}\n\n` +
      `👉 請點選下方按鈕或前往 <a href="https://shenglong.vercel.app/operations">戰情調度中樞</a> 核准執行。`;
    const res = await globalThis.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: BOSS_TELEGRAM_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ 核准執行 (Approve)", callback_data: `apr_approve:${item.id}` },
              { text: "❌ 駁回申請 (Reject)", callback_data: `apr_reject:${item.id}` },
            ],
            [
              { text: "🖥️ 開啟戰情調度中樞", url: "https://shenglong.vercel.app/operations" },
            ],
          ],
        },
      }),
      signal: AbortSignal.timeout(3500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function submitCustomBossApproval(input: {
  deptName: string;
  title: string;
  summary: string;
  impactLabel?: string;
  payload?: Record<string, unknown>;
}): Promise<{ item: BossPendingApprovalItem; telegramNotified: boolean }> {
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newItem: BossPendingApprovalItem = {
    id,
    type: "custom_ai_department_approval",
    agentBadge: String(input.deptName || "AI 助理中心").trim().slice(0, 60),
    title: String(input.title || "待審批任務").trim().slice(0, 120),
    summary: String(input.summary || "請老闆確認是否核准執行").trim().slice(0, 500),
    impactValue: String(input.impactLabel || "L2/L3 權限管控項目").trim().slice(0, 120),
    approveLabel: "✅ 老闆一鍵核准執行",
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await loadBossApprovalState();
  memoryCustomApprovals.set(id, newItem);
  const [, telegramNotified] = await Promise.all([
    persistBossApprovalState(),
    notifyBossTelegramApproval(newItem),
  ]);

  return { item: newItem, telegramNotified };
}

export async function markBossApprovalApproved(itemId: string): Promise<{
  approvedIds: Set<string>;
  customItems: BossPendingApprovalItem[];
}> {
  await loadBossApprovalState();
  memoryApprovedIds.add(itemId);
  if (memoryCustomApprovals.has(itemId)) {
    const existing = memoryCustomApprovals.get(itemId)!;
    memoryCustomApprovals.set(itemId, {
      ...existing,
      status: "approved",
      approvedAt: new Date().toISOString(),
    });
  }
  await persistBossApprovalState();
  return {
    approvedIds: new Set(memoryApprovedIds),
    customItems: Array.from(memoryCustomApprovals.values()),
  };
}


export async function markBossApprovalDismissed(itemId: string): Promise<{
  approvedIds: Set<string>;
  customItems: BossPendingApprovalItem[];
}> {
  await loadBossApprovalState();
  if (memoryCustomApprovals.has(itemId)) {
    const existing = memoryCustomApprovals.get(itemId)!;
    memoryCustomApprovals.set(itemId, {
      ...existing,
      status: "dismissed",
      approvedAt: new Date().toISOString(),
      approvedBy: "SuperAdmin (Telegram 駁回)",
    });
  }
  await persistBossApprovalState();
  return {
    approvedIds: new Set(memoryApprovedIds),
    customItems: Array.from(memoryCustomApprovals.values()),
  };
}

export function resetBossApprovalsForTests() {
  memoryApprovedIds.clear();
  memoryCustomApprovals.clear();
}

export function buildLiveBossApprovalItems(params: {
  unassignedOrders: any[];
  recommendedDriver: string;
  orangeWakeupCount: number;
  redBottleRecoveryCount: number;
  approvedIds?: Set<string>;
}): BossPendingApprovalItem[] {
  const approvedSet = params.approvedIds || new Set<string>();
  const unassigned = Array.isArray(params.unassignedOrders) ? params.unassignedOrders : [];
  // 嚴格遵守離職封存鐵律：僅推薦現役在職外勤（小龍）
  const recDriver =
    params.recommendedDriver && params.recommendedDriver !== "游柏林"
      ? params.recommendedDriver
      : "小龍";

  const items: BossPendingApprovalItem[] = [];

  if (unassigned.length > 0) {
    const idsStr = unassigned.map((o) => `#${o.id}`).join(", ");
    items.push({
      id: "apr_dispatch_today",
      type: "dispatch_unassigned",
      agentBadge: "🛵 2.營運 AI",
      title: `待派工訂單指派（${unassigned.length} 筆：${idsStr}）`,
      summary: `系統依現役外勤班表，建議指派給【${recDriver}】，核准後 1.5 秒寫回門市 ERP dbo.gas_oders.deliver`,
      impactValue: "1.5秒雙向寫入ERP",
      approveLabel: `✅ 核准派給 ${recDriver}`,
      secondaryApproveLabel: "⏳ 保留稍後輸入",
      status: approvedSet.has("apr_dispatch_today") ? "approved" : "pending",
    });
  }

  items.push({
    id: "apr_mkt_orange_wakeup",
    type: "marketing_orange_wakeup",
    agentBadge: "📣 4.行銷 AI",
    title: `14:30 橘燈老友喚醒名單（${params.orangeWakeupCount || 125} 戶，61~90天未叫）`,
    summary:
      "優先鎖定 #1 龍濱路47號2樓(67天)、#85 五股甘仔店(73天)、#91 中直路2-2號(69天)，配發【老友 $50 回購折價券＋免費管線測漏】",
    impactValue: "預計喚回 12~15 戶續訂",
    approveLabel: "✅ 核准排入今日喚醒名單",
    status: approvedSet.has("apr_mkt_orange_wakeup") ? "approved" : "pending",
  });

  items.push({
    id: "apr_mkt_red_barrel",
    type: "marketing_red_barrel_recovery",
    agentBadge: "📣 4.行銷 AI",
    title: "紅燈壓瓶大戶空瓶順路回收（#1660 新莊民安西路 壓瓶 6 支）",
    summary:
      "已停叫 89 天且店內壓瓶 6 支（20kg 新瓶購入成本 $1,550/支），核准後排入外勤順路收回空瓶任務，免買新瓶直接省下購瓶成本",
    impactValue: "立省 $9,300 購瓶費",
    approveLabel: "✅ 核准派外勤順路收瓶",
    status: approvedSet.has("apr_mkt_red_barrel") ? "approved" : "pending",
  });

  items.push({
    id: "apr_fin_debt_tag",
    type: "finance_debt_collection_tag",
    agentBadge: "💰 6.財務 AI",
    title: "歷史重點欠款「隨車必收結清」強制標記",
    summary:
      "針對 #3624 長元街小吃($3,000) 與 #1985 水晶厝($1,230)，於派單備註自動掛載【🚨隨車必收新舊帳】提醒外勤",
    impactValue: "保障 $4,230 應收帳款回收",
    approveLabel: "✅ 核准掛載隨車必收",
    status: approvedSet.has("apr_fin_debt_tag") ? "approved" : "pending",
  });

  return items;
}
