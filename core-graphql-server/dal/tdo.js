/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const _ = require('lodash');
const { promisify } = require('util');
const async = require('async-p');
const mapper = require('./mapper.js');
const moment = require('moment');
const validator = require('validator');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');
const intoStream = require('into-stream');
const s3UriParser = require('amazon-s3-uri');
const URL = require('url-parse');
const { v4: uuidv4 } = require('uuid');
const { performance } = require('perf_hooks');
const { join } = require('lodash');

const SOURCE_TASK_DATA_KEY = 'source-task-data';
const MDP_ASSET_REDIS_KEY = 'TemporalDataObject:ManifestMDPList:';
const TDO_UPDATE_LOCK = 'TemporalDataObject:UpdateLock:';
const MDP_ASSET_REDIS_PENDING_FLUSH_SET = 'PendingFlushManifestMDPLists';
const SIGNED_SEGMENT_URIS_KEY = 'SignedSegmentURIs:';
const JOB_CLONE_PAGE_SIZE = 100;
const TASK_CLONE_PAGE_SIZE = 100;
const CLONE_RECORDINGS_PAGE_CONCURRENCY = 5;
/** Max recording IDs allowed on RequestClone.tdoIds (bounded IN-clause / job payload size). */
const REQUEST_CLONE_MAX_TDO_IDS = 1000;

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const app = serviceContext.app;
  const dbConnections = serviceContext.dbConnections;
  const storage = serviceContext.storage;
  const cloneAssetBlob = promisify(storage.cloneAsset);
  const httpUtil = require('../util/httpUtil.js')(serviceContext);
  const tokenHelper = require('../modules/core-job-server/engine-runtime/token.js')(
    serviceContext
  );
  const rbacAuthBll = _.get(
    serviceContext,
    'bll.rbacAuth',
    require('../modules/rbacAuth/bll/rbacAuth.bll.js')(serviceContext)
  );

  const maxMetadataSizeStr = _.get(
    serviceContext,
    'config.rateLimit.maxTDOMetadataSize',
    '1mb'
  );
  const disablePrimaryAssetTypeEnforcement = _.get(
    serviceContext,
    'config.featureFlags.disablePrimaryAssetTypeEnforcement',
    false
  );
  const maxMetadataSize = bytes.parse(maxMetadataSizeStr);

  const errors = require('../error')(config),
    util = require('./util.js')(config, serviceContext),
    mainUtil = require('../util.js')(serviceContext),
    resUtil = require('../resolvers/util.js')(serviceContext),
    magicIdUtil = require('@veritone/core-server-base/parser.recording-id.js')(
      app
    );
  const {
    eventsMap,
    supportedEvents
  } = require('@veritone/core-server-base/events-map.js');
  const messageUtil = serviceContext.messageUtil;
  const localCache = serviceContext.localCache;
  const redisCache = serviceContext.redisCache;
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );

  // internal function that updates a TDO that we have already
  // retrieved and authorized.
  async function doUpdateTDO(context, args, ourTDO) {
    const input = args.input;
    try {
      const requesterId = _.get(context._authInfo, 'userId');

      if (
        input.startDateTime &&
        input.stopDateTime &&
        input.startDateTime === input.stopDateTime
      ) {
        logger.warn(
          `updateTDO ${input.id} with same start and stop time. start: ${input.startDateTime}; stop: ${input.stopDateTime}.`
        );
      }

      // get a copy of the entire json data
      // we'll update this and set back in db
      const json = ourTDO.jsondata;

      // store plain column updates
      const columns = {};
      const conditions = {};

      let tagsChanged = input.details ? input.details.tags : null;
      let nameChanged =
        !_.isNil(input.name) ||
        Boolean(_.get(input, 'details.veritoneFile.fileName', false)) ||
        Boolean(_.get(input, 'details.veritoneFile.filename', false));

      let startTimeChanged = false;
      let stopTimeChanged = false;
      let startDateTime = ourTDO.startDateTime;
      let stopDateTime = ourTDO.stopDateTime;

      // Update start and stop time if they are specified in input.
      // The TDO in cache may be out of sync with DB.
      if (input.startDateTime) {
        startTimeChanged = true;
        startDateTime = convertDateIn(input.startDateTime);
        columns['start_date_time'] = moment(startDateTime).toISOString();
        json.startDateTime = convertDateIn(input.startDateTime, 1000);
      }
      if (input.stopDateTime) {
        stopTimeChanged = true;
        stopDateTime = convertDateIn(input.stopDateTime);
        const dbStopTime = moment(stopDateTime).toISOString();
        columns['stop_date_time'] = dbStopTime;
        json.stopDateTime = convertDateIn(input.stopDateTime, 1000);
        if (_.get(input, 'flags', []).indexOf('preventTrim') >= 0) {
          conditions['stop_date_time'] = { greatest: true };
        }
      }

      const timesChanged = startTimeChanged || stopTimeChanged;
      if (timesChanged) {
        util.validateTDOTimes(json.startDateTime, json.stopDateTime);

        // Update media usage redis cache
        const orgId = args.organizationId;
        if (orgId) {
          const org = await serviceContext.dal.organization.getOrganization(
            context,
            {
              id: orgId
            }
          );
          if (_.get(org, 'kvp.features.mediaLengthLimitMs') !== undefined) {
            const newMediaLength =
              moment(input.stopDateTime).valueOf() -
              moment(input.startDateTime).valueOf();
            const oldMediaLength =
              moment(ourTDO.stopDateTime).valueOf() -
              moment(ourTDO.startDateTime).valueOf();
            updateMediaUsage(context, newMediaLength - oldMediaLength);
          }
        }
      }

      if (input.description) json.description = input.description;
      if (input.source) json.source = input.source;
      if (input.name) json.name = input.name;
      if (input.status) json.status = input.status;

      if (input.primaryAsset) {
        for (let i = 0; i < input.primaryAsset.length; i++) {
          const type = input.primaryAsset[i].assetType;
          const id = input.primaryAsset[i].id;
          switch (type) {
            case 'media':
              json.mediaAsset = _.isNil(id) ? {} : { assetId: id };
              break;
            case 'transcript':
              json.transcriptAsset = _.isNil(id) ? {} : { assetId: id };
              break;
            case 'media-mdp':
              json.mediaMdpAsset = _.isNil(id) ? {} : { assetId: id };
              break;
            default:
              if (disablePrimaryAssetTypeEnforcement) {
                json.primaryAsset = _.isNil(id) ? {} : { assetId: id };
              } else {
                throw new errors.InvalidInput({
                  message:
                    'Cannot set primary asset type to ' +
                    type +
                    '. Valid values are media and transcript.',
                  data: { objectId: input.id, objectType: 'TemporalDataObject' }
                });
              }
              break;
          }
        }
      }

      // certain metadata is set both in JSON and metadata table
      if (input.thumbnailUrl) {
        _.set(
          input,
          'details.veritoneProgram.programLiveImage',
          input.thumbnailUrl
        );
        _.set(json, 'veritoneProgram.programLiveImage', input.thumbnailUrl);
      }
      if (input.sourceImageUrl) {
        _.set(
          input,
          'details.veritoneProgram.programImage',
          input.sourceImageUrl
        );
        _.set(json, 'veritoneProgram.programImage', input.sourceImageUrl);
      }
      if (input.previewUrl) {
        _.set(
          input,
          'details.veritoneProgram.previewAssetUrl',
          input.previewUrl
        );
        _.set(json, 'veritoneProgram.previewAssetUrl', input.previewUrl);
      }
      if (_.hasIn(input, 'addToIndex')) {
        _.set(input, 'details.addToIndex', input.addToIndex);
        _.set(json, 'addToIndex', input.addToIndex);
      } else {
        // check if the TDO still not have addToIndex property in metadata,
        // will add the default value of organization.
        // Otherwise we will not update it if it isn't exists in input param
        if (!_.hasIn(json, 'addToIndex')) {
          let tdoOwnerOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
            ourTDO.applicationId
          );
          if (tdoOwnerOrgId) {
            tdoOwnerOrgId = parseInt(tdoOwnerOrgId);
          }
          const orgDefaultAddToIndex = await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
            context,
            tdoOwnerOrgId || args.organizationId
          );
          _.set(input, 'details.addToIndex', orgDefaultAddToIndex);
          _.set(json, 'addToIndex', orgDefaultAddToIndex);
        }
      }
      const blobs = [];
      // TDO/recording metadata is stored in a separate
      // table where "type" is the key and "contents" the value
      // of each top-level details section. So we need to decompose
      // details and form the rows.

      if (input.details) {
        // do not allow caller to set source-task-data via details on update.
        // it can only be set via sourceData on create.
        if (input.details.sourceData || input.details.source_task_data) {
          throw new errors.InvalidInput({
            message:
              'Cannot set sourceData on details. sourceData ' +
              'can only be set on TDO creation and is immutable.',
            data: {
              details: input.details,
              objectId: input.id,
              objectType: 'TemporalDataObject'
            }
          });
        }
        // VTN-13436 - validate size
        const size = JSON.stringify(input.details).length;
        if (size > maxMetadataSize) {
          throw new errors.InvalidInput({
            message:
              'The asset metadata exceeds the maximum allowed size of ' +
              prettyBytes(maxMetadataSize) +
              '.  ' +
              'To continue, reduce the metadata size or store the data in a separate asset.',
            data: {
              maxAllowedSize: prettyBytes(maxMetadataSize),
              maxAllowedSizeBytes: maxMetadataSize,
              metadataSize: prettyBytes(size),
              metadataSizeBytes: size
            }
          });
        }

        const details = mapper.mapTDODetailKeysToDb(input.details);

        // incoming keys have _ but the database values in the old schema
        // have -.
        Object.keys(details).forEach((key) => {
          blobs.push({
            type: key,
            content: details[key]
          });
        });
      }

      let publicChanged = false;
      if (Object.prototype.hasOwnProperty.call(input, 'isPublic')) {
        _.set(json, 'security.global', input.isPublic);
        _.set(json, 'veritonePermissions.isPublic', input.isPublic);
        columns['is_public'] = input.isPublic;

        // also set value in veritonePermissions
        blobs.push({
          type: 'veritone-permissions',
          content: json.veritonePermissions
        });

        // set flag indicating that public has changed. we'll need to re-index.
        publicChanged = input.isPublic !== ourTDO.isPublic;
      }
      // keep recording.json.veritoneClone in sync with recording_metadata veritone-clone
      if (input.details) {
        const cloneData =
          input.details.veritoneClone ?? input.details['veritone-clone'];
        if (cloneData != null) {
          json.veritoneClone = cloneData;
        }
      }
      // set the new JSON blob in column data
      columns.json = json;

      // set the JSON blob set condition to merge with the existing blob
      // this is done to alleviate race condition issues by not overwriting existing keys that
      // were not retrieved during getTDO at the beginning of this call.
      conditions.json = {
        transform: (columnName, columnValue) =>
          `${columnName} = ${columnName}::jsonb || ${columnValue}::jsonb`
      };
      columns.modified_by = requesterId;

      await applyContentTemplates(context, args, ourTDO);

      if (nameChanged) {
        // update all existing fields to the new name
        const newName =
          input.name || _.get(input, 'details.veritoneFile.fileName');
        _.set(json, 'details.veritoneFile.fileName', newName);

        // if the legacy field exist - update it.
        if (_.get(json, 'details.veritoneFile.filename')) {
          _.set(json, 'details.veritoneFile.filename', newName);
        }

        // add filename to metadata
        // found existing veritone-file blob. If the blobs array contains
        // duplicate keys only the last one is inserted in the db.
        let found = false;
        for (const blob of blobs) {
          if (blob.type === 'veritone-file') {
            _.set(blob, 'content.fileName', newName);
            found = true;
            break;
          }
        }
        if (!found) {
          blobs.push({
            type: 'veritone-file',
            content: { fileName: newName }
          });
        }
      }

      // update the recording and recording_metadata tables
      const updatedTdo = await updateTDODb(
        input.id,
        blobs,
        columns,
        conditions
      );
      let res = updatedTdo;

      // add to redis cache so other instances see the change
      res = await updateTDOCache(res.id, res, [], timesChanged);
      serviceContext.redisCache.clear('TemporalDataObject.details', res.id);

      updatedTdo.fileType = _.get(input, 'details.veritoneFile.mimetype');

      let indexedAfterUpdateMediaDb = false;
      let indexedIfTdoIsCompleted = false;

      if (
        nameChanged ||
        tagsChanged ||
        timesChanged ||
        publicChanged ||
        updatedTdo.fileType ||
        input.primaryAsset ||
        input.thumbnailUrl
      ) {
        await updateMediaDb(context, updatedTdo);
        if (input.skipIndexing !== true) {
          indexedAfterUpdateMediaDb = true;
          const indexRes = updateTDOIndex(
            context,
            args,
            updatedTdo,
            startTimeChanged,
            moment(ourTDO.startDateTime),
            moment(updatedTdo.startDateTime),
            buildPreviousTimes(
              ourTDO,
              updatedTdo.startDateTime,
              updatedTdo.stopDateTime
            )
          );
          // unless otherwise configured, we make the call to
          // task-insert-server asynchronous. no reason to wait for it to complete
          // here. sometimes this takes 20s+.
          if (_.get(config, 'synchronousTDOIndexUpdate', false)) await indexRes;
        }
      }

      // detects if this TDO has been "completed" and takes appropriate action
      // skip if timesChanged because we already updatedIndex
      if (!timesChanged && input.status === 'recorded' && input.skipIndexing !== true) {
        indexedIfTdoIsCompleted = true;
        await addSearchIndex(context, args, updatedTdo);
      }

      const contentTemplates = input.contentTemplates
        ? input.contentTemplates
        : [];
      // tdo will be reindexing if it has new contentTemplates and has not been reindexed before
      if (
        !indexedAfterUpdateMediaDb &&
        !indexedIfTdoIsCompleted &&
        input.skipIndexing !== true &&
        contentTemplates.length > 0
      ) {
        await addSearchIndex(context, args, updatedTdo);
      }

      // if this update completed the TDO ingestion,
      // we might need to refresh its MDP asset with the final segment list.
      if (input.status === 'recorded') {
        const longestMdpAsset = await getLongestMdpAssetWithCache(
          context,
          res.id
        );
        if (longestMdpAsset) {
          // don't wait on the s3 upload to complete
          refreshMdpAsset(
            res.id,
            longestMdpAsset.uri,
            fixDateFromRedis(json.stopDateTime),
            _.get(longestMdpAsset, 'metadata.segmentGroupId'),
            longestMdpAsset.id
          );
        } // otherwise it's not a segmented TDO; addMediaSegment was never called

        triggerCorrelation(context, args, updatedTdo);
      }

      emitRecordinUpdatedAuditEvent(context, { recordingId: input.id }, null);

      // TODO option to update stopDateTime on TDO completion based on media assets

      // const cacheKey = tdoCacheKey(ourTDO, args);
      // localCache.clear('TemporalDataObject', cacheKey);
      localCache.clear('TDONumSegments', res.id);
      localCache.clear('TDOSourceTaskData', res.id);

      return res;
    } catch (error) {
      emitRecordinUpdatedAuditEvent(context, { recordingId: input.id }, error);
      throw error;
    }
  }

  function emitRecordinUpdatedAuditEvent(context, data, error) {
    const clientInfo = resUtil.getClientInfo(context);
    const userName =
      clientInfo.userName || clientInfo.appName || clientInfo.organizationName;
    const isInvalidIdError = error?.name === 'not_found';
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.RecordingUpdated.event,
      type: eventsMap.RecordingUpdated.type,
      recordingId: data.recordingId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        data.recordingId,
        error,
        null,
        null,
        !error
          ? `Updated TDO ${data.recordingId}`
          : `Failed to update TDO ${isInvalidIdError ? undefined : data.recordingId}`
      )
    };
    !error && messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
    messageUtil.emitPublicEvent(
      supportedEvents.RecordingUpdated,
      'system',
      context,
      event
    );
  }

  async function clearCachedTDO(tdo, args, tdoIsDeleted) {
    const cacheKey = tdoCacheKey(tdo, args);
    localCache.clear('TemporalDataObject', cacheKey);
    localCache.clear('TDONumSegments', tdo.id);
    localCache.clear('TDOSourceTaskData', tdo.id);
    const promises = [
      redisCache.clear('TemporalDataObject', tdo.id),
      redisCache.clear('TemporalDataObject.details', tdo.id)
    ];
    if (tdoIsDeleted === true) {
      promises.push(
        redisCache.markResourceToBeDeleted('TemporalDataObject', tdo.id)
      );
      promises.push(
        redisCache.markResourceToBeDeleted('TemporalDataObject.details', tdo.id)
      );
    }
    await Promise.all(promises);
  }

  async function syncMediaMdpAsset(context, tdoId) {
    let tdo = await getTDO(context, {
      id: tdoId,
      useCache: true
    });

    logger.debug('ASSET-TDO> Got tdo %s', tdo);
    logger.debug('ASSET-TDO> tdo jsondata %s', tdo.jsondata);
    logger.debug(
      'ASSET-TDO> tdo jsondata.mediaMdpAsset %s',
      tdo.jsondata.mediaMdpAsset
    );

    const longestMdpAsset = await getLongestMdpAssetWithCache(context, tdoId);
    if (longestMdpAsset && tdo) {
      // don't wait on the s3 upload to complete
      return refreshMdpAsset(
        tdo.id,
        longestMdpAsset.uri,
        tdo.stopDateTime,
        _.get(longestMdpAsset, 'metadata.segmentGroupId'),
        longestMdpAsset.id
      );
    }
  }
  // main interface function to update a TDO
  async function updateTDO(context, args) {
    if (!args.input) {
      throw new errors.InvalidInput({
        message:
          'The "input" field is required by updateTDO. Set this field ' +
          'with appropriate values and try the mutation again.'
      });
    }

    const input = args.input;

    // verify that ID is in acceptable format
    checkTDOID(input.id);

    // we need to get the object first to fill in old data
    // and validate access.
    const ourTDO = await getTDO(context, {
      id: input.id,
      applicationId: args.applicationId,
      _writeAccessRequest: true
    });
    return doUpdateTDO(context, args, ourTDO);
  }

  function emitRecordingDeletedAuditEvent(context, event, error) {
    const clientInfo = resUtil.getClientInfo(context);
    const userName =
      clientInfo.userName || clientInfo.appName || clientInfo.organizationName;
    event = {
      ...event,
      actionInfo: messageUtil.buildActionInfo(
        event.recordingId,
        error,
        'delete',
        !error ? 'success' : 'failure',
        !error
          ? `Deleted TDO ${event.recordingId}`
          : `Failed to delete TDO ${event.recordingId}`
      )
    };
    messageUtil.emitPublicEvent(
      supportedEvents.RecordingDeleted,
      'system',
      context,
      event
    );
  }

  // internal function that submits a delete task to task-insert-server
  // for a given TDO
  function cleanupSearchIndex(context, tdo) {
    const id = tdo.id || tdo.recordingId;
    if (!id) throw new Error('tdo.id is required'); // server bug
    const { applicationId, orgId, organizationId } = tdo;
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.RecordingDeleted.event,
      type: eventsMap.RecordingDeleted.type,
      recordingId: id,
      payload: {
        applicationId: applicationId || '', // orgGuid
        organizationId: orgId || organizationId || ''
      }
    };
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
    emitRecordingDeletedAuditEvent(context, event);
  }

  // internal function that submits a folder update event
  // for a given TDO
  async function updateFolderInSearchIndex(context, tdo) {
    const id = tdo.id || tdo.recordingId;
    if (!id) throw new Error('tdo.id is required'); // server bug
    const event = {
      serviceName: 'core-graphql-server',
      event: 'recording_folder_changed',
      type: 'recording',
      recordingId: id
    };
    return messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
  }

  // internal function that submits an task to task-insert-server
  // for a given TDO.
  // previousTimes is optional - see updateTDOIndex. Callers that have no previous
  // timespan to report omit it, and the indexer then skips stale-slice cleanup.
  async function addSearchIndex(context, args, tdo, previousTimes) {
    const token = util.getToken(context, true);
    let tdoOwnerOrgId;
    if (tdo.applicationId) {
      tdoOwnerOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        tdo.applicationId
      );
    }
    const orgId = tdoOwnerOrgId || args.organizationId;
    const addToIndex = _.get(
      tdo,
      'jsondata.addToIndex',
      await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
        context,
        orgId
      )
    );

    serviceContext.dal.asset.emitRecordingCognitionCompletedEvent(
      undefined,
      tdo.id,
      token,
      orgId,
      addToIndex,
      {
        // elasticsearch has a 30s flush so data wouldn't be available immediately anyway
        delayMs: _.get(config, 'indexingDelay', 10000),
        context,
        previousTimes
      }
    );
    logger.debug('task-insert-server index event created for ' + tdo.id);
  }

  // Builds the previous-timespan payload used by the indexer to delete stale
  // time-slice documents (VE-26223). Returns undefined when no cleanup is needed.
  //
  // Only returns the previous timespan when the TDO becomes shorter. Sending it
  // on every update would prevent those events from being dropped by dedupe,
  // including frequent updates to live TDOs.
  function buildPreviousTimes(previousTdo, newStartDateTime, newStopDateTime) {
    if (
      !previousTdo ||
      _.isNil(previousTdo.startDateTime) ||
      _.isNil(previousTdo.stopDateTime) ||
      _.isNil(newStartDateTime) ||
      _.isNil(newStopDateTime)
    ) {
      return undefined;
    }

    // Normalize ISO strings and Unix timestamps to Unix seconds before comparing.
    const toUnixSeconds = (value) => {
      if (!Number.isInteger(value)) {
        return moment(value).unix();
      }
      return mainUtil.isTimeInSeconds(value) ? value : Math.floor(value / 1000);
    };

    const previousStartDateTime = toUnixSeconds(previousTdo.startDateTime);
    const previousStopDateTime = toUnixSeconds(previousTdo.stopDateTime);
    const previousDuration = previousStopDateTime - previousStartDateTime;
    const newDuration =
      toUnixSeconds(newStopDateTime) - toUnixSeconds(newStartDateTime);

    if (previousDuration <= newDuration) {
      return undefined;
    }

    return { previousStartDateTime, previousStopDateTime };
  }

  // internal function that submits tasks to re-index all assets
  // associated with a given TDO. This is used when the start/stop
  // time or any other field that affects indexing.
  //
  // previousTimes is opaque here - passed straight to the indexer, see
  // buildPreviousTimes.
  async function updateTDOIndex(
    context,
    args,
    tdo,
    startTimeChanged,
    oldStartTime,
    newStartTime,
    previousTimes
  ) {
    // first delete the old indices only if startDateTime was updated
    if (startTimeChanged) {
      let deleteFromIndex = true;
      if (oldStartTime && newStartTime) {
        // Detect old == new
        if (Math.abs(oldStartTime.diff(newStartTime, 'minutes')) < 1) {
          deleteFromIndex = false;
        } else {
          // Check if the tdo has moved more than a week, since we partition the index by week.
          if (oldStartTime.isoWeek() === newStartTime.isoWeek()) {
            deleteFromIndex = false;
          }
        }
      }
      if (deleteFromIndex) {
        // delete from old index only when the tdo would be in a new index
        // else this creates a race condition that may result on tdo not being indexed
        await cleanupSearchIndex(context, tdo);
      }
    }
    await clearCachedTDO(tdo, args); // invalidate the cache entries for the TDO
    return addSearchIndex(context, args, tdo, previousTimes);
  }

  async function triggerCorrelation(context, args, tdo) {
    const sourceId = _.get(tdo, 'jsondata.sourceId', tdo.sourceId);
    const programId =
      _.get(tdo, 'jsondata.programId') || _.get(tdo, 'jsondata.scheduledJobId');

    // Don't trigger correlation if missing source and program information
    if (!sourceId || !programId) return;
    const event = {
      serviceName: 'core-graphql-server',
      event: 'correlate_tdo',
      type: 'correlation',
      tdoId: tdo.id,
      organizationId: args.organizationId || resUtil.getClientInfo(context).org,
      sourceId,
      programId,
      correlationId: context.requestInfo.correlationId,
      timestampMs: Date.now()
    };
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
  }

  /**
   * Updates a TDO using a direct database call.
   */
  async function updateTDODb(
    id,
    metadataBlobs = [],
    columns = {},
    columnConditionals = {}
  ) {
    if (!id) throw new Error('id parameter is required'); // server bug

    // Inject modified_date_time for any db updates
    if (!_.has(columns, 'modified_date_time')) {
      const now = moment();
      columns.modified_date_time = now.toISOString();
      columns.json.modifiedDateTime = now.unix();
    }

    const { sql, values } = mainUtil.makeUpdateSql(
      'recording.recording',
      columns,
      {
        recording_id: 'id',
        json: null,
        created_date_time: null,
        modified_date_time: null,
        start_date_time: null,
        stop_date_time: null,
        is_public: null,
        source_id: null,
        scheduled_job_id: null,
        application_id: null,
        organization_id: null,
        created_by: null,
        modified_by: null
      },
      `recording_id = '${id}'`,
      0,
      false,
      {},
      {},
      columnConditionals
    );

    let query = sql;
    metadataBlobs.forEach((blob) => {
      let type = blob.type;
      let content = blob.content;
      values.push(type);
      values.push(JSON.stringify(content));
      query += `
  DELETE FROM recording.recording_metadata
  WHERE recording_id = '${id}' AND type = \$${values.length - 1}
  ;
  INSERT INTO
    recording.recording_metadata (
      type,
      content,
      recording_id
    ) VALUES (
      \$${values.length - 1},
      \$${values.length},
      '${id}'
    )
  ;
      `;
    });

    const dbconn = dbConnections['core'].write;
    const rows = await dbconn.map(query, values, mapper.mapRecording);
    if (!rows.length) {
      throw new errors.NotFound({
        message:
          'The object was found, but could not be updated. It may ' +
          'have been deleted mid-request due to a race condition.',
        data: {
          objectId: id,
          objectType: 'TemporalDataObject'
        }
      });
    }
    return rows[0];
  }

  async function updateMediaDb(context, tdo) {
    const dbconn = dbConnections['media_platform'].write;
    const args = [
      new Date(tdo.startDateTime),
      new Date(tdo.stopDateTime),
      parseInt(tdo.id), // in the media table this is a number field
      tdo.applicationId,
      tdo.isPublic
    ];
    const query = `
      UPDATE
        public.media
      SET
        media_start_time = $1::timestamp,
        media_stop_time = $2::timestamp,
        is_public = $5${
          !_.isNil(tdo.fileType)
            ? `, file_type = $${args.push(tdo.fileType)}`
            : ''
        }
      WHERE
        media_id = $3 AND owner_application_id = $4
      RETURNING
        media_id, media_start_time, media_stop_time
    `;

    try {
      const res = await dbconn.one(query, args);
      return res;
    } catch (err) {
      throw new errors.InternalServerError({
        message:
          'The target object was partially updated, but some ' +
          'elements could not be persisted. Start and stop time may appear ' +
          'incorrectly in some clients',
        data: {
          objectId: tdo.id,
          objectType: 'TemporalDataObject',
          startDateTime: tdo.startDateTime,
          stopDateTime: tdo.stopDateTime
        }
      });
    }
  }

  /**
   * Converts the provided value to time in seconds since epoch.
   */
  function convertDateIn(dateVal, div = 1) {
    let res = dateVal;

    // if it's a number, don't parse
    if (Number.isInteger(res)) {
      if (!mainUtil.isTimeInSeconds(res)) {
        // do check if it looks like ms.
        res = Math.floor(res / div); // convert to s
      }
    } else if (dateVal) {
      // raw number - convert
      if (validator.isNumeric(_.toString(res))) {
        res = parseInt(res);
        if (!mainUtil.isTimeInSeconds(res)) {
          // if this looks like ms...
          res = Math.floor(res / div); // convert to s
        }
      } else {
        // it's a date string. parse and return s.
        res = Math.floor(moment(res).valueOf() / div);
      }
    }

    return res;
  }

  async function addSourceDataToNewTdo(
    context,
    input,
    jsondata,
    details,
    addedVeritonePermissions
  ) {
    // set source ID on legacy metadata if it was provided.
    // note that source ID is written to the new join table
    // in setupNewTdo(), below.
    // createTDOWithAsset takes direct sourceId or sourceData.sourceId
    // createTDO takes only sourceData. so need some special logic here
    // to tolerate both formats.
    let sourceId = _.get(context, '_authInfo.sourceId') ?? input.sourceId ?? _.get(input, 'sourceData.sourceId');
    mainUtil.checkId(
      sourceId,
      true /* allow empty */,
      true /* allow number */,
      false /* allow UUID */
    );
    if (sourceId) {
      input.sourceId = sourceId;
      sourceId = _.toString(sourceId);
      if (!input.sourceData) input.sourceData = { sourceId };
      jsondata.mediaSourceId = sourceId;
      if (!details.veritoneMediaSource) details.veritoneMediaSource = {};
      details.veritoneMediaSource.mediaSourceId = input.sourceData.sourceId = sourceId;
      // attempt to set mediaSourceTypeId to support legacy indexing.
      const theSource =
        input.__cachedSource ||
        (await serviceContext.dal.source.getSource(context, {
          id: sourceId,
          applicationId: input.applicationId,
          organizationId: input.organizationId
        }));
      const theSourceType = await serviceContext.dal.sourceType.getSourceType(
        context,
        {
          id: theSource.sourceTypeId,
          applicationId: input.applicationId,
          organizationId: input.organizationId
        }
      );
      // for legacy stuff "mediaSourceTypeId" is actually categoryId.
      details.veritoneMediaSource.mediaSourceTypeId = _.toString(
        theSourceType.categoryId || theSourceType.id || 5
      );

      // VTN-13483 - add source collaborators to veritone-permissions
      // UNLESS the caller explicitly specified the value.
      // Avoid adding source collaborators if source is -1 or has no organizationId
      if (
        addedVeritonePermissions &&
        theSource.organizationId &&
        _.toString(theSource.id) !== '-1'
      ) {
        const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
          input.organizationId
        );

        // first get collaborators for the provided source.
        const sourceCollaborators = await serviceContext.dal.source.getCollaborators(
          context,
          {},
          theSource
        );
        sourceCollaborators.records.forEach((collab) => {
          // don't re-add the owner's acl and customer success acl
          if (!(collab.permission === 'owner' && collab.groupId === groupId)) {
            // add acl entry for this source collaborator
            details.veritonePermissions.acls.push({
              groupId: collab.groupId,
              permission: collab.permission
            });
          }
        });
      }
    }
  }

  async function addSJDataToNewTdo(context, input, jsondata, details) {
    // if scheduled job (aka program in old schema) was passed,
    // set its metadata here on legacy schema.
    // note that there is additional processing for scheduled job
    // in setupNewTdo(), below.
    let sjId =
      input.scheduleId ||
      input.scheduledJobId ||
      _.get(input, 'sourceData.scheduledJobId');
    if (sjId) {
      input.scheduledJobId = sjId;
      sjId = _.toString(sjId);
      jsondata.programId = sjId;
      let sj = await serviceContext.dal.scheduledJob.getScheduledJob(context, {
        id: sjId,
        applicationId: input.applicationId,
        organizationId: input.organizationId
      });
      if (!input.sourceData) input.sourceData = {};
      input.sourceData.scheduledJobId = sjId;

      if (!details.veritoneProgram) details.veritoneProgram = {};
      // note that scheduleId will overrride program ID set in details
      details.veritoneProgram.programId = sjId;
      details.veritoneProgram.programName = sj ? sj.name : 'Program ' + sjId;

      // pass the scheduledJob to input along with sjId to avoid extra call later
      input.scheduledJob = sj;
    }
  }

  async function checkVeritonePermissions(context, input, jsondata, details) {
    let addedVeritonePermissions = false;
    // VTN-13483 - add veritone-permissions so that search works
    // UNLESS user has provided the data explicitly in the createTDO payload.
    if (!details.veritonePermissions) {
      const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        input.organizationId
      );

      addedVeritonePermissions = true;
      details.veritonePermissions = {
        // isPublic flag is duplicated here
        isPublic: _.isNil(input.isPublic) ? false : input.isPublic,
        acls: [
          // add initial owner acl for TDO creator org
          {
            groupId, // get group for app id
            permission: 'owner'
          }
        ]
        // default to current org/group as owner
      };
    }
    return addedVeritonePermissions;
  }

  function addLegacyFormatToNewTDO(input, jsondata, details) {
    if (input.name) {
      _.set(details, 'veritoneFile.fileName', input.name);
    }
    if (input.thumbnailUrl) {
      _.set(details, 'veritoneProgram.programLiveImage', input.thumbnailUrl);
    }
    if (input.sourceImageUrl) {
      _.set(details, 'veritoneProgram.programImage', input.sourceImageUrl);
    }
    if (input.previewUrl) {
      _.set(details, 'veritoneProgram.previewAssetUrl', input.previewUrl);
    }
    jsondata.applicationId = input.applicationId;
    jsondata.status = input.status;
    jsondata.source = input.source;
  }

  async function addClusterDataToNewTdo(context, input) {
    const clusterId = _.get(input, 'sourceData.clusterId');
    const taskId = _.get(input, 'sourceData.taskId');

    if (!clusterId && taskId) {
      // Task may not be created at this point so safely try to get task
      const tasks = await serviceContext.dal.task.getTasks(context, {
        id: taskId
      });

      if (tasks.count === 1) {
        const job = await serviceContext.dal.job.getJob(context, {
          id: _.get(tasks, 'records[0].jobId')
        });

        if (job && job.clusterId) {
          _.set(input, 'sourceData.clusterId', job.clusterId);
        }
      }
    }
  }

  async function createTDO(context, args) {
    const input = args.input;
    const deferredEvents = [];
    const emitRecordingCreatedAuditEvent = (error) => {
      const clientInfo = resUtil.getClientInfo(context);
      const userName =
        clientInfo.userName ||
        clientInfo.appName ||
        clientInfo.organizationName;
      const event = {
        serviceName: 'core-graphql-server',
        recordingId: input.id,
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(
          input.id,
          error,
          'create',
          !error ? 'success' : 'failure',
          !error ? `Created TDO ${input.id}` : `Failed to create TDO`
        )
      };
      messageUtil.emitPublicEvent(
        supportedEvents.RecordingCreated,
        'system',
        context,
        event
      );
    };
    const requesterId = _.get(context._authInfo, 'userId');
    const _createTDOStartTime = Date.now();
    try {
      if (!input) {
        throw new errors.InvalidInput({
          message:
            'The "input" field is required by createTDO. Set this field ' +
            'with appropriate values and try the mutation again.'
        });
      }
      if (!input.applicationId) {
        throw new errors.InvalidInput({
          message:
            'An application ID is required for authorization to create ' +
            'a TDO, but one could not be extracted from the mutation input or security ' +
            'context. Ensure that applicationId is available and try the mutation again.'
        });
      }

      const size = JSON.stringify(input.details || {}).length;
      if (size > maxMetadataSize) {
        throw new errors.InvalidInput({
          message:
            'The asset metadata exceeds the maximum allowed size of ' +
            prettyBytes(maxMetadataSize) +
            '.  ' +
            'To continue, reduce the metadata size or store the data in a separate asset.',
          data: {
            maxAllowedSize: prettyBytes(maxMetadataSize),
            maxAllowedSizeBytes: maxMetadataSize,
            metadataSize: prettyBytes(size),
            metadataSizeBytes: size
          }
        });
      }

      //Check if media limits have been exceeded
      const canCreateTDO = await util.checkMediaLimits(context, args);
      if (!canCreateTDO) {
        throw new errors.RateLimited({
          message:
            'The current monthly media upload limit has been exceeded. ' +
            'Upgrade your subscription and try the mutation again'
        });
      }

      // if the client provided assets in-line, validate that there aren't too many.
      const maxAssetsOnCreate = _.get(
        serviceContext,
        'config.rateLimit.maxAssetsOnCreateTDO',
        50
      );
      if (_.get(input, 'assets.count', 0) > maxAssetsOnCreate) {
        throw new errors.InvalidInput({
          message:
            'A maximum of ' +
            maxAssetsOnCreate +
            ' can be created in a single createTDO mutation. ' +
            'Use createTDO and createAsset to create the assets in multiple API calls.',
          data: {
            numAssetsProvided: _.get(input, 'assets.count'),
            maxAssets: maxAssetsOnCreate
          }
        });
      }

      // get incoming details. we will add some additional blocks to
      // this, and then map to the recording_metadata format.
      const details = input.details || {};

      // this is going to be the json column on the TDO
      const jsondata = {};

      // default the stopDateTime (used only in some code paths)
      if (!input.stopDateTime) {
        // make sure to convert start time consistently to seconds before
        // we compute default stop time
        const startDateTimeSec = convertDateIn(input.startDateTime, 1000);
        const durationSec = config.defaultChunkSizeSec || 15 * 60;
        // make sure to convert start time consistently to seconds before
        // we compute default stop time (fixDateTime return is string or ms)
        input.stopDateTime = moment(mainUtil.fixDateTime(input.startDateTime))
          .add(durationSec, 'seconds')
          .valueOf();
        logger.warn(
          `Create TDO ${input.id} with unspecified stop time. Start: ${input.startDateTime}; Stop: ${input.stopDateTime}`
        );
      } else {
        if (input.stopDateTime === input.startDateTime)
          logger.warn(
            `Create TDO ${input.id} with 0 duration. Start: ${input.startDateTime}; Stop: ${input.stopDateTime}`
          );
      }

      jsondata.startDateTime = convertDateIn(input.startDateTime, 1000);
      jsondata.stopDateTime = convertDateIn(input.stopDateTime, 1000);
      util.validateTDOTimes(jsondata.startDateTime, jsondata.stopDateTime);

      if (input.applicationId && !input.organizationId) {
        input.organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
          input.applicationId
        );
      }

      if (input.isPublic === true) {
        jsondata.security = {
          global: true
        };
      }

      let addedVeritonePermissions = await checkVeritonePermissions(
        context,
        input,
        jsondata,
        details
      );
      await addSourceDataToNewTdo(
        context,
        input,
        jsondata,
        details,
        addedVeritonePermissions
      );
      await addSJDataToNewTdo(context, input, jsondata, details);

      addLegacyFormatToNewTDO(input, jsondata, details);

      // set the "addToIndex" to TDO's details and metadata
      if (input.organizationId && !_.has(input, 'addToIndex')) {
        input.addToIndex = await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
          context,
          input.organizationId
        );
      }
      _.set(details, 'addToIndex', input.addToIndex);

      const metadata = mapper.mapTDODetailKeysToDb(details);

      // if source data was explicitly passed in, save it
      if (input.sourceData) {
        await addClusterDataToNewTdo(context, input);
        metadata[SOURCE_TASK_DATA_KEY] = input.sourceData;
      }

      metadata.name = input.name;

      // Set fileType based on the mimetype set in details
      // so it is saved in media table
      input.fileType = _.get(details, 'veritoneFile.mimetype');

      input.startDateTime = convertDateIn(input.startDateTime);
      input.stopDateTime = convertDateIn(input.stopDateTime);
      const mediaRes = await createInMediaTable(
        context,
        input,
        Object.assign(details, jsondata)
      );
      input.id = _.toString(mediaRes.media_id);
      input.createdBy = requesterId;
      input.createdDateTime = mediaRes.created_date_time;
      input.modifiedDateTime = mediaRes.modified_date_time;
      jsondata.createdDateTime = convertDateIn(input.createdDateTime, 1000);
      jsondata.modifiedDateTime = convertDateIn(input.modifiedDateTime, 1000);
      jsondata.recordingId = input.id;

      const recRes = await createInRecordingTable(
        context,
        input,
        Object.assign(details, jsondata),
        metadata
      );

      // the response object from createRecording is incomplete.
      // so we'll do a fresh retrieval to return complete data.

      let newTDO = await getTDO(context, {
        id: input.id
      });

      if (input.parentFolderId) {
        // default new recording to orderIndex = 0
        const param = {
          input: {
            tdoId: newTDO.id,
            folderId: input.parentFolderId,
            applicationId: args.applicationId || input.applicationId,
            organizationId: args.organizationId || input.organizationId,
            skipIndexing: true
          }
        };
        await serviceContext.dal.folder.fileTDO(context, param);
      }

      // if the input includes a new asset (createTDOWIthAsset),
      // create it here
      if (input.assetType) {
        newTDO = await addInitialAssetToNewTDO(context, args, newTDO, deferredEvents);
      }

      // if input included assets (new way as of may 2019), create them now.
      if (input.assets) {
        const proms = [];
        input.assets.forEach((asset) => {
          const assetInput = Object.assign(
            {
              containerId: input.id,
              applicationId: input.applicationId,
              __skipAssetCountCheck: true
            },
            asset
          );
          proms.push(
            serviceContext.dal.asset.createAssetAuthorized(
              assetInput,
              context,
              newTDO,
              deferredEvents
            )
          );
        });
        await Promise.all(proms);
      }

      const orgId = args.organizationId || _.get(args, 'input.organizationId');
      let org;
      if (orgId) {
        org = await serviceContext.dal.organization.getOrganization(context, {
          id: orgId
        });
      }

      // implement other new TDO boilerplate tasks
      // - content templates
      // - launch scheduled job
      // - RBAC
      // - indexing
      await newTdoSetup(context, args, newTDO, org, deferredEvents);

      // add to redis cache. async; no need to wait for it.
      await serviceContext.redisCache.asyncSet(
        'TemporalDataObject',
        newTDO.id,
        newTDO
      );
      await serviceContext.redisCache.asyncSet(
        'TemporalDataObject.details',
        newTDO.id,
        details || {}
      );

      // incr/set redis cache for org media usage
      if (_.get(org, 'kvp.features.mediaLengthLimitMs') !== undefined) {
        const mediaUsageDelta =
          moment(newTDO.stopDateTime).valueOf() -
          moment(newTDO.startDateTime).valueOf();
        updateMediaUsage(orgId, mediaUsageDelta);
      }

      // now fire all deferred events
      if (deferredEvents.length > 0) {
        deferredEvents.forEach((fileEvent) => {
          if (_.isFunction(fileEvent)) {
            fileEvent();
          }
        });
      }

      emitRecordingCreatedAuditEvent();
      return newTDO;
    } catch (err) {
      emitRecordingCreatedAuditEvent(err);
      throw err;
    }
  }

  async function updateMediaUsage(orgId, mediaUsageDelta) {
    try {
      const mediaUsageCacheString = `${orgId}-${
        moment().month() + 1
      }-${moment().year()}`;
      // Check org's media usage
      const mediaUsage = await serviceContext.redisCache.get(
        `mediaUsageMs`,
        mediaUsageCacheString
      );

      if (mediaUsage) {
        // if exists incr new media usage
        await serviceContext.redisCache.incrBy(
          `mediaUsageMs`,
          mediaUsageCacheString,
          mediaUsageDelta
        );
      } else {
        // else set media usage and exp date for new cache key
        const expDate =
          moment().endOf('month').valueOf() - new Date().valueOf();
        await serviceContext.redisClient.set(
          `core-graphql-server:mediaUsageMs:${mediaUsageCacheString}`,
          mediaUsageDelta,
          'EX',
          Math.ceil(expDate / 1000) // Convert to seconds for redis
        );
      }
    } catch (err) {
      // VTN-19962 make sure we catch any async error updating the media
      // usage and handle it here.
      // warn only, rather than throwing out and failing a user request,
      // because the worst that happens is that they org gets some free
      // media processed bytes for the month.
      serviceContext.logger.warn('updateMediaUsage error:  ' + err);
    }
  }

  async function addInitialAssetToNewTDO(context, args, newTdo, deferredEvents) {
    const input = args.input;
    // now we need to create the asset
    const assetInput = {
      uri: input.uri,
      assetType: input.assetType,
      contentType: input.contentType,
      // Backward compat: createTDOWithAsset schema previously defaulted to video/mp4
      defaultContentType: 'video/mp4',
      applicationId: input.applicationId,
      containerId: newTdo.id,
      file: input.file,
      sourceData: input.sourceData,
      organizationId: input.organizationId,
      updateContainerStopDateTime: input.updateStopDateTimeFromAsset
    };
    const newAsset = await serviceContext.dal.asset.createAssetAuthorized(
      assetInput,
      context,
      newTdo,
      deferredEvents
    );

    // last, we need to set the primary media asset on the new TDO.
    const update = {
      input: {
        id: newTdo.id,
        primaryAsset: [
          {
            assetType: 'media',
            id: newAsset.id
          }
        ],
        skipIndexing: true
      }
    };
    const updated = await doUpdateTDO(context, update, newTdo);

    return updated;
  }

  async function newTdoSetup(context, args, tdo, org, deferredEvents) {
    const input = args.input;

    // note that source_id and is_public columns are populated in
    // core-recording-server dal as of july 18 2018

    if (input.launchProgram == true) {
      let sjId =
        input.scheduleId ||
        input.scheduledJobId ||
        _.get(input, 'sourceData.scheduledJobId');
      let scheduledJob = input.scheduledJob;
      const sourceId = _.get(context, '_authInfo.sourceId') ?? input.sourceId ?? _.get(input, 'sourceData.sourceId');

      const startDateTime = input.startDateTime;

      // looks up scheduleJob for given time and source
      if (!sjId && sourceId && startDateTime) {
        if (!scheduledJob) {
          scheduledJob = await serviceContext.dal.scheduledJob.getScheduleJobForMediaSourceIdAndTime(
            sourceId,
            startDateTime
          );
        }

        sjId = _.get(scheduledJob, 'id');
      }

      // see if we need to launch the ScheduledJob
      if (
        sjId &&
        scheduledJob &&
        _.get(serviceContext, 'config.featureFlags.startV3Job', false) === true
      ) {
        const v3Event = {
          event: 'legacyV3JobWarning',
          level: 'warn',
          timestamp: moment().toISOString(),
          scheduledJobId: sjId,
          tdoId: tdo.id
        };

        const applicationId = args.applicationId || input.applicationId;
        const job = await startV3Job(
          context,
          sjId,
          tdo.id,
          args.organizationId,
          applicationId,
          scheduledJob
        );
      }
    }

    const contentTemplates = await applyContentTemplates(context, args, tdo, deferredEvents);

    // add RBAC ACLs
    // this has to be done after the tdo is filed in the folder
    const useRBACFeature = await mainUtil.isEnableFeatureInOrganization(
      context,
      org,
      org.id,
      'enableRBACFeature'
    );

    if (useRBACFeature) {
      const rbacArgs = {
        org: org,
        organizationId: org.id,
        objectId: _.get(tdo, 'id'),
        resourceType: 'TDO'
      };
      await rbacAuthBll.addDefaultACEsToResources(context, rbacArgs);
    }

    // should index tdo after asset creation
    if (input.addToIndex && args.skipIndexing !== true) {
      await addSearchIndex(context, args, tdo);
    }
  }

  /**
   * Applies content templates, if applicable, to the new TDO.
   */
  async function applyContentTemplates(context, args, tdo, deferredEvents) {
    const sourceId = _.get(args, 'input.sourceData.sourceId');
    const sjId = _.get(args, 'input.sourceData.scheduledJobId');
    const taskId = _.get(args, 'input.sourceData.taskId');
    // TODO get sj off task?

    const sdos = []; // { sdoId, schemaId, sourceData { sourceId sjId taskId } }
    if (sourceId) {
      // get content templates off source
      const sourceData = {
        sourceId,
        taskId: taskId // TODO check
      };
      const sql = `
select sdo_id, data_registry_id from source_content_template where source_id = $1;
      `;
      const res = await dbConnections['media_platform'].read.map(
        sql,
        [sourceId],
        mapper.camelizeRootKeys
      );
      res.forEach((row) => sdos.push({ sourceData, row }));
    }

    if (sjId) {
      // get content templates off scheduled job
      const sourceData = {
        scheduledJobId: sjId,
        taskId: taskId
      };
      const sql = `
  select sdo_id, data_registry_id from scheduled_job_content_template where scheduled_job_id = $1;
      `;
      const res = await dbConnections['media_platform'].read.map(
        sql,
        [sjId],
        mapper.camelizeRootKeys
      );
      res.forEach((row) => sdos.push({ sourceData, row }));
    }

    // now we need to add any content templates that were directly
    // passed in to TDO
    const tdoContentTemplates = args.input.contentTemplates || [];
    tdoContentTemplates.forEach((contentTemplate) => {
      const ctData = {
        row: {
          sdoId: contentTemplate.sdoId,
          data: contentTemplate.data,
          dataRegistryId: contentTemplate.schemaId
        },
        sourceData: {
          taskId: taskId,
          scheduledJobId: sjId,
          sourceId: sourceId
        }
      };
      sdos.push(ctData);
    });

    // now we have a list of sdo_id, schema_id, and assetSourceId
    // for each we need to get the SDO, copy its data to an asset, and
    // set asset source data.
    for (let i = 0; i < sdos.length; i++) {
      const sdo = sdos[i];
      const sdoId = sdo.row.sdoId;
      const schemaId = sdo.row.dataRegistryId;
      const sourceData = sdo.sourceData;
      sourceData.sdoId = sdoId;
      sourceData.schemaId = schemaId;

      let data = sdo.row.data;
      if (data) {
        // if raw data was provided, validate it against schema
        // TODO validate (this path is not currently exposed)
      } else {
        // if raw data was not provided, use SDO id.
        const sdoObj = await serviceContext.dal.structuredData.getStructuredDataObject(
          context,
          { id: sdoId, schemaId }
        );
        data = sdoObj.data;
      }
      // copy it to asset body

      const assetInput = {
        object: data,
        containerId: tdo.id,
        assetType: _.get(
          config,
          'contentTemplateAssetType',
          'content-template'
        ),
        contentType: 'application/json',
        sourceData: sourceData,
        __skipAssetCountCheck: true
      };
      const newAsset = await serviceContext.dal.asset.createAssetAuthorized(
        assetInput,
        context,
        tdo,
        deferredEvents
      );
    }
  }

  function includeDeleteItem(options, item) {
    return options.includes(item) || options.includes('*');
  }

  async function deleteTDODb(tdoId) {
    if (!tdoId) throw new Error('no tdoId');
    const sql = `
      DELETE FROM recording.recording_clone__tdo WHERE cloned_recording_id = $1 OR original_recording_id = $1;
      DELETE FROM recording.recording WHERE recording_id = $1;
    `;
    const res = await serviceContext.dbConnections['core'].write.query(sql, [
      tdoId
    ]);
    return res;
  }

  async function deleteTDOMediaDb(tdoId) {
    if (!tdoId) throw new Error('no tdoId');
    const mediaSql = `
DELETE FROM rating WHERE rating_id IN (
  SELECT rating_id FROM mention__rating WHERE mention_id IN (
    SELECT mention_id FROM mention WHERE media_id = $1));
DELETE FROM mention__rating WHERE mention_id IN (
  SELECT mention_id FROM mention WHERE media_id = $1);
DELETE FROM COMMENT WHERE comment_id IN (
  SELECT comment_id FROM mention__comment WHERE mention_id IN (
    SELECT mention_id FROM mention WHERE media_id = $1));
DELETE FROM mention__comment WHERE mention_id IN (
  SELECT mention_id FROM mention WHERE media_id = $1);
DELETE FROM folder__mention WHERE mention_id IN (
  SELECT mention_id FROM mention WHERE media_id = $1);
DELETE FROM mention WHERE media_id = $1
  RETURNING mention_id, mention_date, organization_id;
DELETE FROM media_metadata WHERE media_id = $1;
DELETE FROM media WHERE media_id = $1;
    `;

    const res = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(mediaSql, [tdoId]);
    let mentions = [];

    _.forEach(res, (row) => {
      if (row.mention_id) {
        mentions.push({
          mentionId: row.mention_id,
          organizationId: row.organization_id,
          mentionDate: new Date(row.mention_date).toUTCString()
        });
      }
    });

    // emit mentions_deleted event
    serviceContext.dal.mention.emitMentionDeletedInBulkEvent(mentions);

    return res;
  }

  async function deleteEngineOutputFromTasks(tdoId, appId) {
    if (!tdoId) throw new Error('TDO ID required'); // server bug
    if (!appId) throw new Error('app ID required'); // server bug
    const sql = `
      UPDATE job_new.task
      SET task_output=NULL
      WHERE recording_id = $1 and application_id = $2
      RETURNING *
    `;
    const res = await dbConnections['core'].write.map(
      sql,
      [tdoId, appId],
      mapper.mapTask
    );
    return res;
  }

  function isClonedRecording(details) {
    if (!details) return false;
    return details['veritone-clone'] || details.veritoneClone;
  }

  function isClonedAsset(metadata, asset) {
    if (!metadata) return false;
    const assetId = _.isString(asset) ? asset : asset.id;
    const cloneData = metadata['veritone-clone'] || metadata.veritoneClone;
    return (
      cloneData &&
      !cloneData.cloneBlobs &&
      cloneData.newAssetIdsToOldAssetIds &&
      cloneData.newAssetIdsToOldAssetIds[assetId] &&
      cloneData.newAssetIdsToOldAssetIds[assetId] !== ''
    );
  }

  function okToDelete(details, asset) {
    if (!(asset.uri || asset._uri)) return false;
    if (isClonedAsset(details, asset)) return false;
    if (asset.metadata && asset.metadata.storeAsReference) return false;
    if (!resUtil.isOurBucket(asset.uri || asset._uri)) return false;
    return true;
  }

  async function deleteTDO(context, args) {
    return doCleanupTDO(context, args);
  }

  async function cleanupTDO(context, args) {
    return doCleanupTDO(context, args, args.options);
  }

  async function doCleanupTDO(
    context,
    input,
    options = ['searchIndex', 'storage', 'metadata']
  ) {
    try {
      mainUtil.checkId(input.id, false, true, false);
      const tdo = await getTDO(context, {
        useCache: false,
        id: input.id,
        applicationId: input.applicationId,
        _writeAccessRequest: true
      });

      // validate that the app IDs on the database object and
      // the request (which was verified) match.
      if (
        input.applicationIds &&
        !input.applicationIds.includes(tdo.applicationId)
      ) {
        throw new errors.NotFound({
          data: {
            objectId: input.id,
            objectType: 'TemporalDataObject'
          }
        });
      }

      let tdoOwnerOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        tdo.applicationId
      );

      if (tdoOwnerOrgId) {
        tdoOwnerOrgId = Number.parseInt(tdoOwnerOrgId);
      }

      const promises = [];
      const id = tdo.id;

      // delete recording from SQL and Elasticsearch
      if (includeDeleteItem(options, 'searchIndex')) {
        // all this does is emit an event
        cleanupSearchIndex(context, tdo);
        // emit event to delete TDO's assets from Elastic
        cleanupTDOAssetMetadataSearchIndex(context, tdo);
      }

      // delete recording from PostgreSQL (mention* + media*) and platform
      let tdoDeleted = false;
      let tdoDetails;
      let assetsToDelete = [];

      // get some resources before deleting TDO
      // Note: For now, tdoDetails and assetsToDelete will be used for `storage` option only
      if (includeDeleteItem(options, 'storage')) {
        // get tdoDetails
        tdoDetails = await getTDODetails(id);
        // get the assets
        assetsToDelete = await _getAssetsToDeleteByTdoId(context, id);
      }

      if (includeDeleteItem(options, 'metadata')) {
        tdoDeleted = true;
        promises.push(
          deleteTDODb(id),
          deleteTDOMediaDb(id),
          serviceContext.dal.folder.removeTDOFromFolders(context, {
            id
          }),
          deleteMetadataByTDO(id)
        );
      }

      // delete assets from s3 + azure if not clone!
      if (includeDeleteItem(options, 'storage')) {
        // include deleting the asset from the DB if the TDO was deleted
        // and clearing asset URIs if it wasn't.
        // then set the last asset update date for current organization
        promises.push(
          handleDeleteAssets(
            context,
            id,
            !tdoDeleted,
            tdoDeleted,
            assetsToDelete || [],
            tdoDetails
          ),
          serviceContext.dal.organization.setLastAssetUpdatedDate(
            context,
            tdoOwnerOrgId || input.organizationId,
            moment.utc()
          )
        );
      }

      // delete all engine output.
      if (includeDeleteItem(options, 'engineResults')) {
        // query for all associated jobs/tasks and set taskOuput to null
        // update job_new.task set task_output='' where recording_id = $1 and application_id = $2
        promises.push(deleteEngineOutputFromTasks(id, tdo.applicationId));
      }

      // do the work
      await Promise.all(promises);

      // flush cached data
      clearCachedTDO(tdo, {}, tdoDeleted);

      if (options.includes('metadata')) {
        const rbacArgs = {
          resourceType: 'TDO',
          resourceIds: [input.id]
        };

        try {
          await rbacAuthBll.removeACEsFromResources(context, rbacArgs);
        } catch (err) {
          logger.error('failed to delete ACEs:  ' + err);
        }

        // TDO was deleted entirely
        return {
          id: input.id,
          message:
            'TemporalDataObject ' +
            input.id +
            ' and all associated asset content was deleted.'
        };
      }
      // return fresh copy of TDO
      return getTDO(context, {
        id: input.id,
        applicationId: input.applicationId
      });
    } catch (err) {
      emitRecordingDeletedAuditEvent(
        context,
        { ...input, recordingId: input.id },
        err
      );
      throw err;
    }
  }

  /**
   * Clean assets when deleting a TDO
   * @param {*} context the context
   * @param {*} tdoId the tdoId that will be deleted
   * @param {*} clearUris clear assetUri or not
   * @param {*} hardDeleteAsset delete assets in recording_asset_xxx table or not
   * @param {*} assets an array of assets belong to the TDO that need to be deleted
   * @param {*} tdoDetails the details of the TDO (recording.recording_metadata)
   * @returns the results from deleteAssetStorage
   */
  async function handleDeleteAssets(
    context,
    tdoId,
    clearUris,
    hardDeleteAsset,
    assets,
    tdoDetails
  ) {
    const ops = [];
    if (_.isNil(assets) || !_.isArray(assets)) {
      throw new Error(
        '(handleDeleteAssets) the assets is required. It should be an array'
      );
    }
    if (_.isEmpty(assets)) {
      return;
    }
    // check TDO details
    let details = tdoDetails;
    if (_.isNil(details)) {
      // try to get data from DB if the input is not available
      details = await getTDODetails(tdoId);
    }
    const assetIds = [];
    const ids = [];
    assets.forEach((asset) => {
      assetIds.push(asset.id);
      if (okToDelete(details, asset)) {
        ids.push(asset.id);
        ops.push(() =>
          serviceContext.dal.asset.deleteAssetStorage(details, asset, context)
        );
      }
    });

    if (clearUris && ids.length) {
      ops.push(() => clearAssetUris(tdoId, ids));
    }

    const proms = await async.parallelLimit(ops, 10);

    // should remove rows in recording_asset tables after saving Segments to mdp-list-to-delete in redis
    if (hardDeleteAsset && assetIds.length) {
      await deleteAssetsByTDO(tdoId, assetIds);
    }

    return proms;
  }

  /**
   * get all assets belong to TDO
   * @param {*} context the current context
   * @param {*} tdoId the tdoId
   * @param {*} pageSize the number of records that returned each time.
   * @returns an array of assets
   */
  async function _getAssetsToDeleteByTdoId(context, tdoId, pageSize = 30) {
    let offset = 0;
    let _count = 0;
    const assets = [];
    if (_.isNil(tdoId)) {
      throw new errors.InvalidInput({
        messages: 'tdoId is required'
      });
    }

    do {
      // first get a page of assets
      const _assets = await serviceContext.dal.asset.getAssets(context, {
        containerId: tdoId,
        offset: offset,
        limit: pageSize,
        includeVirtualAsset: false,
        includeVirtualMediaAsset: false
      });
      _count = _assets.records.length;
      offset += pageSize;
      if (_count > 0) {
        assets.push(..._assets.records);
      }
    } while (_count >= pageSize);

    // VE-26936 - this loop pages serially, so the count is also the number of
    // sequential round trips (/pageSize) and the number of per-asset storage
    // deletes that follow. Recorded to size the deleteTDO fan-out.
    serviceContext.metrics.observeHistogram('tdoCleanupAssets', assets.length);

    return assets;
  }

  function cleanupTDOAssetMetadataSearchIndex(context, tdo) {
    const tdoId = tdo.id || tdo.recordingId;
    if (!tdoId) {
      throw new Error('tdoId is required');
    }

    const event = {
      serviceName: 'core-graphql-server',
      event: 'asset_metadata_deleted',
      type: 'asset',
      recordingId: tdoId
    };

    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
  }

  async function clearAssetUris(tdoId, ids) {
    const params = [tdoId];
    const clause = [];
    ids.forEach((id) => {
      params.push(id);
      clause.push(`$${params.length}`);
    });
    const sql = `
UPDATE ${util.generateRecordingAssetPartition(tdoId)}
SET uri=''
WHERE
  recording_id = $1 AND
  recording_id::bigint = $1 AND
  asset_id IN (${clause.join(', ')})
RETURNING asset_id AS id, uri
    `;
    const res = await serviceContext.dbConnections['core'].write.query(
      sql,
      params
    );
    return res;
  }

  async function createTDOWithAsset(context, args) {
    // createTDO and createTDOWithAsset differ only in input fields.
    // so createTDO looks at the endpoint and will create the new
    // asset if necessary.
    return createTDO(context, args);
  }

  // launch the ScheduleJob if it's active
  // return the list of job result
  async function startV3Job(
    context,
    scheduleId,
    tdoId,
    organizationId,
    applicationId,
    schedule
  ) {
    if (!schedule) {
      const query = `
        SELECT
          program_id AS id,
          program_name AS name,
          is_active
        FROM
          program
        WHERE
          program_id = $1;
      `;
      const res = await dbConnections['media_platform'].read.map(
        query,
        [scheduleId],
        mapper.camelizeRootKeys
      );

      if (!res || _.isEmpty(res)) {
        throw new errors.NotFound({
          message: 'ScheduledJob is not found',
          data: {
            objectType: 'ScheduledJob',
            objectId: scheduleId
          }
        });
      }

      schedule = _.first(res);
    }

    const isActive = schedule.isActive;

    if (isActive) {
      const launchArgs = {
        organizationId,
        applicationId,
        input: {
          organizationId,
          applicationId,
          scheduledJobId: scheduleId,
          targetInfo: {
            targetId: tdoId
          }
        }
      };

      try {
        return serviceContext.dal.jobPipeline.createAllScheduledJobs(
          context,
          launchArgs
        );
      } catch (err) {
        throw new errors.NotFound({
          message:
            'The target scheduled job ID for the new TDO contains a ' +
            'job template. The TDO was successfully created, but the job was ' +
            'not launched successfully. The data section contains more detail ' +
            'on the job failure.',
          data: {
            objectType: 'TemporalDataObject',
            objectId: tdoId,
            scheduledJobId: scheduleId,
            errorDetail: err
          }
        });
      }
    }

    return [];
  }

  function getFieldFilter(
    dateTimeFilters,
    field,
    op /* toDateTime or fromDateTime */
  ) {
    let res;
    for (let i = 0; i < dateTimeFilters.length && !res; i++) {
      const filter = dateTimeFilters[i];
      if (filter.field === field) {
        if (op) {
          if (_.has(filter, op)) {
            res = filter;
          }
        } else {
          res = filter;
        }
      }
    }
    return res;
  }

  async function getTDOs(context, args) {
    try {
      // VTN-25021 - max offset to prevent overly expensive queries
      const maxOffset = _.get(serviceContext, 'config.maxTDOOffset', 3000);
      const maxOffsetEnabled = _.get(
        serviceContext,
        'config.maxTDOOffsetEnabled',
        true
      );
      if (maxOffsetEnabled && _.get(args, 'offset', 0) > maxOffset) {
        throw new errors.InvalidInput({
          message:
            'The supplied offset, ' +
            args.offset +
            ', exceeds the maximum allowed for this query, ' +
            maxOffset +
            ' Apply tighter query filters to reduce the overall result size.',
          data: {
            errorName: 'max_tdo_offset',
            offset: args.offset,
            maxOffset,
            requestId: context.requestInfo.requestId,
            correlationId: context.requestInfo.correlationId
          }
        });
      }

      if (args.applicationId && !args.applicationIds) {
        args.applicationIds = [args.applicationId];
      }

      if (args.organizationId) {
        args.groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
          args.organizationId
        );
        // this allows an internal token to query by organization ID
        // additional work needed to support querying for child orgs (by acl).
        if (!args.applicationId) {
          args.applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
            args.organizationId
          );
          args.applicationIds = [args.applicationId];
        }
      }

      if (args.id && !_.isArray(args.id)) {
        // TODO handle multiple magic recording IDs?
        // not as of 10/3/18; not used.
        args.id = _.toString(args.id);
        // for retrieval by single ID, implicitly set includePublic
        args.includePublic = true;
        // now see if ID is "magic"
        const magicId = magicIdUtil.parseRecordingId(args.id);
        if (magicId) {
          const result = await getTDO(context, args);
          // we can safely return just this result; if ID was passed
          // there will never be > 1.
          return mainUtil.toPage(args, [result]);
        }
      }
      if (args.mentionId) {
        // first retrieve the mention
        try {
          /* verify ID is less than postgres max or we'll get errors */
          mainUtil.checkId(args.mentionId, true, true, false, 2147483647, 0);
        } catch (err) {
          return mainUtil.emptyPage(args);
        }
        const mentionSql = `
SELECT
mention_id AS id,
media_source_id AS source_id,
media_id AS tdo_id,
hit_start_date AT TIME ZONE 'UTC' AS hit_start_date_time ,
hit_end_date AT TIME ZONE 'UTC' AS hit_stop_date_time,
mention_date AT TIME ZONE 'UTC' AS start_date_time,
mention_end_date AT TIME ZONE 'UTC' AS stop_date_time
FROM
mention
WHERE
mention_id = $1 AND organization_id = $2
  `;
        const mentionRes = await serviceContext.dbConnections[
          'media_platform'
        ].read.map(
          mentionSql,
          [args.mentionId, args.organizationId],
          mapper.camelizeRootKeys
        );

        // if the mention doesn't exist or is not visible, just return out empty list now
        if (!mentionRes.length) {
          return mainUtil.emptyPage(args);
        }
        const mention = mentionRes[0];

        // compute time window parameters.
        // we take the wider of the intervals on the mention (start/stop vs. hit start/stop)
        let end = mention.stopDateTime || mention.hitStopDateTime;
        if (end) {
          if (mention.hitStopDateTime && mention.hitStopDateTime > end) {
            end = mention.hitStopDateTime;
          }
        }
        let start = mention.startDateTime || mention.hitStartDateTime;
        if (start) {
          if (mention.hitStartDateTime && mention.hitStartDateTime < start) {
            start = mention.hitStartDateTime;
          }
        }
        // TODO this probably needs work; current logic is too restrictive
        // match TDOs that
        // *  start BEFORE the mention start time
        // and end DURING or start AFTER mention start time and end
        // and end AFTER its end time
        // if a time window was passed in by caller, honor it,
        // TODO with a sanity check against mention start/stop
        const dateFilters = args.dateTimeFilter || [];

        if (start) {
          const existingFilter = getFieldFilter(
            dateFilters,
            'stopDateTime',
            'fromDateTime'
          );
          // do not override existing filter
          if (_.isNil(existingFilter)) {
            dateFilters.push({
              fromDateTime: start,
              field: 'stopDateTime'
            });
          }
          // TODO sanity check against mention start/stop. the difference should
          // only be a few minutes for padding. or it can be within mention window.
        }
        if (end) {
          const existingFilter = getFieldFilter(
            dateFilters,
            'startDateTime',
            'toDateTime'
          );
          if (_.isNil(existingFilter)) {
            dateFilters.push({
              toDateTime: end,
              field: 'startDateTime'
            });
          }
        }

        // if there's no source or tdo ID on the mention, we can't return
        // anything. bail out now.
        if (!(mention.sourceId || mention.tdoId)) {
          return mainUtil.emptyPage(args);
        }

        const tdoArgs = {
          sourceId: mention.sourceId ? _.toString(mention.sourceId) : undefined,
          id: _.isNil(mention.sourceId) ? mention.tdoId : undefined,
          dateTimeFilter: dateFilters,
          bypassAuth: true // hidden internal flag that bypasses org auth
          // because we already validated access to the mention
        };
        const allArgs = Object.assign(args, tdoArgs);
        const result = await getAllRecordings(allArgs);

        // emit event for accessing media
        _emitPublicEventAccessMedia(
          context,
          _.get(result, 'records'),
          'recording'
        );

        return result;
      }

      // if we're getting TDO by source, first get the source.
      // this call accounts for acls/sharing.
      if (args.sourceId) {
        try {
          await serviceContext.dal.source.getSource(context, {
            id: args.sourceId,
            applicationId: args.applicationId,
            organizationId: args.organizationId
          });
          args.bypassAuth = true;
        } catch (err) {
          // just means user doesn't have access to source.
          _emitPublicEventAccessMedia(
            context,
            { ...args, status: 'failure' },
            'recording',
            err
          );
          // return empty results.
          return mainUtil.emptyPage(args);
        }
      }
      if (context._rbacAuthFilter) {
        args.rbacAuthFilter = context._rbacAuthFilter;
      }
      const result = await getAllRecordings(args);
      _emitPublicEventAccessMedia(context, _.get(result, 'records'), 'recording');
      return result;
    } catch (err) {
      _emitPublicEventAccessMedia(
        context,
        { ...args, status: 'failure' },
        'recording',
        err
      );
      throw err;
    }
  }

  // TODO additional refactoring.
  // just moving this function out of db.js for now
  function _getTDO(input) {
    mainUtil.checkId(input.id, false, true, false);
    const key = tdoCacheKey(input, input);
    let res = input.useCache ? localCache.get('TemporalDataObject', key) : null;
    if (res) return res;

    // refactor this cache at some point
    return getAllRecordings(input).then(function (data) {
      if (!data?.records?.length) {
        throw new errors.NotFound({
          message:
            'The requested TDO was not found. input = ' + JSON.stringify(input),
          data: { objectId: input.id, objectType: 'TemporalDataObject' }
        });
      }
      if (data.records.length > 1) {
        throw new errors.InternalServerError({
          message: `Multiple recordings found for one TDO id ${input.id}`,
          data: { objectId: input.id, objectType: 'TemporalDataObject' }
        });
      }
      if (input.applicationId)
        localCache.set('TemporalDataObject', key, data.records[0]);
      return data.records[0];
    });
  }

  function fixDateFromRedis(date) {
    if (_.isNil(date)) return date;
    if (_.isString(date)) {
      return Date.parse(date);
    }
    if (_.isNumber(date)) {
      if (mainUtil.isTimeInSeconds(date)) {
        return new Date(date * 1000);
      } else {
        return new Date(date);
      }
    }
    return date;
  }

  async function getTDO(context, args) {
    try {
      if (!args.id) {
        throw new errors.InvalidInput({
          message: 'id parameter to temporalDataObject must be non-empty'
        });
      }
      // remove the checkId here, since it will throw a validation error
      // when get TDO by magicId. (The magicId was not a number, and not an uuid)
      const _args = Object.assign({ includePublic: true }, args);
      let groupId;
      if (args.organizationId) {
        groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
          args.organizationId
        );
        _args.groupId = groupId;
        _args.includeByAcl = ['editor', 'viewer'];
      }

      const magicId = magicIdUtil.parseRecordingId(_args.id);
      let res;
      if (magicId) {
        res = await getTDOWithMagicId(context, _args, magicId);
      } else {
        checkTDOID(_args.id);

        // first check redis cache
        if (args.useCache !== false) {
          res = await serviceContext.redisCache.get(
            'TemporalDataObject',
            args.id
          );
        }

        if (_.isNil(res)) {
          // if we didn't get from cache, get from db.
          // this will throw if TDO is not found
          res = await _getTDO(_args);
          // then insert into cache, async
          await updateTDOCache(args.id, res, []);
        }
      }
      if (res) {
        // verify access. if no access, throw not found.

        // check if TDO is put into multiple packages.
        const packageId = _.get(res, 'jsondata.veritonePermissions.packageId');
        if (packageId && args.organizationId) {
          res.packageIds = _.isArray(packageId) ? packageId : [packageId];
          if (args._writeAccessRequest) {
            throw new errors.NotAllowed({
              message:
                'The temporal data object is part of a package and thus immutable.',
              data: {
                objectType: 'TemporalDataObject',
                objectId: args.id
              }
            });
          }
          // TODO: check if the requested access is write/update and throw notAllowed
          const canAccessPackage = await serviceContext.dal.packages.checkPackageAccess(
            packageId,
            args.organizationId
          );
          if (!canAccessPackage) {
            throw new errors.NotFound({
              message:
                'The specified object does not exist or access not granted.',
              data: {
                objectType: 'TemporalDataObject',
                objectId: args.id
              }
            });
          }
        } else {
          const appIds =
            args.applicationIds ||
            (args.applicationId ? [args.applicationId] : null);
          const groupIds = _.get(
            res,
            'jsondata.veritonePermissions.acls',
            []
          ).map((acl) => _.get(acl, 'groupId'));
          if (appIds && !(appIds.includes(res.applicationId) || res.isPublic)) {
            if (!groupId || !groupIds.includes(groupId)) {
              throw new errors.NotFound({
                message:
                  'The specified object does not exist or access not granted.',
                data: {
                  objectType: 'TemporalDataObject',
                  objectId: args.id
                }
              });
            }
          }
        }

        // otherwise we'll just return it.
        // first turn dates from ISO string to Date object as returned by DB.
        res.startDateTime = fixDateFromRedis(res.startDateTime);
        res.stopDateTime = fixDateFromRedis(res.stopDateTime);
        res.createdDateTime = fixDateFromRedis(res.createdDateTime);
        res.modifiedDateTime = fixDateFromRedis(res.modifiedDateTime);

        // emit event for accessing media
        _emitPublicEventAccessMedia(context, res, 'recording');
      }

      return res;
    } catch (err) {
      _emitPublicEventAccessMedia(
        context,
        { ...args, status: 'failure' },
        'recording',
        err
      );
      throw err;
    }
  }

  /**
   * emit access_media event
   * @param {*} context the context
   * @param {*} media the data of the media. It can be an item or an array
   * @param {*} mediaType type of the media. The default value is 'recording'
   * @param {*} error the error
   * @returns nothing
   */
  function _emitPublicEventAccessMedia(context, media, mediaType, error) {
    messageUtil.emitReadAuditEvent(context, media, mediaType || 'recording', error);
  }

  async function getTDOWithMagicId(context, args, magicIdData) {
    /* magicIdData has the following properties (per the spec):
    - recordingID
    - assetIDWhitelist - array of asset IDs to be retrieved from recordingID, e.g. '[ '12345', '12346' ]'
    - generativeAssetParamsList - array of portions of assets to be retrieved from recordingID, e.g.  '{ assetId: '12345', startDateTime: 1234567, endDateTime: 1234568 }'
  */
    const tdoId = _.toString(magicIdData.recordingId);

    // authorize it against the object-level whitelist from JWT, if there
    // was one.
    if (context.objectAuth) {
      if (
        !(
          context.objectWhitelist.TemporalDataObject.includes(tdoId) ||
          context.objectWhitelist.TemporalDataObject.includes(args.id)
        )
      ) {
        throw new errors.NotFound({
          data: {
            objectId: tdoId,
            objectType: 'TemporalDataObject',
            allowedIds: context.objectWhitelist.TemporalDataObject
          }
        });
      }
    }

    // assetIDWhitelist allow us to uniquely identify either one or more
    // whole file segments.  generativeAssetParamsList allow us to uniquely
    // identify arbitrary groups of file segments.  Only one or the other
    // or both can be specified.  If both specified then they are additive
    // (i.e. results of assetIDWhitelist are combined/unioned with results
    // of generativeAssetParamsList).
    const assetIds = magicIdData.assetIDWhitelist;
    const assetParams = magicIdData.generativeAssetParamsList;

    // just return the TDO normally
    // the asset resolvers handle other special processing.
    const _args = JSON.parse(JSON.stringify(args));
    const res = await getTDO(context, Object.assign(_args, { id: tdoId }));
    // do preserve the "magic ID" data on the object for use by other
    // resolvers as needed
    res.magicIdData = magicIdData;
    res.magicId = args.id;
    return res;
  }

  async function getFakeMediaAsset(context, tdo, assetType = 'media') {
    const assetId = mainUtil.getFakeMediaAssetId(tdo);
    const mediaStreamer = await util.getMediaStreamerUri(context, tdo.id);
    const uri = mediaStreamer + 'download/tdo/' + tdo.id;
    const sourceData = await getTDOSourceData(tdo);
    const metadata = sourceData || {};
    metadata.details = { virtualAsset: true };
    // TODO optimize this away since we already had to get media init
    // assets to determine if we should return fake asset
    const [mediaInits, tdoDetails] = await Promise.all([
      getMediaInitAssets(context, tdo.id),
      getTDODetails(tdo.id)
    ]);
    // TODO content type on segmented TDO with media-mdp
    const contentType = _.get(
      mediaInits,
      '0.content_type',
      _.get(tdoDetails, 'veritoneFile.mimetype', 'video/mp4')
    );

    return {
      id: assetId,
      assetType: assetType,
      contentType: contentType,
      createdDateTime: tdo.createdDateTime || new Date().getTime(),
      modifiedDateTime: new Date().getTime(),
      containerId: tdo.id,
      type: 'media',
      uri: uri,
      description: 'A virtual asset representing the entire TDO contents',
      sourceData: sourceData || {},
      details: metadata.details,
      metadata: metadata // TODO what should metadata be?
    };
  }

  async function getPrimaryAsset(context, tdo, args) {
    const jsondata = tdo.jsondata || {};
    let assetObj = null;
    switch (args.assetType) {
      case 'transcript':
        assetObj = jsondata.transcriptAsset;
        break;
      case 'media':
        assetObj = jsondata.mediaAsset;
        break;
      case 'media-mdp':
        assetObj = jsondata.mediaMdpAsset;
        break;

      default:
        if (disablePrimaryAssetTypeEnforcement) {
          assetObj = jsondata.primaryAsset;
        } else {
          throw new errors.InvalidInput({
            message: 'cannot get primary asset of type ' + args.assetType,
            data: {
              assetType: args.assetType,
              allowedAssetTypes: ['transcript', 'media', 'media-mdp'],
              objectId: tdo.id
            }
          });
        }
    }

    let id = assetObj ? assetObj.assetId : null;

    let res;

    // VTN-7204
    // a primary media asset has not been specified.
    // handle special media-streamer URLs
    if (!id && args.assetType === 'media') {
      // only return virtual asset for segmented TDOs - VTN-11855
      const useVirtualArr = await shouldIncludeVirtualAsset(context, args, [
        tdo
      ]);
      const useVirtual = useVirtualArr.length > 0;
      if (useVirtual) {
        return await getFakeMediaAsset(context, tdo);
      } else {
        // VTN-11855 - look for newest media asset.
        if (
          _.get(
            serviceContext,
            'config.featureFlags.newestMediaAsPrimary',
            false
          ) === true
        ) {
          const primAssetArgs = {
            limit: 1,
            orderBy: 'createdDateTime',
            orderDirection: 'desc',
            assetType: 'media',
            containerId: tdo.id
          };
          const primAssets = await serviceContext.dal.asset.getAssets(
            context,
            primAssetArgs
          );
          if (primAssets.records.length) res = primAssets.records[0];
        }
      }
    }

    const assetArgs = {
      id: id,
      applicationId: tdo.applicationId, // application ID must be that of the parent TDO
      orgId: tdo.orgId
    };

    // "magic" id handling -- we only get the requested asset if it's
    // whitelisted in the magic id.
    const magicData = tdo.magicIdData;
    if (magicData) {
      // verify id is in list
      const allowedIds = util.getAllowedAssetIdsFromMagicId(magicData);
      // exclude if it's not whitelisted
      if (!allowedIds.includes(id)) id = null;
      // override URI with custom asset metadata and
      // media streamer URL
    }

    if (id && !res) {
      res = await serviceContext.dal.asset.getAsset(context, assetArgs);
      if (magicData) {
        // TODO plug in program and media source IDs from jsondata
        const params = util.getAssetParamsFromMagicId(magicData, id);
        if (params)
          await util.applyAssetUri(tdo.id, res, params, null, null, context);
      }
    }
    return res;
  }

  // retrieves num_segments from the database for a given set of TDO IDs
  // and returns the list of IDs that have non-zero.
  async function shouldIncludeVirtualAsset(context, args, tdos) {
    let res = [];
    const type = 'TDONumSegments';

    for (let i = 0; i < tdos.length; i++) {
      const id = tdos[i].id;
      let numSegments = localCache.get(type, id);
      // VTN-21373 if the TDO has been modified in the past hour, we will
      // skip local cache to avoid a race condition on addMediaSegment.
      // currently the TDONumSegments data has a local TTL of 20min.
      const mod = moment(tdos[i].modifiedDateTime);
      const test = moment().subtract(1, 'hour');
      if (_.isNil(numSegments) || test.isBefore(mod)) {
        const details = await getTDODetails(id);

        numSegments = details.numSegments || 0;

        if (!numSegments) {
          const mediaMdpAssets = await getMediaMdpAssets(context, id);
          if (!_.isEmpty(mediaMdpAssets)) numSegments = 1;
          else {
            const mediaInitAssets = await getMediaInitAssets(context, id);
            if (!_.isEmpty(mediaInitAssets)) numSegments = 1;
          }
        }
        localCache.set(type, id, numSegments);
      }
      if (numSegments > 0) res.push(id);
    }

    return res;
  }

  async function getMediaMdpAssets(context, tdoId) {
    return getAssetsOfType(context, tdoId, 'media-mdp');
  }

  async function getMediaInitAssets(context, tdoId) {
    return getAssetsOfType(context, tdoId, 'media-init');
  }

  async function getAssetsOfType(context, tdoId, assetType) {
    const assetTable = util.generateRecordingAssetPartition(tdoId);
    const sql = `
SELECT
  asset_id,
  content_type
FROM
  ${assetTable}
WHERE
  recording_id = $1 AND
  recording_id::bigint = $1 AND
  type = $2
LIMIT 1
      `;

    try {
      return await serviceContext.dbConnections['core'].read.query(sql, [
        tdoId,
        assetType
      ]);
    } catch (e) {
      logger.error('Error when get assets of type', e);
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
      const errorCode = _.get(e, 'data.internalData.code');

      // catch the recording_asset partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // only create the recording_asset partition table if it's within the last month or newer
        const isValid = await serviceContext.dal.asset.validateRecordingAssetTablePartition(
          moment.utc(),
          {
            partitionName: assetTable
          }
        );

        if (isValid) {
          // retry to get assets of type
          return await serviceContext.dbConnections['core'].read.query(sql, [
            tdoId,
            assetType
          ]);
        }
      }

      throw e;
    }
  }

  async function getAssets(context, args, tdos) {
    try {
      let tdosArray = Array.isArray(tdos) ? tdos : [tdos];
      let tdoIds = tdosArray.map((tdo) => tdo.id);

      let assetId = args.id; // can be null
      const magicData = tdos.magicIdData;
      if (magicData) {
        // we'll filter asset IDs by those referenced in URL
        const allIds = util.getAllowedAssetIdsFromMagicId(magicData);
        // if an asset ID was passed in, we take the intersection
        // if it and the allowed IDs from the URL
        if (assetId) {
          assetId = _.intersection(allIds, [assetId]);
        } else {
          // otherwise take all IDs in the URL
          assetId = allIds;
        }
      }

      let assetTypes = args.type || args.assetType;
      if (assetTypes && !_.isArray(assetTypes)) assetTypes = [assetTypes];
      const canIncludeVirtualAsset =
        !assetId && (!assetTypes || assetTypes.includes('media'));
      // this is a list of IDs.
      const includeVirtualAsset = !canIncludeVirtualAsset
        ? [] // if specific asset ID was included, then don't even bother to query
        : await shouldIncludeVirtualAsset(context, args, tdosArray);

      // now we can get the filtered asset list
      const assetArgs = Object.assign(
        {
          containerId: tdoIds,
          id: assetId,
          includeVirtualAsset: includeVirtualAsset
        },
        args
      );

      const assets = await serviceContext.dal.asset.getAssets(
        context,
        assetArgs
      );
      // if "magic" id had asset metadata, apply it to URIs now
      if (magicData) {
        const proms = [];
        assets.records.forEach(function (asset) {
          const params = util.getAssetParamsFromMagicId(magicData, asset.id);
          if (params)
            proms.push(
              util.applyAssetUri(
                asset.containerId,
                asset,
                params,
                null,
                null,
                context
              )
            );
        });
        await Promise.all(proms);
        // if magic ID had a "magic" virtual asset (no real asset ID),
        // add it to results here.
        const magicAsset = await util.getMagicAsset(magicData, context);
        if (magicAsset) {
          assets.records.push(magicAsset);
          assets.count++;
        }
      }

      // emit event for accessing media
      _emitPublicEventAccessMedia(context, _.get(assets, 'records'), 'asset');

      return assets;
    } catch (err) {
      _emitPublicEventAccessMedia(
        context,
        { ...args, status: 'failure' },
        'asset',
        err
      );
      throw err;
    }
  }

  async function getTDODetails(tdoId) {
    let res = await redisCache.get('TemporalDataObject.details', tdoId);
    if (!res) {
      // note that we'll filter out both null types and the
      // special source-task-data row that is used to store
      // sourceData.
      const sql = `
  SELECT
    COALESCE(json_object_agg(rm.type, rm.content)
      FILTER (WHERE rm.type IS NOT NULL and rm.type != '${SOURCE_TASK_DATA_KEY}'), '{}')::JSON AS details
  FROM
    recording.recording_metadata AS rm
  WHERE
    rm.recording_id = $1;
    `;
      const dbconn = dbConnections['core'].read;
      const resFromDb = await dbconn.map(sql, [tdoId], (row) => row.details);
      res = resFromDb.length ? mapper.mapTDODetailKeysFromDb(resFromDb[0]) : {};
      redisCache.set('TemporalDataObject.details', tdoId, res);
    }
    return res;
  }

  // gets the specific metadata blob that stores the optional
  // source task metadata
  async function getTDOSourceData(tdo) {
    // first get from db/cache. this value might be empty
    let data = await getTDOSourceTaskData(tdo.id);
    if (!data) data = {};

    // fill in source data from other fields if necessary
    if (!data.sourceId && tdo.sourceId) data.sourceId = tdo.sourceId;

    if (!data.sourceId) {
      if (tdo.sourceId) data.sourceId = tdo.sourceId;
      else if (_.get(tdo, 'jsondata.mediaSourceId'))
        data.sourceId = _.get(tdo, 'jsondata.mediaSourceId');
    }
    // fill in scheduled job data from other fields if necessary
    if (!data.scheduledJobId) {
      if (_.get(tdo, 'jsondata.programId'))
        data.scheduledJobId = _.get(tdo, 'jsondata.programId');
    }
    return data;
  }

  /**
   * Generate stream data for a TDO based on its asset list.
   * If it has a media-init asset, we'll return streams.
   * else empty list.
   * Assumes that access to TDO has already been authorized.
   */
  async function getStreamData(context, tdo) {
    if (
      _.get(
        tdo,
        'details.segmented',
        _.get(tdo, 'jsondata.segmented', false)
      ) === true
    ) {
      return formStreamData(context, tdo);
    }
    // if the TDO has at least one media-init asset,
    // we assume it supports streams.
    // first query for matching assets (we only need 1)
    const sql = `
SELECT asset_id
FROM ${util.generateRecordingAssetPartition(tdo.id)}
WHERE
  (type = 'media-init' OR type = 'media-mdp') AND recording_id = $1
LIMIT 1
    `;
    const dbconn = dbConnections['core'].read;
    const assets = await dbconn.query(sql, [tdo.id]);

    // if we got one, add the streams.
    if (assets.length) {
      return formStreamData(context, tdo);
    }

    return [];
  }

  function formStreamData(context, tdo) {
    const streams = [];

    const mediaStreamerBase = config.services['media-streamer'].uri;
    let apiBase =
      process.env.VERITONE_BASE_URI || config['veritone-api'].baseUri;

    apiBase += apiBase.endsWith('/') ? '' : '/'; // making sure that we have a trailing slash

    // stream type and URL are currently hard-coded.
    streams.push({
      protocol: 'hls',
      uri: `${mediaStreamerBase}stream/${tdo.id}/master.m3u8`
    });

    const mpegDashURI = _.get(
      config,
      'featureFlags.enableNativeMPEGDash',
      false
    )
      ? `${apiBase}v3/stream/${tdo.id}/dash.mpd`
      : `${mediaStreamerBase}stream/${tdo.id}/dash.mpd`;

    streams.push({
      protocol: 'dash',
      uri: mpegDashURI
    });

    return streams;
  }

  async function getEngineAliasId(context, engineId) {
    try {
      const engine = await serviceContext.dal.engine.getEngine(
        context,
        {
          id: engineId,
          includeDeleted: true,
          adminView: true
        },
        true /* allow cached */
      );
      return engine.aliasId;
    } catch (err) {
      serviceContext.logger.error('getEngineRuns: Failed to get engine', {
        engineId: engineId,
        err
      });
      return null;
    }
  }

  async function getEngineRuns(tdo, args, context) {
    // query for engine IDs from assets metadata and tasks
    const assetByEngineId = {};
    const taskByEngineId = {};
    const TRANSCRIPT_ENGINE_CATEGORY_ID =
      '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';

    const getAssetsArgs = {
      type: 'vtn-standard',
      orderBy: 'modified_date_time',
      offset: args.offset || 0,
      limit: args.limit || 100
    };
    const getTasksArgs = {
      targetId: tdo.id,
      offset: args.offset || 0,
      limit: args.limit || 100
    };
    if (tdo.createdDateTime) {
      const createdDateTimeFilterValue = new Date(tdo.createdDateTime);
      createdDateTimeFilterValue.setDate(
        createdDateTimeFilterValue.getDate() - 1
      );
      getTasksArgs.dateTimeFilter = [
        {
          fromDateTime: createdDateTimeFilterValue,
          field: 'createdDateTime'
        }
      ];
    }

    const userEditedEngineIds = [];
    const vtnStandardAssets = await getAssets(context, getAssetsArgs, tdo);
    if (vtnStandardAssets && vtnStandardAssets.count) {
      const assetsWithMetadata = vtnStandardAssets.records.filter(
        (asset) => !!asset.metadata
      );
      for (const asset of assetsWithMetadata) {
        const sourceEngineId =
          asset.metadata.sourceEngineId || asset.metadata.source;
        if (sourceEngineId && !assetByEngineId[sourceEngineId]) {
          assetByEngineId[sourceEngineId] = asset;
          const aliasId = await getEngineAliasId(context, sourceEngineId);
          if (aliasId) {
            assetByEngineId[aliasId] = asset;
          }
        }
        if (asset.userEdited) {
          userEditedEngineIds.push(sourceEngineId);
        }
      }
    }

    const runTasks = await serviceContext.dal.task.getTasks(
      context,
      getTasksArgs
    );
    if (runTasks && runTasks.count) {
      // VTN-12893 - make sure we've got an alias ID for the engine
      // so that task status mapping works
      for (let i = 0; i < runTasks.records.length; i++) {
        const task = runTasks.records[i];
        const engineId = task.engineAliasId || task.engineId;
        if (!task.engineAliasId) {
          const aliasId = await getEngineAliasId(context, engineId);
          task.engineAliasId = aliasId || engineId;
        }
      }
      runTasks.records
        .filter((task) => !!task.engineId)
        .forEach((task) => {
          const engineId = task.engineAliasId || task.engineId;

          if (!taskByEngineId[engineId]) {
            // first see if we already identified as asset for this engine
            const asset = assetByEngineId[engineId];
            if (asset) {
              // if the asset's source task is this task, use it
              if (_.get(asset, 'metadata.sourceTaskId') === task.id) {
                taskByEngineId[task.engineId] = task;
                taskByEngineId[task.engineAliasId] = task;
              }
              // otherwise don't use this task
            } else {
              // otherwise use this task if we didn't already identify one for engine
              taskByEngineId[task.engineId] = task;
              taskByEngineId[task.engineAliasId] = task;
            }
          }
          // TODO what if we found an asset with source engine ID but it doesn't
          // have a source task ID?
        });
    }

    const allEngineIds = _.uniq(
      Object.keys(assetByEngineId).concat(Object.keys(taskByEngineId))
    ).slice(args.offset, args.limit + args.offset);

    const enginesResponse = allEngineIds.length
      ? await serviceContext.dal.engine.getEngines(context, {
          ids: allEngineIds,
          includeDeleted: true,
          adminView: true
        })
      : { count: 0, records: [] };
    const engines = _.get(enginesResponse, 'records', []);

    // If we have a vtn-standard asset for any transcript we want to ignore legacy transcripts
    // Legacy transcripts edits don't belong to a specific engine so we assign it to every engine
    // until the user makes an edit to another engine and creates a vtn-standard asset.
    const transcriptEngineIds = engines
      .filter((engine) => {
        return engine.categoryId === TRANSCRIPT_ENGINE_CATEGORY_ID;
      })
      .map((engine) => engine.id);

    // If there is an intersection between transcript engine ids and vtn-asset standard ids then we
    // will want to ignore any legacy transcript assets.
    const tdoHasVtnStandardTranscript = !!_.intersection(
      transcriptEngineIds,
      Object.keys(Object.keys(assetByEngineId))
    ).length;

    // Fetch the most recent transcript asset to check if it is a user edited transcript asset
    const mostRecentTranscriptAssetArgs = {
      type: 'transcript',
      orderBy: 'modified_date_time',
      offset: 0,
      limit: 1
    };
    const mostRecentTranscriptAssetData = await getAssets(
      context,
      mostRecentTranscriptAssetArgs,
      tdo
    );
    const mostRecentTranscriptAsset = _.get(
      mostRecentTranscriptAssetData,
      'records[0]'
    );

    // Each engine updates the primary asset on a tdo so if the primary transcript asset is the same as
    // the most recent legacy transcript asset then we know the user hasn't reran an engine since making edits.
    const mostRecentTranscriptIsLegacy =
      _.get(mostRecentTranscriptAsset, 'metadata.source') === 'manual';
    const records = engines.map((engine) => {
      const isTranscriptEngine =
        engine.categoryId === TRANSCRIPT_ENGINE_CATEGORY_ID;
      const result = {
        engine: engine,
        hasUserEdits:
          userEditedEngineIds.includes(engine.id) ||
          userEditedEngineIds.includes(engine.internalId) ||
          (isTranscriptEngine &&
            !tdoHasVtnStandardTranscript &&
            mostRecentTranscriptIsLegacy)
      };
      if (assetByEngineId[engine.id] && !taskByEngineId[engine.id]) {
        result.status = 'complete';
      }
      if (taskByEngineId[engine.id]) {
        const lastRunTask = taskByEngineId[engine.id];
        result.status = lastRunTask.status;
        result.task = lastRunTask;
      }
      // TODO what if we found an asset with no source task ID?
      // cannot return a task in this case.

      // if the engine is not available anymore should the row be removed from the records?
      // if (engine.deleted) {
      //   //result.engine.id = 'deleted';
      // }

      return result;
    });

    return {
      records: records,
      offset: args.offset,
      limit: args.limit,
      count: records.length
    };
  }

  const tdoOrderByMap = {
    createdDateTime: `created_date_time`,
    modifiedDateTime: `modified_date_time`,
    startDateTime: `start_date_time`,
    stopDateTime: `stop_date_time`,
    id: 'recording_id'
  };

  async function getAllRecordings(args) {
    let { sourceId, sampleMedia } = args;
    let id = args.id || args.ids;
    const sqlargs = [];
    let ids;

    // VTN-9890 - we'll skip app-based authorization if we already
    // authorized access to a mention AND a source ID or TDO ID
    // are specified.
    const bypassAuth = args.bypassAuth === true && (sourceId || id);

    // if a sourceId was passed but isn't a valid source ID,
    // then just return out an empty list now.
    // this does two things:  prevent sql injection and save us
    // a database query (if it's not a valid source ID then there)
    // can't possibly be any matching tdos).
    // same with scheduled job ID.
    try {
      if (args.sourceId) mainUtil.checkId(args.sourceId, false, true, false);
      if (args.scheduledJobId)
        mainUtil.checkId(args.scheduledJobId, false, true, false);
    } catch (err) {
      return mainUtil.toPage(args, []);
    }

    // VTN-8663
    // temporary hack/workaround for slow json queries.
    // attempt to detect media-streamer query and use media table to
    // get a list of ids to filter by
    let skipDateFilters = false;
    if (
      sourceId &&
      args.dateTimeFilter &&
      !id &&
      _.get(config, 'mediaHackEnabled', true) === true
    ) {
      const mWhere = [];
      const mValues = [sourceId];
      mWhere.push('media_source_id = $1');
      if (args.programId) {
        mValues.push(args.programId);
        mWhere.push('program_id = $2');
      }
      optimizeStartDateTimeFilter(args.dateTimeFilter);
      mainUtil.addDateTimeFilters('media', args, mWhere, 'pg_ts', 1, {
        startDateTime: 'media_start_time',
        stopDateTime: 'media_stop_time',
        createdDateTime: 'date_created',
        modifiedDateTime: 'date_modified'
      });
      skipDateFilters = true;
      const hackLimit = _.get(config, 'mediaHackRowLimit', 50);
      // TODO mwhere can be empty!
      const mediaQuery = `
    SELECT
      media_id AS id
    FROM
      media
    WHERE
      ${mWhere.join(' AND ')}
    OFFSET 0 LIMIT ${hackLimit + 1};
          `;
      let ct = 0;
      const idsFromMedia = await dbConnections['media_platform'].read.map(
        mediaQuery,
        mValues,
        (row) => {
          ct++;
          return _.toString(row.id);
        }
      );
      // only attempt to filter by ID if we got a reasonable set of IDs.
      // otherwise, the hack is worse than the original query.
      if (ct <= hackLimit) {
        id = idsFromMedia;
        sourceId = undefined;
      } else {
        // if not doing the hack, then add back the dateTimeFilters
        skipDateFilters = false;

        // TODO throw here instead? or cut off results?
        // otherwise postgres slows down.
      }
    }
    // database function accepts an array or single ID.
    // this is used internally even though the schema does
    // not currently allow it in the API.
    if (id) {
      if (!_.isArray(id)) ids = [id];
      else ids = id;
      ids.forEach((tid) => {
        checkTDOID(tid);
      });
      // if someone passed an empty array of ids then bail out now
      if (!ids.length) {
        return mainUtil.toPage(args, []);
      }
    }

    const where = [];
    let disableAclOptimization = false;
    let aclJoin = `
LEFT OUTER JOIN recording.recording_metadata rmacl
ON rmacl.recording_id = r.recording_id AND rmacl.type = 'veritone-permissions'
    `;
    const aclWhere = [];
    if (args.applicationIds && !bypassAuth) {
      args.applicationIds = args.applicationIds.map(function (str) {
        return "'" + str + "'";
      });
      const appIds = args.applicationIds.join(',');
      aclWhere.push(`r.application_id in (${appIds})`);
      if (args.includePublic) {
        aclWhere.push(`r.is_public = 'true'`);
      }
      if (ids) {
        // allow return of tdos belonging to a package if requested by id
        // the package access is resolved afterwards
        aclWhere.push(`rmacl.content->'packageId' IS NOT NULL`);
      }
      if (!_.isEmpty(args.includeByAcl) && args.groupId) {
        for (const perm of args.includeByAcl) {
          disableAclOptimization = true;
          aclWhere.push(
            `rmacl.content->'acls' @> '[{"groupId":"${args.groupId}","permission":"${perm}"}]'`
          );
        }
      }

      where.push(`(${aclWhere.join(' OR ')})`);
    }

    if (args.stopDate) {
      where.push(`r.start_date_time <= '${args.stopDate}'`);
    }
    if (args.startDate) {
      where.push(`r.stop_date_time >= '${args.startDate}'`);
    }

    let joinClause = '';
    if (sampleMedia === true) {
      joinClause += `
LEFT JOIN recording.recording_metadata m
  ON m.recording_id = r.recording_id
      `;
      where.push(`m.type = 'veritone-clone'`);
    }
    mainUtil.addSqlWhere('r.source_id', sourceId, where, sqlargs);
    mainUtil.addSqlWhere('r.recording_id', ids, where, sqlargs);
    mainUtil.addSqlWhere(
      'r.scheduled_job_id',
      args.scheduledJobId,
      where,
      sqlargs
    );

    // Clone filtering logic
    if (args.cloneRefreshMode && args.cloneId) {
      sqlargs.push(args.cloneId);
      joinClause += `
LEFT JOIN recording.recording_clone__tdo rcm
  ON rcm.clone_id = $${sqlargs.length} AND rcm.original_recording_id = r.recording_id
      `;

      if (args.cloneRefreshMode === 'existing_only') {
        where.push(`rcm.original_recording_id IS NOT NULL`);
      } else if (args.cloneRefreshMode === 'new_only') {
        // Only include recordings that have NOT been cloned
        where.push(`rcm.original_recording_id IS NULL`);
      }
    }

    if (!skipDateFilters) addTDODateTimeFilters('r', args, where, 'pg_ts');

    const orderDirectionMap = {
      desc: 'DESC',
      asc: 'ASC'
    };
    const orderDir = orderDirectionMap[args.orderDirection] || 'DESC';
    const orderBy = tdoOrderByMap[args.orderBy]
      ? `r.${tdoOrderByMap[args.orderBy]}`
      : `r.start_date_time`;

    // VTN-25021 - add secondary sort for columns that are not currently fully populated.
    // this ensures consistent ordering (but not meaningful; id is a string)
    // note that postgres by default treats NULL as "larger" (for NULL FIRST if desc, NULL LAST if asc)
    let secondSort = '';
    if (
      [
        'r.created_date_time',
        'r.modified_date_time',
        'r.start_date_time',
        'r.stop_date_time'
      ].includes(orderBy)
    ) {
      secondSort += ', r.recording_id ' + orderDir;
    }
    let optimizedAclQuery = false;
    const rmaclSelect = `,\n      rmacl.content AS veritonePermissions`;
    let rmSelect = rmaclSelect;
    if (
      !disableAclOptimization &&
      aclJoin &&
      secondSort &&
      where.length === 1 &&
      aclWhere.length
    ) {
      // Rewrite the sql query, since postgres defaults to scan on recording_metadata
      // when a secondary sort is present.
      // only do this when no additional where condition is present besides the acl filter
      aclJoin = '';
      optimizedAclQuery = true;
      rmSelect = '';
    }

    // OLP filtering
    let olpJoin = '';
    if (!ids && !bypassAuth && _.isFunction(args.rbacAuthFilter)) {
      const sqlFilter = args.rbacAuthFilter(
        'r.recording_id',
        sqlargs.length + 1
      );

      if (_.get(sqlFilter, 'metadata.resourceType') === 'TDO') {
        sqlargs.push(...sqlFilter.args);
        where.push(sqlFilter.where);
        olpJoin = sqlFilter.join;
      }
    }

    let sql = `
    SELECT
        r."json",
        r.recording_id AS id,
        r.source_id,
        r.is_public,
        r.created_by,
        r.modified_by,
        r.created_date_time,
        r.modified_date_time,
        r.scheduled_job_id,
        r.start_date_time,
        r.stop_date_time,
        r.organization_id,
        r.application_id${rmSelect}
    FROM
        recording.recording as r ${joinClause} ${aclJoin} ${olpJoin}
      ${where.length ? 'WHERE\n      ' + where.join(' AND ') : ''}`;

    if (!_.isNil(args.orderBy) || !_.isNil(args.offset)) {
      sql += `\n ORDER BY ${orderBy} ${orderDir}${secondSort}`;
    }

    if (!_.isNil(args.offset)) {
      sqlargs.push(args.offset);
      sql += `\n OFFSET \$${sqlargs.length}`;
    }

    sqlargs.push(args.limit || 30);
    sql += `\n LIMIT \$${sqlargs.length}`;

    if (optimizedAclQuery) {
      sql = `
      WITH rr AS (
        ${sql}
      )
      SELECT
            rr.*${rmaclSelect}
      FROM
            rr
      LEFT OUTER JOIN
            recording.recording_metadata rmacl
      ON rmacl.recording_id = rr.id AND rmacl.type = 'veritone-permissions'`;
    }

    const data = await serviceContext.dbConnections['core'].read.map(
      sql,
      sqlargs,
      mapper.mapRecording
    );

    return mainUtil.toPage(args, data);
  }

  function optimizeStartDateTimeFilter(dateFilters) {
    // bound the range on media_start_time so the index can
    // do a proper job. The common request is start < X and stop > Y, where X > Y.
    // Here we are adding start > Y - c, where c = 6hr (max tdo length ~ 4hr)
    if (!Array.isArray(dateFilters)) {
      return;
    }
    let startFilter, stopFilter;
    for (const f of dateFilters) {
      if (f.field === 'startDateTime') {
        startFilter = f;
      } else if (f.field == 'stopDateTime') {
        stopFilter = f;
      }
    }
    if (
      startFilter &&
      stopFilter &&
      startFilter.toDateTime &&
      stopFilter.fromDateTime
    ) {
      const rangeStart = moment(stopFilter.fromDateTime);
      const rangeStop = moment(startFilter.toDateTime);
      if (rangeStop.isAfter(rangeStart)) {
        // const hourDifference = Math.ceil(
        //   moment.duration(rangeStop.diff(rangeStart)).asHours()
        // );
        const lowBound = rangeStart.subtract(24, 'hours');
        if (!startFilter.fromDateTime) {
          startFilter.fromDateTime = lowBound.toISOString();
        }
      }
    }
  }

  function addTDODateTimeFilters(tableName, options, sqlWhere, dateFormatter) {
    if (options.dateTimeFilter) {
      const filters = _.isArray(options.dateTimeFilter)
        ? options.dateTimeFilter
        : [options.dateTimeFilter];
      filters.forEach((filter) => {
        if (!(filter.toDateTime || filter.fromDateTime)) {
          throw new errors.InvalidInput({
            message:
              'At least one of toDateTime or fromDateTime must ' +
              'be specified on a job date-time filter.',
            data: {
              filter: filter
            }
          });
        }

        const column = tdoOrderByMap[filter.field];
        const innerWhere = [];
        // note that we might receive a string in RTC format or an
        // integer in ms. in either case we need to convert
        if (filter.toDateTime) {
          innerWhere.push(
            `${tableName}.${column} ${
              filter.toDateTimeExclusive ? '<' : '<='
            } ${formatDate(filter.toDateTime)}`
          );
        }
        if (filter.fromDateTime) {
          innerWhere.push(
            `${tableName}.${column} ${
              filter.fromDateTimeExclusive ? '>' : '>='
            }  ${formatDate(filter.fromDateTime)}`
          );
        }
        if (innerWhere.length > 0) {
          if (filter.includeEmpty) {
            sqlWhere.push(
              `((${innerWhere.join(
                ' AND '
              )}) OR ${tableName}.${column} IS null)`
            );
          } else {
            sqlWhere.push(`(${innerWhere.join(' AND ')})`);
          }
        }
      });
    }

    function formatDate(date) {
      const divisor = 1000;
      if (_.isFunction(dateFormatter)) {
        return dateFormatter(date);
      } else if (_.isString(dateFormatter) && dateFormatter === 'pg_ts') {
        return `'${moment(date).toISOString()}'`;
      } else if (_.isString(date)) {
        return Math.floor(Date.parse(date) / divisor);
      } else if (_.isNumber(date)) {
        return Math.floor(date / divisor);
      } else return date;
    }
  }

  /**
   * Verify that the incoming ID is a valid TDO/recording ID. If not,
   * throw out an Error immediately (rather than waiting for a confusing
   * database error). A TDO/recording ID can be a numeric or a UUID.
   */
  function checkTDOID(id) {
    mainUtil.checkId(id, false, true);
  }

  function tdoCacheKey(tdo, args) {
    return tdo.id + ';' + (args.applicationId || tdo.applicationId);
  }

  const TDO_ASSET_COUNT_KEY_TYPE = 'TemporalDataObject:nonSegmentAssetCount';

  /**
   * Get TTL (in minutes) for TDO asset count cache from config.
   * Default: 6 hours (360 minutes)
   */
  function getTdoAssetCountTtlMin() {
    return _.get(
      config,
      'redis.features.temporalDataObject.nonSegmentAssetCount.ttlMin',
      360
    );
  }

  async function incrTDOAssetCount(tdoId) {
    const res = await serviceContext.redisCache.incr(
      TDO_ASSET_COUNT_KEY_TYPE,
      tdoId,
      getTdoAssetCountTtlMin()
    );
    return res;
  }

  async function decrTDOAssetCount(tdoId) {
    const res = await serviceContext.redisCache.decr(
      TDO_ASSET_COUNT_KEY_TYPE,
      tdoId,
      getTdoAssetCountTtlMin()
    );
    return res;
  }

  async function getTDOAssetCount(tdoId) {
    // first see if the value is in redis cache
    let currentValue = await serviceContext.redisCache.get(
      TDO_ASSET_COUNT_KEY_TYPE,
      tdoId
    );

    // if it's not there, need to add it.
    if (_.isNil(currentValue)) {
      // query DB
      currentValue = await getTDOAssetCountDb(tdoId);
      // put in redis cache with TTL from config
      await serviceContext.redisCache.set(
        TDO_ASSET_COUNT_KEY_TYPE,
        tdoId,
        _.toNumber(currentValue),
        null,
        getTdoAssetCountTtlMin()
      );
    }

    return currentValue;
  }

  async function getTDOAssetCountDb(tdoId) {
    const sql = `
SELECT
  count(*) AS count
FROM
  ${util.generateRecordingAssetPartition(tdoId)}
WHERE
 recording_id = $1 AND
 recording_id::bigint = $1 AND
 metadata->'details'->>'segmentIndex' IS null
    `;
    // exclude v2f media segments from the count - VTN-19654
    try {
      const res = await serviceContext.dbConnections['core'].read.query(sql, [
        tdoId
      ]);
      return res[0].count;
    } catch (e) {
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
      const errorCode = _.get(e, 'data.internalData.code');

      // catch the recording_asset partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // try to create the recording_asset partition table if not exists
        await serviceContext.dal.asset.validateRecordingAssetTablePartition(
          moment.utc()
        );
        // retry to get asset count
        const res = await serviceContext.dbConnections['core'].read.query(sql, [
          tdoId
        ]);
        return res[0].count;
      }

      throw e;
    }
  }

  // we call this first to insert the row in media table.
  // then we'll use the resulting ID to insert to recording.
  async function createInMediaTable(context, tdo, metadata) {
    const sql = `
INSERT INTO media (
  media_start_time,
  media_stop_time,
  owner_application_id,
  media_source_id,
  program_id,
  status,
  file_type,
  is_public
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING media_id, timezone('UTC', date_created) AS created_date_time, timezone('UTC', date_modified) AS modified_date_time;`;
    const params = [
      moment(tdo.startDateTime).toISOString(),
      moment(tdo.stopDateTime).toISOString(),
      tdo.applicationId,
      tdo.sourceId || -1,
      tdo.scheduledJobId || -1,
      tdo.status,
      tdo.fileType,
      tdo.isPublic
    ];
    const res = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(sql, params);
    const id = res[0].media_id;

    const metadataSql = `
INSERT INTO media_metadata (
  media_id, metadata
) VALUES ($1, $2);
    `;

    const metadataRes = await serviceContext.dbConnections[
      'media_platform'
    ].write.query(metadataSql, [id, metadata]);

    return res[0];
  }

  async function createInRecordingTable(context, tdo, jsondata, metadata) {
    const sql = `
INSERT INTO recording.recording (
  recording_id,
  application_id,
  "json",
  is_public,
  source_id,
  scheduled_job_id,
  organization_id,
  created_date_time,
  modified_date_time,
  start_date_time,
  stop_date_time,
  created_by,
  modified_by
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12
)`;
    const nowCr = moment().toISOString();
    const params = [
      tdo.id,
      tdo.applicationId,
      jsondata,
      tdo.isPublic,
      tdo.sourceId,
      tdo.scheduledJobId,
      tdo.organizationId,
      tdo.createdDateTime || nowCr,
      tdo.modifiedDateTime || nowCr,
      moment(tdo.startDateTime).toISOString(),
      moment(tdo.stopDateTime).toISOString(),
      tdo.createdBy
    ];
    const allSql = [sql];

    // now add all the metadata rows
    Object.keys(metadata || {}).forEach((blob) => {
      // do not write rows with empty content to db
      if (!metadata[blob]) return;
      allSql.push(`
INSERT INTO recording.recording_metadata (
  recording_id,
  type,
  content
) VALUES (
  $1,
  $${params.length + 1},
  $${params.length + 2}::JSONB
)`);
      params.push(blob);
      params.push(JSON.stringify(metadata[blob]));
    });

    const res = await serviceContext.dbConnections['core'].write.map(
      allSql.join(';'),
      params,
      mapper.mapRecording
    );
    return res[0];
  }

  function validateAddMediaSegmentInput(tdoId, segments) {
    // verify that ID is in acceptable format
    checkTDOID(tdoId);
    for (const segmentInfo of segments) {
      const url = segmentInfo.url;
      if (!url || url.length < 1) {
        throw new errors.InvalidInput({
          message:
            'The url input to addMediaSegment is required and must be non-empty. ' +
            'Supply a valid URL to continue.',
          data: {
            containerId: tdoId
          }
        });
      }
      try {
        const turl = new URL(url);
        if (_.isEmpty(turl.protocol) || _.isEmpty(turl.host))
          throw new Error('Invalid URL format');
      } catch (err) {
        throw new errors.InvalidInput({
          message:
            'The url input to addMediaSegment was present, but was not a valid ' +
            'URL. Supply a valid URL to continue.',
          data: {
            containerId: tdoId,
            url: url,
            errorDetail: err.message
          }
        });
      }
    }
  }

  async function updateTDOCache(tdoId, data, fields, overrideTimes) {
    const redisKey = MDP_ASSET_REDIS_KEY + tdoId;
    // get fresh copy of the tdo from redis and update within lock
    // to avoid race conditions updating with stale values.
    let tdoRefresh;
    const rLock = serviceContext.createRedisLock({
      retryCount: 3,
      retryDelay: 5000
    });
    try {
      const lockTdo = await rLock.lock(redisKey + '-lock_cache', 10000);
      try {
        // get an updated copy of the tdo from redis
        tdoRefresh = await serviceContext.redisCache.get(
          'TemporalDataObject',
          tdoId
        );
        if (_.isNil(tdoRefresh) || fields.length === 0) {
          // set redis cache from data
          if (tdoRefresh && !overrideTimes) {
            // keep the greater of the stopDateTime values
            const currentStopDateTime = moment(tdoRefresh.stopDateTime);
            if (
              !data.stopDateTime ||
              moment(data.stopDateTime).isBefore(currentStopDateTime)
            ) {
              data.stopDateTime = currentStopDateTime.toISOString();
              _.set(data, 'jsondata.stopDateTime', currentStopDateTime.unix());
            }
          }
          tdoRefresh = data;
          // save new cache or overwrite the existing one
          await serviceContext.redisCache.asyncSet(
            'TemporalDataObject',
            tdoId,
            data
          );
        } else {
          // set only modified fields in the cache
          let updateStopTime = false;
          let cacheChanged = false;
          // assign only the specified fields to the cache,
          // to avoid overwriting others changes
          for (const f of fields) {
            if (f === 'stopDateTime' || f === 'json.stopDateTime') {
              updateStopTime = true;
              continue;
            }
            _.set(tdoRefresh, f, _.get(data, f));
            cacheChanged = true;
          }
          if (updateStopTime) {
            const newStopTime = moment(data.stopDateTime);
            const currentStopDateTime = moment(tdoRefresh.stopDateTime);
            if (currentStopDateTime.isBefore(newStopTime) || overrideTimes) {
              tdoRefresh.stopDateTime = newStopTime.toISOString();
              tdoRefresh.jsondata.stopDateTime = newStopTime.unix();
            } else {
              updateStopTime = false;
            }
          }
          if (updateStopTime || cacheChanged) {
            await serviceContext.redisCache.asyncSet(
              'TemporalDataObject',
              tdoId,
              tdoRefresh
            );
          }
        }
      } finally {
        await lockTdo.unlock().catch(logger.error);
      }
    } catch (err) {
      serviceContext.logger.debug(
        'updateTDOCache: Failed to obtain cache lock, tdo being updated by another thread',
        { tdo: tdoId, err }
      );
    }
    return tdoRefresh;
  }

  const redisSADD = promisify((key, value, callback) => {
    serviceContext.redisClient.sadd(key, value, callback);
  });

  /**
   * Determine whether the source associated with a TDO is a live-streaming
   * source.  The result is cached in Redis (via redisCache) so repeated
   * calls during rapid segment ingestion are essentially free.
   *
   * @param  {Object}        context  - GraphQL context
   * @param  {string|number} sourceId - Source ID from the TDO
   * @param  {string|number} orgId    - Organization ID from the TDO
   * @return {Promise<boolean>}
   */
  async function isSourceLive(context, sourceId, orgId) {
    if (!sourceId || String(sourceId) === '-1') return false;

    const cacheKey = `${sourceId}_${orgId || 'null'}`;
    try {
      const cached = await serviceContext.redisCache.get(
        'SourceIsLive',
        cacheKey
      );
      if (cached !== null && cached !== undefined) return cached === true;
    } catch (_cacheErr) { /* cache miss / error — proceed with lookup */ }

    try {
      const source = await serviceContext.dal.source.getSource(context, {
        id: sourceId,
        organizationId: orgId
      });
      if (!source || !source.sourceTypeId) return false;

      const sourceType = await serviceContext.dal.sourceType.getSourceType(
        context,
        { id: source.sourceTypeId, organizationId: orgId }
      );
      const isLive = _.get(sourceType, 'isLive', false) === true;
      // Cache for future calls — TTL managed by redisCache defaults
      serviceContext.redisCache.set('SourceIsLive', cacheKey, isLive);
      return isLive;
    } catch (err) {
      logger.warn(`isSourceLive lookup failed for source=${sourceId}: ${err.message}`);
      return false;
    }
  }

  async function addMediaSegmentsBulk(context, args) {
    const tdoId = args.containerId;
    const start = performance.now();
    validateAddMediaSegmentInput(tdoId, args.segments);
    // default TTL of hours (?)
    // note that this is reset with every new segment.
    const ttl = _.get(
      serviceContext,
      'config.addMediaSegment.ttlSeconds',
      6 * 60 * 60
    );

    // we need to get the object first to validate access.
    let t0 = performance.now();
    const tdo = await getTDO(context, {
      id: tdoId,
      applicationId: args.applicationId,
      useCache: true,
      _writeAccessRequest: true
    });
    serviceContext.metrics.observeHistogram(
      'addMediaSegments',
      performance.now() - t0,
      {
        operation: 'getTDO'
      }
    );

    // Stamp after write authorization (getTDO above) and before the LPUSH
    // below, so the flag reaches the Redis LIST and every MDP file flushed
    // from it, but never on a request that fails authz.
    stampInitializationSegments(args.segments);

    // we need to get the segmentGroupId
    // directly from args or in the first segment's details.
    // Assuming all the segments in list have the same segmentGroupId
    const firstSegment = _.first(args.segments);
    const segmentGroupId =
      args.segmentGroupId || _.get(firstSegment, 'details.segmentGroupId');

    // > 1. Save segment to mdp-list in redis, create mdp asset if it doesn't exist

    // push to redis list and get the current list value
    const redisKey =
      MDP_ASSET_REDIS_KEY +
      tdoId +
      `${segmentGroupId ? ':' + segmentGroupId : ''}`;
    // we also keep the media mdp asset info in this cache, so that
    // we don't have to make any extra calls to redis or postgres if
    // it already exists in cache

    t0 = performance.now();
    let mediaMdpAsset = await redisLPush(redisKey, args.segments, ttl);

    serviceContext.metrics.observeHistogram(
      'addMediaSegments',
      performance.now() - t0,
      {
        operation: 'updateRedis'
      }
    );

    // > 2. Create the mediaMDPAsset if it doesn't exist
    if (!mediaMdpAsset) {
      // if we didn't find a media-mdp asset in redis, check postgres
      // this call will create the asset if necessary.
      t0 = performance.now();
      const lockOptions = {
        retryCount: 30,
        retryDelay: 1000
      };
      const redLock = serviceContext.createRedisLock(lockOptions);
      try {
        const lock = await redLock.lock(
          redisKey + '-lock',
          lockOptions.retryCount * lockOptions.retryDelay
        );
        try {
          mediaMdpAsset = await getOrCreateMdpAsset(
            context,
            tdo,
            segmentGroupId
          );
        } finally {
          lock.unlock().catch(logger.error);
        }
      } catch (err) {
        // failed to obtain createAsset lock
        // try getting from db (in case db entry is already created,
        // and the lock holder process is waiting on s3 upload)
        mediaMdpAsset = await getMediaMdpAsset(context, tdoId, segmentGroupId);
        if (!mediaMdpAsset) {
          // better create duplicate than risk creating no mdp assets.
          mediaMdpAsset = await getOrCreateMdpAsset(
            context,
            tdo,
            segmentGroupId
          );
        }
      }
      serviceContext.metrics.observeHistogram(
        'addMediaSegments',
        performance.now() - t0,
        {
          operation: 'createMdpAsset'
        }
      );
    }

    // > 3. Update the mdpSyncSet which is flushed on timer events by core-eventing
    // OBSOLETE: refreshMdpAsset(tdo.id, mediaMdpAsset.uri);
    // Descriptor: tdoId|redisKey|uri|assetId. The assetId lets core-eventing
    // resolve the signed upload URL without a per-flush lookup; it is appended
    // as a 4th field so older consumers (split('|', 3)) ignore it. See VE-25082.
    const syncHash = [
      tdo.id,
      redisKey,
      mediaMdpAsset.uri,
      mediaMdpAsset.id
    ].join('|');

    // we need to sync wait for the redis response so whe can return error to the user on error
    t0 = performance.now();
    await redisSADD(MDP_ASSET_REDIS_PENDING_FLUSH_SET, syncHash);
    serviceContext.metrics.observeHistogram(
      'addMediaSegments',
      performance.now() - t0,
      {
        operation: 'redisSetPendingFlushFlag'
      }
    );

    // > 3b. Sign & cache segment URLs for live sources (Option B+C)
    // Write freshly-signed URLs into a separate Redis HASH so that
    // media-streamer's direct-Redis path can serve pre-signed URLs
    // without a GraphQL round-trip.  Only fires for live sources.
    // No need to check a "segmented" flag — we are already adding
    // segments to the Redis LIST, so the TDO is segmented by definition.
    if (tdo.sourceId) {
      try {
        const liveSource = await isSourceLive(context, tdo.sourceId, tdo.orgId);
        if (liveSource) {
          const signedHashKey = SIGNED_SEGMENT_URIS_KEY + tdoId +
            (segmentGroupId ? `:${segmentGroupId}` : '');
          const signedUrlTtl = _.get(serviceContext,
            'config.s3.signedUrlExpires',
            _.get(serviceContext, 'config.s3Buckets.api.s3.signedUrlExpires', 3600));

          const signMulti = serviceContext.redisClient.multi();
          for (const seg of args.segments) {
            if (seg.url) {
              const signedUrl = await resUtil.getSignedUrl(seg.url);
              signMulti.hset(signedHashKey, seg.url, signedUrl);
            }
          }
          signMulti.expire(signedHashKey, signedUrlTtl, 'NX');
          await multiExec(signMulti);
        }
      } catch (err) {
        // Non-fatal — readers fall back to GraphQL if HASH is missing
        logger.warn(
          `addMediaSegmentsBulk: failed to cache signed URLs for tdo=${tdoId}: ${err.message}`
        );
      }
    }

    // 4. update TDO stop time in the cache
    // the db stop_time will be updated with the sync flush.
    // NOTE: Previously this read from args.input.details.segmentStopTimeMs,
    // which is always undefined in the bulk path (args has {containerId,
    // segments, segmentGroupId} — no `input` wrapper).  This caused the
    // TDO's stopDateTime to never be updated in the Redis cache, leaving
    // it stale (stop === start) until core-eventing's periodic MDP sync
    // flush ran — often 5-7+ minutes later.  Reading from the last
    // segment's details fixes the cache update so downstream consumers
    // (e.g. media-streamer's activeTdoCache) see an up-to-date stopDateTime.
    const segmentOffset = _.max(
      args.segments.map(s => _.get(s, 'details.segmentStopTimeMs')).filter(Boolean)
    );
    let newTdoStopTime;
    if (segmentOffset) {
      newTdoStopTime = serviceContext.dal.asset.getStopDateTimeMoment(
        tdo,
        segmentOffset
      );
      if (!tdo.stopDateTime || moment(tdo.stopDateTime).isBefore(newTdoStopTime)) {
        // update ste stop time in the cache, the db update is delegated to the mdp sync flush in core-eventing
        tdo.stopDateTime = newTdoStopTime.toISOString();
        updateTDOCache(tdoId, tdo, [], false);

        // This calls updateTDO in a redis lock to update cache, db and call indexing
        // if addMediaSegments is called for every segment this will cause high load on the db.
        // updateTDOStopTime_Locked(
        //   context,
        //   tdoId,
        //   newTdoStopTime,
        //   args.organizationId
        // );
      }
    }

    serviceContext.metrics.observeHistogram(
      'addMediaSegments',
      performance.now() - start,
      {
        operation: 'total'
      }
    );
    return tdo;
  }

  async function addMediaSegment(context, args) {
    return addMediaSegmentsBulk(context, {
      containerId: args.input.containerId,
      segments: [
        {
          url: args.input.url,
          details: args.input.details
        }
      ],
      segmentGroupId: _.get(args, 'input.segmentGroupId')
    });
  }

  // Update tdo stopDateTime ensuring that only greater than
  // the current cached value is set. This calls updateTDO
  // and updates cache, db and calls indexing
  async function updateTDOStopTime_Locked(
    context,
    tdoId,
    stopDateTimeMoment,
    organizationId
  ) {
    const redisKey = TDO_UPDATE_LOCK + tdoId;
    // get fresh copy of the tdo from redis and update within lock
    // to avoid race conditions updating with stale values.
    let tdoRefresh;
    const rLock = serviceContext.createRedisLock({
      retryCount: 30,
      retryDelay: 1000
    });
    try {
      const lockTdo = await rLock.lock(redisKey, 20000);
      // get an updated copy of the tdo from redis
      try {
        tdoRefresh = await serviceContext.redisCache.get(
          'TemporalDataObject',
          tdoId
        );
        if (!_.isNil(tdoRefresh)) {
          const currentStopDateTime = moment(tdoRefresh.stopDateTime);
          if (currentStopDateTime.isAfter(stopDateTimeMoment)) {
            // the tdo duration in the cache is longer, this update is stale/obsolete
            return;
          }
        }
        await doUpdateTDO(
          context,
          {
            input: {
              id: tdoId,
              stopDateTime: stopDateTimeMoment.toISOString()
            },
            organizationId
          },
          {}
        );
      } finally {
        await lockTdo.unlock().catch(logger.error);
      }
    } catch (err) {
      context.logger.error('updateTDOCache: Failed to obtain cache lock', {
        tdo: tdoId,
        err
      });
    }
  }
  async function getMediaMdpAsset(context, tdoId, segmentGroupId) {
    const assets = await serviceContext.dal.asset.getAssets(context, {
      containerId: tdoId,
      assetType: 'media-mdp',
      includeVirtualMediaAsset: false,
      limit: 10, // incre the limit since we currently may have more than one mdp-asset
      orderBy: 'id', // ensure consistent ordering in case duplicates were
      // created by a race condition
      orderDir: 'desc',
      segmentGroupId
    });

    // filter out assets that were mapped with segmentGroupId.
    // In case the segmentGroupId did not pass in,
    // we will keep a legacy asset without segmentGroupId
    if (_.isNil(segmentGroupId) && assets.records.length) {
      assets.records = _.filter(assets.records, (rec) => {
        return _.isNil(rec.metadata.segmentGroupId);
      });
    }

    return assets.records.length ? assets.records[0] : null;
  }

  async function getLongestMdpAssetWithCache(context, tdoId) {
    const assets = await serviceContext.dal.asset.getAssets(context, {
      containerId: tdoId,
      assetType: 'media-mdp',
      includeVirtualAsset: false,
      limit: 10
    });
    let longestAsset;

    if (_.isArray(assets.records) && !_.isEmpty(assets.records)) {
      const fullAssets = await Promise.all(
        assets.records.map(async (asset) => {
          const segmentGroupId = _.get(asset, 'metadata.segmentGroupId');
          const segmentRedisKey =
            MDP_ASSET_REDIS_KEY +
            tdoId +
            `${segmentGroupId ? ':' + segmentGroupId : ''}`;
          let multi = serviceContext.redisClient.multi();
          multi.lrange(segmentRedisKey, 0, -1);
          const res = await multiExec(multi);
          let list = [];

          if (res && _.isArray(res[0])) {
            list = cleanRawStreamManifest(res[0]);
          }

          return _.assign(asset, { dataS: list });
        })
      );

      longestAsset = _.maxBy(
        fullAssets,
        (asset) => (asset.dataS.segments || []).length
      );
    }

    return longestAsset;
  }

  async function getOrCreateMdpAsset(context, tdo, segmentGroupId) {
    const redisKey =
      MDP_ASSET_REDIS_KEY +
      tdo.id +
      `${segmentGroupId ? ':' + segmentGroupId : ''}`;

    let mediaMdpAsset = await getMediaMdpAsset(context, tdo.id, segmentGroupId);

    // if we don't have one, create it now
    if (!mediaMdpAsset) {
      mediaMdpAsset = await serviceContext.dal.asset.createAssetAuthorized(
        {
          containerId: tdo.id,
          assetType: 'media-mdp',
          contentType: 'application/json',
          setAsPrimary: true,
          __skipAssetCountCheck: true, // do not count this against asset limit
          object: [], // initialize with empty data
          segmentGroupId
        },
        context,
        tdo
      );
    }

    // add the asset to redis cache
    const multi = serviceContext.redisClient.multi();
    multi.set(redisKey + '-asset', JSON.stringify(mediaMdpAsset));
    multi.expire(redisKey + '-asset', 6 * 60 * 60); // 6 hour ttl
    await multiExec(multi);

    return mediaMdpAsset;
  }

  /**
   * Refreshes a TDO's MDP asset with current data
   * @param tdoId The TDO ID
   * @param assetUri S3 URI to the asset
   * @param currentList The current tdo stop time as unix timestamp
   */
  async function refreshMdpAsset(
    tdoId,
    assetUri,
    stopDateTime,
    segmentGroupId,
    assetId
  ) {
    const redisKey =
      MDP_ASSET_REDIS_KEY +
      tdoId +
      `${segmentGroupId ? ':' + segmentGroupId : ''}`;
    // now overwrite manifest with new list
    const s3Uri = serviceContext.storage.isAmazonS3Uri(assetUri)
      ? s3UriParser(assetUri)
      : defaultUriParser(assetUri);
    const objectKey = s3Uri.key;

    let dbUpdate = updateTDODbStopTime(tdoId, stopDateTime);
    let storageRes = uploadMdpAsset_LockRetry(tdoId, objectKey, redisKey, assetId);
    // TODO: storageRes will be empty if newList is outdated. Throw?
    return Promise.all([dbUpdate, storageRes]);
  }

  /**
   * Uploads MDP asset with retries, acquiring and releasing lock between the retries.
   * Enforces a version check and returns success
   * If current version is lower than the current redis value it returns empty result
   * @param s3Key S3 key to the asset
   * @param list The segment list.
   * @param redisKey Redis key to use for lock and versioning
   * @param version  Current version number
   * @throws s3 upload error, failed to obtain lock
   */
  async function uploadMdpAsset_LockRetry(tdoId, s3Key, redisKey, assetId) {
    const maxRetry = _.get(config, 's3.maxRetry', 3);
    const retryDelayMs = _.get(config, 's3.retryDelayMs', 1000);
    const maxLockRetry = _.get(config, 'mdp.lock.maxRetry', 600);
    const lockRetryDelay = _.get(config, 'mdp.lock.retryDelayMs', 1000); // retry every 1s for 10min
    const lockTTLMs = _.get(config, 'mdp.lock.retryDelayMs', 120000); // only hold the lock for 2 min

    const redLock = serviceContext.createRedisLock({
      retryCount: 1,
      retryDelay: lockRetryDelay
    });
    let attempt = 0;
    let lockAttempts = 0;
    let s3err;
    do {
      try {
        const versionKey = redisKey + '-version';
        const lock = await redLock.lock(redisKey + '-lock', lockTTLMs);
        try {
          // get latest uploaded version from redis
          let multi = serviceContext.redisClient.multi();
          multi.get(versionKey);
          multi.lrange(redisKey, 0, -1);
          const res = await multiExec(multi);

          if (!res || !res[1]) {
            // TODO should this error out, or just quit? the asset is already created.
            serviceContext.logger.error(
              'No persisted segment list for the given TDO',
              tdoId
            );
            return;
          }
          const list = cleanRawStreamManifest(res[1]);
          const version = _.get(list, 'segments', []).length;
          if (_.isNumber(res[0]) && res[0] > version) {
            // stale/outdated manifest
            serviceContext.logger.trace('Outdated mdp asset', version, res[0]);
            return;
          }

          lockAttempts = 0; //reset lock counts in case the upload fails
          // upload manifest
          const storageAsset = await uploadMdpAsset(s3Key, list, attempt);

          // set version as the latest uploaded version in redis.
          multi = serviceContext.redisClient.multi();
          multi.set(versionKey, version);
          multi.expire(versionKey, 6 * 60 * 60); // 6 hr ttl
          await multiExec(multi);

          // emit events for tagging the media segments async via core-eventing with redis lock
          const segments = _.get(list, 'segments', []);
          if (tdoId & segments.length) {
            emitSetTagAssetsEventForSegments(segments, tdoId);
          }

          return storageAsset;
        } catch (err) {
          s3err = err;
          attempt++;
          logger.error(`Failed to update MDPAsset, attempt: ${attempt}`, err);
        } finally {
          lock.unlock().catch((err) => {
            logger.error(err);
          });
        }
      } catch (lockErr) {
        // failed to obtain lock
        logger.trace(lockErr);
        lockAttempts++;
      }
      // sleep before next retry
      const delayMs =
        lockAttempts > 0 ? lockRetryDelay : attempt * retryDelayMs;
      await mainUtil.sleep(delayMs);
    } while (attempt < maxRetry && lockAttempts < maxLockRetry);

    if (s3err) {
      throw s3err;
    }

    const event = {
      tdoId,
      objectKey: s3Key,
      type: 'asset',
      event: 'refresh_mdp_asset',
      redisKey,
      // let core-eventing skip the media-mdp asset lookup (undefined is fine —
      // it falls back to a lookup). See VE-25082.
      assetId
    };

    // emit the event to core-eventing instead of throw error
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
  }

  /**
   * Uploads MDP asset.
   * @param objectKey S3 key to the asset
   * @param newList The segment list.
   * @param attempt External retry counter for logging purposes
   * @returns error if the operation is unsuccessful
   */
  async function uploadMdpAsset(objectKey, newList, attempt) {
    const stream = intoStream(JSON.stringify(newList));
    const start = Date.now();
    try {
      serviceContext.metrics.incrementCounter('httpCall', {
        pool: 's3'
      });
      serviceContext.metrics.incrementGauge('httpConcurrentCalls', {
        pool: 's3'
      });
      const storageRes = await myPutObject(
        objectKey,
        'application/json',
        {} /* ??? */,
        stream
      );
      const elapsed = Date.now() - start;
      serviceContext.metrics.decrementGauge('httpConcurrentCalls', {
        pool: 's3'
      });
      serviceContext.metrics.observeHistogram('httpCallElapsedMs', elapsed, {
        pool: 's3'
      });
      httpUtil.logHttpCall(
        's3://' + objectKey,
        elapsed,
        0,
        200,
        's3',
        null,
        attempt
      );
      return storageRes;
    } catch (err) {
      const elapsed = Date.now() - start;
      serviceContext.metrics.decrementGauge('httpConcurrentCalls', {
        pool: 's3'
      });
      serviceContext.metrics.observeHistogram('httpCallElapsedMs', elapsed, {
        pool: 's3'
      });
      httpUtil.recordHttpError(
        's3://' + objectKey,
        err,
        elapsed,
        's3',
        attempt
      );
      throw err;
    }
  }

  function defaultUriParser(assetUri) {
    const url = URL(decodeURIComponent(assetUri));

    let bucket;
    let key;

    if (url.pathname !== '/') {
      // This is copied/modified from s3URIParser
      const index = url.pathname.indexOf('/', 1);
      if (index === -1) {
        bucket = url.pathname.substring(1);
      } else if (index === url.pathname.length - 1) {
        bucket = url.pathname.substring(1, index);
      } else {
        bucket = url.pathname.substring(1, index);
        key = url.pathname.substring(index + 1);
      }
    }
    return { bucket, key };
  }

  // clean up the raw segment list from Redis
  function cleanRawStreamManifest(newList) {
    // clean up, parse, and sort the segment list
    newList = _.compact(newList);
    for (let i = 0; i < newList.length; i++) {
      newList[i] = JSON.parse(newList[i]);
    }
    newList = _.sortBy(newList, [
      (o) => _.get(o, 'details.segmentStartTimeMs', 0),
      (o) => _.get(o, 'details.segmentStopTimeMs', 0)
    ]); //['details.segmentStartTimeMs', 'details.segmentStopTimeMs'])
    const data = {
      segments: newList
    };
    return data;
  }

  async function getStreamManifest(context, tdo) {
    const longestMdpAsset = await getLongestMdpAssetWithCache(context, tdo.id);
    const segmentGroupId = _.get(longestMdpAsset, 'metadata.segmentGroupId');
    // first see if the manifest OR the original list generated
    // at ingestion by addMediaSegment is in redis,
    // using a single round trip.
    const redisKey =
      MDP_ASSET_REDIS_KEY +
      tdo.id +
      `${segmentGroupId ? ':' + segmentGroupId : ''}`;
    const mdpKey =
      'core-graphql-server:TemporalDataObject:ManifestMDPFile:' + tdo.id;
    const multi = serviceContext.redisClient.multi();
    multi.lrange(redisKey, 0, -1); // entire list (if present)
    multi.get(mdpKey); // actual manifest (digested version)
    const rres = await multiExec(multi);
    const cachedList = rres[0];
    const cachedManifest = rres[1];

    let list; // final result goes here
    // first see if we've cached the whole manifest in redis
    if (cachedManifest) {
      list = JSON.parse(cachedManifest);
    } else if (cachedList && cachedList.length > 0) {
      // if not, see if we've still got the original list
      list = cleanRawStreamManifest(cachedList);
      list = await setupStreamManifest(context, list, tdo.id);
    } else {
      // otherwise get it from the database
      list = await getStreamManifestFromAssets(context, tdo);
      if (list) {
        // then populate it in cache. note that redisCache.set() stringifies the object.
        serviceContext.redisCache.set(
          'TemporalDataObject:ManifestMDPFile',
          tdo.id,
          list,
          null,
          10 // override TTL
        );
      }
    }

    // ── Fixup: populate signed-URL HASH for direct-Redis readers ──────
    // When getStreamManifest signs segments (tiers 2 & 3), write the
    // freshly-signed URLs into the shared HASH so that media-streamer's
    // direct-Redis path can reuse them.  This "self-healing" step turns
    // every GraphQL fallback into a cache-warm event, eliminating
    // repeated fallbacks after cold starts or HASH expiry.
    if (list && list.segments && list.segments.length > 0) {
      try {
        // Only populate if the HASH already exists (meaning the write path
        // in addMediaSegmentsBulk seeded it for a live source).  This
        // "self-healing" step keeps the HASH warm after GraphQL fallbacks
        // without creating a new HASH for non-live TDOs.
        const signedHashKey = SIGNED_SEGMENT_URIS_KEY + tdo.id +
          (segmentGroupId ? `:${segmentGroupId}` : '');

        const existsRes = await new Promise((resolve, reject) => {
          serviceContext.redisClient.exists(signedHashKey, (err, res) => {
            if (err) return reject(err);
            resolve(res);
          });
        });

        if (existsRes === 1) {
          const signedUrlTtl = _.get(serviceContext,
            'config.s3.signedUrlExpires',
            _.get(serviceContext, 'config.s3Buckets.api.s3.signedUrlExpires', 3600));

          const fixupMulti = serviceContext.redisClient.multi();
          for (const seg of list.segments) {
            if (seg.url && seg.signedUrl) {
              fixupMulti.hset(signedHashKey, seg.url, seg.signedUrl);
            }
          }
          if (list.initSegment && list.initSegment.url && list.initSegment.signedUrl) {
            fixupMulti.hset(signedHashKey, list.initSegment.url, list.initSegment.signedUrl);
          }
          fixupMulti.expire(signedHashKey, signedUrlTtl);
          await multiExec(fixupMulti);
        }
      } catch (err) {
        logger.warn(
          `getStreamManifest: failed to populate signed HASH for tdo=${tdo.id}: ${err.message}`
        );
      }
    }

    return list;
  }

  async function getStreamManifestFromAssets(context, tdo) {
    const assets = await serviceContext.dal.asset.getAssets(context, {
      containerId: tdo.id,
      assetType: 'media-mdp',
      includeVirtualMediaAsset: false,
      limit: 6
    });

    let res;
    if (assets.records.length > 0) {
      // decide which asset to go with based on number of segments
      const mdpFiles = await Promise.all(
        assets.records
          .filter((asset) => {
            const isEmptyAssetUri = _.isEmpty(asset.uri);
            if (isEmptyAssetUri) {
              serviceContext.logger.warn(
                `Asset : ${JSON.stringify(asset)} has no "uri" property`
              );
            }
            return !isEmptyAssetUri;
          })
          .map(async (asset) => {
            const url = asset.uri;
            const signed = await resUtil.getSignedUrl(url);
            const dataS = await resUtil.download(signed, context);
            return JSON.parse(dataS);
          })
      );
      const data = _.maxBy(mdpFiles, (data) => (data.segments || []).length);
      res = await setupStreamManifest(context, data, tdo.id);
    }
    return res;
  }

  /**
   * VE-27877: the legacy init-segment marker. Only check for existence of
   * codecs — no value check, so codecs="" still counts.
  **/
  function hasLegacyInitMarker(details) {
    return 'codecs' in details;
  }

  /**
   * VE-27877: mark init segments at write time so readers don't have to
   * infer them from codecs alone. MPEG-TS batches legitimately have no
   * init segment and get no stamp. Mutates the caller's segment details in
   * place (safe: runs after write authz, and segments are never echoed in
   * the mutation response). The marker check is existence-only, so an init
   * whose codecs is "" (e.g. audio-only) still gets stamped. Additive
   * only — a producer-supplied initializationSegment flag is honored,
   * never cleared, because content whose details carry no codecs key at
   * all has no other way to mark its init.
   */
  function stampInitializationSegments(segments) {
    for (const seg of segments) {
      const details = seg && seg.details;
      if (_.isObject(details) && hasLegacyInitMarker(details)) {
        details.initializationSegment = true;
      }
    }
  }

  /**
   * VE-27877: a segment is the stream's initialization segment when it was
   * stamped at write time (stampInitializationSegments) or — for data
   * written before stamping existed — when it carries the legacy marker
   * (codecs). Mirrored in media-streamer's isInitSegment
   * (routes/stream.js); keep the two in sync.
   *
   * Precedence: callers split a list already sorted by segment timing with
   * missing times defaulting to 0, so a real (untimed) init segment always
   * sorts ahead of any timed segment; among true duplicate inits the sort
   * ties and LPUSH order makes first-match select the newest-pushed one —
   * benign, as the init segment is immutable for a TDO's lifetime.
   */
  function isInitSegment(seg) {
    const details = _.get(seg, 'details');
    if (!_.isObject(details)) {
      return false;
    }
    return (
      details.initializationSegment === true || hasLegacyInitMarker(details)
    );
  }

  async function setupStreamManifest(context, data, tdoId) {
    const res = { segments: [] };
    for (let i = 0; data.segments && i < data.segments.length; i++) {
      const seg = data.segments[i];
      if (isInitSegment(seg)) {
        // First match wins; a re-sent init segment must not leak into the
        // playable segment list (it has no media samples).
        if (!res.initSegment) {
          res.initSegment = seg;
        } else {
          logger.debug(
            `setupStreamManifest: skipping duplicate init segment at ` +
              `index ${i} for tdo=${tdoId}`
          );
        }
      } else {
        res.segments.push(seg);
      }
      seg.signedUrl = await resUtil.getSignedUrl(seg.url);
    }
    return res;
  }

  async function updateTDODbStopTime(tdoId, stopDateTime) {
    const sql = [];
    const values = [];
    // TODO optimize. currently this will always make a DB call.
    // ok for now since the segments will usually be added in order.
    serviceContext.dal.asset.buildStopTimeUpdateSql(
      tdoId,
      moment(stopDateTime),
      sql,
      values
    );
    if (sql.length > 0) {
      // SQL was generated so we have an update to do
      await serviceContext.dbConnections['core'].write.query(
        sql.join(';'),
        values
      );
      return serviceContext.dal.asset.updateMediaTableStopTime(
        tdoId,
        stopDateTime
      );
    }
  }

  const myPutObject = promisify(serviceContext.storage.putObject);

  // redis helper/wrapper function
  function multiExecCb(multi, callback) {
    multi.exec((err, results) => {
      callback(err, results);
    });
  }

  const multiExec = promisify(multiExecCb);

  async function redisLPush(key, values, ttlSec) {
    const multi = serviceContext.redisClient.multi();
    // push the new values
    for (const value of values) {
      multi.lpush(key, JSON.stringify(value));
    }
    // retrieve the entire new list
    // multi.lrange(key, 0, -1);
    // retrieve current media-mdp asset, if it exists
    multi.get(key + '-asset');
    // set TTL
    multi.expire(key, ttlSec);

    const rres = await multiExec(multi);

    let mediaMdpAsset;
    try {
      if (rres[values.length]) mediaMdpAsset = JSON.parse(rres[values.length]);
    } catch (err) {
      serviceContext.logger.warn(
        'CORRUPTED ASSET in mediaMdpAsset cache for ' + key + ':  ' + err
      );
      /* corrupted asset in redis. return null so it's replaced. */
    }

    return mediaMdpAsset;
  }

  function getCloneRequests(cloneId, appId, args) {
    let sqlParams = [];
    let sqlWhere = [];

    if (appId) {
      sqlParams.push(appId);
      sqlWhere.push(`(source_application_id = $${sqlParams.length} OR destination_application_id = $${sqlParams.length})`);
    }

    if (cloneId) {
      sqlParams.push(cloneId);
      sqlWhere.push(`clone_id = $${sqlParams.length}`);
    }

    sqlParams.push(args.applicationIds);
    sqlWhere.push(`source_application_id = any($${sqlParams.length})`);

    const { limit, offset } = util.validatePagination(args);
    const { pagingSql } = util.mapPaginationSql(limit, offset, sqlParams);

    const where = sqlWhere.length > 0 ? `WHERE ${sqlWhere.join(' AND ')} ` : '';
    const sql = `
			SELECT
				clone_id,
				status,
				number_of_completed_recordings,
				number_of_recordings,
				created_date_time,
				modified_date_time,
        source_application_id,
        destination_application_id,
        request
			FROM
				recording.recording_clone
      ${where}
      ORDER BY created_date_time DESC
      ${pagingSql}
    `;

    return serviceContext.dbConnections['core'].read
      .map(sql, sqlParams, mapper.mapCloneJob)
      .then(function (rows) {
        return {
          records: rows,
          offset: args.offset,
          limit: args.limit,
          count: rows.length
        };
      });
  }

  async function getTDOSourceTaskData(tdoId) {
    const TYPE = 'TDOSourceTaskData';
    const NOVAL = '__NO_VALUE';
    // first look up in cache
    let res = localCache.get(TYPE, tdoId);
    if (!res) {
      res = await getTDOSourceTaskDataFromRedis(tdoId);
      // cache null/empty result with special value to avoid
      // re-fetching result every time for TDO with no source data
      localCache.set(TYPE, tdoId, !res ? NOVAL : res);
    } else if (res === NOVAL) {
      // if we cached special NOVAL, return null
      res = null;
    }
    return res;
  }

  async function getTDOSourceTaskDataFromRedis(tdoId) {
    let res = await serviceContext.redisCache.get(
      'TemporalDataObject.sourceTaskData',
      tdoId
    );
    if (!res) {
      res = await getTDOSourceTaskDataFromDb(tdoId);
      if (res) {
        await serviceContext.redisCache.set(
          'TemporalDataObject.sourceTaskData',
          tdoId,
          res
        );
      }
    }
    return res;
  }

  async function getTDOSourceTaskDataFromDb(tdoId) {
    // if not found, load from database
    const sql = `
      SELECT
        content
      FROM
        recording.recording_metadata
      WHERE
        recording_id = $1 AND
        type = 'source-task-data'
      LIMIT 1;`;
    const dbconn = serviceContext.dbConnections['core'].read;
    const rows = await dbconn.map(sql, [tdoId], (row) => row.content);
    // if we got no rows back, result is empty/null
    return rows.length ? rows[0] : null;
  }

  /** String safe for JSON/jsonb clone `response.error` (Error objects do not stringify usefully). */
  function errorMessageForCloneResponse(err) {
    if (err == null) {
      return 'Unknown error';
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
    try {
      return String(err);
    } catch {
      return 'Unknown error';
    }
  }

  async function requestClone(context, args) {
    const input = args.input;

    let sourceOrganization = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: input.sourceApplicationId ?? args.applicationId ?? args.organizationId
      }
    );

    let destinationOrganization = await serviceContext.dal.organization.getOrganization(
      context,
      {
        id: input.destinationApplicationId ?? args.applicationId
      }
    );

    let sourceApplicationId = sourceOrganization.organizationGuid;
    let destinationApplicationId = destinationOrganization.organizationGuid;

    if (!input.applicationIds?.includes(sourceApplicationId)) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: sourceApplicationId
        }
      });
    }

    if (destinationApplicationId === sourceApplicationId) {
      throw new errors.InvalidInput({
        message: 'Source and destination application IDs cannot be the same',
        data: {
          objectType: 'CloneRequest',
          field: 'destinationApplicationId',
          value: destinationApplicationId
        }
      });
    }

    // Validate cloneAssets if provided
    if (input.cloneAssets && input.cloneAssets.length > 0) {
      for (const assetFilter of input.cloneAssets) {
        if (!assetFilter.assetType || assetFilter.assetType.length === 0) {
          throw new errors.InvalidInput({
            message: 'Asset filter assetType is required and must have minimum length'
          });
        }
      }
    }

    // Validate tdoIds up front (same rules as getAllRecordings / checkTDOID) so the mutation
    // fails fast instead of enqueueing a clone that will fail in the background worker.
    if (input.tdoIds !== undefined && input.tdoIds !== null) {
      if (!Array.isArray(input.tdoIds)) {
        throw new errors.InvalidInput({
          message: 'tdoIds must be an array of recording IDs',
          data: {
            objectType: 'CloneRequest',
            field: 'tdoIds'
          }
        });
      }
      if (input.tdoIds.length === 0) {
        throw new errors.InvalidInput({
          message:
            'tdoIds must contain at least one recording ID when provided',
          data: {
            objectType: 'CloneRequest',
            field: 'tdoIds'
          }
        });
      }
      if (input.tdoIds.length > REQUEST_CLONE_MAX_TDO_IDS) {
        throw new errors.InvalidInput({
          message: `tdoIds cannot contain more than ${REQUEST_CLONE_MAX_TDO_IDS} entries`,
          data: {
            objectType: 'CloneRequest',
            field: 'tdoIds',
            value: input.tdoIds.length
          }
        });
      }
      for (const [i, tid] of input.tdoIds.entries()) {
        try {
          checkTDOID(tid);
        } catch (cause) {
          throw new errors.InvalidInput({
            message:
              'Each tdoIds entry must be a valid recording ID (UUID or integer).',
            data: {
              objectType: 'CloneRequest',
              field: 'tdoIds',
              index: i,
              value: tid,
              cause: cause?.data
            }
          });
        }
      }
    }

    const cloneArgs = {
      cloneId: uuidv4(),
      sourceApplicationId,
      destinationApplicationId,
      request: {
        includeJobs: input.includeJobs,
        cloneBlobs: input.cloneBlobs,
        includeAssets: input.includeAssets !== false, // Default to true
        cloneAssets: input.cloneAssets || [],
        ...(input.tdoIds === undefined ? {} : { tdoIds: input.tdoIds })
      }
    };

    // create recording clone
    const cloneRequest = await createClone(cloneArgs);
    // run process clone recording on background
    const runPromise = runProcessClone(context, "new_only", cloneRequest, { isRefresh: false });
    runPromise.catch(async (err) => {
      logger.error(err);
      // Update clone status to failed
      const result = await updateClone({
        ...cloneRequest,
        status: 'failed',
        response: {
          error: errorMessageForCloneResponse(err)
        }
      });
      cloneRequest.status = result?.status;
      cloneRequest.response = result?.response;
    });
    return { clone: cloneRequest, exec: runPromise };
  }

  async function runProcessClone(context, cloneRefreshMode, cloneRequest, options) {
    const sourceAppId = cloneRequest.sourceApplicationId;
    const cloneId = cloneRequest.id;
    const destinationAppId = cloneRequest.destinationApplicationId;

    const sourceOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
      sourceAppId
    );

    // Get destination organization id from the clone request
    const destinationOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
      destinationAppId
    );

    const opts = {
      destinationOrgId
    };

    const requestTdoIds = cloneRequest.request?.tdoIds;

    const limit = 50;
    const newIds = [];
    let totalComplete = options.isRefresh ? cloneRequest.numberOfCompletedRecordings : 0;
    let totalSize = options.isRefresh ? cloneRequest.numberOfRecordings : 0;
    let pageSize = 0;
    let offset = 0;
    let isFirstRun = true;

    try {
      while (isFirstRun || pageSize >= limit) {
        isFirstRun = false;
        const getRecordingArgs = {
          organizationIds: [sourceOrgId],
          applicationId: sourceAppId,
          applicationIds: [sourceAppId],
          cloneId,
          cloneRefreshMode,
          limit,
          offset,
        };
        if (requestTdoIds !== undefined && requestTdoIds !== null) {
          getRecordingArgs.ids = requestTdoIds;
        }

        // get recordings from source application
        const recordings = await getAllRecordings(getRecordingArgs);
        offset += recordings.count;
        pageSize = recordings.count;

        const updatedResult = await updateClone({
          cloneId,
          numberOfRecordings: totalSize,
          numberOfCompletedRecordings: totalComplete,
        });

        if (updatedResult?.status === 'running') {
          cloneRequest.status = updatedResult?.status;
          cloneRequest.numberOfRecordings = updatedResult?.numberOfRecordings;
          cloneRequest.numberOfCompletedRecordings = updatedResult?.numberOfCompletedRecordings;
        } else {
          throw new Error(`Unexpected status change while updating clone status: ${updatedResult?.status}`);
        }

        if (recordings?.records?.length) {
          const records = recordings.records.filter(recording => !isClonedRecording(recording.details));
          const pageResults = new Array(records.length);
          await async.eachLimit(
            records.map((recording, index) => ({ recording, index })),
            async ({ recording, index }) => {
              const { clonedRecording, toCloneStatus } = await processRecordingToClone(
                context,
                recording,
                cloneRefreshMode,
                cloneRequest,
                opts
              );

              let incrementResult = null;
              if (toCloneStatus === 'created') {
                incrementResult = await incrementCompletedRecordingsInClone(cloneId);

                if (incrementResult?.status !== 'running') {
                  throw new Error(
                    `Unexpected status change while incrementing completed recordings in clone: ${incrementResult?.status}`
                  );
                }
              }

              pageResults[index] = {
                skipped: toCloneStatus === 'skipped',
                newId: toCloneStatus === 'created' ? clonedRecording?.id ?? null : null,
                incrementResult
              };
            },
            CLONE_RECORDINGS_PAGE_CONCURRENCY
          );

          for (const pr of pageResults) {
            if (pr.skipped) {
              continue;
            }
            if (pr.newId) {
              newIds.push(pr.newId);
              if (options.isRefresh) {
                totalSize++;
              }
            }
            if (pr.incrementResult?.number_of_completed_recordings) {
              totalComplete = Math.max(
                totalComplete,
                pr.incrementResult.number_of_completed_recordings
              );
            }
          }
        }
      }
    } catch (err) {
      logger.error(err);
      const errorMsg = errorMessageForCloneResponse(err);
      // update clone status to failed
      await updateClone({
        cloneId,
        status: 'failed',
        numberOfRecordings: totalSize,
        response: {
          error: errorMsg,
          records: newIds,
        }
      });
      logger.error(`Failed to process clone: ${errorMsg}`);
      throw new errors.ServiceFailure({
        message: `Failed to process clone`
      });
    }
    // finish clone
    await updateClone({
      cloneId,
      status: 'complete',
      numberOfRecordings: totalSize,
      response: {
        records: newIds,
      }
    });

    logger.debug(
      'process clone ' + cloneId + ' success: ' + newIds.join(',')
    );
  }

  async function processRecordingToClone(context, recording, mode, cloneRequest, options) {
    let clonedRecordingId = null;
    try {
      if (isClonedRecording(recording.details)) {
        throw new errors.InvalidInput({
          message: 'Original recording is already a clone'
        });
      }

      const cloneId = cloneRequest.id;
      const cloneMapping = await getCloneMapping(cloneId, recording.id);
      let clonedRecording = null;
      clonedRecordingId = cloneMapping.clonedRecordingId;

      if (clonedRecordingId) {
        clonedRecording = await getTDO(context, { id: clonedRecordingId });
        clonedRecording.details = await getTDODetails(clonedRecordingId);
      }

      if (clonedRecording?.id && ['existing_only', 'full'].includes(mode)) {
        // Only process if it has been cloned before
        const assetsCloned = await refreshRecordingAssets(context, recording, clonedRecording, cloneRequest, options);
        const jobsCloned = await refreshRecordingJobs(context, recording, clonedRecording, cloneRequest, options);
        if (assetsCloned || jobsCloned) {
          const updateTdoArgs = {
            input: {
              id: clonedRecording.id,
              details: clonedRecording.details
            }
          };
          await doUpdateTDO(context, updateTdoArgs, clonedRecording);
        }
        return {clonedRecording, toCloneStatus: 'updated'};
      } else if (!clonedRecordingId && ['new_only', 'full'].includes(mode)) {
        // Only process if it has NOT been cloned before
        const clonedRecording = await processClone(context, recording, cloneRequest, options);
        await createCloneMapping(cloneId, recording.id, clonedRecording.id);
        return { clonedRecording, toCloneStatus: 'created' };
      }
    } catch (error) {
      logger.error(`Error process recording to clone from ${recording.id}${clonedRecordingId ? ' to ' + clonedRecordingId : ''} in mode ${mode} for request ${cloneRequest.id}:`, error);
    }
    return { clonedRecording: null, toCloneStatus: 'skipped' };
  }

  async function shouldCloneAssetBasedOnFilters(context, asset, assetFilters) {
    // If no filters provided, clone all assets
    if (!assetFilters || assetFilters.length === 0) {
      return true;
    }

    // Cache engineId -> categoryId for the current clone context to avoid repeated lookups
    if (!context._cloneEngineCategoryCache) {
      context._cloneEngineCategoryCache = {};
    }
    const engineCategoryCache = context._cloneEngineCategoryCache;

    // Check if asset matches any of the filters
    for (const filter of assetFilters) {
      // Check assetType (required)
      if (filter.assetType && asset.type !== filter.assetType) {
        continue;
      }

      // Check schemaId if provided
      if (filter.schemaId && asset.sourceData?.schemaId !== filter.schemaId) {
        continue;
      }

      // Check engineId if provided
      const engineId = asset?.sourceData?.engineId ?? asset.metadata?.sourceEngineId;
      if (filter.engineId && engineId !== filter.engineId) {
        continue;
      }

      // Check engineCategoryId if provided (resolve from asset's engineId and cache in context)
      if (filter.engineCategoryId) {
        if (!engineId) {
          continue;
        }

        let categoryId = engineCategoryCache[engineId];
        if (categoryId === undefined) {
          categoryId = await serviceContext.dal.engine.getEngineCategoryId(context, engineId);
          engineCategoryCache[engineId] = categoryId;
        }

        if (categoryId !== filter.engineCategoryId) {
          continue;
        }
      }

      // If we get here, all provided filters match
      return true;
    }

    // No filters matched
    return false;
  }

  async function processClone(context, originalRecording, cloneRequest, options) {
    if (isClonedRecording(originalRecording.details)) {
      throw new errors.InvalidInput({
        message: 'Original recording is already a clone'
      });
    }

    const { request: requestParams, cloneId, destinationApplicationId } =
      cloneRequest;
    const cloneBlobs = requestParams.cloneBlobs;
    const includeAssets = !!requestParams.includeAssets;
    const includeJobs = !!requestParams.includeJobs;
    const cloneAssets = requestParams.cloneAssets || [];
    const destinationOrgId = options.destinationOrgId;

    const clonedRecording = _.omit(originalRecording, [
      'id',
      'acls',
      'assets',
      'transcriptAsset',
      'mediaAsset'
    ]);

    // get tdo details.
    clonedRecording.details = await getTDODetails(originalRecording.id);
    clonedRecording.applicationId = destinationApplicationId;

    // get tdo assets
    const max = _.get(serviceContext, 'config.maxAssetsLimit', 200);

    const getAssetsArgs = {
      includeHiddenAssets: true,
      containerId: originalRecording.id,
      limit: max
    };
    const tdoAssets = await getAssets(
      context,
      getAssetsArgs,
      originalRecording
    );

    // `sourceData` field synthesized by the Asset GraphQL resolver. Hydrate it
    // from `metadata` so cloneAsset attribution to the new asset
    for (const asset of tdoAssets.records || []) {
      if (!asset.sourceData) {
        asset.sourceData = _buildAssetSourceDataFromMetadata(asset);
      }
    }

    // remove acls
    if (clonedRecording.details?.['veritone-permissions']) {
      clonedRecording.details['veritone-permissions'] = undefined;
    }

    // add cloned metadata info
    clonedRecording.details.veritoneClone = {
      original: originalRecording.id,
      date: Math.floor(Date.now() / 1000),
      cloneBlobs: cloneBlobs,
      newAssetIdsToOldAssetIds: {},
      newJobIdsToOldJobIds: {}
    };

    const createTdoArgs = {
      input: {
        startDateTime: clonedRecording.startDateTime,
        stopDateTime: clonedRecording.stopDateTime,
        source: clonedRecording.source,
        sourceId: clonedRecording.sourceId,
        status: clonedRecording.status,
        name: clonedRecording.name,
        description: clonedRecording.description,
        isPublic: clonedRecording.isPublic,
        applicationId: clonedRecording.applicationId,
        addToIndex: _.get(clonedRecording, 'details.addToIndex', null),
        organizationId: destinationOrgId,
        details: clonedRecording.details
      }
    };

    const newTDO = await createTDO(context, createTdoArgs);

    clonedRecording.id = newTDO.id;
    clonedRecording.organizationId = destinationOrgId;

    // Create clone mapping if cloneId is provided
    if (cloneId) {
      await createCloneMapping(cloneId, originalRecording.id, clonedRecording.id);
    }

    let operations = [];
    // upload/clone all assets - call dalAsset.createAsset

    // Check if assets should be included and apply filtering
    const shouldIncludeAssets = includeAssets;
    const assetFilters = cloneAssets;

    for (const element of tdoAssets.records) {
      const asset = element;

      // Skip assets if includeAssets is false
      if (!shouldIncludeAssets) {
        continue;
      }

      // Apply asset filtering if filters are provided
      if (assetFilters.length > 0) {
        const shouldCloneAsset = await shouldCloneAssetBasedOnFilters(context, asset, assetFilters);
        if (!shouldCloneAsset) {
          continue;
        }
      }

      operations.push(
        cloneAsset(
          context,
          asset,
          clonedRecording,
          destinationApplicationId,
          cloneBlobs
        )
      );
    }
    // create recording assets
    await Promise.all(operations);
    if (includeJobs) {
      await cloneJobs(context, originalRecording, clonedRecording, cloneRequest, options);
    }
    const updateTdoArgs = {
      input: {
        id: clonedRecording.id,
        details: clonedRecording.details
      }
    };
    const updatedTDO = await doUpdateTDO(context, updateTdoArgs, clonedRecording);
    return updatedTDO;
  }

  async function updateClone(clone) {
    if (typeof clone !== 'object') {
      throw new errors.InvalidInput({
        message: 'Missing clone!'
      });
    }

    const columnData = mapper.mapCloneToDb(clone);

    const { sql, values } = mainUtil.makeUpdateSql(
      'recording.recording_clone',
      columnData,
      mapper.cloneRequestModel,
      'clone_id = $1',
    );

    const result = await dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapCloneJob
    );

    return result[0] ?? null;
  }

  async function createClone(clone) {
    if (typeof clone !== 'object') {
      throw new errors.InvalidInput({
        message: 'Missing clone!'
      });
    }

    const columnData = mapper.mapCloneToDb(clone);

    const { sql, values } = mainUtil.makeInsertSql(
      'recording.recording_clone',
      columnData,
      mapper.cloneRequestModel
    );

    const result = await dbConnections['core'].write.map(
      sql,
      values,
      mapper.mapCloneJob
    );

    return result[0];
  }

  async function incrementCompletedRecordingsInClone(cloneId) {
    if (typeof cloneId !== 'string') {
      throw new errors.InvalidInput({
        message: 'Missing cloneId!'
      });
    }

    const sql = `
			UPDATE
				recording.recording_clone
			SET
				number_of_completed_recordings = number_of_completed_recordings + 1
			WHERE
				clone_id = $1
      RETURNING
        status,
        number_of_completed_recordings;
    `;

    const result = await dbConnections['core'].write.query(sql, [cloneId]);

    return result.at(0) ?? null;
  }

  // Derive a SetAssetSourceData-shaped object from an asset's metadata blob,
  // but absent from the AssetSourceData output type — so it survives a clone.
  // Omitting taskId, sourceId, and scheduledJobId because they are not needed
  // for the clone pipeline.
  function _buildAssetSourceDataFromMetadata(asset) {
    const metadata = (asset && asset.metadata) || {};
    return {
      name: metadata.sourceName,
      // engine ID may be stored under `sourceEngineId` or the legacy `source`
      engineId: metadata.sourceEngineId || metadata.source,
      schemaId: metadata.schemaId,
    };
  }

  async function cloneAsset(
    context,
    asset,
    recording,
    applicationId,
    cloneBlob
  ) {
    // asset _uri is required for clone asset
    if (_.isNil(asset._uri)) {
      asset._uri = asset.uri;
    }
    let newAssetUri = asset.uri || asset._uri;
    if (cloneBlob) {
      newAssetUri = await cloneAssetBlob(asset, applicationId, recording.id);
    }
    const assetInput = {
      uri: newAssetUri,
      type: asset.type ?? asset.assetType,
      contentType: asset.contentType,
      applicationId,
      containerId: recording.id,
      sourceData: asset.sourceData,
      setAsPrimary: false,
      organizationId: recording.organizationId,
      updateContainerStopDateTime: asset.updateStopDateTimeFromAsset
    };

    // when cloning a primary asset, the cloned asset must also be primary.
    const primaryAssetIds = _getPrimaryAssetIdsFromJsondata(recording);
    if (primaryAssetIds?.includes(asset.id) && ['media', 'transcript', 'media-mdp'].includes(asset.type)) {
      assetInput.setAsPrimary = true;
    }

    // we need to create the asset
    const newAsset = await serviceContext.dal.asset.createAssetAuthorized(
      assetInput,
      context,
      recording
    );

    recording.details.veritoneClone.newAssetIdsToOldAssetIds[newAsset.id] =
      asset.id;
    return newAsset;
  }

  async function getCompleteTasksForJob(context, originalJob, jobArgs) {
    const taskArgs = [];
    let offset = 0;
    let records;
    do {
      const page = await serviceContext.dal.task.getTasks(context, {
        ...jobArgs,
        jobId: originalJob.id,
        limit: TASK_CLONE_PAGE_SIZE,
        offset
      });
      records = page.records || [];
      for (const task of records) {
        if (task.status === 'complete') {
          taskArgs.push({
            engineId: task.engineId,
            payload: task.payload,
            buildId: task.buildId,
            isClone: true
          });
        }
      }
      offset += records.length;
    } while (records.length === TASK_CLONE_PAGE_SIZE);
    return taskArgs;
  }

  async function syncRecordingJobs(
    context,
    originalRecording,
    clonedRecording,
    cloneRequest,
    options
  ) {
    const sourceApplicationId = cloneRequest.sourceApplicationId;
    const destinationApplicationId = cloneRequest.destinationApplicationId;
    const destinationOrgId = options.destinationOrgId;

    if (!clonedRecording.details) clonedRecording.details = {};
    const cloneData = clonedRecording?.details?.veritoneClone ?? {};
    if (!cloneData.newJobIdsToOldJobIds) cloneData.newJobIdsToOldJobIds = {};

    const clonedJobLookup = {};
    Object.entries(cloneData.newJobIdsToOldJobIds).forEach(([newId, oldId]) => {
      clonedJobLookup[oldId] = newId;
    });

    let jobsProcessed = 0;
    let offset = 0;
    let records = [];
    const createdJobs = [];

    const jobArgs = {
      applicationId: sourceApplicationId,
      hasTargetTDO: true,
      targetId: originalRecording.id,
    };

    do {
      const jobsPage = await serviceContext.dal.job.getJobs(context, {
        ...jobArgs,
        limit: JOB_CLONE_PAGE_SIZE,
        offset
      });

      records = jobsPage.records || [];
      for (const originalJob of records) {
        if (clonedJobLookup[originalJob.id] || originalJob.status !== 'complete') {
          continue;
        }

        jobsProcessed += 1;
        const taskArgs = await getCompleteTasksForJob(
          context,
          originalJob,
          jobArgs
        );

        if (taskArgs.length === 0) {
          continue;
        }

        const createJobArgs = {
          input: {
            cloneId: cloneRequest.id,
            applicationId: destinationApplicationId,
            applicationIds: [destinationApplicationId],
            organizationId: destinationOrgId,
            organizationIds: [destinationOrgId],
            targetId: clonedRecording.id,
            tasks: taskArgs
          }
        };

        try {
          const result = await serviceContext.dal.job.createJob(
            context,
            createJobArgs
          );

          cloneData.newJobIdsToOldJobIds[result.jobId] = originalJob.id;
          clonedJobLookup[originalJob.id] = result.id;
          createdJobs.push(result);
        } catch (err) {
          logger.error(`Error creating job for original job ${originalJob.id} to cloned recording ${clonedRecording.id} for clone request ${cloneRequest.id}:`, err);
        }
      }
      offset += records.length;
    } while (records.length === JOB_CLONE_PAGE_SIZE);

    const mentionGenToken = await tokenHelper.createJwtToken(
      context,
      null,
      {
        applicationId: destinationApplicationId,
        organizationId: destinationOrgId,
        recordingId: clonedRecording.id
      },
      destinationOrgId
    );

    serviceContext.dal.asset.emitRecordingCognitionCompletedEvent(
      undefined,
      clonedRecording.id,
      mentionGenToken,
      destinationOrgId,
      true
    );

    clonedRecording.details.veritoneClone = cloneData;

    return {
      jobsToClone: jobsProcessed,
      jobsCloned: createdJobs.length
    };
  }

  async function cloneJobs(
    context,
    originalRecording,
    clonedRecording,
    cloneRequest,
    options
  ) {
    return syncRecordingJobs(context, originalRecording, clonedRecording,
      cloneRequest, options);
  }

  // Clone mapping helper functions
  async function getCloneRequest(cloneId, args) {
    const { records, count } = await getCloneRequests(cloneId, null, args);
    return count > 0 ? records.at(0) : null;
  }

  async function getCloneMapping(cloneId, originalRecordingId) {
    const cloneMappingDefault = {
      cloneId,
      originalRecordingId,
      clonedRecordingId: null,
      createdAt: null,
      updatedAt: null
    };

    const sql = `
      SELECT
        original_recording_id,
        cloned_recording_id,
        created_at,
        updated_at
      FROM recording.recording_clone__tdo
      WHERE clone_id = $1 AND original_recording_id = $2
      ORDER BY created_at DESC
    `;

    const dbconn = serviceContext.dbConnections['core'].read;
    const result = await dbconn.map(sql, [cloneId, originalRecordingId], (row) =>
      mapper.camelizeRootKeys(row)
    );
    return result.length > 0 ? result[0] : cloneMappingDefault;
  }

  async function createCloneMapping(cloneId, originalRecordingId, clonedRecordingId) {
    const sql = `
      INSERT INTO recording.recording_clone__tdo
        (clone_id, original_recording_id, cloned_recording_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (clone_id, original_recording_id)
      DO UPDATE SET
        cloned_recording_id = EXCLUDED.cloned_recording_id
      RETURNING original_recording_id, cloned_recording_id, updated_at
    `;

    const dbconn = serviceContext.dbConnections['core'].write;
    const result = await dbconn.map(sql, [cloneId, originalRecordingId, clonedRecordingId], (row) => ({
      originalRecordingId: row.original_recording_id,
      clonedRecordingId: row.cloned_recording_id,
      updatedAt: row.updated_at
    }));

    return result[0];
  }

  async function refreshClone(context, args) {
    const input = args.input;
    const mode = input.mode?.toLowerCase() ?? 'full';

    // Get existing clone request
    const cloneRequest = await getCloneRequest(input.cloneId, args);
    if (!cloneRequest) {
      throw new errors.NotFound({
        message: 'Clone request not found'
      });
    }

    if (!input.applicationIds?.includes(cloneRequest.sourceApplicationId)) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: cloneRequest.sourceApplicationId
        }
      });
    }

    // Validate that the clone request is complete
    if (['failed', 'complete'].includes(cloneRequest.status) === false) {
      throw new errors.InvalidInput({
        message: 'Clone request must be in "complete" or "failed" status to be refreshed'
      });
    }

    // Update status to running
    const updated = await updateClone({
      cloneId: input.cloneId,
      status: 'running',
      numberOfRecordings: 0,
      response: {
        message: 'Refresh clone started'
      }
    });

    if (updated) {
      cloneRequest.status = updated.status;
      cloneRequest.response = updated.response;
    }

    // Run the refresh process asynchronously using the combined function
    const runPromise = runProcessClone(context, mode, cloneRequest, {isRefresh: true});
    runPromise.catch(async (err) => {
      logger.error(err);
      // Update clone status to failed
      const result = await updateClone({
        ...cloneRequest,
        status: 'failed',
        response: {
          error: errorMessageForCloneResponse(err)
        }
      });
      cloneRequest.status = result?.status;
      cloneRequest.response = result?.response;
    });

    return cloneRequest;
  }

  /**
   * Cancel an in-progress clone request.
   *
   * Performs an atomic conditional UPDATE that only flips status from
   * 'running' to 'failed' and marks the response as cancelled. The
   * background `runProcessClone` worker can observe the updated status and
   * response and stop further processing for the clone request.
   */
  async function cancelClone(context, args) {
    const cloneId = args.cloneId;
    if (typeof cloneId !== 'string' || cloneId.length === 0) {
      throw new errors.InvalidInput({
        message: 'cloneId is required',
        data: {
          objectType: 'CloneRequest',
          field: 'cloneId'
        }
      });
    }

    const cloneRequest = await getCloneRequest(cloneId, args);
    if (!cloneRequest) {
      throw new errors.NotFound({
        message: 'Clone request not found',
        data: {
          objectType: 'CloneRequest',
          objectId: cloneId
        }
      });
    }

    if (!args.applicationIds?.includes(cloneRequest.sourceApplicationId)) {
      throw new errors.NotAllowed({
        message: 'Access denied',
        data: {
          objectType: 'Organization',
          objectId: cloneRequest.sourceApplicationId
        }
      });
    }

    if (cloneRequest.status !== 'running') {
      throw new errors.InvalidInput({
        message: `Clone request must be in "running" status to be cancelled (current status: "${cloneRequest.status}")`,
        data: {
          objectType: 'CloneRequest',
          objectId: cloneId,
          field: 'status',
          value: cloneRequest.status
        }
      });
    }

    const result = await updateClone({
      ...cloneRequest,
      status: 'failed',
      response: {
        ...cloneRequest.response,
        error: {
          cancelled: true,
          message: 'Clone request cancelled by user',
        }
      }
    });

    if (!result) {
      throw new errors.InvalidInput({
        message: 'Unable to update clone request',
        data: {
          objectType: 'CloneRequest',
          objectId: cloneId,
          field: 'status',
        }
      });
    }

    return result;
  }

  async function refreshRecordingAssets(context, originalRecording, clonedRecording, cloneRequest, options) {
    const { request: requestParams, destinationApplicationId } = cloneRequest;
    const includeAssets = requestParams.includeAssets !== false;
    const cloneAssets = requestParams.cloneAssets ?? [];
    const cloneBlobs = requestParams.cloneBlobs;

    if (!includeAssets) {
      return;
    }

    // Get original assets
    const originalAssets = await getAssets(context, {
      includeHiddenAssets: true,
      containerId: originalRecording.id,
      limit: _.get(serviceContext, 'config.maxAssetsLimit', 200),
    }, originalRecording);

    // getAssets returns DAL-level asset records that do not include the
    // `sourceData` field synthesized by the Asset GraphQL resolver. Hydrate it
    // from `metadata` so cloneAsset can round-trip source engine/task/schedule
    // attribution when backfilling assets onto an already-cloned recording.
    for (const asset of originalAssets.records || []) {
      if (!asset.sourceData) {
        asset.sourceData = _buildAssetSourceDataFromMetadata(asset);
      }
    }

    const cloneData =
      clonedRecording.details?.veritoneClone ?? {newAssetIdsToOldAssetIds: {}};

    // Create lookup for cloned assets by original asset ID
    const clonedAssetLookup = {};
      Object.entries(cloneData.newAssetIdsToOldAssetIds).forEach(([newAssetId, oldAssetId]) => {
        clonedAssetLookup[oldAssetId] = newAssetId;
      });

    let saveClonedRecording = false;
    // Process each original asset
    for (const originalAsset of originalAssets.records || []) {
      const clonedAssetId = clonedAssetLookup[originalAsset.id];

      if (!clonedAssetId && await shouldCloneAssetBasedOnFilters(context, originalAsset, cloneAssets)) {
        await cloneAsset(context, originalAsset, clonedRecording, destinationApplicationId, cloneBlobs);
        saveClonedRecording = true;
      }
    }

    return saveClonedRecording;
  }

  async function refreshRecordingJobs(context, originalRecording, clonedRecording, cloneRequest, options) {
    const status = await syncRecordingJobs(context, originalRecording,
      clonedRecording, cloneRequest, options);
    return status.jobsCloned > 0;
  }

  async function emitSetTagAssetsEventForSegments(segments, tdoId) {
    try {
      const tags = [{ key: 'AIWARE_MEDIA_ID', value: tdoId }];
      const newSegments = _.filter(segments, (segment) =>
        serviceContext.storage.isAmazonS3Uri(segment.url)
      );

      await Promise.all(
        newSegments.map(async (segment) => {
          const segmentTags = [...tags];
          const segmentTagIndex = _.get(
            segment,
            'details.segmentIndex',
            _.get(segment, 'details.segmentStopTimeMs')
          );
          const segmentGroupId = _.get(segment, 'details.segmentGroupId');
          const segmentUrl = _.get(segment, 'url');

          if (!_.isNil(segmentTagIndex)) {
            segmentTags.push({
              key: 'AIWARE_MEDIA_SEGMENT',
              value: _.toString(segmentTagIndex)
            });
          }
          if (!_.isEmpty(segmentGroupId)) {
            segmentTags.push({
              key: 'AIWARE_MEDIA_SEGMENT_GROUP_ID',
              value: _.toString(segmentGroupId)
            });
          }

          return emitSetAssetTagsEvent(segmentUrl, segmentTags);
        })
      );
    } catch (err) {
      this.logger.error('Failed on emit set_asset_tags.', err);
    }
  }

  function emitSetAssetTagsEvent(s3uri, tags) {
    if (_.isNil(s3uri) && _.isEmpty(tags)) {
      return;
    }

    const setAssetTagsEvent = {
      type: 'asset',
      event: 'set_asset_tags',
      s3uri,
      tags
    };

    return messageUtil.emitEvent(setAssetTagsEvent, 'events');
  }

  async function deleteMetadataByTDO(tdoId) {
    if (_.isNil(tdoId)) {
      throw new errors.InvalidInput({
        messages: 'tdoId is required'
      });
    }

    const sql = `DELETE FROM recording.recording_metadata WHERE recording_id = $1`;
    await serviceContext.dbConnections['core'].write.query(sql, [tdoId]);
  }

  async function deleteAssetsByTDO(tdoId, assetIds) {
    if (_.isNil(tdoId) || _.isEmpty(assetIds)) {
      throw new errors.InvalidInput({
        messages: 'tdoId or assetId is required'
      });
    }

    let sqlParams = [assetIds];
    let sqlWhere = [];

    sqlWhere.push(`asset_id = ANY($${sqlParams.length}::text[])`);
    sqlParams.push(tdoId);
    sqlWhere.push(
      `(recording_id = $${sqlParams.length} AND recording_id::bigint = $${sqlParams.length}::bigint)`
    );
    const tableName = util.generateRecordingAssetPartition(tdoId);
    const sql = `
      DELETE FROM ${tableName}
      WHERE ${sqlWhere.join(' AND ')}
    `;
    await serviceContext.dbConnections['core'].write.query(sql, sqlParams);
  }

  function _getPrimaryAssetIdsFromJsondata(tdo) {
    const jsondata = tdo.jsondata || {};
    const primaryAssetObj = _.pick(jsondata, [
      'transcriptAsset',
      'mediaAsset',
      'mediaMdpAsset',
      'primaryAsset'
    ]);
    const idSet = _.reduce(
      primaryAssetObj,
      (preVal, assetObj) => {
        const assetId = _.get(assetObj, 'assetId');
        if (assetId && !preVal.has(assetId)) {
          preVal.add(assetId);
        }
        return preVal;
      },
      new Set()
    );

    return Array.from(idSet);
  }

  return {
    getTDO,
    getTDOs,
    getTDODetails,
    getTDOSourceData,
    updateTDO,
    createTDO,
    createTDOWithAsset,
    addMediaSegment,
    addMediaSegmentsBulk,
    getStreamManifest,
    deleteTDO,
    cleanupTDO,
    tdoCacheKey,
    clearCachedTDO,
    getAssets,
    getTDOAssetCount,
    incrTDOAssetCount,
    decrTDOAssetCount,
    getStreamData,
    getFakeMediaAsset,
    getPrimaryAsset,
    getFieldFilter,
    isClonedRecording,
    isClonedAsset,
    getEngineRuns,
    getTDOSourceTaskData,
    requestClone,
    updateFolderInSearchIndex,
    // just for unit-test
    createClone,
    updateClone,
    incrementCompletedRecordingsInClone,
    cloneAsset,
    cloneJobs,
    processClone,
    runProcessClone,
    addSourceDataToNewTdo,
    getCloneRequests,
    newTdoSetup,
    syncMediaMdpAsset,
    updateTDOCache,
    getLongestMdpAssetWithCache,
    deleteMetadataByTDO,
    deleteAssetsByTDO,
    updateTDOAuthorized: doUpdateTDO,
    handleDeleteAssets,
    _getAssetsToDeleteByTdoId,
    // Clone mapping functions
    getCloneRequest,
    getCloneMapping,
    createCloneMapping,
    refreshClone,
    cancelClone,
    processRefreshRecording: processRecordingToClone,
    shouldCloneAssetBasedOnFilters
  };
};
