/* global pending */
const helpers = require('../../helpers/index');
const { safe } = require('../../helpers/cleanup/utils');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const folderHelper = require('../../helpers/folder');
const orgInvite = require('../../helpers/orgInvite');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup, testSetup2;

let superOrgGuid, superOrgId, superUserId;
let testUsers;
let superToken, superOptions;
let testOrg, adminUser;
let adminOptions, adminOptions2;
let testOrg2, adminOrg2, adminOrg2Options;
let testFolderData = {
  rootFolderId: null,
  treeObjectId: null,
  rootFolderId2: null,
  treeObjectId2: null,
  parentFolderId: null,
  parentFolderId2: null
};

let createOrgAndUserInput, createSecondOrgAndUserInput;

describe('citest_folder: multi-org folder test', () => {
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

  describe.each(['disabled', 'enabled'])('Folder OLP %s', (isEnabledOLP) => {
    const listNames = [];
    const listFolderNameOrg1 = [];
    const listFolderNameOrg2 = [];

    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput('v2', isEnabledOLP);
      createSecondOrgAndUserInput = getOrgAndUserInput('v2', isEnabledOLP);

      // setup org 1
      testSetup = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      expect(testOrg.users).toBeDefined();
      testUsers = _.get(testOrg, 'users.records');

      // Login for Admin user
      adminUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOptions = adminUser.requestOptions;

      // setup org 2
      testSetup2 = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createSecondOrgAndUserInput
      );

      testOrg2 = testSetup2.org;
      expect(testOrg2).toBeDefined();
      expect(testOrg2.name).toContain(`${citestMarker}-org`);
      expect(testOrg2.users).toBeDefined();
      testUsers = _.get(testOrg2, 'users.records');
      // Login for Admin user
      adminOrg2 = _.find(testSetup2.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOrg2Options = adminOrg2.requestOptions;
    });

    describe('multi-org root folder', () => {
      it('create root folder in org 1', async () => {
        const rootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'watchlist' }
        );

        const userRootFolder = rootFolder.find(
          (f) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderId = userRootFolder.id;
        testFolderData.treeObjectId = userRootFolder.treeObjectId;
      });

      it('create child folder org 1', async () => {
        const childFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-child-org1-V2-${uuid.v4()}`,
            parentId: testFolderData.rootFolderId,
            description: 'child folder org 1',
            rootFolderType: 'watchlist'
          }
        );
        expect(childFolder).toBeDefined();
        expect(childFolder.id).toBeDefined();
        testFolderData.childFolderId = childFolder.id;
        listNames.push(childFolder.name);
        listFolderNameOrg1.push(childFolder.name);
      });

      it('update org1 to V1 folders', async () => {
        const updateResult = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: testOrg.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'disabled'
              }
            }
          }
        );
        expect(updateResult.id).toBeDefined();
        expect(updateResult.id).toEqual(testOrg.id);
        expect(updateResult.jsondata.features.v2FoldersEnabled).toEqual(
          'disabled'
        );
      });

      it('create rootFolder V1 in org 1', async () => {
        // re login
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: adminUser.userId, organizationGuid: testOrg.guid }
        );

        expect(impersonated.token).toBeDefined();
        adminOptions = impersonated.requestOptions;

        // create root folder
        const rootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'watchlist' }
        );

        const userRootFolder = rootFolder.find(
          (f) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderIdV1 = userRootFolder.id;
        testFolderData.treeObjectIdV1 = userRootFolder.treeObjectId;
      });

      it('create child folder V1 in org 1 - success', async () => {
        const childFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-child-org1-V1-${uuid.v4()}`,
            parentId: testFolderData.rootFolderIdV1,
            description: 'child folder org 1 v1',
            rootFolderType: 'watchlist'
          }
        );
        expect(childFolder).toBeDefined();
        expect(childFolder.id).toBeDefined();
        testFolderData.childFolderId2 = childFolder.id;
        listNames.push(childFolder.name);
        listFolderNameOrg1.push(childFolder.name);
      });

      it('add user org1 to org 2', async () => {
        const addUserResult = await userHelper.helpAddUserToOrg(
          { gqlClient, options: superOptions },
          {
            userId: adminUser.userId,
            organizationGuid: testOrg2.guid,
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266'
            ].filter((roleId) => roleId)
          }
        );
        expect(addUserResult).toBeDefined();
        expect(addUserResult.id).toEqual(adminUser.userId);
        expect(addUserResult.organizationGuids).toContain(testOrg2.guid);
      });

      it('login and create root folder in org 2', async () => {
        // login
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: adminUser.userId, organizationGuid: testOrg2.guid }
        );

        expect(impersonated.token).toBeDefined();
        adminOptions2 = impersonated.requestOptions;
        const rootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions2 },
          { rootFolderType: 'watchlist' }
        );
        const userRootFolder = rootFolder.find(
          (f) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderId2 = userRootFolder.id;
        testFolderData.treeObjectId2 = userRootFolder.treeObjectId;
      });

      it('update org2 to V1 folders', async () => {
        const updateResult = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: testOrg2.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'disabled'
              }
            }
          }
        );
        expect(updateResult.id).toBeDefined();
        expect(updateResult.id).toEqual(testOrg2.id);
        expect(updateResult.jsondata.features.v2FoldersEnabled).toEqual(
          'disabled'
        );
      });

      it('create child folder V1 in org 2 - success', async () => {
        // re login
        const impersonated = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: adminUser.userId, organizationGuid: testOrg2.guid }
        );

        expect(impersonated.token).toBeDefined();
        adminOptions2 = impersonated.requestOptions;

        const root = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions2 },
          'watchlist'
        );
        expect(root).toBeDefined();
        expect(root.length).toBeGreaterThan(0);

        // create root folder
        const rootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions2 },
          { rootFolderType: 'watchlist' }
        );
        const userRootFolder = rootFolder.find(
          (f) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderIdOrg2V1 = userRootFolder.id;
        testFolderData.treeObjectIdOrg2V1 = userRootFolder.treeObjectId;

        // create child folder
        const childFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions2 },
          {
            name: `${citestMarker}-child-org2-V1-${uuid.v4()}`,
            parentId: testFolderData.rootFolderIdOrg2V1,
            description: 'child folder org 2 v1',
            rootFolderType: 'watchlist'
          }
        );
        expect(childFolder).toBeDefined();
        expect(childFolder.id).toBeDefined();
        testFolderData.childFolderIdOrg2 = childFolder.id;
        listNames.push(childFolder.name);
        listFolderNameOrg2.push(childFolder.name);
      });

      describe('verify root folder content between V1 and V2', () => {
        it('get root folder in org 2 V1', async () => {
          const rootFolders = await folderHelper.helpGetRootFolders(
            { gqlClient, options: adminOptions2 },
            'watchlist'
          );

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder.id).toEqual(testFolderData.rootFolderIdOrg2V1);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          ).map((f) => f.name);

          // in V1 root folder belong to user and store all child folders of the user across org
          expect(childFolderNames).toEqual(expect.arrayContaining(listNames));
        });

        it('switch org2 back to V2', async () => {
          const updateResult = await orgHelper.updateOrganization(
            { gqlClient, options: superOptions },
            {
              id: testOrg2.id,
              jsondata: { features: { v2FoldersEnabled: 'enabled' } }
            }
          );
          expect(updateResult.id).toBeDefined();
          expect(updateResult.id).toEqual(testOrg2.id);
          expect(updateResult.jsondata.features.v2FoldersEnabled).toEqual(
            'enabled'
          );
        });

        it('get root folder org2 V2', async () => {
          // re login
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: adminUser.userId, organizationGuid: testOrg2.guid }
          );

          expect(impersonated.token).toBeDefined();
          adminOptions2 = impersonated.requestOptions;

          const rootFolders = await folderHelper.helpGetRootFolders(
            { gqlClient, options: adminOptions2 },
            'watchlist'
          );

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder.id).toEqual(testFolderData.rootFolderId2);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          ).map((f) => f.name);
          // in V2 root folder belong to org and store child folders of the org
          expect(childFolderNames).toEqual(
            expect.arrayContaining(listFolderNameOrg2)
          );
        });

        it('get root folder in org 1 V1', async () => {
          const rootFolders = await folderHelper.helpGetRootFolders(
            { gqlClient, options: adminOptions },
            'watchlist'
          );

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder.id).toEqual(testFolderData.rootFolderIdV1);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          ).map((f) => f.name);

          // in V1 root folder belong to user and store all child folders of the user across org
          expect(childFolderNames).toEqual(expect.arrayContaining(listNames));
        });

        it('switch org1 back to V2', async () => {
          const updateResult = await orgHelper.updateOrganization(
            { gqlClient, options: superOptions },
            {
              id: testOrg.id,
              jsondata: { features: { v2FoldersEnabled: 'enabled' } }
            }
          );
          expect(updateResult.id).toBeDefined();
          expect(updateResult.id).toEqual(testOrg.id);
          expect(updateResult.jsondata.features.v2FoldersEnabled).toEqual(
            'enabled'
          );
        });

        it('get root folder org1 V2', async () => {
          // re login
          const impersonated = await userHelper.impersonateUser(
            { superAdminToken: superToken },
            { id: adminUser.userId, organizationGuid: testOrg.guid }
          );

          expect(impersonated.token).toBeDefined();
          adminOptions = impersonated.requestOptions;

          const rootFolders = await folderHelper.helpGetRootFolders(
            { gqlClient, options: adminOptions },
            'watchlist'
          );

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder.id).toEqual(testFolderData.rootFolderId);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          ).map((f) => f.name);
          // in V2 root folder belong to org and store child folders of the org
          expect(childFolderNames).toEqual(
            expect.arrayContaining(listFolderNameOrg1)
          );
        });
      });
    });

    afterAll(async () => {
      // Delete folders
      if (testFolderData.childFolderId) {
        await safe('delete childFolderId', async () => {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: testFolderData.childFolderId, orderIndex: 0 }
          );
        });
      }

      if (testFolderData.childFolderId2) {
        await safe('delete childFolderId2', async () => {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: testFolderData.childFolderId2, orderIndex: 0 }
          );
        });
      }

      if (testFolderData.childFolderIdOrg2) {
        await safe('delete childFolderIdOrg2', async () => {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions2 },
            { folderId: testFolderData.childFolderIdOrg2, orderIndex: 0 }
          );
        });
      }

      // Delete users
      if (!_.isEmpty([...testSetup.listOptions, ...testSetup2.listOptions])) {
        await safe('delete users', async () => {
          const listUserIds = [
            ...testSetup.listOptions,
            ...testSetup2.listOptions
          ].map((user) => user.userId);
          await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
        });
      }

      // Delete organizations
      if (testOrg.id) {
        await safe('delete testOrg', async () => {
          await orgHelper.modifyRBACFeature(
            { gqlClient, options: superOptions },
            testOrg.id,
            'disabled'
          );
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            testOrg.id
          );
        });
      }

      if (testOrg2.id) {
        await safe('delete testOrg2', async () => {
          await orgHelper.modifyRBACFeature(
            { gqlClient, options: superOptions },
            testOrg2.id,
            'disabled'
          );
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            testOrg2.id
          );
        });
      }
    });
  });
});

function getOrgAndUserInput(version = 'v1', enableRBAC = 'disabled') {
  const email = `thoang2+citest-${uuid.v4()}@veritone.com`;
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: enableRBAC,
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
        name: email,
        email: email,
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f', // CMS Editor
          '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
        ].filter((roleId) => roleId)
      }
    ]
  };

  return createOrgAndUserInput;
}
