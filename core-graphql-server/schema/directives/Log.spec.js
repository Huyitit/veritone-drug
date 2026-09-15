const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./Log.js')(serviceContext);

describe('#Log', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('log');
      chaiExpect(dir.before).to.equal(false);
    });
  });
  describe('#resolver', function () {
    it('should run resolver', function () {
      dir.resolver('test', {}, {}, {}, {}, 0, null);
    });
    it('should run resolver - err', function () {
      try {
        dir.resolver('test', {}, {}, {}, {}, 0, new Error('foo'));
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(_.toString(err)).to.include('foo');
      }
    });
  });
});
