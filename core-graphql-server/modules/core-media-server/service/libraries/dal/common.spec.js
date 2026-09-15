/* global describe, it, expect, beforeEach */
/* eslint func-names:off */

'use strict';

const _ = require('lodash');
const ResourceConflictError = require('@veritone/core-server-base/errors/resourceConflictError');
const BadRequestError = require('@veritone/core-server-base/errors/badRequestError');

// common.js does NOT use pg directly — it accepts a connectionPools object and
// calls conn.query(sql, values) directly. The pg.Pool/Client mock from the
// original spec was written against an older version of common.js that had
// dbConnect/beginTransaction. Those functions no longer exist in the source.
// Tests for the removed API are skipped with TODO(VE-24502 follow-up).

const commonDal = require('./common');

describe('libraries.dal.common:', function() {
  let dal, queryError, queryResult;
  let mockConn;

  const connectionPools = {
    read: { query: _.noop },
    write: { query: _.noop }
  };

  beforeEach(function() {
    queryError = null;
    queryResult = { rows: [], rowCount: 0 };

    mockConn = {
      query: jest.fn().mockImplementation(function() {
        if (queryError) {
          return Promise.reject(queryError);
        }
        return Promise.resolve(queryResult);
      })
    };

    dal = commonDal(connectionPools);
  });

  it('should return a function', function() {
    expect(commonDal).toEqual(expect.any(Function));
  });

  it('should throw errors if called with arguments missing', function() {
    expect(() => commonDal()).toThrow('connectionPools is required');
    expect(() => commonDal({})).toThrow('connectionPools.read is required');
    expect(() => commonDal({ read: {} })).toThrow(
      'connectionPools.write is required'
    );
  });

  it('should export an object containing query function when initialized', function() {
    expect(dal).toEqual(
      expect.objectContaining({
        query: expect.any(Function)
      })
    );
  });

  // TODO(VE-24502 follow-up): dbConnect was removed from common.js in a refactor;
  // it.skip preserves the test intent without incorrectly failing.
  it.skip('should export dbConnect when initialized', function() {});
  it.skip('dbConnect: should return a promise', function() {});
  it.skip('dbConnect: should reject if the connection fails', function() {});
  it.skip('dbConnect: should resolve with client + release on success', function() {});
  it.skip('dbConnect: should use the read pool by default', function() {});
  it.skip('dbConnect: should use a provided pool argument', function() {});

  // TODO(VE-24502 follow-up): beginTransaction was removed from common.js in a refactor.
  it.skip('beginTransaction: should return a promise', function() {});
  it.skip('beginTransaction: should get write pool connection and return transaction', function() {});
  it.skip('beginTransaction: commit() should COMMIT and release', function() {});
  it.skip('beginTransaction: rollback() should ROLLBACK and release', function() {});

  describe('query', function() {
    it('should return a promise', function() {
      const promise = dal.query(mockConn, 'select 1');
      expect(promise instanceof Promise).toBe(true);
      promise.catch(_.noop);
    });

    it('should return a rejected promise if called without a connection argument', function() {
      return expect(dal.query(null, 'select 1')).rejects.toThrow(
        'conn is required'
      );
    });

    it('should return a rejected promise if called without a sql argument', function() {
      return expect(dal.query(mockConn)).rejects.toThrow('sql is required');
    });

    it('should call conn.query with sql and values', function() {
      return dal.query(mockConn, 'select $1', ['val']).then(function() {
        expect(mockConn.query).toHaveBeenCalledWith('select $1', ['val']);
      });
    });

    it('should resolve with the query result when successful', function() {
      return dal.query(mockConn, 'select 1').then(function(result) {
        expect(result).toBe(queryResult);
      });
    });

    it('should reject and propagate the error when the query fails', function() {
      queryError = new Error('i failed');
      return dal.query(mockConn, 'select 1').then(
        function() {
          throw new Error('expected rejection');
        },
        function(err) {
          expect(err).toBe(queryError);
        }
      );
    });

    it('should reject with a ResourceConflictError when the query returns a duplicate key error (code: 23505)', function() {
      queryError = new Error('conflict');
      queryError.code = 23505;

      return dal.query(mockConn, 'select 1').then(
        function() {
          throw new Error('expected rejection');
        },
        function(err) {
          expect(err).toEqual(expect.any(ResourceConflictError));
          expect(err.message).toEqual('conflict');
        }
      );
    });

    it('should reject with a BadRequestError when the query returns a foreign key constraint error (code 23503)', function() {
      queryError = new Error('foreign key error');
      queryError.code = 23503;

      return dal.query(mockConn, 'select 1').then(
        function() {
          throw new Error('expected rejection');
        },
        function(err) {
          expect(err).toEqual(expect.any(BadRequestError));
          expect(err.message).toEqual('Bad Request');
          expect(err.errors.length).toBe(0);
        }
      );
    });

    it('should reject with a BadRequestError containing the foreign key violation when details are available', function() {
      queryError = new Error('foreign key error');
      queryError.code = 23503;
      queryError.detail = 'Key (some_field)=(some_value)';

      return dal.query(mockConn, 'select 1').then(
        function() {
          throw new Error('expected rejection');
        },
        function(err) {
          expect(err).toEqual(expect.any(BadRequestError));
          expect(err.message).toEqual('Bad Request');
          expect(err.errors.length).toBe(1);
          expect(err.errors[0]).toEqual(
            expect.objectContaining({
              someField: 'invalid value: some_value'
            })
          );
        }
      );
    });
  });
});
