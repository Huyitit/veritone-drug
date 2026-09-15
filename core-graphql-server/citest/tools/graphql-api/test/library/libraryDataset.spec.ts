import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const libraryName = `${citestMarker}-dataset-library-${appKey}`;

describe('citest_library: libraryDataset add/delete', () => {
  let gqlClient: GraphqlClient;
  let libraryId: string;
  let tdoId1: string;
  let tdoId2: string;

  async function createTdo(name: string) {
    const result = await gqlClient.sdk.createTDO({
      input: {
        name,
        startDateTime: new Date().toISOString(),
        stopDateTime: new Date(Date.now() + 60000).toISOString(),
        status: 'downloaded'
      }
    });
    const id = result?.data?.createTDO?.id!;
    expect(id).toBeDefined();
    return id;
  }

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const libraryResult = await gqlClient.sdk.createLibrary({
      input: {
        name: libraryName,
        libraryTypeId: 'people'
      }
    });
    libraryId = libraryResult?.data?.createLibrary?.id!;
    expect(libraryId).toBeDefined();

    tdoId1 = await createTdo(`${citestMarker}-dataset-tdo-1-${appKey}`);
    tdoId2 = await createTdo(`${citestMarker}-dataset-tdo-2-${appKey}`);
  });

  afterAll(async () => {
    if (libraryId) {
      await safe('delete library', () =>
        gqlClient.sdk.deleteLibrary({ id: libraryId })
      );
    }
    if (tdoId1) {
      await safe('delete tdo 1', () => gqlClient.sdk.deleteTDO({ id: tdoId1 }));
    }
    if (tdoId2) {
      await safe('delete tdo 2', () => gqlClient.sdk.deleteTDO({ id: tdoId2 }));
    }
  });

  it('adds TDOs to the library dataset', async () => {
    const result = await gqlClient.sdk.addLibraryDataset({
      input: {
        libraryId,
        tdoIds: [tdoId1, tdoId2]
      }
    });

    expect(result?.data?.addLibraryDataset?.tdoIds).toEqual(
      expect.arrayContaining([tdoId1, tdoId2])
    );

    const libraryResult = await gqlClient.sdk.library({
      id: libraryId
    });
    expect(libraryResult?.data?.library?.dataset?.tdoIds).toEqual(
      expect.arrayContaining([tdoId1, tdoId2])
    );
  });

  it('fails to add TDOs to a nonexistent library', async () => {
    const promise = gqlClient.sdk.addLibraryDataset({
      input: {
        libraryId: `${citestMarker}-dataset-library-does-not-exist-${appKey}`,
        tdoIds: [tdoId1]
      }
    });

    await expect(promise).rejects.toThrow('not_found');
  });

  it('removes TDOs from the dataset', async () => {
    const result = await gqlClient.sdk.deleteLibraryDataset({
      input: {
        libraryId,
        tdoIds: [tdoId1]
      }
    });

    expect(result?.data?.deleteLibraryDataset?.tdoIds).toEqual(
      expect.arrayContaining([tdoId1])
    );

    const libraryResult = await gqlClient.sdk.library({
      id: libraryId
    });
    const remainingTdoIds = libraryResult?.data?.library?.dataset?.tdoIds || [];
    expect(remainingTdoIds).not.toContain(tdoId1);
    expect(remainingTdoIds).toContain(tdoId2);
  });

  it('fails to remove TDOs from a nonexistent library', async () => {
    const promise = gqlClient.sdk.deleteLibraryDataset({
      input: {
        libraryId: `${citestMarker}-dataset-library-does-not-exist-${appKey}`,
        tdoIds: [tdoId2]
      }
    });

    await expect(promise).rejects.toThrow('not_found');
  });
});
