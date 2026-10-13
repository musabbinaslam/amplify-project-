const { redisClient } = require('../config/redis');

/**
 * Two-level read cache for expensive GET endpoints.
 * L1 is per-process (absorbs bursts); L2 is Redis, shared across PM2 instances.
 * Namespaces are invalidated by bumping a version, so stale keys simply age out.
 */

const L1_MAX_ENTRIES = 500;
const L1_MAX_TTL_MS = 10_000;
const VERSION_TTL_MS = 5_000;
const MAX_L2_BYTES = 900_000;

const l1 = new Map();
const inflight = new Map();
const versions = new Map();

function l1Get(key) {
  const hit = l1.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    l1.delete(key);
    return undefined;
  }
  return hit.value;
}

function l1Set(key, value, ttlMs) {
  l1.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (l1.size > L1_MAX_ENTRIES) l1.delete(l1.keys().next().value);
}

async function namespaceVersion(ns) {
  const local = versions.get(ns);
  if (local && local.expiresAt > Date.now()) return local.value;
  let value = '0';
  try {
    value = (await redisClient.get(`rcv:${ns}`)) || '0';
  } catch {
    value = local?.value || '0';
  }
  versions.set(ns, { value, expiresAt: Date.now() + VERSION_TTL_MS });
  return value;
}

/**
 * @param {string} ns - invalidation namespace, e.g. 'callMetrics'
 * @param {string} key - unique key within the namespace (include every input that changes the result)
 * @param {number} ttlSec
 * @param {() => Promise<any>} fn - loader; its result must be JSON-serialisable
 * @returns {Promise<{ value: any, hit: boolean, ageMs: number }>}
 */
async function cached(ns, key, ttlSec, fn) {
  const version = await namespaceVersion(ns);
  const fullKey = `rc:${ns}:${version}:${key}`;

  const local = l1Get(fullKey);
  if (local) return { value: local.value, hit: true, ageMs: Date.now() - local.at };

  if (inflight.has(fullKey)) return inflight.get(fullKey);

  const run = (async () => {
    try {
      const raw = await redisClient.get(fullKey);
      if (raw) {
        const entry = JSON.parse(raw);
        l1Set(fullKey, entry, Math.min(ttlSec * 1000, L1_MAX_TTL_MS));
        return { value: entry.value, hit: true, ageMs: Date.now() - entry.at };
      }
    } catch (err) {
      console.warn('[readCache] L2 read failed:', err.message);
    }

    const value = await fn();
    const entry = { value, at: Date.now() };
    l1Set(fullKey, entry, Math.min(ttlSec * 1000, L1_MAX_TTL_MS));
    try {
      const serialised = JSON.stringify(entry);
      if (serialised.length <= MAX_L2_BYTES) {
        await redisClient.set(fullKey, serialised, { EX: ttlSec });
      }
    } catch (err) {
      console.warn('[readCache] L2 write failed:', err.message);
    }
    return { value, hit: false, ageMs: 0 };
  })();

  inflight.set(fullKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(fullKey);
  }
}

/** Invalidate every key in a namespace (all instances pick it up within VERSION_TTL_MS). */
async function invalidateNamespace(ns) {
  const value = String(Date.now());
  versions.set(ns, { value, expiresAt: Date.now() + VERSION_TTL_MS });
  for (const key of l1.keys()) {
    if (key.startsWith(`rc:${ns}:`)) l1.delete(key);
  }
  try {
    await redisClient.set(`rcv:${ns}`, value, { EX: 7 * 24 * 3600 });
  } catch (err) {
    console.warn('[readCache] invalidate failed:', err.message);
  }
}

function stableKey(obj = {}) {
  const normalized = {};
  Object.keys(obj).sort().forEach((k) => {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') normalized[k] = String(obj[k]);
  });
  return JSON.stringify(normalized);
}

const lastSoftInvalidation = new Map();

/**
 * Invalidate at most once per `minIntervalMs` per process. For high-frequency
 * writes (call completion) where a burst should cost one cache rebuild, not N.
 */
function invalidateNamespaceSoon(ns, minIntervalMs = 15_000) {
  const now = Date.now();
  if (now - (lastSoftInvalidation.get(ns) || 0) < minIntervalMs) return;
  lastSoftInvalidation.set(ns, now);
  invalidateNamespace(ns).catch(() => {});
}

module.exports = { cached, invalidateNamespace, invalidateNamespaceSoon, stableKey };
