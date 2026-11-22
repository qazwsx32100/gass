import { createDecipheriv, createHash } from "node:crypto";
const LEGACY_BASE = "https://kvdb.io/XwdpBD41akmYGtk8ReuBTE/";
let restrictedUntil = 0;
const RESTRICTED_RETRY_MS = 60000;

// 🛡️ [SUPABASE-PURE-POSTGREST-20261107]
// ERP 寫入只由 Supabase 主庫或明確設定的私有閘道確認；舊 KV 僅可作唯讀備援。
// 當配置 SUPABASE_URL + 服務端 Secret 或舊式 service_role key 時，直接走 PostgREST `/rest/v1/sl_operations_kv`，
// 達成 0 次 Edge Function 調用消耗；若僅配置 SHENGLONG_OPERATIONS_KV_URL 則走私有閘道。
interface WriteCacheEntry {
  hash: string;
  time: number;
}
interface ReadCacheEntry {
  body: string;
  time: number;
  headers: [string, string][];
}

const writeCache = new Map<string, WriteCacheEntry>();
const readCache = new Map<string, ReadCacheEntry>();
const MAX_WRITE_SUPPRESS_MS = 60000; // 若業務內容相同，60 秒內直接在記憶體攔截不重複呼叫 (Zero Network)
const READ_CACHE_TTL_MS = 4000;      // 讀取快取 4 秒

function decryptEnvelopeIfPossible(parsed: any, keyName: string): any {
  if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.data) return parsed;
  const secret = String(process.env.SHENGLONG_GAS_STOCK_SYNC_SECRET || "").trim();
  if (secret.length < 32) return parsed;
  try {
    const encKey = createHash("sha256").update("shenglong-private-kv-v1:").update(secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", encKey, Buffer.from(parsed.iv, "base64url"));
    decipher.setAAD(Buffer.from(keyName));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64url")), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    return parsed;
  }
}

function sanitizeJsonForFingerprint(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeJsonForFingerprint);
  }
  const cleanObj: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const k of keys) {
    cleanObj[k] = sanitizeJsonForFingerprint((obj as Record<string, unknown>)[k]);
  }
  return cleanObj;
}

