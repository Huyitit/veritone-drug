'use strict';
const chaiExpect = require('chai').expect;

// Must precede require('./Watchlist.js') — transform:{} disables auto-hoisting
jest.mock('./util.js', () => () => ({}));
jest.mock('../util.js', () => () => ({}));

const resolvers = require('./Watchlist.js')({
  dal: { structuredData: {} }
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Watchlist', function () {
  describe('#searchIndex', function () {
    it('returns "mine" when searchIndex is true', function () {
      chaiExpect(resolvers.searchIndex({ searchIndex: true })).to.equal('mine');
    });

    it('returns "global" when searchIndex is false', function () {
      chaiExpect(resolvers.searchIndex({ searchIndex: false })).to.equal('global');
    });
  });

  describe('#sourceTypeIds', function () {
    it('merges sourceTypeId into sourceTypeIds when not already present', function () {
      const result = resolvers.sourceTypeIds({ sourceTypeIds: ['a'], sourceTypeId: 'b' });
      chaiExpect(result).to.deep.equal(['a', 'b']);
    });

    it('does not duplicate sourceTypeId when already in sourceTypeIds', function () {
      const result = resolvers.sourceTypeIds({ sourceTypeIds: ['a', 'b'], sourceTypeId: 'b' });
      chaiExpect(result).to.deep.equal(['a', 'b']);
    });
  });
});
