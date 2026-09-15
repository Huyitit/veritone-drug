import { gql } from 'graphql-request';

export const DELETE_PACKAGE = gql`
  mutation packageDelete($id: ID!) {
    packageDelete(id: $id) {
      success
      msg
      code
    }
  }
`;

export const GET_PACKAGE_BY_ID = gql`
  query queryPackages(
    $orgId: ID
    $resourceId: ID
    $id: ID
    $ids: [ID!]
    $distributionType: EngineDistributionType
    $packageFilter: PackageFilter
    $limit: Int = 30
    $orderBy: [PackageOrderBy!]
    $distributionTypes: [EngineDistributionType!]
    $resourceAlias: String
    $nameRegexp: String
    $status: PackageStatus
    $primaryResourceId: ID
  ) {
    packages(
      orgId: $orgId
      resourceId: $resourceId
      id: $id
      ids: $ids
      distributionType: $distributionType
      packageFilter: $packageFilter
      limit: $limit
      orderBy: $orderBy
      distributionTypes: $distributionTypes
      resourceAlias: $resourceAlias
      nameRegexp: $nameRegexp
      status: $status
      primaryResourceId: $primaryResourceId
    ) {
      count
      records {
        id
        name
        version
        status
        distributionType
        primaryResourceId
        sourceOriginId
        grantType
        primaryResource {
          resourceId
          resourceType
        }
        nestedResources {
          records {
            id
            resourceType
            packageId
            referencePaths
          }
        }
        resources {
          records {
            resourceId
            resourceType
          }
        }
      }
    }
  }
`;

export const UPDATE_PACKAGE_GRANTS = gql`
  mutation mutationPackageUpdateGrants(
    $packageId: ID!
    $packageGrants: [PackageGrantInput]!
  ) {
    packageUpdateGrants(
      input: { packageId: $packageId, packageGrants: $packageGrants }
    ) {
      id
      name
    }
  }
`;

export const GET_PACKAGE_GRANTS = gql`
  query packageGrants(
    $id: ID
    $limit: Int
    $offset: Int
    $orgId: ID
    $packageFilter: PackageGrantFilter
  ) {
    packageGrants(
      id: $id
      limit: $limit
      offset: $offset
      orgId: $orgId
      packageFilter: $packageFilter
    ) {
      records {
        grantType
        organization {
          id
          name
        }
        package {
          id
          name
        }
      }
    }
  }
`;

export const UPDATE_PACKAGE = gql`
  mutation packageUpdate($input: PackageUpdateInput!) {
    packageUpdate(input: $input) {
      id
      name
      icon
      description
      status
      version
      primaryResource {
        id
        resourceId
        resourceType
      }
      distributionType
      resources {
        records {
          id
          resourceId
          resourceType
        }
      }
    }
  }
`;

export const UPDATE_PACKAGE_RESOURCES = gql`
  mutation packageUpdateResources(
    $packageId: ID!
    $resources: [PackageResourceInput]!
  ) {
    packageUpdateResources(
      input: { packageId: $packageId, packageResources: $resources }
    ) {
      id
      name
      icon
      description
      primaryResource {
        id
        resourceId
        resourceType
      }
      distributionType
      resources {
        records {
          id
          resourceId
          resourceType
        }
      }
    }
  }
`;
