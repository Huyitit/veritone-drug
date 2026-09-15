const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const GraphqlClient = require('../../helpers/gql');
const uuid = require('uuid');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const chakram = require('chakram');
const {
  createPackageQuery,
  grantPackageQuery,
  updatePackageQuery,
  deletePackageQuery,
  getPackagesWithGrantTypes,
  getFilteredPackagesByOrgId
} = require('../packageCommonQuery');
const { safe } = require('../../helpers/cleanup/utils');
let gqlClient;
let orgResult, orgResult2, orgResult3;

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const orgMarker = global.orgMarker.package;
const testOrgName = `${orgMarker}-filters-${uuid.v4()}`;
const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

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

const testUserInput3 = {
  name: `${citestMarker}-test-user3-${uuid.v4()}`,
  password: 'TestPassword123',
  orgId: '',
  rolesIds: ROLES_IDS
};

const packageInput = {
  name: `${citestMarker}-package-filters-${uuid.v4()}`,
  description: 'Test Package for Filters',
  version: '1.0.0',
  distributionType: 'sharable'
};

let testData = {
  superAdminToken: undefined,
  superAdminOption: undefined,
  userId: undefined,
  userId2: undefined,
  userId3: undefined,
  userOption: undefined,
  userOption2: undefined,
  userOption3: undefined,
  appId: undefined,
  package1Id: undefined,
  package2Id: undefined,
  package3Id: undefined
};

const createdPackageIds = new Set();
const createdUserIds = new Set();
const createdOrgIds = new Set();

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