function computeBusinessFingerprint(rawBody: string, keyName: string = ""): string {
  if (!rawBody) return "";
  const trimmed = rawBody.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      let parsed = JSON.parse(trimmed);
      if (parsed && parsed.v === 1 && parsed.iv && parsed.tag && parsed.data) {
        parsed = decryptEnvelopeIfPossible(parsed, keyName);
      }
      const cleaned = sanitizeJsonForFingerprint(parsed);
      return createHash("sha256").update(JSON.stringify(cleaned)).digest("hex");
    } catch {
      // not JSON, fallback to raw hash
    }
  }
  return createHash("sha256").update(rawBody).digest("hex");
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
}
function directConfig(): { url: string; key: string } | null {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
  return url && key ? { url, key } : null;
}
function cachedResponse(key: string, stale = false): Response | null {
  const entry = readCache.get(key);
  if (!entry || (!stale && Date.now() - entry.time >= READ_CACHE_TTL_MS)) return null;
  const headers = new Headers(entry.headers);
  headers.set("X-Operations-Source", stale ? "stale_cache" : "memory_cache");
  headers.set("X-Operations-Age-Seconds", String(Math.max(0, Math.floor((Date.now() - entry.time) / 1000))));
  if (stale) { headers.set("X-Operations-Read-Only", "true"); headers.set("Warning", '110 - "Response is stale"'); }
  return new Response(entry.body, { status: 200, headers });
}
export const operationsKvFetch: typeof globalThis.fetch = async (input, init) => {
  const originalUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!originalUrl.startsWith(LEGACY_BASE)) return globalThis.fetch(input, init);
  const request = input instanceof Request ? input : null;
  const method = String(init?.method || request?.method || "GET").toUpperCase();
  const oldUrl = new URL(originalUrl);
  const key = oldUrl.pathname.slice(new URL(LEGACY_BASE).pathname.length);
  if (!/^[a-z0-9_]{1,80}$/.test(key)) return jsonError(400, "invalid_operations_key");
  const now = Date.now();
  if (method === "GET") {
    const cached = cachedResponse(key);
    if (cached) return cached;
  }
  if (now < restrictedUntil) {
    return (method === "GET" && cachedResponse(key, true)) || jsonError(503, "operations_store_restricted");
  }
  const rawBody = typeof init?.body === "string" ? init.body : request && method !== "GET" && method !== "HEAD" ? await request.clone().text() : "";
  const isWrite = method === "POST" || method === "PUT";
  const writeHash = isWrite && rawBody ? computeBusinessFingerprint(rawBody, key) : "";
  const previous = writeCache.get(key);
  if (writeHash && previous?.hash === writeHash && now - previous.time < MAX_WRITE_SUPPRESS_MS) {
    return Response.json({ ok: true, cached: true, note: "shielded_unchanged_fingerprint" });
  }
  const config = directConfig();
  const endpoint = String(process.env.SHENGLONG_OPERATIONS_KV_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.SHENGLONG_OPERATIONS_KV_TOKEN || "").trim();
  const gateway = /^https?:\/\//.test(endpoint) && Boolean(token);
  const signal = init?.signal || request?.signal || AbortSignal.timeout(5000);
  try {
    let response: Response;
    let source: string;
    if (config) {
      source = "supabase_rest";
      // New sb_secret_ keys are opaque API keys, not JWT bearer tokens.
      const headers: Record<string, string> = { apikey: config.key };
      if (!config.key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${config.key}`;
      if (method === "GET") {
        try {
          const upstream = await globalThis.fetch(`${config.url}/rest/v1/sl_operations_kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers, cache: "no-store", signal });
          if (!upstream.ok) {
            // 🛡️ [FALLBACK-TO-LEGACY-KV] 當 Supabase 異常時，100% 平滑回退至 KVDB 中繼庫
            source = "legacy_fallback";
            const fallbackRes = await globalThis.fetch(input, { ...init, signal, cache: "no-store" });
            if (fallbackRes.ok) response = fallbackRes;
            else response = upstream;
          } else {
            const rows = await upstream.json();
            if (!Array.isArray(rows) || !rows.length) {
              // 🛡️ [FALLBACK-TO-LEGACY-KV] 當 Supabase 表內尚無該鍵值時（例如門市透過中繼通道推送），自動回退中繼庫
              source = "legacy_fallback";
              const fallbackRes = await globalThis.fetch(input, { ...init, signal, cache: "no-store" });
              if (fallbackRes.ok) response = fallbackRes;
              else return jsonError(404, "operations_key_not_found");
            } else {
              const value = rows[0].value;
              response = new Response(typeof value === "string" ? value : JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
            }
          }
        } catch {
          // 🛡️ [FALLBACK-TO-LEGACY-KV] 網路異常平滑回退
          source = "legacy_fallback";
          const fallbackRes = await globalThis.fetch(input, { ...init, signal, cache: "no-store" });
          if (fallbackRes.ok) response = fallbackRes;
          else throw new Error("operations_kv_unavailable");
        }
      } else if (isWrite) {
        try {
          const upstream = await globalThis.fetch(`${config.url}/rest/v1/sl_operations_kv?on_conflict=key`, {
            method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([{ key, value: rawBody, updated_at: new Date().toISOString() }]), cache: "no-store", signal,
          });
          // A legacy KV write cannot acknowledge an ERP write to the primary database.
          response = upstream.ok ? Response.json({ ok: true }) : upstream;
        } catch {
          throw new Error("operations_kv_unavailable");
        }
      } else return jsonError(405, "operations_method_not_supported");
    } else if (gateway) {
      source = "private_gateway";
      const headers = new Headers(init?.headers || request?.headers);
      headers.set("x-operations-kv-token", token);
      const url = new URL(`${endpoint}/${key}`); url.search = oldUrl.search;
      response = await globalThis.fetch(url, { ...init, method, headers, body: method === "GET" || method === "HEAD" ? undefined : rawBody, cache: "no-store", signal });
    } else {
      if (isWrite) return jsonError(503, "operations_store_not_configured");
      // Keep read-only legacy access for diagnosis; it is not a write acknowledgement.
      source = "legacy_fallback";
      response = await globalThis.fetch(input, { ...init, signal, cache: "no-store" });
    }
    if (!response.ok) {
      if (response.status === 402 || response.status === 429) restrictedUntil = now + RESTRICTED_RETRY_MS;
      // Missing authoritative rows must not resurrect obsolete legacy data.
      if (method === "GET" && response.status !== 404) {
        const stale = cachedResponse(key, true); if (stale) return stale;
      }
      return response;
    }
    if (isWrite) {
      if (writeHash) writeCache.set(key, { hash: writeHash, time: now });
      readCache.delete(key);
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("X-Operations-Source", source);
    headers.set("Cache-Control", "no-store");
    if (source === "legacy_read_only") headers.set("X-Operations-Read-Only", "true");
    const body = await response.text();
    readCache.set(key, { body, time: now, headers: Array.from(headers.entries()) });
    return new Response(body, { status: response.status, headers });
  } catch {
    return (method === "GET" && cachedResponse(key, true)) || jsonError(503, "operations_kv_unavailable");
  }
};
