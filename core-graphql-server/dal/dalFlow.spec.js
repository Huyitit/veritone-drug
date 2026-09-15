const _ = require('lodash');
const dalFlow = require('./dalFlow.js');
const dalEngine = require('./dalEngine.js');

const mockUtil = global.mockUtil;
const {
  initializeServiceContext,
  MOCK_DATA_TYPE
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(MOCK_DATA_TYPE.V3_DATA_MODEL);
serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
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

function createDal(svcContext) {
  return dalFlow(
    svcContext,
    dalEngine(
      null,
      svcContext.logger,
      null,
      null,
      svcContext.blls3,
      svcContext.config,
      svcContext.dal.tdo,
      svcContext.app,
      svcContext
    )
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
        }
      }
    ],
    false
  );
}

const mockEnginePackage = (buildId) => {
  // getEngineBuilds from createOrDuplicatePackage
  serviceContext.dbConnections['core'].read._push(
    [
      {
        id: buildId,
        engineId: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
        status: 'deployed'
      }
    ],
    false
  );

  // getPackageResources from createOrDuplicatePackage
  serviceContext.dbConnections['core'].read._push([], false);
  // creating new package from doPackageCreate
  serviceContext.dbConnections['core'].write._push(
    [
      {
        packageId: 'newPackageId',
        packageName: 'new package name',
        organizationId: 7682,
        status: 'draft'
      }
    ],
    false,
    [],
    (sql, params) => {
      expect(params[8]).toEqual('draft');
      return true;
    }
  );

  // for org check done in packageUpdateResources()
  serviceContext.dbConnections['core'].write._push(
    [
      {
        organization_id: 7682
      }
    ],
    false
  );

  // getEngineBuilds from createOrDuplicatePackage
  serviceContext.dbConnections['core'].read._push(
    [
      {
        id: buildId,
        engineId: '1c244841-c010-4f3f-a918-44b9e1ded4a2',
        status: 'deployed'
      }
    ],
    false
  );

  // getEngineSchemas from getSchemaResorucesByEngine
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
  serviceContext.dbConnections['core'].read._push([], false);
  serviceContext.dbConnections['core'].read._push([], false);
  serviceContext.dbConnections['core'].read._push([], false);
};

