const rp = require('request-promise');
const _ = require('lodash');
const { StatusCodeError, RequestError } = require('request-promise/errors');
const URL = require('url-parse');
const http = require('http');
const https = require('https');
const moment = require('moment');
const sanitizeHtml = require('sanitize-html');
const querystring = require('querystring');
const url = require('url');
const validator = require('validator');
const { v5: uuidv5 } = require('uuid');
const mapper = require('./mapper.js');
const taskFailureEnum = require('./taskFailureEnum.js');

module.exports = function createFunction(config, serviceContext) {
  const logger = serviceContext.logger;
  const userAgent = config.userAgent ?? 'core-graphql-server 1.0.0';
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const httpUtil = require('../util/httpUtil.js')(serviceContext);
  const NotFound = errors.NotFound;
  const InvalidInput = errors.InvalidInput;
  const NotAllowed = errors.NotAllowed;
  const ServiceUnavailable = errors.ServiceUnavailable;
  const AuthenticationError = errors.AuthenticationError;
  const ResourceConflict = errors.ResourceConflict;
  const magicIdUtil =
    require('@veritone/core-server-base/parser.recording-id.js')({
      config
    });
  const envUrlInternal = _.get(
    config,
    'internalDnsZone',
    'aws-dev.veritone.com'
  );
  const envUrlExternal = _.get(
    config,
    'externalDnsZone',
    'aws-dev.veritone.com'
  );
  const metrics = serviceContext.metrics;
  const Task = require('../modules/core-job-server/model/task');
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const uuidNamespace = 'b61091ee-1e70-45e1-b2c3-475177e8289d';

  function concatUrl(url, end) {
    return url.endsWith('/') ? url + end : url + '/' + end;
  }

  function isInternalUrl(url) {
    return (
      url && (url.includes(envUrlInternal) || url.includes(envUrlExternal))
    );
  }

  const defaultPoolHttp = new http.Agent();
  defaultPoolHttp.maxSockets = _.get(
    config,
    `httpPools.defaultPool.maxSockets`,
    _.get(config, 'httpPools.defaultMaxSockets', 50)
  );
  const defaultPoolHttps = new https.Agent();
  defaultPoolHttps.maxSockets = _.get(
    config,
    `httpPools.defaultPool.maxSockets`,
    _.get(config, 'httpPools.defaultMaxSockets', 50)
  );
  const pools = {
    'defaultPool-http:': defaultPoolHttp,
    'defaultPool-https:': defaultPoolHttps
  };

  async function httpCall(
    uri,
    context,
    payload,
    mapper,
    method,
    apiToken = false,
    numRetries = 0
  ) {
    // parse URI to determine which pool to use
    const { poolOptions, poolConfig } = httpUtil.getHttpPoolOptions(uri);
    const token = getToken(context, apiToken);
    const correlationId = context.requestInfo.correlationId;
    const options = Object.assign(poolOptions, {
      method: method,
      uri: uri,
      json: true, // Automatically stringifies the body to JSON,
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*',
        'Veritone-Correlation-Id': correlationId
      },
      timeout: 60000 // milliseconds
    });

    const poolName = options.poolName;
    if (payload) {
      // make sure only to set these if there is a payload.
      // otherwise the server might return a parse error.
      options.body = payload;
      options.headers['Content-Type'] = 'application/json';
    }

    Object.assign(options.headers, context.headersCarrier);

    try {
      return await httpCallInternal(
        options,
        poolName,
        mapper,
        poolConfig,
        numRetries
      );
    } catch (err) {
      // The body may contain sensitive or internal data, the logs of the target service
      // should be used for further triage if needed.
      options.body = {};
      if (err.options && err.options.body) {
        err.options.body = options.body;
      }
      logger.error('http call failed.', {
        requestId: context.requestInfo.requestId,
        correlationId: correlationId,
        options,
        err
      });
      throw mapHttpError(
        err,
        {
          correlationId: correlationId,
          requestId: context.requestInfo.requestId
        },
        {
          uri: uri,
          method: method,
          tokenTypeSent: apiToken ? 'api' : 'user'
        }
      );
    }
  }

  /**
   * Raw HTTP call with retry option
   *
   * @param options HTTP request client options
   * @param poolName Pool name (base URL)
   * @param mapper Optional response mapper
   * @param poolConfig The pool configuration
   * @param numRetries Retries attempted so far
   */
  async function httpCallInternal(
    options,
    poolName,
    mapper,
    poolConfig,
    numRetries
  ) {
    const now = Date.now();
    metrics.incrementGauge('httpConcurrentCalls', { pool: poolName });
    metrics.incrementCounter('httpCall', { pool: poolName });

    try {
      const data = await rp(options);
      metrics.decrementGauge('httpConcurrentCalls', { pool: poolName });
      metrics.observeHistogram('httpCallElapsedMs', Date.now() - now, {
        pool: poolName
      });
      return mapper ? mapper(data) : data;
    } catch (err) {
      // decrement concurrent calls metric
      metrics.decrementGauge('httpConcurrentCalls', { pool: poolName });
      // update other metrics
      metrics.observeHistogram('httpCallElapsedMs', Date.now() - now, {
        pool: poolName
      });
      metrics.incrementCounter('httpError', { pool: poolName });

      if (httpUtil.isRetryable(options.uri, err, now, poolConfig, numRetries)) {
        // wait before retry.
        // this will be num retries (including this one) * delay in sec * 1000
        await mainUtil.sleep(
          (numRetries + 1) * poolConfig.retryWaitMultipleSec * 1000
        );
        // increment retry metric counter
        metrics.incrementCounter('httpRetry', { pool: poolName });
        // now try again. an error here will throw all the way back out.
        return await httpCallInternal(
          options,
          poolName,
          mapper,
          poolConfig,
          numRetries + 1
        );
      } else {
        httpUtil.recordHttpError(
          options.uri,
          err,
          Date.now() - now,
          poolName,
          numRetries
        );
        throw err;
      }
    }
  }

  /**
   * Query auth info in the context to get the right token to submit
   * for core-job-server requests. Most require an api token.
   * @param context The request context
   * @param api Whether or not the function should return the API
   *    token from the request context, vs. the user token.
   *    Default is true (return the API token).
   *    If the client authenticated with an API token, then that
   *    API token is always returned.
   */
  function getToken(context, api = true) {
    let token = context.requestContext.authToken;
    if (api) {
      token =
        _.get(context, 'requestContext.userInfo.data.apiToken') ||
        _.get(context, 'requestContext.userInfo.apiToken') ||
        context.requestContext.authToken;
    }
    return token;
  }

  function mapHttpError(error, data, internalData) {
    // if incoming error is not an HTTP
    // status code error, just return it back out.
    // generic RequestError also included. these will map to ServiceUnavailable
    //if (!(error instanceof StatusCodeError || error instanceof RequestError)) {
    //  return error;
    //}
    if (!data) data = {};
    if (!internalData) internalData = {};
    internalData.httpStatusCode = error.statusCode;
    internalData.httpResponse = error.response ? error.response.body : {};
    internalData.stack = error.stack;

    // core-job and some of the other services will send
    // this data. embed it in the GraphQL error if available.
    if (!_.isNil(error.error)) {
      // core-admin will send this error message
      if (_.isString(error.error)) {
        error.message = error.error;
      } else {
        data.errorCode = error.error.errorCode;
        error.message = error.error.message;
        if (!data.correlationId) data.correlationId = error.error.correlationId;
        data.details = error.error.data;
      }
    }

    let fullData = Object.assign(
      {
        serviceMessage: error.message,
        internalData,
        errorDetails: _.get(error, 'error.error.errors')
      },
      data
    );
    let msg = 'Service failed';
    let result = new ServiceUnavailable({
      message: msg,
      data: fullData
    });

    switch (error.statusCode || 500) {
      case 403:
        result = new NotAllowed({
          message: 'The requested action was not authorized.',
          data: fullData
        });
        break;
      case 404:
        result = new NotFound({
          message: 'The requested object or entity could not be found',
          data: fullData
        });
        break;
      case 400:
        {
          let msg = error.message;
          // special handling for this error case from core-job
          if (_.get(error, 'error.recordingId')) {
            msg = 'Cannot create job without targetId (a TemporalDataObject).';
          } else if (!msg) {
            msg = 'The request contained invalid input.';
          }
          result = new InvalidInput({
            message: msg,
            data: Object.assign({ serviceMessage: msg }, fullData)
          });
        }
        break;
      case 401:
        result = new AuthenticationError({
          message: 'Authentication error',
          data: fullData
        });
        break;
      case 409:
        result = new ResourceConflict({
          message: 'Conflict on resource update',
          data: fullData
        });
        break;
      case 500:
        // this result already initialized
        break;
      case 502:
      case 503:
        result = new ServiceUnavailable({
          message: 'Service temporarily unavailable',
          data: fullData
        });
        break;
      default:
        // default result already initialized
        break;
    }
    result.internalData = internalData;
    return result;
  }

  function verifyRealisticTime(timeSec, field) {
    // this is 2100-01-01T00:00:01.000Z
    const timeMs = timeSec * 1000;
    const timeStr = moment(timeSec * 1000).toISOString();

    if (timeSec > 4102444801) {
      throw new errors.InvalidInput({
        message:
          'The provided timestamp does not appear to be correct. ' +
          'It is far in the future. A unit or type conversion error may have ' +
          'caused this. The value provided, ' +
          timeSec +
          ', converted to ' +
          timeStr +
          '.',
        data: {
          valueInSeconds: timeSec,
          valueInMs: timeMs,
          value: timeStr,
          field: field
        }
      });
    }
    // this is 1971-01-01T00:00:01.000Z
    if (timeSec < 31536001) {
      throw new errors.InvalidInput({
        message:
          'The provided timestamp does not appear to be correct. ' +
          'It is far in the past. A unit or type conversion error may have ' +
          'caused this. The value provided, ' +
          timeSec +
          ', converted to ' +
          timeStr +
          '.',
        data: {
          valueInMs: timeMs,
          valueInSeconds: timeSec,
          value: timeStr,
          field: field
        }
      });
    }
  }

  function validateTDOTimes(startTime, stopTime) {
    // stop time must be less than or equal to start time
    if (stopTime < startTime) {
      throw new errors.InvalidInput({
        message:
          'The provided start and stop times are invalid. Stop time ' +
          'cannot be less than start time.',
        data: {
          startDateTime: new Date(startTime * 1000).toISOString(),
          stopDateTime: new Date(stopTime * 1000).toISOString()
        }
      });
    }
    // times can't be in the far future or past.
    verifyRealisticTime(startTime, 'startDateTime');
    verifyRealisticTime(stopTime, 'stopDateTime');
    // difference can't be too big (1 day)
    const diffSec = stopTime - startTime;
    const maxDiffSec = 24 * 60 * 60;
    if (diffSec > maxDiffSec) {
      throw new errors.InvalidInput({
        message:
          'The provided start and stop times are invalid. The difference ' +
          'should be less than one day. A unit or type conversion error may have ' +
          'caused this.',
        data: {
          startDateTime: new Date(startTime * 1000).toISOString(),
          stopDateTime: new Date(stopTime * 1000).toISOString(),
          differenceInHours: diffSec / 60 / 60
        }
      });
    }
  }

  async function getMagicAsset(magicIdData, context) {
    let res = null;
    const tdoId = magicIdData.recordingId;
    const generativeAssetParamList = magicIdData.generativeAssetParamList || [];
    const proms = [];
    generativeAssetParamList.forEach(function (asset) {
      if (!asset.assetId) {
        const temp = {
          id: tdoId,
          startDateTime: asset.startDateTime,
          endDateTime: asset.endDateTime
        };
        res = {
          containerId: tdoId,
          assetType: 'media',
          id: tdoId
        };
        proms.push(applyAssetUri(tdoId, res, temp, null, null, context));
      }
    });
    await Promise.all(proms);
    return res;
  }

  async function getMediaStreamerUri(context, tdoId) {
    const mediaStreamer = _.get(config, 'services.media-streamer.uri');
    let mediaStreamerUri = mediaStreamer;
    // first get from db/cache. this value might be empty
    let sourceData = await serviceContext.dal.tdo.getTDOSourceTaskData(tdoId);
    // adjust generated media-streamer URLs for portable edge content
    const clusterId = _.get(sourceData, 'clusterId');

    if (clusterId) {
      const cluster = await serviceContext.dal.cluster.getCluster(context, {
        id: clusterId
      });
      // The cluster is portable with the type OnPrem
      const isPortable = _.get(cluster, 'type') == 'OnPrem';
      const managementNodeId = _.get(cluster, 'clusterConfig.managementNodeId');

      if (isPortable && managementNodeId) {
        const managementNode =
          await serviceContext.dal.clusterNode.getClusterNode(context, {
            id: managementNodeId
          });
        // if it's portable edge, make media-streamer URL based on cluster's manager node IP
        // Otherwise, default to normal endpoint.
        mediaStreamerUri = _.get(managementNode, 'metrics.ipExternal')
          ? `http://${managementNode.metrics.ipExternal}/media-streamer/`
          : mediaStreamer;
      }
    }

    return mediaStreamerUri;
  }

  async function applyAssetUri(
    tdoId,
    asset,
    assetInfo,
    mediaSourceId,
    programId,
    context
  ) {
    const baseUri = await getMediaStreamerUri(context, tdoId);
    if (!mediaSourceId) {
      mediaSourceId = -1; // private media
    }
    if (!programId) {
      programId = -1; // private media
    }
    const uri =
      baseUri + 'mediasource/' + mediaSourceId + '/programId/' + programId;
    const params = {
      startDate: assetInfo.startDateTime,
      endDate: assetInfo.endDateTime,
      mediaId: tdoId
    };
    const queryParams = querystring.stringify(params);

    let parsedUrl = [uri, queryParams].join('?');
    parsedUrl = url.parse(parsedUrl).href;

    asset.uri = parsedUrl;
    asset.signedUri = asset.uri;
  }

  function parseTDOId(id) {
    return magicIdUtil.parseRecordingId(id);
  }

  function getAllowedAssetIdsFromMagicId(data) {
    const ids = data.assetIdWhitelist || [];
    const paramsList = data.generativeAssetParamList || [];
    const moreIds = paramsList.map((obj) => obj.assetId || data.recordingId);
    return ids.concat(moreIds);
  }

  function getAssetParamsFromMagicId(data, assetId) {
    const paramsList = data.generativeAssetParamList || [];
    let res = null;
    paramsList.forEach((assetData) => {
      if (assetData.assetId === assetId) {
        res = assetData;
      }
      if (!(assetId || assetData.assetId)) {
        res = assetData;
      }
    });
    return res;
  }

  function dateToEpochSecs(date) {
    return Math.floor(date / 1000);
  }

  function buildQueryPlaceholders(startIndex, length) {
    var placeholders = [];
    for (var i = 0; i < length; i++) {
      placeholders.push('$' + (startIndex + i));
    }

    return placeholders.join(',');
  }

  function sanitizeField(content) {
    return sanitizeHtml(content, {
      allowedTags: [],
      allowedAttributes: {}
    });
  }

  function getUserFullName(user) {
    if (!_.isObject(user) || !_.isObject(user.kvp)) {
      return null;
    }

    return _.compact([
      sanitizeField(user.kvp.firstName),
      sanitizeField(user.kvp.lastName)
    ]).join(' ');
  }

  async function checkMediaLimits(context, args) {
    // Retrieve orgId
    const orgId = args.organizationId;

    // If no orgId provided, assume no limits imposed
    if (!orgId) {
      return true;
    }

    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: orgId
    });
    // Retrieve media limit otherwise default to 2 hours in ms
    const accountType = _.get(org, 'kvp.accountProfile');
    const allowMediaOverage = _.get(org, 'kvp.features.allowMediaOverage');
    const period = _.get(org, 'kvp.billing.type');
    const mediaLengthLimitMs = _.get(org, 'kvp.features.mediaLengthLimitMs');

    // If no mediaLimitMs or allowMediaOverage or allowMediaOverage is true, then allow
    if (
      _.isNil(mediaLengthLimitMs) ||
      _.isNil(mediaLengthLimitMs) ||
      allowMediaOverage
    ) {
      return true;
    }

    // If kvp.billing.type is something other that what we target (monthly/yearly for now) then allow
    if (period !== 'monthly' || period !== 'yearly') {
      return true;
    }

    const mediaUsage = await serviceContext.redisCache.get(
      'mediaUsageMs',
      `${orgId}-${moment().month() + 1}-${moment().year()}`
    );

    return mediaLengthLimitMs > mediaUsage;
  }

  function splitTrim(source, separator) {
    if (!_.isString(source) || !_.isString(separator)) {
      return [];
    }

    if (source.indexOf(separator) === -1) {
      return [source];
    }

    const splitValues = [];
    source.split(separator).forEach(function trimItems(item) {
      item = item.trim();
      if (item.length) {
        splitValues.push(item);
      }
    });

    return splitValues;
  }

  async function engineLibraryTaskGenerator(job) {
    if (!job) {
      throw new errors.InvalidInput({
        message: 'A job is required'
      });
    }

    let tasks = job.tasks;
    let i = job.tasks.length;

    //iterate in reverse so the index is still valid when an element is added to the array
    while (i--) {
      const task = tasks[i];
      const libraryTypes = _.get(task, 'taskPayload.libraryTypes');

      if (!libraryTypes) {
        continue;
      }

      if (!_.isArray(libraryTypes) || libraryTypes.length === 0) {
        throw new errors.InvalidInput({
          message: 'invalid libraryTypes',
          data: {
            objectType: 'taskPayload.libraryTypes',
            objectData: libraryTypes
          }
        });
      }

      try {
        const res = await Promise.all([
          serviceContext.dal.library.getLibraries({
            type: libraryTypes,
            limit: 1000
          }),
          serviceContext.dal.library.getLibraries({
            id: _.get(
              task,
              'taskPayload.libraryId',
              '00000000-0000-0000-0000-000000000000'
            ),
            limit: 1
          })
        ]);
        const engineId = task.engineId;
        const libraryMap = new Map();
        const libraryData = _.get(res, '[0].records', []).concat(
          _.get(res, '[1].records', [])
        );

        for (const library of libraryData) {
          if (!libraryTypes.includes(library.libraryTypeId)) {
            continue;
          }

          const engineModels =
            await serviceContext.dal.library.getLibraryEngineModels({
              ownerOrgId: library.organizationId,
              libraryId: library.id,
              engineId
            });

          for (const engineModel of _.get(engineModels, 'records')) {
            libraryMap.set(library.id, engineModel.id);
          }
        }

        for (const [libraryId, engineModelId] of libraryMap.entries()) {
          // add the id of the library's most recent engine model to the task payload
          let newTask = new Task(JSON.parse(JSON.stringify(task)));
          newTask.taskId = null;
          delete newTask.taskPayload.libraryTypes;
          newTask.taskPayload.libraryId = libraryId;
          newTask.taskPayload.libraryEngineModelId = engineModelId;
          job.tasks.push(newTask);
        }
        //Remove the task with the library type flag
        job.tasks.splice(i, 1);
      } catch (err) {
        throw new errors.InternalServerError({
          message: 'Failed to generate tasks: ' + (err.message || err)
        });
      }
    }
  }

  /**
   * @param taskId the task ID to validate. can be null or undefined, which
   *   case no validation is attempted.
   * @return true if it is a string that contains valid task ID.
   * false if it contains a string that is not a valid task ID.
   */
  function validateTaskId(taskId) {
    if (!taskId) {
      return false;
    }
    if (!dateIdUtil.isValidDateId(taskId)) {
      // could be the old format, for backwards compatibility we should allow
      if (taskId.length > 38) {
        // it's jobId-task GUID
        const jobIdPart = taskId.substring(0, 36);
        const taskIdPart = taskId.substring(37);
        return validator.isUUID(taskIdPart) && validator.isUUID(jobIdPart);
      } else {
        // just task id
        return validator.isUUID(taskId);
      }
    }
    return true;
  }

  function generateJobTablePartition(jobId) {
    if (
      dateIdUtil.isTablePartitionActive(
        config.jobTablePartitionActiveDate,
        jobId
      )
    ) {
      return dateIdUtil.getJobTablePartition(jobId);
    }
    return 'job_new.job';
  }

  function generateTaskTablePartition(dateId) {
    if (
      dateIdUtil.isTaskTablePartitionActive(
        config.taskTablePartitionActiveDate,
        dateId
      )
    ) {
      return dateIdUtil.getTaskTablePartition(dateId);
    }

    return 'job_new.task';
  }

  function generateRecordingAssetPartition(tdoIds) {
    const activeDateString = config.recordingAssetTablePartitionActiveDate;
    const recordingWeekConfig = config.recordingWeekConfig;
    const ids = _.isArray(tdoIds) ? tdoIds : [tdoIds];
    let arrPartitions = [];
    let partition = 'recording.recording_asset';

    if (ids && activeDateString && recordingWeekConfig) {
      _.forEach(ids, (tdoId) => {
        if (tdoId)
          arrPartitions.push(
            dateIdUtil.getRecordingAssetPartition(
              activeDateString,
              recordingWeekConfig,
              tdoId
            )
          );
      });
    }

    if (!_.isEmpty(arrPartitions)) {
      arrPartitions = _.uniq(arrPartitions);

      // All input tdoIds in the same partition
      if (arrPartitions.length === 1) {
        partition = _.first(arrPartitions);
      }
    }

    return partition;
  }

  function getDefaultMailboxIdByOrgIdOrUserId(id) {
    if (!id) {
      throw new errors.InvalidInput({ message: 'id is required' });
    }

    return uuidv5(id.toString(), uuidNamespace);
  }

  async function generateBuildManifestFromEngine(
    context,
    buildManifest,
    engineManifest,
    engineId
  ) {
    let manifest = buildManifest || {};

    if (_.isObject(engineManifest)) {
      manifest = _.assign(manifest, engineManifest);
    } else if (engineId) {
      const engine = await serviceContext.dal.engine.getEngine(context, {
        id: engineId
      });

      if (engine && (engine.engineManifest || engine.manifest)) {
        manifest = _.assign(manifest, engine.engineManifest || engine.manifest);
      }
    }

    return manifest;
  }

  // Returns null when nothing was reported, so callers can leave the failure fields untouched
  // rather than persist an invented reason. Callers MUST handle that null.
  function defineTaskOutputFailure(failureReason, failureMessage) {
    // "" and "none" both mean "not supplied": Go senders marshal an absent field as "", and `none`
    // is edge's own enum member, the literal value it stores for a cascade abort.
    const hasReason =
      !_.isNil(failureReason) &&
      failureReason !== '' &&
      failureReason !== 'none';
    const hasMessage = !_.isNil(failureMessage) && failureMessage !== '';

    if (!hasReason && !hasMessage) return null;

    // `other` is documented as "cause known, but not mappable to a TaskFailureReason value;
    // failureMessage should contain details" — exactly a message with no reason.
    const reasonKey = hasReason ? failureReason : 'other';
    // Own-property check only: failureReason arrives as a free-form string on several paths, so a
    // bare lookup would resolve inherited names like `constructor` as known reasons.
    const failureReasonType = _.has(taskFailureEnum, reasonKey)
      ? taskFailureEnum[reasonKey]
      : undefined;
    if (_.isUndefined(failureReasonType)) {
      // Reason outside the enum: report the mismatch rather than their unserializable value, and
      // flag it — isUnknownFailureType is how operators spot senders drifting from the enum.
      const defaultReasonType = _.cloneDeep(taskFailureEnum.task_validation);
      defaultReasonType.isUnknownFailureType = true;
      // The message still stands, and is the only account of what went wrong once the code is gone.
      if (hasMessage) defaultReasonType.failureMessage = failureMessage;
      return defaultReasonType;
    }

    const reasonType = _.cloneDeep(failureReasonType);
    reasonType.isUnknownFailureType = false;
    if (hasMessage) reasonType.failureMessage = failureMessage;

    return reasonType;
  }

  // core-admin tokens/all response mapper
  function coreAdminTokensResponseMapper(token, isNewToken = false) {
    let tokens = token;
    if (_.isNil(token)) {
      throw new Error(`the token is required`);
    }
    if (!_.isArray(token)) {
      tokens = [token];
    }

    return tokens.map((token) => {
      const {
        tokenHash: hash,
        tokenId: id,
        json: { tokenLabel: name = '', isRevoked, rights }
      } = token;
      const tokenRights = Array.isArray(rights) ? rights : [];
      const details = {
        hash,
        name,
        revoked: !!isRevoked,
        rights: tokenRights.map((right) => {
          // check if legacy - e.g. an old token with 'user:create' permission
          if (mainUtil.getPermissionEnumMap()[`aiware.${right}`])
            return mainUtil.getPermissionEnumMap()[`aiware.${right}`];
          if (colonSeparatedFunctionalPermissionsMap()[`aiware:${right}`]) {
            return colonSeparatedFunctionalPermissionsMap()[`aiware:${right}`];
          }
          // check if new - e.g. a new token with 'admin:user:create' permission
          if (mainUtil.getPermissionEnumMap()[right])
            return mainUtil.getPermissionEnumMap()[right];
          if (colonSeparatedFunctionalPermissionsMap()[right]) {
            return colonSeparatedFunctionalPermissionsMap()[right];
          }
        })
      };
      if (isNewToken) {
        return {
          id,
          details
        };
      }
      return details;
    });
  }

  // AuthPermissionType enum values to "entity:action"
  function swapPermissionEnumMap() {
    const map = mainUtil.getPermissionEnumMap();
    let reversedMap = {};
    for (let key in map) {
      reversedMap[map[key]] = _.replace(key, /\./g, ':');
    }
    return reversedMap;
  }
  // functional permissions "entity:action" to AuthPermissionType
  function colonSeparatedFunctionalPermissionsMap() {
    const map = mainUtil.getPermissionEnumMap();
    let processedMap = {};
    for (let key in map) {
      processedMap[_.replace(key, /\./g, ':')] = map[key];
    }
    return processedMap;
  }

  function generateBatchProcessItemTablePartition(batchProcessId) {
    if (
      dateIdUtil.isTablePartitionActive(
        config.batchProcessItemPartitionActiveDate,
        batchProcessId
      )
    ) {
      logger.error('tablePartitionActive is not implemented yet');
    }
    return 'job_new.batch_process_item';
  }

  function parseDateFromPartitionTable(partition, tableNamePrefix) {
    const partitionRegex = new RegExp(
      `^.*${tableNamePrefix}_(?<year>\\d{4})\\_(?<month>\\d{2})_(?<week>\\d{2})`,
      'g'
    );
    const { year, week } = _.get(partitionRegex.exec(partition), 'groups', {});

    if (_.isNil(year) || _.isNil(week)) {
      return null;
    }

    return moment()
      .utc()
      .isoWeekYear(_.parseInt(year))
      .isoWeek(_.parseInt(week))
      .startOf('isoWeek');
  }

  /**
   * Get the partition tables by table prefix. e.g the job tables has some partition tables job_[year]_[MM]_[number of week]
   * @param {*} tableNamePrefix: the table name prefix that needs to find the partition tables. This is required
   * @param {*} schema: DB schema. The default value is 'job_new'
   * @param {*} dbName: The name of DB. The default value is 'core'
   * @returns a Set of the partition table names
   */
  async function getPartitionTables(
    tableNamePrefix,
    schema = 'job_new',
    dbName = 'core'
  ) {
    const cacheType = 'partitionTables';
    schema = schema || 'job_new';
    dbName = dbName || 'core';
    if (_.isNil(tableNamePrefix)) {
      throw new InvalidInput({ message: 'the table name prefix is required' });
    }
    const db = _.get(serviceContext, `dbConnections.${dbName}.read`);
    if (_.isNil(db)) {
      throw new InvalidInput({
        message: `the db client for ${dbName} does not exist`
      });
    }

    // check in the cache
    const getInCacheData = await serviceContext.redisCache.get(
      cacheType,
      `${dbName}_${schema}_${tableNamePrefix}`
    );
    if (!_.isNil(getInCacheData)) {
      const partitionTablesArr = _.get(getInCacheData, 'partitionTables', []);
      return new Set(partitionTablesArr);
    }

    let result = new Set();
    let res;
    const sql = `
            SELECT schemaname, relname
            FROM pg_stat_user_tables
            WHERE schemaname = $1 and relname LIKE '${tableNamePrefix}%';`;

    try {
      res = await db.map(sql, [schema]);
    } catch (err) {
      logger.error(
        '(getPartitionTables) failed to get the partition tables',
        err
      );

      return result;
    }

    if (_.isNil(res) || _.isEmpty(res)) {
      return result;
    }

    const tableNames = res.map((o) => o.relname);
    // set to the cache
    serviceContext.redisCache.set(
      cacheType,
      `${dbName}_${schema}_${tableNamePrefix}`,
      {
        partitionTables: tableNames
      }
    );

    return new Set(tableNames);
  }

  function getOrgFromAuthContext(context) {
    const data = context._authInfo || context;
    let res = _.get(data, 'tokenInfo.organization.organizationId');
    if (!res) res = _.get(data, 'organization.organizationId');
    if (!res) res = _.get(data, 'tokenInfo.group.kvp.organizationId');
    return res;
  }

  function isRootOrganization(context) {
    const organizationId = getOrgFromAuthContext(context);
    const rootOrgId = _.get(serviceContext, 'config.flyway.rootOrgId');
    return organizationId === rootOrgId;
  }

  function isSuperAdminOrganization(organizationId) {
    const rootOrgId = _.get(serviceContext, 'config.flyway.rootOrgId');
    const superAdminOrgs = _.get(
      serviceContext,
      'config.system.rootOrg.orgIds',
      []
    );
    // if the superadmin orgs are not listed, use the rootOrg
    if (superAdminOrgs.length === 0) {
      superAdminOrgs.push(rootOrgId);
    }
    return superAdminOrgs.includes(organizationId);
  }

  /**
   * Validates and returns the valid roles for the organization.
   * Some roles are only available for the root organization. So they should be removed for other organizations
   * @param {*} context the current context
   * @param {*} roles the roles need to be validated
   * @param {*} organizationId The organization that needs to get roles assigned to it. It is an optional
   * @returns the valid roles
   */
  function validateRoles(context, roles, organizationId) {
    if (
      _.isNil(context) ||
      _.isNil(roles) ||
      !_.isArray(roles) ||
      _.isEmpty(roles)
    ) {
      return roles;
    }

    // check if there is the root org
    if (isSuperAdminOrganization(getOrgFromAuthContext(context))) {
      if (_.isNil(organizationId) || isSuperAdminOrganization(organizationId)) {
        return roles;
      }
    }

    // get roles which only for the root org
    const specialRoles = _.get(
      serviceContext,
      'config.system.rootOrg.roleIds',
      []
    );
    if (_.isEmpty(specialRoles)) {
      return roles;
    }

    // remove the special roles which are not available for other organizations
    return roles.filter(
      (o) => !(specialRoles.includes(o.id) || specialRoles.includes(o.roleId))
    );
  }

  function dateTimeToISOString(value) {
    if (!value) {
      return;
    }
    try {
      const date = new Date(value * 1000);
      return date.toISOString();
    } catch {
      logger.error(`failed to convert date to ISO string. Value: ${value}`);
    }
    return null;
  }

  function validateAndMergeInputIds(args) {
    const inputIds = [];
    if (args.ids && Array.isArray(args.ids)) {
      for (const id of args.ids) {
        mainUtil.checkId(id);
        inputIds.push(id);
      }
    }

    if (args.id) {
      mainUtil.checkId(args.id);
      inputIds.push(args.id);
    }

    return _.uniq(inputIds);
  }

  function validatePagination(inputArgs, maxLimit = 1000) {
    const limit = inputArgs.limit ?? 30;
    const offset = inputArgs.offset ?? 0;

    if (limit > maxLimit) {
      throw new errors.InvalidInput({
        message: `Limit cannot exceed ${maxLimit}. Provided: ${limit}`,
        data: {
          objectType: 'Pagination',
          field: 'limit',
          value: limit
        }
      });
    }

    return { limit, offset };
  }

  function mapPaginationSql(limit, offset, sqlValues) {
    sqlValues.push(limit, offset);
    const pagingSql = `LIMIT $${sqlValues.length - 1} OFFSET $${sqlValues.length}`;
    const pagingRaw = `LIMIT ${limit} OFFSET ${offset}`;
    return { sqlValues, pagingRaw, pagingSql };
  }

  return {
    httpCall,
    getToken,
    concatUrl,
    mapHttpError,
    validateTDOTimes,
    verifyRealisticTime,
    getAssetParamsFromMagicId,
    getAllowedAssetIdsFromMagicId,
    parseTDOId,
    applyAssetUri,
    getMagicAsset,
    dateToEpochSecs,
    buildQueryPlaceholders,
    sanitizeField,
    getUserFullName,
    checkMediaLimits,
    getMediaStreamerUri,
    splitTrim,
    engineLibraryTaskGenerator,
    validateTaskId,
    generateJobTablePartition,
    generateTaskTablePartition,
    generateRecordingAssetPartition,
    getDefaultMailboxIdByOrgIdOrUserId,
    generateBuildManifestFromEngine,
    defineTaskOutputFailure,
    swapPermissionEnumMap,
    colonSeparatedFunctionalPermissionsMap,
    coreAdminTokensResponseMapper,
    generateBatchProcessItemTablePartition,
    parseDateFromPartitionTable,
    getPartitionTables,
    getOrgFromAuthContext,
    validateRoles,
    isRootOrganization,
    dateTimeToISOString,
    validateAndMergeInputIds,
    validatePagination,
    mapPaginationSql,
  };
};
