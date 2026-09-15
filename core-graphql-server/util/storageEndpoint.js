'use strict';

const _ = require('lodash');

/**
 * Whether this instance must host the local storage-upload proxy — the
 * `PUT /storage/:key/:chunkNumber?` route in routes/signedWritableUrl.js.
 *
 * getSignedWritableUrls (resolvers/util.js) returns a `${storageEndpoint}/<key>`
 * upload URL — instead of a direct provider presigned link — whenever
 * `featureFlags.signedWritableUrlOverride` or `oci.enabled` is set. When that
 * URL points back at this instance, two things in server.js must gate on the
 * same condition or self-hosted OCI uploads break:
 *   1. the storage-endpoint request must bypass the JSON body parser so the
 *      upload route can read the raw request stream, and
 *   2. the route that serves the endpoint must be registered.
 * Deriving both from this single predicate keeps them from drifting apart.
 *
 * NOTE: azure_blob.enabled carries the same asymmetry and can be addressed
 * separately (VE-23156).
 *
 * @param {Object} config – resolved service config
 * @returns {boolean}
 */
function isLocalStorageEndpointEnabled(config) {
  return (
    _.get(config, 'featureFlags.signedWritableUrlOverride', false) === true ||
    _.get(config, 'oci.enabled', false) === true
  );
}

module.exports = { isLocalStorageEndpointEnabled };
