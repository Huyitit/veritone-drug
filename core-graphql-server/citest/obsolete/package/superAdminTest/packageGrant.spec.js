const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const engineHelpers = require('../../helpers/engine');
const packageHelpers = require('../../helpers/package');
const GraphqlClient = require('../../helpers/gql');
const uuid = require('uuid');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const chakram = require('chakram');
const { safe } = require('../../helpers/cleanup/utils');
const {
  createPackageQuery,
  createDataRegistryQuery,
  createSchemaQuery,
  grantPackageQuery,
  updateSchemaStateQuery,
  updatePackageQuery,
  meGql,
  createAppQuery,
  queryGrant,
  deletePackageQuery,
  getOrgByStatusQuery,
  deleteAppQuery,
  getOrgGrantsInfoQuery,
  getFilteredPackages,
  getFilteredPackagesByOrgId,
  getPackages,
  deleteEngineQuery,
  updateBuildQuery,
  createEngineQuery,
  createEngineBuildQuery
} = require('../packageCommonQuery');

let gqlClient;
let orgResult, orgResult2;

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

const orgMarker = global.orgMarker.package;
const testOrgName = `${orgMarker}-${uuid.v4()}`;
const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);
const engineCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
const testOrgInput = {
  name: testOrgName,
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

const testUserInput = {
  name: `${citestMarker}-test-user-${uuid.v4()}`,
  password: 'TestPassword123',
  orgId: '',
  rolesIds: ROLES_IDS
};

const testUserInput2 = {
  name: `${citestMarker}-test-user2-${uuid.v4()}`,
  password: 'TestPassword123',
  orgId: '',
  rolesIds: ROLES_IDS
};

const packageInput = {
  name: `${citestMarker}-package-test-${uuid.v4()}`,
  description: 'Test',
  version: '1.0.0',
  distributionType: '' // This will be set later in the test
};

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

const testData = {
  switchPackageId: '',
  privatePackageId: '',
  sharablePackageId: '',
  orglockedPackageId: '',
  regId: '',
  schemaDraftId: '',
  schemaPublishId: '',
  appDraft: {
    id: '',
    name: citestMarker + '-' + uuid.v4()
  },
  superAdminToken: '',
  superAdminOption: {},
  userOption: {},
  userOption2: {},
  userId: ''
};

const orgIdSet = new Set();
const userIdSet = new Set();
const packageIdSet = new Set();
const schemaIdSet = new Set();

describe('citest_package: Package type granting logic', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    testData.superAdminToken = result.token;
    testData.superAdminOption = helpers.requestOptions(result.token);
    // Set up test organization
    orgResult = await orgHelpers.orgSetup(
      orgMarker,
      { gqlClient },
      testOrgInput,
      true
    );
    expect(orgResult).toBeDefined();
    expect(orgResult.id).toBeDefined();
    orgIdSet.add(orgResult.id);

    // Create a second organization for testing package grants. Only change the name of the org
    orgResult2 = await orgHelpers.orgSetup(
      orgMarker + '-2',
      { gqlClient },
      {
        ...testOrgInput,
        name: `${testOrgInput.name}-2`,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      },
      true
    );
    expect(orgResult2).toBeDefined();
    expect(orgResult2.id).toBeDefined();
    orgIdSet.add(orgResult2.id);

    //Create an admin user in the test organization
    testUserInput.orgId = orgResult.id;
    const userResult = await userHelpers.createUser(
      { gqlClient },
      testUserInput
    );
    expect(userResult).toBeDefined();
    expect(userResult.id).toBeDefined();
    testData.userId = userResult.id;
    userIdSet.add(testData.userId);

    //Create a second user in the test organization
    testUserInput2.orgId = orgResult2.id;
    const userResult2 = await userHelpers.createUser(
      { gqlClient },
      testUserInput2
    );
    expect(userResult2).toBeDefined();
    expect(userResult2.id).toBeDefined();
    userIdSet.add(userResult2.id);

    //Get user request options
    testData.userOption = await impersonate(
      userResult.id,
      orgResult.guid,
      result.token
    );

    // Get user request options for the second user
    testData.userOption2 = await impersonate(
      userResult2.id,
      orgResult2.guid,
      result.token
    );

    const userInfoRes = await gqlClient.query(meGql, {}, testData.userOption);

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
    testData.userOption = await impersonate(
      testData.userId,
      userOrgInfo.orgGuid,
      testData.superAdminToken
    );

    // create application draft
    const appDraft = await createDraftApp(
      {
        name: testData.appDraft.name,
        description: testData.appDraft.description
      },
      testData.userOption
    );
    testData.appDraft.id = appDraft.id;

    // create data Registry
    const regCreateRes = await gqlClient.query(
      createDataRegistryQuery,
      { name: citestMarker + '-' + uuid.v4(), description: 'test' },
      testData.userOption
    );

    const regData = _.get(regCreateRes, 'createDataRegistry');
    expect(regData).toBeDefined();
    testData.regId = regData.id;

    // create schema
    const activeSchemaData = await createAndPublicSchema(
      regData.id,
      testData.userOption
    );
    testData.schemaPublishId = activeSchemaData.id;
    schemaIdSet.add(testData.schemaPublishId);

    const schemaData = await createDraftSchema(regData.id, testData.userOption);
    testData.schemaDraftId = schemaData.id;
    schemaIdSet.add(testData.schemaDraftId);
  });

  afterAll(async () => {
    if (packageIdSet.size) {
      for (const packageId of packageIdSet) {
        await safe(`delete package ${packageId}`, async () =>
          packageHelpers.helpDeletePackage({ gqlClient }, { id: packageId })
        );
      }
    }

    if (testData.engineId) {
      await safe(`delete engine testData.engineId`, async () =>
        gqlClient.query(
          deleteEngineQuery,
          { id: testData.engineId },
          testData.userOption
        )
      );
    }

    // delete schema will also delete registry
    if (schemaIdSet.size) {
      for (const schemaId of schemaIdSet) {
        await safe(`delete schema ${schemaId}`, async () =>
          gqlClient.query(
            updateSchemaStateQuery,
            {
              id: schemaId,
              status: 'deleted'
            },
            testData.userOption
          )
        );
      }
    }

    // delete app
    if (testData.appDraft.id) {
      await safe(`delete app ${testData.appDraft.id}`, async () =>
        gqlClient.query(deleteAppQuery, {
          id: testData.appDraft.id
        })
      );
    }

    // delete user
    if (userIdSet.size) {
      for (const userId of userIdSet) {
        const query = `mutation {
          deleteUser(id: "${userId}")  {
            id
          }
        }`;
        await safe(`delete user ${userId}`, async () => gqlClient.query(query));
      }
    }

    // delete org
    if (orgIdSet.size) {
      for (const orgId of orgIdSet) {
        await safe(`disable RBAC org ${orgId}`, async () =>
          orgHelpers.modifyRBACFeature(
            { gqlClient, options: testData.superAdminOption },
            orgId,
            'disabled'
          )
        );

        await safe(`delete org ${orgId}`, async () =>
          orgHelpers.deleteOrganization(
            { gqlClient, options: testData.superAdminOption },
            orgId
          )
        );
      }
    }
  });

  describe('Sharable package', () => {
    it('create sharable package should success', async () => {
      const packageCreateRes = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: [
            {
              resourceType: 'application',
              resourceId: testData.appDraft.id,
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const packageCreateData = _.get(packageCreateRes, 'packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.sharablePackageId = packageCreateData.id;
      packageIdSet.add(testData.sharablePackageId);
      expect(packageCreateData.distributionType).toEqual('sharable');
    });
    it('approve sharable package with draft app should success', async () => {
      const approveRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            status: 'approved'
          }
        },
        testData.userOption
      );

      const approvePackage = _.get(approveRes, 'packageUpdate');
      testData.sharablePackageId = approvePackage.id;
      packageIdSet.add(testData.sharablePackageId);
      expect(approvePackage).toBeDefined();
      expect(approvePackage.status).toEqual('approved');
    });
    it('publish sharable package with draft app should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    it('update resource should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'REMOVE'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.sharablePackageId = packageData.id;
      packageIdSet.add(testData.sharablePackageId);
    });
    it('publish sharable package with draft schema should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    it('publish sharable package with active schema should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'REMOVE'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.sharablePackageId = packageData.id;
      packageIdSet.add(testData.sharablePackageId);
      const publishRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      const publishPackage = _.get(publishRes, 'packageUpdate');
      testData.sharablePackageId = publishPackage.id;
      packageIdSet.add(testData.sharablePackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage.status).toEqual('published');
    });
    it('add active schema to published package should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      testData.sharablePackageId = packageData.id;
      packageIdSet.add(testData.sharablePackageId);
    });
    // This will work when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });
    // This will work when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow();
    });
    it('should not see package in pre-granted target org', async () => {
      const result = await gqlClient.query(
        getOrgGrantsInfoQuery,
        {
          limit: 30,
          offset: 0,
          orgId: orgResult2.id,
          packageFilter: {
            grantType: 'GRANT',
            distributionType: 'sharable',
            isLatest: true
          }
        },
        testData.userOption2
      );
      expect(result.packageGrants.records.length).toEqual(0);
    });
    it('should not see package in pre-granted calling org through filtered packages query', async () => {
      const result = await gqlClient.query(
        getFilteredPackages,
        {
          packageFilter: {
            grantType: 'GRANT',
            isLatest: true
          }
        },
        testData.userOption2
      );
      expect(result.packages.records.length).toEqual(0);
    });
    it('superadmin should not see package in pre-granted target org through filtered packages query', async () => {
      const result = await gqlClient.query(
        getFilteredPackagesByOrgId,
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantType: 'GRANT',
            isLatest: true
          }
        },
        testData.superAdminOption
      );
      expect(result.packages.records.length).toEqual(0);
    });
    it('grant sharable package to owner org should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.sharablePackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      const grant = listGrant.find(
        (rec) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });
    // This will work when VE-14036 is done
    xit('grant active sharable package to deleted org should fail', async () => {
      const deleteOrgRes = await gqlClient.query(getOrgByStatusQuery, {
        limit: 1,
        status: 'deleted'
      });

      const orgData = _.get(deleteOrgRes, 'organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.sharablePackageId,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });
    it('grant sharable package to other org should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.sharablePackageId,
          packageGrants: [
            {
              organizationId: orgResult2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.superAdminOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      const grant = listGrant.find(
        (rec) => rec.organization.id === orgResult2.id
      );
      expect(grant).toBeDefined();
    });
    it('should see package in granted org', async () => {
      const result = await gqlClient.query(
        getOrgGrantsInfoQuery,
        {
          limit: 30,
          offset: 0,
          orgId: orgResult2.id,
          packageFilter: {
            grantType: 'GRANT',
            distributionType: 'sharable',
            isLatest: true
          }
        },
        testData.userOption2
      );
      expect(result.packageGrants.records.length).toBeGreaterThan(0);
      expect(result.packageGrants.records[0].package.id).toBe(
        testData.sharablePackageId
      );
    });
    it('should see package in granted org through filtered packages query', async () => {
      const result = await gqlClient.query(
        getFilteredPackages,
        {
          packageFilter: {
            grantType: 'GRANT',
            isLatest: true
          }
        },
        testData.userOption2
      );
      expect(result.packages.records.length).toEqual(1);
      expect(result.packages.records[0].id).toBe(testData.sharablePackageId);
    });
    it('superadmin should see package in granted target org through filtered packages query', async () => {
      const result = await gqlClient.query(
        getFilteredPackagesByOrgId,
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantType: 'GRANT',
            isLatest: true
          }
        },
        testData.superAdminOption
      );
      expect(result.packages.records.length).toEqual(1);
      expect(result.packages.records[0].id).toBe(testData.sharablePackageId);
    });
    xit('disable sharable package will also remove package grant', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.sharablePackageId,
            status: 'deactivated'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.sharablePackageId = packageData.id;
      packageIdSet.add(testData.sharablePackageId);
      expect(packageData.status).toEqual('deactivated');

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.sharablePackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      expect(listGrant.length).toEqual(0);
    });
    it('grant deactivated sharable package for own org should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.sharablePackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );
      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });
    it('delete active sharable package should success', async () => {
      const deletePackageRes = await gqlClient.query(
        deletePackageQuery,
        { id: testData.sharablePackageId },
        testData.userOption
      );

      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage).toBeDefined();
      packageIdSet.delete(testData.sharablePackageId);
    });
    it('delete package should success', async () => {
      const deletePackageRes = await gqlClient.query(
        deletePackageQuery,
        { id: testData.sharablePackageId },
        testData.userOption
      );

      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage).toBeDefined();
    });
  });

  describe('Private package', () => {
    it('create private package should success', async () => {
      const packageCreateRes = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          distributionType: 'private',
          resources: [
            {
              resourceType: 'application',
              resourceId: testData.appDraft.id,
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const packageCreateData = _.get(packageCreateRes, 'packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.privatePackageId = packageCreateData.id;
      packageIdSet.add(testData.privatePackageId);
      expect(packageCreateData.distributionType).toEqual('private');
    });

    it('approve private package with draft app should success', async () => {
      const approveRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'approved'
          }
        },
        testData.userOption
      );

      const approvePackage = _.get(approveRes, 'packageUpdate');
      testData.privatePackageId = approvePackage.id;
      packageIdSet.add(testData.privatePackageId);
      expect(approvePackage).toBeDefined();
      expect(approvePackage.status).toEqual('approved');
    });

    it('publish private package with draft app should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('update resource should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'REMOVE'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.privatePackageId = packageData.id;
      packageIdSet.add(testData.privatePackageId);
    });

    it('publish private package with draft schema should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('publish private package with active schema should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'REMOVE'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.privatePackageId = packageData.id;
      packageIdSet.add(testData.privatePackageId);

      const publishRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      const publishPackage = _.get(publishRes, 'packageUpdate');
      testData.privatePackageId = publishPackage.id;
      packageIdSet.add(testData.privatePackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage.status).toEqual('published');
    });

    it('add active schema to published package should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      testData.privatePackageId = packageData.id;
      packageIdSet.add(testData.privatePackageId);
    });

    // This will work when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    // This will work when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow();
    });

    it('grant private package to owner org should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.privatePackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.privatePackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      const grant = listGrant.find(
        (rec) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });

    // This will work when VE-14036 is done
    xit('grant active private package to deleted org should fail', async () => {
      const deleteOrgRes = await gqlClient.query(getOrgByStatusQuery, {
        limit: 1,
        status: 'deleted'
      });

      const orgData = _.get(deleteOrgRes, 'organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.privatePackageId,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    // This will work when VE-14036 is done
    xit('grant private package to other org should fail', async () => {
      const activeOrgRes = await gqlClient.query(getOrgByStatusQuery, {
        limit: 1,
        status: 'active'
      });

      const orgData = _.get(activeOrgRes, 'organizations.records[0]');
      expect(orgData).toBeDefined();
      expect(orgData.id).not.toEqual(orgResult.id);

      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.privatePackageId,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    //TODO: Unskip when VE-14036 is done
    xit('disable private package will also remove package grant', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'deactivated'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.privatePackageId = packageData.id;
      packageIdSet.add(testData.privatePackageId);

      expect(packageData.status).toEqual('deactivated');

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.privatePackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      expect(listGrant.length).toEqual(0);
    });

    it('disable private package', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'deactivated'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.privatePackageId = packageData.id;
      packageIdSet.add(testData.privatePackageId);
      expect(packageData.status).toEqual('deactivated');

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.privatePackageId
      });
    });

    // This will work when VE-14036 is done
    xit('grant deactivated private package for own org should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.privatePackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('active private package should success', async () => {
      const publishRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.privatePackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      const publishPackage = _.get(publishRes, 'packageUpdate');
      testData.privatePackageId = publishPackage.id;
      packageIdSet.add(testData.privatePackageId);
      expect(publishPackage).toBeDefined();
      expect(publishPackage.status).toEqual('published');
    });

    it('delete active private package should success', async () => {
      const deletePackageRes = await gqlClient.query(
        deletePackageQuery,
        { id: testData.privatePackageId },
        testData.userOption
      );

      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage).toBeDefined();
      packageIdSet.delete(testData.privatePackageId);
    });
  });

  describe('Org-locked package', () => {
    it('create org-locked package should success', async () => {
      const packageCreateRes = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          distributionType: 'org_locked',
          resources: [
            {
              resourceType: 'application',
              resourceId: testData.appDraft.id,
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const packageCreateData = _.get(packageCreateRes, 'packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.orglockedPackageId = packageCreateData.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(packageCreateData.distributionType).toEqual('org_locked');
    });

    it('approve org-locked package with draft app should success', async () => {
      const approveRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'approved'
          }
        },
        testData.userOption
      );

      const approvePackage = _.get(approveRes, 'packageUpdate');
      testData.orglockedPackageId = approvePackage.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(approvePackage).toBeDefined();
      expect(approvePackage.status).toEqual('approved');
    });

    it('publish org-locked package with draft app should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('update resource should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'REMOVE'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.orglockedPackageId = packageData.id;
      packageIdSet.add(testData.orglockedPackageId);
    });

    it('publish org-locked package with draft schema should fail', async () => {
      const publishRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      await expect(publishRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    it('publish org-locked package with active schema should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              },
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'REMOVE'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.orglockedPackageId = packageData.id;
      packageIdSet.add(testData.orglockedPackageId);

      const publishRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      const publishPackage = _.get(publishRes, 'packageUpdate');
      testData.orglockedPackageId = publishPackage.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage.status).toEqual('published');
    });

    it('add active schema to published org-locked package should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaPublishId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      testData.orglockedPackageId = packageData.id;
      packageIdSet.add(testData.orglockedPackageId);
    });

    //TODO: unskipped when VE-14305 is done
    xit('add draft schema to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: 'schema',
                resourceId: testData.schemaDraftId,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow(
        /The request input did not pass validation checks/
      );
    });

    //TODO: Unskip when VE-14305 is done
    xit('add draft app to published package should fail', async () => {
      const updateRes = gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            resources: [
              {
                resourceType: 'application',
                resourceId: testData.appDraft.id,
                action: 'ADD'
              }
            ]
          }
        },
        testData.userOption
      );

      await expect(updateRes).rejects.toThrow();
    });

    it('grant org-locked package to owner org should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.orglockedPackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.orglockedPackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      const grant = listGrant.find(
        (rec) => rec.organization.id === orgResult.id
      );
      expect(grant).toBeDefined();
    });

    // This will work when VE-14036 is done
    xit('grant active sharable package to deleted org should fail', async () => {
      const deleteOrgRes = await gqlClient.query(getOrgByStatusQuery, {
        limit: 1,
        status: 'deleted'
      });

      const orgData = _.get(deleteOrgRes, 'organizations.records[0]');
      expect(orgData).toBeDefined();

      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.orglockedPackageId,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    // This will work when VE-14036 is done
    xit('grant sharable package to other org should fail', async () => {
      const activeOrgRes = await gqlClient.query(getOrgByStatusQuery, {
        limit: 1,
        status: 'active'
      });

      const orgData = _.get(activeOrgRes, 'organizations.records[0]');
      expect(orgData).toBeDefined();
      expect(orgData.id).not.toEqual(orgResult.id);

      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.orglockedPackageId,
          packageGrants: [
            {
              organizationId: orgData.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });
    //TODO: need to simulate different instance to test this, unknown how
    xit('grant org-locked package to owner org in different instance should success', async () => {});

    //TODO: Unskip when VE-14036 is done
    xit('disable org-locked package will also remove package grant', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'deactivated'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.orglockedPackageId = packageData.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(packageData.status).toEqual('deactivated');

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.orglockedPackageId
      });

      const listGrant = _.get(grantListRes, 'packageGrants.records');
      expect(listGrant.length).toEqual(0);
    });

    it('disable org-locked package', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'deactivated'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      testData.orglockedPackageId = packageData.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(packageData.status).toEqual('deactivated');

      const grantListRes = await gqlClient.query(queryGrant, {
        id: testData.orglockedPackageId
      });
    });

    //TODO:Unskip when VE-14036 is done
    xit('grant deactivated org-locked package for own org should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.orglockedPackageId,
          packageGrants: [
            {
              organizationId: orgResult.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('active org-locked package should success', async () => {
      const publishRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.orglockedPackageId,
            status: 'published'
          }
        },
        testData.userOption
      );

      const publishPackage = _.get(publishRes, 'packageUpdate');
      testData.orglockedPackageId = publishPackage.id;
      packageIdSet.add(testData.orglockedPackageId);

      expect(publishPackage).toBeDefined();
      expect(publishPackage.status).toEqual('published');
    });

    it('delete active org-locked package should success', async () => {
      const deletePackageRes = await gqlClient.query(
        deletePackageQuery,
        { id: testData.orglockedPackageId },
        testData.userOption
      );

      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage).toBeDefined();
      packageIdSet.delete(testData.orglockedPackageId);
    });
  });

  describe('switch package distributionType', () => {
    beforeAll(async () => {
      const engine = await gqlClient.query(
        createEngineQuery,
        {
          name: citestMarker + '-engine-' + uuid.v4(),
          categoryId: engineCategoryId,
          deploymentModel: 'FullyNetworkIsolated'
        },
        testData.userOption
      );

      testData.engineId = engine.createEngine.id;

      const engineBuild = await gqlClient.query(
        createEngineBuildQuery,
        {
          engineId: testData.engineId
        },
        testData.userOption
      );

      testData.engineBuildId = engineBuild.createEngineBuild.id;

      // publish engine, engineBuild
      const buildEngineActionList = [
        ['submit', 'approved'],
        ['deploy', 'deployed']
      ];

      for (let action of buildEngineActionList) {
        const updateBuildRes = await gqlClient.query(
          updateBuildQuery,
          {
            buildId: testData.engineBuildId,
            engineId: testData.engineId,
            action: action[0]
          },
          testData.userOption
        );

        const updateBuild = _.get(updateBuildRes, 'updateEngineBuild');
        expect(updateBuild.id).toEqual(testData.engineBuildId);
        expect(updateBuild.status).toEqual(action[1]);
      }
    });

    it('Org1 Create public package with engine and engineBuild should success', async () => {
      const packageCreateRes = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          distributionType: 'public',
          resources: [
            {
              resourceType: 'engine',
              resourceId: testData.engineId,
              action: 'ADD'
            },
            {
              resourceType: 'engineBuild',
              resourceId: testData.engineBuildId,
              action: 'ADD'
            }
          ]
        },
        testData.userOption
      );

      const packageCreateData = _.get(packageCreateRes, 'packageCreate');
      expect(packageCreateData).toBeDefined();
      testData.switchPackageId = packageCreateData.id;
      packageIdSet.add(testData.switchPackageId);
      expect(packageCreateData.distributionType).toEqual('public');
    });

    it('Org2 get public package should success', async () => {
      const packageCreateRes = await gqlClient.query(
        getPackages,
        {
          id: testData.switchPackageId
        },
        testData.userOption2
      );

      const packageCreateData = _.get(packageCreateRes, 'packages.records');
      expect(packageCreateData).toBeDefined();
      const foundPackage = packageCreateData.find((pkg) => {
        return pkg.id === testData.switchPackageId;
      });
      expect(foundPackage).toBeDefined();
    });

    it('change distribution type to share-able should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.switchPackageId,
            distributionType: 'sharable'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData.distributionType).toEqual('sharable');
      testData.switchPackageId = packageData.id;
      packageIdSet.add(testData.switchPackageId);
    });

    it('Org2 get share-able package should fail', async () => {
      const packageCreateRes = await gqlClient.query(
        getPackages,
        {
          id: testData.switchPackageId
        },
        testData.userOption2
      );

      const packageCreateData = _.get(packageCreateRes, 'packages.records');
      expect(packageCreateData.length).toEqual(0);
    });

    it('grant share-able package to Org2 should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.switchPackageId,
          packageGrants: [
            {
              organizationId: orgResult2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.superAdminOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('Org2 get share-able package should success', async () => {
      const packageCreateRes = await gqlClient.query(
        getPackages,
        {
          id: testData.switchPackageId
        },
        testData.userOption2
      );

      const packageCreateData = _.get(packageCreateRes, 'packages.records');
      expect(packageCreateData).toBeDefined();
      const foundPackage = packageCreateData.find((pkg) => {
        return pkg.id === testData.switchPackageId;
      });
      expect(foundPackage).toBeDefined();
    });

    it('Revoke package access from Org2 should success', async () => {
      const grantRes = await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.switchPackageId,
          packageGrants: [
            {
              organizationId: orgResult2.id,
              grantType: 'GRANT',
              action: 'REMOVE'
            }
          ]
        },
        testData.superAdminOption
      );

      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('change distribution type to private should success', async () => {
      const updateRes = await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.switchPackageId,
            distributionType: 'private'
          }
        },
        testData.userOption
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData.distributionType).toEqual('private');
      testData.switchPackageId = packageData.id;
      packageIdSet.add(testData.switchPackageId);
    });

    xit('grant package access to org2 should fail', async () => {
      const grantRes = gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.switchPackageId,
          packageGrants: [
            {
              organizationId: orgResult2.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        testData.superAdminOption
      );

      await expect(grantRes).rejects.toThrow();
    });

    it('Org2 get private package should fail', async () => {
      const packageRes = await gqlClient.query(
        getPackages,
        {
          id: testData.switchPackageId
        },
        testData.userOption2
      );

      const packageCreateData = _.get(packageRes, 'packages.records');
      expect(packageCreateData.length).toEqual(0);
    });

    it('delete package and resources', async () => {
      await gqlClient.query(
        deleteEngineQuery,
        { id: testData.engineId },
        testData.userOption
      );
      testData.engineId = null;

      const deletePackageRes = await gqlClient.query(
        deletePackageQuery,
        { id: testData.switchPackageId },
        testData.userOption
      );

      const deletePackage = _.get(deletePackageRes, 'packageDelete');
      expect(deletePackage).toBeDefined();
      packageIdSet.delete(testData.switchPackageId);
    });
  });

  async function impersonate(userId, applicationOrgGUID, token) {
    const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
    const options = helpers.requestOptions(token);
    const impersonated = await chakram.get(url, options);
    const adminToken = _.get(impersonated, 'body.token');
    return helpers.requestOptions(adminToken);
  }

  async function createDraftSchema(regId, userOption) {
    const createSchemaRes = await gqlClient.query(
      createSchemaQuery,
      { schema: schemaInput, dataRegistryId: regId },
      userOption
    );

    return _.get(createSchemaRes, 'upsertSchemaDraft');
  }

  async function createAndPublicSchema(regId, userOption) {
    const schema = await createDraftSchema(regId, userOption);
    const UpdateSchemaRes = await gqlClient.query(
      updateSchemaStateQuery,
      {
        id: schema.id,
        status: 'published'
      },
      userOption
    );
    return _.get(UpdateSchemaRes, 'updateSchemaState');
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
});
