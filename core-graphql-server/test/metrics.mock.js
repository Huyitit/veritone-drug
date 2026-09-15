const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  let values = {};
  /* sample values
[
{
"value": 15,
"labels": {
  "type": "mutation"
}
},
*/
  function _clearMetrics() {
    values = {};
  }

  function getValueStore(metricName, labelName, labelValue) {
    if (!values[metricName]) values[metricName] = [];
    const metricStore = values[metricName];
    let store;
    for (let i = 0; i < metricStore.length; i++) {
      const st = metricStore[i];

      if (!labelName && !st.labels) {
        store = st;
        break;
      } else if (labelName && st.labels && st.labels[labelName]) {
        store = st;
        break;
      }
    }
    if (!store) {
      if (labelName) {
        store = { labels: {}, value: 0 };
        store.labels[labelName] = labelValue;
      } else store = { value: 0 };
      metricStore.push(store);
    }

    return store;
  }

  function setValue(metricName, setFunction, labels) {
    if (labels) {
      Object.keys(labels).forEach((labelName) => {
        const store = getValueStore(metricName, labelName, labels[labelName]);
        setFunction(store);
      });
    } else {
      const store = getValueStore(metricName);
      setFunction(store);
    }
  }

  function prom(name) {
    return {
      inc: (labels, value) => {
        // value is optional, matching prom-client: absent means +1. Needed so
        // metrics.incrementCounterBy is exercised by tests, not just +1.
        setValue(
          name,
          (store) => (store.value += _.isNumber(value) ? value : 1),
          labels
        );
      },
      dec: (labels) => {
        setValue(name, (store) => store.value--, labels);
      },
      set: (value) => {
        setValue(name, (store) => (store.value = value));
      },
      observe: (labels, value) => {
        const storeFunction = function (store) {
          if (!_.isArray(store.value)) {
            store.value = [];
          } else {
            store.value.push(value);
          }
        };
        setValue(name, storeFunction, labels);
      },
      get: () => ({ values: values[name] }),
      values: () => values[name]
    };
  }

  const metricsCounters = {
    sqlQuery: prom('sqlQuery'),
    sqlQueryTimeElapsedMs: prom('sqlQueryTimeElapsedMs'),
    sqlError: prom('sqlError'),
    sqlQueryRetry: prom('sqlQueryRetry'),
    sqlQueryTimeout: prom('sqlQueryTimeout'),
    sqlConcurrentQueries: prom('sqlConcurrentQueries'),
    sqlConnectionMax: prom('sqlConnectionMax'),
    sqlConnectionWait: prom('sqlConnectionWait'),
    httpCall: prom('httpCall'),
    httpCallElapsedMs: prom('httpCallElapsedMs'),
    httpError: prom('httpError'),
    httpRetry: prom('httpRetry'),
    httpConcurrentCalls: prom('httpConcurrentCalls'),
    redisHit: prom('redisHit'),
    redisPut: prom('redisPut'),
    redisMiss: prom('redisMiss'),
    redisClear: prom('redisClear'),
    redisDropped: prom('redisDropped'),
    redisElapsedMs: prom('redisElapsedMs'),
    messageEmitted: prom('messageEmitted'),
    messageFailed: prom('messageFailed'),
    auditLog: prom('auditLog'),
    auditLogFailed: prom('auditLogFailed'),
    unexpectedError: prom('unexpectedError'),
    fatalError: prom('fatalError'),
    outOfBandError: prom('outOfBandError'),
    timeoutError: prom('timeoutError'),
    awsURLSignError: prom('awsURLSignError'),
    awsURLSignError10Sec: prom('awsURLSignError10Sec'),
    awsUploadError: prom('awsUploadError'),
    memGC: prom('memGC'),
    memLeak: prom('memLeak'),
    queryMonLongQueries: prom('queryMonLongQueries'),
    queryMonKilledQueries: prom('queryMonKillFailures'),
    queryMonTerminatedQueries: prom('queryMonTerminatedQueries'),
    queryMonKillFailures: prom('queryMonKillFailures'),
    queryMonErrors: prom('queryMonErrors'),
    analyzeMonTables: prom('analyzeMonTables'),
    analyzeMonErrors: prom('analyzeMonErrors'),
    internalTokenError: prom('internalTokenError'),
    engineJWTError: prom('engineJWTError'),
    rateLimitError: prom('rateLimitError'),
    socialPublishRenditionMiss: prom('socialPublishRenditionMiss'),
    operation: prom('operation'),
    request: prom('request'),
    error: prom('error'),
    fieldTimeElapsedMs: prom('fieldTimeElapsedMs'),
    requestTimeElapsedMs: prom('requestTimeElapsedMs'),
    concurrentRequests: prom('concurrentRequests'),
    healthCheckFailed: prom('healthCheckFailed'),
    healthCheckOk: prom('healthCheckOk'),
    graphQLQueryCostWarning: prom('graphQLQueryCostWarning'),
    graphQLQueryDeprecatedAPIWarning: prom('graphQLQueryDeprecatedAPIWarning'),
    graphQLQueryExpiredAPIWarning: prom('graphQLQueryExpiredAPIWarning'),
    meteredEvent: prom('meteredEvent'),
    meteredEventError: prom('meteredEventError'),
    addMediaSegments: prom('addMediaSegments'),
    graphqlCreatedSDO: prom('graphqlCreatedSDO'),
    graphqlUpdatedSDO: prom('graphqlUpdatedSDO'),
    // VE-26450. Must mirror customMetrics.js: metrics.js check() throws on an unregistered name, and the
    // media-constraint check guards its increments, so a counter present here but missing there passes CI and
    // no-ops in production. customMetrics.parity.spec.js asserts the two lists agree.
    distributeMediaConstraintEvaluated: prom('distributeMediaConstraintEvaluated'),
    distributeMediaConstraintRejection: prom('distributeMediaConstraintRejection'),
    distributeMediaConstraintFallthrough: prom('distributeMediaConstraintFallthrough'),
    // VE-26935/VE-26936. Same parity requirement as the VE-26450 counters above.
    engineResultAssetsPerQuery: prom('engineResultAssetsPerQuery'),
    graphqlFieldResolutions: prom('graphqlFieldResolutions'),
    graphqlFieldResponseBytes: prom('graphqlFieldResponseBytes'),
    graphqlResponseSizeBytes: prom('graphqlResponseSizeBytes'),
    graphqlQueryCost: prom('graphqlQueryCost'),
    resolverCacheHit: prom('resolverCacheHit'),
    resolverCacheMiss: prom('resolverCacheMiss'),
    sqlSlowQuery: prom('sqlSlowQuery'),
    tdoCleanupAssets: prom('tdoCleanupAssets')
  };

  const sc = Object.assign(serviceContext, { metricsCounters });
  const real = require('../metrics.js')(sc);
  return Object.assign({ _clearMetrics }, real);
};
