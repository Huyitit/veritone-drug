const crypto = require('crypto');
const fpl = require('@veritone/functional-permissions-lib');
const _ = require('lodash');
const amazonS3URI = require('amazon-s3-uri');
const uuid = require('uuid');
const URL = require('url-parse');
const http = require('http');
const https = require('https');
const bytes = require('bytes');
const prettyBytes = require('pretty-bytes');
const moment = require('moment');
const LRU = require('lru-cache');
const validator = require('validator');
const { getDirectives } = require('@graphql-tools/utils');
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const {
  appendFilenameSegment
} = require('@veritone/core-server-base/assetFilename');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')();
  const dalUtil = require('../dal/util.js')(config, serviceContext);
  const httpUtil = require('../util/httpUtil.js')(serviceContext);
  const { isSignedUrl } = require('@veritone/core-server-base/storage.shim')(
    config
  );

  const signedWritableUrlOverride = _.get(
    config,
    'featureFlags.signedWritableUrlOverride',
    false
  );

  const signedUrlOverrideEngines = _.get(
    config,
    'signedUrlOverrideEngines',
    []
  );

  const azureBlobEnabled = _.get(config, 'azure_blob.enabled', false);
  const ociEnabled = _.get(config, 'oci.enabled', false);

  if (http.globalAgent) {
    http.globalAgent.maxSockets = _.get(config, 'httpPools.maxSockets', 100);
  }

  const metrics = serviceContext.metrics;
  // we enable error checking for weird AWS signing failures only on our environments,
  // not on-prem with minio, azure, or oracle.
  const awsURLErrorFallbackEnabled =
    (_.get(serviceContext, 'config.minio.enabled', false) ||
      _.get(serviceContext, 'config.azure_blob.enabled', false) ||
      _.get(serviceContext, 'config.oci.enabled', false)) === false;

  // get a max asset size for the transform function.
  // this is based on the global response size limit.
  // if any single transform would push the response size past the limit,
  // we bail out immediately.
  const maxAssetTransformLength = bytes.parse(
    _.get(config, 'server.responseSizeLimit', '100mb')
  );

  const responseSizeLimit = bytes.parse(
    _.get(config, 'server.responseSizeLimit', '100mb')
  );

  function getBucket(uri) {
    return httpUtil.getBucket(uri);
  }

  function isOurBucket(uri) {
    return httpUtil.isOurBucket(uri);
  }

  function stripOwnedStorageUrlSignature(url) {
    // Strip the signature of the storage uri of it matches one of our buckets.
    // A new signed url will be created when requested.
    // If the passed in value is not a string (ex. null) return as-is.
    return _.isString(url) && isOurBucket(url) ? url.split('?')[0] : url;
  }

  const MAX_ALLOWED_URL_ERRORS_10S = 10000;

  // VE-26806: config-gap logs are warn-once-per-bucket. Where a container is
  // known only via the top-level s3.bucket, the legacy fallthrough below is
  // the steady-state path for every asset in that container — a per-call warn
  // would flood the log pipeline and drown the very triage signal it exists
  // to provide. Repeats are still visible at debug level.
  const signingConfigGapWarned = new Set();
  function logSigningConfigGap(configKey, message) {
    if (signingConfigGapWarned.has(configKey)) {
      serviceContext.logger.debug(message);
      return;
    }
    signingConfigGapWarned.add(configKey);
    serviceContext.logger.warn(message);
  }

  /**
   * Signs s3 objects only in buckets that are defined in config
   * @param uri
   * @param bucket
   * @param filename
   * @returns string
   */
  async function getSignedUrl(uri, bucket, filename) {
    const res = await getSignedUrlExp(uri, bucket, filename);
    return res.url;
  }

  async function getSignedUrlExp(uri, bucket, filename, startDate) {
    if (_.isEmpty(uri) || _.isNil(uri)) {
      return { url: uri };
    }

    if (!isOurBucket(uri)) return { url: uri };

    // VTN-33455 resign if uri is already signed.
    const baseUri = isSignedUrl(uri) ? uri.split('?')[0] : uri;

    const configKey = bucket || getBucket(baseUri);
    if (!configKey) return { url: uri };

    // `s3Buckets` is keyed by primary bucket key/name only and holds the storage
    // shim used below to sign. A fallback-bucket URI (e.g. an AWS bucket behind
    // an OCI primary) resolves to a configKey that has no s3Buckets entry and no
    // shim, so it cannot be signed here. The bucket-aware presigner knows the
    // fallback config (getBucketConfig) and signs it correctly — including the
    // fallback→primary HEAD-check migration — so delegate to it.
    // @sminkov — VE-24702 (OCI storage / virtual assets)
    if (!mainUtil.get(serviceContext, ['s3Buckets', `${configKey}`])) {
      const presigner = require('../util/presigner.s3.buckets.js').getInstance();
      const bucketConf = presigner && presigner.getBucketConfig(configKey);
      if (bucketConf) {
        let ttl = bucketConf.signedUrlExpires || 3600;
        if (startDate) {
          ttl -= Math.ceil((Date.now() - startDate) / 1000);
          if (ttl <= 0) return { url: uri, ttl: 0 };
        }
        // VE-27981: pass the raw filename — the presigner normalizes it and
        // stamps response-content-disposition the same way the legacy shim
        // path below does (the normalization further down only feeds the shim).
        const url = await presigner.presignUrl(baseUri, {
          ttl,
          fileName: filename
        });
        return { url, ttl };
      }
      // VE-26806: no presigner config either. Containers known only via the
      // top-level s3.bucket / azure_blob.container (never listed in
      // s3.buckets[]) land here — before VE-24702 they fell through to the
      // legacy path below, whose default `api` shim signs any owned locator.
      // Returning the URI unsigned instead made those assets undownloadable,
      // so restore the fallthrough whenever the default shim exists. Either
      // way, warn on the config gap (configKey only, never the URI — VE-26276)
      // so missing s3.buckets entries surface in triage instead of silently.
      if (!mainUtil.get(serviceContext, ['s3Buckets', 'api', 'storage'])) {
        logSigningConfigGap(
          configKey,
          `getSignedUrlExp: bucket "${configKey}" is not resolvable by the ` +
            'presigner or any storage shim; returning URI unsigned'
        );
        return { url: uri };
      }
      logSigningConfigGap(
        configKey,
        `getSignedUrlExp: no presigner config for bucket "${configKey}"; ` +
          'falling through to the legacy storage shim'
      );
    }

    const config = mainUtil.get(
      serviceContext,
      ['s3Buckets', `${configKey}`, 's3'],
      {}
    );
    const storage = mainUtil.get(
      serviceContext,
      ['s3Buckets', `${configKey}`, 'storage'],
      serviceContext.s3Buckets.api.storage
    );
    let expiresSec = config.signedUrlExpires || 3600;
    if (filename) {
      filename = encodeURI(filename);
      let filenameSplit = filename.split('.');
      if (filenameSplit.length === 1) {
        // Only borrow an extension from the URI's LAST path segment. Without
        // the position check, a key with no extension makes lastIndexOf('.')
        // land on the hostname's dot and splices the whole tail of the URI
        // into the download filename ("MyExport" -> "MyExport.com/bk/123/..."),
        // and a URI with no dot at all returns -1, where substring(-1) yields
        // the entire string. Reachable for any caller whose filename has no
        // extension; VE-26306 made every generated key extensionless, which
        // turned this from an edge case into the default path.
        const lastDot = baseUri.lastIndexOf('.');
        if (lastDot > baseUri.lastIndexOf('/')) {
          filename += baseUri.substring(lastDot);
        }
      }
    }

    if (startDate) {
      // subtract the time that has already passed since the url was created
      expiresSec -= Math.ceil((Date.now() - startDate) / 1000);
      if (expiresSec <= 0) {
        return { url: uri, ttl: 0 };
      }
    }

    let res = await storage.getSignedUrlPromise(baseUri, expiresSec, filename);

    // VTN-11079 builds on VTN-8242.
    // determine if circuit breaker is closed (have not exceeded max allowed errors)
    // or closed (max errors over 10s exceeded; don't wait and retry for a while)
    let doRetry =
      metrics.getValue('awsURLSignError10Sec') < MAX_ALLOWED_URL_ERRORS_10S;

    // detect if the URL was not actually signed
    // note that isRealSignedUrl only fails if enabledAWSUrlSignErrorHandling is enabled.
    // on-prem we'll just skip this whole part.
    if (!isRealSignedUrl(res)) {
      // increment metrics
      metrics.incrementCounter('awsURLSignError');
      metrics.incrementGauge('awsURLSignError10Sec');

      // if our circuit breaker is closed, retry
      if (doRetry) {
        // sleep small period
        await mainUtil.sleep(50);
        // now try again
        res = await storage.getSignedUrlPromise(baseUri, expiresSec, filename);
      } else {
        serviceContext.logger.debug('AWS URL sign error circuit breaker OPEN!');
      }
    }

    // if it still wasn't signed, but we can retry, do so.
    if (!isRealSignedUrl(res) && doRetry) {
      metrics.incrementCounter('awsURLSignError');
      metrics.incrementGauge('awsURLSignError10Sec');
      // sleep a longer period this time
      await mainUtil.sleep(100);
      res = await storage.getSignedUrlPromise(baseUri, expiresSec, filename);
    }
    // if we could not get a real URL, throw out.
    if (!isRealSignedUrl(res)) {
      throw new errors.InternalServerError({
        message:
          'The server was unable to generate a valid signed URL ' +
          'due to an temporary internal error. Retry the request again to ' +
          'continue. If the problem persists, please contact Veritone support ' +
          'and include this entire error payload.',
        data: {
          errorCode: 2088,
          result: res
        }
      });
    }
    return { url: res, ttl: expiresSec };
  }


  // Virtual asset uri utilities
  const VIRTUAL_ASSET_KEY_PREFIX = {
    asset: 'vA',
    Asset: 'vA'
  };
  const getVirtualAssetKey = (id, type) => {
    // 10 min. window where any request for a virtual asset will hit the same key
    const window = Math.floor(Date.now() / 600000) * 600000;
    const prefix = VIRTUAL_ASSET_KEY_PREFIX[type] || VIRTUAL_ASSET_KEY_PREFIX[type?.toLowerCase()] || 'v';
    return `${prefix}:${id}:${window}`;
  };

  const virtualAssetJwtSecret = _.get(config, 'virtualAsset.jwt.secret') || _.get(config, 'jwt.secret');

  const apiRoot = _.get(config, 'apiRoot');
  const apiVersionPath = _.get(config, 'apiVersionPath', '') || '';

  const virtualAssetEndpoint = `${apiRoot}${apiVersionPath}/${_.get(
    config,
    'virtualAssetEndpoint',
    'asset'
  )}`;

  const getVirtualAssetUri = (id) => {
    return `${virtualAssetEndpoint}/${id}`;
  }

  // Stateless virtual-asset minter (Redis-less; the JWT itself carries the
  // storage pointer and is signed on redirect by routes/virtualAsset.js's
  // `/asset-static` route). Shared with core-search/core-admin via the same lib
  // so every service emits the same URI shape. Gated by the virtualAssetEnabled
  // feature flag; built once at init and reused.
  // @sminkov — VE-24702 (OCI storage / virtual assets)
  const virtualAssetEnabled = _.get(
    config,
    'featureFlags.virtualAssetEnabled',
    false
  );
  let virtualAssetMinter = null;
  if (virtualAssetEnabled) {
    try {
      virtualAssetMinter = require('@veritone/core-server-base/virtualAsset')({
        config
      });
    } catch (err) {
      serviceContext.logger.warn(
        `Failed to init stateless virtual-asset minter; falling back to ` +
          `in-place signing: ${err.message}`
      );
    }
  }

  /**
   * Delivery URL for a storage URI. When the virtualAssetEnabled flag is on,
   * returns a stateless virtual-asset URI (signed on redirect by graphql's
   * /asset-static route); otherwise signs in place via getSignedUrl. Empty,
   * external, or non-bucket URIs pass through unchanged via getSignedUrl.
   * Mirrors the gate used by core-search (util/storage.js) and core-admin
   * (bll/deliveryUrl.js) so all services emit the same representation.
   *
   * The filename travels in the token's claims and the stateless /asset-static
   * route stamps it as a content-disposition attachment (VE-27981), matching
   * getSignedUrl's download-filename behavior.
   * @sminkov — VE-24702 (OCI storage / virtual assets)
   */
  async function getSignedUrlOrVirtual(uri, bucket, filename) {
    if (
      virtualAssetEnabled &&
      virtualAssetMinter &&
      !_.isEmpty(uri) &&
      isOurBucket(uri)
    ) {
      try {
        return virtualAssetMinter.mintStatelessVirtualAssetUri(
          uri,
          bucket || null,
          filename ? { fileName: filename } : {}
        );
      } catch (err) {
        serviceContext.logger.warn(
          `Failed to mint stateless virtual asset URI; signing in place: ${err.message}`
        );
      }
    }
    return getSignedUrl(uri, bucket, filename);
  }

  // Create a virtual asset signed uri
  async function getVirtualSignedUri(uri, bucket, { id, type, fileName, contentType, details, userId }) {
    // 1. validate uri and bucket
    if (_.isEmpty(uri) || _.isNil(uri)) {
      return uri;
    }

    // VTN-33455 resign if uri is already signed.
    const baseUri = isSignedUrl(uri) ? uri.split('?')[0] : uri;

    // Determine TTL from bucket config. The presigner knows both primary and
    // fallback buckets, so use it when available; otherwise fall back to the
    // legacy s3Buckets config path.
    let expiresSec = 3600;
    const presigner = require('../util/presigner.s3.buckets.js').getInstance();
    const configKey = bucket || getBucket(baseUri);
    if (presigner) {
      const bucketConf = presigner.getBucketConfig(configKey);
      if (bucketConf) {
        expiresSec = bucketConf.signedUrlExpires || 3600;
      }
    }
    if (expiresSec === 3600 && configKey) {
      const legacyConfig = mainUtil.get(
        serviceContext,
        ['s3Buckets', `${configKey}`, 's3'],
        {}
      );
      if (legacyConfig.signedUrlExpires) {
        expiresSec = legacyConfig.signedUrlExpires;
      }
    }

    // 2. Store the details to get actual signed uri in redis
    try {
      const virtualId = getVirtualAssetKey(id, type);
      const payload = {
        u: baseUri,
        i: id,
        f: fileName,
        d: details,
        c: Date.now()
      };
      if (bucket) {
        payload.b = bucket;
      }
      const serialized = JSON.stringify(payload);
      await promisify(serviceContext.redisClient.set).bind(serviceContext.redisClient)(virtualId, serialized, 'EX', expiresSec);

      const jwtPayload = { id: virtualId };
      if (userId) {
        jwtPayload.u = mainUtil.encryptText(userId, virtualAssetJwtSecret);
      }

      // 3. Create a signed token for the virtual asset
      const token = jwt.sign(
        jwtPayload,
        virtualAssetJwtSecret,
        {
          expiresIn: expiresSec,
        }
      );

      // Track virtual asset creation
      if (serviceContext.metricsCounters && serviceContext.metricsCounters.virtualAssetCreatedTotal) {
        serviceContext.metricsCounters.virtualAssetCreatedTotal.inc();
      }

      // Trailing filename segment for engines that save by URL basename;
      // empty derivation keeps the old JWT-terminated form. Shared derivation
      // with the core-server-base minters — lock-step URI shape. VE-26469
      return appendFilenameSegment(getVirtualAssetUri(token), {
        fileName,
        assetId: id,
        contentType,
        uri: baseUri
      });
    }
    catch (err) {
      serviceContext.logger.error('Failed to generate virtual signed Uri', err, baseUri);
      throw new errors.InternalServerError({
        message: 'Failed to create virtual signed uri',
        data: {
          err
        }
      });
    }
  }

  // Get a virtual asset data from redis
  async function getVirtualAssetFromRedis(key) {
    return new Promise((resolve, reject) => {
      serviceContext.redisClient.get(key, (err, value) => {
        if (err) return reject(err);
        resolve(value);
      });
    });
  }


  // Get a virtual asset uri details
  async function getAssetUriFromVirtualId(virtualId) {
    try {
      const payload = await getVirtualAssetFromRedis(virtualId);
      if (!payload) {
        throw new errors.NotFound({
          message: 'Virtual asset not found.',
          data: {
            virtualId
          }
        });
      }
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      return {
        uri: parsed.u,
        id: parsed.i,
        fileName: parsed.f,
        details: parsed.d,
        bucket: parsed.b,
        createdAt: parsed.c,
        signedUrl: parsed.s,
        expiresAt: parsed.e
      };
    } catch (err) {
      if (err instanceof errors.NotFound) {
        throw err;
      }
      throw new errors.InternalServerError({
        message: 'Failed to get virtual asset.',
        data: {
          virtualId,
          error: err.message
        }
      });
    }
  }

  // Resolve a virtual asset uri to a signed uri
  async function resolveVirtualAssetUri(vId, assetReq) {
    if (!vId) {
      throw new errors.InvalidInput({
        message: 'Virtual asset id is required.',
        data: {
          vId
        }
      });
    }
    try {
      if (!assetReq) {
        assetReq = await getAssetUriFromVirtualId(vId);
      }
      const { uri, bucket, fileName, details, createdAt } = assetReq;

      // Calculate remaining TTL based on when the virtual asset was created
      const presignerInstance = require('../util/presigner.s3.buckets.js').getInstance();
      const resolvedBucket = bucket || getBucket(uri);
      let baseTtl = 3600;
      if (presignerInstance) {
        const bucketConf = presignerInstance.getBucketConfig(resolvedBucket);
        if (bucketConf) {
          baseTtl = bucketConf.signedUrlExpires || 3600;
        }
      }
      if (baseTtl === 3600 && resolvedBucket) {
        const legacyConfig = mainUtil.get(serviceContext, ['s3Buckets', `${resolvedBucket}`, 's3'], {});
        if (legacyConfig.signedUrlExpires) baseTtl = legacyConfig.signedUrlExpires;
      }
      let expiresSec = baseTtl - Math.ceil((Date.now() - createdAt) / 1000);

      if (expiresSec <= 0) {
        serviceContext.redisClient.del(vId);
        throw new errors.InvalidInput({
          message: 'Virtual asset uri has expired.',
          data: {
            vId
          }
        });
      }

      const presigner = require('../util/presigner.s3.buckets.js').getInstance();
      const url = await presigner.presignUrl(uri, {
        ttl: expiresSec,
        // VE-27981: the payload has carried the asset's filename all along —
        // stamp it back onto the presigned URL as a content-disposition
        // attachment, matching the pre-virtual-asset signing path.
        fileName,
        onPrimaryHit: async (originalUri, primaryUri, key) => {
          if (serviceContext.dal.asset.updateAssetUri) {
            try {
              await serviceContext.dal.asset.updateAssetUri(assetReq.id, primaryUri);
              // Track DB record promotion
              if (serviceContext.metricsCounters && serviceContext.metricsCounters.assetUriPromotedTotal) {
                serviceContext.metricsCounters.assetUriPromotedTotal.inc();
              }
            } catch (promoteErr) {
              serviceContext.logger.error('Failed to promote asset URI', promoteErr, { assetId: assetReq.id });
              if (serviceContext.metricsCounters && serviceContext.metricsCounters.assetUriPromotionErrorTotal) {
                serviceContext.metricsCounters.assetUriPromotionErrorTotal.inc();
              }
            }
          } else {
            serviceContext.logger.warn('updateAssetUri function not found on dal.asset');
          }
        }
      });
      // Cache the resolved signed URL back into redis so subsequent
      // GET/HEAD requests within the TTL window reuse it without
      // re-signing.
      const updatedPayload = {
        u: uri,
        i: assetReq.id,
        f: fileName,
        d: details,
        b: bucket || undefined,
        c: createdAt,
        s: url,
        e: Date.now() + (expiresSec * 1000)
      };
      const serialized = JSON.stringify(updatedPayload);

      await promisify(serviceContext.redisClient.set).bind(serviceContext.redisClient)(vId, serialized, 'EX', expiresSec);

      return url;
    } catch (err) {
      if (err instanceof errors.NotFound) {
        throw err;
      }
      throw new errors.InternalServerError({
        message: 'Failed to resolve virtual asset uri.',
        data: {
          vId,
          error: err.message
        }
      });
    }
  }

  function isRealSignedUrl(url) {
    return (
      url &&
      (url.includes('X-Amz') ||
        !awsURLErrorFallbackEnabled ||
        signedWritableUrlOverride)
    );
  }

  async function getSignedWritableUrls(serviceContext, context, args) {
    const num = args.number;
    if (num > 1000) {
      throw new errors.InvalidInput({
        message: 'A maximum of 1000 signed URLs can be requested at one time.',
        data: {
          number: args.number,
          query: 'getSignedWritableUrls'
        }
      });
    }
    const res = [];
    context._signedUrlNow = moment();
    for (let i = 0; i < num; i++) {
      const url = await getSignedWritableUrl(serviceContext, context, args);
      res.push(url);
    }
    return res;
  }

  async function getSignedWritableUrl(serviceContext, context, args) {
    // horrible hack. see VTN-8242. sometimes the AWS SDK returns a broken
    // URL that has only hostname and no bucket, object, or signature.
    // here we attempt to work around it by detecting the bad URL, waiting
    // a short time, and retrying. if one retry fails, throw out with
    // a clean error instead of returning an unusable URL.
    let res = await internalGetSignedWritableUrl(serviceContext, context, args);

    // VTN-11079 builds on VTN-8242.
    // see getSignedUrl for details on this logic.
    let doRetry =
      metrics.getValue('awsURLSignError10Sec') < MAX_ALLOWED_URL_ERRORS_10S;

    if (!(isRealSignedUrl(res.url) && isRealSignedUrl(res.getUrl))) {
      // increment metrics
      metrics.incrementCounter('awsURLSignError');
      metrics.incrementGauge('awsURLSignError10Sec');
      if (doRetry) {
        await mainUtil.sleep(100);
        res = await internalGetSignedWritableUrl(serviceContext, context, args);
      } else {
        serviceContext.logger.debug('AWS URL sign error circuit breaker OPEN!');
      }
    }
    if (!(isRealSignedUrl(res.url) && isRealSignedUrl(res.getUrl)) && doRetry) {
      // increment metrics
      metrics.incrementCounter('awsURLSignError');
      metrics.incrementGauge('awsURLSignError10Sec');
      await mainUtil.sleep(100);
      res = await internalGetSignedWritableUrl(serviceContext, context, args);
    }

    if (!(isRealSignedUrl(res.url) && isRealSignedUrl(res.getUrl))) {
      throw new errors.InternalServerError({
        message:
          'The server was unable to generate a valid signed URL ' +
          'due to an temporary internal error. Retry the request again to ' +
          'continue. If the problem persists, please contact Veritone support ' +
          'and include this entire error payload.',
        data: {
          errorCode: 2087,
          result: res
        }
      });
    }
    return res;
  }

  // Asset types getSignedWritableAssetUrl may issue a writable URL for. Kept as
  // an explicit allowlist so widening it is a deliberate, reviewable change.
  const WRITABLE_ASSET_TYPES = ['media-mdp'];
  const WRITABLE_ASSET_URL_DEFAULT_EXPIRES = 900; // 15 min
  const WRITABLE_ASSET_URL_MAX_EXPIRES = 3600; // 1 hr
  const WRITABLE_ASSET_URL_MIN_EXPIRES = 60;

  // Parse a non-S3 (minio/azure path-style) URI into { bucket, key }.
  function parseNonS3Uri(uri) {
    const parsed = new URL(decodeURIComponent(uri));
    const pathname = parsed.pathname || '';
    const index = pathname.indexOf('/', 1);
    if (index === -1) {
      return { bucket: pathname.substring(1), key: undefined };
    }
    return {
      bucket: pathname.substring(1, index),
      key: pathname.substring(index + 1)
    };
  }

  // Issue a short-lived signed PUT URL to overwrite an EXISTING asset in place.
  // The destination bucket + key are derived server-side from the persisted
  // asset (never from client input) and confined to our managed buckets, so a
  // caller cannot use this to write to an arbitrary location. Restricted to
  // internal service tokens and media-mdp assets for now. See VE-25082.
  async function getSignedWritableAssetUrl(serviceContext, context, args) {
    // 1. internal-only: this grants write capability against an existing
    //    object, so only platform components (e.g. core-eventing) may call it.
    if (!mainUtil.isInternalAPIKey(context._authInfo)) {
      throw new errors.AuthorizationError({
        message: 'getSignedWritableAssetUrl requires an internal service token'
      });
    }

    const { assetId } = args;
    if (!assetId) {
      throw new errors.InvalidInput({ message: 'assetId is required' });
    }
    // 2. virtual/fake assets have no real backing object to overwrite
    if (mainUtil.isFakeMediaAssetId(assetId)) {
      throw new errors.InvalidInput({
        message: 'Cannot issue a writable URL for a virtual asset',
        data: { assetId }
      });
    }

    // 3. load the persisted asset — the sole source of truth for the destination
    const asset = await serviceContext.dal.asset.getAsset(context, {
      id: assetId
    });
    if (!asset || !asset.uri) {
      throw new errors.NotFound({
        message: `Asset ${assetId} not found`,
        data: { assetId }
      });
    }

    // 4. asset-type allowlist
    const assetType = asset.assetType || asset.type;
    if (!WRITABLE_ASSET_TYPES.includes(assetType)) {
      throw new errors.NotAllowed({
        message: `Writable URLs are not permitted for asset type "${assetType}"`,
        data: { assetId, assetType }
      });
    }

    // 5. destination must resolve to one of our managed buckets
    if (!isOurBucket(asset.uri)) {
      throw new errors.NotAllowed({
        message: 'Asset is not stored in a managed bucket',
        data: { assetId }
      });
    }
    const parsed = serviceContext.storage.isAmazonS3Uri(asset.uri)
      ? amazonS3URI(asset.uri)
      : parseNonS3Uri(asset.uri);
    const bucket = parsed.bucket;
    const key = parsed.key;
    if (!bucket || !key) {
      throw new errors.InternalServerError({
        message: 'Unable to parse asset URI into bucket and key',
        data: { assetId }
      });
    }
    // select the signer that owns this bucket (its own creds/region)
    const bucketEntry = _.get(serviceContext, ['s3Buckets', bucket]);
    if (!bucketEntry || !bucketEntry.storage) {
      throw new errors.NotAllowed({
        message: 'Asset bucket is not managed by this service',
        data: { assetId, bucket }
      });
    }

    // 6. bound the expiry — a presigned URL is a bearer credential, and its
    //    real lifetime is also capped by the signer's credentials.
    let expires = _.get(
      bucketEntry,
      's3.signedUrlExpires',
      WRITABLE_ASSET_URL_DEFAULT_EXPIRES
    );
    if (_.get(args, 'expiresInSeconds', 0) > 0) {
      const requested = _.isString(args.expiresInSeconds)
        ? parseInt(args.expiresInSeconds, 10)
        : args.expiresInSeconds;
      if (!_.isFinite(requested)) {
        throw new errors.InvalidInput({
          message: 'expiresInSeconds must be an integer',
          data: { expiresInSeconds: args.expiresInSeconds }
        });
      }
      expires = requested;
    }
    expires = Math.min(
      Math.max(expires, WRITABLE_ASSET_URL_MIN_EXPIRES),
      WRITABLE_ASSET_URL_MAX_EXPIRES
    );

    // 7. pin content type + SSE into the signature so the PUT cannot smuggle a
    //    different content type and satisfies SSE-enforcing bucket policies.
    const contentType = asset.contentType || 'application/json';
    const serverSideEncryption = _.get(bucketEntry, 's3.encryption')
      ? 'AES256'
      : null;

    const url = await bucketEntry.storage.getSignedWritableUrlPromise(
      key,
      bucket,
      expires,
      { contentType, serverSideEncryption }
    );

    // 8. audit the issuance (a write capability was granted)
    // Currently no-op since non internal keys are rejected at the top.
    // This is for future-proofing in case/when we allow regular users to call getSignedWritableAssetUrl.
    if (!mainUtil.isInternalAPIKey(context._authInfo)) {
      auditWritableAssetUrl(serviceContext, context, {
        assetId,
        assetType,
        bucket,
        key,
        expires
      });
    }

    return {
      url,
      bucket,
      key,
      contentType,
      serverSideEncryption,
      expiresInSeconds: expires
    };
  }

  function auditWritableAssetUrl(serviceContext, context, info) {
    const userId = _.get(context, 'requestContext.userInfo.userId');
    const appId =
      _.get(context, 'requestContext.jwtToken.applicationId') ||
      _.get(context, 'requestContext.userInfo.applicationId');
    const engineId = _.get(context, 'requestContext.jwtToken.engineId');
    // structured audit log — always emitted
    serviceContext.logger.info('AUDIT> issued signed writable asset URL', {
      event: 'signed_writable_asset_url_issued',
      assetId: info.assetId,
      assetType: info.assetType,
      bucket: info.bucket,
      key: info.key,
      expiresInSeconds: info.expires,
      userId,
      appId,
      engineId
    });
    // best-effort audit event; never fail the request on audit emission
    try {
      const messageUtil = serviceContext.messageUtil;
      if (messageUtil && messageUtil.emitEvent) {
        messageUtil.emitEvent(
          {
            serviceName: 'core-graphql-server',
            event: 'SignedWritableAssetUrlIssued',
            type: 'audit',
            assetId: info.assetId,
            actionInfo: messageUtil.buildActionInfo(
              info.assetId,
              null,
              'getSignedWritableAssetUrl',
              'success',
              `Issued signed writable URL for ${info.assetType} asset ${info.assetId}`,
              'asset'
            )
          },
          messageUtil.topics('EVENTS')
        );
      }
    } catch (err) {
      serviceContext.logger.warn(
        'AUDIT> failed to emit signed writable asset URL audit event',
        err
      );
    }
  }

  // The container segment is gone entirely rather than pinned to a placeholder,
  // giving the six-segment layout the ticket specifies:
  //   {orgId}/{type}/{year}/{month}/{day}/{generated-name}
  const STORAGE_KEY_TYPE_SEGMENT = 'other';

  async function internalGetSignedWritableUrl(serviceContext, context, args) {
    const now = context._signedUrlNow || moment();
    // VE-26306: args.key, args.type and args.path are accepted for
    // compatibility but never read — every segment of the key is generated
    // here.
    const key = getSignedWritableUrlKey(now);
    // append our own data to the key/path so that we can easily find a given
    // org's data in S3. Note that only an internal token or superadmin can
    // pass in an organizationId that is different from the one computed
    // by the authorization code and injected into args.
    const randomFolder = uuid.v4().split('-')[0];

    const path = `${args.organizationId || randomFolder
      }/${STORAGE_KEY_TYPE_SEGMENT}/${now.year()}/${now.month() + 1}/${now.date()
      }/${key}`;
    const bucket = serviceContext.s3Buckets.api.s3.bucket;
    let expires = serviceContext.s3Buckets.api.s3.signedUrlExpires || 10800;
    if (args.expiresInSeconds) {
      const isNumString = _.isString(args.expiresInSeconds)
        ? validator.isInt(args.expiresInSeconds)
        : false;
      const isNum = _.isNumber(args.expiresInSeconds) || isNumString;
      if (!isNum) {
        throw new errors.InvalidInput({
          message:
            'Invalid expiresInSeconds format. An expiresInSeconds must an integer.',
          data: { objectId: args.expiresInSeconds }
        });
      }
    }
    if (_.get(args, 'expiresInSeconds', 0) > 0) {
      if (args.expiresInSeconds > 604800) {
        throw new errors.InvalidInput({
          message: 'the maximum amount of expiresInSeconds is 604800',
          data: { objectId: args.expiresInSeconds }
        });
      } else {
        expires = parseInt(_.get(args, 'expiresInSeconds'));
      }
    }
    // TODO in Java AWS SDK there is a getUrl function, but not in JS.
    // so we need to format the unsigned and signed GET URLs here.

    const userId = _.get(context, 'requestContext.userInfo.userId');
    const engineId = _.get(context, 'requestContext.jwtToken.engineId');

    // get the signed PUT URL
    let signedPutUrl;
    let url, multipartUpload;
    // url override only for user/whitelistedEngines requests for signedurl
    if (
      azureBlobEnabled ||
      // ociEnabled || - don't proxy uploads for oci assets for now. 
      (signedWritableUrlOverride &&
        (userId || (engineId && signedUrlOverrideEngines.includes(engineId))))
    ) {
      const {
        signedWritableUrl,
        rawSignedWritableUrl
      } = await serviceContext.dal.dalStorage.getSignedWritableUrl(
        path,
        bucket,
        expires
      );
      signedPutUrl = signedWritableUrl;
      url = new URL(rawSignedWritableUrl);

      if (_.get(config, 'azure_blob.enabled', false)) {
        multipartUpload = {
          baseUri: `${url.origin}${url.pathname}`,
          uploadToken: extractSignedToken(url)
        };
      } else if (_.get(config, 'oci.enabled', false)) {
        multipartUpload = {
          baseUri: `${url.origin}${url.pathname}`,
          uploadToken: extractSignedToken(url)
        };
      }
    } else {
      signedPutUrl = await serviceContext.s3Buckets.api.storage.getSignedWritableUrlPromise(
        path,
        bucket,
        expires
      );
      url = new URL(signedPutUrl);
    }

    // set up unsigned URL by deconstructing signed URL and stripping
    // off signature.
    // use url-parse since the built-in node url seems to be unstable
    const protocol = url.protocol.endsWith('//')
      ? url.protocol
      : url.protocol + '//';
    // Keep the SDK's percent-encoded pathname: unsignedUrl is persisted as
    // asset.uri and re-parsed with new URL() by every downstream key
    // extractor, and a raw "#", "?", or "%" cannot ride in a URL (the "#"
    // truncates the key into the fragment — VE-26276). Key extractors
    // decode once at their boundary (getOCIBucketAndKey, presignUrl).
    const unsigned = `${protocol}${url.host}${url.pathname}`;

    // now that we have the unsigned URL, we can get the signed GET URL
    // TODO later we can move to the more direct key + bucket signing
    // function, since we already have them.
    const signedGetUrl = isRealSignedUrl(signedPutUrl)
      ? await serviceContext.s3Buckets.api.storage.getSignedUrlPromise(
        unsigned,
        expires,
        null
      )
      : ''; // fallback if the PUT sign failed. this will result
    // in a retry and eventual throw.

    const expiresAt = now.add(expires, 'seconds').utc().toISOString();
    return {
      bucket,
      key: path,
      expiresInSeconds: expires,
      expiresAtDateTime: expiresAt,
      url: signedPutUrl,
      getUrl: signedGetUrl,
      unsignedUrl: unsigned,
      multipartUpload: multipartUpload || undefined
    };
  }

  function extractSignedToken(signedUrl) {
    try {
      const url = new URL(signedUrl);
      return url.query.startsWith('?') ? url.query.slice(1) : url.query;
    } catch (error) {
      throw new Error(
        `Failed to extract signedToken from signedUrl: ${signedUrl}. Error: ${error.message}`
      );
    }
  }

  async function getUploadStatus(serviceContext, context, args) {
    if (!args.input || !args.input.key) {
      throw new errors.InvalidInput({
        message: 'missing object "key"'
      });
    }
    try {
      return await serviceContext.dal.dalStorage.getBlobUploadStatus(
        args.input.key
      );
    } catch (error) {
      serviceContext.logger.error('Error retrieving upload status:', error);
      return {
        status: 'error',
        message: 'Failed to retrieve upload status.',
        totalBytesReceived: 0,
        missingChunkNumbers: [],
        failures: []
      };
    }
  }

  async function checkSignedUri(serviceContext, uri) {
    if (_.isEmpty(uri)) {
      return uri;
    }

    if (!isOurBucket(uri)) return uri;

    let res = await serviceContext.s3Buckets.api.storage.getSignedUrl(uri);
    if (!isRealSignedUrl(res)) {
      await mainUtil.sleep(100);
      res = await serviceContext.s3Buckets.api.storage.getSignedUrl(uri);
      if (!isRealSignedUrl(res)) {
        throw new errors.InternalServerError({
          message:
            'The server was unable to generate a valid signed URL ' +
            'due to an temporary internal error. Retry the request again to ' +
            'continue. If the problem persists, please contact Veritone support ' +
            'and include this entire error payload.',
          data: {
            errorCode: 2088,
            originalUrl: uri,
            result: res
          }
        });
      }
    }
    return res;
  }

  function checkRights(authInfo, rightsNeeded) {
    if (!rightsNeeded) {
      throw new Error('no rights provided'); // this is a server bug
    }
    if (!(authInfo.json && authInfo.json.rights)) {
      throw new errors.NotAllowed({ message: 'No rights on token' });
    }
    const tokenBitIds = new Set(
      authInfo.json.rights
        .map(r => _.get(fpl.permissions, r.replace(/:/g, '.')))
        .filter(id => !_.isUndefined(id))
    );
    const tokenRightsNormalized = new Set(
      authInfo.json.rights.map(r => r.replace(/:/g, '.'))
    );
    for (let i = 0; i < rightsNeeded.length; i++) {
      const right = rightsNeeded[i];
      const rightNormalized = right.replace(/:/g, '.');
      const requiredBitId = _.get(fpl.permissions, rightNormalized);
      // bit-based: handles all alias forms (job.create, aiware.job.create, cms.job.create)
      // fallback: direct string match with normalized separators
      const hasRight = (!_.isUndefined(requiredBitId) && tokenBitIds.has(requiredBitId))
        || tokenRightsNormalized.has(rightNormalized);
      if (!hasRight) {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token is not authorized to perform the requested action. ' +
            'Most queries and mutations and some fields require that the client have ' +
            'specific functional permissions. For example, to invoke "createJob" ' +
            'the client must have the "create job" functional permission.' +
            'For user accounts, these permissions are ' +
            'derived from roles ' +
            'such as "Developer Editor". For API tokens, they are provisioned directly ' +
            'on the token information. For engine tokens, they are set by the ' +
            "platform orchestration components based on the engine's configuration. " +
            'See https://docs.veritone.com/#/apis/tutorials/tokens ' +
            'for troubleshooting information and resolution steps.',
          data: {
            rightsGranted: authInfo.json.rights,
            rightsRequired: rightsNeeded
          }
        });
      }
    }
  }

  // VE-26306: the storage object key is always generated here. It used to fold
  // a caller-supplied key into the name (basename + '-' + id + ext), but those
  // keys carried characters the storage backends cannot represent — a raw "#"
  // truncated the key into the URL fragment (VE-26276) — so the `key` argument
  // on getSignedWritableUrl is deprecated and discarded at the resolver.
  //
  // The uuid leads the name: getSignedWritableUrls shares one `moment()` across
  // the whole batch, so up to 1000 keys carry an identical h-s-ms stamp and used
  // to diverge only at the uuid, 9 characters in. Leading with it lets an object
  // store range-split a bulk request immediately.
  function getSignedWritableUrlKey(ts) {
    const t = ts || moment();
    return `${uuid.v4()}_${t.hour()}-${t.second()}-${t.milliseconds()}`;
  }

  function queryIncludesField(queryInfo, fieldPath) {
    const nodes = queryInfo.fieldNodes;
    for (let i = 0; nodes && i < nodes.length; i++) {
      const node = nodes[i];
      if (searchFieldNode(node, fieldPath)) return true;
    }

    return false;
  }

  function searchFieldNode(node, fieldPath) {
    const _fieldPath = JSON.parse(JSON.stringify(fieldPath));
    const curField = _fieldPath.shift();
    const nodeName = node.name.value;

    // if the current node doesn't match the current test path element,
    // return out now.
    if (curField !== nodeName) {
      return false;
    }

    // if we've reached a leaf and not returned false yet, it's a match.
    if (!node.selectionSet) return true;
    if (!_fieldPath.length) return true;

    // otherwise we need to recurse down into the child nodes
    for (let i = 0; i < node.selectionSet.selections.length; i++) {
      const child = node.selectionSet.selections[i];
      if (searchFieldNode(child, _fieldPath)) return true;
    }
    return false;
  }

  let httpTimeout = _.get(config, 'httpPools.defaultTimeout', 58000);

  function getHttpError(url, err, httpStatusCode, data, msg) {
    // Copy only serializable scalars off the raw error. Node network/TLS
    // errors carry live objects (socket, TLS peer certificate chains whose
    // issuerCertificate is circular at the root CA) that crash any
    // JSON.stringify downstream and would leak connection internals into
    // emitted error events.
    const safeError = err
      ? {
          name: err.name,
          message: err.message,
          code: err.code,
          syscall: err.syscall,
          hostname: err.hostname || err.host,
          reason: err.reason
        }
      : undefined;
    return new errors.ResourceUnavailable({
      message: msg || 'The resource at ' + url + ' could not be downloaded.',
      data: {
        url,
        httpStatusCode: httpStatusCode || undefined,
        internalData: { response: data || undefined },
        error: safeError
      }
    });
  }

  function getResponseSizeError(uri, length, responseSize) {
    const msg =
      'Maximum GraphQL response size of ' +
      prettyBytes(responseSizeLimit) +
      ' exceeded. A requested asset was too large to load into memory. ' +
      'Download the asset locally to continue.';
    const data = {
      uri,
      assetSizeBytes: length,
      assetSize: prettyBytes(length),
      maximumResponseSize: prettyBytes(responseSizeLimit),
      currentResponseSize: prettyBytes(responseSize),
      currentResponseSizeBytes: responseSize
    };
    return new errors.InvalidInput({
      message: msg,
      data
    });
  }

  function getAssetSizeError(uri, length) {
    return new errors.InvalidInput({
      message:
        'The asset content could not be transformed because ' +
        'the asset size exceed safe limits for processing. Download the ' +
        'asset and transform it locally to continue.',
      data: {
        uri,
        assetSizeBytes: length,
        assetSize: prettyBytes(length),
        maximumAssetSizeBytes: maxAssetTransformLength,
        maximumAssetSize: prettyBytes(maxAssetTransformLength)
      }
    });
  }

  async function download(uri = '', context, headers = {}) {
    let res;
    let numRetries = 0;
    const parsed = new URL(uri);
    const startTime = moment().valueOf();
    const poolConfig = httpUtil.getPoolConfig(uri, parsed);
    const useHttps = parsed.protocol.startsWith('https');
    const lib = useHttps ? https : http;
    let requestStart;
    do {
      try {
        requestStart = moment().valueOf();
        res = await downloadTry(uri, context, lib, headers);
        const elapsedMs = moment().valueOf() - requestStart;
        httpUtil.logHttpCall(
          uri,
          elapsedMs,
          res.length,
          200,
          poolConfig.name,
          null,
          numRetries
        );
        serviceContext.metrics.incrementCounter('httpCall', {
          pool: poolConfig.name
        });
        // VE-26935 - download() is the single funnel for every asset fetch
        // (engine results, task logs, library files) but only counted calls,
        // leaving S3 latency on those paths invisible: a slow engineResults
        // query could not be split into network vs CPU time. Observed on the
        // failure path below as well, per dal/util.js and dal/tdo.js, since a
        // fetch that stalls and then throws is the case most worth seeing.
        // Consequence: this histogram counts ATTEMPTS while httpCall counts
        // only successes, so the two totals legitimately diverge when retries
        // happen. Read sum/count here as per-attempt latency, not per-call.
        serviceContext.metrics.observeHistogram(
          'httpCallElapsedMs',
          elapsedMs,
          { pool: poolConfig.name }
        );
      } catch (err) {
        const elapsedMs = moment().valueOf() - requestStart;
        httpUtil.recordHttpError(
          uri,
          err,
          elapsedMs,
          poolConfig.name,
          numRetries
        );
        // recordHttpError records the error but not its duration. This cannot
        // move into recordHttpError: its two other callers (dal/util.js,
        // dal/tdo.js) already observe this histogram themselves and would
        // then double-count.
        serviceContext.metrics.observeHistogram(
          'httpCallElapsedMs',
          elapsedMs,
          { pool: poolConfig.name }
        );
        if (
          !httpUtil.isRetryable(uri, err, startTime, poolConfig, numRetries)
        ) {
          throw err;
        }
        serviceContext.metrics.incrementCounter('httpRetry', {
          pool: poolConfig.name
        });
        numRetries++;
      }
    } while (
      !res &&
      numRetries < 10 /* paranoid fallback to prevent infinite looping */
    );
    return res;
  }

  /**
   * download downloads file from provided URI
   * @param uri
   * @param context
   * @param headers Optional placeholder object into which response headers
   * will be copied. (weird function signature was done to support a client
   * getting response headers without changing the function signature and
   * breaking other callers)
   * @returns {Promise<void>}
   */
  function downloadTry(uri = '', context, httpLib, headers) {
    return new Promise((resolve, reject) => {
      let data = '';
      /*
      const parsed = new URL(uri);
      const options = {
        method: 'GET',
        hostname: parsed.host,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname+parsed.query,
        protocol: parsed.protocol
      };
      let req = httpLib.request(options, res => {
      // TODO above does not work. but once we fix, can pass in an agent
      // with specific settings like maxSockets
      */
      let req = httpLib.get(uri, (res) => {
        if (res.headers['content-type'] === 'application/json') {
          // TODO: this is not ideal, but we don't have encoding info in the headers
          res.setEncoding('utf8');
        }

        const code = res.statusCode;
        // first check content-length header, if the server sent one.
        const length = _.isNil(res.headers['content-length'])
          ? 0
          : parseInt(res.headers['content-length']);

        // copy response headers, if any, into the placeholder object
        if (headers) {
          _.assign(headers, res.headers);
        }

        // we check against both the running total of the response size
        // and the max allowed size per asset.
        const curResponseSize = context.requestInfo.responseTotalSize || 0;
        if (length > maxAssetTransformLength) {
          reject(getAssetSizeError(uri, length));
        }
        if (curResponseSize + length > responseSizeLimit) {
          reject(getResponseSizeError(uri, length, curResponseSize));
        }
        let totalLength = 0;
        res.on('data', (chunk) => {
          totalLength += chunk.length;

          const curResponseSize = context.requestInfo.responseTotalSize || 0;
          if (curResponseSize + chunk.length > responseSizeLimit) {
            reject(getResponseSizeError(uri, length, curResponseSize));
          }
          context.requestInfo.responseTotalSize += chunk.length;

          if (totalLength > maxAssetTransformLength) {
            reject(getAssetSizeError(uri, length));
          }
          data += chunk;
        });
        res.on('end', () => {
          if (code != 200) {
            reject(getHttpError(uri, null, code, data));
          } else {
            resolve(data);
          }
        });
        res.on('error', (err) => reject(err));
      });
      req.setTimeout(httpTimeout, () =>
        reject(
          getHttpError(
            uri,
            null,
            null,
            null,
            'The resource at ' +
            uri +
            ' could not be downloaded because the request timed out.'
          )
        )
      );
      req.on('error', (err) =>
        reject(getHttpError(uri, err, null, null, null))
      );
    });
  }
  /**
   * transformAsset executes asset transformation with the provided URI and function
   * @param uri typically an S3 URI for the asset
   * @param transformerFunc one of the supported transformation functions
   * @returns {Promise<*>}
   */
  async function transformAsset(context, uri = '', transformerFunc = '') {
    const parseFile = (data, func) =>
      new Promise((resolve, reject) => {
        switch (func) {
          case 'XML2JSON':
            {
              const parseString = require('xml2js').parseString;
              parseString(data, (err, result) => {
                if (err) {
                  const newErr = new errors.InvalidInput({
                    message:
                      'The asset could not be transformed because its content ' +
                      'could not be parsed. It may contain data in a format that is not compatible ' +
                      'with the selected transform function, or data that is incomplete or inconsistent.',
                    data: {
                      assetUri: uri,
                      transformFunction: transformerFunc,
                      internalData: {
                        parseMessage: err.message,
                        parseStack: err.stack
                      }
                    }
                  });
                  reject(newErr);
                }
                resolve(JSON.stringify(result));
              });
            }
            break;
          case 'Transcript2JSON':
            // TODO: use imported function instead of copy
            resolve(JSON.stringify(convertTranscript(data)));
            break;
          case 'RAW':
            // VTN-10734 for now not needed. might re-add at some point.
            resolve({ content: data });
            break;
          case 'JSON':
            if (
              _.get(
                serviceContext,
                'config.featureFlags.validateAssetTransformJson',
                false
              ) === true
            ) {
              try {
                JSON.parse(data);
              } catch (err) {
                const newErr = new errors.InvalidInput({
                  message:
                    'The asset could not be transformed because its content ' +
                    'could not be parsed. It may contain data in a format that is not compatible ' +
                    'with the selected transform function, or data that is incomplete or inconsistent.',
                  data: {
                    assetUri: uri,
                    transformFunction: transformerFunc,
                    internalData: {
                      parseMessage: err.message,
                      parseStack: err.stack
                    }
                  }
                });
                reject(newErr);
              }
            }
            resolve(data);
            break;
          default:
            reject('unsupported transformer function: ', func);
        }
      });

    let file;
    try {
      file = await download(uri, context);
    } catch (e) {
      if (e.name) throw e;
      throw new errors.InvalidInput({
        message:
          'The asset could not be transformed because its content ' +
          'could not be parsed. It may contain data in a format that is not compatible ' +
          'with the selected transform function, or data that is incomplete or inconsistent.',
        data: {
          assetUri: uri,
          transformFunction: transformerFunc,
          internalData: {
            parseMessage: e.message,
            parseStack: e.stack
          }
        }
      });
    }
    try {
      return await parseFile(file, transformerFunc);
    } catch (e) {
      throw new errors.InvalidInput({
        message:
          'The asset could not be transformed because its content ' +
          'could not be parsed. It may contain data in a format that is not compatible ' +
          'with the selected transform function, or data that is incomplete or inconsistent.',
        data: {
          assetUri: uri,
          transformFunction: transformerFunc,
          internalData: {
            parseMessage: e.message,
            parseStack: e.stack
          }
        }
      });
    }
  }

  // TODO: use imported function instead of copy
  function convertTranscript(xmlData) {
    const snippetRegex = /<p begin="([^"]+)" end="([^"]+)">([^<]+)<\/p>/g;
    const snippetRegexSingle = /<p begin="([^"]+)" end="([^"]+)">([^<]+)<\/p>/;
    const snippets = [];
    const matches = xmlData.match(snippetRegex);
    if (!matches || !matches.length) {
      return snippets;
    }
    let i,
      max = matches.length;
    for (i = 0; i < max; i++) {
      const match = snippetRegexSingle.exec(matches[i]);
      if (
        match[3].indexOf(
          'AUTOMATIC CLOSED CAPTIONING provided by the Microsoft'
        ) === 0
      ) {
        continue;
      }
      snippets.push({
        startTime: match[1],
        start: toSeconds(match[1]),
        endTime: match[2],
        end: toSeconds(match[2]),
        text: match[3]
      });
    }
    return snippets;
  }

  function toSeconds(timeString) {
    var parts = timeString.split(':'),
      h = parseFloat(parts[0]) * 3600,
      m = parseFloat(parts[1]) * 60,
      s = parseFloat(parts[2]);
    return parseFloat((h + m + s).toFixed(3));
  }

  /**
   * This function does not perform the top-level authentication check --
   * this happens in server.js before graphql is invoked.
   * It's here as a convenience function to get the authentication and user info
   * for use in resolvers and as a final check to prevent code from breaking
   * if the authentication did not happen.
   */
  function requireAuthInfo(context) {
    if (_.get(context, 'config.devNoAuthentication', false) === true) return {};
    let authInfo =
      context.requestContext.userInfo || context.requestContext.tokenInfo;

    if (!authInfo) {
      const loginUrl = _.get(context, 'config.services.loginPageUri');
      const loginMsg = loginUrl
        ? 'If you are using an interactive client interface such as GraphiQL, ' +
        'log into the Veritone platform at ' +
        loginUrl +
        '.'
        : 'If you are using an interactive client interface such as GraphiQL, ' +
        'log into the Veritone platform. ' +
        'Note that you must be logged in ' +
        'on the same domain that you are using to access the API.';
      const tokenPresent = !_.isNil(context.requestContext.authToken);
      const token = tokenPresent
        ? context.requestContext.authToken.substring(0, 10) + '...'
        : undefined;
      const message = tokenPresent
        ? 'This field requires authentication. ' +
        'An authentication token was provided, but it was invalid or ' +
        'expired. Provide a valid authentication token to continue. ' +
        loginMsg
        : 'This field requires authentication. No authentication token was ' +
        'sent with the request. Provide a valid authentication token to ' +
        'continue. ' +
        loginMsg;
      throw new errors.AuthenticationError({
        message: message,
        data: {
          tokenPresent: tokenPresent,
          token: token
        }
      });
    }

    if (authInfo.tokenType) {
      authInfo = authInfo.data;
    }

    _.set(
      context,
      '_authInfo.authTokenType',
      _.get(context, 'requestContext.authTokenType')
    );
    // Populate JWT token info
    if (_.get(context, 'requestContext.authTokenType') === 'jwt') {
      _.set(
        context,
        '_authInfo.jwtToken',
        _.get(context, 'requestContext.jwtToken')
      );
    }

    return authInfo;
  }

  function getTokenType(context) {
    const info =
      context._authInfo || context.userInfo || context.tokenInfo || {};

    if (
      info.tokenId &&
      info.applicationId &&
      _.get(info, 'json.internal', false) === false
    ) {
      return 'apikey';
    }

    if (info.tokenId && _.get(info, 'json.internal', false) === true) {
      return 'internal';
    }
    if (_.get(context, 'jwtToken.sub') === 'engine-run') {
      return 'engineJWT';
    }
    if (_.get(context, 'jwtToken.sub') === 'jwt-for-source') {
      return 'sourceJWT';
    }
    return 'user';
  }

  function isSuperAdmin(authInfo) {
    const type = getTokenType({ _authInfo: authInfo });
    switch (type) {
      case 'user': {
        if (
          (!authInfo || !_.get(authInfo, 'permissionMasks')) &&
          !(_.get(authInfo, 'json') && _.get(authInfo, 'json.rights'))
        ) {
          return false;
        }
        try {
          checkRights(authInfo, ['superadmin']);
          return true;
        } catch (error) {
          return fpl.util.hasAccessTo(
            fpl.permissions.superadmin,
            authInfo.permissionMasks
          );
        }
      }
      case 'apikey':
      case 'internal': {
        try {
          checkRights(authInfo, ['superadmin']);
          return true;
        } catch (error) {
          return false;
        }
      }
      default:
        return false;
    }
  }

  function isOrgAdmin(userInfo) {
    return mainUtil.hasPerm('admin.org.update', userInfo);
  }

  function isCSAdmin(userInfo) {
    if (!userInfo || !userInfo.permissionMasks) {
      return false;
    }
    const res = fpl.util.hasAccessTo(
      fpl.permissions.cms.customerservice,
      userInfo.permissionMasks
    );
    return res;
  }
  function getOrgFromAuthContext(context) {
    const data = context._authInfo || context;
    let res = _.get(data, 'tokenInfo.organization.organizationId');
    if (!res) res = _.get(data, 'organization.organizationId');
    if (!res) res = _.get(data, 'tokenInfo.group.kvp.organizationId');
    return res;
  }

  function stripSignatureSignedUrl(uri) {
    const url = new URL(uri);
    const protocol = url.protocol.endsWith('//')
      ? url.protocol
      : url.protocol + '//';

    return `${protocol}${url.host}${url.pathname}`;
  }

  function toArray(param) {
    if (!param) {
      return [];
    }
    if (Array.isArray(param)) {
      return param;
    }
    return [param];
  }

  const taskCache = new LRU({
    ttlmaxAge: 300000, // 5 min
    max: 300 // 300 working tasks
  });

  async function fillInClientInfo(clientInfo) {
    // fill in engine info
    if (clientInfo.type === 'engineJWT' && clientInfo.taskId) {
      let cached = taskCache.get(clientInfo.taskId);
      if (!cached) {
        const task = await serviceContext.dal.task.getTask(
          {},
          { id: clientInfo.taskId, useCached: true }
        );
        clientInfo.engineId = task.engineId;
        const engine = await serviceContext.dal.engine.getEngine(
          {},
          { id: clientInfo.engineId }
        );
        clientInfo.engineName = engine.name;
        cached = {
          engineId: task.engineId,
          engineName: engine.name
        };
        taskCache.set(clientInfo.taskId, cached);
      }
      clientInfo.engineId = cached.engineId;
      clientInfo.engineName = cached.engineName;
    }
    if (clientInfo.org === 'internal') {
      clientInfo.organizationName = 'internal';
    } else if (clientInfo.org && !clientInfo.organizationName) {
      let orgInfo = { name: '<not found>' };
      try {
        orgInfo = await serviceContext.dal.organization.getOrganization(
          {},
          { id: clientInfo.org }
        );
      } catch (err) {
        serviceContext.logger.error(
          'cannot find org ' + clientInfo.org + ':  ' + err
        );
      }
      clientInfo.organizationName = orgInfo.name;
    }
  }

  function setCookie(result, context, options = {}) {
    // set a cookie for user session token in the response headers
    const token = _.get(result, 'token');
    if (!_.isNil(token)) {
      const userTokenCookieName = _.get(
        serviceContext,
        'config.auth.userTokenCookieName',
        'veritone-session-id'
      );
      const useInsecureCookie = !!_.get(
        serviceContext,
        'config.auth.useInsecureCookie'
      );
      const cookieDomain = _.get(
        serviceContext,
        'config.auth.domain',
        '.veritone.com'
      );
      const envConfig = _.get(serviceContext, 'config.nodeEnv');
      const cookieOptions = {
        expires: new Date(result.tokenExpiration),
        domain: cookieDomain,
        path: '/',
        secure: !useInsecureCookie,
        httpOnly: true
      };

      const allowVanityDomain = _.get(options, 'allowVanityDomain');
      if (allowVanityDomain === true) {
        if (_.isEmpty(cookieDomain) || _.isEmpty(envConfig)) {
          serviceContext.logger.error(
            'The vanity domain cookie cannot be set because the auth.domain and nodeEnv configurations are missing.'
          );
        } else {
          const cookieDomainForVanity = [
            'api.{{env}}',
            _.trim(cookieDomain, '.')
          ].join('.');
          cookieOptions.domain = cookieDomainForVanity.replace(
            '{{env}}',
            envConfig
          );
          cookieOptions.sameSite = 'None';
          cookieOptions.secure = true;
        }
      }

      context.response.cookie(userTokenCookieName, token, cookieOptions);
    }
  }

  function requireTokenType(context, tokenTypes = []) {
    requireAuthInfo(context); // first verify that authentication provided

    const tokenType = getTokenType(context);

    if (_.isEmpty(tokenTypes)) return;

    if (!tokenTypes.includes(tokenType)) {
      throw new errors.NotAllowed({
        message: 'Current token type is not allowed.',
        data: {
          currentTokenType: tokenType,
          requireTokenTypes: tokenTypes
        }
      });
    }
  }

  async function getUserIdFromAuthContext(context) {
    const data = context._authInfo || context.userInfo || context.tokenInfo;
    let res =
      _.get(data, 'userId') ||
      _.get(data, 'user.userId', _.get(data, 'user.id'));

    if (!res) {
      const orgId = getOrgFromAuthContext(context);
      const defaultOrgAdmin = await serviceContext.dal.user.getDefaultOrgAdminUser(
        { organizationId: orgId },
        context
      );

      if (defaultOrgAdmin) {
        res = defaultOrgAdmin.id;
      }
    }

    return res;
  }

  function asJsonObject(str) {
    if (_.isObjectLike(str)) return str;

    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function getUserShortenName(firstName, lastName) {
    const initials =
      (!_.isEmpty(firstName) ? firstName.charAt(0) : '') +
      (!_.isEmpty(lastName) ? lastName.charAt(0) : '');
    return initials.toUpperCase();
  }

  function generateVirtualTreeObjectId(orgId, objId, objType = 'watchlist') {
    if (_.isNil(orgId) || _.isNil(objId)) {
      return null;
    }

    const objTypeMap = {
      watchlist: 'watchlist'
    };
    const prefixType = objTypeMap[objType] || objTypeMap.watchlist;

    return `vtreeobject-${orgId}-${prefixType}-${objId}`;
  }

  function parseVirtualTreeObjectId(virtureTreeObjectId) {
    if (typeof virtureTreeObjectId !== 'string') {
      return {};
    }

    const [, orgId, objectType, ...objIds] = virtureTreeObjectId.split('-');

    return {
      orgId: orgId ? parseInt(orgId) : null,
      objectType,
      objectId: objIds ? objIds.join('-') : null
    };
  }

  function checkMaxTDOLimit(context, args) {
    const max = _.get(serviceContext, 'config.maxTDOLimit', 100);
    if (args.limit && args.limit > max) {
      throw new errors.InvalidInput({
        message:
          'temporalDataObject has a maximum page size of ' +
          max +
          '. Lower the limit to continue.',
        data: {
          maximumLimit: max,
          suppliedLimit: args.limit,
          field: 'temporalDataObjects'
        }
      });
    }
  }

  /**
   * Get organizationID based on clientInfo.org scenarios:
   * - if clientInfo.org is a number, return itself.
   * - if clientInfo.org is neither a number nor a string, return rootOrgId.
   * - if clientInfo.org is internal, return rootOrgId.
   * - if clientInfo.org is a number string, parse it before returning.
   * - if clientInfo.org is a UUID, return orgId via getOrgIdFromAppId. If orgId is not found, return rootOrgId.
   * - If clientInfo.org is an empty string, a non-number string, or a non-uuid, return rootOrgId.
   *
   * @param {Object} clientInfo
   * @returns {number} organization ID
   */
  async function getOrgIdFromClientInfo(clientInfo) {
    const rootOrgId = _.toNumber(
      _.get(serviceContext, 'config.flyway.rootOrgId', 1)
    );
    const inputOrgId = _.get(clientInfo, 'org', rootOrgId);

    if (typeof inputOrgId === 'number') {
      return inputOrgId;
    }

    if (typeof inputOrgId !== 'string' || inputOrgId === 'internal') {
      return rootOrgId;
    }

    try {
      if (validator.isNumeric(inputOrgId)) {
        return _.toNumber(inputOrgId);
      } else if (validator.isUUID(inputOrgId)) {
        const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          inputOrgId
        );
        return _.toNumber(orgId);
      }

      return rootOrgId;
    } catch (error) {
      return rootOrgId;
    }
  }

  function getDirectivesFromInfo(info, options = {}) {
    if (_.isEmpty(info) || _.isNil(info.schema)) {
      return [];
    }

    let field;

    if (options.findByOperation) {
      const operationName = _.get(info, 'operation.name.value');
      if (_.isNil(operationName)) {
        return [];
      }

      // get directives of OperationDefinitionNode
      const operationType = info.schema?.getQueryType?.();
      field = operationType?.getFields?.()?.[operationName];
    } else if (!_.isEmpty(info.parentType) && !_.isNil(info.fieldName)) {
      // get directives of parentType
      field = info.parentType?.getFields?.()?.[info.fieldName];
    }

    if (_.isNil(field)) {
      return [];
    }

    return getDirectives(info.schema, field);
  }

  function verifyAccessViaScopeDirective(
    directiveArgs,
    fieldArgs,
    context,
    info
  ) {
    const paramName = _.get(fieldArgs, '__directiveArgName');
    const ignoreParamsForValidation = _.get(
      fieldArgs,
      '__ignoreParamsForValidation',
      []
    );

    // if the affected parameter was set internally by the server, don't warn.
    if (paramName && ignoreParamsForValidation.includes(paramName)) {
      return;
    }
    // if the deprecated parameter was not set, don't warn.
    if (paramName && _.isNil(fieldArgs[paramName])) {
      return;
    }

    const perms = _.get(directiveArgs, 'scopes', []);
    // VTN-5942 - org-less JWT tokens are now handled
    const fieldName = _.get(info, 'fieldName');
    const type = _.get(info, 'parentType', {});
    const requireDirectiveArg = _.get(directiveArgs, 'require');
    const requireAll = requireDirectiveArg === 'All';
    let hasOne = false;

    try {
      perms.forEach((perm) => {
        // if requireAll is true, this will throw
        if (mainUtil.requirePerm(perm, context, fieldName, type, requireAll)) {
          // otherwise we set hasOne
          hasOne = true;
        }
      });
    } catch (err) {
      // handle all errors here so that messages are in one place
      hasOne = false;
    }
    if (!hasOne) {
      const rights = mainUtil.listRights(context._authInfo);
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token is not authorized to perform the requested action. ' +
          'Most queries and mutations and some fields require that the client have ' +
          'specific functional permissions. For example, to invoke "createJob" ' +
          'the client must have the "create job" functional permission.' +
          'For user accounts, these permissions are ' +
          'derived from roles ' +
          'such as "Developer Editor". For API tokens, they are provisioned directly ' +
          'on the token information. For engine tokens, they are set by the ' +
          "platform orchestration components based on the engine's configuration. " +
          'The requested operation requires the following rights: ' +
          requireDirectiveArg +
          ' of ' +
          perms +
          '. ' +
          'Details on the operation that triggered this error are provided in ' +
          'the data section below. See https://docs.veritone.com/#/apis/tutorials/tokens ' +
          'for troubleshooting information and resolution steps.',
        data: {
          errorId: uuid.v4(),
          rightsGranted: rights,
          field: fieldName,
          type: type.name,
          rightsRequired: perms,
          allOrAny: requireDirectiveArg
        }
      });
    }
  }
  async function buildRootFolderName(
    obj,
    context
  ) {
    const typeName =
      serviceContext.dal.folder.ROOT_FOLDER_TYPE_NAME[
      _.toString(obj.rootFolderTypeId)
      ];
    let userId = obj.userId || obj.rootFolderUserId;
    // user root folder in folder V2
    if (!obj.treeObjectTypeId && !userId) {
      const rootFolderUserId = await serviceContext.dal.folderV2.getRootFolderUserIdByFolderId(obj.id);
      if (rootFolderUserId) {
        userId = rootFolderUserId;
      }
    }

    // user root folder
    if (userId) {
      let userName;

      if (userId === _.get(context, '_authInfo.userId')) {
        userName = _.get(context, '_authInfo.userName');
      }

      if (!userName) {
        const user = await serviceContext.dal.admin.getUser(
          { id: userId },
          context
        );
        userName = _.get(user, 'name');
      }
      return `${userName} ${typeName} Root Folder`;
    }

    // org root folder
    if (obj.organizationId) {
      const org = await serviceContext.dal.organization.getOrganization(
        context,
        { id: obj.organizationId }
      );

      if (org) {
        return `${org.name} ${typeName} Root Folder`;
      }
    }

    return `${typeName} Root Folder`;
  }

  return {
    getOrgFromAuthContext,
    queryIncludesField,
    transformAsset,
    download,
    getHttpError,
    requireAuthInfo,

    getClientInfo: (context) => {
      const authInfo =
        context._authInfo ||
        _.get(context, 'requestContext.userInfo') ||
        _.get(context, 'requestContext.tokenInfo') ||
        context.userInfo ||
        context.tokenInfo;

      if (!authInfo) return {};

      const type = getTokenType(context.requestContext);
      const isEngineJwt = type === 'engineJWT';
      let userId = authInfo.userId; // user token
      const orgId = authInfo.organization // org API key
        ? authInfo.organization.organizationId
        : authInfo.data
          ? authInfo.data.applicationId
          : 'internal';
      if (!userId) {
        userId = authInfo.tokenId
          ? mainUtil.obscureToken(authInfo.tokenId)
          : 'apikey-' + orgId;
      }
      const res = {
        type,
        id: userId,
        org: orgId,
        userName: authInfo.userName
      };

      if (authInfo.application) {
        res.appId = authInfo.application.applicationId;
        res.appName = authInfo.application.applicationName;
      }

      if (authInfo.organization) {
        res.organizationName = authInfo.organization.organizationName;
      }

      // if we know this is an engine JWT, we can
      // fill in some additional information.
      if (isEngineJwt) {
        res.taskId =
          _.get(
            context,
            'requestContext.jwtToken.scope[0].resources.taskIds[0]'
          ) ||
          _.get(
            context,
            'requestContext.jwtToken.scope[1].resources.taskIds[0]'
          );
        if (res.taskId) res.id = 'engineJWT:task:' + res.taskId;
        res.applicationId = _.get(
          context,
          'requestContext.jwtToken.contentApplicationId'
        );
      }
      return res;
    },
    getOrgIdFromClientInfo,

    /**
     * @context the incoming request context with user info
     * @orgIds array of org IDs to authorize. user must be an adminV
     *   or have access to these orgs based on incoming token.
     */
    authorizeOrgIds: (authInfo, params, rightsNeeded) => {
      if (!authInfo.organization) {
        //checkRights(authInfo, rightsNeeded);
        if (!params.organizationIds) {
          params.organizationIds = [];
        }
        return;
      }
      let userOrg = authInfo.organization
        ? authInfo.organization.organizationId
        : authInfo.data.organization.organizationId;

      if (Array.isArray(userOrg)) {
        userOrg = userOrg[0];
      }

      const userOrgs = _.union(
        toArray([userOrg]),
        toArray(authInfo.authorizedOrganizationIds)
      )
        .map((orgId) => {
          const parsed = parseInt(orgId);
          if (isNaN(parsed)) return null;
          return parsed;
        })
        .filter(Number);

      const requestedOrgs = _.filter(
        _.union(toArray(params.organizationIds), toArray(params.organizationId))
      );

      const superAdminRights = isSuperAdmin(authInfo);
      let orgIds = requestedOrgs;

      if (!superAdminRights) {
        for (const incomingId of orgIds) {
          if (userOrgs.indexOf(parseInt(incomingId)) < 0) {
            throw new errors.AuthorizationError({
              data: {
                objectId: incomingId,
                clientOrganizationIds: userOrgs
              }
            });
          }
        }
      }

      // If supplied empty list and not superAdmin
      // restrict the organizations to the userOrgs list
      if (!orgIds.length) {
        orgIds = userOrgs;
      }

      // at this point we've filtered the incoming org ID list to only
      // authorized orgs. however, if and only if no org IDs were in
      // the parameter set, we'll add them here.
      if (!params.organizationIds) {
        params.organizationIds = orgIds;
      }
      if (!params.organizationId) {
        params.organizationId = userOrg;
      }
      if (params.input && !params.input.organizationIds) {
        params.input.organizationIds = params.organizationIds;
      }
      if (params.input && !params.input.organizationId) {
        params.input.organizationId = params.organizationId;
      }
      return superAdminRights ? requestedOrgs : orgIds;
    },

    checkRights: checkRights,

    requireUserToken: (context) => {
      requireAuthInfo(context); // first verify that authentication provided
      const userId = _.get(context, 'requestContext.userInfo.userId');
      if (!userId) {
        throw new errors.NotAllowed({
          message: 'A user session token is required.'
        });
      }
    },

    requireAPIToken: (context) => {
      requireAuthInfo(context); // first verify that authentication provided
      if (
        !(
          _.get(context, 'requestContext.jwtToken') ||
          context.requestContext.authTokenType === 'apikey'
        )
      ) {
        throw new errors.NotAllowed({
          message: 'An API token is required.'
        });
      }
    },
    authorizeAppIds: (authInfo, params, rightsNeeded) => {
      let userApps = authInfo.applications || [];

      if (!authInfo.organization) {
        //checkRights(authInfo, rightsNeeded);
        return;
      }
      const kvpAppIds = _.get(authInfo, 'organization.kvp.applicationIds');
      if (kvpAppIds) userApps = userApps.concat(kvpAppIds);
      if (authInfo.applicationId) userApps.unshift(authInfo.applicationId);
      // form list of org ids referenced in request

      // app IDs referenced in request
      // if none were passed by caller, we default to the
      // list of authorized ap pIDs
      let appIds = params.applicationIds || [];
      if (params.applicationId) appIds.push(params.applicationId);

      if (!appIds.length) {
        appIds = userApps;
      }

      // validate incoming app IDs in request against the
      // list of authorized IDs and error out if any
      // are not authorized
      for (let i = 0; i < appIds.length; i++) {
        const incomingId = appIds[i];
        if (!(incomingId && incomingId.length)) continue;
        if (!userApps.includes(incomingId)) {
          throw new errors.NotFound({
            objectId: incomingId
          });
        }
      }
      // if query did not contain app ID parameter, add user's app ID
      if (!appIds.length) appIds.push(userApps[0]);
      if (!params.applicationId) {
        // make sure to handle app ID from JWT, user, or API token
        const userAppId = _.get(
          authInfo,
          'groups[0].applicationId',
          authInfo.applicationId
        );
        // throw out an error instead of defaulting to first in list of app IDs user
        // has access to. That behavior was not correct and caused createJob to fail.

        if (!userAppId)
          throw new errors.AuthenticationError({
            message:
              'An application ID could not be extracted from the authentication context. ' +
              'This error might indicate a server error or malformed request.'
          });

        params.applicationId = userAppId;
      }
      if (!params.applicationIds)
        params.applicationIds = [params.applicationId];

      //params.applicationIds = [params.applicationId];
      if (params.input) {
        params.input.applicationId = params.applicationId;
        params.input.applicationIds = params.applicationIds;
      }
    },

    isSuperAdmin: isSuperAdmin,
    isOrgAdmin: isOrgAdmin,

    isCSAdmin: isCSAdmin,

    isDevAdmin: (userInfo) => {
      return (
        mainUtil.hasPerm('developer.build.approve', userInfo) ||
        mainUtil.hasPerm('developer.build.disapprove', userInfo)
      );
    },

    isDockerAdmin: (userInfo) => {
      return fpl.util.hasAccessTo(
        fpl.permissions.developer.docker.admin,
        userInfo.permissionMasks
      );
    },

    hash: (data) => {
      const sha256 = crypto.createHash('sha256');
      sha256.update(data);
      return sha256.digest('hex');
    },

    getSignedWritableUrlKey,

    mergeConcatCustomizer: (objValue, srcValue) => {
      if (_.isArray(objValue)) {
        return objValue.concat(srcValue);
      }
    },

    getValidStateActionsApplications: function (status, authInfo) {
      const applicationStateActions = {
        base: {
          draft: [],
          pending: [],
          approved: [],
          rejected: [],
          active: [],
          disabled: [],
          deleted: []
        }
      };
      applicationStateActions.default = _.mergeWith(
        {
          draft: ['edit', 'submit', 'delete'],
          pending: ['edit', 'delete'],
          approved: ['deploy', 'edit', 'delete'],
          rejected: ['edit', 'submit', 'delete'],
          active: ['disable'],
          disabled: ['edit', 'delete', 'enable']
        },
        applicationStateActions.base,
        this.mergeConcatCustomizer
      );
      applicationStateActions.admin = _.mergeWith(
        {
          pending: ['approve', 'reject'],
          rejected: ['approve', 'delete'],
          active: ['edit', 'delete'],
          deleted: ['undelete']
        },
        applicationStateActions.default,
        this.mergeConcatCustomizer
      );
      if (this.isDevAdmin(authInfo)) {
        return applicationStateActions.admin[status];
      }
      return applicationStateActions.default[status];
    },

    canEditApplicationFromStatus: function (status, authInfo) {
      const actions = this.getValidStateActionsApplications(status, authInfo);
      const canEdit = actions ? !!~actions.indexOf('edit') : false;
      return !!canEdit;
    },

    checkIfApplicationFieldsWillUpdate: function (input, app) {
      const fieldsToTest = [
        'name',
        'description',
        'iconUrl',
        'iconSvg',
        'url',
        'permissionsRequired'
      ];
      return _.chain(fieldsToTest)
        .map((field) => (input[field] ? input[field] !== app[field] : false))
        .includes(true)
        .value();
    },
    getSignedUrl,
    getSignedUrlExp,
    getSignedUrlOrVirtual,
    getVirtualSignedUri,
    getAssetUriFromVirtualId,
    resolveVirtualAssetUri,
    isRealSignedUrl,
    isOurBucket,
    stripOwnedStorageUrlSignature,
    getSignedWritableUrl,
    getSignedWritableUrls,
    getSignedWritableAssetUrl,
    getTokenType,
    checkSignedUri,
    fillInClientInfo,
    // make sure we don't crash task-insert-server by returning bad date
    checkDateTime: function (dateTime, id) {
      // if no value, just return it back out
      if (_.isNil(dateTime)) return dateTime;
      // now we check for goofy date/time values
      const maxTimeSec = 32510030736; // in year 3000
      const maxTimeMs = maxTimeSec * 1000;

      if (_.isNaN(dateTime)) {
        // NaN can result from moment or Date parse errors
        // if we couldn't even parse it, have to throw out. we can't convert.
        throw new errors.InvalidInput({
          message: 'bad numerical field ' + dateTime + ' on object ' + id,
          data: {
            objectId: id,
            value: dateTime
          }
        });
      } else if (_.isNumber(dateTime)) {
        // numerical values can be directly verified and converted
        if (dateTime > maxTimeMs) {
          // suspicious date/time
          serviceContext.logger.warn(
            JSON.stringify({
              message:
                'bad numerical field ' +
                dateTime +
                ' on object ' +
                id +
                ', returning ' +
                dateTime / 1000,
              objectId: id,
              errorName: 'bad_date_time',
              event: 'warning'
            })
          );
          return dateTime / 1000; // we assume it was badly converted.
        }
      } else if (_.isString(dateTime)) {
        // string values must be parsed for verification
        const numVal = moment(dateTime).valueOf();
        if (_.isNaN(numVal)) {
          // now need to check for NaN again
          throw new errors.InvalidInput({
            message: 'bad numerical field ' + dateTime + ' on object ' + id,
            data: {
              objectId: id,
              value: dateTime
            }
          });
        } else if (numVal > maxTimeMs) {
          // convert and return back as string
          const real = moment(numVal / 1000).toISOString();
          serviceContext.logger.warn(
            JSON.stringify({
              message:
                'bad numerical field ' +
                dateTime +
                ' on object ' +
                id +
                ', returning ' +
                real,
              objectId: id,
              errorName: 'bad_date_time',
              event: 'warning'
            })
          );
          return real;
        }
      }
      // otherwise we don't know how to check it
      return dateTime;
    },
    stripSignatureSignedUrl,
    setCookie,
    requireTokenType,
    getUserIdFromAuthContext,
    asJsonObject,
    getUserShortenName,
    defineTaskOutputFailure: function (failureReason, failureMessage) {
      return dalUtil.defineTaskOutputFailure(failureReason, failureMessage);
    },
    generateVirtualTreeObjectId,
    parseVirtualTreeObjectId,
    checkMaxTDOLimit,
    getDirectivesFromInfo,
    verifyAccessViaScopeDirective,
    getUploadStatus,
    buildRootFolderName
  };
};
