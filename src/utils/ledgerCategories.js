const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildAccountLookup = (accounts = []) => new Map(
  accounts.filter(account => account?.code).map(account => [String(account.code), account])
);

const findParentAccount = (accountCode, accountLookup) => {
  const code = String(accountCode || '');
  if (!code) return null;
  const exact = accountLookup.get(code);
  if (!exact) return null;

  const parents = [...accountLookup.values()]
    .filter(account => {
      const parentCode = String(account.code || '');
      return parentCode.length >= 4 && parentCode.length < code.length && code.startsWith(parentCode);
    })
    .sort((a, b) => String(b.code).length - String(a.code).length);

  return parents[0] || exact;
};

const fallbackCategory = (entry) => {
  if (entry?.recognitionType === 'receivable_settlement') {
    if (entry.settlementCategory === 'monthly') return { key: 'settlement-monthly', label: '月結款收回' };
    if (entry.settlementCategory === 'current_debt') return { key: 'settlement-current-debt', label: '現結欠款收回' };
    return { key: 'settlement-receivable', label: '應收款收回' };
  }
  if (entry?.recognitionType === 'payable_settlement') {
    return { key: 'settlement-payable', label: '應付款結清' };
  }
  return { key: 'other', label: '其他' };
};

export const groupLedgerEntriesByCategory = ({
  entries = [],
  accounts = [],
  sourceRecords = []
} = {}) => {
  const accountLookup = buildAccountLookup(accounts);
  const sourceLookup = new Map(
    sourceRecords.filter(record => record?.id).map(record => [record.id, record])
  );
  const groups = new Map();

  entries.forEach((entry) => {
    const source = entry?.sourceId ? sourceLookup.get(entry.sourceId) : null;
    const accountCode = entry?.accountCode || source?.accountCode || '';
    const account = findParentAccount(accountCode, accountLookup);
    const fallback = fallbackCategory(entry);
    const key = account ? String(account.code) : fallback.key;
    const label = account?.name || fallback.label;

    if (!groups.has(key)) {
      groups.set(key, { key, label, accountCode: account?.code || '', amount: 0, count: 0, entries: [] });
    }
    const group = groups.get(key);
    group.amount += toNumber(entry?.amount);
    group.count += 1;
    group.entries.push(entry);
  });

  return [...groups.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'zh-Hant'));
};

export const entriesForCategory = (groups = [], categoryKey = '') => {
  if (!categoryKey) return groups.flatMap(group => group.entries);
  return groups.find(group => group.key === categoryKey)?.entries || [];
};
