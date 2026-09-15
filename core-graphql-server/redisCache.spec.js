const _ = require('lodash');
const serviceContext = require('./test/serviceContext.mock.js')();
// Default TTL 1 min
// _.set(serviceContext.config.redis, 'ttlMin', 1);

describe('#redisCache', function () {
  xdescribe('#testFailedConnection', function () {
    beforeAll(() => {
      serviceContext.redisClient.connected = true;
      serviceContext._clearAll();
    });

    it('should return default values when not connected', async function () {
      const redisCache = require('./redisCache.js')(serviceContext);
      serviceContext.redisClient.connected = false;
      expect(redisCache).toBeInstanceOf(Object);

      const type = 'foo';
      const key = 'bar';
      const value = 0;
      await redisCache.set(type, key, value);
      expect(serviceContext.redisClient._counter()).toBe(0);

      let result = await redisCache.get(type, key);
      expect(result).toBeNull();

      result = await redisCache.clear(type, key);
      expect(serviceContext.redisClient._counter()).toBe(0);

      result = await redisCache.incr(type, key);
      expect(result).toBeNull();

      result = await redisCache.incrBy(type, key, 1);
      expect(result).toBeNull();

      result = await redisCache.decr(type, key);
      expect(result).toBeNull();
    });

    it('should return expected values when connected', async function () {
      const redisCache = require('./redisCache.js')(serviceContext);
      expect(redisCache).toBeInstanceOf(Object);

      const type = 'foo';
      const key = 'bar';
      const value = Number(0);
      await redisCache.set(type, key, value);

      let result = await redisCache.get(type, key);
      expect(result).toBe(0);

      await redisCache.clear(type, key);
      result = await redisCache.get(type, key);
      expect(result).toBeFalsy();

      result = await redisCache.incr(type, key);
      expect(result).toBe(1);

      result = await redisCache.incrBy(type, key, 2);
      expect(result).toBe(3);

      result = await redisCache.decr(type, key);
      expect(result).toBe(2);
      expect(serviceContext.redisClient._counter()).toBe(7);
    });
  });
  describe('#checkDeletedResource', function () {
    let redisCache;
    beforeAll(() => {
      serviceContext._clearAll();
      serviceContext.redisClient.connected = true;
      _.set(
        serviceContext.config.redis,
        'features.checkDeletion.resourceTypes',
        ['foo']
      );
      redisCache = require('./redisCache.js')(serviceContext);
      expect(redisCache).toBeInstanceOf(Object);
    });

    it('should set data to cache successfully', async function () {
      const type = 'foo';
      const key = 'bar';
      const value = 1;
      await redisCache.set(type, key, value);

      let result = await redisCache.get(type, key);
      expect(result).toBe(1);
    });

    it('getKeyDeleted: should not get a deleted key if the type does not set in the config', async function () {
      const type = 'foo_notexist';
      const key = 'bar';
      const deletedKey = redisCache.getKeyDeleted(type, key);
      expect(deletedKey).toBeNull();
    });

    it('getKeyDeleted: should get a deleted key if the type is set in the config', function () {
      const type = 'foo';
      const key = 'bar';
      const deletedKey = redisCache.getKeyDeleted(type, key);
      expect(deletedKey).not.toBeNull();
      expect(deletedKey).toContain('bar:isdeleted');
    });

    it('set new data', async function () {
      const type = 'foo';
      const key = 'bar';
      const value = 1;
      await redisCache.asyncSet(type, key, value);
    });

    it('should mark the data is deleted to cache successfully', async function () {
      const type = 'foo';
      const key = 'bar';
      await redisCache.markResourceToBeDeleted(type, key);

      const getDeletedKey = redisCache.getKeyDeleted(type, key);
      let result = await redisCache.get(type, null, getDeletedKey);
      expect(result).toBe(true);
    });

    it('set: should not set the data from cache if the resource has been deleted', function () {
      const type = 'foo';
      const key = 'bar';
      const value = 2;
      redisCache.set(type, key, value);
    });

    it('set: should not get the data from cache if the resource has been deleted', async function () {
      const type = 'foo';
      const key = 'bar';
      const result = await redisCache.get(type, key);
      expect(_.isNil(result)).toBe(true);
    });

    it('set: Delete the marked key for testing', async function () {
      const type = 'foo';
      const key = 'bar';
      const getDeletedKey = redisCache.getKeyDeleted(type, key);
      await redisCache.clear(type, getDeletedKey);
      const result = await redisCache.get(type, getDeletedKey);
      expect(_.isNil(result)).toBe(true);
    });

    it('asyncSet: Should set the new data', async function () {
      const type = 'foo';
      const key = 'bar_asyncSet';
      const value = 3;
      await redisCache.asyncSet(type, key, value);

      let result = await redisCache.get(type, key);

      expect(result).toBe(3);
      result = await redisCache.get(type, key);

      expect(result).toBe(3);
      result = await redisCache.get(type, key);

      expect(result).toBe(3);
    });

    it('asyncSet: Should get the new data', async function () {
      const type = 'foo';
      const key = 'bar_asyncSet';
      const result = await redisCache.get(type, key);

      expect(result).toBe(3);
    });

    it('asyncSet: should mark the data is deleted to cache successfully', async function () {
      const type = 'foo';
      const key = 'bar';
      await redisCache.markResourceToBeDeleted(type, key);

      const getDeletedKey = redisCache.getKeyDeleted(type, key);
      let result = await redisCache.get(type, null, getDeletedKey);
      expect(result).toBe(true);
    });

    it('asyncSet: should not set the data from cache if the resource has been deleted', async function () {
      const type = 'foo';
      const key = 'bar';
      const value = 4;
      await redisCache.asyncSet(type, key, value);
    });

    it('asyncSet: should not get the data from cache if the resource has been deleted', async function () {
      const type = 'foo';
      const key = 'bar';
      const result = await redisCache.get(type, key);
      expect(_.isNil(result)).toBe(true);
    });
  });

  describe('#ttlBehavior', function () {
    const type = 'TemporalDataObject';
    const key = 'nonSegmentAssetCount123';
    const value = 5;
    let redisCache;

    beforeAll(() => {
      serviceContext._clearAll();
      serviceContext.redisClient.connected = true;
      _.set(serviceContext.config, ['redisCache', type, 'ttlMin'], 360);
      redisCache = require('./redisCache.js')(serviceContext);
    });

    it('should set TTL (6h) when key is created', async function () {
      jest.spyOn(serviceContext.redisClient, 'set');

      await redisCache.set(type, key, value);

      expect(serviceContext.redisClient.set).toHaveBeenCalled();
      const callArgs = serviceContext.redisClient.set.mock.calls[0];
      expect(callArgs[0]).toContain('core-graphql-server:' + type + ':' + key);
      expect(callArgs[1]).toBe(JSON.stringify(value));
      expect(callArgs[2]).toBe('EX');
      expect(callArgs[3]).toBe(360 * 60);

      serviceContext.redisClient.set.mockRestore();
    });

    it('should reset TTL when key is modified via incr/decr', async function () {
      jest.spyOn(serviceContext.redisClient, 'expire');

      await redisCache.asyncSet(type, key, value);

      await redisCache.incr(type, key, 360); // pass ttlMin
      expect(serviceContext.redisClient.expire).toHaveBeenCalled();
      const expireArgs = serviceContext.redisClient.expire.mock.calls[0];
      expect(expireArgs[0]).toContain('core-graphql-server:' + type + ':' + key);
      expect(expireArgs[1]).toBe(360 * 60);

      serviceContext.redisClient.expire.mockRestore();
    });
  });
});
