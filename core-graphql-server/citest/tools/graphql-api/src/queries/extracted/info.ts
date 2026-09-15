import { gql } from 'graphql-request'

export const GRAPHQL_SERVICE_INFO = gql`
  query graphqlServiceInfo {
    graphqlServiceInfo {
      buildInfo
      featureFlags
      heartbeatStats
    }
  }
`;
