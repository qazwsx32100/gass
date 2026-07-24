const SENSITIVE_KEY_PATTERN = /(password|passcode|secret|token|authorization|cookie|email|phone|mobile|identity|idnumber|deviceid|credential|privatekey|hash|salt)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY_PATTERN = /([?&](?:token|code|secret|password|email|deviceId)\s*=)[^&#]*/gi;

export const redactMonitoringText = (value) => String(value || '')
  .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
  .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
  .replace(SENSITIVE_QUERY_PATTERN, '$1[REDACTED]');

export const sanitizeMonitoringValue = (value, depth = 0) => {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactMonitoringText(value).slice(0, 2000);
  if (depth >= 5) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeMonitoringValue(item, depth + 1));
  }
  if (typeof value !== 'object') return String(value).slice(0, 2000);

  return Object.fromEntries(
    Object.entries(value).slice(0, 100).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeMonitoringValue(nestedValue, depth + 1)
    ])
  );
};

export const sanitizeSentryEvent = (event = {}) => {
  const cleaned = sanitizeMonitoringValue(event);

  if (cleaned.request) {
    delete cleaned.request.headers;
    delete cleaned.request.cookies;
    delete cleaned.request.data;
    delete cleaned.request.query_string;
    if (cleaned.request.url) cleaned.request.url = String(cleaned.request.url).split('?')[0];
  }

  if (cleaned.user) {
    cleaned.user = cleaned.user.id ? { id: String(cleaned.user.id).slice(0, 80) } : undefined;
  }

  return cleaned;
};

export const sanitizeSentryBreadcrumb = (breadcrumb = {}) => ({
  ...breadcrumb,
  message: breadcrumb.message ? redactMonitoringText(breadcrumb.message) : breadcrumb.message,
  data: breadcrumb.data ? sanitizeMonitoringValue(breadcrumb.data) : breadcrumb.data
});
