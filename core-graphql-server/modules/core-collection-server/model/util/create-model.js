'use strict';

var _ = require('lodash');
var validatejs = require('validate.js');
var validators = require('./validators');
var convertDbValue = require('./convert-db-value');
var toCamelCase = require('./to-camel-case');

/*
 * createModel creates a model type (constructor/prototype) from a model config object.
 *
 * Constructed instances of the model type will only contain white-listed properties,
 * and will have a validate() method assigned.
 *
 * The model type will also have a fromDB(dbResult) method assigned, which recursively
 * converts snake-case keys to camel-case and casts numeric id values to strings, within dbResult.
 *
 * USAGE:
 *
 * 	var Comment = createModel({
 * 		// _postgresConfig is optional:
 * 		_postgresConfig: {
 * 			schemaName: 'comment',
 * 			tableName: 'comment',
 * 			fields: {
 * 				comment_id: 'commentId' // eslint-disable-line camelcase
 * 			},
 * 			primaryKey: 'comment_id'
 * 		},
 * 		mentionId: { type: 'string', required: true },
 * 		userId: { type: 'string' },
 * 		commentId: { type: 'string' },
 * 		commentText: { type: 'string', userEditable: true },
 * 		dateCreated: { type: 'date' },
 * 		dateModified: { type: 'date' },
 * 		metadata: {
 * 			type: 'json',
 * 			dbKey: 'comment_metadata',
 * 			convert: function(value, src, dst, key) {
 * 				value.foo = 'FOO';
 * 				dst[key] = value; // not strictly necessary in this case...
 * 			},
 * 			validate: function(value, attributes, key) {
 * 				// attributes[key] === value
 * 				if (!_.has(value, key)) {
 * 					return null;
 * 				}
 * 				if (_.isObject(value) || _.isNull(value)) {
 * 					return null;
 * 				}
 * 				var err = {};
 * 				err[key] = { message: 'should be an Object' };
 * 				return err;
 * 			}
 * 		}
 * 	});
 *
 *		expect(Comment._postgresConfig).toEqual(...postgresConfig...);
 *
 *		expect(Comment._validation).toEqual({
 *			mentionId: ...,
 *			userId: ...,
 *			commentId: ...,
 *			commentText: ...,
 *			dateCreated: ...,
 *			dateModified: ...,
 *			metadata: ...
 *		});
 *
 *		var comment = new Comment({ mentionId: '123', ... });
 *		expect(comment.mentionId).toBe('123');
 *
 *		var comment = Comment.fromDB({ mention_id: 123, comment_metadata: { media_id: 1 } });
 *		expect(comment.mentionId).toBe('123');
 *		expect(comment.metadata.mediaId).toBe('1');
 * 	var err = comment.validate();
 * 	expect(err).toBeNull();
 *
 *		var comment = new Comment({});
 * 	expect(comment.hasOwnProperty('mentionId')).toBe(false);
 *		var err = comment.validate();
 *		expect(err.mentionId).toBeTruthy();
 *
 * FIELD OPTIONS:
 *
 * 	* type -- (required String):
 * 		type is the field type, and should be one of "string", "number", "boolean", "date", "json".
 *
 * 	* userEditable -- (optional Boolean, default = false):
 * 		userEditable specifies whether the field may be set by end-users (during create/update operations).
 *
 * 	* required -- (optional Boolean, default = false):
 * 		required specifies whether the field must be set (and not null).
 *
 * 	* dbKey -- (optional String, default = snake-case-version-of-key):
 * 		dbKey specifies the key (within db results) where the field should be found in the source data.
 *
 * 	* convert -- (optional function, default = default-type-conversion-function):
 * 		convert specifies an input value convertor for the field.
 *			The function signature should be as follows:
 *				function(value, sourceObject, destinationObject, key) { ... }
 *
 * 	* validate -- (optional Object|Function, default = default-type-validation-function):
 * 		validate specifies a "validate.js"-compatible validator for the field.
 *			The function signature (when applicable) should be as follows:
 *				function(value, attributesObject, key) { ... }
 *
 */
