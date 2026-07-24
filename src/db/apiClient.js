import { captureClientException, captureClientMessage } from '../monitoring';

const DEFAULT_REMOTE_API_BASE_URL = 'https://erp-weld-three-96.vercel.app';
const DEFAULT_API_TIMEOUT_MS = 25000;
const RETRYABLE_STATUSES = new Set([408, 502, 503, 504]);

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const resolveApiBaseUrl = ({ configuredUrl = '', protocol = '' } = {}) => {
  const configured = trimTrailingSlash(configuredUrl);
  if (configured) return configured;

  const isPackagedApp = protocol === 'file:' || protocol === 'capacitor:';
  return isPackagedApp ? DEFAULT_REMOTE_API_BASE_URL : '';
};

export const getApiBaseUrl = () => {
  const configuredUrl = import.meta.env?.VITE_API_BASE_URL || '';
  const protocol = typeof window === 'undefined' ? '' : window.location?.protocol || '';
  return resolveApiBaseUrl({ configuredUrl, protocol });
};

export const apiUrl = (path) => {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
};

export const apiFetch = async (path, options = {}) => {
  const endpoint = String(path || '').split('?')[0] || '/';
  const method = String(options.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 3 : 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const callerSignal = options.signal;
    let timedOut = false;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DEFAULT_API_TIMEOUT_MS);

    try {
      const response = await fetch(apiUrl(path), { ...options, signal: controller.signal });
      if (attempt < maxAttempts && RETRYABLE_STATUSES.has(response.status)) {
        await new Promise(resolve => window.setTimeout(resolve, attempt * 500));
        continue;
      }
      if (response.status >= 500) {
        captureClientMessage('ERP API request failed', {
          tags: { source: 'api-client', endpoint, method, status: response.status }
        });
      }
      return response;
    } catch (error) {
      if (attempt < maxAttempts && !callerSignal?.aborted) {
        await new Promise(resolve => window.setTimeout(resolve, 300));
        continue;
      }
      const reportedError = timedOut
        ? new Error(`API request timed out after ${DEFAULT_API_TIMEOUT_MS}ms.`)
        : error;
      captureClientException(reportedError, {
        tags: {
          source: 'api-client',
          endpoint,
          method,
          failure: timedOut ? 'timeout' : 'network'
        }
      });
      throw reportedError;
    } finally {
      window.clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw new Error('API request failed.');
};
