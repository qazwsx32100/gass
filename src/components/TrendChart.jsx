import React, { useMemo } from 'react';
import { getIncomeStatement } from '../utils/financials';

export default function TrendChart({ companyId, year, month, triggerRefresh }) {
  // 1. Generate list of the last 6 months ending at current year-month
  const periods = useMemo(() => {
    const list = [];
    let currentY = parseInt(year, 10);
    let currentM = parseInt(month, 10);
    
    for (let i = 0; i < 6; i++) {
      list.unshift({
        year: currentY,
        month: String(currentM).padStart(2, '0'),
        val: `${currentY}-${String(currentM).padStart(2, '0')}`
      });
      currentM--;
      if (currentM === 0) {
        currentM = 12;
        currentY--;
      }
    }
    return list;
  }, [year, month]);

  // 2. Fetch P&L data for these 6 periods
  const chartData = useMemo(() => {
    void triggerRefresh;
    return periods.map(p => {
      const pnl = getIncomeStatement(companyId, 'month', p.val);
      const label = p.month === '01' ? `${p.year}年1月` : `${parseInt(p.month, 10)}月`;
      return {
        label,
        periodVal: p.val,
        revenue: pnl.totalRevenue || 0,
        expense: (pnl.totalExpenses + pnl.totalCogs) || 0,
        profit: pnl.netProfit || 0
      };
    });
  }, [companyId, periods, triggerRefresh]);

  // 3. Scale math for SVG
  const width = 600;
  const height = 220;
  const paddingLeft = 65;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const { maxVal, minVal } = useMemo(() => {
    const allValues = chartData.flatMap(d => [d.revenue, d.expense, d.profit]);
    const max = Math.max(...allValues, 10000);
    const min = Math.min(...allValues, 0); // Always anchor at least to 0
    return { maxVal: max * 1.1, minVal: min < 0 ? min * 1.1 : 0 };
  }, [chartData]);

  const getX = (index) => paddingLeft + (index / 5) * chartWidth;
  const getY = (value) => {
    const scale = (value - minVal) / (maxVal - minVal);
    return height - paddingBottom - scale * chartHeight;
  };

  // Generate SVG Points
  const revenuePoints = chartData.map((d, i) => `${getX(i)},${getY(d.revenue)}`).join(' ');
  const profitPoints = chartData.map((d, i) => `${getX(i)},${getY(d.profit)}`).join(' ');

  const revenueArea = `${getX(0)},${getY(0)} ${revenuePoints} ${getX(5)},${getY(0)}`;
  const profitArea = `${getX(0)},${getY(0)} ${profitPoints} ${getX(5)},${getY(0)}`;

  // Grid lines
  const gridLinesCount = 4;
  const gridLines = Array.from({ length: gridLinesCount }).map((_, i) => {
    const val = minVal + (i / (gridLinesCount - 1)) * (maxVal - minVal);
    return {
      value: val,
      y: getY(val)
    };
  });

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <span className="card-title">📈 營業額與利潤半年走勢 (淡旺季季節分析)</span>
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#05b2a5' }} />
            <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>營業收入</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-block', width: '12px', height: '3px', borderTop: '3px solid #f59e0b' }} />
            <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>淨利潤</span>
          </div>
        </div>
      </div>

      <div className="card-body" style={{ padding: '8px 16px 16px 16px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              {/* Gradients */}
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#05b2a5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#05b2a5" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {gridLines.map((line, idx) => (
              <g key={idx}>
                <line 
                  x1={paddingLeft} 
                  y1={line.y} 
                  x2={width - paddingRight} 
                  y2={line.y} 
                  stroke="rgba(5, 178, 165, 0.08)" 
                  strokeWidth="1.5"
                  strokeDasharray={line.value === 0 ? "0" : "4 4"}
                />
                <text 
                  x={paddingLeft - 8} 
                  y={line.y + 4} 
                  textAnchor="end" 
                  style={{ fill: line.value === 0 ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}
                >
                  {line.value === 0 ? '$0' : `$${(Math.round(line.value / 1000)).toLocaleString()}K`}
                </text>
              </g>
            ))}

            {/* Vertical grid lines & labels */}
            {chartData.map((d, i) => (
              <g key={i}>
                <line 
                  x1={getX(i)} 
                  y1={paddingTop} 
                  x2={getX(i)} 
                  y2={height - paddingBottom} 
                  stroke="rgba(5, 178, 165, 0.04)" 
                  strokeWidth="1"
                />
                <text 
                  x={getX(i)} 
                  y={height - paddingBottom + 16} 
                  textAnchor="middle" 
                  style={{ fill: 'var(--text-secondary)', fontSize: '10px', fontWeight: '500' }}
                >
                  {d.label}
                </text>
              </g>
            ))}

            {/* 1. Revenue Area & Line */}
            {chartData.length > 0 && (
              <>
                <polygon points={revenueArea} fill="url(#revGrad)" />
                <polyline 
                  points={revenuePoints} 
                  fill="none" 
                  stroke="#05b2a5" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              </>
            )}

            {/* 2. Profit Area & Line */}
            {chartData.length > 0 && (
              <>
                <polygon points={profitArea} fill="url(#profitGrad)" />
                <polyline 
                  points={profitPoints} 
                  fill="none" 
                  stroke="#f59e0b" 
                  strokeWidth="2.5" 
                  strokeDasharray="1"
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              </>
            )}

            {/* Data Dots & Text overlay */}
            {chartData.map((d, i) => (
              <g key={i} className="chart-dot-group">
                {/* Revenue dots */}
                <circle 
                  cx={getX(i)} 
                  cy={getY(d.revenue)} 
                  r="4" 
                  fill="#ffffff" 
                  stroke="#05b2a5" 
                  strokeWidth="2.5" 
                />
                {d.revenue > 0 && (
                  <text 
                    x={getX(i)} 
                    y={getY(d.revenue) - 10} 
                    textAnchor="middle" 
                    style={{ fill: 'var(--accent-blue)', fontSize: '8px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}
                  >
                    {Math.round(d.revenue / 1000)}k
                  </text>
                )}

                {/* Profit dots */}
                <circle 
                  cx={getX(i)} 
                  cy={getY(d.profit)} 
                  r="3.5" 
                  fill="#ffffff" 
                  stroke="#f59e0b" 
                  strokeWidth="2" 
                />
                {d.profit !== 0 && (
                  <text 
                    x={getX(i)} 
                    y={getY(d.profit) + (d.profit < 0 ? 12 : -8)} 
                    textAnchor="middle" 
                    style={{ fill: d.profit < 0 ? 'var(--accent-red)' : '#d97706', fontSize: '8px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}
                  >
                    {Math.round(d.profit / 1000)}k
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
