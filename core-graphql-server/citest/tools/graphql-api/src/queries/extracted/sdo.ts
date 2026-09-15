import { gql } from 'graphql-request';

export const CREATE_SDO = gql`
  mutation createStructuredDataNestedMutation(
    $input: CreateStructuredData!
    $entries: [AuthACEPermissionInput!]!
  ) {
    createStructuredData(input: $input) {
      id
      data
      schemaId
      createdDateTime
      modifiedDateTime
      addACEs(entries: $entries) {
        records {
          id
          objectID
          objectType
        }
        count
      }
    }
  }
`;

export const UPDATE_STRUCTURED_DATA = gql`
  mutation updateStructuredData($input: UpdateStructuredData!) {
    updateStructuredData(input: $input) {
      id
      schemaId
      data
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const STRUCTURED_DATA_OBJECTS = gql`
  query structuredDataObjects(
    $schemaId: ID!
    $id: ID
    $ids: [ID!]
    $orderBy: [StructuredDataOrderBy!]
    $limit: Int = 30
    $offset: Int = 0
    $owned: Boolean
    $filter: JSONData
    $dateTimeFilter: SdoDateTimeFilter
  ) {
    structuredDataObjects(
      schemaId: $schemaId
      id: $id
      ids: $ids
      orderBy: $orderBy
      limit: $limit
      offset: $offset
      owned: $owned
      filter: $filter
      dateTimeFilter: $dateTimeFilter
    ) {
      count
      records {
        id
        dataString
        createdDateTime
      }
    }
  }
`;

export const SCHEMA_PROPERTIES = gql`
  query schemaProperties(
    $dataRegistryVersion: [DataRegistryVersion!]
    $search: String
    $limit: Int = 30
    $offset: Int = 0
  ) {
    schemaProperties(
      dataRegistryVersion: $dataRegistryVersion
      search: $search
      limit: $limit
      offset: $offset
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
`;
