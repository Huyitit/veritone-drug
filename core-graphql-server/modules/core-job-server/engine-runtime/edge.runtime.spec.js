'use strict';

const _ = require('lodash');
const util = require('../../../test/mockUtil')();

describe('core-job-server/engine-runtime/edge.runtime', () => {
  let app, edgeRuntime, task, taskPayload;
  let callbackCalled = false;
  const requirePath = './edge.runtime';

  beforeAll(() => {
    app = {
      config: {
        engineRuntime: {
          edge: {}
        }
      },
      logger: util.createSpyObj('logger', ['info', 'error', 'debug'])
    };
    edgeRuntime = require(requirePath)(app);
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
    it('should throw an error for missing runtime config', () => {
      expect(function () {
        require(requirePath)({
          config: {
            engineRuntime: {}
          },
          logger: {}
        });
      }).toThrow(new Error('missing runtimeConfig!'));
    });
    it('should return an object with function', () => {
      expect(typeof edgeRuntime === 'object').toBeTruthy();
      expect(typeof edgeRuntime.queueTask === 'function').toBeTruthy();
    });
  });
});
