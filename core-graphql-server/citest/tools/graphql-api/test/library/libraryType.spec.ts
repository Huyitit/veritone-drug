import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const libraryTypeId = `${citestMarker}-libtype-${appKey}`;
const entityIdentifierTypeId = 'face';

describe('citest_library: libraryType create/update', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  it('creates a library type', async () => {
    const result = await gqlClient.sdk.createLibraryType({
      input: {
        id: libraryTypeId,
        label: `${citestMarker} Library Type`,
        iconClass: 'icon-face',
        entityIdentifierTypeIds: [entityIdentifierTypeId],
        entityType: {
          name: 'citestEntity',
          namePlural: 'citestEntities',
          schema: {}
        }
      }
    });

    expect(result?.data?.createLibraryType?.id).toEqual(libraryTypeId);
    expect(result?.data?.createLibraryType?.label).toEqual(
      `${citestMarker} Library Type`
    );
    expect(
      result?.data?.createLibraryType?.entityIdentifierTypes?.[0]?.id
    ).toEqual(entityIdentifierTypeId);
  });

  it('fails to create a library type with a duplicate id', async () => {
    const promise = gqlClient.sdk.createLibraryType({
      input: {
        id: libraryTypeId,
        label: `${citestMarker} Library Type Duplicate`,
        entityIdentifierTypeIds: [entityIdentifierTypeId],
        entityType: {
          name: 'citestEntity2',
          namePlural: 'citestEntities2',
          schema: {}
        }
      }
    });

    await expect(promise).rejects.toThrow('already exists');
  });

  it('fails to create a library type without label', async () => {
    const promise = gqlClient.sdk.createLibraryType({
      input: {
        id: `${libraryTypeId}-no-label`,
        entityType: {
          name: 'citestEntity3',
          namePlural: 'citestEntities3',
          schema: {}
        }
      } as any
    });

    await expect(promise).rejects.toThrow();
  });

  it('fails to create a library type without entityIdentifierTypeIds', async () => {
    const promise = gqlClient.sdk.createLibraryType({
      input: {
        id: `${libraryTypeId}-no-eit`,
        label: `${citestMarker} Library Type No EIT`,
        entityType: {
          name: 'citestEntity4',
          namePlural: 'citestEntities4',
          schema: {}
        }
      }
    });

    await expect(promise).rejects.toThrow();
  });

  // update assert and unskip test updateLibraryType after VE-25963 is DONE
  xit('updates a library type', async () => {
    const result = await gqlClient.sdk.updateLibraryType({
      input: {
        id: libraryTypeId,
        label: `${citestMarker} Updated Label`,
        iconClass: 'icon-face-updated'
      }
    });

    expect(result?.data?.updateLibraryType).toBeNull();
  });

  xit('fails to update a library type with an unknown id', async () => {
    const result = gqlClient.sdk.updateLibraryType({
      input: {
        id: `${citestMarker}-libtype-does-not-exist-${appKey}`,
        label: `${citestMarker} Should Not Exist`
      }
    });

    await expect(result).rejects.toThrow();
  });
});
