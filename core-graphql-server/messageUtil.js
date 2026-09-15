const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');
const buildInfo = require('./buildinfo.js');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const { Context, decorate } = require('@veritone/ts-messaging-lib/lib');
const { Messager } = require('@veritone/ts-messaging-lib/lib/nsq');
const moment = require('moment');
const process = require('process');
const {
  eventsMap,
  eventNamesChange,
  supportedEvents
} = require('@veritone/core-server-base/events-map.js');

/**
 */
module.exports = function createModule(serviceContext) {
  const app = serviceContext.app;
  const config = serviceContext.config;
  const messaging = serviceContext.messagingV2;
  const serverHostname = os.hostname();
  const containerInfo = require('./containerInfo.js')().getInfo();
  const resUtil = require('./resolvers/util.js')(serviceContext);
  const logger = serviceContext.logger;

  // Event consts
  const eventActionResult = {
    SUCCESS: 'success',
    FAILURE: 'failure'
  };

  const okErrors = [
    'object_limit_exceeded',
    'rate_limited',
    'not_found',
    'not_allowed',
    'authentication_error',
    'not_implemented',
    'resource_conflict',
    'invalid_input'
  ];

  /* configurable mapping of local event types to topics.
     default is null/undefined - no event emitted.

    unexpectedError,
    error,
    heartbeat,
    request,
    serviceStartStop,
    memEvent
  */
  const eventTypeTopics = _.get(
    serviceContext,
    'config.server.messageTypeTopics',
    {
      unexpectedError: 'events',
      serviceStartStop: 'events',
      memEvent: 'events',
      heartbeat: 'events'
    }
  );

  if (!(messaging || _.get(config, 'messaging.disableV2', false))) {
    throw new Error('messaging not initialized');
  }

  const maxErrorMessageLength = _.get(
    config,
    'server.maxErrorMessageLength',
    2000
  );
  const maxErrorDataLength = _.get(config, 'server.maxErrorDataLength', 10000);

  function truncate(input, maxLen = maxErrorMessageLength) {
    if (!input) return '';
    let v;
    switch (typeof input) {
      case 'string':
        v = input;
        break;
      case 'array':
        v = _.toString(input);
        break;
      case 'object':
        v = JSON.stringify(input);
        break;
      default:
        v = _.toString(input);
    }
    return v.length < maxLen ? v : v.substring(0, maxLen);
  }

  const serverBuildInfo = buildInfo.getBuildInfo();

  function writeLocation(error) {
    const errLoc = error.locations;
    if (!errLoc) return errLoc;
    if (_.isArray(errLoc)) {
      const trs = errLoc.map((loc) => `line ${loc.line} column ${loc.column}`);
      return trs.join(',');
    } else return errLoc;
  }

  function writePath(error) {
    return _.isArray(error.path) ? error.path.join('.') : error.path;
  }

  const errorLevelMap = {
    not_found: 'warn'
  };

  function _getErrorLevel(errorName) {
    if (_.isNil(errorName)) {
      return 'error';
    }
    return _.get(errorLevelMap, errorName, 'error');
  }

  async function emitErrorEvent(error, errorName) {
    const name = errorName || error.name;
    let data = error.data;
    let dataLen = 0;
    if (!_.isNil(data)) {
      try {
        dataLen = JSON.stringify(data).length;
      } catch (serializationErr) {
        // error.data can carry non-serializable structures (circular TLS
        // certificate chains, sockets). The error event must never mask the
        // original error by throwing inside the error handler.
        data = {
          dataUnserializable: true,
          serializationError: serializationErr.message
        };
      }
    }
    if (data && dataLen > maxErrorDataLength) {
      data = {
        dataLength: dataLen,
        maxErrorDataLength,
        dataOmitted: true
      };
    }

    const event = {
      id: _.get(error, 'data.errorId') || uuidv4(),
      timestampMs: Date.now(),
      event: 'error',
      level: _getErrorLevel(name),
      serviceName: 'core-graphql-server',
      serverHostname,
      success: false,
      type: 'api',
      errorName: name,
      graphqlPath: writePath(error),
      graphqlLocation: writeLocation(error),
      isUnexpected: !okErrors.includes(name),
      isOutOfBand: error.isOutOfBand === true,
      isInternalTokenError: error.isInternalTokenError === true,
      isEngineJwtError: error.isEngineJwtError === true,
      isFatal: error.isFatal === true,
      timeThrown: error.time_thrown,
      message: truncate(error.message, maxErrorMessageLength),
      errorId: error.data ? error.data.errorId : '',
      serverBuildInfo,
      errorData: data,
      httpStatusCode: error.httpStatusCode,
      requestId: error.data ? error.data.requestId : '',
      correlationId: error.data ? error.data.correlationId : '',
      stack: truncate(error.stack, maxErrorMessageLength)
    };
    // add container info for unexpected errors
    if (event.isUnexpected) {
      event.containerInfo = containerInfo;
    }
    const topic =
      event.isUnexpected || event.isInternalTokenError || event.isEngineJwtError
        ? eventTypeTopics.unexpectedError
        : eventTypeTopics.error;
    await emitEvent(event, topic);
  }

  // rebuild event info: the type of event should be lowercase
  function _getEventInfoToEmitEvent(inputEvent, topic = null) {
    let event = _.cloneDeep(inputEvent);

    const hasTopic = !_.isNil(topic);
    event.eventEmitted = hasTopic;
    if (_.isNil(event.id)) event.id = uuidv4();
    if (_.isNil(event.type)) event.type = 'api';

    if (_.isNil(event.serviceName)) event.serviceName = 'core-graphql-server';
    if (_.isNil(event.timestampMs)) event.timestampMs = Date.now().valueOf();
    if (_.isNil(event.timestamp))
      event.timestamp = moment(parseInt(event.timestampMs, 10)).toISOString();
    if (hasTopic) event.eventTopic = topic;
    if (_.isNil(event.level)) {
      if (event.query && event.query.includes('query IntrospectionQuery')) {
        event.level = 'trace';
      } else {
        // info level for the final successful response
        // failed requests will already have higher event.level set
        event.level = event.event === 'request' ? 'debug' : 'trace';
      }
    }

    return event;
  }

  // emit an event
  async function emitEvent(inputEvent, topic = null, delay = 0) {
    const event = _getEventInfoToEmitEvent(inputEvent, topic);
    const hasTopic = event.eventEmitted;
    const msg = JSON.stringify(event);
    if (_.isFunction(app.logger[event.level])) {
      app.logger[event.level](msg);
    } else {
      app.logger.trace(msg);
    }

    // safeguard against E_BAD_MESSAGE PUB message size too big errors and disconnect from nsq
    // 1048576 = 1MB
    if (msg.length > 1048576) {
      app.logger.error(
        'Trying to emit overly large message that will be rejected from NSQ!',
        truncate(msg, maxErrorMessageLength)
      );
      throw new Error('Event size too large', event.type, topic);
    }
    // VTN-10958
    if (hasTopic) {
      try {
        const done = await messaging.produce(
          Context,
          new Messager(msg, topic, delay)
        );
        serviceContext.metrics.incrementCounter('messageEmitted');
        return event;
      } catch (err) {
        serviceContext.metrics.incrementCounter('messageFailed');
        // note that fatalErrors.js will detect repeated failures and crash.
        app.logger.error(
          'EVENT ERR',
          err,
          truncate(msg, maxErrorMessageLength)
        );
        throw err;
      }
    }
    return msg;
  }

  /**
   * Emit public event
   * @param {*} eventName the event name
   * @param {*} appId appId
   * @param {*} reqContext the request context
   * @param {*} event the data to create an event to emit. It includes the actionInfo (actionInfo { actionName, actionResult: success/ failure, actionDetails: string, targetId: string, targetType })
   * @param {*} delay the delay time
   * @returns nothing, just emit the public event
   */
  async function emitPublicEvent(eventName, appId, reqContext, event, delay) {
    // emits audit log event on match using eventNamesChange[eventName]
    const newEventName = _.get(eventNamesChange, eventName);
    if (newEventName && _.get(eventsMap, newEventName)) {
      const newEvent = _.cloneDeep(event);
      newEvent.event = eventsMap[newEventName].event;
      // only replace type if original event is set
      if (newEvent.type) {
        newEvent.type = eventsMap[newEventName].type;
      }
      emitPublicEvent(newEventName, appId, reqContext, newEvent, delay);
    }

    // build vt Event
    const vtEvent = buildVtEvent(eventName, appId, reqContext, event);
    if (_.isNil(vtEvent)) {
      return null;
    }
    let res;
    try {
      res = await messaging.produce(
        Context,
        new Messager(vtEvent, 'public', delay)
      );
      serviceContext.metrics.incrementCounter('messageEmitted');
    } catch (err) {
      serviceContext.metrics.incrementCounter('messageFailed');
    }
    return res;
  }

  /**
   * Build the Vt event to emit
   * @param {*} eventName the event name
   * @param {*} appId the application id, the default value is 'system'
   * @param {*} reqContext the request context
   * @param {*} payload the event data
   * @returns the Vt event: { core, trace, baggage, callerInfo, actionInfo, data }
   */
  function buildVtEvent(eventName, appId, reqContext, payload) {
    let event;
    try {
      event = _.get(eventsMap, eventName);
      if (!event) {
        logger.warn(
          `Could not match event "${eventName}" to emit audit event.`
        );
        // emit unknown audit event that should carry type to trace it back
        event = _.get(eventsMap, 'Unknown', {});
      }

      const eventDataType = events[event.name];
      if (_.isNil(eventDataType)) {
        logger.warn(
          `the event type was not found by event name '${eventName}'`
        );
        return null;
      }
      const protoPayload = eventDataType.create(payload);
      const core = _buildCore(reqContext, event, payload, appId);
      const message = {
        data: eventDataType.encode(protoPayload).finish(),
        obj: protoPayload
      };

      // callerInfo
      const callerInfo = getCallerInfo(reqContext);

      // actionInfo
      const actionInfo = getActionInfo(payload, event);

      // check org info
      if (
        (_.isNil(core.organizationId) || core.organizationId === '') &&
        !_.isNil(callerInfo.organizationId)
      ) {
        core.organizationId = callerInfo.organizationId;
      }

      // normalize the "no org" sentinel to 'n/a' AFTER caller-org enrichment, so a
      // real caller org is preserved while the empty/'N/A' cases match
      // core-server-base's 'n/a' (audit-log.js)
      if (
        _.isNil(core.organizationId) ||
        core.organizationId === '' ||
        core.organizationId === 'N/A'
      ) {
        core.organizationId = 'n/a';
      }

      // the input format: decorate(message, core, callerInfo, actionInfo)
      return decorate(message, core, callerInfo, actionInfo);
    } catch (err) {
      logger.error(
        `failed to build VtEvent for '${eventName}', event: ${event}`,
        err
      );
      return null;
    }
  }

  /**
   * Get caller info
   * the format: message CallerInfo {
   *	string userId = 1;
   *	string userName = 2;
   *	string requestIP = 3;
   *	string userAgent = 4;
   *	string organizationId = 5;
   *	string originatorApplication = 6;
   *	string originatorService = 7;
   *	string impersonatorUserId = 8;
   *  }
   * @param {*} reqContext the current request context
   * @returns the caller info
   */
  function getCallerInfo(reqContext) {
    const result = {
      userId: null,
      userName: null,
      requestIP: null,
      userAgent: null,
      organizationId: 'N/A',
      originatorApplication: null,
      originatorService: 'core-graphql-server',
      impersonatorUserId: null
    };
    if (_.isNil(reqContext)) {
      return result;
    }

    const requestInfo = _.get(reqContext, 'requestInfo');
    const authInfo = _.get(reqContext, '_authInfo');
    const requestContext = _.get(reqContext, 'requestContext');
    const impersonatorUserId =
      _.get(reqContext, '_authInfo.impersonatorId') || null;

    if (!_.isNil(requestInfo)) {
      result.requestIP = requestInfo.clientIP;
      result.userAgent = requestInfo.userAgent;
    }

    if (!_.isNil(authInfo)) {
      result.organizationId = _.toString(
        resUtil.getOrgFromAuthContext(authInfo)
      );
      result.userId = authInfo.userId;
      result.userName = authInfo.userName;
    }
    if (_.isNil(result.organizationId) || result.organizationId === '') {
      result.organizationId = 'N/A';
    }

    if (!_.isNil(requestContext)) {
      result.originatorApplication = requestContext.appId;
    }
    // add impersonatorUserId to each impersonated operation log
    if (!_.isNil(impersonatorUserId)) {
      result.impersonatorUserId = impersonatorUserId;
    }

    return result;
  }

  /**
   * Get action info for the event
   *  message ActionInfo {
   *  //  operation performed by the user, e.g.: "Login"
   *  string actionName = 1;
   *  //  'succes' or 'failure'
   *  string actionResult = 2;
   *  //  additional action/result details, error messages, etc
   *  string actionDetails = 3;
   *  //  could be TDO.id, job.id, etc
   *  string targetId = 4;
   *  //  see TargetType enum
   *  TargetType targetType = 5;
   *  }
   * @param {*} eventData the data of event
   * @param {*} _eventTypeInfo  the event type info
   * @returns the action info
   */
  function getActionInfo(eventData, _eventTypeInfo) {
    const defaultActionInfo = {
      actionName: null,
      actionResult: null,
      actionDetails: null,
      targetId: null,
      targetType: null
    };

    let eventTypeInfo = _eventTypeInfo;
    if (_.isNil(eventTypeInfo) || typeof eventTypeInfo === 'string') {
      eventTypeInfo = {};
    }

    if (_.isNil(eventData)) {
      return defaultActionInfo;
    }
    const result = eventData.actionInfo || defaultActionInfo;

    if (_.isNil(result.actionName)) {
      result.actionName = eventTypeInfo.action;
    }
    // check error
    if (!_.isNil(result.error)) {
      if (_.isNil(result.actionDetails)) {
        result.actionDetails = `${result.error}`;
      }

      result.actionResult = eventActionResult.FAILURE;
    }
    if (_.isNil(result.actionResult)) {
      result.actionResult = eventActionResult.SUCCESS;
    }
    if (_.isNil(result.targetId)) {
      result.targetId = eventData.id;
    }
    result.targetId = `${result.targetId || 'N/A'}`;
    if (_.isNil(result.targetType)) {
      result.targetType = eventTypeInfo.targetType;
    }

    return result;
  }

  /**
   * build action info from the input
   * @param {*} targetId targetId
   * @param {*} error the error if we have (optional)
   * @param {*} actionName actionName (optional)
   * @param {*} actionResult success/ failure (optional). The value will be set base on the error
   * @param {*} actionDetails the detail message (optional)
   * @param {*} targetType the type of data
   * @returns the action info
   */
  function buildActionInfo(
    targetId,
    error,
    actionName,
    actionResult,
    actionDetails,
    targetType
  ) {
    return {
      actionName,
      actionResult,
      actionDetails,
      targetId: `${targetId || ''}`,
      targetType,
      error
    };
  }

  /**
   * build core wrapper for veritone event. This is a required step to enable routing
   * @param {*} reqContext request context that generates this event
   * @param {*} eventInfo the event info
   * @param {*} eventPayload the event payload
   * @param {*} appId the app id
   */
  function _buildCore(reqContext, eventInfo, eventPayload, appId) {
    const core = new events.Core();
    core.name = eventInfo.name;
    // this is required to work consistently with how core-admin's events are emitted
    core.type = eventInfo.type ?? 'event';
    core.applicationId = appId || 'system';
    core.serviceName = 'core-graphql-server';
    // leave empty when the payload has no org id so buildVtEvent's caller-org
    // enrichment can still fire; normalized to 'n/a' after that guard (VE-19358)
    core.organizationId = (
      _.get(eventPayload, 'organizationId') || ''
    ).toString();

    if (!_.isNumber(eventPayload.timestampMs))
      eventPayload.timestampMs = Date.now().valueOf();
    if (_.isNil(eventPayload.timestamp))
      eventPayload.timestamp = moment(eventPayload.timestampMs).toISOString();

    core.timestamp = eventPayload.timestamp || new Date().toISOString();
    core.correlationId = _.get(
      reqContext,
      `requestInfo.correlationId`,
      uuidv4()
    );
    core.id = uuidv4();
    return core;
  }

  /**
   * Emit an AccessMedia READ audit event for one or more media records.
   * Centralised replacement for the per-DAL _emitPublicEventAccessMedia copies.
   * Fires unconditionally for all users — no kvp gate.
   *
   * @param {object} context - GraphQL request context
   * @param {object|object[]} media - single record or array of records
   * @param {string} mediaType - resource type label, e.g. 'recording', 'asset', 'watchlist'
   * @param {Error} [error] - if set, emits a failure event
   */
  function emitReadAuditEvent(context, media, mediaType, error) {
    if (_.isNil(media)) {
      return;
    }

    // Increment Prometheus counter unconditionally for all users — this is the
    // Phase 1 measurement mechanism and must fire regardless of the kvp guard below.
    const _orgId = String(_.get(context, '_authInfo.organization.organizationId', 'unknown'));
    serviceContext.metrics.incrementCounter('auditReadEvent', {
      resourceType: mediaType || 'unknown',
      orgId: _orgId
    });

    // Temporary guardrail: gate full audit event emission behind platform flag
    // to prevent ES overload in large sandboxes until read event volume is understood.
    if(!_.get(config, `featureFlags.readAuditEvents`, false)) {
      return;
    }

    try {
      const mediaArr = _.isArray(media) ? media : [media];
      for (const _media of mediaArr) {
        const idString = (
          _media.id ||
          _media.recording_id ||
          _media.asset_id ||
          _media.tracking_unit_id ||
          'n/a'
        ).toString();
        const name = _media.name || _media.metadata?.fileName;
        const event = {
          serviceName: 'core-graphql-server',
          resourceType: mediaType,
          resourceId: idString,
          resourceName: name,
          actionInfo: buildActionInfo(
            idString,
            error,
            'read',
            !error ? 'success' : 'failure',
            !error
              ? `Accessed media ${name || idString}`
              : `Failed to access ${name || idString} for reason: ${error.message}`
          )
        };
        emitPublicEvent(supportedEvents.AccessMedia, 'system', context, event);
      }
    } catch (err) {
      logger.error(`failed to emit read audit event for ${supportedEvents.AccessMedia}`, err);
    }
  }

  function emitStartupEvent(startTime) {
    const event = {
      id: uuidv4(),
      timestampMs: Date.now(),
      type: 'service',
      event: 'service_startup',
      serviceName: 'core-graphql-server',
      serverHostname,
      correlationId: uuidv4(),
      processId: process.pid,
      elapsedMs: Date.now() - startTime,
      containerInfo,
      buildInfo: serverBuildInfo
    };

    emitEvent(event, eventTypeTopics.serviceStartStop);
  }

  function emitCrashEvent(message, isCrash = true) {
    const event = {
      id: uuidv4(),
      timestampMs: Date.now(),
      type: 'service',
      event: 'service_shutdown',
      serviceName: 'core-graphql-server',
      correlationId: uuidv4(),
      processId: process.pid,
      serverHostname,
      message: truncate(message, maxErrorMessageLength),
      isCrash,
      containerInfo,
      buildInfo: serverBuildInfo
    };

    try {
      emitEvent(event, eventTypeTopics.serviceStartStop);
    } catch (err) {
      app.logger.warn(err);
    }
  }

  const topicsList = {
    EVENTS: 'events',
    EVENTS_INTERNAL: 'events_internal',
    ASSETS: 'AssetsTopic',
  };

  function topics(topic) {
    if (_.isNil(topicsList[topic]))
      throw new Error(topic + ' is not a known topic');
    return topicsList[topic];
  }

  function emitTaskQueuedEvent(
    req,
    taskId,
    taskExecutorId,
    taskExecutor,
    organizationId
  ) {
    const publicPayload = {
      serviceName: 'core-graphql-server',
      taskId: taskId,
      taskExecutorId: taskExecutorId,
      taskExecutor: taskExecutor,
      organizationId: organizationId
    };

    const eventsPayload = {
      ...eventsMap.TaskQueued,
      ...publicPayload
    };

    messaging.produce(
      new Context(),
      new Messager(JSON.stringify(eventsPayload), topicsList.EVENTS)
    );

    // emit public event
    const protoPayload = events.TaskQueued.create(eventsPayload);
    const core = _buildCore(req, eventsMap.TaskQueued, publicPayload);
    const callerInfo = getCallerInfo(req);
    const actionInfo = getActionInfo(publicPayload, eventsMap.TaskQueued);
    let vtEvent = decorate(
      {
        data: events.TaskQueued.encode(protoPayload).finish(),
        obj: protoPayload
      },
      core,
      callerInfo,
      actionInfo
    );
    try {
      messaging.produce(Context, new Messager(vtEvent, 'public'));
      serviceContext.metrics.incrementCounter('messageEmitted');
    } catch (err) {
      serviceContext.metrics.incrementCounter('messageFailed');
    }
  }

  return {
    okErrors,
    emitErrorEvent,
    emitEvent,
    emitPublicEvent,
    emitReadAuditEvent,
    emitStartupEvent,
    emitCrashEvent,
    topics,
    eventTypeTopics,
    emitTaskQueuedEvent,
    truncate,
    getActionInfo,
    getCallerInfo,
    buildActionInfo,
    _getEventInfoToEmitEvent
  };
};
