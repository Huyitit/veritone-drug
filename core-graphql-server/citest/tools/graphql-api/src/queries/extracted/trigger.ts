import { gql } from 'graphql-request';

// Trigger management operations

export const CREATE_TRIGGERS = gql`
  mutation createTriggers($input: CreateTriggers!) {
    createTriggers(input: $input) {
      id
      event
      target
    }
  }
`;

export const DELETE_TRIGGER = gql`
  mutation deleteTrigger($id: ID!) {
    deleteTrigger(id: $id) {
      id
    }
  }
`;
