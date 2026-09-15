const { promisify } = require('util');

module.exports = function createFunction(serviceContext) {
  const redisClient = serviceContext.redisClient;
  const real = require('../redisCache.js')(serviceContext);
  let cacheDirty = false;

  const _get = promisify(redisClient.get);
  const _set = promisify(redisClient.set);
  const _del = promisify(redisClient.del);
  const _incr = promisify(redisClient.incr);
  const _incrby = promisify(redisClient.incrby);
  const _decr = promisify(redisClient.decr);
  const _incrbyfloat = promisify(redisClient.incrbyfloat);

  function fakeGetKey(type, key) {
    return 'TEST:' + type + key;
  }
  const getKey = real.getKey || fakeGetKey;

  async function get(type, key) {
    return _get(getKey(type, key));
  }

  async function set(type, key, value, ttl) {
    return _set(getKey(type, key), value, 'EXP', ttl);
  }

  async function clear(type, key) {
    return _del(getKey(type, key));
  }

  async function incr(type, key) {
    return _incr(getKey(type, key));
  }

  async function incrBy(type, key, value) {
    return _incrby(getKey(type, key), value);
  }

  async function incrByFloat(type, key, value) {
    return _incrbyfloat(getKey(type, key), value);
  }

  async function decr(type, key) {
    return _decr(getKey(type, key));
  }

  async function asyncSet(type, key, value, keyOverride = null, ttlMin = null) {
    return _set(getKey(type, key), value, 'EXP', ttlMin);
  }

  return {
    isCacheDirty: () => cacheDirty,
    markCacheDirty: (cd) => (cacheDirty = cd),
    get,
    set,
    asyncSet,
    clear,
    incr,
    incrBy,
    incrByFloat,
    decr,
    multiExec: (multi) => {
      const p = promisify(multi.exec);
      return p();
    },
    _redisClient: redisClient
  };
};
