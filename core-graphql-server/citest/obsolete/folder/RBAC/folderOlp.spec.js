/* global pending */
const helpers = require('../../../helpers/index');
const orgHelper = require('../../../helpers/organization');
const userHelper = require('../../../helpers/user');
const tdoHelper = require('../../../helpers/tdo');
const folderHelper = require('../../../helpers/folder');
const rbacHelper = require('../../../helpers/rbacHelper');
const GraphqlClient = require('../../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const tdo = require('../../../../dal/tdo');

const citestMarker = globalThis.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup, testSetup2;

let superOrgGuid, superOrgId, superUserId;
let testUsers;
let superToken, superOptions;
let testOrg, adminUser, adminUser2, regularUser, restrictedUser;
let adminOptions, adminOptions2, regularOptions, restrictedOptions;
let testOrg2,
  adminOrg2,
  adminOrg2Options,
  regularUserOrg2,
  regularUserOrg2Options;
let testFolderData = {
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
let rbac = {
  authGroupId: null,
  authGroupCreateId: null,
  authPermissionSetId: null,
  TDOPermissionSetId: null
};

let createOrgAndUserInput, createSecondOrgAndUserInput;
let defaultAGsToRemoveMember = [];
const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

describe('citest_folder: olp folder test', () => {
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);

    result = await userHelper.getMyInfo({
      gqlClient
    });

    expect(result.me).toBeDefined();
    superOrgGuid = _.get(result, 'me.organization.guid');
    superOrgId = _.get(result, 'me.organization.id');
    superUserId = _.get(result, 'me.id');
  });

  describe.each(['v1', 'v2'])('OLP Folder %s', (folderVersion) => {
    // describe('OLP Folder', (folderVersion = 'v1') => {
    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput(folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(folderVersion);
      if (folderVersion === 'v1') {
        createOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
          'disabled';
        createSecondOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
          'disabled';
      } else {
        createOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
          'enabled';
        createSecondOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
          'enabled';
      }

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
      // expect(testUsers.length).toEqual(3);

      // Login for Admin user
      adminUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOptions = adminUser.requestOptions;

      adminUser2 = _.find(testSetup.listOptions, (user) => {
        return user.key === 'adminUser2';
      });
      adminOptions2 = adminUser2.requestOptions;

      // Login for Regular user
      regularUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'regularUser';
      });
      regularOptions = regularUser.requestOptions;

      // Login for Restricted user
      restrictedUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'restrictUser';
      });
      restrictedOptions = restrictedUser.requestOptions;

      // create root folder
      const rootFolder = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: adminOptions },
        { rootFolderType: 'cms' }
      );

      expect(rootFolder).toBeDefined();
      expect(rootFolder.length).toBeGreaterThan(0);
      const orgRootFolder = rootFolder.find((folder) => !folder.ownerId);
      const adminRootFolder = rootFolder.find(
        (folder) => folder.ownerId === adminUser.userId
      );
      testFolderData.rootFolderId = _.get(orgRootFolder, 'id');
      testFolderData.treeObjectId = _.get(orgRootFolder, 'treeObjectId');
      testFolderData.rootFolderId2 = _.get(adminRootFolder, 'id');
      testFolderData.treeObjectId2 = _.get(adminRootFolder, 'treeObjectId');

      // create folder, and content
      const folder = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.rootFolderId
        }
      );
      expect(folder).toBeDefined();
      testFolderData.parentFolderId = _.get(folder, 'id');

      const tdoResult = await tdoHelper.helpCreateTDOWithAsset(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-tdo-${uuid.v4()}`,
          ...tdoAssetInput,
          parentFolderId: testFolderData.parentFolderId
        }
      );
      expect(tdoResult).toBeDefined();
      testFolderData.tdoId = _.get(tdoResult, 'id');

      const parentFolder2 = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.rootFolderId
        }
      );
      expect(parentFolder2).toBeDefined();
      testFolderData.parentFolderId2 = _.get(parentFolder2, 'id');

      // create child folder and content
      const childFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.parentFolderId
        }
      );
      expect(childFolder).toBeDefined();
      testFolderData.childFolderId = _.get(childFolder, 'id');

      const childTdoResult = await tdoHelper.helpCreateTDOWithAsset(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-tdo-${uuid.v4()}`,
          ...tdoAssetInput,
          parentFolderId: testFolderData.childFolderId
        }
      );
      expect(childTdoResult).toBeDefined();
      testFolderData.childTdoId = _.get(childTdoResult, 'id');

      // create grand child folder and content
      const grandChildFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.childFolderId
        }
      );
      expect(grandChildFolder).toBeDefined();
      testFolderData.grandChildFolderId = _.get(grandChildFolder, 'id');

      const grandChildTdoResult = await tdoHelper.helpCreateTDOWithAsset(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-tdo-${uuid.v4()}`,
          ...tdoAssetInput,
          parentFolderId: testFolderData.grandChildFolderId
        }
      );
      expect(grandChildTdoResult).toBeDefined();
      testFolderData.grandChildTdoId = _.get(grandChildTdoResult, 'id');

      // remove restricted users from default auth groups
      const restricted = await userHelper.getMyInfo({
        gqlClient,
        options: restrictedOptions
      });
      expect(_.get(restricted, 'me.name')).toContain(`-first-restrict-user`);
      defaultAGsToRemoveMember = _.get(restricted, 'me.authGroups.records', []);
    });

    folderTestOLP(folderVersion);

    afterAll(async () => {
      // delete tdo

      // delete folder

      // testSetup2/testOrg2 are only set if the nested "share folder" beforeAll ran;
      // guard against undefined if it threw before setupTestOrgAndUser completed. T45.
      const org2ListOptions = testSetup2?.listOptions ?? [];
      if (!_.isEmpty([...testSetup.listOptions, ...org2ListOptions])) {
        const listUserIds = [
          ...testSetup.listOptions,
          ...org2ListOptions
        ].map((user) => user.userId);
        await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
      }

      if (testOrg.id) {
        await orgHelper.modifyRBACFeature(
          { gqlClient, options: superOptions },
          testOrg.id,
          'disabled'
        );
        await orgHelper.deleteOrganization(
          { gqlClient, options: superOptions },
          testOrg.id
        );
      }

      if (testOrg2?.id) {
        await orgHelper.modifyRBACFeature(
          { gqlClient, options: superOptions },
          testOrg2.id,
          'disabled'
        );
        await orgHelper.deleteOrganization(
          { gqlClient, options: superOptions },
          testOrg2.id
        );
      }
    });
  });
});

function getOrgAndUserInput(version = 'v1') {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: 'enabled',
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
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
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'adminUser2',
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-first-regular-user-${version}-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      },
      {
        key: 'restrictUser',
        name: `${citestMarker}-first-restrict-user-${version}-${uuid.v4()}@localhost`,
        roleIds: []
      }
    ]
  };

  return createOrgAndUserInput;
}

function getOrg2AndUserInput(version = 'v1') {
  const createSecondOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: 'enabled',
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
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
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-first-regular-user-${version}-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
  return createSecondOrgAndUserInput;
}

function folderTestOLP(version = 'v1') {
  describe(`OLP test folder ${version}`, () => {
    it('should removes restricted users from default AGs', async () => {
      const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

      if (authGroupIds.length > 0) {
        const result = await Promise.all(
          authGroupIds.map((id) =>
            gqlClient.query(
              `mutation authGroupRemoveMembers {
                    authGroupRemoveMembers(
                      id: "${id}",
                      memberIds: ["${restrictedUser.userId}"]
                    ) {
                      id
                    }
                  }`,
              {},
              adminOptions
            )
          )
        );
        expect(result.length).toEqual(authGroupIds.length);

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;
      }
    });

    describe('OLP Get folder test', () => {
      it('FO1 - owner can get folder and child folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId }
        );
        expect(folderResult).toBeDefined();
        const parentFolderId = _.get(folderResult, 'folder.id');
        expect(parentFolderId).toEqual(testFolderData.parentFolderId);

        const childFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.childFolderId }
        );
        expect(childFolderResult).toBeDefined();
        const childFolderId = _.get(childFolderResult, 'folder.id');
        expect(childFolderId).toEqual(testFolderData.childFolderId);
      });

      it('FO2 - admin can get folder and child folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions2 },
          { id: testFolderData.parentFolderId }
        );
        expect(folderResult).toBeDefined();
        const parentFolderId = _.get(folderResult, 'folder.id');
        expect(parentFolderId).toEqual(testFolderData.parentFolderId);

        const childFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions2 },
          { id: testFolderData.childFolderId }
        );
        expect(childFolderResult).toBeDefined();
        const childFolderId = _.get(childFolderResult, 'folder.id');
        expect(childFolderId).toEqual(testFolderData.childFolderId);
      });

      it('FO3 - cms user can get parent and child folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.parentFolderId }
        );
        expect(folderResult).toBeDefined();
        const parentFolderId = _.get(folderResult, 'folder.id');
        expect(parentFolderId).toEqual(testFolderData.parentFolderId);

        const childFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.childFolderId }
        );
        expect(childFolderResult).toBeDefined();
        const childFolderId = _.get(childFolderResult, 'folder.id');
        expect(childFolderId).toEqual(testFolderData.childFolderId);
      });

      it('FO4 - cms user can get folder content and child content (TDO, App, watch list)', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: regularOptions },
          { id: testFolderData.tdoId }
        );
        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.tdoId);

        const childTdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: regularOptions },
          { id: testFolderData.childTdoId }
        );
        expect(childTdoResult).toBeDefined();
        const childTdoId = _.get(childTdoResult, 'id');
        expect(childTdoId).toEqual(testFolderData.childTdoId);
      });

      it('FO5 - restricted user can not get folder', async () => {
        const folderResult = folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.parentFolderId }
        );
        await expect(folderResult).rejects.toThrow(/No authorization access/);
      });

      it('FO6 - Add folder read permission for restricted user', async () => {
        const newAuthGroup = await rbacHelper.helpCreateAuthGroup(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-read-group-${uuid.v4()}`,
            description: 'citest folder read group',
            members: [{ id: restrictedUser.userId, memberType: 'User' }]
          }
        );
        expect(newAuthGroup).toBeDefined();
        rbac.authGroupId = _.get(newAuthGroup, 'id');

        const newAuthPermissionSet =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-read-permission-${uuid.v4()}`,
              description: 'citest folder read permission',
              permissions: ['AIWARE_FOLDER_READ']
            }
          );
        const authPermissionSetData = _.get(
          newAuthPermissionSet,
          'authPermissionSetCreate'
        );
        expect(authPermissionSetData).toBeDefined();
        rbac.authPermissionSetId = _.get(authPermissionSetData, 'id');

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Folder',
            ids: [
              testFolderData.parentFolderId,
              testFolderData.parentFolderId2
            ],
            entries: [
              {
                member: {
                  id: rbac.authGroupId,
                  memberType: 'Group'
                },
                permissionSetID: rbac.authPermissionSetId
              }
            ]
          }
        );

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;
      });

      it('FO7 - restricted user can get parent folder', async () => {
        const parentFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.parentFolderId }
        );
        expect(parentFolderResult).toBeDefined();
        const parentFolderId = _.get(parentFolderResult, 'folder.id');
        expect(parentFolderId).toEqual(testFolderData.parentFolderId);

        const parentFolder2 = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.parentFolderId2 }
        );
        expect(parentFolder2).toBeDefined();
        const parentFolder2Id = _.get(parentFolder2, 'folder.id');
        expect(parentFolder2Id).toEqual(testFolderData.parentFolderId2);
      });

      it('FO8 - restricted user can not get current child folder', async () => {
        const childFolderResult = folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.childFolderId }
        );
        await expect(childFolderResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO9 - restricted user can not get current folder content', async () => {
        const folderContentResult = tdoHelper.helpGetTDO(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.tdoId }
        );
        await expect(folderContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO10 - Add parent folder content read permission for restricted user', async () => {
        const newAuthPermissionSet =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-read-permission-${uuid.v4()}`,
              description: 'citest TDO read permission',
              permissions: ['AIWARE_TDO_READ']
            }
          );
        const authPermissionSetData = _.get(
          newAuthPermissionSet,
          'authPermissionSetCreate'
        );
        expect(authPermissionSetData).toBeDefined();
        rbac.TDOPermissionSetId = _.get(authPermissionSetData, 'id');

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions2 },
          {
            resourceType: 'TDO',
            ids: [testFolderData.tdoId],
            entries: [
              {
                member: {
                  id: rbac.authGroupId,
                  memberType: 'Group'
                },
                permissionSetID: rbac.TDOPermissionSetId
              }
            ]
          }
        );

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;
      });

      it('FO11 - restricted user can get shared content', async () => {
        const folderContentResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.tdoId }
        );
        expect(folderContentResult).toBeDefined();
        const folderContentId = _.get(folderContentResult, 'id');
        expect(folderContentId).toEqual(testFolderData.tdoId);
      });

      it('FO12 - owner create another child folder and content', async () => {
        // create child folder and content
        const childFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(childFolder).toBeDefined();
        testFolderData.childFolderId2 = _.get(childFolder, 'id');

        const childTdoResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.childFolderId2
          }
        );
        expect(childTdoResult).toBeDefined();
        testFolderData.childTdoId2 = _.get(childTdoResult, 'id');
      });

      it('FO13 - cms user can access new child folder and child content', async () => {
        const childFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.childFolderId2 }
        );
        expect(childFolderResult).toBeDefined();
        const childFolderId = _.get(childFolderResult, 'folder.id');
        expect(childFolderId).toEqual(testFolderData.childFolderId2);

        const childTdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: regularOptions },
          { id: testFolderData.childTdoId2 }
        );
        expect(childTdoResult).toBeDefined();
        const childTdoId = _.get(childTdoResult, 'id');
        expect(childTdoId).toEqual(testFolderData.childTdoId2);
      });

      it('FO14 - restricted user can get new child folder', async () => {
        const childFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.childFolderId2 }
        );

        expect(childFolderResult).toBeDefined();
        const childFolderId = _.get(childFolderResult, 'folder.id');
        expect(childFolderId).toEqual(testFolderData.childFolderId2);
      });

      it('FO15 - restricted user can not get new child content', async () => {
        const childTdoResult = tdoHelper.helpGetTDO(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.childTdoId2 }
        );
        await expect(childTdoResult).rejects.toThrow(/No authorization access/);
      });
    });

    describe('OLP update folder and content permissions', () => {
      it('FO16 - owner can update, move folder', async () => {
        const result = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated`
          }
        );
        expect(_.get(result, 'id')).toEqual(testFolderData.parentFolderId);
        expect(_.get(result, 'name')).toContain(
          `${testFolderData.parentFolderId}-updated`
        );

        // move folder
        const moveResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.childFolderId2,
            toFolderId: testFolderData.rootFolderId,
            fromFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(_.get(moveResult, 'id')).toEqual(testFolderData.childFolderId2);
        expect(_.get(moveResult, 'parent.id')).toEqual(
          testFolderData.rootFolderId
        );
      });

      // VE-16402 merge will fix this test case
      it('FO17 - move folder to its own child should fail (loop folder)', async () => {
        // create new child folder under parentFolderId
        const newChildFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(newChildFolder).toBeDefined();
        const newChildFolderId = _.get(newChildFolder, 'id');

        // attempt to move parentFolderId to its own child folder
        const moveResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.parentFolderId,
            toFolderId: newChildFolderId,
            fromFolderId: testFolderData.rootFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveResult).rejects.toThrow(/resource_conflict/);
      });

      it('FO18 - admin can update, move folder', async () => {
        const result = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions2 },
          {
            id: testFolderData.childFolderId2,
            name: `${citestMarker}-${testFolderData.childFolderId2}-updated`
          }
        );
        expect(_.get(result, 'id')).toEqual(testFolderData.childFolderId2);
        expect(_.get(result, 'name')).toContain(
          `${testFolderData.childFolderId2}-updated`
        );

        // move folder
        const moveResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions2 },
          {
            folderId: testFolderData.childFolderId2,
            toFolderId: testFolderData.parentFolderId,
            fromFolderId: testFolderData.rootFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(_.get(moveResult, 'id')).toEqual(testFolderData.childFolderId2);
        expect(_.get(moveResult, 'parent.id')).toEqual(
          testFolderData.parentFolderId
        );
      });

      it('FO19.1 - cms viewer user can not update folder of others', async () => {
        const updateResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: regularOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated-1`
          }
        );

        await expect(updateResult).rejects.toThrow(/not_allowed/);
      });

      it('FO19.2 - cms viewer user can move folder', async () => {
        const moveResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: regularOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: testFolderData.childFolderId2,
            fromFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );

        expect(_.get(moveResult, 'id')).toEqual(
          testFolderData.grandChildFolderId
        );
        expect(_.get(moveResult, 'parent.id')).toEqual(
          testFolderData.childFolderId2
        );
      });

      // VE-16583 merge will fix this test case
      it('FO20 - restricted user update folder should fail', async () => {
        const updateResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: restrictedOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated-2`
          }
        );
        await expect(updateResult).rejects.toThrow(/not_allowed/);
      });

      // VE-16695 merge will fix this test case
      it('FO21 - restricted user move folder should fail', async () => {
        const moveResult = folderHelper.helpMoveFolder(
          { gqlClient, options: restrictedOptions },
          {
            folderId: testFolderData.childFolderId2,
            toFolderId: testFolderData.parentFolderId2,
            fromFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );

        await expect(moveResult).rejects.toThrow();
      });

      it('FO22 - Add folder update permission for restricted user', async () => {
        const newAuthPermissionSet = await rbacHelper.helpUpdatePermissionSet(
          { gqlClient, options: adminOptions },
          {
            id: rbac.authPermissionSetId,
            name: `${citestMarker}-folder-update-permission-${uuid.v4()}`,
            permissions: ['AIWARE_FOLDER_READ', 'AIWARE_FOLDER_UPDATE']
          }
        );
        expect(newAuthPermissionSet).toBeDefined();

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;
      });

      it('FO23 - restricted user update folder should succeed', async () => {
        const updateResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: restrictedOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated-3`
          }
        );
        expect(_.get(updateResult, 'id')).toEqual(
          testFolderData.parentFolderId
        );
        expect(_.get(updateResult, 'name')).toContain(
          `${citestMarker}-${testFolderData.parentFolderId}-updated-3`
        );
      });

      it('FO24 - restricted user update new child folder should succeed', async () => {
        const updateResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: restrictedOptions },
          {
            id: testFolderData.childFolderId2,
            name: `${citestMarker}-${testFolderData.childFolderId2}-updated-2`
          }
        );
        expect(_.get(updateResult, 'id')).toEqual(
          testFolderData.childFolderId2
        );
        expect(_.get(updateResult, 'name')).toContain(
          `${citestMarker}-${testFolderData.childFolderId2}-updated-2`
        );
      });

      it('FO25 - cms viewer user can not update folder content of others', async () => {
        const updateContentResult = tdoHelper.helpUpdateTDO(
          { gqlClient, options: regularOptions },
          {
            id: testFolderData.tdoId,
            name: `${citestMarker}-tdo-updated-${uuid.v4()}`
          }
        );
        await expect(updateContentResult).rejects.toThrow(/not_allowed/);
      });

      it('FO26 - restricted user update folder content should fail', async () => {
        const updateContentResult = tdoHelper.helpUpdateTDO(
          { gqlClient, options: restrictedOptions },
          {
            id: testFolderData.tdoId,
            name: `${citestMarker}-tdo-updated-${uuid.v4()}`
          }
        );
        await expect(updateContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO27 - cms user add content to folder TDO, watchlist, app succeed (file TDO, App, watch list)', async () => {
        const addContentResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );

        expect(addContentResult).toBeDefined();
        testFolderData.defaultUserTdoId = _.get(addContentResult, 'id');
      });

      it('FO28 - restricted user file content should fail', async () => {
        const addContentResult = tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );
        await expect(addContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO29 - restricted user unfile content of owner should fail', async () => {
        const removeContentResult = tdoHelper.helpDeleteTDO(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.tdoId }
        );
        await expect(removeContentResult).rejects.toThrow(
          /No authorization access/
        );
      });

      // VE-16848 merge will fix this test case
      xit('FO30 - cms user delete content of owner should fail', async () => {
        // create TDO
        const createContentResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-to-remove-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.childFolderId
          }
        );
        expect(createContentResult).toBeDefined();
        const childTdoId = _.get(createContentResult, 'id');

        // remove TDO
        const removeContentResult = tdoHelper.helpDeleteTDO(
          { gqlClient, options: regularOptions },
          { id: childTdoId }
        );

        await expect(removeContentResult).rejects.toThrow(/not_allowed/);
      });
    });

    describe('share folder to other organization', () => {
      beforeAll(async () => {
        createSecondOrgAndUserInput = getOrg2AndUserInput(version);
        if (version === 'v1') {
          createSecondOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
            'disabled';
        } else {
          createSecondOrgAndUserInput.orgInput.kvp.features.v2FoldersEnabled =
            'enabled';
        }

        testSetup2 = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createSecondOrgAndUserInput
        );

        testOrg2 = testSetup2.org;
        expect(testOrg2).toBeDefined();
        expect(testOrg2.name).toContain(`${citestMarker}-org`);
        expect(testOrg2.users).toBeDefined();

        adminOrg2 = _.find(testSetup2.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        adminOrg2Options = adminOrg2.requestOptions;

        regularUserOrg2 = _.find(testSetup2.listOptions, (user) => {
          return user.key === 'regularUser';
        });
        regularUserOrg2Options = regularUserOrg2.requestOptions;

        // Retry: org2's v2 schema may not be provisioned when setupTestOrgAndUser
        // returns (async, fire-and-forget). helpCreateRootFolder fails with
        // Schema not_found until provisioning completes. Mirrors FO35.1/FO47. T45.
        const maxAttempts = 5;
        let rootFolder;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            rootFolder = await folderHelper.helpCreateRootFolder(
              { gqlClient, options: adminOrg2Options },
              { rootFolderType: 'cms' }
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        expect(rootFolder).toBeDefined();
        expect(rootFolder.length).toBeGreaterThan(0);
        const orgRootFolder = rootFolder.find((folder) => !folder.ownerId);

        testFolderData.rootFolderIdOrg2 = _.get(orgRootFolder, 'id');
        testFolderData.treeObjectIdOrg2 = _.get(orgRootFolder, 'treeObjectId');

        // get parent folder treeObjectId
        const folderTreeObject = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId, treeObjectId: true }
        );
        expect(folderTreeObject).toBeDefined();
        expect(folderTreeObject.folder.treeObjectId).toBeDefined();
        testFolderData.treeObjectId = folderTreeObject.folder.treeObjectId;
      });

      // VE-16539 merge will fix this case
      xit('FO31 - restricted user share folder to other org should fail', async () => {
        const query = shareTreeObjectQuery(testFolderData.treeObjectId, [
          +testOrg2.id
        ]);
        const shareResult = gqlClient.query(query, {}, restrictedOptions);
        await expect(shareResult).rejects.toThrow(/not_allowed/);
      });

      it('FO32 - share folder to not existing org should fail', async () => {
        const query = shareTreeObjectQuery(testFolderData.treeObjectId, [
          99999
        ]);

        const result = gqlClient.query(query);
        await expect(result).rejects.toThrow(/invalid_input/);
      });

      // VE-16539 merge will fix this case
      xit('FO33.1 - cms user share folder to other org should fail', async () => {
        const query = shareTreeObjectQuery(testFolderData.treeObjectId, [
          +testOrg2.id
        ]);

        const result = gqlClient.query(query, {}, adminOptions);
        await expect(result).rejects.toThrow(/not_allowed/);
      });

      it('FO33.2 - super admin share folder to other org should success', async () => {
        const query = shareTreeObjectQuery(testFolderData.treeObjectId, [
          +testOrg2.id
        ]);

        const shareResult = await gqlClient.query(query);
        expect(shareResult).toBeDefined();
      });

      it('FO34 - owner can get sharing folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId }
        );

        expect(folderResult).toBeDefined();
        const folderId = _.get(folderResult, 'folder.id');
        expect(folderId).toEqual(testFolderData.parentFolderId);
      });

      it('FO35.1 - target org can get shared folder', async () => {
        // Retry: v2DalSwitch returns before the V2 share write commits when the
        // super admin org routes to V1 as primary (V2 is fire-and-forget).
        // The target org reads from V2, so shared_org_read may not be visible yet.
        const maxAttempts = 5;
        let parentFolderResult;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            parentFolderResult = await folderHelper.helpGetFolder(
              { gqlClient, options: adminOrg2Options },
              { id: testFolderData.parentFolderId }
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        expect(parentFolderResult).toBeDefined();
        const parentFolderId = _.get(parentFolderResult, 'folder.id');
        expect(parentFolderId).toEqual(testFolderData.parentFolderId);
      });

      // VE-16715 merge will fix this case
      xit('FO35.2 - target org can get child folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.childFolderId }
        );

        expect(folderResult).toBeDefined();
        const folderId = _.get(folderResult, 'folder.id');
        expect(folderId).toEqual(testFolderData.childFolderId);
      });

      // VE-16738 merge will fix this case
      xit('FO36 - target org can get folder content', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.tdoId }
        );

        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.tdoId);
      });

      it('FO37 - cms user can get folder content', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: regularOptions },
          { id: testFolderData.tdoId }
        );
        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.tdoId);
      });

      // VE-16715 merge will fix this case
      xit('FO38 - target org can get new created folder', async () => {
        const newFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(newFolderResult).toBeDefined();
        const newFolderId = _.get(newFolderResult, 'id');

        // shared org get new created folder
        const getNewFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: newFolderId }
        );
        expect(getNewFolderResult).toBeDefined();
        const getNewFolderId = _.get(getNewFolderResult, 'folder.id');
        expect(getNewFolderId).toEqual(newFolderId);
      });

      // VE-16738 merge will fix this case
      xit('FO39 - target org can get new created content', async () => {
        const newTdoResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );
        expect(newTdoResult).toBeDefined();
        const newTdoId = _.get(newTdoResult, 'id');

        // shared org get new created tdo
        const getNewTdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOrg2Options },
          { id: newTdoId }
        );
        expect(getNewTdoResult).toBeDefined();
        const getNewTdoId = _.get(getNewTdoResult, 'id');
        expect(getNewTdoId).toEqual(newTdoId);
      });

      // VE-16540 merge will fix this case
      xit('FO40 - target org create folder content should fail (read permission)', async () => {
        const createTdoResult = tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOrg2Options },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );
        await expect(createTdoResult).rejects.toThrow(/not_allowed/);
      });

      it('FO42 - target org cannot update folder (read permission)', async () => {
        const updateResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated-by-shared-org`
          }
        );
        await expect(updateResult).rejects.toThrow(/not_found/);
      });

      // VE-16403 merge will fix this case
      xit('FO43 - target org can not delete shared folder', async () => {
        // create new Folder
        const newFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-to-delete-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(newFolderResult).toBeDefined();
        const newFolderId = _.get(newFolderResult, 'id');
        testFolderData.newFolderId = newFolderId;

        // get folder ObjectId
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.newFolderId, treeObjectId: true }
        );
        expect(folderResult).toBeDefined();
        const folderIndex = _.get(folderResult, 'folder.orderIndex');
        const folderTreeObjectId = _.get(folderResult, 'folder.treeObjectId');
        expect(folderTreeObjectId).toBeDefined();

        // share the new folder to org2
        const shareQuery = shareTreeObjectQuery(folderTreeObjectId, [
          +testOrg2.id
        ]);
        const shareResult = await gqlClient.query(shareQuery);
        expect(shareResult).toBeDefined();

        // target org attempt to delete the shared folder
        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOrg2Options },
          { folderId: testFolderData.newFolderId, orderIndex: folderIndex }
        );
        await expect(deleteFolderResult).rejects.toThrow();
      });

      it('FO44 - superAdmin user share write permission', async () => {
        const query = shareTreeObjectQuery(
          testFolderData.treeObjectId,
          [+testOrg2.id],
          [+testOrg2.id]
        );

        const shareResult = await gqlClient.query(query);
        expect(shareResult).toBeDefined();
      });

      // VE-16718 merge will fix this case
      xit('FO45 - target org can update folder', async () => {
        const updateResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-${testFolderData.parentFolderId}-updated-by-shared-org-2`
          }
        );
        expect(_.get(updateResult, 'id')).toEqual(
          testFolderData.parentFolderId
        );
        expect(_.get(updateResult, 'name')).toContain(
          `${citestMarker}-${testFolderData.parentFolderId}-updated-by-shared-org-2`
        );
      });

      // VE-16541 merge will fix this case
      xit('FO46 - target org can add new child folder', async () => {
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(createFolderResult).toBeDefined();
        const folderId = _.get(createFolderResult, 'id');
        expect(folderId).toBeDefined();
      });

      it('FO47 - target org can add content to folder', async () => {
        // Retry: v2DalSwitch returns before the V2 write-share commits when the
        // super admin org routes to V1 as primary (V2 is fire-and-forget).
        // fileFolderItem._validateFolderId queries v2_folder; shared_org_write
        // may not be visible yet for the target org.
        const maxAttempts = 5;
        let createTdoResult;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            createTdoResult = await tdoHelper.helpCreateTDOWithAsset(
              { gqlClient, options: adminOrg2Options },
              {
                name: `${citestMarker}-tdo-${uuid.v4()}`,
                ...tdoAssetInput,
                parentFolderId: testFolderData.parentFolderId
              }
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }
        expect(createTdoResult).toBeDefined();
        testFolderData.sharedOrgTdoId = _.get(createTdoResult, 'id');
      });

      it('FO48 - target org can access their added content', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.sharedOrgTdoId }
        );
        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.sharedOrgTdoId);
      });

      it('FO49 - admin can not access content added by shared org', async () => {
        const tdoResult = tdoHelper.helpGetTDO(
          { gqlClient, options: adminOptions },
          { id: testFolderData.sharedOrgTdoId }
        );
        await expect(tdoResult).rejects.toThrow(/not_found/);
      });

      it('FO50 - cms user can not access content added by shared org', async () => {
        const tdoResult = tdoHelper.helpGetTDO(
          { gqlClient, options: regularOptions },
          { id: testFolderData.sharedOrgTdoId }
        );
        await expect(tdoResult).rejects.toThrow(/not_found/);
      });

      it('FO51 - restricted user can not access content added by shared org', async () => {
        const tdoResult = tdoHelper.helpGetTDO(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.sharedOrgTdoId }
        );
        await expect(tdoResult).rejects.toThrow(/No authorization access/);
      });
    });

    describe('OLP file folder', () => {
      xit('FO52 - cms user unfile and file admin content should succeed', async () => {
        // admin create TDO to be filed/unfiled
        const createTdoResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-to-file-unfile-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );
        expect(createTdoResult).toBeDefined();
        const tdoId = _.get(createTdoResult, 'id');

        const unfileTdoResult = await tdoHelper.helpUnFileTDO(
          { gqlClient, options: regularOptions },
          { tdoId: tdoId, folderId: testFolderData.parentFolderId }
        );
        expect(unfileTdoResult).toBeDefined();
        expect(_.get(unfileTdoResult, 'id')).toEqual(tdoId);

        const fileTdoResult = await tdoHelper.helpFileTDO(
          { gqlClient, options: regularOptions },
          { tdoId: tdoId, folderId: testFolderData.parentFolderId }
        );
        expect(fileTdoResult).toBeDefined();
        expect(_.get(fileTdoResult, 'id')).toEqual(tdoId);
      });

      it('FO53 - restricted user file new content to folder should fail', async () => {
        // create TDO create permission set
        const TDOPermissionSetResult =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-tdo-create-permission-${uuid.v4()}`,
              description: 'citest TDO create permission',
              permissions: [
                'AIWARE_TDO_CREATE',
                'AIWARE_TDO_DELETE',
                'AIWARE_TDO_READ',
                'AIWARE_TDO_SEARCH',
                'AIWARE_TDO_UPDATE'
              ]
            }
          );
        const authPermissionSetData = _.get(
          TDOPermissionSetResult,
          'authPermissionSetCreate'
        );
        expect(authPermissionSetData).toBeDefined();
        rbac.TDOCreatePermissionSetId = _.get(authPermissionSetData, 'id');

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Organization',
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: restrictedUser.userId,
                  memberType: 'User'
                },
                permissionSetID: rbac.TDOCreatePermissionSetId
              }
            ]
          }
        );

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;

        const addContentResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );

        expect(addContentResult).toBeDefined();
        testFolderData.restrictedUserFiledTdoId = _.get(addContentResult, 'id');

        const fileTdoToFolder = tdoHelper.helpFileTDO(
          { gqlClient, options: restrictedOptions },
          {
            tdoId: testFolderData.restrictedUserFiledTdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        await expect(fileTdoToFolder).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO54 - Add file permission for cms user', async () => {
        // create TDO create permission set
        const TDOPermissionSetResult =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-tdo-file-permission-${uuid.v4()}`,
              description: 'citest TDO file permission',
              permissions: [
                'AIWARE_TDO_READ',
                'AIWARE_TDO_CREATE',
                'AIWARE_TDO_DELETE',
                'AIWARE_TDO_SEARCH',
                'AIWARE_TDO_UPDATE'
              ]
            }
          );

        expect(TDOPermissionSetResult).toBeDefined();
        const authPermissionSetData = _.get(
          TDOPermissionSetResult,
          'authPermissionSetCreate'
        );
        expect(authPermissionSetData).toBeDefined();
        rbac.TDOFilePermissionSetId = _.get(authPermissionSetData, 'id');

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Organization',
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: regularUser.userId,
                  memberType: 'User'
                },
                permissionSetID: rbac.TDOFilePermissionSetId
              }
            ]
          }
        );

        // relogin cms user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: regularUser.userId, organizationGuid: testOrg.guid }
        );
        regularOptions = impersonated.requestOptions;
      });

      it('FO55 - cms user file content to folder should succeed', async () => {
        const newTdo = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );

        expect(newTdo).toBeDefined();
        testFolderData.defaultUserFiledTdoId = _.get(newTdo, 'id');

        const fileTdoToFolder = await tdoHelper.helpFileTDO(
          { gqlClient, options: regularOptions },
          {
            tdoId: testFolderData.defaultUserFiledTdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(fileTdoToFolder).toBeDefined();
        expect(_.get(fileTdoToFolder, 'id')).toEqual(
          testFolderData.defaultUserFiledTdoId
        );
      });

      it('FO56 - cms user unfile his owned content should succeed', async () => {
        const removeContentResult = await tdoHelper.helpUnFileTDO(
          { gqlClient, options: regularOptions },
          {
            tdoId: testFolderData.defaultUserFiledTdoId,
            folderId: testFolderData.parentFolderId
          }
        );

        expect(removeContentResult).toBeDefined();
        expect(_.get(removeContentResult, 'id')).toEqual(
          testFolderData.defaultUserFiledTdoId
        );
      });

      it('FO57 - cms user unfile admin content success (unfile TDO, App, watch list)', async () => {
        const removeContentResult = await tdoHelper.helpUnFileTDO(
          { gqlClient, options: regularOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );

        expect(removeContentResult).toBeDefined();
        expect(_.get(removeContentResult, 'id')).toEqual(testFolderData.tdoId);
      });

      it('FO58 - admin can access unfiled content of cms user', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOptions },
          { id: testFolderData.defaultUserFiledTdoId }
        );

        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.defaultUserFiledTdoId);
      });

      it('FO59 - admin can access his unfiled content', async () => {
        const tdoResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOptions },
          { id: testFolderData.tdoId }
        );

        expect(tdoResult).toBeDefined();
        const tdoId = _.get(tdoResult, 'id');
        expect(tdoId).toEqual(testFolderData.tdoId);
      });

      xit('FO60 - cms user search TDO, App, watch list', async () => {});
    });

    describe('OLP create folder', () => {
      it('FO61 - cms user create folder should succeed', async () => {
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(createFolderResult).toBeDefined();
        testFolderData.defaultUserCreatedFolderId = _.get(
          createFolderResult,
          'id'
        );
      });

      it('FO62 - restricted user create folder should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /No authorization access/
        );
      });

      it('FO63 - Add folder create permission for restricted user', async () => {
        // share folder to restricted user
        const newAuthPermissionSet =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-create-permission-${uuid.v4()}`,
              description: 'citest folder create permission',
              permissions: [
                'AIWARE_FOLDER_UPDATE',
                'AIWARE_FOLDER_READ',
                'AIWARE_FOLDER_CREATE',
                'AIWARE_FOLDER_FILE'
              ]
            }
          );
        const authPermissionSetData = _.get(
          newAuthPermissionSet,
          'authPermissionSetCreate'
        );
        expect(authPermissionSetData).toBeDefined();
        rbac.folderCreatePermissionSetId = _.get(authPermissionSetData, 'id');

        const addACEsToResourcesResult =
          await rbacHelper.helpAddACEsToResources(
            { gqlClient, options: adminOptions },
            {
              resourceType: 'Folder',
              ids: [testFolderData.parentFolderId],
              entries: [
                {
                  member: {
                    id: restrictedUser.userId,
                    memberType: 'User'
                  },
                  permissionSetID: rbac.folderCreatePermissionSetId
                }
              ]
            }
          );
        expect(addACEsToResourcesResult).toBeDefined();

        // add create permission
        const createPermissionSet =
          await rbacHelper.helpCreateAuthPermissionSet(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-auth-permission-set-${uuid.v4()}`,
              description: `${citestMarker}-auth-permission-set`,
              permissions: ['AIWARE_FOLDER_CREATE']
            }
          );
        expect(createPermissionSet).toBeDefined();
        const createPermissionSetData = _.get(
          createPermissionSet,
          'authPermissionSetCreate'
        );
        expect(createPermissionSetData).toBeDefined();
        rbac.createPermissionSetId = _.get(createPermissionSetData, 'id');

        await rbacHelper.helpAddACEsToResources(
          { gqlClient, options: adminOptions },
          {
            resourceType: 'Organization',
            ids: [testOrg.id],
            entries: [
              {
                member: {
                  id: restrictedUser.userId,
                  memberType: 'User'
                },
                permissionSetID: rbac.createPermissionSetId
              }
            ]
          }
        );

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;
      });

      it('FO64 - restricted user create folder and child folder should succeed', async () => {
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(createFolderResult).toBeDefined();
        testFolderData.restrictedUserCreatedFolderId = _.get(
          createFolderResult,
          'id'
        );

        const createChildFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.restrictedUserCreatedFolderId
          }
        );
        expect(createChildFolderResult).toBeDefined();
        testFolderData.restrictedUserCreatedChildFolderId = _.get(
          createChildFolderResult,
          'id'
        );
      });

      // VE-16715 merge will fix this case
      xit('FO65 - shared org can access new folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.restrictedUserCreatedFolderId }
        );

        expect(folderResult).toBeDefined();
        const folderId = _.get(folderResult, 'folder.id');
        expect(folderId).toEqual(testFolderData.restrictedUserCreatedFolderId);
      });

      it('FO66 - cms user can access new added folder', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.restrictedUserCreatedChildFolderId }
        );

        expect(folderResult).toBeDefined();
        const folderId = _.get(folderResult, 'folder.id');
        expect(folderId).toEqual(
          testFolderData.restrictedUserCreatedChildFolderId
        );
      });

      it('FO67 - cms user delete restricted user folder should fail', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.restrictedUserCreatedChildFolderId }
        );
        expect(folderData).toBeDefined();
        const orderIndex = _.get(folderData, 'folder.orderIndex');

        const deleteChildFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: regularOptions },
          {
            id: testFolderData.restrictedUserCreatedChildFolderId,
            orderIndex
          }
        );
        await expect(deleteChildFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO68 - restricted user delete his folder should succeed', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.restrictedUserCreatedChildFolderId }
        );
        expect(folderData).toBeDefined();
        const orderIndex = _.get(folderData, 'folder.orderIndex');

        const deleteFolderResult = await folderHelper.helpDeleteFolder(
          { gqlClient, options: restrictedOptions },
          {
            folderId: testFolderData.restrictedUserCreatedChildFolderId,
            orderIndex
          }
        );
        expect(deleteFolderResult).toBeDefined();
        expect(_.get(deleteFolderResult, 'id')).toEqual(
          testFolderData.restrictedUserCreatedChildFolderId
        );
      });
    });

    describe('OLP delete folder', () => {
      it('FO69 - restrict user delete folder should fail', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.parentFolderId }
        );
        expect(folderData).toBeDefined();
        const orderIndex = _.get(folderData, 'folder.orderIndex');

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: restrictedOptions },
          { folderId: testFolderData.parentFolderId, orderIndex }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);

        const folderDataAfterDelete = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId }
        );
        expect(folderDataAfterDelete).toBeDefined();
      });

      // VE-16854 merge will fix this case
      it('FO70 - cms user can not delete admin created folder', async () => {
        const folderData = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-to-delete-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        );
        expect(folderData).toBeDefined();
        const folderIdToDelete = _.get(folderData, 'id');
        const orderIndex = _.get(folderData, 'orderIndex');

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: regularOptions },
          { folderId: folderIdToDelete, orderIndex }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO71 - Add delete permission for restricted user', async () => {
        const newAuthPermissionSet = await rbacHelper.helpUpdatePermissionSet(
          { gqlClient, options: adminOptions },
          {
            id: rbac.authPermissionSetId,
            name: `${citestMarker}-folder-delete-permission-${uuid.v4()}`,
            permissions: [
              'AIWARE_FOLDER_CREATE',
              'AIWARE_FOLDER_DELETE',
              'AIWARE_FOLDER_FILE',
              'AIWARE_FOLDER_READ',
              'AIWARE_FOLDER_UPDATE'
            ]
          }
        );
        expect(newAuthPermissionSet).toBeDefined();

        // relogin restricted user
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: restrictedUser.userId, organizationGuid: testOrg.guid }
        );
        restrictedOptions = impersonated.requestOptions;

        // Wait for the authz cache to reflect the new permission set before returning.
        // FO72 asserts AIWARE_FOLDER_DELETE (via deleteFolder's `input.id` RBAC directive)
        // on a freshly-created *child* folder. The RBAC directive cache is keyed by the
        // full (resourceType, ids, permissions, authGroups, orgId) tuple, so different
        // permissions/resources are entirely independent cache entries — probing with
        // createFolder only warms AIWARE_FOLDER_FILE on the *parent* folder (parentId's
        // directive) and proves nothing about AIWARE_FOLDER_DELETE on a child folder.
        // Probe with the exact permission + resource shape FO72 will exercise: create a
        // disposable child folder as admin, then have the restricted user delete it.
        const probeMaxAttempts = 15;
        for (let attempt = 1; attempt <= probeMaxAttempts; attempt++) {
          const probeFolder = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-fo71-probe-${uuid.v4()}`,
              description: 'citest authz probe — deleted immediately',
              parentId: testFolderData.parentFolderId
            }
          );
          const probeFolderId = _.get(probeFolder, 'id');
          const probeOrderIndex = _.get(probeFolder, 'orderIndex');

          try {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: restrictedOptions },
              { folderId: probeFolderId, orderIndex: probeOrderIndex }
            );
            // Cache is warm for AIWARE_FOLDER_DELETE on a child folder — proceed.
            break;
          } catch (err) {
            // Not warm yet — the probe folder is still there, clean it up as admin so it
            // doesn't leak, then retry with a fresh one.
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              { folderId: probeFolderId, orderIndex: probeOrderIndex }
            );
            if (attempt === probeMaxAttempts) throw err;
            await helpers.sleep(2000);
          }
        }
      });

      it('FO72 - restrict user delete folder success', async () => {
        // Safety-net retry in case the authz cache warmed between FO71's probe success
        // and this delete (e.g. a second invalidation cycle). Wider window than before:
        // 10 attempts × 2s = up to 18s. FO71's probe should make this a no-op on most runs.
        //
        // Per T28 (state/automations/eng/aiware-core-citest-triage/T28.md in vpe-specs), a
        // denied hasPermissionsWithCache result is memoized (server-side TTL, now shortened
        // but still non-zero), so retrying the delete against the SAME folder/cache key just
        // replays the cached "no". Mirror FO71's fix: create a brand-new disposable folder
        // each attempt so every retry is a genuinely fresh cache key and therefore a real
        // authz check, not a replay.
        const maxAttempts = 10;
        let deleteFolderResult;
        let testFolderId;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const newFolder = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-to-delete-${uuid.v4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          );
          expect(newFolder).toBeDefined();
          testFolderId = _.get(newFolder, 'id');
          const orderIndex = _.get(newFolder, 'orderIndex');

          try {
            deleteFolderResult = await folderHelper.helpDeleteFolder(
              { gqlClient, options: restrictedOptions },
              { folderId: testFolderId, orderIndex }
            );
            break;
          } catch (err) {
            // Not authorized yet — clean up as admin (this folder is now poisoned by a
            // cached denial, per T28) and retry against a fresh resource/cache key.
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              { folderId: testFolderId, orderIndex }
            );
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(2000);
          }
        }
        expect(deleteFolderResult).toBeDefined();
        expect(_.get(deleteFolderResult, 'id')).toEqual(testFolderId);
      });

      it('FO73 - restrict user cannot access root folder', async () => {
        const folderData = folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.rootFolderId }
        );
        await expect(folderData).rejects.toThrow(/not_allowed/);
      });

      it('FO74 - restrict user cannot access root folder of admin', async () => {
        const folderData = folderHelper.helpGetFolder(
          { gqlClient, options: restrictedOptions },
          { id: testFolderData.rootFolderId2 }
        );
        await expect(folderData).rejects.toThrow(/not_allowed/);
      });

      it('FO75 - cms user can access root folder of organization', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.rootFolderId }
        );
        expect(folderData).toBeDefined();
        const folderId = _.get(folderData, 'folder.id');
        expect(folderId).toEqual(testFolderData.rootFolderId);
      });

      // VE-16855 merge will fix this case
      it('FO76.1 - cms user can not delete non empty root folder of organization', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOptions },
          { id: testFolderData.rootFolderId }
        );
        expect(folderData).toBeDefined();
        const orderIndex = _.get(folderData, 'folder.orderIndex');

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: regularOptions },
          { folderId: testFolderData.rootFolderId, orderIndex }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO76.2 - cms user can not delete empty root folder of organization', async () => {
        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: regularUserOrg2Options },
          { id: testFolderData.rootFolderIdOrg2, isShowChild: true }
        );
        expect(folderData).toBeDefined();
        const orderIndex = _.get(folderData, 'folder.orderIndex');

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: regularUserOrg2Options },
          { folderId: testFolderData.rootFolderIdOrg2, orderIndex }
        );

        expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('FO77 - child folder auto deleted with parent folder', async () => {
        // Folder V2 can only delete empty folder
        if (version === 'v2') return;

        // create child and parent folder
        const newParentFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-parent-folder-to-delete-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        );
        expect(newParentFolder).toBeDefined();
        const parentFolderId = _.get(newParentFolder, 'id');
        const parentOrderIndex = _.get(newParentFolder, 'orderIndex');

        const newChildFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-child-folder-to-delete-${uuid.v4()}`,
            description: 'citest',
            parentId: parentFolderId
          }
        );
        expect(newChildFolder).toBeDefined();
        const childFolderId = _.get(newChildFolder, 'id');

        // delete parent folder
        const deleteFolderResult = await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          { folderId: parentFolderId, orderIndex: parentOrderIndex }
        );
        expect(deleteFolderResult).toBeDefined();
        expect(_.get(deleteFolderResult, 'id')).toEqual(parentFolderId);

        // check child folder deleted
        const childFolderResult = folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: childFolderId }
        );
        await expect(childFolderResult).rejects.toThrow(/not_found/);
      });
    });
  });
}

function shareTreeObjectQuery(
  treeObjectId,
  readOrganizationIds,
  writeOrganizationIds
) {
  return `mutation {
      shareFolder (input: {
        treeObjectId: "${treeObjectId}",
        ${_.isEmpty(readOrganizationIds) ? '' : `readOrganizationIds: [${readOrganizationIds.join(',')}],`}
        ${_.isEmpty(writeOrganizationIds) ? '' : `writeOrganizationIds: [${writeOrganizationIds.join(',')}],`}
      }) {
        id
        name
        orderIndex
        description
        status
      }
    }`;
}
