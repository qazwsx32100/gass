export const SL_TOOLS = ['sl.customers.search', 'sl.orders.search', 'sl.money.search', 'sl.monthly-summary'];
export function parseSLFilter(tool, query) {
    if (!SL_TOOLS.includes(tool) || typeof query !== 'string' || !query.trim() || query.length > 100)
        throw Error('SL_QUERY_INVALID');
    const q = query.normalize('NFKC').trim();
    if (tool === 'sl.customers.search')
        return { text: q };
    if (tool === 'sl.monthly-summary') {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(q))
            throw Error('SL_QUERY_INVALID');
        return { period: q };
    }
    const match = q.match(/^(?:(20\d{2}-(?:0[1-9]|1[0-2]))(?: )?)?(?:customer:([0-9]{1,20}))?$/);
    if (!match || (!match[1] && !match[2]))
        throw Error('SL_QUERY_INVALID');
    return { period: match[1], customerId: match[2] };
}
export function parseSLQuery(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error('SL_QUERY_INVALID');
    const v = value;
    if (Object.keys(v).length !== 4 || !['tool', 'query', 'snapshotId', 'page'].every(k => Object.hasOwn(v, k)) || !SL_TOOLS.includes(v.tool) || typeof v.query !== 'string' || typeof v.snapshotId !== 'string' || !/^[a-f0-9]{64}$/.test(v.snapshotId) || !Number.isSafeInteger(v.page) || Number(v.page) < 1 || Number(v.page) > 20000)
        throw Error('SL_QUERY_INVALID');
    parseSLFilter(v.tool, v.query);
    return { tool: v.tool, query: v.query, snapshotId: v.snapshotId, page: Number(v.page) };
}