module.exports = function createModel(modelConfig) {
  if (!_.isPlainObject(modelConfig)) {
    throw new Error('modelConfig should be an object');
  }
  if (
    !_.isUndefined(modelConfig._postgresConfig) &&
    !_.isNull(modelConfig._postgresConfig) &&
    !_.isObject(modelConfig._postgresConfig)
  ) {
    throw new Error('modelConfig._postgresConfig should be an object');
  }

  var stringFields = [];
  var numberFields = [];
  var booleanFields = [];
  var dateFields = [];
  var jsonFields = [];
  var polymorphicFields = [];
  var uuidFields = [];

  var requiredFields = {};
  var userEditableFields = {};

  // Rename data[dbKey] as data[key] in place.
  //
  // IMPORTANT: data[dbKey] will not be deleted. This operation is a copy, not a move.
  // All parameters will have been validated prior to this function being called.
  function renameDbKey(data, dbKey, key) {
    dbKey = toCamelCase(dbKey);
    if (!_.has(data, dbKey)) {
      return;
    }
    data[key] = data[dbKey];
  }

  // Extract field config objects from model config:
  _.forOwn(modelConfig, function configureField(fieldConfig, fieldKey) {
    if (fieldKey === '_postgresConfig') {
      return;
    }

    if (!_.isObject(fieldConfig)) {
      throw new Error(
        'Field config should be an object (field key: ' + fieldKey + ')'
      );
    }
    if (
      _.has(fieldConfig, 'convert') &&
      !_.isFunction(fieldConfig.convert) &&
      !_.isNull(fieldConfig.convert)
    ) {
      throw new Error(
        'Field config "convert" property should be a function (field key: ' +
          fieldKey +
          ')'
      );
    }
    if (
      _.has(fieldConfig, 'validate') &&
      !_.isFunction(fieldConfig.validate) &&
      !_.isPlainObject(fieldConfig.validate) &&
      !_.isNull(fieldConfig.validate)
    ) {
      throw new Error(
        'Field config "validate" property should be a function or object (field key: ' +
          fieldKey +
          ')'
      );
    }
    if (
      _.has(fieldConfig, 'required') &&
      fieldConfig.required !== false &&
      fieldConfig.required !== true
    ) {
      throw new Error(
        'Field config "required" property should be a boolean (when present)'
      );
    }
    if (
      _.has(fieldConfig, 'userEditable') &&
      fieldConfig.userEditable !== false &&
      fieldConfig.userEditable !== true
    ) {
      throw new Error(
        'Field config "userEditable" property should be a boolean (when present)'
      );
    }
    if (
      _.has(fieldConfig, 'dbKey') &&
      (!_.isString(fieldConfig.dbKey) || fieldConfig.dbKey === '')
    ) {
      throw new Error(
        'Field config "dbKey" property should be a string (when present)'
      );
    }

    fieldConfig = _.cloneDeep(fieldConfig);

    fieldConfig.key = fieldKey;

    if (fieldConfig.required) {
      requiredFields[fieldKey] = true;
    }

    if (fieldConfig.userEditable) {
      userEditableFields[fieldKey] = true;
    }

    switch (fieldConfig.type) {
      case 'string':
        stringFields.push(fieldConfig);
        break;
      case 'number':
        numberFields.push(fieldConfig);
        break;
      case 'boolean':
        booleanFields.push(fieldConfig);
        break;
      case 'date':
        dateFields.push(fieldConfig);
        break;
      case 'json':
        jsonFields.push(fieldConfig);
        break;
      case 'uuid':
        uuidFields.push(fieldConfig);
        break;
      case '*':
      case 'polymorphic':
        fieldConfig.type = 'polymorphic';
        polymorphicFields.push(fieldConfig);
        break;
      default:
        throw new Error('unknown field type (' + fieldConfig.type + ')');
    }
  });

  // Model constructor function:
  function Model(data, isFromDB) {
    if (!(this instanceof Model)) {
      return new Model(data, isFromDB);
    }

    var self = this;

    if (_.isNull(data) || _.isUndefined(data)) {
      data = {};
    }

    if (isFromDB) {
      data = convertDbValue(data);
    }

    polymorphicFields.forEach(simpleCopy);
    stringFields.forEach(simpleCopy);
    function simpleCopy(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      if (_.has(data, key)) {
        self[key] = data[key];
      }
    }

    numberFields.forEach(function convertNumber(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      var value = data[key];
      if (_.isString(value) && value !== '') {
        value = parseFloat(value);
      }

      if (_.has(data, key)) {
        self[key] = value;
      }
    });

    booleanFields.forEach(function convertBoolean(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      if (_.has(data, key)) {
        var value = data[key];
        if (value === 0) {
          value = false;
        } else if (value === 1) {
          value = true;
        }
        self[key] = value;
      }
    });

    dateFields.forEach(function convertDate(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      if (_.has(data, key)) {
        var value = data[key];
        var wasParsed = false;
        if (_.isString(value) && value !== '') {
          value = new Date(Date.parse(value));
          wasParsed = true;
        } else if (
          _.isNumber(value) &&
          !_.isNaN(value) &&
          value > 0 &&
          value < Number.POSITIVE_INFINITY
        ) {
          value = new Date(value);
          wasParsed = true;
        }
        if (wasParsed && _.isNaN(value.getTime())) {
          // Leave data[key] intact, as it will be caught during validation.
          value = data[key];
        }

        self[key] = value;
      }
    });

    jsonFields.forEach(function convertJSON(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      var hasKey = _.has(data, key);
      if (hasKey && typeof data[key] === 'string') {
        try {
          data[key] = JSON.parse(data[key]);
        } catch (err) {
          // Leave data[key] intact, as it will be caught during validation.
        }

        if (isFromDB) {
          data[key] = convertDbValue(data[key]);
        }
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      if (hasKey) {
        self[key] = data[key] || null;
      }
    });

    uuidFields.forEach(function convertJSON(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.dbKey) {
        renameDbKey(data, fieldConfig.dbKey, key);
      }

      if (fieldConfig.convert) {
        fieldConfig.convert(data[key], data, self, key);
        return;
      }

      if (_.has(data, key)) {
        self[key] = data[key];
      }
    });
  }

  Model.allFields = [];
  _.each(
    {
      stringFields: stringFields,
      numberFields: numberFields,
      booleanFields: booleanFields,
      dateFields: dateFields,
      jsonFields: jsonFields,
      polymorphicFields: polymorphicFields,
      uuidFields: uuidFields
    },
    function registerFieldType(fieldsForType, key) {
      Model[key] = fieldsForType;
      Model.allFields = Model.allFields.concat(fieldsForType);
    }
  );

  Model.requiredFields = requiredFields;
  Model.userEditableFields = userEditableFields;

  // Construct a model instance from a db result (i.e. rename keys to camel-case, then instantiate):
  Model.fromDB = function modelFromDbResult(dbResult) {
    var isFromDB = true;
    return new Model(dbResult, isFromDB);
  };

  // Validation constraints:
  var fieldConstraints = {};

  function validatePolymorphic(value, attributes, key) {
    if (_.has(attributes, key)) {
      return null;
    }
    var err = {};
    err[key] = { message: 'is required' };
    return err;
  }

  function validateOptionalPolymorphic(/* value, attributes, key */) {
    return null;
  }

  // Add validators for all fields to fieldConstraints (if a custom validator is not specified):
  [
    [
      stringFields,
      validators.validateString,
      validators.validateOptionalString
    ],
    [
      numberFields,
      validators.validateNumber,
      validators.validateOptionalNumber
    ],
    [
      booleanFields,
      validators.validateBoolean,
      validators.validateOptionalBoolean
    ],
    [dateFields, validators.validateDate, validators.validateOptionalDate],
    [jsonFields, validators.validateJSON, validators.validateOptionalJSON],
    [polymorphicFields, validatePolymorphic, validateOptionalPolymorphic],
    [uuidFields, validators.validateUUID, validators.validateOptionalUUID]
  ].forEach(function addValidatorsForFieldType(fieldType) {
    var fields = fieldType[0];
    var whenRequired = fieldType[1];
    var whenOptional = fieldType[2];
    fields.forEach(function addFieldValidator(fieldConfig) {
      var key = fieldConfig.key;
      if (fieldConfig.validate) {
        fieldConstraints[key] = fieldConfig.validate;
        return;
      }
      fieldConstraints[key] = fieldConfig.required
        ? whenRequired
        : whenOptional;
    });
  });

  Model.allFields.forEach(function validateFieldConfig(fieldConfig) {
    // Ensure field validators are present for all fields:
    var fieldConstraint = fieldConstraints[fieldConfig.key];

    if (!(_.isFunction(fieldConstraint) || _.isObject(fieldConstraint))) {
      throw new Error(
        'Missing validation constraint object or function for key: ' +
          fieldConfig.key
      );
    }
  });

  Model._validation = fieldConstraints;

  // Model-instance validation method:
  Model.prototype.validate = function validateModel() {
    var self = this;
    var errors = {};
    _.each(Model._validation, function checkConstraint(constraint, key) {
      if (_.isFunction(constraint)) {
        _.merge(errors, constraint(self[key], self, key));
      } else {
        _.merge(errors, validatejs(self, _.pick(fieldConstraints, key)));
      }
    });

    return _.size(errors) ? errors : null;
  };

  Model._postgresConfig = modelConfig._postgresConfig || {};

  // Return model constructor function:
  return Model;
};
