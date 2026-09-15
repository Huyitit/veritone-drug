const _ = require('lodash');
const uuid = require('uuid');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');
const nodeUtil = require('util');

/**
 * Contains the function used to wrap resolver functions and apply our own
 * global business logic, along with associated helper functions.
 */
module.exports = function createModule(serviceContext) {
  const config = serviceContext.config;
  const app = serviceContext.app;
  const util = require('./util.js')(serviceContext);
  const errors = require('../error')(config);
  const messageUtil = require('../messageUtil.js')(serviceContext);
  const logger = serviceContext.logger;
  const metrics = require('../metrics.js')(serviceContext);
  const costLimit = require('./costLimit.js')(serviceContext);

  // note:  the responseSizeLimit default should match the limit in dal/dalEngineResult.js
  const responseSizeLimit = bytes.parse(
    _.get(config, 'server.responseSizeLimit', '100mb')
  );

  // matches setting in server.js
  const timeoutS = _.get(config, 'server.requestTimeoutSec', 115);
  // we can set a specific value here. we default to the timeout setting
  // minus a few seconds so that some requests might be able to return partial data.
  const maxTimeS = _.get(
    config,
    'server.maxRequestTimeElapsedSec',
    timeoutS > 10 ? timeoutS - 4 : timeoutS
  );
  logger.info(
    'GraphQL response size limit is ' +
      responseSizeLimit +
      ' bytes (' +
      prettyBytes(responseSizeLimit) +
      ').'
  );
  logger.info(
    'Total request processing time limit is ' + maxTimeS + ' seconds'
  );

  function newErrorId() {
    return uuid.v4();
  }

  /**
   * Attempts to enforce a maximum total elapsed time per request.
   * It works by cutting off any resolver function that starts after the maximum
   * allowed clock time from the request start. All remaining fields will then
   * be null, with corresponding error messages.
   *
   * In practice this does not work well under node.js.
   * The server fires off many resolver functions in rapid succession, with
   * each then waiting on I/O. This I/O can take longer than the max time.
   * Then the resolvers all complete. Only that are started after that point
   * are subject to blocking. So the current method prevents heinous query
   * times but doesn't effectively limit to the configured time.
   *
   * It is better than nothing.
   *
   * Limit is configurable in maxRequestTimeElapsedSec and defaults above.
   *
   * Also enforces a limit on max response size, as computed at the border
   * of each resolver function execution.
   *
   * This limit is configurable in server.responseSizeLimit and defaults above.
   */
  function checkRequestTimeElapsed(context, info) {
    const requestStartTime = context.requestInfo.startTime;
    const timeElapsedMs = Date.now() - requestStartTime;
    const maxRequestMs = maxTimeS * 1000;
    const field = info.parentType + '.' + info.fieldName;

    let requestTimedOut =
      _.get(context, 'timeoutInfo.requestTimedOut', false) ||
      _.get(context, 'requestContext.timeoutInfo.requestTimedOut', false);
    if (_.isNil(requestTimedOut)) requestTimedOut = false;

    if (timeElapsedMs >= maxRequestMs) {
      const msg =
        'Maximum request time of ' +
        maxTimeS +
        's exceeded. ' +
        ' Try using a smaller page size or retrieving fewer object fields.';

      const err = new errors.RequestTimeout({
        message: msg,
        data: {
          field: field,
          maxRequestTimeElapsedSec: maxTimeS,
          requestTimeElapsedSec: timeElapsedMs / 1000,
          requestId: context.requestInfo.requestId,
          correlationid: context.requestInfo.correlationId
        }
      });
      if (requestTimedOut) {
        // if we've detected that the overall request timed out in server.js,
        // the set a value on the error. we still want to throw it, but this
        // tells the top-level error handler not to log it or emit message.
        logger.debug(
          'Request hit hard timeout in server.js. Skipping resolver timeout error.'
        );
        err.data.requestTimedOut = true;
      }

      throw err;
    }

    const curResponseSize = context.requestInfo.responseTotalSize || 0;
    if (curResponseSize >= responseSizeLimit) {
      const msg =
        'Maximum GraphQL response size of ' +
        prettyBytes(responseSizeLimit) +
        ' exceeded. Try using a smaller page size or retrieving fewer object ' +
        'fields. Fields that include engine results, asset content, or task logs ' +
        'may consume excessive memory.';
      const data = {
        field: field,
        maximumResponseSize: prettyBytes(responseSizeLimit),
        currentResponseSize: prettyBytes(curResponseSize),
        currentResponseSizeBytes: curResponseSize
      };
      if (requestTimedOut) data.requestTimedOut = true;
      throw new errors.CapacityExceeded({
        message: msg,
        data: data
      });
    }
  }

  function accumulateFieldStats(context, info, elapsed, sizeInBytes) {
    const fieldName = info.parentType + '.' + info.fieldName;

    // initialize stats object for this field on the request
    // stats on every instance of the field in the overall request
    // will be accumulated here.
    if (!context.fieldStats) context.fieldStats = {};
    if (!context.fieldStats[fieldName]) context.fieldStats[fieldName] = {};

    const thisFieldStats = context.fieldStats[fieldName];

    // increment count
    thisFieldStats.count = (thisFieldStats.count || 0) + 1;

    // compute and accumulate stats on field resolver elapsed timeout
    thisFieldStats.elapsedMsTotal =
      (thisFieldStats.elapsedMsTotal || 0) + elapsed;
    thisFieldStats.elapsedMsAverage = Math.floor(
      thisFieldStats.elapsedMsTotal / thisFieldStats.count
    );
    if (!thisFieldStats.elapsedMsMax) thisFieldStats.elapsedMsMax = elapsed;
    else if (elapsed > thisFieldStats.elapsedMsMax)
      thisFieldStats.elapsedMsMax = elapsed;
    if (!thisFieldStats.elapsedMsMin) thisFieldStats.elapsedMsMin = elapsed;
    else if (elapsed < thisFieldStats.elapsedMsMin)
      thisFieldStats.elapsedMsMin = elapsed;

    // compute and accumulate stats on field result size
    thisFieldStats.sizeInBytesTotal =
      (thisFieldStats.sizeInBytesTotal || 0) + sizeInBytes;
    thisFieldStats.sizeInBytesAverage = Math.floor(
      thisFieldStats.sizeInBytesTotal / thisFieldStats.count
    );

    if (!thisFieldStats.sizeInBytesMin)
      thisFieldStats.sizeInBytesMin = sizeInBytes;
    else if (sizeInBytes < thisFieldStats.sizeInBytesMin)
      thisFieldStats.sizeInBytesMin = sizeInBytes;

    if (!thisFieldStats.sizeInBytesMax)
      thisFieldStats.sizeInBytesMax = sizeInBytes;
    else if (sizeInBytes > thisFieldStats.sizeInBytesMax)
      thisFieldStats.sizeInBytesMax = sizeInBytes;
  }

  function getFieldStats(context) {
    return context.fieldStats;
  }

  function logFieldRequest(
    args,
    object,
    info,
    context,
    opType,
    fieldElapsedMs,
    err
  ) {
    if (
      _.get(info, 'returnType.constructor.name') === 'GraphQLScalarType' ||
      _.get(info, 'returnType.ofType.constructor.name') === 'GraphQLScalarType'
    ) {
      // don't log scalar fields, since they don't make much sense on their own.
      return;
    }
    // accumulate field reference stats. they are not reported at the field
    // level, only at the top-level request level.
    const sizeInBytes = logFieldSize(context, object);
    accumulateFieldStats(context, info, fieldElapsedMs, sizeInBytes);
    if (_.get(err, 'name') === 'request_timeout') {
      // if this is is called for a timeout error, this is already logged at the parent level.
      return;
    }

    const data = {
      objectType: info.parentType,
      returnType: info.returnType,
      field: info.fieldName,
      operation: opType,
      logType: 'REQUEST',
      correlationId: context.requestInfo.correlationId,
      requestId: context.requestInfo.requestId,
      httpUrl: context.requestInfo.httpUrl,
      clientInfo: util.getClientInfo(context),
      objectId: args.id || (object ? object.id : null), // will not always be present
      elapsedMs: fieldElapsedMs,
      status: err ? 'error' : 'ok'
    };
    if (err && err.data && err.data.errorId) data.errorId = err.data.errorId;

    //logger.debug('graphql-' + opType, data);

    // add Prometheus metrics
    metrics.incrementCounter('operation', {
      type: opType,
      operation: info.fieldName
    });

    metrics.observeHistogram('fieldTimeElapsedMs', fieldElapsedMs, {
      type: opType
    });

    // emit a message event.
    emitLogRequestEvent(
      args,
      object,
      info,
      context,
      opType,
      fieldElapsedMs,
      err
    );

    // audit log
    auditLog(args, object, info, context, opType, err);

    // emit error event if applicable
    /* now done in central error handler code in server.js
    if (err && !_.get(err, 'data.requestTimedOut')) {
      messageUtil.emitErrorEvent(err);
    }
    */
  }

  function isReturnList(info, args, action) {
    return _.toString(info.returnType).startsWith('[');
  }

  function getObjectIds(info, args, action, object) {
    const ids = [];
    // if an incoming ID was set, return that.
    if (args.id) {
      return [args.id];
    } else if (_.get(args, 'input.id')) {
      return [args.input.id];
    }
    // otherwise we need to look at the return value (for create)
    if (isReturnList(info, args, action)) {
      // look for a list/array of objects with ID
      if (_.isArray(object)) {
        object.forEach((record) => {
          if (record && record.id) ids.push(_.toString(record.id));
        });
      }
    } else {
      // look for single id on object
      if (!_.isNil(object) && object.id) ids.push(_.toString(object.id));
    }
    return ids.length ? ids : undefined;
  }

  function getObjectType(info, args, action) {
    // use the directive if there is one. otherwise default to schema return type.
    let objectType = args._audit_objectType || _.toString(info.returnType);
    // TODO later make these non-object types config driven

    if (
      !args._audit_objectType &&
      objectType === 'DeletePayload' &&
      action.startsWith('delete')
    ) {
      // attempt to determine real object type.
      // note that the three mutation prefixes we check for above all have
      // the same length, which makes this easy (even though we really only
      // care about delete)
      const typeSuffix = action.substring(6);
      if (serviceContext._schemaTypeList.includes(typeSuffix)) {
        objectType = typeSuffix;
      }
    }
    if (objectType) {
      objectType = objectType.replace('!', '');
      objectType = objectType.replace('[', '');
      objectType = objectType.replace(']', '');
    }
    return objectType;
  }

  function getAuditAction(args, info) {
    const mutation = info.fieldName;
    let action = args._audit_action; // use directive if there is one.
    if (!action) {
      // otherwise attempt to determine a default based on mutation name
      if (mutation.includes('create')) action = 'Create';
      else if (mutation.includes('update')) action = 'Update';
      else if (mutation.includes('delete')) action = 'Delete';
    }
    return action;
  }

  function auditLog(args, object, info, context, opType, error) {
    if (opType !== 'mutation') return;
    const clientInfo = util.getClientInfo(context);
    const mutation = info.fieldName;
    const action = getAuditAction(args, info);
    if (!action) return; // unknown mutation; not create/update/delete, don't need to audit.

    let objectIds = getObjectIds(info, args, action, object);
    if (!objectIds) return; // if there's no object, don't audit
    if (!objectIds.length) return;

    // use the directive if there is one. otherwise default to schema return type.
    const objectType = getObjectType(info, args, mutation);

    // we need a separate audit entry for each ID
    objectIds.forEach((objectId) => {
      const log = {
        ipAddress: context.requestInfo.clientIP,
        requestUrl: '/v3/graphql',
        userAgent: context.requestInfo.userAgent,
        userName: clientInfo.userName,
        organizationId: _.isInteger(clientInfo.org) ? clientInfo.org : 0,
        userId: clientInfo.id,
        applicationName: 'core-graphql-server',
        success: _.isNil(error),
        objectType: objectType,
        objectId: _.toString(objectId),
        description:
          'Mutation ' + mutation + ' on ' + objectType + ' ' + objectId,
        eventType: action
      };
      auditLogDb(log);
    });
  }

  // TODO not the best place for this code.
  // the core-server-base version is currently broken (pg breaking change)
  // and it's such simple code there's no reason not to just query db directly.
  async function auditLogDb(log) {
    const sql = `
INSERT INTO audit.audit_log
  (organization_id, event_type, object_type, object_id, user_name, success, description, ip_address, user_agent, request_url, application_name)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING
  event_id, organization_id, event_type, object_type, object_id, user_name, success, description, created_date, ip_address, user_agent, request_url, application_name;`;

    const args = [
      log.organizationId,
      log.eventType,
      log.objectType,
      log.objectId,
      log.userName,
      log.success,
      log.description,
      log.ipAddress,
      log.userAgent,
      log.requestUrl,
      log.applicationName
    ];

    try {
      await serviceContext.dbConnections['audit'].write.query(sql, args);
      metrics.incrementCounter('auditLog');
    } catch (err) {
      metrics.incrementCounter('auditLogFailed');
    }
  }

  const MASKED_FIELDS = new Set(
    (_.get(config, 'schemas.public.maskedFields') || []).map((x) => x.operation)
  );
  async function emitLogRequestEvent(
    args,
    object,
    info,
    context,
    opType,
    elapsed,
    error
  ) {
    let objectId = object ? object.id : null;
    if (!objectId) objectId = args.input ? args.input.id : args.id;

    const objectType = getObjectType(info, args, info.fieldName);

    let objectIds = getObjectIds(info, args, info.fieldName, object);

    if (!objectId && objectIds && objectIds.length) objectId = objectIds[0];
    if (!objectId) objectId = 'unknown';

    let redactedQuery = info.fieldName;
    let redactedVariables = '';
    if (!MASKED_FIELDS.has(info.fieldName)) {
      const location = _.get(info, 'operation.loc', {});
      if (
        _.isNumber(location.start) &&
        _.isNumber(location.end) &&
        location.source &&
        _.isString(location.source.body)
      ) {
        redactedQuery = messageUtil.truncate(
          location.source.body.substring(location.start, location.end)
        );
      }
      // nodejs util.inspect will truncate large objects, JSON.stringify will not.
      redactedVariables = messageUtil.truncate(
        nodeUtil.inspect(_.get(info, 'variableValues', {})),
        10000
      );
    }

    // we only emit events for mutations (changes)
    if (opType === 'mutation' || opType === 'query') {
      const event = {
        organizationId: util.getOrgFromAuthContext(context),
        // ID of the object that was retrieved or modified
        // the event model requires a value. in rare cases we
        // might not be able to compute one, so fall back on
        // empty string instead of null so event still goes out.
        objectId: objectId.toString(),
        objectIds: objectIds,
        // type of the object that was retrieved or modified.
        objectType: objectType,
        serviceName: 'core-graphql-server',
        ip: context.requestInfo.clientIP,
        userAgent: context.requestInfo.userAgent,
        success: !error,
        // TODO should this be something else?
        // it's the mutation name, like event.
        action: info.fieldName,
        userName: util.getClientInfo(context).id || 'unknown',
        id: uuid.v4(),
        correlationId: context.requestInfo.correlationId,
        requestId: context.requestInfo.requestId,
        type: 'api',
        elapsedMs: elapsed,
        errorName: error ? error.name : undefined,
        event: opType, // must match an event type defined in node-messaging,
        auditAction: getAuditAction(args, info),
        timestampMs: Date.now(),
        applicationId: _.get(context, 'requestContext.appId'),
        operationType: opType,
        query: redactedQuery,
        variables: redactedVariables,
        parentFolderId: _.get(object, 'parentFolderId'),
        treeObjectId: _.get(object, 'treeObjectId')
      };

      try {
        const e = await messageUtil.emitEvent(
          event,
          messageUtil.topics('EVENTS')
        );
        metrics.incrementCounter('messageEmitted');
      } catch (err) {
        // all exceptions must be handled here
        // since the logFieldRequest caller doesn't await
        logger.error('logFieldRequest', err);
      }
    }
  }

  function isPromise(obj) {
    return obj && typeof obj.then === 'function';
  }

  /**
   * Wrapper function for top-level Query or Mutation fields that performs
   * metrics, logging, and other common functions.
   */
  function wrapResolverMap(resolverMap, opType = 'query') {
    return _.mapValues(resolverMap, function (fun, funName, object) {
      // do not attempt to wrap an internally-used function
      if (funName === '__resolveType') {
        logger.info('detected __typeName and skipping');
        return fun;
      }

      if (opType === 'subscription') {
        return fun;
      }

      return async function (root, args, context, info) {
        try {
          await costLimit.checkCostLimit(root, args, context, info);
          checkRequestTimeElapsed(context, info);
        } catch (err) {
          if (err.data) err.data.errorId = newErrorId();
          logFieldRequest(args, {}, info, context, opType, 0, err);
          throw err;
        }

        const fieldStartTime = Date.now();
        let result;
        try {
          result = fun(root, args, context, info);
        } catch (err) {
          const elapsed = Date.now() - fieldStartTime;
          if (!err.data) err.data = {};
          // set an error ID
          if (!err.data.errorId) err.data.errorId = newErrorId();
          err.data.requestId = context.requestInfo.requestId;
          err.data.correlationId = context.requestInfo.correlationId;
          context.requestInfo.errorIds.push(err.data.errorId);
          logFieldRequest(args, {}, info, context, opType, elapsed, err);
          // rethrow to let graphql's error handling take it
          throw err;
        }

        // a resolver function can return a Promise or a plain object.
        // to add post-resolver code we'll need to check for the result
        // type and add .then/.catch for a Promise.
        if (isPromise(result)) {
          return result
            .then(function after(data) {
              const elapsed = Date.now() - fieldStartTime;
              logFieldRequest(args, data, info, context, opType, elapsed, null);
              return data;
            })
            .catch(function err(err) {
              if (typeof err === 'string') {
                err = Error(err);
              }

              // intercept errors just so we can log the field error
              const elapsed = Date.now() - fieldStartTime;

              // set an error ID
              if (_.isNil(err.data)) err.data = {};
              // set an error ID
              if (!err.data.errorId) err.data.errorId = newErrorId();
              err.data.requestId = context.requestInfo.requestId;
              err.data.correlationId = context.requestInfo.correlationId;
              context.requestInfo.errorIds.push(err.data.errorId);

              logFieldRequest(args, {}, info, context, opType, elapsed, err);
              // rethrow to let graphql's error handling take it
              throw err;
            });
        } else {
          // field resolver response was a plain object. just log and return.
          const elapsed = Date.now() - fieldStartTime;
          logFieldRequest(args, result, info, context, opType, elapsed, null);
          return result;
        }
      };
    });
  }

  function getSizeOf(data) {
    if (_.isString(data)) return data.length;
    // sizeof(data) blows up on a structured data schema!
    return data ? JSON.stringify(data).length : 0;
  }
  function logFieldSize(context, data) {
    const dataSize = getSizeOf(data);
    const curTotalSize = context.requestInfo.responseTotalSize || 0;
    context.requestInfo.responseTotalSize = curTotalSize + dataSize;
    return dataSize;
  }

  //return resolvers;
  return {
    wrapResolverMap
  };
};
// force commit
