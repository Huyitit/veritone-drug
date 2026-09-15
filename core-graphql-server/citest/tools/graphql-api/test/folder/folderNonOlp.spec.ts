import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import {
  AuthPermissionType,
  EntityTagType,
  OrganizationStatus,
  RootFolderType
} from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
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

let superOrgGuid: any, superOrgId: any;
let testUsers: any;
let superToken: string, superOptions: Record<string, string>, superUserId: any;
let testOrg: any,
  adminUser: any,
  adminUser2: any,
  regularUser: any,
  restrictedUser: any;
let adminOptions: any,
  adminOptions2: any,
  regularOptions: any,
  restrictedOptions: any;
let testOrg2: any, adminOrg2: any, adminOrg2Options: any;
let regularOrg2: any, regularOrg2Options: any;
let testFolderData: any = {};
let apiOptions: any;
let deleteFolders: Array<{ folderId: string; orderIndex: number }> = [];
let generateTagKey: (suffix: string) => string;

async function updateFolderWithEntityTags(
  input: Record<string, any>,
  options: any
): Promise<any> {
  const result: any = await gqlClient.query(
    `mutation updateFolder($input: UpdateFolder) {
      updateFolder(input: $input) {
        id
        name
        description
        status
        orderIndex
        entityTags {
          tagValue
          tagKey
        }
      }
    }`,
    { input },
    options
  );
  return result?.updateFolder;
}

