const chaiExpect = require('chai').expect;
const _ = require('lodash');
const uuid = require('uuid');

const mockUtil = require('../test/mockUtil.js')();
// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
const ssoDbRead = serviceContext.dbConnections['sso'].read;

const resolver = require('./OrganizationInvite.js')(serviceContext);

describe('#OrganizationInvite.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(12);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#id', function () {
    it('should return id instead of organizationId', async function () {
      let res, err;
      const obj = {
        organizationInviteId: 111
      };

      try {
        res = await resolver.id(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.be.equal(111);
    });
  });

  describe('#applicationRoles', function () {
    it('should return application and roles', async function () {
      let res, err;
      const id = uuid.v4();
      const id2 = uuid.v4();
      const organizationInviteId = uuid.v4();
      const roleId = uuid.v4();
      const roleId2 = uuid.v4();
      const appId = uuid.v4();
      const appId2 = uuid.v4();

      const obj = {
        organizationInviteId
      };

      // organization_invite__application_roles
      ssoDbRead._push([
        {
          id: id,
          organization_invite_id: organizationInviteId,
          application_id: appId,
          role_id: roleId
        },
        {
          id: id2,
          organization_invite_id: organizationInviteId,
          application_id: appId2,
          role_id: roleId2
        }
      ]);

      // roles
      ssoDbRead._push([
        {
          id: roleId,
          role_name: 'name',
          role_description: 'desc',
          app_name: 'appName'
        },
        {
          id: roleId2,
          role_name: 'name2',
          role_description: 'desc2',
          app_name: 'appName2'
        }
      ]);

      // applications
      ssoDbRead._push(
        [
          {
            application_id: appId,
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          },
          {
            application_id: appId2,
            application_name: 'test2',
            application_key: 'test2',
            application_url: 'https://localhost'
          }
        ],
        false
      );

      try {
        res = await resolver.applicationRoles(
          obj,
          {},
          mockUtil.makeContext(),
          {}
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      res.forEach((appRole) => {
        chaiExpect(appRole).to.exist;
        chaiExpect([appId, appId2]).to.include(appRole.application.id);
        chaiExpect([roleId, roleId2]).to.include(appRole.role.id);
      });
    });

    it('should handle an exception if the role was not found', async function () {
      let res, err;
      const id = uuid.v4();
      const id2 = uuid.v4();
      const organizationInviteId = uuid.v4();
      const roleId = uuid.v4();
      const roleId2 = uuid.v4();
      const appId = uuid.v4();
      const appId2 = uuid.v4();

      const obj = {
        organizationInviteId
      };

      // organization_invite__application_roles
      ssoDbRead._push([
        {
          id: id,
          organization_invite_id: organizationInviteId,
          application_id: appId,
          role_id: roleId
        },
        {
          id: id2,
          organization_invite_id: organizationInviteId,
          application_id: appId2,
          role_id: roleId2
        }
      ]);

      // roles - only get one role
      ssoDbRead._push([
        {
          id: roleId,
          role_name: 'name',
          role_description: 'desc',
          app_name: 'appName'
        }
      ]);

      // applications
      ssoDbRead._push(
        [
          {
            application_id: appId,
            application_name: 'test',
            application_key: 'test',
            application_url: 'http://localhost'
          },
          {
            application_id: appId2,
            application_name: 'test2',
            application_key: 'test2',
            application_url: 'https://localhost'
          }
        ],
        false
      );

      try {
        res = await resolver.applicationRoles(
          obj,
          {},
          mockUtil.makeContext(),
          {}
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.have.lengthOf(1);
      res.forEach((appRole) => {
        chaiExpect(appRole).to.exist;
        chaiExpect([appId]).to.include(appRole.application.id);
        chaiExpect([roleId]).to.include(appRole.role.id);
      });
    });
  });

  describe('#createdBy', function () {
    it('should return createBy', async function () {
      let res, err;
      const id = uuid.v4();
      const id2 = uuid.v4();
      const organizationInviteId = uuid.v4();
      const createdBy = uuid.v4();

      const obj = {
        organizationInviteId
      };

      const args = {
        actor: createdBy
      };

      // organization_invite__action_audits
      ssoDbRead._push(
        [
          {
            action: 'submit',
            priorStatus: 'submitted',
            timestamp: '2022-01-01T00:00:00.000Z',
            actor: createdBy,
            kvp: {
              createdBy: {
                userId: createdBy
              }
            }
          }
        ],
        false,
        ['ORDER BY timestamp', 'LIMIT 1']
      );

      try {
        res = await resolver.createdBy(obj, args, mockUtil.makeContext(), {});
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res.id).to.be.eq(createdBy);
    });
  });

  describe('#userDetails', () => {
    it('strips hashedPassword from object userDetails without mutating root', async () => {
      const root = {
        userDetails: {
          firstName: 'A',
          hashedPassword: 'must-not-leak'
        }
      };
      const res = await resolver.userDetails(root, {}, {}, {});
      chaiExpect(res.firstName).to.equal('A');
      chaiExpect(res.hashedPassword).to.be.undefined;
      chaiExpect(root.userDetails.hashedPassword).to.equal('must-not-leak');
    });

    it('parses JSON string userDetails and strips hashedPassword', async () => {
      const root = {
        userDetails: JSON.stringify({
          customRegistrationId: 'r1',
          hashedPassword: 'must-not-leak'
        })
      };
      const res = await resolver.userDetails(root, {}, {}, {});
      chaiExpect(res.customRegistrationId).to.equal('r1');
      chaiExpect(res.hashedPassword).to.be.undefined;
    });

    it('returns null when userDetails is null', async () => {
      const res = await resolver.userDetails({ userDetails: null }, {}, {}, {});
      chaiExpect(res).to.be.null;
    });
  });

  describe('#status', () => {
    const now = Math.floor(Date.now() / 1000);
    const past = now - 10;
    const future = now + 10;
    it.each([
      [
        'should return "expired" when status is "submitted" and expired',
        'submitted',
        past,
        'expired'
      ],
      [
        'should return "completed" when status is "completed" and expired',
        'completed',
        past,
        'completed'
      ],
      [
        'should return "deleted" when status is "deleted" and expired',
        'deleted',
        past,
        'deleted'
      ],
      [
        'should return "rejected" when status is "rejected" and expired',
        'rejected',
        past,
        'rejected'
      ],
      [
        'should return "approved" when status is "approved" and not expired',
        'approved',
        future,
        'approved'
      ],
      [
        'should return "deleted" when status is "deleted" and not expired',
        'deleted',
        future,
        'deleted'
      ],
      [
        'should return "rejected" when status is "rejected" and not expired',
        'rejected',
        future,
        'rejected'
      ],
      [
        'should return "submitted" when status is "submitted" and not expired',
        'submitted',
        future,
        'submitted'
      ]
    ])('%s', (_desc, status, expirationDate, expected) => {
      const result = resolver.status({ status, expirationDate });
      chaiExpect(result).to.equal(expected);
    });
  });
});
