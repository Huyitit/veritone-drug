const moment = require('moment');
const httpMock = require('node-mocks-http');
const validator = require('validator');
// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')({
  mockHttp: true
});

jest.mock('request-promise');

describe('#coreAdmin.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      let coreAdmin = require('./coreAdmin.js')(serviceContext);
      expect(typeof coreAdmin).toEqual('object');
      expect(Object.keys(coreAdmin).length).toEqual(5);
    });
  });

  describe('#getUserId', function () {
    beforeEach(() => serviceContext._clearAll());
    const mod = require('./coreAdmin.js')(serviceContext);

    it('should get user by id', async function () {
      const id = '74542588-70fb-477d-8962-4c2ae2c47652';
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: id
        }
      ]);
      const res = await mod._getUserId('user@veritone.com');
      expect(res).toEqual(id);
    });

    it('should throw on not found', async function () {
      const id = '74542588-70fb-477d-8962-4c2ae2c47652';
      serviceContext.dbConnections['sso'].read._push([]);
      try {
        await mod._getUserId('user@veritone.com');
        throw new Error('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
  });

  describe('#setupUserSession', function () {
    beforeEach(() => {
      //serviceContext._clearAll();
    });
    const mod = require('./coreAdmin.js')(serviceContext);

    it('should set up user session', async function () {
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '038ce37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);

      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=whatever',
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').post.mockImplementationOnce((req) => {
        return Promise.resolve(
          JSON.stringify({
            token: '11111111-6b4f-4cd8-bda8-b94c1ac6cd9b'
          })
        );
      });
      const userData = await mod.setupUserSession(
        {
          userLoginId: 'tester@veritone.com',
          expiresAt: moment().add(1, 'hour').valueOf()
        },
        'fakeOktaDomain.okta.com',
        req,
        res
      );

      // verify that cookie was set correctly
      expect(res.cookies).toExist;
      const cookie = res.cookies['dev-veritone-session-id'];
      expect(cookie).toExist;
      expect(cookie.value).toEqual('11111111-6b4f-4cd8-bda8-b94c1ac6cd9b');
      expect(cookie.options).toExist;
      expect(cookie.options.domain).toEqual('.veritone.com');
      expect(cookie.options.path).toEqual('/');
      expect(cookie.options.secure).toEqual(false);
      expect(cookie.options.httpOnly).toEqual(true);
      expect(cookie.options.expires).toExist;
      const mom = moment(cookie.options.expires);
      expect(mom.isAfter(moment())).toEqual(true);
    });

    it('should set up user session with uncached user', async function () {
      // mock db response for user
      serviceContext.dbConnections['sso'].read._push([
        {
          // user IDs that start with 0000 return null from getLoginUserInfoCache mock
          user_id: '0000e37e-6b4f-4cd8-bda8-b94c1ac6cd9b'
        }
      ]);

      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'POST',
        url:
          '/auth/authorization-code-callback?org=102&code=1234&state=whatever',
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').post.mockImplementationOnce((req) => {
        expect(req.uri).toEqual('http://localhost/v1/admin/setup-user-session');
        return Promise.resolve(
          JSON.stringify({
            token: '22222222-6b4f-4cd8-bda8-b94c1ac6cd9b'
          })
        );
      });
      const userData = await mod.setupUserSession(
        {
          userLoginId: 'tester@veritone.com',
          expiresAt: moment().add(1, 'hour').valueOf()
        },
        'fakeOktaDomain.okta.com',
        req,
        res
      );

      // verify that cookie was set correctly
      expect(res.cookies).toExist;
      const cookie = res.cookies['dev-veritone-session-id'];
      expect(cookie).toExist;
      expect(cookie.value).toExist;
      expect(cookie.value).not.toEqual('11111111-6b4f-4cd8-bda8-b94c1ac6cd9b');
      expect(validator.isUUID(cookie.value)).toEqual(true);
      expect(cookie.options).toExist;
      expect(cookie.options.domain).toEqual('.veritone.com');
      expect(cookie.options.path).toEqual('/');
      expect(cookie.options.secure).toEqual(false);
      expect(cookie.options.httpOnly).toEqual(true);
      expect(cookie.options.expires).toExist;
      const mom = moment(cookie.options.expires);
      expect(mom.isAfter(moment())).toEqual(true);
    });
  });

  describe('#addApplicationsForOrganization', function () {
    beforeEach(() => serviceContext._clearAll());
    const mod = require('./coreAdmin.js')(serviceContext);

    it('should get valid response', async function () {
      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'PATCH',
        url: `/v1/admin/organizations/${123456}/applications`,
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').patch.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'http://localhost/v1/admin/organizations/123456/applications'
        );
        expect(req.body.applicationIds).toEqual(
          expect.arrayContaining(['app1'])
        );
        return Promise.resolve(JSON.stringify({}));
      });

      const response = await mod.addApplicationsForOrganization(
        { organizationId: 123456, appId: 'app1' },
        serviceContext
      );
      expect(response).toBeDefined();
    });

    it('should error with invalid orgId', async function () {
      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'PATCH',
        url: `/v1/admin/organizations/${123456}/applications`,
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').patch.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'http://localhost/v1/admin/organizations/123456/applications'
        );
        return Promise.resolve(JSON.stringify({}));
      });

      let response, error;
      try {
        response = await mod.addApplicationsForOrganization({}, serviceContext);
      } catch (err) {
        error = err;
      }
      expect(response).toBeUndefined();
      expect(error).toBeDefined();
    });
  });

  describe('#impersonateUser', function () {
    beforeEach(() => serviceContext._clearAll());
    const mod = require('./coreAdmin.js')(serviceContext);

    it('should get valid response', async function () {
      const userId = '-----userId-----';
      const organizationGuid = '-----orgGuid-----';
      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'GET',
        url: `/v1/admin/impersonate/${userId}/${organizationGuid}`,
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });

      require('request-promise').get.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          `http://localhost/v1/admin/impersonate/${userId}/${organizationGuid}`
        );
        return Promise.resolve({ token: '---token---' });
      });

      const response = await mod.impersonateUser(
        userId,
        organizationGuid,
        serviceContext
      );
      expect(response).toBeDefined();
    });
  });

  describe('#removeApplicationsForOrganization', function () {
    beforeEach(() => serviceContext._clearAll());
    const mod = require('./coreAdmin.js')(serviceContext);

    it('should get valid response', async function () {
      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'DELETE',
        url: `/v1/admin/organizations/${123456}/applications`,
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').delete.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'http://localhost/v1/admin/organizations/123456/applications'
        );
        expect(req.body.applicationIds).toEqual(
          expect.arrayContaining(['app1', 'app2'])
        );
        return Promise.resolve(JSON.stringify({}));
      });

      const response = await mod.removeApplicationsForOrganization(
        ['app1', 'app2'],
        123456,
        serviceContext
      );
      expect(response).toBeDefined();
    });

    it('should error with invalid orgId', async function () {
      // details of the http request are not important for this call
      const req = httpMock.createRequest({
        method: 'DELETE',
        url: `/v1/admin/organizations/${123456}/applications`,
        body: {},
        headers: {
          'content-type': 'application/json',
          'user-agent': 'test-code'
        }
      });
      const res = httpMock.createResponse({
        eventEmitter: require('events').EventEmitter
      });
      require('request-promise').patch.mockImplementationOnce((req) => {
        expect(req.uri).toEqual(
          'http://localhost/v1/admin/organizations/123456/applications'
        );
        return Promise.resolve(JSON.stringify({}));
      });

      let response, error;
      try {
        response = await mod.removeApplicationsForOrganization(
          [],
          undefined,
          serviceContext
        );
      } catch (err) {
        error = err;
      }
      expect(response).toBeUndefined();
      expect(error).toBeDefined();
    });
  });
});
