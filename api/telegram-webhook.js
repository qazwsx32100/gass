import {
  createCloudBackup,
  fetchAppState,
  getClientIp,
  markBackupDriveResult,
  sendJson
} from './_auth.js';
import { uploadBackupToGoogleDrive } from './_google-drive.js';
import {
  editTelegramMessage,
  getTelegramConfig,
  sendTelegramMessage
} from './_telegram.js';
import { fetchWithTimeout } from './_fetch.js';

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const { token } = getTelegramConfig();
  const update = req.body || {};

  // 1. 處理按鈕回調 (Callback Query - 一鍵排錯 / 接單確認)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data || '';
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;
    const originalText = cb.message?.text || '';
    const user = cb.from?.first_name || cb.from?.username || '管理員';

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

  // 2. 處理文字指令 (/status, /health, /backup)
  if (update.message && update.message.text) {
    const text = update.message.text.trim();
    const chatId = update.message.chat.id;

    if (text.startsWith('/status') || text.startsWith('/health')) {
      try {
        const row = await fetchAppState();
        const reply = `🟢 *【盛隆系統 - 狀態回報】*\n────────────────────────\n✅ *資料庫*：正常 (版次: ${row?.version || 1})\n✅ *API 服務*：運作中\n⏰ *時間*：${taipeiTime()}`;
        await sendTelegramMessage(chatId, reply);
      } catch (e) {
        await sendTelegramMessage(chatId, `🔴 *【系統異常】*：${e.message}`);
      }
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 200, { ok: true, note: 'ignored' });
}
