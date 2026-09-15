const _ = require('lodash');
const NodeCache = require('node-cache');

process.env.ECS_CONTAINER_METADATA_FILE = './test/containerInfo.json';

// make sure we only install the handler once in a multi-test suite
if (_.isNil(process.env.installedRejectionHandlers)) {
  process.on('unhandledRejection', function (reason, promise) {
    const err = _.isObject(reason) ? JSON.stringify(reason) : reason;
    throw new Error(
      'UNHANDLED REJECTION:  ' + err + ' ' + reason + ' ' + reason.stack
    );
  });
  process.env.installedRejectionHandlers = 'true';
  // console.log('----- installed rejected promise handler to ' + process.pid);
}

module.exports = function createModule(options) {
  // TODO not sure if this will work.
  // process.exit(-1) doesn't work out because jest
  // just exits without showing the console log or any
  // other diagnostic data so it's impossible so see
  // what the error was.
  /*
  process.on('uncaughtException', function(err) {
    console.log('UNHANDLED EXCEPTION:  '+err);
    expect.fail('UNHANDLED EXCEPTION:  '+err);
  });
*/
  // mock out timers and intervals for all tests. we don't ever want
  // real timers or intervals installed in unit tests.
  if (_.get(options, 'mockTimers', true)) {
    jest.useFakeTimers();
  }

  // mock all all HTTP calls
  if (_.get(options, 'mockHttp', true)) {
    jest.mock('request-promise');
    /*
  to use mocks, add a specific mock implementation in the test case like so:
  require('request-promise').mockImplementation(uri =>
    Promise.resolve(`{foo: 'bar'}`)
  );*/
    jest.mock('http');
    jest.mock('https');
  }

  if (_.get(options, 'mockMessaging', true)) {
    jest.mock('@veritone/core-messages/generated/pbjs/compiled');
    jest.mock('@veritone/ts-messaging-lib');
    jest.mock('@veritone/ts-messaging-lib/lib');
    jest.mock('@veritone/ts-messaging-lib/lib/nsq');
  }

  const config = require('./testServer.json');

  const groupToOrgCache = new NodeCache({
    stdTTL: 60 * 60, // TTL of 1 hour
    checkperiod: 10 * 60 // purge every 10 min
  });

  const orgToGroupCache = new NodeCache({
    stdTTL: 60 * 60, // TTL of 1 hour
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineCategoryListCache = new NodeCache({
    stdTTL: 5 * 60, // TTL of 5 minutes
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineCacheLocal = new NodeCache({
    stdTTL: _.get(config, 'engineCache.maxAgeSeconds', 5 * 60 * 60), // 5 min
    checkperiod: 10 * 60 // purge every 10 min
  });

  const engineListCache = new NodeCache({
    stdTTL: 5 * 60, // TTL of 5 minutes
    checkperiod: 10 * 60 // purge every 10 min
  });

  const lruCacheMaxAgeInMs = config.lruCacheMaxAgeInMs || 600000; // default: 10 minutes
  const lruCacheMaxItems = config.lruCacheMaxItems || 500;
  const LRU = require('lru-cache');
  const cacheOptions = {
    max: lruCacheMaxItems,
    ttl: lruCacheMaxAgeInMs
  };

  const appIdToOrgIdCache = new LRU(cacheOptions);

  // base service context with config
  const serviceContext = {
    config,
    coreStorage: {},
    promMetric: {
      client: {
        Histogram: jest.fn(),
        Counter: jest.fn(),
        Gauge: jest.fn()
      },
      metricsCounters: {}
    },
    groupToOrgCache,
    orgToGroupCache,
    engineCategoryListCache,
    engineCacheLocal,
    engineListCache,
    appIdToOrgIdCache
  };

  (serviceContext.pg = require('@veritone/core-server-base/pg')(
    serviceContext.config,
    'core'
  )),
    // add a bunch of mocks to service context
    (serviceContext.dbConnections = require('./initdb.mock.js')(
      serviceContext,
      options
    ).dbConnections);
  serviceContext.messageUtil = require('./messageUtil.mock.js')(serviceContext);
  serviceContext.logger = {
    error: (str) => jest.fn(),
    debug: (str) => null, //console.log(str),
    info: (str) => jest.fn(),
    log: jest.fn(),
    warn: jest.fn().mockImplementation((str) => jest.fn()),
    trace: (str) => jest.fn()
  };
  serviceContext.metrics = require('./metrics.mock.js')(serviceContext);
  serviceContext.monitoring = require('./monitoring.mock.js')(serviceContext);
  serviceContext.localCache = require('../localCache.js')(serviceContext);
  serviceContext.redisClient = require('./redisClient.mock.js');
  serviceContext.coreAdminRedisClient = require('./redisClient.mock.js');
  serviceContext.createRedisLock = require('./redLock.mock.js');
  serviceContext.redisCache = require('./redisCache.mock.js')(serviceContext);

  let deleteAssetCounter = 0;
  let putAssetCounter = 0;
  serviceContext.storage = {
    putAsset: (model, stream, size, cb) => {
      putAssetCounter++;
      cb(null, 'http://localhost');
    },
    cloneAsset: (model, applicationId, recordingId, cb) => {
      cb(null, 'http://localhost');
    },
    putObject: (key, contentType, size, stream, cb) => {
      cb(null, 'http://localhost');
    },
    deleteAsset: (uri, cb) => {
      deleteAssetCounter++;
      cb(null, { uri });
    },
    isAzureMediaUri: (uri) => false,
    isAmazonS3Uri: (uri) => true,
    getFileExtension: require('@veritone/core-server-base/storageUtil.js')({})
      .getFileExtension,
    _deleteAssetCounter: () => deleteAssetCounter,
    _putAssetCounter: () => putAssetCounter
  };

  serviceContext.librariesService = {
    getLibraries: jest.fn()
  };

  serviceContext.app = {
    logger: serviceContext.logger,
    config: serviceContext.config,
    dalPartitionGenerator: require('@veritone/core-server-base/dal/partitionGenerator.js')(
      serviceContext.config,
      serviceContext.logger,
      serviceContext.pg
    )
  };

  serviceContext.pubsub = {
    publish: jest.fn()
  };

  serviceContext.dal = {};
  serviceContext.bll = {};

  serviceContext.bll.asset = require('../bll/asset.js')(serviceContext);
  serviceContext.bll.dagTenplate = require('../bll/asset.js')(serviceContext);
  serviceContext.bll.engine = require('../bll/engine.js')(serviceContext);
  serviceContext.bll.job = require('../bll/job.js')(serviceContext);
  serviceContext.bll.task = require('../bll/task.js')(serviceContext);
  serviceContext.bll.mailbox = require('../bll/mailbox.js')(serviceContext);
  serviceContext.bll.notification = require('../bll/notification.js')(
    serviceContext
  );
  serviceContext.bll.application = require('../bll/application.js')(
    serviceContext
  );
  serviceContext.bll.rbacAuth = require('../modules/rbacAuth/bll/rbacAuth.bll')(
    serviceContext
  );

  // TODO add more DAL mocks as needed
  const dalOrganization = require('../dal/organization.js')(serviceContext);
  serviceContext.dal.admin = require('../dal/dalAdmin.js')(
    serviceContext.logger,
    serviceContext.config,
    dalOrganization,
    serviceContext
  );
  serviceContext.dal.application = require('../dal/dalApplication.js')(
    serviceContext.logger,
    serviceContext.config,
    serviceContext
  );
  serviceContext.dal.organization = {
    getOrgIdFromAppId: (appId) => Promise.resolve(7682),
    getGroupIdForOrgId: (orgId) =>
      Promise.resolve('798970fe-2df2-5acc-9d55-d9376d615c74')
  };
  serviceContext.dal.notification = require('../dal/notification.js')(
    serviceContext
  );

  serviceContext.coreJob = {
    decider: {
      decide: (jobId) => null,
      createTaskPayload: jest
        .fn()
        .mockImplementation((context, engine, task) => {})
    },
    jobBll: {
      job: {
        getJobStatusFromTaskStatuses: (tasks) => 'running',
        cancelJob: jest
          .fn()
          .mockImplementation((jobId, requestorApplicationId, db, cb) =>
            cb(null)
          )
      },
      engine: {
        autoTransitionEngineState: jest.fn()
      },
      task: {
        getEngineUsageForOrganization: jest
          .fn()
          .mockImplementation(
            (applicationId, organization, dbClient, callback) => callback(null)
          )
      },
      s3: {
        getEngineBuildReport: jest.fn(),
        getEngineBuildManifest: jest.fn()
      }
    },
    cjdal: {
      job: {
        updateJobWithRecordingId: () => Promise.resolve({}),
        getJobWithTasks: jest
          .fn()
          .mockImplementation((jobId, dbClient, callback) => callback(null)),
        incrementJobRetryCount: jest.fn()
      },
      task: {
        updateTaskMediaFields: () => Promise.resolve({})
      },
      engine: {
        getEngine: jest.fn(),
        updateEngine: jest.fn(),
        updateEngineState: jest.fn(),
        deleteEngine: jest.fn()
      },
      build: {
        createEngineBuild: jest.fn(),
        getEngineBuild: jest.fn(),
        updateBuildState: jest.fn(),
        deleteEngineBuild: jest.fn(),
        updateEngineBuildForNodeRed: jest.fn(),
        pauseDeployedBuildsForEngine: jest.fn(),
        updateEngineBuild: jest.fn()
      },
      util: {
        beginTran: (callback) =>
          callback(null, {
            client: {},
            commit: (cb) => cb(null),
            rollback: (cb) => cb(null)
          })
      },
      engineCategory: {
        getEngineCategory: jest.fn()
      },
      buildCapability: {
        addBuildCapabilities: jest.fn()
      }
    },
    jobModel: require('../modules/core-job-server/model')(),
    eventEmitter: {
      emitEngineBuildEvent: jest.fn(),
      emitEngineBuildPublicEvent: jest.fn(),
      eventNames: {
        engineCreate: 'engine_create',
        engineUpdate: 'engine_update',
        engineDisable: 'engine_disable',
        engineEnable: 'engine_enable',
        engineBuildDeploy: 'engine_build_deploy',
        engineBuildDeploySuccess: 'engine_build_deploy_success',
        engineBuildSubmit: 'engine_build_submit',
        engineBuildPause: 'engine_build_pause',
        engineBuildUnpause: 'engine_build_unpause',
        engineBuildApprove: 'engine_build_approve',
        engineBuildDisapprove: 'engine_build_disapprove',
        engineBuildDelete: 'engine_build_delete',
        engineBuildInvalidate: 'engine_build_invalidate',
        engineBuildUpload: 'engine_build_upload',
        engineBuildCreate: 'engine_build_create',
        engineBuildUpdate: 'engine_build_update',
        engineAddToOrgList: 'engine_add_to_org_list',
        taskQueued: 'task_queued',
        taskUpdated: 'task_updated',
        jobCreated: 'job_created',
        jobCompleted: 'job_completed',
        jobFailed: 'job_failed'
      },
      emitEngineEvent: jest.fn(),
      emitJobCreatedEvent: jest.fn(),
      emitEngineForOrgEvent: jest.fn(),
      emitJobCompletedEvent: jest.fn()
    }
  };
  serviceContext.coreAdmin = {
    dal: {
      userSession: {
        getLoginUserInfoCache: (userId, cb) =>
          cb(
            null,
            userId && userId.startsWith('0000')
              ? null
              : { id: userId, token: '11111111-6b4f-4cd8-bda8-b94c1ac6cd9b' }
          ),
        cacheUser: (userInfo, token, data, cb) => cb(null, {}),
        convertUserRolesToPermissionMasks: (roles, cb) => cb(null, {}),
        setLoginUserInfoCache: (userInfo, cb) => cb(null, {}),
        saveSessionInfo: (userId, userData, cb) => cb(null, userData)
      },
      user: {
        updateLastLogin: (userId, cb) => cb(null, {})
      }
    },
    bll: {
      userSession: {
        retrieveFullUser: (userId, orgId, cb) => cb(null, { id: userId }),
        refreshUserSessionsLogin: (userId, cb) => cb(null, { id: userId })
      }
    }
  };

  const presigner = require('../util/presigner.s3.buckets');
  if (presigner && typeof presigner.init === 'function') {
    presigner.init(serviceContext);
  }

  serviceContext.dal.cluster = require('../modules/v3DataModel/dal/cluster.js')(
    serviceContext
  );

  serviceContext.dal.clusterNode = require('../modules/v3DataModel/dal/clusterNode.js')(
    serviceContext
  );

  serviceContext.dal.tdo = require('../dal/tdo.js')(serviceContext);

  serviceContext.dal.asset = require('../dal/asset.js')(serviceContext);

  serviceContext.dal.user = require('../dal/user.js')(serviceContext);

  serviceContext.dal.role = require('../dal/role.js')(serviceContext);

  serviceContext.blls3 = { getEngineBuildReport: () => Promise.resolve({}) };

  serviceContext.dal.engine = require('../dal/dalEngine.js')(
    null, // storage
    serviceContext.logger,
    null, // coreDalEngine
    null, // pg2
    serviceContext.blls3, // blls3
    serviceContext.config,
    serviceContext.dal.tdo, // dalTDO
    serviceContext.app, // app
    serviceContext
  );

  serviceContext.dal.packages = require('../dal/package.js')(
    serviceContext,
    serviceContext.config
  );

  // TODO use real dal once it's converted away from core-collection-server
  serviceContext.dal.folder = {
    fileTDO: (context, args) => Promise.resolve({ id: args.id }),
    removeTDOFromFolders: (context, args) => Promise.resolve({}),
    TREE_OBJECT_TYPE: {
      UNDEFINED: 0,
      FOLDER: 1,
      WATCHLIST: 2,
      COLLECTION: 3,
      ROOT_FOLDER: 4,
      TDO: 5
    },
    getParentFolder: (context, args) => Promise.resolve(args),
    getFolder: jest.fn(),
    unfileObject: jest.fn()
  };

  serviceContext.dal.folderV2 = require('../dal/dalFolderV2.js');

  serviceContext.dal.engineResult = require('../dal/dalEngineResult.js')(
    serviceContext
  );
  serviceContext.dal.task = require('../dal/task.js')(serviceContext);
  serviceContext.dal.engineCategory = require('../dal/engineCategory.js')(
    serviceContext
  );
  serviceContext.dal.organization = require('../dal/organization.js')(
    serviceContext
  );

  serviceContext.dal.job = require('../dal/job.js')(serviceContext);
  serviceContext.dal.v3Job = require('../dal/dalV3Job')(serviceContext);

  serviceContext.dal.structuredData = require('../dal/structureddata.js')(
    serviceContext
  );

  serviceContext.dal.processingDeliverables = require('../dal/processingDeliverables.js')(
    serviceContext,
    serviceContext.config
  );

  serviceContext.dal.library = require('../dal/library.js')(serviceContext);

  serviceContext.dal.mention = require('../dal/mention.js')(serviceContext);

  serviceContext.dal.source = require('../modules/v3DataModel/dal/source.js')(
    serviceContext
  );
  serviceContext.dal.processTemplate = require('../dal/processTemplate.js')(
    serviceContext
  );

  serviceContext.dal.mailbox = require('../dal/mailbox.js')(serviceContext);

  serviceContext.dal.collection = {
    getWidgets: (context, args) =>
      args.organizationId
        ? {
            offset: 0,
            limit: 30,
            records: [
              {
                id: 'collection_id',
                name: 'collection name',
                organizationId: args.organizationId
              }
            ]
          }
        : null
  };
  serviceContext.dal.event = require('../dal/event.js')(serviceContext);
  serviceContext.dal.openidConnect = require('../dal/openidConnect.js')(
    serviceContext
  );
  serviceContext.dal.organizationInvite = require('../dal/organizationInvite')(
    serviceContext
  );
  serviceContext.dal.organizationRegistration = require('../dal/dalOrganizationRegistration')(
    serviceContext
  );

  serviceContext.dal.dalStorage = {
    getBlobInfo: () => Promise.resolve(''),
    getSignedWritableUrl: () =>
      Promise.resolve({
        signedWritableUrl: '',
        rawSignedWritableUrl: ''
      }),
    putRawBytes: () => Promise.resolve(''),
    putObjectTaggingPromise: (key, bucket, tags, versionId) =>
      Promise.resolve({}),
    getStorageByBucketName: () => serviceContext.storage
  };
  serviceContext.dal.flowRevision = require('../dal/dalFlowRevision')(
    serviceContext
  );
  serviceContext.dal.flowTemplate = require('../dal/dalFlowTemplate')(
    serviceContext
  );
  serviceContext.dal.alwaysUpFlow = require('../dal/dalAlwaysUpFlow');

  let messageQueue = [];
  serviceContext.messagingV2 = {
    _clear: () => (messageQueue = []),
    produce: (context, event) => messageQueue.push(event),
    _queue: () => messageQueue,
    _get: () => messageQueue.shift()
  };

  serviceContext._clearAll = function () {
    serviceContext.monitoring._reset();
    serviceContext.messageUtil._clearCounter();
    serviceContext.config.featureFlags.readAuditEvents = false;
    serviceContext.redisClient._clear();
    serviceContext.redisClient._clearCounter();
    serviceContext.redisClient.connected = true;
    serviceContext.coreAdminRedisClient._clear();
    serviceContext.coreAdminRedisClient._clearCounter();
    serviceContext.coreAdminRedisClient.connected = true;
    serviceContext.metrics._clearMetrics();
    const dbKeys = Object.keys(serviceContext.dbConnections);
    dbKeys.forEach((key) => {
      if (serviceContext.dbConnections[key].read) {
        serviceContext.dbConnections[key].read._clearResultQueue();
      }
      if (serviceContext.dbConnections[key].write) {
        serviceContext.dbConnections[key].write._clearResultQueue();
      }
    });
    putAssetCounter = 0;
    deleteAssetCounter = 0;
    serviceContext.localCache._clearAll();
    groupToOrgCache.flushAll();
    orgToGroupCache.flushAll();
    engineCategoryListCache.flushAll();
    engineCacheLocal.flushAll();
    engineListCache.flushAll();
    appIdToOrgIdCache.clear();
  };

  return serviceContext;
};
