import React, { useState, useEffect } from 'react';
import { getLiveWeatherAnalysis, WEATHER_FEATURE_VERSION } from '../utils/weatherService';

export default function WeatherRevenueWidget({ monthlyRevenue = 0 }) {
  const [weatherData, setWeatherData] = useState(null);
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getLiveWeatherAnalysis().then((d) => {
      if (isMounted) {
        setWeatherData(d);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !weatherData) {
    return null;
  }

  // 估算氣候對本月營業額與毛利的影響額度
  const elasticityImpact = Math.round(monthlyRevenue * (weatherData.demandMultiplier - 1));
  const isPositiveImpact = elasticityImpact >= 0;

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '14px 16px',
        marginBottom: '16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
      }}
    >
      {/* 標題列與折疊按鈕 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          cursor: 'pointer',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{weatherData.conditionIcon}</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>氣象 ✕ 瓦斯營收關聯智能分析</span>
              <span style={{ fontSize: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                {WEATHER_FEATURE_VERSION}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {weatherData.location} ｜ 即時氣溫 <strong>{weatherData.currentTemp}°C</strong> (體感 {weatherData.apparentTemp}°C) ｜ {weatherData.conditionLabel}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {weatherData.isColdAlert && (
            <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '6px', fontWeight: 800 }}>
              ❄️ 低溫叫貨高峰預警
            </span>
          )}
          <button
            type="button"
            style={{
              backgroundColor: '#f1f5f9',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '12px',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {isOpen ? '收合 ▲' : '展開詳情 ▼'}
          </button>
        </div>
      </div>

      {/* 展開內容 */}
      {isOpen && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
          {/* 氣候營收指引膠囊 */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '13px',
              color: '#334155',
              marginBottom: '12px',
              lineHeight: 1.5,
            }}
          >
            <strong>💡 財報與營收洞察：</strong> {weatherData.elasticityText}
            {monthlyRevenue > 0 && (
              <span style={{ marginLeft: '6px', color: isPositiveImpact ? '#16a34a' : '#ea580c', fontWeight: 800 }}>
                (預估氣候係數影響額：{isPositiveImpact ? '+' : ''}${elasticityImpact.toLocaleString()} 元)
              </span>
            )}
          </div>

          {/* 24 小時出貨與氣溫雙軸走勢圖 */}
          <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
            <div style={{ minWidth: '480px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                📊 今日營業時段（08:00 - 21:00）氣溫 ✕ 出貨量走勢圖：
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(14, 1fr)',
                  gap: '4px',
                  alignItems: 'flex-end',
                  height: '90px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  padding: '8px 6px 4px',
                  border: '1px solid #e2e8f0',
                }}
              >
                {weatherData.hourly
                  .filter((h) => h.hourNum >= 8 && h.hourNum <= 21)
                  .map((h) => {
                    const barPct = Math.max(8, Math.round((h.gasVolume / 8) * 80));
                    return (
                      <div
                        key={h.hour}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div style={{ fontSize: '9px', color: '#ea580c', fontWeight: 800 }}>
                          {h.temp}°
                        </div>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '18px',
                            height: `${barPct}%`,
                            backgroundColor: h.gasVolume > 0 ? '#22c55e' : '#e2e8f0',
                            borderRadius: '3px 3px 0 0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {h.gasVolume > 0 && (
                            <span style={{ fontSize: '8px', fontWeight: 900, color: '#fff' }}>
                              {h.gasVolume}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>
                          {h.hour.slice(0, 2)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
