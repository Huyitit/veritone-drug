'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('core-job-server/engine-runtime/aiware.runtime', () => {
  let app, eventRuntime, task, taskPayload, mockRequest;
  let callbackCalled = false;
  const requirePath = './aiware.runtime';

  beforeAll(() => {
    app = {
      config: {
        engineRuntime: {
          aiware: {
            defaultRuntime: {
              cluster: 'some-cluster',
              priority: 0
            }
          }
        }
      },
      logger: util.createSpyObj('logger', ['info', 'error', 'debug'])
    };
    mockRequest = util.createSpyObj('request', ['post', 'delete']);
    eventRuntime = require(requirePath)(app, mockRequest);
    task = {
      engineId: 'engineId',
      applicationId: 'applicationId',
      recordingId: 'recordingId',
      jobId: 'jobId',
      taskId: 'taskId',
      taskExecutorId: 'taskExecutorId'
    };
    taskPayload = {
      applicationId: 'applicationId',
      recordingId: 'recordingId',
      jobId: 'jobId',
      taskId: 'taskId',
      cluster: 'clusterId'
    };
    callbackCalled = false;
  });

  describe('initializer', () => {
    it('should throw an error for missing app', () => {
      expect(function () {
        require(requirePath)();
      }).toThrow(new Error('missing app!'));
    });
    it('should throw an error for missing app.config', () => {
      expect(function () {
        require(requirePath)({});
      }).toThrow(new Error('missing app.config!'));
    });
    it('should throw an error for missing app.logger', () => {
      expect(function () {
        require(requirePath)({
          config: {}
        });
      }).toThrow(new Error('missing app.logger!'));
    });
    it('should throw an error for missing request', () => {
      expect(function () {
        require(requirePath)({
          config: {},
          logger: {}
        });
      }).toThrow(new Error('missing request!'));
    });
    it('should throw an error for missing runtime config', () => {
      expect(function () {
        require(requirePath)(
          {
            config: {
              engineRuntime: {}
            },
            logger: {}
          },
          mockRequest
        );
      }).toThrow(new Error('missing runtimeConfig!'));
    });
    it('should throw an error for missing default runtime config', () => {
      expect(function () {
        require(requirePath)(
          {
            config: {
              engineRuntime: {
                aiware: {}
              }
            },
            logger: {}
          },
          mockRequest
        );
      }).toThrow(new Error('missing runtimeConfig.defaultRuntime!'));
    });
    it('should throw an error for missing default runtime config cluster', () => {
      expect(function () {
        require(requirePath)(
          {
            config: {
              engineRuntime: {
                aiware: {
                  defaultRuntime: {}
                }
              }
            },
            logger: {}
          },
          mockRequest
        );
      }).toThrow(new Error('missing runtimeConfig.defaultRuntime.cluster!'));
    });
    it('should throw an error for missing default runtime config priority', () => {
      expect(function () {
        require(requirePath)(
          {
            config: {
              engineRuntime: {
                aiware: {
                  defaultRuntime: {
                    cluster: 'some-cluster'
                  }
                }
              }
            },
            logger: {}
          },
          mockRequest
        );
      }).toThrow(new Error('missing runtimeConfig.defaultRuntime.priority!'));
    });

    it('should return an object with function', () => {
      expect(typeof eventRuntime === 'object').toBeTruthy();
      expect(typeof eventRuntime.queueTask === 'function').toBeTruthy();
    });
  });

  describe('queueTask', () => {
    it('should throw an error for missing task', () => {
      expect(function () {
        eventRuntime.queueTask();
      }).toThrow(new Error('missing task!'));
    });

    it('should throw an error for missing taskPayload', () => {
      expect(function () {
        eventRuntime.queueTask(task, null);
      }).toThrow(new Error('missing taskPayload!'));
    });

    it('should throw an error for missing callback', () => {
      expect(function () {
        eventRuntime.queueTask(task, null, {});
      }).toThrow(new Error('missing callback!'));
    });

    it('should execute with default runtimeOptions when none are provided', () => {
      mockRequest.post = jest
        .fn()
        .mockImplementation(function post(opts, callback) {
          callback(
            null,
            { statusCode: 200 },
            JSON.stringify({ taskExecutorId: 'some-task-executor-id' })
          );
        });
      eventRuntime.queueTask(
        task,
        null,
        taskPayload,
        function callback(err, results) {
          callbackCalled = true;
          expect(err).toEqual(null);
          expect(results.isDone).toEqual(false);
          expect(taskPayload.cluster).toEqual(expect.any(String));
          expect(results.queueResponse).toEqual({
            taskEngine: 'aiware',
            taskEngineId: 'some-task-executor-id'
          });
        }
      );

      expect(callbackCalled).toBe(true);
    });

    it('should execute with cluster override if app id is found', () => {
      mockRequest.post = jest
        .fn()
        .mockImplementation(function post(opts, callback) {
          const postBody = JSON.parse(opts.body);
          expect(postBody.clusterId).toBe('cluster-123');
          callback(
            null,
            { statusCode: 200 },
            JSON.stringify({ taskExecutorId: 'some-task-executor-id' })
          );
        });
      task.applicationId = 'application123';
      const mockRuntimeOptions = {
        cluster: {
          application123: 'cluster-123',
          default: 'default-cluster'
        }
      };
      eventRuntime.queueTask(
        task,
        mockRuntimeOptions,
        taskPayload,
        function callback(err, results) {
          callbackCalled = true;
          expect(err).toEqual(null);
          expect(results.isDone).toEqual(false);
          expect(mockRuntimeOptions.cluster).toEqual(expect.any(Object));
          expect(results.queueResponse).toEqual({
            taskEngine: 'aiware',
            taskEngineId: 'some-task-executor-id'
          });
        }
      );

      expect(callbackCalled).toBe(true);
    });

    it('should execute with cluster override with default if app id is not found', () => {
      mockRequest.post = jest
        .fn()
        .mockImplementation(function post(opts, callback) {
          const postBody = JSON.parse(opts.body);
          expect(postBody.clusterId).toBe('default-cluster');
          callback(
            null,
            { statusCode: 200 },
            JSON.stringify({ taskExecutorId: 'some-task-executor-id' })
          );
        });
      task.applicationId = 'nothere';
      const mockRuntimeOptions = {
        cluster: {
          application123: 'cluster-123',
          default: 'default-cluster'
        }
      };
      eventRuntime.queueTask(
        task,
        mockRuntimeOptions,
        taskPayload,
        function callback(err, results) {
          callbackCalled = true;
          expect(err).toEqual(null);
          expect(results.isDone).toEqual(false);
          expect(mockRuntimeOptions.cluster).toEqual(expect.any(Object));
          expect(results.queueResponse).toEqual({
            taskEngine: 'aiware',
            taskEngineId: 'some-task-executor-id'
          });
        }
      );

      expect(callbackCalled).toBe(true);
    });
  });

  describe('cancelTask', () => {
    it('should throw an error for missing task', () => {
      expect(function () {
        eventRuntime.cancelTask();
      }).toThrow(new Error('missing task!'));
    });

    it('should throw an error for missing callback', () => {
      expect(function () {
        eventRuntime.cancelTask(task, null);
      }).toThrow(new Error('missing callback!'));
    });

    it('should cancel task', () => {
      mockRequest.delete = jest
        .fn()
        .mockImplementation(function post(opts, callback) {
          callback(null, { statusCode: 202 }, null);
        });
      eventRuntime.cancelTask(task, null, function callback(err) {
        callbackCalled = true;
        expect(err).toEqual(undefined);
      });

      expect(callbackCalled).toBe(true);
    });
  });
});
