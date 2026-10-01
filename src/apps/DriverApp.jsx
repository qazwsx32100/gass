import React, { useState, useEffect } from 'react';
import {
  getCentralOrders,
  getDriversList,
  updateOrderDeliveryStatus,
  subscribeOrderEvents
} from '../utils/orderCentral';
import { sendSystemNotification, requestNotificationPermission, getNotificationPermission, playNotificationChime } from '../utils/notificationService';

const DRIVER_CODE_MAP = {
  'D01': '游柏林',
  'D02': '小龍',
  'D03': '阿強 (陳志強)',
  'D04': '小林 (林志豪)',
  'D05': '阿成 (王大成)',
  'D06': '阿宏 (黃建宏)'
};

export default function DriverApp() {
  const [currentDriver, setCurrentDriver] = useState(() => {
    // 優先讀取 URL 參數 ?code=D01 或 ?name=游柏林
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const name = params.get('name');
      if (code && DRIVER_CODE_MAP[code.toUpperCase()]) {
        const assigned = DRIVER_CODE_MAP[code.toUpperCase()];
        localStorage.setItem('sl_current_driver', assigned);
        return assigned;
      }
      if (name) {
        const decoded = decodeURIComponent(name);
        localStorage.setItem('sl_current_driver', decoded);
        return decoded;
      }
    }
    return localStorage.getItem('sl_current_driver') || '游柏林';
  });

  const [orders, setOrders] = useState(() => getCentralOrders());
  const [filterTab, setFilterTab] = useState('active'); // active | completed
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshOrders = () => {
    setOrders(getCentralOrders());
  };

  // 監聽即時派單與主機結帳事件 (純視覺靜音更新)
  useEffect(() => {
    const unsubscribe = subscribeOrderEvents((event) => {
      refreshOrders();

      if (event.type === 'ORDER_ASSIGNED') {
        const order = event.payload;
        if (order && order.assignedDriver === currentDriver) {
          showToast(`📦 收到新任務！客戶：${order.customerName}`, 'warning');
        }
      }

      if (event.type === 'ORDER_SETTLED') {
        const order = event.payload;
        if (order && order.assignedDriver === currentDriver) {
          showToast(`✨ 訂單 #${order.orderId} 主機已完成結帳！`, 'info');
        }
      }
    });

    return () => unsubscribe();
  }, [currentDriver]);

  // 司機操作：出發配送
  const handleStartDelivering = (orderId) => {
    updateOrderDeliveryStatus(orderId, 'delivering');
    refreshOrders();
    showToast('🚚 開始配送！路上小心安全。', 'info');
  };

  // 司機操作：回報已送達
  const handleReportDelivered = (orderId) => {
    updateOrderDeliveryStatus(orderId, 'delivered');
    refreshOrders();
    showToast('✔️ 已送達！等待主機操作員確認結帳。', 'success');
  };

  // 只篩選「指派給當前司機」的訂單
  const driverOrders = orders.filter((o) => o.assignedDriver === currentDriver);

  // 進行中訂單 (已指派、配送中、已送達但主機尚未結帳)
  const activeOrders = driverOrders.filter((o) => !o.isSettled);

  // 今日已結案完成訂單
  const completedOrders = driverOrders.filter((o) => o.isSettled);

  // 顯示的列表
  const displayOrders = filterTab === 'active' ? activeOrders : completedOrders;

  // 計算今日累計送貨數與代收款
  const todayDeliveredBottles = completedOrders.reduce((sum, o) => {
    const qty = (o.items || []).reduce((q, it) => q + (Number(it.quantity) || 1), 0);
    return sum + qty;
  }, 0);
  const todayTotalCash = completedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const todayUnpaidAmount = activeOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0f1d',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: '80px'
    }}>
      {/* Toast */}
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
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          fontWeight: 700,
          fontSize: '15px'
        }}>
          {toast.msg}
        </div>
      )}

      {/* 司機端專屬頂部列 */}
      <header style={{
        background: '#111827',
        borderBottom: '1px solid #1f2937',
        padding: '14px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
            }}>
              🛵
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>盛隆派送</div>
              <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>🟢 配送員工作台</div>
            </div>
          </div>

          {/* 司機身份純展示徽章 (防呆免登入，由管理者連結指派) */}
          <div style={{
            background: '#1f2937',
            border: '1px solid #374151',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            color: '#34d399',
            fontWeight: 800
          }}>
            👤 {currentDriver}
          </div>
        </div>
      </header>

      {/* 主畫面內容 */}
      <main style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>
        {/* 累積未繳金額與待送狀態卡 (TASKAMIGO 薄荷質感) */}
        <div style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
          borderRadius: '14px',
          border: '1px solid #10b981',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(6, 95, 70, 0.3)'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: '#a7f3d0', fontWeight: 600 }}>已指派未完成累積待收金額</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>
              NT$ {todayUnpaidAmount.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#a7f3d0' }}>待配送任務</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399' }}>
              {activeOrders.length} <span style={{ fontSize: '13px', fontWeight: 500, color: '#a7f3d0' }}>單</span>
            </div>
          </div>
        </div>

        {/* 任務分類切換：只留 待處理(數量) 和 已完成(數量) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setFilterTab('active')}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 800,
              background: filterTab === 'active' ? '#059669' : '#1f2937',
              color: filterTab === 'active' ? '#ffffff' : '#9ca3af',
              position: 'relative'
            }}
          >
            待處理 ({activeOrders.length})
          </button>

          <button
            onClick={() => setFilterTab('completed')}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 800,
              background: filterTab === 'completed' ? '#059669' : '#1f2937',
              color: filterTab === 'completed' ? '#ffffff' : '#9ca3af'
            }}
          >
            已完成 ({completedOrders.length})
          </button>
        </div>

        {/* 訂單卡片清單 */}
        {displayOrders.length === 0 ? (
          <div style={{
            background: '#111827',
            borderRadius: '16px',
            padding: '50px 20px',
            textAlign: 'center',
            color: '#6b7280',
            border: '2px dashed #374151'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>
              {filterTab === 'active' ? '☕' : '📦'}
            </div>
            <div style={{ fontSize: '18px', color: '#9ca3af', fontWeight: 700 }}>
              {filterTab === 'active' ? '目前沒有指派給您的任務' : '今日尚無已結案訂單'}
            </div>
            <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>
              {filterTab === 'active' ? '當主機派單給您時，手機將會自動響鈴通知！' : '送達並由主機完成結帳後將顯示於此。'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {displayOrders.map((ord) => {
              const isAssigned = ord.status === 'assigned';
              const isDelivering = ord.status === 'delivering';
              const isDelivered = ord.status === 'delivered';
              const isSettled = ord.isSettled;

              return (
                <div
                  key={ord.orderId}
                  style={{
                    background: '#1f2937',
                    borderRadius: '16px',
                    border: isSettled ? '2px solid #10b981' : isDelivering ? '2px solid #3b82f6' : isDelivered ? '2px solid #f59e0b' : '2px solid #10b981',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  {/* 頂部狀態列 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>
                      訂單 #{ord.orderId}
                    </div>

                    <div>
                      {isSettled ? (
                        <span style={{ background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 800 }}>
                          🎉 主機已結帳完成
                        </span>
                      ) : isDelivered ? (
                        <span style={{ background: '#f59e0b', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 800 }}>
                          ⏳ 等待主機結帳中
                        </span>
                      ) : isDelivering ? (
                        <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 800 }}>
                          🚚 配送中
                        </span>
                      ) : (
                        <span style={{ background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 800 }}>
                          ⚡ 新任務待出發
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 客戶姓名與應收金額 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: '#f9fafb' }}>
                        {ord.customerName}
                      </div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                        下單時間：{ord.createdAt}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>應收代收現金</div>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8' }}>
                        ${ord.total}
                      </div>
                    </div>
                  </div>

                  {/* 挑桶提醒：只留 驚嘆號 [司機挑桶提醒] */}
                  {(ord.needSelectBarrel || ord.selectBarrel || (ord.note && ord.note.includes('挑桶'))) && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#f87171',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      ⚠️ [司機挑桶提醒]
                    </div>
                  )}

                  {/* 瓦斯規格標籤 (超大清晰字體) */}
                  <div style={{
                    background: '#111827',
                    padding: '12px',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 700 }}>💥 配送瓦斯規格：</div>
                    {(ord.items || []).map((it, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '17px',
                        fontWeight: 800,
                        color: '#facc15'
                      }}>
                        <span>• {it.name}</span>
                        <span>× {it.quantity} 桶</span>
                      </div>
                    ))}
                  </div>

                  {/* 地址與備註 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '15px', color: '#e5e7eb', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>📍</span>
                      <span style={{ fontWeight: 600 }}>{ord.address}</span>
                    </div>

                    {ord.note && (
                      <div style={{
                        background: 'rgba(250, 204, 21, 0.1)',
                        border: '1px solid rgba(250, 204, 21, 0.3)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#fde047',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px'
                      }}>
                        <span>📝</span>
                        <span>備註：{ord.note}</span>
                      </div>
                    )}

                    {/* 主機結帳狀態同步顯示 (核心需求) */}
                    {isSettled && (
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#34d399',
                        fontWeight: 700
                      }}>
                        ✨ 主機操作人員已於 {ord.settledAt} 完成結帳 ({ord.settlementMethod || '現金'})！本單已結案。
                      </div>
                    )}
                  </div>

                  {/* 兩大超大按鈕：一鍵撥號 + 一鍵 Google Maps 導航 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <a
                      href={`tel:${ord.phone}`}
                      style={{
                        background: '#2563eb',
                        color: '#ffffff',
                        textAlign: 'center',
                        padding: '14px 10px',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: 800,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
                      }}
                    >
                      <span>📞</span> 撥打電話
                    </a>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ord.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: '#0284c7',
                        color: '#ffffff',
                        textAlign: 'center',
                        padding: '14px 10px',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: 800,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(2,132,199,0.3)'
                      }}
                    >
                      <span>🗺️</span> 地圖導航
                    </a>
                  </div>

                  {/* 司機操作工作流按鈕 */}
                  {!isSettled && (
                    <div style={{ marginTop: '4px' }}>
                      {isAssigned && (
                        <button
                          onClick={() => handleStartDelivering(ord.orderId)}
                          style={{
                            width: '100%',
                            background: '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            padding: '16px',
                            borderRadius: '12px',
                            fontSize: '18px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(16,185,129,0.4)'
                          }}
                        >
                          <span>🚚</span> 我要出發配送！
                        </button>
                      )}

                      {isDelivering && (
                        <button
                          onClick={() => handleReportDelivered(ord.orderId)}
                          style={{
                            width: '100%',
                            background: '#f59e0b',
                            color: '#ffffff',
                            border: 'none',
                            padding: '16px',
                            borderRadius: '12px',
                            fontSize: '18px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 14px rgba(245,158,11,0.4)'
                          }}
                        >
                          <span>✔️</span> 瓦斯已送達！回報主機
                        </button>
                      )}

                      {isDelivered && (
                        <div style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '12px',
                          borderRadius: '10px',
                          textAlign: 'center',
                          color: '#f59e0b',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          ⏳ 已回報送達，請將現金交回店內由主機人員結帳
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 底部今日戰績列 */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#111827',
        borderTop: '1px solid #1f2937',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        fontSize: '14px',
        fontWeight: 700
      }}>
        <div style={{ color: '#9ca3af' }}>
          司機：<span style={{ color: '#ffffff' }}>{currentDriver}</span>
        </div>
        <div style={{ color: '#10b981' }}>
          今日已送達：<strong>{todayDeliveredBottles} 桶</strong>
        </div>
        <div style={{ color: '#38bdf8' }}>
          代收總額：<strong>${todayTotalCash.toLocaleString()}</strong>
        </div>
      </footer>
    </div>
  );
}
