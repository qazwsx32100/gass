import React, { useState } from 'react';
import { sendSystemNotification, requestNotificationPermission, getNotificationPermission } from '../utils/notificationService';
import SystemDiagnosticsModal from '../components/SystemDiagnosticsModal';

export default function OrdersDispatchView({
  orders = [],
  onUpdateOrderStatus,
  onAddOrder,
  onConvertToIncome,
  _customers = [],
  incomes = [],
  customerCylinderDeposits = [],
  currentUserName = '管理員',
  onShowToast
}) {
  const [filterStatus, setFilterStatus] = useState('all'); // all | pending | in_progress | completed
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState(null);
  const [isConvertingId, setIsConvertingId] = useState(null);
  const [permission, setPermission] = useState(getNotificationPermission());

  // 篩選訂單
  const filteredOrders = orders.filter((ord) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return ord.status === 'pending';
    if (filterStatus === 'in_progress') return ord.status === 'acknowledged' || ord.status === 'delivering';
    if (filterStatus === 'completed') return ord.status === 'completed';
    return true;
  });

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  // 啟用通知權限
  const handleEnableNotification = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      onShowToast?.('success', '🎉 系統推播通知已啟用！');
      sendSystemNotification({
        title: '🔔 盛隆瓦斯 - 通知已啟用',
        body: '當有 LINE 新訂單時，手機與桌面將第一時間彈出通知！'
      });
    } else {
      onShowToast?.('warning', `通知狀態：${perm}`);
    }
  };

  // 模擬收到 LINE 新訂單 (供測試 Telegram App 化效果)
  const handleSimulateNewOrder = () => {
    const sampleNames = ['陳志強 (海產店)', '林惠敏 (早餐店)', '王大明 (民宅)', '張素華 (小吃攤)'];
    const sampleAddresses = [
      '台北市大同區延平北路三段 88 號',
      '新北市三重區重新路四段 12 號',
      '新北市蘆洲區三民路 230 號 2 樓',
      '台北市士林區文林路 101 號'
    ];
    const sampleSpecs = [
      [{ name: '20kg 瓦斯', quantity: 2, price: 850 }],
      [{ name: '50kg 營業用瓦斯', quantity: 1, price: 1950 }],
      [{ name: '16kg 瓦斯', quantity: 1, price: 720 }, { name: '安全調節器', quantity: 1, price: 350 }]
    ];

    const idx = Math.floor(Math.random() * sampleNames.length);
    const chosenItems = sampleSpecs[Math.floor(Math.random() * sampleSpecs.length)];
    const total = chosenItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderId = `LINE_${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const taipeiTime = now.toLocaleString('zh-TW', { hour12: false });

    const newOrder = {
      orderId,
      customerName: sampleNames[idx],
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      address: sampleAddresses[idx],
      items: chosenItems,
      total,
      note: '麻煩幫忙搬上樓，謝謝！',
      createdAt: taipeiTime,
      timestamp: Date.now(),
      status: 'pending',
      acknowledgedBy: null,
      acknowledgedAt: null,
      convertedToIncome: false
    };

    onAddOrder?.(newOrder);

    // 觸發系統跳出通知 (Web Notification)
    sendSystemNotification({
      title: `📦 盛隆收到 LINE 新訂單！$${total}`,
      body: `客戶：${newOrder.customerName}\n地址：${newOrder.address}\n叫貨：${newOrder.items.map(i => `${i.name}×${i.quantity}`).join(', ')}`,
      tag: `order-${orderId}`,
      data: { url: window.location.href, orderId }
    });

    onShowToast?.('success', `📦 收到 LINE 模擬訂單 #${orderId}！`);
  };

  // 接單確認 (對標 Telegram 的 ✅ 接單確認)
  const handleAcknowledge = (order) => {
    const now = new Date().toLocaleString('zh-TW', { hour12: false });
    onUpdateOrderStatus?.(order.orderId, {
      status: 'acknowledged',
      acknowledgedBy: currentUserName,
      acknowledgedAt: now
    });
    onShowToast?.('success', `✅ 已接單！處理人：${currentUserName}`);
  };

  // 開始配送
  const handleStartDelivery = (order) => {
    onUpdateOrderStatus?.(order.orderId, { status: 'delivering' });
    onShowToast?.('info', `🚚 訂單 #${order.orderId} 開始配送中`);
  };

  // 完成送達
  const handleComplete = (order) => {
    onUpdateOrderStatus?.(order.orderId, { status: 'completed' });
    onShowToast?.('success', `🎉 訂單 #${order.orderId} 已完成送達！`);
  };

  // 查看客戶歷史紀錄
  const handleViewCustomerHistory = (order) => {
    const cleanPhone = (order.phone || '').replace(/[^0-9]/g, '');
    const cleanName = (order.customerName || '').replace(/[()（）\s]/g, '');

    const historyIncomes = incomes.filter((item) => {
      const matchName = cleanName && (
        String(item.customerName || '').includes(cleanName) ||
        String(item.counterpartyName || '').includes(cleanName)
      );
      const matchPhone = cleanPhone && (
        String(item.phone || '').includes(cleanPhone) ||
        String(item.remarks || '').includes(cleanPhone)
      );
      return matchName || matchPhone;
    }).slice(0, 10);

    const historyDeposits = customerCylinderDeposits.filter((d) => {
      return (cleanName && String(d.customerName || '').includes(cleanName)) ||
             (cleanPhone && String(d.phone || '').includes(cleanPhone));
    });

    setSelectedHistoryCustomer({
      name: order.customerName,
      phone: order.phone,
      address: order.address,
      historyIncomes,
      historyDeposits
    });
  };

  // 一鍵轉入銷貨記帳 (App 獨家超越 Telegram 的功能)
  const handleConvertToIncome = async (order) => {
    setIsConvertingId(order.orderId);
    try {
      const itemsText = (order.items || []).map(i => `${i.name} × ${i.quantity}`).join(', ');
      const success = await onConvertToIncome?.({
        date: new Date().toISOString().slice(0, 10),
        amount: Number(order.total) || 0,
        accountCode: '4101', // 瓦斯銷貨收入
        accountName: '瓦斯銷貨收入',
        counterpartyName: order.customerName,
        paymentMethod: '現金',
        remarks: `[LINE訂單 #${order.orderId}] ${itemsText} / 地址: ${order.address} / 聯絡: ${order.phone}`,
        orderId: order.orderId
      });

      if (success !== false) {
        onUpdateOrderStatus?.(order.orderId, { convertedToIncome: true, status: 'completed' });
        onShowToast?.('success', `💰 訂單 #${order.orderId} 已自動轉入今日營收記帳！`);
      }
    } catch (e) {
      onShowToast?.('error', `轉入記帳失敗: ${e.message}`);
    } finally {
      setIsConvertingId(null);
    }
  };

  return (
    <div className="orders-dispatch-page" style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 頂部操作列 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '20px',
        background: '#1e293b',
        padding: '16px 20px',
        borderRadius: '12px',
        border: '1px solid #334155'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📦</span>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
              即時訂單調度中心
            </h2>
            {pendingCount > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#fff',
                borderRadius: '9999px',
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 700,
                animation: 'pulse 2s infinite'
              }}>
                {pendingCount} 筆待接單
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            取代並升級 Telegram 機器人群組：手機自動跳出通知、一鍵導航、一鍵撥號、即時接單與轉銷貨記帳。
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* 通知狀態與授權按鈕 */}
          {permission !== 'granted' ? (
            <button
              onClick={handleEnableNotification}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🔔</span> 啟用通知彈窗
            </button>
          ) : (
            <span style={{
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>🟢</span> 系統通知運作中
            </span>
          )}

          {/* 模擬 LINE 訂單測試按鈕 */}
          <button
            onClick={handleSimulateNewOrder}
            style={{
              background: '#059669',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📱</span> 模擬 LINE 新訂單 (測試通知)
          </button>

          {/* 系統健檢排錯按鈕 (原 Telegram /status, /diag) */}
          <button
            onClick={() => setIsDiagOpen(true)}
            style={{
              background: '#475569',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🩺</span> 系統健檢與排錯
          </button>
        </div>
      </div>

      {/* 狀態過濾標籤 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {[
          { key: 'all', label: `全部 (${orders.length})` },
          { key: 'pending', label: `待接單 (${orders.filter(o => o.status === 'pending').length})` },
          { key: 'in_progress', label: `配送/處理中 (${orders.filter(o => o.status === 'acknowledged' || o.status === 'delivering').length})` },
          { key: 'completed', label: `已完成 (${orders.filter(o => o.status === 'completed').length})` }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              background: filterStatus === tab.key ? '#2563eb' : '#1e293b',
              color: filterStatus === tab.key ? '#ffffff' : '#94a3b8'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 訂單卡片列表 */}
      {filteredOrders.length === 0 ? (
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '60px 20px',
          textAlign: 'center',
          color: '#64748b',
          border: '1px dashed #334155'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontSize: '16px', color: '#94a3b8', fontWeight: 500 }}>目前暫無此狀態的叫貨訂單</div>
          <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>點擊上方「模擬 LINE 新訂單」即可立即測試彈出通知與叫貨流程！</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredOrders.map((ord) => {
            const isPending = ord.status === 'pending';
            const isAcknowledged = ord.status === 'acknowledged';
            const isDelivering = ord.status === 'delivering';
            const isCompleted = ord.status === 'completed';

            return (
              <div
                key={ord.orderId}
                style={{
                  background: '#1e293b',
                  borderRadius: '12px',
                  border: isPending ? '2px solid #ef4444' : isDelivering ? '1px solid #3b82f6' : '1px solid #334155',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: isPending ? '0 4px 20px rgba(239, 68, 68, 0.2)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  position: 'relative'
                }}
              >
                {/* 狀態徽章 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      #{ord.orderId}
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                      {ord.customerName}
                    </div>
                  </div>

                  <div>
                    {isPending && (
                      <span style={{ background: '#ef4444', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                        ⚡ 待接單
                      </span>
                    )}
                    {isAcknowledged && (
                      <span style={{ background: '#f59e0b', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                        ⏳ 已接單
                      </span>
                    )}
                    {isDelivering && (
                      <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                        🚚 配送中
                      </span>
                    )}
                    {isCompleted && (
                      <span style={{ background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                        ✅ 已完成
                      </span>
                    )}
                  </div>
                </div>

                {/* 叫貨明細 */}
                <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
                  <div style={{ color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>
                    ⚡ 規格品項：
                  </div>
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
                    fontSize: '14px',
                    color: '#38bdf8'
                  }}>
                    <span>應收總額</span>
                    <span>${ord.total || 0}</span>
                  </div>
                </div>

                {/* 聯絡地址與備註 */}
                <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📞</span>
                    <a
                      href={`tel:${ord.phone}`}
                      style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {ord.phone} (點擊通話)
                    </a>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span>📍</span>
                    <span style={{ color: '#e2e8f0' }}>{ord.address}</span>
                  </div>
                  {ord.note && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: '#facc15' }}>
                      <span>📝</span>
                      <span>備註：{ord.note}</span>
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    ⏰ 下單時間：{ord.createdAt}
                  </div>
                  {ord.acknowledgedBy && (
                    <div style={{ fontSize: '11px', color: '#34d399' }}>
                      👤 處理人：{ord.acknowledgedBy} ({ord.acknowledgedAt})
                    </div>
                  )}
                </div>

                {/* 快捷操作按鈕列 (Telegram 機器人同款 + 超越) */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
                  {/* 第一排：地圖導航 + 查看客戶歷史 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ord.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: '#334155',
                        color: '#38bdf8',
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid #475569'
                      }}
                    >
                      🗺️ 地圖導航
                    </a>

                    <button
                      onClick={() => handleViewCustomerHistory(ord)}
                      style={{
                        background: '#334155',
                        color: '#f8fafc',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #475569',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      📜 歷史紀錄
                    </button>
                  </div>

                  {/* 第二排：接單 / 配送 / 完成 */}
                  {isPending && (
                    <button
                      onClick={() => handleAcknowledge(ord)}
                      style={{
                        background: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      ✅ 一鍵接單確認
                    </button>
                  )}

                  {isAcknowledged && (
                    <button
                      onClick={() => handleStartDelivery(ord)}
                      style={{
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      🚚 出發配送
                    </button>
                  )}

                  {isDelivering && (
                    <button
                      onClick={() => handleComplete(ord)}
                      style={{
                        background: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ✔️ 送達完成
                    </button>
                  )}

                  {/* 第三排：一鍵轉入銷貨記帳 (非 pending 時可用) */}
                  {!isPending && !ord.convertedToIncome && (
                    <button
                      onClick={() => handleConvertToIncome(ord)}
                      disabled={isConvertingId === ord.orderId}
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isConvertingId === ord.orderId ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isConvertingId === ord.orderId ? '轉記帳中...' : '➕ 一鍵轉入營收記帳'}
                    </button>
                  )}

                  {ord.convertedToIncome && (
                    <div style={{
                      textAlign: 'center',
                      fontSize: '11px',
                      color: '#4ade80',
                      padding: '4px',
                      background: 'rgba(34, 197, 94, 0.1)',
                      borderRadius: '4px'
                    }}>
                      ✨ 已自動入帳至銷貨營收
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 客戶歷史抽屜/彈窗 (對標 Telegram 歷史紀錄查詢) */}
      {selectedHistoryCustomer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #334155',
            color: '#f8fafc'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                  📜 客戶歷史明細：{selectedHistoryCustomer.name}
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  電話：{selectedHistoryCustomer.phone} ｜ 地址：{selectedHistoryCustomer.address}
                </div>
              </div>
              <button
                onClick={() => setSelectedHistoryCustomer(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
                  💰 近期交易與銷貨紀錄
                </div>
                {selectedHistoryCustomer.historyIncomes.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>尚無歷史交易紀錄</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedHistoryCustomer.historyIncomes.map((inc, i) => (
                      <div key={i} style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>{inc.date}</span>
                          <span style={{ color: '#4ade80' }}>${inc.amount}</span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                          {inc.remarks || inc.accountName || '銷貨項目'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f59e0b', marginBottom: '8px' }}>
                  🏷️ 鋼瓶押金與流通記錄
                </div>
                {selectedHistoryCustomer.historyDeposits.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>尚無押瓶紀錄</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedHistoryCustomer.historyDeposits.map((dep, i) => (
                      <div key={i} style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>鋼瓶編號: {dep.cylinderNumber || '-'}</span>
                          <span style={{ color: '#fbbf24' }}>押金 ${dep.depositAmount || 0}</span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                          規格: {dep.spec || '20kg'} / 狀態: {dep.status || '流通中'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedHistoryCustomer(null)}
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 系統健檢排錯 Modal */}
      <SystemDiagnosticsModal
        isOpen={isDiagOpen}
        onClose={() => setIsDiagOpen(false)}
      />
    </div>
  );
}
