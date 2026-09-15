'use strict';

var _ = require('lodash');
var validators = require('./util/validators');

module.exports = require('./util/create-model')({
  startDate: {
    type: 'date',
    validate: function validateDateRangeStartDate(value, attributes, key) {
      if (!_.has(attributes, key) || _.isNull(value)) {
        return null;
      }
      var validationError = validators.validateDate(value, attributes, key);
      if (validationError) {
        return validationError;
      }
      if (value >= new Date()) {
        validationError = {};
        validationError[key] = {
          message: 'should be before the current date/time'
        };
        return validationError;
      }
      // ensure startDate is before endDate (if endDate is present/valid):
      if (
        _.has(attributes, 'endDate') &&
        !_.isNull(attributes.endDate) &&
        !validators.validateDate(attributes.endDate, attributes, 'endDate') &&
        value > attributes.endDate
      ) {
        validationError = {};
        validationError[key] = {
          message: 'should be before or equal to endDate'
        };
        return validationError;
      }

      return null;
    }
  },
  endDate: {
    type: 'date',
    validate: function validateDateRangeEndDate(value, attributes, key) {
      if (!_.has(attributes, key) || _.isNull(value)) {
        return null;
      }
      var validationError = validators.validateDate(value, attributes, key);
      if (validationError) {
        return validationError;
      }
      if (value >= new Date()) {
        validationError = {};
        validationError[key] = {
          message: 'should be before the current date/time'
        };
        return validationError;
      }

      return null;
    }
  }
});
