const RECOVERY_WINDOW_MS = 60_000;

export const isLazyImportLoadError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('error loading dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('chunkloaderror')
    || message.includes('loading chunk');
};

export const lazyImportWithRecovery = async (loader, pageName) => {
  const recoveryKey = `gass_lazy_import_recovery:${pageName}`;

  try {
    const loadedModule = await loader();
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(recoveryKey);
    }
    return loadedModule;
  } catch (error) {
    if (!isLazyImportLoadError(error) || typeof window === 'undefined') throw error;

    const now = Date.now();
    const lastRecovery = Number(window.sessionStorage?.getItem(recoveryKey) || 0);
    if (lastRecovery && now - lastRecovery < RECOVERY_WINDOW_MS) throw error;

    window.sessionStorage?.setItem(recoveryKey, String(now));
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('_app_refresh', String(now));
    window.location.replace(nextUrl.toString());

    // Navigation replaces the document. Keep React Suspense active while it happens.
    return new Promise(() => {});
  }
};
