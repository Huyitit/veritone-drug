const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config,
    tracer: {
      startSpan: function () {
        return {
          setTag: function () {
            return;
          },
          finish: function () {
            return;
          }
        };
      }
    }
  };
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Mutation', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./Entity.js')(serviceContext);
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(4);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const query = require('./Entity.js')(serviceContext);
      const keys = Object.keys(query);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof query[key] === 'function') {
          // it's a resolver function. call it.
          try {
            await query[key]({}, { id: '1' }, context);
          } catch (err) {
            // TODO fix mock dependencies and start failing
            // on TypeError
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });
});
