import { helpers } from '../../src/helpers/index';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import {
  LibraryEntityOrderBy,
  LibraryOrderBy,
  OrderDirection
} from '../../src/gql';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const namePrefix = `${citestMarker}-ordering-${appKey}`;

describe('citest_library: libraries/entities ordering', () => {
  let gqlClient: GraphqlClient;

  let libAId: string;
  let libBId: string;
  let libCId: string;

  let entity1Id: string;
  let entity2Id: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const libB = await gqlClient.sdk.createLibrary({
      input: { name: `${namePrefix}-b`, libraryTypeId: 'people' }
    });
    libBId = libB?.data?.createLibrary?.id!;
    expect(libBId).toBeDefined();

    await helpers.sleep(1000);

    const libA = await gqlClient.sdk.createLibrary({
      input: { name: `${namePrefix}-a`, libraryTypeId: 'people' }
    });
    libAId = libA?.data?.createLibrary?.id!;
    expect(libAId).toBeDefined();

    await helpers.sleep(1000);

    const libC = await gqlClient.sdk.createLibrary({
      input: { name: `${namePrefix}-c`, libraryTypeId: 'people' }
    });
    libCId = libC?.data?.createLibrary?.id!;
    expect(libCId).toBeDefined();

    await gqlClient.sdk.publishLibrary({ id: libCId });
    await gqlClient.sdk.publishLibrary({ id: libCId });
    await gqlClient.sdk.publishLibrary({ id: libAId });

    await helpers.sleep(1000);
    await gqlClient.sdk.UpdateLibrary({
      input: { id: libBId, description: 'touched last' }
    });

    const entity1 = await gqlClient.sdk.createEntity({
      input: { libraryId: libBId, name: `${namePrefix}-entity-z` }
    });
    entity1Id = entity1?.data?.createEntity?.id!;
    expect(entity1Id).toBeDefined();

    await helpers.sleep(1000);

    const entity2 = await gqlClient.sdk.createEntity({
      input: { libraryId: libBId, name: `${namePrefix}-entity-a` }
    });
    entity2Id = entity2?.data?.createEntity?.id!;
    expect(entity2Id).toBeDefined();
  });

  afterAll(async () => {
    for (const id of [entity1Id, entity2Id]) {
      if (id) {
        await safe('delete entity', () => gqlClient.sdk.deleteEntity({ id }));
      }
    }
    for (const id of [libAId, libBId, libCId]) {
      if (id) {
        await safe('delete library', () => gqlClient.sdk.deleteLibrary({ id }));
      }
    }
  });

  it('orders libraries by name ascending/descending', async () => {
    const asc = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.Name,
      orderDirection: OrderDirection.Asc,
      limit: 10,
      offset: 0
    });
    const ascIds = asc?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ascIds).toEqual([libAId, libBId, libCId]);

    const desc = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.Name,
      orderDirection: OrderDirection.Desc,
      limit: 10,
      offset: 0
    });
    const descIds = desc?.data?.libraries?.records?.map((r: any) => r.id);
    expect(descIds).toEqual([libCId, libBId, libAId]);
  });

  it('orders libraries by createdDateTime descending (most recent first)', async () => {
    const result = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.CreatedDateTime,
      orderDirection: OrderDirection.Desc,
      limit: 10,
      offset: 0
    });
    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toEqual([libCId, libAId, libBId]);
  });

  it('orderBy modifiedDateTime is a no-op — silently falls back to name ASC (BUG)', async () => {
    const result = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.ModifiedDateTime,
      orderDirection: OrderDirection.Desc,
      limit: 10,
      offset: 0
    });
    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toEqual([libAId, libBId, libCId]);
  });

  it('orderBy version is a no-op — silently falls back to name ASC (BUG)', async () => {
    const result = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.Version,
      orderDirection: OrderDirection.Desc,
      limit: 10,
      offset: 0
    });
    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toEqual([libAId, libBId, libCId]);
  });

  it('orderBy id is a no-op — silently falls back to name ASC (BUG)', async () => {
    const result = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.Id,
      orderDirection: OrderDirection.Asc,
      limit: 10,
      offset: 0
    });
    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toEqual([libAId, libBId, libCId]);
  });

  it('pages libraries with limit/offset', async () => {
    const result = await gqlClient.sdk.libraries({
      name: namePrefix,
      orderBy: LibraryOrderBy.Name,
      orderDirection: OrderDirection.Asc,
      limit: 1,
      offset: 1
    });
    expect(result?.data?.libraries?.count).toEqual(1);
    expect(result?.data?.libraries?.records?.[0]?.id).toEqual(libBId);
  });

  it('orders entities by name ascending', async () => {
    const result = await gqlClient.sdk.entities({
      libraryIds: [libBId],
      orderBy: LibraryEntityOrderBy.Name,
      orderDirection: OrderDirection.Asc
    });
    const ids = result?.data?.entities?.records?.map((r: any) => r.id);
    expect(ids).toEqual([entity2Id, entity1Id]);
  });

  it('orderBy createdDateTime on entities is a no-op — silently falls back to name ASC (BUG)', async () => {
    const result = await gqlClient.sdk.entities({
      libraryIds: [libBId],
      orderBy: LibraryEntityOrderBy.CreatedDateTime,
      orderDirection: OrderDirection.Desc
    });
    const ids = result?.data?.entities?.records?.map((r: any) => r.id);
    expect(ids).toEqual([entity2Id, entity1Id]);
  });

  it('orderBy id on entities is a no-op — silently falls back to name ASC (BUG)', async () => {
    const result = await gqlClient.sdk.entities({
      libraryIds: [libBId],
      orderBy: LibraryEntityOrderBy.Id,
      orderDirection: OrderDirection.Asc
    });
    const ids = result?.data?.entities?.records?.map((r: any) => r.id);
    expect(ids).toEqual([entity2Id, entity1Id]);
  });
});
