const chaiExpect = require('chai').expect;
const mockUtil = require('../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const query = require('./Mutation.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
});

describe('#Mutation workflow', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(21);
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(query);
      for (const resolver of keys) {
        if (typeof query[resolver] === 'function') {
          try {
            await query[resolver]({}, { id: '1' }, context);
          } catch (err) {
            if (!err.name) throw err;
          }
        }
      }
    });
  });
});
