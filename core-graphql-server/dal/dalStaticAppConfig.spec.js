const path = require('path');
const _ = require('lodash');
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');

describe('dalStaticAppConfig.js', function () {
  // Built once and reused across tests (full serviceContext construction is
  // expensive - ~35 DAL/BLL modules + caches). Tests here only mutate
  // serviceContext.config, which is already a require()-cache singleton
  // shared across tests in this file even under the old per-test rebuild, so
  // sharing the base context introduces no new behavior.
  const serviceContext = initializeServiceContext();
  const dal = require('./dalStaticAppConfig.js')(serviceContext);

  beforeEach(() => {
    serviceContext._clearAll();
    const suiteKey = path.relative(process.cwd(), expect.getState().testPath);
    global.serviceContextMap[suiteKey] = serviceContext;
  });

  describe('#getStaticAppConfig', function () {
    it('should return default values when configs are empty', function () {
      serviceContext.config.redis = {};
      serviceContext.config.featureFlags = serviceContext.config.featureFlags || {};
      serviceContext.config.apiRoot = undefined;

      const res = dal.getStaticAppConfig({}, {});

      expect(res.apiRoot).toEqual('https://api.veritone.com');
      expect(res.sessionTimeout).toEqual(60);
      expect(res.networkIsolated).toEqual(false);
      expect(res.controllerNodeRedImage).toEqual('registry.central.aiware.com/node-red-runner-v3:stable');
      expect(res.desktopAppUrl).toEqual(null);
    });

    it('should return sessionTimeout from redis.ttl when it is a number', function () {
      serviceContext.config.redis = {
        ttl: 120
      };
      const res = dal.getStaticAppConfig({}, {});
      expect(res.sessionTimeout).toEqual(120);
    });

    it('should convert string redis.ttl to number for sessionTimeout', function () {
      serviceContext.config.redis = {
        ttl: '300'
      };
      const res = dal.getStaticAppConfig({}, {});
      expect(res.sessionTimeout).toEqual(300);
      expect(typeof res.sessionTimeout).toEqual('number');
    });

    it('should return networkIsolated from featureFlags', function () {
      serviceContext.config.featureFlags = {
        networkIsolated: true
      };
      const res = dal.getStaticAppConfig({}, {});
      expect(res.networkIsolated).toEqual(true);
    });

    it('should return custom appUrls', function () {
      serviceContext.config.appUris = {
        adminAppUrl: 'https://admin.custom.com',
        automateAppUrl: 'https://automate.custom.com',
        desktopAppUrl: 'https://desktop.custom.com'
      };
      const res = dal.getStaticAppConfig({}, {});
      expect(res.desktopAppUrl).toEqual('https://desktop.custom.com');
      expect(res.adminAppUrl).toEqual('https://admin.custom.com');
      expect(res.automateUrl).toEqual('https://automate.custom.com');
    });
  });
});
