const STRICT_AMOUNT_PATTERN = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;

export const parseTransactionAmount = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, value: null };
  }

  if (typeof value !== 'string') return { ok: false, value: null };
  const trimmed = value.trim();
  if (!trimmed || !STRICT_AMOUNT_PATTERN.test(trimmed)) return { ok: false, value: null };

  const amount = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(amount) ? { ok: true, value: amount } : { ok: false, value: null };
};

export const validateStateTransactionAmounts = (state = {}) => {
  for (const field of ['incomes', 'expenses']) {
    const rows = Array.isArray(state[field]) ? state[field] : [];
    for (const row of rows) {
      if (typeof row?.amount !== 'number' || !Number.isFinite(row.amount)) {
        return {
          ok: false,
          error: `${field === 'incomes' ? '收入' : '支出'}資料 ${row?.id || '(無 ID)'} 的金額必須是有效數字。`
        };
      }
    }
  }
  return { ok: true };
};
