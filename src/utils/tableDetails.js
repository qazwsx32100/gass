export const compactDetailText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const normalizeDetailValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return compactDetailText(value) || '—';
};

export const parseDetailMetadata = (detailJson) => {
  if (!detailJson) return [];
  try {
    const parsed = JSON.parse(detailJson);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          label: compactDetailText(item.label) || '其他資料',
          value: normalizeDetailValue(item.value)
        }));
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([label, value]) => ({
        label: compactDetailText(label) || '其他資料',
        value: normalizeDetailValue(value)
      }));
    }
  } catch {
    return [];
  }
  return [];
};

const isActionColumn = (label) => ['操作', '動作'].includes(compactDetailText(label));

export const buildTableDetail = ({ headers = [], cells = [], extraFields = [], title = '', context = '' }) => {
  const fields = cells
    .map((value, index) => ({
      label: compactDetailText(headers[index]) || `欄位 ${index + 1}`,
      value: normalizeDetailValue(value)
    }))
    .filter(field => !isActionColumn(field.label) && (field.label || field.value !== '—'));

  const labels = new Set(fields.map(field => field.label));
  extraFields.forEach(field => {
    const label = compactDetailText(field?.label) || '其他資料';
    if (!labels.has(label) && !isActionColumn(label)) {
      fields.push({ label, value: normalizeDetailValue(field?.value) });
      labels.add(label);
    }
  });

  const firstValue = fields.find(field => field.value !== '—')?.value || '資料明細';
  return {
    title: compactDetailText(title) || firstValue,
    context: compactDetailText(context),
    fields
  };
};
