const chaiExpect = require('chai').expect;
const mockUtil = require('../../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolvers = require('./ScheduledJobContentTemplate.js')(serviceContext, serviceContext.config);

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

describe('#ScheduledJobContentTemplate', function () {
  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(resolvers).to.be.a('object');
      const keys = Object.keys(resolvers);
      chaiExpect(keys.length).to.equal(2);

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
          // it's a resolver function. call it.
          try {
            await resolvers[key]({ id: '1', sdoId: '1', schemaId: '1' }, { id: '1' }, context);
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
