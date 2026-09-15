const _ = require('lodash');
const {
  events: pbEvents
} = require('@veritone/core-messages/generated/pbjs/compiled');
const { Context, decorate } = require('@veritone/ts-messaging-lib/lib');
const { Messager } = require('@veritone/ts-messaging-lib/lib/nsq');
const protobuf = require('protobufjs');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const uuid = require('uuid');
const validator = require('validator');
const normalizeUrl = require('normalize-url');
const libPhoneNumber = require('libphonenumber-js');
const hash = require('object-hash');
const rp = require('request-promise');
const { promisify } = require('util');
const { isValidConditions } = require('../util/eventConditions');

const selectData = {
  event_id: null,
  event_name: null,
  event_type: null,
  application_id: null,
  public: null,
  description: null,
  schema_data: null,
  schema_hash: null,
  created_at_utc: null,
  created_by: null
};

const selectSubscriptionColumns = {
  event_subscription_id: null,
  organization_id: null,
  application_id: null,
  event_name: null,
  event_type: null,
  target_name: null,
  consumer_params: null,
  conditions: null,
  subscription_hash: null,
  created_at_utc: null,
  scope: null
};

const selectEventActionTemplateColumns = {
  template_id: 'id',
  template_name: 'name',
  organization_id: null,
  application_id: 'owner_application_id',
  input_type: null,
  input_validation: null,
  input_attributes: null,
  action_type: null,
  action_destination: null,
  action_validation: null,
  action_attributes: null,
  created_at_utc: 'created_date_time'
};

