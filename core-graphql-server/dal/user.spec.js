const _ = require('lodash');
const httpMock = require('node-mocks-http');
const mockUtil = require('../test/mockUtil.js')();
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const moment = require('moment');
const dal = require('./user.js')(serviceContext);
_.set(
  serviceContext,
  'config.s3.fileId',
  'NPIEpAIBAAKCAQEAqCrrzfGpgFk4raHeTa1t6SIkYuaEYctBPmldlgonbGySf/1QA8v0Vajnt1D+4+TBK5lz6hBC466iBa+q3fJsWP9pkPE36irT8T6UXZZk6bJbeI'
);
let ctxSuperAdmin, ctxJwt, ctxInternalToken, ctxRegularUser;

describe('dal/user.js', function () {
  beforeEach(() => {
    jest.clearAllMocks();
    ctxSuperAdmin = _.cloneDeep(mockUtil.makeContext());
    ctxJwt = _.cloneDeep(mockUtil.makeContext({ authType: 'engineJWT' }));
    ctxInternalToken = _.cloneDeep(
      mockUtil.makeContext({ authType: 'api_internal' })
    );
    ctxRegularUser = _.cloneDeep(mockUtil.makeContext());
    ctxRegularUser._authInfo.permissionMasks = [];
  });

  describe('#require', function () {
    it('should have correct module structure', async function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(9);
      expect(typeof dal.getUserLoginMethod).toEqual('function');
    });
  });
  describe('#getUserLoginMethod', function () {
    it('should throw out if user not found', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      try {
        await dal.getUserLoginMethod('idonotexist@veritone.com');
        throw new Error('no error');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should throw out if user not active', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '22d78411-6277-467d-bd54-ba1ccd6607d1',
          user_name: 'iamsuspended@veritone.com',
          status: 'suspended',
          organization_id: 7682,
          organization_name: 'Test org'
        }
      ]);
      try {
        await dal.getUserLoginMethod('iamsuspended@veritone.com');
        throw new Error('no error');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });
    it('should throw out if userLoginId not set', async function () {
      try {
        await dal.getUserLoginMethod();
        throw new Error('no error');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should throw out if userLoginId empty', async function () {
      try {
        await dal.getUserLoginMethod('');
        throw new Error('no error');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should throw out if org ID not found', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '22d78411-6277-467d-bd54-ba1ccd6607d1',
          user_name: 'iamauser@veritone.com',
          status: 'active',
          organization_id: 7682,
          organization_name: 'Test org'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getUserLoginMethod('iamauser@veritone.com');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should return info for active normal auth user', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '22d78411-6277-467d-bd54-ba1ccd6607d1',
          user_name: 'iamauser@veritone.com',
          status: 'active',
          organization_id: 7682,
          organization_name: 'Test org'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Test org',
          kvp: {
            features: {
              oktaAuthentication: {
                enabled: false
              }
            }
          }
        }
      ]);
      const res = await dal.getUserLoginMethod('iamauser@veritone.com');
      expect(res).toExist;
      expect(res.userId).toEqual('22d78411-6277-467d-bd54-ba1ccd6607d1');
      expect(res.userLoginId).toEqual('iamauser@veritone.com');
      expect(res.authenticationType).toEqual('login');
      expect(res.organizationId).toEqual(7682);
      expect(res.organizationName).toEqual('Test org');
    });

    it('should return info for active okta-enabled auth user', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '22d78411-6277-467d-bd54-ba1ccd6607d1',
          user_name: 'iamauser@veritone.com',
          status: 'active',
          organization_id: 19000,
          organization_name: 'Test org'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 19000,
          organization_name: 'Test org',
          kvp: {
            features: {
              oktaAuthentication: {
                enabled: true
              }
            }
          }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad80408522be0ebd6ec9e44b3a2483f68417'
        }
      ]);

      const res = await dal.getUserLoginMethod('iamauser@veritone.com');
      expect(res).toExist;
      expect(res.userId).toEqual('22d78411-6277-467d-bd54-ba1ccd6607d1');
      expect(res.userLoginId).toEqual('iamauser@veritone.com');
      expect(res.authenticationType).toEqual('okta');
      expect(res.organizationId).toEqual(19000);
      expect(res.organizationName).toEqual('Test org');
      expect(res.oktaConfig).toExist;
      expect(res.oktaConfig.clientId).toEqual('client123');
      expect(res.oktaConfig.clientSecret).toEqual('secret123');
    });
  });

  describe('#getACLs', function () {
    it('should get acls', async function () {
      let res, err;
      const options = { id: 'userId' };

      serviceContext.dbConnections['sso'].read._push([
        { objectId: 'organization/7682' },
        { objectId: '123' }
      ]);

      try {
        res = await dal.getACLs(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.length).toEqual(2);
      expect(res[0].organizationId).toEqual('7682');
      expect(res[1].objectId).toEqual('123');
    });
  });

  describe('#setUserStatus', function () {
    it('should throw error - Invalid user status input!', async function () {
      let res;
      const options = { status: 'invalid' };

      try {
        res = await dal.setUserStatus(ctxRegularUser, options);
      } catch (error) {
        expect(error.message).toEqual('Invalid user status input!');
      }

      expect(res).toBeUndefined();
    });

    it('should throw error - userIds is required.', async function () {
      let res;
      const options = { status: 'active' };

      try {
        res = await dal.setUserStatus(ctxRegularUser, options);
      } catch (error) {
        expect(error.message).toEqual('userIds is required.');
      }

      expect(res).toBeUndefined();
    });

    it('should update user statuses', async function () {
      const options = {
        status: 'active',
        userIds: [
          '4f460b23-5e67-404b-b275-5b18a5ab9373',
          '3be86fe6-74af-4e6c-8201-aaa83328c52f'
        ]
      };

      serviceContext.dbConnections['sso'].write._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373', status: 'active' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f', status: 'active' }
      ]);

      const res = await dal.setUserStatus(ctxRegularUser, options);

      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      expect(res[0].id).toEqual('4f460b23-5e67-404b-b275-5b18a5ab9373');
      expect(res[0].status).toEqual('active');
      expect(res[1].id).toEqual('3be86fe6-74af-4e6c-8201-aaa83328c52f');
      expect(res[1].status).toEqual('active');
    });
  });

  describe('#deleteUserOpenIdConnects', function () {
    it('should throw if OpenId Connect ID is invalid array or not specified', async () => {
      const context = mockUtil.makeContext();
      let err, res;
      try {
        res = await dal.deleteUserOpenIdConnects(null, null);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err.message).toContain(
        'OpenId Connect ID should be an non-empty array.'
      );
    });

    it('should throw if userId is not specified', async () => {
      const context = mockUtil.makeContext();
      const connectId = '00000000-1234-0000-0000-000000000000';
      let err, res;
      try {
        res = await dal.deleteUserOpenIdConnects(null, [connectId]);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err.message).toContain('userId is required.');
    });

    it('should remove user openid connect', async () => {
      const context = mockUtil.makeContext();
      const userId = '00000000-1111-0000-0000-000000000000';
      const connectId = '00000000-1234-0000-0000-000000000000';

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            connect_id: connectId
          }
        ],
        false
      );

      let err, res;
      try {
        res = await dal.deleteUserOpenIdConnects(userId, [connectId]);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
    });
  });

  describe('#deleteUserSCIMConnectIds', function () {
    it('should throw if OpenId Connect ID is invalid array or not specified', async () => {
      const context = mockUtil.makeContext();
      let err, res;
      try {
        res = await dal.deleteUserSCIMConnectIds(null, null);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err.message).toContain(
        'OpenId Connect ID should be an non-empty array.'
      );
    });

    it('should throw if userId is not specified', async () => {
      const context = mockUtil.makeContext();
      const connectId = '00000000-1234-0000-0000-000000000000';
      let err, res;
      try {
        res = await dal.deleteUserSCIMConnectIds(null, [connectId]);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err.message).toContain('userId is required.');
    });

    it('should remove user openid connect', async () => {
      const context = mockUtil.makeContext();
      const userId = '00000000-1111-0000-0000-000000000000';
      const connectId = '00000000-1234-0000-0000-000000000000';

      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            scim_connect_id: connectId
          }
        ],
        false
      );

      let err, res;
      try {
        res = await dal.deleteUserSCIMConnectIds(userId, [connectId]);
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
    });
  });

  describe('#getOrgAdminUsers', function () {
    it('should throw if organizationId is not specified', async () => {
      const context = mockUtil.makeContext();
      let err, res;
      try {
        res = await dal.getOrgAdminUsers(context, {});
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err.message).toContain('organizationId is required.');
    });

    it('should get organizationGuid if organizationId is specified and organizationGuid is not', async () => {
      const context = mockUtil.makeContext();
      let err, res;
      const organizationGuid = '00000000-1111-0000-0000-000000000000';

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            application_id: organizationGuid
          }
        ],
        false
      );

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: '00000000-0000-0000-0000-000000000000'
          }
        ],
        false,
        [],
        (sql, vars) => {
          expect(vars[0]).toEqual(organizationGuid);
          // Verify the application_key parameter is passed from appConstants
          expect(vars[1]).toEqual('admin');
          // Verify the role_id parameter is passed using constants.ROLES.ADMIN
          expect(vars[2]).toBeDefined();
          // Verify SQL uses r.role_id instead of r.role_name
          expect(sql).toMatch(/r\.role_id\s*=\s*\$3/);

          return true;
        }
      );

      try {
        res = await dal.getOrgAdminUsers(context, { organizationId: 1 });
      } catch (error) {
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
    });
  });

  describe('#getDefaultOrgAdminUser', function () {
    it('should return null if context is missing', async function () {
      const res = await dal.getDefaultOrgAdminUser({}, null);
      expect(res).toBeNull();
    });

    it('should return the oldest admin user', async function () {
      const context = mockUtil.makeContext();
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      _.set(context, '_authInfo.organization.organizationGuid', organizationGuid);

      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: 'user-2',
          user_name: 'user2@veritone.com',
          date_created: '2023-01-02T00:00:00Z'
        },
        {
          user_id: 'user-1',
          user_name: 'user1@veritone.com',
          date_created: '2023-01-01T00:00:00Z'
        }
      ]);

      const res = await dal.getDefaultOrgAdminUser({}, context);
      expect(res).toExist;
      expect(res.userId).toEqual('user-1');
    });

    it('should exclude superadmin when excludeSuperAdmin is true', async function () {
      const context = mockUtil.makeContext();
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      _.set(context, '_authInfo.organization.organizationGuid', organizationGuid);

      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'regular-admin',
            user_name: 'admin@veritone.com',
            date_created: '2023-01-01T00:00:00Z'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toContain('NOT IN');
          expect(sql).toContain('sso_user_role');
          return true;
        }
      );

      const res = await dal.getDefaultOrgAdminUser({ excludeSuperAdmin: true }, context);
      expect(res).toBeDefined();
      expect(res.userId).toEqual('regular-admin');
    });

    it('should return null when no admin users exist after excluding superadmin', async function () {
      const context = mockUtil.makeContext();
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      _.set(context, '_authInfo.organization.organizationGuid', organizationGuid);

      serviceContext.dbConnections['sso'].read._push([]);

      const res = await dal.getDefaultOrgAdminUser({ excludeSuperAdmin: true }, context);
      expect(res).toBeUndefined();
    });
  });

  describe('#getOldestUserForOrg', function () {
    it('should throw if organizationGuid is missing', async function () {
      try {
        await dal.getOldestUserForOrg();
        throw new Error('should have thrown');
      } catch (err) {
        expect(err.message).toEqual('organizationGuid is required.');
      }
    });

    it('should return the oldest active user in the org', async function () {
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: 'oldest-user',
          user_name: 'oldest@veritone.com',
          date_created: '2020-01-01T00:00:00Z'
        }
      ]);

      const res = await dal.getOldestUserForOrg(organizationGuid);
      expect(res).toExist;
      expect(res.userId).toEqual('oldest-user');
    });

    it('should exclude superadmin users from results when get oldest user for org', async function () {
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'regular-user',
            user_name: 'regular@veritone.com',
            date_created: '2020-01-01T00:00:00Z'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toContain('NOT IN');
          expect(sql).toContain('sso_user_role');
          return true;
        }
      );

      const res = await dal.getOldestUserForOrg(organizationGuid);
      expect(res).toExist;
      expect(res.userId).toEqual('regular-user');
    });

    it('should return null when org only has superadmin users', async function () {
      const organizationGuid = '00000000-1111-0000-0000-000000000000';
      serviceContext.dbConnections['sso'].read._push(
        [],
        false,
        [],
        (sql) => {
          expect(sql).toContain('NOT IN');
          expect(sql).toContain('sso_user_role');
          return true;
        }
      );

      const res = await dal.getOldestUserForOrg(organizationGuid);
      expect(res).toBeNull();
    });
  });

  describe('#getOldestSuperAdmin', function () {
    it('should return the oldest super admin', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: 'oldest-super-admin',
          user_name: 'super@veritone.com',
          date_created: '2020-01-02T00:00:00Z',
          permissions: ['superadmin']
        }
      ]);

      const res = await dal.getOldestSuperAdmin();
      expect(res).toExist;
      expect(res.userId).toExist;
    });

    it('should return system user if no super admin found', async function () {
      serviceContext.dbConnections['sso'].read._push([]);

      const res = await dal.getOldestSuperAdmin();
      expect(res).toExist;
      expect(res.userId).toEqual('00000000-0000-0000-0000-000000000000');
    });

    it('should not exclude superadmin from query (uses superAdmin join, not excludeSuperAdmin)', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'sa-user',
            user_name: 'sa@veritone.com',
            date_created: '2019-01-01T00:00:00Z'
          }
        ],
        false,
        [],
        (sql) => {
          expect(sql).toContain('INNER JOIN sso_user_role');
          expect(sql).toContain('INNER JOIN role');
          expect(sql).not.toContain('NOT IN');
          return true;
        }
      );

      const res = await dal.getOldestSuperAdmin();
      expect(res).toBeDefined();
      expect(res.userId).toEqual('sa-user');
    });
  });
});
