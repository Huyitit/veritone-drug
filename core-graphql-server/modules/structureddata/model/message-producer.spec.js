const { eventsMap } = require('@veritone/core-server-base/events-map.js');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../../../test/serviceContext.mock.js')();
const MessageProducer = require('./message-producer.js');
const msgProducer = new MessageProducer(serviceContext);

describe('message-producer.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should do nothing if the event type info is not passed in', function () {
    msgProducer.publishEvent(
      mockUtil.makeContext(),
      null,
      {
        id: 'test-id',
        event: 'structured_data_registry_create',
        type: eventsMap.StructuredDataRegistryCreate.type,
        schema: {}
      },
      false,
      true
    );

    // event
    expect(serviceContext.messageUtil._counter()).toBe(0);
  });

  it('should do nothing if the event data is not passed in', function () {
    msgProducer.publishEvent(
      mockUtil.makeContext(),
      eventsMap.StructuredDataRegistryCreate.type,
      null,
      false,
      true
    );

    // event
    expect(serviceContext.messageUtil._counter()).toBe(0);
  });

  it('should only emit 1 public event', function () {
    msgProducer.publishEvent(
      mockUtil.makeContext(),
      eventsMap.StructuredDataRegistryCreate,
      {
        id: 'test-id',
        event: 'structured_data_registry_create',
        type: eventsMap.StructuredDataRegistryCreate.type,
        schema: {}
      },
      false,
      true
    );

    // event
    expect(serviceContext.messageUtil._counter()).toBe(1);
    const messages = serviceContext.messageUtil._messages();
    expect(messages[0].event).toBe('structured_data_registry_create');
    expect(messages[0].type).toBe(eventsMap.StructuredDataRegistryCreate.type);
    expect(typeof messages[0].schema).toBe('string');
  });

  it('should only emit 1 private event', function () {
    msgProducer.publishEvent(
      mockUtil.makeContext(),
      eventsMap.StructuredDataRegistryCreate,
      {
        id: 'test-id',
        event: 'structured_data_registry_create',
        type: eventsMap.StructuredDataRegistryCreate.type,
        schema: {}
      },
      true,
      false
    );

    // event
    expect(serviceContext.messageUtil._counter()).toBe(1);
    const messages = serviceContext.messageUtil._messages();
    expect(messages[0].event).toBe('structured_data_registry_create');
    expect(messages[0].type).toBe(eventsMap.StructuredDataRegistryCreate.type);
    expect(typeof messages[0].data.schema).toBe('object');
  });
});
