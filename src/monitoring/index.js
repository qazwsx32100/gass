const isConfigured = () => Boolean(String(import.meta.env.VITE_SENTRY_DSN || '').trim());

let sentryModulePromise = null;

const loadSentry = () => {
  if (!isConfigured()) return Promise.resolve(null);
  if (!sentryModulePromise) {
    sentryModulePromise = import('./sentryClient.js')
      .then(module => {
        module.initSentryClient();
        return module;
      })
      .catch(error => {
        console.error('Error monitoring initialization failed', error);
        sentryModulePromise = null;
        return null;
      });
  }
  return sentryModulePromise;
};

export const initClientMonitoring = () => {
  if (!isConfigured()) return;
  const start = () => void loadSentry();
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 1500 });
  } else {
    window.setTimeout(start, 250);
  }
};

export const captureClientException = (error, context = {}) => {
  if (!isConfigured()) return;
  void loadSentry().then(module => module?.captureSentryClientException(error, context));
};

export const captureClientMessage = (message, context = {}) => {
  if (!isConfigured()) return;
  void loadSentry().then(module => module?.captureSentryClientMessage(message, context));
};

export const setMonitoringUser = (user) => {
  if (!isConfigured()) return;
  void loadSentry().then(module => module?.setSentryClientUser(user));
};

export const setMonitoringContext = (context) => {
  if (!isConfigured()) return;
  void loadSentry().then(module => module?.setSentryClientContext(context));
};
