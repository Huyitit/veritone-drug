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

let superOrgGuid, superOrgId, superUserId;
let superToken, superOptions;

const tdoAssetInput = {
  assetType: 'vtn-standard',
  uri: 'https://vtn-core-api-test.s3-us-west-2.amazonaws.com/movie.mp4',
  contentType: 'application',
  startDateTime: '2025-01-22T11:30:26.945Z'
};
const orgOptions = ['v2-nonOLP', 'v2-OLP', 'v1-nonOLP', 'v1-OLP'];

describe('citest_folder: rbac folder share', () => {
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

  describe.each(orgOptions)('Folder Share %s', (orgOption) => {
    let testSetup;
    const version = orgOption.includes('v2') ? 'v2' : 'v1';
    const isNonOlp = orgOption.includes('nonOLP');
    let testOrg, adminUser, regularUser;
    let adminOptions, regularOptions;
    let testFolderData = {
      rootFolderId: null,
      parentFolderId: null,
      tdoId: null,
      childFolderId: null
    };
    beforeAll(async () => {
      const createOrgAndUserInput = getOrgAndUserInput(version, isNonOlp);
      // org1 setup
      testSetup = await orgHelper.setupTestOrgAndUser(
        { gqlClient, superAdminToken: superToken },
        createOrgAndUserInput
      );
      testOrg = testSetup.org;

      // Login for Admin user
      adminUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'adminUser';
      });
      adminOptions = adminUser.requestOptions;

      // Login for Regular user
      regularUser = _.find(testSetup.listOptions, (user) => {
        return user.key === 'regularUser';
      });
      regularOptions = regularUser.requestOptions;

      // Create root folder for org1
      const rootFolderResult = await folderHelper.helpCreateRootFolder(
        { gqlClient, options: adminOptions },
        { rootFolderType: 'cms' }
      );
      expect(rootFolderResult).toBeDefined();
      testFolderData.rootFolderId = rootFolderResult[0].id;

      // Create parent folder for org1
      const parentFolderResult = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-parent-folder-${orgOption}-${uuid.v4()}`,
          description: 'parent folder description',
          parentId: testFolderData.rootFolderId
        }
      );
      expect(parentFolderResult).toBeDefined();
      testFolderData.parentFolderId = parentFolderResult.id;

      // Create TDO in parent folder for org1
      const tdoResult = await tdoHelper.helpCreateTDOWithAsset(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-tdo-${uuid.v4()}`,
          ...tdoAssetInput
        }
      );
      expect(tdoResult).toBeDefined();
      testFolderData.tdoId = tdoResult.id;

      // Create child folder in parent folder for org1
      const childFolderResult = await folderHelper.helpCreateFolder(
        { gqlClient, options: adminOptions },
        {
          name: `${citestMarker}-child-folder-${orgOption}-${uuid.v4()}`,
          description: 'child folder description',
          parentId: testFolderData.parentFolderId
        }
      );
      expect(childFolderResult).toBeDefined();
      testFolderData.childFolderId = childFolderResult.id;
    });

    afterAll(async () => {
      if (testFolderData.tdoId) {
        await tdoHelper.helpDeleteTDO(
          { gqlClient, options: adminOptions },
          { id: testFolderData.tdoId }
        );
      }

      if (testFolderData.childFolderId) {
        await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          { folderId: testFolderData.childFolderId, orderIndex: 0 }
        );
      }

      if (testFolderData.parentFolderId) {
        await folderHelper.helpDeleteFolder(
          { gqlClient, options: adminOptions },
          { folderId: testFolderData.parentFolderId, orderIndex: 0 }
        );
      }

      if (testSetup?.listOptions?.length) {
        const listUserIds = testSetup.listOptions.map((u) => u.userId);
        await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
      }

      if (testOrg?.id) {
        await orgHelper.updateOrganization(
          { gqlClient, options: superOptions },
          {
            id: testOrg.id,
            jsondata: {
              features: {
                enableRBACFeature: 'disabled'
              }
            }
          }
        );

        await orgHelper.deleteOrganization(
          { gqlClient, options: superOptions },
          testOrg.id
        );
      }
    });

    describe.each(orgOptions)(
      `${orgOption} Share folder to %s`,
      (targetOption) => {
        const targetVersion = targetOption.includes('v2') ? 'v2' : 'v1';
        const targetIsNonOlp = targetOption.includes('nonOLP');
        let testSetup2;
        let testOrg2, adminOrg2, regularUserOrg2, restrictedUserOrg2;
        let adminOrg2Options;
        let regularOrg2Options, restrictedOrg2Options;
        let testFolderShareData = {
          treeObjectId: null
        };

        beforeAll(async () => {
          const createOrgAndUserInput2 = getOrgAndUserInput(
            targetVersion,
            targetIsNonOlp
          );
          // org2 setup
          testSetup2 = await orgHelper.setupTestOrgAndUser(
            { gqlClient, superAdminToken: superToken },
            createOrgAndUserInput2
          );
          testOrg2 = testSetup2.org;

          // Login for Admin user of org2
          adminOrg2 = _.find(testSetup2.listOptions, (user) => {
            return user.key === 'adminUser';
          });
          adminOrg2Options = adminOrg2.requestOptions;

          // Login for Regular user of org2
          regularUserOrg2 = _.find(testSetup2.listOptions, (user) => {
            return user.key === 'regularUser';
          });
          regularOrg2Options = regularUserOrg2.requestOptions;
        });

        it(`SFS1 - target org can not access folder`, async () => {
          const getFolderResult = folderHelper.helpGetFolder(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderData.parentFolderId }
          );
          await expect(getFolderResult).rejects.toThrow(/not_found/);
        });

        it('SFS2 - super admin share folder read permission to target org should success', async () => {
          // get parent folder treeObjectId
          const folderTreeObject = await folderHelper.helpGetFolder(
            { gqlClient, options: adminOptions },
            { id: testFolderData.parentFolderId, treeObjectId: true }
          );
          expect(folderTreeObject).toBeDefined();
          expect(folderTreeObject.folder.treeObjectId).toBeDefined();
          testFolderShareData.treeObjectId =
            folderTreeObject.folder.treeObjectId;
          const query = shareTreeObjectQuery(testFolderShareData.treeObjectId, [
            +testOrg2.id
          ]);

          const shareResult = await gqlClient.query(query);
          expect(shareResult).toBeDefined();

          await helpers.sleep(2000);
        });

        it(`SFS3 - target org can get shared folder`, async () => {
          // Retry: v2DalSwitch may return before the V2 share write commits
          // when the super admin org routes to V1 as primary (V2 is fire-and-forget).
          // The target org reads from V2, so shared_org_read may not be visible yet.
          const maxAttempts = 5;
          let getFolderResult;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              getFolderResult = await folderHelper.helpGetFolder(
                { gqlClient, options: adminOrg2Options },
                { id: testFolderData.parentFolderId }
              );
              break;
            } catch (err) {
              if (attempt === maxAttempts) throw err;
              await helpers.sleep(1000);
            }
          }
          expect(getFolderResult).toBeDefined();
          expect(getFolderResult.folder).toBeDefined();
          expect(getFolderResult.folder.id).toBe(testFolderData.parentFolderId);
        });

        xit('SFS4 - target org can get TDO in shared folder', async () => {
          const getTdoResult = await tdoHelper.helpGetTDO(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderData.tdoId }
          );

          expect(getTdoResult).toBeDefined();
          expect(getTdoResult.id).toBe(testFolderData.tdoId);
        });

        xit('SFS5 - target org can get child folder in shared folder', async () => {
          const getChildFolderResult = await folderHelper.helpGetFolder(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderData.childFolderId }
          );
          expect(getChildFolderResult).toBeDefined();
          expect(getChildFolderResult.folder).toBeDefined();
          expect(getChildFolderResult.folder.id).toBe(
            testFolderData.childFolderId
          );
        });

        xit('SFS6 - target org can get new TDO', async () => {
          const newTdoResult = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-tdo-in-shared-folder-${uuid.v4()}`,
              parentFolderId: testFolderData.parentFolderId,
              ...tdoAssetInput
            }
          );
          expect(newTdoResult).toBeDefined();

          const getNewTdoResult = await tdoHelper.helpGetTDO(
            { gqlClient, options: adminOrg2Options },
            { id: newTdoResult.id }
          );
          expect(getNewTdoResult).toBeDefined();
          expect(getNewTdoResult.id).toBe(newTdoResult.id);
        });

        it('SFS7 - target org update shared folder should fail', async () => {
          const updateFolderResult = folderHelper.helpUpdateFolder(
            { gqlClient, options: adminOrg2Options },
            {
              id: testFolderData.parentFolderId,
              name: `${citestMarker}-updated-folder-name-${uuid.v4()}`
            }
          );
          await expect(updateFolderResult).rejects.toThrow(
            /not.*(authorized|found)/
          );
        });

        it('SFS8 - target org create child folder in shared folder should fail', async () => {
          const createChildFolderResult = folderHelper.helpCreateFolder(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-child-folder-in-shared-folder-${uuid.v4()}`,
              description: 'child folder description',
              parentId: testFolderData.parentFolderId
            }
          );
          await expect(createChildFolderResult).rejects.toThrow(/not_found/);
        });

        xit('SFS9 - target org create TDO in shared folder should fail', async () => {
          const createTdoResult = tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-tdo-in-shared-folder-${uuid.v4()}`,
              parentFolderId: testFolderData.parentFolderId,
              ...tdoAssetInput
            }
          );
          await expect(createTdoResult).rejects.toThrow(/not_found/);
        });

        it('SFS10 - target org remove TDO in shared folder should fail', async () => {
          // new TDO
          const newTdoResult = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-tdo-to-delete-in-shared-folder-${uuid.v4()}`,
              parentFolderId: testFolderData.parentFolderId,
              ...tdoAssetInput
            }
          );
          expect(newTdoResult).toBeDefined();

          const deleteTdoResult = tdoHelper.helpDeleteTDO(
            { gqlClient, options: adminOrg2Options },
            { id: newTdoResult.id }
          );
          await expect(deleteTdoResult).rejects.toThrow(/not_found/);

          await tdoHelper.helpDeleteTDO(
            { gqlClient, options: adminOptions },
            { id: newTdoResult.id }
          );
        });

        xit('SFS11 - target org file TDO to shared folder should fail', async () => {
          // new TDO
          const newTdoResult = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-new-tdo-to-file-in-shared-folder-${uuid.v4()}`,
              ...tdoAssetInput
            }
          );
          expect(newTdoResult).toBeDefined();
          const newTdoId = newTdoResult.id;

          const fileTdoResult = tdoHelper.helpFileTDO(
            { gqlClient, options: adminOrg2Options },
            { tdoId: newTdoId, folderId: testFolderData.parentFolderId }
          );
          await expect(fileTdoResult).rejects.toThrow(/not_found/);
        });

        xit('SFS12 - target org delete folder should fail', async () => {
          // new folder
          const newFolderResult = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-folder-to-delete-in-shared-folder-${uuid.v4()}`,
              description: 'new folder description',
              parentId: testFolderData.parentFolderId
            }
          );
          expect(newFolderResult).toBeDefined();
          const orderIndex = newFolderResult.orderIndex;

          const deleteFolderResult = folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOrg2Options },
            { folderId: newFolderResult.id, orderIndex }
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_found/);

          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            { folderId: newFolderResult.id, orderIndex }
          );
        });

        xit('SFS13 - target org delete shared folder should fail', async () => {
          // create new folder
          const newFolderResult = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-folder-to-share-${uuid.v4()}`,
              description: 'new folder description',
              parentId: testFolderData.rootFolderId
            }
          );
          expect(newFolderResult).toBeDefined();
          testFolderShareData.newSharedFolderId = newFolderResult.id;

          // share new folder
          // get new folder treeObjectId
          const folderTreeObject = await folderHelper.helpGetFolder(
            { gqlClient, options: adminOptions },
            { id: newFolderResult.id, treeObjectId: true }
          );
          expect(folderTreeObject).toBeDefined();
          expect(folderTreeObject.folder.treeObjectId).toBeDefined();
          const newFolderTreeObjectId = folderTreeObject.folder.treeObjectId;
          const query = shareTreeObjectQuery(
            newFolderTreeObjectId,
            [+testOrg2.id],
            [+testOrg2.id]
          );

          const shareResult = await gqlClient.query(query);
          expect(shareResult).toBeDefined();
          const deleteFolderResult = folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOrg2Options },
            { folderId: testFolderShareData.newSharedFolderId, orderIndex: 0 }
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
        });

        it('SFS14 - super admin share folder write permission to target org should success', async () => {
          const query = shareTreeObjectQuery(
            testFolderShareData.treeObjectId,
            [+testOrg2.id],
            [+testOrg2.id]
          );

          const shareResult = await gqlClient.query(query);
          expect(shareResult).toBeDefined();
          await helpers.sleep(2000);
        });

        xit('SFS15 - target org update shared folder should success', async () => {
          const newFolderName = `${citestMarker}-updated-folder-name-${uuid.v4()}`;
          const updateFolderResult = await folderHelper.helpUpdateFolder(
            { gqlClient, options: adminOrg2Options },
            {
              id: testFolderData.parentFolderId,
              name: newFolderName
            }
          );
          expect(updateFolderResult).toBeDefined();
          expect(updateFolderResult.name).toBe(newFolderName);
        });

        xit('SFS16 - target org update child folder in shared folder should success', async () => {
          const newChildFolderName = `${citestMarker}-updated-child-folder-name-${uuid.v4()}`;
          const updateChildFolderResult = await folderHelper.helpUpdateFolder(
            { gqlClient, options: adminOrg2Options },
            {
              id: testFolderData.childFolderId,
              name: newChildFolderName
            }
          );
          expect(updateChildFolderResult).toBeDefined();
          expect(updateChildFolderResult.name).toBe(newChildFolderName);
        });

        xit('SFS17 - target org create child folder in shared folder should success', async () => {
          const createChildFolderResult = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-child-folder-in-shared-folder-${uuid.v4()}`,
              description: 'child folder description',
              parentId: testFolderData.parentFolderId
            }
          );
          expect(createChildFolderResult).toBeDefined();
        });

        it('SFS18 - target org create TDO in shared folder should success', async () => {
          const createTdoResult = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-tdo-in-shared-folder-${uuid.v4()}`,
              parentFolderId: testFolderData.parentFolderId,
              ...tdoAssetInput
            }
          );
          expect(createTdoResult).toBeDefined();
          expect(createTdoResult.id).toBeDefined();
          testFolderShareData.newTdoId = createTdoResult.id;
        });

        it('SFS19 - target org remove their TDO in shared folder should success', async () => {
          const deleteTdoResult = await tdoHelper.helpDeleteTDO(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderShareData.newTdoId }
          );
          expect(deleteTdoResult).toBeDefined();
        });

        it('SFS20 - target org file TDO to shared folder should success', async () => {
          // new TDO
          const newTdoResult = await tdoHelper.helpCreateTDOWithAsset(
            { gqlClient, options: adminOrg2Options },
            {
              name: `${citestMarker}-new-tdo-to-file-in-shared-folder-${uuid.v4()}`,
              ...tdoAssetInput
            }
          );
          expect(newTdoResult).toBeDefined();
          const newTdoId = newTdoResult.id;
          testFolderShareData.fileTdoId = newTdoId;

          const fileTdoResult = await tdoHelper.helpFileTDO(
            { gqlClient, options: adminOrg2Options },
            {
              tdoId: testFolderShareData.fileTdoId,
              folderId: testFolderData.parentFolderId
            }
          );
          expect(fileTdoResult).toBeDefined();
        });

        it('SFS21 - target org unfile TDO from shared folder should success', async () => {
          const unfileTdoResult = await tdoHelper.helpUnFileTDO(
            { gqlClient, options: adminOrg2Options },
            {
              tdoId: testFolderShareData.fileTdoId,
              folderId: testFolderData.parentFolderId
            }
          );
          expect(unfileTdoResult).toBeDefined();
        });

        it('SFS22 - target org delete other TDO in shared folder should fail', async () => {
          const deleteOtherTdoResult = tdoHelper.helpDeleteTDO(
            { gqlClient, options: adminOrg2Options },
            { id: testFolderData.tdoId }
          );
          await expect(deleteOtherTdoResult).rejects.toThrow(/not_found/);
        });

        xit('SFS23 - target org delete child folder should fail', async () => {
          // new folder
          const newFolderResult = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-folder-to-delete-in-shared-folder-${uuid.v4()}`,
              description: 'new folder description',
              parentId: testFolderData.parentFolderId
            }
          );
          expect(newFolderResult).toBeDefined();

          const deleteFolderResult = folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOrg2Options },
            {
              folderId: newFolderResult.id,
              orderIndex: newFolderResult.orderIndex
            }
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_found/);

          await folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOptions },
            {
              folderId: newFolderResult.id,
              orderIndex: newFolderResult.orderIndex
            }
          );
        });

        xit('SFS24 - target org delete shared folder should fail', async () => {
          // create new folder
          const newFolderResult = await folderHelper.helpCreateFolder(
            { gqlClient, options: adminOptions },
            {
              name: `${citestMarker}-new-folder-to-share-${uuid.v4()}`,
              description: 'new folder description',
              parentId: testFolderData.rootFolderId
            }
          );
          expect(newFolderResult).toBeDefined();
          testFolderShareData.newSharedFolderId = newFolderResult.id;

          // share new folder
          // get new folder treeObjectId
          const folderTreeObject = await folderHelper.helpGetFolder(
            { gqlClient, options: adminOptions },
            { id: newFolderResult.id, treeObjectId: true }
          );
          expect(folderTreeObject).toBeDefined();
          expect(folderTreeObject.folder.treeObjectId).toBeDefined();
          const newFolderTreeObjectId = folderTreeObject.folder.treeObjectId;
          const query = shareTreeObjectQuery(
            newFolderTreeObjectId,
            [+testOrg2.id],
            [+testOrg2.id]
          );

          const shareResult = await gqlClient.query(query);
          expect(shareResult).toBeDefined();

          const deleteFolderResult = folderHelper.helpDeleteFolder(
            { gqlClient, options: adminOrg2Options },
            { folderId: testFolderShareData.newSharedFolderId, orderIndex: 0 }
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
        });

        afterAll(async () => {
          if (testFolderShareData.fileTdoId) {
            await tdoHelper.helpDeleteTDO(
              { gqlClient, options: adminOrg2Options },
              { id: testFolderShareData.fileTdoId }
            );
          }
          // delete folder
          if (testFolderShareData.newSharedFolderId) {
            await folderHelper.helpDeleteFolder(
              { gqlClient, options: adminOptions },
              { folderId: testFolderShareData.newSharedFolderId, orderIndex: 0 }
            );
          }

          if (!_.isEmpty(testSetup2.listOptions)) {
            const listUserIds = testSetup2.listOptions.map(
              (user) => user.userId
            );
            await userHelper.deleteMultiUser({ gqlClient }, listUserIds);
          }

          if (testOrg2.id) {
            await orgHelper.deleteOrganization(
              { gqlClient, options: superOptions },
              testOrg2.id
            );
          }
        });
      }
    );
  });
});

function getOrgAndUserInput(version = 'v1', isNonOlp = true) {
  const createOrgAndUserInput = {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuid.v4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      kvp: {
        features: {
          enableRBACFeature: isNonOlp ? 'disabled' : 'enabled',
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

  return createOrgAndUserInput;
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
