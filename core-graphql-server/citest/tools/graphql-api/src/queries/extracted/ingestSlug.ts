import { gql } from 'graphql-request';

/**
 * Ingest slug operations. An ingest slug is the per-file record a source
 * adapter creates while sweeping a bucket; it is keyed by the composite
 * (sourceId, fileUri) rather than by a surrogate id, which is why every
 * operation below takes sourceId explicitly.
 *
 * Field selections are the union of what the converted ingestSlug citests
 * assert on (see test/ingestSlug/), so one document serves every call site.
 */

export const GET_INGEST_SLUG = gql`
  query ingestSlug($sourceId: ID!, $fileUri: String!) {
    ingestSlug(sourceId: $sourceId, fileUri: $fileUri) {
      sourceId
      fileUri
      status
      statusMessage
      organizationId
      mimeType
      fileSizeBytes
      bundleKey
      tdoId
      assetId
      createdAt
      updatedAt
      createdBy
    }
  }
`;

export const GET_INGEST_SLUGS = gql`
  query ingestSlugs($filter: IngestSlugFilter, $offset: Int, $limit: Int) {
    ingestSlugs(filter: $filter, offset: $offset, limit: $limit) {
      records {
        sourceId
        fileUri
        status
        statusMessage
        organizationId
        mimeType
        bundleKey
        tdoId
        assetId
        updatedAt
      }
      offset
      limit
      count
    }
  }
`;

export const CREATE_INGEST_SLUGS = gql`
  mutation ingestSlugsCreate($input: IngestSlugsCreateInput!) {
    ingestSlugsCreate(input: $input) {
      sourceId
      created {
        sourceId
        fileUri
        status
        bundleKey
        organizationId
        tdoId
        assetId
      }
      failed {
        fileUri
        errorCode
        errorMessage
      }
      duplicates {
        sourceId
        fileUri
      }
    }
  }
`;

export const UPDATE_INGEST_SLUG = gql`
  mutation ingestSlugUpdate(
    $sourceId: ID!
    $fileUri: String!
    $input: IngestSlugUpdateInput!
  ) {
    ingestSlugUpdate(sourceId: $sourceId, fileUri: $fileUri, input: $input) {
      sourceId
      fileUri
      status
      statusMessage
      tdoId
    }
  }
`;

export const UPDATE_INGEST_SLUG_STATUS = gql`
  mutation ingestSlugUpdateStatus(
    $sourceId: ID!
    $fileUris: [String!]!
    $input: IngestSlugsStatusUpdateInput!
  ) {
    ingestSlugUpdateStatus(
      sourceId: $sourceId
      fileUris: $fileUris
      input: $input
    ) {
      sourceId
      updated {
        fileUri
        status
      }
      failed {
        fileUri
        errorCode
        errorMessage
      }
    }
  }
`;

export const DELETE_INGEST_SLUGS = gql`
  mutation ingestSlugsDelete($sourceId: ID!, $fileUris: [String!]!) {
    ingestSlugsDelete(sourceId: $sourceId, fileUris: $fileUris) {
      sourceId
      deleted {
        sourceId
        fileUri
      }
      failed {
        fileUri
        errorCode
        errorMessage
      }
    }
  }
`;

/**
 * Not covered by the generated SDK (see src/gql/gql.ts) — kept as a raw
 * document per the js-to-ts-citest conversion rules. Queues async deletion
 * of every ingest slug for a source and emits an IngestSlugsDeleteBySource
 * event on completion.
 */
export const DELETE_INGEST_SLUGS_FOR_SOURCE = gql`
  mutation ingestSlugsDeleteForSource($sourceId: ID!) {
    ingestSlugsDeleteForSource(sourceId: $sourceId) {
      message
      submitted
    }
  }
`;
