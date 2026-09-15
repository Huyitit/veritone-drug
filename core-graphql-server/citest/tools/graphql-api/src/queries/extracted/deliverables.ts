import { gql } from "graphql-request";

export const PROCESSING_PROJECT_CREATE = gql`
  mutation processingProjectCreate($input: ProcessingProjectInput!) {
    processingProjectCreate(input: $input) {
      id
      applicationId
      name
      createdAt
      updatedAt
    }
  }
`;

export const PROCESSING_PROJECT_DELETE = gql`
  mutation processingProjectDelete($id: ID!) {
    processingProjectDelete(id: $id) {
      id
      message
    }
  }
`;

export const PROCESSING_DELIVERABLE_CREATE = gql`
  mutation processingDeliverableCreate($input: ProcessingDeliverableInput!) {
    processingDeliverableCreate(input: $input) {
      id
      projectId
      tdoId
      assetType
      engineId
      schemaId
      engineCategoryId
      status
      statusMessage
      createdAt
      updatedAt
    }
  }
`;

export const PROCESSING_DELIVERABLE_CANCEL = gql`
  mutation processingDeliverableCancel(
    $id: ID!
    $projectId: ID!
    $message: String
  ) {
    processingDeliverableCancel(
      id: $id
      projectId: $projectId
      message: $message
    ) {
      id
      projectId
      tdoId
      jobId
      engine {
        id
        name
      }
      status
    }
  }
`;

export const GET_PROCESSING_PROJECT = gql`
  query processingProject($id: ID!) {
    processingProject(id: $id) {
      id
      name
      summary {
        total
        totalIncomplete
        totalComplete
        totalCanceled
      }
    }
  }
`;

export const QUERY_PROCESSING_PROJECTS = gql`
  query processingProjects(
    $offset: Int
    $limit: Int
    $filter: ProcessingProjectFilter
  ) {
    processingProjects(offset: $offset, limit: $limit, filter: $filter) {
      count
      records {
        id
        name
        applicationId
      }
      limit
      offset
    }
  }
`;

export const QUERY_PROCESSING_DELIVERABLE = gql`
  query processingDeliverable($id: ID!, $project_id: ID!) {
    processingDeliverable(id: $id, project_id: $project_id) {
      id
      status
      tdo {
        id
        name
      }
      schema {
        id
      }
      engine {
        id
        name
      }
    }
  }
`;

export const GET_PROCESSING_DELIVERABLES = gql`
  query processingDeliverables(
    $projectId: ID!
    $offset: Int
    $limit: Int
    $filter: ProcessingDeliverableFilter
  ) {
    processingDeliverables(
      projectId: $projectId
      offset: $offset
      limit: $limit
      filter: $filter
    ) {
      records {
        id
        tdoId
        assetType
        engineId
        schemaId
        engineCategoryId
        status
        statusMessage
      }
      offset
      limit
      count
    }
  }
`;
