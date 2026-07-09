import React, { useMemo } from 'react';

const DEFAULT_COLORS = ['#05b2a5', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316'];

export default function PieChart({ title, items, emptyText = '目前沒有資料' }) {
  const chartData = useMemo(() => {
    const rows = (items || [])
      .map((item, index) => ({
        ...item,
        amount: Number(item.amount) || 0,
        color: item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
      }))
      .filter(item => item.amount > 0);

    const total = rows.reduce((sum, item) => sum + item.amount, 0);
    let cursor = 0;
    const gradient = rows.map(item => {
      const start = cursor;
      const pct = total > 0 ? (item.amount / total) * 100 : 0;
      cursor += pct;
      return `${item.color} ${start}% ${cursor}%`;
    }).join(', ');

    return { rows, total, gradient };
  }, [items]);

  return (
    <div className="pie-chart-panel">
      {title && <div className="pie-chart-title">{title}</div>}
      {chartData.total <= 0 ? (
        <div className="pie-chart-empty">{emptyText}</div>
      ) : (
        <div className="pie-chart-layout">
          <div
            className="pie-chart"
            style={{ background: `conic-gradient(${chartData.gradient})` }}
            aria-label={title || '圓餅圖'}
          >
            <div className="pie-chart-center">
              <span>總計</span>
              <strong>${chartData.total.toLocaleString()}</strong>
            </div>
          </div>

          <div className="pie-chart-legend">
            {chartData.rows.map(item => {
              const percent = chartData.total > 0 ? (item.amount / chartData.total) * 100 : 0;
              return (
                <div key={item.label} className="pie-chart-legend-item">
                  <span className="pie-chart-dot" style={{ backgroundColor: item.color }} />
                  <span className="pie-chart-label">{item.label}</span>
                  <span className="pie-chart-value">${item.amount.toLocaleString()}</span>
                  <span className="pie-chart-percent">{percent.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
