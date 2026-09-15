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

describe('citest_folder: rbac Admin', () => {
  let superOrgGuid, superOrgId, superUserId, superToken;
  let session;
  let testOrg, testUsers, adminUser;
  let adminOptions;
  let useRBACFeature;
  let createdSchemaId;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();

    // T14/T18: this suite previously ran on the SHARED superadmin session
    // (sys_graphql_citest_superadmin, returned by gqlClient.connect()), which becomes an admin
    // MEMBER of every test org it creates. Any concurrent spec's org-delete/user-delete/OLP-toggle
    // enumerates that org's members and calls the GLOBAL removeAllUserSessions on each — killing
    // this suite's shared token mid-run (bearer validation is per-token-key existence, so a killed
    // token never recovers). The fix is the same isolation guardrail T10/T12/T14 established: use a
    // throwaway superadmin that is a member of no org except its own, so no other spec can enumerate
    // or kill its session. See helpers/superadminSession.js.
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // route all implicit-auth call sites below through the isolated superadmin
    superToken = session.token;

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    // Since this test creates new org, we only need to check for env setting
    useRBACFeature = _.has(introspectionQuery, '__type.name');

    const result = await gqlClient.query(meGql);

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
    expect(testUsers.length).toEqual(2);

    // Login for Admin user
    adminUser = _.find(testSetup.listOptions, (user) => {
      return user.key === 'adminUser';
    });
    adminOptions = adminUser.requestOptions;
  });
  describe('Object operations', () => {
    describe('with Admin user', () => {
      let result, cmsRootFolderId, newFolderId, newTDOId;
      beforeAll(async () => {
        // check admin logins
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac created by admin user',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
      });
      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation createTDO {
            createTDO(
              input: {
                status: "uploaded"
                name: "${citestMarker}-tdo-${uuid.v4()}"
                parentFolderId: "${newFolderId}"
                startDateTime: 1476726655
                stopDateTime: 1476726655
              }
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'createTDO')).toBeDefined();
        expect(_.get(result, 'createTDO.id')).toBeDefined();
        expect(_.get(result, 'createTDO.name')).toContain(
          `${citestMarker}-tdo`
        );
        newTDOId = _.get(result, 'createTDO.id');
      });
      it('should verify access to the folder and the tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        result = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: newFolderId }
        );
        expect(_.get(result, 'folder.id')).toBeDefined();
        expect(_.get(result, 'folder.name')).toContain(
          `${citestMarker}-folder`
        );
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObject(
              id: "${newTDOId}"
            ) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'temporalDataObject.id')).toBeDefined();
        expect(_.get(result, 'temporalDataObject.name')).toContain(
          `${citestMarker}-tdo`
        );
      });
      it('should create user root folder if not exists - with createRootFolders mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpCreateRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        const userRootFolder = _.find(
          rootFolders,
          (rf) => rf.ownerId === adminUser.userId
        );

        expect(userRootFolder).toBeDefined();

        const getFolderACL = await gqlClient.query(
          `query getResourcesACL {
              getACLForResources(
                resourceType: Folder
                ids: ["${userRootFolder.id}"]
              ) {
                records {
                  id
                }
              }
            }`,
          {},
          adminOptions
        );

        let folderACL = _.get(getFolderACL, 'getACLForResources.records');

        // should have 2 ACEs: orgAdmin + aiWARE Full Access, owner ACE + aiWARE Administrator
        expect(folderACL.length).toEqual(2);
      });
      xit('should remove orgAllAccess ACE from admin created folder and tdo', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Folder
        await rbacHelper.helpRemoveRbac(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [newFolderId]
          }
        );
        // TDO
        await rbacHelper.helpRemoveRbac(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'TDO',
            ids: [newTDOId]
          }
        );
      });
    });

    describe('with Admin user to clean up test data', () => {
      let result;
      let folderIds, TDOIds;
      beforeAll(async () => {
        // Login as Admin user
        result = await gqlClient.query(meGql, {}, adminOptions);
        expect(_.get(result, 'me.name')).toContain(
          `${citestMarker}-admin-user`
        );
      });
      it('should get all tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // TDO
        result = await gqlClient.query(
          `query tdo {
            temporalDataObjects(
              offset: 0
              limit: 50
            ) {
              records {
                id
                name
              }
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'temporalDataObjects.records')).toBeDefined();
        TDOIds = _.get(result, 'temporalDataObjects.records').map(
          (tdo) => tdo.id
        );
        expect(TDOIds.length).toEqual(1);
      });
      it('should get all folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(rootFolders, '[0].childFolders.records');
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });
      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        // Clean up TDOs
        for (const TDOId of TDOIds) {
          // delete TDO
          deletedCount++;
          result = await gqlClient.query(
            `mutation deleteTDOs {
              deleteTDO(
                id: "${TDOId}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        }
        expect(deletedCount).toEqual(TDOIds.length);
        deletedCount = 0;
        for (const folderId of folderIds) {
          // delete Folders
          deletedCount++;
          // Get ACL for folder before remove
          const getFolderACL = await gqlClient.query(
            `query getResourcesACL {
              getACLForResources(
                resourceType: Folder
                ids: ["${folderId}"]
              ) {
                records {
                  id
                }
              }
            }`,
            {},
            adminOptions
          );
          let folderACL = _.get(getFolderACL, 'getACLForResources.records');

          for (const ace of folderACL) {
            await rbacHelper.helpRemoveRbac(
              { gqlClient, options: adminOptions },
              {
                resourceType: 'Folder',
                ids: [ace.id]
              }
            );
          }

          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId, orderIndex: 0 }
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(folderIds.length);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let result, error;
      let newAuthGroup, newAuthPermissionSet;
      let authGroups, authPermissionSets;
      let cmsRootFolderId, newFolderId;
      let acl;
      let folderIds;
      beforeAll(async () => {
        result = await gqlClient.query(
          `query authGroup {
            authGroups(
              nameRegex: "${testOrg.name}"
            ) {
              records {
                id
                name
                members(memberType: User, limit: 15, offset: 0) {
                  records {
                    member {
                      __typename
                      ... on User {
                        id
                      }
                    }
                  }
                }
              }
            }
          }`,
          {},
          adminOptions
        );
        authGroups = _.get(result, 'authGroups.records');
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = _.get(g, 'members.records', []);
          hasSuperAdminMember = _.some(
            users,
            (u) => _.get(u, 'member.id', '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        authPermissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          { nameRegex: 'aiWARE', authClass: 'System' }
        );
        expect(authPermissionSets.length).toEqual(4);

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });
      it('should NOT delete default auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        result = null;
        error = null;
        try {
          result = await gqlClient.query(
            `mutation deleteAuthGroup {
              authGroupDelete(
                id: "${authGroups[0].id}"
              ) {
                id
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'This auth group is a protected group.'
        );
      });
      it('should NOT delete default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Try delete default auth groups
        let error;
        try {
          result = await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              id: authPermissionSets[0].id
            }
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(_.toString(error)).toContain(
          'You cannot delete this permission set.'
        );
      });
      it('should NOT modify default permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const authPermissionSet = authPermissionSets[0];
        result = null;
        error = null;
        try {
          result = await gqlClient.query(
            `mutation updatePermission {
              authPermissionSetUpdate(
                input: {
                  id: "${authPermissionSet.id}"
                  name: "${authPermissionSet.name + ' - citest'}"
                  
                }
              ) {
                id
                name
              }
            }`,
            {},
            adminOptions
          );
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        // expect(error.name).toEqual('not_allowed');
        expect(_.toString(error)).toContain(
          'You cannot update this permission set.'
        );
      });
      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation authGroupCreate {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "${citestMarker}-auth-group"
            }) {
              id
              name
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        result = await gqlClient.query(
          `mutation addPermSet {
            authPermissionSetCreate(
              input: {
                name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
                description: "${citestMarker}-auth-permission-set"
                permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE]
              }
            ) {
              id
              name
              permissions
            }
          }`,
          {},
          adminOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: 'Group'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );

        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should create Folder with addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'test folder for rbac with addACEs nested mutation',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms',
            addAcesEntries: `[
              {
                member: {
                  id: "${newAuthGroup.id}",
                  memberType: Group
                },
                permissionSetID: "${newAuthPermissionSet.id}"
              }
            ]`
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');
        acl = _.get(createFolder, 'addACEs.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 new ACE, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });
      it('should get all folders (should be 2 created by admin)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(rootFolders, '[0].childFolders.records');
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toEqual(2);
      });
      it('should delete these folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        for (var folderId of folderIds) {
          // delete Folders
          deletedCount++;
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId, orderIndex: 0 }
          );
        }
        expect(deletedCount).toEqual(2);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const authGroups = await rbacHelper.helpGetGroup({
          gqlClient,
          options: adminOptions
        });
        for (var g of authGroups) {
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
                authGroupDelete(
                  id: "${g.id}"
                ) {
                  id
                }
              }`,
              {},
              adminOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }

        const authGroupsData = await rbacHelper.helpGetGroup({
          gqlClient,
          options: adminOptions
        });
        expect(authGroupsData.length).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          { nameRegex: `${citestMarker}-auth-permission-set` }
        );
        for (var ps of permissionSets) {
          result = await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              id: ps.id
            }
          );
        }

        const permission = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: adminOptions },
          { nameRegex: `${citestMarker}-auth-permission-set` }
        );
        expect(permission.length).toEqual(0);
      });
    });
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'ownerOrganization operations - %s uses OLP features on OLP organization',
    (tokenType) => {
      let result;
      let tokenOptions;
      let newAuthGroup, newAuthPermissionSet;
      let cmsRootFolderId, newFolderId;
      let acl;
      let folderIds;

      beforeAll(async () => {
        // superAdmin can use OLP features on other OLP organizations, whether they belong to OLP or non-OLP.
        tokenOptions =
          tokenType === 'superAdmin'
            ? helpers.requestOptions(superToken)
            : adminOptions;
      });

      it('should get cms root folder via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation authGroupCreate {
          authGroupCreate(input: {
            name: "${citestMarker}-auth-group-${uuid.v4()}"
            description: "${citestMarker}-auth-group"
            ownerOrganization: "${testOrg.guid}"
          }) {
            id
            name
            organization {
              id
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(_.get(result, 'authGroupCreate')).toBeDefined();
        expect(_.get(result, 'authGroupCreate.name')).toContain(
          `${citestMarker}-auth-group`
        );
        expect(_.get(result, 'authGroupCreate.organization.id')).toEqual(
          testOrg.id
        );
        newAuthGroup = _.get(result, 'authGroupCreate');
      });
      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `mutation addPermSet {
          authPermissionSetCreate(
            input: {
              name: "${citestMarker}-auth-permission-set-${uuid.v4()}"
              description: "${citestMarker}-auth-permission-set"
              permissions: [AIWARE_TDO_CREATE,  AIWARE_TDO_DELETE,  AIWARE_TDO_READ,  AIWARE_TDO_SEARCH,  AIWARE_TDO_UPDATE]
              organizationID: ${testOrg.id}  #this is ownerOrganization
            }
          ) {
            id
            name
            permissions
            organization {
              id
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(_.get(result, 'authPermissionSetCreate')).toBeDefined();
        expect(_.get(result, 'authPermissionSetCreate.name')).toContain(
          `${citestMarker}-auth-permission-set`
        );
        expect(
          _.get(result, 'authPermissionSetCreate.organization.id')
        ).toEqual(testOrg.id);
        newAuthPermissionSet = _.get(result, 'authPermissionSetCreate');
      });
      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description:
              'test folder for rbac created by admin for auth group and permission set operations',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolder).toBeDefined();
        expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
        newFolderId = _.get(createFolder, 'id');

        // superAdmin adds ACE to resource with specific ownerOrganization
        result = await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: tokenOptions },
          {
            resourceType: 'Folder',
            ids: [newFolderId],
            ownerOrganization: testOrg.guid,
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: 'Group'
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          }
        );
        acl = _.get(result, 'addACEsToResources.records');
        let checkGroupAdded = false;
        for (var ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });
      it('should get all folders via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const rootFolders = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'cms'
        );
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(_.get(rootFolders[0], 'name')).toContain('cms');
        const childFolders = _.get(rootFolders, '[0].childFolders.records');
        folderIds = childFolders.map((childFolder) => childFolder.treeObjectId);
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });
      it('should get ACL for organization resource', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query getACLForResources {
          getACLForResources(
            ids: [${testOrg.id}]
            resourceType: Organization
            ownerOrganization: "${testOrg.guid}"
          ) {
            records {
              id
              objectID
              objectType
              organization {
                id
                guid
              }
              permissionSet {
                id
                name
                organization {
                  id
                  guid
                }
              }
              member {
                ... on AuthGroup {
                  id
                  name
                  organization {
                    id
                    guid
                  }
                }
              }
            }
          }
        }
        `,
          {},
          tokenOptions
        );
        const acls = _.get(result, 'getACLForResources.records');
        expect(acls.length).toBeGreaterThan(0);
        expect(_.get(acls, '[0].organization.id')).toEqual(testOrg.id);
        expect(_.get(acls, '[0].permissionSet.organization.id')).toEqual(
          testOrg.id
        );
        expect(_.get(acls, '[0].member.organization.id')).toEqual(testOrg.id);
      });
      it('should delete these folders via adminOrg', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        let deletedCount = 0;
        for (var folderId of folderIds) {
          // delete Folders
          deletedCount++;
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId, orderIndex: 0 }
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });
      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        result = await gqlClient.query(
          `query getGroup {
          authGroups (ownerOrganization: "${testOrg.guid}") {
            records {
              id
              name
              organization {
                id
              }
            }
          }
        }`,
          {},
          tokenOptions
        );
        const authGroups = _.get(result, 'authGroups.records');
        for (var g of authGroups) {
          expect(_.get(g, 'organization.id')).toEqual(testOrg.id);
          let error;
          try {
            result = await gqlClient.query(
              `mutation deleteAuthG {
              authGroupDelete(
                id: "${g.id}"
                ownerOrganization: "${testOrg.guid}"
              ) {
                id
              }
            }`,
              {},
              tokenOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(_.toString(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        result = await gqlClient.query(
          `query getGroup {
          authGroups (ownerOrganization: "${testOrg.guid}") {
            records {
              id
              name
            }
          }
        }`,
          {},
          tokenOptions
        );
        expect(
          _.get(result, 'authGroups.records').length
        ).toBeGreaterThanOrEqual(2);
      });
      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permissionSets = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: tokenOptions },
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          }
        );
        for (var ps of permissionSets) {
          expect(_.get(ps, 'organization.id')).toEqual(testOrg.id);
          result = await rbacHelper.helpDeleteAuthPermissionSet(
            { gqlClient, options: tokenOptions },
            {
              id: ps.id,
              ownerOrganization: testOrg.guid
            }
          );
        }

        const permission = await rbacHelper.helpGetAuthPermissions(
          { gqlClient, options: tokenOptions },
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          }
        );
        expect(permission.length).toEqual(0);
      });
    }
  );

  afterAll(async () => {
    if (!_.isEmpty(testSetup.listOptions)) {
      const listUserIds = testSetup.listOptions.map((user) => user.userId);
      await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
    }

    if (testOrg.id) {
      await helpers.deleteOrganization(
        gqlClient.authUrl,
        testOrg.id,
        superToken
      );
    }

    // T18: tear down testOrg FIRST (it is deleted with superToken, the isolated superadmin's own
    // token, and that superadmin is a member of testOrg, so this delete kills the isolated session),
    // then run cleanup() LAST. cleanup() deletes the isolated superadmin's home org + user using the
    // shared bootstrap token (bootstrapOptions), so it is unaffected by the session kill above — but
    // it must run after the testOrg delete, since testOrg's delete needs the isolated superadmin
    // user to still exist.
    await session?.cleanup();
  });
});

const meGql = `
query {
  me {
    id
    name
    organization {
      id
      guid
      jsondata
    }
    authGroups {
      records {
        id
        name
        authClass
        parentGroups {
          records {
            id
            name
            description
          }
        }
        permissionSet{
          id
          name
          permissions
        }
        appRole {
          description
          permissions {
            records {
              id
              name
              __typename
            }
          }
        }
      }
    }
  }
}`;

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
    }
  ]
};
