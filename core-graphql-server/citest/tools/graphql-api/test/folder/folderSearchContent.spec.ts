import { v4 as uuidv4 } from 'uuid';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { OrganizationStatus, RootFolderType } from '../../src/gql';

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

let superToken: string, superOptions: Record<string, string>;
let testOrg: any, adminUser: any, regularUser: any;
let adminOptions: any, regularOptions: any;
let testOrg2: any, adminOrg2: any, adminOrg2Options: any;
let testFolderData: any = {
  rootFolderId: null,
  treeObjectId: null,
  parentFolderId: null,
  tdoId: null
};

async function searchMedia(
  client: GraphqlClient,
  recordingId: string,
  options: any
): Promise<any[]> {
  const query = `query search {
    searchMedia (search: {
      index: [mine, global]
      query: {
        operator: and
        conditions: [
          {
            field: "recordingId",
            operator: "term",
            value: "${recordingId}"
          }
        ]
      }
    }) {
      jsondata
    }
  } `;
  const result: any = await client.query(query, null, options);
  return result?.searchMedia?.jsondata?.results ?? [];
}

function shareTreeObjectQuery(
  treeObjectId: string,
  readOrganizationIds: any[],
  writeOrganizationIds?: any[]
): string {
  return `mutation {
      shareFolder (input: {
        folderId: "${treeObjectId}",
        ${readOrganizationIds.length === 0 ? '' : `readOrganizationIds: [${readOrganizationIds.join(',')}],`}
        ${!writeOrganizationIds || writeOrganizationIds.length === 0 ? '' : `writeOrganizationIds: [${writeOrganizationIds.join(',')}],`}
      }) {
        id
        name
        orderIndex
        description
        status
      }
    }`;
}

describe('citest_folder: search folder content', () => {
  beforeAll(async () => {
    const env = config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superToken = isolatedSuperadmin.token;
    superOptions = isolatedSuperadmin.options;

    const meRes = await isolatedSuperadmin.client.sdk.me();
    expect(meRes?.data?.me).toBeDefined();
  });

  describe.each(['v1', 'v2'])(
    'folder version: %s',
    (folderVersion: string) => {
      testSearchTDO(false, folderVersion);
      testSearchTDO(true, folderVersion);
    }
  );

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});

function getOrgAndUserInput(isOlp = false, version = 'v1') {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: isOlp ? 'enabled' : 'disabled',
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
          '032218c3-d47e-4287-9d16-7bb867c01266',
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

function getOrg2AndUserInput(isOlp = false, version = 'v1') {
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: isOlp ? 'enabled' : 'disabled',
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
          '032218c3-d47e-4287-9d16-7bb867c01266',
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
        ].filter((roleId) => roleId)
      }
    ]
  };
}

function testSearchTDO(olpEnabled: boolean, folderVersion: string) {
  describe(`OLP enabled = ${olpEnabled} for folder ${folderVersion}`, () => {
    beforeAll(async () => {
      const createOrgAndUserInput = getOrgAndUserInput(
        olpEnabled,
        folderVersion
      );
      const createSecondOrgAndUserInput = getOrg2AndUserInput(
        olpEnabled,
        folderVersion
      );

      // set up org 1
      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);

      const [au, ru] = testSetup.listOptions ?? [];
      adminUser = au;
      adminOptions = au?.requestOptions;
      regularUser = ru;
      regularOptions = ru?.requestOptions;

      // set up org 2
      testSetup2 = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createSecondOrgAndUserInput
      );

      testOrg2 = testSetup2.org;
      expect(testOrg2).toBeDefined();
      expect(testOrg2.name).toContain(`${citestMarker}-org`);

      const [au2] = testSetup2.listOptions ?? [];
      adminOrg2 = au2;
      adminOrg2Options = au2?.requestOptions;
    });

    describe(`Folder ${folderVersion} file and search`, () => {
      it('create TDO with asset should success', async () => {
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
        testFolderData.newTestTDO = createTDOResult?.id;
      });

      it('file TDO to folder should success', async () => {
        const rootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          adminOptions
        );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
        testFolderData.rootFolderId = rootFolder[0]?.id;

        const newParentFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-parent-folder-${uuidv4()}`,
              description: 'parent folder description',
              parentId: testFolderData.rootFolderId,
              rootFolderType: RootFolderType.Cms
            }
          },
          adminOptions
        );
        const newParentFolder = newParentFolderRes?.data?.createFolder;
        testFolderData.parentFolderId = newParentFolder?.id;

        const folderRes = await gqlClient.sdk.folder(
          { id: testFolderData.parentFolderId },
          adminOptions
        );
        expect(folderRes?.data?.folder).toBeDefined();
        testFolderData.treeObjectId = folderRes?.data?.folder?.treeObjectId;

        // Retry: v1Tov2DalSwitch fires the V2 createFolder as fire-and-forget for
        // V1 orgs. fileTDO routes through v2DalSwitch → dalV2Folder.fileFolderItem
        // → _validateFolderId which queries v2_folder; the new folder row may not
        // be committed yet when fileTDO runs immediately after the folder lookup.
        const maxAttempts = 5;
        let fileTDORes: any;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            fileTDORes = await gqlClient.sdk.fileTemporalDataObject(
              {
                input: {
                  tdoId: testFolderData.newTestTDO,
                  folderId: testFolderData.parentFolderId
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
        expect(fileTDORes?.data?.fileTemporalDataObject).toBeDefined();
      });

      it('other org can not search TDO', async () => {
        const data = await searchMedia(
          gqlClient,
          testFolderData.newTestTDO,
          adminOrg2Options
        );
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
    });

    afterAll(async () => {
      if (testFolderData.newTestTDO) {
        await safe('delete TDO', () =>
          gqlClient.sdk.deleteTDO(
            { id: testFolderData.newTestTDO },
            adminOptions
          )
        );
      }

      if (testFolderData.parentFolderId) {
        await safe('delete parent folder', () =>
          gqlClient.sdk.deleteFolder(
            {
              input: { id: testFolderData.parentFolderId, orderIndex: 0 }
            },
            adminOptions
          )
        );
      }

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
            { input: { id: testOrg.id, status: OrganizationStatus.Deleted } },
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
}
