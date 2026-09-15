import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '../../src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  impersonateUser as impersonateUserHelper,
  safe
} from '../../src/helpers/commonHelper';
import { setupTestOrgAndUser } from '../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';
import { OrganizationStatus, RootFolderType } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
let testSetup: any, testSetup2: any;

let superOrgGuid: any, superOrgId: any, superUserId: any;
let testUsers: any;
let superToken: string, superOptions: Record<string, string>;
let testOrg: any, adminUser: any;
let adminOptions: any, adminOptions2: any;
let testOrg2: any, adminOrg2: any, adminOrg2Options: any;
let testFolderData: any = {
  rootFolderId: null,
  treeObjectId: null,
  rootFolderId2: null,
  treeObjectId2: null,
  parentFolderId: null,
  parentFolderId2: null
};

let createOrgAndUserInput: any, createSecondOrgAndUserInput: any;

async function impersonateUser(
  userId: string,
  organizationGuid: string
): Promise<Record<string, string>> {
  const impersonated = await impersonateUserHelper(
    superToken,
    userId,
    organizationGuid
  );
  return impersonated.requestOptions;
}

describe('citest_folder: multi-org folder test', () => {
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

  describe.each(['disabled', 'enabled'])('Folder OLP %s', (isEnabledOLP) => {
    const listNames: string[] = [];
    const listFolderNameOrg1: string[] = [];
    const listFolderNameOrg2: string[] = [];

    beforeAll(async () => {
      createOrgAndUserInput = getOrgAndUserInput('v2', isEnabledOLP);
      createSecondOrgAndUserInput = getOrgAndUserInput('v2', isEnabledOLP);

      // setup org 1
      testSetup = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createOrgAndUserInput
      );

      testOrg = testSetup.org;
      expect(testOrg).toBeDefined();
      expect(testOrg.name).toContain(`${citestMarker}-org`);
      testUsers = testSetup.listOptions ?? [];

      adminUser = testSetup.listOptions?.[0];
      adminOptions = adminUser?.requestOptions;

      // setup org 2
      testSetup2 = await setupTestOrgAndUser(
        isolatedSuperadmin.client,
        createSecondOrgAndUserInput
      );

      testOrg2 = testSetup2.org;
      expect(testOrg2).toBeDefined();
      expect(testOrg2.name).toContain(`${citestMarker}-org`);
      testUsers = testSetup2.listOptions ?? [];

      adminOrg2 = testSetup2.listOptions?.[0];
      adminOrg2Options = adminOrg2?.requestOptions;
    });

    describe('multi-org root folder', () => {
      it('create root folder in org 1', async () => {
        const rootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions
        );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];

        const userRootFolder = rootFolder.find(
          (f: any) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderId = userRootFolder?.id;
        testFolderData.treeObjectId = userRootFolder?.treeObjectId;
      });

      it('create child folder org 1', async () => {
        const childFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-org1-V2-${uuidv4()}`,
              description: 'child folder org 1',
              parentId: testFolderData.rootFolderId,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        const childFolder = childFolderRes?.data?.createFolder;
        expect(childFolder).toBeDefined();
        expect(childFolder?.id).toBeDefined();
        testFolderData.childFolderId = childFolder?.id;
        listNames.push(childFolder!.name!);
        listFolderNameOrg1.push(childFolder!.name!);
      });

      it('update org1 to V1 folders', async () => {
        const updateOrgRes = await gqlClient.sdk.updateOrganization(
          {
            input: {
              id: testOrg.id,
              metadata: { features: { v2FoldersEnabled: 'disabled' } }
            }
          },
          superOptions
        );
        const updateResult = updateOrgRes?.data?.updateOrganization;
        expect(updateResult?.id).toBeDefined();
        expect(updateResult?.id).toEqual(testOrg.id);
        expect(
          _.get(updateResult, 'jsondata.features.v2FoldersEnabled')
        ).toEqual('disabled');
      });

      it('create rootFolder V1 in org 1', async () => {
        // re login
        adminOptions = await impersonateUser(adminUser.userId, testOrg.guid);

        // create root folder
        const rootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions
        );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];

        const userRootFolder = rootFolder.find(
          (f: any) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderIdV1 = userRootFolder?.id;
        testFolderData.treeObjectIdV1 = userRootFolder?.treeObjectId;
      });

      it('create child folder V1 in org 1 - success', async () => {
        const childFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-org1-V1-${uuidv4()}`,
              description: 'child folder org 1 v1',
              parentId: testFolderData.rootFolderIdV1,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions
        );
        const childFolder = childFolderRes?.data?.createFolder;
        expect(childFolder).toBeDefined();
        expect(childFolder?.id).toBeDefined();
        testFolderData.childFolderId2 = childFolder?.id;
        listNames.push(childFolder!.name!);
        listFolderNameOrg1.push(childFolder!.name!);
      });

      it('add user org1 to org 2', async () => {
        const addUserRes = await gqlClient.sdk.addUserToOrganization(
          {
            userId: adminUser.userId,
            organizationGuid: testOrg2.guid,
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266'
            ].filter((roleId) => roleId)
          },
          superOptions
        );
        const addUserResult = addUserRes?.data?.addUserToOrganization;
        expect(addUserResult).toBeDefined();
        expect(addUserResult?.id).toEqual(adminUser.userId);
        expect(addUserResult?.organizationGuids).toContain(testOrg2.guid);
      });

      it('login and create root folder in org 2', async () => {
        // login
        adminOptions2 = await impersonateUser(adminUser.userId, testOrg2.guid);

        const rootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions2
        );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
        const userRootFolder = rootFolder.find(
          (f: any) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderId2 = userRootFolder?.id;
        testFolderData.treeObjectId2 = userRootFolder?.treeObjectId;
      });

      it('update org2 to V1 folders', async () => {
        const updateOrgRes = await gqlClient.sdk.updateOrganization(
          {
            input: {
              id: testOrg2.id,
              metadata: { features: { v2FoldersEnabled: 'disabled' } }
            }
          },
          superOptions
        );
        const updateResult = updateOrgRes?.data?.updateOrganization;
        expect(updateResult?.id).toBeDefined();
        expect(updateResult?.id).toEqual(testOrg2.id);
        expect(
          _.get(updateResult, 'jsondata.features.v2FoldersEnabled')
        ).toEqual('disabled');
      });

      it('create child folder V1 in org 2 - success', async () => {
        // re login
        adminOptions2 = await impersonateUser(adminUser.userId, testOrg2.guid);

        const rootRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions2
        );
        const root = rootRes?.data?.rootFolders ?? [];
        expect(root).toBeDefined();
        expect(root.length).toBeGreaterThan(0);

        // create root folder
        const rootFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptions2
        );
        const rootFolder = rootFolderRes?.data?.createRootFolders ?? [];
        const userRootFolder = rootFolder.find(
          (f: any) => f.ownerId === adminUser.userId
        );
        expect(userRootFolder).toBeDefined();
        testFolderData.rootFolderIdOrg2V1 = userRootFolder?.id;
        testFolderData.treeObjectIdOrg2V1 = userRootFolder?.treeObjectId;

        // create child folder
        const childFolderRes = await gqlClient.sdk.createFolder(
          {
            input: {
              name: `${citestMarker}-child-org2-V1-${uuidv4()}`,
              description: 'child folder org 2 v1',
              parentId: testFolderData.rootFolderIdOrg2V1,
              rootFolderType: RootFolderType.Watchlist
            }
          },
          adminOptions2
        );
        const childFolder = childFolderRes?.data?.createFolder;
        expect(childFolder).toBeDefined();
        expect(childFolder?.id).toBeDefined();
        testFolderData.childFolderIdOrg2 = childFolder?.id;
        listNames.push(childFolder!.name!);
        listFolderNameOrg2.push(childFolder!.name!);
      });

      describe('verify root folder content between V1 and V2', () => {
        it('get root folder in org 2 V1', async () => {
          const rootFoldersRes = await gqlClient.sdk.rootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            adminOptions2
          );
          const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f: any) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder?.id).toEqual(testFolderData.rootFolderIdOrg2V1);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          )?.map((f: any) => f.name);

          // in V1 root folder belong to user and store all child folders of the user across org
          expect(childFolderNames).toEqual(expect.arrayContaining(listNames));
        });

        it('switch org2 back to V2', async () => {
          const updateOrgRes = await gqlClient.sdk.updateOrganization(
            {
              input: {
                id: testOrg2.id,
                metadata: { features: { v2FoldersEnabled: 'enabled' } }
              }
            },
            superOptions
          );
          const updateResult = updateOrgRes?.data?.updateOrganization;
          expect(updateResult?.id).toBeDefined();
          expect(updateResult?.id).toEqual(testOrg2.id);
          expect(
            _.get(updateResult, 'jsondata.features.v2FoldersEnabled')
          ).toEqual('enabled');
        });

        it('get root folder org2 V2', async () => {
          // re login
          adminOptions2 = await impersonateUser(
            adminUser.userId,
            testOrg2.guid
          );

          const rootFoldersRes = await gqlClient.sdk.rootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            adminOptions2
          );
          const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f: any) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder?.id).toEqual(testFolderData.rootFolderId2);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          )?.map((f: any) => f.name);
          // in V2 root folder belong to org and store child folders of the org
          expect(childFolderNames).toEqual(
            expect.arrayContaining(listFolderNameOrg2)
          );
        });

        it('get root folder in org 1 V1', async () => {
          const rootFoldersRes = await gqlClient.sdk.rootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            adminOptions
          );
          const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f: any) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder?.id).toEqual(testFolderData.rootFolderIdV1);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          )?.map((f: any) => f.name);

          // in V1 root folder belong to user and store all child folders of the user across org
          expect(childFolderNames).toEqual(expect.arrayContaining(listNames));
        });

        it('switch org1 back to V2', async () => {
          const updateOrgRes = await gqlClient.sdk.updateOrganization(
            {
              input: {
                id: testOrg.id,
                metadata: { features: { v2FoldersEnabled: 'enabled' } }
              }
            },
            superOptions
          );
          const updateResult = updateOrgRes?.data?.updateOrganization;
          expect(updateResult?.id).toBeDefined();
          expect(updateResult?.id).toEqual(testOrg.id);
          expect(
            _.get(updateResult, 'jsondata.features.v2FoldersEnabled')
          ).toEqual('enabled');
        });

        it('get root folder org1 V2', async () => {
          // re login
          adminOptions = await impersonateUser(adminUser.userId, testOrg.guid);

          const rootFoldersRes = await gqlClient.sdk.rootFolders(
            { rootFolderType: RootFolderType.Watchlist },
            adminOptions
          );
          const rootFolders = rootFoldersRes?.data?.rootFolders ?? [];

          expect(rootFolders).toBeDefined();
          expect(rootFolders.length).toBeGreaterThan(1);
          const userRootFolder = rootFolders.find(
            (f: any) => f.ownerId === adminUser.userId
          );
          expect(userRootFolder).toBeDefined();
          expect(userRootFolder?.id).toEqual(testFolderData.rootFolderId);
          const childFolderNames = _.get(
            userRootFolder,
            'childFolders.records'
          )?.map((f: any) => f.name);
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
        await safe('delete childFolderId', () =>
          gqlClient.sdk.deleteFolder(
            {
              input: { id: testFolderData.childFolderId, orderIndex: 0 }
            },
            adminOptions
          )
        );
      }

      if (testFolderData.childFolderId2) {
        await safe('delete childFolderId2', () =>
          gqlClient.sdk.deleteFolder(
            {
              input: { id: testFolderData.childFolderId2, orderIndex: 0 }
            },
            adminOptions
          )
        );
      }

      if (testFolderData.childFolderIdOrg2) {
        await safe('delete childFolderIdOrg2', () =>
          gqlClient.sdk.deleteFolder(
            {
              input: { id: testFolderData.childFolderIdOrg2, orderIndex: 0 }
            },
            adminOptions2
          )
        );
      }

      // Delete users
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

      // Delete organizations
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

  afterAll(async () => {
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });
});

function getOrgAndUserInput(version = 'v1', enableRBAC = 'disabled') {
  const email = `thoang2+citest-${uuidv4()}@veritone.com`;
  return {
    orgInput: {
      name: `${citestMarker}-org-folder-rbac-${version}-${uuidv4()}`,
      businessUnit: 'Legal',
      types: ['agency', 'broadcaster'],
      metadata: {
        features: {
          enableRBACFeature: enableRBAC,
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
        name: email,
        email: email,
        password: 'testPassword',
        roleIds: [
          isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
          '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
          'cf2ed945-176b-4dd9-943e-22fcb1cf684f', // CMS Editor
          '3577dfc6-f441-41f9-8dab-ef9079530450' // Discovery Editor
        ].filter((roleId) => roleId)
      }
    ]
  };
}
