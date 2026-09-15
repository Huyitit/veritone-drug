const _ = require('lodash');
const mediaDuration = require('../util/mediaDuration.js');

module.exports = function createFunction(serviceContext) {
  const { logger } = serviceContext.app;
  const util = require('./util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  // this is the request-level resolver cache
  const cache = require('./cache.js')(serviceContext);
  // this is the in-memory cross-request cache
  const localCache = serviceContext.localCache;

  const virtualAssetEnabled = _.get(
    serviceContext,
    'config.featureFlags.virtualAssetEnabled',
    false
  );

  /*
list from dev of content types used as of 3/5/2019
content_type            |count  |
------------------------|-------|
application/json        |370753 |
application/octet-strea |22     |
application/ttml+xml    |110821 |
application/zip         |2      |
audio/mp3               |29     |
audio/mp4               |710476 |
audio/mpeg              |108411 |
audio/wav               |14     |
audio/wave              |97     |
audio/x-m4a             |1      |
audio/x-wav             |14     |
image/jpeg              |9532   |
image/png               |18     |
image/tiff              |4      |
text/csv                |15     |
text/plain              |487    |
video/3gpp              |1      |
video/jpg               |1      |
video/mp4               |148076 |
video/quicktime         |4      |
video/webm              |2      |
video/x-m4v             |1      |
video/x-msvideo         |2      |
video/x-ms-wmv          |2      |
*/
  const allowedTransformContentTypes = _.get(
    serviceContext,
    'allowedTransformContentTypes',
    [
      'application/json',
      'application/xml',
      'application/ttml+xml',
      'text/plain',
      'text/csv'
    ]
  );
  function checkContentType(object) {
    if (!object.contentType) {
      throw new errors.InvalidInput({
        message: 'An asset without a known content type cannot be transformed.',
        data: {
          objectType: 'Asset',
          objectId: object.id,
          assetType: object.assetType
        }
      });
    }
    let found = false;
    const contentType = object.contentType.toLowerCase();
    allowedTransformContentTypes.forEach((type) => {
      // note that the incoming content type may or may not have an encoding
      // appended to it. so we need startsWith rather than an exact match.
      if (contentType.startsWith(type)) found = true;
    });
    if (!found) {
      throw new errors.InvalidInput({
        message:
          'The asset could not be transformed because it does not have a compatible content type.',
        data: {
          objectType: 'Asset',
          objectId: object.id,
          assetType: object.assetType,
          contentType,
          allowedContentTypes: allowedTransformContentTypes
        }
      });
    }
  }

  return {
    signedUri: async (object, _args, context) => {
      const uri = object.uri || object._uri;
      if (!uri) {
        return uri;
      }
      // Only the asset's OWN recorded filename is used. The parent
      // recording's veritoneFile name is deliberately NOT a fallback — it
      // describes the recording's media file and would mislabel other asset
      // types. Assets without a deterministic name get asset_id.<ext by best
      // mimetype match> from the shared derivation
      // (@veritone/core-server-base/assetFilename). VE-26469
      const fileName = _.get(object, 'metadata.fileName');
      if (!virtualAssetEnabled) {
        return util.getSignedUrl(uri, null, fileName);
      }

      return util.getVirtualSignedUri(
        uri,
        null,
        {
          id: object.id || object.assetId,
          type: 'Asset',
          fileName,
          // Feeds the assetId.<ext> filename fallback when the asset has no
          // recorded filename. VE-26469
          contentType: object.contentType,
          details: {
            parentId: object.containerId || object.recordingId
          },
          userId: _.get(
            context,
            '_authInfo.userId',
            _.get(context, 'tokenInfo.userId') || _.get(context, '_authInfo.applicationId')
          )
        }
      );
    },

    name: (data) => data.metadata.fileName,

    description: (data) => data.metadata.description,

    jsonstring: (object, args) =>
      JSON.stringify(object.metadata, null, args.indent),

    jsondata: (object) => object.jsondata || object.metadata,

    details: (object, args) => {
      const details = object.metadata.details;
      return args.path ? _.get(details, args.path) : details;
    },
    id: (object) => object.id || object.assetId,

    containerId: (object) => object.containerId || object.recordingId,

    uri: (object) => object.uri || object._uri,

    assetType: (object) => object.assetType || object.type,

    assetSize: (asset) => serviceContext.bll.asset.getAssetSize(asset),

    type: (object) => object.assetType || object.type,

    sourceData: (object) =>
      object.sourceData || {
        name: object.metadata.sourceName,
        taskId: object.metadata.sourceTaskId,
        sourceId: object.metadata.sourceId,
        // note that engine ID is mapped in AssetSourceData.js
        engineId: object.metadata.sourceEngineId || object.metadata.source,
        schemaId: object.metadata.schemaId
      },

    fileData: (object) => {
      return {
        md5sum: object.metadata.md5,
        sha256: object.metadata.sha256,
        size: object.metadata.size,
        originalFileUri: object.metadata.originalfileUri,
        // VE-26450: shared with the distributeAsset pre-flight duration check, which must compare against the
        // exact value this field reports. See util/mediaDuration.js for why the conversion is not inlined.
        mediaDurationMs: mediaDuration.secondsToMs(object.metadata.mediaDuration)
      };
    },

    container: (object, args, context) => {
      const _args = {
        id: object.containerId || object.recordingId
      };
      // here we are going to pull the container TDO from the persistent local
      // cache IF it was updated in the context of this request.
      const requestId = context.requestInfo.requestId;
      const applicationId = _.get(
        context,
        '_authInfo.groups[0].applicationId',
        _.get(context, '_authInfo.applicationId')
      );
      const key = serviceContext.dal.tdo.tdoCacheKey(_args, { applicationId });
      const cached = localCache.get('TemporalDataObject', key);
      if (cached && cached.__requestId === requestId) {
        return cached;
      }
      // otherwise fall back on the resolver-level cache
      return cache.get(context, _args, 'TemporalDataObject', () =>
        serviceContext.dal.tdo.getTDO(context, _args)
      );
    },
    transform: async function (object, args, context) {
      try {
        checkContentType(object);
      } catch (err) {
        if (
          _.get(
            serviceContext,
            'config.errorOnInvalidTransformContentType',
            false
          )
        ) {
          throw err;
        } else {
          // just log warning
          serviceContext.messageUtil.emitEvent({
            event: 'warning',
            errorName: 'invalid_transform_content_type',
            error: err
          });
          return ''; // return empty string
        }
      }
      const signedUri = await util.getSignedUrl(object.uri || object._uri);
      return util.transformAsset(context, signedUri, args.transformFunction);
    },

    createdDateTime: (obj) =>
      util.checkDateTime(obj.createdDateTime, obj.id || obj.assetId),
    modifiedDateTime: (obj) =>
      util.checkDateTime(obj.modifiedDateTime, obj.id || obj.assetId),

    isUserEdited: (object) => object.userEdited
  };
};