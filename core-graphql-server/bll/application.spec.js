const _ = require('lodash');
const jwt = require('jsonwebtoken');
const mockUtil = require('../test/mockUtil.js')();
const constants = require('../util/appConstants.js')({});
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();
const serviceContext1 = _.cloneDeep(serviceContext);

// request-promise is only reachable transitively (application.js -> dal/util.js
// -> request-promise), and serviceContext.mock.js already jest.mock()'d it
// (bare auto-mock) as a side effect of building serviceContext above. Setting
// the implementation here - rather than a second static jest.mock(factory),
// which babel-jest-hoist would hoist above the serviceContext construction
// and get clobbered by its bare jest.mock('request-promise') - customizes
// that same auto-mock once, equivalent to the old jest.resetModules() +
// re-require-every-test cycle without re-parsing the dependency chain per test.
require('request-promise').mockImplementation(() => {
  return {
    application_id: 'b354ea39-88ee-4f1b-b81e-0e71f2630ac2'
  };
});

// When the RBAC feature is enabled, a different bll is used.
_.set(serviceContext1, 'config.featureFlags.enableRBACFeature', true);
serviceContext1.bll.rbacAuth = {
  filterAuthGroupIdsByRights: jest.fn(),
  deleteAppRoleAuthObjectsTx: jest.fn(),
  emitReloadSessionUsersEvent: jest.fn()
};
serviceContext1.logger.error = jest.fn();

const bll = require('./application.js')(serviceContext);
const bll1 = require('./application.js')(serviceContext1);

