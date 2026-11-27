import { createHash } from 'node:crypto';
import { parseSLFilter } from './_sl-query.js';
const normalize = (s) => s.normalize('NFKC').trim().toLowerCase();
const month = (s) => { const m = s.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/); return m ? m[1] + '-' + m[2].padStart(2, '0') : null; };
export async function querySLSnapshot(manifest, readRows, input) {
    const filter = parseSLFilter(input.tool, input.query), m = manifest;
    if (input.snapshotId && input.snapshotId !== m.snapshotId)
        throw Error('SL_SNAPSHOT_CHANGED');
    if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 20000)
        throw Error('SL_QUERY_INVALID');
    const limitations = ['來源為盛隆 Google Drive 三檔；查詢時自動檢查更新，正常檢查間隔一小時，資料截至 ' + m.dataThrough + '，不是即時 ERP。', '收款狀態及 F/T 科目代碼尚未驗證；金流對應出單碼未能直接對上訂單，不合併計算營收、毛利或淨利。'];
    if (filter.period) {
        const missing = m.files.filter(f => f.dataset === 'money' && f.year === 'unknown').reduce((n, f) => n + f.rows, 0);
        if (missing)
            limitations.push(`金流有 ${missing} 筆入帳日期缺漏，未納入月份篩選。`);
    }
    if(m.sync?.state==='stale')limitations.push('雲端檢查或更新未成功，沿用上次已驗證來源。');
    let columns = [], selected = [], metrics = [];
    if (input.tool === 'sl.monthly-summary') {
        for (const dataset of ['orders', 'money']) {
            const c = m.datasets[dataset].columns, date = c.indexOf(dataset === 'orders' ? '出貨日期' : '入帳日期'), data = await readRows(dataset, filter.period);
            const matches = data.filter(r => month(r[date]) === filter.period);
            metrics.push({ label: filter.period + ' ' + (dataset === 'orders' ? '訂單筆數' : '金流筆數'), value: matches.length });
        }
        columns = ['資料集', '完整快照筆數'];
        selected = Object.values(m.datasets).map(d => [d.name, String(d.rows)]);
        limitations.push('這是訂單與金流來源摘要，不是會計損益表；若需損益，請指定 ERP 月損益表。');
    }
    else {
        const dataset = input.tool === 'sl.customers.search' ? 'customers' : input.tool === 'sl.orders.search' ? 'orders' : 'money';
        columns = m.datasets[dataset].columns;
        const source = await readRows(dataset, filter.period), customer = columns.indexOf('客戶編號'), date = columns.indexOf(dataset === 'orders' ? '出貨日期' : '入帳日期');
        selected = source.filter(row => {
            if (dataset === 'customers') {
                const q = normalize(filter.text);
                if (q === '全部')
                    return true;
                if (/^\d{1,6}$/.test(q))
                    return row[customer] === q;
                if (/^\d{7,}$/.test(q))
                    return row[columns.indexOf('客戶電話')].replace(/\D/g, '').includes(q);
                return ['客戶名稱', '客戶電話', '客戶地址'].some(k => normalize(row[columns.indexOf(k)]).includes(q));
            }
            return (!filter.period || month(row[date]) === filter.period) && (!filter.customerId || row[customer] === filter.customerId);
        });
    }
    const pageSize = 20, totalPages = Math.max(1, Math.ceil(selected.length / pageSize));
    if (input.page > totalPages)
        throw Error('SL_PAGE_OUT_OF_RANGE');
    const result = { mode: 'shenglong-sl-readonly', snapshotId: m.snapshotId, sourceAsOf: m.sourceAsOf, dataThrough: m.dataThrough, sync: m.sync, tool: input.tool, query: input.query, page: input.page, pageSize, totalPages, matchedCount: selected.length, columns, rows: selected.slice((input.page - 1) * pageSize, input.page * pageSize), metrics, limitations, evidenceHash: '', productionModified: false, simulated: false };
    result.evidenceHash = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    return result;
}
