// Simple in-memory sliding-window rate limiter (single server process).
// hit(key) records an attempt; blocked(key) says whether the limit is reached.
const buckets = globalThis._mmRate ?? new Map();
globalThis._mmRate = buckets;

export function limiter({ max, windowMs }) {
  const prune = (k) => {
    const now = Date.now(), arr = (buckets.get(k) || []).filter((t) => now - t < windowMs);
    arr.length ? buckets.set(k, arr) : buckets.delete(k); return arr;
  };
  return {
    blocked: (k) => prune(k).length >= max,
    hit: (k) => { const arr = prune(k); arr.push(Date.now()); buckets.set(k, arr); },
    reset: (k) => buckets.delete(k),
    undo: (k) => { const arr = buckets.get(k); if (arr?.length) arr.pop(); },
    retryAfter: (k) => { const arr = prune(k); return arr.length ? Math.ceil((windowMs - (Date.now() - arr[0])) / 1000) : 0; },
  };
}

export const clientIp = (req) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
