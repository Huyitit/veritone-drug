const validator = require('validator');
const moment = require('moment');
const sampleInfo = require('./util.spec.queryInfo.json');
const uuid = require('uuid');
const nock = require('nock');
const _ = require('lodash');

const mockPresignUrl = jest.fn();
const mockGetBucketConfig = jest.fn();
jest.mock('../util/presigner.s3.buckets.js', () => ({
  getInstance: () => ({
    presignUrl: mockPresignUrl,
    getBucketConfig: mockGetBucketConfig
  })
}));

const mockMintStateless = jest.fn();
jest.mock('@veritone/core-server-base/virtualAsset', () =>
  jest.fn(() => ({ mintStatelessVirtualAssetUri: mockMintStateless }))
);

let metricsCounter = 0;
let eventCounter = 0;
let mockGetSignedUrlPromise = jest.fn();
let mockGetWritableAssetUrlPromise = jest.fn();
const mockGetOrgIdFromAppIdFn = jest.fn();

const mockContext = {
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  },
  config: {
    recordingIdParser: {
      prefix: 'mri-',
      baseUri: 'https://api.aws-dev.veritone.com/media-streamer'
    },
    apiRoot: 'https://api.aws-dev.veritone.com',
    apiVersionPath: '/v3',
    server: {
      responseSizeLimit: '100'
    },
    s3: {
      region: 'us-east-1',
      buckets: [
        {
          key: 'api',
          name: 'dev-api.veritone.com',
          path: 'signedUrl',
          signedUrlExpires: 10800,
          fallback: {
            bucketName: 'stage-api.veritone.com',
            cloudProvider: 'aws',
            region: 'us-east-1'
          }
        }
      ]
    },
    flyway: {
      rootOrgId: 1
    },
    nodeEnv: 'local',
    auth: {
      domain: '.test.com',
      userTokenCookieName: 'ima cookie',
      adminTokenCookieName: 'admin_cookie'
    },
    azure_blob: {
      enabled: true,
      account: 'devstoreaccount1',
      key: 'test',
      container: 'aiware',
      path: 'http://127.0.0.1:10000',
      enableUrlSigning: true,
      timeout: 10000,
      endpointSuffix: '127.0.0.1:10000',
      signedUrlExpires: 3600
    }
  },
  s3Buckets: {
    api: {
      s3: {
        bucket: 'test_bucket'
      },
      storage: {
        getSignedUrlPromise: mockGetSignedUrlPromise
      }
    },
    // s3Util also keys each bucket by its physical name — used by
    // getSignedWritableAssetUrl to select the signer that owns the bucket
    'dev-api.veritone.com': {
      s3: {
        bucket: 'dev-api.veritone.com',
        signedUrlExpires: 3600,
        encryption: true
      },
      storage: {
        getSignedUrlPromise: mockGetSignedUrlPromise,
        getSignedWritableUrlPromise: mockGetWritableAssetUrlPromise
      }
    }
  },
  storage: {
    isAmazonS3Uri: () => true
  },
  metrics: {
    incrementCounter: (name, labels) => metricsCounter++,
    incrementGauge: jest.fn(),
    // deliberately not counted in metricsCounter - the download retry test
    // asserts an exact counter total (error + retry + success), and histogram
    // observations are not counters.
    observeHistogram: jest.fn(),
    getValue: jest.fn()
  },
  messageUtil: {
    emitEvent: (event) => eventCounter++,
    buildActionInfo: jest.fn(() => ({})),
    topics: () => 'events'
  },
  httpPools: {
    'http://test.aws-dev.veritone.com/v3': {
      retryableStatusCodes: [429, 502, 503],
      maxRetries: 3
    }
  },
  dal: {
    task: {
      getTask: async function (context, args) {
        return Promise.resolve({ id: args.id, engineId: 'fake_engine' });
      }
    },
    engine: {
      getEngine: async function (context, args) {
        return Promise.resolve({ id: args.id, name: 'fake engine' });
      }
    },
    organization: {
      getOrganization: async function (context, args) {
        return args.id !== -1
          ? Promise.resolve({ id: args.id, name: 'test' })
          : Promise.reject(new Error('not found'));
      },
      getOrgIdFromAppId: mockGetOrgIdFromAppIdFn
    },
    assert: {
      setAssetStorageTags: jest.fn()
    },
    dalStorage: {
      getSignedWritableUrl: async function (path, bucket, expires) {
        return Promise.resolve({
          signedWritableUrl: `http://my_local_path/5%2Fasset%2F2025%2F0%2F4%2Fmypath%2Fasset-19-31-284_92898e5b-d43f-40c1-88cd-86734b630b2f`,
          rawSignedWritableUrl:
            'http://my_local_path/5%2Fasset%2F2025%2F0%2F4%2Fmypath%2Fasset-19-31-284_92898e5b-d43f-40c1-88cd-86734b630b2f?sv=2019-02-02&se=2025-01-03T01%3A42%3A31Z&sr=b&sp=rcwd&sig=F8zLJLg8IZ8vdc5oIQb%2FjISEG0jcitqp%2BThameZv%2FgE%3D'
        });
      },
      getBlobUploadStatus: jest.fn()
    },
    folderV2: {
      getRootFolderUserIdByFolderId: jest.fn()
    },
    asset: {
      updateAssetUri: jest.fn(),
      getAsset: jest.fn()
    }
  },
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  },
  response: {
    cookie: jest.fn()
  }
};
const util = require('./util.js')(mockContext);
const errors = require('../error')(mockContext.config);

const diffContext = _.cloneDeep(mockContext);
_.set(diffContext, 'config.auth.domain', '');
const diffConfigUtil = require('./util.js')(diffContext);
// const mockUtil = require('../test/mockUtil.js')();

