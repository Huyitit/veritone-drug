const _ = require('lodash');

// Allowlist, not a suppression list: TaskStatus has drifted against edge's own enum before, so an
// unrecognised status must read as "no failure" rather than leak a prior attempt's task_output.
const FAILURE_STATUSES = new Set(['failed', 'aborted']);

module.exports = function createFunction(serviceContext) {
  const util = require('./util.js')(serviceContext);
  const cache = require('./cache.js')(serviceContext);

  function convertDate(date) {
    return _.isNumber(date) ? date * 1000 : date;
  }

  // `aborted` is allowlisted on purpose: an abort that reported no reason has none stored and nulls
  // on its own, while one the controller did supply a reason for must keep it.
  //
  // Depends on mapper.mapTask backfilling `status` on write results, where the column comes back as
  // `taskStatus`. A Task source bypassing that mapper fails closed here — silently.
  function isInFailureState(obj) {
    return FAILURE_STATUSES.has(_.get(obj, 'status'));
  }

  return {
    job: (object, args, context, info) => {
      return cache.get(context, { id: object.jobId }, 'Job', () =>
        serviceContext.dal.job.getJob(context, {
          id: object.jobId,
          applicationId: object.applicationId
        })
      );
    },
    engine: (object, args, context, info) => {
      return cache.get(context, { id: object.engineId }, 'Engine', () =>
        serviceContext.dal.engine.getEngine(context, {
          id: object.engineId,
          includeDeleted: true,
          adminView: true
        })
      );
    },
    target: (object, args, context, info) => {
      return object.targetId
        ? cache.get(
            context,
            { id: object.targetId },
            'TemporalDataObject',
            () =>
              serviceContext.dal.tdo.getTDO(context, { id: object.targetId })
          )
        : null;
    },
    build: (object, args, context, info) => {
      return object.buildId
        ? cache.get(context, { id: object.buildId }, 'EngineBuild', () =>
            serviceContext.dal.engine.getEngineBuild({ id: object.buildId })
          )
        : null;
    },
    sourceAsset: (object, args, context, info) => {
      return object.sourceAssetId
        ? cache.get(context, { id: object.sourceAssetId }, 'Asset', () =>
            serviceContext.dal.asset.getAsset(context, {
              id: object.sourceAssetId
            })
          )
        : null;
    },
    log: (object, args, context, info) =>
      // in this resolver we just need to bootstrap a TaskLog object with
      // the log URI. The rest of the logic is in TaskLog.js.
      object.log ? { uri: object.log } : null,

    outputString: (object, args, context, info) =>
      JSON.stringify(object.taskOutput),

    // if we have an engine ID alias, override ID here.
    // never expose the internal ID.
    engineId: (object, args, context) =>
      serviceContext.dal.engine.getIdById(context, object.engineId),

    parentTask: (object, args, context) => {
      const _args = {
        id: object.parentTaskId,
        jobId: object.jobId,
        applicationId: object.applicationId
      };
      return object.parentTaskId
        ? cache.get(context, _args, 'Task', () =>
            serviceContext.dal.task.getTask(context, _args)
          )
        : null;
    },
    childTasks: (object, args, context) => {
      const _args = {
        parentTaskId: object.id,
        jobId: object.jobId,
        applicationId: object.applicationId
      };
      const tasks = cache.get(context, _args, 'Tasks', () =>
        serviceContext.dal.task.getTasks(context, _args)
      );
      return tasks.then((res) => res.records);
    },

    standbyTask: (object, args, context, info) =>
      serviceContext.dal.task.getStandbyTask(context, object),

    standbyForTask: (object, args, context, info) =>
      object.standbyForTaskId
        ? cache.get(context, { id: object.standbyForTaskId }, 'Task', () =>
            serviceContext.dal.task.getTask(context, {
              id: object.standbyForTaskId
            })
          )
        : null,

    createdDateTime: (obj) => convertDate(obj.createdDateTime),
    modifiedDateTime: (obj) => convertDate(obj.modifiedDateTime),
    queuedDateTime: (obj) => convertDate(obj.queuedDateTime),
    completedDateTime: (obj) => convertDate(obj.completedDateTime),
    startedDateTime: (obj) => convertDate(obj.startedDateTime),
    payload: (object) =>
      object.testTask
        ? Object.assign({ taskPayload: object.payload }, object.runtimePayload)
        : object.payload,
    runtimePayload: (object) =>
      Object.assign({ taskPayload: object.payload }, object.runtimePayload),
    executionLocation: (obj) => {
      return !obj.taskExecutorId && !obj.taskExecutorData
        ? null
        : { id: obj.taskExecutorId || '', data: obj.taskExecutorData };
    },
    executionLocationId: (obj) => {
      return obj.taskExecutorId;
    },
    failureReason: (obj) =>
      isInFailureState(obj) ? _.get(obj, 'taskOutput.failureReason') : null,
    failureMessage: (obj) => {
      if (!isInFailureState(obj)) return null;
      const failureReason = _.get(obj, 'taskOutput.failureReason');
      const failureMessage = _.get(obj, 'taskOutput.failureMessage');
      const taskOutput = util.defineTaskOutputFailure(
        failureReason,
        failureMessage
      );
      return taskOutput ? taskOutput.failureMessage : null;
    },
    warnings: (obj) => _.get(obj, 'taskOutput.warnings'),
    ioFolders: (obj) => _.get(obj, 'runtimePayload.ioFolders'),

    executionPreferences: (obj) =>
      _.get(obj, 'runtimePayload.executionPreferences')
  };
};
