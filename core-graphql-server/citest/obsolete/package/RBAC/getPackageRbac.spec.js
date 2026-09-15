/* global pending */
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const appHelper = require('../../helpers/application');
const packageHelper = require('../../helpers/package');
const rbacHelper = require('../../helpers/rbacHelper');
const { createIsolatedSuperadmin } = require('../../helpers/superadminSession');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
const { safe } = require('../../helpers/cleanup/utils');

let gqlClient;
let testSetup;
const packageIds = new Set();

describe('citest_package: RBAC for get packages', () => {
  let superOrgGuid, superOrgId, superUserId, superToken, session;
  let testOrg, testUsers, adminUser, regularUser, secondRegularUser;
  let adminOptions;
  let regularOptions;
  let useRBACFeature;
  let superAdminOptions;
  let secondRegularOptions;
  let testAppId;
  let newAuthPermissionSet;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    // T12: use a throwaway superadmin + org, not the shared bootstrap superadmin —
    // an unrelated spec's OLP-toggle event can log out every session merely indexed
    // under an org it touches, including a superadmin who is simply a member. This
    // session is isolated (member of no other org) and cleaned up in afterAll.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // preserve implicit-auth call sites below
    superToken = session.token;
    superAdminOptions = session.options;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    // T72: Redis write for the session token may lag the HTTP response by several seconds
    // under CI load. Poll until the token is confirmed active before running tests.
    let result;
    for (let i = 0; i < 120; i++) {
      try {
        result = await userHelper.getMyInfo({
          gqlClient,
          options: superAdminOptions
        });
        if (_.get(result, 'me')) break;
      } catch (e) {
        if (i === 119) throw e;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');

    testSetup = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
      // {
      //   limit: 1,
      //   name: `${citestMarker}-org-folder-rbac-`,
      //   nameMatch: 'contains',
      //   kvpProperty: 'features.enableRBACFeature',
      //   kvpValue: 'enabled',
      //   status: 'active'
      // }
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    testUsers = _.get(testOrg, 'users.records');
    // test users + superadmin who created the org
    expect(testUsers.length).toEqual(6);

    // Login for Admin user
    adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    adminOptions = adminUser.requestOptions;

    // Login for Regular user
    regularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'regularUser';
    });
    regularOptions = regularUser.requestOptions;

    // Login for Second Regular user
    secondRegularUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRegularUser';
    });
    secondRegularOptions = secondRegularUser.requestOptions;
  });

  describe('RBAC for get packages', () => {
    let ci_app_grant_package;
    let app_uuid = uuid.v4();
    let testApp = {
      id: uuid.v4(),
      name: `${citestMarker} Package App - ${app_uuid}}`,
      key: `citest-package-app ${app_uuid}`,
      description: `Citest Package App - ${app_uuid}`,
      url: 'www.example.com',
      oauth2RedirectUrls: 'www.example.com/callback',
      checkPermissions: false,
      status: 'active',
      disableAutoPackageCreation: true //# disable auto package creation for createPackage below
    };
    let ci_app_owned_package;
    it('should create application', async () => {
      const result = await appHelper.helpCreateApp(
        { gqlClient, options: superAdminOptions },
        testApp
      );
      testAppId = _.get(result, 'createApplication.id');
      expect(testAppId).toBeDefined();
    });
    it('should create package with application resource', async () => {
      let resultAppGrantPackageMutation = await packageHelper.helpCreatePackage(
        { gqlClient, options: superAdminOptions },
        {
          name: `${citestMarker} citest appGrant test package`,
          version: '1.0',
          primaryResourceId: testAppId,
          resources: [
            {
              resourceId: testAppId,
              resourceType: 'application',
              action: 'ADD'
            }
          ]
        }
      );

      ci_app_grant_package = _.get(
        resultAppGrantPackageMutation,
        'packageCreate'
      );

      packageIds.add(ci_app_grant_package.id);
    });
    it('should grant package to organization with VIEW access', async () => {
      const result = await packageHelper.helpUpdatePackageGrant(
        { gqlClient, options: superAdminOptions },
        {
          packageId: ci_app_grant_package.id,
          packageGrants: [
            {
              organizationId: testOrg.id,
              action: 'ADD',
              grantType: 'VIEW'
            }
          ]
        }
      );

      expect(_.get(result, 'packageUpdateGrants.id')).toEqual(
        ci_app_grant_package.id
      );
    });

    it('should create a package owned by organization', async () => {
      let resultAppGrantPackageMutation = await packageHelper.helpCreatePackage(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker} citest org owned packages`,
          version: '1.0',
          organizationId: testOrg.id
        }
      );

      ci_app_owned_package = _.get(
        resultAppGrantPackageMutation,
        'packageCreate'
      );
      packageIds.add(ci_app_owned_package.id);
    });

    it('admin user should fetch both granted and org-owned packages', async () => {
      const packagesResult = await packageHelper.helpGetPackages(
        { gqlClient, options: adminOptions },
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] }
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(2);
    });

    it('regular user with AIWARE_DEVELOPER_ENGINE_READ should fetch both granted and org-owned packages', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const result = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-auth-permission-set-${uuid.v4()}`,
          description: `${citestMarker}-auth-permission-set`,
          permissions: ['DEVELOPER_ENGINE_READ']
        }
      );

      expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
      expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');

      const result1 = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: adminOptions },
        {
          resourceType: 'Organization',
          ids: [testOrg.id],
          entries: [
            {
              member: {
                id: secondRegularUser.userId,
                memberType: 'User'
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        }
      );

      const acl = _.get(result1, 'addACEsToResources.records');
      // Login for Regular user
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: secondRegularUser.userId, organizationGuid: testOrg.guid }
      );
      secondRegularOptions = impersonated.requestOptions;

      const packagesResult = await packageHelper.helpGetPackages(
        { gqlClient, options: secondRegularOptions },
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] }
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(2);
    });

    it('regular user without AIWARE_DEVELOPER_ENGINE_READ should fetch only granted packages', async () => {
      const packagesResult = await packageHelper.helpGetPackages(
        { gqlClient, options: regularOptions },
        { ids: [ci_app_grant_package.id, ci_app_owned_package.id] }
      );
      const packages = _.get(packagesResult, 'packages.records');
      expect(packages.length).toEqual(1);
    });

    it('superadmin should see same packages via packages query and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        { gqlClient, options: superAdminOptions },
        { orgId: testOrg.id, limit: 1000 }
      );

      const fetchedPackages = await getPackagesByIds(
        { gqlClient, options: superAdminOptions },
        { ids: grantedIds, limit: 1000 }
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('developer user should see same packages from packages and packageGrants', async () => {
      const grantedIds = await getGrantedPackageIds(
        { gqlClient, options: secondRegularOptions },
        { orgId: testOrg.id, limit: 1000 }
      );

      const fetchedPackages = await getPackagesByIds(
        { gqlClient, options: secondRegularOptions },
        { ids: grantedIds, limit: 1000 }
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('regular user without developer permission should see same granted packages from both APIs', async () => {
      const grantedIds = await getGrantedPackageIds(
        { gqlClient, options: regularOptions },
        { orgId: testOrg.id, limit: 1000 }
      );

      const fetchedPackages = await getPackagesByIds(
        { gqlClient, options: regularOptions },
        { ids: grantedIds, limit: 1000 }
      );

      expect(new Set(fetchedPackages)).toEqual(new Set(grantedIds));
    });

    it('should delete multiple packages sequentially', async () => {
      const packageIdsToDelete = [
        ci_app_grant_package.id,
        ci_app_owned_package.id
      ];

      for (const id of packageIdsToDelete) {
        const result = await packageHelper.helpDeletePackage(
          { gqlClient, options: superAdminOptions },
          { id }
        );
        expect(result.packageDelete.success).toBe(true);
        packageIds.delete(id);
      }
    });
    it('should delete application', async () => {
      const result = await appHelper.helpDeleteApp(
        { gqlClient },
        { id: testAppId }
      );
      const deletedApp = _.get(result, 'deleteApplication');
      expect(deletedApp.id).toEqual(testAppId);
      testAppId = null;
    });
  });

  afterAll(async () => {
    if (packageIds.size) {
      for (const id of packageIds) {
        const result = await packageHelper.helpDeletePackage(
          { gqlClient, options: superAdminOptions },
          { id: id }
        );
        expect(result.packageDelete.success).toBe(true);
      }
    }

    if (testAppId) {
      await safe('delete app', async () =>
        appHelper.helpDeleteApp({ gqlClient }, { id: testAppId })
      );
    }

    if (newAuthPermissionSet) {
      await safe('delete auth permission', async () =>
        rbacHelper.helpDeleteAuthPermissionSet(
          { gqlClient, options: adminOptions },
          { id: newAuthPermissionSet.id }
        )
      );
    }

    if (!_.isEmpty(testSetup.listOptions)) {
      const listUserIds = testSetup.listOptions.map((user) => user.userId);
      await safe('delete user', async () =>
        userHelper.deleteMultiUser({ gqlClient }, listUserIds)
      );
    }

    if (testOrg.id) {
      await safe('delete org', async () =>
        helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken)
      );
    }

    await session?.cleanup();
  });
});

