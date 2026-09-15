/* global pending */
const helpers = require('../../helpers/index');
const { safe } = require('../../helpers/cleanup/utils');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const tdoHelper = require('../../helpers/tdo');
const folderHelper = require('../../helpers/folder');
const rbacHelper = require('../../helpers/rbacHelper');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const citestMarker = global.citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = global.enableDefaultDesktopApp ?? true;

let gqlClient;
let testSetup, testSetup2;
const env = config.env;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};

let superToken, superOptions, superUserId, superOrgGuid, superOrgId;
let testOrg, adminUser, regularUser;
let adminOptions, regularOptions;
let testOrg2, adminOrg2, adminOrg2Options;
let testFolderData = {
  rootFolderId: null,
  treeObjectId: null,
  parentFolderId: null,
  tdoId: null
};
const maxRetry = 5;

describe('citest_folder: search folder content', () => {
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
    testSearchTDO(false, folderVersion);
    testSearchTDO(true, folderVersion);
  });
});

function getOrgAndUserInput(isOlp = false, version = 'v1') {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: isOlp ? 'enabled' : 'disabled',
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
          '032218c3-d47e-4287-9d16-7bb867c01266',
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

  return createOrgAndUserInput;
}

function getOrg2AndUserInput(isOlp = false, version = 'v1') {
  const createSecondOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: isOlp ? 'enabled' : 'disabled',
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
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
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

function testSearchTDO(olpEnabled, folderVersion) {
  let createOrgAndUserInput, createSecondOrgAndUserInput;

  describe(`OLP enabled = ${olpEnabled} for folder ${folderVersion}`, () => {
    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput(olpEnabled, folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(
        olpEnabled,
        folderVersion
      );

      // set up org 1
      testSetup = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      expect(testOrg.users).toBeDefined();
      const testUsers = _.get(testOrg, 'users.records');

      // Login for Admin user
      adminUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOptions = adminUser.requestOptions;

      regularUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'regularUser';
      });
      regularOptions = regularUser.requestOptions;

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
    });

    describe(`Folder ${folderVersion} file and search`, () => {
      let searchQuery = '';
      it('create TDO with asset should success', async () => {
        const createTDOResult = await tdoHelper.helpCreateTDOWithAsset(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-tdo-${uuid.v4()}`,
            ...tdoAssetInput
          }
        );
        expect(createTDOResult).toBeDefined();
        testFolderData.newTestTDO = _.get(createTDOResult, 'id');
      });

      xit('search created TDO by Id should success', async () => {
        searchQuery = `query search {
            searchMedia (search: {
              index: [mine, global]
              query: {
                operator: and
                conditions: [
                  {
                    field: "recordingId",
                    operator: "term",
                    value: "${testFolderData.newTestTDO}"
                  }
                ]
              }
            }) {
              jsondata
            }
          } `;

        let data = [];

        let searchTDOResult;
        for (let attempt = 1; attempt <= maxRetry; attempt++) {
          searchTDOResult = await gqlClient.query(
            searchQuery,
            null,
            adminOptions
          );

          data = _.get(searchTDOResult, 'searchMedia.jsondata.results');
          if (data.length > 0) {
            break;
          }
          await helpers.sleep(30000);
        }

        if (data.length === 0) {
          throw new Error(`TDO not found after max retries = ${maxRetry}`);
        }

        expect(data.length).toBeGreaterThan(0);
        expect(_.get(data, '[0].recording.recordingId')).toEqual(
          testFolderData.newTestTDO
        );
      });

      it('file TDO to folder should success', async () => {
        const rootFolder = await folderHelper.helpCreateRootFolder(
          { gqlClient, options: adminOptions },
          { rootFolderType: 'cms' }
        );

        testFolderData.rootFolderId = _.get(rootFolder, '[0].id');

        const newParentFolderId = await folderHelper.helpCreateFolder(
          { gqlClient, options: adminOptions },
          {
            name: `${citestMarker}-parent-folder-${uuid.v4()}`,
            description: 'parent folder description',
            parentId: testFolderData.rootFolderId,
            rootFolderType: 'cms'
          }
        );
        testFolderData.parentFolderId = newParentFolderId.id;

        const folderData = await folderHelper.helpGetFolder(
          { gqlClient, options: adminOptions },
          { id: testFolderData.parentFolderId, treeObjectId: true }
        );
        expect(folderData).toBeDefined();
        testFolderData.treeObjectId = _.get(folderData, 'folder.treeObjectId');

        // Retry: v1Tov2DalSwitch fires the V2 createFolder as fire-and-forget for
        // V1 orgs. fileTDO routes through v2DalSwitch → dalV2Folder.fileFolderItem
        // → _validateFolderId which queries v2_folder; the new folder row may not
        // be committed yet when fileTDO runs immediately after helpGetFolder.
        const maxAttempts = 5;
        let fileTDORes;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            fileTDORes = await tdoHelper.helpFileTDO(
              { gqlClient, options: adminOptions },
              {
                tdoId: testFolderData.newTestTDO,
                folderId: testFolderData.parentFolderId
              }
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }
        expect(fileTDORes).toBeDefined();
      });

      xit('search TDO should include parent folder', async () => {
        searchQuery = `query search {
            searchMedia (search: {
              index: [mine, global]
              query: {
                operator: and
                conditions: [
                  {
                    field: "recordingId",
                    operator: "term",
                    value: "${testFolderData.newTestTDO}"
                  }
                  {
                    field: "parentTreeObjectIds",
                    operator: "term",
                    value: "${testFolderData.treeObjectId}"
                  }
                ]
              }
            }) {
              jsondata
            }
          } `;

        let data = [];

        let searchTDOResult;
        for (let attempt = 1; attempt <= maxRetry; attempt++) {
          searchTDOResult = await gqlClient.query(
            searchQuery,
            null,
            adminOptions
          );

          data = _.get(searchTDOResult, 'searchMedia.jsondata.results');
          if (data.length > 0) {
            break;
          }
          await helpers.sleep(30000);
        }

        if (data.length === 0) {
          throw new Error(`TDO not found after max retries = ${maxRetry}`);
        }

        expect(data.length).toBeGreaterThan(0);
        expect(_.get(data, '[0].recording.recordingId')).toEqual(
          testFolderData.newTestTDO
        );
        expect(
          _.get(data, '[0].recording.parentTreeObjectIds', []).includes(
            testFolderData.treeObjectId
          )
        ).toBe(true);
      });

      it('other org can not search TDO', async () => {
        searchQuery = `query search {
            searchMedia (search: {
              index: [mine, global]
              query: {
                operator: and
                conditions: [
                  {
                    field: "recordingId",
                    operator: "term",
                    value: "${testFolderData.newTestTDO}"
                  }
                ]
              }
            }) {
              jsondata
            }
          } `;

        let data = [];
        let searchTDOResult = await gqlClient.query(
          searchQuery,
          null,
          adminOrg2Options
        );
        data = _.get(searchTDOResult, 'searchMedia.jsondata.results');

        expect(data.length).toEqual(0);
      });

      it('share folder to other org', async () => {
        const shareFolderMutation = shareTreeObjectQuery(
          testFolderData.treeObjectId,
          [testOrg2.id],
          []
        );

        const shareFolderResult = await gqlClient.query(shareFolderMutation);
        expect(shareFolderResult).toBeDefined();
      });

      xit('shared org can search TDO in folder', async () => {
        let data = [];

        let searchTDOResult;
        for (let attempt = 1; attempt <= maxRetry; attempt++) {
          searchTDOResult = await gqlClient.query(
            searchQuery,
            null,
            adminOrg2Options
          );

          data = _.get(searchTDOResult, 'searchMedia.jsondata.results');
          if (data.length > 0) {
            break;
          }
          await helpers.sleep(30000);
        }

        if (data.length === 0) {
          throw new Error(`TDO not found after max retries = ${maxRetry}`);
        }

        expect(data.length).toBeGreaterThan(0);
        expect(_.get(data, '[0].recording.recordingId')).toEqual(
          testFolderData.newTestTDO
        );
        expect(
          _.get(data, '[0].recording.parentTreeObjectIds', []).includes(
            testFolderData.treeObjectId
          )
        ).toBe(true);
      });
    });

    afterAll(async () => {
      // Delete TDO
      if (testFolderData.newTestTDO) {
        await safe('delete TDO', async () => {
          await tdoHelper.helpDeleteTDO(
            { gqlClient, options: adminOptions },
            { id: testFolderData.newTestTDO }
          );
        });
      }

      // Delete folder
      if (testFolderData.parentFolderId) {
        await safe('delete parent folder', async () => {
          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: testFolderData.parentFolderId, orderIndex: 0 }
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
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            testOrg.id
          );
        });
      }

      if (testOrg2.id) {
        await safe('delete testOrg2', async () => {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            testOrg2.id
          );
        });
      }
    });
  });
}
