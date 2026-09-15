/**
 * Unified multi-provider presigner singleton.
 *
 * Supports AWS S3, OCI Object Storage (S3-compatible), and Azure Blob Storage.
 * Handles multi-bucket configurations with primary↔fallback relationships for
 * storage migration scenarios (e.g., moving from AWS S3 to OCI, or any
 * combination of providers).
 *
 * Architecture:
 * - Each bucket has a `cloudProvider` field: 'aws' | 'oci' | 'azure'
 * - Each bucket can optionally declare a `fallback` (another bucket on a
 *   different provider) containing the same object keys
 * - On presignUrl(), if the URI's bucket is a fallback, we HEAD-check the
 *   primary first. If the object has migrated → sign primary; otherwise sign
 *   fallback.
 * - For AWS/OCI (both S3-compatible) we use @aws-sdk/s3-request-presigner
 * - For Azure we delegate to the existing storage/azure.js signing logic
 *   via serviceContext.s3Buckets[bucket].storage.getSignedUrlPromise()
 *
 * Usage:
 *   // In server.js during startup:
 *   require('./util/presigner').init(serviceContext);
 *
 *   // Anywhere after init:
 *   const presigner = require('./util/presigner').getInstance();
 *   const signedUrl = await presigner.presignUrl(uri, { ttl: 3600 });
 */

'use strict';

const { S3RequestPresigner } = require('@aws-sdk/s3-request-presigner');
const { URL: NodeURL } = require('url');
const { formatUrl } = require('@aws-sdk/util-format-url');
const {
  fromEnv,
  fromInstanceMetadata,
  createCredentialChain
} = require('@aws-sdk/credential-providers');
const { HttpRequest } = require('@smithy/protocol-http');
const { Hash } = require('@smithy/hash-node');
const _ = require('lodash');
const https = require('https');
const http = require('http');
const URL = require('url-parse');
const createTtlExistenceCache = require('./ttlExistenceCache');
const createRedisExistenceL2 = require('./redisExistenceL2');

// ---------------------------------------------------------------------------
// Cloud-provider constants
// ---------------------------------------------------------------------------
const CLOUD_PROVIDER_AWS = 'aws';
const CLOUD_PROVIDER_OCI = 'oci';
const CLOUD_PROVIDER_AZURE = 'azure';
const CLOUD_PROVIDER_MINIO = 'minio';

// ---------------------------------------------------------------------------
// AWS/OCI credential chain (S3-compatible providers)
// ---------------------------------------------------------------------------
const _rawCredentialChain = createCredentialChain(
  fromEnv(),
  fromInstanceMetadata({ timeout: 1000, maxRetries: 0 })
);

/**
 * Wrapping credential provider that validates the resolved credentials.
 */
const STATIC_CREDENTIALS_CHAIN = async () => {
  let creds;
  try {
    creds = await _rawCredentialChain();
  } catch (err) {
    throw new Error(
      `Failed to resolve AWS/OCI credentials from environment or instance metadata: ${err.message}`
    );
  }
  if (!creds || !creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error(
      'Credentials resolved but are incomplete. ' +
      `accessKeyId: ${creds?.accessKeyId ? 'present' : 'MISSING'}, ` +
      `secretAccessKey: ${creds?.secretAccessKey ? 'present' : 'MISSING'}. ` +
      'Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars are set, ' +
      'or configure explicit accessKey/secretKey in the bucket config.'
    );
  }
  return creds;
};

let instance = null;
let logger = console;

// ---------------------------------------------------------------------------
// URL parsing helpers
// ---------------------------------------------------------------------------

function parseUrlForSigning(urlStr) {
  const u = new NodeURL(urlStr);
  return {
    hostname: u.hostname,
    protocol: u.protocol,
    port: u.port ? parseInt(u.port, 10) : undefined,
    path: u.pathname + u.search,
    query: u.searchParams ? Object.fromEntries(u.searchParams) : {}
  };
}

// Cap for the encoded disposition filename: metadata names are unbounded and
// oversized ones risk request-line limits; 255 matches common FS name limits.
const MAX_DISPOSITION_FILENAME_LENGTH = 255;

/**
 * Attachment content-disposition for a presigned URL — legacy-shim parity
 * (VE-27981): encodeURI'd filename (double-encodes pre-encoded values, like
 * legacy), extension backfilled from the key basename; undefined if unencodable.
 */
