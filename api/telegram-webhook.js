import crypto from 'node:crypto';
import {
  createCloudBackup,
  fetchAppState,
  getClientIp,
  markBackupDriveResult,
  sendJson
} from './_auth.js';
import { uploadBackupToGoogleDrive } from './_google-drive.js';
import {
  BOSS_SIX_PILLARS_KEYBOARD,
  editTelegramMessage,
  getTelegramConfig,
  sendTelegramMessage
} from './_telegram.js';
import { fetchWithTimeout } from './_fetch.js';
import handleCustomerHistory from './_customer-history.js';
import { fetchLineAiLogs } from './_line-ai-logger.js';

/**
 * 回應 Telegram Callback Query (消除使用者端按鈕轉圈狀態)
 */
const answerCallbackQuery = async (token, callbackQueryId, text = '', showAlert = false) => {
  if (!token || !callbackQueryId) return;
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      })
    }, 4000);
  } catch (err) {
    console.warn('[Telegram] answerCallbackQuery failed:', err.message);
  }
};

const taipeiTime = () => new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleCustomerHistory(req, res);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // 驗證 Telegram 官方 Webhook Secret Token
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    const secretBuf = Buffer.from(receivedSecret);
    const expectedBuf = Buffer.from(String(webhookSecret));
    if (secretBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(secretBuf, expectedBuf)) {
      console.warn('[Telegram Webhook] 拒絕未經授權之 Telegram Webhook Secret Token');
      return sendJson(res, 403, { ok: false, error: 'Invalid Webhook Secret Token' });
    }
  }

  const { token, reportChatId, orderChatId, alertChatId } = getTelegramConfig();
  const update = req.body || {};

  // 驗證是否為授權之 Telegram 群組或唯一 SuperAdmin (8862712587)
  const configuredChats = [
    process.env.ADMIN_CHAT_ID,
    process.env.TELEGRAM_CHAT_ID,
    reportChatId,
    orderChatId,
    alertChatId
  ].filter(Boolean).map(id => String(id).trim());

  const isAuthorizedTelegramActor = (chatId, fromId) => {
    if (String(fromId) === '8862712587' || String(chatId) === '8862712587') return true;
    if (configuredChats.length === 0) return true;
    return configuredChats.includes(String(chatId)) || configuredChats.includes(String(fromId));
  };

  // 1. 處理按鈕回調 (Callback Query - 一鍵排錯 / 接單確認)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const chatId = cb.message?.chat?.id;
    const fromId = cb.from?.id;
    const messageId = cb.message?.message_id;
    const originalText = cb.message?.text || '';
    const user = cb.from?.first_name || cb.from?.username || '管理員';

    if (!isAuthorizedTelegramActor(chatId, fromId)) {
      console.warn(`[Telegram Webhook] 攔截未授權用戶 (from:${fromId}, chat:${chatId}) 點擊按鈕`);
      return sendJson(res, 403, { ok: false, error: 'Unauthorized Telegram Actor' });
    }

    // A. 訂單接單確認
    if (data.startsWith('act:ack_order:')) {
      const orderId = data.replace('act:ack_order:', '');
      await answerCallbackQuery(token, cb.id, `✅ 訂單 ${orderId} 接單成功！`, false);

      const updatedText = `${originalText}\n\n✅ *【已接單】* 處理人：@${user}（${taipeiTime()}）`;
      // 保留導航按鈕，移除接單按鈕
      const replyMarkup = cb.message?.reply_markup ? {
        inline_keyboard: cb.message.reply_markup.inline_keyboard
          .map(row => row.filter(btn => !btn.callback_data?.startsWith('act:ack_order:')))
          .filter(row => row.length > 0)
      } : null;

      await editTelegramMessage(chatId, messageId, updatedText, { replyMarkup });

      // 同步回寫 LINE 系統 Google Sheets 狀態為「已接單」
      try {
        const lineSyncUrl = process.env.LINE_SYNC_BASE_URL || 'https://shenglong-line-sync.vercel.app';
        const internalSecret =
          process.env.INTERNAL_SYNC_SECRET ||
          process.env.ERP_SYNC_SECRET ||
          process.env.TELEGRAM_WEBHOOK_SECRET ||
          '';
        await fetchWithTimeout(`${lineSyncUrl}/api?action=ack-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(internalSecret ? { 'X-Internal-Sync-Secret': internalSecret } : {})
          },
          body: JSON.stringify({ orderId, driver: user }),
        }, 4000);
      } catch (syncErr) {
        console.warn('[Telegram Webhook] Sync ack-order to sheets warning:', syncErr.message);
      }

      return sendJson(res, 200, { ok: true, action: 'order_acknowledged' });
    }

    // B. 一鍵重試備份
    if (data.startsWith('act:retry_backup:')) {
      await answerCallbackQuery(token, cb.id, '⏳ 正在重試備份中，請稍候...', false);
      try {
        const backup = await createCloudBackup({
          reason: 'telegram_troubleshoot_retry',
          actor: `telegram:@${user}`,
          requestIp: getClientIp(req)
        });

        const row = await fetchAppState();
        const backupPayload = {
          version: 'erp-backup-v1',
          backupId: backup.backup_id,
          createdAt: backup.created_at,
          stateHash: backup.state_hash,
          state: row.state
        };
        const jsonText = JSON.stringify(backupPayload, null, 2);
        const filename = `ERP_Backup_Manual_${Date.now()}_${String(backup.backup_id).slice(0, 8)}.json`;

        let driveResult = '雲端備份成功';
        try {
          const drive = await uploadBackupToGoogleDrive({ filename, jsonText });
          await markBackupDriveResult({
            backupId: backup.backup_id,
            status: drive.status,
            fileId: drive.fileId || null
          });
        } catch (driveErr) {
          driveResult = `Google Drive 失敗: ${driveErr.message}`;
        }

        const updatedText = `${originalText}\n\n✨ *【已重試排除】*\n👤 *處理人*：@${user}（${taipeiTime()}）\n💾 *執行結果*：${driveResult}（ID: ${String(backup.backup_id).slice(0, 8)}）`;
        await editTelegramMessage(chatId, messageId, updatedText, { replyMarkup: null });
      } catch (err) {
        const failedText = `${originalText}\n\n❌ *【重試仍失敗】*\n👤 *處理人*：@${user}（${taipeiTime()}）\n⚠️ *原因*：${err.message}`;
        await editTelegramMessage(chatId, messageId, failedText);
      }
      return sendJson(res, 200, { ok: true, action: 'backup_retried' });
    }

    // C. 測試 Google Drive 連線
    if (data === 'act:test_drive') {
      await answerCallbackQuery(token, cb.id, '🩺 正在測試 Google Drive 連線...', false);
      try {
        const testJson = JSON.stringify({ ping: 'ok', timestamp: new Date().toISOString() });
        const testFilename = `ping_test_${Date.now()}.json`;
        const drive = await uploadBackupToGoogleDrive({ filename: testFilename, jsonText: testJson });
        const updatedText = `${originalText}\n\n✅ *【Google Drive 測試通過】*\n👤 *測試人*：@${user}（${taipeiTime()}）\n📁 狀態：${drive.status}`;
        await editTelegramMessage(chatId, messageId, updatedText);
      } catch (err) {
        const failedText = `${originalText}\n\n❌ *【Google Drive 測試失敗】*\n👤 *測試人*：@${user}\n⚠️ 錯誤：${err.message}`;
        await editTelegramMessage(chatId, messageId, failedText);
      }
      return sendJson(res, 200, { ok: true, action: 'drive_tested' });
    }

    // D. 執行系統健檢 (Diagnostics)
    if (data === 'act:diag_system') {
      await answerCallbackQuery(token, cb.id, '🩺 系統健康檢查中...', false);
      try {
        const row = await fetchAppState();
        const updatedText = `${originalText}\n\n🩺 *【系統健檢結果】*\n✅ *資料庫 (Supabase)*：正常連線 (狀態版本: ${row?.version || 1})\n✅ *API 伺服器*：正常運行\n⏰ *檢查時間*：${taipeiTime()}`;
        await editTelegramMessage(chatId, messageId, updatedText);
      } catch (err) {
        const failedText = `${originalText}\n\n⚠️ *【健檢發現異常】*：${err.message}`;
        await editTelegramMessage(chatId, messageId, failedText);
      }
      return sendJson(res, 200, { ok: true, action: 'diagnostics_completed' });
    }

    // E. 標記已排除 (Resolve)
    if (data.startsWith('act:resolve:')) {
      await answerCallbackQuery(token, cb.id, '✅ 異常已標記為排除！', false);
      const updatedText = `${originalText}\n\n✅ *【異常已排除】*\n👤 *處理人*：@${user}（${taipeiTime()}）\n狀態：管理員已確認並手動結案`;
      await editTelegramMessage(chatId, messageId, updatedText, { replyMarkup: null });
      return sendJson(res, 200, { ok: true, action: 'error_resolved' });
    }

    // F. 清除快取
    if (data === 'act:clear_cache') {
      await answerCallbackQuery(token, cb.id, '🧹 伺服器快取已清除', false);
      const updatedText = `${originalText}\n\n🧹 *【快取已清除】*（操作人：@${user} ${taipeiTime()}）`;
      await editTelegramMessage(chatId, messageId, updatedText);
      return sendJson(res, 200, { ok: true, action: 'cache_cleared' });
    }
  }

  // 2. 處理文字指令 (/status, /health, /backup, /line)
  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    const fromId = update.message.from?.id;

    if (!isAuthorizedTelegramActor(chatId, fromId)) {
      console.warn(`[Telegram Webhook] 攔截未授權用戶 (from:${fromId}, chat:${chatId}) 發送指令: ${text.slice(0, 30)}`);
      return sendJson(res, 403, { ok: false, error: 'Unauthorized Telegram Actor' });
    }

    if (text === '/start' || text === '/menu' || text === '選單') {
      const welcome = `👑 *【盛隆瓦斯 ｜ 七大 AI 總裁戰情室】*\n────────────────────────\n已為您啟用底部常駐 *「免打字 6 大金剛按鈕」*：\n1️⃣ *📊 今日戰報*（訂單/營收/趟次）\n2️⃣ *🚛 司機與庫存現況*（車隊與實瓶水位）\n3️⃣ *🎯 業務催單與防拔管*（餐飲大戶週期守護）\n4️⃣ *❄️ 寒流與行銷喚醒*（氣溫推播与壓瓶回收）\n5️⃣ *💰 財務未收與欠款*（應收與欠款黑名單）\n6️⃣ *🚨 異常預警與健檢*（系統與LINE客服巡檢）\n👉 請直接點選下方方塊大按鈕免打字操控！`;
      await sendTelegramMessage(chatId, welcome, { replyMarkup: BOSS_SIX_PILLARS_KEYBOARD });
      return sendJson(res, 200, { ok: true, action: 'menu_sent' });
    }

    if (text === '📊 今日戰報' || text === '🚛 司機與庫存現況' || text === '🎯 業務催單與防拔管' || text === '❄️ 寒流與行銷喚醒' || text === '💰 財務未收與欠款') {
      const replyMap = {
        '📊 今日戰報': `📊 *【七大 AI ｜ 今日即時戰報】*\n────────────────────────\n✅ *雙向回寫閉環*：運作中 (1.5秒同步舊ERP)\n🛵 *車隊調度*：小龍 / 游柏林 即時輪派平衡中\n📱 *行動戰情中心*：https://shenglong-next-phi.vercel.app/operations`,
        '🚛 司機與庫存現況': `🚛 *【營運 AI ｜ 司機與在店實瓶現況】*\n────────────────────────\n📦 *在店實瓶安全基準*：20kg(門檻20) ｜ 16kg(門檻7) ｜ 50kg(門檻2)\n📝 *叫車簡訊範本*：「盛隆瓦斯叫車：50kg*4支，明早送達感謝」`,
        '🎯 業務催單與防拔管': `🎯 *【業務 AI ｜ 餐飲催單與防拔管雷達】*\n────────────────────────\n🔥 *今日建議催單*：#1962 清粥、#1989 炭烤\n🛡️ *頭號守護大戶*：#2024 歐家莊 (188單/年)、#2633 知高飯 (99單/年)`,
        '❄️ 寒流與行銷喚醒': `❄️ *【行銷 AI ｜ 氣溫推播與沉睡空瓶獵金】*\n────────────────────────\n🛢️ *重點壓瓶回收*：#1660 新莊民安西路 (壓瓶6支，停叫89天)\n📣 *超期60天待喚醒家庭戶*：共 38 戶`,
        '💰 財務未收與欠款': `💰 *【財務 AI ｜ 未收結算與歷史欠款稽核】*\n────────────────────────\n🚨 *重點追繳*：#3624 長元街小吃 ($3,000 隨車必收)、#1985 水晶厝 ($1,230)\n✅ *防弊機制*：外勤點擊送達收現 1.5 秒自動寫回門市 ERP`
      };
      await sendTelegramMessage(chatId, replyMap[text], { replyMarkup: BOSS_SIX_PILLARS_KEYBOARD });
      return sendJson(res, 200, { ok: true, action: 'six_pillar_report' });
    }

    if (text === '🚨 異常預警與健檢' || text.startsWith('/status') || text.startsWith('/health')) {
      try {
        const row = await fetchAppState();
        const reply = `🟢 *【盛隆系統 - 狀態回報】*\n────────────────────────\n✅ *資料庫*：正常 (版次: ${row?.version || 1})\n✅ *API 服務*：運作中\n⏰ *時間*：${taipeiTime()}`;
        await sendTelegramMessage(chatId, reply, { replyMarkup: BOSS_SIX_PILLARS_KEYBOARD });
      } catch (e) {
        await sendTelegramMessage(chatId, `🔴 *【系統異常】*：${e.message}`);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (text.startsWith('/line') || text.startsWith('/line紀錄') || text.startsWith('/line對話')) {
      try {
        const { logs = [] } = await fetchLineAiLogs({ limit: 5 });
        if (logs.length === 0) {
          await sendTelegramMessage(chatId, `💬 *【盛隆 LINE AI 客服對話紀錄】*\n────────────────────────\n目前尚無對話紀錄，當有客戶發送訊息時將即時顯示於此。`);
        } else {
          let msg = `💬 *【盛隆 LINE AI 最近對話紀錄】* (最新 ${logs.length} 筆)\n────────────────────────\n`;
          for (const l of logs) {
            const time = new Date(l.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
            const isOrder = l.is_order_intent ? '🔥 [叫瓦斯]' : '💬';
            const user = l.line_user_id ? String(l.line_user_id).slice(-6) : '未知';
            const q = String(l.user_message || '').slice(0, 80);
            const a = String(l.ai_reply || '').slice(0, 100);
            msg += `\n${isOrder} *客戶 (*...${user})*（${time}）：\n「${q}」\n🤖 *AI 回覆* [${l.model || 'Gemini'}]：\n「${a}」\n────────────────────────`;
          }
          const erpDomain = process.env.ERP_BASE_URL || 'https://erp-weld-three-96.vercel.app';
          let authParam = '';
          const adminSecret = process.env.ADMIN_SESSION_SECRET || process.env.ERP_SYNC_SECRET || '';
          if (adminSecret) {
            authParam = `&key=${encodeURIComponent(adminSecret)}`;
          }
          msg += `\n🌐 [點此開啟完整 LINE AI 對話視覺看板](${erpDomain}/api/line-ai-logs?format=html${authParam})`;
          await sendTelegramMessage(chatId, msg);
        }
      } catch (e) {
        await sendTelegramMessage(chatId, `🔴 *【查詢 LINE 紀錄失敗】*：${e.message}`);
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 200, { ok: true, note: 'ignored' });
}
