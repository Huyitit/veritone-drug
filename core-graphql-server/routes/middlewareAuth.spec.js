'use strict';

const middlewareAuth = require('./middlewareAuth.js');

describe('middlewareAuth', () => {
  const config = {};

  describe('initialize', () => {
    it('returns an object with splitAuthentication', () => {
      const auth = middlewareAuth(config);
      expect(typeof auth.splitAuthentication).toBe('function');
    });
  });

  describe('splitAuthentication', () => {
    it('throws when tokenMiddlewares is not an array', () => {
      const { splitAuthentication } = middlewareAuth(config);
      expect(() => splitAuthentication('notarray', [])).toThrow(
        'token middlewares and user middlewares need to be arrays'
      );
    });

    it('throws when userMiddlewares is not an array', () => {
      const { splitAuthentication } = middlewareAuth(config);
      expect(() => splitAuthentication([], null)).toThrow(
        'token middlewares and user middlewares need to be arrays'
      );
    });

    describe('returned splitAuth middleware', () => {
      let tokenMiddleware;
      let userMiddleware;

      beforeEach(() => {
        tokenMiddleware = jest.fn((req, res, cb) => cb());
        userMiddleware = jest.fn((req, res, cb) => cb());
      });

      it('calls next with UnauthorizedError when authToken is missing from context', () => {
        const { splitAuthentication } = middlewareAuth(config);
        const splitAuth = splitAuthentication([tokenMiddleware], [userMiddleware]);
        const req = { context: {} };
        const next = jest.fn();
        splitAuth(req, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        const err = next.mock.calls[0][0];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/missing header/i);
      });

      it('routes to tokenMiddlewares and sets authType=token when token length > 36', async () => {
        const { splitAuthentication } = middlewareAuth(config);
        const splitAuth = splitAuthentication([tokenMiddleware], [userMiddleware]);
        const req = { context: { authToken: 'a'.repeat(37) } };
        const next = jest.fn();
        splitAuth(req, {}, next);
        await new Promise((resolve) => setImmediate(resolve));
        expect(req.context.authType).toBe('token');
        expect(req.context.isAuthenticated).toBe(true);
        expect(req.context.authToken).toBe('a'.repeat(37));
        expect(tokenMiddleware).toHaveBeenCalledTimes(1);
        expect(userMiddleware).not.toHaveBeenCalled();
      });

      it('routes to userMiddlewares and sets authType=user when token length <= 36', async () => {
        const { splitAuthentication } = middlewareAuth(config);
        const splitAuth = splitAuthentication([tokenMiddleware], [userMiddleware]);
        const req = { context: { authToken: 'a'.repeat(36) } };
        const next = jest.fn();
        splitAuth(req, {}, next);
        await new Promise((resolve) => setImmediate(resolve));
        expect(req.context.authType).toBe('user');
        expect(req.context.isAuthenticated).toBe(true);
        expect(userMiddleware).toHaveBeenCalledTimes(1);
        expect(tokenMiddleware).not.toHaveBeenCalled();
      });

      it('passes middleware chain error to next', async () => {
        const chainError = new Error('chain failure');
        const failingMiddleware = jest.fn((req, res, cb) => cb(chainError));
        const { splitAuthentication } = middlewareAuth(config);
        const splitAuth = splitAuthentication([failingMiddleware], [userMiddleware]);
        const req = { context: { authToken: 'a'.repeat(37) } };
        const next = jest.fn();
        splitAuth(req, {}, next);
        await new Promise((resolve) => setImmediate(resolve));
        expect(next).toHaveBeenCalledWith(chainError);
        expect(userMiddleware).not.toHaveBeenCalled();
      });
    });
  });
});
