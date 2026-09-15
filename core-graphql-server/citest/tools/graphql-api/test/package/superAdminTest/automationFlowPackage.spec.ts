import { helpers } from '../../../src/helpers/index';
import * as _ from 'lodash';
import * as uuid from 'uuid';

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  BuildUpdateAction,
  EngineDistributionType,
  OrganizationStatus,
  OrganizationType,
  PackageGrantAction,
  PackageGrantType,
  PackageResourceAction,
  PackageResourceType,
  PackageStatus,
  SchemaStatus
} from '../../../src/gql';
import { safe } from '../../../src/helpers/commonHelper';

const config = helpers.config;
let sdkClient: GraphqlClient;
const env = config.env;
let flowId: number,
  flowRevisionId: number,
  flowRevisionIdWithoutPackage: number,
  buildId: number,
  hubPackageId: string;
let automaticPackageCreation: any;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const itif = (condition: any, ...args: any[]) =>
  condition ? it(...args) : it.skip(...args);
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

const testOrgInput = {
  name: citestMarker + '-org-' + uuid.v4(),
  businessUnit: 'Legal',
  types: [OrganizationType.Agency, OrganizationType.Broadcaster],
  metadata: {
    features: {
      enableRBACFeature: 'enabled'
    }
  },
  applications: [
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
const flow =
  'W3siaWQiOiJlMTAxNGUzZi4zZWUzZSIsInR5cGUiOiJ0YWIiLCJsYWJlbCI6IkZsb3cgMSIsImRpc2FibGVkIjpmYWxzZSwiaW5mbyI6IiJ9LHsiaWQiOiI0MWU3NTk5Yy42MmQ3MTgiLCJ0eXBlIjoiYWl3YXJlLWluIiwieiI6ImUxMDE0ZTNmLjNlZTNlIiwibmFtZSI6IiIsImZvcm1hdCI6ImJ1ZmZlciIsInNhbXBsZXMiOltdLCJ0ZG9Db250ZW50Ijoie30iLCJfbXRpbWUiOjAsIngiOjE3MCwieSI6MTYwLCJ3aXJlcyI6W1siMTlmYTE2YmMuOTA2YTI5Il1dfSx7ImlkIjoiMTlmYTE2YmMuOTA2YTI5IiwidHlwZSI6ImFpd2FyZS1vdXQiLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwic3RhdHVzQ29kZSI6MjAwLCJmYWlsdXJlTXNnIjoiIiwiZmFpbHVyZU1zZ1R5cGUiOiJzdHIiLCJmYWlsdXJlUmVhc29uIjoiIiwiZmFpbHVyZVJlYXNvblR5cGUiOiJzdHIiLCJza2lwUmVzdWx0Q2FsbGJhY2siOmZhbHNlLCJkaXNhYmxlRGVidWciOmZhbHNlLCJleGNsdWRlTWV0YWRhdGEiOmZhbHNlLCJ4Ijo0NzAsInkiOjE2MCwid2lyZXMiOltdfSx7ImlkIjoiZWY5NGRkOWMuY2JjN2EiLCJ0eXBlIjoiaHR0cCBpbiIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJPS1RBIHZlcmlmaWNhdGlvbiBlbmRwb2ludCIsInVybCI6Ii9va3RhLXZlcmlmaWNhdGlvbiIsIm1ldGhvZCI6ImdldCIsInVwbG9hZCI6ZmFsc2UsInN3YWdnZXJEb2MiOiIiLCJ4IjoyMDAsInkiOjIyMCwid2lyZXMiOltbIjlhN2VhMDlkLjAxZTFhIl1dfSx7ImlkIjoiOWE3ZWEwOWQuMDFlMWEiLCJ0eXBlIjoiZnVuY3Rpb24iLCJ6IjoiZTEwMTRlM2YuM2VlM2UiLCJuYW1lIjoiIiwiZnVuYyI6ImNvbnN0IGhlYWRlcnMgPSBtc2cucmVxLmhlYWRlcnM7XG5jb25zdCB2ZXJpZmljYXRpb24gPSBoZWFkZXJzWyd4LW9rdGEtdmVyaWZpY2F0aW9uLWNoYWxsZW5nZSddO1xubXNnLnN0YXR1c0NvZGUgPSAyMDA7XG5tc2cucGF5bG9hZCA9IHtcbiAgICAndmVyaWZpY2F0aW9uJzogdmVyaWZpY2F0aW9uXG59O1xuXG5yZXR1cm4gbXNnOyIsIm91dHB1dHMiOjEsIm5vZXJyIjowLCJpbml0aWFsaXplIjoiIiwiZmluYWxpemUiOiIiLCJsaWJzIjpbXSwieCI6NDAwLCJ5IjoyMjAsIndpcmVzIjpbWyJmOGFmNThjYS5hOGNkMjgiXV19LHsiaWQiOiJmOGFmNThjYS5hOGNkMjgiLCJ0eXBlIjoiaHR0cCByZXNwb25zZSIsInoiOiJlMTAxNGUzZi4zZWUzZSIsIm5hbWUiOiJIdHRwIHJlc3BvbnNlIiwic3RhdHVzQ29kZSI6IiIsImhlYWRlcnMiOnt9LCJ4Ijo1ODAsInkiOjIyMCwid2lyZXMiOltdfV0=';
const password = 'testPassowrd';
const testData = {
  autoOrg: {
    orgId: '',
    orgGuid: '',
    adminId: '',
    adminName: '',
    adminOption: {},
    authGroupId: '',
    authPermissionId: '',
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
    orgGuid: '',
    adminId: '',
    adminName: '',
    adminOption: {},
    authGroupId: '',
    authPermissionId: ''
  },
  basicOrg: {
    orgId: '',
    orgGuid: '',
    adminId: '',
    adminName: '',
    adminOption: {},
    authGroupId: '',
    authPermissionId: '',
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
const isEnableResourceTest =
  config.apiInternalOrgLessToken && config.apiAIDataOrgToken;
describe('citest_package: flow package test', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    // T64: createGraphqlClient(SESSION_TOKEN) returns before the GQL server's Redis write
    // propagates. A second userLogin() call adds one async round-trip so the original
    // token is committed to Redis before sdk.me() runs. Calling createGraphqlClient twice
    // doesn't work — it caches the SDK and skips login on the second call, leaving
    // sessionToken undefined.
    await sdkClient.sdk.userLogin({
      input: { userName: config.userName, password: config.password }
    });
    expect(sdkClient.sessionToken).toBeDefined();
    superAdmin.token = sdkClient.sessionToken as string;
    superAdmin.option = helpers.requestOptions(superAdmin.token);

    const result = await sdkClient.sdk.me();
    expect(result.data.me).toBeDefined();
    superAdmin.orgId = _.get(result, 'data.me.organization.id', '');
  });

  describe('Flow package automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // create org automaticPackageCreation = false
      const features = {
        enableRBACFeature: 'enabled',
        automaticPackageCreation: 'disabled'
      };
      // create admin user
      const newOrgRes = await sdkClient.sdk.createOrganization({
        input: { ...testOrgInput, metadata: { features } }
      });

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg?.id).toBeDefined();
      testData.basicOrg.orgId = newOrg?.id as string;
      testData.basicOrg.orgGuid = newOrg?.guid ?? '';

      // create admin user
      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          organizationId: newOrg?.id || '',
          roleIds: roleIds
        }
      });

      const newUser = _.get(newUserRes, 'data.createUser');
      expect(newUser?.id).toBeDefined();
      testData.basicOrg.adminId = newUser?.id || '';
      testData.basicOrg.adminName = newUser?.name || '';

      // add OLP
      const basicOrgOLP = await setOLPPermissions({
        orgId: newOrg?.id || '',
        orgGuid: newOrg?.guid || '',
        userId: newUser?.id || ''
      });
      testData.basicOrg.authGroupId = basicOrgOLP.authGroupId;
      testData.basicOrg.authPermissionId = basicOrgOLP.permissionId;

      // login user
      const loginUserRes = await sdkClient.sdk.userLogin({
        input: {
          userName: newUser?.name || '',
          password: password
        }
      });

      const loginRes = _.get(loginUserRes, 'data.userLogin');
      expect(loginRes?.token).toBeDefined();
      testData.basicOrg.adminOption = helpers.requestOptions(
        loginRes?.token || ''
      );

      const result = await sdkClient.sdk.me(
        {},
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      // this feature is undefined in ai13s but the following code checks for "disabled" value
      automaticPackageCreation = _.get(
        result,
        'data.me.organization.jsondata.features.automaticPackageCreation'
      );
    });

    it('create a flow', async () => {
      const result = await sdkClient.sdk.createFlow(
        {
          input: {
            name: citestMarker + '-' + uuid.v4(),
            description: ''
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      testData.basicOrg.flowId = _.get(result, 'data.createFlow.id', '');
      expect(testData.basicOrg.flowId).toBeDefined();
    });

    it('create a flow revision', async () => {
      const runtime = JSON.stringify(
        '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
      );

      const result = await sdkClient.sdk.createFlowRevision(
        {
          input: {
            flowId: testData.basicOrg.flowId,
            runtime: JSON.parse(runtime),
            forceCreate: true,
            isHead: true
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      testData.basicOrg.flowRevisionId = _.get(
        result,
        'data.createFlowRevision.flowRevisionId',
        ''
      );
      expect(testData.basicOrg.flowRevisionId).toBeDefined();
    });

    it('deploy flow revision', async () => {
      const result = await sdkClient.sdk.deployFlowRevision(
        {
          input: {
            flowId: testData.basicOrg.flowId,
            flowRevisionId: testData.basicOrg.flowRevisionId
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const isDeployed = _.get(result, 'data.deployFlowRevision.isDeployed');
      testData.basicOrg.buildId = _.get(
        result,
        'data.deployFlowRevision.buildId',
        ''
      );
      expect(isDeployed).toEqual(true);
      expect(testData.basicOrg.buildId).toBeDefined();
    });

    it('Get auto flow package - should fail', async () => {
      const queryPackagePromis = sdkClient.sdk.automatePackage(
        { engineId: testData.basicOrg.flowId },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      await expect(queryPackagePromis).rejects.toThrow(/does not exist/);
    });

    it('Get flow package - should not exist', async () => {
      const result = await sdkClient.sdk.queryPackages({
        orgId: testData.basicOrg.orgId,
        resourceId: testData.basicOrg.flowRevisionId
      });

      const packageData = _.get(result, 'data.packages.records');
      expect(packageData?.length).toEqual(0);
    });

    it('Get flow revision by id through singular query (flowRevision) - should succeed', async () => {
      const result = await sdkClient.sdk.getFlowRevision(
        { id: testData.basicOrg.flowRevisionId },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const flowRevision = _.get(result, 'data.flowRevision');
      expect(flowRevision).toBeDefined();
      expect(flowRevision?.flowRevisionId).toEqual(
        testData.basicOrg.flowRevisionId
      );
    });

    it('Get flow revision by id through plural query (flowRevisions) - should succeed', async () => {
      const result = await sdkClient.sdk.getFlowRevisions(
        { id: testData.basicOrg.flowRevisionId },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const flowRevisions = _.get(result, 'data.flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions?.length).toBe(1);
      expect(_.get(flowRevisions, '[0].engineId')).toEqual(
        testData.basicOrg.flowId
      );
    });

    it('Get flow revision by flow id - should succeed', async () => {
      const result = await sdkClient.sdk.getFlowRevisions(
        { flowId: testData.basicOrg.flowId },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const flowRevisions = _.get(result, 'data.flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions?.length).toBe(2); // 1 created revision + 1 head revision
      expect(flowRevisions?.[0].engineId).toEqual(testData.basicOrg.flowId);
      expect(flowRevisions?.[1].engineId).toEqual(testData.basicOrg.flowId);
    });

    it('Get flow revision by engine id - should succeed', async () => {
      const result = await sdkClient.sdk.getFlowRevisions(
        { engineId: testData.basicOrg.flowId },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const flowRevisions = _.get(result, 'data.flowRevisions.records');
      expect(flowRevisions).toBeDefined();
      expect(flowRevisions?.length).toBe(2); // 1 created revisions + 1 head revision
      expect(flowRevisions?.[0].engineId).toEqual(testData.basicOrg.flowId);
      expect(flowRevisions?.[1].engineId).toEqual(testData.basicOrg.flowId);
    });

    it('create package for flow revision', async () => {
      const createPackageRes = await sdkClient.sdk.packageCreate(
        {
          input: {
            name: citestMarker + '-package-' + uuid.v4(),
            version: '1.0.0',
            distributionType: EngineDistributionType.Public,
            resources: [
              {
                resourceType: PackageResourceType.AutomateFlowRevision,
                resourceId: testData.basicOrg.flowRevisionId,
                action: PackageResourceAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const packageCreate = _.get(createPackageRes, 'data.packageCreate');
      expect(packageCreate).toBeDefined();
      testData.basicOrg.packageId = packageCreate?.id || '';
    });

    it('Get auto flow package - should fail', async () => {
      const promise = sdkClient.sdk.automatePackage({
        engineId: testData.basicOrg.flowId
      });

      await expect(promise).rejects.toThrow(/does not exist/);
    });

    it('Get flow package - should success', async () => {
      const result = await sdkClient.sdk.queryPackages(
        {
          id: testData.basicOrg.packageId
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const packageData = _.get(result, 'data.packages.records[0]');
      expect(packageData).toBeDefined();
      const packageId = _.get(packageData, 'id');
      const resourceId = _.get(packageData, 'resources.records[0].resourceId');
      expect(resourceId).toBeDefined();
      expect(resourceId).toEqual(testData.basicOrg.flowRevisionId);
      expect(packageId).toBeDefined();
    });

    it('update flow status to inactive', async () => {
      // check status and pause
      const engineBuildRes = await sdkClient.sdk.engineBuild(
        {
          id: testData.basicOrg.buildId
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const engineBuild = _.get(engineBuildRes, 'data.engineBuild');
      expect(engineBuild?.status).toBeDefined();
      if (engineBuild?.status === 'paused') {
        return;
      }

      const result = await sdkClient.sdk.updateEngineBuild(
        {
          input: {
            id: testData.basicOrg.buildId,
            engineId: testData.basicOrg.flowId,
            action: BuildUpdateAction.Pause
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const engineStatus = _.get(result, 'data.updateEngineBuild.status');
      expect(engineStatus).toEqual('paused');
    });

    it('update auto package', async () => {
      const newName = citestMarker + '-package-' + uuid.v4();
      const updatePackageRes = await sdkClient.sdk.packageUpdate(
        {
          input: {
            id: testData.basicOrg.packageId,
            name: newName
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const packageUpdate = _.get(updatePackageRes, 'data.packageUpdate');
      expect(packageUpdate).toBeDefined();
      expect(packageUpdate?.id).toEqual(testData.basicOrg.packageId);
      expect(packageUpdate?.name).toEqual(newName);
    });

    it('grant auto package', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.basicOrg.packageId,
            packageGrants: [
              {
                organizationId: superAdmin.orgId,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Add
              }
            ]
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('remove grant auto package', async () => {
      const grantRes = await sdkClient.sdk.packageUpdateGrants(
        {
          input: {
            packageId: testData.basicOrg.packageId,
            packageGrants: [
              {
                organizationId: superAdmin.orgId,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Remove
              }
            ]
          }
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const grantData = _.get(grantRes, 'data.packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('delete the flow', async () => {
      const result = await sdkClient.sdk.deleteEngine({
        id: testData.basicOrg.flowId
      });

      expect(_.get(result, 'data.deleteEngine.id')).toEqual(
        testData.basicOrg.flowId
      );
      testData.basicOrg.flowId = ''; // prevent afterAll delete
    });

    it('delete package', async () => {
      const deletePackageRes = await sdkClient.sdk.packageDelete(
        {
          id: testData.basicOrg.packageId
        },
        getRequestHeaders(testData.basicOrg.adminOption)
      );

      const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
      expect(deletePackage?.success).toEqual(true);
      testData.basicOrg.packageId = ''; // prevent afterAll delete
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
      const newOrgRes = await sdkClient.sdk.createOrganization({
        input: { ...testOrgInput, metadata: features }
      });

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg?.id).toBeDefined();
      testData.autoOrg.orgId = newOrg?.id || '';
      testData.autoOrg.orgGuid = newOrg?.guid ?? '';

      // create admin user
      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          organizationId: newOrg?.id || '',
          roleIds: roleIds
        }
      });

      const newUser = _.get(newUserRes, 'data.createUser');
      expect(newUser?.id).toBeDefined();
      testData.autoOrg.adminId = newUser?.id || '';
      testData.autoOrg.adminName = newUser?.name || '';

      // add OLP
      const autoOrgOLP = await setOLPPermissions({
        orgId: newOrg?.id || '',
        orgGuid: newOrg?.guid || '',
        userId: newUser?.id || ''
      });
      testData.autoOrg.authGroupId = autoOrgOLP.authGroupId;
      testData.autoOrg.authPermissionId = autoOrgOLP.permissionId;

      // login user
      const loginRes = await sdkClient.sdk.userLogin({
        input: {
          userName: newUser?.name || '',
          password: password
        }
      });

      const loginData = _.get(loginRes, 'data.userLogin');
      expect(loginData?.token).toBeDefined();
      testData.autoOrg.adminOption = helpers.requestOptions(
        loginData?.token || ''
      );

      const query = `
        query Me{
            me{
              id
              name
              organization{
                id
                jsondata
              }
            }
        }`;

      const result = await sdkClient.sdk.me(
        {},
        getRequestHeaders(testData.autoOrg.adminOption)
      );

      // this feature is undefined in ai13s but the following code checks for "disabled" value
      automaticPackageCreation = _.get(
        result,
        'data.me.organization.jsondata.features.automaticPackageCreation'
      );

      const engineGrantFeatures = {
        features: {
          enableRBACFeature: 'enabled',
          useEngineGrant: 'enabled'
        }
      };

      // create org useEngineGrant = true
      const engineGrantOrgRes = await sdkClient.sdk.createOrganization({
        input: { ...testOrgInput, metadata: engineGrantFeatures }
      });

      const engineGrantOrg = _.get(
        engineGrantOrgRes,
        'data.createOrganization'
      );
      expect(engineGrantOrg?.id).toBeDefined();
      testData.engineGrantOrg.orgId = engineGrantOrg?.id || '';
      testData.engineGrantOrg.orgGuid = engineGrantOrg?.guid ?? '';

      // create admin user
      const newEngineGrantUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          password: password,
          organizationId: engineGrantOrg?.id || '',
          roleIds: roleIds
        }
      });

      const newEngineGrantUser = _.get(
        newEngineGrantUserRes,
        'data.createUser'
      );
      expect(newEngineGrantUser?.id).toBeDefined();
      testData.engineGrantOrg.adminId = newEngineGrantUser?.id || '';
      testData.engineGrantOrg.adminName = newEngineGrantUser?.name || '';

      // add OLP
      const engineGrantOrgOLP = await setOLPPermissions({
        orgId: engineGrantOrg?.id || '',
        orgGuid: engineGrantOrg?.guid || '',
        userId: newEngineGrantUser?.id || ''
      });
      testData.engineGrantOrg.authGroupId = engineGrantOrgOLP.authGroupId;
      testData.engineGrantOrg.authPermissionId = engineGrantOrgOLP.permissionId;

      // login user
      const engineGrantLoginRes = await sdkClient.sdk.userLogin({
        input: {
          userName: newEngineGrantUser?.name || '',
          password: password
        }
      });

      const engineGrantLoginData = _.get(engineGrantLoginRes, 'data.userLogin');
      expect(engineGrantLoginData?.token).toBeDefined();
      testData.engineGrantOrg.adminOption = helpers.requestOptions(
        engineGrantLoginData?.token || ''
      );
    });

    describe('flow package with out flow template', () => {
      it('create a flow', async () => {
        const result = await sdkClient.sdk.createFlow(
          {
            input: {
              name: citestMarker + '-' + uuid.v4(),
              description: 'graphql-flow-description'
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        testData.autoOrg.flowId = _.get(result, 'data.createFlow.id', '');
        expect(testData.autoOrg.flowId).toBeDefined();
      });

      it('create a flow revision', async () => {
        const runtime = JSON.stringify(
          '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
        );

        const result = await sdkClient.sdk.createFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowId,
              runtime: JSON.parse(runtime),
              forceCreate: true,
              isHead: true
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        testData.autoOrg.flowRevisionId = _.get(
          result,
          'data.createFlowRevision.flowRevisionId',
          ''
        );
        expect(testData.autoOrg.flowRevisionId).toBeDefined();
      });

      it('deploy flow revision - first time', async () => {
        const result = await sdkClient.sdk.deployFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowId,
              flowRevisionId: testData.autoOrg.flowRevisionId
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const isDeployed = _.get(result, 'data.deployFlowRevision.isDeployed');
        testData.autoOrg.buildId = _.get(
          result,
          'data.deployFlowRevision.buildId',
          ''
        );
        expect(isDeployed).toEqual(true);
        expect(testData.autoOrg.buildId).toBeDefined();
      });

      it('Get auto flow package - first time', async () => {
        const result = await sdkClient.sdk.automatePackage(
          {
            engineId: testData.autoOrg.flowId
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const packageId = _.get(result, 'data.automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'data.automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'data.automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'data.automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(packageId).toBeDefined();
        testData.autoOrg.packageId = packageId || '';
      });

      it('create a flow revision - second time', async () => {
        const runtime = JSON.stringify(
          '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
        );

        const result = await sdkClient.sdk.createFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowId,
              runtime: JSON.parse(runtime),
              forceCreate: true,
              isHead: true
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        testData.autoOrg.flowRevisionId = _.get(
          result,
          'data.createFlowRevision.flowRevisionId',
          ''
        );
        expect(testData.autoOrg.flowRevisionId).toBeDefined();
      });

      it('deploy flow revision - second time', async () => {
        const result = await sdkClient.sdk.deployFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowId,
              flowRevisionId: testData.autoOrg.flowRevisionId
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const isDeployed = _.get(result, 'data.deployFlowRevision.isDeployed');
        buildId = _.get(result, 'data.deployFlowRevision.buildId');
        expect(isDeployed).toEqual(true);
      });

      it('Get auto flow package - second time', async () => {
        const result = await sdkClient.sdk.automatePackage(
          {
            engineId: testData.autoOrg.flowId
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const packageId = _.get(result, 'data.automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'data.automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'data.automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'data.automatePackage.nestedResources.records[0].resourceId'
        );
        expect(primaryResourceId).toBeDefined();
        expect(primaryResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(testData.autoOrg.flowRevisionId);
        expect(packageId).toBeDefined();
        testData.autoOrg.packageId = packageId || '';
      });

      it('update flow status to inactive', async () => {
        // check status and pause
        const engineBuildRes = await sdkClient.sdk.engineBuild(
          {
            id: testData.autoOrg.buildId
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const engineBuild = _.get(engineBuildRes, 'data.engineBuild');
        expect(engineBuild?.status).toBeDefined();
        if (engineBuild?.status === 'paused') {
          return;
        }

        const result = await sdkClient.sdk.updateEngineBuild(
          {
            input: {
              id: testData.autoOrg.buildId,
              engineId: testData.autoOrg.flowId,
              action: BuildUpdateAction.Pause
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const engineStatus = _.get(result, 'data.updateEngineBuild.status');
        expect(engineStatus).toEqual('paused');
      });

      it('update auto package', async () => {
        const newName = citestMarker + '-package-' + uuid.v4();
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.autoOrg.packageId,
              name: newName
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const packageUpdate = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageUpdate).toBeDefined();
        expect(packageUpdate?.id).toEqual(testData.autoOrg.packageId);
        expect(packageUpdate?.name).toEqual(newName);
      });

      itif(
        (global as any).enablePackageGrantLogic,
        'cannot access flow revision by flow revision id in other org without grant',
        async () => {
          const query = `
          query getFlowRevision ($id: ID!) {
            flowRevision(id: $id){
              flowRevisionId
            }
          }`;

          let result, error: any;
          try {
            result = await sdkClient.sdk.getFlowRevision(
              { id: testData.autoOrg.flowRevisionId },
              getRequestHeaders(testData.engineGrantOrg.adminOption)
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
        (global as any).enablePackageGrantLogic,
        'cannot access flow revisions by flow id in other org without grant',
        async () => {
          let result, error: any;
          try {
            result = await sdkClient.sdk.getFlowRevisions(
              { flowId: testData.autoOrg.flowId },
              getRequestHeaders(testData.engineGrantOrg.adminOption)
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
        (global as any).enablePackageGrantLogic,
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

          let result, error: any;
          try {
            result = await sdkClient.sdk.getFlowRevisions(
              {
                engineId: testData.autoOrg.flowId
              },
              getRequestHeaders(testData.engineGrantOrg.adminOption)
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
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.autoOrg.packageId,
              packageGrants: [
                {
                  organizationId: testData.engineGrantOrg.orgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('enable auto package', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.autoOrg.packageId,
              packageGrants: [
                {
                  organizationId: testData.engineGrantOrg.orgId,
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.engineGrantOrg.adminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      itif(
        (global as any).enablePackageGrantLogic,
        'can access granted flow revision by flow revision id',
        async () => {
          const query = `
          query getFlowRevision ($id: ID!) {
            flowRevision(id: $id){
              flowRevisionId
            }
          }`;

          const result = await sdkClient.sdk.getFlowRevision(
            {
              id: testData.autoOrg.flowRevisionId
            },
            getRequestHeaders(testData.engineGrantOrg.adminOption)
          );

          const flowRevision = _.get(result, 'data.flowRevision');
          expect(flowRevision).toBeDefined();
          expect(flowRevision?.flowRevisionId).toEqual(
            testData.autoOrg.flowRevisionId
          );
        }
      );

      itif(
        (global as any).enablePackageGrantLogic,
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

          const result = await sdkClient.sdk.getFlowRevisions(
            {
              flowId: testData.autoOrg.flowId
            },
            getRequestHeaders(testData.engineGrantOrg.adminOption)
          );

          const flowRevisions = _.get(result, 'data.flowRevisions.records');
          expect(flowRevisions).toBeDefined();
          expect(flowRevisions?.length).toBe(3); // 2 created revisions + 1 head revision
          expect(flowRevisions?.[0].engineId).toEqual(testData.autoOrg.flowId);
          expect(flowRevisions?.[1].engineId).toEqual(testData.autoOrg.flowId);
        }
      );

      itif(
        (global as any).enablePackageGrantLogic,
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

          const result = await sdkClient.sdk.getFlowRevisions(
            {
              engineId: testData.autoOrg.flowId
            },
            getRequestHeaders(testData.engineGrantOrg.adminOption)
          );

          const flowRevisions = _.get(result, 'data.flowRevisions.records');
          expect(flowRevisions).toBeDefined();
          expect(flowRevisions?.length).toBe(3); // 2 created revisions + 1 head revision
          expect(flowRevisions?.[0].engineId).toEqual(testData.autoOrg.flowId);
          expect(flowRevisions?.[1].engineId).toEqual(testData.autoOrg.flowId);
        }
      );

      it('remove grant auto package', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.autoOrg.packageId,
              packageGrants: [
                {
                  organizationId: testData.engineGrantOrg.orgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete the flow', async () => {
        const result = await sdkClient.sdk.deleteEngine({
          id: testData.autoOrg.flowId
        });

        expect(_.get(result, 'data.deleteEngine.id')).toEqual(
          testData.autoOrg.flowId
        );
        testData.autoOrg.flowId = ''; // prevent afterAll delete
      });

      it('delete auto package', async () => {
        const deletePackageRes = await sdkClient.sdk.packageDelete(
          {
            id: testData.autoOrg.packageId
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
        expect(deletePackage?.success).toEqual(true);
        testData.autoOrg.packageId = ''; // prevent afterAll delete
      });
    });

    describe('flow package with flow template', () => {
      it('create a flow template', async () => {
        const result = await sdkClient.sdk.createFlowTemplate(
          {
            input: {
              title: `${citestMarker} - ${uuid.v4()}`,
              subtitle: `${citestMarker} test`,
              description: `${citestMarker} description flow`,
              flow,
              categories: ['test'],
              public: false,
              author: 'veritone'
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        testData.autoOrg.flowTemplateId = _.get(
          result,
          'data.createFlowTemplate.id',
          ''
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

        const updateTemplateRes = await sdkClient.sdk.updateFlowTemplate(
          { input: { id: testData.autoOrg.flowTemplateId, title: newTitle } },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const updateTemplate = _.get(
          updateTemplateRes,
          'data.updateFlowTemplate'
        );
        expect(updateTemplate?.title).toEqual(newTitle);
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
        const getTemplateRes = await sdkClient.sdk.flowTemplates(
          {
            id: testData.autoOrg.flowTemplateId
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const flowTemplate = _.get(
          getTemplateRes,
          'data.flowTemplates.records[0]'
        );
        expect(flowTemplate?.id).toEqual(testData.autoOrg.flowTemplateId);
      });

      it('create a new flow from template', async () => {
        const createFlowRes = await sdkClient.sdk.createFlow(
          {
            input: {
              name: citestMarker + '-' + uuid.v4(),
              templateId: testData.autoOrg.flowTemplateId
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const createFlow = _.get(createFlowRes, 'data.createFlow');
        expect(createFlow).toBeDefined();
        testData.autoOrg.flowIdFromTemplate = createFlow?.id || '';
      });

      it('create a flow revision', async () => {
        const runtime = JSON.stringify(
          '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
        );

        const result = await sdkClient.sdk.createFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowIdFromTemplate,
              runtime: JSON.parse(runtime),
              forceCreate: true,
              isHead: true
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        testData.autoOrg.flowRevisionIdFromTemplate = _.get(
          result,
          'data.createFlowRevision.flowRevisionId',
          ''
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

        const result = await sdkClient.sdk.getFlowRevisions(
          {
            id: testData.autoOrg.flowRevisionIdFromTemplate
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const flowRevisions = _.get(result, 'data.flowRevisions.records');
        expect(flowRevisions).toBeDefined();
        expect(flowRevisions?.length).toBe(1);
        expect(flowRevisions?.[0].flowRevisionId).not.toEqual(null);
        expect(flowRevisions?.[0].flowRevisionId).toEqual(
          testData.autoOrg.flowRevisionIdFromTemplate
        );
      });

      it('deploy flow revision', async () => {
        const result = await sdkClient.sdk.deployFlowRevision(
          {
            input: {
              flowId: testData.autoOrg.flowIdFromTemplate,
              flowRevisionId: testData.autoOrg.flowRevisionIdFromTemplate
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const isDeployed = _.get(result, 'data.deployFlowRevision.isDeployed');
        testData.autoOrg.buildIdFromTemplate = _.get(
          result,
          'data.deployFlowRevision.buildId',
          ''
        );
        expect(isDeployed).toEqual(true);
        expect(testData.autoOrg.buildIdFromTemplate).toBeDefined();
      });

      it('Get auto flow package', async () => {
        const result = await sdkClient.sdk.automatePackage(
          {
            engineId: testData.autoOrg.flowIdFromTemplate
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const packageId = _.get(result, 'data.automatePackage.id');
        const primaryResourceId = _.get(
          result,
          'data.automatePackage.primaryResource.resourceId'
        );
        const resourceId = _.get(
          result,
          'data.automatePackage.resources.records[0].resourceId'
        );
        const nestedResourceId = _.get(
          result,
          'data.automatePackage.nestedResources.records[0].resourceId'
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
        testData.autoOrg.packageIdFromTemplate = packageId || '';
      });

      it('update auto package', async () => {
        const newName = citestMarker + '-package-' + uuid.v4();
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.autoOrg.packageIdFromTemplate,
              name: newName
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const packageUpdate = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageUpdate).toBeDefined();
        expect(packageUpdate?.id).toEqual(
          testData.autoOrg.packageIdFromTemplate
        );
        expect(packageUpdate?.name).toEqual(newName);
      });

      it('grant auto package', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.autoOrg.packageIdFromTemplate,
              packageGrants: [
                {
                  organizationId: superAdmin.orgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove grant auto package', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.autoOrg.packageIdFromTemplate,
              packageGrants: [
                {
                  organizationId: superAdmin.orgId,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete the flow', async () => {
        const result = await sdkClient.sdk.deleteEngine({
          id: testData.autoOrg.flowIdFromTemplate
        });

        expect(_.get(result, 'data.deleteEngine.id')).toEqual(
          testData.autoOrg.flowIdFromTemplate
        );
        testData.autoOrg.flowIdFromTemplate = ''; // prevent afterAll delete
      });

      xit('delete flow template', async () => {
        const query = `mutation{
            deleteFlowTemplate(id: "${testData.autoOrg.flowTemplateId}"){
              id
            }
          }`;
        const deleteFlowTemplateRes = await sdkClient.sdk.deleteFlowTemplate(
          { id: testData.autoOrg.flowTemplateId },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const deleteFlowTemplate = _.get(
          deleteFlowTemplateRes,
          'data.deleteFlowTemplate'
        );
        expect(deleteFlowTemplate?.id).toEqual(testData.autoOrg.flowTemplateId);
      });

      it('delete auto package', async () => {
        const deletePackageRes = await sdkClient.sdk.packageDelete(
          {
            id: testData.autoOrg.packageIdFromTemplate
          },
          getRequestHeaders(testData.autoOrg.adminOption)
        );

        const deletePackage = _.get(deletePackageRes, 'data.packageDelete');
        expect(deletePackage?.success).toEqual(true);
        testData.autoOrg.packageIdFromTemplate = ''; // prevent afterAll delete
      });
    });
  });

  (isEnableResourceTest ? describe : describe.skip)(
    'Test behavior of auto package creation for flow revisions when using Hub token',
    () => {
      let AIDataOrgToken: string;
      beforeAll(async () => {
        AIDataOrgToken = config.apiAIDataOrgToken;
        expect(AIDataOrgToken).toBeDefined();
        const query = `
            query Me{
                me{
                  organization{
                    jsondata
                  }
                }
            }`;

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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
          '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
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
        expect(primaryResourceId).toEqual(flowRevisionId);
        expect(resourceId).toBeDefined();
        expect(resourceId).toEqual(flowRevisionId);
        expect(nestedResourceId).toBeDefined();
        expect(nestedResourceId).toEqual(flowRevisionId);
        expect(packageId).toBeDefined();
        hubPackageId = packageId;
      });

      it('create a flow revision using Hub token - second time', async () => {
        if (
          !automaticPackageCreation ||
          automaticPackageCreation === 'disabled'
        ) {
          return;
        }
        const runtime = JSON.stringify(
          '{  "flows": [    {      "id": "93e05a0f.305b58",      "info": "",      "type": "tab",      "label": "Flow 1",      "disabled": false    },    {      "x": 150,      "y": 140,      "z": "93e05a0f.305b58",      "id": "4874936a.4f6e0c",      "name": "",      "type": "aiware-in",      "wires": [        [          "1567359e.d1bb0a"        ]      ],      "_mtime": 0,      "format": "buffer",      "samples": [],      "tdoContent": "{}",      "waitForResults": false    },    {      "x": 410,      "y": 140,      "z": "93e05a0f.305b58",      "id": "1567359e.d1bb0a",      "name": "",      "type": "aiware-out",      "wires": [],      "failureMsg": "",      "statusCode": 200,      "disableDebug": false,      "failureReason": "",      "failureMsgType": "",      "excludeMetadata": false,      "failureReasonType": "",      "skipResultCallback": false    }  ],  "package": {    "dependencies": {}  },  "version": {    "runner": "registry.central.aiware.com/node-red-runner-v3:dev",    "studio": "registry.central.aiware.com/node-red-v3:dev"  },  "credentials": {    "$": "22d8e33b5d7d3b220fe9dc5679a39560IkQ="  },  "credentialSecret": "3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0"}'
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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
            flowRevisionId: "${flowRevisionId}",
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
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

        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
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
        const result = await sdkClient.query(
          query,
          {},
          { Authorization: `Bearer ${AIDataOrgToken}` }
        );
        expect(_.get(result, 'deleteEngine.id')).toEqual(flowId);
      });
    }
  );

  afterAll(async () => {
    // fallback cleanup for hub-token created package/flow
    if (hubPackageId) {
      await safe('delete package hubPackageId', () =>
        sdkClient.sdk.packageDelete({ id: hubPackageId })
      );
    }
    if (flowId) {
      await safe('delete flow hubToken.flowId', () =>
        sdkClient.sdk.deleteEngine({ id: String(flowId) })
      );
    }

    // fallback cleanup for packages
    if (testData.basicOrg.packageId) {
      await safe('delete package basicOrg.packageId', () =>
        sdkClient.sdk.packageDelete(
          { id: testData.basicOrg.packageId },
          getRequestHeaders(testData.basicOrg.adminOption)
        )
      );
    }
    if (testData.autoOrg.packageId) {
      await safe('delete package autoOrg.packageId', () =>
        sdkClient.sdk.packageDelete(
          { id: testData.autoOrg.packageId },
          getRequestHeaders(testData.autoOrg.adminOption)
        )
      );
    }
    if (testData.autoOrg.packageIdFromTemplate) {
      await safe('delete package autoOrg.packageIdFromTemplate', () =>
        sdkClient.sdk.packageDelete(
          { id: testData.autoOrg.packageIdFromTemplate },
          getRequestHeaders(testData.autoOrg.adminOption)
        )
      );
    }

    // fallback cleanup for flows/templates
    if (testData.basicOrg.flowId) {
      await safe('delete flow basicOrg.flowId', () =>
        sdkClient.sdk.deleteEngine({ id: testData.basicOrg.flowId })
      );
    }
    if (testData.autoOrg.flowId) {
      await safe('delete flow autoOrg.flowId', () =>
        sdkClient.sdk.deleteEngine({ id: testData.autoOrg.flowId })
      );
    }
    if (testData.autoOrg.flowIdFromTemplate) {
      await safe('delete flow autoOrg.flowIdFromTemplate', () =>
        sdkClient.sdk.deleteEngine({ id: testData.autoOrg.flowIdFromTemplate })
      );
    }
    if (testData.autoOrg.flowTemplateId) {
      await safe('delete flow template autoOrg.flowTemplateId', () =>
        sdkClient.sdk.deleteFlowTemplate(
          { id: testData.autoOrg.flowTemplateId },
          getRequestHeaders(testData.autoOrg.adminOption)
        )
      );
    }

    // delete OLP data (auth group + permission set) for each org
    for (const org of [
      testData.basicOrg,
      testData.autoOrg,
      testData.engineGrantOrg
    ]) {
      if (org.authGroupId) {
        await safe(`delete authGroup ${org.authGroupId}`, () =>
          sdkClient.sdk.authGroupDelete({
            id: org.authGroupId,
            ownerOrganization: org.orgGuid
          })
        );
      }
      if (org.authPermissionId) {
        await safe(`delete authPermissionSet ${org.authPermissionId}`, () =>
          sdkClient.sdk.authPermissionSetDelete({
            id: org.authPermissionId,
            ownerOrganization: org.orgGuid
          })
        );
      }
    }

    // delete user
    if (testData.engineGrantOrg.adminId) {
      await safe('delete user engineGrantOrg.adminId', () =>
        sdkClient.sdk.deleteUser({ id: testData.engineGrantOrg.adminId })
      );
    }
    if (testData.autoOrg.adminId) {
      await safe('delete user autoOrg.adminId', () =>
        sdkClient.sdk.deleteUser({ id: testData.autoOrg.adminId })
      );
    }
    if (testData.basicOrg.adminId) {
      await safe('delete user basicOrg.adminId', () =>
        sdkClient.sdk.deleteUser({ id: testData.basicOrg.adminId })
      );
    }

    // delete org
    if (testData.engineGrantOrg.orgId) {
      await safe('delete org engineGrantOrg.orgId', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: testData.engineGrantOrg.orgId,
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
    if (testData.autoOrg.orgId) {
      await safe('delete org autoOrg.orgId', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: testData.autoOrg.orgId,
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
    if (testData.basicOrg.orgId) {
      await safe('delete org basicOrg.orgId', () =>
        sdkClient.sdk.updateOrganization({
          input: {
            id: testData.basicOrg.orgId,
            status: OrganizationStatus.Deleted
          }
        })
      );
    }
  });
});

async function setOLPPermissions(orgInfo: {
  orgId: string;
  orgGuid: string;
  userId: string;
}) {
  const olpObjectIds: {
    authGroupId: string;
    permissionId: string;
    aceOrgRecords?: any[];
  } = { authGroupId: '', permissionId: '' };

  const permissions = [
    AuthPermissionType.DeveloperEngineCreate,
    AuthPermissionType.DeveloperEngineRead,
    AuthPermissionType.DeveloperEngineUpdate,
    AuthPermissionType.DeveloperEngineEnable,
    AuthPermissionType.DeveloperEngineDelete,
    AuthPermissionType.DeveloperBuildCreate,
    AuthPermissionType.DeveloperBuildRead,
    AuthPermissionType.DeveloperBuildUpdate
  ];

  let result: any = await sdkClient.sdk.CreateAuthGroup({
    input: {
      name: `${citestMarker}-auth-group-test-${uuid.v4()}`,
      description: 'desc',
      ownerOrganization: orgInfo.orgGuid,
      members: [
        {
          id: orgInfo.userId,
          memberType: AuthGroupMemberType.User
        }
      ]
    }
  });
  expect(result.data.authGroupCreate.id).toBeDefined();
  olpObjectIds.authGroupId = _.get(result, 'data.authGroupCreate.id', '');

  result = await sdkClient.sdk.authPermissionSetCreate({
    input: {
      name: `${citestMarker}-permission-${uuid.v4()}`,
      description: 'desc',
      organizationID: orgInfo.orgId,
      permissions: permissions
    }
  });
  expect(result.data?.authPermissionSetCreate.id).toBeDefined();
  olpObjectIds.permissionId = _.get(
    result,
    'data.authPermissionSetCreate.id',
    ''
  );

  result = await sdkClient.sdk.addACEsToResources({
    ids: [orgInfo.orgId],
    resourceType: AuthResourceType.Organization,
    ownerOrganization: orgInfo.orgGuid,
    entries: [
      {
        member: {
          id: olpObjectIds.authGroupId,
          memberType: AuthGroupMemberType.Group
        },
        permissionSetID: olpObjectIds.permissionId
      }
    ]
  });
  expect(result.data.addACEsToResources.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.data.addACEsToResources.records;

  return olpObjectIds;
}
