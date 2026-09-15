// ---------------------------------------------------------------------------
// Concurrency tests — simulate 100+ instances racing to run migration
// ---------------------------------------------------------------------------
// These tests use standalone mocks (no serviceContext) so fake timers,
// mocked HTTP, etc. from the base mock do not interfere with the async
// retry/backoff logic under test.
// ---------------------------------------------------------------------------

describe('#dbMigrator concurrency', () => {
  // These concurrency tests use standalone mocks and rely on real
  // setTimeout behavior for backoff/pause across the entire suite.
  beforeAll(() => jest.useRealTimers());

  // ---- shared state visible to every "instance" ----------------------------
  let redisStore; // in-memory key-value store backing the mock redisClient
  let lockHolder; // null | string — current lock holder id
  let lockExpiry; // timestamp when the current lock expires
  let migrationRunCount; // how many times execSync (flyway) actually ran
  let migrationConcurrent; // how many migrations are running RIGHT NOW
  let maxConcurrentMigrations; // high-water mark of concurrent migrations
  let unlockCount; // how many unlock calls were made
  let totalRedisGets; // how many redisClient.get calls across all instances

  // ---- mock factories ------------------------------------------------------

  /**
   * Callback-style Redis client mock (matches redis v3 API).
   * Production code wraps these with `promisify`, so the signatures must
   * follow the Node callback convention: last arg is `(err, result) => {}`.
   * All instances share `redisStore` so sentinel writes propagate immediately.
   */
  function createRedisClient() {
    return {
      get: (key, cb) => {
        totalRedisGets++;
        if (cb) return cb(null, redisStore[key] || null);
      },
      set: (key, value, ...rest) => {
        redisStore[key] = value;
        const cb = rest.find(a => typeof a === 'function');
        if (cb) return cb(null, 'OK');
      }
    };
  }

  /**
   * Mutex-like RedLock mock.
   *
   * - Only one caller can hold the lock at a time (mirrors real Redis SET NX).
   * - `.lock()` throws when the lock is already held (forces the outer
   *   backoff loop in `acquireRedisLock`).
   * - `.unlock()` releases immediately.
   * - `.extend()` resets the expiry if the caller still holds the lock.
   * - Tracks `lockHolder` / `lockExpiry` in the outer closure so every
   *   instance sees the same state.
   */
  function MockRedLock(_clients, _opts) {
    // nothing to store per-instance
  }
  MockRedLock.prototype.on = function () {}; // swallow event listeners
  MockRedLock.prototype.lock = function (key, ttl) {
    const now = Date.now();
    if (lockHolder && now < lockExpiry) {
      return Promise.reject(new Error('MOCK_LOCK: resource is already locked'));
    }
    const id = Math.random().toString(36).slice(2);
    lockHolder = id;
    lockExpiry = now + ttl;
    unlockCount = unlockCount || 0;

    const lockObj = {
      id,
      expiration: lockExpiry,
      unlock: () => {
        if (lockHolder === id) {
          lockHolder = null;
          lockExpiry = 0;
        }
        unlockCount++;
        return Promise.resolve();
      },
      extend: (newTtl) => {
        if (lockHolder !== id) {
          // Only fail if someone else stole the lock — not on wall-clock expiry.
          // Real-time expiry checks cause spurious failures on loaded CI runners
          // where the 10ms busy-wait can take 50ms+, exceeding the tight TTL.
          return Promise.reject(new Error('MOCK_LOCK: cannot extend – lock lost'));
        }
        lockExpiry = Date.now() + newTtl;
        lockObj.expiration = lockExpiry;
        return Promise.resolve(lockObj);
      }
    };
    return Promise.resolve(lockObj);
  };

  /**
   * Build a minimal config that enables migration and uses very short timings
   * so the test completes quickly even with 200 instances.
   */
  function buildConfig(overrides = {}) {
    return {
      dnsZone: { external: 'test.local' },
      nodeEnv: 'test',
      flyway: {
        migrate: true,
        rootOrgId: 7682,
        path: '/usr/bin/flyway',
        configPath: 'flyway/conf',
        lockTTLMs: 5000,
        maxWaitMs: 10000,
        baseDelayMs: 1,
        maxDelayMs: 20,
        lockExtendThresholdMs: 2000,
        sentinelTTLSec: 86400,
        failOnError: true,
        db: {
          testdb: {
            configPath: 'flyway/db/testdb',
            scriptPath: ['flyway/db/testdb/sql']
          }
        },
        ...overrides
      },
      db: {
        testdb: {
          write: 'postgres://user:pass@localhost:5432/testdb'
        }
      }
    };
  }

  /** No-op logger that records messages for optional inspection. */
  function createLogger() {
    const messages = [];
    const log = (level) => (msg) => messages.push({ level, msg });
    return {
      info: log('info'),
      warn: log('warn'),
      error: log('error'),
      debug: log('debug'),
      _messages: messages
    };
  }

  /** Minimal metricsCounters stub that satisfies metrics.js */
  function createMetricsCounters() {
    const noop = { inc: () => {}, reset: () => {}, observe: () => {} };
    return new Proxy({}, { get: () => noop });
  }

  // ---- Jest module mocks ---------------------------------------------------
  // We need to intercept `require('redlock')`, `require('child_process')`, and
  // `require('fs')` inside dbMigrator.js.  We use jest manual mocks so that
  // each test can control behaviour.

  let mockExecSync;
  let mockReadFileSync;

  beforeEach(() => {
    // Reset shared state
    redisStore = {};
    lockHolder = null;
    lockExpiry = 0;
    migrationRunCount = 0;
    migrationConcurrent = 0;
    maxConcurrentMigrations = 0;
    unlockCount = 0;
    totalRedisGets = 0;
  });

  // Helper: create one "instance" of the migrator.
  // Each call to `createInstance` is analogous to one pod starting up.
  function createInstance(configOverrides, serviceInfoOverrides) {
    const config = buildConfig(configOverrides);
    const logger = createLogger();
    const redisClient = createRedisClient();
    const metricsCounters = createMetricsCounters();
    const serviceInfo = { commitHash: 'test-abc123', ...serviceInfoOverrides };

    // We cannot use jest.mock for per-instance overrides of built-in modules
    // when the module under test is loaded once.  Instead we load a *fresh*
    // copy of dbMigrator.js every time (jest isolateModules) and supply our
    // own mocks for redlock, fs, and child_process.
    let migrator;

    jest.isolateModules(() => {
      // Override redlock
      jest.doMock('redlock', () => MockRedLock);

      // Override fs.readFileSync (and keep the rest of fs intact)
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        readFileSync: () => 'flyway_template_content',
        writeFileSync: () => {}
      }));

      // Override doT.template to return a function that returns empty string
      jest.doMock('dot', () => ({
        template: () => () => ''
      }));

      // Override child_process.execFileSync to count migration runs
      // (dbMigrator runs flyway via execFileSync(bin, [args]) — no shell).
      jest.doMock('child_process', () => ({
        execFileSync: (file, args) => {
          migrationConcurrent++;
          if (migrationConcurrent > maxConcurrentMigrations) {
            maxConcurrentMigrations = migrationConcurrent;
          }
          migrationRunCount++;
          // Simulate some migration work (synchronous)
          const start = Date.now();
          while (Date.now() - start < 10) {
            // busy-wait 10ms to simulate flyway
          }
          migrationConcurrent--;
        }
      }));

      migrator = require('./dbMigrator.js')(
        config,
        logger,
        metricsCounters,
        redisClient,
        serviceInfo
      );
    });

    return { migrator, logger, config, redisClient, serviceInfo };
  }

  // --------------------------------------------------------------------------
  // Tests
  // --------------------------------------------------------------------------

  it('exactly one instance runs migration when 100 instances start concurrently', async () => {
    const INSTANCE_COUNT = 100;
    const instances = Array.from({ length: INSTANCE_COUNT }, () => createInstance());

    const results = await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // All instances should succeed (none should crash)
    expect(rejected.length).toBe(0);
    expect(fulfilled.length).toBe(INSTANCE_COUNT);

    // Flyway should have run exactly once (one DB in config → one execSync)
    expect(migrationRunCount).toBe(1);
  });

  it('no concurrent migration executions (max concurrency === 1)', async () => {
    const INSTANCE_COUNT = 100;
    const instances = Array.from({ length: INSTANCE_COUNT }, () => createInstance());

    await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    // At no point should two migrations have been running at the same time
    expect(maxConcurrentMigrations).toBe(1);
  });

  it('sentinel fast-path: instances skip migration after sentinel is set', async () => {
    const INSTANCE_COUNT = 150;
    const instances = Array.from({ length: INSTANCE_COUNT }, () => createInstance());

    await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    // Sentinel key should exist in redis
    const sentinelKey = 'db:migration:done:test-abc123';
    expect(redisStore[sentinelKey]).toBeDefined();

    // Migration ran exactly once
    expect(migrationRunCount).toBe(1);
  });

  it('instances that see sentinel before lock attempt return immediately', async () => {
    // Pre-set the sentinel to simulate a previous deployment
    redisStore['db:migration:done:test-abc123'] = Date.now().toString();

    const INSTANCE_COUNT = 50;
    const instances = Array.from({ length: INSTANCE_COUNT }, () => createInstance());

    await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    // No migration should have run at all — every instance took the fast path
    expect(migrationRunCount).toBe(0);
  });

  it('bounded Redis operations even with 200 instances', async () => {
    const INSTANCE_COUNT = 200;
    const instances = Array.from({ length: INSTANCE_COUNT }, () => createInstance());

    await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    // With the sentinel pattern + exponential backoff, Redis GETs should be
    // far less than the old approach (which would do 200 × 6000 = 1.2M).
    // Expected: ~200 initial sentinel checks + a handful of retries from
    // instances that enter the lock-wait loop before sentinel is set.
    // Upper bound: well under 2000 total operations.
    expect(totalRedisGets).toBeLessThan(2000);
    expect(migrationRunCount).toBe(1);
  });

  it('lock is released after migration completes', async () => {
    const inst = createInstance();
    await inst.migrator.migrate();

    // Lock should have been released
    expect(lockHolder).toBeNull();
  });

  it('multiple DBs: lock is extended when close to expiry', async () => {
    // Use a TTL shorter than the total migration time so extension is triggered.
    // Each mock migration busy-waits 10ms × 3 DBs = ~30ms total work.
    // Set TTL to 25ms with a 20ms threshold so after DB1 (~10ms elapsed)
    // the remaining time (15ms) < threshold (20ms) → triggers extension.
    const inst = createInstance({
      lockTTLMs: 25,
      lockExtendThresholdMs: 20,
      db: {
        db1: { configPath: 'flyway/db/db1', scriptPath: ['flyway/db/db1/sql'] },
        db2: { configPath: 'flyway/db/db2', scriptPath: ['flyway/db/db2/sql'] },
        db3: { configPath: 'flyway/db/db3', scriptPath: ['flyway/db/db3/sql'] }
      }
    });

    // Add matching DB connection strings
    inst.config.db.db1 = { write: 'postgres://user:pass@localhost:5432/db1' };
    inst.config.db.db2 = { write: 'postgres://user:pass@localhost:5432/db2' };
    inst.config.db.db3 = { write: 'postgres://user:pass@localhost:5432/db3' };

    await inst.migrator.migrate();

    // All 3 DBs should have been migrated
    expect(migrationRunCount).toBe(3);

    // Lock should be extended at least once (between db1→db2 or db2→db3)
    // We verify by checking the logger for extension messages
    const extensionLogs = inst.logger._messages.filter(
      m => m.msg && m.msg.includes('Lock extended')
    );
    expect(extensionLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('throws when lock acquisition times out', async () => {
    // Permanently hold the lock so no instance can acquire it
    lockHolder = 'permanent';
    lockExpiry = Date.now() + 999999;

    const inst = createInstance({
      maxWaitMs: 100, // very short wait → will time out quickly
      baseDelayMs: 1,
      maxDelayMs: 5
    });

    await expect(inst.migrator.migrate()).rejects.toThrow(
      /Failed to acquire Redis lock/
    );

    // No migration should have run
    expect(migrationRunCount).toBe(0);
  });

  it('second wave of instances skips via sentinel after first wave completes', async () => {
    // Wave 1: 50 instances
    const wave1 = Array.from({ length: 50 }, () => createInstance());
    await Promise.allSettled(wave1.map(inst => inst.migrator.migrate()));
    expect(migrationRunCount).toBe(1);

    // Wave 2: 50 more instances (same commitHash)
    const wave2 = Array.from({ length: 50 }, () => createInstance());
    await Promise.allSettled(wave2.map(inst => inst.migrator.migrate()));

    // Still only 1 migration total — wave 2 all hit sentinel fast-path
    expect(migrationRunCount).toBe(1);
  });

  it('new commit hash triggers new migration even if old sentinel exists', async () => {
    // Wave 1: old commit
    const wave1 = Array.from({ length: 10 }, () => createInstance());
    await Promise.allSettled(wave1.map(inst => inst.migrator.migrate()));
    expect(migrationRunCount).toBe(1);

    // Wave 2: new commit hash — should migrate again
    const wave2 = Array.from({ length: 10 }, () =>
      createInstance(undefined, { commitHash: 'new-deploy-xyz' })
    );

    await Promise.allSettled(wave2.map(inst => inst.migrator.migrate()));

    // A second migration should have run
    expect(migrationRunCount).toBe(2);
  });

  it('migration disabled: no instance attempts lock or migration', async () => {
    const INSTANCE_COUNT = 20;
    const instances = Array.from({ length: INSTANCE_COUNT }, () =>
      createInstance({ migrate: false })
    );

    await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    expect(migrationRunCount).toBe(0);
    // No sentinel should have been set
    expect(Object.keys(redisStore).length).toBe(0);
  });

  it('handles 200 instances with multiple databases', async () => {
    const INSTANCE_COUNT = 200;
    const DB_COUNT = 3;
    const dbOverrides = {
      db: {
        alpha: { configPath: 'flyway/db/alpha', scriptPath: ['flyway/db/alpha/sql'] },
        beta: { configPath: 'flyway/db/beta', scriptPath: ['flyway/db/beta/sql'] },
        gamma: { configPath: 'flyway/db/gamma', scriptPath: ['flyway/db/gamma/sql'] }
      }
    };

    const instances = Array.from({ length: INSTANCE_COUNT }, () => {
      const inst = createInstance(dbOverrides);
      inst.config.db.alpha = { write: 'postgres://user:pass@localhost:5432/alpha' };
      inst.config.db.beta = { write: 'postgres://user:pass@localhost:5432/beta' };
      inst.config.db.gamma = { write: 'postgres://user:pass@localhost:5432/gamma' };
      return inst;
    });

    const results = await Promise.allSettled(
      instances.map(inst => inst.migrator.migrate())
    );

    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected.length).toBe(0);

    // Each of the 3 DBs migrated exactly once
    expect(migrationRunCount).toBe(DB_COUNT);
    expect(maxConcurrentMigrations).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // dbName validation — shell-metacharacter injection guard (VE-23514)
  // ---------------------------------------------------------------------------
  // migrateDB() validates the flyway.db key against [A-Za-z0-9_-] before
  // writing it into a Flyway config file path.  These tests verify that the
  // guard fires for metacharacters that would allow shell injection and is
  // skipped for well-formed identifiers.
  describe('#dbMigrator dbName validation', () => {
    // Creates a migrator whose flyway.db config uses the given key as the sole
    // database name.  Reuses mock factories from the outer describe scope.
    function createValidatorInstance(dbKey) {
      let migrator;
      jest.isolateModules(() => {
        jest.doMock('redlock', () => MockRedLock);
        jest.doMock('fs', () => ({
          ...jest.requireActual('fs'),
          readFileSync: () => 'flyway_template_content',
          writeFileSync: () => {}
        }));
        jest.doMock('dot', () => ({ template: () => () => '' }));
        jest.doMock('child_process', () => ({ execFileSync: () => {} }));

        const config = buildConfig({
          db: { [dbKey]: { configPath: 'flyway/db/x', scriptPath: ['flyway/db/x/sql'] } }
        });
        // Mirror the key in config.db so migrateDBs can look up the connection
        // string before delegating to migrateDB (where the guard fires).
        config.db = { [dbKey]: { write: 'postgres://user:pass@localhost:5432/x' } };

        migrator = require('./dbMigrator.js')(
          config,
          createLogger(),
          createMetricsCounters(),
          createRedisClient(),
          { commitHash: 'test-abc' }
        );
      });
      return migrator;
    }

    it.each([
      ['slash',        'db/name'],
      ['semicolon',    'db;name'],
      ['dollar-paren', 'db$(cmd)'],
      ['space',        'db name'],
    ])('rejects migrate() when flyway.db key contains %s', async (_, dbKey) => {
      const migrator = createValidatorInstance(dbKey);
      await expect(migrator.migrate()).rejects.toThrow(`Invalid dbName '${dbKey}'`);
    });

    it('resolves migrate() for a valid flyway.db key', async () => {
      const migrator = createValidatorInstance('valid_db-name123');
      await migrator.migrate();
    });
  });

  // ---------------------------------------------------------------------------
  // configPath path traversal guard (VE-23309)
  // ---------------------------------------------------------------------------
  // migrateDB() validates that configPath resolves within the service CWD.
  // A regression removing the CWD bounds check would allow paths like
  // ../../etc to escape the service directory.
  describe('#dbMigrator configPath path traversal guard', () => {
    function createTraversalInstance(perDbConfigPath) {
      let migrator;
      jest.isolateModules(() => {
        jest.doMock('redlock', () => MockRedLock);
        jest.doMock('fs', () => ({
          ...jest.requireActual('fs'),
          readFileSync: () => 'flyway_template_content',
          writeFileSync: () => {}
        }));
        jest.doMock('dot', () => ({ template: () => () => '' }));
        jest.doMock('child_process', () => ({ execFileSync: () => {} }));

        const config = buildConfig({
          db: { testdb: { configPath: perDbConfigPath, scriptPath: ['flyway/db/testdb/sql'] } }
        });
        config.db = { testdb: { write: 'postgres://user:pass@localhost:5432/testdb' } };

        migrator = require('./dbMigrator.js')(
          config,
          createLogger(),
          createMetricsCounters(),
          createRedisClient(),
          { commitHash: 'test-abc' }
        );
      });
      return migrator;
    }

    it.each([
      ['double-dot parent traversal', '../../etc'],
      ['absolute path outside CWD', '/etc/passwd'],
      ['mixed traversal', 'flyway/../../../etc'],
    ])(
      'rejects migrate() when per-db configPath %s resolves outside the service directory',
      async (_, perDbConfigPath) => {
        const migrator = createTraversalInstance(perDbConfigPath);
        await expect(migrator.migrate()).rejects.toThrow('must be within the service directory');
      }
    );

    it('resolves migrate() when per-db configPath stays within the service directory', async () => {
      const migrator = createTraversalInstance('flyway/db/testdb');
      await migrator.migrate();
    });
  });
});
