/* global pending */
const helpers = require('../../../helpers/index');
const orgHelper = require('../../../helpers/organization');
const userHelper = require('../../../helpers/user');
const folderHelper = require('../../../helpers/folder');
const rbacHelper = require('../../../helpers/rbacHelper');
const GraphqlClient = require('../../../helpers/gql.js');
const { createIsolatedSuperadmin } = require('../../../helpers/superadminSession');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup;

describe('citest_folder: folder inherit', () => {
  let superOrgGuid, superOrgId, superUserId, superToken;
  let session;
  let testOrg, testUsers, adminUser, regularUser;
  let restrictUser, secondRestrictUser;
  let adminOptions;
  let regularOptions;
  let restrictOptions, secondRestrictOptions;
  let useRBACFeature;
  let result;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);

    // T19: This suite previously ran on the SHARED superadmin session (sys_graphql_citest_superadmin),
    // which is an admin MEMBER of every test org it creates (setupTestOrgAndUser enrolls the caller).
    // Concurrent specs (MAX_WORKERS=2) delete their test org in teardown; org-delete enumerates all
    // active members and calls removeAllUserSessions(userId) on each — GLOBAL, not org-scoped — which
    // DELetes every one of the shared superadmin's session tokens (including this suite's) at any point
    // during the run. Bearer validation is per-token-key existence, so a killed token never recovers.
    // Fix: same isolation guardrail as T10/T12/T14 — a throwaway superadmin that is a member of no org
    // except its own, so no other spec's org-delete/user-delete/OLP-toggle can enumerate or kill it.
    // See helpers/superadminSession.js.
    //
    // This suite uses BOTH auth styles, so both must be fed from the isolated session:
    //   - implicit-auth call sites (getMyInfo, introspection, deleteMultiUser) read gqlClient.userAuth,
    //     which createIsolatedSuperadmin's internal connect() leaves pointing at the vulnerable shared
    //     bootstrap superadmin — so we must overwrite it here.
    //   - explicit-token call sites (setupTestOrgAndUser, impersonateUser, deleteOrganization) take
    //     superToken, which we point at the isolated session's token.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options;
    superToken = session.token;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    result = await userHelper.getMyInfo({
      gqlClient
    });

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');

    testSetup = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      createOrgAndUserInput
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

    // Login for Restrict user
    restrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'restrictUser';
    });
    restrictOptions = restrictUser.requestOptions;

    // Login for Secondary Restrict user
    secondRestrictUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'secondRestrictUser';
    });
    secondRestrictOptions = secondRestrictUser.requestOptions;
  });

  afterAll(async () => {
    // T19: tear down the isolated superadmin's own org + user. This runs AFTER the nested
    // afterAll that deletes testOrg via superToken (Jest runs inner-scope teardown before
    // outer-scope), so cleanup() — which uses its own captured bootstrapOptions, not
    // session.token — remains valid even though deleting testOrg kills session.token.
    await session?.cleanup();
  });

  describe('ACE Inheritance with ace inherit flag', () => {
    let parentFolderId, childFolderId, childTDOId;
    let testAuthGroupId, testPermissionSetId;
    let adminUserId, regularUserId;
    let cmsRootFolderId;

    describe('with Admin user', () => {
      beforeAll(async () => {
        // Verify admin login
        result = await userHelper.getMyInfo({
          gqlClient,
          options: adminOptions
        });

        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
        adminUserId = _.get(result, 'me.id');

        result = await userHelper.getMyInfo({
          gqlClient,
          options: regularOptions
        });
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = _.get(result, 'me.id');

        // Create test auth group
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(
              input: {
                name: "${citestMarker}-inherit-test-group-${uuid.v4()}"
                description: "Test group for inheritance testing"
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        testAuthGroupId = _.get(result, 'authGroupCreate.id');
        expect(testAuthGroupId).toBeDefined();

        result = await rbacHelper.helpCreateAuthPermissionSet(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-inherit-test-permissions-${uuid.v4()}`,
            description: 'Test permissions for inheritance testing',
            permissions: [
              'AIWARE_FOLDER_READ',
              'AIWARE_FOLDER_UPDATE',
              'AIWARE_TDO_READ'
            ]
          }
        );

        testPermissionSetId = _.get(result, 'authPermissionSetCreate.id');
        expect(testPermissionSetId).toBeDefined();

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create parent folder with ACE having inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        const folderData = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-parent-folder-inherit-${uuid.v4()}`,
            description: 'Parent folder with inherit ACE',
            parentId: cmsRootFolderId,
            addAcesEntries: `[
              {
                member: {
                  id: "${testAuthGroupId}"
                  memberType: Group
                }
                permissionSetID: "${testPermissionSetId}"
                options: ["inherit"]
              },
              {
                member: {
                  id: "${regularUserId}"
                  memberType: User
                }
                permissionSetID: "${testPermissionSetId}"
                options: ["inherit"]
              }
            ]`
          }
        );

        parentFolderId = _.get(folderData, 'id');
        expect(parentFolderId).toBeDefined();

        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: regularUser.userId, organizationGuid: testOrg.guid }
        );
        regularOptions = impersonated.requestOptions;
      });

      it('should verify parent folder ACE has options: inherit', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await rbacHelper.helpGetAclForResources(
          { gqlClient, options: adminOptions },
          {
            ids: [parentFolderId],
            resourceType: 'Folder'
          }
        );
        const acl = _.get(result, 'getACLForResources.records', []);
        const inheritACE = acl.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritACE).toBeDefined();
        expect(inheritACE.options).toContain('inherit');
      });

      it("should create parent folder with user private group ACE having options: ['inherit']", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [parentFolderId],
            entries: [
              {
                member: {
                  id: adminUserId,
                  memberType: 'User'
                },
                permissionSetID: testPermissionSetId,
                options: ['inherit']
              }
            ]
          }
        );

        const acl = _.get(result, 'addACEsToResources.records');
        const userPrivateACE = acl.find(
          (ace) =>
            ace.options.includes('inherit') &&
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`)
        );
        expect(userPrivateACE).toBeDefined();
        expect(userPrivateACE.options).toContain('inherit');
      });

      it('should create child folder and verify ACE inheritance with inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await folderHelper.helpCreateFolder(
          {
            gqlClient,
            options: adminOptions
          },
          {
            name: `${citestMarker}-child-folder-${uuid.v4()}`,
            description: 'Child folder to test inheritance',
            parentId: parentFolderId
          }
        );
        childFolderId = _.get(result, 'id');
        expect(childFolderId).toBeDefined();

        // Verify that ACEs with inherit flag are inherited
        result = await rbacHelper.helpGetAclForResources(
          { gqlClient, options: adminOptions },
          {
            ids: [childFolderId],
            resourceType: 'Folder'
          }
        );

        const childACL = _.get(result, 'getACLForResources.records', []);

        //expect(childACL).toEqual([]);

        // Should inherit the regular test group ACE with inherit flag
        const inheritedTestGroupACE = childACL.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();
        expect(inheritedTestGroupACE.options).toContain('inherit');

        // Should inherit the user private group ACE with inherit flag (this normally wouldn't inherit)
        const inheritedUserPrivateACE = childACL.find(
          (ace) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
        expect(inheritedUserPrivateACE.options).toContain('inherit');
      });

      it('should create TDO in child folder and verify ACE inheritance without inherit flag', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                name: "${citestMarker}-child-tdo-${uuid.v4()}"
                description: "Child TDO to test inheritance"
                parentFolderId: "${childFolderId}"
                startDateTime: "2025-08-26T00:00:00Z"
                stopDateTime: "2025-08-26T00:00:00Z"
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        childTDOId = _.get(result, 'createTDO.id');
        expect(childTDOId).toBeDefined();

        // Verify that ACEs are inherited to TDO (TDOs don't have inherit flag since they're not containers)
        result = await rbacHelper.helpGetAclForResources(
          { gqlClient, options: adminOptions },
          {
            ids: [childTDOId],
            resourceType: 'TDO'
          }
        );

        const tdoACL = _.get(result, 'getACLForResources.records', []);

        // Should inherit the regular test group ACE
        const inheritedTestGroupACE = tdoACL.find(
          (ace) =>
            ace.member.id === testAuthGroupId &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedTestGroupACE).toBeDefined();

        // Should inherit the user private group ACE (because parent had inherit flag)
        const inheritedUserPrivateACE = tdoACL.find(
          (ace) =>
            (ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`) &&
            ace.permissionSet.id === testPermissionSetId
        );
        expect(inheritedUserPrivateACE).toBeDefined();
      });

      it('should verify regular user can access resources through inherited ACE', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
          return;
        }

        // Regular user should be able to access child TDO through inherited user private group ACE
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(id: "${childTDOId}") {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toEqual(childTDOId);

        // TODO: For some reason the following always fails. If the test cleanup is disabled executing the same
        // query manually works as expected. For some reason this only happens with folders and not TDOs. It is possible
        // to have a stale rbac cache somewhere?

        // Regular user should be able to access child folder through inherited user private group ACE
        /*
        result = await gqlClient.query(
          `query folder {
            folder(id: "${parentFolderId}") {
              id
              name
            }
          }`,
          {},
          regularOptions
        );
        expect(_.get(result, 'folder.id')).toEqual(parentFolderId);
        */
      });

      afterAll(async () => {
        if (!useRBACFeature) {
          return;
        }

        // Clean up test resources
        if (childTDOId) {
          await gqlClient.query(
            `mutation deleteTDO {
              deleteTDO(id: "${childTDOId}") { id }
            }`,
            {},
            adminOptions
          );
        }

        if (childFolderId) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: childFolderId, orderIndex: 0 }
          );
        }

        if (parentFolderId) {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: parentFolderId, orderIndex: 0 }
          );
        }

        if (testAuthGroupId) {
          await rbacHelper.helpDeleteAuthGroup(
            { gqlClient, options: adminOptions },
            { id: testAuthGroupId }
          );
        }

        if (testPermissionSetId) {
          await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: adminOptions },
            { id: testPermissionSetId }
          );
        }
      });

      describe('Folder without inherit flag comparison', () => {
        let parentFolderNoInheritId, childFolderNoInheritId;

        beforeAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Create parent folder WITHOUT inherit flag on BasicUserInfo private group ACE
          result = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-parent-folder-no-inherit-${uuid.v4()}`,
              description: 'Parent folder without inherit ACE',
              parentId: cmsRootFolderId,
              addAcesEntries: `[
                {
                  member: {
                    id: "${testAuthGroupId}"
                    memberType: Group
                  }
                  permissionSetID: "${testPermissionSetId}"
                }
              ]`
            }
          );

          parentFolderNoInheritId = _.get(result, 'id');
          expect(parentFolderNoInheritId).toBeDefined();
        });

        it('should verify parent folder ACE does NOT have inherit flag', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await rbacHelper.helpGetAclForResources(
            { gqlClient, options: adminOptions },
            {
              ids: [parentFolderNoInheritId],
              resourceType: 'Folder'
            }
          );

          const acl = _.get(result, 'getACLForResources.records', []);
          const userPrivateACE = acl.find(
            (ace) =>
              ace.member.id === adminUserId ||
              ace.member.name ===
                `Default Private Group for User ${adminUserId}`
          );
          expect(userPrivateACE).toBeDefined();
          expect(userPrivateACE.options).not.toContain('inherit');
        });

        it('should create child folder and verify user private group ACE is NOT inherited', async () => {
          if (!useRBACFeature) {
            pending('useRBACFeature = false');
            return;
          }

          result = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-child-folder-no-inherit-${uuid.v4()}`,
              description: 'Child folder to test no inheritance',
              parentId: parentFolderNoInheritId
            }
          );

          childFolderNoInheritId = _.get(result, 'id');
          expect(childFolderNoInheritId).toBeDefined();

          // Verify that user private group ACE is NOT inherited (due to authGroupClass restriction)
          result = await rbacHelper.helpGetAclForResources(
            { gqlClient, options: adminOptions },
            {
              ids: [childFolderNoInheritId],
              resourceType: 'Folder'
            }
          );

          const childACL = _.get(result, 'getACLForResources.records', []);

          // Should NOT inherit the user private group ACE (due to authGroupClass restriction)
          const notInheritedUserPrivateACE = childACL.find(
            (ace) =>
              ace.member.id === regularUserId &&
              ace.permissionSet.id === testPermissionSetId
          );
          expect(notInheritedUserPrivateACE).toBeUndefined();
        });

        afterAll(async () => {
          if (!useRBACFeature) {
            return;
          }

          // Clean up test resources
          if (childFolderNoInheritId) {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              {
                folderId: childFolderNoInheritId,
                orderIndex: 1
              }
            );
          }

          if (parentFolderNoInheritId) {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              {
                folderId: parentFolderNoInheritId,
                orderIndex: 1
              }
            );
          }

          if (!_.isEmpty(testSetup.listOptions)) {
            const listUserIds = testSetup.listOptions.map(
              (user) => user.userId
            );
            await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
          }

          if (testOrg.id) {
            helpers.deleteOrganization(
              gqlClient.authUrl,
              testOrg.id,
              superToken
            );
          }
        });
      });
    });
  });
});

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
