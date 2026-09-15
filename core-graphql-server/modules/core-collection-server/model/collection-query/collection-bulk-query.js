'use strict';

var _ = require('lodash');
var createModel = require('../util/create-model'),
  converters = require('../util/converters');

function validateCollectionId(value, attributes, key) {
  var error = {};

  if (!_.has(attributes, key)) {
    error[key] = {
      message:
        'should be a String, Number, Array of Strings or Array of Numbers'
    };
  }

  if (Array.isArray(value) && value.length) {
    var errors = [];
    value.forEach(function validateCollectionId(collectionId) {
      if (
        _.isNumber(collectionId) &&
        !_.isNaN(collectionId) &&
        collectionId !== Number.POSITIVE_INFINITY &&
        collectionId !== Number.NEGATIVE_INFINITY
      ) {
        return null;
      }

      errors.push({ message: 'should be a Number' });
    });

    if (errors.length) {
      error[key] = errors;
      return error;
    }

    return null;
  } else {
    error[key] = { message: 'should be a String or Array of Strings' };
    return error;
  }
}

var CollectionBulkQuery = createModel({
  collectionId: {
    type: '*',
    convert: converters.convertOneOrManyCommaDelimitedNumber,
    validate: validateCollectionId
  },
  organizationId: {
    type: 'string',
    validate: {
      length: {
        minimum: 1
      },
      presence: true
    }
  }
});

module.exports = CollectionBulkQuery;
