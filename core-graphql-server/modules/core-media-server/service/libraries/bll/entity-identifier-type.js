'use strict';

const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const model = require('../model');

module.exports = function init(dal) {
  if (!dal || !dal.entityIdentifierType) {
    throw new Error('dal.entityIdentifierType is required');
  }

  return {
    getEntityIdentifierTypes,
    getEntityIdentifierType,
    createEntityIdentifierType,
    updateEntityIdentifierType
  };

  /**
   * Fetches a list of identifier types
   * @param {Object} [params={}] - optional query params
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getEntityIdentifierTypes(params = {}) {
    return dal.entityIdentifierType.getEntityIdentifierTypes(params);
  }

  /**
   * Fetches an identifier type
   * @param {String} entityIdentifierTypeId - id of the identifier type to fetch
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getEntityIdentifierType(entityIdentifierTypeId) {
    if (!entityIdentifierTypeId) {
      return Promise.reject(new Error('entityIdentifierTypeId is required'));
    }

    return getEntityIdentifierTypes({ entityIdentifierTypeId }).then(
      function resolve(result) {
        return (result.results && result.results[0]) || null;
      }
    );
  }

  /**
   * Updates an identifier type
   * @param {Object} entityIdentifierType - an object containing the identifier type fields to update
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateEntityIdentifierType(entityIdentifierType) {
    entityIdentifierType = new model.EntityIdentifierType(entityIdentifierType);

    // validate fields
    const validationErrs = entityIdentifierType.validate();

    if (validationErrs) {
      throw new BadRequestError('Validation failed', validationErrs);
    }

    return dal.entityIdentifierType.updateEntityIdentifierType(
      entityIdentifierType
    );
  }

  /**
   * Creates a new identifier type
   * @param {Object} entityIdentifierType - an object containing the identifier type data
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createEntityIdentifierType(entityIdentifierType) {
    entityIdentifierType = new model.EntityIdentifierType(entityIdentifierType);

    // validate fields
    const validationErrs = entityIdentifierType.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    return dal.entityIdentifierType.createEntityIdentifierType(
      entityIdentifierType
    );
  }
};
