const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();
const { v5: uuidv5 } = require('uuid');
const stringify = require('json-stable-stringify');
const _ = require('lodash');

jest.mock('./util.js');
const rutil = require('./util.js');
rutil.mockImplementation(() => ({
  getSignedUrl: (obj) => (obj.id ? 'https://this-is-an-signed-uri' : null),
  // VE-25066: signedImageUrl now delivers via getSignedUrlOrVirtual (flag-gated
  // stateless virtual URI). Distinct sentinel proves the field routes through
  // the new helper — surfacing a virtual URI — rather than in-place signing.
  getSignedUrlOrVirtual: (obj) => (obj.id ? 'https://virtual-signed-uri' : null)
}));

const serviceContext = require('../test/serviceContext.mock.js')();
const resolver = require('./Collection.js')(serviceContext);

async function prepareServiceContext() {
  await _.set(
    serviceContext,
    'dal.organization.getOrganization',
    (context, input) => (input.id ? { id: input.id, name: 'test Org' } : null)
  );

  await _.set(
    serviceContext,
    'dal.folder.getParentFolder',
    (ctx, id, organizationId) =>
      new Promise((resolve, reject) =>
        !!id === true
          ? resolve({ id: 'test_id', name: 'test folder' })
          : resolve()
      )
  );

  return serviceContext;
}

describe('Collection.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver).to.equal('object');
      chaiExpect(Object.keys(resolver).length).to.equal(5);
      chaiExpect(typeof resolver.widgets).to.equal('function');
      chaiExpect(typeof resolver.organization).to.equal('function');
      chaiExpect(typeof resolver.signedImageUrl).to.equal('function');
      chaiExpect(typeof resolver.mentions).to.equal('function');
      chaiExpect(typeof resolver.folder).to.equal('function');
    });

    it('should return null when get widgets without organizationId', async function () {
      const context = mockUtil.makeContext();
      const obj = {
        folderId: 8383
      };
      const args = {
        offset: 0,
        limit: 30
      };
      const res = await resolver.widgets(obj, args, context);
      chaiExpect(res).to.equal(null);
    });

    it('should resolve widgets with organizationId', async function () {
      const context = mockUtil.makeContext();
      const obj = {
        folderId: 8383,
        organizationId: 7682
      };
      const args = {
        offset: 0,
        limit: 30
      };
      const res = await resolver.widgets(obj, args, context);
      chaiExpect(res.records[0].organizationId).to.equal(obj.organizationId);
    });

    it('should return null when get organization data without organizationId', async () => {
      await prepareServiceContext();
      const context = mockUtil.makeContext();
      const res = await resolver.organization({}, {}, context);

      chaiExpect(res).to.equal(null);
    });

    it('should resolve organization when get organization data with organizationId', async () => {
      await prepareServiceContext();
      const context = mockUtil.makeContext();
      const obj = { organizationId: 'test_id' };
      const res = await resolver.organization(obj, {}, context);

      chaiExpect(res.id).to.equal(obj.organizationId);
    });

    it('should return null when get signedImageURl without its name', async () => {
      const res = await resolver.signedImageUrl({ image: {} });
      chaiExpect(res).to.equal(null);
    });

    it('should deliver signedImageUrl via getSignedUrlOrVirtual (VE-25066)', async () => {
      const res = await resolver.signedImageUrl({ image: { id: 6789 } });
      chaiExpect(res).to.equal('https://virtual-signed-uri');
    });

    it('should return empty array when get folder without its id', async () => {
      const res = await resolver.folder({ id: '' }, {});
      chaiExpect(res.length).to.equal(0);
    });

    it('should return valid array when get folder with object id', async () => {
      const res = await resolver.folder({ id: 'test id' }, {});
      chaiExpect(res.length).to.equal(1);
    });
  });
});
