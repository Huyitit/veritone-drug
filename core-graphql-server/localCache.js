const LRUCache = require('lru-cache');
const _ = require('lodash');

/*
 Implements a limited-use local in-memory, cross-request cache.
 Should be used only in certain cases where we don't have to worry
 about race conditions or stale data.
*/
module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const caches = {};

  // default TTL
  const defaultTtlMin = _.get(config, 'localCache.ttlMin', 20);
  // default max number of items
  const defaultMaxSize = _.get(config, 'localCache.maxSize', 1000);

  function getCache(type) {
    let res = caches[type];
    if (!res) {
      // initialize the cache for this object type.
      // default values above can be overridden for a given object type
      res = new LRUCache({
        ttl:
          _.get(config, `localCache.${type}.ttlMin`, defaultTtlMin) * 60 * 1000,
        max: _.get(config, `localCache.${type}.maxSize`, defaultMaxSize)
      });
      caches[type] = res;
    }

    return res;
  }

  function get(type, key) {
    const cache = getCache(type);
    const res = cache.get(key);
    if (_.isNil(res)) {
      serviceContext.logger.debug('LOCALCACHE MISS ON ' + type + ' / ' + key);
    } else {
      serviceContext.logger.debug('LOCALCACHE HIT  ON ' + type + ' / ' + key);
      res.__fromCache = true;
    }
    return res;
  }

  function set(type, key, value) {
    const cache = getCache(type);
    serviceContext.logger.debug('LOCALCACHE SET ON ' + type + ' / ' + key);

    cache.set(key, value);
  }

  function clear(type, key) {
    const cache = getCache(type);
    cache.delete(key);
    serviceContext.logger.debug('LOCALCACHE CLEAR ON ' + type + ' / ' + key);
  }

  function clearBy(type, conditional) {
    const cache = getCache(type);
    const toDelete = [];
    cache.forEach((k) => {
      if (conditional(k)) {
        toDelete.push(k);
      }
    });
    for (const d of toDelete) {
      cache.delete(d);
      serviceContext.logger.debug('LOCALCACHE CLEAR ON ' + type + ' / ' + d);
    }
  }

  return {
    get,
    set,
    clear,
    clearBy,
    _clearAll: () => {
      for (let c in caches) delete caches[c];
    }
  };
};
