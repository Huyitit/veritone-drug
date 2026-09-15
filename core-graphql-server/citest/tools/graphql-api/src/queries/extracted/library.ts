import { gql } from 'graphql-request';

export const CREATE_LIBRARY = gql`
  mutation createLibrary($input: CreateLibrary!) {
    createLibrary(input: $input) {
      id
      name
      createdDateTime
      coverImageUrl
    }
  }
`;

export const LIBRARY_TYPES_AND_TYPE_QUERY = gql`
  query libraryTypesAndType($libraryTypeId: ID) {
    libraryTypes {
      count
      records {
        id
        label
        entityIdentifierTypes {
          id
          label
          description
          dataType
        }
      }
    }
    libraryType(id: $libraryTypeId) {
      id
      label
      entityIdentifierTypes {
        id
        label
        description
        dataType
      }
    }
  }
`;

export const DELETE_LIBRARY = gql`
  mutation deleteLibrary($id: ID!) {
    deleteLibrary(id: $id) {
      id
    }
  }
`;

export const CREATE_LIBRARY_ENGINE_MODEL = gql`
  mutation createLibraryEngineModel($input: CreateLibraryEngineModel!) {
    createLibraryEngineModel(input: $input) {
      id
      configurationId
      trainStatus
      libraryId
      engineId
      dataUrl
    }
  }
`;

export const UPDATE_LIBRARY_ENGINE_MODEL = gql`
  mutation updateLibraryEngineModel($input: UpdateLibraryEngineModel!) {
    updateLibraryEngineModel(input: $input) {
      id
      trainStatus
      dataUrl
      accuracy
      contentType
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const CREATE_LIBRARY_COLLABORATOR = gql`
  mutation createLibraryCollaborator($input: CreateLibraryCollaborator!) {
    createLibraryCollaborator(input: $input) {
      organizationId
      status
    }
  }
`;

export const LIBRARY_QUERY = gql`
  query library(
    $id: ID!
    $entityId: ID
    $entityName: String
    $entityIds: [ID!]
    $engineModelLibraryVersion: Int
    $engineModelCurrentVersion: Boolean
    $engineModelTrainStatus: LibraryEngineModelTrainStatus
    $engineModelEngineId: ID
    $engineModelLastModified: Boolean
    $engineModelLimit: Int
  ) {
    library(id: $id) {
      id
      version
      organizationId
      libraryTypeId
      libraryType {
        id
        label
      }
      summary {
        entityCount
        unpublishedEntityCount
        lastTrainedVersion
        lastTrainedDateTime
      }
      dataset {
        libraryId
        tdoIds
      }
      configurations {
        records {
          id
        }
      }
      entities(id: $entityId, name: $entityName, ids: $entityIds) {
        count
        offset
        limit
        records {
          id
          name
          createdDateTime
          summary {
            identifierCountsByType
          }
          identifiers {
            records {
              id
              identifierTypeId
              identifierType {
                id
                label
              }
              url
              jsondata
              title
              contentType
            }
          }
        }
      }
      engineModels(
        libraryVersion: $engineModelLibraryVersion
        currentVersion: $engineModelCurrentVersion
        trainStatus: $engineModelTrainStatus
        engineId: $engineModelEngineId
        lastModified: $engineModelLastModified
        limit: $engineModelLimit
      ) {
        count
        records {
          id
          trainStatus
          libraryVersion
          engineId
        }
      }
    }
  }
