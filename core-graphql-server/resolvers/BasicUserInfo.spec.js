'use strict';
const chaiExpect = require('chai').expect;

// cgql jest runs with transform:{} → jest.mock is NOT hoisted; declare the mock
// before requiring the module under test. VE-25066: BasicUserInfo.imageUrl now
// delivers via getSignedUrlOrVirtual (flag-gated stateless virtual URI).
const mockGetSignedUrlOrVirtual = jest.fn();
jest.mock('./util.js', () => () => ({
  getSignedUrlOrVirtual: mockGetSignedUrlOrVirtual
}));

const serviceContext = require('../test/serviceContext.mock.js')();

const resolvers = require('./BasicUserInfo.js')(serviceContext);

beforeEach(() => {
  mockGetSignedUrlOrVirtual.mockReset();
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#BasicUserInfo', function () {
  describe('#firstName', function () {
    it('returns kvp.firstName when present', function () {
      chaiExpect(resolvers.firstName({ kvp: { firstName: 'Alice' }, firstName: 'Bob' })).to.equal('Alice');
    });

    it('falls back to top-level firstName when kvp.firstName is absent', function () {
      chaiExpect(resolvers.firstName({ firstName: 'Bob' })).to.equal('Bob');
    });
  });

  describe('#lastName', function () {
    it('returns kvp.lastName when present', function () {
      chaiExpect(resolvers.lastName({ kvp: { lastName: 'Smith' }, lastName: 'Jones' })).to.equal('Smith');
    });
  });

  describe('#imageUrl', function () {
    it('delivers kvp.image via getSignedUrlOrVirtual (VE-25066)', function () {
      mockGetSignedUrlOrVirtual.mockReturnValue('https://virtual/avatar');
      const res = resolvers.imageUrl({ kvp: { image: 'img-key' } });
      chaiExpect(mockGetSignedUrlOrVirtual.mock.calls[0][0]).to.equal('img-key');
      chaiExpect(res).to.equal('https://virtual/avatar');
    });

    it('falls back to top-level imageUrl when kvp.image is absent', function () {
      mockGetSignedUrlOrVirtual.mockReturnValue('https://virtual/avatar');
      resolvers.imageUrl({ imageUrl: 'top-key' });
      chaiExpect(mockGetSignedUrlOrVirtual.mock.calls[0][0]).to.equal('top-key');
    });
  });
});
