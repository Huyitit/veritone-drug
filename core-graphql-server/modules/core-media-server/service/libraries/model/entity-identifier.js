'use strict';

/**
 * @swagger
 * definitions:
 *   EntityIdentifier:
 *     type: object
 *     properties:
 *       entityIdentifierId:
 *         description: Unique id of the entity identifier.
 *         type: string
 *         format: uuid
 *       entity:
 *         $ref: '#/definitions/Entity'
 *         description: The entity that the identifier belongs to.
 *       entityIdentifierType:
 *         $ref: '#/definitions/EntityIdentifierType'
 *         description: The entity identifier's type.
 *       priority:
 *         description: A flag that favorites an entity identifier and prioritizes it in engine training.
 *         type: boolean
 *       dataUrl:
 *         description: The URL of the entity identifier data asset.
 *         type: string
 *       metadata:
 *         type: object
 *         description: Key-value pairs of contextual data to attach to the entity.
 *         required:
 *           - contentType
 *         properties:
 *           contentType:
 *             description: The content type of the file, structured using MIME type format. (e.g., image/jpeg)
 *             type: string
 *         additionalProperties:
 *           type: string
 *       createdDateTime:
 *         description: Timestamp of when the entity was created.
 *         type: string
 *         format: date-time
 *       modifiedDateTime:
 *         description: Timestamp of when the entity was last modified.
 *         type: string
 *         format: date-time
 *   EntityIdentifierPayload:
 *     type: object
 *     required:
 *       - entityIdentifierTypeId
 *       - dataUrl
 *       - metadata
 *     properties:
 *       entityIdentifierTypeId:
 *         $ref: '#/definitions/EntityIdentifierType/properties/entityIdentifierTypeId'
 *       priority:
 *         $ref: '#/definitions/EntityIdentifier/properties/priority'
 *       dataUrl:
 *         $ref: '#/definitions/EntityIdentifier/properties/dataUrl'
 *       metadata:
 *         $ref: '#/definitions/EntityIdentifier/properties/metadata'
 */

const uuid = require('uuid');
const _ = require('lodash');
const convert = require('./util/convert');
const validate = require('./util/validate');
const contentTypeKey = 'contentType';

const EntityIdentifier = require('@veritone/core-server-base/model/util/create-model')({
  entityIdentifierId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  entityId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  entityIdentifierTypeId: {
    type: 'string',
    required: true
  },
  priority: {
    type: 'boolean'
  },
  dataUrl: {
    type: 'string',
    required: true,
    convert: toURL,
    validate: validate.validateURL,
    toJSON(value) {
      return convert.toSignedURL(value, EntityIdentifier.signURL);
    }
  },
  metadata: {
    type: 'json',
    required: true,
    validate: validateMetadata,
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

Object.assign(EntityIdentifier.prototype, {
  generateId() {
    this.entityIdentifierId = uuid.v4();
    return this.entityIdentifierId;
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

module.exports = Object.assign(EntityIdentifier, {
  /**
   * Normalizes data and constructs an EntityIdentifier model instance from it
   * @param {Object} data - an object containing the entity identifier data
   * @return {EntityIdentifier} a normalized model instance
   */
  normalize(data) {
    const entityId = data.entityId || _.get(data, 'entity.entityId');
    const entityIdentifierTypeId =
      data.entityIdentifierTypeId ||
      _.get(data, 'entityIdentifierType.entityIdentifierTypeId');

    const normalizedData = Object.assign(
      _.omit(data, ['entity', 'entityIdentifierType']),
      { entityId, entityIdentifierTypeId }
    );

    return new EntityIdentifier(normalizedData);
  }
});

function validateMetadata(value, attributes, key) {
  if (_.isObject(value)) {
    if (!value[contentTypeKey]) {
      return {
        [key]: { message: `"${contentTypeKey}" is required` }
      };
    }

    return null;
  }

  return {
    [key]: { message: 'should be an object' }
  };
}

function toURL(val, src, self, key) {
  if (!val) {
    self[key] = null;
    return;
  }

  self[key] = convert.toURLObject(val) || null;
}
