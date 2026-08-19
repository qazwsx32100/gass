import { redactMonitoringText } from './monitoringSanitizer.js';

export const getSafeErrorSummary = (error) => {
  const name = String(error?.name || 'Error').slice(0, 60);
  const message = redactMonitoringText(error?.message || error || '未知的前台錯誤').slice(0, 300);
  return `${name}: ${message}`;
};

export const getErrorReference = (error) => {
  const source = `${error?.name || 'Error'}:${error?.message || error || 'unknown'}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ERP-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
};