describe('Package Filter by grantTypes', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    testData.superAdminToken = result.token;
    testData.superAdminOption = helpers.requestOptions(result.token);

    orgResult = await orgHelpers.orgSetup(
      orgMarker + '-filter-1',
      { gqlClient },
      { ...testOrgInput, name: `${testOrgInput.name}-1` },
      true
    );
    expect(orgResult).toBeDefined();
    expect(orgResult.id).toBeDefined();
    createdOrgIds.add(orgResult.id);

    orgResult2 = await orgHelpers.orgSetup(
      orgMarker + '-filter-2',
      { gqlClient },
      { ...testOrgInput, name: `${testOrgInput.name}-2` },
      true
    );
    expect(orgResult2).toBeDefined();
    expect(orgResult2.id).toBeDefined();
    createdOrgIds.add(orgResult2.id);

    orgResult3 = await orgHelpers.orgSetup(
      orgMarker + '-filter-3',
      { gqlClient },
      { ...testOrgInput, name: `${testOrgInput.name}-3` },
      true
    );
    expect(orgResult3).toBeDefined();
    expect(orgResult3.id).toBeDefined();
    createdOrgIds.add(orgResult3.id);

    testUserInput.orgId = orgResult.id;
    const userResult = await userHelpers.createUser(
      { gqlClient },
      testUserInput
    );
    expect(userResult).toBeDefined();
    testData.userId = userResult.id;
    createdUserIds.add(testData.userId);

    testUserInput2.orgId = orgResult2.id;
    const userResult2 = await userHelpers.createUser(
      { gqlClient },
      testUserInput2
    );
    expect(userResult2).toBeDefined();
    testData.userId2 = userResult2.id;
    createdUserIds.add(testData.userId2);

    testUserInput3.orgId = orgResult3.id;
    const userResult3 = await userHelpers.createUser(
      { gqlClient },
      testUserInput3
    );
    expect(userResult3).toBeDefined();
    testData.userId3 = userResult3.id;
    createdUserIds.add(testData.userId3);

    testData.userOption = await impersonate(
      testData.userId,
      orgResult.guid,
      result.token
    );

    testData.userOption2 = await impersonate(
      testData.userId2,
      orgResult2.guid,
      result.token
    );

    testData.userOption3 = await impersonate(
      testData.userId3,
      orgResult3.guid,
      result.token
    );
  });

  afterAll(async () => {
    if (createdPackageIds.size) {
      for (const packageId of createdPackageIds) {
        await safe(`delete package ${packageId}`, async () =>
          gqlClient.query(
            deletePackageQuery,
            { id: packageId },
            testData.userOption
          )
        );
      }
    }

    if (createdUserIds.size) {
      for (const userId of createdUserIds) {
        const query = `mutation { deleteUser(id: "${userId}") { id } }`;
        await safe(`delete user ${userId}`, () => gqlClient.query(query));
      }
    }

    if (createdOrgIds.size) {
      for (const orgId of createdOrgIds) {
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

  describe('grantTypes array filter', () => {
    beforeAll(async () => {
      const pkg1Res = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          name: `${packageInput.name}-1-${uuid.v4()}`,
          resources: []
        },
        testData.userOption
      );
      testData.package1Id = _.get(pkg1Res, 'packageCreate.id');
      expect(testData.package1Id).toBeDefined();
      createdPackageIds.add(testData.package1Id);

      await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.package1Id,
            status: 'approved'
          }
        },
        testData.userOption
      );

      const pkg2Res = await gqlClient.query(
        createPackageQuery,
        {
          ...packageInput,
          name: `${packageInput.name}-2-${uuid.v4()}`,
          resources: []
        },
        testData.userOption
      );
      testData.package2Id = _.get(pkg2Res, 'packageCreate.id');
      expect(testData.package2Id).toBeDefined();
      createdPackageIds.add(testData.package2Id);

      await gqlClient.query(
        updatePackageQuery,
        {
          input: {
            id: testData.package2Id,
            status: 'approved'
          }
        },
        testData.userOption
      );

      await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.package1Id,
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

      await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.package2Id,
          packageGrants: [
            {
              organizationId: orgResult2.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          ]
        },
        testData.superAdminOption
      );

      await gqlClient.query(
        grantPackageQuery,
        {
          packageId: testData.package1Id,
          packageGrants: [
            {
              organizationId: orgResult3.id,
              grantType: 'VIEW',
              action: 'ADD'
            }
          ]
        },
        testData.superAdminOption
      );
    });

    it('should filter packages by single grantType', async () => {
      const result = await gqlClient.query(
        getPackagesWithGrantTypes,
        {
          packageFilter: {
            grantTypes: ['GRANT'],
            isLatest: true
          }
        },
        testData.userOption2
      );

      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);

      const findPackage1 = result.packages.records.find(
        (pkg) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();
      expect(findPackage1.grantType).toEqual('GRANT');

      const findPackage2 = result.packages.records.find(
        (pkg) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeUndefined();
    });

    it('should filter packages by multiple grantTypes', async () => {
      const result = await gqlClient.query(
        getPackagesWithGrantTypes,
        {
          packageFilter: {
            grantTypes: ['VIEW', 'GRANT'],
            isLatest: true
          }
        },
        testData.userOption2
      );

      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);

      const findPackage1 = result.packages.records.find(
        (pkg) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();
      expect(findPackage1.grantType).toEqual('GRANT');

      const findPackage2 = result.packages.records.find(
        (pkg) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();
      expect(findPackage2.grantType).toEqual('VIEW');
    });

    it('should include owned packages when using grantTypes with includeOwned', async () => {
      const result = await gqlClient.query(
        getPackagesWithGrantTypes,
        {
          packageFilter: {
            grantTypes: ['VIEW'],
            includeOwned: true,
            isLatest: true
          }
        },
        testData.userOption
      );

      expect(result.packages.records).toBeDefined();

      const findPackage1 = result.packages.records.find(
        (pkg) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeDefined();

      const findPackage2 = result.packages.records.find(
        (pkg) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();
    });

    it('each package record should include contextual grantType field', async () => {
      const result = await gqlClient.query(
        getPackagesWithGrantTypes,
        {
          packageFilter: {
            grantTypes: ['GRANT', 'VIEW'],
            isLatest: true
          }
        },
        testData.userOption2
      );

      expect(result.packages.records).toBeDefined();
      expect(result.packages.records.length).toBeGreaterThan(0);

      for (const pkg of result.packages.records) {
        expect(pkg.grantType).toBeDefined();
        expect(['GRANT', 'VIEW', 'DENY', null]).toContain(pkg.grantType);
      }
    });

    it('superadmin can query packages with grantTypes for specific org', async () => {
      const result = await gqlClient.query(
        getFilteredPackagesByOrgId,
        {
          orgId: orgResult2.id,
          packageFilter: {
            grantTypes: ['VIEW'],
            isLatest: true
          }
        },
        testData.superAdminOption
      );

      expect(result.packages.records).toBeDefined();

      // Should return only package 2 (VIEW to org 2)
      const findPackage2 = result.packages.records.find(
        (pkg) => pkg.id === testData.package2Id
      );
      expect(findPackage2).toBeDefined();

      // Should not return package 1 (GRANT to org 2, not VIEW)
      const findPackage1 = result.packages.records.find(
        (pkg) => pkg.id === testData.package1Id
      );
      expect(findPackage1).toBeUndefined();
    });
  });
});
