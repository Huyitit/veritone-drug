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

let superOrgGuid: any, superOrgId: any, superUserId: any;
let superToken: string, superOptions: Record<string, string>;
let testFolderData: any = {
  rootFolderId: null,
  treeObjectId: null,
  parentFolderId: null,
  parentFolderId2: null
};

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

describe('citest_folder: folder data conversion test', () => {
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
    // Folder V1: a user has ONE root folder shared across all their organizations —
    // switching org context still surfaces the same folder.
    describe('Folder V1: root folder shared across orgs', () => {
      let orgA: any, orgB: any, userA: any, sharedRootFolderId: any;
      let orgASetup: any, orgBSetup: any;
      let adminOptionsA: Record<string, string>,
        adminOptionsB: Record<string, string>;

      it('setup: create orgA and orgB, both V1', async () => {
        const orgAInput = getOrgAndUserInput('v1', isEnabledOLP);
        orgASetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          orgAInput
        );
        orgA = orgASetup.org;
        expect(orgA).toBeDefined();
        userA = orgASetup.listOptions?.[0];
        adminOptionsA = userA?.requestOptions;

        const orgBInput = getOrgAndUserInput('v1', isEnabledOLP);
        orgBSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          orgBInput
        );
        orgB = orgBSetup.org;
        expect(orgB).toBeDefined();
      });

      it('user creates their root folder in orgA', async () => {
        const createFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsA
        );
        const createFolderResponse = createFolderRes?.data?.createRootFolders;
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse?.find(
          (item: any) => item.ownerId
        );
        expect(userRoot?.id).toBeDefined();

        sharedRootFolderId = userRoot?.id;
      });

      it('same user, added to orgB, sees the same root folder', async () => {
        const addUserRes = await gqlClient.sdk.addUserToOrganization(
          {
            userId: userA.userId,
            organizationGuid: orgB.guid,
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
            ].filter((roleId) => roleId)
          },
          superOptions
        );
        expect(addUserRes?.data?.addUserToOrganization).toBeDefined();

        adminOptionsB = await impersonateUser(userA.userId, orgB.guid);

        const getRootRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsB
        );
        const getRoot = getRootRes?.data?.rootFolders;
        expect(getRoot).toBeDefined();
        const userRoot = getRoot?.find((item: any) => item.ownerId);

        expect(userRoot?.id).toEqual(sharedRootFolderId);
      });

      afterAll(async () => {
        const listUserIds = [
          ...(orgASetup?.listOptions ?? []),
          ...(orgBSetup?.listOptions ?? [])
        ].map((user: any) => user.userId);

        if (listUserIds.length > 0) {
          await safe('delete users', async () => {
            for (const id of listUserIds) {
              await gqlClient.sdk.deleteUser({ id }, superOptions);
            }
          });
        }

        for (const org of [orgA, orgB]) {
          if (org?.id) {
            await safe(`delete organization ${org.id}`, () =>
              gqlClient.sdk.updateOrganization(
                { input: { id: org.id, status: OrganizationStatus.Deleted } },
                superOptions
              )
            );
          }
        }
      });
    });

    // Folder V2: a user has a DIFFERENT root folder per organization — switching org
    // context must not surface another org's folder.
    describe('Folder V2: root folder isolated per org', () => {
      let orgC: any,
        orgD: any,
        userC: any,
        orgCFolderId: any,
        orgDFolderId: any;
      let orgCSetup: any, orgDSetup: any;
      let adminOptionsC: Record<string, string>,
        adminOptionsD: Record<string, string>;

      it('setup: create orgC and orgD, both V2', async () => {
        const orgCInput = getOrgAndUserInput('v2', isEnabledOLP);
        orgCSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          orgCInput
        );
        orgC = orgCSetup.org;
        expect(orgC).toBeDefined();
        userC = orgCSetup.listOptions?.[0];
        adminOptionsC = userC?.requestOptions;

        const orgDInput = getOrgAndUserInput('v2', isEnabledOLP);
        orgDSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          orgDInput
        );
        orgD = orgDSetup.org;
        expect(orgD).toBeDefined();
      });

      it('user creates their root folder in orgC', async () => {
        const createFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsC
        );
        const createFolderResponse = createFolderRes?.data?.createRootFolders;
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse?.find(
          (item: any) => item.ownerId
        );
        expect(userRoot?.id).toBeDefined();

        orgCFolderId = userRoot?.id;
      });

      it('same user, added to orgD, gets a different root folder', async () => {
        const addUserRes = await gqlClient.sdk.addUserToOrganization(
          {
            userId: userC.userId,
            organizationGuid: orgD.guid,
            roleIds: [
              isDesktopAppEnabled
                ? null
                : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // Desktop
              'cf2ed945-176b-4dd9-943e-22fcb1cf684f' // CMS Editor
            ].filter((roleId) => roleId)
          },
          superOptions
        );
        expect(addUserRes?.data?.addUserToOrganization).toBeDefined();

        adminOptionsD = await impersonateUser(userC.userId, orgD.guid);

        const createFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsD
        );
        const createFolderResponse = createFolderRes?.data?.createRootFolders;
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse?.find(
          (item: any) => item.ownerId
        );
        expect(userRoot?.id).toBeDefined();
        expect(userRoot?.id).not.toEqual(orgCFolderId);

        orgDFolderId = userRoot?.id;
      });

      it('orgD context only sees orgD folder, not orgC folder', async () => {
        const getRootRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsD
        );
        const getRoot = getRootRes?.data?.rootFolders ?? [];
        const userRoot = getRoot.find((item: any) => item.ownerId);

        expect(userRoot?.id).toEqual(orgDFolderId);
        expect(getRoot.map((f: any) => f.id)).not.toContain(orgCFolderId);
      });

      it('orgC context still only sees orgC folder, not orgD folder', async () => {
        const getRootRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          adminOptionsC
        );
        const getRoot = getRootRes?.data?.rootFolders ?? [];
        const userRoot = getRoot.find((item: any) => item.ownerId);

        expect(userRoot?.id).toEqual(orgCFolderId);
        expect(getRoot.map((f: any) => f.id)).not.toContain(orgDFolderId);
      });

      afterAll(async () => {
        const listUserIds = [
          ...(orgCSetup?.listOptions ?? []),
          ...(orgDSetup?.listOptions ?? [])
        ].map((user: any) => user.userId);

        if (listUserIds.length > 0) {
          await safe('delete users', async () => {
            for (const id of listUserIds) {
              await gqlClient.sdk.deleteUser({ id }, superOptions);
            }
          });
        }

        for (const org of [orgC, orgD]) {
          if (org?.id) {
            await safe(`delete organization ${org.id}`, () =>
              gqlClient.sdk.updateOrganization(
                { input: { id: org.id, status: OrganizationStatus.Deleted } },
                superOptions
              )
            );
          }
        }
      });
    });

    describe('single org folder conversion', () => {
      let singleOrg: any, singleOrgSetup: any, singleAdminOptions: any;

      it('super admin create org and user V2 folder enabled', async () => {
        const createSingleOrgAndUserInput = getOrgAndUserInput(
          'v2',
          isEnabledOLP
        );

        singleOrgSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          createSingleOrgAndUserInput
        );

        singleOrg = singleOrgSetup.org;
        expect(singleOrg).toBeDefined();
        expect(singleOrg.name).toContain(`${citestMarker}-org`);

        const singleAdmin = singleOrgSetup.listOptions?.[0];
        singleAdminOptions = singleAdmin?.requestOptions;
      });

      it('user create root folder V2', async () => {
        const createFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          singleAdminOptions
        );
        const createFolderResponse = createFolderRes?.data?.createRootFolders;
        expect(createFolderResponse).toBeDefined();
        const userRoot = createFolderResponse?.find(
          (item: any) => item.ownerId
        );
        expect(userRoot?.id).toBeDefined();

        testFolderData.rootFolderId = userRoot?.id;
      });

      it('switch to folder V1', async () => {
        const updateOrgRes = await gqlClient.sdk.updateOrganization(
          {
            input: {
              id: singleOrg.id,
              metadata: {
                features: {
                  v2FoldersEnabled: 'disabled'
                }
              }
            }
          },
          superOptions
        );
        expect(updateOrgRes?.data?.updateOrganization).toBeDefined();
      });

      it('root folder V1 and V2 have same folder id', async () => {
        const getRootRes = await gqlClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Watchlist },
          singleAdminOptions
        );
        const getRoot = getRootRes?.data?.rootFolders;

        expect(getRoot).toBeDefined();
        const userRoot = getRoot?.find((item: any) => item.ownerId);
        expect(userRoot?.id).toBeDefined();
        expect(userRoot?.id).toEqual(testFolderData.rootFolderId);
      });

      afterAll(async () => {
        const listUserIds = (singleOrgSetup?.listOptions ?? []).map(
          (user: any) => user.userId
        );

        if (listUserIds.length > 0) {
          await safe('delete users', async () => {
            for (const id of listUserIds) {
              await gqlClient.sdk.deleteUser({ id }, superOptions);
            }
          });
        }

        if (singleOrg?.id) {
          await safe('delete organization', () =>
            gqlClient.sdk.updateOrganization(
              {
                input: { id: singleOrg.id, status: OrganizationStatus.Deleted }
              },
              superOptions
            )
          );
        }
      });
    });

    describe('root folder name preservation after V1 to V2 switch', () => {
      let testNameOrg: any, testNameOrgSetup: any, testNameAdminOptions: any;
      let rootFolderIdForNameTest: any, rootFolderNameV1: any;

      it('super admin creates org and user with V1 folder enabled', async () => {
        const createTestOrgAndUserInput = getOrgAndUserInput(
          'v1',
          isEnabledOLP
        );

        testNameOrgSetup = await setupTestOrgAndUser(
          isolatedSuperadmin.client,
          createTestOrgAndUserInput
        );

        testNameOrg = testNameOrgSetup.org;
        expect(testNameOrg).toBeDefined();
        expect(testNameOrg.name).toContain(`${citestMarker}-org`);

        const testNameAdmin = testNameOrgSetup.listOptions?.[0];
        testNameAdminOptions = testNameAdmin?.requestOptions;
      });

      it('user creates root folder in V1', async () => {
        const createFolderRes = await gqlClient.sdk.createRootFolders(
          { rootFolderType: RootFolderType.Cms },
          testNameAdminOptions
        );
        const createFolderResponse = createFolderRes?.data?.createRootFolders;
        expect(createFolderResponse).toBeDefined();
        const orgRoot = createFolderResponse?.find(
          (item: any) => !item.ownerId && item.organizationId
        );
        expect(orgRoot).toBeDefined();
        expect(orgRoot?.id).toBeDefined();
        expect(orgRoot?.name).toBeDefined();

        rootFolderIdForNameTest = orgRoot?.id;
        rootFolderNameV1 = orgRoot?.name;
      });

      it('switch from V1 to V2 folders', async () => {
        const updateOrgRes = await gqlClient.sdk.updateOrganization(
          {
            input: {
              id: testNameOrg.id,
              metadata: {
                features: {
                  v2FoldersEnabled: 'enabled'
                }
              }
            }
          },
          superOptions
        );
        expect(updateOrgRes?.data?.updateOrganization).toBeDefined();
      });

      it('root folder name remains the same after V1 to V2 switch', async () => {
        const folderRes = await gqlClient.sdk.folder(
          { id: rootFolderIdForNameTest },
          testNameAdminOptions
        );
        const folderResult = folderRes?.data?.folder;

        expect(folderResult).toBeDefined();
        expect(folderResult?.id).toEqual(rootFolderIdForNameTest);
        expect(folderResult?.name).toBeDefined();
        expect(folderResult?.name).toEqual(rootFolderNameV1);
      });

      afterAll(async () => {
        const listUserIds = (testNameOrgSetup?.listOptions ?? []).map(
          (user: any) => user.userId
        );

        if (listUserIds.length > 0) {
          await safe('delete users', async () => {
            for (const id of listUserIds) {
              await gqlClient.sdk.deleteUser({ id }, superOptions);
            }
          });
        }

        if (testNameOrg?.id) {
          await safe('delete organization', () =>
            gqlClient.sdk.updateOrganization(
              {
                input: {
                  id: testNameOrg.id,
                  status: OrganizationStatus.Deleted
                }
              },
              superOptions
            )
          );
        }
      });
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
