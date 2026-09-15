const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
let resolver = require('./MentionComment.js')(serviceContext);

describe('MentionComment.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(resolver).to.be.a('object');
      const keys = Object.keys(resolver);
      chaiExpect(keys.length).to.equal(5);

      keys.forEach((key) => {
        chaiExpect(typeof resolver[key]).to.equal('function');
      });
    });
  });

  describe('#createdDateTime', function () {
    it('should return createdDateTime', function () {
      let res, err;
      const dateCreated = moment().toISOString();
      const obj = { dateCreated };

      try {
        res = resolver.createdDateTime(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(dateCreated);
    });
  });

  describe('#modifiedDateTime', function () {
    it('should return modifiedDateTime', function () {
      let res, err;
      const dateModified = moment().toISOString();
      const obj = { dateModified };

      try {
        res = resolver.modifiedDateTime(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal(dateModified);
    });
  });

  describe('#userImage', function () {
    it('should return userImage', async function () {
      let res, err;
      const obj = { userId: 'e71f0348-c760-4eac-bab5-766b8a9df314' };

      // serviceContext.dal.shared.getUsers
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'e71f0348-c760-4eac-bab5-766b8a9df314',
            kvp: { image: 'http://localhost' }
          }
        ],
        false
      );

      try {
        res = await resolver.userImage(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('http://localhost');
    });

    it('should return null', async function () {
      let res, err;
      const obj = {};

      try {
        res = await resolver.userImage(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });
  });

  describe('#firstName', function () {
    it('should return firstName', async function () {
      let res, err;
      const obj = { userId: 'e71f0348-c760-4eac-bab5-766b8a9df314' };

      // serviceContext.dal.shared.getUsers
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'e71f0348-c760-4eac-bab5-766b8a9df314',
            kvp: { firstName: 'firstName' }
          }
        ],
        false
      );

      try {
        res = await resolver.firstName(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('firstName');
    });

    it('should return null', async function () {
      let res, err;
      const obj = {};

      try {
        res = await resolver.firstName(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });
  });

  describe('#lastName', function () {
    it('should return lastName', async function () {
      let res, err;
      const obj = { userId: 'e71f0348-c760-4eac-bab5-766b8a9df314' };

      // serviceContext.dal.shared.getUsers
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            user_id: 'e71f0348-c760-4eac-bab5-766b8a9df314',
            kvp: { lastName: 'lastName' }
          }
        ],
        false
      );

      try {
        res = await resolver.lastName(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('lastName');
    });

    it('should return null', async function () {
      let res, err;
      const obj = {};

      try {
        res = await resolver.lastName(obj);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });
  });
});
