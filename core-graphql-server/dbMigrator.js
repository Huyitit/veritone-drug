const _ = require('lodash');
const doT = require('dot');
const { execFileSync } = require('child_process');
const fs = require('fs');
const parse = require('pg-connection-string').parse;
const RedLock = require('redlock');
const { promisify } = require('util');
const path = require('path');

const pause = (duration) => new Promise((res) => setTimeout(res, duration)); // milliseconds

const TEMPLATE_SETTINGS = {
  evaluate: /\{\{([\s\S]+?)\}\}/g,
  interpolate: /\{\{=([\s\S]+?)\}\}/g,
  encode: /\{\{!([\s\S]+?)\}\}/g,
  use: /\{\{#([\s\S]+?)\}\}/g,
  define: /\{\{##\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g,
  conditional: /\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g,
  iterate: /\{\{~\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g,
  varname: 'it',
  strip: false,
  append: true,
  selfcontained: false
};

module.exports = function create(config, logger, metricsCounters, redisClient, serviceInfo) {
  if (!config) {
    throw new Error('config is not defined');
  }

  if (!logger) {
    throw new Error('logger is not defined');
  }

  if (!metricsCounters) {
    throw new Error('metricsCounters is not defined');
  }

  if (!redisClient) {
    throw new Error('redisClient is not defined');
  }

  const redisGet = promisify(redisClient.get).bind(redisClient);
  const redisSet = promisify(redisClient.set).bind(redisClient);

  const metrics = require('./metrics.js')({
    metricsCounters,
    logger: logger
  });

  const rootOrgId = _.get(config, 'flyway.rootOrgId', null);
  if (!rootOrgId) {
    throw new Error('flyway.rootOrgId is not defined.');
  }

  async function migrate() {
    const migrateEnabled = _.get(config, 'flyway.migrate', false);
    logger.info(`Flyway DB migration: ${migrateEnabled}`);
    if (!migrateEnabled) {
      return;
    }

    const flywayPath = _.get(config, 'flyway.path');
    if (!flywayPath) {
      throw new Error('Missing configuration for flyway.path');
    }

    const flywayConfigPath = _.get(config, 'flyway.configPath');
    if (!flywayConfigPath) {
      throw new Error('Missing configuration for flyway.configPath');
    }

    const commitHash = _.get(serviceInfo, 'commitHash', 'unknown');
    const sentinelKey = `db:migration:done:${commitHash}`;

    // Fast path: check if migration already completed for this build
    const alreadyDone = await redisGet(sentinelKey);
    if (alreadyDone) {
      logger.info(`Flyway: Migration already completed for ${commitHash}, skipping.`);
      return;
    }

    // Slow path: acquire lock, run migration, set sentinel
    const redLock = new RedLock([redisClient], { retryCount: 0 });
    redLock.on('clientError', (err) => logger.warn('Redis error: ' + err));

    const lockTTLMs = _.get(config, 'flyway.lockTTLMs', 180000);
    const lock = await acquireRedisLock(redLock, sentinelKey, lockTTLMs);
    let lockAcquiredAt = Date.now();

    try {
      // Double-check sentinel after acquiring lock (another instance may have finished)
      const doneAfterLock = await redisGet(sentinelKey);
      if (doneAfterLock) {
        logger.info(`Flyway: Migration completed by another instance for ${commitHash}.`);
        return;
      }

      const flywayConfTemplate = fs.readFileSync(
        `${flywayConfigPath}/flyway_template.conf`,
        'utf8'
      );
      const template = doT.template(flywayConfTemplate, TEMPLATE_SETTINGS);
      await migrateDBs(flywayPath, template, lock, lockTTLMs, lockAcquiredAt);

      // Set sentinel with configurable TTL
      const sentinelTTLSec = _.get(config, 'flyway.sentinelTTLSec', 86400);
      await redisSet(sentinelKey, Date.now().toString(), 'EX', sentinelTTLSec);
      logger.info(`Flyway: Migration sentinel set for ${commitHash}.`);
    } finally {
      lock.unlock().catch((err) => logger.error('Failed to release migration lock:', err));
    }

    if (_.get(config, 'flyway.migrateAndQuit', false) === true) {
      logger.info('migrateAndQuit=true, service shutting down...');
      process.exit(0);
    }
  }

  async function acquireRedisLock(redLock, sentinelKey, lockTTLMs) {
    const maxWaitMs = _.get(config, 'flyway.maxWaitMs', 60000);
    const baseDelayMs = _.get(config, 'flyway.baseDelayMs', 50);
    const maxDelayMs = _.get(config, 'flyway.maxDelayMs', 5000);

    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        return await redLock.lock('locks:db:migration', lockTTLMs);
      } catch (err) {
        attempt++;
        if (attempt === 1) {
          logger.info('Flyway: Blocked by Redis locks:db:migration, waiting...');
        }

        // Check sentinel — another instance may have finished while we waited
        const done = await redisGet(sentinelKey);
        if (done) {
          logger.info('Flyway: Migration completed by another instance while waiting.');
          return { unlock: () => Promise.resolve(), expiration: Infinity };
        }

        // Exponential backoff with jitter
        const expDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        const jitter = Math.random() * expDelay * 0.5;
        await pause(expDelay + jitter);
      }
    }

    throw new Error(
      `Flyway: Failed to acquire Redis lock after ${maxWaitMs}ms (${attempt} attempts). Crashing.`
    );
  }

  async function migrateDBs(flywayPath, tempFn, lock, lockTTLMs, lockAcquiredAt) {
    let migratedDbs = [];
    let resetCounter = true;
    const lockExtendThresholdMs = _.get(config, 'flyway.lockExtendThresholdMs', 30000);
    const dbNames = Object.keys(config.flyway.db);

    for (let idx = 0; idx < dbNames.length; idx++) {
      const dbName = dbNames[idx];
      const dbStartTime = Date.now();

      try {
        migrateDB(flywayPath, tempFn, dbName);
        migratedDbs.push(dbName);
      } catch (err) {
        resetCounter = false;
        const errMsg = err.message ? JSON.stringify(err.message, null, 2) : '';
        logger.error(
          `Failed to migrate database: ${dbName}. Error: ${errMsg}.`
        );
        const severity = errMsg.includes('__citest_') ? 'warning' : 'critical';
        metrics.incrementCounter('dbMigrationFailed', {
          db: dbName,
          severity: severity
        });

        const failOnFlywayError = _.get(config, 'flyway.failOnError', true);
        if (failOnFlywayError) {
          throw err;
        }
      }

      const dbElapsed = Date.now() - dbStartTime;
      logger.info(`Flyway: ${dbName} completed in ${dbElapsed}ms (${idx + 1}/${dbNames.length})`);

      // Extend lock if close to expiring and more DBs remain
      if (idx < dbNames.length - 1) {
        const remainingMs = lockAcquiredAt + lockTTLMs - Date.now();
        if (remainingMs < lockExtendThresholdMs) {
          try {
            lock = await lock.extend(lockTTLMs);
            lockAcquiredAt = Date.now();
            logger.info(`Flyway: Lock extended (was ${remainingMs}ms from expiry).`);
          } catch (err) {
            logger.error('Flyway: Failed to extend lock, aborting remaining migrations.', err);
            throw new Error('Lost migration lock between databases');
          }
        }
      }
    }

    if (resetCounter) metrics.resetCounter('dbMigrationFailed');
    logger.info(
      // prettier-ignore
      `Flyway database migration finished. Migrated ${migratedDbs.length} databases: ${migratedDbs.toString()}.`
    );
  }

  function migrateDB(flywayPath, tempFn, dbName) {
    // dbName is interpolated into a filesystem path (the Flyway config file) and
    // selects config keys; constrain it to a safe identifier as defense-in-depth.
    if (!/^[A-Za-z0-9_-]+$/.test(dbName)) {
      throw new Error(
        `Invalid dbName '${dbName}': expected characters [A-Za-z0-9_-] only`
      );
    }
    const configPath = _.get(config, `flyway.db.${dbName}.configPath`);
    if (!configPath) {
      throw new Error(
        `Missing configuration for flyway.db.${dbName}.configPath`
      );
    }
    // VE-23309: prevent path traversal — configPath must resolve within the service CWD
    const resolvedConfigPath = path.resolve(configPath);
    const serviceDir = path.resolve('.');
    if (resolvedConfigPath !== serviceDir && !resolvedConfigPath.startsWith(serviceDir + path.sep)) {
      throw new Error(
        `flyway.db.${dbName}.configPath must be within the service directory: ${configPath}`
      );
    }
    let scriptPath = _.get(config, `flyway.db.${dbName}.scriptPath`);
    if (!scriptPath) {
      throw new Error(`Missing scriptPath for flyway.db.${dbName}.configPath`);
    }
    scriptPath = scriptPath.map((path) => `filesystem:${path}`);

    const dbKey = _.get(config, `flyway.db.${dbName}.dbKey`) || dbName;
    const cnxStrting = _.get(config, `db.${dbKey}.write`);
    if (!cnxStrting) {
      throw new Error(
        'Missing write connection configuration for database: ' +
          dbName +
          '; dbKey = ' +
          dbKey
      );
    }
    const pgCnx = parse(cnxStrting);
    const sslmode = _.get(pgCnx, 'sslmode', 'disable');
    const validateOnMigrateForAllDb = _.get(
      config,
      `flyway.validateOnMigrate`,
      false
    );
    const validateOnMigrate =
      validateOnMigrateForAllDb === true
        ? _.get(config, `flyway.db.${dbName}.validateOnMigrate`, false)
        : false;
    const ignoreMigrationPatterns = _.get(
      config,
      `flyway.db.${dbName}.ignoreMigrationPatterns`
    );
    const flywayConfig = tempFn({
      // prettier-ignore
      dbUrl: `jdbc:postgresql://${pgCnx.host}:${pgCnx.port}/${pgCnx.database}?sslmode=${sslmode}`,
      dbUser: pgCnx.user,
      dbPassword: pgCnx.password,
      scriptsPath: scriptPath.join(','),
      externalDnsZone: config.dnsZone.external,
      rootOrgId: rootOrgId,
      nodeEnv: config.nodeEnv,
      environment: _.get(process, 'env.ENVIRONMENT', ''),
      aiwareDomainName: _.get(process, 'env.AIWARE_DOMAIN_NAME', ''),
      validateOnMigrate: validateOnMigrate,
      ignoreMigrationPatterns: ignoreMigrationPatterns
    });

    // prettier-ignore
    const flywayConfigFile = `${configPath}/flyway_${dbName}.conf`;
    fs.writeFileSync(flywayConfigFile, flywayConfig, {
      flag: 'w+'
    });

    // Run Flyway via execFileSync with an argument array (no shell) so none of
    // the interpolated values (flywayPath, configPath, dbName) can be parsed as
    // shell metacharacters — closes the OS-command-injection finding. Note the
    // previous `execSync(cmd, callback)` form never invoked the callback (execSync
    // is synchronous and its 2nd arg is options, not a callback), so the stdout
    // logging and error handling below were dead; they are now wired via try/catch.
    const flywayConfigArg = `-configFiles=${__dirname}/${flywayConfigFile}`;
    logger.debug(
      `flywayMigrateCmd: ${flywayPath} ${flywayConfigArg} migrate -skipCheckForUpdate`
    );
    try {
      const stdout = execFileSync(
        flywayPath,
        [flywayConfigArg, 'migrate', '-skipCheckForUpdate'],
        { encoding: 'utf8' }
      );
      logger.debug(`Flyway stdout: ${stdout}`);
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }

  return {
    migrate
  };
};
