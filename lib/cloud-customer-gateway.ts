import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

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
  preferredSpec?: string;
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
  orderCount?: number;
  recentYearCount?: number;
  borrowCylinders?: number;
  oweCylinders?: number;
  lastP50?: number;
  lastP20?: number;
  lastP16?: number;
  lastP10?: number;
  lastP4?: number;
  active?: boolean;
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

export type CloudOrderTuple = [
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  string,
  string,
];

// ── 記憶體高速快取與 402/離線熔斷保護 (遵守 AI犯錯中心 額度鐵律) ──
const DIRECTORY_TTL_MS = 10 * 60 * 1000; // 10 分鐘名冊快取
const ORDERS_TTL_MS = 2 * 60 * 1000;     // 2 分鐘單客歷史訂單快取
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 分鐘熔斷冷卻
const MAX_CACHED_CUSTOMERS_ORDERS = 250;

let memoryDirectory: CloudCustomerRecord[] = [];
let lastSyncTimestamp = "";
let lastSupabaseDirectoryFetchAt = 0;
let supabaseCircuitOpenUntil = 0;
let inflightDirectoryPromise: Promise<CloudCustomerRecord[]> | null = null;
let gatewaySource: "SUPABASE_DB" | "CLOUD_CACHE" | "BOOTSTRAP_JSON" = "BOOTSTRAP_JSON";

const memoryOrdersByCustomer = new Map<
  number,
  { fetchedAt: number; orders: CloudCustomerOrder[] }
>();

