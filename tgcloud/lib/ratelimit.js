// ---------------------------------------------------------------------------
// lib/ratelimit.js — lightweight per-user sliding-window rate limiter.
// Protects the bot against button-spam / command floods (anti-abuse, Gate 4):
// pure in-memory, no persistence — worst case after a cold start the window
// resets, which is acceptable for abuse mitigation.
// ---------------------------------------------------------------------------
const buckets = new Map();   // key -> array of timestamps (ms)
let lastSweep = Date.now();

function sweep(now) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, arr] of buckets) {
    if (!arr.length || now - arr[arr.length - 1] > 120_000) buckets.delete(k);
  }
}

/**
 * @param {string|number} key   usually the Telegram user id
 * @param {number} limit        max hits inside the window
 * @param {number} windowMs     window size in ms
 * @returns {boolean} true = allowed, false = rate-limited
 */
export function allow(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  sweep(now);
  const k = String(key);
  const arr = buckets.get(k) || [];
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= limit) return false;
  arr.push(now);
  buckets.set(k, arr);
  return true;
}
