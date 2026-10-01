import React, { useState, useEffect } from 'react';
import { getDriversList, saveDriversList } from '../utils/orderCentral';

export default function DriverManagementPanel({ onShowToast }) {
  const [drivers, setDrivers] = useState(() => getDriversList());
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverVehicle, setNewDriverVehicle] = useState('三輪機車');
  const [copiedCode, setCopiedCode] = useState(null);

  // 獨立司機 App 網域 (預設使用獨立安全網域或當前站點司機端)
  const DRIVER_APP_BASE_URL = typeof window !== 'undefined'
    ? `${window.location.origin}/driver`
    : 'https://erp-weld-three-96.vercel.app/driver';

  const STANDALONE_APP_BASE_URL = 'https://shenglong-driver.vercel.app';

  // 重新整理
  const reloadDrivers = () => {
    setDrivers(getDriversList());
  };

  // 新增司機
  const handleAddDriver = (e) => {
    e.preventDefault();
    const trimmedName = newDriverName.trim();
    if (!trimmedName) {
      onShowToast?.('warning', '請輸入司機姓名！');
      return;
    }

    const nextIndex = drivers.length + 1;
    const nextCode = `D${String(nextIndex).padStart(2, '0')}`;
    const newEntry = {
      id: `drv_${Date.now()}`,
      code: nextCode,
      name: trimmedName,
      phone: newDriverPhone.trim() || '未填寫',
      vehicle: newDriverVehicle.trim() || '機車',
      isActive: true,
      createdAt: new Date().toLocaleDateString('zh-TW')
    };

    const updated = [...drivers, newEntry];
    saveDriversList(updated);
    setDrivers(updated);
    setNewDriverName('');
    setNewDriverPhone('');
    onShowToast?.('success', `🎉 成功新增司機：${trimmedName} (代碼：${nextCode})！`);
  };

  // 複製專屬 App 網址
  const handleCopyDriverUrl = (driver, useStandalone = true) => {
    // 依司機代碼或姓名組成安全網址
    const baseUrl = useStandalone ? STANDALONE_APP_BASE_URL : DRIVER_APP_BASE_URL;
    const url = `${baseUrl}/?code=${driver.code || 'D01'}&name=${encodeURIComponent(driver.name)}`;

    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(driver.id);
      onShowToast?.('success', `📋 已複製 ${driver.name} 的專屬免登入 App 網址！`);
      setTimeout(() => setCopiedCode(null), 3000);
    }).catch(() => {
      prompt('請手動複製司機專屬 App 網址：', url);
    });
  };

  // 切換啟用 / 停用
  const handleToggleActive = (id) => {
    const updated = drivers.map((d) => {
      if (d.id === id) {
        const nextStatus = d.isActive !== false ? false : true;
        return { ...d, isActive: nextStatus };
      }
      return d;
    });
    saveDriversList(updated);
    setDrivers(updated);
    onShowToast?.('info', '已更新司機執勤狀態');
  };

  // 刪除司機
  const handleDeleteDriver = (id, name) => {
    if (!window.confirm(`確定要移除司機「${name}」嗎？`)) return;
    const updated = drivers.filter((d) => d.id !== id);
    saveDriversList(updated);
    setDrivers(updated);
    onShowToast?.('warning', `已移除司機：${name}`);
  };

  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '16px',
      border: '1px solid #1e293b',
      padding: '24px',
      color: '#f8fafc'
    }}>
      {/* 標題與說明 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🛵</span>
            <span>外送司機管理中心 (外送員後台設定)</span>
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            管理送貨司機名單、配置專屬代碼，並一鍵產出免登入 App 專屬連結發送至司機 LINE。
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
          執勤中：{drivers.filter(d => d.isActive !== false).length} 位
        </div>
      </div>

      {/* 新增司機表單 */}
      <form onSubmit={handleAddDriver} style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr)) 120px',
        gap: '12px',
        alignItems: 'end'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
            司機姓名 *
          </label>
          <input
            type="text"
            placeholder="例：阿龍 (林志龍)"
            value={newDriverName}
            onChange={(e) => setNewDriverName(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '10px 12px',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
            聯絡電話
          </label>
          <input
            type="text"
            placeholder="例：0912-345-678"
            value={newDriverPhone}
            onChange={(e) => setNewDriverPhone(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '10px 12px',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px', fontWeight: 700 }}>
            配送載具 / 車號
          </label>
          <select
            value={newDriverVehicle}
            onChange={(e) => setNewDriverVehicle(e.target.value)}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              padding: '10px 12px',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              outline: 'none'
            }}
          >
            <option value="三輪機車-A">三輪機車-A</option>
            <option value="三輪機車-B">三輪機車-B</option>
            <option value="小貨車-01">小貨車-01</option>
            <option value="小貨車-02">小貨車-02</option>
            <option value="自備機車">自備機車</option>
          </select>
        </div>

        <button
          type="submit"
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '11px',
            borderRadius: '8px',
            fontWeight: 800,
            fontSize: '14px',
            cursor: 'pointer',
            height: '42px'
          }}
        >
          ➕ 新增司機
        </button>
      </form>

      {/* 司機名單卡片 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {drivers.map((drv, idx) => {
          const code = drv.code || `D${String(idx + 1).padStart(2, '0')}`;
          const isCopied = copiedCode === drv.id;
          const isActive = drv.isActive !== false;

          return (
            <div
              key={drv.id}
              style={{
                background: '#1e293b',
                borderRadius: '12px',
                border: '1px solid #334155',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                opacity: isActive ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: isActive ? '#059669' : '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 900
                }}>
                  {code}
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{drv.name}</span>
                    {!isActive && (
                      <span style={{ fontSize: '11px', background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
                        已停用
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '12px' }}>
                    <span>📞 {drv.phone || '未登記電話'}</span>
                    <span>🛵 {drv.vehicle || '機車'}</span>
                  </div>
                </div>
              </div>

              {/* 操作按鈕群 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* 複製獨立 App 網址 */}
                <button
                  onClick={() => handleCopyDriverUrl({ ...drv, code })}
                  style={{
                    background: isCopied ? '#059669' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isCopied ? '✅ 已複製專屬連結！' : '📋 複製專屬 App 網址'}
                </button>

                {/* 啟用/停用 */}
                <button
                  onClick={() => handleToggleActive(drv.id)}
                  style={{
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {isActive ? '設為休假/停用' : '恢復執勤'}
                </button>

                {/* 刪除 */}
                <button
                  onClick={() => handleDeleteDriver(drv.id, drv.name)}
                  style={{
                    background: 'transparent',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
