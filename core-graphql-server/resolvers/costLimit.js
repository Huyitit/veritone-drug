const _ = require('lodash');
const moment = require('moment');
const rp = require('request-promise');

module.exports = function createModule(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error/index.js')(serviceContext);
  const errorOnMaxCost =
    _.get(config, 'featureFlags.errorOnMaxCost', false) === true;
  const resUtil = require('./util.js')(serviceContext);
  const alertThreshold = _.get(
    serviceContext,
    'config.alertNotifications.costQueryAlertThreshold',
    2
  );

  const notifyKeyFormat = _.get(
    serviceContext,
    'config.alertNotifications.timeKeyFormat',
    'YYYY-MM-DD'
  );

  function getMaxRequestCost(context) {
    // return hard-coded / configured value for now.
    // maybe later base it on org, token, engine, etc.
    // should match limit in server.js used to report
    // when error is disabled
    return _.get(config, 'server.maxRequestCost', 1000);
  }

  // generates a hash of a GraphQL query, attempting to factor out
  // dynamic elements like parameters and meaningless elements like whitespace.
  function hashQuery(query) {
    let str = query;
    // strip out string literals
    str = str.replace(new RegExp(/(".*")/, 'g'), '""');
    // normalize all whitespace elements to single space
    str = str.replace(new RegExp(/(\s+)/, 'g'), ' ');
    // float (n.n). . cannot be in a graphql identifier so we can replace all.
    str = str.replace(new RegExp(/(\d+\.\d+)/, 'g'), '0');
    // integer. digits can be part of indentifiers so we can only replace
    // digit strings as parameters (after a :)
    // problem:  we have too many source_1 source_2 source_3 that cause
    // same query to look different every time. we don't use numbers in
    // type or parameter names.
    str = str.replace(new RegExp(/(:\s*\d+)/, 'g'), ': 0');
    // do the same for number before a : because that indicates
    // a name such as source1: source (...)
    str = str.replace(new RegExp(/(\d+\s*:)/, 'g'), '0:');

    // now compute the hash
    return resUtil.hash(str);
  }

  async function notify(context, query, clientInfo) {
    // if disabled (local dev) just return
    if (!_.get(serviceContext, 'config.alertNotifications.enabled', false))
      return;

    const maxQueryLen = _.get(
      serviceContext,
      'config.alertNotifications.maxCostlyQueryDisplayLength',
      2000
    );
    const queryStr = query
      .replace(new RegExp(/(\s+)/, 'g'), ' ')
      .slice(0, maxQueryLen);
    let tokenInfo = '';
    if (clientInfo.type === 'engineJWT') {
      tokenInfo = `
Engine name:    ${clientInfo.engineName}
Engine ID:      ${clientInfo.engineId}`;
    } else if (clientInfo.type === 'apikey') {
      tokenInfo = `
API key ID:     ${clientInfo.id}
Org ID:         ${clientInfo.org}
Org name:       ${clientInfo.organizationName}`;
    } else if (clientInfo.type === 'internal') {
      tokenInfo = `
Internal key:   ${clientInfo.id}`;
    }

    const message = `
Costly GraphQL query detected. The client making the query should be identified and fixed. Most likely it is using excessively large page sizes.
\`\`\`
Environment:    ${_.get(serviceContext, 'config.dnsZone.external', 'aws-dev')}
Query:          ${queryStr}
Query cost:     ${context.requestInfo.totalCost}
User agent:     ${context.requestInfo.userAgent || ''}
Forwarded:      ${context.requestInfo.httpForwardedFor || ''}
Origin:         ${context.requestInfo.httpOrigin || ''}
Referer:        ${context.requestInfo.httpReferer || ''}${tokenInfo}
Client IP:      ${context.requestInfo.clientIP || ''}
Request ID:     ${context.requestInfo.requestId || ''}
Correlation ID: ${context.requestInfo.correlationId || ''}
\`\`\`
    `;

    const notifyMethod = _.get(
      serviceContext,
      'config.alertNotifications.defaultTarget',
      'slack'
    );
    const url = _.get(
      serviceContext,
      `config.alertNotifications.${notifyMethod}.url`
    );

    if (url) {
      try {
        await rp({
          method: 'POST',
          uri: url,
          json: true,
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            text: message
          }
        });
      } catch (err) {
        // these are low-priority errors as the slack notifications are
        // just a convenience.
        console.log(
          'could not post alert notification to ' + url + ':  ' + err
        );
      }
    }
  }

  async function redisIncrAndNotify(context, query, clientInfo) {
    // this code can trigger multiple times in a complex query.
    // we only want to increment and notify once per request.
    // so track that in context and just skip if we've already done it.
    if (context._costLimitNotified === true) return;
    context._costLimitNotified = true;

    // increment metric in prometheus
    serviceContext.metrics.incrementCounter('graphQLQueryCostWarning');

    let result = 1; // count of this query so far today
    // compute a hash for normalized query
    const hash = hashQuery(query);

    // get a unique key for today
    const key =
      'core-graphql-server:costly_query:' +
      moment().utc().format(notifyKeyFormat) +
      ':' +
      hash;
    const multi = serviceContext.redisClient.multi();
    multi.incr(key);
    multi.expire(key, 24 * 60 * 60); // expire after 24 hr.
    try {
      // update the count in redis
      const res = await serviceContext.redisCache.multiExec(multi);
      result = res[0];
      // IMPORTANT
      // we only notify if this is the FIRST incidence in the key time window.
      // per day, per hour, etc.
      // we do not want to spam the notification target with 1000s of hits
      // because a script somewhere started sending lots of expensive queries.
      if (result === alertThreshold) {
        await notify(context, query, clientInfo);
      }
    } catch (err) {
      // just warn if we can't connect to redis.
      // these are low-priority errors as the alert notifications are just
      // a convenience.
      console.log(
        'cannot update redis to trace expensive query:  ' +
          err +
          ' ' +
          err.stack
      );
    }
    return result;
  }

  // check current total cost of the query against the limit.
  // here we add cost based on page size.
  // in the Limit directive we increment the per-field limit, if there is one.
  async function checkCostLimit(root, args, context, info) {
    const maxCost = getMaxRequestCost(context);
    const fieldName = info.parentType + '.' + info.fieldName;

    // initialize total cost on request info
    if (_.isNil(context.requestInfo.totalCost))
      context.requestInfo.totalCost = 0;
    // increment it with the current limit argument, if there is one
    context.requestInfo.totalCost += args.limit || 0;
    if (!context.fieldStats) context.fieldStats = {};
    if (!context.fieldStats[fieldName]) context.fieldStats[fieldName] = {};

    const thisFieldStats = context.fieldStats[fieldName];
    // increment count on field
    thisFieldStats.totalCost =
      (thisFieldStats.totalCost || 0) + (args.limit || 0);

    // we'll increment our count of this query in redis and notify
    // whether or not hard errors are enabled.
    let numSoFar;
    let clientInfo;
    if (
      context.requestInfo.totalCost > maxCost &&
      !context.requestInfo.__totalCostErrorLogged
    ) {
      // we only want to log and notify once per request, not for every field
      context.requestInfo.__totalCostErrorLogged = true;
      clientInfo = resUtil.getClientInfo(context);
      try {
        await resUtil.fillInClientInfo(clientInfo);
      } catch (err) {
        console.log('cannot fill in client info:  ' + err);
      }

      numSoFar = await redisIncrAndNotify(
        context,
        context.requestInfo.query,
        clientInfo
      );
      // log warning only if we won't throw out later (which logs the error)
      if (!errorOnMaxCost) {
        const event = {
          errorName: 'max_query_cost',
          event: 'warning',
          currentField: fieldName,
          currentPageLimit: args.limit,
          maximumAllowedCost: maxCost,
          requestId: context.requestInfo.requestId,
          correlationid: context.requestInfo.correlationId,
          queryCountByDay: numSoFar,
          query: context.requestInfo.query.slice(0, 200),
          engineId: clientInfo.engineId,
          engineName: clientInfo.engineName,
          organizationId: clientInfo.org,
          organizationName: clientInfo.organizationName,
          authId: clientInfo.id,
          authType: clientInfo.type,
          userAgent: context.requestInfo.userAgent,
          httpForwardedFor: context.requestInfo.httpForwardedFor,
          httpOrigin: context.requestInfo.httpOrigin,
          httpReferer: context.requestInfo.httpReferer,
          clientIP: context.requestInfo.clientIP
        };

        serviceContext.messageUtil.emitEvent(event);
      }
    }
    // see if we're over the max.
    // throw an error if we're configured to do so.
    // otherwise we log it at the top level in server.js (so that there's is
    // only one warning for the query - this code gets invoked for every field).
    if (context.requestInfo.totalCost > maxCost && errorOnMaxCost) {
      const stats = _.transform(context.fieldStats, (result, value, key) => {
        result[key] = {
          totalCost: value.totalCost,
          count: value.count
        };
      });
      throw new errors.CapacityExceeded({
        message:
          'The cost computation for this GraphQL query exceeded the ' +
          'maximum allowed. The cost is based on the fields requested and limit ' +
          'or page size and is constant for a given query. Retrying this query ' +
          'will not succeed. To continue, remove fields or reduce paging limits. ' +
          'The field costs section in the data below contains details on how the ' +
          'cost was computed. The maximum allowed cost is ' +
          maxCost +
          '.',
        data: {
          currentField: fieldName,
          currentPageLimit: args.limit,
          maximumAllowedCost: maxCost,
          fieldCostStats: stats,
          requestId: context.requestInfo.requestId,
          correlationid: context.requestInfo.correlationId,
          queryCountByDay: numSoFar,
          query: context.requestInfo.query.slice(0, 200)
        }
      });
    }
  }

  return {
    checkCostLimit,
    _hashQuery: hashQuery // unit test only
  };
};
