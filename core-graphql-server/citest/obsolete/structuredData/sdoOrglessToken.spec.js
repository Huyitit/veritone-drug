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
const e = require('express');

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
  'citest_structureddata: structured data citest with orgless token usages',
  () => {
    let superAdminOptions, superToken;
    let tempUserId = null, bootstrapOptions;
    let dataRegistryId, schemaId;
    let sdoId, existedSdoId;
    let cmsRootFolderId, newFolderId, contentFolderTemplateId;
    beforeAll(async () => {
      // Bootstrap: one shared-superadmin login for provisioning (and shard-0 warm-up).
      const bootstrapResult = await gqlClient.connect();
      expect(bootstrapResult.apiToken).toBeDefined();
      expect(bootstrapResult.token).toBeDefined();
      bootstrapOptions = helpers.requestOptions(bootstrapResult.token);

      let firstApiToken;
      const shardIndex = parseInt(process.env.SHARD_INDEX || '0', 10);

      if (shardIndex > 0) {
        // T10: provision a dedicated superadmin so shard 1 has its own TOKEN: Redis key,
        // avoiding the cross-shard shared-user session collision. Bootstrap org seat
        // headroom is repaired via `make compose-citest-seed-org-seats` (see SEEDS_README.md)
        // rather than a live REST PUT here, since PUT /admin/organizations/:id recomputes
        // apps/kvp.applicationIds from the request body and can truncate this org's real
        // application grants as a side effect.
        const tempEmail = `citest-sa-s${shardIndex}-${uuid.v4()}@localhost`;
        const tempPassword = uuid.v4();
        const tempUser = await userHelpers.createUser(
          { gqlClient, options: bootstrapOptions },
          {
            name: tempEmail,
            password: tempPassword,
            orgId: bootstrapResult.organizationId,
            // T11: Super Admin alone lacks CMS/Collections/Discovery/Folder rights
            // (rootFolders/createFolder below need them) and the literal superadmin/
            // admin.org.create scope — pair with aiWARE Administrator + aiWARE Instance
            // Administrator to match what the bootstrap superadmin actually holds.
            rolesIds: [
              '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', // Super Admin
              '032218c3-d47e-4287-9d16-7bb867c01266', // aiWARE Administrator
              'cb18eb9c-3264-434a-8a8d-e6b2d680f66e' // aiWARE Instance Administrator
            ]
          }
        );
        tempUserId = tempUser.id;
        const loginRes = await gqlClient.query(
          `mutation($u: String!, $p: String!) {
            userLogin(input: { userName: $u, password: $p }) {
              token apiToken
            }
          }`,
          { u: tempEmail, p: tempPassword }
        );
        superToken = _.get(loginRes, 'userLogin.token');
        firstApiToken = _.get(loginRes, 'userLogin.apiToken') || bootstrapResult.apiToken;
      } else {
        // Shard 0: double-connect warm-up (T58/T64) lets the first session TOKEN: key settle.
        await gqlClient.connect();
        superToken = bootstrapResult.token;
        firstApiToken = bootstrapResult.apiToken;
      }

      superAdminOptions = helpers.requestOptions(superToken);
      gqlClient.userAuth = superAdminOptions;
      gqlClient.userToken = superToken;
      gqlClient.tokenAuth = helpers.requestOptions(firstApiToken);

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

      const recResult = await sdoHelpers.helpCreateStructuredData(
        { gqlClient, options: superAdminOptions },
        {
          schemaId: schemaId,
          data: {
            name: `${citestMarker}@veritone.com`,
            phone: '(714) 555-5555'
          }
        }
      );
      expect(recResult).toBeDefined();
      existedSdoId = _.get(recResult, 'createStructuredData.id');
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

      if (existedSdoId) {
        await safe('delete existing SDO', async () => {
          await sdoHelpers.helpDeleteStructuredData(
            { gqlClient, options: superAdminOptions },
            {
              id: existedSdoId,
              schemaId: schemaId
            }
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

      if (tempUserId) {
        await gqlClient.query(
          `mutation { deleteUser(id: "${tempUserId}") { id } }`,
          null,
          bootstrapOptions
        );
      }
    });

    it('fetch specific data registry by internal orgless token should success', async () => {
      const query = `
      query ($id: ID!) {
      dataRegistry(id: $id) {
        id
        name
        organizationId
        createdDateTime
        schemas {
          records {
            id
            status
            createdDateTime
          }
        }
      }
    }
    `;

      const variables = {
        id: dataRegistryId
      };

      const result = await gqlClient.queryByInternalOrglessToken(
        query,
        variables
      );

      expect(result.dataRegistry).toBeDefined();
      expect(result.dataRegistry.id).toEqual(dataRegistryId);
    });

    it('create a structured data should fail', async () => {
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

      const result = gqlClient.queryByInternalOrglessToken(query, variables);

      await expect(result).rejects.toThrow(/requires an organization context/i);
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
        ids: [existedSdoId]
      };

      recResult = await gqlClient.queryByInternalOrglessToken(query, variables);

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

      recResult = await gqlClient.queryByInternalOrglessToken(query, variables);

      expect(recResult).toBeDefined();
      expect(recResult.schema).toBeDefined();
      expect(recResult.schema.id).toEqual(schemaId);
      expect(recResult.schema.structuredDataObjects).toBeDefined();
      expect(recResult.schema.structuredDataObjects.records).toBeDefined();
      expect(
        recResult.schema.structuredDataObjects.records.length
      ).toBeGreaterThan(0);
      expect(
        _.find(recResult.schema.structuredDataObjects.records, {
          id: existedSdoId
        })
      ).toBeDefined();
    });

    it('update data structure should fail', async () => {
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
        id: existedSdoId,
        schemaId: schemaId,
        data: { phone: '(714) 666-6666' }
      };

      recResult = gqlClient.queryByInternalOrglessToken(query, variables);

      await expect(recResult).rejects.toThrow(/requires an organization context/i);
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
        sdoId: existedSdoId,
        schemaId: schemaId
      };

      const createFolderContentTemplateResult =
        await gqlClient.queryByInternalOrglessToken(query, variables);

      const folderContentTemplate = _.get(
        createFolderContentTemplateResult,
        'createFolderContentTemplate'
      );
      expect(folderContentTemplate.id).toBeDefined();
      expect(folderContentTemplate.sdoId).toEqual(existedSdoId);
      contentFolderTemplateId = folderContentTemplate.id;
    });

    it('create tdo with belonged sdo should fail', async () => {
      const result = gqlClient.queryByInternalOrglessToken(
        `mutation {
          createTDO(
            input: {
              status: "uploaded",
              startDateTime: 1476726655,
              stopDateTime: 1476726755,
              contentTemplates: [{sdoId: "${existedSdoId}", schemaId: "${schemaId}"}]
            }
          ) {
            id
          }
        }`
      );

      await expect(result).rejects.toThrow(/not authorized/i);
    });

    it('delete structured data should fail', async () => {
      const query = `
      mutation deleteStructuredData {
      deleteStructuredData(input: {
        id: "${existedSdoId}"
        schemaId: "${schemaId}"
      }) {
        id
      }
    }
    `;
      const result = gqlClient.queryByInternalOrglessToken(query);

      await expect(result).rejects.toThrow(
        /The provided value, undefined, is not valid/i
      );
    });
  }
);
