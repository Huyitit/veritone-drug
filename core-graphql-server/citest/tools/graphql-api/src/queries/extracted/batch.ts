import { gql } from "graphql-request";

/**
 * Batch Actions API operations.
 *
 * These live in the `batchActionsAPI` module rather than the base SDL, so they
 * are absent from `schema/schema.graphql` and only appear in the schema the
 * running server assembles. Shapes below were confirmed against the live
 * server's introspection, not the checked-in SDL.
 *
 * Note the field names are upper-camel on purpose (`TDOBatch`,
 * `TDOBatchProcesses`) — that is how the module registers them.
 */

export const CREATE_TDO_BATCH = gql`
  mutation createTDOBatch(
    $input: BatchTDOInput
    $tdoOffset: Int = 0
    $tdoLimit: Int
    $tdoIdOffset: Int = 0
    $tdoIdLimit: Int
    $jobTemplate: BatchJobTemplateInput!
  ) {
    createTDOBatch(input: $input) {
      id
      selectionCriteria
      isMutable
      temporalDataObjects(offset: $tdoOffset, limit: $tdoLimit) {
        records {
          id
          name
        }
        count
        offset
        limit
      }
      temporalDataObjectsIds(offset: $tdoIdOffset, limit: $tdoIdLimit) {
        records
        count
        offset
        limit
      }
      executeJobTemplate(input: $jobTemplate) {
        id
        status
        concurrency
        itemsCompleted
        itemsFailed
        itemsTotal
        itemsRunning
        itemsPending
        details
      }
    }
  }
`;

export const GET_TDO_BATCH = gql`
  query TDOBatch(
    $id: ID!
    $tdoOffset: Int = 0
    $tdoLimit: Int
    $tdoIdOffset: Int = 0
    $tdoIdLimit: Int
  ) {
    TDOBatch(id: $id) {
      id
      isMutable
      selectionCriteria
      temporalDataObjects(offset: $tdoOffset, limit: $tdoLimit) {
        records {
          id
          name
        }
        count
        offset
        limit
      }
      temporalDataObjectsIds(offset: $tdoIdOffset, limit: $tdoIdLimit) {
        records
        count
        offset
        limit
      }
    }
  }
`;

export const GET_TDO_BATCH_PROCESSES = gql`
  query TDOBatchProcesses(
    $input: TDOBatchProcessesInput
    $tdoOffset: Int = 0
    $tdoLimit: Int
    $tdoIdOffset: Int = 0
    $tdoIdLimit: Int
    $actionOffset: Int
    $actionLimit: Int
    $actionStatus: BatchProcessItemStatus
  ) {
    TDOBatchProcesses(input: $input) {
      id
      status
      details
      concurrency
      itemsCompleted
      itemsFailed
      itemsTotal
      itemsRunning
      itemsPending
      TDOBatch {
        id
        isMutable
        selectionCriteria
        temporalDataObjects(offset: $tdoOffset, limit: $tdoLimit) {
          records {
            id
            name
          }
          count
          offset
          limit
        }
        temporalDataObjectsIds(offset: $tdoIdOffset, limit: $tdoIdLimit) {
          records
          count
          offset
          limit
        }
      }
      actions(
        offset: $actionOffset
        limit: $actionLimit
        status: $actionStatus
      ) {
        records {
          targetId
          actionId
          status
          details
          job {
            id
            name
            status
          }
          temporalDataObject {
            id
            organizationId
            name
            status
          }
        }
        offset
        limit
        count
      }
    }
  }
`;

export const CANCEL_TDO_BATCH_PROCESS = gql`
  mutation cancelTDOBatchProcess($id: ID) {
    cancelTDOBatchProcess(id: $id) {
      id
      status
      details
    }
  }
`;
