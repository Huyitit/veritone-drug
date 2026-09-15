import { gql } from 'graphql-request';

// TDO (Temporal Data Object) and Asset management operations

export const CREATE_TDO = gql`
  mutation createTDO($input: CreateTDO!) {
    createTDO(input: $input) {
      id
      name
      startDateTime
      stopDateTime
      details
      sourceData {
        scheduledJobId
        sourceId
      }
      jobs {
        count
      }
    }
  }
`;

export const CREATE_TDO_WITH_ASSET = gql`
  mutation createTDOWithAsset($input: CreateTDOWithAsset!) {
    createTDOWithAsset(input: $input) {
      id
      name
      startDateTime
      stopDateTime
      assets {
        records {
          id
          contentType
          assetType
          uri
        }
      }
    }
  }
`;

export const GET_TDO = gql`
  query temporalDataObject($id: ID!, $assetType: [String!]) {
    temporalDataObject(id: $id) {
      id
      name
      startDateTime
      stopDateTime
      details
      folders {
        id
      }
      assets(assetType: $assetType) {
        records {
          id
          contentType
          assetType
          uri
          signedUri
        }
      }
    }
  }
`;

/**
 * Least-privilege projection of a single TDO: scalars only, no `folders` or
 * `assets` expansion. `GET_TDO` above resolves `TemporalDataObject.folders`,
 * which requires folder-read, so a caller that may read its own TDO but holds no
 * folder ACE gets `No authorization access role found for Folder` — and
 * graphql-request throws on any `errors` entry, so the read fails outright. Use
 * this when the test only cares that the TDO is readable; use `GET_TDO` when it
 * actually asserts on folder membership or assets.
 */
export const GET_TDO_SUMMARY = gql`
  query temporalDataObjectSummary($id: ID!) {
    temporalDataObject(id: $id) {
      id
      name
      startDateTime
      stopDateTime
      details
    }
  }
`;

export const GET_TDOS = gql`
  query temporalDataObjects(
    $organizationId: ID
    $applicationId: ID
    $id: ID
    $ids: [ID]
    $offset: Int = 0
    $limit: Int = 30
    $sourceId: ID
    $programId: ID
    $scheduledJobId: ID
    $sampleMedia: Boolean = false
    $includePublic: Boolean = false
    $orderBy: TemporalDataObjectOrderBy = startDateTime
    $orderDirection: OrderDirection = desc
    $dateTimeFilter: [TemporalDataObjectDateTimeFilter!]
    $mentionId: ID
  ) {
    temporalDataObjects(
      organizationId: $organizationId
      applicationId: $applicationId
      id: $id
      ids: $ids
      offset: $offset
      limit: $limit
      sourceId: $sourceId
      programId: $programId
      scheduledJobId: $scheduledJobId
      sampleMedia: $sampleMedia
      includePublic: $includePublic
      orderBy: $orderBy
      orderDirection: $orderDirection
      dateTimeFilter: $dateTimeFilter
      mentionId: $mentionId
    ) {
      records {
        id
        name
        startDateTime
        stopDateTime
        createdDateTime
        modifiedDateTime
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_TDO = gql`
  mutation updateTDO($input: UpdateTDO!) {
    updateTDO(input: $input) {
      id
      name
      details
      streamManifest {
        segments
        initSegment
      }
    }
  }
`;

export const DELETE_TDO = gql`
  mutation deleteTDO($id: ID!) {
    deleteTDO(id: $id) {
      id
      message
    }
  }
`;

/**
 * Selectively clears a TDO's data (engine results, search index, storage)
 * without deleting the TDO itself. Omitting `$options` lets the server apply
 * its own default of `[storage, searchIndex]`.
 */
export const CLEANUP_TDO = gql`
  mutation cleanupTDO($id: ID!, $options: [TDOCleanupOption!]) {
    cleanupTDO(id: $id, options: $options) {
      id
      message
    }
  }
`;

export const CREATE_ASSET = gql`
  mutation createAsset($input: CreateAsset!) {
    createAsset(input: $input) {
      id
      contentType
      assetType
      uri
      signedUri
    }
  }
`;

export const GET_ASSET = gql`
  query asset($id: ID!) {
    asset(id: $id) {
      id
      contentType
      assetType
      uri
    }
  }
`;

export const UPDATE_ASSET = gql`
  mutation updateAsset($input: UpdateAsset!) {
    updateAsset(input: $input) {
      id
      contentType
      assetType
      uri
    }
  }
