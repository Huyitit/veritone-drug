'use strict';

/**
 * Shared (L2) object-existence store backed by core-graphql's redisCache, for
 * the presigner HEAD-check hot path. Pools existence results across all pods so
 * a HEAD probed by one pod is reused fleet-wide (a per-pod L1 alone only catches
 * ~1/N of cross-request repeats at N pods).
 *
 * Contract required by ttlExistenceCache: get/set MUST be fail-open — they never
 * throw. A redis error, a disabled/disconnected cache, or an absent redisCache
 * degrades to a real HEAD rather than breaking the sign path. `serviceContext`
 * is read lazily so presigner init ordering (redisCache attached later) is moot.
 *
 * @sminkov — VE-24702
 *
 * @param {Object} serviceContext
 * @param {Object} opts
 * @param {string} opts.type          redisCache namespace (per-type TTL config key)
 * @param {number} opts.ttlMin        entry lifetime in minutes (redisCache granularity)
 * @param {Object} [opts.logger]      defaults to serviceContext.logger
 * @returns {{ get: (key:string)=>Promise<boolean|null>, set: (key:string,value:boolean)=>Promise<void> }}
 */
module.exports = function createRedisExistenceL2(serviceContext, opts = {}) {
  const { type, ttlMin } = opts;
  const logger = opts.logger || (serviceContext && serviceContext.logger) || console;

  async function get(key) {
    const rc = serviceContext.redisCache;
    if (!rc) return null;
    try {
      const v = await rc.get(type, key);
      // Only a definitive boolean is a hit; anything else (null miss, unexpected
      // shape) is treated as a miss so the caller probes.
      return v === true || v === false ? v : null;
    } catch (err) {
      logger.warn(`[presigner] L2 existence get failed: ${err.message}`);
      return null;
    }
  }

  async function set(key, value) {
    const rc = serviceContext.redisCache;
    if (!rc) return;
    try {
      await rc.asyncSet(type, key, value, null, ttlMin);
    } catch (err) {
      logger.warn(`[presigner] L2 existence set failed: ${err.message}`);
    }
  }

  return { get, set };
};
