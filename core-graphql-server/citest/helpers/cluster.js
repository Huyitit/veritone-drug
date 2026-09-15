const { get } = require('lodash');

async function helpGetClusters(client, input) {
  const { gqlClient, options } = client;

  const query = `
    query (
      $id: ID
      $name: String
      $type: ClusterType
      $nameMatch: StringMatch = contains
      $offset: Int = 0
      $limit: Int = 30
      $tagMatch: StringMatch = startsWith
      $tags: [String!]
      $dateTimeFilter: [ClusterDateTimeFilter!]
      $orderBy: [ClusterOrderBy!]
      $organizationId: ID
      $clusterGroupId: ID
      $clusterGroupIds: [ID]
      $isGroup: Boolean = false
      $status: ClusterStatus
      $allowedEngines: [ID!]
      $edgeVersion: Int
    ) {
      clusters (
        id: $id
        name: $name
        type: $type
        nameMatch: $nameMatch
        offset: $offset
        limit: $limit
        tagMatch: $tagMatch
        tags: $tags
        dateTimeFilter: $dateTimeFilter
        orderBy: $orderBy
        organizationId: $organizationId
        clusterGroupId: $clusterGroupId
        clusterGroupIds: $clusterGroupIds
        isGroup: $isGroup
        status: $status
        allowedEngines: $allowedEngines
        edgeVersion: $edgeVersion
      ) {
        records {
          id
          name
          type
          default
        }
      }
    }`;

  const result = await gqlClient.query(query, input, options);
  return get(result, 'clusters');
}

async function helpDeleteCluster(client, input) {
  const { gqlClient, options } = client;
  const { clusterId } = input;

  const query = `mutation deleteCluster  {
    deleteCluster (id: "${clusterId}") {
      id
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return get(result, 'deleteCluster');
}

async function helpCreateCluster(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: CreateCluster!) {
    createCluster(input: $input) {
      id
      name
      edgeVersion
      type
      memorySizeBytes
      storageSizeBytes
      paused
      containerTag
      allowedEngines
      createdDateTime
      modifiedDateTime
      organizationId
      collaborators {
        count
        records {
          organizationId
          permission
        }
      }
      clusterConfig
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return get(result, 'createCluster');
}

module.exports = { helpGetClusters, helpDeleteCluster, helpCreateCluster };
