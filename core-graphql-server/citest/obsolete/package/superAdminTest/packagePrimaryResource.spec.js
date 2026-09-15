const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const GraphqlClient = require('../../helpers/gql');
const {
  createPackageQuery,
  deletePackageQuery,
  getPackageByIdQuery,
  grantPackageQuery,
  meGql,
  queryGrant,
  updatePackageQuery,
  updatePackageResourcesQuery,
  createOrgQuery,
  createAppQuery,
  createEngineQuery,
  createEngineBuildQuery,
  updateBuildQuery,
  createUserQuery,
  deleteAppQuery,
  deleteEngineQuery,
  getPackages,
  changeAppStatusQuery
} = require('../packageCommonQuery');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const chakram = require('chakram');
const { safe } = require('../../helpers/cleanup/utils');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isEnablePackageGrantLogic = global.enablePackageGrantLogic;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const env = config.env;
let gqlClient = new GraphqlClient(env);

const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const superAdmin = {
  token: '',
  orgId: '',
  option: {}
};

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

console.log(
  '>> Run CI Test with enablePackageGrantLogic = ',
  isEnablePackageGrantLogic
);

const defaultTestData = () => ({
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
    name: global.orgMarker.package + '-' + uuid.v4(),
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
});
let engineCategoryId;

let testData = defaultTestData();
const packageIdSet = new Set();
const appIdSet = new Set();
const engineIdSet = new Set();

