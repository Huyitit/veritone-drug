const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;
const _ = require('lodash');

const testClusterName = 'test_cluster_' + Date.now();
const testClusterNodeName = 'test_cluster_node_' + Date.now();

// define object metrics
var objMetrics = {
  cpuCount: '32',
  mbRam: '8966',
  mbDisk: '874197',
  newField: 'fa'
};

const variables = {
  testClusterObject: {
    name: testClusterName,
    allowedEngines: [],
    dockerCredentials: {}
  },
  testClusterNodeObject: {
    name: testClusterNodeName,
    metrics: objMetrics,
    nodeConfig: {
      ipAddresses: '::1',
      diskSizeBytes: 874197,
      memorySizeBytes: 8966,
      cpu: 32,
      agentVersion: '1.0',
      installedSoftware: ['docker:17.1']
    }
  }
};

let env = config.env;
let authUrl = 'https://api.' + env + '.veritone.com/v1';
let url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
let options;
let optionsApiToken;
let clusterId;
let clusterNodeId, clusterNodeIdApiToken;

let debug = config.debug && config.debug === true;

describe('authenicate', () => {
  it('sign in', done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, userId, organizationId }) => {
        options = helpers.requestOptions(token);
        optionsApiToken = helpers.requestOptions(apiToken);
        expect(token).is.exist;
        done();
      })
      .catch(err => done(err));
  });
});

