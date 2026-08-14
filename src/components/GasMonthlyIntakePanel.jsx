import React, { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Gauge, Scale } from 'lucide-react';
import {
  GAS_SPECS,
  buildGasIntakeTimeline,
  getMonthlyGasIntakeView
} from '../utils/gasIntake';

const formatNumber = (value, maximumFractionDigits = 1) => Number(value || 0).toLocaleString('zh-TW', {
  maximumFractionDigits
});

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString('zh-TW', {
  maximumFractionDigits: 0
})}`;

const formatMonth = (yearMonth) => {
  const [year, month] = String(yearMonth || '').split('-');
  return year && month ? `${year} 年 ${Number(month)} 月` : yearMonth;
};

const monthShortLabel = (yearMonth) => {
  const [year, month] = String(yearMonth || '').split('-');
  return Number(month) === 1 ? `${year} / 1` : `${Number(month)} 月`;
};

export default function GasMonthlyIntakePanel({ purchases = [] }) {
  const latestMonth = useMemo(
    () => getMonthlyGasIntakeView(purchases).selectedMonth,
    [purchases]
  );
  const [selectedMonth, setSelectedMonth] = useState(latestMonth);

  const report = useMemo(
    () => getMonthlyGasIntakeView(purchases, selectedMonth),
    [purchases, selectedMonth]
  );
  const timeline = useMemo(
    () => buildGasIntakeTimeline(purchases, report.selectedMonth, 12),
    [purchases, report.selectedMonth]
  );
  const maxTimelineKg = Math.max(...timeline.map(month => month.netKg), 1);
  const comparisonClass = report.changeKg > 0 ? 'up' : report.changeKg < 0 ? 'down' : 'neutral';
  const comparisonText = report.changePercent === null
    ? '前月無進氣資料'
    : `${report.changeKg >= 0 ? '+' : ''}${formatNumber(report.changeKg)} kg（${report.changePercent >= 0 ? '+' : ''}${formatNumber(report.changePercent)}%）`;

  return (
    <section className="gas-intake-report" aria-labelledby="gas-intake-report-title">
      <div className="gas-intake-report__header">
        <div>
          <h3 id="gas-intake-report-title">每月瓦斯進氣量</h3>
          <p>{formatMonth(report.selectedMonth)}</p>
        </div>
        <label className="gas-intake-month-picker">
          <span>查看月份</span>
          <select value={report.selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>
            {report.months.length === 0 && <option value={report.selectedMonth}>{formatMonth(report.selectedMonth)}</option>}
            {report.months.map(month => (
              <option key={month.yearMonth} value={month.yearMonth}>{formatMonth(month.yearMonth)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="gas-intake-metrics">
        <article className="gas-intake-metric gas-intake-metric--primary">
          <div className="gas-intake-metric__icon"><Gauge size={21} /></div>
          <span>淨進氣量</span>
          <strong>{formatNumber(report.current.netKg)} kg</strong>
          <small className={`metric-change ${comparisonClass}`}>較前月 {comparisonText}</small>
        </article>
        <article className="gas-intake-metric">
          <div className="gas-intake-metric__icon"><Scale size={21} /></div>
          <span>毛進氣 / 殘氣扣除</span>
          <strong>{formatNumber(report.current.grossKg)} kg</strong>
          <small>扣除 {formatNumber(report.current.residualKg)} kg</small>
        </article>
        <article className="gas-intake-metric">
          <div className="gas-intake-metric__icon"><Banknote size={21} /></div>
          <span>進氣金額 / 平均單價</span>
          <strong>{formatCurrency(report.current.amount)}</strong>
          <small>{formatCurrency(report.current.averageCostPerKg)} / kg</small>
        </article>
        <article className="gas-intake-metric">
          <div className="gas-intake-metric__icon"><CalendarDays size={21} /></div>
          <span>進氣天數 / 日均進氣</span>
          <strong>{report.current.intakeDays.toLocaleString()} 天</strong>
          <small>{formatNumber(report.current.averageKgPerIntakeDay)} kg / 天</small>
        </article>
      </div>

      <div className="gas-intake-layout">
        <div className="gas-intake-chart-card">
          <div className="gas-intake-section-title">
            <strong>近 12 個月進氣趨勢</strong>
            <span>淨進氣公斤數</span>
          </div>
          <div className="gas-intake-chart" role="img" aria-label="近 12 個月瓦斯淨進氣量長條圖">
            {timeline.map(month => {
              const barHeight = month.netKg > 0 ? Math.max(8, (month.netKg / maxTimelineKg) * 100) : 2;
              const isSelected = month.yearMonth === report.selectedMonth;
              return (
                <button
                  type="button"
                  key={month.yearMonth}
                  className={`gas-intake-bar ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedMonth(month.yearMonth)}
                  disabled={month.recordCount === 0}
                  title={`${formatMonth(month.yearMonth)}：${formatNumber(month.netKg)} kg`}
                  aria-label={`${formatMonth(month.yearMonth)}，淨進氣 ${formatNumber(month.netKg)} 公斤`}
                >
                  <span className="gas-intake-bar__value">{month.netKg > 0 ? formatNumber(month.netKg, 0) : '0'}</span>
                  <span className="gas-intake-bar__track"><span style={{ height: `${barHeight}%` }} /></span>
                  <span className="gas-intake-bar__label">{monthShortLabel(month.yearMonth)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="gas-intake-spec-card">
          <div className="gas-intake-section-title">
            <strong>本月進氣規格</strong>
            <span>{report.current.cylinderCount.toLocaleString()} 桶</span>
          </div>
          <div className="gas-intake-spec-list">
            {GAS_SPECS.map(spec => {
              const quantity = report.current.quantityBySpec[spec] || 0;
              return (
                <div key={spec}>
                  <span>{spec} kg</span>
                  <strong>{quantity.toLocaleString()} 桶</strong>
                  <small>{formatNumber(quantity * spec, 0)} kg</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="table-responsive gas-intake-history">
        <table className="data-table">
          <thead>
            <tr>
              <th>月份</th>
              <th>淨進氣量</th>
              <th>毛進氣量</th>
              <th>殘氣扣除</th>
              <th>進氣金額</th>
              <th>平均單價</th>
              <th>進氣天數</th>
              <th>進氣桶數</th>
            </tr>
          </thead>
          <tbody>
            {report.months.length === 0 ? (
              <tr><td colSpan="8" className="gas-intake-empty">目前沒有瓦斯進氣資料</td></tr>
            ) : report.months.map(month => (
              <tr
                key={month.yearMonth}
                className={month.yearMonth === report.selectedMonth ? 'gas-intake-history__selected' : ''}
                onClick={() => setSelectedMonth(month.yearMonth)}
              >
                <td><button type="button" className="gas-intake-month-link" onClick={() => setSelectedMonth(month.yearMonth)}>{formatMonth(month.yearMonth)}</button></td>
                <td><strong>{formatNumber(month.netKg)} kg</strong></td>
                <td>{formatNumber(month.grossKg)} kg</td>
                <td>{formatNumber(month.residualKg)} kg</td>
                <td>{formatCurrency(month.amount)}</td>
                <td>{formatCurrency(month.averageCostPerKg)} / kg</td>
                <td>{month.intakeDays.toLocaleString()} 天</td>
                <td>{month.cylinderCount.toLocaleString()} 桶</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
