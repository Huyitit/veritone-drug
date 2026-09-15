'use strict';

const _ = require('lodash');
const { promisify } = require('util');
const moment = require('moment');
const RedLock = require('redlock');

module.exports = function setUpCache(app, dal) {
  if (!_.isObject(app)) {
    throw new Error('missing app');
  }
  if (!_.isObject(app.config)) {
    throw new Error('missing app.config!');
  }
  if (!_.isObject(app.logger)) {
    throw new Error('missing app.logger!');
  }
  if (!_.isObject(dal) || !_.every([dal.build], _.isObject)) {
    throw new Error('missing dal');
  }
  if (!_.isObject(app.redisCache)) {
    throw new Error('missing app.redisCache!');
  }

  const redisActiveBuildKey = 'EngineActiveBuildList:ActiveBuild:';
  const buildCacheTTLMs = _.get(app, 'config.build.maxAge', 1000 * 60 * 60);

  async function getActiveBuildForEngine(engineId) {
    const cachedBuild = await app.redisCache.get(redisActiveBuildKey, engineId);

    if (!_.isNil(cachedBuild)) {
      return cachedBuild;
    }

    app.logger.trace(`active build cache miss - ${engineId}`);

    const getActiveEngineBuildPromise = promisify(
      dal.build.getActiveEngineBuild
    );
    const dbBuild = await getActiveEngineBuildPromise(engineId, null);
    if (_.isObject(dbBuild)) {
      await app.redisCache.asyncSet(
        redisActiveBuildKey,
        engineId,
        dbBuild,
        null,
        buildCacheTTLMs / 1000
      );
    }
    return dbBuild;
  }

  // function packageBuildCache(builds, cb) {
  //   const multi = app.redisClient.multi();

  //   builds.forEach(function forEachBuild(build) {
  //     const buildId = build.buildId;
  //     const redisKey = `${redisBuildKey}${buildId}`;
  //     const ttlSecs = buildCacheTTLMs / 1000; // redis expire setting is in seconds

  //     multi.set(redisKey, JSON.stringify(build));
  //     multi.expire(redisKey, ttlSecs);
  //   });

  //   multi.exec((err, results) => {
  //     if (err) {
  //       app.logger.error('Failed to package build cache', err);
  //     }

  //     if (cb) return cb(null, results);
  //   });
  // }

  function packageActiveBuildCache(builds, cb) {
    const multi = app.redisClient.multi();

    builds.forEach(function forEachBuild(build) {
      const engineId = build.engineId;
      const redisKey = `${redisActiveBuildKey}${engineId}`;
      const ttlSecs = buildCacheTTLMs / 1000; // redis expire setting is in seconds

      multi.set(redisKey, JSON.stringify(build));
      multi.expire(redisKey, ttlSecs);
    });

    multi.exec((err, results) => {
      if (err) {
        app.logger.error('Failed to package active build cache', err);
      }

      if (cb) return cb(null, results);
    });
  }

  let lastRefreshMoment;
  const _getRedisAsync = promisify(_getRedis);

  async function _getRedis(key, callback) {
    app.redisClient.get(key, (error, val) => {
      callback(error, val);
    });
  }

  async function refreshCache() {
    const key = dal.build.getBuildCacheRedisKey();

    try {
      const redisDirtyTimestamp = await _getRedisAsync(key);
      let current = false;
      let cacheValidUntilMoment;
      let error;
      if (redisDirtyTimestamp) {
        try {
          cacheValidUntilMoment = moment(redisDirtyTimestamp);
          // if we're able to get a "dirty" mark from redis and it's
          // older than our local cache, our cache is current. skip refresh.
          if (
            lastRefreshMoment &&
            lastRefreshMoment.isAfter(cacheValidUntilMoment)
          ) {
            current = true;
          }
        } catch (err) {
          app.logger.warn('error getting redis build cache mark:  ' + err);
          error = err;
        }
      }
      // if redis value wasn't set, set mark now.
      if (!redisDirtyTimestamp && !error) {
        dal.build.dirtyBuildCache();
      }

      app.logger.debug(
        `build  cache last refresh ${
          lastRefreshMoment ? lastRefreshMoment.toISOString() : 'none'
        }, current mark ${redisDirtyTimestamp}, current: ${current}`
      );
      if (!current) {
        const lockOptions = {
          retryCount: 1,
          retryDelay: 1000
        };
        const redLock = new RedLock([app.redisClient], lockOptions);

        try {
          const lock = await redLock.lock(
            key + '-lock',
            300000 // only hold the lock for 5 min
          );

          try {
            await doRefreshCache(cacheValidUntilMoment);
          } finally {
            lock.unlock().catch(app.logger.error);
          }
        } catch (error) {
          app.logger.trace('Fail to obtain the redis lock', key + '-lock');
          // other instance is updating the cache, we don't have to do a full refresh on the next timer cycle
          lastRefreshMoment = moment.utc();
        }
      }
    } catch (error) {
      app.logger.error('Fail to get redis from cache key ' + key, error);
    }
  }

  async function doRefreshCache(fromMoment) {
    app.logger.trace('Starting build refresh...');
    const options = fromMoment
      ? {
          dateTimeFilter: [
            {
              field: 'updatedDate',
              fromDateTime: moment(fromMoment)
                .subtract(1, 'hour') // should be last 1 hour to avoid fetching the builds which are executing
                .toISOString()
            }
          ]
        }
      : {};

    try {
      const getAllActiveEngineBuildsPromise = promisify(
        dal.build.getAllActiveEngineBuilds
      );
      const results = await getAllActiveEngineBuildsPromise(options, null);
      const builds = results.results;

      if (builds) {
        packageActiveBuildCache(builds);
      }

      lastRefreshMoment = moment.utc();

      return;
    } catch (error) {
      app.logger.error(error);
      return;
    }
  }
  let refresh = true;
  async function refreshCacheLoop() {
    if (refresh) {
      try {
        await refreshCache();
      } catch (err) {
        app.logger.error('Failed to refresh engine build cache', err);
      }
    }
    setTimeout(
      refreshCacheLoop,
      _.get(app, 'config.taskTypeCacheRefreshIntervalMs', 60000)
    );
  }

  // Get data on load
  refreshCacheLoop();

  return {
    getActiveBuildForEngine: getActiveBuildForEngine
  };
};