const ASSOCIATED_WITH_APPLICATION = -2;
const subscriptionScope = {
  Application: 'Application',
  Organization: 'Organization'
};

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const messaging = serviceContext.messagingV2;
  const messageUtil = serviceContext.messageUtil;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mainUtil = require('../util.js')();
  const errors = require('../error')(config);
  const mapper = require('./mapper.js');
  const messageNameRegex = new RegExp(/message[ ]{1,}([a-zA-Z0-9_]*)[ ]{1,}{/);
  const definitionPath = _.get(
    config,
    'messaging.definitionDir',
    '/tmp/proto/events'
  );
  const eventDefSQL = `
  SELECT schema_data, schema_hash FROM event_trigger.event
  WHERE application_id = $1
  AND event_name = $2
  AND event_type = $3;
  -- application_id && event_name && event_type should always return 0 or 1 result
  `;
  const errorOnMessageFailure = _.get(
    serviceContext,
    'config.featureFlags.errorOnMessageFailure',
    true
  );

  /**
   * build core takes the request context, event name, type, and payload to
   * generate a core payload that contains necessary context for event routing
   * Note: access to the app should be verified before calling _buildCore
   *
   * @param {*} ctx
   * @param {*} event
   * @param {*} type
   * @param {*} app
   * @returns
   */
  function _buildCore(ctx, event, type, app, organizationId) {
    const userInfo = ctx._authInfo;
    const tokenInfo = ctx.tokenInfo;
    const orgId = _.get(
      userInfo,
      'organization.organizationId',
      organizationId || ''
    ).toString();
    const core = new pbEvents.Core();
    core.name = event;
    core.type = type;
    core.applicationId = app;
    core.serviceName = 'core-graphql-server';
    core.organizationId = orgId;
    core.id = _.get(ctx, 'requestInfo.correlationId', uuid.v4());
    if (userInfo) {
      core.userId = _.get(userInfo, 'userId', '');
    } else if (tokenInfo) {
      core.tokenId = _.get(userInfo, 'token', '');
    }
    return core;
  }

  /**
   * check for definition directory, should be called only once
   *
   * @param {*} filePath
   * @returns
   */
  function _ensureDirectoryExistence(filePath) {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
      return true;
    }
    _ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
  }

  async function _getDefinition(event, type, app) {
    const res = await dbConnections['core'].read.map(
      eventDefSQL,
      [app, event, type],
      mapper.camelizeRootKeys
    );
    if (_.isEmpty(res)) {
      throw new errors.NotFound({
        message: 'No event definition found for application',
        data: {
          name: event,
          type: type,
          app: app
        }
      });
    }
    return res[0];
  }

  /**
   *
   *
   * @param {*} ctx
   * @param {*} args
   * @returns
   */
  async function emitEvent(ctx, args) {
    const input = args.input;
    const name = input.eventName;
    const type = input.eventType;
    const app = input.application;
    const payload = input.payload;
    // Get organizationId from input in case using orgless token
    const organizationId = _.get(
      ctx,
      '_authInfo.organization.organizationId',
      input.orgId
    );

    const definition = await _getDefinition(name, type, app);
    // CWE-73: reject path separators and bare traversal sequences in user-supplied path components
    if (/[/\\]/.test(app) || app === '..' || /[/\\]/.test(type) || type === '..') {
      throw new errors.InvalidInput({ message: 'Invalid application or eventType' });
    }
    const protoFile = `${definitionPath}/${app}/${type}/${definition.schemaHash}.proto`;

    logger.debug(`looking up definition in: ${protoFile}`);
    if (!fs.existsSync(protoFile)) {
      // save it
      _ensureDirectoryExistence(protoFile);
      // simple hack to enforce protobuf syntax and package name
      const data = `
      syntax = "proto3";
      package events;
      `;
      fs.writeFileSync(protoFile, data + definition.schemaData);
    }
    // simple text parsing for `message [y]` to generate lookupType
    const results = messageNameRegex.exec(
      fs.readFileSync(protoFile).toString()
    );
    if (_.isEmpty(results)) {
      throw new errors.InvalidInput({
        message: 'unable to determine message name',
        data: definition.schemaData
      });
    }

    await _verifyAppOwnership(
      app,
      _.get(
        ctx,
        '_authInfo.organization.organizationId',
        organizationId || ''
      ).toString()
    );
    // create core payload that contains context for routing
    const core = _buildCore(ctx, name, type, app, organizationId);

    // dynamically load definition from disk following the convention:
    // /tmp/proto/<app>/<type>/<hash>.proto
    const root = protobuf.loadSync(protoFile);
    const eventType = root.lookupType(`events.${results[1]}`);

    const callerInfo = messageUtil.getCallerInfo(ctx);
    const actionInfo = messageUtil.getActionInfo(core, eventType);

    let decoder = '';
    let vtEvent, jsonEvent;
    try {
      const jsonPayload = JSON.parse(payload);
      const verifyErr = eventType.verify(jsonPayload);
      if (verifyErr) {
        throw new errors.InvalidInput({
          message: 'invalid payload',
          data: verifyErr
        });
      }
      // successfully decoded message from JSON payload, set the decoder
      decoder = 'json';
      const protoMessage = eventType.create(jsonPayload);
      vtEvent = decorate(
        {
          data: eventType.encode(protoMessage).finish(),
          obj: protoMessage
        },
        core,
        callerInfo,
        actionInfo
      );
      jsonEvent = _.assign({}, core, { payload: jsonPayload });
    } catch (e) {
      logger.debug(
        'not a JSON payload, assume this is a proto binary base64 encoded',
        payload
      );
      vtEvent = decorate(
        {
          data: eventType.decode(Buffer.from(payload, 'base64')),
          obj: Buffer.from(payload, 'base64')
        },
        core,
        callerInfo,
        actionInfo
      );
      decoder = 'protobuf';
    }
    try {
      messaging.produce(Context, new Messager(vtEvent, 'public'));

      // emit json event to events topic
      if (jsonEvent) {
        await messageUtil.emitEvent(jsonEvent, 'events');
      }
    } catch (e) {
      logger.error('unable to emit event', e);
      throw new errors.ServiceUnavailable({ message: 'Unable to emit event' });
    }
    return { id: core.id, decoder };
  }

  async function createEvent(context, args) {
    const input = args.input;
    // system app events can only be created by sql script currently
    if (input.application.toLowerCase() === 'system') {
      throw new errors.NotAllowed({
        message: 'Unauthorized creation of create system app events',
        data: {
          objectId: input.application
        }
      });
    } else {
      await _verifyAppOwnership(input.application, args.organizationId);
    }

    if (_.isEmpty(input.schemaData)) {
      input.schemaData = `message Custom {
	string payload = 5;
}`;
    }

    const clientInfo = resUtil.getClientInfo(context);

    if (input.id && !validator.isUUID(input.id)) {
      throw new errors.InvalidInput({
        message: 'eventId is invalid',
        data: {
          objectType: 'eventId',
          objectId: input.id
        }
      });
    }

    const id = input.id || uuid.v4();

    const columnData = {
      event_id: id,
      event_name: input.eventName,
      event_type: input.eventType,
      organization_id: args.organizationId,
      application_id: input.application,
      schema_data: input.schemaData,
      schema_hash: resUtil.hash(input.schemaData),
      public: input.public,
      created_by: clientInfo.id,
      description: input.description
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.event',
      columnData,
      selectData
    );

    // write row to database
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    let result = res[0];
    result.id = result.eventId;
    result.createdDateTime = result.createdAtUtc;
    result.application = result.applicationId;
    return result;
  }
  // valid for only one app id
  async function batchCreateEvents(context, args) {
    const input = args.input;

    if (input.length === 0) {
      throw new errors.NotAllowed({
        message: 'Input cannot be empty'
      });
    }
    const clientInfo = resUtil.getClientInfo(context);
    const events = [];
    const eventMap = {};
    const appId = input[0].application;
    // question should we allow only one application inside the batch
    input.forEach((item) => {
      if (item.application !== appId) {
        throw new errors.NotAllowed({
          message: 'Application id must be all the same',
          data: {
            objectId: appId
          }
        });
      }
      // system app events can only be created by sql script currently
      if (item.application.toLowerCase() === 'system') {
        throw new errors.NotAllowed({
          message: 'Unauthorized creation of create system app events',
          data: {
            objectId: appId
          }
        });
      }
      if (eventMap[item.eventName + item.eventType]) {
        throw new errors.NotAllowed({
          message: 'Events must have unique eventName and eventType'
        });
      }
      eventMap[item.eventName + item.eventType] = true;

      if (_.isEmpty(item.schemaData)) {
        item.schemaData = `message Custom {
          string payload = 5;
        }`;
      }

      if (item.id && !validator.isUUID(item.id)) {
        throw new errors.InvalidInput({
          message: 'eventId is invalid',
          data: {
            objectType: 'eventId',
            objectId: item.id
          }
        });
      }
      const columnData = {
        event_id: item.id || uuid.v4(),
        event_name: item.eventName,
        event_type: item.eventType,
        organization_id: args.organizationId,
        application_id: item.application,
        schema_data: item.schemaData,
        schema_hash: resUtil.hash(item.schemaData),
        public: item.public,
        created_by: clientInfo.id,
        description: item.description
      };
      events.push(columnData);
    });
    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.event',
      events,
      selectData
    );
    const result = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );
    const res = result.map((item) => {
      return {
        ...item,
        id: item.eventId,
        createdDateTime: item.createdAtUtc,
        application: item.applicationId
      };
    });
    return res;
  }

  async function batchUpdateEvents(context, args) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);
    let batchSql = '';
    const batchValues = [];
    const dbconn = serviceContext.dbConnections['core'].write;
    input.forEach((item, index) => {
      const columnData = {
        description: item.description,
        updated_by: clientInfo.id,
        updated_at_utc: moment(Date.now()).toISOString()
      };
      const { sql, values } = mainUtil.makeUpdateSql(
        'event_trigger.event',
        columnData,
        selectData,
        `event_id = '${item.id}' AND organization_id = '${args.organizationId}'`,
        index * 3
      );
      batchSql += sql + ';';
      batchValues.push(...values);
    });

    const result = await dbconn.map(
      batchSql,
      batchValues,
      mapper.camelizeRootKeys
    );
    let newResult = [];
    if (!result) {
      throw new errors.NotFound({
        message: 'The event(s) by that ID could not be found'
      });
    } else {
      result.forEach((event) => {
        newResult.push({
          ...event,
          id: event.eventId,
          createdDateTime: event.createdAtUtc,
          application: event.applicationId
        });
      });
    }
    return newResult;
  }

  async function updateEvent(context, args) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);
    const columnData = {
      description: input.description,
      updated_by: clientInfo.id,
      updated_at_utc: moment(Date.now()).toISOString()
    };

    const { sql, values } = mainUtil.makeUpdateSql(
      'event_trigger.event',
      columnData,
      selectData,
      `event_id = '${input.id}' AND organization_id = '${args.organizationId}'`
    );

    const dbconn = serviceContext.dbConnections['core'].write;
    const res = await dbconn.map(sql, values, mapper.camelizeRootKeys);
    if (!res.length) {
      throw new errors.NotFound({
        message: 'The event by that ID is not found',
        data: {
          objectId: input.id
        }
      });
    }

    let result = res[0];
    result.id = result.eventId;
    result.createdDateTime = result.createdAtUtc;
    result.application = result.applicationId;
    return result;
  }

  async function events(context, args) {
    let query = `SELECT ${mainUtil.makeSelectClause(selectData)}
           FROM event_trigger.event
           WHERE application_id = $1
           OFFSET ${args.offset || 0}
           LIMIT ${args.limit || 30}`;

    let params = [args.application];
    // should check Ownership if it is not a super admin
    // or not an internal orgless token
    if (
      args.application !== 'system' &&
      !_.isNil(args.organizationId) &&
      !resUtil.isSuperAdmin(_.get(context, '_authInfo'))
    ) {
      await _verifyAppOwnership(args.application, args.organizationId);
    }

    try {
      const res = await serviceContext.dbConnections['core'].read.map(
        query,
        params,
        mapper.camelizeRootKeys
      );
      res.forEach((event) => {
        event.id = event.eventId;
        event.createdDateTime = event.createdAtUtc;
        event.application = event.applicationId;
      });
      return {
        records: res,
        offset: args.offset,
        limit: args.limit,
        count: res.length
      };
    } catch (err) {
      throw new errors.InternalServerError(err);
    }
  }

  async function event(context, args) {
    const params = [args.id];
    let query = `SELECT ${mainUtil.makeSelectClause(selectData)}
           FROM event_trigger.event
           WHERE event_id = $1`;

    // should check org Id if it is not a super admin
    // or not an internal orgless token
    if (
      !_.isNil(args.organizationId) &&
      !resUtil.isSuperAdmin(_.get(context, '_authInfo'))
    ) {
      params.push(args.organizationId);
      query += ` AND organization_id = $${params.length}`;
    }

    const res = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.camelizeRootKeys
    );
    if (_.isEmpty(res)) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'event'
        }
      });
    }
    let result = res[0];
    result.id = result.eventId;
    result.createdDateTime = result.createdAtUtc;
    result.application = result.applicationId;
    return result;
  }

  async function createEventActionTemplate(context, args) {
    const input = args.input;
    let { ownerApplicationId } = input;
    if (
      _.isString(ownerApplicationId) &&
      ownerApplicationId.toLowerCase() === 'system'
    ) {
      // system events can only be manually added at the moment
      // but once they're available, we should allow template
      // to reference those system events.
    } else {
      await _verifyAppOwnership(input.ownerApplicationId, args.organizationId);
    }

    const clientInfo = resUtil.getClientInfo(context);
    const id = uuid.v4();

    const columnData = {
      template_id: id,
      template_name: input.name,
      organization_id: args.organizationId,
      application_id: input.ownerApplicationId,
      input_type: input.inputType,
      input_validation: input.inputValidation,
      input_attributes: input.inputAttributes,
      action_type: input.actionType,
      action_destination: input.actionDestination,
      action_validation: input.actionValidation,
      action_attributes: input.actionAttributes,
      created_by: clientInfo.id
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.event_action_template',
      columnData,
      selectEventActionTemplateColumns
    );

    // write row to database
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return res[0];
  }

  async function updateEventActionTemplate(context, args) {
    const input = args.input;
    const clientInfo = resUtil.getClientInfo(context);
    const columnData = {
      template_name: input.name,
      input_validation: input.inputValidation,
      input_attributes: input.inputAttributes,
      action_destination: input.actionDestination,
      action_validation: input.actionValidation,
      action_attributes: input.actionAttributes,
      updated_by: clientInfo.id,
      updated_at_utc: moment(Date.now()).toISOString()
    };

    const { sql, values } = mainUtil.makeUpdateSql(
      'event_trigger.event_action_template',
      columnData,
      selectEventActionTemplateColumns,
      `template_id = '${input.id}' AND organization_id = '${args.organizationId}'`
    );

    const dbconn = serviceContext.dbConnections['core'].write;
    const [result] = await dbconn.map(sql, values, mapper.camelizeRootKeys);
    if (!result) {
      throw new errors.NotFound({
        message: 'The event action template by that ID is not found',
        data: {
          objectId: input.id
        }
      });
    }

    return result;
  }

  async function eventActionTemplate(context, args) {
    const query = `SELECT ${mainUtil.makeSelectClause(
      selectEventActionTemplateColumns
    )}  FROM event_trigger.event_action_template
        WHERE template_id = $1 AND organization_id = $2`;

    const [result] = await serviceContext.dbConnections['core'].read.map(
      query,
      [args.id, args.organizationId],
      mapper.camelizeRootKeys
    );
    if (!result) {
      throw new errors.NotFound({
        message: 'The event action template by that ID is not found',
        data: {
          objectId: args.id
        }
      });
    }
    return result;
  }

  async function eventActionTemplates(context, args) {
    const {
      inputType,
      actionType,
      ownerApplicationId,
      organizationId,
      offset = 0,
      limit = 30
    } = args;

    const filters = [];
    const params = [];
    const paging = [];

    params.push(organizationId);
    filters.push(`organization_id = $${params.length}`);
    if (ownerApplicationId) {
      if (ownerApplicationId !== 'system') {
        await _verifyAppOwnership(ownerApplicationId, organizationId);
      }
      params.push(ownerApplicationId);
      filters.push(`application_id = $${params.length}`);
    }

    if (inputType) {
      params.push(inputType);
      filters.push(`input_type = $${params.length}`);
    }
    if (actionType) {
      params.push(actionType);
      filters.push(`action_type = $${params.length}`);
    }
    params.push(offset);
    paging.push(`OFFSET $${params.length}`);
    params.push(limit);
    paging.push(`LIMIT $${params.length}`);

    const query = `
      SELECT ${mainUtil.makeSelectClause(selectEventActionTemplateColumns)}
      FROM event_trigger.event_action_template
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

  async function subscribeEvent(context, args) {
    const input = args.input;
    const inputScope = _.get(input, 'scope', subscriptionScope.Organization);
    const isAppScope = inputScope === subscriptionScope.Application;
    const orgId = resUtil.getOrgFromAuthContext(context);
    let subscriptionOrgId = isAppScope
      ? ASSOCIATED_WITH_APPLICATION
      : orgId
      ? orgId
      : -1;
    // prefer transaction in context
    const tx = context.tx || serviceContext.dbConnections['core'].write;
    // check app org if subscribing to none public (system) events
    if (input.application.toLowerCase() !== 'system') {
      await _verifyAppOwnership(input.application, args.organizationId);
    }

    if (isAppScope && !validator.isUUID(input.application)) {
      if (
        !(
          input.application.toLowerCase() === 'system' &&
          resUtil.isSuperAdmin(context._authInfo)
        )
      ) {
        throw new errors.InvalidInput({
          message: 'Invalid applicationId.',
          data: {
            application: input.application,
            scope: inputScope
          }
        });
      } else {
        subscriptionOrgId = orgId ? orgId : -1;
      }
    }

    // allow:
    // - subscribe to all events under an app
    // - subscribe to all events under an app and group `eventType`
    if (!_.isEmpty(input.eventName) && _.isEmpty(input.eventType)) {
      throw new errors.InvalidInput({
        message: 'Must specify eventType if eventName is used',
        data: {
          eventName: input.eventName,
          eventType: input.eventType
        }
      });
    }

    if (!_verifyTargetParams(input.delivery.name, input.delivery.params)) {
      throw new errors.InvalidInput({
        message: `delivery param is not compatible with the provided target ${input.delivery.name}`,
        data: {
          delivery: input.delivery
        }
      });
    }

    const hashObj = {
      eventName: input.eventName,
      eventType: input.eventType,
      application: input.application,
      organizationId: subscriptionOrgId,
      target: input.delivery.name,
      params: input.delivery.params
    };

    if (input.conditions) {
      hashObj.conditions = input.conditions;
    }

    const subscriptionHash = hash(hashObj);

    let params = [subscriptionHash];
    let query = `SELECT event_subscription_id
                  FROM event_trigger.event_subscription
                  WHERE subscription_hash = $1`;
    const subRes = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.camelizeRootKeys
    );
    if (!_.isEmpty(subRes)) {
      // if the subscription with the same hash is found return that id
      return subRes[0].eventSubscriptionId;
    }

    // check if the event being subscribed to exists
    // skip if using org wide app wildcard
    if (input.application !== '*') {
      let params = [input.application];
      let query = `SELECT ${mainUtil.makeSelectClause(selectData)}
                  FROM event_trigger.event
                  WHERE application_id = $1`;
      if (!_.isEmpty(input.eventName)) {
        query += `AND event_name = $${params.push(input.eventName)} `;
      }
      if (!_.isEmpty(input.eventType)) {
        query += `AND event_type = $${params.push(input.eventType)} `;
      }
      const eventRes = await serviceContext.dbConnections['core'].read.map(
        query,
        params,
        mapper.camelizeRootKeys
      );
      if (_.isEmpty(eventRes)) {
        throw new errors.InvalidInput({
          message: `event does not exist for current configuration`,
          data: {
            application: input.application,
            eventName: input.eventName,
            eventType: input.eventType
          }
        });
      }
    }

    if (input.conditions) {
      const conditionError = isValidConditions(input.conditions);
      if (conditionError) {
        throw new errors.InvalidInput({
          message: `subscription conditions error ${conditionError.message}`,
          data: {
            conditions: input.conditions
          }
        });
      }
    }

    const clientInfo = resUtil.getClientInfo(context);

    const columnData = {
      event_name: input.eventName,
      event_type: input.eventType,
      organization_id: subscriptionOrgId,
      application_id: input.application,
      target_name: input.delivery.name,
      consumer_params: input.delivery.params,
      conditions: input.conditions,
      created_by: clientInfo.id,
      updated_by: clientInfo.id,
      description: input.description,
      subscription_hash: subscriptionHash,
      scope: inputScope
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'event_trigger.event_subscription',
      columnData,
      {
        event_subscription_id: null
      }
    );
    // write row to database
    const res = await tx.map(sql, values, mapper.camelizeRootKeys);
    await emitInternalCacheUpdate(context);

    return res[0].eventSubscriptionId;
  }

  // TODO: Before this refactor is done,
  // any potential issues it may cause should be evaluated
  // refer to https://github.com/veritone/aiware-core/pull/2032 for more details
  // for more info on the progess of this refactor see the issue https://veritone.atlassian.net/browse/AWT-12043

  // async function subscribeEvent(context, args) {
  //   const res = await batchSubscribeEvent(context, {
  //     input: [args.input],
  //     organizationId: args.organizationId
  //   });
  //   return res[0];
  // }

  async function batchSubscribeEvent(context, args) {
    const inputs = args.input;
    const processedInputs = inputs.map((input) => {
      const inputScope = _.get(input, 'scope', subscriptionScope.Organization);
      const isAppScope = inputScope === subscriptionScope.Application;
      const subscriptionOrgId = isAppScope
        ? ASSOCIATED_WITH_APPLICATION
        : args.organizationId || resUtil.getOrgFromAuthContext(context);

      return { inputScope, isAppScope, subscriptionOrgId };
    });

    // prefer transaction in context
    const tx = context.tx || serviceContext.dbConnections['core'].write;

    // check app org if subscribing to none public (system) events
    const inputAppIdsToVerify = inputs.filter(
      (input) => input.application.toLowerCase() !== 'system'
    );
    if (inputAppIdsToVerify.length > 0) {
      await _batchVerifyAppOwnership(
        inputAppIdsToVerify.map((input) => input.application),
        args.organizationId
      );
    }

    const invalidAppIds = processedInputs
      .filter(
        (processedInput, index) =>
          processedInput.isAppScope &&
          !validator.isUUID(inputs[index].application)
      )
      .map((processedInput, index) => ({
        application: inputs[index].application,
        scope: processedInput.inputScope
      }));
    if (invalidAppIds.length > 0) {
      throw new errors.InvalidInput({
        message: 'Invalid applicationId.',
        data: invalidAppIds
      });
    }

    // allow:
    // - subscribe to all events under an app
    // - subscribe to all events under an app and group `eventType`
    const invalidInputsEventNameType = inputs
      .filter(
        (input) => !_.isEmpty(input.eventName) && _.isEmpty(input.eventType)
      )
      .map((input) => ({
        eventName: input.eventName,
        eventType: input.eventType
      }));

    if (invalidInputsEventNameType.length > 0) {
      throw new errors.InvalidInput({
        message: 'Must specify eventType if eventName is used',
        data: invalidInputsEventNameType
      });
    }

    const invalidInputsDelivery = inputs
      .filter(
        (input) =>
          !_verifyTargetParams(input.delivery.name, input.delivery.params)
      )
      .map((input) => ({
        delivery: input.delivery
      }));

    if (invalidInputsDelivery.length > 0) {
      throw new errors.InvalidInput({
        message: `delivery param is not compatible with the provided targets ${invalidInputsDelivery
          .map(({ delivery }) => delivery && delivery.name)
          .join(', ')}`,
        data: invalidInputsDelivery
      });
    }

    const res = Array(inputs.length).fill(null);
    const hashList = inputs.map((input, index) => {
      const hashObj = {
        eventName: input.eventName,
        eventType: input.eventType,
        application: input.application,
        organizationId: processedInputs[index].subscriptionOrgId,
        target: input.delivery.name,
        params: input.delivery.params
      };

      if (input.conditions) {
        hashObj.conditions = input.conditions;
      }

      const subscriptionHash = hash(hashObj);
      return subscriptionHash;
    });

    let params = [hashList];
    let query = `SELECT event_subscription_id, subscription_hash
                  FROM event_trigger.event_subscription
                  WHERE subscription_hash = ANY($1)`;
    const subRes = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.camelizeRootKeys
    );
    if (!_.isEmpty(subRes)) {
      // if the subscription with the same hash is found return that id
      subRes.forEach((sub) => {
        const hashIndex = hashList.indexOf(sub.subscriptionHash);
        if (hashIndex === -1 || hashIndex >= res.length) {
          throw new errors.InternalServerError({
            message: `hash value returned from database ${sub.subscriptionHash} does not match any computed hash value from hashlist: ${hashList}`,
            data: { subscriptionHash: sub.subscriptionHash, hashList }
          });
        }
        res[hashIndex] = sub.eventSubscriptionId;
      });
    }

    // retrieve a list of valid events for given inputs
    let validEventParams = [];
    let validEventQuery = `SELECT ${mainUtil.makeSelectClause(selectData)}
                            FROM event_trigger.event`;
    inputs.forEach((input, index) => {
      //skip if using org wide app wildcard
      if (input.application === '*') {
        return;
      }

      validEventQuery += ` ${
        index === 0 ? 'WHERE' : 'OR'
      } (application_id IN ($${validEventParams.push(
        input.application
      )}, $${validEventParams.push('system')})`;
      if (!_.isEmpty(input.eventName)) {
        validEventQuery += ` AND event_name = $${validEventParams.push(
          input.eventName
        )} `;
      }
      if (!_.isEmpty(input.eventType)) {
        validEventQuery += ` AND event_type = $${validEventParams.push(
          input.eventType
        )} `;
      }
      validEventQuery += ')';
    });

    const validEvents = await serviceContext.dbConnections['core'].read.map(
      validEventQuery,
      validEventParams,
      mapper.camelizeRootKeys
    );

    // check if the event being subscribed to exists
    // skip if using org wide app wildcard
    // Step 1: Prepare a Set with all valid inputs
    const validInputsSet = new Set();

    inputs.forEach((input, index) => {
      validEvents.some((event) => {
        const isApplicationValid =
          _.isNil(input.application) ||
          event.applicationId === input.application ||
          event.applicationId === 'system';
        const isEventNameValid =
          _.isNil(input.eventName) || event.eventName === input.eventName;
        const isEventTypeValid =
          _.isNil(input.eventType) || event.eventType === input.eventType;

        if (isApplicationValid && isEventNameValid && isEventTypeValid) {
          validInputsSet.add(index);
          return true;
        }
        return false;
      });
    });

    // Step 2: Filter inputs based on the Set
    const invalidInputsMissingEvent = inputs.filter((input, index) => {
      return !(
        validInputsSet.has(index) ||
        res[index] !== null ||
        input.application === '*'
      );
    });

    if (invalidInputsMissingEvent.length > 0) {
      throw new errors.InvalidInput({
        message: `event does not exist for current configuration`,
        data: invalidInputsMissingEvent.map((input) => ({
          application: input.application,
          eventName: input.eventName,
          eventType: input.eventType
        }))
      });
    }

    // validate conditions
    let conditionErrors = [];
    inputs.forEach((input, index) => {
      if (input.conditions) {
        const conditionError = isValidConditions(input.conditions);
        if (conditionError) {
          conditionErrors.push({
            message: conditionError.message,
            conditions: input.conditions
          });
        }
      }
    });

    if (conditionErrors.length > 0) {
      throw new errors.InvalidInput({
        message: `subscription conditions error: ${conditionErrors[0].message}`,
        data: conditionErrors
      });
    }

    const clientInfo = resUtil.getClientInfo(context);

    const columnData = inputs
      .filter((input, index) => res[index] === null)
      .map((input, index) => ({
        event_subscription_id: input.id,
        event_name: input.eventName,
        event_type: input.eventType,
        organization_id: processedInputs[index].subscriptionOrgId,
        application_id: input.application,
        target_name: input.delivery.name,
        consumer_params: input.delivery.params,
        conditions: input.conditions,
        created_by: clientInfo.id,
        updated_by: clientInfo.id,
        description: input.description,
        subscription_hash: hashList[index],
        scope: processedInputs[index].inputScope
      }));
    if (columnData.length !== 0) {
      const { sql, values } = mainUtil.makeInsertSql(
        'event_trigger.event_subscription',
        columnData,
        {
          event_subscription_id: null,
          subscription_hash: null
        }
      );
      // write row to database
      const insertRes = await tx.map(sql, values, mapper.camelizeRootKeys);
      await emitInternalCacheUpdate(context);

      insertRes.forEach((insert) => {
        const hashIndex = hashList.indexOf(insert.subscriptionHash);
        if (hashIndex === -1 || hashIndex >= res.length) {
          throw new errors.InternalServerError({
            message: `hash value returned from database ${insert.subscriptionHash} does not match any computed hash value from hashlist: ${hashList}`,
            data: { subscriptionHash: insert.subscriptionHash, hashList }
          });
        }
        res[hashIndex] = insert.eventSubscriptionId;
      });
    }

    return res;
  }

  async function unsubscribeEvent(context, args) {
    const query = `
      DELETE FROM
        event_trigger.event_subscription
      WHERE
        event_subscription_id = $1 AND
        organization_id = $2
      RETURNING
        event_subscription_id
    `;
    // prefer transaction in context
    const tx = context.tx || serviceContext.dbConnections['core'].write;
    const res = await tx.map(
      query,
      [args.id, args.organizationId],
      mapper.camelizeRootKeys
    );
    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id
        }
      });
    }

    await emitInternalCacheUpdate(context);
    return {
      id: args.id,
      message: 'Unsubscribed from event'
    };
  }

  // TODO: This refactor should be done when we are confident that the batchUnsubscribeEvent is working as expected
  // async function unsubscribeEvent(context, args) {
  //   const res = await batchUnsubscribeEvent(context, {
  //     ids: [args.id],
  //     organizationId: args.organizationId
  //   });
  //   return res[0];
  // }

  async function batchUnsubscribeEvent(context, args) {
    const query = `
      DELETE FROM
        event_trigger.event_subscription
      WHERE
        event_subscription_id = ANY($1::uuid[]) AND
        organization_id = $2
      RETURNING
        event_subscription_id
    `;

    const camelizeRootKeysAndMapValues = (input) => {
      const camelizedRootKeysObj = mapper.camelizeRootKeys(input);
      return {
        id: camelizedRootKeysObj.eventSubscriptionId,
        message: 'Unsubscribed from event'
      };
    };

    // prefer transaction in context
    const tx = context.tx || serviceContext.dbConnections['core'].write;
    const res = await tx.map(
      query,
      [args.ids, args.organizationId],
      camelizeRootKeysAndMapValues
    );
    if (res.length !== args.ids.length) {
      throw new errors.NotFound({
        data: {
          objectIds: _.difference(
            args.ids,
            _.map(res, (r) => r.id)
          )
        }
      });
    }

    await emitInternalCacheUpdate(context);
    return res;
  }

  async function eventSubscription(context, args) {
    const tokenType = resUtil.getTokenType(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isAllowedToQueryWithoutOrg = tokenType === 'internal' || isSuperAdmin;

    let filters = [];
    let params = [];

    if (_.isNil(args.organizationId) && !isAllowedToQueryWithoutOrg) {
      throw new errors.InvalidInput({
        message:
          'An organization ID is required to query the event subscription, but none was provided'
      });
    }

    if (!_.isNil(args.organizationId)) {
      mainUtil.addSqlWhere(
        'organization_id',
        args.organizationId,
        filters,
        params
      );
    }

    mainUtil.addSqlWhere('event_subscription_id', args.id, filters, params);

    let query = `
      SELECT ${mainUtil.makeSelectClause(selectSubscriptionColumns)}
      FROM event_trigger.event_subscription
    `;

    if (!_.isEmpty(filters)) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    const res = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.camelizeRootKeys
    );
    if (_.isEmpty(res)) {
      throw new errors.NotFound({
        message: 'The event subscription was not found.',
        data: {
          objectId: args.id,
          objectType: 'EventSubscription'
        }
      });
    }
    let result = res[0];
    result.id = result.eventSubscriptionId;
    result.createdDateTime = result.createdAtUtc;
    return result;
  }

  async function eventSubscriptions(context, args) {
    const { ids = [], eventType, eventName, offset = 0, limit = 30 } = args;
    const filters = [];
    const params = [];
    const paging = [];
    let subscriptionOrgId = args.orgId || args.organizationId;

    // when filtering by Application scope and no organizationId is supplied,
    // obtain all subscriptions of appId.
    if (args.scope === subscriptionScope.Application && _.isNil(args.orgId)) {
      subscriptionOrgId = ASSOCIATED_WITH_APPLICATION;
    }

    const tokenType = resUtil.getTokenType(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isAllowedToQueryWithoutOrg = tokenType === 'internal' || isSuperAdmin;

    if (_.isNil(subscriptionOrgId) && !isAllowedToQueryWithoutOrg) {
      throw new errors.InvalidInput({
        message:
          'An organization ID is required to query event subscriptions, but none was provided'
      });
    }

    if (!_.isNil(subscriptionOrgId)) {
      mainUtil.addSqlWhere(
        'organization_id',
        subscriptionOrgId,
        filters,
        params
      );
    }

    mainUtil.addSqlWhere('application_id', args.appId, filters, params);
    mainUtil.addSqlWhere('scope', args.scope, filters, params);

    if (ids.length > 0) {
      if (eventType || eventName) {
        throw new errors.InvalidInput({
          message:
            'ids filter disables other filters. Please remove eventType and eventName params',
          data: { eventType, eventName }
        });
      }
      const holders = [];
      for (let id of ids) {
        params.push(id);
        holders.push(`$${params.length}`);
      }
      filters.push(`event_subscription_id IN (${holders.join(',')})`);
    } else {
      if (eventType) {
        params.push(eventType);
        filters.push(`event_type = $${params.length}`);
      }
      if (eventName) {
        params.push(eventName);
        filters.push(`event_name = $${params.length}`);
      }
      params.push(offset);
      paging.push(`OFFSET $${params.length}`);
      params.push(limit);
      paging.push(`LIMIT $${params.length}`);
    }

    let query = `
      SELECT ${mainUtil.makeSelectClause(selectSubscriptionColumns)}
      FROM event_trigger.event_subscription
    `;

    if (!_.isEmpty(filters)) {
      query += ` WHERE (${filters.join(' AND ')}) `;
    }

    query += paging.join(' ');

    const results = await serviceContext.dbConnections['core'].read.map(
      query,
      params,
      mapper.mapEventSubscription
    );

    return mainUtil.toPage(args, results);
  }

  function _verifyTargetParams(target, params) {
    try {
      switch (target) {
        case 'Email':
          if (
            _.get(params, 'address', '') != '' &&
            _validateEmail(params.address)
          ) {
            params.address = params.address.toLowerCase();
            return true;
          }
          return false;
        case 'SMS':
          if (_.get(params, 'number', '') != '') {
            let phoneNumber = libPhoneNumber.parsePhoneNumberFromString(
              params.number,
              'US'
            );
            if (phoneNumber && phoneNumber.isValid()) {
              params.number = phoneNumber.formatInternational();
              return true;
            }
            return false;
          }
          return false;
        case 'Webhook':
          if (_.get(params, 'url', '') != '') {
            let encodeMethods = ['json', 'protobuf', 'protobuf_64'];
            if (!params.encoding || !encodeMethods.includes(params.encoding)) {
              // default to JSON
              params.encoding = 'json';
            }
            params.url = normalizeUrl(params.url);
            if (_.get(params, 'headers', '') != '') {
              try {
                const headers = JSON.parse(_.get(params, 'headers', ''));
                for (const item in headers) {
                  if (!_.isString(headers[item])) {
                    return false;
                  }
                }
              } catch (e) {
                return false;
              }
            }
            return true;
          }
          return false;
        case 'CreateJob':
          if (_.isEmpty(_.get(params, 'engineId'))) {
            return false;
          }
          return true;
        case 'NotificationMailbox':
          if (_.isEmpty(_.get(params, 'mailboxId'))) {
            return false;
          }
          return true;
        default:
          return false;
      }
    } catch (err) {
      logger.error('unable to normalize target parameter', err);
      return false;
    }
  }

  function _validateEmail(email) {
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  }

  async function _verifyAppOwnership(applicationId, orgId) {
    // application '*' is reserved for org wide events
    if (applicationId === '*') {
      return true;
    }
    try {
      await serviceContext.dal.application.getApplication({
        id: applicationId,
        organizationId: orgId,
        all: true,
        adminView: true
      });
    } catch (err) {
      throw new errors.NotFound({
        message: 'Unable to find application',
        data: {
          objectId: applicationId
        }
      });
    }
    return true;
  }

  // TODO: This refactor should be done when we are confident that the _batchVerifyAppOwnership is working as expected
  // async function _verifyAppOwnership(applicationId, orgId) {
  //   return _batchVerifyAppOwnership([applicationId], orgId);
  // }

  async function _batchVerifyAppOwnership(applicationIds, orgId) {
    // application '*' is reserved for org wide events
    if (applicationIds.every((id) => id === '*')) {
      return true;
    }

    try {
      await serviceContext.dal.application.getApplications({
        ids: applicationIds,
        organizationId: orgId,
        all: true,
        adminView: true
      });
    } catch (err) {
      throw new errors.NotFound({
        message: 'Unable to find application',
        data: {
          objectId: applicationIds
        }
      });
    }
    return true;
  }

  /**
   * emit `trigger_cache_update` event to `events_internal` type.
   * This allows `core-trigger-service` to update its cache and effectively
   * applies the new rules
   * @param {any} context
   * @returns
   */
  async function emitInternalCacheUpdate(context) {
    const event = {
      type: 'events_internal',
      event: 'trigger_cache_update',
      serviceName: 'core-graphql-service',
      correlationId: context.requestInfo.correlationId,
      timestampMs: Date.now()
    };
    let res;
    try {
      res = await messageUtil.emitEvent(event, 'events_internal');
    } catch (err) {
      // message will be replayed
      if (errorOnMessageFailure) throw err;
      else serviceContext.logger.warn(err);
    }
    return res;
  }

  async function emitSystemEvent(context, args) {
    const payload = args.input.payload;
    if (!payload.type) payload.type = 'apiInternal';
    if (!payload.id) {
      payload.id = uuid.v4();
    }
    let res;
    try {
      res = await messageUtil.emitEvent(payload, args.input.topic);
    } catch (err) {
      if (errorOnMessageFailure) throw err;
      else serviceContext.logger.warn(err); // event will be replayed when nsq available again
    }
    return {
      payload: res || payload,
      timestamp: res && res.timestamp ? res.timestamp : moment().toISOString(),
      topic: args.input.topic,
      id: payload.id
    };
  }

  async function emitAuditEvent(context, args) {
    const { application, payload } = args.input;
    const event = {
      id: uuid.v4(),
      event: 'audit',
      type: 'audit',
      // event.organizationId has type conflicts because we loaded both
      // string and int into this field so using nested field
      audit: {
        organizationId: parseInt(args.organizationId),
        userId: (args.userId = _.get(
          context,
          '_authInfo.userId',
          _.get(context, 'requestContext.userInfo.userId')
        )),
        application
      },
      payload
    };
    try {
      await messageUtil.emitEvent(event, 'events');
    } catch (err) {
      if (errorOnMessageFailure) throw err;
      else serviceContext.logger.warn(err); // event will be replayed when nsq available again
    }
    // TODO we need to limit properties that can go in the payload so we don't blow up elastic with too many fields
    return {
      id: event.id,
      payload
    };
  }

  async function getAuditEvents(context, args) {
    const { application, limit, offset, orderDirection, terms } = args;
    let query = _.get(args, 'query', {});
    const elasticLogClusterUri = _.get(
      serviceContext,
      'config.services.elasticLogClusterUri'
    );

    if (!_.has(query, 'bool.filter')) {
      _.set(query, 'bool.filter', []);
    }

    if (!_.isArray(query.bool.filter)) {
      _.set(query, 'bool.filter', [query.bool.filter]);
    }

    if (args.organizationId) {
      query.bool.filter.push({
        term: {
          'audit.organizationId': args.organizationId
        }
      });
    }

    if (application) {
      query.bool.filter.push({
        term: {
          'audit.application': application
        }
      });
    }

    if (_.isArray(terms)) {
      for (const term of terms) {
        for (const [key, val] of Object.entries(term)) {
          const payloadKey = `payload.${key}`;
          query.bool.filter.push({
            term: {
              [payloadKey]: val
            }
          });
        }
      }
    }

    const options = {
      uri: elasticLogClusterUri + 'events-audit-*/_search',
      method: 'POST',
      headers: {
        'kbn-xsrf': 'audit'
      },
      body: {
        size: limit,
        from: offset,
        sort: {
          '@timestamp': {
            order: orderDirection,
            unmapped_type: 'boolean'
          }
        },
        query
      },
      json: true
    };

    try {
      const response = await rp(options);
      const hits = _.get(response, 'hits.hits', []).map((hit) =>
        _.get(hit, '_source')
      );
      return mainUtil.toPage(args, hits);
    } catch (err) {
      logger.error(err);
      throw new errors.InternalServerError({
        message:
          'Unable to retrieve audit events. Please review your query and try again.',
        data: {
          query,
          internalData: {
            error: err
          }
        }
      });
    }
  }

  async function markSubscriptionDeletedByJob(context, args) {
    const markDeleteRedisShareKey = _.get(
      config,
      'subscription.markDeleteRedisShareKey',
      'SubscriptionMarkDeleteList'
    );
    const subscriptionShareTtls = _.get(config, 'subscription.ttl', 3600); // in seconds
    const jobId = _.get(args, 'jobId');

    if (_.isNil(jobId)) {
      throw new errors.InvalidInput({
        message: 'jobId is required when cleanup event subscription',
        data: {
          jobId
        }
      });
    }

    const query = `
      SELECT 	es.event_subscription_id
      FROM 	  event_trigger.event_subscription es
      WHERE 	es.event_type = 'job'
        AND   (es.conditions -> 'conditions' -> 0 ->> 'field')::text = 'jobId'
        AND   (es.conditions -> 'conditions' -> 0 ->> 'value')::text = $1;
    `;
    const res = await serviceContext.dbConnections['core'].write.map(
      query,
      [jobId],
      mapper.camelizeRootKeys
    );
    let listSubscriptionLength = 0;

    if (res.length) {
      const eventSubscriptionIds = _.map(
        res,
        (item) => item.eventSubscriptionId
      );
      try {
        // push eventSubscriptionId at the end of list.
        // listSubscriptionLength is the length of list.
        const redisPushPromise = promisify(serviceContext.redisClient.rpush);
        listSubscriptionLength = await redisPushPromise(
          markDeleteRedisShareKey,
          eventSubscriptionIds
        );
        const redisExpirePromise = promisify(serviceContext.redisClient.expire);
        await redisExpirePromise(
          markDeleteRedisShareKey,
          subscriptionShareTtls
        );
      } catch (error) {
        logger.error('Fail to push subscription delete list.', error);
      }
    }

    return listSubscriptionLength;
  }

  return {
    batchCreateEvents,
    batchUpdateEvents,
    createEvent,
    updateEvent,
    events,
    event,
    batchSubscribeEvent,
    batchUnsubscribeEvent,
    subscribeEvent,
    unsubscribeEvent,
    eventSubscription,
    eventSubscriptions,
    createEventActionTemplate,
    updateEventActionTemplate,
    eventActionTemplate,
    eventActionTemplates,
    emitEvent,
    emitSystemEvent,
    emitAuditEvent,
    getAuditEvents,
    markSubscriptionDeletedByJob,
    emitInternalCacheUpdate,
    _getDefinition
  };
};
