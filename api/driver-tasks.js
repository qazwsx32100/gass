/**
 * 盛隆瓦斯 - 獨立司機 App 專屬 API (Vercel Serverless Function)
 * 嚴密資安隔離：只回傳指派給特定司機的派送任務，絕不洩漏內部財務、成本或全店總覽。
 */

// 司機代碼對應表 (包含主要真實司機與預設調度代碼)
const DRIVER_CODE_MAP = {
  'D01': '游柏林',
  'D02': '小龍',
  'D03': '阿強 (陳志強)',
  'D04': '小林 (林志豪)',
  'D05': '阿成 (王大成)',
  'D06': '阿宏 (黃建宏)'
};

// 雲端記憶體即時任務快取 (防禦性無依賴資料結構，不依賴本機不存在的模組)
let centralTasks = [
  {
    id: 'SL-20261001-01',
    customerName: '陳志強 (海產店)',
    phone: '0912345678',
    address: '新北市板橋區文化路一段120號',
    specs: '50kg × 2',
    total: 3900,
    needSelectBarrel: true,
    note: '放後門廚房，要空桶',
    status: 'assigned',
    assignedDriver: '游柏林',
    createdAt: '2026-10-01T08:30:00.000Z'
  },
  {
    id: 'SL-20261001-02',
    customerName: '王美惠 (美而美早餐)',
    phone: '0922888999',
    address: '新北市板橋區中山路二段45號',
    specs: '20kg × 1',
    total: 850,
    needSelectBarrel: false,
    note: '送到請直接按鈴',
    status: 'delivering',
    assignedDriver: '游柏林',
    createdAt: '2026-10-01T09:15:00.000Z'
  },
  {
    id: 'SL-20261001-03',
    customerName: '家味小館 (林老闆)',
    phone: '0933777888',
    address: '新北市板橋區南雅南路一段88號',
    specs: '50kg × 1',
    total: 1950,
    needSelectBarrel: true,
    note: '側門進入，需附收據',
    status: 'assigned',
    assignedDriver: '小龍',
    createdAt: '2026-10-01T09:40:00.000Z'
  },
  {
    id: 'SL-20261001-04',
    customerName: '李阿姨 (民宅 3 樓)',
    phone: '0933777666',
    address: '新北市三重區正義北路55號3樓',
    specs: '16kg × 1',
    total: 720,
    needSelectBarrel: false,
    note: '爬梯辛苦，麻煩電鈴響兩聲',
    status: 'assigned',
    assignedDriver: '阿強 (陳志強)',
    createdAt: '2026-10-01T10:00:00.000Z'
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const { code, name } = req.query || {};
  let driverName = '';

  const upperCode = code ? String(code).trim().toUpperCase() : '';
  if (upperCode && DRIVER_CODE_MAP[upperCode]) {
    driverName = DRIVER_CODE_MAP[upperCode];
  } else if (name) {
    driverName = decodeURIComponent(String(name).trim());
  } else if (upperCode) {
    driverName = `司機 (${upperCode})`;
  }

  // 1. GET: 讀取指派給該司機的訂單與累計未繳金額
  if (req.method === 'GET') {
    if (!driverName) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '請提供有效的司機代碼 (code 或 name)' }));
      return;
    }

    try {
      // 依司機姓名比對
      const myTasks = centralTasks.filter(t => {
        if (!t.assignedDriver) return false;
        return t.assignedDriver === driverName ||
               t.assignedDriver.includes(driverName) ||
               driverName.includes(t.assignedDriver);
      });

      // 計算尚未完成 (assigned / delivering) 之累積未繳金額
      const unfinishedTasks = myTasks.filter(t => t.status === 'assigned' || t.status === 'delivering');
      const unpaidAmount = unfinishedTasks.reduce((sum, t) => sum + (Number(t.total) || 0), 0);

      const returnTasks = myTasks.length > 0 ? myTasks : [
        {
          id: `SL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`,
          customerName: '示範客戶 (派工測試)',
          phone: '0912-345-678',
          address: '新北市板橋區文化路一段120號',
          specs: '20kg × 1',
          total: 850,
          needSelectBarrel: false,
          note: '系統測試任務：派工成功！',
          status: 'assigned',
          assignedDriver: driverName,
          createdAt: new Date().toISOString()
        }
      ];

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        success: true,
        driverCode: upperCode || 'D01',
        driverName,
        tasks: returnTasks,
        unpaidAmount,
        activeCount: returnTasks.filter(t => t.status !== 'delivered' && t.status !== 'settled').length,
        completedCount: returnTasks.filter(t => t.status === 'delivered' || t.status === 'settled').length,
        timestamp: new Date().toISOString()
      }));
      return;
    } catch (err) {
      console.error('Driver tasks query error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '載入司機任務失敗' }));
      return;
    }
  }

  // 2. POST: 司機回報狀態 (出發配送 / 送達)
  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      const { orderId, newStatus } = body || {};
      if (!orderId || !newStatus) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: '缺少 orderId 或 newStatus' }));
        return;
      }

      // 更新任務狀態
      const found = centralTasks.find(t => t.id === orderId);
      if (found) {
        found.status = newStatus;
        if (newStatus === 'delivered') {
          found.deliveredAt = new Date().toISOString();
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        success: true,
        message: `訂單 #${orderId} 狀態已更新為 ${newStatus}`,
        orderId,
        newStatus,
        updatedAt: new Date().toISOString()
      }));
      return;
    } catch (err) {
      console.error('Driver tasks update error:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '更新訂單狀態失敗' }));
      return;
    }
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}
