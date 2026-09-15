const _ = require('lodash');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const os = require('os');

module.exports = function createFunction(serviceContext) {
  const serverHostname = os.hostname();

  const config = serviceContext.config;
  const errors = require('./error')(config);
  const mainUtil = require('./util')(config);
  const resUtil = require('./resolvers/util.js')(serviceContext);

  // the rate limit time window is a core piece of config that
  // controls server behavior. we load it straight from config.
  // it's not dynamic (no db).
  const checkIntervalSeconds = _.get(
    config,
    'rateLimit.checkIntervalSeconds',
    10
  );
  const checkIntervalMillis = checkIntervalSeconds * 1000;
  const redisClient = serviceContext.redisClient;
  const util = require('./util.js')(serviceContext);
  // note:  this is a crucial setting that controls the overall behavior
  // of the server. so it's not dynamic in the db. it needs a config change.
  const warnOnly = _.get(
    serviceContext,
    'config.featureFlags.rateLimitWarnOnly',
    false
  );
  const enabled = _.get(
    serviceContext,
    'config.featureFlags.rateLimitEnabled',
    true
  );
  const rateLimitOnUnhealthyServer = _.get(
    serviceContext,
    'config.featureFlags.rateLimitOnUnhealthyServer',
    true
  );
  const authCookieName = _.get(
    serviceContext,
    'config.auth.userTokenCookieName',
    'veritone-session-id'
  );

  const rateLimitEngineJwtByOrgEnabled =
    _.get(
      serviceContext,
      'config.featureFlags.rateLimitEngineJwtByOrgEnabled',
      false
    ) === true;

  // bootstrap config
  let rateLimitConfig = _.get(serviceContext, 'config.rateLimit', {});
  // kick off first database config update
  async function init() {
    try {
      const res = await updateConfig();
      // set up automated config refresh from postgres
      if (
        _.get(serviceContext, 'config.rateLimit.enableConfigRefresh', true) ===
        true
      ) {
        setInterval(
          () => updateConfig(),
          _.get(
            serviceContext,
            'config.rateLimit.configRefreshIntervalSeconds',
            60
          ) * 1000
        );
      }

      return res;
    } catch (err) {
      serviceContext.logger.error(err);
      throw err;
    }
  }

  /**
   * Get a rate limit config setting.
   * @param key Key
   * @param defaultValue optional default value
   */
  function getConfig(key, defaultValue) {
    return _.get(rateLimitConfig, key, defaultValue);
  }

  // updates the configuration with current values from the database
  async function updateConfig() {
    // if database update is disabled, just return out without
    // modifying the server config
    if (!_.get(serviceContext, 'config.rateLimit.enableDatabaseUpdate', true))
      return;

    // get base from datacenter-config
    // copy so we don't actually modify original config.
    const base = JSON.parse(
      JSON.stringify(_.get(serviceContext, 'config.rateLimit', {}))
    );

    let newestDbUpdate;

    // load token-level limit overrides and merge into master config
    const tokenSql = `SELECT * FROM rate_limit.config_token ORDER BY modified_date_time DESC`;
    const tokenRes = await serviceContext.dbConnections['sso'].read.query(
      tokenSql
    );

    if (!base.token) base.token = {};
    tokenRes.forEach((row) => {
      if (
        !newestDbUpdate ||
        moment(row.modified_date_time).isAfter(moment(newestDbUpdate))
      ) {
        newestDbUpdate = row.modified_date_time;
      }
      _.set(base, 'token.' + row.token_id, row.interval_limit);
    });

    // load org-level limit overrides and merge into master config
    const orgSql = `SELECT * FROM rate_limit.config_organization ORDER BY modified_date_time DESC`;
    const orgRes = await serviceContext.dbConnections['sso'].read.query(orgSql);
    if (!base.organization) base.organization = {};
    orgRes.forEach((row) => {
      if (
        !newestDbUpdate ||
        moment(row.modified_date_time).isAfter(moment(newestDbUpdate))
      ) {
        newestDbUpdate = row.modified_date_time;
      }
      _.set(
        base,
        'organization.' + _.toString(row.organization_id),
        row.interval_limit
      );
    });

    // load token type defaults and merge into master config
    const defaultSql = `SELECT * FROM rate_limit.config_token_type ORDER BY modified_date_time DESC`;
    const defaultRes = await serviceContext.dbConnections['sso'].read.query(
      defaultSql
    );
    if (!base.tokenType) base.tokenType = {};
    defaultRes.forEach((row) => {
      if (
        !newestDbUpdate ||
        moment(row.modified_date_time).isAfter(moment(newestDbUpdate))
      ) {
        newestDbUpdate = row.modified_date_time;
      }
      _.set(base, 'tokenType.' + row.default_type, row.interval_limit);
    });

    // load top-level settings
    const settingsSql = `SELECT * FROM rate_limit.config_settings ORDER BY modified_date_time DESC`;
    const settingsRes = await serviceContext.dbConnections['sso'].read.query(
      settingsSql
    );

    settingsRes.forEach((row) => {
      if (
        !newestDbUpdate ||
        moment(row.modified_date_time).isAfter(moment(newestDbUpdate))
      ) {
        newestDbUpdate = row.modified_date_time;
      }
      _.set(base, row.setting_key, row.interval_limit);
    });

    rateLimitConfig = base;

    // log the update
    const eventData = {
      event: 'rateLimitConfigUpdate',
      lastDatabaseTimestamp: newestDbUpdate
        ? moment(newestDbUpdate).toISOString()
        : undefined,
      numConfigOrganization: orgRes.length,
      numConfigToken: tokenRes.length,
      numConfigDefault: defaultRes.length,
      serverHostname
    };

    serviceContext.messageUtil.emitEvent(eventData);

    // note that an error encountered in this function
    // will be logged as an unexpected, out-of-band error.
    return base;
  }

  // handle and send an unexpected error that occurred during
  // rate limiting computation. should never happen.
  function sendUnexpectedError(err, req, res) {
    // 500. should never happen.
    const errorObj = {
      message: 'A server error was encountered.',
      name: 'internal_error',
      data: {
        errorId: uuidv4(),
        requestId: req.get('Veritone-Request-Id'),
        correlationId: req.get('Veritone-Correlation-Id'),
        time_thrown: moment().toISOString(),
        internalData: {
          stack: err.stack,
          message: err.message
        }
      }
    };

    const body = {
      errors: [errorObj]
    };

    serviceContext.messageUtil.emitErrorEvent(errorObj);
    res.status(500).send(body);
  }

  // middleware that does preliminary rate limiting before
  // the authentication middleware.
  function rateLimitMiddlewarePreAuth(req, res, next) {
    if (!enabled) {
      // if totally disabled, return now
      next();
      return;
    }

    try {
      rateLimitByServer(req);
      next();
    } catch (err) {
      if (err.name === 'rate_limited') {
        sendError(req, res, err);
      } else {
        sendUnexpectedError(err, req, res);
      }
    }
  }

  // handle and send the error, logging, and metrics
  function sendError(req, res, error) {
    const message = error.message || 'Rate limited';
    const data = error.data || {};
    // set retry info
    const now = moment();
    if (!data.retryAfterSeconds) data.retryAfterSeconds = checkIntervalSeconds;
    if (!data.retryAt) {
      data.retryAt = now.add(checkIntervalSeconds, 's').toISOString();
    }

    // set request info if available
    data.requestId = req.get('Veritone-Request-Id');
    data.correlationId = req.get('Veritone-Correlation-Id');

    // set error basic info
    data.errorId = uuidv4();
    const errorObj = {
      name: 'rate_limited',
      message,
      time_thrown: now.toISOString(),
      data
    };

    // make sure it's logged
    serviceContext.messageUtil.emitErrorEvent(errorObj);

    // clear internal data
    if (errorObj.data.internalData) errorObj.data.internalData = null;

    // format body using the graphql standard error payload
    // set retry-after header and send 429 response
    res
      .set('Retry-After', data.retryAfterSeconds)
      .set('Content-Type', 'application/json')
      .status(429)
      .send({ errors: [errorObj] });
  }

  // keep counter of total API requests per check time interval (10s)
  let requestCount = 0;

  // caches tokens that have been rate-limited during the current
  // time window so that we don't have to recompute every time if
  // a token is blasting the server.
  let limitedTokensForCurrentInterval = {};
  let limitedOrgsForCurrentInterval = {};

  // timestamp for the interval keeping the statistics above.
  let intervalStatsTimestamp = moment();

  // function that resets all cached interval statistics
  function clearIntervalStats() {
    requestCount = 0;
    limitedTokensForCurrentInterval = {};
    limitedOrgsForCurrentInterval = {};
    intervalStatsTimestamp = moment();
  }

  // this function should be called with every rate-limiting function that
  // relies on the cached statistics. we do it here on-demand rather than
  // in a setInterval timeout because if something goes wrong with the timeout
  // in production, we've got an outage. This method is foolproof.
  function checkIntervalStats() {
    if (moment().subtract(10, 'seconds').isAfter(intervalStatsTimestamp)) {
      clearIntervalStats();
    }
  }

  // operational rate limiting by server capacity.
  // throws out RateLimit error.
  function rateLimitByServer(req) {
    checkIntervalStats();

    // default in code is pretty high. higher by far than we see recorded
    // in prod (which is about 300 requests/10s/container).
    const serverMaximumPerInterval = getConfig(
      'serverMaximumPerInterval',
      10000
    );

    // 429 right away if internal monitoring considers the server to be unhealthy
    const health = serviceContext.monitoring.isUnhealthy();
    if (
      rateLimitOnUnhealthyServer &&
      health &&
      // exclude admin override for now, as it was meant to test the health check
      // capability in ELB and not entirely shut down a server
      health !== serviceContext.monitoring.ADMIN_OVERRIDE
    ) {
      let msg = '';
      switch (health) {
        case serviceContext.monitoring.SHUTDOWN_IN_PROGRESS:
          msg = 'shutdown_in_progress';
          break;
        case serviceContext.monitoring.MEM_USAGE:
          msg = 'memory_usage';
          break;
        case serviceContext.monitoring.RESPONSE_TIME:
          msg = 'response_time_degradation';
          break;
        case serviceContext.monitoring.TIMEOUT:
          msg = 'timeout';
          break;
        /*case serviceContext.monitoring.ADMIN_OVERRIDE:
          msg = 'admin_override';
          break;
          */
        default:
          msg = 'unknown';
          break;
      }
      throwServerRateLimitError(
        req,
        'This request was rate limited to maintain operational integrity. Retry in ' +
          checkIntervalSeconds +
          ' seconds.',
        'server_health',
        {
          healthCheckResponse: health,
          healthCheckStatus: msg,
          statistics: serviceContext.monitoring.getStatsSummary()
        },
        true
      );
    }

    // first check against this server's hard-coded limit.
    // here we are only checking load on this server so we don't go to redis.
    // to get a good value try this CWL query:
    // fields @timestamp, @message
    //  | filter @logStream like /core-graphql-server/
    //  | filter event like /request_start/
    //  | stats count() as CT by @logStream, bin(10s)
    //  | sort CT desc
    // TODO max that shows up in CWL is about 160-300.
    // during last perf problem (11/26 21:00) it was 73.
    if (requestCount++ > serverMaximumPerInterval) {
      throwServerRateLimitError(
        req,
        'Rate limit on server exceeded. Retry in ' +
          checkIntervalSeconds +
          ' seconds.',
        'server_capacity',
        {
          requestCountForInterval: requestCount,
          serverMaximumPerInterval
        }
      );
    }
  }

  function throwServerRateLimitError(
    req,
    message,
    reason,
    internalData,
    bypassWarnOnly
  ) {
    if (!internalData) internalData = {};
    internalData.authToken = mainUtil.obscureToken(getAuthToken(req));
    internalData.userAgent = req.get('User-Agent');
    internalData.clientIP = req.ip;

    const data = {
      reason,
      intervalDurationSeconds: checkIntervalSeconds,
      internalData,
      requestId: req.get('Veritone-Request-Id'),
      correlationId: req.get('Veritone-Correlation-Id')
    };

    // increment metric for rate limit error/warning
    serviceContext.metrics.incrementCounter('rateLimitError', { reason });

    if (warnOnly && !bypassWarnOnly) {
      // if we're only warning, log it
      serviceContext.messageUtil.emitEvent({
        message,
        errorData: data,
        event: 'warning',
        errorName: 'rate_limited',
        serverHostname
      });
    } else {
      // otherwise increment "real" error counter and throw out now
      serviceContext.metrics.incrementCounter('error');
      throw new errors.RateLimited({ message, data });
    }
  }

  // get auth token, if any, from a request object
  function getAuthToken(req) {
    let token = _.get(req, 'context.authToken');

    if (!token) {
      const authHeader = req.get('authorization');
      const cookieSessionId = req.cookies ? req.cookies[authCookieName] : null;

      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        token = authHeader.substr(7);
      } else if (cookieSessionId) {
        token = cookieSessionId;
      }
    }
    return token;
  }

  // get the base redis cache key for a rate-limited metric
  function getRateLimitBaseKey(start) {
    return (
      'core-graphql-server:rate_limit:' +
      util.getTimeWindowKey(checkIntervalSeconds, start)
    );
  }

  // get the interval rate limit for a given org
  function getIntervalRateLimitForOrg(context, orgId) {
    const tokenType = resUtil.getTokenType(context);
    const limit = getConfig(
      'organization.' + orgId,
      getConfig('tokenType.' + tokenType, getConfig('default', 1000))
    );

    return limit;
  }

  // get the interval rate limit for the authenticated token
  function getIntervalRateLimitForToken(context, token) {
    const tokenType = resUtil.getTokenType(context);

    // get configured limit by token type, if there is one.
    // otherwise get the default per-token limit.
    // limit can be configured for an individual token as well.
    const defaultTypeLimit = getConfig('tokenType.default', 1000);
    const typeLimit = getConfig('tokenType.' + tokenType, defaultTypeLimit);
    const limit = getConfig('token.' + token, typeLimit);

    return limit;
  }

  const multiExec = serviceContext.redisCache.multiExec;

  /**
   * atomically increment and retrieve a value in redis
   *
   * @param key A single key or an array of keys
   * @param value Optional single value or array of values.
   *   If defined and key is an array, must have an equal length.
   * @return The new values, in the same order as the key array
   */

  async function redisIncr(key, value) {
    const multi = serviceContext.redisClient.multi();
    // convert to array format if necessary
    const keys = _.isArray(key) ? key : [key];
    let values = value;
    if (!value) {
      // if not passed, default to 1 for all keys
      values = [];
      keys.forEach((key) => values.push(1));
    } else if (!_.isArray(value)) {
      // convert to an array if necessary
      values = [value];
    }
    // check for server code error
    if (keys.length !== values.length) {
      throw new Error('key and value array lengths must match');
    }

    // set up multi object
    for (let i = 0; i < keys.length; i++) {
      multi.incrby(keys[i], values[i]);
      multi.expire(keys[i], checkIntervalSeconds);
    }
    // make the call to redis
    const redisResult = await multiExec(multi);
    const result = [];

    // filter out the expire results (odd indexes)
    for (let i = 0; i < redisResult.length; i++) {
      if (i % 2 === 0) result.push(redisResult[i]);
    }

    // return array of new values
    return result;
  }

  // enforces rate limiting by authentication token and client info
  // such as token type, organization, etc.
  async function rateLimitByToken(req) {
    // clear interval statistics if necessary
    checkIntervalStats();

    const now = Date.now();
    let token = getAuthToken(req);

    // if there's no token, nothing we can do here.
    if (!token) return;

    // otherwise we'll switch to a hash and check rate-limiting.
    const tokenName = mainUtil.obscureToken(token);
    const tokenHash = resUtil.hash(token);

    // client info will be needed if we throw an error
    const clientInfo = resUtil.getClientInfo({ requestContext: req.context });
    const isEngine = clientInfo.type === 'engineJWT';

    // fill in org if we have app ID from engine JWT.
    // can't do this easily in getClientInfo because it requires async.
    if (isEngine && clientInfo.applicationId) {
      clientInfo.org = await serviceContext.dal.organization.getOrgIdFromAppId(
        clientInfo.applicationId
      );
    }

    // get the limit for this token.
    // note that we use the plain text token here since it will be in the db.
    const limit = getIntervalRateLimitForToken(req.context, token);
    let orgLimit;

    if (
      clientInfo.org &&
      clientInfo.org !== 'internal' &&
      rateLimitEngineJwtByOrgEnabled
    ) {
      orgLimit = getIntervalRateLimitForOrg(req.context, clientInfo.org);
      // note that we separate engine-driven load from normal user and API
      // key load. so a different key is used here.
      // note that getIntervalRateLimitForOrg supports different limits per
      // token type.
      const orgKey = clientInfo.org + ':' + isEngine;
      const cachedOrg = _.get(limitedOrgsForCurrentInterval, orgKey, 0);
      if (cachedOrg > 0) {
        limitedOrgsForCurrentInterval[orgKey]++;
        await resUtil.fillInClientInfo(clientInfo);
        throwOrgRateLimitError(
          req,
          tokenName,
          limitedOrgsForCurrentInterval[clientInfo.org],
          orgLimit,
          clientInfo
        );
      }
    }

    // if we've already rate-limited the token for this
    // current time interval, bail out now.
    // note that this case is reset with every interval.
    const cached = _.get(limitedTokensForCurrentInterval, tokenHash, 0);
    if (cached > 0) {
      // increment internal counter. this won't be exact since requests
      // can spray across different servers.
      limitedTokensForCurrentInterval[tokenHash]++;
      await resUtil.fillInClientInfo(clientInfo);
      throwTokenRateLimitError(
        req,
        tokenName,
        limitedTokensForCurrentInterval[tokenHash],
        limit,
        clientInfo
      );
    }

    if (!redisClient.connected) {
      serviceContext.logger.warn(
        'redis is down - cannot calculate rate limits'
      );
      return;
    }

    // otherwise compute key and check redis
    const baseKey = getRateLimitBaseKey(now);
    const tokenKey = baseKey + ':' + tokenHash;
    const keys = [tokenKey];

    // if we have an org, get and check its key as well
    if (clientInfo.org) {
      const orgKey = baseKey + ':' + clientInfo.org + ':' + isEngine;
      keys.push(orgKey);
    }
    const newValues = await redisIncr(keys);

    // this is the token value
    const newValue = newValues[0];
    // if the incremented value exceeds the limit...
    if (newValue > limit) {
      // add this token to list of cached rate-limited tokens
      limitedTokensForCurrentInterval[tokenHash] = newValue;
      await resUtil.fillInClientInfo(clientInfo);
      // now throw out
      throwTokenRateLimitError(req, tokenName, newValue, limit, clientInfo);
    }

    // if we checked an org limit, enforce here.
    if (newValues.length > 1) {
      const orgValue = newValues[1];
      if (orgLimit && orgValue > orgLimit) {
        limitedOrgsForCurrentInterval[
          clientInfo.org + ':' + isEngine
        ] = orgValue;
        await resUtil.fillInClientInfo(clientInfo);
        throwOrgRateLimitError(req, tokenName, orgValue, orgLimit, clientInfo);
      }
    }
  }

  // wrapper function to throw a consistent error format for
  // token-based rate limiting
  function throwTokenRateLimitError(req, token, count, limit, clientInfo) {
    const msg =
      'The request has been rate-limited because the authentication ' +
      'token in use has exceeded the maximum allowed requests for the current ' +
      'time interval. Retry in ' +
      checkIntervalSeconds +
      ' seconds.';
    throwRateLimitError(
      req,
      msg,
      token,
      count,
      limit,
      clientInfo,
      'rate_limit_token'
    );
  }

  function throwOrgRateLimitError(req, token, count, limit, clientInfo) {
    const msg =
      'The request has been rate-limited because the total API requests ' +
      'made by your organization within the current time interval has exceeded ' +
      'the maximum allowed for your organization. Retry in ' +
      checkIntervalSeconds +
      ' seconds.';

    throwRateLimitError(
      req,
      msg,
      token,
      count,
      limit,
      clientInfo,
      'rate_limit_organization'
    );
  }

  function throwRateLimitError(
    req,
    message,
    token,
    count,
    limit,
    clientInfo,
    reason
  ) {
    const data = {
      token,
      organizationId: clientInfo.org,
      clientId: clientInfo.id,
      requestsPerIntervalLimit: limit,
      intervalDurationSeconds: checkIntervalSeconds,
      requestsInCurrentInterval: count,
      tokenType: clientInfo.type,
      reason,
      requestId: req.get('Veritone-Request-Id'),
      correlationId: req.get('Veritone-Correlation-Id')
    };
    if (clientInfo.taskId) data.taskId = clientInfo.taskId;
    if (clientInfo.engineId) data.engineId = clientInfo.engineId;
    if (clientInfo.engineName) data.engineName = clientInfo.engineName;

    // increment metric for rate limit error/warning
    serviceContext.metrics.incrementCounter('rateLimitError', { reason });

    if (warnOnly) {
      // log warning if we're not configured to error out
      const event = {
        message,
        errorData: data,
        event: 'warning',
        errorName: 'rate_limited',
        serverHostname
      };
      serviceContext.messageUtil.emitEvent(event);
    } else {
      // increment "real" error counter
      serviceContext.metrics.incrementCounter('error');
      // only throw out if we're configured to do so.
      // then let the top-level error handler log it.
      throw new errors.RateLimited({ message, data });
    }
  }

  /**
   * Middleware the enforces rate limiting after the authentication step,
   * when user/key and org info are available.
   * @param req The HTTP request
   * @param res The HTTP response
   * @param next Next middleware callback
   * @param throws RateLimited error if rate limiting has been invoked
   */
  async function rateLimitMiddlewarePostAuth(req, res, next) {
    if (!enabled) {
      // if totally disabled, quit now
      next();
      return;
    }
    try {
      await rateLimitByToken(req);
      next();
    } catch (err) {
      if (err.name === 'rate_limited') {
        sendError(req, res, err);
      } else {
        serviceContext.logger.error(err);
        sendUnexpectedError(err, req, res);
      }
    }
  }

  return {
    rateLimitMiddlewarePreAuth,
    rateLimitMiddlewarePostAuth,
    init,
    _clearIntervalStats: clearIntervalStats // used in unit test only
  };
};
