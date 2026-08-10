import { useEffect, useState } from 'react';

const compactText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export default function UniversalTableDetails() {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const openRowDetail = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-universal-detail]')) return;
      if (target.closest('button, a, input, select, textarea, label, [role="button"]')) return;

      const row = target.closest('tbody tr');
      if (!row || row.dataset.detailIgnore === 'true') return;

      const cells = Array.from(row.children).filter(cell => cell.tagName === 'TD');
      if (cells.length === 0 || cells.some(cell => cell.colSpan > 1)) return;

      const table = row.closest('table');
      const headers = table
        ? Array.from(table.querySelectorAll('thead tr:last-child th')).map(cell => compactText(cell.textContent))
        : [];
      const fields = cells
        .map((cell, index) => ({
          label: headers[index] || `欄位 ${index + 1}`,
          value: compactText(cell.textContent) || '—'
        }))
        .filter(field => field.label || field.value !== '—');

      if (fields.length === 0) return;
      const titleValue = fields.find(field => field.value && field.value !== '—')?.value || '資料明細';
      setDetail({
        title: row.dataset.detailTitle || titleValue,
        fields
      });
    };

    document.addEventListener('click', openRowDetail);
    return () => document.removeEventListener('click', openRowDetail);
  }, []);

  useEffect(() => {
    if (!detail) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setDetail(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [detail]);

  if (!detail) return null;

  return (
    <div
      data-universal-detail
      role="presentation"
      onClick={() => setDetail(null)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(15, 23, 42, 0.48)',
        backdropFilter: 'blur(5px)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="項目詳細資料"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '82vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '18px',
          border: '2px solid rgba(5, 178, 165, 0.22)',
          background: '#fff',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)'
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', paddingBottom: '14px', borderBottom: '1px solid rgba(5, 178, 165, 0.18)' }}>
          <div>
            <div style={{ color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 800 }}>項目詳細資料</div>
            <h3 style={{ margin: '5px 0 0', fontSize: '1.2rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{detail.title}</h3>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(null)} aria-label="關閉項目詳細資料">✕</button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginTop: '18px' }}>
          {detail.fields.map((field, index) => (
            <div key={`${field.label}-${index}`} style={{ padding: '13px 14px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid rgba(15, 23, 42, 0.07)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 700 }}>{field.label}</div>
              <div style={{ marginTop: '5px', color: 'var(--text-primary)', fontWeight: 750, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{field.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>關閉</button>
        </div>
      </section>
    </div>
  );
}
