import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import { safe } from '../../../src/helpers/commonHelper';
import { RootFolderType } from '../../../src/gql';
import { isEmpty } from 'lodash';

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

const orgOptions = ['v2-nonOLP', 'v2-OLP', 'v1-nonOLP', 'v1-OLP'];

async function shareFolderByTreeObjectId(
  client: GraphqlClient,
  input: {
    treeObjectId: string;
    readOrganizationIds?: number[];
    writeOrganizationIds?: number[];
  },
  headers?: any
) {
  const { treeObjectId, readOrganizationIds, writeOrganizationIds } = input;
  const query = `mutation {
        shareFolder (input: {
          treeObjectId: "${treeObjectId}",
          ${isEmpty(readOrganizationIds) ? '' : `readOrganizationIds: [${readOrganizationIds?.join(',')}],`}
          ${isEmpty(writeOrganizationIds) ? '' : `writeOrganizationIds: [${writeOrganizationIds?.join(',')}],`}
        }) {
          id
          name
          orderIndex
          description
          status
        }
      }`;

  return client.query(query, {}, headers);
}

function getOrgAndUserInput(version = 'v1', isNonOlp = true) {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: isNonOlp ? 'disabled' : 'enabled',
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
        name: `${citestMarker}-admin-user-${version}-${uuidv4()}@localhost`,
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
      }
    ]
  };
}