describe('test for cluster node', () => {
  it('should create a cluster', () => {
    const query = `
      mutation($testClusterObject: CreateCluster!) {
        createCluster(input: $testClusterObject) {
          id
          name
          createdDateTime
          modifiedDateTime
        }
      }
    `;

    return chakram
      .post(url, { query, variables: JSON.stringify(variables) }, options)
      .then(response => {
        helpers.expect(_.get(result, 'errors'), 'body.data.errors').to.be
          .undefined;
        const cluster = _.get(result, 'createCluster');
        expect(cluster.id).toBeDefined();
        expect(cluster.createdDateTime).toBeDefined();
        expect(cluster.modifiedDateTime).toBeDefined();
        expect(cluster.name).toEqual(testClusterName);
        clusterId = cluster.id;
        variables.testClusterNodeObject.clusterId = clusterId;
      });
  });

  it('should create a cluster node', () => {
    const query = `mutation createClusterNode($testClusterNodeObject: CreateClusterNode!) {
      createClusterNode(input: $testClusterNodeObject) {
        id
        name
        metrics
        clusterId
        nodeConfig
        createdDateTime
        modifiedDateTime
      }
    }`;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        expect(response.body.data.createClusterNode).toBeDefined();
        expect(response.body.data.createClusterNode.id).toBeDefined();
        expect(response.body.data.createClusterNode.clusterId).toBeDefined();
        expect(
          response.body.data.createClusterNode.createdDateTime
        ).toBeDefined();
        expect(
          response.body.data.createClusterNode.modifiedDateTime
        ).toBeDefined();
        expect(response.body.data.createClusterNode.clusterId).toEqual(
          clusterId
        );
        expect(response.body.data.createClusterNode.nodeConfig).toBeDefined();
        expect(
          response.body.data.createClusterNode.nodeConfig.agentVersion
        ).toEqual('1.0');
        clusterNodeId = response.body.data.createClusterNode.id;
        expect(
          response.body.data.createClusterNode.metrics.newField
        ).toBeDefined();
      });
  });

  it('should create a cluster node with apiToken', () => {
    const query = `mutation createClusterNode($testClusterNodeObject: CreateClusterNode!) {
      createClusterNode(input: $testClusterNodeObject) {
        id
        name
        metrics
        clusterId
        nodeConfig
        createdDateTime
        modifiedDateTime
      }
    }`;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, optionsApiToken)
      .then(response => {
        expect(response.body.data.createClusterNode).toBeDefined();
        expect(response.body.data.createClusterNode.id).toBeDefined();
        expect(response.body.data.createClusterNode.clusterId).toBeDefined();
        expect(
          response.body.data.createClusterNode.createdDateTime
        ).toBeDefined();
        expect(
          response.body.data.createClusterNode.modifiedDateTime
        ).toBeDefined();
        expect(response.body.data.createClusterNode.clusterId).toEqual(
          clusterId
        );
        expect(response.body.data.createClusterNode.nodeConfig).toBeDefined();
        expect(
          response.body.data.createClusterNode.nodeConfig.agentVersion
        ).toEqual('1.0');
        clusterNodeIdApiToken = response.body.data.createClusterNode.id;
        expect(
          response.body.data.createClusterNode.metrics.newField
        ).toBeDefined();
      });
  });

  it('should pause a cluster node', () => {
    const query = `
      mutation {
        pauseClusterNode(input: {
          id: "${clusterNodeId}"
        }) {
          id
          clusterId
          cluster {
            id
          }
          name
          createdDateTime
          modifiedDateTime
        }
      }
    `;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        expect(response.body.data.pauseClusterNode).toBeDefined();
        expect(response.body.data.pauseClusterNode.id).toBeDefined();
        expect(
          response.body.data.pauseClusterNode.createdDateTime
        ).toBeDefined();
        expect(
          response.body.data.pauseClusterNode.modifiedDateTime
        ).toBeDefined();
        expect(response.body.data.pauseClusterNode.clusterId).toBeDefined();
        expect(response.body.data.pauseClusterNode.clusterId).toEqual(
          clusterId
        );
      });
  });

  it('should unpause a cluster node', () => {
    const query = `
      mutation {
        unpauseClusterNode(input: {
          id: "${clusterNodeId}"
        }) {
          id
          clusterId
          cluster {
            id
          }
          name
          createdDateTime
          modifiedDateTime
        }
      }
    `;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        expect(response.body.data.unpauseClusterNode).toBeDefined();
        expect(response.body.data.unpauseClusterNode.id).toBeDefined();
        expect(
          response.body.data.unpauseClusterNode.createdDateTime
        ).toBeDefined();
        expect(
          response.body.data.unpauseClusterNode.modifiedDateTime
        ).toBeDefined();
        expect(response.body.data.unpauseClusterNode.clusterId).toBeDefined();
        expect(response.body.data.unpauseClusterNode.clusterId).toEqual(
          clusterId
        );
      });
  });

  it('should update a cluster node', () => {
    const query = `
      mutation {
        updateClusterNode(input: {
          id: "${clusterNodeId}"
          name: "new name"
          metrics: {
            cpuCount: "32",
            mbRam: "8966",
            mbDisk: "874197",
            newField: "foo"
          }
          nodeConfig: {
            ipAddresses: "::1",
            diskSizeBytes: 874197,
            memorySizeBytes: 8966,
            cpu: 32,
            agentVersion: "2.0",
            installedSoftware: "docker:17.1"
          }
        }) {
          id
          clusterId
          cluster {
            id
          }
          name
          metrics
          nodeConfig
          createdDateTime
          modifiedDateTime
        }
      }
    `;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        expect(response.body.data.updateClusterNode).toBeDefined();
        expect(response.body.data.updateClusterNode.id).toBeDefined();
        expect(response.body.data.updateClusterNode.clusterId).toBeDefined();
        expect(
          response.body.data.updateClusterNode.createdDateTime
        ).toBeDefined();
        expect(
          response.body.data.updateClusterNode.modifiedDateTime
        ).toBeDefined();
        expect(response.body.data.updateClusterNode.clusterId).toEqual(
          clusterId
        );
        expect(response.body.data.updateClusterNode.name).toEqual('new name');
        expect(response.body.data.updateClusterNode.nodeConfig).toBeDefined();
        expect(
          response.body.data.updateClusterNode.nodeConfig.agentVersion
        ).toEqual('2.0');
        expect(response.body.data.updateClusterNode.metrics).toBeDefined();
        expect(response.body.data.updateClusterNode.metrics.newField).toEqual(
          'foo'
        );
      });
  });

  it('should get cluster node', () => {
    const query = `
      query {
        clusterNode(id: "${clusterNodeId}") {
          id
          clusterId
          cluster {
            id
          }
          name
          metrics
          nodeConfig
          createdDateTime
          modifiedDateTime
        }
        clusterNodes(id: "${clusterNodeId}") {
          records {
            id
            clusterId
            cluster {
              id
            }
            name
            metrics
            nodeConfig
            createdDateTime
            modifiedDateTime
          }
        }
      }
    `;

    return chakram
      .post(url, { query, variables: JSON.stringify(variables) }, options)
      .then(response => {
        helpers.expect(_.get(result, 'errors'), 'body.data.errors').to.be
          .undefined;
        const clusterNode = _.get(result, 'clusterNode');
        const clusterNodes = _.get(
          response,
          'body.data.clusterNodes.records[0]'
        );
        expect(clusterNode).toBeDefined();
        expect(clusterNode.id).toBeDefined();
        expect(clusterNode.id).toEqual(clusterNodeId);
        expect(clusterNode.clusterId).toEqual(clusterId);
        expect(clusterNode.cluster).toBeDefined();
        expect(clusterNode.nodeConfig).toBeDefined();
        expect(clusterNode.createdDateTime).toBeDefined();
        expect(clusterNode.modifiedDateTime).toBeDefined();
        expect(clusterNode.nodeConfig.agentVersion).toEqual('2.0');
        expect(clusterNodes.id).toBeDefined();
        expect(clusterNodes.id).toEqual(clusterNodeId);
        expect(clusterNodes.clusterId).toEqual(clusterId);
        expect(clusterNodes.cluster).toBeDefined();
        expect(clusterNodes.nodeConfig).toBeDefined();
        expect(clusterNodes.createdDateTime).toBeDefined();
        expect(clusterNodes.modifiedDateTime).toBeDefined();
        expect(clusterNodes.nodeConfig.agentVersion).toEqual('2.0');
      });
  });

  it('should pause a cluster', async () => {
    const query = `mutation {
      pauseCluster(input: {
        id: "${clusterId}"
      }) {
        id
        name
      }
    }`;

    const result = await gqlClient.query(query);

    expect(response.body.data.pauseCluster).toBeDefined();
    expect(response.body.data.pauseCluster.id).toBeDefined();
    expect(response.body.data.pauseCluster.id).toEqual(clusterId);
  });
});

