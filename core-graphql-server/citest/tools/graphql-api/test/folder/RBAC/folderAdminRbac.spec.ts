import { v4 as uuidv4 } from 'uuid';
import { helpers } from '../../../src/helpers';

import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';

import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import {
  AuthGroupMemberType,
  AuthObjectClass,
  AuthPermissionType,
  AuthResourceType,
  RootFolderType
} from '../../../src/gql';

const config = helpers.config;

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp || false;

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
let testSetup: any;

describe('citest_folder: rbac Admin', () => {
  let superOrgGuid: any, superOrgId: any, superUserId: any, superToken: any;
  let testOrg: any, testUsers: any, adminUser: any;
  let adminOptions: any;
  let useRBACFeature: boolean;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    // T25: create the test org via an ISOLATED throwaway superadmin rather than
    // the shared session. The isolated SA becomes the auto-enrolled member of
    // the test org, so deleting the test org in afterAll kills only the
    // isolated session — the shared session (used by every other spec in the
    // shard) is untouched. superUserId/superToken/superOrg* are therefore
    // derived from the isolated client's me() so the "superadmin is a member of
    // the test org" assertion below still holds. See
    // test/helpers/superadminSession.ts.
    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    const isoClient = isolatedSuperadmin.client;

    const meRes = await isoClient.sdk.me();
    expect(meRes?.data?.me).toBeDefined();
    superToken = isolatedSuperadmin.token;

    superOrgGuid = meRes?.data?.me?.organization?.guid;
    superOrgId = meRes?.data?.me?.organization?.id;
    superUserId = meRes?.data?.me?.id;

    const introspection = await gqlClient.sdk.graphqlServiceInfo();
    useRBACFeature =
      !!introspection?.data?.graphqlServiceInfo?.featureFlags
        ?.enableDefaultDesktopApp || true;

    testSetup = await setupTestOrgAndUser(isoClient, createOrgAndUserInput);

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    testUsers = testSetup.listOptions ?? [];
    // expect(testUsers.length).toEqual(2);

    adminUser = (testSetup.listOptions ?? []).find(
      (u: any) =>
        u.userName?.includes('admin-') || u.userName?.includes('-admin-user-')
    );
    adminOptions = adminUser?.requestOptions;
  });

  describe('Object operations', () => {
    describe('with Admin user', () => {
      let result: any, cmsRootFolderId: any, newFolderId: any, newTDOId: any;
      beforeAll(async () => {
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(result?.data?.me?.name).toContain(`${citestMarker}-admin-user`);
      });

      it('should get cms root folder', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should create folder', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac created by admin user',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolder = createFolderRes?.data?.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder?.id;
      });

      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          adminOptions
        );
        expect(res?.data?.createTDO).toBeDefined();
        expect(res?.data?.createTDO?.id).toBeDefined();
        expect(res?.data?.createTDO?.name).toContain(`${citestMarker}-tdo`);
        newTDOId = res?.data?.createTDO?.id;
      });

      it('should verify access to the folder and the tdo', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const folderRes = await gqlClient.sdk.folder(
          { id: newFolderId },
          adminOptions
        );
        expect(folderRes?.data?.folder?.id).toBeDefined();
        expect(folderRes?.data?.folder?.name).toContain(
          `${citestMarker}-folder`
        );

        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: newTDOId },
          adminOptions
        );
        expect(tdoRes?.data?.temporalDataObject?.id).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.name).toContain(
          `${citestMarker}-tdo`
        );
      });

      it('should create user root folder if not exists - with createRootFolders mutation', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const createRootRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = createRootRes?.data?.createRootFolders ?? [];
        const userRootFolder = (rootFolders ?? []).find(
          (rf: any) => rf.ownerId === adminUser?.userId
        );
        expect(userRootFolder).toBeDefined();

        const getFolderACL = await gqlClient.sdk.GetResourcesACL(
          { resourceType: AuthResourceType.Folder, ids: [userRootFolder!.id] },
          adminOptions
        );
        const folderACL = getFolderACL?.data?.getACLForResources?.records ?? [];
        expect(folderACL.length).toEqual(2);
      });

      xit('should remove orgAllAccess ACE from admin created folder and tdo', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        await gqlClient.query(
          `mutation removeACE ( $resourceType: AuthResourceType!, $ids: [ID!]!, $ownerOrganization: ID, $resourceTypeSchemaId: ID ) {
            removeACEsFromResource(
              resourceType: $resourceType
              ids: $ids
              ownerOrganization: $ownerOrganization
              resourceTypeSchemaId: $resourceTypeSchemaId
            ) { records { id } }
          }`,
          { resourceType: 'Folder', ids: [newFolderId] },
          adminOptions
        );
        await gqlClient.query(
          `mutation removeACE ( $resourceType: AuthResourceType!, $ids: [ID!]!, $ownerOrganization: ID, $resourceTypeSchemaId: ID ) {
            removeACEsFromResource(
              resourceType: $resourceType
              ids: $ids
              ownerOrganization: $ownerOrganization
              resourceTypeSchemaId: $resourceTypeSchemaId
            ) { records { id } }
          }`,
          { resourceType: 'TDO', ids: [newTDOId] },
          adminOptions
        );
      });
    });

    describe('with Admin user to clean up test data', () => {
      let result: any;
      let folderIds: any[] = [];
      let TDOIds: any[] = [];
      beforeAll(async () => {
        result = await gqlClient.sdk.me({}, adminOptions);
        expect(result?.data?.me?.name).toContain(`${citestMarker}-admin-user`);
      });

      it('should get all tdos', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const tdosRes = await gqlClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          adminOptions
        );
        const tdoRecords = tdosRes?.data?.temporalDataObjects?.records ?? [];
        expect(tdoRecords).toBeDefined();
        TDOIds = tdoRecords.map((tdo: any) => tdo.id);
        expect(TDOIds.length).toEqual(1);
      });

      it('should get all folders', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });

      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        let deletedCount = 0;
        for (const TDOId of TDOIds) {
          deletedCount++;
          await gqlClient.sdk.deleteTDO({ id: TDOId }, adminOptions);
        }
        expect(deletedCount).toEqual(TDOIds.length);
        deletedCount = 0;
        for (const folderId of folderIds) {
          deletedCount++;
          const getFolderACL = await gqlClient.sdk.GetResourcesACL(
            { resourceType: AuthResourceType.Folder, ids: [folderId] },
            adminOptions
          );
          const folderACL =
            getFolderACL?.data?.getACLForResources?.records ?? [];
          for (const ace of folderACL) {
            await gqlClient.query(
              `mutation removeACE ( $resourceType: AuthResourceType!, $ids: [ID!]!, $ownerOrganization: ID, $resourceTypeSchemaId: ID ) {
                removeACEsFromResource(
                  resourceType: $resourceType
                  ids: $ids
                  ownerOrganization: $ownerOrganization
                  resourceTypeSchemaId: $resourceTypeSchemaId
                ) { records { id } }
              }`,
              { resourceType: AuthResourceType.Folder, ids: [ace!.id] },
              adminOptions
            );
          }

          await gqlClient.sdk.deleteFolder(
            { input: { id: folderId, orderIndex: 0 } },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(folderIds.length);
      });
    });
  });

  describe('RBAC Auth Group and Permission Set Operations', () => {
    describe('with Admin user', () => {
      let result: any, error: any;
      let newAuthGroup: any, newAuthPermissionSet: any;
      let authGroups: any, authPermissionSets: any;
      let cmsRootFolderId: any, newFolderId: any;
      let acl: any;
      let folderIds: any;
      beforeAll(async () => {
        result = await gqlClient.sdk.authGroups(
          { nameRegex: testOrg.name },
          adminOptions
        );
        authGroups = result?.data?.authGroups?.records ?? [];
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = g?.members?.records ?? [];
          hasSuperAdminMember = users.some(
            (u: any) => (u?.member?.id ?? '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        const authPermRes = await gqlClient.sdk.authPermissionSets(
          { nameRegex: 'aiWARE', authClass: [AuthObjectClass.System] },
          adminOptions
        );
        authPermissionSets =
          authPermRes?.data?.authPermissionSets?.records ?? [];
        expect(authPermissionSets.length).toEqual(4);

        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should NOT delete default auth group', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        result = null;
        error = null;
        try {
          await gqlClient.sdk.authGroupDelete(
            { id: authGroups[0].id },
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(String(error)).toContain(
          'This auth group is a protected group.'
        );
      });

      it('should NOT delete default permission set', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        let err;
        try {
          await gqlClient.sdk.authPermissionSetDelete(
            { id: authPermissionSets[0].id },
            adminOptions
          );
        } catch (e) {
          err = e;
        }
        expect(err).toBeDefined();
        expect(String(err)).toContain('You cannot delete this permission set.');
      });

      it('should NOT modify default permission set', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const authPermissionSet = authPermissionSets[0];
        result = null;
        error = null;

        const query = `
          mutation updatePermission($id: ID!, $name: String!) {
            authPermissionSetUpdate(
              input: {
                id: $id
                name: $name
              }
            ) {
              id
              name
            }
          }
        `;
        try {
          await gqlClient.query(
            query,
            {
              id: authPermissionSet.id,
              name: authPermissionSet.name + ' - citest'
            },
            adminOptions
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(String(error)).toContain(
          'You cannot update this permission set.'
        );
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`
            }
          },
          adminOptions
        );
        expect(res?.data?.authGroupCreate).toBeDefined();
        expect(res?.data?.authGroupCreate?.name).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = res?.data?.authGroupCreate;
      });

      it('should create a new permission set', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ]
            }
          },
          adminOptions
        );
        expect(res?.data?.authPermissionSetCreate).toBeDefined();
        expect(res?.data?.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = res?.data?.authPermissionSetCreate;
      });

      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolder = createFolderRes?.data?.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder?.id;

        const res = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        acl = res?.data?.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);
      });

      it('should create Folder with addACEs nested mutation', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');

        const createFolder = await gqlClient.query(
          `
            mutation createFolder(
              $name: String!, $description: String!, $parentId: ID!, $rootFolderType: RootFolderType
              $orderIndex: Int, $userId: ID, $entityTags: [EntityTagInput]
            ) {
              createFolder(
                input: {
                  name: $name
                  description: $description
                  parentId: $parentId
                  rootFolderType: $rootFolderType
                  orderIndex: $orderIndex
                  userId: $userId
                  entityTags: $entityTags
                }
              ) {
                id
                name
                orderIndex
                addACEs(
                  entries: [
                    {
                      member: {
                        id: "${newAuthGroup.id}",
                        memberType: Group
                      },
                      permissionSetID: "${newAuthPermissionSet.id}"
                    }
                  ]
                ) {
                  records {
                    id
                    options
                    objectID
                    objectType
                  }
                  count
                }
              }
            }
          `,
          {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'test folder for rbac with addACEs nested mutation',
            parentId: cmsRootFolderId,
            rootFolderType: 'cms'
          },
          adminOptions
        );

        const createFolder2 = createFolder?.createFolder;
        expect(createFolder2).toBeDefined();
        expect(createFolder2?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder2?.id;
        acl = createFolder?.createFolder?.addACEs?.records ?? [];

        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(3);
      });

      it('should get all folders (should be 2 created by admin)', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toEqual(2);
      });

      it('should delete these folders', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        let deletedCount = 0;
        for (const folderId of folderIds) {
          deletedCount++;
          await gqlClient.sdk.deleteFolder(
            { input: { id: folderId, orderIndex: 0 } },
            adminOptions
          );
        }
        expect(deletedCount).toEqual(2);
      });

      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const authGroupsRes = await gqlClient.sdk.authGroups({}, adminOptions);
        const authGroupsList = authGroupsRes?.data?.authGroups?.records ?? [];
        for (const g of authGroupsList) {
          let err;
          try {
            await gqlClient.sdk.authGroupDelete({ id: g?.id! }, adminOptions);
          } catch (e) {
            err = e;
          }
          if (g?.name.includes(`${citestMarker}-org`)) {
            expect(String(err)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        const authGroupsDataRes = await gqlClient.sdk.authGroups(
          {},
          adminOptions
        );
        const authGroupsData =
          authGroupsDataRes?.data?.authGroups?.records ?? [];
        expect(authGroupsData.length).toBeGreaterThanOrEqual(2);
      });

      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const permRes = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permissionSets = permRes?.data?.authPermissionSets?.records ?? [];
        for (const ps of permissionSets) {
          await gqlClient.sdk.authPermissionSetDelete(
            { id: ps?.id! },
            adminOptions
          );
        }
        const permRes2 = await gqlClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permission = permRes2?.data?.authPermissionSets?.records ?? [];
        expect(permission.length).toEqual(0);
      });
    });
  });

  describe.each(['superAdmin', 'orgAdmin'])(
    'ownerOrganization operations - %s uses OLP features on OLP organization',
    (tokenType: string) => {
      let result: any;
      let tokenOptions: any;
      let newAuthGroup: any, newAuthPermissionSet: any;
      let cmsRootFolderId: any, newFolderId: any;
      let acl: any;
      let folderIds: any;

      beforeAll(async () => {
        tokenOptions =
          tokenType === 'superAdmin'
            ? // helpers.requestOptions returns an object with a `headers` key; GraphQL client
              // expects HeadersInit (Record<string,string>), so pass the headers directly.
              helpers.requestOptions(superToken).headers
            : adminOptions;
      });

      it('should get cms root folder via adminOrg', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`,
              ownerOrganization: testOrg.guid
            }
          },
          tokenOptions
        );
        expect(res?.data?.authGroupCreate).toBeDefined();
        expect(res?.data?.authGroupCreate?.name).toContain(
          `${citestMarker}-auth-group`
        );
        expect(res?.data?.authGroupCreate?.organization?.id).toEqual(
          testOrg.id
        );
        newAuthGroup = res?.data?.authGroupCreate;
      });

      it('should create a new permission set', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ],
              organizationID: testOrg.id
            }
          },
          tokenOptions
        );
        expect(res?.data?.authPermissionSetCreate).toBeDefined();
        expect(res?.data?.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        expect(res?.data?.authPermissionSetCreate?.organization?.id).toEqual(
          testOrg.id
        );
        newAuthPermissionSet = res?.data?.authPermissionSetCreate;
      });

      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolder = createFolderRes?.data?.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder?.id;

        const res = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [newFolderId],
            ownerOrganization: testOrg.guid,
            entries: [
              {
                member: {
                  id: newAuthGroup.id,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          tokenOptions
        );
        acl = res?.data?.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace.id.includes(newFolderId) &&
              ace.id.includes(newAuthGroup.id) &&
              ace.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);
      });

      it('should get all folders via adminOrg', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const rfRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rfRes?.data?.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });

      it('should get ACL for organization resource', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.sdk.GetResourcesACL(
          {
            ids: [testOrg.id],
            resourceType: AuthResourceType.Organization,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        const acls = res?.data?.getACLForResources?.records ?? [];
        expect(acls.length).toBeGreaterThan(0);
        expect(acls[0]?.organization?.id).toEqual(testOrg.id);
        expect(acls[0]?.permissionSet?.organization?.id).toEqual(testOrg.id);
        // expect(acls[0]?.member?.organization?.id).toEqual(testOrg.id);
      });

      it('should delete these folders via adminOrg', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        let deletedCount = 0;
        for (const folderId of folderIds) {
          deletedCount++;
          await gqlClient.sdk.deleteFolder(
            { input: { id: folderId, orderIndex: 0 } },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });

      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const res = await gqlClient.query(
          `query getGroup { authGroups (ownerOrganization: "${testOrg.guid}") { records { id name organization { id } } } }`,
          {},
          tokenOptions
        );
        const authGroups = res?.authGroups?.records ?? [];
        for (const g of authGroups) {
          expect(g?.organization?.id).toEqual(testOrg.id);
          let error: any;
          try {
            await gqlClient.sdk.authGroupDelete(
              { id: g.id, ownerOrganization: testOrg.guid },
              tokenOptions
            );
          } catch (e) {
            error = e;
          }
          if (g.name.includes(`${citestMarker}-org`)) {
            expect(String(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }
        const res2 = await gqlClient.query(
          `query getGroup { authGroups (ownerOrganization: "${testOrg.guid}") { records { id name } } }`,
          {},
          tokenOptions
        );
        expect(res2?.authGroups?.records?.length ?? 0).toBeGreaterThanOrEqual(
          2
        );
      });

      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) pending('useRBACFeature = false');
        const permRes = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        const permissionSets = permRes?.data?.authPermissionSets?.records ?? [];
        for (const ps of permissionSets) {
          expect(ps?.organization?.id).toEqual(testOrg.id);
          await gqlClient.sdk.authPermissionSetDelete(
            { id: ps!.id, ownerOrganization: testOrg.guid },
            tokenOptions
          );
        }
        const permRes2 = await gqlClient.sdk.authPermissionSets(
          {
            nameRegex: `${citestMarker}-auth-permission-set`,
            ownerOrganization: testOrg.guid
          },
          tokenOptions
        );
        const permission = permRes2?.data?.authPermissionSets?.records ?? [];
        expect(permission.length).toEqual(0);
      });
    }
  );

  afterAll(async () => {
    if (testSetup?.listOptions && testSetup.listOptions.length > 0) {
      const listUserIds = testSetup.listOptions.map((user: any) => user.userId);
      for (const id of listUserIds) {
        try {
          await gqlClient.sdk.deleteUser(
            { id },
            // pass headers object rather than wrapper
            helpers.requestOptions(superToken).headers
          );
        } catch (e) {
          // ignore
        }
      }
    }

    if (testOrg.id) {
      await helpers.deleteOrganization(
        gqlClient.authUrl,
        testOrg.id,
        superToken
      );
    }

    // T25: tear down the isolated throwaway superadmin org/user LAST — after the
    // test-org teardown above. cleanup() uses the shared session and a
    // soft-delete, so it never kills the shared session. See
    // test/helpers/superadminSession.ts.
    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });
});

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuidv4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    metadata: { features: { enableRBACFeature: 'enabled' } },
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
  },
  userInputs: [
    {
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652',
        '032218c3-d47e-4287-9d16-7bb867c01266',
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f'
      ].filter((roleId) => roleId)
    }
  ]
};
