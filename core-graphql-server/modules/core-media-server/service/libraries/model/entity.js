'use strict';

const validators = require('./util/validate');

/**
 * @swagger
 * definitions:
 *   Entity:
 *     type: object
 *     properties:
 *       entityId:
 *         description: The unique ID of the entity. Use the List All Entities endpoint to determine the `entityId` value.
 *         type: string
 *         format: uuid
 *       name:
 *         description: A user-defined name given to identify the entity.
 *         type: string
 *       profileImageUrl:
 *         description: The URL of the image representing the entity's avatar, or null if the entity does not have one.
 *         type: string
 *       description:
 *         description: a brief description of the entity.
 *         type: string
 *       metadata:
 *         description: Key-value pairs of contextual data to attach to the entity.
 *         type: object
 *       isPublished:
 *         description: A boolean flag indicating whether or not the entity has been published with the latest library revision.
 *         type: boolean
 *       createdDateTime:
 *         description: The date and time the entity was created.
 *         type: string
 *         format: date-time
 *       modifiedDateTime:
 *         description: The date and time the entity was modified.
 *         type: string
 *         format: date-time
 *       library:
 *         $ref: '#/definitions/Library'
 *       summary:
 *         $ref: '#/definitions/EntitySummary'
 *   EntityPayload:
 *     type: object
 *     required:
 *       - libraryId
 *       - name
 *     properties:
 *       libraryId:
 *         description: The unique ID of the library that contains the entity. Use the List All Libraries endpoint to determine the `libraryId` value.
 *         type: string
 *       name:
 *         $ref: '#/definitions/Entity/properties/name'
 *       profileImageUrl:
 *         $ref: '#/definitions/Entity/properties/profileImageUrl'
 *       aliases:
 *         $ref: '#/definitions/Entity/properties/aliases'
 *       metadata:
 *         $ref: '#/definitions/Entity/properties/metadata'
 */

const uuid = require('uuid');
const _ = require('lodash');
const convert = require('./util/convert');
const validate = require('./util/validate');

const Entity = require('@veritone/core-server-base/model/util/create-model')({
  entityId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  libraryId: {
    type: 'string',
    required: true,
    validate: validate.validateUUID
  },
  name: {
    type: 'string',
    required: true,
    validate: validate.validateNonEmptyString
  },
  profileImageUrl: {
    type: 'string',
    convert: toURL,
    validate: validate.validateURL,
    toJSON(value) {
      return convert.toSignedURL(value, Entity.signURL);
    }
  },
  description: {
    type: 'string'
  },
  metadata: {
    type: 'json',
    validate: validateMetadata,
    convert(val, src, self, key) {
      self[key] = _.isNil(val) ? {} : val;
    }
  },
  isPublished: {
    type: 'boolean'
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

Object.assign(Entity.prototype, {
  generateId() {
    this.entityId = uuid.v4();
    return this.entityId;
  },

  setMetadataSchema(schema) {
    if (!_.isObject(schema)) {
      throw new Error('schema argument must be an object.');
    }

    if (!this.schema) {
      Object.defineProperty(this, 'schema', {
        value: schema,
        enumerable: false
      });
    } else {
      this.schema = schema;
    }

    return this;
  }
});

module.exports = Object.assign(Entity, {
  /**
   * Normalizes data and constructs an Entity model instance from it
   * @param {Object} data - an object containing the entity data
   * @return {Entity} a normalized model instance
   */
  normalize(data) {
    const libraryId = data.libraryId || _.get(data, 'library.libraryId');
    const normalizedData = Object.assign(_.omit(data, ['library']), {
      libraryId
    });

    return new Entity(normalizedData);
  }
});

function validateMetadata(value, attributes, key) {
  if (!_.isObject(value)) {
    return {
      [key]: { message: 'must be an object' }
    };
  }

  if (attributes.schema) {
    const errs = validators.validateAgainstSchema(
      attributes.metadata,
      attributes.schema
    );

    if (errs.length) {
      return {
        [key]: errs.length === 1 ? errs[0] : errs
      };
    }
  }

  return null;
}

function toURL(val, src, self, key) {
  if (!val) {
    self[key] = null;
    return;
  }

  self[key] = convert.toURLObject(val) || null;
}
