if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const LRU = require('lru-cache');
const _ = require('lodash');
const bodyParser = require('body-parser');
const buildInfo = require('./buildinfo.js');
const bytes = require('bytes');
const express = require('express');
const graphqlExpressUpload = require('graphql-server-express-upload');
const messagingLib = require('@veritone/ts-messaging-lib/lib/nsq');
const moment = require('moment');
const multer = require('multer');
const expressUtil = require('./util/expressUtil.js');
const NodeCache = require('node-cache');
const os = require('os');
const prettyBytes = require('pretty-bytes');
const promBundle = require('express-prom-bundle');
const redis = require('redis');
const RedLock = require('redlock');
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');
const uuid = require('uuid');
const { NSQPubSub } = require('@veritone/graphql-nsq-subscriptions');
const GraphQLServiceConfig = require('./config/config');

const service = {
  metrics: null,
  serverBuildInfo: buildInfo.getBuildInfo(),
  serverHostname: os.hostname()
};

// TODO: refactor this to multiple sub-initialization routines.
async function setupServer() {
  // Retrieve config and feature flags
  const config = await GraphQLServiceConfig.getConfig();
  // # init config dependent utils
  const mainUtil = require('./util')(config);
  const app = require('@veritone/core-server-base')(config);

  const sentryDsn = config.sentryIo.dsn; // if this is empty Sentry won't be enabled
  const isSentryEnabled = Boolean(sentryDsn);
  const sentryHttpTrace = config.sentryIo.httpTrace;
  const sentrySampleRate = config.sentryIo.sampleRate;

  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      new Sentry.Integrations.Http({ tracing: sentryHttpTrace }), // enable HTTP calls tracing
      new Tracing.Integrations.Express({ app }) // enable Express.js middleware tracing
    ],
    tracesSampleRate: sentrySampleRate,
    environment: process.env.ENVIRONMENT || 'unknown'
  });

  if (isSentryEnabled) {
    // RequestHandler creates a separate execution context using domains, so that every
    // transaction/span/breadcrumb is attached to its own Hub instance
    app.use(Sentry.Handlers.requestHandler());
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());
  }

  const graphqlConfig = require('./graphqlConfig.js')(config);
  const errors = require('./error')(config);
  app.correlator.patchRequestPkg(require('request')).patchPgPkg(require('pg'));

  const middlewareAuth = app.middleware;

  const toolsPath = config.toolsPath || '/tools';
  const enableSDRestEndpoint = _.get(
    config,
    'featureFlags.sdRestEndpoint',
    false
  );
  const sdApiPath = _.get(config, 'sdApiPath', '/structured-data');
  const enableLaunchEndpoints = _.get(
    config,
    'featureFlags.launchEndpoints',
    true
  );

  // ## setup metrics
  const customMetrics = require('./customMetrics.js')(app);
  const metricsCounters = customMetrics.metricsCounters;
  service.metrics = require('./metrics.js')({
    metricsCounters,
    logger: app.logger
  });

  // any gauges that need to be periodically cleared, do that here.
  setInterval(() => {
    service.metrics.resetGauge('awsURLSignError10Sec');
  }, 10000);

  // set virtual asset feature flag gauge
  metricsCounters.virtualAssetFeatureEnabled.set(
    _.get(config, 'featureFlags.virtualAssetEnabled', false) ? 1 : 0
  );

  // ## uploader
  const uploadSizeLimit = bytes.parse(
    _.get(config, 'server.uploadSizeLimit', 100000000)
  );
  const querySizeLimit = bytes.parse(
    _.get(config, 'server.requestSizeLimit', 5000000)
  );
  app.logger.info(
    `Query size limit is ${querySizeLimit}(${prettyBytes(querySizeLimit)})`
  );
  app.logger.info(
    `Query size limit is ${uploadSizeLimit}(${prettyBytes(uploadSizeLimit)})`
  );

  const upload = multer({
    dest: '/tmp',
    limits: {
      fieldSize: querySizeLimit,
      fileSize: uploadSizeLimit
    }
  });

  //# constants
  const maxErrorDataLength = _.get(config, 'server.maxErrorDataLength', 10000);
  const newErrorId = errors.newErrorId;

  //# app dependent init
  exports.auditLog = app.auditLog;

  app.logger.info(`NODE_ENV=${process.env.NODE_ENV}`);

  // if an error was encountered on initialization, we'll
  // still start up and make other functions available.
  // dal/structureddata.js handles this case cleanly.
  let messagingV2;
  try {
    messagingV2 = await new messagingLib.NsqProducer(config.messaging).init();
  } catch (err) {
    app.logger.error('Server initialization error:  ' + err, err);
    // in normal environments we'll crash rather than start up with error.
    // this can be overridden on dev.
    if (_.get(config, 'exitOnServerInitError', true) === true) {
      app.logger.error('The server will exit NOW');
      process.exit(1);
    }
  }
  const pgWrapper = require('@veritone/core-server-base/pg')(config, 'core'),
    logger = app.logger;


  for (const warning of _.get(
    config,
    'server.headers.csp.sanitizationWarnings',
    []
  )) {
    logger.warn(warning);
  }

  const groupToOrgCache = new NodeCache({
    stdTTL: 60 * 60, // TTL of 1 hour
    checkperiod: 10 * 60 // purge every 10 min
  });

  const orgToGroupCache = new NodeCache({
    stdTTL: 60 * 60, // TTL of 1 hour
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineCategoryListCache = new NodeCache({
    stdTTL: 5 * 60, // TTL of 5 minutes
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineCacheLocal = new NodeCache({
    stdTTL: _.get(config, 'engineCache.maxAgeSeconds', 5 * 60 * 60), // 5 min
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineListCache = new NodeCache({
    stdTTL: 5 * 60, // TTL of 5 minutes
    checkperiod: 10 * 60 // purge every 10 min
  });

  const lruCacheMaxAgeInMs = config.lruCacheMaxAgeInMs || 600000; // default: 10 minutes
  const lruCacheMaxItems = config.lruCacheMaxItems || 500;
  const appIdToOrgIdCache = new LRU({
    max: lruCacheMaxItems,
    ttl: lruCacheMaxAgeInMs
  });

  const serviceContext = {
    serverHostname: service.serverHostname,
    app,
    config,
    logger,
    metricsCounters,
    pg: pgWrapper,
    metrics: service.metrics,
    messagingV2,
    groupToOrgCache,
    orgToGroupCache,
    engineCategoryListCache,
    engineCacheLocal,
    engineListCache,
    appIdToOrgIdCache
  };

  const redisClient = redis.createClient(serviceContext.config.redis);
  serviceContext.redisClient = redisClient;
  const coreAdminRedisClient = redis.createClient(
    serviceContext.config.coreAdminRedis
  );
  serviceContext.coreAdminRedisClient = coreAdminRedisClient;

  serviceContext.createRedisLock = (lockOptions) => {
    return new RedLock([redisClient], lockOptions);
  };

  // TODO metrics and logging for this stuff
  redisClient.on('error', (err) => {
    if (err.code === 'NR_CLOSED' || err.code === 'CONNECTION_BROKEN') {
      service.metrics.incrementCounter('redisDropped', { code: err.code });
    }
    serviceContext.logger.error(err);
    serviceContext.logger.error('redis connection failure!');
    messageUtil.emitErrorEvent(
      'redis connection failure! ' + err,
      'redis_dropped'
    );
  });
  redisClient.on('connect', () => {
    serviceContext.logger.debug('redis connected');
  });
  redisClient.on('reconnecting', (params) =>
    serviceContext.logger.debug('redis reconnecting', params)
  );
  serviceContext.redisCache = require('./redisCache.js')(serviceContext);
  serviceContext.pubsub = new NSQPubSub({
    nsqConfig: config.messaging,
    onSubscribe: (subId, triggerName, createdAt) => {
      serviceContext.logger.info(
        `New client (${subId}) subscribed to ${triggerName} topic at ${createdAt}`
      );
    },
    onUnsubscribe: (subId, triggerName, deletedAt) => {
      serviceContext.logger.info(
        `Client ${subId} unsubscribed from ${triggerName} topic at ${deletedAt}`
      );
    }
  });

  coreAdminRedisClient.on('error', (err) => {
    serviceContext.logger.error(err);
    serviceContext.logger.error('redis connection failure!');
  });
  coreAdminRedisClient.on('connect', () => {
    serviceContext.logger.debug('redis connected');
  });
  coreAdminRedisClient.on('reconnecting', (params) =>
    serviceContext.logger.debug('redis reconnecting', params)
  );

  const messageUtil = require('./messageUtil.js')(serviceContext);
  serviceContext.messageUtil = messageUtil;

  const monitoring = require('./monitoring.js')(serviceContext);
  serviceContext.monitoring = monitoring;
  monitoring.setup();

  await require('./dbMigrator')(
    config,
    app.logger,
    metricsCounters,
    redisClient,
    service.serverBuildInfo
  ).migrate();

  serviceContext.dbConnections = require('./initdb.js')(
    serviceContext.logger,
    serviceContext.config,
    serviceContext.metricsCounters
  );

  const { storage, s3Buckets } = await require('./s3Util.js')(serviceContext);
  serviceContext.storage = storage;
  serviceContext.coreStorage = storage;
  serviceContext.blls3 = require('./modules/core-job-server/bll/s3')(
    app,
    storage
  );
  serviceContext.s3Buckets = s3Buckets;
  app.storage = storage;
  serviceContext.librariesService = require('./modules/core-media-server/service/libraries/bll')(
    serviceContext
  ).flatten();

  // Initialise the bucket-aware presigner singleton (for URI-based signing with fallback support)
  const bucketPresigner = require('./util/presigner.s3.buckets.js');
  bucketPresigner.init(serviceContext);

  // Legacy presigner for non-bucket-aware callers (e.g. source.js with explicit region/bucket/key params)
  const legacyPresigner = require('./util/presigner.s3.js');
  serviceContext.s3 = { presignUrl: legacyPresigner.presignUrl };

  app.producer = messagingV2;

  const metering = require('./metering.js')(serviceContext);

  // import core-admin-server modules
  const coreAdmin = require('./coreAdmin.js')(serviceContext);
  serviceContext.coreAdmin = coreAdmin;

  const oktaAuth = require('./oktaAuth.js')(serviceContext);

  // import core-job-server modules
  const coreJob = require('./coreJob.js')(serviceContext);
  serviceContext.coreJob = coreJob;
  const resUtil = require('./resolvers/util.js')(serviceContext);

  const okErrors = messageUtil.okErrors;

  const rateLimit = require('./rateLimit.js')(serviceContext);
  await rateLimit.init();

  app.use(app.middleware.corsHeaders);

  // register handler for okta authorization code callbacks
  const authPath = _.get(serviceContext, 'config.apiAuthPath', '/auth');
  app.get(
    authPath + '/authorization-code-callback',
    oktaAuth.oktaAuthCodeCallback
  );
  // register handler for endpoint used to get user auth type and
  // redirect to appropriate authentication endpoint
  // accepts plain form POST and the usual json.
  app.post(
    authPath + '/auth-type',
    bodyParser.urlencoded({ extended: true }),
    bodyParser.json(),
    oktaAuth.getSigninMethod
  );

  app.post(
    authPath + '/auth-type/:orgAlias',
    bodyParser.urlencoded({ extended: true }),
    bodyParser.json(),
    oktaAuth.getSigninMethod
  );

  //const reactPackageName = '@apollographql/graphql-playground-react';
  app.use(graphqlConfig.apiPath, rateLimit.rateLimitMiddlewarePreAuth);
  // app.use(
  //   `${graphqlConfig.apiPath}/${reactPackageName}`,
  //   express.static(
  //     require.resolve('graphql-playground-react/package.json').slice(0, -12)
  //   )
  // );

  const Shortcuts = require('./modules/shortcuts');
  const shortcut = new Shortcuts(serviceContext);
  const asyncHandler = (fn) => {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  };
  const maxValidateLimit = _.get(config, 'server.validatorSizeLimit', '1mb');

  try {
    app.post(
      `${toolsPath}/engine/validate`,
      express.json({
        limit: maxValidateLimit,
        type: 'application/json',
        extended: true
      }),
      asyncHandler(shortcut.validateEngineOutput)
    );
    app.post(
      `${toolsPath}/engine/validate/:validationContract`,
      express.json({ limit: maxValidateLimit }),
      asyncHandler(shortcut.validateEngineOutput)
    );
  } catch (err) {
    serviceContext.logger.warn('WARNING:  validation API not enabled. ' + err);
  }

  const Fastspring = new (require('./modules/webhooks/fastspring'))(
    serviceContext
  );
  /* NOTICE: Keep this above general bodyParser.json() on all endpoints to prevent it from overriding bodyParser.raw() */
  app.post(
    '/webhooks/fastspring',
    express.json({
      verify: (req, res, buf, enc) => (req.rawBody = buf)
    }),
    Fastspring.handleEvents
  );

  // USED FOR TESTING ONLY
  // enable coverage report endpoints

  const rtCov = require('./runtimeCoverage.js')(app, config);
  // uncomment the following line to run local CI tests
  // rtCov.init();

  const killAfterSec =
    process.env.LOCAL_TEST_KILL_SERVER_AFTER_SEC ||
    config.LOCAL_TEST_KILL_SERVER_AFTER_SEC;
  if (killAfterSec) {
    serviceContext.logger.warn(
      '\n\n LOCAL TEST RUN ONLY! THIS SERVER WILL DIE AFTER ' +
        killAfterSec +
        ' SECONDS!\n\n'
    );
    const millis = _.toNumber(killAfterSec) * 1000;
    setTimeout(() => {
      serviceContext.logger.warn(
        '\n\n LOCAL TEST RUN ONLY! KILLING SERVER NOW AFTER ' +
          killAfterSec +
          ' SECONDS!\n\n'
      );
      rtCov.writeCoverage();
      process.exit(0);
    }, millis);
  }

  const jsonBodyParser = bodyParser.json({
    limit: _.get(config, 'server.requestSizeLimit')
  });

  // Gates both the raw-stream body-parser bypass below and the storage-route
  // registration further down; see isLocalStorageEndpointEnabled for the rule.
  const {
    isLocalStorageEndpointEnabled
  } = require('./util/storageEndpoint');
  const localStorageEndpointEnabled = isLocalStorageEndpointEnabled(config);

  app.use((req, res, next) => {
    if (
      localStorageEndpointEnabled &&
      req.path.startsWith(_.get(config, 'storageApiPath', '/storage'))
    ) {
      app.logger.debug('storage endpoint req', req);

      req.on('abort', () => {
        app.logger.error('storage endpoint req abort.', req);
      });
      req.on('finish', () => {
        app.logger.debug('storage endpoint req finish.', req);
      });
      req.on('close', () => {
        app.logger.debug('storage endpoint req close.', req);
      });
      req.connection.on('timeout', () => {
        app.logger.info('storage endpoint req timeout', req);
      });
      next();
    } else {
      jsonBodyParser(req, res, next);
    }
  });

  app.use(
    graphqlConfig.apiPath,
    middlewareAuth.authenticationOption('optional'),
    middlewareAuth.loadAuthDataByToken
  );
  app.use(graphqlConfig.apiPath, rateLimit.rateLimitMiddlewarePostAuth);

  if (graphqlConfig.enableInternalSchema) {
    app.use(
      graphqlConfig.apiPathInternal,
      rateLimit.rateLimitMiddlewarePreAuth
    );

    app.use(
      graphqlConfig.apiPathInternal,
      middlewareAuth.authenticationOption('optional'),
      middlewareAuth.loadAuthDataByToken
    );

    app.use(
      graphqlConfig.apiPathInternal,
      rateLimit.rateLimitMiddlewarePostAuth
    );
  }
  // set up prometheus metrics endpoint
  // any routes we set up after this point wil be monitored.
  const metricsMiddleware = promBundle({
    includeMethod: true
  });
  app.use(metricsMiddleware);

  app.use(
    express.static('web', {
      setHeaders: (res) => {
        // Content-Security-Policy
        const csp = _.get(config, 'server.headers.csp.value', '');
        if (csp !== '' && checkAPIPathForCSP(res.req)) {
          res.set('Content-Security-Policy', csp);
        }
      }
    })
  );

  // register multipart form post handler
  app.use(upload.single('file'));
  // register middleware that cleans up multer /tmp files
  app.use(expressUtil.cleanupMultipartUploads);
  app.use(graphqlExpressUpload({ endpointURL: graphqlConfig.apiPath }));
  if (graphqlConfig.enableInternalSchema) {
    app.use(
      graphqlExpressUpload({ endpointURL: graphqlConfig.apiPathInternal })
    );
  }

  app.use(headerSetup);

  if (enableSDRestEndpoint === true) {
    const sizeLimit = _.get(
      config,
      'server.structuredDataPostSizeLimit',
      5242880
    );
    // Need this to happen before detectBody check for SD endpoint
    const xmlParser = require('express-xml-bodyparser');
    app.use(
      sdApiPath,
      bodyParser.urlencoded({ extended: true, limit: sizeLimit })
    );
    app.use(sdApiPath, bodyParser.text({ limit: sizeLimit }));
    app.use(sdApiPath, xmlParser({ explicitArray: false }));
  }

  // make sure that apollo does not intercept and reject an OPTIONS request.
  // CORS headers are set by the corsHeaders middleware, configured above.
  // also set up some common headers
  app.use((request, response, next) => {
    if (request.method === 'OPTIONS') response.status(200).send();
    else {
      detectBody(request, response, next);
    }
  });

  function detectBody(req, res, next) {
    if (
      req.method === 'POST' &&
      _.isEmpty(_.get(req, 'body', {})) &&
      !(
        req.url.startsWith(
          _.get(
            config,
            'storageEndpoint',
            'https://api.veritone.com/v3/storage'
          )
        ) && req.readable
      )
    ) {
      // override apollo's weird handling of this case.
      // if we throw out here then the error handler we configure
      // below will catch it, analyze the request, and send a suitable response.
      throw new Error('__NOJSON__ no request JSON body detected');
    } else next();
  }

  // sets some headers on the REQUEST that are used internally within
  // the graphql context code.
  // also set some standard headers on the response
  function headerSetup(req, res, next) {
    const headers = _.mapKeys(req.headers, function (value, key) {
      return key.toLowerCase();
    });
    let reqId = headers['veritone-request-id'];
    if (!headers['veritone-request-id']) {
      reqId = uuid.v4();
      req.headers['veritone-request-id'] = reqId;
    }
    res.set('veritone-request-id', reqId);
    res.set('veritone-service-ip', service.serverHostname);
    const awsTraceId = headers['x-amzn-trace-id'];
    if (awsTraceId) res.set('x-amzn-trace-id', awsTraceId);
    let buildDate = service.serverBuildInfo.buildDate;
    if (!buildDate) buildDate = '';
    else if (!_.isString(buildDate)) {
      buildDate = service.serverBuildInfo.buildDate.toISOString();
    }
    const buildStr = `core-graphql-server_${service.serverBuildInfo.buildNumber}_${buildDate}_${service.serverBuildInfo.commitHash}`;
    res.set('veritone-build-info', buildStr);

    let corId = headers['veritone-correlation-id'];
    if (!corId) {
      // if correlation ID wasn't passed in, we'll set it to the request ID,
      // which is set by haproxy and guaranteed to exist.
      // then we know on a given haproxy log entry what the correlation ID is.
      corId = reqId;
    }
    res.set('veritone-correlation-id', corId);
    // Content-Security-Policy
    const csp = _.get(config, 'server.headers.csp.value', '');
    if (csp !== '' && checkAPIPathForCSP(req)) {
      res.set('Content-Security-Policy', csp);
    }

    next();
  }

  function checkAPIPathForCSP(req) {
    if (!req || !_.isString(req.originalUrl)) {
      return false;
    }

    const reqPath = req.originalUrl;
    const paths = _.get(config, 'server.headers.csp.paths');
    if (paths === null) {
      return true;
    }
    if (_.isArray(paths)) {
      for (const p of paths) {
        if (reqPath.includes(p)) {
          return true;
        }
      }
    }

    return false;
  }

  // clears timeout info from the context for a request that has finished
  function removeTimeout(context) {
    if (context.timeoutInfo) {
      context.timeoutInfo.requestCompleted = true;
      if (context.timeoutInfo.timeoutHandle) {
        try {
          clearTimeout(context.timeoutInfo.timeoutHandle);
        } catch (err) {
          // this doesn't actually happen. passing an empty
          // or already-cleared value to clearTimeout just no-ops.
          app.logger.warn('failed to clear request timeout');
        }
      }
    }
  }

  const MASKED_FIELD_PATHS = new Set(
    (_.get(config, 'schemas.public.maskedFields') || []).map((x) => x.fieldPath)
  );

  function redactInputRequest(requestInfo, context, extraContext) {
    const redactedRequest = {
      query: '',
      variables: ''
    };

    if (!requestInfo) {
      return redactedRequest;
    }

    if (_.isObject(context.fieldStats)) {
      for (const f in context.fieldStats) {
        if (Object.hasOwnProperty.call(context.fieldStats, f)) {
          if (MASKED_FIELD_PATHS.has(f)) {
            redactedRequest.query = f;
            return redactedRequest;
          }
        }
      }
    }

    let query = _.get(requestInfo, 'query', '');

    // retrieve only the relevant operation from the query
    const location = _.get(extraContext, 'operation.loc', {});
    if (
      _.isNumber(location.start) &&
      _.isNumber(location.end) &&
      location.source &&
      _.isString(location.source.body)
    ) {
      query = location.source.body.substring(location.start, location.end);
    }
    redactedRequest.query = mainUtil.truncate(query, maxErrorDataLength);

    if (_.isObject(requestInfo.variables)) {
      // Only retrieve vars used in the operation
      const queryVarDeclarations = _.compact(
        _.get(extraContext, 'operation.variableDefinitions', []).map((x) =>
          _.get(x, 'variable.name.value')
        )
      );
      const queryVars = _.pick(requestInfo.variables, queryVarDeclarations);
      if (!_.isEmpty(queryVars)) {
        redactedRequest.variables = mainUtil.truncate(
          JSON.stringify(queryVars),
          maxErrorDataLength
        );
      }
    }

    return redactedRequest;
  }

  /**
   * Final logging and other logic that must occur after the request has been
   * fully resolved and response generated.
   */
  function handleFinalResponse(response, context, extraContext) {
    // clear the timeout info as request has finished.
    removeTimeout(context);

    // mark request as complete and clear the timeout
    const now = Date.now();
    const errorCount = response.errors ? response.errors.length : 0;
    let responseSize = _.get(context, 'requestInfo.responseTotalSize', 0);
    const errors = response.errors || [];
    let errorIds = _.compact(
      errors.map((error) => _.get(error, 'data.errorId'))
    );
    const errorNames = _.uniq(_.compact(errors).map((error) => error.name));
    /*
    TODO this structure causes message to not be emitted ?
    const errorMap = {};
    errors.forEach(error => {
      const val = errorMap[error.name] || 0;
      errorMap[error.name] = val + 1;
    });
    if (_.get(context, 'timeoutInfo.errorId')) {
      errorIds.push(_.get(context, 'timeoutInfo.errorId'));
      if (!errorMap['request_timeout']) {
        errorMap['request_timeout'] = 1;
      } else errorMap['request_timeout'] += 1;
    }*/
    if (errorIds && errorIds.length > 1000) {
      errorIds = errorIds.slice(0, 1000);
    }
    if (isNaN(responseSize)) responseSize = 0;
    const elapsedMs = now - context.requestInfo.startTime;
    const clientInfo = resUtil.getClientInfo(context);

    const redactedRequest = redactInputRequest(
      context.requestInfo,
      context,
      extraContext
    );

    const data = {
      id: uuid.v4(), // event ID
      event: 'request',
      serviceName: 'core-graphql-server',
      type: 'api',
      requestId: context.requestInfo.requestId,
      correlationId: context.requestInfo.correlationId,
      startTime: context.requestInfo.startTime,
      elapsedMs,
      errorCount,
      errorIds,
      errorNames,
      //errorTypes: errorMap, // TODO see above
      serverHostname: service.serverHostname,
      timestampMs: now,
      fieldStatistics: context.fieldStats,
      clientIp: context.requestInfo.clientIP,
      userAgent: context.requestInfo.userAgent,
      httpOrigin: context.requestInfo.httpOrigin,
      httpReferer: context.requestInfo.httpReferer,
      httpForwardedFor: context.requestInfo.httpForwardedFor,
      user: clientInfo,
      query: redactedRequest.query,
      responseSizeBytes: responseSize,
      responseSize: prettyBytes(responseSize),
      totalCost: context.requestInfo.totalCost,
      success: errorCount === 0,
      objectCacheHits: context._objectCacheHits,
      objectCacheMisses: context._objectCacheMisses,
      ip: context.requestInfo.clientIP
    };

    // don't truncate variables since that will result in invalid json.
    // just omit it if text is too long
    if (context.requestInfo.variables) {
      if (
        JSON.stringify(context.requestInfo.variables).length <
        maxErrorDataLength
      ) {
        data.variables = redactedRequest.variables;
      }
    }
    // if request resulted in a timeout, add this info to the event data
    if (context.timeoutInfo && context.timeoutInfo.timedOutAt) {
      data.timedOutAt = context.timeoutInfo.timedOutAt;
    }
    monitoring.recordRequest(elapsedMs);

    service.metrics.observeHistogram('graphqlResponseSizeBytes', responseSize);
    if (_.isNumber(context.requestInfo.totalCost)) {
      service.metrics.observeHistogram(
        'graphqlQueryCost',
        context.requestInfo.totalCost
      );
    }

    messageUtil.emitEvent(data);

    // metering event
    metering.meterAPIRequest(context);

    if (
      _.get(config, 'featureFlags.includeQueryStatisticsOnResponse', false) ===
      true
    ) {
      response.data._queryStatistics = {
        totalComputeCost: context.requestInfo.totalCost,
        elapsedMs,
        requestId: context.requestInfo.requestId,
        correlationId: context.requestInfo.correlationId
      };
    }
    const errorOnMaxCost =
      _.get(config, 'featureFlags.errorOnMaxCost', false) === true;
    const maxCost = _.get(context, 'config.maxRequestCost', 1000);
    if (context.requestInfo.totalCost > maxCost && !errorOnMaxCost) {
      const costWarning = {
        event: 'warning',
        id: uuid.v4(),
        errorName: 'capacity_exceeded',
        message:
          'Compute cost for this query exceeded the max allowed, but ' +
          'errors are disabled. This is a warning only.',
        data: {
          totalCost: context.requestInfo.totalCost,
          maximumAllowedCost: maxCost,
          fieldCostStats: context.fieldStats,
          requestId: context.requestInfo.requestId,
          correlationid: context.requestInfo.correlationId,
          query: data.query,
          variables: data.variables
        }
      };
      if (!context.requestInfo.warnings) context.requestInfo.warnings = [];
      context.requestInfo.warnings.push(costWarning);
      messageUtil.emitEvent(costWarning);
    }
    if (context.requestInfo.warnings)
      response.data.warnings = context.requestInfo.warnings;

    return response;
  }

  serviceContext.finalResponseHandler = handleFinalResponse;

  const { GraphqlServer } = require('./graphqlServer');
  const graphqlServer = new GraphqlServer(serviceContext);
  graphqlServer.setupServer();

  const fatalErrors = require('./fatalErrors.js')(serviceContext);

  // handle SIGTERM and SIGQUIT signals gracefully by closing the server so
  // that it doesn't accept any new connections, waiting for all active
  // connections to complete, and then exiting the process.
  let exitOnNextCount = false;
  let shutdownInProgress = false;

  function handleSigterm(server, signal) {
    if (shutdownInProgress) {
      messageUtil.emitEvent({
        message:
          signal + ' event received -- duplicate, shutdown already in progress'
      });
      return;
    }
    shutdownInProgress = true;
    monitoring.setShutdownInProgress();
    messageUtil.emitEvent({
      event: 'process_signal',
      signal: signal,
      requestsInProcess: service.metrics.getValue('concurrentRequests'),
      message:
        signal +
        ' event -- Received with ' +
        service.metrics.getValue('concurrentRequests') +
        ' requests in process.'
    });

    // first we close the server. this prevents it from accepting any new connections.
    // the callback is invoked when all open connections are closed.
    // if a client/proxy is holding idle connections open then this might not
    // happen for a while.
    server.close(() => {
      messageUtil.emitCrashEvent(
        signal +
          ' event -- Server shut down gracefully, all client connections closed.',
        false
      );
      process.exit(0);
    });

    // every second, check if we're at 0 requests in progress. if so, exit immediately.
    // this shuts down the server cleanly faster if someone is holding idle
    // connections open and thus preventing server.close() from completing.
    setInterval(() => {
      const activeRequests = service.metrics.getValue('concurrentRequests');
      if (activeRequests > 0) {
        // if requests are active, log and do nothing else.
        const data = {
          message:
            signal +
            ' event -- ' +
            activeRequests +
            ' requests are in progress.',
          activeRequests
        };
        messageUtil.emitEvent(data);
      } else {
        // if no requests are active, we'll wait one more second to make sure
        // any just-finished requests are written to the client (since our counter
        // decrements in core-graphql code and might happen before the framework
        // is actually done writing the response).
        // exitOnNextCount indicates that we've waited and it's ok to exit.
        // TODO it's possible that we'll still break requests if a proxy is
        // holding open an idle connection and then sends a request to it
        // after we've exiting (thus killing the connection on our side).
        // that would cause 502. testing will show if that's actually a problem.
        // ELB should not be routing any requests to a server that's been
        // taken out of service, but it might if it relies on draining new
        // connections.
        if (exitOnNextCount) {
          messageUtil.emitCrashEvent(
            signal +
              ' event -- connections are open but all requests are complete. process is exiting NOW',
            false
          );
          process.exit(0);
        } else {
          // don't exit yet but mark for the next iteration.
          exitOnNextCount = true;
        }
      }
    }, 1000); // 1 sec interval

    // impose a hard limit -- even if requests are still in process, we don't
    // want shutdown taking too long. our limit is the max request processing
    // time + 2 seconds. if a request hasn't already been cut off by this time,
    // processing is hung and might never complete.
    // requests lasting longer than timeoutMillis (the server hard limit)
    // will be cut off with 503/429. so we know that if the server still has
    // not closed, it's because of keepalive connections somewhere that we
    // can kill without breaking a client request.
    const timeoutMillis = _.get(config, 'server.requestTimeoutSec', 115) * 1000;
    setTimeout(() => {
      messageUtil.emitCrashEvent(
        signal +
          ' event -- graceful shutdown failed, process is exiting NOW. ' +
          'All client requests have been processed. This likely means that a proxy is keeping ' +
          'connections open with keepalive for reuse and does not indicate a problem.',
        false
      );
      process.exit(0);
    }, timeoutMillis + 2 * 1000); // max request response time + 2s buffer
  }

  /*
   * Custom  Express error handler that adds metrics and some formatting
   * so that error format is more-or-less consistent across errors handled
   * by GraphQL and Express itself.
   */
  function errorHandler(err, req, res, next) {
    // clear timeout info. request is finished at this point, since
    // express caught an error.
    clearTimeout(req.context);

    if (!res.headersSent && !res.get('veritone-request-id')) {
      headerSetup(req, res, () => {});
    }
    const headers = _.mapKeys(req.headers, function (value, key) {
      return key.toLowerCase();
    });

    let code = err.statusCode || 500;
    const error = JSON.parse(JSON.stringify(err));
    let message = err.message || 'A server error occurred.';
    serviceContext.logger.error(JSON.stringify(err, null, 2));
    if (!error.data) error.data = {};
    let contentType =
      req.headers['Content-Type'] || req.headers['content-type'];
    contentType = contentType ? contentType.toLowerCase() : '';
    const contentLength =
      req.headers['Content-Length'] || req.headers['content-length'];

    error.data.requestId = req.headers['veritone-request-id'];
    error.data.correlationId = req.headers['veritone-correlation-id'];

    // for errors caused by invalid HTTP requests, we can do a little
    // extra checking and send a better type and message.
    if (error.type === 'entity.parse.failed') {
      error.name = 'invalid_input';
      error.message =
        'The request body did not contain valid JSON. Validate ' +
        'your JSON format and try again. For application/json requests, ' +
        'the request body must include valid JSON containing a "query" string element ' +
        'with the GraphQL query. ' +
        'See https://docs.veritone.com/#/apis/tutorials/graphql-basics for more information.';
    } else if (error.type === 'entity.too.large') {
      error.name = 'invalid_input';
      error.message =
        'The request payload was larger than the limit allowed ' +
        'by this server. The maximum JSON request size is ' +
        error.limit +
        ' bytes (' +
        prettyBytes(error.limit) +
        '). ' +
        'See https://docs.veritone.com/#/apis/tutorials/uploading-large-files ' +
        'for more information.';
      code = 413;
      error.data.limitInBytes = error.limit;
      error.data.requestSize = error.length;
    } else if (error.code === 'LIMIT_FILE_SIZE') {
      code = 413;
      error.name = 'invalid_input';
      error.message =
        'The file upload was larger than the limit allowed ' +
        'by this server. The maximum file upload size is ' +
        error.limit +
        ' bytes (' +
        prettyBytes(error.limit) +
        ').' +
        'See https://docs.veritone.com/#/apis/tutorials/uploading-large-files ' +
        'for more information.';
      error.data.limitInBytes = error.limit;
      if (!_.isNil(contentLength)) error.data.requestSize = contentLength;
    } else if (error.code === 'LIMIT_FIELD_VALUE') {
      error.name = 'invalid_input';
      error.message =
        'The request payload was larger than the limit allowed ' +
        'by this server. The maximum JSON request size is ' +
        error.limit +
        ' bytes (' +
        prettyBytes(error.limit) +
        '). ' +
        'See https://docs.veritone.com/#/apis/tutorials/uploading-large-files ' +
        'for more information.';
      code = 413;
      error.data.limitInBytes = error.limit;
      if (!_.isNil(contentLength)) error.data.requestSize = contentLength;
    } else if (err.toString().includes('Must provide document')) {
      code = 400;
      error.name = 'invalid_input';
      error.message =
        'The HTTP request must include valid JSON in the body containing a "query" ' +
        'string element with the GraphQL query (for application/json) or a "query" parameter ' +
        'containing the GraphQL query (for multipart/form-data). ' +
        'See https://docs.veritone.com/#/apis/tutorials/graphql-basics for more information.';
    } else if (
      !(
        contentType.startsWith('application/json') ||
        contentType.startsWith('multipart/form-data')
      )
    ) {
      code = 400;
      error.name = 'invalid_input';
      error.message =
        'The HTTP request has an invalid content type as sent in the "Content-Type" header. ' +
        'Acceptable content types are "application/json" and "multipart/form-data". ' +
        'See https://docs.veritone.com/#/apis/tutorials/graphql-basics for more information.';
      error.data.contentType = contentType || 'not set';
    } else if (error.status === 401) {
      code = 401;
      error.name = 'not_allowed';
      error.message =
        'The request did not contain a valid authentication token. If a token ' +
        'was passed in the Authorization header, it may be expired.';
    } else if (err.message && err.message.startsWith('__NOJSON__')) {
      error.name = 'invalid_input';
      code = 400;
      error.message =
        'The request body was empty. Send valid JSON in ' +
        'the POST request body to continue. ' +
        'See https://docs.veritone.com/#/apis/tutorials/graphql-basics for more information.';
    } else if (err.name === 'GraphQLError') {
      code = 400;
      error.name = 'invalid_input';
    } else if (error.name === 'rate_limited') {
      // special handling for 420 / rate limited
      code = 429;
      if (!res.headersSent) {
        res.set('Retry-After', _.get(err, 'data.retryAfterSeconds'));
      }
      delete error._showLocations;
      delete error._error;
      delete error._showPath;
      delete error.internalData;
    } else if (err.name) {
      // handle internally-thrown ApolloError
      error.name = err.name;
      error.message = err.toString();
      //delete error._showLocations;
    } else {
      code = 500;
      error.name = 'internal_error';
      error.message =
        'The server experienced an internal error. Please report ' +
        'this error to Veritone support and include the entire response payload ' +
        'and, if possible, the query that caused the error.';
    }

    if (!error.data.errorId) {
      error.data.errorId = newErrorId();
    }
    logger.error(err);
    logger.error(JSON.stringify(error));

    const name = error.name || 'internal_error';
    let expected = true;

    if (!okErrors.includes(name)) {
      const op = _.isArray(error.path) ? error.path.join('.') : error.path;
      service.metrics.incrementCounter('unexpectedError', {
        type: name,
        operation: op || 'N/A'
      });
    }
    service.metrics.incrementCounter('error');

    fatalErrors.checkError(error);

    messageUtil.emitErrorEvent(
      Object.assign({ stack: err.stack, httpStatusCode: code }, error)
    );
    const tokenType = resUtil.getTokenType(req._graphqlContext || {});
    if (tokenType === 'internal') {
      service.metrics.incrementCounter('internalTokenError');
    } else if (tokenType === 'engineJWT') {
      service.metrics.incrementCounter('engineJWTError');
    }

    const responseBody = { errors: [error], data: {} };
    if (!req.context) req.context = {};
    if (!req.context.requestInfo) {
      req.context.requestInfo = {
        startTime: moment().valueOf(),
        correlationId: headers['veritone-correlation-id'],
        clientIP: req.ip,
        httpUrl: headers['httpurl'] || graphqlConfig.apiPath, // for kibana filtering
        httpMethod: headers['httpmethod'],
        httpRemoteAddr: headers['httpremoteaddr'],
        requestId: headers['veritone-request-id'],
        userAgent: headers['user-agent'],
        query: req.body.query,
        variables: req.body.variables,
        errorIds: [error.data.errorId]
      };
    }
    if (!req.context.requestContext) req.context.requestContext = {};

    handleFinalResponse(responseBody, req.context);
    if (res.headersSent) {
      return next(err);
    }

    // send the result in the standard graphql server format
    res.status(code).send(responseBody);
  }

  const healthCheckPath = _.get(config, 'healthCheck.path', '/');
  const serverStartTimeMom = moment();
  const serverStartTime = serverStartTimeMom.toISOString();
  const serverStartTimestamp = serverStartTimeMom.valueOf();

  app.get(healthCheckPath, (req, res, next) => {
    Promise.resolve(monitoring.healthCheck(req, res, serverStartTime)).catch(
      next
    );
  });

  async function handleUncaughtError(err) {
    try {
      const error = JSON.parse(JSON.stringify(err));
      /*
    TODO a request timeout results in this error being thrown because
    there's no way to short-circuit apollo server's handling of the request.
    it will still attempt to write a response even after we've already
    done so in the timeout handler.
    we don't want to log events every time this happens. we already logged
    the error and the request. so we'll put a special check here.
    the risk is that this error stack might occur for some other reason.
    for now we'll tolerate that. if the error happens, it means a response
    has already been sent, so it can't cause a request to fail. it can only
    prevent some response header from being set.
    */
      if (
        (err.stack || '').startsWith(
          `Error: Can't set headers after they are sent`
        ) ||
        err.code === 'ERR_HTTP_HEADERS_SENT' // node 20+ has a specific error code
      ) {
        return;
      }
      let message = err.message || 'A server error occurred.';
      const name = error.name || 'internal_error';

      if (!error.data) error.data = {};
      if (!error.data.errorId) error.data.errorId = uuid.v4();

      logger.error(err);
      logger.error(JSON.stringify(error));
      const op = _.isArray(error.path) ? error.path.join('.') : error.path;
      service.metrics.incrementCounter('unexpectedError', {
        type: name,
        operation: op || 'N/A'
      });
      service.metrics.incrementCounter('outOfBandError');
      service.metrics.incrementCounter('error');

      fatalErrors.checkError(error);

      if (messagingV2) {
        await messageUtil.emitErrorEvent(
          Object.assign({ stack: err.stack, isOutOfBand: true }, error)
        );
      }
    } catch (err2) {
      // this is unusual but can happen and we want to make sure the server
      // doesn't exit. it can happen if, for example, messaging is down
      // and we get an error trying to emit the error event.
      serviceContext.logger.warn(
        'WARNING:  uncaught error handler threw error:  ' + err2
      );
    }
  }

  process.on('uncaughtException', function (err) {
    handleUncaughtError(err);
  });

  process.on('unhandledRejection', function (reason, promise) {
    const err = _.isObject(reason) ? reason : { message: _.toString(reason) };
    handleUncaughtError(err);
  });

  if (enableSDRestEndpoint === true) {
    require('./routes.structuredData')(serviceContext);
  }

  // Register the route that serves the storage endpoint. Gated on the same
  // flag as the body-parser bypass above so the returned upload URL never
  // points at an unmounted route (see localStorageEndpointEnabled).
  if (localStorageEndpointEnabled) {
    require('./routes/signedWritableUrl')(serviceContext);
  }

  const enableAdminEndPoint = _.get(
    config,
    'featureFlags.adminEndpoint',
    false
  );
  if (enableAdminEndPoint === true) {
    require('./routes/admin')(serviceContext);
  }

  if (enableLaunchEndpoints === true) {
    require('./routes/launch')(serviceContext);
  }

  require('./routes/putObjectTagging')(serviceContext);
  await require('./routes/graphiql')(serviceContext);
  require('./routes/stream')(serviceContext);

  // Virtual asset route - resolves virtual asset IDs to signed URLs
  const virtualAssetRouter = require('./routes/virtualAsset')(serviceContext);
  app.use(virtualAssetRouter);

  require('./serviceInit')(serviceContext)();

  if (isSentryEnabled) {
    // Sentry error handler must be before any other error middleware and after all controllers
    app.use(Sentry.Handlers.errorHandler());
  }
  app.use(errorHandler);

  const server = app.listen(function listenCallback() {
    app.logger.info(
      `startup config:
    apiEndpoint: ${graphqlConfig.apiEndpoint}
    apiPath: ${graphqlConfig.apiPath}
    build info: ${JSON.stringify(service.serverBuildInfo, null, 2)}
    GraphQL tracing enabled:  ${graphqlServer.isTraceOn()}`
    );
    messageUtil.emitStartupEvent(serverStartTimestamp);
  });
  // HTTP connection keep-alive value in ms. this value should be GREATER
  // than that configured on the elastic load balancer so that the ELB
  // controls closing idle connections and doesn't attempt to use a connection
  // that the server has closed and throw 502.
  server.keepAliveTimeout = _.get(config, 'server.keepAliveTimeoutMs', 121000);

  fatalErrors.init(server);

  // Initial the GQL subscription server
  graphqlServer.setupSubscriptionServer(server);

  // container services can send SIGTERM or SIGQUIT signals to the process,
  // indicating that the process should shut down now.
  // handle both gracefully.
  process.on('SIGTERM', () => {
    handleSigterm(server, 'SIGTERM');
  });
  process.on('SIGQUIT', () => {
    handleSigterm(server, 'SIGQUIT');
  });

  monitoring.setStartupInProgress(false);
}

setupServer().catch((err) => {
  console.log('---------------------------------');
  console.log('STARTUP ERROR! ');
  console.log(err);
  console.log(err.stack);
  console.log(
    '\n\nThe server was completely unable to start due to a major\n' +
      'configuration or code problem. Details are above. The problem must be\n' +
      'corrected and containers redeployed.'
  );
  console.log('---------------------------------');
  process.exit(1);
});

// TODO(hji): Is this 'setupServer' used anywhere else?
module.exports = {
  setupServer
};
