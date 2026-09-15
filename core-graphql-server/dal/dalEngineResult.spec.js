const chaiExpect = require('chai').expect; //require('expect.js');
const _ = require('lodash');
const moment = require('moment');
const engineId = 'b3fa5950-c3b4-47eb-9808-10ed295d2696';

jest.mock('../resolvers/util.js');
const rutil = require('../resolvers/util.js');
const fakeSeriesEngineAssetURI = 'http://localhost:3000/seriesOnlyAsset';
const fakeSeriesEngineAsset = {
  sourceEngineId: engineId,
  series: [
    {
      startTimeMs: 0,
      stopTimeMs: 1000,
      uri: 'http://localhost/1',
      sourceEngineId: engineId
    },
    {
      startTimeMs: 1001,
      stopTimeMs: 3000,
      uri: 'http://localhost/2',
      sourceEngineId: engineId
    },
    {
      startTimeMs: 400000,
      stopTimeMs: 420000,
      uri: 'http://localhost/3',
      sourceEngineId: engineId
    }
  ]
};
const fakeObjectEngineAssetURI = 'http://localhost:3000/objectOnlyAsset';
const fakeObjectEngineAsset = {
  sourceEngineId: engineId,
  sourceEngineName: 'Fake Document Extraction Engine',
  object: [
    {
      type: 'text',
      text: '11/26/2018 Conference Schedule',
      page: 0,
      paragraph: 0,
      sentence: 0
    },
    {
      type: 'text',
      text: 'Workshop: GANs for cat memes',
      page: 0,
      paragraph: 0,
      sentence: 1
    }
  ]
};
const fakeCorrelationEngineAsset1URI =
  'http://localhost:3000/correlationAsset/1';
const fakeCorrelationEngineAsset1 = {
  sourceEngineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
  sourceEngineName: 'Fake correlation engine',
  object: [
    {
      type: 'text',
      text: 'Fake correlation engine'
    }
  ]
};
const fakeCorrelationEngineAsset2URI =
  'http://localhost:3000/correlationAsset/2';
const fakeCorrelationEngineAsset2 = {
  sourceEngineId: 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0',
  sourceEngineName: 'another fake correlation engine',
  object: [
    {
      type: 'text',
      text: 'Another fake correlation engine'
    }
  ]
};

rutil.mockImplementation(() => {
  return {
    getSignedUrl: (uri, bucket, fn) => {
      if (bucket === 'face' && uri === 'https://s3.aws-dev.amazonaws.com') {
        return Promise.reject('throw error');
      }
      return Promise.resolve(uri);
    },
    download: (uri, context) => {
      if (uri === fakeObjectEngineAssetURI) {
        return Promise.resolve(JSON.stringify(fakeObjectEngineAsset));
      } else if (uri === fakeCorrelationEngineAsset1URI) {
        return Promise.resolve(JSON.stringify(fakeCorrelationEngineAsset1));
      } else if (uri === fakeCorrelationEngineAsset2URI) {
        return Promise.resolve(JSON.stringify(fakeCorrelationEngineAsset2));
      } else if (uri === fakeSeriesEngineAssetURI) {
        return Promise.resolve(JSON.stringify(fakeSeriesEngineAsset));
      } else {
        return Promise.resolve('error JSON');
      }
    },
    transformAsset: (context, uri = '', transformerFunc = '') => {
      if (transformerFunc === 'Transcript2JSON') {
        return Promise.resolve(
          JSON.stringify([
            {
              start: 2,
              end: 3
            }
          ])
        );
      } else {
        return Promise.resolve(JSON.stringify([fakeObjectEngineAsset]));
      }
    },
    isSuperAdmin: (userInfo) => {
      return false;
    }
  };
});

const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);
function overrideBucket(context, key, func) {
  const bucket = _.get(context, 'config.s3.buckets', []).find(
    (x) => x.key === key
  );
  if (bucket) {
    func(bucket);
  }
}

const dal = require('./dalEngineResult.js')(serviceContext);

const coreDbRead = serviceContext.dbConnections['core'].read;
const mediaDbRead = serviceContext.dbConnections['media_platform'].read;

const mockPartitionTable = require('../test/partitionTable.mock.js')(
  serviceContext
);

