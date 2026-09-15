const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./Package.js')(serviceContext);

describe('#Package', function () {
  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#grantType', function () {
    it('should return grantType when present', function () {
      const res = resolvers.grantType({ grantType: 'GRANT' });
      chaiExpect(res).to.equal('GRANT');
    });

    it('should return null when grantType is not present', function () {
      const res = resolvers.grantType({});
      chaiExpect(res).to.be.null;
    });

    it('should return null when grantType is null', function () {
      const res = resolvers.grantType({ grantType: null });
      chaiExpect(res).to.be.null;
    });

    it('should return VIEW grantType', function () {
      const res = resolvers.grantType({ grantType: 'VIEW' });
      chaiExpect(res).to.equal('VIEW');
    });
  });

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
      const res = await resolvers.organization(
        { organizationId: '7682' },
        {},
        mockUtil.makeContext()
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
      const res = await resolvers.organization(
        { organizationId: 'internal' },
        {},
        mockUtil.makeContext()
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
      const res = await resolvers.organization(
        { organizationId: 'internal' },
        {},
        {
          ...mockUtil.makeContext(),
          skipCache: true
        }
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

  describe('#resources', function () {
    it('should get resources', async function () {
      const uuid = '1c1de633-8745-403f-b6ea-5c77cb22a46d';

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: uuid,
            packageId: uuid,
            resourceType: 'engine'
          }
        ],
        false
      );
      const res = await resolvers.resources(
        { packageId: uuid },
        {},
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        }
      );
      chaiExpect(res.records[0].id).to.equal(uuid);
    });

    it('should get resources with type', async function () {
      const uuid = '1c1de633-8745-403f-b6ea-5c77cb22a46d';

      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: uuid,
            packageId: uuid,
            resourceType: 'engine'
          }
        ],
        false
      );
      const res = await resolvers.resources(
        { packageId: uuid },
        { type: 'engine' },
        {
          ...mockUtil.makeContext(),
          _authInfo: {
            authorizedOrganizationIds: [7682]
          }
        }
      );
      chaiExpect(res.records[0].id).to.equal(uuid);
      chaiExpect(res.records[0].resourceType).to.equal('engine');
    });
  });

  describe('#primaryResource', function () {
    it('should get primary resource', async function () {
      const primaryResourceId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';

      serviceContext.dbConnections['core'].write._push(
        [
          {
            resourceId: primaryResourceId,
            resourceType: 'Engine'
          }
        ],
        false
      );
      const res = await resolvers.primaryResource({
        primaryResourceId: primaryResourceId,
        offset: 0,
        limit: 1
      });
      chaiExpect(res.resourceId).to.equal(primaryResourceId);
      chaiExpect(res.resourceType).to.equal('Engine');
    });
  });
});
