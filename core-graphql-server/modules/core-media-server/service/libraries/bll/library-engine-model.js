'use strict';

const util = require('util');
const path = require('path');
const _ = require('lodash');
const mime = require('mime-types');
const moment = require('moment');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');
const { LibraryEngineModel } = require('../model');

module.exports = function init(dal, uploader, serviceContext) {
  const resUtil = require('../../../../../resolvers/util')(serviceContext);

  if (!dal || !dal.libraryEngineModel) {
    throw new Error('dal.libraryEngineModel is required');
  }

  if (!uploader) {
    throw new Error('uploader is required');
  }

  return {
    getLibraryEngineModels,
    getLibraryEngineModel,
    createLibraryEngineModel,
    updateLibraryEngineModel,
    saveLibraryEngineModelDataFile,
    deleteLibraryEngineModels
  };

  /**
   * Fetches a list of library engine models
   * @param {Object} [params={}] - optional query params
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraryEngineModels(params = {}) {
    return dal.libraryEngineModel.getLibraryEngineModels(params);
  }

  /**
   * Fetches a library engine model by its id
   * @param {String} libraryEngineModelId - id of the library engine model to fetch
   * @return {Promise} a promise that resolves with the requested resource or rejects with
   * 						an error message
   */
  function getLibraryEngineModel(libraryEngineModelId, additionalParams = {}) {
    if (!libraryEngineModelId) {
      return Promise.reject(new Error('libraryEngineModelId is required'));
    }

    const params = Object.assign({}, additionalParams, {
      libraryEngineModelId
    });

    return getLibraryEngineModels(params).then(function resolve(result) {
      return (result.results && result.results[0]) || null;
    });
  }

  /**
   * Updates a library engine model
   * @param {Object} libraryEngineModel - an object representing the library engine model to update
   * @param {Object} updateData - an object containing the library engine model fields to update
   * @return {Promise} a promise that resolves with the updated resource or rejects with
   * 						an error message
   */
  function updateLibraryEngineModel(libraryEngineModel, updateData) {
    const currentDataUrl = libraryEngineModel.dataUrl;
    const { dataUrl } = (libraryEngineModel = LibraryEngineModel.normalize(
      updateData
    ));

    // validate fields
    const validationErrs = libraryEngineModel.validate();

    if (validationErrs) {
      throw new BadRequestError('Validation failed', validationErrs);
    }

    // if the dataUrl is not null and has changed, download and save the file contents
    if (dataUrl && currentDataUrl != dataUrl.toString()) {
      if (!resUtil.isOurBucket(dataUrl)) {
        return uploader
          .readFromURL(dataUrl.href)
          .then(
            function resolveURL(file) {
              return saveLibraryEngineModelDataFile(libraryEngineModel, file);
            },
            function rejectURL(err) {
              throw new BadRequestError(null, { dataUrl: err.message });
            }
          )
          .then(dal.libraryEngineModel.updateLibraryEngineModel);
      }

      // if the dataUrl was signed, strip off the signature before updating it in the database
      libraryEngineModel.dataUrl = resUtil.isRealSignedUrl(dataUrl)
        ? resUtil.stripSignatureSignedUrl(dataUrl)
        : dataUrl;
    }

    return dal.libraryEngineModel.updateLibraryEngineModel(libraryEngineModel);
  }

  /**
   * Creates a new library engine model
   * @param {Object} libraryEngineModel - an object containing the library engine model data
   * @return {Promise} a promise that resolves with the created resource or rejects with
   * 						an error message
   */
  function createLibraryEngineModel(libraryEngineModel) {
    libraryEngineModel = LibraryEngineModel.normalize(
      _.defaults(libraryEngineModel, {
        trainStatus: LibraryEngineModel.statusEnum.pending
      })
    );

    libraryEngineModel.generateId();
    const validationErrs = libraryEngineModel.validate();

    if (validationErrs) {
      return Promise.reject(
        new BadRequestError('Validation failed', validationErrs)
      );
    }

    if (libraryEngineModel.dataUrl) {
      const url = libraryEngineModel.dataUrl.href;

      return uploader
        .readFromURL(url)
        .then(
          function resolveURL(file) {
            return saveLibraryEngineModelDataFile(libraryEngineModel, file);
          },
          function rejectURL(err) {
            throw new BadRequestError(null, { dataUrl: err.message });
          }
        )
        .then(dal.libraryEngineModel.createLibraryEngineModel);
    }

    return dal.libraryEngineModel.createLibraryEngineModel(libraryEngineModel);
  }

  /**
   * Uploads file contents and creates a new data file for the provided library engine model
   * @param {Object} libraryEngineModel - an object containing the library engine model data
   * @param {Object} file - an object containing the file contents and content type
   * @param {Buffer|Uint8Array|String|Stream} file.content - the file contents
   * @param {String} file.contentType - the file content type
   * @return {Promise} a promise that resolves with the updated library engine model or rejects with
   * 						an error message
   */
  function saveLibraryEngineModelDataFile(libraryEngineModel, file) {
    const organizationId = libraryEngineModel.organizationId;
    const {
      libraryId,
      libraryEngineModelId,
      engineId
    } = (libraryEngineModel = LibraryEngineModel.normalize(libraryEngineModel));
    const { content } = file;

    if (!libraryEngineModelId) {
      return Promise.reject(
        new Error('libraryEngineModel.libraryEngineModelId is required')
      );
    }

    if (!libraryId) {
      return Promise.reject(
        new Error('libraryEngineModel.libraryId is required')
      );
    }

    if (file.contentType) {
      libraryEngineModel.setContentType(file.contentType);
    }

    const contentType = libraryEngineModel.getContentType();
    const extension = mime.extension(contentType);

    if (!extension) {
      return Promise.reject(
        new BadRequestError('Unsupported Content-Type ' + contentType)
      );
    }

    // TODO verify file contents

    const filename = util.format(
      '%s-%s_%s.%s',
      engineId,
      libraryEngineModelId,
      new Date().getTime(),
      extension
    );
    const now = moment();
    const destPath = `${organizationId}/library-engine-data-model/${now.year()}/${now.month()}/${now.day()}/${libraryId}/${filename}`;

    return uploader
      .uploadContent(content, contentType, destPath)
      .then(function resolveUpload(location) {
        libraryEngineModel.dataUrl = location;
        return libraryEngineModel;
      });
  }

  /**
   * Deletes the library engine models matching the given params
   * @param {Object} matchParams - an object containing the library engine model fields to match
   * @param {Object} [transaction] - optional DAL transaction
   * @return {Promise} a promise that resolves with the number of rows deleted or rejects with
   * 						an error message
   */
  function deleteLibraryEngineModels(matchParams, transaction) {
    const client = transaction ? transaction.client : null;
    matchParams = new LibraryEngineModel(matchParams);
    return dal.libraryEngineModel.deleteLibraryEngineModels(
      matchParams,
      client
    );
  }
};
