import React, { useState, useEffect, useMemo } from 'react';
import { getLiveWeatherAnalysis, WEATHER_FEATURE_VERSION } from '../utils/weatherService';
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

  // 需求係數與少賺金額核心計算
  const multiplier = Number(analysisData.demandMultiplier ?? 1.0);
  const isLossSeason = multiplier < 1.0;
  // 預估少賺金額：常態基準 * (1 - multiplier)
  const lostRevenueAmount = Math.round(activeRevenue * Math.abs(1 - multiplier));
  const lostPercentage = Math.round(Math.abs(1 - multiplier) * 1000) / 10;
  // 瓦斯平均毛利率約 28%，估算毛利減少
  const lostGrossProfit = Math.round(lostRevenueAmount * 0.28);
  // 每日平均少賺額
  const dailyLostAmount = Math.round(lostRevenueAmount / 30);

  return (
    <>
      {/* 頂部導覽列精簡膠囊按鈕 (與盛隆 Logo / 公司名稱同行) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn"
        aria-label="開啟瓦斯營收關聯智能分析"
        title="點擊查看瓦斯營收關聯智能分析與預估少賺金額"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          backgroundColor: isLossSeason ? 'rgba(239, 68, 68, 0.08)' : 'rgba(5, 178, 165, 0.08)',
          border: `1px solid ${isLossSeason ? 'rgba(239, 68, 68, 0.35)' : 'rgba(5, 178, 165, 0.35)'}`,
          color: isLossSeason ? '#dc2626' : 'var(--primary-color, #05b2a5)',
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
        <span style={{ fontSize: '13px', lineHeight: 1 }}>{isLossSeason ? '📉' : '💡'}</span>
        <span>智能分析</span>
        {isLossSeason ? (
          <span
            style={{
              fontSize: '9px',
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            少賺 -{lostPercentage}%
          </span>
        ) : (
          <span
            style={{
              fontSize: '9px',
              backgroundColor: 'rgba(5, 178, 165, 0.2)',
              color: 'var(--primary-color, #05b2a5)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            BI
          </span>
        )}
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
              maxWidth: '620px',
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
                <span style={{ fontSize: '22px' }}>{isLossSeason ? '📉' : '💡'}</span>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>瓦斯營收關聯智能分析</span>
                    <span style={{ fontSize: '10px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      {WEATHER_FEATURE_VERSION}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    盛隆營運大數據 ✕ 營業時段叫貨趨勢洞察
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
              {/* 核心損益警示：會少賺多少錢專屬卡片 */}
              <div
                style={{
                  backgroundColor: isLossSeason ? '#fff1f2' : '#f0fdf4',
                  border: `1.5px solid ${isLossSeason ? '#fecdd3' : '#bbf7d0'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '16px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: isLossSeason ? '#9f1239' : '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{isLossSeason ? '📉' : '📈'}</span>
                      <span>{isLossSeason ? '週期性營收預警：預估本月會少賺多少錢' : '營收動態表現：用氣週期平穩'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: isLossSeason ? '#be123c' : '#15803d', marginTop: '2px' }}>
                      基準營收：${activeRevenue.toLocaleString()} 元 ｜ 動態需求係數：{multiplier}x
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: isLossSeason ? '#fda4af' : '#86efac',
                      color: isLossSeason ? '#881337' : '#14532d',
                      padding: '3px 9px',
                      borderRadius: '20px',
                    }}
                  >
                    {isLossSeason ? `預估減幅 -${lostPercentage}%` : '需求平穩正常'}
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
                    border: `1px solid ${isLossSeason ? '#fecdd3' : '#dcfce7'}`,
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>預估會少賺營收</div>
                    <div style={{ fontSize: '17px', fontWeight: 900, color: isLossSeason ? '#e11d48' : '#16a34a', marginTop: '2px' }}>
                      {isLossSeason ? `-$${lostRevenueAmount.toLocaleString()}` : '無減損'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>預估毛利減少</div>
                    <div style={{ fontSize: '17px', fontWeight: 900, color: isLossSeason ? '#be123c' : '#16a34a', marginTop: '2px' }}>
                      {isLossSeason ? `-$${lostGrossProfit.toLocaleString()}` : '$0'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>平均每日少賺</div>
                    <div style={{ fontSize: '17px', fontWeight: 900, color: isLossSeason ? '#e11d48' : '#16a34a', marginTop: '2px' }}>
                      {isLossSeason ? `-$${dailyLostAmount.toLocaleString()}` : '$0'}
                    </div>
                  </div>
                </div>

                {/* 成因與應對建議 */}
                <div style={{ marginTop: '10px', fontSize: '12px', color: isLossSeason ? '#9f1239' : '#166534', lineHeight: 1.5 }}>
                  <strong>💡 為什麼會少賺？</strong>
                  {isLossSeason ? (
                    <span>
                      目前處於換桶淡季，用戶洗澡水溫需求低、家庭與餐飲用氣頻率放緩，換桶週期平均延長 7～10 天。
                      建議<strong>搭配定期安檢、促銷高熱效爐具／安全閥管線</strong>或<strong>爭取長期合約商用客戶</strong>，補足淡季營收缺口。
                    </span>
                  ) : (
                    <span>目前各用戶用氣週期正常，建議確保配送車次充足以滿足高峰叫貨。</span>
                  )}
                </div>
              </div>

              {/* 營收指引洞察卡片 */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#334155',
                  marginBottom: '16px',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: '4px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💡 財報與營收洞察</span>
                </div>
                <div>{analysisData.elasticityText}</div>
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
