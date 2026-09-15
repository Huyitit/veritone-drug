'use strict';
const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')();

const resolvers = require('./NielsenTVData.js')(serviceContext);

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#NielsenTVData', function () {
  describe('#decoratorsString', function () {
    it('returns JSON string of decorators when present', function () {
      const obj = { decorators: { key: 'val' } };
      chaiExpect(resolvers.decoratorsString(obj, {})).to.equal('{"key":"val"}');
    });

    it('returns empty-object JSON when decorators is absent', function () {
      chaiExpect(resolvers.decoratorsString({}, {})).to.equal('{}');
    });
  });

  describe('#demographicsString', function () {
    it('returns JSON string of demographics when present', function () {
      const obj = { demographics: { age: '18-24' } };
      chaiExpect(resolvers.demographicsString(obj, {})).to.equal('{"age":"18-24"}');
    });
  });
});
