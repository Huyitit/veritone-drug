const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../../../test/serviceContext.mock.js')();

serviceContext.coreJob.cjdal.node = {
  getNodes: (node, x, cb) => {
    cb(null, [node]);
  },
  updatePauseStatusForNodes: (nodeIds, f, g, cb) => {
    cb(null, []);
  },
  pairNodeToCluster: jest
    .fn()
    .mockImplementation((node, dbClient, callback) => callback(null)),
  updateNodePing: jest
    .fn()
    .mockImplementation((nodeId, dbClient, callback) => callback(null)),
  updateNodeMetrics: jest
    .fn()
    .mockImplementation((nodeId, metrics, dbClient, callback) =>
      callback(null)
    ),
  unpairNode: jest
    .fn()
    .mockImplementation((nodeId, dbClient, callback) => callback(null))
};

beforeEach(function () {
  serviceContext._clearAll();
});

const dal = require('./clusterNode.js')(serviceContext);

describe('#clusterNode', function () {
  const clusterNodeId = '0f8646b1-585a-4c07-95dc-d8d2838e2580';
  const clusterNodeName = 'test_123456';
  const clusterId = 'ami-0f8646b1-585a-4c07-95dc-d8d2838e2580';
  const tokenUser = 'd1495904-9341-4b45-bdd0-56225ed7005e';
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(12);

      chaiExpect(typeof dal.getClusterNode).to.equal('function');
      chaiExpect(typeof dal.getClusterNodes).to.equal('function');
      chaiExpect(typeof dal.getClusterNodeList).to.equal('function');
      chaiExpect(typeof dal.createClusterNode).to.equal('function');
      chaiExpect(typeof dal.updateClusterNode).to.equal('function');
      chaiExpect(typeof dal.deleteClusterNode).to.equal('function');
      chaiExpect(typeof dal.pauseClusterNode).to.equal('function');
      chaiExpect(typeof dal.unpauseClusterNode).to.equal('function');
      chaiExpect(typeof dal.pairClusterNode).to.equal('function');
      chaiExpect(typeof dal.computeClusterNodeStatus).to.equal('function');
      chaiExpect(typeof dal.pingClusterNode).to.equal('function');
      chaiExpect(typeof dal.unpairClusterNode).to.equal('function');
    });
  });

  describe('#getClusterNode', function () {
    it('should get a clusterNode without clusterId', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId
        }
      ]);
      const cn = await dal.getClusterNode(mockUtil.makeContext(), {
        id: clusterNodeId
      });
      chaiExpect(cn).to.exist;
      chaiExpect(cn.id).to.equal(clusterNodeId);
    });
    it('should get a clusterNode with clusterId', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId,
          clusterId: clusterId
        }
      ]);
      const cn = await dal.getClusterNode(mockUtil.makeContext(), {
        id: clusterNodeId,
        clusterId: clusterId
      });
      chaiExpect(cn).to.exist;
      chaiExpect(cn.id).to.equal(clusterNodeId);
      chaiExpect(cn.clusterId).to.equal(clusterId);
    });
  });

  describe('#getClusterNodes', function () {
    it('should get clusterNodes', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId
        }
      ]);
      const cn = await dal.getClusterNodes(mockUtil.makeContext(), {
        id: clusterNodeId
      });
      chaiExpect(cn).to.exist;
      chaiExpect(cn.records).to.exist;
      chaiExpect(cn.records.length).to.equal(1);
      chaiExpect(cn.records[0].id).to.equal(clusterNodeId);
    });
    it('should get not ami clusterNodes', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId,
          role: 'dual'
        }
      ]);
      const cn = await dal.getClusterNodes(mockUtil.makeContext(), {
        id: clusterNodeId,
        notAmiNode: true
      });
      chaiExpect(cn).to.exist;
      chaiExpect(cn.records).to.exist;
      chaiExpect(cn.records.length).to.equal(1);
      chaiExpect(cn.records[0].id).to.equal(clusterNodeId);
    });
    it('super admin should get clusterNodes (is not all nodes)', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId,
          organization_id: '7682'
        }
      ]);

      const cn = await dal.getClusterNodes(mockUtil.makeContext(), {
        id: clusterNodeId,
        allNodes: false
      });
      chaiExpect(cn).to.exist;
      chaiExpect(cn.records).to.exist;
      chaiExpect(cn.records.length).to.equal(1);
      chaiExpect(cn.records[0].id).to.equal(clusterNodeId);
      chaiExpect(cn.records[0].organizationId).to.equal('7682');
    });
  });

  describe('#createClusterNode', function () {
    let context = {};

    it('should throw NotAllowed error when org is full nodes', async function () {
      let res, err;
      const args = {
        input: {
          name: clusterNodeName
        }
      };
      context._authInfo = {
        organization: {
          organizationId: 7682,
          maxAiwareNodes: 4
        }
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        },
        {
          id: '123'
        },
        {
          id: '123'
        },
        {
          id: '123'
        }
      ]);
      try {
        res = await dal.createClusterNode(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      chaiExpect(res).to.be.undefined;
    });
    it('should create ami Node', async function () {
      let res, err;
      const args = {
        input: {
          name: clusterNodeName,
          nodeConfig: {
            notAmiNode: false
          }
        }
      };
      context._authInfo = {
        organization: {
          organizationId: 7682,
          maxAiwareNodes: 4
        }
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        },
        {
          id: '123'
        },
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          node_id: clusterNodeId,
          cluster_id: clusterId,
          display_name: clusterNodeName,
          metrics: {
            cpuCount: 4,
            mbRam: 240,
            mbDisk: 512,
            customField: 'fa'
          },
          container_tag: 'foo',
          offline_browsing: true,
          storage_present: true,
          node_config: {}
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.createClusterNode(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.nodeId).to.equal(clusterNodeId);
      chaiExpect(res.containerTag).to.equal('foo');
      chaiExpect(res.metrics.customField).to.equal('fa');
    });
    it('should create Cluster Node', async function () {
      let res, err;
      const args = {
        input: {
          name: clusterNodeName
        }
      };
      context._authInfo = {
        organization: {
          organizationId: 7682,
          maxAiwareNodes: 4
        }
      };
      serviceContext.dbConnections['core'].read._push([
        {
          id: '123'
        },
        {
          id: '123'
        },
        {
          id: '123'
        }
      ]);
      serviceContext.dbConnections['core'].write._push([
        {
          node_id: clusterNodeId,
          cluster_id: clusterId,
          display_name: clusterNodeName,
          metrics: {
            cpuCount: 4,
            mbRam: 240,
            mbDisk: 512,
            customField: 'fa'
          },
          container_tag: 'foo',
          offline_browsing: true,
          storage_present: true,
          node_config: {}
        }
      ]);

      serviceContext.dbConnections['core'].write._push([]);

      try {
        res = await dal.createClusterNode(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.nodeId).to.equal(clusterNodeId);
      chaiExpect(res.containerTag).to.equal('foo');
      chaiExpect(res.metrics.customField).to.equal('fa');
    });
  });

  describe('#updateClusterNode', function () {
    let context = {};

    it('should update ClusterNode', async function () {
      let res, err;
      const args = {
        input: {
          id: clusterNodeId,
          name: clusterNodeName,
          metrics: {
            newField: 'fa'
          },
          nodeConfig: {
            customField: 'foo'
          }
        }
      };

      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId,
          display_name: clusterNodeName,
          metrics: {
            newField: 'fa'
          },
          node_config: {
            customField: 'foo'
          }
        }
      ]);

      try {
        res = await dal.updateClusterNode(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(clusterNodeId);
      chaiExpect(res.displayName).to.equal(clusterNodeName);
      chaiExpect(res.nodeConfig.customField).to.equal('foo');
      chaiExpect(res.metrics.newField).to.equal('fa');
    });
  });

  describe('#deleteClusterNode', function () {
    it('should delete a clusterNode', async function () {
      _.set(serviceContext, 'coreJob.cjdal.node.unpairNode', unpairNode);
      _.set(serviceContext, 'coreJob.cjdal.node.deleteNode', deleteNode);
      const res = await dal.deleteClusterNode(mockUtil.makeContext(), {
        id: clusterNodeId
      });
      chaiExpect(res).to.exist;
    });
  });

  describe('#pauseClusterNode', function () {
    it('should pause a clusterNode', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId
        }
      ]);
      const res = await dal.pauseClusterNode(mockUtil.makeContext(), {
        input: { id: clusterNodeId }
      });
      chaiExpect(res).to.exist;
    });
  });

  describe('#unpauseClusterNode', function () {
    it('should unpause a clusterNode', async function () {
      serviceContext.dbConnections['core'].read._push([
        {
          id: clusterNodeId
        }
      ]);
      const res = await dal.unpauseClusterNode(mockUtil.makeContext(), {
        input: { id: clusterNodeId }
      });
      chaiExpect(res).to.exist;
    });
  });

  describe('#pairClusterNode', function () {
    it('should throw validation error', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = { input: { id: 'clusterNodeId', nodePair: {} } };

      try {
        res = await dal.pairClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should throw the node limit error', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'clusterNodeId',
          nodePair: {
            clusterId: 'clusterId',
            displayName: 'displayName',
            role: 'dual',
            offlineBrowsing: true
          }
        }
      };

      // set max node limit for org
      _.set(context, '_authInfo.organization.maxAiwareNodes', 1);
      // getClusterNodes
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId1' },
        { id: 'clusterNodeId2' }
      ]);

      try {
        res = await dal.pairClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'Number of nodes in your orgrizantion is maximum!'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('not_allowed');
    });

    it('should throw error node has been paired', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'clusterNodeId',
          nodePair: {
            clusterId: 'clusterId',
            displayName: 'displayName',
            role: 'dual',
            offlineBrowsing: true
          }
        }
      };

      // set max node limit for org
      _.set(context, '_authInfo.organization.maxAiwareNodes', 2);
      // getClusterNodes
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId1' }
      ]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: 'clusterId' }]);
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId', clusterId: 'clusterId' }
      ]);

      try {
        res = await dal.pairClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('node has already been paired');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should pair cluster node with display name has colon index', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'clusterNodeId',
          nodePair: {
            clusterId: 'clusterId',
            displayName: 'display:Name',
            role: 'dual',
            offlineBrowsing: true
          }
        }
      };

      // set max node limit for org
      _.set(context, '_authInfo.organization.maxAiwareNodes', 2);
      // getClusterNodes
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId1' }
      ]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: 'clusterId' }]);
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'clusterNodeId',
          metrics: { ipExternal: 'ipExternal' }
        }
      ]);
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'clusterNodeId',
          clusterId: 'clusterId',
          metrics: { ipExternal: 'ipExternal' }
        }
      ]);

      try {
        res = await dal.pairClusterNode(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('clusterNodeId');
      chaiExpect(res.clusterId).to.equal('clusterId');
    });

    it('should pair cluster node', async function () {
      let res, err;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          id: 'clusterNodeId',
          nodePair: {
            clusterId: 'clusterId',
            displayName: 'displayName',
            role: 'dual',
            offlineBrowsing: true
          }
        }
      };

      // set max node limit for org
      _.set(context, '_authInfo.organization.maxAiwareNodes', 2);
      // getClusterNodes
      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId1' }
      ]);
      // getCluster
      serviceContext.dbConnections['core'].read._push([{ id: 'clusterId' }]);
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'clusterNodeId',
          metrics: { ipExternal: 'ipExternal' }
        }
      ]);
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([
        {
          id: 'clusterNodeId',
          clusterId: 'clusterId',
          metrics: { ipExternal: 'ipExternal' }
        }
      ]);

      try {
        res = await dal.pairClusterNode(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('clusterNodeId');
      chaiExpect(res.clusterId).to.equal('clusterId');
    });
  });

  describe('#computeClusterNodeStatus', function () {
    it('should return status decomissioned', function () {
      let res, err;
      const clusterNode = { deletedDateTime: 'deletedDateTime' };

      try {
        res = dal.computeClusterNodeStatus(clusterNode);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('decomissioned');
    });

    it('should return status paused', function () {
      let res, err;
      const clusterNode = { paused: true };

      try {
        res = dal.computeClusterNodeStatus(clusterNode);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('paused');
    });

    it('should return status anonymous', function () {
      let res, err;
      const clusterNode = {};

      try {
        res = dal.computeClusterNodeStatus(clusterNode);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('anonymous');
    });

    it('should return status offline', function () {
      let res, err;
      const clusterNode = { clusterId: 'clusterId', lastPing: null };

      try {
        res = dal.computeClusterNodeStatus(clusterNode);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('offline');
    });

    it('should return status running', function () {
      let res, err;
      const clusterNode = {
        clusterId: 'clusterId',
        lastPing: parseInt(new Date() / 1000, 10) + 1000
      };

      try {
        res = dal.computeClusterNodeStatus(clusterNode);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res).to.equal('running');
    });
  });

  describe('#pingClusterNode', function () {
    it('should throw validation errors', async function () {
      let err, res;
      const context = mockUtil.makeContext();
      const args = {
        input: { nodeId: 'clusterNodeId', nodeMetrics: { mbRam: 8 } }
      };

      try {
        res = await dal.pingClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('bad request');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should update node ping failed', async function () {
      let err, res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          nodeId: 'clusterNodeId',
          nodeMetrics: {
            mbRam: 8,
            cpuCount: 8,
            mbDisk: 500
          }
        }
      };

      serviceContext.coreJob.cjdal.node.updateNodePing.mockImplementationOnce(
        (nodeId, dbClient, callback) => callback(new Error('error'), {})
      );

      try {
        res = await dal.pingClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('error');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
    });

    it('should throw not found error', async function () {
      let err, res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          nodeId: 'clusterNodeId',
          nodeMetrics: {
            mbRam: 8,
            cpuCount: 8,
            mbDisk: 500
          }
        }
      };

      try {
        res = await dal.pingClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'The requested object was not found'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('not_found');
    });

    it('should ping cluster node successfully', async function () {
      let err, res;
      const context = mockUtil.makeContext();
      const args = {
        input: {
          nodeId: 'clusterNodeId',
          nodeMetrics: {
            mbRam: 8,
            cpuCount: 8,
            mbDisk: 500
          }
        }
      };

      serviceContext.coreJob.cjdal.node.updateNodePing.mockImplementationOnce(
        (nodeId, dbClient, callback) => callback(null, {})
      );
      // getClusterNode
      serviceContext.dbConnections['core'].read._push([{ id: 'nodeId' }]);

      try {
        res = await dal.pingClusterNode(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'The requested object was not found'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('nodeId');
    });
  });

  describe('#unpairClusterNode', function () {
    it('should unpair a cluster node', async function () {
      let err, res;
      const context = mockUtil.makeContext();
      const args = { id: 'clusterNodeId' };

      serviceContext.dbConnections['core'].read._push([
        { id: 'clusterNodeId', clusterId: null }
      ]);

      try {
        res = await dal.unpairClusterNode(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('clusterNodeId');
      chaiExpect(res.clusterId).to.be.null;
    });
  });
});

function unpairNode(nodeId, dbClient, callback) {
  if (!_.isFunction(callback)) {
    throw new Error('missing callback');
  }
  callback(null, {
    nodeId: '0f8646b1-585a-4c07-95dc-d8d2838e2580',
    displayName: 'test_123456'
  });
}

function deleteNode(nodeId, dbClient, callback) {
  if (!_.isFunction(callback)) {
    throw new Error('missing callback');
  }
  callback(null, {
    nodeId: '0f8646b1-585a-4c07-95dc-d8d2838e2580',
    displayName: 'test_123456'
  });
}
