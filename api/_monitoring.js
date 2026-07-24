import {
  sanitizeMonitoringValue,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent
} from '../src/utils/monitoringSanitizer.js';

let sentryModulePromise = null;

const getSentry = () => {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return Promise.resolve(null);
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/node').then(Sentry => {
      const parsedRate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05');
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || 'production',
        release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
        sendDefaultPii: false,
        tracesSampleRate: Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 1 ? parsedRate : 0.05,
        beforeSend: sanitizeSentryEvent,
        beforeBreadcrumb: sanitizeSentryBreadcrumb
      });
      Sentry.setTag('application', 'gass-erp-api');
      return Sentry;
    }).catch(error => {
      console.error('Server error monitoring initialization failed', error);
      sentryModulePromise = null;
      return null;
    });
  }
  return sentryModulePromise;
};

export const captureServerException = async (error, context = {}) => {
  const Sentry = await getSentry();
  if (!Sentry) return false;

  const safeContext = sanitizeMonitoringValue(context);
  Sentry.withScope(scope => {
    Object.entries(safeContext.tags || {}).forEach(([key, value]) => scope.setTag(key, String(value)));
    if (safeContext.extra) scope.setContext('erp', safeContext.extra);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });

  await Sentry.flush(1500);
  return true;
};
