'use strict';

var UPPER_CASE_REGEX = /([A-Z])/g;

module.exports = function toUnderscore(fieldKey) {
  if (typeof fieldKey !== 'string') {
    throw new Error('Key should be a string');
  }
  return fieldKey.replace(UPPER_CASE_REGEX, function replace(match) {
    return '_' + match.toLowerCase();
  });
};
