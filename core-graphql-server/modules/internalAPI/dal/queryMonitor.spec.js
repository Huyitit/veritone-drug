const chaiExpect = require('chai').expect; //require('expect.js');
const _ = require('lodash');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../../../test/serviceContext.mock.js')();
const dal = require('./queryMonitor.js')(serviceContext);
const moment = require('moment');

describe('queryMonitor.js', function () {
  describe('#require()', function () {
    it('should load', async function () {
      chaiExpect(Object.keys(dal).length).to.equal(4);
      chaiExpect(typeof dal.queryMonitor).to.equal('function');
    });
  });

  describe('#queryMonitor', function () {
    it('should return error info on query error', async function () {
      serviceContext.dbConnections['third_party_gqm'].write._push(
        [],
        false,
        [],
        (sql, vars) => {
          throw new Error('test error generation third_party_gqm');
        }
      );
      serviceContext.dbConnections['core_gqm'].write._push(
        [],
        false,
        [],
        (sql, vars) => {
          throw new Error('test error generation core_gqm');
        }
      );
      serviceContext.dbConnections['media_platform_gqm'].write._push(
        [],
        false,
        [],
        (sql, vars) => {
          throw new Error('test error generation media_platform_gqm');
        }
      );
      const res = await dal.queryMonitor(mockUtil.makeContext(), {});
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(3);
      function validateData(data) {
        chaiExpect(data.queryError).to.exist;
        chaiExpect(data.queryError).to.include('test error generation');
        chaiExpect(data.summary).to.exist;
        chaiExpect(data.summary.queryError).to.equal(1);
        chaiExpect(data.summary.warn).to.equal(0);
        chaiExpect(data.summary.kill).to.equal(0);
        chaiExpect(data.summary.terminate).to.equal(0);
        chaiExpect(data.queries).to.exist;
        chaiExpect(data.queries.length).to.equal(0);
      }
      validateData(res[0]);
      validateData(res[1]);
      validateData(res[2]);
    });
    it('should handle kill', async function () {
      serviceContext.dbConnections['third_party_gqm'].write._push([], false);
      serviceContext.dbConnections['core_gqm'].write._push([], false);
      serviceContext.dbConnections['media_platform_gqm'].write._push(
        [
          {
            pid: 123,
            query_duration_seconds: 10,
            sql: 'select * from foo',
            database: 'media_platform',
            user_name: 'core-graphql-server',
            application_name: 'core-graphql-server',
            client_ip_address: '127.0.0.1',
            query_start_time: moment().valueOf(),
            state: 'running',
            action: 'warn'
          }
        ],
        false
      );
      const res = await dal.queryMonitor(mockUtil.makeContext(), {});
      chaiExpect(res).to.exist;
      const noRes = res.filter((obj) => obj.queries.length === 0);
      chaiExpect(noRes.length).to.equal(2);
    });
    /*it('should run', async function() {
      const res = await dal.queryMonitor(mockUtil.makeContext(), {});
      chaiExpect(res).to.exist;
      console.log(res.queryError);
    });
    */
    it('should truncate an over-long query sql string to 2000 chars and strip newlines (VE-27611 row 3)', async function () {
      serviceContext.dbConnections['third_party_gqm'].write._push([], false);
      serviceContext.dbConnections['core_gqm'].write._push([], false);
      const longSql = 'select * from foo\nwhere bar = 1 and baz = ' + 'x'.repeat(2500);
      serviceContext.dbConnections['media_platform_gqm'].write._push(
        [
          {
            pid: 456,
            query_duration_seconds: 5,
            sql: longSql,
            database: 'media_platform',
            user_name: 'core-graphql-server',
            application_name: 'core-graphql-server',
            client_ip_address: '127.0.0.1',
            query_start_time: moment().valueOf(),
            state: 'running',
            action: 'warn'
          }
        ],
        false
      );

      const res = await dal.queryMonitor(mockUtil.makeContext(), {});
      const withQueries = res.find((r) => r.queries.length > 0);

      chaiExpect(withQueries).to.exist;
      chaiExpect(withQueries.queries[0].sql.length).to.equal(2000);
      chaiExpect(withQueries.queries[0].sql).to.not.include('\n');

      const expected = longSql.replace(/\n/g, ' ').substring(0, 2000);
      chaiExpect(withQueries.queries[0].sql).to.equal(expected);
    });

    it('should mark a kill result with neither pg_cancel_backend nor pg_terminate_backend truthy as killFailed, exposing the summary.killFailure/killFailed counter bug (VE-27378 row 1)', async function () {
      serviceContext.dbConnections['third_party_gqm'].write._push([], false);
      serviceContext.dbConnections['core_gqm'].write._push([], false);
      serviceContext.dbConnections['media_platform_gqm'].write._push(
        [
          {
            pid: 999,
            query_duration_seconds: 200,
            sql: 'select * from foo',
            database: 'media_platform',
            user_name: 'someone',
            application_name: 'app',
            client_ip_address: '127.0.0.1',
            query_start_time: moment().valueOf(),
            state: 'active',
            action: 'warn'
          }
        ],
        false
      );
      // the kill/terminate statement itself succeeds (does not throw) but
      // returns a result row where neither backend-kill column is truthy --
      // the real-world case this row targets.
      serviceContext.dbConnections['media_platform_gqm'].write._push(
        [{}],
        false
      );

      const res = await dal.queryMonitor(mockUtil.makeContext(), {
        enableKill: true
      });
      const withQueries = res.find((r) => r.queries.length > 0);

      chaiExpect(withQueries).to.exist;
      chaiExpect(withQueries.queries[0].action).to.equal('killFailed');
      // pinning today's (broken) behavior: summary.killFailure -- the field
      // the summary object is actually initialized with -- is never
      // incremented on this branch, so it silently stays 0 forever...
      chaiExpect(withQueries.summary.killFailure).to.equal(0);
      // ...while summary.killFailed (a fresh, never-initialized property) is
      // incremented instead, producing NaN rather than a real counter.
      chaiExpect(withQueries.summary.killFailed).to.be.NaN;
    });
  });


  // The analyze sweep shares this mutation's tick, connections and scopes.
  describe('#queryMonitor analyze sweep', function () {
     // The three connections flagged `queryMonitor: true` in config/service.yml.
    const GQM_DBS = ['core_gqm', 'media_platform_gqm', 'third_party_gqm'];

    // Databases whose discovery this test has already queued, so the rest can be
    // topped up automatically. Without that the mock rejects the unexpected
    // query and the sweep records a discovery error the test never intended -
    // which would pass, while most of the sweep quietly failed.
    let discoveryQueued;

    function connOf(db) {
      return (
        serviceContext.dbConnections[db].write ||
        serviceContext.dbConnections[db].read
      );
    }

    /** Kill-sweep result for one monitored connection. Empty means no long queries. */
    function pushKill(db, rows = []) {
      connOf(db)._push(rows, false);
    }

    /**
     * Analyze discovery result for one database. `parse` is false throughout
     * because the mock's SQL parser handles neither make_interval() nor ANALYZE.
     */
    function pushDiscovery(db, rows) {
      discoveryQueued.push(db);
      connOf(db)._push(rows, false);
    }

    /** Results for `count` ANALYZE statements on one database. */
    function pushAnalyze(db, count, checkFunction = null) {
      for (let i = 0; i < count; i++) {
        connOf(db)._push([], false, [], checkFunction);
      }
    }

    function row(schema, table, lastAnalyze, lastAutoanalyze) {
      return {
        schema_name: schema,
        table_name: table,
        last_analyze: lastAnalyze || null,
        last_autoanalyze: lastAutoanalyze || null
      };
    }

    function byDb(res, db) {
      return _.find(res, (obj) => obj.database === db);
    }

    /**
     * Tops up discovery for every database the test did not set up, then runs the
     * mutation. Going through one helper means the top-up can never fall out of
     * sync with what a test queued.
     */
    async function runSweep(args) {
      dal._getAnalyzeDatabases().forEach((db) => {
        if (discoveryQueued.indexOf(db) === -1) pushDiscovery(db, []);
      });

      return dal.queryMonitor(mockUtil.makeContext(), args);
    }

    beforeEach(function () {
      serviceContext._clearAll();
      discoveryQueued = [];
      // every test needs the kill sweep to complete quietly first
      GQM_DBS.forEach((db) => pushKill(db));
    });

    it('should not run unless enableAnalyze is requested', async function () {
      const res = await dal.queryMonitor(mockUtil.makeContext(), {});

      chaiExpect(res.length).to.equal(GQM_DBS.length);
      res.forEach((data) => {
        // tables is always present so the non-null GraphQL field resolves;
        // a missing analyzeSummary is what marks the sweep as not run.
        chaiExpect(data.tables).to.deep.equal([]);
        chaiExpect(data.analyzeSummary).to.not.exist;
      });
    });

    it('should not run when enableAnalyze is false', async function () {
      const res = await dal.queryMonitor(mockUtil.makeContext(), {
        enableAnalyze: false
      });

      res.forEach((data) =>
        chaiExpect(data.analyzeSummary).to.not.exist
      );
    });

    it('should not run when analyzeEnabled is off in config', async function () {
      const offDal = require('./queryMonitor.js')(
        Object.assign({}, serviceContext, {
          config: Object.assign({}, serviceContext.config, {
            queryMonitor: Object.assign(
              {},
              serviceContext.config.queryMonitor,
              { analyzeEnabled: false }
            )
          })
        })
      );

      const res = await offDal.queryMonitor(mockUtil.makeContext(), {
        enableAnalyze: true
      });

      res.forEach((data) =>
        chaiExpect(data.analyzeSummary).to.not.exist
      );
    });

    it('should throw when neither sweep has any work', async function () {
      const saved = {};
      GQM_DBS.forEach((db) => {
        saved[db] = serviceContext.config.db[db].queryMonitor;
        serviceContext.config.db[db].queryMonitor = false;
      });

      let err;
      try {
        await dal.queryMonitor(mockUtil.makeContext(), {});
      } catch (e) {
        err = e;
      } finally {
        Object.keys(saved).forEach((db) => {
          serviceContext.config.db[db].queryMonitor = saved[db];
        });
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.message).to.include('"queryMonitor":true');
    });

    it('should still analyze when no connection is marked queryMonitor', async function () {
      // The analyze sweep does not depend on that flag, so the kill sweep's
      // config guard must not abort it.
      const saved = {};
      GQM_DBS.forEach((db) => {
        saved[db] = serviceContext.config.db[db].queryMonitor;
        serviceContext.config.db[db].queryMonitor = false;
      });
      // no kill sweep runs, so drop the kill results queued in beforeEach
      serviceContext._clearAll();
      discoveryQueued = [];
      pushDiscovery('sso', [row('public', 'sso_stale')]);
      pushAnalyze('sso', 1);

      let res;
      try {
        res = await runSweep({ enableAnalyze: true });
      } finally {
        Object.keys(saved).forEach((db) => {
          serviceContext.config.db[db].queryMonitor = saved[db];
        });
      }

      chaiExpect(byDb(res, 'sso').analyzeSummary.analyzed).to.equal(1);
      res.forEach((data) => {
        chaiExpect(data.queries).to.deep.equal([]);
        chaiExpect(data.summary.warn).to.equal(0);
        chaiExpect(data.summary.kill).to.equal(0);
        chaiExpect(data.summary.queryError).to.equal(0)
      });
    });

    it('should skip a queryMonitor connection with no connection string', async function () {
      // The queryMonitor flags live in service.yml while connection strings come
      // from the environment's own config, so an environment that does not
      // provision the *_gqm duplicates still has the flagged keys with no uri.
      // initdb turns those into empty entries; selecting them threw
      // "no write configuration for <key>" and failed the whole mutation.
      const savedConn = serviceContext.dbConnections.core_gqm;
      serviceContext.dbConnections.core_gqm = {};
      try {
        chaiExpect(dal._getAnalyzeDatabases()).to.not.include('core_gqm');

        const res = await runSweep({ enableAnalyze: true });

        // the other monitored databases are still swept, and core_gqm is absent
        // rather than throwing
        chaiExpect(_.map(res, 'database')).to.not.include('core_gqm');
        chaiExpect(_.map(res, 'database')).to.include('media_platform_gqm');
      } finally {
        serviceContext.dbConnections.core_gqm = savedConn;
      }
    });

    it('should bind the configured staleness and cap', async function () {
      let vars;
      // testServer.json sets no analyze overrides, so the code defaults apply
      connOf('core_gqm')._push([], false, [], (sql, args) => {
        vars = args;
        return true;
      });
      discoveryQueued.push('core_gqm');

      await runSweep({ enableAnalyze: true });

      chaiExpect(vars).to.deep.equal([15, 10]);
    });

    it('should still analyze when the kill statement itself fails', async function () {
      connOf('core_gqm')._clearResultQueue();
      connOf('core_gqm')._push(
        [
          {
            pid: 123,
            query_duration_seconds: 200,
            sql: 'select * from foo',
            database: 'platform',
            user_name: 'someone',
            application_name: 'app',
            client_ip_address: '127.0.0.1',
            query_start_time: moment().valueOf(),
            state: 'active',
            action: 'warn'
          }
        ],
        false
      );
      // the kill statement fails
      connOf('core_gqm')._push([], false, [], () => {
        throw new Error('kill statement boom');
      });
      pushDiscovery('core_gqm', [row('public', 'stale_one')]);
      pushAnalyze('core_gqm', 1);

      const res = await runSweep({ enableKill: true, enableAnalyze: true });
      const core = byDb(res, 'core_gqm');

      // the kill failure is reported, but it must not abort the analyze sweep
      chaiExpect(core.summary.queryError).to.equal(1);
      chaiExpect(core.analyzeSummary.analyzed).to.equal(1);
    });

    it('should only discover tables the connection can analyze', async function () {
      connOf('core_gqm')._push([], false, [
        'pg_has_role(current_user, c.relowner',
        'join pg_class c on c.oid = s.relid'
      ]);
      discoveryQueued.push('core_gqm');

      const res = await runSweep({ enableAnalyze: true });

      // a rejected query would surface as a discovery error on that database
      chaiExpect(byDb(res, 'core_gqm').analyzeSummary.queryError).to.equal(0);
    });

    it('should let args override the staleness and cap', async function () {
      let vars;
      connOf('core_gqm')._push([], false, [], (sql, args) => {
        vars = args;
        return true;
      });
      discoveryQueued.push('core_gqm');

      await runSweep({
        enableAnalyze: true,
        stalenessDays: 30,
        maxTables: 3
      });

      chaiExpect(vars).to.deep.equal([30, 3]);
    });

    it('should report a zero candidate count when nothing is stale', async function () {
      const res = await runSweep({ enableAnalyze: true });
      const core = byDb(res, 'core_gqm');

      chaiExpect(core.analyzeSummary.candidates).to.equal(0);
      chaiExpect(core.analyzeSummary.analyzed).to.equal(0);
      chaiExpect(core.tables).to.deep.equal([]);
    });

    it('should analyze discovered tables and record per-table detail', async function () {
      pushDiscovery('core_gqm', [row('public', 'foo')]);
      pushAnalyze('core_gqm', 1);

      const res = await runSweep({ enableAnalyze: true });
      const core = byDb(res, 'core_gqm');

      chaiExpect(core.analyzeSummary.candidates).to.equal(1);
      chaiExpect(core.analyzeSummary.analyzed).to.equal(1);
      chaiExpect(core.analyzeSummary.failed).to.equal(0);
      chaiExpect(core.tables.length).to.equal(1);
      chaiExpect(core.tables[0].schemaName).to.equal('public');
      chaiExpect(core.tables[0].tableName).to.equal('foo');
      chaiExpect(core.tables[0].action).to.equal('analyzed');
      chaiExpect(core.tables[0].durationMs).to.be.a('number');
    });

    it('should quote identifiers so mixed-case names are not folded', async function () {
      pushDiscovery('core_gqm', [row('public', 'Mixed-Case Table')]);
      const issued = [];
      pushAnalyze('core_gqm', 1, (sql) => {
        issued.push(sql);
        return true;
      });

      await runSweep({ enableAnalyze: true });

      chaiExpect(issued[0]).to.equal('ANALYZE "public"."Mixed-Case Table"');
    });

    it('should continue after a single table fails', async function () {
      pushDiscovery('core_gqm', [row('public', 'bad'), row('public', 'good')]);
      connOf('core_gqm')._push([], false, [], () => {
        throw new Error('permission denied for relation bad');
      });
      pushAnalyze('core_gqm', 1);

      const res = await runSweep({ enableAnalyze: true });
      const core = byDb(res, 'core_gqm');

      chaiExpect(core.analyzeSummary.failed).to.equal(1);
      chaiExpect(core.analyzeSummary.analyzed).to.equal(1);
      chaiExpect(core.tables[0].action).to.equal('failed');
      chaiExpect(core.tables[1].action).to.equal('analyzed');
      chaiExpect(core.queryError).to.include('permission denied');
    });

    it('should cap analyzed tables across databases, not per database', async function () {
      // 3 candidates in one database, 2 in another, cap of 3 overall.
      pushDiscovery('core_gqm', [
        row('public', 'a'),
        row('public', 'b'),
        row('public', 'c')
      ]);
      pushDiscovery('media_platform_gqm', [
        row('public', 'd'),
        row('public', 'e')
      ]);

      const res = await runSweep({
        enableAnalyze: true,
        maxTables: 3,
        // the ANALYZE statements themselves are never reached: a zero budget
        // is already spent, so every selected table defers
        analyzeMaxRunMs: 0
      });
      const core = byDb(res, 'core_gqm');
      const media = byDb(res, 'media_platform_gqm');

      const totalDeferred =
        core.analyzeSummary.deferred + media.analyzeSummary.deferred;
      chaiExpect(core.analyzeSummary.candidates).to.equal(3);
      chaiExpect(media.analyzeSummary.candidates).to.equal(2);
      // 5 candidates, cap 3 -> 2 deferred by the cap, 3 more by the budget
      chaiExpect(totalDeferred).to.equal(5);
    });

    it('should prefer never-analyzed tables over merely stale ones', async function () {
      const stale = moment().subtract(100, 'days').toDate();
      pushDiscovery('core_gqm', [row('public', 'stale_one', stale)]);
      pushDiscovery('media_platform_gqm', [row('public', 'never_analyzed')]);

      const issued = [];
      pushAnalyze('media_platform_gqm', 1, (sql) => {
        issued.push(sql);
        return true;
      });

      // a cap of 1 forces the sweep to choose between the two databases
      const res = await runSweep({ enableAnalyze: true, maxTables: 1 });

      chaiExpect(issued).to.deep.equal([
        'ANALYZE "public"."never_analyzed"'
      ]);
      chaiExpect(
        byDb(res, 'media_platform_gqm').analyzeSummary.analyzed
      ).to.equal(1);
      chaiExpect(byDb(res, 'core_gqm').analyzeSummary.deferred).to.equal(1);
    });

    it('should defer remaining tables once the budget is spent', async function () {
      pushDiscovery('core_gqm', [row('public', 'a'), row('public', 'b')]);

      const res = await runSweep({
        enableAnalyze: true,
        analyzeMaxRunMs: 0
      });
      const core = byDb(res, 'core_gqm');

      // Nothing started, so no ANALYZE result was consumed - the mock would
      // have rejected an unexpected statement.
      chaiExpect(core.analyzeSummary.analyzed).to.equal(0);
      chaiExpect(core.analyzeSummary.deferred).to.equal(2);
      chaiExpect(core.tables).to.deep.equal([]);
    });
  });

  describe('#_getAnalyzeDatabases', function () {
    it('should cover every database, not just the queryMonitor ones', function () {
      chaiExpect(dal._getAnalyzeDatabases()).to.include.members([
        'core',
        'core_gqm',
        'media_platform',
        'media_platform_gqm',
        'third_party',
        'third_party_gqm',
        'audience',
        'cms',
        'sso',
        'subscription'
      ]);
    });

    it('should exclude config entries that are not databases', function () {
      const res = dal._getAnalyzeDatabases();

      // `constants` and `queryTimeoutMillis` are config entries with no connection string
      chaiExpect(res).to.not.include('constants');
      chaiExpect(res).to.not.include('queryTimeoutMillis');
      res.forEach((key) => {
        const conn = serviceContext.dbConnections[key];
        chaiExpect(Boolean(conn.write || conn.read)).to.equal(true);
      });
    });

    it('should tolerate non-database keys on the connection map', async function () {
      // initdb attaches _redactUri/_redactText to dbConnections in production.
      // They have no config.db entry, so an unguarded lookup throws there while
      // passing here, where the mock does not attach them.
      serviceContext.dbConnections._redactUri = () => 'redacted';
      try {
        chaiExpect(dal._getAnalyzeDatabases()).to.not.include('_redactUri');

        ['core_gqm', 'media_platform_gqm', 'third_party_gqm'].forEach((db) => {
          serviceContext.dbConnections[db].write._push([], false);
        });
        const res = await dal.queryMonitor(mockUtil.makeContext(), {});

        chaiExpect(res.length).to.equal(3);
      } finally {
        // must remove the key, not blank it: _clearAll() dereferences .read on
        // every key of dbConnections and would throw on an undefined entry
        Reflect.deleteProperty(serviceContext.dbConnections, '_redactUri');
      }
    });

    it('should collapse connections pointing at the same database', function () {
      // A *_gqm connection is the same database under different credentials.
      // Sweeping both would spend half the cap re-analyzing the same tables.
      const saved = serviceContext.config.db.core_gqm.write;
      serviceContext.config.db.core_gqm.write =
        serviceContext.config.db.core.write;
      try {
        const res = dal._getAnalyzeDatabases();

        // one key for that database, and the queryMonitor one wins so both
        // sweeps report on a single result object
        chaiExpect(res).to.include('core_gqm');
        chaiExpect(res).to.not.include('core');
      } finally {
        serviceContext.config.db.core_gqm.write = saved;
      }
    });
  });

  describe('#compareCandidates', function () {
    const older = moment().subtract(100, 'days').toDate();
    const newer = moment().subtract(10, 'days').toDate();

    function candidate(database, schemaName, tableName, la, laa) {
      return {
        database,
        schemaName,
        tableName,
        lastAnalyze: la || null,
        lastAutoanalyze: laa || null
      };
    }

    it('should sort never-analyzed tables first', function () {
      const never = candidate('core', 'public', 'never');
      const stale = candidate('core', 'public', 'stale', older);

      chaiExpect(dal.compareCandidates(never, stale)).to.be.below(0);
      chaiExpect(dal.compareCandidates(stale, never)).to.be.above(0);
    });

    it('should use the more recent of analyze and autoanalyze', function () {
      // autoanalyze alone is enough to keep stats fresh, so the newer of the
      // two decides how stale a table really is.
      const a = candidate('core', 'public', 'a', older, newer);
      const b = candidate('core', 'public', 'b', older, older);

      chaiExpect(dal.compareCandidates(b, a)).to.be.below(0);
    });

    it('should break ties deterministically', function () {
      // Same staleness, so ordering falls to database, schema, then table -
      // otherwise the same input could pick different tables run to run.
      const a = candidate('core', 'public', 'a', older);
      const b = candidate('core', 'public', 'b', older);
      const c = candidate('media', 'public', 'a', older);

      chaiExpect(dal.compareCandidates(a, b)).to.be.below(0);
      chaiExpect(dal.compareCandidates(a, c)).to.be.below(0);
      chaiExpect(dal.compareCandidates(a, a)).to.equal(0);
    });
  });

  describe('#_getQueryExcludeUserNames', function () {
    const defaultExcludeUserNames = [
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

    it('config is not passed in', async function () {
      const res = dal._getQueryExcludeUserNames();
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(defaultExcludeUserNames.length);
      chaiExpect(res).to.have.members(defaultExcludeUserNames);
    });

    it('config does not include queryExcludeUserNames field', async function () {
      const res = dal._getQueryExcludeUserNames({});
      chaiExpect(res).to.exist;
      chaiExpect(res).to.have.members(defaultExcludeUserNames);
    });

    it('config includes queryExcludeUserNames field', async function () {
      const cfg = { queryExcludeUserNames: ['value1', 'value3', 'value2'] };
      const res = dal._getQueryExcludeUserNames(cfg);
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(cfg.queryExcludeUserNames.length);
      chaiExpect(res).to.have.members(cfg.queryExcludeUserNames);
    });
  });

  // queryDb() itself is not exported; the legacy 'media' -> 'media_platform'
  // rename is only reachable through the public queryMonitor() kill sweep, by
  // giving a fresh serviceContext a 'media' db-config entry (no such key
  // exists in the shared testServer.json fixture, so it is added and removed
  // around this one test rather than left in the shared fixture).
  describe('#queryMonitor legacy "media" db key rename (VE-27611 row 2)', function () {
    const config = require('../../../test/testServer.json');

    it('should route a legacy "media" db key to the media_platform connection instead of throwing', async function () {
      config.db.media = {
        queryMonitor: true,
        write:
          'postgres://foo:bar@0001.pg-media.aws-dev.veritone.com:5432/media?sslmode=disable'
      };
      try {
        const freshServiceContext = require('../../../test/serviceContext.mock.js')();
        const freshDal = require('./queryMonitor.js')(freshServiceContext);

        freshServiceContext.dbConnections['third_party_gqm'].write._push([], false);
        freshServiceContext.dbConnections['core_gqm'].write._push([], false);
        freshServiceContext.dbConnections['media_platform_gqm'].write._push(
          [],
          false
        );
        // the actual assertion target: a regression dropping the rename would
        // route this call at the still-empty 'media' connection instead, and
        // this queued result on 'media_platform' would never be consumed.
        freshServiceContext.dbConnections['media_platform'].write._push(
          [
            {
              pid: 789,
              query_duration_seconds: 1,
              sql: 'select 1',
              database: 'media_platform',
              user_name: 'core-graphql-server',
              application_name: 'core-graphql-server',
              client_ip_address: '127.0.0.1',
              query_start_time: moment().valueOf(),
              state: 'running',
              action: 'warn'
            }
          ],
          false
        );

        const res = await freshDal.queryMonitor(mockUtil.makeContext(), {});

        const withQueries = res.find(
          (r) => r.queries.length > 0 && r.queries[0].pid === 789
        );
        chaiExpect(withQueries).to.exist;
        chaiExpect(withQueries.queries[0].database).to.equal('media_platform');
      } finally {
        delete config.db.media;
      }
    });
  });
});
