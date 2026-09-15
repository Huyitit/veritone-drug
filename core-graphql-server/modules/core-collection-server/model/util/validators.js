'use strict';

var _ = require('lodash'),
  validatejs = require('validate.js');
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateOptionalString(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (typeof value === 'string' || _.isNull(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a String' };

  return err;
}

function validateString(value, attributes, key) {
  if (_.isString(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a String' };

  return err;
}

function validateOptionalNumber(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (
    (_.isNumber(value) &&
      !_.isNaN(value) &&
      value !== Number.POSITIVE_INFINITY &&
      value !== Number.NEGATIVE_INFINITY) ||
    _.isNull(value)
  ) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Number' };

  return err;
}

function validateNumber(value, attributes, key) {
  if (
    _.isNumber(value) &&
    !_.isNaN(value) &&
    value !== Number.POSITIVE_INFINITY &&
    value !== Number.NEGATIVE_INFINITY
  ) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Number' };

  return err;
}

function validateOptionalBoolean(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (
    value === false ||
    value === true ||
    value === 0 ||
    value === 1 ||
    _.isNull(value)
  ) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Boolean (or either 0 or 1)' };

  return err;
}

function validateBoolean(value, attributes, key) {
  if (value === false || value === true || value === 0 || value === 1) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Boolean (or either 0 or 1)' };

  return err;
}

function validateOptionalDate(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (_.isDate(value) || _.isNull(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Date' };

  return err;
}

function validateDate(value, attributes, key) {
  if (_.isDate(value) && !_.isNaN(value.getTime())) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a Date' };

  return err;
}

function validateOptionalJSON(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (_.isObject(value) || _.isArray(value) || _.isNull(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be an Object or Array' };

  return err;
}

function validateJSON(value, attributes, key) {
  if (_.isObject(value) || _.isArray(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be an Object or Array' };

  return err;
}

function validateUUID(value, attributes, key) {
  if (uuidRegex.test(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a UUID' };

  return err;
}

function validateOptionalUUID(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  if (uuidRegex.test(value) || _.isNull(value)) {
    return null;
  }

  var err = {};
  err[key] = { message: 'should be a UUID' };

  return err;
}

function validateOptionalEmailConstraint(value, attributes, key) {
  if (!_.has(attributes, key)) {
    return null;
  }

  var error = {};

  if (Array.isArray(value)) {
    var errors = [];
    value.forEach(function validateEmail(email, index) {
      if (!_.isString(email) || email === '') {
        errors.push({
          message: 'email at index ' + index + ' should be a String'
        });
      }

      var error = validatejs({ email: email }, { email: { email: true } });
      if (error) {
        errors.push({ message: email + ' is not a valid email' });
      }
    });

    if (errors.length) {
      error[key] = errors;
      return error;
    }

    return null;
  } else if (_.isString(value)) {
    var emailError = validatejs({ email: value }, { email: { email: true } });
    if (emailError) {
      error[key] = { message: value + ' is not a valid email' };
      return error;
    }

    return null;
  } else {
    error[key] = { message: 'should be a String or Array of Strings' };
    return error;
  }
}

module.exports = {
  validateOptionalString: validateOptionalString,
  validateString: validateString,
  validateOptionalNumber: validateOptionalNumber,
  validateNumber: validateNumber,
  validateOptionalBoolean: validateOptionalBoolean,
  validateBoolean: validateBoolean,
  validateOptionalDate: validateOptionalDate,
  validateDate: validateDate,
  validateOptionalJSON: validateOptionalJSON,
  validateJSON: validateJSON,
  validateOptionalEmailConstraint: validateOptionalEmailConstraint,
  validateUUID: validateUUID,
  validateOptionalUUID: validateOptionalUUID
};
