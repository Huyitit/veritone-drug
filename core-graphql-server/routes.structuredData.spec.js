'use strict';

jest.mock('./error', () => () => ({}));
jest.mock('./sdoAdapter/wideOrbit', () => () => ({}));
jest.mock('./sdoAdapter/csrdsAutomation', () => () => ({}));
jest.mock('./sdoAdapter/iMediaTouch', () => () => ({}));
jest.mock('./sdoAdapter/audioVault', () => () => ({}));

const setUpRoutes = require('./routes.structuredData');

function makeApp() {
  const middlewareFn = jest.fn();
  return {
    use: jest.fn(),
    post: jest.fn(),
    middleware: {
      authenticationOption: jest.fn(() => middlewareFn),
      loadAuthDataByToken: middlewareFn
    }
  };
}

function makeServiceContext(app) {
  return {
    app,
    config: {},
    logger: { warn: jest.fn(), error: jest.fn() },
    dal: {
      structuredData: {},
      application: { getAppIdFromOrgId: jest.fn() }
    },
    redisCache: { get: jest.fn(), set: jest.fn() }
  };
}

function getPreAuthMiddleware() {
  const app = makeApp();
  setUpRoutes(makeServiceContext(app));
  const [, middlewares] = app.use.mock.calls[0];
  return middlewares[0];
}

describe('#routes.structuredData.js — preAuthParseQueryJwt', function () {
  it('sets Authorization header from query.token when no header present', function () {
    const middleware = getPreAuthMiddleware();
    const req = { headers: {}, body: {}, query: { token: 'query-jwt' } };
    const next = jest.fn();
    middleware(req, {}, next);
    expect(req.headers.authorization).toBe('Bearer query-jwt');
    expect(next).toHaveBeenCalled();
  });

  it('prefers body.token over query.token when no Authorization header', function () {
    const middleware = getPreAuthMiddleware();
    const req = {
      headers: {},
      body: { token: 'body-jwt' },
      query: { token: 'query-jwt' }
    };
    middleware(req, {}, jest.fn());
    expect(req.headers.authorization).toBe('Bearer body-jwt');
  });

  it('does not overwrite an existing Authorization header', function () {
    const middleware = getPreAuthMiddleware();
    const req = {
      headers: { authorization: 'Bearer existing-token' },
      body: {},
      query: {}
    };
    middleware(req, {}, jest.fn());
    expect(req.headers.authorization).toBe('Bearer existing-token');
  });

  it('falls back to invalid-sdo-token sentinel when no token provided', function () {
    const middleware = getPreAuthMiddleware();
    const req = { headers: {}, body: {}, query: {} };
    middleware(req, {}, jest.fn());
    expect(req.headers.authorization).toBe('Bearer invalid-sdo-token');
  });
});
