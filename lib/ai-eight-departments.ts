/**
 * ai-eight-departments.ts
 * 👑 盛隆瓦斯八大 AI 部門定案規格 V1.0 權威模型模組
 *
 * 定案日期：2026-11-06
 * 依據老闆親自審批之官方規範 (docs/ai-eight-departments-v1-approved.md)
 * 範圍：盛隆瓦斯專屬；不含 179 人才媒合平台。
 * 安全鐵律：最小權限、按目的授權、唯讀優先、嚴守 Directive #4 舊 ERP 黑盒子零更動！
 */

export type DeptId =
  | "FINANCE_SUPERVISOR"
  | "OPERATIONS_SUPERVISOR"
  | "ADMIN_SPECIALIST"
  | "CUSTOMER_SERVICE_SPECIALIST"
  | "EXECUTIVE_SECRETARY"
  | "SYSTEM_ENGINEER"
  | "SALES_SPECIALIST"
  | "MARKETING_SPECIALIST";

export type SecurityLevel = "L1" | "L2" | "L3";

export interface DeptAction {
  name: string;
  description: string;
  level: "🟢 L1 自動化" | "🟡 L2 預先核准" | "🔴 L3 老闆審批";
  securityLevel: SecurityLevel;
}

export interface DepartmentSpec {
  id: DeptId;
  name: string;
  shortName: string;
  icon: string;
  role: string;
  badge: "🟢 運行中" | "🟡 待審批" | "🔵 待命中";
  responsibilities: string[];
  boundaries: string; // 嚴格權限紅線
  primaryMasterData?: string; // 主責主檔
  collaboratingData?: string[]; // 協作讀取範圍
  systemActions: DeptAction[];
}

export interface IntegratedFeature {
  featureId: string;
  title: string;
  primaryDept: DeptId;
  primaryDeptName: string;
  collaboratingDepts: { deptId: DeptId; deptName: string; scope: string }[];
  description: string;
  safeguardRule: string;
}

export interface SecretaryTaskItem {
  taskId: string;
  title: string;
  commandText: string;
  assignedDeptId: DeptId;
  assignedDeptName: string;
  securityLevel: SecurityLevel;
  securityLevelLabel: string;
  status: "COMPLETED" | "PENDING_APPROVAL" | "PROCESSING" | "BLOCKED";
  statusLabel: string;
  summary: string;
  nextStep: string;
  requiresBossApproval: boolean;
  timestamp: string;
}

/**
 * 👑 八大部門完整權威定案配置表 (V1.0)
 */
