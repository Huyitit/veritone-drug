const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');

/*
 * This module contains functions used for generating metering-related events.
 */
module.exports = function create(serviceContext) {
  const resUtil = require('./resolvers/util.js')(serviceContext);

  /**
   * Generate a metering event for an API request. One per HTTP request --
   * the event contains aggregated data about any and all mutations and queries
   * requested in the request.
   */
  async function meterAPIRequest(context) {
    const clientInfo = resUtil.getClientInfo(context);
    const request = context.requestInfo;
    // get field stats off the request info object
    // and compress them into the form used for metering:
    // {
    //   "apiUsage": {
    //     "temporalDataObjects": 2
    //   }
    // }
    const fieldStats = context.fieldStats;
    const Q_KEY = 'Query.';
    const M_KEY = 'Mutation.';
    let queries = _.pickBy(fieldStats, (v, k) => k.startsWith(Q_KEY));
    let mutations = _.pickBy(fieldStats, (v, k) => k.startsWith(M_KEY));
    queries = _.mapKeys(queries, (v, k) => k.substring(Q_KEY.length));
    mutations = _.mapKeys(mutations, (v, k) => k.substring(M_KEY.length));
    queries = _.mapValues(queries, (o) => o.count);
    mutations = _.mapValues(mutations, (o) => o.count);
    const organizationId = await resUtil.getOrgIdFromClientInfo(clientInfo);

    const meter = {
      id: request.requestId || uuidv4(),
      correlationId: request.correlationId,
      timestampMs: context.requestInfo.startTime,
      timestamp: moment(context.requestInfo.startTime).toISOString(),
      userId: clientInfo.id,
      organizationId: _.toString(organizationId),
      eventType: _.get(
        serviceContext,
        'config.metering.eventTypes.APIRequest',
        'APIRequest'
      ),
      count: 1,
      apiUsage: _.merge(queries, mutations),
      errorCount: context.requestInfo.errorCount,
      errorNames: context.requestInfo.errorNames
    };
    try {
      await serviceContext.messageUtil.emitEvent(
        meter,
        _.get(serviceContext, 'config.metering.topic', 'events')
      );
      await serviceContext.metrics.incrementCounter('meteredEvent');
    } catch (err) {
      serviceContext.logger.error(err);
      await serviceContext.metrics.incrementCounter('meteredEventError');
    }
  }

  return {
    meterAPIRequest
  };
};
