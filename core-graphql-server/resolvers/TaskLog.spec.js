const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const query = require('./TaskLog.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
});

describe('TaskLog.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(3);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  it('should sign uri', async function () {
    const uri = query['uri'];

    let result = await uri({ uri: 'abc' });
    chaiExpect(result).to.equal('abc');

    result = await uri({ uri: 's3://abc' });

    chaiExpect(result).to.equal('https://s3-us-east-1.amazonaws.com/abc/null');
  });
});