describe('citest_folder: rbac folder share', () => {
  let superOptions: Record<string, string>;

  beforeAll(async () => {
    const env = helpers.config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superOptions = isolatedSuperadmin.options;
  });

  describe.each(orgOptions)('Folder Share %s', (orgOption) => {
    const version = orgOption.includes('v2') ? 'v2' : 'v1';
    const isNonOlp = orgOption.includes('nonOLP');
    let testSetup: any;
    let testOrg: any, adminOptions: any, regularOptions: any;
    let testFolderData: {
      rootFolderId: any;
      parentFolderId: any;
      tdoId: any;
      childFolderId: any;
    } = {
      rootFolderId: null,
      parentFolderId: null,
      tdoId: null,
      childFolderId: null
    };

    beforeAll(async () => {
      const createOrgAndUserInput = getOrgAndUserInput(version, isNonOlp);
      // org1 setup
      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );
      testOrg = testSetup.org;

      const adminUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('-admin-user-')
      );
      adminOptions = adminUser?.requestOptions;

      const regularUser = (testSetup.listOptions ?? []).find((u: any) =>
        u.userName?.includes('-regular-user-')
      );
      regularOptions = regularUser?.requestOptions;

      // Create root folder for org1
      const rootFolderRes = await gqlClient.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = rootFolderRes?.data?.createRootFolders ?? [];
      expect(rootFolders).toBeDefined();
      testFolderData.rootFolderId = rootFolders[0]?.id;

      // Create parent folder for org1
      const parentFolderRes = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-parent-folder-${orgOption}-${uuidv4()}`,
            description: 'parent folder description',
            parentId: testFolderData.rootFolderId
          }
        },
        adminOptions
      );
      const parentFolder = parentFolderRes?.data?.createFolder;
      expect(parentFolder).toBeDefined();
      testFolderData.parentFolderId = parentFolder?.id;

      // Create TDO in parent folder for org1
      const tdoRes = await gqlClient.sdk.createTDOWithAsset(
        {
          input: {
            name: `${citestMarker}-tdo-${uuidv4()}`,
            ...tdoAssetInput
          }
        },
        adminOptions
      );
      const tdo = tdoRes?.data?.createTDOWithAsset;
      expect(tdo).toBeDefined();
      testFolderData.tdoId = tdo?.id;

      // Create child folder in parent folder for org1
      const childFolderRes = await gqlClient.sdk.createFolder(
        {
          input: {
            name: `${citestMarker}-child-folder-${orgOption}-${uuidv4()}`,
            description: 'child folder description',
            parentId: testFolderData.parentFolderId
          }
        },
        adminOptions
      );
      const childFolder = childFolderRes?.data?.createFolder;
      expect(childFolder).toBeDefined();
      testFolderData.childFolderId = childFolder?.id;
    });

    afterAll(async () => {
      if (testFolderData.tdoId) {
        await safe('delete tdo', () =>
          gqlClient.sdk.deleteTDO({ id: testFolderData.tdoId }, adminOptions)
        );
      }

      if (testFolderData.childFolderId) {
        await safe('delete child folder', () =>
          gqlClient.sdk.deleteFolder(
            { input: { id: testFolderData.childFolderId, orderIndex: 0 } },
            adminOptions
          )
        );
      }

      if (testFolderData.parentFolderId) {
        await safe('delete parent folder', () =>
          gqlClient.sdk.deleteFolder(
            { input: { id: testFolderData.parentFolderId, orderIndex: 0 } },
            adminOptions
          )
        );
      }

      if (testSetup?.listOptions?.length) {
        await safe('delete org1 users', () =>
          Promise.all(
            testSetup.listOptions.map((u: any) =>
              gqlClient.sdk.deleteUser({ id: u.userId }, superOptions)
            )
          )
        );
      }

      if (testOrg?.id) {
        await safe('disable RBAC feature on org1', () =>
          gqlClient.sdk.updateOrganization(
            {
              input: {
                id: testOrg.id,
                metadata: { features: { enableRBACFeature: 'disabled' } }
              }
            },
            superOptions
          )
        );

        await safe('delete org1', () =>
          gqlClient.sdk.updateOrganization(
            { input: { id: testOrg.id, status: 'deleted' } },
            superOptions
          )
        );
      }
    });

    describe.each(orgOptions)(
      `${orgOption} Share folder to %s`,
      (targetOption) => {
        const targetVersion = targetOption.includes('v2') ? 'v2' : 'v1';
        const targetIsNonOlp = targetOption.includes('nonOLP');
        let testSetup2: any;
        let testOrg2: any;
        let adminOrg2Options: any;
        let testFolderShareData: {
          treeObjectId: any;
          newSharedFolderId?: any;
          newTdoId?: any;
          fileTdoId?: any;
        } = {
          treeObjectId: null
        };

        beforeAll(async () => {
          const createOrgAndUserInput2 = getOrgAndUserInput(
            targetVersion,
            targetIsNonOlp
          );
          // org2 setup
          testSetup2 = await setupTestOrgAndUser(
            isolatedSuperadmin.client,
            createOrgAndUserInput2
          );
          testOrg2 = testSetup2.org;

          const adminOrg2 = (testSetup2.listOptions ?? []).find((u: any) =>
            u.userName?.includes('-admin-user-')
          );
          adminOrg2Options = adminOrg2?.requestOptions;
        });

        it(`SFS1 - target org can not access folder`, async () => {
          const getFolderResult = gqlClient.sdk.folder(
            { id: testFolderData.parentFolderId },
            adminOrg2Options
          );
          await expect(getFolderResult).rejects.toThrow(/not_found/);
        });

        it('SFS2 - super admin share folder read permission to target org should success', async () => {
          // get parent folder treeObjectId
          const folderRes = await gqlClient.sdk.folder(
            { id: testFolderData.parentFolderId },
            adminOptions
          );
          expect(folderRes?.data?.folder).toBeDefined();
          expect(folderRes?.data?.folder?.treeObjectId).toBeDefined();
          testFolderShareData.treeObjectId = folderRes?.data?.folder
            ?.treeObjectId as any;

          const shareResult = await shareFolderByTreeObjectId(
            gqlClient,
            {
              treeObjectId: testFolderShareData.treeObjectId,
              readOrganizationIds: [+testOrg2.id]
            },
            superOptions
          );
          expect(shareResult).toBeDefined();

          await helpers.sleep(2000);
        });

        it(`SFS3 - target org can get shared folder`, async () => {
          // Retry: v2DalSwitch may return before the V2 share write commits
          // when the super admin org routes to V1 as primary (V2 is fire-and-forget).
          // The target org reads from V2, so shared_org_read may not be visible yet.
          const maxAttempts = 5;
          let getFolderResult: any;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              getFolderResult = await gqlClient.sdk.folder(
                { id: testFolderData.parentFolderId },
                adminOrg2Options
              );
              break;
            } catch (err) {
              if (attempt === maxAttempts) throw err;
              await helpers.sleep(1000);
            }
          }
          expect(getFolderResult).toBeDefined();
          expect(getFolderResult?.data?.folder).toBeDefined();
          expect(getFolderResult?.data?.folder?.id).toBe(
            testFolderData.parentFolderId
          );
        });

        it.skip('SFS4 - target org can get TDO in shared folder', async () => {
          const getTdoResult = await gqlClient.sdk.temporalDataObject(
            { id: testFolderData.tdoId },
            adminOrg2Options
          );

          expect(getTdoResult?.data?.temporalDataObject).toBeDefined();
          expect(getTdoResult?.data?.temporalDataObject?.id).toBe(
            testFolderData.tdoId
          );
        });

        it.skip('SFS5 - target org can get child folder in shared folder', async () => {
          const getChildFolderResult = await gqlClient.sdk.folder(
            { id: testFolderData.childFolderId },
            adminOrg2Options
          );
          expect(getChildFolderResult?.data?.folder).toBeDefined();
          expect(getChildFolderResult?.data?.folder?.id).toBe(
            testFolderData.childFolderId
          );
        });

        it.skip('SFS6 - target org can get new TDO', async () => {
          const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-new-tdo-in-shared-folder-${uuidv4()}`,
                parentFolderId: testFolderData.parentFolderId,
                ...tdoAssetInput
              }
            },
            adminOptions
          );
          const newTdo = newTdoRes?.data?.createTDOWithAsset;
          expect(newTdo).toBeDefined();

          const getNewTdoRes = await gqlClient.sdk.temporalDataObject(
            { id: newTdo!.id },
            adminOrg2Options
          );
          expect(getNewTdoRes?.data?.temporalDataObject).toBeDefined();
          expect(getNewTdoRes?.data?.temporalDataObject?.id).toBe(newTdo?.id);
        });

        it('SFS7 - target org update shared folder should fail', async () => {
          const updateFolderResult = gqlClient.sdk.updateFolder(
            {
              input: {
                id: testFolderData.parentFolderId,
                name: `${citestMarker}-updated-folder-name-${uuidv4()}`
              }
            },
            adminOrg2Options
          );
          await expect(updateFolderResult).rejects.toThrow(
            /not.*(authorized|found)/
          );
        });

        it('SFS8 - target org create child folder in shared folder should fail', async () => {
          const createChildFolderResult = gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-child-folder-in-shared-folder-${uuidv4()}`,
                description: 'child folder description',
                parentId: testFolderData.parentFolderId
              }
            },
            adminOrg2Options
          );
          await expect(createChildFolderResult).rejects.toThrow(/not_found/);
        });

        it.skip('SFS9 - target org create TDO in shared folder should fail', async () => {
          const createTdoResult = gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-tdo-in-shared-folder-${uuidv4()}`,
                parentFolderId: testFolderData.parentFolderId,
                ...tdoAssetInput
              }
            },
            adminOrg2Options
          );
          await expect(createTdoResult).rejects.toThrow(/not_found/);
        });

        it('SFS10 - target org remove TDO in shared folder should fail', async () => {
          // new TDO
          const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-new-tdo-to-delete-in-shared-folder-${uuidv4()}`,
                parentFolderId: testFolderData.parentFolderId,
                ...tdoAssetInput
              }
            },
            adminOptions
          );
          const newTdo = newTdoRes?.data?.createTDOWithAsset;
          expect(newTdo).toBeDefined();

          const deleteTdoResult = gqlClient.sdk.deleteTDO(
            { id: newTdo!.id },
            adminOrg2Options
          );
          await expect(deleteTdoResult).rejects.toThrow(/not_found/);

          await gqlClient.sdk.deleteTDO({ id: newTdo!.id }, adminOptions);
        });

        it.skip('SFS11 - target org file TDO to shared folder should fail', async () => {
          // new TDO
          const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-new-tdo-to-file-in-shared-folder-${uuidv4()}`,
                ...tdoAssetInput
              }
            },
            adminOrg2Options
          );
          const newTdo = newTdoRes?.data?.createTDOWithAsset;
          expect(newTdo).toBeDefined();
          const newTdoId = newTdo?.id;

          const fileTdoResult = gqlClient.sdk.fileTemporalDataObject(
            {
              input: {
                tdoId: newTdoId!,
                folderId: testFolderData.parentFolderId
              }
            },
            adminOrg2Options
          );
          await expect(fileTdoResult).rejects.toThrow(/not_found/);
        });

        it.skip('SFS12 - target org delete folder should fail', async () => {
          // new folder
          const newFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-new-folder-to-delete-in-shared-folder-${uuidv4()}`,
                description: 'new folder description',
                parentId: testFolderData.parentFolderId
              }
            },
            adminOptions
          );
          const newFolder = newFolderRes?.data?.createFolder;
          expect(newFolder).toBeDefined();
          const orderIndex = newFolder!.orderIndex!;

          const deleteFolderResult = gqlClient.sdk.deleteFolder(
            { input: { id: newFolder!.id, orderIndex } },
            adminOrg2Options
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_found/);

          await gqlClient.sdk.deleteFolder(
            { input: { id: newFolder!.id, orderIndex } },
            adminOptions
          );
        });

        it.skip('SFS13 - target org delete shared folder should fail', async () => {
          // create new folder
          const newFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-new-folder-to-share-${uuidv4()}`,
                description: 'new folder description',
                parentId: testFolderData.rootFolderId
              }
            },
            adminOptions
          );
          const newFolder = newFolderRes?.data?.createFolder;
          expect(newFolder).toBeDefined();
          testFolderShareData.newSharedFolderId = newFolder?.id;

          // share new folder
          // get new folder treeObjectId
          const folderRes = await gqlClient.sdk.folder(
            { id: newFolder!.id },
            adminOptions
          );
          expect(folderRes?.data?.folder).toBeDefined();
          expect(folderRes?.data?.folder?.treeObjectId).toBeDefined();
          const newFolderTreeObjectId = folderRes?.data?.folder?.treeObjectId;

          const shareResult = await shareFolderByTreeObjectId(
            gqlClient,
            {
              treeObjectId: newFolderTreeObjectId as any,
              readOrganizationIds: [+testOrg2.id],
              writeOrganizationIds: [+testOrg2.id]
            },
            adminOptions
          );
          expect(shareResult).toBeDefined();

          const deleteFolderResult = gqlClient.sdk.deleteFolder(
            {
              input: {
                id: testFolderShareData.newSharedFolderId,
                orderIndex: 0
              }
            },
            adminOrg2Options
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
        });

        it('SFS14 - super admin share folder write permission to target org should success', async () => {
          const shareResult = await shareFolderByTreeObjectId(
            gqlClient,
            {
              treeObjectId: testFolderShareData.treeObjectId,
              readOrganizationIds: [+testOrg2.id],
              writeOrganizationIds: [+testOrg2.id]
            },
            superOptions
          );
          expect(shareResult).toBeDefined();
          await helpers.sleep(2000);
        });

        it.skip('SFS15 - target org update shared folder should success', async () => {
          const newFolderName = `${citestMarker}-updated-folder-name-${uuidv4()}`;
          const updateFolderRes = await gqlClient.sdk.updateFolder(
            {
              input: {
                id: testFolderData.parentFolderId,
                name: newFolderName
              }
            },
            adminOrg2Options
          );
          const updateFolder = updateFolderRes?.data?.updateFolder;
          expect(updateFolder).toBeDefined();
          expect(updateFolder?.name).toBe(newFolderName);
        });

        it.skip('SFS16 - target org update child folder in shared folder should success', async () => {
          const newChildFolderName = `${citestMarker}-updated-child-folder-name-${uuidv4()}`;
          const updateChildFolderRes = await gqlClient.sdk.updateFolder(
            {
              input: {
                id: testFolderData.childFolderId,
                name: newChildFolderName
              }
            },
            adminOrg2Options
          );
          const updateChildFolder = updateChildFolderRes?.data?.updateFolder;
          expect(updateChildFolder).toBeDefined();
          expect(updateChildFolder?.name).toBe(newChildFolderName);
        });

        it.skip('SFS17 - target org create child folder in shared folder should success', async () => {
          const createChildFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-child-folder-in-shared-folder-${uuidv4()}`,
                description: 'child folder description',
                parentId: testFolderData.parentFolderId
              }
            },
            adminOrg2Options
          );
          expect(createChildFolderRes?.data?.createFolder).toBeDefined();
        });

        it('SFS18 - target org create TDO in shared folder should success', async () => {
          const createTdoRes = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-tdo-in-shared-folder-${uuidv4()}`,
                parentFolderId: testFolderData.parentFolderId,
                ...tdoAssetInput
              }
            },
            adminOrg2Options
          );
          const createTdo = createTdoRes?.data?.createTDOWithAsset;
          expect(createTdo).toBeDefined();
          expect(createTdo?.id).toBeDefined();
          testFolderShareData.newTdoId = createTdo?.id;
        });

        it('SFS19 - target org remove their TDO in shared folder should success', async () => {
          const deleteTdoRes = await gqlClient.sdk.deleteTDO(
            { id: testFolderShareData.newTdoId },
            adminOrg2Options
          );
          expect(deleteTdoRes?.data?.deleteTDO).toBeDefined();
        });

        it('SFS20 - target org file TDO to shared folder should success', async () => {
          // new TDO
          const newTdoRes = await gqlClient.sdk.createTDOWithAsset(
            {
              input: {
                name: `${citestMarker}-new-tdo-to-file-in-shared-folder-${uuidv4()}`,
                ...tdoAssetInput
              }
            },
            adminOrg2Options
          );
          const newTdo = newTdoRes?.data?.createTDOWithAsset;
          expect(newTdo).toBeDefined();
          testFolderShareData.fileTdoId = newTdo?.id;

          const fileTdoRes = await gqlClient.sdk.fileTemporalDataObject(
            {
              input: {
                tdoId: testFolderShareData.fileTdoId,
                folderId: testFolderData.parentFolderId
              }
            },
            adminOrg2Options
          );
          expect(fileTdoRes?.data?.fileTemporalDataObject).toBeDefined();
        });

        it('SFS21 - target org unfile TDO from shared folder should success', async () => {
          const unfileTdoRes = await gqlClient.sdk.unfileTemporalDataObject(
            {
              input: {
                tdoId: testFolderShareData.fileTdoId,
                folderId: testFolderData.parentFolderId
              }
            },
            adminOrg2Options
          );
          expect(unfileTdoRes?.data?.unfileTemporalDataObject).toBeDefined();
        });

        it('SFS22 - target org delete other TDO in shared folder should fail', async () => {
          const deleteOtherTdoResult = gqlClient.sdk.deleteTDO(
            { id: testFolderData.tdoId },
            adminOrg2Options
          );
          await expect(deleteOtherTdoResult).rejects.toThrow(/not_found/);
        });

        it.skip('SFS23 - target org delete child folder should fail', async () => {
          // new folder
          const newFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-new-folder-to-delete-in-shared-folder-${uuidv4()}`,
                description: 'new folder description',
                parentId: testFolderData.parentFolderId
              }
            },
            adminOptions
          );
          const newFolder = newFolderRes?.data?.createFolder;
          expect(newFolder).toBeDefined();

          const deleteFolderResult = gqlClient.sdk.deleteFolder(
            {
              input: {
                id: newFolder!.id,
                orderIndex: newFolder!.orderIndex!
              }
            },
            adminOrg2Options
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_found/);

          await gqlClient.sdk.deleteFolder(
            {
              input: {
                id: newFolder!.id,
                orderIndex: newFolder!.orderIndex!
              }
            },
            adminOptions
          );
        });

        it.skip('SFS24 - target org delete shared folder should fail', async () => {
          // create new folder
          const newFolderRes = await gqlClient.sdk.createFolder(
            {
              input: {
                name: `${citestMarker}-new-folder-to-share-${uuidv4()}`,
                description: 'new folder description',
                parentId: testFolderData.rootFolderId
              }
            },
            adminOptions
          );
          const newFolder = newFolderRes?.data?.createFolder;
          expect(newFolder).toBeDefined();
          testFolderShareData.newSharedFolderId = newFolder?.id;

          // share new folder
          // get new folder treeObjectId
          const folderRes = await gqlClient.sdk.folder(
            { id: newFolder!.id },
            adminOptions
          );
          expect(folderRes?.data?.folder).toBeDefined();
          expect(folderRes?.data?.folder?.treeObjectId).toBeDefined();
          const newFolderTreeObjectId = folderRes?.data?.folder?.treeObjectId;

          const shareResult = await shareFolderByTreeObjectId(
            gqlClient,
            {
              treeObjectId: newFolderTreeObjectId as any,
              readOrganizationIds: [+testOrg2.id],
              writeOrganizationIds: [+testOrg2.id]
            },
            adminOptions
          );
          expect(shareResult).toBeDefined();

          const deleteFolderResult = gqlClient.sdk.deleteFolder(
            {
              input: {
                id: testFolderShareData.newSharedFolderId,
                orderIndex: 0
              }
            },
            adminOrg2Options
          );
          await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
        });

        afterAll(async () => {
          if (testFolderShareData.fileTdoId) {
            await safe('delete fileTdoId', () =>
              gqlClient.sdk.deleteTDO(
                { id: testFolderShareData.fileTdoId },
                adminOrg2Options
              )
            );
          }

          // delete folder
          if (testFolderShareData.newSharedFolderId) {
            await safe('delete newSharedFolderId', () =>
              gqlClient.sdk.deleteFolder(
                {
                  input: {
                    id: testFolderShareData.newSharedFolderId,
                    orderIndex: 0
                  }
                },
                adminOptions
              )
            );
          }

          if (testSetup2?.listOptions?.length) {
            await safe('delete org2 users', () =>
              Promise.all(
                testSetup2.listOptions.map((u: any) =>
                  gqlClient.sdk.deleteUser({ id: u.userId }, superOptions)
                )
              )
            );
          }

          if (testOrg2?.id) {
            await safe('delete org2', () =>
              gqlClient.sdk.updateOrganization(
                { input: { id: testOrg2.id, status: 'deleted' } },
                superOptions
              )
            );
          }
        });
      }
    );
  });

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});
