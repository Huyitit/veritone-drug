const _ = require('lodash');

// Error codes returned by storage providers when the object does not exist yet.
// S3: NoSuchKey / NotFound, Azure: BlobNotFound / ContainerNotFound, Minio: NotFound
const NOT_FOUND_CODES = new Set([
  'NoSuchKey',
  'NotFound',
  'BlobNotFound',
  'ContainerNotFound'
]);

/**
 * Returns true when `err` represents an "object not found" error from a
 * storage provider (S3, Minio, Azure) or an HTTP 404 response.
 */
function isNotFoundError(err) {
  if (!err) return false;
  if (NOT_FOUND_CODES.has(err.code)) return true;
  if (err.statusCode === 404) return true;
  return false;
}

/**
 * Retry `fn` when it throws an "object not found" error, using exponential
 * back-off with jitter. Non-retryable errors propagate immediately.
 *
 * @param {Function} fn          - async function to call
 * @param {Object}   opts
 * @param {number}   opts.maxAttempts    - total attempts (including the first)
 * @param {number}   opts.initialDelayMs - delay before the first retry
 * @param {number}   opts.multiplier     - back-off multiplier
 * @param {number}   opts.maxDelayMs     - upper bound on delay
 * @param {number}   opts.jitter         - jitter factor (0-1), e.g. 0.1 = ±10%
 * @param {Function} opts.onRetry        - called with (err, attempt) before each wait
 * @param {Function} [opts.sleep]        - injectable delay for testing; defaults to setTimeout
 */
async function retryOnNotFound(fn, opts) {
  const {
    maxAttempts = 5,
    initialDelayMs = 500,
    multiplier = 2,
    maxDelayMs = 10000,
    jitter = 0.1,
    onRetry,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  } = opts;

  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isNotFoundError(err) || attempt === maxAttempts) {
        throw err;
      }
      
      const jitterMs = delay * jitter * (Math.random() * 2 - 1);
      const sleepMs = Math.min(delay + jitterMs, maxDelayMs);

      if (onRetry) onRetry(err, attempt, sleepMs);
      await sleep(sleepMs);
      delay = Math.min(delay * multiplier, maxDelayMs);
    }
  }
}

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const logger = serviceContext.logger;
  const httpUtil = require('../util/httpUtil.js')(serviceContext);
  const mainUtil = require('../util.js')(serviceContext);

  const retryMaxAttempts = _.get(config, 'assetSize.retryMaxAttempts', 5);
  const retryInitialDelayMs = _.get(config, 'assetSize.retryInitialDelayMs', 500);

  async function getAssetSize(asset) {
    if (
      asset.metadata &&
      _.isNumber(asset.metadata.size) &&
      asset.metadata.size != 0
    ) {
      return asset.metadata.size;
    }

    try {
      let assetSize;
      let sizeExternal = false;
      if (mainUtil.isFakeMediaAssetId(asset.id)) {
        assetSize = 0;
      } else {
        const assetType = asset.assetType || asset.type;
        const contentType = asset.contentType;
        // For following asset types, asset size should have been set in
        // metadata.size after the asset is ingested. If not, return null.
        if (
          (assetType === 'media' && contentType === 'application/json') ||
          assetType === 'media-mdp' ||
          assetType == 'mpeg-dash-manifest'
        ) {
          return null;
        }

        const retryOpts = {
          maxAttempts: retryMaxAttempts,
          initialDelayMs: retryInitialDelayMs,
          onRetry: (err, attempt, delayMs) => {
            logger.warn(
              `getAssetSize retry ${attempt}/${retryMaxAttempts} for asset ${asset.id} (${asset.uri}), waiting ${Math.round(delayMs)}ms: ${err.code || err.statusCode || err.message}`
            );
          }
        };

        const bucket = httpUtil.getBucket(asset.uri);
        if (!_.isNil(bucket)) {
          const dalStorage = serviceContext.dal.dalStorage;
          const assetInfo = await retryOnNotFound(
            () => dalStorage.getBlobInfo(asset.uri, bucket),
            retryOpts
          );
          assetSize = assetInfo.contentLength;
        } else {
          sizeExternal = true;
          const headers = await retryOnNotFound(
            () => httpUtil.getHeaders(asset.uri),
            retryOpts
          );
          if (!_.isNil(headers['content-length'])) {
            assetSize = Number(headers['content-length']);
          } else {
            throw new Error(
              `Missing content-length from HEAD request. uri: ${asset.uri}; headers: ${headers}`
            );
          }
        }
      }

      if (_.isNumber(assetSize)) {
        await serviceContext.dal.asset.updateAssetSize(asset.id, assetSize);
        await serviceContext.dal.asset.updateAssetSizeExternal(
          asset.id,
          sizeExternal
        );
        if (asset.metadata && asset.metadata.sizeError)
          updateAssetSizeError(asset.id, null);
      }
      return assetSize;
    } catch (err) {
      logger.error(`${err.message}. asset id: ${asset.id}`, err);
      updateAssetSizeError(asset.id, err.message);
      return 0;
    }
  }

  async function updateAssetSizeError(assetId, errorMsg) {
    try {
      if (errorMsg) await serviceContext.dal.asset.updateAssetSize(assetId, 0);
      await serviceContext.dal.asset.updateAssetSizeError(assetId, errorMsg);
    } catch (err) {
      logger.error(
        `Error updating asset size error: ${err.message}. Asset id: ${assetId}`,
        err
      );
    }
  }

  return {
    getAssetSize,
    _retryOnNotFound: retryOnNotFound,
    _isNotFoundError: isNotFoundError
  };
};
