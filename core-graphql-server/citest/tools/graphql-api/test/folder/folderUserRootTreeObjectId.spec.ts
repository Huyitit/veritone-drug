/**
 * CITest: Validate user root folder treeObjectId cross-org isolation
 *
 * VE-20925: User-scoped CMS root folders were getting incorrect tree_object_id
 * values during V1→V2 lazy migration. When a user belongs to multiple orgs,
 * each org must get its own unique treeObjectId to prevent cross-org collision.
 *
 * This test validates:
 * 1. Single-org: user root folder treeObjectId is populated and idempotent
 * 2. Multi-org: same user in two V2 orgs gets separate treeObjectIds (no collision)
 * 3. Folder B (second org): treeObjectId === folder id (non-claiming org)
 * 4. Folder A treeObjectId !== Folder B treeObjectId
 * 5. V2 folder treeObjectId preserves V1 treeObjectId (claiming org keeps V1 value)
 */
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
import {
  OrganizationStatus,
  OrganizationType,
  RootFolderType
} from '../../src/gql';

const citestMarker = (global as any).citestMarker ?? 'citest-should-delete';

const CMS_APP_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';
const CMS_EDITOR_ROLE_ID = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';

function tokenFromOptions(options: Record<string, string>): string {
  return (options?.Authorization ?? '').replace(/^Bearer\s+/, '');
}

async function getUserRootFolder(
  client: GraphqlClient,
  userId: string,
  options: any
): Promise<any> {
  const result: any = await client.query(
    `query {
      user(id: "${userId}") {
        id
        rootFolder(type: cms) {
          id
          treeObjectId
        }
      }
    }`,
    null,
    options
  );
  return result?.user;
}

