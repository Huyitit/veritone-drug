'use strict';
const chaiExpect = require('chai').expect;

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#GraphQLServiceInfo', function () {
  describe('#featureFlags', function () {
    it('returns config.featureFlags from serviceContext', function () {
      const flags = { newUI: true, betaSearch: false };
      const resolvers = require('./GraphQLServiceInfo.js')({
        config: { featureFlags: flags },
        monitoring: { getHeartbeatStats: jest.fn() }
      });
      chaiExpect(resolvers.featureFlags({})).to.equal(flags);
    });
  });

  describe('#heartbeatStats', function () {
    it('delegates to monitoring.getHeartbeatStats()', function () {
      const stats = { uptime: 12345, healthy: true };
      const monitoring = { getHeartbeatStats: jest.fn().mockReturnValue(stats) };
      const resolvers = require('./GraphQLServiceInfo.js')({
        config: { featureFlags: {} },
        monitoring
      });
      const result = resolvers.heartbeatStats({}, {}, {});
      chaiExpect(monitoring.getHeartbeatStats.mock.calls.length).to.equal(1);
      chaiExpect(result).to.equal(stats);
    });
  });
});
