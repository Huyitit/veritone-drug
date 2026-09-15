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

  Object.assign(dal, {
    getLibraryTypes,
    createLibraryType,
    saveEntityIdentifierLinks,
    updateLibraryType,
    deleteLibraryType,
    deleteEntityIdentifierLinks
  });

  return dal;

  /**
   * Fetches a list of library types
   * @param {Object} [params={}]: an object containing query parameters
   * @return {Promise} a promise that resolves with a result object or rejects with an error message
   */
  function getLibraryTypes(params = {}) {
    paging.enforceParams(params);

    const where = [];
    const values = [];

    const libraryTypeSubquery = require('./library-type.subquery')(schemaName);
    let sql = `SELECT
				lt.library_type_id,
				lt.label,
				lt.icon_class,
				lt.entity_type_name,
				lt.entity_type_name_plural,
				lt.entity_type_schema,
				sq.entity_identifier_types,
				COUNT(*) OVER() AS total
			FROM (${libraryTypeSubquery}) sq
			INNER JOIN ${schemaName}.library_type lt
				ON sq.library_type_id = lt.library_type_id`;

    if (params.libraryType && params.libraryType.length) {
      values.push(params.libraryType);

      Array.isArray(params.libraryType)
        ? where.push(`lt.library_type_id = ANY($1::text[])`)
        : where.push(`lt.library_type_id = $1`);
    }

    if (params.identifierType && params.identifierType.length) {
      let val = JSON.stringify(_.castArray(params.identifierType));
      val = val.replace(/"/g, `'`);
      where.push(`sq.entity_identifier_type_ids ?| array${val}`);
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
        const libraryTypes = result.map(model.LibraryType.fromDB);
        let totalResults = 0;

        if (result && result.length) {
          totalResults = +result[0].total || 0;
        }

        return paging.toPaginationEnvelope(
          libraryTypes,
          params.offset,
          totalResults
        );
      });
  }

  /**
   * Creates a library type
   * @param {model.LibraryType} libraryType - object representing the library type
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibraryType(libraryType, dbClient) {
    if (!(libraryType instanceof model.LibraryType)) {
      return Promise.reject(
        new Error('expected libraryType to be an instance of model.LibraryType')
      );
    }

    const sql = `INSERT INTO ${schemaName}.library_type
				(library_type_id, label, icon_class, entity_type_name, entity_type_name_plural, entity_type_schema)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING *;`;

    const values = [
      libraryType.libraryTypeId,
      libraryType.label,
      libraryType.iconClass,
      libraryType.entityType.name,
      libraryType.entityType.namePlural,
      JSON.stringify(libraryType.entityType.schema || null)
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          return model.LibraryType.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          err.message = 'This library type already exists';
        }

        throw err;
      }
    );
  }

  /**
   * Creates the library type to entity identifier type links specified for the library type
   * @param {model.LibraryType} libraryType - object representing the library type
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function saveEntityIdentifierLinks(libraryType, dbClient) {
    if (!(libraryType instanceof model.LibraryType)) {
      return Promise.reject(
        new Error('expected libraryType to be an instance of model.LibraryType')
      );
    }

    const { libraryTypeId, entityIdentifierTypes } = libraryType;

    if (
      !Array.isArray(entityIdentifierTypes) ||
      !entityIdentifierTypes.length
    ) {
      return Promise.reject(
        new Error('no entityIdentifierTypes specified for libraryType')
      );
    }

    const values = entityIdentifierTypes.reduce(function reduceToValues(
      vals,
      e
    ) {
      vals.push(
        libraryTypeId,
        e.entityIdentifierTypeId,
        e.minItems || null,
        e.maxItems || null
      );
      return vals;
    },
    []);

    const paramRows = [];

    for (let i = 0; i < values.length; i += 4) {
      paramRows.push(`($${i + 1},$${i + 2},$${i + 3},$${i + 4})`);
    }

    const sql = `INSERT INTO ${schemaName}.library_type__entity_identifier_type
				(library_type_id, entity_identifier_type_id, min_items, max_items)
				VALUES ${paramRows.join(',')}
				ON CONFLICT (library_type_id, entity_identifier_type_id)
				DO UPDATE SET
					min_items = EXCLUDED.min_items,
					max_items = EXCLUDED.max_items
				RETURNING *;`;

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        libraryType.entityIdentifierTypes = result.map(
          model.LibraryTypeEntityIdentifierTypeLink.fromDB
        );
        return libraryType;
      });
  }

  /**
   * Update a library type
   * @param {model.LibraryType} libraryType - an instance of the library type
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated library type or rejects with
   * 						an error message
   */
  function updateLibraryType(libraryType, dbClient) {
    if (!(libraryType instanceof model.LibraryType)) {
      return Promise.reject(
        new Error('expected libraryType to be an instance of model.LibraryType')
      );
    }

    if (!libraryType.libraryTypeId) {
      return Promise.reject(new Error('libraryType.libraryTypeId is required'));
    }

    const sql = `UPDATE ${schemaName}.library_type
			SET
				label = $1,
				icon_class = $2,
				entity_type_name = $3,
				entity_type_name_plural = $4,
				entity_type_schema = $5
			WHERE library_type_id = $6
			RETURNING *;`;

    const values = [
      libraryType.label,
      libraryType.iconClass,
      libraryType.entityType.name,
      libraryType.entityType.namePlural,
      JSON.stringify(libraryType.entityType.schema || null),
      libraryType.libraryTypeId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.LibraryType.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes a library type
   * @param {model.LibraryType} libraryType - the library type model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibraryType(libraryType, dbClient) {
    if (!(libraryType instanceof model.LibraryType)) {
      return Promise.reject(
        new Error('expected libraryType to be an instance of model.LibraryType')
      );
    }

    if (!libraryType.libraryTypeId) {
      return Promise.reject(new Error('libraryType.libraryTypeId is required'));
    }

    const sql = `DELETE FROM ${schemaName}.library_type
						WHERE library_type_id = $1`;

    const values = [libraryType.libraryTypeId];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        return result ? result.length : 0;
      });
  }

  function deleteEntityIdentifierLinks(libraryType, dbClient) {
    if (!(libraryType instanceof model.LibraryType)) {
      return Promise.reject(
        new Error('expected libraryType to be an instance of model.LibraryType')
      );
    }

    if (!libraryType.libraryTypeId) {
      return Promise.reject(new Error('libraryType.libraryTypeId is required'));
    }

    const sql = `DELETE FROM ${schemaName}.library_type__entity_identifier_type
						WHERE library_type_id = $1`;

    const values = [libraryType.libraryTypeId];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        return result ? result.length : 0;
      });
  }
};
