const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('./test/mockUtil.js')();

// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

// turn off config refresh interval() (the refresh code is still tested)
_.set(serviceContext, 'config.rateLimit.enableConfigRefresh', false);

// sets up default config settings used for most tests
function setBaseConfig() {
  _.set(serviceContext, 'config.featureFlags.rateLimitWarnOnly', false);
  _.set(serviceContext, 'config.rateLimit.organization.7682', 2);
  _.set(serviceContext, 'config.rateLimit.tokenType.user', 1);
  _.set(serviceContext, 'config.rateLimit.tokenType.engineJWT', 1);
  _.set(serviceContext, 'config.rateLimit.tokenType.internal', 1);
  _.set(serviceContext, 'config.rateLimit.tokenType.apikey', 1);
  _.set(serviceContext, 'config.rateLimit.tokenType.default', 2);
  _.set(
    serviceContext,
    'config.featureFlags.rateLimitEngineJwtByOrgEnabled',
    false
  );
  _.set(
    serviceContext,
    'config.rateLimit.token.internal-service:a5e73d8dceeb7b53930753',
    1
  );
}

setBaseConfig();

// shortcut to DB SSO mock so we can inject some results
const ssoDb = serviceContext.dbConnections['sso'].read;

// function that resets all settings and cached values
// to get ready for each test
function reset() {
  serviceContext.redisClient._clear();
  serviceContext.monitoring._setIsUnhealthy(0);
  serviceContext.redisClient._clearCounter();
  serviceContext.messageUtil._clearCounter();
  setBaseConfig();
  ssoDb._clearResultQueue();
}

// creates an engine JWT used to validate that code path

