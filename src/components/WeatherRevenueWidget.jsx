import React, { useState, useEffect, useMemo } from 'react';
import { getLiveWeatherAnalysis, WEATHER_FEATURE_VERSION, WEATHER_REVENUE_STANDARDS } from '../utils/weatherService';
import { getMonthlyOperatingSummary } from '../utils/financials';
import { getIncomes } from '../db/storage';

export default function WeatherRevenueWidget({
  companyId,
  year,
  month,
  monthlyRevenue = 0,
  style,
}) {
  const [analysisData, setAnalysisData] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showStandards, setShowStandards] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    getLiveWeatherAnalysis().then((d) => {
      if (isMounted) {
        setAnalysisData(d);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 計算選定月份或基準月份的實際瓦斯營業額
  const activeRevenue = useMemo(() => {
    if (monthlyRevenue && monthlyRevenue > 0) return monthlyRevenue;
    if (companyId && year && month) {
      try {
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        const sum = getMonthlyOperatingSummary(companyId, ym);
        const rev = Number(sum?.totalRevenue || 0);
        if (rev > 0) return rev;
      } catch {}
    }
    // 回退機制：嘗試從歷史核准帳目計算最近期營收
    try {
      const allIncomes = getIncomes() || [];
      const compIncomes = allIncomes.filter(
        (i) => (!companyId || i.companyId === companyId) && i.status === 'approved' && Number(i.amount) > 0
      );
      if (compIncomes.length > 0) {
        const monthTotals = {};
        compIncomes.forEach((i) => {
          const m = (i.date || '').slice(0, 7);
          if (m) monthTotals[m] = (monthTotals[m] || 0) + Number(i.amount || 0);
        });
        const sortedMonths = Object.keys(monthTotals).sort();
        const latestMonth = sortedMonths[sortedMonths.length - 1];
        if (latestMonth && monthTotals[latestMonth] > 0) {
          return monthTotals[latestMonth];
        }
      }
    } catch {}
    // 預設盛隆瓦斯月常態基準營收（168 萬元）
    return 1680000;
  }, [companyId, year, month, monthlyRevenue]);

  if (loading || !analysisData) {
    return null;
  }

  // 需求係數與天氣影響計算
  const multiplier = Number(analysisData.demandMultiplier ?? 1.0);
  const deltaRate = multiplier - 1; // 正為多賺、負為少賺
  const isLoss = deltaRate < -0.001;
  const isGain = deltaRate > 0.001;
  
  // 預估天氣影響營收金額
  const impactRevenue = Math.round(activeRevenue * deltaRate);
  const impactPercentage = Math.round(Math.abs(deltaRate) * 1000) / 10;
  // 瓦斯平均毛利率約 28%，估算毛利連帶影響
  const impactGrossProfit = Math.round(impactRevenue * 0.28);
  // 每日平均影響額
  const dailyImpact = Math.round(impactRevenue / 30);

  return (
    <>
      {/* 頂部導覽列精簡膠囊按鈕 (與盛隆 Logo / 公司名稱同行) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn"
        aria-label="開啟天氣影響營業預估分析"
        title="點擊查看天氣影響營業預估會影響多少與預估標準"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          backgroundColor: isLoss
            ? 'rgba(239, 68, 68, 0.08)'
            : isGain
            ? 'rgba(22, 163, 74, 0.08)'
            : 'rgba(5, 178, 165, 0.08)',
          border: `1px solid ${
            isLoss
              ? 'rgba(239, 68, 68, 0.35)'
              : isGain
              ? 'rgba(22, 163, 74, 0.35)'
              : 'rgba(5, 178, 165, 0.35)'
          }`,
          color: isLoss ? '#dc2626' : isGain ? '#15803d' : 'var(--primary-color, #05b2a5)',
          padding: '3px 10px',
          borderRadius: '16px',
          fontSize: '0.8rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          ...style,
        }}
      >
        <span style={{ fontSize: '13px', lineHeight: 1 }}>{isLoss ? '🌤️' : isGain ? '❄️' : '💡'}</span>
        <span>天氣營收影響</span>
        <span
          style={{
            fontSize: '9px',
            backgroundColor: isLoss
              ? '#fee2e2'
              : isGain
              ? '#dcfce7'
              : 'rgba(5, 178, 165, 0.2)',
            color: isLoss ? '#b91c1c' : isGain ? '#166534' : 'var(--primary-color, #05b2a5)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {isLoss ? `少賺 -${impactPercentage}%` : isGain ? `多賺 +${impactPercentage}%` : '持平 0%'}
        </span>
      </button>

      {/* 展開詳情彈窗 (Modal Dialog) */}
      {isOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                borderTopLeftRadius: '14px',
                borderTopRightRadius: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🌤️</span>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>天氣影響 營業預估會影響多少</span>
                    <span style={{ fontSize: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      {WEATHER_FEATURE_VERSION}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {analysisData.location} 即時氣溫 {analysisData.currentTemp}°C ｜ 盛隆瓦斯營收關聯模型
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{
                  minWidth: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  cursor: 'pointer',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#64748b',
                }}
                title="關閉"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '18px 20px' }}>
              {/* 核心卡片：天氣影響 營業預估會影響多少 */}
              <div
                style={{
                  backgroundColor: isLoss ? '#fff1f2' : isGain ? '#f0fdf4' : '#f8fafc',
                  border: `1.5px solid ${isLoss ? '#fecdd3' : isGain ? '#bbf7d0' : '#cbd5e1'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: isLoss ? '#9f1239' : isGain ? '#166534' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{isLoss ? '📉' : isGain ? '📈' : '⚖️'}</span>
                      <span>
                        {isLoss
                          ? '炎夏高溫淡季：營業預估少賺'
                          : isGain
                          ? '低溫旺季拉動：營業預估增長'
                          : '氣候舒適平穩：營業額維持常態'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: isLoss ? '#be123c' : isGain ? '#15803d' : '#64748b', marginTop: '2px' }}>
                      當前氣溫：{analysisData.currentTemp}°C ({analysisData.standardTier}) ｜ 需求係數：{multiplier}x ｜ 基準營收：${activeRevenue.toLocaleString()} 元
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: isLoss ? '#fda4af' : isGain ? '#86efac' : '#e2e8f0',
                      color: isLoss ? '#881337' : isGain ? '#14532d' : '#334155',
                      padding: '3px 10px',
                      borderRadius: '20px',
                    }}
                  >
                    {isLoss ? `預估少賺 -${impactPercentage}%` : isGain ? `預估多賺 +${impactPercentage}%` : '持平 0%'}
                  </span>
                </div>

                {/* 金額統計三大指標 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    padding: '12px',
                    border: `1px solid ${isLoss ? '#fecdd3' : isGain ? '#dcfce7' : '#e2e8f0'}`,
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>預估營業額影響</div>
                    <div
                      style={{
                        fontSize: '17px',
                        fontWeight: 900,
                        color: isLoss ? '#e11d48' : isGain ? '#16a34a' : '#0f172a',
                        marginTop: '2px',
                      }}
                    >
                      {impactRevenue >= 0 ? `+$${impactRevenue.toLocaleString()}` : `-$${Math.abs(impactRevenue).toLocaleString()}`} 元
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>連帶毛利影響 (28%)</div>
                    <div
                      style={{
                        fontSize: '17px',
                        fontWeight: 900,
                        color: isLoss ? '#be123c' : isGain ? '#16a34a' : '#0f172a',
                        marginTop: '2px',
                      }}
                    >
                      {impactGrossProfit >= 0 ? `+$${impactGrossProfit.toLocaleString()}` : `-$${Math.abs(impactGrossProfit).toLocaleString()}`} 元
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>平均每日影響</div>
                    <div
                      style={{
                        fontSize: '17px',
                        fontWeight: 900,
                        color: isLoss ? '#e11d48' : isGain ? '#16a34a' : '#0f172a',
                        marginTop: '2px',
                      }}
                    >
                      {dailyImpact >= 0 ? `+$${dailyImpact.toLocaleString()}` : `-$${Math.abs(dailyImpact).toLocaleString()}`} 元/日
                    </div>
                  </div>
                </div>

                {/* 說明與建議 */}
                <div style={{ marginTop: '10px', fontSize: '12px', color: isLoss ? '#9f1239' : isGain ? '#166534' : '#334155', lineHeight: 1.5 }}>
                  <strong>💡 影響原因：</strong>{analysisData.elasticityText}
                </div>
              </div>

              {/* 預估標準與計算依據折疊面板 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => setShowStandards(!showStandards)}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📋 氣候影響瓦斯營業預估標準（對照表）</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      color: 'var(--primary-color, #05b2a5)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {showStandards ? '收起標準 ▲' : '查看完整標準 ▼'}
                  </button>
                </div>

                {/* 展開之標準明細 */}
                {showStandards && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                      瓦斯行業營運基準：以台灣北部春秋季 <strong>25°C</strong> 為常態月基準線（係數 1.00x）。隨氣溫升降，家庭洗澡水溫、煮湯與火鍋頻率產生週期彈性變化：
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {WEATHER_REVENUE_STANDARDS.map((std) => {
                        const isCurrent = analysisData.standardTier === std.tier;
                        return (
                          <div
                            key={std.tier}
                            style={{
                              backgroundColor: isCurrent ? '#fef3c7' : '#ffffff',
                              border: `1px solid ${isCurrent ? '#f59e0b' : '#e2e8f0'}`,
                              borderRadius: '8px',
                              padding: '8px 10px',
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                              <div style={{ fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{std.icon}</span>
                                <span>{std.tier}（{std.range}）</span>
                                {isCurrent && (
                                  <span style={{ fontSize: '10px', backgroundColor: '#f59e0b', color: '#ffffff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                    當前氣候
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: std.impactType === 'decrease' ? '#dc2626' : std.impactType === 'increase' ? '#16a34a' : '#64748b',
                                }}
                              >
                                營收 {std.impactLabel} (係數 {std.multiplier}x)
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
                              🔄 {std.cycleChange} ｜ 📝 {std.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: '10px', padding: '8px 10px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '11px', color: '#334155' }}>
                      <div><strong>📐 計算公式標準：</strong></div>
                      <div>• 營業額預估影響額 = 當月基準營收 × (氣候需求係數 - 1)</div>
                      <div>• 毛利連帶影響額 = 營業額預估影響額 × 28% (瓦斯業平均毛利率)</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 今日營業時段出貨量走勢圖 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  padding: '14px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                    📊 今日營業時段（08:00 - 21:00）瓦斯出貨量走勢圖
                  </span>
                  <span style={{ fontSize: '11px', color: '#16a34a', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    即時營運指標
                  </span>
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                  <div style={{ minWidth: '420px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(14, 1fr)',
                        gap: '6px',
                        alignItems: 'flex-end',
                        height: '110px',
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        padding: '14px 8px 6px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {analysisData.hourly
                        .filter((h) => h.hourNum >= 8 && h.hourNum <= 21)
                        .map((h) => {
                          const barPct = Math.max(12, Math.round((h.gasVolume / 8) * 85));
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
                              <div
                                style={{
                                  width: '100%',
                                  maxWidth: '22px',
                                  height: `${barPct}%`,
                                  backgroundColor: h.gasVolume > 0 ? '#10b981' : '#e2e8f0',
                                  borderRadius: '4px 4px 0 0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: h.gasVolume > 0 ? '0 1px 3px rgba(16, 185, 129, 0.3)' : 'none',
                                }}
                              >
                                {h.gasVolume > 0 && (
                                  <span style={{ fontSize: '9px', fontWeight: 900, color: '#fff' }}>
                                    {h.gasVolume}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                                {h.hour.slice(0, 2)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
                  * 柱狀數字代表每小時瓦斯出貨量（桶）
                </div>
              </div>

              {/* 叫貨高峰期智能指標 */}
              <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af', marginBottom: '3px' }}>
                    🕒 叫貨熱門尖峰時段
                  </div>
                  <div style={{ fontSize: '11px', color: '#3b82f6', lineHeight: 1.4 }}>
                    午間 11:00-13:00 ｜ 晚間 17:00-19:00
                  </div>
                </div>
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', marginBottom: '3px' }}>
                    📦 配送排程調度建議
                  </div>
                  <div style={{ fontSize: '11px', color: '#16a34a', lineHeight: 1.4 }}>
                    建議尖峰前提早 30 分鐘完成車次裝載
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#f8fafc',
                borderBottomLeftRadius: '14px',
                borderBottomRightRadius: '14px',
              }}
            >
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
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
