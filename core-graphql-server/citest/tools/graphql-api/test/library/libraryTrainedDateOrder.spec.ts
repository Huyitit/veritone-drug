import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { helpers } from '../../src/helpers/index';
import { safe } from '../../src/helpers/commonHelper';
import {
  DeploymentModel,
  LibraryEngineModelTrainStatus,
  LibraryOrderBy,
  OrderDirection
} from '../../src/gql';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const appKey = Date.now();

describe('citest_library: libraries orderBy lastTrainedDateTime', () => {
  let gqlClient: GraphqlClient;
  let engineId: string;
  let createdEngineId: string | undefined;
  let trainedLibraryId: string;
  let trainedLibraryId2: string;
  let untrainedLibraryId: string;
  let engineModelId: string;
  let engineModelId2: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  afterAll(async () => {
    if (engineModelId) {
      await safe('delete engine model', () =>
        gqlClient.sdk.deleteLibraryEngineModel({ id: engineModelId })
      );
    }
    if (engineModelId2) {
      await safe('delete engine model 2', () =>
        gqlClient.sdk.deleteLibraryEngineModel({ id: engineModelId2 })
      );
    }
    for (const id of [
      trainedLibraryId,
      trainedLibraryId2,
      untrainedLibraryId
    ]) {
      if (id) {
        await safe('delete library', () => gqlClient.sdk.deleteLibrary({ id }));
      }
    }
    if (createdEngineId) {
      await safe('delete engine', () =>
        gqlClient.sdk.deleteEngine({ id: createdEngineId! })
      );
    }
  });

  it('selects or creates an engine with libraryRequired:true', async () => {
    const result = await gqlClient.sdk.engines({
      limit: 1,
      libraryRequired: true
    });
    engineId = result?.data?.engines?.records?.[0]?.id!;

    if (!engineId) {
      const catResult = await gqlClient.sdk.engineCategories({ limit: 1 });
      const categoryId = catResult?.data?.engineCategories?.records?.[0]?.id;
      expect(categoryId).toBeDefined();

      const createResult = await gqlClient.sdk.createEngine({
        input: {
          name: `${citestMarker}-ordering-engine-${appKey}`,
          categoryId: categoryId!,
          deploymentModel: DeploymentModel.FullyNetworkIsolated,
          libraryRequired: true
        }
      });
      engineId = createResult?.data?.createEngine?.id!;
      createdEngineId = engineId;
    }

    expect(engineId).toBeDefined();
  });

  it('creates trained library', async () => {
    const result = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-ordering-trained-${appKey}`,
        libraryTypeId: 'people'
      }
    });
    trainedLibraryId = result?.data?.createLibrary?.id!;
    expect(trainedLibraryId).toBeDefined();
  });

  it('creates untrained library', async () => {
    const result = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-ordering-untrained-${appKey}`,
        libraryTypeId: 'people'
      }
    });
    untrainedLibraryId = result?.data?.createLibrary?.id!;
    expect(untrainedLibraryId).toBeDefined();
  });

  it('creates engine model for trained library', async () => {
    const result = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId: trainedLibraryId,
        engineId,
        trainStatus: LibraryEngineModelTrainStatus.Pending
      }
    });
    engineModelId = result?.data?.createLibraryEngineModel?.id!;
    expect(engineModelId).toBeDefined();
    expect(result?.data?.createLibraryEngineModel?.trainStatus).toEqual(
      LibraryEngineModelTrainStatus.Pending
    );
  });

  it('updates engine model to complete — establishes lastTrainedDateTime', async () => {
    const result = await gqlClient.sdk.updateLibraryEngineModel({
      input: {
        id: engineModelId,
        trainStatus: LibraryEngineModelTrainStatus.Complete
      }
    });
    expect(result?.data?.updateLibraryEngineModel?.trainStatus).toEqual(
      LibraryEngineModelTrainStatus.Complete
    );
  });

  it('creates trained library 2', async () => {
    const result = await gqlClient.sdk.createLibrary({
      input: {
        name: `${citestMarker}-ordering-trained2-${appKey}`,
        libraryTypeId: 'people'
      }
    });
    trainedLibraryId2 = result?.data?.createLibrary?.id!;
    expect(trainedLibraryId2).toBeDefined();
  });

  it('creates engine model for trained library 2 and completes it', async () => {
    await helpers.sleep(1000);

    const createResult = await gqlClient.sdk.createLibraryEngineModel({
      input: {
        libraryId: trainedLibraryId2,
        engineId,
        trainStatus: LibraryEngineModelTrainStatus.Pending
      }
    });
    engineModelId2 = createResult?.data?.createLibraryEngineModel?.id!;
    expect(engineModelId2).toBeDefined();

    const updateResult = await gqlClient.sdk.updateLibraryEngineModel({
      input: {
        id: engineModelId2,
        trainStatus: LibraryEngineModelTrainStatus.Complete
      }
    });
    expect(updateResult?.data?.updateLibraryEngineModel?.trainStatus).toEqual(
      LibraryEngineModelTrainStatus.Complete
    );
  });

  it('orderBy lastTrainedDateTime desc — newer trained first, untrained last', async () => {
    const result = await gqlClient.sdk.libraries({
      name: `${citestMarker}-ordering-`,
      orderBy: LibraryOrderBy.LastTrainedDateTime,
      orderDirection: OrderDirection.Desc,
      limit: 100
    });

    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toContain(trainedLibraryId);
    expect(ids).toContain(trainedLibraryId2);
    expect(ids).toContain(untrainedLibraryId);

    expect(ids!.indexOf(trainedLibraryId2)).toBeLessThan(
      ids!.indexOf(trainedLibraryId)
    );

    expect(ids!.indexOf(trainedLibraryId)).toBeLessThan(
      ids!.indexOf(untrainedLibraryId)
    );
  });

  it('orderBy lastTrainedDateTime asc — older trained first, untrained last', async () => {
    const result = await gqlClient.sdk.libraries({
      name: `${citestMarker}-ordering-`,
      orderBy: LibraryOrderBy.LastTrainedDateTime,
      orderDirection: OrderDirection.Asc,
      limit: 100
    });

    const ids = result?.data?.libraries?.records?.map((r: any) => r.id);
    expect(ids).toContain(trainedLibraryId);
    expect(ids).toContain(trainedLibraryId2);
    expect(ids).toContain(untrainedLibraryId);

    expect(ids!.indexOf(trainedLibraryId)).toBeLessThan(
      ids!.indexOf(trainedLibraryId2)
    );

    expect(ids!.indexOf(trainedLibraryId2)).toBeLessThan(
      ids!.indexOf(untrainedLibraryId)
    );
  });
});
