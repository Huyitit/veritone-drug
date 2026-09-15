import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '@api/src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import {
  impersonateUser as impersonateUserHelper,
  safe
} from '@api/src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '@api/test/helpers/superadminSession';
import {
  pollUntilReady,
  waitForAuthGroupMembership
} from '@api/test/helpers/rbacPropagation';
import { setupTestOrgAndUser } from '@api/test/helpers/organization.helper';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  FolderOrderByField,
  OrderDirection,
  RootFolderType,
  StringMatch
} from '@api/src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

describe('citest_folder: rbac user', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superClient: GraphqlClient;
  let superUserId: any;

  let testSetup: any;
  let testOrg: any;
  let useRBACFeature: boolean;

  let adminUser: any, adminOptions: Record<string, string> | undefined;
  let regularUser: any, regularOptions: Record<string, string> | undefined;
  let restrictUser: any, restrictOptions: Record<string, string> | undefined;
  let secondRestrictUser: any,
    secondRestrictOptions: Record<string, string> | undefined;
  let privateAuthGroupId: any;
  let createdSDOId: any, createdSchemaId: any;

  async function impersonateUser(
    userId: string,
    organizationGuid: string
  ): Promise<Record<string, string>> {
    const impersonated = await impersonateUserHelper(
      isolatedSuperadmin.token,
      userId,
      organizationGuid
    );
    return impersonated.requestOptions;
  }

  beforeAll(async () => {
    const env = config.env;

    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    superClient = isolatedSuperadmin.client;

    const introspectionRes: any = await superClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);
    useRBACFeature = _.has(introspectionRes, '__type.name');

    const meRes = await superClient.sdk.meBasic();
    expect(meRes.data.me).toBeDefined();
    superUserId = meRes.data.me?.id;

    testSetup = await setupTestOrgAndUser(superClient, createOrgAndUserInput);

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    const testUsers = _.get(testOrg, 'users.records');
    // test users + isolated superadmin who created the org
    expect(testUsers.length).toEqual(6);

    const listOptions = testSetup.listOptions ?? [];
    const findUser = (marker: string) =>
      listOptions.find((u: any) => u.userName?.includes(marker));

    adminUser = findUser('-admin-user-');
    adminOptions = adminUser?.requestOptions;

    regularUser = findUser('-regular-user-');
    regularOptions = regularUser?.requestOptions;

    restrictUser = findUser('-first-restrict-user-');
    restrictOptions = restrictUser?.requestOptions;

    secondRestrictUser = findUser('-second-restrict-user-');
    secondRestrictOptions = secondRestrictUser?.requestOptions;
  });

  afterAll(async () => {
    if (testSetup?.listOptions?.length) {
      await safe('delete users', async () => {
        for (const user of testSetup.listOptions) {
          await superClient.sdk.deleteUser({ id: user.userId });
        }
      });
    }

    if (testOrg?.id) {
      await safe('delete organization', () =>
        helpers.deleteOrganization(
          superClient.authUrl,
          testOrg.id,
          isolatedSuperadmin.token
        )
      );
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('Object operations', () => {
    let contentFolderTemplateId: any;

    describe('with Regular user', () => {
      let cmsRootFolderId: any, newFolderId: any, newTDOId: any;

      beforeAll(async () => {
        const res = await superClient.sdk.meBasic({}, regularOptions);
        expect(res.data.me?.name).toContain(`${citestMarker}-regular-user`);
      });

      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const rootFoldersRes = await superClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          regularOptions
        );
        const rootFolders = rootFoldersRes.data.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const createFolderRes = await superClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac created by regular user',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          regularOptions
        );
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder?.id;
      });

      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          regularOptions
        );
        expect(res.data.createTDO).toBeDefined();
        expect(res.data.createTDO?.id).toBeDefined();
        expect(res.data.createTDO?.name).toContain(`${citestMarker}-tdo`);
        newTDOId = res.data.createTDO?.id;
      });

      it('should get the folder and the tdo by id', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const folderRes = await superClient.sdk.folderBasic(
          { id: newFolderId },
          regularOptions
        );
        expect(folderRes.data.folder?.id).toBeDefined();
        expect(folderRes.data.folder?.name).toContain(`${citestMarker}-folder`);

        const tdoRes = await superClient.sdk.temporalDataObject(
          { id: newTDOId },
          regularOptions
        );
        expect(tdoRes.data.temporalDataObject?.id).toBeDefined();
        expect(tdoRes.data.temporalDataObject?.name).toContain(
          `${citestMarker}-tdo`
        );
      });

      it('should be able to do getACLForResources on the owned objects', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.GetResourcesACL(
          { resourceType: AuthResourceType.Tdo, ids: [newTDOId] },
          regularOptions
        );
        const records = res.data.getACLForResources?.records ?? [];
        expect(records).toBeDefined();
        expect(records[0]?.id).toContain(newTDOId);
      });

      it('should get tdo through scrolling all temporal data objects (should have only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          regularOptions
        );
        const TDOs = res.data.temporalDataObjects?.records ?? [];
        expect(TDOs.length).toEqual(1);
      });

      it('should get tdo through search (should be only 1)', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          regularOptions
        );
        const TDOs = res.data.temporalDataObjects?.records ?? [];
        expect(TDOs.length).toEqual(1);
      });

      it('should create Data Registry', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createDataRegistry(
          {
            input: {
              id: uuidv4(),
              name: `${citestMarker}-data-registry-${uuidv4()}`,
              description:
                'test data registry for rbac auth group and permission set operations',
              source: 'citest-source'
            }
          },
          regularOptions
        );
        expect(res.data.createDataRegistry).toBeDefined();
        expect(res.data.createDataRegistry?.name).toContain(
          `${citestMarker}-data-registry`
        );
        testOrg.dataRegistryId = res.data.createDataRegistry?.id;
      });

      it('should create Schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createSchema(
          {
            input: {
              id: uuidv4(),
              dataRegistryId: testOrg.dataRegistryId,
              majorVersion: 1,
              minorVersion: 0,
              status: 'published' as any,
              definition: {
                type: 'object',
                properties: { name: { type: 'string' } }
              }
            }
          },
          adminOptions
        );
        expect(res.data.createSchema).toBeDefined();
        expect(res.data.createSchema?.id).toBeDefined();
        createdSchemaId = res.data.createSchema?.id;
      });

      it('should be able to create a SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createStructuredData(
          {
            input: {
              schemaId: createdSchemaId,
              data: { name: 'test SDO' }
            }
          },
          regularOptions
        );
        createdSDOId = res.data.createStructuredData?.id;
        expect(res.data.createStructuredData).toBeDefined();
        expect(res.data.createStructuredData?.data?.name).toContain(`test SDO`);
        expect(res.data.createStructuredData?.schemaId).toEqual(
          createdSchemaId
        );
      });

      it('should get the created SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // Re-impersonate the regular user to ensure the token is fresh
        regularOptions = await impersonateUser(
          regularUser.userId,
          testOrg.guid
        );

        const res = await superClient.sdk.structuredData(
          { id: createdSDOId, schemaId: createdSchemaId },
          regularOptions
        );
        expect(res.data.structuredData?.id).toBeDefined();
        expect(res.data.structuredData?.schemaId).toEqual(createdSchemaId);
        expect(res.data.structuredData?.data?.name).toContain(`test SDO`);
      });

      it('should be able to create Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createFolderContentTemplate(
          {
            input: {
              folderId: newFolderId,
              sdoId: createdSDOId,
              schemaId: createdSchemaId
            }
          },
          regularOptions
        );
        const folderContentTemplate = res.data.createFolderContentTemplate;
        expect(folderContentTemplate?.id).toBeDefined();
        expect(folderContentTemplate?.sdoId).toEqual(createdSDOId);
        contentFolderTemplateId = folderContentTemplate?.id;
      });

      it('should be able to update Folder Content Template with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.updateFolderContentTemplate(
          { input: { id: contentFolderTemplateId, sdoId: createdSDOId } },
          regularOptions
        );
        const folderContentTemplate = res.data.updateFolderContentTemplate;
        expect(folderContentTemplate?.id).toBeDefined();
        expect(folderContentTemplate?.sdoId).toEqual(createdSDOId);
      });

      it('should be able to create TDO with belonged SDO', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726755,
              contentTemplates: [
                { sdoId: createdSDOId, schemaId: createdSchemaId }
              ]
            }
          },
          regularOptions
        );
        expect(res.data.createTDO?.id).toBeDefined();
      });

      it('should get all sdos under a schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res: any = await superClient.query(
          getSchemaGql,
          { id: createdSchemaId },
          regularOptions
        );
        const sdos = _.get(res, 'schema.structuredDataObjects.records');
        expect(sdos).toBeDefined();
        expect(sdos.length).toBe(1);
      });
    });

    describe('with Admin user to clean up test data', () => {
      let folderIds: any[] = [];
      let TDOIds: any[] = [];

      beforeAll(async () => {
        const res = await superClient.sdk.meBasic({}, adminOptions);
        expect(res.data.me?.name).toContain(`${citestMarker}-admin-user`);
      });

      it('should get all tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.temporalDataObjects(
          { offset: 0, limit: 50 },
          adminOptions
        );
        expect(res.data.temporalDataObjects?.records).toBeDefined();
        TDOIds = (res.data.temporalDataObjects?.records ?? []).map(
          (tdo: any) => tdo.id
        );
        expect(TDOIds.length).toEqual(2);
      });

      it('should get all folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const rootFoldersRes = await superClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rootFoldersRes.data.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        folderIds = childFolders.map(
          (childFolder: any) => childFolder.treeObjectId
        );
        expect(childFolders.length).toBeGreaterThanOrEqual(1);
      });

      it('should delete all folders and tdos', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let deletedCount = 0;
        for (const TDOId of TDOIds) {
          deletedCount++;
          await superClient.sdk.deleteTDO({ id: TDOId }, adminOptions);
        }
        expect(deletedCount).toEqual(2);

        const deleteFolderContentTemplateRes =
          await superClient.sdk.deleteFolderContentTemplate(
            { id: contentFolderTemplateId },
            adminOptions
          );
        expect(
          deleteFolderContentTemplateRes.data.deleteFolderContentTemplate?.id
        ).toEqual(contentFolderTemplateId);

        deletedCount = 0;
        for (const folderId of folderIds) {
          deletedCount++;
          const getFolderACL = await superClient.sdk.GetResourcesACL(
            { resourceType: AuthResourceType.Folder, ids: [folderId] },
            adminOptions
          );
          const folderACL = getFolderACL.data.getACLForResources?.records ?? [];
          for (const ace of folderACL) {
            if (!ace) continue;
            await superClient.sdk.removeACEsFromResource(
              { resourceType: AuthResourceType.Folder, ids: [ace.id] },
              adminOptions
            );
          }

          await superClient.sdk.deleteFolder(
            { input: { id: folderId, orderIndex: 0 } },
            adminOptions
          );
        }
        expect(deletedCount).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('JWT Token Operations', () => {
    let jwtTokenOption: Record<string, string> | undefined;
    let newAuthGroup: any, newAuthPermissionSet: any;
    let regularUserId: any;
    let authGroups: any;
    let cmsRootFolderId: any, newTDOId: any, newFolderId: any;

    describe('on normal operations', () => {
      beforeAll(async () => {
        const adminMeRes = await superClient.sdk.meBasic({}, adminOptions);
        expect(adminMeRes.data.me?.name).toContain(
          `${citestMarker}-admin-user`
        );

        const regularMeRes = await superClient.sdk.meBasic({}, regularOptions);
        expect(regularMeRes.data.me?.name).toContain(
          `${citestMarker}-regular-user`
        );
        regularUserId = regularMeRes.data.me?.id;

        const authGroupsRes = await superClient.sdk.authGroups(
          { nameRegex: testOrg.name },
          adminOptions
        );
        authGroups = authGroupsRes.data.authGroups?.records ?? [];
        expect(authGroups.length).toBeGreaterThanOrEqual(2);

        // the default groups for the organization will include superadmin who created it.
        let hasSuperAdminMember = false;
        for (const g of authGroups) {
          const users = g?.members?.records ?? [];
          hasSuperAdminMember = users.some(
            (u: any) => (u?.member?.id ?? '') === superUserId
          );
        }
        expect(hasSuperAdminMember).toEqual(true);

        const permRes = await superClient.sdk.authPermissionSets(
          { nameRegex: 'aiWARE', authClass: ['System'] as any },
          adminOptions
        );
        const authPermissionSets =
          permRes.data.authPermissionSets?.records ?? [];
        expect(authPermissionSets.length).toEqual(4);

        const rootFoldersRes = await superClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolders = rootFoldersRes.data.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id;
      });

      it('should create a new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-auth-group-${uuidv4()}`,
              description: `${citestMarker}-auth-group`
            }
          },
          adminOptions
        );
        expect(res.data.authGroupCreate).toBeDefined();
        expect(res.data.authGroupCreate?.name).toContain(
          `${citestMarker}-auth-group`
        );
        newAuthGroup = res.data.authGroupCreate;
      });

      it('should add regular user to the new auth group', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.authGroupAddMembers(
          {
            id: newAuthGroup.id,
            members: [
              { id: regularUserId, memberType: AuthGroupMemberType.User }
            ]
          },
          adminOptions
        );
        expect(res.data.authGroupAddMembers).toBeDefined();
      });

      it('should create a new permission set', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.RecordingRead
              ]
            }
          },
          adminOptions
        );
        expect(res.data.authPermissionSetCreate).toBeDefined();
        expect(res.data.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        newAuthPermissionSet = res.data.authPermissionSetCreate;
      });

      it('should create Folder and add ACE to resource with new group + permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const createFolderRes = await superClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'test folder for rbac by admin for JWT token test',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        newFolderId = createFolder?.id;

        const res = await superClient.sdk.addACEsToResources(
          {
            ids: [newFolderId],
            resourceType: AuthResourceType.Folder,
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

        const acl = res.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(newFolderId) &&
              ace!.id.includes(newAuthGroup.id) &&
              ace!.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });

      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: newFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          regularOptions
        );
        expect(res.data.createTDO).toBeDefined();
        expect(res.data.createTDO?.id).toBeDefined();
        expect(res.data.createTDO?.name).toContain(`${citestMarker}-tdo`);
        newTDOId = res.data.createTDO?.id;

        const aceRes = await superClient.sdk.addACEsToResources(
          {
            ids: [newTDOId],
            resourceType: AuthResourceType.Tdo,
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

        const acl = aceRes.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(newTDOId) &&
              ace!.id.includes(newAuthGroup.id) &&
              ace!.id.includes(newAuthPermissionSet.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });

      it('should not move TDO without AIWARE_FOLDER_FILE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const defaultGroupIds = authGroups.map((g: any) => g.id);
        for (const groupId of defaultGroupIds) {
          await superClient.sdk.authGroupRemoveMembers(
            { id: groupId, memberIds: [regularUserId] },
            adminOptions
          );
        }

        // The removal above is fire-and-forget server-side and this test had no
        // wait at all: a session minted before it lands still carries the
        // default groups, and `moveTemporalDataObject` would then be permitted.
        const restrictedRegularOptions = await waitForAuthGroupMembership(
          superClient,
          () => impersonateUser(regularUserId, testOrg.guid),
          { expectAbsent: defaultGroupIds, label: 'regular user' }
        );

        try {
          await expect(
            superClient.sdk.moveTemporalDataObject(
              {
                input: {
                  tdoId: newTDOId,
                  oldFolderId: newFolderId,
                  newFolderId: cmsRootFolderId
                }
              },
              restrictedRegularOptions
            )
          ).rejects.toThrow(
            /No authorization access role found for Mutation.moveTemporalDataObject/
          );
        } finally {
          for (const groupId of defaultGroupIds) {
            await superClient.sdk.authGroupAddMembers(
              {
                id: groupId,
                members: [
                  { id: regularUserId, memberType: AuthGroupMemberType.User }
                ]
              },
              adminOptions
            );
          }
          // Later tests run as this user with its default permissions, so the
          // groups must be genuinely back before this test hands control
          // over — not merely requested back.
          //
          // `safe` matters here: this runs in `finally`, so a throw would
          // REPLACE a failing authz assertion from the `try` above with a
          // propagation-timeout error, hiding the very regression this test
          // exists to catch. Shorter budget too, so the pair stays inside the
          // runner's per-test timeout.
          await safe('restore regular user default groups', () =>
            waitForAuthGroupMembership(
              superClient,
              () => impersonateUser(regularUserId, testOrg.guid),
              {
                expectPresent: defaultGroupIds,
                label: 'regular user',
                timeoutMs: 20000
              }
            )
          );
        }
      });

      it('should not create root folder without AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const defaultGroupIds = authGroups.map((g: any) => g.id);
        for (const groupId of defaultGroupIds) {
          await superClient.sdk.authGroupRemoveMembers(
            { id: groupId, memberIds: [regularUserId] },
            adminOptions
          );
        }

        const restrictedRegularOptions = await waitForAuthGroupMembership(
          superClient,
          () => impersonateUser(regularUserId, testOrg.guid),
          { expectAbsent: defaultGroupIds, label: 'regular user' }
        );

        try {
          await expect(
            superClient.sdk.createRootFolders(
              { rootFolderType: RootFolderType.Cms },
              restrictedRegularOptions
            )
          ).rejects.toThrow(
            /No authorization access role found for Mutation.createRootFolders/
          );
        } finally {
          for (const groupId of defaultGroupIds) {
            await superClient.sdk.authGroupAddMembers(
              {
                id: groupId,
                members: [
                  { id: regularUserId, memberType: AuthGroupMemberType.User }
                ]
              },
              adminOptions
            );
          }
          // See the note on the matching restore above: `safe` + a shorter
          // budget so a cleanup timeout cannot mask the authz assertion.
          await safe('restore regular user default groups', () =>
            waitForAuthGroupMembership(
              superClient,
              () => impersonateUser(regularUserId, testOrg.guid),
              {
                expectPresent: defaultGroupIds,
                label: 'regular user',
                timeoutMs: 20000
              }
            )
          );
        }
      });

      it('Should create JWT token and query regular user', async () => {
        const res = await superClient.sdk.getEngineJWT(
          {
            input: {
              resource: { userId: regularUserId, tdoId: newTDOId }
            }
          },
          adminOptions
        );
        const jwtToken = res.data.getEngineJWT?.token;
        expect(jwtToken).toBeDefined();
        jwtTokenOption = helpers.requestOptions(jwtToken as string)
          .headers as Record<string, string>;
      });

      it('Should query new TDO using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.temporalDataObject(
          { id: newTDOId },
          jwtTokenOption
        );
        expect(res.data.temporalDataObject?.id).toEqual(newTDOId);
      });

      it('should only delete non-protected auth groups', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const groupsRes = await superClient.sdk.authGroups({}, adminOptions);
        const groupsList = groupsRes.data.authGroups?.records ?? [];
        for (const g of groupsList) {
          let error: any;
          try {
            await superClient.sdk.authGroupDelete({ id: g!.id }, adminOptions);
          } catch (e) {
            error = e;
          }
          if (g!.name.includes(`${citestMarker}-org`)) {
            expect(String(error)).toContain(
              'This auth group is a protected group.'
            );
          }
        }

        const groupsDataRes = await superClient.sdk.authGroups(
          {},
          adminOptions
        );
        const groupsData = groupsDataRes.data.authGroups?.records ?? [];
        expect(groupsData.length).toBeGreaterThanOrEqual(2);
      });

      it('should only delete non-protected permission sets', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permRes = await superClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permissionSets = permRes.data.authPermissionSets?.records ?? [];
        for (const ps of permissionSets) {
          await superClient.sdk.authPermissionSetDelete(
            { id: ps!.id },
            adminOptions
          );
        }

        const permRes2 = await superClient.sdk.authPermissionSets(
          { nameRegex: `${citestMarker}-auth-permission-set` },
          adminOptions
        );
        const permission = permRes2.data.authPermissionSets?.records ?? [];
        expect(permission.length).toEqual(0);
      });

      it('Should NOT query new folder using JWT token', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        let error: any;
        try {
          await superClient.sdk.temporalDataObject(
            { id: newTDOId },
            jwtTokenOption
          );
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
      });

      it('Should delete new folder', async () => {
        const res = await superClient.sdk.deleteFolder(
          { input: { id: newFolderId, orderIndex: 0 } },
          adminOptions
        );
        expect(res.data.deleteFolder?.id).toEqual(newFolderId);
      });

      it('Should delete new TDO', async () => {
        const res = await superClient.sdk.deleteTDO(
          { id: newTDOId },
          adminOptions
        );
        expect(res.data.deleteTDO?.id).toEqual(newTDOId);
      });
    });
  });

  describe('Manage access to resources', () => {
    let defaultAGsToRemoveMember: any[] = [];
    let cmsRootFolderId: any;
    let folderIds: any[] = [];
    let newAuthPermissionSet: any;
    let restrictedFolderId: any;
    let restrictedFolderName: any;
    let schemaId: any,
      sdoFolderId: any,
      sdoId: any,
      sdoFolderContentTemplateId: any;

    beforeAll(async () => {
      const res: any = await superClient.query(meGql, {}, restrictOptions);
      expect(_.get(res, 'me.name')).toContain(
        `${citestMarker}-first-restrict-user`
      );
      defaultAGsToRemoveMember = _.get(res, 'me.authGroups.records', []);

      const rootFoldersRes = await superClient.sdk.rootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = rootFoldersRes.data.rootFolders ?? [];
      expect(rootFolders.length).toBeGreaterThan(0);
      expect(rootFolders[0]?.name).toContain('cms');
      cmsRootFolderId = rootFolders[0]?.id;
    });

    it('should removes restrict users from default AGs', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

      if (authGroupIds.length > 0) {
        const results = await Promise.all(
          authGroupIds.map((id: string) =>
            superClient.sdk.authGroupRemoveMembers(
              {
                id,
                memberIds: [restrictUser.userId, secondRestrictUser.userId]
              },
              adminOptions
            )
          )
        );
        expect(results.length).toEqual(authGroupIds.length);
      }
    });

    it('should not be able to create Folder Content Template without AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const registryRes = await superClient.sdk.createDataRegistry(
        {
          input: {
            id: uuidv4(),
            name: `${citestMarker}-data-registry-${uuidv4()}`,
            description:
              'test data registry for rbac auth group and permission set operations',
            source: 'citest-source'
          }
        },
        adminOptions
      );
      expect(registryRes.data.createDataRegistry).toBeDefined();
      expect(registryRes.data.createDataRegistry?.name).toContain(
        `${citestMarker}-data-registry`
      );
      testOrg.dataRegistryId = registryRes.data.createDataRegistry?.id;

      const schemaRes = await superClient.sdk.createSchema(
        {
          input: {
            id: uuidv4(),
            dataRegistryId: testOrg.dataRegistryId,
            majorVersion: 1,
            minorVersion: 0,
            status: 'draft' as any,
            definition: {
              type: 'object',
              properties: { name: { type: 'string' } }
            }
          }
        },
        adminOptions
      );
      expect(schemaRes.data.createSchema).toBeDefined();
      expect(schemaRes.data.createSchema?.id).toBeDefined();
      schemaId = schemaRes.data.createSchema?.id;
      expect(schemaId).toBeDefined();

      const publishRes = await superClient.sdk.updateSchemaState(
        { input: { id: schemaId, status: 'published' as any } },
        adminOptions
      );
      expect(publishRes.data.updateSchemaState?.id).toBeDefined();
      expect(publishRes.data.updateSchemaState?.status).toEqual('published');

      const createFolderRes = await superClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'test folder for rbac created by regular user',
            parentId: cmsRootFolderId,
            rootFolderType: RootFolderType.Cms
          }
        },
        regularOptions
      );
      const createFolder = createFolderRes.data.createFolder;
      expect(createFolder).toBeDefined();
      expect(createFolder?.name).toContain(`${citestMarker}-folder`);
      sdoFolderId = createFolder?.id;
      folderIds.push(sdoFolderId);

      const folderPermissionRes = await superClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-folder-permission-set-${uuidv4()}`,
            description: `${citestMarker}-folder-permission-set`,
            permissions: [AuthPermissionType.AiwareFolderUpdate]
          }
        },
        adminOptions
      );
      expect(folderPermissionRes.data.authPermissionSetCreate).toBeDefined();
      expect(folderPermissionRes.data.authPermissionSetCreate?.name).toContain(
        `${citestMarker}-folder-permission-set`
      );
      const folderPermissionSet =
        folderPermissionRes.data.authPermissionSetCreate!;

      await superClient.sdk.addACEsToResources(
        {
          ids: [sdoFolderId],
          resourceType: AuthResourceType.Folder,
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: folderPermissionSet.id
            }
          ]
        },
        adminOptions
      );

      const createSdoRes = await superClient.sdk.createStructuredData(
        { input: { schemaId, data: { name: 'test SDO' } } },
        regularOptions
      );
      sdoId = createSdoRes.data.createStructuredData?.id;

      // The denial below only means "no AIWARE_SDO_READ" once the group removal
      // has propagated; until then this user may still be authorized via its
      // default groups.
      restrictOptions = await waitForAuthGroupMembership(
        superClient,
        () => impersonateUser(restrictUser.userId, testOrg.guid),
        {
          expectAbsent: _.map(defaultAGsToRemoveMember, 'id'),
          label: 'first restrict user'
        }
      );

      await expect(
        superClient.sdk.createFolderContentTemplate(
          { input: { folderId: sdoFolderId, sdoId, schemaId } },
          restrictOptions
        )
      ).rejects.toThrow(
        /No authorization access role found for Mutation.createFolderContentTemplate/
      );
    });

    it('should be able to create Folder Content Template with AIWARE_SDO_READ permission', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const permRes = await superClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [AuthPermissionType.AiwareSdoRead]
          }
        },
        adminOptions
      );
      expect(permRes.data.authPermissionSetCreate).toBeDefined();
      expect(permRes.data.authPermissionSetCreate?.name).toContain(
        `${citestMarker}-auth-permission-set`
      );
      const sdoPermissionSet = permRes.data.authPermissionSetCreate!;

      await superClient.sdk.addACEsToResources(
        {
          ids: [schemaId],
          resourceType: AuthResourceType.SdoSchema,
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: sdoPermissionSet.id
            }
          ]
        },
        adminOptions
      );

      restrictOptions = await impersonateUser(
        restrictUser.userId,
        testOrg.guid
      );

      // `createFolderContentTemplate` is a mutation and must run exactly once,
      // so the AIWARE_SDO_READ ACE just granted is confirmed via a read first.
      // It must be `structuredData`, NOT `schema`: `Query.schema` is declared
      // `@auth(skipObjectAuthorization: true)` with no `@requireAuthRole`, so
      // it resolves for anyone and would settle on round one regardless of the
      // ACE. `structuredData` carries `@requireAuthRole([AIWARE_SDO_READ])`,
      // which is exactly the permission being granted here.
      await pollUntilReady(
        () =>
          superClient.sdk.structuredData(
            { id: sdoId, schemaId },
            restrictOptions
          ),
        (value) => value?.data?.structuredData?.id === sdoId
      );

      const res = await superClient.sdk.createFolderContentTemplate(
        { input: { folderId: sdoFolderId, sdoId, schemaId } },
        restrictOptions
      );
      const folderContentTemplate = res.data.createFolderContentTemplate;
      expect(folderContentTemplate?.id).toBeDefined();
      expect(folderContentTemplate?.sdoId).toEqual(sdoId);
      sdoFolderContentTemplateId = folderContentTemplate?.id;
    });

    it('should create a new permission set', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const res = await superClient.sdk.authPermissionSetCreate(
        {
          input: {
            name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
            description: `${citestMarker}-auth-permission-set`,
            permissions: [
              AuthPermissionType.AiwareFolderUpdate,
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderDelete,
              AuthPermissionType.AiwareFolderCreate,
              AuthPermissionType.AiwareFolderFile
            ]
          }
        },
        adminOptions
      );
      expect(res.data.authPermissionSetCreate).toBeDefined();
      expect(res.data.authPermissionSetCreate?.name).toContain(
        `${citestMarker}-auth-permission-set`
      );
      newAuthPermissionSet = res.data.authPermissionSetCreate;
    });

    it('should share Root Folder Access with restrict users', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }
      const res = await superClient.sdk.addACEsToResources(
        {
          ids: [cmsRootFolderId],
          resourceType: AuthResourceType.Folder,
          entries: [
            {
              member: {
                id: restrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: newAuthPermissionSet.id
            },
            {
              member: {
                id: secondRestrictUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: newAuthPermissionSet.id
            }
          ]
        },
        adminOptions
      );

      const acl = res.data.addACEsToResources?.records ?? [];
      // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 2 ACEs on user level
      expect(acl.length).toEqual(4);

      const resourceACEOnUserLevel = _.find(acl, (ace: any) =>
        ace.id.includes(newAuthPermissionSet.id)
      );
      // aceId = resource_type::resource_id::ag_id::ps_id;
      privateAuthGroupId = _.get(resourceACEOnUserLevel, 'id', '').split(
        '::'
      )[2];
    });

    describe('should grant the user access to a private resource', () => {
      it('should not allow restricted users to create folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const createFolder = superClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          restrictOptions
        );

        await expect(createFolder).rejects.toThrow(
          /No authorization access role found for Mutation.createFolder/
        );
      });

      it('should be able to create Folder with AIWARE_FOLDER_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const permRes = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [AuthPermissionType.AiwareFolderCreate]
            }
          },
          adminOptions
        );
        expect(permRes.data.authPermissionSetCreate).toBeDefined();
        expect(permRes.data.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        const folderPermissionSet = permRes.data.authPermissionSetCreate!;

        const addRes = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: folderPermissionSet.id
              }
            ]
          },
          adminOptions
        );
        expect(addRes.data.addACEsToResources?.records).toBeDefined();

        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const createFolderRes = await superClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description:
                'test folder for rbac created by admin for auth group and permission set operations',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          restrictOptions
        );
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        restrictedFolderName = createFolder?.name;
        restrictedFolderId = createFolder?.id;
        folderIds.push(restrictedFolderId);
      });

      it('should not create TDO without AIWARE_TDO_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );
        const folderRes = await superClient.sdk.folderBasic(
          { id: cmsRootFolderId },
          restrictOptions
        );
        expect(folderRes.data.folder?.id).toEqual(cmsRootFolderId);

        const createTDO = superClient.sdk.createTDO(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: cmsRootFolderId,
              status: 'uploaded',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          restrictOptions
        );
        await expect(createTDO).rejects.toThrow(
          /No authorization access role found for Mutation.createTDO/
        );
      });

      it('should not create TDO with Asset without AIWARE_TDO_CREATE permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );
        const folderRes = await superClient.sdk.folderBasic(
          { id: cmsRootFolderId },
          restrictOptions
        );
        expect(folderRes.data.folder?.id).toEqual(cmsRootFolderId);

        const createTDOWithAsset = superClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: cmsRootFolderId,
              uri: 'https://s3.amazonaws.com/hold4fisher/s3Test.mp4',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          restrictOptions
        );
        await expect(createTDOWithAsset).rejects.toThrow(
          /No authorization access role found for Mutation.createTDOWithAsset/
        );
      });

      it('should verify owner access', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const res = await superClient.sdk.folderBasic(
          { id: restrictedFolderId },
          restrictOptions
        );
        expect(res.data.folder?.id).toEqual(restrictedFolderId);
      });

      it('should allow a restricted user to update a folder they created', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );
        const res = await superClient.sdk.updateFolder(
          {
            input: {
              id: restrictedFolderId,
              name: `${restrictedFolderName}-updated`
            }
          },
          restrictOptions
        );
        expect(res.data.updateFolder).toBeDefined();
        expect(res.data.updateFolder?.name).toContain(
          `${restrictedFolderName}-updated`
        );
      });

      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        secondRestrictOptions = await impersonateUser(
          secondRestrictUser.userId,
          testOrg.guid
        );

        await expect(
          superClient.sdk.folderBasic(
            { id: restrictedFolderId },
            secondRestrictOptions
          )
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });

      it('should verify user access for updating folder when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        secondRestrictOptions = await impersonateUser(
          secondRestrictUser.userId,
          testOrg.guid
        );

        await expect(
          superClient.sdk.updateFolder(
            {
              input: {
                id: restrictedFolderId,
                name: `${restrictedFolderName}-updated`
              }
            },
            secondRestrictOptions
          )
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });

      it('should not share folder without AIWARE_ADMIN_SUPERADMIN permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const userFolderRes = await superClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-user-owned-folder-${uuidv4()}`,
              description: 'test folder created by restrictUser (owner)',
              parentId: cmsRootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          restrictOptions
        );
        const userFolderId = userFolderRes.data.createFolder?.id;
        folderIds.push(userFolderId);

        const shareFolder = superClient.sdk.shareFolder(
          {
            input: {
              folderId: userFolderId,
              readOrganizationIds: [Number(testOrg.id)]
            }
          },
          restrictOptions
        );

        await expect(shareFolder).rejects.toThrow(
          /No authorization access role found for Mutation.shareFolder/
        );
      });

      it('admin shares Private Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [restrictedFolderId],
            entries: [
              {
                member: {
                  id: secondRestrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );

        const acl = res.data.addACEsToResources?.records ?? [];
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });

      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        secondRestrictOptions = await impersonateUser(
          secondRestrictUser.userId,
          testOrg.guid
        );

        const res = await superClient.sdk.folderBasic(
          { id: restrictedFolderId },
          secondRestrictOptions
        );
        expect(res.data.folder?.id).toEqual(restrictedFolderId);
      });
    });

    describe('should grant the user access to specific resources', () => {
      let restrictedFolderId1: any, restrictedFolderId2: any;

      it('should create folder', async () => {
        const createFolderRes = await superClient.sdk.createFolder(
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
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        restrictedFolderId1 = createFolder?.id;
        folderIds.push(restrictedFolderId1);
      });

      it('should verify user access when no explicit grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        await expect(
          superClient.sdk.folderBasic(
            { id: restrictedFolderId1 },
            restrictOptions
          )
        ).rejects.toThrow();
        // /The folder was not found. It either does not exist or you or your organization do not have access to it./
      });

      it('should share Folder Resource Access with user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [restrictedFolderId1],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: newAuthPermissionSet.id
              }
            ]
          },
          adminOptions
        );

        const acl = res.data.addACEsToResources?.records ?? [];
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 owner ACE + 1 ACE on user level
        expect(acl.length).toEqual(4);
      });

      it('should create Folder and share Folder Resource Access with user - by addACEs nested mutation', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const createFolder: any = await superClient.query(
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
                        id: "${restrictUser.userId}",
                        memberType: User
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
        expect(_.get(createFolder2, 'name')).toContain(
          `${citestMarker}-folder`
        );
        restrictedFolderId2 = createFolder2?.id;
        folderIds.push(restrictedFolderId2);

        const acl = createFolder?.createFolder?.addACEs?.records ?? [];
        // 1 default ACEs (orgAdmin + aiWARE Full Access) + 1 ACE on user level, ignore inheritance + 1 owner ACE
        expect(acl.length).toEqual(3);
      });

      it('should verify user access when grant exists', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        // each test case performs a login to refresh ctx.authGroups.
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const res1 = await superClient.sdk.folderBasic(
          { id: restrictedFolderId1 },
          restrictOptions
        );
        expect(res1.data.folder?.id).toEqual(restrictedFolderId1);

        const res2 = await superClient.sdk.folderBasic(
          { id: restrictedFolderId2 },
          restrictOptions
        );
        expect(res2.data.folder?.id).toEqual(restrictedFolderId2);
      });
    });

    describe('should grant the restricted user read access to specific resources', () => {
      let aiwarePermissionsGetFolderId: any;
      let aiwarePermissionsGetPS: any;
      let aiwarePermissionsGetTDOId: any;

      it('should create folder', async () => {
        const createFolderRes = await superClient.sdk.createFolder(
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
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        aiwarePermissionsGetFolderId = createFolder?.id;
        folderIds.push(aiwarePermissionsGetFolderId);
      });

      it('should create TDO in the folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.createTDO(
          {
            input: {
              status: 'uploaded',
              name: `${citestMarker}-tdo-${uuidv4()}`,
              parentFolderId: aiwarePermissionsGetFolderId,
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          adminOptions
        );
        expect(res.data.createTDO).toBeDefined();
        expect(res.data.createTDO?.id).toBeDefined();
        expect(res.data.createTDO?.name).toContain(`${citestMarker}-tdo`);
        aiwarePermissionsGetTDOId = res.data.createTDO?.id;
      });

      it('should create a new permission set with AIWARE_PERMISSIONS_GET permission', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [AuthPermissionType.AiwarePermissionsGet]
            }
          },
          adminOptions
        );
        expect(res.data.authPermissionSetCreate).toBeDefined();
        expect(res.data.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        aiwarePermissionsGetPS = res.data.authPermissionSetCreate;
      });

      it('should add restricted user to the new AIWARE_PERMISSIONS_GET permission set', async () => {
        const res = await superClient.sdk.addACEsToResources(
          {
            ids: [aiwarePermissionsGetFolderId],
            resourceType: AuthResourceType.Folder,
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: aiwarePermissionsGetPS.id
              }
            ]
          },
          adminOptions
        );

        const acl = res.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(aiwarePermissionsGetFolderId) &&
              ace!.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        // 2 default ACEs (aiWARE Full Access permissionSet x 2 default groups) + 1 new ACE + 1 owner ACE
        expect(acl.length).toEqual(4);
      });

      it('should be able to call getACLForResources as restricted user on the folder - resource level', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Folder,
            ids: [aiwarePermissionsGetFolderId]
          },
          restrictOptions
        );
        const acl = res.data.getACLForResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(aiwarePermissionsGetFolderId) &&
              ace!.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);
      });

      it('should remove AIWARE_PERMISSIONS_GET permission set on resource level and add it again on organization level to restricted user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const getFolderACL = await superClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Folder,
            ids: [aiwarePermissionsGetFolderId]
          },
          adminOptions
        );
        const acl = getFolderACL.data.getACLForResources?.records ?? [];
        let checkGroupReturned = false;
        for (const ace of acl) {
          checkGroupReturned =
            checkGroupReturned ||
            (ace!.id.includes(aiwarePermissionsGetFolderId) &&
              ace!.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupReturned).toEqual(true);
        expect(acl.length).toEqual(4);

        let folderAceIdToRemove: any = '';
        for (const ace of acl) {
          folderAceIdToRemove =
            (ace as any).member?.id?.includes(restrictUser.userId) && ace!.id;
          if (folderAceIdToRemove) break;
        }
        expect(folderAceIdToRemove).toBeDefined();

        const removeRes = await superClient.sdk.removeACEsFromResource(
          {
            resourceType: AuthResourceType.Folder,
            ids: [folderAceIdToRemove]
          },
          adminOptions
        );
        expect(removeRes.data.removeACEsFromResource?.records).toBeDefined();

        const addRes = await superClient.sdk.addACEsToResources(
          {
            ids: [testOrg.id],
            resourceType: AuthResourceType.Organization,
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: aiwarePermissionsGetPS.id
              }
            ]
          },
          adminOptions
        );

        const addAcl = addRes.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of addAcl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(testOrg.id) &&
              ace!.id.includes(aiwarePermissionsGetPS.id));
        }
        expect(checkGroupAdded).toEqual(true);
      });

      it('should be able to call getACLForResources as restricted user on any resource - organization level', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const folderAclRes = await superClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Folder,
            ids: [aiwarePermissionsGetFolderId]
          },
          restrictOptions
        );
        expect(folderAclRes.data.getACLForResources?.records).toBeDefined();

        const tdoAclRes = await superClient.sdk.GetResourcesACL(
          {
            resourceType: AuthResourceType.Tdo,
            ids: [aiwarePermissionsGetTDOId]
          },
          restrictOptions
        );
        expect(tdoAclRes.data.getACLForResources?.records).toBeDefined();
      });
    });

    describe('should grant the restricted user folder permissions and they can create TDO via createTDOWithAsset', () => {
      let folderWithReadAndFilePermissionsId: any;
      let folderReadAndFilePS: any;

      it('should create folder', async () => {
        const createFolderRes = await superClient.sdk.createFolder(
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
        const createFolder = createFolderRes.data.createFolder;
        expect(createFolder).toBeDefined();
        expect(createFolder?.name).toContain(`${citestMarker}-folder`);
        folderWithReadAndFilePermissionsId = createFolder?.id;
        folderIds.push(folderWithReadAndFilePermissionsId);
      });

      it('should create a new permission set with folder permissions', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        const res = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderFile
              ]
            }
          },
          adminOptions
        );
        expect(res.data.authPermissionSetCreate).toBeDefined();
        expect(res.data.authPermissionSetCreate?.name).toContain(
          `${citestMarker}-auth-permission-set`
        );
        folderReadAndFilePS = res.data.authPermissionSetCreate;
      });

      it('should add restricted user to the new permission set and add org-level TDO_CREATE', async () => {
        const res = await superClient.sdk.addACEsToResources(
          {
            ids: [folderWithReadAndFilePermissionsId],
            resourceType: AuthResourceType.Folder,
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: folderReadAndFilePS.id
              }
            ]
          },
          adminOptions
        );

        const acl = res.data.addACEsToResources?.records ?? [];
        let checkGroupAdded = false;
        for (const ace of acl) {
          checkGroupAdded =
            checkGroupAdded ||
            (ace!.id.includes(folderWithReadAndFilePermissionsId) &&
              ace!.id.includes(folderReadAndFilePS.id));
        }
        expect(checkGroupAdded).toEqual(true);
        expect(acl.length).toEqual(4);

        // Add AIWARE_TDO_CREATE + AIWARE_FOLDER_READ + AIWARE_FOLDER_FILE at Organization level
        // createTDOWithAsset requires orgRole: [AIWARE_TDO_CREATE]
        // parentFolderId field requires orgRole: [AIWARE_FOLDER_FILE]
        const orgPermSetRes = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-tdo-create-permission-set-${uuidv4()}`,
              description: `${citestMarker}-tdo-create-permission-set`,
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderFile
              ]
            }
          },
          adminOptions
        );
        const orgPermSet = orgPermSetRes.data.authPermissionSetCreate;
        expect(orgPermSet).toBeDefined();

        const orgAceRes = await superClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: orgPermSet!.id
              }
            ]
          },
          adminOptions
        );
        expect(orgAceRes.data.addACEsToResources?.records).toBeDefined();
      });

      it('should be able to create TDO via createTDOWithAsset as restricted user', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );

        const tdoName = `${citestMarker}-tdo-with-asset-${uuidv4()}`;
        const res = await superClient.sdk.createTDOWithAsset(
          {
            input: {
              name: tdoName,
              parentFolderId: folderWithReadAndFilePermissionsId,
              uri: 'https://s3.amazonaws.com/hold4fisher/s3Test.mp4',
              startDateTime: 1476726655,
              stopDateTime: 1476726655
            }
          },
          restrictOptions
        );
        expect(res.data.createTDOWithAsset).toBeDefined();
        expect(res.data.createTDOWithAsset?.id).toBeDefined();
        expect(res.data.createTDOWithAsset?.name).toContain(tdoName);
      });
    });

    it('should delete these folders', async () => {
      let deletedCount = 0;
      const deleteFolderContentTemplateRes =
        await superClient.sdk.deleteFolderContentTemplate(
          { id: sdoFolderContentTemplateId },
          adminOptions
        );
      expect(
        deleteFolderContentTemplateRes.data.deleteFolderContentTemplate?.id
      ).toEqual(sdoFolderContentTemplateId);

      for (const folderId of folderIds) {
        deletedCount++;
        await superClient.sdk.deleteFolder(
          { input: { id: folderId, orderIndex: 0 } },
          adminOptions
        );
      }
      expect(deletedCount).toEqual(folderIds.length);
    });

    it('should delete sdo and schema', async () => {
      if (sdoId) {
        const deleteSdo = await superClient.sdk.deleteStructuredData(
          { input: { id: sdoId, schemaId } },
          adminOptions
        );
        expect(deleteSdo.data.deleteStructuredData?.id).toEqual(sdoId);
      }

      if (schemaId) {
        const deleteSchema = await superClient.sdk.updateSchemaState(
          { input: { id: schemaId, status: 'deleted' as any } },
          adminOptions
        );
        expect(deleteSchema.data.updateSchemaState).toBeDefined();
        expect(deleteSchema.data.updateSchemaState?.id).toEqual(schemaId);
        expect(deleteSchema.data.updateSchemaState?.status).toEqual('deleted');
      }
    });

    describe('Auth filtering for Folders', () => {
      let testFolderIds: any[] = [];
      let sharedFolderIds: any[] = [];
      const TOTAL_FOLDERS_TO_CREATE = 25;
      const FOLDERS_TO_SHARE = 10; // Number of folders the restricted user can access

      it('should create multiple folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // Create folders that the restricted user will NOT have access to
        for (let i = 0; i < TOTAL_FOLDERS_TO_CREATE; i++) {
          const createFolderRes = await superClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-test-folder-${i}-${uuidv4()}`,
                description: `Test folder ${i} for auth filtering`,
                parentId: cmsRootFolderId,
                rootFolderType: RootFolderType.Cms
              }
            },
            adminOptions
          );
          testFolderIds.push(createFolderRes.data.createFolder?.id);
        }

        expect(testFolderIds.length).toEqual(TOTAL_FOLDERS_TO_CREATE);
      });

      it('should grant restricted user access to only a subset of folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const permRes = await superClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-folder-read-permission-${uuidv4()}`,
              description: 'Permission set for testing auth filtering',
              permissions: [AuthPermissionType.AiwareFolderRead]
            }
          },
          adminOptions
        );
        const permissionSetId = permRes.data.authPermissionSetCreate?.id;
        expect(permissionSetId).toBeDefined();

        // Grant access to only the LAST FOLDERS_TO_SHARE folders (positions 15-24)
        // This tests the critical case where accessible folders are beyond the first batch
        // Old behavior (post-process): limit=10 would return 0 folders (first 10 have no access)
        // New behavior (pre-process): limit=10 would return 10 folders (finds accessible ones at 15-24)
        sharedFolderIds = testFolderIds.slice(-FOLDERS_TO_SHARE);

        await superClient.sdk.addACEsToResources(
          {
            ids: sharedFolderIds,
            resourceType: AuthResourceType.Folder,
            entries: [
              {
                member: {
                  id: restrictUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: permissionSetId!
              }
            ]
          },
          adminOptions
        );

        expect(sharedFolderIds.length).toEqual(FOLDERS_TO_SHARE);
      });

      it('should return accessible folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // this should return the accessible folders up to the limit
        const res = await superClient.sdk.rootFolderWithChildFolders(
          {
            rootFolderType: RootFolderType.Cms,
            limit: FOLDERS_TO_SHARE,
            offset: 0,
            orderBy: [
              {
                field: FolderOrderByField.CreatedDateTime,
                direction: OrderDirection.Desc
              },
              { field: FolderOrderByField.Name, direction: OrderDirection.Asc }
            ]
          },
          restrictOptions
        );

        const rootFolders = res.data.rootFolders ?? [];
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        const childFolderIds = childFolders.map((f: any) => f.id);
        const accessFolderIds = _.intersection(childFolderIds, sharedFolderIds);

        expect(accessFolderIds.length).toEqual(FOLDERS_TO_SHARE);
      });

      it('admin user should see all folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        const res = await superClient.sdk.rootFolderWithChildFolders(
          {
            rootFolderType: RootFolderType.Cms,
            limit: 50,
            offset: 0,
            orderBy: [
              {
                field: FolderOrderByField.CreatedDateTime,
                direction: OrderDirection.Desc
              }
            ]
          },
          adminOptions
        );

        const rootFolders = res.data.rootFolders ?? [];
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        const folderCount = rootFolders[0]?.childFolders?.count ?? 0;

        // Admin should see all test folders (plus any existing folders)
        expect(childFolders.length).toBeGreaterThanOrEqual(
          TOTAL_FOLDERS_TO_CREATE
        );
        expect(folderCount).toBeGreaterThanOrEqual(TOTAL_FOLDERS_TO_CREATE);

        const returnedFolderIds = childFolders.map((f: any) => f.id);
        for (const testFolderId of testFolderIds) {
          expect(returnedFolderIds).toContain(testFolderId);
        }
      });

      it('user with no access should not see the testing folders', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // secondRestrictUser has no ACEs to the testing folders
        const res = await superClient.sdk.rootFolderWithChildFolders(
          { rootFolderType: RootFolderType.Cms, limit: 20, offset: 0 },
          secondRestrictOptions
        );

        const rootFolders = res.data.rootFolders ?? [];
        const childFolders = rootFolders[0]?.childFolders?.records ?? [];
        const childFolderIds = childFolders.map((f: any) => f.id);
        const accessFolderIds = _.intersection(childFolderIds, testFolderIds);

        expect(accessFolderIds.length).toEqual(0);
      });

      afterAll(async () => {
        if (!useRBACFeature) {
          return;
        }

        // Clean up all test folders
        for (const folderId of testFolderIds) {
          await safe(`delete folder ${folderId}`, () =>
            superClient.sdk.deleteFolder(
              { input: { id: folderId, orderIndex: 0 } },
              adminOptions
            )
          );
        }
      });
    });

    describe('should not be accessible to User Default Private AG via the regular groups APIs', () => {
      it("the user's default private AG cannot be listed", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // authGroups API.
        const res = await superClient.sdk.authGroups(
          { ids: [privateAuthGroupId] },
          adminOptions
        );
        expect(res.data.authGroups?.records).toBeDefined();
        expect(res.data.authGroups?.records?.length).toEqual(0);

        // authGroups in User type.
        restrictOptions = await impersonateUser(
          restrictUser.userId,
          testOrg.guid
        );
        const meRes: any = await superClient.query(meGql, {}, restrictOptions);
        expect(_.get(meRes, 'me.name')).toContain(
          `${citestMarker}-first-restrict-user`
        );
        const defaultAGs = _.get(meRes, 'me.authGroups.records', []);
        const defaultAGIds = _.map(defaultAGs, 'id');
        expect(defaultAGIds.includes(privateAuthGroupId)).toEqual(false);
      });

      it("the user's default private AG cannot be updated", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        await expect(
          superClient.sdk.authGroupUpdate(
            {
              input: {
                id: privateAuthGroupId,
                description: 'test2',
                name: 'test2'
              }
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });

      it("the user's default private AG cannot be deleted", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          superClient.sdk.authGroupDelete(
            { id: privateAuthGroupId },
            adminOptions
          )
        ).rejects.toThrow('This auth group is a protected group.');
      });

      it("the user's default private AG cannot be added members to it", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          superClient.sdk.authGroupAddMembers(
            {
              id: privateAuthGroupId,
              members: [
                {
                  id: regularUser.userId,
                  memberType: AuthGroupMemberType.User
                }
              ]
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });

      it("members cannot be added to the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          superClient.sdk.authGroupAddMembers(
            {
              id: privateAuthGroupId,
              members: [
                {
                  id: regularUser.userId,
                  memberType: AuthGroupMemberType.User
                }
              ]
            },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });

      it("members cannot be removed from the user's default private AG", async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }
        await expect(
          superClient.sdk.authGroupRemoveMembers(
            { id: privateAuthGroupId, memberIds: [restrictUser.userId] },
            adminOptions
          )
        ).rejects.toThrow('Authorization group not found');
      });
    });

    it('should only delete non-protected auth groups', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      const groupsRes = await superClient.sdk.authGroups({}, adminOptions);
      const groups = groupsRes.data.authGroups?.records ?? [];
      for (const g of groups) {
        let error: any;
        try {
          await superClient.sdk.authGroupDelete({ id: g!.id }, adminOptions);
        } catch (e) {
          error = e;
        }
        if (g!.name.includes(`${citestMarker}-org`)) {
          expect(String(error)).toContain(
            'This auth group is a protected group.'
          );
        }
      }

      const groupsDataRes = await superClient.sdk.authGroups({}, adminOptions);
      const groupsData = groupsDataRes.data.authGroups?.records ?? [];
      expect(groupsData.length).toBeGreaterThanOrEqual(2);
    });

    it('should only delete non-protected permission sets', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      const permRes = await superClient.sdk.authPermissionSets(
        { nameRegex: `${citestMarker}-auth-permission-set` },
        adminOptions
      );
      const permissionSets = permRes.data.authPermissionSets?.records ?? [];
      for (const ps of permissionSets) {
        await superClient.sdk.authPermissionSetDelete(
          { id: ps!.id },
          adminOptions
        );
      }

      await superClient.sdk.authPermissionSets(
        { nameRegex: `${citestMarker}-auth-permission-set` },
        adminOptions
      );
    });
  });

  describe('Evaluate OLP Migration of Organization', () => {
    async function setOrgOLPFlag(orgId: string, enabled: boolean) {
      return superClient.sdk.updateOrganization(
        {
          input: {
            id: orgId,
            metadata: {
              features: {
                enableRBACFeature: enabled ? 'enabled' : 'disabled'
              }
            }
          }
        },
        isolatedSuperadmin.options
      );
    }

    it('olpMigration should be removed', async () => {
      // Disable org enableRBACFeature
      const orgRes = await setOrgOLPFlag(testOrg.id, false);
      const updateOrganizationResult = orgRes.data.updateOrganization;
      expect(updateOrganizationResult).toBeDefined();
      expect(updateOrganizationResult?.id).toBeDefined();

      const elasticRetryAttempts = 5;
      // retry 5 times to ensure olpMigration is removed
      for (let i = 0; i < elasticRetryAttempts + 1; i++) {
        await helpers.sleep(1000);
        const res = await superClient.sdk.organizations(
          {
            kvpProperty: 'features.olpMigration',
            name: testOrg.name,
            nameMatch: StringMatch.Exact,
            limit: 1,
            offset: 0
          },
          isolatedSuperadmin.options
        );

        const organizations = res.data.organizations;
        expect(organizations).toBeDefined();
        try {
          expect(organizations?.count).toEqual(0);
          break;
        } catch (error) {
          console.log(`Retrying to check olpMigration removal: ${i + 1}`);
        }

        if (i === elasticRetryAttempts) {
          throw new Error(
            `Failed to remove olpMigration after ${elasticRetryAttempts} attempts`
          );
        }
      }

      restrictOptions = await impersonateUser(
        restrictUser.userId,
        testOrg.guid
      );
    });

    it('should verify restricted user can get all SDOs and Schema after OLP migration disable', async () => {
      if (!useRBACFeature) {
        pending('useRBACFeature = false');
      }

      if (!createdSchemaId) {
        pending('No schema created in previous tests');
      }

      if (!createdSDOId) {
        pending('No SDO created in previous tests');
      }

      const schemaRes = await superClient.sdk.schema(
        { id: createdSchemaId },
        restrictOptions
      );

      const sdosRes = await superClient.sdk.structuredDataObjects(
        { schemaId: createdSchemaId },
        restrictOptions
      );

      expect(schemaRes.data.schema?.id).toBeDefined();
      expect(schemaRes.data.schema?.id).toEqual(createdSchemaId);

      const sdos = sdosRes.data.structuredDataObjects?.records;
      expect(sdos).toBeDefined();
      expect((sdos ?? []).length).toBeGreaterThanOrEqual(0);
    });

    describe('olp enabled', () => {
      beforeAll(async () => {
        // enable OLP
        const res = await setOrgOLPFlag(testOrg.id, true);
        expect(res.data.updateOrganization?.id).toEqual(testOrg.id);
      });

      it('should be able to access pre-existing sdo and schema', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        if (!createdSchemaId) {
          pending('No schema created in previous tests');
        }

        if (!createdSDOId) {
          pending('No SDO created in previous tests');
        }

        const schemaRes = await superClient.sdk.schema(
          { id: createdSchemaId },
          restrictOptions
        );

        const sdosRes = await superClient.sdk.structuredDataObjects(
          { schemaId: createdSchemaId },
          restrictOptions
        );

        expect(schemaRes.data.schema?.id).toBeDefined();
        expect(schemaRes.data.schema?.id).toEqual(createdSchemaId);

        const sdos = sdosRes.data.structuredDataObjects?.records;
        expect(sdos).toBeDefined();
        expect((sdos ?? []).length).toBeGreaterThanOrEqual(0);
      });

      afterAll(async () => {
        await safe('create temp admin and cleanup', async () => {
          // create new Admin to delete the created SDO and Schema
          const adminRes = await superClient.sdk.createUser({
            input: {
              name: `${citestMarker}-temp-admin-user-${uuidv4()}@localhost`,
              password: 'testPassword',
              organizationId: testOrg.id,
              roleIds: [
                isDesktopAppEnabled
                  ? null
                  : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
                '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
                'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
              ].filter((roleId) => roleId) as string[]
            }
          });
          const adminData = adminRes.data.createUser!;

          const tempAdminOptions = await impersonateUser(
            adminData.id,
            testOrg.guid
          );

          testSetup.listOptions.push({
            userName: adminData.name,
            userId: adminData.id,
            requestOptions: tempAdminOptions
          });

          if (createdSDOId) {
            const deleteSdo = await superClient.sdk.deleteStructuredData(
              { input: { id: createdSDOId, schemaId: createdSchemaId } },
              tempAdminOptions
            );
            expect(deleteSdo.data.deleteStructuredData?.id).toEqual(
              createdSDOId
            );
          }

          if (createdSchemaId) {
            const deleteSchema = await superClient.sdk.updateSchemaState(
              { input: { id: createdSchemaId, status: 'deleted' as any } },
              tempAdminOptions
            );
            expect(deleteSchema.data.updateSchemaState).toBeDefined();
            expect(deleteSchema.data.updateSchemaState?.id).toEqual(
              createdSchemaId
            );
            expect(deleteSchema.data.updateSchemaState?.status).toEqual(
              'deleted'
            );
          }

          // disable OLP to cleanup the created default objects
          await setOrgOLPFlag(testOrg.id, false);
        });
      });
    });
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

const getSchemaGql = `query getSchema($id: ID!) {
  schema(id: $id) {
    id
    structuredDataObjects {
      records {
        id
        schemaId
      }
    }
  }
}`;

const createOrgAndUserInput = {
  orgInput: {
    name: citestMarker + '-org-folder-rbac-' + uuidv4(),
    businessUnit: 'Legal',
    types: ['agency', 'broadcaster'],
    metadata: {
      features: {
        enableRBACFeature: 'enabled',
        enableRBACFeatureForSDO: 'enabled'
      }
    },
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
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
        'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
      ].filter((roleId) => roleId)
    },
    {
      name: `${citestMarker}-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-second-regular-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
    },
    {
      name: `${citestMarker}-first-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: []
    },
    {
      name: `${citestMarker}-second-restrict-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: []
    }
  ]
};
