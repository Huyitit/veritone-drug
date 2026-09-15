'use strict';

const path = require('path');
const util = require('util');
const _ = require('lodash');
const mime = require('mime-types');
const moment = require('moment');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const { Entity, EntitySummary, EntityType } = require('../model');

module.exports = function init(
  dal,
  entityIdentifierBll,
  uploader,
  eventEmitter,
  logger
) {
  if (!dal || !dal.entity) {
    throw new Error('dal.entity is required');
  }

  if (!dal.entityIdentifier) {
    throw new Error('dal.entityIdentifier is required');
  }

  if (!entityIdentifierBll) {
    throw new Error('entityIdentifierBll is required');
  }

  if (!uploader) {
    throw new Error('uploader is required');
  }

  if (!eventEmitter) {
    throw new Error('eventEmitter is required');
  }

  if (!logger) {
    throw new Error('logger is required');
  }

  eventEmitter.on('entity-modified', onEntityModified);

  return {
    getEntities,
    getEntity,
    createEntity,
    createEntities,
    updateEntity,
    uploadProfileImage,
    deleteEntities
  };

  /**
   * Fetches a list of entities
   * @param {Object} [params={}] - optional params to limit the query with
   * @param {Object} [includes={}] - a map specifying subdocs to include with each result
   * @return {Promise} a promise that resolves with the result or rejects with an error message
   */
  function getEntities(params = {}, includes = {}) {
    return dal.entity
      .getEntities(params)
      .then(function resolveEntities(result) {
        const promises = [];

        // fetch associated entity summary data if enabled
        if (includes.summary) {
          promises.push(appendSummaries(result.results));
        }

        return Promise.all(promises).then(function resolveAll() {
          return result;
        });
      });
  }

  /**
   * Fetches an entity
   * @param {String} entityId - id of the entity to fetch
   * @param {Object} [additionalParams={}] - an object containing additional query params
   * @param {Object} [includes={}] - a map specifying subdocs to include with each result
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getEntity(entityId, additionalParams = {}, includes = {}) {
    if (!entityId) {
      return Promise.reject(new Error('missing entityId'));
    }

    const params = Object.assign({}, additionalParams, { entityId });

    return getEntities(params, includes).then(function resolve(result) {
      return (result.results && result.results[0]) || null;
    });
  }

  /**
   * Updates an entity
   * @param {Object} entity - an object representing the entity to be updated
   * @param {Object} updateData - an object containing the updated entity fields
   * @param {Object} [transaction] - a transaction object
   * @param {Object} [transaction.client] - a pg client object
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateEntity(entity, updateData, transaction) {
    const organizationId = entity.organizationId;
    const entityType = _.get(entity, 'library.libraryType.entityType');

    if (!(entityType instanceof EntityType)) {
      throw new Error('expected entityType to be instance of EntityType.');
    }

    const currentProfileImageUrl = entity.profileImageUrl;
    const { profileImageUrl } = (entity = Entity.normalize(updateData));
    entity.organizationId = organizationId;
    const metadataSchema = entityType.generateCombinedSchema();
    entity.setMetadataSchema(metadataSchema);

    // validate fields
    const validationErrs = entity.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    const client = transaction ? transaction.client : null;

    // TODO if not is our bucket
    if (
      profileImageUrl &&
      currentProfileImageUrl != profileImageUrl.toString()
    ) {
      return uploader
        .readFromURL(profileImageUrl.href)
        .then(
          function resolveURL(file) {
            return uploadProfileImage(entity, file);
          },
          function rejectURL(err) {
            throw new BadRequestError(null, { profileImageUrl: err.message });
          }
        )
        .then(function resolveUpload(entity) {
          return dal.entity.updateEntity(entity, client);
        });
    }

    return dal.entity.updateEntity(entity, client);
  }

  /**
   * Creates a new entity
   * @param {Library} library - the library in which to create the entity
   * @param {Object} entity - an object containing the entity data
   * @param {Object} [transaction] - a transaction object
   * @param {Object} [transaction.client] - a pg client object
   * @return {Promise} a promise that resolves with the inserted resource or rejects with
   * 						an error message
   */
  function createEntity(library, entity, transaction) {
    if (!library) {
      throw new Error('library is required');
    }

    const entityType = _.get(library, 'libraryType.entityType');

    if (!(entityType instanceof EntityType)) {
      throw new Error(
        'expected libraryType.entityType to be instance of EntityType.'
      );
    }

    entity = Entity.normalize(entity);
    entity.libraryId = library.libraryId;
    entity.generateId();
    entity.setMetadataSchema(entityType.generateCombinedSchema());
    entity.organizationId = library.ownerOrgId;

    // validate fields
    const validationErrs = entity.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    let client = transaction ? transaction.client : null;

    // TODO and not isOurBucket
    if (entity.profileImageUrl) {
      const url = entity.profileImageUrl.href;

      return uploader
        .readFromURL(url)
        .then(
          function resolveURL(file) {
            return uploadProfileImage(entity, file);
          },
          function rejectURL(err) {
            throw new BadRequestError(null, { profileImageUrl: err.message });
          }
        )
        .then(function resolveUpload(entity) {
          return dal.entity.createEntity(entity, client);
        });
    }

    return dal.entity.createEntity(entity, client);
  }

  /**
   * Bulk creates an array of entities within a transaction
   * @param {Library} library - the library in which to create the entities
   * @param {Entity[]} entities - an array of Entity model instances to create
   * @param {Object} [transaction] - a transaction object
   * @param {Object} [transaction.client] - a pg client object
   * @return {Promise} a promise that resolves with the inserted library or rejects with
   * 						an error message
   */
  function createEntities(library, entities, transaction) {
    // TODO use single bulk-insert query to create entities
    return entities.reduce(function buildChain(promise, entity) {
      return promise.then(function resolveNext(insertedEntities) {
        return createEntity(library, entity, transaction).then(
          function resolveEntity(entity) {
            insertedEntities.push(entity);
            return insertedEntities;
          }
        );
      });
    }, Promise.resolve([]));
  }

  /**
   * Uploads a new profile image for the entity
   * @param {Object} entity - an object containing the entity data
   * @param {Object} file - an object containing the image file contents and content type
   * @param {Buffer|Uint8Array|String|Stream} file.content - the image file contents
   * @param {String} file.contentType - the image file content type
   * @return {Promise} a promise that resolves with the updated entity or rejects with
   * 						an error message
   */
  function uploadProfileImage(entity, file) {
    const organizationId = entity.organizationId;
    const { libraryId, entityId } = Entity.normalize(entity);
    const { content, contentType } = file;

    if (!entityId) {
      return Promise.reject(new Error('entity.entityId is required'));
    }

    if (!libraryId) {
      return Promise.reject(new Error('entity.libraryId is required'));
    }

    const extension = mime.extension(contentType);

    if (!extension || !contentType.match(/^image\//i)) {
      return Promise.reject(new BadRequestError('Unsupported Content-Type'));
    }

    // TODO verify file contents are actually an image

    const filename = util.format(
      'profile-%s-%s.%s',
      entityId,
      new Date().getTime(),
      extension
    );
    const now = moment();
    const destPath = `${organizationId}/entity/${now.year()}/${now.month()}/${now.day()}/${libraryId}/${filename}`;

    return uploader
      .uploadContent(content, contentType, destPath)
      .then(function resolve(location) {
        entity.profileImageUrl = location;
        return entity;
      });
  }

  /**
   * Deletes the entities matching the given params
   * @param {Object} matchParams - an object containing the entity fields to match
   * @param {Object} [transaction] - optional DAL transaction
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteEntities(matchParams, transaction) {
    if (!matchParams.entityId && !matchParams.libraryId) {
      return Promise.reject(
        new Error(
          'at least one of the following params is required: entityId, libraryId'
        )
      );
    }

    const entityParams = new Entity(matchParams);

    if (transaction) {
      return entityIdentifierBll
        .deleteEntityIdentifiers(matchParams, transaction)
        .then(function deleteEntity() {
          return dal.entity.deleteEntities(entityParams, transaction.client);
        });
    }

    return dal.entity.connectionPools.write.tx(t => {
      return entityIdentifierBll
        .deleteEntityIdentifiers(matchParams, t)
        .then(function deleteEntity() {
          return dal.entity.deleteEntities(entityParams, t);
        });
    });
  }

  /**
   * Generates and appends a entity summary model to each entity model
   * @param {Entity[]} entities - an array of Entity model instances
   * @return {Promise} a promise that resolves on success or rejects with
   * 						an error message
   * @private
   */
  function appendSummaries(entities) {
    if (!Array.isArray(entities)) {
      return Promise.reject(new Error('Expected an array'));
    }

    const promises = [];

    if (entities.length) {
      const entityIds = [];
      entities.forEach(function eachEntity(entity) {
        entityIds.push(entity.entityId);
        entity.summary = new EntitySummary({
          identifierCountsByType: {}
        });
      });

      // get entity count for each entity
      let params = {
        entityId: entityIds,
        limit: entityIds.length
      };

      promises.push(
        dal.entityIdentifier
          .getIdentifierCountsByType(params)
          .then(function appendCounts(result) {
            const summaryMap = _.keyBy(result.results, 'entityId');

            entities.forEach(function eachEntity(entity) {
              if (summaryMap[entity.entityId]) {
                entity.summary.identifierCountsByType =
                  summaryMap[entity.entityId].identifierCountsByType;
              }
            });
          })
      );
    }

    return Promise.all(promises);
  }

  function onEntityModified(params) {
    let promise;

    if (params.entityId) {
      promise = Promise.resolve(new Entity(params));
    } else if (params.entityIdentifierId) {
      promise = entityIdentifierBll
        .getEntityIdentifier(params)
        .then(entityIdentifier => entityIdentifier.entity);
    } else {
      promise = Promise.reject(
        'Invalid argument given on entity-modified event'
      );
    }

    return promise
      .then(function resolve(entity) {
        return dal.entity.setIsPublishedFlag(entity, false);
      })
      .catch(function onFail(err) {
        logger.warn('Failed to reset isPublished flag on entity: ' + err);
      });
  }
};