describe('#rateLimit', function () {
  beforeEach(reset);

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      let rateLimit = require('./rateLimit.js')(serviceContext);
      expect(Object.keys(rateLimit).length).toEqual(4);
      expect(typeof rateLimit.rateLimitMiddlewarePreAuth).toEqual('function');
      expect(typeof rateLimit.rateLimitMiddlewarePostAuth).toEqual('function');
      expect(typeof rateLimit.init).toEqual('function');
      expect(typeof rateLimit._clearIntervalStats).toEqual('function');
    });
  });

  describe('#testInit()', function () {
    it('should test init with dbUpdate', async function () {
      let rateLimit = require('./rateLimit.js')(serviceContext);
      let res, error;
      const now = moment().add(1, 'hour');
      const nowStr = now.toISOString();
      const prevStr = now.subtract(4, 'hour').toISOString();
      // add some fake results to database query result queue
      ssoDb._clearResultQueue();
      ssoDb._push([
        {
          // token config
          token_id: 'token1',
          created_date_time: prevStr,
          modified_date_time: nowStr,
          interval_limit: 10
        }
      ]);
      ssoDb._push([
        {
          // org config
          organization_id: 1,
          created_date_time: prevStr,
          modified_date_time: nowStr,
          interval_limit: 100
        }
      ]);
      ssoDb._push([
        {
          // token type
          token_type: 'user',
          created_date_time: prevStr,
          modified_date_time: prevStr,
          interval_limit: 10
        }
      ]);
      ssoDb._push([
        {
          // config settings
          setting_key: 'limit1',
          created_date_time: prevStr,
          modified_date_time: prevStr,
          interval_limit: 10
        }
      ]);

      try {
        res = await rateLimit.init();
      } catch (err) {
        error = err;
      }
      expect(
        error ? JSON.stringify(error, null, 2) : undefined
      ).toBeUndefined();
      expect(res).toBeDefined();
      // verify that all results consumed (4 queries made)
      expect(ssoDb._resultQueueSize()).toEqual(0);
    });
  });

  describe('#rateLimitMiddlewarePreAuth', function () {
    it('should not fail normal request', function () {
      let rateLimit = require('./rateLimit.js')(serviceContext);
      reset();
      const req = mockUtil.getRequest('token:123');
      const res = httpMock.createResponse();
      rateLimit.rateLimitMiddlewarePreAuth(
        req,
        res,
        mockUtil.getOkHttpResponseNext(res)
      );
      expect(res.statusCode).toEqual(200);
      expect(res._isEndCalled()).toEqual(true);
      expect(res._isJSON()).toEqual(true);
      expect(serviceContext.redisClient._counter()).toEqual(0);
    });

    it('should 200 if server is unhealthy and warn-only', function () {
      reset();
      const req = mockUtil.getRequest('token:123');
      const res = httpMock.createResponse();
      serviceContext.monitoring._setIsUnhealthy(1);
      _.set(serviceContext, 'config.featureFlags.rateLimitWarnOnly', true);
      let rateLimit = require('./rateLimit.js')(serviceContext);
      rateLimit.rateLimitMiddlewarePreAuth(
        req,
        res,
        mockUtil.getOkHttpResponseNext(res)
      );
      expect(res.statusCode).toEqual(429);
      expect(res._isEndCalled()).toEqual(true);
      expect(res._isJSON()).toEqual(true);
      expect(res._weHandled).toBeUndefined();
      const body = res._getData();
      expect(body).toBeDefined();

      expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
      expect(_.get(body, 'errors[0].data.reason')).toEqual('server_health');
      expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
      expect(res.getHeader('Retry-After')).toEqual('10');
      expect(serviceContext.redisClient._counter()).toEqual(0);
    });

    it('should 429 if server is unhealthy and not warn-only', function () {
      reset();
      let rateLimit = require('./rateLimit.js')(serviceContext);
      const req = mockUtil.getRequest('token:123');
      const res = httpMock.createResponse();
      serviceContext.monitoring._setIsUnhealthy(1);
      rateLimit.rateLimitMiddlewarePreAuth(
        req,
        res,
        mockUtil.getOkHttpResponseNext(res)
      );
      expect(res.statusCode).toEqual(429);
      expect(res._isEndCalled()).toEqual(true);
      expect(res._isJSON()).toEqual(true);
      expect(res._weHandled).toBeUndefined();
      const body = res._getData();
      expect(body).toBeDefined();

      expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
      expect(_.get(body, 'errors[0].data.reason')).toEqual('server_health');
      expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
      expect(res.getHeader('Retry-After')).toEqual('10');
      expect(serviceContext.redisClient._counter()).toEqual(0);
    });
  });

  describe('#rateLimitMiddlewarePostAuth', function () {
    it('should not fail normal request with user', async function () {
      reset();
      let rateLimit = require('./rateLimit.js')(serviceContext);
      const req = mockUtil.getRequest(
        '513e96ec-ceb3-4349-b56d-4ea9c035a37c',
        'user'
      );
      const res = httpMock.createResponse();
      await rateLimit.rateLimitMiddlewarePostAuth(
        req,
        res,
        mockUtil.getOkHttpResponseNext(res)
      );
      expect(res.statusCode).toEqual(200);
      expect(res._isEndCalled()).toEqual(true);
      expect(res._isJSON()).toEqual(true);
      expect(res._weHandled).toEqual(true);
      expect(serviceContext.redisClient._counter()).toEqual(4);
    });
  });

  it('should not fail normal request with org api key', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const req = mockUtil.getRequest(
      '7682-human:513e96ec-eb94-4643-89c3-195dc46235bd-178c4398-1809-4bfe-8d3c-0aa8b7045f8e',
      'api_org'
    );
    const res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
  });

  it('should not fail normal request with engine JWT', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token = mockUtil.getEngineJWT(serviceContext);
    const req = mockUtil.getRequest(token, 'engineJWT');
    const res = httpMock.createResponse();
    serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
  });

  it('should not fail normal request with internal api key', async function () {
    reset();
    _.set(serviceContext, 'config.rateLimit.organization.internal', 1);
    _.set(serviceContext, 'config.rateLimit.tokenType.internal', 10);
    _.set(
      serviceContext,
      'config.rateLimit.token.internal-service:a5e73d8dceeb7b53930753',
      10
    );
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token = 'internal-service:a5e73d8dceeb7b53930753';
    let req = mockUtil.getRequest(token, 'api_internal');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);

    // this tests that we do not apply an org limit
    // to an internal org-less token.
    req = mockUtil.getRequest(token, 'api_internal');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
  });

  it('should not error out on unauthenticated call', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const req = mockUtil.getRequest('', 'none');
    const res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(0);
  });

  it('should fail excess request with internal api key', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token = 'internal-service:a5e73d8dceeb7b53930753';
    // first request - pass
    let req = mockUtil.getRequest(token, 'api_internal');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - 429
    req = mockUtil.getRequest(token, 'api_internal');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // fail once more to test circuit breaker
    req = mockUtil.getRequest(token, 'api_internal');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });

  it('should fail excess request with engine JWT', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token = mockUtil.getEngineJWT(serviceContext);
    // first request - pass
    let req = mockUtil.getRequest(token, 'engineJWT');
    let res = httpMock.createResponse();
    serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - 429
    // task info for client info (org)
    serviceContext.dbConnections['core'].read._push([
      {
        engineId: 'e123'
      }
    ]);
    serviceContext.dbConnections['core'].read._push([
      {
        name: 'test engine'
      }
    ]);

    req = mockUtil.getRequest(token, 'engineJWT');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(10);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token, 'engineJWT');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(11);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });

  it('should fail excess request with org api key', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token =
      '7682-human:513e96ec-eb94-4643-89c3-195dc46235bd-178c4398-1809-4bfe-8d3c-0aa8b7045f8e';
    // first request - pass
    let req = mockUtil.getRequest(token, 'api_org');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - 429
    req = mockUtil.getRequest(token, 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token, 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });

  it('should fail excess request with user token', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token = '513e96ec-ceb3-4349-b56d-4ea9c035a37c';
    // first request - pass
    let req = mockUtil.getRequest(token, 'user');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - 429
    req = mockUtil.getRequest(token, 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token, 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });

  it('should fail excess request under same org', async function () {
    // org has limit of 2. each key/token has limit of 1.
    // so if 3 keys each make one request, 3rd should 429
    reset();
    _.set(
      serviceContext,
      'config.featureFlags.rateLimitEngineJwtByOrgEnabled',
      true
    );
    _.set(serviceContext, 'config.rateLimit.tokenType.engineJWT', 10);
    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token =
      '7682-human:513e96ec-eb94-4643-89c3-195dc46235bd-178c4398-1809-4bfe-8d3c-0aa8b7045f8e';
    // first request - pass
    let req = mockUtil.getRequest(token, 'api_org');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - pass
    req = mockUtil.getRequest('513e96ec-ceb3-4349-b56d-4ea9c035a37c', 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // third request - 429
    req = mockUtil.getRequest(token + '-3', 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual(
      'rate_limit_organization'
    );
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(12);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token + '-4', 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual(
      'rate_limit_organization'
    );
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(12);
    expect(serviceContext.messageUtil._counter()).toEqual(2);

    // engine JWT should NOT fail -- separate limit counter
    req = mockUtil.getRequest(
      mockUtil.getEngineJWT(serviceContext),
      'engineJWT'
    );
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );

    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(16);
    expect(serviceContext.messageUtil._counter()).toEqual(2);

    // engine JWT should NOT fail -- separate limit counter
    req = mockUtil.getRequest(
      mockUtil.getEngineJWT(serviceContext),
      'engineJWT'
    );
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );

    expect(res.statusCode).toEqual(200);

    serviceContext.dbConnections['core'].read._push([
      {
        engineId: 'e123'
      }
    ]);
    // engine JWT SHOULD now fail -- separate limit counter
    req = mockUtil.getRequest(
      mockUtil.getEngineJWT(serviceContext),
      'engineJWT'
    );
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );

    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual(
      'rate_limit_organization'
    );
    expect(_.get(body, 'errors[0].data.organizationId')).toEqual(7682);
    expect(_.get(body, 'errors[0].data.engineId')).toEqual('e123');
    expect(mockUtil.fromTaskId(_.get(body, 'errors[0].data.taskId'))).toEqual(
      'task-job-123'
    );
    expect(_.get(body, 'errors[0].data.engineName')).toEqual('test engine');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
  });
  it('should fail excess engine jwt request under same org', async function () {
    // org has limit of 2. each key/token has limit of 1.
    // so if 3 keys each make one request, 3rd should 429
    reset();
    _.set(
      serviceContext,
      'config.featureFlags.rateLimitEngineJwtByOrgEnabled',
      true
    );
    _.set(serviceContext, 'config.rateLimit.tokenType.engineJWT', 10);

    let rateLimit = require('./rateLimit.js')(serviceContext);
    const token =
      '7682-human:513e96ec-eb94-4643-89c3-195dc46235bd-178c4398-1809-4bfe-8d3c-0aa8b7045f8e';
    // first request - pass
    let req = mockUtil.getRequest(token, 'api_org');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - pass
    req = mockUtil.getRequest('513e96ec-ceb3-4349-b56d-4ea9c035a37c', 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // third request - 429
    req = mockUtil.getRequest(token + '-3', 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual(
      'rate_limit_organization'
    );
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(12);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token + '-4', 'api_org');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual(
      'rate_limit_organization'
    );
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(12);
    expect(serviceContext.messageUtil._counter()).toEqual(2);

    // engine JWT should NOT fail -- separate limit counter
    req = mockUtil.getRequest(
      mockUtil.getEngineJWT(serviceContext),
      'engineJWT'
    );
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );

    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(16);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });

  it('should fail with default based on token type', async function () {
    reset();
    let rateLimit = require('./rateLimit.js')(serviceContext);
    _.set(serviceContext, 'config.rateLimit.tokenType.user', undefined);
    _.set(serviceContext, 'config.rateLimit.tokenType.default', 1);

    const token = '513e96ec-ceb3-4349-b56d-4ea9c035a37c';
    // first request - pass
    let req = mockUtil.getRequest(token, 'user');
    let res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(200);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(serviceContext.redisClient._counter()).toEqual(4);
    expect(serviceContext.messageUtil._counter()).toEqual(0);

    // second request - 429
    req = mockUtil.getRequest(token, 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    let body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(1);

    // test circuit breaker
    req = mockUtil.getRequest(token, 'user');
    res = httpMock.createResponse();
    await rateLimit.rateLimitMiddlewarePostAuth(
      req,
      res,
      mockUtil.getOkHttpResponseNext(res)
    );
    expect(res.statusCode).toEqual(429);
    expect(res._isEndCalled()).toEqual(true);
    expect(res._isJSON()).toEqual(true);
    expect(res._weHandled).toBeUndefined();
    body = res._getData();
    expect(body).toBeDefined();
    expect(_.get(body, 'errors[0].name')).toEqual('rate_limited');
    expect(_.get(body, 'errors[0].data.reason')).toEqual('rate_limit_token');
    expect(_.get(body, 'errors[0].data.retryAfterSeconds')).toEqual(10);
    expect(res.getHeader('Retry-After')).toEqual('10');
    expect(serviceContext.redisClient._counter()).toEqual(8);
    expect(serviceContext.messageUtil._counter()).toEqual(2);
  });
});
