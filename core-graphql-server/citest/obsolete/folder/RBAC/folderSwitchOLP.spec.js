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

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
let gqlClient;
let testSetup, testSetup2;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superOrgGuid, superOrgId, superUserId;
let testUsers;
let superToken, superOptions;
let testOrg, adminUser, adminUser2, regularUser, restrictedUser;
let adminOptions, adminOptions2, regularOptions, restrictedOptions;
let testOrg2, adminOrg2, adminOrg2Options;
let regularOrg2, regularOrg2Options;
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

describe('citest_folder: folder test switch OLP config', () => {
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

  describe.each(['v1', 'v2'])('folder version: %s', (folderVersion) => {
    let createOrgAndUserInput, createSecondOrgAndUserInput;
    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput(folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(folderVersion);

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
      testFolderData.rootFolderId2 = _.get(adminRootFolder, 'id');

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

      // get parent folder treeObjectId
      const folderTreeObject = await folderHelper.helpGetFolder(
        { gqlClient, options: adminOptions },
        { id: testFolderData.parentFolderId, treeObjectId: true }
      );
      expect(folderTreeObject).toBeDefined();
      expect(folderTreeObject.folder.treeObjectId).toBeDefined();
      testFolderData.treeObjectId = folderTreeObject.folder.treeObjectId;

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

      // set up org 2
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

      regularOrg2 = _.find(testSetup2.listOptions, (user) => {
        return user.key === 'regularUser';
      });
      regularOrg2Options = regularOrg2.requestOptions;

      // create root folder for org2
      const rootFolder2 = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: adminOrg2Options },
        { rootFolderType: 'cms' }
      );

      expect(rootFolder2).toBeDefined();
      expect(rootFolder2.length).toBeGreaterThan(0);
      const org2RootFolder = rootFolder2.find((folder) => !folder.ownerId);
      const admin2RootFolder = rootFolder2.find(
        (folder) => folder.ownerId === adminOrg2.userId
      );
      testFolderData.orgRootFolderIdOrg2 = _.get(org2RootFolder, 'id');
      testFolderData.orgTreeObjectIdOrg2 = _.get(
        org2RootFolder,
        'treeObjectId'
      );
      testFolderData.adminRootFolderId2Org2 = _.get(admin2RootFolder, 'id');
      testFolderData.adminTreeObjectId2Org2 = _.get(
        admin2RootFolder,
        'treeObjectId'
      );

      // create folder for org2
      const folderOrg2 = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOrg2Options },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.orgRootFolderIdOrg2
        }
      );
      expect(folderOrg2).toBeDefined();
      testFolderData.parentFolderIdOrg2 = _.get(folderOrg2, 'id');
    });

    updateOrgOLPOption('enabled');
    runTestFolderOLP(folderVersion);

    afterAll(async () => {
      // delete tdo

      // delete folder

      if (!_.isEmpty([...testSetup.listOptions, ...testSetup2.listOptions])) {
        const listUserIds = [
          ...testSetup.listOptions,
          ...testSetup2.listOptions
        ].map((user) => user.userId);
        await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
      }

      if (testOrg.id) {
        await orgHelper.deleteOrganization(
          { gqlClient, options: superOptions },
          testOrg.id
        );
      }

      if (testOrg2.id) {
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
          enableRBACFeature: 'disabled',
          v2FoldersEnabled: version === 'v1' ? 'disabled' : 'enabled'
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
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'adminUser2',
        name: `${citestMarker}-admin-user-${version}-${uuid.v4()}@localhost`,
        roleIds: [
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${version}-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      },
      {
        key: 'restrictUser',
        name: `${citestMarker}-restrict-user-${version}-${uuid.v4()}@localhost`,
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
          enableRBACFeature: 'disabled',
          v2FoldersEnabled: version === 'v1' ? 'disabled' : 'enabled'
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
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'regularUser',
        name: `${citestMarker}-regular-user-${version}-${uuid.v4()}@localhost`,
        roleIds: ['555033d1-508c-49c0-8127-66c2dc129828'] // CMS Viewer
      }
    ]
  };
  return createSecondOrgAndUserInput;
}

