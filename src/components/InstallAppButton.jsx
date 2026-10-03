import React, { useState, useEffect } from 'react';

export default function InstallAppButton({
  buttonText = '📲 安裝 App',
  appName = '盛隆雲端財報',
  profileHref = '/profiles/finance.mobileconfig',
  style = {}
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));

      const ua = window.navigator.userAgent.toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(ua));

      const handleBeforeInstall = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }
  }, []);

  const [feedback, setFeedback] = useState('');

  const triggerNativePrompt = async () => {
    if (deferredPrompt) {
      try {
        setFeedback('⏳ 正在喚醒安裝視窗，請在彈窗中點擊「安裝」...');
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setFeedback('✅ 已成功接受安裝至桌面！');
          setDeferredPrompt(null);
        } else {
          setFeedback('ℹ️ 安裝提示已關閉。若需安裝可隨時再點此按鈕。');
        }
      } catch {
        setFeedback('💡 提示：若瀏覽器未跳出彈窗，請點選網址列右側的【安裝圖示 ⊕】或【選單 ➔ 加到主畫面】。');
      }
    } else {
      setFeedback('💡 提示：若瀏覽器未跳出彈窗，請點選網址列右側的【安裝圖示 ⊕】或【選單 ➔ 加到主畫面】即可！');
    }
  };

  const copyUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFeedback('');
          setShowModal(true);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '8px',
          backgroundColor: isStandalone ? 'rgba(34, 197, 94, 0.15)' : '#7c3aed',
          color: isStandalone ? '#16a34a' : '#ffffff',
          border: isStandalone ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(139, 92, 246, 0.5)',
          fontSize: '12px',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: isStandalone ? 'none' : '0 2px 8px rgba(124, 58, 237, 0.35)',
          whiteSpace: 'nowrap',
          ...style,
        }}
        title={`將「${appName}」安裝至手機或電腦桌面`}
      >
        <span>📲</span>
        <span>{isStandalone ? '已安裝 App' : buttonText}</span>
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px 20px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
              color: '#f8fafc',
              position: 'relative',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題與關閉按鈕 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid #334155',
                paddingBottom: '12px',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px' }}>
                📲 安裝「{appName}」獨立桌面 App
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* 方案 2 與 方案 3 快速按鈕 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {/* 方案 2: Android / Chrome 原生一鍵彈窗 */}
              <button
                type="button"
                onClick={triggerNativePrompt}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '13px 16px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  borderRadius: '10px',
                  fontWeight: 900,
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
                }}
              >
                <span>🤖</span>
                <span>【方案 2】Android / 電腦 點此一鍵安裝</span>
              </button>

              {feedback && (
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '10px 14px',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    borderRadius: '8px',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    lineHeight: '1.5',
                  }}
                >
                  {feedback}
                </div>
              )}

              {/* 方案 3: iPhone 一鍵下載描述檔 */}
              {profileHref && (
                <a
                  href={profileHref}
                  download
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '13px 16px',
                    backgroundColor: '#7c3aed',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontWeight: 900,
                    fontSize: '14px',
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.35)',
                  }}
                >
                  <span>🍎</span>
                  <span>【方案 3】iPhone 點此一鍵安裝檔 (.mobileconfig)</span>
                </a>
              )}
            </div>

            {/* 說明指引 */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#cbd5e1',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '6px' }}>
                💡 免繁瑣手動操作說明：
              </div>
              {isIOS ? (
                <div>
                  <strong>iPhone 用戶：</strong>點擊上方紫色【方案 3】下載描述檔 ➔ 手機彈窗點「允許」 ➔ 打開 iPhone「設定」點最上方「已下載的描述檔」 ➔ 點「安裝」即刻出現在桌面！
                </div>
              ) : (
                <div>
                  <strong>Android / 電腦用戶：</strong>點擊上方綠色【方案 2】按鈕 ➔ 手機將直接彈出系統安裝確認 ➔ 點「安裝」即刻出現在手機桌面！
                </div>
              )}
            </div>

            {/* 底部輔助按鈕 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={copyUrl}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  backgroundColor: '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied ? '✅ 已複製網址！' : '📋 複製此系統網址'}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '9px 16px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
