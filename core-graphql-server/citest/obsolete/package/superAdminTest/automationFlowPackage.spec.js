const GraphqlClient = require('../../helpers/gql');
const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const uuid = require('uuid');
const config = helpers.config;
const _ = require('lodash');
const packageCommonQuery = require('../packageCommonQuery');
const { safe } = require('../../helpers/cleanup/utils');

let flowId, flowRevisionId, flowRevisionIdWithoutPackage, buildId, hubPackageId;
const env = config.env;
let gqlClient = new GraphqlClient(env);
let automaticPackageCreation;
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const testOrgInput = {
  name: citestMarker + '-org-' + uuid.v4(),
  businessUnit: 'Legal',
  types: ['agency', 'broadcaster'],
  kvp: {
    features: {
      enableRBACFeature: 'enabled'
    }
  },
  apps: [
    {
      applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
      applicationKey: 'cms'
    },
    isDesktopAppEnabled
      ? null
      : {
          applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
          applicationKey: 'admin'
        },
    {
      applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
      applicationKey: 'developer'
    },
    {
      applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
      applicationKey: 'discovery'
    }
  ].filter((app) => app)
};

const password = 'testPassowrd';
const testData = {
  autoOrg: {
    orgId: '',
    adminId: '',
    adminName: '',
    adminOption: {},
    flowId: '',
    flowRevisionId: '',
    buildId: '',
    packageId: '',
    flowTemplateId: '',
    flowIdFromTemplate: '',
    flowRevisionIdFromTemplate: '',
    buildIdFromTemplate: '',
    packageIdFromTemplate: ''
  },
  engineGrantOrg: {
    orgId: '',
    adminId: '',
    adminName: '',
    adminOption: {}
  },
  basicOrg: {
    orgId: '',
    adminId: '',
    adminName: '',
    adminOption: {},
    flowId: '',
    flowRevisionId: '',
    buildId: '',
    packageId: '',
    flowTemplateId: '',
    flowIdFromTemplate: '',
    flowRevisionIdFromTemplate: '',
    buildIdFromTemplate: '',
    packageIdFromTemplate: ''
  }
};
const superAdmin = {
  option: {},
  token: '',
  orgId: ''
};

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

