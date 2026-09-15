import { gql } from 'graphql-request';

// Custom dashboard management operations

export const CREATE_CUSTOM_DASHBOARD = gql`
  mutation createCustomDashboard(
    $hostAppId: ID!
    $name: String!
    $description: String
    $data: JSONData!
  ) {
    createCustomDashboard(
      input: {
        hostAppId: $hostAppId
        name: $name
        description: $description
        data: $data
      }
    ) {
      id
      hostAppId
      name
      description
      data
    }
  }
`;

export const GET_CUSTOM_DASHBOARD = gql`
  query customDashboard($id: ID!) {
    customDashboard(id: $id) {
      id
      hostAppId
      name
      description
      data
    }
  }
`;

export const GET_CUSTOM_DASHBOARDS = gql`
  query customDashboards($hostAppId: ID, $offset: Int, $limit: Int) {
    customDashboards(hostAppId: $hostAppId, offset: $offset, limit: $limit) {
      records {
        id
        hostAppId
        name
        description
        data
      }
      count
    }
  }
`;

export const UPDATE_CUSTOM_DASHBOARD = gql`
  mutation updateCustomDashboard($input: UpdateCustomDashboard!) {
    updateCustomDashboard(input: $input) {
      id
      hostAppId
      name
      description
      data
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const DELETE_CUSTOM_DASHBOARD = gql`
  mutation deleteCustomDashboard($id: ID!) {
    deleteCustomDashboard(id: $id) {
      id
      message
    }
  }
`;
