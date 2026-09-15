const _ = require('lodash');
const { ApolloServer } = require('apollo-server-express');
const moment = require('moment');
const { formatError: apolloFormatError } = require('apollo-errors');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { execute, subscribe } = require('graphql');
const express = require('express');
const customPlayground = require('./customPlayground')();

class GraphqlServer {
  constructor(serviceContext) {
    this.serviceContext = serviceContext;
    this.config = serviceContext.config;

    // enable GraphQL tracing by setting enableGraphQLTracing=true.
    // GraphQL tracing sends a large payload back with each response and, thus,
    // should only be enabled on dev and test systems.
    // it is off by default.
    this.traceOn = Object.prototype.hasOwnProperty.call(
      this.config,
      'enableGraphQLTracing'
    )
      ? this.config.enableGraphQLTracing
      : false;

    this.publicSchema = require('./schema')(serviceContext).createSchema(
      'public'
    );
  }

  isTraceOn() {
    return this.traceOn;
  }

  setupSubscriptionServer(httpServer) {
    const graphqlConfig = require('./graphqlConfig.js')(this.config);

    if (graphqlConfig.enableSubscription) {
      const logger = this.serviceContext.logger;
      const metrics = this.serviceContext.metrics;
      const subscriptionPath = graphqlConfig.subscriptionPath;

      // Adapter for subscribe — tracks subscription metrics
      const subscribeAdapter = async (schemaOrArgs, document, rootValue, context, variables, operationName) => {
        try {
          let args;
          if (schemaOrArgs && typeof schemaOrArgs === 'object' && schemaOrArgs.schema) {
            args = schemaOrArgs;
          } else {
            args = {
              schema: schemaOrArgs,
              document,
              rootValue,
              contextValue: context,
              variableValues: variables,
              operationName
            };
          }

          const isGraphiql = _.get(args, 'contextValue._isGraphiql', false);
          if (!isGraphiql) {
            const opName = args.operationName || 'unknown';
            metrics.incrementCounter('wsSubscriptions', { protocol: 'stws' });
            logger.debug('ws_subscription', {
              wsEvent: 'ws_subscribe',
              wsProtocol: 'stws',
              wsOperation: opName
            });
          }

          return await subscribe(args);
        } catch (err) {
          metrics.incrementCounter('wsErrors', { protocol: 'stws' });
          logger.error('ws_subscription_error', {
            wsEvent: 'ws_error',
            wsProtocol: 'stws',
            errorMessage: err.message,
            errorName: err.name
          });
          throw err;
        }
      };

      new SubscriptionServer(
        {
          execute,
          subscribe: subscribeAdapter,
          schema: this.publicSchema,
          onConnect: (connectionParams, websocket) => {
            const upgradeReq = _.get(websocket, 'upgradeReq');
            const headers = _.get(upgradeReq, 'headers', {});
            websocket._isGraphiql = _.get(connectionParams, '__graphiqlBuiltIn', false) === true;

            if (!websocket._isGraphiql) {
              // mark socket so onDisconnect can safely decrement the gauge
              websocket._metricsTracked = true;
              metrics.incrementCounter('wsConnections', { protocol: 'stws' });
              metrics.incrementGauge('wsActiveConnections', { protocol: 'stws' });
              logger.debug('ws_connection', {
                wsEvent: 'ws_connect',
                wsProtocol: 'stws',
                wsPath: subscriptionPath,
                wsOrigin: headers['origin'] || 'unknown',
                wsSubprotocol: headers['sec-websocket-protocol'] || 'none'
              });
            }

            logger.debug('onConnect', {
              connectionParams,
              upgradeReq
            });

            // return value becomes contextValue in subscribe args
            return { _isGraphiql: websocket._isGraphiql };
          },
          onDisconnect: (socket, connectionContext) => {
            // Only track disconnect metrics/logs for non-GraphiQL sockets where
            // onConnect successfully fired (_metricsTracked), ensuring counters stay paired
            if (!socket._isGraphiql && socket._metricsTracked) {
              metrics.incrementCounter('wsDisconnections', { protocol: 'stws' });
              metrics.decrementGauge('wsActiveConnections', { protocol: 'stws' });
              logger.debug('ws_connection', {
                wsEvent: 'ws_disconnect',
                wsProtocol: 'stws',
                wsPath: subscriptionPath
              });
            }

            logger.debug('onDisconnect', {
              upgradeReq: _.get(socket, 'upgradeReq'),
              connectionContext
            });
          }
        },
        {
          server: httpServer,
          path: subscriptionPath
        }
      );
    }
  }

