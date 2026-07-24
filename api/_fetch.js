export const fetchWithTimeout = async (input, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;

  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Upstream request timed out.'));
  }, timeoutMs);

  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Upstream request exceeded ${timeoutMs}ms.`);
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
};
