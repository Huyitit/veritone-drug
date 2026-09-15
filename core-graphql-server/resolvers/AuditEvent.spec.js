'use strict';
const chaiExpect = require('chai').expect;

const resolvers = require('./AuditEvent.js')({});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#AuditEvent', function () {
  describe('#organizationId', function () {
    it('extracts organizationId from the nested audit object', function () {
      const obj = { audit: { organizationId: 'org-123', userId: 'u-1', application: 'app-1' } };
      chaiExpect(resolvers.organizationId(obj)).to.equal('org-123');
    });

    it('returns undefined when audit is absent', function () {
      chaiExpect(resolvers.organizationId({})).to.be.undefined;
    });
  });

  describe('#userId', function () {
    it('extracts userId from the nested audit object', function () {
      const obj = { audit: { userId: 'u-42' } };
      chaiExpect(resolvers.userId(obj)).to.equal('u-42');
    });
  });
});
