'use strict';

var _ = require('lodash');

/*
 * embeddedModel is a utility function to generate a field configuration object
 * for a json-typed field containing an instance of a model type.
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
 * 		myJsonField: embeddedModel({
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
module.exports = function embeddedModel(options) {
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
    fieldOptions.convert = convertToModel;
  }

  if (_.has(options, 'validate')) {
    fieldOptions.validate = options.validate;
  } else {
    fieldOptions.validate = required ? validateModel : validateOptionalModel;
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

  function convertToModel(value, src, dst, key) {
    if (!_.has(src, key)) {
      return;
    }
    dst[key] = _.isObject(value) ? new Model(value) : value;
  }

  function validateOptionalModel(value, attributes, key) {
    if (!_.has(attributes, key)) {
      return null;
    }
    if (_.isNull(value)) {
      return null;
    }
    return validateModel(value, attributes, key);
  }

  function validateModel(value, attributes, key) {
    var validationError = {};
    if (!_.isObject(value) || value.constructor !== Model) {
      validationError[key] = {
        message: 'should be an instance of ' + modelName
      };
      return validationError;
    }

    var modelValidationError = value.validate();
    if (modelValidationError) {
      validationError[key] = modelValidationError;
      return validationError;
    }

    return null;
  }
};
