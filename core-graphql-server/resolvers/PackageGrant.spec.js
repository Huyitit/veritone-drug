const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./PackageGrant.js')(serviceContext);
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
describe('#PackageGrant', function () {
  describe('#organization', function () {
    it('should get organization', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);

      const mockedContext = {
        ...mockUtil.makeContext(),
        _authInfo: {
          authorizedOrganizationIds: [7682],
          organization: {
            organizationId: 7682
          }
        }
      };

      const res = await resolvers.organization(
        { organizationId: '7682' },
        {},
        mockedContext
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(7682);
    });
    it('should get organization - internal param', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);
      const mockedContext = {
        ...mockUtil.makeContext(),
        _authInfo: {
          authorizedOrganizationIds: [7682],
          organization: {
            organizationId: 7682
          }
        }
      };
      const res = await resolvers.organization(
        { organizationId: 'internal' },
        {},
        mockedContext
      );
      chaiExpect(res).to.null;
    });

    it('should get organization skip cache', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);
      const mockedContext = {
        ...mockUtil.makeContext(),
        _authInfo: {
          authorizedOrganizationIds: [7682],
          organization: {
            organizationId: 7682
          }
        },
        skipCache: true
      };
      const res = await resolvers.organization(
        { organizationId: 'internal' },
        {},
        mockedContext
      );
      chaiExpect(res).to.null;
    });
  });

  describe('#modifiedBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.modifiedBy({ modifiedBy: userId });
      chaiExpect(res.id).to.equal(userId);
    });
  });

  describe('#createdBy', function () {
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            firstName: 'test',
            lastName: 'user',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.createdBy({ createdBy: userId });
      chaiExpect(res.id).to.equal(userId);
    });
  });

  describe('#package', function () {
    it('should get package', async function () {
      const uuid = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: uuid,
            packageId: uuid,
            resourceType: 'Engine'
          }
        ],
        false
      );
      const mockedContext = {
        ...mockUtil.makeContext(),
        _authInfo: {
          authorizedOrganizationIds: [7682],
          organization: {
            organizationId: 7682
          }
        }
      };
      const res = await resolvers.package(
        { packageId: uuid },
        {},
        mockedContext
      );
      chaiExpect(res.id).to.equal(uuid);
    });
  });
});
