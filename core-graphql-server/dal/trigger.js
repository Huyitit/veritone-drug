const _ = require('lodash');
const mapper = require('./mapper.js');

/** this file contains deprecated code.
 * All new events and event subscriptions should go to event.js file
 * trigger exists only for internal events.
 */

module.exports = function createFunction(
  logger,
  config,
  dbConnections,
  messaging,
  serviceContext
) {
  const errors = require('../error')(config);
  const messageUtil = require('../messageUtil.js')(serviceContext);

  /**
   * upsertTrigger insert or update an event trigger and
   * forward a cache update event to ensure future messages get routed correctly
   * @param {any} ctx
   * @param {any} args
   * @returns {object} trigger
   */
  async function upsertTrigger(ctx, args) {
    const input = args.input;
    if (_.isEmpty(input.eventName)) {
      throw new errors.InvalidInput({
        message: 'eventName cannot be an empty string'
      });
    }
    if (_.isEmpty(input.targetName)) {
      throw new errors.InvalidInput({
        message: 'targetName cannot be an empty string'
      });
    }
    if (
      typeof input.consumerDirective !== 'undefined' &&
      typeof input.consumerDirective !== 'object'
    ) {
      throw new errors.InvalidInput({
        message: 'consumerDirective must be JSONData'
      });
    }
    if (
      typeof input.consumerParams !== 'undefined' &&
      typeof input.consumerParams !== 'object'
    ) {
      throw new errors.InvalidInput({
        message: 'consumerParams must be JSONData'
      });
    }
    const params = [
      args.organizationId,
      input.eventName,
      input.eventType || '',
      input.targetName,
      JSON.stringify(input.consumerDirective),
      JSON.stringify(input.consumerParams),
      args.applicationId
    ];
    const sql = `INSERT INTO event_trigger.event_triggers
          (organization_id,
          event_name,
          event_type,
          target_name,
          consumer_directive,
          consumer_params,
          created_by,
          updated_by,
          created_at_utc,
          updated_at_utc)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, clock_timestamp(), clock_timestamp())
      ON CONFLICT ON CONSTRAINT event_org_type_idx do update SET
                              (consumer_directive,
                              consumer_params,
                              updated_by,
                              updated_at_utc) = ($5, $6, $7, clock_timestamp()) RETURNING *;`;
    const res = await dbConnections['core'].write.any(sql, params);
    try {
      // await
      // VTN-7847 - mutation fails because because times out.
      // message doesn't have to be synchronous.
      if (!args.input.disableCacheUpdate) {
        _emitInternalCacheUpdate(ctx);
      }
    } catch (e) {
      logger.error('unable to update trigger cache', e);
    }
    return mapper.camelizeRootKeys(res[0]);
  }

  /**
   * deleteTrigger performs hard delete of an event trigger
   * the trigger removal process is only allowed if the requester is within the same org.
   * This function also forwards a cache update event to ensure future messages will not get routed.
   * @param {any} ctx
   * @param {any} args
   * @returns {object}
   */
  async function deleteTrigger(ctx, args) {
    const params = [args.organizationId, args.id];
    const sql = `DELETE FROM event_trigger.event_triggers
    WHERE organization_id = $1 AND event_trigger_id = $2
    RETURNING *;`;
    const res = await dbConnections['core'].write.any(sql, params);
    // audit delete event using logger
    logger.log('trigger delete', res[0], args);
    if (_.isEmpty(res)) {
      throw new errors.NotFound({
        message:
          'The requested ID associated with your organization does not exist.',
        data: {
          objectType: 'Trigger',
          objectId: args.id
        }
      });
    }
    try {
      // await
      // VTN-7847 - mutation fails because because times out.
      // message doesn't have to be synchronous.
      _emitInternalCacheUpdate(ctx);
    } catch (e) {
      logger.error('unable to update trigger cache', e);
      throw new errors.ServiceFailure({
        message: 'unable to update trigger cache.'
      });
    }
    return {
      id: args.id,
      message: `Trigger ${args.id} has been removed from organization ${args.organizationId}`
    };
  }

  /**
   * createTriggers flattens out CreateTriggers input
   * and register them to each event or type provided in the input.
   * This function uses {upsertTrigger} function for inserting/updating the actual trigger
   * @param {*} ctx
   * @param {*} args
   */
  async function createTriggers(ctx, args) {
    const events = args.input.events;
    const types = args.input.types;
    const targets = args.input.targets;
    if (events && types) {
      throw new errors.InvalidInput({
        message: 'only either events or types should be specified.'
      });
    }
    let eventNames = [];
    let typeNames = [];
    let targetTopics = [];
    let values = [];

    if (events) {
      const hasWildCard = events.includes('*');
      eventNames = events.split(',').map((x) => x.trim());
      if (eventNames.length > 1 && hasWildCard) {
        throw new errors.InvalidInput({
          message: 'wild card is not suported for multiple events.'
        });
      }
    } else if (types) {
      const hasWildCard = types.includes('*');
      typeNames = types.split(',').map((x) => x.trim());
      if (typeNames.length > 1 && hasWildCard) {
        throw new errors.InvalidInput({
          message: 'wild card is not suported for multiple types.'
        });
      }
    }
    const hooks = [];
    const upsertArgs = [];
    for (const target of targets) {
      if (!_verifyTargetParams(target.name, target.params)) {
        throw new errors.InvalidInput({
          message: `target param is not compatible with the provided target ${target.name}`
        });
      }
      for (const e of eventNames) {
        const _args = _.assign({}, args, {
          input: {
            eventName: e,
            targetName: target.name,
            consumerParams: target.params,
            disableCacheUpdate: true
          }
        });
        upsertArgs.push(_args);
      }
      for (const t of typeNames) {
        const _args = _.assign({}, args, {
          input: {
            eventName: '*',
            eventType: t,
            targetName: target.name,
            consumerParams: target.params,
            disableCacheUpdate: true
          }
        });
        upsertArgs.push(_args);
      }
    }

    for (const _args of upsertArgs) {
      try {
        hooks.push(await upsertTrigger(ctx, _args));
      } catch (e) {
        logger.error('unable to insert new hook', _args, e);
      }
    }
    try {
      _emitInternalCacheUpdate(ctx);
    } catch (e) {
      logger.error('unable to update trigger cache', e);
    }
    return hooks;
  }

  /**
   * getTrigger returns {Trigger} information by ID
   * @param {*} ctx
   * @param {*} args
   */
  async function getTrigger(ctx, args) {
    const hookId = args.id;
    const orgId = ctx._authInfo.organization.organizationId;
    if (orgId === undefined) {
      throw new errors.NotAllowed();
    }
    const params = [hookId, orgId];
    const sqlStatement = `
    SELECT * FROM event_trigger.event_triggers
    WHERE event_trigger_id = $1
    AND organization_id = ($2);`;
    const result = await dbConnections['core'].read.query(sqlStatement, params);
    if (result.length === 0) {
      throw new errors.NotFound();
    }
    return mapper.camelizeRootKeys(result[0]);
  }

  /**
   *
   * getTriggers return all registered {Trigger[]} information from the current org
   * @param {*} ctx
   * @param {*} args
   */
  async function getTriggers(ctx, args) {
    const orgId = ctx._authInfo.organization.organizationId;
    if (orgId === undefined) {
      throw new errors.NotAllowed();
    }
    const params = [orgId];
    const sqlStatement = `
    SELECT * FROM event_trigger.event_triggers
    WHERE organization_id = $1;`;
    const results = await dbConnections['core'].read.query(
      sqlStatement,
      params
    );
    if (results.length === 0) {
      throw new errors.NotFound();
    }
    return results.map((x) => mapper.camelizeRootKeys(x));
  }

  /**
   * emit `trigger_cache_update` event to `events_internal` type.
   * This allows `core-trigger-service` to update its cache and effectively
   * applies the new rules
   * @param {any} context
   * @returns
   */
  function _emitInternalCacheUpdate(context) {
    const event = {
      type: 'events_internal',
      event: 'trigger_cache_update',
      serviceName: 'core-graphql-service',
      correlationId: context.requestInfo.correlationId,
      timestampMs: Date.now()
    };
    return messageUtil.emitEvent(event, 'events_internal');
  }

  /**
   * perform basic validation for target params based on the target
   *
   * @param {string} target
   * @param {object} params
   * @returns {boolean}
   */
  function _verifyTargetParams(target, params) {
    switch (target) {
      case 'Email':
        return _.get(params, 'address', '') != '';
      case 'SMS':
        return _.get(params, 'number', '') != '';
      case 'Webhook':
        return _.get(params, 'url', '') != '';
      default:
        return false;
    }
  }

  return {
    deleteTrigger,
    createTriggers,
    getTriggers,
    getTrigger,
    upsertTrigger
  };
};
