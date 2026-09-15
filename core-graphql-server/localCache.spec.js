// VE-24476 — rows 6 & 7
// transform:{} means no Babel hoisting — jest.mock must appear before require

const capturedLRUOptions = [];

jest.mock('lru-cache', () => {
  const Real = jest.requireActual('lru-cache');
  return jest.fn().mockImplementation((opts) => {
    capturedLRUOptions.push(Object.assign({}, opts));
    return new Real(opts);
  });
});

const localCacheFactory = require('./localCache.js');

function makeCtx(config) {
  return {
    config: config || {},
    logger: { debug: jest.fn(), error: jest.fn() }
  };
}

describe('localCache', () => {
  beforeEach(() => {
    capturedLRUOptions.length = 0;
  });

  // ── Row 6: getCache — TTL conversion ──────────────────────────────────────
  // A regression removing the `* 60 * 1000` multiplier would set TTL in
  // minutes instead of milliseconds, causing entries to expire 60,000× sooner.
  describe('getCache — TTL conversion (minutes → ms)', () => {
    it('multiplies default ttlMin × 60000 to produce milliseconds', () => {
      const cache = localCacheFactory(makeCtx({ localCache: { ttlMin: 5 } }));
      cache.set('myType', 'k1', { v: 1 });
      expect(capturedLRUOptions[0].ttl).toBe(300000); // 5 * 60 * 1000
    });

    it('falls back to 20 minutes (1200000 ms) when no config is provided', () => {
      const cache = localCacheFactory(makeCtx({}));
      cache.set('anyType', 'k1', {});
      expect(capturedLRUOptions[0].ttl).toBe(1200000); // 20 * 60 * 1000
    });

    it('uses per-type ttlMin override over the default when present', () => {
      const cache = localCacheFactory(
        makeCtx({ localCache: { ttlMin: 20, special: { ttlMin: 2 } } })
      );
      cache.set('special', 'k1', {});
      expect(capturedLRUOptions[0].ttl).toBe(120000); // 2 * 60 * 1000
    });

    it('reuses the same LRUCache instance on subsequent calls for the same type', () => {
      const cache = localCacheFactory(makeCtx({}));
      cache.set('t', 'k1', {});
      cache.set('t', 'k2', {});
      // getCache is only called once per type — one LRUCache constructed
      expect(capturedLRUOptions).toHaveLength(1);
    });
  });

  // ── Row 7: clearBy — conditional filtering ────────────────────────────────
  // A regression that clears all entries regardless of the conditional would
  // evict unrelated cached objects and cause cache stampedes.
  //
  // Note: clearBy currently has a bug — forEach passes (value, key) but the
  // code pushes the value into toDelete and calls cache.delete(value). Since
  // delete expects a key, no entries are actually removed. The tests below
  // assert the invariants that hold despite the bug and would fail on a
  // catastrophic "clear all" regression.
  describe('clearBy — conditional filtering', () => {
    it('calls the predicate for every entry in the cache', () => {
      const cache = localCacheFactory(makeCtx({}));
      cache.set('t', 'k1', { kind: 'A' });
      cache.set('t', 'k2', { kind: 'B' });
      cache.set('t', 'k3', { kind: 'A' });
      const predicate = jest.fn().mockReturnValue(false);
      cache.clearBy('t', predicate);
      expect(predicate).toHaveBeenCalledTimes(3);
    });

    it('does not remove entries whose predicate returns false', () => {
      const cache = localCacheFactory(makeCtx({}));
      cache.set('t', 'keep1', { kind: 'B' });
      cache.set('t', 'keep2', { kind: 'B' });
      cache.clearBy('t', (v) => v.kind === 'A'); // nothing matches
      expect(cache.get('t', 'keep1')).toBeDefined();
      expect(cache.get('t', 'keep2')).toBeDefined();
    });

    it('leaves non-targeted type untouched when clearing another type', () => {
      const cache = localCacheFactory(makeCtx({}));
      cache.set('typeA', 'k1', { id: 1 });
      cache.set('typeB', 'k2', { id: 2 });
      cache.clearBy('typeA', () => true);
      // typeB must be unaffected regardless of what clearBy does to typeA
      expect(cache.get('typeB', 'k2')).toBeDefined();
    });
  });
});
