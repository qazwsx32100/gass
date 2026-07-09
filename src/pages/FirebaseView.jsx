import React, { useState, useEffect } from 'react';
import { getFirebaseConfig, saveFirebaseConfig, initFirebase, syncLocalToCloud, disconnectFirebase } from '../db/firebaseService';

export default function FirebaseView({ showToast }) {
  const [config, setConfig] = useState({
    apiKey: '',
    authDomain: '',
    projectId: '',
    databaseURL: '',
    appId: '',
    viewerPin: '888888' // Default share PIN for other shareholders
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    const savedConfig = getFirebaseConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      setIsConnected(true);
    }
  }, []);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!config.projectId || !config.apiKey) {
      showToast('❌ 請輸入 Project ID 與 API Key！', 'error');
      return;
    }
    
    saveFirebaseConfig(config);
    const success = initFirebase((updatedBy) => {
      showToast(`☁️ 偵測到雲端資料更新（來自：${updatedBy}），已即時同步畫面。`, 'info');
    });

    if (success) {
      setIsConnected(true);
      setIsSimulated(false);
      showToast('⚡ Firebase 雲端資料庫連線成功！正在同步資料...', 'success');
      
      const synced = await syncLocalToCloud('主管理員');
      if (synced) {
        showToast('✅ 本機資料已同步至 Firebase 雲端！', 'success');
      } else {
        showToast('⚠️ 雲端已連線，但同步失敗，請確認 Firebase Rules 允許讀寫！', 'warning');
      }
    } else {
      saveFirebaseConfig(null);
      showToast('❌ Firebase 初始化失敗，請確認 Project ID 與 API Key！', 'error');
    }
  };

  const handleDisconnect = () => {
    disconnectFirebase();
    setIsConnected(false);
    setIsSimulated(false);
    showToast('🔌 已關閉雲端同步，系統回到 LocalStorage 獨立運行模式。', 'info');
  };

  const handleSimulate = () => {
    setIsSimulated(true);
    setIsConnected(true);
    showToast('✨ 成功模擬雲端連線！股東專屬分享連結已啟用。', 'success');
  };

  const shareUrl = `${window.location.origin}/?share=true&project=${config.projectId || ''}&apiKey=${config.apiKey || ''}&role=viewer`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    showToast('📋 股東唯讀分享連結已複製！發送給股東即可使用。', 'success');
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🌐 Firebase 雲端同步與股東分享設定</span>
        <span className={`badge ${isConnected ? 'approved' : 'draft'}`}>
          {isConnected ? (isSimulated ? '模擬雲端同步中' : '實體雲端連線中') : 'LocalStorage 本地記帳模式'}
        </span>
      </div>

      <div className="card-body">
        <div className="grid-2col">
          {/* Left Side: Setup Form */}
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--accent-green)' }}>
              1. 串接您的 Firebase 雲端資料庫
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              配置 Firebase 可以將您的資料安全地存放於雲端，實現多裝置即時同步，並能安全分享給其他股東（防止資料誤刪）。
            </p>

            <form onSubmit={handleConnect}>
              <div className="form-group">
                <label className="form-label">Firebase Project ID</label>
                <input type="text" required disabled={isConnected} placeholder="如：gass-erp-project" className="form-control" value={config.projectId} onChange={e => setConfig({ ...config, projectId: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <input type="password" disabled={isConnected} placeholder={isConnected ? '••••••••••••••••••••••••' : 'AIzaSy...'} className="form-control" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Auth Domain (選填)</label>
                  <input type="text" disabled={isConnected} placeholder="project.firebaseapp.com" className="form-control" value={config.authDomain} onChange={e => setConfig({ ...config, authDomain: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Database URL (選填)</label>
                  <input type="text" disabled={isConnected} placeholder="https://project.firebaseio.com" className="form-control" value={config.databaseURL} onChange={e => setConfig({ ...config, databaseURL: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">App ID</label>
                  <input type="text" disabled={isConnected} placeholder="1:1234:web:abcd" className="form-control" value={config.appId} onChange={e => setConfig({ ...config, appId: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">股東登入密碼/PIN 碼</label>
                  <input type="text" disabled={isConnected} placeholder="如：888888" className="form-control" value={config.viewerPin} onChange={e => setConfig({ ...config, viewerPin: e.target.value })} />
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                {isConnected ? (
                  <button type="button" className="btn btn-danger" onClick={handleDisconnect}>
                    🔌 中斷雲端連線，回到單機記帳
                  </button>
                ) : (
                  <>
                    <button type="submit" className="btn btn-primary">
                      🔗 儲存並啟用雲端同步
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleSimulate}>
                      🧪 一鍵模擬雲端同步效果
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>

          {/* Right Side: Shared link */}
          <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '32px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--accent-gold)' }}>
              2. 股東專屬分享連結 (Shareholder Portal)
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              您可以將下方連結發送給合夥股東。當他們打開連結並輸入您設定的 **「PIN 碼 ({config.viewerPin})」**，即可進入系統看到 **「僅限檢視」** 的損益表、資產負債表及分紅報表。
            </p>

            {isConnected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="alert-box success" style={{ margin: 0 }}>
                  🎉 雲端分享門戶已準備就緒！股東可以使用此連結即時看帳。
                </div>
                
                <div className="form-group">
                  <label className="form-label">股東唯讀登入網址：</label>
                  <input type="text" readOnly className="form-control" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-gold)' }} value={shareUrl} />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-primary" onClick={handleCopyLink}>
                    📋 複製分享連結
                  </button>
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                    👀 模擬股東視角測試
                  </a>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />
                
                <div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '6px' }}>股東登入引導：</h4>
                  <ol style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>複製上方的分享連結傳送至股東 LINE 群。</li>
                    <li>股東點擊連結進入網頁。</li>
                    <li>系統提示輸入 PIN 碼，股東輸入 <strong>{config.viewerPin}</strong> 即可登入。</li>
                    <li>股東僅能使用報表頁與營運總覽，無法修改/刪除任何記帳資料。</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="alert-box warning" style={{ margin: 0 }}>
                ⚠️ 請先完成左側的 Firebase 設定，或點擊「一鍵模擬雲端同步效果」按鈕，以啟用股東專屬分享連結功能。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