describe('util', function () {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe('#checkDateTime', function () {
    it('should exist', function () {
      expect(typeof util.checkDateTime).toEqual('function');
    });
  });
  describe('#getHttpError', function () {
    it('copies only serializable scalars off the raw error', function () {
      // Simulate a Node TLS identity error: err.cert is circular at the root
      const cert = { subject: { CN: 's3.us-east-1.amazonaws.com' } };
      cert.issuerCertificate = cert;
      const tlsErr = new Error(
        "Hostname/IP does not match certificate's altnames"
      );
      tlsErr.code = 'ERR_TLS_CERT_ALTNAME_INVALID';
      tlsErr.host = 'stage-api.veritone.com.s3.us-east-1.amazonaws.com';
      tlsErr.reason = "Host: ... is not in the cert's altnames";
      tlsErr.cert = cert;

      const httpErr = util.getHttpError(
        'https://stage-api.veritone.com.s3.us-east-1.amazonaws.com/k',
        tlsErr,
        null,
        null,
        null
      );

      expect(httpErr.data.error).toEqual({
        name: 'Error',
        message: "Hostname/IP does not match certificate's altnames",
        code: 'ERR_TLS_CERT_ALTNAME_INVALID',
        syscall: undefined,
        hostname: 'stage-api.veritone.com.s3.us-east-1.amazonaws.com',
        reason: "Host: ... is not in the cert's altnames"
      });
      // must be JSON-safe end to end (this is what crashed emitErrorEvent)
      expect(() => JSON.stringify(httpErr.data)).not.toThrow();
    });

    it('omits the error field when no raw error is given', function () {
      const httpErr = util.getHttpError('https://x/y', null, 404, 'body', null);
      expect(httpErr.data.error).toBeUndefined();
      expect(httpErr.data.httpStatusCode).toBe(404);
    });
  });

  describe('#getSignedWritableAssetUrl', function () {
    const S3_URI =
      'https://s3.amazonaws.com/dev-api.veritone.com/5/media-mdp/2026/1/1/tdo/asset.json';
    const EXPECTED_KEY = '5/media-mdp/2026/1/1/tdo/asset.json';
    const EXPECTED_BUCKET = 'dev-api.veritone.com';
    const internalCtx = { _authInfo: { json: { internal: true } } };

    beforeEach(() => {
      mockGetWritableAssetUrlPromise.mockResolvedValue(
        'https://signed.example/put'
      );
      mockContext.dal.asset.getAsset.mockResolvedValue({
        id: 'asset-1',
        assetType: 'media-mdp',
        contentType: 'application/json',
        uri: S3_URI
      });
    });

    it('rejects non-internal tokens', async function () {
      await expect(
        util.getSignedWritableAssetUrl(
          mockContext,
          { _authInfo: {} },
          { assetId: 'asset-1' }
        )
      ).rejects.toThrow(/internal service token/);
      expect(mockContext.dal.asset.getAsset).not.toHaveBeenCalled();
    });

    it('rejects virtual (fake) asset ids', async function () {
      const fakeId = Buffer.from('VTA:5:media').toString('base64');
      await expect(
        util.getSignedWritableAssetUrl(mockContext, internalCtx, {
          assetId: fakeId
        })
      ).rejects.toThrow(/virtual asset/);
    });

    it('rejects asset types outside the allowlist', async function () {
      mockContext.dal.asset.getAsset.mockResolvedValue({
        id: 'asset-1',
        assetType: 'media',
        contentType: 'video/mp4',
        uri: S3_URI
      });
      await expect(
        util.getSignedWritableAssetUrl(mockContext, internalCtx, {
          assetId: 'asset-1'
        })
      ).rejects.toThrow(/not permitted for asset type/);
      expect(mockGetWritableAssetUrlPromise).not.toHaveBeenCalled();
    });

    it('rejects assets stored in unmanaged buckets', async function () {
      mockContext.dal.asset.getAsset.mockResolvedValue({
        id: 'asset-1',
        assetType: 'media-mdp',
        contentType: 'application/json',
        uri: 'https://s3.amazonaws.com/some-other-bucket/x/asset.json'
      });
      await expect(
        util.getSignedWritableAssetUrl(mockContext, internalCtx, {
          assetId: 'asset-1'
        })
      ).rejects.toThrow(/managed bucket/);
      expect(mockGetWritableAssetUrlPromise).not.toHaveBeenCalled();
    });

    it('signs server-derived bucket/key and pins content type + SSE', async function () {
      const res = await util.getSignedWritableAssetUrl(
        mockContext,
        internalCtx,
        { assetId: 'asset-1' }
      );
      expect(mockGetWritableAssetUrlPromise).toHaveBeenCalledWith(
        EXPECTED_KEY,
        EXPECTED_BUCKET,
        3600,
        { contentType: 'application/json', serverSideEncryption: 'AES256' }
      );
      expect(res).toMatchObject({
        url: 'https://signed.example/put',
        bucket: EXPECTED_BUCKET,
        key: EXPECTED_KEY,
        contentType: 'application/json',
        serverSideEncryption: 'AES256',
        expiresInSeconds: 3600
      });
    });

    it('clamps an over-max expiry down to the cap', async function () {
      await util.getSignedWritableAssetUrl(mockContext, internalCtx, {
        assetId: 'asset-1',
        expiresInSeconds: 99999
      });
      expect(mockGetWritableAssetUrlPromise).toHaveBeenCalledWith(
        EXPECTED_KEY,
        EXPECTED_BUCKET,
        3600,
        expect.anything()
      );
    });

    it('clamps a below-min expiry up to the floor', async function () {
      await util.getSignedWritableAssetUrl(mockContext, internalCtx, {
        assetId: 'asset-1',
        expiresInSeconds: 1
      });
      expect(mockGetWritableAssetUrlPromise).toHaveBeenCalledWith(
        EXPECTED_KEY,
        EXPECTED_BUCKET,
        60,
        expect.anything()
      );
    });

    // disabled: audit events are not emitted for internal API keys
    xit('emits an audit event on success', async function () {
      const before = eventCounter;
      await util.getSignedWritableAssetUrl(mockContext, internalCtx, {
        assetId: 'asset-1'
      });
      expect(eventCounter).toBe(before + 1);
    });
  });
  describe('#fillInClientInfo', function () {
    it('should get client info - engine JWT', async function () {
      const clientInfo = {
        taskId: '12345_abc1',
        type: 'engineJWT'
      };
      await util.fillInClientInfo(clientInfo);
      expect(clientInfo.engineName).toEqual('fake engine');
      expect(clientInfo.engineId).toEqual('fake_engine');
    });
    it('should get org for org API key', async function () {
      const clientInfo = {
        type: 'apiKey',
        id: 'api_key_1',
        org: 7682
      };
      await util.fillInClientInfo(clientInfo);
      expect(clientInfo.type).toEqual('apiKey');
      expect(clientInfo.id).toEqual('api_key_1');
      expect(clientInfo.org).toEqual(7682);
      expect(clientInfo.organizationName).toEqual('test');
    });
    it('should get org for org API key', async function () {
      const clientInfo = {
        type: 'apiKey',
        id: 'api_key_1',
        org: -1
      };
      await util.fillInClientInfo(clientInfo);
      expect(clientInfo.type).toEqual('apiKey');
      expect(clientInfo.id).toEqual('api_key_1');
      expect(clientInfo.org).toEqual(-1);
      expect(clientInfo.organizationName).toEqual('<not found>');
    });
    it('should work for internal key', async function () {
      const clientInfo = {
        type: 'apiKey',
        id: 'api_key_1',
        org: 'internal'
      };
      await util.fillInClientInfo(clientInfo);
      expect(clientInfo.organizationName).toEqual('internal');
    });
  });
  describe('#queryIncludesField()', function () {
    it('should return false when field is not included', function () {
      expect(
        util.queryIncludesField(sampleInfo, [
          'libraries',
          'records',
          'modifiedBy'
        ])
      ).not.toBeTruthy();
      expect(
        util.queryIncludesField(sampleInfo, [
          'libraries',
          'records',
          'summary',
          'nobody'
        ])
      ).not.toBeTruthy();
    });
    it('should return true when field is included', function () {
      expect(
        util.queryIncludesField(sampleInfo, ['libraries', 'records', 'id'])
      ).toBeTruthy();
      expect(
        util.queryIncludesField(sampleInfo, ['libraries', 'records', 'summary'])
      ).toBeTruthy();
      expect(
        util.queryIncludesField(sampleInfo, [
          'libraries',
          'records',
          'summary',
          'jsondata'
        ])
      ).toBeTruthy();
    });
  });

  describe('#isCSAdmin()', function () {
    it('should return false for empty user', function () {
      expect(util.isCSAdmin({})).toBeFalsy();
      expect(util.isCSAdmin(null)).toBeFalsy();
    });
    it('should return false for user without perms', function () {
      expect(util.isCSAdmin({})).toBeFalsy();
      expect(util.isCSAdmin(null)).toBeFalsy();
    });
    it('should return true for CS user', function () {
      const user = {
        permissionMasks: [-8184, 255, 0, 1610612736]
      };
      expect(util.isCSAdmin(user)).toBeTruthy();
    });
    it('should return false for non-CS user', function () {
      const user = {
        permissionMasks: [-2, 268435455, 1073742335, 8335347]
      };
      expect(util.isCSAdmin(user)).toBeFalsy();
    });
    it('should call getTokenType', function () {
      expect(
        util.getTokenType({
          _authInfo: { tokenId: 'foo', applicationId: 'bar' }
        })
      ).toEqual('apikey');
      expect(
        util.getTokenType({
          jwtToken: {
            sub: 'engine-run'
          },
          _authInfo: {
            applicationId: 'foo',
            json: {
              tokenLabel: 'auth2 generated',
              rights: []
            }
          }
        })
      ).toEqual('engineJWT');
      expect(
        util.getTokenType({
          _authInfo: {
            tokenId: 'foo',
            json: {
              internal: true
            }
          }
        })
      ).toEqual('internal');
      expect(util.getTokenType({})).toEqual('user');
      expect(util.getTokenType({ _authInfo: {} })).toEqual('user');
    });
  });

  describe('getSignedWritableUrl', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should return the multipart upload object when everything works correctly with azure_blob enabled', async () => {
      mockGetSignedUrlPromise.mockResolvedValue(
        `https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20221010%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221010T041135Z&X-Amz-Expires=86400&X-Amz-Signature=bda8a6bb99170db3a5c90532e83cfe2637bf468e3678a466ffcc5c9619ea8983&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22test-file-name.test%22`
      );
      const result = await util.getSignedWritableUrl(mockContext, {}, {});
      expect(result.unsignedUrl).toEqual(
        'http://my_local_path/5%2Fasset%2F2025%2F0%2F4%2Fmypath%2Fasset-19-31-284_92898e5b-d43f-40c1-88cd-86734b630b2f'
      );
      expect(result.multipartUpload).toBeDefined();
      expect(result.multipartUpload.baseUri).toEqual(
        'http://my_local_path/5%2Fasset%2F2025%2F0%2F4%2Fmypath%2Fasset-19-31-284_92898e5b-d43f-40c1-88cd-86734b630b2f'
      );
      expect(result.multipartUpload.uploadToken).toEqual(
        'sv=2019-02-02&se=2025-01-03T01%3A42%3A31Z&sr=b&sp=rcwd&sig=F8zLJLg8IZ8vdc5oIQb%2FjISEG0jcitqp%2BThameZv%2FgE%3D'
      );
      expect(result.bucket).toEqual('test_bucket');
    });

    it('should not return the multipart upload object when everything works correctly with azure_blob disabled', async () => {
      mockGetSignedUrlPromise.mockResolvedValue(
        `https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20221010%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221010T041135Z&X-Amz-Expires=86400&X-Amz-Signature=bda8a6bb99170db3a5c90532e83cfe2637bf468e3678a466ffcc5c9619ea8983&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22test-file-name.test%22`
      );
      mockContext.config.azure_blob.enabled = false;
      const result = await util.getSignedWritableUrl(mockContext, {}, {});
      expect(result.unsignedUrl).toEqual(
        'http://my_local_path/5%2Fasset%2F2025%2F0%2F4%2Fmypath%2Fasset-19-31-284_92898e5b-d43f-40c1-88cd-86734b630b2f'
      );
      expect(result.multipartUpload).toBeUndefined();
      expect(result.bucket).toEqual('test_bucket');
    });

    // VE-26276: unsignedUrl must keep the SDK's percent-encoded pathname.
    // A decoded key cannot ride in a URL — a raw "#" truncates the key into
    // the fragment on every downstream new URL() parse (getOCIBucketAndKey,
    // uriParser), and raw spaces get re-encoded and then double-encoded on
    // the wire. Key extraction decodes once at its own boundary instead.
    describe('special-character keys on the direct provider branch (VE-26276)', () => {
      // encoded form of ".../tom-holland [124] # (parens-test)-....mov"
      const ENCODED_PATH =
        '/test_bucket/1/other/2026/7/1/_/tom-holland%20%5B124%5D%20%23%20%28parens-test%29-20-20-98_9249e3cc.mov';
      const ENCODED_UNSIGNED_URL =
        `https://testns.compat.objectstorage.us-ashburn-1.oraclecloud.com${ENCODED_PATH}`;
      const ENCODED_PUT_URL =
        `${ENCODED_UNSIGNED_URL}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123`;

      let ociUtil;
      let ociContext;
      let mockWritable;
      let mockGetSigned;

      beforeEach(() => {
        ociContext = _.cloneDeep(mockContext);
        ociContext.config.azure_blob.enabled = false;
        ociContext.config.oci = { enabled: true };
        mockWritable = jest.fn().mockResolvedValue(ENCODED_PUT_URL);
        mockGetSigned = jest
          .fn()
          .mockResolvedValue(`${ENCODED_PUT_URL}&X-Amz-Get=1`);
        ociContext.s3Buckets.api.storage = {
          getSignedWritableUrlPromise: mockWritable,
          getSignedUrlPromise: mockGetSigned
        };
        ociUtil = require('./util.js')(ociContext);
      });

      it('keeps the encoded key in unsignedUrl and signs the GET from it', async () => {
        const result = await ociUtil.getSignedWritableUrl(ociContext, {}, {});

        expect(result.url).toEqual(ENCODED_PUT_URL);
        expect(result.unsignedUrl).toEqual(ENCODED_UNSIGNED_URL);
        // the raw form would truncate at "#" on the next URL parse
        expect(result.unsignedUrl).not.toContain('#');
        expect(result.unsignedUrl).not.toContain(' ');
        expect(mockGetSigned).toHaveBeenCalledWith(
          ENCODED_UNSIGNED_URL,
          expect.any(Number),
          null
        );
      });

      it('round-trips the key losslessly through a downstream URL parse', async () => {
        const result = await ociUtil.getSignedWritableUrl(ociContext, {}, {});

        // what getOCIBucketAndKey / uriParser will see
        const parsed = new URL(result.unsignedUrl);
        expect(decodeURIComponent(parsed.pathname)).toEqual(
          '/test_bucket/1/other/2026/7/1/_/tom-holland [124] # (parens-test)-20-20-98_9249e3cc.mov'
        );
      });
    });
  });

  // VE-26306: `key`, `type` and `path` are accepted (for compatibility, with a
  // deprecation warning emitted by the @deprecated directive) but must never
  // reach the storage key.
  describe('getSignedWritableUrl — deprecated storage-key arguments (VE-26306)', () => {
    let spyDal;

    beforeEach(() => {
      spyDal = jest.fn().mockResolvedValue({
        signedWritableUrl: 'http://my_local_path/generated?X-Amz-Signature=abc',
        rawSignedWritableUrl: 'http://my_local_path/generated?X-Amz-Signature=abc'
      });
      mockContext.dal.dalStorage.getSignedWritableUrl = spyDal;
      // the signed GET is derived from the unsigned PUT URL; without it
      // isRealSignedUrl(res.getUrl) fails and the retry path throws 2087
      mockGetSignedUrlPromise.mockResolvedValue(
        'http://my_local_path/generated?X-Amz-Signature=def'
      );
    });

    function pathPassedToStorage() {
      expect(spyDal).toHaveBeenCalled();
      return spyDal.mock.calls[0][0];
    }

    // The full server-generated shape: {orgId}/{type}/{y}/{m}/{d}/{generated}.
    const GENERATED_NAME = /[0-9a-f-]{36}_\d+-\d+-\d+/.source;
    const GENERATED_KEY_SHAPE = new RegExp(
      `^5/other/\\d{4}/\\d{1,2}/\\d{1,2}/${GENERATED_NAME}$`
    );

    it('discards key, type and path', async () => {
      await util.getSignedWritableUrl(mockContext, {}, {
        organizationId: '5',
        key: 'reports/2026/Q3 Summary.pdf',
        type: 'PrE#view',
        path: '../../evil'
      });

      const storagePath = pathPassedToStorage();
      expect(storagePath).toMatch(GENERATED_KEY_SHAPE);
      for (const sent of ['reports', 'PrE', 'view', 'evil', '..', '#', 'Summary']) {
        expect(storagePath).not.toContain(sent);
      }
    });

    it('dates the key by real calendar month and day', async () => {
      const now = moment('2026-08-15T14:23:45.678');
      await util.getSignedWritableUrl(
        mockContext,
        { _signedUrlNow: now },
        { organizationId: '5' }
      );

      const dateSegments = pathPassedToStorage().split('/').slice(2, 5);
      expect(dateSegments).toEqual(['2026', '8', '15']);
    });

    it('produces a structurally identical key whether or not type and path are supplied', async () => {
      const args = { organizationId: '5' };
      await util.getSignedWritableUrl(mockContext, {}, args);
      const without = pathPassedToStorage();

      spyDal.mockClear();
      await util.getSignedWritableUrl(mockContext, {}, {
        ...args,
        key: 'ignored.txt',
        type: 'preview',
        path: 'container-42'
      });
      const with_ = pathPassedToStorage();

      const shape = (p) => p.replace(/[0-9a-f-]{36}_\d+-\d+-\d+$/, '<generated>');
      // AC #1: supplied or omitted, the key is the same shape either way
      expect(shape(with_)).toEqual(shape(without));

      // six segments exactly: the client-supplied `type` became a literal and
      // the client-supplied container segment is gone, not placeheld
      const segments = with_.split('/');
      expect(segments).toHaveLength(6);
      expect(segments[0]).toEqual('5'); // organizationId — still honored
      expect(segments[1]).toEqual('other'); // was args.type
      expect(segments[5]).toMatch(new RegExp(`^${GENERATED_NAME}$`)); // generated
    });

    it('discards key, type and path on the plural getSignedWritableUrls', async () => {
      const res = await util.getSignedWritableUrls(mockContext, {}, {
        number: 2,
        organizationId: '5',
        key: 'ignored.txt',
        type: 'preview',
        path: 'tdo#123'
      });

      expect(res).toHaveLength(2);
      const keys = spyDal.mock.calls.map((c) => c[0]);
      expect(keys).toHaveLength(2);
      for (const k of keys) {
        expect(k).toMatch(GENERATED_KEY_SHAPE);
        expect(k).not.toContain('ignored.txt');
        expect(k).not.toContain('preview');
        expect(k).not.toContain('tdo');
        expect(k).not.toContain('#');
      }
      // each URL in a bulk request must still get its own object
      expect(keys[0]).not.toEqual(keys[1]);
    });
  });

  // VE-26306: this function no longer accepts a caller-supplied key — it only
  // generates one. The three cases that used to assert the folded-in-basename
  // behavior were removed with that branch; discarding the caller's key is
  // asserted at the resolver boundary instead (see the describe above).
  describe('#getSignedWritableUrlKey()', function () {
    it('generates a <uuid>_<hour>-<second>-<ms> key from the given timestamp', function () {
      const ts = moment('2026-08-20T16:03:00.101Z').utc();
      const res = util.getSignedWritableUrlKey(ts);

      // VE-26306: the uuid leads so a bulk batch, which shares one timestamp,
      // diverges at the first character of the name rather than the ninth.
      const [id, stamp] = res.split('_');
      expect(validator.isUUID(id)).toBeTruthy();
      expect(stamp).toEqual(
        `${ts.hour()}-${ts.second()}-${ts.milliseconds()}`
      );
    });

    it('falls back to the current time when no timestamp is given', function () {
      const res = util.getSignedWritableUrlKey();
      const [id, stamp] = res.split('_');

      expect(validator.isUUID(id)).toBeTruthy();
      expect(stamp).toMatch(/^\d{1,2}-\d{1,2}-\d{1,3}$/);
    });

    it('generates a distinct key on every call', function () {
      const ts = moment('2026-08-20T16:03:00.101Z').utc();
      const keys = new Set(
        Array.from({ length: 2 }, () => util.getSignedWritableUrlKey(ts))
      );
      expect(keys.size).toEqual(2);
    });
  });

  describe('#getSignedUrl()', function () {
    const EXPORT_HOST =
      'https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export';

    it('should return original url if not veriton bucket', () => {
      const url = 'https://s3.amazon.com/prod-api.abc.com/2099';
      const signedUrl = util.getSignedUrl(url);
      expect(signedUrl).toEqual(signedUrl);
    });
    it('Get signed URL with a file name', async () => {
      const fileName = `test-file-name.test`;
      mockGetSignedUrlPromise.mockResolvedValue(
        `https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20221010%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221010T041135Z&X-Amz-Expires=86400&X-Amz-Signature=bda8a6bb99170db3a5c90532e83cfe2637bf468e3678a466ffcc5c9619ea8983&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22test-file-name.test%22`
      );
      const url =
        'https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0';
      const signedUrl = await util.getSignedUrl(url, null, fileName);
      expect(signedUrl).toContain(fileName);
    });

    it('Get signed URL with special chars in the file name', async () => {
      const fileName = `test-file-name’s.zip`;
      mockGetSignedUrlPromise.mockResolvedValue(
        `https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20221010%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221010T042446Z&X-Amz-Expires=10800&X-Amz-Signature=86d2f601c428a962987d53b38c8e9d7437b3f2d1f5713af048190b7505810a37&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B%20filename%3D%22test-file-name%25E2%2580%2599s.zip%22`
      );
      const url =
        'https://s3.amazonaws.com/dev-api.veritone.com/3af15d58/export/2022/9/5/_/cms-download-2022-10-07T07%3A06%3A33-7-34-20_5fe0ead8-652f-409b-98ab-e6c7ffb4ccb8.965Z-baad92f1-d0b6-42ab-9708-8a80e2b9c4c0';
      const signedUrl = await util.getSignedUrl(url, null, fileName);
      expect(signedUrl).toContain('test-file-name%25E2%2580%2599s.zip');
    });

    it('does not splice the hostname dot when the key has no extension (VE-26306)', async () => {
      const url = `${EXPORT_HOST}/16-3-101_2f1c4e8a`;
      mockGetSignedUrlPromise.mockResolvedValue(`${url}?X-Amz-Signature=abc`);

      await util.getSignedUrl(url, null, 'MyExport');

      const fileName = mockGetSignedUrlPromise.mock.calls[0][2];
      expect(fileName).toEqual('MyExport');
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('.com');
    });

    it('still borrows a real extension from the last path segment (VE-26306)', async () => {
      const url = `${EXPORT_HOST}/16-3-101_2f1c4e8a.zip`;
      mockGetSignedUrlPromise.mockResolvedValue(`${url}?X-Amz-Signature=abc`);

      await util.getSignedUrl(url, null, 'MyExport');

      expect(mockGetSignedUrlPromise.mock.calls[0][2]).toEqual('MyExport.zip');
    });

    it('delegates fallback-bucket URIs to the presigner', async () => {
      // stage-api.veritone.com is a fallback bucket → not in s3Buckets and has
      // no storage shim, so it must be signed via the bucket-aware presigner.
      const url =
        'https://s3.amazonaws.com/stage-api.veritone.com/7682/asset/foo.jpeg';
      mockGetBucketConfig.mockReturnValue({ signedUrlExpires: 86400 });
      mockPresignUrl.mockResolvedValue(`${url}?X-Amz-Signature=abc`);

      const signedUrl = await util.getSignedUrl(url);

      expect(mockGetBucketConfig).toHaveBeenCalledWith('stage-api.veritone.com');
      expect(mockPresignUrl).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ ttl: 86400 })
      );
      expect(mockPresignUrl.mock.calls[0][1].fileName).toBeUndefined();
      expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
      expect(signedUrl).toBe(`${url}?X-Amz-Signature=abc`);
    });

    it('passes the download filename to the presigner for fallback-bucket URIs (VE-27981)', async () => {
      // The raw filename is forwarded un-normalized — the presigner owns the
      // encodeURI/extension-backfill normalization and the disposition format.
      const url =
        'https://s3.amazonaws.com/stage-api.veritone.com/7682/asset/foo.jpeg';
      mockGetBucketConfig.mockReturnValue({ signedUrlExpires: 86400 });
      mockPresignUrl.mockResolvedValue(`${url}?X-Amz-Signature=abc`);

      await util.getSignedUrl(url, null, 'my report.pdf');

      expect(mockPresignUrl).toHaveBeenCalledWith(url, {
        ttl: 86400,
        fileName: 'my report.pdf'
      });
      expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
    });

    it('returns a reverted-OCI URI unsigned instead of throwing 2088 (VE-25065)', async () => {
      // Pure-AWS env (minio/azure/oci all off) — the config where master throws
      // InternalServerError 2088. With isOci gated on oci.enabled (absent here),
      // the OCI URI is not an owned bucket, so getSignedUrlExp returns it
      // unsigned at its early guard, never reaching the signer.
      const ctx = {
        ...mockContext,
        config: {
          ...mockContext.config,
          azure_blob: { ...mockContext.config.azure_blob, enabled: false }
        }
      };
      const pureAwsUtil = require('./util.js')(ctx);
      const ociUrl =
        'https://ns.compat.objectstorage.us-ashburn-1.oraclecloud.com/dev-api.veritone.com/7682/asset/foo.jpeg';

      const result = await pureAwsUtil.getSignedUrl(ociUrl);

      expect(result).toBe(ociUrl);
      expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
    });

    describe('legacy-container fallthrough (VE-26806)', () => {
      // Gov-2 stage regression shape: a container known only via the top-level
      // s3.bucket (never listed in s3.buckets[]) misses both the s3Buckets
      // shim map and the presigner map. It must fall through to the default
      // api shim — not be returned unsigned.
      const recordingAzureUri =
        'https://vtstorcorestage.blob.core.usgovcloudapi.net/recording/media%2F123%2Fabc.json';

      function makeCtx(overrides) {
        const ctx = _.cloneDeep(mockContext);
        _.set(ctx, 'config.s3.bucket', 'recording');
        for (const [objPath, value] of Object.entries(overrides || {})) {
          _.set(ctx, objPath, value);
        }
        return ctx;
      }

      it('signs an azure legacy container via the api shim and warns on the config gap', async () => {
        const ctx = makeCtx({
          // Explicit: an earlier getSignedWritableUrl test flips the shared
          // mockContext's azure_blob.enabled to false and never restores it.
          'config.azure_blob.enabled': true,
          'config.azure_blob.endpointSuffix': 'core.usgovcloudapi.net'
        });
        const signingUtil = require('./util.js')(ctx);
        mockGetSignedUrlPromise.mockResolvedValue(
          `${recordingAzureUri}?sv=2019-02-02&sig=abc`
        );

        const result = await signingUtil.getSignedUrl(recordingAzureUri);

        expect(mockGetBucketConfig).toHaveBeenCalledWith('recording');
        expect(mockPresignUrl).not.toHaveBeenCalled();
        expect(mockGetSignedUrlPromise).toHaveBeenCalledWith(
          recordingAzureUri,
          3600,
          undefined
        );
        expect(result).toBe(`${recordingAzureUri}?sv=2019-02-02&sig=abc`);
        // The config gap must be visible, and the log names only the
        // configKey — never the URI or signature material (VE-26276).
        const warnings = ctx.logger.warn.mock.calls.map((c) => c[0]);
        expect(warnings).toEqual([expect.stringContaining('"recording"')]);
        expect(warnings[0]).not.toContain('usgovcloudapi');
        expect(warnings[0]).not.toContain('sig=');
      });

      it('warns only once per bucket on repeated signing calls', async () => {
        // Review-gate finding: on legacy-container deployments the fallthrough
        // is the steady-state path — the config-gap log must not flood.
        const ctx = makeCtx({
          'config.azure_blob.enabled': true,
          'config.azure_blob.endpointSuffix': 'core.usgovcloudapi.net'
        });
        const signingUtil = require('./util.js')(ctx);
        mockGetSignedUrlPromise.mockResolvedValue(
          `${recordingAzureUri}?sv=2019-02-02&sig=abc`
        );

        await signingUtil.getSignedUrl(recordingAzureUri);
        await signingUtil.getSignedUrl(recordingAzureUri);

        const gapWarns = ctx.logger.warn.mock.calls.filter((call) =>
          String(call[0]).includes('"recording"')
        );
        expect(gapWarns).toHaveLength(1);
        // Repeats stay visible at debug level.
        const gapDebugs = ctx.logger.debug.mock.calls.filter((call) =>
          String(call[0]).includes('"recording"')
        );
        expect(gapDebugs).toHaveLength(1);
      });

      it('signs an aws legacy bucket via the api shim (path-style URI)', async () => {
        const ctx = makeCtx({ 'config.azure_blob.enabled': false });
        const signingUtil = require('./util.js')(ctx);
        const awsUri = 'https://s3.amazonaws.com/recording/media/123.json';
        mockGetSignedUrlPromise.mockResolvedValue(`${awsUri}?X-Amz-Signature=a`);

        const result = await signingUtil.getSignedUrl(awsUri);

        expect(mockPresignUrl).not.toHaveBeenCalled();
        expect(mockGetSignedUrlPromise).toHaveBeenCalledWith(
          awsUri,
          3600,
          undefined
        );
        expect(result).toBe(`${awsUri}?X-Amz-Signature=a`);
      });

      it('signs a minio legacy bucket via the api shim', async () => {
        const ctx = makeCtx({
          'config.azure_blob.enabled': false,
          // storage.shim validates the full minio block at factory time
          'config.minio': {
            enabled: true,
            endPoint: 'minio.local',
            port: 9000,
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            secure: false
          }
        });
        const signingUtil = require('./util.js')(ctx);
        const minioUri = 'http://minio.local:9000/recording/media/123.bin';
        mockGetSignedUrlPromise.mockResolvedValue(
          `${minioUri}?X-Amz-Signature=m`
        );

        const result = await signingUtil.getSignedUrl(minioUri);

        expect(mockPresignUrl).not.toHaveBeenCalled();
        expect(result).toBe(`${minioUri}?X-Amz-Signature=m`);
      });

      it('returns the uri unchanged and warns when neither the presigner nor any shim knows the bucket', async () => {
        const ctx = makeCtx({
          'config.azure_blob.enabled': true,
          'config.azure_blob.endpointSuffix': 'core.usgovcloudapi.net',
          s3Buckets: {}
        });
        const signingUtil = require('./util.js')(ctx);

        const result = await signingUtil.getSignedUrl(recordingAzureUri);

        expect(result).toBe(recordingAzureUri);
        expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
        expect(ctx.logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('not resolvable')
        );
      });
    });
  });

  describe('#getSignedUrlOrVirtual()', function () {
    const ourUrl =
      'https://s3.amazonaws.com/dev-api.veritone.com/7682/asset/foo.jpeg';

    it('signs in place when the virtualAsset flag is off', async () => {
      mockGetSignedUrlPromise.mockResolvedValue(`${ourUrl}?X-Amz-Signature=sig`);
      // Default `util` instance has no featureFlags.virtualAssetEnabled.
      const result = await util.getSignedUrlOrVirtual(ourUrl);
      expect(result).toBe(`${ourUrl}?X-Amz-Signature=sig`);
      expect(mockMintStateless).not.toHaveBeenCalled();
    });

    it('mints a stateless virtual URI when the flag is on', async () => {
      mockMintStateless.mockReturnValue(
        'https://api.aws-dev.veritone.com/v3/asset-static/tok'
      );
      const enabledUtil = require('./util.js')({
        ...mockContext,
        config: {
          ...mockContext.config,
          featureFlags: { virtualAssetEnabled: true }
        }
      });

      const result = await enabledUtil.getSignedUrlOrVirtual(ourUrl);

      expect(mockMintStateless).toHaveBeenCalledWith(ourUrl, null, {});
      expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
      expect(result).toBe('https://api.aws-dev.veritone.com/v3/asset-static/tok');
    });

    it('does not mint external/non-bucket URIs even when the flag is on', async () => {
      const externalUrl = 'https://cdn.example.com/logo.png';
      const enabledUtil = require('./util.js')({
        ...mockContext,
        config: {
          ...mockContext.config,
          featureFlags: { virtualAssetEnabled: true }
        }
      });

      const result = await enabledUtil.getSignedUrlOrVirtual(externalUrl);

      expect(mockMintStateless).not.toHaveBeenCalled();
      // Non-bucket URL passes through getSignedUrl unchanged.
      expect(result).toBe(externalUrl);
    });

    it('falls back to getSignedUrl and logs a warning when the minter throws', async () => {
      // Re-arm the module-level `@veritone/core-server-base/virtualAsset` factory mock:
      // `jest.resetAllMocks()` (top-level beforeEach) tears down its `() => ({...})`
      // implementation once a prior test in this suite has required it, so it must be
      // re-established here rather than relying on the jest.mock() factory still holding.
      require('@veritone/core-server-base/virtualAsset').mockImplementation(() => ({
        mintStatelessVirtualAssetUri: mockMintStateless
      }));
      mockMintStateless.mockImplementation(() => {
        throw new Error('kms unavailable');
      });
      mockGetSignedUrlPromise.mockResolvedValue(`${ourUrl}?X-Amz-Signature=sig`);
      const enabledUtil = require('./util.js')({
        ...mockContext,
        config: {
          ...mockContext.config,
          featureFlags: { virtualAssetEnabled: true }
        }
      });

      const result = await enabledUtil.getSignedUrlOrVirtual(ourUrl);

      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to mint stateless virtual asset URI; signing in place: kms unavailable'
        )
      );
      expect(result).toBe(`${ourUrl}?X-Amz-Signature=sig`);
    });
  });

  describe('getUploadStatus', () => {
    const mockArgs = {
      input: {
        key: 'test_key'
      }
    };

    it('should throw an error if args.input or args.input.key is missing', async () => {
      const invalidArgsList = [{}, { input: null }, { input: {} }];

      for (const invalidArgs of invalidArgsList) {
        await expect(
          util.getUploadStatus(mockContext, {}, invalidArgs)
        ).rejects.toThrowError(
          new errors.InvalidInput({ message: 'missing object "key"' })
        );
      }
    });

    it('should call dalStorage.getBlobUploadStatus with the correct arguments', async () => {
      mockContext.dal.dalStorage.getBlobUploadStatus.mockResolvedValueOnce({
        status: 'success',
        totalBytesReceived: 1024,
        missingChunkNumbers: [],
        failures: []
      });

      const result = await util.getUploadStatus(mockContext, null, mockArgs);

      expect(
        mockContext.dal.dalStorage.getBlobUploadStatus
      ).toHaveBeenCalledWith('test_key');
      expect(result).toEqual({
        status: 'success',
        totalBytesReceived: 1024,
        missingChunkNumbers: [],
        failures: []
      });
    });

    it('should handle errors gracefully and return a default error response', async () => {
      mockContext.dal.dalStorage.getBlobUploadStatus.mockRejectedValueOnce(
        new Error('test error')
      );

      const result = await util.getUploadStatus(mockContext, null, mockArgs);

      expect(result).toEqual({
        status: 'error',
        message: 'Failed to retrieve upload status.',
        totalBytesReceived: 0,
        missingChunkNumbers: [],
        failures: []
      });
    });
  });

  describe('#download', function () {
    // these tests use nock to intercept and mock out http calls
    it('should pass on small download - http', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 10 // limit is 100
      };
      nock('http://localhost:3000')
        .get('/test/2')
        .reply(200, '1111111111111111111');
      await util.download('http://localhost:3000/test/2', mockContext);
    });
    it('should pass on small download - https', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 10 // limit is 100
      };
      nock('https://localhost:3000')
        .get('/test/9')
        .reply(200, '1111111111111111111');
      await util.download('https://localhost:3000/test/9', mockContext);
    });

    it('should fail on over-large response', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 99 // limit is 100
      };
      // the individual download is not too big, but the overall response is
      nock('http://localhost:3000')
        .get('/test/1')
        .reply(200, '1111111111111111111');
      try {
        await util.download('http://localhost:3000/test/1', mockContext);
        throw new Error('did not throw!');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should fail on over-large response based on header', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 90 // limit is 100
      };
      // the individual download is not too big, but the overall response is
      nock('http://localhost:3000')
        .get('/test/1')
        .reply(200, '1', { 'Content-Length': 100 });
      try {
        await util.download('http://localhost:3000/test/1', mockContext);
        throw new Error('did not throw!');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should fail on over-large download', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 10 // limit is 100
      };
      // the response size so far is small, but this download is too big
      nock('http://localhost:3000').get('/test/4').reply(200, _.pad(' ', 100));
      try {
        await util.download('http://localhost:3000/test/4', mockContext);
        throw new Error('did not throw!');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should set response headers', async function () {
      // the response size so far is small, but this download is too big
      mockContext.requestInfo = {
        responseTotalSize: 0 // limit is 100
      };

      const val = _.pad(' ', 5);
      nock('http://localhost:3000').get('/test/5').reply(200, val, {
        'Content-Length': 100,
        'Content-Type': 'text/plain'
      });
      const headers = {};
      const content = await util.download(
        'http://localhost:3000/test/5',
        mockContext,
        headers
      );

      expect(headers['content-length']).toEqual('100');
      expect(headers['content-type']).toEqual('text/plain');
      expect(content).toEqual(val);
    });
    it('should fail on over-large download based on header', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 10 // limit is 100
      };
      // the response size so far is small, but this download is too big
      nock('http://localhost:3000')
        .get('/test/5')
        .reply(200, _.pad(' ', 10), { 'Content-Length': 100 });
      try {
        await util.download('http://localhost:3000/test/5', mockContext);
        throw new Error('did not throw!');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should handle HTTP error', async function () {
      mockContext.requestInfo = {
        responseTotalSize: 10 // limit is 100
      };
      nock('http://localhost:3000').get('/test/3').reply(404);
      try {
        await util.download('http://localhost:3000/test/3', mockContext);
        throw new Error('did not throw!');
      } catch (err) {
        if (err.name !== 'resource_unavailable')
          expect(err.name).toEqual('resource_unavailable');
      }
    });
    it('should retry on 429 error', async function () {
      eventCounter = 0;
      metricsCounter = 0;
      nock('http://test.aws-dev.veritone.com/v3').get('/test/16').reply(429);
      nock('http://test.aws-dev.veritone.com/v3')
        .get('/test/16')
        .reply(200, '{"test":"content"}');

      // should succeed
      try {
        await util.download(
          'http://test.aws-dev.veritone.com/v3/test/16',
          mockContext
        );
      } catch (err) {
        throw err;
      }
      expect(metricsCounter).toEqual(3); // error + retry + success
      expect(eventCounter).toEqual(2); // error + success
    });
  });

  describe('#authorizeOrgIds', function () {
    it('should result empty organizationIds, in case org-less token and organizationIds is null/undefined', function () {
      let err;
      const authInfo = { token: 'foo' };
      const params = {};

      try {
        util.authorizeOrgIds(authInfo, params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(params.organizationIds).toBeDefined();
      expect(params.organizationIds.length).toEqual(0);
    });

    it('should keep organizationIds, in case org-less token and request param organizationIds is exists', function () {
      let err;
      const authInfo = { token: 'foo' };
      const params = { organizationIds: [7682, 1234] };

      try {
        util.authorizeOrgIds(authInfo, params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(params.organizationIds).toBeDefined();
      expect(params.organizationIds.length).toEqual(2);
    });

    it('should authorize request organizationIds, throw error not_found if incoming Ids not found in user org', function () {
      let err;
      const authInfo = {
        token: 'foo',
        organization: { organizationId: 14634 },
        authorizedOrganizationIds: [14634]
      };
      const params = { organizationIds: ['7682'] };

      try {
        util.authorizeOrgIds(authInfo, params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('authorization_error');
    });

    it('should add organizationIds/Id, for user/api Token without orgIds/orgId from request', function () {
      let err;
      const authInfo = {
        token: 'foo',
        organization: { organizationId: 7682 },
        authorizedOrganizationIds: [7682]
      };
      const params = {};

      try {
        util.authorizeOrgIds(authInfo, params);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(params.organizationIds).toBeDefined();
      expect(params.organizationIds[0]).toEqual(7682);
      expect(params.organizationId).toEqual(7682);
    });

    it('should authorize request organization with JWT had invalid organizationId in type string or null/undefined', function () {
      let err;
      try {
        util.authorizeOrgIds(
          {
            token: 'foo',
            organization: { organizationId: '14634' },
            authorizedOrganizationIds: ['14634', null, undefined, 'not number']
          },
          { organizationIds: [14634] }
        );
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#stripOwnedStorageUrlSignature', function () {
    it('should strip owned storage urls of signature', function () {
      expect(
        util.stripOwnedStorageUrlSignature(
          'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png?signedParams=abc'
        )
      ).toEqual(
        'https://s3.amazonaws.com/dev-api.veritone.com/7682/other/icon.png'
      );
    });
    it('should not strip unowned storage urls of signature', function () {
      expect(
        util.stripOwnedStorageUrlSignature(
          '/this/is/path/to/img.jpg?signedParams=abc'
        )
      ).toEqual('/this/is/path/to/img.jpg?signedParams=abc');
    });
  });

  describe('#generateVirtualTreeObjectId', function () {
    it('should return null with invalid inputs', () => {
      const signedUrl = util.generateVirtualTreeObjectId();
      expect(signedUrl).toEqual(null);
    });
    it('should return virtual tree object id', async () => {
      const orgId = 1;
      const objId = 'obj-id-1';
      const virtualId = util.generateVirtualTreeObjectId(orgId, objId);
      expect(virtualId).toEqual(`vtreeobject-${orgId}-watchlist-${objId}`);
    });
  });

  describe('#parseVirtualTreeObjectId', function () {
    it('should return empty parser with invalid inputs', () => {
      const virtualId = util.generateVirtualTreeObjectId();
      const parsed = util.parseVirtualTreeObjectId(virtualId);
      expect(_.isEmpty(parsed)).toEqual(true);
    });
    it('should parse a virtual tree object id', async () => {
      const orgId = 1;
      const objId = 'obj-id-1';
      const virtualId = util.generateVirtualTreeObjectId(orgId, objId);
      const parsed = util.parseVirtualTreeObjectId(virtualId);
      expect(parsed).toEqual({
        orgId: 1,
        objectId: objId,
        objectType: 'watchlist'
      });
    });
  });

  describe('#isSuperAdmin', function () {
    it('should return true for user tokens that have the superadmin permission', function () {
      const authInfo = {
        token: 'foo',
        permissionMasks: [-1]
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeTruthy();
    });
    it('should return true for user tokens that have the superadmin right', function () {
      const authInfo = {
        token: 'foo',
        json: {
          rights: ['superadmin']
        }
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeTruthy();
    });
    it('should return true for user tokens that have both the superadmin right and permission', function () {
      const authInfo = {
        token: 'foo',
        permissionMasks: [-1],
        json: {
          rights: ['superadmin']
        }
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeTruthy();
    });
    it('should return false for user tokens that have neither the superadmin right or permission', function () {
      const authInfo = {
        token: 'foo'
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeFalsy();
    });
    it('should return true for internal tokens that have the superadmin right', function () {
      const authInfo = {
        tokenId: 'foo',
        json: {
          internal: true,
          rights: ['superadmin']
        }
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeTruthy();
    });
    it('should return false for internal tokens that have the superadmin permission but not the right', function () {
      const authInfo = {
        tokenId: 'foo',
        permissionMasks: [-1],
        json: {
          internal: true
        }
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeFalsy();
    });
    it('should return true for api tokens that have the superadmin right', function () {
      const authInfo = {
        tokenId: 'foo',
        applicationId: 'bar',
        json: {
          rights: ['superadmin']
        }
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeTruthy();
    });
    it('should return false for api tokens that have the superadmin permission but not the right', function () {
      const authInfo = {
        tokenId: 'foo',
        applicationId: 'bar',
        permissionMasks: [-1]
      };

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeFalsy();
    });
    it('should return false for empty tokens', function () {
      const authInfo = {};

      const res = util.isSuperAdmin(authInfo);
      expect(res).toBeFalsy();
    });
  });

  describe('#getOrgIdFromClientInfo', function () {
    it('should return clientInfo.org if clientInfo.org is a number', async function () {
      const clientInfo = {
        org: 2
      };
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(2);
    });
    it('should return rootOrgId if clientInfo.org is neither a number nor a string', async function () {
      const clientInfo = {
        org: ''
      };
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(1);
    });
    it('should return rootOrgId if clientInfo is undefined', async function () {
      const orgId = await util.getOrgIdFromClientInfo();
      expect(orgId).toEqual(1);
    });
    it('should return rootOrgId if clientInfo.org is internal', async function () {
      const clientInfo = {
        org: 'internal'
      };
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(1);
    });
    it('should parse clientInfo.org before returning if clientInfo.org is a number string', async function () {
      const clientInfo = {
        org: '2'
      };
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(2);
    });
    it('should return orgId via getOrgIdFromAppId if clientInfo.org is a UUID', async function () {
      const appId = uuid.v4();
      const clientInfo = {
        org: appId
      };
      mockGetOrgIdFromAppIdFn.mockImplementationOnce((appId) => {
        expect(appId).toEqual(appId);
        return Promise.resolve('2');
      });
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(2);
      expect(mockGetOrgIdFromAppIdFn).toHaveBeenCalled();
    });
    it('should return rootOrgId if getOrgIdFromAppId throws a not_found error', async function () {
      const appId = uuid.v4();
      const clientInfo = {
        org: appId
      };
      mockGetOrgIdFromAppIdFn.mockImplementationOnce((appId) => {
        expect(appId).toEqual(appId);
        return Promise.reject(new Error());
      });
      const orgId = await util.getOrgIdFromClientInfo(clientInfo);
      expect(orgId).toEqual(1);
      expect(mockGetOrgIdFromAppIdFn).toHaveBeenCalled();
    });
  });

  describe('#setCookie', function () {
    let cookieDomainForVanity;
    beforeEach(function () {
      cookieDomainForVanity = [
        'api.{{env}}',
        _.trim(mockContext.config.auth.domain, '.')
      ].join('.');
      cookieDomainForVanity = _.replace(
        cookieDomainForVanity,
        '{{env}}',
        mockContext.config.nodeEnv
      );
    });
    it('should set cookie with default config', function () {
      const result = {
        tokenExpiration: '',
        token: '00000000-0000-0000-0000-000000000000'
      };
      util.setCookie(result, mockContext);
      expect(mockContext.response.cookie).toHaveBeenCalledWith(
        mockContext.config.auth.userTokenCookieName,
        expect.any(String),
        expect.objectContaining({
          expires: expect.any(Date),
          domain: mockContext.config.auth.domain,
          path: '/',
          secure: true,
          httpOnly: true
        })
      );
    });
    it.each([
      {},
      { allowVanityDomain: false },
      { allowVanityDomain: null },
      { allowVanityDomain: undefined },
      { allowVanityDomain: 1 },
      { allowVanityDomain: '' },
      { allowVanityDomain: 'true' }
    ])(
      'should set cookie with default config when allowVanityDomain differs from true: %o',
      (options) => {
        const result = {
          tokenExpiration: '',
          token: '00000000-0000-0000-0000-000000000000'
        };

        util.setCookie(result, mockContext, options);
        expect(mockContext.response.cookie).toBeCalledWith(
          mockContext.config.auth.userTokenCookieName,
          expect.any(String),
          expect.objectContaining({
            expires: expect.any(Date),
            domain: mockContext.config.auth.domain,
            path: '/',
            secure: true,
            httpOnly: true
          })
        );
        expect(mockContext.response.cookie).not.toBeCalledWith(
          mockContext.config.auth.userTokenCookieName,
          expect.any(String),
          expect.objectContaining({
            expires: expect.any(Date),
            domain: cookieDomainForVanity,
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'None'
          })
        );
      }
    );

    it('should set cookie with allowVanityDomain=true', function () {
      const result = {
        tokenExpiration: '',
        token: '00000000-0000-0000-0000-000000000000'
      };
      util.setCookie(result, mockContext, { allowVanityDomain: true });
      expect(mockContext.response.cookie).toHaveBeenCalledWith(
        mockContext.config.auth.userTokenCookieName,
        expect.any(String),
        expect.objectContaining({
          expires: expect.any(Date),
          domain: cookieDomainForVanity,
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'None'
        })
      );
    });

    it('should set cookie with default config and ignore allowVanityDomain=true when missing auth.domain or nodeEnv config', function () {
      const result = {
        tokenExpiration: '',
        token: '00000000-0000-0000-0000-000000000000'
      };
      diffConfigUtil.setCookie(result, diffContext, {
        allowVanityDomain: true
      });
      expect(diffContext.response.cookie).toHaveBeenCalledWith(
        diffContext.config.auth.userTokenCookieName,
        expect.any(String),
        expect.objectContaining({
          expires: expect.any(Date),
          domain: diffContext.config.auth.domain,
          path: '/',
          secure: true,
          httpOnly: true
        })
      );
      expect(diffContext.logger.error).toHaveBeenCalled();
    });
  });

  describe('#getDirectivesFromInfo', () => {
    it.each([
      [{}, {}],
      [{ fieldName: 'name', schema: { astNode: {} } }, {}],
      [{ parentType: {}, schema: { astNode: {} } }, {}],
      [
        {
          parentType: {},
          schema: { astNode: {} }
        },
        {}
      ],
      [
        {
          parentType: {
            getFields: () => null
          },
          schema: { astNode: {} }
        },
        {}
      ],
      [
        {
          operation: {},
          schema: { astNode: {} }
        },
        { findByOperation: true }
      ],
      [
        {
          operation: {
            name: {
              value: 'rootName'
            }
          },
          schema: {
            getQueryType: () => null,
            astNode: {}
          }
        },
        { findByOperation: true }
      ],
      [
        {
          operation: {
            name: {
              value: 'rootName'
            }
          },
          schema: {
            getQueryType: () => ({
              getFields: () => null
            }),
            astNode: {}
          }
        },
        { findByOperation: true }
      ]
    ])(
      'should return empty array when missing input: %o and options: %o',
      (input, options) => {
        const directives = util.getDirectivesFromInfo(input, options);
        expect(directives.length).toEqual(0);
      }
    );
  });

  describe('#checkRights', function () {
    it('should pass with short-form rights', function () {
      const authInfo = { json: { rights: ['job:create', 'job:read'] } };
      expect(() => util.checkRights(authInfo, ['job:create'])).not.toThrow();
    });

    it('should pass when token has aiware-prefixed right (same bit ID)', function () {
      const authInfo = { json: { rights: ['aiware:job:create'] } };
      expect(() => util.checkRights(authInfo, ['job:create'])).not.toThrow();
    });

    // Literal storage form from the VE-19651 ticket — token carries
    // dot-separated rights instead of colon-separated.
    it('should pass when token has aiware-prefixed dot-form right (ticket case)', function () {
      const authInfo = { json: { rights: ['aiware.job.create'] } };
      expect(() => util.checkRights(authInfo, ['job:create'])).not.toThrow();
    });

    it('should pass when token has cms-prefixed right (same bit ID)', function () {
      const authInfo = { json: { rights: ['cms:job:create'] } };
      expect(() => util.checkRights(authInfo, ['job:create'])).not.toThrow();
    });

    it('should pass when required right uses dot separator', function () {
      const authInfo = { json: { rights: ['admin:user:read'] } };
      expect(() => util.checkRights(authInfo, ['admin.user.read'])).not.toThrow();
    });

    it('should throw when right is missing entirely', function () {
      const authInfo = { json: { rights: ['job:read'] } };
      expect(() => util.checkRights(authInfo, ['job:create'])).toThrow(
        errors.NotAllowed
      );
    });

    it('should throw when no rights on token', function () {
      const authInfo = { json: {} };
      expect(() => util.checkRights(authInfo, ['job:create'])).toThrow(
        errors.NotAllowed
      );
    });

    it('should fall back to string comparison for unknown permissions', function () {
      const authInfo = { json: { rights: ['custom:unknown:perm'] } };
      expect(() => util.checkRights(authInfo, ['custom.unknown.perm'])).not.toThrow();
    });
  });

  describe('#buildRootFolderName()', () => {
    let context;

    beforeEach(() => {
      context = {
        _authInfo: {
          userId: 'user_1',
          userName: 'Current User'
        }
      };

      // mock ROOT_FOLDER_TYPE_NAME
      _.set(mockContext, 'dal.folder.ROOT_FOLDER_TYPE_NAME', {
        1: 'Library'
      });

      // mock getUser
      _.set(mockContext, 'dal.admin.getUser', jest.fn());

      // mock getRootFolderUserIdByFolderId
      _.set(
        mockContext,
        'dal.folderV2.getRootFolderUserIdByFolderId',
        jest.fn().mockResolvedValue(null)
      );

      jest.clearAllMocks();
    });

    it('should build name for current user root folder', async () => {
      const obj = {
        rootFolderTypeId: 1,
        userId: 'user_1'
      };

      const name = await util.buildRootFolderName(obj, context);

      expect(name).toEqual('Current User Library Root Folder');
      expect(mockContext.dal.admin.getUser).not.toHaveBeenCalled();
    });

    it('should build name for other user root folder', async () => {
      mockContext.dal.admin.getUser.mockResolvedValue({
        name: 'Other User'
      });

      const obj = {
        rootFolderTypeId: 1,
        rootFolderUserId: 'user_2'
      };

      const name = await util.buildRootFolderName(obj, context);

      expect(mockContext.dal.admin.getUser).toHaveBeenCalledWith(
        { id: 'user_2' },
        context
      );
      expect(name).toEqual('Other User Library Root Folder');
    });

    it('should build name for org root folder', async () => {
      const spy = jest.spyOn(mockContext.dal.organization, 'getOrganization');

      const obj = {
        rootFolderTypeId: 1,
        organizationId: 123
      };

      const name = await util.buildRootFolderName(obj, context);

      expect(spy).toHaveBeenCalledWith(context, { id: 123 });
      expect(name).toEqual('test Library Root Folder');

      spy.mockRestore();
    });

    it('should fallback to type-only root folder name', async () => {
      const obj = {
        rootFolderTypeId: 1
      };

      const name = await util.buildRootFolderName(obj, context);

      expect(name).toEqual('Library Root Folder');
    });
  });

  describe('#getAssetUriFromVirtualId', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should throw NotFound when Redis returns null', async () => {
      mockContext.redisClient.get.mockImplementation((key, cb) => cb(null, null));

      await expect(util.getAssetUriFromVirtualId('va-missing')).rejects.toMatchObject({
        name: 'not_found'
      });
    });

    it('should throw InternalServerError when Redis errors', async () => {
      mockContext.redisClient.get.mockImplementation((key, cb) => cb(new Error('connection refused'), null));

      await expect(util.getAssetUriFromVirtualId('va-redis-err')).rejects.toMatchObject({
        name: 'internal_error'
      });
    });

    it('should parse and return virtual asset data from Redis', async () => {
      const payload = JSON.stringify({
        u: 'https://s3.amazonaws.com/bucket/asset.mp3',
        i: 'asset-id-1',
        f: 'recording.mp3',
        d: { some: 'details' },
        b: 'my-bucket',
        c: 1700000000000,
        s: 'https://signed-url.com/asset',
        e: 1700003600000
      });
      mockContext.redisClient.get.mockImplementation((key, cb) => cb(null, payload));

      const result = await util.getAssetUriFromVirtualId('va-test-123');

      expect(result).toEqual({
        uri: 'https://s3.amazonaws.com/bucket/asset.mp3',
        id: 'asset-id-1',
        fileName: 'recording.mp3',
        details: { some: 'details' },
        bucket: 'my-bucket',
        createdAt: 1700000000000,
        signedUrl: 'https://signed-url.com/asset',
        expiresAt: 1700003600000
      });
    });

    it('should handle payload without cached signedUrl', async () => {
      const payload = JSON.stringify({
        u: 'https://s3.amazonaws.com/bucket/asset.mp3',
        i: 'asset-id-2',
        f: 'file.wav',
        c: 1700000000000
      });
      mockContext.redisClient.get.mockImplementation((key, cb) => cb(null, payload));

      const result = await util.getAssetUriFromVirtualId('va-no-cache');

      expect(result.signedUrl).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
      expect(result.uri).toEqual('https://s3.amazonaws.com/bucket/asset.mp3');
    });
  });

  describe('#resolveVirtualAssetUri', () => {
    const VIRTUAL_ID = 'va-resolve-test';
    const ASSET_URI = 'https://s3.amazonaws.com/dev-api.veritone.com/org/asset/file.mp3';
    const SIGNED_URL = 'https://s3.amazonaws.com/dev-api.veritone.com/org/asset/file.mp3?X-Amz-Signature=abc';

    beforeEach(() => {
      jest.clearAllMocks();
      mockPresignUrl.mockResolvedValue(SIGNED_URL);
      mockGetBucketConfig.mockReturnValue({ signedUrlExpires: 3600 });
      mockContext.redisClient.set.mockImplementation((...args) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'OK');
        return Promise.resolve('OK');
      });
    });

    it('should throw InvalidInput when vId is falsy', async () => {
      await expect(util.resolveVirtualAssetUri(null)).rejects.toMatchObject({
        name: 'invalid_input'
      });
      await expect(util.resolveVirtualAssetUri('')).rejects.toMatchObject({
        name: 'invalid_input'
      });
    });

    it('should generate a fresh signed URL when assetReq has no cached signedUrl', async () => {
      const createdAt = Date.now() - 1000; // created 1 second ago
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-1',
        fileName: 'file.mp3',
        details: {},
        bucket: 'dev-api.veritone.com',
        createdAt
      };

      const result = await util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq);

      expect(result).toEqual(SIGNED_URL);
      expect(mockPresignUrl).toHaveBeenCalledWith(ASSET_URI, expect.objectContaining({
        ttl: expect.any(Number),
        // VE-27981: the payload's filename must reach the presigner so the
        // signed URL carries the content-disposition attachment override.
        fileName: 'file.mp3'
      }));
      // TTL should be approximately 3599 (3600 - 1 second elapsed)
      const callArgs = mockPresignUrl.mock.calls[0][1];
      expect(callArgs.ttl).toBeGreaterThan(3500);
      expect(callArgs.ttl).toBeLessThanOrEqual(3600);
    });

    it('presigns without a filename when the payload has none (VE-27981)', async () => {
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-no-name',
        details: {},
        bucket: 'dev-api.veritone.com',
        createdAt: Date.now() - 1000
      };

      const result = await util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq);

      expect(result).toEqual(SIGNED_URL);
      expect(mockPresignUrl.mock.calls[0][1].fileName).toBeUndefined();
    });

    it('should cache the signed URL back to Redis with correct TTL', async () => {
      const createdAt = Date.now() - 2000;
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-2',
        fileName: 'file.mp3',
        details: { type: 'audio' },
        bucket: 'dev-api.veritone.com',
        createdAt
      };

      await util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq);

      expect(mockContext.redisClient.set).toHaveBeenCalled();
      const setCall = mockContext.redisClient.set.mock.calls[0];
      expect(setCall[0]).toEqual(VIRTUAL_ID);
      const cached = JSON.parse(setCall[1]);
      expect(cached.s).toEqual(SIGNED_URL);
      expect(cached.u).toEqual(ASSET_URI);
      expect(cached.c).toEqual(createdAt);
      expect(cached.e).toBeGreaterThan(Date.now());
      expect(setCall[2]).toEqual('EX');
      expect(setCall[3]).toBeGreaterThan(3500);
    });

    it('should throw and delete Redis key when virtual asset TTL is fully expired', async () => {
      const createdAt = Date.now() - 4000 * 1000; // created 4000 seconds ago (> 3600 TTL)
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-expired',
        fileName: 'file.mp3',
        bucket: 'dev-api.veritone.com',
        createdAt
      };

      await expect(util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq)).rejects.toMatchObject({
        name: 'invalid_input'
      });
      expect(mockContext.redisClient.del).toHaveBeenCalledWith(VIRTUAL_ID);
      expect(mockPresignUrl).not.toHaveBeenCalled();
    });

    it('should fetch assetReq from Redis when not provided', async () => {
      const createdAt = Date.now() - 500;
      const payload = JSON.stringify({
        u: ASSET_URI,
        i: 'asset-from-redis',
        f: 'file.mp3',
        d: {},
        b: 'dev-api.veritone.com',
        c: createdAt
      });
      mockContext.redisClient.get.mockImplementation((key, cb) => cb(null, payload));

      const result = await util.resolveVirtualAssetUri(VIRTUAL_ID, null);

      expect(result).toEqual(SIGNED_URL);
      expect(mockContext.redisClient.get).toHaveBeenCalledWith(VIRTUAL_ID, expect.any(Function));
    });

    it('should throw when presignUrl fails', async () => {
      mockPresignUrl.mockRejectedValue(new Error('presign service down'));
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-presign-fail',
        fileName: 'file.mp3',
        bucket: 'dev-api.veritone.com',
        createdAt: Date.now() - 100
      };

      await expect(util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq)).rejects.toMatchObject({
        name: 'internal_error'
      });
    });

    it('should use legacy config TTL when presigner has no bucket config', async () => {
      mockGetBucketConfig.mockReturnValue(null);
      // Add signedUrlExpires to the legacy s3Buckets config
      mockContext.s3Buckets.api.s3.signedUrlExpires = 10800;
      const createdAt = Date.now() - 5000 * 1000; // 5000s ago — expired for 3600 TTL but not for 10800
      const assetReq = {
        uri: ASSET_URI,
        id: 'asset-legacy',
        fileName: 'file.mp3',
        bucket: 'api', // matches mockContext.s3Buckets.api
        createdAt
      };

      const result = await util.resolveVirtualAssetUri(VIRTUAL_ID, assetReq);

      expect(result).toEqual(SIGNED_URL);
      const callArgs = mockPresignUrl.mock.calls[0][1];
      // TTL should be 10800 - 5000 = ~5800
      expect(callArgs.ttl).toBeGreaterThan(5700);
      expect(callArgs.ttl).toBeLessThanOrEqual(5800);

      // Clean up
      delete mockContext.s3Buckets.api.s3.signedUrlExpires;
    });
  });
});
