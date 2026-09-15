import { gql } from 'graphql-request';

// Source and source type management operations

export const CREATE_SOURCE = gql`
  mutation createSource($input: CreateSource!) {
    createSource(input: $input) {
      id
      name
      isPublic
      details
      thumbnailUrl
      sourceTypeId
      sourceType {
        id
        name
      }
      organizationId
      organization {
        id
        name
      }
      correlationSDOId
      correlationSchemaId
      permission
      collaborators(orderBy: permission, orderDirection: asc) {
        records {
          organizationId
          permission
        }
      }
      state
      createdBy
      updatedBy
      ownedBy
    }
  }
`;

export const GET_SOURCES = gql`
  query sources(
    $id: ID
    $ids: [ID!]
    $sourceTypeId: ID
    $sourceTypeIds: [ID]
    $name: String
    $nameMatch: StringMatch
    $offset: Int
    $limit: Int
    $hasContentTemplates: Boolean
    $includePublic: Boolean
    $correlationSchemaId: ID
    $orderBy: [SourceSortField!]
    $permission: SourcePermission
    $storageConfigFilter: StorageConfigFilter
  ) {
    sources(
      id: $id
      ids: $ids
      sourceTypeId: $sourceTypeId
      sourceTypeIds: $sourceTypeIds
      name: $name
      nameMatch: $nameMatch
      offset: $offset
      limit: $limit
      hasContentTemplates: $hasContentTemplates
      includePublic: $includePublic
      correlationSchemaId: $correlationSchemaId
      orderBy: $orderBy
      permission: $permission
      storageConfigFilter: $storageConfigFilter
    ) {
      records {
        id
        name
        sourceType {
          id
          programFormats
        }
        details
        thumbnailUrl
        permission
      }
      count
      offset
      limit
    }
  }
`;

export const GET_SOURCE = gql`
  query getSourceById($id: ID!) {
    source(id: $id) {
      id
      name
      createdDateTime
      organization {
        guid
        users {
          records {
            name
            id
          }
        }
      }
      details
      thumbnailUrl
      permission
      createdBy
      updatedBy
      ownedBy
      collaborators(orderBy: permission, orderDirection: asc) {
        records {
          organizationId
          permission
        }
      }
    }
  }
`;

export const GET_SOURCE_SIGNED_URL = gql`
  query GetSourceSignedUrl($id: ID!, $input: GetStorageSignedUrlInput!) {
    source(id: $id) {
      id
      getStorageSignedUrl(input: $input) {
        url
        expiresInSeconds
        access
      }
    }
  }
`;

export const DELETE_SOURCE = gql`
  mutation deleteSource($id: ID!) {
    deleteSource(id: $id) {
      id
      message
    }
  }
`;

export const getSourceACL = gql`
  query GetResourcesACL(
    $resourceType: AuthResourceType!
    $ids: [ID!]!
    $ownerOrganization: ID
  ) {
    getACLForResources(
      resourceType: $resourceType
      ids: $ids
      ownerOrganization: $ownerOrganization
    ) {
      records {
        id
        objectID
        objectType
        organization {
          id
          guid
        }
        permissionSet {
          id
          name
          organization {
            id
            guid
          }
        }
        member {
          ... on BasicUserInfo {
            id
            name
          }
          ... on AuthGroup {
            id
            name
            organization {
              id
              guid
            }
          }
        }
        options
      }
    }
  }
`;

export const UPDATE_SOURCE = gql`
  mutation updateSource($input: UpdateSource!) {
    updateSource(input: $input) {
      id
      name
      isPublic
      details
      thumbnailUrl
      sourceTypeId
      sourceType {
        id
        name
      }
      organizationId
      organization {
        id
        name
      }
      correlationSDOId
      correlationSchemaId
      permission
      collaborators(orderBy: permission, orderDirection: asc) {
        records {
          organizationId
          permission
        }
      }
      state
      createdBy
      updatedBy
      ownedBy
    }
  }
`;

export const GET_SOURCE_JWT = gql`
  mutation getSourceJWT($sourceId: ID!, $access: JWTAccess) {
    getSourceJWT(sourceId: $sourceId, access: $access) {
      token
      sourceId
      organizationId
      ownerId
    }
  }
`;

export const GET_SOURCE_TYPE = gql`
  query sourceType($id: ID!) {
    sourceType(id: $id) {
      id
      name
      categoryId
      category {
        id
        name
      }
      sourceSchemaId
      sourceSchema {
        id
        definition
        status
      }
      iconClass
      isLive
      requiresScanPipeline
      supportedRunModes
    }
  }
`;

export const GET_SOURCE_TYPES = gql`
  query sourceTypes($limit: Int) {
    sourceTypes(limit: $limit) {
      records {
        id
        sourceSchemaId
        sourceSchema {
          id
          definition
          status
        }
        name
        isLive
        requiresScanPipeline
        supportedRunModes
        categoryId
        category {
          id
          name
        }
      }
    }
  }
`;

export const GET_SOURCE_TYPE_CATEGORIES = gql`
  query sourceTypeCategories {
    sourceTypeCategories {
      records {
        id
        name
      }
    }
  }
`;

export const GET_SOURCE_TYPE_CATEGORY = gql`
  query sourceTypeCategory($id: ID!) {
    sourceTypeCategory(id: $id) {
      id
      name
    }
  }
`;
