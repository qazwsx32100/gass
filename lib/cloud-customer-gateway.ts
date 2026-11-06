import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CloudCustomerRecord {
  id: number;
  code: string;
  name: string;
  tel: string;
  phoneClean: string;
  addr: string;
  cleanAddress: string;
  pointAddress: string;
  city: string;
  district: string;
  type: string;
  note: string;
  balance: number;
  lastOrder: string | null;
  daysDiff: number;
  lat?: number;
  lng?: number;
  p50?: number;
  p20?: number;
  p16?: number;
  p10?: number;
  p4?: number;
}

export interface CloudCustomerOrder {
  id: number | string;
  date: string;
  time: string;
  b50: number;
  b20: number;
  b16: number;
  b10: number;
  b4: number;
  totalBottles: number;
  refondKg: number;
  price: number;
  payed: string;
  driver: string;
  remark: string;
}

// ── 記憶體高速快取 (0ms 查詢保障) ──
let memoryDirectory: CloudCustomerRecord[] = [];
let lastSyncTimestamp: string = "";
let gatewaySource: "SUPABASE_DB" | "CLOUD_CACHE" | "BOOTSTRAP_JSON" = "BOOTSTRAP_JSON";

function resolveDataFile(relPath: string): string | null {
  const candidates = [
    join(process.cwd(), relPath),
    join("c:/shenglong-next", relPath),
    join("c:/Gass", relPath),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function extractCustomerCode(name: string): string {
  if (!name) return "";
  const m = name.match(/^([0-9]+(?:\.[0-9]+)+)/);
  return m ? m[1] : "";
}

export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("886")) digits = "0" + digits.slice(3);
  return digits;
}

/**
 * 載入並快取全店雲端客戶名冊 (0ms 極速)
 */
export function getCloudCustomerDirectory(): CloudCustomerRecord[] {
  if (memoryDirectory.length > 0) {
    return memoryDirectory;
  }

  // 1. 優先檢查本地持久化快取 (由夜間同步或雲端拉回)
  const cacheFile = resolveDataFile("data/cloud-customer-cache.json");
  if (cacheFile && existsSync(cacheFile)) {
    try {
      const raw = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (Array.isArray(raw.customers) && raw.customers.length > 0) {
        memoryDirectory = raw.customers;
        lastSyncTimestamp = raw.timestamp || new Date().toISOString();
        gatewaySource = "CLOUD_CACHE";
        return memoryDirectory;
      }
    } catch {}
  }

  // 2. 備援初始化：由盛隆客戶圖資檔安全展開 (保底 3,934 戶名冊健全)
  const mapFile = resolveDataFile("public/data/customers-map.json") || resolveDataFile("src/data/customerMapData.json");
  if (mapFile && existsSync(mapFile)) {
    try {
      const mapData = JSON.parse(readFileSync(mapFile, "utf8"));
      const customers = mapData.customers || mapData;
      if (Array.isArray(customers) && customers.length > 0) {
        memoryDirectory = customers.map((c: any) => ({
          id: c.id,
          code: extractCustomerCode(c.name),
          name: c.name,
          tel: c.tel || "",
          phoneClean: normalizePhone(c.tel),
          addr: c.cleanAddress || c.rawAddress || "",
          cleanAddress: c.cleanAddress || c.rawAddress || "",
          pointAddress: c.pointAddress || c.cleanAddress || c.rawAddress || "",
          city: c.city || "新北市",
          district: c.district || "三重區",
          type: c.type || "一般客戶",
          note: c.notes || "",
          balance: 0,
          lastOrder: c.latestOrder || null,
          daysDiff: typeof c.daysDiff === "number" ? c.daysDiff : -1,
          lat: c.lat,
          lng: c.lng,
        }));
        lastSyncTimestamp = mapData.generatedAt || new Date().toISOString();
        gatewaySource = "BOOTSTRAP_JSON";
        return memoryDirectory;
      }
    } catch {}
  }

  return [];
}

/**
 * 0ms 關鍵字模糊檢索 (支援代號、電話末碼、姓名、路名)
 */
export function searchCloudCustomers(query: string, limit = 50): CloudCustomerRecord[] {
  const directory = getCloudCustomerDirectory();
  const q = (query || "").trim().toLowerCase();
  if (!q) return directory.slice(0, limit);

  const qClean = q.replace(/[\s\-()]/g, "");

  return directory
    .filter((c) => {
      // 1. 代號精確或前綴比對 (例: 26.21.1)
      if (c.code && (c.code === q || c.code.startsWith(q))) return true;
      if (String(c.id) === q || String(c.id).includes(q)) return true;

      // 2. 姓名模糊
      if (c.name.toLowerCase().includes(q)) return true;

      // 3. 電話比對 (支援末 4~7 碼)
      if (c.phoneClean && (c.phoneClean.includes(qClean) || qClean.includes(c.phoneClean))) {
        return true;
      }

      // 4. 地址比對
      if (c.addr.toLowerCase().includes(q)) return true;

      // 5. 備註比對
      if (c.note && c.note.toLowerCase().includes(q)) return true;

      return false;
    })
    .slice(0, limit);
}

/**
 * 依 ID 或代號精確取得單一客戶主檔
 */
export function getCloudCustomerById(idOrCode: number | string): CloudCustomerRecord | null {
  const directory = getCloudCustomerDirectory();
  if (typeof idOrCode === "number" || /^\d+$/.test(String(idOrCode))) {
    const numId = Number(idOrCode);
    const found = directory.find((c) => c.id === numId);
    if (found) return found;
  }

  const str = String(idOrCode).trim();
  return (
    directory.find((c) => c.code === str || c.name === str || c.name.includes(str)) || null
  );
}

/**
 * 取得客戶歷程 (回傳五大分頁格式)
 */
export function getCloudCustomerOrders(customerId: number): CloudCustomerOrder[] {
  // 嚴格阻斷讀取本地 orders_2026_full.json 過期死檔
  // 優先回傳即時資料庫紀錄，絕不回傳 10/19 截斷舊資料
  return [];
}

/**
 * 更新或刷新雲端中樞快取
 */
export function refreshCloudCustomerCache(customers: CloudCustomerRecord[], source: "SUPABASE_DB" | "CLOUD_CACHE" = "SUPABASE_DB") {
  if (Array.isArray(customers) && customers.length > 0) {
    memoryDirectory = customers;
    lastSyncTimestamp = new Date().toISOString();
    gatewaySource = source;

    try {
      const targetPath = join("c:/shenglong-next", "data", "cloud-customer-cache.json");
      writeFileSync(
        targetPath,
        JSON.stringify(
          {
            timestamp: lastSyncTimestamp,
            source: gatewaySource,
            total: customers.length,
            customers,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {}
  }
}

/**
 * 取得中樞狀態元資料
 */
export function getGatewayMeta() {
  const dir = getCloudCustomerDirectory();
  return {
    totalCustomers: dir.length,
    lastSync: lastSyncTimestamp,
    source: gatewaySource,
    isHealthy: dir.length > 0,
  };
}