function resolveSupabaseConfig(): { url: string; headers: Record<string, string> } | null {
  // 👑 優先連向盛隆官方 LINE / 客戶專屬 Supabase (LINE_SUPABASE_URL)，與財報主庫完全隔離
  const lineUrl = String(process.env.LINE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const lineKey = String(
    process.env.LINE_SUPABASE_SECRET_KEY ||
      process.env.LINE_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.LINE_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  if (lineUrl && lineKey) {
    const headers: Record<string, string> = { apikey: lineKey };
    if (!lineKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${lineKey}`;
    return { url: lineUrl, headers };
  }

  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  )
    .trim()
    .replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  if (!url || !key) return null;
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return { url, headers };
}

function resolveDataFile(relPath: string): string | null {
  const candidates = [
    join(process.cwd(), relPath),
    join(process.cwd(), "public", relPath),
    join("d:/test/shenglong-next", relPath),
    join("d:/test/gass", relPath),
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
  if (m) return m[1];
  const m2 = name.match(/^([0-9]+(?:[-.][0-9]+)+)/);
  if (m2) return m2[1];
  return "";
}

export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("886")) digits = "0" + digits.slice(3);
  return digits;
}

function mapSupabaseCustomerRow(row: Record<string, any>): CloudCustomerRecord {
  const name = String(row.name || "").trim();
  const tel = String(row.tel || "").trim();
  const addr = String(row.address || row.clean_address || "").trim();
  const cleanAddress = String(row.clean_address || addr).trim();
  return {
    id: Number(row.id) || 0,
    code: String(row.code || extractCustomerCode(name)).trim(),
    name,
    tel,
    phoneClean: String(row.phone_clean || normalizePhone(tel)).trim(),
    addr,
    cleanAddress,
    pointAddress: String(row.point_address || cleanAddress || addr).trim(),
    city: String(row.city || "新北市").trim(),
    district: String(row.district || "三重區").trim(),
    type: String(row.customer_type || "一般客戶").trim(),
    preferredSpec: String(row.preferred_spec || "").trim() || undefined,
    note: String(row.notes || "").trim(),
    balance: Number(row.balance) || 0,
    lastOrder: row.last_order_date ? String(row.last_order_date).trim() : null,
    daysDiff: typeof row.days_diff === "number" ? row.days_diff : Number(row.days_diff ?? -1),
    lat: typeof row.lat === "number" ? row.lat : undefined,
    lng: typeof row.lng === "number" ? row.lng : undefined,
    p50: Number(row.p50) || undefined,
    p20: Number(row.p20) || undefined,
    p16: Number(row.p16) || undefined,
    p10: Number(row.p10) || undefined,
    p4: Number(row.p4) || undefined,
    active: row.active !== false,
  };
}

function mapSupabaseOrderRow(row: Record<string, any>): CloudCustomerOrder {
  const b50 = Number(row.b50) || 0;
  const b20 = Number(row.b20) || 0;
  const b16 = Number(row.b16) || 0;
  const b10 = Number(row.b10) || 0;
  const b4 = Number(row.b4) || 0;
  const rawTotal = Number(row.total_bottles);
  return {
    id: row.order_id ?? row.id ?? "",
    date: String(row.order_date || "").trim(),
    time: String(row.order_time || "").trim(),
    b50,
    b20,
    b16,
    b10,
    b4,
    totalBottles: Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : b50 + b20 + b16 + b10 + b4,
    refondKg: Number(row.refond_kg) || 0,
    price: Number(row.price) || 0,
    payed: String(row.payed || "已付款").trim(),
    driver: String(row.driver || "").trim(),
    remark: String(row.remark || "").trim(),
  };
}

export function formatCloudOrderTuple(o: CloudCustomerOrder): CloudOrderTuple {
  return [
    o.date,
    o.time,
    o.b50,
    o.b20,
    o.b16,
    o.b10,
    o.b4,
    o.refondKg,
    o.price,
    o.payed,
    o.driver,
    o.remark,
  ];
}

export function computeActualDaysDiff(
  lastOrderStr?: string | null,
  fallbackDaysDiff?: number,
): number {
  if (lastOrderStr) {
    const parts = String(lastOrderStr).trim().replace(/-/g, "/").split("/");
    if (parts.length >= 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (y > 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const nowTaipei = new Date(Date.now() + 8 * 3600 * 1000);
        const todayMs = Date.UTC(
          nowTaipei.getUTCFullYear(),
          nowTaipei.getUTCMonth(),
          nowTaipei.getUTCDate(),
        );
        const orderMs = Date.UTC(y, m - 1, d);
        const diff = Math.floor((todayMs - orderMs) / 86400000);
        return diff >= 0 ? diff : 0;
      }
    }
  }
  if (typeof fallbackDaysDiff === "number" && fallbackDaysDiff >= 0) {
    return fallbackDaysDiff;
  }
  return 99999;
}

/**
 * 活躍熟客優先排序：
 * 1. 半年內 (<=180天) 有叫貨之活躍熟客排在超過半年未叫之流失戶前面
 * 2. 活躍戶內依「近 1 年叫貨次數 (recentYearCount)」由高到低排序
 * 3. 同次數時依「最近送貨日 (daysDiff)」越近越前，再依歷史總次數 (orderCount) 由高到低
 */
export function sortCustomersByActiveFrequency(
  a: Partial<CloudCustomerRecord>,
  b: Partial<CloudCustomerRecord>,
): number {
  const aDays =
    typeof a.daysDiff === "number" && a.daysDiff >= 0 && !a.lastOrder
      ? a.daysDiff
      : computeActualDaysDiff(a.lastOrder, a.daysDiff);
  const bDays =
    typeof b.daysDiff === "number" && b.daysDiff >= 0 && !b.lastOrder
      ? b.daysDiff
      : computeActualDaysDiff(b.lastOrder, b.daysDiff);

  const aActive = aDays <= 180 ? 1 : 0;
  const bActive = bDays <= 180 ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;

  const aRecent = Number(a.recentYearCount) || 0;
  const bRecent = Number(b.recentYearCount) || 0;
  if (bRecent !== aRecent) return bRecent - aRecent;

  if (aDays !== bDays) return aDays - bDays;

  const aTotal = Number(a.orderCount) || 0;
  const bTotal = Number(b.orderCount) || 0;
  if (bTotal !== aTotal) return bTotal - aTotal;

  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

/**
 * 從客戶歷史訂單 (由新到舊) 精算各規格最近一次「單一規格且無存氣扣抵」之實際成交單價
 */
export function computeRecentUnitPricesFromOrders(
  ordersOrTuples: Array<CloudCustomerOrder | any[]>,
): {
  lastP50: number | null;
  lastP20: number | null;
  lastP16: number | null;
  lastP10: number | null;
  lastP4: number | null;
} {
  let lastP50: number | null = null;
  let lastP20: number | null = null;
  let lastP16: number | null = null;
  let lastP10: number | null = null;
  let lastP4: number | null = null;

  if (!Array.isArray(ordersOrTuples)) {
    return { lastP50, lastP20, lastP16, lastP10, lastP4 };
  }

  for (const item of ordersOrTuples) {
    const isArr = Array.isArray(item);
    const b50 = Number(isArr ? item[2] : item.b50) || 0;
    const b20 = Number(isArr ? item[3] : item.b20) || 0;
    const b16 = Number(isArr ? item[4] : item.b16) || 0;
    const b10 = Number(isArr ? item[5] : item.b10) || 0;
    const b4 = Number(isArr ? item[6] : item.b4) || 0;
    const refond = Number(isArr ? item[7] : item.refondKg) || 0;
    const price = Number(isArr ? item[8] : item.price) || 0;

    if (refond > 0 || price <= 0) continue;
    const nonZeroSpecs =
      (b50 > 0 ? 1 : 0) +
      (b20 > 0 ? 1 : 0) +
      (b16 > 0 ? 1 : 0) +
      (b10 > 0 ? 1 : 0) +
      (b4 > 0 ? 1 : 0);
    if (nonZeroSpecs !== 1) continue;

    if (b50 > 0 && lastP50 === null) {
      const u = Math.round(price / b50);
      if (u >= 500 && u <= 5000) lastP50 = u;
    } else if (b20 > 0 && lastP20 === null) {
      const u = Math.round(price / b20);
      if (u >= 250 && u <= 3000) lastP20 = u;
    } else if (b16 > 0 && lastP16 === null) {
      const u = Math.round(price / b16);
      if (u >= 250 && u <= 3000) lastP16 = u;
    } else if (b10 > 0 && lastP10 === null) {
      const u = Math.round(price / b10);
      if (u >= 200 && u <= 2500) lastP10 = u;
    } else if (b4 > 0 && lastP4 === null) {
      const u = Math.round(price / b4);
      if (u >= 150 && u <= 2000) lastP4 = u;
    }

    if (
      lastP50 !== null &&
      lastP20 !== null &&
      lastP16 !== null &&
      lastP10 !== null &&
      lastP4 !== null
    ) {
      break;
    }
  }

  return { lastP50, lastP20, lastP16, lastP10, lastP4 };
}

/**
 * 載入並快取全店雲端客戶名冊 (0ms 同步快取讀取，預設依活躍熟客頻率排序)
 */
export function loadBaselineDirectory(): CloudCustomerRecord[] {
  const cacheFile =
    resolveDataFile("public/data/cloud-customer-cache.json") ||
    resolveDataFile("data/cloud-customer-cache.json");
  if (cacheFile && existsSync(cacheFile)) {
    try {
      const raw = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (Array.isArray(raw.customers) && raw.customers.length > 0) {
        if (!lastSyncTimestamp) {
          lastSyncTimestamp = String(raw.timestamp || raw.updatedAt || new Date().toISOString());
        }
        return [...raw.customers]
          .map((c: CloudCustomerRecord) => ({
            ...c,
            code: c.code || extractCustomerCode(c.name),
            daysDiff: computeActualDaysDiff(c.lastOrder, c.daysDiff),
          }))
          .sort(sortCustomersByActiveFrequency);
      }
    } catch {}
  }

  const mapFile =
    resolveDataFile("public/data/customers-map.json") ||
    resolveDataFile("src/data/customerMapData.json");
  if (mapFile && existsSync(mapFile)) {
    try {
      const mapData = JSON.parse(readFileSync(mapFile, "utf8"));
      const customers = mapData.customers || mapData;
      if (Array.isArray(customers) && customers.length > 0) {
        if (!lastSyncTimestamp) {
          lastSyncTimestamp = String(mapData.updatedAt || new Date().toISOString());
        }
        return customers
          .map((c: any) => ({
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
            daysDiff: computeActualDaysDiff(c.latestOrder || null, c.daysDiff ?? 999),
            p50: c.p50,
            p20: c.p20,
            p16: c.p16,
            p10: c.p10,
            p4: c.p4,
          }))
          .sort(sortCustomersByActiveFrequency);
      }
    } catch {}
  }
  return [];
}

export function getCloudCustomerDirectory(): CloudCustomerRecord[] {
  if (memoryDirectory.length > 0) {
    return memoryDirectory;
  }

  const baseline = loadBaselineDirectory();
  if (baseline.length > 0) {
    memoryDirectory = baseline;
    gatewaySource = "CLOUD_CACHE";
    return memoryDirectory;
  }
  return [];
}

/**
 * 雲端唯一真理：從 Supabase `public.cloud_customers` 拉取最新客戶主檔（附 10 分鐘快取與 5 分鐘熔斷）
 */
export async function ensureCloudCustomerDirectoryLoaded(
  force = false,
): Promise<CloudCustomerRecord[]> {
  const now = Date.now();
  if (
    !force &&
    gatewaySource === "SUPABASE_DB" &&
    memoryDirectory.length > 0 &&
    now - lastSupabaseDirectoryFetchAt < DIRECTORY_TTL_MS
  ) {
    return memoryDirectory;
  }

  const cfg = resolveSupabaseConfig();
  if (!cfg || now < supabaseCircuitOpenUntil) {
    return getCloudCustomerDirectory();
  }

  if (inflightDirectoryPromise) {
    return inflightDirectoryPromise;
  }

  inflightDirectoryPromise = (async () => {
    try {
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 10;
      const allRows: Record<string, any>[] = [];

      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * PAGE_SIZE;
        const endpoint =
          `${cfg.url}/rest/v1/cloud_customers` +
          `?select=id,code,name,tel,phone_clean,address,clean_address,point_address,city,district,customer_type,preferred_spec,balance,last_order_date,days_diff,lat,lng,notes,p50,p20,p16,p10,p4,active` +
          `&active=is.true&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await globalThis.fetch(endpoint, {
          method: "GET",
          headers: {
            ...cfg.headers,
            Accept: "application/json",
            Range: `${offset}-${offset + PAGE_SIZE - 1}`,
          },
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });

        if (res.status === 402 || res.status === 401 || res.status === 403 || res.status >= 500) {
          supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
          return getCloudCustomerDirectory();
        }
        if (!res.ok) {
          break;
        }

        const pageRows = await res.json();
        if (!Array.isArray(pageRows) || pageRows.length === 0) {
          break;
        }
        allRows.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) {
          break;
        }
      }

      if (allRows.length > 0) {
        const mapped = allRows
          .map((r) => mapSupabaseCustomerRow(r))
          .filter((c) => c.id > 0 && c.name.length > 0);
        if (mapped.length > 0) {
          // 🛡️ 全量分頁合併 + 保留本地預計算叫貨頻率、桶帳與實際成交單價（不破壞原始 p50~p4 差價欄位）
          const baseline = loadBaselineDirectory();
          const mergedMap = new Map<number, CloudCustomerRecord>();
          for (const c of baseline) {
            mergedMap.set(c.id, c);
          }
          for (const c of mapped) {
            const base = mergedMap.get(c.id);
            const normCloudLast = c.lastOrder ? c.lastOrder.replace(/-/g, "/") : null;
            const normBaseLast = base?.lastOrder ? base.lastOrder.replace(/-/g, "/") : null;
            const isCloudStrictlyNewer = !base || (normCloudLast !== null && (!normBaseLast || normCloudLast > normBaseLast));
            const bestLastOrder =
              isCloudStrictlyNewer && normCloudLast
                ? normCloudLast
                : normBaseLast || normCloudLast;
            mergedMap.set(c.id, {
              ...base,
              ...c,
              code: c.code || base?.code || extractCustomerCode(c.name),
              // 🛡️ 若本地 SL_customers.csv 基準較新或同日，嚴禁被較舊的 Supabase 0 欠款、舊差價、舊類別或空白備註覆蓋
              type: isCloudStrictlyNewer ? (c.type || base?.type || "一般客戶") : (base?.type || c.type || "一般客戶"),
              note: isCloudStrictlyNewer ? (c.note || base?.note || "") : (base?.note || c.note || ""),
              balance: isCloudStrictlyNewer ? (c.balance ?? base?.balance ?? 0) : (base?.balance ?? c.balance ?? 0),
              p50: isCloudStrictlyNewer ? (c.p50 ?? base?.p50 ?? 0) : (base?.p50 ?? c.p50 ?? 0),
              p20: isCloudStrictlyNewer ? (c.p20 ?? base?.p20 ?? 0) : (base?.p20 ?? c.p20 ?? 0),
              p16: isCloudStrictlyNewer ? (c.p16 ?? base?.p16 ?? 0) : (base?.p16 ?? c.p16 ?? 0),
              p10: isCloudStrictlyNewer ? (c.p10 ?? base?.p10 ?? 0) : (base?.p10 ?? c.p10 ?? 0),
              p4: isCloudStrictlyNewer ? (c.p4 ?? base?.p4 ?? 0) : (base?.p4 ?? c.p4 ?? 0),
              orderCount: c.orderCount ?? base?.orderCount ?? 0,
              recentYearCount: c.recentYearCount ?? base?.recentYearCount ?? 0,
              borrowCylinders: c.borrowCylinders ?? base?.borrowCylinders ?? 0,
              oweCylinders: c.oweCylinders ?? base?.oweCylinders ?? 0,
              lastP50: c.lastP50 ?? base?.lastP50,
              lastP20: c.lastP20 ?? base?.lastP20,
              lastP16: c.lastP16 ?? base?.lastP16,
              lastP10: c.lastP10 ?? base?.lastP10,
              lastP4: c.lastP4 ?? base?.lastP4,
              lastOrder: bestLastOrder,
              daysDiff: computeActualDaysDiff(bestLastOrder, c.daysDiff >= 0 ? c.daysDiff : base?.daysDiff),
            });
          }
          memoryDirectory = Array.from(mergedMap.values()).sort(sortCustomersByActiveFrequency);
          gatewaySource = "SUPABASE_DB";
          lastSupabaseDirectoryFetchAt = Date.now();
          lastSyncTimestamp = new Date().toISOString();
          return memoryDirectory;
        }
      }
      return getCloudCustomerDirectory();
    } catch {
      supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      return getCloudCustomerDirectory();
    } finally {
      inflightDirectoryPromise = null;
    }
  })();

  return inflightDirectoryPromise;
}