const mockFlowTemplate = (serviceContext) => {
  serviceContext.dal.flowTemplate.getFlowTemplates.mockReturnValue({
    records: [
      {
        id: '40b2b9b4-28bf-4e5e-b3e9-3c45dc40bb22',
        title: 'aiWare Workflow Base Template',
        subtitle: 'Essential Nodes for AI Process Foundation',
        description:
          'This template includes the fundamental nodes required to establish a baseline for AI processing workflows. It offers the basic structure needed for data intake, success and failure outputs, error catching, and debug output. This setup serves as the groundwork upon which complete processes can be built.',
        package: 'eyJkZXBlbmRlbmNpZXMiOnt9fQ==',
        flow:
          'W3siaWQiOiIyYzM5NTJmMzc4YzNhOGJmIiwidHlwZSI6InRhYiIsImxhYmVsIjoiRmxvdyAxIiwiZGlzYWJsZWQiOmZhbHNlLCJpbmZvIjoiIiwiZW52IjpbXX0seyJpZCI6IjI0NTJlZDRkYWNhOTcxYmEiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwiZm9ybWF0IjoiYnVmZmVyIiwic2FtcGxlcyI6W10sInRkb0NvbnRlbnQiOiJ7fSIsIl9tdGltZSI6MCwid2FpdEZvclJlc3VsdHMiOmZhbHNlLCJrZWVwUGF5bG9hZCI6ZmFsc2UsImtlZXBBbGl2ZSI6MCwic2VydmljZU1vZGVPbmx5Ijp0cnVlLCJ4IjoyNDAsInkiOjEwMCwid2lyZXMiOltbXV19LHsiaWQiOiJlMmQ0NDFmZjhkOWJhMTcyIiwidHlwZSI6ImFpd2FyZS1vdXQiLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiIiLCJzdGF0dXNDb2RlIjoic3VjY2VzcyIsImZhaWx1cmVNc2ciOiIiLCJmYWlsdXJlTXNnVHlwZSI6IiIsImZhaWx1cmVSZWFzb24iOiIiLCJmYWlsdXJlUmVhc29uVHlwZSI6IiIsInNraXBSZXN1bHRDYWxsYmFjayI6ZmFsc2UsImRpc2FibGVEZWJ1ZyI6ZmFsc2UsImV4Y2x1ZGVNZXRhZGF0YSI6ZmFsc2UsIngiOjU4MCwieSI6MTAwLCJ3aXJlcyI6W119LHsiaWQiOiI1OTg0MDc2OTIyODEwMjBkIiwidHlwZSI6ImNhdGNoIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwic2NvcGUiOm51bGwsInVuY2F1Z2h0IjpmYWxzZSwieCI6MjYwLCJ5IjoyNDAsIndpcmVzIjpbWyIwZWVmNDNjNTZhNDU1ZDY5IiwiOTUyNjk5NmE3NzU3NjAwNSJdXX0seyJpZCI6IjBlZWY0M2M1NmE0NTVkNjkiLCJ0eXBlIjoiYWl3YXJlLW91dCIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6IiIsInN0YXR1c0NvZGUiOiJmYWlsdXJlIiwiZmFpbHVyZU1zZyI6IiIsImZhaWx1cmVNc2dUeXBlIjoic3RyIiwiZmFpbHVyZVJlYXNvbiI6IiIsImZhaWx1cmVSZWFzb25UeXBlIjoic3RyIiwic2tpcFJlc3VsdENhbGxiYWNrIjpmYWxzZSwiZGlzYWJsZURlYnVnIjpmYWxzZSwiZXhjbHVkZU1ldGFkYXRhIjpmYWxzZSwieCI6NTEwLCJ5IjoyMDAsIndpcmVzIjpbXX0seyJpZCI6Ijk1MjY5OTZhNzc1NzYwMDUiLCJ0eXBlIjoiZGVidWciLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiJPdXRwdXQgQ2F1Z2h0IEVycm9ycyIsImFjdGl2ZSI6dHJ1ZSwidG9zaWRlYmFyIjp0cnVlLCJjb25zb2xlIjpmYWxzZSwidG9zdGF0dXMiOmZhbHNlLCJjb21wbGV0ZSI6InBheWxvYWQiLCJ0YXJnZXRUeXBlIjoibXNnIiwic3RhdHVzVmFsIjoiIiwic3RhdHVzVHlwZSI6ImF1dG8iLCJ4Ijo1MjAsInkiOjI4MCwid2lyZXMiOltdfV0='
      }
    ]
  });

  serviceContext.dbConnections['core'].read._push([], false);
};

const dal = createDal(serviceContext);

afterAll(() => {
  jest.resetModules();
});

beforeEach(function () {
  serviceContext.coreJob.cjdal.engine.getEngine.mockReset();
  serviceContext.coreJob.cjdal.engine.deleteEngine.mockReset();
  serviceContext.dal.flowTemplate.getFlowTemplates = jest.fn();
});

