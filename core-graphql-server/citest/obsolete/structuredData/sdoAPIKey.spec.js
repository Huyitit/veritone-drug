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

const env = config.env;
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';

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

(gqlClient.isEnableResourceTest() ? describe : describe.skip)(
  'citest_structureddata: structured data citest with api key usages',
  () => {
    let superAdminOptions;
    let dataRegistryId, schemaId;
    let sdoId;
    let cmsRootFolderId, newFolderId, contentFolderTemplateId;
    let superToken;
    beforeAll(async () => {
      let result = await gqlClient.connect();
      expect(result.apiToken).toBeDefined();
      expect(result.token).toBeDefined();
      superToken = result.token;
      superAdminOptions = helpers.requestOptions(superToken);
      const firstApiToken = result.apiToken;

      // T73: warm-up connect adds async round-trip so first session token commits to Redis.
      await gqlClient.connect();
      gqlClient.userAuth = superAdminOptions;
      gqlClient.userToken = superToken;
      gqlClient.tokenAuth = helpers.requestOptions(firstApiToken);

      // Poll until the session token is active in Redis before any test uses superAdminOptions.
      for (let i = 0; i < 30; i++) {
        try {
          const meRes = await gqlClient.query(`{ me { id } }`);
          if (_.get(meRes, 'me.id')) break;
        } catch (e) {
          if (i === 29) throw e;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
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
  });

    it('should create data registry', async () => {
      const query = `
        mutation createDataRegistry(
      $name: String!
      $description: String!
      $source: String!
      $isPublic: Boolean
    ) {
      createDataRegistry(
        input: {
          name: $name
          description: $description
          source: $source
          isPublic: $isPublic
        }
      ) {
        id
        name
        description
        source
        schemas {
          records {
            id
            definition
          }
        }
        publishedSchema {
          id
        }
        organization {
          id
        }
      }
    }
      `;

      const variables = {
        name: `ENGINE_DR_${citestMarker}`,
        description: 'citest api key registry',
        source: 'citest api key source'
      };

      const res = await gqlClient.queryByAIDataOrgToken(query, variables);
      expect(res.createDataRegistry.id).toBeDefined();
      dataRegistryId = res.createDataRegistry.id;
    });

    it('should create schema draft', async () => {
      const query = `
        mutation upsertSchemaDraft($dataRegistryId: ID!, $schema: JSONData!) {
      upsertSchemaDraft(
        input: {
          dataRegistryId: $dataRegistryId
          schema: $schema
        }
      ) {
        id
        dataRegistryId
        status
        majorVersion
        minorVersion
        definition
        validActions
        organizationId
        organization {
          id
        }
      }
    }
      `;

      const variables = {
        dataRegistryId,
        schema: testSchemaInput
      };

      const res = await gqlClient.queryByAIDataOrgToken(query, variables);
      const upsertSchemaDraft = _.get(res, 'upsertSchemaDraft');
      expect(upsertSchemaDraft).toBeDefined();
      schemaId = upsertSchemaDraft.id;
      expect(schemaId).toBeDefined();
      expect(upsertSchemaDraft.dataRegistryId).toEqual(dataRegistryId);
      expect(upsertSchemaDraft.status).toEqual('draft');
      expect(upsertSchemaDraft.definition).toEqual(testSchemaInput);
      expect(upsertSchemaDraft.validActions).toEqual(['view']);
    });

    it('should publish schema draft', async () => {
      const query = `
        mutation updateSchemaState($id: ID!, $breakingChanges: Boolean!) {
      updateSchemaState(
        input: {
          id: $id
          status: published
          breakingChanges: $breakingChanges
        }
      ) {
        id
        status
        createdDateTime
        modifiedDateTime
        validActions
      }
    }
      `;

      const variables = {
        id: schemaId,
        breakingChanges: false
      };

      const res = await gqlClient.queryByAIDataOrgToken(query, variables);
      const updateSchemaState = _.get(res, 'updateSchemaState');
      expect(updateSchemaState).toBeDefined();
      expect(updateSchemaState.id).toEqual(schemaId);
      expect(updateSchemaState.status).toEqual('published');
      expect(updateSchemaState.createdDateTime).toBeDefined();
      expect(updateSchemaState.modifiedDateTime).toBeDefined();
      expect(updateSchemaState.validActions).toEqual(['view']);
    });

    it('create a structured data should success', async () => {
      const query = `
      mutation createSDO ($id: ID, $schemaId: ID!, $data: JSONData, $dataString: String){
      createStructuredData(
        input: {
          id: $id
          data: $data
          schemaId: $schemaId
          dataString: $dataString
        }
      ) {
        id
        data
        schemaId
        modifiedDateTime
        createdDateTime
      }
    }
    `;

      const variables = {
        schemaId: schemaId,
        data: {
          name: `${citestMarker}@veritone.com`,
          phone: '(714) 555-5555'
        }
      };

      const result = await gqlClient.queryByAIDataOrgToken(query, variables);
      const sdoData = _.get(result, 'createStructuredData');
      expect(sdoData).toBeDefined();
      expect(sdoData.id).toBeDefined();
      expect(sdoData.schemaId).toEqual(schemaId);

      sdoId = sdoData.id;
    });

    it('get structured data should success', async () => {
      let recResult;
      let data = null;

      const query = `
      query sdos (
      $id: ID, $ids: [ID!], $schemaId: ID!, $orderBy: [StructuredDataOrderBy!], 
      $limit: Int, $offset: Int, $owned: Boolean, $filter: JSONData, $dateTimeFilter: SdoDateTimeFilter
    ) {
      structuredDataObjects(
        id: $id
        ids: $ids
        schemaId: $schemaId
        offset: $offset
        limit: $limit
        orderBy: $orderBy
        owned: $owned
        filter: $filter
        dateTimeFilter: $dateTimeFilter
      ) {
        count
        records {
          id
          dataString
        }
      }
    }
    `;

      const variables = {
        schemaId: schemaId,
        ids: [sdoId]
      };

      recResult = await gqlClient.queryByAIDataOrgToken(query, variables);

      expect(recResult).toBeDefined();
      data = recResult.structuredDataObjects;
      expect(data).toBeDefined();
      expect(data.records).toBeDefined();
      expect(data.records.length > 0).toEqual(true);
      expect(data.records.length).toEqual(data.count);
    });

    it('read sdo with schema query should success', async () => {
      let recResult;

      const query = `
      query getSchema($id: ID!) {
      schema(id: $id) {
        id
        status
        createdDateTime
        modifiedDateTime
        dataRegistryId
        definition
        validActions
        dataRegistry {
          id
          publishedSchema {
            id
          }
        }
        structuredDataObjects(limit: 10, offset: 0) {
          records {
            id
          }
        }  
      }
    }
    `;

      const variables = { id: schemaId };

      recResult = await gqlClient.queryByAIDataOrgToken(query, variables);

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(schemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records.length).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: sdoId
        })
      ).toBeDefined();
    });

    it('update data structure should success', async () => {
      var recResult;

      const query = `
      mutation createSDO ($id: ID, $schemaId: ID!, $data: JSONData, $dataString: String){
      createStructuredData(
        input: {
          id: $id
          data: $data
          schemaId: $schemaId
          dataString: $dataString
        }
      ) {
        id
        data
        schemaId
        modifiedDateTime
        createdDateTime
      }
    }
    `;

      const variables = {
        id: sdoId,
        schemaId: schemaId,
        data: { phone: '(714) 666-6666' }
      };

      recResult = await gqlClient.queryByAIDataOrgToken(query, variables);
      const sdoData = _.get(recResult, 'createStructuredData');
      expect(sdoData).toBeDefined();
      expect(sdoData.id).toEqual(sdoId);
      expect(sdoData.schemaId).toEqual(schemaId);
    });

    it('create folder content template with sdo should success', async () => {
      const rootFolders = await folderHelpers.helpGetRootFolders({ gqlClient, options: superAdminOptions }, 'cms');

      if (rootFolders.length > 0) {
        cmsRootFolderId = _.get(rootFolders[0], 'id');
      } else {
        const createRootFolderRes = await gqlClient.query(
          `
            mutation {
            createRootFolders(rootFolderType: cms) {
              id
              description
              treeObjectId
              rootFolderTypeId
              typeId
            }
          }
          `,
          {},
          superAdminOptions
        );

        const rootFolders = createRootFolderRes.createRootFolders;
        expect(rootFolders.length).toBeGreaterThan(0);
        cmsRootFolderId = rootFolders[0].treeObjectId;
      }

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

      const query = `
      mutation createFolderContentTemplate ($folderId: ID!, $sdoId: ID!, $schemaId: ID!, $data: JSONData ) {
      createFolderContentTemplate (input: {
        folderId: $folderId
        sdoId: $sdoId
        schemaId: $schemaId
        data: $data
      }) {
        id
        folderId
        sdoId
        sdo {
          id
          schemaId
        }
        schemaId
        data
        createdDateTime
        modifiedDateTime
      }
    }
    `;

      const variables = {
        folderId: newFolderId,
        sdoId: sdoId,
        schemaId: schemaId
      };

      const createFolderContentTemplateResult = await gqlClient.queryByAIDataOrgToken(query, variables);

      const folderContentTemplate = _.get(createFolderContentTemplateResult, 'createFolderContentTemplate');
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(sdoId);
      contentFolderTemplateId = folderContentTemplate.id;
    });

    it('create tdo with belonged sdo should success', async () => {
      const result = await gqlClient.queryByAIDataOrgToken(
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
        }`
      );
      const tdo = _.get(result, 'createTDO');
      expect(tdo).toBeDefined();
      expect(tdo.id).toBeDefined();
    });

    it('delete structured data should success', async () => {
      const query = `
      mutation deleteStructuredData {
      deleteStructuredData(input: {
        id: "${sdoId}"
        schemaId: "${schemaId}"
      }) {
        id
      }
    }
    `;
      const result = await gqlClient.queryByAIDataOrgToken(query);
      const deleteSdoData = _.get(result, 'deleteStructuredData');
      expect(deleteSdoData).toBeDefined();
      expect(deleteSdoData.id).toEqual(sdoId);
    });
  }
);
