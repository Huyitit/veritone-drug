'use strict';

const _ = require('lodash'),
  uuid = require('uuid'),
  moment = require('moment'),
  humps = require('humps');

module.exports = function init(app, model, pools) {
  const errors = require('../../../error')(app.config);
  const jobTable = 'job_new';
  const validBuildStates = [
    'fetching',
    'invalid',
    'uploaded',
    'pending',
    'approved',
    'disapproved',
    'deployed',
    'deploy-failed',
    'paused',
    'deleted',
    'deploying',
    'available'
  ];
  const buildSelect = `
    b.engine_id, b.build_id, b.price, b.version,
    b.is_legacy, b.docker_image,  b.task_runtime, b.build_state,
    b.build_size, b.vul_low_count, b.vul_medium_count, b.vul_high_count,
    b.vul_critical_count, b.deploy_date, b.deployment_model, b.manifest,
    b.created_date, b.updated_date, b.release_notes`;
  const buildReturning = `
    engine_id, build_id, price, version,
    is_legacy, docker_image, task_runtime, build_state,
    build_size, vul_low_count, vul_medium_count, vul_high_count,
    vul_critical_count, deploy_date, deployment_model,
    created_date, updated_date, manifest, release_notes`;
  const validOrderBy = ['asc', 'desc'];
  const validSortableColumns = [
    'build_id',
    'build_state',
    'vul_high_count',
    'vul_medium_count',
    'vul_low_count',
    'vul_critical_count',
    'created_date',
    'updated_date'
  ];

  const redisCacheMarkKey = '__SHARED__:EngineBuildList';

  /*
   * Generates task run time object for an engine.
   */
  function getDefaultTaskRuntime() {
    // The default task runtime for iron engine
    const defaultTaskRuntime = {
      iron: {
        cluster: app.config.manifest.clusterSizesToIds.small,
        priority: 0
      }
    };
    return defaultTaskRuntime;
  }

  return {
    getEngineBuilds: getEngineBuilds,
    getActiveEngineBuild: getActiveEngineBuild,
    getAllActiveEngineBuilds: getAllActiveEngineBuilds,
    getEngineBuild: getEngineBuild,
    createEngineBuild: createEngineBuild,
    updateEngineBuild: updateEngineBuild,
    updateBuildState: updateBuildState,
    pauseDeployedBuildsForEngine: pauseDeployedBuildsForEngine,
    deleteEngineBuild: deleteEngineBuild,
    dirtyBuildCache: dirtyBuildCache,
    updateEngineBuildForNodeRed: updateEngineBuildForNodeRed,
    getBuildCacheRedisKey: () => redisCacheMarkKey
  };

  /*
   * Gets builds for an engine.
   * @param {options} options - options to filter
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function getEngineBuilds(options, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const offset = options.offset || 0;
    let sqlWhere = [];
    let args = [];
    let sql = `
      SELECT
        ${buildSelect},
        COUNT(*) OVER () AS total
      FROM
        ${jobTable}.build b
      `;

    if (_.isString(options.engineId)) {
      args.push(options.engineId);
      sqlWhere.push(`b.engine_id = \$${args.length}`);  
    }
    if (_.isArray(options.buildIds) && options.buildIds.length > 0) {
      let insertItems = [];
      options.buildIds.forEach(function addArg(buildId) {
        args.push(buildId);
        insertItems.push(`\$${args.length}`);  
      });
      sqlWhere.push(`b.build_id IN (${insertItems.join(',')})`);
    }
    if (_.isArray(options.buildStates) && options.buildStates.length > 0) {
      let insertItems = [];
      options.buildStates.forEach(function addArg(buildState) {
        args.push(buildState);
        insertItems.push(`$${args.length}`);
      });
      sqlWhere.push(`b.build_state IN (${insertItems.join(',')})`);
    }
    if (!options.includeDeleted) {
      sqlWhere.push("b.build_state != 'deleted'");
    }

    if (options.dateTimeFilter && _.get(options, 'dateTimeFilter.length', 0)) {
      addDateTimeFilters(
        'b',
        options,
        sqlWhere,
        null,
        1000,
        {
          updatedDate: 'updated_date'
        },
        args
      );
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (
      options.sortColumn &&
      options.sortOrder &&
      validOrderBy.includes(options.sortOrder) &&
      validSortableColumns.includes(options.sortColumn)
    ) {
      sql += ` ORDER BY b.${options.sortColumn} ${options.sortOrder}`;
    } else if (options.orderBy) {
      let cases = '';
      options.orderBy.map((status, index) => {
        if (validBuildStates.includes(status)) {
          cases += `WHEN '${status}' THEN ${index + 1} `;
        }
      });

      sql += `
      ORDER BY
        CASE b.build_state
          ${cases}
        ELSE ${options.orderBy.length + 1}
      END
      `;
    } else {
      sql += ' ORDER BY b.version DESC ';
    }

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        const count = parseInt(_.get(dbResult, '[0].total', 0));
        const builds = dbResult.map(fromDBWithRuntime);
        builds.forEach(fixIds);
        const payload = {
          totalResults: count,
          from: offset,
          to: offset + dbResult.length,
          results: builds
        };

        callback(null, payload);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Gets a build for an engine.
   * @param {string} buildId - id of Build
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function getEngineBuild(buildId, engineId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      SELECT
        ${buildSelect}
      FROM
        ${jobTable}.build b
      WHERE
        b.build_id = $1 AND b.engine_id = $2
      `;

    const args = [buildId, engineId];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }
        const build = fromDBWithRuntime(dbResult[0]);
        fixIds(build);
        callback(null, build);
      })
      .catch((err) => callback(err, null));
  }
  function fromDBWithRuntime(dbResult) {
    const build = model.Build.fromDB(dbResult);
    build.taskRuntime = _.isEmpty(build.taskRuntime)
      ? { edge: {} }
      : build.taskRuntime;
    return build;
  }

  /*
   * Gets the active build for an engine.
   * @param {string} engineId - id of Engine
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function getActiveEngineBuild(engineId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      SELECT
        ${buildSelect}
      FROM
        ${jobTable}.build b
      WHERE
        b.engine_id = $1 AND b.build_state = 'deployed'
      `;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, [engineId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }
        if (dbResult.length > 1) {
          return callback(
            new Error(`engine ${engineId} has more than one active build`),
            null
          );
        }

        const build = model.Build.fromDB(dbResult[0]);
        fixIds(build);
        callback(null, build);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Gets all active builds. Used for the active build cache.
   * @param {string} engineId - id of Engine
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function getAllActiveEngineBuilds(options, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const args = [];
    let sqlWhere = [];

    let sql = `
      SELECT
        ${buildSelect}
      FROM
        ${jobTable}.build b
      `;

    sqlWhere.push(`b.build_state = 'deployed'`);

    if (
      _.get(options, 'dateTimeFilter') &&
      _.get(options, 'dateTimeFilter.length', 0)
    ) {
      addDateTimeFilters(
        'b',
        options,
        sqlWhere,
        null,
        1000,
        {
          updatedDate: 'updated_date'
        },
        args
      );
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        const count = parseInt(_.get(dbResult, '[0].total', 0));
        const builds = dbResult.map(model.Build.fromDB);
        builds.forEach(fixIds);
        const payload = {
          totalResults: count,
          results: builds
        };
        callback(null, payload);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Creates an engine build.
   * @param {object} build - Build to create
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function createEngineBuild(build, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    // set intial build state for nodeRed runtime
    if (
      build.taskRuntime &&
      Object.prototype.hasOwnProperty.call(build.taskRuntime, 'nodeRed')
    ) {
      build.buildState = 'available';
    }

    // Generate buildId if it is not predefined.
    if (_.isNil(build.id)) {
      build.id = uuid.v4();
    }

    const sql = `
      INSERT INTO ${jobTable}.build
        (engine_id, build_id,
        version,
        task_runtime, build_state, price, docker_image, manifest, release_notes)
      VALUES
        ($1, $2,
        (
          SELECT COALESCE(MAX(version),0)
          FROM ${jobTable}.build bv WHERE bv.engine_id = $1
        ) + 1,
        $3, $4, $5, $6, $7, $8)
      RETURNING
        ${buildReturning}`;

    const args = [
      build.engineId,
      build.id,
      build.taskRuntime || getDefaultTaskRuntime(),
      build.buildState || 'fetching',
      build.price,
      build.dockerImage || '',
      build.manifest,
      build.releaseNotes || ''
    ];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const dbBuild = model.Build.fromDB(dbResult[0]);
        dirtyBuildCache();
        fixIds(dbBuild);
        callback(null, dbBuild);
      })
      .catch((err) => callback(err, null));
  }

  function dirtyBuildCache() {
    const redisClient = app.redisClient;
    const val = moment().toISOString();
    redisClient.set(redisCacheMarkKey, val);
  }

  /*
   * Updates an engine build.
   * @param {object} build - Build to update
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function updateEngineBuild(build, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        ${jobTable}.build
      SET
        is_legacy = $1,
        docker_image = $2,
        build_state = $3,
        task_runtime = $4,
        build_size = $5,
        vul_low_count = $6,
        vul_medium_count = $7,
        vul_high_count = $8,
        vul_critical_count = $9,
        manifest = $10
      WHERE
        build_id = $11
      RETURNING
        ${buildReturning}`;

    const args = [
      build.isLegacy,
      build.dockerImage,
      build.buildState,
      build.taskRuntime,
      build.buildSize,
      build.vulLowCount,
      build.vulMediumCount,
      build.vulHighCount,
      build.vulCriticalCount,
      build.manifest,
      build.buildId
    ];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const dbBuild = model.Build.fromDB(dbResult[0]);
        dirtyBuildCache();
        fixIds(dbBuild);
        callback(null, dbBuild);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Updates state of an engine build.
   * @param {object} buildId - Id of Build to update
   * @param {string} buildState - Build State
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function updateBuildState(buildId, buildState, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        ${jobTable}.build
      SET
        build_state = $1
      WHERE
        build_id = $2
      RETURNING
        ${buildReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    try {
      const dbResult = await dbClient.query(sql, [buildState, buildId]);

      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        return callback(new Error('missing dbResult array'), null);
      }

      if (!dbResult.length) {
        return callback(null, null);
      }

      const build = model.Build.fromDB(dbResult[0]);
      dirtyBuildCache();
      fixIds(build);

      return callback(null, build);
    } catch (err) {
      return callback(err, null);
    }
  }

  /*
   * Pauses all deployed builds for an engine.
   * @param {object} engineId - Id of engine with builds to pause
   * @param {string} buildState - Build State
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function pauseDeployedBuildsForEngine(engineId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    if (!engineId) {
      app.logger.error('missing engineId');
      return callback({ statusCode: 400, message: 'missing engineId' });
    }

    const sql = `
      UPDATE
        ${jobTable}.build
      SET
        build_state = 'paused'
      WHERE
        engine_id = $1 AND build_state = 'deployed'
      RETURNING
        ${buildReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    try {
      const dbResult = await dbClient.query(sql, [engineId]);

      if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
        return callback(new Error('missing dbResult array'), null);
      }

      if (!dbResult.length) {
        return callback(null, null);
      }

      const build = model.Build.fromDB(dbResult[0]);
      dirtyBuildCache();
      fixIds(build);

      return callback(null, build);
    } catch (err) {
      return callback(err, null);
    }
  }

  /*
   * Soft deletes an engine build.
   * @param {object} buildId - Id of Build to delete
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function deleteEngineBuild(buildId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        ${jobTable}.build
      SET
        build_state = 'deleted'
      WHERE
        build_id = $1
      RETURNING
        ${buildReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, [buildId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const build = model.Build.fromDB(dbResult[0]);
        dirtyBuildCache();
        fixIds(build);
        callback(null, build);
      })
      .catch((err) => callback(err, null));
  }
  /*
   * Soft deletes an engine build.
   * @param {object} buildId - Id of Build to delete
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of build objects.
   */
  async function updateEngineBuildForNodeRed(
    buildId,
    runTime,
    dbClient,
    callback
  ) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        ${jobTable}.build
      SET
        task_runtime = $1
      WHERE
        build_id = $2
      RETURNING
        ${buildReturning}`;
    const args = [runTime, buildId];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const build = model.Build.fromDB(dbResult[0]);
        dirtyBuildCache();
        fixIds(build);
        callback(null, build);
      })
      .catch((err) => callback(err, null));
  }

  // Core server base is converting ids to string
  // https://github.com/veritone/core-server-base/blob/master/model/util/convert-db-value.js#L7
  function fixIds(build) {
    try {
      if (
        _.has(build, 'manifest.schemaId') &&
        _.isString(build.manifest.schemaId)
      ) {
        build.manifest.schemaId = parseInt(build.manifest.schemaId);
      }
      if (
        _.has(build, 'manifest.sourceId') &&
        _.isString(build.manifest.sourceId)
      ) {
        build.manifest.sourceId = parseInt(build.manifest.sourceId);
      }
    } catch (err) {
      // Eating error in case there are invalid strings
    }
  }

  function addDateTimeFilters(
    tableName,
    options,
    sqlWhere,
    dateFormatter,
    divisor = 1,
    columnMap = {},
    args
  ) {
    if (options.dateTimeFilter) {
      const filters = _.isArray(options.dateTimeFilter)
        ? options.dateTimeFilter
        : [options.dateTimeFilter];
      filters.forEach((filter) => {
        if (!(filter.toDateTime || filter.fromDateTime)) {
          throw new errors.InvalidInput({
            message:
              'At least one of toDateTime or fromDateTime must ' +
              'be specified on a job date-time filter.',
            data: {
              filter: filter
            }
          });
        }

        const column =
          columnMap[filter.field] || humps.decamelize(filter.field);
        const fallbackColumn =
          columnMap[filter.fallbackField] ||
          humps.decamelize(filter.fallbackField || '');
        const innerWhere = [];
        // note that we might receive a string in RTC format or an
        // integer in ms. in either case we need to convert
        let inequality = null;
        let formatedDate = null;
        if (filter.toDateTime) {
          inequality = filter.toDateTimeExclusive ? '<' : '<=';
          formatedDate = formatDate(filter.toDateTime);
        }
        if (inequality && formatDate) {
          args.push(formatedDate);
          let sql = `${tableName}.${column} ${inequality} $${args.length}`;
          if (fallbackColumn) {
            sql += ` OR (${tableName}.${column} IS null AND ${tableName}.${fallbackColumn} ${inequality} $${args.length})`;
          }
          innerWhere.push(sql);
        }
        inequality = formatedDate = null;
        if (filter.fromDateTime) {
          inequality = filter.fromDateTimeExclusive ? '>' : '>=';
          formatedDate = formatDate(filter.fromDateTime);
        }
        if (inequality && formatDate) {
          args.push(formatedDate);
          let sql = `${tableName}.${column} ${inequality} $${args.length}`;
          if (fallbackColumn) {
            sql += ` OR (${tableName}.${column} IS null AND ${tableName}.${fallbackColumn} ${inequality} $${args.length})`;
          }
          innerWhere.push(sql);
        }

        if (innerWhere.length > 0) {
          if (filter.includeEmpty && !fallbackColumn) {
            sqlWhere.push(
              `(${innerWhere.join(' AND ')} OR ${tableName}.${column} IS null)`
            );
          } else {
            sqlWhere.push(`(${innerWhere.join(' AND ')})`);
          }
        }
      });
    }

    function formatDate(date) {
      if (_.isFunction(dateFormatter)) {
        return dateFormatter(date);
      } else if (_.isString(dateFormatter) && dateFormatter === 'pg_ts') {
        return `'${moment(date).toISOString()}'`;
      } else if (_.isString(date)) {
        return Math.floor(Date.parse(date) / divisor);
      } else if (_.isNumber(date)) {
        return Math.floor(date / divisor);
      } else return date;
    }
  }
};