describe('citest_package: flow package test', () => {
  beforeAll(async () => {
    const superAdminLogin = await userHelpers.loginUser(
      { gqlClient },
      { userName: config.userName, password: config.password }
    );
    superAdmin.token = superAdminLogin.token;
    superAdmin.option = helpers.requestOptions(superAdmin.token);
    gqlClient.userAuth = superAdmin.option;
    gqlClient.tokenAuth = helpers.requestOptions(superAdminLogin.apiToken);
    gqlClient.userToken = superAdmin.token;

    // T64: Redis write for the session token may lag the HTTP response by several seconds
    // under CI load. Poll until the token is confirmed active before running tests.
    // Bumped 30→60 (T64 extended): 30 retries exhausted on 2026-06-28 runs (31s total).
    // Bumped 60→120 (T64 extended): 60 retries also exhausted (60.965s) on PR #4165 run 28337304005.
    // Bumped 120→240 (T64 extended): 120 retries exhausted (121.998s) on run 28345342295.
    let superAdminInfo;
    for (let i = 0; i < 240; i++) {
      try {
        const superAdminRes = await gqlClient.query(
          packageCommonQuery.meGql,
          {},
          superAdmin.option
        );
        superAdminInfo = _.get(superAdminRes, 'me');
        if (superAdminInfo) break;
      } catch (e) {
        if (i === 239) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    expect(superAdminInfo).toBeDefined();
    superAdmin.orgId = superAdminInfo.organization.id;
  });

  describe('Flow package automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // create org automaticPackageCreation = false
      const features = {
        enableRBACFeature: 'enabled',
        automaticPackageCreation: 'disabled',
        features: {
          enableRBACFeature: 'enabled',
          automaticPackageCreation: 'disabled'
        }
      };
      // create admin user
      const newOrg = await orgHelpers.orgSetup(
        citestMarker,
        { gqlClient },
        { ...testOrgInput, kvp: features },
        true
      );

      expect(newOrg.id).toBeDefined();
      testData.basicOrg.orgId = newOrg.id;

      // create admin user
      const newUser = await userHelpers.createUser(
        { gqlClient },
        {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          orgId: newOrg.id,
          rolesIds: roleIds
        }
      );
      expect(newUser.id).toBeDefined();
      testData.basicOrg.adminId = newUser.id;
      testData.basicOrg.adminName = newUser.name;

      // add OLP
      await setOLPPermissions({
        orgId: newOrg.id,
        orgGuid: newOrg.guid,
        userId: newUser.id
      });

      // login user
      const loginRes = await userHelpers.loginUser(
        { gqlClient },
        { userName: newUser.name, password }
      );
      expect(loginRes.token).toBeDefined();
      testData.basicOrg.adminOption = helpers.requestOptions(loginRes.token);

      const query = `
        query Me{
            me{
              organization{
                jsondata
              }
            }
        }`;

      const result = await gqlClient.query(
        query,
        {},
        testData.basicOrg.adminOption
      );

      // this feature is undefined in ai13s but the following code checks for "disabled" value
      automaticPackageCreation = _.get(
        result,
        'me.organization.jsondata.features.automaticPackageCreation'
      );
    });

    it('create a flow', async () => {
      const result = await gqlClient.query(
        packageCommonQuery.createFlowQuery,
        {
          name: citestMarker + '-' + uuid.v4()
        },
        testData.basicOrg.adminOption
      );
      testData.basicOrg.flowId = _.get(result, 'createFlow.id');
      expect(testData.basicOrg.flowId).toBeDefined();
    });

    it('create a flow revision', async () => {
      const runtime = JSON.stringify(
        '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
      );

      const result = await gqlClient.query(
        packageCommonQuery.createFlowRevisionQuery,
        {
          flowId: testData.basicOrg.flowId,
          runtime: JSON.parse(runtime)
        },
        testData.basicOrg.adminOption
      );
      testData.basicOrg.flowRevisionId = _.get(
        result,
        'createFlowRevision.flowRevisionId'
      );
      expect(testData.basicOrg.flowRevisionId).toBeDefined();
    });

    it('deploy flow revision', async () => {
      const result = await gqlClient.query(
        packageCommonQuery.deployFlowRevisionQuery,
        {
          flowId: testData.basicOrg.flowId,
          flowRevisionId: testData.basicOrg.flowRevisionId
        },
        testData.basicOrg.adminOption
      );
      const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
      testData.basicOrg.buildId = _.get(result, 'deployFlowRevision.buildId');
      expect(isDeployed).toEqual(true);
      expect(testData.basicOrg.buildId).toBeDefined();
    });

    it('Get auto flow package - should fail', async () => {
      const queryPackagePromis = gqlClient.query(
        packageCommonQuery.automatePackageQuery,
        { engineId: testData.basicOrg.flowId },
        testData.basicOrg.adminOption
      );

      await expect(queryPackagePromis).rejects.toThrow(/does not exist/);
    });

    it('Get flow package - should not exist', async () => {
      const result = await gqlClient.query(packageCommonQuery.getPackages, {
        orgId: testData.basicOrg.orgId,
        resourceId: testData.basicOrg.flowRevisionId
      });
      const packageData = _.get(result, 'packages.records');
      expect(packageData.length).toEqual(0);
    });

    it('Get flow revision by id through singular query (flowRevision) - should succeed', async () => {
      const query = `
          query getFlowRevision ($id: ID!) {
            flowRevision(id: $id){
              flowRevisionId
            }
          }`;

      const result = await gqlClient.query(
        query,
        {
          id: testData.basicOrg.flowRevisionId
        },
        testData.basicOrg.adminOption
      );
      const flowRevision = _.get(result, 'flowRevision');
      expect(flowRevision).toBeDefined();
      expect(flowRevision.flowRevisionId).toEqual(
        testData.basicOrg.flowRevisionId
      );
    });

    it('Get flow revision by id through plural query (flowRevisions) - should succeed', async () => {
      const query = `
          query getFlowRevisions ($id: ID!) {
            flowRevisions(id: $id){
              records {
                engineId
              }
            }
          }`;

      const result = await gqlClient.query(
        query,
        {
          id: testData.basicOrg.flowRevisionId
        },
        testData.basicOrg.adminOption
      );
      const flowRevisions = _.get(result, 'flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions.length).toBe(1);
      expect(
        flowRevisions.every(
          (revision) => revision.engineId === testData.basicOrg.flowId
        )
      ).toBe(true);
    });

    it('Get flow revision by flow id - should succeed', async () => {
      const query = `
          query getFlowRevisions ($flowId: ID!) {
            flowRevisions(flowId: $flowId){
              records {
                engineId
              }
            }
          }`;

      const result = await gqlClient.query(
        query,
        {
          flowId: testData.basicOrg.flowId
        },
        testData.basicOrg.adminOption
      );
      const flowRevisions = _.get(result, 'flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions.length).toBe(2); // 1 created revision + 1 head revision
      expect(
        flowRevisions.every(
          (revision) => revision.engineId === testData.basicOrg.flowId
        )
      ).toBe(true);
    });

    it('Get flow revision by engine id - should succeed', async () => {
      const query = `
          query getFlowRevisions ($engineId: ID!) {
            flowRevisions(engineId: $engineId){
              records {
                engineId
              }
            }
          }`;

      const result = await gqlClient.query(
        query,
        {
          engineId: testData.basicOrg.flowId
        },
        testData.basicOrg.adminOption
      );
      const flowRevisions = _.get(result, 'flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions.length).toBe(2); // 1 created revisions + 1 head revision
      expect(
        flowRevisions.every(
          (revision) => revision.engineId === testData.basicOrg.flowId
        )
      ).toBe(true);
    });

    it('create package for flow revision', async () => {
      const createPackageRes = await gqlClient.query(
        packageCommonQuery.createPackageQuery,
        {
          name: citestMarker + '-package-' + uuid.v4(),
          distributionType: 'public',
          resources: [
            {
              resourceType: 'automateFlowRevision',
              resourceId: testData.basicOrg.flowRevisionId,
              action: 'ADD'
            }
          ]
        },
        testData.basicOrg.adminOption
      );

      const packageCreate = _.get(createPackageRes, 'packageCreate');
      expect(packageCreate).toBeDefined();
      testData.basicOrg.packageId = packageCreate.id;
    });

    it('Get auto flow package - should fail', async () => {
      const promise = gqlClient.query(packageCommonQuery.automatePackageQuery, {
        engineId: testData.basicOrg.flowId
      });
      await expect(promise).rejects.toThrow(/does not exist/);
    });

    it('Get flow package - should success', async () => {
      const result = await gqlClient.query(
        packageCommonQuery.getPackageByIdQuery,
        { id: testData.basicOrg.packageId },
        testData.basicOrg.adminOption
      );
      const packageData = _.get(result, 'packages.records[0]');
      expect(packageData).toBeDefined();
      const packageId = _.get(packageData, 'id');
      const resourceId = _.get(packageData, 'resources.records[0].resourceId');
      expect(resourceId).toBeDefined();
      expect(resourceId).toEqual(testData.basicOrg.flowRevisionId);
      expect(packageId).toBeDefined();
    });

    it('update flow status to inactive', async () => {
      // check status and pause
      const engineBuildRes = await gqlClient.query(
        `
        query engineBuild {
          engineBuild (id: "${testData.basicOrg.buildId}"){
            id
            engineId
            status
          }
        }`,
        {},
        testData.basicOrg.adminOption
      );

      const engineBuild = _.get(engineBuildRes, 'engineBuild');
      expect(engineBuild.status).toBeDefined();
      if (engineBuild.status === 'paused') {
        return;
      }

      const result = await gqlClient.query(
        packageCommonQuery.updateBuildQuery,
        {
          buildId: testData.basicOrg.buildId,
          engineId: testData.basicOrg.flowId,
          action: 'pause'
        },
        testData.basicOrg.adminOption
      );
      const engineStatus = _.get(result, 'updateEngineBuild.status');
      expect(engineStatus).toEqual('paused');
    });

    it('update auto package', async () => {
      const newName = citestMarker + '-package-' + uuid.v4();
      const updatePackageRes = await gqlClient.query(
        packageCommonQuery.updatePackageQuery,
        { input: { id: testData.basicOrg.packageId, name: newName } },
        testData.basicOrg.adminOption
      );
      const packageUpdate = _.get(updatePackageRes, 'packageUpdate');
      expect(packageUpdate).toBeDefined();
      expect(packageUpdate.id).toEqual(testData.basicOrg.packageId);
      expect(packageUpdate.name).toEqual(newName);
    });

    it('grant auto package', async () => {
      const grantRes = await gqlClient.query(
        packageCommonQuery.grantPackageQuery,
        {
          packageId: testData.basicOrg.packageId,
          packageGrants: [
            {
              organizationId: superAdmin.orgId,
              grantType: 'VIEW',
              action: 'ADD'
            }
          ]
        },
        testData.basicOrg.adminOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('remove grant auto package', async () => {
      const grantRes = await gqlClient.query(
        packageCommonQuery.grantPackageQuery,
        {
          packageId: testData.basicOrg.packageId,
          packageGrants: [
            {
              organizationId: superAdmin.orgId,
              grantType: 'VIEW',
              action: 'REMOVE'
            }
          ]
        },
        testData.basicOrg.adminOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('delete the flow', async () => {
      const result = await gqlClient.query(
        packageCommonQuery.deleteEngineQuery,
        { id: testData.basicOrg.flowId }
      );
      expect(_.get(result, 'deleteEngine.id')).toEqual(
        testData.basicOrg.flowId
      );
      testData.basicOrg.flowId = null; // prevent afterAll delete
    });

    it('delete package', async () => {
      const deletePackageRes = await gqlClient.query(
        packageCommonQuery.deletePackageQuery,
        { id: testData.basicOrg.packageId },
        testData.basicOrg.adminOption
      );
      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage.success).toEqual(true);
      testData.basicOrg.packageId = null; // prevent delete again at afterAll
    });
  });

  describe('Flow package automaticPackageCreation = true', () => {
    beforeAll(async () => {
      const features = {
        features: {
          enableRBACFeature: 'enabled',
          automaticPackageCreation: 'enabled'
        }
      };

      // create org automaticPackageCreation = true
      const newOrg = await orgHelpers.orgSetup(
        citestMarker,
        { gqlClient },
        { ...testOrgInput, kvp: features },
        true
      );

      expect(newOrg.id).toBeDefined();
      testData.autoOrg.orgId = newOrg.id;

      // create admin user
      const newUser = await userHelpers.createUser(
        { gqlClient },
        {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          orgId: newOrg.id,
          rolesIds: roleIds
        }
      );
      expect(newUser.id).toBeDefined();
      testData.autoOrg.adminId = newUser.id;
      testData.autoOrg.adminName = newUser.name;

      // add OLP
      await setOLPPermissions({
        orgId: newOrg.id,
        orgGuid: newOrg.guid,
        userId: newUser.id
      });

      // login user
      const loginRes = await userHelpers.loginUser(
        { gqlClient },
        { userName: newUser.name, password }
      );
      expect(loginRes.token).toBeDefined();
      testData.autoOrg.adminOption = helpers.requestOptions(loginRes.token);

      const query = `
        query Me{
            me{
              organization{
                jsondata
              }
            }
        }`;

      const result = await gqlClient.query(
        query,
        {},
        testData.autoOrg.adminOption
      );

      // this feature is undefined in ai13s but the following code checks for "disabled" value
      automaticPackageCreation = _.get(
        result,
        'me.organization.jsondata.features.automaticPackageCreation'
      );

      const engineGrantFeatures = {
        features: {
          enableRBACFeature: 'enabled',
          useEngineGrant: 'enabled'
        }
      };

      // create org useEngineGrant = true
      const engineGrantOrg = await orgHelpers.orgSetup(
        citestMarker,
        { gqlClient },
        { ...testOrgInput, kvp: engineGrantFeatures },
        true
      );

      expect(engineGrantOrg.id).toBeDefined();
      testData.engineGrantOrg.orgId = engineGrantOrg.id;

      // create admin user
      const newEngineGrantUser = await userHelpers.createUser(
        { gqlClient },
        {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          orgId: engineGrantOrg.id,
          rolesIds: roleIds
        }
      );
      expect(newEngineGrantUser.id).toBeDefined();
      testData.engineGrantOrg.adminId = newEngineGrantUser.id;
      testData.engineGrantOrg.adminName = newEngineGrantUser.name;

      // add OLP
      await setOLPPermissions({
        orgId: engineGrantOrg.id,
        orgGuid: engineGrantOrg.guid,
        userId: newEngineGrantUser.id
      });

      // login user
      const engineGrantLoginRes = await userHelpers.loginUser(
        { gqlClient },
        { userName: newEngineGrantUser.name, password }
      );
      expect(engineGrantLoginRes.token).toBeDefined();
      testData.engineGrantOrg.adminOption = helpers.requestOptions(
        engineGrantLoginRes.token
      );
    });

    describe('flow package with out flow template', () => {
      it('create a flow', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.createFlowQuery,
          {
            name: citestMarker + '-' + uuid.v4()
          },
          testData.autoOrg.adminOption
        );
        testData.autoOrg.flowId = _.get(result, 'createFlow.id');
        expect(testData.autoOrg.flowId).toBeDefined();
      });

      it('create a flow revision', async () => {
        const runtime = JSON.stringify(
          '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
        );

        const result = await gqlClient.query(
          packageCommonQuery.createFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowId,
            runtime: JSON.parse(runtime)
          },
          testData.autoOrg.adminOption
        );
        testData.autoOrg.flowRevisionId = _.get(
          result,
          'createFlowRevision.flowRevisionId'
        );
        expect(testData.autoOrg.flowRevisionId).toBeDefined();
      });

      it('deploy flow revision - first time', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.deployFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowId,
            flowRevisionId: testData.autoOrg.flowRevisionId
          },
          testData.autoOrg.adminOption
        );
        const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
        testData.autoOrg.buildId = _.get(result, 'deployFlowRevision.buildId');
        expect(isDeployed).toEqual(true);
        expect(testData.autoOrg.buildId).toBeDefined();
      });

      it('Get auto flow package - first time', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.automatePackageQuery,
          { engineId: testData.autoOrg.flowId },
          testData.autoOrg.adminOption
        );
        const packageId = _.get(result, 'automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(packageId).toBeDefined();
        testData.autoOrg.packageId = packageId;
      });

      it('create a flow revision - second time', async () => {
        const runtime = JSON.stringify(
          '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
        );

        const result = await gqlClient.query(
          packageCommonQuery.createFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowId,
            runtime: JSON.parse(runtime)
          },
          testData.autoOrg.adminOption
        );
        testData.autoOrg.flowRevisionId = _.get(
          result,
          'createFlowRevision.flowRevisionId'
        );
        expect(testData.autoOrg.flowRevisionId).toBeDefined();
      });

      it('deploy flow revision - second time', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.deployFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowId,
            flowRevisionId: testData.autoOrg.flowRevisionId
          },
          testData.autoOrg.adminOption
        );
        const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
        testData.autoOrg.buildId = _.get(result, 'deployFlowRevision.buildId');
        expect(isDeployed).toEqual(true);
        expect(testData.autoOrg.buildId).toBeDefined();
      });

      it('Get auto flow package - second time', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.automatePackageQuery,
          { engineId: testData.autoOrg.flowId },
          testData.autoOrg.adminOption
        );
        const packageId = _.get(result, 'automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(packageId).toBeDefined();
        testData.autoOrg.packageId = packageId;
      });

      it('update flow status to inactive', async () => {
        // check status and pause
        const engineBuildRes = await gqlClient.query(
          `
        query engineBuild {
          engineBuild (id: "${testData.autoOrg.buildId}"){
            id
            status
          }
        }`,
          {},
          testData.autoOrg.adminOption
        );

        const engineBuild = _.get(engineBuildRes, 'engineBuild');
        expect(engineBuild.status).toBeDefined();
        if (engineBuild.status === 'paused') {
          return;
        }

        const result = await gqlClient.query(
          packageCommonQuery.updateBuildQuery,
          {
            buildId: testData.autoOrg.buildId,
            engineId: testData.autoOrg.flowId,
            action: 'pause'
          },
          testData.autoOrg.adminOption
        );
        const engineStatus = _.get(result, 'updateEngineBuild.status');
        expect(engineStatus).toEqual('paused');
      });

      it('update auto package', async () => {
        const newName = citestMarker + '-package-' + uuid.v4();
        const updatePackageRes = await gqlClient.query(
          packageCommonQuery.updatePackageQuery,
          { input: { id: testData.autoOrg.packageId, name: newName } },
          testData.autoOrg.adminOption
        );
        const packageUpdate = _.get(updatePackageRes, 'packageUpdate');
        expect(packageUpdate).toBeDefined();
        expect(packageUpdate.id).toEqual(testData.autoOrg.packageId);
        expect(packageUpdate.name).toEqual(newName);
      });

      itif(
        global.enablePackageGrantLogic,
        'cannot access flow revision by flow revision id in other org without grant',
        async () => {
          const query = `
          query getFlowRevision ($id: ID!) {
            flowRevision(id: $id){
              flowRevisionId
            }
          }`;

          let result, error;
          try {
            result = await gqlClient.query(
              query,
              {
                id: testData.autoOrg.flowRevisionId
              },
              testData.engineGrantOrg.adminOption
            );
          } catch (e) {
            error = e;
          }

          expect(result).toBeUndefined();
          expect(error).toBeDefined();
          // expect(error.message).toContain('authorization_error');
          expect(error.message).toContain(
            'Flow does not access via accessible package'
          );
        }
      );

      itif(
        global.enablePackageGrantLogic,
        'cannot access flow revisions by flow id in other org without grant',
        async () => {
          const query = `
          query getFlowRevisions ($flowId: ID!) {
            flowRevisions(flowId: $flowId){
              records {
                engineId
              }
            }
          }`;

          let result, error;
          try {
            result = await gqlClient.query(
              query,
              {
                flowId: testData.autoOrg.flowId
              },
              testData.engineGrantOrg.adminOption
            );
          } catch (e) {
            error = e;
          }
          expect(result).toBeUndefined();
          expect(error).toBeDefined();
          // expect(error.message).toContain('authorization_error');
          expect(error.message).toContain(
            'Flow does not access via accessible package'
          );
        }
      );

      itif(
        global.enablePackageGrantLogic,
        'cannot access flow revisions by engine id in other org without grant',
        async () => {
          const query = `
          query getFlowRevisions ($engineId: ID!) {
            flowRevisions(engineId: $engineId){
              records {
                engineId
              }
            }
          }`;

          let result, error;
          try {
            result = await gqlClient.query(
              query,
              {
                engineId: testData.autoOrg.flowId
              },
              testData.engineGrantOrg.adminOption
            );
          } catch (e) {
            error = e;
          }

          expect(result).toBeUndefined();
          expect(error).toBeDefined();
          // expect(error.message).toContain('authorization_error');
          expect(error.message).toContain(
            'Flow does not access via accessible package'
          );
        }
      );

      it('grant auto package', async () => {
        const grantRes = await gqlClient.query(
          packageCommonQuery.grantPackageQuery,
          {
            packageId: testData.autoOrg.packageId,
            packageGrants: [
              {
                organizationId: testData.engineGrantOrg.orgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          },
          testData.autoOrg.adminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('enable auto package', async () => {
        const grantRes = await gqlClient.query(
          packageCommonQuery.grantPackageQuery,
          {
            packageId: testData.autoOrg.packageId,
            packageGrants: [
              {
                organizationId: testData.engineGrantOrg.orgId,
                grantType: 'GRANT',
                action: 'ADD'
              }
            ]
          },
          testData.engineGrantOrg.adminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      itif(
        global.enablePackageGrantLogic,
        'can access granted flow revision by flow revision id',
        async () => {
          const query = `
          query getFlowRevision ($id: ID!) {
            flowRevision(id: $id){
              flowRevisionId
            }
          }`;

          const result = await gqlClient.query(
            query,
            {
              id: testData.autoOrg.flowRevisionId
            },
            testData.engineGrantOrg.adminOption
          );
          const flowRevision = _.get(result, 'flowRevision');
          expect(flowRevision).toBeDefined();
          expect(flowRevision.flowRevisionId).toEqual(
            testData.autoOrg.flowRevisionId
          );
        }
      );

      itif(
        global.enablePackageGrantLogic,
        'can access granted flow revisions by flow id',
        async () => {
          const query = `
          query getFlowRevisions ($flowId: ID!) {
            flowRevisions(flowId: $flowId){
              records {
                engineId
              }
            }
          }`;

          const result = await gqlClient.query(
            query,
            {
              flowId: testData.autoOrg.flowId
            },
            testData.engineGrantOrg.adminOption
          );
          const flowRevisions = _.get(result, 'flowRevisions.records');
          expect(flowRevisions).toBeDefined();
          expect(flowRevisions.length).toBe(3); // 2 created revisions + 1 head revision
          expect(
            flowRevisions.every(
              (revision) => revision.engineId === testData.autoOrg.flowId
            )
          ).toBe(true);
        }
      );

      itif(
        global.enablePackageGrantLogic,
        'can access granted flow revisions by engine id',
        async () => {
          const query = `
          query getFlowRevisions ($engineId: ID!) {
            flowRevisions(engineId: $engineId){
              records {
                engineId
              }
            }
          }`;

          const result = await gqlClient.query(
            query,
            {
              engineId: testData.autoOrg.flowId
            },
            testData.engineGrantOrg.adminOption
          );
          const flowRevisions = _.get(result, 'flowRevisions.records');
          expect(flowRevisions).toBeDefined();
          expect(flowRevisions.length).toBe(3); // 2 created revisions + 1 head revision
          expect(
            flowRevisions.every(
              (revision) => revision.engineId === testData.autoOrg.flowId
            )
          ).toBe(true);
        }
      );

      it('remove grant auto package', async () => {
        const grantRes = await gqlClient.query(
          packageCommonQuery.grantPackageQuery,
          {
            packageId: testData.autoOrg.packageId,
            packageGrants: [
              {
                organizationId: testData.engineGrantOrg.orgId,
                grantType: 'VIEW',
                action: 'REMOVE'
              }
            ]
          },
          testData.autoOrg.adminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete the flow', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.deleteEngineQuery,
          { id: testData.autoOrg.flowId }
        );
        expect(_.get(result, 'deleteEngine.id')).toEqual(
          testData.autoOrg.flowId
        );

        testData.autoOrg.flowId = null; // prevent afterAll delete
      });

      it('delete auto package', async () => {
        const deletePackageRes = await gqlClient.query(
          packageCommonQuery.deletePackageQuery,
          { id: testData.autoOrg.packageId },
          testData.autoOrg.adminOption
        );
        const deletePackage = _.get(deletePackageRes, 'packageDelete');
        expect(deletePackage.success).toEqual(true);
        testData.autoOrg.packageId = null; // prevent afterAll delete
      });
    });

    describe('flow package with flow template', () => {
      it('create a flow template', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.createFlowTemplateQuery,
          {
            title: `${citestMarker} - ${uuid.v4()}`,
            subtitle: `${citestMarker} test`,
            description: `${citestMarker} description flow`
          },
          testData.autoOrg.adminOption
        );
        testData.autoOrg.flowTemplateId = _.get(
          result,
          'createFlowTemplate.id'
        );
        expect(testData.autoOrg.flowTemplateId).toBeDefined();
      });

      it('update flow template', async () => {
        const newTitle = citestMarker + '-' + uuid.v4();
        const updateFlowTemplatQuery = `mutation updateTemp {
          updateFlowTemplate (input: {id: "${testData.autoOrg.flowTemplateId}", title: "${newTitle}"}){
            id
            title
            subtitle
          }
        }`;

        const updateTemplateRes = await gqlClient.query(
          updateFlowTemplatQuery,
          {},
          testData.autoOrg.adminOption
        );

        const updateTemplate = updateTemplateRes.updateFlowTemplate;
        expect(updateTemplate.title).toEqual(newTitle);
      });

      it('get flow template', async () => {
        const query = `query queryTemp {
            flowTemplates(id: "${testData.autoOrg.flowTemplateId}"){
              records {
                id
                title
              }
            }
          }`;
        const getTemplateRes = await gqlClient.query(
          query,
          {},
          testData.autoOrg.adminOption
        );

        const flowTemplate = _.get(getTemplateRes, 'flowTemplates.records[0]');
        expect(flowTemplate.id).toEqual(testData.autoOrg.flowTemplateId);
      });

      it('create a new flow from template', async () => {
        const createFlowRes = await gqlClient.query(
          packageCommonQuery.createFlowQuery,
          {
            name: citestMarker + '-' + uuid.v4(),
            templateId: testData.autoOrg.flowTemplateId
          },
          testData.autoOrg.adminOption
        );

        const createFlow = _.get(createFlowRes, 'createFlow');
        expect(createFlow).toBeDefined();
        testData.autoOrg.flowIdFromTemplate = createFlow.id;
      });

      it('create a flow revision', async () => {
        const runtime = JSON.stringify(
          '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
        );

        const result = await gqlClient.query(
          packageCommonQuery.createFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowIdFromTemplate,
            runtime: JSON.parse(runtime)
          },
          testData.autoOrg.adminOption
        );
        testData.autoOrg.flowRevisionIdFromTemplate = _.get(
          result,
          'createFlowRevision.flowRevisionId'
        );
        expect(testData.autoOrg.flowRevisionIdFromTemplate).toBeDefined();
      });

      it('fetches flow revision using flowRevisions query + id', async () => {
        const query = `
          query getFlowRevisions ($id: ID!) {
            flowRevisions(id: $id){
              records {
                flowRevisionId
              }
            }
          }`;

        const result = await gqlClient.query(
          query,
          {
            id: testData.autoOrg.flowRevisionIdFromTemplate
          },
          testData.autoOrg.adminOption
        );
        const flowRevisions = _.get(result, 'flowRevisions.records');
        expect(flowRevisions).toBeDefined();
        expect(flowRevisions.length).toBe(1);
        expect(flowRevisions[0].flowRevisionId).not.toEqual(null);
        expect(flowRevisions[0].flowRevisionId).toEqual(
          testData.autoOrg.flowRevisionIdFromTemplate
        );
      });

      it('deploy flow revision', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.deployFlowRevisionQuery,
          {
            flowId: testData.autoOrg.flowIdFromTemplate,
            flowRevisionId: testData.autoOrg.flowRevisionIdFromTemplate
          },
          testData.autoOrg.adminOption
        );
        const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
        testData.autoOrg.buildIdFromTemplate = _.get(
          result,
          'deployFlowRevision.buildId'
        );
        expect(isDeployed).toEqual(true);
        expect(testData.autoOrg.buildIdFromTemplate).toBeDefined();
      });

      it('Get auto flow package', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.automatePackageQuery,
          { engineId: testData.autoOrg.flowIdFromTemplate },
          testData.autoOrg.adminOption
        );
        const packageId = _.get(result, 'automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(
          testData.autoOrg.flowRevisionIdFromTemplate
        );
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(testData.autoOrg.flowRevisionIdFromTemplate);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(
          testData.autoOrg.flowRevisionIdFromTemplate
        );
        expect(packageId).toBeDefined();
        testData.autoOrg.packageIdFromTemplate = packageId;
      });

      it('update auto package', async () => {
        const newName = citestMarker + '-package-' + uuid.v4();
        const updatePackageRes = await gqlClient.query(
          packageCommonQuery.updatePackageQuery,
          {
            input: { id: testData.autoOrg.packageIdFromTemplate, name: newName }
          },
          testData.autoOrg.adminOption
        );
        const packageUpdate = _.get(updatePackageRes, 'packageUpdate');
        expect(packageUpdate).toBeDefined();
        expect(packageUpdate.id).toEqual(
          testData.autoOrg.packageIdFromTemplate
        );
        expect(packageUpdate.name).toEqual(newName);
      });

      it('grant auto package', async () => {
        const grantRes = await gqlClient.query(
          packageCommonQuery.grantPackageQuery,
          {
            packageId: testData.autoOrg.packageIdFromTemplate,
            packageGrants: [
              {
                organizationId: superAdmin.orgId,
                grantType: 'VIEW',
                action: 'ADD'
              }
            ]
          },
          testData.autoOrg.adminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove grant auto package', async () => {
        const grantRes = await gqlClient.query(
          packageCommonQuery.grantPackageQuery,
          {
            packageId: testData.autoOrg.packageIdFromTemplate,
            packageGrants: [
              {
                organizationId: superAdmin.orgId,
                grantType: 'VIEW',
                action: 'REMOVE'
              }
            ]
          },
          testData.autoOrg.adminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete the flow', async () => {
        const result = await gqlClient.query(
          packageCommonQuery.deleteEngineQuery,
          { id: testData.autoOrg.flowIdFromTemplate }
        );
        expect(_.get(result, 'deleteEngine.id')).toEqual(
          testData.autoOrg.flowIdFromTemplate
        );

        testData.autoOrg.flowIdFromTemplate = null; // cancel afterAll delete
      });

      xit('delete flow template', async () => {
        const query = `mutation{
            deleteFlowTemplate(id: "${testData.autoOrg.flowTemplateId}"){
              id
            }
          }`;
        const deleteFlowTemplateRes = await gqlClient.query(
          query,
          { id: testData.autoOrg.flowTemplateId },
          testData.autoOrg.adminOption
        );
        console.log(deleteFlowTemplateRes.deleteFlowTemplate);
        const deleteFlowTemplate = _.get(
          deleteFlowTemplateRes,
          'deleteFlowTemplate'
        );
        expect(deleteFlowTemplate.id).toEqual(testData.autoOrg.flowTemplateId);

        testData.autoOrg.flowTemplateId = null; // cancel afterAll delete
      });

      it('delete auto package', async () => {
        const deletePackageRes = await gqlClient.query(
          packageCommonQuery.deletePackageQuery,
          { id: testData.autoOrg.packageIdFromTemplate },
          testData.autoOrg.adminOption
        );
        const deletePackage = _.get(deletePackageRes, 'packageDelete');
        expect(deletePackage.success).toEqual(true);
        testData.autoOrg.packageIdFromTemplate = null; // prevent delete again at afterAll
      });
    });
  });

  (gqlClient.isEnableResourceTest() ? describe : describe.skip)(
    'Test behavior of auto package creation for flow revisions when using Hub token',
    () => {
      beforeAll(async () => {
        await gqlClient.connect();
        const query = `
            query Me{
                me{
                  organization{
                    jsondata
                  }
                }
            }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        // this feature is undefined in ai13s but the following code checks for "disabled" value
        automaticPackageCreation = _.get(
          result,
          'me.organization.jsondata.features.automaticPackageCreation'
        );
      });

      it('create a flow using Hub token', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }

        const query = `mutation createFlow {
        createFlow(
            input: {
            name: "${citestMarker}-graphql-ci-test-flow-package-${Date.now()}"
            description: "graphql-flow-description"
            }
        ) {
            id
            ownerOrganizationId
            isPublic
            name
            categoryId
            deploymentModel
        }
    }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        flowId = _.get(result, 'createFlow.id');
        expect(flowId).toBeDefined();
      });

      it('create a flow revision using Hub token', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const runtime = JSON.stringify(
          '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
        );
        const query = `
        mutation createFlowRevision {
          createFlowRevision(input:{
            flowId: "${flowId}",
            runtime: ${runtime},
            forceCreate: true,
            isHead: true
          }){
            flowRevisionId
          }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        flowRevisionId = _.get(result, 'createFlowRevision.flowRevisionId');
        expect(flowRevisionId).toBeDefined();
      });

      it('deploy flow revision with disableAutoPackageCreation set to false, using Hub token - first time', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        mutation deployFlowRevision {
            deployFlowRevision(input:{
            flowId: "${flowId}",
            flowRevisionId: "${flowRevisionId}",
            disableAutoPackageCreation: false
          }){
            flowRevisionId
            flowRevisionNumb
            isHead
            buildId
            engineId
            isDeployed
            hash
          }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
        buildId = _.get(result, 'deployFlowRevision.buildId');
        expect(isDeployed).toEqual(true);
        expect(buildId).toBeDefined();
      });

      it('Get flow package using Hub token - first time', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        query GetAutomatePackage{
            automatePackage(engineId: "${flowId}"){
              id
              name
              version
              sourceOriginId
              sourcePackageId
              primaryResource
              {
                resourceId
                resourceType
              }
              resources {
                records {
                  packageId
                  resourceAlias
                  resourceId
                  resourceType
                }
              }
              nestedResources {
                records {
                  packageId
                  resourceAlias
                  resourceId
                  resourceType
                }
              }
            }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        const packageId = _.get(result, 'automatePackage.id');
        hubPackageId = packageId;
        const primaryResourceId = _.get(
          result,
          'automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(flowRevisionId);
        expect(packageId).toBeDefined();
      });

      it('create a flow revision using Hub token - second time', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const runtime = JSON.stringify(
          '{\n  "flows": [\n    {\n      "id": "93e05a0f.305b58",\n      "info": "",\n      "type": "tab",\n      "label": "Flow 1",\n      "disabled": false\n    },\n    {\n      "x": 150,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "4874936a.4f6e0c",\n      "name": "",\n      "type": "aiware-in",\n      "wires": [\n        [\n          "1567359e.d1bb0a"\n        ]\n      ],\n      "_mtime": 0,\n      "format": "buffer",\n      "samples": [],\n      "tdoContent": "{}",\n      "waitForResults": false\n    },\n    {\n      "x": 410,\n      "y": 140,\n      "z": "93e05a0f.305b58",\n      "id": "1567359e.d1bb0a",\n      "name": "",\n      "type": "aiware-out",\n      "wires": [],\n      "failureMsg": "",\n      "statusCode": 200,\n      "disableDebug": false,\n      "failureReason": "",\n      "failureMsgType": "",\n      "excludeMetadata": false,\n      "failureReasonType": "",\n      "skipResultCallback": false\n    }\n  ],\n  "package": {\n    "dependencies": {}\n  },\n  "version": {\n    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",\n    "studio": "registry.central.aiware.com/node-red-v3:dev"\n  },\n  "credentials": {\n    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="\n  },\n  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"\n}'
        );
        const query = `
        mutation createFlowRevision {
          createFlowRevision(input:{
            flowId: "${flowId}",
            runtime: ${runtime},
            forceCreate: true,
            isHead: true
          }){
            flowRevisionId
          }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        flowRevisionIdWithoutPackage = _.get(
          result,
          'createFlowRevision.flowRevisionId'
        );
        expect(flowRevisionIdWithoutPackage).toBeDefined();
      });

      it('deploy flow revision with disableAutoPackageCreation set to true, using Hub token - second time', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        mutation deployFlowRevision {
            deployFlowRevision(input:{
            flowId: "${flowId}",
            flowRevisionId: "${flowRevisionIdWithoutPackage}",
            disableAutoPackageCreation: true
          }){
            flowRevisionId
            flowRevisionNumb
            isHead
            buildId
            engineId
            isDeployed
            hash
          }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        const isDeployed = _.get(result, 'deployFlowRevision.isDeployed');
        buildId = _.get(result, 'deployFlowRevision.buildId');
        expect(isDeployed).toEqual(true);
      });

      it('Get flow package using Hub token - second time - first package should not have been updated', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        query GetAutomatePackage{
            automatePackage(engineId: "${flowId}"){
              id
              name
              version
              sourceOriginId
              sourcePackageId
              primaryResource
              {
                resourceId
                resourceType
              }
              resources {
                records {
                  packageId
                  resourceAlias
                  resourceId
                  resourceType
                }
              }
              nestedResources {
                records {
                  packageId
                  resourceAlias
                  resourceId
                  resourceType
                }
              }
            }
        }`;

        const result = await gqlClient.queryByAIDataOrgToken(query);
        const packageId = _.get(result, 'automatePackage.id');
        hubPackageId = packageId;
        const primaryResourceId = _.get(
          result,
          'automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(flowRevisionId);
        expect(packageId).toBeDefined();
      });

      it('update flow status to inactive', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        mutation updateEngineBuild {
            updateEngineBuild(input:{
                id: "${buildId}"
                engineId: "${flowId}"
                action: pause
            }){
                status
            }
        }`;

        const result = await gqlClient.query(query);
        const engineStatus = _.get(result, 'updateEngineBuild.status');
        expect(engineStatus).toEqual('paused');
      });

      it('delete the flow', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const query = `
        mutation{
          deleteEngine(
            id:"${flowId}"
          ){
            id
          }
        }`;
        const result = await gqlClient.query(query);
        expect(_.get(result, 'deleteEngine.id')).toEqual(flowId);

        flowId = null; // cancel afterAll delete
      });
    }
  );

  afterAll(async () => {
    if (hubPackageId) {
      await safe('delete package hubPackageId', async () =>
        gqlClient.queryByAIDataOrgToken(`
          mutation {
            packageDelete(id: "${hubPackageId}") {
              success
            }
          }
        `)
      );
    }

    // fallback cleanup for packages
    if (testData.basicOrg.packageId) {
      await safe('delete package basicOrg.packageId', async () =>
        gqlClient.query(
          packageCommonQuery.deletePackageQuery,
          { id: testData.basicOrg.packageId },
          testData.basicOrg.adminOption
        )
      );
    }

    if (testData.autoOrg.packageId) {
      await safe('delete package autoOrg.packageId', async () =>
        gqlClient.query(
          packageCommonQuery.deletePackageQuery,
          { id: testData.autoOrg.packageId },
          testData.autoOrg.adminOption
        )
      );
    }

    if (testData.autoOrg.packageIdFromTemplate) {
      await safe('delete package autoOrg.packageIdFromTemplate', async () =>
        gqlClient.query(
          packageCommonQuery.deletePackageQuery,
          { id: testData.autoOrg.packageIdFromTemplate },
          testData.autoOrg.adminOption
        )
      );
    }

    // fallback cleanup for flows/templates
    if (testData.basicOrg.flowId) {
      await safe('delete flow basicOrg.flowId', async () =>
        gqlClient.query(packageCommonQuery.deleteEngineQuery, {
          id: testData.basicOrg.flowId
        })
      );
    }

    if (testData.autoOrg.flowId) {
      await safe('delete flow autoOrg.flowId', async () =>
        gqlClient.query(packageCommonQuery.deleteEngineQuery, {
          id: testData.autoOrg.flowId
        })
      );
    }

    if (testData.autoOrg.flowIdFromTemplate) {
      await safe('delete flow autoOrg.flowIdFromTemplate', async () =>
        gqlClient.query(packageCommonQuery.deleteEngineQuery, {
          id: testData.autoOrg.flowIdFromTemplate
        })
      );
    }

    if (flowId) {
      await safe('delete flow hubToken.flowId', async () =>
        gqlClient.query(packageCommonQuery.deleteEngineQuery, { id: flowId })
      );
    }

    if (testData.autoOrg.flowTemplateId) {
      await safe('delete flow template autoOrg.flowTemplateId', async () =>
        gqlClient.query(
          `mutation deleteFlowTemplate($id: ID!) {
          deleteFlowTemplate(id: $id) {
            id
          }
        }`,
          { id: testData.autoOrg.flowTemplateId },
          testData.autoOrg.adminOption
        )
      );
    }

    if (testData.engineGrantOrg.adminId) {
      await safe(`delete user engineGrantOrg.adminId`, async () =>
        userHelpers.deleteUser({ gqlClient }, testData.engineGrantOrg.adminId)
      );
    }

    // delete user
    if (testData?.autoOrg?.adminId) {
      await safe(`delete user autoOrg.adminId`, async () =>
        userHelpers.deleteUser({ gqlClient }, testData.autoOrg.adminId)
      );
    }
    if (testData.basicOrg.adminId) {
      await safe(`delete user basicOrg.adminId`, async () =>
        userHelpers.deleteUser({ gqlClient }, testData.basicOrg.adminId)
      );
    }

    // delete org
    if (testData.engineGrantOrg.orgId) {
      await safe(`delete org engineGrantOrg.orgId`, async () =>
        orgHelpers.deleteOrganization(
          { gqlClient },
          testData.engineGrantOrg.orgId
        )
      );
    }

    if (testData.autoOrg.orgId) {
      await safe(`delete org autoOrg.orgId`, async () =>
        orgHelpers.deleteOrganization({ gqlClient }, testData.autoOrg.orgId)
      );
    }
    if (testData.basicOrg.orgId) {
      await safe(`delete org basicOrg.orgId`, async () =>
        orgHelpers.deleteOrganization({ gqlClient }, testData.basicOrg.orgId)
      );
    }
  });
});

