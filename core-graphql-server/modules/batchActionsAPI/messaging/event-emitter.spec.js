'use strict';

describe('event-emitter', () => {
  let emitEvent;
  let emitter;

  beforeEach(() => {
    emitEvent = jest.fn();
    emitter = require('./event-emitter')({ messageUtil: { emitEvent } });
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('emitTDOBatchJobProcessCreated', () => {
    it('publishes a TDOBatchJobProcessCreated event on the events topic with the full payload', () => {
      const batchEvent = {
        batchProcessId: 'bp-1',
        organizationId: 'org-1',
        token: 'tok-1'
      };

      emitter.emitTDOBatchJobProcessCreated(batchEvent);

      expect(emitEvent).toHaveBeenCalledTimes(1);
      const [event, topic] = emitEvent.mock.calls[0];
      expect(topic).toBe('events');
      expect(event).toMatchObject({
        event: 'TDOBatchJobProcessCreated',
        type: 'batch',
        serviceName: 'core-graphql-server',
        batchProcessId: 'bp-1',
        organizationId: 'org-1',
        token: 'tok-1'
      });
    });
  });

  describe('emitTDOSearchProcessCreated', () => {
    it('publishes a TDOSearchProcessCreated event including searchQuery and skipTdosAfterEventCreation', () => {
      const batchEvent = {
        batchId: 'b-1',
        organizationId: 'org-2',
        searchQuery: { query: 'some-search' },
        token: 'tok-2',
        skipTdosAfterEventCreation: true
      };

      emitter.emitTDOSearchProcessCreated(batchEvent);

      expect(emitEvent).toHaveBeenCalledTimes(1);
      const [event, topic] = emitEvent.mock.calls[0];
      expect(topic).toBe('events');
      expect(event).toMatchObject({
        event: 'TDOSearchProcessCreated',
        type: 'batch',
        serviceName: 'core-graphql-server',
        batchId: 'b-1',
        organizationId: 'org-2',
        searchQuery: { query: 'some-search' },
        token: 'tok-2',
        skipTdosAfterEventCreation: true
      });
    });
  });
});
