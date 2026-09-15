import { gql } from 'graphql-request';

/**
 * Distribution Center (VP-2581 / BE-18): Destination, DestinationType, and
 * distributeAsset operations. None of these have generated SDK methods (see
 * src/gql/gql.ts) — the js-to-ts-citest conversion rules require a raw
 * fallback in that case. Field selections are the union of what the
 * converted destination citest asserts on.
 */

export const GET_DESTINATION_TYPES = gql`
  query destinationTypes($platform: String, $vendorCapability: String) {
    destinationTypes(platform: $platform, vendorCapability: $vendorCapability) {
      id
      name
      platform
      vendorCapability
      iconClass
      engineId
      isPublic
      configSchema {
        id
      }
      publishSchema {
        id
      }
    }
  }
`;

export const GET_DESTINATION_TYPE = gql`
  query destinationType($id: ID!) {
    destinationType(id: $id) {
      id
      name
      platform
      engineId
    }
  }
`;

export const GET_DESTINATIONS = gql`
  query destinations {
    destinations {
      id
      status
    }
  }
`;

export const GET_DESTINATION = gql`
  query destination($id: ID!) {
    destination(id: $id) {
      id
      status
      label
      platformAccountLabel
    }
  }
`;

export const CREATE_DESTINATION = gql`
  mutation createDestination($input: CreateDestinationInput!) {
    createDestination(input: $input) {
      id
      status
      label
      destinationTypeId
      oauthUrl
    }
  }
`;

export const UPDATE_DESTINATION = gql`
  mutation updateDestination($input: UpdateDestinationInput!) {
    updateDestination(input: $input) {
      id
      label
    }
  }
`;

export const DELETE_DESTINATION = gql`
  mutation deleteDestination($id: ID!) {
    deleteDestination(id: $id) {
      id
      message
    }
  }
`;

export const COMPLETE_DESTINATION_CONNECTION = gql`
  mutation completeDestinationConnection(
    $input: CompleteDestinationConnectionInput!
  ) {
    completeDestinationConnection(input: $input) {
      id
      status
      platformAccountLabel
      oauthUrl
    }
  }
`;

export const DISTRIBUTE_ASSET = gql`
  mutation distributeAsset($input: DistributeAssetInput!) {
    distributeAsset(input: $input) {
      id
      status
    }
  }
`;