let context;
describe('bll application tests', function () {
  beforeEach(() => {
    context = mockUtil.makeContext();
    serviceContext._clearAll();
    serviceContext1._clearAll();
    jest.clearAllMocks();
  });
  describe('#require', function () {
    it('should load module', function () {
      expect(bll).toEqual(expect.any(Object));
      expect(Object.keys(bll).length).toEqual(10);
    });
  });

  describe('#getApplicationRights', function () {
    it('should throw error - invalid input - roleIds cannot be null or empty', async function () {
      let res, err;
      const options = {
        roleIds: 'invalid'
      };

      try {
        res = await bll.getApplicationRights(context, options);
      } catch (error) {
        expect(error.message).toEqual('roleIds cannot be null or empty');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw error - invalid input - invalid input roleIds', async function () {
      let res, err;
      const options = {
        roleIds: [
          '4b8e951c-0b3e-4a97-a2cf-b8c164832b68',
          '5fd25853-64bb-47a5-b66a-47c395741db1'
        ]
      };

      // getRoles
      serviceContext.dbConnections['sso'].read._push([]);

      try {
        res = await bll.getApplicationRights(context, options);
      } catch (error) {
        expect(error.message).toEqual('inavlid input roleIds');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should get application rights array', async function () {
      let res, err;
      const options = {
        roleIds: [
          '4b8e951c-0b3e-4a97-a2cf-b8c164832b68',
          '5fd25853-64bb-47a5-b66a-47c395741db1'
        ]
      };

      // getRoles
      serviceContext.dbConnections['sso'].read._push([
        { id: '4b8e951c-0b3e-4a97-a2cf-b8c164832b68', permissions: [8188] },
        {
          id: '5fd25853-64bb-47a5-b66a-47c395741db1',
          permissions: [0, 268427264]
        }
      ]);

      try {
        res = await bll.getApplicationRights(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(res.includes('admin.access')).toEqual(true);
      expect(res.includes('discovery.access')).toEqual(true);
      expect(err).toBeUndefined();
    });
  });

  describe('#createApplicationJwtToken', function () {
    it('should throw error - invalid input - roleIds cannot be empty', async function () {
      let res, err;

      try {
        res = await bll.createApplicationJwtToken(context);
      } catch (error) {
        expect(error.message).toEqual('roleIds cannot be empty');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw error - invalid input - invalid application', async function () {
      let res, err;
      const roleIds = [
        'a70e8b10-84ec-479c-808c-ee83ef12a079',
        '0e1502ad-7592-4dbb-aff1-74ba644c5e6c'
      ];

      try {
        res = await bll.createApplicationJwtToken(context, null, null, roleIds);
      } catch (error) {
        expect(error.message).toEqual('invalid application');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create application JWT token', async function () {
      let res, err;
      const application = { id: '95ede54e-f155-4780-9c47-cf9c5885e258' };
      const jwtContext = {
        orgGuid: '3e703b9c-7dbd-446d-b148-557ed9118dfa',
        organizationId: 7682,
        userId: '877ddd20-bbb1-42c4-8dba-b7a0f5ec440a'
      };
      const roleIds = [
        'a70e8b10-84ec-479c-808c-ee83ef12a079',
        '0e1502ad-7592-4dbb-aff1-74ba644c5e6c'
      ];

      // getApplicationRights - getRoles
      serviceContext.dbConnections['sso'].read._push([
        { id: 'a70e8b10-84ec-479c-808c-ee83ef12a079', permissions: [8188] },
        {
          id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c',
          permissions: [0, 268427264]
        }
      ]);

      try {
        res = await bll.createApplicationJwtToken(
          context,
          application,
          jwtContext,
          roleIds
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(jwt.decode(res)).toEqual({
        contentApplicationId: jwtContext.orgGuid,
        contentOrganizationId: jwtContext.organizationId,
        tokenApplicationId: application.id,
        userId: jwtContext.userId,
        scope: [
          {
            actions: expect.any(Array),
            resources: { applicationId: application.id }
          }
        ],
        iat: expect.any(Number),
        exp: expect.any(Number),
        sub: 'engine-run',
        jti: expect.any(String)
      });
    });

    it('should create application JWT token with authGroupIds', async function () {
      let res, err;
      const application = { id: '95ede54e-f155-4780-9c47-cf9c5885e258' };
      const jwtContext = {
        orgGuid: '3e703b9c-7dbd-446d-b148-557ed9118dfa',
        organizationId: 7682,
        userId: '877ddd20-bbb1-42c4-8dba-b7a0f5ec440a'
      };
      const roleIds = [
        'a70e8b10-84ec-479c-808c-ee83ef12a079',
        '0e1502ad-7592-4dbb-aff1-74ba644c5e6c'
      ];

      // getApplicationRights - getRoles
      serviceContext1.dbConnections['sso'].read._push([
        { id: 'a70e8b10-84ec-479c-808c-ee83ef12a079', permissions: [8188] },
        {
          id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c',
          permissions: [0, 268427264]
        }
      ]);

      // get organization in mainUtil.isEnableFeatureInOrganization
      serviceContext1.dbConnections['media_platform'].read._push([{}]);
      serviceContext1.dbConnections['media_platform'].read._push([
        {
          organizationId: 7682,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        }
      ]);

      serviceContext1.bll.rbacAuth.filterAuthGroupIdsByRights.mockResolvedValueOnce(
        []
      );

      const newContext = {
        _authInfo: {
          permissionMasks: [-2, 268427519, 1073741824, 5189619] // superadmin permissionMarks
        }
      };

      try {
        res = await bll1.createApplicationJwtToken(
          newContext,
          application,
          jwtContext,
          roleIds
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(err).toBeUndefined();
      expect(
        serviceContext1.bll.rbacAuth.filterAuthGroupIdsByRights
      ).toHaveBeenCalled();
      expect(jwt.decode(res)).toEqual({
        authGroups: expect.any(Array),
        contentApplicationId: jwtContext.orgGuid,
        contentOrganizationId: jwtContext.organizationId,
        tokenApplicationId: application.id,
        userId: jwtContext.userId,
        scope: [
          {
            actions: expect.any(Array),
            resources: { applicationId: application.id }
          }
        ],
        iat: expect.any(Number),
        exp: expect.any(Number),
        sub: 'engine-run',
        jti: expect.any(String)
      });
    });
  });

  describe('#getApplicationJWTToken', function () {
    it('should throw error - invalid input - applicationId is required', async function () {
      let res;
      const args = { input: {} };

      try {
        res = await bll.getApplicationJWTToken(context, args);
      } catch (error) {
        expect(error.message).toEqual('applicationId is required');
      }

      expect(res).toBeUndefined();
    });

    it('should throw error - invalid input - roleIds cannot be null or empty', async function () {
      let res;
      const args = {
        input: {
          appId: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394',
          orgId: 7682
        }
      };

      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb' }],
        false
      );

      serviceContext.dbConnections['sso'].read._push([{ foo: 'bar' }], false); // no valid roles

      try {
        res = await bll.getApplicationJWTToken(context, args);
      } catch (error) {
        expect(error.message).toEqual(
          'roleIds are not provided and cannot be deduced from other inputs'
        );
      }

      expect(res).toBeUndefined();
    });

    it('should throw error - when not called by a super admin or admin.create_application_jwt, roleIds must be null or empty', async function () {
      let res;
      const args = {
        input: {
          appId: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394',
          orgId: 7682,
          roleIds: [
            'a70e8b10-84ec-479c-808c-ee83ef12a079',
            '0e1502ad-7592-4dbb-aff1-74ba644c5e6c'
          ]
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'ed075985-bc94-406b-8639-44d1da42c3fb' }],
        false
      );

      // get role ids
      serviceContext.dbConnections['sso'].read._push([
        { role_id: 'a70e8b10-84ec-479c-808c-ee83ef12a079' },
        { role_id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c' }
      ]);

      // fpl.permission.admin.org.read only
      context._authInfo.permissionMasks = [8];

      try {
        res = await bll.getApplicationJWTToken(context, args);
      } catch (error) {
        expect(error.message).toEqual(
          'when not called by a super admin or admin.create_application_jwt, roleIds must be null or empty'
        );
      }

      expect(res).toBeUndefined();
    });

    it('should create application JWT token with Super Admin Permission', async function () {
      const args = {
        input: {
          appId: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394',
          orgId: 7682
        },
        applicationId: 'a41103db-3b1f-417e-b544-4132b6b5f162'
      };

      // get role ids
      serviceContext.dbConnections['sso'].read._push(
        [
          { role_id: 'a70e8b10-84ec-479c-808c-ee83ef12a079' },
          { role_id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c' }
        ],
        false
      );

      // get business unit
      serviceContext.dbConnections['media_platform'].read._push([]);

      // getApplication - getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394' }],
        false
      );

      // createApplicationJwtToken - getApplicationRights - getRoles
      serviceContext.dbConnections['sso'].read._push(
        [
          { id: 'a70e8b10-84ec-479c-808c-ee83ef12a079', permissions: [8188] },
          {
            id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c',
            permissions: [0, 268427264]
          }
        ],
        false
      );

      const res = await bll.getApplicationJWTToken(context, args);

      expect(res.applicationId).toEqual('7e9497f2-6771-477b-ad1a-a5ec1cf6f394');
      expect(res.organizationId).toEqual(7682);
    });

    it('should create application JWT token with both cms.media.read and aiware.tdo.read permissions', async function () {
      const args = {
        input: {
          appId: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394',
          orgId: 7682,
          roleIds: ['a70e8b10-84ec-479c-808c-ee83ef12a079']
        },
        organizationId: 7682,
        applicationId: 'a41103db-3b1f-417e-b544-4132b6b5f162'
      };

      // get business unit
      serviceContext.dbConnections['media_platform'].read._push([]);

      // getApplication - getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394' }],
        false
      );

      // createApplicationJwtToken - getApplicationRights - getRoles
      serviceContext.dbConnections['sso'].read._push([
        {
          id: 'a70e8b10-84ec-479c-808c-ee83ef12a079',
          permissions: [-62930944, 3, 33292288, 0, 33554424]
        }
      ]);

      const res = await bll.getApplicationJWTToken(context, args);

      expect(res.applicationId).toEqual('7e9497f2-6771-477b-ad1a-a5ec1cf6f394');
      expect(res.organizationId).toEqual(7682);

      const decodedToken = jwt.decode(res.token);
      const rights = _.get(decodedToken, 'scope[0].actions');

      expect(rights.includes('cms.media.read')).toBe(true);
      expect(rights.includes('aiware.tdo.read')).toBe(true);
    });

    it('should create application JWT token with admin.create_application_jwt permission', async function () {
      const args = {
        input: {
          appId: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394',
          orgId: 7682,
          roleIds: [
            'a70e8b10-84ec-479c-808c-ee83ef12a079',
            '0e1502ad-7592-4dbb-aff1-74ba644c5e6c'
          ]
        },
        organizationId: 7682,
        applicationId: 'a41103db-3b1f-417e-b544-4132b6b5f162'
      };

      // get business unit
      serviceContext.dbConnections['media_platform'].read._push([]);

      // getApplication - getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: '7e9497f2-6771-477b-ad1a-a5ec1cf6f394' }],
        false
      );

      // createApplicationJwtToken - getApplicationRights - getRoles
      serviceContext.dbConnections['sso'].read._push([
        { id: 'a70e8b10-84ec-479c-808c-ee83ef12a079', permissions: [8188] },
        {
          id: '0e1502ad-7592-4dbb-aff1-74ba644c5e6c',
          permissions: [0, 268427264]
        }
      ]);

      // with only admin.create_application_jwt permission
      context._authInfo.permissionMasks = [0, 0, 0, -2147483648];

      const res = await bll.getApplicationJWTToken(context, args);

      expect(res.applicationId).toEqual('7e9497f2-6771-477b-ad1a-a5ec1cf6f394');
      expect(res.organizationId).toEqual(7682);
    });
  });

  describe('#removeApplicationEventEndpoint', function () {
    it('should remove application event endpoint', async function () {
      const args = { id: 'b354ea39-88ee-4f1b-b81e-0e71f2630ac2' };

      // allowedToEditApplication -> getApplications
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'b354ea39-88ee-4f1b-b81e-0e71f2630ac2' }],
        false
      );

      // use Super Admin Permission
      context._authInfo.permissionMasks = [2];

      try {
        const res = await bll.removeApplicationEventEndpoint(
          {
            ...context,
            config: {
              services: {
                coreAdminUri: ''
              }
            }
          },
          args
        );

        expect(res).toBeDefined();
        expect(res.id).toEqual('b354ea39-88ee-4f1b-b81e-0e71f2630ac2');
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });

  describe('#getApplicationRolesByAppId', function () {
    let _bll;
    beforeAll(function () {
      _bll = require('./application.js')(serviceContext);
    });
    beforeEach(function () {
      context = mockUtil.makeContext();
      serviceContext._clearAll();
      jest.clearAllMocks();
      serviceContext.dal.admin.getRolesForUser = jest.fn();
      serviceContext.dal.role.getRoles = jest.fn();
    });

    it('should throw an error if appId is not passed in', async function () {
      try {
        const res = await _bll.getApplicationRolesByAppId(context, null);
        expect(res).toBeUndefined();
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(`${error}`).toContain('appId is required');
      }
    });

    it('should throw an error if appId is invalid', async function () {
      try {
        const res = await _bll.getApplicationRolesByAppId(
          context,
          'invalid_uuid'
        );
        expect(res).toBeUndefined();
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(`${error}`).toContain('appId is invalid');
      }
    });

    it(`should get user's roles if ownedOnly = true/ not passed in`, async function () {
      const appId = 'a8736464-41d5-4f23-a781-639145c99cfc';
      const ownedOnly = true;
      const mockData = [
        {
          id: 'role_id1',
          name: 'role_name1',
          description: 'description1',
          applicationId: appId,
          isPrivate: true,
          permissions: []
        },
        {
          id: 'role_id2',
          name: 'role_name2',
          description: 'description2',
          applicationId: appId,
          isPrivate: false,
          permissions: []
        }
      ];
      // Mock dal
      serviceContext.dal.admin.getRolesForUser.mockResolvedValue(mockData);

      let res;
      try {
        res = await _bll.getApplicationRolesByAppId(context, appId, {
          ownedOnly
        });
      } catch (error) {
        expect(error).toBeUndefined();
      }

      expect(res).toBeDefined();
      expect(res.length).toEqual(mockData.length);
      expect(res).toEqual(mockData);
    });

    it(`should get all available roles for the app if ownedOnly = false`, async function () {
      const appId = 'a8736464-41d5-4f23-a781-639145c99cfc';
      const ownedOnly = false;
      const mockData = {
        count: 2,
        records: [
          {
            id: 'role_id1',
            name: 'role_name1',
            description: 'description1',
            applicationId: appId,
            isPrivate: true,
            permissions: []
          },
          {
            id: 'role_id2',
            name: 'role_name2',
            description: 'description2',
            applicationId: appId,
            isPrivate: false,
            permissions: []
          }
        ]
      };
      // Mock dal
      serviceContext.dal.role.getRoles.mockResolvedValue(mockData);

      let res;
      try {
        res = await _bll.getApplicationRolesByAppId(context, appId, {
          ownedOnly
        });
      } catch (error) {
        expect(error).toBeUndefined();
      }

      expect(res).toBeDefined();
      expect(res.length).toEqual(mockData.count);
      expect(res).toEqual(mockData.records);
    });
  });

  describe('#applicationAddToOrg', function () {
    let args;
    it('invalid input: missing org id', async function () {
      args = {};
      const _bll = require('./application.js')(serviceContext);
      try {
        await _bll.applicationAddToOrg(args, context);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain(`organization id is required`);
      }
    });
    it('invalid input: missing application id', async function () {
      args = {
        orgId: 123
      };
      const _bll = require('./application.js')(serviceContext);
      try {
        await _bll.applicationAddToOrg(args, context);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain(`application id is required`);
      }
    });
    it('invalid input: missing configs', async function () {
      args = {
        orgId: 123,
        appId: `0619633d-1f40-4f63-92ba-33ed695dd3d9`
      };
      const _bll = require('./application.js')(serviceContext);
      try {
        await _bll.applicationAddToOrg(args, context);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain(`configs field is required`);
      }
    });
  });

  describe('#createPermissionsetsAndACEs', function () {
    let orgId, application;
    it('invalid input: missing org id', async function () {
      const _bll = require('./application.js')(serviceContext);
      try {
        await _bll._createPermissionSetsAndACEs(context, orgId, application);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain(`missing organization id`);
      }
    });
    it('invalid input: missing application info', async function () {
      const _bll = require('./application.js')(serviceContext);
      orgId = 1234;
      try {
        await _bll._createPermissionSetsAndACEs(context, orgId, application);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain(`missing application info`);
      }
    });
  });

  describe('#deleteApplicationRoles', function () {
    it.each([
      { ctx: {}, title: 'missing roleIds' },
      {
        ctx: {},
        roleIds: ['role-id'],
        title: 'missing applicationId or organizationId'
      },
      {
        ctx: {},
        roleIds: ['role-id'],
        options: { organizationId: 'org-id' },
        title: 'missing applicationId'
      },
      {
        ctx: {},
        roleIds: ['role-id'],
        options: { applicationId: 'app-id' },
        title: 'missing organizationId'
      }
    ])(
      'should throw error if input is invalid: $title',
      async ({ ctx, roleIds, options }) => {
        await expect(async () =>
          bll1.deleteApplicationRoles(ctx, roleIds, options)
        ).rejects.toMatchObject({
          name: 'invalid_input'
        });
      }
    );

    it('should throw error when attempting to delete app roles of an active application', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'app-id', application_status: 'active' }],
        false
      );
      await expect(async () =>
        bll1.deleteApplicationRoles({}, ['role-id'], {
          applicationId: 'app-id',
          organizationId: 'org-id'
        })
      ).rejects.toMatchObject({
        name: 'not_allowed'
      });
    });

    it('should throw error when attempting to delete system app roles', async () => {
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'app-id', application_status: 'active' }],
        false
      );
      await expect(async () =>
        bll1.deleteApplicationRoles({}, [constants.ROLES.CMS_EDITOR], {
          applicationId: 'app-id',
          organizationId: 'org-id'
        })
      ).rejects.toMatchObject({
        name: 'not_allowed'
      });
    });

    it('should throw error when attempting to delete default app roles', async () => {
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'app-id' }],
        false
      );
      // serviceContext.dal.role.getRoles
      serviceContext.dbConnections['sso'].read._push(
        [{ role_id: 'role-id', is_default_app_role: true }],
        false
      );
      await expect(async () =>
        bll1.deleteApplicationRoles({}, ['role-id'], {
          applicationId: 'app-id',
          organizationId: 'org-id'
        })
      ).rejects.toMatchObject({
        name: 'not_allowed'
      });
    });

    it('should delete application roles', async () => {
      // serviceContext.dal.application.getApplication
      serviceContext.dbConnections['sso'].read._push(
        [{ application_id: 'app-id' }],
        false
      );
      // serviceContext.dal.role.getRoles
      serviceContext.dbConnections['sso'].read._push(
        [{ role_id: 'role-id' }],
        false
      );
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: 'org-guid'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual('org-id');
          return true;
        }
      );

      serviceContext1.bll.rbacAuth.deleteAppRoleAuthObjectsTx.mockResolvedValueOnce(
        {
          removedMemberIds: ['user-id-1']
        }
      );
      serviceContext.dbConnections['sso'].write._push(
        [{ id: 'user-id-1' }, { id: 'user-id-2' }],
        false,
        [],
        (sql, params) => {
          expect(sql).toContain('DELETE FROM public.sso_user_role');
          expect(sql).toContain('RETURNING user_id AS id');
          expect(params[0]).toEqual(['role-id']);

          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          expect(sql).toContain(
            'DELETE FROM public.organization_invite__application_roles'
          );
          expect(params[0]).toEqual(['role-id']);

          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          expect(sql).toContain('DELETE FROM public.role');
          expect(params[0]).toEqual(['role-id']);

          return true;
        }
      );
      await bll1.deleteApplicationRoles({}, ['role-id'], {
        applicationId: 'app-id',
        organizationId: 'org-id'
      });
      expect(serviceContext1.logger.error).not.toHaveBeenCalled();
      expect(
        serviceContext1.bll.rbacAuth.deleteAppRoleAuthObjectsTx
      ).toHaveBeenCalledWith(
        ['role-id'],
        expect.objectContaining({
          ssoDbClient: expect.any(Object),
          coreDbClient: expect.any(Object),
          organizationId: 'org-id',
          organizationGuid: 'org-guid'
        })
      );
      expect(
        serviceContext1.bll.rbacAuth.emitReloadSessionUsersEvent
      ).toHaveBeenCalledWith('org-guid', ['user-id-1', 'user-id-2']);
    });
  });
});
