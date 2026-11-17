import { fetchAppStateMeta } from './_auth.js';

const PROBE_TTL_MS = 60_000;
let cachedProbe = null;
let probeInFlight = null;

async function probeDatabase() {
  try {
    // Existing read-only RPC: never transfer the financial app_state for a health check.
    // A health probe is not an account session; null identities grant no account access.
    const meta = await fetchAppStateMeta({ userId: null, deviceId: null });
    const offline = meta?.isOfflineSnapshot === true;
    const reachable = !offline && typeof meta?.has_state === 'boolean';
    const hasState = reachable && meta.has_state === true;
    return {
      reachable,
      ready: hasState,
      hasState,
      source: offline ? 'offline_snapshot' : reachable ? 'database' : 'unavailable',
      reason: offline ? 'database_unavailable' : !reachable ? 'invalid_metadata' : !hasState ? 'state_missing' : null,
      checkedAtEpoch: Date.now(),
    };
  } catch {
    // Cache failed probes too, so an outage does not trigger a request storm.
    return { reachable: false, ready: false, hasState: false, source: 'unavailable',
      reason: 'probe_failed', checkedAtEpoch: Date.now() };
  }
}

export async function getDatabaseReadiness() {
  if (cachedProbe && Date.now() - cachedProbe.checkedAtEpoch < PROBE_TTL_MS) {
    return { ...cachedProbe, cached: true, ageMs: Math.max(0, Date.now() - cachedProbe.checkedAtEpoch) };
  }
  const joined = Boolean(probeInFlight);
  if (!probeInFlight) {
    probeInFlight = probeDatabase().then(probe => {
      cachedProbe = probe;
      return probe;
    }).finally(() => { probeInFlight = null; });
  }
  const probe = await probeInFlight;
  return { ...probe, cached: joined, ageMs: Math.max(0, Date.now() - probe.checkedAtEpoch) };
}
