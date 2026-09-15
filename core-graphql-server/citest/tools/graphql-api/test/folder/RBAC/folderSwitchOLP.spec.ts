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
import { setupTestOrgAndUser } from '@api/test/helpers/organization.helper';
import { createIsolatedSuperadmin } from '@api/test/helpers/superadminSession';
import {
  pollUntilReady,
  waitForAuthGroupMembership
} from '@api/test/helpers/rbacPropagation';
import {
  AuthGroupMemberType,
  AuthPermissionType,
  AuthResourceType,
  OrganizationStatus,
  RootFolderType
} from '@api/src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
let testSetup: any, testSetup2: any;

let superOrgGuid: any, superOrgId: any, superUserId: any;
let testUsers: any;
let superToken: string, superOptions: Record<string, string>;
let testOrg: any,
  adminUser: any,
  adminUser2: any,
  regularUser: any,
  restrictedUser: any;
let adminOptions: any, adminOptions2: any, regularOptions: any;
let restrictedOptions: any;
let testOrg2: any, adminOrg2: any, adminOrg2Options: any;
let regularOrg2: any, regularOrg2Options: any;
let testFolderData: any = {
  rootFolderId: null,
  treeObjectId: null,
  rootFolderId2: null,
  treeObjectId2: null,
  parentFolderId: null,
  tdoId: null,
  parentFolderId2: null,
  childFolderId: null,
  childFolderId2: null,
  childTdoId: null,
  childTdoId2: null,
  grandChildFolderId: null,
  grandChildFolderTdoId: null,
  defaultUserTdoId: null,
  defaultUserCreatedFolderId: null,
  restrictedUserCreatedFolderId: null
};

let rbac: any = {
  authGroupId: null,
  authGroupCreateId: null,
  authPermissionSetId: null,
  TDOPermissionSetId: null
};

async function impersonateUser(
  userId: string,
  organizationGuid: string
): Promise<Record<string, string>> {
  const impersonated = await impersonateUserHelper(
    superToken,
    userId,
    organizationGuid
  );
  return impersonated.requestOptions;
}

function shareFolderQuery(
  folderId: string,
  readOrganizationIds: any[],
  writeOrganizationIds?: any[]
): string {
  return `mutation {
      shareFolder (input: {
        folderId: "${folderId}",
        ${_.isEmpty(readOrganizationIds) ? '' : `readOrganizationIds: [${readOrganizationIds.join(',')}],`}
        ${_.isEmpty(writeOrganizationIds) ? '' : `writeOrganizationIds: [${writeOrganizationIds!.join(',')}],`}
      }) {
        id
        name
        orderIndex
        description
        status
      }
    }`;
}

