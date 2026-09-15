/* global pending */
const helpers = require('../../helpers/index');
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

describe('citest_folder: folder data conversion test', () => {
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

    describe('multi-org folder conversion', () => {
      it('user1 create root folder in org1', async () => {
        const createFolderResponse = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'watchlist' }
        );
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();

        testFolderData.rootFolderId = userRoot.id;
      });

      it('switch to folder V1 in org1', async () => {
        const updateOrg = await orgHelper.updateOrganization(
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
        expect(updateOrg).toBeDefined();
      });

      it('root folder V1 and V2 org1 has same id', async () => {
        const getRoot = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions },
          'watchlist'
        );

        expect(getRoot).toBeDefined();
        const userRoot = getRoot.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();

        expect(userRoot.id).toEqual(testFolderData.rootFolderId);
      });

      it('add user1 from org1 to org2', async () => {
        const addUserResponse = await userHelper.helpAddUserToOrg(
          { gqlClient, options: superOptions },
          {
            userId: adminUser.userId,
            organizationGuid: testOrg2.guid,
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
            ].filter((roleId) => roleId)
          }
        );
        expect(addUserResponse).toBeDefined();
      });

      it('user1 create root folder V2 in org2', async () => {
        // login org2
        const impersonate = await userHelper.impersonateUser(
          { superAdminToken: superToken },
          { id: adminUser.userId, organizationGuid: testOrg2.guid }
        );
        adminOptions2 = helpers.requestOptions(impersonate.token);

        const createFolderResponse = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions2 },
          { rootFolderType: 'watchlist' }
        );
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();

        testFolderData.rootFolderId2 = userRoot.id;
      });

      it('switch to folder V1 in org2', async () => {
        const updateOrg = await orgHelper.updateOrganization(
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
        expect(updateOrg).toBeDefined();
      });

      it('root folder V1 and V2 org2 has same id', async () => {
        const getRoot = await folderHelper.helpGetRootFolders(
          { gqlClient, options: adminOptions2 },
          'watchlist'
        );

        expect(getRoot).toBeDefined();
        const userRoot = getRoot.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();

        expect(userRoot.id).toEqual(testFolderData.rootFolderId2);
      });
    });

    describe('single org folder conversion', () => {
      let singleOrg, singleOrgSetup, singleAdmin, singleAdminOptions;
      it('super admin create org and user V2 folder enabled', async () => {
        // setup org 1
        const createSingleOrgAndUserInput = getOrgAndUserInput(
          'v2',
          isEnabledOLP
        );

        singleOrgSetup = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createSingleOrgAndUserInput
        );

        singleOrg = singleOrgSetup.org;
        expect(singleOrg).toBeDefined();
        expect(singleOrg.name).toContain(`${citestMarker}-org`);
        expect(singleOrg.users).toBeDefined();
        testUsers = _.get(singleOrg, 'users.records');
        // Login for Admin user
        singleAdmin = _.find(singleOrgSetup.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        singleAdminOptions = singleAdmin.requestOptions;
      });

      it('user create root folder V2', async () => {
        const createFolderResponse = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: singleAdminOptions },
          { rootFolderType: 'watchlist' }
        );
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();

        testFolderData.rootFolderId = userRoot.id;
      });

      it('switch to folder V1', async () => {
        const updateOrg = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: singleOrg.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'disabled'
              }
            }
          }
        );
        expect(updateOrg).toBeDefined();
      });

      it('root folder V1 and V2 have same folder id', async () => {
        const getRoot = await folderHelper.helpGetRootFolders(
          { gqlClient, options: singleAdminOptions },
          'watchlist'
        );

        expect(getRoot).toBeDefined();
        const userRoot = getRoot.find((item) => item.ownerId);
        expect(userRoot.id).toBeDefined();
        expect(userRoot.id).toEqual(testFolderData.rootFolderId);
      });

      afterAll(async () => {
        // delete users
        if (!_.isEmpty(singleOrgSetup.listOptions)) {
          const listUserIds = singleOrgSetup.listOptions.map(
            (user) => user.userId
          );
          await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
        }

        if (singleOrg.id) {
          await orgHelper.modifyRBACFeature(
            { gqlClient, options: superOptions },
            singleOrg.id,
            'disabled'
          );
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            singleOrg.id
          );
        }
      });
    });

    describe('root folder name preservation after V1 to V2 switch', () => {
      let testNameOrg, testNameOrgSetup, testNameAdmin, testNameAdminOptions;
      let rootFolderIdForNameTest, rootFolderNameV1;

      it('super admin creates org and user with V1 folder enabled', async () => {
        const createTestOrgAndUserInput = getOrgAndUserInput(
          'v1',
          isEnabledOLP
        );

        testNameOrgSetup = await orgHelper.setupTestOrgAndUser(
          { gqlClient, superAdminToken: superToken },
          createTestOrgAndUserInput
        );

        testNameOrg = testNameOrgSetup.org;
        expect(testNameOrg).toBeDefined();
        expect(testNameOrg.name).toContain(`${citestMarker}-org`);
        expect(testNameOrg.users).toBeDefined();
        testNameAdmin = _.find(testNameOrgSetup.listOptions, (user) => {
          return user.key === 'adminUser';
        });
        testNameAdminOptions = testNameAdmin.requestOptions;
      });

      it('user creates root folder in V1', async () => {
        const createFolderResponse = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: testNameAdminOptions },
          { rootFolderType: 'cms' }
        );
        expect(createFolderResponse).toBeDefined();
        const orgRoot = createFolderResponse.find(
          (item) => !item.ownerId && item.organizationId
        );
        expect(orgRoot).toBeDefined();
        expect(orgRoot.id).toBeDefined();
        expect(orgRoot.name).toBeDefined();

        rootFolderIdForNameTest = orgRoot.id;
        rootFolderNameV1 = orgRoot.name;
      });

      it('switch from V1 to V2 folders', async () => {
        const updateOrg = await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: testNameOrg.id,
            jsondata: {
              features: {
                v2FoldersEnabled: 'enabled'
              }
            }
          }
        );
        expect(updateOrg).toBeDefined();
      });

      it('root folder name remains the same after V1 to V2 switch', async () => {
        const folderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: testNameAdminOptions },
          { id: rootFolderIdForNameTest }
        );

        expect(folderResult).toBeDefined();
        expect(folderResult.folder).toBeDefined();
        expect(folderResult.folder.id).toEqual(rootFolderIdForNameTest);
        expect(folderResult.folder.name).toBeDefined();
        expect(folderResult.folder.name).toEqual(rootFolderNameV1);
      });

      afterAll(async () => {
        if (!_.isEmpty(testNameOrgSetup.listOptions)) {
          const listUserIds = testNameOrgSetup.listOptions.map(
            (user) => user.userId
          );
          await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
        }

        if (testNameOrg.id) {
          await orgHelper.modifyRBACFeature(
            { gqlClient, options: superOptions },
            testNameOrg.id,
            'disabled'
          );
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            testNameOrg.id
          );
        }
      });
    });

    afterAll(async () => {
      // delete folder
      if (testFolderData.childFolderId) {
        try {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: testFolderData.childFolderId, orderIndex: 0 }
          );
        } catch (error) {
          console.log('Error deleting childFolderId:', error);
        }
      }

      if (testFolderData.childFolderId2) {
        try {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: testFolderData.childFolderId2, orderIndex: 0 }
          );
        } catch (error) {
          console.log('Error deleting childFolderId2:', error);
        }
      }

      if (testFolderData.childFolderIdOrg2) {
        try {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions2 },
            { folderId: testFolderData.childFolderIdOrg2, orderIndex: 0 }
          );
        } catch (error) {
          console.log('Error deleting childFolderIdOrg2:', error);
        }
      }

      // delete users
      if (!_.isEmpty([...testSetup.listOptions, ...testSetup2.listOptions])) {
        const listUserIds = [
          ...testSetup.listOptions,
          ...testSetup2.listOptions
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

      if (testOrg2.id) {
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
        // {
        //   applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
        //   applicationKey: 'admin'
        // },
        {
          applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
          applicationKey: 'aiWARE Desktop'
        },
        // {
        //   applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        //   applicationKey: 'developer'
        // },
        {
          applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
          applicationKey: 'discovery'
        }
      ]
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
