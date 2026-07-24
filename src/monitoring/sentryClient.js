import * as Sentry from '@sentry/react';
import {
  sanitizeMonitoringValue,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent
} from '../utils/monitoringSanitizer.js';

let initialized = false;

const getSampleRate = () => {
  const parsed = Number.parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.05');
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.05;
};

export const initSentryClient = () => {
  if (initialized) return true;
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'production',
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: getSampleRate(),
    beforeSend: sanitizeSentryEvent,
    beforeBreadcrumb: sanitizeSentryBreadcrumb
  });
  Sentry.setTag('application', 'gass-erp');
  initialized = true;
  return true;
};

export const captureSentryClientException = (error, context = {}) => {
  if (!initSentryClient()) return null;
  return Sentry.withScope(scope => {
    const safeContext = sanitizeMonitoringValue(context);
    Object.entries(safeContext.tags || {}).forEach(([key, value]) => scope.setTag(key, String(value)));
    if (safeContext.extra) scope.setContext('erp', safeContext.extra);
    return Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
};

export const captureSentryClientMessage = (message, context = {}) => {
  if (!initSentryClient()) return null;
  return Sentry.withScope(scope => {
    const safeContext = sanitizeMonitoringValue(context);
    Object.entries(safeContext.tags || {}).forEach(([key, value]) => scope.setTag(key, String(value)));
    if (safeContext.extra) scope.setContext('erp', safeContext.extra);
    return Sentry.captureMessage(String(message), context.level || 'error');
  });
};

export const setSentryClientUser = (user) => {
  if (!initSentryClient()) return;
  Sentry.setUser(user?.id ? { id: String(user.id).slice(0, 80) } : null);
  Sentry.setTag('role', user?.role || 'anonymous');
};

export const setSentryClientContext = (context = {}) => {
  if (!initSentryClient()) return;
  const safeContext = sanitizeMonitoringValue(context);
  Sentry.setContext('erp', safeContext);
  Object.entries(safeContext).forEach(([key, value]) => {
    if (['string', 'number', 'boolean'].includes(typeof value)) Sentry.setTag(key, String(value));
  });
};