function shareFolderQuery(folderId, readOrganizationIds, writeOrganizationIds) {
  return `mutation {
      shareFolder (input: {
        folderId: "${folderId}",
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
function runTestFolderOLP(version = 'v1') {
  describe(`Folder ${version} OLP Tests`, () => {
    let restrictUserCreatedFolderId;
    beforeAll(async () => {
      // relogin admin, regular, restrict user to get new token with OLP enabled

      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonated.requestOptions;

      const impersonatedRegular = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: regularUser.userId, organizationGuid: testOrg.guid }
      );
      regularOptions = impersonatedRegular.requestOptions;

      const impersonatedAdmin = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: adminUser.userId, organizationGuid: testOrg.guid }
      );
      adminOptions = impersonatedAdmin.requestOptions;

      // new admin
      const password = 'testPassword';

      const newUser = await userHelper.createUser(
        { gqlClient },
        {
          name: citestMarker + '-admin-user-' + uuid.v4(),
          password: password,
          orgId: testOrg.id,
          rolesIds: ['032218c3-d47e-4287-9d16-7bb867c01266']
        }
      );
      expect(newUser).toBeDefined();

      const impersonatedNewAdmin = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: newUser.id, organizationGuid: testOrg.guid }
      );
      const newAdminOptions = impersonatedNewAdmin.requestOptions;
      testFolderData.newAdminUserOptions = newAdminOptions;
      testFolderData.newAdminUserId = newUser.id;
    });

    it('should removes restricted users from default AGs', async () => {
      // remove restricted users from default auth groups
      restrictedOptions = await removeRestrictUserAuth({
        gqlClient,
        restrictedOptions,
        restrictedUserId: restrictedUser.userId,
        testOrg,
        superToken,
        testFolderData
      });

      // Refresh all tokens after auth group changes
      await refreshAllUserTokens();
    });

    xit('cms user get folder success', async () => {
      const getFolderResult = await folderHelper.helpGetFolder(
        { gqlClient, options: regularOptions },
        {
          id: testFolderData.parentFolderId
        }
      );
      expect(getFolderResult).toBeDefined();
      expect(getFolderResult.id).toEqual(testFolderData.parentFolderId);
    });

    it('restrict user get folder should fail', async () => {
      // Refresh token to ensure it reflects current permissions
      const impersonatedRestricted = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonatedRestricted.requestOptions;

      const getFolderResult = folderHelper.helpGetFolder(
        { gqlClient, options: restrictedOptions },
        {
          id: testFolderData.parentFolderId
        }
      );
      await expect(getFolderResult).rejects.toThrow(
        /(No authorization|authentication_error)/
      );
    });

    it('cms, restrict user update folder should fail', async () => {
      // Refresh tokens to ensure they're valid after permission changes
      const impersonatedRegular = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: regularUser.userId, organizationGuid: testOrg.guid }
      );
      regularOptions = impersonatedRegular.requestOptions;

      const impersonatedRestricted = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonatedRestricted.requestOptions;

      // cms user
      const updateFolderResult = folderHelper.helpUpdateFolder(
        { gqlClient, options: regularOptions },
        {
          id: testFolderData.parentFolderId,
          name: citestMarker + '-Updated'
        }
      );
      await expect(updateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );

      // restrict user
      const restrictUpdateFolderResult = folderHelper.helpUpdateFolder(
        { gqlClient, options: restrictedOptions },
        {
          id: testFolderData.parentFolderId,
          name: citestMarker + '-Updated'
        }
      );
      await expect(restrictUpdateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('OLP cms user can create folder', async () => {
      const createFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: regularOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.parentFolderId
        }
      );

      expect(createFolder).toBeDefined();
      testFolderData.defaultUserCreatedFolderId = createFolder.id;
    });

    it('restrict user create folder should fail', async () => {
      // Refresh token before testing
      const impersonatedRestricted = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonatedRestricted.requestOptions;

      // restrict user
      const restrictCreateFolderResult = folderHelper.helpCreateFolder(
        { gqlClient, options: restrictedOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.parentFolderId
        }
      );
      await expect(restrictCreateFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('cms, restrict user file folder should fail', async () => {
      // Refresh tokens before testing
      const impersonatedRegular = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: regularUser.userId, organizationGuid: testOrg.guid }
      );
      regularOptions = impersonatedRegular.requestOptions;

      const impersonatedRestricted = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonatedRestricted.requestOptions;

      // cms user
      const fileTDOResult = tdoHelper.helpFileTDO(
        { gqlClient, options: regularOptions },
        {
          tdoId: testFolderData.tdoId,
          folderId: testFolderData.parentFolderId
        }
      );
      await expect(fileTDOResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error|not_allowed)/
      );

      // restrict user
      const restrictFileTDOResult = tdoHelper.helpFileTDO(
        { gqlClient, options: restrictedOptions },
        {
          tdoId: testFolderData.tdoId,
          folderId: testFolderData.parentFolderId
        }
      );
      await expect(restrictFileTDOResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('cms, restrict user delete folder should fail', async () => {
      // Refresh tokens before testing
      const impersonatedRegular = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: regularUser.userId, organizationGuid: testOrg.guid }
      );
      regularOptions = impersonatedRegular.requestOptions;

      const impersonatedRestricted = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: restrictedUser.userId, organizationGuid: testOrg.guid }
      );
      restrictedOptions = impersonatedRestricted.requestOptions;

      // new folder to be deleted
      const newFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          name: citestMarker + '-Folder to be deleted',
          description: 'Folder Description',
          parentId: testFolderData.parentFolderId
        }
      );
      expect(newFolder).toBeDefined();
      expect(newFolder.id).toBeDefined();
      testFolderData.folderId = newFolder.id;

      // restrict user
      const restrictDeleteFolderResult = folderHelper.helpDeleteFolder(
        { gqlClient, options: restrictedOptions },
        {
          folderId: testFolderData.folderId,
          orderIndex: 0
        }
      );
      await expect(restrictDeleteFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );

      // cms user
      const deleteFolderResult = folderHelper.helpDeleteFolder(
        { gqlClient, options: regularOptions },
        {
          folderId: testFolderData.folderId,
          orderIndex: 0
        }
      );
      await expect(deleteFolderResult).rejects.toThrow(
        /(not authorized|No authorization|authentication_error)/
      );
    });

    it('new desktop admin Grant FOLDER_READ to new restrict user should success', async () => {
      const updateRole = await addFolderReadPermissionToUser({
        gqlClient,
        adminOptions: testFolderData.newAdminUserOptions,
        restrictedUserId: restrictedUser.userId,
        testOrg,
        superToken,
        testFolderData
      });

      restrictedOptions = updateRole.restrictedOptions;
      rbac.authPermissionSetId = updateRole.newAuthPermissionSetId;
      rbac.authGroupId = updateRole.newAuthGroupId;

      // Refresh all tokens after permission changes
      await refreshAllUserTokens();
    });

    it('restrict user get folder should success', async () => {
      const getFolderResult = await folderHelper.helpGetFolder(
        { gqlClient, options: restrictedOptions },
        {
          id: testFolderData.parentFolderId
        }
      );
      expect(getFolderResult).toBeDefined();
      expect(getFolderResult.folder.id).toEqual(testFolderData.parentFolderId);
    });

    // it('new restrict user get folder should success', async () => {
    //   const getFolderResult = await folderHelper.helpGetFolder(
    //     { gqlClient, options: testFolderData.newRestrictUserOptions },
    //     {
    //       id: testFolderData.parentFolderId
    //     }
    //   );
    //   expect(getFolderResult).toBeDefined();
    //   expect(getFolderResult.folder.id).toEqual(testFolderData.parentFolderId);
    // });

    it('new desktop admin Grant FOLDER_UPDATE to new restrict user', async () => {
      const newAuthPermissionSet = await rbacHelper.helpUpdatePermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
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

      // Refresh all tokens after permission update
      await refreshAllUserTokens();
    });

    it('restrict user update folder should success', async () => {
      const updatedFolder = await folderHelper.helpUpdateFolder(
        { gqlClient, options: restrictedOptions },
        {
          id: testFolderData.parentFolderId,
          name: citestMarker + '-Restricted Updated'
        }
      );
      expect(updatedFolder).toBeDefined();
      expect(updatedFolder.id).toEqual(testFolderData.parentFolderId);
    });

    it('new admin Grant FOLDER_CREATE to new restrict user', async () => {
      // share folder to restricted user
      const newAuthPermissionSet = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
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
      rbac.newFolderCreatePermissionSetId = _.get(authPermissionSetData, 'id');

      const addACEsToResourcesResult = await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          resourceType: 'Folder',
          ids: [testFolderData.parentFolderId],
          entries: [
            {
              member: {
                id: restrictedUser.userId,
                memberType: 'User'
              },
              permissionSetID: rbac.newFolderCreatePermissionSetId
            },
            {
              member: {
                id: regularUser.userId,
                memberType: 'User'
              },
              permissionSetID: rbac.newFolderCreatePermissionSetId
            }
          ]
        }
      );
      expect(addACEsToResourcesResult).toBeDefined();

      // add create permission
      const createPermissionSet = await rbacHelper.helpCreateAuthPermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
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
      rbac.newCreatePermissionSetId = _.get(createPermissionSetData, 'id');

      await rbacHelper.helpAddACEsToResources(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          resourceType: 'Organization',
          ids: [testOrg.id],
          entries: [
            {
              member: {
                id: restrictedUser.userId,
                memberType: 'User'
              },
              permissionSetID: rbac.newCreatePermissionSetId
            },
            {
              member: {
                id: regularUser.userId,
                memberType: 'User'
              },
              permissionSetID: rbac.newCreatePermissionSetId
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

    it('restrict user create folder should success', async () => {
      const createFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: restrictedOptions },
        {
          name: `${citestMarker}-folder-${uuid.v4()}`,
          description: 'citest',
          parentId: testFolderData.parentFolderId
        }
      );
      expect(createFolder).toBeDefined();
      restrictUserCreatedFolderId = createFolder.id;
    });

    it('Grant FOLDER_FILE to cms user', async () => {
      const addACEsToResourcesResult = await rbacHelper.helpUpdatePermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          id: rbac.newCreatePermissionSetId,
          name: `${citestMarker}-folder-file-permission-${uuid.v4()}`,
          permissions: [
            'AIWARE_FOLDER_FILE',
            'AIWARE_FOLDER_CREATE',
            'AIWARE_FOLDER_READ',
            'AIWARE_FOLDER_UPDATE',
            'AIWARE_TDO_READ',
            'AIWARE_TDO_CREATE'
          ]
        }
      );
      expect(addACEsToResourcesResult).toBeDefined();

      // relogin cms user
      const impersonated = await userHelper.impersonateUser(
        { superAdminToken: superToken },
        { id: regularUser.userId, organizationGuid: testOrg.guid }
      );
      regularOptions = impersonated.requestOptions;
    });

    it('cms user file new folder content should success', async () => {
      const newTDO = await tdoHelper.helpCreateTDOWithAsset(
        { gqlClient, options: regularOptions },
        {
          name: `${citestMarker}-tdo-${uuid.v4()}`,
          ...tdoAssetInput
        }
      );
      expect(newTDO).toBeDefined();

      const filedTDO = await tdoHelper.helpFileTDO(
        { gqlClient, options: regularOptions },
        {
          tdoId: newTDO.id,
          folderId: testFolderData.parentFolderId
        }
      );
      expect(filedTDO).toBeDefined();
    });

    xit('cms user share folder to other org should fail', async () => {
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

      const sharedFolder = await gqlClient.query(query);
      expect(sharedFolder).toBeDefined();
      const shareFolderId = _.get(sharedFolder, 'shareFolder.id');
      expect(shareFolderId).toBeDefined();
    });

    it('target org can get folder', async () => {
      // Retry: v2DalSwitch returns before the V2 share write commits when the
      // super admin org routes to V1 as primary (V2 is fire-and-forget).
      // The target org reads from V2, so shared_org_read may not be visible yet.
      const maxAttempts = 5;
      let getFolder;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          getFolder = await folderHelper.helpGetFolder(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderData.parentFolderId }
          );
          break;
        } catch (err) {
          if (attempt === maxAttempts) throw err;
          await helpers.sleep(1000);
        }
      }
      expect(getFolder).toBeDefined();
      expect(getFolder.folder.id).toEqual(testFolderData.parentFolderId);
    });

    it('new admin Grant FOLDER_DELETE to restrict user', async () => {
      const newAuthPermissionSet = await rbacHelper.helpUpdatePermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          id: rbac.newFolderCreatePermissionSetId,
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

      await rbacHelper.helpUpdatePermissionSet(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          id: rbac.newCreatePermissionSetId,
          name: `${citestMarker}-folder-create-permission-${uuid.v4()}`,
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
    });

    it('restricted user delete child folder should success', async () => {
      // new folder to be deleted
      const newFolder = await folderHelper.helpCreateFolder(
        { gqlClient, options: testFolderData.newAdminUserOptions },
        {
          parentId: testFolderData.parentFolderId,
          description: 'Folder Description',
          name: `${citestMarker}Test Folder ${uuid.v4()}`
        }
      );
      expect(newFolder).toBeDefined();
      expect(newFolder.id).toBeDefined();

      const deletedFolder = await folderHelper.helpDeleteFolder(
        { gqlClient, options: restrictedOptions },
        {
          folderId: newFolder.id,
          orderIndex: newFolder.orderIndex
        }
      );
      expect(deletedFolder).toBeDefined();
      expect(deletedFolder.id).toEqual(newFolder.id);
    });

    afterAll(async () => {
      if (testFolderData.defaultUserCreatedFolderId) {
        try {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: regularOptions },
            {
              folderId: testFolderData.defaultUserCreatedFolderId,
              orderIndex: 0
            }
          );
        } catch (error) {
          console.log('Failed to delete default user created folder', error);
        }
      }

      if (restrictUserCreatedFolderId) {
        try {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: restrictedOptions },
            {
              folderId: restrictUserCreatedFolderId,
              orderIndex: 0
            }
          );
        } catch (error) {
          console.log('Failed to delete restrict user created folder', error);
        }
      }
    });
  });
}

function updateOrgOLPOption(status) {
  describe('non OLP update to OLP', () => {
    it('update organization to OLP should success', async () => {
      const updateOrg = await orgHelper.updateOrganization(
        { gqlClient, options: superOptions },
        {
          id: testOrg.id,
          jsondata: {
            features: {
              enableRBACFeature: status
            }
          }
        }
      );
      expect(updateOrg).toBeDefined();
      expect(updateOrg.id).toEqual(testOrg.id);
      await helpers.sleep(5000);
      // verify org updated
      const getOrgResult = await orgHelper.findOrgWithFilter(
        { gqlClient, options: superOptions },
        { id: testOrg.id }
      );
      expect(getOrgResult).toBeDefined();
      expect(
        _.get(getOrgResult, '[0].jsondata.features.enableRBACFeature')
      ).toEqual(status);
      testOrg.guid = _.get(getOrgResult, '[0].guid', testOrg.guid);
    });
  });
}

async function removeRestrictUserAuth(input) {
  let {
    gqlClient,
    restrictedOptions,
    restrictedUserId,
    testOrg,
    superToken,
    testFolderData
  } = input;

  // relogin restricted user
  const impersonated = await userHelper.impersonateUser(
    { superAdminToken: superToken },
    { id: restrictedUserId, organizationGuid: testOrg.guid }
  );
  restrictedOptions = impersonated.requestOptions;

  const restricted = await userHelper.getMyInfo({
    gqlClient,
    options: restrictedOptions
  });
  expect(_.get(restricted, 'me.name')).toContain(`-restrict-user`);
  const defaultAGsToRemoveMember = _.get(
    restricted,
    'me.authGroups.records',
    []
  );

  const authGroupIds = _.map(defaultAGsToRemoveMember, 'id');

  // Refresh new admin user options if exists
  if (testFolderData.newAdminUserId) {
    const impersonatedNewAdmin = await userHelper.impersonateUser(
      { superAdminToken: superToken },
      { id: testFolderData.newAdminUserId, organizationGuid: testOrg.guid }
    );
    testFolderData.newAdminUserOptions = impersonatedNewAdmin.requestOptions;
  }

  if (authGroupIds.length > 0) {
    const result = await Promise.all(
      authGroupIds.map((id) =>
        gqlClient.query(
          `mutation authGroupRemoveMembers {
                authGroupRemoveMembers(
                  id: "${id}",
                  memberIds: ["${restrictedUserId}"]
                ) {
                  id
                }
              }`,
          {},
          testFolderData.newAdminUserOptions
        )
      )
    );
    expect(result.length).toEqual(authGroupIds.length);

    // relogin restricted user
    const impersonated = await userHelper.impersonateUser(
      { superAdminToken: superToken },
      { id: restrictedUserId, organizationGuid: testOrg.guid }
    );

    return impersonated.requestOptions;
  }
}

async function addFolderReadPermissionToUser(input) {
  let {
    gqlClient,
    adminOptions,
    restrictedUserId,
    testOrg,
    superToken,
    testFolderData
  } = input;
  let newAuthGroupId;

  const newAuthGroup = await rbacHelper.helpCreateAuthGroup(
    { gqlClient, options: adminOptions },
    {
      name: `${citestMarker}-folder-read-group-${uuid.v4()}`,
      description: 'citest folder read group',
      members: [{ id: restrictedUserId, memberType: 'User' }]
    }
  );
  expect(newAuthGroup).toBeDefined();
  newAuthGroupId = _.get(newAuthGroup, 'id');

  const newAuthPermissionSet = await rbacHelper.helpCreateAuthPermissionSet(
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
  const newAuthPermissionSetId = _.get(authPermissionSetData, 'id');

  await rbacHelper.helpAddACEsToResources(
    { gqlClient, options: adminOptions },
    {
      resourceType: 'Folder',
      ids: [testFolderData.parentFolderId, testFolderData.parentFolderId2],
      entries: [
        {
          member: {
            id: newAuthGroupId,
            memberType: 'Group'
          },
          permissionSetID: newAuthPermissionSetId
        }
      ]
    }
  );

  // relogin restricted user
  const impersonated = await userHelper.impersonateUser(
    { superAdminToken: superToken },
    { id: restrictedUserId, organizationGuid: testOrg.guid }
  );
  const restrictedOptions = impersonated.requestOptions;

  return { restrictedOptions, newAuthPermissionSetId, newAuthGroupId };
}

// Helper function to refresh all user tokens consistently
async function refreshAllUserTokens() {
  const impersonatedAdmin = await userHelper.impersonateUser(
    { superAdminToken: superToken },
    { id: adminUser.userId, organizationGuid: testOrg.guid }
  );
  adminOptions = impersonatedAdmin.requestOptions;

  const impersonatedRegular = await userHelper.impersonateUser(
    { superAdminToken: superToken },
    { id: regularUser.userId, organizationGuid: testOrg.guid }
  );
  regularOptions = impersonatedRegular.requestOptions;

  const impersonatedRestricted = await userHelper.impersonateUser(
    { superAdminToken: superToken },
    { id: restrictedUser.userId, organizationGuid: testOrg.guid }
  );
  restrictedOptions = impersonatedRestricted.requestOptions;

  // Refresh new admin user options if exists
  if (testFolderData.newAdminUserId) {
    const impersonatedNewAdmin = await userHelper.impersonateUser(
      { superAdminToken: superToken },
      { id: testFolderData.newAdminUserId, organizationGuid: testOrg.guid }
    );
    testFolderData.newAdminUserOptions = impersonatedNewAdmin.requestOptions;
  }
}