/**
 * 0ms 關鍵字模糊檢索 (支援代號、電話末碼、姓名、路名，同匹配等級內以常叫活躍熟客優先排序)
 */
export function searchCloudCustomers(query: string, limit = 50): CloudCustomerRecord[] {
  const directory = getCloudCustomerDirectory();
  const q = (query || "").trim().toLowerCase();
  if (!q) return directory.slice(0, limit);

  const qClean = q.replace(/[\s\-()]/g, "");
  const scored: Array<{ tier: number; cust: CloudCustomerRecord }> = [];

  for (const c of directory) {
    const cCode = (c.code || "").toLowerCase();
    const cName = (c.name || "").toLowerCase();
    let tier = 0;

    if (
      (cCode && cCode === q) ||
      String(c.id) === q ||
      (c.phoneClean && qClean.length >= 7 && c.phoneClean === qClean)
    ) {
      tier = 1;
    } else if (
      (cCode && cCode.startsWith(q)) ||
      cName === q
    ) {
      tier = 2;
    } else if (
      cName.includes(q) ||
      (c.phoneClean && qClean.length >= 3 && (c.phoneClean.includes(qClean) || qClean.includes(c.phoneClean))) ||
      String(c.id).includes(q)
    ) {
      tier = 3;
    } else if (
      c.addr.toLowerCase().includes(q) ||
      (c.note && c.note.toLowerCase().includes(q))
    ) {
      tier = 4;
    }

    if (tier > 0) {
      scored.push({ tier, cust: c });
    }
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return sortCustomersByActiveFrequency(a.cust, b.cust);
  });

  return scored.slice(0, limit).map((s) => s.cust);
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
  if (str) {
    const foundByStr = directory.find((c) => c.code === str || c.name === str || c.name.includes(str));
    if (foundByStr) return foundByStr;
  }

  // 🛡️ 雙重保底防護：若當前 memoryDirectory 因網路過濾未包含該戶，直查本地全量快照 (3,943 戶)
  const baseline = loadBaselineDirectory();
  if (typeof idOrCode === "number" || /^\d+$/.test(String(idOrCode))) {
    const numId = Number(idOrCode);
    const bFound = baseline.find((c) => c.id === numId);
    if (bFound) return bFound;
  }
  if (str) {
    return baseline.find((c) => c.code === str || c.name === str || c.name.includes(str)) || null;
  }
  return null;
}

