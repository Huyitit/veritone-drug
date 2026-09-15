import { gql } from 'graphql-request';

// Export request operations

export const CREATE_EXPORT_REQUEST = gql`
  mutation createExportRequest($input: CreateExportRequest!) {
    createExportRequest(input: $input) {
      id
      status
      requestorId
      organizationId
      createdDateTime
      modifiedDateTime
      assetUri
    }
  }
`;

export const UPDATE_EXPORT_REQUEST = gql`
  mutation updateExportRequest($id: ID!, $status: ExportRequestStatus, $assetUri: String) {
    updateExportRequest(input: { id: $id, status: $status, assetUri: $assetUri }) {
      id
      status
      assetUri
    }
  }
`;
