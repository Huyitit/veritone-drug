'use strict';

var CAMEL_REGEX = /_([a-zA-Z0-9])/g;

module.exports = function toCamelCase(dbKey) {
  if (typeof dbKey !== 'string') {
    throw new Error('Key should be a string');
  }
  return dbKey.replace(CAMEL_REGEX, function replace(match) {
    return match[1].toUpperCase();
  });
};
