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
const isEnablePackageGrantLogic = (global as any).enablePackageGrantLogic;
const isEnableInternalEngineDeploymentTest =
  (global as any).enableInternalEngineDeploymentTest || false;
console.log(
  '>> Run CI Test with enablePackageGrantLogic = ',
  isEnablePackageGrantLogic
);
const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);
const config = helpers.config;
const env = config.env;
const testPass = 'testUserPassword';
let sdkClient: GraphqlClient;

const describeif = (condition: any, ...args: any[]) =>
  condition ? describe(...args) : describe.skip(...args);

const itif = (condition: any, ...args: any[]) =>
  condition ? it(...args) : it.skip(...args);

const superAdmin = {
  token: '',
  orgId: '',
  option: {}
};

const packageIdSet = new Set<string>();
const appIdSet = new Set<string>();
const engineIdSet = new Set<string>();

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

const defaultTestData = {
  activeApp: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    key: ''
  },
  activeAppSwitch: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    key: ''
  },
  appDraft: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    key: ''
  },
  appDraftSwitchTest: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    key: ''
  },
  appDraftSwitch: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    key: ''
  },
  org1: {
    id: '',
    name: (global as any).orgMarker.package + '-' + uuid.v4(),
    guid: '',
    adminId: ''
  },
  adminOptions: {},
  authGroupId: '',
  authPermissionId: '',
  appPackage: {
    id: '',
    name: `${citestMarker}-package-${uuid.v4()}`
  },
  enginePackage: {
    id: '',
    name: `${citestMarker}-package-${uuid.v4()}`
  },
  enginePackageOrgless: {
    id: '',
    name: `${citestMarker}-package-${uuid.v4()}`
  },
  draftPackage: {
    id: '',
    name: `${citestMarker}-package-${uuid.v4()}`
  },
  privatePack: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    distributionType: 'private'
  },
  engine1: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    categoryId: '',
    buildId: ''
  },
  engineOrgless: {
    id: '',
    name: citestMarker + '-' + uuid.v4(),
    categoryId: '',
    buildId: ''
  }
};

let testData = { ...defaultTestData };

