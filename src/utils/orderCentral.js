/**
 * 盛隆瓦斯 - 訂單調度中心與事件同步服務 (Order Central)
 * 支援 BossApp 調度、DriverApp 司機工作台與跨視窗即時 BroadcastChannel / Storage 廣播。
 */

const STORAGE_ORDERS_KEY = 'sl_central_orders';
const STORAGE_DRIVERS_KEY = 'sl_central_drivers';
const BROADCAST_CHANNEL_NAME = 'sl_order_events_channel';

// 預設司機清單 (包含真實司機與預設代碼司機)
const DEFAULT_DRIVERS = [
  { id: 'drv_01', code: 'D01', name: '游柏林', phone: '0912-345-678', vehicle: '三輪機車', isActive: true, createdAt: '2026/09/01' },
  { id: 'drv_02', code: 'D02', name: '小龍', phone: '0923-456-789', vehicle: '三輪機車', isActive: true, createdAt: '2026/09/01' },
  { id: 'drv_03', code: 'D03', name: '阿強 (陳志強)', phone: '0934-567-890', vehicle: '三輪機車', isActive: true, createdAt: '2026/10/01' },
  { id: 'drv_04', code: 'D04', name: '小林 (林志豪)', phone: '0945-678-901', vehicle: '貨車', isActive: true, createdAt: '2026/10/01' },
  { id: 'drv_05', code: 'D05', name: '阿成 (王大成)', phone: '0956-789-012', vehicle: '機車', isActive: true, createdAt: '2026/10/01' },
  { id: 'drv_06', code: 'D06', name: '阿宏 (黃建宏)', phone: '0967-890-123', vehicle: '機車', isActive: true, createdAt: '2026/10/01' }
];

// 預設訂單資料
const DEFAULT_ORDERS = [
  {
    orderId: 'SL-20261001-01',
    id: 'SL-20261001-01',
    customerName: '陳志強 (海產店)',
    phone: '0912345678',
    address: '新北市板橋區文化路一段120號',
    specs: '50kg × 2',
    items: [{ name: '50kg 營業瓦斯', quantity: 2, price: 1950 }],
    total: 3900,
    needSelectBarrel: true,
    note: '放後門廚房，要空桶',
    status: 'assigned', // pending_assign | assigned | delivering | delivered | settled
    assignedDriver: '阿強 (陳志強)',
    isSettled: false,
    createdAt: '2026-10-01T08:30:00.000Z'
  },
  {
    orderId: 'SL-20261001-02',
    id: 'SL-20261001-02',
    customerName: '王美惠 (美而美早餐)',
    phone: '0922888999',
    address: '新北市板橋區中山路二段45號',
    specs: '20kg × 1',
    items: [{ name: '20kg 瓦斯', quantity: 1, price: 850 }],
    total: 850,
    needSelectBarrel: false,
    note: '送到請直接按鈴',
    status: 'delivering',
    assignedDriver: '游柏林',
    isSettled: false,
    createdAt: '2026-10-01T09:15:00.000Z'
  },
  {
    orderId: 'SL-20261001-03',
    id: 'SL-20261001-03',
    customerName: '阿發便當快炒',
    phone: '0933112233',
    address: '新北市中和區員山路180號',
    specs: '50kg × 1',
    items: [{ name: '50kg 營業瓦斯', quantity: 1, price: 1950 }],
    total: 1950,
    needSelectBarrel: true,
    note: '要附收據',
    status: 'pending_assign',
    assignedDriver: null,
    isSettled: false,
    createdAt: '2026-10-01T10:00:00.000Z'
  }
];

// BroadcastChannel 單例與回呼清單
let broadcastChannel = null;
const eventListeners = new Set();

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event.data) {
        eventListeners.forEach(listener => {
          try { listener(event.data); } catch (e) { console.error(e); }
        });
      }
    };
  } catch (err) {
    console.warn('BroadcastChannel not available:', err);
  }
}

// 發送事件通知本視窗與跨視窗
const emitEvent = (type, payload) => {
  const event = { type, payload, timestamp: Date.now() };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(event); } catch (e) {}
  }
  eventListeners.forEach(listener => {
    try { listener(event); } catch (e) { console.error(e); }
  });
};

let memoryOrders = [...DEFAULT_ORDERS];
let memoryDrivers = [...DEFAULT_DRIVERS];

/**
 * 取得司機清單
 */
export const getDriversList = () => {
  if (typeof window === 'undefined') return memoryDrivers;
  try {
    const raw = localStorage.getItem(STORAGE_DRIVERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_DRIVERS_KEY, JSON.stringify(DEFAULT_DRIVERS));
      return DEFAULT_DRIVERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DRIVERS;
  } catch {
    return DEFAULT_DRIVERS;
  }
};

/**
 * 儲存司機清單
 */
