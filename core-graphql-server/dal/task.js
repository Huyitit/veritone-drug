const { promisify } = require('util');
const _ = require('lodash');
const humps = require('humps');
const moment = require('moment');
const validator = require('validator');
const { events } = require('@veritone/core-messages/generated/pbjs/compiled');

// task_output keys that must not outlive the attempt that produced them.
const FAILURE_OUTPUT_KEYS = [
  'failureReason',
  'failureMessage',
  'isUnknownFailureType'
];

// Stripping in SQL rather than read-modify-write keeps concurrent writes to task_output intact
// (appendWarningToTask below is a jsonb_set for the same reason) and confines the strip to rows the
// guarded UPDATE actually matches. Derived from the list above so the two cannot drift.
const STRIP_FAILURE_OUTPUT_SQL = `task_output = task_output ${FAILURE_OUTPUT_KEYS.map(
  (key) => `- '${key}'`
).join(' ')}`;

const TASK_INSERT_COLUMNS = Object.freeze([
  ['task_id', (task) => task.taskId],
  ['engine_id', (task) => task.engineId],
  ['build_id', (task) => task.buildId],
  ['job_id', (task) => task.jobId],
  ['application_id', (task) => task.applicationId],
  ['recording_id', (task) => task.recordingId],
  ['task_order', (task) => task.taskOrder],
  ['task_status', (task) => task.taskStatus],
  ['task_payload', (task) => task.taskPayload],
  ['is_clone', (task) => task.isClone],
  ['payload', (task) => task.payload],
  ['test_task', (task) => task.testTask],
  ['asset_selector', (task) => task.assetSelector],
  ['standby_for_task_id', (task) => task.standbyForTaskId],
  ['parent_task_id', (task) => task.parentTaskId],
  ['created_date_time', (task) => task.createdDateTime],
  [
    'notification_uris',
    (task) => (_.isEmpty(task.notificationUris) ? {} : task.notificationUris)
  ],
  [
    'source_asset_id',
    (task) => (_.isNil(task.sourceAssetId) ? null : task.sourceAssetId)
  ]
]);

