const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./NoAuth.js')(serviceContext);

describe('#NoAuth', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('noAuth');
      chaiExpect(dir.before).to.equal(true);
    });
  });
  describe('#resolver', function () {
    it('should run with no auth', function () {
      const context = {
        requestContext: {}
      };
      dir.resolver({}, {}, context, {});
      chaiExpect(context._authInfo).to.be.undefined;
    });
    it('should take user context', function () {
      const context = {
        requestContext: {
          userInfo: {
            foo: 'bar'
          }
        }
      };
      dir.resolver({}, {}, context, {});
      chaiExpect(_.get(context, '_authInfo.foo')).to.equal('bar');
    });

    it('should take user context - other format', function () {
      const context = {
        requestContext: {
          tokenInfo: {
            tokenType: 'apikey',
            data: {
              foo: 'bar'
            }
          }
        }
      };
      dir.resolver({}, {}, context, {});
      chaiExpect(_.get(context, '_authInfo.foo')).to.equal('bar');
    });
  });
});
