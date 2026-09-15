const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../../test/mockUtil.js')();
const serviceContext = require('../../test/serviceContext.mock.js')();

const dir = require('./Limit.js')(serviceContext);

describe('#Limit', function () {
  describe('#name', function () {
    it('should return name', function () {
      chaiExpect(dir.name).to.equal('limit');
      chaiExpect(dir.before).to.equal(true);
    });
  });
  describe('#resolver', function () {
    it('should run resolver', function () {
      const context = {
        requestInfo: {},
        fieldStats: {
          test: 0
        }
      };
      dir.resolver({}, {}, context, { parentType: 'Test', fieldName: 'test' });
    });
    it('should run resolver, adding some cost', function () {
      const context = {
        requestInfo: {
          totalCost: 10
        }
      };
      dir.resolver({ cost: 3, limit: 10 }, {}, context, {
        parentType: 'Test',
        fieldName: 'test'
      });
      chaiExpect(_.get(context, 'requestInfo.totalCost', 0)).to.equal(13);
      chaiExpect(_.get(context, 'fieldStats')['Test.test'].totalCost).to.equal(
        3
      );
    });
  });
  describe('#validator', function () {
    it('should run validator', function () {
      dir.validator(
        {
          cost: 1
        },
        {
          limit: 1
        }
      );
    });
  });
});
