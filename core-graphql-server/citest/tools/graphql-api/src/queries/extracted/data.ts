import { gql } from 'graphql-request';

// Data and dataset management operations

export const CREATE_DATASET_SCHEMA = gql`
  mutation createDatasetSchema($input: CreateDatasetSchema!) {
    createDatasetSchema(input: $input) {
      datasetId
      name
      description
      tags {
        name
        value
      }
      schema {
        id
        dataRegistryId
        definition
      }
    }
  }
`;

export const DATASET_DATA_OPERATION = gql`
  mutation datasetDataOperation($id: ID!, $actions: [DatasetActionInput!]) {
    datasetDataOperation(id: $id, actions: $actions) {
      datasetId
      structuredDataObjects {
        id
        data
        createdDateTime
        modifiedDateTime
      }
    }
  }
`;

/**
 * Left disabled: both operations select fields the live schema does not have, so
 * enabling them breaks codegen. `Dataset` exposes no `structuredDataObjects`
 * connection, and `Query.datasets` takes `filter: DatasetFilter` rather than a
 * `name` argument. Rewrite against the real shapes before enabling.
 */
/*
export const GET_DATASET = gql`
  query dataset($id: ID!) {
    dataset(id: $id) {
      datasetId
      name
      description
      tags {
        name
        value
      }
      schema {
        id
        dataRegistryId
        definition
      }
      structuredDataObjects {
        records {
          id
          data
        }
        count
        offset
        limit
      }
    }
  }
`;

export const GET_DATASETS = gql`
  query datasets($offset: Int, $limit: Int, $name: String) {
    datasets(offset: $offset, limit: $limit, name: $name) {
      records {
        datasetId
        name
        description
        tags {
          name
          value
        }
      }
      count
      offset
      limit
    }
  }
`;
*/

export const DELETE_DATASET = gql`
  mutation deleteDataset($id: ID!) {
    deleteDataset(id: $id) {
      datasetId
      message
    }
  }
`;

export const CREATE_DATA_REGISTRY = gql`
  mutation createDataRegistry($input: CreateDataRegistry!) {
    createDataRegistry(input: $input) {
      id
      name
      description
      source
      organizationId
      createdDateTime
      modifiedDateTime
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

export const GET_DATA_REGISTRY = gql`
  query dataRegistry($id: ID!) {
    dataRegistry(id: $id) {
      id
      name
      source
      description
      organizationId
      createdDateTime
      modifiedDateTime
      ingestionToken
      publishedSchema {
        id
        majorVersion
      }
      schemas {
        records {
          id
          status
          definition
          createdDateTime
          modifiedDateTime
        }
      }
    }
  }
`;

export const GET_DATA_REGISTRIES = gql`
  query dataRegistries(
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
      records {
        id
        name
        source
        description
        createdDateTime
        organizationId
        modifiedDateTime
        publishedSchema {
          id
        }
        organization {
          id
        }
        createdBy {
          id
          name
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
            status
            definition
          }
        }
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_DATA_REGISTRY = gql`
  mutation updateDataRegistry($input: UpdateDataRegistry!) {
    updateDataRegistry(input: $input) {
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
`;

export const CREATE_STRUCTURED_DATA = gql`
  mutation createStructuredData($input: CreateStructuredData!) {
    createStructuredData(input: $input) {
      id
      schemaId
      data
      dataString
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_STRUCTURED_DATA = gql`
  query structuredData($id: ID!, $schemaId: ID!) {
    structuredData(id: $id, schemaId: $schemaId) {
      id
      schemaId
      data
      dataString
      createdDateTime
      modifiedDateTime
    }
  }
`;

// updateStructuredData mutation does not exist in schema

export const DELETE_STRUCTURED_DATA = gql`
  mutation deleteStructuredData($input: DeleteStructuredData!) {
    deleteStructuredData(input: $input) {
      id
    }
  }
`;

export const UPDATE_SCHEMA_STATE = gql`
  mutation updateSchemaState($input: UpdateSchemaState!) {
    updateSchemaState(input: $input) {
      id
      status
      majorVersion
      minorVersion
      createdDateTime
      modifiedDateTime
      validActions
    }
  }
`;

// createSchema mutation does not exist in schema - use createStructuredDataSchema instead

export const GET_SCHEMA = gql`
  query schema($id: ID!) {
    schema(id: $id) {
      id
      dataRegistryId
      definition
      status
      majorVersion
      minorVersion
      createdDateTime
      modifiedDateTime
      validActions
      dataRegistry {
        id
        publishedSchema {
          id
        }
      }
      structuredDataObjects {
        records {
          id
          data
          createdDateTime
          modifiedDateTime
        }
        count
        offset
        limit
      }
    }
  }
`;

export const GET_SCHEMAS = gql`
  query getSchemas(
    $id: ID
    $ids: [ID!]
    $dataRegistryId: ID
    $status: [SchemaStatus!]
    $majorVersion: Int
    $name: String
    $nameMatch: StringMatch = startsWith
    $accessScope: [AccessScope!]
    $limit: Int = 30
    $offset: Int = 0
    $orderBy: [SchemaOrder]
  ) {
    schemas(
      id: $id
      ids: $ids
      dataRegistryId: $dataRegistryId
      status: $status
      majorVersion: $majorVersion
      name: $name
      nameMatch: $nameMatch
      accessScope: $accessScope
      limit: $limit
      offset: $offset
      orderBy: $orderBy
    ) {
      count
      records {
        id
        dataRegistryId
      }
    }
  }
`;

export const CREATE_SCHEMA = gql`
  mutation createSchema($input: CreateSchema!) {
    createSchema(input: $input) {
      id
      dataRegistryId
      definition
      majorVersion
      minorVersion
      status
    }
  }
`;

export const UPSERT_SCHEMA_DRAFT = gql`
  mutation upsertSchemaDraft($input: UpsertSchemaDraft!) {
    upsertSchemaDraft(input: $input) {
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

export const TEMPORAL_DATA_OBJECT = gql`
  query GetTemporalDataObject($id: ID!) {
    temporalDataObject(id: $id) {
      id
      folders {
        id
      }
      startDateTime
      stopDateTime
    }
  }
`;

export const TEMPORAL_DATA_OBJECT_BASIC = gql`
  query GetTemporalDataObjectBasic($id: ID!) {
    temporalDataObject(id: $id) {
      id
      startDateTime
      stopDateTime
    }
  }
`;
