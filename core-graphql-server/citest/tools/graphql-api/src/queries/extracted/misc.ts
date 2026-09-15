import { gql } from 'graphql-request';

// Miscellaneous operations that don't fit any other category

export const GET_TIME_ZONES = gql`
  query timeZones {
    timeZones {
      name
      abbreviations {
        name
        offset
        offsetMinutes
      }
    }
  }
`;
