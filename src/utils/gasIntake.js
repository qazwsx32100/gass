const GAS_SPECS = [50, 20, 16, 10, 4];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isYearMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

const previousYearMonth = (yearMonth) => {
  if (!isYearMonth(yearMonth)) return '';
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const normalizeGasPurchase = (purchase = {}) => {
  const quantityBySpec = Object.fromEntries(
    GAS_SPECS.map(spec => [spec, toNumber(purchase[`qty${spec}kg`])])
  );
  const calculatedGrossKg = GAS_SPECS.reduce(
    (sum, spec) => sum + quantityBySpec[spec] * spec,
    0
  );
  const grossKg = purchase.grossKg === '' || purchase.grossKg === null || purchase.grossKg === undefined
    ? calculatedGrossKg
    : toNumber(purchase.grossKg);
  const calculatedResidualKg = GAS_SPECS.reduce(
    (sum, spec) => sum + toNumber(purchase[`gas${spec}kg`]),
    0
  );
  const residualKg = purchase.totalGasKg === '' || purchase.totalGasKg === null || purchase.totalGasKg === undefined
    ? calculatedResidualKg
    : toNumber(purchase.totalGasKg);
  const netKg = purchase.totalKg === '' || purchase.totalKg === null || purchase.totalKg === undefined
    ? Math.max(0, grossKg - residualKg)
    : toNumber(purchase.totalKg);

  return {
    date: String(purchase.date || ''),
    yearMonth: String(purchase.date || '').slice(0, 7),
    grossKg,
    residualKg,
    netKg,
    amount: toNumber(purchase.amount),
    quantityBySpec
  };
};

const emptyMonth = (yearMonth) => ({
  yearMonth,
  recordCount: 0,
  intakeDays: 0,
  grossKg: 0,
  residualKg: 0,
  netKg: 0,
  amount: 0,
  averageCostPerKg: 0,
  averageKgPerIntakeDay: 0,
  cylinderCount: 0,
  quantityBySpec: Object.fromEntries(GAS_SPECS.map(spec => [spec, 0]))
});

export const summarizeMonthlyGasIntake = (purchases = []) => {
  const grouped = new Map();

  purchases.map(normalizeGasPurchase).forEach((purchase) => {
    if (!isYearMonth(purchase.yearMonth)) return;
    if (!grouped.has(purchase.yearMonth)) {
      grouped.set(purchase.yearMonth, {
        ...emptyMonth(purchase.yearMonth),
        dates: new Set()
      });
    }

    const month = grouped.get(purchase.yearMonth);
    month.recordCount += 1;
    if (purchase.date) month.dates.add(purchase.date);
    month.grossKg += purchase.grossKg;
    month.residualKg += purchase.residualKg;
    month.netKg += purchase.netKg;
    month.amount += purchase.amount;
    GAS_SPECS.forEach((spec) => {
      month.quantityBySpec[spec] += purchase.quantityBySpec[spec];
      month.cylinderCount += purchase.quantityBySpec[spec];
    });
  });

  return [...grouped.values()]
    .map((month) => {
      const intakeDays = month.dates.size;
      const { dates, ...summary } = month;
      void dates;
      return {
        ...summary,
        intakeDays,
        averageCostPerKg: month.netKg > 0 ? month.amount / month.netKg : 0,
        averageKgPerIntakeDay: intakeDays > 0 ? month.netKg / intakeDays : 0
      };
    })
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
};

export const getMonthlyGasIntakeView = (purchases = [], selectedYearMonth = '') => {
  const months = summarizeMonthlyGasIntake(purchases);
  const selectedMonth = isYearMonth(selectedYearMonth)
    ? selectedYearMonth
    : months[0]?.yearMonth || new Date().toISOString().slice(0, 7);
  const current = months.find(month => month.yearMonth === selectedMonth) || emptyMonth(selectedMonth);
  const previousMonth = previousYearMonth(selectedMonth);
  const previous = months.find(month => month.yearMonth === previousMonth) || emptyMonth(previousMonth);
  const changeKg = current.netKg - previous.netKg;
  const changePercent = previous.netKg > 0 ? (changeKg / previous.netKg) * 100 : null;

  return { months, selectedMonth, current, previous, changeKg, changePercent };
};

export const buildGasIntakeTimeline = (purchases = [], anchorYearMonth = '', count = 12) => {
  const months = summarizeMonthlyGasIntake(purchases);
  const lookup = new Map(months.map(month => [month.yearMonth, month]));
  let cursor = isYearMonth(anchorYearMonth)
    ? anchorYearMonth
    : months[0]?.yearMonth || new Date().toISOString().slice(0, 7);
  const timeline = [];

  for (let index = 0; index < Math.max(1, count); index += 1) {
    timeline.unshift(lookup.get(cursor) || emptyMonth(cursor));
    cursor = previousYearMonth(cursor);
  }

  return timeline;
};

export { GAS_SPECS };
