import { gql } from 'graphql-request';

// Platform version and platform properties operations

export const GET_PLATFORM_INFO = gql`
  query platformInfo {
    platformInfo {
      properties
      aiWAREVersionHistory {
        records {
          platformVersion {
            id
            version
            installedAt
            installedBy
          }
          id
        }
      }
      aiWAREVersion {
        currentVersion {
          version
        }
        previousVersion {
          version
        }
        nextVersion {
          version
        }
      }
    }
  }
`;

export const ADD_PLATFORM_VERSION = gql`
  mutation addPlatformVersion($input: PlatformVersionInput) {
    addPlatformVersion(input: $input) {
      id
      version
      manifestUrl
      changeLogUrl
      highlightsUrl
      createdAt
      createdBy
    }
  }
`;

export const SET_CURRENT_PLATFORM_VERSION = gql`
  mutation setCurrentPlatformVersion($version: String!) {
    setCurrentPlatformVersion(version: $version) {
      id
      version
      manifestUrl
      changeLogUrl
      highlightsUrl
      createdAt
      createdBy
      installedAt
      installedBy
    }
  }
`;

export const SET_PLATFORM_PROPERTIES = gql`
  mutation setPlatformProperties($properties: JSONData!) {
    setPlatformProperties(properties: $properties)
  }
`;
