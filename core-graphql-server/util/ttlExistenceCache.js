'use strict';

const _ = require('lodash');

/**
 * Two-tier object-existence cache for the presigner's HEAD-check hot path.
 *
 * server.json collapses every logical bucket onto one physical OCI name, so the
 * presigner's `hasFallbackGroup` is true for ~all primary URIs: each sign does a
 * primary HEAD plus, on a miss, M parallel fallback HEADs. A high-fanout list
 * view of N objects would otherwise fire N..N*M synchronous object-store HEADs
 * on the signing hot path. Caching existence per (bucket,key) collapses
 * *repeated* signs of the same key down to one HEAD per key per window.
 *
 * L1 is this per-process Map (fast, no hop, but each of the 30+ pods keeps its
 * own — so it only catches ~1/N of cross-request repeats). An optional L2 store
 * (a shared cache, e.g. redis) pools existence results across the whole fleet:
 * a HEAD probed by one pod is reused by every other. Lookup order is
 * L1 → L2 → `fn` (the real HEAD); a definitive boolean is written back to both.
 *
 * Only a definitive boolean is cached — a transient null (HEAD error) is never
 * cached, so errors are retried. The short L1 TTL bounds the window where an
 * object uploaded right after a negative probe is briefly mis-resolved; the L2
 * store's own TTL bounds the fleet-wide window. @sminkov — VE-24702
 *
 * @param {Object}   opts
 * @param {number}   opts.ttlMs        L1 entry lifetime in ms
 * @param {number}   [opts.maxEntries] cap on distinct L1 keys before pruning
 * @param {Object}   [opts.l2]         shared L2 store; MUST be fail-open (never throw)
 * @param {(key: string) => Promise<boolean|null>} [opts.l2.get] boolean on hit, null on miss
 * @param {(key: string, value: boolean) => Promise<void>} [opts.l2.set]
 * @param {Function} [opts.onMetric]   (result: 'l1_hit'|'l2_hit'|'origin') => void
 * @param {Function} [opts.now]        clock (injectable for tests), defaults to Date.now
 */
module.exports = function createTtlExistenceCache(opts = {}) {
  const ttlMs = opts.ttlMs;
  const maxEntries = _.isFinite(opts.maxEntries) ? opts.maxEntries : 10000;
  const onMetric = typeof opts.onMetric === 'function' ? opts.onMetric : null;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const l2 =
    opts.l2 &&
    typeof opts.l2.get === 'function' &&
    typeof opts.l2.set === 'function'
      ? opts.l2
      : null;

  const map = new Map(); // key -> { value, expiresAt }

  // Drop expired entries; if still at the cap (all entries live), clear
  // wholesale — these are short-lived existence hints that are cheap to reprobe.
  function prune() {
    const t = now();
    for (const [k, v] of map) {
      if (v.expiresAt <= t) map.delete(k);
    }
    if (map.size >= maxEntries) {
      map.clear();
    }
  }

  function storeL1(key, value) {
    if (map.size >= maxEntries) {
      prune();
    }
    map.set(key, { value, expiresAt: now() + ttlMs });
  }

  /**
   * Return a fresh cached boolean without invoking `fn`; otherwise consult L2,
   * then call `fn`, caching a definitive boolean into both tiers.
   *
   * @param {string} key
   * @param {() => Promise<boolean|null>} fn
   * @returns {Promise<boolean|null>}
   */
  async function wrap(key, fn) {
    const cached = map.get(key);
    if (cached && cached.expiresAt > now()) {
      if (onMetric) onMetric('l1_hit');
      return cached.value;
    }
    if (cached) {
      map.delete(key);
    }

    if (l2) {
      const l2Value = await l2.get(key);
      if (l2Value === true || l2Value === false) {
        if (onMetric) onMetric('l2_hit');
        storeL1(key, l2Value);
        return l2Value;
      }
    }

    if (onMetric) onMetric('origin');
    const value = await fn();
    if (value === true || value === false) {
      storeL1(key, value);
      if (l2) await l2.set(key, value);
    }
    return value;
  }

  return { wrap, size: () => map.size, _map: map };
};