let localHistoricalOrdersIndex: Map<number, CloudCustomerOrder[]> | null = null;

function loadTuplesFromFile(
  filePath: string,
  indexMap: Map<number, CloudCustomerOrder[]>,
) {
  if (!existsSync(filePath)) return;
  try {
    const text = filePath.endsWith(".gz")
      ? gunzipSync(readFileSync(filePath)).toString("utf8")
      : readFileSync(filePath, "utf8");
    const raw = JSON.parse(text);
    if (raw && typeof raw === "object") {
      for (const [idStr, tuples] of Object.entries(raw)) {
        const cid = Number(idStr);
        if (cid > 0 && Array.isArray(tuples)) {
          const mappedOrders: CloudCustomerOrder[] = (tuples as any[]).map((t) => ({
            id: t[12] || `${cid}-${t[0]}-${t[1]}`,
            date: String(t[0] || ""),
            time: String(t[1] || ""),
            b50: Number(t[2]) || 0,
            b20: Number(t[3]) || 0,
            b16: Number(t[4]) || 0,
            b10: Number(t[5]) || 0,
            b4: Number(t[6]) || 0,
            totalBottles:
              (Number(t[2]) || 0) +
              (Number(t[3]) || 0) +
              (Number(t[4]) || 0) +
              (Number(t[5]) || 0) +
              (Number(t[6]) || 0),
            refondKg: Number(t[7]) || 0,
            price: Number(t[8]) || 0,
            payed: String(t[9] || "已付款"),
            driver: String(t[10] || ""),
            remark: String(t[11] || ""),
          }));
          const existing = indexMap.get(cid) || [];
          indexMap.set(cid, existing.concat(mappedOrders));
        }
      }
    }
  } catch {}
}

