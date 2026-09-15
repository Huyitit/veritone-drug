'use strict';
const chaiExpect = require('chai').expect;

const resolvers = require('./MentionRating.js')();

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#MentionRating', function () {
  describe('#createdDateTime', function () {
    it('maps dateCreated to createdDateTime', function () {
      const ts = '2024-01-15T10:00:00Z';
      chaiExpect(resolvers.createdDateTime({ dateCreated: ts })).to.equal(ts);
    });
  });

  describe('#modifiedDateTime', function () {
    it('maps dateModified to modifiedDateTime', function () {
      const ts = '2024-01-16T11:00:00Z';
      chaiExpect(resolvers.modifiedDateTime({ dateModified: ts })).to.equal(ts);
    });
  });
});