`;

export const DELETE_ASSET = gql`
  mutation deleteAsset($id: ID!) {
    deleteAsset(id: $id) {
      id
      message
    }
  }
`;

export const GET_ENGINE_RESULTS = gql`
  query engineResults(
    $tdoId: ID!
    $engineIds: [ID!]
    $sourceId: ID
    $engineCategoryIds: [ID!]
    $jobId: ID
    $mentionId: ID
    $startOffsetMs: Int
    $stopOffsetMs: Int
    $startDate: DateTime
    $stopDate: DateTime
    $ignoreUserEdited: Boolean = false
    $fallbackTdoId: ID
  ) {
    engineResults(
      tdoId: $tdoId
      engineIds: $engineIds
      sourceId: $sourceId
      engineCategoryIds: $engineCategoryIds
      jobId: $jobId
      mentionId: $mentionId
      startOffsetMs: $startOffsetMs
      stopOffsetMs: $stopOffsetMs
      startDate: $startDate
      stopDate: $stopDate
      ignoreUserEdited: $ignoreUserEdited
      fallbackTdoId: $fallbackTdoId
    ) {
      sourceId
      records {
        tdoId
        engineId
        assetId
        jsondata
        userEdited
      }
    }
  }
`;

export const GET_SIGNED_WRITABLE_URL = gql`
  query getSignedWritableUrl($expiresInSeconds: Int, $key: String) {
    getSignedWritableUrl(expiresInSeconds: $expiresInSeconds, key: $key) {
      url
      unsignedUrl
      key
      bucket
      getUrl
      expiresInSeconds
      expiresAtDateTime
    }
  }
`;

export const GET_SIGNED_WRITABLE_URL_WITH_PARAMS = gql`
  query getSignedWritableUrlWithParams($type: String, $path: String) {
    getSignedWritableUrl(type: $type, path: $path) {
      url
      unsignedUrl
      key
      bucket
      getUrl
    }
  }
`;

export const GET_SIGNED_WRITABLE_URLS = gql`
  query getSignedWritableUrls($number: Int!, $path: String!, $type: String!) {
    getSignedWritableUrls(number: $number, path: $path, type: $type) {
      bucket
      key
      url
      getUrl
      unsignedUrl
      expiresInSeconds
      expiresAtDateTime
    }
  }
`;

export const GET_UPLOAD_STATUS = gql`
  query getUploadStatus($input: UploadStatusInput!) {
    getUploadStatus(input: $input) {
      status
    }
  }
`;

/**
 * `$id` is optional: omit it to list the org's clone requests, or supply one to
 * poll a single request's progress (what `requestCloneTdos.spec.ts` does).
 */
export const GET_CLONE_REQUESTS = gql`
  query cloneRequests($id: ID) {
    cloneRequests(id: $id) {
      records {
        id
        status
        createdDateTime
        numberOfRecordings
        numberOfCompletedRecordings
      }
    }
  }
`;

export const REQUEST_CLONE = gql`
  mutation requestClone($input: RequestClone!) {
    requestClone(input: $input) {
      id
      status
      sourceApplicationId
      destinationApplicationId
      numberOfRecordings
      numberOfCompletedRecordings
    }
  }
`;

export const REFRESH_CLONE = gql`
  mutation refreshClone($input: RefreshClone!) {
    refreshClone(input: $input) {
      id
      status
      numberOfRecordings
      numberOfCompletedRecordings
    }
  }
`;

export const CREATE_TDO_WITH_PRIMARY_ASSET = gql`
  mutation createTDOWithPrimaryAsset(
    $input: CreateTDOWithAsset!
    $primaryAssetType: String = "media"
  ) {
    createTDOWithAsset(input: $input) {
      id
      name
      startDateTime
      stopDateTime
      primaryAsset(assetType: $primaryAssetType) {
        id
        contentType
        assetType
      }
    }
  }
`;

export const CREATE_ASSET_WITH_SOURCE_DATA = gql`
  mutation createAssetWithSourceData($input: CreateAsset!) {
    createAsset(input: $input) {
      id
      assetType
      contentType
      sourceData {
        engineId
        name
        taskId
      }
    }
  }
`;

export const GET_TDOS_WITH_CLONE_DETAILS = gql`
  query temporalDataObjectsWithCloneDetails(
    $organizationId: ID
    $limit: Int = 1000
    $orderBy: TemporalDataObjectOrderBy
    $orderDirection: OrderDirection
  ) {
    temporalDataObjects(
      organizationId: $organizationId
      limit: $limit
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      records {
        id
        name
        organizationId
        details(path: "veritoneClone")
        assets {
          records {
            id
            name
            assetType
            contentType
            sourceData {
              engineId
              name
              taskId
            }
          }
        }
      }
    }
  }
