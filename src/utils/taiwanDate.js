export const getTaiwanDateString = (date = new Date()) => {
  let d = date;
  if (typeof date === 'string' || typeof date === 'number') {
    d = new Date(date);
  }
  if (isNaN(d?.getTime?.())) d = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const getTaiwanYearMonthString = (date = new Date()) => {
  return getTaiwanDateString(date).slice(0, 7);
};