function extractPackageIdsFromResults(results, type = 'packages') {
  if (type === 'packages') {
    return _.map(_.get(results, 'packages.records'), 'id');
  } else {
    return _.map(_.get(results, 'packageGrants.records'), (r) =>
      _.get(r, 'package.id')
    );
  }
}

const getGrantedPackageIds = async (client, input) => {
  const grantsRes = await packageHelper.helpGetGrantedPackage(client, input);
  return extractPackageIdsFromResults(grantsRes, 'grants');
};

const getPackagesByIds = async (client, input) => {
  const packagesRes = await packageHelper.helpGetPackages(client, input);
  return extractPackageIdsFromResults(packagesRes, 'packages');
};

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuid.v4(),
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
  },
  userInputs: [
    {
      key: 'adminUser',
      name: `${citestMarker}-admin-user-${uuid.v4()}@localhost`,
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      key: 'regularUser',
      name: `${citestMarker}-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'secondRegularUser',
      name: `${citestMarker}-second-regular-user-${uuid.v4()}@localhost`,
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      key: 'restrictUser',
      name: `${citestMarker}-first-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    },
    {
      key: 'secondRestrictUser',
      name: `${citestMarker}-second-restrict-user-${uuid.v4()}@localhost`,
      roleIds: []
    }
  ]
};
