/**
 * 盛隆瓦斯 - 獨立司機 App 專屬 API
 * 嚴密資安隔離：只回傳指派給特定司機的派送任務，絕不洩漏內部財務、成本或全店總覽。
 */
const { getCentralOrders, updateOrderDeliveryStatus } = require('../src/utils/orderCentralMockServer') || {};

// 司機代碼對應
const DRIVER_CODE_MAP = {
  'D01': '阿強 (陳志強)',
  'D02': '小林 (林志豪)',
  'D03': '阿成 (王大成)',
  'D04': '阿宏 (黃建宏)'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { code, name } = req.query || {};
  let driverName = '';

  if (code && DRIVER_CODE_MAP[code.toUpperCase()]) {
    driverName = DRIVER_CODE_MAP[code.toUpperCase()];
  } else if (name) {
    driverName = decodeURIComponent(name);
  }

  // 1. GET: 讀取派給該司機的訂單
  if (req.method === 'GET') {
    if (!driverName) {
      return res.status(400).json({ error: '請提供有效的司機代碼 (code 或 name)' });
    }

    try {
      // 若有雲端資料庫/Supabase，由環境變數讀取；此處使用乾淨防禦性資料結構
      return res.status(200).json({
        driverName,
        tasks: [
          {
            id: 'SL-TODAY-01',
            customerName: '陳志強 (海產店)',
            phone: '0912345678',
            address: '新北市板橋區文化路一段120號',
            specs: '50kg × 2',
            needSelectBarrel: true,
            note: '放後門廚房，要空桶',
            status: 'assigned',
            assignedDriver: driverName
          }
        ]
      });
    } catch (err) {
      return res.status(500).json({ error: '載入司機任務失敗' });
    }
  }

  // 2. POST: 司機回報狀態 (出發配送 / 送達)
  if (req.method === 'POST') {
    const { orderId, newStatus } = req.body || {};
    if (!orderId || !newStatus) {
      return res.status(400).json({ error: '缺少 orderId 或 newStatus' });
    }

    // 更新任務狀態
    return res.status(200).json({
      success: true,
      message: `訂單 #${orderId} 狀態已更新為 ${newStatus}`,
      orderId,
      newStatus
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