`;

export const LIBRARIES_WITH_DETAILS_QUERY = gql`
  query librariesWithDetails(
    $name: String
    $type: String
    $entityIdentifierTypeIds: [String!]
    $limit: Int = 30
  ) {
    libraries(
      name: $name
      type: $type
      entityIdentifierTypeIds: $entityIdentifierTypeIds
      limit: $limit
    ) {
      count
      records {
        id
        name
        organizationId
        entities {
          records {
            id
            libraryId
          }
        }
        collaborators {
          records {
            libraryId
            organizationId
            status
            organization {
              id
              name
            }
          }
        }
        summary {
          entityCount
          unpublishedEntityCount
          lastTrainedVersion
          lastTrainedDateTime
        }
        libraryType {
          id
          label
          entityIdentifierTypes {
            id
            label
          }
        }
        engineModels {
          records {
            id
            jsondata
            trainStatus
            libraryId
            libraryVersion
            trainJobId
            createdDateTime
            modifiedDateTime
            dataUrl
            library {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export const LIBRARY_ENGINE_MODEL_QUERY = gql`
  query libraryEngineModel($id: ID!) {
    libraryEngineModel(id: $id) {
      id
      configurationId
      engineId
      libraryId
      libraryVersion
      contentType
      trainJobId
      trainStatus
      dataUrl
      jsondata
      accuracy
      createdDateTime
      modifiedDateTime
      engine {
        id
        name
      }
      library {
        id
        name
      }
    }
  }
`;

export const DELETE_LIBRARY_ENGINE_MODEL = gql`
  mutation deleteLibraryEngineModel($id: ID!) {
    deleteLibraryEngineModel(id: $id) {
      id
    }
  }
`;

export const UPDATE_LIBRARY = gql`
  mutation UpdateLibrary($input: UpdateLibrary!) {
    updateLibrary(input: $input) {
      id
      modifiedDateTime
      description
      name
      coverImageUrl
      organizationId
      version
    }
  }
`;

export const PUBLISH_LIBRARY = gql`
  mutation publishLibrary($id: ID!) {
    publishLibrary(id: $id) {
      id
      version
    }
  }
`;

export const CREATE_LIBRARY_CONFIGURATION = gql`
  mutation createLibraryConfiguration($input: CreateLibraryConfiguration!) {
    createLibraryConfiguration(input: $input) {
      id
      libraryId
      engineCategoryId
      targetEngineIds
      rankedSourceEngineIds
    }
  }
`;

export const UPDATE_LIBRARY_CONFIGURATION = gql`
  mutation updateLibraryConfiguration($input: UpdateLibraryConfiguration!) {
    updateLibraryConfiguration(input: $input) {
      id
      targetEngineIds
      confidence {
        min
        max
        allowNull
      }
    }
  }
`;

export const CREATE_LIBRARY_TYPE = gql`
  mutation createLibraryType($input: CreateLibraryType!) {
    createLibraryType(input: $input) {
      id
      label
      iconClass
      entityIdentifierTypes {
        id
      }
      entityTypeName
      entityTypeNamePlural
    }
  }
`;

export const UPDATE_LIBRARY_TYPE = gql`
  mutation updateLibraryType($input: UpdateLibraryType!) {
    updateLibraryType(input: $input) {
      id
      label
      iconClass
    }
  }
`;

export const LIBRARIES_ORDERED_QUERY = gql`
  query libraries(
    $id: ID
    $name: String
    $type: String
    $entityIdentifierTypeIds: [String!]
    $includeOwnedOnly: Boolean = false
    $offset: Int = 0
    $limit: Int = 30
    $orderBy: LibraryOrderBy
    $orderDirection: OrderDirection
  ) {
    libraries(
      id: $id
      name: $name
      type: $type
      entityIdentifierTypeIds: $entityIdentifierTypeIds
      includeOwnedOnly: $includeOwnedOnly
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

export const UPDATE_LIBRARY_COLLABORATOR = gql`
  mutation updateLibraryCollaborator($input: UpdateLibraryCollaborator!) {
    updateLibraryCollaborator(input: $input) {
      organizationId
      libraryId
      permissions
      status
    }
  }
`;

export const DELETE_LIBRARY_COLLABORATOR = gql`
  mutation deleteLibraryCollaborator($libraryId: ID!, $organizationId: ID!) {
    deleteLibraryCollaborator(
      libraryId: $libraryId
      organizationId: $organizationId
    ) {
      id
    }
  }
`;

export const DELETE_LIBRARY_CONFIGURATION = gql`
  mutation deleteLibraryConfiguration($id: ID!) {
    deleteLibraryConfiguration(id: $id) {
      id
    }
  }
`;

export const DELETE_LIBRARY_DATASET = gql`
  mutation deleteLibraryDataset($input: DeleteLibraryDataset!) {
    deleteLibraryDataset(input: $input) {
      libraryId
      tdoIds
      message
    }
  }
`;

export const ADD_LIBRARY_DATASET = gql`
  mutation addLibraryDataset($input: AddLibraryDataset!) {
    addLibraryDataset(input: $input) {
      libraryId
      tdoIds
    }
  }
`;
