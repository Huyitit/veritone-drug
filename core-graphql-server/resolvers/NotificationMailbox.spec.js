const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../test/mockUtil.js')();

const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolver = require('./NotificationMailbox.js')(serviceContext);
let context;

describe('NotificationMailbox', function () {
  beforeEach(() => {
    context = {
      _authInfo: mockUtil.getGraphQLContext(null, 'user'),
      config: serviceContext.config
    };
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(10);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(resolver);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof resolver[key] === 'function') {
          // it's a resolver function. call it.
          try {
            await resolver[key]({}, { id: '1' }, context);
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