/**
 * 載入並快取客戶歷年離線訂單索引 (整合 2026 全量與 2023~2025 歷史庫，0ms 極速讀取)
 */
export function ensureLocalHistoricalOrdersLoaded(): Map<number, CloudCustomerOrder[]> {
  if (localHistoricalOrdersIndex) {
    return localHistoricalOrdersIndex;
  }
  localHistoricalOrdersIndex = new Map();

  // 0. 優先載入 2007 ~ 2026 全歷史 (SL_orders.csv 23.7萬+筆) Gzip 壓縮索引
  const fileFullGz = resolveDataFile("public/data/customer-orders-full.json.gz") || resolveDataFile("data/customer-orders-full.json.gz");
  if (fileFullGz) loadTuplesFromFile(fileFullGz, localHistoricalOrdersIndex);

  // 1. 融合載入 2026 全量訂單索引
  const file2026 =
    resolveDataFile("public/data/customer-orders-2026.json") ||
    resolveDataFile("data/customer-orders-2026.json");
  if (file2026) {
    loadTuplesFromFile(file2026, localHistoricalOrdersIndex);
  }

  // 2. 融合載入 2023 ~ 2025 歷年歷史訂單索引 (若存在)
  const file2023_2025 =
    resolveDataFile("public/data/customer-orders-2023-2025.json") ||
    resolveDataFile("data/customer-orders-2023-2025.json");
  if (file2023_2025) {
    loadTuplesFromFile(file2023_2025, localHistoricalOrdersIndex);
  }

  // 3. 去重並依日期時間倒序排列
  for (const [cid, orders] of localHistoricalOrdersIndex.entries()) {
    const seen = new Set<string>();
    const deduplicated: CloudCustomerOrder[] = [];
    for (const o of orders) {
      const key = String(o.id);
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(o);
      }
    }
    deduplicated.sort((a, b) => {
      const da = a.date + " " + (a.time || "");
      const db = b.date + " " + (b.time || "");
      return db.localeCompare(da);
    });
    localHistoricalOrdersIndex.set(cid, deduplicated);
  }

  return localHistoricalOrdersIndex;
}

function decodeSimpleEntities(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * 找出同一客戶在名冊中的所有關聯客號 ID（雙重歸戶防漏單：同名、或同代號+同電話末7碼）
 */
export function findRelatedCustomerIds(customerId: number): number[] {
  const cleanId = Math.trunc(Number(customerId) || 0);
  if (cleanId <= 0) return [];
  const directory = getCloudCustomerDirectory();
  const target = directory.find((c) => c.id === cleanId);
  if (!target) return [cleanId];

  const targetName = decodeSimpleEntities(target.name).trim().toLowerCase();
  const targetCode = (target.code || extractCustomerCode(target.name)).trim().toLowerCase();
  const targetPhone = normalizePhone(target.tel || target.phoneClean);
  const targetPhone7 = targetPhone.length >= 7 ? targetPhone.slice(-7) : "";

  const ids = new Set<number>([cleanId]);
  for (const c of directory) {
    if (c.id === cleanId) continue;
    const cName = decodeSimpleEntities(c.name).trim().toLowerCase();
    if (targetName && cName === targetName) {
      ids.add(c.id);
      continue;
    }
    const cCode = (c.code || extractCustomerCode(c.name)).trim().toLowerCase();
    const cPhone = normalizePhone(c.tel || c.phoneClean);
    const cPhone7 = cPhone.length >= 7 ? cPhone.slice(-7) : "";
    if (targetCode && cCode === targetCode && targetPhone7 && cPhone7 === targetPhone7) {
      ids.add(c.id);
    }
  }
  return Array.from(ids);
}

/**
 * 讀取客戶歷年離線歷史訂單 (0ms 極速讀取，涵蓋近 4 年完整叫貨紀錄，支援同客多號雙重歸戶)
 */
export function getLocalHistoryOrdersForCustomer(customerId: number): CloudCustomerOrder[] {
  const index = ensureLocalHistoricalOrdersLoaded();
  const relatedIds = findRelatedCustomerIds(customerId);
  if (relatedIds.length <= 1) {
    return index.get(customerId) || [];
  }
  const seen = new Set<string>();
  const merged: CloudCustomerOrder[] = [];
  for (const rid of relatedIds) {
    const list = index.get(rid) || [];
    for (const o of list) {
      const key = String(o.id || `${o.date}_${o.time}_${o.price}`);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(o);
      }
    }
  }
  merged.sort((a, b) => {
    const da = a.date + " " + (a.time || "");
    const db = b.date + " " + (b.time || "");
    return db.localeCompare(da);
  });
  return merged;
}

