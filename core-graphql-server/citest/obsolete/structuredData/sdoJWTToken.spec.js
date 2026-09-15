const helpers = require('../../helpers/index');
const orgHelpers = require('../../helpers/organization');
const userHelpers = require('../../helpers/user');
const dataRegistyHelpers = require('../../helpers/dataRegistry');
const schemaHelpers = require('../../helpers/schema');
const sdoHelpers = require('../../helpers/sdo');
const folderHelpers = require('../../helpers/folder');
const engineHelpers = require('../../helpers/engine');
const GraphqlClient = require('../../helpers/gql');
const { safe } = require('../../helpers/cleanup/utils');
const chakram = require('chakram');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const role = require('../../../dal/role');

const citestMarker = global.citestMarker || 'citest-should-delete';
const CMS_APPLICATION_ID = '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5';
let gqlClient;

const testSchemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    name: {
      type: 'string',
      title: 'Name'
    },
    phone: {
      type: 'string',
      title: 'Phone'
    }
  }
};

describe('citest_structureddata: structured data citest with jwt token usages', () => {
  let superAdminOptions, superToken;
  let dataRegistryId, schemaId;
  let engineCategoryId, engineId;
  let jwtToken, jwtTokenOptions;
  let sdoId;
  let cmsRootFolderId, newFolderId, contentFolderTemplateId;
  let orgId;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    orgId = _.get(result, 'organizationId'); 
    superAdminOptions = helpers.requestOptions(superToken);

    // Re-login so the session token is committed to Redis before graphql validates it.
    // Docker Compose startup race: initial connect() token may not be visible in Redis yet.
    result = await gqlClient.connect();
    superToken = result.token;
    superAdminOptions = helpers.requestOptions(superToken);

    const dataRegistryRes = await dataRegistyHelpers.helpCreateDataRegistry(
      { gqlClient, options: superAdminOptions },
      {
        name: `ENGINE_DR_${citestMarker}`,
        description: 'citest jwt token registry',
        source: 'citest jwt token source'
      }
    );
    expect(dataRegistryRes.createDataRegistry.id).toBeDefined();
    dataRegistryId = dataRegistryRes.createDataRegistry.id;

    const createSchemaRes = await schemaHelpers.helpUpsertSchemaDraft(
      { gqlClient, options: superAdminOptions },
      {
        dataRegistryId,
        schema: testSchemaInput
      }
    );
    const upsertSchemaDraft = _.get(createSchemaRes, 'upsertSchemaDraft');
    expect(upsertSchemaDraft).toBeDefined();
    schemaId = upsertSchemaDraft.id;
    expect(schemaId).toBeDefined();
    expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
    expect(upsertSchemaDraft.status).toEqual('draft');
    expect(upsertSchemaDraft.definition).toEqual(testSchemaInput);
    expect(upsertSchemaDraft.validActions).toEqual([
      'view',
      'edit',
      'publish',
      'delete'
    ]);

    const publishSchemaRes = await schemaHelpers.helpPublishSchema(
      { gqlClient, options: superAdminOptions },
      {
        id: schemaId,
        breakingChanges: false
      }
    );
    const updateSchemaState = _.get(publishSchemaRes, 'updateSchemaState');
    expect(updateSchemaState).toBeDefined();
    expect(updateSchemaState.id).toEqual(schemaId);
    expect(updateSchemaState.status).toEqual('published');
    expect(updateSchemaState.createdDateTime).toBeDefined();
    expect(updateSchemaState.modifiedDateTime).toBeDefined();
    expect(updateSchemaState.validActions).toEqual([
      'view',
      'edit',
      'deactivate',
      'delete'
    ]);

    const engineCategory = await engineHelpers.getEngineCategories(gqlClient);
    engineCategoryId = engineCategory.id;

    const jwtTestEngineName = `JWT_TEST_ENGINE-${citestMarker}`;
    engineId = await createEngine(
      { gqlClient, options: superAdminOptions },
      {
        name: jwtTestEngineName,
        categoryId: engineCategoryId
      }
    );

    jwtToken = await genEngineJWT(
      { gqlClient, options: superAdminOptions },
      {
        engineId: engineId,
        schemaId: schemaId
      }
    );

    jwtTokenOptions = helpers.requestOptions(jwtToken);
  });

  afterAll(async () => {
    if (contentFolderTemplateId) {
      await safe('delete content folder template', async () => {
        await folderHelpers.helpDeleteContentFolderTemplate(
          { gqlClient, options: superAdminOptions },
          { id: contentFolderTemplateId }
        );
      });
    }

    if (newFolderId) {
      await safe('delete folder', async () => {
        await folderHelpers.helpDeleteFolder(
          { gqlClient, options: superAdminOptions },
          { folderId: newFolderId, orderIndex: 0 }
        );
      });
    }

    if (schemaId) {
      await safe('delete schema', async () => {
        await schemaHelpers.helpDeleteSchema(
          {
            gqlClient,
            options: superAdminOptions
          },
          { schemaId: schemaId }
        );
      });
    }

    if (engineId) {
      await safe('delete engine', async () => {
        await deleteEngine({ gqlClient, options: superAdminOptions }, engineId);
      });
    }
  });

  it('create a structured data should success', async () => {
    let recResult;
    recResult = await sdoHelpers.helpCreateStructuredData(
      { gqlClient, options: jwtTokenOptions },
      {
        schemaId: schemaId,
        data: {
          name: `${citestMarker}@veritone.com`,
          phone: '(714) 555-5555'
        }
      }
    );
    expect(recResult).toBeDefined();
    sdoId = _.get(recResult, 'createStructuredData.id');
  });

  it('get structured data should success', async () => {
    let recResult;
    let data = null;

    const variables = {
      schemaId: schemaId,
      ids: [sdoId]
    };

    recResult = await sdoHelpers.helpGetStructuredDataObjects(
      { gqlClient, options: jwtTokenOptions },
      variables
    );

    expect(recResult).toBeDefined();
    data = recResult.structuredDataObjects;
    expect(data).toBeDefined();
    expect(data.records).toBeDefined();
    expect(data.records.length > 0).toEqual(true);
    expect(data.records.length).toEqual(data.count);
  });

  it('read sdo with schema query should success', async () => {
    let recResult;

    recResult = await schemaHelpers.helpGetSchema(
      { gqlClient, options: jwtTokenOptions },
      { id: schemaId }
    );

    expect(recResult).toBeDefined();
    expect(recResult.schema).toBeDefined();
    expect(recResult.schema.id).toEqual(schemaId);
    expect(recResult.schema.structuredDataObjects).toBeDefined();
    expect(recResult.schema.structuredDataObjects.records).toBeDefined();
    expect(
      recResult.schema.structuredDataObjects.records.length
    ).toBeGreaterThan(0);
    expect(
      _.find(recResult.schema.structuredDataObjects.records, { id: sdoId })
    ).toBeDefined();
  });

  it('update data structure should success', async () => {
    var recResult;
    var createStructuredData = null;

    recResult = await sdoHelpers.helpCreateStructuredData(
      { gqlClient, options: jwtTokenOptions },
      {
        id: sdoId,
        schemaId: schemaId,
        data: { phone: '(714) 666-6666' }
      }
    );

    expect(recResult).toBeDefined();
    createStructuredData = _.get(recResult, 'createStructuredData');
    expect(createStructuredData).toBeDefined();
  });

  it('create folder content template with sdo should success', async () => {
    const rootFolders = await folderHelpers.helpGetRootFolders(
      { gqlClient, options: superAdminOptions },
      'cms'
    );
    expect(rootFolders.length).toBeGreaterThan(0);
    expect(_.get(rootFolders[0], 'name')).toContain('Root Folder');
    cmsRootFolderId = _.get(rootFolders[0], 'id');

    const createFolder = await folderHelpers.helpCreateFolder(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-folder-${uuid.v4()}`,
        description: 'test folder for rbac created by admin user',
        parentId: cmsRootFolderId,
        rootFolderType: 'cms'
      }
    );
    expect(createFolder).toBeDefined();
    expect(_.get(createFolder, 'name')).toContain(`${citestMarker}-folder`);
    newFolderId = _.get(createFolder, 'id');

    const createFolderContentTemplateResult =
      await folderHelpers.helpCreateFolderContentTemplate(
        { gqlClient, options: jwtTokenOptions },
        {
          folderId: newFolderId,
          sdoId: sdoId,
          schemaId: schemaId
        }
      );
    const folderContentTemplate = _.get(
      createFolderContentTemplateResult,
      'createFolderContentTemplate'
    );
    expect(folderContentTemplate.id).toBeDefined();
    expect(folderContentTemplate.sdoId).toEqual(sdoId);
    contentFolderTemplateId = folderContentTemplate.id;
  });

  it('create tdo with belonged sdo should fail', async () => {
    const result = gqlClient.query(
      `mutation {
          createTDO(
            input: {
              status: "uploaded",
              startDateTime: 1476726655,
              stopDateTime: 1476726755,
              contentTemplates: [{sdoId: "${sdoId}", schemaId: "${schemaId}"}]
            }
          ) {
            id
          }
        }`,
      {},
      jwtTokenOptions
    );
    await expect(result).rejects.toThrow(/not authorized/i);
  });

  it('delete structured data should success', async () => {
    let recResult;

    const variables = {
      schemaId: schemaId,
      id: sdoId
    };

    recResult = await sdoHelpers.helpDeleteStructuredData(
      { gqlClient, options: jwtTokenOptions },
      variables
    );

    expect(recResult).toBeDefined();
    expect(recResult.deleteStructuredData).toBeDefined();
    expect(recResult.deleteStructuredData.id).toBeDefined();
  });

  it('create and delete sdo with application jwt should success', async () => {
    // Get an application-scoped JWT
    const appJwtResult = await gqlClient.query(
      `mutation {
        getApplicationJWT(input: {
          appId: "${CMS_APPLICATION_ID}"
          orgId: "${orgId}"
          roleIds: [
            "68d053f4-2ff3-4816-a9fd-b9d24798c9c8"
            "ddca9b68-d775-4934-8ffd-7aecc779b652"
          ]
        }) {
          token
          applicationId
        }
      }`,
      {},
      superAdminOptions
    );

    const appJwtToken = _.get(appJwtResult, 'getApplicationJWT.token');
    expect(appJwtToken).toBeDefined();
    const appJwtOptions = helpers.requestOptions(appJwtToken);

    // Create an SDO using the application JWT
    const createResult = await sdoHelpers.helpCreateStructuredData(
      { gqlClient, options: appJwtOptions },
      {
        schemaId: schemaId,
        data: { name: `${citestMarker}@veritone.com`, phone: '(714) 555-5555' }
      }
    );
    const appJwtSdoId = _.get(createResult, 'createStructuredData.id');
    expect(appJwtSdoId).toBeDefined();

    // Delete the SDO using the same application JWT
    const deleteResult = await sdoHelpers.helpDeleteStructuredData(
      { gqlClient, options: appJwtOptions },
      { id: appJwtSdoId, schemaId: schemaId }
    );
    expect(_.get(deleteResult, 'deleteStructuredData.id')).toEqual(appJwtSdoId);
  });
});

async function createEngine(client, input) {
  const { gqlClient, options } = client;
  const { name, categoryId } = input;
  let query = `
      mutation {
        createEngine(input: {
          name: "${name}"
          categoryId: "${categoryId}"
          deploymentModel: FullyNetworkIsolated
        }) {
          id
          name
          categoryId
          deploymentModel
          state
        }
      }
    `;
  let result = await gqlClient.query(query, {}, options);

  expect(result.createEngine).toBeDefined();
  expect(result.createEngine.id).toBeDefined();
  expect(result.createEngine.name).toEqual(name);
  expect(result.createEngine.categoryId).toEqual(categoryId);
  expect(result.createEngine.deploymentModel).toEqual('FullyNetworkIsolated');
  expect(result.createEngine.state).toEqual('pending');

  return result.createEngine.id;
}

async function genEngineJWT(client, input) {
  const { gqlClient, options } = client;
  const { engineId, schemaId } = input;
  let query = `
        mutation {
          getEngineJWT(input: {
            engineId: "${engineId}"
            resource: {
              schemaId: "${schemaId}"
            }
          }) {
            token
          }
        }`;

  let result = await gqlClient.query(query, {}, options);
  expect(result.getEngineJWT.token).toBeDefined();

  return result.getEngineJWT.token;
}

async function deleteEngine(client, engineId) {
  const { gqlClient, options } = client;
  let query = `
    mutation {
      deleteEngine(id: "${engineId}") {
        id
      }
    }`;

  let result = await gqlClient.query(query, {}, options);
  const deletedEngineId = _.get(result, 'deleteEngine.id');
  expect(deletedEngineId).toBeDefined();
}
