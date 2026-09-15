'use strict';

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
    getEntityIdentifierTypes,
    createEntityIdentifierType,
    updateEntityIdentifierType,
    deleteEntityIdentifierType
  });

  return dal;

  /**
   * Get all entityIdentifier types
   * @return {Promise} a promise that resolves with an array of EntityIdentifierTypes or rejects with
   * 					 an error message
   */
  function getEntityIdentifierTypes(params = {}) {
    paging.enforceParams(params);

    const where = [];
    const values = [];

    let sql = `SELECT *, COUNT(*) OVER() AS total
			FROM ${schemaName}.entity_identifier_type`;

    if (params.entityIdentifierTypeId && params.entityIdentifierTypeId.length) {
      values.push(params.entityIdentifierTypeId);

      Array.isArray(params.entityIdentifierTypeId)
        ? where.push(`entity_identifier_type_id = ANY($1::text[])`)
        : where.push('entity_identifier_type_id = $1');
    }

    if (params.dataType && params.dataType.length) {
      values.push(params.dataType);

      Array.isArray(params.dataType)
        ? where.push(`data_type = ANY($1::text[])`)
        : where.push('data_type = $1');
    }

    if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    sql += `
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal.query(conn.read, sql, values).then(function resolve(result) {
      const entityIdentifierTypes = result.map(
        model.EntityIdentifierType.fromDB
      );
      let totalResults = 0;

      if (result.length) {
        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(
        entityIdentifierTypes,
        params.offset,
        totalResults
      );
    });
  }

  /**
   * Creates an entity identifier type
   * @param {model.EntityIdentifierType} entityIdentifierType - object representing the entityIdentifier type
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the inserted entityIdentifier type or rejects with
   * 						an error message
   */
  function createEntityIdentifierType(entityIdentifierType, dbClient) {
    if (!(entityIdentifierType instanceof model.EntityIdentifierType)) {
      return Promise.reject(
        new Error(
          'expected entityIdentifierType to be an instance of model.EntityIdentifierType'
        )
      );
    }

    const sql = `INSERT INTO ${schemaName}.entity_identifier_type
				(entity_identifier_type_id, label, label_plural, icon_class, data_type, description)
				VALUES ($1, $2, $3, $4, $5, $6)
				RETURNING *;`;

    const values = [
      entityIdentifierType.entityIdentifierTypeId,
      entityIdentifierType.label,
      entityIdentifierType.labelPlural,
      entityIdentifierType.iconClass,
      entityIdentifierType.dataType,
      entityIdentifierType.description
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          return model.EntityIdentifierType.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          err.message = 'This identifier type already exists';
        }

        throw err;
      }
    );
  }

  /**
   * Update an entity identifier type
   * @param {model.EntityIdentifierType} entityIdentifier - object representing the entityIdentifier type
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated entityIdentifier type or rejects with
   * 						an error message
   */
  function updateEntityIdentifierType(entityIdentifierType, dbClient) {
    if (!(entityIdentifierType instanceof model.EntityIdentifierType)) {
      return Promise.reject(
        new Error(
          'expected entityIdentifierType to be an instance of model.EntityIdentifierType'
        )
      );
    }

    if (!entityIdentifierType.entityIdentifierTypeId) {
      return Promise.reject(
        new Error('entityIdentifierType.entityIdentifierTypeId is required')
      );
    }

    const sql = `UPDATE ${schemaName}.entity_identifier_type
				SET
					label = $1,
					label_plural = $2,
					icon_class = $3,
					data_type = $4,
					description = $5
				WHERE entity_identifier_type_id = $6
				RETURNING *;`;

    const values = [
      entityIdentifierType.label,
      entityIdentifierType.labelPlural,
      entityIdentifierType.iconClass,
      entityIdentifierType.dataType,
      entityIdentifierType.description,
      entityIdentifierType.entityIdentifierTypeId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.EntityIdentifierType.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes an entity identifier type
   * @param {model.EntityIdentifierType} entityIdentifierType - the entity identifier type model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteEntityIdentifierType(entityIdentifierType, dbClient) {
    if (!(entityIdentifierType instanceof model.EntityIdentifierType)) {
      return Promise.reject(
        new Error(
          'expected entityIdentifierType to be an instance of model.EntityIdentifierType'
        )
      );
    }

    if (!entityIdentifierType.entityIdentifierTypeId) {
      return Promise.reject(
        new Error('entityIdentifierType.entityIdentifierTypeId is required')
      );
    }

    const sql = `DELETE FROM ${schemaName}.entity_identifier_type
				WHERE entity_identifier_type_id = $1`;

    const values = [entityIdentifierType.entityIdentifierTypeId];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        return result ? result.length : 0;
      });
  }
};