describe('citest_package: package primary resource', () => {
  beforeAll(async () => {
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superAdmin.token = result.token;
    superAdmin.option = helpers.requestOptions(superAdmin.token);

    result = await gqlClient.query(meGql);
    expect(result.me).toBeDefined();
    superAdmin.orgId = _.get(result, 'me.organization.id');

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
    const categoryRes = await gqlClient.query(query);
    const engineCategories = _.get(categoryRes, 'engineCategories');

    expect(engineCategories).toBeDefined();
    expect(engineCategories.count).toEqual(1);
    expect(engineCategories.records).toHaveLength(1);
    expect(_.get(engineCategories, 'records[0].id')).toBeDefined();
    engineCategoryId = _.get(engineCategories, 'records[0].id');
    expect(engineCategoryId).toBeDefined();
    testData.engine1.categoryId = engineCategoryId;
    testData.engineOrgless.categoryId = engineCategoryId;
  });

  describe('org with automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // create org and admin user with automaticPackageCreation = false
      const newOrgRes = await gqlClient.query(createOrgQuery, {
        name: testData.org1.name,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
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
        ].filter((app) => app),
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'createOrganization');
      expect(newOrg.id).toBeDefined();
      testData.org1.id = newOrg.id;
      testData.org1.guid = newOrg.guid;

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-user-' + uuid.v4(),
        organizationId: newOrg.id,
        roleIds: roleIds
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(newOrg.id);
      testData.org1.adminId = newUserData.id;

      testData.adminOptions = await impersonate(
        newUserData.id,
        newOrg.guid,
        superAdmin.token
      );

      const userInfoRes = await gqlClient.query(
        meGql,
        {},
        testData.adminOptions
      );

      const userOrgInfo = {
        orgGuid: _.get(userInfoRes, 'me.organization.guid'),
        orgId: _.get(userInfoRes, 'me.organization.id'),
        orgName: _.get(userInfoRes, 'me.organization.name'),
        userId: _.get(userInfoRes, 'me.id'),
        userName: _.get(userInfoRes, 'me.name'),
        isOLPEnabled:
          _.get(
            userInfoRes,
            'me.organization.jsondata.features.enableRBACFeature'
          ) === 'enabled'
      };

      await setOLPPermissions(userOrgInfo);

      // re-login to reset permission
      testData.adminOptions = await impersonate(
        newUserData.id,
        newOrg.guid,
        superAdmin.token
      );

      // create and deploy application
      const activeApp = await createAndDeployApp(
        {
          name: testData.activeApp.name,
          description: testData.activeApp.description
        },
        testData.adminOptions
      );
      testData.activeApp.id = activeApp.id;
      testData.activeApp.key = activeApp.key;
      appIdSet.add(testData.activeApp.id);

      // create application draft
      const appDraft = await createDraftApp(
        {
          name: testData.appDraft.name,
          description: testData.appDraft.description
        },
        testData.adminOptions
      );
      testData.appDraft.id = appDraft.id;
      testData.appDraft.key = appDraft.key;
      appIdSet.add(testData.appDraft.id);

      // create private resource for veritone org
      const createPrivatePackRes = await gqlClient.query(createPackageQuery, {
        name: testData.privatePack.name,
        distributionType: testData.privatePack.distributionType,
        resources: []
      });
      const privatePack = _.get(createPrivatePackRes, 'packageCreate');
      expect(privatePack).toBeDefined();
      testData.privatePack.id = privatePack.id;
      expect(privatePack.organization.id).not.toEqual(testData.org1.id);

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
      testData.engine1.id = engine1.id;
      engineIdSet.add(testData.engine1.id);
    });

    describe('create package', () => {
      it('create package using created application as primary resource should success', async () => {
        const createPackageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: testData.appPackage.name,
            distributionType: 'public',
            primaryResourceId: testData.activeApp.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(createPackageRes, 'packageCreate');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);

        expect(packageData.primaryResourceId).toEqual(testData.activeApp.id);
        expect(packageData.name).toEqual(testData.appPackage.name);
        expect(packageData.organization.id).toEqual(testData.org1.id);
        expect(packageData.resources.records.length).toEqual(1);
      });

      it('create package using created engine as primary resource should success', async () => {
        const createPackageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: testData.enginePackage.name,
            distributionType: 'public',
            primaryResourceId: testData.engine1.id,
            resources: [
              {
                resourceType: 'engine',
                resourceId: testData.engine1.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(createPackageRes, 'packageCreate');
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData.id;
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData.primaryResourceId).toEqual(testData.engine1.id);
        expect(packageData.name).toEqual(testData.enginePackage.name);
        expect(packageData.organization.id).toEqual(testData.org1.id);
        // engine + engineBuild resources
        expect(packageData.resources.records.length).toEqual(2);
      });

      it('create another package using application as primary resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: testData.appPackage.name + 'should-fail',
            distributionType: 'public',
            primaryResourceId: testData.activeApp.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });

      it('create package using not published resource as primary resource should success', async () => {
        const createPackageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: testData.draftPackage.name,
            distributionType: 'public',
            primaryResourceId: testData.appDraft.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageWithDraftResource = _.get(
          createPackageRes,
          'packageCreate'
        );
        expect(packageWithDraftResource.primaryResourceId).toEqual(
          testData.appDraft.id
        );
        expect(
          _.get(packageWithDraftResource, 'resources.records.length')
        ).toEqual(1);
        expect(packageWithDraftResource.organization.id).toEqual(
          testData.org1.id
        );
        testData.draftPackage.id = packageWithDraftResource.id;
        packageIdSet.add(testData.draftPackage.id);

        // const packRes = await gqlClient.query(getPackageByIdQuery, {
        //   id: testData.draftPackage.id
        // });

        // console.log(384, packRes.packages);
      });

      xit('create package using private resource of other org as primary resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: testData.appPackage.name + 'should-fail',
            distributionType: 'public',
            primaryResourceId: testData.privatePack.id,
            resources: [
              {
                resourceType: 'package',
                resourceId: testData.privatePack.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(createPackageRes).rejects.toThrow();
      });

      // it('create package using owned private resource as primary resource should success', async () => {});
    });

    describe('update package', () => {
      it('change primary resource to not added resource should fail', async () => {
        const updatePackagePrimaryRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.engine1.id
            }
          },
          testData.adminOptions
        );

        await expect(updatePackagePrimaryRes).rejects.toThrow(
          /primary resource ID provided does not match any of the resources in the package/
        );
      });

      it('change primary resource to not unique primary resource should fail', async () => {
        const updatePackagePrimaryRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.appDraft.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.appDraft.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        await expect(updatePackagePrimaryRes).rejects.toThrow(
          /violates exclusion constraint/
        );
      });

      it('add draft resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.appDraft.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.find(
            (res) =>
              res.resourceType === 'application' &&
              res.resourceId === testData.appDraft.id
          )
        ).toBeDefined();
      });

      it('add draft resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.find(
            (res) =>
              res.resourceType === 'application' &&
              res.resourceId === testData.appDraft.id
          )
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.draftPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.activeApp.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.activeApp.id)
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.draftPackage.id,
            resources: [
              {
                resourceType: 'engine',
                resourceId: testData.engine1.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.engine1.id)
        ).toBeDefined();
      });

      it('add duplicate resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.appDraft.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.filter((res) => res.resourceId === testData.appDraft.id)
            .length
        ).toEqual(1);
      });

      it('add duplicate resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.filter((res) => res.resourceId === testData.appDraft.id)
            .length
        ).toEqual(1);
      });

      it('remove resource from package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.appDraft.id,
                  action: 'REMOVE'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.appDraft.id)
        ).toEqual(undefined);
      });

      it('remove resource from package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'REMOVE'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.appDraft.id)
        ).toEqual(undefined);
      });

      it('add and change primary resource to current adding resource should success', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraftSwitchTest.name,
            description: testData.appDraftSwitchTest.description
          },
          testData.adminOptions
        );

        testData.appDraftSwitchTest.id = newDraftApp.id;
        testData.appDraftSwitchTest.key = newDraftApp.key;
        appIdSet.add(testData.appDraftSwitchTest.id);

        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.draftPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: newDraftApp.id,
                  action: 'ADD'
                }
              ],
              primaryResourceId: newDraftApp.id
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData.primaryResource.resourceId).toEqual(newDraftApp.id);
      });

      it('remove primary resource from resource list should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'engine',
                resourceId: testData.engine1.id,
                action: 'REMOVE'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Please provide a new valid primary resource ID if you wish to remove the resource/
        );
      });

      it('remove primary resource should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.enginePackage.id,
              primaryResourceId: ''
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData.primaryResourceId).toEqual(undefined);
      });

      it('update package info should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.enginePackage.id,
              description: 'ci test'
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData.description).toEqual('ci test');
      });

      it('change package status to approve with not published primary resource should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.draftPackage.id,
              status: 'approved'
            }
          },
          testData.adminOptions
        );

        // await expect(updatePackageRes).rejects.toThrow();
        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('approved');
      });

      it('change package status to approve with published primary resource should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'approved'
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('approved');
      });

      it('change package status to published with not published primary resource should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.draftPackage.id,
              status: 'published'
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /The request input did not pass validation checks/
        );
      });

      it('change package status to published with published primary resource should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'published'
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('published');
      });

      it('change package status to deactive should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'deactivated'
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('deactivated');
      });

      it('change package status to published again should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'published'
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('published');
      });

      it('change primary resource to added published resource should success', async () => {
        const newDeployedApp = await createAndDeployApp(
          {
            name: testData.activeAppSwitch.name,
            description: testData.activeAppSwitch.description
          },
          testData.adminOptions
        );

        testData.activeAppSwitch.id = newDeployedApp.id;
        testData.activeAppSwitch.key = newDeployedApp.key;
        appIdSet.add(testData.activeAppSwitch.id);

        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: newDeployedApp.id,
                  action: 'ADD'
                }
              ],
              primaryResourceId: newDeployedApp.id
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        expect(appPackage.status).toEqual('published');
        expect(appPackage.primaryResource.resourceId).toEqual(
          newDeployedApp.id
        );
        testData.appPackage.id = appPackage.id;
        packageIdSet.add(testData.appPackage.id);
      });

      xit('change primary resource to added not published resource should fail', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraftSwitch.name,
            description: testData.appDraftSwitch.description
          },
          testData.adminOptions
        );

        testData.appDraftSwitch.id = newDraftApp.id;
        testData.appDraftSwitch.key = newDraftApp.key;
        appIdSet.add(testData.appDraftSwitch.id);

        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: newDraftApp.id,
                  action: 'ADD'
                }
              ],
              primaryResourceId: newDraftApp.id
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      it('update published package should also update package version', async () => {
        let appPackageRes = await gqlClient.query(getPackageByIdQuery, {
          id: testData.appPackage.id
        });

        const oldVersion = _.get(appPackageRes, 'packages.records[0].version');

        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.activeApp.id
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);

        appPackageRes = await gqlClient.query(getPackageByIdQuery, {
          id: testData.appPackage.id
        });

        const newVersion = _.get(appPackageRes, 'packages.records[0].version');

        expect(+newVersion.split('.')[0]).toBeGreaterThan(
          +oldVersion.split('.')[0]
        );
      });

      it('change primary resource to primary resource of old version of other package should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.enginePackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.activeAppSwitch.id,
                  action: 'ADD'
                }
              ],
              primaryResourceId: testData.activeAppSwitch.id
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /violates exclusion constraint/
        );
      });
    });

    describe('grant package', () => {
      xit('grant published public package to deleted org should fail', async () => {
        const getDeletedOrgRes = await gqlClient.query(`
          query org {
            organizations (status: deleted, limit: 1) {
              records {
                id
              }
            }
          }`);

        const orgData = _.get(getDeletedOrgRes, 'organizations.records[0]');

        const grantRes = gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        });

        await expect(grantRes).rejects.toThrow();
      });

      it('grant published public package to active org should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();

        const listGrantRes = await gqlClient.query(
          queryGrant,
          { id: testData.appPackage.id },
          testData.adminOptions
        );

        const listGrantData = _.get(listGrantRes, 'packageGrants.records', []);
        const grant = listGrantData.find(
          (rec) => rec.organization.id === testData.org1.id
        );

        expect(grant).toBeDefined();
        expect(grant.grantType).toEqual('GRANT');
      });

      it('change shared public package to private should remove grant', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              distributionType: 'private'
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData).toBeDefined();
        expect(packageData.distributionType).toEqual('private');
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);

        const listGrantRes = await gqlClient.query(
          queryGrant,
          { id: testData.appPackage.id },
          testData.adminOptions
        );

        const grantData = _.get(listGrantRes, 'packageGrants.records');
        expect(grantData.length).toEqual(0);
      });

      it('get package grant should success', async () => {
        const listGrantRes = await gqlClient.query(
          queryGrant,
          { id: testData.appPackage.id },
          testData.adminOptions
        );

        const grantData = _.get(listGrantRes, 'packageGrants.records');
        expect(grantData).toBeDefined();
      });

      xit('grant private package to other org should fail', async () => {
        const getDeletedOrgRes = await gqlClient.query(`
          query org {
            organizations (status: active, limit: 1) {
              records {
                id
              }
            }
          }`);

        const orgData = _.get(getDeletedOrgRes, 'organizations.records[0]');

        const grantRes = gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        });

        await expect(grantRes).rejects.toThrow(
          /One or more of the permission sets do not exist/
        );
      });

      it('change package grant type VIEW should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('change package grant type DENY should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'DENY',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove package grant should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'DENY',
              action: 'REMOVE'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete package should success', async () => {
        await Promise.all([
          gqlClient.query(deletePackageQuery, { id: testData.privatePack.id }),
          gqlClient.query(
            deletePackageQuery,
            { id: testData.enginePackage.id },
            testData.adminOptions
          ),
          gqlClient.query(
            deletePackageQuery,
            { id: testData.draftPackage.id },
            testData.adminOptions
          ),
          gqlClient.query(
            deletePackageQuery,
            { id: testData.appPackage.id },
            testData.adminOptions
          )
        ]);

        packageIdSet.delete(testData.enginePackage.id);
        packageIdSet.delete(testData.draftPackage.id);
        packageIdSet.delete(testData.appPackage.id);
        testData.privatePack.id = null;
      });
    });

    afterAll(async () => {
      // delete package
      if (testData.privatePack.id) {
        await safe(`delete package testData.privatePack.id`, async () =>
          gqlClient.query(deletePackageQuery, { id: testData.privatePack.id })
        );
      }

      if (packageIdSet.size) {
        for (const packageId of packageIdSet) {
          await safe(`delete package ${packageId}`, async () =>
            gqlClient.query(
              deletePackageQuery,
              { id: packageId },
              testData.adminOptions
            )
          );
          packageIdSet.delete(packageId);
        }
      }

      // delete resource
      // delete app
      if (appIdSet.size) {
        for (const id of appIdSet) {
          await safe(`delete app ${id}`, async () =>
            gqlClient.query(deleteAppQuery, { id }, testData.adminOptions)
          );

          appIdSet.delete(id);
        }
      }

      // delete engine
      if (engineIdSet.size) {
        for (const id of engineIdSet) {
          await safe(`delete engine ${id}`, async () =>
            gqlClient.query(
              deleteEngineQuery,
              { id: id },
              testData.adminOptions
            )
          );

          engineIdSet.delete(id);
        }
      }

      // delete user
      if (testData.org1.adminId) {
        const query = `mutation {
              deleteUser(id: "${testData.org1.adminId}")  {
                id
              }
            }`;
        await safe(`delete user ${testData.org1.adminId}`, async () =>
          gqlClient.query(query)
        );
      }

      // delete org
      if (testData.org1.id) {
        await safe(`disable RBAC org ${testData.org1.id}`, async () =>
          orgHelpers.modifyRBACFeature(
            { gqlClient, options: superAdmin.option },
            testData.org1.id,
            'disabled'
          )
        );

        await safe(`delete org ${testData.org1.id}`, async () =>
          orgHelpers.deleteOrganization(
            { gqlClient, options: superAdmin.option },
            testData.org1.id
          )
        );
      }
    });
  });

  describe('org with automaticPackageCreation = true', () => {
    beforeAll(async () => {
      testData = defaultTestData();
      testData.engine1.categoryId = engineCategoryId;
      testData.engineOrgless.categoryId = engineCategoryId;
      // create org with automaticPackageCreation = true
      const newOrgRes = await gqlClient.query(createOrgQuery, {
        name: testData.org1.name,
        businessUnit: 'Legal',
        types: ['agency', 'broadcaster'],
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
        ].filter((app) => app),
        kvp: {
          features: {
            enableRBACFeature: 'enabled',
            automaticPackageCreation: 'enabled'
          }
        }
      });

      const newOrg = _.get(newOrgRes, 'createOrganization');
      expect(newOrg.id).toBeDefined();
      testData.org1.id = newOrg.id;
      testData.org1.guid = newOrg.guid;

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-user-' + uuid.v4(),
        organizationId: newOrg.id,
        roleIds: roleIds
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(newOrg.id);
      testData.org1.adminId = newUserData.id;

      testData.adminOptions = await impersonate(
        newUserData.id,
        newOrg.guid,
        superAdmin.token
      );

      const userInfoRes = await gqlClient.query(
        meGql,
        {},
        testData.adminOptions
      );

      const userOrgInfo = {
        orgGuid: _.get(userInfoRes, 'me.organization.guid'),
        orgId: _.get(userInfoRes, 'me.organization.id'),
        orgName: _.get(userInfoRes, 'me.organization.name'),
        userId: _.get(userInfoRes, 'me.id'),
        userName: _.get(userInfoRes, 'me.name'),
        isOLPEnabled:
          _.get(
            userInfoRes,
            'me.organization.jsondata.features.enableRBACFeature'
          ) === 'enabled'
      };

      await setOLPPermissions(userOrgInfo);

      // re-login to reset permission
      testData.adminOptions = await impersonate(
        newUserData.id,
        newOrg.guid,
        superAdmin.token
      );

      // create and deploy application
      const activeApp = await createAndDeployApp(
        {
          name: testData.activeApp.name,
          description: testData.activeApp.description
        },
        testData.adminOptions
      );
      testData.activeApp.id = activeApp.id;
      testData.activeApp.key = activeApp.key;
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
      testData.engine1.id = engine1.id;
      engineIdSet.add(testData.engine1.id);

      if (gqlClient.isEnabledInternalEngineDeploymentTest()) {
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
        testData.engineOrgless.id = engineOrgless.id;
        engineIdSet.add(testData.engineOrgless.id);
      }
    });

    describe('create package', () => {
      it('get auto created package for application should success', async () => {
        const packageRes = await gqlClient.query(getPackages, {
          resourceId: testData.activeApp.id
        });

        const packageData = _.get(packageRes, 'packages.records[0]');
        expect(packageData).toBeDefined();
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);

        expect(packageData.status).toEqual('published');
        expect(packageData.distributionType).toEqual('private');
        const app = _.get(packageData, 'resources.records').find(
          (res) => res.resourceId === testData.activeApp.id
        );
        expect(app).toBeDefined();
      });

      it('get auto created package for engine should success', async () => {
        const packageRes = await gqlClient.query(getPackages, {
          resourceId: testData.engine1.id
        });

        const packageData = _.get(packageRes, 'packages.records[0]');
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData.id;
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData.status).toEqual('published');
        expect(packageData.distributionType).toEqual('private');
        const resources = _.get(packageData, 'resources.records');

        const engine = resources.find(
          (res) => res.resourceId === testData.engine1.id
        );
        expect(engine).toBeDefined();

        const enginBuild = resources.find(
          (res) => res.resourceType === 'engineBuild'
        );
        expect(enginBuild).toBeDefined();
      });

      itif(
        gqlClient.isEnabledInternalEngineDeploymentTest(),
        'get auto created package for engine that was deployed via internal orgless token should success',
        async () => {
          const packageRes = await gqlClient.query(getPackages, {
            resourceId: testData.engineOrgless.id
          });

          const packageData = _.get(packageRes, 'packages.records[0]');
          expect(packageData).toBeDefined();
          testData.enginePackageOrgless.id = packageData.id;
          packageIdSet.add(testData.enginePackageOrgless.id);

          expect(packageData.status).toEqual('published');
          expect(packageData.distributionType).toEqual('private');
          const resources = _.get(packageData, 'resources.records');

          const engine = resources.find(
            (res) => res.resourceId === testData.engineOrgless.id
          );
          expect(engine).toBeDefined();

          const engineBuild = resources.find(
            (res) => res.resourceType === 'engineBuild'
          );
          expect(engineBuild).toBeDefined();
        }
      );

      it('create package using created application as primary resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: testData.appPackage.name,
            distributionType: 'public',
            primaryResourceId: testData.activeApp.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });

      it('create package using created engine as primary resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: testData.appPackage.name,
            distributionType: 'public',
            primaryResourceId: testData.engine1.id,
            resources: [
              {
                resourceType: 'engine',
                resourceId: testData.engine1.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(createPackageRes).rejects.toThrow(
          /Primary Resource ID must not already exist in another package lineage/
        );
      });
    });

    describe('update package', () => {
      it('remove primary resource from resource list should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.activeApp.id,
                  action: 'REMOVE'
                }
              ]
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Please provide a new valid primary resource ID if you wish to remove the resource/
        );
      });

      it('remove primary resource from auto package should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: ''
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Directly editing the primaryResourceId field of an automatically generated package is prohibited/
        );
      });

      xit('add draft resource to package using packageUpdate should fail', async () => {
        const newDraftApp = await createDraftApp(
          {
            name: testData.appDraft.name,
            description: testData.appDraft.description
          },
          testData.adminOptions
        );

        testData.appDraft.id = newDraftApp.id;
        appIdSet.add(testData.appDraft.id);

        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.appDraft.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      xit('add draft resource to package using packageUpdateResources should fail', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow();
      });

      it('add published resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'engine',
                  resourceId: testData.engine1.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        testData.appPackage.id = appPackage.id;
        packageIdSet.add(testData.appPackage.id);

        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.engine1.id)
        ).toBeDefined();
      });

      it('add published resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        testData.enginePackage.id = packageData.id;
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.activeApp.id)
        ).toBeDefined();
      });

      it('add duplicate resource to package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'application',
                  resourceId: testData.activeApp.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        testData.appPackage.id = appPackage.id;
        packageIdSet.add(testData.appPackage.id);

        expect(appPackage).toBeDefined();
        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.filter((res) => res.resourceId === testData.activeApp.id)
            .length
        ).toEqual(1);
      });

      it('add duplicate resource to package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'ADD'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        testData.enginePackage.id = packageData.id;
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData).toBeDefined();
        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.filter((res) => res.resourceId === testData.activeApp.id)
            .length
        ).toEqual(1);
      });

      it('remove resource from package using packageUpdate should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              resources: [
                {
                  resourceType: 'engine',
                  resourceId: testData.engine1.id,
                  action: 'REMOVE'
                }
              ]
            }
          },
          testData.adminOptions
        );

        const appPackage = _.get(updatePackageRes, 'packageUpdate');
        expect(appPackage).toBeDefined();
        testData.appPackage.id = appPackage.id;
        packageIdSet.add(testData.appPackage.id);

        const resources = _.get(appPackage, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.engine1.id)
        ).toEqual(undefined);
      });

      it('remove resource from package using packageUpdateResources should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: testData.enginePackage.id,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.activeApp.id,
                action: 'REMOVE'
              }
            ]
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdateResources');
        expect(packageData).toBeDefined();
        testData.enginePackage.id = packageData.id;
        packageIdSet.add(testData.enginePackage.id);

        expect(packageData.resources.records).toBeDefined();
        const resources = _.get(packageData, 'resources.records');
        expect(
          resources.find((res) => res.resourceId === testData.activeApp.id)
        ).toEqual(undefined);
      });

      it('cannot change primary resource of auto package', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              primaryResourceId: testData.engine1.id,
              resources: [
                {
                  resourceType: 'engine',
                  resourceId: testData.engine1.id,
                  action: 'ADD'
                }
              ]
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /Directly editing the primaryResourceId field of an automatically generated package is prohibited/
        );
      });

      it('update package status should success', async () => {
        const updatePackageRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'approved'
            }
          },
          testData.adminOptions
        );

        const packageData = _.get(updatePackageRes, 'packageUpdate');
        expect(packageData.status).toEqual('approved');
        testData.appPackage.id = packageData.id;
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
        const result = await gqlClient.query(query, {}, testData.adminOptions);
        expect(result.applicationWorkflow.id).toEqual(testData.activeApp.id);
        expect(result.applicationWorkflow.status).toEqual('disabled');

        const updatePackageRes = await gqlClient.query(getPackageByIdQuery, {
          id: testData.appPackage.id
        });

        const packageData = _.get(updatePackageRes, 'packages.records[0]');
        expect(packageData.status).toEqual('deactivated');
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);
      });

      it('publish package when app is disabled should fail', async () => {
        const updatePackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: testData.appPackage.id,
              status: 'published'
            }
          },
          testData.adminOptions
        );

        await expect(updatePackageRes).rejects.toThrow(
          /The request input did not pass validation checks/
        );
      });

      it('published package by published application should success', async () => {
        await gqlClient.query(
          changeAppStatusQuery,
          {
            id: testData.activeApp.id,
            action: 'enable'
          },
          testData.adminOptions
        );

        const result = await gqlClient.query(
          changeAppStatusQuery,
          {
            id: testData.activeApp.id,
            action: 'deploy'
          },
          testData.adminOptions
        );
        expect(result.applicationWorkflow.id).toEqual(testData.activeApp.id);
        expect(result.applicationWorkflow.status).toEqual('active');

        const updatePackageRes = await gqlClient.query(getPackageByIdQuery, {
          id: testData.appPackage.id
        });

        const packageData = _.get(updatePackageRes, 'packages.records[0]');
        expect(packageData.status).toEqual('published');
        testData.appPackage.id = packageData.id;
        packageIdSet.add(testData.appPackage.id);
      });
    });

    describe('grant package', () => {
      xit('grant published public package to deleted org should fail', async () => {
        const getDeletedOrgRes = await gqlClient.query(`
          query org {
            organizations (status: deleted, limit: 1) {
              records {
                id
              }
            }
          }`);

        const orgData = _.get(getDeletedOrgRes, 'organizations.records[0]');

        const grantRes = gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        });

        await expect(grantRes).rejects.toThrow();
      });

      it('grant published public package to active org should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();

        const listGrantRes = await gqlClient.query(
          queryGrant,
          { id: testData.appPackage.id },
          testData.adminOptions
        );

        const listGrantData = _.get(listGrantRes, 'packageGrants.records', []);
        const grant = listGrantData.find(
          (rec) => rec.organization.id === testData.org1.id
        );

        expect(grant).toBeDefined();
        expect(grant.grantType).toEqual('GRANT');
      });

      it('change package grant type VIEW should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('change package grant type DENY should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'DENY',
              action: 'ADD'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('remove package grant should success', async () => {
        const grantRes = await gqlClient.query(grantPackageQuery, {
          packageId: testData.appPackage.id,
          packageGrants: [
            {
              organizationId: testData.org1.id,
              grantType: 'DENY',
              action: 'REMOVE'
            }
          ]
        });

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
      });

      it('delete package should success', async () => {
        const deletePackagePromises = [
          gqlClient.query(
            deletePackageQuery,
            { id: testData.appPackage.id },
            testData.adminOptions
          ),
          gqlClient.query(
            deletePackageQuery,
            { id: testData.enginePackage.id },
            testData.adminOptions
          )
        ];

        if (gqlClient.isEnabledInternalEngineDeploymentTest()) {
          deletePackagePromises.push(
            gqlClient.query(
              deletePackageQuery,
              { id: testData.enginePackageOrgless.id },
              testData.adminOptions
            )
          );
        }

        await Promise.all(deletePackagePromises);

        packageIdSet.delete(testData.enginePackage.id);
        packageIdSet.delete(testData.appPackage.id);
        if (testData.enginePackageOrgless.id) {
          packageIdSet.delete(testData.enginePackageOrgless.id);
        }
      });
    });

    afterAll(async () => {
      // delete package
      if (packageIdSet.size) {
        for (const packageId of packageIdSet) {
          await safe(`delete package ${packageId}`, async () =>
            gqlClient.query(
              deletePackageQuery,
              { id: packageId },
              testData.adminOptions
            )
          );
        }
      }

      // delete resource
      // delete app
      if (appIdSet.size) {
        for (const id of appIdSet) {
          await safe(`delete app ${id}`, async () =>
            gqlClient.query(deleteAppQuery, { id }, testData.adminOptions)
          );

          appIdSet.delete(id);
        }
      }

      // delete engine
      if (engineIdSet.size) {
        for (const id of engineIdSet) {
          await safe(`delete engine ${id}`, async () =>
            gqlClient.query(
              deleteEngineQuery,
              { id: id },
              testData.adminOptions
            )
          );

          engineIdSet.delete(id);
        }
      }

      // delete user
      if (testData.org1.adminId) {
        const query = `mutation {
              deleteUser(id: "${testData.org1.adminId}")  {
                id
              }
            }`;
        await safe(`delete user ${testData.org1.adminId}`, async () =>
          gqlClient.query(query)
        );
      }

      // delete org
      if (testData.org1.id) {
        await safe(`disable RBAC org ${testData.org1.id}`, async () =>
          orgHelpers.modifyRBACFeature(
            { gqlClient, options: superAdmin.option },
            testData.org1.id,
            'disabled'
          )
        );

        await safe(`delete org ${testData.org1.id}`, async () =>
          orgHelpers.deleteOrganization(
            { gqlClient, options: superAdmin.option },
            testData.org1.id
          )
        );
      }
    });
  });
});

