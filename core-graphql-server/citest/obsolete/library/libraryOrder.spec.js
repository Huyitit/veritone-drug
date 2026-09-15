'use strict';

const _ = require('lodash');
const GraphqlClient = require('../../helpers/gql.js');
const helpers = require('../../helpers/index.js');

const config = helpers.config;
const appKey = Date.now();
const citestMarker = global.citestMarker || 'citest-should-delete';

let gqlClient;
let engineId;
let createdEngineId;
let trainedLibraryId;
let trainedLibraryId2;
let untrainedLibraryId;
let engineModelId;
let engineModelId2;

describe('citest_library: libraries orderBy lastTrainedDateTime', () => {
  beforeAll(async () => {
    gqlClient = new GraphqlClient(config.env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
  });

  it('select or create an engine with libraryRequired:true', async () => {
    const result = await gqlClient.query(`
      query {
        engines(limit: 1, libraryRequired: true) {
          records { id }
        }
      }
    `);
    engineId = _.get(result, 'engines.records[0].id');

    if (!engineId) {
      const catResult = await gqlClient.query(`
        query {
          engineCategories(limit: 1) {
            records { id }
          }
        }
      `);
      const categoryId = _.get(catResult, 'engineCategories.records[0].id');
      expect(categoryId).toBeDefined();

      const createResult = await gqlClient.query(`
        mutation {
          createEngine(input: {
            name: "${citestMarker}-ordering-engine-${appKey}"
            categoryId: "${categoryId}"
            deploymentModel: FullyNetworkIsolated
            libraryRequired: true
          }) {
            id
          }
        }
      `);
      engineId = _.get(createResult, 'createEngine.id');
      createdEngineId = engineId;
    }

    expect(engineId).toBeDefined();
  });

  it('create trained library', async () => {
    const result = await gqlClient.query(`
      mutation {
        createLibrary(input: {
          name: "${citestMarker}-ordering-trained-${appKey}"
          libraryTypeId: "people"
        }) {
          id
        }
      }
    `);
    trainedLibraryId = _.get(result, 'createLibrary.id');
    expect(trainedLibraryId).toBeDefined();
  });

  it('create untrained library', async () => {
    const result = await gqlClient.query(`
      mutation {
        createLibrary(input: {
          name: "${citestMarker}-ordering-untrained-${appKey}"
          libraryTypeId: "people"
        }) {
          id
        }
      }
    `);
    untrainedLibraryId = _.get(result, 'createLibrary.id');
    expect(untrainedLibraryId).toBeDefined();
  });

  it('create engine model for trained library', async () => {
    const result = await gqlClient.query(`
      mutation {
        createLibraryEngineModel(input: {
          libraryId: "${trainedLibraryId}"
          engineId: "${engineId}"
          trainStatus: pending
        }) {
          id
          trainStatus
        }
      }
    `);
    engineModelId = _.get(result, 'createLibraryEngineModel.id');
    expect(engineModelId).toBeDefined();
    expect(_.get(result, 'createLibraryEngineModel.trainStatus')).toEqual('pending');
  });

  it('update engine model to complete — establishes lastTrainedDateTime', async () => {
    const result = await gqlClient.query(`
      mutation {
        updateLibraryEngineModel(input: {
          id: "${engineModelId}"
          trainStatus: complete
        }) {
          id
          trainStatus
        }
      }
    `);
    expect(_.get(result, 'updateLibraryEngineModel.trainStatus')).toEqual('complete');
  });

  it('create trained library 2', async () => {
    const result = await gqlClient.query(`
      mutation {
        createLibrary(input: {
          name: "${citestMarker}-ordering-trained2-${appKey}"
          libraryTypeId: "people"
        }) {
          id
        }
      }
    `);
    trainedLibraryId2 = _.get(result, 'createLibrary.id');
    expect(trainedLibraryId2).toBeDefined();
  });

  it('create engine model for trained library 2 and complete it', async () => {
    await helpers.sleep(1000);

    const createResult = await gqlClient.query(`
      mutation {
        createLibraryEngineModel(input: {
          libraryId: "${trainedLibraryId2}"
          engineId: "${engineId}"
          trainStatus: pending
        }) {
          id
          trainStatus
        }
      }
    `);
    engineModelId2 = _.get(createResult, 'createLibraryEngineModel.id');
    expect(engineModelId2).toBeDefined();

    const updateResult = await gqlClient.query(`
      mutation {
        updateLibraryEngineModel(input: {
          id: "${engineModelId2}"
          trainStatus: complete
        }) {
          id
          trainStatus
        }
      }
    `);
    expect(_.get(updateResult, 'updateLibraryEngineModel.trainStatus')).toEqual('complete');
  });

  it('orderBy lastTrainedDateTime desc — newer trained first, untrained last', async () => {
    const result = await gqlClient.query(`
      query {
        sorted: libraries(
          name: "${citestMarker}-ordering-"
          orderBy: lastTrainedDateTime
          orderDirection: desc
          limit: 100
        ) {
          records { id }
        }
      }
    `);

    const ids = result.sorted.records.map((r) => r.id);
    expect(ids).toContain(trainedLibraryId);
    expect(ids).toContain(trainedLibraryId2);
    expect(ids).toContain(untrainedLibraryId);

    // library2 was trained after library1 → newer timestamp → DESC puts it first
    expect(ids.indexOf(trainedLibraryId2)).toBeLessThan(ids.indexOf(trainedLibraryId));
    // Both trained libraries come before untrained (NULLS LAST)
    expect(ids.indexOf(trainedLibraryId)).toBeLessThan(ids.indexOf(untrainedLibraryId));
  });

  it('orderBy lastTrainedDateTime asc — older trained first, untrained always last (NULLS LAST)', async () => {
    const result = await gqlClient.query(`
      query {
        libraries(
          name: "${citestMarker}-ordering-"
          orderBy: lastTrainedDateTime
          orderDirection: asc
          limit: 100
        ) {
          records { id }
        }
      }
    `);

    const ids = result.libraries.records.map((r) => r.id);
    expect(ids).toContain(trainedLibraryId);
    expect(ids).toContain(trainedLibraryId2);
    expect(ids).toContain(untrainedLibraryId);

    // library1 was trained before library2 → older timestamp → ASC puts it first
    expect(ids.indexOf(trainedLibraryId)).toBeLessThan(ids.indexOf(trainedLibraryId2));
    // NULL (never trained) always sorts to the end regardless of direction
    expect(ids.indexOf(trainedLibraryId2)).toBeLessThan(ids.indexOf(untrainedLibraryId));
  });

  it('delete engine model', async () => {
    const result = await gqlClient.query(`
      mutation {
        deleteLibraryEngineModel(id: "${engineModelId}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteLibraryEngineModel.id')).toEqual(engineModelId);
  });

  it('delete engine model 2', async () => {
    const result = await gqlClient.query(`
      mutation {
        deleteLibraryEngineModel(id: "${engineModelId2}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteLibraryEngineModel.id')).toEqual(engineModelId2);
  });

  it('delete trained library', async () => {
    const result = await gqlClient.query(`
      mutation {
        deleteLibrary(id: "${trainedLibraryId}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteLibrary.id')).toEqual(trainedLibraryId);
  });

  it('delete trained library 2', async () => {
    const result = await gqlClient.query(`
      mutation {
        deleteLibrary(id: "${trainedLibraryId2}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteLibrary.id')).toEqual(trainedLibraryId2);
  });

  it('delete untrained library', async () => {
    const result = await gqlClient.query(`
      mutation {
        deleteLibrary(id: "${untrainedLibraryId}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteLibrary.id')).toEqual(untrainedLibraryId);
  });

  it('delete engine if created by this test', async () => {
    if (!createdEngineId) {
      return;
    }
    const result = await gqlClient.query(`
      mutation {
        deleteEngine(id: "${createdEngineId}") {
          id
        }
      }
    `);
    expect(_.get(result, 'deleteEngine.id')).toEqual(createdEngineId);
  });
});
