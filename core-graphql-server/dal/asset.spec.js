const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const nock = require('nock');
const { Readable } = require('stream');

const mockEsSearch = jest.fn();
mockEsSearch.mockResolvedValue({});

const mockGetDeletableUris = jest.fn();
mockGetDeletableUris.mockImplementation(async (uri) => ({ primaryUri: uri, fallbackUri: null }));
jest.mock('../util/presigner.s3.buckets', () => {
  return {
    getInstance: () => ({
      getDeletableUris: mockGetDeletableUris
    })
  };
});

jest.mock('es7', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        search: mockEsSearch
      };
    })
  };
});

class MockStream extends Readable {
  constructor(opt) {
    super(opt);
    this._done = false;
    this._value = opt.value || 'test';
  }
  _read() {
    if (this._done) {
      this.push(null);
    } else {
      this._done = true;
      this.push(Buffer.from(this._value));
    }
  }
}
const mockUtil = require('../test/mockUtil.js')();
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.DEFAULT, {
  mockHttp: false
});

serviceContext.redisCache = {
  isCacheDirty: () => true,
  markCacheDirty: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  asyncSet: jest.fn(),
  clear: () => {
    return new Promise((resolve) => {
      resolve();
    });
  },
  incr: jest.fn(),
  incrBy: jest.fn(),
  incrByFloat: jest.fn(),
  decr: jest.fn(),
  multiExec: jest.fn()
};

const mockPartitionTable = require('../test/partitionTable.mock.js')(
  serviceContext
);
let deleteAssetCount = 0;
let putAssetCount = 0;

serviceContext.storage = {
  deleteAsset: (obj, cb) => {
    deleteAssetCount++;
    const uri = _.isString(obj) ? obj : obj._uri;
    cb(null, uri);
  },
  putAsset: (model, stream, size, cb) => {
    putAssetCount++;
    const url = model.storagePath
      ? 'https://testbucket.s3.amazonaws.com/' + model.storagePath
      : 'https://testbucket.s3.amazonaws.com/test/123';
    model._uri = url;
    cb(null, url);
  },
  isAmazonS3Uri: (s3Uri) => {
    return s3Uri.includes('s3') || s3Uri.includes('amazonaws');
  },
  getFileExtension: require('@veritone/core-server-base/storageUtil.js')({})
    .getFileExtension
};
_.set(serviceContext, 'config.server.maxTaskOutputSizeBytes', 10);
_.set(serviceContext, 'config.synchronousTDOIndexUpdate', true);
_.set(serviceContext, 'dal.dalStorage', {
  getBlobInfo: jest.fn(),
  getSignedWritableUrl: jest.fn(),
  putRawBytes: jest.fn(),
  putObjectTaggingPromise: jest.fn(),
  getStorageByBucketName: () => {
    // fake storage
    return serviceContext.storage;
  }
});
_.set(serviceContext, 'app.dalPartitionGenerator', {
  createRecordingAssetPartitions: jest.fn(),
  pgErrorCodes: {
    '42P01': '42P01'
  }
});

const dalAsset = require('./asset.js')(serviceContext);

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;
const mediaDbRead = serviceContext.dbConnections['media_platform'].read;
const ssoDbRead = serviceContext.dbConnections['sso'].read;
const appId = 'a4fa5950-c3b4-47eb-9808-10ed295d2695';

const s3buckets = _.get(serviceContext, 'config.s3.buckets', []);
s3buckets.push({
  key: 'testBucket',
  path: '/test',
  name: 'testBucket'
});
_.set(serviceContext, 'config.s3.buckets', s3buckets);

