import { gql } from 'graphql-request';

// Email operations

export const SEND_EMAIL = gql`
  mutation sendEmail($input: SendEmail!) {
    sendEmail(input: $input)
  }
`;
