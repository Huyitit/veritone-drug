import moment from 'moment';
import path from 'path';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { safe } from '../../src/helpers/commonHelper';
import { helpers } from '../../src/helpers/index';
import {
  LibraryEngineModelTrainStatus,
  SetEntityProfileImage
} from '../../src/gql';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();
const imageUrl = 'https://www.veritone.com/images/logo.svg';

describe('citest_library: library end-to-end CRUD/publish flow', () => {
  let gqlClient: GraphqlClient;

  let engineId: string;
  let organizationId: string;

  let libraryId: string;
  let secondLibraryId: string;
  let entityId: string;
  let secondEntityId: string;
  let entityIdentifierId: string;
  let secondEntityIdentifierId: string;
  let thirdEntityIdentifierId: string;
  let engineModelId: string;
  let secondEngineModelId: string;

  let writeableSignedUrl: string;
  let writeableUnsignedUrl: string;
  let getSignedUrl: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  afterAll(async () => {
    for (const id of [
      entityIdentifierId,
      secondEntityIdentifierId,
      thirdEntityIdentifierId
    ]) {
      if (id) {
        await safe('delete entity identifier', () =>
          gqlClient.sdk.deleteEntityIdentifier({ id })
        );
      }
    }
    for (const id of [entityId, secondEntityId]) {
      if (id) {
        await safe('delete entity', () => gqlClient.sdk.deleteEntity({ id }));
      }
    }
    for (const id of [engineModelId, secondEngineModelId]) {
      if (id) {
        await safe('delete library engine model', () =>
          gqlClient.sdk.deleteLibraryEngineModel({ id })
        );
      }
    }
    for (const id of [libraryId, secondLibraryId]) {
      if (id) {
        await safe('delete library', () => gqlClient.sdk.deleteLibrary({ id }));
      }
    }
  });

  it('selects an engine with a library and the current organization', async () => {
    const enginesResult = await gqlClient.sdk.engines({
      limit: 1,
      libraryRequired: true
    });
    engineId = enginesResult?.data?.engines?.records?.[0]?.id!;
    expect(engineId).toBeDefined();

    const meResult = await gqlClient.sdk.me();
    organizationId = meResult?.data?.me?.organizationId!;
    expect(organizationId).toBeDefined();
  });

  it('lists library types', async () => {
    const result = await gqlClient.sdk.libraryTypesAndType({
      libraryTypeId: 'people'
    });

    expect(result?.data?.libraryTypes?.count).toBeGreaterThan(1);
    expect(result?.data?.libraryType?.id).toBeDefined();
  });

  it('creates a library', async () => {
    const result = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-testlibrary-${appKey}`,
        libraryTypeId: 'people',
        coverImageUrl: imageUrl
      }
    });

    libraryId = result?.data?.createLibrary?.id!;
    expect(libraryId).toBeDefined();

    const url = result?.data?.createLibrary?.coverImageUrl!;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('cover'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(libraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('creates a second library', async () => {
    const result = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-testlibrary2-${appKey}`,
        libraryTypeId: 'people',
        coverImageUrl: imageUrl
      }
    });

    secondLibraryId = result?.data?.createLibrary?.id!;
    expect(secondLibraryId).toBeDefined();
    expect(result?.data?.createLibrary?.coverImageUrl).toBeDefined();
  });

  it('fails to create a library with an unknown libraryTypeId', async () => {
    const promise = gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-testlibrary-badtype-${appKey}`,
        libraryTypeId: 'nonexistent_library_type_134235q4545'
      }
    });

    await expect(promise).rejects.toThrow('not_found');
  });

  it('creates a library engine model with an external dataUrl', async () => {
    const result = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId,
        engineId,
        trainStatus: LibraryEngineModelTrainStatus.Pending,
        dataUrl: imageUrl,
        accuracy: 75
      }
    });

    engineModelId = result?.data?.createLibraryEngineModel?.id!;
    expect(engineModelId).toBeDefined();

    const url = result?.data?.createLibraryEngineModel?.dataUrl!;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('library-engine-data-model'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(libraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('gets a writeable signed url', async () => {
    const result = await gqlClient.sdk.getSignedWritableUrl();
    writeableSignedUrl = result?.data?.getSignedWritableUrl?.url!;
    writeableUnsignedUrl = result?.data?.getSignedWritableUrl?.unsignedUrl!;
    getSignedUrl = result?.data?.getSignedWritableUrl?.getUrl!;

    expect(writeableSignedUrl).toBeDefined();
    expect(writeableUnsignedUrl).toBeDefined();
  });

  it('uploads a file using the writeable signed url', async () => {
    if (gqlClient.environment.includes('local')) {
      return;
    }
    const result = await helpers
      .supertest(writeableSignedUrl)
      .put('')
      .send({ test: 'test object' })
      .expect(200);
    expect(result).toBeDefined();
  });

  it('creates a library engine model with an unsigned url', async () => {
    const result = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId: secondLibraryId,
        engineId,
        trainStatus: LibraryEngineModelTrainStatus.Pending,
        dataUrl: writeableUnsignedUrl,
        accuracy: 75
      }
    });

    secondEngineModelId = result?.data?.createLibraryEngineModel?.id!;
    expect(secondEngineModelId).toBeDefined();
    expect(result?.data?.createLibraryEngineModel?.dataUrl).toBeDefined();
  });

  it('gets a library engine model', async () => {
    const result = await gqlClient.sdk.libraryEngineModel({
      id: engineModelId
    });
    expect(result?.data?.libraryEngineModel?.id).toEqual(engineModelId);
    expect(result?.data?.libraryEngineModel?.accuracy).toEqual(75);
  });

  it('gets the second library engine model', async () => {
    const result = await gqlClient.sdk.libraryEngineModel({
      id: secondEngineModelId
    });
    expect(result?.data?.libraryEngineModel?.id).toEqual(secondEngineModelId);
    expect(result?.data?.libraryEngineModel?.accuracy).toEqual(75);
  });

  it('updates a library', async () => {
    const result = await gqlClient.sdk.UpdateLibrary({
      input: {
        id: libraryId,
        description: `${citestMarker}-test library renamed`,
        coverImageUrl: ''
      }
    });

    expect(result?.data?.updateLibrary?.id).toEqual(libraryId);
    expect(result?.data?.updateLibrary?.description).toEqual(
      `${citestMarker}-test library renamed`
    );
    expect(result?.data?.updateLibrary?.name).toEqual(
      `${citestMarker}-testlibrary-${appKey}`
    );
    expect(result?.data?.updateLibrary?.coverImageUrl).toEqual(null);
  });

  it('publishes a library', async () => {
    const result = await gqlClient.sdk.publishLibrary({ id: libraryId });
    expect(result?.data?.publishLibrary?.id).toEqual(libraryId);
    expect(result?.data?.publishLibrary?.version).toEqual(1);
  });

  it('updates a library engine model', async () => {
    const result = await gqlClient.sdk.updateLibraryEngineModel({
      input: {
        id: engineModelId,
        trainStatus: LibraryEngineModelTrainStatus.Complete,
        accuracy: 90
      }
    });

    expect(result?.data?.updateLibraryEngineModel?.id).toEqual(engineModelId);
    expect(result?.data?.updateLibraryEngineModel?.trainStatus).toEqual(
      LibraryEngineModelTrainStatus.Complete
    );

    // URL changes after the file is ingested and stored to S3
    expect(result?.data?.updateLibraryEngineModel?.dataUrl).toBeDefined();
    expect(result?.data?.updateLibraryEngineModel?.accuracy).toEqual(90);
  });

  it('updates a library engine model with a data file', async () => {
    const query = `mutation {
      updateLibraryEngineModel(input: {
        id: "${engineModelId}"
        contentType: "application/octet-stream"
      })  {
        id
        trainStatus
        dataUrl
        contentType
        createdDateTime
        modifiedDateTime
      }
    }`;

    const uploadResult = await gqlClient.uploadFile(
      query,
      'beatles.facebox',
      path.join(__dirname, '../../../../data/beatles.facebox')
    );
    const result = JSON.parse(uploadResult.text);
    const record = result.data.updateLibraryEngineModel;
    expect(record.id).toEqual(engineModelId);
    expect(record.contentType).toEqual('application/octet-stream');
    expect(record.modifiedDateTime).toBeDefined();
    expect(record.createdDateTime).toBeDefined();
    expect(moment(record.createdDateTime).isBefore(moment.utc())).toEqual(true);

    const url = record.dataUrl;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('library-engine-data-model'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(libraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('gets a library engine model after the data file update', async () => {
    const result = await gqlClient.sdk.libraryEngineModel({
      id: engineModelId
    });
    expect(result?.data?.libraryEngineModel?.id).toEqual(engineModelId);
    expect(result?.data?.libraryEngineModel?.trainStatus).toEqual(
      LibraryEngineModelTrainStatus.Complete
    );
    expect(result?.data?.libraryEngineModel?.dataUrl).toBeDefined();
    expect(result?.data?.libraryEngineModel?.contentType).toEqual(
      'application/octet-stream'
    );
  });

  it('updates a library engine model with a signed uri in our bucket', async () => {
    const result = await gqlClient.sdk.updateLibraryEngineModel({
      input: {
        id: engineModelId,
        dataUrl: getSignedUrl
      }
    });

    expect(result?.data?.updateLibraryEngineModel?.id).toEqual(engineModelId);

    // URL changes after the file is ingested and stored to S3
    expect(result?.data?.updateLibraryEngineModel?.dataUrl).toBeDefined();
  });

  it('creates an entity with jsondata', async () => {
    const result = await gqlClient.sdk.createEntity({
      input: {
        libraryId,
        name: `${citestMarker}-test-entity-${appKey}`,
        description: 'test description',
        jsondata: { foo: 'bar' },
        profileImageUrl: imageUrl
      }
    });

    const entity = result?.data?.createEntity!;
    entityId = entity?.id!;
    expect(entityId).toBeDefined();
    expect(entity?.jsondata?.foo).toEqual('bar');
    expect(entity?.description).toEqual('test description');

    const url = entity?.profileImageUrl!;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('profile'));
  });

  it('creates an entity with jsonstring', async () => {
    const result = await gqlClient.sdk.createEntity({
      input: {
        libraryId,
        name: `${citestMarker}-test-entity-${appKey}-2`,
        jsonstring: '{ "foo": "bar" }'
      }
    });

    secondEntityId = result?.data?.createEntity?.id!;
    expect(secondEntityId).toBeDefined();
    expect(result?.data?.createEntity?.jsondata?.foo).toEqual('bar');
  });

  it('finds an entity by name and inspects nested library data', async () => {
    const byName = await gqlClient.sdk.library({
      id: libraryId,
      entityName: `test-entity-${appKey}`
    });
    expect(byName?.data?.library?.entities?.records?.[0]?.id).toEqual(entityId);

    const byIds = await gqlClient.sdk.library({
      id: libraryId,
      entityIds: [entityId]
    });
    expect(byIds?.data?.library?.entities?.records?.[0]?.id).toEqual(entityId);

    const latest = await gqlClient.sdk.library({
      id: libraryId,
      engineModelLastModified: true
    });
    expect(latest?.data?.library?.engineModels?.count).toEqual(1);

    const queued = await gqlClient.sdk.library({
      id: libraryId,
      engineModelTrainStatus: LibraryEngineModelTrainStatus.Queued
    });
    expect(queued?.data?.library?.engineModels?.count).toEqual(0);

    const complete = await gqlClient.sdk.library({
      id: libraryId,
      engineModelTrainStatus: LibraryEngineModelTrainStatus.Complete
    });
    expect(complete?.data?.library?.engineModels?.count).toEqual(1);

    // used by core-job-server
    const engineIdComplete = await gqlClient.sdk.library({
      id: libraryId,
      engineModelTrainStatus: LibraryEngineModelTrainStatus.Complete,
      engineModelEngineId: engineId,
      engineModelLimit: 1
    });
    expect(engineIdComplete?.data?.library?.engineModels?.count).toEqual(1);
    expect(
      engineIdComplete?.data?.library?.engineModels?.records?.[0]?.engineId
    ).toEqual(engineId);
  });

  it('updates an entity', async () => {
    const result = await gqlClient.sdk.updateEntity({
      input: {
        id: entityId,
        name: `${citestMarker}-test entity renamed`,
        jsondata: { foo: 'bar' },
        profileImageUrl: imageUrl
      }
    });

    const record = result?.data?.updateEntity!;
    expect(record?.id).toEqual(entityId);
    expect(record?.name).toEqual(`${citestMarker}-test entity renamed`);
    expect(record?.jsondata?.foo).toEqual('bar');

    const url = record?.profileImageUrl!;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('entity'));
    expect(url).toEqual(expect.stringContaining('profile'));
  });

  it('creates an entity identifier - no file', async () => {
    const result = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: 'face',
        contentType: 'image/jpeg',
        url: imageUrl,
        jsondata: { foo: 'bar' },
        profileUpdateMode: SetEntityProfileImage.IfNotSet
      }
    });

    entityIdentifierId = result?.data?.createEntityIdentifier?.id!;
    expect(entityIdentifierId).toBeDefined();
    expect(result?.data?.createEntityIdentifier?.jsondata?.foo).toEqual('bar');
    expect(
      result?.data?.createEntityIdentifier?.entity?.profileImageUrl
    ).toBeDefined();
  });

  it('creates an entity identifier - stored by reference', async () => {
    const result = await gqlClient.sdk.createEntityIdentifier({
      input: {
        entityId,
        identifierTypeId: 'face',
        contentType: 'image/jpeg',
        storeReference: true,
        url: imageUrl,
        jsondata: { foo: 'bar' },
        profileUpdateMode: SetEntityProfileImage.None
      }
    });

    secondEntityIdentifierId = result?.data?.createEntityIdentifier?.id!;
    expect(secondEntityIdentifierId).toBeDefined();
  });

  it('updates an entity identifier - no file', async () => {
    const result = await gqlClient.sdk.UpdateEntityIdentifier({
      input: {
        id: entityIdentifierId,
        title: `${citestMarker}-new test_name`,
        url: 'https://www.veritone.com/wp/wp-content/uploads/2017/05/veritoneregistered16.png',
        jsondata: { foo: 'bar', contentType: 'foo' }
      }
    });

    const record = result?.data?.updateEntityIdentifier!;
    expect(record?.id).toEqual(entityIdentifierId);
    expect(record?.url).toEqual(
      'https://www.veritone.com/wp/wp-content/uploads/2017/05/veritoneregistered16.png'
    );
    expect(record?.jsondata?.foo).toEqual('bar');
  });

  it('creates an entity identifier - with file', async () => {
    const query = `mutation {
      createEntityIdentifier(input: {
        entityId: "${entityId}"
        identifierTypeId: "face"
        contentType: "image/jpeg"
        jsonstring: "{ \\"foo\\":\\"bar\\" }"
      }) {
        id
        url
        jsondata
        jsonstring
      }
    }`;

    const uploadResult = await gqlClient.uploadFile(
      query,
      'wed2.jpeg',
      path.join(__dirname, '../../../../data/wed2.jpeg')
    );
    const result = JSON.parse(uploadResult.text);
    const record = result.data.createEntityIdentifier;
    thirdEntityIdentifierId = record.id;
    expect(thirdEntityIdentifierId).toBeDefined();
    expect(record.jsondata?.foo).toEqual('bar');

    const url = record.url;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('entity-identifier'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(libraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('gets entity and identifiers', async () => {
    const entityResult = await gqlClient.sdk.entity({ id: entityId });
    expect(entityResult?.data?.entity?.identifiers?.records?.length).toEqual(3);
    expect(entityResult?.data?.entity?.summary).toBeDefined();
    expect(entityResult?.data?.entity?.description).toEqual('test description');
    expect(entityResult?.data?.entity?.library).toBeDefined();

    const byId = await gqlClient.sdk.entities({ ids: [entityId] });
    expect(byId?.data?.entities?.records?.[0]?.id).toEqual(entityId);

    const byLibrary = await gqlClient.sdk.entities({ libraryIds: [libraryId] });
    expect(byLibrary?.data?.entities?.records?.map((r: any) => r.id)).toEqual(
      expect.arrayContaining([entityId, secondEntityId])
    );
  });

  it('lists libraries with nested entities/collaborators/libraryType/summary/engineModels', async () => {
    const result = await gqlClient.sdk.librariesWithDetails({
      name: `${citestMarker}-testlibrary`,
      limit: 1
    });

    const records = result?.data?.libraries?.records!;
    expect(records).toHaveLength(1);
    expect(records[0]?.organizationId).toBeDefined();
    expect(records[0]?.engineModels?.records?.length).toBeGreaterThan(0);
    expect(records[0]?.engineModels?.records?.[0]?.library).toBeDefined();
  });

  it('finds a library by library type', async () => {
    const result = await gqlClient.sdk.librariesWithDetails({
      limit: 1,
      type: 'people'
    });

    const records = result?.data?.libraries?.records!;
    expect(records).toHaveLength(1);
    expect(records[0]?.summary).toBeDefined();
    expect(records[0]?.libraryType?.id).toEqual('people');
  });

  it('finds libraries by entity identifier type id', async () => {
    const result = await gqlClient.sdk.librariesWithDetails({
      limit: 1,
      entityIdentifierTypeIds: ['face']
    });

    const records = result?.data?.libraries?.records!;
    expect(records).toHaveLength(1);
    expect(records[0]?.libraryType?.entityIdentifierTypes?.[0]?.id).toEqual(
      'face'
    );
  });

  it('queries library and entity summary', async () => {
    const result = await gqlClient.sdk.library({
      id: libraryId,
      entityId
    });

    const record = result?.data?.library!;
    expect(record?.entities?.records?.length).toEqual(1);
    expect(
      record?.entities?.records?.[0]?.identifiers?.records?.length
    ).toEqual(3);
    expect(record?.summary).toBeDefined();
    expect(record?.entities?.records?.[0]?.summary).toBeDefined();
    expect(record?.summary?.entityCount).toEqual(2);
    expect(record?.summary?.unpublishedEntityCount).toEqual(2);
  });
});