describe('asset.js', function () {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    deleteAssetCount = 0;
    putAssetCount = 0;
  });

  describe('#deleteAsset', function () {
    beforeEach(() => {
      mockGetDeletableUris.mockImplementation(async (uri) => ({ primaryUri: uri, fallbackUri: null }));
    });
    it('should handle an object delete error', async function () {
      mockGetDeletableUris.mockResolvedValue({ primaryUri: 'https://testBucket.s3.amazonaws.com/test/12345/testDelete.mp4', fallbackUri: null });
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');

      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => cb(new Error('unknown error'), null),
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: 'https://testBucket.s3.amazonaws.com/test/12345/testDelete.mp4',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false); // metadata to check for cloned asset

      try {
        await tempDal.deleteAsset(mockUtil.makeContext(), {
          id: '12300001_abcd1'
        });
      } catch (err) {
        expect(err.name).toMatch(/internal_error|Error/);
      }
    });
    it('should ignore an access denied object delete error', async function () {
      mockGetDeletableUris.mockResolvedValue({ primaryUri: 'https://testBucket.s3.amazonaws.com/test/12345/testDelete.mp4', fallbackUri: null });
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      let deleteAttempt = 0;
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          deleteAttempt++;
          cb(new Error('AccessDenied:  could not be deleted'), null);
        },
        putAsset: (obj, cb) => cb(null, obj),
        putObjectTagging: (key, tags, versionId, cb) => {
          cb(null, {});
        }
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: 'https://testBucket.s3.amazonaws.com/test/12345/testDelete.mp4',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false); // metadata to check for cloned asset
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      tempServiceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      // deleting an asset requires updating storage_last_updated_timestamp - returns []
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });
      // verify that we did call deleteAssetStorage
      expect(deleteAttempt).toEqual(1);
      // verify that a warning/log line was emitted
      // emit 3 messages: asset_storage_delete_failed, internal and public recording_cognition_completed events
      // including access media event
      expect(tempServiceContext.messageUtil._counter()).toBeGreaterThanOrEqual(4);
    });

    it('should delete multiple objects from storage when presigner returns multiple URIs', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      let deleteAttempt = 0;
      const deletedUris = [];
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          deleteAttempt++;
          const uri = _.isString(obj) ? obj : obj._uri;
          deletedUris.push(uri);
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/main.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/main.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false); // metadata to check for cloned asset
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(deleteAttempt).toEqual(2);
      expect(deletedUris).toContain(mainUri);
      expect(deletedUris).toContain(fallbackUri);
      expect(mockGetDeletableUris).toHaveBeenCalledWith(mainUri);
    });

    it('should continue deleting other URIs even if one fails with 404', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      let deleteAttempt = 0;
      const deletedUris = [];
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          deleteAttempt++;
          const uri = _.isString(obj) ? obj : obj._uri;
          deletedUris.push(uri);
          if (uri.includes('fail404')) {
            const err = new Error('NotFound');
            err.statusCode = 404;
            return cb(err);
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/fail404.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/success.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false
          },
          applicationId: appId
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      const result = await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(deleteAttempt).toEqual(2);
      expect(deletedUris).toContain(mainUri);
      expect(deletedUris).toContain(fallbackUri);
      expect(result.message).toContain('Object(s) successfully deleted from storage');
    });

    it('should throw error if primary URI fails even if fallback succeeds', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('failPrimary')) {
            return cb(new Error('Primary Fail'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/failPrimary.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/success.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      try {
        await tempDal.deleteAsset(mockUtil.makeContext(), {
          id: '12300001_abcd1'
        });
        throw new Error('Should have thrown an error');
      } catch (err) {
        expect(err.name).toMatch(/internal_error|Error/);
        expect(err.message).toContain('primary_bucket: Primary Fail');
      }
    });

    it('should succeed silently if fallback fails but primary succeeds', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      let deleteAttempt = 0;
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          deleteAttempt++;
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('failFallback')) {
            return cb(new Error('Fallback Fail'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/primarySuccess.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/failFallback.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      const result = await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(deleteAttempt).toEqual(2);
      expect(result.message).toContain('Object(s) successfully deleted from storage');
    });

    it('should include both errors in message when both primary and fallback fail', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('failPrimary')) {
            return cb(new Error('Primary Fail'));
          }
          if (uri.includes('failFallback')) {
            return cb(new Error('Fallback Fail'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/failPrimary.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/failFallback.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      try {
        await tempDal.deleteAsset(mockUtil.makeContext(), {
          id: '12300001_abcd1'
        });
        throw new Error('Should have thrown an error');
      } catch (err) {
        expect(err.name).toMatch(/internal_error|Error/);
        expect(err.message).toContain('primary_bucket: Primary Fail');
        expect(err.message).toContain('fallback_bucket: Fallback Fail');
      }
    });

    it('should throw error if primary fails with AccessDenied', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      _.set(tempServiceContext, 'config.featureFlags.virtualAssetEnabled', true);
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('failAccess')) {
            return cb(new Error('AccessDenied'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/failAccess.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/success.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      const result = await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(result.message).toContain('Failed to delete object(s) from storage for primary bucket');
      expect(result.message).toContain('Error(s): primary_bucket: AccessDenied');
    });

    it('should throw error if primary URI fails with non-404 error', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('fail500')) {
            return cb(new Error('Internal Server Error'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/fail500.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/success.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      try {
        await tempDal.deleteAsset(mockUtil.makeContext(), {
          id: '12300001_abcd1'
        });
        throw new Error('Should have thrown an error');
      } catch (err) {
        expect(err.name).toMatch(/internal_error|Error/);
        expect(err.message).toContain('primary_bucket: Internal Server Error');
      }
    });

    it('should fail silently if only fallback URI fails with non-404 error', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          if (uri.includes('fail500')) {
            return cb(new Error('Internal Server Error'));
          }
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/success.mp4';
      const fallbackUri = 'https://otherBucket.s3.amazonaws.com/test/12345/fail500.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: fallbackUri });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      const result = await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(result.message).toEqual('Object(s) successfully deleted from storage.');
    });

    it('should set success message when primary succeeds even if fallback is missing', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          const uri = _.isString(obj) ? obj : obj._uri;
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };
      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/success.mp4';

      mockGetDeletableUris.mockResolvedValue({ primaryUri: mainUri, fallbackUri: null });

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      const result = await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(result.message).toEqual('Object(s) successfully deleted from storage.');
    });

    it('should delete from single URI if getDeletableUris is not present', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      _.set(tempServiceContext, 'config.s3.bucket', 'testBucket');
      let deleteAttempt = 0;
      tempServiceContext.storage = {
        deleteAsset: (obj, cb) => {
          deleteAttempt++;
          const uri = _.isString(obj) ? obj : obj._uri;
          cb(null, uri);
        },
        putAsset: (obj, cb) => cb(null, obj)
      };

      // Mock presigner without getDeletableUris
      const presignerModule = require('../util/presigner.s3.buckets');
      const originalGetInstance = presignerModule.getInstance;
      presignerModule.getInstance = () => ({});

      const tempDal = require('./asset.js')(tempServiceContext);

      const mainUri = 'https://testBucket.s3.amazonaws.com/test/12345/main.mp4';

      tempServiceContext.dbConnections['core'].read._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: mainUri,
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      tempServiceContext.dbConnections['core'].read._push([{ id: '12300001', json: {}, applicationId: appId }]);
      tempServiceContext.dbConnections['core'].read._push([]);
      tempServiceContext.dbConnections['core'].read._push([], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      tempServiceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);
      tempServiceContext.dbConnections['media_platform'].read._push([]);

      await tempDal.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      expect(deleteAttempt).toEqual(1);

      // Restore
      presignerModule.getInstance = originalGetInstance;
    });

    it('should delete non-primary asset', async function () {
      // recording_asset
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri: 'http://localhost:9000',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([]);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(7);
      expect(deleteAssetCount).toEqual(0);
    });
    it('should delete primary asset', async function () {
      coreDbRead._push([
        {
          id: '12300002_abcd1',
          container_id: '1230002',
          uri: 'http://localhost:9000',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      coreDbRead._push([
        {
          id: '12300002',
          json: {
            hasPrimary: true,
            mediaAsset: { assetId: '12300002_abcd1' },
            transcriptAsset: { assetId: '12300002_abcd1' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300002',
          json: {
            hasPrimary: true,
            mediaAsset: { assetId: '12300002_abcd1' },
            transcriptAsset: { assetId: '12300002_abcd1' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([], true, ['UPDATE', 'transcriptAsset', 'mediaAsset']);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300002_abcd1'
      });

      // verify that redis was called twice (tdo and details)
      // plus baseline for delete asset
      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(9);
      expect(deleteAssetCount).toEqual(0);
    });

    it('should delete content in our bucket', async function () {
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri:
            'https://testBucket.s3.amazonaws.com/test/12345/6862bfd5-3b88-4cc1-8974-e638a7716529.mp4',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([]);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(7);
      expect(deleteAssetCount).toEqual(1);
    });

    it('should not delete cloned content in our bucket', async function () {
      deleteAssetCount = 0;
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri:
            'https://testBucket.s3.amazonaws.com/test/12345/6862bfd5-3b88-4cc1-8974-e638a7716529.mp4',
          user_edited: false,
          type: 'media',
          metadata: {}
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([]);
      coreDbRead._push(
        [
          {
            details: {
              'veritone-clone': {
                cloneBlobs: false,
                newAssetIdsToOldAssetIds: {
                  '12300001_abcd1': '45600002_abcd2'
                }
              }
            }
          }
        ],
        false
      ); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(7);
      expect(deleteAssetCount).toEqual(0);
    });

    it('should not delete asset with uri marked as referenced', async function () {
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri:
            'https://testBucket.s3.amazonaws.com/test/12345/6862bfd5-3b88-4cc1-8974-e638a7716529.mp4',
          user_edited: false,
          type: 'media',
          metadata: {
            storeAsReference: true
          }
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([]);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(7);
      expect(deleteAssetCount).toEqual(0);
    });

    it('should delete content without metadata', async function () {
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri:
            'https://testBucket.s3.amazonaws.com/test/12345/6862bfd5-3b88-4cc1-8974-e638a7716529.mp4',
          user_edited: false,
          type: 'media'
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '12300001',
          json: {
            hasPrimary: false,
            mediaAsset: { assetId: '12300001_abcd2' },
            transcriptAsset: { assetId: '12300001_abcd3' }
          },
          applicationId: appId
        }
      ]);
      coreDbRead._push([]);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // expect(serviceContext.redisClient._counter()).toEqual(7);
      expect(deleteAssetCount).toEqual(1);
    });
  });
  describe('#getAsset', function () {
    it('should error invalid_input on no id and emit audit event', async function () {
      try {
        serviceContext.config.featureFlags.readAuditEvents = true;
        const ctx = mockUtil.makeContext();
        await dalAsset.getAsset(ctx, {});
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'read',
            actionResult: 'failure'
          })
        );
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error invalid_input on no id and not emit audit event without kvp (metrics still fire)', async function () {
      try {
        const ctx = mockUtil.makeContext();
        await dalAsset.getAsset(ctx, {});
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages.length).toEqual(0);
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should error invalid_input on empty id', async function () {
      try {
        await dalAsset.getAsset(mockUtil.makeContext(), { id: '' });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should throw not found on non-TDO id', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      try {
        await dalAsset.getAsset(mockUtil.makeContext(), { id: 'abcd' });
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should throw not found on TDO id', async function () {
      serviceContext.dbConnections['core'].read._push([]);
      try {
        await dalAsset.getAsset(mockUtil.makeContext(), {
          id: '89453826_uAjmVP2ekI'
        });
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should throw not found on asset found but not TDO id', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '89453826_uAjmVP2ekI',
          container_id: '89453826'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([]);
      try {
        await dalAsset.getAsset(mockUtil.makeContext(), {
          id: '89453826_uAjmVP2ekI'
        });
      } catch (err) {
        expect(err.name).toEqual('not_found');
      }
    });
    it('should throw not found on asset found but TDO error', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekI',
            container_id: '89453826'
          }
        ],
        true,
        ['user_edited !=']
      );
      serviceContext.dbConnections['core'].read._push(
        [],
        true,
        [],
        (sql, vars) => {
          throw new Error('TDO_ERROR');
        }
      );
      try {
        await dalAsset.getAsset(mockUtil.makeContext(), {
          id: '89453826_uAjmVP2ekI',
          ignoreUserEdited: true
        });
      } catch (err) {
        expect(_.toString(err)).toMatch(/TDO_ERROR/i);
      }
    });

    it('should get fake media asset id', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: '89453826'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([]); // source-task-data
      serviceContext.dbConnections['core'].read._push([
        {
          // media-init asset
          container_id: '89453826',
          uri: 'http://localhost/whatever'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              numSegments: 10
            }
          }
        ],
        false
      );
      const res = await dalAsset.getAsset(mockUtil.makeContext(), {
        id: 'VlRBOm1lZGlhOjg5NDUzODI2'
      });
      expect(res).toBeTruthy();
    });
  });
  describe('#getAssets', function () {
    it('should allow only one of assetType and type', async function () {
      try {
        await dalAsset.getAssets(mockUtil.makeContext(), {
          assetType: 'test',
          type: 'test',
          containerId: '123545'
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should assets without fake', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekI',
            container_id: '89453826',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            type: 'media',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        true,
        ['recording_id in', "NOT LIKE 'v-%'"],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 2) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826'
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });
    it('should get assets with fake', async function () {
      serviceContext.dbConnections['core'].read._push([]); // source task
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekH',
            asset_type: 'media-init',
            type: 'media-init'
          }
        ],
        false
      ); // media-init
      serviceContext.dbConnections['core'].read._push([], false); // tdo metadata
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekI',
            container_id: '89453826',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false /* parser doesn't support union */,
        ['recording_id in', "NOT LIKE 'v-%'", 'union'],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 2) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        includeVirtualMediaAsset: true,
        includeVirtualAsset: ['89453826']
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });

    it('should assets by source engine ID', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekI',
            container_id: '89453826',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            type: 'media',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false,
        ['recording_id in', "NOT LIKE 'v-%'"],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 4) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          if (!_.isObject(vars[2]))
            throw new Error('$3 should be a object, not ' + vars[2]);
          if (!_.isObject(vars[3]))
            throw new Error('$3 should be a object, not ' + vars[3]);
          if (
            !(
              JSON.stringify(vars[2]).includes('sourceEngineId') &&
              JSON.stringify(vars[2]).includes(
                '02504fbf-42e3-4103-b85e-fb1454e34812'
              ) &&
              JSON.stringify(vars[3]).includes('source') &&
              JSON.stringify(vars[3]).includes(
                '02504fbf-42e3-4103-b85e-fb1454e34812'
              )
            )
          )
            throw new Error('$3 should be engine ID');
          3;
          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        sourceEngineId: '02504fbf-42e3-4103-b85e-fb1454e34812',
        ignoreUserEdited: true
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });

    it('should assets by source engine IDs', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '89453826_uAjmVP2ekI',
            container_id: '89453826',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            type: 'media',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        false,
        ['recording_id in', "NOT LIKE 'v-%'"],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 6) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          // verify structure of engine IDs filter
          if (!_.isObject(vars[2]))
            throw new Error('$3 should be a object, not ' + vars[2]);
          if (!_.isObject(vars[3]))
            throw new Error('$3 should be a object, not ' + vars[3]);
          if (!_.isObject(vars[4]))
            throw new Error('$4 should be a object, not ' + vars[4]);
          if (!_.isObject(vars[5]))
            throw new Error('$5 should be a object, not ' + vars[5]);
          if (
            !(
              JSON.stringify(vars[2]).includes('sourceEngineId') &&
              JSON.stringify(vars[2]).includes(
                '02504fbf-42e3-4103-b85e-fb1454e34812'
              ) &&
              JSON.stringify(vars[3]).includes('source') &&
              JSON.stringify(vars[3]).includes(
                '02504fbf-42e3-4103-b85e-fb1454e34812'
              )
            )
          )
            throw new Error('$3 should be engine ID');
          3;

          if (
            !(
              JSON.stringify(vars[4]).includes('sourceEngineId') &&
              JSON.stringify(vars[4]).includes(
                '0fd3b95b-84c2-4dad-8aae-d86539d440a8'
              ) &&
              JSON.stringify(vars[5]).includes('source') &&
              JSON.stringify(vars[5]).includes(
                '0fd3b95b-84c2-4dad-8aae-d86539d440a8'
              )
            )
          )
            throw new Error('$4 should be engine ID');
          3;

          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        sourceEngineId: [
          '02504fbf-42e3-4103-b85e-fb1454e34812',
          '0fd3b95b-84c2-4dad-8aae-d86539d440a8'
        ],
        includeVirtualMediaAsset: false,
        ignoreUserEdited: false
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });

    it('should get assets by ID', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '9453821_wAjmVP2ekI',
            container_id: '89453821',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            type: 'media',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        true,
        ['recording_id in', 'asset_id ='],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 3) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          if (!_.isString(vars[2])) throw new Error('$3 should be string');
          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453821',
        id: '89453821_wAjmVP2ekI'
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });

    it('should get assets by IDs', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: ['89453826_uAjmVP2ekI', '89453826_uAjmVP2ekZ'],
            container_id: '89453826',
            uri: 'http://localhost',
            content_type: 'video/mp4',
            type: 'media',
            metadata: {},
            created_date_time: moment().unix(),
            modified_date_time: moment().unix(),
            user_edited: false
          }
        ],
        true,
        ['recording_id in', 'asset_id ='],
        (sql, vars) => {
          // checks verify that the container ID filter optimization
          // looks ok -- string comparison has to come before int.
          if (vars.length != 3) throw new Error('wrong number of vars');
          if (!_.isString(vars[0])) throw new Error('$1 should be string');
          if (!_.isNumber(vars[1])) throw new Error('$2 should be number');
          if (!_.isString(vars[2])) throw new Error('$3 should be string');
          return true;
        }
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        id: '89453826_uAjmVP2ekI'
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
    });

    it('should get assets with fake asset ID - wrong TDO', async function () {
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        id: 'VlRBOm1lZGlhOjg5NDUzODI2',
        container_id: '89453826'
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(0);
    });
    it('should get assets with fake asset ID - same TDO', async function () {
      serviceContext.dbConnections['core'].read._push([{ content: {} }]); // source data
      serviceContext.dbConnections['core'].read._push([]); // media-init asset
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              numSegments: 10
            }
          }
        ],
        false
      ); // tdo details
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        id: 'VlRBOm1lZGlhOjg5NDUzODI2',
        containerId: '89453826'
      });
      expect(res).toBeTruthy();
      expect(res.records).toBeTruthy();
      expect(res.records.length).toEqual(1);
      expect(res.records[0].id).toEqual('VlRBOm1lZGlhOjg5NDUzODI2');
    });
    it('should get assets with fake asset SQL clause with type param', async function () {
      serviceContext.dbConnections['core'].read._push([{ content: {} }]); // source data
      serviceContext.dbConnections['core'].read._push([]); // media-init asset
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              numSegments: 10
            }
          }
        ],
        false
      ); // tdo details
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'VlRBOm1lZGlhOjg5NDUzODI2',
            uri: 'http://localhost/media-streamer/download/tdo/89453826'
          }
        ],
        false,
        [
          // these required strings verify that the "fake" asset UNION
          // clause includes the expected column values.
          'union',
          'virtualAsset',
          'virtualTable',
          'http://localhost/media-streamer/download/tdo/89453826',
          'VlRBOm1lZGlhOjg5NDUzODI2'
        ]
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        assetType: ['media'],
        includeVirtualAsset: ['89453826']
      });
      expect(res).toBeTruthy();
    });

    it('should get assets with fake asset SQL clause without type param', async function () {
      serviceContext.dbConnections['core'].read._push([{ content: {} }]); // source data
      serviceContext.dbConnections['core'].read._push([]); // media-init asset
      serviceContext.dbConnections['core'].read._push(
        [
          {
            details: {
              numSegments: 10
            }
          }
        ],
        false
      ); // tdo details
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'VlRBOm1lZGlhOjg5NDUzODI2',
            uri: 'http://localhost/media-streamer/download/tdo/89453826'
          }
        ],
        false,
        [
          // these required strings verify that the "fake" asset UNION
          // clause includes the expected column values.
          'union',
          'virtualAsset',
          'virtualTable',
          'http://localhost/media-streamer/download/tdo/89453826',
          'VlRBOm1lZGlhOjg5NDUzODI2'
        ]
      );
      const res = await dalAsset.getAssets(mockUtil.makeContext(), {
        containerId: '89453826',
        assetType: ['media'],
        includeVirtualAsset: ['89453826']
      });
      expect(res).toBeTruthy();
      expect(_.get(res, 'records[0].id')).toEqual('VlRBOm1lZGlhOjg5NDUzODI2');
      expect(_.get(res, 'records[0].uri')).toEqual(
        'http://localhost/media-streamer/download/tdo/89453826'
      );
    });
  });

  describe('#getAssetList', function () {
    it('check applicationId enforcement', async function () {
      try {
        await dalAsset.getAssetList(mockUtil.makeContext(), {});
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
      }
    });
    it('handle invalid scrollId', async function () {
      try {
        await dalAsset.getAssetList(mockUtil.makeContext(), {
          applicationId: '_app_id_',
          scrollId: '-invalid-'
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.data.objectId).toEqual('-invalid-');
      }
    });

    it('build all possible filters', async function () {
      await dalAsset.getAssetList(mockUtil.makeContext(), {
        offset: 0,
        limit: 30,
        applicationId: '_app_id_',
        ids: ['a1', 'a2'],
        contentTypes: ['ct/1', 'ct/2'],
        assetTypes: ['v1', 'v2', 'v3'],
        sourceEngineIds: ['e1', 'e2', 'e3'],
        createdDateFilter: {
          fromDateTime: '2020-01-01T00:00:01Z',
          toDateTime: '2020-02-01T00:00:01Z',
          toDateTimeExclusive: true
        }
      });
      expect(mockEsSearch).toHaveBeenCalledWith({
        body: {
          _source: ['_id', 'recordingId'],
          query: {
            bool: {
              must: [
                { term: { ownerApplicationId: '_app_id_' } },
                { terms: { _id: ['a1', 'a2'] } },
                { terms: { contentType: ['ct/1', 'ct/2'] } },
                { terms: { assetType: ['v1', 'v2', 'v3'] } },
                { terms: { sourceEngineId: ['e1', 'e2', 'e3'] } },
                {
                  range: {
                    createdDateTime: {
                      gte: '2020-01-01T00:00:01.000Z',
                      lt: '2020-02-01T00:00:01.000Z'
                    }
                  }
                }
              ]
            }
          },
          sort: [{ createdDateTime: 'desc' }]
        },
        from: 0,
        index: 'asset-*',
        size: 30
      });
    });

    it('use scroll', async function () {
      await dalAsset.getAssetList(mockUtil.makeContext(), {
        limit: 30,
        scrollId: 'WzE2OTkxMjM0MTIzNCwgIjEyMzQxMjQzX3h5eiJd',
        applicationId: '_app_id_',
        assetTypes: ['vtn-standard']
      });
      expect(mockEsSearch).toHaveBeenCalledWith({
        body: {
          _source: ['_id', 'recordingId'],
          query: {
            bool: {
              must: [
                { term: { ownerApplicationId: '_app_id_' } },
                { terms: { assetType: ['vtn-standard'] } }
              ]
            }
          },
          sort: [{ createdDateTime: 'desc' }],
          search_after: [169912341234, '12341243_xyz']
        },
        index: 'asset-*',
        size: 30
      });
    });
  });

  describe('#updateAsset', function () {
    it('should update asset metadata', async function () {
      const args = {
        input: {
          id: '1200001_abcd',
          description: 'a test updated asset',
          details: {
            foo: 'bar'
          },
          name: 'file.txt',
          fileData: {
            originalFileUri: 'http://localhost:9000/myfile',
            size: 100
          },
          sourceData: {
            sourceId: 123
          }
        }
      };
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001',
          metadata: {
            foo: 'baz',
            sourceData: {
              sourceId: 1234
            }
          }
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001',
          source_id: '123',
          is_public: false,
          application_id: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001'
        }
      ]);
      const res = await dalAsset.updateAsset(mockUtil.makeContext(), args);
      expect(res).toBeTruthy();
    });

    it('should fail update if size limit exceeded', async function () {
      _.set(serviceContext, 'config.rateLimit.maxAssetMetadataSize', '20');

      const args = {
        input: {
          id: '1200001_abcd',
          details: {
            foo: '123456789011111111114234253423453245236456'
          }
        }
      };
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001',
          metadata: {
            foo: 'baz',
            sourceData: {
              sourceId: 1234
            }
          }
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001',
          source_id: '123',
          is_public: false,
          application_id: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001'
        }
      ]);
      const res = await dalAsset.updateAsset(mockUtil.makeContext(), args);
      expect(res).toBeTruthy();
    });
  });

  describe('asset audit events', function () {
    const virtualAssetId = require('../util.js')(
      serviceContext
    ).getFakeMediaAssetId({ id: '1200001' });

    function findAuditEvent(messages, eventName) {
      return _.find(messages, (m) => _.get(m, 'event') === eventName);
    }

    function pushUpdateAssetRows(metadata) {
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001',
          content_type: 'text/plain',
          metadata: metadata
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001',
          source_id: '123',
          is_public: false,
          application_id: appId
        }
      ]);
      coreDbRead._push([
        {
          id: '1200001_abcd',
          container_id: '1200001'
        }
      ]);
    }

    beforeEach(() => {
      // the top-level resetAllMocks clears this; deleteAsset needs it back
      mockGetDeletableUris.mockImplementation(async (uri) => ({
        primaryUri: uri,
        fallbackUri: null
      }));
      serviceContext.messageUtil._clearCounter();
    });

    // mirrors the push sequence of '#deleteAsset > should delete content in our
    // bucket' (the TDO is read twice), with a fileName on the asset metadata
    function pushDeleteAssetRows() {
      const tdoRow = {
        id: '12300001',
        json: {
          hasPrimary: false,
          mediaAsset: { assetId: '12300001_abcd2' },
          transcriptAsset: { assetId: '12300001_abcd3' }
        },
        applicationId: appId
      };
      coreDbRead._push([
        {
          id: '12300001_abcd1',
          container_id: '1230001',
          uri:
            'https://testBucket.s3.amazonaws.com/test/12345/6862bfd5-3b88-4cc1-8974-e638a7716529.mp4',
          user_edited: false,
          type: 'media',
          content_type: 'video/mp4',
          metadata: { fileName: 'my-video.mp4' }
        }
      ]);
      coreDbRead._push([tdoRow]);
      coreDbRead._push([tdoRow]);
      coreDbRead._push([]);
      coreDbRead._push([], false); // metadata to check for cloned asset
      ssoDbRead._push([{ id: 7682 }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 7683, name: 'default org', kvp: {} }],
        false
      );
      mediaDbRead._push([{ organization_id: 7682 }]);
    }

    it('emits an asset_delete audit event naming the file on a successful delete', async function () {
      pushDeleteAssetRows();

      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      const audit = findAuditEvent(
        serviceContext.messageUtil._messages(),
        'asset_delete'
      );
      expect(audit).toBeTruthy();
      expect(audit.actionInfo).toMatchObject({
        actionName: 'delete',
        actionResult: 'success',
        actionDetails: 'Deleted file my-video.mp4',
        targetId: '12300001_abcd1'
      });
      expect(audit.success).toBe(true);
    });

    it('keeps the public asset_deleted event alongside the asset_delete audit event', async function () {
      pushDeleteAssetRows();

      await dalAsset.deleteAsset(mockUtil.makeContext(), {
        id: '12300001_abcd1'
      });

      // external subscribers still bind to asset_deleted; adding the audit event
      // must not take that event away from them
      const messages = serviceContext.messageUtil._messages();
      expect(findAuditEvent(messages, 'asset_deleted')).toBeTruthy();
      expect(findAuditEvent(messages, 'asset_delete')).toBeTruthy();
    });

    it('emits an asset_update audit event naming the file on a successful update', async function () {
      pushUpdateAssetRows({ foo: 'baz' });

      await dalAsset.updateAsset(mockUtil.makeContext(), {
        input: { id: '1200001_abcd', name: 'quarterly-report.txt' }
      });

      const audit = findAuditEvent(
        serviceContext.messageUtil._messages(),
        'asset_update'
      );
      expect(audit).toBeTruthy();
      expect(audit.actionInfo).toMatchObject({
        actionName: 'update',
        actionResult: 'success',
        actionDetails: 'Updated file quarterly-report.txt',
        targetId: '1200001_abcd'
      });
      expect(audit.success).toBe(true);
    });

    it('does not let a message-bus failure on the audit publish propagate out of updateAsset (VE-27857 row 17)', async function () {
      pushUpdateAssetRows({ foo: 'baz' });
      const errorSpy = jest
        .spyOn(serviceContext.logger, 'error')
        .mockImplementation();
      const emitPublicEventSpy = jest
        .spyOn(serviceContext.messageUtil, 'emitPublicEvent')
        // the AssetUpdated public event (emitted before the audit event) succeeds;
        // 'asset_updated' is still recorded independently via the preceding emitEvent() call
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          // the asset_update audit event's own emitPublicEvent call fails
          throw new Error('nsq unavailable');
        });

      const res = await dalAsset.updateAsset(mockUtil.makeContext(), {
        input: { id: '1200001_abcd', name: 'quarterly-report.txt' }
      });

      expect(res).toBeTruthy();
      expect(errorSpy).toHaveBeenCalledWith(
        'failed to publish event: AssetUpdate',
        expect.any(Error)
      );
      // the audit event itself never made it into the message log - only the
      // earlier public AssetUpdated event did
      expect(
        findAuditEvent(serviceContext.messageUtil._messages(), 'asset_update')
      ).toBeUndefined();
      expect(
        findAuditEvent(serviceContext.messageUtil._messages(), 'asset_updated')
      ).toBeTruthy();

      emitPublicEventSpy.mockRestore();
      errorSpy.mockRestore();
    });

    // the asset id is used bare - no extension is synthesised from contentType,
    // because metadata.fileName itself carries one only when the caller set it
    it('falls back to the asset id when the asset has no fileName', async function () {
      pushUpdateAssetRows({ foo: 'baz' });

      await dalAsset.updateAsset(mockUtil.makeContext(), {
        input: { id: '1200001_abcd', description: 'no name supplied' }
      });

      const audit = findAuditEvent(
        serviceContext.messageUtil._messages(),
        'asset_update'
      );
      expect(audit.actionInfo.actionDetails).toEqual(
        'Updated file 1200001_abcd'
      );
    });

    it('does not emit an asset_update audit event for a no-op update', async function () {
      // metadata resolves falsy => updateAsset returns early without writing
      pushUpdateAssetRows(null);

      await dalAsset.updateAsset(mockUtil.makeContext(), {
        input: { id: '1200001_abcd' }
      });

      expect(
        findAuditEvent(serviceContext.messageUtil._messages(), 'asset_update')
      ).toBeUndefined();
    });

    it('emits a failure asset_update audit event and still rethrows the original error', async function () {
      await expect(
        dalAsset.updateAsset(mockUtil.makeContext(), {
          input: { id: virtualAssetId }
        })
      ).rejects.toThrow();

      const audit = findAuditEvent(
        serviceContext.messageUtil._messages(),
        'asset_update'
      );
      expect(audit).toBeTruthy();
      expect(audit.actionInfo).toMatchObject({
        actionName: 'update',
        actionResult: 'failure',
        actionDetails: `Failed to update file ${virtualAssetId}`
      });
      expect(audit.actionInfo.error).toBeTruthy();
      expect(audit.success).toBe(false);
    });

    it('emits a failure asset_delete audit event and still rethrows the original error', async function () {
      await expect(
        dalAsset.deleteAsset(mockUtil.makeContext(), {
          id: virtualAssetId
        })
      ).rejects.toThrow();

      const audit = findAuditEvent(
        serviceContext.messageUtil._messages(),
        'asset_delete'
      );
      expect(audit).toBeTruthy();
      expect(audit.actionInfo).toMatchObject({
        actionName: 'delete',
        actionResult: 'failure',
        actionDetails: `Failed to delete file ${virtualAssetId}`
      });
      expect(audit.success).toBe(false);
    });
  });

  describe('#createAsset 1', function () {
    const tdo = {
      id: '12300005',
      applicationId: appId,
      jsondata: {
        veritonePermissions: {
          isPublic: true,
          acls: [
            {
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              permission: 'owner'
            }
          ]
        }
      }
    };
    const input = {
      uri: 'http://localhost:3000',
      assetType: 'media',
      contentType: 'video/mp4',
      details: {
        foo: '1234567890'
      },
      containerId: tdo.id
    };
    const args = {
      input,
      organizationId: '7682',
      applicationId: appId,
      applicationIds: [appId]
    };
    it('should check ACL group', async function () {
      const tempServiceContext = require('../test/serviceContext.mock.js')();
      // spoof the expected DB returns
      tempServiceContext.dbConnections['core'].read._push([tdo], false);
      tempServiceContext.dbConnections['sso'].read._push([{ id: '7356' }]);
      tempServiceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      tempServiceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7356,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );
      tempServiceContext.dbConnections['core'].read._push([{ count: 1 }]);
      tempServiceContext.dbConnections['core'].write._push([
        {
          asset_id: 'dne',
          recording_id: 'dne',
          metadata: null,
          type: 'dne',
          content_type: 'dne',
          uri: 'https://dne',
          user_edited: false
        }
      ]);
      tempServiceContext.dbConnections['media_platform'].write._push([{}]);

      const tempDal = require('./asset.js')(tempServiceContext);
      const context = mockUtil.makeContext();
      _.set(
        context,
        'requestContext.userInfo.groupId',
        'ea738f5b-9f52-45f3-8db8-3167bfd625fe'
      );
      await tempDal.createAsset(args, context, tdo);
      // check to see that the function consumed the expected DB results
      expect(
        tempServiceContext.dbConnections['core'].read._resultQueueSize()
      ).toEqual(0);
      expect(
        tempServiceContext.dbConnections['core'].write._resultQueueSize()
      ).toEqual(0);
      expect(
        tempServiceContext.dbConnections[
          'media_platform'
        ].read._resultQueueSize()
      ).toEqual(0);
      expect(
        tempServiceContext.dbConnections['sso'].read._resultQueueSize()
      ).toEqual(0);
      expect(tempServiceContext.messageUtil._messages()[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
  });

  describe('#resolveContentType', function () {
    it('should return explicit contentType when provided', function () {
      const result = dalAsset.resolveContentType({
        contentType: 'audio/wav',
        uri: 'https://example.com/file.mp4'
      });
      expect(result).toEqual('audio/wav');
    });

    it('should return file contentType when input contentType is missing', function () {
      const result = dalAsset.resolveContentType({
        file: { contentType: 'image/png' }
      });
      expect(result).toEqual('image/png');
    });

    it('should detect contentType from https URI extension', function () {
      const result = dalAsset.resolveContentType({
        uri: 'https://s3.amazonaws.com/bucket/file.mov'
      });
      expect(result).toEqual('video/quicktime');
    });

    it('should detect contentType from s3:// URI extension', function () {
      const result = dalAsset.resolveContentType({
        uri: 's3://bucket/path/data.json'
      });
      expect(result).toEqual('application/json');
    });

    it('should strip query params before detecting', function () {
      const result = dalAsset.resolveContentType({
        uri: 'https://cdn.example.com/media/clip.mp4?token=abc&expires=123'
      });
      expect(result).toEqual('video/mp4');
    });

    it('should return defaultContentType when URI has no recognizable extension', function () {
      const result = dalAsset.resolveContentType({
        uri: 'https://api.example.com/stream/12345',
        defaultContentType: 'video/mp4'
      });
      expect(result).toEqual('video/mp4');
    });

    it('should return undefined when URI has no extension and no defaultContentType', function () {
      const result = dalAsset.resolveContentType({
        uri: 'https://api.example.com/stream/12345'
      });
      expect(result).toBeUndefined();
    });

    it('should return defaultContentType when no uri, file, or contentType', function () {
      const result = dalAsset.resolveContentType({
        defaultContentType: 'video/mp4'
      });
      expect(result).toEqual('video/mp4');
    });

    it('should return undefined when nothing is provided', function () {
      const result = dalAsset.resolveContentType({});
      expect(result).toBeUndefined();
    });

    it('should prioritize contentType over file and URI', function () {
      const result = dalAsset.resolveContentType({
        contentType: 'text/plain',
        file: { contentType: 'image/png' },
        uri: 'https://example.com/file.mp4'
      });
      expect(result).toEqual('text/plain');
    });
  });

  describe('#createAssetAuthorized', function () {
    it('should fail if metadata limit exceeded', async function () {
      _.set(serviceContext, 'config.rateLimit.maxAssetMetadataSize', '20');
      const tdo = {
        id: '12300005',
        applicationId: appId
      };
      const input = {
        uri: 'http://localhost:3000',
        assetType: 'media',
        contentType: 'video/mp4',
        details: {
          foo: '123456789011111111114234253423453245236456'
        }
      };
      // return default max asset count on TDO
      coreDbRead._push([{ count: 100 }]);
      coreDbWrite._push([{ containerId: '12300005', id: '12300005_abcd7' }]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7682,
            name: 'default org'
          }
        ],
        false
      );
      try {
        const res = await dalAsset.createAssetAuthorized(input, {}, tdo);
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toMatch(/maximum\sallowed/i);
      }
    });
    it('should upload asset', async function () {
      const testContent = '111111111111111';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'audio/mp3',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          // verify that URL was set on the mock response correctly
          if (!vars[5]) throw new Error('no URL in vars[5]');
          const now = moment();
          if (
            !vars[5].startsWith(
              `https://testbucket.s3.amazonaws.com/7682/asset/${now.year()}/${now.month()}/${now.day()}/12345/12345`
            )
          )
            throw new Error('url not set on vars[5] ' + vars);
          if (!vars[5].endsWith('.mp3'))
            throw new Error('wrong extension on vars[5] ' + vars);
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          file: {
            contentType: 'audio/mp3',
            size: testContent.length,
            inputStream: new MockStream({ value: testContent })
          },
          __skipAssetCountCheck: true
        },
        serviceContext,
        {
          id: '12345'
        }
      );
      expect(
        serviceContext.dal.dalStorage.putObjectTaggingPromise
      ).toHaveBeenCalled();
      expect(res).toBeDefined();
      expect(serviceContext.messageUtil._messages()[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });

    it('should upload asset - with tdo has addToIndex', async function () {
      const testContent = '111111111111111';
      serviceContext.dbConnections['core'].read._push([
        {
          asset_id: '',
          recording_id: '12345',
          metadata: {},
          type: 'media',
          content_type: 'audio/mp3',
          uri: '',
          user_edited: false
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          id: '7682'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          file: {
            contentType: 'audio/mp3',
            size: testContent.length,
            inputStream: new MockStream({ value: testContent })
          },
          __skipAssetCountCheck: true
        },
        serviceContext,
        {
          id: '12345',
          jsondata: {
            addToIndex: true
          }
        }
      );

      const messArray = serviceContext.messageUtil._messages();
      expect(res).toBeTruthy();
      // 2 messages for 1 assets uploaded (include public message)
      expect(serviceContext.messageUtil._counter()).toEqual(2);
      _.forEach(messArray, (mess) => {
        expect(mess.addToIndex).toEqual(true);
      });
    });

    it('should create mock asset', async function () {
      // turn off warn only so that we can check for error that shouldn't happen
      _.set(
        serviceContext,
        'config.featureFlags.maxTDOAssetLimitWarnOnly',
        false
      );

      const tdo = {
        id: '12300005',
        applicationId: 'a4fa5950-c3b4-47eb-9808-10ed295d2696'
      };
      const input = {
        uri: 'http://localhost:3000',
        assetType: 'media',
        contentType: 'video/mp4',
        details: {
          foo: '1234567890'
        },
        organizationId: 7682
      };
      serviceContext.dbConnections['sso'].write._push([{ id: 7683 }]);

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7683,
            name: 'default org',
            // set a TDO limit override for org
            kvp: {
              features: {
                tdoLimits: {
                  maxAssetCount: 101
                }
              }
            }
          }
        ],
        false
      );

      // return default max asset count on TDO
      coreDbRead._push([{ count: 100 }]);
      // insert asset data
      coreDbWrite._push(
        [{ containerId: '12300005', id: '12300005_abcd7' }],
        true,
        [],
        (sql, vars) => {
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      const context = _.set(
        serviceContext,
        'requestContext.userInfo.userName',
        'user@local.com'
      );
      const res = await dalAsset.createAssetAuthorized(input, context, tdo);
      expect(res).toBeTruthy();
      expect(serviceContext.messageUtil._messages()[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success',
          actionDetails: expect.stringMatching(
            /^Uploaded file .*\.mp4 successfully$/
          )
        })
      );
      // public and system events
      expect(serviceContext.messageUtil._counter()).toEqual(2);

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // redis cache asset count incr
      // expect(serviceContext.redisClient._counter()).toEqual(3);
    });
    it('should fail if default tdo asset max exceeded', async function () {
      _.set(
        serviceContext,
        'config.featureFlags.maxTDOAssetLimitWarnOnly',
        false
      );
      const tdo = {
        id: '12300005',
        applicationId: appId
      };
      const input = {
        uri: 'http://localhost:3000',
        assetType: 'media',
        contentType: 'video/mp4'
      };
      coreDbRead._push([{ count: 200 }]);
      coreDbWrite._push([{ containerId: '12300005', id: '12300005_abcd7' }]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7682,
            name: 'default org',
            kvp: {
              features: {}
            }
          }
        ],
        false
      );
      try {
        await dalAsset.createAssetAuthorized(
          input,
          mockUtil.makeContext(),
          tdo
        );
        expect.fail('error not thrown on too many assets');
      } catch (err) {
        expect(err.name).toEqual('object_limit_exceeded');
      }

      // public event on failure
      expect(serviceContext.messageUtil._counter()).toEqual(1);
      expect(serviceContext.messageUtil._messages()[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // redis cache asset count incr
      // expect(serviceContext.redisClient._counter()).toEqual(2);
    });

    it('should use file contentType when input contentType is not provided', async function () {
      const testContent = 'test-file-content';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'application/json',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          // verify content type is the file's detected type, not video/mp4
          expect(vars[4]).toEqual('application/json');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          file: {
            contentType: 'application/json',
            size: testContent.length,
            inputStream: new MockStream({ value: testContent })
          },
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('application/json');
    });

    it('should detect contentType from URI extension when not provided', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'video/mp4',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          // content type should be detected from URI extension
          expect(vars[4]).toEqual('video/mp4');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          uri: 'https://s3.amazonaws.com/bucket/video-file.mp4',
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('video/mp4');
    });

    it('should detect contentType from s3:// URI extension', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'application/json',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          expect(vars[4]).toEqual('application/json');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          uri: 's3://test-bucket/path/to/metadata.json',
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('application/json');
    });

    it('should detect contentType from signed URL ignoring query params', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'video/mp4',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          expect(vars[4]).toEqual('video/mp4');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          uri: 'https://bucket.s3.amazonaws.com/video.mp4?X-Amz-Signature=abc123&X-Amz-Expires=3600',
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('video/mp4');
    });
    
    it('should strip query parameters from our signed asset URI before persisting', async function () {
      const signedUri =
        'https://testBucket.s3.amazonaws.com/video.mp4?X-Amz-Signature=abc123&X-Amz-Expires=3600';
      const expectedUri = 'https://testBucket.s3.amazonaws.com/video.mp4';

      serviceContext.dbConnections['core'].write._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'video/mp4',
            uri: expectedUri,
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          expect(vars[5]).toEqual(expectedUri);
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          uri: signedUri,
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );

      expect(res).toBeDefined();
      expect(res.uri).toEqual(expectedUri);
    });

    it('should fallback to video/mp4 when URI has no recognizable extension', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'video/mp4',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          // should fallback to video/mp4 for backward compatibility
          expect(vars[4]).toEqual('video/mp4');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          uri: 'https://api.example.com/stream/12345',
          defaultContentType: 'video/mp4',
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('video/mp4');
    });

    it('should prefer explicit contentType over file contentType', async function () {
      const testContent = 'test-file-content';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            asset_id: '12345_a123',
            recording_id: '12345',
            metadata: {},
            type: 'media',
            content_type: 'video/mp4',
            uri: '',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, vars) => {
          if (vars.length < 7)
            throw new Error('not enough sql vars:  ' + vars.length);
          // when contentType is explicitly passed, it takes priority
          expect(vars[4]).toEqual('video/mp4');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.createAssetAuthorized(
        {
          organizationId: 7682,
          assetType: 'media',
          containerId: '12345',
          // explicit contentType — this is what happened with the old schema
          // default "video/mp4", overriding the actual file type
          contentType: 'video/mp4',
          file: {
            contentType: 'application/json',
            size: testContent.length,
            inputStream: new MockStream({ value: testContent })
          },
          __skipAssetCountCheck: true
        },
        serviceContext,
        { id: '12345' }
      );
      expect(res).toBeDefined();
      expect(res.contentType).toEqual('video/mp4');
    });

    it('should warn only if default tdo asset max exceeded', async function () {
      _.set(
        serviceContext,
        'config.featureFlags.maxTDOAssetLimitWarnOnly',
        true
      );
      const tdo = {
        id: '12300005',
        applicationId: appId
      };
      const input = {
        uri: 'http://localhost:3000',
        assetType: 'media',
        contentType: 'video/mp4'
      };
      coreDbRead._push([{ count: 200 }]);
      coreDbWrite._push([{ containerId: '12300005', id: '12300005_abcd7' }]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 7682,
            name: 'default org',
            kvp: {
              features: {}
            }
          }
        ],
        false
      );
      try {
        await dalAsset.createAssetAuthorized(
          input,
          mockUtil.makeContext(),
          tdo
        );
      } catch (err) {
        expect.fail('should not have thrown on warn only mode');
      }
      // public and system events + warning event
      expect(serviceContext.messageUtil._counter()).toEqual(3);

      // Skipped. See https://github.com/veritone/aiware-core/issues/345.
      // redis cache asset count incr
      // expect(serviceContext.redisClient._counter()).toEqual(3);
    });
  });

  describe('#uploadEngineResult', function () {
    it('should error if both isAccumulatedResult and setTaskOutput are set', async function () {
      try {
        const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
          input: {
            taskId: mockUtil.toTaskId('t124'),
            assetType: 'vtn-standard',
            contentType: 'application/json',
            uri: 'http://localhost/2',
            clientTimestamp: moment().valueOf(),
            isAccumulatedResult: true,
            setTaskOutput: true
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should error if isAccumulatedResult is set without uri', async function () {
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t124'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j124'),
          engine_id: 'e1255'
        }
      ]); // get task
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j124');
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '124' }]); // get job
      coreDbRead._push([{ id: '124' }]); // get tdo
      coreDbRead._push([{ id: 'e1255', name: 'test engine' }]); // get engine

      try {
        const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
          input: {
            taskId: mockUtil.toTaskId('t124'),
            assetType: 'vtn-standard',
            contentType: 'application/json',
            clientTimestamp: moment().valueOf(),
            isAccumulatedResult: true,
            output: { foo: 'bar' }
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should error if called with no file or uri', async function () {
      try {
        const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
          input: {
            taskId: mockUtil.toTaskId('t124'),
            assetType: 'vtn-standard',
            contentType: 'application/json',
            clientTimestamp: moment().valueOf()
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    /**

    it('should handle accumulated result with no existing asset', async function() {
      serviceContext._clearAll();
      const newCt = moment('2019-04-19T15:49:42.947Z');
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t124'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j124'),
          engine_id: 'e125'
        }
      ]); // get task
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '124' }]); // get job
      coreDbRead._push([{ id: '124' }]); // get TDO
      coreDbRead._push([{ id: 'e125', name: 'test engine' }]); // get engine
      coreDbRead._push([], false); // the existing asset - none
      ssoDbRead._push([{ id: 7682 }], false); // org
      coreDbRead._push([{ count: 2 }]); // existing asset count
      coreDbRead._push([]); // asset column on engine table (empty)
      coreDbWrite._push(
        [
          {
            asset_id: '124_a1',
            recording_id: '124',
            metadata: {
              uploadTimestamp: newCt.toISOString()
            },
            uri: 'http://localhost:3000/2',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, values) =>
          values.includes('vtn-standard') && values.includes('application/json')
      );
      // new asset created. verifies default asset and content type
      nock('http://localhost:3000').get('/2').reply(200, {});
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t124'),
          //assetType: 'vtn-standard',
          //contentType: 'application/json',
          uri: 'http://localhost:3000/2',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('124_a1');
      expect(res.uri).toEqual('http://localhost:3000/2');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });
*/
    it('should handle accumulated result with no existing asset', async function () {
      const newCt = moment('2019-04-19T15:49:42.947Z');
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t124'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j124'),
          engine_id: 'e125'
        }
      ]); // get task

      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j124');
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '124' }]); // get job
      coreDbRead._push([{ id: '124' }]); // get TDO
      coreDbRead._push([{ id: 'e125', name: 'test engine' }]); // get engine
      coreDbRead._push([], false); // the existing asset - none
      ssoDbRead._push([{ id: 7682 }], false); // org
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      coreDbRead._push([{ count: 2 }]); // existing asset count
      coreDbRead._push([]); // asset column on engine table (empty)
      coreDbWrite._push(
        [
          {
            asset_id: '124_a1',
            recording_id: '124',
            metadata: {
              uploadTimestamp: newCt.toISOString()
            },
            uri: 'http://localhost:3000/2',
            user_edited: false
          }
        ],
        true,
        [],
        (sql, values) =>
          values.includes('vtn-standard') && values.includes('application/json')
      );
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      serviceContext.dbConnections['media_platform'].write._push([{}], false);
      // new asset created. verifies default asset and content type
      nock('http://localhost:3000').get('/2').reply(200, {});
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t124'),
          //assetType: 'vtn-standard',
          //contentType: 'application/json',
          uri: 'http://localhost:3000/2',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('124_a1');
      expect(res.uri).toEqual('http://localhost:3000/2');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });

    it('strips the signed-URL signature before UPDATE when an accumulated result already exists [security-coverage]', async function () {
      const newCt = moment('2020-01-01T00:00:00.000Z');
      const signedUri =
        'https://testBucket.s3.amazonaws.com/result.json?X-Amz-Signature=abc123&X-Amz-Expires=3600';
      const expectedUri = 'https://testBucket.s3.amazonaws.com/result.json';

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t124'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j124'),
          engine_id: 'e125'
        }
      ]); // get task
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j124');
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '124' }]); // get job
      coreDbRead._push([{ id: '124' }]); // get TDO
      coreDbRead._push([{ id: 'e125', name: 'test engine' }]); // get engine
      coreDbRead._push([
        {
          asset_id: '124_a1',
          recording_id: '124',
          metadata: {},
          type: 'media',
          content_type: 'application/json',
          uri: 'http://localhost:3000/old',
          user_edited: false
        }
      ]); // existing accumulated asset found -> update path

      coreDbWrite._push(
        [
          {
            asset_id: '124_a1',
            recording_id: '124',
            metadata: { uploadTimestamp: newCt.toISOString() },
            uri: expectedUri,
            user_edited: false
          }
        ],
        true,
        [],
        // updateExistingAccumulatedResult: `UPDATE ... SET uri = $1 ...` — the first
        // bound param must be the canonical (stripped) URI, not the raw signed one.
        (sql, values) => {
          expect(values[0]).toEqual(expectedUri);
          return true;
        }
      );

      // post-update: uploadEngineResult resolves addToIndex via getDefaultAddToIndexForOrg(org)
      serviceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t124'),
          uri: signedUri,
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });

      expect(res.uri).toEqual(expectedUri);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });

    it('should handle non-accumulated result with no existing asset, setting non-json task output', async function () {
      jest.setTimeout(15000);
      const newCt = moment('2019-04-19T15:49:42.947Z');

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t1245'),
          recording_id: null,
          job_id: 'j1245',
          engine_id: 'e12566'
        }
      ]); // get task
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j124');
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '1245' }]); // get job

      coreDbRead._push([
        {
          id: '124',
          json: {
            transcriptAsset: {},
            mediaAsset: { assetId: '124_a6' }
          }
        }
      ]); // get TDO
      coreDbRead._push([{ id: 'e12566' }]); // get engine
      ssoDbRead._push([{ id: 7682 }], false); // org
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      coreDbRead._push([{ count: 2 }]); // existing asset count
      coreDbRead._push([]); // asset column on engine table (empty)
      coreDbWrite._push(
        [
          {
            asset_id: '1245_a1',
            recording_id: '1245',
            metadata: {
              uploadTimestamp: newCt.toISOString()
            },
            uri: 'http://localhost:3000/4',
            user_edited: false,
            asset_type: 'transcript',
            content_type: 'application/json'
          }
        ],
        true,
        [],
        (sql, values) =>
          values.includes('transcript') && values.includes('application/json')
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      // new asset created. verifies default asset and content type
      // coreDbWrite._push([
      //   {
      //     id: 'job1245_task1',
      //     job_id: 'job1245',
      //     task_output: { foo: 'bar' }
      //   }
      // ]);

      // TDO
      coreDbRead._push([
        {
          id: '124',
          json: {
            transcriptAsset: {},
            mediaAsset: { assetId: '124_a6' }
          }
        }
      ]);
      // updates TDO primary asset
      coreDbWrite._push([
        {
          id: '1245',
          application_id: appId
        }
      ]);
      // media db mirror
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '1245'
        }
      ]);

      // get org from app
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);

      // mock out getting asset content
      nock('http://localhost:3000').get('/4').reply(200, 'NOT JSON');
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t1245'),
          //assetType: 'vtn-standard',
          //contentType: 'application/json',
          uri: 'http://localhost:3000/4',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: false,
          setTaskOutput: false,
          assetType: 'transcript',
          contentType: 'application/json',
          setAsPrimary: true
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('1245_a1');
      expect(res.uri).toEqual('http://localhost:3000/4');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
      expect(serviceContext.messageUtil._counter()).toEqual(8);
    });

    it('should handle non-accumulated result with no existing asset, setting over-large non-json task output', async function () {
      const newCt = moment('2019-04-19T15:49:42.947Z');

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t1245'),
          recording_id: null,
          job_id: 'j1245',
          engine_id: 'e12567'
        }
      ]); // get task

      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j124');
      coreDbRead._push([{ id: mockUtil.toTaskId('j124'), target_id: '1245' }]); // get job

      coreDbRead._push([
        {
          id: '124',
          json: {
            transcriptAsset: {},
            mediaAsset: { assetId: '124_a6' }
          }
        }
      ]); // get TDO
      coreDbRead._push([{ id: 'e12567' }]); // get engine
      ssoDbRead._push([{ id: 7682 }], false); // org
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      coreDbRead._push([{ count: 2 }]); // existing asset count
      coreDbRead._push([]); // asset column on engine table (empty)
      coreDbWrite._push(
        [
          {
            asset_id: '1245_a1',
            recording_id: '1245',
            metadata: {
              uploadTimestamp: newCt.toISOString()
            },
            uri: 'http://localhost:3000/5',
            user_edited: false,
            asset_type: 'transcript',
            content_type: 'application/json'
          }
        ],
        true,
        [],
        (sql, values) =>
          values.includes('transcript') && values.includes('application/json')
      );

      // updates latest asset timestamp for the org
      serviceContext.dbConnections['media_platform'].write._push([{}], false);

      // TDO
      coreDbRead._push([
        {
          id: '124',
          json: {
            transcriptAsset: {},
            mediaAsset: { assetId: '124_a6' }
          }
        }
      ]);
      // updates TDO primary asset
      coreDbWrite._push([
        {
          id: '1245',
          application_id: appId
        }
      ]);

      // no other core db calls -- we don't update the task here due to over-large asset size.

      // new asset created. verifies default asset and content type
      // media db mirror
      serviceContext.dbConnections['media_platform'].write._push([
        {
          media_id: '1245'
        }
      ]);

      // get org from app
      serviceContext.dbConnections['sso'].read._push([{ id: '7682' }]);

      // mock out getting asset content
      nock('http://localhost:3000')
        .get('/5')
        .reply(200, _.pad('NOT JSON', 100));
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t1245'),
          //assetType: 'vtn-standard',
          //contentType: 'application/json',
          uri: 'http://localhost:3000/5',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: false,
          setTaskOutput: false,
          assetType: 'transcript',
          contentType: 'application/json',
          setAsPrimary: true
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('1245_a1');
      expect(res.uri).toEqual('http://localhost:3000/5');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
      expect(serviceContext.messageUtil._counter()).toEqual(8);
    });

    it('should handle accumulated result with old client timestamp and existing asset', async function () {
      const newCt = moment('2019-04-19T15:49:42.947Z');
      const oldCt = moment('2019-04-19T15:50:42.947Z'); // + 1 min

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: '123',
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]); // get task
      coreDbRead._push([{ id: '123' }]); // get TDO
      coreDbRead._push([{ id: 'e123', name: 'test engine' }]); // get engine
      coreDbRead._push(
        [
          {
            id: '123_a1',
            uri: 'http://localhost/1',
            content_type: 'application/json',
            asset_type: 'vtn-standard',
            container_id: '123',
            metadata: {
              uploadTimestamp: oldCt.toISOString(),
              details: {
                foo: 'bar'
              }
            }
          }
        ],
        false
      ); // the existing asset
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t123'),
          assetType: 'vtn-standard',
          contentType: 'application/json',
          uri: 'http://localhost/2',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('123_a1');
      expect(res.uri).toEqual('http://localhost/1');
      expect(res.metadata.uploadTimestamp).toEqual(oldCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });
    it('should handle accumulated result with new client timestamp and existing asset.', async function () {
      const newCt = moment('2019-04-19T15:49:42.947Z');
      const oldCt = moment('2019-04-19T15:48:42.947Z'); // - 1 min
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e124'
        }
      ]); // get task
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j123');
      coreDbRead._push([{ id: mockUtil.toTaskId('j123'), target_id: '123' }]); // get job
      coreDbRead._push([{ id: '123' }]); // get TDO

      coreDbRead._push([{ id: 'e124', name: 'test engine' }]); // get engine
      coreDbRead._push(
        [
          {
            id: '123_a1',
            uri: 'http://localhost/1',
            content_type: 'application/json',
            asset_type: 'vtn-standard',
            container_id: '123',
            metadata: {
              uploadTimestamp: oldCt.toISOString(),
              details: {
                foo: 'bar'
              }
            }
          }
        ],
        false
      ); // the existing asset

      coreDbWrite._push(
        [
          {
            id: '123_a1',
            uri: 'http://localhost/2',
            metadata: {
              uploadTimestamp: newCt.toISOString(),
              details: {
                foo: 'bar'
              }
            }
          }
        ],
        true,
        ['metadata'],
        (sql, values) => {
          // require that the $2 value have client timestamp
          function failed(str) {
            return false;
          }
          if (!values[1].includes('uploadTimestamp'))
            return failed(values[1] + ' does not include uploadTimestamp');
          if (!values[1].includes(newCt.toISOString()))
            return failed(
              values[1] + ' does not include ' + newCt.toISOString()
            );
          // validate other query update fields
          if (values[0] !== 'http://localhost/2')
            return failed(values[0] + ' is not http://localhost/2');
          if (values[2] !== '123_a1')
            return failed(values[2] + ' is not 123_a1');
          if (values[3] !== '123') return failed(values[3] + ' is not 123');
          return true;
        }
      ); // the update

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t123'),
          assetType: 'vtn-standard',
          contentType: 'application/json',
          uri: 'http://localhost/2',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('123_a1');
      expect(res.uri).toEqual('http://localhost/2');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });

    it('should handle accumulated result with new client timestamp and existing asset and status update', async function () {
      const newCt = moment('2019-04-19T15:49:42.947Z');
      const oldCt = moment('2019-04-19T15:48:42.947Z'); // - 1 min

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t126'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j126'),
          engine_id: 'e126'
        }
      ]); // get task
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j126');
      coreDbRead._push([{ id: mockUtil.toTaskId('j126'), target_id: '126' }]); // get job
      coreDbRead._push([{ id: '126' }]); // get TDO
      coreDbRead._push([{ id: 'e126', name: 'test engine' }]); // get engine
      coreDbRead._push(
        [
          {
            id: '126_a1',
            uri: 'http://localhost/1',
            content_type: 'application/json',
            asset_type: 'vtn-standard',
            container_id: '126',
            metadata: {
              uploadTimestamp: oldCt.toISOString(),
              details: {
                foo: 'bar'
              }
            }
          }
        ],
        false,
        [],
        (sql, values) =>
          JSON.stringify(values).includes(mockUtil.toTaskId('t126'))
      ); // the existing asset

      coreDbWrite._push(
        [
          {
            id: '126_a1',
            uri: 'http://localhost/2',
            metadata: {
              uploadTimestamp: newCt.toISOString(),
              details: {
                foo: 'bar'
              }
            }
          }
        ],
        true,
        ['metadata'],
        (sql, values) => {
          // require that the $2 value have client timestamp
          function failed(str) {
            return false;
          }
          if (!values[1].includes('uploadTimestamp'))
            return failed(values[1] + ' does not include uploadTimestamp');
          if (!values[1].includes(newCt.toISOString()))
            return failed(
              values[1] + ' does not include ' + newCt.toISOString()
            );
          // validate other query update fields
          if (values[0] !== 'http://localhost/2')
            return failed(values[0] + ' is not http://localhost/2');
          if (values[2] !== '126_a1')
            return failed(values[2] + ' is not 126_a1');
          if (values[3] !== '126') return failed(values[3] + ' is not 126');
          return true;
        }
      ); // the update
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t126'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j126'),
          engine_id: 'e126',
          status: 'complete'
        },
        {
          id: 't127',
          job_id: mockUtil.toTaskId('j126'),
          recording_id: null,
          engine_id: 'e126_2',
          status: 'running'
        }
      ]); // current tasks on job
      // updateTaskAtomicallyByStatus
      serviceContext.dbConnections['core'].write._push([
        {
          job_id: mockUtil.toTaskId('j126'),
          task_id: 't126'
        }
      ]);
      coreDbWrite._push([{}]); // job status updated
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t126'),
          assetType: 'vtn-standard',
          contentType: 'application/json',
          uri: 'http://localhost/2',
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false,
          status: 'complete'
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('126_a1');
      expect(res.uri).toEqual('http://localhost/2');
      expect(res.metadata.uploadTimestamp).toEqual(newCt.toISOString());
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });

    it('should handle job with target TDO id on job only', async function () {
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]);
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j123');
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('j123'),
          target_id: '123'
        }
      ]);
      coreDbRead._push([
        {
          id: '123'
        }
      ]);
      coreDbRead._push([
        {
          id: 'e123',
          name: 'test engine'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([{ count: 0 }]);
      serviceContext.dbConnections['core'].read._push([
        { asset: undefined, other: 'stuff' }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'a132',
          container_id: '123',
          asset_type: 'media',
          content_type: 'video/mp4'
        }
      ]);

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);
      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t123'),
          assetType: 'media',
          contentType: 'video/mp4',
          uri: 'http://localhost'
        }
      });
      expect(res).toBeTruthy();
    });

    it('should handle job with target TDO id on task', async function () {
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: '123',
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]);
      coreDbRead._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([{ count: 0 }]);
      serviceContext.dbConnections['core'].read._push([{ asset: undefined }]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'a132',
          container_id: '123',
          asset_type: 'media',
          content_type: 'video/mp4'
        }
      ]);
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }], false);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { organization_id: 7682 }
      ]);

      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t123'),
          assetType: 'media',
          contentType: 'video/mp4',
          uri: 'http://localhost'
        }
      });
      expect(res).toBeTruthy();
    });

    it('should error on job with no TDO id', async function () {
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t123'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j123'),
          engine_id: 'e123'
        }
      ]);
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'job123');
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('j123'),
          target_id: null
        }
      ]);
      coreDbRead._push([
        {
          id: '123'
        }
      ]);

      try {
        await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
          input: {
            taskId: mockUtil.toTaskId('t123'),
            assetType: 'media',
            contentType: 'video/mp4',
            uri: 'http://localhost'
          }
        });
        expect.fail('did not throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });

    it('should strip signature from owned-storage URI before updating accumulated result', async function () {
      // VE-24504 (worker-psd-aqa): updateExistingAccumulatedResult was patched in VE-22317
      // to call stripOwnedStorageUrlSignature before writing uri — this test guards that regression.
      const newCt = moment('2019-04-19T15:49:42.947Z');
      const oldCt = moment('2019-04-19T15:48:42.947Z'); // -1 min: newCt > oldCt so update is allowed
      const signedUri =
        'https://testBucket.s3.amazonaws.com/video.mp4?X-Amz-Signature=abc123&X-Amz-Expires=3600';
      const expectedUri = 'https://testBucket.s3.amazonaws.com/video.mp4';

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('t129'),
          recording_id: null,
          job_id: mockUtil.toTaskId('j129'),
          engine_id: 'e129'
        }
      ]); // get task
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'j129');
      coreDbRead._push([{ id: mockUtil.toTaskId('j129'), target_id: '129' }]); // get job
      coreDbRead._push([{ id: '129' }]); // get TDO
      coreDbRead._push([{ id: 'e129', name: 'test engine' }]); // get engine
      coreDbRead._push(
        [
          {
            id: '129_a1',
            uri: expectedUri,
            content_type: 'application/json',
            asset_type: 'vtn-standard',
            container_id: '129',
            metadata: { uploadTimestamp: oldCt.toISOString() }
          }
        ],
        false
      ); // existing accumulated asset — triggers updateExistingAccumulatedResult

      coreDbWrite._push(
        [{ id: '129_a1', uri: expectedUri, metadata: { uploadTimestamp: newCt.toISOString() } }],
        true,
        ['SET uri'],
        (sql, values) => {
          // values[0] is normalizedUri — must be stripped, not the raw signed URL
          expect(values[0]).toEqual(expectedUri);
          expect(values[0]).not.toContain('X-Amz-Signature');
          return true;
        }
      );

      serviceContext.dbConnections['media_platform'].read._push([{ exists: true }]);
      serviceContext.dbConnections['media_platform'].read._push([{ organization_id: 7682 }]);

      const res = await dalAsset.uploadEngineResult(mockUtil.makeContext(), {
        input: {
          taskId: mockUtil.toTaskId('t129'),
          assetType: 'vtn-standard',
          contentType: 'application/json',
          uri: signedUri,
          clientTimestamp: newCt.valueOf(),
          isAccumulatedResult: true,
          setTaskOutput: false
        }
      });
      expect(res).toBeTruthy();
      expect(res.id).toEqual('129_a1');
      expect(res.uri).toEqual(expectedUri);
      expect(coreDbRead._resultQueueSize()).toEqual(0);
      expect(coreDbWrite._resultQueueSize()).toEqual(0);
    });
  });

  describe('#emitRecordingCognitionCompletedEvent', function () {
    it('should emit recording cognition completed event', async function () {
      try {
        await dalAsset.emitRecordingCognitionCompletedEvent(
          'assetId',
          'tdoId',
          'token',
          '7682',
          false
        );

        expect(serviceContext.messageUtil._counter()).toEqual(2);
        _.forEach(serviceContext.messageUtil._messages(), (mess) => {
          expect(mess.payload.addToIndex).toEqual(false);
        });
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });

    it('should omit the previous timespan when none is supplied', async function () {
      await dalAsset.emitRecordingCognitionCompletedEvent(
        'assetId',
        'tdoId',
        'token',
        '7682',
        false
      );

      _.forEach(serviceContext.messageUtil._messages(), (mess) => {
        expect(mess.payload).not.toHaveProperty('previousStartDateTime');
        expect(mess.payload).not.toHaveProperty('previousStopDateTime');
      });
    });

    it('should forward the previous timespan into the payload', async function () {
      await dalAsset.emitRecordingCognitionCompletedEvent(
        'assetId',
        'tdoId',
        'token',
        '7682',
        false,
        {
          previousTimes: {
            previousStartDateTime: 1785446581,
            previousStopDateTime: 1785447481
          }
        }
      );

      _.forEach(serviceContext.messageUtil._messages(), (mess) => {
        expect(mess.payload.previousStartDateTime).toEqual(1785446581);
        expect(mess.payload.previousStopDateTime).toEqual(1785447481);
      });
    });
  });

  describe('checkAssetTypeAndContentType', function () {
    it('should not throw error for new asset type', function () {
      serviceContext.logger.warn.mockClear();
      expect(() =>
        dalAsset.checkAssetTypeAndContentType('text/plain', '')
      ).not.toThrow();
      expect(serviceContext.logger.warn.mock.calls.length).toEqual(1);
    });

    it('should not throw error for media asset type', function () {
      serviceContext.logger.warn.mockClear();
      expect(() =>
        dalAsset.checkAssetTypeAndContentType('media', 'any-content-type')
      ).not.toThrow();
      expect(serviceContext.logger.warn.mock.calls.length).toEqual(0);
    });

    it('should throw error for invalid or unsupported content type', function () {
      serviceContext.logger.warn.mockClear();
      expect(() =>
        dalAsset.checkAssetTypeAndContentType('text', 'video/mp4')
      ).not.toThrow();
      expect(serviceContext.logger.warn.mock.calls.length).toEqual(1);
    });

    it('should not throw or log for valid asset type and content type', function () {
      serviceContext.logger.warn.mockClear();
      expect(() =>
        dalAsset.checkAssetTypeAndContentType('text', 'text/plain')
      ).not.toThrow();
      expect(serviceContext.logger.warn.mock.calls.length).toEqual(0);
    });
  });
  describe('setAssetStorageTags', function () {
    it('should set tag success', async function () {
      const s3Uri = 'https://s3.amazonaws.com/mybucket/key';
      const tags = [{ key: 'KEY_TEST', value: 'VALUE_TEST' }];
      const res = await dalAsset.setAssetStorageTags(s3Uri, tags);
      expect(
        serviceContext.dal.dalStorage.putObjectTaggingPromise
      ).toHaveBeenCalledWith(s3Uri, expect.arrayContaining(tags), undefined);

      expect(res.msg).toEqual(expect.any(String));
    });
  });

  describe('#validateRecordingAssetTablePartition', function () {
    it('should return true with no option', async function () {
      let err, res;
      try {
        res = await dalAsset.validateRecordingAssetTablePartition(moment.utc());
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toEqual(true);
      expect(
        serviceContext.app.dalPartitionGenerator.createRecordingAssetPartitions
      ).toHaveBeenCalled();
    });
    it('should return true if partitionName is within the last month', async function () {
      let err, res;
      try {
        const firstDayOfPartition = moment().utc().subtract(1, 'months');
        const weekOfYear = calculateIsoWeek(firstDayOfPartition);
        let tableName = `recording_asset_${firstDayOfPartition.format(
          'YYYY_MM'
        )}`;
        tableName += `_${_.padStart(weekOfYear, 2, '0')}`;
        res = await dalAsset.validateRecordingAssetTablePartition(
          moment.utc(),
          {
            partitionName: tableName
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toEqual(true);
      expect(
        serviceContext.app.dalPartitionGenerator.createRecordingAssetPartitions
      ).toHaveBeenCalled();
    });
    it('should return true if partitionName is within the newer', async function () {
      let err, res;
      try {
        const firstDayOfPartition = moment()
          .utc()
          .add(1, 'month')
          .startOf('isoWeek');
        const weekOfYear = calculateIsoWeek(firstDayOfPartition);
        let tableName = `recording_asset_${firstDayOfPartition.format(
          'YYYY_MM'
        )}`;
        tableName += `_${_.padStart(weekOfYear, 2, '0')}`;
        res = await dalAsset.validateRecordingAssetTablePartition(
          moment.utc(),
          {
            partitionName: tableName
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toEqual(true);
      expect(
        serviceContext.app.dalPartitionGenerator.createRecordingAssetPartitions
      ).toHaveBeenCalled();
    });
    it('should return false if partitionName is within the last 2 months', async function () {
      let err, res;
      try {
        const firstDayOfPartition = moment().utc().subtract(2, 'months');
        const weekOfYear = calculateIsoWeek(firstDayOfPartition);
        let tableName = `recording_asset_${firstDayOfPartition.format(
          'YYYY_MM'
        )}`;
        tableName += `_${_.padStart(weekOfYear, 2, '0')}`;
        res = await dalAsset.validateRecordingAssetTablePartition(
          moment.utc(),
          {
            partitionName: tableName
          }
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toEqual(false);
      expect(
        serviceContext.app.dalPartitionGenerator.createRecordingAssetPartitions
      ).not.toHaveBeenCalled();
    });
  });

  describe('#updateAssetUri', function () {
    it('should update the URI for an asset with a valid TDO-based ID', async function () {
      const assetId = '1200001_abcd';
      const newUri = 'https://primary-bucket.s3.us-west-2.amazonaws.com/org/asset/file.mp3';

      coreDbWrite._push(
        [{ asset_id: assetId, uri: newUri }],
        true,
        ['UPDATE', 'SET uri', 'WHERE asset_id', 'RETURNING asset_id', 'recording_id']
      );

      const res = await dalAsset.updateAssetUri(assetId, newUri);
      expect(res).toBeTruthy();
      expect(res.id).toEqual(assetId);
      expect(res.uri).toEqual(newUri);
    });

    it('should build SQL without recording_id clause when TDO cannot be extracted', async function () {
      // An asset ID that does not contain a valid TDO prefix
      const assetId = 'standalone-asset-id';
      const newUri = 'https://bucket.s3.us-east-1.amazonaws.com/asset/file.mp3';

      coreDbWrite._push(
        [{ asset_id: assetId, uri: newUri }],
        true,
        ['UPDATE', 'SET uri', 'WHERE asset_id', 'RETURNING asset_id']
      );

      const res = await dalAsset.updateAssetUri(assetId, newUri);
      expect(res).toBeTruthy();
      expect(res.id).toEqual(assetId);
      expect(res.uri).toEqual(newUri);
    });

    it('should strip query parameters from our signed asset URI before updating', async function () {
      const assetId = '1200001_abcd';
      const mockBucket =
        serviceContext.config.storage?.aws?.s3?.bucket ||
        serviceContext.config.storage?.bucket ||
        'testBucket';

      const signedUri = `https://${mockBucket}.s3.us-west-2.amazonaws.com/org/asset/file.mp3?X-Amz-Signature=abcdef123456&X-Amz-Expires=3600`;
      const expectedUri = `https://${mockBucket}.s3.us-west-2.amazonaws.com/org/asset/file.mp3`;

      coreDbWrite._push(
        [{ asset_id: assetId, uri: expectedUri }],
        true,
        ['UPDATE', 'SET uri', 'WHERE asset_id', 'RETURNING asset_id'],
        (sql, vars) => {
          expect(vars[1]).toEqual(expectedUri);
          expect(vars[1]).not.toContain('X-Amz-Signature');
          return true;
        }
      );

      const res = await dalAsset.updateAssetUri(assetId, signedUri);

      expect(res).toBeTruthy();
      expect(res.id).toEqual(assetId);
      expect(res.uri).toEqual(expectedUri);
    });

    it('should throw NotFound when no rows are returned (asset deleted or missing)', async function () {
      const assetId = '1200001_abcd';
      const newUri = 'https://primary-bucket.s3.us-west-2.amazonaws.com/org/asset/file.mp3';

      coreDbWrite._push([]);

      try {
        await dalAsset.updateAssetUri(assetId, newUri);
        fail('Expected updateAssetUri to throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.data.objectId).toEqual(assetId);
        expect(err.data.objectType).toEqual('Asset');
      }
    });

    it('should propagate database errors', async function () {
      const assetId = '1200001_abcd';
      const newUri = 'https://bucket.s3.us-west-2.amazonaws.com/asset/file.mp3';

      coreDbWrite._push(new Error('connection refused'));

      try {
        await dalAsset.updateAssetUri(assetId, newUri);
        fail('Expected updateAssetUri to throw');
      } catch (err) {
        expect(err.message).toContain('connection refused');
      }
    });
  });
});

describe('READ events', () => {
  const readEventsServiceContext = require('../test/serviceContext.mock.js')();
  readEventsServiceContext.messageUtil = {
    emitPublicEvent: jest.fn(),
    buildActionInfo: jest.fn(),
    emitReadAuditEvent: function(context, media, mediaType, error) {
      if (!media) return;
      if (!_.get(readEventsServiceContext, 'config.featureFlags.readAuditEvents')) return;
      const mediaArr = Array.isArray(media) ? media : [media];
      for (const _media of mediaArr) {
        const idString = (_media.id || _media.recording_id || _media.asset_id || _media.tracking_unit_id || 'n/a').toString();
        const name = _media.name || _.get(_media, 'metadata.fileName');
        readEventsServiceContext.messageUtil.emitPublicEvent(null, null, null, {
          serviceName: 'core-graphql-server',
          resourceType: mediaType,
          resourceId: idString,
          resourceName: name,
          actionInfo: readEventsServiceContext.messageUtil.buildActionInfo(
            idString, error, 'read',
            !error ? 'success' : 'failure',
            !error ? `Accessed media ${name || idString}` : `Failed to access ${name || idString} for reason: ${error.message}`
          )
        });
      }
    }
  };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const readEventsDalAsset = require('./asset.js')(readEventsServiceContext);
  let readContext;
  beforeEach(() => {
    readContext = mockUtil.makeContext();
    readEventsServiceContext.config.featureFlags.readAuditEvents = true;
  });
  it('should emit accessMedia read event when platform flag is enabled', async function () {
    readEventsServiceContext.dbConnections['core'].read._push([
      {
        id: '123abc',
        containerId: '777'
      }
    ]);
    readEventsServiceContext.dbConnections['core'].read._push([
      {
        id: '777'
      }
    ]);
    await readEventsDalAsset.getAsset(readContext, {
      id: '123abc'
    });
    expect(
      readEventsServiceContext.messageUtil.emitPublicEvent
    ).toHaveBeenCalled();
  });
  it('should emit accessMedia read event - getAssetList', async function () {
    mockEsSearch.mockResolvedValue({
      body: {
        hits: {
          hits: [
            {
              _id: '1200001_asset1',
              _source: { recordingId: '1200001' },
              sort: [1727405590000]
            },
            {
              _id: '1200001_asset2',
              _source: { recordingId: '1200001' },
              sort: [1727405323000]
            }
          ]
        }
      }
    });
    await readEventsDalAsset.getAssetList(readContext, {
      offset: 0,
      limit: 30,
      applicationId: '_app_id_',
      ids: ['a1', 'a2'],
      contentTypes: ['ct/1', 'ct/2'],
      assetTypes: ['v1', 'v2', 'v3'],
      sourceEngineIds: ['e1', 'e2', 'e3'],
      createdDateFilter: {
        fromDateTime: '2020-01-01T00:00:01Z',
        toDateTime: '2020-02-01T00:00:01Z',
        toDateTimeExclusive: true
      }
    });
    expect(mockEsSearch).toHaveBeenCalled();
    expect(
      readEventsServiceContext.messageUtil.emitPublicEvent
    ).toHaveBeenCalledTimes(2);
  });
});

function calculateIsoWeek(m) {
  const week = m.isoWeek();
  const month = m.month();
  if (month === 11 && week === 1) {
    const lastWeek = moment.utc(m).subtract(7, 'day').isoWeek();
    return lastWeek + 1;
  } else if (month === 0 && week > 50) {
    return 0;
  }
  return week;
}
