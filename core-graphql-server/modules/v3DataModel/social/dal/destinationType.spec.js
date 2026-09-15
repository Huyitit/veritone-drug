const chaiExpect = require('chai').expect;
const mockUtil = require('../../../../test/mockUtil.js')();

const serviceContext = require('../../test/serviceContext.mock.js')();
const dal = require('./destinationType.js')(serviceContext);
const context = mockUtil.makeContext();

const ROW = {
  id: 'c42be8c9-a848-4bc7-b461-5001dc342232',
  name: 'YouTube',
  platform: 'youtube',
  vendor_capability: 'social-publish',
  icon_class: 'icon-youtube',
  engine_id: '16568b5f-2aaa-48e6-975b-2dec5f098a29',
  config_schema_id: 'd78e9ed7-597e-41ae-b5e9-665b18c71f15',
  publish_schema_id: '34fb89b9-cf59-4ca2-bc9c-bf19f8af5216',
  is_public: true,
  created_date_time: '2026-06-26T00:00:00.000Z',
  modified_date_time: '2026-06-26T00:00:00.000Z'
};

describe('destinationType.js (BE-10)', function () {
  beforeEach(function () {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('loads the module with the expected read API', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(dal.getDestinationType).to.be.a('function');
      chaiExpect(dal.getDestinationTypes).to.be.a('function');
    });
  });

  describe('#getDestinationTypes', function () {
    it('returns camelized seeded rows', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestinationTypes(context, {});
      chaiExpect(res).to.be.an('array').with.length(1);
      chaiExpect(res[0].id).to.equal(ROW.id);
      chaiExpect(res[0].vendorCapability).to.equal('social-publish');
      chaiExpect(res[0].engineId).to.equal('16568b5f-2aaa-48e6-975b-2dec5f098a29');
      chaiExpect(res[0].configSchemaId).to.equal(ROW.config_schema_id);
      chaiExpect(res[0].publishSchemaId).to.equal(ROW.publish_schema_id);
      chaiExpect(res[0].createdDateTime).to.exist;
      chaiExpect(res[0].modifiedDateTime).to.exist;
    });

    it('applies optional filters without throwing', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestinationTypes(context, {
        ids: [ROW.id],
        vendorCapability: 'social-publish',
        platform: 'youtube'
      });
      chaiExpect(res).to.be.an('array').with.length(1);
    });
  });

  describe('#getDestinationType', function () {
    it('returns a single type by id', async function () {
      serviceContext.dbConnections['core'].read._push([ROW]);
      const res = await dal.getDestinationType(context, { id: ROW.id });
      chaiExpect(res.id).to.equal(ROW.id);
    });

    it('throws not_found when the type does not exist', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      let err;
      try {
        await dal.getDestinationType(context, { id: ROW.id });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
    });
  });
});
