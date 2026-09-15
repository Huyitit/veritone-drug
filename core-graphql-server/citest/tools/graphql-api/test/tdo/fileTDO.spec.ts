import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { safe } from '@citest/helpers/cleanup/utils';
import { get as lodashGet } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { RootFolderType } from '@api/src/gql/gql';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const utilFactory = require('@server/util.js');
const util = utilFactory();

// Assigned in beforeAll. The legacy client this spec was converted from needed
// an explicit `connect()` to authenticate; that call was lost in the conversion,
// so every query ran unauthenticated. createGraphqlClient returns an already
// authenticated client, which is also what the rest of the converted tdo specs use.
let gqlClient: GraphqlClient;
interface CitestGlobals {
  citestMarker?: string;
}
const citestMarker =
  (globalThis as CitestGlobals).citestMarker || 'citest-should-delete';
const rootFolderType = RootFolderType.Collection;

interface FolderData {
  id: string;
  treeObjectId?: string;
  name?: string;
  description?: string;
  createdDateTime?: string;
  modifiedDateTime?: string;
  status?: string;
  ownerId?: string;
  maxDepth?: number;
  orderIndex?: number;
}

interface CreateFolderResult {
  createFolder?: FolderData;
}

interface CreateRootFoldersResult {
  createRootFolders?: FolderData[];
}

interface GetFolderResult {
  folder?: {
    id: string;
    name?: string;
    description?: string;
    typeId?: string;
    subfolders?: Array<{
      id: string;
      treeObjectId?: string;
      name?: string;
      description?: string;
    }>;
    childTDOs?: {
      count: number;
      records?: Array<{
        id: string;
        name?: string;
      }>;
    };
  };
}

interface DeleteFolderResult {
  deleteFolder?: {
    id: string;
  };
}

interface TDOData {
  id: string;
  applicationId?: string;
  name?: string;
  folders?: Array<{
    id: string;
    parent?: {
      id: string;
    };
  }>;
}

interface CreateTDOResult {
  createTDO?: TDOData;
}

interface UpdateTDOResult {
  updateTDO?: {
    id: string;
    name?: string;
  };
}

interface FileTemporalDataObjectResult {
  fileTemporalDataObject?: TDOData;
}

interface MoveTemporalDataObjectResult {
  moveTemporalDataObject?: TDOData;
}

interface UnfileTemporalDataObjectResult {
  unfileTemporalDataObject?: TDOData;
}

interface DeleteTDOResult {
  deleteTDO?: {
    id: string;
    message: string;
  };
}

const testStateObject = {
  testId: null as string | null,
  testName: null as string | null,
  testDescription: null as string | null,
  testParentId: null as string | null,
  testMoveParentId: null as string | null,
  testOrderIndex: 0,
  testIsDeleted: false,
  /** This is used for which step of the tests are on */
  test: 0
};

let folderId: string | null = null;
let tdoId: string | null = null;
let newFolderId: string | null = null;
let deleteFolder1: string | null = null;
let deleteFolder2: string | null = null;
let olpMigration = false;

