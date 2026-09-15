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
  createAppQuery,
  createEngineBuildQuery,
  createEngineQuery,
  createSchemaQuery,
  schemaInput,
  createDataRegistryQuery,
  createClusterQuery,
  sourceCreateQuery,
  getSchemaByStatusQuery,
  updateBuildQuery,
  updateSchemaStateQuery,
  createAutoPaletteQuery,
  createFlowQuery,
  flowRuntime,
  createTDOQuery,
  createUserQuery,
  getPackages,
  deleteEngineQuery,
  deleteAppQuery,
  appConfigDefinitionCreateQuery
} = require('../packageCommonQuery');
const _ = require('lodash');
const uuid = require('uuid');
const moment = require('moment');
const chakram = require('chakram');
const { safe } = require('../../helpers/cleanup/utils');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isEnablePackageGrantLogic = global.enablePackageGrantLogic;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const config = helpers.config;
const env = config.env;
let gqlClient;
const options = {
  adminOption: {},
  adminToken: '',
  orgAdminOption: {},
  orgAdminId: ''
};

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

const roleIds = [
  '032218c3-d47e-4287-9d16-7bb867c01266',
  'cf2ed945-176b-4dd9-943e-22fcb1cf684f',
  '912e377e-f4a4-4184-8db1-baa9670d8081'
];

const createResourcesList = () => ({
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
  packagesToDelete: [],
  schemasToDelete: [],
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
  tdoId: ''
  // scheduledJobId: ''
});

let resourcesList = createResourcesList();

const resetTestState = () => {
  resourcesList = createResourcesList();
  orgResult = undefined;
  options.orgAdminOption = {};
  options.orgAdminId = '';
};

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
const orgMarker = global.orgMarker.package;
let orgResult;

