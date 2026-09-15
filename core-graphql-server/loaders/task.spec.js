const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('../test/mockUtil.js')();

const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

const loaderTask = require('./task.js')(serviceContext);

function expectFunction(obj, key) {
  chaiExpect(typeof obj[key]).to.equal('function');
}

describe('task.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('it should have correct functions export', function () {
      chaiExpect(typeof loaderTask).to.equal('object');
      chaiExpect(Object.keys(loaderTask).length).to.equal(1);
      expectFunction(loaderTask, 'batchTasksByJobIds');
    });
  });

  describe('#batchTasksByJobIds', function () {
    it('should get batch Tasks by 100 JobIds', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const keys = []; // array jobIds
      const arrMockTasks = [];

      // add 100 jobIds for the test
      for (let i = 0; i < 100; i++) {
        keys.push(mockUtil.toTaskId(`jobId${i}`));
      }

      // add 1100 tasks for jobId1, and 100 tasks for jobId2
      for (let i = 0; i < 1200; i++) {
        arrMockTasks.push({
          id: mockUtil.toTaskId(`taskId${i}`),
          jobId:
            i >= 1100
              ? mockUtil.toTaskId('jobId2')
              : mockUtil.toTaskId('jobId1')
        });
      }

      // getTasks first loop limit 1000
      serviceContext.dbConnections['core'].read._push(
        _.slice(arrMockTasks, 0, 1000)
      );

      // getTasks second loop
      serviceContext.dbConnections['core'].read._push(
        _.slice(arrMockTasks, 1000, 1200)
      );

      //getTasks third loop with empty result for remaining jobIds
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await loaderTask.batchTasksByJobIds(context, keys);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(100);
      chaiExpect(res[1].length).to.equal(1100); // jobId1 has 1100 tasks
      chaiExpect(res[2].length).to.equal(100); // jobId2 has 100 tasks
    });
  });
});
