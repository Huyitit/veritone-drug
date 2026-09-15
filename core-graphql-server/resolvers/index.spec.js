'use strict';
const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')();

const resolverModule = require('./index.js')(serviceContext);

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#index (resolver wrapper)', function () {
  describe('#wrapResolverMap', function () {
    it('exports wrapResolverMap as a function', function () {
      chaiExpect(typeof resolverModule.wrapResolverMap).to.equal('function');
    });
  });
});