  setupServer() {
    const serviceContext = this.serviceContext;
    const config = this.config;
    const graphqlConfig = require('./graphqlConfig.js')(config);

    const logger = serviceContext.logger;
    const metrics = serviceContext.metrics;
    const finalResponseHandler = serviceContext.finalResponseHandler;

    const maxErrorMessageLength = _.get(
      config,
      'server.maxErrorMessageLength',
      2000
    );
    const maxErrorDataLength = _.get(
      config,
      'server.maxErrorDataLength',
      10000
    );
    const timeoutMillis = _.get(config, 'server.requestTimeoutSec', 115) * 1000;

    const errors = require('./error')(config);
    const newErrorId = errors.newErrorId;
    const fatalErrors = require('./fatalErrors.js')(serviceContext);
    const mainUtil = require('./util')(config);
    const messageUtil = require('./messageUtil.js')(serviceContext);
    const okErrors = messageUtil.okErrors;
    const resUtil = require('./resolvers/util.js')(serviceContext);
    const gqlLoggingUtil = require('./gqlLogUtil.js')();

    // load the public schema, which will be at /graphql
    // const schema = require('./schema')(serviceContext).createSchema('public');
    // loaders
    const loaders = require('./loaders')(serviceContext);

    const enableVNextGraphiql = true;

    const { available: availableGraphiql = false, buildFolderPath } =
      graphqlConfig.graphiqlSettings || {};
    if (enableVNextGraphiql) {
      // this public path must be declared before registering the graphql server router.
      if (availableGraphiql && buildFolderPath) {
        serviceContext.app.use(
          graphqlConfig.apiPath + '/public',
          express.static(buildFolderPath)
        );
      }
    }

    const apolloServer = new ApolloServer({
      schema: this.publicSchema,
      context: graphQLRequestSetup(),
      tracing: this.traceOn,
      debug: graphqlConfig.isDevEnv(),
      uploads: false,
      introspection: true,
      formatResponse: (response, requestContext) =>
        handleFinalResponse(response, requestContext),
      // formatError: TODO: cleanup error
      playground: {
        cdnUrl: graphqlConfig.playgroundEndpoint,
        version: '',
        endpoint: graphqlConfig.playgroundEndpoint,
        subscriptionEndpoint: graphqlConfig.playgroundSubscriptionEndpoint,
        settings: {
          'editor.theme': 'light',
          'schema.disableComments': false,
          'request.credentials': 'same-origin'
        }
      },
      plugins: [
        {
          requestDidStart() {
            return {
              didEncounterErrors: (context) => routeGraphQLSyntaxErrors(context)
            };
          }
        }
      ],
      subscriptions: {
        path: graphqlConfig.subscriptionPath
      }
    });

    if (enableVNextGraphiql) {
      apolloServer.playground = false;

      customPlayground.withBanner({
        app: serviceContext.app,
        path: graphqlConfig.apiPath,
        playground: {
          cdnUrl: graphqlConfig.playgroundEndpoint,
          version: '',
          endpoint: graphqlConfig.playgroundEndpoint,
          subscriptionEndpoint: graphqlConfig.playgroundSubscriptionEndpoint,
          settings: {
            'editor.theme': 'light',
            'schema.disableComments': false,
            'request.credentials': 'same-origin'
          }
        },

        formatResponse: (response, requestContext) =>
          handleFinalResponse(response, requestContext),
        banner: {
          messages: [
            { text: 'The graphql playground will be deprecated.' },
            ...(availableGraphiql
              ? [
                  {
                    text: 'Please go to the new url: ',
                    link: graphqlConfig.graphiqlApiEndpoint
                  }
                ]
              : [])
          ]
        }
      });
    }

    apolloServer.applyMiddleware({
      app: serviceContext.app,
      path: graphqlConfig.apiPath,
      cors: false
    });

    if (graphqlConfig.enableInternalSchema) {
      const internalSchema = require('./schema')(serviceContext).createSchema(
        'internal'
      );

      const apolloServerInternal = new ApolloServer({
        schema: internalSchema,
        context: graphQLRequestSetup(),
        uploads: false,
        tracing: this.traceOn,
        playground: {
          cdnUrl: graphqlConfig.playgroundEndpoint,
          version: '',
          endpoint: graphqlConfig.playgroundEndpointInternal,
          settings: {
            'request.credentials': 'same-origin'
          }
        },
        formatResponse: (response, requestContext) =>
          handleFinalResponse(response, requestContext)
      });

      if (enableVNextGraphiql) {
        apolloServerInternal.playground = false;

        customPlayground.withBanner({
          app: serviceContext.app,
          path: graphqlConfig.apiPathInternal,
          playground: {
            cdnUrl: graphqlConfig.playgroundEndpoint,
            version: '',
            endpoint: graphqlConfig.playgroundEndpointInternal,
            settings: {
              'request.credentials': 'same-origin'
            }
          },
          banner: {
            messages: [
              { text: 'The graphql playground will be deprecated.' },
              ...(availableGraphiql
                ? [
                    {
                      text: 'Please go to the new url: ',
                      link: graphqlConfig.graphiqlApiInternalEndpoint
                    }
                  ]
                : [])
            ]
          }
        });

        if (availableGraphiql && buildFolderPath) {
          // this public path must be declared before registering the graphql server router.
          serviceContext.app.use(
            graphqlConfig.apiPathInternal + '/public',
            express.static(buildFolderPath)
          );
        }
      }
      apolloServerInternal.applyMiddleware({
        app: serviceContext.app,
        path: graphqlConfig.apiPathInternal
      });
    }

    // check for requests that apollo short-circuits with HttpQueryError.
    // see expressApollo.ts:55 and runHttpQuery.ts:203-229
    function shouldTimeoutWrapRequest(req) {
      const ALLOWED_METHODS = ['GET', 'POST'];
      if (ALLOWED_METHODS.indexOf(req.method) < 0) {
        return false;
      }
      const query = req.method === 'POST' ? req.body : req.query;
      if (!query || Object.keys(query).length === 0) {
        return false;
      }
      return true;
    }

    // wrapper function that sets up a graphql context handler
    function graphQLRequestSetup() {
      return ({ req, res }) => {
        const headers = _.mapKeys(req.headers, function (value, key) {
          return key.toLowerCase();
        });

        const startTime = Date.now();

        // headers such as veritone-correlation-id don't always come
        // in the same case. so we'll force everything to lower case
        // here to make sure we find them.
        if (config.authDebug)
          logger.debug(JSON.stringify(req.context, null, 2));
        // set up hard request timeout
        const timeoutInfo = {
          requestCompleted: false
        };
        if (shouldTimeoutWrapRequest(req)) {
          timeoutInfo.timeoutHandle = setTimeout(() => {
            if (!req.timeoutInfo.requestCompleted) {
              // set info in request context so that response handling
              // code knows the request timed out
              req.timeoutInfo.requestTimedOut = true;
              clearTimeout(req.timeoutInfo.timeoutHandle);
              // below, compute duration but avoid crash if it wasn't set in request context
              const durationMs = Date.now() - startTime;
              // format a proper error
              const maxSec = Math.floor(timeoutMillis / 1000);
              const err = new errors.RequestTimeout({
                message:
                  'Maximum request time of ' +
                  maxSec +
                  ' seconds exceeded.  Try using a smaller page size or retrieving fewer object fields.',
                data: {
                  maximumRequestTimeSeconds: maxSec,
                  errorId: newErrorId(),
                  query: mainUtil.truncate(req.body.query, maxErrorDataLength),
                  requestTimeElapsedMs: durationMs,
                  requestTimeElapsedSeconds: Math.floor(durationMs / 1000)
                }
              });
              err.data.timedOutAt = err.time_thrown;
              // copy additional info about the timeout
              req.timeoutInfo.errorId = err.data.errorId;
              req.timeoutInfo.timedOutAt = err.data.timedOutAt;
              req.requestTimedOut = true;
              // handleErr also does logging, metrics, event, etc.
              const formattedError = handleGraphQLError(err, req);
              // increment a counter just for timeout errors
              const opName = /(mutation|query)\s*\{\s*(\w+)/m.exec(
                req.body.query
              ) || ['', 'N/A', 'N/A'];
              metrics.incrementCounter('timeoutError', {
                operationType: opName[1],
                operation: opName[2]
              });
              // last, send the response. this short-circuit's apollo's
              // response handling. however, if we throw an error here, we
              // crash the server.
              try {
                req.res.status(503).send({ errors: [formattedError] });
              } catch (err) {
                // this can happen if the response was already sent
                logger.error('error sending request_timeout response', err);
              }
            }
          }, timeoutMillis);
        }

        // save timeout info in the request context
        req.timeoutInfo = timeoutInfo;
        req.context.timeoutInfo = timeoutInfo;

        const context = {
          requestInfo: {
            startTime,
            correlationId: headers['veritone-correlation-id'],
            clientIP: req.ip,
            httpUrl: headers['httpurl'] || serviceContext.apiPath, // for kibana filtering
            httpMethod: headers['httpmethod'],
            httpRemoteAddr: headers['httpremoteaddr'],
            requestId: headers['veritone-request-id'],
            userAgent: headers['user-agent'],
            httpForwardedFor: headers['x-forwarded-for'],
            httpOrigin: headers['origin'],
            httpReferer: headers['referer'],
            query: req.body.query,
            variables: req.body.variables,
            errorIds: []
          },
          response: res,
          timeoutInfo,
          requestContext: req.context,
          config: config,
          file: req.file // needed to inject uploaded file stream in
          // multipart form post input so that resolvers can get to it. may be null.
        };

        context.loaders = loaders.createLoaders(context);

        return context;
      };
    }

    function routeGraphQLSyntaxErrors(context) {
      const rq = _.get(context, 'context.requestContext');
      const errors = _.get(context, 'errors', []);
      if (rq && errors) {
        for (const err of errors) {
          if (isGraphQLValidationError(err)) {
            handleGraphQLError(err, rq);
          }
        }
      }
    }

    // handles errors caught by apollo framework
    function handleGraphQLError(error, requestContext) {
      if (_.get(error, 'data.requestTimedOut', false) === true) {
        logger.debug(
          'skipped error output from request timeout already logged'
        );
        return;
      }
      error.message = mainUtil.truncate(error.message, maxErrorMessageLength);
      const ret = apolloFormatError(error);

      let name = ret.name || error.name || 'internal_error';

      if (name === 'GraphQLError') {
        // hack hack. can't tell any other way to differentiate a query
        // parse error from an unexpected resolver error.
        if (isGraphQLValidationError(error)) {
          name = 'invalid_input';
          removeTimeout(requestContext);
        } else {
          name = 'internal_error';
        }
      } else if (name === 'BadRequestError') {
        name = 'invalid_input';
      }

      let skipLog = false;
      if (_.isNil(requestContext.requestInfo)) requestContext.requestInfo = {};
      if (name === 'capacity_exceeded') {
        if (requestContext.requestInfo.loggedCapacityExceeded === true) {
          skipLog = true;
        } else {
          requestContext.requestInfo.loggedCapacityExceeded = true;
        }
      }
      if (_.get(error, 'extensions.exception.name') === 'request_timeout') {
        // timeout error will be reported for the request as a whole, no need to repeat that
        // for each individual resolver error.
        skipLog = true;
      }

      // do not emit error event here because apollo passes a non-standard
      // object to this function and we lose the error id
      // emitErrorEvent(error, name);
      metrics.incrementCounter('error', { type: name });
      // increment token-specific error counts
      const tokenType = resUtil.getTokenType(requestContext);
      if (tokenType === 'internal') {
        metrics.incrementCounter('internalTokenError');
        error.isInternalTokenError = true;
      } else if (tokenType === 'engineJWT') {
        metrics.incrementCounter('engineJWTError');
        error.isEngineJwtError = true;
      } else if (tokenType == 'apiKey') {
        // get org ID
        // TODO get org ID off request context
        // TODO call DAL (we don't have a serviceContext at this point...)
        // to get list of critical orgs, cached over 15min or so.
        // if request org is in critical org, increment criticalOrgError metric.
      }

      if (!error.data) error.data = ret.data;
      // for certain error that can be encountered 1000s of times in a given
      // request, skip logging if we've already logged one instance.
      // this avoids polluting logs and metrics.
      if (!skipLog) {
        // TODO we are logging each error twice because somehow the
        // error object does not have all the same data as the
        // object returned from apolloFormatError.
        // fix that later.
        // don't bother logging stack track for "expected" errors
        if (!okErrors.includes(name)) {
          logger.debug(error.stack); // don't print this in prod so that we
          // don't pull the individual lines into cloudwatch. single-line
          // version of the stack is in the error JSON.
        }

        if (!okErrors.includes(name)) {
          const op = _.isArray(error.path) ? error.path.join('.') : error.path;
          metrics.incrementCounter('unexpectedError', {
            type: name,
            operation: op || 'N/A'
          });
        }
        // emit message/log
        messageUtil.emitErrorEvent(error, name);
      }

      // check for fatal error
      fatalErrors.checkError(error);

      // clear any internal data from the error so that it isn't exposed
      // through the API.
      if (ret.data) delete ret.data.internalData;
      // ret.path = error.path;   // apolloFormatError() sets the path.

      return ret;
    }

    const knownGraphQLValidationErrorStrings = [
      'Cannot query field',
      'Syntax Error',
      'Unknown argument "',
      'Argument "',
      'Unknown type "',
      'Field "',
      'Unknown fragment',
      'This anonymous operation',
      'Fields "',
      'There can be only one operation named',
      'Unknown operation',
      'There can be only one argument',
      'Variable "$' // not defined or never used
    ];

    function isGraphQLValidationError(error) {
      if (error.name !== 'GraphQLError') return false;
      if (_.isNil(error.message)) return false;
      for (let i = 0; i < knownGraphQLValidationErrorStrings.length; i++) {
        if (error.message.startsWith(knownGraphQLValidationErrorStrings[i])) {
          return true;
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
            logger.warn('failed to clear request timeout');
          }
        }
      }
    }

    /**
     * Final logging and other logic that must occur after the request has been
     * fully resolved and response generated.
     */
    function handleFinalResponse(response, requestContext) {
      let requestDescription;
      try {
        requestDescription = gqlLoggingUtil.printGraphqlRequestDoc(
          requestContext.document,
          requestContext.operationName
        );
      } catch (err) {
        logger.warn(
          'failed parse graphql request schema for graphqlQueries metric',
          err
        );
      }
      if (requestDescription) {
        serviceContext.metrics.incrementCounter('graphqlQueries', {
          request: requestDescription
        });
        const fieldStats = _.get(requestContext, 'context.fieldStats');
        if (fieldStats) {
          let totalMs = 0;
          for (const fs in fieldStats) {
            if (Object.hasOwnProperty.call(fieldStats, fs)) {
              const element = fieldStats[fs];
              if (element && _.isNumber(element.elapsedMsAverage)) {
                totalMs += element.elapsedMsAverage;
                serviceContext.metrics.observeHistogram(
                  'graphqlFieldStatsElapsedMs',
                  element.elapsedMsAverage,
                  {
                    field: fs
                  }
                );
                // VE-26935 - count and byte total are already accumulated in
                // accumulateFieldStats; emitted here so they share this
                // metric's exact label domain and gating, which makes
                // graphql_queries_field_stats_elapsed_ms_count a valid
                // denominator for both (see customMetrics.js).
                if (_.isNumber(element.count)) {
                  serviceContext.metrics.incrementCounterBy(
                    'graphqlFieldResolutions',
                    { field: fs },
                    element.count
                  );
                }
                if (_.isNumber(element.sizeInBytesTotal)) {
                  serviceContext.metrics.incrementCounterBy(
                    'graphqlFieldResponseBytes',
                    { field: fs },
                    element.sizeInBytesTotal
                  );
                }
              }
            }
          }
          serviceContext.metrics.observeHistogram(
            'graphqlQueriesElapsedMs',
            totalMs,
            {
              request: requestDescription
            }
          );
        }
      }

      if (response.errors) {
        const gqlErrors = response.errors
          .slice(0, 1000) // report only first 1000 errors
          .map((e) => handleGraphQLError(e, requestContext.context));
        response.errors = gqlErrors;
        if (!response.data) response.data = {};
        response.data.errors = gqlErrors;
      }

      return finalResponseHandler(
        response,
        requestContext.context,
        requestContext
      );
    }
  }
}

module.exports = {
  GraphqlServer
};
