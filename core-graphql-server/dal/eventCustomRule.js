const _ = require('lodash');
const moment = require('moment');
const uuid = require('uuid');
const hash = require('object-hash');

const selectEventCustomRuleColumns = {
  rule_id: 'id',
  rule_status: 'status',
  rule_name: 'name',
  rule_description: 'description',
  rule_params: 'params',
  organization_id: null,
  event_type: null,
  event_name: null,
  event_actions: 'actions',
  created_at_utc: 'created_date_time'
};

module.exports = function createFunction(serviceContext, dalEvent) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')();
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');

  async function addActions(context, rule, actions) {
    const { eventName, eventType, organizationId } = rule;
    if (!Array.isArray(actions)) {
      return;
    }
    for (let action of actions) {
      const { delivery, conditions, application } = action;
      if (typeof application !== 'string') {
        throw new errors.InvalidInput({
          message: 'The action application must be string',
          data: {
            action
          }
        });
      }
      const input = {
        eventName,
        eventType,
        application,
        conditions,
        delivery
      };
      const args = { organizationId, input };
      action.subscription = await dalEvent.subscribeEvent(context, args);
    }
  }

  function hashAction(action) {
    const { delivery, conditions, application } = action;
    const s = hash(
      { delivery, conditions, application },
      { respectType: false }
    );
    return s;
  }

  async function removeActions(context, rule, actions) {
    const { organizationId } = rule;
    if (!Array.isArray(actions)) {
      return;
    }
    for (let action of actions) {
      if (action.subscription) {
        const args = { organizationId, id: action.subscription };
        try {
          await dalEvent.unsubscribeEvent(context, args);
        } catch (e) {
          logger.debug('unsubscription error', e);
        }
        delete action.subscription;
      }
    }
  }

  async function createEventCustomRule(context, args) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);
    const id = uuid.v4();

    const tx = await serviceContext.dbConnections['core'].write.connect();
    try {
      await tx.query('BEGIN');
      context.tx = tx;

      if (input.actions) {
        if (!Array.isArray(input.actions)) {
          throw new errors.InvalidInput({
            message: 'The actions must be an array'
          });
        }
        input.actions = input.actions.filter((a) => typeof a === 'object');
      }

      const rule = {
        rule_id: id,
        rule_status: input.status,
        rule_name: input.name,
        rule_description: input.description,
        rule_params: input.params,
        organization_id: args.organizationId,
        event_type: input.eventType,
        event_name: input.eventName,
        event_actions: null,
        created_by: clientInfo.id
      };
      if (input.status === 'active') {
        await addActions(
          context,
          {
            eventName: input.eventName,
            eventType: input.eventType,
            organizationId: args.organizationId
          },
          input.actions
        );
      }
      rule.event_actions = JSON.stringify(input.actions);
      const { sql, values } = mainUtil.makeInsertSql(
        'event_trigger.event_custom_rules',
        rule,
        selectEventCustomRuleColumns
      );
      // write row to database
      const res = await tx.map(sql, values, mapper.camelizeRootKeys);
      await tx.query('COMMIT');
      return res[0];
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.done();
    }
  }

  async function updateEventCustomRule(context, args) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);

    args.id = input.id;
    const old_rule = await eventCustomRule(context, args);
    if (!old_rule) {
      throw new errors.NotFound({
        message: 'The event custom rule by that ID is not found',
        data: {
          objectId: input.id
        }
      });
    }
    const tx = await serviceContext.dbConnections['core'].write.connect();
    try {
      await tx.query('BEGIN');
      context.tx = tx;
      const columnData = {
        rule_status: input.status,
        rule_name: input.name,
        rule_description: input.description,
        rule_params: input.params,
        event_actions: null,
        updated_by: clientInfo.id,
        updated_at_utc: moment(Date.now()).toISOString()
      };

      if (!input.actions) {
        input.actions = old_rule.actions;
      }

      if (old_rule.status === 'inactive') {
        if (input.status === 'active') {
          await addActions(context, old_rule, input.actions);
        } else if (input.status === 'inactive') {
          //
        }
      } else if (old_rule.status === 'active') {
        if (input.status === 'inactive') {
          await removeActions(context, old_rule, old_rule.actions);
        } else if (input.status === 'active') {
          // active -> active
          const removed_actions = _.differenceBy(
            old_rule.actions,
            input.actions,
            hashAction
          );
          await removeActions(context, old_rule, removed_actions);
          const added_actions = _.differenceBy(
            input.actions,
            old_rule.actions,
            hashAction
          );
          await addActions(context, old_rule, added_actions);
          // keep existing subscription id
          input.actions.forEach((action) => {
            const h = hashAction(action);
            const o = old_rule.actions.find((a) => hashAction(a) === h);
            if (o) {
              action.subscription = o.subscription;
            }
          });
        }
      }

      columnData.event_actions = JSON.stringify(input.actions);

      const { sql, values } = mainUtil.makeUpdateSql(
        'event_trigger.event_custom_rules',
        columnData,
        selectEventCustomRuleColumns,
        `rule_id = $1 AND organization_id = $2`,
        2
      );
      values.unshift(input.id, args.organizationId);
      const [result] = await tx.map(sql, values, mapper.camelizeRootKeys);
      if (!result) {
        throw new errors.NotFound({
          message: 'The event custom rule by that ID is not found',
          data: {
            objectId: input.id
          }
        });
      }
      await tx.query('COMMIT');
      return result;
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.done();
    }
  }

  async function eventCustomRule(context, args) {
    const query = `SELECT ${mainUtil.makeSelectClause(
      selectEventCustomRuleColumns
    )}  FROM event_trigger.event_custom_rules
        WHERE rule_id = $1 AND organization_id = $2`;

    const [result] = await serviceContext.dbConnections['core'].read.map(
      query,
      [args.id, args.organizationId],
      mapper.camelizeRootKeys
    );
    return result;
  }

  async function eventCustomRules(context, args) {
    const { organizationId, offset = 0, limit = 30 } = args;

    const filters = [];
    const params = [];
    const paging = [];

    params.push(organizationId);
    filters.push(`organization_id = $${params.length}`);
    params.push(offset);
    paging.push(`OFFSET $${params.length}`);
    params.push(limit);
    paging.push(`LIMIT $${params.length}`);

    const query = `
      SELECT ${mainUtil.makeSelectClause(selectEventCustomRuleColumns)}
      FROM event_trigger.event_custom_rules
      WHERE ${filters.join(' AND ')}
      ${paging.join(' ')}
    `;

    const res = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.camelizeRootKeys
    );
    return {
      records: res,
      offset: args.offset,
      limit: args.limit,
      count: res.length
    };
  }

  async function deleteEventCustomRule(context, args) {
    const old_rule = await eventCustomRule(context, args);
    if (!old_rule) {
      throw new errors.NotFound({
        message: 'The event custom rule by that ID is not found',
        data: {
          objectId: args.id
        }
      });
    }
    // prefer transaction in context
    const tx = await serviceContext.dbConnections['core'].write.connect();
    try {
      await tx.query('BEGIN');
      context.tx = tx;
      await removeActions(context, old_rule, old_rule.actions);
      const query = `
        DELETE FROM event_trigger.event_custom_rules
        WHERE rule_id = $1 AND organization_id = $2
      `;
      await tx.map(
        query,
        [args.id, args.organizationId],
        mapper.camelizeRootKeys
      );
      await tx.query('COMMIT');
    } catch (err) {
      await tx.query('ROLLBACK');
      throw err;
    } finally {
      tx.done();
    }
    return {
      id: args.id,
      message: 'Deleted event custom rule'
    };
  }

  return {
    createEventCustomRule,
    updateEventCustomRule,
    eventCustomRule,
    eventCustomRules,
    deleteEventCustomRule
  };
};
