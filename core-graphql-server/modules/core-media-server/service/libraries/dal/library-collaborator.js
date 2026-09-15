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
    getLibraryCollaborators,
    createLibraryCollaborator,
    updateLibraryCollaborator,
    deleteLibraryCollaborators
  });

  return dal;

  /**
   * Get all library collaborators
   * @param {Object} [params={}] an object containing query parameters
   * @return {Promise} a promise that resolves with an array of LibraryCollaborators or rejects with
   * 					 an error message
   */
  function getLibraryCollaborators(params = {}) {
    paging.enforceParams(params);

    let sql = `SELECT
				lc.*,
				l.library_id as l__library_id,
				l.version as l__version,
				l.name as l__name,
				l.description as l__description,
				l.cover_image_url as l__cover_image_url,
				l.owner_org_id as l__owner_org_id,
				l.created_date_time as l__created_date_time,
				l.modified_date_time as l__modified_date_time,
				lt.library_type_id as lt__library_type_id,
				lt.label as lt__label,
				lt.entity_type_name AS lt__entity_type_name,
				lt.entity_type_name_plural AS lt__entity_type_name_plural,
				lt.entity_type_schema AS lt__entity_type_schema,
				ltsq.entity_identifier_types AS lt__entity_identifier_types,
				COUNT(*) OVER() AS total
			FROM ${schemaName}.library_collaborator lc
			INNER JOIN ${schemaName}.library l
				ON lc.library_id = l.library_id
			INNER JOIN ${schemaName}.library_type lt
				ON l.library_type_id = lt.library_type_id
			INNER JOIN (${libraryTypeSubquery}) ltsq
				ON l.library_type_id = ltsq.library_type_id`;

    const values = [];
    const where = ['lc.deleted_date_time IS NULL'];

    if (params.libraryId && params.libraryId.length) {
      values.push(params.libraryId);

      Array.isArray(params.libraryId)
        ? where.push(`lc.library_id = ANY(\$${values.length}::uuid[])`)
        : where.push('lc.library_id = $' + values.length);
    }

    if (params.ownerOrgId) {
      values.push(params.ownerOrgId);

      Array.isArray(params.ownerOrgId)
        ? where.push(`l.owner_org_id = ANY(\$${values.length}::int[])`)
        : where.push('l.owner_org_id = $' + values.length);
    }

    if (params.collaboratorOrgId) {
      values.push(params.collaboratorOrgId);

      Array.isArray(params.collaboratorOrgId)
        ? where.push(`lc.collaborator_org_id = ANY(\$${values.length}::int[])`)
        : where.push('lc.collaborator_org_id = $' + values.length);
    }

    if (params.permissionType && params.permissionType.length) {
      values.push(JSON.stringify(_.castArray(params.permissionType)));
      where.push(`lc.permissions <@ \$${values.length}`);
    }

    if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    sql += `
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal
      .query(conn.read, sql, values)
      .then(function resolveQuery(result) {
        let libraryCollaborators = [];
        let totalResults = 0;

        if (result && result.length) {
          totalResults = +result[0].total || 0;
          libraryCollaborators = result.map(hydrateLibraryCollaborator);
        }

        return paging.toPaginationEnvelope(
          libraryCollaborators,
          params.offset,
          totalResults
        );
      });
  }

  /**
   * Create a library collaborator
   * @param {model.LibraryCollaborator} libraryCollaborator - object representing the library collaborator
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibraryCollaborator(libraryCollaborator, dbClient) {
    if (!(libraryCollaborator instanceof model.LibraryCollaborator)) {
      return Promise.reject(
        new Error(
          'expected libraryCollaborator to be an instance of model.LibraryCollaborator'
        )
      );
    }

    const sql = `INSERT INTO ${schemaName}.library_collaborator
				(library_id, collaborator_org_id, permissions, status, created_date_time, modified_date_time)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      libraryCollaborator.libraryId,
      libraryCollaborator.collaboratorOrgId,
      JSON.stringify(libraryCollaborator.permissions),
      libraryCollaborator.status,
      currEpochTime,
      currEpochTime
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          return model.LibraryCollaborator.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          err.message = 'This library collaborator resource already exists';
        }

        throw err;
      }
    );
  }

  /**
   * Updates a library collaborator resource
   * @param {model.LibraryCollaborator} libraryCollaborator - object representing the library collaborator
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibraryCollaborator(libraryCollaborator, dbClient) {
    if (!(libraryCollaborator instanceof model.LibraryCollaborator)) {
      return Promise.reject(
        new Error(
          'expected libraryCollaborator to be an instance of model.LibraryCollaborator'
        )
      );
    }

    if (!libraryCollaborator.libraryId) {
      return Promise.reject(
        new Error('libraryCollaborator.libraryId is required')
      );
    }

    if (!libraryCollaborator.collaboratorOrgId) {
      return Promise.reject(
        new Error('libraryCollaborator.collaboratorOrgId is required')
      );
    }

    const sql = `UPDATE ${schemaName}.library_collaborator
				SET
					permissions = $1,
					status = $2,
					modified_date_time = $3
				WHERE library_id = $4
					AND collaborator_org_id = $5
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      JSON.stringify(libraryCollaborator.permissions),
      libraryCollaborator.status,
      currEpochTime,
      libraryCollaborator.libraryId,
      libraryCollaborator.collaboratorOrgId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.LibraryCollaborator.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes a library collaborator
   * @param {model.LibraryCollaborator} libraryCollaborator - the libraryCollaborator model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibraryCollaborators(libraryCollaborator, dbClient) {
    if (!(libraryCollaborator instanceof model.LibraryCollaborator)) {
      return Promise.reject(
        new Error(
          'expected libraryCollaborator to be an instance of model.LibraryCollaborator'
        )
      );
    }

    const where = [];
    const values = [parseInt(new Date() / 1000, 10)];

    let sql = `UPDATE ${schemaName}.library_collaborator
			SET deleted_date_time = $1`;

    if (libraryCollaborator.collaboratorOrgId) {
      values.push(libraryCollaborator.collaboratorOrgId);
      where.push('collaborator_org_id = $2');
    }

    if (libraryCollaborator.libraryId) {
      values.push(libraryCollaborator.libraryId);
      where.push('library_id = $' + values.length);
    }

    if (!where.length) {
      return Promise.reject(
        new Error('delete query requires at least one where clause')
      );
    }

    where.push('deleted_date_time IS NULL');

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
   * Hydrates a library collaborator instance with its embedded models
   * @param {Object} row - a single row from a pg query result
   * @return {model.LibraryCollaborator} a hydrated library collaborator model
   * @private
   */
  function hydrateLibraryCollaborator(row) {
    const libraryCollaborator = model.LibraryCollaborator.fromDB(
      _.omit(row, ['library_id'])
    );

    if (row.l__library_id) {
      libraryCollaborator.library = model.Library.fromDB(
        _.mapKeys(row, function mapLibrary(value, key) {
          const matches = key.match(/^l__(.*)$/);
          return matches ? matches[1] : null;
        })
      );

      libraryCollaborator.library.libraryType = model.LibraryType.fromDB(
        _.mapKeys(row, function mapLibraryType(value, key) {
          const matches = key.match(/^lt__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }

    return libraryCollaborator;
  }
};
