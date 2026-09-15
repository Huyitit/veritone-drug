'use strict';

var _ = require('lodash');
var validators = require('./util/validators');
var createModel = require('./util/create-model');

module.exports = function configure(config) {
  if (!_.isObject(config)) {
    throw new Error('Missing config object');
  }
  if (!_.isObject(config.paging)) {
    throw new Error('Missing config.paging object');
  }
  if (
    !_.isNumber(config.paging.defaultLimit) ||
    config.paging.defaultLimit < 1
  ) {
    throw new Error(
      'config.paging.defaultLimit should be a number greater than or equal to 1'
    );
  }
  if (!_.isNumber(config.paging.maxLimit) || config.paging.maxLimit < 1) {
    throw new Error(
      'config.paging.maxLimit should be a number greater than or equal to 1'
    );
  }

  var DEFAULT_LIMIT = config.paging.defaultLimit;
  var MAX_LIMIT = config.paging.maxLimit;

  var LimitField = {
    type: 'number',
    convert: convertLimit,
    validate: validateLimit
  };
  var OffsetField = {
    type: 'number',
    convert: convertOffset,
    validate: validateOffset
  };

  return {
    LimitField: LimitField,
    OffsetField: OffsetField,
    Paging: createModel({
      limit: LimitField,
      offset: OffsetField
    })
  };

  function convertLimit(value, src, dst) {
    if (_.isString(value)) {
      var parsed = parseInt(value, 10);
      if (!_.isNaN(parsed)) {
        value = parsed;
      }
    }
    dst.limit = !_.isUndefined(value) ? value : DEFAULT_LIMIT;
  }

  function validateLimit(value, attributes, key) {
    var err = validators.validateNumber(value, attributes, key);
    if (err) {
      return err;
    }
    if (value < 1 || value > MAX_LIMIT) {
      return {
        limit: {
          message:
            'should be a positive Number less than or equal to ' + MAX_LIMIT
        }
      };
    }
    return null;
  }

  function convertOffset(value, src, dst) {
    if (_.isString(value)) {
      var parsed = parseInt(value, 10);
      if (!_.isNaN(parsed)) {
        value = parsed;
      }
    }
    dst.offset = !_.isUndefined(value) ? value : 0;
  }

  function validateOffset(value, attributes, key) {
    var err = validators.validateNumber(value, attributes, key);
    if (err) {
      return err;
    }
    if (value < 0) {
      return { offset: { message: 'should be a non-negative Number' } };
    }
    return null;
  }
};
