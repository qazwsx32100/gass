export const getTopAmountEntries = (entries = [], limit = 3) => (
  [...entries]
    .filter(Boolean)
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, Math.max(0, limit))
);
