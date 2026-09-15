const _ = require('lodash');
const moment = require('moment');
const { eventsMap } = require('@veritone/core-server-base/events-map');

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mapper = require('./mapper.js');
  const mainUtil = require('../util.js')(serviceContext);
  const { config, logger } = serviceContext;
  const dalUtil = require('./util.js')(config, serviceContext);

  const logSinksList = {
    elasticSearch: 'elasticSearch'
  };
  let auditSinkConfig = {};
  const MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE = 10000;

  const esConstants = {
    query: {
      index: 'audit_log',
      operator: 'and'
    },
    endpoints: {
      auditLog: 'search/audit_log'
    }
  };

  const userScopedEvents = [
    'LoginSucceeded',
    'LoginFailed',
    'LoginAttemptsExceeded',
    'PasswordChange',
    'Logout',
    'Impersonated',
    'SessionEnded'
  ];

  const conditionsForFieldsOfSearchQuery = {
    id: {
      operator: 'terms',
      esKey: '_id'
    },
    eventId: {
      operator: 'term',
      esKey: 'eventId'
    },
    createdDateTime: {
      operator: 'range',
      esKey: 'timestamp'
    },
    organizationId: {
      operator: 'term',
      esKey: 'organizationId'
    },
    organizationName: {
      _analyzer: 'autocomplete_index',
      operator: 'query_string',
      esKey: 'organizationName',
      fields: {
        sort: true
      }
    },
    userId: {
      operator: 'term',
      esKey: 'userId'
    },
    userName: {
      _analyzer: 'generic_name_analyzer',
      operator: 'query_string',
      esKey: 'userName',
      fields: {
        sort: true
      }
    },
    clientIpAddress: {
      operator: 'term',
      esKey: 'requestIP'
    },
    clientUserAgent: {
      _analyzer: 'autocomplete_index',
      operator: 'query_string',
      esKey: 'userAgent',
      fields: {
        sort: true
      }
    },
    eventType: {
      operator: 'term',
      esKey: 'eventType.sort',
      fields: {
        sort: true
      }
    },
    eventNames: {
      operator: 'terms',
      esKey: 'eventName'
    },
    eventName: {
      operator: 'term',
      esKey: 'eventName'
    },
    targetType: {
      operator: 'term',
      esKey: 'targetType'
    },
    objectId: {
      operator: 'term',
      esKey: 'targetId'
    },
    actionResult: {
      operator: 'term',
      esKey: 'actionResult'
    },
    actionName: {
      operator: 'term',
      esKey: 'actionName'
    },
    originatorApplication: {
      operator: 'term',
      esKey: 'originatorApplication'
    },
    originatorService: {
      operator: 'term',
      esKey: 'originatorService'
    },
    impersonatorUserId: {
      operator: 'term',
      esKey: 'impersonatorUserId'
    },
    impersonatorUserName: {
      _analyzer: 'generic_name_analyzer',
      operator: 'query_string',
      esKey: 'impersonatorUserName',
      fields: {
        sort: true
      }
    },
    correlationId: {
      operator: 'term',
      esKey: 'correlationId'
    }
  };

  async function getAuditLog(context, args, info) {
    let input;
    try {
      input = args.input || {};
      concatSingleAndMultipleEventNames(input);
      getDateRange(input);
      validateDateRange(input);
      validateOrganization(context, input.organizationId);
      cleanInputConsideringTier(context, input);
      checkForAuditImpersonationEvent(context, input);
      auditSinkConfig = getAuditSink(context, input);

      if (auditSinkConfig.name === logSinksList.elasticSearch) {
        if (input.limit > MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE) {
          throw new errors.InvalidInput({
            message: `input.limit is bigger than 10000. It's the maximum number of records that search server can return per request`,
            data: {
              code: 400,
              objectType: 'search-server'
            }
          });
        }
        const originalLimit = input.limit;
        const originalOffset = input.offset;
        const resp = await executeSearchSinkModule(context, input, null, info);
        if (resp.error) {
          throw new errors.ServiceFailure({
            message: resp.error.message,
            data: {
              code: resp.error.code,
              objectType: 'search-server'
            }
          });
        }
        const rows =
          resp.results && resp.results.length > 0
            ? mapper.mapInstanceAuditLogEntry(resp.results)
            : [];
        emitPublicEvent(context, eventsMap.AuditLogAccess, input, null);
        return {
          records: rows,
          count: rows.length,
          offset: originalOffset,
          limit: originalLimit,
          toDateTime: input.toDateTime,
          fromDateTime: input.fromDateTime
        };
      } else {
        throw new errors.NotImplemented({
          message: `There is not sink implemented.`,
          data: {
            code: 404,
            objectType: 'core-graphql-server'
          }
        });
      }
    } catch (error) {
      emitPublicEvent(context, eventsMap.AuditLogAccess, input, error);
      throw error;
    }
  }

  function getDateRange(args = {}) {
    args.toDateTime = args.toDateTime ? moment(args.toDateTime) : moment();
    args.fromDateTime = args.fromDateTime
      ? moment(args.fromDateTime)
      : moment(args.toDateTime.valueOf()).subtract(
          _.get(config, 'instanceAuditLog.defaultTimeWindowLengthDays', 15),
          'days'
        );
  }

  function validateDateRange(args) {
    if (!args.fromDateTime.isBefore(args.toDateTime)) {
      throw new errors.InvalidInput({
        message: 'toDateTime cannot be before fromDateTime.',
        data: {
          toDateTime: args.toDateTime,
          fromDateTime: args.fromDateTime
        }
      });
    }

    const diff = args.toDateTime.diff(args.fromDateTime, 'days');
    if (
      diff > _.get(config, 'instanceAuditLog.maximumTimeWindowLengthDays', 365)
    ) {
      throw new errors.InvalidInput({
        message: 'Audit log time window must be equal or less than 365 days.',
        data: {
          toDateTime: args.toDateTime._i,
          fromDateTime: args.fromDateTime._i,
          differenceInDays: diff
        }
      });
    }
  }

  function validateOrganization(context, organizationId) {
    if (_.isNil(organizationId)) {
      return;
    }

    organizationId = _.isString(organizationId)
      ? _.toNumber(organizationId)
      : organizationId;
    if (
      !resUtil.isSuperAdmin(context._authInfo) &&
      organizationId !== mainUtil.getOrganizationId(context)
    ) {
      throw new errors.InvalidInput({
        message:
          'Only a super admin can get audit logs from different organizations',
        data: {
          organizationId
        }
      });
    }
  }

  function cleanInputConsideringTier(context, args) {
    // full access for instance admins
    if (resUtil.isSuperAdmin(context._authInfo)) {
      // organizationId is a string when user passes it from graphql input
      // otherwise, the organizationId is set from graphql-server, and it's deleted
      // to make a query without considering an organization, that is the current behavior
      if (!_.isString(args.organizationId)) {
        delete args.organizationId;
        delete args.organizationIds;
        delete args.applicationId;
        delete args.applicationIds;
      }
      return;
    }

    // org-scoped events for org admins
    if (resUtil.isOrgAdmin(context._authInfo)) {
      args.organizationId = mainUtil.getOrganizationId(context);
      return;
    }

    // user-scoped events for non-admins
    validateUserScopeEventsAvailable(args.eventNames);
    args.organizationId = mainUtil.getOrganizationId(context);
    args.userId = mainUtil.getAuthUserId(context);
  }

  function checkForAuditImpersonationEvent(context, args) {
    // When a super admin impersonates an org-admin or regular user.
    if (args.eventName === 'Impersonated') {
      if (args.userName) {
        args.impersonatorUserName = args.userName;
        delete args.userName;
      }

      if (args.userId) {
        args.impersonatorUserId = args.userId;
        delete args.userId;
      }
    }
  }

  function validateUserScopeEventsAvailable(eventNames) {
    const forbiddenEvents = _.filter(
      eventNames,
      (eventName) => !_.includes(userScopedEvents, eventName)
    );
    if (forbiddenEvents.length !== 0) {
      throw new errors.InvalidInput({
        message: `a non-admin user only can query auth-related events scoped to their org and username/userID`,
        data: {
          code: 400,
          objectType: 'search-server'
        }
      });
    }
  }

  function getAuditSink(context, input) {
    // by default elasticSearch
    logger.debug(`elasticSearchSink selected.`);
    return {
      name: logSinksList.elasticSearch,
      config: {
        uri: config.services['core-search-server'].uri,
        token: context.requestContext.authToken,
        requestRetryCount: _.get(
          config,
          'instanceAuditLog.elasticSearchSink.requestRetryCount',
          3
        )
      }
    };
  }

  async function executeSearchSinkModule(
    context,
    input,
    extraConditions,
    info
  ) {
    if (input.offset > MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE) {
      logger.debug(
        `offset from user input is bigger thant the maximum result per search request. It's necessary to start the process to get the id of the element related to the offset position`
      );
      const newArgs = Object.assign({}, input);
      newArgs.offset = 0;
      newArgs.limit = MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE;
      let offsetCount = input.offset;
      while (offsetCount >= MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE) {
        offsetCount = Math.abs(
          offsetCount - MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE
        );
        const payload = buildSearchQuery(
          context,
          newArgs,
          extraConditions,
          info
        );
        payload.sort = orderBy(context, newArgs, true);
        const resp = await executeSearchQuery(
          context,
          esConstants.endpoints.auditLog,
          payload
        );
        const lastLog = resp.results[resp.results.length - 1];
        if (!lastLog) {
          return {
            results: []
          };
        }
        extraConditions = buildSearchAfterCondition(
          context,
          payload.sort,
          lastLog,
          info
        );
      }
      input.offset = offsetCount;
    }

    if (
      input.offset <= MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE &&
      input.offset + input.limit > MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE
    ) {
      logger.debug(
        `offset + limit values from user input is bigger thant the maximum result per search request. It's necessary to start the process to get the id of the element related to the offset position`
      );
      const newArgs = Object.assign({}, input);
      newArgs.offset = 0;
      newArgs.limit = input.offset;
      const payload = buildSearchQuery(context, newArgs, extraConditions, info);
      payload.sort = orderBy(context, newArgs, true);
      const resp = await executeSearchQuery(
        context,
        esConstants.endpoints.auditLog,
        payload
      );
      const lastLog = resp.results[resp.results.length - 1];
      if (!lastLog) {
        return {
          results: []
        };
      }
      extraConditions = buildSearchAfterCondition(
        context,
        payload.sort,
        lastLog
      );
      input.offset = 0;
    }

    // process finishes only when input.offset + input.limit <= MAX_RESULT_WINDOWS_IN_SEARCH_API_RESPONSE
    const payload = buildSearchQuery(context, input, extraConditions, info);
    payload.sort = orderBy(context, input, false);
    return await executeSearchQuery(
      context,
      esConstants.endpoints.auditLog,
      payload
    );
  }

  function buildSearchAfterCondition(context, newArgs, lastElement) {
    const newCondition = {
      operator: 'range',
      field: 'timestamp'
    };
    newCondition[newArgs[0].order === 'asc' ? 'gt' : 'lt'] =
      lastElement.timestamp;
    return newCondition;
  }

  async function executeSearchQuery(context, endpoint, payload) {
    try {
      const url = getUri(auditSinkConfig.config.uri, endpoint);
      return await dalUtil.httpCall(
        url,
        context,
        payload,
        null,
        'POST',
        auditSinkConfig.config.token,
        auditSinkConfig.config.requestRetryCount
      );
    } catch (err) {
      logger.error(`error executing endpoint ${endpoint}. ${err}`);
      throw err;
    }
  }

  function getUri(uri, endpoint) {
    if (!_.endsWith(uri, '/')) {
      uri += '/';
    }
    return `${uri}${endpoint}`;
  }

  function concatSingleAndMultipleEventNames(args) {
    let eventNamesFilter = _.get(args, 'eventNames', []);
    let eventNameFilter = _.get(args, 'eventName', null);

    // if the deprecated eventName is used, add it to the eventNames filter and remove it from args
    if (eventNameFilter) {
      // push into eventNames and dedupe
      eventNamesFilter = _.uniq(eventNamesFilter.concat(eventNameFilter));
      args.eventNames = eventNamesFilter;
      delete args.eventName;
    }
  }

  function buildSearchQuery(context, args, extraCondition, info) {
    concatSingleAndMultipleEventNames(args);
    let eventNamesFilter = _.get(args, 'eventNames', []);
    let conditions = [];
    for (const key in args) {
      if (key in conditionsForFieldsOfSearchQuery) {
        const object = conditionsForFieldsOfSearchQuery[key];
        if (object) {
          const condition = {
            operator: object.operator,
            field: object.esKey,
            _analyzer: object._analyzer || null
          };
          condition[
            ['query_string', 'term'].includes(object.operator)
              ? 'value'
              : 'values'
          ] = args[key];
          conditions.push(condition);
        }
      }
    }

    // to set the date range
    const timestamp = {
      operator: 'range',
      field: 'timestamp',
      lte: args.toDateTime,
      gte: args.fromDateTime
    };
    conditions.push(timestamp);

    const supportedEventTypeValues = _.get(
      info,
      'schema._typeMap.EventTypeEnum._values',
      [{}]
    ).map((x) => x.name);
    conditions.push({
      operator: 'terms',
      field: 'eventType.sort',
      values: supportedEventTypeValues
    });

    if (extraCondition) {
      conditions.push(extraCondition);
    }

    if (!eventNamesFilter.length) {
      const supportedEventNameValues = _.get(
        info,
        'schema._typeMap.EventNameEnum._values',
        [{}]
      ).map((x) => x.name);

      conditions.push({
        operator: 'terms',
        field: 'eventName',
        values: supportedEventNameValues
      });
    }

    return {
      index: [esConstants.query.index],
      query: {
        operator: esConstants.query.operator,
        conditions: conditions
      },
      offset: args.offset,
      limit: args.limit
    };
  }

  function orderBy(ctx, args, ToContinueQuery) {
    let listOfFieldsToOrder = ToContinueQuery
      ? { createdDateTime: conditionsForFieldsOfSearchQuery.createdDateTime }
      : conditionsForFieldsOfSearchQuery;

    let sort = [];
    if (args.orderBy && args.orderBy.length > 0) {
      for (const object of args.orderBy) {
        const values = listOfFieldsToOrder[object.field];
        if (values) {
          if (values.fields && values.fields.sort === true) {
            sort.push({
              field: values.esKey.endsWith('.sort')
                ? values.esKey
                : `${values.esKey}.sort`,
              order: object.direction
            });
          } else {
            sort.push({
              field: values.esKey,
              order: object.direction
            });
          }
        }
      }
    }

    if (sort.length === 0) {
      sort.push({
        field: 'timestamp',
        order: 'desc'
      });
    }
    return sort;
  }

  function emitPublicEvent(context, event, input, error) {
    const userInfo = mainUtil.getAuthDataForJob(context);
    // per product, this will become a new field and message should be a short string instead
    // const message = buildAuditLogMessage(userInfo, input, error);
    const message = !error ? 'Accessed the audit log' : 'Failed to access the audit log';
    const targetId =
      userInfo.userId || userInfo.debug.userName || userInfo.organizationId;
    const payload = {
      actionInfo: serviceContext.messageUtil.buildActionInfo(
        targetId,
        error,
        event.action,
        !error ? 'success' : 'failure',
        message
      )
    };
    serviceContext.messageUtil.emitPublicEvent(
      event.name,
      'system',
      context,
      payload
    );
  }

  function buildAuditLogMessage(userInfo, input, error) {
    const user = userInfo?.debug?.userName || userInfo?.userId || 'unknown';

    if (error) {
      if (error instanceof errors.InvalidInput)
        return `Error during execution of query instanceAuditLog by user ${user}: ${error.message}`;
      return `Error during execution of query instanceAuditLog by user ${user}`;
    }

    const parts = [
      `Query instanceAuditLog executed by user ${user} to get audit logs with `
    ];

    if (input.organizationId)
      parts.push(`organizationId ${input.organizationId}, `);

    if (Array.isArray(input.id)) {
      parts.push(
        input.id.length === 1
          ? `id ${input.id[0]}, `
          : `ids [${input.id.join(', ')}], `
      );
    }

    if (Array.isArray(input.eventNames)) {
      parts.push(
        input.eventNames.length === 1
          ? `eventName ${input.eventNames[0]}, `
          : `eventNames [${input.eventNames.join(', ')}], `
      );
    }

    if (input.userId) parts.push(`userId ${input.userId}, `);
    if (input.userName) parts.push(`userName ${input.userName}, `);
    if (parts.length === 1)
      parts[0] = parts[0].replace(/ with\s*$/, ' with dateTime filter ');

    // date time is added by default with a time windown of 15 days
    parts.push(`from ${input.fromDateTime} `);
    parts.push(`to ${input.toDateTime}`);
    return parts.join('') + '.';
  }

  return {
    getAuditLog,
    //for test purposed
    cleanInputConsideringTier,
    buildSearchAfterCondition,
    buildSearchQuery,
    orderBy,
    validateOrganization,
    buildAuditLogMessage
  };
};
