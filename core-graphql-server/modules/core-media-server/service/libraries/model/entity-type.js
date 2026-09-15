'use strict';

const mergeSchemas = require('merge-json-schemas');
const validators = require('./util/validate');
const baseEntityTypeSchema = require('./schema/entity-type-metadata.json');

/**
 * @swagger
 * definitions:
 *   EntityType:
 *     type: object
 *     required:
 *       - name
 *       - namePlural
 *     properties:
 *       name:
 *         type: string
 *       namePlural:
 *         type: string
 *       schema:
 *         type: object
 */

const BaseModel = require('@veritone/core-server-base/model/util/create-model')({
  name: {
    type: 'string',
    required: true,
    validate: validators.validateNonEmptyString
  },
  namePlural: {
    type: 'string',
    required: true,
    validate: validators.validateNonEmptyString
  },
  schema: {
    type: 'json',
    required: true,
    convert: normalizeSchema,
    validate: validateSchema,
    toJSON: schemaToJSON
  }
});

class EntityType extends BaseModel {
  constructor(data, isFromDB) {
    super(data, isFromDB);

    Object.defineProperty(this, '_libraryType', {
      enumerable: false,
      writable: true,
      value: null
    });

    Object.defineProperty(this, '_stringifySchema', {
      enumerable: false,
      writable: true,
      value: false
    });
  }

  generateCombinedSchema() {
    if (!this._libraryType) {
      throw new Error('libraryType of EntityType not defined');
    }

    const schemas = [baseEntityTypeSchema, this.schema];
    const { libraryTypeId, label: title } = this._libraryType;
    const id = `/library-type/${libraryTypeId}/schema`;

    schemas.push({ id, title });

    return mergeSchemas(schemas);
  }

  enableStringifySchema() {
    this._stringifySchema = true;
    return this;
  }
}

module.exports = EntityType;

function validateSchema(value, attributes, key) {
  if (typeof value != 'object') {
    return {
      [key]: { message: 'must be an object' }
    };
  }

  // use json meta-schema def to validate schema
  const errs = validators.validateAgainstSchema(value);

  if (errs.length) {
    return {
      [key]: errs.length === 1 ? errs[0] : errs
    };
  }

  return null;
}

function normalizeSchema(val, src, self, key) {
  self[key] = val === null ? {} : val;
}

function schemaToJSON(val, self) {
  if (self._stringifySchema) {
    return val;
  }

  // TODO get baseUri dynamically
  return { $ref: '/api/media' + self.generateCombinedSchema().id };
}
