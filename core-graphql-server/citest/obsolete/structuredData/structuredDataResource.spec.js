const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');

const env = config.env;
const gqlClient = new GraphqlClient(env);
const citestMarker = global.citestMarker || 'citest-should-delete';

(gqlClient.isEnableResourceTest() ? describe : describe.skip)(
  'citest_structureddata: Structured Data resource test using internal orgless token and ai data token',
  () => {
    const dataRegistry = {
      id: null,
      schemaId: null
    };

    it('create data registry and public schema by ai data org token', async () => {
      let query = `        
        fragment dataRegistryFields on DataRegistry {
          id
          name
          source
          description
          organizationId
          createdDateTime
          createdBy {
            id
          }
          modifiedBy {
            id
          }
          modifiedDateTime
        }

        
        fragment schemaFields on Schema {
          id
          dataRegistryId
          definition
          majorVersion
          minorVersion
          status
          validActions
          createdBy {
            id
          }
          createdDateTime
          modifiedBy {
            id
          }
          modifiedDateTime
        }
        mutation CreateDataRegistry($config: CreateDataRegistry!, $schema: UpsertSchemaDraft!) {
          createDataRegistry(input: $config) {
            ...dataRegistryFields
          }
          upsertSchemaDraft(input: $schema) {
            ...schemaFields
          }
        }

      `;

      const dataRegistryId = uuid.v4();
      let variables = {
        config: {
          id: `${dataRegistryId}`,
          source: '',
          name: `${citestMarker}-resource-ci-test--schema-${uuid.v4()}`,
          description: citestMarker + '-resource-ci-test--schema'
        },
        schema: {
          dataRegistryId: `${dataRegistryId}`,
          schema: {
            type: 'object',
            title: 'hub-ci-test-',
            required: ['email'],
            properties: {
              email: {
                type: 'string'
              },
              userName: {
                type: 'string'
              }
            },
            description: 'For CI test'
          }
        }
      };

      // use ai data org token
      let result = await gqlClient.queryByAIDataOrgToken(query, variables);
      dataRegistry.id = dataRegistryId;
      dataRegistry.schemaId = _.get(result, 'upsertSchemaDraft.id');

      // publish schema
      query = `
      fragment schemaFields on Schema {
        id
        dataRegistryId
        definition
        majorVersion
        minorVersion
        status
        validActions
        createdBy {
          id
        }
        createdDateTime
        modifiedBy {
          id
        }
        modifiedDateTime
      }
      mutation UpdateSchemaState($input: UpdateSchemaState!) {
        results: updateSchemaState(input: $input) {
          ...schemaFields
        }
      }`;

      variables = {
        input: {
          id: `${dataRegistry.schemaId}`,
          status: 'published',
          breakingChanges: false
        }
      };
      result = await gqlClient.queryByAIDataOrgToken(query, variables);
      const schemaStatus = _.get(result, 'results.status');
      expect(schemaStatus).toBeDefined();
      expect(schemaStatus).toEqual(`published`);
    });

    it('fetch specific data registry by internal orgless token', async () => {
      const query = `        
        query {
          dataRegistry(id: "${dataRegistry.id}") {
            id
            name
            schemas {
              records {
                id
                majorVersion
              }
            }
            ingestionToken
            publishedSchema {
              id
              majorVersion
            }
          }
        }
      `;

      // use ai data org token
      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.dataRegistry).toBeDefined();
      expect(result.dataRegistry.id).toEqual(dataRegistry.id);
      expect(result.dataRegistry.schemas.records.length).toEqual(1);
      expect(result.dataRegistry.schemas.records[0].id).toEqual(
        dataRegistry.schemaId
      );
      expect(result.dataRegistry.publishedSchema.id).toEqual(
        dataRegistry.schemaId
      );
      expect(result.dataRegistry.ingestionToken).toBeDefined();
    });

    it('fetch multiple data registries by internal orgless token', async () => {
      const query = `        
        query {
          dataRegistries(offset: 0, limit: 10) {
            records {
              id
              name
              isPublic
              schemas {
                records {
                  id
                  majorVersion
                }
              }
              ingestionToken
              publishedSchema {
                id
                majorVersion
              }
            }
          }
        }
      `;

      // use ai data org token
      const result = await gqlClient.queryByInternalOrglessToken(query);
      expect(result.dataRegistries).toBeDefined();
      expect(result.dataRegistries.records.length).toBeGreaterThan(0);
    });
  }
);
