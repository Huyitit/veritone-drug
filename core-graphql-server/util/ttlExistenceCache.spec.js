'use strict';

const createTtlExistenceCache = require('./ttlExistenceCache');

describe('ttlExistenceCache', () => {
  describe('L1 (in-process) only', () => {
    it('serves a fresh cached boolean without re-invoking fn', async () => {
      const fn = jest.fn().mockResolvedValue(true);
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0 });

      expect(await cache.wrap('a:x', fn)).toBe(true);
      expect(await cache.wrap('a:x', fn)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('re-invokes fn once the entry has expired', async () => {
      let t = 0;
      const fn = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const cache = createTtlExistenceCache({ ttlMs: 100, now: () => t });

      expect(await cache.wrap('a:x', fn)).toBe(false);
      t = 50; // still fresh
      expect(await cache.wrap('a:x', fn)).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
      t = 150; // expired
      expect(await cache.wrap('a:x', fn)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not cache a transient null (error) result', async () => {
      const fn = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(true);
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0 });

      expect(await cache.wrap('a:x', fn)).toBe(null);
      expect(await cache.wrap('a:x', fn)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(cache.size()).toBe(1);
    });

    it('emits l1_hit / origin metrics', async () => {
      const onMetric = jest.fn();
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, onMetric });
      await cache.wrap('a:x', async () => true); // origin (L1 miss, no L2)
      await cache.wrap('a:x', async () => true); // l1_hit

      expect(onMetric.mock.calls.map((c) => c[0])).toEqual(['origin', 'l1_hit']);
    });

    it('bounds memory: prunes expired entries when the cap is reached', async () => {
      let t = 0;
      const cache = createTtlExistenceCache({ ttlMs: 100, maxEntries: 3, now: () => t });

      await cache.wrap('k0', async () => true);
      await cache.wrap('k1', async () => true);
      expect(cache.size()).toBe(2);

      t = 200; // expire k0/k1
      await cache.wrap('k2', async () => true);
      await cache.wrap('k3', async () => true);
      expect(cache.size()).toBeLessThanOrEqual(3);
      expect(cache._map.has('k0')).toBe(false);
      expect(cache._map.has('k1')).toBe(false);
    });

    it('clears wholesale when all entries are still live at the cap', async () => {
      const cache = createTtlExistenceCache({ ttlMs: 10000, maxEntries: 2, now: () => 0 });
      await cache.wrap('k0', async () => true);
      await cache.wrap('k1', async () => true);
      await cache.wrap('k2', async () => true); // hits cap, no expired → wholesale clear
      expect(cache.size()).toBe(1);
      expect(cache._map.has('k2')).toBe(true);
    });
  });

  describe('with a shared L2 store', () => {
    it('serves an L2 hit on L1 miss without calling fn, and warms L1', async () => {
      const fn = jest.fn().mockResolvedValue(true);
      const l2 = {
        get: jest.fn().mockResolvedValue(false), // L2 says "does not exist"
        set: jest.fn().mockResolvedValue()
      };
      const onMetric = jest.fn();
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, l2, onMetric });

      expect(await cache.wrap('a:x', fn)).toBe(false);
      expect(fn).not.toHaveBeenCalled();
      expect(l2.get).toHaveBeenCalledWith('a:x');

      // Second lookup is served from the warmed L1 — no second L2 round trip.
      expect(await cache.wrap('a:x', fn)).toBe(false);
      expect(l2.get).toHaveBeenCalledTimes(1);
      expect(onMetric.mock.calls.map((c) => c[0])).toEqual(['l2_hit', 'l1_hit']);
    });

    it('falls through to fn on L1+L2 miss and writes both tiers', async () => {
      const fn = jest.fn().mockResolvedValue(true);
      const l2 = {
        get: jest.fn().mockResolvedValue(null), // L2 miss
        set: jest.fn().mockResolvedValue()
      };
      const onMetric = jest.fn();
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, l2, onMetric });

      expect(await cache.wrap('a:x', fn)).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(l2.set).toHaveBeenCalledWith('a:x', true);
      expect(onMetric.mock.calls.map((c) => c[0])).toEqual(['origin']);
    });

    it('does not write a transient null result to L2', async () => {
      const l2 = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue() };
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, l2 });

      expect(await cache.wrap('a:x', async () => null)).toBe(null);
      expect(l2.set).not.toHaveBeenCalled();
    });

    it('does not consult L2 when L1 is fresh', async () => {
      const l2 = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue() };
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, l2 });

      await cache.wrap('a:x', async () => true); // origin, warms L1
      l2.get.mockClear();
      await cache.wrap('a:x', async () => true); // L1 hit
      expect(l2.get).not.toHaveBeenCalled();
    });

    it('ignores a malformed l2 (missing get/set) and behaves as L1-only', async () => {
      const cache = createTtlExistenceCache({ ttlMs: 1000, now: () => 0, l2: {} });
      expect(await cache.wrap('a:x', async () => true)).toBe(true);
    });
  });
});
