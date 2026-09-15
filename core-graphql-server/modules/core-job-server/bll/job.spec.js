'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('bll job', () => {
  let testContext = {};
  testContext.mod = require('./job');

  util.mockCommon(testContext);

  let callbackHasBeenCalled;

  beforeEach(() => {
    testContext.dalSpy = {
      getJobWithTasks: jest.fn(),
      cancelTask: jest.fn(),
      updateJobStatusWithCb: (x, y, z, callback) => callback(null, null)
    };
    testContext.dalSpiesIndex = {
      task: testContext.dalSpy,
      job: testContext.dalSpy
    };
    testContext.mockEngineRuntime = {
      cancelTask: jest.fn()
    };
    testContext.bll = testContext.mod(
      testContext.app,
      testContext.dalSpiesIndex,
      testContext.model,
      testContext.mockEngineRuntime
    );
  });

  it('should be a configurable package', () => {
    expect(testContext.mod).toEqual(expect.any(Function));
  });

  it('should export an object containing job bll functions', () => {
    expect(
      testContext.mod(
        testContext.app,
        testContext.dalSpiesIndex,
        testContext.model,
        testContext.mockEngineRuntime
      )
    ).toEqual(
      expect.objectContaining({
        getJobStatusFromTaskStatuses: expect.any(Function),
        cancelJob: expect.any(Function)
      })
    );
  });

  describe('when accessing getJobStatusFromTaskStatuses', () => {
    it('should return accepted', () => {
      expect(testContext.bll.getJobStatusFromTaskStatuses()).toBe('accepted');
    });

    it('should return failed when [any of the primary tasks without standby tasks in place] have failed', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-3',
          taskStatus: 'running'
        },
        {
          taskId: 'task-id-4',
          taskStatus: 'queued'
        },
        {
          taskId: 'task-id-5',
          taskStatus: 'pending'
        },
        {
          taskId: 'task-id-6',
          taskStatus: 'standby_pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'failed'
      );
    });

    it('should return running', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-3',
          taskStatus: 'running'
        },
        {
          taskId: 'task-id-4',
          taskStatus: 'queued'
        },
        {
          taskId: 'task-id-5',
          taskStatus: 'pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'running'
      );
    });

    it('should return running when there is a failed primary with standby tasks for it', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-3',
          taskStatus: 'running'
        },
        {
          taskId: 'task-id-4',
          taskStatus: 'queued'
        },
        {
          taskId: 'task-id-5',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-6',
          standbyForTaskId: 'task-id-5',
          taskStatus: 'standby_pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'running'
      );
    });

    it('should return failed when there is an aborted task', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'aborted'
        },
        {
          taskId: 'task-id-3',
          taskStatus: 'complete'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'failed'
      );
    });

    it('should return complete', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'complete'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return complete even when there are standby pending tasks', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'standby_pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return complete even when there are failed primary tasks with completed standby tasks (nested 1)', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'complete'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return complete even when there are nested failures and a completed third standby (nested 2)', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-4',
          standbyForTaskId: 'task-id-3',
          taskStatus: 'complete'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return complete even when there are nested failures and a completed fourth standby (nested 3)', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-4',
          standbyForTaskId: 'task-id-3',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-5',
          standbyForTaskId: 'task-id-4',
          taskStatus: 'complete'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return complete even when there are nested failures and a completed third standby with fourth standby pending (nested 3)', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'failed'
        },
        {
          taskId: 'task-id-4',
          standbyForTaskId: 'task-id-3',
          taskStatus: 'complete'
        },
        {
          taskId: 'task-id-5',
          standbyForTaskId: 'task-id-4',
          taskStatus: 'standby_pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'complete'
      );
    });

    it('should return pending if all tasks are pending', () => {
      const tasks = [
        {
          taskId: 'task-id-1',
          taskStatus: 'pending'
        },
        {
          taskId: 'task-id-2',
          taskStatus: 'pending'
        },
        {
          taskId: 'task-id-3',
          standbyForTaskId: 'task-id-2',
          taskStatus: 'pending'
        },
        {
          taskId: 'task-id-4',
          standbyForTaskId: 'task-id-3',
          taskStatus: 'pending'
        },
        {
          taskId: 'task-id-5',
          standbyForTaskId: 'task-id-4',
          taskStatus: 'pending'
        }
      ];

      expect(testContext.bll.getJobStatusFromTaskStatuses(tasks)).toBe(
        'pending'
      );
    });
  });

  describe('when accessing cancelJob', () => {
    beforeEach(() => {
      callbackHasBeenCalled = false;
    });

    it('should throw error missing callback', () => {
      expect(testContext.bll.cancelJob).toThrowError(/callback/);
    });

    it('should return 403 error on get job app id not matching token app id', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, { applicationId: 'not-app-id-123' });
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toEqual(expect.any(Object));
          expect(err.statusCode).toEqual(403);
          expect(err.message).toEqual('no access to job');
          expect(result).toEqual(undefined);
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
    });

    it('should throw error on update task status with error', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, {
            applicationId: 'app-id-123',
            jobStatus: 'queued',
            tasks: [{ taskId: 'task-123', taskStatus: 'pending' }]
          });
        });
      testContext.dalSpy.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(taskId, dbClient, callback) {
          callback(new Error('some error'), null);
        });
      testContext.mockEngineRuntime.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(task, callback) {
          callback(null, null);
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toEqual(expect.any(Object));
          expect(err.message).toEqual('some error');
          expect(result).toEqual(undefined);
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
      expect(testContext.dalSpy.cancelTask).toHaveBeenCalled();
    });

    it('should throw error on cancel task with error', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, {
            applicationId: 'app-id-123',
            jobStatus: 'pending',
            tasks: [{ taskId: 'task-123', taskStatus: 'pending' }]
          });
        });
      testContext.dalSpy.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(taskId, dbClient, callback) {
          callback(null, { taskId: 'task-123' });
        });
      testContext.mockEngineRuntime.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(task, callback) {
          callback(new Error('some error'), null);
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toEqual(expect.any(Object));
          expect(err.message).toEqual('some error');
          expect(result).toEqual(undefined);
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
      expect(testContext.mockEngineRuntime.cancelTask).toHaveBeenCalled();
    });

    it('should throw error on when task status is not pending or queued', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, {
            applicationId: 'app-id-123',
            jobStatus: 'running',
            tasks: [{ taskId: 'task-123', taskStatus: 'running' }]
          });
        });
      testContext.dalSpy.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(taskId, dbClient, callback) {
          callback(null, { taskId: 'task-123' });
        });
      testContext.mockEngineRuntime.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(task, callback) {
          callback(new Error('some error'), null);
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toEqual(expect.any(Object));
          expect(err.message).toEqual(
            'current job state does not allow cancel'
          );
          expect(result).toEqual(undefined);
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
      expect(testContext.mockEngineRuntime.cancelTask).not.toHaveBeenCalled();
    });

    it('should error if any task that is not in pending or queued', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, {
            applicationId: 'app-id-123',
            jobStatus: 'running',
            tasks: [
              { taskId: 'task-123', taskStatus: 'complete' },
              { taskId: 'task-124', taskStatus: 'running' },
              { taskId: 'task-125', taskStatus: 'running' }
            ]
          });
        });
      testContext.dalSpy.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(taskId, dbClient, callback) {
          callback(null, { taskId: taskId, taskStatus: 'cancelled' });
        });
      testContext.mockEngineRuntime.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(task, callback) {
          callback(null, null);
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toBeDefined();
          expect(result).toEqual(undefined);
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
      expect(testContext.dalSpy.cancelTask).not.toHaveBeenCalled();
    });

    it('should cancel job success', () => {
      testContext.dalSpy.getJobWithTasks = jest
        .fn()
        .mockImplementation(function getJobWithTasks(
          jobId,
          dbClient,
          callback
        ) {
          callback(null, {
            applicationId: 'app-id-123',
            jobStatus: 'pending',
            tasks: [{ taskId: 'task-123', taskStatus: 'pending' }]
          });
        });
      testContext.dalSpy.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(taskId, dbClient, callback) {
          callback(null, { taskId: 'task-123' });
        });
      testContext.mockEngineRuntime.cancelTask = jest
        .fn()
        .mockImplementation(function cancelTask(task, callback) {
          callback(null, null);
        });

      testContext.bll.cancelJob(
        'job-id',
        'app-id-123',
        null,
        function cancelJobCallback(err, result) {
          expect(err).toEqual(null);
          expect(result).toEqual({
            applicationId: 'app-id-123',
            jobStatus: 'pending',
            tasks: [{ taskId: 'task-123', taskStatus: 'pending' }]
          });
          callbackHasBeenCalled = true;
        }
      );
      expect(callbackHasBeenCalled).toBe(true);
      expect(testContext.dalSpy.getJobWithTasks).toHaveBeenCalled();
      expect(testContext.dalSpy.cancelTask).toHaveBeenCalled();
      expect(testContext.mockEngineRuntime.cancelTask).toHaveBeenCalled();
    });
  });
});
