'use strict';

const _ = require('lodash');
const { Validator, ValidationError } = require('jsonschema');
const { Url } = require('url');
const validators = require('@veritone/core-server-base/model/util/validators');
const metaSchema = require('jsonschema/schema/draft-04/schema.json');
const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

module.exports = Object.assign({}, validators, {
  validateUUID,
  validateURL,
  validateOptionalObject,
  validateAgainstSchema
});

function validateUUID(value, attributes, key) {
  if (uuidRegex.test(value)) {
    return null;
  }

  return {
    [key]: { message: 'not a valid UUID' }
  };
}

function validateURL(value, attributes, key) {
  if (value === null) {
    return null;
  }

  if (value instanceof Url && value.protocol && value.host && value.path) {
    return null;
  }

  return {
    [key]: { message: 'invalid URL' }
  };
}

function validateOptionalObject(value, attributes, key) {
  if (_.isNil(value) || _.isObject(value)) {
    return null;
  }

  return {
    [key]: { message: 'must be null or an object' }
  };
}

function validateAgainstSchema(instance, schema = metaSchema) {
  const validationErrors = [];
  const v = new Validator();

  v.addSchema(schema);
  const result = v.validate(instance, schema);

  if (result && Array.isArray(result.errors)) {
    result.errors.forEach(function each(error) {
      if (error instanceof ValidationError) {
        let { message, property } = error;

        if (property == 'instance') {
          property = error.argument;
        } else {
          property = property.replace('instance.', '');
        }

        validationErrors.push({ message, property });
      }
    });
  }

  return validationErrors;
}