/**
 * 三方資料源即時融合器：將「歷年離線/雲端歷史庫」與「近期司機歷史 (driver_history_v1 / 種子庫)」及「今日即時新單 (today_orders)」無縫合併去重
 */
export function mergeRealtimeAndHistoryPoolOrders(
  targetCustomer: { id: number; code?: string; name?: string; tel?: string; phone?: string; phoneClean?: string },
  baseOrders: CloudCustomerOrder[],
  extraPools: any[][],
): CloudCustomerOrder[] {
  const relatedIdSet = new Set<number>(findRelatedCustomerIds(targetCustomer.id));
  const targetName = decodeSimpleEntities(targetCustomer.name || "").trim().toLowerCase();
  const targetCode = (targetCustomer.code || extractCustomerCode(targetCustomer.name || "")).trim().toLowerCase();
  const rawTel = targetCustomer.phoneClean || targetCustomer.tel || targetCustomer.phone || "";
  const targetPhone = normalizePhone(rawTel);
  const targetPhone7 = targetPhone.length >= 7 ? targetPhone.slice(-7) : "";

  const directory = getCloudCustomerDirectory();
  const isCodeUnique =
    targetCode.length > 0 &&
    directory.filter((c) => (c.code || extractCustomerCode(c.name)).trim().toLowerCase() === targetCode).length === 1;

  const byKey = new Map<string, CloudCustomerOrder>();
  const byDateTimePrice = new Set<string>();

  for (const o of baseOrders) {
    const normDate = String(o.date || "").replace(/-/g, "/").trim();
    const key = String(o.id || `${normDate}_${o.time}_${o.price}`);
    const dtp = `${normDate}|${String(o.time || "").slice(0, 5)}|${o.price}|${o.totalBottles}`;
    byKey.set(key, { ...o, date: normDate });
    byDateTimePrice.add(dtp);
  }

  for (const pool of extraPools) {
    if (!Array.isArray(pool)) continue;
    for (const raw of pool) {
      if (!raw || typeof raw !== "object") continue;
      const oCid = Number(raw.customerId || raw.customer_id) || 0;
      const oName = decodeSimpleEntities(raw.name || raw.customerName || "").trim().toLowerCase();
      const oCode = extractCustomerCode(oName).toLowerCase();
      const oPhone = normalizePhone(raw.tel || raw.phone || "");
      const oPhone7 = oPhone.length >= 7 ? oPhone.slice(-7) : "";

      let matched = false;
      if (oCid > 0 && relatedIdSet.has(oCid)) {
        matched = true;
      } else if (targetName && oName && oName === targetName) {
        matched = true;
      } else if (targetCode && oCode === targetCode && targetPhone7 && oPhone7 === targetPhone7) {
        matched = true;
      } else if (isCodeUnique && targetCode && oCode === targetCode) {
        matched = true;
      } else if (!targetCode && targetPhone7 && oPhone7 === targetPhone7 && (!oName || (targetName && oName.includes(targetName)))) {
        matched = true;
      }

      if (!matched) continue;

      const normDate = String(raw.date || raw.orderDate || raw.oder_date || "").replace(/-/g, "/").trim();
      if (!normDate) continue;
      const timeStr = String(raw.time || raw.oder_time || "").trim();
      const b50 = Number(raw.b50 ?? raw.raw50) || 0;
      const b20 = Number(raw.b20 ?? raw.raw20) || 0;
      const b16 = Number(raw.b16 ?? raw.raw16) || 0;
      const b10 = Number(raw.b10 ?? raw.raw10) || 0;
      const b4 = (Number(raw.b4 ?? raw.raw4) || 0) + (Number(raw.bNew4 ?? raw.raw_new_4) || 0);
      const totalBottles = Number(raw.totalBottles) || b50 + b20 + b16 + b10 + b4;
      const price = Number(raw.price ?? raw.totalPrice) || 0;
      const rawPayed = String(raw.payed || raw.isPayed || "已付款").trim().toUpperCase();
      const payedLabel =
        rawPayed === "O" || rawPayed === "欠款"
          ? "欠款"
          : rawPayed === "M" || rawPayed === "月結"
          ? "月結"
          : rawPayed === "N" || rawPayed === "未付款"
          ? "未付款"
          : "已付款";

      const rawId = raw.id || raw.oder_id || `${normDate}_${timeStr}_${price}`;
      const key = String(rawId);
      const dtp = `${normDate}|${timeStr.slice(0, 5)}|${price}|${totalBottles}`;
      if (byKey.has(key) || byDateTimePrice.has(dtp)) continue;

      byKey.set(key, {
        id: rawId,
        date: normDate,
        time: timeStr,
        b50,
        b20,
        b16,
        b10,
        b4,
        totalBottles,
        refondKg: Number(raw.refondKg) || 0,
        price,
        payed: payedLabel,
        driver: String(raw.driver || "").trim(),
        remark: String(raw.remark || raw.remarks || raw.dataRemark || "").trim(),
      });
      byDateTimePrice.add(dtp);
    }
  }

  const merged = Array.from(byKey.values());
  merged.sort((a, b) => {
    const da = a.date + " " + (a.time || "");
    const db = b.date + " " + (b.time || "");
    return db.localeCompare(da);
  });
  return merged;
}

