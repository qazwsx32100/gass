import { useEffect, useRef, useState } from 'react';
import { buildTableDetail, compactDetailText, parseDetailMetadata } from '../utils/tableDetails';

const getTableContext = (table) => {
  if (!table) return '';
  const explicit = table.getAttribute('aria-label') || compactDetailText(table.querySelector('caption')?.textContent);
  if (explicit) return explicit;

  const container = table.closest('.modal-content, .card, section, main');
  return compactDetailText(
    container?.querySelector('.modal-title, .card-title, h1, h2, h3, [data-table-title]')?.textContent
  );
};

const isNativeDetailRow = (row) => (
  row.dataset.detailNative === 'true' || row.style.cursor === 'pointer'
);

const isEligibleRow = (row) => {
  if (!row || row.dataset.detailIgnore === 'true' || isNativeDetailRow(row)) return false;
  const cells = Array.from(row.children).filter(cell => cell.tagName === 'TD');
  return cells.length > 0 && !cells.some(cell => cell.colSpan > 1);
};

export default function UniversalTableDetails() {
  const [detail, setDetail] = useState(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    const openRowDetail = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-universal-detail]')) return;
      if (target.closest('button, a, input, select, textarea, label, [role="button"]')) return;

      const row = target.closest('tbody tr');
      if (!isEligibleRow(row)) return;

      const cells = Array.from(row.children).filter(cell => cell.tagName === 'TD');
      const table = row.closest('table');
      const headers = table
        ? Array.from(table.querySelectorAll('thead tr:last-child th')).map(cell => compactDetailText(cell.textContent))
        : [];
      const nextDetail = buildTableDetail({
        headers,
        cells: cells.map(cell => cell.textContent),
        extraFields: parseDetailMetadata(row.dataset.detailJson),
        title: row.dataset.detailTitle,
        context: getTableContext(table)
      });

      if (nextDetail.fields.length === 0) return;
      previousFocusRef.current = document.activeElement;
      setDetail(nextDetail);
    };

    const openRowDetailWithKeyboard = (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      const row = event.target instanceof Element ? event.target.closest('tbody tr') : null;
      if (!isEligibleRow(row) || event.target !== row) return;
      event.preventDefault();
      openRowDetail(event);
    };

    const prepareRows = (root = document) => {
      const rows = [
        ...(root instanceof Element && root.matches('.data-table tbody tr') ? [root] : []),
        ...(root.querySelectorAll?.('.data-table tbody tr') || [])
      ];
      rows.forEach(row => {
        if (isEligibleRow(row) && !row.hasAttribute('tabindex')) {
          row.tabIndex = 0;
          row.setAttribute('aria-label', '點擊或按 Enter 查看此筆詳細資料');
        }
      });
    };

    prepareRows();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof Element) prepareRows(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', openRowDetail);
    document.addEventListener('keydown', openRowDetailWithKeyboard);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', openRowDetail);
      document.removeEventListener('keydown', openRowDetailWithKeyboard);
    };
  }, []);

  useEffect(() => {
    if (!detail) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setDetail(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      previousFocusRef.current?.focus?.();
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
            <div style={{ color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 800 }}>{detail.context || '全平台項目明細'}</div>
            <h3 style={{ margin: '5px 0 0', fontSize: '1.2rem', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{detail.title}</h3>
          </div>
          <button ref={closeButtonRef} type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(null)} aria-label="關閉項目詳細資料">✕</button>
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
