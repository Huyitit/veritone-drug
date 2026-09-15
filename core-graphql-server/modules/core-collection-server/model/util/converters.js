'use strict';

var _ = require('lodash');

function convertOneOrManyCommaDelimitedString(value, src, dst, key) {
  if (!_.has(src, key)) {
    return;
  }

  if (_.isString(value) && value !== '') {
    value = value.split(',');
  }

  dst[key] = _.map(value, function removeSpaces(item) {
    return item.trim();
  });
}

function convertOneOrManyCommaDelimitedNumber(value, src, dst, key) {
  if (!_.has(src, key)) {
    return;
  }

  if (_.isString(value) && value !== '') {
    value = value.split(',');
  }

  if (!Array.isArray(value)) {
    return;
  }

  dst[key] = value.map(function convertToNumber(item) {
    return parseFloat(item);
  });
}

module.exports = {
  convertOneOrManyCommaDelimitedString: convertOneOrManyCommaDelimitedString,
  convertOneOrManyCommaDelimitedNumber: convertOneOrManyCommaDelimitedNumber
};
