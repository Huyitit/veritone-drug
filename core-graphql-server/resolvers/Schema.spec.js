const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
let resolvers = require('./Schema.js')(serviceContext);
const moment = require('moment');

describe('#Schema', function () {
  serviceContext.loaders = {
    usersById: {
      load: jest.fn()
    }
  };
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
  });
  describe('#dataRegistry', function () {
    it('should get data registry', async function () {
      const dId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: dId,
            description: 'test',
            organizationId: '7682',
            createdBy: dId,
            modifiedBy: dId,
            createdDateTime: moment().valueOf(),
            modifiedDateTime: moment().valueOf(),
            isSystem: false
          }
        ],
        false
      );

      const res = await resolvers.dataRegistry(
        { dataRegistryMetadataId: dId, organizationId: 7682 },
        {},
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(dId);
    });
  });
  describe('#structuredDataObjects', function () {
    it('should get SDOs', async function () {
      const dId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: dId,
            organizationId: '7682',
            majorVersion: 1,
            minorVersion: 1,
            status: 'published',
            storageName: 'test'
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: dId,
            description: 'test',
            organizationId: '7682',
            createdBy: dId,
            modifiedBy: dId,
            createdDateTime: moment().valueOf(),
            modifiedDateTime: moment().valueOf(),
            isSystem: false
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: dId,
            dataRegistryId: dId,
            data: { foo: 'bar' },
            createdDateTime: moment().valueOf(),
            modifiedDateTime: moment().valueOf()
          }
        ],
        false
      );
      const res = await resolvers.structuredDataObjects(
        { id: dId },
        { offset: 10, limit: 10 },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });
  });
  describe('#simple resolvers', function () {
    it('dataRegistryId', async function () {
      chaiExpect(
        await resolvers.dataRegistryId({ dataRegistryMetadataId: '123' })
      ).to.equal('123');
    });
    it('status', async function () {
      chaiExpect(await resolvers.status({ status: 'published' })).to.equal(
        'published'
      );
    });
    it('definition - schema', async function () {
      chaiExpect(
        await resolvers.definition({ schema: { foo: 'bar' } })
      ).to.deep.equal({ foo: 'bar' });
    });
    it('definition - string', async function () {
      chaiExpect(
        await resolvers.definition({ schema: '{"foo": "bar"}' })
      ).to.deep.equal({ foo: 'bar' });
    });
  });

  describe('#validActions', function () {
    it('should get valid actions for viewer org - published', async function () {
      const res = await resolvers.validActions(
        { status: 'published', organizationId: 10001 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['view']);
    });
    it('should get valid actions for viewer org - deleted', async function () {
      const res = await resolvers.validActions(
        { status: 'deleted', organizationId: 10001 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['view']);
    });

    it('should get valid actions for owner org - published', async function () {
      const res = await resolvers.validActions(
        { status: 'published', organizationId: 7682 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['view', 'edit', 'deactivate', 'delete']);
    });
    it('should get valid actions for owner org - deleted', async function () {
      const res = await resolvers.validActions(
        { status: 'deleted', organizationId: 7682 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal([]);
    });
    it('should get valid actions for owner org - inactive', async function () {
      const res = await resolvers.validActions(
        { status: 'inactive', organizationId: 7682 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['view', 'publish', 'delete']);
    });
    it('should get valid actions for owner org - inactive', async function () {
      const res = await resolvers.validActions(
        { status: 'draft', organizationId: 7682 },
        {},
        mockUtil.makeContext(),
        {}
      );
      chaiExpect(res).to.deep.equal(['view', 'edit', 'publish', 'delete']);
    });
  });

  describe('#modifiedBy', function () {
    it('should handle null value', async function () {
      const res = await resolvers.modifiedBy({});
      chaiExpect(res).to.be.null;
    });
    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.loaders.usersById.load.mockResolvedValue({ id: userId });
      const res = await resolvers.modifiedBy(
        { modifiedBy: userId },
        null,
        serviceContext
      );
      chaiExpect(res.id).to.equal(userId);
    });
  });

  describe('#createdBy', function () {
    it('should handle null value', async function () {
      const res = await resolvers.createdBy({});
      chaiExpect(res).to.be.null;
    });

    it('should get user', async function () {
      const userId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      serviceContext.loaders.usersById.load.mockResolvedValue({ id: userId });
      serviceContext.dbConnections['sso'].write._push(
        [
          {
            user_id: userId,
            user_name: 'test user',
            kvp: {
              firstName: 'test',
              lastName: 'user'
            }
          }
        ],
        false
      );
      const res = await resolvers.createdBy(
        { createdBy: userId },
        null,
        serviceContext
      );
      chaiExpect(res.id).to.equal(userId);
    });
  });
});
