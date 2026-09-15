const _ = require('lodash');
const jsonata = require('jsonata');

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const PENDING_COST_REDIS_KEY = _.get(
    serviceContext,
    'config.engineUsage.pendingCostRedisKey',
    'PendingCostForOrganization'
  );
  const PENDING_COST_REDIS_TTL = _.get(
    serviceContext,
    'config.engineUsage.pendingCostRedisTtlMins',
    10
  );
  const veritoneApiBaseUrl =
    process.env.VERITONE_BASE_URI ||
    serviceContext.config['veritone-api'].baseUri;
  const tokenHelper = require('../modules/core-job-server/engine-runtime/token.js')(
    serviceContext
  );

  async function getReplacementEnginesForTasks(context, tasks, organizationId) {
    const engineIdToReplacementTaskMap = {};
    // Get an array of engine ids in all tasks
    const engineIdToTaskMap = {};
    const engineIds = _.compact(
      _.map(tasks, (task) => {
        engineIdToTaskMap[task.engineId] = task;

        return task.engineId;
      })
    );

    const engineReplacements = await serviceContext.bll.engine.getEngineReplacements(
      context,
      {
        sourceEngineIds: engineIds,
        organizationId
      }
    );

    if (engineReplacements && engineReplacements.count > 0) {
      _.forEach(engineReplacements.records, (engineReplacement) => {
        if (_.indexOf(engineIds, engineReplacement.sourceEngineId) >= 0) {
          const replacementTask = {
            engineId: engineReplacement.replacementEngineId,
            buildId: null
          };

          // evalute the payload by jsonata
          if (engineReplacement.payloadFunc) {
            const expression = jsonata(engineReplacement.payloadFunc);

            if (_.has(engineIdToTaskMap, engineReplacement.sourceEngineId)) {
              const taskMapped =
                engineIdToTaskMap[engineReplacement.sourceEngineId];
              // Only one of taskPayloadString and taskPayload is permitted.
              // So we would need replace one of payload or payloadString depend on the task input
              if (taskMapped.payloadString) {
                const payloadRes = expression.evaluate(
                  JSON.parse(taskMapped.payloadString)
                );

                replacementTask.payloadString = JSON.stringify(payloadRes);
              }

              if (taskMapped.payload) {
                replacementTask.payload = expression.evaluate(
                  taskMapped.payload
                );
              }
            }
          }

          engineIdToReplacementTaskMap[
            engineReplacement.sourceEngineId
          ] = replacementTask;
        }
      });
    }

    return engineIdToReplacementTaskMap;
  }

  async function populateEngineForTask(context, task) {
    if (_.isNil(task.engineId)) {
      throw new errors.InvalidInput({
        message: 'Invalid task with no engine'
      });
    }

    // get engine object for task
    task.engine = await serviceContext.dal.engine.getEngine(context, {
      id: task.engineId
    });

    return task;
  }

  async function updateOrgBillingMetrics(context, organization, usage) {
    let orgMonthlyProcessingMediaHours = 0;
    let orgMonthlyProcessingHoursTotal = 0;
    let orgMonthlyProcessingBytes = 0;

    if (usage.totalMediaDurationSeconds > 0) {
      const mediaLengthHours = usage.totalMediaDurationSeconds / 3600;

      orgMonthlyProcessingMediaHours += mediaLengthHours;
      orgMonthlyProcessingHoursTotal += mediaLengthHours;
    }

    if (usage.totalProcessedCPUMilliseconds > 0) {
      const processedCPUHours = usage.totalProcessedCPUMilliseconds / 3600000;

      orgMonthlyProcessingHoursTotal += processedCPUHours;
    }

    if (usage.totalMediaProcessedBytes > 0) {
      orgMonthlyProcessingBytes += usage.totalMediaProcessedBytes;
    }

    await serviceContext.dal.organization.incrementMonthlyProcessing(context, {
      orgId: organization.id,
      orgMonthlyProcessingMediaHours,
      orgMonthlyProcessingHoursTotal,
      orgMonthlyProcessingTasks: 1,
      orgMonthlyProcessingBytes
    });
  }

  async function fixupMissingOptionsParams(context, options) {
    const requestorApplicationId =
      _.get(context, 'requestContext.tokenInfo.applicationId') ||
      _.get(context, 'requestContext.userInfo.groups[0].applicationId');
    const taskId = _.get(options, 'taskId', _.get(options, 'id'));
    let task = _.get(options, 'task');
    let organization = _.get(options, 'organization');
    let organizationId = _.get(options, 'organizationId');

    if (_.isNil(taskId)) {
      serviceContext.logger.error('updateOrgBillingForTask: missing taskId', {
        options
      });
      return null;
    }

    if (_.isNil(task)) {
      task = await serviceContext.dal.task.getTask(context, { id: taskId });

      if (!task) {
        serviceContext.logger.error(
          'updateOrgBillingForTask: invalid task input',
          {
            options
          }
        );
        return null;
      }
      options.task = task;
    }

    const applicationId = task.applicationId || requestorApplicationId;

    if (_.isNil(organizationId) && !_.isNil(applicationId)) {
      organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
        applicationId
      );
    }

    if (_.isNil(organization) && !_.isNil(organizationId)) {
      organization = await serviceContext.dal.organization.getOrganization(
        context,
        { id: organizationId, isSuperAdmin: true },
        true
      );
      options.organization = organization;
    }

    if (_.isNil(organization)) {
      serviceContext.logger.error(
        'updateOrgBillingForTask: missing organization',
        { options }
      );
      return null;
    }
    return organization;
  }

  async function updateOrgBillingForTask(context, options) {
    const organization = await fixupMissingOptionsParams(context, options);

    const usage = await serviceContext.bll.engine.calculateEngineUsageForOrganization(
      context,
      options
    );

    // return when the task had no usage information
    if (_.isNil(usage)) {
      return;
    }

    await updateOrgBillingMetrics(context, organization, usage);

    if (usage.totalCost > 0) {
      const asyncOperations = [];
      // update the monthly charge
      asyncOperations.push(
        serviceContext.dal.organization.incrementMonthlyCharge(
          context,
          organization.id,
          usage.totalCost
        )
      );

      // calculate remaining budget
      if (_.get(organization, 'isLimitEnforced', false)) {
        let orgPendingCost = await serviceContext.redisCache.get(
          PENDING_COST_REDIS_KEY,
          organization.id || organization.organizationId
        );
        let orgRemainingBudget = _.get(organization, 'remainingBudget', 0);
        serviceContext.logger.trace('calculated task usage for org', {
          taskId: options.taskId,
          organizationId: organization.id,
          taskUsage: usage
        });

        // decrement the pending cost for org
        if (orgPendingCost >= usage.totalCost) {
          orgPendingCost = orgPendingCost - usage.totalCost;
        } else {
          orgPendingCost = 0;
        }

        // decrement the remaining budget for org
        if (orgRemainingBudget >= usage.totalCost) {
          orgRemainingBudget = orgRemainingBudget - usage.totalCost;
        } else {
          orgRemainingBudget = 0;
        }

        // Save the new pendingCost to Redis
        serviceContext.redisCache.set(
          PENDING_COST_REDIS_KEY,
          organization.id || organization.organizationId,
          orgPendingCost,
          null,
          PENDING_COST_REDIS_TTL
        );
        // Save the new remaining budget and monthly charge to DB
        asyncOperations.push(
          serviceContext.dal.organization.setOrgRemainingBudget(
            context,
            organization.id,
            orgRemainingBudget
          )
        );
      }

      // execute async operations in parallel
      await Promise.all(asyncOperations);
    }

    return usage;
  }

  async function createTaskPayload(context, engine, task) {
    const token = await tokenHelper.createJwtToken(context, engine, task);
    const payload = _.pickBy(
      _.assign(
        JSON.parse(JSON.stringify(task.taskPayload || {})),
        _.pick(task, [
          'applicationId',
          'organizationId',
          'jobId',
          'taskId',
          'recordingId'
        ]),
        {
          assetId: _.get(task, 'sourceAssetId'),
          polling: _.get(task, 'pollingPayload'),
          veritoneApiBaseUrl: veritoneApiBaseUrl,
          token
        }
      ),
      _.identity
    );

    if (task.taskPayload) {
      if (_.isString(task.taskPayload.organizationId)) {
        task.taskPayload.organizationId = parseInt(
          task.taskPayload.organizationId
        );
      }
      payload.taskPayload = task.taskPayload;
    }

    return payload;
  }

  return {
    getReplacementEnginesForTasks,
    populateEngineForTask,
    updateOrgBillingForTask: updateOrgBillingForTask,
    createTaskPayload
  };
};