`;

export const GET_TDO_WITH_ASSET_TYPE = gql`
  query temporalDataObjectWithAssetType($id: ID!, $assetType: [String!]) {
    temporalDataObject(id: $id) {
      id
      assets(assetType: $assetType) {
        records {
          id
          contentType
          assetType
          uri
          signedUri
        }
      }
    }
  }
`;

/**
 * Multi-root setup query for the TDO-deletion suite: writable upload URLs, the
 * engine the suite just activated, and any source it can use. Kept as ONE
 * document rather than three SDK calls because the suite depends on all three
 * resolving in a single request — splitting it would change what is exercised.
 *
 * Looks the engine up by `$engineId`, not by name. The pre-conversion query
 * filtered on `engines(name:)`, which is deprecated — the live server still
 * accepts it, but it is absent from the introspection codegen validates against,
 * so a document using it cannot be generated. The caller already holds the id of
 * the engine it just activated, and `state`/`owned` still carry the assertion
 * that the engine is active and owned.
 */
export const GET_WRITABLE_URLS_ENGINE_AND_SOURCE = gql`
  query writableUrlsEngineAndSource(
    $number: Int!
    $path: String
    $type: String
    $engineId: ID
    $engineState: [EngineState]
    $sourcePermission: SourcePermission
  ) {
    getSignedWritableUrls(number: $number, path: $path, type: $type) {
      bucket
      key
      expiresInSeconds
      expiresAtDateTime
      url
      getUrl
      unsignedUrl
    }
    engines(
      id: $engineId
      libraryRequired: false
      state: $engineState
      owned: true
      limit: 1
    ) {
      records {
        id
        name
      }
    }
    sources(limit: 1, includePublic: false, permission: $sourcePermission) {
      records {
        id
      }
    }
  }
`;

/**
 * Full `createTDO` projection used by the deletion suite, which asserts on
 * ownership/visibility and on both the asset list and the primary asset. The
 * default `CREATE_TDO` deliberately stays lean; this one is opt-in.
 */
export const CREATE_TDO_WITH_ASSETS = gql`
  mutation createTDOWithAssets(
    $input: CreateTDO!
    $primaryAssetType: String = "media"
  ) {
    createTDO(input: $input) {
      id
      startDateTime
      stopDateTime
      applicationId
      isPublic
      organizationId
      organization {
        id
      }
      assets {
        records {
          id
        }
      }
      primaryAsset(assetType: $primaryAssetType) {
        id
      }
    }
  }
`;

/**
 * Asserts a cleanup wiped a task's output and an asset's transform in one
 * request — both roots must resolve together for the assertion to mean anything.
 */
export const GET_TASK_OUTPUT_AND_ASSET_TRANSFORM = gql`
  query taskOutputAndAssetTransform($taskId: ID!, $assetId: ID!) {
    task(id: $taskId) {
      id
      output
    }
    asset(id: $assetId) {
      id
      transform(transformFunction: JSON)
    }
  }
`;

/**
 * Paired asset + TDO lookup. Used twice by the deletion suite: once to assert
 * the asset row survives with its content cleared, and once to assert the whole
 * request fails with `not_found` after the TDO is deleted. The second case only
 * works as a single request, so this must not be split into two SDK calls.
 */
export const GET_ASSET_AND_TDO = gql`
  query assetAndTemporalDataObject($assetId: ID!, $tdoId: ID!) {
    asset(id: $assetId) {
      id
      uri
      signedUri
    }
    temporalDataObject(id: $tdoId) {
      id
    }
  }
`;

/**
 * Asserts the server rejects an over-large offset. The aliased second root is
 * part of the original request and is kept so the rejection is still produced by
 * a multi-root query rather than a simpler one.
 */
export const GET_TDOS_MAX_OFFSET_AND_DATE_FILTER = gql`
  query tdosMaxOffsetAndDateFilter(
    $offset: Int!
    $sourceId: ID
    $dateTimeFilter: [TemporalDataObjectDateTimeFilter!]
  ) {
    temporalDataObjects(offset: $offset) {
      count
    }
    dateTimeFilterTest: temporalDataObjects(
      sourceId: $sourceId
      dateTimeFilter: $dateTimeFilter
      orderBy: startDateTime
      orderDirection: desc
      limit: 1
    ) {
      records {
        startDateTime
      }
    }
  }
`;
