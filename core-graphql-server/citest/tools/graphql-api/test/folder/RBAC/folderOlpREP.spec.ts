import { v4 as uuidv4 } from 'uuid';

import { helpers } from '@api/src/helpers';
import { impersonateUser, safe } from '@api/src/helpers/commonHelper';
import { waitForAuthGroupMembership } from '@api/test/helpers/rbacPropagation';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { setupTestfOrgAndUser } from '@api/test/helpers/organization.helper';
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


    // create isolated super admin
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
      // Get org and user dataset
      const createOrgAndUserInput = getOrgAndUserInput(folderVersion);

      testSetup = await setupTestOrgAndUser(isoClient, createOrgAndUserInput);

      // Create organization

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);

      // create user

      // Admin 1
      adminUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('first-admin-user')
      );
      // Request header
      adminOptions = adminUser?.requestOptions;

      // Admin 2
      adminUser2 = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('second-admin-user')
      );
      adminOptions2 = adminUser2?.requestOptions;

      // regular user
      regularUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('first-regular-user')
      );
      regularOptions = regularUser?.requestOptions;


      // restricted user
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

      // create folder, and content, its parent is root folder
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


      // create tdo content
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
      
      // create second parent folder
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

// Get data set based on version of data system (v1, v2)
/**
 * 
 * @param version 
 * @returns 
 * {
 *  orgInput: 1 organization with RBAC, version 2 trigger, default is version 1
 * 
 *  userInputs: 2 admins, 1 regular user, 1 restricted user
 * }
 */
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

    // =========================================================================
    // SECTION 1: OLP Get folder test (FO1–FO15)
    // =========================================================================

    describe('OLP Get folder test', () => {
      /**
       * TEST CASE: FO1 - owner can get folder and child folder
       * SDK Methods:
       * - gqlClient.sdk.folderBasic({ id: ctx.testFolderData.parentFolderId }, ctx.adminOptions)
       * - gqlClient.sdk.folderBasic({ id: ctx.testFolderData.childFolderId }, ctx.adminOptions)
       */
      it('FO1 - owner can get folder and child folder', async () => {
        // TODO QA: Use gqlClient.sdk.folderBasic to query parentFolderId with adminOptions (owner context)
        // Assert: folder is defined and folder.id equals parentFolderId
        // TODO QA: Use gqlClient.sdk.folderBasic to query childFolderId with adminOptions
        // Assert: child folder is defined and folder.id equals childFolderId
      });

      // TODO QA: FO2 - admin can get folder and child folder
      // TODO QA: FO3 - cms user can get parent and child folder
      // TODO QA: FO4 - cms user can get folder content and child content (TDO, App, watch list)
      // TODO QA: FO5 - restricted user can not get folder
      // TODO QA: FO6 - Add folder read permission for restricted user
      // TODO QA: FO7 - restricted user can get parent folder
      // TODO QA: FO8 - restricted user can not get current child folder
      // TODO QA: FO9 - restricted user can not get current folder content
      // TODO QA: FO10 - Add parent folder content read permission for restricted user
      // TODO QA: FO11 - restricted user can get shared content
      // TODO QA: FO12 - owner create another child folder and content
      // TODO QA: FO13 - cms user can access new child folder and child content
      // TODO QA: FO14 - restricted user can get new child folder
      // TODO QA: FO15 - restricted user can not get new child content
    });

    // =========================================================================
    // SECTION 2: OLP update folder and content permissions (FO16–FO30)
    // =========================================================================

    describe('OLP update folder and content permissions', () => {
      /**
       * TEST CASE: FO16 - owner can update, move folder
       * SDK Methods:
       * - gqlClient.sdk.updateFolder({ input: { id: ctx.testFolderData.parentFolderId, name: ... } }, ctx.adminOptions)
       * - gqlClient.sdk.moveFolder({ input: { folderId: childFolderId2, toFolderId: rootFolderId, fromFolderId: parentFolderId, rootFolderType: RootFolderType.Cms } }, ctx.adminOptions)
       */
      it('FO16 - owner can update, move folder', async () => {
        // TODO QA: Use gqlClient.sdk.updateFolder to rename parentFolderId with adminOptions
        // Assert: updateFolder.id equals parentFolderId and name contains updated suffix
        // TODO QA: Use gqlClient.sdk.moveFolder to move childFolderId2 from parentFolderId to rootFolderId
        // Assert: moveFolder.id equals childFolderId2 and parent.id equals rootFolderId
      });

      // TODO QA: FO17 - move folder to its own child should fail (loop folder) — VE-16402
      // TODO QA: FO18 - admin can update, move folder
      // TODO QA: FO19.1 - cms viewer user can not update folder of others
      // TODO QA: FO19.2 - cms viewer user can move folder
      // TODO QA: FO20 - restricted user update folder should fail — VE-16583
      // TODO QA: FO21 - restricted user move folder should fail — VE-16695
      // TODO QA: FO22 - Add folder update permission for restricted user
      // TODO QA: FO23 - restricted user update folder should succeed
      // TODO QA: FO24 - restricted user update new child folder should succeed
      // TODO QA: FO25 - cms viewer user can not update folder content of others
      // TODO QA: FO26 - restricted user update folder content should fail
      // TODO QA: FO27 - cms user add content to folder TDO, watchlist, app succeed (file TDO, App, watch list)
      // TODO QA: FO28 - restricted user file content should fail
      // TODO QA: FO29 - restricted user unfile content of owner should fail
      // TODO QA: FO30 - cms user delete content of owner should fail — VE-16848 (it.skip)
    });

    // =========================================================================
    // SECTION 3: Share folder to other organization (FO31–FO51)
    // =========================================================================

    describe('share folder to other organization', () => {
      beforeAll(async () => {
        const isoClient = isolatedSuperadmin.client;
        const createSecondOrgAndUserInput = getOrg2AndUserInput(version);

        const setup2 = await setupTestfOrgAndUser(
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

      /**
       * TEST CASE: FO33.2 - super admin share folder to other org should success
       * SDK Method: gqlClient.sdk.shareFolder({ input: { folderId: ctx.testFolderData.parentFolderId, readOrganizationIds: [Number(ctx.testOrg2.id)] } })
       */
      it('FO33.2 - super admin share folder to other org should success', async () => {
        // TODO QA: Use gqlClient.sdk.shareFolder (as superadmin, no user options) to share parentFolderId
        //          with readOrganizationIds set to [Number(ctx.testOrg2.id)]
        // Assert: shareResult is defined (share succeeded)
      });

      // TODO QA: FO31 - restricted user share folder to other org should fail — VE-16539 (it.skip)
      // TODO QA: FO32 - share folder to not existing org should fail
      // TODO QA: FO33.1 - cms user share folder to other org should fail — VE-16539 (it.skip)
      // TODO QA: FO34 - owner can get sharing folder
      // TODO QA: FO35.1 - target org can get shared folder (retry pattern for v2 write commit)
      // TODO QA: FO35.2 - target org can get child folder — VE-16715 (it.skip)
      // TODO QA: FO36 - target org can get folder content — VE-16738 (it.skip)
      // TODO QA: FO37 - cms user can get folder content
      // TODO QA: FO38 - target org can get new created folder — VE-16715 (it.skip)
      // TODO QA: FO39 - target org can get new created content — VE-16738 (it.skip)
      // TODO QA: FO40 - target org create folder content should fail (read permission) — VE-16540 (it.skip)
      // TODO QA: FO42 - target org cannot update folder (read permission)
      // TODO QA: FO43 - target org can not delete shared folder — VE-16403 (it.skip)
      // TODO QA: FO44 - superAdmin user share write permission
      // TODO QA: FO45 - target org can update folder — VE-16718 (it.skip)
      // TODO QA: FO46 - target org can add new child folder — VE-16541 (it.skip)
      // TODO QA: FO47 - target org can add content to folder (retry pattern for v2 write-share)
      // TODO QA: FO48 - target org can access their added content
      // TODO QA: FO49 - admin can not access content added by shared org
      // TODO QA: FO50 - cms user can not access content added by shared org
      // TODO QA: FO51 - restricted user can not access content added by shared org
    });

    // =========================================================================
    // SECTION 4: OLP file folder (FO52–FO60)
    // =========================================================================

    describe('OLP file folder', () => {
      /**
       * TEST CASE: FO52 - cms user unfile and file admin content should fail
       * SDK Methods:
       * - gqlClient.sdk.createTDOWithAsset({ input: { name, ...tdoAssetInput, parentFolderId } }, ctx.adminOptions)
       * - gqlClient.sdk.unfileTemporalDataObject({ input: { tdoId, folderId } }, ctx.regularOptions)
       */
      it('FO52 - cms user unfile and file admin content should fail', async () => {
        // TODO QA: Use gqlClient.sdk.createTDOWithAsset to create a TDO in parentFolderId as admin
        // Assert: createTDOWithAsset is defined, capture tdoId
        // TODO QA: Use gqlClient.sdk.unfileTemporalDataObject with regularOptions to unfile admin's TDO
        // Assert: expect rejects.toThrow(/No authorization access/)
      });

      // TODO QA: FO53 - restricted user file new content to folder should fail
      // TODO QA: FO54 - Add file permission for cms user
      // TODO QA: FO55 - cms user file content to folder should succeed
      // TODO QA: FO56 - cms user unfile his owned content should succeed
      // TODO QA: FO57 - cms user unfile admin content success (unfile TDO, App, watch list)
      // TODO QA: FO58 - admin can access unfiled content of cms user
      // TODO QA: FO59 - admin can access his unfiled content
      // TODO QA: FO60 - cms user search TDO, App, watch list
    });

    // =========================================================================
    // SECTION 5: OLP create folder (FO61–FO68)
    // =========================================================================

    describe('OLP create folder', () => {
      /**
       * TEST CASE: FO61 - cms user create folder should succeed
       * SDK Method: gqlClient.sdk.createFolder({ input: { name, description, parentId: ctx.testFolderData.parentFolderId } }, ctx.regularOptions)
       */
      it('FO61 - cms user create folder should succeed', async () => {
        // TODO QA: Use gqlClient.sdk.createFolder to create a child folder under parentFolderId with regularOptions
        // Assert: createFolder is defined
        // Store: ctx.testFolderData.defaultUserCreatedFolderId = createFolder.id
      });

      // TODO QA: FO62 - restricted user create folder should fail
      // TODO QA: FO63 - Add folder create permission for restricted user
      // TODO QA: FO64 - restricted user create folder and child folder should succeed
      // TODO QA: FO65 - shared org can access new folder — VE-16715 (it.skip)
      // TODO QA: FO66 - cms user can access new added folder
      // TODO QA: FO67 - cms user delete restricted user folder should fail
      // TODO QA: FO68 - restricted user delete his folder should succeed
    });

    // =========================================================================
    // SECTION 6: OLP delete folder (FO69–FO77)
    // =========================================================================

    describe('OLP delete folder', () => {
      /**
       * TEST CASE: FO69 - restrict user delete folder should fail
       * SDK Methods:
       * - gqlClient.sdk.folderBasic({ id: ctx.testFolderData.parentFolderId }, ctx.restrictedOptions)
       * - gqlClient.sdk.deleteFolder({ input: { id: parentFolderId, orderIndex } }, ctx.restrictedOptions)
       * - gqlClient.sdk.folderBasic({ id: ctx.testFolderData.parentFolderId }, ctx.adminOptions)
       */
      it('FO69 - restrict user delete folder should fail', async () => {
        // TODO QA: Use gqlClient.sdk.folderBasic to get parentFolderId with restrictedOptions, capture orderIndex
        // TODO QA: Use gqlClient.sdk.deleteFolder with restrictedOptions to attempt deletion
        // Assert: expect rejects.toThrow(/not_allowed/)
        // TODO QA: Use gqlClient.sdk.folderBasic with adminOptions to confirm folder still exists
        // Assert: folder is still defined
      });

      // TODO QA: FO70 - cms user can not delete admin created folder — VE-16854
      // TODO QA: FO71 - Add delete permission for restricted user (includes authz cache probe)
      // TODO QA: FO72 - restrict user delete folder success (retry with fresh folder per attempt)
      // TODO QA: FO73 - restrict user cannot access root folder
      // TODO QA: FO74 - restrict user cannot access root folder of admin
      // TODO QA: FO75 - cms user can access root folder of organization
      // TODO QA: FO76.1 - cms user can not delete non empty root folder of organization
      // TODO QA: FO76.2 - cms user can not delete empty root folder of organization
      // TODO QA: FO77 - child folder auto deleted with parent folder (v1 only)
    });
  });
}
