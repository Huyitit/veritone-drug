import { gql } from "graphql-request";

// Media and content management operations

// Share token operations removed - not available in schema

export const FILE_TDO_IN_FOLDER = gql`
  mutation fileTemporalDataObject($input: FileTemporalDataObject!) {
    fileTemporalDataObject(input: $input) {
      id
      folders {
        id
        treeObjectId
      }
    }
  }
`;

/**
 * Deliberately does NOT select `folders`. Expanding `TemporalDataObject.folders`
 * resolves the Folder type, which requires folder-read — so a least-privileged
 * caller that is allowed to move its own TDO still gets
 * `No authorization access role found for Folder`, and graphql-request throws on
 * any `errors` entry, turning a successful move into a failure. No caller reads
 * `folders` off this mutation; see `tdoRBAC.spec.ts`. (`FILE_TDO_IN_FOLDER` and
 * `UNFILE_TDO_FROM_FOLDER` below keep theirs — those ARE asserted on, and their
 * callers run with folder-read.)
 */
export const MOVE_TDO_BETWEEN_FOLDERS = gql`
  mutation moveTemporalDataObject($input: MoveTemporalDataObject!) {
    moveTemporalDataObject(input: $input) {
      id
    }
  }
`;

/**
 * Same mutation as `MOVE_TDO_BETWEEN_FOLDERS`, but returns the resulting folder
 * membership. Use this only when the caller holds folder-read and the test
 * actually asserts on where the TDO landed (e.g. `fileTDO.spec.ts`, which runs
 * as superadmin); otherwise use the lean version above, which cannot trip the
 * `No authorization access role found for Folder` failure described there.
 */
export const MOVE_TDO_WITH_FOLDERS = gql`
  mutation moveTemporalDataObjectWithFolders(
    $input: MoveTemporalDataObject!
  ) {
    moveTemporalDataObject(input: $input) {
      id
      folders {
        id
        treeObjectId
      }
    }
  }
`;

export const UNFILE_TDO_FROM_FOLDER = gql`
  mutation unfileTemporalDataObject($input: UnfileTemporalDataObject!) {
    unfileTemporalDataObject(input: $input) {
      id
      folders {
        id
        treeObjectId
      }
    }
  }
`;

export const ADD_SEGMENT = gql`
  mutation AddSegment(
    $containerId: ID!
    $segmentGroupId: String!
    $url: String!
    $startMs: Int!
    $stopMs: Int!
  ) {
    seg1: addMediaSegment(
      input: {
        containerId: $containerId
        details: {
          segmentStartTimeMs: $startMs
          segmentStopTimeMs: $stopMs
          segmentGroupId: $segmentGroupId
        }
        url: $url
      }
    ) {
      id
    }
  }
`;

export const ADD_SEGMENTS = gql`
  mutation AddSegments(
    $containerId: ID!
    $segmentGroupId: String!
    $url: String!
  ) {
    seg1: addMediaSegment(
      input: {
        containerId: $containerId
        details: {
          segmentStartTimeMs: 0
          segmentStopTimeMs: 2000
          segmentGroupId: $segmentGroupId
        }
        url: $url
      }
    ) {
      id
      primaryAsset(assetType: "media-mdp") {
        id
        contentType
        assetType
        signedUri
        uri
      }
    }

    seg2: addMediaSegment(
      input: {
        containerId: $containerId
        details: {
          segmentStartTimeMs: 2000
          segmentStopTimeMs: 4000
          segmentGroupId: $segmentGroupId
        }
        url: $url
      }
    ) {
      id
    }

    initSegment: addMediaSegment(
      input: {
        containerId: $containerId
        details: {
          codecs: "avc1.64001e,mp4a.40.2"
          segmentGroupId: $segmentGroupId
          targetSegmentDurationMs: 2000
        }
        url: $url
      }
    ) {
      id
    }
  }
`;

export const ADD_MEDIA_SEGMENT = gql`
  mutation addMediaSegment ($input: AddMediaSegment!) {
    addMediaSegment(input: $input) {
      id
    }
  }
`;

export const ADD_MEDIA_SEGMENTS = gql`
  mutation AddMediaSegments(
    $containerId: ID!
    $segments: [AddMediaSegments]!
    $segmentGroupId: ID
  ) {
    addMediaSegments(
      containerId: $containerId
      segments: $segments
      segmentGroupId: $segmentGroupId
    ) {
      id
      primaryAsset(assetType: "media-mdp") {
        id
        name
      }
    }
  }
`;

export const CREATE_MEDIA_SHARE = gql`
  mutation createMediaShare($input: CreateMediaShare!) {
    createMediaShare(input: $input) {
      id
      url
    }
  }
`;

export const GET_MEDIA_SHARE = gql`
  query mediaShare($id: ID!) {
    mediaShare(id: $id) {
      mediaType
      serviceName
      sourceId
      scheduledJobId
    }
  }
`;