async function setOLPPermissions(orgInfo) {
  const olpObjectIds = {};

  const permissions = `
      AIWARE_SCHEMA_CREATE
      DEVELOPER_ENGINE_CREATE
      DEVELOPER_ENGINE_READ
      DEVELOPER_ENGINE_UPDATE
      DEVELOPER_ENGINE_ENABLE
      DEVELOPER_ENGINE_DELETE
      DEVELOPER_BUILD_CREATE
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

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function createDraftApp(input, adminOptions) {
  const createDraftAppRes = await gqlClient.query(
    createAppQuery,
    input,
    adminOptions
  );
  const appDraft = _.get(createDraftAppRes, 'createApplication');
  expect(appDraft.id).toBeDefined();
  return appDraft;
}

async function deployApp(appid, adminOptions) {
  const actionAndStatusList = [
    ['submit', 'pending'],
    ['approve', 'approved'],
    ['deploy', 'active']
  ];
  for (let action of actionAndStatusList) {
    const query = `
      mutation {
        applicationWorkflow(input: {
          id: "${appid}"
          action: ${action[0]}
        })  {
          id
          status
          }
        }
      `;
    const result = await gqlClient.query(query, {}, adminOptions);
    expect(result.applicationWorkflow.id).toEqual(appid);
    expect(result.applicationWorkflow.status).toEqual(action[1]);
  }

  return appid;
}

async function createAndDeployApp(input, adminOptions) {
  const app = await createDraftApp(input, adminOptions);
  await deployApp(app.id, adminOptions);
  return app;
}

async function createAndDeployEngine(
  input,
  adminOptions,
  deployEngineUsingOrglessToken = false
) {
  const createEngineRes = await gqlClient.query(
    createEngineQuery,
    input,
    adminOptions
  );
  const engine1 = _.get(createEngineRes, 'createEngine');
  expect(engine1).toBeDefined();

  // create engine build
  const engineBuildRes = await gqlClient.query(
    createEngineBuildQuery,
    {
      engineId: engine1.id
    },
    adminOptions
  );

  const engineBuild = _.get(engineBuildRes, 'createEngineBuild');

  const buildActionList = [
    ['submit', 'approved'],
    ['deploy', 'deployed']
  ];

  // deploy engine
  for (let action of buildActionList) {
    let updateBuildRes;
    const updateBuildVars = {
      buildId: engineBuild.id,
      engineId: engine1.id,
      action: action[0]
    };
    if (deployEngineUsingOrglessToken && action[0] === 'deploy') {
      updateBuildRes = await gqlClient.queryByInternalEngineDeploymentToken(
        updateBuildQuery,
        updateBuildVars
      );
    } else {
      updateBuildRes = await gqlClient.query(
        updateBuildQuery,
        updateBuildVars,
        adminOptions
      );
    }

    const updateBuild = _.get(updateBuildRes, 'updateEngineBuild');
    expect(updateBuild.id).toEqual(engineBuild.id);
    expect(updateBuild.status).toEqual(action[1]);
  }

  return engine1;
}
