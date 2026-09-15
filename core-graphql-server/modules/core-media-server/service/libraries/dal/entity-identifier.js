'use strict';

const _ = require('lodash');
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
    getEntityIdentifiers,
    createEntityIdentifier,
    updateEntityIdentifier,
    deleteEntityIdentifiers,
    getIdentifierCountsByType
  });

  return dal;

  /**
   * Get all entity identifiers a user has access to
   * @return {Promise} a promise that resolves with an array of entity identifiers or rejects with
   * 					 an error message
   */
  function getEntityIdentifiers(params = {}) {
    paging.enforceParams(params);

    let sql = `SELECT
				ei.entity_identifier_id,
				ei.priority,
				ei.data_url,
				ei.metadata,
				ei.created_date_time,
				ei.modified_date_time,
				e.entity_id AS e__entity_id,
				e.library_id AS e__library_id,
				e.name AS e__name,
				e.profile_image_url AS e__profile_image_url,
				e.metadata AS e__metadata,
				e.is_published AS e__is_published,
				e.created_date_time AS e__created_date_time,
				e.modified_date_time AS e__modified_date_time,
				eit.entity_identifier_type_id AS eit__entity_identifier_type_id,
				eit.label AS eit__label,
				eit.label_plural AS eit__label_plural,
				eit.icon_class AS eit__icon_class,
				eit.data_type AS eit__data_type,
				eit.description AS eit__description,
				COUNT(*) OVER() AS total
			FROM ${schemaName}.entity_identifier ei
			INNER JOIN ${schemaName}.entity e
				ON e.entity_id = ei.entity_id
			INNER JOIN ${schemaName}.entity_identifier_type eit
				ON eit.entity_identifier_type_id = ei.entity_identifier_type_id`;

    const values = [];
    const where = ['ei.deleted_date_time IS NULL'];

    if (params.entityIdentifierId && params.entityIdentifierId.length) {
      values.push(params.entityIdentifierId);

      if (Array.isArray(params.entityIdentifierId)) {
        where.push(`ei.entity_identifier_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('ei.entity_identifier_id = $' + values.length);
      }
    }

    if (params.entityId && params.entityId.length) {
      values.push(params.entityId);

      if (Array.isArray(params.entityId)) {
        where.push(`ei.entity_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('ei.entity_id = $' + values.length);
      }
    }

    if (params.libraryId && params.libraryId.length) {
      values.push(params.libraryId);

      if (Array.isArray(params.libraryId)) {
        where.push(`e.library_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('e.library_id = $' + values.length);
      }
    }

    if (params.identifierType && params.identifierType.length) {
      values.push(params.identifierType);

      if (Array.isArray(params.identifierType)) {
        where.push(
          `ei.entity_identifier_type_id = ANY(\$${values.length}::text[])`
        );
      } else {
        where.push('ei.entity_identifier_type_id = $' + values.length);
      }
    }

    if (params.dataType && params.dataType.length) {
      values.push(params.dataType);

      if (Array.isArray(params.dataType)) {
        where.push(`eit.data_type = ANY(\$${values.length}::text[])`);
      } else {
        where.push('eit.data_type = $' + values.length);
      }
    }

    if (where.length) {
      sql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    // always sort by most recent for now
    sql += `
			ORDER BY priority DESC, ei.created_date_time DESC
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    return dal.query(conn.read, sql, values).then(function resolve(result) {
      let entityIdentifiers = [];
      let totalResults = 0;

      if (result && result.length) {
        entityIdentifiers = result.map(function mapToModel(row) {
          const ei = model.EntityIdentifier.fromDB(row);

          ei.entityIdentifierType = model.EntityIdentifierType.fromDB(
            _.mapKeys(row, function mapType(value, key) {
              const matches = key.match(/^eit__(.*)$/);
              return matches ? matches[1] : null;
            })
          );

          ei.entity = model.Entity.fromDB(
            _.mapKeys(row, function mapEntity(value, key) {
              const matches = key.match(/^e__(.*)$/);
              return matches ? matches[1] : null;
            })
          );

          return ei;
        });

        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(
        entityIdentifiers,
        params.offset,
        totalResults
      );
    });
  }

  /**
   * Create an entity identifier
   * @param {model.EntityIdentifier} entityIdentifier - the entity identifier model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the inserted resource or rejects with
   * 						an error message
   */
  function createEntityIdentifier(entityIdentifier, dbClient) {
    if (!(entityIdentifier instanceof model.EntityIdentifier)) {
      return Promise.reject(
        new Error(
          'expected entityIdentifier to be an instance of model.EntityIdentifier'
        )
      );
    }

    const sql = `INSERT INTO ${schemaName}.entity_identifier
				(entity_identifier_id, entity_id, entity_identifier_type_id, priority, data_url, metadata, created_date_time, modified_date_time)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				RETURNING *`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      entityIdentifier.entityIdentifierId,
      entityIdentifier.entityId,
      entityIdentifier.entityIdentifierTypeId,
      entityIdentifier.priority || false,
      entityIdentifier.dataUrl ? entityIdentifier.dataUrl.toString() : null,
      JSON.stringify(entityIdentifier.metadata),
      currEpochTime,
      currEpochTime
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.EntityIdentifier.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Update an entity identifier
   * @param {model.EntityIdentifier} entityIdentifier - the entity identifier model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateEntityIdentifier(entityIdentifier, dbClient) {
    if (!(entityIdentifier instanceof model.EntityIdentifier)) {
      return Promise.reject(
        new Error(
          'expected entityIdentifier to be an instance of model.EntityIdentifier'
        )
      );
    }

    if (!entityIdentifier.entityIdentifierId) {
      return Promise.reject(
        new Error('entityIdentifier.entityIdentifierId is required')
      );
    }

    const sql = `UPDATE ${schemaName}.entity_identifier
				SET
					entity_id = $1,
					entity_identifier_type_id = $2,
					priority = $3,
					data_url = $4,
					metadata = $5,
					modified_date_time = $6
				WHERE entity_identifier_id = $7
				RETURNING *`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      entityIdentifier.entityId,
      entityIdentifier.entityIdentifierTypeId,
      entityIdentifier.priority || false,
      entityIdentifier.dataUrl ? entityIdentifier.dataUrl.toString() : null,
      JSON.stringify(entityIdentifier.metadata),
      currEpochTime,
      entityIdentifier.entityIdentifierId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          return model.EntityIdentifier.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes entity identifiers with fields matching the given params
   * @param {Object} params - an object containing the match criteria
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteEntityIdentifiers(params, dbClient) {
    if (typeof params != 'object') {
      return Promise.reject(new Error('expected params to be an object'));
    }

    let match = _.pick(params, [
      'entityIdentifierId',
      'entityId',
      'entityIdentifierTypeId',
      'libraryId'
    ]);

    let sql = `UPDATE ${schemaName}.entity_identifier
			SET deleted_date_time = $1`;

    const where = ['deleted_date_time IS NULL'];
    const values = [parseInt(new Date() / 1000, 10)];

    if (match.entityIdentifierId) {
      values.push(match.entityIdentifierId);
      where.push('entity_identifier_id = $2');
    } else if (match.entityId) {
      values.push(match.entityId);
      where.push('entity_id = $2');

      if (match.entityIdentifierTypeId) {
        values.push(match.entityIdentifierTypeId);
        where.push('entity_identifier_type_id = $3');
      }
    } else if (match.libraryId) {
      values.push(match.libraryId);
      where.push(`entity_id IN (
				SELECT entity_id
				FROM ${schemaName}.entity
				WHERE library_id = $2 AND deleted_date_time IS NULL
			)`);
    } else {
      return Promise.reject(
        new Error(
          'at least one of the following is required: entityIdentifierId, entityId, libraryId'
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
   * Get identifier counts by entity and type
   * @param {Object} params - an object containing the match criteria
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function getIdentifierCountsByType(params = {}) {
    paging.enforceParams(params);

    let subquerySql = `SELECT entity_id, COUNT(*) OVER() AS total
			FROM ${schemaName}.entity`;

    const values = [];
    const where = ['deleted_date_time IS NULL'];

    if (params.entityId && params.entityId.length) {
      values.push(params.entityId);

      if (Array.isArray(params.entityId)) {
        where.push(`entity_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('entity_id = $' + values.length);
      }
    }

    if (where.length) {
      subquerySql +=
        `
				WHERE ` + where.join('\nAND ');
    }

    values.push(params.limit);
    values.push(params.offset);

    subquerySql += `
			LIMIT \$${values.length - 1}
			OFFSET \$${values.length}`;

    let mainSql = `
			SELECT
				ei.entity_id,
				ei.entity_identifier_type_id,
				COUNT(ei.entity_identifier_id) AS identifier_count,
				max(sq.total) AS total
			FROM ${schemaName}.entity_identifier ei
			INNER JOIN (${subquerySql}) sq
				ON ei.entity_id = sq.entity_id
			WHERE ei.deleted_date_time IS NULL
			GROUP BY ei.entity_id, ei.entity_identifier_type_id`;

    return dal.query(conn.read, mainSql, values).then(function resolve(result) {
      const entitySummaryMap = new Map();
      let totalResults = 0;

      if (result && result.length) {
        result.forEach(function eachRow(row) {
          const entityId = row.entity_id;
          const entityIdentifierTypeId = row.entity_identifier_type_id;
          const identifierCount = +row.identifier_count;
          let entitySummary = entitySummaryMap.get(entityId);

          if (!entitySummary) {
            entitySummary = new model.EntitySummary({
              entityId: row.entity_id,
              identifierCountsByType: {}
            });

            entitySummaryMap.set(entityId, entitySummary);
          }

          entitySummary.identifierCountsByType[
            entityIdentifierTypeId
          ] = identifierCount;
        });

        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(
        Array.from(entitySummaryMap.values()),
        params.offset,
        totalResults
      );
    });
  }
};
