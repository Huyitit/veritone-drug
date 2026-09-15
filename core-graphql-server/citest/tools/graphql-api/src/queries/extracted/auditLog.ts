import { gql } from 'graphql-request';

// Instance audit log operations

export const GET_INSTANCE_AUDIT_LOG = gql`
  query instanceAuditLog($input: InstanceAuditLogInput) {
    instanceAuditLog(input: $input) {
      records {
        id
        eventId
        organizationId
        organizationGuid
        organizationName
        userId
        userName
        clientIpAddress
        clientUserAgent
        description
        createdDateTime
        eventType
        eventName
        targetType
        objectId
        actionResult
        actionName
        originatorApplication
        originatorService
        impersonatorUserId
        impersonatorUserName
        correlationId
      }
      count
      offset
      limit
      toDateTime
      fromDateTime
    }
  }
`;
