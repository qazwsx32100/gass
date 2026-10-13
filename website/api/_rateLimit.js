export const createBoundedRateLimiter = ({
  windowMs,
  maxEntries = 5000,
  sweepIntervalMs = 60_000,
  now = () => Date.now()
}) => {
  const entries = new Map();
  let lastSweepAt = 0;

  const prune = (timestamp) => {
    if (timestamp - lastSweepAt >= sweepIntervalMs) {
      for (const [key, entry] of entries) {
        if (entry.resetAt <= timestamp) entries.delete(key);
      }
      lastSweepAt = timestamp;
    }

    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  };

  const check = (buckets = []) => {
    const timestamp = now();
    prune(timestamp);
    let limited = false;

    for (const { key, max } of buckets) {
      const previous = entries.get(key);
      const entry = !previous || previous.resetAt <= timestamp
        ? { count: 1, resetAt: timestamp + windowMs }
        : { count: previous.count + 1, resetAt: previous.resetAt };

      entries.delete(key);
      entries.set(key, entry);
      if (entry.count > max) limited = true;
    }

    prune(timestamp);
    return limited;
  };

  const clear = (keys = []) => {
    keys.forEach(key => entries.delete(key));
  };

  return {
    check,
    clear,
    size: () => entries.size
  };
};