describe('citest_package : package resources', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    options.adminOption = helpers.requestOptions(result.token);
    options.adminToken = result.token;
  });
  describe('automaticPackageCreation = false', () => {
    beforeAll(async () => {
      // Set up test organization
      resetTestState();
      orgResult = await orgHelpers.orgSetup(
        orgMarker,
        { gqlClient },
        testOrgInput
      );
      expect(orgResult).toBeDefined();
      expect(orgResult.id).toBeDefined();

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-user-' + uuid.v4(),
        organizationId: orgResult.id,
        roleIds: roleIds
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(orgResult.id);
      options.orgAdminId = newUserData.id;

      options.orgAdminOption = await impersonate(
        newUserData.id,
        orgResult.guid,
        options.adminToken
      );

      const userInfoRes = await gqlClient.query(
        meGql,
        {},
        options.orgAdminOption
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
      options.orgAdminOption = await impersonate(
        newUserData.id,
        orgResult.guid,
        options.adminToken
      );

      // create resources
      await createAllResources(options.orgAdminOption);
      // await activeAllResources(options.adminOption);
    });

    afterAll(async () => {
      // delete resources
      if (resourcesList.resources.length) {
        await commonAfterAll();
      }
    });

    describe('package with all resources type', () => {
      it('create draft package with some resources should success', async () => {
        const packageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: resourcesList.resources,
            organizationId: orgResult.id
          },
          options.orgAdminOption
        );

        expect(packageRes.packageCreate).toBeDefined();
        resourcesList.package.packageId1 = packageRes.packageCreate.id;
        resourcesList.packagesToDelete.push(resourcesList.package.packageId1);

        expect(
          _.get(packageRes, 'packageCreate.resources.records', []).length
        ).toEqual(resourcesList.resources.length);
      });

      it('create package with invalid resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [
              {
                resourceType: 'schema',
                resourceId: uuid.v4(),
                action: 'ADD'
              }
            ]
          },
          options.orgAdminOption
        );

        await expect(createPackageRes).rejects.toThrow(
          /The request input did not pass validation checks. See the data section for detail on validation errors./
        );
      });

      it('add all resources type to draft package should success', async () => {
        const packageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [],
            organizationId: orgResult.id
          },
          options.orgAdminOption
        );

        expect(packageRes.packageCreate).toBeDefined();
        resourcesList.package.packageId2 = packageRes.packageCreate.id;
        resourcesList.packagesToDelete.push(resourcesList.package.packageId2);

        expect(
          _.get(packageRes, 'packageCreate.resources.records', []).length
        ).toEqual(0);

        const addResourceRes = await gqlClient.query(
          updatePackageResourcesQuery,
          {
            packageId: resourcesList.package.packageId2,
            resources: resourcesList.resources
          },
          options.orgAdminOption
        );

        expect(addResourceRes.packageUpdateResources).toBeDefined();
        resourcesList.package.packageId2 =
          addResourceRes.packageUpdateResources.id;

        expect(
          _.get(addResourceRes, 'packageUpdateResources.resources.records', [])
            .length
        ).toEqual(resourcesList.resources.length);
      });

      it('approve package should success', async () => {
        const updateRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              status: 'approved'
            }
          },
          options.orgAdminOption
        );

        const updatedPackage = _.get(updateRes, 'packageUpdate');
        expect(updatedPackage).toBeDefined();
        expect(updatedPackage.status).toEqual('approved');

        expect(_.get(updatedPackage, 'resources.records', []).length).toEqual(
          resourcesList.resources.length
        );

        resourcesList.package.packageId1 = updatedPackage.id;
      });

      it('publish package with non-publish resource should fail', async () => {
        const updateRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              status: 'published'
            }
          },
          options.orgAdminOption
        );

        await expect(updateRes).rejects.toThrow(
          /input did not pass validation checks/
        );
      });

      it('publish non-publish resources should success and publish package should success', async () => {
        await activeAllResources(options.orgAdminOption);

        const updateRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              status: 'published'
            }
          },
          options.orgAdminOption
        );

        const updatedPackage = _.get(updateRes, 'packageUpdate');
        expect(updatedPackage).toBeDefined();
        expect(updatedPackage.status).toEqual('published');
        resourcesList.package.packageId1 = _.get(updateRes, 'packageUpdate.id');

        expect(_.get(updatedPackage, 'resources.records', []).length).toEqual(
          resourcesList.resources.length
        );
      });

      it('can not add draft resource to published package', async () => {
        // create draft schema
        const createSchemaRes = await gqlClient.query(
          createSchemaQuery,
          { schema: schemaInput, dataRegistryId: resourcesList.regId },
          options.orgAdminOption
        );
        const schemaId = _.get(createSchemaRes, 'upsertSchemaDraft').id;
        resourcesList.schemasToDelete.push(schemaId);

        const publishPackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              resources: [
                {
                  resourceId: schemaId,
                  resourceType: 'schema',
                  action: 'ADD'
                }
              ]
            }
          },
          options.orgAdminOption
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

          updateRes = await gqlClient.query(
            updatePackageQuery,
            {
              input: {
                id: resourcesList.package.packageId1,
                primaryResourceId: resource.resourceId
              }
            },
            options.orgAdminOption
          );

          resourcesList.package.packageId1 = _.get(
            updateRes,
            'packageUpdate.id'
          );
        }
      });

      it('grant package should success', async () => {
        const updateGrantRes = await gqlClient.query(
          grantPackageQuery,
          {
            packageId: resourcesList.package.packageId1,
            packageGrants: {
              organizationId: orgResult.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          },
          options.orgAdminOption
        );

        const orgGrant = _.get(updateGrantRes, 'packageUpdateGrants');
        expect(orgGrant).toBeDefined();
        expect(orgGrant.id).toEqual(resourcesList.package.packageId1);

        // check grant
        const getGrantRes = await gqlClient.query(queryGrant, {
          id: resourcesList.package.packageId1
        });

        const getGrant = _.get(getGrantRes, 'packageGrants.records');
        expect(getGrant).toBeDefined();

        const currentGrant = getGrant.find(
          (rec) => rec.organization.id == orgResult.id
        );
        expect(currentGrant).toBeDefined();
        expect(currentGrant.grantType).toEqual('VIEW');
      });

      it('remove grant package should success', async () => {
        const grantRes = await gqlClient.query(
          grantPackageQuery,
          {
            packageId: resourcesList.package.packageId1,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: 'DENY',
                action: 'REMOVE'
              }
            ]
          },
          options.orgAdminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
        expect(grantData.id).toEqual(resourcesList.package.packageId1);
      });

      it('delete package should success', async () => {
        const deletePackage1Res = await gqlClient.query(
          deletePackageQuery,
          {
            id: resourcesList.package.packageId1
          },
          options.orgAdminOption
        );
        expect(_.get(deletePackage1Res, 'packageDelete')).toBeDefined();
        expect(_.get(deletePackage1Res, 'packageDelete.success')).toEqual(true);
        resourcesList.package.packageId1 = '';

        const deletePackage2Res = await gqlClient.query(
          deletePackageQuery,
          { id: resourcesList.package.packageId2 },
          options.orgAdminOption
        );
        expect(_.get(deletePackage2Res, 'packageDelete')).toBeDefined();
        expect(_.get(deletePackage2Res, 'packageDelete.success')).toEqual(true);
        resourcesList.package.packageId2 = '';
      });
    });
  });

  describe('automaticPackageCreation = true', () => {
    beforeAll(async () => {
      // create org with automaticPackageCreation = true
      // Set up test organization
      resetTestState();
      const testAutoPackageOrgInput = _.cloneDeep(testOrgInput);
      testAutoPackageOrgInput.kvp.features.automaticPackageCreation = 'enabled';
      orgResult = await orgHelpers.orgSetup(
        orgMarker,
        { gqlClient },
        testAutoPackageOrgInput,
        true
      );
      expect(orgResult).toBeDefined();
      expect(orgResult.id).toBeDefined();

      const newUserRes = await gqlClient.query(createUserQuery, {
        name: citestMarker + '-user-' + uuid.v4(),
        organizationId: orgResult.id,
        roleIds: roleIds
      });

      const newUserData = _.get(newUserRes, 'createUser');
      expect(newUserData.organizationId).toEqual(orgResult.id);
      options.orgAdminId = newUserData.id;

      options.orgAdminOption = await impersonate(
        newUserData.id,
        orgResult.guid,
        options.adminToken
      );

      const userInfoRes = await gqlClient.query(
        meGql,
        {},
        options.orgAdminOption
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
      options.orgAdminOption = await impersonate(
        newUserData.id,
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
        await commonAfterAll();
      }
    });

    describe('package with all resources type', () => {
      it('create package resources as primary resource should fail', async () => {
        // loop through list resources to create package
        const listAutoResourcesType = ['application', 'engine'];
        const listAutoResources = resourcesList.resources.filter((res) =>
          listAutoResourcesType.includes(res.resourceType)
        );

        for (const resource of listAutoResources) {
          if (resource.resourceId.length < resourcesList.appId.length) {
            continue;
          }

          const createPackageRes = gqlClient.query(
            createPackageQuery,
            {
              name: `${citestMarker}-public-package-${uuid.v4()}`,
              distributionType: 'public',
              primaryResourceId: resource.resourceId,
              resources: [resource]
            },
            options.orgAdminOption
          );

          await expect(createPackageRes).rejects.toThrow(
            /Primary Resource ID must not already exist in another package lineage/
          );
        }
      });

      it('create package with invalid resource should fail', async () => {
        const createPackageRes = gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [
              {
                resourceType: 'schema',
                resourceId: uuid.v4(),
                action: 'ADD'
              }
            ]
          },
          options.orgAdminOption
        );

        await expect(createPackageRes).rejects.toThrow(
          /The request input did not pass validation checks. See the data section for detail on validation errors./
        );
      });

      it('get auto created package for engine should success', async () => {
        const packageRes = await gqlClient.query(
          getPackages,
          {
            resourceId: resourcesList.engineId
          },
          options.orgAdminOption
        );

        const packageData = _.get(packageRes, 'packages.records[0]');
        expect(packageData).toBeDefined();
        resourcesList.package.packageId1 = packageData.id;
        expect(packageData.status).toEqual('published');
        expect(packageData.distributionType).toEqual('private');
        const resources = _.get(packageData, 'resources.records');

        const engine = resources.find(
          (res) => res.resourceId === resourcesList.engineId
        );
        expect(engine).toBeDefined();

        const enginBuild = resources.find(
          (res) => res.resourceType === 'engineBuild'
        );
        expect(enginBuild).toBeDefined();
      });

      it('publish package with draft resources should failed', async () => {
        // create draft schema
        const createSchemaRes = await gqlClient.query(
          createSchemaQuery,
          { schema: schemaInput, dataRegistryId: resourcesList.regId },
          options.orgAdminOption
        );
        const schemaId = _.get(createSchemaRes, 'upsertSchemaDraft').id;
        resourcesList.schemasToDelete.push(schemaId);

        const packageRes = await gqlClient.query(
          createPackageQuery,
          {
            name: `${citestMarker}-public-package-${uuid.v4()}`,
            distributionType: 'public',
            resources: [],
            organizationId: orgResult.id
          },
          options.orgAdminOption
        );

        expect(packageRes.packageCreate).toBeDefined();
        const packageId = packageRes.packageCreate.id;
        resourcesList.packagesToDelete.push(packageId);

        const publishPackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: packageId,
              status: 'published',
              resources: [
                {
                  resourceId: schemaId,
                  resourceType: 'schema',
                  action: 'ADD'
                }
              ]
            }
          },
          options.adminOption
        );
        await expect(publishPackageRes).rejects.toThrow(
          /Resource is inactive. This package cannot be published until all its resources are active/
        );
      });

      it('can not add draft resource to published package', async () => {
        // create draft schema
        const createSchemaRes = await gqlClient.query(
          createSchemaQuery,
          { schema: schemaInput, dataRegistryId: resourcesList.regId },
          options.orgAdminOption
        );
        const schemaId = _.get(createSchemaRes, 'upsertSchemaDraft').id;
        resourcesList.schemasToDelete.push(schemaId);

        const publishPackageRes = gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              resources: [
                {
                  resourceId: schemaId,
                  resourceType: 'schema',
                  action: 'ADD'
                }
              ]
            }
          },
          options.orgAdminOption
        );

        await expect(publishPackageRes).rejects.toThrow(
          /Resource is inactive. This package cannot be published until all its resources are active/
        );
      });

      it('get auto created package for application should success', async () => {
        const packageRes = await gqlClient.query(
          getPackages,
          {
            resourceId: resourcesList.appId
          },
          options.orgAdminOption
        );

        const packageData = _.get(packageRes, 'packages.records').find(
          (res) => res.distributionType === 'private'
        );
        expect(packageData).toBeDefined();
        resourcesList.package.packageId2 = packageData.id;
        expect(packageData.status).toEqual('published');
        const app = _.get(packageData, 'resources.records').find(
          (res) => res.resourceId === resourcesList.appId
        );
        expect(app).toBeDefined();
        expect(packageData.distributionType).toEqual('private');
      });

      it('grant package should success', async () => {
        const updateGrantRes = await gqlClient.query(
          grantPackageQuery,
          {
            packageId: resourcesList.package.packageId1,
            packageGrants: {
              organizationId: orgResult.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          },
          options.orgAdminOption
        );

        const orgGrant = _.get(updateGrantRes, 'packageUpdateGrants');
        expect(orgGrant).toBeDefined();
        expect(orgGrant.id).toEqual(resourcesList.package.packageId1);

        // check grant
        const getGrantRes = await gqlClient.query(queryGrant, {
          id: resourcesList.package.packageId1
        });

        const getGrant = _.get(getGrantRes, 'packageGrants.records');
        expect(getGrant).toBeDefined();

        const currentGrant = getGrant.find(
          (rec) => rec.organization.id == orgResult.id
        );
        expect(currentGrant).toBeDefined();
        expect(currentGrant.grantType).toEqual('VIEW');
      });

      it('remove grant package should success', async () => {
        const grantRes = await gqlClient.query(
          grantPackageQuery,
          {
            packageId: resourcesList.package.packageId1,
            packageGrants: [
              {
                organizationId: orgResult.id,
                grantType: 'DENY',
                action: 'REMOVE'
              }
            ]
          },
          options.orgAdminOption
        );

        const grantData = _.get(grantRes, 'packageUpdateGrants');
        expect(grantData).toBeDefined();
        expect(grantData.id).toEqual(resourcesList.package.packageId1);
      });

      it('change package status not change primary resouces status', async () => {
        const updateStatusRes = await gqlClient.query(
          updatePackageQuery,
          {
            input: {
              id: resourcesList.package.packageId1,
              status: 'deactivated'
            }
          },
          options.orgAdminOption
        );

        const packageData = _.get(updateStatusRes, 'packageUpdate');
        expect(packageData.status).toEqual('deactivated');

        const appRes = await gqlClient.query(
          `query app {
            application(id: "${resourcesList.appId}") {
              id
              status
            }
          }`
        );

        const app = _.get(appRes, 'application');
        expect(app).toBeDefined();
        expect(app.status).toEqual('active');
      });

      it('change primary resources status should also change package status', async () => {
        const query = `
          mutation {
            applicationWorkflow(input: {
              id: "${resourcesList.appId}"
              action: disable
            })  {
              id
              status
              }
            }
          `;
        const result = await gqlClient.query(query, {}, options.orgAdminOption);
        expect(result.applicationWorkflow.id).toEqual(resourcesList.appId);
        expect(result.applicationWorkflow.status).toEqual('disabled');

        const updatePackageRes = await gqlClient.query(getPackageByIdQuery, {
          id: resourcesList.package.packageId2
        });

        const packageData = _.get(updatePackageRes, 'packages.records[0]');
        expect(packageData.status).toEqual('deactivated');
        resourcesList.package.packageId2 = packageData.id;
      });

      it('delete package should success', async () => {
        const deletePackage1Res = await gqlClient.query(
          deletePackageQuery,
          { id: resourcesList.package.packageId1 },
          options.orgAdminOption
        );
        expect(_.get(deletePackage1Res, 'packageDelete')).toBeDefined();
        expect(_.get(deletePackage1Res, 'packageDelete.success')).toEqual(true);
        resourcesList.package.packageId1 = '';

        const deletePackage2Res = await gqlClient.query(
          deletePackageQuery,
          { id: resourcesList.package.packageId2 },
          options.orgAdminOption
        );
        expect(_.get(deletePackage2Res, 'packageDelete')).toBeDefined();
        expect(_.get(deletePackage2Res, 'packageDelete.success')).toEqual(true);
        resourcesList.package.packageId2 = '';
      });
    });
  });
});

