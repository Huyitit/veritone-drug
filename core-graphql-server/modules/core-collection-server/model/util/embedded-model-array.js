'use strict';

var _ = require('lodash');

/*
 * embeddedModelArray is a utility function to generate a field configuration object
 * for a json-typed field containing an array of instances of a model type.
 *
 * USAGE:
 *
 * 	var InnerModel = createModel({
 * 		a: { type: 'string' },
 * 		b: { type: 'string' }
 * 	});
 *
 * 	var OuterModel = createModel({
 * 		myStringField: { type: 'string' },
 * 		myJsonArrayField: embeddedModelArray({
 * 			model: InnerModel,
 * 			modelName: 'InnerModel',
 * 			dbKey: 'my_db_key',
 * 			required: true
 * 		})
 * 	});
 *
 * OPTIONS:
 *
 * 	* model -- (required function, model constructor function)
 * 	* modelName -- (required string, display name of model type for error messages)
 *
 *		The following options are also passed through to createModel({...}) when present:
 * 	* dbKey (string)
 *		* required (boolean)
 *		* userEditable (boolean)
 *		* convert (function)
 *		* validate (function or object)
 */
module.exports = function embeddedModelArray(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('Missing options object');
  }
  var Model = options.model;
  if (!_.isFunction(Model)) {
    throw new Error('Missing options.model constructor function');
  }
  var modelName = options.modelName;
  if (!_.isString(modelName) || modelName === '') {
    throw new Error('Missing options.modelName string');
  }
  var required = options.required;
  if (_.has(options, 'required') && required !== false && required !== true) {
    throw new Error('options.required should be a boolean (when present)');
  }
  // The remaining options are validated within createModel({...})

  var fieldOptions = { type: 'json' };

  if (_.has(options, 'convert')) {
    fieldOptions.convert = options.convert;
  } else {
    fieldOptions.convert = convertToModelArray;
  }

  if (_.has(options, 'validate')) {
    fieldOptions.validate = options.validate;
  } else {
    fieldOptions.validate = required
      ? validateModelArray
      : validateOptionalModelArray;
  }

  if (_.has(options, 'dbKey')) {
    fieldOptions.dbKey = options.dbKey;
  }
  if (_.has(options, 'required')) {
    fieldOptions.required = options.required;
  }
  if (_.has(options, 'userEditable')) {
    fieldOptions.userEditable = options.userEditable;
  }

  // Return field configuration object for use in createModel({...}):
  return fieldOptions;

  function convertToModelArray(value, src, dst, key) {
    if (!_.has(src, key)) {
      return;
    }
    dst[key] = _.isArray(value) ? value.map(Model) : value;
  }

  function validateOptionalModelArray(value, attributes, key) {
    if (!_.has(attributes, key)) {
      return null;
    }
    if (_.isNull(value)) {
      return null;
    }
    return validateModelArray(value, attributes, key);
  }

  function validateModelArray(value, attributes, key) {
    var validationError;
    if (!_.isArray(value)) {
      validationError = {};
      validationError[key] = { message: 'should be an Array' };
      return validationError;
    }

    var validationErrors = [];
    value.forEach(function validateModelArrayItem(item, i) {
      if (!_.isObject(item) || item.constructor !== Model) {
        validationErrors.push({
          message: 'should be an instance of ' + modelName,
          position: i
        });
        return;
      }
      var itemValidationError = item.validate();
      if (itemValidationError) {
        itemValidationError.position = i;
        validationErrors.push(itemValidationError);
      }
    });

    if (validationErrors.length) {
      validationError = {};
      validationError[key] = validationErrors;
      return validationError;
    }

    return null;
  }
};