async function setOLPPermissions(orgInfo) {
  const olpObjectIds = {};

  const permissions = `
      DEVELOPER_ENGINE_CREATE
      DEVELOPER_ENGINE_READ
      DEVELOPER_ENGINE_UPDATE
      DEVELOPER_ENGINE_ENABLE
      DEVELOPER_ENGINE_DELETE
      DEVELOPER_BUILD_CREATE
      DEVELOPER_BUILD_READ
      DEVELOPER_BUILD_UPDATE`;

  let query = `
    mutation {
      authGroupCreate(input: {
        name: "${citestMarker}-auth-group-test-${uuid.v4()}"
        description: "desc"
        ownerOrganization: "${orgInfo.orgGuid}",
        members: [{
          id: "${orgInfo.userId}",
          memberType: User
        }]
      }) {
        id
        name
      }
    }
  `;

  let result = await gqlClient.query(query, null);
  expect(result.authGroupCreate.id).toBeDefined();
  testData.authGroupId = _.get(result, 'authGroupCreate.id');
  olpObjectIds.authGroupId = _.get(result, 'authGroupCreate.id');

  query = `mutation {
      authPermissionSetCreate(input: {
        name: "${citestMarker}-permission-${uuid.v4()}",
        description: "desc"
        organizationID: "${orgInfo.orgId}",
        permissions: [
          ${permissions}
        ]
      }){
        id
        permissions
      }
    }`;

  result = await gqlClient.query(query, null);
  expect(result.authPermissionSetCreate.id).toBeDefined();
  testData.authPermissionId = _.get(result, 'authPermissionSetCreate.id');
  olpObjectIds.permissionId = _.get(result, 'authPermissionSetCreate.id');

  query = `mutation  {
    addACEsToResources(
      ids:["${orgInfo.orgId}"],
      resourceType: Organization,
      ownerOrganization: "${orgInfo.orgGuid}",
      entries: [{
        member: {id: "${olpObjectIds.authGroupId}", memberType: Group},
        permissionSetID: "${olpObjectIds.permissionId}"}
      ]) {
      records {
        id
        objectType
        permissionSet {
          id
        }
        objectType
      }
    }
  }`;

  result = await gqlClient.query(query, null);
  expect(result.addACEsToResources.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.addACEsToResources.records;

  return olpObjectIds;
}