function buildResponseContentDisposition(fileName, uri) {
  try {
    // Split the extension off so the clamp below can never eat it, whether it
    // came from the name itself or was backfilled from the key basename.
    let base = fileName;
    let ext = '';
    const dotAt = fileName.lastIndexOf('.');
    if (dotAt > 0) {
      base = fileName.slice(0, dotAt);
      ext = fileName.slice(dotAt);
    } else if (dotAt === -1) {
      // Strip any query/fragment first — an unsigned query the callers don't
      // strip (e.g. ?v=1.2) must not masquerade as the extension.
      const path = uri ? uri.split(/[?#]/)[0] : '';
      const basename = path.slice(path.lastIndexOf('/') + 1);
      const extAt = basename.lastIndexOf('.');
      if (extAt > -1) ext = basename.substring(extAt);
    }
    const encodedExt = encodeURI(ext);
    // An extension alone must not bust the cap (its tail can be attacker-
    // chosen via the key) — fail open like an unencodable name.
    if (encodedExt.length > MAX_DISPOSITION_FILENAME_LENGTH) return undefined;
    const budget = MAX_DISPOSITION_FILENAME_LENGTH - encodedExt.length;
    // Clamp per code point so a multi-byte escape is never split in half.
    let encoded = '';
    for (const ch of base) {
      const e = encodeURI(ch);
      if (encoded.length + e.length > budget) break;
      encoded += e;
    }
    return `attachment; filename="${encoded}${encodedExt}"`;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// URI detection & parsing (provider-agnostic)
// ---------------------------------------------------------------------------

/**
 * Detect cloud provider from a URI string.
 */
function detectCloudProvider(uri, httpUtil) {
  if (!uri) return null;
  if (httpUtil.isAzure && httpUtil.isAzure(uri)) return CLOUD_PROVIDER_AZURE;
  if (httpUtil.isMinio && httpUtil.isMinio(uri)) return CLOUD_PROVIDER_MINIO;
  if (httpUtil.isS3 && httpUtil.isS3(uri)) return CLOUD_PROVIDER_AWS;
  // VE-25065: defer to httpUtil.isOci (config-gated) instead of an inline
  // string-check, so a URI left behind after OCI is fully reverted is NOT
  // detected as OCI and presignUrl returns it unsigned. "Fully reverted" means
  // neither oci.enabled nor any bucket/fallback declaring cloudProvider 'oci'
  // — VE-26007's inverse-migration shape still counts as active and keeps
  // signing. Same predicate as the getSignedUrlExp path.
  if (httpUtil.isOci && httpUtil.isOci(uri)) return CLOUD_PROVIDER_OCI;
  return null;
}

/**
 * Parse bucket/container name and object key from a URI for any provider.
 */
function parseBucketAndKeyFromUri(uri) {
  if (!uri) return { bucketName: null, key: null };

  const parsedUrl = new URL(uri);
  let bucketName = null;
  let key = null;

  // --- Azure Blob: <account>.blob.<suffix>/<container>/<key> ---
  if (uri.includes('.blob.') && (uri.includes('core.windows.net') || uri.includes('blob.'))) {
    const pathComponents = parsedUrl.pathname.split('/').filter((x) => x);
    if (pathComponents.length >= 1) {
      bucketName = pathComponents[0]; // container name
    }
    if (pathComponents.length >= 2) {
      key = pathComponents.slice(1).join('/');
    }
    return { bucketName, key };
  }

  // --- AWS virtual-hosted style: <bucket>.s3.<region>.amazonaws.com/<key> ---
  const s3pos = parsedUrl.hostname.indexOf('.s3.');
  if (s3pos > 0) {
    bucketName = parsedUrl.hostname.substring(0, s3pos);
    if (parsedUrl.pathname && parsedUrl.pathname.length > 1) {
      key = parsedUrl.pathname.substring(1);
    }
    return { bucketName, key };
  }

  // --- OCI S3-compatible: <ns>.compat.objectstorage.<region>.oraclecloud.com/<bucket>/<key> ---
  if (uri.includes('oraclecloud.com') && uri.includes('.compat.objectstorage.')) {
    const pathComponents = parsedUrl.pathname.split('/').filter((x) => x);
    if (pathComponents.length >= 1) {
      bucketName = pathComponents[0];
    }
    if (pathComponents.length >= 2) {
      key = pathComponents.slice(1).join('/');
    }
    return { bucketName, key };
  }

  // --- AWS path-style: s3.<region>.amazonaws.com/<bucket>/<key> ---
  if (uri.includes('amazonaws') || uri.includes('s3')) {
    const pathComponents = parsedUrl.pathname.split('/').filter((x) => x);
    if (pathComponents.length >= 1) {
      bucketName = pathComponents[0];
    }
    if (pathComponents.length >= 2) {
      key = pathComponents.slice(1).join('/');
    }
    return { bucketName, key };
  }

  return { bucketName, key };
}

// ---------------------------------------------------------------------------
// URL builders (for S3-compatible providers)
// ---------------------------------------------------------------------------

/**
 * Object key a fallback-bucket object maps to inside its primary bucket.
 * Primaries that consolidate several logical buckets (e.g. one OCI bucket)
 * store each logical bucket's objects under its configured `path` prefix —
 * the storage backend writes `<path>/<key>`, while the fallback bucket holds
 * the bare `<key>`. Only keys parsed from FALLBACK URIs go through this
 * mapping; keys from primary URIs already carry the prefix and must never be
 * re-prefixed. Direction B applies the inverse (fallbackObjectKeyFor) before
 * touching a fallback bucket. VE-26007
 */
function primaryObjectKeyFor(primaryConf, objectKey) {
  return primaryConf && primaryConf.path
    ? `${primaryConf.path}/${objectKey}`
    : objectKey;
}

/**
 * Inverse of primaryObjectKeyFor: the key a primary-bucket object maps to
 * inside its fallback bucket. Strips the owning primary's `path` prefix
 * (carried on the normalized config as `primaryPath`) — the fallback bucket
 * predates consolidation and stores the bare key. Keys that don't carry the
 * prefix (hybrid byName candidates whose path didn't match) pass through
 * unchanged. VE-26007
 */
function fallbackObjectKeyFor(fbConfig, objectKey) {
  const path = fbConfig && fbConfig.primaryPath;
  return path && objectKey.startsWith(`${path}/`)
    ? objectKey.slice(path.length + 1)
    : objectKey;
}

function buildAwsS3Url(bucket, region, key) {
  // Path-style, not virtual-hosted: legacy bucket names contain dots
  // (e.g. stage-api.veritone.com), and a dotted bucket used as a hostname
  // prefix fails TLS wildcard validation (*.s3.<region>.amazonaws.com
  // covers exactly one label) — ERR_TLS_CERT_ALTNAME_INVALID in staging.
  return `https://s3.${region}.amazonaws.com/${bucket}/${key}`;
}

/**
 * Percent-encode a decoded object key for use in a signable URL path,
 * segment by segment (path separators preserved).
 *
 * Strict RFC 3986: encodeURIComponent leaves the sub-delimiters !'()* raw,
 * but OCI's S3-compat layer normalizes request paths to canonical RFC 3986
 * form before signature verification — a path signed with a raw "(" never
 * matches the "%28" OCI verifies against, so keys with such characters 403
 * (VE-26276). Input must be the DECODED key (as produced in presignUrl), so
 * encoding is applied exactly once.
 */
function encodeObjectKeyForUrl(key) {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

function buildOciS3CompatUrl(namespace, region, bucket, key) {
  // Raw key on purpose: buildProviderUrl output is not just signed — it is
  // persisted to asset.uri (onPrimaryHit) and fed to deletion
  // (getDeletableUris → storage shim). The OCI storage shim now decodes
  // extracted keys best-effort (getOCIBucketAndKey, VE-26276), but the
  // AWS-side consumers still parse WITHOUT decoding, and deletion URIs can
  // target AWS fallback buckets. Encoding belongs to the signable boundary
  // only — see buildSignableProviderUrl (VE-26276 review gate).
  return `https://${namespace}.compat.objectstorage.${region}.oraclecloud.com/${bucket}/${key}`;
}

/**
 * buildProviderUrl for a path that will be SIGNED or HEAD-probed (wire form),
 * as opposed to persisted or handed to the storage shim (raw form).
 *
 * OCI's S3-compat layer normalizes request paths to canonical RFC 3986 form
 * before signature verification, so the literal path we sign must already be
 * canonically encoded or keys with characters like "()" 403 (VE-26276). AWS
 * verifies signatures against the literal path as received, so AWS URLs stay
 * raw and byte-identical — with a known latent gap: raw "#" or "?" in an AWS
 * key is truncated by URL parsing before signing, unchanged by this fix.
 */
function buildSignableProviderUrl(bucketConf, key) {
  const provider = bucketConf.cloudProvider || CLOUD_PROVIDER_AWS;
  const signableKey =
    provider === CLOUD_PROVIDER_OCI ? encodeObjectKeyForUrl(key) : key;
  return buildProviderUrl(bucketConf, signableKey);
}

function buildAzureBlobUrl(account, container, key, endpointSuffix) {
  const suffix = endpointSuffix || 'core.windows.net';
  return `https://${account}.blob.${suffix}/${container}/${key}`;
}

function buildMinioUrl(endpoint, port, secure, bucket, key) {
  const protocol = secure ? 'https' : 'http';
  const portSuffix = port ? `:${port}` : '';
  return `${protocol}://${endpoint}${portSuffix}/${bucket}/${key}`;
}

/**
 * Build an unsigned URL appropriate for the bucket's cloud provider.
 */
function buildProviderUrl(bucketConf, key) {
  const provider = bucketConf.cloudProvider || CLOUD_PROVIDER_AWS;
  switch (provider) {
    case CLOUD_PROVIDER_OCI:
      return buildOciS3CompatUrl(bucketConf.namespace, bucketConf.region, bucketConf.name, key);
    case CLOUD_PROVIDER_AZURE:
      return buildAzureBlobUrl(bucketConf.account, bucketConf.name, key, bucketConf.endpointSuffix);
    case CLOUD_PROVIDER_MINIO:
      return buildMinioUrl(bucketConf.minioEndpoint, bucketConf.minioPort, bucketConf.minioSecure, bucketConf.name, key);
    default:
      return buildAwsS3Url(bucketConf.name, bucketConf.region, key);
  }
}

// ---------------------------------------------------------------------------
// HEAD-request helper (works for any provider's presigned URL)
// ---------------------------------------------------------------------------

const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

function headObjectExists(presignedHeadUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const parsedUrl = new URL(presignedHeadUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      presignedHeadUrl,
      {
        method: 'HEAD',
        timeout: timeoutMs,
        agent: isHttps ? keepAliveHttpsAgent : keepAliveHttpAgent
      },
      (res) => {
        res.resume();
        const isAccessible = (res.statusCode === 200 || res.statusCode === 304);
        resolve(isAccessible);
      }
    );
    req.on('error', (err) => {
      if (!instance) return resolve(false);
      const host = parsedUrl.hostname || 'unknown';
      logger.warn(`[presigner] HEAD request error for ${host}: ${err.message}`);
      resolve(false);
    });
    req.on('timeout', () => {
      if (!instance) return resolve(false);
      const host = parsedUrl.hostname || 'unknown';
      logger.warn(`[presigner] HEAD request timeout after ${timeoutMs}ms for ${host}`);
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Config map builders
// ---------------------------------------------------------------------------

/**
 * Build a map from bucket/container name → config.
 * Supports all three providers via the `cloudProvider` field.
 */
function buildBucketConfigMap(config, credentials) {
  const s3Config = _.get(config, 's3', {});
  const rawBuckets = _.get(config, 's3.buckets', []);
  const defaultRegion = s3Config.region || 'us-east-1';
  const defaultSignedUrlExpires = s3Config.signedUrlExpires || 10800;

  // Effective provider for bucket entries with no explicit cloudProvider: an
  // enabled backend wins (minio first — pre-existing precedence), because on
  // such deployments the entries describe that backend's containers.
  // VE-26806: azure_blob.enabled was previously ignored here, so Azure
  // deployments resolved provider-less entries as "aws" and SigV4-signed them
  // into amazonaws.com-host URLs — wrong-cloud locators. Per-bucket
  // cloudProvider still overrides this default for hybrid configs.
  const minioEnabled = _.get(config, 'minio.enabled', false);
  const minioConf = _.get(config, 'minio', {});
  const azureBlobEnabled = _.get(config, 'azure_blob.enabled', false);
  const topLevelCloudProvider = minioEnabled
    ? CLOUD_PROVIDER_MINIO
    : azureBlobEnabled
      ? CLOUD_PROVIDER_AZURE
      : s3Config.cloudProvider || CLOUD_PROVIDER_AWS;

  const topLevelAccessKey = _.get(credentials, 'accessKey') || s3Config.accessKey || null;
  const topLevelSecretKey = _.get(credentials, 'secretKey') || s3Config.secretKey || null;
  const topLevelCredentialId = s3Config.accessCredentialId || null;

  // OCI top-level config (credentials for S3-compatible access)
  const ociConfig = _.get(config, 'oci', {});
  const ociAccessKey = ociConfig.accessKey || null;
  const ociSecretKey = ociConfig.secretKey || null;
  const ociCredentialId = ociConfig.accessCredentialId || null;

  // Azure top-level config
  const azureConfig = _.get(config, 'azure_blob', {});

  // Normalize: s3.buckets can be an array [{key, name, ...}] or an object {key: {name, ...}}
  let s3Buckets;
  if (Array.isArray(rawBuckets)) {
    s3Buckets = rawBuckets;
  } else if (rawBuckets && typeof rawBuckets === 'object') {
    s3Buckets = Object.entries(rawBuckets).map(([key, val]) => ({ key, ...val }));
  } else {
    s3Buckets = [];
  }

  const map = {};

  for (const [order, bucket] of s3Buckets.entries()) {
    if (!bucket.name && !bucket.key) continue;

    const bucketName = bucket.name || bucket.key;
    const provider = bucket.cloudProvider || topLevelCloudProvider;

    // Credential precedence:
    // 1. accessCredentialId on bucket → use exclusively (ignore all keys)
    // 2. accessKey/secretKey on bucket → use bucket-level keys (no top-level fallback)
    // 3. Neither → provider/top-level keys, then top-level accessCredentialId
    let resolvedAccessKey = null;
    let resolvedSecretKey = null;
    let resolvedCredentialId = null;

    if (bucket.accessCredentialId) {
      resolvedCredentialId = bucket.accessCredentialId;
    } else if (bucket.accessKey || bucket.secretKey) {
      resolvedAccessKey = bucket.accessKey || null;
      resolvedSecretKey = bucket.secretKey || null;
    } else {
      resolvedAccessKey = (provider === CLOUD_PROVIDER_OCI ? ociAccessKey : null) || topLevelAccessKey;
      resolvedSecretKey = (provider === CLOUD_PROVIDER_OCI ? ociSecretKey : null) || topLevelSecretKey;
      // No inline keys anywhere → defer to an external credential id so the
      // aws-sdk signer resolves the stored access/secret at first use. For
      // OCI-provider buckets, oci.accessCredentialId overrides the top-level one.
      if (!resolvedAccessKey && !resolvedSecretKey) {
        resolvedCredentialId =
          (provider === CLOUD_PROVIDER_OCI ? ociCredentialId : null) ||
          topLevelCredentialId;
      }
    }

    const bucketConf = {
      key: bucket.key,
      name: bucketName,
      cloudProvider: provider,
      // Default OCI-provider path from oci.path so the object-key prefix written
      // by the storage backend matches the fallback-group lookup (Direction B).
      path:
        bucket.path ||
        (provider === CLOUD_PROVIDER_OCI ? ociConfig.path || null : null),
      // Config-definition order — used to break ties when an object is found in
      // more than one candidate fallback (lowest order wins).
      order,
      region: bucket.region || defaultRegion,
      namespace: bucket.namespace || _.get(config, 'oci.namespace') || null,
      signedUrlExpires: bucket.signedUrlExpires || defaultSignedUrlExpires,
      accessKey: resolvedAccessKey,
      secretKey: resolvedSecretKey,
      accessCredentialId: resolvedCredentialId,
      fallback: bucket.fallback || null,
      // Azure-specific fields — only meaningful for Azure buckets. Populating
      // them for AWS/OCI/MinIO produced a bogus `endpointSuffix:
      // 'core.windows.net'` on every config (buildProviderUrl self-defaults the
      // suffix for Azure anyway, so the global default was pure noise).
      account: provider === CLOUD_PROVIDER_AZURE
        ? (bucket.account || azureConfig.account || null)
        : null,
      endpointSuffix: provider === CLOUD_PROVIDER_AZURE
        ? (bucket.endpointSuffix || azureConfig.endpointSuffix || 'core.windows.net')
        : null,
      // MinIO-specific fields
      minioEndpoint: bucket.minioEndpoint || minioConf.endPoint || null,
      minioPort: bucket.minioPort || minioConf.port || null,
      minioSecure: _.isBoolean(bucket.minioSecure) ? bucket.minioSecure : (minioConf.secure || false)
    };

    map[bucketName] = bucketConf;
    if (bucket.key && bucket.key !== bucketName) {
      map[bucket.key] = bucketConf;
    }
  }

  return map;
}

/**
 * Normalise a primary bucket's `fallback` declaration into a full config object
 * suitable for HEAD-checking and signing (same shape used by headCheckBucket /
 * signUrl). Inherits region/namespace/etc. from the primary when not overridden.
 */
function normalizeFallbackConfig(bucketConf) {
  const fb = bucketConf.fallback;
  const provider = fb.cloudProvider || CLOUD_PROVIDER_AWS;
  const isAzure = provider === CLOUD_PROVIDER_AZURE;
  return {
    cloudProvider: provider,
    // Marks this config as a fallback declaration: credential resolution and
    // HEAD-probe presigner selection must stay within this block and must not
    // consult presignerMap/bucketConfigMap, whose logical keys can equal a
    // foreign fallback bucket's name. VE-26007
    isFallback: true,
    bucketName: fb.bucketName,
    name: fb.bucketName, // used by headCheckBucket
    // Owning primary's consolidation prefix — fallbackObjectKeyFor strips it
    // when a primary-URI key is probed/signed against this fallback. VE-26007
    primaryPath: bucketConf.path || null,
    region: fb.region || bucketConf.region,
    namespace: fb.namespace || _.get(bucketConf, 'namespace') || null,
    signedUrlExpires: fb.signedUrlExpires || bucketConf.signedUrlExpires,
    accessCredentialId: fb.accessCredentialId || null,
    accessKey: fb.accessKey || null,
    secretKey: fb.secretKey || null,
    // Azure-only fields; null for AWS/OCI/MinIO fallbacks (see buildBucketConfigMap).
    account: isAzure ? (fb.account || bucketConf.account || null) : null,
    endpointSuffix: isAzure
      ? (fb.endpointSuffix || bucketConf.endpointSuffix || 'core.windows.net')
      : null,
    // Propagate MinIO fields from primary to fallback if they aren't overridden
    minioEndpoint: fb.minioEndpoint || bucketConf.minioEndpoint || null,
    minioPort: fb.minioPort || bucketConf.minioPort || null,
    minioSecure: fb.minioSecure !== undefined ? fb.minioSecure : bucketConf.minioSecure
  };
}

/**
 * Build reverse-lookup: fallbackBucketName → { primaryBucketConf, fallbackConfig }.
 */
function buildFallbackMap(bucketConfigMap) {
  const fallbackMap = {};
  const seen = new Set();

  for (const bucketConf of Object.values(bucketConfigMap)) {
    // Dedup by logical bucket `key`, not `name`. bucketConfigMap holds each
    // bucketConf under both its name and its key, and multiple logical buckets
    // can share one physical name (e.g. many logical buckets consolidated onto a
    // single OCI bucket). Deduping by name would collapse them to one fallback
    // entry; deduping by key registers each logical bucket's fallback.
    // @sminkov — VE-24702 (OCI storage / virtual assets)
    const dedupId = bucketConf.key || bucketConf.name;
    if (!bucketConf.fallback || seen.has(dedupId)) continue;
    seen.add(dedupId);

    const fb = bucketConf.fallback;
    if (!fb.bucketName) continue;

    fallbackMap[fb.bucketName] = {
      primaryBucketConf: bucketConf,
      fallbackConfig: normalizeFallbackConfig(bucketConf)
    };
  }

  return fallbackMap;
}

/**
 * Build the primary→fallback candidate index for Direction B resolution
 * (a primary-bucket URI whose object is missing in the primary).
 *
 * Because multiple logical buckets can share one physical primary name, a
 * single (name, object-key) cannot statically identify the correct fallback.
 * We instead group every logical bucket's fallback by physical `name` and by
 * `name + path`, then probe candidates at request time (existence is truth).
 *
 * Returns:
 *   - byName:     Map<name, fallbackConfig[]>                (config order)
 *   - byNamePath: Map<name, Array<{ path, candidates[] }>>   (paths longest-first)
 *
 * @sminkov — VE-24702 (OCI storage / virtual assets)
 */
function buildFallbackGroups(bucketConfigMap) {
  const seen = new Set();
  const entries = [];
  for (const bucketConf of Object.values(bucketConfigMap)) {
    const dedupId = bucketConf.key || bucketConf.name;
    if (
      !bucketConf.fallback ||
      !bucketConf.fallback.bucketName ||
      seen.has(dedupId)
    ) {
      continue;
    }
    seen.add(dedupId);
    entries.push(bucketConf);
  }

  // Sort by config-definition order so the parallel-probe tie-break
  // (lowest-order hit wins) is deterministic.
  entries.sort((a, b) => (a.order || 0) - (b.order || 0));

  const byName = new Map();
  const byNamePathTmp = new Map(); // name -> Map<path, fallbackConfig[]>

  for (const bucketConf of entries) {
    const fbConfig = normalizeFallbackConfig(bucketConf);

    if (!byName.has(bucketConf.name)) byName.set(bucketConf.name, []);
    byName.get(bucketConf.name).push(fbConfig);

    const path = bucketConf.path || '';
    if (!byNamePathTmp.has(bucketConf.name)) {
      byNamePathTmp.set(bucketConf.name, new Map());
    }
    const pathMap = byNamePathTmp.get(bucketConf.name);
    if (!pathMap.has(path)) pathMap.set(path, []);
    pathMap.get(path).push(fbConfig);
  }

  // Finalize byNamePath: order each name's paths longest-first for
  // longest-prefix matching against the object key.
  const byNamePath = new Map();
  for (const [name, pathMap] of byNamePathTmp) {
    const ordered = Array.from(pathMap.entries())
      .map(([path, candidates]) => ({ path, candidates }))
      .sort((a, b) => b.path.length - a.path.length);
    byNamePath.set(name, ordered);
  }

  return { byName, byNamePath };
}

/**
 * Select the candidate fallback list for a primary-URI miss:
 *   1. longest configured `path` prefix of the object key (name+path group), else
 *   2. the full physical-name group (hybrid fallback).
 * Returned candidates are in config-definition order (tie-break order).
 */
function selectFallbackCandidates(fallbackGroups, primaryName, objectKey) {
  const pathGroups = fallbackGroups.byNamePath.get(primaryName);
  if (pathGroups) {
    for (const { path, candidates } of pathGroups) {
      if (path && (objectKey === path || objectKey.startsWith(path + '/'))) {
        return candidates;
      }
    }
  }
  return fallbackGroups.byName.get(primaryName) || [];
}

/**
 * Build presigner map for S3-compatible buckets (AWS + OCI).
 * Azure buckets are skipped here — they use the storage shim for signing.
 */
function buildPresignerMap(bucketConfigMap) {
  const presignerMap = {};
  const cache = new Map();

  for (const [mapKey, bucketConf] of Object.entries(bucketConfigMap)) {
    // Only S3-compatible providers get an S3RequestPresigner
    if (bucketConf.cloudProvider === CLOUD_PROVIDER_AZURE) continue;
    if (bucketConf.cloudProvider === CLOUD_PROVIDER_MINIO) continue;

    // If the bucket uses accessCredentialId without inline keys, skip it here.
    // It will be lazily resolved via getOrCreatePrimaryPresigner at first use.
    if (bucketConf.accessCredentialId) continue;

    const canonicalName = bucketConf.name;
    if (cache.has(canonicalName)) {
      presignerMap[mapKey] = cache.get(canonicalName);
      continue;
    }

    let credentials;
    if (bucketConf.accessKey && bucketConf.secretKey) {
      const creds = {
        accessKeyId: bucketConf.accessKey,
        secretAccessKey: bucketConf.secretKey
      };
      credentials = () => creds;
    } else {
      credentials = STATIC_CREDENTIALS_CHAIN;
    }

    const presigner = new S3RequestPresigner({
      credentials,
      region: bucketConf.region,
      sha256: Hash.bind(null, 'sha256')
    });

    presignerMap[mapKey] = presigner;
    cache.set(canonicalName, presigner);
  }

  return presignerMap;
}

// ---------------------------------------------------------------------------
// Credential resolution (shared by primary and fallback buckets)
// ---------------------------------------------------------------------------

async function resolveCredentials(bucketConfig, serviceContext, credentialCache) {
  const bucketLabel = bucketConfig.bucketName || bucketConfig.name || 'unknown';

  // A half-specified inline pair on a fallback block is a config error.
  // Failing closed beats silently signing with whatever the default chain
  // resolves — the URL would 403 in a way that reads as a signing bug, not a
  // config bug. Never echo key material in the error. VE-26007 / SECURITY-15
  if (
    bucketConfig.isFallback === true &&
    !!bucketConfig.accessKey !== !!bucketConfig.secretKey
  ) {
    throw new Error(
      `Invalid credentials for fallback bucket ${bucketLabel}: ` +
      'accessKey and secretKey must be configured together'
    );
  }

  // 1. Inline credentials
  if (bucketConfig.accessKey && bucketConfig.secretKey) {
    const creds = {
      accessKeyId: bucketConfig.accessKey,
      secretAccessKey: bucketConfig.secretKey
    };
    return () => creds;
  }

  // 2. External credential from DB via accessCredentialId
  if (bucketConfig.accessCredentialId) {
    const cachedKey = bucketConfig.accessCredentialId;
    if (credentialCache.has(cachedKey)) {
      return credentialCache.get(cachedKey);
    }

    try {
      const { decryptObject } = require('@veritone/core-server-base/util.js')();
      const decryptKeyDefault = _.get(serviceContext, 'config.decryptKeyDefault');

      const res = await serviceContext.dal.externalCredential.getExternalCredential(
        {},
        { externalCredentialId: bucketConfig.accessCredentialId }
      );

      const decrypted = JSON.parse(
        decryptObject(res[0].credentialsCiphertext, decryptKeyDefault, 'aes-256-cbc')
      );

      const credData = decrypted.input || decrypted;
      const creds = {
        accessKeyId: credData.accessKey || credData.accessKeyId,
        secretAccessKey: credData.secretKey || credData.secretAccessKey
      };
      const provider = () => creds;
      credentialCache.set(cachedKey, provider);
      return provider;
    } catch (err) {
      throw new Error(
        `Failed to resolve external credential ${cachedKey} for bucket ` +
        `${bucketLabel}: ${err.message}`
      );
    }
  }

  // 3. Fallback block with no credentials of its own: the block's
  // cloudProvider picks the default source — the MATCHING top-level provider
  // config (config.oci for oci, config.s3 for aws), never a bucket entry.
  // Cross-provider inheritance is the exact defect class of VE-26007, so
  // config.s3 credentials are used only when BOTH sides are explicitly aws:
  // the fallback block AND config.s3.cloudProvider. An s3 block that doesn't
  // declare itself aws proves nothing about whose credentials it carries (in
  // OCI-consolidated deployments it holds OCI keys), so it is skipped and the
  // static chain below applies. OCI has no ambient identity on these pods
  // (env/instance-profile is an AWS identity), so oci-provider blocks fail
  // closed when config.oci has none.
  if (bucketConfig.isFallback === true) {
    const provider = bucketConfig.cloudProvider || CLOUD_PROVIDER_AWS;
    let providerConf = {};
    if (provider === CLOUD_PROVIDER_OCI) {
      providerConf = _.get(serviceContext, 'config.oci', {});
    } else if (provider === CLOUD_PROVIDER_AWS) {
      const s3Conf = _.get(serviceContext, 'config.s3', {});
      providerConf = s3Conf.cloudProvider === CLOUD_PROVIDER_AWS ? s3Conf : {};
    }

    if (providerConf.accessKey && providerConf.secretKey) {
      const creds = {
        accessKeyId: providerConf.accessKey,
        secretAccessKey: providerConf.secretKey
      };
      return () => creds;
    }
    if (providerConf.accessCredentialId) {
      // Reuse the external-credential path above (recursion depth is 1: the
      // synthesized config carries accessCredentialId, so step 2 terminates).
      return resolveCredentials(
        { bucketName: bucketLabel, accessCredentialId: providerConf.accessCredentialId },
        serviceContext,
        credentialCache
      );
    }
    if (provider === CLOUD_PROVIDER_OCI) {
      throw new Error(
        `No credentials configured for OCI fallback bucket ${bucketLabel}: ` +
        'set fallback.accessCredentialId, fallback.accessKey/secretKey, or config.oci credentials'
      );
    }
  }

  // 4. Static chain (env vars → instance profile)
  return STATIC_CREDENTIALS_CHAIN;
}

// Keep backward-compatible alias
const resolveFallbackCredentials = resolveCredentials;

// ---------------------------------------------------------------------------
// Singleton init
// ---------------------------------------------------------------------------

/**
 * Initialise the unified presigner singleton.
 *
 * @param {Object} serviceContext – standard service context (config, s3Buckets, logger, dal)
 * @param {Object} [credentials] – optional pre-resolved { accessKey, secretKey }
 * @returns {Object} the singleton instance
 */
function init(serviceContext, credentials) {
  if (instance) return instance;

  logger = serviceContext.logger || console;
  const config = serviceContext.config;
  const httpUtil = require('./httpUtil')(serviceContext);

  const bucketConfigMap = buildBucketConfigMap(config, credentials);
  const presignerMap = buildPresignerMap(bucketConfigMap);
  const fallbackMap = buildFallbackMap(bucketConfigMap);
  // Direction B: primary-URI-with-missing-object → probe candidate fallbacks.
  const fallbackGroups = buildFallbackGroups(bucketConfigMap);

  const fallbackPresignerCache = new Map();
  const primaryPresignerCache = new Map();
  const credentialCache = new Map();

  // Bound the fan-out of parallel fallback HEAD probes so a wide fallback group
  // cannot fire an unbounded number of simultaneous HEADs per primary miss.
  const HEAD_PROBE_CONCURRENCY = _.get(
    config,
    'presigner.headProbeConcurrency',
    4
  );

  // Two-tier existence cache on the signing hot path (see ttlExistenceCache for
  // the amplification rationale). L1 is this per-process Map (absorbs same-pod
  // hot-key bursts and within-request repeats without a network hop); L2 is the
  // shared redisCache below, which pools existence results across all 30+ pods
  // so a HEAD probed by one pod is reused fleet-wide. A per-pod L1 alone would
  // only catch ~1/N of cross-request repeats at N pods. @sminkov — VE-24702
  const HEAD_CACHE_METRIC = (result) => {
    const mc = serviceContext.metricsCounters;
    if (mc && mc.presignerHeadCacheTotal) {
      mc.presignerHeadCacheTotal.inc({ result });
    }
  };
  // L2 (shared redis) namespace + TTL. TTL is in minutes (redisCache granularity)
  // and intentionally longer than L1 so cross-pod reuse has time to land.
  const HEAD_CACHE_L2_TYPE = 'presignHead';
  const HEAD_CACHE_L2_TTL_MIN = _.get(
    config,
    'presigner.headCheckCacheTtlMin',
    1
  );
  // Shared L2 store backed by redisCache (fail-open — see module). Pools
  // existence across the fleet so one pod's HEAD is reused by the others.
  const headExistenceL2 = createRedisExistenceL2(serviceContext, {
    type: HEAD_CACHE_L2_TYPE,
    ttlMin: HEAD_CACHE_L2_TTL_MIN
  });

  const headExistenceCache = createTtlExistenceCache({
    ttlMs: _.get(config, 'presigner.headCheckCacheTtlMs', 5000),
    maxEntries: _.get(config, 'presigner.headCheckCacheMaxEntries', 10000),
    l2: headExistenceL2,
    onMetric: HEAD_CACHE_METRIC
  });

  // -----------------------------------------------------------------------
  // Signing: S3-compatible (AWS + OCI)
  // -----------------------------------------------------------------------

  async function signS3Url(presigner, bucketConf, key, method, ttl, disposition) {
    const resolvedMethod = method || 'GET';
    const resolvedTtl = ttl || bucketConf.signedUrlExpires;
    const unsignedUrl = buildSignableProviderUrl(bucketConf, key);
    const parsed = parseUrlForSigning(unsignedUrl);
    // Response-header overrides must be part of the SigV4 canonical request —
    // S3-compatible backends reject an unsigned response-* parameter — so the
    // override goes into the query object handed to the presigner. VE-27981
    if (disposition) {
      parsed.query['response-content-disposition'] = disposition;
    }

    const signedUrlObject = await presigner.presign(
      new HttpRequest({ ...parsed, method: resolvedMethod }),
      { expiresIn: resolvedTtl }
    );
    return formatUrl(signedUrlObject);
  }

  // -----------------------------------------------------------------------
  // Signing: Azure Blob Storage
  // Presigns directly using @azure/storage-blob SAS generation rather than
  // delegating to the storage shim (which may be configured for a different
  // provider like OCI).
  // -----------------------------------------------------------------------

  let azureSasContext = null;

  function getAzureSasContext() {
    if (azureSasContext) return azureSasContext;

    const azureConf = _.get(serviceContext, 'config.azure_blob', {});
    if (!azureConf.account || !azureConf.key) {
      throw new Error(
        'Cannot presign Azure URL: config.azure_blob is missing account or key.'
      );
    }

    const {
      SharedKeyCredential: AzureSharedKeyCredential,
      ContainerSASPermissions: AzureContainerSASPermissions,
      generateBlobSASQueryParameters: azureGenerateBlobSAS,
      StorageURL: AzureStorageURL,
      ServiceURL: AzureServiceURL,
      ContainerURL: AzureContainerURL,
      BlockBlobURL: AzureBlockBlobURL
    } = require('@azure/storage-blob');

    const credentials = new AzureSharedKeyCredential(azureConf.account, azureConf.key);
    const endpointSuffix = azureConf.endpointSuffix || 'core.windows.net';
    const pipeline = AzureStorageURL.newPipeline(credentials, {
      retryOptions: { maxTries: azureConf.maxRetry || 3 }
    });
    const serviceURL = new AzureServiceURL(
      `https://${azureConf.account}.blob.${endpointSuffix}`, pipeline
    );

    azureSasContext = {
      credentials,
      endpointSuffix,
      serviceURL,
      defaultExpires: azureConf.signedUrlExpires || 3600,
      generateSas(blobName, containerName, expiresInSecs, writable = false, contentDisposition) {
        const permissions = new AzureContainerSASPermissions();
        permissions.read = true;
        if (writable) {
          permissions.write = true;
          permissions.create = true;
          permissions.delete = true;
        }
        const expiryTime = new Date(Date.now() + expiresInSecs * 1000);
        const sas = azureGenerateBlobSAS({
          blobName, containerName, expiryTime,
          // Signed response-header override (`rscd`) — same mechanism the
          // legacy Azure shim uses for its download filenames. VE-27981
          contentDisposition,
          permissions: permissions.toString()
        }, credentials);
        const containerURL = AzureContainerURL.fromServiceURL(serviceURL, containerName);
        const blobURL = AzureBlockBlobURL.fromContainerURL(containerURL, blobName);
        return `${blobURL.url}?${sas.toString()}`;
      }
    };

    return azureSasContext;
  }

  async function signAzureUrl(bucketConf, key, method, ttl, disposition) {
    const resolvedTtl = ttl || bucketConf.signedUrlExpires;
    const containerName = bucketConf.name;
    const ctx = getAzureSasContext();
    const writable = (method === 'PUT');
    return ctx.generateSas(key, containerName, resolvedTtl, writable, disposition);
  }

  // -----------------------------------------------------------------------
  // Signing: MinIO
  // MinIO is S3-compatible — presign directly against the MinIO endpoint
  // using @aws-sdk/s3-request-presigner rather than delegating to the
  // storage shim (which may be configured for a different provider like OCI).
  // -----------------------------------------------------------------------

  const minioPresignerCache = new Map();

  function getMinioPresigner(bucketConf) {
    const minioConf = _.get(serviceContext, 'config.minio', {});
    const cacheKey = bucketConf ? bucketConf.name : 'global';

    if (minioPresignerCache.has(cacheKey)) {
      return minioPresignerCache.get(cacheKey);
    }

    // Use bucket-level keys if available, otherwise global MinIO keys
    const accessKey = (bucketConf && bucketConf.accessKey) || minioConf.accessKey;
    const secretKey = (bucketConf && bucketConf.secretKey) || minioConf.secretKey;

    if (!minioConf.endPoint || !accessKey || !secretKey) {
      throw new Error(
        'Cannot presign MinIO URL: config.minio is missing endPoint, accessKey, or secretKey.'
      );
    }

    const presigner = new S3RequestPresigner({
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey
      },
      region: minioConf.region || 'us-east-1',
      sha256: Hash.bind(null, 'sha256')
    });

    minioPresignerCache.set(cacheKey, presigner);
    return presigner;
  }

  async function signMinioUrl(bucketConf, key, method, ttl) {
    const resolvedMethod = method || 'GET';
    const resolvedTtl = ttl || bucketConf.signedUrlExpires;

    // Build the unsigned MinIO URL using MinIO config (not the primary bucket's endpoint)
    const protocol = bucketConf.minioSecure ? 'https' : 'http';
    const port = bucketConf.minioPort ? `:${bucketConf.minioPort}` : '';
    const unsignedUrl = `${protocol}://${bucketConf.minioEndpoint}${port}/${bucketConf.name}/${key}`;

    const presigner = getMinioPresigner(bucketConf);
    const parsed = parseUrlForSigning(unsignedUrl);

    const signedUrlObject = await presigner.presign(
      new HttpRequest({ ...parsed, method: resolvedMethod }),
      { expiresIn: resolvedTtl }
    );
    return formatUrl(signedUrlObject);
  }

  // -----------------------------------------------------------------------
  // Unified sign dispatcher
  // -----------------------------------------------------------------------

  async function signUrl(bucketConf, key, method, ttl, presigner, disposition) {
    const provider = bucketConf.cloudProvider || CLOUD_PROVIDER_AWS;

    // Azure signs `disposition` into the SAS contentDisposition (rscd), like
    // the legacy Azure shim did. Only MinIO ignores the option — its legacy
    // getSignedUrl never accepted a filename. VE-27981
    if (provider === CLOUD_PROVIDER_AZURE) {
      return signAzureUrl(bucketConf, key, method, ttl, disposition);
    }

    if (provider === CLOUD_PROVIDER_MINIO) {
      return signMinioUrl(bucketConf, key, method, ttl);
    }

    // S3-compatible (AWS or OCI)
    if (!presigner) {
      throw new Error(
        `No S3 presigner available for bucket "${bucketConf.name}" (provider: ${provider}). ` +
        'Check that credentials are configured.'
      );
    }
    return signS3Url(presigner, bucketConf, key, method, ttl, disposition);
  }

  // -----------------------------------------------------------------------
  // Fallback presigner (S3-compatible only; Azure fallbacks use shim)
  // -----------------------------------------------------------------------

  async function getFallbackPresigner(fallbackConfig) {
    if (fallbackConfig.cloudProvider === CLOUD_PROVIDER_AZURE) {
      return null; // Azure doesn't use S3RequestPresigner
    }

    const cacheKey = fallbackConfig.bucketName;
    if (fallbackPresignerCache.has(cacheKey)) {
      return fallbackPresignerCache.get(cacheKey);
    }

    const credentialProvider = await resolveCredentials(
      fallbackConfig, serviceContext, credentialCache
    );

    const presigner = new S3RequestPresigner({
      credentials: credentialProvider,
      region: fallbackConfig.region,
      sha256: Hash.bind(null, 'sha256')
    });

    fallbackPresignerCache.set(cacheKey, presigner);
    return presigner;
  }

  /**
   * Lazily create a presigner for a primary bucket that uses accessCredentialId
   * (credentials resolved from external_credential table at first use).
   */
  async function getOrCreatePrimaryPresigner(bucketConf) {
    if (bucketConf.cloudProvider === CLOUD_PROVIDER_AZURE) return null;
    if (bucketConf.cloudProvider === CLOUD_PROVIDER_MINIO) return null;

    const cacheKey = bucketConf.name;
    if (primaryPresignerCache.has(cacheKey)) {
      return primaryPresignerCache.get(cacheKey);
    }

    const credentialProvider = await resolveCredentials(
      bucketConf, serviceContext, credentialCache
    );

    const presigner = new S3RequestPresigner({
      credentials: credentialProvider,
      region: bucketConf.region,
      sha256: Hash.bind(null, 'sha256')
    });

    primaryPresignerCache.set(cacheKey, presigner);
    return presigner;
  }

  async function signFallbackUrl(fallbackConfig, key, method, ttl, disposition) {
    // fallbackConfig is always a normalizeFallbackConfig() product: structural
    // fields already inherited from its OWN primary, credentials own-block
    // only. Never consult bucketConfigMap here — it is keyed by logical bucket
    // `key` as well as physical name, and a logical key that equals a foreign
    // fallback bucket's name hands this signing ANOTHER bucket's config — the
    // t3m preview buckets were SigV4-signed with OCI keys exactly this way.
    // The fallback's cloudProvider picks the default credential source in
    // resolveCredentials when its block declares none. VE-26007
    const signConfig = {
      ...fallbackConfig,
      key: fallbackConfig.bucketName,
      isFallback: true
    };

    const presigner = await getFallbackPresigner(signConfig);
    return signUrl(signConfig, key, method, ttl, presigner, disposition);
  }

  // -----------------------------------------------------------------------
  // Direction B: resolve which fallback holds an object when a primary-bucket
  // URI's object is missing in the primary. Multiple logical buckets can share
  // one physical primary name, so a single (name, key) cannot statically pick
  // the fallback — we probe the candidates in parallel and let existence decide;
  // config-definition order breaks ties.
  // @sminkov — VE-24702 (OCI storage / virtual assets)
  // -----------------------------------------------------------------------

  async function resolveFallbackByProbe(primaryName, objectKey) {
    const candidates = selectFallbackCandidates(fallbackGroups, primaryName, objectKey);
    if (!candidates.length) return null;

    // Probe candidates in bounded-concurrency batches; existence is the ground
    // truth. Batching caps simultaneous HEADs so a wide fallback group cannot
    // amplify a single miss into an unbounded burst. @sminkov — VE-24702
    const results = new Array(candidates.length).fill(null);
    for (let i = 0; i < candidates.length; i += HEAD_PROBE_CONCURRENCY) {
      const batch = candidates.slice(i, i + HEAD_PROBE_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (fbConfig) => {
          // The fallback stores the bare key — strip the owning primary's
          // consolidation prefix (inverse of primaryObjectKeyFor). VE-26007
          const exists = await headCheckBucket(
            fbConfig, fallbackObjectKeyFor(fbConfig, objectKey)
          );
          return exists === true ? fbConfig : null;
        })
      );
      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j];
      }
    }
    const hits = results.filter(Boolean);
    if (!hits.length) return null;
    if (hits.length > 1) {
      logger.warn(
        `[presigner] object "${objectKey}" found in ${hits.length} fallback ` +
        `buckets under "${primaryName}" (${hits.map((h) => h.bucketName).join(', ')}); ` +
        'choosing the first by config-definition order'
      );
    }
    // candidates are in config order → hits preserve it → hits[0] is lowest order.
    return hits[0];
  }

  // -----------------------------------------------------------------------
  // Resolve which key a fallback-bucket object maps to inside its primary.
  // Write flows disagree on the convention: multipart uploads and migration
  // tooling write `<path>/<key>`, while putAsset / signed-writable-URL flows
  // write the bare `<key>` (AWS-parity contract). A prefix-only probe
  // (VE-26007) made every bare-key object invisible to promotion, so
  // existence decides: probe the prefixed key first, then the bare key.
  // Returns { key, exists }; `key` falls back to the prefixed mapping when
  // the object is in neither place (the truthful-404 shape).
  // -----------------------------------------------------------------------

  async function resolvePrimaryKeyByProbe(primaryBucketConf, objectKey) {
    const prefixedKey = primaryObjectKeyFor(primaryBucketConf, objectKey);
    const existsPrefixed = await headCheckBucket(primaryBucketConf, prefixedKey);
    if (existsPrefixed === true || prefixedKey === objectKey) {
      return { key: prefixedKey, exists: existsPrefixed === true };
    }
    const existsBare = await headCheckBucket(primaryBucketConf, objectKey);
    return existsBare === true
      ? { key: objectKey, exists: true }
      : { key: prefixedKey, exists: false };
  }

  // -----------------------------------------------------------------------
  // HEAD-check helper for a bucket config
  // -----------------------------------------------------------------------

  // Internal metrics helper — safe to call even when metricsCounters is not
  // available (e.g. in unit tests).
  function recordHeadCheckMetric(headStart, result) {
    const mc = serviceContext.metricsCounters;
    if (!mc) return;
    if (mc.presignerHeadCheckLatencyMs) {
      mc.presignerHeadCheckLatencyMs.observe(Date.now() - headStart);
    }
    if (mc.presignerHeadCheckTotal) {
      mc.presignerHeadCheckTotal.inc({ result });
    }
  }

  // Fallback ratio tracking (primary vs fallback signings)
  let primarySignCount = 0;
  let fallbackSignCount = 0;

  function recordPresignOutcome(isPrimary) {
    if (isPrimary) {
      primarySignCount++;
    } else {
      fallbackSignCount++;
    }
    const mc = serviceContext.metricsCounters;
    if (!mc) return;
    if (!isPrimary && mc.presignerFallbackTotal) {
      mc.presignerFallbackTotal.inc();
    }
    if (mc.presignerFallbackRatio) {
      const total = primarySignCount + fallbackSignCount;
      mc.presignerFallbackRatio.set(total > 0 ? fallbackSignCount / total : 0);
    }
  }

  // Two-tier cached HEAD check: L1 (in-proc) → L2 (shared redis) → real HEAD,
  // with write-back to both tiers. The composition lives in the cache module;
  // this only supplies the key and the origin probe. @sminkov — VE-24702
  async function headCheckBucket(bucketConf, key) {
    return headExistenceCache.wrap(`${bucketConf.name}:${key}`, () =>
      headCheckBucketUncached(bucketConf, key)
    );
  }

  async function headCheckBucketUncached(bucketConf, key) {
    const headStart = Date.now();
    const provider = bucketConf.cloudProvider || CLOUD_PROVIDER_AWS;

    if (provider === CLOUD_PROVIDER_MINIO) {
      // Presign a HEAD request directly against the MinIO endpoint using
      // the S3-compatible presigner (not the storage shim, which may be
      // configured for OCI instead of MinIO).
      try {
        const protocol = bucketConf.minioSecure ? 'https' : 'http';
        const port = bucketConf.minioPort ? `:${bucketConf.minioPort}` : '';
        const unsignedUrl = `${protocol}://${bucketConf.minioEndpoint}${port}/${bucketConf.name}/${key}`;

        const presigner = getMinioPresigner(bucketConf);
        const parsed = parseUrlForSigning(unsignedUrl);
        const headSigned = await presigner.presign(
          new HttpRequest({ ...parsed, method: 'HEAD' }),
          { expiresIn: 60 }
        );
        const exists = await headObjectExists(formatUrl(headSigned));
        recordHeadCheckMetric(headStart, exists ? 'primary_hit' : 'fallback');
        return exists;
      } catch (err) {
        logger.warn(`[presigner] MinIO HEAD check failed: ${err.message}`);
        return null;
      }
    }

    if (provider === CLOUD_PROVIDER_AZURE) {
      // Generate a read-only SAS URL directly and HEAD it
      try {
        const ctx = getAzureSasContext();
        const headUrl = ctx.generateSas(key, bucketConf.name, 60, false);
        const exists = await headObjectExists(headUrl);
        recordHeadCheckMetric(headStart, exists ? 'primary_hit' : 'fallback');
        return exists;
      } catch (err) {
        logger.warn(`[presigner] Azure HEAD check failed: ${err.message}`);
        return null;
      }
    }

    // S3-compatible (AWS / OCI): presign a HEAD request. Fallback-normalized
    // configs must not take presigners from presignerMap — the map is keyed
    // by logical bucket keys too, and a logical key equal to a foreign
    // fallback bucket's name would hand the probe another bucket's
    // credentials. Their creds resolve from the block itself. VE-26007
    const bucketPresigner = bucketConf.isFallback === true
      ? await getFallbackPresigner(bucketConf)
      : (presignerMap[bucketConf.name]
        || presignerMap[bucketConf.key]
        || await getOrCreatePrimaryPresigner(bucketConf));
    if (bucketPresigner) {
      const unsignedUrl = buildSignableProviderUrl(bucketConf, key);
      const headParsed = parseUrlForSigning(unsignedUrl);
      const headSigned = await bucketPresigner.presign(
        new HttpRequest({ ...headParsed, method: 'HEAD' }),
        { expiresIn: 60 }
      );
      const exists = await headObjectExists(formatUrl(headSigned));
      recordHeadCheckMetric(headStart, exists ? 'primary_hit' : 'fallback');
      return exists;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Public: presignUrl
  // -----------------------------------------------------------------------

  /**
   * Presign a storage URI (S3, OCI, MinIO, or Azure).
   *
   * Flow:
   * 1. Detect provider and parse bucket/key from URI; bail if unrecognized.
   * 2. Reverse fallback lookup — URI points at a fallback bucket:
   *    a. HEAD the primary bucket to check if the object has migrated —
   *       at the path-prefixed key first, then the bare key (write flows
   *       disagree on the convention; see resolvePrimaryKeyByProbe).
   *    b. If object exists in primary → sign primary + onPrimaryHit callback.
   *    c. If not → sign fallback.
   * 3. Primary bucket lookup — URI points at a primary bucket:
   *    a. If the primary has a fallback (or shares its name with buckets that do),
   *       HEAD the primary first.
   *       - Object exists → sign primary.
   *       - Object not found → probe candidate fallbacks (name+path, then name)
   *         in parallel; sign the one that holds the object (config order breaks
   *         ties); if none holds it → sign the primary anyway (truthful 404).
   *    b. No fallback configured → sign primary directly.
   * 4. No bucket match → return URI unchanged.
   *
   * @param {string}   uri
   * @param {Object}   [opts]
   * @param {string}   [opts.method='GET']
   * @param {number}   [opts.ttl]
   * @param {Function} [opts.onPrimaryHit] – async (originalUri, primaryUri, key) → void
   * @param {string}   [opts.fileName] – asset filename; when set, the URL is
   *   signed with an attachment content-disposition (S3/OCI query param, Azure
   *   SAS rscd; MinIO ignores it — legacy shim parity, VE-27981)
   * @returns {Promise<string>} presigned URL or original URI
   */
  async function presignUrl(uri, { method, ttl, onPrimaryHit, fileName } = {}) {
    if (!uri) return uri;

    const disposition = fileName
      ? buildResponseContentDisposition(fileName, uri)
      : undefined;

    // ------------------------------------------------------------------
    // 1. Detect provider and parse bucket/key from URI
    // ------------------------------------------------------------------
    const provider = detectCloudProvider(uri, httpUtil);
    if (!provider) return uri;

    const { bucket: matchedBucketName, key: rawKey } = httpUtil.uriParser(uri);
    if (!matchedBucketName || !rawKey) return uri;

    // Decode percent-encoded path separators (%2F → /) so presigning uses the
    // canonical object key. OCI's S3-compat API normalizes the path before
    // signature verification, so encoded slashes cause a 403 mismatch.
    // A stored key can carry a raw "%" that is not a valid escape sequence
    // (writers don't encode keys) — decodeURIComponent throws URIError on it,
    // which used to fail the whole request. Fall back to the raw key as a
    // best effort (URL parsing may have normalized other characters, e.g.
    // space → %20, so it can differ from the stored key when both coexist).
    // warn, not debug: this is a data anomaly worth seeing in triage. Log
    // bucket only — never the URI, key, or signature (VE-26276).
    let objectKey;
    try {
      objectKey = decodeURIComponent(rawKey);
    } catch (decodeErr) {
      logger.warn(
        `[presigner] object key for bucket "${matchedBucketName}" is not ` +
          `percent-decodable (${decodeErr.message}); using raw key best-effort`
      );
      objectKey = rawKey;
    }

    // ------------------------------------------------------------------
    // 2. Reverse fallback lookup: URI points at a fallback bucket
    // ------------------------------------------------------------------
    const fallbackEntry = fallbackMap[matchedBucketName];
    if (fallbackEntry) {
      // The bucket is the fallback bucket, but it's possible that the object
      // has already migrated to the primary → HEAD check primary before signing
      const { primaryBucketConf, fallbackConfig } = fallbackEntry;

      // Migrated objects may live under the primary's `path` prefix (multipart
      // uploads, migration tooling — VE-26007) or at the bare key (putAsset /
      // signed-writable-URL flows) — probe both, prefixed first, and promote
      // whichever exists. A prefix-only probe regressed promotion for every
      // bare-key object.
      const { key: primaryKey, exists: existsInPrimary } =
        await resolvePrimaryKeyByProbe(primaryBucketConf, objectKey);

      if (existsInPrimary === true) {
        // Object already migrated → sign primary → invoke onPrimaryHit callback if provided
        recordPresignOutcome(true);
        if (typeof onPrimaryHit === 'function') {
          try {
            await onPrimaryHit(uri, buildProviderUrl(primaryBucketConf, primaryKey), primaryKey);
          } catch (cbErr) {
            logger.warn(
              `onPrimaryHit callback error for ${uri}: ${cbErr.message}`
            );
          }
        }
        const primaryPresigner = presignerMap[primaryBucketConf.name] || await getOrCreatePrimaryPresigner(primaryBucketConf);
        return signUrl(primaryBucketConf, primaryKey, method, ttl, primaryPresigner, disposition);
      }

      // Object not found in primary → sign fallback directly
      recordPresignOutcome(false);
      return signFallbackUrl(fallbackConfig, objectKey, method, ttl, disposition);
    }

    // ------------------------------------------------------------------
    // 3. Primary bucket lookup
    // ------------------------------------------------------------------
    // We did not hit a fallback bucket in the reverse lookup. It is possible
    // that the URI points at a primary bucket that has a fallback configured.
    const bucketConf = bucketConfigMap[matchedBucketName];

    if (bucketConf) {
      // A fallback group may exist even if this specific (collapsed) bucketConf
      // has no `fallback`, when multiple logical buckets share the physical name.
      const hasFallbackGroup = fallbackGroups.byName.has(bucketConf.name);

      if (bucketConf.fallback || hasFallbackGroup) {
        const exists = await headCheckBucket(bucketConf, objectKey);

        if (exists === true) {
          // Object exists in primary → sign primary
          recordPresignOutcome(true);
          const presigner = presignerMap[matchedBucketName] || await getOrCreatePrimaryPresigner(bucketConf);
          return signUrl(bucketConf, objectKey, method, ttl, presigner, disposition);
        }

        // Object not found in primary → probe candidate fallbacks (name+path,
        // then the full name group) in parallel; sign whichever holds the object.
        const resolvedFallback = await resolveFallbackByProbe(bucketConf.name, objectKey);
        if (resolvedFallback) {
          recordPresignOutcome(false);
          // Same inverse mapping the probe used — the object was found at the
          // stripped key, so that's the key to sign. VE-26007
          return signFallbackUrl(
            resolvedFallback,
            fallbackObjectKeyFor(resolvedFallback, objectKey),
            method,
            ttl,
            disposition
          );
        }

        // Not found in the primary or any candidate fallback → sign the primary
        // anyway so the eventual 404 is truthful to the URI's own location.
        recordPresignOutcome(true);
        const presigner = presignerMap[matchedBucketName] || await getOrCreatePrimaryPresigner(bucketConf);
        return signUrl(bucketConf, objectKey, method, ttl, presigner, disposition);
      }

      // No fallback configured → sign primary directly without HEAD check (no need to check)
      const presigner = presignerMap[matchedBucketName] || await getOrCreatePrimaryPresigner(bucketConf);
      return signUrl(bucketConf, objectKey, method, ttl, presigner, disposition);
    }

    // ------------------------------------------------------------------
    // 4. No match → return unchanged
    // ------------------------------------------------------------------
    return uri;
  }

  /**
   * Retrieve URIs (primary and fallback) where the object exists
   * so they can be used for thorough deletion.
   *
   * @param {string}   uri
   * @returns {Object} an object containing the primary and fallback URIs for the asset
   */
  async function getDeletableUris(uri) {
    const { bucketName, key: objectKey } = parseBucketAndKeyFromUri(uri);
    const bucketConf = bucketConfigMap[bucketName];
    const result = { primaryUri: uri, fallbackUri: null };

    // Logic to find the "other" bucket configuration. A URI names a PHYSICAL
    // bucket, but bucketConfigMap also indexes logical `key` aliases — when
    // the name matched only via alias and a fallback declares that physical
    // name (the t3m collision shape), the URI is the fallback bucket's, not
    // the aliased primary's. VE-26007
    let otherBucketConf = null;
    const matchedFallback = fallbackMap[bucketName];
    const matchedByName = bucketConf && bucketConf.name === bucketName;
    if (bucketConf && bucketConf.fallback && (matchedByName || !matchedFallback)) {
      otherBucketConf = fallbackMap[bucketConf.fallback.bucketName];
    } else if (matchedFallback) {
      otherBucketConf = matchedFallback.primaryBucketConf;
    }

    // If the other bucket exists, determine if it's a primary or fallback and
    // assign to result accordingly. Keys map across the pair: the consolidated
    // primary stores `<path>/<key>`, the fallback stores the bare key — same
    // mapping presignUrl uses in both directions. VE-26007
    if (otherBucketConf) {
      const isFallbackConfig = !_.isEmpty(otherBucketConf.fallbackConfig);
      if (isFallbackConfig) {
        result.primaryUri = uri;
        result.fallbackUri = buildProviderUrl(
          otherBucketConf.fallbackConfig,
          fallbackObjectKeyFor(otherBucketConf.fallbackConfig, objectKey)
        );
      } else {
        // Existence decides which convention the primary copy used (prefixed
        // vs bare key) — deleting only the prefixed mapping would silently
        // leave a bare-key object behind.
        const { key: primaryKey } = await resolvePrimaryKeyByProbe(
          otherBucketConf, objectKey
        );
        result.primaryUri = buildProviderUrl(otherBucketConf, primaryKey);
        result.fallbackUri = uri;
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Singleton surface
  // -----------------------------------------------------------------------

  instance = Object.freeze({
    presignUrl,

    getDeletableUris,

    /**
     * Look up the resolved bucket config by name or key. Falls back to the
     * fallback-bucket index so a fallback bucket name (which is not a
     * bucketConfigMap key) still resolves — callers read signedUrlExpires from
     * it, and the normalized fallback config inherits the primary's TTL.
     */
    getBucketConfig: (nameOrKey) =>
      bucketConfigMap[nameOrKey] ||
      (fallbackMap[nameOrKey] && fallbackMap[nameOrKey].fallbackConfig) ||
      null,

    /** Return a shallow copy of the full bucket config map. */
    getAllBucketConfigs: () => ({ ...bucketConfigMap }),

    /** Return a shallow copy of the fallback map. */
    getFallbackMap: () => ({ ...fallbackMap }),

    /** Tear down the singleton (mainly useful in tests). */
    _reset: () => { instance = null; logger = console; }
  });

  return instance;
}

// ---------------------------------------------------------------------------
// Module-level accessors
// ---------------------------------------------------------------------------

function getInstance() {
  if (!instance) {
    throw new Error(
      'Presigner not initialised. Call init(serviceContext) first.'
    );
  }
  return instance;
}

async function presignUrl(uri, opts) {
  return getInstance().presignUrl(uri, opts);
}

module.exports = {
  init,
  getInstance,
  presignUrl,
  // Constants
  CLOUD_PROVIDER_AWS,
  CLOUD_PROVIDER_OCI,
  CLOUD_PROVIDER_AZURE,
  CLOUD_PROVIDER_MINIO,
  // Exported for unit-testing only:
  _buildBucketConfigMap: buildBucketConfigMap,
  _buildPresignerMap: buildPresignerMap,
  _buildFallbackMap: buildFallbackMap,
  _buildFallbackGroups: buildFallbackGroups,
  _normalizeFallbackConfig: normalizeFallbackConfig,
  _selectFallbackCandidates: selectFallbackCandidates,
  _parseBucketAndKeyFromUri: parseBucketAndKeyFromUri,
  _primaryObjectKeyFor: primaryObjectKeyFor,
  _fallbackObjectKeyFor: fallbackObjectKeyFor,
  _detectCloudProvider: detectCloudProvider,
  _headObjectExists: headObjectExists,
  _buildProviderUrl: buildProviderUrl,
  _buildSignableProviderUrl: buildSignableProviderUrl,
  _buildResponseContentDisposition: buildResponseContentDisposition,
  _encodeObjectKeyForUrl: encodeObjectKeyForUrl,
  _resolveCredentials: resolveCredentials,
  _resolveFallbackCredentials: resolveFallbackCredentials
};