/* global pending */
const helpers = require('../../helpers/index');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const folderHelper = require('../../helpers/folder');
const rbacHelper = require('../../helpers/rbacHelper');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const moment = require('moment');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;
let gqlClient;
let testSetup, testSetup2;
const env = config.env;
let generateTagKey;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superOrgGuid, superOrgId;
let testUsers;
let superToken, superOptions, superUserId;
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
let apiOptions;
let deleteFolders = [];

describe('citest_folder: rbac folder non OLP test', () => {
  beforeAll(async () => {
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
    // describe('non OLP Folder', (folderVersion) => {
    let createOrgAndUserInput, createSecondOrgAndUserInput;
    beforeAll(async () => {
      // Reset testFolderData per iteration to prevent state leaks between v1/v2
      deleteFolders = [];
      testFolderData = {
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

      // Generate unique tag keys per iteration to avoid entity_tags PK collisions
      const tagPrefixTimestamp = moment().unix();
      generateTagKey = (suffix) => `tagkey_${tagPrefixTimestamp}_${folderVersion}_${suffix}`;

      createOrgAndUserInput = getOrgAndUserInput(folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(folderVersion);

      // set up org 1
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

    runTestFolderNonOLP(folderVersion);

    // updateToFolderV2();

    // runTestFolderNonOLP('v2');

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
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      },
      {
        key: 'adminUser2',
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

function shareTreeObjectQuery(
  treeObjectId,
  readOrganizationIds,
  writeOrganizationIds
) {
  return `mutation {
      shareFolder (input: {
        folderId: "${treeObjectId}",
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

function runTestFolderNonOLP(version = 'v1') {
  describe(`Folder ${version} Non OLP Tests`, () => {
    describe('non OLP create folder', () => {
      it('A1 - org admin create folder without folder name should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /name.* was not provided/
        );
      });

      it('A1 - cms user create folder should fail', async () => {
        const folder = folderHelper.helpCreateFolder(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(folder).rejects.toThrow(/not authorized/);
      });

      it('A1 - restricted user can not create folder', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: restrictedOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(createFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A2 - org admin create folder without description should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /description.* was not provided/
        );
      });

      it('A3 - org admin create folder with not existed parentId should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: uuid.v4()
          }
        );
        await expect(createFolderResult).rejects.toThrow();
      });

      it('A4 - org admin create folder using inaccessible parentId should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderIdOrg2
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /folder.* could not be found/
        );
      });

      it('A5 - org admin create folder with valid parentId should success', async () => {
        const folder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        expect(folder).toBeDefined();
        deleteFolders.push({
          folderId: folder.id,
          orderIndex: folder.orderIndex
        });
      });

      it('A6 - create folder with invalid rootFolderType should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId,
            rootFolderType: 'watchlist'
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /folder.* could not be found/
        );
      });

      it('A7 - create folder with each rootFolderType should success', async () => {
        const rootFolderTypes = [
          'cms',
          'watchlist',
          'collection',
          'application',
          'resource'
        ];

        for (const rootFolderType of rootFolderTypes) {
          const rootFolder = await folderHelper.helpCreateRootFolder(
            { gqlClient, options: adminOptions },
            { rootFolderType }
          );
          expect(rootFolder).toBeDefined();
          expect(rootFolder.length).toBeGreaterThan(0);
          const orgRootFolder = rootFolder.find((folder) => !folder.ownerId);
          const adminRootFolder = rootFolder.find(
            (folder) => folder.ownerId === adminUser.userId
          );

          const rootFolderId = _.get(orgRootFolder, 'id');

          const createdFolder = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-folder-${uuid.v4()}`,
              description: 'citest',
              parentId: rootFolderId,
              rootFolderType
            }
          );
          expect(createdFolder).toBeDefined();
          testFolderData[`${rootFolderType}CreatedFolderId`] = _.get(
            createdFolder,
            'id'
          );

          deleteFolders.push({
            folderId: createdFolder.id,
            orderIndex: createdFolder.orderIndex
          });
        }
      });

      xit('A8 - create folder with negative orderIndex', async () => {
        const folder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            orderIndex: -5
          }
        );
        expect(folder).toBeDefined();
        testFolderData.negativeCreatedFolderId = folder.id;

        // get folder to verify orderIndex
        const getFolder = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: folder.id }
        );
        expect(getFolder).toBeDefined();
        deleteFolders.push({
          folderId: folder.id,
          orderIndex: getFolder.folder.orderIndex
        });
        expect(getFolder.folder.orderIndex).toBeGreaterThanOrEqual(0);
      });

      it('A9 - 2 folder should auto indexed, not have same orderIndex', async () => {
        if (version === 'v2') return;

        const createFolder1 = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            orderIndex: 0
          }
        );

        const createFolder2 = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            orderIndex: 0
          }
        );

        const listFolder = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId, isShowChild: true }
        );

        const childFolders = _.get(listFolder, 'folder.childFolders.records');
        expect(childFolders).toBeDefined();
        const folder1 = childFolders.find((f) => f.id === createFolder1.id);
        const folder2 = childFolders.find((f) => f.id === createFolder2.id);
        expect(folder1).toBeDefined();
        expect(folder2).toBeDefined();
        deleteFolders.push(
          { folderId: folder1.id, orderIndex: folder1.orderIndex },
          { folderId: folder2.id, orderIndex: folder2.orderIndex }
        );
        expect(folder1.orderIndex).not.toEqual(folder2.orderIndex);
      });

      // it('create a user using API Token', async () => {
      //   const createApiTokenMutation = `mutation {
      //       apiTokenCreate(name: "${citestMarker}-test-api-token-${new Date().getTime()}" rights: [
      //       CMS_MEDIA_CREATE
      //       ]) {
      //         id
      //         details {
      //           hash
      //         }
      //       }
      //     }`;

      //   const apiTokenResult = await gqlClient.query(
      //     createApiTokenMutation,
      //     null
      //     // userTokenAuthorization
      //   );

      //   citestApiTokenId = _.get(apiTokenResult, 'apiTokenCreate.id');
      //   citestApiTokenHash = _.get(
      //     apiTokenResult,
      //     'apiTokenCreate.details.hash'
      //   );

      //   const createFolderResult = folderHelper.helpCreateFolder(
      //     {
      //       gqlClient,
      //       options: {
      //         headers: { Authorization: `Bearer ${citestApiTokenId}` }
      //       }
      //     },
      //     {
      //       name: `${citestMarker}-folder-${uuid.v4()}`,
      //       description: 'citest',
      //       parentId: testFolderData.parentFolderId,
      //       userId: uuid.v4()
      //     }
      //   );
      //   await expect(createFolderResult).rejects.toThrow(/not_found/);
      //   // const appKey = Date.now().valueOf();
      //   // const query = `mutation {
      //   //     createUser(input: {
      //   //       name: "${citestMarker}-user_api_token_${appKey}@localhost"
      //   //       organizationId: 7682
      //   //       roleIds: []
      //   //       firstName: "First"
      //   //       lastName: "Last"
      //   //       jsondata: {
      //   //         foo: "bar"
      //   //       }
      //   //     })  {
      //   //       id
      //   //       name
      //   //       firstName
      //   //       lastName
      //   //       jsondata
      //   //     }
      //   //   }
      //   //   `;
      //   // const result = await gqlClient.query(query, null, {
      //   //   headers: { Authorization: `Bearer ${citestApiTokenId}` }
      //   // });
      //   // const createUser = _.get(result, 'createUser');
      //   // expect(createUser).toBeDefined();
      //   // newUserIdCreatedByApiToken = createUser.id;
      //   // expect(createUser.name).toEqual(
      //   //   `${citestMarker}-user_api_token_${appKey}@localhost`
      //   // );
      // });

      it('A12 - api token create folder with not existed userId should fail', async () => {
        const createAPIToken = await rbacHelper.helpCreateAPIToken(
          { gqlClient },
          {
            name: `${citestMarker}-api-token-${uuid.v4()}`,
            rights: [
              'CMS_MEDIA_CREATE',
              'CMS_MEDIA_READ',
              'AIWARE_FOLDER_CREATE',
              'AIWARE_FOLDER_DELETE',
              'AIWARE_FOLDER_FILE',
              'AIWARE_FOLDER_READ',
              'AIWARE_FOLDER_UPDATE'
            ]
          }
        );

        expect(createAPIToken).toBeDefined();
        const apiToken = createAPIToken.id;
        apiOptions = helpers.requestOptions(apiToken);

        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: apiOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            userId: uuid.v4()
          }
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      it('A12 - api token create folder with mis-match userId, parentId should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: apiOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            userId: adminOrg2.userId
          }
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      it('A13 - api token create folder with valid userId should success', async () => {
        const veritoneRootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: superOptions },
          { rootFolderType: 'cms' }
        );
        expect(veritoneRootFolder).toBeDefined();
        expect(veritoneRootFolder.length).toBeGreaterThan(0);
        const rootFolder = veritoneRootFolder[0];
        expect(rootFolder).toBeDefined();
        const folder = rootFolder;

        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: apiOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: folder.id,
            userId: superUserId
          }
        );
        expect(createFolderResult).toBeDefined();
      });

      it('A14 - org admin create folder with valid userId should success', async () => {
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            userId: regularUser.userId
          }
        );
        expect(createFolderResult).toBeDefined();
        deleteFolders.push({
          folderId: createFolderResult.id,
          orderIndex: createFolderResult.orderIndex
        });
      });

      it('A15 - org admin create folder with entityTags: without tagKey should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId,
            entityTags: [
              {
                entityType: 'folder',
                entityId: testFolderData.parentFolderId
              }
            ]
          }
        );
        await expect(createFolderResult).rejects.toThrow(
          /tagKey.* was not provided/
        );
      });
    });

    describe('non OLP update folder', () => {
      it('A20 - Update folder using not existed folderId should fail', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: uuid.v4(),
            name: citestMarker + '-updated-folder-name'
          }
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A21 - Update folder using inaccessible folderId should fail', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderIdOrg2,
            name: citestMarker + '-updated-folder-name'
          }
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A22 - Update folder using valid folderId should success', async () => {
        const updateFolderResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-updated-folder-name'
          }
        );
        expect(updateFolderResult).toBeDefined();
        expect(updateFolderResult.name).toEqual(
          citestMarker + '-updated-folder-name'
        );
      });

      it('A23 - Update folder without folder name should fail', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId
          }
        );
        await expect(updateFolderResult).rejects.toThrow(
          /name.* was not provided/
        );
      });

      it('A24 - Admin Update folder with folder name should success', async () => {
        const updateFolderResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder1-${uuid.v4()}`
          }
        );
        expect(updateFolderResult).toBeDefined();
      });

      // it('cms user Update folder with folder name should success', async () => {
      //   const updateFolderResult = await folderHelper.helpUpdateFolder(
      //     { gqlClient, options: regularOptions },
      //     {
      //       id: testFolderData.parentFolderId,
      //       name: `${citestMarker}-folder123-${uuid.v4()}`
      //     }
      //   );
      //   expect(updateFolderResult).toBeDefined();
      // });

      it('A24 - restricted user can not update folder', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: restrictedOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder-${uuid.v4()}`
          }
        );
        await expect(updateFolderResult).rejects.toThrow(
          /not.*(found|authorized)/
        );
      });

      it('A25 - Update folder entityTags tagKey', async () => {
        const updateFolderResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder2-${uuid.v4()}`,
            entityTags: [
              {
                tagKey: generateTagKey('a25')
              }
            ]
          }
        );
        expect(updateFolderResult).toBeDefined();
      });

      it('A26 - update entityTags without tagKey should fail', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            entityTags: [
              {
                entityType: 'folder',
                entityId: testFolderData.parentFolderId
              }
            ]
          }
        );
        await expect(updateFolderResult).rejects.toThrow(
          /tagKey.* was not provided/
        );
      });

      it('A27 - Update folder entityTags entityType', async () => {
        const tagKey = generateTagKey('a27');
        const updateFolderResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOptions },
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder3-${uuid.v4()}`,
            entityTags: [
              {
                tagKey,
                entityType: 'schema'
              }
            ]
          }
        );
        expect(updateFolderResult).toBeDefined();
        expect(updateFolderResult.entityTags).toBeDefined();
        expect(updateFolderResult.entityTags[0].tagKey).toEqual(tagKey);
      });
    });

    describe('non OLP move folder', () => {
      it('A34 - Move folder using not existed folderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: uuid.v4(),
            toFolderId: testFolderData.parentFolderId2
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_found/);
      });

      it('A35 - Move inaccessible folderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.parentFolderIdOrg2,
            toFolderId: testFolderData.parentFolderId2
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A36 - Move owned folderId should success', async () => {
        const moveFolderResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: testFolderData.parentFolderId,
            fromFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFolderResult).toBeDefined();
      });

      it('A37 - Move folder using not existed fromFolderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: uuid.v4(),
            toFolderId: testFolderData.parentFolderId
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A38 - Move folder using inaccessible fromFolderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderIdOrg2,
            toFolderId: testFolderData.parentFolderId2
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A39 - Move folder using not existed toFolderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: uuid.v4()
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A40 - Move folder using inaccessible toFolderId should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: testFolderData.parentFolderIdOrg2
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A41 - Admin Move folder using valid fromFolderId, toFolderId should success', async () => {
        const moveFolderResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderId,
            toFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFolderResult).toBeDefined();
      });

      it('A42 - cms user Move folder should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: regularOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderId,
            toFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A43 - restricted user can not move folder', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: restrictedOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderId,
            toFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A44 - Move folder using valid toFolderId should success', async () => {
        const moveFolderResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: testFolderData.parentFolderId,
            fromFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFolderResult).toBeDefined();
      });

      it('A45 - Move folder using not match rootFolderType should fail', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            toFolderId: testFolderData.parentFolderId,
            fromFolderId: testFolderData.childFolderId,
            rootFolderType: 'watchlist'
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A46 - Move folder using valid rootFolderType should success', async () => {
        const moveFolderResult = await folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderId,
            toFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFolderResult).toBeDefined();
      });

      it('A47 - move folder to its own child should fail (loop folder)', async () => {
        const moveFolderResult = folderHelper.helpMoveFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.childFolderId,
            toFolderId: testFolderData.grandChildFolderId,
            fromFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFolderResult).rejects.toThrow(/resource_conflict/);
      });
    });

    describe('non OLP move multi folders', () => {
      it('A48 - Move folders using not existed, inaccessible folderIds should fail', async () => {
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [uuid.v4()],
            newParentFolderId: testFolderData.grandChildFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);

        const moveFoldersResult1 = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.parentFolderIdOrg2],
            newParentFolderId: testFolderData.grandChildFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFoldersResult1).rejects.toThrow(/not_allowed/);
      });

      it('A49 - Move folders using valid folderIds should success', async () => {
        const moveFoldersResult = await folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFoldersResult).toBeDefined();
      });

      it('A50 - Move folders to not existed, inaccessible newParentFolderId should fail', async () => {
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: uuid.v4(),
            rootFolderType: 'cms'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A51 - Move folders to valid newParentFolderId should success', async () => {
        const moveFoldersResult = await folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFoldersResult).toBeDefined();
      });

      it('A52 - Move folder using not match rootFolderType should fail', async () => {
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.parentFolderId,
            rootFolderType: 'watchlist'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A53 - cms user Move folder should fail', async () => {
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: regularOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not authorized/);
      });

      it('A54 - Admin Move folder to other parent folder with same rootFolderType should success', async () => {
        const moveFoldersResult = await folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.parentFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(moveFoldersResult).toBeDefined();
      });

      it('A55 - Move folder to other parent folder with difference rootFolderType should fail', async () => {
        // create watchlist root folder for org
        const watchlistRootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'watchlist' }
        );
        expect(watchlistRootFolder).toBeDefined();
        expect(watchlistRootFolder.length).toBeGreaterThan(0);
        const rootFolderId = _.get(watchlistRootFolder, '[0].id');

        const createWatchlistFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: rootFolderId,
            rootFolderType: 'watchlist'
          }
        );
        expect(createWatchlistFolder).toBeDefined();
        const watchlistFolderId = _.get(createWatchlistFolder, 'id');
        deleteFolders.push({
          folderId: createWatchlistFolder.id,
          orderIndex: createWatchlistFolder.orderIndex
        });

        // try to move cms folder to watchlist folder
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: watchlistFolderId,
            rootFolderType: 'watchlist'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A56 - move folder to folder of other org should fail', async () => {
        const moveFoldersResult = folderHelper.helpMoveMultiFolders(
          { gqlClient, options: adminOptions },
          {
            folderIds: [testFolderData.grandChildFolderId],
            newParentFolderId: testFolderData.parentFolderIdOrg2,
            rootFolderType: 'cms'
          }
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A57 - move folders into child should fail', async () => {
        // create folder
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.childFolderId,
            rootFolderType: 'cms'
          }
        );
        expect(createFolderResult).toBeDefined();
        const newFolderId = _.get(createFolderResult, 'id');
        deleteFolders.push({
          folderId: createFolderResult.id,
          orderIndex: createFolderResult.orderIndex
        });

        // Retry: moveFolders uses dalFolderV2._validateAccess which queries v2_folder.
        // For V1 orgs, createFolder fires V2 as fire-and-forget — newFolderId may not
        // be in v2_folder yet when moveFolders runs immediately after.
        const maxAttempts = 5;
        let moveFoldersResult;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            moveFoldersResult = await folderHelper.helpMoveMultiFolders(
              { gqlClient, options: adminOptions },
              {
                folderIds: [testFolderData.childFolderId],
                newParentFolderId: newFolderId,
                rootFolderType: 'cms'
              }
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        const invalidMove = _.get(moveFoldersResult, 'invalidFolderIds');
        expect(invalidMove).toBeDefined();
        expect(invalidMove).toContain(testFolderData.childFolderId);
      });
    });

    describe('non OLP share folder', () => {
      it('A58 - Share folder using not existed treeObjectId should fail', async () => {
        const query = shareTreeObjectQuery(uuid.v4(), [+testOrg2.id]);
        const resultSuperAdmin = gqlClient.query(query);
        await expect(resultSuperAdmin).rejects.toThrow(/not_found/);

        const resultAdmin = gqlClient.query(query, {}, adminOptions);
        await expect(resultAdmin).rejects.toThrow(/not authorized/);

        const resultRegular = gqlClient.query(query, {}, regularOptions);
        await expect(resultRegular).rejects.toThrow(/not authorized/);
      });

      xit('Share folder using inaccessible treeObjectId should fail', async () => {
        const resultAdmin = gqlClient.query(query, {}, adminOptions);
        await expect(resultAdmin).rejects.toThrow(/not authorized/);

        const resultRegular = gqlClient.query(query, {}, regularOptions);
        await expect(resultRegular).rejects.toThrow(/not authorized/);
      });

      xit('Share folder using not existed folderId should fail', async () => {
        const adminShareOrg = folderHelper.helpShareFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: uuid.v4(),
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(adminShareOrg).rejects.toThrow(/not authorized/);

        const regularShareOrg = folderHelper.helpShareFolder(
          { gqlClient, options: regularOptions },
          {
            folderId: uuid.v4(),
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(regularShareOrg).rejects.toThrow(/not authorized/);

        const superAdminShareOrg = folderHelper.helpShareFolder(
          { gqlClient },
          {
            folderId: uuid.v4(),
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(superAdminShareOrg).rejects.toThrow(
          /folder was not found/
        );
      });

      xit('Share folder using inaccessible folderId should fail', async () => {
        const adminShareOrg = folderHelper.helpShareFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.orgTreeObjectIdOrg2,
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(adminShareOrg).rejects.toThrow(/not authorized/);

        const regularShareOrg = folderHelper.helpShareFolder(
          { gqlClient, options: regularOptions },
          {
            folderId: testFolderData.orgTreeObjectIdOrg2,
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(regularShareOrg).rejects.toThrow(/not authorized/);

        const superAdminShareOrg = folderHelper.helpShareFolder(
          { gqlClient },
          {
            folderId: testFolderData.orgTreeObjectIdOrg2,
            readOrganizationIds: [+testOrg2.id]
          }
        );
        await expect(superAdminShareOrg).rejects.toThrow(
          /folder was not found/
        );
      });

      it('A59 - Share folder using valid treeObjectId should success - only super admin can share folder', async () => {
        const folderTreeObject = await folderHelper.helpGetFolder(
          { gqlClient, options: superOptions },
          { id: testFolderData.parentFolderId, treeObjectId: true }
        );
        expect(folderTreeObject).toBeDefined();
        expect(folderTreeObject.folder.treeObjectId).toBeDefined();
        const testTreeObjectId = folderTreeObject.folder.treeObjectId;
        const folderId = folderTreeObject.folder.id;
        const query = shareTreeObjectQuery(folderId, [+testOrg2.id]);
        const resultRestrictUser = gqlClient.query(
          query,
          {},
          restrictedOptions
        );
        await expect(resultRestrictUser).rejects.toThrow(/not authorized/);

        const resultRegularUser = gqlClient.query(query, {}, regularOptions);
        await expect(resultRegularUser).rejects.toThrow(/not authorized/);

        const resultAdmin = gqlClient.query(query, {}, adminOptions);
        await expect(resultAdmin).rejects.toThrow(/not authorized/);

        const resultSuperAdmin = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });

      it('A60 - Share folder using not existed readOrganizationIds should fail', async () => {
        const query = shareTreeObjectQuery(testFolderData.treeObjectId, [
          9999999
        ]);

        const resultSuperAdmin = gqlClient.query(query);
        await expect(resultSuperAdmin).rejects.toThrow(/invalid_input/);
      });

      it('A61 - Share folder using valid readOrganizationIds should success', async () => {
        const getParentFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId, treeObjectId: true }
        );
        expect(getParentFolderResult).toBeDefined();

        testFolderData.parentFolderTreeObjectId = _.get(
          getParentFolderResult,
          'folder.treeObjectId'
        );

        const query = shareTreeObjectQuery(
          testFolderData.parentFolderTreeObjectId,
          [+testOrg2.id]
        );
        const resultSuperAdmin = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });

      it('A62 - org admin get sharing folder should success', async () => {
        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId, isFolderPath: true }
        );

        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(
          testFolderData.parentFolderId
        );
      });

      it('A63 - target org admin get shared folderId should success', async () => {
        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.parentFolderId }
        );
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(
          testFolderData.parentFolderId
        );
      });

      it('A64 - target org regular user get shared folderId should success', async () => {
        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOrg2Options },
          { id: testFolderData.parentFolderId }
        );
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(
          testFolderData.parentFolderId
        );
      });

      it('A65 - target org get not shared folder should fail', async () => {
        // create new root folder and folder
        const newRootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'cms' }
        );
        expect(newRootFolder).toBeDefined();
        const newRootFolderId = _.get(newRootFolder, '[0].id');
        const newFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: newRootFolderId
          }
        );
        expect(newFolder).toBeDefined();
        deleteFolders.push({
          folderId: newFolder.id,
          orderIndex: newFolder.orderIndex
        });

        const getFolderResult = folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.parentFolderId2 }
        );
        await expect(getFolderResult).rejects.toThrow(/not_found/);
      });

      xit('A66 - target org get child folder should success', async () => {
        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.childFolderId }
        );
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(testFolderData.childFolderId);
      });

      xit('A67 - target org get folder content should success', async () => {
        const getFolderResult = await tdoHelper.helpGetTDO(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.tdoId }
        );

        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.id).toEqual(testFolderData.tdoId);
      });

      xit('A68 - target org admin get new created folder should success', async () => {
        // create new root folder and folder
        const newFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.rootFolderId
          }
        );
        expect(newFolder).toBeDefined();
        const newFolderId = _.get(newFolder, 'id');
        testFolderData.newFolderId = newFolderId;
        deleteFolders.push({
          folderId: newFolder.id,
          orderIndex: newFolder.orderIndex
        });

        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOrg2Options },
          { id: newFolderId }
        );
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(newFolder.id);
      });

      xit('A69 - target org regular user get new folder success', async () => {
        const getFolderResult = await folderHelper.helpGetFolder(
          { gqlClient, options: regularOrg2Options },
          { id: testFolderData.newFolderId }
        );
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult.folder.id).toEqual(testFolderData.newFolderId);
      });

      it('A70 - target org admin update shared folder should fail', async () => {
        const updateFolderResult = folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-updated-folder-name'
          }
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A71 - target org admin create folder under shared folder should fail', async () => {
        const createFolderResult = folderHelper.helpCreateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      xit('A72 - target org admin add new content should fail (file TDO, watchlist, app)', async () => {
        const createTDOResult = tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOrg2Options },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput,
            parentFolderId: testFolderData.parentFolderId
          }
        );
        await expect(createTDOResult).rejects.toThrow(/not_allowed/);
      });

      it('A74 - target org admin remove other content should fail (unfile TDO, watchlist, app)', async () => {
        const deleteTDOResult = tdoHelper.helpDeleteTDO(
          { gqlClient, options: adminOrg2Options },
          { id: testFolderData.tdoId }
        );
        await expect(deleteTDOResult).rejects.toThrow(/not_found/);
      });

      xit('A75 - target org admin delete shared folder should fail', async () => {
        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOrg2Options },
          {
            folderId: testFolderData.parentFolderId,
            orderIndex: 0
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A76 - Share folder using not existed, inaccessible writeOrganizationIds should fail', async () => {
        const query = shareTreeObjectQuery(
          testFolderData.treeObjectId,
          [9999999],
          [9999999]
        );

        const resultSuperAdmin = gqlClient.query(query);
        await expect(resultSuperAdmin).rejects.toThrow(/invalid_input/);
      });

      it('A77 - Share folder using valid writeOrganizationIds should success', async () => {
        const query = shareTreeObjectQuery(
          testFolderData.parentFolderTreeObjectId,
          [+testOrg2.id],
          [+testOrg2.id]
        );

        const resultSuperAdmin = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });

      xit('A78 - target org admin update shared folder should success', async () => {
        const updateFolderResult = await folderHelper.helpUpdateFolder(
          { gqlClient, options: adminOrg2Options },
          {
            id: testFolderData.parentFolderId,
            name: citestMarker + '-updated-by-shared-org-folder-name'
          }
        );

        expect(updateFolderResult).toBeDefined();
        expect(updateFolderResult.id).toEqual(testFolderData.parentFolderId);
      });
    });

    describe('non OLP file folder content', () => {
      it('A79 - restricted user can not file, unfile content', async () => {
        const unfileTdoResult = tdoHelper.helpUnFileTDO(
          { gqlClient, options: restrictedOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        await expect(unfileTdoResult).rejects.toThrow(/not authorized/);

        const fileTdoResult = tdoHelper.helpFileTDO(
          { gqlClient, options: restrictedOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        await expect(fileTdoResult).rejects.toThrow(/not authorized/);
      });

      it('A80 - cms User unFile and file should success', async () => {
        const unfileTdo = await tdoHelper.helpUnFileTDO(
          { gqlClient, options: regularOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(unfileTdo).toBeDefined();
        expect(unfileTdo.id).toEqual(testFolderData.tdoId);

        const fileTdo = await tdoHelper.helpFileTDO(
          { gqlClient, options: regularOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(fileTdo).toBeDefined();
        expect(fileTdo.id).toEqual(testFolderData.tdoId);
      });

      it('A81 - cms User file new TDO should fail', async () => {
        const createTDOResult = tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: regularOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );
        await expect(createTDOResult).rejects.toThrow(/not authorized/);
      });

      it('A82 - Admin unflie and file TDO to folder should success', async () => {
        const unfileTdoResult = await tdoHelper.helpUnFileTDO(
          { gqlClient, options: adminOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(unfileTdoResult).toBeDefined();
        expect(unfileTdoResult.id).toEqual(testFolderData.tdoId);

        const fileTdoResult = await tdoHelper.helpFileTDO(
          { gqlClient, options: adminOptions },
          {
            tdoId: testFolderData.tdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(fileTdoResult).toBeDefined();
        expect(fileTdoResult.id).toEqual(testFolderData.tdoId);
      });

      it('A83 - Admin file new TDO to folder should success', async () => {
        const createTDOResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );
        expect(createTDOResult).toBeDefined();
        expect(createTDOResult.id).toBeDefined();
        const newTdoId = createTDOResult.id;
        testFolderData.newTdoId = newTdoId;

        // file to folder
        const fileTdoResult = await tdoHelper.helpFileTDO(
          { gqlClient, options: adminOptions },
          {
            tdoId: newTdoId,
            folderId: testFolderData.parentFolderId
          }
        );
        expect(fileTdoResult).toBeDefined();
        expect(fileTdoResult.id).toEqual(newTdoId);
      });

      it('A84 - TDO can only be filed to 1 folder', async () => {
        // file to second folder
        const fileTdoResult2 = tdoHelper.helpFileTDO(
          { gqlClient, options: adminOptions },
          {
            tdoId: testFolderData.newTdoId,
            folderId: testFolderData.childFolderId
          }
        );
        await expect(fileTdoResult2).rejects.toThrow(
          /already been filed elsewhere/
        );
      });
    });

    describe('non OLP delete folder', () => {
      it('A85 - Delete folder using not existed, inaccessible folderId should fail', async () => {
        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: uuid.v4(),
            orderIndex: 0
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_found/);
      });

      it('A86 - restricted user can not delete folder', async () => {
        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: restrictedOptions },
          {
            folderId: testFolderData.parentFolderId2,
            orderIndex: 0
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A87 - cms user can not delete admin folder', async () => {
        const createFolderResult = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId
          }
        );
        deleteFolders.push({
          folderId: createFolderResult.id,
          orderIndex: createFolderResult.orderIndex
        });

        expect(createFolderResult).toBeDefined();
        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: regularOptions },
          {
            folderId: createFolderResult.id,
            orderIndex: 0
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A88 - Admin Delete folder using valid folderId should success', async () => {
        // create new folder
        const newFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId2
          }
        );
        expect(newFolder).toBeDefined();
        const newFolderId = _.get(newFolder, 'id');

        const deleteFolderResult = await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: newFolderId,
            orderIndex: newFolder.orderIndex
          }
        );
        expect(deleteFolderResult).toBeDefined();
        expect(deleteFolderResult.id).toEqual(newFolderId);
      });

      xit('A89 - Delete folder using not matched orderIndex, folderId should fail', async () => {
        if (version === 'v2') return; // orderIndex not used in v2

        const newFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId2
          }
        );
        expect(newFolder).toBeDefined();
        deleteFolders.push({
          folderId: newFolder.id,
          orderIndex: newFolder.orderIndex
        });

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: newFolder.id,
            orderIndex: 9999
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(
          /folder order index does not match/
        );
      });

      it('A90 - Delete folder using matched orderIndex, folderId should success', async () => {
        const newFolder = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-folder-${uuid.v4()}`,
            description: 'citest',
            parentId: testFolderData.parentFolderId2
          }
        );
        expect(newFolder).toBeDefined();
        const deleteFolderResult = await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: newFolder.id,
            orderIndex: newFolder.orderIndex
          }
        );
        expect(deleteFolderResult).toBeDefined();
        expect(deleteFolderResult.id).toEqual(newFolder.id);
      });

      it('A91 - V2 delete non-empty folder should fail', async () => {
        if (version !== 'v2') return; // only for v2

        const deleteFolderResult = folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          {
            folderId: testFolderData.parentFolderId,
            orderIndex: 0
          }
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });
    });

    afterAll(async () => {
      // clean up test folder
      if (deleteFolders.length > 0) {
        try {
          await Promise.all(
            deleteFolders.map((folder) =>
              folderHelper.helpDeleteFolder(
                { gqlClient, options: adminOptions },
                {
                  folderId: folder.folderId,
                  orderIndex: folder.orderIndex
                }
              )
            )
          );
        } catch (error) {
          // console.log('Failed to delete test folders', error);
        }
      }
    });
  });
}

function updateToFolderV2() {
  describe('non OLP update toFolder V2', () => {
    it('update to folder V2 should success', async () => {
      await orgHelper.updateOrganization(
        { gqlClient, options: superOptions },
        {
          id: testOrg.id,
          jsondata: {
            features: {
              enableRBACFeature: 'disabled',
              v2FoldersEnabled: 'enabled'
            }
          }
        }
      );

      await orgHelper.updateOrganization(
        { gqlClient, options: superOptions },
        {
          id: testOrg2.id,
          jsondata: {
            features: {
              enableRBACFeature: 'disabled',
              v2FoldersEnabled: 'enabled'
            }
          }
        }
      );

      // verify org updated
      const getOrgResult = await orgHelper.findOrgWithFilter(
        { gqlClient, options: superOptions },
        { id: testOrg.id }
      );
      expect(getOrgResult).toBeDefined();
      expect(
        _.get(getOrgResult, '[0].jsondata.features.v2FoldersEnabled')
      ).toEqual('enabled');

      const getOrg2Result = await orgHelper.findOrgWithFilter(
        { gqlClient, options: superOptions },
        { id: testOrg2.id }
      );
      expect(getOrg2Result).toBeDefined();
      expect(
        _.get(getOrg2Result, '[0].jsondata.features.v2FoldersEnabled')
      ).toEqual('enabled');
    });
  });
}
