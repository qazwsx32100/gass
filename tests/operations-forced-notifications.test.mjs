import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("🚨 盛隆最高指令：監控中心強制通知 (新單 ✕ 新來電) 規格與代碼整合驗證", () => {
  const pagePath = path.resolve("c:/shenglong-next/app/operations/page.tsx");
  const content = fs.readFileSync(pagePath, "utf8");

  // 1. 驗證聲音與語音預設強制開啟
  assert.ok(
    content.includes("const [soundEnabled, setSoundEnabled] = useState(true);"),
    "soundEnabled 必須預設為 true (強制開啟通知音效)"
  );
  assert.ok(
    content.includes("const [speechEnabled, setSpeechEnabled] = useState(true);"),
    "speechEnabled 必須預設為 true (強制開啟真人語音播報)"
  );

  // 2. 驗證全域無感音訊解鎖機制 (AudioContext & SpeechSynthesis & Notification)
  assert.ok(
    content.includes("getSharedAudioContext"),
    "必須包含 getSharedAudioContext 單例喚醒函式"
  );
  assert.ok(
    content.includes("unlockMandatoryAudio"),
    "必須包含 unlockMandatoryAudio 全域無感音訊解鎖監聽"
  );

  // 3. 驗證新訂單強制提醒 (三重奏鈴聲 + 真人語音合成)
  assert.ok(
    content.includes("const playOrderChime = () =>"),
    "必須包含 playOrderChime 新訂單提示音函式"
  );
  assert.ok(
    content.includes("const speakNewOrder = (ord: any) =>"),
    "必須包含 speakNewOrder 新訂單真人語音播報函式"
  );
  assert.ok(
    content.includes("playOrderChime();"),
    "新進訂單處必須強制呼叫 playOrderChime"
  );
  assert.ok(
    content.includes("speakNewOrder(ord);"),
    "新進訂單處必須強制呼叫 speakNewOrder"
  );

  // 4. 驗證新來電強制提醒 (電話振鈴 + 來電語音合成)
  assert.ok(
    content.includes("const playCallChime = () =>"),
    "必須包含 playCallChime 來電振鈴函式"
  );
  assert.ok(
    content.includes("const speakIncomingCall = (call: IncomingCallItem) =>"),
    "必須包含 speakIncomingCall 來電真人語音播報函式"
  );
  assert.ok(
    content.includes("playCallChime();"),
    "新來電進線處必須強制呼叫 playCallChime"
  );
  assert.ok(
    content.includes("speakIncomingCall(unhandled);"),
    "新來電進線處必須強制呼叫 speakIncomingCall"
  );

  // 5. 驗證強制通知標籤與桌面推播 requireInteraction 持久停留
  assert.ok(
    content.includes("[強制通知]"),
    "新訂單或新來電標題必須標記 [強制通知]"
  );
  assert.ok(
    content.includes("requireInteraction: true"),
    "桌面推播必須設定 requireInteraction: true 保留在螢幕上直到調度員處理"
  );

  // 6. 驗證 CallMonitorView 同步強制啟用
  const callMonPath = path.resolve("c:/shenglong-next/app/components/CallMonitorView.tsx");
  const callMonContent = fs.readFileSync(callMonPath, "utf8");
  assert.ok(
    callMonContent.includes("const [soundEnabled, setSoundEnabled] = useState(true);"),
    "CallMonitorView 內 soundEnabled 必須預設為 true"
  );
});
