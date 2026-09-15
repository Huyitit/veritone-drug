const os = require('os');
const v8 = require('v8');
const _ = require('lodash');
const moment = require('moment');
const buildInfo = require('./buildinfo.js');
const { promisify } = require('util');
const request = require('request-promise');

module.exports = function createModule(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const serverHostname = os.hostname();
  const messageUtil = serviceContext.messageUtil;
  const metrics = serviceContext.metrics;
  const heartbeatInterval = _.get(
    serviceContext,
    'config.server.heartbeatIntervalSec',
    60
  );
  const heartbeatEnabled =
    _.get(serviceContext, 'config.server.heartbeatEnabled', true) === true;
  const redisEnabled =
    _.get(serviceContext, 'config.server.redisHeartbeatEnabled', true) === true;
  const redisInterval = _.get(
    serviceContext,
    'config.server.redisHeartbeatIntervalSec',
    10
  );
  const runtimeStatsInterval = _.get(
    serviceContext,
    'config.healthCheck.runtimeStatsIntervalSec',
    10
  );
  const minPercentFreeMem = _.get(
    serviceContext,
    'config.healthCheck.minFreeMemPercent',
    5
  );
  const minRequestsForResponseTime = _.get(
    serviceContext,
    'config.healthCheck.minRequestsForResponseTime',
    50
  );
  const maxAverageResponseTimeMs = _.get(
    serviceContext,
    'config.healthCheck.maxAverageResponseTimeMs',
    10000
  );
  const failOnResponseTime = _.get(
    serviceContext,
    'config.healthCheck.failOnResponseTime',
    true
  );
  const failOnMemUsage = _.get(
    serviceContext,
    'config.healthCheck.failOnMemUsage',
    true
  );

  const serverBuildInfo = buildInfo.getBuildInfo();

  const lastValues = {};

  const heartbeatTopic = messageUtil.eventTypeTopics.heartbeat;
  let startupInProgress = true;
  let shutdownInProgress = false;

  let intervalHandles = {};

  function getValueDiff(name) {
    if (_.isNil(lastValues[name])) lastValues[name] = 0;
    const current = metrics.getValue(name);
    const res = current - lastValues[name];
    lastValues[name] = current;
    return res;
  }

  function getBaseEvent(eventType) {
    const now = Date.now();
    const memU = process.memoryUsage();
    const id = serverHostname + '-' + moment(now).toISOString();
    return {
      id,
      correlationId: id,
      serviceName: 'core-graphql-server',
      timestampMs: now,
      success: true,
      serverHostname,
      uptimeSeconds: Math.floor(process.uptime()),
      memUsage: {
        totalMemoryBytes: memU.heapTotal,
        freeMemoryBytes: memU.heapTotal - memU.heapUsed,
        nodeMemoryBytes: memU.rss,
        memoryLeaksTotal: metrics.getValue('memLeak'),
        garbageCollectionsTotal: metrics.getValue('memGC'),
        memoryLeaks: getValueDiff('memLeak'),
        garbageCollections: getValueDiff('memGC')
      },
      event: eventType,
      type: 'api',
      buildInfo: serverBuildInfo
    };
  }

  /*
   * Gets heartbeat status for the LAST interval, which will be complete.
   * Not the current interval, which might not be complete.
   */
  async function getFromRedis() {
    const start = Date.now() - redisInterval * 1000;
    const baseKey = getHeartbeatBaseKey(start);
    const multi = serviceContext.redisClient.multi();
    const statKeys = Object.keys(redisStats);
    statKeys.forEach((stat) => {
      const key = baseKey + ':' + stat;
      multi.get(key);
    });
    const res = await multiExec(multi);

    // now marshal the response into an object with stat names as keys
    const data = {
      intervalSeconds: redisInterval,
      lastRefresh: moment(lastRefresh).toISOString()
    };
    let i = 0;
    statKeys.forEach((stat) => {
      const val = res[i++];
      data[stat] = _.isNil(val) ? 0 : val;
    });

    return data;
  }

  function multiExecCb(multi, callback) {
    const start = Date.now();
    multi.exec((err, results) => {
      const elapsed = Date.now() - start;
      const status = err ? 'ERROR [' + err + ']' : 'OK';
      serviceContext.logger.debug(
        'redis HEARTBEAT over ' +
          redisInterval +
          ' in ' +
          elapsed +
          ' ' +
          status
      );
      callback(err, results);
    });
  }

  const multiExec = promisify(multiExecCb);

  function getHeartbeatBaseKey(start) {
    return (
      'core-graphql-server:heartbeat:' +
      util.getTimeWindowKey(redisInterval, start)
    );
  }

  let lastRefresh;
  function pushToRedis() {
    const multi = serviceContext.redisClient.multi();
    const start = Date.now();
    const baseKey = getHeartbeatBaseKey(start);
    const ttl = redisInterval * 2 + 1;

    // build up a multi-step redis call
    Object.keys(redisStats).forEach((stat) => {
      const key = baseKey + ':' + stat;
      const val = getValueDiff(redisStats[stat]);
      multi.incrby(key, val);
      multi.expire(key, ttl);
    });
    multi.exec((err, results) => {
      const now = Date.now();
      const elapsed = now - start;
      const status = err ? 'ERROR [' + err + ']' : 'OK';
      lastRefresh = now;
      serviceContext.logger.debug(
        'redis HEARTBEAT over ' +
          redisInterval +
          ' in ' +
          elapsed +
          ' ' +
          status
      );
    });
  }

  const redisStats = _.get(
    serviceContext,
    'config.server.redisHeartbeatStats',
    {
      graphqlRequests: 'request',
      sqlQueries: 'sqlQuery',
      sqlQueryRetries: 'sqlQueryRetry',
      sqlQueryTimeouts: 'sqlQueryTimeout',
      httpCalls: 'httpCall',
      httpRetries: 'httpRetry',
      graphqlOperations: 'operation',
      unexpectedError: 'unexpectedError',
      allError: 'error',
      timeout: 'timeoutError',
      awsURLSignError: 'awsURLSignError',
      outOfBandError: 'outOfBandError',
      redisHits: 'redisHit',
      redisMisses: 'redisMiss',
      redisPuts: 'redisPut',
      redisClears: 'redisClear',
      queryMonTerminatedQueries: 'queryMonTerminatedQueries',
      queryMonKilledQueries: 'queryMonKilledQueries',
      queryMonKillFailures: 'queryMonKillFailures',
      queryMonLongQueries: 'queryMonLongQueries',
      analyzeMonTables: 'analyzeMonTables',
      analyzeMonErrors: 'analyzeMonErrors',
      internalTokenError: 'internalTokenError',
      engineJWTError: 'engineJWTError'
    }
  );

  function heartbeat() {
    /* WIP
    serviceContext.app.server.getConnections((err, count) => {
      console.log('NUMCONN:  '+count);
    });
    */
    const avgArray = os.loadavg();
    const data = Object.assign(getBaseEvent('heartbeat'), {
      isHealthy: isUnhealthy() === 0,
      isStartupInProgress: startupInProgress,
      isShutdownInProgress: shutdownInProgress,
      loadAverage: {
        avg1Min: avgArray[0],
        avg5Min: avgArray[1],
        avg15Min: avgArray[2]
      },
      concurrentOperations: {
        graphqlRequests: metrics.getValue('concurrentRequests'),
        sqlQueries: metrics.getValue('sqlConcurrentQueries'),
        httpCalls: metrics.getValue('httpConcurrentCalls')
      },
      operations: {
        graphqlRequests: getValueDiff('request'),
        sqlQueries: getValueDiff('sqlQuery'),
        httpCalls: getValueDiff('httpCall'),
        graphqlOperations: getValueDiff('operation'),
        averageResponseTimeMs: getLastAverageResponseTime()
      },
      caching: {
        redisHits: getValueDiff('redisHit'),
        redisMisses: getValueDiff('redisMiss'),
        redisPuts: getValueDiff('redisPut'),
        redisClears: getValueDiff('redisClear')
      },
      errors: {
        timeout: getValueDiff('timeoutError'),
        outOfBand: getValueDiff('outOfBandError'),
        unexpected: getValueDiff('unexpectedError'),
        all: getValueDiff('error'),
        awsURLSignError: getValueDiff('awsURLSignError'),
        engineJWTError: getValueDiff('engineJWTError'),
        sqlQueryRetry: getValueDiff('sqlQueryRetry'),
        sqlQueryTimeout: getValueDiff('sqlQueryTimeout'),
        internalTokenError: getValueDiff('internalTokenError')
      }
    });

    messageUtil.emitEvent(data, heartbeatTopic);
  }
  const runtimeStatsIntervalMs = runtimeStatsInterval * 1000;

  let responseTimes = [];
  let lastAverageResponseTime = 0;
  let lastAverageResponseCount = 0;
  let numRequests = 0;
  let lastMemUsage = process.memoryUsage();
  let lastHeapStats = v8.getHeapStatistics();

  let lastAverageTimestamp;

  /**
   * This function is used to safely get the last average response time
   * calculation. It resets and computes new data if necessary.
   */
  function getLastAverageResponseTime() {
    const now = moment().valueOf();
    // if we haven't initalized (first request), do it now.
    if (!lastAverageTimestamp) {
      lastAverageTimestamp = now;
    } else if (now - lastAverageTimestamp > runtimeStatsIntervalMs) {
      // if we haven't cleared stats since the last refresh interval,
      // do so now.
      lastAverageTimestamp = now;
      runtimeStats();
    }

    // now return out the current number
    return lastAverageResponseTime;
  }

  /**
   * Computes and stores some runtime statistics for the last
   * complete 10 second time window.
   * Primarily, the average response time.
   * This function should only be called at the boundary of each
   * time window.
   */
  function runtimeStats() {
    let save = responseTimes;
    responseTimes = [];
    // save number of requests used to compute this average
    lastAverageResponseCount = save.length;
    // reset counter for current window. this is a running total
    // of requests for the current time window, not the last complete
    // one, and should be reset here. it's not used in any computation.
    numRequests = 0;

    // sort the the response time data
    save = save.sort((a, b) => a - b);
    // slice off the top 2% to account for outliers
    // use of floor means that we'll always knock off
    // the top request if we have < 100 but > 1.
    const newLen = Math.floor(save.length * 0.98);
    if (newLen) save = save.slice(0, newLen);

    // now compute mean/average.
    lastAverageResponseTime = save.length ? Math.floor(_.mean(save)) : 0;

    // last, store mem usage
    lastMemUsage = process.memoryUsage();
    lastHeapStats = v8.getHeapStatistics();
  }

  function recordRequest(responseTimeMs) {
    // do not include stupid response times in any calculation, since this
    // can throw off metrics and cause 429s. it happened at one point due
    // to a weird scoping issue in server.js
    if (
      _.isNil(responseTimeMs) ||
      _.isNaN(responseTimeMs) ||
      !_.isNumber(responseTimeMs) ||
      responseTimeMs > 300000
    ) {
      const event = {
        event: 'warning',
        errorName: 'invalid_response_time',
        data: { responseTimeMs },
        timestamp: moment().toISOString()
      };
      console.log(JSON.stringify(event));
      return;
    }
    // first check if we're at the boundary of a time window.
    // if so, compute stats and reset data now.
    const now = moment().valueOf();
    if (now - lastAverageTimestamp > runtimeStatsIntervalMs) {
      // if we haven't cleared stats since the last refresh interval,
      // do so now.
      lastAverageTimestamp = now;
      runtimeStats();
    }

    // now record the request.
    responseTimes.push(responseTimeMs);
    numRequests++;
  }

  function setup() {
    if (heartbeatEnabled) {
      intervalHandles.heartbeat = setInterval(
        heartbeat,
        heartbeatInterval * 1000
      );
    }
    if (redisEnabled) {
      intervalHandles.redis = setInterval(pushToRedis, redisInterval * 1000);
    }
  }

  function isUnhealthyResponseTime() {
    return (
      lastAverageResponseCount > minRequestsForResponseTime &&
      getLastAverageResponseTime(lastAverageResponseTime) >
        maxAverageResponseTimeMs
    );
  }

  function isUnhealthyTimeout() {
    const timeouts = getValueDiff('timeoutError');
    const requests = getValueDiff('request');
    // from "defcon b" on 3/14/2009.
    // a 5% threshold would have triggered it.
    const threshold = _.get(
      serviceContext,
      'config.healthCheck.maxTimeoutPercentage',
      5
    );
    const minRequests = _.get(
      serviceContext,
      'config.healthCheck.minRequestsForTimeoutCheck',
      200
    );

    if (requests > minRequests && (timeouts / requests) * 100 >= threshold) {
      return TIMEOUT;
    }

    // now do same with db queries
    const dbThreshold = _.get(
      serviceContext,
      'config.healthCheck.maxDatabaseTimeoutPercentage',
      threshold
    );
    const minQueries = _.get(
      serviceContext,
      'config.healthCheck.minDatabaseQueriesForTimeoutCheck',
      minRequests
    );
    const dbTimeouts = getValueDiff('sqlQueryTimeout');
    const queries = getValueDiff('sqlQuery');

    if (queries > minQueries && (dbTimeouts / queries) * 100 >= dbThreshold) {
      return TIMEOUT;
    }
    return 0;
  }

  function getStatsSummary() {
    return {
      timeouts: getValueDiff('timeoutError'),
      requests: getValueDiff('request'),
      dbTimeouts: getValueDiff('sqlQueryTimeout'),
      dbQueries: getValueDiff('sqlQuery'),
      percentFreeMem: getMemStats().percentFreeMem,
      averageResponseTimeMs: getLastAverageResponseTime(),
      averageResponseTimeRequestCount: lastAverageResponseCount,
      shutdownInProgress,
      startupInProgress
    };
  }

  function getMemStats() {
    const memU = lastMemUsage || process.memoryUsage();
    const heapStats = lastHeapStats || v8.getHeapStatistics();

    return {
      totalMemoryBytes: heapStats.heap_size_limit,
      nodeMemoryBytes: memU.rss,
      freeMemoryBytes: heapStats.total_available_size,
      percentFreeMem: Math.floor(
        (heapStats.total_available_size / heapStats.heap_size_limit) * 100
      )
    };
  }

  function isUnhealthyMemUsage() {
    const stats = getMemStats();
    return stats.percentFreeMem < minPercentFreeMem;
  }

  let adminFail = false;
  let lastDependenciesCheckedAt = Date.now();
  let lastDependencyHealth = {};

  async function healthCheck(req, res, serverStartTime) {
    let statusCode = 200;
    let status = 'ok';

    if (startupInProgress) {
      statusCode = 503;
      status = 'startup';
    } else {
      if (req.query.fail === '1') {
        adminFail = true;
      } else if (req.query.fail === '0') {
        adminFail = false;
      }

      // if shutdown in progress, 403
      if (shutdownInProgress) {
        statusCode = 403;
        status = 'shutdown';
      }

      if (adminFail === true) {
        statusCode = 403;
        status = 'admin_override';
      }

      // check free mem. don't overwrite shutdown result.
      // if shutdown in progress the other status don't matter.
      if (isUnhealthyMemUsage() && !shutdownInProgress && failOnMemUsage) {
        statusCode = 503;
        status = 'low_mem';
      }

      // check average response time over last window.
      // we'll overwrite free mem result but not shutdown
      if (
        isUnhealthyResponseTime() &&
        !shutdownInProgress &&
        failOnResponseTime
      ) {
        statusCode = 503;
        status = 'response_time';
      }
    }

    const memStats = getMemStats();
    const totalMemoryBytes = memStats.heapTotal;
    const freeMemoryBytes = memStats.heapTotal - memStats.heapUsed;
    const percentFreeMem = Math.floor(
      (freeMemoryBytes / totalMemoryBytes) * 100
    );

    const data = {
      status,
      statusCode: statusCode,
      serverHostname,
      serverStartTime,
      timestamp: moment().toISOString(),
      totalMemoryBytes: memStats.totalMemoryBytes,
      freeMemoryBytes: memStats.freeMemoryBytes,
      nodeMemoryBytes: memStats.nodeMemoryBytes,
      percentFreeMem: memStats.percentFreeMem,
      minPercentFreeMem,
      lastAverageResponseTimeMs: getLastAverageResponseTime(),
      lastAverageResponseCount: lastAverageResponseCount,
      maxAverageResponseTimeMs,
      numRequests,
      minRequestsForResponseTime
    };

    if (statusCode === 200) {
      // Check infrastructure
      let dependencyHealth = lastDependencyHealth;

      // Failsafe against too frequent healthchecks consuming resources
      // Allow resource check once every 2 minutes
      if (Date.now() - lastDependenciesCheckedAt > 120 * 1000) {
        dependencyHealth = await healthCheckDependencies({
          db: serviceContext.dbConnections,
          redis: {
            coreRedis: serviceContext.redisClient
          },
          services: {
            admin: _.get(serviceContext, 'config.services.coreAdminUri'),
            search: _.get(
              serviceContext,
              'config.services["core-search-server"].uri'
            )
          }
        });

        if (dependencyHealth.statusCode !== 200) {
          statusCode = dependencyHealth.statusCode;
          status = 'dependency_error';
        } else {
          // cache the dependency status for 2 min.
          lastDependencyHealth = dependencyHealth;
          lastDependenciesCheckedAt = Date.now();
        }
      }

      _.set(data, 'dependencies', dependencyHealth.data);
    }
    if (statusCode !== 200) {
      messageUtil.emitEvent(
        Object.assign({ event: 'unhealthy' }, data),
        heartbeatTopic
      );
      serviceContext.metrics.incrementCounter('healthCheckFailed', { status });
    } else {
      serviceContext.metrics.incrementCounter('healthCheckOk');
    }

    res.status(statusCode).set('Content-Type', 'application/json').send(data);
  }

  const failHealthCheckOnReasons = {
    shutdown: _.get(serviceContext, 'config.healthCheck.failOn.shutdown', true),
    memUsage: _.get(serviceContext, 'config.healthCheck.failOn.memUsage', true),
    responseTime: _.get(
      serviceContext,
      'config.healthCheck.failOn.responseTime',
      true
    ),
    adminOverride: _.get(
      serviceContext,
      'config.healthCheck.failOn.adminOverride',
      true
    ),

    // as of 3/20/2019 we will not fail the health
    timeout: _.get(serviceContext, 'config.healthCheck.failOn.timeout', false)
  };

  function isUnhealthy() {
    if (startupInProgress) return STARTUP_IN_PROGRESS;

    if (failHealthCheckOnReasons.shutdown && shutdownInProgress)
      return SHUTDOWN_IN_PROGRESS;
    else if (failHealthCheckOnReasons.memUsage && isUnhealthyMemUsage())
      return MEM_USAGE;
    else if (failHealthCheckOnReasons.responseTime && isUnhealthyResponseTime())
      return RESPONSE_TIME;
    else if (failHealthCheckOnReasons.adminOverride && adminFail === true)
      return ADMIN_OVERRIDE;
    else if (failHealthCheckOnReasons.timeout && isUnhealthyTimeout())
      return TIMEOUT;

    return 0;
  }

  function setStartupInProgress(arg) {
    startupInProgress = arg !== false;
  }

  function isStartupInProgress() {
    return startupInProgress;
  }

  function setShutdownInProgress(arg) {
    shutdownInProgress = arg !== false;
  }

  function isShutdownInProgress() {
    return shutdownInProgress;
  }

  function _clearIntervals() {
    Object.keys(intervalHandles).forEach((key) => {
      clearInterval(intervalHandles[key]);
    });
    const res = intervalHandles;
    intervalHandles = {};
    runtimeStats();
    return res;
  }

  function _reportHealthCheck(checkPromise, checkName, report) {
    return checkPromise
      .then(() => {
        _.set(report, `data.${checkName}.status`, 'ok');
      })
      .catch((e) => {
        _.set(report, `data.${checkName}.status`, 'error');
        _.set(report, `data.${checkName}.error`, e);
        report.statusCode = 503;
      });
  }

  async function healthCheckDependencies(resources) {
    const requestArr = [];
    const reportData = {
      statusCode: 200
    };

    // check db connections
    const dbs = _.get(resources, 'db', {});
    for (const dbConnName in dbs) {
      if (Object.hasOwnProperty.call(dbs, dbConnName)) {
        const readConn = _.get(dbs[dbConnName], 'read');
        if (readConn && _.isFunction(readConn.one)) {
          requestArr.push(
            _reportHealthCheck(
              readConn.one('SELECT 1;', []),
              `db.${dbConnName}`,
              reportData
            )
          );
        }
      }
    }

    // check redis clients
    const redis = _.get(resources, 'redis', {});
    for (const redisConnName in redis) {
      if (Object.hasOwnProperty.call(redis, redisConnName)) {
        const redisClient = redis[redisConnName];
        if (redisClient) {
          if (redisClient.connected) {
            _.set(reportData, `data.redis.${redisConnName}.status`, 'ok');
          } else if (_.isFunction(redisClient.ping)) {
            // try calling info method and reconnect
            requestArr.push(
              _reportHealthCheck(
                promisify(redisClient.info)(),
                `redis.${redisConnName}`,
                reportData
              )
            );
          }
        }
      }
    }

    // call dependent services
    const services = _.get(resources, 'services', {});
    for (const serviceName in services) {
      if (Object.hasOwnProperty.call(services, serviceName)) {
        const uri = services[serviceName];
        if (uri) {
          // ideally we want to call /health, but that is not
          // accessible through haproxy. For now any non 5xx call will be interpreted as success
          requestArr.push(
            _reportHealthCheck(
              request(uri).catch((response) => {
                if (response.statusCode < 500) {
                  return Promise.resolve(response.statusCode);
                } else {
                  return Promise.reject(response);
                }
              }),
              `service.${serviceName}`,
              reportData
            )
          );
        }
      }
    }
    await Promise.all(requestArr);
    return reportData;
  }

  const SHUTDOWN_IN_PROGRESS = 1,
    MEM_USAGE = 2,
    RESPONSE_TIME = 4,
    TIMEOUT = 8,
    ADMIN_OVERRIDE = 16,
    STARTUP_IN_PROGRESS = 32;

  return {
    setup,
    isUnhealthy,
    isUnhealthyTimeout,
    getHeartbeatStats: getFromRedis,
    healthCheck,
    setStartupInProgress,
    isStartupInProgress,
    setShutdownInProgress,
    isShutdownInProgress,
    recordRequest,
    getStatsSummary,
    SHUTDOWN_IN_PROGRESS,
    MEM_USAGE,
    RESPONSE_TIME,
    TIMEOUT,
    ADMIN_OVERRIDE,
    _clearIntervals, // unit test only
    _pushToRedis: pushToRedis, // unit test only
    _heartbeat: heartbeat // unit test only
  };
};