describe('citest_folder: folder test switch OLP config', () => {
  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superToken = isolatedSuperadmin.token;
    superOptions = isolatedSuperadmin.options;

    const meRes = await isolatedSuperadmin.client.sdk.me();
    expect(meRes?.data?.me).toBeDefined();
    superOrgGuid = meRes?.data?.me?.organization?.guid;
    superOrgId = meRes?.data?.me?.organization?.id;
    superUserId = meRes?.data?.me?.id;
  });

  describe.each(['v1', 'v2'])('folder version: %s', (folderVersion: string) => {
    let createOrgAndUserInput: any, createSecondOrgAndUserInput: any;

    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput(folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(folderVersion);

      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      expect(testOrg.users).toBeDefined();
      testUsers = _.get(testOrg, 'users.records');

      const [au, au2, ru, xu] = testSetup.listOptions ?? [];
      adminUser = au;
      adminOptions = au?.requestOptions;
      adminUser2 = au2;
      adminOptions2 = au2?.requestOptions;
      regularUser = ru;
      regularOptions = ru?.requestOptions;
      restrictedUser = xu;
      restrictedOptions = xu?.requestOptions;

      // create root folder
      const rootFolderRes = await gqlClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
      expect(rootFolder).toBeDefined();
      expect(rootFolder.length).toBeGreaterThan(0);
      const orgRootFolder = rootFolder.find((f: any) => !f.ownerId);
      const adminRootFolder = rootFolder.find(
        (f: any) => f.ownerId === adminUser.userId
      );
      testFolderData.rootFolderId = orgRootFolder?.id;
      testFolderData.rootFolderId2 = adminRootFolder?.id;

      // create folder, and content
      const folderRes = await gqlClient.sdk.createFolderBasic(
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
      const tdoResult = tdoRes?.data?.createTDOWithAsset;
      expect(tdoResult).toBeDefined();
      testFolderData.tdoId = tdoResult?.id;

      const parentFolder2Res = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        },
        adminOptions
      );
      const parentFolder2 = parentFolder2Res?.data?.createFolder;
      expect(parentFolder2).toBeDefined();
      testFolderData.parentFolderId2 = parentFolder2?.id;

      // get parent folder treeObjectId
      const folderTreeRes = await gqlClient.sdk.folderBasic(
        { id: testFolderData.parentFolderId },
        adminOptions
      );
      expect(folderTreeRes?.data).toBeDefined();
      expect(folderTreeRes?.data?.folder?.treeObjectId).toBeDefined();
      testFolderData.treeObjectId = folderTreeRes?.data?.folder?.treeObjectId;

      // create child folder and content
      const childFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        },
        adminOptions
      );
      const childFolder = childFolderRes?.data?.createFolder;
      expect(childFolder).toBeDefined();
      testFolderData.childFolderId = childFolder?.id;

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
      const childTdoResult = childTdoRes?.data?.createTDOWithAsset;
      expect(childTdoResult).toBeDefined();
      testFolderData.childTdoId = childTdoResult?.id;

      // create grand child folder and content
      const grandChildFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.childFolderId
          }
        },
        adminOptions
      );
      const grandChildFolder = grandChildFolderRes?.data?.createFolder;
      expect(grandChildFolder).toBeDefined();
      testFolderData.grandChildFolderId = grandChildFolder?.id;

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
      const grandChildTdoResult = grandChildTdoRes?.data?.createTDOWithAsset;
      expect(grandChildTdoResult).toBeDefined();
      testFolderData.grandChildTdoId = grandChildTdoResult?.id;

      // set up org 2
      testSetup2 = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createSecondOrgAndUserInput
      );

      testOrg2 = testSetup2.org;
      expect(testOrg2).toBeDefined();
      expect(testOrg2.name).toContain(`${citestMarker}-org`);
      expect(testOrg2.users).toBeDefined();

      const [au2Org2, ru2Org2] = testSetup2.listOptions ?? [];
      adminOrg2 = au2Org2;
      adminOrg2Options = au2Org2?.requestOptions;
      regularOrg2 = ru2Org2;
      regularOrg2Options = ru2Org2?.requestOptions;

      // create root folder for org2
      const rootFolder2Res = await gqlClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOrg2Options
      );
      const rootFolder2 = rootFolder2Res?.data?.createRootFolders ?? [];
      expect(rootFolder2).toBeDefined();
      expect(rootFolder2.length).toBeGreaterThan(0);
      const org2RootFolder = rootFolder2.find((f: any) => !f.ownerId);
      const admin2RootFolder = rootFolder2.find(
        (f: any) => f.ownerId === adminOrg2.userId
      );
      testFolderData.orgRootFolderIdOrg2 = org2RootFolder?.id;
      testFolderData.orgTreeObjectIdOrg2 = org2RootFolder?.treeObjectId;
      testFolderData.adminRootFolderId2Org2 = admin2RootFolder?.id;
      testFolderData.adminTreeObjectId2Org2 = admin2RootFolder?.treeObjectId;

      // create folder for org2
      const folderOrg2Res = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.orgRootFolderIdOrg2
          }
        },
        adminOrg2Options
      );
      const folderOrg2 = folderOrg2Res?.data?.createFolder;
      expect(folderOrg2).toBeDefined();
      testFolderData.parentFolderIdOrg2 = folderOrg2?.id;
    });

    updateOrgOLPOption('enabled');
    runTestFolderOLP(folderVersion);

    afterAll(async () => {
      const listUserIds = [
        ...(testSetup?.listOptions ?? []),
        ...(testSetup2?.listOptions ?? [])
      ].map((user: any) => user.userId);

      if (listUserIds.length > 0) {
        await safe('delete users', async () => {
          for (const id of listUserIds) {
            await gqlClient.sdk.deleteUser({ id }, superOptions);
          }
        });
      }

      if (testOrg?.id) {
        await safe('delete organization', () =>
          gqlClient.sdk.updateOrganization(
            { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
            superOptions
          )
        );
      }

      if (testOrg2?.id) {
        await safe('delete organization 2', () =>
          gqlClient.sdk.updateOrganization(
            { input: { id: testOrg2.id, status: OrganizationStatus.Deleted } },
            superOptions
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

function getOrgAndUserInput(version = 'v1') {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: 'disabled',
          v2FoldersEnabled: version === 'v1' ? 'disabled' : 'enabled'
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
        name: `${citestMarker}-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      },
      {
        name: `${citestMarker}-restrict-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: []
      }
    ]
  };
}

function getOrg2AndUserInput(version = 'v1') {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: 'disabled',
          v2FoldersEnabled: version === 'v1' ? 'disabled' : 'enabled'
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
        name: `${citestMarker}-admin-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        name: `${citestMarker}-regular-user-${version}-${uuidv4()}@localhost`,
        password: 'testPassword',
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
}

function updateOrgOLPOption(status: string) {
  describe('non OLP update to OLP', () => {
    it('update organization to OLP should success', async () => {
      const updateOrgRes = await gqlClient.sdk.updateOrganization(
        {
          input: {
            id: testOrg.id,
            metadata: {
              features: {
                enableRBACFeature: status
              }
            }
          }
        },
        superOptions
      );
      const updateOrg = updateOrgRes?.data?.updateOrganization;
      expect(updateOrg).toBeDefined();
      expect(updateOrg?.id).toEqual(testOrg.id);

      // verify org updated
      const getOrgRes = await pollUntilReady(
        () => gqlClient.sdk.organizations({ id: testOrg.id }, superOptions),
        (value) =>
          _.get(
            value?.data?.organizations?.records ?? [],
            '[0].jsondata.features.enableRBACFeature'
          ) === status
      );
      const getOrgResult = getOrgRes?.data?.organizations?.records ?? [];
      expect(getOrgResult).toBeDefined();
      expect(
        _.get(getOrgResult, '[0].jsondata.features.enableRBACFeature')
      ).toEqual(status);
      testOrg.guid = _.get(getOrgResult, '[0].guid', testOrg.guid);
    });
  });
}

function runTestFolderOLP(version = 'v1') {
  describe(`Folder ${version} OLP Tests`, () => {
    let restrictUserCreatedFolderId: string | undefined;

    beforeAll(async () => {
      // relogin admin, regular, restrict user to get new token with OLP enabled
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );
      regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
      adminOptions = await impersonateUser(adminUser.userId, testOrg.guid);

      // new admin
      const password = 'testPassword';
      const newUserRes = await gqlClient.sdk.createUser(
        {
          input: {
            name: citestMarker + '-admin-user-' + uuidv4(),
            password,
            organizationId: testOrg.id,
            roleIds: ['032218c3-d47e-4287-9d16-7bb867c01266']
          }
        },
        superOptions
      );
      const newUser = newUserRes?.data?.createUser;
      expect(newUser).toBeDefined();

      const newAdminOptions = await impersonateUser(newUser!.id, testOrg.guid);
      testFolderData.newAdminUserOptions = newAdminOptions;
      testFolderData.newAdminUserId = newUser!.id;
    });

    it('should removes restricted users from default AGs', async () => {
      // Refresh the other users' tokens FIRST. `refreshAllUserTokens` also
      // re-mints `restrictedOptions`, so running it afterwards would throw away
      // the confirmed-clear session `removeRestrictUserAuth` polls for and
      // replace it with an unverified one — reopening the race this fixes.
      await refreshAllUserTokens();

      // remove restricted users from default auth groups
      const confirmedRestrictedOptions = await removeRestrictUserAuth();
      // Returns undefined when there were no groups to remove — keep the
      // session minted just above rather than clearing it.
      if (confirmedRestrictedOptions) {
        restrictedOptions = confirmedRestrictedOptions;
      }
    });

    xit('cms user get folder success', async () => {
      const getFolderRes = await gqlClient.sdk.folderBasic(
        { id: testFolderData.parentFolderId },
        regularOptions
      );

      expect(getFolderRes.data.folder).toBeDefined();
      expect(getFolderRes?.data?.folder?.id).toEqual(
        testFolderData.parentFolderId
      );
    });

    it('restrict user get folder should fail', async () => {
      // Refresh token to ensure it reflects current permissions
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      const getFolderResult = gqlClient.sdk.folderBasic(
        { id: testFolderData.parentFolderId },
        restrictedOptions
      );
      await expect(getFolderResult).rejects.toThrow(
        /(No authorization|authentication_error)/
      );
    });

    it('cms, restrict user update folder should fail', async () => {
      // Refresh tokens to ensure they're valid after permission changes
      regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      // cms user
      const updateFolderResult = gqlClient.sdk.updateFolder(
        {
          input: {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-Updated'
          }
        },
        regularOptions
      );
      await expect(updateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );

      // restrict user
      const restrictUpdateFolderResult = gqlClient.sdk.updateFolder(
        {
          input: {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-Updated'
          }
        },
        restrictedOptions
      );
      await expect(restrictUpdateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('OLP cms user can create folder', async () => {
      const createFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        },
        regularOptions
      );
      const createFolder = createFolderRes?.data?.createFolder;
      expect(createFolder).toBeDefined();
      testFolderData.defaultUserCreatedFolderId = createFolder?.id;
    });

    it('restrict user create folder should fail', async () => {
      // Refresh token before testing
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      // restrict user
      const restrictCreateFolderResult = gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        },
        restrictedOptions
      );
      await expect(restrictCreateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('cms, restrict user file folder should fail', async () => {
      // Refresh tokens before testing
      regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      // cms user
      const fileTDOResult = gqlClient.sdk.fileTemporalDataObject(
        {
          input: {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        },
        regularOptions
      );
      await expect(fileTDOResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error|not_allowed)/
      );

      // restrict user
      const restrictFileTDOResult = gqlClient.sdk.fileTemporalDataObject(
        {
          input: {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        },
        restrictedOptions
      );
      await expect(restrictFileTDOResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('cms, restrict user delete folder should fail', async () => {
      // Refresh tokens before testing
      regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      // new folder to be deleted
      const newFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: citestMarker + '-Folder to be deleted',
            description: 'Folder Description',
            parentId: testFolderData.parentFolderId
          }
        },
        testFolderData.newAdminUserOptions
      );
      const newFolder = newFolderRes?.data?.createFolder;
      expect(newFolder).toBeDefined();
      expect(newFolder?.id).toBeDefined();
      testFolderData.folderId = newFolder?.id;

      // restrict user
      const restrictDeleteFolderResult = gqlClient.sdk.deleteFolder(
        { input: { id: testFolderData.folderId, orderIndex: 0 } },
        restrictedOptions
      );
      await expect(restrictDeleteFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );

      // cms user
      const deleteFolderResult = gqlClient.sdk.deleteFolder(
        { input: { id: testFolderData.folderId, orderIndex: 0 } },
        regularOptions
      );
      await expect(deleteFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('new desktop admin Grant FOLDER_READ to new restrict user should success', async () => {
      const updateRole = await addFolderReadPermissionToUser();

      restrictedOptions = updateRole.restrictedOptions;
      rbac.authPermissionSetId = updateRole.newAuthPermissionSetId;
      rbac.authGroupId = updateRole.newAuthGroupId;

      // Refresh all tokens after permission changes
      await refreshAllUserTokens();
    });

    it('restrict user get folder should success', async () => {
      const getFolderRes = await gqlClient.sdk.folderBasic(
        { id: testFolderData.parentFolderId },
        restrictedOptions
      );
      const getFolderResult = getFolderRes?.data;
      expect(getFolderResult).toBeDefined();
      expect(getFolderResult?.folder?.id).toEqual(
        testFolderData.parentFolderId
      );
    });

    it('new desktop admin Grant FOLDER_UPDATE to new restrict user', async () => {
      const newAuthPermissionSet = await gqlClient.sdk.authPermissionSetUpdate(
        {
          input: {
            id: rbac.authPermissionSetId,
            name: `${citestMarker}-folder-update-permission-${uuidv4()}`,
            permissions: [
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderUpdate
            ]
          }
        },
        testFolderData.newAdminUserOptions
      );
      expect(newAuthPermissionSet.data.authPermissionSetUpdate).toBeDefined();

      // relogin restricted user
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );

      // Refresh all tokens after permission update
      await refreshAllUserTokens();
    });

    it('restrict user update folder should success', async () => {
      const updatedFolderRes = await gqlClient.sdk.updateFolder(
        {
          input: {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-Restricted Updated'
          }
        },
        restrictedOptions
      );
      const updatedFolder = updatedFolderRes?.data?.updateFolder;
      expect(updatedFolder).toBeDefined();
      expect(updatedFolder?.id).toEqual(testFolderData.parentFolderId);
    });

    it('new admin Grant FOLDER_CREATE to new restrict user', async () => {
      // share folder to restricted user
      const newAuthPermissionSetRes =
        await gqlClient.sdk.authPermissionSetCreate(
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
          testFolderData.newAdminUserOptions
        );
      const authPermissionSetData =
        newAuthPermissionSetRes?.data?.authPermissionSetCreate;
      expect(authPermissionSetData).toBeDefined();
      rbac.newFolderCreatePermissionSetId = authPermissionSetData?.id;

      const addACEsToResourcesResult = await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.Folder,
          ids: [testFolderData.parentFolderId],
          entries: [
            {
              member: {
                id: restrictedUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: rbac.newFolderCreatePermissionSetId
            },
            {
              member: {
                id: regularUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: rbac.newFolderCreatePermissionSetId
            }
          ]
        },
        testFolderData.newAdminUserOptions
      );
      expect(addACEsToResourcesResult?.data?.addACEsToResources).toBeDefined();

      // add create permission
      const createPermissionSetRes =
        await gqlClient.sdk.authPermissionSetCreate(
          {
            input: {
              name: `${citestMarker}-auth-permission-set-${uuidv4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: [AuthPermissionType.AiwareFolderCreate]
            }
          },
          testFolderData.newAdminUserOptions
        );
      expect(
        createPermissionSetRes?.data?.authPermissionSetCreate
      ).toBeDefined();
      const createPermissionSetData =
        createPermissionSetRes?.data?.authPermissionSetCreate;
      expect(createPermissionSetData).toBeDefined();
      rbac.newCreatePermissionSetId = createPermissionSetData?.id;

      await gqlClient.sdk.addACEsToResources(
        {
          resourceType: AuthResourceType.Organization,
          ids: [testOrg.id],
          entries: [
            {
              member: {
                id: restrictedUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: rbac.newCreatePermissionSetId
            },
            {
              member: {
                id: regularUser.userId,
                memberType: AuthGroupMemberType.User
              },
              permissionSetID: rbac.newCreatePermissionSetId
            }
          ]
        },
        testFolderData.newAdminUserOptions
      );

      // relogin restricted user
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );
    });

    it('restrict user create folder should success', async () => {
      const createFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            name: `${citestMarker}-folder-${uuidv4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        },
        restrictedOptions
      );
      const createFolder = createFolderRes?.data?.createFolder;
      expect(createFolder).toBeDefined();
      restrictUserCreatedFolderId = createFolder?.id;
    });

    it('Grant FOLDER_FILE to cms user', async () => {
      const addACEsToResourcesResult =
        await gqlClient.sdk.authPermissionSetUpdate(
          {
            input: {
              id: rbac.newCreatePermissionSetId,
              name: `${citestMarker}-folder-file-permission-${uuidv4()}`,
              permissions: [
                AuthPermissionType.AiwareFolderFile,
                AuthPermissionType.AiwareFolderCreate,
                AuthPermissionType.AiwareFolderRead,
                AuthPermissionType.AiwareFolderUpdate,
                AuthPermissionType.AiwareTdoRead,
                AuthPermissionType.AiwareTdoCreate
              ]
            }
          },
          testFolderData.newAdminUserOptions
        );
      expect(
        addACEsToResourcesResult.data.authPermissionSetUpdate
      ).toBeDefined();

      // relogin cms user
      regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
    });

    it('cms user file new folder content should success', async () => {
      const newTDORes = await gqlClient.sdk.createTDOWithAsset(
        {
          input: {
            name: `${citestMarker}-tdo-${uuidv4()}`,
            ...tdoAssetInput
          }
        },
        regularOptions
      );
      const newTDO = newTDORes?.data?.createTDOWithAsset;
      expect(newTDO).toBeDefined();

      const filedTDORes = await gqlClient.sdk.fileTemporalDataObject(
        {
          input: {
            tdoId: newTDO!.id,
            folderId: testFolderData.parentFolderId
          }
        },
        regularOptions
      );
      expect(filedTDORes?.data?.fileTemporalDataObject).toBeDefined();
    });

    it('cms user share folder to other org should fail', async () => {
      const query = shareFolderQuery(testFolderData.parentFolderId, [
        +testOrg2.id
      ]);

      const shareFolderResult = gqlClient.query(query, {}, regularOptions);
      await expect(shareFolderResult).rejects.toThrow(
        /(not authorized|not_allowed)/
      );
    });

    it('org admin share folder should fail', async () => {
      const query = shareFolderQuery(testFolderData.parentFolderId, [
        +testOrg2.id
      ]);

      const shareFolderResult = gqlClient.query(query, {}, adminOptions);
      await expect(shareFolderResult).rejects.toThrow(
        /(not authorized|not_allowed)/
      );
    });

    it('superadmin can share folder', async () => {
      const query = shareFolderQuery(testFolderData.parentFolderId, [
        +testOrg2.id
      ]);

      const sharedFolder: any = await gqlClient.query(query, {}, superOptions);
      expect(sharedFolder).toBeDefined();
      const shareFolderId = _.get(sharedFolder, 'shareFolder.id');
      expect(shareFolderId).toBeDefined();
    });

    it('target org can get folder', async () => {
      // Retry: v2DalSwitch returns before the V2 share write commits when the
      // super admin org routes to V1 as primary (V2 is fire-and-forget).
      // The target org reads from V2, so shared_org_read may not be visible yet.
      const maxAttempts = 5;
      let getFolder: any;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const getFolderRes = await gqlClient.sdk.folderBasic(
            { id: testFolderData.parentFolderId },
            adminOrg2Options
          );
          getFolder = getFolderRes?.data;
          break;
        } catch (err) {
          if (attempt === maxAttempts) throw err;
          await helpers.sleep(1000);
        }
      }
      expect(getFolder).toBeDefined();
      expect(getFolder?.folder?.id).toEqual(testFolderData.parentFolderId);
    });

    it('new admin Grant FOLDER_DELETE to restrict user', async () => {
      const newAuthPermissionSet = await gqlClient.sdk.authPermissionSetUpdate(
        {
          input: {
            id: rbac.newFolderCreatePermissionSetId,
            name: `${citestMarker}-folder-delete-permission-${uuidv4()}`,
            permissions: [
              AuthPermissionType.AiwareFolderCreate,
              AuthPermissionType.AiwareFolderFile,
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderUpdate,
              AuthPermissionType.AiwareFolderDelete
            ]
          }
        },
        testFolderData.newAdminUserOptions
      );

      await gqlClient.sdk.authPermissionSetUpdate(
        {
          input: {
            id: rbac.newCreatePermissionSetId,
            name: `${citestMarker}-folder-create-permission-${uuidv4()}`,
            permissions: [
              AuthPermissionType.AiwareFolderCreate,
              AuthPermissionType.AiwareFolderFile,
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderUpdate,
              AuthPermissionType.AiwareFolderDelete
            ]
          }
        },
        testFolderData.newAdminUserOptions
      );
      expect(newAuthPermissionSet.data.authPermissionSetUpdate).toBeDefined();

      // relogin restricted user
      restrictedOptions = await impersonateUser(
        restrictedUser.userId,
        testOrg.guid
      );
    });

    it('restricted user delete child folder should success', async () => {
      // new folder to be deleted
      const newFolderRes = await gqlClient.sdk.createFolderBasic(
        {
          input: {
            parentId: testFolderData.parentFolderId,
            description: 'Folder Description',
            name: `${citestMarker}Test Folder ${uuidv4()}`
          }
        },
        testFolderData.newAdminUserOptions
      );
      const newFolder = newFolderRes?.data?.createFolder;
      expect(newFolder).toBeDefined();
      expect(newFolder?.id).toBeDefined();

      const deletedFolderRes = await gqlClient.sdk.deleteFolder(
        {
          input: {
            id: newFolder!.id,
            orderIndex: newFolder?.orderIndex ?? 0
          }
        },
        restrictedOptions
      );
      const deletedFolder = deletedFolderRes?.data?.deleteFolder;
      expect(deletedFolder).toBeDefined();
      expect(deletedFolder?.id).toEqual(newFolder?.id);
    });

    afterAll(async () => {
      if (testFolderData.defaultUserCreatedFolderId) {
        await safe('delete default user created folder', () =>
          gqlClient.sdk.deleteFolder(
            {
              input: {
                id: testFolderData.defaultUserCreatedFolderId,
                orderIndex: 0
              }
            },
            regularOptions
          )
        );
      }

      if (restrictUserCreatedFolderId) {
        await safe('delete restrict user created folder', () =>
          gqlClient.sdk.deleteFolder(
            { input: { id: restrictUserCreatedFolderId!, orderIndex: 0 } },
            restrictedOptions
          )
        );
      }
    });
  });
}

async function removeRestrictUserAuth(): Promise<
  Record<string, string> | undefined
> {
  // relogin restricted user
  restrictedOptions = await impersonateUser(
    restrictedUser.userId,
    testOrg.guid
  );

  const restrictedMeRes = await gqlClient.sdk.me({}, restrictedOptions);
  expect(_.get(restrictedMeRes, 'data.me.name')).toContain('-restrict-user');
  const authGroupIds = _.get(restrictedMeRes, 'data.me.authGroupIds', []);

  // Refresh new admin user options if exists
  if (testFolderData.newAdminUserId) {
    testFolderData.newAdminUserOptions = await impersonateUser(
      testFolderData.newAdminUserId,
      testOrg.guid
    );
  }

  if (authGroupIds.length > 0) {
    const result = await Promise.all(
      authGroupIds.map((id: string) =>
        gqlClient.sdk.authGroupRemoveMembers(
          { id, memberIds: [restrictedUser.userId] },
          testFolderData.newAdminUserOptions
        )
      )
    );
    expect(result.length).toEqual(authGroupIds.length);

    // relogin restricted user — but the removal is fire-and-forget on the
    // server, so a session minted right now can still carry the old groups.
    // Every caller of this helper goes on to assert an authorization outcome
    // against the returned session, so confirm the removal instead.
    return await waitForAuthGroupMembership(
      gqlClient,
      () => impersonateUser(restrictedUser.userId, testOrg.guid),
      { expectAbsent: authGroupIds, label: 'restricted user' }
    );
  }

  return undefined;
}

async function addFolderReadPermissionToUser(): Promise<{
  restrictedOptions: Record<string, string>;
  newAuthPermissionSetId: string;
  newAuthGroupId: string;
}> {
  const adminOpts = testFolderData.newAdminUserOptions;

  const newAuthGroupRes = await gqlClient.sdk.CreateAuthGroup(
    {
      input: {
        name: `${citestMarker}-folder-read-group-${uuidv4()}`,
        description: 'citest folder read group',
        members: [
          { id: restrictedUser.userId, memberType: AuthGroupMemberType.User }
        ]
      }
    },
    adminOpts
  );
  const newAuthGroup = newAuthGroupRes?.data?.authGroupCreate;
  expect(newAuthGroup).toBeDefined();
  const newAuthGroupId = newAuthGroup!.id;

  const newAuthPermissionSetRes = await gqlClient.sdk.authPermissionSetCreate(
    {
      input: {
        name: `${citestMarker}-folder-read-permission-${uuidv4()}`,
        description: 'citest folder read permission',
        permissions: [AuthPermissionType.AiwareFolderRead]
      }
    },
    adminOpts
  );
  const authPermissionSetData =
    newAuthPermissionSetRes?.data?.authPermissionSetCreate;
  expect(authPermissionSetData).toBeDefined();
  const newAuthPermissionSetId = authPermissionSetData!.id;

  await gqlClient.sdk.addACEsToResources(
    {
      resourceType: AuthResourceType.Folder,
      ids: [testFolderData.parentFolderId, testFolderData.parentFolderId2],
      entries: [
        {
          member: {
            id: newAuthGroupId,
            memberType: AuthGroupMemberType.Group
          },
          permissionSetID: newAuthPermissionSetId
        }
      ]
    },
    adminOpts
  );

  // relogin restricted user
  const restrictedOpts = await impersonateUser(
    restrictedUser.userId,
    testOrg.guid
  );

  return {
    restrictedOptions: restrictedOpts,
    newAuthPermissionSetId,
    newAuthGroupId
  };
}

// Helper function to refresh all user tokens consistently
async function refreshAllUserTokens(): Promise<void> {
  adminOptions = await impersonateUser(adminUser.userId, testOrg.guid);
  regularOptions = await impersonateUser(regularUser.userId, testOrg.guid);
  restrictedOptions = await impersonateUser(
    restrictedUser.userId,
    testOrg.guid
  );

  // Refresh new admin user options if exists
  if (testFolderData.newAdminUserId) {
    testFolderData.newAdminUserOptions = await impersonateUser(
      testFolderData.newAdminUserId,
      testOrg.guid
    );
  }
}
