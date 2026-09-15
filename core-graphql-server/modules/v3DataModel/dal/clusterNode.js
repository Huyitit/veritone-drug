const mapper = require('../../../dal/mapper.js');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const { logger, config, dbConnections } = serviceContext;
  const coreJobDal = serviceContext.coreJob.cjdal;
  const sourceDbRead = dbConnections['core'].read;
  // const sourceDbWrite = dbConnections['core'].write;
  const errors = require('../../../error')(config);
  const mainUtil = require('../../../util.js')();
  const resUtil = require('../../../resolvers/util')(serviceContext);

  const clusterNodeSelect = `
    n.node_id AS id,
    n.cluster_id,
    n.display_name AS name,
    n.role,
    n.metrics,
    n.last_ping,
    n.container_tag,
    n.paused,
    n.storage_present,
    n.offline_browsing,
    n.directory_oid,
    n.directory_patch_oid,
    n.directory_cache_date,
    n.directory_patch_cache_date,
    n.registered_date,
    n.deleted_date AS deleted_date_time,
    n.created_date AS created_date_time,
    n.updated_date AS updated_date_time,
    n.node_config
  `;

  const nodeReturning = {
    node_id: 'id',
    cluster_id: null,
    display_name: 'name',
    role: null,
    metrics: null,
    last_ping: null,
    container_tag: null,
    paused: null,
    offline_browsing: null,
    storage_present: null,
    directory_oid: null,
    directory_patch_oid: null,
    directory_cache_date: null,
    directory_patch_cache_date: null,
    registered_date: 'registered_date_time',
    deleted_date: 'deleted_date_time',
    created_date: 'created_date_time',
    updated_date: 'updated_date_time',
    node_config: null
  };
  const nodeStatus = {
    anonymous: 'anonymous',
    running: 'running',
    offline: 'offline',
    decomissioned: 'decomissioned',
    paused: 'paused'
  };

  async function getClusterNode(context, args) {
    const data = await getClusterNodes(context, args);

    if (!data.count) {
      throw new errors.NotFound({
        message: 'ClusterNode not found',
        data: {
          objectId: args.id,
          objectType: 'ClusterNode'
        }
      });
    }

    return data.records[0];
  }

  async function getClusterNodes(context, args) {
    const sqlWhere = [];
    const values = [];
    const defaultLimit = _.get(config, 'paging.defaultLimit', 30);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    args.offset = args.offset || 0;
    args.limit = args.limit || defaultLimit;

    mainUtil.addSqlWhere('n.node_id', args.id, sqlWhere, values);
    mainUtil.addSqlWhere('n.cluster_id', args.clusterId, sqlWhere, values);
    mainUtil.addSqlWhere('n.role', args.role, sqlWhere, values);
    sqlWhere.push('n.deleted_date is null');

    if (!isSuperAdmin || !args.allNodes) {
      mainUtil.addSqlWhere(
        'c.organization_id',
        args.organizationId,
        sqlWhere,
        values
      );
    }

    if (args.notAmiNode) {
      sqlWhere.push(`n.role != 'ami'`);
    }

    const sql = `
      SELECT
        ${clusterNodeSelect},
        c.organization_id
      FROM
        aiware.node n
        LEFT JOIN aiware.cluster c ON c.cluster_id = n.cluster_id
      WHERE
        ${sqlWhere.join(' AND ')}
      GROUP BY n.node_id, c.organization_id
      ORDER BY n.created_date DESC
      OFFSET ${args.offset}
      LIMIT ${args.limit}
    `;
    const res = await sourceDbRead.map(sql, values, mapper.camelizeRootKeys);

    return mainUtil.toPage(args, res);
  }

  async function getClusterNodeList(context, args) {
    let whereClause = '';
    if (args.id) {
      args.offset = 0;
      args.limit = 1;
      whereClause = `WHERE n.node_id = $1`;
    }
    const sql = `
SELECT
  ${clusterNodeSelect}
FROM
  aiware.node n
${whereClause}
OFFSET $2
LIMIT $3
    `;

    const res = await sourceDbRead.map(
      sql,
      [args.id, args.offset, args.limit],
      mapper.camelizeRootKeys
    );

    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'ClusterNodeList'
        }
      });
    }
    return {
      records: res,
      count: res.length,
      offset: args.offset,
      limit: args.limit
    };
  }

  async function createClusterNode(context, args) {
    const input = args.input;
    const _isLimit = await isLimit(context, args);
    if (_isLimit) {
      throw new errors.NotAllowed({
        message: 'Number of nodes in your orgrizantion is maximum!'
      });
    }

    const columnData = {
      node_id: uuidv4(),
      cluster_id: input.clusterId,
      display_name: input.name,
      metrics: input.metrics,
      container_tag: input.containerTag,
      offline_browsing: !!input.offlineBrowsing,
      storage_present: !!input.storagePresent,
      node_config: input.nodeConfig,
      role: input.role
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'aiware.node',
      columnData,
      nodeReturning
    );

    return dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }
  async function isLimit(context, args) {
    const organizationId = args.organizationId;
    const { maxAiwareNodes } = context._authInfo.organization;
    const maxNodeLimit = maxAiwareNodes;
    const nodes = await getClusterNodes(context, {
      organizationId,
      notAmiNode: true,
      limit: maxNodeLimit
    });
    const nodeCount = nodes.records.length;

    return maxNodeLimit && maxNodeLimit <= nodeCount;
  }
  async function updateClusterNode(context, args) {
    const input = args.input;
    const columnData = {
      display_name: input.name,
      node_config: input.nodeConfig,
      metrics: input.metrics,
      updated_date: parseInt(new Date() / 1000, 10)
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.node',
      columnData,
      nodeReturning,
      `node_id = '${input.id}'`
    );

    return dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function deleteClusterNode(context, args) {
    const unpairNodePromise = promisify(coreJobDal.node.unpairNode);
    const deleteNodePromise = promisify(coreJobDal.node.deleteNode);
    const nodeId = args.id;

    try {
      await unpairNodePromise(nodeId, null);
      const res = await deleteNodePromise(nodeId, null);
      if (res) {
        res.id = res.nodeId;
        res.name = res.displayName;
        delete res.nodeId;
        delete res.displayName;
      }
      return res;
    } catch (err) {
      logger.error(err);
      throw new errors.ServiceFailure();
    }
  }

  function pauseClusterNode(context, args) {
    const input = args.input;

    mainUtil.checkId(input.id, false, false, true);

    const columnData = {
      paused: true,
      updated_date: parseInt(new Date() / 1000, 10)
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.node',
      columnData,
      nodeReturning,
      `node_id = '${input.id}'`
    );

    return dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  function unpauseClusterNode(context, args) {
    const input = args.input;

    mainUtil.checkId(input.id, false, false, true);

    const columnData = {
      paused: false,
      updated_date: parseInt(new Date() / 1000, 10)
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.node',
      columnData,
      nodeReturning,
      `node_id = '${input.id}'`
    );

    return dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function pairClusterNode(context, args) {
    const input = args.input;
    const _authInfo = context._authInfo;
    const nodeId = input.id;
    const nodePair = new serviceContext.coreJob.jobModel.NodePair(
      input.nodePair
    );
    const validationErrs = nodePair.validate();

    if (validationErrs) {
      throw new errors.InvalidInput({
        message: 'bad request',
        data: { validationErrs }
      });
    }

    const clusterId = nodePair.clusterId;
    const requestorOrg = _.get(_authInfo, 'organization');
    const requestorOrgId = _.get(requestorOrg, 'organizationId');

    nodePair.nodeId = nodeId;

    const _isLimit = await isLimit(context, { organizationId: requestorOrgId });

    if (_isLimit) {
      throw new errors.NotAllowed({
        message: 'Number of nodes in your orgrizantion is maximum!'
      });
    }

    // this will throw error not_found if cluster not exists
    await serviceContext.dal.cluster.getCluster(context, {
      id: clusterId
    });

    const clusterNode = await getClusterNode(context, { id: nodeId });

    if (clusterNode.clusterId) {
      throw new errors.InvalidInput({
        message: 'node has already been paired'
      });
    }

    const ipExternal = _.get(clusterNode, 'metrics.ipExternal');
    const lastColonIndex = nodePair.displayName.lastIndexOf(':');

    if (lastColonIndex > 0) {
      nodePair.displayName = `${nodePair.displayName.substr(
        0,
        lastColonIndex
      )}:${ipExternal || ''}`;
    } else {
      nodePair.displayName = `${nodePair.displayName}:${ipExternal}`;
    }

    const pairNodeToClusterPromise = promisify(
      serviceContext.coreJob.cjdal.node.pairNodeToCluster
    );
    await pairNodeToClusterPromise(nodePair, null);

    return getClusterNode(context, { id: nodeId });
  }

  function computeClusterNodeStatus(clusterNode) {
    const fiveHoursInSeconds = 18000;

    if (clusterNode.deletedDateTime) {
      return nodeStatus.decomissioned;
    }
    if (clusterNode.paused) {
      return nodeStatus.paused;
    }
    if (!clusterNode.clusterId) {
      return nodeStatus.anonymous;
    }
    const currEpochTime = parseInt(new Date() / 1000, 10);

    if (Math.abs(clusterNode.lastPing - currEpochTime) > fiveHoursInSeconds) {
      return nodeStatus.offline;
    }
    return nodeStatus.running;
  }

  async function pingClusterNode(context, args) {
    const input = args.input;
    const nodeId = input.nodeId;
    const updatingNodeMetrics = !_.isEmpty(input.nodeMetrics);
    const requestorIp = _.get(context, 'requestInfo.clientIP', '').startsWith(
      '::ffff:'
    )
      ? _.get(context, 'requestInfo.clientIP').substr(7)
      : _.get(context, 'requestInfo.clientIP');
    let nodeMetrics;

    if (updatingNodeMetrics) {
      nodeMetrics = new serviceContext.coreJob.jobModel.NodeMetrics(
        input.nodeMetrics
      );
      nodeMetrics.ipExternal = requestorIp;

      const validationErrs = nodeMetrics.validate();

      if (validationErrs) {
        throw new errors.InvalidInput({
          message: 'bad request',
          data: { validationErrs }
        });
      }
    }

    const dbTran = await coreWriteTx();
    try {
      await dbTran.begin();

      const updateNodePingPromise = promisify(
        serviceContext.coreJob.cjdal.node.updateNodePing
      );
      const node = await updateNodePingPromise(nodeId, dbTran.client);

      if (!node) {
        throw new errors.NotFound();
      }

      if (!node.deletedDate && nodeMetrics) {
        const updateNodeMetricsPromise = promisify(
          serviceContext.coreJob.cjdal.node.updateNodeMetrics
        );
        await updateNodeMetricsPromise(nodeId, nodeMetrics, dbTran.client);
      }

      await dbTran.commit();
    } catch (err) {
      logger.error(err);
      await dbTran.rollback();
      throw err;
    } finally {
      dbTran.done();
    }

    return getClusterNode(context, { id: nodeId });
  }

  async function coreWriteTx() {
    const coreWriteConn = await dbConnections['core'].write.connect();
    return {
      client: coreWriteConn,
      begin: () => coreWriteConn.query('BEGIN'),
      commit: () => coreWriteConn.query('COMMIT'),
      rollback: () =>
        coreWriteConn.query('ROLLBACK').catch((err) => {
          logger.error(err);
        }),
      done: () => coreWriteConn.done()
    };
  }

  async function unpairClusterNode(context, args) {
    const nodeId = args.id;

    const unpairNodePromise = promisify(
      serviceContext.coreJob.cjdal.node.unpairNode
    );
    await unpairNodePromise(nodeId, null);

    return getClusterNode(context, { id: nodeId });
  }

  return {
    getClusterNode,
    getClusterNodes,
    getClusterNodeList,
    createClusterNode,
    deleteClusterNode,
    pauseClusterNode,
    unpauseClusterNode,
    updateClusterNode,
    pairClusterNode,
    computeClusterNodeStatus,
    pingClusterNode,
    unpairClusterNode
  };
};
