const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();

let resolvers = require('./Application.js')(serviceContext);

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Application', function () {
  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(typeof resolvers).to.equal('object');
      chaiExpect(Object.keys(resolvers).length).to.equal(21);
    });
  });
  describe('#clientSecret', function () {
    it('should handle auth error', async function () {
      serviceContext.dal.admin = {
        getPasswordToken: (context, input) => {
          throw new Error('invalid password');
        }
      };
      try {
        await resolvers.clientSecret(
          { oauth2_client_secret: 'foo' },
          { password: 'foo' },
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('authentication_error');
      }
    });
  });
  describe('#applicationRoles', function () {
    it('should throw an error if missing app Id', async function () {
      try {
        await resolvers.applicationRoles({}, {}, mockUtil.makeContext());
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(`${err}`).to.contain('appId is required');
      }
    });
    it('should throw an error if app Id is invalid', async function () {
      try {
        await resolvers.applicationRoles(
          { id: 'invalid_uuid' },
          {},
          mockUtil.makeContext()
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(`${err}`).to.contain('appId is invalid');
      }
    });
  });
});
