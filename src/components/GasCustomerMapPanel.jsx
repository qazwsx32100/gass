import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getTaiwanDateString } from '../utils/taiwanDate.js';
import { MapPin, Search, Filter, Compass, Phone, Calendar, Flame, Layers, ExternalLink, RefreshCw, X, Download } from 'lucide-react';
import { normalizeCustomerMapData, escapeHtml, STATUS_TO_COLOR } from '../utils/customerMapData.js';

export const CUSTOMER_MAP_STATS = {
  total: 3934,
  blue: 1078,
  green: 158,
  pink: 39,
  red: 157,
  gray: 2502
};

export default function GasCustomerMapPanel() {
  const [customersData, setCustomersData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let active = true;
    import('../data/customerMapData.json').then(m => {
      if (!active) return;
      const raw = m.default || m;
      setCustomersData(normalizeCustomerMapData(raw));
      setLoadingData(false);
    }).catch(err => {
      console.error('Failed to load customer map data:', err);
      if (active) setLoadingData(false);
    });
    return () => { active = false; };
  }, []);
  const [selectedColors, setSelectedColors] = useState({
    blue: true,
    green: true,
    pink: true,
    red: true,
    gray: false // 灰色數量多（2502戶），預設關閉以提升地圖順暢度，可一鍵開啟
  });
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // 行政區列表
  const availableDistricts = useMemo(() => {
    const dists = Array.from(new Set(customersData.map(d => d.dist)));
    return dists.sort((a, b) => {
      if (a === '三重區') return -1;
      if (b === '三重區') return 1;
      return a.localeCompare(b, 'zh-Hant');
    });
  }, [customersData]);

  // 篩選客戶
  const filteredCustomers = useMemo(() => {
    return customersData.filter(c => {
      if (!selectedColors[c.col]) return false;
      if (selectedDistrict !== 'all' && c.dist !== selectedDistrict) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchAddr = (c.clean || '').toLowerCase().includes(q) || (c.raw || '').toLowerCase().includes(q);
        const matchTel = (c.tel || '').includes(q);
        const matchId = String(c.id).includes(q);
        if (!matchName && !matchAddr && !matchTel && !matchId) return false;
      }
      return true;
    });
  }, [customersData, selectedColors, selectedDistrict, searchQuery]);

  // 初始化 Leaflet
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isSubscribed = true;

    const initLeaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise(resolve => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      const L = window.L;
      if (!L || !isSubscribed) return;

      if (!mapInstanceRef.current && mapContainerRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [25.0645, 121.5030], // 盛隆煤氣行（三重龍濱路）
          zoom: 14,
          maxZoom: 19,
          minZoom: 10
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // 盛隆總店地標
        const hqIcon = L.divIcon({
          className: 'custom-hq-pin',
          html: '<div style="background:#f59e0b; color:#000; font-weight:900; font-size:12px; padding:4px 8px; border-radius:12px; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.5); white-space:nowrap;">🔥 盛隆總店</div>',
          iconSize: [80, 30],
          iconAnchor: [40, 15]
        });
        L.marker([25.0645, 121.5030], { icon: hqIcon })
          .addTo(map)
          .bindPopup('<strong>🔥 盛隆煤氣行總店</strong><br/>新北市三重區龍濱路15號1樓');

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;
      if (!map) return;

      // 清除舊圖釘
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];

      const colorHexMap = {
        blue: '#2563eb',
        green: '#16a34a',
        pink: '#ec4899',
        red: '#dc2626',
        gray: '#64748b'
      };

      const colorBadgeMap = {
        blue: '🔵 6個月內叫貨',
        green: '🟢 6個月~1年內',
        pink: '🌸 1年~1.5年內',
        red: '🔴 2年~3年內',
        gray: '⚪ 3年以上 / 未曾叫貨'
      };

      const maxMarkers = 1500;
      const displayCustomers = filteredCustomers.slice(0, maxMarkers);

      displayCustomers.forEach(c => {
        const hex = colorHexMap[c.col] || '#2563eb';
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: c.col === 'blue' ? 7 : c.col === 'green' ? 6 : 5,
          fillColor: hex,
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.88
        });

        const safeName = escapeHtml(c.name || '');
        const safeId = escapeHtml(String(c.id || ''));
        const safeAddr = escapeHtml(c.clean || c.raw || '');
        const safeTel = escapeHtml(c.tel || '未記錄');
        const safeLast = escapeHtml(c.last ? c.last : '從未叫貨');
        const daysText = c.days !== null && c.days !== undefined ? '(' + escapeHtml(String(c.days)) + '天前)' : '';
        const navUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.clean || c.raw || '') + '&travelmode=two_wheeler';

        const popupContent = `
          <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; min-width: 220px; color: #1e293b;">
            <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: ${hex};">
              ${safeName} <span style="font-size: 12px; color: #64748b;">(#${safeId})</span>
            </div>
            <div style="font-size: 11px; display: inline-block; padding: 2px 8px; border-radius: 9999px; background: ${hex}15; color: ${hex}; font-weight: 700; margin-bottom: 6px;">
              ${colorBadgeMap[c.col] || ''}
            </div>
            <div style="margin-bottom: 4px;"><strong>📍 地址：</strong>${safeAddr}</div>
            <div style="margin-bottom: 4px;"><strong>📞 電話：</strong>${safeTel}</div>
            <div style="margin-bottom: 4px;"><strong>📅 最後叫貨：</strong>${safeLast} ${daysText}</div>
            <div style="margin-bottom: 8px;"><strong>📦 累計叫貨：</strong>瓦斯 ${c.gas || 0} 次 ｜ 爐具 ${c.stv || 0} 次</div>
            <div style="display: flex; gap: 6px; margin-top: 6px;">
              <a href="${navUrl}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #2563eb; color: #fff; text-decoration: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">
                🛵 機車導航
              </a>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => setActiveCustomer(c));
        marker.addTo(map);
        markersRef.current.push(marker);
      });
    };

    initLeaflet();

    return () => {
      isSubscribed = false;
    };
  }, [filteredCustomers]);

  const toggleColor = (col) => {
    setSelectedColors(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const selectAllColors = () => {
    setSelectedColors({ blue: true, green: true, pink: true, red: true, gray: true });
  };

  const selectActiveOnly = () => {
    setSelectedColors({ blue: true, green: true, pink: false, red: false, gray: false });
  };

  const selectChurnedOnly = () => {
    setSelectedColors({ blue: false, green: false, pink: true, red: true, gray: true });
  };

  const focusCustomerOnMap = (c) => {
    setActiveCustomer(c);
    setViewMode('map');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([c.lat, c.lng], 17);
    }
  };

  const exportFilteredCsv = () => {
    const header = '客戶編號,客戶名稱,電話,標準地址,原始地址,行政區,最後叫貨日,距今天數,叫貨類別,瓦斯次數,爐具次數,經度,緯度\n';
    const rows = filteredCustomers.map(c => 
      `"${c.id}","${c.name}","${c.tel}","${c.clean}","${c.raw}","${c.dist}","${c.last || ''}","${c.days !== null ? c.days : ''}","${c.cat}","${c.gas}","${c.stv}","${c.lng}","${c.lat}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `盛隆客戶分佈_${selectedDistrict}_${getTaiwanDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minHeight: 'calc(100vh - 120px)' }}>
      {/* 標題與核心指標 */}
      <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 12, padding: 18, border: '1px solid var(--border-color, #334155)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🗺️</span>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary, #f8fafc)' }}>
              全戶客戶分佈與叫瓦斯週期地圖
            </h2>
            <span style={{ fontSize: 11, background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              總客戶 3,934 戶
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>
            依最近一次叫貨時間（瓦斯／爐具）標記顏色標籤，精確校正新北與台北行政區重複路名。
          </p>
        </div>

        {/* 快速篩選按鈕 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={selectAllColors}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', cursor: 'pointer' }}
          >
            全部顯示 (3,934)
          </button>
          <button
            onClick={selectActiveOnly}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #16a34a', background: '#16a34a20', color: '#4ade80', cursor: 'pointer' }}
          >
            活躍客戶 (1,236)
          </button>
          <button
            onClick={selectChurnedOnly}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #dc2626', background: '#dc262620', color: '#f87171', cursor: 'pointer' }}
          >
            流失/逾期 (2,698)
          </button>
          <button
            onClick={exportFilteredCsv}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #3b82f6', background: '#3b82f6', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Download size={14} /> 匯出清單 CSV
          </button>
        </div>
      </div>

      {/* 5 種顏色標籤卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {/* 藍色 */}
        <div
          onClick={() => toggleColor('blue')}
          style={{
            cursor: 'pointer',
            padding: 12,
            borderRadius: 10,
            border: selectedColors.blue ? '2px solid #3b82f6' : '1px solid #334155',
            background: selectedColors.blue ? '#1e3a8a25' : '#0f172a',
            transition: 'all 0.2s',
            opacity: selectedColors.blue ? 1 : 0.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>🔵 6個月內</span>
            <input type="checkbox" checked={selectedColors.blue} readOnly />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#93c5fd' }}>1,078 戶</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>核心活躍顧客群</div>
        </div>

        {/* 綠色 */}
        <div
          onClick={() => toggleColor('green')}
          style={{
            cursor: 'pointer',
            padding: 12,
            borderRadius: 10,
            border: selectedColors.green ? '2px solid #16a34a' : '1px solid #334155',
            background: selectedColors.green ? '#14532d25' : '#0f172a',
            transition: 'all 0.2s',
            opacity: selectedColors.green ? 1 : 0.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>🟢 6個月~1年</span>
            <input type="checkbox" checked={selectedColors.green} readOnly />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#86efac' }}>158 戶</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>次頻率或季節客戶</div>
        </div>

        {/* 粉色 */}
        <div
          onClick={() => toggleColor('pink')}
          style={{
            cursor: 'pointer',
            padding: 12,
            borderRadius: 10,
            border: selectedColors.pink ? '2px solid #ec4899' : '1px solid #334155',
            background: selectedColors.pink ? '#83184325' : '#0f172a',
            transition: 'all 0.2s',
            opacity: selectedColors.pink ? 1 : 0.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f472b6' }}>🌸 1年~1.5年</span>
            <input type="checkbox" checked={selectedColors.pink} readOnly />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fbcfe8' }}>39 戶</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>即將流失需關懷</div>
        </div>

        {/* 紅色 */}
        <div
          onClick={() => toggleColor('red')}
          style={{
            cursor: 'pointer',
            padding: 12,
            borderRadius: 10,
            border: selectedColors.red ? '2px solid #dc2626' : '1px solid #334155',
            background: selectedColors.red ? '#7f1d1d25' : '#0f172a',
            transition: 'all 0.2s',
            opacity: selectedColors.red ? 1 : 0.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>🔴 2年~3年</span>
            <input type="checkbox" checked={selectedColors.red} readOnly />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fca5a5' }}>157 戶</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>高度流失 / 轉移</div>
        </div>

        {/* 灰色 */}
        <div
          onClick={() => toggleColor('gray')}
          style={{
            cursor: 'pointer',
            padding: 12,
            borderRadius: 10,
            border: selectedColors.gray ? '2px solid #94a3b8' : '1px solid #334155',
            background: selectedColors.gray ? '#33415530' : '#0f172a',
            transition: 'all 0.2s',
            opacity: selectedColors.gray ? 1 : 0.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>⚪ 3年以上 / 未叫</span>
            <input type="checkbox" checked={selectedColors.gray} readOnly />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0' }}>2,502 戶</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>歷史久遠 / 舊資料</div>
        </div>
      </div>

      {/* 搜尋與行政區工具列 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--card-bg, #1e293b)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-color, #334155)' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <input
            type="text"
            placeholder="搜尋客戶名稱、電話、地址、編號..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 13
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>行政區：</span>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: 13,
              fontWeight: 700
            }}
          >
            <option value="all">全部行政區 ({customersData.length || CUSTOMER_MAP_STATS.total})</option>
            {availableDistricts.map(d => {
              const count = customersData.filter(x => x.dist === d).length;
              return (
                <option key={d} value={d}>
                  {d} ({count} 戶)
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={() => setViewMode('map')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #334155',
              background: viewMode === 'map' ? '#3b82f6' : '#0f172a',
              color: '#fff'
            }}
          >
            🗺️ 地圖視圖
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #334155',
              background: viewMode === 'list' ? '#3b82f6' : '#0f172a',
              color: '#fff'
            }}
          >
            📋 清單視圖 ({filteredCustomers.length})
          </button>
        </div>
      </div>

      {/* 視圖內容 */}
      {viewMode === 'map' ? (
        <div style={{ position: 'relative', width: '100%', height: 620, borderRadius: 12, overflow: 'hidden', border: '1px solid #334155' }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* 地圖懸浮資訊卡 */}
          {activeCustomer && (
            <div style={{
              position: 'absolute',
              bottom: 20,
              left: 20,
              zIndex: 1000,
              background: '#0f172a',
              color: '#f8fafc',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #3b82f6',
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
              maxWidth: 340,
              animation: 'fadeIn 0.2s ease-in-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#60a5fa' }}>
                    {activeCustomer.name} <span style={{ fontSize: 12, color: '#94a3b8' }}>(#{activeCustomer.id})</span>
                  </h4>
                  <span style={{ fontSize: 11, background: '#1e293b', padding: '2px 8px', borderRadius: 6, color: '#38bdf8', fontWeight: 700, marginTop: 4, display: 'inline-block' }}>
                    {activeCustomer.dist} ｜ {activeCustomer.cat}
                  </span>
                </div>
                <button
                  onClick={() => setActiveCustomer(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cbd5e1', marginBottom: 12 }}>
                <div><strong>📍 地址：</strong>{activeCustomer.clean || activeCustomer.raw}</div>
                <div><strong>📞 電話：</strong>{activeCustomer.tel || '未記錄'}</div>
                <div><strong>📅 最近叫貨：</strong>{activeCustomer.last || '從未叫貨'} {activeCustomer.days !== null ? `(${activeCustomer.days}天前)` : ''}</div>
                <div><strong>📦 總叫貨次數：</strong>瓦斯 {activeCustomer.gas} 次 ｜ 爐具 {activeCustomer.stv} 次</div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((activeCustomer.clean || activeCustomer.raw))}&travelmode=two_wheeler`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    background: '#2563eb',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Compass size={14} /> Google 導航
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 清單列表模式 */
        <div style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 12, border: '1px solid var(--border-color, #334155)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
              篩選符合客戶：共 <strong style={{ color: '#60a5fa' }}>{filteredCustomers.length}</strong> 戶
            </span>
          </div>
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                  <th style={{ padding: '10px 14px' }}>編號</th>
                  <th style={{ padding: '10px 14px' }}>狀態</th>
                  <th style={{ padding: '10px 14px' }}>客戶名稱</th>
                  <th style={{ padding: '10px 14px' }}>電話</th>
                  <th style={{ padding: '10px 14px' }}>標準地址</th>
                  <th style={{ padding: '10px 14px' }}>行政區</th>
                  <th style={{ padding: '10px 14px' }}>最後叫貨日</th>
                  <th style={{ padding: '10px 14px' }}>距今天數</th>
                  <th style={{ padding: '10px 14px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.slice(0, 300).map((c, idx) => {
                  const badgeStyles = {
                    blue: { bg: '#1e3a8a30', text: '#60a5fa', label: '6個月內' },
                    green: { bg: '#14532d30', text: '#4ade80', label: '6月~1年' },
                    pink: { bg: '#83184330', text: '#f472b6', label: '1年~1.5年' },
                    red: { bg: '#7f1d1d30', text: '#f87171', label: '2年~3年' },
                    gray: { bg: '#33415530', text: '#94a3b8', label: '3年以上' }
                  };
                  const b = badgeStyles[c.col] || badgeStyles.gray;

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #33415540', background: idx % 2 === 0 ? 'transparent' : '#0f172a20' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#94a3b8' }}>#{c.id}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: b.bg, color: b.text }}>
                          {b.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{c.name}</td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{c.tel || '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{c.clean || c.raw}</td>
                      <td style={{ padding: '10px 14px', color: '#38bdf8' }}>{c.dist}</td>
                      <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{c.last || '未曾叫貨'}</td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{c.days !== null ? `${c.days}天` : '-'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => focusCustomerOnMap(c)}
                            style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, border: '1px solid #3b82f6', background: '#3b82f620', color: '#60a5fa', cursor: 'pointer' }}
                          >
                            地圖定位
                          </button>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((c.clean || c.raw))}&travelmode=two_wheeler`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', textDecoration: 'none' }}
                          >
                            導航
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
