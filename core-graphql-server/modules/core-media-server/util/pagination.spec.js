'use strict';

const init = require('./pagination');

describe('util/pagination', function() {
  const pagingOptions = { defaultLimit: 20, maxLimit: 100 };
  let pagination;

  beforeEach(function() {
    pagination = init(pagingOptions);
  });

  describe('enforceParams()', function() {
    it('applies defaultLimit and offset=0 when params is empty', function() {
      const params = {};
      const result = pagination.enforceParams(params);

      expect(result.limit).toBe(pagingOptions.defaultLimit);
      expect(result.offset).toBe(0);
    });

    it('clamps limit to maxLimit when limit exceeds maxLimit', function() {
      const params = { limit: 200, offset: 10 };
      const result = pagination.enforceParams(params);

      expect(result.limit).toBe(pagingOptions.maxLimit);
    });
  });

  describe('toPaginationEnvelope()', function() {
    it('returns correct from/to/totalResults/results for a non-empty array', function() {
      const results = ['a', 'b', 'c'];
      const envelope = pagination.toPaginationEnvelope(results, 5, 50);

      expect(envelope).toEqual({
        from: 5,
        to: 7,
        totalResults: 50,
        results: ['a', 'b', 'c']
      });
    });
  });
});
