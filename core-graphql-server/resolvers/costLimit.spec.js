const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();
_.set(serviceContext, 'config.alertNotifications', {
  enabled: true,
  defaultTarget: 'testTarget',
  testTarget: {
    url: 'http://localhost/testTarget'
  }
});
const costLimit = require('./costLimit.js')(serviceContext); // serviceCOntext

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('costLimit.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });
  describe('#require', function () {
    it('should have correct function exports', function () {});
  });
  describe('checkCostLimit', function () {
    it('should check cost limit - warn only', async function () {
      const context = mockUtil.makeContext();
      context.requestInfo.query = `
query {
  libraries(limit:10000) { count }
}
      `;
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);

      context.requestInfo.totalCost = 10001;
      await costLimit.checkCostLimit({}, {}, context, {
        parentType: 'Test',
        fieldName: 'test'
      });
      chaiExpect(serviceContext.redisClient._counter()).to.equal(2);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryCostWarning')
      ).to.equal(1);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should check cost limit - error out', async function () {
      const context = mockUtil.makeContext();
      _.set(serviceContext, 'config.featureFlags.errorOnMaxCost', true);
      _.set(serviceContext, 'config.featureFlags.errorOnMaxCost', false);
      context.requestInfo.query = `
query {
libraries(limit:10000) { count }
}
    `;
      context.requestInfo.totalCost = 10001;
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'test'
        }
      ]);
      try {
        await costLimit.checkCostLimit({}, {}, context, {
          parentType: 'Test',
          fieldName: 'test'
        });
      } catch (err) {
        chaiExpect(err.name).to.equal('capacity_exceeded');
      }
      chaiExpect(serviceContext.redisClient._counter()).to.equal(2);
      chaiExpect(
        serviceContext.metrics.getValue('graphQLQueryCostWarning')
      ).to.equal(1);
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
  });

  describe('#hashQuery', function () {
    it('should get same hash with only whitespace, string literal, and integer parameter differences', function () {
      const h1 = costLimit._hashQuery(`
query {
  libraries(name: "foo" limit:1000 float: 1.1) {
    count
    ent1: entities(name: "foo" limit:10) {
      id
      field2
    }
  }
}
      `);
      const h2 = costLimit._hashQuery(`
query {
libraries(name: "bar" limit:100 float:  2.1) {
count
ent2:  entities(name: "bar" limit: 20) {
  id
  field2
}
}
}
      `);
      chaiExpect(h1).to.equal(h2);

      const h3 = costLimit._hashQuery(`
query {
libraries(name: "bar" limit:100 float:  2.1) {
count
ent3 :   entities(name: "bar" limit: 20) {
  id
  field1
}
}
}
      `);
      chaiExpect(h1).to.not.equal(h3);
    });
  });
});
