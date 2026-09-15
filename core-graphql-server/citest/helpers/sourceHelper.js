const { get } = require('lodash');

async function helpQuerySource(client, input) {
  const { gqlClient, options } = client;
  const query = `
    query sources (
      $id: ID, $ids: [ID!], $sourceTypeId: ID, $sourceTypeIds: [ID], $name: String, $nameMatch: StringMatch = startsWith, $offset: Int = 0, $limit: Int = 30, 
      $includePublic: Boolean = true, $correlationSchemaId: ID, $orderBy: [SourceSortField!], $permission: SourcePermission = viewer, $storageConfigFilter: StorageConfigFilter
    ) {
      sources (
        id: $id
        ids: $ids
        sourceTypeId: $sourceTypeId
        sourceTypeIds: $sourceTypeIds
        name: $name
        nameMatch: $nameMatch
        offset: $offset
        limit: $limit
        includePublic: $includePublic
        correlationSchemaId: $correlationSchemaId
        orderBy: $orderBy
        permission: $permission
        storageConfigFilter: $storageConfigFilter
      ) {
        records {
          id
          sourceType {
            programFormats
          }
        }
      }
    }`;

  const result = await gqlClient.query(query, input, options);
  return get(result, 'sources');
}

async function helpGetSourceById(client, sourceId) {
  const { gqlClient, options } = client;

  const query = `
    query {
      source (id: "${sourceId}") {
        id
        name
        createdDateTime
        organization {
          guid
          users {
            records {
              name
              id
            }
          }
        }
      }
    }`;

  const result = await gqlClient.query(query, {}, options);
  return get(result, 'source');
}

async function helpDeleteSource(client, sourceId) {
  const { gqlClient, options } = client;
  const query = `mutation delS {
      deleteSource (id: "${sourceId}") {
        id
        message
      }
    }`;

  const result = await gqlClient.query(query, {}, options);
  return get(result, 'deleteSource');
}

async function helpCreateSource(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation createSource ($input: CreateSource!) {
    createSource (input: $input) {
      id
      name
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'createSource');
}

async function helpAddMediaSegment(client, input) {
  const { gqlClient, options } = client;

  const query = `
  mutation ($input: AddMediaSegment!) {
    addMediaSegment(input: $input) {
      id
    }
  }`;
  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'addMediaSegment');
}

async function helpAddMediaSegments(client, input, output) {
  const { gqlClient, options } = client;
  const primaryAssetType = output?.primaryAssetType || null;

  const query = `
  mutation (
    $containerId: ID!, $segments: [AddMediaSegments]!, $segmentGroupId: ID
  ) {
    addMediaSegments(
      containerId: $containerId
      segments: $segments
      segmentGroupId: $segmentGroupId
    ) {
      id
      ${
        primaryAssetType
          ? `primaryAsset(assetType: "${primaryAssetType}") {
              id
              assetType
              contentType
              jsondata
              uri
              signedUri
            }`
          : ''
      }
    }
  }`;
  const result = await gqlClient.query(query, input, options);
  return get(result, 'addMediaSegments');
}

async function helpUpdateSource(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation updateSource ($input: UpdateSource!) {
    updateSource (input: $input) {
      id
      name
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'updateSource');
}

module.exports = {
  helpQuerySource,
  helpGetSourceById,
  helpDeleteSource,
  helpCreateSource,
  helpAddMediaSegment,
  helpAddMediaSegments,
  helpUpdateSource
};
