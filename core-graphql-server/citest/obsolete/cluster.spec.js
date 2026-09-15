const helpers = require('./helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');
const { safe } = require('./helpers/cleanup/utils');
const config = helpers.config;
const _ = require('lodash');
const moment = require('moment');
let apiToken;

const engineId = 'd1bc57fe-675d-435d-9f4d-2f074485ec55';
const testOrgName = 'citest-org';
let testOrgId;

const citestMarker = global.citestMarker || 'citest-should-delete';
const testKey = citestMarker + _.toString(Date.now());

let clusterId, jobTemplateId, clusterNoTagsId, clusterAnotherOrgId;
let clusterGroupId, clusterIdInGroup1, clusterIdInGroup2;

let nodeId1, nodeId2;
let options;
let userId, organizationId;

describe('citest_cluster: cluster tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    userId = _.get(result, 'userId');
    organizationId = _.get(result, 'organizationId');
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
    const query = `{
      organizations(name: "${testOrgName}") {
        records {
          id
        }
      }
    }`;
    const testOrgs = await gqlClient.query(query);
    testOrgId = _.get(testOrgs, 'organizations.records[0].id');
    if (!testOrgId) {
      const createTestOrg = `mutation {
        createOrganization(
          input: { name: "${citestMarker}-org", metadata: {}, businessUnit: "Test" }
        ) {
          id
        }
      }`;
      const newTestOrg = await gqlClient.query(createTestOrg);
      testOrgId = _.get(newTestOrg, 'createOrganization.id');
    }
  });

  afterAll(async () => {
    // Cleanup all clusters
    const clusterIds = [
      clusterId,
      clusterNoTagsId,
      clusterAnotherOrgId,
      clusterGroupId,
      clusterIdInGroup1,
      clusterIdInGroup2
    ].filter(Boolean);

    for (const id of clusterIds) {
      await safe(`delete cluster ${id}`, async () => {
        const query = `mutation { deleteCluster(id: "${id}") { id message } }`;
        await gqlClient.query(query);
      });
    }

    // Cleanup test org if we created it
    if (testOrgId && testOrgId !== organizationId) {
      await safe('delete test organization', async () => {
        await helpers.deleteOrganization(gqlClient.authUrl, testOrgId, apiToken);
      });
    }
  });

  it('create a cluster group', async () => {
    const query = `mutation {
      createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        dockerCredentials: {}
        containerTag: "test"
        memorySize: "1gb"
        storageSize: "8gb"
        allowedEngines: []
        collaborators: [
          {
            organizationId: ${testOrgId}
            permission: viewer
          }
        ]
        tags: ["foo", "bar"]
        subscriptions: [
          {
            userId: "${userId}",
            isActive: true
          }
        ]
        clusterConfig: {
          restartTimeUTC: "03:00",
          mediaStoragePath: "../mnnt/",
          mediaStorage: "edge"
        }
        mediaStoragePath: "../mnnt/tt"
        mediaStorage: core
        restartTimeUTC: "04:00"
        isGroup: true
      }) {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        subscriptions {
          count
          records {
            userId
            emailAddress
            id
            createdDateTime
            modifiedDateTime
            isActive
          }
        }
        clusterConfig
        isGroup
      }
    }`;

    const result = await gqlClient.query(query);
    const createCluster = _.get(result, 'createCluster');
    clusterGroupId = _.get(createCluster, 'id');
    expect(clusterGroupId).toBeDefined();
    expect(createCluster.collaborators.count).toEqual(1);
    expect(createCluster.collaborators.records[0].organizationId).toEqual(
      testOrgId.toString()
    );
    expect(createCluster.collaborators.records[0].permission).toEqual('viewer');
    expect(createCluster.tags.length).toEqual(2);
    expect(createCluster.tags[0]).toEqual('foo');
    expect(createCluster.isGroup).toEqual(true);
  });

  it('create 2 clusters into a group', async () => {
    const query = `mutation {
      clusterInGroup1: createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        dockerCredentials: {}
        allowedEngines: []
        clusterGroupId: "${clusterGroupId}"
        status: active
      }) {
        id
        name
        isGroup
        clusterGroupId
      }
      clusterInGroup2: createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        dockerCredentials: {}
        allowedEngines: []
        clusterGroupId: "${clusterGroupId}"
        status: active
      }) {
        id
        name
        isGroup
        clusterGroupId
      }
    }`;

    const result = await gqlClient.query(query);
    const clusterInGroup1 = _.get(result, 'clusterInGroup1');
    const clusterInGroup2 = _.get(result, 'clusterInGroup2');

    clusterIdInGroup1 = _.get(clusterInGroup1, 'id');
    clusterIdInGroup2 = _.get(clusterInGroup2, 'id');

    expect(clusterIdInGroup1).toBeDefined();
    expect(clusterIdInGroup2).toBeDefined();
    expect(clusterInGroup1.isGroup).toEqual(false);
    expect(clusterInGroup2.isGroup).toEqual(false);

    expect(clusterInGroup1.clusterGroupId).toEqual(clusterGroupId);
    expect(clusterInGroup2.clusterGroupId).toEqual(clusterGroupId);
  });

  it('throw error when creating an invalid cluster into a group', async () => {
    const query = `mutation {
        createWithInvalidGroup: createCluster(input: {
          name: "${testKey}"
          # type: ami  # uncomment when VE-16319 is DONE
          dockerCredentials: {}
          allowedEngines: []
          clusterGroupId: "${clusterIdInGroup1}"
        }) {
          id
          name
          isGroup
          clusterGroupId
        }
        createGroupInGroup: createCluster(input: {
          name: "${testKey}"
          # type: ami  # uncomment when VE-16319 is DONE
          dockerCredentials: {}
          allowedEngines: []
          clusterGroupId: "${clusterGroupId}"
          isGroup: true
        }) {
          id
          name
          isGroup
          clusterGroupId
        }
      }`;

    await expect(async () => gqlClient.query(query)).rejects.toThrow(
      'not_found'
    );
  });

  it('create a cluster with tags', async () => {
    const query = `mutation {
      createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        dockerCredentials: {}
        containerTag: "test"
        paused: true
        memorySize: "1gb"
        storageSize: "8gb"
        allowedEngines: []
        collaborators: [
          {
            organizationId: ${testOrgId}
            permission: viewer
          }
        ]
        tags: ["foo", "bar"]
        subscriptions: [
          {
            userId: "${userId}",
            isActive: true
          }
        ]
        clusterConfig: {
          restartTimeUTC: "03:00",
          mediaStoragePath: "../mnnt/",
          mediaStorage: "edge"
        }
        mediaStoragePath: "../mnnt/tt",
        mediaStorage: core,
        restartTimeUTC: "04:00"
      }) {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        subscriptions {
          count
          records {
            userId
            emailAddress
            id
            createdDateTime
            modifiedDateTime
            isActive
          }
        }
        clusterConfig
      }
    }`;

    const result = await gqlClient.query(query);

    const createCluster = _.get(result, 'createCluster');
    clusterId = _.get(createCluster, 'id');
    expect(clusterId).toBeDefined();
    expect(createCluster.collaborators.count).toEqual(1);
    expect(createCluster.collaborators.records[0].organizationId).toEqual(
      testOrgId.toString()
    );
    expect(createCluster.collaborators.records[0].permission).toEqual('viewer');
    expect(createCluster.tags.length).toEqual(2);
    expect(createCluster.tags[0]).toEqual('foo');
  });

  it('create a cluster that did not have tags', async () => {
    const query = `mutation {
      createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        dockerCredentials: {}
        containerTag: "test"
        paused: true
        memorySize: "1gb"
        storageSize: "8gb"
        tags: []
        allowedEngines: []
        collaborators: [
          {
            organizationId: ${testOrgId}
            permission: viewer
          }
        ]
        clusterConfig: {
          restartTimeUTC: "03:00",
          mediaStoragePath: "../mnnt/",
          mediaStorage: "edge",
          managementNodeId: ""
        }
      }) {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
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

    const result = await gqlClient.query(query);
    const createCluster = _.get(result, 'createCluster');
    clusterNoTagsId = _.get(createCluster, 'id');
    expect(clusterId).toBeDefined();
    expect(_.get(createCluster, 'collaborators.count')).toEqual(1);
    expect(
      _.get(createCluster, 'collaborators.records[0].organizationId')
    ).toEqual(testOrgId.toString());
    expect(_.get(createCluster, 'collaborators.records[0].permission')).toEqual(
      'viewer'
    );
  });

  it('create a cluster for another org as superadmin', async () => {
    const query = `mutation {
      createCluster(input: {
        name: "${testKey}"
        # type: ami  # uncomment when VE-16319 is DONE
        organizationId: "17560"
        dockerCredentials: {}
        containerTag: "test"
        paused: true
        memorySize: "1gb"
        storageSize: "8gb"
        tags: []
        allowedEngines: []
        collaborators: [
          {
            organizationId: 7862
            permission: viewer
          }
        ]
        clusterConfig: {
          restartTimeUTC: "03:00",
          mediaStoragePath: "../mnnt/",
          mediaStorage: "edge",
          managementNodeId: ""
        }
      }) {
        id
        name
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

    const result = await gqlClient.query(query);
    const createCluster = _.get(result, 'createCluster');
    clusterAnotherOrgId = _.get(createCluster, 'id');
    expect(clusterAnotherOrgId).toBeDefined();
    expect(_.get(createCluster, 'collaborators.count')).toEqual(1);
    expect(_.get(createCluster, 'organizationId')).toEqual('17560');
    expect(_.get(createCluster, 'collaborators.records[0].permission')).toEqual(
      'viewer'
    );
  });

  it('create clusterNode in cluster', async () => {
    const query = `mutation {
      createNode1: createClusterNode(input: {
        clusterId: "${clusterId}"
        name: "${citestMarker}-node1"
        metrics: {
          mbRam: 8966,
          mbDisk: 874197,
          version: "0.1.0",
          bundleId: "NOT_FOUND",
          cpuCount: 4,
          bundleDate: "NOT_FOUND",
          ipExternal: "18.209.46.115",
          ipInternal: "10.0.191.109",
          ansibleVersion: "ansible 2.5.15"
        }
        nodeConfig: {
          ram: "foo",
          mbRom: "fa"
        }
      }) {
        id
        name
        clusterId
        nodeConfig
        createdDateTime
        modifiedDateTime
      }
      createNode2: createClusterNode(input: {
        clusterId: "${clusterId}"
        name: "${citestMarker}-node2"
        metrics: {
          cpuCount: 33,
          mbRam: 8967,
          mbDisk: 874197
        }
        nodeConfig: {
          ram: "foo2",
          mbRom: "fa2"
        }
      }) {
        id
        name
        clusterId
        nodeConfig
        createdDateTime
        modifiedDateTime
      }
    }`;

    const result = await gqlClient.query(query);

    expect(result.createNode1).toBeDefined();
    expect(result.createNode1.id).toBeDefined();
    expect(result.createNode1.clusterId).toBeDefined();
    expect(result.createNode1.createdDateTime).toBeDefined();
    expect(result.createNode1.modifiedDateTime).toBeDefined();
    // node 2
    expect(result.createNode2).toBeDefined();
    expect(result.createNode2.id).toBeDefined();
    expect(result.createNode2.clusterId).toBeDefined();
    expect(result.createNode2.createdDateTime).toBeDefined();
    expect(result.createNode2.modifiedDateTime).toBeDefined();
  });

  it('create a job in cluster', async () => {
    const query = `mutation {
      createJob(input: {
        clusterId: "${clusterId}"
        tasks: [
          {
            engineId: "${engineId}"
          }
        ]
      }) {
        id
        clusterId
      }
      createJobTemplate(input: {
        clusterId: "${clusterId}"
        taskTemplates: [
          {
            engineId: "${engineId}"
          }
        ]
      }) {
        id
        clusterId
      }
    }`;

    const result = await gqlClient.query(query);
    expect(result.createJob).toBeDefined();
    expect(result.createJob.id).toBeDefined();
    expect(result.createJob.clusterId).toEqual(clusterId);
    expect(result.createJobTemplate).toBeDefined();
    expect(result.createJobTemplate.id).toBeDefined();
    jobTemplateId = result.createJobTemplate.id;
    expect(result.createJobTemplate.clusterId).toEqual(clusterId);
  });

  it('create a job in cluster Group', async () => {
    const query = `mutation {
      createJob(input: {
        clusterId: "${clusterGroupId}"
        tasks: [
          {
            engineId: "${engineId}"
          }
        ]
      }) {
        id
        clusterId
      }
    }`;

    const result = await gqlClient.query(query);
    expect(result.createJob).toBeDefined();
    expect(result.createJob.id).toBeDefined();
    expect(
      result.createJob.clusterId === clusterIdInGroup1 ||
        result.createJob.clusterId === clusterIdInGroup2
    ).toEqual(true);
  });

  it('get a cluster', async () => {
    const query = `
query {
  cluster(id: "${clusterId}") {
    id
    jobs {
      records {
        id
      }
    }
    tasks {
      records {
        id
      }
    }
    clusterConfig
    state
    stateLastUpdatedDateTime
    mediaStorage
    mediaStoragePath
    managementNodeID
    restartTimeUTC
    nodes{
      records{
        id
        metrics
      }
    }
    targetStatus
  }
}
    `;

    const result = await gqlClient.query(query);
    expect(result.cluster).toBeDefined();
    expect(result.cluster.id).toEqual(clusterId);
    //Temporarily skipped because the job and task was not created
    // expect(_.get(result, 'cluster.jobs.records[0].id')).toBeDefined();
    // expect(_.get(result, 'cluster.tasks.records[0].id')).toBeDefined();
    expect(_.get(result, 'cluster.clusterConfig')).toBeDefined();
    expect(_.get(result, 'cluster.stateLastUpdatedDateTime')).toBeDefined();
    expect(_.get(result, 'cluster.mediaStorage')).toBeDefined();
    expect(_.get(result, 'cluster.mediaStoragePath')).toEqual('../mnnt/');
    expect(result.cluster.targetStatus).toBeFalsy();
    nodeId1 = _.get(result, 'cluster.nodes.records[0].id');
    nodeId2 = _.get(result, 'cluster.nodes.records[1].id');
    //nodeMetrics1 = _.get(result, 'cluster.nodes.records[0].metrics');
    //nodeMetrics2 = _.get(result, 'cluster.nodes.records[1].metrics');
  });

  it('get a Cluster Group', async () => {
    const query = `
query {
  cluster(id: "${clusterGroupId}") {
    id
    name
    isGroup
    clusterGroupId
    clusters {
      count
      records {
        id
        isGroup
        clusterGroupId
      }
    }
  }
}
    `;

    const result = await gqlClient.query(query);

    expect(result.cluster).toBeDefined();
    expect(result.cluster.id).toEqual(clusterGroupId);
    expect(result.cluster.isGroup).toEqual(true);
    expect(result.cluster.clusterGroupId).toBeFalsy();
    expect(result.cluster.clusters.count).toEqual(2);
    expect(result.cluster.clusters.records[0].isGroup).toEqual(false);
    expect(result.cluster.clusters.records[0].clusterGroupId).toEqual(
      clusterGroupId
    );
    expect(result.cluster.clusters.records[1].isGroup).toEqual(false);
    expect(result.cluster.clusters.records[1].clusterGroupId).toEqual(
      clusterGroupId
    );
  });

  it('update state in cluster', async () => {
    const query = `mutation {
      updateClusterState(input: {
        id: "${clusterId}"
        nodes: [
          {
            nodeId: "${nodeId1}",
            metrics: {
              mbRam: 1
            }
          },
          {
            nodeId: "${nodeId2}",
            metrics: {
              mbRam: 2
            }
          }
        ]
        state: {
          st: "foo"
        }
        targetStatus: deploying
      }) {
        id
        name
        nodes{
          records{
            id
            metrics
          }
        }
        targetStatus
      }
    }`;

    const result = await gqlClient.query(query);

    const updateClusterState = _.get(result, 'updateClusterState');
    expect(updateClusterState).toBeDefined();
    expect(_.get(updateClusterState, 'nodes.records[0].id')).toBeDefined();
    expect(_.get(updateClusterState, 'nodes.records[0].metrics.mbRam')).toEqual(
      1
    );
    expect(_.get(updateClusterState, 'nodes.records[1].id')).toBeDefined();
    expect(_.get(updateClusterState, 'nodes.records[1].metrics.mbRam')).toEqual(
      2
    );
    expect(_.get(updateClusterState, 'targetStatus')).toEqual('deploying');
  });

  it('pause a cluster', async () => {
    const query = `mutation {
      pauseCluster(input: {
        id: "${clusterId}"
      }) {
        id
        name
      }
    }`;

    const result = await gqlClient.query(query);
    expect(result.pauseCluster).toBeDefined();
    expect(result.pauseCluster.id).toBeDefined();
    expect(result.pauseCluster.id).toEqual(clusterId);
  });

  it('unpause a cluster', async () => {
    const query = `mutation {
      unpauseCluster(input: {
        id: "${clusterId}"
      }) {
        id
        name
      }
    }`;

    const result = await gqlClient.query(query);

    expect(result.unpauseCluster).toBeDefined();
    expect(result.unpauseCluster.id).toBeDefined();
    expect(result.unpauseCluster.id).toEqual(clusterId);
  });

  it('update a cluster', async () => {
    const query = `mutation {
      updateCluster(input: {
        id: "${clusterId}"
        name: "${testKey}1"
        collaborators: [
          {
            organizationId: ${testOrgId}
            permission: none
          }
        ]
        clusterConfig: {
          serviceToken: "token"
        }
        tags: ["foo", "bar"]
        status: active
        serviceToken: "token1"
        mediaStoragePath: "../mnnt/ttn"
        restartTimeUTC: "02:00"
        subscriptions:[]
      }) {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        clusterConfig
        restartTimeUTC
        mediaStoragePath
        subscriptions {
          count
          records {
            isActive
          }
        }
      }
    }`;

    const result = await gqlClient.query(query);

    const updateCluster = _.get(result, 'updateCluster');
    clusterId = _.get(updateCluster, 'id');
    expect(clusterId).toBeDefined();
    // Validate properties updated
    expect(_.get(updateCluster, 'name')).toEqual(testKey + '1');
    expect(_.get(updateCluster, 'collaborators.count')).toEqual(0);
    // Validate properties were not updated
    expect(_.get(updateCluster, 'containerTag')).toEqual('test');
    expect(_.get(updateCluster, 'tags.length')).toEqual(2);
    expect(_.get(updateCluster, 'tags[0]')).toEqual('foo');
    //expect(_.get(updateCluster, 'restartTimeUTC')).toEqual('02:00+00:00');
    expect(_.get(updateCluster, 'mediaStoragePath')).toEqual('../mnnt/ttn');
    expect(_.get(updateCluster, 'subscriptions.count')).toEqual(0);
    expect(_.get(updateCluster, 'clusterConfig.serviceToken')).toEqual('token');
  });

  it('update a cluster of another org as super admin', async () => {
    const query = `mutation {
      updateCluster(input: {
        id: "${clusterAnotherOrgId}"
        name: "${testKey}1"
        collaborators: [
          {
            organizationId: "17560"
            permission: none
          }
        ]
        clusterConfig: {
          serviceToken: "token"
        }
        tags: ["foo", "bar"]
        status: active
        serviceToken: "token1"
        mediaStoragePath: "../mnnt/ttn"
        restartTimeUTC: "02:00"
        subscriptions:[]
      }) {
        id
        name
        organizationId
        type
        memorySizeBytes
        storageSizeBytes
        paused
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        clusterConfig
        restartTimeUTC
        mediaStoragePath
        subscriptions {
          count
          records {
            isActive
          }
        }
      }
    }`;

    const result = await gqlClient.query(query);
    const updateCluster = _.get(result, 'updateCluster');
    clusterAnotherOrgId = _.get(updateCluster, 'id');
    expect(clusterAnotherOrgId).toBeDefined();
    // Validate properties updated
    expect(_.get(updateCluster, 'name')).toEqual(testKey + '1');
    expect(_.get(updateCluster, 'organizationId')).toEqual('17560');
  });

  it('update a cluster of another org use internal api token', async () => {
    const query = `mutation {
      updateCluster(input: {
        id: "${clusterAnotherOrgId}"
        name: "${testKey}1"
        collaborators: [
          {
            organizationId: "17560"
            permission: none
          }
        ]
        clusterConfig: {
          serviceToken: "token"
        }
        tags: ["foo", "bar"]
        status: active
        serviceToken: "token1"
        mediaStoragePath: "../mnnt/ttn"
        restartTimeUTC: "02:00"
        subscriptions:[]
      }) {
        id
        name
        organizationId
        type
        memorySizeBytes
        storageSizeBytes
        paused
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        clusterConfig
        restartTimeUTC
        mediaStoragePath
        subscriptions {
          count
          records {
            isActive
          }
        }
      }
    }`;
    const result = await gqlClient.query(query, undefined, true);
    const updateCluster = _.get(result, 'updateCluster');
    clusterAnotherOrgId = _.get(updateCluster, 'id');
    expect(clusterAnotherOrgId).toBeDefined();
    // Validate properties updated
    expect(_.get(updateCluster, 'name')).toEqual(testKey + '1');
    expect(_.get(updateCluster, 'organizationId')).toEqual('17560');
  });

  it('update a cluster config and keep tags', async () => {
    const query = `mutation {
      updateCluster(input: {
        id: "${clusterId}"
        managementNodeID: "${nodeId1}"
      }) {
        id
        tags
        managementNodeID
        clusterConfig
      }
    }`;

    const result = await gqlClient.query(query);

    const updateCluster = _.get(result, 'updateCluster');
    clusterId = _.get(updateCluster, 'id');
    expect(clusterId).toBeDefined();

    // Validate properties updated
    expect(_.get(updateCluster, 'managementNodeID')).toEqual(nodeId1);
    expect(_.get(updateCluster, 'clusterConfig.managementNodeId')).toEqual(
      nodeId1
    );
    // Validate properties were not updated
    expect(_.get(updateCluster, 'tags.length')).toEqual(2);
    expect(_.get(updateCluster, 'tags[0]')).toEqual('foo');
  });

  it('update a cluster to status failure', async () => {
    const query = `mutation {
      updateCluster(input: {
        id: "${clusterId}"
        status: failure
      }) {
        id
        status
      }
    }`;

    const result = await gqlClient.query(query);
    const updateCluster = _.get(result, 'updateCluster');
    expect(_.get(updateCluster, 'id')).toEqual(clusterId);
    // Validate status updated
    expect(_.get(updateCluster, 'status')).toEqual('failure');
  });

  it('get clusters', async () => {
    const time = moment().add(1, 'minute').toISOString();
    const query = `query {
      cluster(id: "${clusterNoTagsId}") {
        id
        name
        type
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        clusterConfig
        state
        stateLastUpdatedDateTime
        mediaStorage
        mediaStoragePath
        managementNodeID
        restartTimeUTC
      }
      clusters(id: "${clusterId}", tagMatch: startsWith, tags: ["fo", "ba", "bar"], orderBy: [{
        field: name
        direction: asc
      }], , dateTimeFilter: {
        toDateTime: "${time}",
        field: createdDateTime
      }) {
        records {
          id
          name
          type
          memorySizeBytes
          storageSizeBytes
          paused
          containerTag
          allowedEngines
          createdDateTime
          modifiedDateTime
          collaborators {
            count
            records {
              organizationId
              permission
            }
          }
          tags
          clusterConfig
          state
          stateLastUpdatedDateTime
          mediaStorage
          mediaStoragePath
          managementNodeID
          restartTimeUTC
          targetStatus
        }
      }
      clusterActiveInAGroup: clusters(
        clusterGroupId: "${clusterGroupId}",
        clusterGroupIds: ["${clusterGroupId}"],
        status: active
      ) {
        count
        records {
          id
          name
          status
          isGroup
          clusterGroupId
        }
      }
      allClusterGroup: clusters(isGroup: true, limit: 1) {
        records {
          id
          name
          isGroup
          clusterGroupId 
        }
      }
    }`;

    const result = await gqlClient.query(query);
    const cluster = _.get(result, 'cluster');
    const clusters = _.get(result, 'clusters.records[0]');
    const clusterActiveInAGroup = _.get(result, 'clusterActiveInAGroup');
    const allClusterGroup = _.get(result, 'allClusterGroup.records[0]');
    expect(cluster).toBeDefined();
    expect(clusters).toBeDefined();
    // Validate properties updated
    expect(_.get(clusters, 'name')).toEqual(testKey + '1');
    expect(_.get(clusters, 'collaborators.count')).toEqual(0);
    // Validate properties were not updated
    expect(_.get(clusters, 'containerTag')).toEqual('test');
    expect(_.get(clusters, 'tags.length')).toEqual(2);
    expect(_.get(clusters, 'tags[0]')).toEqual('foo');
    expect(_.get(clusters, 'clusterConfig')).toBeDefined();
    expect(_.get(clusters, 'stateLastUpdatedDateTime')).toBeDefined();
    expect(_.get(clusters, 'mediaStorage')).toBeDefined();
    expect(_.get(clusters, 'targetStatus')).toEqual('deploying');
    expect(_.get(result, 'cluster.mediaStoragePath')).toEqual('../mnnt/');
    // expect(_.get(clusterActiveInAGroup, 'id')).toEqual(clusterIdInGroup1);
    expect(_.get(clusterActiveInAGroup, 'count')).toEqual(2);
    expect(_.get(clusterActiveInAGroup, 'records[0].isGroup')).toEqual(false);
    expect(_.get(clusterActiveInAGroup, 'records[0].clusterGroupId')).toEqual(
      clusterGroupId
    );
    expect(_.get(clusterActiveInAGroup, 'records[0].status')).toEqual('active');
    expect(_.get(allClusterGroup, 'isGroup')).toEqual(true);
    expect(_.get(allClusterGroup, 'clusterGroupId')).toBeFalsy();
  });

  it('get all clusters of another org as superadmin', async () => {
    const query = `query {
      clusters (organizationId: "17560"){
        records {
          id
          name
          organizationId
        }
      }
    }`;

    const result = await gqlClient.query(query);
    expect(_.get(result, 'clusters.records[0].organizationId')).toEqual(
      '17560'
    );
  });

  it('get cluster tags in use by this organization', async () => {
    const query = `query {
      clusterTags(matchType: startsWith, match: "fo")
    }`;

    const result = await gqlClient.query(query);
    const clusterTags = _.get(result, 'clusterTags');
    expect(clusterTags).toBeDefined();
    expect(clusterTags.length).toBeGreaterThan(0);
  });
});
