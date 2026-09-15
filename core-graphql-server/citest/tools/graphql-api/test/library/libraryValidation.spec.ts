import { SetEntityProfileImage } from '../../src/gql';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const imageUrl = 'https://www.veritone.com/images/logo.svg';
const nonImageUrl = 'https://www.veritone.com/robots.txt';

describe('citest_library: library/entity/entityIdentifier validation', () => {
  let gqlClient: GraphqlClient;
  let libraryId: string;
  let entityId: string;
  let baselineEntityIdentifierId: string;
  let imageTypeId: string;
  let nonImageTypeId: string | undefined;
  const createdEntityIds: string[] = [];
  const createdEntityIdentifierIds: string[] = [];

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    const libraryResult = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-validation-library-${appKey}`,
        libraryTypeId: 'people'
      }
    });
    libraryId = libraryResult?.data?.createLibrary?.id!;
    expect(libraryId).toBeDefined();

    const entityResult = await gqlClient.sdk.createEntity({
      input: {
        libraryId,
        name: `${citestMarker}-validation-entity-${appKey}`
      }
    });
    entityId = entityResult?.data?.createEntity?.id!;
    expect(entityId).toBeDefined();
    createdEntityIds.push(entityId);

    const libraryTypeResult = await gqlClient.sdk.libraryTypesAndType({
      libraryTypeId: 'people'
    });
    const supportedTypes =
      libraryTypeResult?.data?.libraryType?.entityIdentifierTypes || [];
    imageTypeId =
      supportedTypes.find((t) => t?.dataType === 'image')?.id || 'face';

    nonImageTypeId = supportedTypes.find((t) => t?.dataType === 'text')?.id;

    const identifierResult = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: imageTypeId,
        contentType: 'image/svg+xml',
        url: imageUrl
      }
    });
    baselineEntityIdentifierId =
      identifierResult?.data?.createEntityIdentifier?.id!;
    expect(baselineEntityIdentifierId).toBeDefined();
    createdEntityIdentifierIds.push(baselineEntityIdentifierId);
  });

  afterAll(async () => {
    for (const id of createdEntityIdentifierIds) {
      await safe('delete entity identifier', () =>
        gqlClient.sdk.deleteEntityIdentifier({ id })
      );
    }
    for (const id of createdEntityIds) {
      await safe('delete entity', () => gqlClient.sdk.deleteEntity({ id }));
    }
    if (libraryId) {
      await safe('delete library', () =>
        gqlClient.sdk.deleteLibrary({ id: libraryId })
      );
    }
  });

  it('rejects createLibrary without name', async () => {
    const promise = gqlClient.sdk.createLibrary({
      input: {
        libraryTypeId: 'people'
      } as any
    });

    await expect(promise).rejects.toThrow(/name.* was not provided/);
  });

  it('rejects createLibrary without libraryTypeId', async () => {
    const promise = gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-validation-no-type-${appKey}`
      } as any
    });

    await expect(promise).rejects.toThrow(/libraryTypeId.* was not provided/);
  });

  it('rejects createLibrary with a non-image cover image url', async () => {
    const promise = gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-validation-bad-cover-${appKey}`,
        libraryTypeId: 'people',
        coverImageUrl: nonImageUrl
      }
    });

    await expect(promise).rejects.toThrow('Unsupported Content-Type');
  });

  it('rejects createEntity with a duplicate name in the same library', async () => {
    const name = `${citestMarker}-validation-dup-entity-${appKey}`;
    const first = await gqlClient.sdk.createEntity({
      input: { libraryId, name }
    });
    const firstId = first?.data?.createEntity?.id!;
    expect(firstId).toBeDefined();
    createdEntityIds.push(firstId);

    const promise = gqlClient.sdk.createEntity({
      input: { libraryId, name }
    });

    await expect(promise).rejects.toThrow('resource_conflict');
  });

  it('rejects createEntity with both jsondata and jsonstring', async () => {
    const promise = gqlClient.sdk.createEntity({
      input: {
        libraryId,
        name: `${citestMarker}-validation-both-json-${appKey}`,
        jsondata: { foo: 'bar' },
        jsonstring: '{"foo":"bar"}'
      }
    });

    await expect(promise).rejects.toThrow('invalid_input');
  });

  it('createEntityIdentifier with both jsondata and jsonstring', async () => {
    const result = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: imageTypeId,
        contentType: 'image/svg+xml',
        url: imageUrl,
        jsondata: { foo: 'bar' },
        jsonstring: '{"foo":"baz"}'
      }
    });

    const id = result?.data?.createEntityIdentifier?.id!;
    expect(id).toBeDefined();
    createdEntityIdentifierIds.push(id);
    expect(result?.data?.createEntityIdentifier?.jsondata?.foo).toEqual('baz');
  });

  it('rejects createEntityIdentifier without url and file', async () => {
    const promise = gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: imageTypeId,
        contentType: 'image/svg+xml'
      }
    });

    await expect(promise).rejects.toThrow('invalid_input');
  });

  it('rejects updateEntityIdentifier with an empty-string url', async () => {
    const promise = gqlClient.sdk.UpdateEntityIdentifier({
      input: {
        id: baselineEntityIdentifierId,
        url: ''
      }
    });

    await expect(promise).rejects.toThrow('invalid_input');
  });

  it('profileUpdateMode = always on a non-image identifier success', async () => {
    if (!nonImageTypeId) {
      console.warn(
        'No non-image entityIdentifierType found in this environment — skipping profileUpdateMode gap test.'
      );
      return;
    }

    const result = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: nonImageTypeId,
        contentType: 'text/plain',
        url: nonImageUrl,
        profileUpdateMode: SetEntityProfileImage.Always
      }
    });

    const id = result?.data?.createEntityIdentifier?.id!;
    expect(id).toBeDefined();
    createdEntityIdentifierIds.push(id);

    const entityResult = await gqlClient.sdk.entity({ id: entityId });
    expect(entityResult?.data?.entity?.profileImageUrl).toBeDefined();
  });

  it('rejects library query with a invalid id', async () => {
    const promise = gqlClient.sdk.library({ id: 'not-a-uuid' });

    await expect(promise).rejects.toThrow('not_found');
  });

  it('rejects library query without the id', async () => {
    const promise = gqlClient.sdk.library({} as any);

    await expect(promise).rejects.toThrow();
  });
});
