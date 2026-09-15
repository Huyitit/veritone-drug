const _ = require('lodash');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

serviceContext.redisCache = {
  isCacheDirty: () => true,
  markCacheDirty: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  asyncSet: jest.fn(),
  clear: jest.fn(),
  incr: jest.fn(),
  incrBy: jest.fn(),
  incrByFloat: jest.fn(),
  decr: jest.fn(),
  multiExec: jest.fn()
};

_.set(
  serviceContext,
  'config.s3.fileId',
  'NPIEpAIBAAKCAQEAqCrrzfGpgFk4raHeTa1t6SIkYuaEYctBPmldlgonbGySf/1QA8v0Vajnt1D+4+TBK5lz6hBC466iBa+q3fJsWP9pkPE36irT8T6UXZZk6bJbeI'
);
const dal = require('./organization.js')(serviceContext),
  mpDbWrite = serviceContext.dbConnections['media_platform'].write,
  mpDbRead = serviceContext.dbConnections['media_platform'].read;

const organizationId = 7682,
  integrationId = 'some name',
  config = {
    testField: 'some value'
  };

describe('organization', () => {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(38);
      expect(dal.getEngineWhitelist).toEqual(expect.any(Function));
      expect(dal.getEngineBlacklist).toEqual(expect.any(Function));
      expect(dal.setEngineBlacklist).toEqual(expect.any(Function));
      expect(dal.setEngineWhitelist).toEqual(expect.any(Function));
      expect(dal.deleteFromEngineBlacklist).toEqual(expect.any(Function));
      expect(dal.deleteFromEngineWhitelist).toEqual(expect.any(Function));
      expect(dal.addToEngineBlacklist).toEqual(expect.any(Function));
      expect(dal.addToEngineWhitelist).toEqual(expect.any(Function));
      expect(dal.getGroupIdForOrgId).toEqual(expect.any(Function));
      expect(dal.getOrgIdForGroupId).toEqual(expect.any(Function));
      expect(dal.getOrgIdFromAppId).toEqual(expect.any(Function));
      expect(dal.getOrganization).toEqual(expect.any(Function));
      expect(dal.getMyOrganizations).toEqual(expect.any(Function));
      expect(dal.getUserCountForOrg).toEqual(expect.any(Function));
      expect(dal.getBlacklistForOrg).toEqual(expect.any(Function));
      expect(dal.setOrganizationIntegrationConfig).toEqual(
        expect.any(Function)
      );
      expect(dal.deleteOrganizationIntegrationConfig).toEqual(
        expect.any(Function)
      );
      expect(dal.getOrganizationIntegrationConfig).toEqual(
        expect.any(Function)
      );
      expect(dal.getDefaultAddToIndexForOrg).toEqual(expect.any(Function));
      expect(dal.getOrganizationIdAndGuidForUser).toEqual(expect.any(Function));
    });
  });

  describe('#getOrganization', function () {
    let context = {};

    it('should get organization detail from database and redis cache is set if skipCache = true', async function () {
      let err, res;
      context = mockUtil.makeContext();
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '1234',
          guid: '00000000-1234-0000-0000-000000000000'
        },
        {
          id: '5678',
          guid: '00000000-5678-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: 1234,
            organizationName: 'Test Org'
          }
        ],
        false,
        []
      );

      try {
        res = await dal.getOrganization(
          context,
          {
            id: 1234
          },
          true
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(1234);
      expect(serviceContext.redisCache.get).not.toHaveBeenCalled();
      expect(serviceContext.redisCache.set).toHaveBeenCalled();
    });

    it('should get organization detail from cache', async function () {
      let err, res;
      context = mockUtil.makeContext();
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '1234',
          guid: '00000000-1234-0000-0000-000000000000'
        },
        {
          id: '5678',
          guid: '00000000-5678-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: 1234,
            organizationName: 'Test Org'
          }
        ],
        false,
        []
      );

      try {
        res = await dal.getOrganization(context, {
          id: 1234
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(1234);
      expect(serviceContext.redisCache.get).toHaveBeenCalled();
    });
  });

  describe('#getOrganizationIntegrationConfig', function () {
    let context = {};

    it('should get Integration config with userVisible is true and apiToken in org', async function () {
      let err, res;
      const userVisible = true;

      // mock value
      context = mockUtil.getGraphQLContext(null, 'api_org');
      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is true and userToken in org', async function () {
      let err, res;
      const userVisible = true;

      // mock value
      context = getGraphQLContext('user');
      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is true and userToken (with no functional permissions) in org', async function () {
      let err, res;
      const userVisible = true;
      // mock value
      context = mockUtil.makeContext({ authRole: 'regularUser' });
      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);
      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is true and superadmin', async function () {
      let err, res;
      const userVisible = true;
      context = getGraphQLContext('user');

      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is false and apiToken in org', async function () {
      let err, res;
      const userVisible = false;

      // mock value
      context = mockUtil.getGraphQLContext(null, 'api_org');
      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is false and superadmin', async function () {
      let err, res;
      const userVisible = false;

      context = getGraphQLContext('user');

      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is false and internal token', async function () {
      let err, res;
      const userVisible = false;

      // mock value
      context = mockUtil.getGraphQLContext(null, 'api_internal');

      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should get Integration config with userVisible is false and engineJWT token', async function () {
      let err, res;
      const userVisible = false;

      // mock value
      context = mockUtil.getGraphQLContext(null, 'engineJWT');

      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId
        });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });

    it('should throw invalid_input error if integrationId is not a string', async function () {
      let err, res;
      const userVisible = true;

      // mock value
      context = getGraphQLContext('user');
      mpDbRead._push([
        {
          organization_id: organizationId,
          integration_id: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: 123,
          organizationId
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw not_found err if apiToken of other org', async function () {
      let err, res;

      // mock value
      context = getGraphQLContext(null, 'api_org');
      context._authInfo.organization = { organizationId: 123 };
      mpDbRead._push([]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId: 123
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeTruthy();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should throw not_allowed err if userVisible is false and userToken', async function () {
      let err, res;

      // mock value
      context = getGraphQLContext('user');
      mpDbRead._push([]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId: organizationId
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeTruthy();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should throw not_allowed err if userVisible is false and apiToken of other org', async function () {
      let err, res;

      // mock value
      context = getGraphQLContext(null, 'api_org');
      mpDbRead._push([]);

      try {
        res = await dal.getOrganizationIntegrationConfig(context, {
          integrationId: integrationId,
          organizationId: 123
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeTruthy();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });
  });

  describe('#setOrganizationIntegrationConfig', function () {
    let context = {};
    const userVisible = true;

    it('should throw error invalid input when integrationId is not a string', async function () {
      let res, err;
      context = getGraphQLContext('user');

      try {
        res = await dal.setOrganizationIntegrationConfig(context, {
          input: {
            organizationId: organizationId,
            integrationId: 123,
            config: config,
            userVisible: userVisible
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error not_allow when not a superadmin', async function () {
      let res, err;
      context = mockUtil.makeContext({ authRole: 'regularUser' });

      try {
        res = await dal.setOrganizationIntegrationConfig(context, {
          input: {
            organizationId: organizationId,
            integrationId: integrationId,
            config: config,
            userVisible: userVisible
          }
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('not_allowed');
    });

    it('should set config', async function () {
      let res, err;

      context = mockUtil.makeContext();
      mpDbWrite._push([
        {
          organizationId: organizationId,
          integrationId: integrationId,
          config: config,
          userVisible: userVisible
        }
      ]);

      try {
        res = await dal.setOrganizationIntegrationConfig(context, {
          input: {
            organizationId: organizationId,
            integrationId: integrationId,
            config: config,
            userVisible: userVisible
          }
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.config).toEqual(config);
      expect(res.userVisible).toEqual(userVisible);
    });
  });

  describe('#deleteOrganizationIntegrationConfig()', function () {
    it('should delete organization integration config', async function () {
      let res, err;
      let message = 'Delete integration config successfully!';
      const context = mockUtil.makeContext();

      let args = {
        input: {
          organizationId: organizationId,
          integrationId: integrationId
        }
      };
      mpDbWrite._push([
        {
          organizationId: organizationId,
          integrationId: integrationId,
          message: message
        }
      ]);
      try {
        res = await dal.deleteOrganizationIntegrationConfig(context, args);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(typeof res).toEqual('object');
      expect(res.organizationId).toEqual(organizationId);
      expect(res.integrationId).toEqual(integrationId);
      expect(res.message).toEqual(message);
    });
  });

  describe('#setOrgOktaConfiguration', function () {
    // scripts/encryptOkta.js utility is useful for writing and
    // debugging these tests. note that the encryption key is
    // s3.fileId in testServer.json
    const regex = /^[A-Za-z0-9+/]+={0,2}::[A-Za-z0-9+/]+={0,2}$/;

    it('should set org okta configuration - enable', async function () {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 7682
          }
        ],
        true,
        [],
        (sql, vars) => {
          expect(vars[0]).toEqual(7682);
          // make sure we didn't overwrite other kvp
          expect(vars[1]).toEqual({
            foo: 'baz',
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: true,
                loginAlias: 'test-alias'
              }
            }
          });
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual('okta');
          expect(vars[1]).toEqual('okta-credential.7682');
          // vars[2] is encrypted content
          expect(vars[3]).toEqual('okta-credential.7682');
          expect(vars[4]).toEqual(7682);
          return true;
        }
      );
      const context = mockUtil.makeContext();

      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              }
            },
            foo: 'baz'
          }
        },
        {
          oktaAuthenticationEnabled: true,
          clientSecret: 'secret123',
          clientId: 'client123',
          loginAlias: 'test-alias'
        }
      );
      expect(res).toBeTruthy();
    });

    it('should set org okta configuration - id/secret only', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad80408522be0ebd6ec9e44b3a2483f68417'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual('okta');
          expect(vars[1]).toEqual('okta-credential.7682');
          // vars[2] is encrypted content
          expect(vars[3]).toEqual('okta-credential.7682');
          expect(vars[4]).toEqual(7682);
          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: true
              }
            },
            foo: 'baz'
          }
        },
        {
          clientSecret: 'secret123',
          clientId: 'client123'
        }
      );
      expect(res).toBeTruthy();
    });

    it('should set org okta configuration - secret only', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad80408522be0ebd6ec9e44b3a2483f68417'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual('okta');
          expect(vars[1]).toEqual('okta-credential.7682');
          // vars[2] is encrypted content.
          expect(vars[2]).toMatch(regex);
          expect(vars[3]).toEqual('okta-credential.7682');
          expect(vars[4]).toEqual(7682);
          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: true
              }
            },
            foo: 'baz'
          }
        },
        {
          clientSecret: 'secret1234'
        }
      );
      expect(res).toBeTruthy();
    });

    it('should set org okta configuration - domain only', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual('okta');
          expect(vars[1]).toEqual('okta-credential.7682');
          // vars[2] is encrypted content.
          expect(vars[2]).toMatch(regex);
          expect(vars[3]).toEqual('okta-credential.7682');
          expect(vars[4]).toEqual(7682);
          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: true
              }
            },
            foo: 'baz'
          }
        },
        {
          oktaDomain: 'test2.okta.com'
        }
      );
      expect(res).toBeTruthy();

      expect(
        serviceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
      expect(
        serviceContext.dbConnections['media_platform'].read._resultQueueSize()
      ).toEqual(0);
    });

    it('should set org okta configuration - id only', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad80408522be0ebd6ec9e44b3a2483f68417'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual('okta');
          expect(vars[1]).toEqual('okta-credential.7682');
          // vars[2] is encrypted content. this is {"clientId": "client1234", "clientSecret": "secret123"}
          expect(vars[2]).toMatch(regex);
          expect(vars[3]).toEqual('okta-credential.7682');
          expect(vars[4]).toEqual(7682);
          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: true,
                clientSecret: 'secret123',
                clientId: 'client123',
                oktaDomain: 'test.okta.com'
              }
            },
            foo: 'baz'
          }
        },
        {
          clientId: 'client1234'
        }
      );
      expect(res).toBeTruthy();
    });

    it('should set org okta configuration - disable', async function () {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 7682
          }
        ],
        true,
        [],
        (sql, vars) => {
          expect(vars[0]).toEqual(7682);
          // make sure we didn't overwrite other kvp
          expect(vars[1]).toEqual({
            foo: 'baz',
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: false
              }
            }
          });
          return true;
        }
      );

      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: 7682,
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              }
            },
            foo: 'baz'
          }
        },
        {
          oktaAuthenticationEnabled: false
        }
      );
      expect(res).toBeTruthy();
    });

    it('should set org okta configuration - disable, string form id', async function () {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 7682
          }
        ],
        true,
        [],
        (sql, vars) => {
          expect(vars[0]).toEqual('7682');
          // make sure we didn't overwrite other kvp
          expect(vars[1]).toEqual({
            foo: 'baz',
            features: {
              foo: {
                bar: 'enabled'
              },
              oktaAuthentication: {
                enabled: false
              }
            }
          });
          return true;
        }
      );

      const context = mockUtil.makeContext();
      const res = await dal.setOrgOktaConfiguration(
        context,
        {
          id: '7682',
          kvp: {
            features: {
              foo: {
                bar: 'enabled'
              }
            },
            foo: 'baz'
          }
        },
        {
          oktaAuthenticationEnabled: false
        }
      );
      expect(res).toBeTruthy();
    });

    it('should error on different org', async function () {
      try {
        await dal.setOrgOktaConfiguration(
          mockUtil.makeContext(),
          {
            id: 1111
          },
          {
            oktaAuthenticationEnabled: true
          }
        );
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });
    it('should error on attempt to set credentials but disable', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      try {
        await dal.setOrgOktaConfiguration(
          mockUtil.makeContext(),
          {
            id: 7682,
            kvp: {
              features: {
                oktaAuthentication: {
                  enabled: true
                }
              }
            }
          },
          {
            oktaAuthenticationEnabled: false,
            clientSecret: 'secret123',
            clientId: 'client123',
            oktaDomain: 'test.okta.com'
          }
        );
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error on attempt to set credentials but previously disabled', async function () {
      try {
        await dal.setOrgOktaConfiguration(
          mockUtil.makeContext(),
          {
            id: 7682,
            kvp: {
              features: {
                oktaAuthentication: {
                  enabled: false
                }
              }
            }
          },
          {
            clientSecret: 'secret123',
            clientId: 'client123',
            oktaDomain: 'test.okta.com'
          }
        );
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
  });

  describe('#getOrgOktaConfiguration', function () {
    it('should get org okta config - disabled', async function () {
      const res = await dal.getOrgOktaConfiguration(mockUtil.makeContext(), {
        id: 7682,
        kvp: {
          features: {
            oktaAuthentication: {
              enabled: false
            }
          }
        }
      });
      expect(res).toEqual({
        oktaAuthenticationEnabled: false,
        clientId: undefined,
        clientSecret: undefined,
        oktaDomain: undefined,
        loginAlias: undefined
      });
    });
    it('should get org okta config - enabled, has creds', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      const res = await dal.getOrgOktaConfiguration(mockUtil.makeContext(), {
        id: 7682,
        kvp: {
          features: {
            oktaAuthentication: {
              enabled: true,
              loginAlias: 'testAlias'
            }
          }
        }
      });
      expect(res.clientId).toEqual('client123');
      expect(res.clientSecret).toEqual('secret123');
      expect(res.oktaDomain).toEqual('test.okta.com');
      expect(res.oktaAuthenticationEnabled).toEqual(true);
      expect(res.loginAlias).toEqual('testAlias');
    });
    it('should get org okta config - enabled, no creds', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      const res = await dal.getOrgOktaConfiguration(getGraphQLContext(), {
        id: 7682,
        kvp: {
          features: {
            oktaAuthentication: {
              enabled: true
            }
          }
        }
      });
      expect(res.clientId).toBeUndefined();
      expect(res.clientSecret).toBeUndefined();
      expect(res.oktaAuthenticationEnabled).toEqual(true);
      expect(res.oktaDomain).toBeUndefined();
    });
    it('should handle org okta config encryption error', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            'd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad80408522be0ebd6ec9e'
        }
      ]);
      const res = await dal.getOrgOktaConfiguration(mockUtil.makeContext(), {
        id: 7682,
        kvp: {
          features: {
            oktaAuthentication: {
              enabled: true
            }
          }
        }
      });
      expect(res.oktaAuthenticationEnabled).toEqual(true);
      expect(res.clientSecret).toBeUndefined();
      expect(res.clientId).toBeUndefined();
      expect(res.oktaDomain).toBeUndefined();
    });
  });

  describe('#getDefaultAddToIndexForOrg', function () {
    it('should get default addToIndex for org', async function () {
      let res, err;
      const context = getGraphQLContext('user');
      // get organization id by id
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      try {
        res = await dal.getDefaultAddToIndexForOrg(context, 7682);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(typeof res).toEqual('boolean');
      expect(res).toEqual(true); // default value
    });
  });

  describe('#getMyOrganizations', function () {
    it('should get my organizations', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '1234',
          guid: '00000000-1234-0000-0000-000000000000'
        },
        {
          id: '5678',
          guid: '00000000-5678-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: 1234,
            organizationName: 'Test Org'
          }
        ],
        false,
        [],
        (sql, args) => {
          expect(sql).toMatch(/WHERE.*AND\so\.status/);
          expect(args).toEqual(expect.arrayContaining([1234, 5678, 'active']));

          return true;
        }
      );

      const res = await dal.getMyOrganizations(null, {
        userId: '00000000-1111-0000-0000-000000000000',
        status: 'active'
      });
      expect(res).toBeTruthy();
      expect(res.records.length).toEqual(1);
      expect(res.records[0].organizationId).toEqual(1234);
      expect(res.records[0].guid).toEqual(
        '00000000-1234-0000-0000-000000000000'
      );
      expect(res.records[0].organizationName).toEqual('Test Org');
    });
  });

  describe('#getOrgIdFromAppId', function () {
    it('should get org', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '123'
        }
      ]);
      const res = await dal.getOrgIdFromAppId('a123');
      expect(res).toEqual('123');
    });

    it('should get not found', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      try {
        await dal.getOrgIdFromAppId('a223');
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });

  describe('#getRolesForOrg', function () {
    it('should get role for organization', async function () {
      let res, err;
      const options = { organizationId: 7682 };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'applicationId',
            owner_organization_id: 7682,
            application_status: 'application_status',
            application_key: 'key1'
          },
          {
            application_id: 'applicationId1',
            owner_organization_id: 7682,
            application_status: 'application_status1',
            application_key: 'key1'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'roleId',
            role_name: 'name',
            role_description: 'desc',
            app_name: 'appName',
            application_id: 'applicationId'
          },
          {
            role_id: 'roleId1',
            role_name: 'name1',
            role_description: 'desc1',
            app_name: 'appName1',
            application_id: 'applicationId1'
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);

      try {
        res = await dal.getRolesForOrg(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.length).toEqual(2);
      expect(res[0].id).toEqual('roleId');
      expect(res[1].id).toEqual('roleId1');
    });
  });

  describe('#getRoles', function () {
    it('should get roles, full filter, by user that is not superadmin', async function () {
      let res, err;
      const options = {
        id: 'roleId',
        name: 'name',
        organizationIds: '7682,1234',
        appIds: ['appId1', 'appId2'],
        isAppEventRole: true
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'roleId',
            role_name: 'name',
            role_description: 'desc',
            app_name: 'appName'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toMatch(/is_app_event_role\s=/);
          expect(sql).toMatch(/application_id\s=\sANY/);
          return true;
        }
      );
      try {
        res = await dal.getRoles(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.length).toEqual(1);
      expect(res[0].id).toEqual('roleId');
      expect(res[0].name).toEqual('name');
      expect(res[0].description).toEqual('desc');
      expect(res[0].appName).toEqual('appName');
    });

    it('should get roles, none filter, by superadmin', async function () {
      let res, err;
      const options = {};
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: 'roleId',
          role_name: 'name',
          role_description: 'desc',
          app_name: 'appName'
        }
      ]);

      try {
        res = await dal.getRoles(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.length).toEqual(1);
      expect(res[0].id).toEqual('roleId');
      expect(res[0].name).toEqual('name');
      expect(res[0].description).toEqual('desc');
      expect(res[0].appName).toEqual('appName');
    });
  });

  describe('#setOrgRemainingBudget', function () {
    it('should throw error - OrganizationId is required', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      try {
        res = await dal.setOrgRemainingBudget(context);
      } catch (error) {
        expect(error.message).toEqual('OrganizationId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error - Remaining budget is required and should be a number', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      try {
        res = await dal.setOrgRemainingBudget(context, 7682);
      } catch (error) {
        expect(error.message).toEqual(
          'Remaining budget is required and should be a number'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
    });

    it('should update remaining budget for org', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].write._push([
        { id: 7682, remaining_budget: 9700, is_limit_enforced: true }
      ]);

      try {
        res = await dal.setOrgRemainingBudget(context, 7682, 9700);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.id).toEqual(7682);
      expect(res.remainingBudget).toEqual(9700);
    });
  });

  describe('#incrementMonthlyCharge', function () {
    it('throw error - OrganizationId is required', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      try {
        res = await dal.incrementMonthlyCharge(context);
      } catch (error) {
        expect(error.message).toEqual('OrganizationId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
    });

    it('throw error - incrementValue is required and should be a number', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      try {
        res = await dal.incrementMonthlyCharge(context, 7682);
      } catch (error) {
        expect(error.message).toEqual(
          'incrementValue is required and should be a number'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.name).toEqual('invalid_input');
    });

    it('increment the monthly_current_charge for org', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].write._push([
        { id: 7682, monthly_current_charge: 10 }
      ]);

      try {
        res = await dal.incrementMonthlyCharge(context, 7682, 5);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.id).toEqual(7682);
      expect(res.monthlyCurrentCharge).toEqual(10);
    });
  });

  describe('#updateOrganizationBilling', function () {
    it('updateOrganizationBilling for org', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const planId = 'B1';

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            organization_id: 7682,
            planId
          }
        ],
        true,
        [],
        (sql, vars) => {
          expect(sql.trim()).toEqual(
            expect.stringMatching(/^UPDATE organization.*/)
          );
          expect(vars[0]).toEqual(planId);
          expect(vars[1]).toEqual(true); // billing_dirty
          return true;
        }
      );

      try {
        res = await dal.updateOrganizationBilling(
          {
            organizationId: 7682,
            planId
          },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res.organizationId).toEqual(7682);
      expect(res.planId).toEqual(planId);
    });
  });
  describe('#getLoginConfiguration', () => {
    it('returns login configuration', async () => {
      const context = mockUtil.makeContext();

      const expectedResponse = {
        name: 'Test Login Config',
        slug: 'test-login-slug',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF',
        organizationInfo: {
          id: 7682,
          guid: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8',
          name: 'Veritone Test Org'
        },
        hideVeritoneBranding: 'true'
      };

      serviceContext.dbConnections['media_platform'].read._push([
        {
          name: 'Test Login Config',
          slug: 'test-login-slug',
          logo:
            'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
          login_button_style: {
            buttonColor: '#0000FF',
            buttonTextColor: '#FFFFFF'
          },
          organization_id: 7682,
          organization_guid: '0023c9f2-6728-4df9-ae3c-6bd15c3326a8',
          organization_name: 'Veritone Test Org',
          hide_veritone_branding: 'true'
        }
      ]);

      let res, err;
      try {
        res = await dal.getLoginConfiguration({
          slug: 'test-login-slug'
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(res).toEqual(expect.objectContaining(expectedResponse));
    });
    it('throws error when slug is not provided', async () => {
      const context = mockUtil.makeContext();

      let res, err;
      try {
        res = await dal.getLoginConfiguration({});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeTruthy();
      expect(err.name).toEqual('internal_error');
    });
  });
  describe('#setLoginConfiguration', () => {
    it('should set login configuration on CreateOrganization - enable', async () => {
      const inputConfig = {
        enabled: true,
        name: 'Test Login Config',
        slug: 'test-login-slug',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF',
        hideVeritoneBranding: 'true'
      };

      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].read._push([], false);

      serviceContext.dbConnections['media_platform'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual(inputConfig.name);
          expect(vars[1]).toEqual(inputConfig.slug);
          expect(vars[2]).toEqual(inputConfig.logo);
          expect(vars[3]).toEqual({
            buttonColor: inputConfig.buttonColor,
            buttonTextColor: inputConfig.buttonTextColor
          });
          expect(vars[4]).toEqual(7682);
          expect(vars[5]).toEqual(context._authInfo.userId);
          expect(vars[6]).toEqual(inputConfig.enabled);
          return true;
        }
      );

      const res = await dal.setLoginConfiguration(
        context,
        {
          id: 7682
        },
        inputConfig
      );

      expect(res).toBeTruthy();
    });
    it('should set login configuration on CreateOrganization - disable', async () => {
      const originalValues = {
        enabled: true,
        name: 'Test Login Config',
        slug: 'test-login-slug',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF'
      };

      const inputConfig = {
        enabled: false
      };

      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            name: originalValues.name,
            slug: originalValues.slug,
            logo: originalValues.logo,
            enabled: originalValues.enabled,
            login_button_style: {
              buttonColor: originalValues.buttonColor,
              buttonTextColor: originalValues.buttonTextColor
            }
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].write._push(
        [{}],
        true,
        ['on conflict'],
        (sql, vars) => {
          expect(vars[0]).toEqual(originalValues.name);
          expect(vars[1]).toEqual(originalValues.slug);
          expect(vars[2]).toEqual(originalValues.logo);
          expect(vars[3]).toEqual({
            buttonColor: originalValues.buttonColor,
            buttonTextColor: originalValues.buttonTextColor
          });
          expect(vars[4]).toEqual(7682);
          expect(vars[5]).toEqual(context._authInfo.userId);
          expect(vars[6]).toEqual(inputConfig.enabled);
          return true;
        }
      );

      const res = await dal.setLoginConfiguration(
        context,
        {
          id: 7682
        },
        inputConfig
      );

      expect(res).toBeTruthy();
    });
  });
  describe('#deleteLoginConfiguration', () => {
    it('should delete organization login config', async function () {
      const loginConfig = {
        organizationId: 7682,
        name: 'Test Login Config'
      };
      let res, err;
      let id = loginConfig.organizationId;
      let message = `Organization Login Configuration (organization: ${loginConfig.organizationId}, loginConfiguration: '${loginConfig.name}') has been deleted`;
      const context = mockUtil.makeContext();

      let args = {
        organizationId: loginConfig.organizationId
      };
      mpDbWrite._push([
        {
          organization_id: loginConfig.organizationId,
          name: loginConfig.name
        }
      ]);
      try {
        res = await dal.deleteLoginConfiguration(context, args);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(typeof res).toEqual('object');
      expect(res.id).toEqual(id);
      expect(res.message).toEqual(message);
    });
    it('should not throw an error when deleting organization login config if the current user is not a super admin', async function () {
      const loginConfig = {
        organizationId: 7682,
        name: 'Test Login Config'
      };
      let res, err;
      let id = loginConfig.organizationId;
      let message = `Organization Login Configuration (organization: ${loginConfig.organizationId}, loginConfiguration: '${loginConfig.name}') has been deleted`;
      const context = mockUtil.makeContext({
        authRole: 'orgAdmin'
      });

      let args = {
        organizationId: loginConfig.organizationId
      };
      mpDbWrite._push([
        {
          organization_id: loginConfig.organizationId,
          name: loginConfig.name
        }
      ]);
      try {
        res = await dal.deleteLoginConfiguration(context, args);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeTruthy();
      expect(typeof res).toEqual('object');
      expect(res.id).toEqual(id);
      expect(res.message).toEqual(message);
    });

    it('should throw an error if the current user is not a super admin and the current user does not have access to the org 6682', async function () {
      const loginConfig = {
        organizationId: 6682,
        name: 'Test Login Config'
      };
      let res, err;
      let errMessage = `not_allowed: Only superadmin can delete the login configuration for another organization.`;
      const context = mockUtil.makeContext({
        authRole: 'orgAdmin'
      });

      let args = {
        organizationId: loginConfig.organizationId
      };
      mpDbWrite._push([
        {
          organization_id: loginConfig.organizationId,
          name: loginConfig.name
        }
      ]);
      try {
        res = await dal.deleteLoginConfiguration(context, args);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(`${err}`).toContain(errMessage);
      expect(res).toBeUndefined();
    });
  });

  it('should throw an error if no login configuration for the org 7682', async function () {
    const loginConfig = {
      organizationId: 7682,
      name: 'Test Login Config'
    };
    let res, err;
    let id = loginConfig.organizationId;
    let errMessage = `Login configuration not found for organization.`;
    const context = mockUtil.makeContext();

    let args = {
      organizationId: loginConfig.organizationId
    };
    mpDbWrite._push([]); // No rows are deleted
    try {
      res = await dal.deleteLoginConfiguration(context, args);
    } catch (error) {
      err = error;
    }

    expect(err).toBeDefined();
    expect(`${err}`).toContain(errMessage);
    expect(res).toBeUndefined();
  });
});

function getGraphQLContext(token, type) {
  const context2 = mockUtil.getGraphQLContext(token, type);
  const res = {
    _authInfo: context2
  };

  return res;
}
