const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const createMockServiceContext = require('../modules/v3DataModel/test/serviceContext.mock.js');
const dalEngine = require('./dalEngine.js');
const jwt = require('jsonwebtoken');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);

const errors = require('../error')(serviceContext.config);
const mockPartitionTable = require('../test/partitionTable.mock.js')(
  serviceContext
);

const { eventsMap } = require('@veritone/core-server-base/events-map.js');

serviceContext.redisCache = {
  isCacheDirty: () => true,
  markCacheDirty: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  asyncSet: jest.fn(),
  clear: jest.fn(),
  incr: jest.fn(),
  incrBy: jest.fn(),
  incrByFloat: jest.fn(),
  decr: jest.fn(),
  multiExec: jest.fn()
};

const _getEngineBuildReport = jest.fn();

_.set(serviceContext, 'blls3.getEngineBuildReport', _getEngineBuildReport);

_getEngineBuildReport.mockImplementation((engineId, buildId, callback) => {
  if (engineId && buildId) {
    return callback(null, { message: 'success' });
  }
  return callback(new Error('not success'));
});

jest.mock('request-promise');
const httpResponses = [];
require('request-promise').mockImplementation((uri) => {
  const cur = httpResponses.shift();
  if (cur.error) return Promise.reject(cur.error);
  else return Promise.resolve(cur.data);
});
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
let context;

const metadataVersion = 2;
const engineList = [
  {
    id: '0981e79f-de99-489e-a2c4-366c4b466321',
    name: 'Veritone Speaker Recognition',
    metadataVersion: metadataVersion,
    state: 'active',
    rating: null,
    price: null,
    createdDateTime: '2019-05-14T20:03:46.000Z',
    modifiedDateTime: '2019-05-14T20:03:46.000Z',
    runtimeType: 'edge',
    category: {
      name: 'Speaker Detection',
      engine_ids: ['0981e79f-de99-489e-a2c4-366c4b466321'],
      engine_alias_ids: ['0981e79f-de99-489e-a2c4-366c4b466321']
    },
    mode: 'Stream',
    libraryRequired: true,
    builds: {
      records: [
        {
          manifest: {
            build: 'd80e86d3-d6fc-4bfc-8792-6ed77b4249cc',
            category: 'speaker detection',
            engineMode: 'stream',
            clusterSize: 'large',
            gpuSupported: 'P2',
            maxMediaLengthMs: 0,
            supportedInputFormats: [
              'video/mp4',
              'audio/wav',
              'audio/mp4',
              'video/mpeg',
              'video/quicktime'
            ]
          }
        }
      ]
    }
  },
  {
    id: 'e25fdb6c-99e7-4ba6-abca-335ef7941178',
    name: 'TEST Redact Detection GPU V2F',
    state: 'active',
    rating: null,
    price: null,
    createdDateTime: '2019-05-03T21:41:48.000Z',
    modifiedDateTime: '2019-05-03T21:41:48.000Z',
    runtimeType: 'edge',
    category: {
      name: 'Facial Detection',
      engine_ids: ['e25fdb6c-99e7-4ba6-abca-335ef7941178'],
      engine_alias_ids: ['e25fdb6c-99e7-4ba6-abca-335ef7941178']
    },
    mode: 'Stream',
    libraryRequired: false,
    builds: {
      records: [
        {
          manifest: {
            build: 'b757f117-74f2-4689-a760-cf79f7f0b8ec',
            category: 'face',
            engineMode: 'stream',
            clusterSize: 'medium',
            gpuSupported: 'P2',
            maxMediaLengthMs: 0,
            supportedInputFormats: null
          }
        }
      ]
    }
  }
];

function createDal(svcContext) {
  svcContext.app.config.jwt.secret = 'mock_key';
  return dalEngine(
    null,
    svcContext.logger,
    null,
    null,
    svcContext.blls3,
    svcContext.config,
    svcContext.dal.tdo,
    svcContext.app,
    svcContext
  );
}

function mockUserData(dbConn) {
  dbConn._push(
    [
      {
        user_id: 'e2051840-3490-43ff-819f-5be476683439',
        user_name: 'test_user_e2051840-3490-43ff-819f-5be476683439',
        kvp: {
          firstName: 'test',
          lastName: 'test'
        },
        application_id: '94c49c0e-2469-4a35-a68c-5f7b268f3d5b'
      }
    ],
    false
  );
}

const mockSchemas = async () => {
  const regId = '81ca224a-ae73-4f8d-9d5a-feea644d4956';
  const schemaId = '94c49c0e-2469-4a35-a68c-5f7b268f3d5b';
  const dbRead = serviceContext.dbConnections['third_party'].read;
  const dbWrite = serviceContext.dbConnections['third_party'].write;
  const structuredDataDal = require('./structureddata.js')(serviceContext);

  const context = JSON.parse(
    JSON.stringify(mockUtil.makeContext({ authType: 'api_internal' }))
  );
  const rights = _.get(context, '_authInfo.json.rights');
  rights.push('schema:update');
  _.set(context, '_authInfo.json.rights', rights);

  // get data registry
  dbRead._push(
    [
      {
        id: regId,
        name: 'test registry',
        organizationId: 7682,
        is_system: false
      }
    ],
    false
  );

  // _lockDataRegistrySchemaVersioning
  dbWrite._push([{ id: regId }], false);
  // _getLatestSchemaByMajor - no existing schema
  dbWrite._push([], false);
  // _getLatestSchemaAnyMajor - no existing schema
  dbWrite._push([], false);
  // _findExistingSchemaByVersion (via _createOrReuseDraft) - no existing
  dbWrite._push([], false);

  // createNewDraft (insert draft)
  dbWrite._push(
    [
      {
        id: schemaId,
        dataRegistryMetadataId: regId,
        organizationId: 7682,
        minorVersion: 0,
        majorVersion: 1,
        status: 'draft'
      }
    ],
    false
  );

  const res = await structuredDataDal.upsertSchemaDraft(context, {
    input: {
      dataRegistryId: regId,
      majorVersion: 1,
      schema: {}
    }
  });

  return res;
};

const mockEnginePackage = (
  engineId,
  buildId,
  packageResources = [],
  isNewBuild = false,
  isUpgrade = false,
  // This is used for the upgrading case
  latestPackageDoesNotIncludeCurrentDeployedBuild = false
) => {
  if (!isNewBuild) {
    // getEngineBuilds from createOrDuplicatePackage
    serviceContext.dbConnections['core'].read._push(
      [
        {
          id: buildId,
          engineId: engineId,
          status: 'deployed'
        }
      ],
      false
    );
  }

  // getPackages from createOrDuplicatePackage: get latest package
  serviceContext.dbConnections['core'].read._push(
    [
      {
        packageId: 'packageId'
      }
    ],
    false
  );

  // package resource data
  let packageResourcesData = [
    {
      resourceId: 'buildId1',
      resourceType: 'engineBuild'
    },
    {
      resourceId: 'buildId2',
      resourceType: 'engineBuild'
    },
    {
      resourceId: buildId, // by default the latest package includes the deployed build
      resourceType: 'engineBuild'
    }
  ];

  if (!isNewBuild) {
    if (latestPackageDoesNotIncludeCurrentDeployedBuild) {
      // In this case: the latest package does not include the deployed build
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: 'buildId1',
            resourceType: 'engineBuild'
          },
          {
            resourceId: 'buildId2',
            resourceType: 'engineBuild'
          }
        ],
        false
      );
    } else {
      // the latest package includes the deployed build
      serviceContext.dbConnections['core'].read._push(
        packageResourcesData,
        false
      );
    }
  }

  if (isNewBuild || latestPackageDoesNotIncludeCurrentDeployedBuild) {
    // getEngineBuilds from sanitizeEngineBuildResources
    serviceContext.dbConnections['core'].read._push(
      [
        {
          id: 'buildId1'
        },
        {
          id: 'buildId2'
        },
        {
          id: 'newDeployedBuildId'
        }
      ],
      false
    );

    // getPackageResources from sanitizeEngineBuildResources
    if (!latestPackageDoesNotIncludeCurrentDeployedBuild) {
      serviceContext.dbConnections['core'].read._push(
        packageResourcesData,
        false
      );
    }
  }

  if (isUpgrade) {
    // getPackages from doPackageUpgrades
    serviceContext.dbConnections['core'].read._push(
      [
        {
          packageId: 'oldPackageId',
          packageVersion: '1.0.0',
          sourceOriginId: 'oldPackageId',
          sourcePackageId: 'oldPackageId',
          organizationId: 7682,
          autoGenerated: true
        }
      ],
      false
    );

    // getPackages from getLatestPackages
    serviceContext.dbConnections['core'].read._push(
      [
        {
          packageId: 'oldPackageId',
          packageVersion: '1.0.0',
          sourceOriginId: 'oldPackageId',
          sourcePackageId: 'oldPackageId',
          organizationId: 7682,
          autoGenerated: true
        }
      ],
      false
    );

    // getResourcesToAdd
    serviceContext.dbConnections['core'].read._push([], false);
  }

  // validate primary resource
  serviceContext.dbConnections['core'].read._push([], false);

  // creating new package from doPackageCreate
  serviceContext.dbConnections['core'].write._push(
    [
      {
        packageId: 'newPackageId',
        packageName: 'New Test Package',
        organizationId: 7682,
        status: 'published'
      }
    ],
    false,
    [],
    (sql, params) => {
      expect(params[8]).toEqual('published');
      return true;
    }
  );

  // getEngineBuilds from processEngineResources
  serviceContext.dbConnections['core'].read._push(
    [
      {
        id: buildId,
        engineId: engineId,
        status: 'deployed'
      }
    ],
    false
  );

  // getEngineSchemas from getSchemaResourcesByEngine
  serviceContext.dbConnections['core'].read._push([], false);

  // adding engine and engine build as resources, packageUpdateResourcesDb
  serviceContext.dbConnections['core'].write._push(
    [
      {
        id: 'packageResourceEngine'
      }
    ],
    false
  );
  serviceContext.dbConnections['core'].write._push(
    [
      {
        id: 'packageResourceEngineBuild'
      }
    ],
    false
  );

  serviceContext.dbConnections['core'].read._push(
    [{ resourceId: engineId }],
    false
  );
  // serviceContext.dbConnections['core'].read._push([], false);
  // serviceContext.dbConnections['core'].read._push([], false);
};

const dal = createDal(serviceContext);

beforeEach(() => {
  serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
  serviceContext.coreJob.cjdal.engine.deleteEngine.mockReset();
  context = mockUtil.makeContext();
});

afterAll(() => {
  jest.resetModules();
});

