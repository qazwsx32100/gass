import React, { useState } from 'react';
import { sendSystemNotification, requestNotificationPermission, getNotificationPermission } from '../utils/notificationService';

export default function SystemDiagnosticsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('diag');
  const [loadingAction, setLoadingAction] = useState('');
  const [diagLog, setDiagLog] = useState([]);
  const [permission, setPermission] = useState(getNotificationPermission());

  if (!isOpen) return null;

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
    setDiagLog((prev) => [{ id: Date.now() + Math.random(), time, msg, type }, ...prev].slice(0, 30));
  };

  // 1. 執行系統健檢
  const handleSystemCheck = async () => {
    setLoadingAction('diag');
    addLog('正在檢查伺服器與資料庫健康狀態...', 'info');
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        addLog(`✅ 系統狀態正常: ${JSON.stringify(data)}`, 'success');
      } else {
        addLog(`⚠️ 系統回應異常: HTTP ${res.status}`, 'warning');
      }
    } catch (e) {
      addLog(`❌ 健康檢查連線失敗: ${e.message}`, 'error');
    } finally {
      setLoadingAction('');
    }
  };

  // 2. 測試 Google Drive 連線
  const handleTestDrive = async () => {
    setLoadingAction('drive');
    addLog('正在測試 Google Drive 備份連線...', 'info');
    try {
      const res = await fetch('/api/backup-status');
      if (res.ok) {
        const data = await res.json();
        addLog(`✅ Google Drive 狀態: ${data.status || '連線正常'}`, 'success');
      } else {
        addLog(`⚠️ Google Drive 檢查回應: HTTP ${res.status}`, 'warning');
      }
    } catch (e) {
      addLog(`❌ Google Drive 測試失敗: ${e.message}`, 'error');
    } finally {
      setLoadingAction('');
    }
  };

  // 3. 一鍵重試雲端備份
  const handleRetryBackup = async () => {
    setLoadingAction('backup');
    addLog('正在發起雲端全量備份...', 'info');
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_app_diagnostics' })
      });
      if (res.ok) {
        const data = await res.json();
        addLog(`✅ 雲端備份發起成功！ID: ${data.backupId || data.id || 'ok'}`, 'success');
      } else {
        addLog(`❌ 備份請求失敗: HTTP ${res.status}`, 'error');
      }
    } catch (e) {
      addLog(`❌ 發起備份失敗: ${e.message}`, 'error');
    } finally {
      setLoadingAction('');
    }
  };

  // 4. 清除伺服器/本地快取
  const handleClearCache = () => {
    setLoadingAction('cache');
    try {
      sessionStorage.clear();
      addLog('🧹 本地暫存快取已成功清除！', 'success');
    } catch (e) {
      addLog(`❌ 清除失敗: ${e.message}`, 'error');
    } finally {
      setLoadingAction('');
    }
  };

  // 5. 授權與測試系統通知
  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      addLog('🎉 系統通知權限已允許！', 'success');
      await sendSystemNotification({
        title: '🔔 盛隆瓦斯 - 通知已啟用',
        body: '當有 LINE 新訂單或系統告警時，您將第一時間收到跳出通知！'
      });
    } else {
      addLog(`⚠️ 通知權限狀態: ${perm}`, 'warning');
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🖥️</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>系統監控中心</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 司機專用後台跳轉橫幅 */}
        <div style={{
          padding: '12px 20px',
          background: 'rgba(56, 189, 248, 0.08)',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <span style={{ color: '#94a3b8' }}>🛵 盛隆外勤司機與後台監控已全面獨立運作</span>
          <a
            href="https://shenglong-next-phi.vercel.app/driver/admin"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#38bdf8',
              fontWeight: 800,
              textDecoration: 'none'
            }}
          >
            前往司機後台監控中心 ↗
          </a>
        </div>

        {/* Body 內容 */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 通知權限狀態區塊 */}
          <div style={{
            background: '#0f172a',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>手機/桌面推播通知</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                當前狀態：
                {permission === 'granted' && <span style={{ color: '#4ade80', fontWeight: 600 }}>已允許 (即時跳出通知)</span>}
                {permission === 'denied' && <span style={{ color: '#f87171', fontWeight: 600 }}>已封鎖 (請至瀏覽器設定允許)</span>}
                {permission === 'default' && <span style={{ color: '#fbbf24', fontWeight: 600 }}>尚未授權</span>}
                {permission === 'unsupported' && <span style={{ color: '#94a3b8' }}>當前裝置不支援</span>}
              </div>
            </div>
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                onClick={handleRequestPermission}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                啟用通知
              </button>
            )}
          </div>

          {/* 快捷排錯按鈕群 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            <button
              onClick={handleSystemCheck}
              disabled={!!loadingAction}
              style={{
                background: '#334155',
                color: '#fff',
                border: '1px solid #475569',
                padding: '10px',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <span style={{ fontSize: '18px' }}>🩺</span>
              {loadingAction === 'diag' ? '檢查中...' : '系統健檢'}
            </button>

            <button
              onClick={handleTestDrive}
              disabled={!!loadingAction}
              style={{
                background: '#334155',
                color: '#fff',
                border: '1px solid #475569',
                padding: '10px',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <span style={{ fontSize: '18px' }}>📁</span>
              {loadingAction === 'drive' ? '連線中...' : '測試 Drive'}
            </button>

            <button
              onClick={handleRetryBackup}
              disabled={!!loadingAction}
              style={{
                background: '#334155',
                color: '#fff',
                border: '1px solid #475569',
                padding: '10px',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <span style={{ fontSize: '18px' }}>🔄</span>
              {loadingAction === 'backup' ? '備份中...' : '重試備份'}
            </button>

            <button
              onClick={handleClearCache}
              disabled={!!loadingAction}
              style={{
                background: '#334155',
                color: '#fff',
                border: '1px solid #475569',
                padding: '10px',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <span style={{ fontSize: '18px' }}>🧹</span>
              清除快取
            </button>
          </div>

          {/* 紀錄顯示區 */}
          <div style={{
            background: '#090d16',
            borderRadius: '8px',
            padding: '12px',
            height: '160px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            border: '1px solid #1e293b'
          }}>
            {diagLog.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', marginTop: '60px' }}>點選上方按鈕執行測試或健檢...</div>
            ) : (
              diagLog.map((log) => (
                <div key={log.id} style={{
                  marginBottom: '6px',
                  color: log.type === 'error' ? '#f87171' : log.type === 'success' ? '#4ade80' : log.type === 'warning' ? '#fbbf24' : '#cbd5e1'
                }}>
                  <span style={{ color: '#64748b' }}>[{log.time}]</span> {log.msg}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#475569',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
