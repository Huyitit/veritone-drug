/**
 * Returns a parsed {@link S3Uri} with which a user can easily retrieve the bucket, key, region, style, and query
 * parameters of the URI. Only path-style and virtual-hosted-style URI parsing is supported, including CLI-style
 * URIs, e.g., "s3://bucket/key". AccessPoints and Outposts URI parsing is not supported. If you work with object keys
 * and/or query parameters with special characters, they must be URL-encoded, e.g., replace " " with "%20". If you work with
 * virtual-hosted-style URIs with bucket names that contain a dot, i.e., ".", the dot must not be URL-encoded. Encoded
 * buckets, keys, and query parameters will be returned decoded.
 *
 * <p>
 * For more information on path-style and virtual-hosted-style URIs, see <a href=
 * "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-bucket-intro.html"
 * >Methods for accessing a bucket</a>.
 * */

const { URL } = require('node:url');
const _ = require('lodash');

module.exports = function (serviceContext) {
  const config = serviceContext.config;
  const errors = require('../error')(config);

  function parseUri(uri) {
    const url = new URL(uri);
    validateUri(url);
    if ('s3:' === url.protocol) {
      return parseAwsCliStyleUri(url, uri);
    }
    return parseStandardUri(url, uri);
  }

  function validateUri(url) {
    // check if the URI is a valid S3 URI
    const str = url.toString();
    if (str.indexOf('.s3-accesspoint') >= 0) {
      throw new errors.InvalidInput({
        message: 'AccessPoints URI parsing is not supported',
        data: {
          uri: str
        }
      });
    }
    if (str.indexOf('.s3-outposts') >= 0) {
      throw new errors.InvalidInput({
        message: 'Outposts URI parsing is not supported',
        data: {
          uri: str
        }
      });
    }
  }

  function parseAwsCliStyleUri(url) {
    const bucket = url.host;
    let path = url.pathname;

    if (_.isEmpty(bucket)) {
      throw new errors.InvalidInput({
        message: 'Bucket name is required',
        data: {
          uri: url.toString()
        }
      });
    }

    if (path.length > 1) {
      path = path.substring(1);
    }

    return {
      uri: url.toString(),
      bucket: decodeURIComponent(bucket),
      key: decodeURIComponent(path),
      isPathStyle: false
    };
  }

  const ENDPOINT_PATTERN = /^(.+\.)?s3[.-]([a-z0-9-]+)\./u;

  function parseStandardUri(url, originalUri) {
    if (_.isEmpty(url.host)) {
      throw new errors.InvalidInput({
        message: 'Invalid S3 URI: no hostname',
        data: {
          uri: url.toString()
        }
      });
    }

    const match = ENDPOINT_PATTERN.exec(url.host);
    if (!match) {
      throw new errors.InvalidInput({
        message:
          'Invalid S3 URI: hostname does not appear to be a valid S3 endpoint',
        data: {
          uri: url.toString()
        }
      });
    }

    const s3Uri = {
      uri: originalUri,
      region: match[2],
      query: url.searchParams
    };
    const prefix = match[1];
    if (!prefix) {
      return parsePathStyleUri(s3Uri, url);
    }
    return parseVirtualHostedStyleUri(s3Uri, url, prefix, originalUri);
  }

  function parsePathStyleUri(s3Uri, url) {
    const path = url.pathname;
    if (path && path.length && path !== '/') {
      const idx = path.indexOf('/', 1);
      if (idx == -1) {
        // No trailing slash, e.g., "https://s3.amazonaws.com/bucket"
        s3Uri.bucket = decodeURIComponent(path.substring(1));
      } else {
        s3Uri.bucket = decodeURIComponent(path.substring(1, idx));
        if (idx !== path.length - 1) {
          s3Uri.key = decodeURIComponent(path.substring(idx + 1));
        }
      }
    }
    s3Uri.isPathStyle = true;
    return s3Uri;
  }

  function parseVirtualHostedStyleUri(s3Uri, url, prefix, originalUri) {
    // url.host is lowercased by the URL constructor,
    // however s3 bucket names are case sensitive
    const pIdx = originalUri.toLowerCase().indexOf(prefix.toLowerCase());
    s3Uri.bucket = decodeURIComponent(
      originalUri.substring(pIdx, pIdx + prefix.length - 1)
    );

    const path = url.pathname;
    if (path && path.length && path !== '/') {
      s3Uri.key = decodeURIComponent(path.substring(1));
    }
    return s3Uri;
  }

  return {
    parseUri
  };
};