describe('delete artifacts created during the test', () => {
  it('should delete cluster node', async () => {
    const query = `mutation {
      deleteClusterNode(id: "${clusterNodeId}") {
        id
        message
      }
      deleteClusterNodeApiToken: deleteClusterNode(id: "${clusterNodeIdApiToken}") {
        id
        message
      }
    }`;

    console.log('Deleting cluster node....');
    const result = await gqlClient.query(query);

    expect(response.body.data.deleteClusterNode).toBeDefined();
    expect(response.body.data.deleteClusterNode.id).toBeDefined();
    expect(response.body.data.deleteClusterNode.id).toEqual(clusterNodeId);
    expect(response.body.data.deleteClusterNodeApiToken).toBeDefined();
    expect(response.body.data.deleteClusterNodeApiToken.id).toBeDefined();
    expect(response.body.data.deleteClusterNodeApiToken.id).toEqual(
      clusterNodeIdApiToken
    );
  });

  it('should delete cluster', async () => {
    const query = `mutation {
      deleteCluster(id: "${clusterId}") {
        id
        message
      }
    }`;

    const result = await gqlClient.query(query);

    helpers.expect(_.get(result, 'errors'), 'body.data.errors').to.be.undefined;
    const result = _.get(result, 'deleteCluster');
    expect(result).toBeDefined();
    expect(result.id).toEqual(clusterId);
  });
});