describe('citest_tdo: setup TDO filing test', () => {
  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const orgData = await gqlClient.sdk.me({});
    olpMigration = lodashGet(
      orgData,
      'data.me.organization.jsondata.features.olpMigration',
      false
    );
  });

  it('create a TDO', async () => {
    const result = await gqlClient.sdk.createTDO({
      input: {
        status: 'uploaded',
        startDateTime: 1476726655,
        stopDateTime: 1476726655
      }
    });

    tdoId = lodashGet(result, 'data.createTDO.id', null);
    expect(tdoId).toBeDefined();
  });

  it('update TDO name', async () => {
    const tdoName = `${citestMarker}-testTDO-${uuidv4()}`;
    const result = await gqlClient.sdk.updateTDO({
      input: {
        id: tdoId as string,
        name: tdoName,
        details: {
          veritoneFile: {
            fileName: `${citestMarker}-testTDOFileName`
          }
        }
      }
    });

    expect(result.data?.updateTDO).toBeDefined();
    expect(result.data?.updateTDO?.name).toEqual(tdoName);
  });

  it('create root folders', async () => {
    const result = await gqlClient.sdk.createRootFolders({ rootFolderType });

    expect(result.data?.createRootFolders).toBeDefined();

    const rootFolders = result.data?.createRootFolders;

    if (rootFolders && rootFolders.length >= 2) {
      testStateObject.testParentId = rootFolders[1].treeObjectId || null;
      testStateObject.testMoveParentId = rootFolders[0].treeObjectId || null;
    }
  });

  it('create a folder', async () => {
    testStateObject.testName = `${citestMarker}-graphql-folders`;
    testStateObject.testDescription =
      `${citestMarker}-graphql-folders-description`;

    const result = await gqlClient.sdk.createFolder({
      input: {
        name: testStateObject.testName,
        description: testStateObject.testDescription,
        parentId: testStateObject.testParentId,
        orderIndex: testStateObject.testOrderIndex,
        rootFolderType
      }
    });
    testStateObject.testId = result.data?.createFolder?.treeObjectId || null;
    testStateObject.test = 1;

    expect(result.data?.createFolder?.id).toBeDefined();
    expect(result.data?.createFolder?.name).toEqual(testStateObject.testName);
    folderId = result.data?.createFolder?.treeObjectId || null;
    deleteFolder1 = folderId;
  });

  it('throw error if TDO is not found', async () => {
    await expect(
      gqlClient.sdk.fileTemporalDataObject({
        input: { tdoId: '-123', folderId: folderId as string }
      })
    ).rejects.toThrow('The requested TDO was not found');
  });

  it('file a TDO in a folder', async () => {
    const result = await gqlClient.sdk.fileTemporalDataObject({
      input: { tdoId: tdoId as string, folderId: folderId as string }
    });
    expect(lodashGet(result, 'data.fileTemporalDataObject.id', null)).toBeDefined();
  });

  it('throw error refiling a TDO in a folder', async () => {
    await expect(
      gqlClient.sdk.fileTemporalDataObject({
        input: { tdoId: tdoId as string, folderId: folderId as string }
      })
    ).rejects.toThrow('TDO has already been filed elsewhere.');
  });

  it('create a folder', async () => {
    testStateObject.testName = `${citestMarker}-graphql-test-folders`;
    testStateObject.testDescription =
      `${citestMarker}-graphql-folders-description`;

    const result = await gqlClient.sdk.createFolder({
      input: {
        name: `${testStateObject.testName}-2`,
        description: `${testStateObject.testDescription}-2`,
        parentId: testStateObject.testParentId,
        orderIndex: testStateObject.testOrderIndex,
        rootFolderType
      }
    });

    expect(result.data?.createFolder?.id).toBeDefined();
    expect(result.data?.createFolder?.name).toEqual(
      testStateObject.testName + '-2'
    );
    newFolderId = result.data?.createFolder?.treeObjectId || null;
    deleteFolder2 = newFolderId;
  });

  it('get a folder', async () => {
    const result = await gqlClient.sdk.folder({
      id: folderId as string
    });

    expect(result.data?.folder?.id).toBeDefined();
    expect(result.data?.folder?.subfolders).toEqual([]);
    expect(result.data?.folder?.childTDOs?.count).toEqual(1);
    expect(result.data?.folder?.childTDOs?.records?.[0]).toHaveProperty(
      'id',
      tdoId
    );
  });

  it('move tdo to new folder', async () => {
    const moveFolderPromise = gqlClient.sdk.moveTemporalDataObjectWithFolders({
      input: {
        tdoId: tdoId as string,
        oldFolderId: folderId as string,
        newFolderId: newFolderId as string
      }
    });
    /**
     * If feature flag olpMigration is enabled.
     * During the OLP transition, moving files is disabled because it can lead
     * to resources without ACEs being locked out
     */

    if (olpMigration) {
      await expect(moveFolderPromise).rejects.toThrow(
        /OLP is being enabled. During the OLP transition, moving files is disabled because it can lead to resources without ACEs being locked out/
      );
    } else {
      const result = await moveFolderPromise;
      await util.sleep(500); /* Wait for eventual consistency */
      testStateObject.test = 3;
      const moveTemporalDataObject = result.data?.moveTemporalDataObject;
      expect(moveTemporalDataObject?.id).toEqual(tdoId);
      expect(
        lodashGet(moveTemporalDataObject, 'folders[0].treeObjectId')
      ).toEqual(newFolderId);

      folderId = newFolderId;
    }
  });

  it('unfile a TDO in a folder', async () => {
    const result = await gqlClient.sdk.unfileTemporalDataObject({
      input: { tdoId: tdoId as string, folderId: folderId as string }
    });
    const unfileTemporalDataObject = lodashGet(
      result,
      'data.unfileTemporalDataObject',
      null
    );
    expect(unfileTemporalDataObject.id).toBeDefined();
    expect(unfileTemporalDataObject.folders).toEqual([]);
  });

  it('have moved', async () => {
    const result = await gqlClient.sdk.folder({
      id: folderId as string
    });

    expect(result.data?.folder?.id).toBeDefined();
    expect(result.data?.folder?.childTDOs?.count).toEqual(0);
  });

  it('file a TDO in a folder again', async () => {
    const result = await gqlClient.sdk.fileTemporalDataObject({
      input: { tdoId: tdoId as string, folderId: folderId as string }
    });
    expect(lodashGet(result, 'data.fileTemporalDataObject.id', null)).toBeDefined();
  });

  it('have been filed again', async () => {
    const result = await gqlClient.sdk.folder({
      id: folderId as string
    });

    expect(result.data?.folder?.id).toBeDefined();
    expect(result.data?.folder?.childTDOs?.count).toEqual(1);
    expect(result.data?.folder?.childTDOs?.records?.[0].id).toEqual(tdoId);
  });

  it('delete the TDO', async () => {
    const result = await gqlClient.sdk.deleteTDO({ id: tdoId as string });
    expect(lodashGet(result, 'data.deleteTDO.id', null)).toEqual(tdoId);
  });

  it('have been removed from folder', async () => {
    const result = await gqlClient.sdk.folder({
      id: folderId as string
    });

    expect(result.data?.folder?.id).toBeDefined();
    expect(result.data?.folder?.childTDOs?.count).toEqual(0);
  });

  it('delete a folder', async () => {
    const result = await gqlClient.sdk.deleteFolder({
      input: {
        id: deleteFolder1 as string,
        orderIndex: testStateObject.testOrderIndex
      }
    });
    testStateObject.test = 4;
    testStateObject.testIsDeleted = true;

    expect(result.data?.deleteFolder?.id).toEqual(deleteFolder1);
  });

  it('delete move folder', async () => {
    const result = await gqlClient.sdk.deleteFolder({
      input: {
        id: deleteFolder2 as string,
        orderIndex: testStateObject.testOrderIndex
      }
    });

    expect(result.data?.deleteFolder?.id).toEqual(deleteFolder2);
  });

  afterAll(async () => {
    /** Clean up TDO */
    if (tdoId) {
      await safe(`delete TDO ${tdoId}`, async () => {
        await gqlClient.sdk.deleteTDO({ id: tdoId as string });
      });
    }

    /** Clean up folders */
    const folderIds = [deleteFolder1, deleteFolder2].filter(Boolean);
    for (const id of folderIds) {
      await safe(`delete folder ${id}`, async () => {
        await gqlClient.sdk.deleteFolder({
          input: {
            id: id as string,
            orderIndex: testStateObject.testOrderIndex
          }
        });
      });
    }
  });
});
