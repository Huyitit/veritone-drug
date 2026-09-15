'use strict';

const _ = require('lodash');

module.exports = function init(app, model, pools) {
  const jobTable = 'job_new';
  const taskSelect = `
    t.task_id, t.job_id, t.engine_id, t.build_id,
    t.application_id, t.task_executor, t.task_status, t.task_payload,
    t.task_log, t.engine_price, t.customer_price, t.rate_card_price,
    t.task_output, t.payload, t.test_task,
    t.failure_type, t.recording_id, t.is_clone,
    t.created_date_time, t.cancelled_date_time, t.started_date_time,
    t.queued_date_time, t.modified_date_time, t.completed_date_time,
    t.asset_selector, t.standby_for_task_id, t.parent_task_id`;
  const taskReturning = `
    task_id, job_id, engine_id, application_id, build_id,
    task_executor, task_executor_id, task_status, task_payload,
    task_order, recording_id, is_clone, task_output,
    source_asset_id, engine_price, customer_price, rate_card_price,
    media_length_secs, failure_type, payload, test_task,
    created_date_time, cancelled_date_time, started_date_time,
    queued_date_time, modified_date_time, completed_date_time,
    asset_selector, standby_for_task_id, parent_task_id`;
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();

  return {
    getEngineUsageForOrganization: getEngineUsageForOrganization,
    cleanTask: cleanTask,
    cancelTask: cancelTask
  };

  function cleanTask(task) {
    if (!task.testTask) {
      _.unset(task.payload, 'token');
    }
    return task;
  }

  /**
   * Get aggregated usage totals for the month,
   * grouped by engine (aka task type). Usage is calculated
   * for the month, given the start date year/month.
   * @params {object} options - options for arguments
   * @params {callback} callback - will be called with {error, result} format
   */
  async function getEngineUsageForOrganization(options, dbClient, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Missing callback!');
    }

    const WORKFLOW_ENGINE_CATEGORY_ID = 'c5458876-43d2-41e8-a340-f734702df04a';
    const WORKFLOW_ENGINE_PRICE = 100; // 100 cents per hour
    const sqlWhere = [];
    const args = [];
    let sql = `
      SELECT
        e.engine_id,
        e.price,
        e.engine_category_id,
        SUM(t.media_length_secs) as total_media_seccs,
        CEIL(SUM((r."json"->>'stopDateTime')::DECIMAL - (r."json"->>'startDateTime')::DECIMAL))::INT AS total_duration,      
        CEIL(SUM((r."json"->>'stopDateTime')::DECIMAL - (r."json"->>'startDateTime')::DECIMAL)) / 60 / 60 * COALESCE(e.price, 0) AS total_cost
      FROM
        ${jobTable}.task t
      LEFT JOIN
        recording.recording r
      ON
        r.recording_id = t.recording_id
      JOIN
        job_new.engine e
      ON
        t.engine_id = e.engine_id`;

    if (options.applicationId) {
      args.push(options.applicationId);
      sqlWhere.push(`t.application_id = $${args.length}`);
    }
    if (options.startEpoch) {
      args.push(options.startEpoch);
      sqlWhere.push(`t.created_date_time >= $${args.length}`);
    }
    if (options.endEpoch) {
      args.push(options.endEpoch);
      sqlWhere.push(`t.created_date_time < $${args.length}`);
    }

    sqlWhere.push(`t.task_status = 'complete'`);
    sqlWhere.push(`t.is_clone = false`);

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += ' GROUP BY e.engine_id, e.price ';

    if (!_.isObject(dbClient)) dbClient = pools.core;

    await dbClient
      .query(sql, args)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          return callback(new Error('missing dbResult array'), null);
        }

        if (!dbResult) {
          return callback(null, null);
        }

        let totalDuration = 0,
          totalCost = 0.0,
          usageItems = [];
        dbResult.forEach(function calculateTotals(row) {
          // workflow engine usage is its total_media_secs
          if (row.engine_category_id === WORKFLOW_ENGINE_CATEGORY_ID) {
            const duration = row['total_media_seccs'];
            row['total_duration'] = duration;
            row['total_cost'] =
              Math.ceil(duration / 3600) * WORKFLOW_ENGINE_PRICE;
          }
          let usage = {
            engineId: row['engine_id'],
            cost: round((row['total_cost'] || 0) / 100, 2), // cents to dollars
            duration: row['total_duration']
          };
          totalDuration += usage.duration;
          totalCost += usage.cost;
          usageItems.push(usage);
        });

        const usageSummary = {
          totalDuration: totalDuration,
          totalCost: totalCost,
          usage: usageItems
        };

        callback(null, usageSummary);
      })
      .catch((err) => callback(err, null));
  }

  /*
   * Updates a task to cancelled.
   * @param {string} taskId - ID of Task
   * @param {pg.Client} dbClient - connection to use as part of a transaction
   * @param {callback} callback - will be called with {error, result} format.
   * when error is non-null, an error was encountered executing the request.
   * result will be null when an error is returned. Result will be a list
   * of role objects.
   */
  async function cancelTask(taskId, dbClient, callback) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }

    let whereAnd = [];
    const currEpochTime = parseInt(new Date() / 1000, 10);
    const args = [currEpochTime, taskId];

    whereAnd.push('task_id = $2');

    const range = dateIdUtil.getEpochRange(taskId);
    if (range.start && range.end) {
      whereAnd.push(
        `created_date_time BETWEEN $${args.length + 1} AND $${args.length + 2}`
      );
      args.push(range.start, range.end);
    }

    const sql = `
    UPDATE
      ${jobTable}.task
    SET
      task_status = 'cancelled',
      cancelled_date_time = $1
    WHERE
      ${whereAnd.join(' AND ')}
    RETURNING
      ${taskReturning}`;

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

        const task = model.Task.fromDB(dbResult[0]);
        callback(null, cleanTask(task));
      })
      .catch((err) => callback(err, null));
  }

  function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  }
};
