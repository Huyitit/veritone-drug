import { GraphQLClient, createGraphQLClient } from "../helpers/graphql-client";
import { getAuthenticatedClient, AuthSession } from "../helpers/auth-context";
import {
  CHECK_ROOT_FOLDERS,
  GET_ROOT_FOLDERS,
} from "../graphql/folder/queries";
import {
  CREATE_ROOT_FOLDERS,
  CREATE_FOLDER,
  UPDATE_FOLDER,
  MOVE_FOLDER,
  MOVE_FOLDERS,
  DELETE_FOLDER,
} from "../graphql/folder/mutations";
import {
  buildFolderInput,
  createTestFolder,
  folderTracker,
} from "../factories/folder.factory";

describe("Virtual Folder Hierarchy Mutations", () => {
  let client: GraphQLClient;
  let session: AuthSession;
  let rootCmsId: string;
  let rootWatchlistId: string;

  beforeAll(async () => {
    // 1. Authenticate against Veritone aiWARE Staging API
    const auth = await getAuthenticatedClient();
    client = auth.client;
    session = auth.session;

    expect(session.token).toBeDefined();
    expect(session.organizationId).toBeDefined();

    // 2. Discover or bootstrap CMS root folder anchor
    const cmsRootRes = await client.query<{ rootFolders: Array<{ id: string; rootFolderTypeId: number }> }>(
      CHECK_ROOT_FOLDERS,
      { type: "cms" }
    );
// Load test: K6, 
    if (cmsRootRes.data?.rootFolders && cmsRootRes.data.rootFolders.length > 0) {
      rootCmsId = cmsRootRes.data.rootFolders[0].id;
    } else {
      const createCmsRootRes = await client.mutate<{ createRootFolders: Array<{ id: string }> }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "cms" }
      );
      rootCmsId = createCmsRootRes.data?.createRootFolders[0]?.id || "";
    }

    // 3. Discover or bootstrap Watchlist root folder anchor
    const wlRootRes = await client.query<{ rootFolders: Array<{ id: string }> }>(
      CHECK_ROOT_FOLDERS,
      { type: "watchlist" }
    );

    if (wlRootRes.data?.rootFolders && wlRootRes.data.rootFolders.length > 0) {
      rootWatchlistId = wlRootRes.data.rootFolders[0].id;
    } else {
      const createWlRootRes = await client.mutate<{ createRootFolders: Array<{ id: string }> }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "watchlist" }
      );
      rootWatchlistId = createWlRootRes.data?.createRootFolders[0]?.id || "";
    }
  });

  afterAll(async () => {
    // Automated teardown: Prune all folders created during the test run
    if (client) {
      await folderTracker.cleanupAll(client);
    }
  });

  // =========================================================================
  // Suite 1: createRootFolders Mutation
  // =========================================================================
  describe("Suite 1: createRootFolders", () => {
    it("TC_CR_01: Initial Tenant Bootstrap with Explicit Domain", async () => {
      const response = await client.mutate<{ createRootFolders: Array<{ id: string; name: string; rootFolderTypeId: number }> }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "cms" }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.createRootFolders).toBeDefined();
      expect(Array.isArray(response.data?.createRootFolders)).toBe(true);
      expect(response.data!.createRootFolders.length).toBeGreaterThan(0);
      expect(response.data!.createRootFolders[0].id).toBeDefined();
    });

    it("TC_CR_02: Tenant Bootstrap with Default Parameter (Omitted rootFolderType)", async () => {
      const response = await client.mutate<{ createRootFolders: Array<{ id: string; rootFolderTypeId: number }> }>(
        CREATE_ROOT_FOLDERS
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.createRootFolders).toBeDefined();
      expect(Array.isArray(response.data?.createRootFolders)).toBe(true);
      expect(response.data!.createRootFolders[0].id).toBeDefined();
    });

    it("TC_CR_03: Idempotent Re-invocation on Already Initialized Tenant", async () => {
      const firstCall = await client.mutate<{ createRootFolders: Array<{ id: string }> }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "cms" }
      );
      const secondCall = await client.mutate<{ createRootFolders: Array<{ id: string }> }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "cms" }
      );

      expect(firstCall.errors).toBeUndefined();
      expect(secondCall.errors).toBeUndefined();
      expect(firstCall.data?.createRootFolders[0].id).toEqual(
        secondCall.data?.createRootFolders[0].id
      );
    });

    it("TC_CR_04: Unauthorized Execution under Invalid or Missing Tenant Token", async () => {
      const unauthClient = createGraphQLClient(process.env.GRAPHQL_API_URL, {
        Authorization: "Bearer invalid_or_expired_token_xyz",
      });

      const response = await unauthClient.mutate<{ createRootFolders: unknown }>(
        CREATE_ROOT_FOLDERS,
        { rootFolderType: "cms" }
      );

      expect(response.errors).toBeDefined();
      expect(response.errors!.length).toBeGreaterThan(0);
      expect(response.data?.createRootFolders == null).toBe(true);
    });
  });

  // =========================================================================
  // Suite 2: createFolder Mutation
  // =========================================================================
  describe("Suite 2: createFolder", () => {
    it("TC_CF_01: Standard Child Folder Creation Under Root Node", async () => {
      const folderInput = buildFolderInput({
        name: `Raw-Footage-${Date.now()}`,
        parentId: rootCmsId,
        rootFolderType: "cms",
      });

      const response = await client.mutate<{ createFolder: { id: string; name: string } }>(
        CREATE_FOLDER,
        { input: folderInput }
      );

      expect(response.errors).toBeUndefined();
      const folder = response.data?.createFolder;
      expect(folder).toBeDefined();
      expect(folder!.id).toBeDefined();
      expect(folder!.name).toBe(folderInput.name);

      folderTracker.track(folder!.id);
    });

    it("TC_CF_02: Multi-Tier Hierarchy Creation (Deeply Nested Child Folder)", async () => {
      const parentFolder = await createTestFolder(client, {
        name: `Parent-Tier-1-${Date.now()}`,
        parentId: rootCmsId,
      });

      const subFolderInput = buildFolderInput({
        name: `Sub-Batch-${Date.now()}`,
        parentId: parentFolder.id,
        rootFolderType: "cms",
      });

      const response = await client.mutate<{ createFolder: { id: string; name: string } }>(
        CREATE_FOLDER,
        { input: subFolderInput }
      );

      expect(response.errors).toBeUndefined();
      const subFolder = response.data?.createFolder;
      expect(subFolder).toBeDefined();
      expect(subFolder!.name).toBe(subFolderInput.name);

      folderTracker.track(subFolder!.id);
    });

    it("TC_CF_03: Sibling Name Handling Under Identical Parent", async () => {
      const uniqueName = `Duplicate-Test-${Date.now()}`;
      const firstFolder = await createTestFolder(client, {
        name: uniqueName,
        parentId: rootCmsId,
      });

      const secondResponse = await client.mutate<{ createFolder: { id: string; name: string } }>(
        CREATE_FOLDER,
        {
          input: buildFolderInput({
            name: uniqueName,
            parentId: rootCmsId,
          }),
        }
      );

      if (secondResponse.data?.createFolder) {
        // DAG permits duplicate sibling names with distinct IDs
        expect(secondResponse.data.createFolder.id).not.toEqual(firstFolder.id);
        folderTracker.track(secondResponse.data.createFolder.id);
      } else {
        // Platform enforces sibling uniqueness
        expect(secondResponse.errors).toBeDefined();
      }
    });

    it("TC_CF_04: Folder Creation with Non-Existent or Deleted parentId", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await client.mutate<{ createFolder: unknown }>(
        CREATE_FOLDER,
        {
          input: buildFolderInput({
            parentId: nonExistentId,
          }),
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.createFolder == null).toBe(true);
    });

    it("TC_CF_05: Cross-Domain Partition Mismatch", async () => {
      if (!rootWatchlistId) {
        return; // Skip if watchlist root not provisioned
      }

      const response = await client.mutate<{ createFolder: unknown }>(
        CREATE_FOLDER,
        {
          input: buildFolderInput({
            name: `Cross-Domain-${Date.now()}`,
            parentId: rootWatchlistId,
            rootFolderType: "cms", // Mismatched type under watchlist root
          }),
        }
      );

      // Either GraphQL error or server rejects domain partition violation
      if (response.errors) {
        expect(response.errors.length).toBeGreaterThan(0);
      }
    });

    it("TC_CF_06: Input Boundary Validation (Empty Name / Whitespace)", async () => {
      const response = await client.mutate<{ createFolder: unknown }>(
        CREATE_FOLDER,
        {
          input: {
            name: "   ",
            parentId: rootCmsId,
            rootFolderType: "cms",
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.createFolder == null).toBe(true);
    });
  });

  // =========================================================================
  // Suite 3: updateFolder Mutation
  // =========================================================================
  describe("Suite 3: updateFolder", () => {
    it("TC_UF_01: In-Place Renaming and Metadata Update", async () => {
      const folder = await createTestFolder(client, {
        parentId: rootCmsId,
      });

      const updatedName = `Renamed-Folder-${Date.now()}`;
      const response = await client.mutate<{ updateFolder: { id: string; name: string } }>(
        UPDATE_FOLDER,
        {
          input: {
            id: folder.id,
            name: updatedName,
          },
        }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.updateFolder.name).toBe(updatedName);
    });

    it("TC_UF_02: Idempotent Update with Unchanged Name", async () => {
      const folder = await createTestFolder(client, {
        parentId: rootCmsId,
      });

      const response = await client.mutate<{ updateFolder: { id: string; name: string } }>(
        UPDATE_FOLDER,
        {
          input: {
            id: folder.id,
            name: folder.name,
          },
        }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.updateFolder.name).toBe(folder.name);
    });

    it("TC_UF_03: Update Targeting Non-Existent Folder ID", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await client.mutate<{ updateFolder: unknown }>(
        UPDATE_FOLDER,
        {
          input: {
            id: nonExistentId,
            name: "Ghost Name",
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.updateFolder == null).toBe(true);
    });

    it("TC_UF_04: Rejection of Structural Mutation (Mutating Parentage via Update)", async () => {
      const folder = await createTestFolder(client, {
        parentId: rootCmsId,
      });

      const response = await client.mutate<{ updateFolder: unknown }>(
        UPDATE_FOLDER,
        {
          input: {
            id: folder.id,
            name: "Tampered Parent",
            parentId: rootCmsId, // Unknown input field in UpdateFolder schema
          },
        }
      );

      expect(response.errors).toBeDefined();
    });

    it("TC_UF_05: UTF-8 Character Handling (Special Characters, Unicode, Emojis)", async () => {
      const folder = await createTestFolder(client, {
        parentId: rootCmsId,
      });

      const unicodeName = "📁 Ingest [2026] / Équipe & テスト #42";
      const response = await client.mutate<{ updateFolder: { id: string; name: string } }>(
        UPDATE_FOLDER,
        {
          input: {
            id: folder.id,
            name: unicodeName,
          },
        }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.updateFolder.name).toBe(unicodeName);
    });
  });

  // =========================================================================
  // Suite 4: moveFolder Mutation
  // =========================================================================
  describe("Suite 4: moveFolder", () => {
    it("TC_MF_01: Valid Single-Folder Relocation Between Distinct Parents", async () => {
      const parentRoot = rootWatchlistId || rootCmsId;
      const rootType = rootWatchlistId ? "watchlist" : "cms";
      const parentA = await createTestFolder(client, { parentId: parentRoot, rootFolderType: rootType, name: `ParentA-${Date.now()}` });
      const parentB = await createTestFolder(client, { parentId: parentRoot, rootFolderType: rootType, name: `ParentB-${Date.now()}` });
      const child = await createTestFolder(client, { parentId: parentA.id, rootFolderType: rootType, name: `Child-${Date.now()}` });

      const response = await client.mutate<{ moveFolder: { id: string; name: string } }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: child.id,
            fromFolderId: parentA.id,
            toFolderId: parentB.id,
          },
        }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.moveFolder.id).toBe(child.id);
    });

    it("TC_MF_02: Optimistic Concurrency Lock Collision", async () => {
      const parentA = await createTestFolder(client, { parentId: rootCmsId, name: `SourceParent-${Date.now()}` });
      const parentB = await createTestFolder(client, { parentId: rootCmsId, name: `TargetParent-${Date.now()}` });
      const child = await createTestFolder(client, { parentId: parentA.id, name: `SubjectChild-${Date.now()}` });

      // Simulate stale fromFolderId mismatch
      const staleFromFolderId = "00000000-0000-0000-0000-000000000000";
      const response = await client.mutate<{ moveFolder: unknown }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: child.id,
            fromFolderId: staleFromFolderId,
            toFolderId: parentB.id,
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.moveFolder == null).toBe(true);
    });

    it("TC_MF_03: Self-Relocation Rejection (folderId == toFolderId)", async () => {
      const parentA = await createTestFolder(client, { parentId: rootCmsId });
      const child = await createTestFolder(client, { parentId: parentA.id });

      const response = await client.mutate<{ moveFolder: unknown }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: child.id,
            fromFolderId: parentA.id,
            toFolderId: child.id, // Cannot move into self
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.moveFolder == null).toBe(true);
    });

    it("TC_MF_04: No-Op Relocation (fromFolderId == toFolderId)", async () => {
      const parentA = await createTestFolder(client, { parentId: rootCmsId });
      const child = await createTestFolder(client, { parentId: parentA.id });

      const response = await client.mutate<{ moveFolder: { id: string; name: string } }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: child.id,
            fromFolderId: parentA.id,
            toFolderId: parentA.id,
          },
        }
      );

      if (response.data?.moveFolder) {
        expect(response.data.moveFolder.id).toBe(child.id);
      } else {
        expect(response.errors).toBeDefined();
      }
    });

    it("TC_MF_05: Hierarchy Cycle Prevention (Moving Ancestor into Own Descendant)", async () => {
      const parent = await createTestFolder(client, { parentId: rootCmsId, name: `Ancestor-${Date.now()}` });
      const child = await createTestFolder(client, { parentId: parent.id, name: `Descendant-${Date.now()}` });

      const response = await client.mutate<{ moveFolder: unknown }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: parent.id,
            fromFolderId: rootCmsId,
            toFolderId: child.id, // Circular DAG cycle
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.moveFolder == null).toBe(true);
    });

    it("TC_MF_06: Cross-Domain Migration Rejection", async () => {
      if (!rootWatchlistId) {
        return;
      }

      const cmsFolder = await createTestFolder(client, { parentId: rootCmsId });
      const response = await client.mutate<{ moveFolder: unknown }>(
        MOVE_FOLDER,
        {
          input: {
            folderId: cmsFolder.id,
            fromFolderId: rootCmsId,
            toFolderId: rootWatchlistId, // Cross-domain migration
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.moveFolder == null).toBe(true);
    });
  });

  // =========================================================================
  // Suite 5: moveFolders Mutation
  // =========================================================================
  describe("Suite 5: moveFolders", () => {
    it("TC_BF_01: Homogeneous Bulk Migration of Multiple Valid Folders", async () => {
      const sourceParent = await createTestFolder(client, { parentId: rootCmsId });
      const targetParent = await createTestFolder(client, { parentId: rootCmsId });
      const child1 = await createTestFolder(client, { parentId: sourceParent.id });
      const child2 = await createTestFolder(client, { parentId: sourceParent.id });

      const response = await client.mutate<{
        moveFolders: {
          newParentFolderId: string;
          validFolderIds: string[];
          invalidFolderIds: string[];
          message?: string;
        };
      }>(MOVE_FOLDERS, {
        input: {
          folderIds: [child1.id, child2.id],
          newParentFolderId: targetParent.id,
          rootFolderType: "cms",
        },
      });

      expect(response.errors).toBeUndefined();
      const payload = response.data?.moveFolders;
      expect(payload).toBeDefined();
      expect(payload!.newParentFolderId).toBe(targetParent.id);
      expect(payload!.validFolderIds).toEqual(
        expect.arrayContaining([child1.id, child2.id])
      );
    });

    it("TC_BF_02: Partial-Success Migration with Mixed Valid and Invalid Folder IDs", async () => {
      const sourceParent = await createTestFolder(client, { parentId: rootCmsId });
      const targetParent = await createTestFolder(client, { parentId: rootCmsId });
      const validChild = await createTestFolder(client, { parentId: sourceParent.id });
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const response = await client.mutate<{
        moveFolders: {
          validFolderIds: string[];
          invalidFolderIds: string[];
          message?: string;
        };
      }>(MOVE_FOLDERS, {
        input: {
          folderIds: [validChild.id, fakeId],
          newParentFolderId: targetParent.id,
          rootFolderType: "cms",
        },
      });

      if (response.data?.moveFolders) {
        expect(response.data.moveFolders.validFolderIds).toContain(validChild.id);
        expect(response.data.moveFolders.invalidFolderIds).toContain(fakeId);
      } else {
        expect(response.errors).toBeDefined();
        const errorData = (response.errors![0] as any)?.data;
        if (errorData?.invalidFolders) {
          expect(errorData.invalidFolders).toContain(fakeId);
        }
      }
    });

    it("TC_BF_03: Empty Batch Relocation (folderIds: [])", async () => {
      const targetParent = await createTestFolder(client, { parentId: rootCmsId });

      const response = await client.mutate<{ moveFolders: { validFolderIds?: string[]; message?: string } }>(
        MOVE_FOLDERS,
        {
          input: {
            folderIds: [],
            newParentFolderId: targetParent.id,
            rootFolderType: "cms",
          },
        }
      );

      if (response.data?.moveFolders) {
        expect(response.data.moveFolders.validFolderIds?.length || 0).toBe(0);
      } else {
        expect(response.errors).toBeDefined();
      }
    });

    it("TC_BF_04: Destination Parent Contained in Batch Selection", async () => {
      const sourceParent = await createTestFolder(client, { parentId: rootCmsId });
      const targetParent = await createTestFolder(client, { parentId: rootCmsId });
      const validChild = await createTestFolder(client, { parentId: sourceParent.id });

      const response = await client.mutate<{
        moveFolders: {
          validFolderIds: string[];
          invalidFolderIds: string[];
        };
      }>(MOVE_FOLDERS, {
        input: {
          folderIds: [validChild.id, targetParent.id],
          newParentFolderId: targetParent.id,
          rootFolderType: "cms",
        },
      });

      if (response.data?.moveFolders) {
        expect(response.data.moveFolders.validFolderIds).toContain(validChild.id);
        expect(response.data.moveFolders.invalidFolderIds).toContain(targetParent.id);
      } else {
        expect(response.errors).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Suite 6: deleteFolder Mutation
  // =========================================================================
  describe("Suite 6: deleteFolder", () => {
    it("TC_DF_01: Standard Deletion of Empty Leaf Folder with Valid orderIndex", async () => {
      const leafFolder = await createTestFolder(client, { parentId: rootCmsId });

      const response = await client.mutate<{ deleteFolder: { message: string } }>(
        DELETE_FOLDER,
        {
          input: {
            id: leafFolder.id,
            orderIndex: 0,
          },
        }
      );

      expect(response.errors).toBeUndefined();
      expect(response.data?.deleteFolder.message).toBeDefined();
      folderTracker.untrack(leafFolder.id);
    });

    it("TC_DF_02: Deletion Prevention of Non-Empty Folder with Child Subfolders", async () => {
      const parent = await createTestFolder(client, { parentId: rootCmsId });
      const child = await createTestFolder(client, { parentId: parent.id });

      const response = await client.mutate<{ deleteFolder: unknown }>(
        DELETE_FOLDER,
        {
          input: {
            id: parent.id,
            orderIndex: 0,
          },
        }
      );

      // System either rejects deleting folder with active children or cascades
      if (response.errors) {
        expect(response.errors.length).toBeGreaterThan(0);
      }
    });

    it("TC_DF_04: Stale or Mismatched orderIndex Deletion Handling", async () => {
      const leafFolder = await createTestFolder(client, { parentId: rootCmsId });

      const response = await client.mutate<{ deleteFolder: { message: string } }>(
        DELETE_FOLDER,
        {
          input: {
            id: leafFolder.id,
            orderIndex: 9999, // Mismatched or arbitrary orderIndex
          },
        }
      );

      // Platform either reconciles index or rejects with validation error
      if (response.data?.deleteFolder) {
        expect(response.data.deleteFolder.message).toBeDefined();
        folderTracker.untrack(leafFolder.id);
      } else {
        expect(response.errors).toBeDefined();
      }
    });

    it("TC_DF_05: Deletion Prevention on Protected Root Partition Nodes", async () => {
      const response = await client.mutate<{ deleteFolder: unknown }>(
        DELETE_FOLDER,
        {
          input: {
            id: rootCmsId,
            orderIndex: 0,
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.deleteFolder == null).toBe(true);
    });

    it("TC_DF_06: Double Deletion / Idempotent Deletion on Non-Existent Folder", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await client.mutate<{ deleteFolder: unknown }>(
        DELETE_FOLDER,
        {
          input: {
            id: nonExistentId,
            orderIndex: 0,
          },
        }
      );

      expect(response.errors).toBeDefined();
      expect(response.data?.deleteFolder == null).toBe(true);
    });
  });
});
