'use strict';

const _ = require('lodash');
const model = require('../model');

module.exports = function init(conn, paging, searchIndex) {
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
    getLibraries,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    incrementVersion
  });

  return dal;

  /**
   * Fetches a list of libraries
   * @param {Object} [params={}] an object containing query parameters
   * @param {Object} [include={}] - a map specifying subdocs to include with each result
   * @return {Promise} a promise that resolves with a result object or rejects with an error message
   */
  function getLibraries(params = {}, includes = {}) {
    paging.enforceParams(params);

    let sqlSelect = `SELECT
				l.*,
				lt.library_type_id AS lt__library_type_id,
				lt.label AS lt__label,
				lt.icon_class AS lt__icon_class,
				lt.entity_type_name AS lt__entity_type_name,
				lt.entity_type_name_plural AS lt__entity_type_name_plural,
				lt.entity_type_schema AS lt__entity_type_schema,
				ltsq.entity_identifier_types AS lt__entity_identifier_types,
				COUNT(*) OVER() AS total`;
    let sqlFrom = `FROM ${schemaName}.library l
			INNER JOIN (${libraryTypeSubquery}) ltsq
				ON l.library_type_id = ltsq.library_type_id
			INNER JOIN ${schemaName}.library_type lt
				ON l.library_type_id = lt.library_type_id`;
    const where = ['l.deleted_date_time IS NULL'];
    const values = [];

    if (params.libraryId && params.libraryId.length) {
      values.push(params.libraryId);

      if (Array.isArray(params.libraryId)) {
        where.push(`l.library_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('l.library_id = $' + values.length);
      }
    }

    if (params.libraryType && params.libraryType.length) {
      values.push(params.libraryType);

      if (Array.isArray(params.libraryType)) {
        where.push(`l.library_type_id = ANY(\$${values.length}::text[])`);
      } else {
        where.push('l.library_type_id = $' + values.length);
      }
    }

    if (params.ownerOrgId) {
      if (_.get(params, 'includeOwnedOnly')) {
        values.push(params.organizationId);
        where.push('l.owner_org_id = $' + values.length);
      } else {
        values.push(params.ownerOrgId);

        if (Array.isArray(params.ownerOrgId)) {
          where.push(`l.owner_org_id = ANY(\$${values.length}::int[])`);
        } else {
          where.push('l.owner_org_id = $' + values.length);
        }
      }
    }

    if (params.name) {
      values.push('%' + params.name + '%');
      where.push(`l.name ILIKE lower(\$${values.length})`);
    }

    const allowedOrderByFields = {
      'created_date_time': 'l.created_date_time',
      'name': 'l.name'
    };
    let orderBy = 'l.name ASC';
    const isLastTrained = params.orderBy === 'last_trained_date_time';

    if (isLastTrained) {
      orderBy = `(
				SELECT MAX(lem.created_date_time)
				FROM ${schemaName}.library_engine_model lem
				WHERE lem.library_id = l.library_id
					AND lem.deleted_date_time IS NULL
					AND lem.train_status = 'complete'
			) ${params.orderDesc ? 'DESC' : 'ASC'} NULLS LAST`;
    } else if (params.orderBy && allowedOrderByFields[params.orderBy]) {
      orderBy = `${allowedOrderByFields[params.orderBy]} ${params.orderDesc ? 'DESC' : 'ASC'}`;
    }

    // params.orgId: match library.owner_org_id OR library_collaborator.collaborator_org_id
    // includes.collaborator: return associated record from library_collaborator having the provided collaborator_org_id
    if (params.orgId || includes.collaborator) {
      const statusOffset = values.push(
        model.LibraryCollaborator.statusEnum.active
      );
      const orgIdOffset = values.push(params.orgId || includes.collaborator);

      if (includes.collaborator) {
        sqlSelect += `,
					lc.collaborator_org_id AS lc__collaborator_org_id,
					lc.status AS lc__status,
					lc.permissions AS lc__permissions`;
      }

      sqlFrom += `
			LEFT JOIN ${schemaName}.library_collaborator lc
				ON lc.library_id = l.library_id
					AND lc.deleted_date_time IS NULL
					AND lc.status = \$${statusOffset}
					AND lc.collaborator_org_id = \$${orgIdOffset}
			`;

      if (params.orgId) {
        where.push(
          `(l.owner_org_id = \$${orgIdOffset} OR lc.collaborator_org_id = \$${orgIdOffset})`
        );
      }
    }

    const sql = `${sqlSelect}
			${sqlFrom}
			WHERE ${where.join('\nAND ')}
			ORDER BY ${orderBy}
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal.query(conn.read, sql, values).then(function resolve(result) {
      let libraries = [];
      let totalResults = 0;

      if (result && result.length) {
        libraries = result.map(hydrateLibrary);
        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(
        libraries,
        params.offset,
        totalResults
      );
    });
  }

  /**
   * Create a library
   * @param {model.Library} library - the library model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the inserted library or rejects with
   * 						an error message
   */
  function createLibrary(library, dbClient) {
    if (!(library instanceof model.Library)) {
      return Promise.reject(
        new Error('expected library to be an instance of model.Library')
      );
    }

    const sql = `INSERT INTO ${schemaName}.library
				(library_id, name, version, owner_org_id, library_type_id, cover_image_url, description, created_date_time, modified_date_time)
				VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8)
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      library.libraryId,
      library.name,
      library.ownerOrgId,
      library.libraryTypeId,
      library.coverImageUrl ? library.coverImageUrl.toString() : null,
      library.description,
      currEpochTime,
      currEpochTime
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.Library.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Update a library
   * @param {model.Library} library - the library model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated library or rejects with
   * 						an error message
   */
  function updateLibrary(library, dbClient) {
    if (!(library instanceof model.Library)) {
      return Promise.reject(
        new Error('expected library to be an instance of model.Library')
      );
    }

    if (!library.libraryId) {
      return Promise.reject(new Error('library.libraryId is required'));
    }

    const sql = `UPDATE ${schemaName}.library
				SET name = $1,
					library_type_id = $2,
					cover_image_url = $3,
					description = $4,
					modified_date_time = $5
				WHERE library_id = $6
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      library.name,
      library.libraryTypeId,
      library.coverImageUrl ? library.coverImageUrl.toString() : null,
      library.description,
      currEpochTime,
      library.libraryId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          searchIndex.emit('updateLibrary', library);
          return model.Library.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes a library
   * @param {model.Library} library - the library model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibrary(library, dbClient) {
    if (!(library instanceof model.Library)) {
      return Promise.reject(
        new Error('expected library to be an instance of model.Library')
      );
    }

    if (!library.libraryId) {
      return Promise.reject(new Error('library.libraryId is required'));
    }

    const values = [parseInt(new Date() / 1000, 10), library.libraryId];

    let sql = `UPDATE ${schemaName}.library
				SET deleted_date_time = $1
				WHERE library_id = $2`;

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        return result ? result.length : 0;
      });
  }

  /**
   * Increments a library version number
   * @param {model.Library} library - the library model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated library or rejects with
   * 						an error message
   */
  function incrementVersion(library, dbClient) {
    if (!(library instanceof model.Library)) {
      return Promise.reject(
        new Error('expected library to be an instance of model.Library')
      );
    }

    if (!library.libraryId) {
      return Promise.reject(new Error('library.libraryId is required'));
    }

    const sql = `UPDATE ${schemaName}.library
				SET version = version + 1,
					modified_date_time = $1
				WHERE library_id = $2
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [currEpochTime, library.libraryId];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.Library.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Hydrates a library instance with its embedded models
   * @param {Object} row - a single row from a pg query result
   * @return {model.Library} a hydrated library model
   * @private
   */
  function hydrateLibrary(row) {
    const library = model.Library.fromDB(_.omit(row, ['library_type_id']));

    if (row.lt__library_type_id) {
      library.libraryType = model.LibraryType.fromDB(
        _.mapKeys(row, function mapLibraryType(value, key) {
          const matches = key.match(/^lt__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }

    if (row.lc__collaborator_org_id) {
      library.collaborator = model.LibraryCollaborator.fromDB(
        _.mapKeys(row, function mapLibraryCollaborator(value, key) {
          const matches = key.match(/^lc__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }

    return library;
  }
};
