'use strict';

const _ = require('lodash');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
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

  if (!searchIndex) {
    throw new Error('searchIndex is required');
  }

  const { schemaName } = conn;
  const dal = Object.create(require('./common')(conn));
  const libraryTypeSubquery = require('./library-type.subquery')(schemaName);

  Object.assign(dal, {
    getEntities,
    createEntity,
    updateEntity,
    deleteEntities,
    getEntityCountByLibrary,
    setIsPublishedFlag
  });

  return dal;

  /**
   * Fetches a list of entities
   * @param {Object} [params={}]: an object containing query parameters
   * @return {Promise} a promise that resolves with a result object or rejects with an error message
   */
  function getEntities(params = {}) {
    paging.enforceParams(params);

    // Subquery filters rows and fetches total count
    let subquerySql = `SELECT e.*, COUNT(*) OVER() AS total
			FROM ${schemaName}.entity e`;

    const values = [];
    const where = [];

    if (params.isDeleted) {
      where.push('e.deleted_date_time IS NOT NULL');
    } else {
      where.push('e.deleted_date_time IS NULL');
    }

    if (params.identifierType && params.identifierType.length) {
      values.push(params.identifierType);

      subquerySql += `
				INNER JOIN ${schemaName}.entity_identifier ei
					ON e.entity_id = ei.entity_id
					AND ei.deleted_date_time IS NULL`;

      if (Array.isArray(params.identifierType)) {
        where.push(
          `ei.entity_identifier_type_id = ANY(\$${values.length}::text[])`
        );
      } else {
        where.push('ei.entity_identifier_type_id = $' + values.length);
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

    if (params.entityId && params.entityId.length) {
      values.push(params.entityId);

      if (Array.isArray(params.entityId)) {
        where.push(`e.entity_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('e.entity_id = $' + values.length);
      }
    }

    if (params.name) {
      values.push('%' + params.name + '%');
      where.push(`e.name ILIKE lower(\$${values.length})`);
    }

    if (params.hasOwnProperty('isPublished')) {
      values.push(!!params.isPublished);
      where.push('e.is_published = $' + values.length);
    }

    // params.orgId: match library.owner_org_id OR library_collaborator.collaborator_org_id
    if (params.orgId) {
      const statusOffset = values.push(
        model.LibraryCollaborator.statusEnum.active
      );
      const orgIdParams = [];
      if (_.isArray(params.orgId)) {
        params.orgId.forEach(id => {
          const offset = values.push(id);
          orgIdParams.push(`$${offset}`);
        });
      } else {
        orgIdParams.push(`$${values.push(params.orgId)}`);
      }

      subquerySql += `
			INNER JOIN ${schemaName}.library l
				ON l.library_id = e.library_id
			LEFT JOIN ${schemaName}.library_collaborator lc
				ON lc.library_id = l.library_id
					AND lc.deleted_date_time IS NULL
					AND lc.status = \$${statusOffset}
					AND lc.collaborator_org_id IN (${orgIdParams.join(',')})
			`;

      where.push(
        `(l.owner_org_id IN (${orgIdParams.join(
          ','
        )}) OR lc.collaborator_org_id IN (${orgIdParams.join(',')}))`
      );
    }

    const allowedOrderByFields = ['name'];
    let orderBy = 'lower(e.name)';
    if (params.orderBy && allowedOrderByFields.includes(params.orderBy)) {
      orderBy = `${params.orderBy} ${params.orderDesc ? 'DESC' : 'ASC'}`;
    }

    subquerySql +=
      `
			WHERE ` +
      where.join('\nAND ') +
      `
			GROUP BY e.entity_id
			ORDER BY ${orderBy}
			LIMIT \$${values.push(params.limit)}
			OFFSET \$${values.push(params.offset)}`;

    // Main query joins subquery rows to associated tables
    let mainSql = `SELECT
				e.entity_id,
				e.name,
				e.profile_image_url,
				e.description,
				e.metadata,
				e.is_published,
				e.created_date_time,
				e.modified_date_time,
				e.total,
				l.library_id AS l__library_id,
				l.name AS l__name,
				l.owner_org_id AS l__owner_org_id,
				l.version AS l__version,
				l.cover_image_url AS l__cover_image_url,
				l.description AS l__description,
				l.created_date_time AS l__created_date_time,
				l.modified_date_time AS l__modified_date_time,
				lt.library_type_id AS lt__library_type_id,
				lt.label AS lt__label,
				lt.icon_class AS lt__icon_class,
				lt.entity_type_name AS lt__entity_type_name,
				lt.entity_type_name_plural AS lt__entity_type_name_plural,
				lt.entity_type_schema AS lt__entity_type_schema,
				ltsq.entity_identifier_types AS lt__entity_identifier_types
			FROM (${subquerySql}) e
			INNER JOIN ${schemaName}.library l
				ON e.library_id = l.library_id
			INNER JOIN ${schemaName}.library_type lt
				ON l.library_type_id = lt.library_type_id
			INNER JOIN (${libraryTypeSubquery}) ltsq
				ON l.library_type_id = ltsq.library_type_id
			ORDER BY ${orderBy}`;

    return dal.query(conn.read, mainSql, values).then(function resolve(result) {
      let entities = [];
      let totalResults = 0;

      if (result && result.length) {
        result.forEach(function eachRow(row) {
          let entity = entities.find(function findEntity(e) {
            return e.entityId == row.entity_id;
          });

          if (!entity) {
            entity = model.Entity.fromDB(row);
            entities.push(entity);
          }

          hydrateEntity(entity, row);
        });

        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(entities, params.offset, totalResults);
    });
  }

  /**
   * Create an entity
   * @param {model.Entity} entity - the entity model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createEntity(entity, dbClient) {
    if (!(entity instanceof model.Entity)) {
      return Promise.reject(
        new Error('expected entity to be an instance of model.Entity')
      );
    }

    const sql = `INSERT INTO ${schemaName}.entity
				(entity_id, library_id, name, profile_image_url, description, metadata, is_published, created_date_time, modified_date_time)
				VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      entity.entityId,
      entity.libraryId,
      entity.name,
      entity.profileImageUrl ? entity.profileImageUrl.toString() : null,
      entity.description,
      JSON.stringify(entity.metadata),
      currEpochTime,
      currEpochTime
    ];

    return dal.query(dbClient || conn.write, sql, values).then(
      function resolve(result) {
        if (result && result.length) {
          searchIndex.emit('createEntity', entity);
          return model.Entity.fromDB(result[0]);
        }

        return null;
      },
      function reject(err) {
        if (err instanceof ResourceConflictError) {
          let constraint = err.internal && err.internal.constraint;

          if (constraint && constraint.includes('library_id,name')) {
            err.message =
              'An entity of the same name already exists in this library.';
          }
        }

        throw err;
      }
    );
  }

  /**
   * Update an entity
   * @param {model.Entity} entity - the entity model
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateEntity(entity, dbClient) {
    if (!(entity instanceof model.Entity)) {
      return Promise.reject(
        new Error('expected entity to be an instance of model.Entity')
      );
    }

    if (!entity.entityId) {
      return Promise.reject(new Error('entity.entityId is required'));
    }

    const sql = `UPDATE ${schemaName}.entity
				SET
					library_id = $1,
					name = $2,
					profile_image_url = $3,
					description = $4,
					metadata = $5,
					is_published = $6,
					modified_date_time = $7
				WHERE entity_id = $8
				RETURNING *;`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const values = [
      entity.libraryId,
      entity.name,
      entity.profileImageUrl ? entity.profileImageUrl.toString() : null,
      entity.description,
      JSON.stringify(entity.metadata),
      !!entity.isPublished,
      currEpochTime,
      entity.entityId
    ];

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (result && result.length) {
          searchIndex.emit('createEntity', entity);
          return model.Entity.fromDB(result[0]);
        }

        return null;
      });
  }

  /**
   * Deletes entities with fields matching the provided model
   * @param {model.Entity} entity - an entity model containing the match criteria
   * @param {pg.Client} dbClient - a pg.Client that has connection already established. Use case
   * 						is for transactional purposes.
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteEntities(entity, dbClient) {
    if (!(entity instanceof model.Entity)) {
      return Promise.reject(
        new Error('expected entity to be an instance of model.Entity')
      );
    }

    let sql = `UPDATE ${schemaName}.entity
			SET deleted_date_time = $1, is_published = false`;

    const where = ['deleted_date_time IS NULL'];
    const values = [parseInt(new Date() / 1000, 10)];

    if (entity.entityId) {
      values.push(entity.entityId);
      where.push('entity_id = $2');
    } else if (entity.libraryId) {
      values.push(entity.libraryId);
      where.push('library_id = $2');
    } else {
      return Promise.reject(
        new Error(
          'at least one of the following is required for entity: entityId, libraryId'
        )
      );
    }

    sql +=
      `
			WHERE ` + where.join('\nAND ');

    return dal
      .query(dbClient || conn.write, sql, values)
      .then(function resolve(result) {
        if (entity.entityId) {
          searchIndex.emit('deleteEntity', entity.entityId);
        } else {
          searchIndex.emit('deleteLibraryEntities', entity.libraryId);
        }
        return result ? result.length : 0;
      });
  }

  /**
   * Get entity counts by library
   * @param {Object} params - an object containing the match criteria
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function getEntityCountByLibrary(params = {}) {
    paging.enforceParams(params);

    let sql = `
			SELECT
				e.library_id,
				SUM(CASE WHEN e.deleted_date_time IS NULL THEN 1 ELSE 0 END) AS entity_count,
				SUM(CASE WHEN e.is_published THEN 0 ELSE 1 END) AS unpublished_entity_count,
				COUNT(*) OVER() AS total
			FROM ${schemaName}.entity e`;

    const values = [];
    const where = [];

    if (params.libraryId && params.libraryId.length) {
      values.push(params.libraryId);

      if (Array.isArray(params.libraryId)) {
        where.push(`e.library_id = ANY(\$${values.length}::uuid[])`);
      } else {
        where.push('e.library_id = $' + values.length);
      }
    }

    if (params.ownerOrgId) {
      values.push(params.ownerOrgId);
      where.push(`e.library_id IN (
				SELECT library_id
				FROM ${schemaName}.library
				WHERE owner_org_id = \$${values.length} AND deleted_date_time IS NULL
			)`);
    }

    sql +=
      `
			WHERE ` +
      where.join('\nAND ') +
      `
			GROUP BY e.library_id`;

    values.push(params.limit);
    values.push(params.offset);

    sql += `
			LIMIT \$${values.length - 1}
			OFFSET \$${values.length}`;

    return dal.query(conn.read, sql, values).then(function resolve(result) {
      let counts = [];
      let totalResults = 0;

      if (result && result.length) {
        counts = result.map(function mapToModel(row) {
          return model.LibrarySummary.fromDB(
            _.pick(row, [
              'library_id',
              'entity_count',
              'unpublished_entity_count'
            ])
          );
        });

        totalResults = +result[0].total || 0;
      }

      return paging.toPaginationEnvelope(counts, params.offset, totalResults);
    });
  }

  /**
   * Sets the isPublished flag to true for match entities
   * @param {model.Entity} entity - the entity model containing either an entityId or libraryId
   * @param {Boolean} isPublished - the value of the isPublished flag to write
   * @return {Promise} a promise that resolves with the number of rows affected or rejects with
   * 						an error message
   */
  function setIsPublishedFlag(entity, isPublished = true) {
    if (!(entity instanceof model.Entity)) {
      return Promise.reject(
        new Error('expected entity to be an instance of model.Entity')
      );
    }

    const values = [isPublished];
    const where = [];
    let sql = `UPDATE ${schemaName}.entity
			SET is_published = $1`;

    if (entity.entityId) {
      values.push(entity.entityId);
      where.push('entity_id = $2');
    } else if (entity.libraryId) {
      values.push(entity.libraryId);
      where.push('library_id = $2');
    } else {
      return Promise.reject(
        new Error(
          'at least one of the following is required for entity: entityId, libraryId'
        )
      );
    }

    sql +=
      `
			WHERE ` + where.join('\nAND ');

    return dal
      .query(conn.write, sql, values)
      .then(result => (result ? result.length : 0));
  }

  /**
   * Hydrates an entity instance with its embedded models
   * @param {model.Entity} entity - the entity model
   * @param {Object} row - a single row from a pg query result
   * @private
   */
  function hydrateEntity(entity, row) {
    if (row.l__library_id && !entity.library) {
      entity.library = model.Library.fromDB(
        _.mapKeys(row, function mapLibrary(value, key) {
          const matches = key.match(/^l__(.*)$/);
          return matches ? matches[1] : null;
        })
      );

      entity.library.libraryType = model.LibraryType.fromDB(
        _.mapKeys(row, function mapLibraryType(value, key) {
          const matches = key.match(/^lt__(.*)$/);
          return matches ? matches[1] : null;
        })
      );
    }
  }
};
