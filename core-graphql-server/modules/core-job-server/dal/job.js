'use strict';

const _ = require('lodash');
const moment = require('moment');

module.exports = function init(app, model, pools) {
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();

  function addPartitionRangeToArgs(jobId, rowName, whereAnd, args) {
    const range = dateIdUtil.getEpochRange(jobId);
    if (range.start && range.end) {
      whereAnd.push(
        `${rowName} BETWEEN $${args.length + 1} AND $${args.length + 2}`
      );
      args.push(range.start, range.end);
    }
  }

  return {
    getJobWithTasks: getJobWithTasks,
    updateJobStatusWithCb: updateJobStatusWithCb,
    incrementJobRetryCount: incrementJobRetryCount
  };

  function generateJobTablePartition(jobId) {
    if (
      dateIdUtil.isTablePartitionActive(
        app.config.jobTablePartitionActiveDate,
        jobId
      )
    ) {
      return dateIdUtil.getJobTablePartition(jobId);
    }
    return 'job_new.job';
  }

  async function updateJobStatusWithCb(jobId, status, dbClient, callback) {
    const args = [status];
    const whereAnd = [];
    let jobTable = 'job_new.job';

    // update modified_date_time data
    args.push(moment.utc().unix());

    if (jobId) {
      jobTable = generateJobTablePartition(jobId);
    }

    whereAnd.push(`job_id = $${args.push(jobId)}`);

    addPartitionRangeToArgs(jobId, 'created_date_time', whereAnd, args);

    const updateJobStatusSql = `
  UPDATE
    ${jobTable}
  SET
    job_status = $1,
    modified_date_time = $2
  WHERE
    ${whereAnd.join(' AND ')}
    `;

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(updateJobStatusSql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        callback(null, dbResult);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Get a job with tasks.
   * @param {string} jobId - Id of Job
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a job object.
   */
  async function getJobWithTasks(jobId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    let whereAnd = [];
    let args = [jobId];
    let taskTable = 'job_new.task';

    if (
      dateIdUtil.isTaskTablePartitionActive(
        app.config.taskTablePartitionActiveDate,
        jobId
      )
    ) {
      taskTable = dateIdUtil.getTaskTablePartition(jobId);
    }

    whereAnd.push('j.job_id = $1');
    whereAnd.push('j.deleted_date_time is NULL');

    addPartitionRangeToArgs(jobId, 'j.created_date_time', whereAnd, args);
    addPartitionRangeToArgs(jobId, 't.created_date_time', whereAnd, args);

    let sql = `
      SELECT
        j.job_id,
        j.application_id,
        j.recording_id,
        j.cluster_id,
        j.created_date_time,
        j.modified_date_time,
        j.retries,
        j.deleted_date_time,
        j.source_asset_id,
        j.bundle_id,
        j.organization_id,
        j.job_status,
        j.job_config,
        json_agg(t ORDER BY t.task_order) tasks
      FROM
        ${generateJobTablePartition(jobId)} j
      JOIN
        ${taskTable} t
      ON
        t.job_id = j.job_id
      WHERE
        ${whereAnd.join(' AND ')}
      GROUP BY
        j.job_id`;

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

        const job = model.Job.fromDB(dbResult[0]);
        callback(null, job);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Increments a job's retry count.
   * @param {string} jobId - Id of Job
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a job object.
   */
  async function incrementJobRetryCount(jobId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    const args = [];
    const whereAnd = [];
    let jobTable = 'job_new.job';

    if (jobId) {
      jobTable = generateJobTablePartition(jobId);
    }

    whereAnd.push(`job_id = $${args.push(jobId)}`);
    addPartitionRangeToArgs(jobId, 'created_date_time', whereAnd, args);

    const currEpochTime = parseInt(new Date() / 1000, 10);

    const sql = `
      UPDATE
        ${jobTable}
      SET
        retries = retries + 1,
        modified_date_time = $${args.push(currEpochTime)}
      WHERE
        ${whereAnd.join(' AND ')}
      RETURNING
        job_id, application_id, recording_id, cluster_id,
        created_date_time, modified_date_time, retries`;

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

        const job = model.Job.fromDB(dbResult[0]);
        callback(null, job);
      })
      .catch((err) => callback(err, null));
  }
};
