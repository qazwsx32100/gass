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

function resolveSupabaseConfig(): { url: string; key: string } | null {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  )
    .trim()
    .replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}

function resolveDataFile(relPath: string): string | null {
  const candidates = [
    join(process.cwd(), relPath),
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
  return m ? m[1] : "";
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

/**
 * 載入並快取全店雲端客戶名冊 (0ms 同步快取讀取)
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
  const mapFile =
    resolveDataFile("public/data/customers-map.json") ||
    resolveDataFile("src/data/customerMapData.json");
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
          balance: Number(c.balance) || 0,
          lastOrder: c.latestOrder || null,
          daysDiff: typeof c.daysDiff === "number" ? c.daysDiff : -1,
          lat: c.lat,
          lng: c.lng,
          active: c.active !== false,
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
      const endpoint =
        `${cfg.url}/rest/v1/cloud_customers` +
        `?select=id,code,name,tel,phone_clean,address,clean_address,point_address,city,district,customer_type,preferred_spec,balance,last_order_date,days_diff,lat,lng,notes,p50,p20,p16,p10,p4,active` +
        `&active=is.true&order=id.asc&limit=5000`;
      const res = await globalThis.fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          Accept: "application/json",
          Range: "0-4999",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      });

      if (res.status === 402 || res.status === 401 || res.status === 403 || res.status >= 500) {
        supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        return getCloudCustomerDirectory();
      }
      if (!res.ok) {
        return getCloudCustomerDirectory();
      }

      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const mapped = rows
          .map((r) => mapSupabaseCustomerRow(r))
          .filter((c) => c.id > 0 && c.name.length > 0);
        if (mapped.length > 0) {
          memoryDirectory = mapped;
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
 * 0ms 關鍵字模糊檢索 (支援代號、電話末碼、姓名、路名)
 */
export function searchCloudCustomers(query: string, limit = 50): CloudCustomerRecord[] {
  const directory = getCloudCustomerDirectory();
  const q = (query || "").trim().toLowerCase();
  if (!q) return directory.slice(0, limit);

  const qClean = q.replace(/[\s\-()]/g, "");

  return directory
    .filter((c) => {
      if (c.code && (c.code === q || c.code.startsWith(q))) return true;
      if (String(c.id) === q || String(c.id).includes(q)) return true;
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.phoneClean && qClean && (c.phoneClean.includes(qClean) || qClean.includes(c.phoneClean))) {
        return true;
      }
      if (c.addr.toLowerCase().includes(q)) return true;
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
  if (!str) return null;
  return (
    directory.find((c) => c.code === str || c.name === str || c.name.includes(str)) || null
  );
}

/**
 * 同步取得客戶快取歷程 (絕不讀取本地過期 orders_2026_full.json 死檔)
 */
export function getCloudCustomerOrders(customerId: number): CloudCustomerOrder[] {
  const cleanId = Math.trunc(Number(customerId) || 0);
  if (cleanId <= 0) return [];
  const cached = memoryOrdersByCustomer.get(cleanId);
  return cached ? cached.orders : [];
}

/**
 * 雲端唯一真理：從 Supabase `public.cloud_orders` 即時查詢單一客戶歷史訂單明細（附 2 分鐘 LRU 快取與 5 分鐘熔斷）
 */
export async function fetchCloudCustomerOrders(
  customerId: number,
  limit = 100,
): Promise<CloudCustomerOrder[]> {
  const cleanId = Math.trunc(Number(customerId) || 0);
  if (cleanId <= 0) return [];

  const now = Date.now();
  const cached = memoryOrdersByCustomer.get(cleanId);
  if (cached && now - cached.fetchedAt < ORDERS_TTL_MS) {
    return cached.orders.slice(0, limit);
  }

  const cfg = resolveSupabaseConfig();
  if (!cfg || now < supabaseCircuitOpenUntil) {
    return cached ? cached.orders.slice(0, limit) : [];
  }

  const safeLimit = Math.max(1, Math.min(300, Math.trunc(limit) || 100));
  try {
    const endpoint =
      `${cfg.url}/rest/v1/cloud_orders` +
      `?select=order_id,customer_id,order_date,order_time,b50,b20,b16,b10,b4,total_bottles,refond_kg,price,payed,driver,remark,disable` +
      `&customer_id=eq.${cleanId}&disable=eq.N&order=order_date.desc,order_id.desc&limit=${safeLimit}`;
    const res = await globalThis.fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 402 || res.status === 401 || res.status === 403 || res.status >= 500) {
      supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      return cached ? cached.orders.slice(0, limit) : [];
    }
    if (!res.ok) {
      return cached ? cached.orders.slice(0, limit) : [];
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) {
      return cached ? cached.orders.slice(0, limit) : [];
    }

    const mapped = rows.map((r) => mapSupabaseOrderRow(r));
    if (memoryOrdersByCustomer.size >= MAX_CACHED_CUSTOMERS_ORDERS) {
      const oldestKey = memoryOrdersByCustomer.keys().next().value;
      if (oldestKey !== undefined) memoryOrdersByCustomer.delete(oldestKey);
    }
    memoryOrdersByCustomer.set(cleanId, { fetchedAt: Date.now(), orders: mapped });
    return mapped;
  } catch {
    supabaseCircuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    return cached ? cached.orders.slice(0, limit) : [];
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
