import { gql } from 'graphql-request';

// Saved search management operations

export const CREATE_SAVED_SEARCH = gql`
  mutation createSavedSearch($input: CreateSavedSearch!) {
    createSavedSearch(input: $input) {
      id
      organizationId
      organization {
        id
        name
      }
      ownerId
      owner {
        id
        name
      }
      name
      sharedWithOrganization
      createdDateTime
      modifiedDateTime
      csp
    }
  }
`;

export const REPLACE_SAVED_SEARCH = gql`
  mutation replaceSavedSearch($input: ReplaceSavedSearch!) {
    replaceSavedSearch(input: $input) {
      id
      organizationId
      organization {
        id
        name
      }
      ownerId
      owner {
        id
        name
      }
      name
      sharedWithOrganization
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_SAVED_SEARCHES = gql`
  query savedSearches(
    $offset: Int
    $limit: Int
    $includeShared: Boolean
  ) {
    savedSearches(
      offset: $offset
      limit: $limit
      includeShared: $includeShared
    ) {
      records {
        id
        organizationId
        ownerId
        owner {
          id
          name
          jsondata
        }
        name
        sharedWithOrganization
        createdDateTime
        modifiedDateTime
        csp
      }
    }
  }
`;

export const DELETE_SAVED_SEARCH = gql`
  mutation deleteSavedSearch($id: ID!) {
    deleteSavedSearch(id: $id) {
      id
    }
  }
`;
