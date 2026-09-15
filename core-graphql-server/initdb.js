const parse = require('pg-connection-string').parse;
const moment = require('moment');
const os = require('os');
const _ = require('lodash');

module.exports = function createDbMap(logger, config, metricsCounters) {
  const connCount = {};
  const maxConns = {};
  const waitingSince = {};
  // this is the maximum time a given operation will wait for an active
  // connection before triggering the warning metric.
  // the operation will continue to wait after this point until
  // the query timeout cuts it off.
  const maxWaitTimeMs = _.get(config, 'db.maxConnectTotalWaitTimeMs', 5000);

  // Store reference to the raw pg-promise Database objects
  const rawDbConnections = {};

  // set pg-promise's connect and disconnect callbacks so we can track some stats
  const pgp = require('pg-promise')({
    connect: function ({ client }) {
      const cp = client.connectionParameters;
      const key = cp.database + ':' + cp.user + ':' + cp.host;
      metrics.incrementGauge('sqlConnectionsAcquired', {
        db: cp.database,
        service: 'core-graphql-server'
      });
      if (!connCount[key]) connCount[key] = 1;
      else connCount[key] = connCount[key] + 1;
    },
    disconnect: function ({ client }) {
      const cp = client.connectionParameters;
      const key = cp.database + ':' + cp.user + ':' + cp.host;
      metrics.decrementGauge('sqlConnectionsAcquired', {
        db: cp.database,
        service: 'core-graphql-server'
      });
      if (connCount[key]) connCount[key] = connCount[key] - 1;
    }
  });

  const util = require('./util.js')({ config });
  const dbConnections = {};
  const dbConfigs = config.db;
  const dbByUri = {};
  const appName = config.appName || 'core-graphql-server';
  const ERR = 'error';
  const OK = 'ok';
  const metrics = require('./metrics.js')({
    metricsCounters,
    logger
  });
  const errors = require('./error')(config);
  const serverHostname = os.hostname();
  const logSqlAll = _.get(config, 'log.sql.all', false) === true;
  const logSqlError = _.get(config, 'log.sql.error', true) === true;
  const slowSqlThresholdMs = _.get(config, 'log.sql.slowThresholdMs', 1000);
  const SQL_TABLE_RE = /\b(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)(?:\.(\w+))?/i;

  // these values are configurable. note that
  // total time elapsed for all retries, accounting for query timeout,
  // should be below the core-graphql-server hard limit on request duration
  // (1min by default).
  // TODO a better way would be to pass in the request completion "deadline"
  // time and retry only if the time has not passed.
  const maxRetries = _.get(config, 'db.maxRetries', 2);
  const retryIntervalMultipleSec = _.get(
    config,
    'db.retryIntervalMultipleSec',
    5
  );

  const circuitOpenErrorTag = '__core-graphql-server_db_circuit_open';
  const retryableErrorText = _.get(config, 'db.retryableErrorText', [
    circuitOpenErrorTag,
    'terminating connection due to administrator command',
    'the database system is shutting down',
    'the database system is starting up',
    'read ECONNRESET',
    'connect ECONNREFUSED ',
    'sorry, too many clients already',
    'EAI_AGAIN',
    'emaining connection slots are reserved for non-replication superuser'
  ]);

  const queryTimeoutsByDb = {};

  /**
   * single functional wrapper for all wrapped db calls.
   * abstracts out logging, timeout, error handling, etc.
   *
   * @param fun a function that calls the pg db client.
   *   should return a promise
   * @param dbname The database name (key in the config object)
   * @param sql The SQL query
   * @param args The SQL arguments (can be empty/null)
   **/
  function wrap(fun, dbname, sql, args, uri, connKey, mapfun) {
    if (!sql) {
      throw new Error('invalid function call -- null sql to db ' + dbname);
    }
    return wrapWithRetry(fun, dbname, sql, args, uri, connKey, mapfun);
  }

  async function wrapWithRetry(fun, dbname, sql, args, uri, connKey, mapfun) {
    for (let numRetries = 0; numRetries <= maxRetries; ++numRetries) {
      if (numRetries > 0) {
        // increment metric for dashboards/alerting
        metrics.incrementCounter('sqlQueryRetry', {
          db: dbname,
          service: 'core-graphql-server'
        });
        // sleep. this will be numRetries+1 * interval.
        // so on first retry, 5s. then 10s. etc.
        await util.sleep(retryIntervalMultipleSec * 1000 * numRetries);
      }

      metrics.incrementGauge('sqlConcurrentQueries', {
        db: dbname,
        service: 'core-graphql-server'
      });
      checkMax(connKey, dbname, uri);
      const startTime = Date.now();
      try {
        return await fun
          .call()
          .then((res) => {
            log(dbname, sql, args, startTime, OK, null, numRetries, uri);

            // In case "conn.multi" return more than 1 array result.
            // We concat the result into one array
            if (_.isArray(res)) {
              let results = [];

              _.forEach(res, (itemArrOrObj) => {
                if (_.isArray(itemArrOrObj))
                  results = _.concat(results, itemArrOrObj);
                else results.push(itemArrOrObj);
              });

              return results;
            }

            return res;
          })
          .then((res) => {
            if (mapfun)
              return _.isArray(res) ? _.map(res, mapfun) : mapfun(res);
            return res;
          });
      } catch (error) {
        // determine if a) error is retryable and b) we have retries left
        const retry = numRetries <= maxRetries && isRetryable(error);
        if (retry) {
          logger.warn(
            'sql_retry ' +
              numRetries +
              ' of ' +
              maxRetries +
              ' on ' +
              dbname +
              ' ' +
              redactText(error.message)
          );
        } else {
          // didn't retry. wrap error and throw out.
          const e = wrapError(error, dbname, sql, args, startTime);
          log(dbname, sql, args, startTime, ERR, e, numRetries, uri);
          throw e;
        }
      } finally {
        metrics.decrementGauge('sqlConcurrentQueries', { db: dbname });
      }
    }
  }

  function checkMax(connKey, dbname, uri) {
    const ct = connCount[connKey] || 0;
    if (ct >= maxConns[connKey]) {
      if (!waitingSince[connKey]) {
        // if "waiting since" timestamp has not been set, set it now
        waitingSince[connKey] = moment().valueOf();
      } else {
        // otherwise see how long we've been waiting for new connections
        const timeElapsedMs = moment().valueOf() - waitingSince[connKey];
        if (timeElapsedMs > maxWaitTimeMs) {
          // if all connections on this db have been waiting past the max
          // time allowed...
          metrics.incrementCounter('sqlConnectionMax', {
            db: dbname,
            service: 'core-graphql-server'
          });
        }
      }
      metrics.incrementCounter('sqlConnectionWaited', {
        db: dbname,
        service: 'core-graphql-server'
      });
    } else {
      // make sure "waiting since" timestamp is clear
      waitingSince[connKey] = null;
    }
    const rawConn = rawDbConnections[connKey];
    if (rawConn && rawConn.$pool) {
      metrics.observeHistogram(
        'sqlConnectionPoolWaitingCount',
        rawConn.$pool.waitingCount,
        {
          db: dbname,
          service: 'core-graphql-server'
        }
      );
      metrics.observeHistogram(
        'sqlConnectionPoolIdleCount',
        rawConn.$pool.idleCount,
        {
          db: dbname,
          service: 'core-graphql-server'
        }
      );
    }
  }
  // we wrap each pg connection object so that we can wrap
  // its query functions and add our own global logging,
  // metrics, and error handling.
  // see http://vitaly-t.github.io/pg-promise/Database.html for the
  // pgp API function definitions. we do not change them here.
  function wrapConnection(conn, dbname, uri, connKey) {
    const wrappers = {
      map: function (sql, args, mapfun) {
        return wrap(
          () => conn.multi(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey,
          mapfun
        );
      },
      query: function (sql, args) {
        return wrap(
          () => conn.multi(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey
        );
      },
      any: function (sql, args) {
        return wrap(() => conn.any(sql, args), dbname, sql, args, uri, connKey);
      },
      one: function (sql, args, mapfun) {
        return wrap(
          () => conn.one(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey,
          mapfun
        );
      },
      oneOrNone: function (sql, args, mapfun) {
        return wrap(
          () => conn.oneOrNone(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey,
          mapfun
        );
      },
      many: function (sql, args) {
        return wrap(
          () => conn.many(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey
        );
      },
      manyOrNone: function (sql, args) {
        return wrap(
          () => conn.manyOrNone(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey
        );
      },
      none: function (sql, args) {
        return wrap(
          () => conn.none(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey
        );
      },
      each: function (sql, args, mapfun) {
        return wrap(
          () => conn.multi(sql, args),
          dbname,
          sql,
          args,
          uri,
          connKey,
          mapfun
        );
      }
    };
    Object.keys(conn).forEach((functionName) => {
      if (!Object.keys(wrappers).includes(functionName)) {
        wrappers[functionName] = conn[functionName];
      }
    });

    return wrappers;
  }

  function isRetryable(error) {
    for (let i = 0; i < retryableErrorText.length; i++) {
      const text = retryableErrorText[i];
      if (
        (error.message && error.message.includes(text)) ||
        (error.stack && error.stack.includes(text))
      ) {
        return true;
      }
    }
    return false;
  }

  function wrapError(error, dbname, sql, args, startTime) {
    const internalData = {
      type: 'sql',
      message: redactText(error.message),
      sql,
      sqlArgs: getArgs(args),
      db: dbname,
      startTime: moment(startTime).toISOString(),
      timeElapsedMs: Date.now() - startTime,
      originalStack: redactText(error.stack),
      code: error.code
    };

    // special handling for timeout errors
    const errorMessage = _.get(error, 'message', '');
    const text = _.get(error, 'stack', errorMessage);
    if (
      errorMessage.includes('canceling statement due to user request') ||
      text.includes('TimeoutError') ||
      text.includes('ETIMEDOUT')
    ) {
      // increment metric
      metrics.incrementCounter('sqlQueryTimeout', {
        db: dbname,
        service: 'core-graphql-server'
      });
      // throw distinctive error type
      throw new errors.SqlQueryTimeout({
        message:
          'A SQL query was not able to finish in time. ' +
          'This condition can occur under heavy platform load or might indicate ' +
          'an overly expensive request. If it continues, contact Veritone support.',
        data: { internalData }
      });
    }

    if (
      error.message &&
      error.message.includes('duplicate key value violates unique constraint')
    ) {
      return new errors.ResourceConflict({
        message:
          'The object could not be created because a duplicate already exists.',
        data: { internalData }
      });
    }
    if (error.message && error.message.includes('invalid input syntax')) {
      return new errors.NotFound({
        message:
          'The requested object could not be retrieved because an ' +
          'ID value provided was not valid. Provide a valid object ID to continue.',
        data: {
          parameters: args,
          internalData
        }
      });
    }
    if (
      error.message &&
      error.message.includes('violates foreign key constraint')
    ) {
      throw new errors.NotFound({
        message:
          'The object could not be created because the input references ' +
          'an object ID that does not exist. Verify all IDs in the request input ' +
          'to continue.',
        data: { internalData }
      });
    }
    return new errors.InternalServerError({
      message: 'An internal server error occurred.',
      data: {
        internalData
      }
    });
  }

  // truncates a long arguments list to avoid generate over-long log entries
  function getArgs(args) {
    if (!args) return args;
    return args.length > 5000 ? args.slice(0, 5000) : args;
  }

  // uri is a full postgres connection string containing plaintext credentials
  function redactUri(uri) {
    if (!uri) return uri;
    try {
      const parsed = parse(uri);
      const auth = parsed.user ? '<redacted>:<redacted>@' : '';
      return `postgresql://${auth}${parsed.host}:${parsed.port}/${parsed.database}`;
    } catch (e) {
      return '<redacted>';
    }
  }

  // strips user:password credentials from postgres connection URIs embedded
  // in free-form driver text (error messages, stacks) while keeping the
  // host/db and the surrounding text intact for debugging; also masks the
  // DB username the server echoes back on auth failures
  // (`password authentication failed for user "..."`, `role "..." does not exist`)
  function redactText(text) {
    if (!_.isString(text)) return text;
    return text
      .replace(
        /postgres(?:ql)?:\/\/[^\s:@/]+(?::[^\s@/]*)?@/gi,
        'postgresql://<redacted>:<redacted>@'
      )
      .replace(/\b(user|role)\s+"[^"]*"/gi, '$1 "<redacted>"');
  }

  function sqlIdentity(sql) {
    if (!_.isString(sql) || !sql.trim())
      return { op: 'unknown', table: 'unknown' };
    const s = sql.replace(/\s+/g, ' ').trim();
    const opM = /^[(\s]*(WITH|SELECT|INSERT|UPDATE|DELETE|CALL)\b/i.exec(s);
    const op = opM ? opM[1].toUpperCase() : 'OTHER';
    const tM = SQL_TABLE_RE.exec(s);
    if (!tM) return { op, table: 'unknown' };
    const schema = tM[2] ? tM[1] : null;
    let table = tM[2] || tM[1];
    table = table
      .replace(/_\d{4}_\d{2}_\d{2}$/, '')
      .replace(/_\d{4}_\d{2}$/, '')
      .replace(/_p?\d+$/, '');
    return { op, table: (schema ? schema + '.' : '') + table.toLowerCase() };
  }

  function log(dbname, sql, args, startTime, status, error, numRetries, uri) {
    const timeElapsedMs = Date.now() - startTime;
    const startTimeStr = moment(startTime).toISOString();
    const data = {
      event: 'sql',
      type: 'api',
      serverHostname,
      serviceName: 'core-graphql-server',
      db: dbname,
      url: redactUri(uri),
      sql: _.isString(sql)
        ? sql.substring(0, 600).replace(/\n/g, ' ').replace(/\t/g, ' ').trim()
        : '',
      sqlArgs: getArgs(args),
      elapsedMs: timeElapsedMs,
      startTime: startTimeStr,
      numRetries,
      success: status === OK
    };
    if (error) {
      data.error = error;
      data.errorData = _.get(error, 'data.internalData');
    }
    // logger adds extra junk so this isn't
    // parsed into cloudwatch as an object
    const logIt = logSqlAll || (logSqlError && (error || status === ERR));
    if (logIt) {
      console.log(JSON.stringify(data));
    }
    metrics.incrementCounter('sqlQuery', {
      db: dbname,
      service: data.serviceName
    });
    metrics.observeHistogram('sqlQueryTimeElapsedMs', timeElapsedMs, {
      db: dbname,
      service: data.serviceName
    });
    if (timeElapsedMs >= slowSqlThresholdMs) {
      const identity = sqlIdentity(sql);
      metrics.incrementCounter('sqlSlowQuery', {
        db: dbname,
        table: identity.table,
        op: identity.op
      });
    }
    if (error || status === ERR) {
      metrics.incrementCounter('sqlError', {
        db: dbname,
        service: data.serviceName
      });
    }
  }

  Object.keys(dbConfigs).forEach((key) => {
    // first get the uri
    const readUri = dbConfigs[key].read;
    const writeUri = dbConfigs[key].write;
    const conn = {};

    // check if we already have connections for them
    // and, if not, create and add to map by URI
    if (readUri) {
      if (!dbByUri[readUri]) {
        dbByUri[readUri] = setupConnection(key, readUri);
      }
      conn.read = dbByUri[readUri];
    }

    if (writeUri) {
      if (!dbByUri[writeUri]) {
        dbByUri[writeUri] = setupConnection(key, writeUri);
      }
      conn.write = dbByUri[writeUri];
    }
    // finally, set up the object for this db key
    dbConnections[key] = conn;
  });

  function setupConnection(key, uri) {
    const dbConfigs = config.db;
    // built-in default from https://github.com/brianc/node-postgres/blob/master/lib/defaults.js
    // is max 10 connections.
    const max = dbConfigs[key].max || dbConfigs.max || 30;
    const min = dbConfigs[key].min || dbConfigs.min || 1;
    const idleTimeoutMillis =
      dbConfigs[key].idleTimeoutMillis || dbConfigs.idleTimeoutMillis || 5000;
    const idleInTransactionTimeoutMillis =
      dbConfigs[key].idleInTransactionTimeoutMillis ||
      dbConfigs.idleInTransactionTimeoutMillis ||
      300000;
    // set up max query duration timeout. this does not prevent the db from
    // continuing to process the query, but does prevent slow requests from
    // accumulating and strongly discourages expensive queries.
    // this value should match the value configured for the query monitor
    // "kill" setting so that queries that time out here are killed on the db
    // at the same time or soon after.
    const queryTimeoutMillis =
      dbConfigs[key].queryTimeoutMillis ||
      dbConfigs.queryTimeoutMillis ||
      45000;
    if (_.isNil(queryTimeoutsByDb[key]))
      queryTimeoutsByDb[key] = queryTimeoutMillis;

    let parsed;
    try {
      parsed = parse(uri);
    } catch (e) {
      // a malformed uri throws ERR_INVALID_URL, which carries the raw uri
      // (with plaintext credentials) in e.input — replace it with a clean
      // error so the startup-failure log can't leak the connection string
      throw new Error(
        `invalid db connection string for "${key}"${e.code ? ` [${e.code}]` : ''}`
      );
    }
    const connKey = parsed.database + ':' + parsed.user + ':' + parsed.host;
    maxConns[connKey] = max;
    parsed.application_name = appName;
    parsed.keepAlive = true;
    parsed.idleTimeoutMillis = idleTimeoutMillis;
    parsed.max = max;
    parsed.min = min;
    parsed.query_timeout = queryTimeoutMillis;
    parsed.idle_in_transaction_session_timeout = idleInTransactionTimeoutMillis;
    const conn = pgp(parsed);
    rawDbConnections[connKey] = conn;
    return wrapConnection(conn, key, uri, connKey);
  }

  dbConnections._redactUri = redactUri; // export for testing only
  dbConnections._redactText = redactText; // export for testing only
  dbConnections._sqlIdentity = sqlIdentity; // export for testing only

  return dbConnections;
};
