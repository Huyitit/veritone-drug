'use strict';
const chaiExpect = require('chai').expect;

const resolvers = require('./CognitiveSearchProfile.js')({});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#CognitiveSearchProfile', function () {
  describe('#jsondata', function () {
    it('returns the object unchanged (identity passthrough)', function () {
      const profile = { id: 'p-1', config: { threshold: 0.8 } };
      chaiExpect(resolvers.jsondata(profile)).to.equal(profile);
    });
  });
});
