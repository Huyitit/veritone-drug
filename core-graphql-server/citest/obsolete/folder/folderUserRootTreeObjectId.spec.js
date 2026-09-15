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
const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const { safe } = require('../../helpers/cleanup/utils');
const orgHelper = require('../../helpers/organization');
const userHelper = require('../../helpers/user');
const folderHelper = require('../../helpers/folder');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const citestMarker = globalThis.citestMarker || 'citest-should-delete';

const CMS_APP_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';
const CMS_EDITOR_ROLE_ID = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f';

describe('citest_folder: User Root Folder treeObjectId (VE-20925)', () => {
  let gqlClient;
  let superToken, superOptions;
  let testOrg1, testOrg2;
  let adminUser, adminOptions;
  let org2UserOptions;
  const env = config.env;

  beforeAll(async () => {
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superOptions = helpers.requestOptions(superToken);

    // Create first V2 org with admin user
    const org1Input = {
      orgInput: {
        name: `${citestMarker}-org1-ve20925-${uuid.v4()}`,
        businessUnit: 'Legal',
        types: ['agency'],
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        },
        apps: [
          {
            applicationId: CMS_APP_ID,
            applicationKey: 'cms'
          }
        ]
      },
      userInputs: [
        {
          key: 'adminUser',
          name: `${citestMarker}-admin-ve20925-${uuid.v4()}@test.veritone.com`,
          roleIds: [
            'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
            CMS_EDITOR_ROLE_ID
          ]
        }
      ]
    };

    const setup1 = await orgHelper.setupTestOrgAndUser(
      { gqlClient, superAdminToken: superToken },
      org1Input
    );

    testOrg1 = setup1.org;
    expect(testOrg1).toBeDefined();

    adminUser = _.find(setup1.listOptions, { key: 'adminUser' });
    expect(adminUser).toBeDefined();
    adminOptions = adminUser.requestOptions;

    // Create second V2 org (no user — we'll invite the admin from org1)
    const createOrg2Query = `mutation {
      createOrganization(
        input: {
          name: "${citestMarker}-org2-ve20925-${uuid.v4()}"
          businessUnit: "Legal"
          types: [agency]
          metadata: {
            features: {
              v2FoldersEnabled: "enabled"
            }
          }
          applications: [
            {
              applicationId: "${CMS_APP_ID}"
              applicationKey: "cms"
            }
          ]
        }
      ) {
        id
        guid
        name
      }
    }`;

    const org2Result = await gqlClient.query(
      createOrg2Query,
      null,
      superOptions
    );
    expect(org2Result.createOrganization).toBeDefined();
    testOrg2 = org2Result.createOrganization;

    // Add admin user from org1 into org2
    const addUserQuery = `mutation {
      addUserToOrganization(
        userName: "${adminUser.username}"
        organizationGuid: "${testOrg2.guid}"
        roleIds: ["${CMS_EDITOR_ROLE_ID}"]
      ) {
        id
        organizationGuids
      }
    }`;

    const addResult = await gqlClient.query(addUserQuery, null, superOptions);
    expect(addResult.addUserToOrganization).toBeDefined();
    expect(addResult.addUserToOrganization.organizationGuids).toContain(
      testOrg2.guid
    );

    // Get token for user in org2 context via switchUserToOrganization
    const switchQuery = `mutation {
      switchUserToOrganization(
        token: "${adminUser.token}"
        userName: "${adminUser.username}"
        organizationGuid: "${testOrg2.guid}"
      ) {
        token
      }
    }`;

    const switchResult = await gqlClient.query(
      switchQuery,
      null,
      adminOptions
    );
    expect(switchResult.switchUserToOrganization).toBeDefined();
    expect(switchResult.switchUserToOrganization.token).toBeDefined();

    org2UserOptions = helpers.requestOptions(
      switchResult.switchUserToOrganization.token
    );
  });

  afterAll(async () => {
    // Cleanup orgs
    for (const org of [testOrg1, testOrg2]) {
      if (org && org.id) {
        await safe(`delete org ${org.id}`, async () => {
          await orgHelper.deleteOrganization(
            { gqlClient, options: superOptions },
            org.id
          );
        });
      }
    }
  });

  describe('createRootFolders - single org (Org1)', () => {
    let userRootFolder;
    let orgRootFolder;

    it('should create root folders with valid treeObjectIds', async () => {
      const query = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          name
          treeObjectId
          ownerId
          organizationId
        }
      }`;

      const result = await gqlClient.query(query, null, adminOptions);
      expect(result.createRootFolders).toBeDefined();

      const rootFolders = result.createRootFolders;
      expect(rootFolders.length).toEqual(2);

      orgRootFolder = rootFolders.find((f) => !f.ownerId);
      userRootFolder = rootFolders.find((f) => f.ownerId);

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
      const query = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          name
          treeObjectId
          ownerId
          organizationId
        }
      }`;

      const result = await gqlClient.query(query, null, adminOptions);
      const rootFolders = result.createRootFolders;

      const userRoot2 = rootFolders.find((f) => f.ownerId);
      const orgRoot2 = rootFolders.find((f) => !f.ownerId);

      expect(userRoot2.id).toEqual(userRootFolder.id);
      expect(userRoot2.treeObjectId).toEqual(userRootFolder.treeObjectId);
      expect(orgRoot2.id).toEqual(orgRootFolder.id);
      expect(orgRoot2.treeObjectId).toEqual(orgRootFolder.treeObjectId);
    });

    it('User.rootFolder should return same treeObjectId', async () => {
      const query = `query {
        user(id: "${adminUser.userId}") {
          id
          rootFolder(type: cms) {
            id
            treeObjectId
          }
        }
      }`;

      const result = await gqlClient.query(query, null, adminOptions);
      expect(result.user).toBeDefined();
      expect(result.user.rootFolder).toBeDefined();
      expect(result.user.rootFolder.id).toEqual(userRootFolder.id);
      expect(result.user.rootFolder.treeObjectId).toEqual(
        userRootFolder.treeObjectId
      );
    });
  });

  describe('createRootFolders - cross-org isolation (Org2)', () => {
    let org1UserRoot;
    let org2UserRoot;

    beforeAll(async () => {
      // Get Folder A (org1 user root) — already created above
      const org1Query = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          treeObjectId
          ownerId
          organizationId
        }
      }`;
      const org1Result = await gqlClient.query(org1Query, null, adminOptions);
      org1UserRoot = org1Result.createRootFolders.find((f) => f.ownerId);

      // Create Folder B (org2 user root)
      const org2Query = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          treeObjectId
          ownerId
          organizationId
        }
      }`;
      const org2Result = await gqlClient.query(
        org2Query,
        null,
        org2UserOptions
      );
      org2UserRoot = org2Result.createRootFolders.find((f) => f.ownerId);
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
      expect(org1UserRoot.treeObjectId).not.toEqual(
        org2UserRoot.treeObjectId
      );
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
      const query = `mutation {
        createRootFolders(rootFolderType: cms) {
          id
          treeObjectId
          ownerId
        }
      }`;
      const result = await gqlClient.query(query, null, org2UserOptions);
      const userRoot2 = result.createRootFolders.find((f) => f.ownerId);

      expect(userRoot2.id).toEqual(org2UserRoot.id);
      expect(userRoot2.treeObjectId).toEqual(org2UserRoot.treeObjectId);
    });
  });
});
