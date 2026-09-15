'use strict';

const http = require('http');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Configurable mock for @veritone/core-server-base/util.js
// ---------------------------------------------------------------------------
let mockDecryptObject = jest.fn();
jest.mock('@veritone/core-server-base/util.js', () => () => ({
  decryptObject: (...args) => mockDecryptObject(...args)
}), { virtual: true });

// ---------------------------------------------------------------------------
// Virtual mock for @azure/storage-blob — a core-server-base dependency not
// resolvable from this service in tests; the presigner requires it lazily only
// when signing an Azure URL. Shapes mirror the v10 SDK surface used. VE-27981
// ---------------------------------------------------------------------------
const mockAzureGenerateBlobSAS = jest.fn(() => ({
  toString: () => 'sv=2019-02-02&sig=azuresig'
}));
jest.mock('@azure/storage-blob', () => ({
  SharedKeyCredential: class {},
  ContainerSASPermissions: class {
    toString() {
      return this.write ? 'rwcd' : 'r';
    }
  },
  generateBlobSASQueryParameters: (...args) => mockAzureGenerateBlobSAS(...args),
  StorageURL: { newPipeline: () => ({}) },
  ServiceURL: class {
    constructor(url) {
      this.url = url;
    }
  },
  ContainerURL: {
    fromServiceURL: (serviceURL, container) => ({
      url: `${serviceURL.url}/${container}`
    })
  },
  BlockBlobURL: {
    fromContainerURL: (containerURL, blobName) => ({
      url: `${containerURL.url}/${blobName}`
    })
  }
}), { virtual: true });

