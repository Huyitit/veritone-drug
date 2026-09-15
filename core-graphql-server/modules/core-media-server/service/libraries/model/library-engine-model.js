'use strict';

/**
 * @swagger
 * definitions:
 *   LibraryEngineModel:
 *     type: object
 *     properties:
 *       libraryEngineModelId:
 *         type: string
 *       library:
 *         $ref: '#/definitions/Library'
 *       libraryVersion:
 *         type: integer
 *         format: int32
 *       engineId:
 *         type: string
 *       trainJobId:
 *         type: string
 *       trainStatus:
 *         type: string
 *         enum:
 *           - pending
 *           - queued
 *           - complete
 *           - failed
 *       dataUrl:
 *         type: string
 *       metadata:
 *         type: object
 *       createdDateTime:
 *         type: string
 *         format: date-time
 *       modifiedDateTime:
 *         type: string
 *         format: date-time
 *
 *   LibraryEngineModelPayload:
 *     type: object
 *     required:
 *       - libraryId
 *       - engineId
 *       - trainJobId
 *       - trainStatus
 *     properties:
 *       libraryId:
 *         type: string
 *       engineId:
 *         $ref: '#/definitions/LibraryEngineModel/properties/engineId'
 *       trainJobId:
 *         $ref: '#/definitions/LibraryEngineModel/properties/trainJobId'
 *       trainStatus:
 *         $ref: '#/definitions/LibraryEngineModel/properties/trainStatus'
 *       dataUrl:
 *         $ref: '#/definitions/LibraryEngineModel/properties/dataUrl'
 *       metadata:
 *         $ref: '#/definitions/LibraryEngineModel/properties/metadata'
 */

const _ = require('lodash');
const uuid = require('uuid');
const convert = require('./util/convert');
const validate = require('./util/validate');
const contentTypeKey = 'contentType';

const statusEnum = {
  pending: 'pending',
  queued: 'queued',
  complete: 'complete',
  failed: 'failed',
  running: 'running'
};

const LibraryEngineModel = require('@veritone/core-server-base/model/util/create-model')({
  libraryEngineModelId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  libraryId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  libraryVersion: {
    type: 'number'
  },
  engineId: {
    type: 'string',
    required: true
  },
  trainJobId: {
    type: 'string'
  },
  trainStatus: {
    type: 'string',
    validate: validateStatus,
    required: true
  },
  dataUrl: {
    type: 'string',
    convert: toURL,
    validate: validate.validateURL,
    toJSON(value) {
      return convert.toSignedURL(value, LibraryEngineModel.signURL);
    }
  },
  metadata: {
    type: 'json',
    validate: validate.validateOptionalObject,
    convert(val, src, self, key) {
      self[key] = _.isNil(val) ? null : val;
    }
  },
  createdDateTime: {
    type: 'number',
    toJSON: convert.dateTimeToJSON
  },
  modifiedDateTime: {
    type: 'number',
    toJSON: convert.dateTimeToJSON
  }
});

Object.assign(LibraryEngineModel.prototype, {
  generateId() {
    this.libraryEngineModelId = uuid.v4();
    return this.libraryEngineModelId;
  },

  getContentType() {
    return _.has(this.metadata, contentTypeKey)
      ? this.metadata[contentTypeKey]
      : null;
  },

  getMimeType() {
    return convert.extractMimeType(this.getContentType());
  },

  setContentType(contentType) {
    this.metadata = Object.assign(this.metadata || {}, {
      [contentTypeKey]: contentType
    });

    return this;
  }
});

module.exports = Object.assign(LibraryEngineModel, {
  statusEnum,

  /**
   * Normalizes data and constructs an LibraryEngineModel model instance from it
   * @param {Object} data - an object containing the LibraryEngineModel data
   * @return {LibraryEngineModel} a normalized model instance
   */
  normalize(data) {
    const libraryId = data.libraryId || _.get(data, 'library.libraryId');
    const normalizedData = Object.assign(_.omit(data, ['library']), {
      libraryId
    });

    return new LibraryEngineModel(normalizedData);
  }
});

function validateStatus(value, attributes, key) {
  if (value === null || statusEnum[value]) {
    return null;
  }

  return {
    [key]: {
      message:
        'invalid status. possible values are: ' +
        Object.keys(statusEnum).join(', ')
    }
  };
}

function toURL(val, src, self, key) {
  if (!val) {
    self[key] = null;
    return;
  }

  self[key] = convert.toURLObject(val) || null;
}
