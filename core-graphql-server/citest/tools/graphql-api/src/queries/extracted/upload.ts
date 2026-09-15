import { gql } from 'graphql-request';

// Multipart upload operations

export const INITIATE_MULTIPART_UPLOAD = gql`
  mutation initiateMultipartUpload($input: InitiateMultipartUploadInput!) {
    initiateMultipartUpload(input: $input) {
      uploadId
      key
      preSignedUrls {
        signedUrl
        partNumber
      }
    }
  }
`;

export const CANCEL_MULTIPART_UPLOAD = gql`
  mutation cancelMultipartUpload($input: CancelMultipartUploadInput!) {
    cancelMultipartUpload(input: $input) {
      id
      message
    }
  }
`;

export const COMPLETE_MULTIPART_UPLOAD = gql`
  mutation completeMultipartUpload($input: CompleteMultipartUploadInput!) {
    completeMultipartUpload(input: $input) {
      signedUrl
      url
    }
  }
`;
