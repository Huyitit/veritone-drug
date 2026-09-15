const JsonValidator = require('jsonschema').Validator;
const _ = require('lodash');
const errors = require('../../../error')({});
class Validator {
  constructor(serviceContext) {
    this.logger = serviceContext.logger;
    this.validator = new JsonValidator();
  }

  async validateAsync(schema, data) {
    if (_.isString(schema)) {
      schema = JSON.parse(schema);
    }
    const validateResult = this.validateData(data, schema);
    return validateResult;
  }

  transformSchema(schema) {
    const regexGeoPoint =
      '^[-+]?([1-8]?\\\\d(\\\\.\\\\d+)?|90(\\\\.0+)?),\\\\s*[-+]?(180(\\\\.0+)?|((1[0-7]\\\\d)|([1-9]?\\\\d))(\\\\.\\\\d+)?)$';
    const regexDateTime = `^\\\\d\\\\d\\\\d\\\\d-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])T([01]?[0-9]|2[0-3]):([0-9]|[0-5][0-9]):([0-9]|[0-5][0-9])(\\\\.[0-9][0-9][0-9])?Z?$`;

    var newSchema = JSON.stringify(schema).replace(
      new RegExp('"type":"geoPoint"', 'g'),
      `"type":"string", "pattern":"${regexGeoPoint}"`
    );
    var finalSchema = newSchema.replace(
      new RegExp('"type":"dateTime"', 'g'),
      `"type":"string", "pattern":"${regexDateTime}"`
    );

    return JSON.parse(finalSchema);
  }

  validateData(dataToValidate, schema) {
    if (!schema) {
      throw new Error(`schema parameter is required`);
    }
    var veritoneSchema = this.transformSchema(schema);

    //passed in dataToValidate is not instanceof Object, cloneDeep is a fix for this
    var validationResult = this.validator.validate(
      _.cloneDeep(dataToValidate),
      veritoneSchema
    );

    var validationPassed = validationResult.errors.length === 0;
    if (!validationPassed) {
      throw new errors.InvalidInput({
        message: 'The provided JSON had validation errors.',
        data: {
          validationErrors: validationResult.errors
        }
      });
    }
    return validationPassed;
  }

  /**
   * Recursively coerces string values to objects/arrays based on JSON schema type definitions.
   * This handles cases where frontend sends JSON as strings (e.g., discoveryPolicy: "{ ... }").
   * @param {*} data - The data to coerce
   * @param {object} schema - The JSON schema definition
   * @returns {*} - The coerced data with string JSON parsed to objects where appropriate
   */
  coerceDataBySchema(data, schema) {
    if (_.isNil(data) || _.isNil(schema)) {
      return data;
    }

    const schemaType = schema.type;

    // If schema expects object/array but data is a string, try to parse it
    if (_.isString(data)) {
      if (schemaType === 'object' || schemaType === 'array') {
        const trimmed = data.trim();
        if (
          (schemaType === 'object' && trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (schemaType === 'array' && trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            data = JSON.parse(data);
          } catch (e) {
            // If parsing fails, keep original string - validation will catch the error
            return data;
          }
        } else {
          return data;
        }
      } else {
        return data;
      }
    }

    // Recursively process object properties
    if (_.isPlainObject(data) && schemaType === 'object' && schema.properties) {
      const result = {};
      for (const key of Object.keys(data)) {
        const propSchema = schema.properties[key];
        if (propSchema) {
          result[key] = this.coerceDataBySchema(data[key], propSchema);
        } else {
          // Handle additionalProperties if defined
          if (schema.additionalProperties && _.isObject(schema.additionalProperties)) {
            result[key] = this.coerceDataBySchema(data[key], schema.additionalProperties);
          } else {
            result[key] = data[key];
          }
        }
      }
      return result;
    }

    // Recursively process array items
    if (_.isArray(data) && schemaType === 'array' && schema.items) {
      return data.map(item => this.coerceDataBySchema(item, schema.items));
    }

    return data;
  }
}

module.exports = Validator;
