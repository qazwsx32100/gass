import React, { useState, useEffect } from 'react';
import App from './App.jsx';
import BossApp from './apps/BossApp.jsx';
import DriverApp from './apps/DriverApp.jsx';

export default function AppRouter() {
  const [currentRoute, setCurrentRoute] = useState(() => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path.includes('/boss') || hash.includes('/boss') || search.includes('app=boss')) {
      return 'boss';
    }
    if (path.includes('/driver') || hash.includes('/driver') || search.includes('app=driver')) {
      return 'driver';
    }
    return 'main';
  });

  useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();

      if (path.includes('/boss') || hash.includes('/boss') || search.includes('app=boss')) {
        setCurrentRoute('boss');
      } else if (path.includes('/driver') || hash.includes('/driver') || search.includes('app=driver')) {
        setCurrentRoute('driver');
      } else {
        setCurrentRoute('main');
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  // 動態更新 PWA manifest 與網頁標題
  useEffect(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (currentRoute === 'boss') {
      document.title = '盛隆調度管理 (Boss)';
      if (manifestLink) manifestLink.href = '/manifest-boss.json';
    } else if (currentRoute === 'driver') {
      document.title = '盛隆派送 (Driver)';
      if (manifestLink) manifestLink.href = '/manifest-driver.json';
    } else {
      document.title = '盛隆瓦斯 - 創業三巨頭管理系統';
      if (manifestLink) manifestLink.href = '/manifest.json';
    }
  }, [currentRoute]);

  if (currentRoute === 'boss') {
    return <BossApp />;
  }

  if (currentRoute === 'driver') {
    return <DriverApp />;
  }

  // 預設主系統 (帶有頂部雙 App 快捷入口)
  return (
    <>
      <div style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🚀</span>
          <span>獨立 App 快速入口：</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="/boss"
            style={{
              background: '#2563eb',
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            👑 開啟「盛隆調度管理 (Boss)」
          </a>
          <a
            href="/driver"
            style={{
              background: '#059669',
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🛵 開啟「盛隆派送 (Driver)」
          </a>
        </div>
      </div>
      <App />
    </>
  );
}
