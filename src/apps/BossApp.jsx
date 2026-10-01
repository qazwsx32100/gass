import React, { useState, useEffect } from 'react';
import {
  getCentralOrders,
  getDriversList,
  addCentralOrder,
  assignOrderDriver,
  settleOrderCheckout,
  subscribeOrderEvents
} from '../utils/orderCentral';
import { sendSystemNotification, requestNotificationPermission, getNotificationPermission } from '../utils/notificationService';
import SystemDiagnosticsModal from '../components/SystemDiagnosticsModal';

export default function BossApp() {
  const [orders, setOrders] = useState(() => getCentralOrders());
  const [drivers, setDrivers] = useState(() => getDriversList());
  const [filterTab, setFilterTab] = useState('all'); // all | pending | delivering | delivered | completed
  const [selectedDriverMap, setSelectedDriverMap] = useState({});
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [permission, setPermission] = useState(getNotificationPermission());
  const [toast, setToast] = useState(null);

  // 代客建單表單
  const [manualForm, setManualForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    spec: '20kg',
    quantity: 1,
    unitPrice: 850,
    note: '',
    assignedDriver: ''
  });

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 重新讀取訂單
  const refreshOrders = () => {
    setOrders(getCentralOrders());
  };

  // 監聽跨視窗廣播與推播事件
  useEffect(() => {
    const unsubscribe = subscribeOrderEvents((event) => {
      refreshOrders();
      if (event.type === 'ORDER_CREATED') {
        showToastMsg(`🔔 收到新進訂單 #${event.payload?.orderId}！`, 'info');
        sendSystemNotification({
          title: `📦 盛隆調度 - 收到新訂單！$${event.payload?.total || 0}`,
          body: `客戶：${event.payload?.customerName} / 地址：${event.payload?.address}`,
          tag: `boss-order-${event.payload?.orderId}`
        });
      } else if (event.type === 'ORDER_STATUS_CHANGED') {
        if (event.payload?.status === 'delivered') {
          showToastMsg(`🛵 司機 ${event.payload?.assignedDriver} 已送達訂單 #${event.payload?.orderId}，請主機操作員確認結帳！`, 'warning');
          sendSystemNotification({
            title: `🛵 司機已送達！請確認結帳`,
            body: `訂單 #${event.payload?.orderId}（${event.payload?.customerName}），司機回報已送達！`,
            tag: `boss-delivered-${event.payload?.orderId}`
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 請求通知權限
  const handleEnableNotification = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      showToastMsg('🎉 盛隆調度管理 - 系統推播通知已成功啟用！');
      sendSystemNotification({
        title: '🔔 盛隆調度管理 (Boss)',
        body: '當有任何 LINE 或電話新訂單時，您將第一時間收到全單彈窗提醒！'
      });
    } else {
      showToastMsg(`通知權限狀態：${perm}`, 'warning');
    }
  };

  // 模擬 LINE 新訂單
  const handleSimulateLineOrder = () => {
    const customers = [
      { name: '海鮮熱炒百匯 (張老闆)', phone: '0912-888-999', address: '台北市大同區延平北路三段 102 號', items: [{ name: '50kg 營業瓦斯', quantity: 2, price: 1950 }], total: 3900 },
      { name: '晨間廚房 (林店長)', phone: '0922-333-444', address: '新北市三重區正義北路 55 號', items: [{ name: '20kg 瓦斯', quantity: 1, price: 850 }], total: 850 },
      { name: '李阿姨 (民宅 3 樓)', phone: '0933-777-666', address: '新北市蘆洲區長安街 88 巷 12 號 3 樓', items: [{ name: '16kg 瓦斯', quantity: 1, price: 720 }, { name: '安全調節器', quantity: 1, price: 350 }], total: 1070 }
    ];
    const pick = customers[Math.floor(Math.random() * customers.length)];
    const newOrd = addCentralOrder({
      ...pick,
      note: '麻煩下午尖峰前送達，謝謝！'
    });
    refreshOrders();
    showToastMsg(`📦 已模擬生成 LINE 新訂單 #${newOrd.orderId}！`);
  };

  // 主機指派司機
  const handleAssignDriver = (orderId) => {
    const driverName = selectedDriverMap[orderId];
    if (!driverName) {
      showToastMsg('請先選擇要指派的司機人員！', 'warning');
      return;
    }
    assignOrderDriver(orderId, driverName);
    refreshOrders();
    showToastMsg(`✅ 訂單 #${orderId} 已成功指派給司機【${driverName}】！`);
  };

  // 主機結帳完成 (核心業務：主機操作人員結帳時，系統同步顯示完成)
  const handleSettleCheckout = (orderId, total) => {
    settleOrderCheckout(orderId, {
      settlementMethod: '現金',
      operatorName: '店內主機操作員'
    });
    refreshOrders();
    showToastMsg(`💵 訂單 #${orderId} 已結帳完成 ($${total})！全端同步標記為已結案。`);
  };

  // 提交電話代客建單
  const handleCreateManualOrder = (e) => {
    e.preventDefault();
    if (!manualForm.customerName || !manualForm.address) {
      showToastMsg('請填寫客戶姓名與配送地址！', 'warning');
      return;
    }

    const total = Number(manualForm.unitPrice) * Number(manualForm.quantity);
    const newOrd = addCentralOrder({
      customerName: manualForm.customerName,
      phone: manualForm.phone,
      address: manualForm.address,
      items: [{ name: `${manualForm.spec} 瓦斯`, quantity: Number(manualForm.quantity), price: Number(manualForm.unitPrice) }],
      total,
      note: manualForm.note,
      assignedDriver: manualForm.assignedDriver || null
    });

    refreshOrders();
    setIsManualModalOpen(false);
    setManualForm({
      customerName: '',
      phone: '',
      address: '',
      spec: '20kg',
      quantity: 1,
      unitPrice: 850,
      note: '',
      assignedDriver: ''
    });
    showToastMsg(`📞 成功建立電話訂單 #${newOrd.orderId}！`);
  };

  // 統計數據
  const totalCount = orders.length;
  const pendingAssignCount = orders.filter((o) => o.status === 'pending_assign').length;
  const deliveringCount = orders.filter((o) => o.status === 'delivering' || o.status === 'assigned').length;
  const awaitingSettleCount = orders.filter((o) => o.status === 'delivered' && !o.isSettled).length;
  const settledTotalRevenue = orders
    .filter((o) => o.isSettled)
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // 依分頁過濾
  const filteredOrders = orders.filter((ord) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'pending') return ord.status === 'pending_assign';
    if (filterTab === 'delivering') return ord.status === 'assigned' || ord.status === 'delivering';
    if (filterTab === 'awaiting_settle') return ord.status === 'delivered' && !ord.isSettled;
    if (filterTab === 'completed') return ord.isSettled;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toast 提示 */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: toast.type === 'warning' ? '#d97706' : toast.type === 'info' ? '#2563eb' : '#059669',
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: '30px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          fontWeight: 600,
          fontSize: '14px',
          animation: 'fadeIn 0.2s'
        }}>
          {toast.msg}
        </div>
      )}

      {/* 頂部導覽列 */}
      <header style={{
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            boxShadow: '0 4px 10px rgba(37,99,235,0.4)'
          }}>
            👑
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.2px', color: '#ffffff' }}>
              盛隆調度管理 <span style={{ fontSize: '12px', background: '#1e3a8a', color: '#93c5fd', padding: '2px 8px', borderRadius: '6px', marginLeft: '6px' }}>Boss 端</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              主機調度台 ｜ 全單監控・司機派工・主機結帳
            </div>
          </div>
        </div>

        {/* 頂部快捷按鈕群 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* 通知授權按鈕 */}
          {permission !== 'granted' ? (
            <button
              onClick={handleEnableNotification}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🔔 開啟推播彈窗
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: '#4ade80', background: 'rgba(34,197,94,0.15)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.3)' }}>
              🟢 全單推播中
            </span>
          )}

          {/* 監控中心 (司機後台設定) */}
          <button
            onClick={() => setIsDiagOpen(true)}
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)'
            }}
          >
            <span>🖥️</span> 監控中心 (司機後台)
          </button>

          {/* 電話代客建單 */}
          <button
            onClick={() => setIsManualModalOpen(true)}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📞 電話代客建單
          </button>

          {/* 模擬 LINE 訂單 */}
          <button
            onClick={handleSimulateLineOrder}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📱 模擬 LINE 訂單
          </button>

          {/* 快速跳轉司機端 */}
          <a
            href="/driver"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#334155',
              color: '#38bdf8',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              border: '1px solid #475569'
            }}
          >
            🛵 開啟司機 App ↗
          </a>
        </div>
      </header>

      {/* 主體內容 */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px 16px' }}>
        {/* 狀態數據看板 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>📋 今日總訂單數</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>{totalCount} <span style={{ fontSize: '14px', fontWeight: 400 }}>單</span></div>
          </div>

          <div style={{
            background: pendingAssignCount > 0 ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
            padding: '16px',
            borderRadius: '12px',
            border: pendingAssignCount > 0 ? '2px solid #ef4444' : '1px solid #334155'
          }}>
            <div style={{ fontSize: '12px', color: pendingAssignCount > 0 ? '#fca5a5' : '#94a3b8' }}>⚡ 待指派司機</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: pendingAssignCount > 0 ? '#ef4444' : '#f8fafc', marginTop: '4px' }}>
              {pendingAssignCount} <span style={{ fontSize: '14px', fontWeight: 400 }}>單</span>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>🚚 司機配送中</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#60a5fa', marginTop: '4px' }}>{deliveringCount} <span style={{ fontSize: '14px', fontWeight: 400 }}>單</span></div>
          </div>

          <div style={{
            background: awaitingSettleCount > 0 ? 'rgba(245, 158, 11, 0.15)' : '#1e293b',
            padding: '16px',
            borderRadius: '12px',
            border: awaitingSettleCount > 0 ? '2px solid #f59e0b' : '1px solid #334155'
          }}>
            <div style={{ fontSize: '12px', color: awaitingSettleCount > 0 ? '#fde68a' : '#94a3b8' }}>📦 司機已送達 (待主機結帳)</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: awaitingSettleCount > 0 ? '#f59e0b' : '#f8fafc', marginTop: '4px' }}>
              {awaitingSettleCount} <span style={{ fontSize: '14px', fontWeight: 400 }}>單</span>
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>💰 今日已結帳總營收</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#4ade80', marginTop: '4px' }}>${settledTotalRevenue.toLocaleString()}</div>
          </div>
        </div>

        {/* 分頁過濾標籤列 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { key: 'all', label: `全部訂單 (${totalCount})` },
            { key: 'pending', label: `待指派司機 (${pendingAssignCount})` },
            { key: 'delivering', label: `配送/指派中 (${deliveringCount})` },
            { key: 'awaiting_settle', label: `待主機結帳 (${awaitingSettleCount})` },
            { key: 'completed', label: `已完成結案 (${orders.filter(o => o.isSettled).length})` }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                background: filterTab === tab.key ? '#2563eb' : '#1e293b',
                color: filterTab === tab.key ? '#ffffff' : '#94a3b8',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 訂單列表 */}
        {filteredOrders.length === 0 ? (
          <div style={{
            background: '#1e293b',
            borderRadius: '16px',
            padding: '60px 20px',
            textAlign: 'center',
            color: '#64748b',
            border: '1px dashed #334155'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 600 }}>目前暫無此狀態的訂單</div>
            <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>可點擊右上角「模擬 LINE 訂單」或「電話代客建單」新增訂單</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
            {filteredOrders.map((ord) => {
              const isPending = ord.status === 'pending_assign';
              const isAssigned = ord.status === 'assigned';
              const isDelivering = ord.status === 'delivering';
              const isDelivered = ord.status === 'delivered';
              const isCompleted = ord.isSettled || ord.status === 'completed';

              return (
                <div
                  key={ord.orderId}
                  style={{
                    background: '#1e293b',
                    borderRadius: '14px',
                    border: isPending ? '2px solid #ef4444' : isDelivered && !ord.isSettled ? '2px solid #f59e0b' : isCompleted ? '1px solid #10b981' : '1px solid #334155',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: isPending ? '0 4px 20px rgba(239, 68, 68, 0.2)' : '0 4px 6px -1px rgba(0, 0, 0, 0.15)'
                  }}
                >
                  {/* 卡片標題與狀態 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        #{ord.orderId} ｜ {ord.createdAt}
                      </span>
                      <div style={{ fontSize: '19px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                        {ord.customerName}
                      </div>
                    </div>

                    <div>
                      {isPending && (
                        <span style={{ background: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                          ⚡ 待指派
                        </span>
                      )}
                      {isAssigned && (
                        <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                          ⏳ 已指派
                        </span>
                      )}
                      {isDelivering && (
                        <span style={{ background: '#6366f1', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                          🚚 配送中
                        </span>
                      )}
                      {isDelivered && !ord.isSettled && (
                        <span style={{ background: '#f59e0b', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, animation: 'pulse 2s infinite' }}>
                          📦 司機已送達 (待結帳)
                        </span>
                      )}
                      {isCompleted && (
                        <span style={{ background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                          ✅ 主機已結帳完成
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 貨品與金額明細 */}
                  <div style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
                    <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: '4px' }}>⚡ 叫貨項目：</div>
                    {(ord.items || []).map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                        <span>{it.name} × {it.quantity}</span>
                        <span style={{ color: '#f8fafc' }}>${(it.price || 0) * (it.quantity || 1)}</span>
                      </div>
                    ))}
                    <div style={{
                      marginTop: '8px',
                      paddingTop: '8px',
                      borderTop: '1px dashed #334155',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 700,
                      fontSize: '15px',
                      color: '#38bdf8'
                    }}>
                      <span>應收總額</span>
                      <span>${ord.total || 0}</span>
                    </div>
                  </div>

                  {/* 地址、電話與備註 */}
                  <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📞</span>
                      <a href={`tel:${ord.phone}`} style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
                        {ord.phone} (點擊撥打)
                      </a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                      <span>📍</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ord.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#e2e8f0', textDecoration: 'underline' }}
                      >
                        {ord.address} ↗
                      </a>
                    </div>
                    {ord.note && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: '#facc15' }}>
                        <span>📝</span>
                        <span>備註：{ord.note}</span>
                      </div>
                    )}
                    {ord.assignedDriver && (
                      <div style={{ fontSize: '12px', color: '#34d399', marginTop: '2px' }}>
                        🛵 負責司機：<strong>{ord.assignedDriver}</strong> ({ord.assignedAt})
                      </div>
                    )}
                    {ord.isSettled && (
                      <div style={{ fontSize: '12px', color: '#4ade80' }}>
                        ✨ 結帳資訊：由【{ord.settledBy}】於 {ord.settledAt} 完成結算 ({ord.settlementMethod || '現金'})
                      </div>
                    )}
                  </div>

                  {/* 操作功能區 */}
                  <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* 1. 主機派單給司機 (未完成前隨時可改派) */}
                    {!ord.isSettled && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select
                          value={selectedDriverMap[ord.orderId] || ord.assignedDriver || ''}
                          onChange={(e) => setSelectedDriverMap({ ...selectedDriverMap, [ord.orderId]: e.target.value })}
                          style={{
                            flex: 1,
                            background: '#0f172a',
                            color: '#fff',
                            border: '1px solid #475569',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        >
                          <option value="">-- 請選擇指派司機 --</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.name} ({d.vehicle})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignDriver(ord.orderId)}
                          style={{
                            background: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          👉 立即派單
                        </button>
                      </div>
                    )}

                    {/* 2. 主機操作人員結帳 (核心需求：主機操作人員已經結帳時，系統也要顯示完成) */}
                    {!ord.isSettled ? (
                      <button
                        onClick={() => handleSettleCheckout(ord.orderId, ord.total)}
                        style={{
                          background: isDelivered ? '#059669' : '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          padding: '10px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}
                      >
                        <span>💵</span> 主機操作員【結帳完成】(全端同步結案)
                      </button>
                    ) : (
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        padding: '8px',
                        borderRadius: '6px',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}>
                        🎉 此訂單已結案，司機端已同步顯示完成
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 電話代客建單 Modal */}
      {isManualModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            border: '1px solid #334155',
            color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>📞 電話代客建單 (主機快速登打)</h3>
              <button
                onClick={() => setIsManualModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualOrder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>客戶姓名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：林老闆 (快炒店)"
                  value={manualForm.customerName}
                  onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>聯絡電話</label>
                <input
                  type="tel"
                  placeholder="例如：0912-345-678"
                  value={manualForm.phone}
                  onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>配送地址 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：三重區重新路四段 12 號 2 樓"
                  value={manualForm.address}
                  onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>規格</label>
                  <select
                    value={manualForm.spec}
                    onChange={(e) => {
                      const spec = e.target.value;
                      const defaultPrice = spec === '50kg' ? 1950 : spec === '20kg' ? 850 : 720;
                      setManualForm({ ...manualForm, spec, unitPrice: defaultPrice });
                    }}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff' }}
                  >
                    <option value="20kg">20kg 瓦斯</option>
                    <option value="50kg">50kg 營業瓦斯</option>
                    <option value="16kg">16kg 瓦斯</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>數量</label>
                  <input
                    type="number"
                    min="1"
                    value={manualForm.quantity}
                    onChange={(e) => setManualForm({ ...manualForm, quantity: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>單價 ($)</label>
                  <input
                    type="number"
                    value={manualForm.unitPrice}
                    onChange={(e) => setManualForm({ ...manualForm, unitPrice: e.target.value })}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>直接指派司機 (可選)</label>
                <select
                  value={manualForm.assignedDriver}
                  onChange={(e) => setManualForm({ ...manualForm, assignedDriver: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff' }}
                >
                  <option value="">-- 先建單稍後再派 --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.name}>{d.name} ({d.vehicle})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>訂單備註</label>
                <input
                  type="text"
                  placeholder="例如：電梯大樓、舊瓶有一支要退押金"
                  value={manualForm.note}
                  onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '10px', borderRadius: '8px', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  style={{ background: '#334155', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  建立並送出
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 系統監控中心 (含司機後台設定) 彈窗 */}
      <SystemDiagnosticsModal
        isOpen={isDiagOpen}
        onClose={() => setIsDiagOpen(false)}
      />
    </div>
  );
}
