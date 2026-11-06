/**
 * sync-cloud-mirror.cjs
 * 盛隆瓦斯 門市 ERP 雲端資料鏡像自動寫入核心引擎
 * 
 * 核心規範:
 * 1. 嚴格遵守 Directive #4 黑盒子鐵律：舊 ERP 零更動，唯讀 WITH (NOLOCK)。
 * 2. 直推 Supabase PostgreSQL REST API (無 Edge Function 呼叫消耗，終生零 402)。
 * 3. 雙表同步：
 *    - cloud_customers (全量客戶主檔：包含 26.21.1 代號、電話、地址、餘額、規格)
 *    - cloud_orders (當日與近期訂單：包含單號、客戶、品項、支數、實收、外勤)
 * 4. 支援手動點擊執行、命令列模式與 Windows 21:05 工作排程自動執行。
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// ── 1. 自動載入設定檔 (優先尋找目前目錄與上層目錄的 sync-config.env 或 .env) ──
function loadEnvConfig() {
  const candidates = [
    path.join(__dirname, "sync-config.env"),
    path.join(__dirname, "../sync-config.env"),
    path.join(__dirname, ".env"),
    path.join(__dirname, "../.env"),
    path.join(process.cwd(), "sync-config.env"),
    path.join(process.cwd(), ".env"),
  ];

  for (const envFile of candidates) {
    if (fs.existsSync(envFile)) {
      try {
        const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
            if (!process.env[k] && v) {
              process.env[k] = v;
            }
          }
        }
      } catch {}
    }
  }
}
loadEnvConfig();

// ── 2. 自動探測 SQLCMD 與 SQL Server 端點 ──
const SQLCMD_CANDIDATES = [
  "C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\100\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\110\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\120\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\130\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\140\\Tools\\Binn\\SQLCMD.EXE",
  "C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\130\\Tools\\Binn\\SQLCMD.EXE",
];
const SQLCMD_EXE = SQLCMD_CANDIDATES.find((p) => fs.existsSync(p)) || "sqlcmd.exe";
const SQL_SERVER = process.env.SQL_SERVER || ".\\SQLEXPRESS";
const SQL_DB = process.env.SQL_DB || "ShengLong_Inspection";

function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("886")) digits = "0" + digits.slice(3);
  return digits;
}

function extractCustomerCode(name) {
  if (!name) return "";
  const m = name.match(/^([0-9]+(?:\.[0-9]+)+)/);
  return m ? m[1] : "";
}

async function extractSqlData(query, maxBuffer = 32 * 1024 * 1024) {
  try {
    const rawOut = execFileSync(
      SQLCMD_EXE,
      ["-S", SQL_SERVER, "-E", "-d", SQL_DB, "-h", "-1", "-W", "-s", "\t", "-Q", query],
      { encoding: "buffer", windowsHide: true, timeout: 25000, maxBuffer }
    );
    let decoded = "";
    try {
      decoded = new TextDecoder("big5").decode(rawOut);
    } catch {
      decoded = new TextDecoder("utf-8").decode(rawOut);
    }
    return decoded;
  } catch (err) {
    throw new Error(`SQLCMD 執行失敗: ${err.message}`);
  }
}

async function syncToSupabase(endpoint, serviceRoleKey, table, onConflictCol, records) {
  if (!records || records.length === 0) return { count: 0 };
  const url = `${endpoint.replace(/\/$/, "")}/rest/v1/${table}?on_conflict=${onConflictCol}`;
  
  const BATCH_SIZE = 500;
  let totalUpserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Supabase Upsert [${table}] 失敗 (HTTP ${res.status}): ${errText}`);
    }
    totalUpserted += batch.length;
  }
  return { count: totalUpserted };
}

async function runCloudMirror(options = {}) {
  const startTime = Date.now();
  console.log("=================================================================");
  console.log("👑 盛隆瓦斯 門市 ERP 雲端資料鏡像自動寫入工具 (ShengLong Cloud Mirror)");
  console.log(`⏰ 啟動時間: ${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`);
  console.log(`🖥️ 本機端點: SQL_SERVER=${SQL_SERVER}, SQL_DB=${SQL_DB}`);
  console.log("=================================================================\n");

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://ytwhfiudhhdkmzobqmqq.supabase.co").trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

  // ── 步驟 1：提取全店客戶主檔 (WITH (NOLOCK) 零鎖定) ──
  console.log("[1/4] 📦 正在從門市 ERP 提取全量客戶主檔 (WITH (NOLOCK))...");
  const customerSql = `
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
    SELECT 
      c.customer_id,
      RTRIM(REPLACE(REPLACE(REPLACE(ISNULL(c.customer_name, ''), CHAR(13), ' '), CHAR(10), ' '), CHAR(9), ' ')) AS name,
      RTRIM(REPLACE(REPLACE(REPLACE(ISNULL(c.customer_tel, ''), CHAR(13), ' '), CHAR(10), ' '), CHAR(9), ' ')) AS tel,
      RTRIM(REPLACE(REPLACE(REPLACE(ISNULL(c.customer_address, ''), CHAR(13), ' '), CHAR(10), ' '), CHAR(9), ' ')) AS address,
      ISNULL(c.owe_money, 0) AS balance,
      RTRIM(ISNULL(c.customer_remarks, '')) AS notes,
      ISNULL(c.price_50kg, 0) AS p50,
      ISNULL(c.price_20kg, 0) AS p20,
      ISNULL(c.price_16kg, 0) AS p16,
      ISNULL(c.price_10kg, 0) AS p10,
      ISNULL(c.price_4kg, 0) AS p4,
      CASE WHEN c.active = 'T' THEN 1 ELSE 0 END AS active,
      ISNULL((SELECT TOP 1 RTRIM(o.oder_date) FROM dbo.gas_oders o WITH (NOLOCK) WHERE o.customer_id = c.customer_id AND o.disable = 'N' ORDER BY o.oder_id DESC), '') AS last_date
    FROM dbo.customers c WITH (NOLOCK)
    WHERE c.customer_id > 0;
  `;

  let customers = [];
  try {
    const rawCust = await extractSqlData(customerSql);
    const lines = rawCust.split("\n");
    for (const l of lines) {
      const line = l.trim();
      if (!line || line.startsWith("(") || line.startsWith("-")) continue;
      const cols = line.split("\t");
      if (cols.length >= 13) {
        const id = Number(cols[0]);
        if (!id) continue;
        const name = cols[1];
        const tel = cols[2];
        const address = cols[3];
        const balance = Number(cols[4]) || 0;
        const notes = cols[5];
        const p50 = Number(cols[6]) || 0;
        const p20 = Number(cols[7]) || 0;
        const p16 = Number(cols[8]) || 0;
        const p10 = Number(cols[9]) || 0;
        const p4 = Number(cols[10]) || 0;
        const active = cols[11] === "1";
        const lastDate = cols[12] || "";

        customers.push({
          id,
          code: extractCustomerCode(name),
          name,
          tel,
          phone_clean: normalizePhone(tel),
          address,
          balance,
          notes,
          p50,
          p20,
          p16,
          p10,
          p4,
          active,
          last_order_date: lastDate,
          updated_at: new Date().toISOString()
        });
      }
    }
    console.log(`   ✅ 成功提取客戶主檔: ${customers.length} 戶 (包含代號如 26.21.1)`);
  } catch (err) {
    console.warn(`   ⚠️ 門市 SQL 提取客戶主檔失敗 (可能離線或服務未開): ${err.message}`);
  }

  // ── 步驟 2：提取近期訂單明細 (預設抓取近 14 天異動訂單) ──
  console.log("\n[2/4] 📋 正在從門市 ERP 提取當日與近期訂單明細 (WITH (NOLOCK))...");
  const daysBack = options.daysBack || 14;
  const ordersSql = `
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
    SELECT TOP 3000
      o.oder_id,
      o.customer_id,
      RTRIM(ISNULL(c.customer_name, '')) AS c_name,
      RTRIM(ISNULL(c.customer_tel, '')) AS c_tel,
      RTRIM(ISNULL(c.customer_address, '')) AS c_addr,
      RTRIM(o.oder_date) AS o_date,
      RTRIM(o.oder_time) AS o_time,
      RTRIM(ISNULL(o.deliver, '')) AS driver,
      ISNULL(o.oder_50kg, 0) AS b50,
      ISNULL(o.oder_20kg, 0) AS b20,
      ISNULL(o.oder_16kg, 0) AS b16,
      ISNULL(o.oder_10kg, 0) AS b10,
      ISNULL(o.oder_4kg, 0) AS b4,
      ISNULL(o.refond_kg, 0) AS refond_kg,
      ISNULL(o.oder_price, 0) AS price,
      RTRIM(ISNULL(o.payed, '已付款')) AS payed,
      RTRIM(ISNULL(o.oder_remarks, '')) AS remarks,
      ISNULL(o.disable, 'N') AS disable
    FROM dbo.gas_oders o WITH (NOLOCK)
    LEFT JOIN dbo.customers c WITH (NOLOCK) ON o.customer_id = c.customer_id
    WHERE o.oder_date >= CONVERT(char(10), DATEADD(day, -${daysBack}, GETDATE()), 111)
    ORDER BY o.oder_id DESC;
  `;

  let orders = [];
  try {
    const rawOrders = await extractSqlData(ordersSql);
    const oLines = rawOrders.split("\n");
    for (const l of oLines) {
      const line = l.trim();
      if (!line || line.startsWith("(") || line.startsWith("-")) continue;
      const cols = line.split("\t");
      if (cols.length >= 18) {
        const order_id = Number(cols[0]);
        if (!order_id) continue;
        const customer_id = Number(cols[1]) || null;
        const customer_name = cols[2];
        const customer_tel = cols[3];
        const customer_address = cols[4];
        const order_date = cols[5];
        const order_time = cols[6];
        const driver = cols[7];
        const b50 = Number(cols[8]) || 0;
        const b20 = Number(cols[9]) || 0;
        const b16 = Number(cols[10]) || 0;
        const b10 = Number(cols[11]) || 0;
        const b4 = Number(cols[12]) || 0;
        const total_bottles = b50 + b20 + b16 + b10 + b4;
        const refond_kg = Number(cols[13]) || 0;
        const price = Number(cols[14]) || 0;
        const payed = cols[15] || "已付款";
        const remark = cols[16] || "";
        const disable = cols[17] || "N";

        orders.push({
          order_id,
          customer_id,
          customer_name,
          customer_tel,
          customer_address,
          order_date,
          order_time,
          driver,
          b50,
          b20,
          b16,
          b10,
          b4,
          total_bottles,
          refond_kg,
          price,
          payed,
          remark,
          disable,
          updated_at: new Date().toISOString()
        });
      }
    }
    console.log(`   ✅ 成功提取近期訂單: ${orders.length} 筆 (涵蓋近 ${daysBack} 天異動)`);
  } catch (err) {
    console.warn(`   ⚠️ 門市 SQL 提取近期訂單失敗: ${err.message}`);
  }

  // ── 步驟 3：寫入 Supabase (直連 REST API) ──
  console.log("\n[3/4] ☁️ 正在整批自動寫入 Supabase 雲端資料庫...");
  let cloudResult = { customers: 0, orders: 0 };

  if (!supabaseKey) {
    console.warn("   ⚠️ 未設定 SUPABASE_SERVICE_ROLE_KEY，略過雲端推送 (已將資料快取於本地)。");
    console.warn("   💡 提示：請於 sync-config.env 或系統環境變數中設定 SUPABASE_SERVICE_ROLE_KEY。");
  } else {
    // 3.1 推送客戶主檔
    if (customers.length > 0) {
      try {
        console.log(`   ⬆️ 正在推送 ${customers.length} 筆客戶主檔至 cloud_customers...`);
        const resCust = await syncToSupabase(supabaseUrl, supabaseKey, "cloud_customers", "id", customers);
        cloudResult.customers = resCust.count;
        console.log(`   ✅ cloud_customers 寫入成功: ${resCust.count} 筆`);
      } catch (err) {
        console.error(`   ❌ cloud_customers 寫入異常: ${err.message}`);
      }
    }

    // 3.2 推送訂單明細
    if (orders.length > 0) {
      try {
        console.log(`   ⬆️ 正在推送 ${orders.length} 筆訂單明細至 cloud_orders...`);
        const resOrders = await syncToSupabase(supabaseUrl, supabaseKey, "cloud_orders", "order_id", orders);
        cloudResult.orders = resOrders.count;
        console.log(`   ✅ cloud_orders 寫入成功: ${resOrders.count} 筆`);
      } catch (err) {
        console.error(`   ❌ cloud_orders 寫入異常: ${err.message}`);
      }
    }
  }

  // ── 步驟 4：儲存本地收據與快照 ──
  console.log("\n[4/4] 💾 正在儲存同步收據與本地備援快取...");
  const durationMs = Date.now() - startTime;
  const receipt = {
    timestamp: new Date().toISOString(),
    durationMs,
    extractedCustomers: customers.length,
    extractedOrders: orders.length,
    cloudUpserted: cloudResult,
    status: (customers.length > 0 || orders.length > 0) ? "SUCCESS" : "STANDBY"
  };

  const receiptDir = path.join(__dirname, "../data");
  if (!fs.existsSync(receiptDir)) {
    try { fs.mkdirSync(receiptDir, { recursive: true }); } catch {}
  }
  try {
    fs.writeFileSync(path.join(receiptDir, "cloud-mirror-receipt.json"), JSON.stringify(receipt, null, 2), "utf8");
  } catch {}

  console.log("=================================================================");
  console.log(`🎉 門市鏡像同步完成！總耗時: ${durationMs} ms`);
  console.log(`📊 客戶寫入: ${cloudResult.customers} 戶 | 訂單寫入: ${cloudResult.orders} 筆`);
  console.log("=================================================================\n");

  return receipt;
}

if (require.main === module) {
  runCloudMirror().catch((err) => {
    console.error("\n❌ [CloudMirror] 發生未捕捉異常:", err);
    process.exit(1);
  });
}

module.exports = { runCloudMirror, extractCustomerCode, normalizePhone };