describe('citest_package: package primary resource', () => {
  beforeAll(async () => {
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    superAdmin.token = sdkClient.sessionToken!;
    superAdmin.option = helpers.requestOptions(superAdmin.token);

    const superAdminRes = await sdkClient.sdk.me(
      {},
      getRequestHeaders(superAdmin.option)
    );
    const superAdminData = _.get(superAdminRes, 'data.me');
    expect(superAdminData).toBeDefined();
    superAdmin.orgId = _.get(superAdminData, 'organization.id', '');

    // get engine category to create engine later
    const query = `{
      engineCategories(type: "Cognition", name: "Transcription", limit: 1) {
        count
        records {
          id
          name
        }
      }
    }`;
    const categoryRes = await sdkClient.query(query);
    const engineCategories = _.get(categoryRes, 'engineCategories');
    expect(engineCategories).toBeDefined();
    expect(engineCategories.count).toEqual(1);
    expect(engineCategories.records).toHaveLength(1);
    expect(_.get(engineCategories, 'records[0].id')).toBeDefined();
    testData.engine1.categoryId = _.get(engineCategories, 'records[0].id');
    testData.engineOrgless.categoryId = _.get(
      engineCategories,
      'records[0].id'
    );
  });

  describe('org with automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // create org and admin user with automaticPackageCreation = false
      const newOrgRes = await sdkClient.sdk.createOrganization({
        input: {
          name: testData.org1.name,
          businessUnit: 'Legal',
          types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
          ].filter((app) => app),
          metadata: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg?.id).toBeDefined();
      testData.org1.id = newOrg?.id || '';
      testData.org1.guid = newOrg?.guid || '';

      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          organizationId: newOrg?.id || '',
          roleIds: roleIds,
          password: testPass
        }
      });

      const newUserData = _.get(newUserRes, 'data.createUser');
      expect(newUserData?.organizationId).toEqual(newOrg?.id);
      testData.org1.adminId = newUserData?.id || '';

      testData.adminOptions = await impersonate(
        newUserData?.id || '',
        newOrg?.guid || '',
        superAdmin.token
      );

      const userInfoRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(testData.adminOptions)
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
      testData.adminOptions = await impersonate(
        newUserData?.id || '',
        newOrg?.guid || '',
        superAdmin.token
      );

      // create and deploy application
      const activeApp = await createAndDeployApp(
        {
          name: testData.activeApp.name,
          description: ''
        },
        testData.adminOptions
      );
      testData.activeApp.id = activeApp?.id || '';
      testData.activeApp.key = _.get(activeApp, 'key', '');
      appIdSet.add(testData.activeApp.id);

      // create application draft
      const appDraft = await createDraftApp(
        {
          name: testData.appDraft.name,
          description: ''
        },
        testData.adminOptions
      );
      testData.appDraft.id = appDraft?.id || '';
      testData.appDraft.key = _.get(appDraft, 'key', '');
      appIdSet.add(testData.appDraft.id);

      // create private resource for veritone org
      const createPrivatePackRes = await sdkClient.sdk.packageCreate({
        input: {
          name: testData.privatePack.name,
          distributionType: EngineDistributionType.Private,
          resources: [],
          version: '1'
        }
      });
      const privatePack = _.get(createPrivatePackRes, 'data.packageCreate');
      expect(privatePack).toBeDefined();
      testData.privatePack.id = privatePack?.id || '';
      expect(privatePack?.organization?.id).not.toEqual(testData.org1.id);

      // create engine
      const engine1 = await createAndDeployEngine(
        {
          name: testData.engine1.name,
          categoryId: testData.engine1.categoryId,
          deploymentModel: 'FullyNetworkIsolated'
        },
        testData.adminOptions
      );
      expect(engine1).toBeDefined();
      testData.engine1.id = engine1?.id || '';
      engineIdSet.add(testData.engine1.id);
    });

    describe('create package', () => {
      it('create package using created application as primary resource should success', async () => {
        const createPackageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.appPackage.name,
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.activeApp.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeApp.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(createPackageRes, 'data.packageCreate');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);

        expect(packageData?.primaryResourceId).toEqual(testData.activeApp.id);
        expect(packageData?.name).toEqual(testData.appPackage.name);
        expect(packageData?.organization?.id).toEqual(testData.org1.id);
        expect(packageData?.resources?.records.length).toEqual(1);
      });

      it('create package using created engine as primary resource should success', async () => {
        const createPackageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.enginePackage.name,
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.engine1.id,
              resources: [
                {
                  resourceType: PackageResourceType.Engine,
                  resourceId: testData.engine1.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(createPackageRes, 'data.packageCreate');
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData?.id || '';
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData?.primaryResourceId).toEqual(testData.engine1.id);
        expect(packageData?.name).toEqual(testData.enginePackage.name);
        expect(packageData?.organization?.id).toEqual(testData.org1.id);
        // engine + engineBuild resources
        expect(packageData?.resources?.records.length).toEqual(2);
      });

      it('create another package using application as primary resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.appPackage.name + 'should-fail',
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.activeApp.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeApp.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });

      it('create package using not published resource as primary resource should success', async () => {
        const createPackageRes = await sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.draftPackage.name,
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.appDraft.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageWithDraftResource = _.get(
          createPackageRes,
          'data.packageCreate'
        );
        expect(packageWithDraftResource?.primaryResourceId).toEqual(
          testData.appDraft.id
        );
        expect(
          _.get(packageWithDraftResource, 'resources.records.length')
        ).toEqual(1);
        expect(packageWithDraftResource?.organization?.id).toEqual(
          testData.org1.id
        );
        testData.draftPackage.id = packageWithDraftResource?.id || '';
        packageIdSet.add(testData.draftPackage.id);
      });

      xit('create package using private resource of other org as primary resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.appPackage.name + 'should-fail',
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.privatePack.id,
              resources: [
                {
                  resourceType: PackageResourceType.Package,
                  resourceId: testData.privatePack.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(createPackageRes).rejects.toThrow();
      });

      // it('create package using owned private resource as primary resource should success', async () => {});
    });

    describe('update package', () => {
      it('change primary resource to not added resource should fail', async () => {
        const updatePackagePrimaryRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.engine1.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackagePrimaryRes).rejects.toThrow(
          /primary resource ID provided does not match any of the resources in the package/
        );
      });

      it('change primary resource to not unique primary resource should fail', async () => {
        const updatePackagePrimaryRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.appDraft.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackagePrimaryRes).rejects.toThrow(
          /violates exclusion constraint/
        );
      });

      it('add draft resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.find(
            (res: any) =>
              res.resourceType === 'application' &&
              res.resourceId === testData.appDraft.id
          )
        ).toBeDefined();
      });

      it('add draft resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.find(
            (res: any) =>
              res.resourceType === 'application' &&
              res.resourceId === testData.appDraft.id
          )
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.draftPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeApp.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.find(
            (res: any) => res.resourceId === testData.activeApp.id
          )
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.draftPackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Engine,
                resourceId: testData.engine1.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.find((res: any) => res.resourceId === testData.engine1.id)
        ).toBeDefined();
      });

      it('add duplicate resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.filter(
            (res: any) => res.resourceId === testData.appDraft.id
          ).length
        ).toEqual(1);
      });

      it('add duplicate resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.filter(
            (res: any) => res.resourceId === testData.appDraft.id
          ).length
        ).toEqual(1);
      });

      it('remove resource from package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.find((res: any) => res.resourceId === testData.appDraft.id)
        ).toEqual(undefined);
      });

      it('remove resource from package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Remove
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.find((res: any) => res.resourceId === testData.appDraft.id)
        ).toEqual(undefined);
      });

      it('add and change primary resource to current adding resource should success', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraftSwitchTest.name,
            description: ''
          },
          testData.adminOptions
        );

        testData.appDraftSwitchTest.id = newDraftApp?.id || '';
        testData.appDraftSwitchTest.key = _.get(newDraftApp, 'key', '');
        appIdSet.add(testData.appDraftSwitchTest.id);

        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.draftPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: newDraftApp?.id || '',
                  action: PackageResourceAction.Add
                }
              ],
              primaryResourceId: newDraftApp?.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData?.primaryResource?.resourceId).toEqual(
          newDraftApp?.id
        );
      });

      it('remove primary resource from resource list should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Engine,
                resourceId: testData.engine1.id,
                action: PackageResourceAction.Remove
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Please provide a new valid primary resource ID if you wish to remove the resource/
        );
      });

      it('remove primary resource should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.enginePackage.id,
              primaryResourceId: ''
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData).toBeDefined();
        expect(_.get(packageData, 'primaryResourceId')).toEqual(undefined);
      });

      it('update package info should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.enginePackage.id,
              description: 'ci test'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData?.description).toEqual('ci test');
      });

      it('change package status to approve with not published primary resource should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.draftPackage.id,
              status: PackageStatus.Approved
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('approved');
      });

      it('change package status to approve with published primary resource should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Approved
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('approved');
      });

      it('change package status to published with not published primary resource should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.draftPackage.id,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /The request input did not pass validation checks/
        );
      });

      it('change package status to published with published primary resource should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('published');
      });

      it('change package status to deactive should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Deactivated
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('deactivated');
      });

      it('change package status to published again should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('published');
      });

      it('change primary resource to added published resource should success', async () => {
        const newDeployedApp = await createAndDeployApp(
          {
            name: testData.activeAppSwitch.name,
            description: ''
          },
          testData.adminOptions
        );

        testData.activeAppSwitch.id = newDeployedApp?.id || '';
        testData.activeAppSwitch.key = _.get(newDeployedApp, 'key', '');
        appIdSet.add(testData.activeAppSwitch.id);

        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: newDeployedApp?.id || '',
                  action: PackageResourceAction.Add
                }
              ],
              primaryResourceId: newDeployedApp?.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage?.status).toEqual('published');
        expect(appPackage?.primaryResource?.resourceId).toEqual(
          newDeployedApp?.id
        );
        testData.appPackage.id = appPackage?.id || '';
        packageIdSet.add(testData.appPackage.id);
      });

      xit('change primary resource to added not published resource should fail', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraftSwitch.name,
            description: ''
          },
          testData.adminOptions
        );

        testData.appDraftSwitch.id = newDraftApp?.id || '';
        testData.appDraftSwitch.key = _.get(newDraftApp, 'key', '');
        appIdSet.add(testData.appDraftSwitch.id);

        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: newDraftApp?.id || '',
                  action: PackageResourceAction.Add
                }
              ],
              primaryResourceId: newDraftApp?.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      it('update published package should also update package version', async () => {
        let appPackageRes = await sdkClient.sdk.queryPackages(
          {
            id: testData.appPackage.id
          },
          getRequestHeaders(testData.adminOptions)
        );

        const oldVersion = _.get(
          appPackageRes,
          'data.packages.records[0].version',
          ''
        );

        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.activeApp.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);

        appPackageRes = await sdkClient.sdk.queryPackages(
          {
            id: testData.appPackage.id
          },
          getRequestHeaders(testData.adminOptions)
        );

        const newVersion = _.get(
          appPackageRes,
          'data.packages.records[0].version',
          ''
        );

        expect(+newVersion.split('.')[0]).toBeGreaterThan(
          +oldVersion.split('.')[0]
        );
      });

      it('change primary resource to primary resource of old version of other package should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.enginePackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeAppSwitch.id,
                  action: PackageResourceAction.Add
                }
              ],
              primaryResourceId: testData.activeAppSwitch.id
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /violates exclusion constraint/
        );
      });
    });

    describe('grant package', () => {
      xit('grant published public package to deleted org should fail', async () => {
        const getDeletedOrgRes = await sdkClient.sdk.organizations({
          status: OrganizationStatus.Deleted,
          limit: 1
        });

        const orgData = _.get(
          getDeletedOrgRes,
          'data.organizations.records[0]'
        );

        const grantRes = sdkClient.sdk.packageUpdateGrants(
          {
            input: {
              packageId: testData.appPackage.id,
              packageGrants: [
                {
                  organizationId: orgData?.id || '',
                  grantType: PackageGrantType.Grant,
                  action: PackageGrantAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(grantRes).rejects.toThrow();
      });

      it('grant published public package to active org should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();

        const listGrantRes = await sdkClient.sdk.packageGrants(
          { id: testData.appPackage.id },
          getRequestHeaders(testData.adminOptions)
        );

        const listGrantData = _.get(listGrantRes, 'data.packageGrants.records');
        expect(listGrantData?.length).toEqual(1);
      });

      it('change shared public package to private should remove grant', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              distributionType: EngineDistributionType.Private
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData?.distributionType).toEqual('private');
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);

        const listGrantRes = await sdkClient.sdk.packageGrants(
          { id: testData.appPackage.id },
          getRequestHeaders(testData.adminOptions)
        );

        const grantData = _.get(listGrantRes, 'data.packageGrants.records');
        expect(grantData?.length).toEqual(0);
      });

      it('get package grant should success', async () => {
        const listGrantRes = await sdkClient.sdk.packageGrants(
          { id: testData.appPackage.id },
          getRequestHeaders(testData.adminOptions)
        );

        const grantData = _.get(listGrantRes, 'data.packageGrants.records');
        expect(grantData).toBeDefined();
      });

      xit('grant private package to other org should fail', async () => {
        const getDeletedOrgRes = await sdkClient.sdk.organizations({
          status: OrganizationStatus.Active,
          limit: 1
        });

        const orgData = _.get(
          getDeletedOrgRes,
          'data.organizations.records[0]'
        );

        const grantRes = sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        await expect(grantRes).rejects.toThrow(
          /One or more of the permission sets do not exist/
        );
      });

      it('change package grant type VIEW should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('change package grant type DENY should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Deny,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove package grant should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Deny,
                action: PackageGrantAction.Remove
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete package should success', async () => {
        await safe(`delete private package ${testData.privatePack.id}`, () =>
          sdkClient.sdk.packageDelete({ id: testData.privatePack.id })
        );
        testData.privatePack.id = '';

        await safe(`delete package ${testData.enginePackage.id}`, () =>
          sdkClient.sdk.packageDelete(
            { id: testData.enginePackage.id },
            getRequestHeaders(testData.adminOptions)
          )
        );
        packageIdSet.delete(testData.enginePackage.id);

        await safe(`delete package ${testData.draftPackage.id}`, () =>
          sdkClient.sdk.packageDelete(
            { id: testData.draftPackage.id },
            getRequestHeaders(testData.adminOptions)
          )
        );
        packageIdSet.delete(testData.draftPackage.id);

        await safe(`delete package ${testData.appPackage.id}`, () =>
          sdkClient.sdk.packageDelete(
            { id: testData.appPackage.id },
            getRequestHeaders(testData.adminOptions)
          )
        );
        packageIdSet.delete(testData.appPackage.id);
      });
    });

    afterAll(async () => {
      // fallback: delete any package left over if an earlier assertion
      // threw before the in-test delete step ran
      for (const id of packageIdSet) {
        await safe(`delete package ${id}`, () =>
          sdkClient.sdk.packageDelete(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      packageIdSet.clear();

      if (testData.privatePack.id) {
        await safe(`delete private package ${testData.privatePack.id}`, () =>
          sdkClient.sdk.packageDelete({ id: testData.privatePack.id })
        );
      }

      // delete apps
      for (const id of appIdSet) {
        await safe(`delete app ${id}`, () =>
          sdkClient.sdk.deleteApplication(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      appIdSet.clear();

      // delete engines
      for (const id of engineIdSet) {
        await safe(`delete engine ${id}`, () =>
          sdkClient.sdk.deleteEngine(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      engineIdSet.clear();

      // delete user
      if (testData.org1.adminId) {
        await safe(`delete user ${testData.org1.adminId}`, async () => {
          const query = `mutation {
              deleteUser(id: "${testData.org1.adminId}")  {
                id
              }
            }`;
          await sdkClient.query(query);
        });
      }

      // delete org
      if (testData.org1.id) {
        await safe(`disable RBAC org ${testData.org1.id}`, () =>
          sdkClient.sdk.updateOrganization(
            {
              input: {
                id: testData.org1.id,
                metadata: {
                  features: {
                    enableRBACFeature: 'disabled'
                  }
                }
              }
            },
            getRequestHeaders(superAdmin.option)
          )
        );

        await safe(`delete org ${testData.org1.id}`, () =>
          sdkClient.sdk.updateOrganization(
            {
              input: {
                id: testData.org1.id,
                status: OrganizationStatus.Deleted
              }
            },
            getRequestHeaders(superAdmin.option)
          )
        );
      }
    });
  });

  describe('org with automaticPackageCreation = true', () => {
    beforeAll(async () => {
      testData = { ...defaultTestData };
      // create org with automaticPackageCreation = true
      const newOrgRes = await sdkClient.sdk.createOrganization({
        input: {
          name: testData.org1.name,
          businessUnit: 'Legal',
          types: [OrganizationType.Agency, OrganizationType.Broadcaster],
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
          ].filter((app) => app),
          metadata: {
            features: {
              enableRBACFeature: 'enabled',
              automaticPackageCreation: 'enabled'
            }
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'data.createOrganization');
      expect(newOrg?.id).toBeDefined();
      testData.org1.id = newOrg?.id || '';
      testData.org1.guid = newOrg?.guid || '';

      const newUserRes = await sdkClient.sdk.createUser({
        input: {
          name: citestMarker + '-user-' + uuid.v4(),
          organizationId: newOrg?.id || '',
          roleIds: roleIds,
          password: testPass
        }
      });

      const newUserData = _.get(newUserRes, 'data.createUser');
      expect(newUserData?.organizationId).toEqual(newOrg?.id);
      testData.org1.adminId = newUserData?.id || '';

      testData.adminOptions = await impersonate(
        newUserData?.id || '',
        newOrg?.guid || '',
        superAdmin.token
      );

      const userInfoRes = await sdkClient.sdk.me(
        {},
        getRequestHeaders(testData.adminOptions)
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
      testData.adminOptions = await impersonate(
        newUserData?.id || '',
        newOrg?.guid || '',
        superAdmin.token
      );

      // create and deploy application
      const activeApp = await createAndDeployApp(
        {
          name: testData.activeApp.name,
          description: ''
        },
        testData.adminOptions
      );
      testData.activeApp.id = activeApp?.id || '';
      testData.activeApp.key = _.get(activeApp, 'key', '');
      appIdSet.add(testData.activeApp.id);

      // create engine and deploy engine
      const engine1 = await createAndDeployEngine(
        {
          name: testData.engine1.name,
          categoryId: testData.engine1.categoryId,
          deploymentModel: 'FullyNetworkIsolated'
        },
        testData.adminOptions
      );
      expect(engine1).toBeDefined();
      testData.engine1.id = engine1?.id || '';
      engineIdSet.add(testData.engine1.id);

      if (isEnableInternalEngineDeploymentTest) {
        // create engine and deploy engine using orgless token
        const engineOrgless = await createAndDeployEngine(
          {
            name: testData.engineOrgless.name,
            categoryId: testData.engineOrgless.categoryId,
            deploymentModel: 'FullyNetworkIsolated'
          },
          testData.adminOptions,
          true
        );
        expect(engineOrgless).toBeDefined();
        testData.engineOrgless.id = engineOrgless?.id || '';
        engineIdSet.add(testData.engineOrgless.id);
      }
    });

    describe('create package', () => {
      it('get auto created package for application should success', async () => {
        const packageRes = await sdkClient.sdk.queryPackages({
          resourceId: testData.activeApp.id
        });

        const packageData = _.get(packageRes, 'data.packages.records[0]');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);
        expect(packageData?.status).toEqual('published');
        expect(packageData?.distributionType).toEqual('private');
        const app = _.get(packageData, 'resources.records')?.find(
          (res: any) => res.resourceId === testData.activeApp.id
        );
        expect(app).toBeDefined();
      });

      it('get auto created package for engine should success', async () => {
        const packageRes = await sdkClient.sdk.queryPackages({
          resourceId: testData.engine1.id
        });

        const packageData = _.get(packageRes, 'data.packages.records[0]');
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData?.id || '';
        packageIdSet.add(testData.enginePackage.id);
        expect(packageData?.status).toEqual('published');
        expect(packageData?.distributionType).toEqual('private');
        const resources = _.get(packageData, 'resources.records');

        const engine = resources?.find(
          (res: any) => res.resourceId === testData.engine1.id
        );
        expect(engine).toBeDefined();

        const enginBuild = resources?.find(
          (res: any) => res.resourceType === 'engineBuild'
        );
        expect(enginBuild).toBeDefined();
      });

      itif(
        isEnableInternalEngineDeploymentTest,
        'get auto created package for engine that was deployed via internal orgless token should success',
        async () => {
          const packageRes = await sdkClient.sdk.queryPackages({
            resourceId: testData.engineOrgless.id
          });

          const packageData = _.get(packageRes, 'data.packages.records[0]');
          expect(packageData).toBeDefined();
          testData.enginePackageOrgless.id = packageData?.id || '';
          packageIdSet.add(testData.enginePackageOrgless.id);
          expect(packageData?.status).toEqual('published');
          expect(packageData?.distributionType).toEqual('private');
          const resources = _.get(packageData, 'resources.records');

          const engine = resources?.find(
            (res: any) => res.resourceId === testData.engineOrgless.id
          );
          expect(engine).toBeDefined();

          const engineBuild = resources?.find(
            (res: any) => res.resourceType === 'engineBuild'
          );
          expect(engineBuild).toBeDefined();
        }
      );

      it('create package using created application as primary resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.appPackage.name,
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.activeApp.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeApp.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });

      it('create package using created engine as primary resource should fail', async () => {
        const createPackageRes = sdkClient.sdk.packageCreate(
          {
            input: {
              name: testData.appPackage.name,
              distributionType: EngineDistributionType.Public,
              primaryResourceId: testData.engine1.id,
              resources: [
                {
                  resourceType: PackageResourceType.Engine,
                  resourceId: testData.engine1.id,
                  action: PackageResourceAction.Add
                }
              ],
              version: '1.0.0'
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });
    });

    describe('update package', () => {
      it('remove primary resource from resource list should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.appPackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.activeApp.id,
                action: PackageResourceAction.Remove
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Please provide a new valid primary resource ID if you wish to remove the resource/
        );
      });

      it('remove primary resource from auto package should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: ''
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Directly editing the primaryResourceId field of an automatically generated package is prohibited/
        );
      });

      xit('add draft resource to package using packageUpdate should fail', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraft.name,
            description: ''
          },
          testData.adminOptions
        );

        testData.appDraft.id = newDraftApp?.id || '';
        appIdSet.add(testData.appDraft.id);

        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.appDraft.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      xit('add draft resource to package using packageUpdateResources should fail', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.appDraft.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      it('add published resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Engine,
                  resourceId: testData.engine1.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        testData.appPackage.id = appPackage?.id || '';
        packageIdSet.add(testData.appPackage.id);
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.find((res: any) => res.resourceId === testData.engine1.id)
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.activeApp.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        testData.enginePackage.id = packageData?.id || '';
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.find(
            (res: any) => res.resourceId === testData.activeApp.id
          )
        ).toBeDefined();
      });

      it('add duplicate resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Application,
                  resourceId: testData.activeApp.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        testData.appPackage.id = appPackage?.id || '';
        packageIdSet.add(testData.appPackage.id);

        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.filter(
            (res: any) => res.resourceId === testData.activeApp.id
          ).length
        ).toEqual(1);
      });

      it('add duplicate resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.activeApp.id,
                action: PackageResourceAction.Add
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        testData.enginePackage.id = packageData?.id || '';
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData).toBeDefined();
        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.filter(
            (res: any) => res.resourceId === testData.activeApp.id
          ).length
        ).toEqual(1);
      });

      it('remove resource from package using packageUpdate should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: PackageResourceType.Engine,
                  resourceId: testData.engine1.id,
                  action: PackageResourceAction.Remove
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const appPackage = _.get(updatePackageRes, 'data.packageUpdate');
        expect(appPackage).toBeDefined();
        testData.appPackage.id = appPackage?.id || '';
        packageIdSet.add(testData.appPackage.id);
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources?.find((res: any) => res.resourceId === testData.engine1.id)
        ).toEqual(undefined);
      });

      it('remove resource from package using packageUpdateResources should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdateResources(
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: PackageResourceType.Application,
                resourceId: testData.activeApp.id,
                action: PackageResourceAction.Remove
              }
            ]
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(
          updatePackageRes,
          'data.packageUpdateResources'
        );
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData?.id || '';
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData?.resources?.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources?.find(
            (res: any) => res.resourceId === testData.activeApp.id
          )
        ).toEqual(undefined);
      });

      it('cannot change primary resource of auto package', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.engine1.id,
              resources: [
                {
                  resourceType: PackageResourceType.Engine,
                  resourceId: testData.engine1.id,
                  action: PackageResourceAction.Add
                }
              ]
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Directly editing the primaryResourceId field of an automatically generated package is prohibited/
        );
      });

      it('update package status should success', async () => {
        const updatePackageRes = await sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Approved
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const packageData = _.get(updatePackageRes, 'data.packageUpdate');
        expect(packageData?.status).toEqual('approved');
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);
      });

      it('update application status also update package status', async () => {
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${testData.activeApp.id}"
              action: disable
            })  {
              id
              status
              }
            }
          `;
        const result = await sdkClient.sdk.applicationWorkflow(
          {
            input: {
              id: testData.activeApp.id,
              action: ApplicationWorkflowAction.Disable
            }
          },
          getRequestHeaders(testData.adminOptions)
        );
        const applicationWorkflow = _.get(result, 'data.applicationWorkflow');
        expect(applicationWorkflow?.id).toEqual(testData.activeApp.id);
        expect(applicationWorkflow?.status).toEqual('disabled');

        const updatePackageRes = await sdkClient.sdk.queryPackages({
          id: testData.appPackage.id
        });

        const packageData = _.get(updatePackageRes, 'data.packages.records[0]');
        expect(packageData?.status).toEqual('deactivated');
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);
      });

      it('publish package when app is disabled should fail', async () => {
        const updatePackageRes = sdkClient.sdk.packageUpdate(
          {
            input: {
              id: testData.appPackage.id,
              status: PackageStatus.Published
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        await expect(updatePackageRes).rejects.toThrow(
          /The request input did not pass validation checks/
        );
      });

      it('published package by published application should success', async () => {
        await sdkClient.sdk.applicationWorkflow(
          {
            input: {
              id: testData.activeApp.id,
              action: ApplicationWorkflowAction.Enable
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const result = await sdkClient.sdk.applicationWorkflow(
          {
            input: {
              id: testData.activeApp.id,
              action: ApplicationWorkflowAction.Deploy
            }
          },
          getRequestHeaders(testData.adminOptions)
        );

        const applicationWorkflow = _.get(result, 'data.applicationWorkflow');
        expect(applicationWorkflow?.id).toEqual(testData.activeApp.id);
        expect(applicationWorkflow?.status).toEqual('active');

        const updatePackageRes = await sdkClient.sdk.queryPackages({
          id: testData.appPackage.id
        });

        const packageData = _.get(updatePackageRes, 'data.packages.records[0]');
        expect(packageData?.status).toEqual('published');
        testData.appPackage.id = packageData?.id || '';
        packageIdSet.add(testData.appPackage.id);
      });
    });

    describe('grant package', () => {
      xit('grant published public package to deleted org should fail', async () => {
        const getDeletedOrgRes = await sdkClient.sdk.organizations({
          status: OrganizationStatus.Deleted,
          limit: 1
        });

        const orgData = _.get(
          getDeletedOrgRes,
          'data.organizations.records[0]'
        );

        const grantRes = sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: orgData?.id || '',
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        await expect(grantRes).rejects.toThrow();
      });

      it('grant published public package to active org should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Grant,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();

        const listGrantRes = await sdkClient.sdk.packageGrants(
          {
            id: testData.appPackage.id
          },
          getRequestHeaders(testData.adminOptions)
        );

        const listGrantData = _.get(listGrantRes, 'data.packageGrants.records');
        expect(listGrantData?.length).toEqual(1);
      });

      it('change package grant type VIEW should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.View,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('change package grant type DENY should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Deny,
                action: PackageGrantAction.Add
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove package grant should success', async () => {
        const grantRes = await sdkClient.sdk.packageUpdateGrants({
          input: {
            packageId: testData.appPackage.id,
            packageGrants: [
              {
                organizationId: testData.org1.id,
                grantType: PackageGrantType.Deny,
                action: PackageGrantAction.Remove
              }
            ]
          }
        });

        const grantData = _.get(grantRes, 'data.packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete package should success', async () => {
        await safe(`delete package ${testData.appPackage.id}`, () =>
          sdkClient.sdk.packageDelete(
            { id: testData.appPackage.id },
            getRequestHeaders(testData.adminOptions)
          )
        );
        packageIdSet.delete(testData.appPackage.id);

        await safe(`delete package ${testData.enginePackage.id}`, () =>
          sdkClient.sdk.packageDelete(
            { id: testData.enginePackage.id },
            getRequestHeaders(testData.adminOptions)
          )
        );
        packageIdSet.delete(testData.enginePackage.id);

        if (isEnableInternalEngineDeploymentTest) {
          await safe(`delete package ${testData.enginePackageOrgless.id}`, () =>
            sdkClient.sdk.packageDelete(
              { id: testData.enginePackageOrgless.id },
              getRequestHeaders(testData.adminOptions)
            )
          );
          packageIdSet.delete(testData.enginePackageOrgless.id);
        }
      });
    });

    afterAll(async () => {
      // fallback: delete any package left over if an earlier assertion
      // threw before the in-test delete step ran
      for (const id of packageIdSet) {
        await safe(`delete package ${id}`, () =>
          sdkClient.sdk.packageDelete(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      packageIdSet.clear();

      // delete apps
      for (const id of appIdSet) {
        await safe(`delete app ${id}`, () =>
          sdkClient.sdk.deleteApplication(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      appIdSet.clear();

      // delete engines
      for (const id of engineIdSet) {
        await safe(`delete engine ${id}`, () =>
          sdkClient.sdk.deleteEngine(
            { id },
            getRequestHeaders(testData.adminOptions)
          )
        );
      }
      engineIdSet.clear();

      // delete user
      if (testData.org1.adminId) {
        await safe(`delete user ${testData.org1.adminId}`, () =>
          sdkClient.sdk.deleteUser({ id: testData.org1.adminId })
        );
      }

      // delete org
      if (testData.org1.id) {
        await safe(`disable RBAC org ${testData.org1.id}`, () =>
          sdkClient.sdk.updateOrganization(
            {
              input: {
                id: testData.org1.id,
                metadata: {
                  features: {
                    enableRBACFeature: 'disabled'
                  }
                }
              }
            },
            getRequestHeaders(superAdmin.option)
          )
        );
        await safe(`delete org ${testData.org1.id}`, () =>
          sdkClient.sdk.updateOrganization(
            {
              input: {
                id: testData.org1.id,
                status: OrganizationStatus.Deleted
              }
            },
            getRequestHeaders(superAdmin.option)
          )
        );
      }
    });
  });
});

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
  testData.authGroupId = _.get(authGroupCreate, 'id');
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
  testData.authPermissionId = _.get(authPermissionSet, 'id');
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

async function createDraftApp(input: any, adminOptions: any) {
  const createDraftAppRes = await sdkClient.sdk.createApplication(
    {
      input: {
        ...input,
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
  return appDraft;
}

async function deployApp(appid: string, adminOptions: any) {
  const actionAndStatusList = [
    [ApplicationWorkflowAction.Submit, 'pending'],
    [ApplicationWorkflowAction.Approve, 'approved'],
    [ApplicationWorkflowAction.Deploy, 'active']
  ];

  for (let action of actionAndStatusList) {
    const result = await sdkClient.sdk.applicationWorkflow(
      {
        input: {
          id: appid,
          action: action[0] as ApplicationWorkflowAction
        }
      },
      getRequestHeaders(adminOptions)
    );

    const applicationWorkflowData = _.get(result, 'data.applicationWorkflow');
    expect(applicationWorkflowData?.id).toEqual(appid);
    expect(applicationWorkflowData?.status).toEqual(action[1]);
  }

  return appid;
}

async function createAndDeployApp(input: any, adminOptions: any) {
  const app = await createDraftApp(input, adminOptions);
  await deployApp(app?.id || '', adminOptions);
  return app;
}

async function createAndDeployEngine(
  input: any,
  adminOptions: any,
  deployEngineUsingOrglessToken: boolean = false
) {
  const createEngineRes = await sdkClient.sdk.createEngine(
    {
      input: { ...input }
    },
    getRequestHeaders(adminOptions)
  );

  const engine1 = _.get(createEngineRes, 'data.createEngine');
  expect(engine1).toBeDefined();

  // create engine build
  const engineBuildRes = await sdkClient.sdk.createEngineBuild(
    {
      input: {
        engineId: engine1?.id || '',
        taskRuntime: { nodeRed: true },
        manifest: { runtime: 'NodeRed' }
      }
    },
    getRequestHeaders(adminOptions)
  );

  const engineBuild = _.get(engineBuildRes, 'data.createEngineBuild');

  const buildActionList = [
    ['submit', 'approved'],
    ['deploy', 'deployed']
  ];

  // deploy engine
  for (let action of buildActionList) {
    let updateBuildRes;
    const updateBuildVars = {
      id: engineBuild?.id,
      engineId: engine1?.id,
      action: action[0] as BuildUpdateAction
    };
    if (deployEngineUsingOrglessToken && action[0] === 'deploy') {
      const OrglessOptions = helpers.requestOptions(
        config.apiInternalEngineDeploymentToken
      );
      updateBuildRes = await sdkClient.sdk.updateEngineBuild(
        { input: updateBuildVars as any },
        getRequestHeaders(OrglessOptions)
      );
    } else {
      updateBuildRes = await sdkClient.sdk.updateEngineBuild(
        {
          input: updateBuildVars as any
        },
        getRequestHeaders(adminOptions)
      );
    }

    const updateBuild = _.get(updateBuildRes, 'data.updateEngineBuild');
    expect(updateBuild?.id).toEqual(engineBuild?.id);
    expect(updateBuild?.status).toEqual(action[1]);
  }

  return engine1;
}
