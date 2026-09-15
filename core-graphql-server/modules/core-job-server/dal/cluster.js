'use strict';

const _ = require('lodash');

module.exports = function init(app, model, pools) {
  const clusterReturning = `
    cluster_id, organization_id, display_name, allowed_engines,
    cluster_type, secret_key, access_key, default_cluster,
    container_tag, queue_credentials,
    docker_hub_credentials, paused, memory_size, storage_size, deleted_date,
    created_date, updated_date, is_public, bypass_allowed_engines`;

  return {
    deleteCluster: deleteCluster,
    pauseCluster: pauseCluster,
    unpauseCluster: unpauseCluster
  };

  /*
   * Soft deletes a cluster.
   * @param {object} clusterId - Id of Cluster to delete
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a cluster object.
   */
  async function deleteCluster(clusterId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.cluster
      SET
        deleted_date = $1
      WHERE
        cluster_id = $2 AND deleted_date is null
      RETURNING
        ${clusterReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    await dbClient
      .query(sql, [currEpochTime, clusterId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const cluster = model.Cluster.fromDB(dbResult[0]);
        callback(null, cluster);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Pauses a cluster.
   * @param {object} clusterId - Id of Cluster to pause
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a cluster object.
   */
  async function pauseCluster(clusterId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.cluster
      SET
        paused = true,
        updated_date = $1
      WHERE
        cluster_id = $2 AND deleted_date is null
      RETURNING
        ${clusterReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    await dbClient
      .query(sql, [currEpochTime, clusterId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const cluster = model.Cluster.fromDB(dbResult[0]);
        callback(null, cluster);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Unpauses a cluster.
   * @param {object} clusterId - Id of Cluster to unpause
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a cluster object.
   */
  function unpauseCluster(clusterId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const sql = `
      UPDATE
        aiware.cluster
      SET
        paused = false,
        updated_date = $1
      WHERE
        cluster_id = $2 AND deleted_date is null
      RETURNING
        ${clusterReturning}`;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    const currEpochTime = parseInt(new Date() / 1000, 10);
    dbClient
      .query(sql, [currEpochTime, clusterId])
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult.length) {
          return callback(null, null);
        }

        const cluster = model.Cluster.fromDB(dbResult[0]);
        callback(null, cluster);
      })
      .catch((err) => callback(err, null));
  }
};
