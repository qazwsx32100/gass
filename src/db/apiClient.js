const DEFAULT_REMOTE_API_BASE_URL = 'https://erp-weld-three-96.vercel.app';

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

export const apiFetch = (path, options = {}) => fetch(apiUrl(path), options);
