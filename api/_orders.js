import { sendJson } from './_auth.js';
import { sendOrderNotification, sendTelegramMessage, getTelegramConfig } from './_telegram.js';

// In-memory cache for recent orders (if DB isn't directly bound)
let recentOrders = [];

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: 取得近期叫貨訂單
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      orders: recentOrders.slice(0, 50)
    });
  }

  // POST: 接收新訂單 (例如來自 LINE Bot Webhook 或前端)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const orderId = body.orderId || `ORD_${Date.now().toString().slice(-6)}`;
      const newOrder = {
        orderId,
        customerName: body.customerName || '未填寫',
        phone: body.phone || '',
        address: body.address || '',
        items: Array.isArray(body.items) ? body.items : [],
        total: Number(body.total) || 0,
        note: body.note || '',
        createdAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }),
        timestamp: Date.now(),
        status: 'pending',
        acknowledgedBy: null,
        acknowledgedAt: null,
        convertedToIncome: false
      };

      // 儲存於近期訂單佇列
      recentOrders.unshift(newOrder);
      if (recentOrders.length > 100) recentOrders.pop();

      // 同步推播至 Telegram (雙軌運作，不中斷既有群組通知)
      try {
        await sendOrderNotification(newOrder);
      } catch (tgErr) {
        console.warn('[Orders API] Telegram sync failed:', tgErr.message);
      }

      return sendJson(res, 200, {
        ok: true,
        message: 'Order created and dispatched',
        order: newOrder
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // PATCH: 更新接單狀態 (接單、配送、完成)
  if (req.method === 'PATCH') {
    try {
      const { orderId, status, acknowledgedBy } = req.body || {};
      if (!orderId) {
        return sendJson(res, 400, { ok: false, error: 'Missing orderId' });
      }

      const order = recentOrders.find((o) => o.orderId === orderId);
      if (order) {
        if (status) order.status = status;
        if (acknowledgedBy) {
          order.acknowledgedBy = acknowledgedBy;
          order.acknowledgedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        }
      }

      // 若在 App 接單，可選擇推播至 Telegram 通知已接單
      if (status === 'acknowledged') {
        const { orderChatId, reportChatId } = getTelegramConfig();
        const msg = `✅ *【App 接單確認】*\n訂單編號：#${orderId}\n處理人員：${acknowledgedBy || '調度員'}\n時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
        if (orderChatId) sendTelegramMessage(orderChatId, msg);
        if (reportChatId && reportChatId !== orderChatId) sendTelegramMessage(reportChatId, msg);
      }

      return sendJson(res, 200, { ok: true, order });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
}