describe('dalEngine.js', () => {
  describe('#require', () => {
    it('should load module', () => {
      // validate basic structure
      expect(dal).toBeInstanceOf(Object);
      expect(Object.keys(dal).length).toBe(62);
    });
  });

  describe('#getEngineCategoryId', () => {
    it('should return null if engineId is null', async () => {
      const context = mockUtil.getGraphQLContext();
      const res = await dal.getEngineCategoryId(context, null);
      expect(res).toBeNull();
    });

    it('should return null if engineId is undefined', async () => {
      const context = mockUtil.getGraphQLContext();
      const res = await dal.getEngineCategoryId(context, undefined);
      expect(res).toBeNull();
    });

    it('should return null if engine not found', async () => {
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dal.getEngineCategoryId(context, 'unknown-engine-id');
      expect(res).toBeNull();
    });

    it('should return engine category id when engine is found', async () => {
      const context = mockUtil.getGraphQLContext('user');
      const categoryId = 'c5458876-43d2-41e8-a340-f734702df04a';
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engine-123', category_id: categoryId }],
        false
      );
      const res = await dal.getEngineCategoryId(context, 'engine-123');
      expect(res).toBe(categoryId);
    });
  });

  describe('#getIdById', () => {
    it('should return null if input engineId is null', async () => {
      let res, err;
      const context = mockUtil.getGraphQLContext();

      try {
        res = await dal.getIdById(context, null);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeNull();
      expect(err).toBeUndefined();
    });

    it('should return the input engineId if engineId not found', async () => {
      let res, err;
      const context = mockUtil.getGraphQLContext();

      try {
        res = await dal.getIdById(context, 'engineId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('engineId');
    });

    it('should return engineId by input engineId', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineIdfromDB' }],
        false
      );

      try {
        res = await dal.getIdById(context, 'engineId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('engineIdfromDB');
    });
  });

  describe('#getId', () => {
    it('should return internalId if org can show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        internalId: 'internalId'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getId(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('internalId');
    });

    it('should return alias or engineId if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        aliasId: 'aliasId',
        internalId: 'internalId'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      res = await dal.getId(context, engine);

      expect(res).toBeDefined();
      expect(res).toBe('aliasId');
    });

    it('should return engineId if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getId(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('engineId');
    });
  });

  describe('#getName', () => {
    it('should return engine name if org can show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        internalId: 'internalId',
        name: 'engineName'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getName(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('engineName');
    });

    it('should return alias name if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        aliasId: 'aliasId',
        internalId: 'internalId',
        name: 'engineName',
        aliasName: 'aliasName'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getName(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('aliasName');
    });

    it('should return engine name if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        aliasId: 'aliasId',
        internalId: 'internalId',
        name: 'engineName'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getName(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('engineName');
    });
  });

  describe('#getLogoPath', () => {
    it('should return engine logoPath if org can show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        internalId: 'internalId',
        name: 'engineName',
        logoPath: 'logoPath'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getLogoPath(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('logoPath');
    });

    it('should return aliasLogoPath if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        logoPath: 'logoPath',
        aliasLogoPath: 'aliasLogoPath'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getLogoPath(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('aliasLogoPath');
    });

    it('should return engine logoPath if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        logoPath: 'logoPath'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getLogoPath(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('logoPath');
    });
  });

  describe('#getDescription', () => {
    it('should return engine description if org can show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        internalId: 'internalId',
        name: 'engineName',
        description: 'description'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getDescription(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('description');
    });

    it('should return aliasDescription if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        description: 'description',
        aliasDescription: 'aliasDescription'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getDescription(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('aliasDescription');
    });

    it('should return engine description if org cannot show internal', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        description: 'description'
      };

      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = await dal.getDescription(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe('description');
    });
  });

  describe('#checkOrgShowInternalEngine', () => {
    it('should return true if org can show internal and engine is owner', () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        ownerOrganizationId: 7682
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = dal.checkOrgShowInternalEngine(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe(true);
    });

    it('should return true if org can show internal and engine is not owner', () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'enabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = dal.checkOrgShowInternalEngine(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe(true);
    });

    it('should return true if org cannot show internal and engine is owner', () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId',
        ownerOrganizationId: 7682
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = dal.checkOrgShowInternalEngine(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe(true);
    });

    it('should return false if org cannot show internal and engine is not owner', () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const engine = {
        id: 'engineId'
      };

      context._authInfo = context.userInfo;
      _.set(
        context,
        '_authInfo.organization.kvp.showInternalEngineFields',
        'disabled'
      );
      _.set(context, 'requestContext._authInfo', context._authInfo);

      try {
        res = dal.checkOrgShowInternalEngine(context, engine);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toBe(false);
    });
  });

  describe('#getEngine', () => {
    it('should not error if internal token gets engine first - VTN-29318', async () => {
      // tests for VTN-29318

      // first get the engine using an internal token context (no org)
      // this will put the engine in local cache.
      let context = mockUtil.getGraphQLContext('internal');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engine123',
            name: 'engine123',
            owner_organization_id: '7682'
          }
        ],
        false
      );
      let res = await dal.getEngine(context, { id: 'engine123' });
      expect(res).toBeDefined();

      // now retrieve the engine using a user-scoped token.
      // this will retrieve the engine from local cache and then
      // verify organization IDs.
      // regression was on null vs. [] cache of _allowedOrgs in engine object.
      context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engine123',
            name: 'engine123',
            owner_organization_id: '7682'
          }
        ],
        false
      );

      res = await dal.getEngine(
        context,
        { id: 'engine123', organizationId: '7682' },
        false
      );
      expect(res).toBeDefined();
    });

    it('should throw error if engineId was not passed', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = {};

      try {
        res = await dal.getEngine(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error if engineId not found', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'unknown_engineId' };
      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getEngine(context, args, false);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });

    it('should throw NotFound with objectId from args.id when engine not found', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'eng-1' };
      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getEngine(context, args, false);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(err.data.objectId).toBe('eng-1');
      expect(res).toBeUndefined();
    });

    it('should return engine by id from db', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'engineId', organizationId: 7682 };
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      res = await dal.getEngine(context, args);
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
    });

    it('should return engine including standalone job templates', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'engineId', organizationId: 7682 };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            single_engine_tdo_job_json: {
              tasks: [],
              supportedInputTypes: ['image/png', 'application/json']
            },
            single_engine_upload_job_json: {
              tasks: [],
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          }
        ],
        false,
        ['e.price_dimension']
      );

      res = await dal.getEngine(context, args);
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.singleEngineTdoJobJson.supportedInputTypes).toContain(
        'image/png'
      );
      expect(res.singleEngineUploadJobJson.supportedInputTypes).toContain(
        'audio/mp3'
      );
    });

    // Skipped. See https://github.com/veritone/aiware-core/issues/345.
    xit('should return engine by id from cache with allowCache is true', async function () {
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'engineId', organizationId: 7682 };
      serviceContext.redisCache.markCacheDirty(false);

      const res = await dal.getEngine(context, args, true);

      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
    });

    it('should return engine that was not from cache with allowCache is false', async () => {
      let res, err;
      let context = mockUtil.getGraphQLContext('user');
      const args = { id: 'engineId', organizationId: 123456 };
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      try {
        res = await dal.getEngine(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
    });
  });

  describe('#getEngineBuildReport', () => {
    it('should return empty if has errors when build engine report', async () => {
      let res, err;

      res = await dal.getEngineBuildReport();

      expect(res).toBeDefined();
      expect(_.isEmpty(res)).toBe(true);
    });

    it('should return build engine report', async () => {
      let res, err;

      try {
        res = await dal.getEngineBuildReport('engineId', 'buildId');
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.message).toBe('success');
    });
  });

  describe('#createEngine', () => {
    it('should throw InvalidInput if categoryId is not an uuid', async () => {
      let res, err;
      const args = {
        input: {
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'not-uuid'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dal.packages.updatePublicEngineList = jest
        .fn()
        .mockImplementation((args, context) => {
          expect(args.engineId).toBe('engineId');
        });

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'failure'
        })
      );
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should create engine with category', async () => {
      let res, err;
      const args = {
        input: {
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          industries: { foo: 'bar' },
          useCases: { foo: 'bar' },
          testingDetails: { email: 'test@gmail.com' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );
      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');

      // verify the event message when create Engine
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const message = _.head(serviceContext.messageUtil._messages());
      expect(message).toEqual({
        event: 'engine_create',
        type: 'engine',
        serviceName: 'core-graphql-server',
        requestUrl: _.get(context, 'requestInfo.httpUrl'),
        action: 'create',
        engineId: 'engineId',
        success: 201,
        updatedFields: {
          price: undefined
        },
        statusCode: 201,
        organizationId: args.organizationId,
        userId: _.get(context, '_authInfo.userId')
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });

    it('should create engine with empty fields', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        { id: 'engineId', metadataVersion: 1 }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.metadataVersion).toBe(1);
    });

    it('should create engine with metadataVersion 3', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          metadataVersion: 3,
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        { id: 'engineId', metadataVersion: 3 }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.metadataVersion).toBe(3);
      // event
      expect(serviceContext.messageUtil._counter()).toBe(2);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].event).toBe('engine_create');
    });
    it('should create engine with jwtRights - not allow', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          isPublic: true,
          jwtRights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: ['developer.engine.read'],
                assetRights: ['recording:create'],
                foo: ['bar']
              }
            ]
          },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        expect(error.message).toBe(
          'not allow to create jwtRights for public engines'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(err.data).toEqual({
        objectType: 'Engine isPublic',
        objectData: true
      });
    });

    it('should create engine with jwtRights', async () => {
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          jwtRights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: ['developer.engine.read'],
                assetRights: ['recording:create'],
                foo: ['bar']
              }
            ]
          },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      // engine category
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Transcription'
          }
        ],
        false
      );

      // insert engine
      serviceContext.dbConnections['core'].write._push([
        {
          engine_id: 'engineId',
          deployment_model: 3,
          category_id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          jwt_rights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: ['developer.engine.read'],
                assetRights: ['recording:create']
              }
            ]
          }
        }
      ]);

      const res = await dal.createEngine(args, context);

      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.jwtRights.roles).toHaveLength(1);
      expect(_.get(res, 'jwtRights.roles[0]')).toEqual({
        roleName: 'adapter',
        taskRights: ['developer.engine.read'],
        assetRights: ['recording:create']
      });
    });

    it('should create engine with standaloneJobTemplates including supported input types', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          standaloneJobTemplates: [
            {
              type: 1,
              template: { tasks: [] },
              supportedInputTypes: ['image/png', 'application/json']
            },
            {
              type: 2,
              template: { tasks: [] },
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          ]
        },
        organizationId: 7682
      };
      // const context = mockUtil.getGraphQLContext('user');
      // const svcContext = createMockServiceContext();
      // const eDal = createDal(svcContext);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          single_engine_tdo_job_json: {
            tasks: [],
            supportedInputTypes: ['image/png', 'application/json']
          },
          single_engine_upload_job_json: {
            tasks: [],
            supportedInputTypes: ['audio/mp3', 'application/text']
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      const context = mockUtil.getGraphQLContext('user');

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.singleEngineTdoJobJson.supportedInputTypes).toContain(
        'image/png'
      );
      expect(res.singleEngineUploadJobJson.supportedInputTypes).toContain(
        'audio/mp3'
      );
    });

    it('should create engine with cpu requirements, gpu supported, gpu tier, and website', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          cpuResourceMcpu: 2048,
          gpuSupported: 'aws_p2',
          gpuTier: 'medium',
          website: 'https://veritone.com'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          cpu_resource_mcpu: 2048,
          gpu_supported: 'aws_p2',
          gpu_tier: 'medium',
          website: 'https://veritone.com'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.cpuResourceMcpu).toBe(2048);
      expect(res.gpuSupported).toBe('aws_p2');
      expect(res.gpuTier).toBe('medium');
      expect(res.website).toBe('https://veritone.com');
    });

    it('should create engine with schemas and distribution type', async () => {
      const schemaRes = await mockSchemas();

      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          schemas: [
            {
              schemaId: schemaRes.id,
              ioType: 'input'
            }
          ],
          distributionType: 'public',
          price: '10',
          priceDimension: 'PRICE_PER_TASK'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          inputSchemas: [
            {
              engine_id: 'engineId',
              schema_id: schemaRes.id
            }
          ],
          distribution_type: 'public',
          price_dimension: 'price_per_task'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );
      // get schema
      serviceContext.dbConnections['third_party'].read._push(
        [
          {
            id: schemaRes.id
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engineId',
          schema_id: schemaRes.id,
          io_type: 'input'
        }
      ]);

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.id).toBe('engineId');
      expect(res.inputSchemas).toHaveLength(1);
      expect(res.distributionType).toBe('public');
      expect(res.priceDimension).toBe('price_per_task');
    });

    it('should create engine with entityTags', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          entityTags: [
            {
              tagKey: 'first-tag',
              tagValue: 'first-tag-value'
            },
            {
              tagKey: 'second-tag',
              tagValue: 'second-tag-value'
            }
          ]
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');
      const svcContext = createMockServiceContext();
      const eDal = createDal(svcContext);

      svcContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      svcContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          entityTags: [
            {
              tagKey: 'first-tag',
              tagValue: 'first-tag-value'
            },
            {
              tagKey: 'second-tag',
              tagValue: 'second-tag-value'
            }
          ]
        }
      ]);
      svcContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      svcContext.dbConnections['core'].read._push([
        {
          entity_id: 'engineId',
          entity_type: 'engine',
          tag_key: 'first-tag',
          tag_value: 'first-tag-value',
          organization_id: 7682
        },
        {
          entity_id: 'engineId',
          entity_type: 'engine',
          tag_key: 'second-tag',
          tag_value: 'second-tag-value',
          organization_id: 7682
        }
      ]);

      try {
        res = await eDal.createEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res.id).toBe('engineId');
      expect(res.entityTags).toHaveLength(2);
    });

    it('should create engine with title case name', async () => {
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          engineMode: 3,
          organizationName: 'Veritone, Inc.',
          manifest: { engineMode: 'stream' }
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      // engine category
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [{ id: 'engineId' }],
        true,
        ['Transcription-Veritone Inc-Stream-V3']
      );

      const res = await dal.createEngine(args, context);

      expect(res).toBeDefined();
    });

    it('should not call getOrganization when input.name is provided', async () => {
      const args = {
        input: {
          name: 'Custom Engine Name',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          industries: { foo: 'bar' },
          useCases: { foo: 'bar' },
          testingDetails: { email: 'test@gmail.com' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' }
        }
      };
      const context = mockUtil.makeContext();
      const getOrganizationSpy = jest.spyOn(
        serviceContext.dal.organization,
        'getOrganization'
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );
      const res = await dal.createEngine(args, context);
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(getOrganizationSpy).not.toHaveBeenCalled();
    });
    it('should call getOrganization when input.name is not provided and no organizationName in input', async () => {
      const args = {
        input: {
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          industries: { foo: 'bar' },
          useCases: { foo: 'bar' },
          testingDetails: { email: 'test@gmail.com' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          organizationId: 7682
        }
      };
      const context = mockUtil.makeContext();
      const getOrganizationSpy = jest
        .spyOn(serviceContext.dal.organization, 'getOrganization')
        .mockResolvedValue({ organizationName: 'Test Org Name' });
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );
      const res = await dal.createEngine(args, context);
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(getOrganizationSpy).toHaveBeenCalledWith(context, {
        id: args.input.organizationId
      });
    });

    it('should throw NotFound if schemaId does not exist', async () => {
      const schemaRes = await mockSchemas();
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe8',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          testingDetails: { email: 'test@gmail.com' },
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          schemas: [
            {
              schemaId: 'ca133d51-585c-415e-8a5f-017fb1662ac3',
              ioType: 'input'
            }
          ],
          distributionType: 'public',
          price: '10',
          priceDimension: 'PRICE_PER_TASK'
        },
        organizationId: 7682
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          inputSchemas: [
            {
              engine_id: 'engineId',
              schema_id: schemaRes.id
            }
          ],
          distribution_type: 'public',
          price_dimension: 'price_per_task'
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );
      // get schema
      serviceContext.dbConnections['third_party'].read._push([], false);
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engineId',
          schema_id: schemaRes.id,
          io_type: 'input'
        }
      ]);

      try {
        res = await dal.createEngine(args, context);
      } catch (error) {
        err = JSON.parse(JSON.stringify(error));
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
    });
  });

  describe('#updateEngine', () => {
    it('should throw not allowed if the user is not an admin, the engine state is active, and if something other than the name is being changed', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          name: 'new engine name',
          description: 'new engine description'
        }
      };
      const context = mockUtil.getGraphQLContext('user');
      context._authInfo = {
        isDevAdmin: false
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId', ownerOrganizationId: 7682 }
      ]);

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active'
          });
        }
      );
      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
    });
    it('should throw InvalidInput if name has too many characters', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          name: 'x'.repeat(201),
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          engineMode: 3,
          organizationName: 'Veritone, Inc.',
          manifest: { engineMode: 'stream' }
        }
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            name: 'Transcription'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId', ownerOrganizationId: 7682 }
      ]);
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            name: 'Transcription'
          });
        }
      );
      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should throw InvalidInput metadata version number is lower', async () => {
      let res, err;
      const localMetadataVersion = 10;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          metadataVersion: 5,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          engineMode: 3,
          organizationName: 'Veritone, Inc.',
          manifest: { engineMode: 'stream' }
        }
      };
      const context = mockUtil.getGraphQLContext('user');
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe7',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d',
            metadataVersion: localMetadataVersion,
            name: 'Transcription'
          }
        ],
        false
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        expect(error.message).toBe(
          'The engine metadata version specified must be greater than ' +
            localMetadataVersion
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should update engine with input dependency - engine not found', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: 'use cases',
          industries: 'industries',
          dependency: { dependencyType: 'transcript', assetType: 'media' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        }
      };
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            name: 'transcription',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push([
        { id: 'engineId', ownerOrganizationId: 7682 }
      ]);
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        expect(error.message).toBe('engine not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toBe('not_found');
    });

    it('should update engine with dependency from DB - engine not found', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: 'use cases',
          industries: 'industries',
          dependency: { foo: 'bar' },
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            name: 'transcription',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          ownerOrganizationId: 7682,
          dependency: { engine: 'transcript', assetType: 'media' }
        }
      ]);
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        expect(error.message).toBe('engine not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(res).toBeUndefined();
      expect(err.name).toBe('not_found');
    });

    it('should update engine without dependency - engine not found', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: 'use cases',
          industries: 'industries',
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            name: 'transcription',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        expect(error.message).toBe('engine not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(res).toBeUndefined();
      expect(err.name).toBe('not_found');
    });

    it('should update engine - validation errors', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: 'use cases',
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'a30eb786-18e8-4964-be93-6518b2616fe8',
            name: 'transcription',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f'
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2'
          });
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(res).toBeUndefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should update engine - invalid engine category id', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'categoryId',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active'
          });
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(res).toBeUndefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should update engine - throw internal error', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback('error');
        }
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'failure'
        })
      );
      expect(res).toBeUndefined();
      expect(err.name).toBe('internal_error');
    });

    it('should update engine - successfully', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          metadataVersion: 4,
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          priceDimension: 'PRICE_PER_TASK',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          gpuTier: 'large',
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          standaloneJobTemplates: [
            {
              type: 1,
              template: { tasks: [] },
              supportedInputTypes: ['image/png', 'application/json']
            },
            {
              type: 2,
              template: { tasks: [] },
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          ]
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      // getEngine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            name: args.input.name,
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );

      mockEnginePackage(
        'engineId',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        false,
        true
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            metadataVersion: 30,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Transcription' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          expect(engine.priceDimension).toBe('price_per_task');
          expect(engine.gpuTier).toBe('large');
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'engineId',
            single_engine_tdo_job_json: {
              tasks: [],
              supportedInputTypes: ['image/png', 'application/json']
            },
            single_engine_upload_job_json: {
              tasks: [],
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      // packageCreate --> _getResourceAlias --> getResourceAliasByType
      serviceContext.dal.engine.getEngine = jest.fn().mockReturnValue({
        id: 'test-engine-id',
        name: 'test-engine-name',
        aliasId: 'test-engine-alias'
      });

      const spy = jest.spyOn(serviceContext.dal.packages, 'packageCreate');
      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      // 3 messages total, first 2 are private events
      expect(messages[2].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe('engineId');
      expect(res.singleEngineTdoJobJson.supportedInputTypes).toContain(
        'image/png'
      );
      expect(res.singleEngineUploadJobJson.supportedInputTypes).toContain(
        'audio/mp3'
      );
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: args.input.name,
          resources: [
            {
              action: 'ADD',
              resourceId: 'engineId',
              resourceType: 'engine'
            }
          ]
        }),
        expect.anything(),
        expect.anything(),
        null
      );

      // event
      expect(serviceContext.messageUtil._counter()).toBe(5);
      expect(messages[0].event).toBe('engine_update'); // private
      expect(messages[1].event).toBe('engine_is_public'); // private event for updating engine to public
      expect(messages[2].engineId).toBe(res.id); // public event for updating engine to public

      // expect emit both package created and package installed events
      expect(messages[3].packageId).toBe('newPackageId'); // public event for creating automate package
      expect(messages[3].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(messages[4].packageId).toBe('newPackageId'); // public event for publishing automate package
      expect(messages[4].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });

    it('should update engine jwtRights - not allow', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 3,
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: 'use cases',
          industries: 'industries',
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          jwtRights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: ['developer.engine.read'],
                assetRights: ['recording:create'],
                foo: ['bar']
              }
            ]
          }
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId', ownerOrganizationId: 7682 }],
        false
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        expect(error.message).toBe(
          'not allow to update jwtRights for public engines'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(err.data).toEqual({
        objectType: 'Engine isPublic',
        objectData: true
      });
    });

    it('should update engine jwtRights', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          name: 'Transcription-Veritone Inc-Chunk-V3',
          engineId: 'engineId',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: false,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          jwtRights: {
            roles: [
              {
                roleName: 'adapter',
                taskRights: ['developer.engine.read'],
                assetRights: ['recording:create'],
                foo: ['bar']
              }
            ]
          }
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );

      mockEnginePackage(
        'engineId',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        false,
        true
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Transcription' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'engineId',
            jwtRights: {
              roles: [
                {
                  roleName: 'adapter',
                  taskRights: ['developer.engine.read'],
                  assetRights: ['recording:create']
                }
              ]
            }
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.jwtRights.roles).toHaveLength(1);
      expect(_.get(res, 'jwtRights.roles[0]')).toEqual({
        roleName: 'adapter',
        taskRights: ['developer.engine.read'],
        assetRights: ['recording:create']
      });
    });

    it('should update engine - remove icon when empty string passed', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          metadataVersion: 4,
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: '',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      // getEngine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' },
            iconPath: 'icon path'
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );

      mockEnginePackage(
        'engineId',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        false,
        true
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            metadataVersion: 30,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            iconPath: 'icon path'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Transcription' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, { engineId: 'engineId', iconPath: '' });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
      expect(res.iconPath).toBe('');
    });

    it('should update engine - should create a new package that includes the real deployed build', async () => {
      let res, err;
      const args = {
        input: {
          id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          metadataVersion: 4,
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: '',
          price: '10',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc'
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      // getEngine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' },
            iconPath: 'icon path'
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );

      mockEnginePackage(
        'b0748515-0014-49e9-8583-856cca5ffa0a',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        false,
        true,
        true
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            engineName: 'Test update engine with auto package creation',
            ownerOrganizationId: 7682,
            metadataVersion: 30,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            iconPath: 'icon path'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Transcription' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            iconPath: ''
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      const spy = jest.spyOn(serviceContext.dal.packages, 'packageCreate');
      spy.mockClear();
      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        // err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('b0748515-0014-49e9-8583-856cca5ffa0a');
      expect(res.iconPath).toBe('');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: [
            {
              action: 'ADD',
              resourceId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
              resourceType: 'engine'
            },
            {
              action: 'REMOVE',
              resourceId: 'buildId1',
              resourceType: 'engineBuild'
            },
            {
              action: 'REMOVE',
              resourceId: 'buildId2',
              resourceType: 'engineBuild'
            },
            {
              action: 'ADD',
              resourceId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
              resourceType: 'engineBuild'
            }
          ]
        }),
        expect.anything(),
        expect.anything(),
        null
      );
    });

    it('should throw NotFound if schemaId does not exist', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          engineId: 'engineId',
          metadataVersion: 4,
          name: 'Transcription-Veritone Inc-Chunk-V3',
          deploymentModel: 'HumanReview',
          fields: [{ name: { type: 'text', defaultValue: 'name field' } }],
          categoryId: 'a30eb786-18e8-4964-be93-6518b2616fe7',
          isPublic: true,
          description: 'engine description',
          createsTDO: true,
          logoPath: 'logo path',
          iconPath: 'icon path',
          price: '10',
          priceDimension: 'PRICE_PER_TASK',
          asset: { id: 'assetId' },
          displayName: 'engine display name',
          validateUri: 'http://localhost',
          executeUri: 'http://localhost',
          website: 'http://foo.bar',
          rating: 5,
          libraryRequired: true,
          useCases: ['use cases'],
          industries: ['industries'],
          edgeVersion: 3,
          manifest: { engineMode: 'chunk' },
          category: 'transcription',
          organizationName: 'Veritone, Inc',
          standaloneJobTemplates: [
            {
              type: 1,
              template: { tasks: [] },
              supportedInputTypes: ['image/png', 'application/json']
            },
            {
              type: 2,
              template: { tasks: [] },
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          ],
          schemas: [
            {
              schemaId: 'ca133d51-585c-415e-8a5f-017fb1662ac3',
              ioType: 'output'
            }
          ]
        },
        organizationId: 7682
      };
      const context = mockUtil.makeContext();

      // getEngine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            name: args.input.name,
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );
      // getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineId']
          }
        ],
        false
      );
      serviceContext.dbConnections['third_party'].read._push([], false);
      mockEnginePackage(
        'engineId',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        false,
        true
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            metadataVersion: 30,
            engineState: 'active',
            engineCategoryId: '1c244841-c010-4f3f-a918-44b9e1ded4a2'
          });
        }
      );
      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Transcription' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          expect(engine.priceDimension).toBe('price_per_task');
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'engineId',
            single_engine_tdo_job_json: {
              tasks: [],
              supportedInputTypes: ['image/png', 'application/json']
            },
            single_engine_upload_job_json: {
              tasks: [],
              supportedInputTypes: ['audio/mp3', 'application/text']
            }
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      // packageCreate --> _getResourceAlias --> getResourceAliasByType
      serviceContext.dal.engine.getEngine = jest.fn().mockReturnValue({
        id: 'test-engine-id',
        name: 'test-engine-name',
        aliasId: 'test-engine-alias'
      });

      const spy = jest.spyOn(serviceContext.dal.packages, 'packageCreate');
      try {
        res = await dal.updateEngine(args, context);
      } catch (error) {
        err = error;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
    });
  });

  describe('#deleteEngine', () => {
    it('should delete an engine', async () => {
      let res, err;
      const args = {
        id: 'engineId'
      };
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'disabled'
          });
        }
      );
      serviceContext.coreJob.cjdal.engine.deleteEngine.mockImplementationOnce(
        (engineId, dbClient, callback) =>
          callback(null, {
            engineId: 'engineId'
          })
      );
      serviceContext.dal.packages.updatePublicEngineList = jest
        .fn()
        .mockImplementation((args, context) => {
          expect(args.engineId).toBe('engineId');
        });

      serviceContext.dal.alwaysUpFlow.alwaysUpFlowDelete = jest
        .fn()
        .mockImplementation((args, context) => {
          expect(args.input.engineId).toBe('engineId');
        });

      try {
        res = await dal.deleteEngine(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('engineId');
    });
  });

  describe('#getBuild', () => {
    it('should get engine builds', async () => {
      let res, err;
      const args = {};
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId');
      expect(res.id).toBe('buildId');
    });

    it('should throw error if build not found', async () => {
      let res, err;
      const args = {};
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.getBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });
  });

  describe('#getBuilds', () => {
    it('should fetch all requested builds in a single batched call', async () => {
      let res, err;
      const context = mockUtil.getGraphQLContext('user');
      const buildIds = ['buildId1', 'buildId2'];

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId1', id: 'buildId1' },
        { engine_id: 'engineId2', id: 'buildId2' }
      ]);

      try {
        res = await dal.getBuilds({ ids: buildIds }, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toHaveLength(2);
      expect(res.map((build) => build.id)).toEqual(
        expect.arrayContaining(buildIds)
      );
    });

    it('should throw not_found when any requested build id is missing', async () => {
      let res, err;
      const context = mockUtil.getGraphQLContext('user');
      const buildIds = ['buildId1', 'buildId2'];

      // only buildId1 exists
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId1', id: 'buildId1' }
      ]);

      try {
        res = await dal.getBuilds({ ids: buildIds }, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(err.data.objectId).toBe('buildId2');
      expect(err.data.objectType).toBe('Build');
      expect(res).toBeUndefined();
    });
  });

  describe('#updateEngineBuild', () => {
    it('should throw error if do not have permissions', async () => {
      let res, err;
      const args = {
        input: { action: 'upload' }
      };
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(res).toBeUndefined();
    });

    it('should throw error if upload but still not have dockerImage', async () => {
      let res, err;
      const args = {
        input: { action: 'upload' }
      };
      const context = mockUtil.makeContext();
      context._authInfo.json = { rights: ['developer.build.upload'] };

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should update engine build', async () => {
      let res, err;
      const args = {
        input: {
          action: 'upload',
          dockerImage: 'dockerImage',
          id: '34d45f62-56be-4943-8396-91d2c0c0235b',
          engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.upload'] };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            isPublic: false,
            engineManifest: { foo: 'bar' }
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            id: '34d45f62-56be-4943-8396-91d2c0c0235b',
            docker_image: 'dockerImage',
            build_state: 'fetching'
          });
        }
      );
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, { supportedLanguages: [] });
        }
      );
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(null, build);
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            engineState: 'ready'
          });
        }
      );
      serviceContext.dbConnections['core'].write._push([
        { id: '34d45f62-56be-4943-8396-91d2c0c0235b' }
      ]);

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('34d45f62-56be-4943-8396-91d2c0c0235b');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpload,
        expect.any(Object),
        expect.objectContaining({
          action: 'upload',
          statusCode: 200
        }),
        undefined
      );
    });

    it('should fail to update engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          action: 'update',
          id: '34d45f62-56be-4943-8396-91d2c0c0235b',
          engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
          dockerImage: 'updated-docker-image'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.update'] };

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            isPublic: false,
            engineManifest: { foo: 'bar' }
          });
        }
      );

      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            id: '34d45f62-56be-4943-8396-91d2c0c0235b',
            buildState: 'uploaded'
          });
        }
      );

      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );

      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, { supportedLanguages: [] });
        }
      );

      // Mock updateEngineBuild to fail
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(
            new Error('Database update failed during build update')
          );
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildUpdate,
        expect.any(Object),
        expect.objectContaining({
          action: 'update',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });

    it('should successfully create package when deploying build with automatic package creation', async () => {
      let res, err;
      const args = {
        input: {
          action: 'deploy',
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = JSON.parse(JSON.stringify(mockUtil.makeContext()));

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            engineName: 'Test engine build deploy auto package creation',
            isPublic: false,
            engineState: 'active',
            ownerOrganizationId: 7682
          });
        }
      );
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'approved'
          });
        }
      );
      // pauseDeployedBuildsForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );
      // update build state
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(null, {
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'deployed'
          });
        }
      );

      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            engineState: 'active'
          });
        }
      );

      mockEnginePackage(
        'b0748515-0014-49e9-8583-856cca5ffa0a',
        'ab21dfab-cd8a-44a8-951d-349560ba5580',
        [
          {
            packageId: 'engineId',
            packageType: 'engine',
            autoGenerate: true,
            packageVersion: '1.0'
          }
        ],
        true,
        true
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engine_id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          build_state: 'deployed'
        }
      ]);

      // packageCreate --> _getResourceAlias --> getResourceAliasByType
      serviceContext.dal.engine.getEngine = jest.fn().mockReturnValue({
        id: 'test-engine-id',
        name: 'test-engine-name',
        aliasId: 'test-engine-alias'
      });

      const spy = jest.spyOn(serviceContext.dal.packages, 'packageCreate');
      spy.mockClear();

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test engine build deploy auto package creation',
          resources: [
            {
              action: 'ADD',
              resourceId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
              resourceType: 'engine'
            },
            {
              action: 'REMOVE',
              resourceId: 'buildId1',
              resourceType: 'engineBuild'
            },
            {
              action: 'REMOVE',
              resourceId: 'buildId2',
              resourceType: 'engineBuild'
            },
            {
              action: 'ADD',
              resourceId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
              resourceType: 'engineBuild'
            }
          ],
          primaryResourceId: 'b0748515-0014-49e9-8583-856cca5ffa0a'
        }),
        expect.anything(),
        expect.anything(),
        expect.anything()
      );

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDeploy,
        expect.any(Object),
        expect.objectContaining({
          action: 'deploy',
          statusCode: 200
        }),
        undefined
      );
    });

    it('should update engine build with release notes', async () => {
      let res, err;
      const args = {
        input: {
          action: 'update',
          id: '34d45f62-56be-4943-8396-91d2c0c0235b',
          engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
          releaseNotes: '# Notes about this release'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.update'] };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            isPublic: false,
            engineManifest: { foo: 'bar' }
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            id: '34d45f62-56be-4943-8396-91d2c0c0235b'
          });
        }
      );
      serviceContext.coreJob.jobBll.s3.getEngineBuildReport.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, {});
        }
      );
      serviceContext.coreJob.jobBll.s3.getEngineBuildManifest.mockImplementation(
        (engineId, buildId, callback) => {
          return callback(null, { supportedLanguages: [] });
        }
      );
      serviceContext.coreJob.cjdal.build.updateEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(null, build);
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            engineState: 'ready'
          });
        }
      );
      serviceContext.dbConnections['core'].write._push([
        { id: '34d45f62-56be-4943-8396-91d2c0c0235b' }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '34d45f62-56be-4943-8396-91d2c0c0235b',
          release_notes: '# Notes about this release'
        }
      ]);

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('34d45f62-56be-4943-8396-91d2c0c0235b');
      expect(res.releaseNotes).toBe('# Notes about this release');
    });

    it('should invalidate engine build', async () => {
      let res, err;
      const args = {
        input: {
          action: 'invalidate',
          dockerImage: 'dockerImage',
          id: 'bbfc29a5-8514-4587-b1c2-77ac8066131a',
          engineId: 'afee2495-a580-41a2-9654-1a91c1f51e67'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.invalidate'] };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'afee2495-a580-41a2-9654-1a91c1f51e67',
            isPublic: false
          });
        }
      );
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(null, {
            build_id: 'bbfc29a5-8514-4587-b1c2-77ac8066131a',
            build_state: 'invalid'
          });
        }
      );
      serviceContext.dbConnections['core'].write._push([
        { id: 'bbfc29a5-8514-4587-b1c2-77ac8066131a' }
      ]);

      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'approved'
          });
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('bbfc29a5-8514-4587-b1c2-77ac8066131a');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildInvalidate,
        expect.any(Object),
        expect.objectContaining({
          action: 'invalidate',
          statusCode: 204
        }),
        undefined
      );
    });

    it('should fail to invalidate engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          action: 'invalidate',
          dockerImage: 'dockerImage',
          id: 'bbfc29a5-8514-4587-b1c2-77ac8066131a',
          engineId: 'afee2495-a580-41a2-9654-1a91c1f51e67'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.invalidate'] };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'afee2495-a580-41a2-9654-1a91c1f51e67',
            isPublic: false
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'afee2495-a580-41a2-9654-1a91c1f51e67',
            buildId: 'bbfc29a5-8514-4587-b1c2-77ac8066131a',
            buildState: 'approved'
          });
        }
      );
      // Mock updateBuildState to fail
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('Database update failed'));
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildInvalidate,
        expect.any(Object),
        expect.objectContaining({
          action: 'invalidate',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });

    it('should submit and automatically approve for engine build - not a dev admin user', async () => {
      let res, err;
      const args = {
        input: {
          action: 'submit',
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.permissionMasks = [];
      context._authInfo.json = {
        rights: ['developer.access', 'developer.build.submit']
      };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            isPublic: false,
            engineState: 'active'
          });
        }
      );
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementationOnce(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'available'
          });
        }
      );
      // update build state
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(null, {
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'pending'
          });
        }
      );
      // getEngine
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            is_public: false
          }
        ],
        false
      );

      // updateBuildState
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(null, {
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'approved'
          });
        }
      );

      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            engineState: 'ready'
          });
        }
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engine_id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          build_state: 'approved'
        }
      ]);

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('ab21dfab-cd8a-44a8-951d-349560ba5580');
      expect(res.status).toBe('approved');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildSubmit,
        expect.any(Object),
        expect.objectContaining({
          action: 'submit',
          statusCode: 200
        }),
        undefined
      );

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildApprove,
        expect.any(Object),
        expect.objectContaining({
          action: 'approve',
          statusCode: 200
        }),
        undefined
      );
    });

    it('should fail to submit engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          action: 'submit',
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.permissionMasks = [];
      context._authInfo.json = {
        rights: ['developer.access', 'developer.build.submit']
      };

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            isPublic: false,
            engineState: 'active'
          });
        }
      );

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'available'
          });
        }
      );

      // Mock updateBuildState to fail
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('Database update failed during submit'));
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildSubmit,
        expect.any(Object),
        expect.objectContaining({
          action: 'submit',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });

    it('should fail to approve engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          action: 'approve',
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.approve'] };
      context._authInfo.isDevAdmin = true;

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            isPublic: false,
            engineState: 'active'
          });
        }
      );

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'pending'
          });
        }
      );

      // Mock updateBuildState to fail
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('Database update failed during approve'));
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildApprove,
        expect.any(Object),
        expect.objectContaining({
          action: 'approve',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });

    it('should deploy an engine build - not a dev admin user', async () => {
      let res, err;
      const args = {
        input: {
          action: 'deploy',
          buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = JSON.parse(JSON.stringify(mockUtil.makeContext()));

      context._authInfo.permissionMasks = [];
      context._authInfo.json = {
        rights: [
          'developer.access',
          'developer.build.deploy',
          'developer.build.update'
        ]
      };
      context._authInfo.organization.kvp.features.automaticPackageCreation =
        'disabled';

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            isPublic: false,
            engineState: 'active',
            ownerOrganizationId: 7682
          });
        }
      );
      //loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'approved'
          });
        }
      );
      // pauseDeployedBuildsForEngine
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );
      // update build state
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(null, {
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'deployed'
          });
        }
      );

      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            engineState: 'active'
          });
        }
      );

      mockEnginePackage(
        'b0748515-0014-49e9-8583-856cca5ffa0a',
        'ab21dfab-cd8a-44a8-951d-349560ba5580'
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engine_id: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          build_state: 'deployed'
        }
      ]);

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('ab21dfab-cd8a-44a8-951d-349560ba5580');
      expect(res.status).toBe('deployed');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDeploy,
        expect.any(Object),
        expect.objectContaining({
          action: 'deploy',
          statusCode: 200
        }),
        undefined
      );
    });

    it('should fail to deploy engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          action: 'deploy',
          id: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
          engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
          organizationId: 7682
        }
      };
      const context = JSON.parse(JSON.stringify(mockUtil.makeContext()));

      context._authInfo.json = { rights: ['developer.build.deploy'] };

      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            isPublic: false,
            engineState: 'active',
            ownerOrganizationId: 7682
          });
        }
      );

      // loadCheckBuild
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'b0748515-0014-49e9-8583-856cca5ffa0a',
            buildId: 'ab21dfab-cd8a-44a8-951d-349560ba5580',
            buildState: 'approved'
          });
        }
      );

      // pauseDeployedBuildsForEngine - succeed
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, null);
        }
      );

      // Mock updateBuildState to fail
      serviceContext.coreJob.cjdal.build.updateBuildState.mockImplementation(
        (buildId, buildState, dbClient, callback) => {
          return callback(new Error('Database update failed during deploy'));
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDeploy,
        expect.any(Object),
        expect.objectContaining({
          action: 'deploy',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });
    it('should return deleted engine build with delete action', async () => {
      let res, err;
      const args = {
        input: {
          action: 'delete',
          id: '34d45f62-56be-4943-8396-91d2c0c0235b',
          engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = { rights: ['developer.build.upload'] };
      // load check engine
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'a675b31e-5645-4dc4-9a08-56ecc0559082',
            engineState: 'ready'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            id: '34d45f62-56be-4943-8396-91d2c0c0235b',
            buildState: 'invalid'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementation(
        (buildId, dbClient, callback) => {
          expect(buildId).toEqual('34d45f62-56be-4943-8396-91d2c0c0235b');
          return callback(null, {});
        }
      );
      serviceContext.dbConnections['core'].write._push(
        [{ id: '34d45f62-56be-4943-8396-91d2c0c0235b' }],
        true,
        [],
        (sql) => {
          expect(sql).not.toMatch(/b.build_state != 'deleted'/);
          return true;
        }
      );

      try {
        res = await dal.updateEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('34d45f62-56be-4943-8396-91d2c0c0235b');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDelete,
        expect.any(Object),
        expect.objectContaining({
          action: 'delete',
          statusCode: 204
        }),
        undefined
      );
    });
  });

  describe('#createEngineBuild', () => {
    it('should create an engine build with release notes', async () => {
      let res, err;
      const args = {
        input: {
          engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d',
          releaseNotes: '# Release Note Title'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d',
            edgeVersion: 3,
            deploymentModel: 1,
            engineManifest: { foo: 'bar' }
          });
        }
      );
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(null, {
            engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d',
            buildId: '17f7f77a-f858-4eaf-8c19-15323a6404e0',
            releaseNotes: '# Release Note Title'
          });
        }
      );
      // autoTransitionEngineState
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d'
          });
        }
      );

      try {
        res = await dal.createEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('17f7f77a-f858-4eaf-8c19-15323a6404e0');
      expect(res.releaseNotes).toBe('# Release Note Title');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildCreate,
        expect.any(Object),
        expect.objectContaining({
          action: 'create',
          statusCode: 201
        }),
        undefined
      );
    });

    it('should fail to create an engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d',
          releaseNotes: '# Release Note Title'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: '07f1197f-0efd-4a58-95c6-14f8401bd53d',
            edgeVersion: 3,
            deploymentModel: 1,
            engineManifest: { foo: 'bar' }
          });
        }
      );

      // Mock createEngineBuild to fail
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(new Error('Database error during build creation'));
        }
      );

      try {
        res = await dal.createEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildCreate,
        expect.any(Object),
        expect.objectContaining({
          action: 'create',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });
  });

  describe('#deleteEngineBuild', () => {
    it('should delete an engine build', async () => {
      let res, err;
      const args = {
        input: {
          engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
          id: '1a7d9554-30b5-4e0e-863e-9ccdc455a596'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
            buildId: '1a7d9554-30b5-4e0e-863e-9ccdc455a596',
            ownerOrganizationId: 7682,
            engineState: 'ready'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
            buildId: '1a7d9554-30b5-4e0e-863e-9ccdc455a596',
            buildState: 'approved'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementation(
        (buildId, dbClient, callback) => {
          return callback(null, {});
        }
      );

      try {
        res = await dal.deleteEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe('1a7d9554-30b5-4e0e-863e-9ccdc455a596');

      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDelete,
        expect.any(Object),
        expect.objectContaining({
          action: 'delete',
          statusCode: 204
        }),
        undefined
      );
    });

    it('should fail to delete an engine build and emit failure event', async () => {
      let res, err;
      const args = {
        input: {
          engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
          id: '1a7d9554-30b5-4e0e-863e-9ccdc455a596'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
            buildId: '1a7d9554-30b5-4e0e-863e-9ccdc455a596',
            ownerOrganizationId: 7682,
            engineState: 'ready'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.getEngineBuild.mockImplementation(
        (buildId, engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'ec498dd3-5d2b-4e75-8ade-a85e566c7de5',
            buildId: '1a7d9554-30b5-4e0e-863e-9ccdc455a596',
            buildState: 'approved'
          });
        }
      );

      // Mock deleteEngineBuild to fail
      serviceContext.coreJob.cjdal.build.deleteEngineBuild.mockImplementation(
        (buildId, dbClient, callback) => {
          return callback(new Error('Database error during build deletion'));
        }
      );

      try {
        res = await dal.deleteEngineBuild(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();

      // Verify the failure event was emitted
      expect(
        serviceContext.coreJob.eventEmitter.emitEngineBuildEvent
      ).toHaveBeenCalledWith(
        eventsMap.EngineBuildDelete,
        expect.any(Object),
        expect.objectContaining({
          action: 'delete',
          statusCode: 500
        }),
        expect.any(Error)
      );
    });
  });

  describe('#cancelJob', () => {
    it('should cancel a job', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.jobBll.job.cancelJob.mockImplementationOnce(
        (jobId, applicationId, dbClient, callback) =>
          callback(null, { applicationId: 'app_id', organizationId: 'org_id' })
      );

      try {
        res = await dal.cancelJob(mockUtil.toTaskId('jobId'), context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(mockUtil.toTaskId('jobId'));
    });
  });

  describe('#retryJob', () => {
    it('should retry a job - job not found', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) => callback(null, null)
      );

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        expect(error.message).toBe('job not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toBe('not_found');
    });

    it('should retry a job - does not match job application id', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'nomatch'
          })
      );

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toBe('not_found');
    });

    it('should retry a job - Job has completed successfully. Unable to retry', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb'
          })
      );
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses = jest
        .fn()
        .mockImplementationOnce((tasks) => 'complete');

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        expect(error.message).toBe(
          'Job has completed successfully. Unable to retry.'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should retry a job - with v1 createJob', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            // Job model schema converts organizationId back to number
            organizationId: 7682,
            retries: 2,
            sourceAssetId: 'asset-master',
            tasks: [
              {
                taskId: mockUtil.toTaskId('jobId_taskId'),
                engineId: 'insert-into-index',
                taskStatus: 'queued'
              }
            ]
          })
      );
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses = jest
        .fn()
        .mockImplementationOnce((tasks) => 'running');
      // createJob in V3 or V1 job
      serviceContext.dal.job.createJob = jest
        .fn()
        .mockImplementation((jcontext, createJobArgs) => {
          const input = _.get(createJobArgs, 'input');
          expect(input.retries).toBe(3);
          expect(input.sourceAssetId).toBe('asset-master');
          // organizationId must be an integer, not a string
          expect(input.organizationId).toBe(7682);
          expect(typeof input.organizationId).toBe('number');
          expect(input.organizationIds).toEqual([7682]);
          const newJob = {
            id: mockUtil.toTaskId('jobId'),
            applicationId: input.applicationId,
            retries: input.retries
          };
          return newJob;
        });
      // dal.job.getJob
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId') }
      ]);

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(mockUtil.toTaskId('jobId'));
    });

    it('should retry a job - with v3 createJob', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            // Job model schema converts organizationId back to number
            organizationId: 7682,
            retries: 4,
            tasks: [
              {
                taskId: mockUtil.toTaskId('jobId_taskId'),
                engineId: 'insert-into-index',
                taskStatus: 'queued'
              }
            ],
            jobConfig: {
              routes: [
                {
                  options: {},
                  childIoFolderReferenceId: 'engine-in',
                  parentIoFolderReferenceId: 'si-out'
                },
                {
                  options: {},
                  childIoFolderReferenceId: 'ow-in',
                  parentIoFolderReferenceId: 'engine-out'
                }
              ]
            }
          })
      );
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses = jest
        .fn()
        .mockImplementationOnce((tasks) => 'running');
      // createJob in V3 or V1 job
      serviceContext.dal.v3Job.createJob = jest
        .fn()
        .mockImplementation((jcontext, createJobArgs) => {
          const input = _.get(createJobArgs, 'input');
          expect(input.retries).toBe(5);
          // organizationId must be an integer, not a string
          expect(input.organizationId).toBe(7682);
          expect(typeof input.organizationId).toBe('number');
          expect(input.organizationIds).toEqual([7682]);
          const newJob = {
            id: mockUtil.toTaskId('jobId'),
            applicationId: input.applicationId,
            retries: input.retries
          };
          return newJob;
        });
      // dal.job.getJob
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId') }
      ]);

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(mockUtil.toTaskId('jobId'));
    });

    it('should retry a job - update payload organizationId when organizationId is 0', async () => {
      let res, err;
      const context = mockUtil.makeContext();

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            organizationId: 0,
            retries: 1,
            tasks: [
              {
                taskId: mockUtil.toTaskId('jobId_taskId'),
                engineId: 'insert-into-index',
                taskStatus: 'queued',
                payload: {
                  taskPayload: {
                    organizationId: 123
                  }
                }
              }
            ]
          })
      );
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses = jest
        .fn()
        .mockImplementationOnce((tasks) => 'running');
      serviceContext.dal.job.createJob = jest
        .fn()
        .mockImplementation((jcontext, createJobArgs) => {
          const taskPayload = _.get(
            createJobArgs,
            'input.tasks[0].payload.taskPayload'
          );
          expect(taskPayload.organizationId).toBe(0);
          expect(_.get(createJobArgs, 'input.organizationId')).toBe(0);
          expect(_.get(createJobArgs, 'input.organizationIds')).toEqual([0]);
          return {
            id: mockUtil.toTaskId('jobId')
          };
        });

      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId') }
      ]);

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(mockUtil.toTaskId('jobId'));
    });

    it('should retry a job - normalize string organizationId and overwrite payload organizationId', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const originalTask = {
        taskId: mockUtil.toTaskId('jobId_taskId'),
        engineId: 'insert-into-index',
        taskStatus: 'queued',
        payload: {
          taskPayload: {
            organizationId: '7682'
          }
        }
      };

      serviceContext.coreJob.cjdal.job.getJobWithTasks.mockImplementationOnce(
        (jobId, dbClient, callback) =>
          callback(null, {
            jobId: mockUtil.toTaskId('jobId'),
            applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
            organizationId: '7682',
            retries: 1,
            tasks: [originalTask]
          })
      );
      serviceContext.coreJob.jobBll.job.getJobStatusFromTaskStatuses = jest
        .fn()
        .mockImplementationOnce((tasks) => 'running');
      serviceContext.dal.job.createJob = jest
        .fn()
        .mockImplementation((jcontext, createJobArgs) => {
          const input = _.get(createJobArgs, 'input');
          const taskPayload = _.get(input, 'tasks[0].payload.taskPayload');

          expect(input.organizationId).toBe(7682);
          expect(typeof input.organizationId).toBe('number');
          expect(input.organizationIds).toEqual([7682]);

          expect(taskPayload.organizationId).toBe(7682);
          expect(typeof taskPayload.organizationId).toBe('number');

          return {
            id: mockUtil.toTaskId('jobId')
          };
        });

      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId') }
      ]);

      try {
        res = await dal.retryJob(
          { jobId: mockUtil.toTaskId('jobId') },
          context
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.id).toBe(mockUtil.toTaskId('jobId'));
      expect(originalTask.payload.taskPayload.organizationId).toBe('7682');
    });
  });

  describe('#updateJobs', () => {
    it('should throw error, if missing ids', async () => {
      let res, err;
      const args = { input: {} };
      const context = mockUtil.getGraphQLContext('user');

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error, if missing status', async () => {
      let res, err;
      const args = { input: { ids: ['engineId'] } };
      const context = mockUtil.getGraphQLContext('user');

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should update jobs, to queued status', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9'],
          status: 'queued'
        }
      };
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toBe('19041617_2tLSStmCX9');
          expect(params[1]).toBe('update');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
    });

    it('should update jobs, to queued status checking for pending', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9'],
          status: 'queued'
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9'
          }
        ],
        false,
        [`(job_status = $7)`],
        (_sql, args) => {
          expect(args[6]).toBe('pending');
          return args[6] === 'pending';
        }
      );
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toBe('19041617_2tLSStmCX9');
          expect(params[1]).toBe('update');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
    });

    it('should update jobs, only matching required status', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9'],
          status: 'running',
          requiredCurrentStatus: 'queued'
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9'
          }
        ],
        false,
        [`(job_status = $6)`],
        (_sql, args) => {
          expect(args[5]).toBe('queued');
          return true;
        }
      );
      serviceContext.dbConnections['core'].write._push(
        [],
        false,
        ['job_audit'],
        (sql, params) => {
          expect(params[0]).toBe('19041617_2tLSStmCX9');
          expect(params[1]).toBe('update');
          return true;
        }
      );
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
    });

    it('should update jobs', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'running'
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
    });

    it('should throw error, if invalid taskId', async () => {
      let res, err;
      const args = {
        input: {
          ids: [mockUtil.toTaskId('taskId')],
          status: 'queued'
        }
      };
      const context = mockUtil.getGraphQLContext('user');

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should update jobs - to failed status without a reason, leaving task_output alone', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed'
        }
      };
      const context = mockUtil.makeContext();
      const currentTime = Math.floor(new Date().getTime() / 1000);

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId'
        },
        {
          id: '19041617_2tLSStmCX0',
          cluster_id: 'clusterId'
        }
      ]);
      // serviceContext.dal.cluster.getClusterList
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          },
          {
            task_id: mockUtil.toTaskId('taskId2'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX0',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          }
        ],
        false,
        ['task_status'],
        (sql, values) => {
          function failed(str) {
            return false;
          }

          if (values[0] !== '19041617_2tLSStmCX9')
            return failed(`${values[0]} must be 19041617_2tLSStmCX9`);
          if (values[1] !== '19041617_2tLSStmCX0')
            return failed(`${values[0]} must be 19041617_2tLSStmCX0`);
          if (values[4] !== 'failed')
            return failed(`${values[4]} must be failed`);

          // Nothing was supplied, so task_output must be untouched — this used to stamp a
          // manufactured task_validation over the real output of every task in the job.
          if (/task_output/.test(sql))
            return failed('task_output must not be updated');
          if (!_.isUndefined(values[6]))
            return failed(`no task_output param expected, got ${values[6]}`);

          return true;
        }
      );
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
      expect(res.records[1].taskId).toBe(mockUtil.toTaskId('taskId2'));
      expect(res.records[1].jobId).toBe('19041617_2tLSStmCX0');
      expect(res.records[1].status).toBe('failed');
      expect(res.records[1].modifiedDateTime).toBe(currentTime);
      expect(res.records[1].taskOutput).toEqual({
        foo: 'bar'
      });
    });

    it('should update jobs - to aborted status with taskOutput', async () => {
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'aborted',
          taskOutput: {
            failureReason: 'bar',
            failureMessage: 'the test message'
          }
        }
      };
      const context = mockUtil.makeContext();
      const currentTime = Math.floor(new Date().getTime() / 1000);

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId'
        },
        {
          id: '19041617_2tLSStmCX0',
          cluster_id: 'clusterId'
        }
      ]);
      // serviceContext.dal.cluster.getClusterList
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          },
          {
            task_id: mockUtil.toTaskId('taskId2'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX0',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          }
        ],
        false,
        ['task_status', 'task_output'],
        (sql, values) => {
          function failed(str) {
            return false;
          }

          if (values[0] !== '19041617_2tLSStmCX9')
            return failed(`${values[0]} must be 19041617_2tLSStmCX9`);
          if (values[1] !== '19041617_2tLSStmCX0')
            return failed(`${values[0]} must be 19041617_2tLSStmCX0`);
          if (values[4] !== 'aborted')
            return failed(`${values[4]} must be aborted`);
          if (!values[6]) return failed('task_output must be exists');

          if (values[6]) {
            if (values[6].failureReason !== 'task_validation') {
              return failed(
                `failureReason "${values[6].failureReason}" must be "task_validation"`
              );
            }
            // reason code replaced, but the caller's own message survives
            if (values[6].failureMessage !== 'the test message') {
              return failed(
                `failureMessage "${values[6].failureMessage}" must be "the test message"`
              );
            }
            if (values[6].isUnknownFailureType !== true) {
              return failed(`isUnknownFailureType value must be true`);
            }
          }

          return true;
        }
      );
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);

      // 'bar' is outside TaskFailureReason, so it is coerced above — but must not be coerced
      // silently, or sender enum drift stays invisible.
      const warn = jest.spyOn(serviceContext.logger, 'warn');

      let res;
      try {
        res = await dal.updateJobs(args, context);

        const drift = warn.mock.calls.find((call) =>
          call[0].includes('unrecognised failureReason')
        );
        expect(drift).toBeDefined();
        expect(drift[0]).toContain('19041617_2tLSStmCX9');
        // reported value in the meta object, never the format string — it is caller-controlled
        expect(drift[1]).toEqual({ failureReason: 'bar' });
      } finally {
        warn.mockRestore();
      }

      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
      expect(res.records[1].taskId).toBe(mockUtil.toTaskId('taskId2'));
      expect(res.records[1].jobId).toBe('19041617_2tLSStmCX0');
      expect(res.records[1].status).toBe('aborted');
      expect(res.records[1].modifiedDateTime).toBe(currentTime);
      expect(res.records[1].taskOutput).toEqual({ foo: 'bar' });
    });

    it('should update jobs - to failed status with taskOutput, with failureType and without failureMessage ', async () => {
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed',
          taskOutput: {
            failureType: 'external_error'
          }
        }
      };
      const context = mockUtil.makeContext();
      const currentTime = Math.floor(new Date().getTime() / 1000);

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId'
        },
        {
          id: '19041617_2tLSStmCX0',
          cluster_id: 'clusterId'
        }
      ]);
      // serviceContext.dal.cluster.getClusterList
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          },
          {
            task_id: mockUtil.toTaskId('taskId2'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX0',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          }
        ],
        false,
        ['task_status', 'task_output'],
        (sql, values) => {
          function failed(str) {
            return false;
          }

          if (values[0] !== '19041617_2tLSStmCX9')
            return failed(`${values[0]} must be 19041617_2tLSStmCX9`);
          if (values[1] !== '19041617_2tLSStmCX0')
            return failed(`${values[0]} must be 19041617_2tLSStmCX0`);
          if (values[4] !== 'failed')
            return failed(`${values[4]} must be failed`);
          if (!values[6]) return failed('task_output must be exists');

          if (values[6]) {
            if (values[6].failureReason !== 'external_error') {
              return failed(
                `failureReason "${values[6].failureReason}" must be "external_error"`
              );
            }
            if (
              values[6].failureMessage !==
              'The engine calls third party for processing and receives error.'
            ) {
              return failed(
                `failureMessage "${values[6].failureMessage}" must be "The engine calls third party for processing and receives error."`
              );
            }
            if (values[6].isUnknownFailureType !== false) {
              return failed(`isUnknownFailureType value must be false`);
            }
          }

          return true;
        }
      );
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);

      const res = await dal.updateJobs(args, context);
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
      expect(res.records[1].taskId).toBe(mockUtil.toTaskId('taskId2'));
      expect(res.records[1].jobId).toBe('19041617_2tLSStmCX0');
      expect(res.records[1].status).toBe('failed');
      expect(res.records[1].modifiedDateTime).toBe(currentTime);
      expect(res.records[1].taskOutput).toEqual({ foo: 'bar' });
    });

    it('should update jobs - to failed status with a taskOutput with failureType and a personalized failureMessage', async () => {
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed',
          taskOutput: {
            failureType: 'external_error',
            failureMessage: 'external error declared from edge'
          }
        }
      };
      const context = mockUtil.makeContext();
      const currentTime = Math.floor(new Date().getTime() / 1000);

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId'
        },
        {
          id: '19041617_2tLSStmCX0',
          cluster_id: 'clusterId'
        }
      ]);
      // serviceContext.dal.cluster.getClusterList
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].write._push(
        [
          {
            task_id: mockUtil.toTaskId('taskId1'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX9',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          },
          {
            task_id: mockUtil.toTaskId('taskId2'),
            application_id: 'applicationId',
            job_id: '19041617_2tLSStmCX0',
            task_status: args.input.status,
            modified_date_time: currentTime,
            task_output: { foo: 'bar' }
          }
        ],
        false,
        ['task_status', 'task_output'],
        (sql, values) => {
          function failed(str) {
            return false;
          }

          if (values[0] !== '19041617_2tLSStmCX9')
            return failed(`${values[0]} must be 19041617_2tLSStmCX9`);
          if (values[1] !== '19041617_2tLSStmCX0')
            return failed(`${values[0]} must be 19041617_2tLSStmCX0`);
          if (values[4] !== 'failed')
            return failed(`${values[4]} must be failed`);
          if (!values[6]) return failed('task_output must be exists');

          if (values[6]) {
            if (values[6].failureReason !== 'external_error') {
              return failed(
                `failureReason "${values[6].failureReason}" must be "external_error"`
              );
            }
            if (
              values[6].failureMessage !== 'external error declared from edge'
            ) {
              return failed(
                `failureMessage "${values[6].failureMessage}" must be "external error declared from edge"`
              );
            }
            if (values[6].isUnknownFailureType !== false) {
              return failed(`isUnknownFailureType value must be false`);
            }
          }

          return true;
        }
      );
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);
      serviceContext.dbConnections['core'].write._push([], false, [
        'job_audit'
      ]);

      const res = await dal.updateJobs(args, context);
      expect(res).toBeDefined();
      expect(res.records[0].taskId).toBe(mockUtil.toTaskId('taskId1'));
      expect(res.records[0].jobId).toBe('19041617_2tLSStmCX9');
      expect(res.records[1].taskId).toBe(mockUtil.toTaskId('taskId2'));
      expect(res.records[1].jobId).toBe('19041617_2tLSStmCX0');
      expect(res.records[1].status).toBe('failed');
      expect(res.records[1].modifiedDateTime).toBe(currentTime);
      expect(res.records[1].taskOutput).toEqual({ foo: 'bar' });
    });

    it('should throw error, if invalid ids', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed'
        }
      };
      const context = mockUtil.makeContext();

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId'
        }
      ]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        expect(error.message).toBe('invalid ids parameter');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(err.data.objectType).toBe('invalidJobIds');
      expect(err.data.objectData[0]).toBe('19041617_2tLSStmCX0');
    });

    it('should throw error, if jobs are missing clusterId', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed'
        }
      };
      const context = mockUtil.makeContext();

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9'
        },
        {
          id: '19041617_2tLSStmCX0'
        }
      ]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        expect(error.message).toBe(
          'disallow update v1/v2 job status to failed'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(err.data.objectType).toBe('status');
      expect(err.data.objectData).toBe('failed');
    });

    it('should throw error, if jobs are v1/v2', async () => {
      let res, err;
      const args = {
        input: {
          ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
          status: 'failed'
        }
      };
      const context = mockUtil.makeContext();

      // serviceContext.dal.job.getJobs
      serviceContext.dbConnections['core'].read._push([
        {
          id: '19041617_2tLSStmCX9',
          cluster_id: 'clusterId1'
        },
        {
          id: '19041617_2tLSStmCX0',
          cluster_id: 'clusterId2'
        }
      ]);
      // serviceContext.dal.cluster.getClusterList
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId1', edge_version: 2 },
        { id: 'clusterId2' }
      ]);

      try {
        res = await dal.updateJobs(args, context);
      } catch (error) {
        expect(error.message).toBe(
          'disallow update v1/v2 job status to failed'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('not_allowed');
      expect(err.data.objectId).toBe('clusterId1');
      expect(err.data.objectType).toBe('status');
      expect(err.data.objectData).toBe('failed');
    });

    describe('#updateJobsDb', () => {
      const serviceCtx = _.cloneDeep(serviceContext);
      const dalEngine = createDal(serviceCtx);
      beforeEach(() => {
        serviceCtx._clearAll();
      });
      it('Should not call anything if no jobs are updated', async () => {
        let res, err;
        const args = {
          input: {
            ids: ['19041617_2tLSStmCX9'],
            status: 'queued'
          }
        };
        const context = mockUtil.getGraphQLContext('user');

        // Update jobs/ tasks
        serviceCtx.dbConnections['core'].read._push([], false);
        serviceCtx.dal.organization.getOrgIdFromAppId = jest
          .fn()
          .mockReturnValue({});

        try {
          res = await dalEngine.updateJobsDb(args, context);
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res).toEqual({
          records: [],
          count: 0
        });
        expect(
          serviceCtx.dal.organization.getOrgIdFromAppId
        ).not.toHaveBeenCalled();
      });
      it(`Update a part: Only update 1 job/ 2 jobs were passed in due to job's condition does not match`, async () => {
        let res, err;
        const args = {
          input: {
            ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
            status: 'queued'
          }
        };
        const context = mockUtil.getGraphQLContext('user');

        // Update jobs/ tasks
        serviceCtx.dbConnections['core'].read._push(
          [
            {
              task_id: '19041617_2tLSStmCX01234',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX056789',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            }
          ],
          false
        );
        // getOrgIdFromAppId
        serviceCtx.dal.organization.getOrgIdFromAppId = jest
          .fn()
          .mockReturnValueOnce(123);

        // emitTaskQueuedEvent
        serviceCtx.messageUtil.emitTaskQueuedEvent = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2);
        // createJobAudit
        serviceCtx.dal.job.createJobAudit = jest.fn().mockReturnValueOnce(true);

        try {
          res = await dalEngine.updateJobsDb(args, context);
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res).toMatchObject({
          records: [
            {
              id: '19041617_2tLSStmCX0',
              status: 'queued'
            }
          ],
          count: 1
        });
        expect(
          serviceCtx.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledTimes(1);
        expect(
          serviceCtx.messageUtil.emitTaskQueuedEvent
        ).toHaveBeenCalledTimes(2);
        expect(serviceCtx.dal.job.createJobAudit).toHaveBeenCalledTimes(1);
      });
      it(`Update a part: Only update 1 job/ 2 jobs were passed in due to unable to get orgId by appId`, async () => {
        let res, err;
        const args = {
          input: {
            ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
            status: 'queued'
          }
        };
        const context = mockUtil.getGraphQLContext('user');

        // Update jobs/ tasks
        serviceCtx.dbConnections['core'].read._push(
          [
            {
              task_id: '19041617_2tLSStmCX91234',
              job_id: '19041617_2tLSStmCX9',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX01234',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX056789',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            }
          ],
          false
        );
        // getOrgIdFromAppId
        serviceCtx.dal.organization.getOrgIdFromAppId = jest
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValueOnce(123);

        // emitTaskQueuedEvent
        serviceCtx.messageUtil.emitTaskQueuedEvent = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(3);
        // createJobAudit
        serviceCtx.dal.job.createJobAudit = jest.fn().mockReturnValueOnce(true);

        try {
          res = await dalEngine.updateJobsDb(args, context);
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res).toMatchObject({
          records: [
            {
              id: '19041617_2tLSStmCX9',
              status: 'queued'
            },
            {
              id: '19041617_2tLSStmCX0',
              status: 'queued'
            }
          ],
          count: 2
        });
        expect(
          serviceCtx.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledTimes(2);
        expect(
          serviceCtx.messageUtil.emitTaskQueuedEvent
        ).toHaveBeenCalledTimes(3);
        expect(serviceCtx.dal.job.createJobAudit).toHaveBeenCalledTimes(1);
      });
      it('Should update all jobs to DB', async () => {
        let res, err;
        const args = {
          input: {
            ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
            status: 'queued'
          }
        };
        const context = mockUtil.getGraphQLContext('user');

        // Update jobs/ tasks
        serviceCtx.dbConnections['core'].read._push(
          [
            {
              task_id: '19041617_2tLSStmCX91234',
              job_id: '19041617_2tLSStmCX9',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX01234',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX056789',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            }
          ],
          false
        );
        // getOrgIdFromAppId
        serviceCtx.dal.organization.getOrgIdFromAppId = jest
          .fn()
          .mockReturnValueOnce(123)
          .mockReturnValueOnce(456);

        // emitTaskQueuedEvent
        serviceCtx.messageUtil.emitTaskQueuedEvent = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(3);
        // createJobAudit
        serviceCtx.dal.job.createJobAudit = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2);

        try {
          res = await dalEngine.updateJobsDb(args, context);
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res).toMatchObject({
          records: [
            {
              id: '19041617_2tLSStmCX9',
              status: 'queued'
            },
            {
              id: '19041617_2tLSStmCX0',
              status: 'queued'
            }
          ],
          count: 2
        });
        expect(
          serviceCtx.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledTimes(2);
        expect(
          serviceCtx.messageUtil.emitTaskQueuedEvent
        ).toHaveBeenCalledTimes(3);
        expect(serviceCtx.dal.job.createJobAudit).toHaveBeenCalledTimes(2);
      });

      it('Completed with an error in the logs for createJobAudit', async () => {
        let res, err;
        const args = {
          input: {
            ids: ['19041617_2tLSStmCX9', '19041617_2tLSStmCX0'],
            status: 'queued'
          }
        };
        const context = mockUtil.getGraphQLContext('user');

        // Update jobs/ tasks
        serviceCtx.dbConnections['core'].read._push(
          [
            {
              task_id: '19041617_2tLSStmCX91234',
              job_id: '19041617_2tLSStmCX9',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX01234',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            },
            {
              task_id: '19041617_2tLSStmCX056789',
              job_id: '19041617_2tLSStmCX0',
              task_status: 'queued'
            }
          ],
          false
        );
        // getOrgIdFromAppId
        serviceCtx.dal.organization.getOrgIdFromAppId = jest
          .fn()
          .mockReturnValueOnce(123)
          .mockReturnValueOnce(456);

        // emitTaskQueuedEvent
        serviceCtx.messageUtil.emitTaskQueuedEvent = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(3);
        // createJobAudit
        serviceCtx.dal.job.createJobAudit = jest
          .fn()
          .mockReturnValueOnce(1)
          .mockRejectedValue(new Error('failed to create job audit'));

        try {
          res = await dalEngine.updateJobsDb(args, context);
        } catch (error) {
          err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
        }

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res).toMatchObject({
          records: [
            {
              id: '19041617_2tLSStmCX9',
              status: 'queued'
            },
            {
              id: '19041617_2tLSStmCX0',
              status: 'queued'
            }
          ],
          count: 2
        });
        expect(
          serviceCtx.dal.organization.getOrgIdFromAppId
        ).toHaveBeenCalledTimes(2);
        expect(
          serviceCtx.messageUtil.emitTaskQueuedEvent
        ).toHaveBeenCalledTimes(3);
        expect(serviceCtx.dal.job.createJobAudit).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('#getEngines', () => {
    const context = mockUtil.makeContext();

    it('should filter engines by entityTags', async () => {
      let res, err;
      const options = {
        filter: {
          entityTags: [
            {
              key: 'second-tag'
            },
            {
              key: 'non-existent key'
            }
          ]
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            dependencies: [
              { dependencyType: 'transcript', assetType: 'media' }
            ],
            name: 'voicebase',
            typeId: '0ab2745b-ca6b-43c9-befd-0ef1d28cb96f',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId']
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'engineId',
          entityTags: [
            {
              tagKey: 'first-tag',
              tagValue: 'first-tag-value'
            },
            {
              tagKey: 'second-tag',
              tagValue: 'second-tag-value'
            }
          ]
        }
      ]);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            email: 'test@gmail.com'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          entity_id: 'engineId',
          entity_type: 'engine',
          tag_key: 'first-tag',
          tag_value: 'first-tag-value',
          organization_id: 7682
        },
        {
          entity_id: 'engineId',
          entity_type: 'engine',
          tag_key: 'second-tag',
          tag_value: 'second-tag-value',
          organization_id: 7682
        }
      ]);

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
    });

    it('should get engine without category', async () => {
      let res, err;
      const options = {};

      serviceContext.dbConnections['core'].read._push([{ id: 'engineId' }]);

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should return empty records if category not found', async () => {
      let res, err;
      const options = { category: 'foo' };

      serviceContext.dbConnections['core'].read._push([], false);

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(0);
    });

    it('should get engines with category', async () => {
      let res, err;
      const options = { category: 'foo1', organizationId: 7682 };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      serviceContext.dbConnections['core'].read._push([{ id: 'engineId' }]);
      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get list engines with admin view and all organization', async () => {
      let res, err;
      const options = {
        ids: [],
        category: 'category_4',
        categoryId: ['categoryId'],
        state: ['state'],
        filter: {
          deploymentModel: 0,
          rating: 1,
          priceMin: 0,
          priceMax: 10,
          category: ['category'],
          mode: ['mode'],
          runtimeType: ['runtimeType'],
          type: ['Ingestion', 'Cognition', 'Aggregator'],
          foo: 'bar',
          arrayFoo: ['bar'],
          mediaSourceTypeId: 'mediaSourceTypeId'
        },
        adminView: true,
        appPackageId: 'appPackageId',
        owned: true,
        includeDeleted: true,
        libraryRequired: true,
        createsTDO: true,
        name: 'engine name',
        assetTag: 'assetTag',
        includeVirtualEngines: true,
        orderBy: [{ field: 'id', direction: 'desc' }],
        limit: 30,
        offset: 0
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get list engines with full filter', async () => {
      let res, err;
      const options = {
        ids: ['engineId'],
        category: 'category',
        categoryId: ['categoryId'],
        state: ['state'],
        filter: {
          deploymentModel: 0,
          rating: 1,
          priceMin: 0,
          priceMax: 10,
          category: ['category'],
          gpuSupported: '123',
          mode: ['mode'],
          runtimeType: ['runtimeType'],
          type: ['Ingestion', 'Cognition', 'Aggregator'],
          foo: 'bar',
          arrayFoo: ['bar'],
          mediaSourceTypeId: 'mediaSourceTypeId',
          distributionTypes: [
            'private',
            'org_locked',
            'sharable',
            'public',
            'marketplace',
            'instance_locked'
          ]
        },
        adminView: true,
        organizationId: 7682,
        appPackageId: 'appPackageId',
        owned: true,
        includeDeleted: true,
        libraryRequired: true,
        createsTDO: true,
        name: 'engine name',
        assetTag: 'assetTag',
        includeVirtualEngines: true,
        orderBy: [{ field: 'id', direction: 'desc' }],
        limit: 30,
        offset: 0,
        priceDimension: 'PRICE_PER_TASK'
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false,
        ['e.price_dimension']
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get list engines with simple filter', async () => {
      let res, err;
      const options = {
        id: 'engineId',
        category: 'category_1',
        categoryId: 'categoryId',
        filter: {
          foo: 'bar',
          arrayFoo: ['bar'],
          type: 'Ingestion'
        },
        organizationId: 7682,
        owned: false,
        orderBy: [{ field1: 'id', direction: 'desc' }]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get list engines with filter engine type', async () => {
      let res, err;
      const options = {
        id: 'engineId',
        category: 'category_3',
        categoryId: 'categoryId',
        filter: {
          foo: 'bar',
          arrayFoo: ['bar'],
          type: ['Ingestion', 'Cognition', 'Aggregator']
        },
        organizationId: 7682,
        owned: false,
        orderBy: [{ field1: 'id', direction: 'desc' }]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get list engines with filter engine template input types', async () => {
      let res, err;
      const options = {
        id: 'engineId',
        category: 'category_3',
        categoryId: 'categoryId',
        filter: {
          engineTemplateInputTypes: ['audio/mp3', 'image/png']
        },
        organizationId: 7682,
        owned: false,
        orderBy: [{ field1: 'id', direction: 'desc' }]
      };

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategoryId',
            engine_ids: ['engineId'],
            engine_alias_ids: ['engineAliasIds']
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        { business_unit: 'abc' }
      ]);
      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            standaloneJobTemplates: [
              {
                type: 'Upload',
                template: {
                  template: 'something else',
                  templateLanguage: 'Handlebars',
                  supportedInputTypes: ['image/png', 'audio/mp3']
                }
              }
            ]
          }
        ],
        false
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
      expect(
        res.records[0].standaloneJobTemplates[0].template.supportedInputTypes
      ).toContain('image/png');
      expect(
        res.records[0].standaloneJobTemplates[0].template.supportedInputTypes
      ).toContain('audio/mp3');
    });

    it('should get list engines with empty sqlWhere', async () => {
      let res, err;
      const options = {
        owned: false,
        orderBy: [{ field: 'id' }],
        includeDeleted: true
      };

      serviceContext.dbConnections['sso'].write._push([], false);
      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );

      try {
        res = await dal.getEngines(context, options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].id).toBe('engineId');
    });

    it('should get engine by id successfully', async () => {
      serviceContext.dbConnections['core'].write._push(
        engineList.filter(
          (engine) => engine.id === '0981e79f-de99-489e-a2c4-366c4b466321'
        ),
        false
      );
      const res = await dal.getEngines(context, {
        id: '0981e79f-de99-489e-a2c4-366c4b466321'
      });
      expect(res.records[0].id).toBe('0981e79f-de99-489e-a2c4-366c4b466321');
    });

    it('should get metadataVersion', async () => {
      serviceContext.dbConnections['core'].write._push(
        engineList.filter(
          (engine) => engine.id === '0981e79f-de99-489e-a2c4-366c4b466321'
        ),
        false
      );
      const res = await dal.getEngines(context, {
        id: '0981e79f-de99-489e-a2c4-366c4b466321'
      });
      expect(res.records[0].metadataVersion).toBe(metadataVersion);
    });
    it('should limit engines returned', async () => {
      serviceContext.dbConnections['core'].write._push(engineList);
      const res = await dal.getEngines(context, {
        limit: 2
      });
      expect(res.records.length).toBe(2);
    });

    it('should limit engines returned', async () => {
      serviceContext.dbConnections['core'].write._push(engineList);
      const res = await dal.getEngines(context, {
        limit: 2
      });
      expect(res.records.length).toBe(2);
    });

    it('limits engines returned', async () => {
      serviceContext.dbConnections['core'].write._push(engineList);
      const res = await dal.getEngines(context, {
        limit: 2
      });
      expect(res.records.length).toBe(2);
    });

    it('filters engines by runtimeType', async () => {
      serviceContext.dbConnections['core'].write._push(
        _.filter(engineList, (engine) => engine.runtimeType === 'edge')
      );
      const res = await dal.getEngines(context, {
        runtimeType: 'edge'
      });
      expect(res.records[0].runtimeType).toBe('edge');
    });

    it('filters engines by state', async () => {
      serviceContext.dbConnections['core'].write._push(
        _.filter(engineList, (engine) => engine.state === 'active')
      );
      const res = await dal.getEngines(context, {
        state: 'active'
      });
      expect(res.records[0].state).toBe('active');
      expect(res.records[1].state).toBe('active');
    });

    it('filters engines by category', async () => {
      serviceContext.dbConnections['core'].write._push(
        _.map(
          _.filter(
            engineList,
            (engine) => engine.category.name === 'Facial Detection'
          ),
          (engine) => engine.category
        ),
        false
      );
      serviceContext.dbConnections['sso'].write._push(
        [{ application_id: 'applicationId' }],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        _.filter(
          engineList,
          (engine) => engine.category.name === 'Facial Detection'
        )
      );
      const res = await dal.getEngines(context, {
        category: 'Facial Detection'
      });
      expect(res.records[0].category.name).toBe('Facial Detection');
    });

    it('filters engines by EngineFilter runtimeType', async () => {
      serviceContext.dbConnections['core'].write._push(
        [_.find(engineList, (engine) => engine.runtimeType === 'edge')],
        false
      );
      const res = await dal.getEngines(context, {
        filter: {
          runtimeType: ['edge']
        }
      });
      expect(res.records[0].runtimeType).toBe('edge');
    });

    it('filters engines by EngineFilter clusterSizes', async () => {
      serviceContext.dbConnections['core'].write._push(
        [
          _.find(
            engineList,
            (engine) =>
              engine.builds.records[0].manifest.clusterSize === 'large'
          )
        ],
        false
      );
      const res = await dal.getEngines(context, {
        filter: {
          clusterSizes: ['large']
        }
      });
      expect(res.records[0].builds.records[0].manifest.clusterSize).toBe(
        'large'
      );
    });

    it('filters engines by EngineFilter supportedInputFormats', async () => {
      serviceContext.dbConnections['core'].write._push(
        [
          _.find(engineList, (engine) =>
            _.includes(
              engine.builds.records[0].manifest.supportedInputFormats,
              'video/mp4'
            )
          )
        ],
        false
      );
      const res = await dal.getEngines(context, {
        filter: {
          supportedInputFormats: ['video/mp4']
        }
      });
      expect(res.records.length).toBe(1);
      expect(
        res.records[0].builds.records[0].manifest.supportedInputFormats[0]
      ).toBe('video/mp4');
    });

    it('should retrieve allowed engines from the publicEngines package using packageGrant', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;

      context._authInfo = {
        organization: {
          organizationId: 4172,
          kvp: {
            features: {
              useEngineGrant: 'enabled'
            }
          }
        }
      };

      serviceContext.dbConnections['core'].read._push(engineList, false);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '14b64075-56b0-471a-bee0-80b025f5bc77',
          organization_id: 39696,
          alias_id: '14b64075-56b0-471a-bee0-80b025f5bc77',
          category_id: '3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923',
          name: 'Pangeanic - Slovenian to English',
          description: 'Pangeanic - Slovenian to English-description',
          state: 'active',
          currency: 'USD',
          deployment_model: 0,
          owner_organization_id: 7682,
          is_public: true,
          price: 5678,
          rating: 1,
          website:
            'http://www8.hp.com/us/en/software-solutions/information-data-analytics-idol/',
          logo_path:
            'http://www8.hp.com/us/en/software-solutions/information-data-analytics-idol/logo',
          icon_path:
            'http://www8.hp.com/us/en/software-solutions/information-data-analytics-idol/icon',
          order: 200,
          dependency: [
            {
              max: null,
              min: null,
              info: 'Type of speaker recognition to include in the output: speaker - speaker identification, takes significantly longer; speaker_change - speaker changed, but no identification',
              name: 'diarization',
              step: null,
              type: 'picklist',
              label: 'Diarization',
              value: null,
              options: [
                {
                  key: 'speaker',
                  value: 'speaker'
                },
                {
                  key: 'speaker_change',
                  value: 'speaker_change'
                }
              ],
              required: false,
              defaultValue: null
            }
          ],
          core_job_data: {
            category: 'audio-detection',
            dependencies: ['ingestion', 'transcode']
          },
          fields: [],
          application_id: 'oiuhgvdhs-132323-sdsdsd',
          asset: '18173733-7fad-4654-af6e-b5ddbe63468c',
          creates_recording: false,
          library_required: true,
          deleted: false,
          created_date_time: 1591304884,
          modified_date_time: 1666037768,
          alias_name: 'Entity Extraction AC',
          alias_description: 'Entity Extraction AC description',
          distribution_type: 'public'
        }
      ]);

      const res = await dal.getEngines(context, {
        filter: {
          isPublic: true
        },
        owned: true,
        limit: 10
      });

      expect(res.records.length).toBe(1);
      const item = res.records[0];
      expect(item.id).toBe('14b64075-56b0-471a-bee0-80b025f5bc77');
      expect(item.distributionType).toBe('public');
    });

    it('should retrieve empty allowed engines list when resource_id from package query is empty, using packageGrant flow', async () => {
      serviceContext.config.featureFlags.enablePackageGrantLogic = true;

      context._authInfo = {
        organization: {
          organizationId: 4172,
          kvp: {
            features: {
              useEngineGrant: 'enabled'
            }
          }
        }
      };

      serviceContext.dbConnections['core'].read._push([], false);
      const res = await dal.getEngines(context, {
        filter: {
          isPublic: true
        },
        owned: false,
        limit: 10
      });

      expect(res.records.length).toBe(0);
    });
  });

  describe('#getEngineJWTToken', () => {
    it('should throw error if jobId not exists in task', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          resource: {
            tdoId: '123',
            jobId: mockUtil.toTaskId('jobId'),
            taskId: mockUtil.toTaskId('taskId')
          },
          engineId: 'engineId'
        },
        applicationId: 'applicationId'
      };

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId' }],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: '123',
          application_id: 'applicationId'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId'), application_id: 'applicationId' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('taskId'), job_id: mockUtil.toTaskId('jobId1') }
      ]);

      try {
        res = await dal.getEngineJWTToken(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });

    it('should get engine JWT token', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          resource: {
            jobId: mockUtil.toTaskId('jobId1'),
            taskId: mockUtil.toTaskId('taskId1'),
            userId: 'e2051840-3490-43ff-819f-5be476683439'
          },
          engineId: 'engineId1'
        },
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId1' }],
        false
      );
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId1'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId1'), application_id: 'applicationId' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('taskId1'),
          job_id: mockUtil.toTaskId('jobId1'),
          application_id: 'applicationId'
        }
      ]);
      mockUserData(serviceContext.dbConnections['sso'].read);
      // get oldest org admin default in tokenHelper.createJwtToken
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['sso'].read._push([]);

      try {
        res = await dal.getEngineJWTToken(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId1');
    });

    it('should get engine JWT token when get orgId from appId', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          resource: {
            tdoId: '1234',
            jobId: mockUtil.toTaskId('jobId2'),
            taskId: mockUtil.toTaskId('taskId2')
          },
          engineId: 'engineId2'
        },
        applicationId: 'applicationId'
      };

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId2' }],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '1234',
            application_id: 'applicationId'
          }
        ],
        false
      );
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: mockUtil.toTaskId('jobId2'), application_id: 'applicationId' }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('taskId2'),
          job_id: mockUtil.toTaskId('jobId2'),
          application_id: 'applicationId'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);
      // get oldest org admin default in tokenHelper.createJwtToken
      /// getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '0000000-0000-2222-0000-00000000000' }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['sso'].read._push([]);

      res = await dal.getEngineJWTToken(context, args);

      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId2');
    });

    it('should get engine JWT token without taskId', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          resource: { tdoId: '12345', jobId: 'jobId3' },
          engineId: 'engineId3'
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId3' }],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: '12345',
          application_id: 'applicationId'
        }
      ]);
      // get job -> check partition tables
      mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        'jobId'
      );
      serviceContext.dbConnections['core'].read._push([
        { id: 'jobId3', application_id: 'applicationId' }
      ]);
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);
      // get oldest org admin default in tokenHelper.createJwtToken
      /// getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '0000000-0000-2222-0000-00000000000' }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['sso'].read._push([]);

      res = await dal.getEngineJWTToken(context, args);

      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId3');
    });

    it('should get engine JWT token without jobId', async () => {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          resource: { tdoId: '12345' },
          engineId: 'engineId3'
        }
      };

      serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId3' }],
        false
      );
      serviceContext.dbConnections['core'].write._push([
        {
          id: '12345',
          application_id: 'applicationId'
        }
      ]);
      serviceContext.dbConnections['sso'].write._push([{ id: 7682 }]);
      mockUserData(serviceContext.dbConnections['sso'].read);
      // get oldest org admin default in tokenHelper.createJwtToken
      /// getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        { application_id: '0000000-0000-2222-0000-00000000000' }
      ]);
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      serviceContext.dbConnections['sso'].read._push([]);

      res = await dal.getEngineJWTToken(context, args);

      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId3');
    });
  });

  it('should get engine JWT token that has userId populated from calling session token', async () => {
    let res, err;
    const context = mockUtil.makeContext();
    const args = {
      input: {
        resource: {
          tdoId: '123'
        },
        engineId: 'engineId1'
      },
      organizationId: 7682
    };
    const testSourceId = '1'
    const testUserId = context._authInfo.userId;

    // fetch engine
    serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId1' }],
        false
    );

    // fetch tdo
    serviceContext.dbConnections['core'].write._push([
      {
        id: '123',
        application_id: 'applicationId',
        source_id: testSourceId
      }
    ]);

    try {
      res = await dal.getEngineJWTToken(context, args);
    } catch (error) {
      err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    }

    expect(err).toBeUndefined();
    expect(res).toBeDefined();
    expect(res.engineId).toBe('engineId1');
    expect(res.resource).toBeDefined();
    expect(res.resource.userId).toBe(testUserId);
  });

  it('should get engine JWT token that has userId populated from source owner when called with api token', async () => {
    let res, err;
    const context = mockUtil.makeContext({ authType: 'api_org' });
    const args = {
      input: {
        resource: {
          tdoId: '123'
        },
        engineId: 'engineId1'
      },
      organizationId: 7682
    };
    const testSourceId = '1'
    const testUserId = 'e2051840-3490-43ff-819f-5be476683439'

    // fetch engine
    serviceContext.dbConnections['core'].read._push(
      [{ id: 'engineId1' }],
      false
    );

    // fetch tdo
    serviceContext.dbConnections['core'].write._push([
      {
        id: '123',
        application_id: 'applicationId',
        source_id: testSourceId
      }
    ]);

    // getSource - fetch group id
    serviceContext.dbConnections['sso'].read._push([
      { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
    ]);

    // getSource - fetch source
    serviceContext.dbConnections['media_platform'].read._push([
      {
        id: testSourceId,
        ownedBy: testUserId
      }
    ]);

    try {
      res = await dal.getEngineJWTToken(context, args);
    } catch (error) {
      err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    }

    expect(err).toBeUndefined();
    expect(res).toBeDefined();
    expect(res.engineId).toBe('engineId1');
    expect(res.resource).toBeDefined();
    expect(res.resource.userId).toBe(testUserId);
  });

  it('should get engine JWT token that has userId populated from source owner when called with service token', async () => {
    let res, err;
    const context = mockUtil.makeContext({ authType: 'api_internal' });
    const args = {
      input: {
        resource: {
          tdoId: '123'
        },
        engineId: 'engineId1'
      },
      organizationId: 7682
    };
    const testSourceId = '1'
    const testUserId = 'e2051840-3490-43ff-819f-5be476683439'

    // fetch engine
    serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId1' }],
        false
    );

    // fetch tdo
    serviceContext.dbConnections['core'].write._push([
      {
        id: '123',
        application_id: 'applicationId',
        source_id: testSourceId
      }
    ]);

    // getSource - fetch group id
    serviceContext.dbConnections['sso'].read._push([
      { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
    ]);

    // getSource - fetch source
    serviceContext.dbConnections['media_platform'].read._push([
      {
        id: testSourceId,
        ownedBy: testUserId
      }
    ]);

    try {
      res = await dal.getEngineJWTToken(context, args);
    } catch (error) {
      err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    }

    expect(err).toBeUndefined();
    expect(res).toBeDefined();
    expect(res.engineId).toBe('engineId1');
    expect(res.resource).toBeDefined();
    expect(res.resource.userId).toBe(testUserId);
  });

  it('should get engine JWT token that has userId populated from source owner when called with engine JWT token', async () => {
    let res, err;
    const context = mockUtil.makeContext({ authType: 'engineJWT' });
    const args = {
      input: {
        resource: {
          tdoId: '123'
        },
        engineId: 'engineId1'
      },
      organizationId: 7682
    };
    const testSourceId = '1'
    const testUserId = 'e2051840-3490-43ff-819f-5be476683439'

    // fetch engine
    serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId1' }],
        false
    );

    // fetch tdo
    serviceContext.dbConnections['core'].write._push([
      {
        id: '123',
        application_id: 'applicationId',
        source_id: testSourceId
      }
    ]);

    // getSource - fetch group id
    serviceContext.dbConnections['sso'].read._push([
      { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
    ]);

    // getSource - fetch source
    serviceContext.dbConnections['media_platform'].read._push([
      {
        id: testSourceId,
        ownedBy: testUserId
      }
    ]);

    try {
      res = await dal.getEngineJWTToken(context, args);
    } catch (error) {
      err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    }

    expect(err).toBeUndefined();
    expect(res).toBeDefined();
    expect(res.engineId).toBe('engineId1');
    expect(res.resource).toBeDefined();
    expect(res.resource.userId).toBe(testUserId);
  });

  it('should get engine JWT token that has userId populated from source owner when called with userless token while providing only jobId', async () => {
    let res, err;
    const testJobId = mockUtil.toTaskId('jobId');
    const testRecordingId = '123';
    const context = mockUtil.makeContext({ authType: 'api_org' });
    const args = {
      input: {
        resource: {
          jobId: testJobId,
        },
        engineId: 'engineId1'
      },
      organizationId: 7682
    };
    const testSourceId = '1'
    const testUserId = 'e2051840-3490-43ff-819f-5be476683439'

    // fetch engine
    serviceContext.dbConnections['core'].read._push(
        [{ id: 'engineId1' }],
        false
    );

    // get job -> check partition tables
    mockPartitionTable.setMockDBToCheckTablePartition(
        serviceContext,
        testJobId
    );
    serviceContext.dbConnections['core'].read._push([
      { id: testJobId, application_id: 'applicationId', recording_id: testRecordingId }
    ]);

    // fetch tdo
    serviceContext.dbConnections['core'].write._push([
      {
        id: testRecordingId,
        application_id: 'applicationId',
        source_id: testSourceId
      }
    ]);

    // getSource - fetch group id
    serviceContext.dbConnections['sso'].read._push([
      { group_id: '48cfed01-362e-42b4-954e-147730cca81a' }
    ]);

    // getSource - fetch source
    serviceContext.dbConnections['media_platform'].read._push([
      {
        id: testSourceId,
        ownedBy: testUserId
      }
    ]);

    try {
      res = await dal.getEngineJWTToken(context, args);
    } catch (error) {
      err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
    }

    expect(err).toBeUndefined();
    expect(res).toBeDefined();
    expect(res.engineId).toBe('engineId1');
    expect(res.resource).toBeDefined();
    expect(res.resource.userId).toBe(testUserId);
  });

  describe('#verifyJWT', () => {
    it('should verify JWT', () => {
      let res, err;
      const jwtToken = jwt.sign(
        {
          contentApplicationId: 'applicationId',
          contentOrganizationId: 7682
        },
        serviceContext.app.config.jwt.secret
      );

      const args = { jwtToken };

      res = dal.verifyJWT(args);

      expect(res).toBeDefined();
      expect(res.payload.contentApplicationId).toBe('applicationId');
      expect(res.payload.contentOrganizationId).toBe(7682);
    });

    it('should throw error if invalid JWT', () => {
      let res, err;
      const args = { jwtToken: 'invalid' };

      try {
        res = dal.verifyJWT(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });
  });

  describe('#engineWorkflow', () => {
    it('should disable an engine - successfully', async () => {
      let res, err;
      const args = {
        input: {
          id: 'engineId',
          action: 'disable'
        }
      };
      const context = mockUtil.makeContext();

      context._authInfo.json = {
        rights: ['developer.access', 'developer.engine.disable']
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            state: 'active'
          }
        ],
        false
      );
      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            ownerOrganizationId: 7682,
            engineState: 'active'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.pauseDeployedBuildsForEngine.mockImplementationOnce(
        (engineId, dbClient, callback) => callback(null, null)
      );
      serviceContext.coreJob.cjdal.engine.updateEngineState.mockImplementationOnce(
        (engineId, engineState, dbClient, callback) =>
          callback(null, { engineId: 'engineId' })
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementationOnce(
        (event, req, payload) => Promise.resolve()
      );

      try {
        res = await dal.engineWorkflow(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      const messages = serviceContext.messageUtil._messages();
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
      expect(res.id).toBe('engineId');
    });
  });

  describe('#createTaskLog', () => {
    it('should throw error if missing file', async () => {
      let res, err;
      const args = {
        input: {}
      };
      const context = mockUtil.getGraphQLContext();

      try {
        res = await dal.createTaskLog(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should throw error if file size is zero', async () => {
      let res, err;
      const args = {
        input: {
          file: {
            size: 0
          }
        }
      };
      const context = mockUtil.getGraphQLContext();

      try {
        res = await dal.createTaskLog(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
    });

    it('should throw error if cannot put task log', async () => {
      let res, err;
      const args = {
        input: {
          taskId: mockUtil.toTaskId('taskId'),
          file: {
            size: 10
          }
        }
      };
      const context = mockUtil.getGraphQLContext();
      const putObject = jest.fn();

      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('taskId')
        }
      ]);
      _.set(serviceContext, 's3Buckets.tasklog.storage.putObject', putObject);
      putObject.mockImplementation((taskKey, type, size, stream, cb) => {
        return cb(null, null);
      });

      try {
        res = await dal.createTaskLog(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toBe('service_unavailable');
    });

    it('should throw error if cannot put task log', async () => {
      let res, err;
      const args = {
        input: {
          taskId: mockUtil.toTaskId('taskId'),
          file: {
            size: 10
          }
        }
      };
      const context = mockUtil.getGraphQLContext();
      const putObject = jest.fn();

      serviceContext.dbConnections['core'].read._push([
        {
          id: mockUtil.toTaskId('taskId')
        }
      ]);
      _.set(serviceContext, 's3Buckets.tasklog.storage.putObject', putObject);
      putObject.mockImplementation((taskKey, type, size, stream, cb) => {
        return cb(null, 'http://localhost');
      });
      serviceContext.dbConnections['core'].read._push([
        {
          task_id: mockUtil.toTaskId('taskId'),
          task_log: ''
        }
      ]);

      try {
        res = await dal.createTaskLog(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeDefined();
      expect(res.uri).toBe('http://localhost');
      expect(err).toBeUndefined();
    });
  });

  describe('#getEngineTaskMetrics', () => {
    it('should throw error if range between from and to date more than one week', async () => {
      let res, err;
      const args = {
        toDateTime: moment('2019-05-24T00:00:01.000Z'),
        fromDateTime: moment('2019-05-16T00:00:01.000Z')
      };

      try {
        res = await dal.getEngineTaskMetrics(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('invalid_input');
      expect(res).toBeUndefined();
    });

    it('should return engine task metrics', async () => {
      let res, err;
      const args = {
        toDateTime: moment('2019-05-24T00:00:01.000Z'),
        fromDateTime: moment('2019-05-23T00:00:01.000Z')
      };

      serviceContext.dbConnections['core'].read._push([
        {
          pending_count: 1,
          queued_count: 1,
          running_count: 0,
          completed_count: 2,
          failed_count: 1,
          cancelled_count: 1
        }
      ]);

      try {
        res = await dal.getEngineTaskMetrics(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.pendingCount).toBe(1);
    });

    it('should return engine task metrics with dateTime default', async () => {
      let res, err;
      const args = {};

      serviceContext.dbConnections['core'].read._push([
        {
          pending_count: 1,
          queued_count: 1,
          running_count: 0,
          completed_count: 2,
          failed_count: 1,
          cancelled_count: 1
        }
      ]);

      try {
        res = await dal.getEngineTaskMetrics(args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.pendingCount).toBe(1);
    });
  });

  describe('#getEngineTaskMetricsDb', () => {
    it('should get engine task metrics with full filter', async () => {
      let res, err;
      const options = {
        id: 'engineId',
        applicationId: 'applicationId',
        toDateTime: Math.floor(new Date('2019-05-24T00:00:01.000Z') / 1000),
        fromDateTime: Math.floor(new Date('2019-05-23T00:00:01.000Z') / 1000)
      };

      serviceContext.dbConnections['core'].read._push([
        {
          pending_count: 1,
          queued_count: 1,
          running_count: 0,
          completed_count: 2,
          failed_count: 1,
          cancelled_count: 1
        }
      ]);

      try {
        res = await dal.getEngineTaskMetricsDb(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.pendingCount).toBe(1);
    });

    it('should get engine task metrics with empty filter', async () => {
      let res, err;
      const options = {};

      serviceContext.dbConnections['core'].read._push([
        {
          pending_count: 1,
          queued_count: 1,
          running_count: 0,
          completed_count: 2,
          failed_count: 1,
          cancelled_count: 1
        }
      ]);

      try {
        res = await dal.getEngineTaskMetricsDb(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.pendingCount).toBe(1);
    });
  });

  describe('#getEngineBuild', () => {
    it('should throw error, if missing id', async () => {
      let res, err;
      const options = {};

      try {
        res = await dal.getEngineBuild(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(res).toBeUndefined();
    });

    it('should throw error, if engine build not found', async () => {
      let res, err;
      const options = { id: 'buildId' };

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.getEngineBuild(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('not_found');
      expect(res).toBeUndefined();
    });

    it('should return engine build', async () => {
      let res, err;
      const options = { id: 'buildId' };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getEngineBuild(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId');
      expect(res.id).toBe('buildId');
    });
  });

  describe('#getEngineBuilds', () => {
    it('should return engine builds, not from cache', async () => {
      let res, err;
      const options = { id: 'buildId', offset: 0, limit: 30 };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
    });

    // Skipped. See https://github.com/veritone/aiware-core/issues/345.
    xit('should return engine builds, from cache', async function () {
      let res, err;
      const options = { id: 'buildId', offset: 0, limit: 30 };
      serviceContext.redisCache.markCacheDirty(false);
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return engine builds, with full filters', async () => {
      let res, err;
      const options = {
        id: 'buildId',
        offset: 0,
        limit: 30,
        status: ['deleted'],
        buildStatus: 'buildStatus',
        organizationId: 7682,
        engineId: 'engineId',
        engineAliasId: 'engineAliasId'
      };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].engineId).toBe('engineAliasId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return engine builds, did not filter', async () => {
      let res, err;
      const options = {
        includeDeleted: true
      };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return engine builds, with orderBy', async () => {
      let res, err;
      const options = {
        includeDeleted: true,
        orderBy: [
          { field: 'version', direction: 'desc' },
          { field: 'modifiedDateTime', direction: 'desc' },
          { field: 'createdDateTime', direction: 'desc' }
        ]
      };
      const timeNow = moment().valueOf();

      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engineId',
          id: 'buildId',
          version: 2,
          created_date_time: timeNow,
          modified_date_time: timeNow
        },
        {
          engine_id: 'engineId',
          id: 'buildId1',
          version: 1,
          created_date_time: moment(timeNow).add(-1, 'm').valueOf(),
          modified_date_time: moment(timeNow).add(-1, 'm').valueOf()
        },
        {
          engine_id: 'engineId',
          id: 'buildId2',
          version: 1,
          created_date_time: moment(timeNow).add(-2, 'm').valueOf(),
          modified_date_time: moment(timeNow).add(-2, 'm').valueOf()
        }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(3);
      for (var i = 0; i < res.count; i++) {
        expect(res.records[i].engineId).toBe('engineId');
        expect(res.records[i].id).toBe(`buildId${i || ''}`);
        expect(res.records[i].version).toBe(i === 0 ? 2 : 1);
        expect(res.records[i].createdDateTime).toBe(
          moment(timeNow).add(-i, 'm').valueOf()
        );
        expect(res.records[i].modifiedDateTime).toBe(
          moment(timeNow).add(-i, 'm').valueOf()
        );
      }
    });

    it('should set default runtime if empty', async () => {
      let res, err;
      const options = { id: 'buildId', offset: 0, limit: 30 };
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId', runtime: {} }
      ]);

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
      expect(res.records[0].runtime).toEqual({ edge: {} });
    });

    it('should throw error if invalid orderBy field', async () => {
      let res, err;
      const options = {
        includeDeleted: true,
        orderBy: [{ field: 'versionFail', direction: 'desc' }]
      };

      try {
        res = await dal.getEngineBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(err.data.internalData.orderByField).toBe('versionFail');
      expect(res).toBeUndefined();
    });
  });

  describe('#getRecentBuilds', () => {
    it('should return recent engine builds', async () => {
      let res, err;
      const options = { offset: 0, limit: 30 };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getRecentBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return recent engine builds, with full filters', async () => {
      let res, err;
      const options = {
        offset: 0,
        limit: 30,
        buildStatus: ['buildStatus'],
        engineAliasId: 'engineAliasId'
      };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getRecentBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(30);
      expect(res.records[0].engineId).toBe('engineAliasId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return recent engine builds, did not filter', async () => {
      let res, err;
      const options = {
        includeDeleted: true
      };

      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'engineId', id: 'buildId' }
      ]);

      try {
        res = await dal.getRecentBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(1);
      expect(res.records[0].engineId).toBe('engineId');
      expect(res.records[0].id).toBe('buildId');
    });

    it('should return recent engine builds, with orderBy', async () => {
      let res, err;
      const options = {
        includeDeleted: true,
        orderBy: [
          { field: 'version', direction: 'desc' },
          { field: 'modifiedDateTime', direction: 'desc' },
          { field: 'createdDateTime', direction: 'desc' }
        ]
      };
      const timeNow = moment().valueOf();

      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'engineId',
          id: 'buildId',
          version: 2,
          created_date_time: timeNow,
          modified_date_time: timeNow
        },
        {
          engine_id: 'engineId',
          id: 'buildId1',
          version: 1,
          created_date_time: moment(timeNow).add(-1, 'm').valueOf(),
          modified_date_time: moment(timeNow).add(-1, 'm').valueOf()
        },
        {
          engine_id: 'engineId',
          id: 'buildId2',
          version: 1,
          created_date_time: moment(timeNow).add(-2, 'm').valueOf(),
          modified_date_time: moment(timeNow).add(-2, 'm').valueOf()
        }
      ]);

      try {
        res = await dal.getRecentBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.count).toBe(3);
      for (var i = 0; i < res.count; i++) {
        expect(res.records[i].engineId).toBe('engineId');
        expect(res.records[i].id).toBe(`buildId${i || ''}`);
        expect(res.records[i].version).toBe(i === 0 ? 2 : 1);
        expect(res.records[i].createdDateTime).toBe(
          moment(timeNow).add(-i, 'm').valueOf()
        );
        expect(res.records[i].modifiedDateTime).toBe(
          moment(timeNow).add(-i, 'm').valueOf()
        );
      }
    });

    it('should throw error if invalid orderBy field', async () => {
      let res, err;
      const options = {
        includeDeleted: true,
        orderBy: [{ field: 'modifiedDateTimeFail', direction: 'desc' }]
      };

      try {
        res = await dal.getRecentBuilds(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(err.data.internalData.orderByField).toBe('modifiedDateTimeFail');
      expect(res).toBeUndefined();
    });
  });

  describe('#getEngineOverview', () => {
    it('should return engine overview', async () => {
      let res, err;
      const options = { organizationId: 7682 };
      const engineOverview = {
        active: 445,
        disabled: 39,
        pending: 705,
        deleted: 913,
        draft: 0,
        ready: 115
      };
      serviceContext.dbConnections['core'].read._push([engineOverview], false);

      try {
        res = await dal.getEngineOverview(options, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      for (var key in Object.keys(engineOverview)) {
        expect(res[key]).toBe(engineOverview[key]);
      }
    });
  });

  describe('#getEngineReplacements', () => {
    it('should get Engine replacement - specified organization', async () => {
      let res, err;
      const options = {
        sourceEngineId: '0cc18195-8187-4680-9c89-66062eec3d7c',
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].read._push([
        {
          source_engine_id: '0cc18195-8187-4680-9c89-66062eec3d7c',
          organization_id: 7682,
          replacement_engine_id: 'e61836f6-0a90-4117-9ab3-18cc8e4dcfa5',
          payload_func: '$'
        }
      ]);

      try {
        res = await dal.getEngineReplacements(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].sourceEngineId).toBe(
        '0cc18195-8187-4680-9c89-66062eec3d7c'
      );
      expect(res[0].replacementEngineId).toBe(
        'e61836f6-0a90-4117-9ab3-18cc8e4dcfa5'
      );
      expect(res[0].organizationId).toBe(7682);
      expect(res[0].payloadFunc).toBe('$');
    });

    it('should get Engine replacement - did not specify organization', async () => {
      let res, err;
      const options = {
        sourceEngineId: '0cc18195-8187-4680-9c89-66062eec3d7c'
      };

      serviceContext.dbConnections['core'].read._push([
        {
          source_engine_id: '0cc18195-8187-4680-9c89-66062eec3d7c',
          organization_id: 0,
          replacement_engine_id: 'e61836f6-0a90-4117-9ab3-18cc8e4dcfa5',
          payload_func: '$'
        }
      ]);

      try {
        res = await dal.getEngineReplacements(options);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].sourceEngineId).toBe(
        '0cc18195-8187-4680-9c89-66062eec3d7c'
      );
      expect(res[0].replacementEngineId).toBe(
        'e61836f6-0a90-4117-9ab3-18cc8e4dcfa5'
      );
      expect(res[0].organizationId).toBe(0);
      expect(res[0].payloadFunc).toBe('$');
    });
  });

  describe('#createEngineReplacement', () => {
    it('should throw error - engineReplacement is required', async () => {
      let res, err;
      const engineReplacement = null;

      try {
        res = await dal.createEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('engineReplacement is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should throw error - sourceEngineId is required', async () => {
      let res, err;
      const engineReplacement = {};

      try {
        res = await dal.createEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('sourceEngineId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should throw error - replacementEngineId is required', async () => {
      let res, err;
      const engineReplacement = {
        sourceEngineId: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7'
      };

      try {
        res = await dal.createEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('replacementEngineId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should create engine replacement success', async () => {
      let res, err;
      const engineReplacement = {
        sourceEngineId: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7',
        replacementEngineId: 'c3a27dcc-2b4c-4c87-8102-9584f7af3b11',
        organizationId: 7682
      };

      serviceContext.dbConnections['core'].write._push([
        {
          source_engine_id: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7',
          organization_id: 7682,
          replacement_engine_id: 'c3a27dcc-2b4c-4c87-8102-9584f7af3b11',
          payload_func: '$'
        }
      ]);

      try {
        res = await dal.createEngineReplacement(engineReplacement);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.sourceEngineId).toBe('a1b273c4-e298-4a9b-b170-1f5b052cd5b7');
      expect(res.replacementEngineId).toBe(
        'c3a27dcc-2b4c-4c87-8102-9584f7af3b11'
      );
      expect(res.organizationId).toBe(7682);
      expect(res.payloadFunc).toBe('$');
    });
  });

  describe('#removeEngineReplacement', () => {
    it('should throw error - engineReplacement is required', async () => {
      let res, err;
      const engineReplacement = null;

      try {
        res = await dal.removeEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('engineReplacement is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should throw error - sourceEngineId is required', async () => {
      let res, err;
      const engineReplacement = {};

      try {
        res = await dal.removeEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('sourceEngineId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should throw error - replacementEngineId is required', async () => {
      let res, err;
      const engineReplacement = {
        sourceEngineId: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7'
      };

      try {
        res = await dal.removeEngineReplacement(engineReplacement);
      } catch (error) {
        expect(error.message).toBe('replacementEngineId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toBe('internal_error');
      expect(res).toBeUndefined();
    });

    it('should remove engine replacement success', async () => {
      let res, err;
      const engineReplacement = {
        sourceEngineId: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7',
        organizationId: 7682,
        replacementEngineId: '2106aab0-d2e7-439b-a1e1-93553a56bf04'
      };

      serviceContext.dbConnections['core'].write._push([
        {
          source_engine_id: 'a1b273c4-e298-4a9b-b170-1f5b052cd5b7',
          organization_id: 7682,
          replacement_engine_id: '2106aab0-d2e7-439b-a1e1-93553a56bf04'
        }
      ]);

      try {
        res = await dal.removeEngineReplacement(engineReplacement);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.sourceEngineId).toBe('a1b273c4-e298-4a9b-b170-1f5b052cd5b7');
      expect(res.replacementEngineId).toBe(
        '2106aab0-d2e7-439b-a1e1-93553a56bf04'
      );
      expect(res.organizationId).toBe(7682);
    });
  });

  describe('#createAutomateFlow', () => {
    it('should create engine and return engineId', async () => {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        organizationId: 7682,
        input: { name: flowName }
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'c5458876-43d2-41e8-a340-f734702df04a',
            typeId: 'fcc22feb-9184-4f53-be5e-7694927864d9',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Fake Engine'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'c5458876-43d2-41e8-a340-f734702df04a',
            typeId: 'fcc22feb-9184-4f53-be5e-7694927864d9',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Automation'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [{ id: 'engineId' }],
        false
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            edgeVersion: 3,
            name: flowName,
            description: '',
            categoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            ownerOrganizationId: 7682,
            deploymentModel: 3,
            manifest: {
              runtime: 'nodeRed',
              engineMode: 'chunk',
              supportedInputTypes: ['application/json']
            },
            engineManifest: {
              runtime: 'nodeRed',
              engineMode: 'chunk',
              supportedInputTypes: ['application/json']
            },
            distributionType: '',
            engineState: 'ready'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            buildId: '17f7f77a-f858-4eaf-8c19-15323a6404e0'
          });
        }
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            name: flowName,
            engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            deploymentModel: 3,
            isPublic: false,
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );

      // getEngineBuilds from createOrDuplicatePackage
      serviceContext.dbConnections['core'].read._push([], false);

      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Automate' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'engineId',
            jwtRights: {
              roles: [
                {
                  roleName: 'adapter',
                  taskRights: ['developer.engine.read'],
                  assetRights: ['recording:create']
                }
              ]
            }
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementation(
        (event, req, payload) => Promise.resolve()
      );
      serviceContext.dal.packages.updatePublicEngineList = jest
        .fn()
        .mockImplementation((args, context) => {
          expect(args.engineId).toBe('engineId');
        });

      const context = mockUtil.makeContext();
      try {
        res = await dal.createAutomateFlow(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toBe('engineId');
      expect(res.build.id).toBeDefined();
      expect(res.build.id).toBe('17f7f77a-f858-4eaf-8c19-15323a6404e0');
    });
    it('should create engine with linkedApplicationID', async () => {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        input: {
          linkedApplicationId: '123',
          name: flowName
        },
        organizationId: 7682
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'c5458876-43d2-41e8-a340-f734702df04a',
            typeId: 'fcc22feb-9184-4f53-be5e-7694927864d9',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Fake Engine'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'c5458876-43d2-41e8-a340-f734702df04a',
            typeId: 'fcc22feb-9184-4f53-be5e-7694927864d9',
            engine_ids: ['engineId'],
            engine_alias_ids: ['aliasId'],
            name: 'Automation'
          }
        ],
        false
      );
      serviceContext.dbConnections['core'].write._push(
        [{ id: 'engineId' }],
        false
      );

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            edgeVersion: 3,
            name: flowName,
            description: '',
            categoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            ownerOrganizationId: 7682,
            deploymentModel: 3,
            manifest: {
              runtime: 'nodeRed',
              engineMode: 'chunk',
              supportedInputTypes: ['application/json']
            },
            engineManifest: {
              runtime: 'nodeRed',
              engineMode: 'chunk',
              supportedInputTypes: ['application/json']
            },
            distributionType: '',
            engineState: 'ready'
          });
        }
      );
      serviceContext.coreJob.cjdal.build.createEngineBuild.mockImplementation(
        (build, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            buildId: '17f7f77a-f858-4eaf-8c19-15323a6404e0'
          });
        }
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineId',
            name: flowName,
            engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
            deploymentModel: 3,
            isPublic: false,
            ownerOrganizationId: 7682,
            dependency: { dependencyType: 'transcript', assetType: 'media' }
          }
        ],
        false
      );

      // getEngineBuilds from createOrDuplicatePackage
      serviceContext.dbConnections['core'].read._push([], false);

      serviceContext.coreJob.cjdal.engineCategory.getEngineCategory.mockImplementationOnce(
        (engineCategoryId, dbClient, callback) => {
          return callback(null, { engineCategoryName: 'Automate' });
        }
      );
      serviceContext.coreJob.cjdal.engine.updateEngine.mockImplementationOnce(
        (engine, dbClient, callback) => {
          return callback(null, null);
        }
      );
      serviceContext.coreJob.jobBll.engine.autoTransitionEngineState.mockImplementationOnce(
        (engine, dbClient, isEnabling, callback) => {
          return callback(null, {
            engineId: 'engineId',
            jwtRights: {
              roles: [
                {
                  roleName: 'adapter',
                  taskRights: ['developer.engine.read'],
                  assetRights: ['recording:create']
                }
              ]
            }
          });
        }
      );
      serviceContext.coreJob.eventEmitter.emitEngineEvent.mockImplementation(
        (event, req, payload) => Promise.resolve()
      );
      serviceContext.dal.packages.updatePublicEngineList = jest
        .fn()
        .mockImplementation((args, context) => {
          expect(args.engineId).toBe('engineId');
        });

      const context = mockUtil.makeContext();
      try {
        res = await dal.createAutomateFlow(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#sanitizeEngineBuildResources', () => {
    it('should create engine replacement success', async () => {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'buildId1'
          },
          {
            id: 'buildId2'
          },
          {
            id: 'newDeployedBuildId'
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: 'buildId1',
            resourceType: 'engineBuild'
          },
          {
            resourceId: 'buildId2',
            resourceType: 'engineBuild'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();

      try {
        res = await dal.sanitizeEngineBuildResources(
          context,
          'packageId',
          'engineId',
          'newDeployedBuildId'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual(
        expect.arrayContaining([
          {
            action: 'REMOVE',
            resourceId: 'buildId1',
            resourceType: 'engineBuild'
          },
          {
            action: 'REMOVE',
            resourceId: 'buildId2',
            resourceType: 'engineBuild'
          },
          {
            action: 'ADD',
            resourceId: 'newDeployedBuildId',
            resourceType: 'engineBuild'
          }
        ])
      );
    });
  });

  describe('#validateDeployedBuildInLatestPackage', () => {
    let packageId, currentDeployedBuildId;
    it('the latest package does not include the current deployed build', async () => {
      let res, err;

      // serviceContext.dal.packages.getPackageResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: 'buildId1',
            resourceType: 'engineBuild'
          },
          {
            resourceId: 'oldDeployedBuild',
            resourceType: 'engineBuild'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();

      try {
        res = await dal.validateDeployedBuildInLatestPackage(
          context,
          'packageId',
          'currentDeployedBuildId'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual(
        expect.objectContaining({
          packageResources: {
            count: 2,
            limit: undefined,
            offset: undefined,
            records: [
              {
                createdAt: undefined,
                modifiedAt: undefined,
                resourceId: 'buildId1',
                resourceType: 'engineBuild'
              },
              {
                createdAt: undefined,
                modifiedAt: undefined,
                resourceId: 'oldDeployedBuild',
                resourceType: 'engineBuild'
              }
            ]
          },
          valid: false
        })
      );
    });
    it('the latest package includes the current deployed build', async () => {
      let res, err;

      // serviceContext.dal.packages.getPackageResources
      serviceContext.dbConnections['core'].read._push(
        [
          {
            resourceId: 'buildId1',
            resourceType: 'engineBuild'
          },
          {
            resourceId: 'currentDeployedBuildId',
            resourceType: 'engineBuild'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();

      try {
        res = await dal.validateDeployedBuildInLatestPackage(
          context,
          'packageId',
          'currentDeployedBuildId'
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res).toEqual(
        expect.objectContaining({
          packageResources: {
            count: 2,
            limit: undefined,
            offset: undefined,
            records: [
              {
                createdAt: undefined,
                modifiedAt: undefined,
                resourceId: 'buildId1',
                resourceType: 'engineBuild'
              },
              {
                createdAt: undefined,
                modifiedAt: undefined,
                resourceId: 'currentDeployedBuildId',
                resourceType: 'engineBuild'
              }
            ]
          },
          valid: true
        })
      );
    });
  });

  describe('buildFilterIds', () => {
    it('returns empty idList if no ids provided', () => {
      const result = dal.buildFilterIds({});
      expect(result).toEqual({ idList: [] });
    });

    it('returns idList for small id list (1 id)', () => {
      const result = dal.buildFilterIds({ id: 'abc' });
      expect(result).toEqual({ idList: ['abc'] });
    });

    it('returns idList for small id list (2 ids)', () => {
      const result = dal.buildFilterIds({ ids: ['a', 'b'] });
      expect(result).toEqual({ idList: ['a', 'b'] });
    });

    it('returns idList when id list is >= 100', () => {
      const largeIdList = Array.from({ length: 100 }, (_, i) => `id${i}`);
      const result = dal.buildFilterIds({ ids: largeIdList });
      expect(result.idList).toHaveLength(100);
    });
  });

  describe('_getOwnedEngineIds', () => {
    it('should return empty array if organizationId is not provided', async () => {
      const res = await dal._getOwnedEngineIds(null);
      expect(res).toEqual([]);
    });

    it('should return owned engine ids without filter', async () => {
      serviceContext.dbConnections['core'].read._push([
        { engine_id: 'eng-1' },
        { engine_id: 'eng-2' }
      ]);

      const res = await dal._getOwnedEngineIds(7682);

      expect(res).toEqual(['eng-1', 'eng-2']);
    });

    it('should return owned engine ids with filter', async () => {
      serviceContext.dbConnections['core'].read._push(
        [{ engine_id: 'eng-1' }],
        false,
        ['ANY($2::text[])']
      );

      const res = await dal._getOwnedEngineIds(7682, ['eng-1', 'eng-3']);

      expect(res).toEqual(['eng-1']);
    });
    it('should exclude owned engines that belong to a package', async () => {
      serviceContext.dbConnections['core'].read._push(
        [],
        false,
        ['LEFT JOIN aiware.package__resource', 'pr.resource_id IS NULL']
      );

      const res = await dal._getOwnedEngineIds(7682);

      expect(res).toEqual([]);
    });

    it('should return empty array if no owned engines found', async () => {
      serviceContext.dbConnections['core'].read._push([]);

      const res = await dal._getOwnedEngineIds(7682);

      expect(res).toEqual([]);
    });
  });
});
