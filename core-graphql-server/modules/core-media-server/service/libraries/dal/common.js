'use strict';

const _ = require('lodash');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');

module.exports = function init(connectionPools) {
  if (!connectionPools) {
    throw new Error('connectionPools is required');
  }

  if (!connectionPools.read) {
    throw new Error('connectionPools.read is required');
  }

  if (!connectionPools.write) {
    throw new Error('connectionPools.write is required');
  }

  return {
    connectionPools,
    query
  };

  /**
   * Performs a query
   * @param {Database} conn - an pgp database.
   * @return {Promise} a promise that resolves with the query result object
   * 						or rejects with an error message.
   */
  function query(conn, sql, values) {
    if (!conn) {
      return Promise.reject(new Error('conn is required'));
    }

    if (!sql) {
      return Promise.reject(new Error('sql is required'));
    }

    return conn.query(sql, values).catch(err => {
      if (err.code == 23503) {
        // postgres foreign key constraint violation
        let matches =
          err.detail && err.detail.match(/^Key \(([^)]+)\)=\(([^)]+)\)/);
        const validationErrs = [];

        if (matches && matches[1]) {
          const key = _.camelCase(matches[1]);

          validationErrs.push({
            [key]: 'invalid value: ' + matches[2]
          });
        }

        throw new BadRequestError(validationErrs);
      }

      if (err.code == 23505) {
        // postgres unique key violation
        throw new ResourceConflictError(err);
      }

      throw err;
    });
  }
};
