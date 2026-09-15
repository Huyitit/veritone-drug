const helpers = require('../../../helpers/index');
const orgHelpers = require('../../../helpers/organization');
const userHelpers = require('../../../helpers/user');
const appHelper = require('../../../helpers/application');
const GraphqlClient = require('../../../helpers/gql');
const chakram = require('chakram');
const gqlQuery = require('../../packageCommonQuery');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const { safe } = require('../../../helpers/cleanup/utils');

let gqlClient;
const env = config.env;
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

// Test setup
const ROLES_IDS = [
  isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
  '032218c3-d47e-4287-9d16-7bb867c01266', // DESKTOP ADMIN
  '6d982ee9-ff07-499f-a182-03457a6187f6', // CMS Customer Service
  '3577dfc6-f441-41f9-8dab-ef9079530450', // Discovery Editor
  '912e377e-f4a4-4184-8db1-baa9670d8081' // Developer Editor
].filter((roleId) => roleId);

let packageInOrg, packageNotInOrg;
let rbacPackageInOrg, rbacPackageNotInOrg;
let afterRbacPackage;
let draftAppId, rbacDraftAppId;
let superAdminOptions = {};
let legacyAdminOptions = {};
let rbacAdminOptions = {};
let testUserLegacyId = '';
let testUserRBACId = '';
let testOrgLegacy = {};
let testOrgRBAC = {};
let superToken;

const citestMarker = global.citestMarker || 'citest-should-delete';
const orgMarker = global.orgMarker.package;
const users = [testUserLegacyId, testUserRBACId];
const orgs = [testOrgLegacy, testOrgRBAC];
const requestOptions = [
  superAdminOptions,
  legacyAdminOptions,
  rbacAdminOptions
];

