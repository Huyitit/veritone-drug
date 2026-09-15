const { get } = require("lodash");

async function helpUpsertSchemaDraft(client, input) {
  const { gqlClient, options } = client;
  const { dataRegistryId, schema } = input;

  return gqlClient.query(
    `
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
    `,
    { dataRegistryId, schema },
    options
  );
}

async function helpPublishSchema(client, input) {
  const { gqlClient, options } = client;
  const { id, breakingChanges } = input;

  return gqlClient.query(
    `
    mutation updateSchemaState($id: ID!, $breakingChanges: Boolean) {
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
    `,
    { id, breakingChanges },
    options
  );
}

async function helpDeleteSchema(client, input) {
  const { gqlClient, options } = client;
  const { schemaId } = input;

  return gqlClient.query(
    `
    mutation ($schemaId: ID!) {
      updateSchemaState(input: { id: $schemaId, status: deleted }) {
        id
        status
      }
    }
    `,
    { schemaId },
    options
  );
}

async function helpGetSchema(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `
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
    `,
    { id },
    options
  );
}

async function helpGetSchemaProperties(client, input) {
  const { gqlClient, options } = client;
  const { search, dataRegistryId, majorVersion = 1 } = input;

  return gqlClient.query(
    `
    query ($search: String!, $dataRegistryId: ID!, $majorVersion: Int = 1) {
      schemaProperties(
        search: $search
        offset: 0
        dataRegistryVersion: { id: $dataRegistryId, majorVersion: $majorVersion }
      ) {
        records {
          type
          path
          searchPath
          title
          schema {
            id
            dataRegistry {
              name
              organization {
                id
                name
              }
            }
          }
        }
        limit
        offset
        count
      }
    }
    `,
    { search, dataRegistryId, majorVersion },
    options
  );
}

async function helpGetSchemasByDataRegistryId(client, input) {
  const { gqlClient, options } = client;
  const { dataRegistryId } = input;

  return gqlClient.query(
    `
    query ($dataRegistryId: ID!) {
      schemas(dataRegistryId: $dataRegistryId) {
        count
        records {
          id
        }
      }
    }
    `,
    { dataRegistryId },
    options
  );
}

async function helpCreateSchema(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
    mutation createSchema($input: CreateSchema!) {
      createSchema(input: $input) {
        id
        majorVersion
        minorVersion
        status
        definition
      }
    }
    `,
    { input },
    options
  );
}

async function helpCreateSchemaDraft(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation upsertSchemaDraft ($input: UpsertSchemaDraft!) {
    upsertSchemaDraft ( input: $input) {
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
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'upsertSchemaDraft');
}

async function helpGetSchemas(client, input) {
  const { gqlClient, options } = client;

  const query = `query (
    $id: ID, $ids: [ID!], $dataRegistryId: ID, $status: [SchemaStatus!], $majorVersion: Int, $name: String, 
    $nameMatch: StringMatch = startsWith, $accessScope: [AccessScope!], $limit: Int = 30, $offset: Int = 0, $orderBy: [SchemaOrder]
  ) {
    schemas (
      id: $id, ids: $ids, dataRegistryId: $dataRegistryId, status: $status, majorVersion: $majorVersion, 
      name: $name, nameMatch: $nameMatch, accessScope: $accessScope, limit: $limit, offset: $offset, orderBy: $orderBy
    ) {
      count
      records {
        id
        dataRegistryId
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);
  return get(result, 'schemas');
}

module.exports = {
  helpUpsertSchemaDraft,
  helpPublishSchema,
  helpDeleteSchema,
  helpGetSchema,
  helpGetSchemaProperties,
  helpGetSchemasByDataRegistryId,
  helpCreateSchema,
  helpCreateSchemaDraft,
  helpGetSchemas
};