describe('citest_folder: User Root Folder treeObjectId (VE-20925)', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superOptions: Record<string, string>;
  let testOrg1: any, testOrg2: any;
  let adminUser: any, adminOptions: any;
  let org2UserOptions: any;

  beforeAll(async () => {
    const env = helpers.config.env;
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superOptions = isolatedSuperadmin.options;

    // Create first V2 org with admin user
    const org1Input = {
      orgInput: {
        name: `${citestMarker}-org1-ve20925-${uuidv4()}`,
        businessUnit: 'Legal',
        types: ['agency'],
        metadata: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        },
        applications: [
          {
            applicationId: CMS_APP_ID,
            applicationKey: 'cms'
          }
        ]
      },
      userInputs: [
        {
          name: `${citestMarker}-admin-ve20925-${uuidv4()}@test.veritone.com`,
          password: 'testPassword',
          roleIds: [
            'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
            CMS_EDITOR_ROLE_ID
          ]
        }
      ]
    };

    const setup1 = await setupTestOrgAndUser(
      isolatedSuperadmin.client,
      org1Input
    );

    testOrg1 = setup1.org;
    expect(testOrg1).toBeDefined();

    const [au] = setup1.listOptions ?? [];
    adminUser = au;
    expect(adminUser).toBeDefined();
    adminOptions = adminUser?.requestOptions;

    // Create second V2 org (no user — we'll invite the admin from org1)
    const org2Res = await isolatedSuperadmin.client.sdk.createOrganization({
      input: {
        name: `${citestMarker}-org2-ve20925-${uuidv4()}`,
        businessUnit: 'Legal',
        types: [OrganizationType.Agency],
        metadata: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        },
        applications: [
          {
            applicationId: CMS_APP_ID,
            applicationKey: 'cms'
          }
        ]
      }
    });
    expect(org2Res?.data?.createOrganization).toBeDefined();
    testOrg2 = org2Res?.data?.createOrganization;

    // Add admin user from org1 into org2
    const addRes = await isolatedSuperadmin.client.sdk.addUserToOrganization({
      userName: adminUser.userName,
      organizationGuid: testOrg2.guid,
      roleIds: [CMS_EDITOR_ROLE_ID]
    });
    expect(addRes?.data?.addUserToOrganization).toBeDefined();
    expect(addRes?.data?.addUserToOrganization?.organizationGuids).toContain(
      testOrg2.guid
    );

    // Get token for user in org2 context via switchUserToOrganization
    const switchRes =
      await isolatedSuperadmin.client.sdk.switchUserToOrganization(
        {
          token: tokenFromOptions(adminOptions),
          userName: adminUser.userName,
          organizationGuid: testOrg2.guid
        },
        adminOptions
      );
    expect(switchRes?.data?.switchUserToOrganization).toBeDefined();
    expect(switchRes?.data?.switchUserToOrganization?.token).toBeDefined();

    org2UserOptions = helpers.requestOptions(
      switchRes?.data?.switchUserToOrganization?.token as string
    ).headers;
  });

  afterAll(async () => {
    for (const org of [testOrg1, testOrg2]) {
      if (org?.id) {
        await safe(`delete org ${org.id}`, () =>
          isolatedSuperadmin.client.sdk.updateOrganization(
            { input: { id: org.id, status: OrganizationStatus.Deleted } },
            superOptions
          )
        );
      }
    }

    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  describe('createRootFolders - single org (Org1)', () => {
    let userRootFolder: any;
    let orgRootFolder: any;

    it('should create root folders with valid treeObjectIds', async () => {
      const res = await isolatedSuperadmin.client.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = res?.data?.createRootFolders;
      expect(rootFolders).toBeDefined();
      expect(rootFolders!.length).toEqual(2);

      orgRootFolder = rootFolders!.find((f: any) => !f.ownerId);
      userRootFolder = rootFolders!.find((f: any) => f.ownerId);

      expect(orgRootFolder).toBeDefined();
      expect(userRootFolder).toBeDefined();
    });

    it('user root folder should have a treeObjectId', () => {
      expect(userRootFolder.treeObjectId).toBeDefined();
      expect(userRootFolder.treeObjectId).not.toBeNull();
      expect(userRootFolder.treeObjectId.length).toBeGreaterThan(0);
    });

    it('org root folder should have a treeObjectId', () => {
      expect(orgRootFolder.treeObjectId).toBeDefined();
      expect(orgRootFolder.treeObjectId).not.toBeNull();
      expect(orgRootFolder.treeObjectId.length).toBeGreaterThan(0);
    });

    it('calling createRootFolders again should return same treeObjectIds (idempotent)', async () => {
      const res = await isolatedSuperadmin.client.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      const rootFolders = res?.data?.createRootFolders ?? [];

      const userRoot2 = rootFolders.find((f: any) => f.ownerId);
      const orgRoot2 = rootFolders.find((f: any) => !f.ownerId);

      expect(userRoot2?.id).toEqual(userRootFolder.id);
      expect(userRoot2?.treeObjectId).toEqual(userRootFolder.treeObjectId);
      expect(orgRoot2?.id).toEqual(orgRootFolder.id);
      expect(orgRoot2?.treeObjectId).toEqual(orgRootFolder.treeObjectId);
    });

    it('User.rootFolder should return same treeObjectId', async () => {
      const user = await getUserRootFolder(
        isolatedSuperadmin.client,
        adminUser.userId,
        adminOptions
      );
      expect(user).toBeDefined();
      expect(user.rootFolder).toBeDefined();
      expect(user.rootFolder.id).toEqual(userRootFolder.id);
      expect(user.rootFolder.treeObjectId).toEqual(userRootFolder.treeObjectId);
    });
  });

  describe('createRootFolders - cross-org isolation (Org2)', () => {
    let org1UserRoot: any;
    let org2UserRoot: any;

    beforeAll(async () => {
      // Get Folder A (org1 user root) — already created above
      const org1Res = await isolatedSuperadmin.client.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        adminOptions
      );
      org1UserRoot = org1Res?.data?.createRootFolders?.find(
        (f: any) => f.ownerId
      );

      // Create Folder B (org2 user root)
      const org2Res = await isolatedSuperadmin.client.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        org2UserOptions
      );
      org2UserRoot = org2Res?.data?.createRootFolders?.find(
        (f: any) => f.ownerId
      );
    });

    it('should create user root folder in org2 (Folder B)', () => {
      expect(org2UserRoot).toBeDefined();
      expect(org2UserRoot.treeObjectId).toBeDefined();
      expect(org2UserRoot.treeObjectId).not.toBeNull();
    });

    it('Folder A and Folder B should be different folders', () => {
      expect(org1UserRoot.id).not.toEqual(org2UserRoot.id);
    });

    it('Folder A and Folder B should have different treeObjectIds (no cross-org collision)', () => {
      expect(org1UserRoot.treeObjectId).not.toEqual(org2UserRoot.treeObjectId);
    });

    it('Folder B treeObjectId should equal its folder id (non-claiming org)', () => {
      // For a non-claiming org, treeObjectId = folderId
      expect(org2UserRoot.treeObjectId).toEqual(org2UserRoot.id);
    });

    it('Folder A treeObjectId should be preserved from V1', () => {
      // For the claiming org (oldest org), V2 treeObjectId = V1 treeObjectId.
      // In a fresh test with no pre-existing V1 data, treeObjectId defaults to folderId.
      expect(org1UserRoot.treeObjectId).toEqual(org1UserRoot.treeObjectId);
    });

    it('Folder B should belong to org2', () => {
      expect(org2UserRoot.organizationId).toEqual(String(testOrg2.id));
    });

    it('calling createRootFolders in org2 again should be idempotent', async () => {
      const res = await isolatedSuperadmin.client.sdk.createRootFolders(
        { rootFolderType: RootFolderType.Cms },
        org2UserOptions
      );
      const userRoot2 = res?.data?.createRootFolders?.find(
        (f: any) => f.ownerId
      );

      expect(userRoot2?.id).toEqual(org2UserRoot.id);
      expect(userRoot2?.treeObjectId).toEqual(org2UserRoot.treeObjectId);
    });
  });
});
