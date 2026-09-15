module.exports = function setUpEventEmitter(serviceContext) {
  const messageUtil = serviceContext.messageUtil;

  const eventTypes = {
    batch: 'batch'
  };

  const eventNames = {
    TDOBatchJobProcessCreated: 'TDOBatchJobProcessCreated',
    TDOSearchProcessCreated: 'TDOSearchProcessCreated'
  };

  /**
   * emit an event after creation of a new batch.
   * This event will be received by eventing service to start
   * the action execution for each member of the batch
   *
   * @param {Object} batchEvent
   **/
  function emitTDOBatchJobProcessCreated(batchEvent) {
    const event = {
      event: eventNames.TDOBatchJobProcessCreated,
      type: eventTypes.batch,
      serviceName: 'core-graphql-server',
      batchProcessId: batchEvent.batchProcessId,
      organizationId: batchEvent.organizationId,
      token: batchEvent.token
    };
    messageUtil.emitEvent(event, 'events');
  }

  /**
   * emit an event after the creation of a new dynamic batch.
   * It means that we create the batch record in DB, but we still
   * do not know how many tdos are part of the new batch because
   * still is necessary to run a search query against the search server and
   * that job is made from eventing service who is listening this event.
   * authToken is necessary to call the search api and searchQuery is the query
   * that get all the tdos for the batch.
   *
   * @param {Object} batchEvent
   **/
  function emitTDOSearchProcessCreated(batchEvent) {
    const event = {
      event: eventNames.TDOSearchProcessCreated,
      type: eventTypes.batch,
      serviceName: 'core-graphql-server',
      organizationId: batchEvent.organizationId,
      batchId: batchEvent.batchId,
      searchQuery: batchEvent.searchQuery,
      token: batchEvent.token,
      skipTdosAfterEventCreation: batchEvent.skipTdosAfterEventCreation
    };
    messageUtil.emitEvent(event, 'events');
  }

  return {
    emitTDOBatchJobProcessCreated,
    emitTDOSearchProcessCreated
  };
};
