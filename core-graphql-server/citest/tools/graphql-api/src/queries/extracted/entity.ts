import { gql } from 'graphql-request';

export const CREATE_ENTITY = gql`
  mutation createEntity($input: CreateEntity!) {
    createEntity(input: $input) {
      id
      name
      createdDateTime
      modifiedDateTime
      description
      jsondata
      jsonstring
      profileImageUrl
    }
  }
`;

export const CREATE_ENTITY_IDENTIFIER = gql`
  mutation createEntityIdentifier($input: CreateEntityIdentifier!) {
    createEntityIdentifier(input: $input) {
      id
      url
      jsondata
      jsonstring
      entity {
        id
        profileImageUrl
      }
    }
  }
`;

export const UPDATE_ENTITY = gql`
  mutation updateEntity($input: UpdateEntity!) {
    updateEntity(input: $input) {
      id
      name
      jsondata
      libraryId
      isPublished
      modifiedDateTime
      profileImageUrl
    }
  }
`;

export const ENTITY_QUERY = gql`
  query entity($id: ID!) {
    entity(id: $id) {
      id
      profileImageUrl
      isPublished
      jsondata
      createdDateTime
      modifiedDateTime
      description
      libraryId
      library {
        id
        name
      }
      summary {
        identifierCountsByType
      }
      identifiers {
        records {
          id
          identifierType {
            id
            label
            labelPlural
            dataType
          }
          identifierTypeId
          isPriority
          url
          contentType
          jsondata
        }
      }
    }
  }
`;

export const ENTITIES_BY_ID_QUERY = gql`
  query entities(
    $ids: [ID!]
    $libraryIds: [ID!]
    $isPublished: Boolean
    $identifierTypeId: ID
    $name: String
    $offset: Int = 0
    $limit: Int = 30
    $orderBy: LibraryEntityOrderBy
    $orderDirection: OrderDirection
  ) {
    entities(
      ids: $ids
      libraryIds: $libraryIds
      isPublished: $isPublished
      identifierTypeId: $identifierTypeId
      name: $name
      offset: $offset
      limit: $limit
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      count
      records {
        id
        name
      }
    }
  }
`;

export const DELETE_ENTITY_IDENTIFIER = gql`
  mutation deleteEntityIdentifier($id: ID!) {
    deleteEntityIdentifier(id: $id) {
      id
    }
  }
`;

export const DELETE_ENTITY = gql`
  mutation deleteEntity($id: ID!) {
    deleteEntity(id: $id) {
      id
    }
  }
`;

export const ENTITY_IDENTIFIER_TYPES_QUERY = gql`
  query entityIdentifierTypes($id: ID, $offset: Int = 0, $limit: Int = 30) {
    entityIdentifierTypes(id: $id, offset: $offset, limit: $limit) {
      records {
        id
        dataType
      }
    }
  }
`;

export const UPDATE_ENTITY_IDENTIFIER = gql`
  mutation UpdateEntityIdentifier($input: UpdateEntityIdentifier!) {
    updateEntityIdentifier(input: $input) {
      id
      url
      jsondata
    }
  }
`;
