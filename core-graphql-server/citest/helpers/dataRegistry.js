async function helpCreateDataRegistry(client, input) {
  const { gqlClient, options } = client;
  const { name, description, source, isPublic } = input;

  return gqlClient.query(
    `
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
    `,
    { name, description, source, isPublic },
    options
  );
}

async function helpUpdateDataRegistry(client, input) {
  const { gqlClient, options } = client;
  const { dataRegistryId, dataRegName, description, source } = input;

  return gqlClient.query(
    `
    mutation ($dataRegName: String!, $dataRegistryId: ID!, $description: String!, $source: String!) {
      updateDataRegistry(
        input: {
          id: $dataRegistryId
          name: $dataRegName
          description: $description
          source: $source
        }
      ) {
        id
        name
        description
        source
        createdDateTime
        modifiedDateTime
        schemas {
          records {
            id
            definition
          }
        }
        organization {
          id
        }
        ingestionToken
      }
    }
    `,
    { dataRegistryId, dataRegName, description, source },
    options
  );
}

async function helpGetDataRegistry(client, input) {
  const { gqlClient, options } = client;
  const { id } = input;

  return gqlClient.query(
    `
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
    `,
    { id },
    options
  );
}

async function helpGetDataRegistries(client, input) {
  const { gqlClient, options } = client;

  return gqlClient.query(
    `
    query (
      $id: ID
      $ids: [ID!]
      $limit: Int
      $offset: Int
      $filterByOwnership: SchemaOwnership = all
      $name: String
      $nameMatch: StringMatch = startsWith
      $orderBy: DataRegistryOrderBy = createdDateTime
      $orderDirection: OrderDirection = desc
      $schemaStatus: [SchemaStatus]
      $schemaMajorVersion: Int
      $schemaId: ID
      $schemaOffset: Int = 0
      $schemaLimit: Int = 30
      $schemaOrderBy: [SchemaOrder]
    ) {
      dataRegistries(
        id: $id
        ids: $ids
        orderBy: $orderBy
        orderDirection: $orderDirection
        limit: $limit
        offset: $offset
        filterByOwnership: $filterByOwnership
        name: $name
        nameMatch: $nameMatch
      ) {
        count
        offset
        records {
          id
          name
          description
          source
          organization {
            id
          }
          publishedSchema {
            id
          }
          schemas(
            status: $schemaStatus
            majorVersion: $schemaMajorVersion
            id: $schemaId
            offset: $schemaOffset
            limit: $schemaLimit
            orderBy: $schemaOrderBy
          ) {
            records {
              id
              definition
              majorVersion
              minorVersion
              status
              createdDateTime
            }
          }
        }
      }
    }
    `,
    input,
    options
  );
}

module.exports = {
  helpCreateDataRegistry,
  helpUpdateDataRegistry,
  helpGetDataRegistry,
  helpGetDataRegistries
};
