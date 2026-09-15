import { gql } from 'graphql-request';

// OpenID Connect provider management operations

export const CREATE_OPEN_ID_PROVIDER = gql`
  mutation createOpenIdProvider($input: CreateOpenIdProvider!) {
    createOpenIdProvider(input: $input) {
      id
      loginUrl
      name
      isGlobal
    }
  }
`;

export const UPDATE_OPEN_ID_PROVIDER = gql`
  mutation updateOpenIdProvider($input: UpdateOpenIdProvider!) {
    updateOpenIdProvider(input: $input) {
      id
      loginUrl
      name
      description
      websiteUrl
      loginButtonStyle {
        btnText
        btnLogo
        btnColor
      }
      allowedRedirectTargets
      isGlobal
    }
  }
`;

export const GET_OPEN_ID_PROVIDER = gql`
  query openIdProvider($id: ID!) {
    openIdProvider(id: $id) {
      id
      loginUrl
      name
      isGlobal
    }
  }
`;

export const GET_OPEN_ID_PROVIDERS = gql`
  query openIdProviders($ids: [ID!], $orgId: ID) {
    openIdProviders(ids: $ids, orgId: $orgId) {
      count
      records {
        id
        loginUrl
        name
        isGlobal
      }
    }
  }
`;

export const DELETE_OPEN_ID_PROVIDER = gql`
  mutation deleteOpenIdProvider($id: ID!) {
    deleteOpenIdProvider(id: $id) {
      id
      message
    }
  }
`;