/**
 * 向下相容 2026 介面調用，底層直通全歷史中樞
 */
export function getLocal2026OrdersForCustomer(customerId: number): CloudCustomerOrder[] {
  return getLocalHistoryOrdersForCustomer(customerId);
}

/**
 * 同步取得客戶快取歷程 (優先讀取全歷史離線索引)
 */
export function getCloudCustomerOrders(customerId: number): CloudCustomerOrder[] {
  const cleanId = Math.trunc(Number(customerId) || 0);
  if (cleanId <= 0) return [];
  const cached = memoryOrdersByCustomer.get(cleanId);
  if (cached && cached.orders.length > 0) return cached.orders;
  return getLocalHistoryOrdersForCustomer(cleanId);
}

/**
 * 雲端唯一真理：從 Supabase `public.cloud_orders` 即時查詢單一客戶歷史訂單明細（附 2 分鐘 LRU 快取與 5 分鐘熔斷，整合本地 2026 離線全量庫）
 */
export async function fetchCloudCustomerOrders(
  customerId: number,
  limit = 5000,
): Promise<CloudCustomerOrder[]> {
  const cleanId = Math.trunc(Number(customerId) || 0);
  if (cleanId <= 0) return [];

  const safeLimit = Math.max(1, Math.min(10000, Math.trunc(limit) || 5000));
  const now = Date.now();
  const cached = memoryOrdersByCustomer.get(cleanId);
  if (cached && now - cached.fetchedAt < ORDERS_TTL_MS && cached.orders.length > 0) {
    return cached.orders.slice(0, safeLimit);
  }

  const local2026 = getLocal2026OrdersForCustomer(cleanId);
  const cfg = resolveSupabaseConfig();
  if (!cfg || now < supabaseCircuitOpenUntil) {
    if (cached && cached.orders.length > 0) return cached.orders.slice(0, safeLimit);
    return local2026.slice(0, safeLimit);
  }
  try {
    const endpoint =
      `${cfg.url}/rest/v1/cloud_orders` +
      `?select=order_id,customer_id,order_date,order_time,b50,b20,b16,b10,b4,total_bottles,refond_kg,price,payed,driver,remark,disable` +
      `&customer_id=eq.${cleanId}&disable=eq.N&order=order_date.desc,order_id.desc&limit=${safeLimit}`;
    const res = await globalThis.fetch(endpoint, {
      method: "GET",
      headers: {
        ...cfg.headers,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 402 || res.status === 401 || res.status === 403 || res.status >= 500) {
      supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      return (cached && cached.orders.length > 0 ? cached.orders : local2026).slice(0, limit);
    }
    if (!res.ok) {
      return (cached && cached.orders.length > 0 ? cached.orders : local2026).slice(0, limit);
    }

    const rows = await res.json();
    let mergedOrders: CloudCustomerOrder[] = [];
    if (Array.isArray(rows) && rows.length > 0) {
      const cloudMapped = rows.map((r) => mapSupabaseOrderRow(r));
      const seenIds = new Set<string>();
      for (const o of cloudMapped) {
        seenIds.add(String(o.id));
        mergedOrders.push(o);
      }
      for (const o of local2026) {
        if (!seenIds.has(String(o.id))) {
          seenIds.add(String(o.id));
          mergedOrders.push(o);
        }
      }
      mergedOrders.sort((a, b) => {
        const da = a.date + " " + (a.time || "");
        const db = b.date + " " + (b.time || "");
        return db.localeCompare(da);
      });
    } else {
      mergedOrders = local2026;
    }

    if (memoryOrdersByCustomer.size >= MAX_CACHED_CUSTOMERS_ORDERS) {
      const oldestKey = memoryOrdersByCustomer.keys().next().value;
      if (oldestKey !== undefined) memoryOrdersByCustomer.delete(oldestKey);
    }
    memoryOrdersByCustomer.set(cleanId, { fetchedAt: Date.now(), orders: mergedOrders });
    return mergedOrders.slice(0, limit);
  } catch {
    supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    return (cached && cached.orders.length > 0 ? cached.orders : local2026).slice(0, limit);
  }
}

/**
 * 更新或刷新雲端中樞快取
 */
export function refreshCloudCustomerCache(
  customers: CloudCustomerRecord[],
  source: "SUPABASE_DB" | "CLOUD_CACHE" = "SUPABASE_DB",
) {
  if (Array.isArray(customers) && customers.length > 0) {
    memoryDirectory = customers;
    lastSyncTimestamp = new Date().toISOString();
    gatewaySource = source;
    if (source === "SUPABASE_DB") {
      lastSupabaseDirectoryFetchAt = Date.now();
    }

    try {
      const baseDir = resolveDataFile("data") || join(process.cwd(), "data");
      const targetPath = join(baseDir, "cloud-customer-cache.json");
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
          2,
        ),
        "utf8",
      );
    } catch {}
  }
}