async function createAllResources(adminOptions) {
  // create needed data for resources
  // create data registry
  const schemaRegCreateRes = await gqlClient.query(
    createDataRegistryQuery,
    { name: citestMarker + '-reg-' + uuid.v4(), description: 'test' },
    adminOptions
  );

  const regData = _.get(schemaRegCreateRes, 'createDataRegistry');
  expect(regData).toBeDefined();
  resourcesList.regId = regData.id;

  // create cluster
  const result = await gqlClient.query(
    createClusterQuery,
    { name: citestMarker + 'cluster' + uuid.v4() },
    adminOptions
  );
  const createCluster = _.get(result, 'createCluster');
  resourcesList.clusterId = createCluster.id;

  // create new source
  const createSourceResult = await gqlClient.query(
    sourceCreateQuery,
    { name: citestMarker + '-source-' + uuid.v4() },
    adminOptions
  );
  const sourceCreate = _.get(createSourceResult, 'createSource');
  resourcesList.sourceId = sourceCreate.id;

  // get published schema
  const publishedSchemaRes = await gqlClient.query(
    getSchemaByStatusQuery,
    undefined,
    adminOptions
  );
  const publishedSchema = _.get(publishedSchemaRes, 'schemas.records[0]');
  resourcesList.publicSchemaId = publishedSchema.id;

  // create resources
  // create application
  const createDraftAppRes = await gqlClient.query(
    createAppQuery,
    {
      name: citestMarker + '-app-' + uuid.v4(),
      description: 'test',
      isPublic: true
    },
    adminOptions
  );
  const appDraft = _.get(createDraftAppRes, 'createApplication');
  expect(appDraft.id).toBeDefined();
  resourcesList.appId = appDraft.id;
  resourcesList.resources.push({
    resourceType: 'application',
    resourceId: resourcesList.appId,
    action: 'ADD'
  });

  // create engine
  const createEngineRes = await gqlClient.query(
    createEngineQuery,
    {
      name: citestMarker + '-engine-' + uuid.v4(),
      categoryId: engineCategoryId,
      deploymentModel: 'FullyNetworkIsolated'
    },
    adminOptions
  );
  const engine1 = _.get(createEngineRes, 'createEngine');
  expect(engine1).toBeDefined();
  resourcesList.engineId = engine1.id;
  resourcesList.resources.push({
    resourceType: 'engine',
    resourceId: resourcesList.engineId,
    action: 'ADD'
  });

  // create engineBuild
  const engineBuildRes = await gqlClient.query(
    createEngineBuildQuery,
    {
      engineId: resourcesList.engineId
    },
    adminOptions
  );
  resourcesList.engineBuildId = _.get(engineBuildRes, 'createEngineBuild').id;
  resourcesList.resources.push({
    resourceType: 'engineBuild',
    resourceId: resourcesList.engineBuildId,
    action: 'ADD'
  });

  // create automateFlowRevision (createFlowRevision)
  const createFlowRes = await gqlClient.query(
    createFlowQuery,
    { name: citestMarker + '-flow-' + Date.now() },
    adminOptions
  );
  resourcesList.flowId = _.get(createFlowRes, 'createFlow.id');

  const createFlowRevisionQuery = `
  mutation createFlowRevision {
    createFlowRevision(input:{
      flowId: "${resourcesList.flowId}",
      runtime: ${flowRuntime},
      forceCreate: true,
      isHead: true
    }){
      flowRevisionId
    }
  }`;

  const createFlowRevisionRes = await gqlClient.query(
    createFlowRevisionQuery,
    {},
    adminOptions
  );
  resourcesList.autoFlowRevisionId = _.get(
    createFlowRevisionRes,
    'createFlowRevision.flowRevisionId'
  );
  resourcesList.resources.push({
    resourceType: 'automateFlowRevision',
    resourceId: resourcesList.autoFlowRevisionId,
    action: 'ADD'
  });

  // create schema
  const createSchemaRes = await gqlClient.query(
    createSchemaQuery,
    { schema: schemaInput, dataRegistryId: resourcesList.regId },
    adminOptions
  );
  resourcesList.schemaId = _.get(createSchemaRes, 'upsertSchemaDraft').id;
  resourcesList.schemasToDelete.push(resourcesList.schemaId);

  resourcesList.resources.push({
    resourceType: 'schema',
    resourceId: resourcesList.schemaId,
    action: 'ADD'
  });

  // create package
  const packageRes = await gqlClient.query(
    createPackageQuery,
    {
      name: `${citestMarker}-public-package-${uuid.v4()}`,
      distributionType: 'public',
      resources: [
        {
          resourceId: resourcesList.appId,
          resourceType: 'application',
          action: 'ADD'
        }
      ],
      organizationId: orgResult.id
    },
    adminOptions
  );

  expect(packageRes.packageCreate).toBeDefined();
  resourcesList.packageId = packageRes.packageCreate.id;
  resourcesList.packagesToDelete.push(resourcesList.packageId);

  resourcesList.resources.push({
    resourceType: 'package',
    resourceId: resourcesList.packageId,
    action: 'ADD'
  });

  // create tdo
  const createTDORes = await gqlClient.query(
    createTDOQuery,
    { name: citestMarker + '-tdo-' + uuid.v4() },
    adminOptions
  );
  const createTDO = _.get(createTDORes, 'createTDO');
  expect(createTDO).toBeDefined();
  resourcesList.tdoId = createTDO.id;
  resourcesList.resources.push({
    resourceType: 'tdo',
    resourceId: resourcesList.tdoId,
    action: 'ADD'
  });

  // create automateNode
  await gqlClient.uploadFile(
    createAutoNodeQuery,
    'AutomateNode-1.1.1.gz',
    './citest/data/AutomateNode-1.1.1.gz'
  );
  const createAutoNodeRes = await gqlClient.query(
    createAutoNodeQuery,
    {},
    adminOptions
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
  const createAutomatePaletteRes = await gqlClient.query(
    createAutoPaletteQuery,
    {
      startDateTime: moment().subtract(2, 'hour').unix(),
      stopDateTime: moment().subtract(1, 'hour').unix(),
      name: citestMarker + '-autoPalette-' + uuid.v4()
    },
    adminOptions
  );
  const automatePalette = _.get(createAutomatePaletteRes, 'createTDO');
  resourcesList.autoPaletteId = automatePalette.id;
  resourcesList.resources.push({
    resourceType: 'automatePalette',
    resourceId: resourcesList.autoPaletteId,
    action: 'ADD'
  });

  // create applicationConfigDefinition
  const createAppConfigRes = await gqlClient.query(
    appConfigDefinitionCreateQuery,
    {
      appId: resourcesList.appId,
      configKey: 'UserTestConfig',
      configType: 'Boolean',
      configLevel: 'User',
      required: false,
      secured: false,
      description: 'test',
      packageId: resourcesList.packageId
    },
    adminOptions
  );
  const createAppConfig = _.get(
    createAppConfigRes,
    'applicationConfigDefinitionCreate.records[0]'
  );
  resourcesList.appConfigId = createAppConfig.id;
  resourcesList.resources.push({
    resourceType: 'applicationConfigDefinition',
    resourceId: resourcesList.appConfigId,
    action: 'ADD'
  });
}

async function activeAllResources(adminOptions) {
  // publish application
  const actionAndStatusList = [
    ['submit', 'pending'],
    ['approve', 'approved'],
    ['deploy', 'active']
  ];

  for (let action of actionAndStatusList) {
    const updateAppQuery = `
      mutation {
        applicationWorkflow(input: {
          id: "${resourcesList.appId}"
          action: ${action[0]}
        })  {
          id
          status
          }
        }
      `;

    const result = await gqlClient.query(updateAppQuery, {}, adminOptions);
    expect(result.applicationWorkflow.id).toEqual(resourcesList.appId);
    expect(result.applicationWorkflow.status).toEqual(action[1]);
  }

  // publish engine, engineBuild
  const buildEngineActionList = [
    ['submit', 'approved'],
    ['deploy', 'deployed']
  ];

  for (let action of buildEngineActionList) {
    const updateBuildRes = await gqlClient.query(
      updateBuildQuery,
      {
        buildId: resourcesList.engineBuildId,
        engineId: resourcesList.engineId,
        action: action[0]
      },
      adminOptions
    );

    const updateBuild = _.get(updateBuildRes, 'updateEngineBuild');
    expect(updateBuild.id).toEqual(resourcesList.engineBuildId);
    expect(updateBuild.status).toEqual(action[1]);
  }

  // publish schema
  await gqlClient.query(
    updateSchemaStateQuery,
    {
      id: resourcesList.schemaId,
      status: 'published'
    },
    adminOptions
  );

  // publish package
  await gqlClient.query(
    updatePackageQuery,
    {
      input: {
        id: resourcesList.packageId,
        status: 'published'
      }
    },
    adminOptions
  );
}

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

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
  resourcesList.authGroupId = _.get(result, 'authGroupCreate.id');
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
  resourcesList.authPermissionId = _.get(result, 'authPermissionSetCreate.id');
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

async function commonAfterAll() {
  // delete package
  const packageIds = _.uniq(
    [
      resourcesList.package.packageId1,
      resourcesList.package.packageId2,
      resourcesList.packageId,
      ...resourcesList.packagesToDelete
    ].filter(Boolean)
  );

  for (const packageId of packageIds) {
    await safe(`delete package ${packageId}`, async () =>
      gqlClient.query(
        deletePackageQuery,
        { id: packageId },
        options.orgAdminOption
      )
    );
  }

  // delete app
  if (resourcesList.appId) {
    await safe(`delete app resourcesList.appId`, async () =>
      gqlClient.query(
        deleteAppQuery,
        { id: resourcesList.appId },
        options.orgAdminOption
      )
    );
  }

  // delete engine
  if (resourcesList.engineId) {
    await safe(`delete engine resourcesList.engineId`, async () =>
      gqlClient.query(
        deleteEngineQuery,
        { id: resourcesList.engineId },
        options.orgAdminOption
      )
    );
  }

  // delete sourceId
  if (resourcesList.sourceId) {
    const query = `
      mutation t {
        deleteSource(id: "${resourcesList.sourceId}"){
          id
          message
        }
      }`;

    await safe(`delete source resourcesList.sourceId`, async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete folder, folderParentId
  if (resourcesList.folderId) {
    const query = `mutation {
      deleteFolder(input: {
        id: "${resourcesList.folderId}"
        orderIndex: ${folderOrderIndex}
      }) {
        id
      }
    }`;
    await safe(`delete folder resourcesList.folderId`, async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete dataset
  if (resourcesList.dataSetId) {
    const query = `
      mutation t {
        deleteDataset(id: "${resourcesList.dataSetId}"){
          datasetId
          message
        }
      }`;

    await safe('delete dataset resourcesList.dataSetId', async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete schema
  if (resourcesList.schemasToDelete) {
    const schemaIds = _.uniq(resourcesList.schemasToDelete.filter(Boolean));
    for (const schemaId of schemaIds) {
      await safe('delete schema resourcesList.schemaId', async () =>
        gqlClient.query(
          updateSchemaStateQuery,
          {
            id: schemaId,
            status: 'deleted'
          },
          options.orgAdminOption
        )
      );
    }
  }

  // delete appViewId
  if (resourcesList.appViewId) {
    const query = `
       mutation t {
        deleteApplicationViewer(viewerId: "${resourcesList.appViewId}"){
          id
        }
      }`;

    await safe('delete appview', async () =>
      gqlClient.query(query, {}, options.adminOption)
    );
  }

  // delete autoNodeId
  if (resourcesList.autoNodeId) {
    const query = `
      mutation {
        deleteTDO(id: "${resourcesList.autoNodeId}") {
          id
          message
        }
      }`;

    await safe('delete autonote resourcesList.autoNodeId', async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete autoPaletteId
  if (resourcesList.autoPaletteId) {
    const query = `
      mutation {
        deleteTDO(id: "${resourcesList.autoPaletteId}") {
          id
          message
        }
      }`;

    await safe('delete autoPalette resourcesList.autoPaletteId', async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete flowId autoFlowRevisionId
  if (resourcesList.flowId) {
    const query = `
      mutation{
        deleteEngine(
          id:"${resourcesList.flowId}"
        ){
          id
        }
      }`;
    await safe('delete flow', async () => gqlClient.query(query));
  }

  // delete tdoId
  if (resourcesList.tdoId) {
    const query = `
      mutation {
        deleteTDO(id: "${resourcesList.tdoId}") {
          id
          message
        }
      }`;

    await safe('delete tdo', async () =>
      gqlClient.query(query, {}, options.orgAdminOption)
    );
  }

  // delete cluster
  if (resourcesList.clusterId) {
    const query = `
      mutation {
        deleteCluster(id: "${resourcesList.clusterId}") {
          id
        }
      }`;

    await safe('delete cluster', async () =>
      gqlClient.query(query, {}, options.adminOption)
    );
  }

  // delete user
  if (options.orgAdminId) {
    const query = `mutation {
      deleteUser(id: "${options.orgAdminId}")  {
        id
      }
    }`;
    await safe('delete user', async () => gqlClient.query(query));
  }

  // delete org
  if (orgResult.id) {
    await safe('disable RBAC', async () =>
      orgHelpers.modifyRBACFeature(
        { gqlClient, options: options.adminOption },
        orgResult.id,
        'disabled'
      )
    );

    await safe('delete org', async () =>
      orgHelpers.deleteOrganization(
        { gqlClient, options: options.adminOption },
        orgResult.id
      )
    );
  }
}