export const EIGHT_DEPARTMENTS_CONFIG: DepartmentSpec[] = [
  {
    id: "FINANCE_SUPERVISOR",
    name: "AI 財務主管",
    shortName: "財務主管",
    icon: "💰",
    role: "營收、成本、毛利、淨利、現金流、應收帳款及損益報告",
    badge: "🟢 運行中",
    responsibilities: [
      "官方權威成本核算 (進氣 $22.63/kg、運費 $70/$140、鋼瓶折舊 $33/$6)",
      "官方全規格最低售價底線表審計 (住家 $350~$800、商家 $300~$1625)",
      "純成本底線 (住家 $556、商家 $529) 倒賠即時紅燈攔截",
      "外勤司機 COD 現金自動對帳、短少/溢收差額稽核",
    ],
    boundaries: "可依授權讀取訂單與交易資料，不得任意更動客戶主檔。",
    primaryMasterData: "財務報表、毛利損益、現金對帳帳冊",
    collaboratingData: ["訂單明細 (唯讀)", "配送記錄 (唯讀)"],
    systemActions: [
      { name: "實時淨毛利與底價審計", description: "依官方標準自動比對每筆訂單毛利與最低售價", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "司機繳回現金自動沖帳", description: "核對司機現收金額與預期總額產出差額報告", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "月結大戶對帳單產出與發票開立", description: "月結餐廳對帳確認與發票請款核准", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "OPERATIONS_SUPERVISOR",
    name: "AI 營運主管",
    shortName: "營運主管",
    icon: "🛵",
    role: "訂單、配送、派單建議、庫存、桶帳、營運效率",
    badge: "🟢 運行中",
    responsibilities: [
      "即時外送訂單調度排程與空瓶/滿瓶動態試算",
      "外勤車隊兩輪機車導航 (travelmode=two_wheeler) 順路規劃",
      "全店鋼瓶庫存水位、殘氣抵扣與週轉天數監控",
      "門市 SQL 連線池 45 秒死鎖監控與解鎖機制",
    ],
    boundaries: "正式派單或交易異動須遵守現行核准流程。",
    primaryMasterData: "派單佇列、車載庫存、鋼瓶桶帳",
    collaboratingData: ["客戶地址/大門GPS (唯讀)", "歷史訂單 (唯讀)"],
    systemActions: [
      { name: "機車外送路徑順路試算", description: "依 GPS 座標與大門位置推算最優化行車順序", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "車輛鋼瓶載重防超載試算", description: "即時計算回送空瓶與滿瓶重量防止違規超載", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "重大急單強制切換指派司機", description: "變更外勤派工名冊或跨區調派支援", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "ADMIN_SPECIALIST",
    name: "AI 行政專員",
    shortName: "行政專員",
    icon: "📋",
    role: "人事、出勤、文件、行政流程；主責新增客戶主檔管理",
    badge: "🟢 運行中",
    responsibilities: [
      "主責客戶主檔管理 (新客建檔、標準化地址、樓層清洗、電話正規化)",
      "客戶重複檔案排查、戶號合併與資料品質檢查",
      "外勤同仁出勤打卡、保險卡控與請假行政流程",
      "離職司機四道自毀防線立即停權 (Token/密碼/設備/快取)",
    ],
    boundaries: "歷史交易不可任意修改；新客戶建檔須嚴格依標準規範清洗檢驗。",
    primaryMasterData: "客戶主檔 (dbo.customers 映射)、員工名冊、行政法務文件",
    collaboratingData: ["歷史消費紀錄 (唯讀)"],
    systemActions: [
      { name: "門牌地址標準化清洗", description: "自動過濾樓層防干擾字元並提取大門定位點", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "重複客戶電話/地址排查", description: "比對 3,900+ 戶名冊自動辨識疑似重複建立之客戶", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "客戶資料主檔刪除或合併", description: "涉及歷史累積叫氣紀錄與欠款轉移之異動", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "CUSTOMER_SERVICE_SPECIALIST",
    name: "AI 客服專員",
    shortName: "客服專員",
    icon: "💬",
    role: "客戶查詢、訂單諮詢、客訴、會員服務",
    badge: "🟢 運行中",
    responsibilities: [
      "LINE 官方帳號自然語言訂單自動辨識與要素擷取",
      "盛隆消費者常見 300 題知識庫 0 秒精準命中解答",
      "四語 AI 語音助理 (國語、台語、越南語、英語) 辨識與覆誦",
      "疑似漏氣緊急紅色攔截 (指示關閉角閥開窗並推播門市)",
    ],
    boundaries: "客戶資料異動應提出申請或依授權流程處理，不直接修改主檔。",
    primaryMasterData: "LINE 對話紀錄、知識庫問答快取、客訴工單",
    collaboratingData: ["客戶主檔 (唯讀)", "訂單狀態 (唯讀)"],
    systemActions: [
      { name: "對話自動轉暫存待審訂單", description: "辨識品項數量並寫入暫存單待確認", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "瓦斯漏氣緊急紅色應變推播", description: "第一時間啟動安全指引並全通道告警", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "重大客訴退款或專案補償申請", description: "涉及瓦斯款折抵或爐具維修免單核准", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "EXECUTIVE_SECRETARY",
    name: "AI 秘書",
    shortName: "AI 秘書",
    icon: "🤖",
    role: "統一指令入口、任務分派、跨部門數據分析統籌、通知、報告彙整、任務導航",
    badge: "🟢 運行中",
    responsibilities: [
      "單一指令入口：接收老闆與管理者自然語言，解析意圖並分派專責部門",
      "跨部門數據分析統籌：彙總財務、營運、業務、行銷產出全方位戰報",
      "任務導航與追蹤：即時維護全系統任務狀態、負責部門與下一步指引",
      "統一推播中樞：整合 FCM、LINE、Telegram SuperAdmin 分級推播",
    ],
    boundaries: "不直接修改原始交易資料；確保跨部門資料真實性，同步異常不冒充即時資料。",
    primaryMasterData: "全系統任務導航清單、老闆戰報快照、推播日誌",
    collaboratingData: ["八大部門全域彙總資料 (唯讀)"],
    systemActions: [
      { name: "自然語言指令智慧解析與分派", description: "分析文字意圖並將任務自動派發給對應專責 AI", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "每日營運與財務晨夕戰報彙整", description: "自動生成當日營收、出貨桶數與異常總表呈報老闆", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "跨系統批次任務排程下達", description: "觸發全廠大規模盤點或全量同步批次作業", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "SYSTEM_ENGINEER",
    name: "AI 系統工程師",
    shortName: "系統工程師",
    icon: "🛡️",
    role: "ERP、API、資料庫、雲端服務、同步延遲、日誌與健康監控",
    badge: "🟢 運行中",
    responsibilities: [
      "門市 SQL Server 常駐連線池與極速查詢引擎健康監控",
      "Directive #4 舊 ERP 黑盒子鐵律強制審計 (阻絕破壞性 DDL 與表鎖)",
      "Supabase / Private KV / Vercel Edge 雙向同步鏈路心跳偵測",
      "API 呼叫延遲、429 速率限制與異常日誌自動診斷自癒",
    ],
    boundaries: "正式部署、資料修復需核准；嚴禁對舊門市 SQL 執行結構修改。",
    primaryMasterData: "系統診斷日誌、連線池指標、API 延遲矩陣",
    collaboratingData: ["全系統運行日誌 (唯讀)"],
    systemActions: [
      { name: "連線池與 API 心跳自動巡檢", description: "每 30 秒自動偵測各子系統延遲並記錄指標", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "舊 ERP 黑盒子防護自動攔截", description: "攔截任何未帶 WITH (NOLOCK) 或破壞性 SQL 語法", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "系統版本正式發布或資料修復", description: "執行雲端 API 部署或歷史異常資料強制修復", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "SALES_SPECIALIST",
    name: "AI 業務專員",
    shortName: "業務專員",
    icon: "📊",
    role: "新客開發、業績分析、流失預警、客戶成長與業務改善",
    badge: "🟢 運行中",
    responsibilities: [
      "新興商圈、熱炒店、夜市攤商等大用量潛在客戶潛力分析",
      "生意客戶叫氣頻率異常下降預警 (防範跳槽競業瓦斯行)",
      "商圈滲透率統計 (新莊、泰山、五股各生活圈佔有率分析)",
      "業務提成、大戶合約期滿續約提醒與業績改善建議",
    ],
    boundaries: "提供建議與策略分析，不直接操作後端異動或私自折價。",
    primaryMasterData: "業務開發名冊、競業分析、流失風險客戶矩陣",
    collaboratingData: ["客戶消費頻率 (唯讀)", "訂單金額 (唯讀)"],
    systemActions: [
      { name: "生意大戶叫氣斷崖預警", description: "週叫貨量低於歷史平均 40% 自動發出挽回警報", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "商圈成長潛力報表試算", description: "分析特定街廓空瓶週轉率找出業務拓點機會", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "新簽大戶合約專案價簽核", description: "簽署全新大型連鎖餐廳特惠價格方案", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
  {
    id: "MARKETING_SPECIALIST",
    name: "AI 行銷專員",
    shortName: "行銷專員",
    icon: "📢",
    role: "LINE 活動、會員分群、促銷、回購與成效分析",
    badge: "🟢 運行中",
    responsibilities: [
      "住家 52 天用氣週期追蹤與精準回購倒數通知",
      "客戶分群標籤：45~52天即將用罄、超期斷氣、60天沉睡、90天呆瓶",
      "尊榮個人化 LINE 召回關懷文案自動生成與一鍵複製",
      "節慶促銷推播活動 ROI 轉換率與回購留存分析",
    ],
    boundaries: "專注顧客互動與推播策略，恪守官方定價標準，不可自行破盤促銷。",
    primaryMasterData: "行銷活動文案庫、會員標籤庫、召回排程佇列",
    collaboratingData: ["客戶最後叫氣日 (唯讀)", "客戶偏好規格 (唯讀)"],
    systemActions: [
      { name: "52 天週期沉睡客戶智慧分級", description: "批次比對名冊自動標定需召回名單", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "個人化尊榮關懷文案生成", description: "帶入客戶尊稱、慣用規格與安全承諾產出文案", level: "🟢 L1 自動化", securityLevel: "L1" },
      { name: "全體 LINE 會員廣播行銷活動", description: "向全體綁定會員發送大規模促銷訊息", level: "🔴 L3 老闆審批", securityLevel: "L3" },
    ],
  },
];

/**
 * 👑 三項跨部門整合功能權責矩陣 (V1.0)
 */
export const INTEGRATED_FEATURES: IntegratedFeature[] = [
  {
    featureId: "CUSTOMER_MASTER_DATA",
    title: "客戶主檔資料管理 (Customer Master Data)",
    primaryDept: "ADMIN_SPECIALIST",
    primaryDeptName: "AI 行政專員",
    collaboratingDepts: [
      { deptId: "CUSTOMER_SERVICE_SPECIALIST", deptName: "AI 客服專員", scope: "對話中新電話/新地址提取提報 (不可直接覆寫)" },
      { deptId: "OPERATIONS_SUPERVISOR", deptName: "AI 營運主管", scope: "司機回報大門精準 GPS 座標覆核與套用" },
      { deptId: "FINANCE_SUPERVISOR", deptName: "AI 財務主管", scope: "統一編號、發票抬頭與欠款額度設定" },
    ],
    description: "全面負責客戶名冊之標準化建立、門牌地址階層清洗、重複戶排除與資料品質完整性檢驗。",
    safeguardRule: "行政專員專責；歷史交易資料神聖不可修改；跨部門讀取不代表修改權限。",
  },
  {
    featureId: "CROSS_DEPT_ANALYTICS",
    title: "跨部門數據分析統籌 (Cross-Department Intelligence)",
    primaryDept: "EXECUTIVE_SECRETARY",
    primaryDeptName: "AI 秘書",
    collaboratingDepts: [
      { deptId: "FINANCE_SUPERVISOR", deptName: "AI 財務主管", scope: "提供每公斤實質毛利、營收與現金結存數據" },
      { deptId: "OPERATIONS_SUPERVISOR", deptName: "AI 營運主管", scope: "提供配送時效、車次趟次與鋼瓶週轉率" },
      { deptId: "SALES_SPECIALIST", deptName: "AI 業務專員", scope: "提供新客成長率與商圈流失預警清單" },
      { deptId: "MARKETING_SPECIALIST", deptName: "AI 行銷專員", scope: "提供 52 天回購週期與召回轉化效益" },
    ],
    description: "AI 秘書作為核心大腦，自動彙總八大部門營運數據，定期產出高層決策晨夕報表與異常警示。",
    safeguardRule: "資料必須標註來源、產出時間與同步狀態；同步異常不得以舊資料冒充即時資料。",
  },
  {
    featureId: "SYSTEM_HEALTH_MONITORING",
    title: "系統健康監控與異常自癒 (System Reliability & Health)",
    primaryDept: "SYSTEM_ENGINEER",
    primaryDeptName: "AI 系統工程師",
    collaboratingDepts: [
      { deptId: "OPERATIONS_SUPERVISOR", deptName: "AI 營運主管", scope: "接收打單死鎖與同步延遲即時推播" },
      { deptId: "EXECUTIVE_SECRETARY", deptName: "AI 秘書", scope: "接收系統級熔斷與雲端通訊異常警報" },
    ],
    description: "主責監控門市 SQL 連線池、雲端 API 響應時間、同步中繼程式健康度與舊 ERP 黑盒子安全防禦。",
    safeguardRule: "嚴禁執行任何破壞性 DDL 結構修改；重大部署與資料修復須經老闆核准。",
  },
];

/**
 * 👑 AI 秘書單一指令分派引擎 (Secretary Command Dispatcher)
 * 接收自然語言輸入，自動辨識負責部門、安全防護等級 (L1/L2/L3)，並建立任務導航項
 */
export function parseAndDispatchSecretaryCommand(commandText: string): SecretaryTaskItem {
  const text = commandText.trim();
  const lower = text.toLowerCase();
  const taskId = `TSK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date().toISOString();

  // 1. 識別最高等級 L3 關鍵詞 (涉及金流、調價、資料刪除、正式庫更動、重大調度)
  const isL3ApprovalRequired =
    /價格調降|特惠價|改底價|調價|扣款|退款|開立發票|刪除客戶|強制派單|部署|修改歷史|修復資料|批次廣播/.test(text) ||
    (lower.includes("price") && lower.includes("change")) ||
    lower.includes("delete") ||
    lower.includes("deploy");

  // 2. 部門意圖特徵權重比對
  let assignedDeptId: DeptId = "EXECUTIVE_SECRETARY";
  let title = "一般營運諮詢處理";
  let summary = "";
  let nextStep = "";

  if (/erp|api|資料庫|sql|連線池|連線|延遲|日誌|故障|伺服器|健康|心跳/.test(text)) {
    assignedDeptId = "SYSTEM_ENGINEER";
    title = "系統健康監控與黑盒子維護處理";
    summary = `已轉交 AI 系統工程師，檢測連線池 QPS、API 延遲與舊 ERP 唯讀安全防線。`;
    nextStep = "確認系統診斷面板各指標皆為綠燈正常。";
  } else if (/成本|毛利|淨利|進氣|運費|最低售價|底價|保本|現金|沖帳|對帳|損益|營收|售價|價格|調價|調降|特惠/.test(text)) {
    assignedDeptId = "FINANCE_SUPERVISOR";
    title = "官方成本毛利審計與現金沖帳處理";
    summary = `已轉交 AI 財務主管，比對 Directive #3 權威成本與最新全規格最低售價底線表。`;
    nextStep = "進入【AI 財務主管】操作面板查閱訂單審計明細與司機現金沖帳狀態。";
  } else if (/派單|配送|外送|司機|車載|庫存|鋼瓶|桶帳|死鎖|順路|裝載|排程/.test(text)) {
    assignedDeptId = "OPERATIONS_SUPERVISOR";
    title = "車隊調度與營運庫存排程處理";
    summary = `已轉交 AI 營運主管，評估司機負載、兩輪機車導航路徑與鋼瓶週轉現況。`;
    nextStep = "確認外送清單與車輛載重，即時推送停靠點至外勤端。";
  } else if (/新客戶|客戶主檔|客戶資料|建檔|改地址|大門|重複戶|重複帳號|人事|出勤|打卡|離職|停權|戶號|刪除客戶/.test(text)) {
    assignedDeptId = "ADMIN_SPECIALIST";
    title = "客戶主檔維護與行政作業處理";
    summary = `已轉交 AI 行政專員，執行門牌地址階層清洗、重號排查與客戶主檔品質管控。`;
    nextStep = "檢視行政專員標準化地址結果，確認無重複戶後建立新檔案。";
  } else if (/line|客服|客訴|漏氣|瓦斯味|語音|叫瓦斯|諮詢|題庫/.test(text)) {
    assignedDeptId = "CUSTOMER_SERVICE_SPECIALIST";
    title = "客服應答與緊急安全支援處理";
    summary = `已轉交 AI 客服專員，檢索消費者 300 題知識庫並監控是否有漏氣等安全風險。`;
    nextStep = "若涉及漏氣立即觸發紅色關閥開窗指引，一般諮詢則自動生成回覆。";
  } else if (/52天|週期|沉睡客|召回|促銷|會員|推播|活動|文案/.test(text)) {
    assignedDeptId = "MARKETING_SPECIALIST";
    title = "52天週期顧客召回與促銷分析處理";
    summary = `已轉交 AI 行銷專員，篩選 45~52 天臨界斷氣與 60 天沉睡名冊，產出召回文案。`;
    nextStep = "複製個人化尊榮召回文案，透過 LINE 官方帳號進行精準推播。";
  } else if (/新商圈|開拓|業務|競爭|流失|夜市大戶|餐廳大戶|合約/.test(text)) {
    assignedDeptId = "SALES_SPECIALIST";
    title = "新商圈開發與業務成長分析處理";
    summary = `已轉交 AI 業務專員，評估商圈用量潛力與高風險跳槽大戶挽回策略。`;
    nextStep = "匯出目標商圈開拓建議清單與大戶關懷策略報告。";
  } else {
    // 預設由秘書統籌
    assignedDeptId = "EXECUTIVE_SECRETARY";
    title = "跨部門全域指令統籌處理";
    summary = `由 AI 秘書統一受理，統籌財務、營運、行銷各部門現有指標彙整呈報。`;
    nextStep = "查閱全域營運戰報摘要，或依個別模組進一步下達專屬子指令。";
  }

  const assignedDept = EIGHT_DEPARTMENTS_CONFIG.find((d) => d.id === assignedDeptId)!;
  const securityLevel: SecurityLevel = isL3ApprovalRequired ? "L3" : "L1";

  return {
    taskId,
    title,
    commandText: text,
    assignedDeptId,
    assignedDeptName: assignedDept.name,
    securityLevel,
    securityLevelLabel: securityLevel === "L3" ? "🔴 L3 老闆審批" : "🟢 L1 自動化執行",
    status: securityLevel === "L3" ? "PENDING_APPROVAL" : "COMPLETED",
    statusLabel: securityLevel === "L3" ? "⏳ 待老闆簽核" : "✅ 執行完成",
    summary,
    nextStep,
    requiresBossApproval: securityLevel === "L3",
    timestamp: now,
  };
}
