'use strict';

const util = require('../../../test/mockUtil')();
const { Context } = require('@veritone/ts-messaging-lib/lib');
const { eventsMap } = require('@veritone/core-server-base/events-map.js');

describe('event emitter', () => {
  let testContext = {};

  beforeEach(() => {
    testContext.app = {};
    testContext.app.logger = util.createSpyObj('logger', [
      'info',
      'error',
      'debug',
      'warn'
    ]);
    testContext.app.config = {
      name: 'core-job-server unit test'
    };
    testContext.messageUtil = {
      emitEvent: jest.fn(),
      emitPublicEvent: jest.fn(),
      buildActionInfo: jest.fn()
    };
    testContext.mod = require('./event-emitter.js')(
      testContext.app,
      testContext.messageUtil
    );
  });

  it('should be a configurable package', () => {
    expect(require('./event-emitter.js')).toEqual(expect.any(Function));
  });

  it('should export an object containing emit event functions', () => {
    expect(
      require('./event-emitter.js')(testContext.app, testContext.messaging)
    ).toEqual({
      emitEngineBuildEvent: expect.any(Function),
      emitTaskQueuedEvent: expect.any(Function),
      emitTaskCustomEvent: expect.any(Function),
      emitJobCompletedEvent: expect.any(Function),
      eventNames: expect.any(Object),
      emitJobCreatedEvent: expect.any(Function),
      emitEngineForOrgEvent: expect.any(Function),
      emitEngineBuildPublicEvent: expect.any(Function)
    });
  });

  describe('when calling emitEngineBuildEvent', () => {
    it('should execute publish event to queue with user info', async () => {
      const mockReq = {};
      const payload = {
        action: 'update',
        engineId: 'some engine id',
        buildId: 'some build id',
        statusCode: 200,
        dockerImage: 'registry.docker.io/image',
        userInfo: {
          organization: {
            organizationId: 123
          }
        }
      };

      await testContext.mod.emitEngineBuildEvent(
        eventsMap.EngineBuildUpdate,
        mockReq,
        payload
      );

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          buildId: 'some build id',
          engineId: 'some engine id',
          event: 'engine_build_update',
          type: 'engine',
          organizationId: 123,
          dockerImage: 'registry.docker.io/image'
        }),
        'events'
      );
    });

    it('should execute publish event to queue with token info', async () => {
      const mockReq = {};
      const payload = {
        action: 'update',
        engineId: 'some engine id',
        buildId: 'some build id',
        statusCode: 200,
        tokenInfo: {
          organization: {
            organizationId: 123
          }
        }
      };

      await testContext.mod.emitEngineBuildEvent(
        eventsMap.EngineBuildUpdate,
        mockReq,
        payload
      );

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          buildId: 'some build id',
          engineId: 'some engine id',
          event: 'engine_build_update',
          type: 'engine',
          organizationId: 123
        }),
        'events'
      );
    });

    it('should emit engine_build_deploy_success event with autoTransitionEngineState is false as default value', async () => {
      const mockReq = {};
      const payload = {
        action: 'deploy',
        event: 'engine_build_deploy_success',
        engineId: 'some engine id',
        buildId: 'some build id',
        statusCode: 200,
        tokenInfo: {
          organization: {
            organizationId: 123
          }
        }
      };

      await testContext.mod.emitEngineBuildEvent(
        eventsMap.EngineBuildDeploySuccess,
        mockReq,
        payload
      );

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deploy',
          buildId: 'some build id',
          engineId: 'some engine id',
          event: 'engine_build_deploy_success',
          type: 'engine',
          organizationId: 123,
          autoTransitionEngineState: false
        }),
        'events'
      );
    });

    it('should emit engine_build_deploy_success event with autoTransitionEngineState is passed in from params', async () => {
      const mockReq = {};
      const payload = {
        action: 'deploy',
        event: 'engine_build_deploy_success',
        engineId: 'some engine id',
        buildId: 'some build id',
        statusCode: 200,
        tokenInfo: {
          organization: {
            organizationId: 123
          }
        },
        autoTransitionEngineState: true
      };

      await testContext.mod.emitEngineBuildEvent(
        eventsMap.EngineBuildDeploySuccess,
        mockReq,
        payload
      );

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deploy',
          buildId: 'some build id',
          engineId: 'some engine id',
          event: 'engine_build_deploy_success',
          type: 'engine',
          organizationId: 123,
          autoTransitionEngineState: true
        }),
        'events'
      );
    });
  });

  describe('when calling emitTaskQueuedEvent', () => {
    let mockEvent;

    beforeEach(() => {
      mockEvent = {
        taskId: 'some task id',
        taskExecutorId: 'some task executor id',
        taskExecutor: 'some task executor'
      };
    });

    it('should execute publish event to queue', () => {
      testContext.mod.emitTaskQueuedEvent(
        mockEvent.taskId,
        mockEvent.taskExecutorId,
        mockEvent.taskExecutor,
        123
      );

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'task_queued',
          type: 'task',
          taskId: 'some task id',
          taskExecutorId: 'some task executor id',
          taskExecutor: 'some task executor'
        }),
        'events'
      );
    });
  });

  describe('when calling emitTaskCustomEvent', () => {
    let mockEvent;

    beforeEach(() => {
      mockEvent = {
        image: 'abc'
      };
    });

    it('should execute publish event to queue', async () => {
      await testContext.mod.emitTaskCustomEvent(mockEvent, 'some-topic');

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining(mockEvent),
        'some-topic'
      );
    });
  });

  describe('when calling emitJobCompletedEvent', () => {
    let mockEvent;

    beforeEach(() => {
      mockEvent = {
        jobId: 'some task id',
        orgId: 123
      };
    });

    it('should execute publish event to queue', () => {
      testContext.mod.emitJobCompletedEvent(mockEvent.jobId, mockEvent.orgId);

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'job_completed',
          type: 'job',
          jobStatus: 'completed',
          jobId: 'some task id',
          organizationId: 123
        }),
        'events'
      );
    });
  });

  describe('when calling emitJobCreatedEvent', () => {
    let mockEvent;

    beforeEach(() => {
      mockEvent = {
        jobId: 'some task id',
        orgId: 123
      };
    });

    it('should execute publish event to queue', () => {
      testContext.mod.emitJobCreatedEvent(mockEvent.jobId, mockEvent.orgId);

      expect(testContext.app.logger.error).not.toHaveBeenCalled();
      expect(testContext.messageUtil.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'job_created',
          type: 'job',
          jobId: 'some task id',
          organizationId: 123
        }),
        'events'
      );
    });
  });
});
