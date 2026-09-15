const rp = require('request-promise');
const _ = require('lodash');
const { StatusCodeError, RequestError } = require('request-promise/errors');
const URL = require('url-parse');
const http = require('http');
const https = require('https');
const moment = require('moment');
const sanitizeHtml = require('sanitize-html');
const s3UriParser = require('amazon-s3-uri');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const userAgent = config.userAgent || 'core-graphql-server 1.0.0';
  const errors = require('../error')(config);

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

  const logAll = _.get(config, 'log.http.all', true) === true;
  const logError = _.get(config, 'log.http.error', true) === true;

  function isInternalUrl(url) {
    return (
      url && (url.includes(envUrlInternal) || url.includes(envUrlExternal))
    );
  }

  function isS3(uri) {
    if (typeof uri !== 'string') return false;
    return uri.includes('s3') || uri.includes('amazonaws');
  }

  function isAzure(uri) {
    if (typeof uri !== 'string') return false;
    return (
      _.get(config, 'azure_blob.enabled', false) === true &&
      uri.includes('blob') &&
      uri.includes(
        _.get(config, 'azure_blob.endpointSuffix', 'core.windows.net')
      )
    );
  }

  function isOci(uri) {
    if (typeof uri !== 'string') return false;
    // VE-25065: gate OCI detection on OCI being active somewhere in config,
    // mirroring isAzure/isMinio. A legacy OCI URI left behind after OCI is
    // fully reverted must NOT be classified as OCI, otherwise it is treated
    // as an owned, signable object and either throws InternalServerError 2088
    // (getSignedUrlExp path) or gets signed to the wrong host (presigner path).
    // OCI is active when oci.enabled is true (active write backend, s3Util's
    // shim gate) OR any bucket/fallback declares cloudProvider 'oci' — the
    // VE-26007 inverse-migration shape (AWS primary, OCI fallback holding
    // unmigrated objects) runs with oci.enabled=false and must keep signing.
    // Single source of truth: presigner detectCloudProvider defers here.
    const ociActive =
      _.get(config, 'oci.enabled', false) === true ||
      _.get(config, 's3.buckets', []).some(
        (b) =>
          _.get(b, 'cloudProvider') === 'oci' ||
          _.get(b, 'fallback.cloudProvider') === 'oci'
      );
    return (
      ociActive &&
      uri.includes('oraclecloud.com') &&
      uri.includes('.compat.objectstorage.')
    );
  }

  function isMinio(uri) {
    if (typeof uri !== 'string') return false;
    const minioEnabled = _.get(config, 'minio.enabled', false);
    if (!minioEnabled) return false;
    const minioEndpoint = _.get(config, 'minio.endPoint');
    return minioEndpoint && uri.includes(minioEndpoint);
  }

  function getBucket(uri) {
    if (!uri) return null;
    let buckets = [_.get(config, 's3.bucket')];
    const bucketConfigs = _.get(config, 's3.buckets', []);
    for (const b of bucketConfigs) {
      buckets.push(b.name || b.key);
      // Fallback buckets live on a different provider/name (e.g. an AWS
      // `stage-api.veritone.com` behind an OCI primary). A URI can point
      // straight at the fallback, so its name must be a matchable candidate —
      // otherwise presignUrl's reverse-fallback lookup never fires.
      const fallbackName = _.get(b, 'fallback.bucketName');
      if (fallbackName) buckets.push(fallbackName);
    }
    buckets = buckets.filter((x) => x);
    const isS3Uri = isS3(uri);
    const isAzureUri = isAzure(uri);
    const isOciUri = isOci(uri);
    const isMinioEnabled = _.get(config, 'minio.enabled', false);
    const minioEndpoint = _.get(config, 'minio.endPoint');
    const isMinioUri = isMinioEnabled && uri.includes(minioEndpoint);

    const parsedUrl = new URL(uri);
    let bucketName;
    // bucket in the prefix of the hostname e.x.https://my-bucket.s3.us-west-2.amazonaws.com/
    if (isS3Uri) {
      const s3pos = parsedUrl.hostname.indexOf('.s3.');
      if (s3pos) {
        bucketName = parsedUrl.hostname.substr(0, s3pos);
      }
    } else if (isMinioUri) {
      let minioHost = minioEndpoint;
      try {
        minioHost = new URL(minioEndpoint).host;
      } catch (_err) {
        minioHost = minioEndpoint;
      }
      const hostPos = parsedUrl.host.indexOf(minioEndpoint);
      if (hostPos > 0) {
        bucketName = parsedUrl.hostname.substr(0, hostPos);
      }
    }

    // bucket in the path ex. https://s3.us-west-2.amazonaws.com/mybucket/
    if (!bucketName) {
      const pathComponents = parsedUrl.pathname.split('/').filter((x) => x);
      if (pathComponents.length) {
        bucketName = pathComponents[0];
      }
    }
    bucketName = bucketName ? bucketName.toLowerCase() : '';

    const uriBuckets = buckets.filter((bucket) => {
      if (isMinioUri || isS3Uri || isOciUri) {
        return (
          bucketName === bucket.toLowerCase() && !uri.includes('media-streamer')
        );
      } else {
        return (
          uri.includes(bucket) && !uri.includes('media-streamer') && isAzureUri
        );
      }
    });

    return _.get(uriBuckets, '0', null);
  }

  function isOurBucket(uri) {
    return getBucket(uri) != null;
  }

  function getHttpPoolOptions(uri) {
    const parsed = new URL(uri);
    const key = getUrlKey(uri, parsed);

    // default to a shared pool
    let pool = parsed.protocol === 'http:' ? defaultPoolHttp : defaultPoolHttps;
    const poolConfig = getPoolConfig(uri, parsed);
    let poolName = 'general';
    const isHttps = parsed.protocol.toLowerCase().startsWith('https');

    if (isInternalUrl(uri) || isOurBucket(uri)) {
      // use a pool for this specific host/path
      pool = pools[key];
      poolName = key;
      if (!pool) {
        // make a new instance if necessary
        pool = isHttps ? new https.Agent() : new http.Agent();
        // apply custom max sockets, if set
        pool.maxSockets = poolConfig.maxSockets;

        pools[key] = pool;
        serviceContext.logger.debug(
          'HTTP client pool set up for ' +
            key +
            ' with ' +
            pool.maxSockets +
            ' max sockets'
        );
      }
    }
    return {
      poolOptions: {
        isHttps,
        poolName,
        agent: pool,
        timeout: poolConfig.timeoutMillis,
        time: true, // tells requests to add timing info to response object
        simple: true // tells request-promise to reject promise on non-20x
      },
      poolConfig
    };
  }

  /**
   * gets an HTTP pool option.
   * from httpPools.<key>.<option> if available.
   * otherwise from httpPools.<option>, applying
   * default if given.
   * @param key The HTTP pool key (internal hostname and path)
   * @param option the option, such as timeoutMillis
   * @param defaultValue Optional default value
   */
  function getPoolConfigOption(key, option, defaultValue) {
    // here we extract config manually instead of _.get because
    // . in keys (hostnames) does not work with _.get.
    const allPools = config.httpPools || {};
    let poolConfig = allPools[key];
    const def = _.get(config, `httpPools.${option}`, defaultValue);
    if (!poolConfig) return def;
    return poolConfig[option] || def;
  }

  function getPoolConfig(uri, parsed) {
    const key = getUrlKey(uri, parsed);
    const res = {
      timeoutMillis: getPoolConfigOption(key, 'timeoutMillis', 4000),
      name: key,
      // max retries allowed.
      // default 2.
      maxRetries: getPoolConfigOption(key, 'maxRetries', 2)
    };

    // for internal URLs we'll apply some additional options
    if (isInternalUrl(uri) || isOurBucket(uri)) {
      // max sockets for this pool/backend.
      // default 50.
      res.maxSockets = getPoolConfigOption(key, 'maxSockets', 50);

      // max HTTP response time for a failed request that might be retried.
      // default is 5s.
      res.maxRetryResponseTimeMillis = getPoolConfigOption(
        key,
        'maxRetryResponseTimeMillis',
        11000
      );
      // set of HTTP status codes that cn be retried.
      // default is 502 and 503.
      res.retryableStatusCodes = getPoolConfigOption(
        key,
        'retryableStatusCodes',
        [502, 503, 504, 429]
      );
      // factor to multiply num retries by to get wait time between retries, in sec.
      // default is 5s
      res.retryWaitMultipleSec = getPoolConfigOption(
        key,
        'retryWaitMultipleSec',
        5
      );
    }
    return res;
  }

  function getUrlPathFirstPart(uri, parsed) {
    const pathElems = parsed.pathname.split('/');
    const path =
      pathElems.length >= 3
        ? pathElems[1] + '/' + pathElems[2]
        : pathElems.length >= 1
        ? pathElems[1]
        : parsed.pathname;
    return path;
  }

  function getUrlKey(uri, parsed) {
    const path = getUrlPathFirstPart(uri, parsed);
    const host = parsed.hostname;
    // for internal, include path (API service)
    if (isInternalUrl(uri)) return parsed.protocol + '//' + host + '/' + path;
    // for s3, return just s3 part
    if (isOurBucket(uri)) return parsed.protocol + '//s3.amazonaws.com';
    // otherwise include host
    return parsed.protocol + '//' + host;
  }

  /**
   * Determine if a given HTTP error is retryable.
   *
   * @param uri The URI
   * @param error The error encountered
   * @param startTime time request was initiated
   * @param poolConfig The HTTP pool configuration
   * @param numRetries Retries attempted so far
   */
  function isRetryable(uri, error, startTime, poolConfig, numRetries) {
    // stop if max retries exceeded or retry disabled/not configured
    if (numRetries >= poolConfig.maxRetries || !poolConfig.maxRetries)
      return false;

    const statusCode = getStatusCode(error);
    // if we don't have a status code then it wasn't an HTTP error,
    // but something else we can't safely retry.
    const retryableErrorText = _.get(config, 'http.retryableErrorText', [
      'ECONNRESET',
      'ETIMEDOUT',
      'ESOCKETTIMEDOUT',
      'EAI_AGAIN',
      'ECONNREFUSED',
      'socket hang up'
    ]);
    const retryableStatusCodes = poolConfig.retryableStatusCodes || [];

    if (_.isNil(statusCode)) {
      // only a limited set of errors can be retried
      for (let i = 0; i < retryableErrorText.length; i++) {
        const text = retryableErrorText[i];
        if (
          (error.message && error.message.includes(text)) ||
          (error.stack && error.stack.includes(text))
        ) {
          return true;
        }
      }

      return false;
    } else if (!retryableStatusCodes.includes(statusCode))
      // retry only on configured codes (502, maybe 503, etc.)
      return false;

    // don't retry if the last request response time exceeded the max allowed
    // for retries
    const now = Date.now();
    const duration = now - startTime;

    if (duration > poolConfig.maxRetryResponseTimeMillis) return false;

    // otherwise we can retry
    return true;
  }

  function logHttpCall(
    url,
    elapsedMs,
    responseSizeBytes,
    httpStatusCode,
    poolName,
    error,
    retries
  ) {
    const data = {
      url,
      elapsedMs,
      responseSizeBytes,
      httpStatusCode,
      pool: poolName,
      event: 'httpCall',
      retries: retries || 0,
      success: _.isNil(error) ? true : false,
      errorId: error ? error.id : undefined
    };
    if (logAll || (!data.success && logError)) {
      serviceContext.messageUtil.emitEvent(data);
    }
  }

  function getStatusCode(error) {
    const code =
      error.statusCode ||
      _.get(
        error,
        'data.httpStatusCode',
        _.get(
          error,
          'data.internalData.httpStatusCode',
          _.get(error, 'data.error.code')
        )
      );
    return code;
  }

  function recordHttpError(url, error, elapsedMs, poolName, retries) {
    const labels = { pool: poolName };
    const code = getStatusCode(error);
    if (!_.isNil(code)) {
      labels.status = code;
    }
    serviceContext.metrics.incrementCounter('httpError', labels);

    logHttpCall(url, elapsedMs, 0, code, poolName, error, retries);
  }

  function getHeaders(uri) {
    const parsed = new URL(uri);
    const httpd = parsed.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
      httpd
        .request(uri, { method: 'HEAD' }, (res) => {
          // Drain the response so the underlying socket can be reused.
          res.resume();

          if (res.statusCode === 404) {
            const err = new Error(`HEAD ${uri} returned 404`);
            err.statusCode = 404;
            return reject(err);
          }
          resolve(res.headers ? res.headers : {});
        })
        .on('error', (err) => {
          reject(err);
        })
        .end();
    });
  }

  function uriParser(uri) {
    const bucket = getBucket(uri);
    let key = null;

    if (isS3(uri)) {
      try {
        const s3URI = s3UriParser(uri);
        key = s3URI.key;
      } catch (error) {
        key = null;
      }
    } else {
      const parsedUrl = new URL(uri);
      const index = parsedUrl.pathname.indexOf('/', 1);
      if (index === -1) {
        key = null;
      } else if (index === parsedUrl.pathname.length - 1) {
        key = null;
      } else {
        key = parsedUrl.pathname.substring(index + 1);
      }
    }

    return {
      bucket,
      key
    };
  }

  return {
    isRetryable,
    getPoolConfig,
    isOurBucket,
    getBucket,
    isS3,
    isAzure,
    isOci,
    isMinio,
    recordHttpError,
    logHttpCall,
    getHttpPoolOptions,
    getHeaders,
    uriParser
  };
};
