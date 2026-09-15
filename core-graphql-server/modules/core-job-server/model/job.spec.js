'use strict';

const _ = require('lodash');
const mockUtil = require('../../../test/mockUtil')();
const serviceContext = require('../../v3DataModel/test/serviceContext.mock.js')();

describe('model job', () => {
  let testContext, JobModel;

  beforeEach(() => {
    JobModel = require('./job');
    testContext = {
      context: mockUtil.makeContext(),
      testJob: {
        applicationId: 'applicationId',
        clusterId: 'clusterId',
        tasks: [
          {
            engineId: 'engineId',
            taskPayload: {
              mode: 'library-train',
              libraryId: 'libraryId',
              libraryEngineModelId: 'libraryEngineModelId'
            }
          }
        ]
      },
      testNonTrainJob: {
        applicationId: 'applicationId',
        clusterId: 'clusterId',
        tasks: [
          {
            engineId: 'engineId',
            taskPayload: {
              organizationId: 1
            }
          }
        ]
      }
    };
    serviceContext._clearAll();
    serviceContext.redisCache.markCacheDirty(true);
  });

  it('should be a constructor function', () => {
    expect(JobModel).toEqual(expect.any(Function));
    const instance = new JobModel({});
    expect(instance.constructor).toBe(JobModel);
  });

  it('should validate job - missing dalEngine', () => {
    const job = new JobModel(testContext.testJob);

    expect(job.validate).toEqual(expect.any(Function));
    expect(
      job.validate.bind(job, testContext.context, undefined, [], jest.fn())
    ).toThrowError(/Missing\sdalEngine!/);
  });

  it('should validate job - missing callback', () => {
    const job = new JobModel(testContext.testJob);

    expect(job.validate).toEqual(expect.any(Function));
    expect(
      job.validate.bind(job, testContext.context, {}, [], undefined)
    ).toThrowError(/Missing\scallback!/);
  });

  it('should validate job - missing recordingId - non library-train', () => {
    const job = new JobModel(testContext.testNonTrainJob);

    // dalEngine.getEngine
    serviceContext.dbConnections['core'].read._push([
      {
        id: testContext.testNonTrainJob.tasks[0].engineId
      }
    ]);

    job.validate(
      testContext.context,
      serviceContext.dal.engine,
      [],
      (err, results) => {
        expect(err).toBe(null);
        expect(results).toEqual({
          recordingId: 'Missing recordingId!'
        });
      }
    );
  });

  it('should validate job - success - library-train', () => {
    const job = new JobModel(testContext.testJob);

    // dalEngine.getEngine
    serviceContext.dbConnections['core'].read._push([
      {
        id: testContext.testJob.tasks[0].engineId
      }
    ]);

    job.validate(
      testContext.context,
      serviceContext.dal.engine,
      [],
      (err, results) => {
        expect(err).toBe(null);
        expect(results).toBe(undefined);
      }
    );
  });
});