/**
 * 供單元測試重置快取與熔斷器狀態
 */
export function resetCloudGatewayStateForTests() {
  memoryDirectory = [];
  lastSyncTimestamp = "";
  lastSupabaseDirectoryFetchAt = 0;
  supabaseCircuitOpenUntil = 0;
  inflightDirectoryPromise = null;
  gatewaySource = "BOOTSTRAP_JSON";
  memoryOrdersByCustomer.clear();
  localHistoricalOrdersIndex = null;
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
    supabaseConfigured: Boolean(resolveSupabaseConfig()),
    circuitOpen: Date.now() < supabaseCircuitOpenUntil,
    cachedCustomerOrdersCount: memoryOrdersByCustomer.size,
    isHealthy: dir.length > 0,
  };
}

/**
 * 將今日即時新單 (today_orders) 動態疊加至客戶名冊，讓今日剛叫貨客戶即時顯示今日日期與 daysDiff = 0
 */
export function overlayTodayOrdersOntoDirectory<T extends { id: number; code?: string; name?: string; tel?: string; phone?: string; lastOrder?: string | null; daysDiff?: number; orderCount?: number; recentYearCount?: number }>(
  directory: T[],
  todayOrders: any[],
  businessDate?: string,
): T[] {
  if (!Array.isArray(directory) || directory.length === 0 || !Array.isArray(todayOrders) || todayOrders.length === 0) {
    return directory;
  }
  const normDate = String(businessDate || "").trim().replace(/-/g, "/");
  const nowTaipei = new Date(Date.now() + 8 * 3600 * 1000);
  const fallbackToday = `${nowTaipei.getUTCFullYear()}/${String(nowTaipei.getUTCMonth() + 1).padStart(2, "0")}/${String(nowTaipei.getUTCDate()).padStart(2, "0")}`;
  const effectiveDate = normDate.length >= 8 ? normDate : fallbackToday;

  const matchedIds = new Set<number>();
  const matchedNames = new Set<string>();
  const matchedPhones7 = new Set<string>();
  for (const o of todayOrders) {
    if (!o || typeof o !== "object") continue;
    const cid = Number(o.customerId || o.customer_id) || 0;
    if (cid > 0) matchedIds.add(cid);
    const nm = String(o.name || o.customerName || "").trim().toLowerCase();
    if (nm) matchedNames.add(nm);
    const ph = normalizePhone(o.tel || o.phone || "");
    if (ph.length >= 7) matchedPhones7.add(ph.slice(-7));
  }

  return directory.map((c) => {
    const cName = String(c.name || "").trim().toLowerCase();
    const cPh = normalizePhone(c.tel || c.phone || "");
    const cPh7 = cPh.length >= 7 ? cPh.slice(-7) : "";
    const hit =
      matchedIds.has(c.id) ||
      (cName.length > 0 && matchedNames.has(cName)) ||
      (cPh7.length === 7 && matchedPhones7.has(cPh7));
    if (!hit) return c;
    const curLast = String(c.lastOrder || "").replace(/-/g, "/");
    if (curLast >= effectiveDate) return c;
    return {
      ...c,
      lastOrder: effectiveDate,
      daysDiff: 0,
    };
  });
}


/**
 * 盛隆舊 ERP 最新牌價基準 (dbo.price)
 * 客戶各規格「ERP 總金額」公式：最新牌價 (dbo.price.price_*) - 客戶設定差價 (dbo.customers.price_*)
 * （未內扣樓層費前之真實 ERP 應收總金額，例如 47.2樓 p20=-60 => 755-(-60)=815；1.44.5 p20=-170 => 755-(-170)=925）
 */
export const ERP_BOARD_PRICES = {
  p50: 1620,
  p20: 755,
  p16: 695,
  p10: 370,
  p4: 340,
} as const;

export function computeErpCustomerTotalPrices(cust?: {
  p50?: number | null;
  p20?: number | null;
  p16?: number | null;
  p10?: number | null;
  p4?: number | null;
} | null) {
  const d50 = Number(cust?.p50) || 0;
  const d20 = Number(cust?.p20) || 0;
  const d16 = Number(cust?.p16) || 0;
  const d10 = Number(cust?.p10) || 0;
  const d4 = Number(cust?.p4) || 0;
  return {
    erpP50: ERP_BOARD_PRICES.p50 - d50,
    erpP20: ERP_BOARD_PRICES.p20 - d20,
    erpP16: ERP_BOARD_PRICES.p16 - d16,
    erpP10: ERP_BOARD_PRICES.p10 - d10,
    erpP4: ERP_BOARD_PRICES.p4 - d4,
  };
}
