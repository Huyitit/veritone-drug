const _ = require('lodash');
const { v5: uuidv5 } = require('uuid');
const stringify = require('json-stable-stringify');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const mainUtil = require('../util.js')();

  const engineReplacementListKey = 'EngineReplacementList';
  const engineReplacementTimestampKey = 'EngineReplacementTimestamp';
  const uuidNamespace = '361ed019-b212-4f42-be28-cdc518eb5ab8';
  const engineReplacementTtlMin = _.get(
    serviceContext,
    'config.engineReplacement.ttlMin',
    5
  );

  async function getEngineReplacements(context, args) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const requestorOrgId = _.toNumber(
      _.get(context, '_authInfo.organization.organizationId')
    );
    const organizationId = _.toNumber(args.organizationId);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const sourceEngineId = args.engineId;
    const tokenType = resUtil.getTokenType(context);

    // Allow SuperAdmin and InternalToken get Engine Replacement of other orgs
    if (
      requestorOrgId !== organizationId &&
      !isSuperAdmin &&
      tokenType != 'internal'
    ) {
      throw new errors.NotAllowed({
        message:
          'Only Super Admin can get Engine Replacement by organizationId',
        data: {
          objectType: 'organizationId',
          objectId: organizationId
        }
      });
    }

    const options = {
      organizationId,
      sourceEngineId,
      sourceEngineIds: args.sourceEngineIds,
      offset: _.get(args, 'offset', 0),
      limit: _.get(args, 'limit', defaultLimit)
    };
    const cacheKey = uuidv5(stringify(options), uuidNamespace);
    let engineReplacementListTimestamp = await serviceContext.redisCache.get(
      engineReplacementTimestampKey,
      cacheKey
    );
    const isCacheDirty = await serviceContext.redisCache.isCacheDirty(
      engineReplacementListKey,
      engineReplacementListTimestamp
    );

    if (isCacheDirty) {
      await serviceContext.redisCache.clear(engineReplacementListKey, cacheKey);
      // clear the engine replacement cache timestamp too
      await serviceContext.redisCache.clear(
        engineReplacementTimestampKey,
        cacheKey
      );
    }

    let res = await serviceContext.redisCache.get(
      engineReplacementListKey,
      cacheKey
    );

    if (!res) {
      serviceContext.logger.debug(
        'cache MISS on engine replacement list for: ',
        options
      );
      res = await serviceContext.dal.engine.getEngineReplacements(options);

      if (res) {
        await serviceContext.redisCache.asyncSet(
          engineReplacementListKey,
          cacheKey,
          res,
          null,
          engineReplacementTtlMin
        );
        // Set the engine replacement list cache timestamp to check dirty later
        engineReplacementListTimestamp = Date.now();
        await serviceContext.redisCache.asyncSet(
          engineReplacementTimestampKey,
          cacheKey,
          engineReplacementListTimestamp,
          null,
          engineReplacementTtlMin
        );
      }
    } else {
      serviceContext.logger.debug(
        'cache HIT on engine replacement list for: ',
        options
      );
    }

    return mainUtil.toPage(options, res);
  }

  async function replaceEngine(context, args) {
    const {
      sourceEngineId,
      replacementEngineId,
      inputOrgId,
      requestorOrgId
    } = await validateEngineReplacement(context, args);
    const payloadFunc = _.get(args, 'input.payloadFunc');
    const engineReplacement = {
      sourceEngineId: sourceEngineId,
      replacementEngineId: replacementEngineId,
      organizationId: inputOrgId || requestorOrgId,
      payloadFunc
    };
    const res = await serviceContext.dal.engine.createEngineReplacement(
      engineReplacement
    );
    // mark cache dirty for engine replacement
    await serviceContext.redisCache.markCacheDirty(engineReplacementListKey);

    return res;
  }

  async function removeReplacementEngineId(context, args) {
    const {
      sourceEngineId,
      replacementEngineId,
      inputOrgId,
      requestorOrgId
    } = await validateEngineReplacement(context, args);
    const engineReplacement = {
      sourceEngineId: sourceEngineId,
      replacementEngineId: replacementEngineId,
      organizationId: inputOrgId || requestorOrgId
    };
    const res = await serviceContext.dal.engine.removeEngineReplacement(
      engineReplacement
    );

    if (!res) {
      throw new errors.NotFound({
        message: 'The triplet does not exists.',
        data: {
          sourceEngineId,
          replacementEngineId,
          organizationId: inputOrgId || requestorOrgId
        }
      });
    }

    // mark cache dirty for engine replacement
    await serviceContext.redisCache.markCacheDirty(engineReplacementListKey);

    return {
      id: res.sourceEngineId,
      message: 'Engine replacement has been removed'
    };
  }

  async function validateEngineReplacement(context, args) {
    const requestorOrgId = args.organizationId;
    const inputOrgId = _.get(args, 'input.organizationId');
    const sourceEngineId = _.get(args, 'input.sourceEngineId');
    const replacementEngineId = _.get(args, 'input.replacementEngineId');
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (inputOrgId != requestorOrgId && !isSuperAdmin) {
      throw new errors.NotAllowed({
        message: 'Only superadmin can replace an engine of other organizations',
        data: {
          objectType: 'organizationId',
          objectId: inputOrgId
        }
      });
    }

    // Get source and replacement engine to check current user can access to this engine.
    // We also check the input organization is a valid org
    await Promise.all([
      serviceContext.dal.organization.getOrganization(context, {
        id: inputOrgId
      }),
      serviceContext.dal.engine.getEngine(context, {
        id: sourceEngineId,
        organizationId: requestorOrgId
      }),
      serviceContext.dal.engine.getEngine(context, {
        id: replacementEngineId,
        organizationId: requestorOrgId
      })
    ]);

    return { sourceEngineId, replacementEngineId, inputOrgId, requestorOrgId };
  }

  async function calculateEngineUsageForOrganization(context, options) {
    const usageSummary = {
      totalCost: 0,
      totalMediaDurationSeconds: 0,
      totalProcessedCPUMilliseconds: 0,
      totalProcessedBytes: 0,
      totalMediaProcessedBytes: 0,
      usageItems: []
    };
    const defaultMediaDurationHour = _.get(
      serviceContext,
      'config.engineUsage.defaultMediaDurationHour',
      1
    );
    const defaultProcessedCPUHour = _.get(
      serviceContext,
      'config.engineUsage.defaultProcessedCPUHour',
      1
    );
    const defaultCPUBasePrice = _.get(
      serviceContext,
      'config.engineUsage.defaultCPUBasePrice',
      50
    ); // default CPUBase is 50 cents per hour ($0.5)
    let task = _.get(options, 'task');
    let job = _.get(options, 'job');
    const jobId = _.get(options, 'jobId', _.get(job, 'id'));
    const taskId = _.get(options, 'taskId', _.get(task, 'id'));
    let calculateTasks = [];

    if (!_.isNil(taskId)) {
      // Calculate the cost for current task
      if (_.isNil(task)) {
        // If task is not passed in, get task from DB
        task = await serviceContext.dal.task.getTask(context, { id: taskId });
      }

      task = await serviceContext.bll.task.populateEngineForTask(context, task);
      calculateTasks.push(task);
    } else if (!_.isNil(jobId)) {
      // Calculate the cost for current job with multiple tasks in job
      let tasksInJob = _.get(job, 'tasks', []);

      if (_.isNil(job) || _.isEmpty(tasksInJob)) {
        // If job and list task is not passed in, get tasks of job from DB
        const res = await serviceContext.dal.task.getTasks(context, {
          limit: 1000,
          jobId
        });

        if (_.isNil(res) || res.count === 0) {
          throw new errors.InvalidInput({
            message: 'Job did not include any tasks inside'
          });
        }

        tasksInJob = res.records;
      }

      // Assign engine for each task
      await Promise.allSettled(
        tasksInJob.map(async function (task) {
          task = await serviceContext.bll.task.populateEngineForTask(
            context,
            task
          );
        })
      );

      calculateTasks = _.concat(calculateTasks, tasksInJob);
    }

    if (_.isEmpty(calculateTasks)) {
      return null;
    }

    _.forEach(calculateTasks, (task) => {
      const processedStats = _.get(task, 'taskOutput.processedStats');
      const mediaProcessedInSecs =
        _.get(task, 'mediaLengthSec') ||
        _.get(processedStats, 'processedMediaSeconds') ||
        0;
      const mediaProcessedBytes =
        _.get(task, 'mediaStorageBytes') ||
        _.get(processedStats, 'processedBytes');
      const cpuProcessedInMilliseconds =
        _.get(processedStats, 'processedCPUMsecs') ||
        _.get(processedStats, 'processedCPUMilliseconds') ||
        0;
      const enginePrice = _.get(task, 'engine.price');
      let mediaProcessedInHours, cpuProcessedInHours;
      let cost = 0;

      // If media duration is unknown use default 1 media-hour.
      if (_.isNil(mediaProcessedInSecs) || mediaProcessedInSecs === 0) {
        mediaProcessedInHours = defaultMediaDurationHour;
      } else {
        mediaProcessedInHours = mediaProcessedInSecs / 3600;
      }

      // If processedCPU is unknown, use default 1 CPU-hour
      if (
        _.isNil(cpuProcessedInMilliseconds) ||
        cpuProcessedInMilliseconds === 0
      ) {
        cpuProcessedInHours = defaultProcessedCPUHour;
      } else {
        cpuProcessedInHours = cpuProcessedInMilliseconds / 3600000;
      }

      if (_.isNil(enginePrice) || enginePrice === 0) {
        // calculate the cost by CPU hour since engine price is not set or available
        cost = defaultCPUBasePrice * cpuProcessedInHours;
      } else {
        cost = enginePrice * mediaProcessedInHours;
      }

      usageSummary.totalCost = mainUtil.round(
        _.get(usageSummary, 'totalCost', 0) + cost,
        10
      );
      usageSummary.totalMediaDurationSeconds =
        _.get(usageSummary, 'totalMediaDurationSeconds', 0) +
        mediaProcessedInSecs; // not sum the default duration
      usageSummary.totalProcessedCPUMilliseconds =
        _.get(usageSummary, 'totalProcessedCPUMilliseconds', 0) +
        cpuProcessedInMilliseconds; // not sum the default cpu-processed
      usageSummary.totalMediaProcessedBytes =
        _.get(usageSummary, 'totalMediaProcessedBytes', 0) +
        mediaProcessedBytes;
      usageSummary.usageItems.push({
        taskId: task.id || task.taskId,
        engineId: task.engineId,
        cost: mainUtil.round(cost, 10),
        mediaDurationSecs: mediaProcessedInSecs,
        cpuProcessedMilliseconds: cpuProcessedInMilliseconds,
        mediaProcessedBytes: mediaProcessedBytes
      });
    });

    return usageSummary;
  }

  return {
    getEngineReplacements,
    replaceEngine,
    removeReplacementEngineId,
    calculateEngineUsageForOrganization
  };
};
