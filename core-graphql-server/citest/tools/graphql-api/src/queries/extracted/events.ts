import { gql } from 'graphql-request'

// Eventing operations

export const EMIT_SYSTEM_EVENT = gql`
  mutation emitSystemEvent($input: EmitSystemEvent!) {
    emitSystemEvent(input: $input) {
      id
      timestamp
      topic
      payload
    }
  }
`;

export const CREATE_EVENT_ACTION_TEMPLATE = gql`
  mutation createEventActionTemplate($input: CreateEventActionTemplate!) {
    createEventActionTemplate(input: $input) {
      id
      name
      ownerApplicationId
      inputType
      actionType
      actionDestination
    }
  }
`;

export const GET_EVENT_ACTION_TEMPLATES = gql`
  query eventActionTemplates(
    $ownerApplicationId: ID
    $inputType: EventActionTemplateInputType
    $actionType: EventActionTemplateActionType
    $offset: Int
    $limit: Int
  ) {
    eventActionTemplates(
      ownerApplicationId: $ownerApplicationId
      inputType: $inputType
      actionType: $actionType
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        name
        ownerApplicationId
        inputType
        actionType
      }
      count
    }
  }
`;

export const UPDATE_EVENT_ACTION_TEMPLATE = gql`
  mutation updateEventActionTemplate($input: UpdateEventActionTemplate!) {
    updateEventActionTemplate(input: $input) {
      id
      name
    }
  }
`;

// Event operations

export const CREATE_EVENT = gql`
  mutation createEvent($input: CreateEvent!) {
    createEvent(input: $input) {
      id
      eventName
      eventType
      application
      public
      description
      schemaData
      schemaHash
      createdDateTime
    }
  }
`;

export const UPDATE_EVENT = gql`
  mutation updateEvent($input: UpdateEvent!) {
    updateEvent(input: $input) {
      id
      description
      eventType
      application
      schemaData
    }
  }
`;

export const GET_EVENT = gql`
  query event($id: ID!) {
    event(id: $id) {
      id
      description
      eventType
      application
      schemaData
    }
  }
`;

export const GET_EVENTS = gql`
  query events($application: String!, $offset: Int, $limit: Int) {
    events(application: $application, offset: $offset, limit: $limit) {
      offset
      limit
      count
      records {
        id
        description
        eventType
        application
        schemaData
      }
    }
  }
`;

export const SUBSCRIBE_EVENT = gql`
  mutation subscribeEvent($input: SubscribeEvent!) {
    subscribeEvent(input: $input)
  }
`;

export const UNSUBSCRIBE_EVENT = gql`
  mutation unsubscribeEvent($id: ID!) {
    unsubscribeEvent(id: $id) {
      id
      message
    }
  }
`;

export const EMIT_AUDIT_EVENT = gql`
  mutation emitAuditEvent($input: EmitAuditEvent!) {
    emitAuditEvent(input: $input) {
      id
    }
  }
`;

/**
 * Fetches audit events twice in one request under different filters
 * (a plain elastic `query` filter, and an `application`/`terms` filter under
 * the `appTermsFilter` alias). Kept as a single operation, matching how the
 * legacy citest issued both lookups together.
 */
export const GET_AUDIT_EVENTS_WITH_APP_TERMS_FILTER = gql`
  query auditEventsWithAppTermsFilter(
    $query: JSONData!
    $application: String
    $terms: [JSONData!]
  ) {
    auditEvents(query: $query) {
      records {
        id
        payload
        organizationId
        userId
      }
    }
    appTermsFilter: auditEvents(application: $application, terms: $terms) {
      records {
        id
        payload
        application
      }
    }
  }
`;

export const GET_EVENT_SUBSCRIPTIONS = gql`
  query eventSubscriptions($limit: Int) {
    eventSubscriptions(limit: $limit) {
      offset
      limit
      count
      records {
        id
        eventName
      }
    }
  }
`;

export const GET_EVENT_SUBSCRIPTION = gql`
  query eventSubscription($id: ID!) {
    eventSubscription(id: $id) {
      id
      eventName
    }
  }
`;
