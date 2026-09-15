'use strict';

var _ = require('lodash');
var validators = require('./validators');
var toCamelCase = require('./to-camel-case');

// Convert object keys to camel-case and cast id values to string, recursively within object values,
// and iteratively/recursively within array values.
function convertDbValue(value) {
  if (_.isArray(value)) {
    return value.map(function convertArrayVal(v) {
      return convertDbValue(v);
    });
  }

  if (_.isObject(value) && !_.isDate(value)) {
    var newObj = {};

    _.forOwn(value, function convertKeyValue(val, key) {
      var camelKey = toCamelCase(key);
      // Cast id values to string:
      if (key.slice(-3) === '_id' || key === 'id' || key.slice(-2) === 'Id') {
        if (_.isNumber(val)) {
          var validationError = validators.validateOptionalNumber();
          if (validationError) {
            // Validation of the containing object will be performed again, later,
            // so this error will be caught (convertDbValue does not throw):
            newObj[camelKey] = val;
            return;
          }

          newObj[camelKey] = '' + val;
          return;
        }
      }

      newObj[camelKey] = convertDbValue(val);
    });

    return newObj;
  }
  // Leave value as is...
  return value;
}

module.exports = convertDbValue;
