const _ = require('lodash');
const { promisify } = require('util');
const moment = require('moment');

/*
 Implements a limited-use L2 shared redis cache.
*/
module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  // Should it be under 'config.redis', not 'config.redisCache'?
  const defaultTtlMin = _.get(
    serviceContext,
    'config.redisCache.ttlMin',
    _.get(serviceContext, 'config.redis.ttlMin', 60)
  );
  const defaultTtlMinForMarkDeleted = _.get(
    serviceContext,
    'config.redis.features.checkDeletion.ttlMin',
    _.get(serviceContext, 'config.redis.features.checkDeletion.ttlMin', 1)
  );
  const redisCacheEnabled =
    _.get(serviceContext, 'config.featureFlags.redisCacheEnabled', true) ===
    true;
  const redisClient = serviceContext.redisClient;
  const checkDeletion = getCheckDeletionConfig(serviceContext);

  function getCheckDeletionConfig(serviceContext) {
    const result = {
      resourceTypes: new Set()
    };

    const enabled = _.get(
      serviceContext,
      'config.redis.features.checkDeletion.enabled',
      true
    );
    if (enabled !== true) {
      return result;
    }

    const resourceTypes = _.get(
      serviceContext,
      'config.redis.features.checkDeletion.resourceTypes',
      []
    );
    result.resourceTypes = new Set(resourceTypes);
    return result;
  }

  function _get(key, callback) {
    redisClient.get(key, (error, val) => {
      callback(error, val);
    });
  }

  function _set(key, value, ttl, callback) {
    if (!ttl) {
      redisClient.set(key, value, callback);
      return;
    }
    redisClient.set(key, value, 'EX', ttl, (error, val) => {
      callback(error, val);
    });
  }

  function _incr(key, callback) {
    redisClient.incr(key, (error, val) => {
      callback(error, val);
    });
  }

  function _incrBy(key, value, callback) {
    redisClient.incrby(key, value, (error, val) => {
      callback(error, val);
    });
  }

  function _decr(key, callback) {
    redisClient.decr(key, (error, val) => {
      callback(error, val);
    });
  }

  function _incrByFloat(key, value, callback) {
    redisClient.incrbyfloat(key, value, (error, val) => {
      callback(error, val);
    });
  }

  function _del(key, callback) {
    redisClient.del(key, (error, val) => {
      callback(error, val);
    });
  }

  function _expire(key, ttlSec, callback) {
    redisClient.expire(key, ttlSec, (error, val) => {
      callback(error, val);
    });
  }

  const getAsync = promisify(_get);
  const setAsync = promisify(_set);
  const incrAsync = promisify(_incr);
  const incrByAsync = promisify(_incrBy);
  const decrAsync = promisify(_decr);
  const expireAsync = promisify(_expire);
  const incrByFloatAsync = promisify(_incrByFloat);
  const delAsync = promisify(_del);

  async function isCacheDirty(timestampKey, internalTimestamp) {
    if (!redisClient.connected) return true;
    if (!timestampKey) throw new Error('timestampKey must be set');

    // if we haven't timestamped internal cache yet,
    // assume it's dirty.
    if (!internalTimestamp) return true;

    // otherwise get shared marker from redis to compare
    try {
      const value = await getAsync('__SHARED__:' + timestampKey);
      if (value) {
        const d = Date.parse(value);
        // return true if our internal timestamp is older
        // than the timestamp stored in redis.
        return internalTimestamp <= d;
      }
    } catch (err) {
      // on corrupted timestamp, fall back on
      // assuming cache is dirty.
      serviceContext.logger.warn(
        'error getting ' + timestampKey + ' from redis:  ' + err
      );
      return true;
    }
    // if there's no value stored, cache dirty bit hasn't been
    // written yet so we can assume false.
    return false;
  }

  async function markCacheDirty(timestampKey) {
    if (!redisClient.connected) return null;
    if (!timestampKey) throw new Error('timestampKey must be set');
    const val = moment().toISOString();
    await setAsync('__SHARED__:' + timestampKey, val, 0);
    return val;
  }

  async function get(type, key, keyOverride = null) {
    if (!redisCacheEnabled) return null;
    if (!redisClient.connected) return null;

    const redisKey = keyOverride || getKey(type, key);
    const start = Date.now();
    const res = await getAsync(redisKey);
    const elapsed = Date.now() - start;
    serviceContext.metrics.observeHistogram('redisElapsedMs', elapsed, {
      objectType: type
    });
    if (res) {
      serviceContext.metrics.incrementCounter('redisHit', { objectType: type });
      serviceContext.logger.debug(
        'redis L2 HIT ' + redisKey + ' in ' + elapsed
      );
    } else {
      serviceContext.metrics.incrementCounter('redisMiss', {
        objectType: type
      });
      serviceContext.logger.debug(
        'redis L2 MISS ' + redisKey + ' in ' + elapsed
      );
    }
    try {
      return _.isNil(res) ? res : JSON.parse(res);
    } catch (err) {
      // if the cache contains a value that can't be parsed, clear it
      // out and return null
      serviceContext.logger.warn('invalid redis cache value for ' + redisKey);
      redisClient.del(redisKey);
      return null;
    }
  }

  async function incr(type, key, ttlMin = null) {
    if (!redisCacheEnabled) return null;
    if (!redisClient.connected) return null;

    const redisKey = getKey(type, key);
    const start = Date.now();
    const res = await incrAsync(redisKey);
    if (ttlMin) {
      await expireAsync(redisKey, ttlMin * 60);
    }
    const elapsed = Date.now() - start;
    serviceContext.metrics.observeHistogram('redisElapsedMs', elapsed, {
      objectType: type
    });
    try {
      return JSON.parse(res);
    } catch (err) {
      // if the cache contains a value that can't be parsed, clear it
      // out and return null
      serviceContext.logger.warn('invalid redis cache value for ' + redisKey);
      redisClient.del(redisKey);
      return null;
    }
  }

  async function incrBy(type, key, value) {
    if (!redisCacheEnabled) return null;
    if (!redisClient.connected) return null;

    const redisKey = getKey(type, key);
    const start = Date.now();
    const res = await incrByAsync(redisKey, value);
    const elapsed = Date.now() - start;
    serviceContext.metrics.observeHistogram('redisElapsedMs', elapsed, {
      objectType: type
    });
    try {
      return JSON.parse(res);
    } catch (err) {
      // if the cache contains a value that can't be parsed, clear it
      // out and return null
      serviceContext.logger.warn('invalid redis cache value for ' + redisKey);
      redisClient.del(redisKey);
      return null;
    }
  }

  async function incrByFloat(type, key, value) {
    if (!redisCacheEnabled) return null;
    if (!redisClient.connected) return null;

    const redisKey = getKey(type, key);
    const start = Date.now();
    const res = await incrByFloatAsync(redisKey, value);
    const elapsed = Date.now() - start;
    serviceContext.metrics.observeHistogram('redisElapsedMs', elapsed, {
      objectType: type
    });
    try {
      return JSON.parse(res);
    } catch (err) {
      // if the cache contains a value that can't be parsed, clear it
      // out and return null
      serviceContext.logger.warn('invalid redis cache value for ' + redisKey);
      redisClient.del(redisKey);
      return null;
    }
  }

  async function decr(type, key, ttlMin = null) {
    if (!redisCacheEnabled) return null;
    if (!redisClient.connected) return null;

    const redisKey = getKey(type, key);
    const start = Date.now();
    const res = await decrAsync(redisKey);
    if (ttlMin) {
      await expireAsync(redisKey, ttlMin * 60);
    }
    const elapsed = Date.now() - start;
    serviceContext.metrics.observeHistogram('redisElapsedMs', elapsed, {
      objectType: type
    });
    try {
      return JSON.parse(res);
    } catch (err) {
      // if the cache contains a value that can't be parsed, clear it
      // out and return null
      serviceContext.logger.warn('invalid redis cache value for ' + redisKey);
      redisClient.del(redisKey);
      return null;
    }
  }

  function incrementTimeWindowCounter(type, timeWindowSec, value) {
    if (!redisCacheEnabled) return;
    if (!redisClient.connected) return;

    // just skip if value is zero or nil
    if (!value) return;
    // verify that a non-nil value is an integer
    if (!_.isInteger(value))
      throw new Error(
        'incrementTimeWindowCounter value ' + value + ' is not an integer'
      );
    if (!_.isInteger(timeWindowSec))
      throw new Error(
        'incrementTimeWindowCounter timeWindowSec ' +
        timeWindowSec +
        ' is not an integer'
      );

    const start = Date.now();
    const redisKey = type + '-' + util.getTimeWindowKey(timeWindowSec, start);
    // TTL will be the length of our time window plus a small buffer to
    // make sure redis doesn't expire entry before we're done with it
    const ttl = timeWindowSec + 1;

    redisClient.incrBy(redisKey, value, () => {
      const elapsed = Date.now() - start;
      serviceContext.logger.debug(
        'redis INCR ' +
        redisKey +
        ' by ' +
        value +
        ' over ' +
        timeWindowSec +
        ' in ' +
        elapsed
      );
    });
  }

  function getKey(type, id) {
    return `core-graphql-server:${type}:${id}`;
  }

  function getKeyDeleted(type, key, keyOverride) {
    if (!checkDeletion.resourceTypes.has(type)) {
      return null;
    }

    if (_.isNil(keyOverride)) {
      keyOverride = getKey(type, key);
    }

    return `${keyOverride}:isdeleted`;
  }

  /**
   * Check the data in cache to see if the resource has been deleted or not
   * if the resource has been deleleted, clean the data in cache
   * @param {*} type: type of resource
   * @param {*} redisKey: redis key to find the resource in cache
   * @returns true if the resource is deleted. Otherwise, it is false
   */
  async function checkDeletedResource(type, redisKey) {
    let resDeleted = false;
    const keyDeleted = getKeyDeleted(type, null, redisKey);
    if (!_.isNil(keyDeleted)) {
      const deletedResource = await get(type, null, keyDeleted);
      if (!_.isNil(deletedResource)) {
        serviceContext.logger.warn(
          `the resource has deleted: ${redisKey}. Cleaning the cache...`
        );
        redisClient.del(redisKey);
        redisClient.del(keyDeleted);
        return true;
      }
    }

    return resDeleted;
  }

  /**
   * Creates a new key in the cache to mark the resource is deleted
   * @param {*} type: the type of resource
   * @param {*} key: the key to set/ get the resource in the cache
   * @returns promise asyncSet
   */
  async function markResourceToBeDeleted(type, key) {
    const keyDeleted = getKeyDeleted(type, key);
    if (_.isNil(keyDeleted)) {
      return;
    }

    return asyncSet(type, key, true, keyDeleted, defaultTtlMinForMarkDeleted);
  }

  function set(type, key, value, keyOverride = null, ttlMin = null) {
    if (!redisCacheEnabled) return;
    if (!redisClient.connected) return;

    if (_.isNil(value))
      throw new Error('null/undefined cannot be cached in redis. use clear().');

    const redisKey = keyOverride || getKey(type, key);

    const defTtl = ttlMin || defaultTtlMin;
    const ttl =
      _.get(serviceContext, `config.redisCache.${type}.ttlMin`, defTtl) * 60; // note that redis cache TTL is in seconds
    const start = Date.now();
    redisClient.set(redisKey, JSON.stringify(value), 'EX', ttl, () => {
      serviceContext.logger.debug(
        'redis L2 SET ' + redisKey + ' ' + ttl + ' in ' + (Date.now() - start)
      );
      serviceContext.metrics.incrementCounter('redisPut', {
        objectType: type
      });
    });

    // Check the resource status. Clean the data if the resource is deleted
    checkDeletedResource(type, redisKey);
  }

  async function asyncSet(type, key, value, keyOverride = null, ttlMin = null) {
    if (!redisCacheEnabled) return;
    if (!redisClient.connected) return;

    if (_.isNil(value))
      throw new Error('null/undefined cannot be cached in redis. use clear().');

    const redisKey = keyOverride || getKey(type, key);

    // Check the resource status before updating to the cache
    const resourceIsDeleted = await checkDeletedResource(type, redisKey);
    if (resourceIsDeleted === true) {
      return;
    }

    const defTtl = ttlMin || defaultTtlMin;
    const ttl =
      _.get(serviceContext, `config.redisCache.${type}.ttlMin`, defTtl) * 60; // note that redis cache TTL is in seconds
    const start = Date.now();
    const res = await setAsync(redisKey, JSON.stringify(value), ttl);
    serviceContext.logger.debug(
      'redis L2 SET ' + redisKey + ' ' + ttl + ' in ' + (Date.now() - start)
    );
    serviceContext.metrics.incrementCounter('redisPut', {
      objectType: type
    });
    return res;
  }

  async function clear(type, key) {
    if (!redisCacheEnabled) return;
    if (!redisClient.connected) return;

    const redisKey = getKey(type, key);
    const start = Date.now();
    redisClient.del(redisKey, () => {
      serviceContext.metrics.incrementCounter('redisClear', {
        objectType: type
      });
      serviceContext.logger.debug(
        'redis L2 DEL ' + redisKey + ' in ' + (Date.now() - start)
      );
    });
  }

  async function asyncClear(type, key) {
    if (!redisCacheEnabled) return;
    if (!redisClient.connected) return;

    const redisKey = getKey(type, key);
    const start = Date.now();

    const result = await delAsync(redisKey);

    const elapsed = Date.now() - start;
    serviceContext.metrics.incrementCounter('redisClear', {
      objectType: type
    });
    serviceContext.logger.debug(
      'redis L2 DEL ' + redisKey + ' in ' + elapsed
    );

    return result;
  }

  // redis helper/wrapper function
  function multiExecCb(multi, callback) {
    multi.exec((err, results) => {
      callback(err, results);
    });
  }
  const multiExec = promisify(multiExecCb);

  return {
    isCacheDirty,
    markCacheDirty,
    get,
    set,
    incr,
    incrBy,
    incrByFloat,
    decr,
    multiExec,
    clear,
    asyncSet,
    getKeyDeleted,
    markResourceToBeDeleted,
    asyncClear
  };
};
