'use strict';

const _ = require('lodash');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
const model = require('../model');

module.exports = function init(conn, paging) {
  if (!conn) {
    throw new Error('conn is required');
  }

  if (!conn.schemaName) {
    throw new Error('conn.schemaName is required');
  }

  if (!paging) {
    throw new Error('paging is required');
  }

  const { schemaName } = conn;
  const dal = Object.create(require('./common')(conn));
  const libraryTypeSubquery = require('./library-type.subquery')(schemaName);

  Object.assign(dal, {
    getLibraryEngineModels,
    createLibraryEngineModel,
    updateLibraryEngineModel,
    deleteLibraryEngineModels
  });

  return dal;

  /**
   * Fetches a list of library engine models
   * @param {Object} [params={}]: an object containing query parameters
   * @return {Promise} a promise that resolves with an array of LibraryEngineModels or rejects with
   * 					 an error message
   */
  function getLibraryEngineModels(params = {}) {
    paging.enforceParams(params);

    let sql = `SELECT
				lem.*,
				l.library_id as l__library_id,
				l.version as l__version,
				l.name as l__name,
				l.cover_image_url as l__cover_image_url,
				l.description as l__description,
				l.owner_org_id as l__owner_org_id,
				lt.library_type_id as lt__library_type_id,
				lt.label as lt__label,
				lt.entity_type_name AS lt__entity_type_name,
				lt.entity_type_name_plural AS lt__entity_type_name_plural,
				lt.entity_type_schema AS lt__entity_type_schema,
				ltsq.entity_identifier_types AS lt__entity_identifier_types,
				COUNT(*) OVER() AS total
			FROM ${schemaName}.library_engine_model lem
			INNER JOIN ${schemaName}.library l
				ON lem.library_id = l.library_id
				AND l.deleted_date_time IS NULL
			INNER JOIN ${schemaName}.library_type lt
				ON l.library_type_id = lt.library_type_id
			INNER JOIN (${libraryTypeSubquery}) ltsq
				ON l.library_type_id = ltsq.library_type_id`;

    const values = [];
    const where = ['lem.deleted_date_time IS NULL'];

    if (params.currentVersion) {
      sql += `
				AND lem.library_version = l.version`;
    }

    if (params.libraryEngineModelId && params.libraryEngineModelId.length) {
      values.push(params.libraryEngineModelId);

      if (Array.isArray(params.libraryEngineModelId)) {
        where.push(
          `lem.library_engine_model_id = ANY(\$${values.length}::uuid[])`
        );
      } else {
        where.push('lem.library_engine_model_id = $' + values.length);
      }
    }

    if (params.libraryId && params.libraryId.length) {
      values.push(params.libraryId);

      if (Array.isArray(params.libraryId)) {
        where.push(`lem.library_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('lem.library_id = $' + values.length);
      }
    }

    if (params.engineId && params.engineId.length) {
      values.push(params.engineId);

      if (Array.isArray(params.engineId)) {
        where.push(`lem.engine_id = ANY(\$${values.length}::text[])`);
      } else {
        where.push('lem.engine_id = $' + values.length);
      }
    }

    if (params.hasOwnProperty('libraryVersion') && !params.currentVersion) {
      values.push(params.libraryVersion);
      where.push('lem.library_version = $' + values.length);
    }

    if (params.trainStatus && params.trainStatus.length) {
      values.push(params.trainStatus);

      if (Array.isArray(params.trainStatus)) {
        where.push(`lem.train_status = ANY(\$${values.length}::text[])`);
      } else {
        where.push('lem.train_status = $' + values.length);
      }
    }

    // if lastModified param is enabled, only return the most recent record
    if (params.lastModified) {
      sql += `
				INNER JOIN (
					SELECT library_id, MAX(created_date_time) as last_created_date_time
					FROM ${schemaName}.library_engine_model`;

      if (where.length) {
        sql +=
          `
					WHERE ` + where.join(' AND ').replace(/lem\./g, '');
      }

      sql += `
					GROUP BY library_id
				) sq
					ON sq.library_id = lem.library_id
					AND sq.last_created_date_time = lem.created_date_time`;
    } else if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    sql += `
			ORDER BY lem.created_date_time DESC
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal.query(conn.read, sql, values).then(function resolve(result) {
      let libraryEngineModels = [];
      let totalResults = 0;

      if (result && result.length) {
        libraryEngineModels = result.map(hydrateLibraryEngineModel);
        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(
        libraryEngineModels,
        params.offset,
        totalResults
      );
    });
  }

  /**
   * Create a library engine model
   * @param {model.LibraryEngineModel} libraryEngineModel - object representing the library engine model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibraryEngineModel(libraryEngineModel, dbClient) {
    if (!(libraryEngineModel instanceof model.LibraryEngineModel)) {
      return Promise.reject(
        new Error(
          'expected libraryEngineModel to be an instance of model.LibraryEngineModel'
        )
      );
    }

    const cols = [
      'library_engine_model_id',
      'library_id',
      'library_version',
      'engine_id',
      'train_job_id',
      'train_status',
      'data_url',
      'metadata',
      'created_date_time',
      'modified_date_time'
    ];

    const sql = `INSERT INTO ${schemaName}.library_engine_model
				(${cols.join(',')})
				(
					SELECT
						$1, $2, version, $3, $4, $5, $6, $7, $8, $9
					FROM ${schemaName}.library
					WHERE library_id = $10 AND deleted_date_time IS NULL
				)
				RETURNING *`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      libraryEngineModel.libraryEngineModelId,
      libraryEngineModel.libraryId,
      libraryEngineModel.engineId,
      libraryEngineModel.trainJobId,
      libraryEngineModel.trainStatus,
      libraryEngineModel.dataUrl ? libraryEngineModel.dataUrl.toString() : null,
      JSON.stringify(libraryEngineModel.metadata),
      currEpochTime,
      currEpochTime,
      libraryEngineModel.libraryId
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          return model.LibraryEngineModel.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          err.message = 'This library engine model already exists';
        }

        throw err;
      }
    );
  }

  /**
   * Update a library engine model
   * @param {model.LibraryEngineModel} libraryEngineModel - object representing the library engine model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibraryEngineModel(libraryEngineModel, dbClient) {
    if (!(libraryEngineModel instanceof model.LibraryEngineModel)) {
      return Promise.reject(
        new Error(
          'expected libraryEngineModel to be an instance of model.LibraryEngineModel'
        )
      );
    }

    if (!libraryEngineModel.libraryEngineModelId) {
      return Promise.reject(
        new Error('libraryEngineModel.libraryEngineModelId is required')
      );
    }

    const sql = `UPDATE ${schemaName}.library_engine_model
				SET
					train_job_id = $1,
					train_status = $2,
					data_url = $3,
					metadata = $4,
					modified_date_time = $5
				WHERE library_engine_model_id = $6
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      libraryEngineModel.trainJobId,
      libraryEngineModel.trainStatus,
      libraryEngineModel.dataUrl ? libraryEngineModel.dataUrl.toString() : null,
      JSON.stringify(libraryEngineModel.metadata),
      currEpochTime,
      libraryEngineModel.libraryEngineModelId
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          return model.LibraryEngineModel.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          err.message = 'This library engine model already exists';
        }

        throw err;
      }
    );
  }

  /**
   * Deletes library engine models matching the given parms
   * @param {model.LibraryEngineModel} libraryEngineModel - the libraryEngineModel model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibraryEngineModels(libraryEngineModel, dbClient) {
    if (!(libraryEngineModel instanceof model.LibraryEngineModel)) {
      return Promise.reject(
        new Error(
          'expected libraryEngineModel to be an instance of model.LibraryEngineModel'
        )
      );
    }

    let sql = `UPDATE ${schemaName}.library_engine_model
			SET deleted_date_time = $1`;

    const where = ['deleted_date_time IS NULL'];
    const values = [parseInt(new Date() / 1000, 10)];

    if (libraryEngineModel.libraryEngineModelId) {
      values.push(libraryEngineModel.libraryEngineModelId);
      where.push('library_engine_model_id = $2');
    } else if (libraryEngineModel.libraryId) {
      values.push(libraryEngineModel.libraryId);
      where.push('library_id = $2');

      if (libraryEngineModel.hasOwnProperty('libraryVersion')) {
        values.push(libraryEngineModel.libraryVersion);
        where.push('library_version = $' + values.length);
      }

      if (libraryEngineModel.engineId) {
        values.push(libraryEngineModel.engineId);
        where.push('engine_id = $' + values.length);
      }
    }

    if (where.length < 2) {
      return Promise.reject(
        new Error(
          'delete query requires at least one of: libraryEngineModelId, libraryId'
        )
      );
    }

    sql +=
      `
			WHERE ` + where.join('\nAND ');

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        return result ? result.length : 0;
      });
  }

  /**
   * Hydrates a library engine model instance with its embedded models
   * @param {Object} row - a single row from a pg query result
   * @return {model.LibraryEngineModel} a hydrated library engine model model
   * @private
   */
  function hydrateLibraryEngineModel(row) {
    const libraryEngineModel = model.LibraryEngineModel.fromDB(
      _.omit(row, ['library_id'])
    );

    if (row.l__library_id) {
      libraryEngineModel.library = model.Library.fromDB(
        _.mapKeys(row, function mapLibrary(value, key) {
          const matches = key.match(/^l__(.*)$/);
          return matches ? matches[1] : null;
        })
      );

      libraryEngineModel.library.libraryType = model.LibraryType.fromDB(
        _.mapKeys(row, function mapLibraryType(value, key) {
          const matches = key.match(/^lt__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }

    return libraryEngineModel;
  }
};
