export const findParentAccount = (account, accounts = []) => {
  if (!account) return null;
  const explicitParent = String(account.parentCode || '').trim();
  if (explicitParent) {
    const match = accounts.find(item => item.code === explicitParent && item.type === account.type);
    if (match) return match;
  }
  return accounts
    .filter(item => item.code !== account.code && item.type === account.type && String(account.code || '').startsWith(String(item.code || '')))
    .sort((a, b) => String(b.code).length - String(a.code).length)[0] || null;
};

export const getTopLevelAccount = (account, accounts = []) => {
  if (!account) return null;
  let current = account;
  const visited = new Set();
  while (current && !visited.has(current.code)) {
    visited.add(current.code);
    const parent = findParentAccount(current, accounts);
    if (!parent) return current;
    current = parent;
  }
  return account;
};

export const buildAccountGroups = (accounts = []) => {
  const sorted = [...accounts].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const groups = new Map();
  sorted.forEach(account => {
    const parent = getTopLevelAccount(account, sorted) || account;
    if (!groups.has(parent.code)) groups.set(parent.code, { parent, accounts: [] });
    groups.get(parent.code).accounts.push(account);
  });
  return [...groups.values()];
};
