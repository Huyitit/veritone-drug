const _ = require('lodash');
jest.useFakeTimers();
jest.mock('pg');

jest.mock('./util.js');
const dalUtil = require('./util.js');

const httpCallMock = jest.fn();
const validateRoles = jest.fn();
dalUtil.mockImplementation(() => {
  return {
    httpCall: httpCallMock,
    sanitizeField: (x) => x,
    swapPermissionEnumMap: (x) => [],
    coreAdminTokensResponseMapper: (x) => x,
    splitTrim: (x) => (x || ',').split(','),
    validateRoles: validateRoles
  };
});

const testHttpCall = (mocked, val) => {
  expect(mocked).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    expect.objectContaining(val),
    expect.any(Function),
    expect.any(String)
  );
};
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
_.set(serviceContext.config, 'featureFlags.enableRBACFeature', true);
serviceContext.dal.organization.getOrganizationIdAndGuidForUser = jest.fn();
const dalOrg = require('./organization.js')(serviceContext);
let ctxSuperAdmin, ctxRegularUser, ctxApiKey;
var dal = require('./dalAdmin.js')(
  serviceContext.logger,
  serviceContext.config,
  dalOrg,
  serviceContext
);

describe('dalAdmin.js', function () {
  beforeEach(() => {
    //jest.resetModules();
    //jest.clearAllMocks();
    jest.resetAllMocks();
    ctxSuperAdmin = _.cloneDeep(mockUtil.makeContext());
    ctxRegularUser = _.cloneDeep(mockUtil.makeContext({ authType: 'user' }));
    ctxRegularUser._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
    ctxApiKey = _.cloneDeep(mockUtil.makeContext({ authType: 'api_org' }));
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#updateOrganization', function () {
    it('should throw error when user is not super admin and metadata exists', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
      try {
        const res = await dal.updateOrganization(
          {
            input: {
              id: 123,
              metadata: 'test'
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to set full metadata on an organization'
        );
      }
    });
    it('should throw error when user is not super admin and whitelist exists', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      const context = _.cloneDeep(mockUtil.makeContext());
      context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
      try {
        const res = await dal.updateOrganization(
          {
            input: {
              id: 123,
              whitelist: 'test'
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to set the engine whitelist on an organization'
        );
      }
    });
    it('should throw error when user is not super admin and blacklist exists', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '123'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      const context = _.cloneDeep(mockUtil.makeContext());
      context._authInfo.permissionMasks = []; //remove permissionMasks so user is not super admin
      try {
        const res = await dal.updateOrganization(
          {
            input: {
              id: 123,
              blacklist: 'test'
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'The authenticated user or token does not have privileges to set the engine blacklist on an organization'
        );
      }
    });
    it('should throw error when multiple data retention policies are set', async function () {
      let res, err;
      try {
        res = await dal.updateOrganization(
          {
            input: {
              id: '123e4567-e89b-12d3-a456-426655440000',
              name: 'retention test org',
              businessUnit: 'BU',
              dataRetentionPolicies: [
                {
                  action: 'PURGE',
                  days: 9
                },
                {
                  action: 'ARCHIVE',
                  days: 5
                }
              ],
              metadata: {}
            }
          },
          {} // context
        );
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_implemented');
      expect(err.message).toEqual(
        'Multiple data retention policies are not supported yet. Only one policy can with PURGE action be set.'
      );
    });
    it('should throw error when data retention policy has non-PURGE action', async function () {
      let res, err;
      try {
        res = await dal.updateOrganization(
          {
            input: {
              id: '123e4567-e89b-12d3-a456-426655440000',
              name: 'retention test org',
              businessUnit: 'BU',
              dataRetentionPolicies: [
                {
                  action: 'ARCHIVE',
                  days: 5
                }
              ],
              metadata: {}
            }
          },
          {} // context
        );
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_implemented');
      expect(err.message).toEqual(
        'Currently only PURGE action is supported for data retention policies.'
      );
    });
    it('should update redis cache if update organization succeeds', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            kvp: {
              features: {
                one: 'enabled'
              }
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      //setEngineWhitelist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      //setEngineBlacklist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );

      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            name: 'retention test org',
            businessUnit: 'BU',
            dataRetentionPolicies: [
              {
                action: 'PURGE',
                days: 5
              }
            ],
            metadata: {}
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
      expect(serviceContext.redisCache.set).toHaveBeenCalled();
    });
    it('should update organization successfully 1', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            kvp: {
              features: {
                one: 'enabled'
              }
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      //setEngineWhitelist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      //setEngineBlacklist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );

      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            blacklist: {
              engineIds: ['test']
            },
            whitelist: {
              engineIds: ['test']
            },
            name: 'test',
            seatLimit: 'test',
            status: 'test',
            businessUnit: 'test',
            metadata: {
              features: {
                two: 'disabled',
                one: 'disabled'
              }
            }
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
      testHttpCall(httpCallMock, {
        apps: [{}],
        businessUnit: 'test',
        kvp: {
          features: {
            indexing: { tdoDefault: undefined },
            one: 'disabled',
            two: 'disabled'
          }
        }
      });
    });
    it('should update organization okta config', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '7682',
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 7682
        }
      ]);
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 7682
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '7682',
            oktaConfiguration: {
              oktaAuthenticationEnabled: false
            }
          }
        },
        ctxSuperAdmin
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual('7682');
    });
    it('should update organization successfully when blacklist and whitelist are missed', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      //setEngineWhitelist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      //setEngineBlacklist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            name: 'test',
            seatLimit: 'test',
            status: 'test',
            businessUnit: 'test',
            metadata: 'test'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should update organization successfully when input params has indexTDOsByDefault', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            kvp: {
              features: {
                one: 'disabled'
              }
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );

      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            indexTDOsByDefault: true
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should return old organization when input params does not name, seatLimit, status, businessUnit', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      //setEngineWhitelist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      //setEngineBlacklist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            blacklist: {
              engineIds: ['test']
            },
            whitelist: {
              engineIds: ['test']
            },
            metadata: 'test'
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should return old organization when input params does not contain update information', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '7682'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            application_id: '123e4567-e89b-12d3-a456-426655440000',
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          }
        ],
        false
      );
      //setEngineWhitelist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      //setEngineBlacklist
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );

      httpCallMock.mockResolvedValueOnce({
        name: 'test',
        id: 123
      });
      const res = await dal.updateOrganization(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            blacklist: {
              engineIds: ['test']
            },
            whitelist: {
              engineIds: ['test']
            }
          }
        },
        mockUtil.makeContext()
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
  });
  describe('#createUser', function () {
    it('should create user successfully and return new user when organization id is not returned', async function () {
      httpCallMock.mockResolvedValueOnce({
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.createUser(
        {
          input: {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: 'test',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.firstName).toEqual('test');
      expect(res.lastName).toEqual('test');
    });
    it('should create user successfully when coreAdminUri does not end with /', async function () {
      httpCallMock.mockResolvedValueOnce({
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      const res = await dal.createUser(
        {
          input: {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: 'test',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.firstName).toEqual('test');
      expect(res.lastName).toEqual('test');
    });
    it('should create user successfully and return new user when organization id is returned and roleIds in input params is missed', async function () {
      httpCallMock.mockResolvedValueOnce({
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.createUser(
        {
          input: {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: 'test',
            password: 'test',
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.firstName).toEqual('test');
      expect(res.lastName).toEqual('test');
    });
  });
  describe('#updateUser', function () {
    it('should throw error if user is not found', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          // {
          //   user_id: '123e4567-e89b-12d3-a456-426655440000',
          //   user_name: 'test'
          // }
        ],
        false
      );
      const context = mockUtil.makeContext();
      try {
        const res = await dal.updateUser(
          {
            input: {
              firstName: 'test',
              lastName: 'test',
              email: 'test',
              organizationId: 'test',
              password: 'test',
              roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
              name: 'name',
              sendNewUserEmail: 'test',
              jsondata: {
                firstName: 'test',
                lastName: 'test'
              },
              acls: 'test'
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_found');
        expect(_.toString(error)).toContain(
          'The requested object was not found'
        );
      }
    });
    it('should update user successfully simple', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: '123'
        }
      ]);
      httpCallMock.mockResolvedValueOnce({
        organizationId: '123e4567-e89b-12d3-a456-426655440000',
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      const context = mockUtil.makeContext();
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      const res = await dal.updateUser(
        {
          input: {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: 1,
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: ['test']
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should update user successfully when organization id is missed for the org admin requestor', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: '123'
        }
      ]);

      httpCallMock.mockResolvedValueOnce({
        organizationId: '123e4567-e89b-12d3-a456-426655440000',
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });

      const context = _.cloneDeep(mockUtil.makeContext());
      context._authInfo.permissionMasks = [8188]; // permissionMasks for orgAdmin
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      _.set(context, '_authInfo.organization.organizationId', 1);

      const res = await dal.updateUser(
        {
          input: {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: ['test']
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should update user successfully when roleIds, acls, jsondata, firstName and lastName are missed', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      httpCallMock.mockResolvedValueOnce({
        organizationId: '123e4567-e89b-12d3-a456-426655440000',
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const res = await dal.updateUser(
        {
          input: {
            email: 'test',
            organizationId: 1,
            password: 'test',
            name: 'name',
            sendNewUserEmail: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
  });
  describe('#updateUserRoles', function () {
    const userId = '123e4567-e89b-12d3-a456-426655440000';
    const orgGuid = '99999999-9999-9999-9999-999999999999';
    const roleId1 = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const roleId2 = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    beforeEach(() => {
      validateRoles.mockImplementation((_ctx, rows) => rows);
    });

    it('should throw error for invalid userId', async function () {
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      try {
        await dal.updateUserRoles(
          { input: { userId: 'not-a-uuid', addRoleIds: [roleId1], removeRoleIds: [] } },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_found');
      }
    });

    it('should throw error when userId is missing', async function () {
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      try {
        await dal.updateUserRoles(
          { input: { addRoleIds: [roleId1], removeRoleIds: [] } },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should update user roles successfully with add and remove', async function () {
      httpCallMock.mockResolvedValueOnce({
        userId,
        organizationGuid: orgGuid,
        kvp: { firstName: 'Test', lastName: 'User' }
      });
      // getRolesForUser query
      serviceContext.dbConnections['sso'].read._push([
        { role_id: roleId1, role_name: 'Editor', app_name: 'TestApp' }
      ]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      const res = await dal.updateUserRoles(
        { input: { userId, addRoleIds: [roleId1], removeRoleIds: [roleId2] } },
        context
      );
      expect(res).toBeDefined();
      expect(res.userId).toEqual(userId);
      expect(res.roles).toBeDefined();
      expect(Array.isArray(res.roleIds)).toBe(true);
      expect(httpCallMock).toHaveBeenCalledWith(
        expect.stringContaining(`users/${userId}/roles`),
        expect.any(Object),
        expect.objectContaining({ addRoleIds: [roleId1], removeRoleIds: [roleId2] }),
        expect.any(Function),
        'PUT'
      );
    });

    it('should convert organizationId to organizationGuid in payload', async function () {
      // getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: orgGuid }
      ]);
      httpCallMock.mockResolvedValueOnce({
        userId,
        kvp: { firstName: 'Test', lastName: 'User' }
      });
      // getRolesForUser query
      serviceContext.dbConnections['sso'].read._push([
        { role_id: roleId1, role_name: 'Viewer', app_name: 'TestApp' }
      ]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      const res = await dal.updateUserRoles(
        { input: { userId, addRoleIds: [roleId1], removeRoleIds: [], organizationId: 12345 } },
        context
      );
      expect(res).toBeDefined();
      expect(httpCallMock).toHaveBeenCalledWith(
        expect.stringContaining(`users/${userId}/roles`),
        expect.any(Object),
        expect.objectContaining({ organizationGuid: orgGuid, addRoleIds: [roleId1], removeRoleIds: [] }),
        expect.any(Function),
        'PUT'
      );
    });

    it('should default addRoleIds and removeRoleIds to empty arrays', async function () {
      httpCallMock.mockResolvedValueOnce({
        userId,
        organizationGuid: orgGuid,
        kvp: {}
      });
      // getRolesForUser query
      serviceContext.dbConnections['sso'].read._push([]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      const res = await dal.updateUserRoles(
        { input: { userId } },
        context
      );
      expect(res).toBeDefined();
      expect(httpCallMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ addRoleIds: [], removeRoleIds: [] }),
        expect.any(Function),
        'PUT'
      );
    });

    it('should use organizationGuid from response for getRolesForUser when payload has none', async function () {
      httpCallMock.mockResolvedValueOnce({
        userId,
        organizationGuid: orgGuid,
        kvp: { firstName: 'A' }
      });
      // getRolesForUser query
      serviceContext.dbConnections['sso'].read._push([
        { role_id: roleId1, role_name: 'Admin', app_name: 'App1' },
        { role_id: roleId2, role_name: 'Viewer', app_name: 'App2' }
      ]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      const res = await dal.updateUserRoles(
        { input: { userId, addRoleIds: [roleId1, roleId2], removeRoleIds: [] } },
        context
      );
      expect(res.roles).toHaveLength(2);
      expect(res.roleIds).toHaveLength(2);
    });

    it('should handle httpCall error', async function () {
      httpCallMock.mockRejectedValueOnce(new Error('core-admin error'));
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: '/' } };
      try {
        await dal.updateUserRoles(
          { input: { userId, addRoleIds: [roleId1], removeRoleIds: [] } },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toEqual('core-admin error');
      }
    });

    it('should build correct URI when coreAdminUri does not end with /', async function () {
      httpCallMock.mockResolvedValueOnce({
        userId,
        organizationGuid: orgGuid,
        kvp: {}
      });
      serviceContext.dbConnections['sso'].read._push([]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = { services: { coreAdminUri: 'http://localhost:8082' } };
      await dal.updateUserRoles(
        { input: { userId, addRoleIds: [], removeRoleIds: [] } },
        context
      );
      expect(httpCallMock).toHaveBeenCalledWith(
        `http://localhost:8082/users/${userId}/roles`,
        expect.any(Object),
        expect.any(Object),
        expect.any(Function),
        'PUT'
      );
    });
  });
  describe('#deleteUser', function () {
    it('should delete user successfully', async function () {
      httpCallMock.mockResolvedValueOnce({
        id: '123e4567-e89b-12d3-a456-426655440000',
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      try {
        const context = _.cloneDeep(mockUtil.makeContext());
        context.config = {
          services: {
            coreAdminUri: '/'
          }
        };
        const res = await dal.deleteUser(
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          },
          context
        );
        expect(res).toBeDefined();
        expect(res.id).toEqual('123e4567-e89b-12d3-a456-426655440000');
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
    it('should delete user successfully when coreAdminUri does not end with /', async function () {
      httpCallMock.mockResolvedValueOnce({
        id: '123e4567-e89b-12d3-a456-426655440000',
        firstName: 'test',
        lastName: 'test',
        email: 'test',
        password: 'test',
        roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
        name: 'name',
        sendNewUserEmail: 'test',
        jsondata: {
          firstName: 'test',
          lastName: 'test'
        },
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        acls: 'test'
      });
      try {
        const context = _.cloneDeep(mockUtil.makeContext());
        context.config = {
          services: {
            coreAdminUri: ''
          }
        };
        const res = await dal.deleteUser(
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          },
          context
        );
        expect(res).toBeDefined();
        expect(res.id).toEqual('123e4567-e89b-12d3-a456-426655440000');
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });
  describe('#createPasswordUpdateRequest', function () {
    it('should throw error when user is not found', async function () {
      serviceContext.dbConnections['sso'].write._push([], false);
      try {
        const context = _.cloneDeep(mockUtil.makeContext());
        context.config = {
          services: {
            coreAdminUri: '/'
          }
        };
        await dal.createPasswordUpdateRequest(
          {
            input: {
              id: '123e4567-e89b-12d3-a456-426655440000',
              skipPasswordResetEmail: true
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_found');
        expect(_.toString(error)).toContain(
          'The requested object was not found'
        );
      }
    });
    it('should createPasswordUpdateRequest', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({
        organizationId: '123e4567-e89b-12d3-a456-426655440000'
      });

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.createPasswordUpdateRequest(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            skipPasswordResetEmail: true
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should createPasswordUpdateRequest works when coreAdminUri does not end with /', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      httpCallMock.mockResolvedValueOnce({
        organizationId: '123e4567-e89b-12d3-a456-426655440000'
      });
      const res = await dal.createPasswordUpdateRequest(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            skipPasswordResetEmail: true
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
  });
  describe('#createPasswordResetRequest', function () {
    it('should createPasswordResetRequest work when skipPasswordResetEmail exists in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        message: 'Reset request issued for undefined. Email will not be sent'
      });

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.createPasswordResetRequest(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000',
            skipPasswordResetEmail: true
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.message).toContain(
        'Reset request issued for undefined. Email will not be sent'
      );
    });
    it('should createPasswordResetRequest work when skipPasswordResetEmail does not exist in input params and coreAdminUri does not end with /', async function () {
      httpCallMock.mockResolvedValueOnce({
        message: 'Reset request issued for undefined. Email will be sent'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      const res = await dal.createPasswordResetRequest(
        {
          input: {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.message).toContain(
        'Reset request issued for undefined. Email will be sent'
      );
    });
    it('should createPasswordResetRequest work input is missed', async function () {
      httpCallMock.mockResolvedValueOnce({
        message: 'Reset request issued for undefined. Email will be sent'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      const res = await dal.createPasswordResetRequest({}, context);
      expect(res).toBeDefined();
      expect(res.message).toContain(
        'Reset request issued for undefined. Email will be sent'
      );
    });
  });
  describe('#changePassword', function () {
    it('should changePassword work', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({});
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.changePassword(context, {
        input: {
          oldPassword: 'test',
          newPassword: '_test'
        }
      });
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should changePassword work when coreAdminUri does not end with /', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({});
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: ''
        }
      };
      const res = await dal.changePassword(context, {
        input: {
          oldPassword: 'test',
          newPassword: '_test'
        }
      });
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
  });
  describe('#login', function () {
    it('should login succeed', async function () {
      httpCallMock.mockResolvedValueOnce({
        id: '123e4567-e89b-12d3-a456-426655440000'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.login(context, {
        userName: 'test',
        password: 'test'
      });
      expect(res).toBeDefined();
      expect(res.id).toEqual('123e4567-e89b-12d3-a456-426655440000');
    });
  });
  describe('#logout', function () {
    it('should logout work', async function () {
      httpCallMock.mockResolvedValueOnce({
        id: '123e4567-e89b-12d3-a456-426655440000'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const res = await dal.logout(context, 'test token');
      expect(res).toBeDefined();
      expect(res.id).toEqual('123e4567-e89b-12d3-a456-426655440000');
    });
  });
  describe('#validateToken', function () {
    it('should validateToken work', async function () {
      httpCallMock.mockResolvedValueOnce({
        isValid: true
      });

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.validateToken(context, 'test token');
      expect(res).toBeDefined();
      expect(res.isValid).toEqual(true);
    });
  });
  describe('#refreshToken', function () {
    it('should refreshToken work', async function () {
      httpCallMock.mockResolvedValueOnce({
        newToken: 'test token'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.refreshToken(context, 'test token');
      expect(res).toBeDefined();
      expect(res.newToken).toEqual('test token');
    });
  });
  describe('#getAllOrgTokens', function () {
    it('should getAllOrgTokens work', async function () {
      httpCallMock.mockResolvedValueOnce([
        {
          tokenId: 'test'
        },
        {
          tokenId: 'test'
        }
      ]);
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.getAllOrgTokens(
        context,
        '123e4567-e89b-12d3-a456-426655440000'
      );
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res[0].tokenId).toEqual('test');
    });
  });
  describe('#getMfaInfo', function () {
    it('should getMfaInfo work', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000',
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.getMfaInfo(
        context,
        '123e4567-e89b-12d3-a456-426655440000'
      );
      expect(res).toBeDefined();
      expect(res.id).toEqual('123e4567-e89b-12d3-a456-426655440000');
    });
  });
  describe('#getUserSettings', function () {
    it('should get user settings success', async function () {
      let res, err;
      const args = {
        userId: 'fb78762d-9d55-4614-9d2d-d79364223323',
        application: '5c8941aa-b3fb-4815-a7e6-59d107f89cdf',
        keys: ['test.key']
      };

      // getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'fb78762d-9d55-4614-9d2d-d79364223323',
            kvp: { first_name: 'no', last_name: 'body' }
          }
        ],
        false
      );
      // serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '9a005428-fd96-4f8a-ae99-0355a81246c5' }],
        false,
        ['ao.organization_id']
      );
      // _getUserSettingDb
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'fb78762d-9d55-4614-9d2d-d79364223323',
            key: 'test.key',
            value: 'test value',
            application_id: '5c8941aa-b3fb-4815-a7e6-59d107f89cdf'
          }
        ],
        false
      );

      try {
        res = await dal.getUserSettings(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].userId).toEqual('fb78762d-9d55-4614-9d2d-d79364223323');
      expect(res[0].key).toEqual('test.key');
      expect(res[0].value).toEqual('test value');
      expect(res[0].applicationId).toEqual(
        '5c8941aa-b3fb-4815-a7e6-59d107f89cdf'
      );
    });
  });
  describe('#updateCurrentUser', function () {
    it('should throw error when user is not found', async function () {
      serviceContext.dbConnections['sso'].write._push([], false);
      try {
        const context = _.cloneDeep(mockUtil.makeContext());
        const res = await dal.updateCurrentUser(
          {
            userId: '123e4567-e89b-12d3-a456-426655440000',
            input: {
              mfaInfo: {},
              userSetting: {}
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_found');
        expect(_.toString(error)).toContain(
          'The requested object was not found'
        );
      }
    });
    it('should throw error when passwordToken is not provided', async function () {
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      try {
        const context = _.cloneDeep(mockUtil.makeContext());
        const res = await dal.updateCurrentUser(
          {
            userId: '123e4567-e89b-12d3-a456-426655440000',
            input: {
              mfaInfo: {},
              userSetting: {}
            }
          },
          context
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(_.toString(error)).toContain('passwordToken must be provided');
      }
    });
    it('should updateCurrentUser work when userSetting exists in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        mfaPhoneNumber: 'test',
        mfaVerifiedDate: 'test',
        mfaGaVerifiedDate: 'test',
        mfaDefaultOption: 'test'
      });

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test updated',
            lastName: 'test updated',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const res = await dal.updateCurrentUser(
        {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            mfaInfo: {},
            userSetting: {},
            passwordToken: 'test',
            firstName: 'test updated',
            lastName: 'test updated',
            imageUrl: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.jsondata.firstName).toEqual('test updated');
      expect(res.jsondata.lastName).toEqual('test updated');
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should updateCurrentUser work when firstName, lastname are not present in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        mfaPhoneNumber: 'test',
        mfaVerifiedDate: 'test',
        mfaGaVerifiedDate: 'test',
        mfaDefaultOption: 'test'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test updated',
            lastName: 'test updated',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.updateCurrentUser(
        {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            mfaInfo: {},
            userSetting: {},
            passwordToken: 'test',
            imageUrl: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.jsondata.firstName).toEqual('test');
      expect(res.jsondata.lastName).toEqual('test');
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should updateCurrentUser work when imageUrl is not present in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        mfaPhoneNumber: 'test',
        mfaVerifiedDate: 'test',
        mfaGaVerifiedDate: 'test',
        mfaDefaultOption: 'test'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test updated',
            lastName: 'test updated',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.updateCurrentUser(
        {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            mfaInfo: {},
            userSetting: {},
            passwordToken: 'test',
            firstName: 'test updated',
            lastName: 'test updated'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.jsondata.firstName).toEqual('test updated');
      expect(res.jsondata.lastName).toEqual('test updated');
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });

    it('should updateCurrentUser work when mfaInfo and userSetting do not exist in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        mfaPhoneNumber: 'test',
        mfaVerifiedDate: 'test',
        mfaGaVerifiedDate: 'test',
        mfaDefaultOption: 'test'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test updated',
            lastName: 'test updated',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      const res = await dal.updateCurrentUser(
        {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            passwordToken: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.jsondata.firstName).toEqual('test');
      expect(res.jsondata.lastName).toEqual('test');
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
    it('should updateCurrentUser work when mfaInfo and userSetting do not exist in input params', async function () {
      httpCallMock.mockResolvedValueOnce({
        mfaPhoneNumber: 'test',
        mfaVerifiedDate: 'test',
        mfaGaVerifiedDate: 'test',
        mfaDefaultOption: 'test'
      });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test',
            lastName: 'test',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            firstName: 'test updated',
            lastName: 'test updated',
            email: 'test',
            organizationId: '123e4567-e89b-12d3-a456-426655440000',
            password: 'test',
            roleIds: ['123e4567-e89b-12d3-a456-426655440000'],
            name: 'name',
            sendNewUserEmail: 'test',
            jsondata: {
              firstName: 'test',
              lastName: 'test'
            },
            kvp: {
              firstName: 'test',
              lastName: 'test'
            },
            acls: 'test'
          }
        ],
        false
      );

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const res = await dal.updateCurrentUser(
        {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            passwordToken: 'test'
          }
        },
        context
      );
      expect(res).toBeDefined();
      expect(res.jsondata.firstName).toEqual('test');
      expect(res.jsondata.lastName).toEqual('test');
      expect(res.organizationId).toEqual(
        '123e4567-e89b-12d3-a456-426655440000'
      );
    });
  });
  describe('#createOrganization', function () {
    it('should throw error when missing financeadmin and superadmin rights', async function () {
      const context = _.cloneDeep(mockUtil.makeContext());
      context._authInfo.permissionMasks = [];
      try {
        context.config = {
          services: {
            coreAdminUri: '/'
          }
        };
        let res = await dal.createOrganization(context, {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            metadata: {
              features: {
                engineLimit: 1,
                billing: true
              }
            },
            applications: [
              {
                applicationKey: 'analytics',
                applicationId: 123
              }
            ],
            types: ['test']
          }
        });
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'Only finance admins and super admins can set billing and engineLimits.'
        );
      }
    });
    it("should throw error when a user sets some superadmin's option", async function () {
      const context = _.cloneDeep(mockUtil.makeContext());
      context._authInfo.permissionMasks = [];
      try {
        context.config = {
          services: {
            coreAdminUri: '/'
          }
        };
        let res = await dal.createOrganization(context, {
          userId: '123e4567-e89b-12d3-a456-426655440000',
          input: {
            metadata: {
              features: {
                enableRBACFeature: true
              }
            },
            applications: [
              {
                applicationKey: 'analytics',
                applicationId: 123
              }
            ],
            types: ['test']
          }
        });
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'Only superadmin can set limitRemaining, limitEnforced and olp feature.'
        );
      }
    });
    it('should throw error when multiple data retention policies are set', async function () {
      let res, err;
      try {
        res = await dal.createOrganization(
          {},
          {
            input: {
              name: 'retention test org',
              businessUnit: 'BU',
              dataRetentionPolicies: [
                {
                  action: 'PURGE',
                  days: 9
                },
                {
                  action: 'ARCHIVE',
                  days: 5
                }
              ],
              metadata: {}
            }
          }
        );
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_implemented');
      expect(err.message).toEqual(
        'Multiple data retention policies are not supported yet. Only one policy can with PURGE action be set.'
      );
    });
    it('should throw error when data retention policy has non-PURGE action', async function () {
      let res, err;
      try {
        res = await dal.createOrganization(
          {},
          {
            input: {
              name: 'retention test org',
              businessUnit: 'BU',
              dataRetentionPolicies: [
                {
                  action: 'ARCHIVE',
                  days: 5
                }
              ],
              metadata: {}
            }
          }
        );
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_implemented');
      expect(err.message).toEqual(
        'Currently only PURGE action is supported for data retention policies.'
      );
    });
    it('should create organization successfully', async function () {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            organization_id: 1234567
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationName: 'test-org',
            organizationId: 1234567,
            organizationGuid: 'test-settable-org-guid',
            kvp: {
              features: {
                engineLimit: 1
              },
              billing: true
            }
          }
        ],
        false
      );
      httpCallMock.mockResolvedValueOnce({
        id: 1234567
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      let res = await dal.createOrganization(context, {
        input: {
          guid: 'test-settable-org-guid',
          name: 'test-org',
          status: 'active',
          metadata: {
            features: {
              engineLimit: 1
            },
            billing: true
          },
          applications: [
            {
              applicationKey: 'analytics',
              applicationId: 123
            }
          ],
          types: ['test']
        }
      });
      expect(res).toBeDefined();
      expect(res.organizationId).toEqual(1234567);
      expect(res.organizationName).toEqual('test-org');
      expect(res.organizationGuid).toEqual('test-settable-org-guid');
      expect(res.kvp.features.engineLimit).toEqual(1);
      expect(res.kvp.billing).toEqual(true);
      testHttpCall(httpCallMock, {
        apps: [
          {
            applicationKey: 'analytics',
            applicationId: 123
          }
        ],
        status: 'active',
        organizationGuid: 'test-settable-org-guid',
        organizationName: 'test-org',
        organizationType: ['test'],
        kvp: {
          features: {
            engineLimit: 1
          },
          billing: true
        }
      });
    });
  });
  describe('#createInternalApiToken', function () {
    it('should throw error when organization id is missed', async function () {
      try {
        await dal.createInternalApiToken({});
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(_.toString(error)).toContain('Missing organization id');
      }
    });
    it('should createInternalApiToken work', async function () {
      try {
        // serviceContext.dal.organization.getGroupIdForOrgId
        serviceContext.dbConnections['sso'].read._push([
          { group_id: 'dc4ff0f1-02df-4ab1-98b1-50eaf99a6047' }
        ]);
        // serviceContext.dal.application.getAppIdFromOrgId
        serviceContext.dbConnections['sso'].read._push([
          { application_id: '8eb6f8da-3d39-4fdd-878a-61eb12270c95' }
        ]);
        serviceContext.dbConnections['sso'].write._push([
          {
            token_id: 1234,
            application_id: 1234,
            group_id: 1234567
          }
        ]);
        const res = await dal.createInternalApiToken({
          aiwareEnabled: true,
          organizationId: 1234567
        });
        expect(res).toBeDefined();
        expect(res.tokenId).toEqual(1234);
        expect(res.applicationId).toEqual(1234);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
    it('Should createInternalApiToken work when aiwareEnabled is missed and groupId is present', async function () {
      try {
        serviceContext.dal.application.getAppIdFromOrgId = jest.fn();
        serviceContext.dbConnections['sso'].write._push([
          {
            token_id: 1234,
            application_id: 1234,
            group_id: 1234567
          }
        ]);
        const res = await dal.createInternalApiToken({
          groupId: 1234567,
          organizationId: 1234567
        });
        expect(res).toBeDefined();
        expect(res.tokenId).toEqual(1234);
        expect(res.applicationId).toEqual(1234);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });

  describe('#createApiToken', function () {
    it('should throw an error when name is missing', async function () {
      try {
        await dal.createApiToken({}, {});
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toEqual('Input error: name is required');
      }
    });

    it('should create API token successfully', async () => {
      const args = {
        name: 'testToken',
        rights: [
          'CMS_ACCESS',
          'CMS_MEDIA_READ',
          'CMS_WORKFLOWS_READ',
          'JOB_READ',
          'TASK_READ',
          'RECORDING_READ'
        ]
      };
      httpCallMock.mockResolvedValueOnce({
        tokenId:
          '6e329b:d43b4b2bde6f44989bb6fcb8a0005a46cde2b2a8ee52498ba144d037d7b8f23b',
        applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
        groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
        userId: 'df82e36d-65ff-4417-affc-e03e288ccddc',
        tokenHash:
          'bfb5a45d5b5d2ef9117123f0e6424b11abc0aa7f359bd5cc3be42cf19228e710',
        authGroupId: '8a0401c9-4852-4c79-a8a9-9a819a297be7',
        json: {
          isRevoked: false,
          internal: false,
          tokenLabel: 'testToken',
          rights: [
            'cms:access',
            'cms:media:read',
            'cms:workflows:read',
            'job:read',
            'task:read',
            'recording:read'
          ],
          tokenId:
            '6e329b:d43b4b2bde6f44989bb6fcb8a0005a46cde2b2a8ee52498ba144d037d7b8f23b',
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb'
        }
      });

      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const response = await dal.createApiToken(args, context);
      expect(typeof response.tokenId).toEqual('string');
      expect(typeof response.json).toEqual('object');
      expect(response.json.rights).toEqual([
        'cms:access',
        'cms:media:read',
        'cms:workflows:read',
        'job:read',
        'task:read',
        'recording:read'
      ]);
    });
  });

  describe('#updateUserStatus', function () {
    it('should updateUserStatus work', async function () {
      try {
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              user_id: 'test',
              user_name: 'test',
              kvp: {
                firstName: 'test',
                lastName: 'test'
              }
            }
          ],
          false
        );
        serviceContext.dbConnections['sso'].write._push(
          [
            {
              status: 'test',
              kvp: {
                firstName: 'test',
                lastName: 'test'
              }
            }
          ],
          false
        );
        const res = await dal.updateUserStatus(
          {
            input: {
              id: '123e4567-e89b-12d3-a456-426655440000',
              status: 'test'
            }
          },
          mockUtil.makeContext()
        );
        expect(res).toBeDefined();
        expect(res.status).toEqual('test');
        expect(res.kvp.firstName).toEqual('test');
        expect(res.kvp.lastName).toEqual('test');
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
    it('should throw error when invalid write access', async function () {
      let err;
      try {
        serviceContext.dal.organization.getOrganizationIdAndGuidForUser.mockReturnValue(
          [{ id: 1, priority: 0 }]
        );
        await dal.updateUserStatus(
          {
            input: {
              id: '123e4567-e89b-12d3-a456-426655440000',
              status: 'test'
            }
          },
          mockUtil.makeContext({ authRole: 'orgAdmin' })
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });
  });
  describe('#getPasswordToken', function () {
    it('should getPasswordToken work', async function () {
      httpCallMock.mockResolvedValueOnce({
        tokenId: 'test'
      });
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };

      const res = await dal.getPasswordToken(context, {
        userName: 'test',
        password: 'test'
      });
      expect(res).toBeDefined();
      expect(res.tokenId).toEqual('test');
    });

    it('should throw error with not_allowed', async function () {
      httpCallMock.mockRejectedValueOnce(new Error('not_allowed'));
      const context = _.cloneDeep(mockUtil.makeContext());
      context.config = {
        services: {
          coreAdminUri: '/'
        }
      };
      expect(async () =>
        dal.getPasswordToken(context, {
          userName: 'test',
          password: 'test'
        })
      ).rejects.toThrow('not_allowed');
    });
  });

  describe('#getRolesForUser', function () {
    it('should return empty array, if userId not exists', async function () {
      let res, err;
      const options = {};

      try {
        res = await dal.getRolesForUser(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });

    it('should return roles for user, if current user is not a superadmin', async function () {
      let res, err;
      const options = { id: '6733a54b-3b6a-426d-b729-3fe40708a5a8' };
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = [];

      validateRoles.mockReturnValue([
        {
          id: 'roleId',
          roleId: 'roleId',
          name: 'roleName',
          description: 'roleDesc',
          appName: 'appName',
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: 'roleId',
          role_name: 'roleName',
          role_description: 'roleDesc',
          app_name: 'appName',
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: 'roleId',
          role_name: 'roleName',
          role_description: 'roleDesc',
          app_name: 'appName',
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);

      try {
        res = await dal.getRolesForUser(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].id).toEqual('roleId');
      expect(res[0].name).toEqual('roleName');
      expect(res[0].description).toEqual('roleDesc');
      expect(res[0].appName).toEqual('appName');
    });

    it('should return roles for user, if current user is a superadmin', async function () {
      let res, err;
      const options = { id: '6733a54b-3b6a-426d-b729-3fe40708a5a8' };
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      validateRoles.mockReturnValue([
        {
          id: 'roleId',
          roleId: 'roleId',
          name: 'roleName',
          description: 'roleDesc',
          appName: 'appName'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          role_id: 'roleId',
          role_name: 'roleName',
          role_description: 'roleDesc',
          app_name: 'appName'
        }
      ]);

      try {
        res = await dal.getRolesForUser(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].id).toEqual('roleId');
      expect(res[0].name).toEqual('roleName');
      expect(res[0].description).toEqual('roleDesc');
      expect(res[0].appName).toEqual('appName');
    });

    it('should return private roles for normal user (not just superadmin)', async function () {
      let res, err;
      const options = { id: '6733a54b-3b6a-426d-b729-3fe40708a5a8' };
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = [];

      try {
        res = dal._getRolesForUserQuery(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.sql).not.toEqual('');
      expect(res.sql).not.toContain('is_private IS NOT TRUE');
    });

    it('the sql query should include the conditions for orgGuid and application_id', async function () {
      let res, err;
      const options = {
        id: '6733a54b-3b6a-426d-b729-3fe40708a5a8',
        organizationGuid: 'ac4d6290-ddf7-410b-85d1-bba86ad91e47',
        applicationId: 'c6aeb2eb-816f-46de-b57c-4704716d3080'
      };
      const context = mockUtil.makeContext();
      context._authInfo.permissionMasks = [];

      try {
        res = dal._getRolesForUserQuery(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined;
      expect(res.sql).toContain(`ur.user_id = $1`);
      expect(res.sql).toContain(`ur.application_id = $2`);
      expect(res.sql).toContain(`r.application_id = $3`);
    });
  });

  describe('#getUsersByEmail', function () {
    it('should throw error, if email was not passed in', async function () {
      let res, err;
      const options = {};
      const context = mockUtil.makeContext();

      try {
        res = await dal.getUsersByEmail(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should return user, by email', async function () {
      let res, err;
      const options = { email: 'firstname.Lastname@veritone.com' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [{ user_id: 'ac90904b-6329-45d9-be82-240010d8574b' }],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/lower\(user_name\)/);
          expect(sql).toMatch(/lower\(email\)/);

          expect(params[0]).toEqual(_.toLower(options.email));

          return true;
        }
      );

      try {
        res = await dal.getUsersByEmail(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].userId).toEqual('ac90904b-6329-45d9-be82-240010d8574b');
    });

    it('should return user, by email with options', async function () {
      let res, err;
      const options = {
        email: 'firstname.Lastname@veritone.com',
        userId: 'ac90904b-6329-45d9-be82-240010d8574b'
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [{ user_id: 'ac90904b-6329-45d9-be82-240010d8574b' }],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/lower\(user_name\)/);
          expect(sql).toMatch(/lower\(email\)/);
          expect(sql).toMatch(/user_id/);

          expect(params[0]).toEqual(_.toLower(options.email));
          expect(params[1]).toEqual(options.userId);

          return true;
        }
      );

      try {
        res = await dal.getUsersByEmail(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res[0].userId).toEqual('ac90904b-6329-45d9-be82-240010d8574b');
    });
  });

  describe('#getUserBasicInfo', function () {
    it('should throw error, if userId was not passed in', async function () {
      let res, err;
      const options = {};
      const context = mockUtil.makeContext();

      try {
        res = await dal.getUserBasicInfo(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error not_found, if userId not found', async function () {
      let res, err;
      const options = { userId: '912ae2f4-fc91-40fd-9c50-1315a5e8d7f0' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push([], false);

      try {
        res = await dal.getUserBasicInfo(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should return user, by userId', async function () {
      let res, err;
      const options = { userId: 'ac90904b-6329-45d9-be82-240010d8574b' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'ac90904b-6329-45d9-be82-240010d8574b',
            user_name: 'userName',
            email: 'test123@test.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false,
        ['user_name', 'email']
      );

      try {
        res = await dal.getUserBasicInfo(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.userId).toEqual('ac90904b-6329-45d9-be82-240010d8574b');
      expect(res.userName).toEqual('userName');
      expect(res.email).toEqual('userName');
      expect(res.kvp).toEqual('{ "first_name": "first", "last_name": "last" }');
    });
  });

  describe('#getUser', function () {
    it('should throw error, if userId was not passed in', async function () {
      let res, err;
      const options = {};
      const context = mockUtil.makeContext();

      try {
        res = await dal.getUser(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error not_found, if userId not found', async function () {
      let res, err;
      const options = { id: '912ae2f4-fc91-40fd-9c50-1315a5e8d7f0' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push([], false);

      try {
        res = await dal.getUser(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should return user, by userId', async function () {
      let res, err;
      const options = { id: 'ac90904b-6329-45d9-be82-240010d8574b' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'ac90904b-6329-45d9-be82-240010d8574b',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUser(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('ac90904b-6329-45d9-be82-240010d8574b');
      expect(res.name).toEqual('userName');
      expect(res.jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });
  });

  describe('#getUsers', function () {
    it('should return user, when an user get themselves', async function () {
      let res, err;
      const options = { id: '513e96ec-2bea-49a5-9d98-dc74ac19b396' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].name).toEqual('userName');
      expect(res.records[0].jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });

    it('should throw error not_found, if input userId is not valid uuid', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = { id: 'userId' };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should get users, by superadmin, with array orgIds', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = {
        id: 'e625baad-fd1a-4b76-b882-4be41fd85816',
        ids: ['e625baad-fd1a-4b76-b882-4be41fd85816'],
        name: 'name',
        status: 'status',
        organizationIds: [7682, 1234],
        limit: 30,
        offset: 0
      };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].name).toEqual('userName');
      expect(res.records[0].jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });

    it('should get users, by superadmin, with string orgIds', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = {
        id: 'e625baad-fd1a-4b76-b882-4be41fd85816',
        ids: ['e625baad-fd1a-4b76-b882-4be41fd85816'],
        name: 'name',
        status: 'status',
        organizationIds: '7682,1234',
        limit: 30,
        offset: 0
      };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      res = await dal.getUsers(options);

      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].name).toEqual('userName');
      expect(res.records[0].jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });

    it('should get users, by superadmin, no filter orgIds', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = {
        id: 'e625baad-fd1a-4b76-b882-4be41fd85816',
        ids: ['e625baad-fd1a-4b76-b882-4be41fd85816'],
        name: 'name',
        status: 'status',
        limit: 30,
        offset: 0
      };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].name).toEqual('userName');
      expect(res.records[0].jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });

    it('should get all users, by superadmin', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = {};
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].name).toEqual('userName');
      expect(res.records[0].jsondata).toEqual(
        '{ "first_name": "first", "last_name": "last" }'
      );
    });

    it('should get all users, with active status', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = { status: 'active' };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682,
            status: 'active'
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].status).toEqual('active');
    });

    it('should get all users, with active and deleted status', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const options = { statuses: ['active', 'deleted'] };
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682,
            status: 'active'
          },
          {
            user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
            user_name: 'userName2',
            kvp: '{ "first_name": "first", "last_name": "last" }',
            organization_id: 7682,
            status: 'deleted'
          }
        ],
        false,
        ['ug.last_logged_in']
      );

      try {
        res = await dal.getUsers(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[0].status).toEqual('active');
      expect(res.records[1].id).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
      expect(res.records[1].status).toEqual('deleted');
    });
  });

  describe('#getUserMfaInfo', function () {
    it('should get user mfa info by id', async function () {
      let res, err;
      const options = { id: '4bae437b-796f-40a2-b2ce-2192ca987b0e' };

      serviceContext.dbConnections['sso'].read._push([
        {
          phone_number: '123456',
          sms_voice_verified_date_time: '2019-01-01T00:00:01.000Z',
          ga_verified_date_time: '2019-01-01T00:00:01.000Z',
          default_option: true,
          pending_registration: true
        }
      ]);

      try {
        res = await dal.getUserMfaInfo(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.phoneNumber).toEqual('123456');
      expect(res.smsVoiceVerifiedDateTime).toEqual('2019-01-01T00:00:01.000Z');
      expect(res.gaVerifiedDateTime).toEqual('2019-01-01T00:00:01.000Z');
      expect(res.defaultOption).toEqual(true);
      expect(res.pendingRegistration).toEqual(true);
    });
  });

  describe('#getGroups', function () {
    it('should get groups, full filter, and by array orgIds', async function () {
      let res, err;
      const options = {
        groupId: 1000,
        applicationId: 2000,
        ids: [1001, 1002],
        groupName: 'name',
        groupType: 'type',
        organizationIds: [7682, 1234],
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            group_id: 1000,
            group_name: 'name',
            application_id: 2000,
            date_created: '2019-01-01T00:00:01.000Z',
            date_modified: '2019-01-01T00:00:01.000Z'
          }
        ],
        false
      );

      try {
        res = await dal.getGroups(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].groupId).toEqual(1000);
      expect(res.records[0].groupName).toEqual('name');
      expect(res.records[0].applicationId).toEqual(2000);
      expect(res.records[0].dateCreated).toEqual('2019-01-01T00:00:01.000Z');
      expect(res.records[0].dateModified).toEqual('2019-01-01T00:00:01.000Z');
    });

    it('should get groups, full filter, and by string orgIds', async function () {
      let res, err;
      const options = {
        groupId: 1000,
        applicationId: 2000,
        ids: [1001, 1002],
        groupName: 'name',
        groupType: 'type',
        organizationIds: '7682,1234',
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            group_id: 1000,
            group_name: 'name',
            application_id: 2000,
            date_created: '2019-01-01T00:00:01.000Z',
            date_modified: '2019-01-01T00:00:01.000Z'
          }
        ],
        false
      );

      try {
        res = await dal.getGroups(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].groupId).toEqual(1000);
      expect(res.records[0].groupName).toEqual('name');
      expect(res.records[0].applicationId).toEqual(2000);
      expect(res.records[0].dateCreated).toEqual('2019-01-01T00:00:01.000Z');
      expect(res.records[0].dateModified).toEqual('2019-01-01T00:00:01.000Z');
    });

    it('should get all groups, without filter', async function () {
      let res, err;
      const options = {};

      serviceContext.dbConnections['sso'].read._push([
        {
          group_id: 'groupId',
          group_name: 'name',
          application_id: 'applicationId',
          date_created: '2019-01-01T00:00:01.000Z',
          date_modified: '2019-01-01T00:00:01.000Z'
        }
      ]);

      try {
        res = await dal.getGroups(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toEqual(1);
      expect(res.records[0].groupId).toEqual('groupId');
      expect(res.records[0].groupName).toEqual('name');
      expect(res.records[0].applicationId).toEqual('applicationId');
      expect(res.records[0].dateCreated).toEqual('2019-01-01T00:00:01.000Z');
      expect(res.records[0].dateModified).toEqual('2019-01-01T00:00:01.000Z');
    });
  });

  describe('#addUserToOrganization', function () {
    beforeEach(() => {
      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return {
          organizationId: 11111,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      serviceContext.bll.rbacAuth.authGroupAddMembers = jest.fn();
    });
    it('should throw if neither userName nor userId is specified', async () => {
      const context = mockUtil.makeContext();
      const args = {};
      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'Either userId or userName must be specified'
      );
    });

    it('should throw if userId is invalid uuid', async () => {
      const context = mockUtil.makeContext();
      const args = { userId: '0000-1111' };
      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('A user ID must be a valid UUID');
    });

    it('should throw if organizationGuid is invalid uuid', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '0000-1111'
      };
      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'organizationGuid must be specified and be a valid UUID'
      );
    });

    it('should throw if user name is invalid', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000'
      };

      serviceContext.bll.rbacAuth.getAuthGroups.mockReturnValue({
        records: [
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc'
          }
        ]
      });

      serviceContext.dbConnections['sso'].read._push([]);

      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Invalid user name');
    });

    it('should throw if an normal user add other one by org invite', async () => {
      const context = mockUtil.makeContext();
      context._authInfo = {};
      context._authInfo.permissionMasks = [];
      _.set(
        context,
        '_authInfo.userId',
        '00000000-2222-0000-0000-000000000000'
      );
      const args = {
        userId: '00000000-1111-0000-0000-000000000000',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        userName: 'user@veritone.com',
        addByOrgInvite: true
      };

      serviceContext.dbConnections['sso'].read._push([]);

      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        `The authenticated user is now allowed to add user to organization: ${args.organizationGuid}`
      );
    });

    it('should add user to organization successfully', async () => {
      serviceContext.dbConnections['sso'].write._clearResultQueue();
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]); // superAdmin permissions
      _.set(
        serviceContext.config,
        'featureFlags.enableStrictRoleValidation',
        false
      );
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        roleIds: ['00000000-4321-0000-0000-000000000000'],
        priority: 1
      };

      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return {
            records: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc'
              }
            ]
          };
        }
      );

      // when enableStrictRoleValidation is false
      // Check user_id
      serviceContext.dbConnections['sso'].write._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          user_name: 'user1@veritone.com'
        }
      ]);

      // Check group_id
      serviceContext.dbConnections['sso'].write._push([
        {
          group_id: '00000000-1234-0000-0000-000000000000'
        }
      ]);

      // Insert roleIds
      serviceContext.dbConnections['sso'].write._push([{}]);

      serviceContext.dbConnections['sso'].write._push([{}]);

      // get User for mutation return
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-1111-0000-0000-000000000000',
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );

      serviceContext.bll.rbacAuth.authGroupAddMembers.mockImplementation(
        () => {}
      );

      let err, res;
      try {
        res = await dal.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should add user to organization successfully when enableStrictRoleValidation is true', async () => {
      _.set(
        serviceContext.config,
        'featureFlags.enableStrictRoleValidation',
        true
      );
      const dalWithStrictValidation = require('./dalAdmin.js')(
        serviceContext.logger,
        serviceContext.config,
        dalOrg,
        serviceContext
      );

      serviceContext.dbConnections['sso'].write._clearResultQueue();
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.permissionMasks', [
        -2,
        268427519,
        1073741824,
        5189619
      ]);
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        roleIds: ['00000000-4321-0000-0000-000000000000'],
        priority: 1
      };

      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return {
            records: [
              {
                id: '----orgAllAccess----',
                name: 'orgAllAccess',
                description: 'orgAllAccessDesc'
              }
            ]
          };
        }
      );

      // client.manyOrNone (validate roles) returns no invalid roles
      serviceContext.dbConnections['sso'].write._push([], false);

      serviceContext.dbConnections['sso'].write._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          user_name: 'user1@veritone.com'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([
        {
          group_id: '00000000-1234-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([{}]);
      serviceContext.dbConnections['sso'].write._push([{}]);

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-1111-0000-0000-000000000000',
            user_name: 'user1@veritone.com',
            kvp: '{ "first_name": "first", "last_name": "last" }'
          }
        ],
        false
      );

      serviceContext.bll.rbacAuth.authGroupAddMembers.mockImplementation(
        () => {}
      );

      let err, res;
      try {
        res = await dalWithStrictValidation.addUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();

      _.set(
        serviceContext.config,
        'featureFlags.enableStrictRoleValidation',
        false
      );
    });

    describe('legacy role blocking (enableDefaultDesktopApp=true)', function () {
      const LEGACY_ADMIN = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
      const LEGACY_SA = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d';
      const LEGACY_FINANCE_ADMIN = '37b18322-74bf-4ae4-a46f-2cc407a9966c';

      let legacyDal;

      beforeAll(() => {
        _.set(serviceContext.config, 'featureFlags.enableDefaultDesktopApp', true);
        jest.resetModules();
        jest.mock('./util.js');
        require('./util.js').mockImplementation(() => ({
          httpCall: jest.fn(),
          sanitizeField: x => x,
          swapPermissionEnumMap: () => [],
          coreAdminTokensResponseMapper: x => x,
          splitTrim: x => (x || ',').split(','),
          validateRoles: jest.fn()
        }));
        const freshDalOrg = require('./organization.js')(serviceContext);
        legacyDal = require('./dalAdmin.js')(
          serviceContext.logger,
          serviceContext.config,
          freshDalOrg,
          serviceContext
        );
      });

      afterAll(() => {
        _.set(serviceContext.config, 'featureFlags.enableDefaultDesktopApp', false);
      });

      const superAdminContext = () => {
        const ctx = _.cloneDeep(mockUtil.makeContext());
        _.set(ctx, '_authInfo.permissionMasks', [-2, 268427519, 1073741824, 5189619]);
        return ctx;
      };

      const baseArgs = (roleIds) => ({
        userName: 'user@test.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        roleIds,
        priority: 1
      });

      it('should throw for legacy Admin role', async () => {
        let err;
        try {
          await legacyDal.addUserToOrganization(baseArgs([LEGACY_ADMIN]), superAdminContext());
        } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.message).toContain('Cannot assign legacy Admin application roles');
      });

      it('should throw for legacy Super Admin role', async () => {
        let err;
        try {
          await legacyDal.addUserToOrganization(baseArgs([LEGACY_SA]), superAdminContext());
        } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.message).toContain('Cannot assign legacy Admin application roles');
      });

      it('should throw for legacy Finance Admin role', async () => {
        let err;
        try {
          await legacyDal.addUserToOrganization(baseArgs([LEGACY_FINANCE_ADMIN]), superAdminContext());
        } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.message).toContain('Cannot assign legacy Admin application roles');
      });

      it('should throw when legacy role is mixed with valid role IDs', async () => {
        let err;
        try {
          await legacyDal.addUserToOrganization(
            baseArgs([LEGACY_ADMIN, '00000000-4321-0000-0000-000000000000']),
            superAdminContext()
          );
        } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.message).toContain('Cannot assign legacy Admin application roles');
      });

      it('should not throw a legacy-role error when roleIds is empty', async () => {
        // Empty roleIds skips the legacy check entirely; any error is downstream, not a legacy-role block
        let err;
        try {
          await legacyDal.addUserToOrganization(baseArgs([]), superAdminContext());
        } catch (e) { err = e; }
        if (err) {
          expect(err.message).not.toContain('Cannot assign legacy Admin application roles');
        }
      });
    });
  });

  describe('#getAuthGroupsForUser', function () {
    beforeEach(() => {
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      serviceContext.bll.rbacAuth.authGroupAddMembers = jest.fn();
    });

    it('missing the input', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      let err, res;
      try {
        res = await dal.getAuthGroupsForUser();
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain('Failed to get authGroups for the user:');
      expect(err.message).toContain('Missing the input');
    });

    it('missing organizationGuid in the input', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const args = {};
      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain('Failed to get authGroups for the user:');
      expect(err.message).toContain('Missing or invalid organizationGuid');
    });

    it('get org by organizationGuid if it is not passed in the input - No default groups, no roles', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const args = { organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1' };

      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return {
          organizationId: 11111,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });

    it('organization is not passed in: organization has defaultAuthGroups [] in kvp, no roleIds', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const args = { organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1' };

      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return org;
      });

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res).toEqual([
        {
          id: '----orgAllAccess----',
          name: 'orgAllAccess',
          description: 'orgAllAccessDesc',
          defaultGroup: 'orgAllAccess'
        }
      ]);
    });

    it('organization is not passed in: organization has defaultAuthGroups [] in kvp, has roleIds', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081']
      };

      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      serviceContext.dal.organization.getOrganization = jest.fn(() => {
        return org;
      });

      const groupByRoleIds = {
        records: [
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ]
      };
      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return groupByRoleIds;
        }
      );

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res).toEqual(
        expect.arrayContaining([
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc',
            defaultGroup: 'orgAllAccess'
          },
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ])
      );
    });

    it('organization is passed in: organization has defaultAuthGroups [] in kvp, no roleIds', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();

      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };
      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        organization: org
      };

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res).toEqual(
        expect.arrayContaining([
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc',
            defaultGroup: 'orgAllAccess'
          }
        ])
      );
    });

    it('organization is passed in: organization has defaultAuthGroups [] in kvp, has roleIds', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081'],
        organization: org
      };

      const groupByRoleIds = {
        records: [
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ]
      };
      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return groupByRoleIds;
        }
      );

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res).toEqual(
        expect.arrayContaining([
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc',
            defaultGroup: 'orgAllAccess'
          },
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ])
      );
    });

    it('organization is passed in: organization has defaultAuthGroups [] in kvp, has admin roleId', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        roleIds: [
          '912e377e-f4a4-4184-8db1-baa9670d8081',
          'ddca9b68-d775-4934-8ffd-7aecc779b652' // Admin role
        ],
        organization: org
      };

      const groupByRoleIds = {
        records: [
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ]
      };
      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return groupByRoleIds;
        }
      );

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(3);
      expect(res).toEqual(
        expect.arrayContaining([
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc',
            defaultGroup: 'orgAllAccess'
          },
          {
            id: '----orgAdmin----',
            name: 'orgAdmin',
            description: 'orgAdminDesc',
            defaultGroup: 'orgAdmin'
          },
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ])
      );
    });

    it('normal user - no roles', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        organization: org
      };

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1); // only have the default organization group
      expect(res).toEqual(
        expect.arrayContaining([org.kvp.defaultAuthGroups[0]])
      );
    });

    it('admin user', async () => {
      serviceContext.bll.rbacAuth.getAuthGroups = jest.fn();
      const context = mockUtil.makeContext();
      const org = {
        organizationId: 11111,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          },
          defaultAuthGroups: [
            {
              id: '----orgAllAccess----',
              name: 'orgAllAccess',
              description: 'orgAllAccessDesc',
              defaultGroup: 'orgAllAccess'
            },
            {
              id: '----orgAdmin----',
              name: 'orgAdmin',
              description: 'orgAdminDesc',
              defaultGroup: 'orgAdmin'
            }
          ]
        }
      };

      const args = {
        organizationGuid: '3e827747-0572-4da3-836e-0e8f60a2d1a1',
        organization: org,
        roleIds: [
          '912e377e-f4a4-4184-8db1-baa9670d8081',
          'ddca9b68-d775-4934-8ffd-7aecc779b652' // Admin role
        ]
      };

      // this func will be called one time (for roleIds)
      serviceContext.bll.rbacAuth.getAuthGroups.mockImplementation(
        (context, args) => {
          return {
            records: [
              {
                id: 'test3',
                name: 'org group test 3',
                description: 'org group desc'
              }
            ]
          };
        }
      );

      let err, res;
      try {
        res = await dal.getAuthGroupsForUser(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toEqual(3);
      expect(res).toEqual(
        expect.arrayContaining([
          {
            id: '----orgAllAccess----',
            name: 'orgAllAccess',
            description: 'orgAllAccessDesc',
            defaultGroup: 'orgAllAccess'
          },
          {
            id: '----orgAdmin----',
            name: 'orgAdmin',
            description: 'orgAdminDesc',
            defaultGroup: 'orgAdmin'
          },
          {
            id: 'test3',
            name: 'org group test 3',
            description: 'org group desc'
          }
        ])
      );
    });
  });

  describe('#removeUserFromOrganization', function () {
    it('should throw if neither userName nor userId is specified', async () => {
      const context = mockUtil.makeContext();
      const args = {};
      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'Either userId or userName must be specified'
      );
    });

    it('should throw if userId is invalid uuid', async () => {
      const context = mockUtil.makeContext();
      const args = { userId: '0000-1111' };
      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('A user ID must be a valid UUID');
    });

    it('should throw if organizationGuid is invalid uuid', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '0000-1111'
      };
      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'organizationGuid must be specified and be a valid UUID'
      );
    });

    it('should throw if user name is invalid', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000'
      };

      serviceContext.dbConnections['sso'].read._push([]);

      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain('Invalid user name');
    });

    it('should remove user from organization successfully', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000'
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          user_name: 'user1@veritone.com'
        }
      ]);

      // for checking if user belongs to the organization
      serviceContext.dbConnections['sso'].read._push([{ count: 1 }]);

      // for checking if user belongs to other organizations
      serviceContext.dbConnections['sso'].read._push([{ count: 2 }]);

      // DELETE FROM sso_user__sso_group
      serviceContext.dbConnections['sso'].write._push([{}]);

      // DELETE FROM sso_user_role
      serviceContext.dbConnections['sso'].write._push([{}]);

      // DELETE FROM rbac_auth_group_member
      serviceContext.dbConnections['sso'].write._push([{}]);

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-1111-0000-0000-000000000000',
            user_name: 'user1@veritone.com'
          }
        ],
        false
      );

      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should throw if user does not belong to the organization', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000'
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          user_name: 'user1@veritone.com'
        }
      ]);

      // for checking if user belongs to the organization
      serviceContext.dbConnections['sso'].read._push([{ count: 0 }]);

      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.message).toContain('does not belong to organization');
      expect(res).toBeUndefined();
    });

    it('should throw if user does not belong to any other organization', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000'
      };

      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          user_name: 'user1@veritone.com'
        }
      ]);

      // for checking if user belongs to the organization
      serviceContext.dbConnections['sso'].read._push([{ count: 1 }]);

      // for checking if user belongs to other organizations
      serviceContext.dbConnections['sso'].read._push([{ count: 0 }]);

      let err, res;
      try {
        res = await dal.removeUserFromOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'can not be removed from the only one organization'
      );
      expect(res).toBeUndefined();
    });
  });

  describe('#_loadCheckAccessUserSetting', function () {
    it('should throw error - Not allow to access user setting of other users', async function () {
      let res, err;
      const input = {
        userId: '278778af-f44c-4c76-a35e-bab8c2c5d27c'
      };

      try {
        res = await dal._loadCheckAccessUserSetting(ctxRegularUser, input);
      } catch (error) {
        expect(error.message).toEqual(
          'Not allow to access user setting of other users'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(res).toBeUndefined();
    });

    it('should throw error - userId is required when using apiToken', async function () {
      let res, err;
      const input = {};

      try {
        res = await dal._loadCheckAccessUserSetting(ctxApiKey, input);
      } catch (error) {
        expect(error.message).toEqual('userId is required when using apiToken');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should load check access for user setting success', async function () {
      let res, err;
      const input = {
        userId: '278778af-f44c-4c76-a35e-bab8c2c5d27c',
        applicationId: '9a005428-fd96-4f8a-ae99-0355a81246c5'
      };

      // getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '278778af-f44c-4c76-a35e-bab8c2c5d27c',
            kvp: { first_name: 'test', last_name: 'name' }
          }
        ],
        false
      );
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '9a005428-fd96-4f8a-ae99-0355a81246c5' }],
        false
      );

      try {
        res = await dal._loadCheckAccessUserSetting(ctxSuperAdmin, input);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual('278778af-f44c-4c76-a35e-bab8c2c5d27c');
    });
  });

  describe('#setUserSetting', function () {
    it('should set user setting success - update setting', async function () {
      let res, err;
      const args = {
        input: {
          reset: false,
          userId: '4bc877d3-169f-44ce-96dc-d24b18ba4f76',
          application: '3c1c1bf6-fdf9-4e8a-b513-a0855727c151',
          key: 'test.key',
          value: 'test value 1'
        }
      };

      // getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '4bc877d3-169f-44ce-96dc-d24b18ba4f76',
            kvp: { first_name: 'test 1', last_name: 'name 1' }
          }
        ],
        false
      );
      // serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '9a005428-fd96-4f8a-ae99-0355a81246c5' }],
        false,
        ['ao.organization_id']
      );
      // _getUserSettingDb
      serviceContext.dbConnections['sso'].read._push(
        [{ user_id: '4bc877d3-169f-44ce-96dc-d24b18ba4f76', key: 'test.key' }],
        false
      );
      // _updateUserSettingDb
      serviceContext.dbConnections['sso'].write._push([
        {
          user_id: '4bc877d3-169f-44ce-96dc-d24b18ba4f76',
          key: 'test.key',
          value: 'test value 1',
          application_id: '3c1c1bf6-fdf9-4e8a-b513-a0855727c151'
        }
      ]);

      try {
        res = await dal.setUserSetting(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.userId).toEqual('4bc877d3-169f-44ce-96dc-d24b18ba4f76');
      expect(res.key).toEqual('test.key');
      expect(res.value).toEqual('test value 1');
      expect(res.applicationId).toEqual('3c1c1bf6-fdf9-4e8a-b513-a0855727c151');
    });

    it('should set user setting success - insert setting', async function () {
      let res, err;
      const args = {
        input: {
          reset: false,
          userId: '798703d6-09d4-4310-8c24-c3069c873ffa',
          application: '43295dc5-4472-402e-8e10-3c153864be27',
          key: 'test.key.setting',
          value: 'test value 2'
        }
      };

      // getUser
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '798703d6-09d4-4310-8c24-c3069c873ffa',
            kvp: { first_name: 'test 2', last_name: 'name 2' }
          }
        ],
        false
      );
      // serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '43295dc5-4472-402e-8e10-3c153864be27' }],
        false,
        ['ao.organization_id']
      );
      // _getUserSettingDb
      serviceContext.dbConnections['sso'].read._push([], false);
      // _insertUserSettingDb
      serviceContext.dbConnections['sso'].write._push([
        {
          user_id: '798703d6-09d4-4310-8c24-c3069c873ffa',
          key: 'test.key.setting',
          value: 'test value 2',
          application_id: '43295dc5-4472-402e-8e10-3c153864be27'
        }
      ]);

      try {
        res = await dal.setUserSetting(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.userId).toEqual('798703d6-09d4-4310-8c24-c3069c873ffa');
      expect(res.key).toEqual('test.key.setting');
      expect(res.value).toEqual('test value 2');
      expect(res.applicationId).toEqual('43295dc5-4472-402e-8e10-3c153864be27');
    });
  });

  describe('#upsertUserSetting', function () {
    const USER_ID = '4bc877d3-169f-44ce-96dc-d24b18ba4f76';

    /** Minimal pg-promise transaction stand-in that records the statements issued through it. */
    function fakeTrans() {
      const statements = [];
      const record = (sql, values) => {
        statements.push({ sql, values });
      };
      return {
        statements,
        existing: [],
        map: async function (sql, values) {
          record(sql, values);
          return this.existing;
        },
        one: async function (sql, values) {
          record(sql, values);
          return { user_id: USER_ID, key: 'tos-file-id', value: 'ts' };
        }
      };
    }

    it('should insert through the supplied transaction when no setting exists', async function () {
      const trans = fakeTrans();

      const res = await dal.upsertUserSetting(
        { userId: USER_ID, key: 'tos-file-id', value: 'Mon, 24 Aug 2026 00:00:00 GMT' },
        trans
      );

      expect(res).toBeDefined();
      // Read then write, both on the transaction handle rather than a pooled connection.
      expect(trans.statements).toHaveLength(2);
      expect(trans.statements[0].sql).toContain('public.user_setting');
      expect(trans.statements[1].sql).toContain('INSERT');
    });

    it('should update through the supplied transaction when a setting already exists', async function () {
      const trans = fakeTrans();
      trans.existing = [{ userId: USER_ID, key: 'tos-file-id' }];

      await dal.upsertUserSetting(
        { userId: USER_ID, key: 'tos-file-id', value: 'Mon, 24 Aug 2026 00:00:00 GMT' },
        trans
      );

      expect(trans.statements).toHaveLength(2);
      expect(trans.statements[1].sql).toContain('UPDATE public.user_setting');
    });

    it('should read within the transaction, not from a pooled connection', async function () {
      // Reading outside the transaction would miss the caller's own uncommitted rows and turn an
      // update into a duplicate insert.
      const trans = fakeTrans();
      const replicaRead = jest.spyOn(serviceContext.dbConnections['sso'].read, 'map');
      const primaryRead = jest.spyOn(serviceContext.dbConnections['sso'].write, 'map');

      await dal.upsertUserSetting(
        { userId: USER_ID, key: 'tos-file-id', value: 'ts' },
        trans
      );

      expect(replicaRead).not.toHaveBeenCalled();
      expect(primaryRead).not.toHaveBeenCalled();
      expect(trans.statements[0].values).toContain(USER_ID);

      replicaRead.mockRestore();
      primaryRead.mockRestore();
    });

    it('should fall back to the sso write pool when no client is supplied', async function () {
      // Both the existence check and the write have to land on the primary; reading the replica
      // here would let replication lag turn an update into a duplicate insert. The two pools share
      // one mock result queue, so the pool that was used is only visible through the call spies.
      const writePool = serviceContext.dbConnections['sso'].write;
      const readPool = serviceContext.dbConnections['sso'].read;
      const replicaRead = jest.spyOn(readPool, 'map');
      const primaryRead = jest.spyOn(writePool, 'map');
      const primaryWrite = jest.spyOn(writePool, 'one');

      writePool._clearResultQueue();
      writePool._push([], true, ['public.user_setting']);
      writePool._push([{ user_id: USER_ID }], true, ['INSERT']);

      const res = await dal.upsertUserSetting({
        userId: USER_ID,
        key: 'tos-file-id',
        value: 'Mon, 24 Aug 2026 00:00:00 GMT'
      });

      expect(res).toBeDefined();
      expect(primaryRead).toHaveBeenCalledTimes(1);
      expect(primaryWrite).toHaveBeenCalledTimes(1);
      expect(replicaRead).not.toHaveBeenCalled();

      replicaRead.mockRestore();
      primaryRead.mockRestore();
      primaryWrite.mockRestore();
    });

    it('should require userId, key and value', async function () {
      const trans = fakeTrans();
      const cases = [
        { key: 'k', value: 'v' },
        { userId: USER_ID, value: 'v' },
        { userId: USER_ID, key: 'k' }
      ];

      for (const options of cases) {
        let err;
        try {
          await dal.upsertUserSetting(options, trans);
        } catch (e) {
          err = e;
        }
        expect(err).toBeDefined();
      }

      expect(trans.statements).toHaveLength(0);
    });
  });

  describe('#removeUserSettings', function () {
    it('should throw error - user setting not found!', async function () {
      let res, err;
      const args = {
        input: {
          userId: '1f8030c7-6a51-499f-80fd-f156aa5111f2',
          application: 'e1ca1e23-ebd3-4ba6-ab85-3fbe018e10db',
          keys: ['test.key.setting']
        }
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '1f8030c7-6a51-499f-80fd-f156aa5111f2',
            kvp: { first_name: 'test 1', last_name: 'name 2' }
          }
        ],
        false
      );
      // serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'e1ca1e23-ebd3-4ba6-ab85-3fbe018e10db' }],
        false,
        ['ao.organization_id']
      );
      // end _loadCheckAccessUserSetting
      serviceContext.dbConnections['sso'].write._push([]);

      try {
        res = await dal.removeUserSettings(ctxSuperAdmin, args);
      } catch (error) {
        expect(error.message).toEqual('user setting not found!');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should remove user setting success', async function () {
      let res, err;
      const args = {
        input: {
          reset: true,
          userId: 'd24e732a-619f-4f0c-9c5c-49105171a02d',
          application: 'e54125cb-92be-4ab8-aae1-c6f0694516aa',
          keys: ['test.key.setting.new']
        }
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'd24e732a-619f-4f0c-9c5c-49105171a02d',
            kvp: { first_name: 'test 2', last_name: 'name 3' }
          }
        ],
        false
      );
      // serviceContext.dal.organization.getBusinessUnit
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'e54125cb-92be-4ab8-aae1-c6f0694516aa' }],
        false,
        ['ao.organization_id']
      );
      // end _loadCheckAccessUserSetting
      serviceContext.dbConnections['sso'].write._push([
        {
          user_id: 'd24e732a-619f-4f0c-9c5c-49105171a02d',
          key: 'test.key.setting.new',
          application_id: 'e54125cb-92be-4ab8-aae1-c6f0694516aa'
        }
      ]);

      try {
        res = await dal.removeUserSettings(ctxSuperAdmin, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.userId).toEqual('d24e732a-619f-4f0c-9c5c-49105171a02d');
    });
  });

  describe('#getRole', function () {
    it('should throw error, if roleId was not passed in', async function () {
      let res, err;
      const options = {};
      const context = mockUtil.makeContext();

      try {
        res = await dal.getRole(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error not_found, if roleId not found', async function () {
      let res, err;
      const options = { id: '9a0b116f-546d-4839-95ca-88aee5e0aa33' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push([], false);

      try {
        res = await dal.getRole(options.id);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(res).toBeUndefined();
    });

    it('should return role, by roleId', async function () {
      let res, err;
      const options = { id: 'a78aeca4-1b78-4a5d-9872-60ce134af593' };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            role_id: 'a78aeca4-1b78-4a5d-9872-60ce134af593',
            role_name: 'role_name',
            app_name: 'app_name'
          }
        ],
        false
      );

      try {
        res = await dal.getRole(options.id);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toEqual('a78aeca4-1b78-4a5d-9872-60ce134af593');
      expect(res.name).toEqual('role_name');
      expect(res.appName).toEqual('app_name');
    });
  });

  describe('#switchUserToOrganization', function () {
    it('should throw if organizationGuid is invalid uuid', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '0000-1111',
        token: 'user-token'
      };
      let err, res;
      try {
        res = await dal.switchUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(
        'organizationGuid must be specified and be a valid UUID'
      );
    });

    it('should throw if user is not found', async () => {
      const context = mockUtil.makeContext();
      const args = {
        userName: 'user@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        token: 'user-token'
      };

      serviceContext.dbConnections['sso'].read._push(
        [],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/lower\(user_name\)/);
          expect(sql).toMatch(/lower\(email\)/);
          expect(sql).toMatch(/user_id/);

          expect(params[0]).toEqual(_.toLower(args.userName));
          expect(params[1]).toEqual(_.get(context, '_authInfo.userId'));

          return true;
        }
      );

      let err, res;
      try {
        res = await dal.switchUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toContain(`User ${args.userName} not found`);
    });

    it('should switch user to organization successfully', async () => {
      const context = mockUtil.makeContext();
      _.set(context, 'config.services.coreAdminUri', 'http://example.com/');
      const args = {
        userName: 'user1@veritone.com',
        organizationGuid: '00000000-1234-0000-0000-000000000000',
        token: 'user-token'
      };

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'ac90904b-6329-45d9-be82-240010d8574b',
            user_name: args.userName
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/lower\(user_name\)/);
          expect(sql).toMatch(/lower\(email\)/);
          expect(sql).toMatch(/user_id/);

          expect(params[0]).toEqual(_.toLower(args.userName));
          expect(params[1]).toEqual(_.get(context, '_authInfo.userId'));

          return true;
        }
      );

      jest.mock('request-promise', () => (payload) => {
        expect(payload.body).toEqual({
          userName: args.userName,
          token: args.token,
          organizationGuid: args.organizationGuid
        });

        return {};
      });

      let err, res;
      try {
        res = await dal.switchUserToOrganization(args, context);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
    });
  });

  describe('#_validateUserWriteAccess', function () {
    it('should throw error when requester is regular user', async function () {
      let err;
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      try {
        await dal._validateUserWriteAccess(context, 'user_id');
      } catch (error) {
        expect(error.message).toEqual(
          'Only superadmin or organization admin can update a user.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should throw error when an org admin updates a user from another org', async function () {
      let err;
      const context = mockUtil.makeContext({ authRole: 'orgAdmin' });
      serviceContext.dal.organization.getOrganizationIdAndGuidForUser.mockReturnValue(
        [{ id: 1, priority: 0 }]
      );

      try {
        await dal._validateUserWriteAccess(context, 'user_id');
      } catch (error) {
        expect(error.message).toEqual(
          'Organization admin cannot update a user from another organization.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
    });

    it('should pass when requester is regular user', async function () {
      let err;
      const context = mockUtil.makeContext();
      try {
        await dal._validateUserWriteAccess(context, 'user_id');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });
});