describe('dalFlow.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // validate basic structure
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(8);
    });
  });

  describe('#createFlow', function () {
    it('should create engine and return engineId', async function () {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        organizationId: 7682,
        input: { name: flowName }
      };

      mockFlowTemplate(serviceContext);

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
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);

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
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          name: flowName,
          engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
          deploymentModel: 3,
          isPublic: false,
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      mockEnginePackage();

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

      const context = mockUtil.makeContext();
      context._authInfo.json = {
        rights: ['developer.engine.create', 'developer.build.create']
      };
      try {
        res = await dal.createFlow(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toEqual('engineId');

      // event
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBe(3);
      expect(messages[0].event).toBe('engine_create'); // private event
      expect(messages[1].engineId).toBe(res.engineId); // public event for creating engine
      expect(messages[1].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(messages[2].packageId).toBe('newPackageId'); //public event for creating automate package
      expect(messages[2].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
    it('should create notebook and return engineId and manifest runtime', async function () {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        organizationId: 7682,
        input: { name: flowName, isNotebook: true }
      };

      mockFlowTemplate(serviceContext);

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
      serviceContext.dbConnections['core'].write._push([
        { id: 'engineId', manifest: { runtime: 'notebook' } }
      ]);

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
              runtime: 'notebook',
              engineMode: 'chunk',
              supportedInputTypes: ['application/json']
            },
            engineManifest: {
              runtime: 'notebook',
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
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          name: flowName,
          engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
          deploymentModel: 3,
          isPublic: false,
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      mockEnginePackage();

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

      const context = mockUtil.makeContext();
      context._authInfo.json = {
        rights: ['developer.engine.create', 'developer.build.create']
      };
      try {
        res = await dal.createFlow(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toEqual('engineId');
      expect(res.manifest.runtime).toEqual('notebook');
    });
    it('should create engine with linkedApplicationID', async function () {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        input: {
          linkedApplicationId: '123',
          name: flowName
        },
        organizationId: 7682
      };

      mockFlowTemplate(serviceContext);

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
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);

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

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          name: flowName,
          engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
          deploymentModel: 3,
          isPublic: false,
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      mockEnginePackage();

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

      const context = mockUtil.makeContext();
      context._authInfo.json = {
        rights: ['developer.engine.create', 'developer.build.create']
      };
      try {
        res = await dal.createFlow(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
    it('should create engine with empty templateId', async function () {
      let res, err;
      const flowName = `Test Flow`;
      const args = {
        organizationId: 7682,
        input: { name: flowName, templateId: '' }
      };

      mockFlowTemplate(serviceContext);

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
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);

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
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          name: flowName,
          engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
          deploymentModel: 3,
          isPublic: false,
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      mockEnginePackage();

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

      const context = mockUtil.makeContext();
      context._authInfo.json = {
        rights: ['developer.engine.create', 'developer.build.create']
      };
      try {
        res = await dal.createFlow(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.engineId).toEqual('engineId');
    });
    it('should create engine with the specified template', async function () {
      let res, err;
      const flowName = `Test Flow`;
      const templateFlow = {
        id: '00000000-0000-0000-0000-000000000000',
        title: 'Custom Template',
        subtitle: 'This is custome template',
        description: 'Template for testing',
        package: 'eyJkZXBlbmRlbmNpZXMiOnt9fQ==',
        flow:
          'W3siaWQiOiIyYzM5NTJmMzc4YzNhOGJmIiwidHlwZSI6InRhYiIsImxhYmVsIjoiRmxvdyAxIiwiZGlzYWJsZWQiOmZhbHNlLCJpbmZvIjoiIiwiZW52IjpbXX0seyJpZCI6IjI0NTJlZDRkYWNhOTcxYmEiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwiZm9ybWF0IjoiYnVmZmVyIiwic2FtcGxlcyI6W10sInRkb0NvbnRlbnQiOiJ7fSIsIl9tdGltZSI6MCwid2FpdEZvclJlc3VsdHMiOmZhbHNlLCJrZWVwUGF5bG9hZCI6ZmFsc2UsImtlZXBBbGl2ZSI6MCwic2VydmljZU1vZGVPbmx5Ijp0cnVlLCJ4IjoyNDAsInkiOjEwMCwid2lyZXMiOltbXV19LHsiaWQiOiJlMmQ0NDFmZjhkOWJhMTcyIiwidHlwZSI6ImFpd2FyZS1vdXQiLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiIiLCJzdGF0dXNDb2RlIjoic3VjY2VzcyIsImZhaWx1cmVNc2ciOiIiLCJmYWlsdXJlTXNnVHlwZSI6IiIsImZhaWx1cmVSZWFzb24iOiIiLCJmYWlsdXJlUmVhc29uVHlwZSI6IiIsInNraXBSZXN1bHRDYWxsYmFjayI6ZmFsc2UsImRpc2FibGVEZWJ1ZyI6ZmFsc2UsImV4Y2x1ZGVNZXRhZGF0YSI6ZmFsc2UsIngiOjU4MCwieSI6MTAwLCJ3aXJlcyI6W119LHsiaWQiOiI1OTg0MDc2OTIyODEwMjBkIiwidHlwZSI6ImNhdGNoIiwieiI6IjJjMzk1MmYzNzhjM2E4YmYiLCJuYW1lIjoiIiwic2NvcGUiOm51bGwsInVuY2F1Z2h0IjpmYWxzZSwieCI6MjYwLCJ5IjoyNDAsIndpcmVzIjpbWyIwZWVmNDNjNTZhNDU1ZDY5IiwiOTUyNjk5NmE3NzU3NjAwNSJdXX0seyJpZCI6IjBlZWY0M2M1NmE0NTVkNjkiLCJ0eXBlIjoiYWl3YXJlLW91dCIsInoiOiIyYzM5NTJmMzc4YzNhOGJmIiwibmFtZSI6IiIsInN0YXR1c0NvZGUiOiJmYWlsdXJlIiwiZmFpbHVyZU1zZyI6IiIsImZhaWx1cmVNc2dUeXBlIjoic3RyIiwiZmFpbHVyZVJlYXNvbiI6IiIsImZhaWx1cmVSZWFzb25UeXBlIjoic3RyIiwic2tpcFJlc3VsdENhbGxiYWNrIjpmYWxzZSwiZGlzYWJsZURlYnVnIjpmYWxzZSwiZXhjbHVkZU1ldGFkYXRhIjpmYWxzZSwieCI6NTEwLCJ5IjoyMDAsIndpcmVzIjpbXX0seyJpZCI6Ijk1MjY5OTZhNzc1NzYwMDUiLCJ0eXBlIjoiZGVidWciLCJ6IjoiMmMzOTUyZjM3OGMzYThiZiIsIm5hbWUiOiJPdXRwdXQgQ2F1Z2h0IEVycm9ycyIsImFjdGl2ZSI6dHJ1ZSwidG9zaWRlYmFyIjp0cnVlLCJjb25zb2xlIjpmYWxzZSwidG9zdGF0dXMiOmZhbHNlLCJjb21wbGV0ZSI6InBheWxvYWQiLCJ0YXJnZXRUeXBlIjoibXNnIiwic3RhdHVzVmFsIjoiIiwic3RhdHVzVHlwZSI6ImF1dG8iLCJ4Ijo1MjAsInkiOjI4MCwid2lyZXMiOltdfV0='
      };
      const args = {
        input: {
          templateId: '00000000-0000-0000-0000-000000000000',
          name: flowName
        },
        organizationId: 7682
      };

      serviceContext.dal.flowTemplate.getFlowTemplates.mockReturnValue({
        records: [templateFlow]
      });

      serviceContext.dbConnections['core'].read._push([], false);

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
      serviceContext.dbConnections['core'].write._push([{ id: 'engineId' }]);

      serviceContext.coreJob.cjdal.engine.getEngine.mockImplementation(
        (engineId, dbClient, callback) => {
          return callback(null, {
            engineId: 'engineId',
            edgeVersion: 3,
            name: `${flowName} - ${templateFlow.title}`,
            description: templateFlow.subtitle,
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

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'engineId',
          name: flowName,
          engineCategoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
          deploymentModel: 3,
          isPublic: false,
          ownerOrganizationId: 7682,
          dependency: { dependencyType: 'transcript', assetType: 'media' }
        }
      ]);

      mockEnginePackage();

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

      const context = mockUtil.makeContext();
      context._authInfo.json = {
        rights: ['developer.engine.create', 'developer.build.create']
      };
      try {
        res = await dal.createFlow(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
    });
  });

  describe('#validateReadAccess', function () {
    let customDal;
    let org;
    beforeAll(function () {
      _.set(
        serviceContext.config,
        'featureFlags.enablePackageGrantLogic',
        true
      );
      serviceContext.dal.engine.getEngines = jest.fn();
      serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
      serviceContext.dal.organization.getOrganization = jest.fn();
      // For validateWriteAccess
      serviceContext.dal.engine.getEngines.mockReturnValue({
        records: [
          {
            id: 'fedcf018-c89f-4840-a711-504db1ac1e42',
            name: 'test engine 1'
          },
          {
            id: 'ec856a84-424b-44da-8d10-e73e65cd7c16',
            name: 'test engine 2'
          }
        ],
        count: 2
      });
      org = {
        organizationId: 123,
        name: 'organization id',
        kvp: {
          features: {
            useEngineGrant: 'enabled'
          }
        }
      };
      serviceContext.dal.organization.getOrganization.mockReturnValue(org);
      customDal = dalFlow(serviceContext);
    });

    it('no resources found', async function () {
      let res, err;
      serviceContext.dal.packages.getAccessiblePackageResources.mockReturnValue(
        []
      );

      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization', org);
      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateReadAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('authorization_error');
    });

    it('returned resources are not enough', async function () {
      let res, err;
      serviceContext.dal.packages.getAccessiblePackageResources.mockReturnValue(
        [
          {
            resourceId: 'fedcf018-c89f-4840-a711-504db1ac1e42'
          }
        ]
      );

      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization', org);
      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateReadAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('authorization_error');
    });

    it('should not throw an error', async function () {
      let res, err;
      serviceContext.dal.packages.getAccessiblePackageResources.mockReturnValue(
        [
          {
            resourceId: 'fedcf018-c89f-4840-a711-504db1ac1e42'
          },
          {
            resourceId: 'ec856a84-424b-44da-8d10-e73e65cd7c16'
          }
        ]
      );

      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization', org);
      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateReadAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });

  describe('#validateWriteAccess', function () {
    let customDal;
    let org;
    const context = mockUtil.makeContext();
    beforeAll(function () {
      _.set(
        serviceContext.config,
        'featureFlags.enablePackageGrantLogic',
        true
      );

      serviceContext.dal.packages.getAccessiblePackageResources = jest.fn();
      serviceContext.dal.packages.getAccessiblePackageResources.mockReturnValue(
        [
          {
            resourceId: 'fedcf018-c89f-4840-a711-504db1ac1e42'
          },
          {
            resourceId: 'ec856a84-424b-44da-8d10-e73e65cd7c16'
          }
        ]
      );

      org = {
        organizationId: 123,
        name: 'organization id',
        kvp: {
          features: {
            useEngineGrant: 'enabled'
          }
        }
      };
      _.set(context, '_authInfo.organization', org);

      serviceContext.dal.engine.getOwnership = jest.fn();
      serviceContext.dal.organization.getOrganization = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue(org);
      customDal = dalFlow(serviceContext);
    });

    it('no engines found', async function () {
      let res, err;
      serviceContext.dal.engine.getOwnership.mockReturnValue({
        records: [],
        count: 0
      });

      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateWriteAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('authorization_error');
    });

    it('returned engines are not enough', async function () {
      let res, err;
      serviceContext.dal.engine.getOwnership.mockReturnValue({
        records: [
          {
            id: 'fedcf018-c89f-4840-a711-504db1ac1e42',
            name: 'test engine 1'
          }
        ],
        count: 1
      });

      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateWriteAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeDefined();
      expect(err.name).toEqual('authorization_error');
    });

    it('should not throw an error', async function () {
      let res, err;
      serviceContext.dal.engine.getOwnership.mockReturnValue({
        records: [
          {
            id: 'fedcf018-c89f-4840-a711-504db1ac1e42',
            name: 'test engine 1',
            ownerOrganizationId: org.organizationId
          },
          {
            id: 'ec856a84-424b-44da-8d10-e73e65cd7c16',
            name: 'test engine 2',
            ownerOrganizationId: org.organizationId
          }
        ],
        count: 2
      });

      const flowIds = [
        'fedcf018-c89f-4840-a711-504db1ac1e42',
        'ec856a84-424b-44da-8d10-e73e65cd7c16'
      ];

      try {
        res = await customDal.validateWriteAccess(context, flowIds);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
    });
  });
});
