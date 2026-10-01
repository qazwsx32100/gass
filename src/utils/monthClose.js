const optionalNumber = value => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const compareMonthlyBaseline = ({
  expectedRevenue,
  expectedExpenses,
  expectedReceivables,
  actualRevenue = 0,
  actualExpenses = 0,
  actualReceivables = 0
} = {}) => {
  const rows = [
    ['revenue', '營業收入', expectedRevenue, actualRevenue],
    ['expenses', '實際支出', expectedExpenses, actualExpenses],
    ['receivables', '未收款', expectedReceivables, actualReceivables]
  ].map(([key, label, expected, actual]) => {
    const normalizedExpected = optionalNumber(expected);
    const normalizedActual = Number(actual || 0);
    return {
      key,
      label,
      expected: normalizedExpected,
      actual: normalizedActual,
      difference: normalizedExpected === null ? null : normalizedActual - normalizedExpected,
      matched: normalizedExpected === null || normalizedActual === normalizedExpected
    };
  });

  return {
    rows,
    mismatchCount: rows.filter(row => !row.matched).length,
    hasBaseline: rows.some(row => row.expected !== null)
  };
};

export const getLatestRestoreDrillStatus = (drills = [], now = new Date(), maxAgeDays = 90) => {
  const passed = drills
    .filter(item => item?.result === 'passed' && item?.verifiedAt)
    .sort((a, b) => String(b.verifiedAt).localeCompare(String(a.verifiedAt)))[0];
  if (!passed) return { passed: false, recent: false, ageDays: null, drill: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(passed.verifiedAt).getTime()) / 86400000));
  return { passed: true, recent: ageDays <= maxAgeDays, ageDays, drill: passed };
};

export const validateRestoreDrill = (draft = {}) => {
  const errors = [];
  if (!String(draft.backupId || '').trim()) errors.push('備份編號');
  if (!String(draft.operator || '').trim()) errors.push('操作人');
  if (draft.result === 'passed') {
    const requiredChecks = [
      ['recordCountsVerified', '筆數驗證'],
      ['loginVerified', '登入驗證'],
      ['reportsVerified', '報表驗證'],
      ['rollbackVerified', '回復流程驗證']
    ];
    requiredChecks.forEach(([key, label]) => {
      if (draft[key] !== true) errors.push(label);
    });
  }
  return { valid: errors.length === 0, errors };
};
