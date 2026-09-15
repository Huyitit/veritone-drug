const _ = require('lodash');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const base64 = require('base-64');
const httpMock = require('node-mocks-http');

jest.mock('request-promise');

// get mock base service context

const serviceContext = require('./test/serviceContext.mock.js')({
  mockHttp: false
});

_.set(
  serviceContext,
  'config.s3.fileId',
  'NPIEpAIBAAKCAQEAqCrrzfGpgFk4raHeTa1t6SIkYuaEYctBPmldlgonbGySf/1QA8v0Vajnt1D+4+TBK5lz6hBC466iBa+q3fJsWP9pkPE36irT8T6UXZZk6bJbeI'
);
_.set(serviceContext, 'config.oktaAuth.useErrorPage', false);

const origConfig = _.clone(serviceContext.config);

describe('#oktaAuth.js', function () {
  beforeEach(() => {
    serviceContext.config = origConfig;
  });

  describe('#require', function () {
    beforeEach(() => (serviceContext.config = origConfig));
    it('should load module', function () {
      const mod = require('./oktaAuth.js')(serviceContext);
      expect(typeof mod).toEqual('object');
      expect(Object.keys(mod).length).toEqual(9);
      expect(typeof mod.oktaAuthCodeCallback).toEqual('function');
      expect(typeof mod.getSigninMethod).toEqual('function');
    });
    it('should error if jwt secret not configured', function () {
      serviceContext.config = {};
      //expect(() => require('./oktaAuth.js', serviceContext)).toThrow('secret is not configured');
      try {
        require('./oktaAuth.js')(serviceContext);
        throw new Error('no throw');
      } catch (err) {
        expect(_.toString(err)).toContain('secret is not configured');
      }
    });
  });
  describe('#getOktaConfig', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    beforeEach(() => serviceContext._clearAll());

    it('should get empty config', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 100,
          organization_name: 'test org',
          kvp: {}
        }
      ]);
      const res = await mod._getOktaConfig(100);
      expect(res).toExist;
      expect(res.oktaAuthenticationEnabled).toEqual(false);
    });
    it('should get config', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 100,
          organization_name: 'test org',
          kvp: { features: { oktaAuthentication: { enabled: true } } }
        }
      ]);

      const res = await mod._getOktaConfig(101);
      expect(res).toExist;
      expect(res.oktaAuthenticationEnabled).toEqual(true);
    });
  });
  describe('#_getConfiguredUrls', function () {
    beforeEach(() => (serviceContext.config = origConfig));
    it('should default everything from modified publicDnsZoneName', function () {
      serviceContext.config = {
        publicDnsZoneName: 'aws-test.veritone.com',
        jwt: { secret: 'secret' }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-test.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-test.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-test.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-test.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-test.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-test.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-test.veritone.com/login/#/next/'
      );
    });
    it('should default everything from modified apiRoot', function () {
      serviceContext.config = {
        apiRoot: 'https://myapi.aws-dev.veritone.com',
        jwt: { secret: 'secret' }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://myapi.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://myapi.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should default everything from modified wwwRoot', function () {
      serviceContext.config = {
        wwwRoot: 'https://mywww.aws-dev.veritone.com',
        jwt: { secret: 'secret' }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://mywww.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://mywww.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://mywww.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://mywww.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should default everything from default publicDnsZoneName', function () {
      serviceContext.config = {
        jwt: { secret: 'secret' }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should allow override of callback url', function () {
      serviceContext.config = {
        jwt: { secret: 'secret' },
        oktaAuth: {
          oktaCallbackUrl:
            'https://custom.callback.veritone.com/v3/auth/callback'
        }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://custom.callback.veritone.com/v3/auth/callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should allow override of app switcher', function () {
      serviceContext.config = {
        jwt: { secret: 'secret' },
        services: {
          appSwitcherUri: 'https://aws-test.veritone.com/custom-switcher'
        }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://aws-test.veritone.com/custom-switcher'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should allow override of login page url', function () {
      serviceContext.config = {
        jwt: { secret: 'secret' },
        services: {
          loginPageUri: 'https://aws-test.veritone.com/custom-login'
        }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://aws-test.veritone.com/custom-login'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/'
      );
    });

    it('should allow override of next login page url', function () {
      serviceContext.config = {
        jwt: { secret: 'secret' },
        services: {
          nextLoginPageUri:
            'https://www.aws-test.veritone.com/custom-login/#/next'
        }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('aws-dev.veritone.com');
      expect(urls.apiRoot).toEqual('https://api.aws-dev.veritone.com');
      expect(urls.wwwRoot).toEqual('https://www.aws-dev.veritone.com');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(urls.loginUrl).toEqual(
        'https://www.aws-dev.veritone.com/login/#/'
      );
      expect(urls.nextLoginUrl).toEqual(
        'https://www.aws-test.veritone.com/custom-login/#/next'
      );
    });

    it('should default everything from env variable PUBLIC_DNS_ZONE_NAME', function () {
      process.env.PUBLIC_DNS_ZONE_NAME = 'custom.dns.zone';
      serviceContext.config = {
        jwt: { secret: 'secret' }
      };
      const mod = require('./oktaAuth.js')(serviceContext);
      const urls = mod._getConfiguredUrls();
      expect(urls.pubDnsRoot).toEqual('custom.dns.zone');
      expect(urls.apiRoot).toEqual('https://api.custom.dns.zone');
      expect(urls.wwwRoot).toEqual('https://www.custom.dns.zone');
      expect(urls.authCallbackRedirectUrl).toEqual(
        'https://api.custom.dns.zone/v3/auth/authorization-code-callback'
      );
      expect(urls.appSwitcherUrl).toEqual(
        'https://www.custom.dns.zone/switch-app/default'
      );
      expect(urls.loginUrl).toEqual('https://www.custom.dns.zone/login/#/');
      expect(urls.nextLoginUrl).toEqual(
        'https://www.custom.dns.zone/login/#/next/'
      );
    });
  });

  describe('authCodeRequest', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    it('should make request', async function () {
      const authCode = 'abc132';
      const oktaConfig = {
        clientId: 'client123',
        clientSecret: 'secret123',
        oktaDomain: 'test.okta.com'
      };

      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      require('request-promise').post.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'https://test.okta.com/oauth2/default/v1/token'
        );
        const authHeader = req.headers['authorization'];
        const authDecoded =
          authHeader && authHeader.includes('Basic ')
            ? base64.decode(authHeader.substring(6))
            : null;
        expect(authDecoded).toEqual('client123:secret123');
        return Promise.resolve(
          JSON.stringify({
            access_token: accessToken,
            id_token: userToken
          })
        );
      });

      const res = await mod._authCodeRequest(
        authCode,
        oktaConfig,
        'https://api.aws-dev.veritone.com/v3/auth/authorization-code-callback'
      );
      expect(res).toExist;
    });
  });

  describe('redirectToLogin', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    it('should redirect to login with redirect param', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse();
      mod._redirectToLogin(req, res, () => {}, 'nobody@veritone.com');
      expect(res._getStatusCode()).toEqual(302);
      const url = res._getRedirectUrl();
      expect(url).toExist;
    });
  });

  describe('redirectToOkta', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    it('should redirect to okta', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        {
          clientId: 'client123',
          clientSecret: 'secret123',
          oktaDomain: 'test.okta.com'
        },
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(302);
      const url = res._getRedirectUrl();
      expect(url).toExist;
    });
    it('should redirect to okta - set correlationId', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect',
        headers: {
          'veritone-correlation-id': 'id123'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        {
          clientId: 'client123',
          clientSecret: 'secret123',
          oktaDomain: 'test.okta.com'
        },
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(302);
      const url = res._getRedirectUrl();
      expect(url).toExist;
    });

    it('should handle missing okta config - clientId', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        {
          clientSecret: 'secret123',
          oktaDomain: 'test.okta.com'
        },
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(500);
    });
    it('should handle missing okta config - clientSecret', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        {
          clientId: 'secret123',
          oktaDomain: 'test.okta.com'
        },
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(500);
    });

    it('should handle missing okta config - oktaDomain', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        {
          clientId: 'client123',
          clientSecret: 'secret123'
        },
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(500);
    });

    it('should handle missing okta config - all', async function () {
      const req = httpMock.createRequest({
        method: 'GET',
        url: '/original/url?redirect=http://www.aws-test.veritone.com/redirect'
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      mod._redirectToOkta(
        req,
        res,
        () => {},
        null,
        'nobody@veritone.com',
        7682
      );
      expect(res._getStatusCode()).toEqual(500);
    });
  });

  describe('#generateState', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    it('generates state', function () {
      // generate the state
      const state = mod._generateState(
        234,
        'nobody@veritone.com',
        'id234',
        'https://myapp.aws-dev.veritone.com/myapp'
      );
      // unpack it and verify
      const res = jwt.verify(state, serviceContext.config.jwt.secret);

      expect(res.user).toEqual('nobody@veritone.com');
      expect(res.correlationId).toEqual('id234');
      expect(res.org).toEqual(234);
      expect(res.appRedirect).toEqual(
        'https://myapp.aws-dev.veritone.com/myapp'
      );
      expect(res.sub).toEqual('okta');
      expect(res.exp).toExist;
      // expiration should have been set 60s after now. verify it's in a ~2min time window.
      // jwt.sign()'s `expiresIn` derives `exp` from Date.now() truncated to whole seconds
      // (jsonwebtoken/sign.js: `Math.floor(Date.now() / 1000)`), so `expires` can land up to
      // ~1s earlier than a naive "now + 60s". Comparing against untruncated `now` with no
      // slack races that truncation against test-execution timing (T36, empirically ~1 in
      // 1000 runs). A 2s buffer comfortably exceeds the truncation error without weakening
      // the check's intent (expiry is roughly a minute out).
      const now = moment().valueOf();
      const expires = moment(res.exp * 1000);
      const plus1Min = moment(now + 62000);
      const minus1Min = moment(now - 62000);
      expect(expires.isBefore(plus1Min)).toEqual(true);
      expect(expires.isAfter(minus1Min)).toEqual(true);
    });
  });

  describe('#validateState', function () {
    const mod = require('./oktaAuth.js')(serviceContext);

    it('validates state', function () {
      // first make a jwt
      const state = jwt.sign(
        {
          org: 123,
          user: 'nobody@veritone.com',
          appRedirect: 'https://myapp.aws-dev.veritone.com/myapp',
          correlationId: 'id123'
        },
        serviceContext.config.jwt.secret,
        {
          expiresIn: 60,
          jwtid: '74542588-70fb-477d-8962-4c2ae2c47652',
          subject: 'okta'
        }
      );
      // now attempt to validate
      const data = mod._validateState(state);

      expect(data.user).toEqual('nobody@veritone.com');
      expect(data.org).toEqual(123);
      expect(data.appRedirect).toEqual(
        'https://myapp.aws-dev.veritone.com/myapp'
      );
      expect(data.correlationId).toEqual('id123');
    });
    it('handles jwt signed with wrong secret', function () {
      const state = jwt.sign(
        {
          org: 123,
          user: 'nobody@veritone.com',
          appRedirect: 'https://myapp.aws-dev.veritone.com/myapp',
          correlationId: 'id123'
        },
        'not_so_secret',
        {
          expiresIn: 60,
          jwtid: '74542588-70fb-477d-8962-4c2ae2c47652',
          subject: 'okta'
        }
      );

      try {
        mod._validateState(state);
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('JsonWebTokenError');
      }
    });
  });

  describe('#getSigninMethod', function () {
    const mod = require('./oktaAuth.js')(serviceContext);
    beforeEach(() => {
      serviceContext._clearAll();
    });

    it('should get user signin method - error', async function () {
      serviceContext.dbConnections['sso'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('forced error');
        }
      );
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          userLoginId: 'nobody@veritone.com'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      await mod.getSigninMethod(req, res2, () => console.log('NEXT'));
      expect(res2._isEndCalled()).toEqual(true);
      expect(res2._getData()).toEqual('forced error');
      expect(res2._getStatusCode()).toEqual(500);
    });

    it('should get error on no user', async function () {
      serviceContext.dbConnections['sso'].read._push([]);
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          userLoginId: 'nobody@veritone.com'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(404);
    });

    it('should get error on deactivated user', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '74542588-70fb-477d-8962-4c2ae2c47652',
          user_name: 'nobody@veritone.com',
          status: 'inactive',
          organization_id: 7682,
          organization_name: 'Test org'
        }
      ]);
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          userLoginId: 'nobody@veritone.com'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(401);
    });

    it('should get user signin method - okta', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '74542588-70fb-477d-8962-4c2ae2c47652',
          user_name: 'nobody@veritone.com',
          status: 'active',
          organization_id: 109,
          organization_name: 'Test org'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          kvp: { features: { oktaAuthentication: { enabled: true } } }
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);

      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          userLoginId: 'nobody@veritone.com'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(302);
      expect(res2._getRedirectUrl()).toExist;
      expect(res2._getRedirectUrl()).toContain('test.okta.com');
    });

    it('should get org signin method - not found', async function () {
      // get org by org alias
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          orgAlias: 'not_found'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(404);
    });
    it('should get org signin method', async function () {
      // get org by org alias
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organization_id: 102,
            organization_name: 'test org',
            kvp: {
              features: {
                oktaAuthentication: { enabled: true, loginAlias: 'testOrg' }
              }
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organization_id: 102,
            organization_name: 'test org',
            kvp: {
              features: {
                oktaAuthentication: { enabled: true, loginAlias: 'testOrg' }
              }
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);

      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          orgAlias: 'testOrg'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(302);
    });

    it('should get user signin method - login', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '74542588-70fb-477d-8962-4c2ae2c47652',
          user_name: 'nobody@veritone.com',
          status: 'active',
          organization_id: 7682,
          organization_name: 'Test org'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          oktaAuthenticationEnabled: false
        }
      ]);
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {
          userLoginId: 'nobody@veritone.com'
        },
        headers: {
          'content-type': 'application/json'
        }
      });
      const res2 = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res2, () => null);
      expect(res2._getStatusCode()).toEqual(302);
      expect(res2._getRedirectUrl()).toEqual(
        'https://www.aws-dev.veritone.com/login/#/next/?username=nobody@veritone.com'
      );
    });

    it('should 400 error on missing userLoginId', async function () {
      const req = httpMock.createRequest({
        method: 'POST',
        url: '/auth/auth-type',
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.getSigninMethod(req, res, () => null);
      expect(res._getStatusCode()).toEqual(400);
    });
  });

  describe('#oktaAuthCodeCallback', function () {
    beforeEach(() => {
      _.assign(serviceContext, {
        coreAdmin: {
          setupUserSession: jest.fn()
        }
      });
      serviceContext._clearAll();
    });
    const mod = require('./oktaAuth.js')(serviceContext);

    it('should redirect to normal default page', async function () {
      const state = mod._generateState('102', 'nobody@veritone.com');
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      // mock db responses for getOktaConfig
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 102,
          organization_name: 'test org',
          kvp: { features: { oktaAuthentication: { enabled: true } } }
        }
      ]);
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);
      // mock auth cod request
      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      require('request-promise').post.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'https://test.okta.com/oauth2/default/v1/token'
        );
        return Promise.resolve(
          JSON.stringify({
            access_token: accessToken,
            id_token: userToken
          })
        );
      });

      await mod.oktaAuthCodeCallback(req, res, () => null);
      // after successful callback, user should be redirected to the
      // app switcher page
      expect(res._getStatusCode()).toEqual(302);
      const url = res._getRedirectUrl();
      expect(url).toEqual(
        'https://www.aws-dev.veritone.com/switch-app/default'
      );
      expect(serviceContext.coreAdmin.setupUserSession).toHaveBeenCalled();
    });

    it('should error if okta not enabled', async function () {
      const state = mod._generateState('105', 'nobody@veritone.com');
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=105&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      // mock db responses for getOktaConfig
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 105,
          organization_name: 'test org',
          kvp: { features: { oktaAuthentication: { enabled: false } } }
        }
      ]);
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);
      // mock auth cod request
      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      await mod.oktaAuthCodeCallback(req, res, () => null);
      // should error with not enabled
      expect(res._getStatusCode()).toEqual(400);
      expect(res._getData()).toContain('not enabled');
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });

    it('should redirect to requested URL', async function () {
      const state = mod._generateState(
        '102',
        'nobody@veritone.com',
        '12345',
        'https://myapp.veritone.com/myPage'
      );
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      // mock db responses for getOktaConfig
      serviceContext.dbConnections['sso'].read._push([
        {
          credentials_ciphertext:
            '0cedf7fd012151cbbd4ffc5c8b6f7f511ba0ec8d5a7d6e75482620a2021a9e83eeaed155651a445ac298f5188355ad807981a9d8b8af7bec935e2a1755196a0539dad4b6143ea36bae9aa40237e332de5ddfd091fc3afc5710f6308bd5e0a951'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 102,
          organization_name: 'test org',
          kvp: { features: { oktaAuthentication: { enabled: true } } }
        }
      ]);
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);
      // mock auth cod request
      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      require('request-promise').post.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'https://test.okta.com/oauth2/default/v1/token'
        );
        return Promise.resolve(
          JSON.stringify({
            access_token: accessToken,
            id_token: userToken
          })
        );
      });

      await mod.oktaAuthCodeCallback(req, res, () => null);
      // after successful callback, user should be redirected to the
      // url requested in the state
      expect(res._getStatusCode()).toEqual(302);
      const url = res._getRedirectUrl();
      expect(url).toEqual('https://myapp.veritone.com/myPage');
      expect(serviceContext.coreAdmin.setupUserSession).toHaveBeenCalled();
    });

    it('should handle internal error', async function () {
      const state = mod._generateState('103', 'nobody@veritone.com');
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=103&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      // mock db responses for getOktaConfig
      serviceContext.dbConnections['sso'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('forced error');
        }
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('forced error');
        }
      );
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);
      // mock auth cod request
      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      await mod.oktaAuthCodeCallback(req, res, () => null);
      // forced sql error should surface as 500
      expect(res._getStatusCode()).toEqual(500);
      // console.log(res._getData());
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });

    it('should handle error with error page if enabled', async function () {
      _.set(serviceContext, 'config.oktaAuth.useErrorPage', true);
      process.env.PUBLIC_DNS_ZONE_NAME = '';
      const mod2 = require('./oktaAuth.js')(serviceContext);

      const state = mod._generateState('113', 'nobody@veritone.com');
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=113&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      // mock db responses for getOktaConfig
      serviceContext.dbConnections['sso'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('forced error');
        }
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('forced error');
        }
      );
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);
      // mock auth cod request
      // fake a user id token
      const userToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '1234'
      });
      // fake an access token
      const accessToken = jwt.sign({}, serviceContext.config.jwt.secret, {
        jwtid: '12345'
      });

      await mod2.oktaAuthCodeCallback(req, res, () => null);
      // if error page is enabled, should redirect to it
      expect(res._getStatusCode()).toEqual(302);
      expect(res._getRedirectUrl()).toEqual(
        'https://www.aws-dev.veritone.com/login/error/?status=500&message=Error: forced error'
      );
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });

    it('should handle okta error', async function () {
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&error=test_error&error_description=A+test+error',
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.oktaAuthCodeCallback(req, res, () => null);
      expect(res._getStatusCode()).toEqual(400);
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });
    it('should error on wrong org id', async function () {
      const state = mod._generateState(
        '103',
        'nobody@veritone.com',
        '12345',
        'https://myapp.veritone.com/myPage'
      );
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=' + state,
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.oktaAuthCodeCallback(req, res, () => null);
      expect(res._getStatusCode()).toEqual(401);
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });
    it('should error on invalid state', async function () {
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=invalid_state_data',
        body: {},
        headers: {
          'content-type': 'application/json'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      await mod.oktaAuthCodeCallback(req, res, () => null);
      expect(res._getStatusCode()).toEqual(401);
      expect(serviceContext.coreAdmin.setupUserSession).not.toHaveBeenCalled();
    });
  });
});
