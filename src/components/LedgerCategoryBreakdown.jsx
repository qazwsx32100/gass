import React from 'react';
import { Layers3, List } from 'lucide-react';

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString('zh-TW')}`;

export default function LedgerCategoryBreakdown({ groups = [], selectedKey = '', onSelect, tone = 'expense' }) {
  const totalAmount = groups.reduce((sum, group) => sum + Number(group.amount || 0), 0);
  const totalCount = groups.reduce((sum, group) => sum + Number(group.count || 0), 0);

  return (
    <section className={`ledger-category-breakdown ledger-category-breakdown--${tone}`}>
      <div className="ledger-category-breakdown__header">
        <div>
          <strong>大類別彙總</strong>
          <span>選擇類別可查看該類別明細</span>
        </div>
        {selectedKey && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect('')}>
            <List size={15} /> 全部明細
          </button>
        )}
      </div>

      <div className="ledger-category-grid">
        {groups.map(group => {
          const percentage = totalAmount > 0 ? (group.amount / totalAmount) * 100 : 0;
          const isSelected = selectedKey === group.key;
          return (
            <button
              type="button"
              key={group.key}
              className={`ledger-category-item ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onSelect(isSelected ? '' : group.key)}
            >
              <span className="ledger-category-item__icon"><Layers3 size={17} /></span>
              <span className="ledger-category-item__body">
                <span className="ledger-category-item__name">{group.label}</span>
                <strong>{formatCurrency(group.amount)}</strong>
                <small>{group.count} 筆 · {percentage.toFixed(1)}%</small>
              </span>
            </button>
          );
        })}
        {groups.length === 0 && <div className="ledger-category-empty">本月沒有可分類的資料</div>}
      </div>
      <div className="ledger-category-breakdown__total">共 {groups.length} 類、{totalCount} 筆，合計 {formatCurrency(totalAmount)}</div>
    </section>
  );
}
