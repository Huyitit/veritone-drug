'use strict';
const chaiExpect = require('chai').expect;
const jestExpect = globalThis.expect;

const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

describe('#cache', () => {
  describe('when resolverCacheEnabled = true', () => {
    let cache;

    beforeEach(() => {
      serviceContext.config.server = { resolverCacheEnabled: true };
      cache = require('./cache.js')(serviceContext);
    });

    it('initializes _objectCache on requestContext on first call', async () => {
      const requestContext = {};
      const getFunction = jest.fn().mockReturnValue('result');

      await cache.get(requestContext, { id: '1' }, 'User', getFunction);

      chaiExpect(requestContext._objectCache).to.be.an('object');
    });

    it('calls getFunction once on cache miss and returns its value', async () => {
      const requestContext = {};
      const mockResult = { id: 'user-1' };
      const getFunction = jest.fn().mockReturnValue(mockResult);

      const result = await cache.get(requestContext, { id: '1' }, 'User', getFunction);

      chaiExpect(result).to.deep.equal(mockResult);
      jestExpect(getFunction).toHaveBeenCalledTimes(1);
    });

    it('returns cached value on second call without calling getFunction again', async () => {
      const requestContext = {};
      const mockResult = { id: 'user-1' };
      const getFunction = jest.fn().mockReturnValue(mockResult);

      await cache.get(requestContext, { id: '1' }, 'User', getFunction);
      const result = await cache.get(requestContext, { id: '1' }, 'User', getFunction);

      chaiExpect(result).to.deep.equal(mockResult);
      jestExpect(getFunction).toHaveBeenCalledTimes(1);
    });

    it('generates separate cache entries for different objectType + params combinations', async () => {
      const requestContext = {};
      const result1 = { id: 'user-1' };
      const result2 = { id: 'engine-1' };
      const fn1 = jest.fn().mockReturnValue(result1);
      const fn2 = jest.fn().mockReturnValue(result2);

      const r1 = await cache.get(requestContext, { id: '1' }, 'User', fn1);
      const r2 = await cache.get(requestContext, { id: '1' }, 'Engine', fn2);

      chaiExpect(r1).to.deep.equal(result1);
      chaiExpect(r2).to.deep.equal(result2);
      jestExpect(fn1).toHaveBeenCalledTimes(1);
      jestExpect(fn2).toHaveBeenCalledTimes(1);
    });

    it('stores cache on requestContext so two requests do not share each other\'s cache', async () => {
      const requestContext1 = {};
      const requestContext2 = {};
      const fn1 = jest.fn().mockReturnValue('result-for-ctx1');
      const fn2 = jest.fn().mockReturnValue('result-for-ctx2');

      await cache.get(requestContext1, { id: '1' }, 'User', fn1);
      await cache.get(requestContext2, { id: '1' }, 'User', fn2);

      // fn2 must have been called — requestContext2 had no prior cache entry
      jestExpect(fn2).toHaveBeenCalledTimes(1);
      chaiExpect(requestContext1._objectCache).to.not.equal(requestContext2._objectCache);
    });
  });

  describe('when resolverCacheEnabled = false', () => {
    let cache;

    beforeEach(() => {
      serviceContext.config.server = { resolverCacheEnabled: false };
      cache = require('./cache.js')(serviceContext);
    });

    it('calls getFunction on every invocation without caching', async () => {
      const requestContext = {};
      const getFunction = jest.fn().mockReturnValue('value');

      await cache.get(requestContext, { id: '1' }, 'User', getFunction);
      await cache.get(requestContext, { id: '1' }, 'User', getFunction);

      jestExpect(getFunction).toHaveBeenCalledTimes(2);
    });
  });
});
