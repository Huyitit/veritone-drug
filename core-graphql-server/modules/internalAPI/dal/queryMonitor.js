const _ = require('lodash');
const moment = require('moment');
const pgp = require('pg-promise')();
const parseConnectionString = require('pg-connection-string').parse;

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config.queryMonitor || {};
  const errors = require('../../../error')(config);
  const mainUtil = require('../../../util.js')();
  const mapper = require('../../../dal/mapper.js');
  const messageUtil = require('../../../messageUtil.js')(serviceContext);

  const queryDurationSecondsWarn = config.queryDurationSecondsWarn || 10;
  const queryDurationSecondsKill = config.queryDurationSecondsKill || 30;
  const queryDurationSecondsTerminate =
    config.queryDurationSecondsTerminate || 70;
  // exclude queries in process run by admin users
  const queryExcludeUserNames = _getQueryExcludeUserNames(config);
  const killEnabled = _.get(config, 'queryKillEnabled', true);
  const pageSize = _.get(config, 'pageSize', 500);

  // Statistics maintenance rides the same tick, connections and scopes as the
  // kill sweep. A table is a candidate once both last_analyze and
  // last_autoanalyze are older than this (or never happened at all).
  const analyzeEnabled = _.get(config, 'analyzeEnabled', true);
  const analyzeStalenessDays = _.get(config, 'analyzeStalenessDays', 15);
  // Global cap across every monitored database, not per-database, so the budget
  // goes to the tables that need it most rather than being split evenly.
  const analyzeMaxTables = _.get(config, 'analyzeMaxTables', 10);
  // Both jobs now share one NSQ message budget (msgTimeout is 60s), so stop
  // starting new tables past this point rather than risk a requeue mid-run
  // that would repeat the kill sweep too.
  const analyzeMaxRunMs = _.get(config, 'analyzeMaxRunMs', 40000);

  function _getQueryExcludeUserNames(config) {
    const queryExcludeUserNames = _.get(config, 'queryExcludeUserNames') || [
      'postgres',
      'rdsadmin',
      'rdsrepladmin',
      'riveryxfer',
      'jenkins_cdci',
      'azure_pg_admin',
      'azure_superuser',
      'azuresu',
      'alteryx'
    ];

    return queryExcludeUserNames;
  }
  async function queryMonitor(context, args) {
    // kill queries if user specified and the feature is enabled on this env.
    const doKill = args.enableKill && killEnabled;
    // analyze stale tables if the caller asked and the feature is enabled here.
    const doAnalyze = _.get(args, 'enableAnalyze', false) && analyzeEnabled;

    // loop over all configured db connections.
    const connections = serviceContext.dbConnections; //config.connections || [];
    const urls = [];
    const dbConfig = serviceContext.config.db;
    // get db keys from query monitor config
    const keys = Object.keys(connections);
    const proms = [];

    // we are only going to use connections marked in
    // the configuration as "queryMonitor" (true).
    // these should be duplicates of the main database
    // connection configs, but using the postgres user
    // instead of the core-graphql service user.
    const killKeys = keys.filter((key) => {
      if (_.get(dbConfig, [key, 'queryMonitor']) !== true) return false;
      // Flagged for monitoring but with no connection string provisioned here.
      // Skip it with a warning: one unprovisioned duplicate must not fail the
      // sweep for every database that is configured correctly.
      if (!_hasConnection(key)) {
        serviceContext.logger.warn(
          'QUERYMON ' +
            key +
            ' is marked queryMonitor but has no read or write connection ' +
            'configured - skipping'
        );

        return false;
      }

      return true;
    });

    // The analyze sweep covers every database the service connects to, not just
    // the queryMonitor ones. It does not need their elevated rights: Flyway
    // migrates each database through its own service connection, so that user
    // owns the tables and can ANALYZE them. And it does not need a
    // per-connection flag to stay bounded - analyzeMaxTables caps the work
    // globally, so widening the selection changes which tables get picked, not
    // how many.
    const analyzeKeys = doAnalyze ? _getAnalyzeDatabases() : [];

    for (let i = 0; i < killKeys.length; i++) {
      proms.push(queryDb(killKeys[i], '', doKill));
    }

    // error out if there is no work at all: no connection marked queryMonitor
    // for the kill sweep, and nothing for the analyze sweep either. This is the
    // config error the mutation has always reported.
    if (!proms.length && !analyzeKeys.length) {
      throw new errors.NotImplemented({
        message:
          'No database connections usable by the query monitor ' +
          'mutation are configured. The server configuration must have at ' +
          'least one database configure with "queryMonitor":true.'
      });
    }

    // The analyze sweep no longer depends on the queryMonitor flag, so a missing
    // flag must not abort a sweep that has databases to work through. Report the
    // kill misconfiguration and carry on with the half that can run.
    if (!proms.length) {
      serviceContext.logger.warn(
        'QUERYMON no database is configured with "queryMonitor":true - ' +
          'skipping the kill sweep and running the analyze sweep only'
      );
    }

    // let them run concurrently
    const res = await Promise.all(proms);

    // Run the analyze sweep only after the kill sweep has finished and emitted
    // its events: killing a runaway query is time-critical and must not queue
    // behind statistics maintenance, and its audit event must not be delayed by
    // it either.
    if (analyzeKeys.length) {
      await analyzeDatabases(
        analyzeKeys.map((database) => ({
          database,
          result: resolveAnalyzeResult(database, killKeys, res)
        })),
        args
      );
    }

    return res;
  }

  /**
   * Every database reachable from this service, as one connection key each.
   *
   * Use host:port:database as the deduplication key, so that a database with both a base and a queryMonitor connection is only swept once.
   * The queryMonitor connection is preferred, so that the sweep reuses a connection this tick has already opened.
   */
  /**
   * Whether a db config key actually resolved to a usable connection.
   *
   * A key can be present in config.db with no connection string at all - the
   * queryMonitor flags live in service.yml while the connection strings come from
   * the environment's own config, so an environment that does not provision the
   * *_gqm duplicates still has the flagged keys. initdb turns those into empty
   * entries. This also excludes the scalar tuning keys config.db carries and the
   * helper functions initdb attaches to the connection map.
   */
  function _hasConnection(key) {
    const conn = serviceContext.dbConnections[key];

    return _.isObject(conn) && Boolean(conn.write || conn.read);
  }

  function _getAnalyzeDatabases() {
    const connections = serviceContext.dbConnections;
    const dbConfig = serviceContext.config.db || {};

    const usable = Object.keys(connections).filter((key) =>
      _hasConnection(key)
    );

    // sort so that queryMonitor connections are preferred, and then alphabetically
    usable.sort((a, b) => {
      const aMon = dbConfig[a].queryMonitor === true ? 0 : 1;
      const bMon = dbConfig[b].queryMonitor === true ? 0 : 1;
      if (aMon !== bMon) return aMon - bMon;

      return a.localeCompare(b);
    });

    const byTarget = {};
    usable.forEach((key) => {
      const uri = dbConfig[key].write || dbConfig[key].read;
      let target = key;
      try {
        const parsed = parseConnectionString(uri);
        target = parsed.host + ':' + parsed.port + ':' + parsed.database;
      } catch (err) {
        // just log key, not the connection string.
        serviceContext.logger.debug(
          'QUERYMON ANALYZE could not parse the connection string for ' + key, err
        );
      }
      if (!byTarget[target]) byTarget[target] = key;
    });

    return Object.keys(byTarget).map((target) => byTarget[target]);
  }

  /**
   * Finds the result object the analyze sweep should record onto for a database.
   *
   * Databases selected for both sweeps share one result. A database selected for
   * ANALYZE only has no kill result to attach to, so one is created and added to
   * the response, carrying the kill sweep's own result shape with zeroed counters
   * so every entry can be read uniformly. No queryMonitor event is emitted for it
   * though; the analyze sweep emits its own databaseAnalyze event.
   */
  function resolveAnalyzeResult(database, killKeys, results) {
    const killIndex = killKeys.indexOf(database);
    if (killIndex !== -1) return results[killIndex];

    const result = {
      database,
      queries: [],
      // Populated by the analyze sweep, and present up front so the non-null
      // GraphQL field resolves even if the sweep errors before reaching it.
      tables: [],
      timestamp: moment().toISOString(),
      event: 'queryMonitor',
      // The kill sweep never ran here, so its counters are all genuinely zero.
      // Reported in the same shape it uses rather than omitted, so a consumer
      // can read summary.* on any entry without checking which sweeps covered
      // that database first.
      summary: {
        queryError: 0,
        warn: 0,
        kill: 0,
        terminate: 0,
        killFailure: 0
      }
    };
    results.push(result);

    return result;
  }

  function formatSql(sql) {
    // first strip new lines
    let res = mainUtil.stringReplace(sql, '\n', ' ');
    // now truncate if necessary
    if (res.length > 2000) res = res.substring(0, 2000);

    return res;
  }

  async function queryDb(database, connectionStr, doKill) {
    if (database === 'media') database = 'media_platform';
    if (!serviceContext.dbConnections[database])
      throw new Error('no db configured for ' + database);
    const conn =
      serviceContext.dbConnections[database].write ||
      serviceContext.dbConnections[database].read; //getConnection(connectionStr);
    if (!conn) throw new Error('no write configuration for ' + database);
    const uname = queryExcludeUserNames.map((n) => `'${n}'`);
    let start = Date.now();
    serviceContext.logger.info(
      'QUERYMON START ' + database + ' ' + connectionStr
    );
    const sql = `
SELECT
  pid,
  EXTRACT(epoch FROM now() - pg_stat_activity.query_start)::int4 AS query_duration_seconds,
  query AS sql,
  datname AS database,
  usename AS user_name,
  application_name,
  client_addr AS client_ip_address,
  query_start AS query_start_time,
  state,
  'warn' AS action
FROM
  pg_stat_activity
WHERE
  (now() - pg_stat_activity.query_start) > interval '${queryDurationSecondsWarn} seconds'
  AND state = 'active'
  AND usename NOT IN (${uname.join(',')})
  AND query NOT LIKE '%IGNORE MONITOR%'
ORDER BY query_duration_seconds DESC
LIMIT ${pageSize}
    `;

    const summary = {
      queryError: 0,
      warn: 0,
      kill: 0,
      terminate: 0,
      killFailure: 0
    };

    serviceContext.logger.info(
      'QUERYMON ' + mainUtil.stringReplace(sql, '\n', ' ')
    );
    let queries = [];
    let errorStr;
    try {
      queries = await conn.map(sql, null, mapper.camelizeRootKeys);
    } catch (err) {
      summary.queryError++;
      errorStr = _.get(err, 'data.internalData.message', err.message);
      serviceContext.metrics.incrementCounter('queryMonErrors', { database });
    }
    const queryElapsed = Date.now() - start;
    serviceContext.logger.info(
      'QUERYMON END ' + database + ' ' + connectionStr + ' ' + queryElapsed
    );
    const killList = [];

    queries.forEach((queryInfo) => {
      serviceContext.metrics.incrementCounter('queryMonLongQueries', {
        database
      });
      if (queryInfo.queryDurationSeconds > queryDurationSecondsKill && doKill) {
        killList.push(queryInfo);
        if (queryInfo.queryDurationSeconds > queryDurationSecondsTerminate) {
          queryInfo.doTerminate = true;
        }
      } else summary.warn++;
      queryInfo.sql = formatSql(queryInfo.sql);
    });
    let killElapsed;
    if (killList.length) {
      const killParts = [];
      killList.forEach((query) => {
        let verb = 'cancel';
        query.action = 'kill';
        if (query.doTerminate === true) {
          query.action = 'terminate';
          verb = 'terminate';
        }
        killParts.push(`SELECT pg_${verb}_backend(${query.pid})`);
      });
      const killSql = killParts.join(';\n');
      serviceContext.logger.warn('QUERYMON ' + killSql);
      // pull the trigger
      start = Date.now();
      let killRes;
      try {
        killRes = await conn.query(killSql);
      } catch (err) {
        errorStr = _.get(err, 'data.internalData.message', err.message);
        serviceContext.metrics.incrementCounter('queryMonErrors', { database });
        summary.queryError++;
      }
      killElapsed = Date.now() - start;
      serviceContext.logger.warn('QUERYMON ' + JSON.stringify(killRes));
      // now make sure all were killed
      for (let k = 0; killRes && k < killRes.length; k++) {
        const killRow = killRes[k];
        if (killRow.pg_cancel_backend) {
          // if we got back "true" in the query's result row, it was killed successfully
          serviceContext.metrics.incrementCounter('queryMonKilledQueries', {
            database
          });
          summary.kill++;
        } else if (killRow.pg_terminate_backend) {
          // if we got back "true" in the query's result row, it was killed successfully
          serviceContext.metrics.incrementCounter('queryMonTerminatedQueries', {
            database
          });
          summary.terminate++;
        } else {
          // otherwise it was not. mark it so and continue.
          serviceContext.metrics.incrementCounter('queryMonKillFailures', {
            database
          });
          queries[k].action = 'killFailed';
          summary.killFailed++;
        }
      }
    }

    summary.queryElapsedMs = queryElapsed;
    summary.killElapsedMs = killElapsed;

    const data = {
      database,
      queries,
      // Populated by the analyze sweep below, if it runs. Always present so the
      // non-null GraphQL field resolves either way.
      tables: [],
      timestamp: moment().toISOString(),
      event: 'queryMonitor',
      summary
    };
    if (errorStr) data.queryError = errorStr;
    // now message/log the whole thing
    messageUtil.emitEvent(data);

    return data;
  }

  /**
   * Discovers stale tables across every analyze-enabled database and runs
   * ANALYZE on the globally stalest ones, attaching the outcome to each
   * database's result.
   *
   * `targets` is a list of `{ database, result }` pairs, so which result object
   * a database records onto is resolved by name rather than by list position -
   * the analyze and kill selections are independent and need not line up.
   */
  async function analyzeDatabases(targets, args) {
    const stalenessDays = _.get(args, 'stalenessDays', analyzeStalenessDays);
    const maxTables = _.get(args, 'maxTables', analyzeMaxTables);
    // Not exposed as a GraphQL argument — overridable only for direct DAL
    // callers and tests, since the ceiling exists to protect the message budget.
    const deadline =
      Date.now() + _.get(args, 'analyzeMaxRunMs', analyzeMaxRunMs);

    // phase 1: discover candidates on every database concurrently.
    const discoveries = await Promise.all(
      targets.map(({ database, result }) =>
        discoverStaleTables(database, result, stalenessDays, maxTables)
      )
    );

    // phase 2: merge across databases, stalest first, and keep the top slice.
    const allCandidates = _.flatMap(discoveries, (d) => d.candidates);
    allCandidates.sort(compareCandidates);
    const selected = allCandidates.slice(0, maxTables);
    const deferredByDb = _.countBy(
      allCandidates.slice(maxTables),
      (c) => c.database
    );

    serviceContext.logger.info(
      'QUERYMON ANALYZE discovery complete: ' +
        `${allCandidates.length} candidate(s), analyzing ${selected.length}, ` +
        `deferring ${allCandidates.length - selected.length}`
    );

    // phase 3: ANALYZE per database (concurrent across databases, sequential
    // within one so we never pile maintenance onto a single host).
    const selectedByDb = _.groupBy(selected, (c) => c.database);
    await Promise.all(
      discoveries.map((discovery) =>
        analyzeTables(
          discovery,
          selectedByDb[discovery.database] || [],
          deferredByDb[discovery.database] || 0,
          deadline
        )
      )
    );
  }

  /**
   * Sort key for a candidate: the more recent of last_analyze /
   * last_autoanalyze. Never-analyzed tables sort first.
   */
  function candidateSortKey(candidate) {
    const analyze = candidate.lastAnalyze
      ? moment(candidate.lastAnalyze).valueOf()
      : Number.NEGATIVE_INFINITY;
    const autoanalyze = candidate.lastAutoanalyze
      ? moment(candidate.lastAutoanalyze).valueOf()
      : Number.NEGATIVE_INFINITY;

    return Math.max(analyze, autoanalyze);
  }

  /**
   * Orders candidates stalest-first, with a deterministic tie-break so the same
   * set of tables is picked on every tick given the same input.
   */
  function compareCandidates(a, b) {
    const aKey = candidateSortKey(a);
    const bKey = candidateSortKey(b);
    if (aKey !== bKey) {
      // NEGATIVE_INFINITY (never analyzed) sorts first, but subtracting two
      // infinities is NaN so compare them explicitly.
      if (aKey === Number.NEGATIVE_INFINITY) return -1;
      if (bKey === Number.NEGATIVE_INFINITY) return 1;
      return aKey - bKey;
    }

    const dbCmp = a.database.localeCompare(b.database);
    if (dbCmp !== 0) return dbCmp;
    const schemaCmp = a.schemaName.localeCompare(b.schemaName);
    if (schemaCmp !== 0) return schemaCmp;

    return a.tableName.localeCompare(b.tableName);
  }

  /**
   * Runs the discovery query for one database. A failure here is contained to
   * that database — the remaining ones still get analyzed.
   */
  async function discoverStaleTables(database, result, stalenessDays, maxTables) {
    const conn = getAnalyzeConnection(database);
    const start = Date.now();

    // A table is stale only when BOTH last_analyze and last_autoanalyze are
    // NULL or past the threshold — autoanalyze alone is enough to keep stats
    // fresh, so we must not schedule work it already did.
    //
    // The pg_has_role() predicate keeps out tables this connection cannot
    // analyze and preventing them from being rediscovered on every tick
    const sql = `
SELECT
  s.schemaname AS schema_name,
  s.relname AS table_name,
  s.last_analyze,
  s.last_autoanalyze
FROM
  pg_stat_user_tables s
  JOIN pg_class c ON c.oid = s.relid
WHERE
  (s.last_analyze IS NULL OR s.last_analyze < NOW() - make_interval(days => $1))
  AND (s.last_autoanalyze IS NULL OR s.last_autoanalyze < NOW() - make_interval(days => $1))
  AND pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE')
ORDER BY GREATEST(
  COALESCE(s.last_analyze, '-infinity'::timestamptz),
  COALESCE(s.last_autoanalyze, '-infinity'::timestamptz)
) ASC,
  s.schemaname ASC,
  s.relname ASC
LIMIT $2
    `;

    let candidates = [];
    let errorStr;
    try {
      // Over-fetch per database so the cross-database merge has enough to
      // choose from: any one database could legitimately own the whole budget.
      candidates = await conn.map(
        sql,
        [stalenessDays, maxTables],
        mapper.camelizeRootKeys
      );
      candidates.forEach((candidate) => {
        candidate.database = database;
      });
    } catch (err) {
      errorStr = _.get(err, 'data.internalData.message', err.message);
      serviceContext.metrics.incrementCounter('analyzeMonErrors', { database });
    }

    const discoverElapsed = Date.now() - start;
    serviceContext.logger.debug(
      'QUERYMON ANALYZE DISCOVER END ' +
        database +
        ' ' +
        candidates.length +
        ' ' +
        discoverElapsed
    );

    return { database, conn, result, candidates, errorStr, discoverElapsed };
  }

  function getAnalyzeConnection(database) {
    if (!serviceContext.dbConnections[database])
      throw new Error('no db configured for ' + database);
    const conn =
      serviceContext.dbConnections[database].write ||
      serviceContext.dbConnections[database].read;
    if (!conn) throw new Error('no write configuration for ' + database);

    return conn;
  }

  /**
   * Runs ANALYZE sequentially over the selected tables for one database and
   * records the outcome on that database's result object.
   */
  async function analyzeTables(discovery, selected, deferred, deadline) {
    const { database, conn, result } = discovery;
    const analyzeSummary = {
      queryError: discovery.errorStr ? 1 : 0,
      analyzed: 0,
      failed: 0,
      deferred,
      candidates: discovery.candidates.length
    };
    let errorStr = discovery.errorStr;
    const tables = [];

    const start = Date.now();
    for (let i = 0; i < selected.length; i++) {
      const candidate = selected[i];

      // Leave the rest for the next tick rather than overrun the message budget.
      if (Date.now() >= deadline) {
        const remaining = selected.length - i;
        analyzeSummary.deferred += remaining;
        serviceContext.logger.debug(
          'QUERYMON ANALYZE budget exhausted for ' +
            database +
            ', deferring ' +
            remaining +
            ' table(s)'
        );
        break;
      }

      const tableStart = Date.now();
      const table = {
        schemaName: candidate.schemaName,
        tableName: candidate.tableName,
        lastAnalyze: candidate.lastAnalyze,
        lastAutoanalyze: candidate.lastAutoanalyze,
        action: 'analyzed'
      };

      // Identifiers come from pg_stat_user_tables rather than user input, but
      // they still have to be quoted — mixed-case and reserved-word table
      // names are legal and would otherwise break or mis-target the statement.
      const target = `${pgp.as.name(candidate.schemaName)}.${pgp.as.name(
        candidate.tableName
      )}`;

      try {
        serviceContext.logger.info(
          'QUERYMON ANALYZE ' + database + ' ' + target
        );
        await conn.none(`ANALYZE ${target}`);
        analyzeSummary.analyzed++;
        serviceContext.metrics.incrementCounter('analyzeMonTables', {
          database
        });
      } catch (err) {
        // One bad table must not cost us the rest of the run.
        table.action = 'failed';
        errorStr = _.get(err, 'data.internalData.message', err.message);
        analyzeSummary.failed++;
        serviceContext.metrics.incrementCounter('analyzeMonErrors', {
          database
        });
        serviceContext.logger.error(
          'QUERYMON ANALYZE FAILED ' + database + ' ' + target + ' ' + errorStr
        );
      }

      table.durationMs = Date.now() - tableStart;
      tables.push(table);
    }

    analyzeSummary.discoverElapsedMs = discovery.discoverElapsed;
    analyzeSummary.analyzeElapsedMs = Date.now() - start;

    result.tables = tables;
    result.analyzeSummary = analyzeSummary;
    if (errorStr && !result.queryError) result.queryError = errorStr;

    // Emitted separately from the queryMonitor event so that event keeps its
    // existing shape and timing for anything already consuming it.
    messageUtil.emitEvent({
      database,
      tables,
      timestamp: moment().toISOString(),
      event: 'databaseAnalyze',
      summary: analyzeSummary,
      ...(errorStr ? { queryError: errorStr } : {})
    });

    return result;
  }

  return {
    queryMonitor,
    _getQueryExcludeUserNames,
    _getAnalyzeDatabases,
    compareCandidates
  };
};
