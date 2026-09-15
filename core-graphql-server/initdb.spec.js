// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

describe('#initdb.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const customMetrics = require('./customMetrics.js')(serviceContext);
      let initdb = require('./initdb.js')(
        serviceContext.logger,
        serviceContext.config,
        customMetrics.metricsCounters
      );
      expect(typeof initdb).toEqual('object');
    });
  });

  describe('#redactUri', function () {
    let redactUri;

    beforeAll(function () {
      const customMetrics = require('./customMetrics.js')(serviceContext);
      const initdb = require('./initdb.js')(
        serviceContext.logger,
        serviceContext.config,
        customMetrics.metricsCounters
      );
      redactUri = initdb._redactUri;
    });

    it('strips the username and password from a connection string', function () {
      const redacted = redactUri(
        'postgresql://someUser:s3cr3tPassword@db.example.com:5432/mydb'
      );
      expect(redacted).toEqual('postgresql://<redacted>:<redacted>@db.example.com:5432/mydb');
      expect(redacted).not.toContain('someUser');
      expect(redacted).not.toContain('s3cr3tPassword');
    });

    it('omits the auth segment when the uri has no credentials', function () {
      const redacted = redactUri('postgresql://db.example.com:5432/mydb');
      expect(redacted).toEqual('postgresql://db.example.com:5432/mydb');
    });

    it('returns falsy input unchanged', function () {
      expect(redactUri(null)).toBeNull();
      expect(redactUri(undefined)).toBeUndefined();
      expect(redactUri('')).toEqual('');
    });

    it('returns a fully redacted placeholder when the uri cannot be parsed', function () {
      expect(redactUri(12345)).toEqual('<redacted>');
    });
  });

  describe('#redactText', function () {
    let redactText;

    beforeAll(function () {
      const customMetrics = require('./customMetrics.js')(serviceContext);
      const initdb = require('./initdb.js')(
        serviceContext.logger,
        serviceContext.config,
        customMetrics.metricsCounters
      );
      redactText = initdb._redactText;
    });

    it('strips credentials from a connection uri embedded in an error message', function () {
      const redacted = redactText(
        'password authentication failed for user "admin" (postgres://admin:s3cr3tPassword@db.example.com:5432/mydb)'
      );
      expect(redacted).toEqual(
        'password authentication failed for user "<redacted>" (postgresql://<redacted>:<redacted>@db.example.com:5432/mydb)'
      );
      expect(redacted).not.toContain('s3cr3tPassword');
      expect(redacted).not.toContain('admin');
    });

    it('redacts the db username from pg auth-failure messages and stacks', function () {
      const stack =
        'error: password authentication failed for user "HAAAA"\n' +
        '    at Parser.parseErrorMessage (/app/node_modules/pg-protocol/dist/parser.js:283:98)';
      const redacted = redactText(stack);
      expect(redacted).not.toContain('HAAAA');
      expect(redacted).toContain('for user "<redacted>"');
      expect(redacted).toContain('at Parser.parseErrorMessage');
    });

    it('redacts the role from role-does-not-exist messages', function () {
      expect(redactText('error: role "svc_graphql" does not exist')).toEqual(
        'error: role "<redacted>" does not exist'
      );
    });

    it('redacts a uri with a user but no password', function () {
      const redacted = redactText('Invalid URL: postgresql://admin@db.example.com/mydb');
      expect(redacted).toEqual(
        'Invalid URL: postgresql://<redacted>:<redacted>@db.example.com/mydb'
      );
      expect(redacted).not.toContain('admin');
    });

    it('redacts every credentialed uri in a multi-line stack', function () {
      const stack =
        'Error: connect failed to postgres://u1:p1@host-a:5432/db1\n' +
        '    at retry (postgres://u2:p2@host-b:5432/db2)';
      const redacted = redactText(stack);
      expect(redacted).not.toContain('p1');
      expect(redacted).not.toContain('p2');
      expect(redacted).toContain('host-a');
      expect(redacted).toContain('host-b');
    });

    it('leaves text without connection uris unchanged', function () {
      const message = 'duplicate key value violates unique constraint "pk_foo"';
      expect(redactText(message)).toEqual(message);
      const noAuth = 'failed to reach postgresql://db.example.com:5432/mydb';
      expect(redactText(noAuth)).toEqual(noAuth);
    });

    it('returns non-string input unchanged', function () {
      expect(redactText(undefined)).toBeUndefined();
      expect(redactText(null)).toBeNull();
      expect(redactText(12345)).toEqual(12345);
    });
  });

  describe('#setupConnection with a malformed connection string', function () {
    it('throws a clean error that does not leak the connection string', function () {
      const customMetrics = require('./customMetrics.js')(serviceContext);
      const badConfig = JSON.parse(JSON.stringify(serviceContext.config));
      // unparseable uri (invalid port) -- would throw ERR_INVALID_URL whose
      // .input carries the raw uri including the password
      badConfig.db.core.read =
        'postgresql://admin:s3cr3tPassword@host:notaport/mydb';

      let thrown;
      try {
        require('./initdb.js')(
          serviceContext.logger,
          badConfig,
          customMetrics.metricsCounters
        );
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeDefined();
      expect(thrown.message).toContain('invalid db connection string for "core"');
      expect(thrown.message).not.toContain('s3cr3tPassword');
      expect(thrown.input).toBeUndefined();
    });
  });

  describe('#sqlIdentity', function () {
    let sqlIdentity;

    beforeAll(function () {
      const customMetrics = require('./customMetrics.js')(serviceContext);
      const initdb = require('./initdb.js')(
        serviceContext.logger,
        serviceContext.config,
        customMetrics.metricsCounters
      );
      sqlIdentity = initdb._sqlIdentity;
    });

    it('should extract schema-qualified table and operation', function () {
      expect(
        sqlIdentity('SELECT a FROM recording.recording_asset WHERE x=$1')
      ).toEqual({ op: 'SELECT', table: 'recording.recording_asset' });
      expect(sqlIdentity('INSERT INTO job_new.task (a) VALUES ($1)')).toEqual({
        op: 'INSERT',
        table: 'job_new.task'
      });
      expect(
        sqlIdentity('DELETE FROM recording.recording WHERE recording_id=$1')
      ).toEqual({ op: 'DELETE', table: 'recording.recording' });
    });

    it('should find the first real relation inside a CTE', function () {
      const sql =
        'WITH ras AS (\n SELECT *\n FROM recording_asset r\n)' +
        ' SELECT * FROM ras';
      expect(sqlIdentity(sql)).toEqual({
        op: 'WITH',
        table: 'recording_asset'
      });
    });

    it('should ignore aliases and joins after the first relation', function () {
      const sql =
        'SELECT t.task_template_id FROM job_new.task_template AS t ' +
        'LEFT JOIN job_new.engine e ON 1=1';
      expect(sqlIdentity(sql)).toEqual({
        op: 'SELECT',
        table: 'job_new.task_template'
      });
    });

    // this is the label-cardinality guard: recording_asset partitions are
    // generated per ISO week, so without normalisation sql_slow_queries_total
    // would grow a new time series every week, forever.
    it('should collapse partition suffixes to one label', function () {
      const tables = [
        'recording_asset_2026_09_36',
        'recording_asset_2026_10_40',
        'recording_asset_2025_01_02',
        'recording_asset_2026_09',
        'recording_asset_p7'
      ];
      const labels = new Set(
        tables.map((t) => sqlIdentity('SELECT 1 FROM ' + t).table)
      );
      expect([...labels]).toEqual(['recording_asset']);
    });

    it('should degrade to unknown rather than guess', function () {
      expect(sqlIdentity('')).toEqual({ op: 'unknown', table: 'unknown' });
      expect(sqlIdentity(null)).toEqual({ op: 'unknown', table: 'unknown' });
      expect(sqlIdentity(undefined)).toEqual({
        op: 'unknown',
        table: 'unknown'
      });
      expect(sqlIdentity('VACUUM ANALYZE foo')).toEqual({
        op: 'OTHER',
        table: 'unknown'
      });
    });
  });

});
