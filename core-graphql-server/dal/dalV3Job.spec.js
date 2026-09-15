
const _ = require('lodash');

const moment = require('moment');
const createDal = require('./dalV3Job.js');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

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

serviceContext.bll.dagTemplate = {
  getDagTemplate: jest.fn()
};

const DAG_TEMPLATE_MOCK =
  '{\r\n  {{#if foo}} "foo":"{{minus foo 5}}", {{/if}}\r\n  "tasks":[],\r\n  "routes":[]\r\n}';

const dal = require('./dalV3Job.js')(serviceContext);
const engineId = '0ac1fb8d-cca1-4e78-b01d-0c26d9d4adbe';
const appId = '21dcf930-b76f-4691-8747-916ed7cd6a5e';
const clusterId = 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273';

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;

function makeContext(options) {
  return mockUtil.makeContext(options);
}

describe('dalV3Job.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      const test = dal;
      expect(typeof test).toEqual('object');
      expect(Object.keys(test).length).toEqual(5);
      expect(typeof test.createJob).toEqual('function');
      expect(typeof test.launchSingleEngineJob).toEqual('function');
      expect(typeof test.launchDAGTemplate).toEqual('function');
    });
  });

  describe('#v3CreateJob', function () {
    it('should throw if TDO not found', async function () {
      const context = makeContext();
      const input = {
        targetId: '12300002',
        organizationId: 7682,
        applicationId: appId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      // mock database result to TDO query
      coreDbRead._push([]);
      try {
        // should throw not found on TDO
        const res = await dal.createJob(context, {
          input
        });
        expect.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
    it('should throw if cached TDO not accessible to org by app ID', async function () {
      const context = makeContext({
        authType: 'api_internal'
      });
      // mock database result to TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12300002',
          application_id: '123',
          is_public: false
        }
      ]);
      const input = {
        applicationId: appId,
        applicationIds: [appId],
        targetId: '12300002',
        clusterId: clusterId,
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        await dal.createJob(context, {
          applicationId: appId,
          input
        });
        expect.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
    it('should throw if cached TDO not accessible to org by org ID', async function () {
      const context = makeContext({
        authType: 'api_internal'
      });
      // mock database result to TDO query
      serviceContext.dbConnections['core'].read._push([
        {
          id: '12300002',
          application_id: '123',
          is_public: false
        }
      ]);
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);
      const input = {
        organizationId: 7682,
        targetId: '12300002',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, {
          applicationId: appId,
          input
        });
        expect.fail('no not_found');
      } catch (error) {
        expect(error.name).toEqual('not_found');
      }
    });
    it('should throw if no app ID or org ID', async function () {
      const context = makeContext({
        authType: 'api_internal'
      });
      const input = {
        targetId: '12300002',
        tasks: [
          {
            engineId,
            payload: {
              foo: 'bar'
            }
          }
        ]
      };
      try {
        const res = await dal.createJob(context, {
          input
        });
        expect.fail('no invalid_input');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });
    it('should throw if cluster is not exists', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: 'ed075985-bc94-406b-8639-44d1da42c3fb',
          clusterId: 'rt-deadbeef-0000-0001-0001-ba5eba111111',
          tasks: []
        }
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // get Cluster
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(err.data.objectType).toEqual('Cluster');
      expect(err.data.objectId).toEqual(
        'rt-deadbeef-0000-0001-0001-ba5eba111111'
      );
    });
    it('should throw if both targetId and target are specified', async function () {
      const context = makeContext();
      const input = {
        targetId: '12300002',
        organizationId: 7682,
        applicationId: appId,
        target: {}
      };

      try {
        const res = await dal.createJob(context, {
          input
        });
        expect.fail('no invalid_input');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });

    it('should create job with a cluster and engines with the same edgeVersion', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '123',
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273',
          edge_version: 3
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273',
          edge_version: 3
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);
      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          edge_version: 3,
          category_id: 'engineCategiryId'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          alias_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          category_id: 'engineCategiryId'
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);

      coreDbRead._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea']
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          edge_version: 3,
          category_id: 'engineCategiryId'
        }
      ]);

      coreDbWrite._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      let res, err;
      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('pending');
    });

    it('should throw error trying to create a job with a cluster and engines with different edgeVersions and with organizationId as input param', async function () {
      const input = {
        organizationId: 7682,
        applicationId: appId,
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273',
          edge_version: 1
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);

      let res;
      try {
        res = await dal.createJob(serviceContext, {
          input
        });
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'mismatched version between the engine e62665c7-f855-4168-8aa3-668a7b0a50ea and the cluster rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273'
        );
      }
    });

    it('should throw error trying to create a job with a cluster and engines with different edgeVersions and without organizationId as input param', async function () {
      const input = {
        applicationId: appId,
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273', edge_version: 1 }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea', edge_version: 3 }
      ]);

      let res;
      try {
        res = await dal.createJob(serviceContext, {
          input
        });
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.name).toEqual('invalid_input');
        expect(error.message).toEqual(
          'mismatched version between the engine e62665c7-f855-4168-8aa3-668a7b0a50ea and the cluster rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273'
        );
      }
    });

    it('should throw error trying to create a job with a cluster and engine with edgeVersion less than 3', async function () {
      const input = {
        organizationId: 7682,
        applicationId: appId,
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 2 }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273',
          edge_version: 2
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea', edge_version: 2 }
      ]);

      let res, error;
      try {
        res = await dal.createJob(serviceContext, {
          input
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.name).toEqual('invalid_input');
    });

    it('should throw warning trying to validate a cluster without edgeVersion', async function () {
      serviceContext.requestInfo = {};

      const input = {
        applicationId: appId,
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };
      //cluster without edgeVersion
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273' }
      ]);

      const res = await dal.validateEngineAndClusterVersion(serviceContext, {
        tasks: input.tasks,
        clusterId: input.clusterId
      });
      const warnings = serviceContext.requestInfo.warnings;
      expect(warnings[0].event).toEqual('warning');
      expect(warnings[0].errorName).toEqual('edgeVersion missed');
      expect(warnings[0].message).toEqual(
        'cluster rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273 does not have a version defined'
      );
    });

    it('should throw warning trying to validate an engine without edgeVersion', async function () {
      serviceContext.requestInfo = {};

      const input = {
        applicationId: appId,
        clusterId: clusterId,
        tasks: [
          {
            taskType: 'type one',
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };
      //cluster without edgeVersion
      serviceContext.dbConnections['core'].read._push([
        { id: 'rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273', edgeVersion: 1 }
      ]);

      serviceContext.dbConnections['core'].read._push([
        { id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea' },
        { id: '987dj3he-f855-4168-8aa3-668a7b0a50ea' }
      ]);

      const res = await dal.validateEngineAndClusterVersion(serviceContext, {
        tasks: input.tasks,
        clusterId: input.clusterId
      });
      const warnings = serviceContext.requestInfo.warnings;
      expect(warnings.length).toEqual(2);
      expect(warnings[0].event).toEqual('warning');
      expect(warnings[0].errorName).toEqual('edgeVersion missed');
      expect(warnings[0].message).toEqual(
        'engine e62665c7-f855-4168-8aa3-668a7b0a50ea does not have a version defined'
      );
      expect(warnings[1].event).toEqual('warning');
      expect(warnings[1].errorName).toEqual('edgeVersion missed');
      expect(warnings[1].message).toEqual(
        'engine 987dj3he-f855-4168-8aa3-668a7b0a50ea does not have a version defined'
      );
    });

    it('should throw if ioFolder ID does not exist', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        tasks: [],
        routes: [
          {
            parentIoFolderReferenceId: 'abc',
            childIoFolderReferenceId: 'cde',
            options: {}
          },
          {
            parentIoFolderReferenceId: 'cde',
            options: {}
          }
        ]
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);

      try {
        const res = await dal.createJob(context, {
          input
        });
        expect.fail('no invalid_input');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });

    it('should throw if org is paused processing', async function () {
      const context = makeContext();
      const input = {
        organizationId: 1234,
        applicationId: '0c6c4f63-43ba-4d7c-acf7-848509cb21f8',
        targetId: '123',
        clusterId: clusterId,
        tasks: [
          {
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
            engine: {
              categoryId: 'categoryId'
            }
          }
        ]
      };
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: '123' }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 1234 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // populateTaskWithEngineBuildInfo -> dalEngine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          alias_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          category_id: 'engineCategiryId'
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineBuilds
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          id: 'buildId',
          manifest: {}
        }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineCategory
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea']
          }
        ],
        false
      );

      //job model -> dalEngine.getEngine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          alias_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          creates_recording: false,
          category_id: 'engineCategiryId'
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      let res, err;
      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('object_limit_exceeded');
    });

    it('should create job with tasks 1', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '123',
        clusterId: clusterId,
        tasks: [
          {
            engineId: 'e62665c7-f855-4168-8aa3-668a7b0a50ea'
          }
        ]
      };
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: '123' }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // populateTaskWithEngineBuildInfo -> dalEngine.getEngine
      coreDbRead._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          alias_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          category_id: 'engineCategiryId'
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineBuilds
      coreDbRead._push([
        {
          engine_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          id: 'buildId',
          manifest: {}
        }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineCategory
      coreDbRead._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea']
          }
        ],
        false
      );

      //job model -> dalEngine.getEngine
      coreDbRead._push([
        {
          id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          alias_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          creates_recording: false,
          category_id: 'engineCategiryId'
        }
      ]);

      coreDbWrite._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);

      coreDbWrite._push([], false, ['job_new.job_audit'], (sql, params) => {
        expect(params[3]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
        return true;
      });

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      let res, err;
      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('pending');
    });

    it('should create job with tasks 2', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '123',
        clusterId: clusterId,
        tasks: [
          {
            engineId: engineId
          }
        ]
      };
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: '123' }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // engine
      coreDbRead._push([
        {
          engineId: engineId,
          engine_alias_id: 'engineAlias1',
          category_id: 'engineCategory1'
        }
      ]);

      // engine build
      coreDbRead._push([
        {
          engine_id: engineId,
          id: 'build1',
          manifest: {}
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);

      // engine category
      coreDbRead._push(
        [
          {
            id: 'engineCategory1',
            engine_ids: [engineId],
            engine_alias_ids: ['engineAlias1']
          }
        ],
        false
      );

      //job model -> dalEngine.getEngine
      coreDbRead._push([
        {
          id: engineId,
          alias_id: 'engineAlias1',
          creates_recording: false
        }
      ]);

      coreDbWrite._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      const res = await dal.createJob(context, {
        input
      });
      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('pending');
    });

    it('should create job with tasks have libraryId and get libraryEngineModel populated', async function () {
      let res;
      const args = {
        input: {
          organizationId: 7682,
          applicationId: appId,
          targetId: '123',
          clusterId: 'clusterId',
          tasks: [
            {
              engineId: engineId,
              payload: {
                libraryId: 'ffb6896d-64bf-420b-995c-bd3f4dcd3672'
              }
            }
          ]
        },
        organizationId: 7682
      };

      const context = mockUtil.makeContext();
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: '123' }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: 'clusterId' }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: 'clusterId' }]);
      // get EngineBuild
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: engineId,
          id: 'engineBuildId',
          category_id: 'engineCategory1',
          manifest: {}
        }
      ]);
      // engine
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: engineId,
          id: 'engineBuildId',
          manifest: {}
        }
      ]);
      // engine category
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'engineCategory1',
            engine_ids: [engineId],
            engine_alias_ids: ['engineAlias1']
          }
        ],
        false
      );
      // engine
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: engineId,
          id: 'engineBuildId',
          manifest: {}
        }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);

      // librariesService.getLibraries
      serviceContext.librariesService.getLibraries = jest
        .fn()
        .mockImplementation((params, includes) => {
          return Promise.resolve({ results: [{ ownerOrgId: 7682 }] });
        });
      // getMostRecentLibraryEngineModel
      serviceContext.dbConnections['core'].read._push(
        [
          {
            library_engine_model_id: 'e0b84f8b-2d5c-4c41-9bc6-a8c3e3f4387e',
            library_id: 'ffb6896d-64bf-420b-995c-bd3f4dcd3672'
          }
        ],
        false
      );

      coreDbWrite._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      res = await dal.createJob(context, args);

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('pending');
    });

    it('should create job and remove Stream Ingestor v2', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        targetId: '123',
        clusterId: clusterId,
        tasks: [
          {
            engineId: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041' // Stream Ingestor V2
          },
          {
            engineId: engineId
          }
        ]
      };
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: '123' }]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // populateTaskWithEngineBuildInfo -> dalEngine.getEngine
      coreDbRead._push([
        {
          id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          alias_id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          category_id: 'engineCategoryId'
        }
      ]);
      coreDbRead._push([
        {
          id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          alias_id: 'ea0ada2a-7571-4aa5-9172-b5a7d989b041',
          category_id: 'engineCategoryId'
        }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineBuilds
      coreDbRead._push([
        {
          engine_id: 'e62665c7-f855-4168-8aa3-668a7b0a50ea',
          id: 'buildId',
          manifest: {
            engineMode: 'stream'
          }
        }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineBuilds
      coreDbRead._push([
        {
          engine_id: engineId,
          id: 'buildId1',
          manifest: {}
        }
      ]);
      // populateTaskWithEngineBuildInfo -> getEngineCategory
      coreDbRead._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            typeName: 'Aggregator'
          }
        ],
        false
      );
      coreDbRead._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            typeName: 'Aggregator'
          }
        ],
        false
      );

      coreDbWrite._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        },
        {
          id: 'taskId',
          engine_id: engineId
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      const res = await dal.createJob(context, {
        input
      });

      expect(res).toBeDefined();
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.status).toEqual('pending');
      expect(res.tasks.length).toEqual(1);
    });
  });

  it.each([
    {
      _need_uri: true,
      engineId: engineId,
      ioFolders: [
        {
          type: 'output'
        }
      ]
    },
    {
      engineId: engineId,
      ioFolders: [
        {
          type: 'input'
        }
      ]
    },
    {
      engineId: engineId,
      ioFolders: [
        {
          type: 'output'
        },
        {
          type: 'input'
        }
      ]
    },
    {
      engineId: engineId,
      ioFolders: [
        {
          type: 'input'
        },
        {
          type: 'output'
        }
      ]
    }
  ])(
    'should create job with task missing url in payload',
    async function (taskPayload) {
      let res, err;
      const context = mockUtil.makeContext();
      const headerAppId = '11111111-2222-4333-8444-555555555555';
      const orgGuid = '11111111-2222-4333-8444-555555555555'
      _.set(context, 'requestContext.appId', headerAppId);
      _.set(context, 'requestContext.tokenInfo.organization.organizationGuid', orgGuid);
      const args = {
        input: {
          targetId: '1100002049',
          applicationId: 'applicationId',
          clusterId: 'clusterId',
          organizationId: 7682,
          tasks: [taskPayload]
        },
        organizationId: 7682
      };
      // getTDO
      serviceContext.dbConnections['core'].read._push([{ id: 1100002049 }]);
      // // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', name: 'clusterName' }
      ]);
      // getCluster Group
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterId', name: 'clusterName' }
      ]);

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId, category_id: 'categoryId' }
      ]);

      // get EngineBuild
      serviceContext.dbConnections['core'].read._push([
        { engine_id: engineId, id: 'engineBuildId' }
      ]);
      // serviceContext.dal.application.getAppIdFromOrgId
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      // serviceContext.dal.user.getOrgAdminUsers
      serviceContext.dbConnections['sso'].read._push([
        { user_id: '4f460b23-5e67-404b-b275-5b18a5ab9373' },
        { user_id: '3be86fe6-74af-4e6c-8201-aaa83328c52f' }
      ]);
      // get Engine Category
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'categoryId',
            engine_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea'],
            engine_alias_ids: ['e62665c7-f855-4168-8aa3-668a7b0a50ea']
          }
        ],
        false
      );
      // getStreamUrl
      serviceContext.dbConnections['core'].read._push([{ details: 'details' }]);
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId', content_type: 'video/mp4' }
      ]);
      serviceContext.dbConnections['core'].read._push([{ content: 'content' }]);
      serviceContext.dbConnections['core'].read._push([
        { asset_id: 'assetId1', content_type: 'video/mp4' }
      ]);

      // get Engine -- validate
      serviceContext.dbConnections['core'].read._push([
        {
          engine_id: engineId,
          category_id: 'categoryId'
        }
      ]);
      // createJob

      serviceContext.dbConnections['core'].write._push(
        [
          {
            jobId: 'newJob_123',
            applicationId: appId,
            status: 'pending'
          }
        ],
        true,
        [],
        (sql, args) => {
            // For job creation, validate job-specific fields
            if (sql.toLowerCase().includes('insert into job_new.job')) {
              expect(sql.toLowerCase()).toContain('content_application_id');
              expect(args[9]).toEqual(headerAppId);

              const jobConfigArg = args[13];
              expect(jobConfigArg).toBeDefined();
              expect(_.get(jobConfigArg, 'authData.contentApplicationId')).toEqual(headerAppId);
              expect(_.get(jobConfigArg, 'authData.organizationGuid')).toEqual(orgGuid);
            } 
            // For task creation, validate task-specific fields
            else if (sql.toLowerCase().includes('insert into job_new.task')) {
              const expectedTaskUrl = 'http://localhost/media-streamer/download/tdo/1100002049';
              if (taskPayload._need_uri) {
                expect(args[24].url).toEqual(expectedTaskUrl);
              } else {
                expect(args[24].url).toBeUndefined();
              }
            }
            return true;
        }
      );

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      try {
        res = await dal.createJob(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(err).toBeUndefined();
    }
  );

  describe('#launchSingleEngineJob', function () {
    it('should throw if targetId and uploadUrl are not set', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId
      };
      try {
        // should throw not found on TDO
        await dal.launchSingleEngineJob(
          {
            input
          },
          context
        );
        expect.fail('expected error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });
    it('should throw if engine does not exist', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          engineId: 'invalid_engine_id',
          targetId: 'tdo_id'
        }
      };
      // get Engine
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
      expect(err.data.engineId).toEqual('invalid_engine_id');
    });

    it('should throw if engine does not have a singleJobTemplate', async function () {
      let res, err;
      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          engineId: 'invalid_engine_id',
          targetId: 'tdo_id'
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        { id: 'invalid_engine_id' }
      ]);

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_allowed');
      expect(err.data.engineId).toEqual('invalid_engine_id');
    });

    it('should throw if engine template does not generate valid json', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          engineId: 'invalid_engine_id',
          targetId: '12345'
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'invalid_engine_id',
          single_engine_tdo_job_json: 'not a valid json'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 12345
        }
      ]);
      // get MediaUrl -> getSource
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getMDP
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getAssets
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      expect(err.data.engineId).toEqual('invalid_engine_id');
    });

    it('should throw if engine template inflation does not resolve all parameters', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          engineId: 'invalid_engine_id',
          targetId: '12345'
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'invalid_engine_id',
          single_engine_tdo_job_json: {
            targetId: '{{TARGET_ID}}',
            payload: '{{PAYLOAD}}'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 12345
        }
      ]);
      // get MediaUrl -> getSource
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getMDP
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getAssets
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      expect(err.data.engineId).toEqual('invalid_engine_id');
      expect(err.data.error).toContain('PAYLOAD');
    });

    it('should throw if engine template inflation does not produce JSON', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          engineId: 'invalid_engine_id',
          uploadUrl: 'www.com'
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'invalid_engine_id',
          single_engine_upload_job_json: {
            template: '{{UPLOAD_URL}}',
            templateLanguage: 'Handlebars'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: 12345
        }
      ]);
      // get MediaUrl -> getSource
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getMDP
      serviceContext.dbConnections['core'].read._push([]);
      // get MediaUrl -> getAssets
      serviceContext.dbConnections['core'].read._push([]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('internal_error');
      expect(err.data.engineId).toEqual('invalid_engine_id');
      expect(err.data.error).toContain('JSON');
    });

    it('should call createJob - upload', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: appId,
          engineId: engineId,
          uploadUrl: 'http://www.com',
          clusterId: clusterId,
          priority: 1
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'invalid_engine_id',
          single_engine_upload_job_json: {
            template: `{"uploadUrl":"{{UPLOAD_URL}}", "tasks":[], "clusterId": "{{clusterId}}"}`,
            templateLanguage: 'Handlebars'
          }
        }
      ]);

      // // createJob db calls
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference
      serviceContext.dbConnections['core'].read._push([]);
      // get cluster
      serviceContext.dbConnections['core'].read._push([
        { id: clusterId, organization_id: 7682 }
      ]);
      // get cluster group
      serviceContext.dbConnections['core'].read._push([
        { id: clusterId, organization_id: 7682 }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending',
          cluster_id: clusterId
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      res = await dal.launchSingleEngineJob(args, context);
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.clusterId).toEqual(clusterId);
    });

    it('should call createJob - reprocess', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: appId,
          engineId: engineId,
          targetId: '123',
          clusterId: clusterId
        }
      };

      // get Engine
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'invalid_engine_id',
          single_engine_tdo_job_json: {
            template: '{"targetId":"{{TARGET_ID}}", "tasks":[]}',
            templateLanguage: 'Handlebars'
          }
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          isPublic: true
        }
      ]);
      // get TDO Details (shouldIncludeVirtualAsset)
      serviceContext.dbConnections['core'].read._push([
        {
          details: {
            num_segments: 2
          },
          asset_id: 'mdp-1'
        }
      ]);

      // createJob db calls
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        }
      ]);

      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          isPublic: true
        }
      ]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      serviceContext.dbConnections['core'].write._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending'
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      try {
        res = await dal.launchSingleEngineJob(args, context);
      } catch (err) {
        throw err;
      }
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
    });

    it('createJob - Missing clusterId - Unable to get a value from configs/ settings', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain(
            'Unable to get clusterId in configs/ settings'
          );
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('createJob - featureFlags.enableClusterPreference = true - Unable to get a value from configs/ settings', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // Enable featureFlags.enableClusterPreference
      serviceContext.config.featureFlags.enableClusterPreference = true;

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference - OrgAlwaysRun
      serviceContext.dbConnections['core'].read._push(['']);
      // Get organiation
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // serviceContext.dal.cluster.getClusterByPreference - organization & businessUnit
      serviceContext.dbConnections['core'].read._push([]);
      // serviceContext.dal.cluster.getClusterByPreference - default
      serviceContext.dbConnections['core'].read._push([]);

      // // getCluster
      // serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain(
            'Unable to get clusterId in configs/ settings'
          );
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('invalid_input');
    });

    it('createJob - featureFlags.enableClusterPreference = true - OrgAlwaysRun - Cluster not found', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // Enable featureFlags.enableClusterPreference
      serviceContext.config.featureFlags.enableClusterPreference = true;

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference - OrgAlwaysRun
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cluter-id-test-1' }
      ]);

      // getCluster - not found by id `cluter-id-test-1`
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain('The cluster was not found');
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
    });

    it('createJob - featureFlags.enableClusterPreference = true - organization & businessUnit - Cluster not found', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // Enable featureFlags.enableClusterPreference
      serviceContext.config.featureFlags.enableClusterPreference = true;

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference - OrgAlwaysRun
      serviceContext.dbConnections['core'].read._push([]);
      // Get organiation
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // serviceContext.dal.cluster.getClusterByPreference - organization & businessUnit
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cluter-id-test-1' }
      ]);

      // getCluster - not found by id `cluter-id-test-1`
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain('The cluster was not found');
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
    });

    it('createJob - featureFlags.enableClusterPreference = true - default - Cluster not found', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // Enable featureFlags.enableClusterPreference
      serviceContext.config.featureFlags.enableClusterPreference = true;

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference - OrgAlwaysRun
      serviceContext.dbConnections['core'].read._push([]);
      // Get organiation
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // serviceContext.dal.cluster.getClusterByPreference - organization & businessUnit
      serviceContext.dbConnections['core'].read._push([]);
      // serviceContext.dal.cluster.getClusterByPreference - default
      serviceContext.dbConnections['core'].read._push([
        { cluster_id: 'cluter-id-test-1' }
      ]);

      // getCluster - not found by id `cluter-id-test-1`
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain('The cluster was not found');
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
    });

    it('createJob - featureFlags.enableClusterPreference = true - config.aiware.defaultCluster.id is available - Cluster not found', async function () {
      let res, err;

      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        engineId: engineId,
        uploadUrl: 'http://www.com',
        priority: 1
      };

      // Enable featureFlags.enableClusterPreference
      serviceContext.config.featureFlags.enableClusterPreference = true;
      serviceContext.config.aiware.defaultCluster.id = 'cluter-id-test-1';

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference - OrgAlwaysRun
      serviceContext.dbConnections['core'].read._push([]);
      // Get organiation
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 1234,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: {
            features: { allowEngineOverage: false },
            billing: { pausedProcessing: true }
          },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // serviceContext.dal.cluster.getClusterByPreference - organization & businessUnit
      serviceContext.dbConnections['core'].read._push([]);
      // serviceContext.dal.cluster.getClusterByPreference - default
      serviceContext.dbConnections['core'].read._push([]);
      // getCluster - not found by id `cluter-id-test-1`
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.createJob(context, {
          input
        });
      } catch (error) {
        if (error) {
          expect(`${error}`).toContain('The cluster was not found');
        }
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.name).toEqual('not_found');
    });
  });

  describe('#launchDAGTemplate', function () {
    it('should throw if dagTemplateId is not set', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId
      };
      try {
        // should throw not found on TDO
        await dal.launchDAGTemplate(context, {
          input
        });
        expect.fail('expected error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });
    it('should throw if targetId and uploadUrl are not set', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        dagTemplateId: 'dag-template-id'
      };
      try {
        // should throw not found on TDO
        await dal.launchDAGTemplate(context, {
          input
        });
        expect.fail('expected error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });
    it('should throw if dagTemplateFields format is incorrect.', async function () {
      const context = makeContext();
      const input = {
        organizationId: 7682,
        applicationId: appId,
        dagTemplateId: 'dag-template-id',
        targetId: 'tdoId',
        dagTemplateFields: [{ foo: 'bar' }]
      };
      try {
        // should throw not found on TDO
        await dal.launchDAGTemplate(context, {
          input
        });
        expect.fail('expected error');
      } catch (error) {
        expect(error.name).toEqual('invalid_input');
      }
    });

    it('should call createJob - upload', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: appId,
          uploadUrl: 'http://www.com',
          clusterId: clusterId,
          dagTemplateId: 'dag-template-id',
          dagTemplateFields: [{ fieldName: 'foo', fieldValue: '5' }]
        }
      };
      // createJob db calls
      serviceContext.dbConnections['sso'].read._push([
        {
          application_id: appId
        }
      ]);
      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getClusterByPreference
      serviceContext.dbConnections['core'].read._push([]);
      // get cluster
      serviceContext.dbConnections['core'].read._push([
        { id: clusterId, organization_id: 7682 }
      ]);
      // get cluster group
      serviceContext.dbConnections['core'].read._push([
        { id: clusterId, organization_id: 7682 }
      ]);

      serviceContext.bll.dagTemplate.getDagTemplate.mockReturnValueOnce({
        dag: {
          template: DAG_TEMPLATE_MOCK
        },
        dagTemplateLanguage: 'Handlebars'
      });

      serviceContext.dbConnections['core'].write._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending',
          cluster_id: clusterId
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      res = await dal.launchDAGTemplate(context, args);
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
      expect(res.clusterId).toEqual(clusterId);
    });

    it('should call createJob - reprocess', async function () {
      let res, err;

      const context = makeContext();
      const args = {
        input: {
          organizationId: 7682,
          applicationId: appId,
          targetId: '123',
          clusterId: clusterId,
          dagTemplateId: 'dag-template-id',
          dagTemplateFields: [{ fieldName: 'foo', fieldValue: '5' }]
        }
      };

      // createJob db calls
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          details: {
            num_segments: 2
          },
          asset_id: 'mdp-1'
        }
      ]);

      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          assetId: '123_456',
          content_type: 'test/test'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        }
      ]);

      // serviceContext.dal.organization.getOrgIdFromAppId
      serviceContext.dbConnections['sso'].read._push([{ id: 7682 }]);
      // serviceContext.dal.cluster.getCollaborators
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123',
          isPublic: true
        }
      ]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      // getCluster to check is Group
      serviceContext.dbConnections['core'].read._push([{ id: clusterId }]);
      serviceContext.bll.dagTemplate.getDagTemplate.mockReturnValueOnce({
        dag: {
          template: DAG_TEMPLATE_MOCK
        },
        dagTemplateLanguage: 'Handlebars'
      });

      serviceContext.dbConnections['core'].write._push([
        {
          jobId: 'newJob_123',
          applicationId: appId,
          status: 'pending',
          cluster_id: clusterId
        }
      ]);

      //---- Start function serviceContext.bll.job.checkProcessingLimitsForOrg
      // serviceContext.dal.organization.getOrganization
      serviceContext.dbConnections['media_platform'].read._push([
        { exists: true }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 7682,
          organization_name: 'Veritone, Inc.',
          business_unit: 'DSRD',
          kvp: { features: { allowEngineOverage: true } },
          date_created: '2015-11-03T17:18:25.194Z',
          date_modified: '2020-12-09T02:58:02.306Z',
          seat_limit: null,
          status: 'active',
          max_aiware_nodes: null,
          max_aiware_clusters: null,
          engine_category_export_formats: [],
          organization_type: [],
          remaining_budget: 10000,
          is_limit_enforced: true
        }
      ]);
      // ------- end function serviceContext.bll.job.checkProcessingLimitsForOrg

      try {
        res = await dal.launchDAGTemplate(context, args);
      } catch (err) {
        throw err;
      }
      expect(res.jobId).toEqual('newJob_123');
      expect(res.applicationId).toEqual(appId);
    });
  });
});
