'use strict';

/**
 * @swagger
 * definitions:
 *   EntityIdentifierType:
 *     type: object
 *     required:
 *       - entityIdentifierTypeId
 *       - label
 *       - labelPlural
 *       - dataType
 *     properties:
 *       entityIdentifierTypeId:
 *         description: Unique id given to the entity identifier type.
 *         type: string
 *       label:
 *         description: A short user-defined name to describe the entity identifier type.
 *         type: string
 *       labelPlural:
 *         description: Pluralized version of the label field.
 *         type: string
 *       iconClass:
 *         description: A CSS style class that defines the icon associated with the entity identifier type.
 *         type: string
 *       dataType:
 *         description: The data type that the entity identifier type will support.
 *         type: string
 *         enum:
 *           - text
 *           - image
 *           - audio
 *           - video
 *       description:
 *         description: a brief description of the entity identifier type.
 *         type: string
 *   EntityIdentifierTypePayload:
 *     type: object
 *     required:
 *       - label
 *       - dataType
 *     properties:
 *       label:
 *         $ref: '#/definitions/EntityIdentifierType/properties/label'
 *       labelPlural:
 *         $ref: '#/definitions/EntityIdentifierType/properties/labelPlural'
 *       iconClass:
 *         $ref: '#/definitions/EntityIdentifierType/properties/iconClass'
 *       dataType:
 *         $ref: '#/definitions/EntityIdentifierType/properties/dataType'
 *       description:
 *         $ref: '#/definitions/EntityIdentifierType/properties/description'
 */

const validate = require('./util/validate');
const idRegex = /[a-z0-9\-]+/;

const dataTypeEnum = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video'
};

const EntityIdentifierType = require('@veritone/core-server-base/model/util/create-model')(
  {
    entityIdentifierTypeId: {
      type: 'string',
      required: true,
      validate: validateId
    },
    label: {
      type: 'string',
      required: true,
      validate: validate.validateNonEmptyString
    },
    labelPlural: {
      type: 'string',
      required: true,
      validate: validate.validateNonEmptyString
    },
    iconClass: {
      type: 'string'
      // TODO validate
    },
    dataType: {
      type: 'string',
      required: true,
      validate: validateDateType
    },
    description: {
      type: 'string'
    }
  }
);

Object.assign(EntityIdentifierType.prototype, {
  supportsContentType(contentType) {
    if (!contentType) {
      return false;
    }

    switch (this.dataType) {
      case dataTypeEnum.image:
        return contentType.match(/^image\//i);
      case dataTypeEnum.audio:
        return contentType.match(/^audio\//i);
      case dataTypeEnum.video:
        return contentType.match(/^video\//i);
      case dataTypeEnum.text:
      default:
        return true;
    }
  }
});

module.exports = Object.assign(EntityIdentifierType, { dataTypeEnum });

function validateId(value, attributes, key) {
  if (typeof value == 'string' && idRegex.test(value)) {
    return null;
  }

  return {
    [key]: { message: 'should only contain alphanumeric characters and dashes' }
  };
}

function validateDateType(value, attributes, key) {
  if (dataTypeEnum[value]) {
    return null;
  }

  return {
    [key]: {
      message:
        'invalid data type. possible values are: ' +
        Object.keys(dataTypeEnum).join(', ')
    }
  };
}
