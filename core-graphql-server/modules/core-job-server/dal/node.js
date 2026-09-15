'use strict';

const _ = require('lodash');

module.exports = function init(app, model, pools) {
  const nodeReturning = `
    node_id, cluster_id, display_name, role,
    metrics, last_ping, container_tag, paused, offline_browsing, storage_present,
    directory_oid, directory_patch_oid, directory_cache_date, directory_patch_cache_date,
    registered_date, deleted_date, created_date, updated_date`;

  return {
    getNodes: getNodes,
    deleteNode: deleteNode,
    unpairNode: unpairNode,
    updatePauseStatusForNodes: updatePauseStatusForNodes,
    pairNodeToCluster: pairNodeToCluster,
    updateNodePing: updateNodePing,
    updateNodeMetrics: updateNodeMetrics
  };

  /*
   * Gets nodes with options.
   * @param {options} options - object containing values
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Results will be a list
   * of node objects.
   */
  async function getNodes(options, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const offset = options.offset || 0;
    let sqlWhere = [];
    let args = [];
    let sql = `
      SELECT
        n.node_id,
        c.organization_id,
        n.cluster_id,
        n.display_name,
        n.role,
        n.metrics,
        n.last_ping,
        n.container_tag,
        n.paused,
        n.offline_browsing,
        n.storage_present,
        n.registered_date,
        n.deleted_date,
        n.created_date,
        n.updated_date,
        COUNT(*) OVER () AS total
      FROM
        aiware.node n `;

    if (options.allNodes) {
      sql +=
        ' LEFT OUTER JOIN aiware.cluster c ON c.cluster_id = n.cluster_id ';
    } else {
      sql += ' JOIN aiware.cluster c ON c.cluster_id = n.cluster_id ';
    }

    if (options.nodeId) {
      if (!_.isArray(options.nodeId)) {
        options.nodeId = [options.nodeId];
      }
      let insertItems = [];
      options.nodeId.forEach(function addArg(nodeId) {
        args.push(nodeId);
        insertItems.push(`$${args.length}`);
      });
      sqlWhere.push(`n.node_id IN (${insertItems.join(',')})`);
    }
    if (options.clusterId) {
      if (!_.isArray(options.clusterId)) {
        options.clusterId = [options.clusterId];
      }
      let insertItems = [];
      options.clusterId.forEach(function addArg(clusterId) {
        args.push(clusterId);
        insertItems.push(`$${args.length}`);
      });
      sqlWhere.push(`n.cluster_id IN (${insertItems.join(',')})`);
    }
    if (options.notAmiNode) {
      sqlWhere.push(`n.role != 'ami'`);
    }
    if (_.isString(options.role)) {
      args.push(options.role);
      sqlWhere.push(`n.role = $${args.length}`);
    }
    if (options.organizationId) {
      args.push(options.organizationId);
      sqlWhere.push(`c.organization_id = $${args.length}`);
    }
    if (!options.includeDeleted) {
      sqlWhere.push('n.deleted_date is null');
    }
    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += ' GROUP BY n.node_id, c.organization_id ';
    sql += ' ORDER BY n.deleted_date DESC, n.created_date DESC ';

    if (Number.isInteger(options.limit)) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += ` OFFSET ${options.offset}`;
    }

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        const count = parseInt(_.get(dbResult, '[0].total', 0));
        const nodes = dbResult.map(model.Node.fromDB);
        const payload = {
          totalResults: count,
          from: offset,
          to: offset + dbResult.length,
          results: nodes
        };

        callback(null, payload);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Soft deletes a node.
   * @param {string} nodeId - Id of Node to delete
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function deleteNode(nodeId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.node
      SET
        deleted_date = $1
      WHERE
        node_id = $2 AND deleted_date is null
      RETURNING
        ${nodeReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    await dbClient
      .query(sql, [currEpochTime, nodeId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const node = model.Node.fromDB(dbResult[0]);
        callback(null, node);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Unpairs a node.
   * @param {string} nodeId - Id of Node
   * @param {string} clusterId - Id of Cluster
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function unpairNode(nodeId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.node
      SET
        cluster_id = null,
        updated_date = $1
      WHERE
        node_id = $2 AND cluster_id is not null AND deleted_date is null
      RETURNING
        ${nodeReturning}`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [currEpochTime, nodeId];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const node = model.Node.fromDB(dbResult[0]);
        callback(null, node);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Pause or unpause a node.
   * @param {string[]} nodeIds - Id of Node
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function updatePauseStatusForNodes(
    nodeIds,
    pauseStatus,
    dbClient,
    callback
  ) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const currEpochTime = parseInt(new Date() / 1000, 10);
    let args = [pauseStatus, currEpochTime];
    let insertItems = [];

    nodeIds.forEach(function addArgs(nodeId) {
      args.push(nodeId);
      insertItems.push(`$${args.length}`);
    });

    const sql = `
      UPDATE
        aiware.node
      SET
        paused = $1,
        updated_date = $2
      WHERE
        node_id IN (${insertItems.join(',')}) AND deleted_date is null
      RETURNING
        ${nodeReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const nodes = dbResult.map(model.Node.fromDB);
        callback(null, nodes);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Pairs a node to a cluster.
   * @param {string} nodeId - Id of Node
   * @param {string} clusterId - Id of Cluster
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function pairNodeToCluster(node, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.node
      SET
        cluster_id = $1,
        display_name = $2,
        role = $3,
        offline_browsing = $4,
        registered_date = $5,
        updated_date = $6
      WHERE
        node_id = $7 AND deleted_date is null
      RETURNING
        ${nodeReturning}`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [
      node.clusterId,
      node.displayName || '',
      node.role,
      node.offlineBrowsing,
      currEpochTime,
      currEpochTime,
      node.nodeId
    ];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const dbNode = model.Node.fromDB(dbResult[0]);
        callback(null, dbNode);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Updates last ping of a node.
   * @param {string} nodeId - Id of Node
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function updateNodePing(nodeId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.node
      SET
        last_ping = $1,
        updated_date = $2
      WHERE
        node_id = $3
      RETURNING
        ${nodeReturning}`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [currEpochTime, currEpochTime, nodeId];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const node = model.Node.fromDB(dbResult[0]);
        callback(null, node);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Updates metrics for a node.
   * @param {object} node - Node to update
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a node object.
   */
  async function updateNodeMetrics(nodeId, metrics, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.node
      SET
        metrics = $1,
        updated_date = $2
      WHERE
        node_id = $3
      RETURNING
        ${nodeReturning}`;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [metrics, currEpochTime, nodeId];

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const node = model.Node.fromDB(dbResult[0]);
        callback(null, node);
      })
      .catch((err) => callback(err, null));
  }
};