export const saveDriversList = (drivers) => {
  memoryDrivers = drivers;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_DRIVERS_KEY, JSON.stringify(drivers));
    emitEvent('DRIVERS_UPDATED', { count: drivers.length });
  } catch (err) {
    console.error('Failed to save drivers list:', err);
  }
};

/**
 * 取得所有調度訂單
 */
export const getCentralOrders = () => {
  if (typeof window === 'undefined') return memoryOrders;
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(DEFAULT_ORDERS));
      return DEFAULT_ORDERS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_ORDERS;
  } catch {
    return memoryOrders;
  }
};

/**
 * 儲存所有調度訂單
 */
export const saveCentralOrders = (orders) => {
  memoryOrders = orders;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders));
  } catch (err) {
    console.error('Failed to save central orders:', err);
  }
};

/**
 * 新增中央調度訂單
 */
export const addCentralOrder = (orderData) => {
  const orders = getCentralOrders();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderId = `SL-${dateStr}-${String(orders.length + 1).padStart(2, '0')}`;

  const newOrder = {
    orderId,
    id: orderId,
    customerName: orderData.customerName || '散客',
    phone: orderData.phone || '',
    address: orderData.address || '',
    specs: orderData.specs || (orderData.items?.map(i => `${i.name} × ${i.quantity}`).join(', ') || '20kg × 1'),
    items: orderData.items || [{ name: '20kg 瓦斯', quantity: 1, price: 850 }],
    total: Number(orderData.total) || 850,
    needSelectBarrel: Boolean(orderData.needSelectBarrel ?? (String(orderData.specs || '').includes('50kg'))),
    note: orderData.note || '',
    status: orderData.assignedDriver ? 'assigned' : 'pending_assign',
    assignedDriver: orderData.assignedDriver || null,
    isSettled: false,
    createdAt: new Date().toISOString()
  };

  const updated = [newOrder, ...orders];
  saveCentralOrders(updated);
  emitEvent('ORDER_CREATED', newOrder);
  if (newOrder.assignedDriver) {
    emitEvent('ORDER_ASSIGNED', newOrder);
  }
  return newOrder;
};

/**
 * 指派司機
 */
export const assignOrderDriver = (orderId, driverName) => {
  const orders = getCentralOrders();
  let targetOrder = null;
  const updated = orders.map(ord => {
    if (ord.orderId === orderId || ord.id === orderId) {
      targetOrder = {
        ...ord,
        assignedDriver: driverName,
        status: ord.status === 'pending_assign' ? 'assigned' : ord.status,
        assignedAt: new Date().toISOString()
      };
      return targetOrder;
    }
    return ord;
  });

  saveCentralOrders(updated);
  if (targetOrder) {
    emitEvent('ORDER_ASSIGNED', targetOrder);
    emitEvent('ORDER_STATUS_CHANGED', targetOrder);
  }
  return targetOrder;
};

/**
 * 更新司機配送狀態 (delivering / delivered)
 */
export const updateOrderDeliveryStatus = (orderId, newStatus, details = {}) => {
  const orders = getCentralOrders();
  let targetOrder = null;
  const updated = orders.map(ord => {
    if (ord.orderId === orderId || ord.id === orderId) {
      targetOrder = {
        ...ord,
        status: newStatus,
        ...details
      };
      if (newStatus === 'delivered') {
        targetOrder.deliveredAt = new Date().toISOString();
      }
      return targetOrder;
    }
    return ord;
  });

  saveCentralOrders(updated);
  if (targetOrder) {
    emitEvent('ORDER_STATUS_CHANGED', targetOrder);
  }
  return targetOrder;
};

/**
 * 主機操作員結帳結案 (settled)
 */
export const settleOrderCheckout = (orderId, settlementInfo = {}) => {
  const orders = getCentralOrders();
  let targetOrder = null;
  const updated = orders.map(ord => {
    if (ord.orderId === orderId || ord.id === orderId) {
      targetOrder = {
        ...ord,
        isSettled: true,
        status: 'settled',
        settledAt: new Date().toISOString(),
        settlement: settlementInfo
      };
      return targetOrder;
    }
    return ord;
  });

  saveCentralOrders(updated);
  if (targetOrder) {
    emitEvent('ORDER_SETTLED', targetOrder);
    emitEvent('ORDER_STATUS_CHANGED', targetOrder);
  }
  return targetOrder;
};

/**
 * 監聽調度中心事件
 */
export const subscribeOrderEvents = (listener) => {
  if (typeof listener !== 'function') return () => {};
  eventListeners.add(listener);

  const storageHandler = (e) => {
    if (e.key === STORAGE_ORDERS_KEY) {
      try {
        const currentOrders = JSON.parse(e.newValue || '[]');
        listener({ type: 'ORDERS_SYNCED', payload: currentOrders });
      } catch {}
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageHandler);
  }

  return () => {
    eventListeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', storageHandler);
    }
  };
};
