'use strict';
const chaiExpect = require('chai').expect;

const serviceContext = require('../test/serviceContext.mock.js')();

const resolvers = require('./LibrarySummary.js')(serviceContext);

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#LibrarySummary', function () {
  describe('#lastTrainedDateTime', function () {
    it('returns null when lastTrainedDateTime is nil', function () {
      chaiExpect(resolvers.lastTrainedDateTime({ lastTrainedDateTime: null })).to.be.null;
    });

    it('converts epoch-seconds to epoch-milliseconds', function () {
      chaiExpect(resolvers.lastTrainedDateTime({ lastTrainedDateTime: 1000 })).to.equal(1000000);
    });
  });
});
