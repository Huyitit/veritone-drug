const _ = require('lodash');
const uuid = require('uuid');
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./organizationInvite.js')(serviceContext),
  mpDbWrite = serviceContext.dbConnections['sso'].write,
  mpDbRead = serviceContext.dbConnections['sso'].read;

const organizationGuid = '00000000-0000-0000-0000-000000000000',
  integrationId = 'some name',
  config = {
    testField: 'some value'
  };
const organizationId = 1000;

describe('organizationInvite', () => {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(13);
      expect(dal.getOrganizationInvites).toEqual(expect.any(Function));
      expect(dal.getApplicationAndRoleIds).toEqual(expect.any(Function));
      expect(dal.getOrganizationInviteActionAudit).toEqual(
        expect.any(Function)
      );
      expect(dal.createOrganizationInvite).toEqual(expect.any(Function));
      expect(dal.updateOrganizationInvite).toEqual(expect.any(Function));
      expect(dal.deleteOrganizationInvite).toEqual(expect.any(Function));
      expect(dal.updateOrgInviteWithNewUserId).toEqual(expect.any(Function));
      expect(dal.cleanExpiredInvites).toEqual(expect.any(Function));
    });
  });

  describe('#_validateGetOrganizationInvitesInput', function () {
    it('should throw error if userId is invalid', () => {
      expect(() => {
        dal._validateGetOrganizationInvitesInput('invalid-uuid');
      }).toThrow();
    });

    it('should throw error if organizationInviteId is invalid', () => {
      expect(() => {
        dal._validateGetOrganizationInvitesInput(null, 'invalid-uuid');
      }).toThrow();
    });

    it('should not throw error if inputs are valid', () => {
      expect(() => {
        dal._validateGetOrganizationInvitesInput(uuid.v4(), uuid.v4());
      }).not.toThrow();
    });
  });

  describe('#_buildGetOrganizationInvitesWhereClause', function () {
    it('should build basic where clause', () => {
      const obj = {
        userId: '00000000-1111-0000-0000-000000000000',
        organizationId: 1000
      };
      const args = {
        email: 'test@example.com'
      };
      const { whereClause, values } = dal._buildGetOrganizationInvitesWhereClause(obj, args);
      
      expect(whereClause).toContain('user_id = $1');
      expect(whereClause).toContain('email = $2');
      expect(whereClause).toContain('organization_id = $3');
      expect(values).toHaveLength(3);
    });

    it('should include inviteType and status in where clause', () => {
      const obj = { organizationId: 1000 };
      const args = {
        inviteType: 'selfSignup',
        status: 'pending'
      };
      const { whereClause, values } = dal._buildGetOrganizationInvitesWhereClause(obj, args);
      
      expect(whereClause).toContain('invite_type = $2');
      expect(whereClause).toContain('status');
      expect(values).toContain('self_signup');
      expect(values).toContainEqual(expect.arrayContaining(['pending']));
    });

    it('should throw error on empty where clause', () => {
      expect(() => {
        dal._buildGetOrganizationInvitesWhereClause({}, {});
      }).toThrow();
    });
  });

  describe('#_buildGetOrganizationInvitesOrderBy', function () {
    it('should return default order by if no options provided', () => {
      const orderBy = dal._buildGetOrganizationInvitesOrderBy();
      expect(orderBy).toEqual('ORDER BY new_user_flag DESC');
    });

    it('should return default order by if empty options provided', () => {
      const orderBy = dal._buildGetOrganizationInvitesOrderBy({});
      expect(orderBy).toEqual('ORDER BY new_user_flag DESC');
    });

    it('should build order by clause from options', () => {
      const options = {
        orderBy: {
          field: 'expiration_date',
          direction: 'DESC'
        }
      };
      const orderBy = dal._buildGetOrganizationInvitesOrderBy(options);
      expect(orderBy).toEqual('ORDER BY expiration_date DESC');
    });

    it('should ignore invalid field', () => {
      const options = {
        orderBy: {
          field: 'invalid_field',
          direction: 'ASC'
        }
      };
      const orderBy = dal._buildGetOrganizationInvitesOrderBy(options);
      expect(orderBy).toEqual('ORDER BY new_user_flag DESC');
    });
  });

  describe('#getOrganizationInvites', function () {
    let context = {};

    it('should error with invalid userId inputs. ', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        },
        {
          user_id: '00000000-2222-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil2@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      const obj = { userId: '000' };

      try {
        res = await dal.getOrganizationInvites(obj, {}, context);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should error with invalid organizationInviteId inputs. ', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        },
        {
          user_id: '00000000-2222-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil2@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      const obj = { organizationInviteId: '000' };

      try {
        res = await dal.getOrganizationInvites(obj, {}, context);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should error with invalid inputs. ', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        },
        {
          user_id: '00000000-2222-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil2@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      try {
        res = await dal.getOrganizationInvites({}, {}, context);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });

    it('should get organization invite list', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: '',
          created_at: '2022-01-01T00:00:00.000Z',
        },
        {
          user_id: '00000000-2222-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil2@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: '',
          created_at: '2022-01-02T00:00:00.000Z',
        }
      ]);

      const obj = { userId: '00000000-3333-0000-0000-000000000000' };

      try {
        res = await dal.getOrganizationInvites(obj, {}, context);
      } catch (e) {
        err = e;
      }


      expect(err).toBeUndefined();
      expect(res.length).toEqual(2);
    });

    it('should use transaction connection when trans parameter is provided', async function () {
      let err, res;
      const mockTrans = {
        map: jest.fn().mockResolvedValue([
          {
            organization_invite_id: uuid.v4(),
            email: 'test-trans@example.com',
            status: 'submitted',
            expiration_date: Math.floor(Date.now() / 1000)
          }
        ])
      };

      const obj = { organizationId: 1000 };

      try {
        res = await dal.getOrganizationInvites(obj, {}, context, {}, mockTrans);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
      expect(mockTrans.map).toHaveBeenCalled();
    });

    it('should use read connection when trans parameter is not provided', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_id: 1000,
          email: 'test-read@example.com',
          message: 'Test message',
          status: 'submitted',
          expiration_date: Math.floor(Date.now() / 1000) + 86400
        }
      ]);

      const obj = { organizationId: 1000 };

      try {
        res = await dal.getOrganizationInvites(obj, {}, context, {});
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.length).toEqual(1);
      expect(res[0].email).toEqual('test-read@example.com');
    });
  });

  describe('#getApplicationAndRoleIds', function () {
    let context = {};

    it('should get application roles list', async function () {
      let err, res;
      const id = uuid.v4();
      const organizationInviteId = uuid.v4();
      const roleId = uuid.v4();
      const appId = uuid.v4();
      // organization_invite__application_roles
      mpDbRead._push([
        {
          id: id,
          organization_invite_id: organizationInviteId,
          application_id: appId,
          role_id: roleId
        }
      ]);

      const obj = {
        organizationInviteId: organizationInviteId
      };

      try {
        res = await dal.getApplicationAndRoleIds(obj, context);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      res.forEach((appRole) => {
        expect(appRole.organizationInviteId).toEqual(organizationInviteId);
        expect(appRole.applicationId).toEqual(appId);
        expect(appRole.roleId).toEqual(roleId);
      });
    });

    it('should error with invalid organizationInviteId', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          id: '00000000-1111-0000-0000-000000000000',
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          application_id: '00000000-1111-0000-0000-000000000000',
          role_id: '00000000-1111-0000-0000-000000000000'
        },
        {
          id: '00000000-2222-0000-0000-000000000000',
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          application_id: '00000000-2222-0000-0000-000000000000',
          role_id: '00000000-2222-0000-0000-000000000000'
        }
      ]);

      const obj = { organizationInviteId: 'not-uuid-format' };

      try {
        res = await dal.getApplicationAndRoleIds(obj, context);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });
  });

  describe('#getOrganizationInviteActionAudit', function () {
    let context = {};

    it('should get organization invite list', async function () {
      let err, res;

      // mock value
      mpDbRead._push([
        {
          id: '00000000-1111-0000-0000-000000000000',
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          action: 'submit',
          prior_status: '',
          actor: '00000000-1111-0000-0000-000000000000',
          timestamp: '"2022-05-11 19:30:56.152124"'
        }
      ]);

      const obj = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000'
      };

      try {
        res = await dal.getOrganizationInviteActionAudit(obj, {}, context);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      res.forEach((audit) => {
        expect(audit).toBeTruthy();
        expect(audit.organizationInviteId).toEqual(
          '00000000-1111-0000-0000-000000000000'
        );
      });
    });

    it('should get organization invite audit list by args', async function () {
      let err, res;

      // mock value
      mpDbRead._push(
        [
          {
            id: '00000000-1111-0000-0000-000000000000',
            organization_invite_id: '00000000-1111-0000-0000-000000000000',
            action: 'submit',
            prior_status: '',
            actor: '00000000-1111-0000-0000-000000000000',
            timestamp: '"2022-05-11 19:30:56.152124"'
          }
        ],
        false,
        ['ORDER BY timestamp DESC', 'LIMIT 1'],
        (sql, params) => {
          expect(params[1]).toEqual('00000000-1111-0000-0000-000000000000');

          return true;
        }
      );

      const obj = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000'
      };

      const args = {
        actor: '00000000-1111-0000-0000-000000000000',
        orderBy: {
          field: 'timestamp',
          direction: 'DESC'
        },
        limit: 1
      };

      try {
        res = await dal.getOrganizationInviteActionAudit(obj, args, context);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      res.forEach((audit) => {
        expect(audit).toBeTruthy();
        expect(audit.organizationInviteId).toEqual(
          '00000000-1111-0000-0000-000000000000'
        );
      });
    });
  });

  describe('#createOrganizationInvite', function () {
    let context = {};

    it('create org invite should check expiration date before inserting', async function () {
      let err, res;

      const input = {
        user_id: '00000000-1111-0000-0000-000000000000',
        organization_guid: organizationGuid,
        email: 'testeamil@veritone.com',
        message: 'This is some message. :)',
        status: 'request',
        expiration_date: '',
        applicationRoles: []
      };

      try {
        res = await dal._orgInviteQuery(context, { input });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();

      expect(res).toBeDefined();
      expect(res.sql).toContain('invite_type');
      expect(res.sql).toContain('$12::public.invite_type');
      expect(res.params).toHaveLength(12);
      expect(res.params[11]).toBe('user_invite');
      expect(res.sql).toContain(
        `status IN ('submitted', 'approved') \n          AND expiration_date > `
      );
    });

    it('should get organization invite list', async function () {
      let err, res;

      // mock value
      mpDbRead._push([{ userId: '00000000-1111-0000-0000-000000000000' }]);

      mpDbWrite._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      mpDbWrite._push([{}]);

      const input = {
        user_id: '00000000-1111-0000-0000-000000000000',
        organization_guid: organizationGuid,
        email: 'testeamil@veritone.com',
        message: 'This is some message. :)',
        status: 'request',
        expiration_date: '',
        applicationRoles: []
      };

      try {
        res = await dal.createOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }
      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });

    it('should throw an error when the user was invited to join the organization', async function () {
      let err, res;

      // mock value
      mpDbWrite._push([null]);

      mpDbWrite._push([{}]);

      const input = {
        userId: '00000000-1111-0000-0000-000000000000',
        organizationId: organizationId,
        email: 'testeamil@veritone.com',
        message: 'This is some message. :)',
        status: 'request',
        expiration_date: '',
        applicationRoles: []
      };

      try {
        res = await dal.createOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.message).toEqual(
        `User '${input.email}' has already been invited to join the organization '${input.organizationId}'`
      );
    });

    it('T55: should propagate rejection when the creation-audit insert fails, instead of resolving with the invite', async function () {
      let err, res;

      // orgInvite insert succeeds
      mpDbWrite._push([
        {
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      // _recordAction's audit insert (client.map) rejects
      mpDbWrite._push(new Error('audit insert failed'));

      const input = {
        user_id: '00000000-1111-0000-0000-000000000000',
        organization_guid: organizationGuid,
        email: 'testeamil@veritone.com',
        message: 'This is some message. :)',
        status: 'request',
        expiration_date: '',
        applicationRoles: []
      };

      try {
        res = await dal.createOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeTruthy();
      expect(err.message).toEqual(
        'dal.createOrganizationInvite: Failed to create organization invite'
      );
    });
  });

  describe('#updateOrganizationInvite', function () {
    let context = {};

    it('should get organization invite list', async function () {
      let err, res;

      // mock value
      //mpDbRead._push([{ count: 1, status: 'requested' }]);
      mpDbWrite._push([]);
      mpDbWrite._push([
        {
          organizationInviteId: '00000000-1111-0000-0000-000000000000',
          status: '2requested'
        }
      ]);
      mpDbWrite._push([]);
      mpDbWrite._push([]);

      const input = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000',
        action: 'submit',
        message: 'new message',
        applicationRoles: []
      };

      context._authInfo = {};
      context._authInfo.permissionMasks = [];

      try {
        res = await dal.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should update organization invite with multiple application roles', async function () {
      let err, res;

      // mock values
      // DELETE FROM organization_invite__application_roles
      mpDbWrite._push([]);
      // INSERT INTO organization_invite__application_roles (batch)
      mpDbWrite._push([]);
      // UPDATE organization_invite
      mpDbWrite._push([
        {
          organizationInviteId: '00000000-3333-0000-0000-000000000000',
          status: 'approved'
        }
      ]);
      // record action
      mpDbWrite._push([]);

      const input = {
        organizationInviteId: '00000000-3333-0000-0000-000000000000',
        action: 'submit',
        message: 'new message',
        applicationRoles: [
          { applicationId: uuid.v4(), roleId: uuid.v4() },
          { applicationId: uuid.v4(), roleId: uuid.v4() }
        ]
      };

      context._authInfo = {};
      context._authInfo.permissionMasks = [];

      try {
        res = await dal.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should remove SCIM connection of user when organization invite is deleted', async function () {
      let err, res;

      // mock value
      // mpDbRead._push([{ count: 1, status: 'requested' }]);
      mpDbWrite._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          organization_id: '00000000-2222-0000-0000-000000000000',
          user_id: '00000000-3333-0000-0000-000000000000',
          status: 'deleted'
        }
      ]);
      // serviceContext.dal.openidConnect.getOpenIdConnects
      mpDbWrite._push([{ id: '00000000-1111-1111-0000-000000000000' }]);
      mpDbWrite._push([]);
      mpDbWrite._push([]);

      const input = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        action: 'delete',
        applicationRoles: []
      };

      context._authInfo = {};
      context._authInfo.permissionMasks = [];
      _.set(context, '_authInfo.organization.organizationId', '7682');

      try {
        res = await dal.updateOrganizationInvite(context, { input });
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#deleteOrganizationInvite', function () {
    let context = {};

    beforeEach(() => {
      _.set(context, '_authInfo.organization.organizationId', '7682');
    });

    it('should delete organization invitation successfully', async function () {
      let err, res;

      // mock values
      // delete application roles
      mpDbWrite._push([]);
      // delete invitation
      mpDbWrite._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_id: 7682,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);
      // record action
      mpDbWrite._push([]);
      // remove SCIM Connection For User
      mpDbRead._push([
        { application_id: '00000000-3333-0000-0000-000000000000' }
      ]);
      mpDbRead._push([]);

      const args = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        deleteUser: true,
        userId: '00000000-2222-0000-0000-000000000000'
      };

      try {
        res = await dal.deleteOrganizationInvite(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should error when no invitation deleted', async function () {
      let err, res;

      // mock values
      // delete new user
      mpDbWrite._push([]);
      // delete application roles
      mpDbWrite._push([]);
      // delete invitation
      mpDbWrite._push([]);

      const args = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        deleteUser: true,
        userId: '00000000-2222-0000-0000-000000000000'
      };

      try {
        res = await dal.deleteOrganizationInvite(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should remove SCIM connect for user when deleting an organization invite', async function () {
      let err, res;

      // delete application roles
      mpDbWrite._push([]);
      // delete invitation
      mpDbWrite._push([
        {
          organization_invite_id: '00000000-1111-0000-0000-000000000000',
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_id: 7682,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);
      // record action
      mpDbWrite._push([]);
      // remove SCIM connection of user
      mpDbRead._push([
        {
          id: '00000000-2222-0000-0000-000000000000'
        }
      ]);
      mpDbWrite._push([]);
      mpDbWrite._push([]);

      const args = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        userId: '00000000-2222-0000-0000-000000000000'
      };

      try {
        res = await dal.deleteOrganizationInvite(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#updateOrgInviteWithNewUserId', function () {
    let context = {};

    it('should update organization_invite table successfully', async function () {
      let err, res;

      // mock values
      mpDbWrite._push([
        {
          organizationInviteId: '00000000-1111-0000-0000-000000000000',
          user_id: '00000000-1111-0000-0000-000000000000',
          organization_guid: organizationGuid,
          email: 'testeamil@veritone.com',
          message: 'This is some message. :)',
          status: 'request',
          expiration_date: ''
        }
      ]);

      const args = {
        input: {
          organizationInviteId: '00000000-1111-0000-0000-000000000000',
          email: 'test@veritone.com',
          userId: '00000000-2222-0000-0000-000000000000'
        }
      };

      try {
        res = await dal.updateOrgInviteWithNewUserId(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('should error when no record update', async function () {
      let err, res;

      // mock values
      // update organization_invite table. Error when no record updated.
      // this query should failed.
      mpDbWrite._push([], true, [], null, true);

      const args = {
        organizationInviteId: '00000000-1111-0000-0000-000000000000',
        deleteUser: true,
        userId: '00000000-2222-0000-0000-000000000000'
      };

      try {
        res = await dal.updateOrgInviteWithNewUserId(context, args);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });
  });

  describe('#cleanExpiredInvites', function () {
    let context = {};

    it('should clean data successfully', async function () {
      let err, res;

      // mock values
      mpDbWrite._push([], false, []);

      const args = {
        organizationId: 1234,
        email: 'test@veritone.com'
      };

      try {
        res = await dal.cleanExpiredInvites(context, args);
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });

    it('Should throw an error if the input params are not enough', async function () {
      let err, res;

      const args = {
        // organizationId: 1234,
        email: 'test@veritone.com'
      };

      try {
        res = await dal.cleanExpiredInvites(context, args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('should throw error if DB issue or invalid sql query', async function () {
      let err, res;
      const args = {
        organizationId: 1234,
        email: 'test@veritone.com'
      };

      // mock values
      mpDbWrite._push([], false, [], (sql, params) => {
        if (_.isEmpty(sql)) throw new Error('the sql query is invalid');
        if (!params || params.length != 3)
          throw new Error('missing/ wrong number of params');
        if (params[0] !== args.organizationId || params[1] !== args.email)
          throw new Error('the sql params are invalid');

        return true;
      });

      try {
        res = await dal.cleanExpiredInvites(context, args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeDefined();
      expect(err).toBeUndefined();
    });
  });

  describe('#validateApplicationRolesExist', function () {
    let context = {};

    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('should resolve successfully when both app and role exist', async function () {
      const applicationRoles = [{ applicationId: 'app-id', roleId: 'role-id' }];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: 'app-id' }]
        });
      jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: 'role-id', applicationId: 'app-id' }]
      });

      await expect(
        dal.validateApplicationRolesExist(
          context,
          applicationRoles,
          organizationId
        )
      ).resolves.toBeUndefined();
    });

    it('should throw NotFound error if application does not exist', async function () {
      const applicationRoles = [{ applicationId: 'app-id', roleId: 'role-id' }];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: []
        });
      jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: 'role-id', applicationId: 'app-id' }]
      });

      let err;
      try {
        await dal.validateApplicationRolesExist(
          context,
          applicationRoles,
          organizationId
        );
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(err.message).toBe(
        'The application was not found. It either does not exist or you or your organization do not have access to it.'
      );
      expect(err.data.objectType).toBe('Application');
    });

    it('should throw NotFound error if role does not exist', async function () {
      const applicationRoles = [{ applicationId: 'app-id', roleId: 'role-id' }];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: 'app-id' }]
        });
      jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: []
      });

      let err;
      try {
        await dal.validateApplicationRolesExist(
          context,
          applicationRoles,
          organizationId
        );
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(err.message).toBe(
        'The role was not found. It either does not exist or you or your organization do not have access to it.'
      );
      expect(err.data.objectType).toBe('Role');
    });

    it('should throw NotFound error if role does not belong to application', async function () {
      const applicationRoles = [
        { applicationId: 'app-id-1', roleId: 'role-id-1' }
      ];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: 'app-id-1' }]
        });
      jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: 'role-id-1', applicationId: 'app-id-2' }]
      });

      let err;
      try {
        await dal.validateApplicationRolesExist(
          context,
          applicationRoles,
          organizationId
        );
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(err.message).toBe(
        'The role does not belong to the specified application.'
      );
    });

    it('should resolve successfully for Default App Role from a shared application', async function () {
      const ownerOrgId = 99999;
      const applicationRoles = [{ applicationId: 'shared-app-id', roleId: 'default-app-role-id' }];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: 'shared-app-id' }]
        });
      jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: 'default-app-role-id', applicationId: 'shared-app-id', organizationId: ownerOrgId }]
      });

      await expect(
        dal.validateApplicationRolesExist(
          context,
          applicationRoles,
          organizationId
        )
      ).resolves.toBeUndefined();
    });

    it('should call getRoles with applicationId filter instead of organizationIds (VE-20412)', async function () {
      const applicationRoles = [{ applicationId: 'app-id', roleId: 'role-id' }];
      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: 'app-id' }]
        });
      const getRolesSpy = jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: 'role-id', applicationId: 'app-id' }]
      });

      await dal.validateApplicationRolesExist(
        context,
        applicationRoles,
        organizationId
      );

      expect(getRolesSpy).toHaveBeenCalledWith(
        context,
        {
          ids: ['role-id'],
          applicationId: ['app-id']
        },
        true
      );
    });

    it('should wrap a single applicationId into an array when calling getRoles', async function () {
      const singleAppId = 'single-app-id';
      const singleRoleId = 'single-role-id';
      const applicationRoles = [{ applicationId: singleAppId, roleId: singleRoleId }];

      jest
        .spyOn(serviceContext.dal.application, 'getApplications')
        .mockResolvedValue({
          records: [{ id: singleAppId }]
        });
      const getRolesSpy = jest.spyOn(serviceContext.dal.role, 'getRoles').mockResolvedValue({
        records: [{ id: singleRoleId, applicationId: singleAppId }]
      });

      await dal.validateApplicationRolesExist(
        context,
        applicationRoles,
        organizationId
      );

      expect(getRolesSpy).toHaveBeenCalledWith(
        context,
        {
          ids: [singleRoleId],
          applicationId: [singleAppId]
        },
        true
      );
    });

    it('should resolve successfully for empty applicationRoles', async function () {
      await expect(dal.validateApplicationRolesExist(context, [])).resolves.toBeUndefined();
    });
  });
});
