'use strict';

const _ = require('lodash'),
  { v5: uuidv5 } = require('uuid'),
  uuidNamespace = 'a61091ed-1f70-45e1-b3c3-475378e8289d',
  LRU = require('lru-cache'),
  stringify = require('json-stable-stringify'),
  moment = require('moment');

module.exports = function init(app, model, pools) {
  const lruCache = new LRU({ max: 500 });
  const jobTable = 'job_new';
  const engineSelect = `
    e.metadata_version,
    e.engine_id, e.engine_category_id, e.engine_name, e.engine_description,
    e.engine_state, e.engine_currency, e.deployment_model, e.owner_organization_id,
    e.is_public, e.price, e.rating, e.website,
    e.logo_path, e.icon_path, e.order, e.dependency,
    e.core_job_data, e.fields, e.validation, e.application_id,
    e.asset, e.creates_recording, e.library_required, e.deleted,
    e.jwt_rights,
    e.created_date, e.updated_date,
    e.engine_alias_id, e.engine_alias_name, e.engine_alias_description, e.engine_alias_logo_path,
    e.edge_version, e.engine_manifest, e.cpu_resource_mcpu, e.gpu_supported, e.gpu_tier, e.distribution_type, e.price_dimension`;
  const engineReturning = `
    metadata_version,
    engine_id, engine_category_id, engine_name, engine_description,
    engine_state, engine_currency, deployment_model, owner_organization_id,
    is_public, price, rating, website,
    logo_path, icon_path, "order", dependency,
    core_job_data, fields, validation, application_id,
    asset, creates_recording, library_required,
    jwt_rights, use_cases, industries, engine_manifest,
    created_date, updated_date,
    engine_alias_id, engine_alias_name, engine_alias_description, engine_alias_logo_path,
    single_engine_tdo_job_json, single_engine_upload_job_json, edge_version, cpu_resource_mcpu, gpu_supported, gpu_tier, distribution_type, price_dimension, input_types`;
  const redisCacheBuildMarkKey = '__SHARED__:EngineBuildList';
  const redisCacheEngineMarkKey = '__SHARED__:EngineList';

  return {
    getEngine: getEngine,
    updateEngine: updateEngine,
    dirtyEngineBuildCache: dirtyEngineBuildCache,
    updateEngineState: updateEngineState,
    deleteEngine: deleteEngine
  };

  /*
   * Get an engine.
   * @param {string} engineId - engine id
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of role objects.
   */
  async function getEngine(engineId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      SELECT
        ${engineSelect}, b.build_id
      FROM
        ${jobTable}.engine e
      LEFT JOIN ${jobTable}.build b on e.engine_id = b.engine_id and b.build_state = 'deployed'
      WHERE
        e.engine_id = $1`;

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

        const engine = model.Engine.fromDB(dbResult[0]);
        callback(null, engine);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Updates an engine.
   * @param {object} engine - Engine to update
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of role objects.
   */
  async function updateEngine(engine, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    // make absolutely sure we don't clear the engine fields column
    // if the caller didn't send a value.

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [
      engine.engineCategoryId,
      engine.engineName,
      engine.engineDescription,
      engine.engineCurrency || 'USD',
      engine.deploymentModel || 0,
      !!engine.isPublic,
      engine.price,
      !!engine.libraryRequired,
      currEpochTime,
      engine.logoPath,
      engine.iconPath,
      engine.asset,
      engine.coreJobData,
      engine.engineId
    ];

    let fieldsToUpdateIfSupplied = '';
    if (engine.fields) {
      args.push(JSON.stringify(engine.fields));
      fieldsToUpdateIfSupplied += `, fields = $${args.length}`;
    }
    if (engine.useCases) {
      args.push(JSON.stringify(engine.useCases));
      fieldsToUpdateIfSupplied += `, use_cases = $${args.length}`;
    }
    if (engine.industries) {
      args.push(JSON.stringify(engine.industries));
      fieldsToUpdateIfSupplied += `, industries = $${args.length}`;
    }
    if (engine.engineManifest) {
      args.push(engine.engineManifest);
      fieldsToUpdateIfSupplied += `, engine_manifest = $${args.length}`;
    }
    if (engine.jwtRights) {
      args.push(JSON.stringify(engine.jwtRights));
      fieldsToUpdateIfSupplied += `, jwt_rights = $${args.length}`;
    }

    if (engine.edgeVersion) {
      args.push(engine.edgeVersion);
      fieldsToUpdateIfSupplied += `, edge_version=$${args.length}`;
    }

    if (engine.cpuResourceMcpu) {
      args.push(engine.cpuResourceMcpu);
      fieldsToUpdateIfSupplied += `, cpu_resource_mcpu = $${args.length}`;
    }

    if (engine.gpuSupported) {
      args.push(engine.gpuSupported);
      fieldsToUpdateIfSupplied += `, gpu_supported = $${args.length}`;
    }

    if (engine.gpuTier) {
      args.push(engine.gpuTier);
      fieldsToUpdateIfSupplied += `, gpu_tier = $${args.length}`;
    }

    if (engine.website) {
      args.push(engine.website);
      fieldsToUpdateIfSupplied += `, website = $${args.length}`;
    }

    if (engine.distributionType) {
      args.push(engine.distributionType);
      fieldsToUpdateIfSupplied += `, distribution_type=$${args.length}`;
    }

    if (engine.priceDimension) {
      args.push(_.toLower(engine.priceDimension));
      fieldsToUpdateIfSupplied += `, price_dimension=$${args.length}`;
    }

    if (engine.inputTypes) {
      args.push(engine.inputTypes);
      fieldsToUpdateIfSupplied += `, input_types=$${args.length}`;
    }

    let metaVersionSet = '';
    let metaVersionWhere = '';
    if (engine.metadataVersion) {
      args.push(JSON.stringify(engine.metadataVersion));
      metaVersionSet = `, metadata_version = $${args.length}`;
      metaVersionWhere = `AND metadata_version < $${args.length}`;
    } else {
      metaVersionSet = `, metadata_version = metadata_version + 1`;
    }
    const sql = `
      UPDATE
        ${jobTable}.engine
      SET
        engine_category_id = $1,
        engine_name = $2,
        engine_description = $3,
        engine_currency = $4,
        deployment_model = $5,
        is_public = $6,
        price = $7,
        library_required = $8,
        updated_date = $9,
        logo_path = $10,
        icon_path = $11,
        asset = $12,
        core_job_data = $13
        ${fieldsToUpdateIfSupplied}
        ${metaVersionSet}
      WHERE
        engine_id = $14
        ${metaVersionWhere}
      RETURNING
        ${engineReturning}`;

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

        const dbEngine = model.Engine.fromDB(dbResult[0]);
        dirtyEngineBuildCache();
        callback(null, dbEngine);
      })
      .catch((err) => {
        callback(err, null);
      });
  }

  function dirtyEngineBuildCache() {
    const redisClient = app.redisClient;
    const val = moment().toISOString();
    redisClient.set(redisCacheBuildMarkKey, val);
    redisClient.set(redisCacheEngineMarkKey, val);
  }

  /*
   * Updates state of an engine.
   * @param {object} engineId - Id of Engine to update
   * @param {string} engineState - Engine State
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of role objects.
   */
  async function updateEngineState(engineId, engineState, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!engineId) {
      app.logger.error('missing engineId');
      return callback({ statusCode: 400, message: 'missing engineId' });
    }

    const sql = `
      UPDATE
        ${jobTable}.engine
      SET
        engine_state = $1
      WHERE
        engine_id = $2
      RETURNING
        ${engineReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, [engineState, engineId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const engine = model.Engine.fromDB(dbResult[0]);
        dirtyEngineBuildCache();
        callback(null, engine);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Soft deletes an engine.
   * @param {object} engineId - Id of Engine to delete
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of role objects.
   */
  async function deleteEngine(engineId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    if (!engineId) {
      app.logger.error('missing engineId');
      return callback({ statusCode: 400, message: 'missing engineId' });
    }

    const sql = `
      UPDATE
        ${jobTable}.engine
      SET
        engine_state = 'deleted',
        deleted = TRUE
      WHERE
        engine_id = $1
      RETURNING
        ${engineReturning}`;

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

        const engine = model.Engine.fromDB(dbResult[0]);
        dirtyEngineBuildCache();
        callback(null, engine);
      })
      .catch((err) => callback(err, null));
  }
};
