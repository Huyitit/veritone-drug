'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('dal job', () => {
  let testContext = {};

  util.mockCommon(testContext);

  beforeEach(() => {
    const mockShared = {
      getTaskTablePartition: jest.fn().mockReturnValue('task_table'),
      generateJobId: jest.fn().mockReturnValue('job_id')
    };
    testContext.mod = require('./job')(
      testContext.app,
      testContext.model,
      { core: testContext.coreConn },
      mockShared
    );
  });

  it('should be a configurable package', () => {
    expect(require('./job')).toEqual(expect.any(Function));
  });

  it('should export an object containing cluster functions', () => {
    expect(
      require('./job')(testContext.app, testContext.model, {
        core: testContext.pg
      })
    ).toEqual({
      getJobWithTasks: expect.any(Function),
      updateJobStatusWithCb: expect.any(Function),
      incrementJobRetryCount: expect.any(Function)
    });
  });

  describe('when calling getJobWithTasks', () => {
    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.getJobWithTasks.bind(null, 'job-abc', null);
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.getJobWithTasks(
        'job-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      const mockJob = {
        jobId: 'job-abc',
        organizationId: 123,
        tasks: [{ taskId: 'some-task', jobId: 'job-abc' }]
      };

      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockJob]));

      jest.spyOn(testContext.model.Job, 'fromDB').mockReturnValue(mockJob);

      await testContext.mod.getJobWithTasks(
        'job-abc',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockJob);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Job.fromDB).toHaveBeenCalled();
    });
  });

  describe('when calling incrementJobRetryCount', () => {
    const mockJob = {
      clusterId: 'some-cluster',
      organizationId: 123
    };

    util.runBasicDalTestsNew(testContext, function getFuncToTest() {
      return testContext.mod.incrementJobRetryCount.bind(
        null,
        'some-job-id',
        null
      );
    });

    it('should execute callback with no error or results on empty dbresult', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([]));

      await testContext.mod.incrementJobRetryCount(
        'some-job-id',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toBe(null);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
    });

    it('should execute callback with db results', async () => {
      testContext.coreConn.query = jest
        .fn()
        .mockImplementation(() => Promise.resolve([mockJob]));

      jest.spyOn(testContext.model.Job, 'fromDB').mockReturnValue(mockJob);

      await testContext.mod.incrementJobRetryCount(
        'some-job-id',
        null,
        function callback(err, result) {
          expect(err).toBe(null);
          expect(result).toEqual(mockJob);
        }
      );
      expect(testContext.coreConn.query).toHaveBeenCalled();
      expect(testContext.model.Job.fromDB).toHaveBeenCalled();
    });
  });
});
