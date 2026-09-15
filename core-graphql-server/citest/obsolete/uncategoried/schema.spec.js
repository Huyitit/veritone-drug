const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');
const _ = require('lodash');
const uuid = require('uuid');

const config = helpers.config;
const citestMarker = global.citestMarker || 'citest-should-delete';
const env = config.env;
const gqlClient = new GraphqlClient(env);

let dataRegistryId;

let schemaV1_1_Id;
let schemaV1_2_Id;
let schemaV2_0_Id;
let schemaV1_3_Id;
let schemaV1_4_Id;
let schemaV3_2_JumpId;
let schemaUpsertDraftId;
let sdoId;
describe('citest_schema: Schema version and storageName behavior', () => {
  beforeAll(async () => {
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  describe('Minor versions share storageName, major versions create new storage', () => {
    it('should create data registry', async () => {
      const query = `
        mutation {
          createDataRegistry(
            input: {
              name: "${citestMarker}-storage-test-${Date.now()}",
              description: "citest storageName behavior",
              source: "citest"
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query);
      dataRegistryId = _.get(result, 'createDataRegistry.id');

      expect(dataRegistryId).toBeDefined();
    });

    it('should create schema v1.1 (published)', async () => {
      schemaV1_1_Id = uuid.v4();

      const query = `
        mutation {
          createSchema(
            input: {
              id: "${schemaV1_1_Id}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 1
              minorVersion: 1
              status: published
              definition: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
          }
        }
      `;

      const result = await gqlClient.query(query);
      const createSchema = _.get(result, 'createSchema');
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_1_Id);
      expect(createSchema.majorVersion).toEqual(1);
      expect(createSchema.minorVersion).toEqual(1);
      expect(createSchema.status).toEqual('published');
    });

    it('should create schema v1.2 (published)', async () => {
      schemaV1_2_Id = uuid.v4();

      const query = `
        mutation {
          createSchema(
            input: {
              id: "${schemaV1_2_Id}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 1
              minorVersion: 2
              status: published
              definition: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                }
              }
            }
          ) {
            id
            status
          }
        }
      `;

      const result = await gqlClient.query(query);
      const createSchema = _.get(result, 'createSchema');
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_2_Id);
      expect(createSchema.status).toEqual('published');
    });

    it('should create SDO using schema v1.1', async () => {
      sdoId = uuid.v4();

      const query = `
        mutation {
          createStructuredData(
            input: {
              id: "${sdoId}"
              schemaId: "${schemaV1_1_Id}"
              data: {
                testId: "storage-test-001"
                name: "Test object"
              }
            }
          ) {
            id
          }
        }
      `;

      const result = await gqlClient.query(query);
      expect(result.createStructuredData.id).toEqual(sdoId);
    });

    it('should retrieve SDO using schema v1.2 (shared storage)', async () => {
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaV1_2_Id}"
          ) {
            id
            data
          }
        }
      `;
      const result = await gqlClient.query(query);
      expect(result.structuredData.id).toEqual(sdoId);
      expect(result.structuredData.data.testId).toEqual('storage-test-001');
    });

    it('should create schema v2.0 (new storage)', async () => {
      schemaV2_0_Id = uuid.v4();

      const query = `
        mutation {
          createSchema(
            input: {
              id: "${schemaV2_0_Id}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 2
              minorVersion: 0
              status: published
              definition: {
                type: "object"
                title: "Test Schema v2"
                required: ["testId", "newField"]
                properties: {
                  testId: { type: "string" }
                  newField: { type: "string" }
                }
              }
            }
          ) {
            id
            status
          }
        }
      `;

      const result = await gqlClient.query(query);

      expect(result.createSchema.status).toEqual('published');
    });

    it('should NOT retrieve v1.x SDO using schema v2.0', async () => {
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaV2_0_Id}"
          ) {
            id
          }
        }
      `;

      let error;

      try {
        await gqlClient.query(query);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('should create schema v1.3 as draft', async () => {
      schemaV1_3_Id = uuid.v4();

      const query = `
       mutation {
          createSchema(
            input: {
              id: "${schemaV1_3_Id}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 1
              minorVersion: 3
              status: draft
              definition: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
          }
        }
      `;
      const result = await gqlClient.query(query);
      const createSchema = _.get(result, 'createSchema');

      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_3_Id);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v1.3 with breakingChanges false (shared storage)', async () => {
      const query = `
        mutation {
          updateSchemaState(
            input: {
              id: "${schemaV1_3_Id}"
              status: published
              breakingChanges: false
            }
          ) {
            id
            status
          }
        }
      `;
      const result = await gqlClient.query(query);
      const schema = _.get(result, 'updateSchemaState');

      expect(schema.status).toEqual('published');
    });

    it('should retrieve v1.x SDO using schema v1.3 (shared storage)', async () => {
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaV1_3_Id}"
          ) {
            id
          }
        }
      `;
      const result = await gqlClient.query(query);

      expect(result.structuredData.id).toEqual(sdoId);
    });

    it('should create schema v1.4 as draft', async () => {
      schemaV1_4_Id = uuid.v4();

      const query = `
        mutation {
          createSchema(
            input: {
              id: "${schemaV1_4_Id}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 1
              minorVersion: 4
              status: draft
              definition: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
          }
        }
      `;

      const result = await gqlClient.query(query);
      const createSchema = _.get(result, 'createSchema');
      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV1_4_Id);
      expect(createSchema.majorVersion).toEqual(1);
      expect(createSchema.minorVersion).toEqual(4);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v1.4 with breakingChanges true (new storage)', async () => {
      const query = `
        mutation {
          updateSchemaState(
            input: {
              id: "${schemaV1_4_Id}"
              status: published
              breakingChanges: true
            }
          ) {
            id
            status
            majorVersion
            minorVersion
          }
        }
      `;

      const result = await gqlClient.query(query);

      const schema = _.get(result, 'updateSchemaState');
      expect(schema.status).toEqual('published');
    });

    it('should NOT retrieve v1.x SDO using schema v1.4 with breakingChanges', async () => {
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaV1_4_Id}"
          ) {
            id
          }
        }
      `;

      let error;

      try {
        await gqlClient.query(query);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('should create draft schema using upsertSchemaDraft', async () => {
      const query = `
        mutation {
          upsertSchemaDraft(
            input: {
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 1
              schema: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                  newField: { type: "string" }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
          }
        }
      `;

      const result = await gqlClient.query(query);

      schemaUpsertDraftId = _.get(result, 'upsertSchemaDraft.id');

      expect(schemaUpsertDraftId).toBeDefined();
    });
    it('should publish upsert draft with breakingChanges true', async () => {
      const query = `
        mutation {
          updateSchemaState(
            input: {
              id: "${schemaUpsertDraftId}"
              status: published
              breakingChanges: true
            }
          ) {
            id
            status
          }
        }
      `;

      const result = await gqlClient.query(query);

      expect(result.updateSchemaState.status).toEqual('published');
    });

    it('should NOT retrieve old SDO using upsert draft schema', async () => {
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaUpsertDraftId}"
          ) {
            id
          }
        }
      `;

      let error;

      try {
        await gqlClient.query(query);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    // Test case: Create v3.2 directly (skip v3.0, v3.1) - should get NEW storage
    // This covers the edge case where majorVersion jump happens without intermediate versions

    it('should create schema v3.2 as draft (version jump, skip v3.0/v3.1)', async () => {
      schemaV3_2_JumpId = uuid.v4();

      const query = `
        mutation {
          createSchema(
            input: {
              id: "${schemaV3_2_JumpId}"
              dataRegistryId: "${dataRegistryId}"
              majorVersion: 3
              minorVersion: 2
              status: draft
              definition: {
                type: "object"
                title: "Test Schema v1.x"
                required: ["testId"]
                properties: {
                  testId: { type: "string" }
                  name: { type: "string" }
                }
              }
            }
          ) {
            id
            majorVersion
            minorVersion
            status
          }
        }
      `;

      const result = await gqlClient.query(query);
      const createSchema = _.get(result, 'createSchema');

      expect(createSchema).toBeDefined();
      expect(createSchema.id).toEqual(schemaV3_2_JumpId);
      expect(createSchema.majorVersion).toEqual(3);
      expect(createSchema.minorVersion).toEqual(2);
      expect(createSchema.status).toEqual('draft');
    });

    it('should publish schema v3.2 WITHOUT breakingChanges (first v3.x gets new storage)', async () => {
      // NOTE: No v3.0 or v3.1 exists, so v3.2 is first v3.x schema
      // Even without breakingChanges flag, it should get new storage

      const query = `
        mutation {
          updateSchemaState(
            input: {
              id: "${schemaV3_2_JumpId}"
              status: published
              breakingChanges: false
            }
          ) {
            id
            status
            majorVersion
            minorVersion
          }
        }
      `;

      const result = await gqlClient.query(query);
      const schema = _.get(result, 'updateSchemaState');

      expect(schema.status).toEqual('published');
      expect(schema.majorVersion).toEqual(3);
      expect(schema.minorVersion).toEqual(2);
    });

    it('should NOT retrieve v1.x SDO using schema v3.2 (new storage due to version jump)', async () => {
      // v3.2 is first schema of major version 3, so it should have separate storage
      const query = `
        query {
          structuredData(
            id: "${sdoId}"
            schemaId: "${schemaV3_2_JumpId}"
          ) {
            id
          }
        }
      `;

      let error;

      try {
        await gqlClient.query(query);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('not_found');
    });

    it('cleanup SDO', async () => {
      const query = `
        mutation {
          deleteStructuredData(
            input: {
              id: "${sdoId}"
              schemaId: "${schemaV1_1_Id}"
            }
          ) {
            message
          }
        }
      `;
      const result = await gqlClient.query(query);
      expect(result.deleteStructuredData).toBeDefined();
    });

    it('cleanup schemas', async () => {
      for (const schemaId of [
        schemaV2_0_Id,
        schemaV3_2_JumpId,
        schemaV1_2_Id,
        schemaV1_1_Id,
        schemaV1_3_Id,
        schemaV1_4_Id,
        schemaUpsertDraftId
      ]) {
        const query = `
          mutation {
            updateSchemaState(
              input: {
                id: "${schemaId}"
                status: deleted
              }
            ) {
              id
            }
          }
        `;

        await gqlClient.query(query);
      }
      expect(true).toBe(true);
    });
  });
});