describe('dalEngineResult.js', function () {
  beforeEach(() => {
    serviceContext.redisCache.markCacheDirty(true);
  });

  afterAll(() => {
    jest.resetModules();
  });

  describe('#require', function () {
    it('should load module', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(23);
    });
  });

  describe('#getSourceIdForMention', function () {
    it('should return source id for mention', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].read._push([
        { source_id: 'sourceId', tdo_id: 'tdoId' }
      ]);

      try {
        res = await dal.getSourceIdForMention(context, 'mentionId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.sourceId).to.equal('sourceId');
    });

    it('should return empty result for source', async function () {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].read._push([]);

      try {
        res = await dal.getSourceIdForMention(context, 'mentionId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
    });
  });

  describe('#getEngineResults', function () {
    it('should warn on overlapping TDOs on live source', async function () {
      serviceContext.redisCache.markCacheDirty(false);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: true
        }
      ]);
      mediaDbRead._push([
        {
          id: '1231' // TDO id
        },
        {
          id: '1232'
        }
      ]);

      coreDbRead._push([
        {
          id: engineId,
          name: 'test engine',
          owner_organization_id: 7682,
          category_id: engineId,
          internal_id: engineId
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          name: 'test engine',
          owner_organization_id: 7682,
          category_id: engineId,
          internal_id: engineId
        }
      ]);
      mediaDbRead._push([
        {
          id: '1231' // TDO id
        },
        {
          id: '1232'
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        },
        {
          id: '1232',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:04:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          }
        ],
        false
      );
      coreDbRead._push([
        {
          id: '1231',
          source_id: '1',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:04:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push([
        {
          id: 'job1_1',
          job_id: 'job1',
          engine_id: engineId,
          target_id: '1231',
          output: {},
          payload: {}
        }
      ]);
      const res = await dal.getEngineResults(
        {
          sourceId: 1,
          startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
          fallbackTdoId: '1001',
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );
      // validate that a warning message was emitted
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
      chaiExpect(serviceContext.messageUtil._messages()[0].event).to.equal(
        'warning'
      );
      chaiExpect(serviceContext.messageUtil._messages()[0].errorName).to.equal(
        'live_source_tdo_overlap'
      );
      chaiExpect(serviceContext.redisClient._counter()).equals(4);

      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should error on invalid engine IDs', async function () {
      serviceContext.redisCache.markCacheDirty(false);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: true
        }
      ]);
      coreDbRead._push([]); // empty engine result list
      try {
        await dal.getEngineResults(
          {
            sourceId: 1,
            startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
            stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
            fallbackTdoId: '1001',
            engineIds: [engineId]
          },
          mockUtil.makeContext()
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });

    it('should not rethrow unexpected error on engine IDs validation as not_found', async function () {
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: true
        }
      ]);

      try {
        await dal.getEngineResults(
          {
            sourceId: 1,
            startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
            stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
            fallbackTdoId: '1001',
            engineIds: [engineId]
          },
          mockUtil.makeContext()
        );
        throw new Error('no throw');
      } catch (err) {
        chaiExpect(err.name).not.to.equal('not_found');
      }
    });

    it('should include all non-overlapping TDOs on live source', async function () {
      serviceContext.redisCache.markCacheDirty(false);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: true
        }
      ]);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '1231' // TDO id
        },
        {
          id: '1232'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        },
        {
          id: '1232',
          start_date_time: moment('2019-01-01T00:03:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:04:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1232',
            metadata: {
              fileName: 'foo2.txt'
            }
          }
        ],
        false,
        [],
        (sql, vars) => {
          // verify that the assets were filtered by source engine ID, not task.
          if (vars[5].sourceEngineId !== engineId) return false;
          if (vars[6].source !== engineId) return false;

          return true;
        }
      );

      const res = await dal.getEngineResults(
        {
          sourceId: 1,
          startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
          fallbackTdoId: '1001',
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );
      chaiExpect(serviceContext.redisClient._counter()).equals(5);

      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(2);
    });

    it('should return results for non-time series data', async function () {
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push([
        {
          id: 'job123_task1',
          job_id: 'job123',
          engine_id: engineId
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt',
              sourceEngineId: 'e123'
            }
          }
        ],
        false
      );

      const res = await dal.getEngineResults(
        {
          tdoId: '123',
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );
      // validate that getting from redisCache 2 times
      chaiExpect(serviceContext.redisClient._counter()).equals(5);
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should handle none-time series data with multiple TDOs', async function () {
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: true
        }
      ]);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '1231' // TDO id
        },
        {
          id: '1232'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:00:01.000Z').valueOf()
        },
        {
          id: '1232',
          start_date_time: moment('2019-01-01T00:03:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: 'http://localhost:3000/objectOnlyAsset',
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1231',
            metadata: {}
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: 'http://localhost:3000/objectOnlyAsset',
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1232',
            metadata: {}
          }
        ],
        false
      );

      const res = await dal.getEngineResults(
        {
          sourceId: 1,
          startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
          fallbackTdoId: '1231',
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );
      chaiExpect(serviceContext.redisClient._counter()).equals(4);

      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(2);
    });

    it('should error on non-live source without fallback TDO', async function () {
      serviceContext.redisCache.markCacheDirty(false);
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: false
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      try {
        const res = await dal.getEngineResults(
          {
            sourceId: 1,
            startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
            stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
            engineIds: [engineId]
          },
          mockUtil.makeContext()
        );
        expect.fail('did not error');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.include('live source type');
        chaiExpect(_.get(err, 'data.sourceId')).to.equal(1);
      }
      chaiExpect(serviceContext.redisClient._counter()).equals(5);
    });
    it('should accept non-live source fallback TDO', async function () {
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: false
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          }
        ],
        false
      );

      const res = await dal.getEngineResults(
        {
          sourceId: 1,
          fallbackTdoId: '1234',
          startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );

      chaiExpect(serviceContext.redisClient._counter()).equals(4);
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should accept jobId', async function () {
      mockPartitionTable.setMockDBToCheckTablePartition(coreDbRead, 'job123');
      coreDbRead._push([
        {
          id: mockUtil.toTaskId('job123'),
          target_id: '1231'
        }
      ]);

      coreDbRead._push([
        {
          id: mockUtil.toTaskId('job123_task1'),
          job_id: mockUtil.toTaskId('job123'),
          engine_id: engineId
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);

      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt',
              sourceEngineId: engineId
            }
          }
        ],
        false,
        [],
        (sql, vars) => {
          // verify that assets query was filtered by source task ID
          //console.log(mockUtil.fromTaskId(vars[3].sourceTaskId));
          if (mockUtil.fromTaskId(vars[3].sourceTaskId) !== 'job123_task1')
            return false;
          return true;
        }
      );
      const res = await dal.getEngineResults(
        {
          jobId: mockUtil.toTaskId('job123')
        },
        mockUtil.makeContext()
      );
      chaiExpect(serviceContext.redisClient._counter()).equals(2);
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(1);
    });

    it('should bail if max request size exceeded', async function () {
      mediaDbRead._push([
        {
          id: '1',
          name: 'test source',
          is_public: false,
          source_type_id: '2',
          permission: 'owner'
        }
      ]);
      mediaDbRead._push([
        {
          id: '2',
          name: 'test source type',
          is_live: false
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          }
        ],
        false
      );

      // set a very low response size limit and re-initialize the
      // dal object to test this case.
      _.set(serviceContext, 'config.server.responseSizeLimit', 5);
      let dalr = require('./dalEngineResult.js')(serviceContext);
      try {
        const res = await dalr.getEngineResults(
          {
            sourceId: 1,
            fallbackTdoId: '1234',
            startDate: moment('2019-01-01T00:00:01.000Z').valueOf(),
            stopDate: moment('2019-01-01T00:05:00.000Z').valueOf(),
            engineIds: [engineId]
          },
          mockUtil.makeContext()
        );
        expect.fail('no throw on response size exceeded');
      } catch (err) {
        if (err.name === 'AssertionError') throw err;
        if (err.name !== 'capacity_exceeded') throw err;
        chaiExpect(err.name).to.equal('capacity_exceeded');
        chaiExpect(err.message).to.include('too many assets');
      }
      chaiExpect(serviceContext.redisClient._counter()).equals(4);
    });

    it('should throw invalid input when engineIds not exists in tdo', async function () {
      coreDbRead._push([
        {
          id: '123456'
        }
      ]);
      coreDbRead._push([
        {
          id: 'job123_task1',
          job_id: 'job123',
          engine_id: 'engineId1'
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);

      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: 'http://localhost:3000/',
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt',
              sourceEngineId: 'e123'
            }
          }
        ],
        false
      );
      try {
        await dal.getEngineResults(
          {
            tdoId: '123',
            engineIds: [engineId]
          },
          mockUtil.makeContext()
        );
        expect.fail('The engineIds do not exists in Job or TDO provided.');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.include(
          'The engineIds do not exists in Job or TDO provided.'
        );
      }
    });

    it('should return all sibling tasks by engine id ran in the same job for iron engines', async function () {
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine',
          category_id: engineId
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push([
        {
          id: 'job1234_task1',
          job_id: 'job1234',
          engine_id: engineId,
          payload: {
            libraryId: 'library1'
          }
        },
        {
          id: 'job1234_task2',
          job_id: 'job1234',
          engine_id: engineId,
          payload: {
            libraryId: 'library2'
          }
        }
      ]);
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine',
          category_id: engineId
        }
      ]);
      coreDbRead._push([
        {
          id: '1231',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      coreDbRead._push([], false);

      coreDbRead._push([
        {
          id: 'job1234_task1',
          job_id: 'job1234',
          engine_id: engineId,
          target_id: '1231',
          task_output: {
            sourceEngineId: engineId,
            series: [
              {
                end: 1001,
                start: 0,
                entityId: 'entity1',
                libraryId: 'library1'
              },
              {
                end: 3000,
                start: 1001,
                entityId: 'entity2',
                libraryId: 'library1'
              },
              {
                end: 420000,
                start: 400000,
                entityId: 'entity3',
                libraryId: 'library1'
              }
            ]
          }
        },
        {
          id: 'job1234_task2',
          job_id: 'job1234',
          engine_id: engineId,
          target_id: '1231',
          task_output: {
            sourceEngineId: engineId,
            series: [
              {
                end: 1001,
                start: 0,
                entityId: 'entity1',
                libraryId: 'library2'
              },
              {
                end: 3000,
                start: 1001,
                entityId: null,
                libraryId: null
              },
              {
                end: 420000,
                start: 400000,
                entityId: null,
                libraryId: null
              }
            ]
          }
        },
        {
          id: 'job1234_task3',
          job_id: 'job1234',
          engine_id: engineId,
          target_id: '1231',
          task_output: {
            // tests for internal_error in prod caused by task output
            // with no series data
            sourceEngineId: engineId
          }
        }
      ]);

      const res = await dal.getEngineResults(
        {
          tdoId: '1231',
          engineIds: [engineId]
        },
        mockUtil.makeContext()
      );
      chaiExpect(res.records).to.exist;
      chaiExpect(res.records.length).to.equal(2);
    });

    it('should accept alias IDs and find results by internal ID', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'internal_alias',
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'internal_alias',
          alias_id: engineId,
          name: 'test engine'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]); // called from getTasks

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'job123_t1',
          job_id: 'job123',
          engine_id: engineId
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'internal_alias',
          alias_id: engineId,
          name: 'test engine'
        }
      ]); // called from getTasks

      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);

      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          }
        ],
        false
      );

      const res = await dal.getEngineResults(
        {
          tdoId: '220845810',
          engineIds: [engineId],
          ignoreUserEdited: false,
          stopOffsetMs: 900000
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
    });

    it('should handle large number of engine IDs', async function () {
      serviceContext.redisCache.markCacheDirty(false);

      const allEngineIds = [
        '17f7e7cd-dca9-49af-90b6-53a3698690f8',
        '27f7e7cd-dca9-49af-90b6-53a3698690f8',
        '37f7e7cd-dca9-49af-90b6-53a3698690f8',
        '47f7e7cd-dca9-49af-90b6-53a3698690f8',
        '57f7e7cd-dca9-49af-90b6-53a3698690f8',
        '67f7e7cd-dca9-49af-90b6-53a3698690f8',
        '77f7e7cd-dca9-49af-90b6-53a3698690f8',
        '87f7e7cd-dca9-49af-90b6-53a3698690f8',
        '97f7e7cd-dca9-49af-90b6-53a3698690f8',
        '10f7e7cd-dca9-49af-90b6-53a3698690f8',
        '11f7e7cd-dca9-49af-90b6-53a3698690f8',
        '12f7e7cd-dca9-49af-90b6-53a3698690f8',
        '13f7e7cd-dca9-49af-90b6-53a3698690f8',
        '14f7e7cd-dca9-49af-90b6-53a3698690f8',
        '15f7e7cd-dca9-49af-90b6-53a3698690f8',
        '16f7e7cd-dca9-49af-90b6-53a3698690f8',
        '17f7e7cd-dca9-49af-90b6-53a3698690f8',
        '17e7e7cd-dca9-49af-90b6-53a3698690f8',
        '18f7e7cd-dca9-49af-90b6-53a3698690f8',
        '19f7e7cd-dca9-49af-90b6-53a3698690f8',
        '20f7e7cd-dca9-49af-90b6-53a3698690f8',
        '21f7e7cd-dca9-49af-90b6-53a3698690f8',
        'b3fa5950-c3b4-47eb-9808-10ed295d2696'
      ];

      // SQL query for each engine by ID
      Array.from(new Set(allEngineIds)).forEach((id) => {
        serviceContext.dbConnections['core'].read._push([
          {
            id: 'internal_alias_' + id,
            alias_id: id,
            name: 'test engine ' + id
          }
        ]);
      });
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'internal_alias',
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'job123_1',
          job_id: 'job123',
          engine_id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
        }
      ]); // get tasks
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
          alias_id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
          alias_id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
          name: 'test engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]); // called from getTasks

      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'transcript',
            content_type: 'text/plain',
            container_id: '1231',
            metadata: {
              fileName: 'foo.txt'
            }
          }
        ],
        false
      );

      const res = await dal.getEngineResults(
        {
          tdoId: '220845810',
          engineIds: allEngineIds,
          ignoreUserEdited: false,
          stopOffsetMs: 900000
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
    });

    it('should not exclude correlation results', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
          alias_id: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
          name: 'correlation engine'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0',
          alias_id: 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0',
          name: 'another correlation engine'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]); // called from getTasks
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'job123_t1',
          job_id: 'job123',
          engine_id: engineId // note that the correlation engine
          // does not have a task in the job!
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
          alias_id: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
          name: 'correlation engine'
        },
        {
          id: 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0',
          alias_id: 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0',
          name: 'another correlation engine'
        }
      ]); // populate engineByEngineId
      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]); // main getTDOs call in getEngineResults

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              fileName: 'engineResult.json'
            }
          },
          {
            id: '220845810_asset2',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset2URI,
            metadata: {
              fileName: 'engineResult.json'
            }
          }
        ],
        false,
        [],
        (sql, vars) => {
          if (
            !(vars[3].sourceEngineId === 'd7f7e7cd-dca9-49af-90b6-53a3698690f8')
          )
            return false;
          if (!(vars[4].source === 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'))
            return false;
          if (
            !(vars[5].sourceEngineId === 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0')
          )
            return false;
          if (!(vars[6].source === 'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0'))
            return false;

          return true;
        }
      ); // gets the engine results assets

      const res = await dal.getEngineResults(
        {
          tdoId: '220845810',
          engineIds: [
            'd7f7e7cd-dca9-49af-90b6-53a3698690f8',
            'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0'
          ],
          ignoreUserEdited: false,
          stopOffsetMs: 900000
        },
        mockUtil.makeContext()
      );
      chaiExpect(res).to.exist;
      chaiExpect(_.get(res, 'records[0].engineId')).to.equal(
        'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
      );
      chaiExpect(_.get(res, 'records[1].engineId')).to.equal(
        'f36f3a76-16c2-4a78-b291-bfa5da9e9bf0'
      );
    });

    it('should return empty when input sourceId not equal to mention.sourceId', async function () {
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId
        }
      ]);
      // tdo called from getTasks
      coreDbRead._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      // populate getTasks
      coreDbRead._push([
        {
          id: 'job123_t1',
          job_id: 'job123',
          engine_id: engineId
        }
      ]);
      // getEnginesByEngineId
      coreDbRead._push([
        {
          id: engineId,
          alias_id: engineId,
          name: 'test engine'
        }
      ]);
      // getSourceIdForMention
      mediaDbRead._push([
        {
          source_id: 2,
          tdo_id: '220845810'
        }
      ]);

      try {
        const res = await dal.getEngineResults(
          {
            sourceId: 1,
            tdoId: '220845810',
            engineIds: [engineId],
            mentionId: '12345'
          },
          mockUtil.makeContext()
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should get engine results by engineCategoryIds, with empty engineIds input', async function () {
      serviceContext.dbConnections['core'].read._push([
        { recording_id: '220845810' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'taskId1',
          job_id: 'jobId',
          engine_id: 'engineId1',
          application_id: 'applicationId',
          target_id: '220845810'
        },
        {
          id: 'taskId2',
          job_id: 'jobId',
          engine_id: 'engineId2',
          application_id: 'applicationId',
          target_id: '220845810'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId1',
            name: 'categoryName1',
            description: 'categoryDesc1',
            engine_ids: [engineId, 'engineId4'],
            engine_alias_ids: [engineId, 'engineId4']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId2',
            name: 'categoryName2',
            description: 'categoryDesc2',
            engine_ids: ['engineId5', 'engineId6'],
            engine_alias_ids: ['engineId5', 'engineId6']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { id: engineId },
        { id: 'engineId4' },
        { id: 'engineId5' },
        { id: 'engineId6' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeObjectEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '220845810',
            metadata: {},
            user_edited: true,
            modified_date_time: moment('2019-01-01T00:00:01.000Z').valueOf()
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '220845810',
            metadata: {
              sourceEngineId: engineId
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId4' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId5' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId6' }]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        const res = await dal.getEngineResults(
          {
            tdoId: '220845810',
            // engineIds: ['engineId1', 'engineId5'],
            engineCategoryIds: ['categoryId1', 'categoryId2']
          },
          mockUtil.makeContext()
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(1);
        chaiExpect(res.records[0].engineId).to.equal(engineId);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should get engine result by engineIds, with engineCategoryIds input', async function () {
      serviceContext.dbConnections['core'].read._push([{ id: engineId }]);
      serviceContext.dbConnections['core'].read._push([
        { recording_id: '220845810' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'taskId1',
          job_id: 'jobId',
          engine_id: engineId,
          application_id: 'applicationId',
          target_id: '220845810'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId3',
            name: 'categoryName1',
            description: 'categoryDesc1',
            engine_ids: ['engineId3', 'engineId4'],
            engine_alias_ids: ['engineId3', 'engineId4']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId4',
            name: 'categoryName2',
            description: 'categoryDesc2',
            engine_ids: ['engineId5', 'engineId6'],
            engine_alias_ids: ['engineId5', 'engineId6']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { id: engineId },
        { id: 'engineId3' },
        { id: 'engineId4' },
        { id: 'engineId5' },
        { id: 'engineId6' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '220845810',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf()
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeObjectEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '220845810',
            metadata: {},
            user_edited: true,
            modified_date_time: moment('2019-01-01T00:00:01.000Z').valueOf()
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '220845810',
            metadata: {
              sourceEngineId: engineId
            }
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId3' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId4' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId5' }]);
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId6' }]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        const res = await dal.getEngineResults(
          {
            tdoId: '220845810',
            engineIds: [engineId],
            engineCategoryIds: ['categoryId3', 'categoryId4']
          },
          mockUtil.makeContext()
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(1);
        chaiExpect(res.records[0].engineId).to.equal(engineId);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getEnginesByEngineId', function () {
    it('should return 2 map objects with engine alias', async function () {
      // getEngines
      coreDbRead._push([
        {
          id: engineId,
          alias_id: 'engineIdAlias'
        }
      ]);

      try {
        const res = await dal.getEnginesByEngineId(mockUtil.makeContext(), [
          engineId
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(Array.from(res.keys()).length).to.equal(2);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return 1 map objects with engine id', async function () {
      // getEngines
      let getEngines = jest.fn();
      _.set(serviceContext, 'dal.engine.getEngines', getEngines);
      getEngines.mockImplementation(() =>
        Promise.resolve({
          records: [
            {
              id: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            }
          ],
          count: 1
        })
      );

      try {
        const res = await dal.getEnginesByEngineId(
          mockUtil.makeContext(),
          engineId
        );
        chaiExpect(res).to.exist;
        chaiExpect(Array.from(res.keys()).length).to.equal(1);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should call getEngines with id (not ids) for a non-array engineIds', async function () {
      const getEngines = jest.fn().mockResolvedValue({
        records: [{ id: engineId }],
        count: 1
      });
      _.set(serviceContext, 'dal.engine.getEngines', getEngines);

      await dal.getEnginesByEngineId(mockUtil.makeContext(), engineId);

      expect(getEngines).toHaveBeenCalledWith(
        expect.anything(),
        { id: engineId }
      );
    });

    it('should call getEngines with ids for an array of engineIds', async function () {
      const getEngines = jest.fn().mockResolvedValue({
        records: [{ id: engineId }],
        count: 1
      });
      _.set(serviceContext, 'dal.engine.getEngines', getEngines);

      await dal.getEnginesByEngineId(mockUtil.makeContext(), [engineId]);

      expect(getEngines).toHaveBeenCalledWith(
        expect.anything(),
        { ids: [engineId] }
      );
    });

    it('should merge caller-supplied getEnginesOptions (e.g. includeDeleted, adminView) with the ids', async function () {
      const getEngines = jest.fn().mockResolvedValue({
        records: [{ id: engineId }],
        count: 1
      });
      _.set(serviceContext, 'dal.engine.getEngines', getEngines);

      const res = await dal.getEnginesByEngineId(
        mockUtil.makeContext(),
        [engineId],
        { includeDeleted: true, adminView: true }
      );

      expect(getEngines).toHaveBeenCalledWith(
        expect.anything(),
        { ids: [engineId], includeDeleted: true, adminView: true }
      );
      chaiExpect(res.get(engineId)).to.exist;
    });
  });

  describe('#validateEngineIds', function () {
    it('should call getEngine with id merged into the supplied getEngineOptions', async function () {
      const getEngine = jest.fn().mockResolvedValue({ id: engineId });
      _.set(serviceContext, 'dal.engine.getEngine', getEngine);

      const res = await dal.validateEngineIds(
        mockUtil.makeContext(),
        [engineId],
        { includeDeleted: true, adminView: true }
      );

      expect(getEngine).toHaveBeenCalledWith(
        expect.anything(),
        { includeDeleted: true, adminView: true, id: engineId },
        true
      );
      chaiExpect(res).to.include(engineId);
    });

    it('should call getEngine with just id when no getEngineOptions are supplied', async function () {
      const getEngine = jest.fn().mockResolvedValue({ id: engineId });
      _.set(serviceContext, 'dal.engine.getEngine', getEngine);

      await dal.validateEngineIds(mockUtil.makeContext(), [engineId]);

      expect(getEngine).toHaveBeenCalledWith(
        expect.anything(),
        { id: engineId },
        true
      );
    });

    it('should wrap a not_found error from getEngine into a NotFound error', async function () {
      const notFoundErr = new Error('engine not found');
      notFoundErr.name = 'not_found';
      const getEngine = jest.fn().mockRejectedValue(notFoundErr);
      _.set(serviceContext, 'dal.engine.getEngine', getEngine);

      let caughtErr;
      try {
        await dal.validateEngineIds(mockUtil.makeContext(), [engineId], {
          includeDeleted: true,
          adminView: true
        });
      } catch (err) {
        caughtErr = err;
      }
      chaiExpect(caughtErr).to.exist;
      chaiExpect(caughtErr.data.engineIds).to.deep.equal([engineId]);
    });
  });

  describe('#getEnginesByCategoryId', function () {
    it('should return 1 map objects with engineId', async function () {
      let getEngineCategory = jest.fn();
      _.set(
        serviceContext,
        'dal.engineCategory.getEngineCategory',
        getEngineCategory
      );
      getEngineCategory.mockImplementation(() =>
        Promise.resolve({
          id: 'engineCategoryId',
          engineIds: ['engineId1', 'engineId2']
        })
      );

      try {
        const res = await dal.getEnginesByCategoryId(mockUtil.makeContext(), [
          'engineCategoryId'
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(Array.from(res.keys()).length).to.equal(1);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return 2 map objects with engineId and engineInternalId', async function () {
      let getEngineCategory = jest.fn();
      _.set(
        serviceContext,
        'dal.engineCategory.getEngineCategory',
        getEngineCategory
      );
      getEngineCategory.mockImplementation(() =>
        Promise.resolve({
          id: 'engineCategoryId',
          engineIds: ['engineId1', 'engineId2'],
          internalId: 'internalId'
        })
      );

      try {
        const res = await dal.getEnginesByCategoryId(mockUtil.makeContext(), [
          'engineCategoryId'
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(Array.from(res.keys()).length).to.equal(2);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getEngineOutputs', function () {
    it('should return empty result if did not have any asset', async function () {
      coreDbRead._push([], false);

      try {
        const res = await dal.getEngineOutputs(
          mockUtil.makeContext(),
          [engineId],
          ['taskId1', 'taskId2'],
          [123],
          { tdoId: 123, offsetMs: 0 },
          { tdoId: 123, offsetMs: 10 },
          false,
          10
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return empty result if unable to parse engine result from signedAssetUri', async function () {
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: 'error uri',
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1231',
            metadata: {}
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: 'error uri',
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1232',
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dal.getEngineOutputs(
          mockUtil.makeContext(),
          [engineId],
          ['taskId1', 'taskId2'],
          [123],
          { tdoId: 123, offsetMs: 0 },
          { tdoId: 123, offsetMs: 10 },
          false,
          10
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return error capacity_exceeded if individual assets might be large', async function () {
      _.set(serviceContext, 'config.server.responseSizeLimit', '1B');
      const dalEdited = require('./dalEngineResult.js')(serviceContext);
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeObjectEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1231',
            metadata: {}
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: fakeObjectEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1232',
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dalEdited.getEngineOutputs(
          mockUtil.makeContext(),
          [engineId],
          ['taskId1', 'taskId2'],
          [123],
          { tdoId: 1231, offsetMs: 0 },
          { tdoId: 1231, offsetMs: 10 },
          false,
          10
        );
        chaiExpect(res).to.be.undefined;
      } catch (err) {
        chaiExpect(err.name).to.equal('capacity_exceeded');
      }
    });

    it('should return array with 2 objects', async function () {
      coreDbRead._push(
        [
          {
            id: '1231_a',
            asset_id: '1231_a',
            uri: fakeObjectEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1231',
            metadata: {},
            user_edited: true,
            modified_date_time: moment('2019-01-01T00:00:01.000Z').valueOf()
          },
          {
            id: '1232_a',
            asset_id: '1232_a',
            uri: fakeSeriesEngineAssetURI,
            asset_type: 'vtn-standard',
            content_type: 'application/json',
            container_id: '1232',
            metadata: {
              sourceEngineId: engineId
            }
          }
        ],
        false
      );

      try {
        const res = await dal.getEngineOutputs(
          mockUtil.makeContext(),
          [engineId],
          ['taskId1', 'taskId2'],
          [123],
          { tdoId: 1231, offsetMs: 0 },
          { tdoId: 1231, offsetMs: 10 },
          false,
          10
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(2);
        chaiExpect(res[0].tdoId).to.equal('1231');
        chaiExpect(res[0].userEdited).to.equal(true);
        chaiExpect(res[0].modifiedDateTime).to.exist;
        chaiExpect(res[0].sourceEngineId).to.equal(engineId);
        chaiExpect(res[0].assetId).to.equal('1231_a');
        chaiExpect(res[0].object.length).to.equal(2);
        chaiExpect(res[1].tdoId).to.equal('1232');
        chaiExpect(res[1].userEdited).to.be.undefined;
        chaiExpect(res[1].modifiedDateTime).to.be.undefined;
        chaiExpect(res[1].sourceEngineId).to.equal(engineId);
        chaiExpect(res[1].assetId).to.equal('1232_a');
        chaiExpect(res[1].series.length).to.equal(3);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#removeEngineId', function () {
    it('should return if engineIdToRemove is manual', function () {
      let res, err;
      const engineIdToRemove = 'manual';
      const engineIdsToProcess = 'engineIdsToProcess';
      const engineByEngineId = new Map();
      engineByEngineId.set(engineIdToRemove, 'manual');

      try {
        res = dal.removeEngineId(
          engineIdToRemove,
          engineIdsToProcess,
          engineByEngineId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.undefined;
    });

    it('should throw error if engine in engineByEngineId not exists', function () {
      let res, err;
      const engineIdToRemove = 'engineIdToRemove';
      const engineIdsToProcess = 'engineIdsToProcess';
      const engineByEngineId = new Map();

      try {
        res = dal.removeEngineId(
          engineIdToRemove,
          engineIdsToProcess,
          engineByEngineId
        );
      } catch (error) {
        // console.log('error: ', error);
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      // console.log('res: ', res);
      // console.log('err: ', err);
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('internal_error');
      chaiExpect(res).to.be.undefined;
    });

    it('should remove engineId in processing engine', function () {
      let err;
      const engineIdToRemove = 'engineIdToRemove';
      const engineIdsToProcess = [
        'engineIdsToProcess',
        'engineIdToRemove',
        'engineInternalIdToRemove'
      ];
      const engineByEngineId = new Map();
      engineByEngineId.set(engineIdToRemove, {
        id: 'engineIdToRemove',
        internalId: 'engineInternalIdToRemove'
      });

      try {
        dal.removeEngineId(
          engineIdToRemove,
          engineIdsToProcess,
          engineByEngineId
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(engineIdsToProcess.length).to.equal(1);
    });
  });

  describe('#convertBoundingBox', function () {
    it('should return null if bounding box not exists', function () {
      let res, err;
      const item = {};

      try {
        res = dal.convertBoundingBox(item);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });

    it('should convert bounding box with coords', function () {
      let res, err;
      const item = {
        boundingBox: {
          A: { x: 10, y: 5 },
          B: { x: 1, y: 2 },
          C: { x: 3, y: 4 },
          D: { x: 6, y: 7 }
        }
      };

      try {
        res = dal.convertBoundingBox(item);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res[0].x).to.equal(10);
      chaiExpect(res[0].y).to.equal(5);
    });

    it('should convert bounding box', function () {
      let res, err;
      const item = { boundingBox: { left: 0, top: 10, height: 5, width: 6 } };

      try {
        res = dal.convertBoundingBox(item);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res[0].x).to.equal(0);
      chaiExpect(res[0].y).to.equal(10);
    });
  });

  describe('#buildEngineOutputObjectUris', function () {
    it('should build signedUri for object uri', async function () {
      try {
        let engineOutputs = [
          {
            series: [
              {
                uri: 'https://s3.aws-dev.amazonaws.com'
              },
              {
                uri: 'https://s3.aws-dev.amazonaws.com/1'
              }
            ]
          }
        ];
        await dal.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
        chaiExpect(engineOutputs).to.exist;
        chaiExpect(engineOutputs[0].series.length).to.equal(2);
        chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
          'https://s3.aws-dev.amazonaws.com'
        );
        chaiExpect(engineOutputs[0].series[1].object.uri).to.equal(
          'https://s3.aws-dev.amazonaws.com/1'
        );
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should keep engineOutput if not exists series', async function () {
      let err;
      let engineOutputs = [{ foo: 'bar' }];

      try {
        await dal.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
    });

    it('should build signedUri for region us-east-1', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'linkUri' }] }];

      try {
        await dal.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
      chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
        'https://s3.amazonaws.com/test.veritone-face/linkUri'
      );
    });

    it('should build signedUri for other regions', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'linkUri' }] }];

      overrideBucket(serviceContext, 'face', (x) => {
        x.region = 'us-east-2';
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      try {
        await dalNew.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
      chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
        'https://s3-us-east-2.amazonaws.com/test.veritone-face/linkUri'
      );
    });

    it('should build media streamer uri', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'media-streamer/1' }] }];

      overrideBucket(serviceContext, 'face', (x) => {
        x.region = 'us-east-2';
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      // serviceContext.dal.shared.getTDOSourceTaskData
      serviceContext.dbConnections['core'].read._push([]);

      try {
        await dalNew.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        // console.log('error: ', error);
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      // console.log('err: ', err);
      // console.log('res: ', JSON.stringify(engineOutputs));
      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
      chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
        'http://localhost/media-streamer/1'
      );
    });

    it('should build media streamer uri for face', async function () {
      let err;
      let engineOutputs = [
        {
          tdoId: '220845810',
          series: [
            {
              startTimeMs: 1234,
              object: {
                type: 'face',
                boundingPoly: [
                  { x: 10, y: 20 },
                  { x: 30, y: 40 },
                  { x: 50, y: 60 }
                ]
              }
            }
          ]
        }
      ];

      overrideBucket(serviceContext, 'face', (x) => {
        x.region = 'us-east-2';
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      // serviceContext.dal.shared.getTDOSourceTaskData
      serviceContext.dbConnections['core'].read._push([]);

      try {
        await dalNew.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        // console.log('error: ', error);
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      // console.log('err: ', err);
      // console.log('res: ', JSON.stringify(engineOutputs));
      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
      chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
        'http://localhost/media-streamer/image/220845810?offsetMs=1234&x[0]=10&y[0]=20&x[1]=30&y[1]=40&x[2]=50&y[2]=60'
      );
    });

    it('should build media streamer uri for portable edge', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'media-streamer/1' }] }];

      overrideBucket(serviceContext, 'face', (x) => {
        x.region = 'us-east-2';
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      // serviceContext.dal.shared.getTDOSourceTaskData
      serviceContext.dbConnections['core'].read._push([
        { content: { clusterId: 12345 } }
      ]);
      // serviceContext.dal.cluster.getCluster
      serviceContext.dbConnections['core'].read._push([
        {
          id: 12345,
          type: 'OnPrem',
          cluster_config: {
            managementNodeId: '0c823dc5-b6c8-4ef0-b4c8-15089644fa7c'
          }
        }
      ]);
      // serviceContext.dal.clusterNode.getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: '0c823dc5-b6c8-4ef0-b4c8-15089644fa7c',
          metrics: {
            mbRam: 8678,
            mbDisk: 36157,
            cpuCount: 24,
            ipExternal: '66.85.101.182',
            ipInternal: '10.17.21.1'
          }
        }
      ]);

      try {
        await dalNew.buildEngineOutputObjectUris(
          engineOutputs,
          [
            {
              id: '220845819',
              startDateTime: 1546300802000,
              stopDateTime: 1546300982000,
              isPublic: false
            }
          ],
          mockUtil.makeContext()
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(engineOutputs).to.exist;
      chaiExpect(engineOutputs.length).to.equal(1);
      chaiExpect(engineOutputs[0].series[0].object.uri).to.equal(
        'http://66.85.101.182/media-streamer/1'
      );
    });

    it('should throw error if missing bucket name config', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'media/2' }] }];

      overrideBucket(serviceContext, 'face', (x) => {
        x.name = null;
      });
      overrideBucket(serviceContext, 'face', (x) => {
        x.name = null;
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      try {
        await dalNew.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('internal_error');
    });

    it('should throw error if missing region config', async function () {
      let err;
      let engineOutputs = [{ series: [{ uri: 'media/2' }] }];

      overrideBucket(serviceContext, 'face', (x) => {
        x.region = null;
      });
      const dalNew = require('./dalEngineResult.js')(serviceContext);

      try {
        await dalNew.buildEngineOutputObjectUris(engineOutputs, [
          {
            id: '220845810',
            startDateTime: 1546300801000,
            stopDateTime: 1546300981000,
            isPublic: false
          }
        ]);
      } catch (error) {
        // console.log('error: ', error);
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      // console.log('err: ', err);
      // console.log('res: ', JSON.stringify(engineOutputs));
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('internal_error');
    });
  });

  describe('#removeAwsSignatureParams', function () {
    it('should remove AWS signature params ignore the regular param.', function () {
      try {
        const res = dal.removeAwsSignatureParams(
          'https://localhost?i=1&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAQMR5VATUJ3FCEP66%2F20190524'
        );
        chaiExpect(res).to.exist;
        chaiExpect(res).to.equal('https://localhost?i=1');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should remove all AWS signature params', function () {
      try {
        const res = dal.removeAwsSignatureParams(
          'https://localhost?X-Amz-Algorithm=AWS4-HMAC-SHA256'
        );
        chaiExpect(res).to.exist;
        chaiExpect(res).to.equal('https://localhost');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#unescapeWordSpecialCharacters', function () {
    it('should replace &#39; character in engineResult', function () {
      try {
        let res = [
          {
            series: [
              {
                words: [
                  {
                    word: `test: &#39;`
                  }
                ]
              }
            ]
          }
        ];
        dal.unescapeWordSpecialCharacters(res);
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(_.get(res[0], 'series[0].words[0].word')).to.equal(
          `test: '`
        );
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#outputsToEngineResults', function () {
    it('should return output to engine result with internalId', function () {
      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: 'internalId'
        });
        const res = dal.outputsToEngineResults(
          220845810,
          [
            {
              sourceEngineId: engineId
            }
          ],
          engineByEngineId,
          {
            tdoId: '220845810',
            engineIds: ['internalId'],
            mentionId: '12345',
            startOffsetMs: 0,
            stopOffsetMs: 180000,
            startOffset: { tdoId: '220845810', offsetMs: 0 },
            stopOffset: { tdoId: '220845810', offsetMs: 180000 }
          }
        );

        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].engineId).to.equal('internalId');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return output to engine result in case handle legacy transcript ttml edit', function () {
      try {
        const engineByEngineId = new Map();
        const res = dal.outputsToEngineResults(
          220845810,
          [
            {
              sourceEngineId: 'manual'
            }
          ],
          engineByEngineId,
          {
            tdoId: '220845810',
            engineIds: [engineId, 'internalId'],
            mentionId: '12345',
            startOffsetMs: 0,
            stopOffsetMs: 180000,
            startOffset: { tdoId: '220845810', offsetMs: 0 },
            stopOffset: { tdoId: '220845810', offsetMs: 180000 }
          }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].engineId).to.equal('manual');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return empty output, if internal engine id is undefined', function () {
      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine'
        });
        const res = dal.outputsToEngineResults(
          220845810,
          [
            {
              sourceEngineId: engineId
            }
          ],
          engineByEngineId,
          {
            tdoId: '220845810',
            engineIds: ['internalId'],
            mentionId: '12345',
            startOffsetMs: 0,
            stopOffsetMs: 180000,
            startOffset: { tdoId: '220845810', offsetMs: 0 },
            stopOffset: { tdoId: '220845810', offsetMs: 180000 }
          }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return output, if engine id from the asset is internal but requested by non-internal', function () {
      try {
        const engineByEngineId = new Map();
        engineByEngineId.set('internalId', {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: 'internalId'
        });
        const res = dal.outputsToEngineResults(
          220845810,
          [
            {
              sourceEngineId: 'internalId'
            }
          ],
          engineByEngineId,
          {
            tdoId: '220845810',
            engineIds: [engineId],
            mentionId: '12345',
            startOffsetMs: 0,
            stopOffsetMs: 180000,
            startOffset: { tdoId: '220845810', offsetMs: 0 },
            stopOffset: { tdoId: '220845810', offsetMs: 180000 }
          }
        );

        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].engineId).to.equal(engineId);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#outputToEngineResult', function () {
    it('should return output to engine result with sourceId', function () {
      try {
        const res = dal.outputToEngineResult(
          220845810,
          {
            sourceEngineId: engineId,
            sourceId: 'sourceId'
          },
          engineId,
          {}
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.jsondata.sourceId).to.equal('sourceId');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getLastCompleteEnginesTasksWithOutputs', function () {
    it('should return last complete engine task with output', async function () {
      coreDbRead._push([
        {
          id: 'taskId',
          targetId: '220845810',
          engineId,
          jobId: 'jobId_1',
          start_date_time: moment('2019-01-01T00:00:01.000Z').valueOf(),
          stop_date_time: moment('2019-01-01T00:03:01.000Z').valueOf(),
          completed_date_time: moment('2019-01-01T00:03:01.000Z').valueOf(),
          output: {
            sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            series: []
          }
        }
      ]); //getTasks
      try {
        const res = await dal.getLastCompleteEnginesTasksWithOutputs(
          mockUtil.getGraphQLContext,
          [
            {
              id: '220845811',
              startDateTime: 1546300801000,
              stopDateTime: 1546300981000,
              isPublic: false,
              createdDateTime: moment('2019-01-02T00:00:01.000Z')
            },
            {
              id: '220845810',
              startDateTime: 1546300801000,
              stopDateTime: 1546300981000,
              isPublic: false,
              createdDateTime: moment('2019-01-01T00:00:01.000Z')
            }
          ],
          ['b3fa5950-c3b4-47eb-9808-10ed295d2696']
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].id).to.equal('taskId');
        chaiExpect(res[0].taskOutput).to.exist;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getLastTaskWithOutput', function () {
    it('should return last task with output when did not have series', async function () {
      try {
        const res = dal.getLastTaskWithOutput([
          {
            id: 'job1234_task1',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            },
            completedDateTime: moment('2019-01-02T00:00:01.000Z').valueOf()
          },
          {
            id: 'job1234_task2',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            },
            completedDateTime: moment('2019-01-01T00:00:01.000Z').valueOf()
          }
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal('job1234_task1');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return null with empty input tasks', async function () {
      try {
        const res = dal.getLastTaskWithOutput([]);
        chaiExpect(res).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return last task with completedDateTime of task1 is undefined', async function () {
      try {
        const res = dal.getLastTaskWithOutput([
          {
            id: 'job1234_task1',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            }
          },
          {
            id: 'job1234_task2',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            },
            completedDateTime: moment('2019-01-01T00:00:01.000Z').valueOf()
          }
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal('job1234_task2');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return last task with completedDateTime of task2 is undefined', async function () {
      try {
        const res = dal.getLastTaskWithOutput([
          {
            id: 'job1234_task1',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            },
            completedDateTime: moment('2019-01-01T00:00:01.000Z').valueOf()
          },
          {
            id: 'job1234_task2',
            jobId: 'job1234',
            engineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
            targetId: '1231',
            taskOutput: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696',
              series: []
            },
            output: {
              sourceEngineId: 'b3fa5950-c3b4-47eb-9808-10ed295d2696'
            }
          }
        ]);
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal('job1234_task1');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return null if not exists task output', async function () {
      let res, err;
      const tasks = [{ id: 'taskId' }];

      try {
        res = dal.getLastTaskWithOutput(tasks);
      } catch (error) {
        // console.log('error: ', error);
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      // console.log('res: ', res);
      // console.log('err: ', err);
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.be.null;
    });
  });

  describe('#getOutputsForTtmlAndVlfTranscriptEngine', function () {
    it('should return null if no output asset for ttml or vlf engine', async function () {
      coreDbRead._push([], false);
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return null if no transcriptSnippets', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'JSON',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              sourceTaskId: 'taskId1',
              source: 'manual'
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res[0]).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return null if assetSourceEngineId is manual', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'transcript',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              source: 'manual'
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0]).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return transcriptSeries', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'transcript',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              sourceTaskId: 'taskId1',
              source: 'manual'
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0].tdoId).to.equal('220845810');
        chaiExpect(res[0].sourceEngineId).to.equal(
          'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
        );
        chaiExpect(res[0].userEdited).to.equal(true);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return transcriptSeries with source engineId in asset metadata', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'transcript',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              source: engineId
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine'
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0].tdoId).to.equal('220845810');
        chaiExpect(res[0].sourceEngineId).to.equal(engineId);
        chaiExpect(res[0].userEdited).to.equal(false);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return null with asset type v-vlf and no transcriptSnippets', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'v-vlf',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              source: engineId
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine'
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0]).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return transcriptSeries with engineByEngineId in asset', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'transcript',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              source: engineId
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          asset: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0].tdoId).to.equal('220845810');
        chaiExpect(res[0].sourceEngineId).to.equal(engineId);
        chaiExpect(res[0].userEdited).to.equal(false);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return transcriptSeries with internalId in engineByEngineId', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            type: 'transcript',
            recordingId: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {
              source: engineId
            }
          }
        ],
        false
      );
      coreDbRead._push([], false);
      coreDbRead._push([], false);

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getOutputsForTtmlAndVlfTranscriptEngine(
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          [{ id: '220845810' }],
          {
            ignoreUserEdited: true,
            startOffset: {
              tdoId: '220845810',
              offsetMs: 1000
            },
            stopOffset: {
              tdoId: '220845810',
              offsetMs: 5000
            }
          },
          mockUtil.getGraphQLContext
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0].tdoId).to.equal('220845810');
        chaiExpect(res[0].sourceEngineId).to.equal(engineId);
        chaiExpect(res[0].userEdited).to.equal(false);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getVlfAssetsFromTranscriptEngineId', function () {
    it('should get combine assets with allTasksWithOutputs include transcript engineId', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          }
        ],
        false
      );
      coreDbRead._push(
        [
          {
            id: '220845810_asset2',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset2URI,
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dal.getVlfAssetsFromTranscriptEngineId(
          mockUtil.getGraphQLContext,
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          [
            {
              id: 'taskId1',
              engineId: 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'
            }
          ],
          { containerId: ['220845810'] }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(2);
        chaiExpect(res.count).to.equal(2);
        chaiExpect(res.limit).to.equal(2);
        chaiExpect(res.records[0].id).to.equal('220845810_asset1');
        chaiExpect(res.records[1].id).to.equal('220845810_asset2');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should get vlf assets with transcriptEngineIds', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dal.getVlfAssetsFromTranscriptEngineId(
          mockUtil.getGraphQLContext,
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          [
            {
              id: 'taskId1'
            }
          ],
          { containerId: ['220845810'] }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.limit).to.equal(2);
        chaiExpect(res.records.length).to.equal(1);
        chaiExpect(res.count).to.equal(1);
        chaiExpect(res.records[0].id).to.equal('220845810_asset1');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getVlfAssetsFromSource', function () {
    it('should get vlf assets from source', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          },
          {
            id: '220845810_asset2',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset2URI,
            metadata: {}
          }
        ],
        false
      );

      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId,
          asset: {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          }
        });
        const res = await dal.getVlfAssetsFromSource(
          mockUtil.getGraphQLContext,
          ['220845810', '220845810'],
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          {}
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.count).to.equal(2);
        chaiExpect(res.limit).to.equal(2);
        chaiExpect(res.records.length).to.equal(2);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
        // console.log('err: ', err);
      }
    });

    it('should return null if did not have assets', async function () {
      try {
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = await dal.getVlfAssetsFromSource(
          mockUtil.getGraphQLContext,
          ['220845810', '220845810'],
          [engineId, 'd7f7e7cd-dca9-49af-90b6-53a3698690f8'],
          engineByEngineId,
          {}
        );
        chaiExpect(res).to.be.null;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#getTtmlAssetsFromManual', function () {
    it('should return undefined result if ignoreUserEdited is true', async function () {
      try {
        const res = await dal.getTtmlAssetsFromManual(
          mockUtil.getGraphQLContext,
          true
        );
        chaiExpect(res).to.be.undefined;
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return ttml assets from manual with containerId', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          },
          {
            id: '220845810_asset2',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset2URI,
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dal.getTtmlAssetsFromManual(
          mockUtil.getGraphQLContext,
          false,
          {
            containerId: [220845810]
          }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(2);
        chaiExpect(res.count).to.equal(2);
        chaiExpect(res.limit).to.equal(1);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return ttml assets from manual without containerId', async function () {
      coreDbRead._push(
        [
          {
            id: '220845810_asset1',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset1URI,
            metadata: {}
          },
          {
            id: '220845810_asset2',
            container_id: '220845810',
            uri: fakeCorrelationEngineAsset2URI,
            metadata: {}
          }
        ],
        false
      );

      try {
        const res = await dal.getTtmlAssetsFromManual(
          mockUtil.getGraphQLContext,
          false,
          {
            containerId: '220845810'
          }
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.records.length).to.equal(2);
        chaiExpect(res.count).to.equal(2);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#filterTtmlJsonSnippetsWithinOffset', function () {
    it('should filter ttml snippets within offset in seconds', function () {
      try {
        const transcriptJson = [
          {
            start: 4,
            end: 9
          },
          {
            start: 0,
            end: 4
          }
        ];
        const res = dal.filterTtmlJsonSnippetsWithinOffset(
          transcriptJson,
          3000,
          8000
        );
        chaiExpect(res).to.exist;
        chaiExpect(res[0].start).to.equal(4);
        chaiExpect(res[0].end).to.equal(9);
        chaiExpect(res[1].start).to.equal(0);
        chaiExpect(res[1].end).to.equal(4);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#filterVlfSnippetsWithinOffset', function () {
    it('should filter vlf snippets within offset in miliseconds', function () {
      try {
        const vlfJson = [
          {
            start: 5000,
            end: 9000
          },
          {
            start: 4000,
            end: 6000
          }
        ];
        const res = dal.filterVlfSnippetsWithinOffset(vlfJson, 3000, 8000);
        chaiExpect(res).to.exist;
        chaiExpect(res[0].start).to.equal(5000);
        chaiExpect(res[0].end).to.equal(9000);
        chaiExpect(res[1].start).to.equal(4000);
        chaiExpect(res[1].end).to.equal(6000);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#filterTasksWithTranslationOutput', function () {
    it('should return empty if engine category is not translation', function () {
      try {
        const tasks = [
          {
            engineId
          }
        ];
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId
        });
        const res = dal.filterTasksWithTranslationOutput(
          tasks,
          engineByEngineId
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return empty if task did not have payload', function () {
      try {
        const tasks = [
          {
            engineId
          }
        ];
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId,
          categoryId: '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923'
        });
        const res = dal.filterTasksWithTranslationOutput(
          tasks,
          engineByEngineId
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return empty if task did not have output', function () {
      try {
        const tasks = [
          {
            engineId,
            payload: {
              target: ['en', 'uk']
            }
          }
        ];
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId,
          categoryId: '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923'
        });
        const res = dal.filterTasksWithTranslationOutput(
          tasks,
          engineByEngineId
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should filter task with translation output', function () {
      try {
        const tasks = [
          {
            engineId,
            payload: {
              target: 'English:en',
              organizationId: 7682
            },
            output: {
              EngLish: 'it'
            }
          }
        ];
        const engineByEngineId = new Map();
        engineByEngineId.set(engineId, {
          id: engineId,
          aliasId: engineId,
          name: 'test engine',
          internalId: engineId,
          categoryId: '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923'
        });
        const res = dal.filterTasksWithTranslationOutput(
          tasks,
          engineByEngineId
        );
        chaiExpect(res).to.exist;
        chaiExpect(res.length).to.equal(1);
        chaiExpect(res[0].engineId).to.equal(engineId);
        chaiExpect(res[0].payload.target).to.equal('English:en');
        chaiExpect(res[0].output.EngLish).to.equal('it');
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });

  describe('#convertToMs', function () {
    it('should return default date if invalid input date', function () {
      try {
        const res = dal.convertToMs('abcd');
        chaiExpect(res).is.exist;
        chaiExpect(res).to.equal(0);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return ms if isSeconds is true', function () {
      try {
        const res = dal.convertToMs('2018-11-05T07:42:32.000Z');
        chaiExpect(res).is.exist;
        chaiExpect(res).to.equal(1541403752000);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });

    it('should return ms if isSeconds is false', function () {
      try {
        const res = dal.convertToMs('2020-11-05T07:42:32.000Z');
        chaiExpect(res).is.exist;
        chaiExpect(res).to.equal(1604562152000);
      } catch (err) {
        chaiExpect(err).to.be.undefined;
      }
    });
  });
});
