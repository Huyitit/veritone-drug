'use strict';

const createRedisExistenceL2 = require('./redisExistenceL2');

const TYPE = 'presignHead';
const TTL_MIN = 1;

function makeLogger() {
  return { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
}

describe('redisExistenceL2', () => {
  describe('get', () => {
    it('returns the cached boolean on a hit (true and false)', async () => {
      const redisCache = { get: jest.fn(), asyncSet: jest.fn() };
      const l2 = createRedisExistenceL2({ redisCache, logger: makeLogger() }, { type: TYPE, ttlMin: TTL_MIN });

      redisCache.get.mockResolvedValueOnce(true);
      expect(await l2.get('a:x')).toBe(true);
      redisCache.get.mockResolvedValueOnce(false);
      expect(await l2.get('a:x')).toBe(false);
      expect(redisCache.get).toHaveBeenCalledWith(TYPE, 'a:x');
    });

    it('treats a null / non-boolean value as a miss', async () => {
      const redisCache = { get: jest.fn(), asyncSet: jest.fn() };
      const l2 = createRedisExistenceL2({ redisCache }, { type: TYPE, ttlMin: TTL_MIN });

      redisCache.get.mockResolvedValueOnce(null);
      expect(await l2.get('a:x')).toBe(null);
      redisCache.get.mockResolvedValueOnce('yes'); // unexpected shape
      expect(await l2.get('a:x')).toBe(null);
    });

    it('fails open (returns null) when redisCache is absent', async () => {
      const l2 = createRedisExistenceL2({}, { type: TYPE, ttlMin: TTL_MIN });
      expect(await l2.get('a:x')).toBe(null);
    });

    it('fails open and warns when redis get throws', async () => {
      const logger = makeLogger();
      const redisCache = { get: jest.fn().mockRejectedValue(new Error('boom')), asyncSet: jest.fn() };
      const l2 = createRedisExistenceL2({ redisCache, logger }, { type: TYPE, ttlMin: TTL_MIN });

      expect(await l2.get('a:x')).toBe(null);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('L2 existence get failed'));
    });
  });

  describe('set', () => {
    it('writes through redisCache.asyncSet with type and ttlMin', async () => {
      const redisCache = { get: jest.fn(), asyncSet: jest.fn().mockResolvedValue() };
      const l2 = createRedisExistenceL2({ redisCache }, { type: TYPE, ttlMin: TTL_MIN });

      await l2.set('a:x', true);
      expect(redisCache.asyncSet).toHaveBeenCalledWith(TYPE, 'a:x', true, null, TTL_MIN);
    });

    it('is a no-op when redisCache is absent', async () => {
      const l2 = createRedisExistenceL2({}, { type: TYPE, ttlMin: TTL_MIN });
      await expect(l2.set('a:x', true)).resolves.toBeUndefined();
    });

    it('swallows and warns when redis set throws', async () => {
      const logger = makeLogger();
      const redisCache = { get: jest.fn(), asyncSet: jest.fn().mockRejectedValue(new Error('down')) };
      const l2 = createRedisExistenceL2({ redisCache, logger }, { type: TYPE, ttlMin: TTL_MIN });

      await expect(l2.set('a:x', false)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('L2 existence set failed'));
    });
  });
});
