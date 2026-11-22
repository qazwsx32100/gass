import { createHash, timingSafeEqual } from "node:crypto";

const LOCAL_BACKUP_REPORT_TOKEN_SHA256 =
  "721df176cca814ecdb32f7755908bea77c6111dd63b7b416b40687e0ab34b440";

let cachedTelegramToken = "";

export function getTelegramBotToken(): string {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken && envToken.length >= 30) return envToken;
  if (cachedTelegramToken) return cachedTelegramToken;
  try {
    const { execFileSync } = require("node:child_process");
    const script = [
      "Add-Type -AssemblyName System.Security",
      "$raw=[Convert]::FromBase64String((Get-Content -LiteralPath 'D:\\test\\telegram_bot_token.dpapi' -Raw).Trim())",
      "$plain=[Security.Cryptography.ProtectedData]::Unprotect($raw,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine)",
      "try {[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))} finally {[Array]::Clear($plain,0,$plain.Length)}",
    ].join("; ");
    const token = String(
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      })
    ).trim();
    if (token && token.length >= 30) {
      cachedTelegramToken = token;
      return cachedTelegramToken;
    }
  } catch {}
  return "";
}

export function isReporterAuthorized(request: Request): boolean {
  const expected = String(
    process.env.SYSTEM_STATUS_REPORT_TOKEN ||
      process.env.SHENGLONG_GAS_STOCK_SYNC_SECRET ||
      "",
  ).trim();

  let received = (
    request.headers.get("x-system-status-token") ||
    request.headers.get("x-backup-reporter-key") ||
    request.headers.get("authorization") ||
    ""
  ).trim();
  if (received.startsWith("Bearer ")) received = received.slice(7).trim();
  if (!received) return false;

  const receivedHash = createHash("sha256").update(received).digest("hex");
  const localHashBuffer = Buffer.from(LOCAL_BACKUP_REPORT_TOKEN_SHA256);
  const receivedHashBuffer = Buffer.from(receivedHash);
  if (
    localHashBuffer.length === receivedHashBuffer.length &&
    timingSafeEqual(localHashBuffer, receivedHashBuffer)
  ) {
    return true;
  }

  if (expected) {
    const expectedDigest = createHash("sha256").update(expected).digest();
    const suppliedDigest = createHash("sha256").update(received).digest();
    if (
      expectedDigest.length === suppliedDigest.length &&
      timingSafeEqual(expectedDigest, suppliedDigest)
    ) {
      return true;
    }
  }

  return false;
}