function shareTreeObjectQuery(
  treeObjectId: string,
  readOrganizationIds: any[],
  writeOrganizationIds?: any[]
): string {
  return `mutation {
      shareFolder (input: {
        folderId: "${treeObjectId}",
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

describe('citest_folder: rbac folder non OLP test', () => {
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
      // Reset testFolderData per iteration to prevent state leaks between v1/v2
      deleteFolders = [];
      testFolderData = {};

      // Generate unique tag keys per iteration to avoid entity_tags PK collisions
      const tagPrefixTimestamp = Math.floor(Date.now() / 1000);
      generateTagKey = (suffix: string) =>
        `tagkey_${tagPrefixTimestamp}_${folderVersion}_${suffix}`;

      createOrgAndUserInput = getOrgAndUserInput(folderVersion);
      createSecondOrgAndUserInput = getOrg2AndUserInput(folderVersion);

      // set up org 1
      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      testUsers = testSetup.listOptions ?? [];

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
      const orgRootFolder = rootFolder.find((folder: any) => !folder.ownerId);
      const adminRootFolder = rootFolder.find(
        (folder: any) => folder.ownerId === adminUser.userId
      );
      testFolderData.rootFolderId = orgRootFolder?.id;
      testFolderData.treeObjectId = orgRootFolder?.treeObjectId;
      testFolderData.rootFolderId2 = adminRootFolder?.id;
      testFolderData.treeObjectId2 = adminRootFolder?.treeObjectId;

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
      const org2RootFolder = rootFolder2.find((folder: any) => !folder.ownerId);
      const admin2RootFolder = rootFolder2.find(
        (folder: any) => folder.ownerId === adminOrg2.userId
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

    runTestFolderNonOLP(folderVersion);

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
        await safe('delete testOrg', () =>
          gqlClient.sdk.updateOrganization(
            {
              input: { id: testOrg.id, status: OrganizationStatus.Deleted }
            },
            superOptions
          )
        );
      }

      if (testOrg2?.id) {
        await safe('delete testOrg2', () =>
          gqlClient.sdk.updateOrganization(
            {
              input: { id: testOrg2.id, status: OrganizationStatus.Deleted }
            },
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
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
        }
      },
      applications: [
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationKey: 'cms'
        },
        {
          applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
          applicationKey: 'aiWARE Desktop'
        },
        {
          applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
          applicationKey: 'discovery'
        }
      ]
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
          v2FoldersEnabled: version === 'v2' ? 'enabled' : 'disabled'
        }
      },
      applications: [
        {
          applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
          applicationKey: 'cms'
        },
        {
          applicationId: 'e4739d44-53d2-4153-b55f-5e246fc989b1',
          applicationKey: 'aiWARE Desktop'
        },
        {
          applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
          applicationKey: 'discovery'
        }
      ]
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

function runTestFolderNonOLP(version = 'v1') {
  describe(`Folder ${version} Non OLP Tests`, () => {
    describe('non OLP create folder', () => {
      it('A1 - org admin create folder without folder name should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              description: 'citest',
              parentId: testFolderData.parentFolderId
            } as any
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /name.* was not provided/
        );
      });

      it('A1 - cms user create folder should fail', async () => {
        const folder = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          },
          regularOptions
        );
        await expect(folder).rejects.toThrow(/not authorized/);
      });

      it('A1 - restricted user can not create folder', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          },
          restrictedOptions
        );
        await expect(createFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A2 - org admin create folder without description should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              parentId: testFolderData.parentFolderId
            } as any
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /description.* was not provided/
        );
      });

      it('A3 - org admin create folder with not existed parentId should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: uuidv4()
            }
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow();
      });

      it('A4 - org admin create folder using inaccessible parentId should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderIdOrg2
            }
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /folder.* could not be found/
        );
      });

      it('A5 - org admin create folder with valid parentId should success', async () => {
        const folderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        const folder = folderRes?.data?.createFolder;
        expect(folder).toBeDefined();
        deleteFolders.push({
          folderId: folder!.id,
          orderIndex: folder!.orderIndex!
        });
      });

      it('A6 - create folder with invalid rootFolderType should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.rootFolderId,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /folder.* could not be found/
        );
      });

      it('A7 - create folder with each rootFolderType should success', async () => {
        const rootFolderTypes = [
          RootFolderType.Cms,
          RootFolderType.Watchlist,
          RootFolderType.Collection,
          RootFolderType.Application,
          RootFolderType.Resource
        ];

        for (const rootFolderType of rootFolderTypes) {
          const rootFolderRes = await gqlClient.sdk.createRootFolders(
            { rootFolderType },
            adminOptions
          );
          const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
          expect(rootFolder).toBeDefined();
          expect(rootFolder.length).toBeGreaterThan(0);
          const orgRootFolder = rootFolder.find(
            (folder: any) => !folder.ownerId
          );

          const rootFolderId = orgRootFolder?.id;

          const createdFolderRes = await gqlClient.sdk.createFolderBasic(
            {
              input: {
                name: `${citestMarker}-folder-${uuidv4()}`,
                description: 'citest',
                parentId: rootFolderId!,
                rootFolderType
              }
            },
            adminOptions
          );
          const createdFolder = createdFolderRes?.data?.createFolder;
          expect(createdFolder).toBeDefined();
          testFolderData[`${rootFolderType}CreatedFolderId`] =
            createdFolder?.id;

          deleteFolders.push({
            folderId: createdFolder!.id,
            orderIndex: createdFolder!.orderIndex!
          });
        }
      });

      it('A9 - 2 folder should auto indexed, not have same orderIndex', async () => {
        if (version === 'v2') return;

        const createFolder1Res = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              orderIndex: 0
            }
          },
          adminOptions
        );
        const createFolder1 = createFolder1Res?.data?.createFolder;

        const createFolder2Res = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              orderIndex: 0
            }
          },
          adminOptions
        );
        const createFolder2 = createFolder2Res?.data?.createFolder;

        const listFolderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          adminOptions
        );
        const childFolders = listFolderRes?.data?.folder?.subfolders ?? [];
        expect(childFolders).toBeDefined();
        const folder1 = childFolders.find(
          (f: any) => f.id === createFolder1?.id
        );
        const folder2 = childFolders.find(
          (f: any) => f.id === createFolder2?.id
        );
        expect(folder1).toBeDefined();
        expect(folder2).toBeDefined();
        deleteFolders.push(
          { folderId: folder1!.id, orderIndex: folder1!.orderIndex! },
          { folderId: folder2!.id, orderIndex: folder2!.orderIndex! }
        );
        expect(folder1!.orderIndex).not.toEqual(folder2!.orderIndex);
      });

      it('A12 - api token create folder with not existed userId should fail', async () => {
        const createAPITokenRes = await gqlClient.sdk.apiTokenCreate(
          {
            name: `${citestMarker}-api-token-${uuidv4()}`,
            rights: [
              AuthPermissionType.CmsMediaCreate,
              AuthPermissionType.CmsMediaRead,
              AuthPermissionType.AiwareFolderCreate,
              AuthPermissionType.AiwareFolderDelete,
              AuthPermissionType.AiwareFolderFile,
              AuthPermissionType.AiwareFolderRead,
              AuthPermissionType.AiwareFolderUpdate
            ]
          },
          superOptions
        );

        const createAPIToken = createAPITokenRes?.data?.apiTokenCreate;
        expect(createAPIToken).toBeDefined();
        const apiToken = createAPIToken!.id;
        apiOptions = helpers.requestOptions(apiToken);

        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              userId: uuidv4()
            }
          },
          apiOptions.headers
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      it('A12 - api token create folder with mis-match userId, parentId should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              userId: adminOrg2.userId
            }
          },
          apiOptions.headers
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      it('A13 - api token create folder with valid userId should success', async () => {
        const veritoneRootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          superOptions
        );
        const veritoneRootFolder =
          veritoneRootFolderRes?.data?.createRootFolders ?? [];
        expect(veritoneRootFolder).toBeDefined();
        expect(veritoneRootFolder.length).toBeGreaterThan(0);
        const folder = veritoneRootFolder[0];
        expect(folder).toBeDefined();

        const createFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: folder!.id,
              userId: superUserId
            }
          },
          apiOptions.headers
        );
        expect(createFolderRes?.data?.createFolder).toBeDefined();
      });

      it('A14 - org admin create folder with valid userId should success', async () => {
        const createFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              userId: regularUser.userId
            }
          },
          adminOptions
        );
        const createFolderResult = createFolderRes?.data?.createFolder;
        expect(createFolderResult).toBeDefined();
        deleteFolders.push({
          folderId: createFolderResult!.id,
          orderIndex: createFolderResult!.orderIndex!
        });
      });

      it('A15 - org admin create folder with entityTags: without tagKey should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId,
              entityTags: [
                {
                  entityType: EntityTagType.Folder,
                  entityId: testFolderData.parentFolderId
                }
              ] as any
            }
          },
          adminOptions
        );
        await expect(createFolderResult).rejects.toThrow(
          /tagKey.* was not provided/
        );
      });
    });

    describe('non OLP update folder', () => {
      it('A20 - Update folder using not existed folderId should fail', async () => {
        const updateFolderResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: uuidv4(),
              name: citestMarker + '-updated-folder-name'
            }
          },
          adminOptions
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A21 - Update folder using inaccessible folderId should fail', async () => {
        const updateFolderResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderIdOrg2,
              name: citestMarker + '-updated-folder-name'
            }
          },
          adminOptions
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A22 - Update folder using valid folderId should success', async () => {
        const updateFolderRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderId,
              name: citestMarker + '-updated-folder-name'
            }
          },
          adminOptions
        );
        const updateFolderResult = updateFolderRes?.data?.updateFolder;
        expect(updateFolderResult).toBeDefined();
        expect(updateFolderResult?.name).toEqual(
          citestMarker + '-updated-folder-name'
        );
      });

      it('A23 - Update folder without folder name should fail', async () => {
        const updateFolderResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderId
            } as any
          },
          adminOptions
        );
        await expect(updateFolderResult).rejects.toThrow(
          /name.* was not provided/
        );
      });

      it('A24 - Admin Update folder with folder name should success', async () => {
        const updateFolderRes = await gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderId,
              name: `${citestMarker}-folder1-${uuidv4()}`
            }
          },
          adminOptions
        );
        expect(updateFolderRes?.data?.updateFolder).toBeDefined();
      });

      it('A24 - restricted user can not update folder', async () => {
        const updateFolderResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderId,
              name: `${citestMarker}-folder-${uuidv4()}`
            }
          },
          restrictedOptions
        );
        await expect(updateFolderResult).rejects.toThrow(
          /not.*(found|authorized)/
        );
      });

      it('A25 - Update folder entityTags tagKey', async () => {
        const updateFolderResult = await updateFolderWithEntityTags(
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder2-${uuidv4()}`,
            entityTags: [
              {
                tagKey: generateTagKey('a25')
              }
            ]
          },
          adminOptions
        );
        expect(updateFolderResult).toBeDefined();
      });

      it('A26 - update entityTags without tagKey should fail', async () => {
        const updateFolderResult = updateFolderWithEntityTags(
          {
            id: testFolderData.parentFolderId,
            entityTags: [
              {
                entityType: 'folder',
                entityId: testFolderData.parentFolderId
              }
            ]
          },
          adminOptions
        );
        await expect(updateFolderResult).rejects.toThrow(
          /tagKey.* was not provided/
        );
      });

      it('A27 - Update folder entityTags entityType', async () => {
        const tagKey = generateTagKey('a27');
        const updateFolderResult = await updateFolderWithEntityTags(
          {
            id: testFolderData.parentFolderId,
            name: `${citestMarker}-folder3-${uuidv4()}`,
            entityTags: [
              {
                tagKey,
                entityType: 'schema'
              }
            ]
          },
          adminOptions
        );
        expect(updateFolderResult).toBeDefined();
        expect(updateFolderResult.entityTags).toBeDefined();
        expect(updateFolderResult.entityTags[0].tagKey).toEqual(tagKey);
      });
    });

    describe('non OLP move folder', () => {
      it('A34 - Move folder using not existed folderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: uuidv4(),
              toFolderId: testFolderData.parentFolderId2
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_found/);
      });

      it('A35 - Move inaccessible folderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.parentFolderIdOrg2,
              toFolderId: testFolderData.parentFolderId2
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A36 - Move owned folderId should success', async () => {
        const moveFolderRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              toFolderId: testFolderData.parentFolderId,
              fromFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFolderRes?.data?.moveFolder).toBeDefined();
      });

      it('A37 - Move folder using not existed fromFolderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: uuidv4(),
              toFolderId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A38 - Move folder using inaccessible fromFolderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderIdOrg2,
              toFolderId: testFolderData.parentFolderId2
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A39 - Move folder using not existed toFolderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              toFolderId: uuidv4()
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_(allowed|found)/);
      });

      it('A40 - Move folder using inaccessible toFolderId should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              toFolderId: testFolderData.parentFolderIdOrg2
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A41 - Admin Move folder using valid fromFolderId, toFolderId should success', async () => {
        const moveFolderRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderId,
              toFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFolderRes?.data?.moveFolder).toBeDefined();
      });

      it('A42 - cms user Move folder should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderId,
              toFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          regularOptions
        );
        expect(moveFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A43 - restricted user can not move folder', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderId,
              toFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          restrictedOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A44 - Move folder using valid toFolderId should success', async () => {
        const moveFolderRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              toFolderId: testFolderData.parentFolderId,
              fromFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFolderRes?.data?.moveFolder).toBeDefined();
      });

      it('A45 - Move folder using not match rootFolderType should fail', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              toFolderId: testFolderData.parentFolderId,
              fromFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A46 - Move folder using valid rootFolderType should success', async () => {
        const moveFolderRes = await gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderId,
              toFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFolderRes?.data?.moveFolder).toBeDefined();
      });

      it('A47 - move folder to its own child should fail (loop folder)', async () => {
        const moveFolderResult = gqlClient.sdk.moveFolder(
          {
            input: {
              folderId: testFolderData.childFolderId,
              toFolderId: testFolderData.grandChildFolderId,
              fromFolderId: testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        await expect(moveFolderResult).rejects.toThrow(/resource_conflict/);
      });
    });

    describe('non OLP move multi folders', () => {
      it('A48 - Move folders using not existed, inaccessible folderIds should fail', async () => {
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [uuidv4()],
              newParentFolderId: testFolderData.grandChildFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);

        const moveFoldersResult1 = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.parentFolderIdOrg2],
              newParentFolderId: testFolderData.grandChildFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult1).rejects.toThrow(/not_allowed/);
      });

      it('A49 - Move folders using valid folderIds should success', async () => {
        const moveFoldersResult = await gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFoldersResult.data.moveFolders).toBeDefined();
      });

      it('A50 - Move folders to not existed, inaccessible newParentFolderId should fail', async () => {
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: uuidv4(),
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A51 - Move folders to valid newParentFolderId should success', async () => {
        const moveFoldersResult = await gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFoldersResult.data.moveFolders).toBeDefined();
      });

      it('A52 - Move folder using not match rootFolderType should fail', async () => {
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A53 - cms user Move folder should fail', async () => {
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          regularOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not authorized/);
      });

      it('A54 - Admin Move folder to other parent folder with same rootFolderType should success', async () => {
        const moveFoldersResult = await gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.parentFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        expect(moveFoldersResult.data.moveFolders).toBeDefined();
      });

      it('A55 - Move folder to other parent folder with difference rootFolderType should fail', async () => {
        // create watchlist root folder for org
        const watchlistRootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions
        );
        const watchlistRootFolder =
          watchlistRootFolderRes?.data?.createRootFolders ?? [];
        expect(watchlistRootFolder).toBeDefined();
        expect(watchlistRootFolder.length).toBeGreaterThan(0);
        const rootFolderId = watchlistRootFolder[0]?.id;

        const createWatchlistFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: rootFolderId!,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        const createWatchlistFolder =
          createWatchlistFolderRes?.data?.createFolder;
        expect(createWatchlistFolder).toBeDefined();
        const watchlistFolderId = createWatchlistFolder?.id;
        deleteFolders.push({
          folderId: createWatchlistFolder!.id,
          orderIndex: createWatchlistFolder!.orderIndex!
        });

        // try to move cms folder to watchlist folder
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: watchlistFolderId!,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A56 - move folder to folder of other org should fail', async () => {
        const moveFoldersResult = gqlClient.sdk.moveFolders(
          {
            input: {
              folderIds: [testFolderData.grandChildFolderId],
              newParentFolderId: testFolderData.parentFolderIdOrg2,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        await expect(moveFoldersResult).rejects.toThrow(/not_allowed/);
      });

      it('A57 - move folders into child should fail', async () => {
        // create folder
        const createFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.childFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const createFolderResult = createFolderRes?.data?.createFolder;
        expect(createFolderResult).toBeDefined();
        const newFolderId = createFolderResult?.id;
        deleteFolders.push({
          folderId: createFolderResult!.id,
          orderIndex: createFolderResult!.orderIndex!
        });

        // Retry: moveFolders uses dalFolderV2._validateAccess which queries v2_folder.
        // For V1 orgs, createFolder fires V2 as fire-and-forget — newFolderId may not
        // be in v2_folder yet when moveFolders runs immediately after.
        const maxAttempts = 5;
        let moveFoldersResult: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            moveFoldersResult = await gqlClient.sdk.moveFolders(
              {
                input: {
                  folderIds: [testFolderData.childFolderId],
                  newParentFolderId: newFolderId!,
                  rootFolderType: RootFolderType.Cms
                }
              },
              adminOptions
            );
            break;
          } catch (err) {
            if (attempt === maxAttempts) throw err;
            await helpers.sleep(1000);
          }
        }

        const invalidMove =
          moveFoldersResult?.data?.moveFolders?.invalidFolderIds;
        expect(invalidMove).toBeDefined();
        expect(invalidMove).toContain(testFolderData.childFolderId);
      });
    });

    describe('non OLP share folder', () => {
      it('A58 - Share folder using not existed treeObjectId should fail', async () => {
        const query = shareTreeObjectQuery(uuidv4(), [+testOrg2.id]);
        const resultSuperAdmin = gqlClient.query(query);
        await expect(resultSuperAdmin).rejects.toThrow(/not_found/);

        const resultAdmin = gqlClient.query(query, {}, adminOptions);
        await expect(resultAdmin).rejects.toThrow(/not authorized/);

        const resultRegular = gqlClient.query(query, {}, regularOptions);
        await expect(resultRegular).rejects.toThrow(/not authorized/);
      });

      it('A59 - Share folder using valid treeObjectId should success - only super admin can share folder', async () => {
        const folderTreeObjectRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          superOptions
        );
        const folderTreeObject = folderTreeObjectRes?.data?.folder;
        expect(folderTreeObject).toBeDefined();
        expect(folderTreeObject?.treeObjectId).toBeDefined();
        const folderId = folderTreeObject?.id;
        const query = shareTreeObjectQuery(folderId!, [+testOrg2.id]);
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

        const resultSuperAdmin: any = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });

      it('A60 - Share folder using not existed readOrganizationIds should fail', async () => {
        const query = shareTreeObjectQuery(
          testFolderData.treeObjectId,
          [9999999]
        );

        const resultSuperAdmin = gqlClient.query(query);
        await expect(resultSuperAdmin).rejects.toThrow(/invalid_input/);
      });

      it('A61 - Share folder using valid readOrganizationIds should success', async () => {
        const getParentFolderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          adminOptions
        );
        const getParentFolderResult = getParentFolderRes?.data?.folder;
        expect(getParentFolderResult).toBeDefined();

        testFolderData.parentFolderTreeObjectId =
          getParentFolderResult?.treeObjectId;

        const query = shareTreeObjectQuery(
          testFolderData.parentFolderTreeObjectId,
          [+testOrg2.id]
        );
        const resultSuperAdmin: any = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });

      it('A62 - org admin get sharing folder should success', async () => {
        const getFolderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          adminOptions
        );
        const getFolderResult = getFolderRes?.data?.folder;

        expect(getFolderResult).toBeDefined();
        expect(getFolderResult?.id).toEqual(testFolderData.parentFolderId);
      });

      it('A63 - target org admin get shared folderId should success', async () => {
        const getFolderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          adminOrg2Options
        );
        const getFolderResult = getFolderRes?.data?.folder;
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult?.id).toEqual(testFolderData.parentFolderId);
      });

      it('A64 - target org regular user get shared folderId should success', async () => {
        const getFolderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          regularOrg2Options
        );
        const getFolderResult = getFolderRes?.data?.folder;
        expect(getFolderResult).toBeDefined();
        expect(getFolderResult?.id).toEqual(testFolderData.parentFolderId);
      });

      it('A65 - target org get not shared folder should fail', async () => {
        // create new root folder and folder
        const newRootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const newRootFolder = newRootFolderRes?.data?.createRootFolders ?? [];
        expect(newRootFolder).toBeDefined();
        const newRootFolderId = newRootFolder[0]?.id;
        const newFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: newRootFolderId!
            }
          },
          adminOptions
        );
        const newFolder = newFolderRes?.data?.createFolder;
        expect(newFolder).toBeDefined();
        deleteFolders.push({
          folderId: newFolder!.id,
          orderIndex: newFolder!.orderIndex!
        });

        const getFolderResult = gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId2 },
          adminOrg2Options
        );
        await expect(getFolderResult).rejects.toThrow(/not_found/);
      });

      it('A70 - target org admin update shared folder should fail', async () => {
        const updateFolderResult = gqlClient.sdk.updateFolder(
          {
            input: {
              id: testFolderData.parentFolderId,
              name: citestMarker + '-updated-folder-name'
            }
          },
          adminOrg2Options
        );
        await expect(updateFolderResult).rejects.toThrow(/not_found/);
      });

      it('A71 - target org admin create folder under shared folder should fail', async () => {
        const createFolderResult = gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          },
          adminOrg2Options
        );
        await expect(createFolderResult).rejects.toThrow(/not_found/);
      });

      it('A74 - target org admin remove other content should fail (unfile TDO, watchlist, app)', async () => {
        const deleteTDOResult = gqlClient.sdk.deleteTDO(
          { id: testFolderData.tdoId },
          adminOrg2Options
        );
        await expect(deleteTDOResult).rejects.toThrow(/not_found/);
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

        const resultSuperAdmin: any = await gqlClient.query(query);
        expect(resultSuperAdmin).toBeDefined();
        expect(resultSuperAdmin.shareFolder).toBeDefined();
      });
    });

    describe('non OLP file folder content', () => {
      it('A79 - restricted user can not file, unfile content', async () => {
        const unfileTdoResult = gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          restrictedOptions
        );
        await expect(unfileTdoResult).rejects.toThrow(/not authorized/);

        const fileTdoResult = gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          restrictedOptions
        );
        await expect(fileTdoResult).rejects.toThrow(/not authorized/);
      });

      it('A80 - cms User unFile and file should success', async () => {
        const unfileTdoRes = await gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          regularOptions
        );
        const unfileTdo = unfileTdoRes?.data?.unfileTemporalDataObject;
        expect(unfileTdo).toBeDefined();
        expect(unfileTdo?.id).toEqual(testFolderData.tdoId);

        const fileTdoRes = await gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          regularOptions
        );
        const fileTdo = fileTdoRes?.data?.fileTemporalDataObject;
        expect(fileTdo).toBeDefined();
        expect(fileTdo?.id).toEqual(testFolderData.tdoId);
      });

      it('A81 - cms User file new TDO should fail', async () => {
        const createTDOResult = gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          regularOptions
        );
        await expect(createTDOResult).rejects.toThrow(/not authorized/);
      });

      it('A82 - Admin unflie and file TDO to folder should success', async () => {
        const unfileTdoRes = await gqlClient.sdk.unfileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        const unfileTdoResult = unfileTdoRes?.data?.unfileTemporalDataObject;
        expect(unfileTdoResult).toBeDefined();
        expect(unfileTdoResult?.id).toEqual(testFolderData.tdoId);

        const fileTdoRes = await gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.tdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        const fileTdoResult = fileTdoRes?.data?.fileTemporalDataObject;
        expect(fileTdoResult).toBeDefined();
        expect(fileTdoResult?.id).toEqual(testFolderData.tdoId);
      });

      it('A83 - Admin file new TDO to folder should success', async () => {
        const createTDORes = await gqlClient.sdk.createTDOWithAsset(
          {
            input: {
              name: `${citestMarker}-tdo-${uuidv4()}`,
              ...tdoAssetInput
            }
          },
          adminOptions
        );
        const createTDOResult = createTDORes?.data?.createTDOWithAsset;
        expect(createTDOResult).toBeDefined();
        expect(createTDOResult?.id).toBeDefined();
        const newTdoId = createTDOResult!.id;
        testFolderData.newTdoId = newTdoId;

        // file to folder
        const fileTdoRes = await gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: newTdoId,
              folderId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        const fileTdoResult = fileTdoRes?.data?.fileTemporalDataObject;
        expect(fileTdoResult).toBeDefined();
        expect(fileTdoResult?.id).toEqual(newTdoId);
      });

      it('A84 - TDO can only be filed to 1 folder', async () => {
        // file to second folder
        const fileTdoResult2 = gqlClient.sdk.fileTemporalDataObject(
          {
            input: {
              tdoId: testFolderData.newTdoId,
              folderId: testFolderData.childFolderId
            }
          },
          adminOptions
        );
        await expect(fileTdoResult2).rejects.toThrow(
          /already been filed elsewhere/
        );
      });
    });

    describe('non OLP delete folder', () => {
      it('A85 - Delete folder using not existed, inaccessible folderId should fail', async () => {
        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: { id: uuidv4(), orderIndex: 0 }
          },
          adminOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_found/);
      });

      it('A86 - restricted user can not delete folder', async () => {
        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: { id: testFolderData.parentFolderId2, orderIndex: 0 }
          },
          restrictedOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not authorized/);
      });

      it('A87 - cms user can not delete admin folder', async () => {
        const createFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId
            }
          },
          adminOptions
        );
        const createFolderResult = createFolderRes?.data?.createFolder;
        deleteFolders.push({
          folderId: createFolderResult!.id,
          orderIndex: createFolderResult!.orderIndex!
        });

        expect(createFolderResult).toBeDefined();
        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: { id: createFolderResult!.id, orderIndex: 0 }
          },
          regularOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });

      it('A88 - Admin Delete folder using valid folderId should success', async () => {
        // create new folder
        const newFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId2
            }
          },
          adminOptions
        );
        const newFolder = newFolderRes?.data?.createFolder;
        expect(newFolder).toBeDefined();
        const newFolderId = newFolder?.id;

        const deleteFolderRes = await gqlClient.sdk.deleteFolder(
          {
            input: { id: newFolderId!, orderIndex: newFolder!.orderIndex! }
          },
          adminOptions
        );
        const deleteFolderResult = deleteFolderRes?.data?.deleteFolder;
        expect(deleteFolderResult).toBeDefined();
        expect(deleteFolderResult?.id).toEqual(newFolderId);
      });

      it('A90 - Delete folder using matched orderIndex, folderId should success', async () => {
        const newFolderRes = await gqlClient.sdk.createFolderBasic(
          {
            input: {
              name: `${citestMarker}-folder-${uuidv4()}`,
              description: 'citest',
              parentId: testFolderData.parentFolderId2
            }
          },
          adminOptions
        );
        const newFolder = newFolderRes?.data?.createFolder;
        expect(newFolder).toBeDefined();
        const deleteFolderRes = await gqlClient.sdk.deleteFolder(
          {
            input: { id: newFolder!.id, orderIndex: newFolder!.orderIndex! }
          },
          adminOptions
        );
        const deleteFolderResult = deleteFolderRes?.data?.deleteFolder;
        expect(deleteFolderResult).toBeDefined();
        expect(deleteFolderResult?.id).toEqual(newFolder!.id);
      });

      it('A91 - V2 delete non-empty folder should fail', async () => {
        if (version !== 'v2') return; // only for v2

        const deleteFolderResult = gqlClient.sdk.deleteFolder(
          {
            input: { id: testFolderData.parentFolderId, orderIndex: 0 }
          },
          adminOptions
        );
        await expect(deleteFolderResult).rejects.toThrow(/not_allowed/);
      });
    });

    afterAll(async () => {
      // clean up test folder
      if (deleteFolders.length > 0) {
        await safe('delete test folders', () =>
          Promise.all(
            deleteFolders.map((folder) =>
              gqlClient.sdk.deleteFolder(
                {
                  input: {
                    id: folder.folderId,
                    orderIndex: folder.orderIndex
                  }
                },
                adminOptions
              )
            )
          )
        );
      }
    });
  });
}
