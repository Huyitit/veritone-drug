'use strict';

module.exports = function createPg(pools, schemaName) {
  const humps = require('humps');

  function execute(sql, params, callback) {
    if (!callback && typeof params === 'function') {
      callback = params;
      params = undefined;
    }
    return pools.core
      .query(sql, params)
      .then((dbResult) => {
        callback(null, dbResult);
      })
      .catch((err) => callback(err, null));
  }

  function executeRead(sql, params, callback) {
    return execute(sql, params, callback);
  }

  function executeWrite(sql, params, callback) {
    return execute(sql, params, callback);
  }

  function getSchemaName() {
    return schemaName;
  }

  function camelizeRootKeys(input) {
    if (typeof input !== 'object') {
      throw new Error('Missing input!');
    }

    var output = {};
    Object.keys(input).forEach(function forEachKey(key) {
      output[humps.camelize(key)] = input[key];
    });

    return output;
  }

  function decamelizeRootKeys(input) {
    if (typeof input !== 'object') {
      throw new Error('Missing input!');
    }

    var output = {};
    Object.keys(input).forEach(function forEachKey(key) {
      output[humps.decamelize(key)] = input[key];
    });

    return output;
  }

  return {
    execute: execute,
    executeRead: executeRead,
    executeWrite: executeWrite,
    getSchemaName: getSchemaName,
    camelizeRootKeys: camelizeRootKeys,
    decamelizeRootKeys: decamelizeRootKeys
  };
};
