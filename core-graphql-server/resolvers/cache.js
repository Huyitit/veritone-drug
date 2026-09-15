const _ = require('lodash'),
  { v5: uuidv5 } = require('uuid'),
  uuidNamespace = 'a61091ed-1f70-45e1-b3c3-475378e8289d',
  stringify = require('json-stable-stringify');

module.exports = function createFunction(serviceContext) {
  const enabled =
    _.get(serviceContext, 'config.server.resolverCacheEnabled', true) === true;

  function _get(requestContext, params, objectType, getFunction) {
    return getFunction.call();
  }

  async function get(requestContext, params, objectType, getFunction) {
    // first init request-level cache if need be
    if (!requestContext._objectCache) {
      requestContext._objectCache = {};
      requestContext._objectCacheHits = 0;
      requestContext._objectCacheMisses = 0;
    }
    const cache = requestContext._objectCache;

    // now form a deterministic key from params
    const key = objectType + '-' + uuidv5(stringify(params), uuidNamespace);

    // look in cache
    let val = cache[key];
    // if it's not there, we'll use the get function to retrieve it
    if (_.isNil(val)) {
      // do not await
      val = getFunction.call();
      cache[key] = val;
      requestContext._objectCacheMisses++;
      // VE-26935 - objectType (not the uuid key) keeps cardinality to the same
      // bounded domain redis_hit/redis_miss already use. A high hit count here
      // means one request looked the same object up repeatedly, which is the
      // duplicate-lookup volume a DataLoader would collapse.
      serviceContext.metrics.incrementCounter('resolverCacheMiss', {
        objectType
      });
      serviceContext.logger.debug('RESOLVERCACHE MISS on ' + key);
    } else {
      serviceContext.logger.debug('RESOLVERCACHE HIT on ' + key);
      requestContext._objectCacheHits++;
      serviceContext.metrics.incrementCounter('resolverCacheHit', {
        objectType
      });
    }

    return val;
  }

  return {
    get: enabled ? get : _get
  };
};
