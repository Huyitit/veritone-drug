/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');
const _ = require('lodash');
const mapper = require('./mapper.js');
const rp = require('request-promise');
const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
const intoStream = require('into-stream');
const moment = require('moment');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');
const async = require('async-p');
const { promisify } = require('util');
const { eventsMap } = require('@veritone/core-server-base/events-map');
const mime = require('mime-types');
const { URL } = require('url');
const { stripSignature } = require('@veritone/core-server-base/storageUtil.js');

module.exports = function createFunction(
  serviceContext // contains all DAL modules
) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const app = serviceContext.app;
  const storage = serviceContext.storage;
  const pg = serviceContext.pg;
  const dbConnections = serviceContext.dbConnections;
  const errors = require('../error')(config),
    mainUtil = require('../util.js')(serviceContext),
    dbRead = dbConnections['core'].read,
    dbWrite = dbConnections['core'].write,
    util = require('./util.js')(config, serviceContext),
    resolverUtil = require('../resolvers/util')(serviceContext),
    messageUtil = serviceContext.messageUtil,
    metrics = require('../metrics.js')(serviceContext),
    httpUtil = require('../util/httpUtil.js')(serviceContext);
  const {
    eventsMap,
    supportedEvents
  } = require('@veritone/core-server-base/events-map.js');

  // Unlike resolverUtil.stripOwnedStorageUrlSignature (which drops the whole
  // query string), this only removes recognized signature params, so a
  // client-supplied query param on an asset uri (e.g. ?v=1) survives.
  function stripAssetUriSignature(uri) {
    return _.isString(uri) && resolverUtil.isOurBucket(uri)
      ? stripSignature(uri)
      : uri;
  }

  const localCache = serviceContext.localCache;
  const putAssetMedia = promisify(storage.putAsset);
  const storageDeleteAsset = promisify(storage.deleteAsset);
  const disablePrimaryAssetTypeEnforcement = _.get(
    serviceContext,
    'config.featureFlags.disablePrimaryAssetTypeEnforcement',
    false
  );
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );
  const esClient = require('./../util/elastic.js')(serviceContext).client;

  const assetTypeContentType = {
    text: [/^text\//],
    audio: [/^audio\//],
    vidio: [/^video\//],
    'content-template': [/^application\//],
    'dmh-ancillary': [
      /^application\//,
      /^text\//,
      /^audio\//,
      /^video\//,
      /^image\//
    ],
    'dmh-rendition': [
      /^application\//,
      /^text\//,
      /^audio\//,
      /^video\//,
      /^image\//
    ],
    'illuminate-export': [/^application\//],
    'illuminate-payload': [/^application\//],
    media: [/[\s\S]*/],
    'media-mdp': [/^application\//],
    'playout-logs': [/^application\//],
    thumbnail: [/^image\//],
    transcript: [/^application\//, /^text\//],
    'v-speechmatics-response': [/^application\//],
    'vtn-standard': [/^application\//],
    'x-SUMMARIZATION-text': [/^text\//],
    'x-TRANSCRIPTION-text': [/^text\//],
    'x-TRANSLATE-text': [/^text\//],
    'x-transcription-text': [/^text\//],
    'x-translate-text': [/^text\//]
  };
  const MDP_ASSET_DELETED_REDIS_KEY =
    'TemporalDataObject:ManifestMDPListDelete:';

  async function checkTDOAssetCount(context, tdo) {
    const tdoId = tdo.id;
    // first get org limit if there is one
    const defaultLimit = _.get(
      serviceContext,
      'config.rateLimit.maxAssetsPerTDO',
      100
    );

    // note that we're concerned with the org that owns the TDO, not the org
    // making the API call!
    const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
      tdo.applicationId
    );
    const org = await serviceContext.dal.organization.getOrganization(context, {
      id: orgId
    });

    const limit = _.get(
      org,
      'kvp.features.tdoLimits.maxAssetCount',
      defaultLimit
    );
    const warnOnly =
      _.get(
        serviceContext,
        'config.featureFlags.maxTDOAssetLimitWarnOnly',
        true
      ) === true;
    const currentValue = await serviceContext.dal.tdo.getTDOAssetCount(tdoId);

    if (currentValue >= limit) {
      if (warnOnly) {
        serviceContext.messageUtil.emitEvent({
          event: 'warning',
          requestId: context.requestInfo.requestId,
          correlationId: context.requestInfo.correlationId,
          errorName: 'max_tdo_assets_exceeded',
          organizationId: orgId,
          organizationName: org.name,
          currentAssetCount: currentValue,
          limit,
          containerId: tdoId,
          tokenType: resolverUtil.getTokenType(context)
        });
      } else {
        throw new errors.ObjectLimitExceeded({
          message:
            'The asset could not be created because the container TDO ' +
            'specified already contains the maximum allowed for the owner organization.' +
            'The organization ID is ' +
            orgId +
            ' and the maximum is ' +
            limit +
            '. To continue,' +
            'delete unneeded assets or contact Veritone support to increase the ' +
            'organization limit.',
          data: {
            containerId: tdo.id,
            limit,
            currentAssetCount: currentValue,
            errorName: 'max_tdo_assets_exceeded',
            tokenType: resolverUtil.getTokenType(context),
            organizationId: orgId,
            organizationName: org.name
          }
        });
      }
    }

    // we don't actually increment the count in redis
    // until the asset has been successfully created
  }

  async function updateAsset(context, args) {
    const input = args.input;
    let asset;
    let tdoId;

    try {
      if (mainUtil.isFakeMediaAssetId(input.id)) {
        throw new errors.InvalidInput({
          message:
            'The requested asset is a virtual asset and cannot be updated',
          data: {
            objectId: input.id,
            objectType: 'Asset'
          }
        });
      }
      asset = await dbGetAsset(context, input);
      const metadata = asset.metadata;
      await addLocalDataToDBMetadata(input, metadata);
      const sqlArgs = [input.id];

      // add TDO clause for sharding if possible
      let recordingClause = '';
      tdoId = dateIdUtil.getRecordingIdFromAssetId(input.id);
      // if we have a TDO from the asset ID,
      // insert into WHERE clause so that pg queries the right partition.
      if (tdoId) {
        sqlArgs.push(tdoId);
        recordingClause = `AND (recording_id = $${sqlArgs.length} AND recording_id::bigint = $${sqlArgs.length})`;
      }

      const set = [];
      if (metadata) {
        sqlArgs.push(metadata);
        set.push(`metadata = $${sqlArgs.length}`);
      } else {
        // there's nothing to update. no-op and return out.
        return asset;
      }
      const sql = `
UPDATE
  ${util.generateRecordingAssetPartition(tdoId)}
SET
  ${set.join(', ')}
WHERE
  asset_id = $1 ${recordingClause}
RETURNING
  asset_id AS id,
  recording_id AS container_id,
  metadata,
  type,
  content_type,
  uri,
  created_date_time,
  user_edited;
`;
      // pass only those fields that can be updated
      // we do not allow assetType, contentType, or uri
      // to be modified at this point.
      const data = await serviceContext.dbConnections['core'].write.map(
        sql,
        sqlArgs,
        mapper.mapAsset
      );
      if (!data || !data.length) {
        // updateAsset returns an array
        throw new errors.NotFound({
          message:
            'The updated asset could not be retrieved. It may have been ' +
            'deleted as part of a race condition.',
          data: {
            objectId: input.id,
            objectType: 'Asset'
          }
        });
      }

      // Public event for external subscribers (e.g. DMH). This is intentionally
      // separate from the audit event emitted below. Keeping this event preserves
      // the existing public event contract introduced by VE-4360.
      // That contract requires the event on every updateAsset call, even when no
      // fields actually changed.
      const event = {
        serviceName: 'core-graphql-server',
        event: eventsMap.AssetUpdated.event,
        type: eventsMap.AssetUpdated.type,
        assetId: input.id,
        recordingId: tdoId,
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(input.id)
      };
      messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
      messageUtil.emitPublicEvent(
        supportedEvents.AssetUpdated,
        'system',
        context,
        event
      );

      // Emit the audit event separately so it can evolve independently without
      // altering the public event contract above.
      emitAssetUpdateAuditEvent(context, { asset, tdoId }, null);

      return data[0];
    } catch (err) {
      emitAssetUpdateAuditEvent(
        context,
        { assetId: input.id, asset, tdoId },
        err
      );
      throw err;
    }
  }

  async function deleteAsset(context, args) {
    const assetId = args.id;
    let asset;
    let tdoId;

    try {
      if (mainUtil.isFakeMediaAssetId(args.id)) {
        throw new errors.InvalidInput({
          message:
            'The requested asset is a virtual asset and cannot be deleted.',
          data: {
            objectId: args.id,
            objectType: 'Asset'
          }
        });
      }

      asset = await dbGetAsset(context, args);
      // get the TDO.
      // dbGetAsset just retrieved it so it'll be in cache.
      const tdo = await serviceContext.dal.tdo.getTDO(context, {
        id: asset.containerId,
        _writeAccessRequest: true
      });

      // form WHERE clause for update/delete queries
      const sqlArgs = [assetId];
      const where = [];
      where.push(`asset_id = $${sqlArgs.length}`);

      // if we have a TDO from the asset ID,
      // insert into WHERE clause so that pg queries the right partition.
      tdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);
      if (tdoId) {
        sqlArgs.push(tdoId);
        where.push(
          `(recording_id = $${sqlArgs.length} AND recording_id::bigint = $${sqlArgs.length})`
        );
      }
      const sqlParts = [];
      // delete from recording_asset
      sqlParts.push(`
DELETE FROM ${util.generateRecordingAssetPartition(tdoId)}
WHERE ${where.join(' AND ')}
`);
      let updatedTDO = false;

      // if necessary, clear primary asset.
      if (_.get(tdo, 'jsondata.mediaAsset.assetId') === assetId) {
        sqlArgs.push(asset.containerId);
        sqlParts.push(`
UPDATE recording.recording
SET "json" = jsonb_set(json, '{mediaAsset}', '{}'::JSONB)
WHERE recording_id = $${sqlArgs.length}
`);
        updatedTDO = true;
      }
      if (_.get(tdo, 'jsondata.transcriptAsset.assetId') === assetId) {
        sqlArgs.push(asset.containerId);
        sqlParts.push(`
UPDATE recording.recording
SET "json" = jsonb_set(json, '{transcriptAsset}', '{}'::JSONB)
WHERE recording_id = $${sqlArgs.length}
`);
        updatedTDO = true;
      }

      // update database
      const dbRes = await serviceContext.dbConnections['core'].write.query(
        sqlParts.join(';\n'),
        sqlArgs
      );

      const tdoDetails = await serviceContext.dal.tdo.getTDODetails(
        asset.containerId
      );

      const delRes = await deleteAssetStorage(tdoDetails, asset, context);

      // clear cached TDO data from local and redis if necessary
      if (updatedTDO) {
        const clientInfo = resolverUtil.getClientInfo(context);
        const userName =
          clientInfo.userName ||
          clientInfo.appName ||
          clientInfo.organizationName;
        const event = {
          serviceName: 'core-graphql-server',
          event: eventsMap.RecordingUpdated.event,
          type: eventsMap.RecordingUpdated.type,
          recordingId: tdoId,
          // actionInfo
          actionInfo: messageUtil.buildActionInfo(
            tdoId,
            null,
            null,
            `Updated TDO ${tdoId}`
          )
        };
        messageUtil.emitPublicEvent(
          supportedEvents.RecordingUpdated,
          'system',
          context,
          event
        );
        messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
        await serviceContext.dal.tdo.clearCachedTDO(tdo, args);
      }
      // decrement the TDO asset count
      await serviceContext.dal.tdo.decrTDOAssetCount(tdo.id);

      let tdoOwnerOrgId =
        await serviceContext.dal.organization.getOrgIdFromAppId(
          tdo.applicationId
        );
      if (tdoOwnerOrgId) {
        tdoOwnerOrgId = parseInt(tdoOwnerOrgId);
      }

      const orgId = tdoOwnerOrgId || args.organizationId;
      const token = context.requestContext.authToken;
      const addToIndex = _.get(
        tdo,
        'jsondata.addToIndex',
        await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
          context,
          orgId
        )
      );
      // emit the insert-to-index event to re-index the tdo (which not include the assetId)
      emitRecordingCognitionCompletedEvent(
        null,
        tdo.id,
        token,
        orgId,
        addToIndex
      );
      // update storage_last_updated_timestamp column
      await serviceContext.dal.organization.setLastAssetUpdatedDate(
        context,
        orgId,
        moment.utc()
      );

      // Public event for external subscribers (e.g. DMH). This is intentionally
      // separate from the audit event emitted below. Keeping this event preserves
      // the existing public event contract introduced by VE-4360.
      const event = {
        serviceName: 'core-graphql-server',
        event: eventsMap.AssetDeleted.event,
        type: eventsMap.AssetDeleted.type,
        assetId: assetId,
        recordingId: tdoId,
        organizationId: orgId ? parseInt(orgId) : null,
        addToIndex,
        // actionInfo
        actionInfo: messageUtil.buildActionInfo(assetId)
      };
      messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
      messageUtil.emitPublicEvent(
        supportedEvents.AssetDeleted,
        'system',
        context,
        event
      );

      // Emit the audit event separately so it can evolve independently without
      // altering the public event contract above.
      emitAssetDeleteAuditEvent(context, { asset, tdoId }, null);

      return {
        message: delRes.message,
        id: assetId,
        url: asset.uri
      };
    } catch (err) {
      emitAssetDeleteAuditEvent(context, { assetId, asset, tdoId }, err);
      throw err;
    }
  }

  async function _deleteAssetForUri(asset, uri) {
    const result = { error: null }
    try {
      await storageDeleteAsset(
          {
            _uri: uri,
            recordingId: asset.containerId,
            containerId: asset.containerId
          }
      );
    } catch (error) {
      // 'NotFound' errors are considered a success, so only return the error if it's some other error
      if (error.statusCode !== 404 && error.code !== 'NotFound') {
        result.error = error;
      }
    }

    return result;
  }

  async function deleteAssetStorage(details, asset, context) {
    let message = 'No storage objects deleted for asset ID: ' + asset.id;
    let result = { message };
    const isClone = serviceContext.dal.tdo.isClonedAsset(details, asset.id);
    const isReference = asset.metadata && asset.metadata.storeAsReference;
    // we try to delete from storage if and only if the asset is not
    // marked as storeAsReference and the URI
    // is to S3. otherwise we don't control it.
    // storage.shim.js:deleteAsset takes care of this and throws
    // a specific error if the URL is not a known type.

    if (asset.uri && !isReference && isOurBucket(asset.uri) && !isClone) {
      // Get primary and fallback URIs to delete, if they exist
      const presigner = require('../util/presigner.s3.buckets').getInstance();
      const { primaryUri, fallbackUri } = (presigner && presigner.getDeletableUris)
        ? await presigner.getDeletableUris(asset.uri)
        : { primaryUri: asset.uri, fallbackUri: null };

      let primaryUriError;
      if (primaryUri) {
        const res = await _deleteAssetForUri(asset, primaryUri);
        primaryUriError = res.error;
      }

      let fallbackUriError;
      if (fallbackUri) {
        const res = await _deleteAssetForUri(asset, fallbackUri);
        fallbackUriError = res.error;
      }

      if (!primaryUriError) {
        result.message = `Object(s) successfully deleted from storage.`;
      }
      if (primaryUriError || fallbackUriError) {
        const failedBuckets = [];
        const errorsToCombine = [];
        if (primaryUriError) {
          failedBuckets.push('primary');
          errorsToCombine.push(`primary_bucket: ${primaryUriError.message}`);
        }
        if (fallbackUriError) {
          failedBuckets.push('fallback');
          errorsToCombine.push(`fallback_bucket: ${fallbackUriError.message ? fallbackUriError.message : 'missing message in error object'}`);
        }

        const failedBucketsStr = failedBuckets.join(' and ');
        const combinedErrorMessage = errorsToCombine.join(', ');
        const firstError = primaryUriError || fallbackUriError;
        const failedUri = firstError || asset.uri;
        const str = _.toString(firstError) + ':' + (combinedErrorMessage || '');
        const errData = {
          errorName: 'asset_storage_delete_failed',
          assetId: asset.id,
          containerId: asset.containerId,
          url: failedUri,
          message: combinedErrorMessage,
          internalData: {
            message: combinedErrorMessage,
            cause: firstError.stack,
            primaryUriError,
            fallbackUriError
          }
        };
        serviceContext.messageUtil.emitEvent(errData);

        // only send the failure message if failed to delete from the primary bucket
        // we want to fail silently if we failed to delete only from the fallback bucket
        if (primaryUriError) {
          if (
              str.includes('Not supported: not stored at a') ||
              str.includes('AccessDenied') ||
              str.includes('key is too long')
          ) {
            result.message = errData.message =
                `Failed to delete object(s) from storage for ${failedBucketsStr} bucket. Error(s): ${combinedErrorMessage}`;
          } else {
            // only throw this internal server error if we failed to delete from the primary bucket
            throw new errors.InternalServerError({
              message: `asset_storage_delete_failed: ${combinedErrorMessage}`,
              data: {
                internalData: {
                  assetId: asset.id,
                  containerId: asset.containerId,
                  url: failedUri,
                  cause: firstError.stack,
                  primaryUriError,
                  fallbackUriError
                }
              }
            });
          }
        }
      }
    }

    return result;
  }

  async function deleteMediaSegmentsByAsset(context, asset) {
    if (_.isNil(asset)) {
      return;
    }

    const segments = await getSegmentsForMDPAsset(context, asset);

    // 1> Save Segments to mdp-list-to-delete in redis by assetId
    await saveSegmentsToMDPDeleteList(asset.id, segments);

    // 2> Emit event mdp_asset_deleted
    // to asynchronously delete segment storage blobs in core-eventing-service
    emitMDPAssetDeletedEvent(asset.id);
  }

  async function getSegmentsForMDPAsset(context, asset) {
    if (
      _.isNil(asset) ||
      (asset.type != 'media-mdp' && asset.assetType != 'media-mdp')
    ) {
      return null;
    }

    const url = asset.uri;
    const signed = await resolverUtil.getSignedUrl(url);
    const dataS = await resolverUtil.download(signed, context);
    let listSegments;
    try {
      const data = JSON.parse(dataS);
      listSegments = data.segments || [];
    } catch (error) {
      const errData = {
        errorName: 'asset_mdp_parse_failed',
        assetId: asset.id,
        containerId: asset.containerId,
        message:
          'The asset object could not be parsed after download. ' +
          error.message,
        internalData: {
          message: error.message,
          cause: error.stack
        }
      };
      logger.error(errData);
      serviceContext.messageUtil.emitEvent(errData);
    }

    return listSegments;
  }

  async function saveSegmentsToMDPDeleteList(assetId, segments) {
    if (!_.isArray(segments) || _.isEmpty(segments)) {
      return;
    }

    const ttlSec = _.get(
      serviceContext,
      'config.deleteMediaSegment.ttlSeconds',
      6 * 60 * 60 // 10 mins
    );
    const redisKey = MDP_ASSET_DELETED_REDIS_KEY + assetId;
    const multi = serviceContext.redisClient.multi();
    // push the segments
    segments.forEach((seg) => {
      if (!_.isEmpty(seg.url) && isOurBucket(seg.url)) {
        multi.lpush(redisKey, JSON.stringify(seg));
      }
    });
    // set TTL
    multi.expire(redisKey, ttlSec);

    return promisify(multi.exec).bind(multi)();
  }

  function emitMDPAssetDeletedEvent(assetId) {
    if (_.isNil(assetId)) {
      throw new errors.InvalidInput({ message: 'assetId is required.' });
    }
    const event = {
      serviceName: 'core-graphql-server',
      event: 'mdp_asset_deleted',
      type: 'asset',
      assetId
    };

    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));
  }

  /**
   * Emits an asset audit event.
   * Used by asset update and delete operations.
   */
  function emitAssetAuditEvent(eventKey, context, target, error, buildDetails) {
    const asset = _.get(target, 'asset');
    const assetId =
      _.get(asset, 'id') || _.get(asset, 'assetId') || _.get(target, 'assetId');
    const fileName = _.get(asset, 'metadata.fileName') || assetId;

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap[eventKey].event,
      type: eventsMap[eventKey].type,
      assetId,
      recordingId: _.get(target, 'tdoId'),
      success: !error,
      actionInfo: messageUtil.buildActionInfo(
        assetId,
        error,
        eventsMap[eventKey].action,
        !error ? 'success' : 'failure',
        buildDetails(fileName),
        eventsMap[eventKey].targetType
      )
    };

    try {
      messageUtil.emitPublicEvent(
        supportedEvents[eventKey],
        'system',
        context,
        event
      );
    } catch (err) {
      logger.error(`failed to publish event: ${eventKey}`, err);
    }
  }

  function emitAssetUpdateAuditEvent(context, target, error) {
    emitAssetAuditEvent('AssetUpdate', context, target, error, (fileName) =>
      !error ? `Updated file ${fileName}` : `Failed to update file ${fileName}`
    );
  }

  function emitAssetDeleteAuditEvent(context, target, error) {
    emitAssetAuditEvent('AssetDelete', context, target, error, (fileName) =>
      !error ? `Deleted file ${fileName}` : `Failed to delete file ${fileName}`
    );
  }

  /**
   * Resolves contentType from explicit input, uploaded file metadata,
   * URI extension, or optional defaultContentType fallback.
   *
   * Returns the resolved contentType, or undefined if none could be determined.
   */
  function resolveContentType(input) {
    if (input.contentType) return input.contentType;

    if (input.file && input.file.contentType) return input.file.contentType;

    if (input.uri) {
      let path;
      try {
        path = new URL(input.uri).pathname;
      } catch {
        path = input.uri.split('?')[0];
      }
      return mime.lookup(path) || input.defaultContentType;
    }

    return input.defaultContentType;
  }

  async function createAsset(args, context) {
    const input = args.input;
    const authInfo =
      context.requestContext.userInfo || context.requestContext.tokenInfo;

    // Retrieve the TDO to validate that the requester has access to it.
    const tdo = await serviceContext.dal.tdo
      .getTDO(context, {
        id: input.containerId,
        applicationIds: args.applicationIds,
        applicationId: args.applicationId,
        includeByAcl: ['editor'],
        groupId: _.get(authInfo, 'groupId'),
        useCache: false, // can't rely on local cache for this
        _writeAccessRequest: true
      })
      .catch((err) => {
        emitAssetUploadedEvent(
          null, // assetId
          tdo.id, // tdoId
          input.organizationId, // orgId
          null, // updateMediaDuration
          null, // addToIndex
          context,
          err
        );
        throw err;
      });

    return createAssetAuthorized(input, context, tdo);
  }

  /**
   * Creates the asset once access to the TDO has been authorized.
   * Interna/private to this module only.
   */
  async function createAssetAuthorized(input, context, tdo, deferredEvents) {
    let assetName;
    try {
      // do a bit of error checking to account for the deprecated assetType field
      if (_.isNil(input.type) && _.isNil(input.assetType)) {
        throw new errors.InvalidInput({
          message: 'one of type or assetType must be provided'
        });
      }
      if (
        !_.isNil(input.type) &&
        !_.isNil(input.assetType) &&
        input.type !== input.assetType
      ) {
        throw new errors.InvalidInput({
          message:
            'both type and assetType were provided, but did not have the same values'
        });
      }
      if (!input.uri && !input.file && !input.object) {
        throw new errors.InvalidInput({
          message:
            'One of uri or file (upload) must be provided to create an asset.'
        });
      }

      input.uri = stripAssetUriSignature(input.uri);

      // Correct an input error as mentioned in https://steel-ventures.atlassian.net/browse/VTN-38379.
      if (!_.isNil(input.assetType) && input.assetType === 'text/plain') {
        input.assetType = 'text';
        input.contentType = 'text/plain';
      }

      const maxMetadataSizeStr = _.get(
        serviceContext,
        'config.rateLimit.maxAssetMetadataSize',
        '1mb'
      );
      const maxMetadataSize = bytes.parse(maxMetadataSizeStr);
      const metadataCheck = input.details || input.jsondata;
      const size = metadataCheck ? JSON.stringify(metadataCheck).length : 0;

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

      // check that TDO asset count hasn't exceeded limit
      if (input.__skipAssetCountCheck !== true) {
        await checkTDOAssetCount(context, tdo);
      }

      // make sure both fields are populated to avoid gotchas elsewhere in this code
      if (!input.type) input.type = input.assetType;
      if (!input.assetType) input.assetType = input.type;

      let contentType = resolveContentType(input);
      if (contentType) {
        input.contentType = contentType;
      }
      // if a content type could not be determined, throw out
      if (!contentType) {
        throw new errors.InvalidInput({
          message:
            'A content type could not be determined from the supplied asset input.' +
            'Set the contentType input field to create the asset.',
          data: {
            assetType: input.assetType,
            fileSupplied: !_.isNil(input.file),
            fileContentType: _.get(input, 'file.contentType')
          }
        });
      }

      if (input.assetType && input.contentType)
        checkAssetTypeAndContentType(input.assetType, input.contentType);

      // generate an ID
      const assetId = `${tdo.id}_${dateIdUtil.generateBase62Id(10)}`;
      input.id = assetId;

      // VNT-26212
      const now = moment();
      const extension = contentType
        ? '.' + storage.getFileExtension(contentType)
        : '';
      const storagePath = `${input.organizationId || '_'
        }/asset/${now.year()}/${now.month()}/${now.day()}/${input.containerId
        }/${assetId}${extension}`;

      assetName = `${assetId}${extension}`;

      // needed only for legacy DAL putAsset call
      const assetModel = {
        assetType: input.type || input.assetType,
        applicationId: input.applicationId,
        contentType: contentType,
        recordingId: input.containerId,
        _uri: input.uri,
        userEdited: input.isUserEdited,
        storagePath, // VTN-26212
        assetId
      };

      if (input.file) {
        if (input.file.size === 0) {
          throw new errors.InvalidInput({
            message:
              'The client attempted to upload a zero-byte file to the ' +
              'createAsset mutation. The API does not accept zero-byte files ' +
              'as they most likely indicate an error on the client side and will ' +
              'not generate a usable asset.',
            data: {
              containerId: input.containerId,
              contentType: contentType,
              assetType: assetModel.assetType,
              errorCode: 'zero_byte_upload'
            }
          });
        }
        const stream = input.file.inputStream;
        // map incoming data to Asset model
        await putAssetMediaInternal(assetModel, stream, input.file.size);
        input.uri = assetModel._uri;
      } else if (input.object) {
        // only passed internally
        const str = JSON.stringify(input.object);
        const size = str.length;
        const stream = intoStream(str);

        await putAssetMediaInternal(assetModel, stream, size);
        input.uri = assetModel._uri;
      }

      // compute full metadata on the asset input
      const metadata = await addLocalDataToDBMetadata(
        input,
        input.jsondata || {}
      );
      if (metadata.file) delete metadata.file.inputStream;
      input.metadata = metadata;

      // TODO compute and validate hash
      // TODO set new media to container's media asset if there isn't one ?
      // TODO transcript override
      const sqlParts = [];
      const values = [];

      // first SQL to create the asset
      addCreateAssetSql(tdo, input, sqlParts, values);

      // handle stopTime update by adding appropriate SQL
      addStopTimeUpdateSql(tdo, input, sqlParts, values);

      // handle set as primary.
      // might require round trip to refresh JSON
      const primaryKey = addSetAsPrimarySql(tdo, input, sqlParts, values);

      const sql = sqlParts.join(';\n') + ';';
      let res;

      try {
        res = await serviceContext.dbConnections['core'].write.map(
          sql,
          values,
          mapper.mapAsset
        );
      } catch (e) {
        logger.error('Error when creating recording_asset', e);
        const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
        const errorCode = _.get(e, 'data.internalData.code');

        // catch the recording_asset partition table does not exists
        if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
          // try to create the recording_asset partition table if not exists
          await validateRecordingAssetTablePartition(moment.utc());

          // retry to create asset
          res = await serviceContext.dbConnections['core'].write.map(
            sql,
            values,
            mapper.mapAsset
          );
        } else {
          throw new errors.InternalServerError({
            message: 'Failed to create asset: ' + (e.message || e)
          });
        }
      }

      if (!res.length) {
        throw new errors.NotFound({
          message:
            'The asset could not be created because the specified container ' +
            'is not available. It may have been deleted.',
          data: {
            containerId: input.containerId
          }
        });
      }
      const assetRow = res[0];
      let tdoRow;
      // TDO update is returned
      if (res.length > 1) {
        // first get the most recent TDO row
        tdoRow = res.length > 2 ? res[2] : res[1];
        // now update persistent local cache with the returned TDO
        // this copy can safely be used within the context of this request
        let tdoObj = Object.assign(tdo, mapper.mapRecording(tdoRow));
        tdoObj.__requestId = context.requestInfo.requestId;
        localCache.set(
          'TemporalDataObject',
          serviceContext.dal.tdo.tdoCacheKey(tdo, input),
          tdoObj
        );

        // now determine if start/stop was updated
        const updateKeys = [];
        if (primaryKey) {
          updateKeys.push(`jsondata.${primaryKey}`);
        }
        if (
          res[1].query === 'tdo2' ||
          (res.length > 2 && res[2].query === 'tdo2')
        ) {
          // need to update media table.
          // we don't do this synchronously
          updateMediaTableStopTime(tdoObj.id, tdoObj.stopDateTime);
          updateKeys.push('stopDateTime', 'jsonData.stopDateTime');
        }

        // also update redis cache.
        await serviceContext.dal.tdo.updateTDOCache(tdo.id, tdoObj, updateKeys);
        // TODO also update assets when they are cached in redis
      }

      let tdoOwnerOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        tdo.applicationId
      );
      if (tdoOwnerOrgId) {
        tdoOwnerOrgId = parseInt(tdoOwnerOrgId);
      }
      const addToIndex = _.has(tdo, 'jsondata.addToIndex')
        ? _.get(tdo, 'jsondata.addToIndex')
        : await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
          context,
          tdoOwnerOrgId || input.organizationId
        );
      emitAssetUploadedEvent(
        assetId,
        tdo.id,
        tdoOwnerOrgId || input.organizationId,
        input.updateContainerStopDateTime,
        addToIndex,
        context,
        null,
        assetName,
        deferredEvents
      );

      // add tags to asset URI
      if (input.uri) {
        try {
          const tags = [
            { key: 'AIWARE_MEDIA_ID', value: tdo.id },
            { key: 'AIWARE_ASSET_ID', value: assetId }
          ];
          setAssetStorageTags(input.uri, tags);
        } catch (error) {
          logger.debug('Set asset storage tags error.', error.message);
        }
      }

      // increment cached asset count
      await serviceContext.dal.tdo.incrTDOAssetCount(tdo.id);

      await serviceContext.dal.organization.setLastAssetUpdatedDate(
        context,
        tdoOwnerOrgId || input.organizationId,
        moment.utc()
      );

      return assetRow;
    } catch (err) {
      emitAssetUploadedEvent(
        null, // assetId
        tdo.id, // tdoId
        input.organizationId, // orgId
        null, // updateMediaDuration
        null, // addToIndex
        context,
        err,
        assetName
      );
      throw err;
    }
  }

  async function putAssetMediaInternal(asset, stream, size) {
    const startTime = Date.now();
    const poolLabel = { pool: 's3upload' };
    metrics.incrementGauge('httpConcurrentCalls', poolLabel);
    metrics.incrementCounter('httpCall', poolLabel);
    try {
      await putAssetMedia(asset, stream, size); // returns promise
    } catch (err) {
      // 10/4 - temp disable this retry as it causes a hang/timeout, probably
      // because we already pulled on the stream so it doesn't become available
      // again for the retry line.
      // retry once
      serviceContext.logger.warn(
        'retry on PUT for ' + asset.assetId + ':  ' + err
      );
      metrics.incrementCounter('awsUploadError');
      throw err;
    } finally {
      metrics.observeHistogram(
        'httpCallElapsedMs',
        Date.now() - startTime,
        poolLabel
      );
      metrics.decrementGauge('httpConcurrentCalls', poolLabel);
    }
  }
  async function setAssetStorageTags(s3Uri, tags, versionId) {
    if (!storage.isAmazonS3Uri(s3Uri)) {
      return {
        success: false,
        msg: 'Uri does not valid'
      };
    }

    const bucket = httpUtil.getBucket(s3Uri);
    const storageByBucket = serviceContext.dal.dalStorage.getStorageByBucketName(
      bucket
    );

    if (_.isNil(storageByBucket)) {
      return {
        success: false,
        msg: `The URI that doesn't belong to one of our buckets.`
      };
    }

    try {
      await serviceContext.dal.dalStorage.putObjectTaggingPromise(
        s3Uri,
        tags,
        versionId
      );

      return {
        success: true,
        msg: 'The tags are set.'
      };
    } catch (err) {
      return {
        success: false,
        msg: err.message
      };
    }
  }

  async function updateMediaTableStopTime(tdoId, stopDateTime) {
    const sql = `
UPDATE media
SET media_stop_time = $1
WHERE media_id = $2
    `;
    const vars = [moment(stopDateTime).toISOString(), tdoId];
    const res = await dbConnections['media_platform'].write.query(sql, vars);
    return res;
  }

  function addCreateAssetSql(tdo, input, sqlParts, values) {
    const assetPartitionTableName = dateIdUtil.getRecordingAssetPartition(
      config.recordingAssetTablePartitionActiveDate,
      config.recordingWeekConfig,
      tdo.id
    );
    const sql = `
INSERT INTO ${assetPartitionTableName} (
  asset_id,
  recording_id,
  metadata,
  type,
  content_type,
  uri,
  user_edited)
VALUES (
  \$${values.length + 1}, -- asset_id
  \$${values.length + 2}, -- recording_id
  \$${values.length + 3}, -- metadata
  \$${values.length + 4}, -- type
  \$${values.length + 5}, -- content_type
  \$${values.length + 6}, -- uri
  \$${values.length + 7}  -- user_edited
)
RETURNING *, 'asset' AS query
    `;
    values.push(input.id);
    values.push(tdo.id);
    values.push(input.metadata);
    values.push(input.assetType || input.type);
    values.push(input.contentType);
    values.push(input.uri);
    values.push(input.isUserEdited);

    sqlParts.push(sql);
  }

  function addSetAsPrimarySql(tdo, input, sqlParts, values) {
    // if this call doesn't set asset as primary, just return
    if (input.setAsPrimary !== true) return;

    const type = input.assetType;
    const id = input.id;
    let key;
    switch (type) {
      case 'media':
        key = 'mediaAsset';
        break;
      case 'transcript':
        key = 'transcriptAsset';
        break;
      case 'media-mdp':
        key = 'mediaMdpAsset';
        break;
      default:
        if (disablePrimaryAssetTypeEnforcement) {
          key = 'primaryAsset';
        } else {
          throw new errors.InvalidInput({
            message:
              'Cannot set primary asset type to ' +
              type +
              ' Valid values are media and transcript.',
            data: { objectId: input.id, objectType: 'TemporalDataObject' }
          });
        }
        break;
    }

    // insert primary asset block into JSON without altering the rest
    values.push(tdo.id);
    const sql = `
UPDATE
  recording.recording
SET
  "json" = jsonb_set(json, '{${key}}', '{"assetId":"${id}"}'::JSONB)
WHERE
  recording_id = \$${values.length}
RETURNING *, 'tdo1' AS query
    `;

    sqlParts.push(sql);
    return key;
  }

  function getStopDateTimeMoment(tdo, durationMs) {
    const startTimeNum = _.isNumber(tdo.startDateTime)
      ? tdo.startDateTime
      : tdo.startDateTime.getTime();
    const testStopTime = startTimeNum + durationMs;
    const testStopTimeSec = Math.floor(testStopTime / 1000);
    util.validateTDOTimes(Math.floor(startTimeNum / 1000), testStopTimeSec);
    return moment(testStopTime);
  }

  function buildStopTimeUpdateSql(tdoId, stopTimeMoment, sqlParts, values) {
    const sql = `
UPDATE
  recording.recording
SET
  stop_date_time = \$${values.length + 1},
  "json" = jsonb_set(json, '{stopDateTime}', '${stopTimeMoment.unix()}')
WHERE
  recording_id = \$${values.length + 2} AND
  stop_date_time < \$${values.length + 1}`;
    values.push(stopTimeMoment.toISOString());
    values.push(tdoId);
    sqlParts.push(sql);
  }

  function addStopTimeUpdateSql(tdo, input, sqlParts, values) {
    const stopOffset = _.get(input, 'details.segmentStopTimeMs');
    if (stopOffset && input.assetType === 'media') {
      const stopTime = getStopDateTimeMoment(tdo, stopOffset);
      return buildStopTimeUpdateSql(tdo.id, stopTime, sqlParts, values);
    }
  }

  function emitAssetUploadedEvent(
    assetId,
    tdoId,
    orgId,
    updateMediaDuration,
    addToIndex,
    context,
    error,
    assetName,
    deferredEvents
  ) {
    if (deferredEvents && _.isArray(deferredEvents)) {
      deferredEvents.push(() =>
        emitAssetUploadedEvent(
          assetId,
          tdoId,
          orgId,
          updateMediaDuration,
          addToIndex,
          context,
          error,
          assetName
        )
      );
      return;
    }
    const clientInfo = resolverUtil.getClientInfo(context);
    const userName =
      clientInfo.userName || clientInfo.appName || clientInfo.organizationName;
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.AssetUpload.event, // use 'asset_upload' for system event
      type: eventsMap.AssetUpload.type,
      assetId: assetId,
      recordingId: tdoId,
      organizationId: orgId ? parseInt(orgId) : null,
      updateMediaDuration: updateMediaDuration,
      addToIndex,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        assetId,
        error,
        'create',
        !error ? 'success' : 'failure',
        !error
          ? `Uploaded file ${assetName} successfully`
          : `Failed to upload file`
      )
    };
    !error && messageUtil.emitEvent(event, messageUtil.topics('EVENTS'));

    const publicEvent = {
      ...event,
      event: eventsMap.AssetUploaded.event, //  use 'asset_uploaded' for public events that may have subscribers
      type: eventsMap.AssetUploaded.type
    };
    messageUtil.emitPublicEvent(
      supportedEvents.AssetUploaded,
      'system',
      context,
      publicEvent
    );
  }

  /**
   * Emits recording_cognition_completed, the event that makes task-insert-server
   * index the TDO.
   *
   * The optional tail is an object rather than four more positional arguments:
   * every caller supplies a different subset, so positionally they can only be
   * reached through `undefined` placeholders, and a placeholder in the wrong slot
   * is a silent misroute rather than an error.
   *
   * @param {string} [assetId] null/undefined for TDO-level re-index emissions.
   * @param {string} tdoId
   * @param {string} token
   * @param {string|number} organizationId
   * @param {boolean} addToIndex
   * @param {object} [options]
   * @param {number} [options.delayMs] Delay before the event is delivered.
   * @param {object} [options.context] Request context, for the public event.
   * @param {Error} [options.error] Surfaced through actionInfo.
   * @param {object} [options.previousTimes] VE-26223: the TDO timespan before the
   *   update that triggered this event, as { previousStartDateTime,
   *   previousStopDateTime } in unix seconds. Omit it when there is no previous
   *   timespan to report - the indexer treats the fields as absent and skips
   *   stale time-slice cleanup.
   */
  function emitRecordingCognitionCompletedEvent(
    assetId,
    tdoId,
    token,
    organizationId,
    addToIndex,
    options = {}
  ) {
    const { delayMs, context, error, previousTimes } = options;
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.RecordingCognitionCompleted.event,
      type: eventsMap.RecordingCognitionCompleted.type,
      assetId: assetId,
      recordingId: tdoId,
      organizationId: organizationId ? parseInt(organizationId) : null,
      payload: {
        assetId: assetId,
        recordingId: tdoId,
        token: token,
        organizationId: organizationId ? parseInt(organizationId) : null,
        addToIndex, // for task-insert-server determine that its necessary to index
        // Spread so the keys stay absent when previousTimes is omitted. The
        // indexing-server distinguishes absent from zero and only cleans up stale
        // time slices when both are present.
        ..._.pick(previousTimes || {}, [
          'previousStartDateTime',
          'previousStopDateTime'
        ])
      },
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(assetId, error)
    };
    messageUtil.emitEvent(event, messageUtil.topics('EVENTS'), delayMs);
    messageUtil.emitPublicEvent(
      supportedEvents.RecordingCognitionCompleted,
      'system',
      context,
      event,
      delayMs
    );
  }

  async function addLocalDataToDBMetadata(input, metadata) {
    if (input.description) {
      metadata.description = input.description;
    }
    if (input.details) {
      metadata.details = input.details;
    }
    if (input.name) {
      metadata.fileName = input.name;
    }
    if (input.fileData) {
      if (input.fileData.originalFileUri)
        metadata.originalfileUri = input.fileData.originalFileUri;
      if (input.fileData.md5sum) metadata.md5 = input.fileData.md5sum;
      if (input.fileData.sha256) metadata.sha256 = input.fileData.sha256;
      if (input.fileData.size) metadata.size = input.fileData.size;
      // override with the new bigInt field
      if (input.fileData.fileSize) metadata.size = input.fileData.fileSize;
      if (input.fileData.mode) metadata.mode = input.fileData.mode;
      if (input.fileData.mediaDurationMs) {
        // media duration was historically stored in seconds as a float
        metadata.mediaDuration = input.fileData.mediaDurationMs / 1000;
      }
    }
    // on createTDOWithAsset there are currently two fields that can
    // take sourceId.
    const sourceId = input.sourceId || _.get(input, 'sourceData.sourceId');
    if (sourceId) {
      metadata.sourceId = metadata.mediaSourceId = sourceId;
    }
    if (input.sourceData) {
      if (input.sourceData.name) metadata.sourceName = input.sourceData.name;
      if (input.sourceData.taskId)
        metadata.sourceTaskId = input.sourceData.taskId;
      if (input.sourceData.engineId) {
        metadata.sourceEngineId = input.sourceData.engineId;
        // make sure to map source to correct value so that CMS works.
        metadata.source = await getEngineAssetSourceType(
          input.sourceData.engineId
        );
      }
      if (input.sourceData.scheduledJobId)
        metadata.scheduledJobId = input.sourceData.scheduledJobId;
      if (input.sourceData.schemaId)
        metadata.schemaId = input.sourceData.schemaId;
    }
    if (input.storeAsReference) {
      metadata.storeAsReference = input.storeAsReference;
    }

    if (input.segmentGroupId) {
      metadata.segmentGroupId = input.segmentGroupId;
    }

    return metadata;
  }

  // here we map the engine ID to the value in job_new.engine.asset, if there
  // is one. for example, the engine transcribe-greenkey maps to transcribe.
  // most engines just map to the engine id.
  async function getEngineAssetSourceType(engineId) {
    let res = localCache.get('EngineAssetSourceType', engineId);
    if (!res) {
      const sql = `
SELECT asset
FROM job_new.engine
WHERE engine_id = $1
AND asset IS NOT NULL;
    `;
      const rows = await dbConnections['core'].read.map(
        sql,
        [engineId],
        (row) => row.asset
      );
      res = rows.length ? rows[0] : engineId;
      localCache.set('EngineAssetSourceType', engineId, res);
    }
    return res;
  }

  async function createEngineResultAsset(context, engine, task, input, tdo) {
    const tdoID = task.targetId;
    const taskId = task.id;
    const assetInput = {
      sourceData: {
        taskId: taskId,
        name: engine.name,
        engineId: engine.id
      },
      containerId: tdoID
    };
    if (input.outputString) {
      assetInput.file = {
        inputStream: intoStream(input.outputString)
      };
    } else if (input.output) {
      assetInput.file = {
        inputStream: intoStream(JSON.stringify(input.output))
      };
    }
    const doTaskOutput = input.setTaskOutput === true;
    // new asset will have the URI
    // uri parameter, if passed, will be set here.
    const assetIn = Object.assign(assetInput, input);
    const asset = await createAssetAuthorized(assetIn, context, tdo);
    const status = input.completeTask ? 'complete' : null;
    // if result is JSON, parse it to set on database directly
    let resultJson;

    // get content with signed URI. this will be task result.
    if (input.setTaskOutput) {
      const uri = await signAssetUri(asset);
      // TODO use download, which limits size.
      const result = await rp(uri);
      const max = _.get(config, 'server.maxTaskOutputSizeBytes', 1000000);

      const okToSetOutput =
        input.setTaskOutput === true && result.length <= max;

      // if the engine result exceeds the max allowed to write to
      // the task_output database column, just skip.
      const resultLength = result.length;
      if (resultLength > max && input.setTaskOutput) {
        logger.warn(
          'engine result for task ' +
          taskId +
          ' too big at ' +
          result.length +
          ' bytes. the limit is ' +
          max +
          '. wrote asset ' +
          uri +
          ' but skipping write of task output.'
        );
      }
      if (okToSetOutput === true) {
        try {
          resultJson = JSON.parse(result);
        } catch (err) {
          // just means the provided result is not JSON
          // embed into JSON with the provided key.
          resultJson = {};
          resultJson[input.outputJsonKey] = result;
        }
      }
    }

    // otherwise update the task with status and output
    if (status || resultJson) {
      const newTask = await updateTaskWithResult(
        context,
        taskId,
        task.jobId,
        resultJson,
        status,
        task
      );
    }
    return asset;
  }

  async function updateExistingAccumulatedResult(
    context,
    input,
    tdo,
    task,
    engine,
    asset
  ) {
    // we already have an asset. just need to update its URI.
    let updateOk = true;
    if (input.clientTimestamp) {
      // first get the last timestamp from the asset metadata
      const oldTimestamp = _.get(asset, 'metadata.uploadTimestamp');
      // we can update if there is no existing upload timestamp
      // OR the one we received is newer than the one in the database.
      const ct = moment(input.clientTimestamp);
      updateOk = !oldTimestamp || moment(oldTimestamp).isBefore(ct);
    }
    if (updateOk) {
      // we have fresh data. update postgres.
      const metadata = asset.metadata || {};
      // write new upload timestamp value into the metadata json
      metadata.uploadTimestamp =
        moment(input.clientTimestamp).toISOString() || moment().toISOString();
      const normalizedUri = stripAssetUriSignature(input.uri);
      const sql = `
UPDATE ${util.generateRecordingAssetPartition(_.get(tdo, 'id'))}
SET uri = $1, metadata = $2::JSON
WHERE asset_id = $3 AND recording_id = $4 AND recording_id::bigint = $4
RETURNING asset_id AS id, uri, metadata
      `;
      const update = await serviceContext.dbConnections['core'].write.query(
        sql,
        [normalizedUri, JSON.stringify(metadata), asset.id, tdo.id]
      );
      if (!update.length) {
        // TODO weird case... probably throw error.
        throw new errors.ResourceConflict({
          message:
            'The engine result asset could not be updated because it ' +
            'was deleted during the update process.',
          data: {
            objectType: 'Asset',
            objectId: asset.id
          }
        });
      }
      asset.uri = update[0].uri;
      asset.metadata = update[0].metadata;
      logger.debug('updated asset ' + asset.uri + ' to ' + update[0].uri);
    } else {
      // do nothing. the data in the db is newer than what we have here.
      logger.debug(
        'asset for task ' +
        task.id +
        ' not updated because the existing timestamp is newer than the one provided.'
      );
    }
    return asset;
  }

  async function handleAccumulatedResult(context, input, tdo, task, engine) {
    // this option only works with URI input.
    if (!input.uri) {
      throw new errors.InvalidInput({
        message: 'If isAccumulatedResult is set, a uri must be provided.'
      });
    }
    const existingAssetRow = await getAssets(context, {
      limit: 1,
      containerId: tdo.id,
      sourceTaskId: task.id,
      assetType: input.assetType,

      // note that a race condition could cause us to create two.
      // we use consistent ordering so that subsequent calls will
      // always update the first.
      orderBy: 'createdDateTime',
      orderDirection: 'asc'
    });

    // if we found an existing asset, update it in place
    // otherwise return nothing. the following code will create the asset.
    return existingAssetRow.records.length
      ? updateExistingAccumulatedResult(
        context,
        input,
        tdo,
        task,
        engine,
        existingAssetRow.records[0]
      )
      : null;
  }

  /**
   * Creates an asset for the target TDO.
   * Uploads the file as asset content.
   * Also updates that task with the file
   * as task output.
   * Updates task status if requested.
   */
  async function uploadEngineResult(context, args) {
    const input = args.input;
    const taskId = input.taskId;
    if (!(input.file || input.outputString || input.output || input.uri)) {
      throw new errors.InvalidInput({
        message:
          'You must provide either the file parameter, via multipart ' +
          ' form POST, output, outputString, or URI parameters to upload engine results'
      });
    }

    if (input.setTaskOutput === true && input.isAccumulatedResult === true) {
      throw new errors.InvalidInput({
        message:
          'setTaskOutput can only be used if isAccumulatedResult is false. Set either flag to false to continue.',
        data: {
          taskId
        }
      });
    }
    // TODO, later maybe try to figure these out based on engine ID.
    // but for any engine that actually uses uploadEngineResult it's
    // save to assume vtn-standard.
    if (!input.assetType) input.assetType = 'vtn-standard';
    if (!input.contentType && input.assetType === 'vtn-standard')
      input.contentType = 'application/json';

    // first get the task
    const task = await serviceContext.dal.task.getTask(context, {
      id: taskId,
      applicationId: args.applicationId
    });
    // now get the TDO
    let tdoID = task.targetId;
    // if the task doesn't have a target ID set,
    // try to get it from the job.
    let job;
    if (!tdoID) {
      job = await serviceContext.dal.job.getJob(context, {
        id: task.jobId
      });
      tdoID = job.targetId;
      task.__job = job; // updateTask will use this job instead of re-fetching
    }
    if (!tdoID) {
      throw new errors.InvalidInput({
        message:
          'The uploadEngineResult mutation can only be used ' +
          'with tasks that have an associated TemporalDataObject (TDO), which ' +
          'is used to store the engine result as an Asset. The task and job ' +
          'specified do not have an associated TDO. A target TDO can only be ' +
          'associated on job and task creation. To continue, use the createAsset' +
          'mutation to upload the engine result content to a specific TDO.',
        data: {
          taskId: taskId,
          jobId: task.jobId
        }
      });
    }
    const tdo = await serviceContext.dal.tdo.getTDO(context, {
      id: tdoID,
      applicationId: args.applicationId,
      applicationIds: args.applicationIds,
      _writeAccessRequest: true
    });

    // now get the engine
    const engine = await serviceContext.dal.engine.getEngine(context, {
      id: task.engineId
    });
    let asset;

    // if the client (probably output-writer) passed this, we first
    // see if an asset exists.
    if (input.isAccumulatedResult) {
      asset = await handleAccumulatedResult(context, input, tdo, task, engine);
    }
    // we'll create a new asset if one doesn't already exist for this task
    // format the source data with task and engine info
    if (!asset) {
      asset = await createEngineResultAsset(context, engine, task, input, tdo);
    } else if (input.status) {
      const newTask = await updateTaskWithResult(
        context,
        taskId,
        task.jobId,
        null,
        input.status,
        task
      );
    }

    if (input.setAsPrimary) {
      // input to updateTDO
      const tdoInput = {
        id: tdoID,
        primaryAsset: [
          {
            id: asset.id,
            assetType: asset.assetType || asset.type
          }
        ],
        organizationId: input.organizationId,
        applicationId: input.applicationId
      };
      // note that this will throw if assetType is not transcript or media
      const tdoRes = await serviceContext.dal.tdo.updateTDO(context, {
        input: tdoInput
      });
    }

    if (!input.skipIndexing) {
      const authInfo =
        context.requestContext.userInfo || context.requestContext.tokenInfo;
      let tdoOwnerOrgId;
      if (tdo.applicationId) {
        tdoOwnerOrgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          tdo.applicationId
        );
      }
      const orgId =
        tdoOwnerOrgId || _.get(authInfo.organization, 'organizationId');
      const token = context.requestContext.authToken;
      const addToIndex = _.get(
        tdo,
        'jsondata.addToIndex',
        await serviceContext.dal.organization.getDefaultAddToIndexForOrg(
          context,
          orgId
        )
      );
      emitRecordingCognitionCompletedEvent(
        asset.id,
        tdoID,
        token,
        args.organizationId || orgId,
        addToIndex,
        { context }
      );
    }

    return asset;
  }

  async function updateTaskWithResult(
    context,
    taskId,
    jobId,
    result,
    status = null,
    task = null
  ) {
    const res = await serviceContext.dal.task.updateTask(context, {
      __task: task, // update task will use this one instead of re-fetching
      input: {
        id: taskId,
        output: result,
        status
      }
    });
    return res;
  }

  function isOurBucket(uri) {
    return resolverUtil.isOurBucket(uri);
  }

  async function signAssetUri(object) {
    if (object.signedUri) return object.signedUri;
    if (!object.uri) return object.uri;

    return resolverUtil.getSignedUrl(
      object.uri,
      null,
      object.metadata.fileName
    );
  }

  async function updateAssetSizeExternal(assetId, sizeExternal) {
    if (mainUtil.isFakeMediaAssetId(assetId)) {
      throw new errors.InvalidInput({
        message: 'The requested asset is a virtual asset and cannot be updated',
        data: {
          objectId: assetId,
          objectType: 'Asset'
        }
      });
    }

    const tdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);
    let sql;
    if (sizeExternal === true) {
      sql = `
      UPDATE
        ${util.generateRecordingAssetPartition(tdoId)}
      SET
        metadata = jsonb_set(metadata, '{sizeExternal}', '${sizeExternal}')
      WHERE
        asset_id = $1
      `;
    } else {
      sql = `
    UPDATE
      ${util.generateRecordingAssetPartition(tdoId)}
    SET
      metadata = metadata - 'sizeExternal'
    WHERE
      asset_id = $1
      `;
    }

    return await serviceContext.dbConnections['core'].write.query(sql, [
      assetId
    ]);
  }

  async function updateAssetSizeError(assetId, sizeError) {
    if (mainUtil.isFakeMediaAssetId(assetId)) {
      throw new errors.InvalidInput({
        message: 'The requested asset is a virtual asset and cannot be updated',
        data: {
          objectId: assetId,
          objectType: 'Asset'
        }
      });
    }

    const tdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);
    let sql;
    if (sizeError) {
      sql = `
    UPDATE
      ${util.generateRecordingAssetPartition(tdoId)}
    SET
      metadata = jsonb_set(metadata, '{sizeError}', \$\${"message": "${sizeError}"}\$\$)
    WHERE
      asset_id = $1
    `;
    } else {
      sql = `
    UPDATE
      ${util.generateRecordingAssetPartition(tdoId)}
    SET
      metadata = metadata - 'sizeError'
    WHERE
      asset_id = $1
      `;
    }

    return await serviceContext.dbConnections['core'].write.query(sql, [
      assetId
    ]);
  }

  async function updateAssetSize(assetId, assetSize) {
    if (!_.isNumber(assetSize)) {
      throw new Error('Invalid assetSize: ' + assetSize);
    }

    if (mainUtil.isFakeMediaAssetId(assetId)) {
      throw new errors.InvalidInput({
        message: 'The requested asset is a virtual asset and cannot be updated',
        data: {
          objectId: assetId,
          objectType: 'Asset'
        }
      });
    }

    const tdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);
    const sql = `
    UPDATE
      ${util.generateRecordingAssetPartition(tdoId)}
    SET
      metadata = jsonb_set(metadata, '{size}', '$1')
    WHERE
      asset_id = $2
    `;

    return await serviceContext.dbConnections['core'].write.query(sql, [
      assetSize,
      assetId
    ]);
  }

  async function getAsset(context, args) {
    if (mainUtil.isFakeMediaAssetId(args.id)) {
      const parts = mainUtil.parseFakeAssetId(args.id);
      // validate access to TDO
      const tdo = await serviceContext.dal.tdo.getTDO(context, {
        id: parts.tdoId,
        applicationIds: args.applicationIds,
        applicationId: args.applicationId
      });

      return serviceContext.dal.tdo.getFakeMediaAsset(
        context,
        tdo,
        parts.assetType
      );
    }
    return await dbGetAsset(context, args);
  }

  async function dbGetAsset(context, args) {
    try {
      if (!args.id) {
        throw new errors.InvalidInput({
          message:
            'A non-empty id parameter value is required on the asset field or query.'
        });
      }

      const id = args.id;
      const tdoId = dateIdUtil.getRecordingIdFromAssetId(id);
      let tableName = 'recording.recording_asset';
      let recordingClause = '';
      const sqlArgs = [id];
      // if we have a TDO from the asset ID,
      // insert into WHERE clause so that pg queries the right partition.
      if (tdoId) {
        recordingClause = `AND (ra.recording_id = $2 AND ra.recording_id::bigint = $2)`;
        sqlArgs.push(tdoId);
        tableName = util.generateRecordingAssetPartition(tdoId);
      }
      let sql = `
  SELECT
    ra.asset_id AS id,
    ra.recording_id AS container_id,
    ra.metadata AS metadata,
    ra.type AS type,
    ra.content_type as content_type,
    ra.uri AS uri,
    ra.created_date_time AS created_date_time,
    ra.user_edited as user_edited
  FROM
    ${tableName} AS ra
  WHERE
    ra.asset_id = $1 ${recordingClause}
           `;

      if (args.ignoreUserEdited) {
        sql += ' AND ra.user_edited != true';
      }
      const data = await serviceContext.dbConnections['core'].read.map(
        sql,
        sqlArgs,
        mapper.mapAsset
      );

      // if asset not found by ID, throw out
      if (!data.length) {
        throw new errors.NotFound({
          data: { objectId: args.id, objectType: 'Asset' }
        });
      }

      // now we need to validate access to TDO.
      // this more efficient than a join against recording in the above query.
      try {
        const tdo = await serviceContext.dal.tdo.getTDO(context, {
          id: data[0].containerId,
          applicationIds: args.applicationIds,
          applicationId: args.applicationId,
          organizationId: args.orgId
        });
      } catch (err) {
        // if this threw a not found, throw out a proper not found on the asset
        if (err.name === 'not_found') {
          throw new errors.NotFound({
            message: 'The asset was not found.',
            data: {
              objectId: args.id,
              objectType: 'Asset'
            }
          });
        } else throw err; // otherwise just rethrow
      }

      // emit event for accessing media
      _emitPublicEventAccessMedia(context, data[0], 'asset');

      return data[0];
    } catch (err) {
      _emitPublicEventAccessMedia(context, { ...args, status: 'failure' }, 'asset', err);
      throw err;
    }
  }

  const orderDirectionMap = {
    desc: 'DESC',
    asc: 'ASC'
  };

  const assetOrderByMap = {
    createdDateTime: 'created_date_time',
    modifiedDateTime: 'modified_date_time',
    assetType: 'type',
    contentType: 'content_type',
    id: 'asset_id'
  };

  // this function generates a clause that can be appended to the normal
  // assets query to synthesize a virtual asset in the result set.
  // the virtual columns must EXACTLY match those in the real query
  // in getAssets().
  async function generateFakeMediaAssetClause(context, containerId, args) {
    let containerIds = containerId;
    if (!Array.isArray(containerId)) containerIds = [containerId];
    const assets = await Promise.all(
      containerIds.map((containerId) => {
        return serviceContext.dal.tdo.getFakeMediaAsset(
          context,
          {
            id: containerId,
            applicationId: args.applicationId
          },
          'media'
        );
      })
    );

    let values = [];
    assets.forEach((asset) => {
      values.push(
        `('${asset.id}',
       '${asset.id}',
       '${asset.uri}',
       '${asset.contentType}',
       '${asset.assetType}',
       '${JSON.stringify(asset.metadata)}'::JSONB,
       '${containerId}',
       '${containerId}',
       ${new Date(asset.createdDateTime / 1000).getTime()},
       ${new Date(asset.modifiedDateTime / 1000).getTime()},
       false
      )`
      );
    });

    const sql = `
UNION
SELECT id, asset_id, uri, content_type, type, metadata, container_id, recording_id, created_date_time, modified_date_time, user_edited
FROM (
  VALUES
       ${values.join(',')}
      )
  AS virtualTable(id, asset_id, uri, content_type, type, metadata, container_id, recording_id, created_date_time, modified_date_time, user_edited)
    `;

    return sql;
  }

  async function getAssets(context, args) {
    if (args.type && args.assetType) {
      throw new errors.InvalidInput({
        message:
          'specify only one of assets.type and assets.assetType parameters'
      });
    }
    let type = args.type || args.assetType;
    let fakeAssetClause = '';
    const containerIds = Array.isArray(args.containerId)
      ? args.containerId
      : args.containerId
        ? [args.containerId]
        : [];
    const assetId = args.id;
    let assetTable = 'recording.recording_asset';

    const includeVirtualMediaAsset = _.isNil(args.includeVirtualMediaAsset)
      ? true
      : args.includeVirtualMediaAsset;

    // the caller filtered by asset ID AND it's "fake" virtual
    // asset ID, return the single virtual asset.
    if (assetId && mainUtil.isFakeMediaAssetId(assetId)) {
      const parsed = mainUtil.parseFakeAssetId(assetId);

      // if magic ID was for a different TDO, return empty
      if (containerIds.indexOf(parsed.tdoId) < 0) {
        return mainUtil.toPage(args, []);
      }

      const getFakeMediaAssetFuncs = containerIds.map((containerId) => {
        return serviceContext.dal.tdo.getFakeMediaAsset(
          context,
          {
            id: containerId,
            applicationId: args.applicationId
          },
          'media'
        );
      });

      const assets = await Promise.all(getFakeMediaAssetFuncs);
      // otherwise return list of 1 with the virtual asset
      return mainUtil.toPage(args, assets);
    }

    if (assetId) {
      const tempTdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);

      assetTable = util.generateRecordingAssetPartition(tempTdoId);
    }

    if (containerIds && !_.isEmpty(containerIds)) {
      assetTable = util.generateRecordingAssetPartition(containerIds);
    }

    // ALERT if you add columns to this select clause, you must also add
    // them to the virtual row in the UNION clause below in generateFakeMediaAssetClause
    let assetSql = `
WITH ras AS (
  SELECT
    asset_id as id,
    asset_id,
    uri,
    content_type,
    type,
    metadata,
    recording_id as container_id,
    recording_id,
    created_date_time,
    created_date_time AS modified_date_time,
    user_edited
  FROM
    ${assetTable} ra
`;
    const sqlWhere = [];
    const sqlArgs = [];

    let containerWhere = 'recording_id IN (';
    containerIds.forEach((containerId) => {
      containerWhere += `\$${sqlArgs.push(containerId)},`;
    });
    containerWhere = containerWhere.slice(0, -1) + ')';
    sqlWhere.push(containerWhere);

    let containerWhereInt = 'recording_id::bigint IN (';
    containerIds.forEach((containerId) => {
      containerWhereInt += `\$${sqlArgs.push(parseInt(containerId))},`;
    });
    containerWhereInt = containerWhereInt.slice(0, -1) + ')';
    sqlWhere.push(containerWhereInt);

    /*
     Here we need to synthesize a virtual media asset and inject it
     into the result set from the DB IF the filters do not automatically
     exclude it. we do this by inserting it directly to the DB result set
     with union so that paging and sorting work.
     */

    if (type) {
      if (_.isString(type)) {
        type = [type];
      }
      const typeList = [];
      type.forEach(function addArg(theType) {
        sqlArgs.push(theType);
        typeList.push(`\$${sqlArgs.length}`);
      });
      sqlWhere.push(`type IN (${typeList.join(',')})`);

      // if asset type list was specified and includes media, add virtual asset
      if (
        includeVirtualMediaAsset &&
        !assetId &&
        type.includes('media') &&
        _.get(args, 'includeVirtualAsset.length', 0) > 0
      ) {
        fakeAssetClause = await generateFakeMediaAssetClause(
          context,
          args.includeVirtualAsset,
          args
        );
      }

      // if asset type is "media-mdp", should filter by segmentGroupId
      if (type.includes('media-mdp') && !_.isNil(args.segmentGroupId)) {
        sqlWhere.push(
          `metadata @> \$${sqlArgs.push({
            segmentGroupId: args.segmentGroupId
          })}`
        );
      }
    } else if (
      includeVirtualMediaAsset &&
      _.get(args, 'includeVirtualAsset.length', 0) > 0 &&
      !assetId
    ) {
      // if no asset type filter was specified, add virtual asset
      fakeAssetClause = await generateFakeMediaAssetClause(
        context,
        args.includeVirtualAsset,
        args
      );
    }
    const sourceTaskIds = Array.isArray(args.sourceTaskId)
      ? args.sourceTaskId
      : args.sourceTaskId
        ? [args.sourceTaskId]
        : [];
    if (sourceTaskIds.length) {
      const sourceTaskWhere = [];
      sourceTaskIds.forEach((sourceTaskId) => {
        sourceTaskWhere.push(
          `metadata @> \$${sqlArgs.push({ sourceTaskId: sourceTaskId })}`
        );
      });

      sqlWhere.push(`(${sourceTaskWhere.join(' OR ')})`);
    }
    const sourceEngineIds = Array.isArray(args.sourceEngineId)
      ? args.sourceEngineId
      : args.sourceEngineId
        ? [args.sourceEngineId]
        : [];
    if (sourceEngineIds.length) {
      const sourceEngineWhere = [];
      sourceEngineIds.forEach((sourceEngineId) => {
        sourceEngineWhere.push(
          `(metadata @> \$${sqlArgs.push({
            sourceEngineId: sourceEngineId
          })} OR
          metadata @> \$${sqlArgs.push({ source: sourceEngineId })})`
        );
      });
      sqlWhere.push(`(${sourceEngineWhere.join(' OR ')})`);
    }
    const assetIds = Array.isArray(assetId)
      ? assetId
      : assetId
        ? [assetId]
        : [];
    if (assetIds.length) {
      const assetWhere = [];
      assetIds.forEach((id) => {
        assetWhere.push(`asset_id = \$${sqlArgs.push(id)}`);
      });
      sqlWhere.push('(' + assetWhere.join(' OR ') + ')');
    }
    // include hidden assets if assets:all right is set OR
    // we're getting a single asset by ID.
    if (!(args.includeHiddenAssets || args.id)) {
      sqlWhere.push(`lower(type) NOT LIKE 'v-%'`);
    }
    if (sqlWhere.length) {
      assetSql += ' WHERE ' + sqlWhere.join(' AND ');
      // if a virtual asset clause was generated, we'll need to
      // duplicate the where clause inside it.
      if (fakeAssetClause.length) {
        fakeAssetClause += ' WHERE ' + sqlWhere.join(' AND ');
      }
    }
    // if a virtual asset clause was generated, insert it here.
    if (fakeAssetClause.length) {
      assetSql += '\n' + fakeAssetClause;
    }
    if (args.ignoreUserEdited) {
      assetSql += ` AND user_edited IS NOT true`;
    }

    assetSql += `\n) SELECT * FROM ras`;
    const orderBy = assetOrderByMap[args.orderBy] || 'created_date_time';
    const orderDir = orderDirectionMap[args.orderDirection] || 'DESC';
    if (!_.isNil(args.orderBy) || !_.isNil(args.offset))
      assetSql += `\n ORDER BY ${orderBy} ${orderDir}`;
    if (!_.isNil(args.offset)) assetSql += `\n OFFSET ${args.offset}`;
    if (!_.isNil(args.limit)) assetSql += `\n LIMIT ${args.limit}`;

    try {
      const data = await dbRead.map(assetSql, sqlArgs, mapper.mapAsset);
      const result = await mainUtil.toPage(args, data);

      // emit event for accessing media
      _emitPublicEventAccessMedia(context, _.get(result, 'records'), 'asset');

      return result;
    } catch (e) {
      _emitPublicEventAccessMedia(context, { ...args, status: 'failure' }, 'asset', e);
      logger.error('Error when get assets', e);
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
      const errorCode = _.get(e, 'data.internalData.code');

      // catch the recording_asset partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // only create the recording_asset partition table if it's within the last month or newer
        const isValid = await validateRecordingAssetTablePartition(
          moment.utc(),
          {
            partitionName: assetTable
          }
        );

        if (isValid) {
          // retry to get assets
          const data = await dbRead.map(assetSql, sqlArgs, mapper.mapAsset);
          return mainUtil.toPage(args, data);
        }
      }

      throw e;
    }
  }

  // Get list of assets without restriction by tdoId
  // This leverages the asset-* elasticsearch indexes
  async function getAssetList(context, args) {
    // filter callers assets:
    if (!args.applicationId) {
      throw new errors.NotAllowed({
        message: 'This query is not allowed for not organization scoped tokens',
        data: {
          objectType: 'assetList'
        }
      });
    }
    const filters = [
      {
        term: {
          ownerApplicationId: args.applicationId
        }
      }
    ];
    // set field filters:
    const argMap = {
      ids: '_id',
      contentTypes: 'contentType',
      assetTypes: 'assetType',
      sourceEngineIds: 'sourceEngineId'
    };
    for (const argName in argMap) {
      if (
        Object.hasOwnProperty.call(argMap, argName) &&
        Object.hasOwnProperty.call(args, argName)
      ) {
        const argVal = args[argName];
        if (Array.isArray(argVal) && !_.isEmpty(argVal)) {
          filters.push({
            terms: _.set({}, argMap[argName], argVal)
          });
        }
      }
    }

    // set createdDate filter
    if (
      args.createdDateFilter &&
      (args.createdDateFilter.fromDateTime || args.createdDateFilter.toDateTime)
    ) {
      const rangeFilter = {};
      if (args.createdDateFilter.fromDateTime) {
        const op = args.createdDateFilter.fromDateTimeExclusive ? 'gt' : 'gte';
        _.set(
          rangeFilter,
          op,
          moment(args.createdDateFilter.fromDateTime).toISOString()
        );
      }
      if (args.createdDateFilter.toDateTime) {
        const op = args.createdDateFilter.toDateTimeExclusive ? 'lt' : 'lte';
        _.set(
          rangeFilter,
          op,
          moment(args.createdDateFilter.toDateTime).toISOString()
        );
      }
      filters.push({
        range: {
          createdDateTime: rangeFilter
        }
      });
    }

    // if scrollId is passed in: parse and use for search_after
    // else add forward the request offset to elasticsearch
    let scrollData;
    if (!_.isEmpty(args.scrollId)) {
      try {
        scrollData = JSON.parse(
          Buffer.from(args.scrollId, 'base64').toString()
        );
      } catch (err) {
        throw new errors.InvalidInput({
          message: 'The scrollId is invalid',
          data: {
            objectId: args.scrollId,
            objectType: 'ScrollId'
          }
        });
      }
    }
    const body = {
      query: {
        bool: {
          must: filters
        }
      },
      sort: [{ createdDateTime: 'desc' }],
      _source: ['_id', 'recordingId']
    };

    const request = {
      index: 'asset-*',
      body,
      size: args.limit
    };
    if (scrollData) {
      body.search_after = scrollData;
    } else {
      // elasticSearch limit
      if (args.offset + args.limit >= 10000) {
        throw new errors.InvalidInput({
          message:
            'Maximum allowed paging via offset is limited to 10000 results. Use scrollId instead',
          data: {
            objectId: args.offset,
            objectType: 'offset'
          }
        });
      }
      request.from = args.offset;
    }

    const results = await esClient.search(request);
    const esResults = _.get(results, 'body.hits.hits', []);
    const assets = await esResults.map((h) => ({
      id: h._id,
      containerId: h._source.recordingId
    }));
    _emitPublicEventAccessMedia(context, assets, 'asset');

    let newScrollId = '';
    const sortData = _.get(_.last(esResults), 'sort');
    if (sortData) {
      newScrollId = Buffer.from(JSON.stringify(sortData)).toString('base64');
    }
    return {
      assets,
      scrollId: newScrollId
    };
  }

  async function validateRecordingAssetTablePartition(dateMoment, options) {
    dateMoment = dateMoment || moment.utc();
    const startDate = moment.utc(dateMoment).startOf('isoWeek');
    const endDate = moment.utc(dateMoment).endOf('isoWeek');
    const { partitionName } = options || {};
    let shouldCreateTable = true;

    if (partitionName) {
      const partitionDate = util.parseDateFromPartitionTable(
        partitionName,
        'recording_asset'
      );

      if (_.isNil(partitionDate)) {
        shouldCreateTable = false;
      } else {
        const now = moment();
        const maxMonthsToCreateOldPartition = _.get(
          config,
          'maxMonthsToCreateOldPartition',
          1
        );
        // should create partition if it's within the last month or newer
        shouldCreateTable =
          now.diff(partitionDate, 'months') <= maxMonthsToCreateOldPartition;
      }
    }

    if (shouldCreateTable) {
      await dalPartitionGenerator.createRecordingAssetPartitions(
        startDate,
        endDate
      );
    }

    return shouldCreateTable;
  }

  function checkAssetTypeAndContentType(assetType, contentType) {
    const validContentTypes = assetTypeContentType[assetType];
    if (!validContentTypes) {
      logger.warn(
        `New assetType used to create asset. assetType: ${assetType}, contentType: ${contentType}`
      );
      return;
    }

    const isValid = validContentTypes.some((type) => type.test(contentType));
    if (!isValid) {
      const message = `Invalid contentType for the assetType. assetType: ${assetType}; contentType: ${contentType}`;
      logger.warn(message);
    }
  }

  /**
   * emit access_media event
   * @param {*} context the context
   * @param {*} media the data of the media. It can be an item or an array
   * @param {*} mediaType type of the media. The default value is 'asset'
   * @param {*} error the error
   * @returns nothing
   */
  function _emitPublicEventAccessMedia(context, media, mediaType, error) {
    messageUtil.emitReadAuditEvent(context, media, mediaType || 'asset', error);
  }

  async function updateAssetUri(assetId, uri) {
    const tdoId = dateIdUtil.getRecordingIdFromAssetId(assetId);
    let recordingClause = '';
    const normalizedUri = stripAssetUriSignature(uri);
    const sqlArgs = [assetId, normalizedUri];

    if (tdoId) {
      sqlArgs.push(tdoId);
      recordingClause = `AND recording_id = $${sqlArgs.length} AND recording_id::bigint = $${sqlArgs.length}`;
    }

    const sql = `
UPDATE ${util.generateRecordingAssetPartition(tdoId)}
SET uri = $2
WHERE asset_id = $1 ${recordingClause}
RETURNING asset_id AS id, uri;
    `;

    const data = await serviceContext.dbConnections['core'].write.map(
      sql,
      sqlArgs,
      mapper.mapAsset
    );

    if (!data || !data.length) {
      throw new errors.NotFound({
        message: 'The updated asset could not be retrieved. It may have been deleted as part of a race condition.',
        data: { objectId: assetId, objectType: 'Asset' }
      });
    }
    return data[0];
  }

  return {
    checkAssetTypeAndContentType, // for unit test
    createAsset,
    resolveContentType, // for unit test
    createAssetAuthorized,
    deleteAsset,
    deleteAssetStorage,
    updateAsset,
    updateAssetUri,
    signAssetUri,
    getAsset,
    getAssets,
    getAssetList,
    isOurBucket,
    emitRecordingCognitionCompletedEvent,
    addStopTimeUpdateSql,
    buildStopTimeUpdateSql,
    updateMediaTableStopTime,
    uploadEngineResult,
    updateAssetSize,
    updateAssetSizeError,
    updateAssetSizeExternal,
    getStopDateTimeMoment,
    validateRecordingAssetTablePartition,
    setAssetStorageTags
  };
};