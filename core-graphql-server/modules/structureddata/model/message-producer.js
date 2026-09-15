const moment = require('moment');
const _ = require('lodash');

class MessageProducer {
  constructor(serviceContext) {
    this.messageUtil =
      serviceContext.messageUtil ||
      require('../../../messageUtil.js')(serviceContext);
    this.logger = serviceContext.logger;
  }

  contructEvent(eventName, type, entity) {
    entity.updatedAt = this.convertToIsoDate(entity.updatedAt);
    entity.createdAt = this.convertToIsoDate(entity.createdAt);

    const event = {
      event: eventName,
      type: type || 'structured_data',
      dataSource: entity.dataRegistryId,
      dataRegistryId: entity.dataRegistryId,
      data: entity
    };

    return event;
  }

  convertToIsoDate(date) {
    return moment(date).toISOString(false);
  }

  /**
   * Publish the event: includes emitEvent and publishPublicEvent
   * @param {*} context the current context
   * @param {*} eventTypeInfo the event type info (events-map)
   * @param {*} entity the event data
   * @param {*} emitPrivateEvent emit the private event or not
   * @param {*} emitPublicEvent emit the public event or not
   * @returns nothing, just emit the event
   */
  publishEvent(
    context,
    eventTypeInfo,
    entity,
    emitPrivateEvent = true,
    emitPublicEvent = true
  ) {
    try {
      if (_.isNil(eventTypeInfo)) {
        this.logger.warn('(publishEvent) the eventTypeInfo is invalid');
        return;
      }
      if (_.isNil(entity)) {
        this.logger.warn('(publishEvent) the entity is invalid');
        return;
      }
      if (emitPrivateEvent) {
        const event = this.contructEvent(
          eventTypeInfo.event,
          eventTypeInfo.type,
          entity
        );
        this.messageUtil.emitEvent(event, 'events');
      }

      // publish public event
      if (emitPublicEvent) {
        // validate the data of the schema field. It should be the data of string with a public event
        const schemaData = _.get(entity, 'schema', '{}');
        entity.schema =
          typeof schemaData === 'string'
            ? schemaData
            : JSON.stringify(schemaData);

        this.emitPublicEvent(context, eventTypeInfo, entity);
      }
    } catch (ex) {
      this.logger.error('(publishEvent) failed to publish event', ex);
    }
  }

  /**
   * Publish the public events for the structured data
   * The supported types: structured_data_create, structured_data_delete
   * @param {*} the context
   * @param {*} eventTypeInfo the event type info (events-map)
   * @param {*} entity the event data
   * @returns nothing, just emit an event
   */
  async emitPublicEvent(context, eventTypeInfo, entity) {
    if (_.isNil(eventTypeInfo)) {
      this.logger.warn('(publishPublicEvent) the eventTypeInfo is invalid');
      return;
    }
    if (_.isNil(entity)) {
      this.logger.warn('(publishPublicEvent) the entity is invalid');
      return;
    }
    try {
      await this.messageUtil.emitPublicEvent(
        eventTypeInfo.name,
        'system',
        context,
        entity
      );
    } catch (err) {
      this.logger.error(
        '[structuredData - publishPublicEvent] Error on emitting public event',
        err
      );
    }
  }
}

module.exports = MessageProducer;
