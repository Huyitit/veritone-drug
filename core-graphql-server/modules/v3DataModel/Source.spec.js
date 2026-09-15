const chaiExpect = require('chai').expect;
const mockUtil = require('../../test/mockUtil.js')();

const serviceContext = require('../../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolvers = require('./Source.js')(serviceContext, serviceContext.config);

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

describe('#Source', function () {
  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(resolvers).to.be.a('object');
      const keys = Object.keys(resolvers);
      chaiExpect(keys.length).to.equal(11);

      keys.forEach((key) => {
        chaiExpect(typeof resolvers[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(resolvers);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof resolvers[key] === 'function') {
          try {
            await resolvers[key]({ id: '1' }, { id: '1' }, context);
          } catch (err) {
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });
});