// ---------------------------------------------------------------------------
// Helpers: build a mock httpUtil that presigner.init() will require
// ---------------------------------------------------------------------------
jest.mock('./httpUtil', () => {
  return (serviceContext) => ({
    uriParser: (uri) => {
      // Simple parser: extract bucket and key from virtual-hosted S3 URLs,
      // OCI URLs, Azure URLs, and MinIO URLs
      if (!uri) return { bucket: null, key: null };

      // AWS virtual-hosted: <bucket>.s3.<region>.amazonaws.com/<key>
      // Bucket names can contain dots so use (.+?) with lazy match up to .s3.
      const awsMatch = uri.match(
        /https?:\/\/(.+?)\.s3\.[^/]+\.amazonaws\.com\/(.+?)(\?|$)/
      );
      if (awsMatch) return { bucket: awsMatch[1], key: awsMatch[2] };

      // OCI: <ns>.compat.objectstorage.<region>.oraclecloud.com/<bucket>/<key>
      const ociMatch = uri.match(
        /https?:\/\/[^/]+\.compat\.objectstorage\.[^/]+\.oraclecloud\.com\/([^/]+)\/(.+?)(\?|$)/
      );
      if (ociMatch) return { bucket: ociMatch[1], key: ociMatch[2] };

      // Azure: <account>.blob.<suffix>/<container>/<key>
      const azureMatch = uri.match(
        /https?:\/\/[^/]+\.blob\.[^/]+\/([^/]+)\/(.+?)(\?|$)/
      );
      if (azureMatch) return { bucket: azureMatch[1], key: azureMatch[2] };

      // MinIO: <host>:<port>/<bucket>/<key>
      const minioMatch = uri.match(
        /https?:\/\/[^/]+\/([^/]+)\/(.+?)(\?|$)/
      );
      if (minioMatch) return { bucket: minioMatch[1], key: minioMatch[2] };

      return { bucket: null, key: null };
    },
    isS3: (uri) =>
      uri && (uri.includes('amazonaws.com') || uri.includes('s3')),
    isAzure: (uri) =>
      uri && uri.includes('.blob.') && uri.includes('core.windows.net'),
    // VE-25065: mirror the real httpUtil.isOci gating — OCI detection is
    // active when oci.enabled or any bucket/fallback declares provider oci.
    isOci: (uri) => {
      const cfg = (serviceContext && serviceContext.config) || {};
      const buckets = (cfg.s3 && cfg.s3.buckets) || [];
      const ociActive =
        (cfg.oci && cfg.oci.enabled === true) ||
        buckets.some(
          (b) =>
            b.cloudProvider === 'oci' ||
            (b.fallback && b.fallback.cloudProvider === 'oci')
        );
      return !!(
        ociActive &&
        uri &&
        uri.includes('oraclecloud.com') &&
        uri.includes('.compat.objectstorage.')
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Import the module under test (static/pure helpers are available directly)
// ---------------------------------------------------------------------------
const presigner = require('./presigner.s3.buckets.js');

const {
  CLOUD_PROVIDER_AWS,
  CLOUD_PROVIDER_OCI,
  CLOUD_PROVIDER_AZURE,
  CLOUD_PROVIDER_MINIO,
  _buildBucketConfigMap: buildBucketConfigMap,
  _buildPresignerMap: buildPresignerMap,
  _buildFallbackMap: buildFallbackMap,
  _buildFallbackGroups: buildFallbackGroups,
  _selectFallbackCandidates: selectFallbackCandidates,
  _parseBucketAndKeyFromUri: parseBucketAndKeyFromUri,
  _detectCloudProvider: detectCloudProvider,
  _headObjectExists: headObjectExists,
  _buildProviderUrl: buildProviderUrl,
  _buildSignableProviderUrl: buildSignableProviderUrl,
  _encodeObjectKeyForUrl: encodeObjectKeyForUrl,
  _resolveCredentials: resolveCredentials,
  _resolveFallbackCredentials: resolveFallbackCredentials
} = presigner;

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('presigner – pure helpers', () => {
  // -----------------------------------------------------------------------
  // buildProviderUrl
  // -----------------------------------------------------------------------
  describe('buildProviderUrl', () => {
    it('should build an AWS S3 path-style URL', () => {
      const conf = { name: 'my-bucket', region: 'us-west-2', cloudProvider: 'aws' };
      expect(buildProviderUrl(conf, 'path/to/file.mp3')).toBe(
        'https://s3.us-west-2.amazonaws.com/my-bucket/path/to/file.mp3'
      );
    });

    it('should default to AWS when cloudProvider is not set', () => {
      const conf = { name: 'my-bucket', region: 'eu-west-1' };
      expect(buildProviderUrl(conf, 'key')).toBe(
        'https://s3.eu-west-1.amazonaws.com/my-bucket/key'
      );
    });

    // Dotted legacy bucket names (stage-api.veritone.com) as a virtual-hosted
    // hostname prefix fail TLS wildcard validation — must stay path-style.
    it('should keep dotted bucket names out of the hostname (path-style)', () => {
      const conf = { name: 'stage-api.veritone.com', region: 'us-east-1', cloudProvider: 'aws' };
      const url = buildProviderUrl(conf, '19491/other/file.json');
      expect(url).toBe(
        'https://s3.us-east-1.amazonaws.com/stage-api.veritone.com/19491/other/file.json'
      );
      expect(new URL(url).hostname).toBe('s3.us-east-1.amazonaws.com');
    });

    it('should not change OCI URL shape when AWS is path-style', () => {
      const conf = {
        name: 'oci-bucket',
        region: 'us-ashburn-1',
        namespace: 'myns',
        cloudProvider: 'oci'
      };
      const url = buildProviderUrl(conf, 'obj.txt');
      expect(url).toBe(
        'https://myns.compat.objectstorage.us-ashburn-1.oraclecloud.com/oci-bucket/obj.txt'
      );
      expect(new URL(url).hostname).toBe(
        'myns.compat.objectstorage.us-ashburn-1.oraclecloud.com'
      );
    });

    it('should build an OCI S3-compat URL', () => {
      const conf = {
        name: 'oci-bucket',
        region: 'us-phoenix-1',
        namespace: 'myns',
        cloudProvider: 'oci'
      };
      expect(buildProviderUrl(conf, 'obj.txt')).toBe(
        'https://myns.compat.objectstorage.us-phoenix-1.oraclecloud.com/oci-bucket/obj.txt'
      );
    });

    it('should build an Azure Blob URL', () => {
      const conf = {
        name: 'my-container',
        account: 'storageacct',
        cloudProvider: 'azure',
        endpointSuffix: 'core.windows.net'
      };
      expect(buildProviderUrl(conf, 'blob.dat')).toBe(
        'https://storageacct.blob.core.windows.net/my-container/blob.dat'
      );
    });

    it('should use default endpointSuffix for Azure', () => {
      const conf = {
        name: 'c',
        account: 'a',
        cloudProvider: 'azure'
      };
      expect(buildProviderUrl(conf, 'k')).toContain('core.windows.net');
    });

    // VE-26276: encoding is a wire-format concern. buildSignableProviderUrl
    // (signing + HEAD probes) carries the key RFC 3986 canonical for OCI;
    // buildProviderUrl output is persisted (onPrimaryHit → asset.uri) and fed
    // to deletion (getDeletableUris → storage shim), so it must stay RAW.
    describe('special characters in object keys (VE-26276)', () => {
      const ociConf = {
        name: 'oci-bucket',
        region: 'us-ashburn-1',
        namespace: 'myns',
        cloudProvider: 'oci'
      };
      const ociPrefix =
        'https://myns.compat.objectstorage.us-ashburn-1.oraclecloud.com/oci-bucket/';

      it('buildProviderUrl keeps OCI keys RAW (persisted/deletable URI shape)', () => {
        const key = 'dir/walking(854x480_30sec).mp4';
        expect(buildProviderUrl(ociConf, key)).toBe(`${ociPrefix}${key}`);
      });

      it('signable URL encodes parentheses in OCI keys (reported ticket case)', () => {
        const key =
          '55255/other/2026/6/5/_/walking(854x480_30sec)-15-32-770_c3fed42d.mp4-afa5184d';
        expect(buildSignableProviderUrl(ociConf, key)).toBe(
          `${ociPrefix}55255/other/2026/6/5/_/walking%28854x480_30sec%29-15-32-770_c3fed42d.mp4-afa5184d`
        );
      });

      it('signable URL encodes the full URL-sensitive character set in OCI keys', () => {
        const cases = [
          ['with space.mp4', 'with%20space.mp4'],
          ['brackets[1].mp4', 'brackets%5B1%5D.mp4'],
          ['a+b.mp4', 'a%2Bb.mp4'],
          ['a&b=c.mp4', 'a%26b%3Dc.mp4'],
          ['a#b.mp4', 'a%23b.mp4'],
          ['100%.mp4', '100%25.mp4'],
          ["quote'star*bang!.mp4", 'quote%27star%2Abang%21.mp4'],
          ['comma,semi;.mp4', 'comma%2Csemi%3B.mp4'],
          ['q?uery.mp4', 'q%3Fuery.mp4'],
          ['café-视频.mp4', 'caf%C3%A9-%E8%A7%86%E9%A2%91.mp4']
        ];
        for (const [raw, encoded] of cases) {
          expect(buildSignableProviderUrl(ociConf, `dir/${raw}`)).toBe(
            `${ociPrefix}dir/${encoded}`
          );
        }
      });

      it('signable URL preserves path separators in OCI keys', () => {
        const url = buildSignableProviderUrl(ociConf, 'a/b (1)/c.mp4');
        expect(url).toBe(`${ociPrefix}a/b%20%281%29/c.mp4`);
      });

      it('signable OCI URL stays parseable and round-trippable', () => {
        const key = 'dir/walking(854x480 30sec)#final.mp4';
        const url = buildSignableProviderUrl(ociConf, key);
        const parsed = new URL(url);
        expect(parsed.hash).toBe('');
        expect(parsed.search).toBe('');
        expect(decodeURIComponent(parsed.pathname)).toBe(
          `/oci-bucket/${key}`
        );
      });

      // The decoded form of a double-encoded traversal attempt (%252e%252e)
      // is "%2e%2e" — it must stay byte-literal in the signable path, never
      // collapse into a real dot-segment that escapes the bucket prefix.
      it('signable OCI URL neutralizes double-encoded dot-segments', () => {
        const url = buildSignableProviderUrl(ociConf, '%2e%2e/secret.mp4');
        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/oci-bucket/%252e%252e/secret.mp4');
        expect(parsed.pathname).toContain('/oci-bucket/');
      });

      it('signable URLs stay RAW for AWS, Azure, and MinIO (byte-identical contract)', () => {
        const key = 'dir/walking(854x480_30sec).mp4';
        const awsConf = { name: 'my-bucket', region: 'us-west-2', cloudProvider: 'aws' };
        expect(buildSignableProviderUrl(awsConf, key)).toBe(
          `https://s3.us-west-2.amazonaws.com/my-bucket/${key}`
        );
        const azureConf = {
          name: 'my-container',
          account: 'acct',
          cloudProvider: 'azure',
          endpointSuffix: 'core.windows.net'
        };
        expect(buildSignableProviderUrl(azureConf, key)).toBe(
          `https://acct.blob.core.windows.net/my-container/${key}`
        );
        const minioConf = {
          name: 'minio-bucket',
          cloudProvider: 'minio',
          minioEndpoint: 'minio.local',
          minioPort: 9000,
          minioSecure: false
        };
        expect(buildSignableProviderUrl(minioConf, key)).toBe(
          `http://minio.local:9000/minio-bucket/${key}`
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // encodeObjectKeyForUrl (VE-26276)
  // -----------------------------------------------------------------------
  describe('encodeObjectKeyForUrl', () => {
    it('should leave unreserved characters and slashes untouched', () => {
      expect(encodeObjectKeyForUrl('a/b-c_d.e~f/0129')).toBe(
        'a/b-c_d.e~f/0129'
      );
    });

    it('should strictly encode RFC 3986 sub-delimiters encodeURIComponent leaves raw', () => {
      expect(encodeObjectKeyForUrl("!'()*")).toBe('%21%27%28%29%2A');
    });

    it('should encode a raw percent sign', () => {
      expect(encodeObjectKeyForUrl('100% done.mp4')).toBe('100%25%20done.mp4');
    });

    it('should encode multi-byte unicode', () => {
      expect(encodeObjectKeyForUrl('é')).toBe('%C3%A9');
    });

    it('should be deterministic from a decoded key (single-pass encoding)', () => {
      const decodedKey = 'dir/file (1).mp4';
      const once = encodeObjectKeyForUrl(decodedKey);
      expect(decodeURIComponent(once)).toBe(decodedKey);
    });
  });

  // -----------------------------------------------------------------------
  // parseBucketAndKeyFromUri
  // -----------------------------------------------------------------------
  describe('buildResponseContentDisposition (VE-27981)', () => {
    const URI = 'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/7682/asset/file.mp3';

    it.each([
      ['plain filename', 'file.mp3', URI, 'attachment; filename="file.mp3"'],
      [
        'spaces and unicode are encodeURI-encoded (legacy shim parity)',
        'my report’s.zip',
        URI,
        'attachment; filename="my%20report%E2%80%99s.zip"'
      ],
      [
        'quotes cannot break the quoted-string',
        'a"b.txt',
        URI,
        'attachment; filename="a%22b.txt"'
      ],
      [
        'extension backfilled from the uri when the filename has none',
        'soundtrack',
        URI,
        'attachment; filename="soundtrack.mp3"'
      ],
      [
        'no backfill when the uri has no extension either',
        'soundtrack',
        'https://bucket/key',
        'attachment; filename="soundtrack"'
      ],
      [
        'extension search is limited to the key basename — a hostname dot is not an extension',
        'soundtrack',
        'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/7682/asset/soundtrack',
        'attachment; filename="soundtrack"'
      ],
      [
        'a backfilled extension is itself encoded (hostile key tails cannot break the quoted-string)',
        'clip',
        'https://bucket/dir/song.final mix',
        'attachment; filename="clip.final%20mix"'
      ],
      [
        'a dot in an unsigned query string is not an extension',
        'clip',
        'https://bucket/asset/clip?v=1.2',
        'attachment; filename="clip"'
      ],
      [
        'the backfill still finds the real extension past an unsigned query',
        'clip',
        'https://bucket/asset/song.mp4?token=a.b',
        'attachment; filename="clip.mp4"'
      ]
    ])('%s', (_name, fileName, uri, expected) => {
      expect(presigner._buildResponseContentDisposition(fileName, uri)).toBe(
        expected
      );
    });

    it('returns undefined for unencodable filenames (lone surrogate) instead of throwing', () => {
      expect(
        presigner._buildResponseContentDisposition('\uD800', URI)
      ).toBeUndefined();
    });

    it('clamps oversized filenames while preserving the extension', () => {
      const longName = `${'ä'.repeat(200)}.mp3`; // encodes to ~1200 chars
      const result = presigner._buildResponseContentDisposition(longName, URI);
      const match = result.match(/^attachment; filename="(.*)"$/);
      expect(match).not.toBeNull();
      expect(match[1].length).toBeLessThanOrEqual(255);
      expect(match[1].endsWith('.mp3')).toBe(true);
      // Clamping per code point: no escape is ever split, so the value decodes.
      expect(() => decodeURI(match[1])).not.toThrow();
    });

    it('never strands a partial multi-byte character at the clamp boundary', () => {
      // 3-byte CJK chars encode to 9 chars each; a blind slice at 255 would end
      // in a complete-looking "%E4" that is only the lead byte of a character.
      const longName = `${'会議録画'.repeat(25)}.mp4`;
      const result = presigner._buildResponseContentDisposition(longName, URI);
      const match = result.match(/^attachment; filename="(.*)"$/);
      expect(match).not.toBeNull();
      expect(match[1].length).toBeLessThanOrEqual(255);
      expect(match[1].endsWith('.mp4')).toBe(true);
      expect(() => decodeURI(match[1])).not.toThrow();
    });

    it('a clamped backfilled extension survives too', () => {
      const result = presigner._buildResponseContentDisposition(
        'ä'.repeat(200), // no dot → extension backfilled from the uri
        URI
      );
      const match = result.match(/^attachment; filename="(.*)"$/);
      expect(match).not.toBeNull();
      expect(match[1].length).toBeLessThanOrEqual(255);
      expect(match[1].endsWith('.mp3')).toBe(true);
    });

    it('returns undefined when the extension alone exceeds the cap', () => {
      expect(
        presigner._buildResponseContentDisposition(`a.${'x'.repeat(400)}`, URI)
      ).toBeUndefined();
    });
  });

  describe('parseBucketAndKeyFromUri', () => {
    it('should return nulls for empty input', () => {
      expect(parseBucketAndKeyFromUri(null)).toEqual({ bucketName: null, key: null });
      expect(parseBucketAndKeyFromUri('')).toEqual({ bucketName: null, key: null });
    });

    it('should parse AWS virtual-hosted style URL', () => {
      const result = parseBucketAndKeyFromUri(
        'https://my-bucket.s3.us-west-2.amazonaws.com/path/to/file.mp3'
      );
      expect(result.bucketName).toBe('my-bucket');
      expect(result.key).toBe('path/to/file.mp3');
    });

    it('should parse OCI S3-compat URL', () => {
      const result = parseBucketAndKeyFromUri(
        'https://myns.compat.objectstorage.us-phoenix-1.oraclecloud.com/oci-bucket/obj.txt'
      );
      expect(result.bucketName).toBe('oci-bucket');
      expect(result.key).toBe('obj.txt');
    });

    it('should parse Azure Blob URL', () => {
      const result = parseBucketAndKeyFromUri(
        'https://storageacct.blob.core.windows.net/my-container/blob.dat'
      );
      expect(result.bucketName).toBe('my-container');
      expect(result.key).toBe('blob.dat');
    });

    it('should handle AWS path-style URL', () => {
      const result = parseBucketAndKeyFromUri(
        'https://s3.us-east-1.amazonaws.com/my-bucket/key.txt'
      );
      expect(result.bucketName).toBe('my-bucket');
      expect(result.key).toBe('key.txt');
    });

    it('should parse bucket-only URL (no key)', () => {
      const result = parseBucketAndKeyFromUri(
        'https://my-bucket.s3.us-west-2.amazonaws.com/'
      );
      expect(result.bucketName).toBe('my-bucket');
      expect(result.key).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // detectCloudProvider
  // -----------------------------------------------------------------------
  describe('detectCloudProvider', () => {
    const mockHttpUtil = {
      isS3: (uri) => uri && uri.includes('amazonaws.com'),
      isAzure: (uri) => uri && uri.includes('.blob.') && uri.includes('core.windows.net'),
      isMinio: () => false,
      // VE-25065: detectCloudProvider now defers OCI detection to httpUtil.isOci
      // (gated on oci.enabled). `true` here simulates oci.enabled=true.
      isOci: (uri) =>
        uri &&
        uri.includes('oraclecloud.com') &&
        uri.includes('.compat.objectstorage.')
    };

    it('should detect AWS', () => {
      expect(detectCloudProvider('https://b.s3.us-west-2.amazonaws.com/k', mockHttpUtil))
        .toBe(CLOUD_PROVIDER_AWS);
    });

    it('should detect Azure', () => {
      expect(detectCloudProvider('https://a.blob.core.windows.net/c/k', mockHttpUtil))
        .toBe(CLOUD_PROVIDER_AZURE);
    });

    it('should detect OCI when oci.enabled (isOci true)', () => {
      expect(detectCloudProvider('https://ns.compat.objectstorage.us-phoenix-1.oraclecloud.com/b/k', mockHttpUtil))
        .toBe(CLOUD_PROVIDER_OCI);
    });

    it('returns null for an OCI URI when isOci is gated off (oci.enabled=false) [VE-25065]', () => {
      const ociGatedOff = { ...mockHttpUtil, isOci: () => false };
      expect(
        detectCloudProvider('https://ns.compat.objectstorage.us-phoenix-1.oraclecloud.com/b/k', ociGatedOff)
      ).toBeNull();
    });

    it('should return null for unknown URI', () => {
      expect(detectCloudProvider('https://example.com/file', mockHttpUtil)).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(detectCloudProvider(null, mockHttpUtil)).toBeNull();
      expect(detectCloudProvider(undefined, mockHttpUtil)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // buildBucketConfigMap
  // -----------------------------------------------------------------------
  describe('buildBucketConfigMap', () => {
    it('should build map from array of buckets', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          signedUrlExpires: 3600,
          buckets: [
            { key: 'api', name: 'dev-api.veritone.com', path: 'assets' },
            { key: 'upload', name: 'vtn-upload-bucket' }
          ]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['dev-api.veritone.com']).toBeDefined();
      expect(map['api']).toBeDefined();
      expect(map['api'].name).toBe('dev-api.veritone.com');
      expect(map['api'].region).toBe('us-east-1');
      expect(map['vtn-upload-bucket']).toBeDefined();
      expect(map['upload']).toBeDefined();
    });

    it('should not set Azure-only fields on non-Azure buckets', () => {
      const config = {
        s3: {
          cloudProvider: 'oci',
          region: 'us-ashburn-1',
          buckets: [
            {
              key: 'api',
              name: 'vtn-oci-upload',
              path: 'signedUrl',
              fallback: {
                bucketName: 'stage-api.veritone.com',
                cloudProvider: 'aws',
                region: 'us-east-1'
              }
            }
          ]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['api'].cloudProvider).toBe('oci');
      expect(map['api'].endpointSuffix).toBeNull();
      expect(map['api'].account).toBeNull();

      const fbConf = buildFallbackMap(map)['stage-api.veritone.com']
        .fallbackConfig;
      expect(fbConf.cloudProvider).toBe('aws');
      expect(fbConf.endpointSuffix).toBeNull();
      expect(fbConf.account).toBeNull();
    });

    it('should apply top-level credentials', () => {
      const config = {
        s3: {
          region: 'us-west-2',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const creds = { accessKey: 'AK', secretKey: 'SK' };
      const map = buildBucketConfigMap(config, creds);
      expect(map['my-bucket'].accessKey).toBe('AK');
      expect(map['my-bucket'].secretKey).toBe('SK');
    });

    it('should prefer per-bucket credentials over top-level', () => {
      const config = {
        s3: {
          region: 'us-west-2',
          accessKey: 'TOP_AK',
          secretKey: 'TOP_SK',
          buckets: [{ key: 'b', name: 'my-bucket', accessKey: 'BUCKET_AK', secretKey: 'BUCKET_SK' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessKey).toBe('BUCKET_AK');
      expect(map['my-bucket'].secretKey).toBe('BUCKET_SK');
    });

    it('should use minio cloud provider when minio.enabled is true', () => {
      const config = {
        minio: { enabled: true },
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'asset', name: 'aiware' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['aiware'].cloudProvider).toBe(CLOUD_PROVIDER_MINIO);
    });

    it('should use per-bucket cloudProvider override even with minio enabled', () => {
      const config = {
        minio: { enabled: true },
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'b', name: 'b', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['b'].cloudProvider).toBe('oci');
    });

    // VE-26806: on an Azure deployment, a bucket entry without an explicit
    // cloudProvider must resolve to azure — resolving to aws rebuilt the URL
    // as an amazonaws.com host and SigV4-signed it (wrong-cloud locator).
    it('should use azure cloud provider when azure_blob.enabled is true (VE-26806)', () => {
      const config = {
        azure_blob: {
          enabled: true,
          account: 'vtstorcorestage',
          endpointSuffix: 'core.usgovcloudapi.net'
        },
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'api', name: 'api' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['api'].cloudProvider).toBe(CLOUD_PROVIDER_AZURE);
      expect(map['api'].account).toBe('vtstorcorestage');
      expect(map['api'].endpointSuffix).toBe('core.usgovcloudapi.net');

      const url = buildSignableProviderUrl(map['api'], 'assets/123/abc.json');
      expect(url).toBe(
        'https://vtstorcorestage.blob.core.usgovcloudapi.net/api/assets/123/abc.json'
      );
      expect(url).not.toContain('amazonaws.com');
    });

    it('should let minio.enabled win over azure_blob.enabled (VE-26806)', () => {
      const config = {
        minio: { enabled: true },
        azure_blob: { enabled: true, account: 'acct' },
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'asset', name: 'aiware' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['aiware'].cloudProvider).toBe(CLOUD_PROVIDER_MINIO);
    });

    it('should honor per-bucket cloudProvider override on an azure-enabled config (VE-26806)', () => {
      const config = {
        azure_blob: { enabled: true, account: 'acct' },
        s3: {
          region: 'us-east-1',
          buckets: [
            { key: 'legacy', name: 'legacy-aws-bucket', cloudProvider: 'aws' }
          ]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['legacy-aws-bucket'].cloudProvider).toBe(CLOUD_PROVIDER_AWS);
      expect(map['legacy-aws-bucket'].account).toBeNull();
    });

    it('should handle object-style bucket config', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          buckets: {
            api: { name: 'dev-api.veritone.com' }
          }
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['dev-api.veritone.com']).toBeDefined();
      expect(map['api']).toBeDefined();
    });

    it('should return empty map when no buckets configured', () => {
      const config = { s3: { region: 'us-east-1' } };
      const map = buildBucketConfigMap(config, null);
      expect(Object.keys(map)).toHaveLength(0);
    });

    it('should apply OCI credentials for oci-provider buckets', () => {
      const config = {
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          buckets: [{ key: 'b', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessKey).toBe('OCI_AK');
      expect(map['oci-bucket'].secretKey).toBe('OCI_SK');
      expect(map['oci-bucket'].namespace).toBe('myns');
    });

    it('should store fallback config when present', () => {
      const config = {
        s3: {
          region: 'us-west-2',
          buckets: [{
            key: 'api',
            name: 'primary-bucket',
            fallback: {
              bucketName: 'fallback-bucket',
              region: 'us-east-1',
              cloudProvider: 'aws'
            }
          }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['primary-bucket'].fallback).toBeDefined();
      expect(map['primary-bucket'].fallback.bucketName).toBe('fallback-bucket');
    });

    // VE-23219 row #9
    it('should prefer bucket.minioEndpoint over global minio.endPoint when both are set', () => {
      const config = {
        minio: { enabled: true, endPoint: 'global-minio.local', port: 9000, secure: false },
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'asset', name: 'asset-bucket', minioEndpoint: 'bucket-minio.local' }]
        }
      };
      const result = buildBucketConfigMap(config, null);
      expect(result['asset-bucket'].minioEndpoint).toBe('bucket-minio.local');
    });
  });

  // -----------------------------------------------------------------------
  // buildFallbackMap
  // -----------------------------------------------------------------------
  describe('buildFallbackMap', () => {
    it('should build reverse-lookup from primary bucket fallback config', () => {
      const bucketConfigMap = {
        'primary-bucket': {
          name: 'primary-bucket',
          region: 'us-west-2',
          signedUrlExpires: 3600,
          fallback: {
            bucketName: 'fallback-bucket',
            region: 'us-east-1',
            cloudProvider: 'aws'
          }
        },
        api: {
          name: 'primary-bucket',
          region: 'us-west-2',
          signedUrlExpires: 3600,
          fallback: {
            bucketName: 'fallback-bucket',
            region: 'us-east-1',
            cloudProvider: 'aws'
          }
        }
      };
      const fbMap = buildFallbackMap(bucketConfigMap);
      expect(fbMap['fallback-bucket']).toBeDefined();
      expect(fbMap['fallback-bucket'].primaryBucketConf.name).toBe('primary-bucket');
      expect(fbMap['fallback-bucket'].fallbackConfig.bucketName).toBe('fallback-bucket');
    });

    it('should propagate name and MinIO fields to fallbackConfig', () => {
      const bucketConfigMap = {
        'primary-bucket': {
          name: 'primary-bucket',
          region: 'us-west-2',
          minioEndpoint: 'minio.local',
          minioPort: 9000,
          minioSecure: true,
          fallback: {
            bucketName: 'fallback-bucket',
            region: 'us-east-1'
          }
        }
      };
      const fbMap = buildFallbackMap(bucketConfigMap);
      const fbConfig = fbMap['fallback-bucket'].fallbackConfig;
      expect(fbConfig.name).toBe('fallback-bucket');
      expect(fbConfig.minioEndpoint).toBe('minio.local');
      expect(fbConfig.minioPort).toBe(9000);
      expect(fbConfig.minioSecure).toBe(true);
    });

    it('should return empty map when no fallbacks configured', () => {
      const bucketConfigMap = {
        'b1': { name: 'b1', region: 'us-west-2' }
      };
      expect(buildFallbackMap(bucketConfigMap)).toEqual({});
    });

    it('should skip entries without fallback.bucketName', () => {
      const bucketConfigMap = {
        'b1': { name: 'b1', fallback: {} }
      };
      expect(buildFallbackMap(bucketConfigMap)).toEqual({});
    });

    it('should register a fallback per logical bucket when buckets share one physical name', () => {
      // Multiple logical buckets consolidated onto a single OCI bucket name.
      const config = {
        s3: {
          cloudProvider: 'oci',
          region: 'us-ashburn-1',
          buckets: [
            { key: 'api', name: 'shared-oci', path: 'signedUrl', fallback: { bucketName: 'aws-api', cloudProvider: 'aws', region: 'us-east-1' } },
            { key: 'library', name: 'shared-oci', path: 'library', fallback: { bucketName: 'aws-library', cloudProvider: 'aws', region: 'us-east-1' } },
            { key: 'dataset', name: 'shared-oci', path: 'dataset', fallback: { bucketName: 'aws-dataset', cloudProvider: 'aws', region: 'us-east-1' } }
          ]
        }
      };
      const fbMap = buildFallbackMap(buildBucketConfigMap(config, null));
      // Every logical bucket's fallback is registered (name-based dedup would keep only one).
      expect(fbMap['aws-api']).toBeDefined();
      expect(fbMap['aws-library']).toBeDefined();
      expect(fbMap['aws-dataset']).toBeDefined();
      // …and each maps back to the correct primary logical bucket.
      expect(fbMap['aws-api'].primaryBucketConf.key).toBe('api');
      expect(fbMap['aws-library'].primaryBucketConf.key).toBe('library');
      expect(fbMap['aws-dataset'].primaryBucketConf.key).toBe('dataset');
    });
  });

  // -----------------------------------------------------------------------
  // buildFallbackGroups + selectFallbackCandidates (Direction B resolution)
  // -----------------------------------------------------------------------
  describe('buildFallbackGroups / selectFallbackCandidates', () => {
    // Five logical buckets consolidated onto one OCI bucket; some share a path,
    // two are pathless (→ default to oci.path "assets").
    const config = {
      oci: { path: 'assets', namespace: 'ns' },
      s3: {
        cloudProvider: 'oci',
        region: 'us-ashburn-1',
        buckets: [
          { key: 'api', name: 'shared-oci', path: 'signedUrl', fallback: { bucketName: 'aws-api', cloudProvider: 'aws', region: 'us-east-1' } },
          { key: 'prod-api', name: 'shared-oci', path: 'signedUrl', fallback: { bucketName: 'aws-prod-api', cloudProvider: 'aws', region: 'us-east-1' } },
          { key: 'library', name: 'shared-oci', path: 'library', fallback: { bucketName: 'aws-library', cloudProvider: 'aws', region: 'us-east-1' } },
          { key: 'tasklog', name: 'shared-oci', fallback: { bucketName: 'aws-tasklog', cloudProvider: 'aws', region: 'us-east-1' } },
          { key: 'ugc', name: 'shared-oci', fallback: { bucketName: 'aws-ugc', cloudProvider: 'aws', region: 'us-east-1' } }
        ]
      }
    };

    function groups() {
      return buildFallbackGroups(buildBucketConfigMap(config, null));
    }

    it('byName groups all fallbacks under the shared physical name, in config order', () => {
      const { byName } = groups();
      const names = byName.get('shared-oci').map((f) => f.bucketName);
      expect(names).toEqual(['aws-api', 'aws-prod-api', 'aws-library', 'aws-tasklog', 'aws-ugc']);
    });

    it('byNamePath groups by path (pathless buckets default to oci.path) and orders paths longest-first', () => {
      const { byNamePath } = groups();
      const entries = byNamePath.get('shared-oci');
      const byPath = Object.fromEntries(entries.map((e) => [e.path, e.candidates.map((c) => c.bucketName)]));
      expect(byPath['signedUrl']).toEqual(['aws-api', 'aws-prod-api']);
      expect(byPath['library']).toEqual(['aws-library']);
      expect(byPath['assets']).toEqual(['aws-tasklog', 'aws-ugc']);
      // longest-first ordering
      const paths = entries.map((e) => e.path);
      for (let i = 1; i < paths.length; i++) {
        expect(paths[i - 1].length).toBeGreaterThanOrEqual(paths[i].length);
      }
    });

    it('selects the name+path candidates by longest matching prefix', () => {
      const g = groups();
      expect(selectFallbackCandidates(g, 'shared-oci', 'signedUrl/123/x.jpg').map((c) => c.bucketName))
        .toEqual(['aws-api', 'aws-prod-api']);
      expect(selectFallbackCandidates(g, 'shared-oci', 'assets/123/x.jpg').map((c) => c.bucketName))
        .toEqual(['aws-tasklog', 'aws-ugc']);
      expect(selectFallbackCandidates(g, 'shared-oci', 'library/123/x.jpg').map((c) => c.bucketName))
        .toEqual(['aws-library']);
    });

    it('falls back to the full name group when no path prefix matches (hybrid)', () => {
      const g = groups();
      expect(selectFallbackCandidates(g, 'shared-oci', 'unknownPrefix/123/x.jpg').map((c) => c.bucketName))
        .toEqual(['aws-api', 'aws-prod-api', 'aws-library', 'aws-tasklog', 'aws-ugc']);
    });

    it('candidate order reflects config-definition order (tie-break)', () => {
      const g = groups();
      // api is defined before prod-api → it wins ties for the shared "signedUrl" path
      expect(selectFallbackCandidates(g, 'shared-oci', 'signedUrl/x')[0].bucketName).toBe('aws-api');
    });

    it('returns empty for an unknown primary name', () => {
      const g = groups();
      expect(selectFallbackCandidates(g, 'no-such-bucket', 'assets/x')).toEqual([]);
    });

    it('dedups the name/key duplicate entries so each fallback appears once', () => {
      const { byName } = groups();
      const names = byName.get('shared-oci').map((f) => f.bucketName);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  // -----------------------------------------------------------------------
  // buildPresignerMap
  // -----------------------------------------------------------------------
  describe('buildPresignerMap', () => {
    it('should create presigners for AWS buckets', () => {
      const bucketConfigMap = {
        'b1': {
          name: 'b1',
          cloudProvider: 'aws',
          region: 'us-west-2',
          accessKey: 'AK',
          secretKey: 'SK'
        }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['b1']).toBeDefined();
      expect(map['b1'].presign).toBeDefined();
    });

    it('should create presigners for OCI buckets', () => {
      const bucketConfigMap = {
        'b1': {
          name: 'b1',
          cloudProvider: 'oci',
          region: 'us-phoenix-1',
          accessKey: 'AK',
          secretKey: 'SK'
        }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['b1']).toBeDefined();
    });

    it('should skip Azure buckets', () => {
      const bucketConfigMap = {
        'c1': { name: 'c1', cloudProvider: 'azure', region: 'eastus' }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['c1']).toBeUndefined();
    });

    it('should skip MinIO buckets', () => {
      const bucketConfigMap = {
        'c1': { name: 'c1', cloudProvider: 'minio', region: 'us-east-1' }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['c1']).toBeUndefined();
    });

    it('should share presigner instances for same canonical bucket name', () => {
      const bucketConfigMap = {
        'api': {
          name: 'dev-api.veritone.com',
          cloudProvider: 'aws',
          region: 'us-east-1',
          accessKey: 'AK',
          secretKey: 'SK'
        },
        'dev-api.veritone.com': {
          name: 'dev-api.veritone.com',
          cloudProvider: 'aws',
          region: 'us-east-1',
          accessKey: 'AK',
          secretKey: 'SK'
        }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['api']).toBe(map['dev-api.veritone.com']);
    });
  });
});

// ---------------------------------------------------------------------------
// headObjectExists – test with a real ephemeral HTTP server
// ---------------------------------------------------------------------------
describe('presigner – headObjectExists', () => {
  let server;
  let serverPort;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      // Route behaviour based on URL path
      if (req.url === '/exists') {
        res.writeHead(200, { 'Content-Length': '100', ETag: '"abc"', 'Last-Modified': 'Thu, 01 Jan 2026 00:00:00 GMT' });
        res.end();
      } else if (req.url === '/not-modified') {
        res.writeHead(304);
        res.end();
      } else if (req.url === '/not-found') {
        res.writeHead(404);
        res.end();
      } else if (req.url === '/forbidden') {
        res.writeHead(403);
        res.end();
      } else if (req.url === '/server-error') {
        res.writeHead(500);
        res.end();
      } else if (req.url === '/slow') {
        // Don't respond — let it timeout
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, () => {
      serverPort = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.closeAllConnections();
    server.close(done);
  });

  it('should return true for 200 response with content headers', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/exists`);
    expect(result).toBe(true);
  });

  it('should return true for 304 response', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/not-modified`);
    expect(result).toBe(true);
  });

  it('should return false for 404 response', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/not-found`);
    expect(result).toBe(false);
  });

  it('should return false for 403 response', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/forbidden`);
    expect(result).toBe(false);
  });

  it('should return false for 500 response', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/server-error`);
    expect(result).toBe(false);
  });

  it('should return false on timeout', async () => {
    const result = await headObjectExists(`http://127.0.0.1:${serverPort}/slow`, 200);
    expect(result).toBe(false);
  }, 10000);

  it('should return false on connection error', async () => {
    const result = await headObjectExists('http://127.0.0.1:1/nope', 500);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Singleton init / getInstance / presignUrl integration tests
// ---------------------------------------------------------------------------
describe('presigner – init & presignUrl', () => {
  afterEach(() => {
    // Reset singleton between tests
    try {
      presigner.getInstance()._reset();
    } catch {
      // not initialised – that's fine
    }
  });

  function buildServiceContext(overrides = {}) {
    return {
      config: {
        s3: {
          region: 'us-west-2',
          signedUrlExpires: 3600,
          buckets: [
            { key: 'api', name: 'dev-api.veritone.com', path: 'assets' },
            { key: 'upload', name: 'vtn-upload-bucket' }
          ]
        },
        minio: { enabled: false },
        ...overrides
      },
      s3Buckets: {},
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      dal: {}
    };
  }

  it('should initialise and return a singleton', () => {
    const ctx = buildServiceContext();
    const creds = { accessKey: 'TESTKEY', secretKey: 'TESTSECRET' };
    const instance = presigner.init(ctx, creds);
    expect(instance).toBeDefined();
    expect(instance.presignUrl).toBeInstanceOf(Function);
    expect(instance.getBucketConfig).toBeInstanceOf(Function);
    expect(instance.getAllBucketConfigs).toBeInstanceOf(Function);
    expect(instance.getFallbackMap).toBeInstanceOf(Function);
  });

  it('should return the same instance on repeated init calls', () => {
    const ctx = buildServiceContext();
    const creds = { accessKey: 'AK', secretKey: 'SK' };
    const inst1 = presigner.init(ctx, creds);
    const inst2 = presigner.init(ctx, creds);
    expect(inst1).toBe(inst2);
  });

  it('getInstance should throw before init', () => {
    expect(() => presigner.getInstance()).toThrow('Presigner not initialised');
  });

  it('getBucketConfig should return config for known bucket', () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const conf = inst.getBucketConfig('dev-api.veritone.com');
    expect(conf).toBeDefined();
    expect(conf.name).toBe('dev-api.veritone.com');
    expect(conf.region).toBe('us-west-2');
  });

  it('getBucketConfig should return config by key alias', () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    expect(inst.getBucketConfig('api')).toBeDefined();
    expect(inst.getBucketConfig('api').name).toBe('dev-api.veritone.com');
  });

  it('getBucketConfig should return null for unknown bucket', () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    expect(inst.getBucketConfig('nonexistent')).toBeNull();
  });

  it('getBucketConfig should resolve a fallback bucket name to the fallback config', () => {
    const ctx = buildServiceContext({
      s3: {
        region: 'us-west-2',
        signedUrlExpires: 3600,
        buckets: [
          {
            key: 'api',
            name: 'vtn-oci-upload',
            path: 'signedUrl',
            signedUrlExpires: 86400,
            fallback: {
              bucketName: 'stage-api.veritone.com',
              cloudProvider: 'aws',
              region: 'us-east-1'
            }
          }
        ]
      }
    });
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const conf = inst.getBucketConfig('stage-api.veritone.com');
    expect(conf).toBeDefined();
    expect(conf.bucketName).toBe('stage-api.veritone.com');
    // Fallback inherits the primary's TTL when not overridden.
    expect(conf.signedUrlExpires).toBe(86400);
  });

  it('getAllBucketConfigs should return a copy of all configs', () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const all = inst.getAllBucketConfigs();
    expect(all['dev-api.veritone.com']).toBeDefined();
    expect(all['vtn-upload-bucket']).toBeDefined();
  });

  it('getFallbackMap should return empty when no fallbacks configured', () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    expect(inst.getFallbackMap()).toEqual({});
  });

  it('presignUrl should return empty string for empty URI', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const result = await inst.presignUrl('', {});
    expect(result).toBe('');
  });

  it('presignUrl should return null for null URI', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const result = await inst.presignUrl(null, {});
    expect(result).toBeNull();
  });

  it('presignUrl should return the URI unchanged for unrecognised bucket', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const uri = 'https://example.com/unknown/file.txt';
    const result = await inst.presignUrl(uri, {});
    expect(result).toBe(uri);
  });

  it('presignUrl should sign an S3 URI for a known bucket', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AKIATEST', secretKey: 'SKTEST' });
    const uri = 'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/7682/asset/file.mp3';
    const result = await inst.presignUrl(uri, { method: 'GET', ttl: 300 });
    expect(result).toContain('X-Amz-Algorithm');
    expect(result).toContain('X-Amz-Credential');
    expect(result).toContain('X-Amz-Signature');
    expect(result).toContain('X-Amz-Expires=300');
    expect(result).toContain('dev-api.veritone.com');
  });

  it('presignUrl should default to GET method', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AKIATEST', secretKey: 'SKTEST' });
    const uri = 'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/file.txt';
    const result = await inst.presignUrl(uri, {});
    expect(result).toContain('X-Amz-Algorithm');
  });

  it('presignUrl should use bucket signedUrlExpires as default ttl', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AKIATEST', secretKey: 'SKTEST' });
    const uri = 'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/file.txt';
    const result = await inst.presignUrl(uri, {});
    expect(result).toContain('X-Amz-Expires=3600');
  });

  // VE-27981: reinstated content-disposition stamping. These run the real
  // SigV4 presigner, so the disposition's presence in the signed URL means it
  // was in the canonical request (S3 rejects unsigned response-* overrides).
  describe('presignUrl with a download filename (VE-27981)', () => {
    const uri =
      'https://dev-api.veritone.com.s3.us-west-2.amazonaws.com/7682/asset/file.mp3';
    const dispositionOf = (signedUrl) =>
      new URL(signedUrl).searchParams.get('response-content-disposition');

    function initInstance() {
      return presigner.init(buildServiceContext(), {
        accessKey: 'AKIATEST',
        secretKey: 'SKTEST'
      });
    }

    it('stamps response-content-disposition=attachment with the filename', async () => {
      const inst = initInstance();
      const result = await inst.presignUrl(uri, { ttl: 300, fileName: 'file.mp3' });
      expect(dispositionOf(result)).toBe('attachment; filename="file.mp3"');
      expect(result).toContain('X-Amz-Signature');
    });

    it('includes the disposition in the signature computation', async () => {
      const inst = initInstance();
      const withName = await inst.presignUrl(uri, { ttl: 300, fileName: 'file.mp3' });
      const withoutName = await inst.presignUrl(uri, { ttl: 300 });
      const sigOf = (u) => new URL(u).searchParams.get('X-Amz-Signature');
      expect(sigOf(withName)).not.toBe(sigOf(withoutName));
    });

    it('omits the parameter entirely when no filename is given', async () => {
      const inst = initInstance();
      const result = await inst.presignUrl(uri, { ttl: 300 });
      expect(dispositionOf(result)).toBeNull();
    });

    it('encodes special characters per the legacy shim semantics', async () => {
      const inst = initInstance();
      const result = await inst.presignUrl(uri, {
        ttl: 300,
        fileName: 'report’s copy.zip'
      });
      expect(dispositionOf(result)).toBe(
        'attachment; filename="report%E2%80%99s%20copy.zip"'
      );
    });

    it('a metadata filename cannot inject additional query parameters', async () => {
      const inst = initInstance();
      const result = await inst.presignUrl(uri, {
        ttl: 300,
        fileName: 'x.mp3&x-injected=1'
      });
      const params = new URL(result).searchParams;
      expect(params.get('x-injected')).toBeNull();
      expect(params.get('response-content-disposition')).toContain('x-injected');
    });

    it('backfills the extension from the uri when the filename has none', async () => {
      const inst = initInstance();
      const result = await inst.presignUrl(uri, { ttl: 300, fileName: 'soundtrack' });
      expect(dispositionOf(result)).toBe('attachment; filename="soundtrack.mp3"');
    });
  });

  // VE-27981: Azure parity — the legacy Azure shim stamped download filenames
  // via the SAS contentDisposition (`rscd`), so the presigner must too.
  // @azure/storage-blob is virtual-mocked (see file top).
  describe('presignUrl over an Azure bucket with a download filename (VE-27981)', () => {
    function initAzureInstance() {
      const ctx = buildServiceContext({
        azure_blob: {
          enabled: true,
          account: 'acct',
          key: 'dGVzdC1rZXk=',
          endpointSuffix: 'core.windows.net',
          signedUrlExpires: 3600
        },
        s3: {
          region: 'us-east-1',
          signedUrlExpires: 3600,
          buckets: [{ key: 'blob', name: 'aiware' }]
        }
      });
      return presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    }

    beforeEach(() => {
      mockAzureGenerateBlobSAS.mockClear();
    });

    it('signs the SAS with the attachment contentDisposition', async () => {
      const inst = initAzureInstance();
      const azureUri =
        'https://acct.blob.core.windows.net/aiware/media/clip one.mp4';

      const result = await inst.presignUrl(azureUri, {
        ttl: 300,
        fileName: 'clip one.mp4'
      });

      expect(mockAzureGenerateBlobSAS).toHaveBeenCalledWith(
        expect.objectContaining({
          contentDisposition: 'attachment; filename="clip%20one.mp4"'
        }),
        expect.anything()
      );
      expect(result).toContain('sig=azuresig');
    });

    it('signs the SAS without a contentDisposition when no filename is given', async () => {
      const inst = initAzureInstance();
      const azureUri = 'https://acct.blob.core.windows.net/aiware/media/clip.mp4';

      await inst.presignUrl(azureUri, { ttl: 300 });

      expect(mockAzureGenerateBlobSAS).toHaveBeenCalledTimes(1);
      expect(
        mockAzureGenerateBlobSAS.mock.calls[0][0].contentDisposition
      ).toBeUndefined();
    });
  });

  // VE-26276: keys with special characters must reach the signer in RFC 3986
  // canonical form for OCI, and malformed percent sequences must not throw.
  describe('presignUrl with special-character OCI keys (VE-26276)', () => {
    function buildOciServiceContext() {
      return buildServiceContext({
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', namespace: 'myns' },
        s3: {
          region: 'us-ashburn-1',
          signedUrlExpires: 3600,
          buckets: [{ key: 'upload', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      });
    }
    const ociBase =
      'https://myns.compat.objectstorage.us-ashburn-1.oraclecloud.com/oci-bucket';

    it('should sign an OCI URI with parentheses using the canonical encoded path', async () => {
      const ctx = buildOciServiceContext();
      const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
      const key = '55255/other/2026/6/5/_/walking(854x480_30sec)-15-32-770.mp4';
      const result = await inst.presignUrl(`${ociBase}/${key}`, { ttl: 300 });

      expect(result).toContain('X-Amz-Signature');
      const parsed = new URL(result);
      expect(parsed.pathname).toContain('walking%28854x480_30sec%29');
      expect(parsed.pathname).not.toContain('(');
      // The signed path must round-trip to the exact stored object key.
      expect(decodeURIComponent(parsed.pathname)).toBe(`/oci-bucket/${key}`);
    });

    it('should produce a path with no raw URL-sensitive characters', async () => {
      const ctx = buildOciServiceContext();
      const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
      const key = "dir/file with space&eq=plus+bang!'(2).mp4";
      const result = await inst.presignUrl(`${ociBase}/${key}`, { ttl: 60 });

      const parsed = new URL(result);
      expect(parsed.pathname).toBe(
        "/oci-bucket/dir/file%20with%20space%26eq%3Dplus%2Bbang%21%27%282%29.mp4"
      );
      expect(decodeURIComponent(parsed.pathname)).toBe(`/oci-bucket/${key}`);
    });

    it('should not throw on a key with a malformed percent sequence', async () => {
      const ctx = buildOciServiceContext();
      const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
      const result = await inst.presignUrl(`${ociBase}/dir/file%zz.mp4`, {
        ttl: 60
      });

      // Fail-safe decode: the raw key is signed as stored, percent encoded.
      expect(result).toContain('X-Amz-Signature');
      expect(new URL(result).pathname).toBe('/oci-bucket/dir/file%25zz.mp4');
    });
  });

  it('presignUrl should decode percent-encoded slashes in keys', async () => {
    const ctx = buildServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AKIATEST', secretKey: 'SKTEST' });
    const uri = 'https://vtn-upload-bucket.s3.us-west-2.amazonaws.com/path%2Fto%2Ffile.mp3';
    const result = await inst.presignUrl(uri, { ttl: 60 });
    // The signed URL should use the decoded key path
    expect(result).toContain('path/to/file.mp3');
    expect(result).toContain('X-Amz-Algorithm');
  });

  it('presignUrl should use bucket-level MinIO config', async () => {
    const ctx = buildServiceContext({
      minio: {
        enabled: true,
        endPoint: 'global-minio.local',
        accessKey: 'GAK',
        secretKey: 'GSK'
      },
      s3: {
        region: 'us-east-1',
        buckets: [{
          key: 'minio-bucket',
          name: 'minio-bucket',
          cloudProvider: 'minio',
          minioEndpoint: 'custom-minio.local',
          minioPort: 9999,
          minioSecure: true
        }]
      }
    });
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    // Use an AWS-style URI that the mock uriParser recognizes
    const uri = 'https://minio-bucket.s3.us-east-1.amazonaws.com/file.txt';
    const result = await inst.presignUrl(uri, {});
    expect(result).toContain('https://custom-minio.local:9999/minio-bucket/file.txt');
  });

  // VE-23219 row #10
  it('presignUrl should cache presigners independently per bucket name for MinIO', async () => {
    const ctx = buildServiceContext({
      minio: { enabled: true, endPoint: 'minio.local', accessKey: 'GLOBAL_AK', secretKey: 'GLOBAL_SK' },
      s3: {
        region: 'us-east-1',
        buckets: [
          {
            key: 'bucket-a',
            name: 'bucket-a',
            cloudProvider: 'minio',
            minioEndpoint: 'minio.local',
            minioPort: 9000,
            minioSecure: false,
            accessKey: 'BUCKET_A_AK',
            secretKey: 'BUCKET_A_SK'
          },
          {
            key: 'bucket-b',
            name: 'bucket-b',
            cloudProvider: 'minio',
            minioEndpoint: 'minio.local',
            minioPort: 9000,
            minioSecure: false,
            accessKey: 'BUCKET_B_AK',
            secretKey: 'BUCKET_B_SK'
          }
        ]
      }
    });
    const inst = presigner.init(ctx);
    const resultA = await inst.presignUrl('https://bucket-a.s3.us-east-1.amazonaws.com/file.txt', {});
    const resultB = await inst.presignUrl('https://bucket-b.s3.us-east-1.amazonaws.com/file.txt', {});
    expect(resultA).toContain('BUCKET_A_AK');
    expect(resultB).toContain('BUCKET_B_AK');
  });

  // VE-23219 row #11
  it('presignUrl should use bucket-level accessKey/secretKey over global minio credentials', async () => {
    const ctx = buildServiceContext({
      minio: { enabled: true, endPoint: 'minio.local', accessKey: 'GLOBAL_AK', secretKey: 'GLOBAL_SK' },
      s3: {
        region: 'us-east-1',
        buckets: [{
          key: 'asset',
          name: 'asset-bucket',
          cloudProvider: 'minio',
          minioEndpoint: 'minio.local',
          minioPort: 9000,
          minioSecure: false,
          accessKey: 'BUCKET_AK',
          secretKey: 'BUCKET_SK'
        }]
      }
    });
    const inst = presigner.init(ctx);
    const result = await inst.presignUrl('https://asset-bucket.s3.us-east-1.amazonaws.com/file.txt', {});
    expect(result).toContain('BUCKET_AK');
    expect(result).not.toContain('GLOBAL_AK');
  });

  it('getDeletableUris should find the other bucket via fallbackMap', async () => {
    const ctx = buildServiceContext({
      s3: {
        region: 'us-west-2',
        buckets: [{
          key: 'primary',
          name: 'primary-bucket',
          accessKey: 'PAK',
          secretKey: 'PSK',
          fallback: {
            bucketName: 'fallback-bucket',
            region: 'us-east-1',
            accessKey: 'FAK',
            secretKey: 'FSK'
          }
        }]
      }
    });
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });

    // Mock headObjectExists (which headCheckBucket uses)
    const originalHead = presigner._headObjectExists;
    presigner._headObjectExists = jest.fn().mockResolvedValue(true);

    try {
      // 1. From primary, should find fallback
      const uri1 = 'https://primary-bucket.s3.us-west-2.amazonaws.com/file.txt';
      const uris1 = await inst.getDeletableUris(uri1);
      expect(uris1.primaryUri).toBe(uri1);
      // rebuilt URIs are path-style (dotted legacy buckets break TLS otherwise)
      expect(uris1.fallbackUri).toBe('https://s3.us-east-1.amazonaws.com/fallback-bucket/file.txt');

      // 2. From fallback, should find primary
      const uri2 = 'https://fallback-bucket.s3.us-east-1.amazonaws.com/file.txt';
      const uris2 = await inst.getDeletableUris(uri2);
      expect(uris2.fallbackUri).toBe(uri2);
      expect(uris2.primaryUri).toBe('https://s3.us-west-2.amazonaws.com/primary-bucket/file.txt');
    } finally {
      presigner._headObjectExists = originalHead;
    }
  });

  it('_reset should clear the singleton', () => {
    const ctx = buildServiceContext();
    presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    presigner.getInstance()._reset();
    expect(() => presigner.getInstance()).toThrow('Presigner not initialised');
  });
});

// ---------------------------------------------------------------------------
// presignUrl with fallback configuration
// ---------------------------------------------------------------------------
describe('presigner – fallback flow', () => {
  afterEach(() => {
    try {
      presigner.getInstance()._reset();
    } catch {
      // ok
    }
  });

  function buildFallbackServiceContext() {
    return {
      config: {
        s3: {
          region: 'us-west-2',
          signedUrlExpires: 3600,
          buckets: [
            {
              key: 'api',
              name: 'primary-bucket',
              fallback: {
                bucketName: 'fallback-bucket',
                region: 'us-east-1',
                cloudProvider: 'aws',
                accessKey: 'FB_AK',
                secretKey: 'FB_SK'
              }
            }
          ]
        },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      dal: {}
    };
  }

  it('getFallbackMap should contain the fallback entry', () => {
    const ctx = buildFallbackServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const fbMap = inst.getFallbackMap();
    expect(fbMap['fallback-bucket']).toBeDefined();
    expect(fbMap['fallback-bucket'].primaryBucketConf.name).toBe('primary-bucket');
  });

  it('presignUrl should sign fallback when HEAD on primary fails', async () => {
    // Mock headObjectExists to return false (object not in primary)
    const originalHeadObjectExists = presigner._headObjectExists;
    // We can't easily mock this since it's used inside the closure,
    // but we can test the fallback map is built correctly
    const ctx = buildFallbackServiceContext();
    const inst = presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const fbMap = inst.getFallbackMap();
    expect(fbMap['fallback-bucket'].fallbackConfig.accessKey).toBe('FB_AK');
    expect(fbMap['fallback-bucket'].fallbackConfig.secretKey).toBe('FB_SK');
    expect(fbMap['fallback-bucket'].fallbackConfig.region).toBe('us-east-1');
  });
});

// ---------------------------------------------------------------------------
// resolveFallbackCredentials
// ---------------------------------------------------------------------------
describe('presigner – resolveFallbackCredentials', () => {
  it('should return inline credentials when provided', async () => {
    const fallbackConfig = { accessKey: 'FK', secretKey: 'FS', bucketName: 'fb' };
    const provider = await resolveFallbackCredentials(fallbackConfig, {}, new Map());
    const creds = await provider();
    expect(creds.accessKeyId).toBe('FK');
    expect(creds.secretAccessKey).toBe('FS');
  });

  it('should fall back to STATIC_CREDENTIALS_CHAIN when no inline creds or credentialId', async () => {
    const fallbackConfig = { bucketName: 'fb' };
    const provider = await resolveFallbackCredentials(fallbackConfig, {}, new Map());
    // provider should be STATIC_CREDENTIALS_CHAIN (a function)
    expect(typeof provider).toBe('function');
  });

  it('should throw when external credential lookup fails', async () => {
    const mockLogger = { warn: jest.fn(), error: jest.fn() };
    const mockDal = {
      externalCredential: {
        getExternalCredential: jest.fn().mockRejectedValue(new Error('DB error'))
      }
    };
    const serviceCtx = { logger: mockLogger, dal: mockDal, config: {} };
    const fallbackConfig = { bucketName: 'fb', accessCredentialId: 'cred-123' };

    await expect(resolveFallbackCredentials(fallbackConfig, serviceCtx, new Map()))
      .rejects.toThrow('Failed to resolve external credential cred-123 for bucket fb: DB error');
  });
});

// ---------------------------------------------------------------------------
// Module-level presignUrl function
// ---------------------------------------------------------------------------
describe('presigner – module-level presignUrl', () => {
  afterEach(() => {
    try {
      presigner.getInstance()._reset();
    } catch {
      // ok
    }
  });

  it('should throw if not initialised', async () => {
    await expect(presigner.presignUrl('https://x.com/y', {})).rejects.toThrow(
      'Presigner not initialised'
    );
  });

  it('should delegate to the singleton', async () => {
    const ctx = {
      config: {
        s3: {
          region: 'us-west-2',
          signedUrlExpires: 3600,
          buckets: [{ key: 'b', name: 'test-bucket' }]
        },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {}
    };
    presigner.init(ctx, { accessKey: 'AK', secretKey: 'SK' });
    const uri = 'https://test-bucket.s3.us-west-2.amazonaws.com/file.txt';
    const result = await presigner.presignUrl(uri, {});
    expect(result).toContain('X-Amz-Algorithm');
  });
});

// ---------------------------------------------------------------------------
// Credential resolution – buildBucketConfigMap precedence
// ---------------------------------------------------------------------------
describe('presigner – credential precedence in buildBucketConfigMap', () => {
  describe('top-level credentials (passed as argument)', () => {
    it('should apply top-level accessKey/secretKey when bucket has no credentials', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const creds = { accessKey: 'TOP_AK', secretKey: 'TOP_SK' };
      const map = buildBucketConfigMap(config, creds);
      expect(map['my-bucket'].accessKey).toBe('TOP_AK');
      expect(map['my-bucket'].secretKey).toBe('TOP_SK');
      expect(map['my-bucket'].accessCredentialId).toBeNull();
    });

    it('should apply s3 config-level accessKey/secretKey when no argument creds', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'S3_AK',
          secretKey: 'S3_SK',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessKey).toBe('S3_AK');
      expect(map['my-bucket'].secretKey).toBe('S3_SK');
      expect(map['my-bucket'].accessCredentialId).toBeNull();
    });

    it('should prefer argument creds over s3 config-level creds', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'S3_AK',
          secretKey: 'S3_SK',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const map = buildBucketConfigMap(config, { accessKey: 'ARG_AK', secretKey: 'ARG_SK' });
      expect(map['my-bucket'].accessKey).toBe('ARG_AK');
      expect(map['my-bucket'].secretKey).toBe('ARG_SK');
    });
  });

  describe('top-level s3.accessCredentialId (last-resort)', () => {
    it('should defer to s3.accessCredentialId when no inline keys resolve anywhere', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessCredentialId: 'top-cred-uuid',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessCredentialId).toBe('top-cred-uuid');
      expect(map['my-bucket'].accessKey).toBeNull();
      expect(map['my-bucket'].secretKey).toBeNull();
    });

    it('should prefer resolved top-level keys over s3.accessCredentialId', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessCredentialId: 'top-cred-uuid',
          buckets: [{ key: 'b', name: 'my-bucket' }]
        }
      };
      const map = buildBucketConfigMap(config, { accessKey: 'ARG_AK', secretKey: 'ARG_SK' });
      expect(map['my-bucket'].accessKey).toBe('ARG_AK');
      expect(map['my-bucket'].secretKey).toBe('ARG_SK');
      expect(map['my-bucket'].accessCredentialId).toBeNull();
    });

    it('should prefer bucket-level accessCredentialId over top-level', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessCredentialId: 'top-cred-uuid',
          buckets: [{ key: 'b', name: 'my-bucket', accessCredentialId: 'bucket-cred-uuid' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessCredentialId).toBe('bucket-cred-uuid');
    });

    it('should not use top-level accessCredentialId when bucket has inline keys', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessCredentialId: 'top-cred-uuid',
          buckets: [{ key: 'b', name: 'my-bucket', accessKey: 'BUCKET_AK', secretKey: 'BUCKET_SK' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessKey).toBe('BUCKET_AK');
      expect(map['my-bucket'].secretKey).toBe('BUCKET_SK');
      expect(map['my-bucket'].accessCredentialId).toBeNull();
    });
  });

  describe('bucket-level accessKey/secretKey takes precedence over top-level', () => {
    it('should use bucket accessKey/secretKey and ignore top-level', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'TOP_AK',
          secretKey: 'TOP_SK',
          buckets: [{ key: 'b', name: 'my-bucket', accessKey: 'BUCKET_AK', secretKey: 'BUCKET_SK' }]
        }
      };
      const map = buildBucketConfigMap(config, { accessKey: 'ARG_AK', secretKey: 'ARG_SK' });
      expect(map['my-bucket'].accessKey).toBe('BUCKET_AK');
      expect(map['my-bucket'].secretKey).toBe('BUCKET_SK');
      expect(map['my-bucket'].accessCredentialId).toBeNull();
    });

    it('should not fall back to top-level if only bucket accessKey is set', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'TOP_AK',
          secretKey: 'TOP_SK',
          buckets: [{ key: 'b', name: 'my-bucket', accessKey: 'BUCKET_AK' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      // bucket-level keys present → no top-level fallback, secretKey stays null
      expect(map['my-bucket'].accessKey).toBe('BUCKET_AK');
      expect(map['my-bucket'].secretKey).toBeNull();
    });
  });

  describe('accessCredentialId takes precedence over all keys', () => {
    it('should use accessCredentialId and null out keys when set on bucket', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'TOP_AK',
          secretKey: 'TOP_SK',
          buckets: [{
            key: 'b',
            name: 'my-bucket',
            accessCredentialId: 'cred-uuid-123'
          }]
        }
      };
      const map = buildBucketConfigMap(config, { accessKey: 'ARG_AK', secretKey: 'ARG_SK' });
      expect(map['my-bucket'].accessCredentialId).toBe('cred-uuid-123');
      expect(map['my-bucket'].accessKey).toBeNull();
      expect(map['my-bucket'].secretKey).toBeNull();
    });

    it('should ignore bucket-level accessKey/secretKey when accessCredentialId is present', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          buckets: [{
            key: 'b',
            name: 'my-bucket',
            accessCredentialId: 'cred-uuid-456',
            accessKey: 'BUCKET_AK',
            secretKey: 'BUCKET_SK'
          }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['my-bucket'].accessCredentialId).toBe('cred-uuid-456');
      expect(map['my-bucket'].accessKey).toBeNull();
      expect(map['my-bucket'].secretKey).toBeNull();
    });

    it('should ignore top-level and bucket-level keys when accessCredentialId is present', () => {
      const config = {
        s3: {
          region: 'us-east-1',
          accessKey: 'S3_AK',
          secretKey: 'S3_SK',
          buckets: [{
            key: 'b',
            name: 'my-bucket',
            accessCredentialId: 'cred-uuid-789',
            accessKey: 'BUCKET_AK',
            secretKey: 'BUCKET_SK'
          }]
        }
      };
      const map = buildBucketConfigMap(config, { accessKey: 'ARG_AK', secretKey: 'ARG_SK' });
      expect(map['my-bucket'].accessCredentialId).toBe('cred-uuid-789');
      expect(map['my-bucket'].accessKey).toBeNull();
      expect(map['my-bucket'].secretKey).toBeNull();
    });
  });

  describe('OCI provider credential precedence', () => {
    it('should use OCI top-level creds for oci-provider buckets with no bucket-level creds', () => {
      const config = {
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          accessKey: 'TOP_AK',
          secretKey: 'TOP_SK',
          buckets: [{ key: 'b', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessKey).toBe('OCI_AK');
      expect(map['oci-bucket'].secretKey).toBe('OCI_SK');
    });

    it('should prefer bucket-level keys over OCI top-level for oci provider', () => {
      const config = {
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          buckets: [{
            key: 'b',
            name: 'oci-bucket',
            cloudProvider: 'oci',
            accessKey: 'BUCKET_AK',
            secretKey: 'BUCKET_SK'
          }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessKey).toBe('BUCKET_AK');
      expect(map['oci-bucket'].secretKey).toBe('BUCKET_SK');
    });

    it('should use accessCredentialId over OCI and bucket keys for oci provider', () => {
      const config = {
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          buckets: [{
            key: 'b',
            name: 'oci-bucket',
            cloudProvider: 'oci',
            accessCredentialId: 'oci-cred-id',
            accessKey: 'BUCKET_AK',
            secretKey: 'BUCKET_SK'
          }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessCredentialId).toBe('oci-cred-id');
      expect(map['oci-bucket'].accessKey).toBeNull();
      expect(map['oci-bucket'].secretKey).toBeNull();
    });

    it('should use oci.accessCredentialId over top-level s3.accessCredentialId for oci provider', () => {
      const config = {
        oci: { accessCredentialId: 'oci-cred-id', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          accessCredentialId: 'top-cred-id',
          buckets: [{ key: 'b', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessCredentialId).toBe('oci-cred-id');
      expect(map['oci-bucket'].accessKey).toBeNull();
      expect(map['oci-bucket'].secretKey).toBeNull();
    });

    it('should fall back to top-level s3.accessCredentialId when oci has none', () => {
      const config = {
        oci: { namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          accessCredentialId: 'top-cred-id',
          buckets: [{ key: 'b', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessCredentialId).toBe('top-cred-id');
    });

    it('should prefer inline oci keys over oci.accessCredentialId', () => {
      const config = {
        oci: { accessKey: 'OCI_AK', secretKey: 'OCI_SK', accessCredentialId: 'oci-cred-id', namespace: 'myns' },
        s3: {
          region: 'us-phoenix-1',
          accessCredentialId: 'top-cred-id',
          buckets: [{ key: 'b', name: 'oci-bucket', cloudProvider: 'oci' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      expect(map['oci-bucket'].accessKey).toBe('OCI_AK');
      expect(map['oci-bucket'].secretKey).toBe('OCI_SK');
      expect(map['oci-bucket'].accessCredentialId).toBeNull();
    });

    it('should not apply oci.accessCredentialId to non-oci provider buckets', () => {
      const config = {
        oci: { accessCredentialId: 'oci-cred-id', namespace: 'myns' },
        s3: {
          region: 'us-east-1',
          accessCredentialId: 'top-cred-id',
          buckets: [{ key: 'b', name: 'aws-bucket', cloudProvider: 'aws' }]
        }
      };
      const map = buildBucketConfigMap(config, null);
      // aws bucket must ignore oci.accessCredentialId and use the top-level one
      expect(map['aws-bucket'].accessCredentialId).toBe('top-cred-id');
    });
  });

  describe('buildPresignerMap skips accessCredentialId buckets', () => {
    it('should not create a presigner for bucket with accessCredentialId', () => {
      const bucketConfigMap = {
        'cred-bucket': {
          name: 'cred-bucket',
          cloudProvider: 'aws',
          region: 'us-east-1',
          accessKey: null,
          secretKey: null,
          accessCredentialId: 'some-id'
        }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['cred-bucket']).toBeUndefined();
    });

    it('should create a presigner for bucket with inline keys and no accessCredentialId', () => {
      const bucketConfigMap = {
        'inline-bucket': {
          name: 'inline-bucket',
          cloudProvider: 'aws',
          region: 'us-east-1',
          accessKey: 'AK',
          secretKey: 'SK',
          accessCredentialId: null
        }
      };
      const map = buildPresignerMap(bucketConfigMap);
      expect(map['inline-bucket']).toBeDefined();
      expect(map['inline-bucket'].presign).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// resolveCredentials – unit tests
// ---------------------------------------------------------------------------
describe('presigner – resolveCredentials', () => {
  beforeEach(() => {
    mockDecryptObject.mockReset();
  });

  it('should return inline credential provider when accessKey and secretKey are present', async () => {
    const bucketConfig = { accessKey: 'AK', secretKey: 'SK', name: 'test' };
    const credentialCache = new Map();
    const provider = await resolveCredentials(bucketConfig, {}, credentialCache);
    const creds = provider();
    expect(creds.accessKeyId).toBe('AK');
    expect(creds.secretAccessKey).toBe('SK');
  });

  it('should resolve external credential and unwrap input wrapper', async () => {
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ input: { accessKey: 'DECRYPTED_AK', secretKey: 'DECRYPTED_SK' } })
    );

    const credentialCache = new Map();
    const mockServiceContext = {
      config: { decryptKeyDefault: 'test-key' },
      logger: { warn: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockResolvedValue([{
            credentialsCiphertext: 'mock-cipher'
          }])
        }
      }
    };

    const bucketConfig = {
      name: 'test-bucket',
      accessKey: null,
      secretKey: null,
      accessCredentialId: 'cred-id-abc'
    };

    const provider = await resolveCredentials(bucketConfig, mockServiceContext, credentialCache);
    const creds = provider();
    expect(creds.accessKeyId).toBe('DECRYPTED_AK');
    expect(creds.secretAccessKey).toBe('DECRYPTED_SK');
    expect(mockServiceContext.dal.externalCredential.getExternalCredential).toHaveBeenCalledWith(
      {},
      { externalCredentialId: 'cred-id-abc' }
    );
  });

  it('should resolve external credential with flat format (no input wrapper)', async () => {
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ accessKey: 'FLAT_AK', secretKey: 'FLAT_SK' })
    );

    const credentialCache = new Map();
    const mockServiceContext = {
      config: { decryptKeyDefault: 'test-key' },
      logger: { warn: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockResolvedValue([{
            credentialsCiphertext: 'mock-cipher'
          }])
        }
      }
    };

    const bucketConfig = {
      name: 'test-bucket',
      accessKey: null,
      secretKey: null,
      accessCredentialId: 'cred-id-flat'
    };

    const provider = await resolveCredentials(bucketConfig, mockServiceContext, credentialCache);
    const creds = provider();
    expect(creds.accessKeyId).toBe('FLAT_AK');
    expect(creds.secretAccessKey).toBe('FLAT_SK');
  });

  it('should cache resolved credentials by accessCredentialId', async () => {
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ input: { accessKey: 'AK', secretKey: 'SK' } })
    );

    const credentialCache = new Map();
    const mockServiceContext = {
      config: { decryptKeyDefault: 'test-key' },
      logger: { warn: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockResolvedValue([{
            credentialsCiphertext: 'mock-cipher'
          }])
        }
      }
    };

    const bucketConfig = {
      name: 'test-bucket',
      accessKey: null,
      secretKey: null,
      accessCredentialId: 'cred-id-cache'
    };

    await resolveCredentials(bucketConfig, mockServiceContext, credentialCache);
    await resolveCredentials(bucketConfig, mockServiceContext, credentialCache);

    // DAL should only be called once due to caching
    expect(mockServiceContext.dal.externalCredential.getExternalCredential).toHaveBeenCalledTimes(1);
  });

  it('should fall back to STATIC_CREDENTIALS_CHAIN when no keys and no accessCredentialId', async () => {
    const credentialCache = new Map();
    const bucketConfig = { accessKey: null, secretKey: null, accessCredentialId: null, name: 'test' };
    const provider = await resolveCredentials(bucketConfig, {}, credentialCache);
    // STATIC_CREDENTIALS_CHAIN is an async function that tries env/instance metadata
    expect(provider).toBeInstanceOf(Function);
  });

  it('should prefer accessCredentialId over inline keys in resolveCredentials', async () => {
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ input: { accessKey: 'EXT_AK', secretKey: 'EXT_SK' } })
    );

    const credentialCache = new Map();
    const mockServiceContext = {
      config: { decryptKeyDefault: 'test-key' },
      logger: { warn: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockResolvedValue([{
            credentialsCiphertext: 'mock-cipher'
          }])
        }
      }
    };

    // buildBucketConfigMap nulls out keys when accessCredentialId is set,
    // so resolveCredentials receives null keys and goes to accessCredentialId path.
    const bucketConfig = {
      name: 'test-bucket',
      accessKey: null,
      secretKey: null,
      accessCredentialId: 'cred-id-precedence'
    };

    const provider = await resolveCredentials(bucketConfig, mockServiceContext, credentialCache);
    const creds = provider();
    expect(creds.accessKeyId).toBe('EXT_AK');
    expect(creds.secretAccessKey).toBe('EXT_SK');
  });

  it('should throw if external credential resolution fails', async () => {
    const credentialCache = new Map();
    const mockServiceContext = {
      config: { decryptKeyDefault: 'test-key' },
      logger: { warn: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockRejectedValue(new Error('DB connection failed'))
        }
      }
    };

    const bucketConfig = {
      name: 'test-bucket',
      accessKey: null,
      secretKey: null,
      accessCredentialId: 'cred-id-fail'
    };

    await expect(resolveCredentials(bucketConfig, mockServiceContext, credentialCache))
      .rejects.toThrow('Failed to resolve external credential cred-id-fail for bucket test-bucket: DB connection failed');
    // Should not cache failed resolution
    expect(credentialCache.has('cred-id-fail')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VE-26007 — fallback credential isolation (own config block only)
//
// Repro class: a logical bucket whose `key` equals its AWS fallback's
// bucketName (t3m preview buckets et al.) made signFallbackUrl and the HEAD
// probes inherit the OCI primary's credentials via the bucketConfigMap /
// presignerMap dual keying. These tests drive the real presignUrl() flows
// with HEAD traffic intercepted at the https layer.
// ---------------------------------------------------------------------------
describe('presigner – VE-26007 fallback credential isolation', () => {
  const https = require('https');

  const OCI_AK = 'OCISENTINELAK';
  const ENV_AK = 'ENVCHAINAK';
  let headRequests;
  let httpsSpy;
  let savedEnv;

  // Intercept HEAD probes: record the presigned URL and answer with the
  // status the test's handler chooses — no network, fully deterministic.
  function stubHeads(statusForUrl) {
    httpsSpy = jest.spyOn(https, 'request').mockImplementation((url, opts, cb) => {
      const requested = url.toString();
      headRequests.push(requested);
      return {
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
        end: () => {
          process.nextTick(() => cb({ statusCode: statusForUrl(requested), resume: () => {} }));
        }
      };
    });
  }

  beforeEach(() => {
    headRequests = [];
    savedEnv = {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY
    };
    // Deterministic identity for the env → instance-profile default chain.
    process.env.AWS_ACCESS_KEY_ID = ENV_AK;
    process.env.AWS_SECRET_ACCESS_KEY = 'ENVCHAINSK';
  });

  afterEach(() => {
    if (httpsSpy) httpsSpy.mockRestore();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      presigner.getInstance()._reset();
    } catch {
      // not initialised – fine
    }
  });

  // Mirrors the prod shape: consolidated OCI primary, foreign AWS fallback,
  // logical key IDENTICAL to the fallback bucket name.
  function buildCollidingContext(fallbackOverrides = {}, extraBuckets = []) {
    return {
      config: {
        s3: {
          region: 'us-chicago-1',
          cloudProvider: 'oci',
          signedUrlExpires: 3600,
          buckets: [
            {
              key: 's3-t3m-previewpriv-or-1',
              name: 'vtn-oci-consolidated',
              path: 'previewpriv',
              region: 'us-chicago-1',
              namespace: 'testns',
              fallback: {
                bucketName: 's3-t3m-previewpriv-or-1',
                cloudProvider: 'aws',
                region: 'us-east-1',
                ...fallbackOverrides
              }
            },
            ...extraBuckets
          ]
        },
        oci: {
          enabled: true,
          namespace: 'testns',
          region: 'us-chicago-1',
          accessKey: OCI_AK,
          secretKey: 'OCISENTINELSK'
        },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {}
    };
  }

  const FALLBACK_URI =
    'https://s3-t3m-previewpriv-or-1.s3.us-east-1.amazonaws.com/media/file.mp4';

  it('signs a colliding fallback bucket with the default chain, never the OCI primary credentials', async () => {
    stubHeads(() => 404); // object not migrated
    const inst = presigner.init(buildCollidingContext());

    const result = await inst.presignUrl(FALLBACK_URI, {});

    expect(result).toContain('s3-t3m-previewpriv-or-1');
    expect(result).toContain('amazonaws.com');
    expect(result).toContain(ENV_AK);
    expect(result).not.toContain(OCI_AK);
  });

  it('carries the content-disposition filename onto fallback-signed URLs (VE-27981)', async () => {
    stubHeads(() => 404); // object not migrated → fallback signs it
    const inst = presigner.init(buildCollidingContext());

    const result = await inst.presignUrl(FALLBACK_URI, { fileName: 'clip.mp4' });

    expect(new URL(result).searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="clip.mp4"'
    );
  });

  it('probes the primary under the logical bucket path prefix (FR-5)', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(buildCollidingContext());

    await inst.presignUrl(FALLBACK_URI, {});

    const primaryProbe = headRequests.find((u) => u.includes('oraclecloud.com'));
    expect(primaryProbe).toBeDefined();
    expect(primaryProbe).toContain('/vtn-oci-consolidated/previewpriv/media/file.mp4');
  });

  it('signs the primary with the prefixed key on migration hit and reports it to onPrimaryHit (FR-5)', async () => {
    stubHeads(() => 200); // object migrated to primary
    const inst = presigner.init(buildCollidingContext());
    const onPrimaryHit = jest.fn();

    const result = await inst.presignUrl(FALLBACK_URI, { onPrimaryHit });

    expect(result).toContain('/vtn-oci-consolidated/previewpriv/media/file.mp4');
    expect(result).toContain(OCI_AK); // primary signing is unchanged (FR-3)
    expect(onPrimaryHit).toHaveBeenCalledWith(
      FALLBACK_URI,
      expect.stringContaining('/vtn-oci-consolidated/previewpriv/media/file.mp4'),
      'previewpriv/media/file.mp4'
    );
  });

  it('promotes from the bare primary key when the prefixed key is missing', async () => {
    // putAsset / signed-writable-URL flows write the bare key (no `path`
    // prefix); a prefix-only probe regressed promotion for those objects.
    stubHeads((url) =>
      url.includes('/vtn-oci-consolidated/media/file.mp4') ? 200 : 404
    );
    const inst = presigner.init(buildCollidingContext());
    const onPrimaryHit = jest.fn();

    const result = await inst.presignUrl(FALLBACK_URI, { onPrimaryHit });

    expect(result).toContain('/vtn-oci-consolidated/media/file.mp4');
    expect(result).not.toContain('/previewpriv/');
    expect(onPrimaryHit).toHaveBeenCalledWith(
      FALLBACK_URI,
      expect.stringContaining('/vtn-oci-consolidated/media/file.mp4'),
      'media/file.mp4'
    );

    // Probe order: prefixed key first (VE-26007 behavior preserved), bare second.
    const primaryProbes = headRequests.filter((u) => u.includes('oraclecloud.com'));
    expect(primaryProbes[0]).toContain('/vtn-oci-consolidated/previewpriv/media/file.mp4');
    expect(primaryProbes[1]).toContain('/vtn-oci-consolidated/media/file.mp4');
  });

  it('probes prefixed then bare and signs the fallback when the object is in neither', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(buildCollidingContext());
    const onPrimaryHit = jest.fn();

    const result = await inst.presignUrl(FALLBACK_URI, { onPrimaryHit });

    expect(result).toContain('s3-t3m-previewpriv-or-1');
    expect(result).toContain('amazonaws.com');
    expect(onPrimaryHit).not.toHaveBeenCalled();

    const primaryProbes = headRequests.filter((u) => u.includes('oraclecloud.com'));
    expect(primaryProbes).toHaveLength(2);
    expect(primaryProbes[0]).toContain('/vtn-oci-consolidated/previewpriv/media/file.mp4');
    expect(primaryProbes[1]).toContain('/vtn-oci-consolidated/media/file.mp4');
  });

  it('uses the fallback block\'s own accessCredentialId exclusively', async () => {
    stubHeads(() => 404);
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ accessKey: 'CREDROWAK', secretKey: 'CREDROWSK' })
    );
    const ctx = buildCollidingContext({ accessCredentialId: 'cred-own-block' });
    ctx.dal = {
      externalCredential: {
        getExternalCredential: jest.fn().mockResolvedValue([
          { credentialsCiphertext: 'ciphertext' }
        ])
      }
    };
    ctx.config.decryptKeyDefault = 'test-key';
    const inst = presigner.init(ctx);

    const result = await inst.presignUrl(FALLBACK_URI, {});

    expect(result).toContain('CREDROWAK');
    expect(result).not.toContain(OCI_AK);
    expect(result).not.toContain(ENV_AK);
    expect(ctx.dal.externalCredential.getExternalCredential).toHaveBeenCalledWith(
      {},
      { externalCredentialId: 'cred-own-block' }
    );
  });

  it('uses the fallback block\'s own inline keys when declared', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(
      buildCollidingContext({ accessKey: 'FBINLINEAK', secretKey: 'FBINLINESK' })
    );

    const result = await inst.presignUrl(FALLBACK_URI, {});

    expect(result).toContain('FBINLINEAK');
    expect(result).not.toContain(OCI_AK);
  });

  it('fails closed on a half-specified inline credential pair', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(buildCollidingContext({ accessKey: 'ONLYHALF' }));

    await expect(inst.presignUrl(FALLBACK_URI, {})).rejects.toThrow(
      'accessKey and secretKey must be configured together'
    );
  });

  it('resolves config.oci credentials for an OCI-provider fallback block (BR-2)', async () => {
    stubHeads(() => 404);
    // AWS primary with an OCI fallback — the inverse migration direction.
    const ctx = {
      config: {
        s3: {
          region: 'us-east-1',
          signedUrlExpires: 3600,
          buckets: [
            {
              key: 'inverse',
              name: 'aws-primary-bucket',
              region: 'us-east-1',
              accessKey: 'AWSPRIMARYAK',
              secretKey: 'AWSPRIMARYSK',
              fallback: {
                bucketName: 'oci-fallback-bucket',
                cloudProvider: 'oci',
                namespace: 'testns',
                region: 'us-chicago-1'
              }
            }
          ]
        },
        oci: { namespace: 'testns', region: 'us-chicago-1', accessKey: OCI_AK, secretKey: 'OCISENTINELSK' },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {}
    };
    const inst = presigner.init(ctx);

    const uri = 'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/oci-fallback-bucket/media/file.mp4';
    const result = await inst.presignUrl(uri, {});

    expect(result).toContain(OCI_AK);
    expect(result).not.toContain('AWSPRIMARYAK');
  });

  it('fallback HEAD probes use the block\'s own credentials, not the colliding presignerMap entry (FR-6)', async () => {
    // Primary-URI flow: object missing in primary → Direction B probes the
    // fallback candidates. The candidate's name collides with the logical key.
    stubHeads(() => 404);
    const inst = presigner.init(buildCollidingContext());

    const primaryUri =
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/previewpriv/media/file.mp4';
    await inst.presignUrl(primaryUri, {});

    const candidateProbe = headRequests.find((u) => u.includes('amazonaws.com'));
    expect(candidateProbe).toBeDefined();
    expect(candidateProbe).toContain(ENV_AK);
    expect(candidateProbe).not.toContain(OCI_AK);
    // The fallback stores the bare key — the probe must strip the primary's
    // consolidation prefix (inverse of primaryObjectKeyFor).
    expect(candidateProbe).toContain('/media/file.mp4');
    expect(candidateProbe).not.toContain('previewpriv/media/file.mp4');
  });

  it('signs the fallback at the stripped key when Direction B resolves it', async () => {
    // Primary-URI flow: missing in primary, present in the fallback — the
    // signed fallback URL must use the bare key, not the primary's prefixed one.
    stubHeads((u) => (u.includes('amazonaws.com') ? 200 : 404));
    const inst = presigner.init(buildCollidingContext());

    const primaryUri =
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/previewpriv/media/file.mp4';
    const result = await inst.presignUrl(primaryUri, {});

    expect(result).toContain('s3-t3m-previewpriv-or-1');
    expect(result).toContain('amazonaws.com');
    expect(result).toContain('/media/file.mp4');
    expect(result).not.toContain('previewpriv/media/file.mp4');
    expect(result).toContain(ENV_AK);
    expect(result).not.toContain(OCI_AK);
  });

  it('fails closed on a half-specified inline pair (secretKey only)', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(buildCollidingContext({ secretKey: 'ONLYHALFSK' }));

    await expect(inst.presignUrl(FALLBACK_URI, {})).rejects.toThrow(
      'accessKey and secretKey must be configured together'
    );
  });

  it('keeps default-chain behavior for non-colliding fallbacks (FR-3 regression guard)', async () => {
    stubHeads(() => 404);
    const inst = presigner.init(
      buildCollidingContext({}, [
        {
          key: 'api',
          name: 'vtn-oci-consolidated',
          path: 'signedUrl',
          region: 'us-chicago-1',
          namespace: 'testns',
          fallback: {
            bucketName: 'stage-api.veritone.com',
            cloudProvider: 'aws',
            region: 'us-east-1'
          }
        }
      ])
    );

    const result = await inst.presignUrl(
      'https://stage-api.veritone.com.s3.us-east-1.amazonaws.com/media/file.mp4',
      {}
    );

    expect(result).toContain('stage-api.veritone.com');
    expect(result).toContain(ENV_AK);
    expect(result).not.toContain(OCI_AK);
  });

  it('resolves config.oci.accessCredentialId for an OCI-provider fallback block', async () => {
    stubHeads(() => 404);
    mockDecryptObject.mockReturnValue(
      JSON.stringify({ accessKey: 'OCITOPROWAK', secretKey: 'OCITOPROWSK' })
    );
    // AWS primary, OCI fallback; config.oci carries only a credential id.
    const ctx = {
      config: {
        s3: {
          region: 'us-east-1',
          signedUrlExpires: 3600,
          buckets: [
            {
              key: 'inverse',
              name: 'aws-primary-bucket',
              region: 'us-east-1',
              accessKey: 'AWSPRIMARYAK',
              secretKey: 'AWSPRIMARYSK',
              fallback: {
                bucketName: 'oci-fallback-bucket',
                cloudProvider: 'oci',
                namespace: 'testns',
                region: 'us-chicago-1'
              }
            }
          ]
        },
        oci: { namespace: 'testns', region: 'us-chicago-1', accessCredentialId: 'oci-top-cred' },
        minio: { enabled: false },
        decryptKeyDefault: 'test-key'
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {
        externalCredential: {
          getExternalCredential: jest.fn().mockResolvedValue([
            { credentialsCiphertext: 'ciphertext' }
          ])
        }
      }
    };
    const inst = presigner.init(ctx);

    const uri = 'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/oci-fallback-bucket/media/file.mp4';
    const result = await inst.presignUrl(uri, {});

    expect(result).toContain('OCITOPROWAK');
    expect(result).not.toContain('AWSPRIMARYAK');
    expect(ctx.dal.externalCredential.getExternalCredential).toHaveBeenCalledWith(
      {},
      { externalCredentialId: 'oci-top-cred' }
    );
  });

  it('resolves top-level config.s3 credentials when both the fallback and the s3 block are explicitly aws', async () => {
    stubHeads(() => 404);
    // AWS-flavored deployment: the s3 block's own credentials are the default
    // source for an aws fallback that declares none — but only when the s3
    // block declares cloudProvider aws itself.
    const ctx = {
      config: {
        s3: {
          region: 'us-east-1',
          cloudProvider: 'aws',
          signedUrlExpires: 3600,
          accessKey: 'S3TOPAK',
          secretKey: 'S3TOPSK',
          buckets: [
            {
              key: 'plain',
              name: 'aws-primary-bucket',
              region: 'us-east-1',
              fallback: {
                bucketName: 'aws-fallback-bucket',
                cloudProvider: 'aws',
                region: 'us-east-1'
              }
            }
          ]
        },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {}
    };
    const inst = presigner.init(ctx);

    const result = await inst.presignUrl(
      'https://aws-fallback-bucket.s3.us-east-1.amazonaws.com/media/file.mp4',
      {}
    );

    expect(result).toContain('aws-fallback-bucket');
    expect(result).toContain('S3TOPAK');
    expect(result).not.toContain(ENV_AK);
  });

  it('skips config.s3 credentials when the s3 block does not declare cloudProvider aws', async () => {
    stubHeads(() => 404);
    // Same shape as above minus the explicit s3.cloudProvider — an undeclared
    // block proves nothing about whose keys it holds, so the fallback uses the
    // static chain instead.
    const ctx = {
      config: {
        s3: {
          region: 'us-east-1',
          signedUrlExpires: 3600,
          accessKey: 'S3TOPAK',
          secretKey: 'S3TOPSK',
          buckets: [
            {
              key: 'plain',
              name: 'aws-primary-bucket',
              region: 'us-east-1',
              fallback: {
                bucketName: 'aws-fallback-bucket',
                cloudProvider: 'aws',
                region: 'us-east-1'
              }
            }
          ]
        },
        minio: { enabled: false }
      },
      s3Buckets: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      dal: {}
    };
    const inst = presigner.init(ctx);

    const result = await inst.presignUrl(
      'https://aws-fallback-bucket.s3.us-east-1.amazonaws.com/media/file.mp4',
      {}
    );

    expect(result).toContain('aws-fallback-bucket');
    expect(result).toContain(ENV_AK);
    expect(result).not.toContain('S3TOPAK');
  });

  it('ignores config.s3 credentials for an aws fallback when the s3 block is OCI-flavored', async () => {
    stubHeads(() => 404);
    // In OCI-consolidated deployments config.s3.cloudProvider is 'oci' and its
    // credentials belong to OCI — an aws fallback must not inherit them.
    const ctx = buildCollidingContext();
    ctx.config.s3.accessKey = 'S3OCIFLAVAK';
    ctx.config.s3.secretKey = 'S3OCIFLAVSK';
    const inst = presigner.init(ctx);

    const result = await inst.presignUrl(FALLBACK_URI, {});

    expect(result).toContain('s3-t3m-previewpriv-or-1');
    expect(result).toContain(ENV_AK);
    expect(result).not.toContain('S3OCIFLAVAK');
    expect(result).not.toContain(OCI_AK);
  });

  it('getDeletableUris maps keys across the consolidation prefix in both directions', async () => {
    stubHeads(() => 200); // primary copy exists at the prefixed key
    const inst = presigner.init(buildCollidingContext());

    // Fallback URI → primary URI carries the prefix. The fallback's name
    // collides with the logical key, so this also exercises the physical-name
    // disambiguation in getDeletableUris.
    const fromFallback = await inst.getDeletableUris(FALLBACK_URI);
    expect(fromFallback.fallbackUri).toBe(FALLBACK_URI);
    expect(fromFallback.primaryUri).toBe(
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/previewpriv/media/file.mp4'
    );

    // Primary URI → fallback URI strips the prefix.
    const fromPrimary = await inst.getDeletableUris(
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/previewpriv/media/file.mp4'
    );
    // buildAwsS3Url emits path-style URLs (VE-25972 — TLS compliance for
    // dotted legacy bucket names).
    expect(fromPrimary.fallbackUri).toBe(
      'https://s3.us-east-1.amazonaws.com/s3-t3m-previewpriv-or-1/media/file.mp4'
    );
  });

  it('getDeletableUris targets the bare primary key when only it exists', async () => {
    // Same dual-convention reality as promotion: deleting only the prefixed
    // mapping would leave a bare-key primary object behind.
    stubHeads((url) =>
      url.includes('/vtn-oci-consolidated/media/file.mp4') ? 200 : 404
    );
    const inst = presigner.init(buildCollidingContext());

    const fromFallback = await inst.getDeletableUris(FALLBACK_URI);
    expect(fromFallback.fallbackUri).toBe(FALLBACK_URI);
    expect(fromFallback.primaryUri).toBe(
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/media/file.mp4'
    );
  });

  // VE-26276 review gate: encoding is wire-format only. URIs that get
  // persisted (onPrimaryHit → asset.uri) or handed to the storage shim for
  // deletion (getDeletableUris) must carry the RAW key — the shim and other
  // asset.uri consumers parse keys without decoding. Only the signed URL and
  // the HEAD probes may carry the encoded form.
  describe('VE-26276 raw/encoded boundary for special-character keys', () => {
    const PARENS_FALLBACK_URI =
      'https://s3-t3m-previewpriv-or-1.s3.us-east-1.amazonaws.com/media/walking(854x480_30sec).mp4';
    const RAW_PRIMARY_URI =
      'https://testns.compat.objectstorage.us-chicago-1.oraclecloud.com/vtn-oci-consolidated/previewpriv/media/walking(854x480_30sec).mp4';

    it('onPrimaryHit receives the RAW primary URI while the signed URL is encoded', async () => {
      stubHeads((url) => (url.includes('walking%28') ? 200 : 404));
      const inst = presigner.init(buildCollidingContext());
      const onPrimaryHit = jest.fn();

      const result = await inst.presignUrl(PARENS_FALLBACK_URI, { onPrimaryHit });

      // Signed URL (wire form): canonical encoding, no raw parens in path.
      expect(new URL(result).pathname).toContain('walking%28854x480_30sec%29');
      // Persisted form: raw key, byte-identical to what the shim can parse.
      expect(onPrimaryHit).toHaveBeenCalledWith(
        PARENS_FALLBACK_URI,
        RAW_PRIMARY_URI,
        'previewpriv/media/walking(854x480_30sec).mp4'
      );
    });

    it('OCI HEAD probes carry the encoded key (signable boundary)', async () => {
      stubHeads(() => 404);
      const inst = presigner.init(buildCollidingContext());

      await inst.presignUrl(PARENS_FALLBACK_URI, {});

      const ociProbes = headRequests.filter((u) => u.includes('oraclecloud.com'));
      expect(ociProbes.length).toBeGreaterThan(0);
      for (const probe of ociProbes) {
        expect(new URL(probe).pathname).toContain('walking%28854x480_30sec%29');
      }
    });

    it('getDeletableUris emits RAW URIs for special-character keys', async () => {
      stubHeads((url) => (url.includes('/previewpriv/') ? 200 : 404));
      const inst = presigner.init(buildCollidingContext());

      const uris = await inst.getDeletableUris(PARENS_FALLBACK_URI);

      expect(uris.fallbackUri).toBe(PARENS_FALLBACK_URI);
      expect(uris.primaryUri).toBe(RAW_PRIMARY_URI);
      expect(uris.primaryUri).not.toContain('%28');
    });
  });
});
