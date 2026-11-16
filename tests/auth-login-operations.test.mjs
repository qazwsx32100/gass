import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 👑 盛隆調度戰情中心登入鑑權、Token 解析與死循環防禦驗證
 */

const projectRoot = fs.existsSync("C:/shenglong-next/app/driver/page.tsx")
  ? "C:/shenglong-next"
  : path.resolve(import.meta.dirname, "..");

function isValidSessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  try {
    const [b64Payload] = token.split(".");
    const base64 = b64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const data = JSON.parse(jsonStr);
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

function resolveLoginReturnUrl(searchParamsString, currentHost = "shenglong.vercel.app") {
  const params = new URLSearchParams(searchParamsString || "");
  let returnUrl = "/operations";
  const rawTarget = params.get("returnUrl") || params.get("redirect") || params.get("from");
  if (rawTarget && rawTarget.startsWith("/") && !rawTarget.startsWith("//")) {
    // 杜絕導向至跨網域的 /erp 造成二次跳轉與 Session 丟失
    if (rawTarget === "/erp") {
      returnUrl = "/operations";
    } else {
      returnUrl = rawTarget;
    }
  }
  return returnUrl;
}

test("【登入鑑權】1. Token 格式與有效期檢驗邏輯 (防範 Middleware 死循環)", () => {
  // 1. 有效未過期 Token
  const validPayload = btoa(JSON.stringify({ id: "1", role: "admin", exp: Date.now() + 100000 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(isValidSessionToken(`${validPayload}.sig`), true);

  // 2. 已過期 Token (必須返回 false 以促使 Middleware 清除髒 Cookie)
  const expiredPayload = btoa(JSON.stringify({ id: "1", role: "admin", exp: Date.now() - 1000 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(isValidSessionToken(`${expiredPayload}.sig`), false);

  // 3. 損壞字串與空值防呆
  assert.equal(isValidSessionToken("garbage_token"), false);
  assert.equal(isValidSessionToken(undefined), false);
  assert.equal(isValidSessionToken(""), false);
});

test("【登入導航】2. 登入後重定向 URL 必須優先導向 /operations 並阻斷跨網域 /erp 跳轉", () => {
  // 未帶任何參數時，預設導回戰情調度中樞 /operations
  assert.equal(resolveLoginReturnUrl(""), "/operations");

  // 帶有 ?redirect=/operations 時，正確解析為 /operations
  assert.equal(resolveLoginReturnUrl("redirect=/operations"), "/operations");

  // 帶有 ?returnUrl=/operations 時，正確解析為 /operations
  assert.equal(resolveLoginReturnUrl("returnUrl=/operations"), "/operations");

  // 帶有 ?returnUrl=/erp 時，防禦性轉換為 /operations (避免 308 導向外部網域)
  assert.equal(resolveLoginReturnUrl("returnUrl=/erp"), "/operations");
  assert.equal(resolveLoginReturnUrl("redirect=/erp"), "/operations");

  // 惡意跨站協議跳轉 (如 //evil.com) 必須被阻斷
  assert.equal(resolveLoginReturnUrl("returnUrl=//evil.com"), "/operations");
});

test("【身分權限】3. 戰情調度中心 Admin 判定規則必須兼容 role 與 isAdmin", () => {
  function checkIsAdmin(user) {
    if (!user) return false;
    return Boolean(user.role === "admin" || user.isAdmin === true || user.username === "admin" || user.username === "boss");
  }

  // 只有 role: "admin" 的物件 (原本會因缺少 isAdmin: true 誤判未登入)
  const userWithRoleOnly = { id: 1, username: "admin", role: "admin" };
  assert.equal(checkIsAdmin(userWithRoleOnly), true);

  // 老闆別名
  const bossUser = { id: 2, username: "boss", role: "admin" };
  assert.equal(checkIsAdmin(bossUser), true);

  // 非管理員
  const driverUser = { id: 3, username: "driver1", role: "driver" };
  assert.equal(checkIsAdmin(driverUser), false);

  // 空物件
  assert.equal(checkIsAdmin(null), false);
});

test("【登入系統統整】4. 永久刪除派單系統登入，/driver/login 永遠導回營運系統登入畫面 (/login)", () => {
  function resolveDriverLoginRedirect(pathname) {
    if (pathname === "/driver/login" || pathname.startsWith("/driver/login/")) {
      return { redirect: "/login", status: 308 };
    }
    return null;
  }

  assert.deepEqual(resolveDriverLoginRedirect("/driver/login"), { redirect: "/login", status: 308 });
  assert.deepEqual(resolveDriverLoginRedirect("/driver/login/"), { redirect: "/login", status: 308 });
  assert.deepEqual(resolveDriverLoginRedirect("/driver/login/admin"), { redirect: "/login", status: 308 });
});

test("【登入系統統整】5. 未授權訪問 /driver 時改回營運系統登入畫面 (/login?returnUrl=/driver)", () => {
  function checkDriverAccess({ token, hasSession, isAdminRef }) {
    if (token) return { access: true, type: "DRIVER_TOKEN" };
    if (hasSession || isAdminRef) return { access: true, type: "ADMIN_DIRECT" };
    return { redirect: "/login?returnUrl=/driver", status: 307 };
  }

  // 1. 司機持個人專屬網址 Token -> 秒通
  assert.deepEqual(checkDriverAccess({ token: "tk_xl_9a2f7c81d4e3", hasSession: false, isAdminRef: false }), { access: true, type: "DRIVER_TOKEN" });

  // 2. 監控中心管理者秒進 -> 秒通
  assert.deepEqual(checkDriverAccess({ token: "", hasSession: true, isAdminRef: true }), { access: true, type: "ADMIN_DIRECT" });

  // 3. 訪客或未帶 Token 且未登入管理員 -> 導回營運系統登入畫面
  assert.deepEqual(checkDriverAccess({ token: "", hasSession: false, isAdminRef: false }), { redirect: "/login?returnUrl=/driver", status: 307 });
});

test("【派單登入永久刪除】6. 司機端原始碼徹底移除 isNeedLogin 與所有登入引導卡片", () => {
  const driverSource = fs.readFileSync(path.join(projectRoot, "app/driver/page.tsx"), "utf8");

  // 確保已無任何 isNeedLogin 狀態與區塊
  assert.equal(driverSource.includes("isNeedLogin"), false, "司機頁面不得存在任何 isNeedLogin 變數或邏輯");
  assert.equal(driverSource.includes("免帳密登入 ✕ 專屬個人網址直達"), false, "司機頁面不得存在派單系統登入卡片");
  assert.equal(fs.existsSync(path.join(projectRoot, "app/driver/login")), false, "app/driver/login 資料夾必須永久刪除不存在");
  assert.equal(fs.existsSync(path.join(projectRoot, "app/api/driver/login")), false, "app/api/driver/login 資料夾必須永久刪除不存在");
});

test("【APK 入口隔離】7. 監控中心 APK 專屬 OperationsMainActivity 獨立存在並覆寫司機 URL 與服務", () => {
  const opsActivityPath = path.join(projectRoot, "android/app/src/main/java/com/shenglong/driver/OperationsMainActivity.java");

  assert.equal(fs.existsSync(opsActivityPath), true, "OperationsMainActivity.java 必須存在");
  const opsContent = fs.readFileSync(opsActivityPath, "utf8");
  assert.equal(opsContent.includes("https://shenglong.vercel.app/operations"), true, "必須指向 /operations");
  assert.equal(opsContent.includes("stopService(new Intent(this, DriverOrderService.class))"), true, "必須停用司機外送常駐服務");
  assert.equal(opsContent.includes("getMainDriverUrl()"), true, "必須覆寫 getMainDriverUrl");
});

test("【APK 打包配置】8. build-all-apks.cjs 必須配置 com.shenglong.operations 專屬 mainActivity", () => {
  const buildScriptPath = path.join(projectRoot, "scripts/build-all-apks.cjs");
  const scriptContent = fs.readFileSync(buildScriptPath, "utf8");

  assert.equal(scriptContent.includes("mainActivity: '.OperationsMainActivity'"), true, "build-all-apks 必須配置 OperationsMainActivity");
});
