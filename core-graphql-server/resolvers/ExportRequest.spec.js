const chaiExpect = require('chai').expect; //require('expect.js');
const mockUtil = require('../test/mockUtil.js')();
const { v5: uuidv5 } = require('uuid');
jest.mock('./util.js');
const rutil = require('./util.js');
rutil.mockImplementation(() => {
  return {
    getSignedUrl: (uri, bucket, fn) => Promise.resolve(uri)
  };
});

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
let resolver = require('./ExportRequest.js')(serviceContext);

describe('ExportRequest.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('#require', function () {
    it('should have correct structure', async function () {
      chaiExpect(typeof resolver.assetUri).to.equal('function');
    });

    it('should resolve assetUri', async function () {
      chaiExpect(
        await resolver.assetUri(
          { assetUri: 'http://localhost/' },
          { fileName: 'test' }
        )
      ).to.equal('http://localhost/');
    });
  });
});
