const _ = require('lodash');
const moment = require('moment');
const Handlebars = require('handlebars');
const helpers = require('@veritone/core-server-base/handlebars-helpers');
helpers.register(Handlebars);
const { validateCreateJobInput } = require('@veritone/core-server-base/shared-input-validators.js')

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')(serviceContext);
  const Task = require('../modules/core-job-server/model/task');
  const errors = require('../error')(serviceContext.config);
  const STREAM_INGESTOR_ENGINE_ID = _.get(
    serviceContext,
    'config.dag.siEngineId',
    '8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440'
  ); // stream-ingestor engine
  const OUTPUT_WRITER_ENGINE_ID = _.get(
    serviceContext,
    'config.dag.owEngineId',
    '8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3'
  );
  const SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID = _.get(
    serviceContext,
    'config.dag.si2PlaybackEngineId',
    '352556c7-de07-4d55-b33f-74b1cf237f25'
  );
  const PULL_ENGINE_CATEGORY_ID = _.get(
    serviceContext,
    'config.dag.pullCategoryId',
    '4b150c85-82d0-4a18-b7fb-63e4a58dfcce'
  );
  const INGESTION_ENGINE_CATEGORY_ID = _.get(
    serviceContext,
    'config.dag.ingestionCategoryId',
    '4be1a1b2-653d-4eaa-ba18-747a265305d8'
  );
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

  async function detectIsV3Job(context, job, organizationId) {
    let isV3Job = true;
    const nonV3EngineIds = [];
    const v3EngineIds = [];

    if (!job || !organizationId) {
      return { isV3Job: false, nonV3EngineIds };
    }

    if (!job.tasks || _.isEmpty(job.tasks)) {
      return { isV3Job: false, nonV3EngineIds };
    }

    await Promise.allSettled(
      job.tasks.map(async function forEachTask(task) {
        const engineId = _.get(task, 'engineId');
        const engine = await serviceContext.dal.engine.getEngine(context, {
          id: engineId,
          organizationId
        });

        if (engine.edgeVersion !== 3) {
          isV3Job = false;
          nonV3EngineIds.push(engineId);
        } else {
          v3EngineIds.push(engineId);
        }
      })
    );

    return { isV3Job, nonV3EngineIds, v3EngineIds };
  }

  async function placeVariablesToDags(context, options) {
    const { engineIdToTaskMap, lstEngines, job, organizationId } = options;
    const engineIdToDagMap = {};

    await Promise.all(
      lstEngines.records.map(async function forEachEngine(engine) {
        const task = engineIdToTaskMap[engine.id];
        const template = job.targetId
          ? engine.singleEngineTdoJobJson
          : engine.singleEngineUploadJobJson;
        let templateString, templateObj;

        // If a singleEngineDAG does not exist for any engine,
        // return an error to the client
        if (!template) {
          throw new errors.NotAllowed({
            message: `Engine ${engine.id} does not specify a default single job template`,
            data: {
              engineId: engine.id
            }
          });
        }

        if (_.isString(template.template) && template.templateLanguage) {
          // We currently only support Handlebars language
          if (template.templateLanguage !== 'Handlebars') {
            throw new errors.NotImplemented({
              message: `Engine ${engine.id} single job template uses unsupported templating language`,
              data: {
                engineId: engine.id,
                templateLanguage: template.templateLanguage
              }
            });
          }

          templateString = template.template;

          // Try to get the nested template inside the templateString if have.
          // By parsing the current template string.
          // If no, continue to compile the templateString with Handlebars
          try {
            templateObj = JSON.parse(templateString);
          } catch (err) {
            serviceContext.logger.info(
              `The template string is in HandleBars language. 
        It is not in JSON format and not include the nested template.
        Continue working with the current template string`
            );
          }

          if (templateObj) {
            templateString = templateObj.template;
          }
        } else {
          templateString = JSON.stringify(template);
        }

        const hTemplate = Handlebars.compile(templateString, {
          strict: true
        });

        let uploadUrl = job.uploadUrl;

        // The uploadUrl should be defined when the job.targetId is undefined with new upload job
        if (!job.targetId && !uploadUrl) {
          throw new errors.InvalidInput({
            message: 'uploadUrl is required when creating new upload job',
            data: {
              targetId: job.targetId,
              uploadUrl: job.uploadUrl
            }
          });
        }

        // Retrive the TDO media asset uri in case reproccess job
        if (!uploadUrl) {
          if (organizationId && !job.applicationId) {
            job.applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
              organizationId
            );
            job.applicationIds = [job.applicationId];
          }

          const tdo = await serviceContext.dal.tdo.getTDO(context, {
            id: job.targetId,
            includePublic: true,
            applicationIds: job.applicationIds
          });
          const mediaAssetUri = await serviceContext.dal.v3Job.getJobStreamUrl(
            context,
            tdo,
            true
          );

          if (mediaAssetUri) {
            uploadUrl = mediaAssetUri;
          }
        }

        const taskPayload = task.payloadString
          ? JSON.parse(task.payloadString)
          : task.payload;
        const params = _.assign(
          {},
          taskPayload,
          _.pickBy(
            {
              ENGINE_ID: engine.id,
              TARGET_ID: job.targetId,
              TDO_ID: job.targetId,
              notificationUri: job.notificationUris,
              clusterId: job.clusterId,
              UPLOAD_URL: uploadUrl
            },
            _.identity
          )
        );
        let engineDag;

        try {
          const engineDagString = hTemplate(params);

          engineDag = JSON.parse(engineDagString);

          if (!_.isObject(engineDag)) {
            throw new Error('template failed to generate valid JSON');
          }
        } catch (err) {
          serviceContext.logger.error(
            'Failed to place variables to engine dag',
            {
              err,
              params,
              template
            }
          );
          throw new errors.InternalServerError({
            message: 'Invalid engine DAG template',
            data: {
              engineId: engine.id,
              error: err.message
            }
          });
        }

        engineIdToDagMap[engine.id] = engineDag;
      })
    );

    return engineIdToDagMap;
  }

  async function mergeSingleEngineDags(context, options) {
    const { engineIdToDagMap, organizationId } = options;
    const engineIdToEngineMap = {};
    let mergedTasks = [];
    let mergedRoutes = [];

    let adapterTasks = [];
    let siTasks = [];
    let cognitiveEngineTasks = [];
    let owTasks = [];
    let playbackTasks = [];
    let allEngineIds = [];

    _.forEach(Object.values(engineIdToDagMap), (engineDag) => {
      allEngineIds = _.uniq(
        _.concat(
          allEngineIds,
          _.compact(_.map(engineDag.tasks, (task) => task.engineId))
        )
      );
    });

    const lstAllEngines = await serviceContext.dal.engine.getEngines(context, {
      ids: allEngineIds,
      organizationId,
      limit: allEngineIds.length
    });

    _.forEach(lstAllEngines.records, (engine) => {
      engineIdToEngineMap[engine.id] = engine;
    });

    _.forEach(Object.keys(engineIdToDagMap), (keyEngineId) => {
      const dag = engineIdToDagMap[keyEngineId];
      const routes = dag.routes;
      const tasks = dag.tasks;

      _.forEach(tasks, (task) => {
        const taskEngine = engineIdToEngineMap[task.engineId];
        const categoryId = _.get(taskEngine, 'categoryId');

        if (categoryId === PULL_ENGINE_CATEGORY_ID) {
          adapterTasks.push(task);
          return;
        } else if (
          categoryId === INGESTION_ENGINE_CATEGORY_ID &&
          task.engineId !== STREAM_INGESTOR_ENGINE_ID
        ) {
          // The Stream Ingestor Engine also have Ingestion category.
          // But it is not a Playback Engine
          playbackTasks.push(task);
          return;
        }

        if (!_.isEmpty(routes)) {
          renameIoFolders(routes, task, keyEngineId);
        }

        switch (task.engineId) {
          case STREAM_INGESTOR_ENGINE_ID:
            siTasks.push(task); // Assign SI2 tasks
            break;
          case OUTPUT_WRITER_ENGINE_ID:
            owTasks.push(task); // Assign OW task
            break;
          default:
            cognitiveEngineTasks.push(task);
            break;
        }
      });
    });

    adapterTasks = _.uniqBy(adapterTasks, 'engineId');

    if (!_.isEmpty(adapterTasks) && adapterTasks.length > 1) {
      throw new errors.InvalidInput({
        message: 'Invalid DAG: engines with different adapters',
        data: {
          adapterEngineIds: _.map(adapterTasks, (task) => task.engineId)
        }
      });
    }

    const adapterTask = !_.isEmpty(adapterTasks) ? _.first(adapterTasks) : null;

    // SI2 duplicate remove
    siTasks = _.uniqBy(siTasks, (task) =>
      [task.engineId, task.payload.ffmpegTemplate].join()
    );

    // Remove duplicate for engine tasks
    cognitiveEngineTasks = _.uniqBy(cognitiveEngineTasks, 'engineId');

    // Add WSA to mergedTasks
    if (adapterTask) {
      mergedTasks.push(adapterTask);
    }

    if (!_.isEmpty(playbackTasks)) {
      mergedTasks = _.concat(mergedTasks, playbackTasks);
    }

    mergedTasks = _.concat(mergedTasks, siTasks);

    // Add cognitive engine tasks
    mergedTasks = _.concat(mergedTasks, cognitiveEngineTasks);

    // Add OW to mergedTasks
    if (owTasks) {
      mergedTasks = _.concat(mergedTasks, owTasks);
    }

    // merge routes
    _.forEach(Object.values(engineIdToDagMap), (dag) => {
      mergedRoutes = _.uniqBy(_.concat(mergedRoutes, dag.routes), (route) =>
        [route.parentIoFolderReferenceId, route.childIoFolderReferenceId].join(
          ','
        )
      );
    });

    return {
      mergedTasks,
      mergedRoutes
    };
  }

  function renameIoFolders(routes, task, cognitiveEngineId) {
    const ffmpegTemplate = _.get(task, 'payload.ffmpegTemplate', '');

    // rename for routes
    routes.forEach((route) => {
      const taskInputFolder = _.find(task.ioFolders, {
        type: 'input'
      });
      const taskOutputFolder = _.find(task.ioFolders, {
        type: 'output'
      });
      const outputReferenceId = _.get(taskOutputFolder, 'referenceId');
      const inputReferenceId = _.get(taskInputFolder, 'referenceId');

      switch (task.engineId) {
        case STREAM_INGESTOR_ENGINE_ID:
          if (route.parentIoFolderReferenceId === outputReferenceId) {
            route.parentIoFolderReferenceId = `${outputReferenceId}-${ffmpegTemplate}`;
          }

          if (route.childIoFolderReferenceId === inputReferenceId) {
            route.childIoFolderReferenceId = `${inputReferenceId}-${ffmpegTemplate}`;
          }
          break;
        case OUTPUT_WRITER_ENGINE_ID:
          if (route.childIoFolderReferenceId === inputReferenceId) {
            route.childIoFolderReferenceId = `ow-input-${cognitiveEngineId}`;
          }
          break;
        case SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID:
          if (route.parentIoFolderReferenceId === outputReferenceId) {
            route.parentIoFolderReferenceId = 'pb-output';
          }

          if (route.childIoFolderReferenceId === inputReferenceId) {
            route.childIoFolderReferenceId = 'pb-input';
          }
          break;
        default:
          if (route.parentIoFolderReferenceId === outputReferenceId) {
            route.parentIoFolderReferenceId = `${outputReferenceId}-${task.engineId}`;
          }

          if (route.childIoFolderReferenceId === inputReferenceId) {
            route.childIoFolderReferenceId = `${inputReferenceId}-${task.engineId}`;
          }
          break;
      }
    });

    // rename for task ioFolders
    switch (task.engineId) {
      case STREAM_INGESTOR_ENGINE_ID:
        task.ioFolders.forEach((ioFolder) => {
          ioFolder.referenceId = `${ioFolder.referenceId}-${ffmpegTemplate}`;
        });
        break;
      case OUTPUT_WRITER_ENGINE_ID:
        task.ioFolders.forEach((ioFolder) => {
          if (ioFolder.type === 'input')
            ioFolder.referenceId = `ow-input-${cognitiveEngineId}`;
        });
        break;
      case SI2_PLAYBACK_SEGMENT_CREATOR_ENGINE_ID:
        task.ioFolders.forEach((ioFolder) => {
          if (ioFolder.type === 'input') ioFolder.referenceId = 'pb-input';
          if (ioFolder.type === 'output') ioFolder.referenceId = 'pb-output';
        });
        break;
      default:
        task.ioFolders.forEach((ioFolder) => {
          ioFolder.referenceId = `${ioFolder.referenceId}-${task.engineId}`;
        });
        break;
    }
  }

  async function preprocessJob(context, options) {
    // feature flag enable converting engine to DAG in DC config
    const enableConvertEnginesToDAG = _.get(
      serviceContext,
      'config.featureFlags.enableConvertEnginesToDAG',
      false
    );
    // feature flag enable engine replacement by organization
    const enableConvertEnginesToDAGByOrg = await mainUtil.isOrgSettingEnabled(
      context,
      'enableConvertEnginesToDAG'
    );
    const { job, organizationId } = options;
    validateCreateJobInput(job, errors.InvalidInput);
    const deepCloneJob = _.cloneDeep(job);

    if (!deepCloneJob) {
      throw new errors.InvalidInput({
        message: 'Invalid input job',
        data: { inputJob: deepCloneJob }
      });
    }

    // check the feature flag
    if (enableConvertEnginesToDAG || enableConvertEnginesToDAGByOrg) {
      // replacement engines
      const engineIdToReplacementTask = await serviceContext.bll.task.getReplacementEnginesForTasks(
        context,
        deepCloneJob.tasks,
        organizationId
      );

      // Replace the engineId and evalute the taskPayload
      _.forEach(deepCloneJob.tasks, (task, i) => {
        if (engineIdToReplacementTask[task.engineId]) {
          const replacementTask = engineIdToReplacementTask[task.engineId];

          deepCloneJob.tasks[i] = new Task(_.assign({}, task, replacementTask));
        }
      });

      // Check job.routes is empty, will do the conversion
      // If no, return the origin Job
      if (_.isEmpty(deepCloneJob.routes)) {
        // check all engines is V3/detect current job is V3 job
        const { isV3Job, nonV3EngineIds, v3EngineIds } = await detectIsV3Job(
          context,
          deepCloneJob,
          organizationId
        );

        if (isV3Job) {
          try {
            // lookups single engine dags
            const engineIdToTaskMap = {};
            const engineIds = _.compact(
              _.map(deepCloneJob.tasks, (task) => {
                engineIdToTaskMap[task.engineId] = task;

                return task.engineId;
              })
            );
            const lstEngines = await serviceContext.dal.engine.getEngines(
              context,
              { ids: engineIds, organizationId }
            );

            // Place variables to engine dags
            const engineIdToDagMap = await placeVariablesToDags(context, {
              engineIdToTaskMap,
              lstEngines,
              job: deepCloneJob,
              organizationId
            });

            // merge single engine dags
            const { mergedTasks, mergedRoutes } = await mergeSingleEngineDags(
              context,
              {
                engineIdToDagMap,
                organizationId
              }
            );

            deepCloneJob.tasks = mergedTasks;
            deepCloneJob.routes = mergedRoutes;
          } catch (error) {
            // Log the error if one of the conversion step fail
            // And return the origin Job
            serviceContext.logger.error(
              'Error when converting Engines to DAG',
              error
            );

            // Add the warnings to response and return the origin Job
            if (!context.requestInfo.warnings)
              context.requestInfo.warnings = [];

            context.requestInfo.warnings.push({
              event: 'warning',
              errorName: error.name,
              message: error.message,
              data: error.data
            });

            return job;
          }
        } else if (_.isEmpty(v3EngineIds)) {
          // no V3 engines are detected in this case
          // so we return the origin Job and don't preprocess anything
          serviceContext.logger.warn(
            'Not a V3 Job, no input V3 engine',
            nonV3EngineIds
          );
          return job;
        } else {
          throw new errors.InvalidInput({
            message: 'Not all engines are V3',
            data: {
              nonV3EngineIds
            }
          });
        }
      } else {
        serviceContext.logger.warn(
          'job.routes are defined, so ignore the conversion to DAG',
          deepCloneJob.routes
        );
        return deepCloneJob;
      }
    }
    // return the new clone job
    return deepCloneJob;
  }

  async function checkProcessingLimitsForOrg(context, options) {
    let organization = _.get(options, 'organization');
    const organizationId = _.get(options, 'organizationId');

    if (_.isNil(organization) && !_.isNil(organizationId)) {
      organization = await serviceContext.dal.organization.getOrganization(
        context,
        { id: organizationId },
        true
      );
      options.organization = organization;
    }

    if (_.isNil(organization)) {
      throw new errors.InvalidInput({
        message: 'Organization is required when calculating the process limit'
      });
    }

    const orgFeatures = _.get(
      organization,
      'jsondata.features',
      _.get(organization, 'kvp.features')
    );
    const pausedProcessing = _.get(
      organization,
      'kvp.billing.pausedProcessing'
    );
    let allowEngineOverage = false;
    let orgRemainingBudget = _.get(organization, 'remainingBudget', 0);
    let orgIsLimitEnforced = _.get(organization, 'isLimitEnforced', false);

    if (orgFeatures) {
      if (_.isBoolean(orgFeatures.allowEngineOverage)) {
        allowEngineOverage = orgFeatures.allowEngineOverage;
      }
    }

    if (allowEngineOverage || orgIsLimitEnforced === false) {
      return;
    }

    if (pausedProcessing) {
      serviceContext.logger.debug(
        'processing is paused',
        organization.organizationId
      );
      throw new errors.ObjectLimitExceeded({
        message:
          `Engine processing is paused for the organization ${organization.id} ` +
          `(${organization.organizationName}) because usage limits have been ` +
          `exceeded. Purchase more capacity or contact Veritone support to continue.`
      });
    }

    let orgPendingCost = await serviceContext.redisCache.get(
      PENDING_COST_REDIS_KEY,
      organization.id || organization.organizationId
    );

    if (!checkOrgForBillingLimitEnforcement(organization)) {
      // No limit enforcement, skip pending charge calculation
      return;
    }

    const invalidBillingPeriod = checkOrgForInvalidBillingPeriod(organization);

    if (invalidBillingPeriod) {
      serviceContext.logger.error(
        'invalid billing period for organization',
        organization.id
      );
      throw new errors.NotAllowed({
        message: 'invalid billing period'
      });
    }

    const usage = await serviceContext.bll.engine.calculateEngineUsageForOrganization(
      context,
      options
    );

    // return when the limitEnforced was disabled
    if (_.isNil(usage)) {
      return;
    }

    const totalCostWithPending = usage.totalCost + (orgPendingCost || 0);

    if (totalCostWithPending > 0 && totalCostWithPending > orgRemainingBudget) {
      serviceContext.logger.trace(
        'engine process limit exceeded for organization',
        organization.id
      );

      throw new errors.UnavailableFunds();
    }

    // Update the pending cost for current organization.
    // User don't need to wait this proccess
    // If the pending cost was not exists in Redis, we set it.
    // Otherwise, increment by key to avoid race condition.
    if (_.isNil(orgPendingCost)) {
      serviceContext.redisCache.set(
        PENDING_COST_REDIS_KEY,
        organization.id,
        totalCostWithPending,
        null,
        PENDING_COST_REDIS_TTL
      );
    } else {
      serviceContext.redisCache.incrByFloat(
        PENDING_COST_REDIS_KEY,
        organization.id,
        usage.totalCost
      );
    }
  }

  function checkOrgForInvalidBillingPeriod(organization) {
    let startDate = _.get(organization, 'jsondata.billing.startDate');
    let expirationDate = _.get(organization, 'jsondata.billing.expirationDate');
    let invalidBillingPeriod = false;

    if (startDate || expirationDate) {
      // In case startDate or expirationDate is undefined,
      // it will return true, since moment(undefined) evaluates as moment()
      invalidBillingPeriod = !moment().isBetween(
        startDate,
        expirationDate,
        undefined,
        '[]'
      );
    }

    return invalidBillingPeriod;
  }

  function checkOrgForBillingLimitEnforcement(organization) {
    return _.get(organization, 'isLimitEnforced', false);
  }

  return {
    detectIsV3Job,
    preprocessJob,
    checkProcessingLimitsForOrg,
    // unit-test only
    placeVariablesToDags,
    mergeSingleEngineDags,
    renameIoFolders,
    checkOrgForInvalidBillingPeriod
  };
};
