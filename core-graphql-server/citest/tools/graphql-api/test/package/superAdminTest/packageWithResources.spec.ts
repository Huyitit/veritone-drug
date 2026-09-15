import * as _ from 'lodash';
import * as uuid from 'uuid';
import moment from 'moment';
import chakram from 'chakram';
import { helpers } from '../../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import {
  ApplicationConfigLevelEnum,
  ApplicationConfigValueEnum,
  ApplicationWorkflowAction,
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  BuildUpdateAction,
  ClusterStatus,
  ClusterType,
  DeploymentModel,
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

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);
const config = helpers.config;
const env = config.env;

let sdkClient: GraphqlClient;

const options = {
  adminOption: {},
  adminToken: '',
  orgAdminOption: {},
  orgAdminId: ''
};

const testOrgInput: any = {
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

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

const resourcesList: any = {
  regId: '',
  clusterId: '',
  sourceId: '',
  publicSchemaId: '',
  flowId: '',
  folderParentId: '',
  dataSchemaId: '',
  // package
  package: {
    packageId1: '',
    packageId2: ''
  },
  packagesToDelete: [] as string[],
  schemasToDelete: [] as string[],

  // resources id
  resources: [],
  appId: '',
  engineId: '',
  schemaId: '',
  packageId: '',
  engineBuildId: '',
  appViewId: '',
  dataSetId: '',
  autoNodeId: '',
  autoPaletteId: '',
  autoFlowRevisionId: '',
  // folderId: '',
  tdoId: '',
  // scheduledJobId: ''
  authGroupId: '',
  authPermissionId: ''
};
const testPass = 'testUserPassword';
const folderOrderIndex = 0;
const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
const createAutoNodeQuery = `
    mutation createTDOwithAsset {
      createTDOWithAsset(input:{
        startDateTime:${moment().subtract(2, 'hour').unix()},
        contentType: "application/gzip"
        assetType: "automateNode"
        name: "${citestMarker + '-automateNode-' + uuid.v4()}"
        addToIndex: true
        isPublic: true
        uri: "./citest/data/AutomateNode-1.1.1.gz"
        details: {
          tags: [
            {
              value: "automateNode"
            }
          ],
          addToIndex: true,
          automateNode: {
              module: "AutomateNode",
              type: "AutomateType",
              version: "1.1.1",
              author: "citest",
              desc: "desc",
              keywords: "test"
          }
        }
      }){
        id
      }
    }`;
const orgMarker = (global as any).orgMarker.package;
let orgResult: any;

describe('citest_package : package resources', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    options.adminToken = sdkClient.sessionToken!;
    options.adminOption = helpers.requestOptions(options.adminToken);
  });
  describe('automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // Set up test organization
      const createOrgRes = await sdkClient.sdk.createOrganization({
        input: testOrgInput
      });

      orgResult = _.get(createOrgRes, 'data.createOrganization');
      expect(orgResult).toBeDefined();
      expect(orgResult.id).toBeDefined();

      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          organizationId: orgResult.id,
          roleIds: roleIds,
          password: testPass
        }
      });

      const newUserData = _.get(newUserRes, 'data.createUser');
      expect(newUserData?.organizationId).toEqual(orgResult.id);
      options.orgAdminId = newUserData?.id || '';

      options.orgAdminOption = await impersonate(
        newUserData?.id || '',
        orgResult.guid,
        options.adminToken
      );

      const userInfoRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(options.orgAdminOption)
      );

      const orgAdminInfo = _.get(userInfoRes, 'data.me');
      const userOrgInfo = {
        orgGuid: _.get(orgAdminInfo, 'organization.guid'),
        orgId: _.get(orgAdminInfo, 'organization.id'),
        orgName: _.get(orgAdminInfo, 'organization.name'),
        userId: _.get(orgAdminInfo, 'id'),
        userName: _.get(orgAdminInfo, 'name'),
        isOLPEnabled:
          _.get(
            orgAdminInfo,
            'organization.jsondata.features.enableRBACFeature'
          ) === 'enabled'
      };

      await setOLPPermissions(userOrgInfo as any);

      // re-login to reset permission
      options.orgAdminOption = await impersonate(
        newUserData?.id || '',
        orgResult.guid,
        options.adminToken
      );

      // create resources
      await createAllResources(options.orgAdminOption);
    });

    afterAll(async () => {
      // delete resources
      if (resourcesList.resources.length) {
        resourcesList.resources = [];
        await commonAfterAll();
      }
    });

    describe('package with all resources type', () => {
      it('create draft package with some resources should success', async () => {
        const packageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: resourcesList.resources,
              organizationId: orgResult.id,
              version: '1.0.0'
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(packageRes, 'data.packageCreate');
        expect(packageData).toBeDefined();
        resourcesList.package.packageId1 = packageData?.id;

        expect(_.get(packageData, 'resources.records', []).length).toEqual(
          resourcesList.resources.length
        );
      });

      it('create package with invalid resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: uuid.v4(),
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        await expect(createPackageRes).rejects.toThrow(
          /The request input did not pass validation checks. See the data section for detail on validation errors./
        );
      });

      it('add all resources type to draft package should success', async () => {
        const packageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              organizationId: orgResult.id,
              version: '1.0.0'
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(packageRes, 'data.packageCreate');
        expect(packageData).toBeDefined();
        resourcesList.package.packageId2 = packageData?.id;

        expect(_.get(packageData, 'resources.records', []).length).toEqual(0);

        const addResourceRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: resourcesList.package.packageId2,
            resources: resourcesList.resources
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const updateResourcesData = _.get(
          addResourceRes,
          'data.packageUpdateResources'
        );
        expect(updateResourcesData).toBeDefined();
        resourcesList.package.packageId2 = updateResourcesData?.id;

        expect(
          _.get(updateResourcesData, 'resources.records', []).length
        ).toEqual(resourcesList.resources.length);
      });

      it('approve package should success', async () => {
        const updateRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              status: PackageStatus.Approved
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const updatedPackage = _.get(updateRes, 'data.packageUpdate');
        expect(updatedPackage).toBeDefined();
        expect(updatedPackage?.status).toEqual('approved');

        expect(_.get(updatedPackage, 'resources.records', []).length).toEqual(
          resourcesList.resources.length
        );

        resourcesList.package.packageId1 = updatedPackage?.id;
      });

      it('publish package with non-publish resource should fail', async () => {
        const updateRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        await expect(updateRes).rejects.toThrow(
          /input did not pass validation checks/
        );
      });

      it('publish non-publish resources should success and publish package should success', async () => {
        await activeAllResources(options.orgAdminOption);
        const updateRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const updatedPackage = _.get(updateRes, 'data.packageUpdate');
        expect(updatedPackage).toBeDefined();
        expect(updatedPackage?.status).toEqual('published');
        resourcesList.package.packageId1 = _.get(
          updateRes,
          'data.packageUpdate.id'
        );

        expect(_.get(updatedPackage, 'resources.records', []).length).toEqual(
          resourcesList.resources.length
        );
      });

      it('can not add draft resource to published package', async () => {
        // create draft schema
        const createSchemaRes = await sdkClient.sdk.upsertSchemaDraft(
          {
            input: { schema: schemaInput, dataRegistryId: resourcesList.regId }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const schemaId = _.get(createSchemaRes, 'data.upsertSchemaDraft.id');
        resourcesList.schemasToDelete.push(schemaId);

        const publishPackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              resources: [
                {
                  resourceId: schemaId || '',
                  resourceType: PackageResourceType.Schema,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        await expect(publishPackageRes).rejects.toThrow(
          /Resource is inactive. This package cannot be published until all its resources are active/
        );
      });

      it('publish package switch primary resource should success', async () => {
        // loop and switch primary resources from list all type resources added
        let updateRes;
        for (const resource of resourcesList.resources) {
          if (resource.resourceId.length < resourcesList.appId.length) {
            continue;
          }

          updateRes = await sdkClient.sdk.packageUpdate(
            {
              input: {
                id: resourcesList.package.packageId1,
                primaryResourceId: resource.resourceId
              }
            },
            getRequestHeaders(options.orgAdminOption)
          );

          resourcesList.package.packageId1 = _.get(
            updateRes,
            'data.packageUpdate.id'
          );
        }
      });

      it('grant package should success', async () => {
        const updateGrantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: resourcesList.package.packageId1,
              packageGrants: [
                {
                  organizationId: orgResult.id,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const orgGrant = _.get(updateGrantRes, 'data.packageUpdateGrants');
        expect(orgGrant).toBeDefined();
        expect(orgGrant?.id).toEqual(resourcesList.package.packageId1);

        // check grant
        const getGrantRes = await sdkClient.sdk.packageGrants({
          id: resourcesList.package.packageId1
        });

        const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
        expect(getGrant).toBeDefined();

        const currentGrant = getGrant?.find(
          (rec: any) => rec.organization.id == orgResult.id
        );
        expect(currentGrant).toBeDefined();
        expect(currentGrant?.grantType).toEqual('VIEW');
      });

      it('remove grant package should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: resourcesList.package.packageId1,
              packageGrants: [
                {
                  organizationId: orgResult.id,
                  grantType: PackageGrantType.Deny,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
        expect(grantData?.id).toEqual(resourcesList.package.packageId1);
      });

      it('delete package should success', async () => {
        const deletePackage1Res = await sdkClient.sdk.packageDelete(
          { id: resourcesList.package.packageId1 },
          getRequestHeaders(options.orgAdminOption)
        );

        expect(_.get(deletePackage1Res, 'data.packageDelete')).toBeDefined();

        const deletePackage2Res = await sdkClient.sdk.packageDelete(
          { id: resourcesList.package.packageId2 },
          getRequestHeaders(options.orgAdminOption)
        );

        expect(_.get(deletePackage2Res, 'data.packageDelete')).toBeDefined();
      });
    });
  });

  describe('automaticPackageCreation = true', () => {
    beforeAll(async () => {
      // create org with automaticPackageCreation = true
      // Set up test organization
      const testAutoPackageOrgInput = { ...testOrgInput };
      testAutoPackageOrgInput.metadata.features.automaticPackageCreation =
        'enabled';
      const orgRes = await sdkClient.sdk.createOrganization({
        input: testAutoPackageOrgInput
      });

      orgResult = _.get(orgRes, 'data.createOrganization');
      expect(orgResult).toBeDefined();
      expect(orgResult.id).toBeDefined();

      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          organizationId: orgResult.id,
          roleIds: roleIds,
          password: testPass
        }
      });

      const newUserData = _.get(newUserRes, 'data.createUser');
      expect(newUserData?.organizationId).toEqual(orgResult.id);
      options.orgAdminId = newUserData?.id || '';

      options.orgAdminOption = await impersonate(
        newUserData?.id || '',
        orgResult.guid,
        options.adminToken
      );

      const userInfoRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(options.orgAdminOption)
      );

      const userOrgInfo = {
        orgGuid: _.get(userInfoRes, 'data.me.organization.guid'),
        orgId: _.get(userInfoRes, 'data.me.organization.id'),
        orgName: _.get(userInfoRes, 'data.me.organization.name'),
        userId: _.get(userInfoRes, 'data.me.id'),
        userName: _.get(userInfoRes, 'data.me.name'),
        isOLPEnabled:
          _.get(
            userInfoRes,
            'data.me.organization.jsondata.features.enableRBACFeature'
          ) === 'enabled'
      };

      await setOLPPermissions(userOrgInfo as any);

      // re-login to reset permission
      options.orgAdminOption = await impersonate(
        newUserData?.id || '',
        orgResult.guid,
        options.adminToken
      );

      // create and publish resources
      await createAllResources(options.orgAdminOption);
      await activeAllResources(options.orgAdminOption);
    });

    afterAll(async () => {
      // delete resources
      if (resourcesList.resources.length) {
        resourcesList.resources = [];
        await commonAfterAll();
      }
    });

    describe('package with all resources type', () => {
      it('create package resources as primary resource should fail', async () => {
        // loop through list resources to create package
        const listAutoResourcesType = ['application', 'engine'];
        const listAutoResources = resourcesList.resources.filter((res: any) =>
          listAutoResourcesType.includes(res.resourceType)
        );

        const list = [];
        for (const resource of listAutoResources) {
          if (resource.resourceId.length < resourcesList.appId.length) {
            continue;
          }

          list.push(resource.resourceType);

          const createPackageRes = sdkClient.sdk.packageCreate(
            {
              input: {
                name: `${citestMarker}-public-package-${uuid.v4()}`,
                distributionType: EngineDistributionType.Public,
                primaryResourceId: resource.resourceId,
                resources: [resource],
                version: '1.0.0'
              }
            },
            getRequestHeaders(options.orgAdminOption)
          );

          await expect(createPackageRes).rejects.toThrow(
            /Primary Resource ID must not already exist in another package lineage/
          );
        }
      });

      it('create package with invalid resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [
                {
                  resourceType: PackageResourceType.Schema,
                  resourceId: uuid.v4(),
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        await expect(createPackageRes).rejects.toThrow(
          /The request input did not pass validation checks. See the data section for detail on validation errors./
        );
      });

      it('get auto created package for engine should success', async () => {
        const packageRes = await sdkClient.sdk.queryPackages(
          {
            resourceId: resourcesList.engineId
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(packageRes, 'data.packages.records[0]');
        expect(packageData).toBeDefined();
        resourcesList.package.packageId1 = packageData?.id;
        expect(packageData?.status).toEqual('published');
        expect(packageData?.distributionType).toEqual('private');
        const resources = _.get(packageData, 'resources.records');

        const engine = resources?.find(
          (res: any) => res.resourceId === resourcesList.engineId
        );
        expect(engine).toBeDefined();

        const enginBuild = resources?.find(
          (res: any) => res.resourceType === 'engineBuild'
        );
        expect(enginBuild).toBeDefined();
      });

      it('publish package with draft resources should failed', async () => {
        // create draft schema
        const createSchemaRes = await sdkClient.sdk.upsertSchemaDraft(
          {
            input: { schema: schemaInput, dataRegistryId: resourcesList.regId }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const schemaId = _.get(createSchemaRes, 'data.upsertSchemaDraft.id');
        resourcesList.schemasToDelete.push(schemaId);

        const packageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: EngineDistributionType.Public,
              resources: [],
              organizationId: orgResult.id,
              version: '1.0.0'
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(packageRes, 'data.packageCreate');
        expect(packageData).toBeDefined();
        const packageId = packageData?.id;
        resourcesList.packagesToDelete.push(packageId);

        const publishPackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: packageId || '',
              status: PackageStatus.Published,
              resources: [
                {
                  resourceId: schemaId || '',
                  resourceType: PackageResourceType.Schema,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(options.adminOption)
        );

        await expect(publishPackageRes).rejects.toThrow(
          /Resource is inactive. This package cannot be published until all its resources are active/
        );
      });

      it('can not add draft resource to published package', async () => {
        // create draft schema
        const createSchemaRes = await sdkClient.sdk.upsertSchemaDraft(
          {
            input: { schema: schemaInput, dataRegistryId: resourcesList.regId }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const schemaId = _.get(createSchemaRes, 'data.upsertSchemaDraft.id');
        resourcesList.schemasToDelete.push(schemaId);

        const publishPackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              resources: [
                {
                  resourceId: schemaId || '',
                  resourceType: PackageResourceType.Schema,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        await expect(publishPackageRes).rejects.toThrow(
          /Resource is inactive. This package cannot be published until all its resources are active/
        );
      });

      it('get auto created package for application should success', async () => {
        const packageRes = await sdkClient.sdk.queryPackages(
          {
            resourceId: resourcesList.appId
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(packageRes, 'data.packages.records')?.find(
          (res: any) => res.distributionType === 'private'
        );
        expect(packageData).toBeDefined();
        resourcesList.package.packageId2 = packageData?.id;
        expect(packageData?.status).toEqual('published');
        const app = _.get(packageData, 'resources.records')?.find(
          (res: any) => res.resourceId === resourcesList.appId
        );
        expect(app).toBeDefined();
        expect(packageData?.distributionType).toEqual('private');
      });

      it('grant package should success', async () => {
        const updateGrantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: resourcesList.package.packageId1,
              packageGrants: [
                {
                  organizationId: orgResult.id,
                  grantType: PackageGrantType.View,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const orgGrant = _.get(updateGrantRes, 'data.packageUpdateGrants');
        expect(orgGrant).toBeDefined();
        expect(orgGrant?.id).toEqual(resourcesList.package.packageId1);

        // check grant
        const getGrantRes = await sdkClient.sdk.packageGrants({
          id: resourcesList.package.packageId1
        });

        const getGrant = _.get(getGrantRes, 'data.packageGrants.records');
        expect(getGrant).toBeDefined();

        const currentGrant = getGrant?.find(
          (rec: any) => rec.organization.id == orgResult.id
        );
        expect(currentGrant).toBeDefined();
        expect(currentGrant?.grantType).toEqual('VIEW');
      });

      it('remove grant package should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: resourcesList.package.packageId1,
              packageGrants: [
                {
                  organizationId: orgResult.id,
                  grantType: PackageGrantType.Deny,
                  action: PackageGrantAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
        expect(grantData?.id).toEqual(resourcesList.package.packageId1);
      });

      it('change package status not change primary resouces status', async () => {
        const updateStatusRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: resourcesList.package.packageId1,
              status: PackageStatus.Deactivated
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );

        const packageData = _.get(updateStatusRes, 'data.packageUpdate');
        expect(packageData?.status).toEqual('deactivated');

        const appRes = await sdkClient.sdk.application({
          id: resourcesList.appId
        });

        const app = _.get(appRes, 'data.application');
        expect(app).toBeDefined();
        expect(app?.status).toEqual('active');
      });

      it('change primary resources status should also change package status', async () => {
        const result = await sdkClient.sdk.applicationWorkflow(
          {
            input: {
              id: resourcesList.appId,
              action: ApplicationWorkflowAction.Disable
            }
          },
          getRequestHeaders(options.orgAdminOption)
        );
        const appWorkflow = _.get(result, 'data.applicationWorkflow');
        expect(appWorkflow?.id).toEqual(resourcesList.appId);
        expect(appWorkflow?.status).toEqual('disabled');

        const updatePackageRes = await sdkClient.sdk.queryPackages({
          id: resourcesList.package.packageId2
        });

        const packageData = _.get(updatePackageRes, 'data.packages.records[0]');
        expect(packageData?.status).toEqual('deactivated');
        resourcesList.package.packageId2 = packageData?.id;
      });

      it('delete package should success', async () => {
        const deletePackage1Res = await sdkClient.sdk.packageDelete(
          { id: resourcesList.package.packageId1 },
          getRequestHeaders(options.orgAdminOption)
        );

        expect(_.get(deletePackage1Res, 'data.packageDelete')).toBeDefined();
        expect(_.get(deletePackage1Res, 'data.packageDelete.success')).toEqual(
          true
        );

        const deletePackage2Res = await sdkClient.sdk.packageDelete(
          { id: resourcesList.package.packageId2 },
          getRequestHeaders(options.orgAdminOption)
        );

        expect(_.get(deletePackage2Res, 'data.packageDelete')).toBeDefined();
        expect(_.get(deletePackage2Res, 'data.packageDelete.success')).toEqual(
          true
        );
      });
    });
  });
});

async function createAllResources(adminOptions: any) {
  // create needed data for resources
  // create data registry
  const schemaRegCreateRes = await sdkClient.sdk.createDataRegistry(
    {
      input: {
        name: citestMarker + '-reg-' + uuid.v4(),
        description: 'test',
        source: 'Some url',
        isPublic: true
      }
    },
    getRequestHeaders(adminOptions)
  );

  const regData = _.get(schemaRegCreateRes, 'data.createDataRegistry');
  expect(regData).toBeDefined();
  resourcesList.regId = regData?.id;

  // create cluster
  const result = await sdkClient.sdk.createCluster(
    {
      input: {
        type: ClusterType.Rt,
        dockerCredentials: {},
        allowedEngines: [],
        status: ClusterStatus.Active,
        edgeVersion: 3,
        name: citestMarker + 'cluster' + uuid.v4()
      }
    },
    getRequestHeaders(adminOptions)
  );

  const createCluster = _.get(result, 'data.createCluster');
  resourcesList.clusterId = createCluster?.id;

  // create new source
  const createSourceResult = await sdkClient.sdk.createSource(
    {
      input: {
        name: citestMarker + '-source-' + uuid.v4(),
        sourceTypeId: '1'
      }
    },
    getRequestHeaders(adminOptions)
  );

  const sourceCreate = _.get(createSourceResult, 'data.createSource');
  resourcesList.sourceId = sourceCreate?.id;

  // get published schema
  const publishedSchemaRes = await sdkClient.sdk.getSchemas(
    {},
    getRequestHeaders(adminOptions)
  );

  const publishedSchema = _.get(publishedSchemaRes, 'data.schemas.records[0]');
  resourcesList.publicSchemaId = publishedSchema?.id;

  // create resources
  // create application
  const createDraftAppRes = await sdkClient.sdk.createApplication(
    {
      input: {
        name: citestMarker + '-app-' + uuid.v4(),
        description: 'test',
        isPublic: true,
        url: 'www.example.com',
        oauth2RedirectUrls: ['www.example.com/callback'],
        checkPermissions: false,
        iconUrl: 'http://abc.com/link-icon.png'
      }
    },
    getRequestHeaders(adminOptions)
  );

  const appDraft = _.get(createDraftAppRes, 'data.createApplication');
  expect(appDraft?.id).toBeDefined();
  resourcesList.appId = appDraft?.id;
  resourcesList.resources.push({
    resourceType: 'application',
    resourceId: resourcesList.appId,
    action: 'ADD'
  });

  // create engine
  const createEngineRes = await sdkClient.sdk.createEngine(
    {
      input: {
        name: citestMarker + '-engine-' + uuid.v4(),
        categoryId: engineCategoryId,
        deploymentModel: DeploymentModel.FullyNetworkIsolated
      }
    },
    getRequestHeaders(adminOptions)
  );

  const engine1 = _.get(createEngineRes, 'data.createEngine');
  expect(engine1).toBeDefined();
  resourcesList.engineId = engine1?.id;
  resourcesList.resources.push({
    resourceType: 'engine',
    resourceId: resourcesList.engineId,
    action: 'ADD'
  });

  // create engineBuild
  const engineBuildRes = await sdkClient.sdk.createEngineBuild(
    {
      input: {
        engineId: resourcesList.engineId,
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    getRequestHeaders(adminOptions)
  );

  resourcesList.engineBuildId = _.get(
    engineBuildRes,
    'data.createEngineBuild.id'
  );
  resourcesList.resources.push({
    resourceType: 'engineBuild',
    resourceId: resourcesList.engineBuildId,
    action: 'ADD'
  });

  // create automateFlowRevision (createFlowRevision)
  const createFlowRes = await sdkClient.sdk.createFlow(
    {
      input: {
        name: citestMarker + '-flow-' + Date.now(),
        description: 'graphql-flow-description'
      }
    },
    getRequestHeaders(adminOptions)
  );

  resourcesList.flowId = _.get(createFlowRes, 'data.createFlow.id');

  const createFlowRevisionRes = await sdkClient.sdk.createFlowRevision(
    {
      input: {
        flowId: resourcesList.flowId,
        runtime: flowRuntime,
        forceCreate: true,
        isHead: true
      }
    },
    getRequestHeaders(adminOptions)
  );

  resourcesList.autoFlowRevisionId = _.get(
    createFlowRevisionRes,
    'data.createFlowRevision.flowRevisionId'
  );
  resourcesList.resources.push({
    resourceType: 'automateFlowRevision',
    resourceId: resourcesList.autoFlowRevisionId,
    action: 'ADD'
  });

  // create schema
  const createSchemaRes = await sdkClient.sdk.upsertSchemaDraft(
    {
      input: {
        schema: schemaInput,
        dataRegistryId: resourcesList.regId
      }
    },
    getRequestHeaders(adminOptions)
  );
  resourcesList.schemaId = _.get(createSchemaRes, 'data.upsertSchemaDraft.id');
  resourcesList.resources.push({
    resourceType: 'schema',
    resourceId: resourcesList.schemaId,
    action: 'ADD'
  });

  // create package
  const packageRes = await sdkClient.sdk.packageCreate(
    {
      input: {
        name: `${citestMarker}-public-package-${uuid.v4()}`,
        distributionType: EngineDistributionType.Public,
        resources: [
          {
            resourceId: resourcesList.appId,
            resourceType: PackageResourceType.Application,
            action: PackageResourceAction.Add
          }
        ],
        organizationId: orgResult.id,
        version: '1'
      }
    },
    getRequestHeaders(adminOptions)
  );

  expect(_.get(packageRes, 'data.packageCreate')).toBeDefined();
  resourcesList.packageId = _.get(packageRes, 'data.packageCreate.id');
  resourcesList.resources.push({
    resourceType: 'package',
    resourceId: resourcesList.packageId,
    action: 'ADD'
  });

  // create tdo
  const createTDORes = await sdkClient.sdk.createTDO(
    {
      input: {
        name: citestMarker + '-tdo-' + uuid.v4(),
        startDateTime: 1623253937,
        stopDateTime: 1623259000,
        description: 'test',
        isPublic: true
      }
    },
    getRequestHeaders(adminOptions)
  );

  const createTDO = _.get(createTDORes, 'data.createTDO');
  expect(createTDO).toBeDefined();
  resourcesList.tdoId = createTDO?.id;
  resourcesList.resources.push({
    resourceType: 'tdo',
    resourceId: resourcesList.tdoId,
    action: 'ADD'
  });

  // create automateNode
  await sdkClient.uploadFile(
    createAutoNodeQuery,
    'AutomateNode-1.1.1.gz',
    './citest/data/AutomateNode-1.1.1.gz'
  );
  const createAutoNodeRes = await sdkClient.query(
    createAutoNodeQuery,
    {},
    getRequestHeaders(adminOptions)
  );

  const autoNode = _.get(createAutoNodeRes, 'createTDOWithAsset');
  expect(autoNode).toBeTruthy();
  resourcesList.autoNodeId = autoNode.id;
  resourcesList.resources.push({
    resourceType: 'automateNode',
    resourceId: resourcesList.autoNodeId,
    action: 'ADD'
  });

  // create automatePalette
  const createAutomatePaletteRes = await sdkClient.sdk.createTDO(
    {
      input: {
        startDateTime: moment().subtract(2, 'hour').unix(),
        stopDateTime: moment().subtract(1, 'hour').unix(),
        name: citestMarker + '-autoPalette-' + uuid.v4(),
        isPublic: true,
        addToIndex: false,
        details: {
          tags: [{ value: 'automatePalette' }],
          addToIndex: false,
          nodeModules: {
            moduleName: '@gagestestorg/npm_private_test_package',
            moduleRepo: 'npm',
            isPrivateRepo: true,
            isPrivateRegistry: false,
            moduleVersion: '1.0.0',
            scope: 'gagestestorg',
            registryUrl: '',
            sshUrl: ''
          }
        }
      }
    },
    getRequestHeaders(adminOptions)
  );
  const automatePalette = _.get(createAutomatePaletteRes, 'data.createTDO');
  resourcesList.autoPaletteId = automatePalette?.id;
  resourcesList.resources.push({
    resourceType: 'automatePalette',
    resourceId: resourcesList.autoPaletteId,
    action: 'ADD'
  });

  // create applicationConfigDefinition
  const createAppConfigRes =
    await sdkClient.sdk.applicationConfigDefinitionCreate(
      {
        appId: resourcesList.appId,
        configKey: 'UserTestConfig',
        configType: ApplicationConfigValueEnum.Boolean,
        configLevel: ApplicationConfigLevelEnum.User,
        required: false,
        secured: false,
        description: 'test',
        packageId: resourcesList.packageId
      },
      getRequestHeaders(adminOptions)
    );
  const createAppConfig = _.get(
    createAppConfigRes,
    'data.applicationConfigDefinitionCreate.records[0]'
  );
  resourcesList.appConfigId = createAppConfig?.id;
  resourcesList.resources.push({
    resourceType: 'applicationConfigDefinition',
    resourceId: resourcesList.appConfigId,
    action: 'ADD'
  });
}

async function activeAllResources(adminOptions: any) {
  // publish application
  const actionAndStatusList = [
    [ApplicationWorkflowAction.Submit, 'pending'],
    [ApplicationWorkflowAction.Approve, 'approved'],
    [ApplicationWorkflowAction.Deploy, 'active']
  ];

  for (let action of actionAndStatusList) {
    const result = await sdkClient.sdk.applicationWorkflow(
      {
        input: {
          id: resourcesList.appId,
          action: action[0] as ApplicationWorkflowAction
        }
      },
      getRequestHeaders(adminOptions)
    );
    const applicationWorkflowData = _.get(result, 'data.applicationWorkflow');
    expect(applicationWorkflowData?.id).toEqual(resourcesList.appId);
    expect(applicationWorkflowData?.status).toEqual(action[1]);
  }

  // publish engine, engineBuild
  const buildEngineActionList = [
    [BuildUpdateAction.Submit, 'approved'],
    [BuildUpdateAction.Deploy, 'deployed']
  ];

  for (let action of buildEngineActionList) {
    const updateBuildRes = await sdkClient.sdk.updateEngineBuild(
      {
        input: {
          id: resourcesList.engineBuildId,
          engineId: resourcesList.engineId,
          action: action[0] as BuildUpdateAction
        }
      },
      getRequestHeaders(adminOptions)
    );

    const updateBuild = _.get(updateBuildRes, 'data.updateEngineBuild');
    expect(updateBuild?.id).toEqual(resourcesList.engineBuildId);
    expect(updateBuild?.status).toEqual(action[1]);
  }

  // publish schema
  await sdkClient.sdk.updateSchemaState(
    {
      input: {
        id: resourcesList.schemaId,
        status: SchemaStatus.Published
      }
    },
    getRequestHeaders(adminOptions)
  );

  // publish package
  await sdkClient.sdk.packageUpdate(
    {
      input: {
        id: resourcesList.packageId,
        status: PackageStatus.Published
      }
    },
    getRequestHeaders(adminOptions)
  );
}

async function impersonate(
  userId: string,
  applicationOrgGUID: string,
  token: string
) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function setOLPPermissions(orgInfo: {
  orgGuid: string;
  userId: string;
  orgId: string;
}) {
  const olpObjectIds: {
    authGroupId?: string;
    permissionId?: string;
    aceOrgRecords?: any[];
  } = {};

  const permissions = [
    AuthPermissionType.AiwareSchemaCreate,
    AuthPermissionType.DeveloperEngineCreate,
    AuthPermissionType.DeveloperEngineRead,
    AuthPermissionType.DeveloperEngineUpdate,
    AuthPermissionType.DeveloperEngineEnable,
    AuthPermissionType.DeveloperEngineDelete,
    AuthPermissionType.DeveloperBuildCreate,
    AuthPermissionType.DeveloperBuildUpdate
  ];

  const createAuthGroupRes = await sdkClient.sdk.CreateAuthGroup({
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
  const authGroupCreate = _.get(createAuthGroupRes, 'data.authGroupCreate');
  expect(authGroupCreate.id).toBeDefined();
  resourcesList.authGroupId = _.get(authGroupCreate, 'id');
  olpObjectIds.authGroupId = _.get(authGroupCreate, 'id');

  const createPerSetRes = await sdkClient.sdk.authPermissionSetCreate({
    input: {
      name: `${citestMarker}-permission-${uuid.v4()}`,
      description: 'desc',
      organizationID: `${orgInfo.orgId}`,
      permissions
    }
  });
  const authPermissionSet = _.get(
    createPerSetRes,
    'data.authPermissionSetCreate'
  );
  expect(authPermissionSet.id).toBeDefined();
  resourcesList.authPermissionId = _.get(authPermissionSet, 'id');
  olpObjectIds.permissionId = _.get(authPermissionSet, 'id');

  const addACEsRes = await sdkClient.sdk.addACEsToResources({
    ids: [orgInfo.orgId],
    resourceType: AuthResourceType.Organization,
    ownerOrganization: orgInfo.orgGuid,
    entries: [
      {
        member: {
          id: olpObjectIds.authGroupId!,
          memberType: AuthGroupMemberType.Group
        },
        permissionSetID: olpObjectIds.permissionId!
      }
    ]
  });
  const result = _.get(addACEsRes, 'data.addACEsToResources');
  expect(result.records.length).toBeGreaterThan(0);
  olpObjectIds.aceOrgRecords = result.records;

  return olpObjectIds;
}

async function commonAfterAll() {
  // delete packages (fallback net: covers current lineage of packageId1/packageId2
  // in case the block's own "delete package should success" test never ran, plus
  // resourcesList.packageId and any other packages tracked in packagesToDelete)
  const packageIds: string[] = _.uniq(
    [
      resourcesList.package.packageId1,
      resourcesList.package.packageId2,
      resourcesList.packageId,
      ...resourcesList.packagesToDelete
    ].filter(Boolean)
  );
  for (const packageId of packageIds) {
    await safe(`delete package ${packageId}`, () =>
      sdkClient.sdk.packageDelete(
        { id: packageId },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete app
  if (resourcesList.appId) {
    await safe(`delete app ${resourcesList.appId}`, () =>
      sdkClient.sdk.deleteApplication(
        {
          id: resourcesList.appId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete engine
  if (resourcesList.engineId) {
    await safe(`delete engine ${resourcesList.engineId}`, () =>
      sdkClient.sdk.deleteEngine(
        {
          id: resourcesList.engineId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete sourceId
  if (resourcesList.sourceId) {
    await safe(`delete source ${resourcesList.sourceId}`, () =>
      sdkClient.sdk.deleteSource(
        {
          id: resourcesList.sourceId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete folder, folderParentId
  if (resourcesList.folderId) {
    await safe(`delete folder ${resourcesList.folderId}`, () =>
      sdkClient.sdk.deleteFolder(
        {
          input: {
            id: resourcesList.folderId,
            orderIndex: folderOrderIndex
          }
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete dataset
  if (resourcesList.dataSetId) {
    await safe(`delete dataset ${resourcesList.dataSetId}`, () =>
      sdkClient.sdk.deleteDataset(
        {
          id: resourcesList.dataSetId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete schemas (resourcesList.schemaId from createAllResources, plus any
  // inline draft schemas tracked in schemasToDelete)
  const schemaIds: string[] = _.uniq(
    [resourcesList.schemaId, ...resourcesList.schemasToDelete].filter(Boolean)
  );
  for (const schemaId of schemaIds) {
    await safe(`delete schema ${schemaId}`, () =>
      sdkClient.sdk.updateSchemaState(
        {
          input: {
            id: schemaId,
            status: SchemaStatus.Deleted
          }
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete appViewId
  if (resourcesList.appViewId) {
    await safe(`delete app viewer ${resourcesList.appViewId}`, () =>
      sdkClient.sdk.deleteApplicationViewer(
        {
          viewerId: resourcesList.appViewId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete autoNodeId
  if (resourcesList.autoNodeId) {
    await safe(`delete TDO ${resourcesList.autoNodeId}`, () =>
      sdkClient.sdk.deleteTDO(
        {
          id: resourcesList.autoNodeId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete autoPaletteId
  if (resourcesList.autoPaletteId) {
    await safe(`delete TDO ${resourcesList.autoPaletteId}`, () =>
      sdkClient.sdk.deleteTDO(
        {
          id: resourcesList.autoPaletteId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete flowId autoFlowRevisionId
  if (resourcesList.flowId) {
    await safe(`delete engine ${resourcesList.flowId}`, () =>
      sdkClient.sdk.deleteEngine({
        id: resourcesList.flowId
      })
    );
  }

  // delete tdoId
  if (resourcesList.tdoId) {
    await safe(`delete TDO ${resourcesList.tdoId}`, () =>
      sdkClient.sdk.deleteTDO(
        {
          id: resourcesList.tdoId
        },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete cluster
  if (resourcesList.clusterId) {
    await safe(`delete cluster ${resourcesList.clusterId}`, () =>
      sdkClient.sdk.deleteCluster(
        { id: resourcesList.clusterId },
        getRequestHeaders(options.orgAdminOption)
      )
    );
  }

  // delete user
  if (options.orgAdminId) {
    await safe(`delete user ${options.orgAdminId}`, () =>
      sdkClient.sdk.deleteUser({
        id: options.orgAdminId
      })
    );
  }

  // delete org
  if (orgResult.id) {
    await safe(`disable RBAC org ${orgResult.id}`, () =>
      sdkClient.sdk.updateOrganization(
        {
          input: {
            id: orgResult.id,
            metadata: {
              features: {
                enableRBACFeature: 'disabled'
              }
            }
          }
        },
        getRequestHeaders(options.adminOption)
      )
    );

    await safe(`delete org ${orgResult.id}`, () =>
      sdkClient.sdk.updateOrganization(
        {
          input: {
            id: orgResult.id,
            status: OrganizationStatus.Deleted
          }
        },
        getRequestHeaders(options.adminOption)
      )
    );
  }
}

const schemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    foo: {
      $id: '/properties/foo',
      type: 'string',
      title: 'The Foo Schema',
      default: '',
      examples: ['bar']
    },
    bar: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};

const flowRuntime = JSON.stringify({
  flows: [
    {
      id: '93e05a0f.305b58',
      info: '',
      type: 'tab',
      label: 'Flow 1',
      disabled: false
    },
    {
      x: 150,
      y: 140,
      z: '93e05a0f.305b58',
      id: '4874936a.4f6e0c',
      name: '',
      type: 'aiware-in',
      wires: [['1567359e.d1bb0a']],
      _mtime: 0,
      format: 'buffer',
      samples: [],
      tdoContent: '{}',
      waitForResults: false
    },
    {
      x: 410,
      y: 140,
      z: '93e05a0f.305b58',
      id: '1567359e.d1bb0a',
      name: '',
      type: 'aiware-out',
      wires: [],
      failureMsg: '',
      statusCode: 200,
      disableDebug: false,
      failureReason: '',
      failureMsgType: '',
      excludeMetadata: false,
      failureReasonType: '',
      skipResultCallback: false
    }
  ],
  package: { dependencies: {} },
  version: {
    runner: 'registry.central.aiware.com/node-red-runner-v3:dev',
    studio: 'registry.central.aiware.com/node-red-v3:dev'
  },
  credentials: { $: '22d8e33b5d7d3b220fe9dc5679a39560IkQ=' },
  credentialSecret:
    '3b09d6ee23c915241a21606a259dbe16883ebde8bc9857592fa1fd17c4a3c1f0'
});
