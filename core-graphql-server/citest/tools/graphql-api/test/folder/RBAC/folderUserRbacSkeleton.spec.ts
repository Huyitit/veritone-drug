import { v4 as uuidv4 } from 'uuid';
import * as _ from 'lodash';

import { helpers } from '@api/src/helpers';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import {
  impersonateUser as impersonateUserHelper,
  safe
} from '@api/src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '@api/test/helpers/superadminSession';
import { setupTestOrgAndUser } from '@api/test/helpers/organization.helper';
import {
  AuthResourceType,
  RootFolderType
} from '@api/src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

// Input payload to bootstrap test org and user hierarchy for RBAC testing
const createOrgAndUserInput = {
  name: `${citestMarker}-org-${uuidv4()}`,
  users: [
    {
      name: `${citestMarker}-admin-user-${uuidv4()}`,
      roles: ['Organization Admin']
    },
    {
      name: `${citestMarker}-regular-user-${uuidv4()}`,
      roles: ['Standard User']
    }
  ]
};

describe('citest_folder: rbac user skeleton', () => {
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superClient: GraphqlClient;
  let superUserId: string;

  let testSetup: any;
  let testOrg: any;
  let useRBACFeature: boolean;

  let adminUser: any, adminOptions: Record<string, string> | undefined;
  let regularUser: any, regularOptions: Record<string, string> | undefined;

  /**
   * Helper utility to switch request user context by impersonating target user ID.
   * Returns requestOptions headers (containing target user's auth token).
   */
  async function impersonateUser(
    userId: string,
    organizationGuid: string
  ): Promise<Record<string, string>> {
    const impersonated = await impersonateUserHelper(
      isolatedSuperadmin.token,
      userId,
      organizationGuid
    );
    return impersonated.requestOptions;
  }

  // =========================================================================
  // SUITE SETUP & TEARDOWN
  // =========================================================================

  beforeAll(async () => {
    const env = config.env;

    // 1. Initialize GraphQL Client with SESSION_TOKEN auth
    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    // 2. Create isolated superadmin session to avoid environment pollution
    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    superClient = isolatedSuperadmin.client;

    // 3. Introspection query to verify if backend RBAC feature is enabled
    const introspectionRes: any = await superClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);
    useRBACFeature = _.has(introspectionRes, '__type.name');

    // 4. Verify superadmin identity using SDK meBasic query
    const meRes = await superClient.sdk.meBasic();
    expect(meRes.data.me).toBeDefined();
    superUserId = meRes.data.me?.id ?? '';

    // Input payload to bootstrap test org and user hierarchy for RBAC testing
    const createOrgAndUserInput = {
      orgInput: `${citestMarker}-org-${uuidv4()}`,
      userInputs: [
        {
          name: `${citestMarker}-admin-user-${uuidv4()}`,
          roles: ['Organization Admin']
        },
        {
          name: `${citestMarker}-regular-user-${uuidv4()}`,
          roles: ['Standard User']
        }
      ]
    };
    // 5. Bootstrap test organization and users
    testSetup = await setupTestOrgAndUser(superClient, createOrgAndUserInput);
    testOrg = testSetup.org;

    // 6. Extract user options for context swapping in tests
    const listOptions = testSetup.listOptions ?? [];
    const findUser = (marker: string) =>
      listOptions.find((u: any) => u.userName?.includes(marker));

    adminUser = findUser('-admin-user-');
    adminOptions = adminUser?.requestOptions;

    regularUser = findUser('-regular-user-');
    regularOptions = regularUser?.requestOptions;
  });

  afterAll(async () => {
    // Teardown: delete test users created during setup
    if (testSetup?.listOptions?.length) {
      await safe('delete users', async () => {
        for (const user of testSetup.listOptions) {
          await superClient.sdk.deleteUser({ id: user.userId });
        }
      });
    }

    // Teardown: delete test organization
    if (testOrg?.id) {
      await safe('delete organization', () =>
        helpers.deleteOrganization(
          superClient.authUrl,
          testOrg.id,
          isolatedSuperadmin.token
        )
      );
    }

    // Teardown: clean up isolated superadmin
    await safe('cleanup isolated superadmin', () =>
      isolatedSuperadmin.cleanup()
    );
  });

  // =========================================================================
  // SECTION 1: OBJECT OPERATIONS (Folder & TDO CRUD)
  // =========================================================================

  describe('Object operations', () => {
    describe('with Regular user', () => {
      let cmsRootFolderId: string;
      let newFolderId: string;
      let newTDOId: string;

      beforeAll(async () => {
        // Verify regular user session token context
        const res = await superClient.sdk.meBasic({}, regularOptions);
        expect(res.data.me?.name).toContain(`${citestMarker}-regular-user`);
      });

      /**
       * TEST CASE 1: Fetch CMS Root Folder
       * SDK Method: superClient.sdk.rootFolders({ rootFolderType: RootFolderType.Cms }, regularOptions)
       */
      it('should get cms root folder', async () => {
        if (!useRBACFeature) {
          pending('useRBACFeature = false');
        }

        // TODO QA: Use superClient.sdk.rootFolders to query CMS root folder under regularOptions context
        const rootFoldersRes = await superClient.sdk.rootFolders(
          { rootFolderType: RootFolderType.Cms },
          regularOptions
        );

        const rootFolders = rootFoldersRes.data.rootFolders ?? [];
        expect(rootFolders.length).toBeGreaterThan(0);
        expect(rootFolders[0]?.name).toContain('cms');
        cmsRootFolderId = rootFolders[0]?.id ?? '';
      });

      /**
       * TEST CASE 2: Create Child Folder under Root Folder
       * SDK Method: superClient.sdk.createFolder({ input: { name, description, parentId, rootFolderType } }, regularOptions)
       */
      it('should create three nested folders', async () => {
        if(!useRBACFeature){
          pending('useRBACFeature = false');
        }

        
      })

      // it('should create folder', async () => {
      //   if (!useRBACFeature) {
      //     pending('useRBACFeature = false');
      //   }

      //   // TODO QA: Use superClient.sdk.createFolder to create a new folder under cmsRootFolderId
      //   const createFolderRes = await superClient.sdk.createFolder(
      //     {
      //       input: {
      //         name: `${citestMarker}-folder-${uuidv4()}`,
      //         description: 'test folder for rbac created by regular user',
      //         parentId: cmsRootFolderId,
      //         rootFolderType: RootFolderType.Cms
      //       }
      //     },
      //     regularOptions
      //   );

      //   const createFolder = createFolderRes.data.createFolder;
      //   expect(createFolder).toBeDefined();
      //   expect(createFolder?.name).toContain(`${citestMarker}-folder`);
      //   newFolderId = createFolder?.id ?? '';
      // });

      // /**
      //  * TEST CASE 3: Create Temporal Data Object (TDO) inside Folder
      //  * SDK Method: superClient.sdk.createTDO({ input: { status, name, parentFolderId, startDateTime, stopDateTime } }, regularOptions)
      //  */
      // it('should create TDO in the folder', async () => {
      //   if (!useRBACFeature) {
      //     pending('useRBACFeature = false');
      //   }

      //   // TODO QA: Use superClient.sdk.createTDO to insert a media/file object into newFolderId
      //   const res = await superClient.sdk.createTDO(
      //     {
      //       input: {
      //         status: 'uploaded',
      //         name: `${citestMarker}-tdo-${uuidv4()}`,
      //         parentFolderId: newFolderId,
      //         startDateTime: 1476726655,
      //         stopDateTime: 1476726655
      //       }
      //     },
      //     regularOptions
      //   );

      //   expect(res.data.createTDO).toBeDefined();
      //   expect(res.data.createTDO?.id).toBeDefined();
      //   expect(res.data.createTDO?.name).toContain(`${citestMarker}-tdo`);
      //   newTDOId = res.data.createTDO?.id ?? '';
      // });

      // /**
      //  * TEST CASE 4: Retrieve Folder and TDO by ID
      //  * SDK Methods:
      //  * - superClient.sdk.folderBasic({ id: newFolderId }, regularOptions)
      //  * - superClient.sdk.temporalDataObject({ id: newTDOId }, regularOptions)
      //  */
      // it('should get the folder and the tdo by id', async () => {
      //   if (!useRBACFeature) {
      //     pending('useRBACFeature = false');
      //   }

      //   // TODO QA: Retrieve created folder details by ID
      //   const folderRes = await superClient.sdk.folderBasic(
      //     { id: newFolderId },
      //     regularOptions
      //   );
      //   expect(folderRes.data.folder?.id).toBeDefined();
      //   expect(folderRes.data.folder?.name).toContain(`${citestMarker}-folder`);

      //   // TODO QA: Retrieve created TDO details by ID
      //   const tdoRes = await superClient.sdk.temporalDataObject(
      //     { id: newTDOId },
      //     regularOptions
      //   );
      //   expect(tdoRes.data.temporalDataObject?.id).toBeDefined();
      //   expect(tdoRes.data.temporalDataObject?.name).toContain(
      //     `${citestMarker}-tdo`
      //   );
      // });

      // /**
      //  * TEST CASE 5: Query Access Control List (ACL) on Owned Objects
      //  * SDK Method: superClient.sdk.GetResourcesACL({ resourceType: AuthResourceType.Tdo, ids: [newTDOId] }, regularOptions)
      //  */
      // it('should be able to do getACLForResources on the owned objects', async () => {
      //   if (!useRBACFeature) {
      //     pending('useRBACFeature = false');
      //   }

      //   // TODO QA: Query ACL permissions for owned TDO resource
      //   const res = await superClient.sdk.GetResourcesACL(
      //     { resourceType: AuthResourceType.Tdo, ids: [newTDOId] },
      //     regularOptions
      //   );

      //   const records = res.data.getACLForResources?.records ?? [];
      //   expect(records).toBeDefined();
      //   expect(records[0]?.id).toContain(newTDOId);
      // });
    });

    /**
     * CLEANUP SUB-SECTION: Admin User Cleanup
     * Uses Admin User context to purge TDOs and Folders created during tests.
     */
    
    // // describe('with Admin user to clean up test data', () => {
    //   let folderIds: string[] = [];
    //   let TDOIds: string[] = [];

    //   beforeAll(async () => {
    //     const res = await superClient.sdk.meBasic({}, adminOptions);
    //     expect(res.data.me?.name).toContain(`${citestMarker}-admin-user`);
    //   });

    //   it('should get all tdos', async () => {
    //     if (!useRBACFeature) {
    //       pending('useRBACFeature = false');
    //     }

    //     const res = await superClient.sdk.temporalDataObjects(
    //       { offset: 0, limit: 50 },
    //       adminOptions
    //     );
    //     expect(res.data.temporalDataObjects?.records).toBeDefined();
    //     TDOIds = (res.data.temporalDataObjects?.records ?? []).map(
    //       (tdo: any) => tdo.id
    //     );
    //     expect(TDOIds.length).toBeGreaterThanOrEqual(1);
    //   });

    //   it('should get all folders', async () => {
    //     if (!useRBACFeature) {
    //       pending('useRBACFeature = false');
    //     }

    //     const rootFoldersRes = await superClient.sdk.rootFolders(
    //       { rootFolderType: RootFolderType.Cms },
    //       adminOptions
    //     );
    //     const rootFolders = rootFoldersRes.data.rootFolders ?? [];
    //     expect(rootFolders.length).toBeGreaterThan(0);
    //     const childFolders = rootFolders[0]?.childFolders?.records ?? [];
    //     folderIds = childFolders.map(
    //       (childFolder: any) => childFolder.treeObjectId
    //     );
    //     expect(childFolders.length).toBeGreaterThanOrEqual(1);
    //   });

    //   it('should delete all folders and tdos', async () => {
    //     if (!useRBACFeature) {
    //       pending('useRBACFeature = false');
    //     }

    //     // Delete all created TDOs
    //     for (const TDOId of TDOIds) {
    //       await superClient.sdk.deleteTDO({ id: TDOId }, adminOptions);
    //     }

    //     // Delete all created child folders
    //     for (const folderId of folderIds) {
    //       const getFolderACL = await superClient.sdk.GetResourcesACL(
    //         { resourceType: AuthResourceType.Folder, ids: [folderId] },
    //         adminOptions
    //       );
    //       const folderACL = getFolderACL.data.getACLForResources?.records ?? [];
    //       for (const ace of folderACL) {
    //         if (!ace) continue;
    //         await superClient.sdk.removeACEsFromResource(
    //           { resourceType: AuthResourceType.Folder, ids: [ace.id] },
    //           adminOptions
    //         );
    //       }

    //       await superClient.sdk.deleteFolder(
    //         { input: { id: folderId, orderIndex: 0 } },
    //         adminOptions
    //       );
    //     }
    //   });
    // // });
  
  });
});
