const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const URL = require('url-parse');
const httpMock = require('node-mocks-http');

const serviceContext = require('../test/serviceContext.mock.js')();

serviceContext.config.httpPools = {
  'https://override.retryCodes.aws-dev.veritone.com': {
    retryableStatusCodes: [400, 403, 500],
    maxRetries: 3
  },
  'https://api.aws-dev.veritone.com/v1/search': {
    maxSockets: 100,
    maxRetries: 5
  },
  default: {
    retryableStatusCodes: [429, 502, 503, 504],
    maxRetries: 3
  }
};
serviceContext.config.s3 = {
  buckets: [
    {
      key: 'mybucket',
      name: 'mybucket',
      fallback: {
        bucketName: 'my-fallback-bucket.veritone.com',
        cloudProvider: 'aws'
      }
    }
  ]
};

const util = require('./httpUtil.js')(serviceContext);

describe('httpUtil', function () {
  describe('#getPoolConfig', function () {
    it('should get pool config - defaults', function () {
      const uri = 'https://api.aws-dev.veritone.com/v1/job';
      const parsed = new URL(uri);
      const config = util.getPoolConfig(uri, parsed);
      chaiExpect(config).to.exist;
      chaiExpect(config.name).to.equal(
        'https://api.aws-dev.veritone.com/v1/job'
      );
      chaiExpect(config.timeoutMillis).to.equal(4000);
      chaiExpect(config.maxSockets).to.equal(50);
    });
    it('should get pool config - override', function () {
      const uri = 'https://api.aws-dev.veritone.com/v1/search';
      const parsed = new URL(uri);
      const config = util.getPoolConfig(uri, parsed);
      chaiExpect(config).to.exist;
      chaiExpect(config.name).to.equal(
        'https://api.aws-dev.veritone.com/v1/search'
      );
      chaiExpect(config.maxRetries).to.equal(5);
      chaiExpect(config.maxSockets).to.equal(100);
    });
  });
  describe('getHttpPoolOptions', function () {
    it('should get overridden options', function () {
      const opt = util.getHttpPoolOptions(
        'https://api.aws-dev.veritone.com/v1/search'
      );
      chaiExpect(opt).to.exist;
      chaiExpect(opt.poolOptions).to.exist;
      chaiExpect(opt.poolOptions.isHttps).to.be.true;
      chaiExpect(opt.poolOptions.poolName).to.equal(
        'https://api.aws-dev.veritone.com/v1/search'
      );
      chaiExpect(opt.poolOptions.agent).to.exist;
      chaiExpect(opt.poolOptions.agent.maxSockets).to.equal(100);
      chaiExpect(opt.poolConfig).to.exist;
      chaiExpect(
        util.getHttpPoolOptions('http://api.aws-dev.veritone.com/v1/search')
          .poolOptions.isHttps
      ).to.be.false;
    });
    it('should get non-internal options', function () {
      const opt = util.getHttpPoolOptions('https://other.host.com');
      chaiExpect(opt.poolOptions.poolName).to.equal('general');
      chaiExpect(opt.poolConfig.maxRetries).to.exist;
    });
  });
  describe('isOurBucket', function () {
    it('should recognize our bucket', function () {
      chaiExpect(
        util.getBucket('https://mybucket.s3.amazonaws.com/foo')
      ).to.equal('mybucket');
      chaiExpect(
        util.getBucket('https://s3.amazonaws.com/mybucket/foo')
      ).to.equal('mybucket');
    });
    it('should not recognize unconfigured bucket', function () {
      chaiExpect(util.getBucket('https://s3.amazonaws.com/yourbucket/foo')).to
        .be.null;
    });
    it('should recognize a fallback bucket', function () {
      chaiExpect(
        util.getBucket(
          'https://s3.amazonaws.com/my-fallback-bucket.veritone.com/7682/asset/foo.jpeg'
        )
      ).to.equal('my-fallback-bucket.veritone.com');
    });
  });
  describe('isOurBucket', function () {
    it('should recognize our bucket', function () {
      chaiExpect(util.isOurBucket('https://mybucket.s3.amazonaws.com/foo')).to
        .be.true;
      chaiExpect(util.isOurBucket('https://s3.amazonaws.com/mybucket/foo')).to
        .be.true;
    });
    it('should not recognize unconfigured bucket', function () {
      chaiExpect(util.isOurBucket('https://s3.amazonaws.com/yourbucket/foo')).to
        .be.false;
    });
  });
  describe('isOci (VE-25065: config-gated OCI detection)', function () {
    const ociUri =
      'https://ns.compat.objectstorage.us-ashburn-1.oraclecloud.com/mybucket/7682/asset/foo.jpeg';

    it('does not detect OCI or claim the bucket when oci.enabled is false', function () {
      // Default config carries no `oci` block → oci.enabled falsy = reverted.
      // The OCI URI must not be classified as an owned bucket.
      chaiExpect(util.isOci(ociUri)).to.be.false;
      chaiExpect(util.getBucket(ociUri)).to.be.null;
      chaiExpect(util.isOurBucket(ociUri)).to.be.false;
    });

    it('detects OCI and claims the bucket when oci.enabled is true', function () {
      // Fresh instance with OCI enabled (do not mutate shared serviceContext).
      const ociEnabledUtil = require('./httpUtil.js')({
        ...serviceContext,
        config: { ...serviceContext.config, oci: { enabled: true } }
      });
      chaiExpect(ociEnabledUtil.isOci(ociUri)).to.be.true;
      chaiExpect(ociEnabledUtil.getBucket(ociUri)).to.equal('mybucket');
      chaiExpect(ociEnabledUtil.isOurBucket(ociUri)).to.be.true;
    });

    // The gate has a second activation axis besides oci.enabled: a bucket (or
    // its fallback) declaring cloudProvider 'oci'. Without these two cases the
    // axis is only exercised through the hand-copied mock in
    // presigner.s3.buckets.spec.js, which tests the copy and not this function.
    it('detects OCI when a bucket declares cloudProvider oci and oci.enabled is false', function () {
      const bucketDeclaredUtil = require('./httpUtil.js')({
        ...serviceContext,
        config: {
          ...serviceContext.config,
          s3: { buckets: [{ key: 'mybucket', name: 'mybucket', cloudProvider: 'oci' }] }
        }
      });
      chaiExpect(bucketDeclaredUtil.isOci(ociUri)).to.be.true;
      chaiExpect(bucketDeclaredUtil.getBucket(ociUri)).to.equal('mybucket');
      chaiExpect(bucketDeclaredUtil.isOurBucket(ociUri)).to.be.true;
    });

    it('detects OCI when only a fallback declares cloudProvider oci (VE-26007 inverse migration)', function () {
      // AWS primary + OCI fallback holding unmigrated objects. This shape runs
      // with oci.enabled=false and must keep signing, so a URI pointing at the
      // OCI fallback bucket has to stay owned.
      const inverseMigrationUtil = require('./httpUtil.js')({
        ...serviceContext,
        config: {
          ...serviceContext.config,
          s3: {
            buckets: [
              {
                key: 'aws-primary',
                name: 'aws-primary',
                cloudProvider: 'aws',
                fallback: { bucketName: 'oci-legacy', cloudProvider: 'oci' }
              }
            ]
          }
        }
      });
      const fallbackUri =
        'https://ns.compat.objectstorage.us-ashburn-1.oraclecloud.com/oci-legacy/7682/asset/foo.jpeg';
      chaiExpect(inverseMigrationUtil.isOci(fallbackUri)).to.be.true;
      chaiExpect(inverseMigrationUtil.getBucket(fallbackUri)).to.equal('oci-legacy');
      chaiExpect(inverseMigrationUtil.isOurBucket(fallbackUri)).to.be.true;
    });

    it('does not detect OCI when every bucket and fallback declares a non-oci provider', function () {
      // Guards the gate against collapsing to "any s3.buckets entry activates".
      const awsOnlyUtil = require('./httpUtil.js')({
        ...serviceContext,
        config: {
          ...serviceContext.config,
          s3: {
            buckets: [
              {
                key: 'mybucket',
                name: 'mybucket',
                cloudProvider: 'aws',
                fallback: { bucketName: 'my-fallback', cloudProvider: 'aws' }
              }
            ]
          }
        }
      });
      chaiExpect(awsOnlyUtil.isOci(ociUri)).to.be.false;
      chaiExpect(awsOnlyUtil.getBucket(ociUri)).to.be.null;
      chaiExpect(awsOnlyUtil.isOurBucket(ociUri)).to.be.false;
    });

    it('returns false for a non-string uri', function () {
      chaiExpect(util.isOci(undefined)).to.be.false;
    });
  });
  describe('#isRetryable()', function () {
    it('say yes on ok error code - internal', function () {
      const res = util.isRetryable(
        'https://override.retryCodes.aws-dev.veritone.com/foo',
        { data: { httpStatusCode: 500 } },
        moment().valueOf(),
        serviceContext.config.httpPools[
          'https://override.retryCodes.aws-dev.veritone.com'
        ],
        0
      );
      chaiExpect(res).to.be.true;
    });
    it('say no on not ok error code - internal', function () {
      const res = util.isRetryable(
        'https://override.retryCodes.aws-dev.veritone.com/foo',
        { data: { httpStatusCode: 502 } },
        moment().valueOf(),
        serviceContext.config.httpPools[
          'https://override.retryCodes.aws-dev.veritone.com'
        ],
        0
      );
      chaiExpect(res).to.be.false;
    });
    it('say no on too many retry - internal', function () {
      const res = util.isRetryable(
        'https://override.retryCodes.aws-dev.veritone.com/foo',
        { data: { httpStatusCode: 429 } },
        moment().valueOf(),
        serviceContext.config.httpPools[
          'https://override.retryCodes.aws-dev.veritone.com'
        ],
        4
      );
      chaiExpect(res).to.be.false;
    });
    it('say yes on ok error code - bucket', function () {
      const res = util.isRetryable(
        'https://mybucket.s3.amazonaws.com/foo',
        { data: { httpStatusCode: 429 } },
        moment().valueOf(),
        serviceContext.config.httpPools.default,
        0
      );
      chaiExpect(res).to.be.true;
    });
    it('say yes on random url', function () {
      const res = util.isRetryable(
        'https://not.our.url/foo',
        { data: { httpStatusCode: 502 } },
        moment().valueOf(),
        serviceContext.config.httpPools.default,
        0
      );
      chaiExpect(res).to.be.true;
    });
    it('say yes on random url with other error format', function () {
      const res = util.isRetryable(
        'https://not.our.url/foo',
        { statusCode: 502 },
        moment().valueOf(),
        serviceContext.config.httpPools.default,
        0
      );
      chaiExpect(res).to.be.true;
    });

    it('say no on random url with override', function () {
      const config = JSON.parse(
        JSON.stringify(serviceContext.config.httpPools.default)
      );
      config.maxRetries = 0;
      const res = util.isRetryable(
        'https://not.our.url/foo',
        { data: { httpStatusCode: 502 } },
        moment().valueOf(),
        config,
        0
      );
      chaiExpect(res).to.be.false;
    });
  });
  describe('logHttpCall', function () {
    it('should log call', function () {
      util.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        null,
        0
      );
      util.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        { message: 'error', data: { code: 500 } },
        3
      );
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(2);
    });
    it('should log only error', function () {
      serviceContext._clearAll();
      _.set(serviceContext, 'config.log.http.all', false);
      const tutil = require('./httpUtil.js')(serviceContext);
      tutil.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        null,
        0
      );
      tutil.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        { message: 'error', data: { code: 500 } },
        3
      );
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
    it('should log only error', function () {
      serviceContext._clearAll();
      _.set(serviceContext, 'config.log.http.all', false);
      _.set(serviceContext, 'config.log.http.error', false);
      const tutil = require('./httpUtil.js')(serviceContext);
      tutil.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        null,
        0
      );
      tutil.logHttpCall(
        'https://api.aws-dev.veritone.com/v1/search',
        1000,
        1000,
        200,
        'https://api.aws-dev.veritone.com/v1/search',
        { message: 'error', data: { code: 500 } },
        3
      );
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
    });
  });
  describe('recordHttpError', function () {
    it('should record error', function () {
      serviceContext._clearAll();
      util.recordHttpError(
        'https://api.aws-dev.veritone.com/v1/search',
        { data: { httpStatusCode: 500 } },
        2000,
        'https://api.aws-dev.veritone.com/v1/search',
        2
      );
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
    });
  });
  describe('uriParser', function () {
    it('should return bucket and key by s3 uri', function () {
      const uri = 'https://s3.amazonaws.com/mybucket/key';
      const { bucket, key } = util.uriParser(uri);
      chaiExpect(bucket).to.exist;
      chaiExpect(key).to.equal('key');
    });
    it('should return the fallback bucket and key by s3 uri', function () {
      const uri =
        'https://s3.amazonaws.com/my-fallback-bucket.veritone.com/7682/asset/foo.jpeg';
      const { bucket, key } = util.uriParser(uri);
      chaiExpect(bucket).to.equal('my-fallback-bucket.veritone.com');
      chaiExpect(key).to.equal('7682/asset/foo.jpeg');
    });
  });
});