const testOrgLegacyInput = {
  businessUnit: 'Legal',
  types: ['agency', 'broadcaster'],
  kvp: {
    features: {
      enableRBACFeature: 'disabled', // Disabled for legacy admin tests
      automaticPackageCreation: 'disabled'
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

const testOrgRBACInput = {
  businessUnit: 'Legal',
  types: ['agency', 'broadcaster'],
  kvp: {
    features: {
      enableRBACFeature: 'enabled', // Enable for rabc admin tests
      automaticPackageCreation: 'disabled'
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
  password: 'TestUserPassword',
  orgId: '',
  rolesIds: []
};

const packageInput = {
  name: `${citestMarker}-package-test-${uuid.v4()}`,
  description: 'Test',
  version: '1.0.0',
  distributionType: '' // This will be set later in the test
};

let appResourceId;

describe('Organization Admin Package Tests', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    requestOptions.superAdminOptions = helpers.requestOptions(superToken);

    // Set up legacy organization for testing
    orgs.testOrgLegacy = await orgHelpers.orgSetup(
      orgMarker,
      { gqlClient },
      {
        ...testOrgLegacyInput,
        name: `${citestMarker}-legacy-org-${uuid.v4()}`
      },
      true
    );
    expect(orgs.testOrgLegacy).toBeDefined();

    // Set up rbac organization for testing
    orgs.testOrgRBAC = await orgHelpers.orgSetup(
      orgMarker,
      { gqlClient },
      {
        ...testOrgRBACInput,
        name: `${citestMarker}-rbac-org-${uuid.v4()}`
      },
      true
    );
    expect(orgs.testOrgRBAC).toBeDefined();

    // Create a legacy admin in the test organization
    const legacyUserInput = {
      ...testUserInput,
      name: `${citestMarker}-test-user-legacy-${uuid.v4()}`,
      orgId: orgs.testOrgLegacy.id,
      rolesIds: ROLES_IDS[0]
    };
    const userResult = await userHelpers.createUser(
      { gqlClient },
      legacyUserInput
    );
    expect(userResult).toBeDefined();
    users.testUserLegacyId = userResult.id;

    // Create a rbac admin in the test organization
    const rbacUserInput = {
      ...testUserInput,
      name: `${citestMarker}-test-user-rbac-${uuid.v4()}`,
      orgId: orgs.testOrgRBAC.id,
      rolesIds: '032218c3-d47e-4287-9d16-7bb867c01266'
    };
    const rabcAdminResult = await userHelpers.createUser(
      { gqlClient },
      rbacUserInput
    );
    expect(rabcAdminResult).toBeDefined();
    users.testUserRBACId = rabcAdminResult.id;

    // Impersonate the legacy admin to get the request options
    requestOptions.legacyAdminOptions = await impersonate(
      users.testUserLegacyId,
      orgs.testOrgLegacy.guid,
      superToken
    );

    // Impersonate the rabc admin to get the request options
    requestOptions.rbacAdminOptions = await impersonate(
      users.testUserRBACId,
      orgs.testOrgRBAC.guid,
      superToken
    );
  });

  afterAll(async () => {
    // delete draft app if created
    if (draftAppId) {
      const query = `mutation {
        deleteApplication(id: "${draftAppId}")  {
          id
        }
      }`;
      await safe('delete app draftAppId', async () => gqlClient.query(query));
    }

    if (appResourceId) {
      const query = `mutation {
        deleteApplication(id: "${appResourceId}")  {
          id
        }
      }`;
      await safe('delete app appResourceId', async () =>
        gqlClient.query(query)
      );
    }

    if (rbacDraftAppId) {
      const query = `mutation {
        deleteApplication(id: "${rbacDraftAppId}")  {
          id
        }
      }`;
      await safe('delete app rbacDraftAppId', async () =>
        gqlClient.query(query)
      );
    }

    // delete packages if created
    if (afterRbacPackage && afterRbacPackage.id) {
      await safe('delete afterRbacPackage', async () =>
        gqlClient.query(
          gqlQuery.deletePackageQuery,
          { id: afterRbacPackage.id },
          requestOptions.rbacAdminOptions
        )
      );
    }

    if (packageNotInOrg && packageNotInOrg.id) {
      const deletePackage = `
        mutation packageDelete{
          packageDelete(id: "${packageNotInOrg.id}") {
            success
            msg
            code
          }
        }
      `;
      await safe('delete package packageNotInOrg.id', async () =>
        gqlClient.query(deletePackage)
      );
    }

    if (packageInOrg && packageInOrg.id) {
      const deletePackage = `
        mutation packageDelete{
          packageDelete(id: "${packageInOrg.id}") {
            success
            msg
            code
          }
        }
      `;
      await safe('delete package packageInOrg.id', async () =>
        gqlClient.query(deletePackage)
      );
    }

    if (rbacPackageNotInOrg && rbacPackageNotInOrg.id) {
      const deletePackage = `
        mutation packageDelete{
          packageDelete(id: "${rbacPackageNotInOrg.id}") {
            success
            msg
            code
          }
        }
      `;
      await safe('delete package rbacPackageNotInOrg.id', async () =>
        gqlClient.query(deletePackage)
      );
    }

    if (rbacPackageInOrg && rbacPackageInOrg.id) {
      const deletePackage = `
        mutation packageDelete{
          packageDelete(id: "${rbacPackageInOrg.id}") {
            success
            msg
            code
          }
        }
      `;
      await safe('delete package rbacPackageInOrg.id', async () =>
        gqlClient.query(deletePackage)
      );
    }

    if (users.testUserLegacyId) {
      const query = `mutation {
        deleteUser(id: "${users.testUserLegacyId}")  {
          id
        }
      }`;
      await safe('delete user users.testUserLegacyId', async () =>
        gqlClient.query(query)
      );
    }

    if (users.testUserRBACId) {
      const query = `mutation {
        deleteUser(id: "${users.testUserRBACId}")  {
          id
        }
      }`;
      await safe('delete user users.testUserRBACId', async () =>
        gqlClient.query(query)
      );
    }

    if (orgs.testOrgLegacy && orgs.testOrgLegacy.id) {
      await safe('delete org orgs.testOrgLegacy.id', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: requestOptions.superAdminOptions },
          orgs.testOrgLegacy.id
        )
      );
    }

    if (orgs.testOrgRBAC && orgs.testOrgRBAC.id) {
      await safe('disable RBAC org ', async () =>
        orgHelpers.modifyRBACFeature(
          { gqlClient, options: superAdmin.option },
          orgs.testOrgRBAC.id,
          'disabled'
        )
      );

      await safe('delete org orgs.testOrgRBAC', async () =>
        orgHelpers.deleteOrganization(
          { gqlClient, options: requestOptions.superAdminOptions },
          orgs.testOrgRBAC.id
        )
      );
    }
  });

  describe('Legacy Admin Package Tests', () => {
    it('should succeed when creating package by super admin', async () => {
      const pkg = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: []
        },
        requestOptions.superAdminOptions
      );
      expect(pkg.packageCreate).toBeDefined();
      expect(pkg.packageCreate.id).toBeDefined();
      packageNotInOrg = pkg.packageCreate;
    });

    it('should succeed when creating package for org by super admin', async () => {
      const pkg = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: [],
          organizationId: `${orgs.testOrgLegacy.id}`
        },
        requestOptions.superAdminOptions
      );
      expect(pkg.packageCreate).toBeDefined();
      expect(pkg.packageCreate.id).toBeDefined();
      packageInOrg = pkg.packageCreate;
    });

    it('should succeed when super admin shares package with organization', async () => {
      const grantRes = await gqlClient.query(
        gqlQuery.grantPackageQuery,
        {
          packageId: packageNotInOrg.id,
          packageGrants: [
            {
              organizationId: orgs.testOrgLegacy.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        requestOptions.superAdminOptions
      );
      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when legacy admin grant package of their own org', async () => {
      const grantRes = await gqlClient.query(
        gqlQuery.grantPackageQuery,
        {
          packageId: packageInOrg.id,
          packageGrants: [
            {
              organizationId: orgs.testOrgLegacy.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        requestOptions.superAdminOptions
      );
      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when legacy admin approves package for org', async () => {
      const approveRes = await gqlClient.query(
        gqlQuery.updatePackageQuery,
        {
          input: {
            id: packageInOrg.id,
            status: 'approved'
          }
        },
        requestOptions.legacyAdminOptions
      );
      expect(approveRes.packageUpdate).toBeDefined();
      expect(approveRes.packageUpdate.id).toBe(packageInOrg.id);
    });

    it('should succeed when legacy admin get packages for org', async () => {
      const getPackages = await gqlClient.query(
        gqlQuery.getOrgGrantsInfoQuery,
        {
          limit: 10,
          offset: 0,
          orgId: orgs.testOrgLegacy.id,
          packageFilter: {
            grantType: 'GRANT',
            isLatest: true
          }
        },
        requestOptions.legacyAdminOptions
      );
      expect(getPackages).toBeDefined();
      expect(getPackages.packageGrants).toBeDefined();
      const records = _.get(getPackages, 'packageGrants.records', []);
      expect(records.length).toBeGreaterThan(0);
    });

    xit('should fail when creating package by legacy admin', async () => {
      await expect(
        gqlClient.query(
          gqlQuery.createPackageQuery,
          {
            ...packageInput,
            distributionType: 'sharable',
            resources: [],
            organizationId: `${orgs.testOrgLegacy.id}`
          },
          requestOptions.legacyAdminOptions
        )
      ).rejects.toThrow('You do not have permission to perform this action'); // Modify this line to match the expected error
    });

    it('should succeed when legacy admin updates package resources', async () => {
      appResourceId = await createAppResource(
        requestOptions.legacyAdminOptions
      );

      const updateRes = await gqlClient.query(
        gqlQuery.updatePackageResourcesQuery,
        {
          packageId: packageInOrg.id,
          resources: [
            {
              resourceType: 'application',
              resourceId: appResourceId,
              action: 'ADD'
            }
          ]
        },
        requestOptions.legacyAdminOptions
      );

      const packageData = _.get(updateRes, 'packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    xit('should fail when legacy admin updates package basic info', async () => {
      await expect(
        gqlClient.query(
          gqlQuery.updatePackageQuery,
          {
            input: {
              id: packageInOrg.id,
              name: citestMarker + '-updateName-' + uuid.v4(),
              description: 'test description'
            }
          },
          requestOptions.legacyAdminOptions
        )
      ).rejects.toThrow('You do not have permission to perform this action'); // Modify this line to match the expected error
    });

    xit('should fail when legacy admin deletes package', async () => {
      await expect(
        gqlClient.query(
          gqlQuery.deletePackageQuery,
          { id: packageInOrg.id },
          requestOptions.legacyAdminOptions
        )
      ).rejects.toThrow('You do not have permission to perform this action'); // Modify this line to match the expected error
    });

    it('should delete package resource', async () => {
      const deleteRes = await gqlClient.query(gqlQuery.deletePackageQuery, {
        id: packageInOrg.id
      });

      const packageData = _.get(deleteRes, 'packageDelete');
      expect(packageData).toBeDefined();
      expect(packageData.success).toBe(true);

      // delete packageNotInOrg
      const deleteRes2 = await gqlClient.query(gqlQuery.deletePackageQuery, {
        id: packageNotInOrg.id
      });
      const packageData2 = _.get(deleteRes2, 'packageDelete');
      expect(packageData2).toBeDefined();
      expect(packageData2.success).toBe(true);
    });
  });

  describe('RBAC Admin Package Tests', () => {
    xit('should fail when creating package by rbac admin', async () => {
      const pkg = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: []
        },
        requestOptions.rbacAdminOptions
      );

      await expect(pkg).rejects.toThrow();
    });

    it('should succeed when creating package by super admin', async () => {
      const pkg = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: []
        },
        requestOptions.superAdminOptions
      );
      expect(pkg.packageCreate).toBeDefined();
      expect(pkg.packageCreate.id).toBeDefined();
      rbacPackageNotInOrg = pkg.packageCreate;
    });

    it('should succeed when super admin create package for org', async () => {
      const pkg = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: [],
          organizationId: `${orgs.testOrgRBAC.id}`
        },
        requestOptions.superAdminOptions
      );
      expect(pkg.packageCreate).toBeDefined();
      expect(pkg.packageCreate.id).toBeDefined();
      rbacPackageInOrg = pkg.packageCreate;
    });

    it('should succeed when rbac admin update package resource', async () => {
      const createDraftAppRes = await gqlClient.query(gqlQuery.createAppQuery, {
        name: citestMarker + '-app-' + uuid.v4(),
        description: 'test',
        isPublic: true
      });

      const appDraft = _.get(createDraftAppRes, 'createApplication');
      expect(appDraft.id).toBeDefined();
      draftAppId = appDraft.id;

      const updateRes = await gqlClient.query(
        gqlQuery.updatePackageResourcesQuery,
        {
          packageId: rbacPackageInOrg.id,
          resources: [
            {
              resourceType: 'application',
              resourceId: draftAppId,
              action: 'ADD'
            }
          ]
        },
        requestOptions.rbacAdminOptions
      );

      const packageData = _.get(updateRes, 'packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    it('should succeed when rbac admin update package status', async () => {
      const updateRes = await gqlClient.query(
        gqlQuery.updatePackageQuery,
        {
          input: {
            id: rbacPackageInOrg.id,
            status: 'approved'
          }
        },
        requestOptions.rbacAdminOptions
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData.id).toBe(rbacPackageInOrg.id);
    });

    it('should succeed when rbac admin grant package to own org', async () => {
      const grantRes = await gqlClient.query(
        gqlQuery.grantPackageQuery,
        {
          packageId: rbacPackageInOrg.id,
          packageGrants: [
            {
              organizationId: orgs.testOrgRBAC.id,
              grantType: 'GRANT',
              action: 'ADD'
            }
          ]
        },
        requestOptions.rbacAdminOptions
      );
      const grantData = _.get(grantRes, 'packageUpdateGrants');
      expect(grantData).toBeDefined();
    });

    it('should succeed when rbac admin get package grant', async () => {
      const getGrantRes = await gqlClient.query(
        gqlQuery.queryGrant,
        {
          id: rbacPackageInOrg.id
        },
        requestOptions.rbacAdminOptions
      );

      const getGrant = _.get(getGrantRes, 'packageGrants.records');
      expect(getGrant).toBeDefined();

      const currentGrant = getGrant.find(
        (rec) => rec.organization.id == orgs.testOrgRBAC.id
      );
      expect(currentGrant).toBeDefined();
      expect(currentGrant.grantType).toEqual('GRANT');
    });

    it('should succeed when rbac admin revoke package grant to own org', async () => {
      const revokeRes = await gqlClient.query(
        gqlQuery.grantPackageQuery,
        {
          packageId: rbacPackageInOrg.id,
          packageGrants: [
            {
              organizationId: orgs.testOrgRBAC.id,
              grantType: 'GRANT',
              action: 'REMOVE'
            }
          ]
        },
        requestOptions.rbacAdminOptions
      );
      const revokeData = _.get(revokeRes, 'packageUpdateGrants');
      expect(revokeData).toBeDefined();
      expect(revokeData.id).toEqual(rbacPackageInOrg.id);
    });

    xit('should fail when rbac admin delete package', async () => {
      const deleteRes = gqlClient.query(
        gqlQuery.deletePackageQuery,
        { id: rbacPackageInOrg.id },
        requestOptions.rbacAdminOptions
      );

      await expect(deleteRes).rejects.toThrow();
    });

    it('should succeed when super admin set package permission for rbac admin', async () => {
      const userInfoRes = await gqlClient.query(
        gqlQuery.meGql,
        {},
        requestOptions.rbacAdminOptions
      );

      const curAdminInfo = {
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

      const result = await setOLPPermissions(curAdminInfo);
      expect(result).toBeDefined();
      expect(result.authGroupId).toBeDefined();
      expect(result.permissionId).toBeDefined();
      expect(result.aceOrgRecords.length).toBeGreaterThan(0);

      // re-login to get new permissions take effect
      requestOptions.rbacAdminOptions = await impersonate(
        users.testUserRBACId,
        orgs.testOrgRBAC.guid,
        superToken
      );
    });

    it('should succeed when rbac admin create package', async () => {
      const packageRes = await gqlClient.query(
        gqlQuery.createPackageQuery,
        {
          ...packageInput,
          distributionType: 'sharable',
          resources: [],
          organizationId: `${orgs.testOrgRBAC.id}`
        },
        requestOptions.rbacAdminOptions
      );

      expect(packageRes.packageCreate).toBeDefined();
      expect(packageRes.packageCreate.id).toBeDefined();
      afterRbacPackage = packageRes.packageCreate;
    });

    it('should succeed when rbac admin update package resource', async () => {
      const createDraftAppRes = await gqlClient.query(gqlQuery.createAppQuery, {
        name: citestMarker + '-app-' + uuid.v4(),
        description: 'test',
        isPublic: true
      });

      const appDraft = _.get(createDraftAppRes, 'createApplication');
      expect(appDraft.id).toBeDefined();
      rbacDraftAppId = appDraft.id;

      const updateRes = await gqlClient.query(
        gqlQuery.updatePackageResourcesQuery,
        {
          packageId: afterRbacPackage.id,
          resources: [
            {
              resourceType: 'application',
              resourceId: rbacDraftAppId,
              action: 'ADD'
            }
          ]
        },
        requestOptions.rbacAdminOptions
      );

      const packageData = _.get(updateRes, 'packageUpdateResources');
      expect(packageData).toBeDefined();
    });

    it('should succeed when rbac admin update package status', async () => {
      const updateRes = await gqlClient.query(
        gqlQuery.updatePackageQuery,
        {
          input: {
            id: afterRbacPackage.id,
            status: 'approved'
          }
        },
        requestOptions.rbacAdminOptions
      );

      const packageData = _.get(updateRes, 'packageUpdate');
      expect(packageData).toBeDefined();
      expect(packageData.id).toBe(afterRbacPackage.id);
    });

    it('should succeed when rbac admin delete package', async () => {
      const deleteRes = await gqlClient.query(
        gqlQuery.deletePackageQuery,
        { id: afterRbacPackage.id },
        requestOptions.rbacAdminOptions
      );

      const packageData = _.get(deleteRes, 'packageDelete');
      expect(packageData).toBeDefined();
      afterRbacPackage = null;
    });
  });
});

async function impersonate(userId, applicationOrgGUID, token) {
  const url = `${config.core_admin_url}/admin/impersonate/${userId}/${applicationOrgGUID}`;
  const options = helpers.requestOptions(token);
  const impersonated = await chakram.get(url, options);
  const adminToken = _.get(impersonated, 'body.token');
  return helpers.requestOptions(adminToken);
}

async function createAppResource(requestOption) {
  //Create a new application if none found
  const app_uuid = uuid.v4();
  const createAppRes = await appHelper.helpCreateApp(
    { gqlClient, options: superAdminOptions },
    {
      name: `${citestMarker} Package App - ${app_uuid}`,
      key: `citest-package-app ${app_uuid}`,
      description: `Citest Package App - ${app_uuid}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active'
    }
  );
  const testAppId = _.get(createAppRes, 'createApplication.id');
  expect(testAppId).toBeDefined();
  return testAppId;
  //Todo: Implement application creation logic if needed
}

async function setOLPPermissions(orgInfo) {
  const olpObjectIds = {};

  const permissions = `
      AIWARE_PACKAGE_CREATE
      AIWARE_PACKAGE_READ
      AIWARE_PACKAGE_UPDATE
      AIWARE_PACKAGE_DELETE`;

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
