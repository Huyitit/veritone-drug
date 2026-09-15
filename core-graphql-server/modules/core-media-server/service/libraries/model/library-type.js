'use strict';

const _ = require('lodash');
const embeddedModel = require('@veritone/core-server-base/model/util/embedded-model');
const embeddedModelArray = require('@veritone/core-server-base/model/util/embedded-model-array');
const EntityType = require('./entity-type');
const EntityIdentifierTypeLink = require('./library-type-entity-identifier-type-link');
const validators = require('./util/validate');
const idRegex = /[a-z0-9\-]+/;

/**
 * @swagger
 * definitions:
 *   LibraryType:
 *     type: object
 *     required:
 *       - libraryTypeId
 *       - label
 *       - entityIdentifierTypes
 *     properties:
 *       libraryTypeId:
 *         type: string
 *       label:
 *         type: string
 *       iconClass:
 *         type: string
 *       entityIdentifierTypes:
 *         type: array
 *         items:
 *           type: string
 *       entityType:
 *         $ref: '#/definitions/EntityType'
 *   LibraryTypePayload:
 *     type: object
 *     required:
 *       - libraryTypeId
 *       - label
 *       - entityIdentifierTypes
 *       - entityType
 *     properties:
 *       libraryTypeId:
 *         type: string
 *       label:
 *         $ref: '#/definitions/LibraryType/properties/label'
 *       iconClass:
 *         $ref: '#/definitions/LibraryType/properties/iconClass'
 *       entityIdentifierTypes:
 *         $ref: '#/definitions/LibraryType/properties/entityIdentifierTypes'
 *       entityType:
 *         $ref: '#/definitions/LibraryType/properties/entityType'
 */

const BaseModel = require('@veritone/core-server-base/model/util/create-model')({
  libraryTypeId: {
    type: 'string',
    required: true,
    validate: validateId
  },
  label: {
    type: 'string',
    required: true,
    validate: validators.validateNonEmptyString
  },
  iconClass: {
    type: 'string'
    // TODO validate
  },
  entityType: embeddedModel({
    model: EntityType,
    modelName: 'EntityType',
    required: true
  }),
  entityIdentifierTypes: embeddedModelArray({
    model: EntityIdentifierTypeLink,
    modelName: 'EntityIdentifierTypeLink',
    required: true
  })
});

class LibraryType extends BaseModel {
  constructor(data, isFromDB) {
    super(data, isFromDB);

    if (this.entityType) {
      this.entityType._libraryType = this;
    }
  }

  supportsIdentifierType(entityIdentifierTypeId) {
    if (!this.entityIdentifierTypes || !this.entityIdentifierTypes.length) {
      return false;
    }

    if (this.entityIdentifierTypes[0] instanceof EntityIdentifierTypeLink) {
      return this.entityIdentifierTypes.some(function match(ei) {
        return ei.entityIdentifierTypeId == entityIdentifierTypeId;
      });
    }

    return this.entityIdentifierTypes.includes(entityIdentifierTypeId);
  }

  validate() {
    let errs = super.validate();

    if (!errs && this.entityIdentifierTypes) {
      const uniq = _.uniqBy(
        this.entityIdentifierTypes,
        'entityIdentifierTypeId'
      );

      if (uniq.length < this.entityIdentifierTypes.length) {
        errs = {
          entityIdentifierTypes: {
            message: 'entityIdentifierTypeId must per unique for each entry'
          }
        };
      }
    }

    return errs;
  }
}

module.exports = Object.assign(LibraryType, {
  // override the default fromDB behavior
  fromDB(dbResult) {
    const instance = new LibraryType(dbResult, true);

    if (!instance.entityType) {
      instance.entityType = new EntityType(
        _.mapKeys(dbResult, function mapFields(value, key) {
          const matches = key.match(/^entity_type_(.*)$/);
          return matches ? matches[1] : null;
        }),
        true
      );
    }

    instance.entityType._libraryType = instance;

    return instance;
  }
});

function validateId(value, attributes, key) {
  if (typeof value == 'string' && idRegex.test(value)) {
    return null;
  }

  if (!value) {
    return {
      [key]: { message: 'cannot be blank' }
    };
  }

  return {
    [key]: { message: 'should only contain alphanumeric characters and dashes' }
  };
}
