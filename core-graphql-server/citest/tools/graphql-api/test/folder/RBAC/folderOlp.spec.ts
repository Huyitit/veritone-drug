import { v4 as uuidv4 } from 'uuid';

import { helpers } from '@api/src/helpers';
import { impersonateUser, safe } from '@api/src/helpers/commonHelper';
import { waitForAuthGroupMembership } from '@api/test/helpers/rbacPropagation';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { setupTestOrgAndUser } from '@api/test/helpers/organization.helper';
import { createIsolatedSuperadmin } from '@api/test/helpers/superadminSession';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  OrganizationStatus,
  RootFolderType
} from '@api/src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

describe('citest_folder: olp folder test', () => {
  let superToken: string;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superToken = isolatedSuperadmin.token;
  });

  describe.each(['v1', 'v2'])('OLP Folder %s', (folderVersion: string) => {
    let testSetup: any, testSetup2: any;
    let testOrg: any, testOrg2: any;
    let adminUser: any, adminUser2: any, regularUser: any, restrictedUser: any;
    let adminOptions: any,
      adminOptions2: any,
      regularOptions: any,
      restrictedOptions: any;
    let adminOrg2Options: any, regularUserOrg2Options: any;
    let testFolderData: any;
    let rbac: any;

    async function relogin(
      userId: string,
      organizationGuid: string
    ): Promise<Record<string, string>> {
      const impersonated = await impersonateUser(
        superToken,
        userId,
        organizationGuid
      );
      return impersonated.requestOptions;
    }

    beforeAll(async () => {
      const isoClient = isolatedSuperadmin.client;
      testFolderData = {};
      rbac = {};

      const createOrgAndUserInput = getOrgAndUserInput(folderVersion);

      testSetup = await setupTestOrgAndUser(isoClient, createOrgAndUserInput);

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);

      adminUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('first-admin-user')
      );
      adminOptions = adminUser?.requestOptions;

      adminUser2 = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('second-admin-user')
      );
      adminOptions2 = adminUser2?.requestOptions;

      regularUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('first-regular-user')
      );
      regularOptions = regularUser?.requestOptions;

      restrictedUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('first-restrict-user')
      );
      restrictedOptions = restrictedUser?.requestOptions;

      // create root folder
      const createRootRes = await gqlClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = createRootRes?.data?.createRootFolders ?? [];
      expect(rootFolders.length).toBeGreaterThan(0);
      const orgRootFolder = rootFolders.find((f: any) => !f?.ownerId);
      const adminRootFolder = rootFolders.find(
        (f: any) => f?.ownerId === adminUser.userId
      );
      testFolderData.rootFolderId = orgRootFolder?.id;
      testFolderData.treeObjectId = orgRootFolder?.treeObjectId;
      testFolderData.rootFolderId2 = adminRootFolder?.id;
      testFolderData.treeObjectId2 = adminRootFolder?.treeObjectId;

      // create folder, and content
      const folderRes = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        },
        adminOptions
      );
      const folder = folderRes?.data?.createFolder;
      expect(folder).toBeDefined();
      testFolderData.parentFolderId = folder?.id;

      const tdoRes = await gqlClient.sdk.createTDOWithAsset(
        {
          input: {
            name: `${citestMarker}-tdo-${uuidv4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        },
        adminOptions
      );
      expect(tdoRes?.data?.createTDOWithAsset).toBeDefined();
      testFolderData.tdoId = tdoRes?.data?.createTDOWithAsset?.id;

      const parentFolder2Res = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        },
        adminOptions
      );
      expect(parentFolder2Res?.data?.createFolder).toBeDefined();
      testFolderData.parentFolderId2 = parentFolder2Res?.data?.createFolder?.id;

      // create child folder and content
      const childFolderRes = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        },
        adminOptions
      );
      expect(childFolderRes?.data?.createFolder).toBeDefined();
      testFolderData.childFolderId = childFolderRes?.data?.createFolder?.id;

      const childTdoRes = await gqlClient.sdk.createTDOWithAsset(
        {
          input: {
            name: `${citestMarker}-tdo-${uuidv4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.childFolderId
          }
        },
        adminOptions
      );
      expect(childTdoRes?.data?.createTDOWithAsset).toBeDefined();
      testFolderData.childTdoId = childTdoRes?.data?.createTDOWithAsset?.id;

      // create grand child folder and content
      const grandChildFolderRes = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.childFolderId
          }
        },
        adminOptions
      );
      expect(grandChildFolderRes?.data?.createFolder).toBeDefined();
      testFolderData.grandChildFolderId =
        grandChildFolderRes?.data?.createFolder?.id;

      const grandChildTdoRes = await gqlClient.sdk.createTDOWithAsset(
        {
          input: {
            name: `${citestMarker}-tdo-${uuidv4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.grandChildFolderId
          }
        },
        adminOptions
      );
      expect(grandChildTdoRes?.data?.createTDOWithAsset).toBeDefined();
      testFolderData.grandChildTdoId =
        grandChildTdoRes?.data?.createTDOWithAsset?.id;

      // sanity check the restricted user landed in the right org
      const restrictedMeRes = await gqlClient.sdk.me({}, restrictedOptions);
      expect(restrictedMeRes?.data?.me?.name).toContain('first-restrict-user');
    });

    folderTestOLP(folderVersion, {
      get testSetup() {
        return testSetup;
      },
      set testSetup2(v: any) {
        testSetup2 = v;
      },
      get testSetup2() {
        return testSetup2;
      },
      get testOrg() {
        return testOrg;
      },
      set testOrg2(v: any) {
        testOrg2 = v;
      },
      get testOrg2() {
        return testOrg2;
      },
      get adminUser() {
        return adminUser;
      },
      get adminUser2() {
        return adminUser2;
      },
      get regularUser() {
        return regularUser;
      },
      get restrictedUser() {
        return restrictedUser;
      },
      get adminOptions() {
        return adminOptions;
      },
      get adminOptions2() {
        return adminOptions2;
      },
      get regularOptions() {
        return regularOptions;
      },
      set regularOptions(v: any) {
        regularOptions = v;
      },
      get restrictedOptions() {
        return restrictedOptions;
      },
      set restrictedOptions(v: any) {
        restrictedOptions = v;
      },
      get adminOrg2Options() {
        return adminOrg2Options;
      },
      set adminOrg2Options(v: any) {
        adminOrg2Options = v;
      },
      get regularUserOrg2Options() {
        return regularUserOrg2Options;
      },
      set regularUserOrg2Options(v: any) {
        regularUserOrg2Options = v;
      },
      get testFolderData() {
        return testFolderData;
      },
      get rbac() {
        return rbac;
      },
      relogin
    });

    afterAll(async () => {
      const org2ListOptions = testSetup2?.listOptions ?? [];
      const allListOptions = [
        ...(testSetup?.listOptions ?? []),
        ...org2ListOptions
      ];

      for (const user of allListOptions) {
        await safe(`delete user ${user.userId}`, () =>
          gqlClient.sdk.deleteUser(
            { id: user.userId },
            helpers.requestOptions(superToken).headers
          )
        );
      }

      if (testOrg?.id) {
        await safe(`delete testOrg ${testOrg.id}`, () =>
          isolatedSuperadmin.client.sdk.updateOrganization(
            { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
            isolatedSuperadmin.options
          )
        );
      }

      if (testOrg2?.id) {
        await safe(`delete testOrg2 ${testOrg2.id}`, () =>
          isolatedSuperadmin.client.sdk.updateOrganization(
            { input: { id: testOrg2.id, status: OrganizationStatus.Deleted } },
            isolatedSuperadmin.options
          )
        );
      }
    });
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});

function getOrgAndUserInput(version: string) {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: 'enabled',
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
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
        name: `${citestMarker}-first-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-second-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-first-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      },
      {
        name: `${citestMarker}-first-restrict-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: []
      }
    ]
  };
}

function getOrg2AndUserInput(version: string) {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: 'enabled',
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
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
        name: `${citestMarker}-org2-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-org2-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
}

interface OlpTestContext {
  testSetup: any;
  testSetup2: any;
  testOrg: any;
  testOrg2: any;
  adminUser: any;
  adminUser2: any;
  regularUser: any;
  restrictedUser: any;
  adminOptions: any;
  adminOptions2: any;
  regularOptions: any;
  restrictedOptions: any;
  adminOrg2Options: any;
  regularUserOrg2Options: any;
  testFolderData: any;
  rbac: any;
  relogin: (userId: string, organizationGuid: string) => Promise<any>;
}

function folderTestOLP(version: string, ctx: OlpTestContext) {
  describe(`OLP test folder ${version}`, () => {
    it('should removes restricted users from default AGs', async () => {
      const meRes = await gqlClient.sdk.me({}, ctx.restrictedOptions);
      const authGroupIds = meRes?.data?.me?.authGroupIds ?? [];

      if (authGroupIds.length > 0) {
        const result = await Promise.all(
          authGroupIds.map((id: string) =>
            gqlClient.sdk.authGroupRemoveMembers(
              { id, memberIds: [ctx.restrictedUser.userId] },
              ctx.adminOptions
            )
          )
        );
        expect(result.length).toEqual(authGroupIds.length);

        // relogin restricted user — the removal is fire-and-forget on the
        // server, so relog in until the session no longer reports the groups.
        // Every OLP assertion in this block runs against this session.
        ctx.restrictedOptions = await waitForAuthGroupMembership(
          gqlClient,
          () => ctx.relogin(ctx.restrictedUser.userId, ctx.testOrg.guid),
          { expectAbsent: authGroupIds, label: 'restricted user' }
        );
      }
    });

    describe('OLP Get folder test', () => {
      it('FO1 - owner can get folder and child folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.adminOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );

        const childFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId },
          ctx.adminOptions
        );
        expect(childFolderRes?.data?.folder).toBeDefined();
        expect(childFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId
        );
      });

      it('FO2 - admin can get folder and child folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.adminOptions2
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );

        const childFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId },
          ctx.adminOptions2
        );
        expect(childFolderRes?.data?.folder).toBeDefined();
        expect(childFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId
        );
      });

      it('FO3 - cms user can get parent and child folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.regularOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );

        const childFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId },
          ctx.regularOptions
        );
        expect(childFolderRes?.data?.folder).toBeDefined();
        expect(childFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId
        );
      });

      it('FO4 - cms user can get folder content and child content (TDO, App, watch list)', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.tdoId },
          ctx.regularOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );

        const childTdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.childTdoId },
          ctx.regularOptions
        );
        expect(childTdoRes?.data?.temporalDataObject).toBeDefined();
        expect(childTdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.childTdoId
        );
      });

      it('FO5 - restricted user can not get folder', async () => {
        const folderResult = gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.restrictedOptions
        );
        await expect(folderResult).rejects.toThrow(/No authorization access/);
      });

      it('FO6 - Add folder read permission for restricted user', async () => {
        // admin create new authGroup
        const authGroupRes = await gqlClient.sdk.CreateAuthGroup(
          {
            input: {
              name: `${citestMarker}-folder-read-group-${uuidv4()}`,
              description: 'citest folder read group',
              members: [
                {
                  id: ctx.restrictedUser.userId,
                  memberType: AuthGroupMemberType.User
                }
              ]
            }
          },
          ctx.adminOptions
        );
        expect(authGroupRes?.data?.authGroupCreate).toBeDefined();
        ctx.rbac.authGroupId = authGroupRes?.data?.authGroupCreate?.id;
        // admin creates permission set
        const permSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-folder-read-permission-${uuidv4()}`,
              description: 'citest folder read permission',
              permissions: [AuthPermissionType.AiwareFolderRead]
            }
          },
          ctx.adminOptions
        );
        expect(permSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.authPermissionSetId =
          permSetRes?.data?.authPermissionSetCreate?.id;

        // admin create ACE - Access control entry
        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [
              ctx.testFolderData.parentFolderId,
              ctx.testFolderData.parentFolderId2
            ],
            entries: [
              {
                member: {
                  id: ctx.rbac.authGroupId,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: ctx.rbac.authPermissionSetId
              }
            ]
          },
          ctx.adminOptions
        );

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );
      });

      it('FO7 - restricted user can get parent folder', async () => {
        const parentFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.restrictedOptions
        );
        expect(parentFolderRes?.data?.folder).toBeDefined();
        expect(parentFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );

        const parentFolder2Res = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId2 },
          ctx.restrictedOptions
        );
        expect(parentFolder2Res?.data?.folder).toBeDefined();
        expect(parentFolder2Res?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId2
        );
      });

      it('FO8 - restricted user can not get current child folder', async () => {
        const childFolderResult = gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId },
          ctx.restrictedOptions
        );
        await expect(childFolderResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO9 - restricted user can not get current folder content', async () => {
        const folderContentResult = gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.tdoId },
          ctx.restrictedOptions
        );
        await expect(folderContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO10 - Add parent folder content read permission for restricted user', async () => {
        const permSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-folder-read-permission-${uuidv4()}`,
              description: 'citest TDO read permission',
              permissions: [AuthPermissionType.AiwareTdoRead]
            }
          },
          ctx.adminOptions
        );
        expect(permSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.TDOPermissionSetId =
          permSetRes?.data?.authPermissionSetCreate?.id;

        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Tdo,
            ids: [ctx.testFolderData.tdoId],
            entries: [
              {
                member: {
                  id: ctx.rbac.authGroupId,
                  memberType: AuthGroupMemberType.Group
                },
                permissionSetID: ctx.rbac.TDOPermissionSetId
              }
            ]
          },
          ctx.adminOptions2
        );

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );
      });

      it('FO11 - restricted user can get shared content', async () => {
        const tdoRes = await gqlClient.sdk.GetTemporalDataObjectBasic(
          { id: ctx.testFolderData.tdoId },
          ctx.restrictedOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );
      });

      it('FO12 - owner create another child folder and content', async () => {
        const childFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(childFolderRes?.data?.createFolder).toBeDefined();
        ctx.testFolderData.childFolderId2 =
          childFolderRes?.data?.createFolder?.id;

        const childTdoRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.childFolderId2
            }
          },
          ctx.adminOptions
        );
        expect(childTdoRes?.data?.createTDOWithAsset).toBeDefined();
        ctx.testFolderData.childTdoId2 =
          childTdoRes?.data?.createTDOWithAsset?.id;
      });

      it('FO13 - cms user can access new child folder and child content', async () => {
        const childFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId2 },
          ctx.regularOptions
        );
        expect(childFolderRes?.data?.folder).toBeDefined();
        expect(childFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );

        const childTdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.childTdoId2 },
          ctx.regularOptions
        );
        expect(childTdoRes?.data?.temporalDataObject).toBeDefined();
        expect(childTdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.childTdoId2
        );
      });

      it('FO14 - restricted user can get new child folder', async () => {
        const childFolderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId2 },
          ctx.restrictedOptions
        );
        expect(childFolderRes?.data?.folder).toBeDefined();
        expect(childFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
      });

      it('FO15 - restricted user can not get new child content', async () => {
        const childTdoResult = gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.childTdoId2 },
          ctx.restrictedOptions
        );
        await expect(childTdoResult).rejects.toThrow(/No authorization access/);
      });
    });

    describe('OLP update folder and content permissions', () => {
      it('FO16 - owner can update, move folder', async () => {
        const updateRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated`
            }
          },
          ctx.adminOptions
        );
        expect(updateRes?.data?.updateFolder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
        expect(updateRes?.data?.updateFolder?.name).toContain(
          `${ctx.testFolderData.parentFolderId}-updated`
        );

        const moveRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: ctx.testFolderData.childFolderId2,
              toFolderId: ctx.testFolderData.rootFolderId,
              fromFolderId: ctx.testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          ctx.adminOptions
        );
        expect(moveRes?.data?.moveFolder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
        expect(moveRes?.data?.moveFolder?.parent?.id).toEqual(
          ctx.testFolderData.rootFolderId
        );
      });

      // VE-16402 merge will fix this test case
      it('FO17 - move folder to its own child should fail (loop folder)', async () => {
        const newChildFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(newChildFolderRes?.data?.createFolder).toBeDefined();
        const newChildFolderId = newChildFolderRes?.data?.createFolder?.id;

        const moveResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: ctx.testFolderData.parentFolderId,
              toFolderId: newChildFolderId,
              fromFolderId: ctx.testFolderData.rootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          ctx.adminOptions
        );
        await expect(moveResult).rejects.toThrow(/resource_conflict/);
      });

      it('FO18 - admin can update, move folder', async () => {
        const updateRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.childFolderId2,
              name: `${citestMarker}-${ctx.testFolderData.childFolderId2}-updated`
            }
          },
          ctx.adminOptions2
        );
        expect(updateRes?.data?.updateFolder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
        expect(updateRes?.data?.updateFolder?.name).toContain(
          `${ctx.testFolderData.childFolderId2}-updated`
        );

        const moveRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: ctx.testFolderData.childFolderId2,
              toFolderId: ctx.testFolderData.parentFolderId,
              fromFolderId: ctx.testFolderData.rootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          ctx.adminOptions2
        );
        expect(moveRes?.data?.moveFolder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
        expect(moveRes?.data?.moveFolder?.parent?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
      });

      it('FO19.1 - cms viewer user can not update folder of others', async () => {
        const updateResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-1`
            }
          },
          ctx.regularOptions
        );
        await expect(updateResult).rejects.toThrow(/not_allowed/);
      });

      it('FO19.2 - cms viewer user can move folder', async () => {
        const moveRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: ctx.testFolderData.grandChildFolderId,
              toFolderId: ctx.testFolderData.childFolderId2,
              fromFolderId: ctx.testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          ctx.regularOptions
        );
        expect(moveRes?.data?.moveFolder?.id).toEqual(
          ctx.testFolderData.grandChildFolderId
        );
        expect(moveRes?.data?.moveFolder?.parent?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
      });

      // VE-16583 merge will fix this test case
      it('FO20 - restricted user update folder should fail', async () => {
        const updateResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-2`
            }
          },
          ctx.restrictedOptions
        );
        await expect(updateResult).rejects.toThrow(/not_allowed/);
      });

      // VE-16695 merge will fix this test case
      it('FO21 - restricted user move folder should fail', async () => {
        const moveResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: ctx.testFolderData.childFolderId2,
              toFolderId: ctx.testFolderData.parentFolderId2,
              fromFolderId: ctx.testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          ctx.restrictedOptions
        );
        await expect(moveResult).rejects.toThrow();
      });

      it('FO22 - Add folder update permission for restricted user', async () => {
        const updateRes = await gqlClient.sdk.authPermissionSetUpdate(
          {
            input: {
              id: ctx.rbac.authPermissionSetId,
              name: `${citestMarker}-folder-update-permission-${uuidv4()}`,
              permissions: [
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderUpdate
              ]
            }
          },
          ctx.adminOptions
        );
        expect(updateRes).toBeDefined();

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );
      });

      it('FO23 - restricted user update folder should succeed', async () => {
        const updateRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-3`
            }
          },
          ctx.restrictedOptions
        );
        expect(updateRes?.data?.updateFolder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
        expect(updateRes?.data?.updateFolder?.name).toContain(
          `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-3`
        );
      });

      it('FO24 - restricted user update new child folder should succeed', async () => {
        const updateRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.childFolderId2,
              name: `${citestMarker}-${ctx.testFolderData.childFolderId2}-updated-2`
            }
          },
          ctx.restrictedOptions
        );
        expect(updateRes?.data?.updateFolder?.id).toEqual(
          ctx.testFolderData.childFolderId2
        );
        expect(updateRes?.data?.updateFolder?.name).toContain(
          `${citestMarker}-${ctx.testFolderData.childFolderId2}-updated-2`
        );
      });

      it('FO25 - cms viewer user can not update folder content of others', async () => {
        const updateContentResult = gqlClient.sdk.updateTDO(
          {
            input: {
              id: ctx.testFolderData.tdoId,
              name: `${citestMarker}-tdo-updated-${uuidv4()}`
            }
          },
          ctx.regularOptions
        );
        await expect(updateContentResult).rejects.toThrow(/not_allowed/);
      });

      it('FO26 - restricted user update folder content should fail', async () => {
        const updateContentResult = gqlClient.sdk.updateTDO(
          {
            input: {
              id: ctx.testFolderData.tdoId,
              name: `${citestMarker}-tdo-updated-${uuidv4()}`
            }
          },
          ctx.restrictedOptions
        );
        await expect(updateContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO27 - cms user add content to folder TDO, watchlist, app succeed (file TDO, App, watch list)', async () => {
        const addContentRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );
        expect(addContentRes?.data?.createTDOWithAsset).toBeDefined();
        ctx.testFolderData.defaultUserTdoId =
          addContentRes?.data?.createTDOWithAsset?.id;
      });

      it('FO28 - restricted user file content should fail', async () => {
        const addContentResult = gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.restrictedOptions
        );
        await expect(addContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO29 - restricted user unfile content of owner should fail', async () => {
        const removeContentResult = gqlClient.sdk.deleteTDO(
          { id: ctx.testFolderData.tdoId },
          ctx.restrictedOptions
        );
        await expect(removeContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      // VE-16848 merge will fix this test case
      it.skip('FO30 - cms user delete content of owner should fail', async () => {
        const createContentRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-to-remove-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.childFolderId
            }
          },
          ctx.adminOptions
        );
        expect(createContentRes?.data?.createTDOWithAsset).toBeDefined();
        const childTdoId = createContentRes?.data?.createTDOWithAsset?.id;

        const removeContentResult = gqlClient.sdk.deleteTDO(
          { id: childTdoId! },
          ctx.regularOptions
        );
        await expect(removeContentResult).rejects.toThrow(/not_allowed/);
      });
    });

    describe('share folder to other organization', () => {
      beforeAll(async () => {
        const isoClient = isolatedSuperadmin.client;
        const createSecondOrgAndUserInput = getOrg2AndUserInput(version);

        const setup2 = await setupTestOrgAndUser(
          isoClient,
          createSecondOrgAndUserInput
        );
        ctx.testSetup2 = setup2;

        const org2 = setup2.org;
        ctx.testOrg2 = org2;
        expect(org2).toBeDefined();
        expect(org2.name).toContain(`${citestMarker}-org`);

        const adminOrg2 = (setup2.listOptions ?? []).find((u: any) =>
          u.userName?.includes('org2-admin-user')
        );
        ctx.adminOrg2Options = adminOrg2?.requestOptions;

        const regularUserOrg2 = (setup2.listOptions ?? []).find((u: any) =>
          u.userName?.includes('org2-regular-user')
        );
        ctx.regularUserOrg2Options = regularUserOrg2?.requestOptions;

        // Retry: org2's v2 schema may not be provisioned when
        // setupTestOrgAndUser returns (async, fire-and-forget).
        // createRootFolders fails with Schema not_found until provisioning
        // completes. Mirrors FO35.1/FO47.
        const maxAttempts = 5;
        let rootFolders: any[] = [];
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const rootFolderRes = await gqlClient.sdk.createRootFolders(
              { rootFolderType: RootFolderType.Cms },
              ctx.adminOrg2Options
            );
            rootFolders = rootFolderRes?.data?.createRootFolders ?? [];
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        expect(rootFolders.length).toBeGreaterThan(0);
        const orgRootFolder = rootFolders.find((f: any) => !f?.ownerId);
        ctx.testFolderData.rootFolderIdOrg2 = orgRootFolder?.id;
        ctx.testFolderData.treeObjectIdOrg2 = orgRootFolder?.treeObjectId;
      });

      // VE-16539 merge will fix this case
      it.skip('FO31 - restricted user share folder to other org should fail', async () => {
        const shareResult = gqlClient.sdk.shareFolder(
          {
            input: {
              folderId: ctx.testFolderData.parentFolderId,
              readOrganizationIds: [Number(ctx.testOrg2.id)]
            }
          },
          ctx.restrictedOptions
        );
        await expect(shareResult).rejects.toThrow(/not_allowed/);
      });

      it('FO32 - share folder to not existing org should fail', async () => {
        const result = gqlClient.sdk.shareFolder({
          input: {
            folderId: ctx.testFolderData.parentFolderId,
            readOrganizationIds: [99999]
          }
        });
        await expect(result).rejects.toThrow(/invalid_input/);
      });

      // VE-16539 merge will fix this case
      it.skip('FO33.1 - cms user share folder to other org should fail', async () => {
        const result = gqlClient.sdk.shareFolder(
          {
            input: {
              folderId: ctx.testFolderData.parentFolderId,
              readOrganizationIds: [Number(ctx.testOrg2.id)]
            }
          },
          ctx.adminOptions
        );
        await expect(result).rejects.toThrow(/not_allowed/);
      });

      it('FO33.2 - super admin share folder to other org should success', async () => {
        const shareResult = await gqlClient.sdk.shareFolder({
          input: {
            folderId: ctx.testFolderData.parentFolderId,
            readOrganizationIds: [Number(ctx.testOrg2.id)]
          }
        });
        expect(shareResult).toBeDefined();
      });

      it('FO34 - owner can get sharing folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.adminOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
      });

      it('FO35.1 - target org can get shared folder', async () => {
        // Retry: v2DalSwitch returns before the V2 share write commits when
        // the super admin org routes to V1 as primary (V2 is
        // fire-and-forget). The target org reads from V2, so
        // shared_org_read may not be visible yet.
        const maxAttempts = 5;
        let parentFolderRes: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            parentFolderRes = await gqlClient.sdk.folderBasic(
              { id: ctx.testFolderData.parentFolderId },
              ctx.adminOrg2Options
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        expect(parentFolderRes?.data?.folder).toBeDefined();
        expect(parentFolderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
      });

      // VE-16715 merge will fix this case
      it.skip('FO35.2 - target org can get child folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.childFolderId },
          ctx.adminOrg2Options
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.childFolderId
        );
      });

      // VE-16738 merge will fix this case
      it.skip('FO36 - target org can get folder content', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.tdoId },
          ctx.adminOrg2Options
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );
      });

      it('FO37 - cms user can get folder content', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.tdoId },
          ctx.regularOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );
      });

      // VE-16715 merge will fix this case
      it.skip('FO38 - target org can get new created folder', async () => {
        const newFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(newFolderRes?.data?.createFolder).toBeDefined();
        const newFolderId = newFolderRes?.data?.createFolder?.id;

        const getNewFolderRes = await gqlClient.sdk.folderBasic(
          { id: newFolderId! },
          ctx.adminOrg2Options
        );
        expect(getNewFolderRes?.data?.folder).toBeDefined();
        expect(getNewFolderRes?.data?.folder?.id).toEqual(newFolderId);
      });

      // VE-16738 merge will fix this case
      it.skip('FO39 - target org can get new created content', async () => {
        const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(newTdoRes?.data?.createTDOWithAsset).toBeDefined();
        const newTdoId = newTdoRes?.data?.createTDOWithAsset?.id;

        const getNewTdoRes = await gqlClient.sdk.temporalDataObject(
          { id: newTdoId! },
          ctx.adminOrg2Options
        );
        expect(getNewTdoRes?.data?.temporalDataObject).toBeDefined();
        expect(getNewTdoRes?.data?.temporalDataObject?.id).toEqual(newTdoId);
      });

      // VE-16540 merge will fix this case
      it.skip('FO40 - target org create folder content should fail (read permission)', async () => {
        const createTdoResult = gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOrg2Options
        );
        await expect(createTdoResult).rejects.toThrow(/not_allowed/);
      });

      it('FO42 - target org cannot update folder (read permission)', async () => {
        const updateResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-by-shared-org`
            }
          },
          ctx.adminOrg2Options
        );
        await expect(updateResult).rejects.toThrow(/not_found/);
      });

      // VE-16403 merge will fix this case
      it.skip('FO43 - target org can not delete shared folder', async () => {
        const newFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-to-delete-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(newFolderRes?.data?.createFolder).toBeDefined();
        const newFolderId = newFolderRes?.data?.createFolder?.id;
        ctx.testFolderData.newFolderId = newFolderId;

        const folderRes = await gqlClient.sdk.folderBasic(
          { id: newFolderId! },
          ctx.adminOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const folderIndex = folderRes?.data?.folder?.orderIndex;

        const shareResult = await gqlClient.sdk.shareFolder({
          input: {
            folderId: newFolderId,
            readOrganizationIds: [Number(ctx.testOrg2.id)]
          }
        });
        expect(shareResult).toBeDefined();

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          { input: { id: newFolderId!, orderIndex: folderIndex! } },
          ctx.adminOrg2Options
        );
        await expect(deleteFolderResult).rejects.toThrow();
      });

      it('FO44 - superAdmin user share write permission', async () => {
        const shareResult = await gqlClient.sdk.shareFolder({
          input: {
            folderId: ctx.testFolderData.parentFolderId,
            readOrganizationIds: [Number(ctx.testOrg2.id)],
            writeOrganizationIds: [Number(ctx.testOrg2.id)]
          }
        });
        expect(shareResult).toBeDefined();
      });

      // VE-16718 merge will fix this case
      it.skip('FO45 - target org can update folder', async () => {
        const updateRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              name: `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-by-shared-org-2`
            }
          },
          ctx.adminOrg2Options
        );
        expect(updateRes?.data?.updateFolder?.id).toEqual(
          ctx.testFolderData.parentFolderId
        );
        expect(updateRes?.data?.updateFolder?.name).toContain(
          `${citestMarker}-${ctx.testFolderData.parentFolderId}-updated-by-shared-org-2`
        );
      });

      // VE-16541 merge will fix this case
      it.skip('FO46 - target org can add new child folder', async () => {
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOrg2Options
        );
        expect(createFolderRes?.data?.createFolder).toBeDefined();
        expect(createFolderRes?.data?.createFolder?.id).toBeDefined();
      });

      it('FO47 - target org can add content to folder', async () => {
        // Retry: v2DalSwitch returns before the V2 write-share commits when
        // the super admin org routes to V1 as primary (V2 is
        // fire-and-forget). fileFolderItem._validateFolderId queries
        // v2_folder; shared_org_write may not be visible yet for the
        // target org.
        const maxAttempts = 5;
        let createTdoRes: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            createTdoRes = await gqlClient.sdk.createTDOWithAsset(
              {
                input: {
                  name: `${citestMarker}-tdo-${uuidv4()}`,
                  ...tdoAssetInput,
                  parentFolderId: ctx.testFolderData.parentFolderId
                }
              },
              ctx.adminOrg2Options
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }
        expect(createTdoRes?.data?.createTDOWithAsset).toBeDefined();
        ctx.testFolderData.sharedOrgTdoId =
          createTdoRes?.data?.createTDOWithAsset?.id;
      });

      it('FO48 - target org can access their added content', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.sharedOrgTdoId },
          ctx.adminOrg2Options
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.sharedOrgTdoId
        );
      });

      it('FO49 - admin can not access content added by shared org', async () => {
        const tdoResult = gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.sharedOrgTdoId },
          ctx.adminOptions
        );
        await expect(tdoResult).rejects.toThrow(/not_found/);
      });

      it('FO50 - cms user can not access content added by shared org', async () => {
        const tdoResult = gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.sharedOrgTdoId },
          ctx.regularOptions
        );
        await expect(tdoResult).rejects.toThrow(/not_found/);
      });

      it('FO51 - restricted user can not access content added by shared org', async () => {
        const tdoResult = gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.sharedOrgTdoId },
          ctx.restrictedOptions
        );
        await expect(tdoResult).rejects.toThrow(/No authorization access/);
      });
    });

    describe('OLP file folder', () => {
      it('FO52 - cms user unfile and file admin content should fail', async () => {
        const createTdoRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-to-file-unfile-${uuidv4()}`,
              ...tdoAssetInput,
              parentFolderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.adminOptions
        );
        expect(createTdoRes?.data?.createTDOWithAsset).toBeDefined();
        const tdoId = createTdoRes?.data?.createTDOWithAsset?.id;

        const unfileRes = gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: tdoId!,
              folderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );

        await expect(unfileRes).rejects.toThrow(/No authorization access/);
      });

      it('FO53 - restricted user file new content to folder should fail', async () => {
        const permSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-tdo-create-permission-${uuidv4()}`,
              description: 'citest TDO create permission',
              permissions: [
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ]
            }
          },
          ctx.adminOptions
        );
        expect(permSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.TDOCreatePermissionSetId =
          permSetRes?.data?.authPermissionSetCreate?.id;

        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [ctx.testOrg.id],
            entries: [
              {
                member: {
                  id: ctx.restrictedUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: ctx.rbac.TDOCreatePermissionSetId
              }
            ]
          },
          ctx.adminOptions
        );

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );

        const addContentRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          ctx.restrictedOptions
        );
        expect(addContentRes?.data?.createTDOWithAsset).toBeDefined();
        ctx.testFolderData.restrictedUserFiledTdoId =
          addContentRes?.data?.createTDOWithAsset?.id;

        const fileTdoToFolder = gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: ctx.testFolderData.restrictedUserFiledTdoId,
              folderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.restrictedOptions
        );
        await expect(fileTdoToFolder).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO54 - Add file permission for cms user', async () => {
        const permSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-tdo-file-permission-${uuidv4()}`,
              description: 'citest TDO file permission',
              permissions: [
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoCreate,
                AuthPermissionType.AiwareTdoDelete,
                AuthPermissionType.AiwareTdoSearch,
                AuthPermissionType.AiwareTdoUpdate
              ]
            }
          },
          ctx.adminOptions
        );
        expect(permSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.TDOFilePermissionSetId =
          permSetRes?.data?.authPermissionSetCreate?.id;

        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [ctx.testOrg.id],
            entries: [
              {
                member: {
                  id: ctx.regularUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: ctx.rbac.TDOFilePermissionSetId
              }
            ]
          },
          ctx.adminOptions
        );

        // relogin cms user
        ctx.regularOptions = await ctx.relogin(
          ctx.regularUser.userId,
          ctx.testOrg.guid
        );
      });

      it('FO55 - cms user file content to folder should succeed', async () => {
        const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          ctx.regularOptions
        );
        expect(newTdoRes?.data?.createTDOWithAsset).toBeDefined();
        ctx.testFolderData.defaultUserFiledTdoId =
          newTdoRes?.data?.createTDOWithAsset?.id;

        const fileRes = await gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: ctx.testFolderData.defaultUserFiledTdoId,
              folderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );
        expect(fileRes?.data?.fileTemporalDataObject).toBeDefined();
        expect(fileRes?.data?.fileTemporalDataObject?.id).toEqual(
          ctx.testFolderData.defaultUserFiledTdoId
        );
      });

      it('FO56 - cms user unfile his owned content should succeed', async () => {
        const removeRes = await gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: ctx.testFolderData.defaultUserFiledTdoId,
              folderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );
        expect(removeRes?.data?.unfileTemporalDataObject).toBeDefined();
        expect(removeRes?.data?.unfileTemporalDataObject?.id).toEqual(
          ctx.testFolderData.defaultUserFiledTdoId
        );
      });

      it('FO57 - cms user unfile admin content success (unfile TDO, App, watch list)', async () => {
        const removeRes = await gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: ctx.testFolderData.tdoId,
              folderId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );
        expect(removeRes?.data?.unfileTemporalDataObject).toBeDefined();
        expect(removeRes?.data?.unfileTemporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );
      });

      it('FO58 - admin can access unfiled content of cms user', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.defaultUserFiledTdoId },
          ctx.adminOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.defaultUserFiledTdoId
        );
      });

      it('FO59 - admin can access his unfiled content', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.tdoId },
          ctx.adminOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.tdoId
        );
      });

      it('FO60 - cms user search TDO, App, watch list', async () => {
        const tdoRes = await gqlClient.sdk.temporalDataObject(
          { id: ctx.testFolderData.defaultUserTdoId },
          ctx.regularOptions
        );
        expect(tdoRes?.data?.temporalDataObject).toBeDefined();
        expect(tdoRes?.data?.temporalDataObject?.id).toEqual(
          ctx.testFolderData.defaultUserTdoId
        );
      });
    });

    describe('OLP create folder', () => {
      it('FO61 - cms user create folder should succeed', async () => {
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.regularOptions
        );
        expect(createFolderRes?.data?.createFolder).toBeDefined();
        ctx.testFolderData.defaultUserCreatedFolderId =
          createFolderRes?.data?.createFolder?.id;
      });

      it('FO62 - restricted user create folder should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.restrictedOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO63 - Add folder create permission for restricted user', async () => {
        const permSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-folder-create-permission-${uuidv4()}`,
              description: 'citest folder create permission',
              permissions: [
                AuthPermissionType.AiwareFolderUpdate,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderCreate,
                AuthPermissionType.AiwareFolderFile
              ]
            }
          },
          ctx.adminOptions
        );
        expect(permSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.folderCreatePermissionSetId =
          permSetRes?.data?.authPermissionSetCreate?.id;

        const addACEsRes = await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Folder,
            ids: [ctx.testFolderData.parentFolderId],
            entries: [
              {
                member: {
                  id: ctx.restrictedUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: ctx.rbac.folderCreatePermissionSetId
              }
            ]
          },
          ctx.adminOptions
        );
        expect(addACEsRes?.data?.addACEsToResources).toBeDefined();

        const createPermSetRes = await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [AuthPermissionType.AiwareFolderCreate]
            }
          },
          ctx.adminOptions
        );
        expect(createPermSetRes?.data?.authPermissionSetCreate).toBeDefined();
        ctx.rbac.createPermissionSetId =
          createPermSetRes?.data?.authPermissionSetCreate?.id;

        await gqlClient.sdk.addACEsToResources(
          {
            resourceType: AuthResourceType.Organization,
            ids: [ctx.testOrg.id],
            entries: [
              {
                member: {
                  id: ctx.restrictedUser.userId,
                  memberType: AuthGroupMemberType.User
                },
                permissionSetID: ctx.rbac.createPermissionSetId
              }
            ]
          },
          ctx.adminOptions
        );

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );
      });

      it('FO64 - restricted user create folder and child folder should succeed', async () => {
        const createFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.parentFolderId
            }
          },
          ctx.restrictedOptions
        );
        expect(createFolderRes?.data?.createFolder).toBeDefined();
        ctx.testFolderData.restrictedUserCreatedFolderId =
          createFolderRes?.data?.createFolder?.id;

        const createChildFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.restrictedUserCreatedFolderId
            }
          },
          ctx.restrictedOptions
        );
        expect(createChildFolderRes?.data?.createFolder).toBeDefined();
        ctx.testFolderData.restrictedUserCreatedChildFolderId =
          createChildFolderRes?.data?.createFolder?.id;
      });

      // VE-16715 merge will fix this case
      it.skip('FO65 - shared org can access new folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.restrictedUserCreatedFolderId },
          ctx.adminOrg2Options
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.restrictedUserCreatedFolderId
        );
      });

      it('FO66 - cms user can access new added folder', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.restrictedUserCreatedChildFolderId },
          ctx.regularOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.restrictedUserCreatedChildFolderId
        );
      });

      it('FO67 - cms user delete restricted user folder should fail', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.restrictedUserCreatedChildFolderId },
          ctx.regularOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const orderIndex = folderRes?.data?.folder?.orderIndex;

        const deleteChildFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: {
              id: ctx.testFolderData.restrictedUserCreatedChildFolderId,
              orderIndex: orderIndex!
            }
          },
          ctx.regularOptions
        );
        await expect(deleteChildFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO68 - restricted user delete his folder should succeed', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.restrictedUserCreatedChildFolderId },
          ctx.restrictedOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const orderIndex = folderRes?.data?.folder?.orderIndex;

        const deleteFolderRes = await gqlClient.sdk.deleteFolder(
          {
            input: {
              id: ctx.testFolderData.restrictedUserCreatedChildFolderId,
              orderIndex: orderIndex!
            }
          },
          ctx.restrictedOptions
        );
        expect(deleteFolderRes?.data?.deleteFolder).toBeDefined();
        expect(deleteFolderRes?.data?.deleteFolder?.id).toEqual(
          ctx.testFolderData.restrictedUserCreatedChildFolderId
        );
      });
    });

    describe('OLP delete folder', () => {
      it('FO69 - restrict user delete folder should fail', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.restrictedOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const orderIndex = folderRes?.data?.folder?.orderIndex;

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: {
              id: ctx.testFolderData.parentFolderId,
              orderIndex: orderIndex!
            }
          },
          ctx.restrictedOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);

        const folderAfterDeleteRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.parentFolderId },
          ctx.adminOptions
        );
        expect(folderAfterDeleteRes?.data?.folder).toBeDefined();
      });

      // VE-16854 merge will fix this test case
      it('FO70 - cms user can not delete admin created folder', async () => {
        const folderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-folder-to-delete-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.rootFolderId
            }
          },
          ctx.adminOptions
        );
        expect(folderRes?.data?.createFolder).toBeDefined();
        const folderIdToDelete = folderRes?.data?.createFolder?.id;
        const orderIndex = folderRes?.data?.createFolder?.orderIndex;

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          { input: { id: folderIdToDelete!, orderIndex: orderIndex! } },
          ctx.regularOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO71 - Add delete permission for restricted user', async () => {
        const updateRes = await gqlClient.sdk.authPermissionSetUpdate(
          {
            input: {
              id: ctx.rbac.authPermissionSetId,
              name: `${citestMarker}-folder-delete-permission-${uuidv4()}`,
              permissions: [
                AuthPermissionType.AiwareFolderCreate,
                AuthPermissionType.AiwareFolderDelete,
                AuthPermissionType.AiwareFolderFile,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderUpdate
              ]
            }
          },
          ctx.adminOptions
        );
        expect(updateRes).toBeDefined();

        // relogin restricted user
        ctx.restrictedOptions = await ctx.relogin(
          ctx.restrictedUser.userId,
          ctx.testOrg.guid
        );

        // Wait for the authz cache to reflect the new permission set before
        // returning. FO72 asserts AIWARE_FOLDER_DELETE (via deleteFolder's
        // `input.id` RBAC directive) on a freshly-created *child* folder.
        // The RBAC directive cache is keyed by the full (resourceType, ids,
        // permissions, authGroups, orgId) tuple, so different
        // permissions/resources are entirely independent cache entries —
        // probing with createFolder only warms AIWARE_FOLDER_FILE on the
        // *parent* folder (parentId's directive) and proves nothing about
        // AIWARE_FOLDER_DELETE on a child folder. Probe with the exact
        // permission + resource shape FO72 will exercise: create a
        // disposable child folder as admin, then have the restricted user
        // delete it.
        const probeMaxAttempts = 15;
        for (let attempt = 1; attempt <= probeMaxAttempts; attempt++) {
          const probeFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-fo71-probe-${uuidv4()}`,
                description: 'citest authz probe — deleted immediately',
                parentId: ctx.testFolderData.parentFolderId
              }
            },
            ctx.adminOptions
          );
          const probeFolderId = probeFolderRes?.data?.createFolder?.id;
          const probeOrderIndex =
            probeFolderRes?.data?.createFolder?.orderIndex;

          try {
            await gqlClient.sdk.deleteFolder(
              { input: { id: probeFolderId!, orderIndex: probeOrderIndex! } },
              ctx.restrictedOptions
            );
            // Cache is warm for AIWARE_FOLDER_DELETE on a child folder — proceed.
            break;
          } catch (err) {
            // Not warm yet — the probe folder is still there, clean it up
            // as admin so it doesn't leak, then retry with a fresh one.
            await gqlClient.sdk.deleteFolder(
              { input: { id: probeFolderId!, orderIndex: probeOrderIndex! } },
              ctx.adminOptions
            );
            if (attempt === probeMaxAttempts) throw err;
            await helpers.sleep(2000);
          }
        }
      });

      it('FO72 - restrict user delete folder success', async () => {
        // Safety-net retry in case the authz cache warmed between FO71's
        // probe success and this delete (e.g. a second invalidation
        // cycle). Wider window than before: 10 attempts x 2s = up to 18s.
        // FO71's probe should make this a no-op on most runs.
        //
        // A denied hasPermissionsWithCache result is memoized (server-side
        // TTL, now shortened but still non-zero), so retrying the delete
        // against the SAME folder/cache key just replays the cached "no".
        // Mirror FO71's fix: create a brand-new disposable folder each
        // attempt so every retry is a genuinely fresh cache key and
        // therefore a real authz check, not a replay.
        const maxAttempts = 10;
        let deleteFolderRes: any;
        let testFolderId: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const newFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-folder-to-delete-${uuidv4()}`,
                description: 'citest',
                parentId: ctx.testFolderData.parentFolderId
              }
            },
            ctx.adminOptions
          );
          expect(newFolderRes?.data?.createFolder).toBeDefined();
          testFolderId = newFolderRes?.data?.createFolder?.id;
          const orderIndex = newFolderRes?.data?.createFolder?.orderIndex;

          try {
            deleteFolderRes = await gqlClient.sdk.deleteFolder(
              { input: { id: testFolderId, orderIndex: orderIndex! } },
              ctx.restrictedOptions
            );
            break;
          } catch (err) {
            await gqlClient.sdk.deleteFolder(
              { input: { id: testFolderId, orderIndex: orderIndex! } },
              ctx.adminOptions
            );
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(2000);
          }
        }
        expect(deleteFolderRes?.data?.deleteFolder).toBeDefined();
        expect(deleteFolderRes?.data?.deleteFolder?.id).toEqual(testFolderId);
      });

      it('FO73 - restrict user cannot access root folder', async () => {
        const folderResult = gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.rootFolderId },
          ctx.restrictedOptions
        );
        await expect(folderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO74 - restrict user cannot access root folder of admin', async () => {
        const folderResult = gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.rootFolderId2 },
          ctx.restrictedOptions
        );
        await expect(folderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO75 - cms user can access root folder of organization', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.rootFolderId },
          ctx.regularOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        expect(folderRes?.data?.folder?.id).toEqual(
          ctx.testFolderData.rootFolderId
        );
      });

      // VE-16855 merge will fix this case
      it('FO76.1 - cms user can not delete non empty root folder of organization', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.rootFolderId },
          ctx.regularOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const orderIndex = folderRes?.data?.folder?.orderIndex;

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: {
              id: ctx.testFolderData.rootFolderId,
              orderIndex: orderIndex!
            }
          },
          ctx.regularOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO76.2 - cms user can not delete empty root folder of organization', async () => {
        const folderRes = await gqlClient.sdk.folderBasic(
          { id: ctx.testFolderData.rootFolderIdOrg2 },
          ctx.regularUserOrg2Options
        );
        expect(folderRes?.data?.folder).toBeDefined();
        const orderIndex = folderRes?.data?.folder?.orderIndex;

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: {
              id: ctx.testFolderData.rootFolderIdOrg2,
              orderIndex: orderIndex!
            }
          },
          ctx.regularUserOrg2Options
        );

        expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO77 - child folder auto deleted with parent folder', async () => {
        // Folder V2 can only delete empty folder
        if (version === 'v2') return;

        const newParentFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-parent-folder-to-delete-${uuidv4()}`,
              description: 'citest',
              parentId: ctx.testFolderData.rootFolderId
            }
          },
          ctx.adminOptions
        );
        expect(newParentFolderRes?.data?.createFolder).toBeDefined();
        const parentFolderId = newParentFolderRes?.data?.createFolder?.id;
        const parentOrderIndex =
          newParentFolderRes?.data?.createFolder?.orderIndex;

        const newChildFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-folder-to-delete-${uuidv4()}`,
              description: 'citest',
              parentId: parentFolderId!
            }
          },
          ctx.adminOptions
        );
        expect(newChildFolderRes?.data?.createFolder).toBeDefined();
        const childFolderId = newChildFolderRes?.data?.createFolder?.id;

        const deleteFolderRes = await gqlClient.sdk.deleteFolder(
          { input: { id: parentFolderId!, orderIndex: parentOrderIndex! } },
          ctx.adminOptions
        );
        expect(deleteFolderRes?.data?.deleteFolder).toBeDefined();
        expect(deleteFolderRes?.data?.deleteFolder?.id).toEqual(parentFolderId);

        const childFolderResult = gqlClient.sdk.folderBasic(
          { id: childFolderId! },
          ctx.adminOptions
        );
        await expect(childFolderResult).rejects.toThrow(/not_found/);
      });
    });
  });
}
