import { GraphQLClient } from "../helpers/graphql-client";
import { CREATE_FOLDER, DELETE_FOLDER } from "../graphql/folder/mutations";

export interface CreateFolderInput {
  name: string;
  description?: string;
  parentId: string;
  rootFolderType?: string;
}

export interface FolderEntity {
  id: string;
  name: string;
  description?: string;
  parentFolderId?: string;
}

class FolderTracker {
  private folderIds: Set<string> = new Set();

  track(id: string): void {
    if (id) {
      this.folderIds.add(id);
    }
  }

  untrack(id: string): void {
    this.folderIds.delete(id);
  }

  getTrackedIds(): string[] {
    return Array.from(this.folderIds);
  }

  async cleanupAll(client: GraphQLClient): Promise<void> {
    const ids = Array.from(this.folderIds).reverse();
    for (const id of ids) {
      try {
        await client.mutate(DELETE_FOLDER, {
          input: {
            id,
            orderIndex: 0,
          },
        });
      } catch {
        // Silently ignore cleanup errors if folder was already deleted
      }
      this.folderIds.delete(id);
    }
  }
}

export const folderTracker = new FolderTracker();

export function buildFolderInput(
  overrides: Partial<CreateFolderInput> = {}
): CreateFolderInput {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return {
    name: `Test-Folder-${timestamp}-${random}`,
    description: `Automated test folder created at ${new Date().toISOString()}`,
    parentId: "",
    rootFolderType: "cms",
    ...overrides,
  };
}

export async function createTestFolder(
  client: GraphQLClient,
  overrides: Partial<CreateFolderInput> = {}
): Promise<FolderEntity> {
  const input = buildFolderInput(overrides);
  const response = await client.mutate<{ createFolder: FolderEntity }>(CREATE_FOLDER, {
    input,
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(
      `Failed to create test folder: ${response.errors.map((e) => e.message).join(", ")}`
    );
  }

  const folder = response.data?.createFolder;
  if (!folder) {
    throw new Error("createFolder returned empty data payload");
  }

  folderTracker.track(folder.id);
  return folder;
}