module.exports = function createFunction(serviceContext) {
  const {
    eventsMap,
    supportedEvents
  } = require('@veritone/core-server-base/events-map.js');
  const config = serviceContext.config;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const mapper = require('./mapper.js');
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const util = require('./util')(config, serviceContext);
  const jobBll = serviceContext.coreJob.jobBll.job;
  const dalAsset = serviceContext.dal.asset;
  const dalTdo = serviceContext.dal.tdo;
  const storage = serviceContext.storage;
  const columnNameUpdateWhitelist = {
    queued_date_time: true,
    modified_date_time: true,
    completed_date_time: true,
    cancelled_date_time: true,
    started_date_time: true,
    payload: true,
    task_status: true,
    task_output: true,
    task_executor: true,
    task_executor_data: true,
    task_executor_id: true,
    task_payload: true,
    notification_uris: true
  };

  const localCache = serviceContext.localCache;
  if (!localCache) throw new Error('no local cache!');

  function getTDOIdOfTask(task) {
    return (
      _.get(task, 'recordingId') ||
      _.get(task, 'targetId') ||
      _.get(task, 'taskOutput.recordingId') ||
      _.get(task, 'taskOutput.tdoId')
    );
  }

  async function updateTask(context, args) {
    applyFailureOutput(args.input);

    // fetch the task if it hasn't been fetched so we can get the engine run time
    if (!args.__task) {
      args.__task = await getTask(context, {
        id: args.input.id,
        applicationId: args.input.applicationId
      });
    }
    const beforeTask = args.__task;

    // check client timestamp, if provided
    // a bug that task is not define
    if (isClientTimestampStale(beforeTask, args.input)) return beforeTask;

    const afterTask = await newUpdateTask(context, args);

    if (
      beforeTask.recordingId &&
      taskUpdatedToComplete(beforeTask, afterTask)
    ) {
      await emitRecordingCogitionCompletedEvent(
        context,
        beforeTask.recordingId,
        beforeTask.organizationId
      );
      const updatedAssets = await updateAssetSizeOnTaskComplete(
        context,
        afterTask
      );
      for (const a of updatedAssets) {
        emitAssetMetadataUpdatedEvent(
          a,
          beforeTask.organizationId,
          beforeTask.applicationId
        );
      }
      // calculate and update the cost of org when task complete
      await serviceContext.bll.task.updateOrgBillingForTask(context, {
        organizationId: beforeTask.organizationId || args.organizationId,
        task: afterTask,
        taskId: afterTask.id || afterTask.taskId
      });
    }

    return afterTask;
  }

  // The failure fields arrive in several shapes — top-level failureReason/failureMessage, or
  // nested in whichever of output/taskOutput/outputString the caller used — and have to end up as
  // one coherent set on task_output (or be cleared). Mutates `input` in place; the write path
  // downstream re-reads the same object.
  function applyFailureOutput(input) {
    if (input.status === 'failed' || input.status === 'aborted') {
      const output = getTaskOutputInputField(input) || {};
      const failureReason = output.failureReason
        ? output.failureReason
        : input.failureReason;
      const failureMessage = output.failureMessage
        ? output.failureMessage
        : input.failureMessage;
      const taskOutput = util.defineTaskOutputFailure(
        failureReason,
        failureMessage
      );
      // null means nothing was reported — e.g. an edge cascade abort, where the task didn't fail on
      // its own. Leave the fields off rather than stamping a reason nobody gave.
      if (taskOutput) {
        if (taskOutput.isUnknownFailureType) {
          // Coercion to task_validation is forced (TaskFailureReason is a GraphQL enum, so an
          // unrecognised string would break every later read), but stored silently it looks like a
          // genuine validation failure — this log is the only signal of sender enum drift.
          //
          // The reason is truncated and passed as meta, never interpolated: it is caller-controlled
          // and unbounded, so a 50MB body would become a 50MB log line and a `%j` would consume
          // winston's meta argument. failureMessage is omitted — engines put stack traces there.
          serviceContext.logger.warn(
            `(updateTask) unrecognised failureReason on task ${input.id}; ` +
              `storing task_validation instead. TaskFailureReason and the sender's ` +
              `failure reason enum have drifted.`,
            { failureReason: _.truncate(failureReason, { length: 200 }) }
          );
        }
        output.failureReason = taskOutput.failureReason;
        output.failureMessage = taskOutput.failureMessage;
        output.isUnknownFailureType = taskOutput.isUnknownFailureType;
        input.output = output;
      } else {
        // The caller's failure keys hold nothing usable here ("" from a Go sender, or edge's
        // `none`); persisting failureReason: "" would fail enum serialization on every later read.
        const passthrough = _.omit(output, FAILURE_OUTPUT_KEYS);
        if (_.isEmpty(passthrough)) {
          // Every alias, or the caller's original object still reaches the update through one of
          // them. Assigning {} instead would blank an existing task_output.
          input.output = undefined;
          input.taskOutput = undefined;
          input.outputString = undefined;
        } else {
          input.output = passthrough;
        }
      }
    } else {
      // if failure message or reason were set but status is
      // not failed, throw error
      if (input.failureReason || input.failureMessage) {
        throw new errors.InvalidInput({
          message:
            'failureReason and failureMessage can only be set ' +
            'if task status is failed or aborted.',
          data: {
            taskStatus: input.status,
            inputFailureReason: input.failureReason,
            inputFailureMessage: input.failureMessage
          }
        });
      }

      // A task leaving a failure state must stop reporting the previous attempt's failure. Only a
      // status change counts: a plain update on a still-failed task reaches here too, and its
      // failure fields are current. Whether the caller also supplied its own output is settled at
      // the write — deciding it here would parse outputString early and reorder this path's errors.
      input.stripFailureOutput = !!input.status;
    }
  }

  async function updateAssetSizeOnTaskComplete(context, task) {
    let tdoId, processedBytes;
    const updatedAssets = [];
    try {
      const engineId = task.engineId;
      // SI2 Playback segment creator V3F
      if (engineId !== '352556c7-de07-4d55-b33f-74b1cf237f25') {
        return updatedAssets;
      }

      tdoId = getTDOIdOfTask(task);
      processedBytes = _.get(task, 'taskOutput.processedStats.processedBytes');
      if (tdoId && processedBytes && _.isNumber(processedBytes)) {
        const updates = [];
        for (const streamType of ['media', 'media-mdp', 'mpeg-dash-manifest']) {
          const mediaAsset = await getAssetOfType(context, tdoId, streamType);
          if (mediaAsset) {
            const tdoDetails = await dalTdo.getTDODetails(tdoId);
            serviceContext.logger.debug(
              'ASSET-TDO> tdoDetails for asset-id %s: %s',
              mediaAsset.id,
              tdoDetails
            );
            const storedSize = parseInt(tdoDetails.uploadedBytes, 10);
            updates.push(
              dalAsset.updateAssetSize(mediaAsset.id, processedBytes)
            );
            if (streamType === 'media-mdp') {
              updates.push(dalTdo.syncMediaMdpAsset(context, tdoId));
            }
            mediaAsset.assetSize = processedBytes;
            mediaAsset.storedSize = storedSize;
            updatedAssets.push(mediaAsset);
          }
        }
        if (updates.length) {
          await Promise.all(updates);
        }
      }
    } catch (err) {
      const errMessage = `updateAssetSizeOnTaskComplete failed: taskId=${task.id}, tdoId=${tdoId}, processedBytes=${processedBytes}`;
      await emitAssetMetadataUpdatedPublicEvent(context, null, err);
      serviceContext.logger.error(
        // prettier-ignore
        errMessage,
        err
      );
    }
    for (const a of updatedAssets) {
      await emitAssetMetadataUpdatedPublicEvent(context, a, null);
    }
    return updatedAssets;
  }

  async function getAssetOfType(context, tdoId, assetType) {
    const assets = await dalAsset.getAssets(context, {
      containerId: tdoId,
      assetType: assetType,
      includeVirtualMediaAsset: false,
      limit: 1,
      orderBy: 'id', // ensure consistent ordering in case duplicates were
      // created by a race condition
      orderDir: 'desc'
    });
    return assets.records.length ? assets.records[0] : null;
  }

  function taskUpdatedToComplete(beforeTask, afterTask) {
    return (
      beforeTask.status !== afterTask.status && afterTask.status === 'complete'
    );
  }

  function isClientTimestampStale(task, input) {
    const clientTimestamp = input.clientTimestamp;
    let res = false;
    if (clientTimestamp) {
      // convert db seconds timestamp to moment
      const dbTime = moment(task.modifiedDateTime * 1000);
      // if database update time is more recent than the
      // incoming timestamp, then do nothing.
      res = dbTime.isAfter(moment(clientTimestamp));
      // otherwise we'll continue with the update
    }
    return res;
  }

  async function newUpdateTask(context, args) {
    // input can include:
    //    status (required but can be same as old status)
    //    output / outputString
    //    payload
    //    executionLocationData
    // all but status are plain db updates.
    const input = args.input;
    const task = args.__task;
    const newStatus = input.status;

    // normalize task output field since there are multiple ways to pass the data
    input.output = getTaskOutputInputField(input);

    // preserve any warnings when updating a task
    if (_.get(task, 'taskOutput.warnings') && _.isNil(_.get(input, 'output'))) {
      input.output = { warnings: _.get(task, 'taskOutput.warnings') };
    } else if (
      _.get(task, 'taskOutput.warnings') &&
      !_.isNil(_.get(input, 'output'))
    ) {
      input.output.warnings = _.get(task, 'taskOutput.warnings');
    }

    let res;
    if (newStatus && newStatus !== task.status) {
      // if we're updating task status, we need to to follow the logic
      // in the core-job-server updateTask route.
      res = await handleTaskStatusUpdate(context, input, task);
    } else {
      // otherwise do a plain database update
      res = await handlePlainTaskUpdate(context, input, task);
    }

    return res || task;
  }

  function getJobTable(jobId) {
    let jobTable = 'job_new.job';
    if (
      dateIdUtil.isTablePartitionActive(
        serviceContext.config.taskTablePartitionActiveDate,
        jobId
      )
    ) {
      jobTable = dateIdUtil.getJobTablePartition(jobId);
    }
    return jobTable;
  }

  function getTaskTable(taskId) {
    let taskTable = 'job_new.task';
    if (
      dateIdUtil.isTaskTablePartitionActive(
        serviceContext.config.taskTablePartitionActiveDate,
        taskId
      )
    ) {
      taskTable = dateIdUtil.getTaskTablePartition(taskId);
    }
    return taskTable;
  }

  async function addTasksToJobs(context, args) {
    const tasks = args.input.tasks;
    const jobIds = _.uniq(_.map(tasks, (task) => task.jobId));

    let createdTasks = [];
    const createTaskErrors = [];
    const partitionMap = {};
    const jobMap = {};

    await Promise.each(jobIds, async (jobId) => {
      const job = await serviceContext.dal.job.getJob(context, {
        id: jobId
      });
      if (!job) {
        throw new Error('could not find job', jobId);
      }
      jobMap[job.id] = job;
    });

    // for each task, extract task partition to write to
    // and optimize if possible by batching inserts per partition
    tasks.forEach((task) => {
      if (task.id.length == 0) {
        throw new Error('invalid task id');
      }
      const partitionName = getTaskTable(task.id);
      if (!partitionMap[partitionName]) {
        partitionMap[partitionName] = [];
      }
      partitionMap[partitionName].push(task);
    });

    // insert tasks to each partition table
    const partitionNames = Object.keys(partitionMap);
    await Promise.each(partitionNames, async (partitionName) => {
      const tasks = partitionMap[partitionName];
      if (!_.isArray(tasks) || !tasks.length) {
        return;
      }
      const taskParams = [];
      const values = [];
      tasks.forEach(function addTaskToSql(task) {
        const job = jobMap[task.jobId];
        let params = [];
        for (let i = 1; i <= 14; i++) {
          params.push(`$${values.length + i}`);
        }
        taskParams.push(`(${params.join(',')})`);

        mainUtil.checkForForbiddenContent('job.task.payload', task.payload);
        mainUtil.checkForForbiddenContent('job.task.payload', task.taskPayload);

        values.push(
          task.id,
          task.engineId,
          task.buildId,
          job.id,
          job.applicationId,
          job.targetId,
          0, // task order
          task.status,
          task.taskPayload || {}, // user defined task_payload
          false, // is_clone
          task.payload,
          false, // test_task
          task.parentTaskId,
          moment(task.createdDateTime).unix()
        );
      });

      const sql = `
        INSERT INTO ${partitionName}
          (task_id, engine_id, build_id, job_id,
          application_id, recording_id, task_order, task_status,
          task_payload, is_clone, payload, test_task,
          parent_task_id, created_date_time)
        VALUES
          ${taskParams.join(',')}
        RETURNING *`;

      try {
        const res = await serviceContext.dbConnections['core'].write.map(
          sql,
          values,
          mapper.mapTask
        );
        createdTasks = createdTasks.concat(res);
      } catch (err) {
        tasks.forEach(function addTaskToSql(task) {
          createTaskErrors.push({
            id: task.id,
            message: err.message
          });
        });
      }
    });

    return {
      createdTasks: createdTasks,
      errors: createTaskErrors
    };
  }

  async function handlePlainTaskUpdate(context, input, task) {
    const taskTable = await getTaskTable(task.id);
    const set = [];
    const vars = [task.id];
    const output = getTaskOutputInputField(input);

    if (output) {
      vars.push(output);
      set.push(`task_output = \$${vars.length}`);
    } else if (input.stripFailureOutput) {
      // else-branch: a supplied output replaces the column and has already dropped the stale keys.
      set.push(STRIP_FAILURE_OUTPUT_SQL);
    }
    if (input.executionLocationData) {
      vars.push(input.executionLocationData);
      set.push(`task_executor_data = \$${vars.length}`);
    }
    if (input.payload) {
      mainUtil.checkForForbiddenContent('job.task.payload', input.payload);
      vars.push(input.payload);
      set.push(`task_payload = \$${vars.length}`);
    }
    if (input.notificationUris) {
      vars.push(
        _.isEmpty(input.notificationUris) ? {} : input.notificationUris
      );
      set.push(`notification_uris = \$${vars.length}`);
    }

    if (!set.length) return;

    // note that we already got the right partition/table name for this
    // task above, no need to filter by date range.
    const sql = `
UPDATE
  ${taskTable}
SET
  ${set.join(', ')}
WHERE
  task_id = $1
RETURNING
  ${taskSelect}
    `;
    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      vars,
      mapper.mapTask
    );
    if (!res.length) {
      throw new errors.NotFound({
        message:
          'The task could not be updated, possibly due to a race condition.',
        data: {
          objectType: 'Task',
          objectId: task.id
        }
      });
    }
    return res[0];
  }

  async function appendWarningToTask(context, input) {
    const { taskId, reason, message, referenceId } = input;

    const taskTable = await getTaskTable(taskId);

    const vars = [taskId];

    const warning = {
      reason,
      message,
      referenceId
    };

    const sql = `
      UPDATE
        ${taskTable}
      SET
        task_output = (
          CASE
            WHEN task_output IS NULL THEN '{"warnings": [${JSON.stringify(
              warning
            )}]}'::jsonb
            ELSE jsonb_set(task_output, '{warnings}', COALESCE(task_output->'warnings', '[]'::jsonb) || '[${JSON.stringify(
              warning
            )}]', true)
          END
        )
      WHERE
        task_id = $1
      RETURNING
        ${taskSelect}
    `;

    const res = await serviceContext.dbConnections['core'].write.map(
      sql,
      vars,
      mapper.mapTask
    );
    if (!res.length) {
      throw new errors.NotFound({
        message:
          'The task could not be updated, possibly due to a race condition.',
        data: {
          objectType: 'Task',
          objectId: taskId
        }
      });
    }
    return res[0].id;
  }

  async function handleTaskStatusUpdate(context, input, task) {
    const now = Date.now();
    // get the job so we know whether we need to update it
    // use previously fetched job if possible
    const job =
      task.__job ||
      (await serviceContext.dal.job.getJob(context, {
        id: task.jobId,
        applicationId: task.applicationId
      }));

    // at this point we've already loaded the task and validated the
    // caller's access to it.

    // create new task object to hold updates
    const setOutput = getTaskOutputInputField(input);
    const updateTask = {
      jobId: task.jobId,
      taskId: task.taskId,
      taskStatus: input.status,
      modifiedDateTime: Math.floor(now / 1000)
    };
    if (!_.isNil(input.executionLocationData)) {
      updateTask.executionLocationData = input.executionLocationData;
    }
    if (!_.isNil(setOutput)) {
      updateTask.taskOutput = setOutput;
    }
    if (!_.isNil(input.notificationUris)) {
      updateTask.notificationUris = input.notificationUris;
    }

    // first determine if task is completed
    // Only update completedDateTime if task was pending/queued/running/waiting then became complete/failed
    if (
      task.status === 'pending' ||
      task.status === 'queued' ||
      task.status === 'running' ||
      task.status === 'failed' ||
      task.status === 'waiting'
    ) {
      if (
        updateTask.taskStatus === 'complete' ||
        updateTask.taskStatus === 'failed' ||
        updateTask.taskStatus === 'aborted'
      ) {
        updateTask.completedDateTime = updateTask.modifiedDateTime;
      }
    }

    let acceptableCurrentStatus = [
      'pending',
      'queued',
      'running',
      'complete',
      'failed',
      'waiting',
      'paused',
      'resuming'
    ];

    if (updateTask.taskStatus === 'queued') {
      updateTask.queuedDateTime = Math.floor(now / 1000);
    }

    // If we're attempting to set the status of the task to running we must either be queued or running or waiting.
    // This resolves a situation where a task fires a running update and then fires a complete update
    // before the running update committed.
    if (updateTask.taskStatus === 'running') {
      acceptableCurrentStatus = [
        'pending',
        'queued',
        'running',
        'failed',
        'waiting',
        'aborted',
        'resuming'
      ];
    }

    // only set startedDateTime when a task transitions from a pending state to running and is completed quickly.
    if (
      _.isNil(task.startedDateTime) &&
      (updateTask.taskStatus === 'running' ||
        updateTask.taskStatus === 'complete')
    ) {
      updateTask.startedDateTime = Math.floor(now / 1000);
    }

    // VTN-9239 Create new job and task statuses "paused" and "resuming"
    // If we're attempting to set the status of the task to "paused" we must either be "running".
    if (updateTask.taskStatus === 'paused') {
      acceptableCurrentStatus = ['running'];
    }
    // We only set the status of the task to "resuming" when it's in "paused" status
    if (updateTask.taskStatus === 'resuming') {
      acceptableCurrentStatus = ['paused'];
    }

    // recreate a list of statuses that allow changing to failed
    // VE-1541: Allow changing task status from aborted to failed
    if (updateTask.taskStatus === 'failed') {
      acceptableCurrentStatus = [
        'pending',
        'queued',
        'running',
        'complete',
        'failed',
        'waiting',
        'paused',
        'resuming',
        'aborted'
      ];
    }

    // update the task row(s)
    const updatedTask = await updateTaskAtomicallyByStatus(
      task.id,
      acceptableCurrentStatus,
      updateTask,
      context,
      // a supplied output already replaces the column, so stripping too is a self-assignment
      { stripFailureOutput: input.stripFailureOutput && !setOutput }
    );

    if (!updatedTask) {
      // core-job returns 409 in this case. we'll just return fresh copy
      // of task.
      serviceContext.logger.warn(
        'WARNING task not updated ' +
          task.id +
          ' ' +
          updateTask.taskStatus +
          ' ' +
          task.status
      );
      // if we have to set output, go ahead and do that in a separate
      // DB-only call.
      if (setOutput || input.executionLocationData) {
        const tUpdate = {};
        if (setOutput) tUpdate.task_output = setOutput;
        if (input.executionLocationData)
          tUpdate.task_executor_data = input.executionLocationData;

        const tres = await doJobAndTaskUpdates(null, task.id, {}, tUpdate);
        // update the object we already have in mem to return
        if (setOutput) task.output = setOutput;
        if (input.executionLocationData)
          task.executionLocationData = input.executionLocationData;
      }
      return mapper.mapTask(task);
    }

    // get current tasks so we have status
    const tasksRes = await getTasks(context, {
      jobId: task.jobId,
      applicationId: task.applicationId
    });
    const tasks = tasksRes.records;
    tasks.forEach((task) => {
      task.taskStatus = task.status;
    });

    // emit the event
    const organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
      updatedTask.applicationId
    );
    let tdoId = getTDOIdOfTask(updatedTask);
    if (tdoId) tdoId = _.toString(tdoId);
    try {
      await emitTaskUpdatedEvent(
        task.id,
        task.status,
        updatedTask.taskStatus,
        {
          engineId: updatedTask.engineId,
          buildId: updatedTask.buildId,
          jobId: updatedTask.jobId,
          recordingId: tdoId,
          organizationId,
          applicationId: updatedTask.applicationId
        },
        context
      );
    } catch (err) {
      // event will be stored and retried by ts-messaging
      serviceContext.logger.error(err);
    }

    const jobUpdates = {};
    const taskUpdates = {};
    const allTasksUpdates = {};

    if (tdoId && job.targetId !== tdoId) {
      jobUpdates.recording_id = tdoId;
      allTasksUpdates.recording_id = tdoId;
    }

    const taskHasFinished = [
      'failed',
      'complete',
      'cancelled',
      'aborted'
    ].includes(updatedTask.taskStatus);
    const newJobStatus = jobBll.getJobStatusFromTaskStatuses(tasks);
    if (newJobStatus !== job.status) {
      jobUpdates.job_status = newJobStatus;
    }

    if (taskHasFinished && tdoId && !updatedTask.mediaLengthSecs) {
      const mediaFields = await getTaskMediaFields(context, task, tdoId);
      const processedMediaSeconds = _.get(
        updatedTask,
        'taskOutput.processedStats.processedMediaSeconds'
      );

      // set the media_length_secs to task from task_output processedMediaSeconds.
      // give task_output processedMediaSeconds priority over mediaFields
      if (!_.isNil(processedMediaSeconds) && processedMediaSeconds != 0) {
        mediaFields.mediaLengthSecs = parseInt(processedMediaSeconds);
      }

      // set values to be saved in database
      taskUpdates.media_length_secs = mediaFields.mediaLengthSecs;
      // mediaFields.mediaStorageBytes could be a bigint. To void an integer out of range error,
      // store it in the "media_storage_bytes_new" column instead of the "media_storage_bytes" column (int4).
      taskUpdates.media_storage_bytes_new = mediaFields.mediaStorageBytes;
      taskUpdates.media_file_name = mediaFields.mediaFileName;
      // now update the task copy we return from the mutation
      updatedTask.mediaLengthSec = mediaFields.mediaLengthSecs;
      updatedTask.mediaStorageBytes = mediaFields.mediaStorageBytes;
      updatedTask.mediaFileName = mediaFields.mediaFileName;
    }

    // if any additional job and/or task updates were required, do them now
    if (Object.keys(jobUpdates).length || Object.keys(taskUpdates).length) {
      await doJobAndTaskUpdates(
        job.id,
        task.id,
        jobUpdates,
        taskUpdates,
        allTasksUpdates
      );
    }

    if (
      jobUpdates.job_status &&
      (newJobStatus === 'complete' ||
        newJobStatus === 'failed' ||
        newJobStatus === 'aborted')
    ) {
      await emitJobCompletedEvent(
        job.id,
        organizationId,
        updatedTask.applicationId,
        newJobStatus,
        context
      );
      // Mark the eventSubscription as delete by jobId after job has been completed/failed/aborted
      // core-eventing-service will get list of eventSubscriptionId from redis and delete them hourly.
      // This avoid missing public event subscription immediately when job completed/failed/aborted.
      await serviceContext.dal.event.markSubscriptionDeletedByJob(context, {
        jobId: job.id
      });
    }

    const result = mapper.mapTask(updatedTask);
    return result;
  }

  async function emitJobCompletedEvent(
    jobId,
    organizationId,
    applicationId,
    jobStatus,
    context,
    error
  ) {
    const event = {
      event: eventsMap.JobCompleted.event,
      type: eventsMap.JobCompleted.type,
      serviceName: 'core-graphql-server',
      jobStatus: jobStatus,
      jobId: jobId,
      organizationId: organizationId,
      applicationId: applicationId,
      // actionInfo
      actionInfo: serviceContext.messageUtil.buildActionInfo(
        jobId,
        error,
        null,
        null,
        !error ? `Job completed successfully` : null
      )
    };
    await serviceContext.messageUtil.emitEvent(event, 'events');

    // emit public event
    event.timestampMs = Date.now().valueOf().toString();
    await serviceContext.messageUtil.emitPublicEvent(
      supportedEvents.JobCompleted,
      'system',
      context,
      event
    );
  }

  async function emitTaskUpdatedEvent(
    taskId,
    previousTaskStatus,
    taskStatus,
    payload,
    context,
    error
  ) {
    const event = {
      event: eventsMap.TaskUpdated.event,
      type: eventsMap.TaskUpdated.type,
      serviceName: 'core-graphql-server',

      taskId: taskId,
      previousTaskStatus: previousTaskStatus,
      taskStatus: taskStatus,

      engineId: payload.engineId,
      buildId: payload.buildId,
      jobId: payload.jobId,
      recordingId: payload.recordingId,
      clusterId: payload.clusterId,
      applicationId: payload.applicationId,
      organizationId: payload.organizationId,
      // actionInfo
      actionInfo: serviceContext.messageUtil.buildActionInfo(
        taskId,
        error,
        null,
        null,
        !error ? `Task updated successfully` : null
      )
    };
    await serviceContext.messageUtil.emitEvent(event, 'events');

    // emitEvent populates timestampMs with int value
    // the taskEvent defines that field as string
    event.timestampMs = Date.now().valueOf().toString();

    await serviceContext.messageUtil.emitPublicEvent(
      supportedEvents.TaskUpdated,
      'system',
      context,
      event
    );
  }

  async function emitRecordingCogitionCompletedEvent(
    context,
    recordingId,
    organizationId
  ) {
    const token = context.requestContext.authToken;

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.RecordingCognitionCompleted.event,
      type: eventsMap.RecordingCognitionCompleted.type,
      recordingId: recordingId,
      organizationId: organizationId,
      payload: {
        recordingId: recordingId,
        token: token
      }
    };

    try {
      await serviceContext.messageUtil.emitEvent(
        event,
        serviceContext.messageUtil.topics('EVENTS')
      );
    } catch (err) {
      // event will be stored and retried by ts-messaging
      serviceContext.logger.error(err);
    }
  }

  async function emitAssetMetadataUpdatedPublicEvent(context, asset, err) {
    const assetId = _.get(asset, 'id');
    const contentType = _.get(asset, 'contentType');
    const extension = contentType
      ? '.' + storage.getFileExtension(contentType)
      : '';
    const assetName = `${assetId}${extension}`;
    const event = {
      serviceName: 'core-graphql-server',
      targetId: assetId,
      tdoId: _.get(asset, 'containerId') || _.get(asset, 'recordingId'),
      assetSize: parseInt(_.get(asset, 'assetSize'), 10) || 0,
      storedSize: parseInt(_.get(asset, 'storedSize'), 10) || 0,
      assetType: _.get(asset, 'type'),
      contentType: contentType,
      actionInfo: serviceContext.messageUtil.buildActionInfo(
        assetId,
        err,
        'update',
        !err ? 'success' : 'failure',
        !err
          ? `Updated metadata for file ${assetName}`
          : `Failed to update metadata for file ${assetName}`
      )
    };
    await serviceContext.messageUtil.emitPublicEvent(
      supportedEvents.AssetMetadataUpdate,
      'system',
      context,
      event
    );
  }

  async function emitAssetMetadataUpdatedEvent(
    asset,
    organizationId,
    applicationId
  ) {
    serviceContext.logger.info(
      'Emitting asset_metadata_updated event for asset: %s',
      asset
    );
    const event = {
      assetId: asset.id,
      serviceName: 'core-graphql-server',
      event: eventsMap.AssetMetadataUpdated.event,
      type: eventsMap.AssetMetadataUpdated.type,
      tdoId: asset.containerId || asset.recordingId,
      organizationId: organizationId,
      assetSize: parseInt(asset.assetSize, 10) || 0,
      storedSize: parseInt(asset.storedSize, 10) || 0,
      assetType: asset.type,
      contentType: asset.contentType,
      createdDateTime: new Date(asset.createdDateTime).toISOString(),
      sourceEngineId:
        asset.sourceEngineId ||
        _.get(asset, 'metadata.sourceEngineId') ||
        _.get(asset, 'metadata.source'),
      applicationId: applicationId
    };

    try {
      await serviceContext.messageUtil.emitEvent(
        event,
        serviceContext.messageUtil.topics('EVENTS')
      );
    } catch (err) {
      // event will be stored and retried by ts-messaging
      serviceContext.logger.error(err);
    }
  }

  async function doJobAndTaskUpdates(
    jobId,
    taskId,
    jobUpdates,
    taskUpdates,
    allTasksUpdates
  ) {
    const where = [];
    const args = [];
    const values = [];
    const sqlParts = [];
    // if we have job updates, set up the job update query
    if (Object.keys(jobUpdates).length) {
      const set = [];
      Object.keys(jobUpdates).forEach((column) => {
        values.push(jobUpdates[column]);
        set.push(`${column} = \$${values.length}`);
      });
      const jobTable = getJobTable(jobId);
      values.push(jobId);
      sqlParts.push(`
UPDATE
  ${jobTable}
SET
  ${set.join(',')}
WHERE
  job_id = \$${values.length}
`);
    }
    // now if we had task updates, set up task update query
    if (Object.keys(taskUpdates).length) {
      const set = [];
      Object.keys(taskUpdates).forEach((column) => {
        values.push(taskUpdates[column]);
        set.push(`${column} = \$${values.length}`);
      });
      const taskTable = getTaskTable(taskId);
      values.push(taskId);
      sqlParts.push(`
UPDATE
  ${taskTable}
SET
  ${set.join(',')}
WHERE
  task_id = \$${values.length}
`);
    }

    if (!_.isEmpty(allTasksUpdates)) {
      const set = [];
      Object.keys(allTasksUpdates).forEach((column) => {
        values.push(allTasksUpdates[column]);
        set.push(`${column} = \$${values.length}`);
      });
      const taskTable = getTaskTable(taskId);
      values.push(jobId);
      sqlParts.push(`
UPDATE
  ${taskTable}
SET
  ${set.join(',')}
WHERE
  job_id = \$${values.length}
`);
    }

    const sql = sqlParts.join(';\n');

    // now do the combined update query
    const res = await serviceContext.dbConnections['core'].write.query(
      sql,
      values
    );
    return res;
  }

  async function getTaskMediaFields(context, task, tdoId) {
    let res = {};

    try {
      // get the TDO
      const tdo = await serviceContext.dal.tdo.getTDO(context, {
        id: tdoId
      });
      const tdoDetails = await serviceContext.dal.tdo.getTDODetails({
        id: tdoId,
        applicationId: task.applicationId
      });
      const isRealtime = _.get(tdoDetails, 'numSegments', 0) > 0;
      // determine if tdo is real-time. if so, we use an alternate method
      // of setting media data.

      let recordingMediaLengthInSecs =
        moment(tdo.stopDateTime).unix() - moment(tdo.startDateTime).unix();
      // get its current assets.
      // for a realtime TDO, we need to get all media assets.
      // otherwise, just get the oldest.
      const limit = isRealtime ? 1000 : 1;
      const assets = await serviceContext.dal.asset.getAssets(context, {
        containerId: tdoId,
        limit,
        assetType: 'media',
        orderBy: 'createdDateTime',
        orderDirection: 'asc',
        includeHiddenAssets: true
      });
      let mainAssetSize = 0,
        mainAssetFileName,
        mainAssetMediaDuration = 0;

      // note that for a non-realtime TDO, this loop will run at most once.
      assets.records.forEach((asset) => {
        // increment total size counter
        mainAssetSize += _.get(
          asset,
          'metadata.size',
          _.get(asset, 'metadata.details.size', 0)
        );
        // if we haven't got a file name, set it now
        if (!mainAssetFileName)
          mainAssetFileName = _.get(
            asset,
            'metadata.filename',
            _.get(asset, 'metadata.fileName')
          );

        // if this isn't a realtime TDO, set duration based on that of
        // this asset.
        if (!isRealtime) {
          try {
            const duration = _.get(
              asset,
              'metadata.mediaDuration',
              _.get(asset, 'metadata.details.mediaDuration')
            );
            if (!_.isNil(duration)) mainAssetMediaDuration = parseInt(duration);
          } catch (err) {
            serviceContext.logger.warn(err);
          }
        }
      });
      res = {
        mediaLengthSecs: mainAssetMediaDuration || recordingMediaLengthInSecs,
        mediaStorageBytes: mainAssetSize,
        mediaFileName: mainAssetFileName
      };
    } catch (err) {
      serviceContext.logger.warn(
        'could not update media length on task:  ' + err,
        err
      );
      throw err;
    }
    return res;
  }

  function getTaskOutputInputField(input) {
    let out = input.output || input.taskOutput;
    if (!out && input.outputString) {
      if (input.outputJsonKey) {
        const temp = {};
        temp[input.outputJsonKey] = input.outputString;
        out = temp;
      } else {
        try {
          out = JSON.parse(input.outputString);
        } catch (err) {
          throw new errors.InvalidInput({
            message:
              'The string value provided for outputString did not contain valid JSON',
            data: {
              value: input.outputString,
              field: 'outputString'
            }
          });
        }
      }
    }
    if (_.isString(out)) out = { json: out };
    return out;
  }

  const taskSelect = `
  task_id AS id,
  task_id,
  job_id,
  engine_id,
  application_id,
  task_executor,
  task_status AS status,
  task_status,
  task_payload AS payload,
  task_output AS output,
  recording_id AS target_id,
  media_length_secs AS media_length_sec,
  media_storage_bytes,
  media_storage_bytes_new,
  media_file_name,
  is_clone,
  created_date_time,
  queued_date_time,
  modified_date_time,
  completed_date_time,
  asset_selector,
  standby_for_task_id,
  task_executor_data,
  task_order,
  source_asset_id,
  notification_uris
  `;

  async function getTask(context, args) {
    if (_.isNil(args.id))
      throw new errors.InvalidInput({ message: 'id is required' });
    if (_.isString(args.id) && args.id.trim().length === 0) {
      throw new errors.NotFound({
        message:
          'The id parameter is required and cannot an empty string. Supply ' +
          'a valid task ID to continue.'
      });
    }

    if (!dateIdUtil.isValidDateId(args.id.trim())) {
      throw new errors.InvalidInput({
        data: {
          objectId: args.id,
          objectType: 'Task'
        },
        message: 'The id parameter is not a valid task id.'
      });
    }

    const tasks = await getTasks(context, args);
    if (!tasks.records.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Task'
        }
      });
    }
    return tasks.records[0];
  }

  async function getTasks(context, options) {
    const defaultLimit = _.get(config, 'paging.defaultLimit', 30);
    const sqlWhere = [];
    const args = [];
    let hasDateFilter = false;
    // The task table is partition by createdDateTime, therefore
    // any other time filter is insufficient, since it will not reduce
    // the count of partitions that need to be queried.
    if (_.isArray(options.dateTimeFilter)) {
      for (const f of options.dateTimeFilter) {
        if (f.field === 'createdDateTime') {
          hasDateFilter = true;
          break;
        }
      }
    }
    let taskTable = 'job_new.task';
    let jobTable = 'job_new.job';

    options.offset = options.offset || 0;
    options.limit = options.limit || defaultLimit;

    if (!options.internalEngineId) {
      const argEngineIds = Array.isArray(options.engineId)
        ? options.engineId
        : options.engineId
        ? [options.engineId]
        : [];
      let engineIds = [];
      const aliasedEngines = [];
      for (let i = 0; i < argEngineIds.length; i++) {
        const id = argEngineIds[i];
        // if it's an internal ID, get its alias ID and add to where
        if (!validator.isUUID(id)) {
          aliasedEngines.push(id);
        }
        engineIds.push(id);
      }
      if (aliasedEngines.length) {
        const engines = await serviceContext.dal.engine.getEngines(context, {
          ids: aliasedEngines
        });
        for (const eng of _.get(engines, 'records', [])) {
          if (eng.aliasId) engineIds.push(eng.aliasId);
        }
        engineIds = _.uniq(engineIds);
      }
      if (engineIds.length) {
        const engineIdsItems = [];
        engineIds.forEach((engineId) => {
          args.push(engineId);
          engineIdsItems.push(`\$${args.length}`);
        });
        sqlWhere.push(`t.engine_id IN (${engineIdsItems.join(',')})`);
      }
    } else if (options.internalEngineId) {
      args.push(options.internalEngineId);
      sqlWhere.push(`t.engine_id = \$${args.length}`);
    }
    if (options.jobId) {
      const allJobIds = _.isArray(options.jobId)
        ? options.jobId
        : [options.jobId];
      let start, end;

      mainUtil.addSqlWhere('t.job_id', options.jobId, sqlWhere, args);

      _.forEach(allJobIds, (id) => {
        // add date range if we got a single ID
        if (!dateIdUtil.isValidDateId(id)) {
          throw new errors.InvalidInput({
            message: 'Invalid job id',
            data: {
              objectId: id,
              objectType: 'Job'
            }
          });
        }
        const range = dateIdUtil.getEpochRange(id);

        if (!start || range.start < start) {
          start = range.start;
        }
        if (!end || range.end > end) {
          end = range.end;
        }
      });

      if (start && end) {
        const startParam = args.push(start);
        const endParam = args.push(end);

        sqlWhere.push(
          `(t.created_date_time BETWEEN $${startParam} AND $${endParam})`
        );
        hasDateFilter = true;
      }

      if (allJobIds.length === 1) {
        taskTable = util.generateTaskTablePartition(_.first(allJobIds));
        jobTable = util.generateJobTablePartition(_.first(allJobIds));
      }
    }
    // if applicationId (singular) was given, combine it with
    // applicationIds so that we have a cleaner WHERE clause
    if (options.applicationId) {
      if (!options.applicationIds) options.applicationIds = [];
      if (!options.applicationIds.includes(options.applicationId)) {
        options.applicationIds.push(options.applicationId);
      }
    }
    if (options.applicationIds) {
      if (!_.isArray(options.applicationIds)) {
        options.applicationIds = [options.applicationIds];
      }
      let insertItems = [];
      options.applicationIds.forEach(function addArg(applicationId) {
        args.push(applicationId);
        insertItems.push(`\$${args.length}`);  
      });
      sqlWhere.push(`t.application_id IN (${insertItems.join(',')})`);
    }
    if (options.id) {
      hasDateFilter = true;
      args.push(options.id);
      sqlWhere.push(`t.task_id = \$${args.length}`);  
      mainUtil.addPartitionRangeToArgs(
        options.id,
        't.created_date_time',
        sqlWhere,
        args
      );
      taskTable = util.generateTaskTablePartition(options.id);
      jobTable = util.generateJobTablePartition(options.id);
    }

    // handle target TDO/recording target ID
    if (options.targetId) {
      if (!_.isArray(options.targetId)) {
        options.targetId = [options.targetId];
      }
      let insertItems = [];

      // we might have multiple target TDOs. to get a search
      // date range for the tasks, get the oldest target TDO.
      // if we were given a date/time filter by the caller,
      // use that instead.
      let targetTDO;
      const needDateFilter = !hasDateFilter;
      for (let i = 0; i < options.targetId.length; i++) {
        const targetId = options.targetId[i];
        args.push(targetId);
        insertItems.push(`\$${args.length}`);  
        if (needDateFilter) {
          // use TDO created/date time. we'll take the oldest.
          const tdo = await serviceContext.dal.tdo.getTDO(context, {
            id: targetId
          });
          if (
            _.isNil(targetTDO) ||
            targetTDO.createdDateTime > tdo.createdDateTime
          ) {
            targetTDO = tdo;
          }
        }
      }
      if (needDateFilter) {
        hasDateFilter = true;
        sqlWhere.push(
          `t.created_date_time BETWEEN \$${args.length + 1} AND \$${
            args.length + 2
          }`
        );
        // TODO originally this code (never deployed, not fully tested) used
        // a 2-week bracket around TDO createdDateTime with addPartitionRangeWithTDO.
        // fix that function and use here. might need to increase time window or
        // use "now" as done here even though that is not optimal for old TDOs.
        args.push(moment(targetTDO.createdDateTime).unix());
        args.push(moment().utc().unix());
      }
      sqlWhere.push(`t.recording_id IN (${insertItems.join(',')})`);
    }

    if (options.status) {
      if (!_.isArray(options.status)) options.status = [options.status];

      let insertItems = [];
      options.status.forEach(function addArg(status) {
        args.push(status);
        insertItems.push(`\$${args.length}`);  
      });
      sqlWhere.push(`t.task_status IN (${insertItems.join(',')})`);
    }

    if (options.parentTaskId) {
      args.push(options.parentTaskId);
      sqlWhere.push(`t.parent_task_id = \$${args.length}`);

      mainUtil.addPartitionRangeToArgs(
        options.parentTaskId,
        't.created_date_time',
        sqlWhere,
        args
      );
      hasDateFilter = true;
    }

    // standbyForTaskId asks that we get return a task that is
    // standby for the identified task.
    if (options.standbyForTaskId) {
      args.push(options.standbyForTaskId);
      sqlWhere.push(`t.standby_for_task_id = \$${args.length}`);

      mainUtil.addPartitionRangeToArgs(
        options.standbyForTaskId,
        't.created_date_time',
        sqlWhere,
        args
      );
      hasDateFilter = true;
    }

    // if we don't already have a createdDateTome filter, add one now
    // this is a must, else the query times out due to the large number of partitions
    // that needs to be queried
    if (!hasDateFilter) {
      const now = moment();
      if (!Array.isArray(options.dateTimeFilter)) {
        options.dateTimeFilter = [];
      }
      options.dateTimeFilter.push(
        {
          toDateTime: now.toISOString(),
          field: 'createdDateTime'
        },
        {
          fromDateTime: now.subtract(3, 'months').toISOString(),
          field: 'createdDateTime'
        }
      );
    }

    let sql = `
SELECT
  t.task_id AS id,
  t.job_id,
  t.engine_id,
  t.media_length_secs AS media_length_sec,
  t.application_id,
  t.task_executor,
  t.task_executor_id,
  t.task_status AS status,
  t.task_payload AS payload,
  t.payload AS runtime_payload,
  t.task_output AS output,
  t.recording_id AS target_id,
  t.task_order AS order,
  t.is_clone,
  t.created_date_time,
  t.queued_date_time,
  t.started_date_time,
  t.modified_date_time,
  t.completed_date_time,
  t.test_task,
  t.build_id,
  t.source_asset_id,
  t.media_storage_bytes,
  t.media_storage_bytes_new,
  t.media_file_name,
  t.task_log AS log,
  t.asset_selector,
  t.parent_task_id,
  t.standby_for_task_id,
  t.task_executor_data,
  t.notification_uris
FROM ${taskTable} t `;

    if (options.clusterId) {
      // apply a job date/time filter
      // we need to put a date/time filter on both the tasks and
      // jobs tables (jobs via the join condition).
      const dateTimes = _.get(options, 'dateTimeFilter', []);
      // tasks field by cluster is a new option, so we are applying a maximum
      // age of three months to retrieve jobs and tasks in order to keep this query
      // efficient. we'll then use the incoming date/time filter on tasks to
      // tune the window for the jobs table date/time filter.
      let maxFrom = moment().subtract(3, 'months');
      let maxTo = moment();
      // we'll look at the incoming date/time filters
      dateTimes.forEach((dateTime) => {
        // incoming date/time filters could be on any field, not just createdDateTime.
        // however, we know that a given job can only last a finite amount of time (hours, max).
        // so two days earlier than the most recent filter value is a sufficient buffer
        // to establish a range for job createdDateTime.
        if (
          dateTime.fromDateTime &&
          moment(dateTime.fromDateTime).isAfter(maxFrom)
        ) {
          maxFrom = moment(dateTime.fromDateTime);
        }
        // similarly, the job must have been created before all its tasks.
        // thus, the oldest toDateTime is a good upper boundary for job
        // createdDateTime.
        if (
          dateTime.toDateTime &&
          moment(dateTime.toDateTime).isBefore(maxTo)
        ) {
          maxTo = moment(dateTime.toDateTime);
        }
      });
      args.push(options.clusterId);
      args.push(maxFrom.subtract(2, 'days').unix());
      args.push(maxTo.unix());
      sql += `
JOIN ${jobTable} j ON j.job_id = t.job_id
  AND j.cluster_id = $${args.length - 2}
  AND j.created_date_time BETWEEN $${args.length - 1} AND $${args.length}
`;
    }

    if (_.isArray(options.dateTimeFilter)) {
      options.dateTimeFilter.forEach((dateTime) => {
        if (dateTime.toDateTime) {
          args.push(Math.ceil(moment(dateTime.toDateTime).unix()));
          sqlWhere.push(`t.${_.snakeCase(dateTime.field)} < \$${args.length}`);  
        }
        if (dateTime.fromDateTime) {
          args.push(Math.floor(moment(dateTime.fromDateTime).unix()));
          sqlWhere.push(`t.${_.snakeCase(dateTime.field)} > \$${args.length}`);  
        }
      });
    }
    if (_.has(options, 'hasSourceAsset')) {
      if (options.hasSourceAsset) {
        sqlWhere.push(`t.source_asset_id IS NOT NULL`);
      } else {
        sqlWhere.push(`t.source_asset_id IS NULL`);
      }
    }

    // standbyTaskId asks that we return a task that has the identified
    // task as a standby
    if (options.standbyTaskId) {
      // TODO not implemented earlier?
    }

    // exclude task templates
    sqlWhere.push('(t.is_template = FALSE OR t.is_template IS NULL)');
    if (sqlWhere.length) {
      sql += '\n WHERE ' + sqlWhere.join(' AND ');
    }

    // default order by createdDateTime desc
    if (!_.get(options, 'orderBy.length', 0) > 0) {
      options.orderBy = [
        {
          field: 'createdDateTime',
          direction: 'desc'
        }
      ];
    }
    const orderParts = [];
    options.orderBy.forEach((field) => {
      const key = 't.' + humps.decamelize(field.field);
      orderParts.push(key + ' ' + field.direction);
    });
    sql += `\n ORDER BY ${orderParts.join(', ')} `;

    if (Number.isInteger(options.limit)) {
      sql += `\n LIMIT ${options.limit}`;
    }
    if (Number.isInteger(options.offset)) {
      sql += `\n OFFSET ${options.offset}`;
    }

    const res = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapTask
    );

    for (let i = 0; i < res.length; i++) {
      const row = res[i];
      row.engineAliasId = await serviceContext.dal.engine.getIdById(
        row.engineId
      );
      // override internal engine ID to external engine ID from mapped
      if (!_.includes(options.engineId, row.engineId)) {
        if (row.engineAliasId) row.engineId = row.engineAliasId;
      }
    }
    return mainUtil.toPage(options, res);
  }

  async function getStandbyTask(context, task) {
    const options = {
      standbyForTaskId: task.id,
      applicationId: task.applicationId,
      limit: 1
    };

    const res = await getTasks(context, options);
    return res.count ? res.records[0] : null;
  }

  async function updateTaskLog(options) {
    let taskTable = 'job_new.task';

    if (options.taskId) {
      taskTable = util.generateTaskTablePartition(options.taskId);
    }

    const sql = `
    UPDATE
      ${taskTable}
    SET
      task_log = $2
    WHERE
      task_id = $1
    RETURNING
      task_id, task_log`;

    const args = [options.taskId, options.taskLog];

    const updatedTask = await serviceContext.dbConnections['core'].write.query(
      sql,
      args
    );

    return updatedTask[0];
  }

  async function getOrgAndAppByTask(taskId) {
    let res = localCache.get('TaskApplicationId', taskId);
    if (!res) {
      res = await getOrgAndAppByTaskRedis(taskId);
      localCache.set('TaskApplicationId', taskId, res);
    }

    return res;
  }

  async function getOrgAndAppByTaskRedis(taskId) {
    let res = await serviceContext.redisCache.get('Task.orgAndApp', taskId);
    if (!res) {
      res = await getOrgAndAppByTaskDb(taskId);
      if (res) {
        await serviceContext.redisCache.set('Task.orgAndApp', taskId, res);
      }
    }
    return res;
  }

  async function getOrgAndAppByTaskDb(taskId) {
    let res;
    const args = [taskId];
    const where = ['task_id = $1'];
    mainUtil.addPartitionRangeToArgs(taskId, 'created_date_time', where, args);

    const taskDb = serviceContext.dbConnections['core'].read;
    const taskSql = `
SELECT application_id FROM ${util.generateTaskTablePartition(
      taskId
    )} WHERE ${where.join(' AND ')}
  `;
    const taskRows = await taskDb.query(taskSql, args);
    const taskRow = taskRows.length ? taskRows[0] : null;

    if (taskRow) {
      const appId = taskRow.application_id;
      const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
        appId
      );
      if (!orgId) throw new Error('no org ID for app ' + appId);
      res = {
        applicationId: appId,
        organizationId: orgId
      };
    } else {
      // if task was not found, inject bogus IDs that will not
      // allow access to any real data.
      res = {
        applicationId: '00000000-0000-0000-0000-000000000000',
        organizationId: '000'
      };
    }
    return res;
  }

  async function createTasksDb(tasks, dbTrans) {
    const insertItems = [];
    const args = [];

    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['core'].write;
    }

    if (_.isEmpty(tasks)) {
      // we saw this strange error where an empty task list
      // was passed all the way into this code and triggered a SQL
      // syntax error on empty values.
      throw new errors.InvalidInput({
        message: 'tasks cannot be empty or null'
      });
    }

    for (let i = 0; i < tasks.length; i++) {
      // if a taskId was provided, validate its format before proceeding.
      // we'll allow either date ID or
      // for backwards compatibility: UUID or UUID-UUID (job+task)
      if (!tasks[i].taskId || !util.validateTaskId(tasks[i].taskId)) {
        throw new errors.InvalidInput({
          message: 'invalid task ID ' + tasks[i].taskId
        });
      }

      // check for forbidden content in the task payload and throw
      mainUtil.checkForForbiddenContent('job.task.payload', tasks[i].payload);
      mainUtil.checkForForbiddenContent(
        'job.task.payload',
        tasks[i].taskPayload
      );
    }

    tasks.forEach((task) => {
      const values = TASK_INSERT_COLUMNS.map(([, valueOf]) => valueOf(task));
      const placeholders = values.map((_value, i) => `$${args.length + i + 1}`);
      insertItems.push(`(${placeholders.join(',')})`);
      args.push(...values);
    });

    let taskTable = 'job_new.task';

    if (
      dateIdUtil.isTaskTablePartitionActive(
        config.taskTablePartitionActiveDate,
        tasks[0].taskId
      )
    ) {
      taskTable = dateIdUtil.getTaskTablePartition(tasks[0].taskId);
    }

    const sql = `
      INSERT INTO ${taskTable}
        (${TASK_INSERT_COLUMNS.map(([column]) => column).join(', ')})
      VALUES
        ${insertItems.join(',')}
      RETURNING
        ${taskSelect}`;

    return dbTrans.map(sql, args, mapper.mapTask);
  }

  async function updateTestTasks(tasks, dbTrans) {
    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['core'].write;
    }

    if (!_.isArray(tasks)) {
      throw new errors.InvalidInput({
        message: 'missing array of tasks'
      });
    }

    const updateItems = [];
    const args = [];
    let taskTable = 'job_new.task';

    if (!_.isEmpty(tasks)) {
      if (
        dateIdUtil.isTaskTablePartitionActive(
          config.taskTablePartitionActiveDate,
          tasks[0].taskId
        )
      ) {
        taskTable = dateIdUtil.getTaskTablePartition(tasks[0].taskId);
      }
    }

    tasks.forEach((task) => {
      const taskArgs = [];
      for (let i = 1; i <= 4; i++) {
        taskArgs.push(`$${args.length + i}`);
      }
      updateItems.push(`(${taskArgs.join(',')})`);
      args.push(
        task.taskId,
        task.taskStatus,
        task.queuedDateTime,
        task.payload
      );
    });

    let sql = `
      UPDATE
        ${taskTable}
      AS t
      SET
        task_status = c.task_status,
        queued_date_time = CAST(c.queued_date_time as INTEGER),
        payload = CAST(c.payload as json)
      FROM (VALUES
        ${updateItems.join(',')}
      )
      AS c(task_id, task_status, queued_date_time, payload)
      WHERE c.task_id = t.task_id`;

    const range = dateIdUtil.getEpochRange(tasks[0].taskId);

    if (range.start && range.end) {
      sql += ` AND created_date_time BETWEEN $${args.length + 1} AND $${
        args.length + 2
      }`;
      args.push(range.start, range.end);
    }

    return dbTrans.map(sql, args, mapper.mapTask);
  }

  async function getUsageByTaskType(context, args) {
    const _authInfo = _.get(context, '_authInfo');
    const requestorAppId =
      _.get(_authInfo, 'applicationId') ||
      _.get(_authInfo, 'groups[0].applicationId');
    const requestorOrg = _.get(_authInfo, 'organization');

    const getEngineUsageForOrganizationPromise = promisify(
      serviceContext.coreJob.jobBll.task.getEngineUsageForOrganization
    );
    return getEngineUsageForOrganizationPromise(
      requestorAppId,
      requestorOrg,
      null
    );
  }

  async function updateTaskAtomicallyByStatus(
    taskId,
    acceptableStatuses,
    updateTask,
    context,
    options = {}
  ) {
    if (typeof taskId !== 'string') {
      throw new Error('Missing taskId!');
    }
    if (!Array.isArray(acceptableStatuses) || acceptableStatuses.length === 0) {
      throw new Error('Missing acceptableStatuses!');
    }
    if (typeof updateTask !== 'object') {
      throw new Error('Missing updateTask!');
    }
    if (Object.keys(updateTask).length === 0) {
      throw new Error('updateTask is empty!');
    }

    const setStatements = [];
    const sqlParameters = [taskId];

    const acceptableStatusInClause = [];
    acceptableStatuses.forEach(function forEachAcceptableStatus(status) {
      sqlParameters.push(status);
      acceptableStatusInClause.push('$' + sqlParameters.length);
    });

    updateTask = mapper.decamelizeRootKeys(updateTask);

    // Build out set statement
    let newStatus;
    Object.keys(updateTask).forEach(function forEachKey(key) {
      if (!columnNameUpdateWhitelist[key]) {
        return;
      }

      if (key === 'task_status') {
        newStatus = updateTask[key];
      }

      sqlParameters.push(updateTask[key]);
      setStatements.push(key + ' = $' + sqlParameters.length);
    });

    // Rides on the status change, so a transition the WHERE rejects leaves the stored reason
    // intact. Never collides with an explicit `task_output = $n` — see the caller's guard.
    if (options.stripFailureOutput) {
      setStatements.push(STRIP_FAILURE_OUTPUT_SQL);
    }

    let taskTable = 'job_new.task';
    if (
      dateIdUtil.isTaskTablePartitionActive(
        config.taskTablePartitionActiveDate,
        taskId
      )
    ) {
      taskTable = dateIdUtil.getTaskTablePartition(taskId);
    }

    const sql = `
      UPDATE
        ${taskTable}
      SET
        ${setStatements.join()}
      WHERE
        task_id = $1
      AND
        task_status IN (${acceptableStatusInClause.join()})
      RETURNING
        job_id,
        task_id,
        engine_id,
        build_id,
        created_date_time,
        queued_date_time,
        modified_date_time,
        completed_date_time,
        started_date_time,
        cancelled_date_time,
        task_status,
        task_payload,
        task_output,
        task_order,
        is_clone,
        recording_id,
        application_id,
        task_executor_data,
        parent_task_id,
        standby_for_task_id,
        job_pipeline_id,
        media_length_secs,
        media_storage_bytes,
        media_storage_bytes_new,
        task_log,
        source_asset_id,
        media_file_name,
        asset_selector,
        payload AS runtime_payload,
        source_asset_id,
        notification_uris;`;

    try {
      const updatedTask = await serviceContext.dbConnections['core'].write.one(
        sql,
        sqlParameters,
        mapper.camelizeRootKeys
      );

      if (!updatedTask) {
        return null;
      }

      // migration remap reads, taskType column is gone
      updatedTask.taskType = updatedTask.engineId;

      return updatedTask;
    } catch (error) {
      const noDataMsg = 'No data returned from the query.';
      const errMsg = _.get(error, 'data.internalData.message', '');
      if (!errMsg.includes(noDataMsg)) {
        throw error;
      }

      // Check task status before update
      const _validateTaskStatus = await _updateTaskValidateTaskStatus(
        context,
        taskId,
        newStatus,
        acceptableStatuses
      );

      // Failed to validate task status --> return origin error
      if (!_validateTaskStatus.success) {
        throw error;
      }
      // Validate task status successfully but we have an error
      if (_validateTaskStatus.error) {
        throw _validateTaskStatus.error;
      }

      // return current task info
      serviceContext.logger.warn(
        `(updateTaskAtomicallyByStatus) No new changes are applied to the task due to the task is already in the new state`
      );
      return _validateTaskStatus.task;
    }
  }

  async function _updateTaskValidateTaskStatus(
    context,
    taskId,
    newStatus,
    acceptableStatuses
  ) {
    const result = {
      success: true,
      task: null,
      error: null
    };

    try {
      const task = await getTask(context || {}, { id: taskId });
      result.task = task;
      const currentStatus = task.taskStatus || task.status;
      if (newStatus && currentStatus === newStatus) {
        return result;
      }

      if (
        acceptableStatuses &&
        acceptableStatuses.length &&
        !acceptableStatuses.includes(currentStatus)
      ) {
        result.error = new errors.NotAllowed({
          message: `Cannot change the task ${taskId} from ${currentStatus} to ${newStatus}. The current task status must be in: ${acceptableStatuses}`,
          data: {
            objectType: 'Task',
            objectId: taskId,
            currentStatus: currentStatus,
            newStatus: newStatus
          }
        });
      }
    } catch (err) {
      serviceContext.logger.error('(validateTaskStatus) Error: ', err);
      result.error = err;
      result.success = false;
    }

    return result;
  }

  return {
    addTasksToJobs,
    updateTask,
    isClientTimestampStale,
    getStandbyTask,
    appendWarningToTask,
    getTask,
    getTasks,
    updateTaskLog,
    getOrgAndAppByTask,
    createTasksDb,
    updateTestTasks,
    getUsageByTaskType,
    updateTaskAtomicallyByStatus,
    emitJobCompletedEvent,
    // unit-test only
    handleTaskStatusUpdate,
    updateAssetSizeOnTaskComplete
  };
};

module.exports.TASK_INSERT_COLUMNS = TASK_INSERT_COLUMNS;
