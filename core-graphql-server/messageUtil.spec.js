const _ = require('lodash');
const error = require('./error/index.js');
const { eventsMap } = require('@veritone/core-server-base/events-map.js');
jest.mock('@veritone/core-messages/generated/pbjs/compiled');

// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();
let messageUtil = require('./messageUtil.js')(serviceContext);
// TODO mock Messager so we can have validation of message content

describe('#messageUtil', () => {
  beforeEach(() => {
    messageUtil = require('./messageUtil.js')(serviceContext);
    serviceContext.messagingV2._clear();
  });

  describe('#require', () => {
    it('should load module', () => {
      // load the module and validate basic structure
      expect(messageUtil).toBeInstanceOf(Object);
      expect(Object.keys(messageUtil).length).toBe(15);
      expect(typeof messageUtil.emitErrorEvent).toBe('function');
      expect(typeof messageUtil.emitEvent).toBe('function');
      expect(typeof messageUtil.emitPublicEvent).toBe('function');
      expect(typeof messageUtil.emitStartupEvent).toBe('function');
      expect(typeof messageUtil.emitCrashEvent).toBe('function');
      expect(typeof messageUtil.emitTaskQueuedEvent).toBe('function');
      expect(typeof messageUtil.topics).toBe('function');
      expect(typeof messageUtil.eventTypeTopics).toBe('object');
      expect(typeof messageUtil.okErrors).toBe('object');
      expect(typeof messageUtil.getActionInfo).toBe('function');
      expect(typeof messageUtil.getCallerInfo).toBe('function');
      expect(typeof messageUtil._getEventInfoToEmitEvent).toBe('function');
    });
  });
  describe('#emitStartupEvent', () => {
    it('should startup events', () => {
      messageUtil.emitStartupEvent(Date.now());
    });
  });
  describe('#emitErrorEvent', () => {
    it('should error event', async () => {
      await messageUtil.emitErrorEvent(new Error(), 'not_found');
    });
    it('should error event', async () => {
      await messageUtil.emitErrorEvent(
        { name: 'not_found', stack: 'foo' },
        'not_found'
      );
    });
    it('should not throw when error.data is circular (TLS cert chains)', async () => {
      // Node TLS identity errors carry err.cert whose issuerCertificate is
      // circular at the root CA; the error event must never mask the error.
      const cert = { subject: 'CN=s3.amazonaws.com' };
      cert.issuerCertificate = cert;
      const err = {
        name: 'resource_unavailable',
        message: 'download failed',
        stack: 'stack',
        data: { url: 'https://example.com/x', error: { cert } }
      };

      const errorSpy = jest.spyOn(serviceContext.app.logger, 'error');
      const warnSpy = jest.spyOn(serviceContext.app.logger, 'warn');

      await expect(
        messageUtil.emitErrorEvent(err, 'resource_unavailable')
      ).resolves.not.toThrow();

      // emitEvent JSON.stringifies the whole event and logs it at the
      // event's level — reaching the logger proves the event was
      // serializable end to end.
      const logCall =
        errorSpy.mock.calls[0] || warnSpy.mock.calls[0];
      expect(logCall).toBeDefined();
      const event = JSON.parse(logCall[0]);
      expect(event.errorData).toEqual({
        dataUnserializable: true,
        serializationError: expect.stringContaining('circular')
      });

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should emit warn level for not_found', async () => {
      const warnSpy = jest.spyOn(serviceContext.app.logger, 'warn');
      await messageUtil.emitErrorEvent(
        new Error('not found'),
        'not_found'
      );

      expect(warnSpy).toHaveBeenCalled();
      const logString = warnSpy.mock.calls[0][0]; 
      const event = typeof logString === 'string' ? JSON.parse(logString) : logString;

      expect(event).toBeDefined();
      expect(event.level).toBe('warn');
      expect(event.errorName).toBe('not_found');

      warnSpy.mockRestore();
    });
  });
  describe('#okErrors', () => {
    it('should include not_found', () => {
      expect(messageUtil.okErrors).toContain('not_found');
      expect(messageUtil.okErrors).not.toContain('internal_error');
    });
    it('should not include service_unavailable', () => {
      expect(messageUtil.okErrors).not.toContain('service_unavailable');
    });
  });

  describe('#emitEvent', () => {
    describe('#_getEventInfoToEmitEvent', () => {
      it('event type should be lowercase 1', () => {
        const event = {
          eventName: 'structured_data_create',
          type: 'structuredData',
          dataSource: '',
          dataRegistryId: '',
          data: {}
        };

        const eventInfo = messageUtil._getEventInfoToEmitEvent(event, 'events');
      });
      it('event type should be lowercase 2', () => {
        const event = {
          eventName: 'structured_data_create',
          type: 'structured_Data',
          dataSource: '',
          dataRegistryId: '',
          data: {}
        };

        const eventInfo = messageUtil._getEventInfoToEmitEvent(event, 'events');
      });
    });

    it('should emit event', () => {
      messageUtil.emitEvent({ event: 'foo' }, 'events');
      const msg = serviceContext.messagingV2._get();
      //expect(msg.isCrash).to.be.false;
    });
    it('event has a payload field in the info', () => {
      const event = {
        eventName: 'recording_deleted',
        type: 'recording',
        dataSource: '',
        recordingId: '1000021',
        payload: {
          applicationId: '6b22160f-4377-47c1-98ac-7003a777d336',
          organizationId: '7682'
        }
      };

      const eventInfo = messageUtil._getEventInfoToEmitEvent(event, 'events');
      expect(eventInfo.payload).toBeDefined();
      expect(eventInfo.payload).toEqual({
        applicationId: '6b22160f-4377-47c1-98ac-7003a777d336',
        organizationId: '7682'
      });
    });
  });
  describe('#emitCrashEvent', () => {
    it('should emit event - soft crash', () => {
      messageUtil.emitCrashEvent('test', false);
      const msg = serviceContext.messagingV2._get();
      //expect(msg.isCrash).to.be.false;
    });
    it('should emit event - normal', () => {
      messageUtil.emitCrashEvent('test');
      /*
      console.log(JSON.stringify(serviceContext.messagingV2._queue()));
      const msg = serviceContext.messagingV2._get();
      expect(msg.isCrash).to.be.true;
      expect(msg.event).to.equal('service_shutdown');
      expect(msg.message).to.equal('test');
      expect(msg.timestamp).to.exist;
      expect(msg.id).to.exist;
      expect(msg.type).to.equal('service');
      expect(msg.serviceName).to.equal('core-graphql-server');
      expect(msg.ip).to.exist;
      expect(msg.serverIp).to.equal(msg.ip);
      expect(msg.serverHostname).to.exist;
      expect(msg.buildInfo).to.exist;
      */
    });
  });
  describe('topics', () => {
    it('should get topics list', () => {
      expect(messageUtil.topics('EVENTS')).toBe('events');
      expect(messageUtil.topics('EVENTS_INTERNAL')).toBe('events_internal');
      expect(messageUtil.topics('ASSETS')).toBe('AssetsTopic');
    });
    it('should throw on bad input', () => {
      expect(() => messageUtil.topics('foo')).toThrow();
      expect(() => messageUtil.topics(null)).toThrow();
    });
  });
  describe('EmitPublicEvent', () => {
    describe('getActionInfo', () => {
      const defaultActionInfo = {
        actionName: null,
        actionResult: null,
        actionDetails: null,
        targetId: null,
        targetType: null
      };
      it('the input is nil', () => {
        const result = messageUtil.getActionInfo();
        expect(result).toEqual(defaultActionInfo);
      });
      it('Default data', () => {
        const expectedData = {
          actionName: 'event-name-test',
          actionResult: 'success',
          actionDetails: null,
          targetId: 'object-id-01',
          targetType: null
        };
        const mockEventData = { id: 'object-id-01' };
        const mockEventTypeInfo = {
          action: 'event-name-test',
          targetType: null
        };
        const result = messageUtil.getActionInfo(
          mockEventData,
          mockEventTypeInfo
        );
        expect(result).toEqual(expectedData);
      });
      it('has an error', () => {
        const mockEventData = {
          id: 'object-id-01',
          actionInfo: {
            error: new Error('New error')
          }
        };
        const mockEventTypeInfo = {
          action: 'event-name-test',
          targetType: null
        };
        const expectedData = {
          actionName: 'event-name-test',
          actionResult: 'failure',
          actionDetails: `${mockEventData.actionInfo.error}`,
          targetId: 'object-id-01',
          error: mockEventData.actionInfo.error,
          targetType: null
        };
        const result = messageUtil.getActionInfo(
          mockEventData,
          mockEventTypeInfo
        );
        expect(result).toEqual(expectedData);
      });
    });

    describe('getCallerInfo', () => {
      const defaultCallerInfo = {
        userId: null,
        userName: null,
        requestIP: null,
        userAgent: null,
        organizationId: 'N/A',
        originatorApplication: null,
        originatorService: 'core-graphql-server',
        impersonatorUserId: null
      };
      it('the input is nil', () => {
        const result = messageUtil.getCallerInfo();
        expect(result).toEqual(defaultCallerInfo);
      });
      it('the request is empty: return the default data', () => {
        const result = messageUtil.getCallerInfo({});
        expect(result).toEqual(defaultCallerInfo);
      });
      it('get data from the reqContext', () => {
        const reqContext = {
          requestInfo: {
            clientIP: '127.1.2.3',
            userAgent: 'user-agent-test-info'
          },
          _authInfo: {
            userId: 'test-userId',
            userName: 'test-username',
            organization: {
              organizationId: 8523
            }
          },
          requestContext: {
            appId: 'test-app-id',
            userInfo: {
              token: 'xxx',
              userId: 'test-userId',
              userName: 'test-userName'
            }
          }
        };

        const expectedData = {
          userId: 'test-userId',
          userName: 'test-username',
          requestIP: '127.1.2.3',
          userAgent: 'user-agent-test-info',
          organizationId: '8523',
          originatorApplication: 'test-app-id',
          originatorService: 'core-graphql-server',
          impersonatorUserId: null
        };
        const result = messageUtil.getCallerInfo(reqContext);
        expect(result).toEqual(expectedData);
      });
    });

    describe('buildVtEvent (via emitPublicEvent) — org-id + fallback + swallow-failure branches', () => {
      // buildVtEvent itself is not exported; every branch below is only reachable through
      // emitPublicEvent. `decorate` and the per-message-type pbjs classes are auto-mocked
      // (see test/serviceContext.mock.js), so each test configures only the boundary it needs.
      const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
      const { decorate } = require('@veritone/ts-messaging-lib/lib');

      beforeEach(() => {
        decorate.mockReset();
        events.Unknown.create.mockReset();
        events.Unknown.encode.mockReset();
      });

      it('normalizes a missing organizationId to the "n/a" sentinel', async () => {
        events.Unknown.create.mockReturnValue({});
        events.Unknown.encode.mockReturnValue({ finish: () => Buffer.from('') });

        await messageUtil.emitPublicEvent('Unknown', 'system', {}, {});

        expect(decorate).toHaveBeenCalled();
        const coreArg = decorate.mock.calls[decorate.mock.calls.length - 1][1];
        expect(coreArg.organizationId).toBe('n/a');
      });

      it('preserves a real caller organization id instead of overwriting it with the "n/a" sentinel', async () => {
        events.Unknown.create.mockReturnValue({});
        events.Unknown.encode.mockReturnValue({ finish: () => Buffer.from('') });
        const reqContext = {
          _authInfo: {
            organization: { organizationId: 8523 }
          }
        };

        await messageUtil.emitPublicEvent('Unknown', 'system', reqContext, {});

        const coreArg = decorate.mock.calls[decorate.mock.calls.length - 1][1];
        expect(coreArg.organizationId).toBe('8523');
      });

      it('falls back to eventsMap.Unknown and warns when eventName has no match', async () => {
        const warnSpy = jest.spyOn(serviceContext.app.logger, 'warn');

        await messageUtil.emitPublicEvent('TotallyMadeUpEventName123', 'system', {}, {});

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Could not match event "TotallyMadeUpEventName123"')
        );
        warnSpy.mockRestore();
      });

      it('warns and returns null when the proto event type is not registered', async () => {
        const realUnknown = events.Unknown;
        events.Unknown = undefined;
        const warnSpy = jest.spyOn(serviceContext.app.logger, 'warn');

        try {
          const result = await messageUtil.emitPublicEvent('Unknown', 'system', {}, {});

          expect(result).toBeNull();
          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("event type was not found by event name 'Unknown'")
          );
        } finally {
          warnSpy.mockRestore();
          events.Unknown = realUnknown;
        }
      });

      it('re-emits under both the legacy and renamed event names for a mapped legacy event', async () => {
        events.RecordingCreated.create.mockReturnValue({});
        events.RecordingCreated.encode.mockReturnValue({ finish: () => Buffer.from('') });
        events.RecordingCreate.create.mockReturnValue({});
        events.RecordingCreate.encode.mockReturnValue({ finish: () => Buffer.from('') });
        decorate.mockReturnValue({ obj: {}, data: Buffer.from('') });
        serviceContext.messagingV2._clear();

        await messageUtil.emitPublicEvent('RecordingCreated', 'system', {}, { id: 't-1' });

        expect(serviceContext.messagingV2._queue().length).toBe(2);
      });

      it('catches and swallows a messaging.produce failure instead of rejecting', async () => {
        events.Unknown.create.mockReturnValue({});
        events.Unknown.encode.mockReturnValue({ finish: () => Buffer.from('') });
        decorate.mockReturnValue({ obj: {}, data: Buffer.from('') });
        const incSpy = jest.spyOn(serviceContext.metrics, 'incrementCounter');
        const produceSpy = jest
          .spyOn(serviceContext.messagingV2, 'produce')
          .mockRejectedValueOnce(new Error('nsq unavailable'));

        const result = await messageUtil.emitPublicEvent('Unknown', 'system', {}, {});

        expect(result).toBeUndefined();
        expect(incSpy).toHaveBeenCalledWith('messageFailed');
        produceSpy.mockRestore();
        incSpy.mockRestore();
      });
    });
  });
});
