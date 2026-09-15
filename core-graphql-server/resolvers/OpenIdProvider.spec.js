const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();

const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const resolver = require('./OpenIdProvider.js')(serviceContext);
let context;

describe('OpenIdProvider', () => {
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
      chaiExpect(keys.length).to.equal(1);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(resolver);
      for (const key of keys) {
        if (typeof resolver[key] === 'function') {
          // it's a resolver function. call it.
          try {
            await resolver[key]({}, { id: '1' }, context);
          } catch (err) {
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });

  describe('#loginUrl', function () {
    it('should return a URL created from services.coreAdminUri', async function () {
      const connectId = 'openid-uuid';
      const loginUrl = resolver.loginUrl({ id: 'openid-uuid' });
      const expected = `${_.trimEnd(
        serviceContext.config.services.coreAdminUri,
        '/'
      )}/openid/${connectId}/login`;
      chaiExpect(loginUrl).to.be.equal(expected);
    });
    it('should return a URL created from services.publicDnsZoneName if missing services.coreAdminUri', async function () {
      const pubDnsRoot = 'aws-test.veritone.com';
      const resolver1 = require('./OpenIdProvider.js')({
        config: { publicDnsZoneName: pubDnsRoot }
      });
      const connectId = 'openid-uuid';
      const loginUrl = resolver1.loginUrl({ id: 'openid-uuid' });
      const expected = `https://api.${pubDnsRoot}/api/admin/openid/${connectId}/login`;
      chaiExpect(loginUrl).to.be.equal(expected);
    });
    it('should return a URL created from database instead', async function () {
      const connectId = 'openid-uuid';
      const loginUrl = resolver.loginUrl({ id: 'openid-uuid', redirectBaseUrl: 'https://redirect.base.url' });
      const expected = `https://redirect.base.url/openid/${connectId}/login`;
      chaiExpect(loginUrl).to.be.equal(expected);
    });
  });
});
