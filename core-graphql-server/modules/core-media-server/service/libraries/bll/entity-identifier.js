'use strict';

const path = require('path');
const mime = require('mime-types');
const url = require('url');
const moment = require('moment');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const ResourceNotFoundError = require('@veritone/core-server-base/errors/resourceNotFoundError');
const { EntityIdentifier, LibraryType } = require('../model');

module.exports = function init(dal, identifierTypeBll, uploader, eventEmitter) {
  if (!dal || !dal.entityIdentifier) {
    throw new Error('dal.entityIdentifier is required');
  }

  if (!identifierTypeBll) {
    throw new Error('identifierTypeBll is required');
  }

  if (!uploader) {
    throw new Error('uploader is required');
  }

  return {
    getEntityIdentifiers,
    getEntityIdentifier,
    createEntityIdentifier,
    updateEntityIdentifier,
    deleteEntityIdentifiers,
    verifyIdentifierType
  };

  /**
   * Fetches a collection of entity identifiers
   * @param {Object} [params={}] - optional query params
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getEntityIdentifiers(params = {}) {
    return dal.entityIdentifier.getEntityIdentifiers(params);
  }

  /**
   * Fetches an entity identifier
   * @param {String} entityIdentifierId - id of the entity identifier to fetch
   * @param {Object} [additionalParams={}] - an object containing additional query params
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getEntityIdentifier(entityIdentifierId, additionalParams = {}) {
    if (!entityIdentifierId) {
      return Promise.reject(new Error('missing entityIdentifierId'));
    }

    const params = Object.assign({}, additionalParams, { entityIdentifierId });

    return getEntityIdentifiers(params).then(function resolve(result) {
      return (result.results && result.results[0]) || null;
    });
  }

  /**
   * Updates an entity identifier
   * @param {Object} entityIdentifier - an object representing the entity identifier to update
   * @param {Object} updateData - an object containing the entity identifier fields to update
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateEntityIdentifier(entityIdentifier, updateData) {
    const curr = EntityIdentifier.normalize(entityIdentifier);
    entityIdentifier = EntityIdentifier.normalize(updateData);

    if (entityIdentifier.entityId !== curr.entityId) {
      throw new BadRequestError('Changing the entityId is not supported');
    }

    if (
      entityIdentifier.entityIdentifierTypeId !== curr.entityIdentifierTypeId
    ) {
      throw new BadRequestError(
        'Changing the entityIdentifierTypeId is not supported'
      );
    }

    entityIdentifier.dataUrl = curr.dataUrl;

    // validate fields
    const validationErrs = entityIdentifier.validate();

    if (validationErrs) {
      throw new BadRequestError('Validation failed', validationErrs);
    }

    return dal.entityIdentifier
      .updateEntityIdentifier(entityIdentifier)
      .then(function resolve(updatedEntityIdentifier) {
        eventEmitter.emit('entity-modified', updatedEntityIdentifier);
        return updatedEntityIdentifier;
      });
  }

  /**
   * Creates a new entity identifier
   * @param {Object} entity - an entity object
   * @param {Object} entityIdentifier - an object containing the entity identifier fields
   * @param {Object} [file] - (optional) an object containing the image file contents and content type
   * @param {Buffer|Uint8Array|String|Stream} [file.content] - the image file contents
   * @param {String} [file.contentType] - the image file content type
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createEntityIdentifier(entity, entityIdentifier, file) {
    const { library, entityId } = entity;
    const { libraryId } = library;
    const isRef = entityIdentifier.storeReference === true;

    if (!entityId) {
      return Promise.reject(new Error('entity.entityId is required'));
    }

    if (!libraryId) {
      return Promise.reject(new Error('entity.library.libraryId is required'));
    }

    if (!library) {
      return Promise.reject(new Error('entity.library is required'));
    }

    entityIdentifier = EntityIdentifier.normalize(entityIdentifier);
    entityIdentifier.generateId();

    let promise;
    if (file) {
      promise = Promise.resolve(file);
    } else if (entityIdentifier.dataUrl instanceof url.Url) {
      if (!isRef) {
        promise = uploader.readFromURL(entityIdentifier.dataUrl.href);
      } else {
        promise = Promise.resolve({
          content: null,
          contentType: entityIdentifier.contentType
        });
      }
    } else {
      const validationErrs = entityIdentifier.validate();
      promise = Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    return promise
      .then(function resolve(file) {
        const { content, contentType } = file;

        if (contentType) {
          entityIdentifier.setContentType(contentType);
        }

        // make sure entity supports the identifier type and content-type, then upload
        return verifyIdentifierType(entityIdentifier, library.libraryType).then(
          function uploadFile() {
            const mimeType = entityIdentifier.getMimeType();
            const extension = mime.extension(mimeType);

            if (!extension) {
              throw new BadRequestError('Unsupported Content-Type');
            }

            // TODO verify file contents match mime-type

            if (isRef) {
              return Promise.resolve(
                new EntityIdentifier(
                  Object.assign({}, entityIdentifier, {
                    dataUrl: entityIdentifier.dataUrl.href
                  })
                )
              );
            }

            const filename =
              entityIdentifier.entityIdentifierId + '.' + extension;
            const now = moment();
            const destPath = `${library.organizationId ||
              library.ownerOrgId}/entity-identifier/${now.year()}/${now.month()}/${now.day()}/${libraryId}/${filename}`;
            const contentType = entityIdentifier.getContentType();

            return uploader
              .uploadContent(content, contentType, destPath)
              .then(function resolveLocation(location) {
                return new EntityIdentifier(
                  Object.assign({}, entityIdentifier, { dataUrl: location })
                );
              });
          }
        );
      })
      .then(function resolveEntityIdentifier(entityIdentifier) {
        // validate fields
        const validationErrs = entityIdentifier.validate();

        if (validationErrs) {
          throw new BadRequestError('Validation failed', validationErrs);
        }

        return dal.entityIdentifier
          .createEntityIdentifier(entityIdentifier)
          .then(function resolveCreate(createdEntityIdentifier) {
            eventEmitter.emit('entity-modified', entity);
            return createdEntityIdentifier;
          });
      });
  }

  /**
   * Deletes an entity identifier
   * @param {Object} matchParams - an object containing the entity identifier fields to match
   * @param {Object} [transaction] - optional DAL transaction
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteEntityIdentifiers(matchParams, transaction) {
    let client = transaction ? transaction.client : null;
    return dal.entityIdentifier
      .deleteEntityIdentifiers(matchParams, client)
      .then(function resolve(rowsDeleted) {
        if (matchParams.entityIdentifierId) {
          eventEmitter.emit('entity-modified', matchParams);
        }

        return rowsDeleted;
      });
  }

  /**
   * Verifies an identifer's type and content-type against a library type's supported identifier types
   * as well as the entity identifier type's data type
   * @param {LibraryType} libraryType - a libraryType instance to verify against
   * @param {EntityIdentifier} entityIdentifier - the entity identifer instance to verify
   * @return {Promise} a promise that resolves if the identifier type and content types are validate
   * 						or rejects with an error if not
   * @private
   */
  function verifyIdentifierType(entityIdentifier, libraryType) {
    const { entityIdentifierTypeId } = entityIdentifier;
    const contentType = entityIdentifier.getContentType();

    if (!entityIdentifierTypeId) {
      return Promise.reject(
        new BadRequestError(
          'entityIdentifier.entityIdentifierTypeId is required'
        )
      );
    }

    if (!contentType) {
      return Promise.reject(
        new BadRequestError('Validation Failed', [
          { metadata: '"content-type" is required' }
        ])
      );
    }

    if (!(libraryType instanceof LibraryType)) {
      return Promise.reject(
        new Error('Expected libraryType to be an instance of LibraryType')
      );
    }

    if (!libraryType.supportsIdentifierType(entityIdentifierTypeId)) {
      return Promise.reject(
        new BadRequestError(
          `Identifer type "${entityIdentifierTypeId}" is not supported by the library type`
        )
      );
    }

    return identifierTypeBll
      .getEntityIdentifierType(entityIdentifierTypeId)
      .then(function resolve(eit) {
        if (!eit) {
          throw new ResourceNotFoundError(
            `The entity identifier type "${entityIdentifierTypeId} does not exist`
          );
        }

        if (!eit.supportsContentType(contentType)) {
          throw new BadRequestError(
            `${eit.label} identifier type requires ${
              eit.dataType
            } content. "${contentType}" given.`
          );
        }
      });
  }
};
