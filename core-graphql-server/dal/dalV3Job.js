/*eslint no-undef: "error"*/
/*eslint no-const-assign: "error"*/
const _ = require('lodash');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');

//const HandlebarHelpers = require('helpers-for-handlebars');
const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
const mapper = require('./mapper.js');

const Handlebars = require('handlebars');
const helpers = require('@veritone/core-server-base/handlebars-helpers.js');
helpers.register(Handlebars);
const { validateCreateJobInput } = require('@veritone/core-server-base/shared-input-validators.js')

const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map');

module.exports = function createFunction(serviceContext) {
  const { logger, config } = serviceContext;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const util = require('./util.js')(config, serviceContext);
  const disablePrimaryAssetTypeEnforcement = _.get(
    serviceContext,
    'config.featureFlags.disablePrimaryAssetTypeEnforcement',
    false
  );
  const Job = require('../modules/core-job-server/model/job');
  const Task = require('../modules/core-job-server/model/task');
  const engineLibraryModelValidatorGen = require('../modules/core-job-server/helper/engine-library-model-validator');
  const STREAM_INGESTOR_ENGINE_ID = 'ea0ada2a-7571-4aa5-9172-b5a7d989b041'; // stream-ingestor engine
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );
  const DEFAULT_EDGE_VERSION = 3;

  function generateTaskId(jobId) {
    if (dateIdUtil.isValidDateId(jobId)) {
      return dateIdUtil.generateTaskId(jobId);
    } else {
      return jobId + '-' + uuidv4();
    }
  }

  async function populateTaskWithEngineBuildInfo(
    context,
    task,
    organizationId
  ) {
    const engineId = task.engineId;
    const buildId = task.buildId;

    const engines = await serviceContext.dal.engine.getEngines(context, {
      id: engineId,
      organizationId: organizationId
    });
    if (engines.count === 0) {
      throw new errors.NotFound({
        message: 'Engine not found',
        data: {
          engineId
        }
      });
    }
    task.engine = _.get(engines, 'records[0]');

    if (task.testTask) {
      return;
    }

    let build;

    if (buildId) {
      if (
        organizationId &&
        organizationId !== task.engine.ownerOrganizationId
      ) {
        throw new errors.NotAllowed({
          message: 'No access to engine build',
          data: {
            buildId
          }
        });
      }

      build = await serviceContext.dal.engine.getEngineBuild(
        {
          id: buildId,
          engineId
        },
        context
      );

      if (build.status !== 'deployed') {
        throw new errors.NotAllowed({
          message: `The input build of engine ${engineId} must be in "deployed" status`,
          data: {
            engineId,
            buildId: build.id,
            buildStatus: build.status
          }
        });
      }
    } else {
      const builds = await serviceContext.dal.engine.getEngineBuilds(
        {
          engineId,
          status: ['deployed'],
          limit: 1
        },
        context
      );

      if (builds.count === 0) {
        throw new errors.NotFound({
          message: 'No deployed build for engine',
          data: {
            engineId
          }
        });
      }

      build = _.get(builds, 'records[0]');
    }
    task.build = build;

    task.category = await serviceContext.dal.engineCategory.getEngineCategory(
      context,
      {
        id: task.engine.categoryId
      }
    );
    task.engineCategoryId = task.engine.categoryId;
  }

  const messageUtil = serviceContext.messageUtil;
  async function emitCreateJobEvent(context, payload = {}, error = null) {
    const jobId = !error ? _.get(payload, 'id') : null;
    const defaultTimestamp = moment().unix();
    const timestampMs = !error
      ? util.dateTimeToISOString(
          _.get(payload, 'createdDateTime', defaultTimestamp)
        )
      : null;

    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.JobCreated.event,
      type: eventsMap.JobCreated.type,
      job_id: jobId,
      jobId: jobId,
      timestampMs,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        jobId,
        error,
        'create',
        null,
        `${!error ? `Created job ${jobId}` : 'Failed to create a new job'}`
      )
    };
    messageUtil.emitPublicEvent(
      supportedEvents.JobCreated,
      'system',
      context,
      event
    );
  }

  async function createJob(context, args) {
    validateCreateJobInput(args.input, errors.InvalidInput);
    let createdJob, error;
    try {
      createdJob = await createJobDb(context, args);
      return createdJob;
    } catch (err) {
      error = err;
      throw err;
    } finally {
      emitCreateJobEvent(context, createdJob, error);
    }
  }

  async function createJobDb(context, args) {
    const { input: jobBody } = args;
    const job = new Job(jobBody);
    const specificTdoId = jobBody.targetId;

    // if an internal token passed an org ID and application ID isn't set,
    // map them here.
    // we'll create the job in any org, but the target TDO MUST be accessible to the
    // org we're creating the job for.
    if (job.organizationId && !job.applicationId) {
      job.applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
        job.organizationId
      );
      job.applicationIds = [job.applicationId];
    }

    if (!job.applicationId) {
      throw new errors.InvalidInput({
        message:
          'createJob can only be invoked in the context of ' +
          'an organization. An organization-scoped authentication token ' +
          'such as a user session or API key is required.'
      });
    }

    let tdo = null;
    if (job.targetId) {
      if (job.target) {
        throw new errors.InvalidInput({
          message: 'Only target or targetId can be provided, not both.'
        });
      }
      // first we need to retrieve the recording/TDO and get
      // its applicationId. core-job-server will reject the request if the
      // app ID on the createJob request doesn't match the app ID
      // on the recording.
      // core-job-server handles this by setting appId from the token if
      // it isn't passed by the caller. this might not be robust, especially
      // as token formats change. so we'll fetch the recording.
      // the recording query is filtered by app ID.
      tdo = await serviceContext.dal.tdo.getTDO(context, {
        id: job.targetId,
        includePublic: true,
        applicationIds: job.applicationIds
      });

      if (job.isReprocessJob) {
        const streamUrl = await getJobStreamUrl(context, tdo);
        if (streamUrl) job.streamUrl = streamUrl;
      }
    } else if (job.target) {
      // if create tdo job was provided, create it now.

      // default startDateTime and stopDateTime
      if (!job.target.startDateTime)
        job.target.startDateTime = moment().valueOf();
      if (!job.target.stopDateTime)
        job.target.stopDateTime = job.target.startDateTime;
      if (!job.target.status) {
        job.target.status = 'recorded';
      }

      const tdoInput = Object.assign(
        {
          applicationId: job.applicationId,
          organizationId: job.organizationId
        },
        job.target
      );
      tdo = await serviceContext.dal.tdo.createTDO(context, {
        input: tdoInput
      });
      job.targetId = tdo.id;
    }

    // Get the always-use Cluster for current organization
    // If have the always-use Cluster, it will override the input cluster
    /* The priorities to get clusterId
      1. getClusterByPreference with org_always_run (without value of featureFlags.enableClusterPreference config)
      2. featureFlags.enableClusterPreference = true
        2.1: Get cluster for the org: organization & businessUnit
        2.2: Get default cluster
      
      3. Get from aiware.defaultCluster.id config
    */
    const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
      tdo ? tdo.applicationId : job.applicationId
    );
    const alwaysUseCluster = await serviceContext.dal.cluster.getClusterByPreference(
      context,
      { OrgAlwaysRun: orgId }
    );

    if (alwaysUseCluster) {
      job.clusterId = alwaysUseCluster;
    }

    const enableClusterPreference = _.get(
      config,
      'featureFlags.enableClusterPreference',
      false
    );

    // TODO: We need to filter out adding default cluster to iron jobs
    if (!job.clusterId) {
      if (enableClusterPreference) {
        try {
          const org = await serviceContext.dal.organization.getOrganization(
            context,
            {
              id: orgId
            }
          );
          let clusterPreference = await serviceContext.dal.cluster.getClusterByPreference(
            context,
            {
              organization: orgId,
              businessUnit: org.businessUnit
            }
          );
          // Get default cluster if not found any clusters for the organization
          if (!clusterPreference) {
            clusterPreference = await serviceContext.dal.cluster.getClusterByPreference(
              context,
              {
                default: 'default'
              }
            );
          }
          if (clusterPreference) {
            job.clusterId = clusterPreference;
          }
        } catch (err) {
          // cluster preference err should not fail the creation of the job
          logger.warn('Failed to get cluster preference: ' + err);
        }
      }
      if (!job.clusterId) {
        job.clusterId = _.get(config, 'aiware.defaultCluster.id', null);
      }
    }

    // Not found any value for clusterId
    if (
      _.isNull(job.clusterId) ||
      _.isUndefined(job.clusterId) ||
      job.clusterId === ''
    ) {
      throw new errors.InvalidInput({
        message: `Unable to get clusterId in configs/ settings. Note: config.featureFlags.enableClusterPreference is ${enableClusterPreference}`,
        data: {
          clusterId: job.clusterId
        }
      });
    }

    let clusterObj;
    // note, this checks the _requestor_'s org if allowed to run this cluster
    if (job.organizationId && job.clusterId) {
      clusterObj = await serviceContext.dal.cluster.getCluster(context, {
        id: job.clusterId
      });
    }

    // the engines and the cluster must have the same edge version otherwise an error is thrown
    if (job.tasks && job.tasks.length > 0) {
      const jobAttr = { tasks: job.tasks, clusterId: job.clusterId };
      await validateEngineAndClusterVersion(context, jobAttr, clusterObj);
    }

    if (!job.jobConfig) {
      job.jobConfig = {};
    }

    const authData = mainUtil.getAuthDataForJob(context);
    if (_.isNil(job.jobConfig.authData)) {
      job.jobConfig.authData = authData;
    } else {
      job.jobConfig.authDataLaunch = authData;
    }

    job.contentApplicationId = authData.contentApplicationId;

    // re-assign the job.routes and job.tasks if DAG template is specified
    if (job.dagTemplateId) {
      const dagTemplate = await serviceContext.bll.dagTemplate.getDagTemplate(
        context,
        { id: job.dagTemplateId, organizationId: args.organizationId }
      );
      const template = dagTemplate.dag;

      if (!template) {
        throw new errors.NotAllowed({
          message: 'This DAG template does not specify a valid template',
          data: {
            dagTemplateId: job.dagTemplateId
          }
        });
      }

      let templateString;
      if (_.isString(template.template) && dagTemplate.dagTemplateLanguage) {
        if (dagTemplate.dagTemplateLanguage !== 'Handlebars') {
          throw new errors.NotImplemented({
            message: 'This DAG template uses unsupported templating language',
            data: {
              dagTemplateId: job.dagTemplateId,
              dagTemplateLanguage: dagTemplate.dagTemplateLanguage
            }
          });
        }
        templateString = template.template;
      } else {
        templateString = JSON.stringify(template);
      }

      const hTemplate = Handlebars.compile(templateString, {
        strict: true
      });
      const fields = _.get(job, 'dagTemplateFields', []);
      const uploadUrl = job.streamUrl || job.uploadUrl;
      const params = _assignTemplateFieldValues(fields, {
        ENGINE_ID: job.engineId,
        TARGET_ID: job.targetId,
        TDO_ID: job.targetId,
        UPLOAD_URL: uploadUrl
      });
      let payload;

      try {
        const payloadString = hTemplate(params);

        payload = JSON.parse(payloadString);

        if (!_.isObject(payload)) {
          throw new errors.NotAllowed({
            message: 'the DAG template failed to generate valid JSON',
            data: {
              dagTemplateId: job.dagTemplateId
            }
          });
        }
      } catch (err) {
        logger.error('Failed to generate task from DAG template', {
          err,
          params,
          template
        });
        throw new errors.InternalServerError({
          message: 'Invalid DAG template',
          data: {
            dagTemplateId: job.dagTemplateId,
            error: err.message
          }
        });
      }

      // get
      if (payload) {
        job.routes = _.get(payload, 'routes');
        job.tasks = _.get(payload, 'tasks');
        job.tasks = job.tasks.map((task) => {
          return new Task(task);
        });
      }
    }

    // validating routes and adding them to the jobConfig
    if (job.routes) {
      job.routes.forEach((route) => {
        let parentReferenceIdFound = false;
        let childReferenceIdFound = false;

        job.tasks.forEach((task) => {
          const ioFolders = task.ioFolders || _.get(task, 'payload.ioFolders');
          if (ioFolders) {
            ioFolders.forEach((ioFolder) => {
              if (
                !route.parentIoFolderReferenceId || // handling the case, when parentIoFolderReferenceId is empty
                ioFolder.referenceId === route.parentIoFolderReferenceId
              ) {
                parentReferenceIdFound = true;
              }

              if (
                !route.childIoFolderReferenceId || // handling the case, when childIoFolderReferenceId is empty
                ioFolder.referenceId === route.childIoFolderReferenceId
              ) {
                childReferenceIdFound = true;
              }
            });
          }
        });

        if (!parentReferenceIdFound) {
          throw new errors.InvalidInput({
            message: `ioFolder ${route.parentIoFolderReferenceId} was not found in the tasks definition`,
            data: {
              objectType: 'ioFolder',
              objectId: route.parentIoFolderReferenceId
            }
          });
        }

        if (!childReferenceIdFound) {
          throw new errors.InvalidInput({
            message: `ioFolder ${route.childIoFolderReferenceId} was not found in the tasks definition`,
            data: {
              objectType: 'ioFolder',
              objectId: route.childIoFolderReferenceId
            }
          });
        }
      });

      job.jobConfig.routes = job.routes;
    }

    job.recordingId = job.targetId;
    job.jobConfig.isReprocessJob = !!job.isReprocessJob;
    job.jobConfig.streamUrl = job.streamUrl;
    job.jobConfig.authData = authData;

    if (!_.isNil(job.name)) job.jobConfig.name = job.name;
    if (!_.isNil(job.description)) job.jobConfig.description = job.description;

    let organization = _.get(context, '_authInfo.organization');
    if (_.isNil(organization)) {
      try {
        organization = await serviceContext.dal.organization.getOrganization(
          context,
          {
            id: job.organizationId || job.applicationId
          }
        );
      } catch (err) {
        logger.error('Failed to get organization on create job', err);
      }
    }

    const taskPayloadDefaults = _.get(
      organization,
      'kvp.taskPayloadDefaults',
      {}
    );
    Object.freeze(taskPayloadDefaults);

    /// DELETE ABOVE
    let jobSyncMoment = moment(job.createdDateTime);
    if (!jobSyncMoment.isValid()) {
      jobSyncMoment = moment.utc();
    }
    job.createdDateTime = jobSyncMoment.unix();
    const jobId = job.jobId || dateIdUtil.generateJobId(job.createdDateTime);
    // api token app id overrides job app id

    const taskIdToBuildMap = {};
    const taskIdToEngineMap = {};
    const taskIdToEngineCategoryMap = {};
    const taskValidators = [
      engineLibraryModelValidatorGen(serviceContext.dal.library)
    ];

    const testJob = !!job.testJob;

    // handling cluster groups
    if (job.clusterId) {
      const cluster = await serviceContext.dal.cluster.getCluster(context, {
        id: job.clusterId
      });

      if (!_.isNil(cluster) && cluster.isGroup) {
        const subClusters = await serviceContext.dal.cluster.getClusterList(
          context,
          { clusterGroupId: cluster.id, isGroup: false, status: 'active' }
        );

        if (!subClusters.count) {
          throw new errors.InvalidInput({
            message:
              'The Cluster was passed in is a ClusterGroup, ' +
              'and did not include any active Clusters.',
            data: {
              objectType: 'ClusterGroupId',
              objectId: job.clusterId
            }
          });
        }

        // Get randomly a Cluster in Group
        const randomCluster =
          subClusters.records[Math.floor(Math.random() * subClusters.count)];

        job.clusterId = randomCluster.id;
      }
    }

    await Promise.all(
      job.tasks.map(async (task) => {
        if (!task.taskId) {
          task.taskId = generateTaskId(jobId);
          task.jobId = jobId;
        }

        await populateTaskWithEngineBuildInfo(
          context,
          task,
          job.organizationId
        );
        if (!task.testTask && !task.build) {
          throw new errors.InvalidInput({
            message: 'engine is missing build'
          });
        }
        if (task.build) {
          task.buildId = task.build.buildId;
          taskIdToBuildMap[task.taskId] = task.build;
        }
        taskIdToEngineMap[task.taskId] = task.engine;
        taskIdToEngineCategoryMap[task.taskId] = task.category;

        // populating taskPayload:
        if (task.payloadString && task.payload) {
          throw new errors.InvalidInput({
            message:
              'Only one of taskPayloadString and taskPayload is permitted',
            data: {
              fields: ['payloadString', 'payload'],
              type: 'CreateTask'
            }
          });
        }
        if (task.payloadString) {
          task.taskPayload = Object.assign(
            {},
            JSON.parse(task.payloadString),
            taskPayloadDefaults
          );
        }
        if (task.payload) {
          task.taskPayload = Object.assign(
            {},
            task.payload,
            taskPayloadDefaults
          );
        }

        // identify the tasks without any input/incoming tasks
        if (task.ioFolders && _.isArray(task.ioFolders)) {
          const hasInput = task.ioFolders.find(
            (ioFolder) => ioFolder.type === 'input'
          );

          // if it does not have a `url` field in the payload,
          // set it to a signed primary asset URI
          if (!hasInput && specificTdoId) {
            const payloadUrl =
              _.get(task, 'payload.url') || _.get(task, 'taskPayload.url');

            if (!payloadUrl) {
              const primaryAssetSignedUri = await getJobStreamUrl(
                context,
                tdo,
                true
              );

              _.set(task, 'taskPayload.url', primaryAssetSignedUri);
              _.set(task, 'payload.url', primaryAssetSignedUri);
            }
          }
        }
      })
    );

    for (let i = 0; i < job.tasks.length; i++) {
      const task = job.tasks[i];
      const taskBuild = taskIdToBuildMap[task.taskId];
      const taskEngine = taskIdToEngineMap[task.taskId];

      if (!taskBuild) {
        logger.error(`could not get build for task ${task.taskId}`);
        continue;
      }

      const manifest = taskBuild.manifest;

      if (!manifest) {
        logger.warn(
          `skipping dag for task, could not get manifest build`,
          task
        );
        continue;
      }

      if (taskEngine.id === STREAM_INGESTOR_ENGINE_ID) {
        // remove the v2 Stream Ingestor task from job DAG
        job.tasks.splice(i, 1);
        i--;
      }
    }

    const validatePromise = promisify(job.validate.bind(job));
    const validationErrors = await validatePromise(
      context,
      serviceContext.dal.engine,
      taskValidators
    );

    if (validationErrors) {
      throw new errors.InvalidInput({
        message:
          'The job definition failed validation checks. The problem' +
          'might be caused by incorrect task payloads or missing task' +
          'dependencies. See the validationErrors section for details.',
        data: { validationErrors }
      });
    }

    let { sql, args: sqlArgs } = createJobSQL({
      jobId,
      applicationId: job.applicationId,
      recordingId: job.targetId,
      retries: job.retries ? job.retries : 0,
      bundleId: job.bundleId,
      clusterId: job.clusterId,
      skipDecider: job.skipDecider,
      sourceAssetId: job.sourceAssetId,
      jobTemplateId: job.jobTemplateId,
      scheduledJobId: job.scheduledJobId,
      clientApplicationId: job.applicationId,
      contentApplicationId: job.contentApplicationId,
      organizationId: job.organizationId,
      createdDateTime: job.createdDateTime,
      jobConfig: job.jobConfig,
      notificationUris: job.notificationUris
    });

    if (job.dagTemplateId) {
      const jobDagTemplateSQL = createJobDagTemplateSQL({
        jobId,
        dagTemplateId: job.dagTemplateId,
        createdDateTime: job.createdDateTime,
        offset: sqlArgs.length
      });
      sql += jobDagTemplateSQL.sql;
      sqlArgs = sqlArgs.concat(jobDagTemplateSQL.args);
    }

    await Promise.all(
      job.tasks.map(async (task, index) => {
        task.applicationId = job.applicationId;
        task.recordingId = job.targetId;
        task.taskOrder = index; // task order is not used for task run dependency, just for the ui display
        task.testTask = task.testTask || testJob;
        task.taskPayload = task.taskPayload || {};
        task.taskStatus = task.taskStatus || 'pending';
        task.taskPayload.organizationId = job.organizationId;
        task.createdDateTime = job.createdDateTime;
        task.isClone = false;
        task.notificationUris = _.get(task, 'notificationUris', []);

        // edge jobs require payload
        if (_.get(taskIdToBuildMap[task.taskId], 'runtime.edge', false)) {
          const engine = task.engine;
          task.payload = await serviceContext.bll.task.createTaskPayload(
            context,
            engine,
            task
          );

          if (task.executionPreferences) {
            _.set(
              task,
              'payload.executionPreferences',
              task.executionPreferences
            );
          }
          if (task.ioFolders) {
            _.set(task, 'payload.ioFolders', task.ioFolders);
          }
        }

        const { sql: taskSQL, args: taskArgs } = createTaskSQL(
          task,
          sqlArgs.length
        );
        sql += taskSQL;
        sqlArgs = sqlArgs.concat(taskArgs);
      })
    );

    // Check the process limit for org
    if (!_.isNil(orgId)) {
      await serviceContext.bll.job.checkProcessingLimitsForOrg(context, {
        organizationId: orgId,
        jobId,
        job
      });
    }

    let results;
    try {
      results = await serviceContext.dbConnections['core'].write.map(
        sql,
        sqlArgs,
        mapper.camelizeRootKeys
      );
    } catch (error) {
      logger.error('Error when creating jobs and tasks', error, error.data);
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
      const errorCode = error.code || _.get(error, 'data.internalData.code');

      // catch the job or task partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // try to create the job and task partition table if not exists
        await serviceContext.dal.jobTemplate.validateJobAndTaskTablePartition(
          moment.unix(job.createdDateTime)
        );
        // retry create job and tasks
        results = await serviceContext.dbConnections['core'].write.map(
          sql,
          sqlArgs,
          mapper.camelizeRootKeys
        );
      } else {
        throw new errors.InternalServerError({
          message: 'Failed to create job: ' + (error.message || error)
        });
      }
    }

    const createdJob = results?.[0];
    const createdTasks = results.slice(1);
    createdJob.tasks = createdTasks;

    try {
      serviceContext.coreJob.eventEmitter.emitJobCreatedEvent(
        createdJob.id,
        job.organizationId,
        job.applicationId,
        context
      );
    } catch (err) {
      // event will be stored and retried by ts-messaging
      logger.error(err);
    }

    // audit
    serviceContext.dal.job
      .createJobAudit(context, jobId, 'create', {
        organizationId: job.organizationId
      })
      .catch((err) => {
        logger.error('[createJobAudit] error:', err);
      });

    return createdJob;
  }

  function createJobSQL(job) {
    let jobTable = 'job_new.job';

    if (
      dateIdUtil.isTablePartitionActive(
        config.jobTablePartitionActiveDate,
        job.jobId
      )
    ) {
      jobTable = dateIdUtil.getJobTablePartition(job.jobId);
    }

    const sql = `INSERT INTO ${jobTable}
    (job_id, application_id, recording_id, retries, bundle_id,
      cluster_id, skip_decider, source_asset_id, client_application_id, content_application_id, job_template_id,
      scheduled_job_id, organization_id, job_config, created_date_time, job_status, notification_uris)
    VALUES
    ($1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING
    job_id as id, application_id, recording_id, recording_id as target_id, bundle_id,
      cluster_id, source_asset_id, client_application_id, content_application_id, job_template_id,
      created_date_time, modified_date_time, retries, deleted_date_time,
      scheduled_job_id, organization_id, job_config, notification_uris;`;

    const args = [
      job.jobId,
      job.applicationId,
      job.recordingId,
      job.retries,
      job.bundleId,
      job.clusterId,
      job.skipDecider,
      job.sourceAssetId,
      job.clientApplicationId,
      job.contentApplicationId,
      job.jobTemplateId,
      job.scheduledJobId,
      job.organizationId,
      job.jobConfig,
      job.createdDateTime,
      'pending', // initial job status. we are ignoring the user input for the job status.
      _.isEmpty(job.notificationUris) ? {} : job.notificationUris
    ];

    return {
      sql,
      args
    };
  }

  function createJobDagTemplateSQL({ jobId, dagTemplateId, offset }) {
    const jobDagTemplateTable = 'job_new.job_dag_template';
    const insertItems = [];
    const args = [jobId, dagTemplateId];
    for (let i = 1; i <= args.length; i++) {
      insertItems.push(`$${i + offset}`);
    }
    const sql = `INSERT INTO ${jobDagTemplateTable}
        (job_id, dag_template_id)
      VALUES
        (${insertItems.join(',')})
      ON CONFLICT (job_id, dag_template_id) DO UPDATE
        SET job_id = EXCLUDED.job_id, dag_template_id = EXCLUDED.dag_template_id
      RETURNING job_id, dag_template_id;`;

    return {
      sql,
      args
    };
  }

  const taskReturning = `
    task_id as id, job_id, engine_id, application_id, build_id,
    task_executor, task_executor_id, task_status, task_payload,
    task_order, recording_id, is_clone, task_output,
    source_asset_id, engine_price, customer_price, rate_card_price,
    media_length_secs, failure_type, payload, test_task,
    created_date_time, cancelled_date_time, started_date_time,
    queued_date_time, modified_date_time, completed_date_time,
    asset_selector, standby_for_task_id, parent_task_id, notification_uris`;

  function createTaskSQL(task, offset) {
    let taskTable = 'job_new.task';
    if (
      dateIdUtil.isTaskTablePartitionActive(
        config.taskTablePartitionActiveDate,
        task.taskId
      )
    ) {
      taskTable = dateIdUtil.getTaskTablePartition(task.taskId);
    }

    mainUtil.checkForForbiddenContent('job.task.payload', task.payload);
    mainUtil.checkForForbiddenContent('job.task.payload', task.taskPayload);

    const args = [
      task.taskId,
      task.engineId,
      task.buildId,
      task.jobId,
      task.applicationId,
      task.recordingId,
      task.taskOrder,
      task.taskStatus,
      task.taskPayload,
      task.isClone,
      task.payload,
      task.testTask,
      task.assetSelector,
      task.standbyForTaskId,
      task.parentTaskId,
      task.createdDateTime,
      _.isEmpty(task.notificationUris) ? {} : task.notificationUris
    ];

    const insertItems = [];
    for (let i = 1; i <= args.length; i++) {
      insertItems.push(`$${i + offset}`);
    }

    const sql = `INSERT INTO ${taskTable}
    (task_id, engine_id, build_id, job_id,
      application_id, recording_id, task_order, task_status,
      task_payload, is_clone, payload, test_task, asset_selector,
      standby_for_task_id, parent_task_id, created_date_time, notification_uris)
    VALUES
     (${insertItems.join(',')})
    RETURNING
      ${taskReturning};`;

    return {
      sql,
      args
    };
  }

  async function launchSingleEngineJob(args, context) {
    try {
      const { input: job } = args;
      if (!job.targetId && !job.uploadUrl) {
        throw new errors.InvalidInput({
          message: 'targetId or uploadUrl are required',
          data: {
            job
          }
        });
      }

      let organizationId =
        args.organizationId ||
        _.get(context, '_authInfo.organization.organizationId');

      const engines = await serviceContext.dal.engine.getEngines(context, {
        id: job.engineId,
        organizationId
      });
      if (engines.count === 0) {
        throw new errors.NotFound({
          message: 'Engine not found',
          data: {
            engineId: job.engineId
          }
        });
      }
      const engine = _.get(engines, 'records[0]');
      const template = job.targetId
        ? engine.singleEngineTdoJobJson
        : engine.singleEngineUploadJobJson;

      if (!template) {
        throw new errors.NotAllowed({
          message: 'This engine does not specify a default single job template',
          data: {
            engineId: job.engineId
          }
        });
      }
      let templateString;
      if (_.isString(template.template) && template.templateLanguage) {
        if (template.templateLanguage !== 'Handlebars') {
          throw new errors.NotImplemented({
            message:
              'This engine single job template uses unsupported templating language',
            data: {
              engineId: job.engineId,
              templateLanguage: template.language
            }
          });
        }
        templateString = template.template;
      } else {
        templateString = JSON.stringify(template);
      }

      const hTemplate = Handlebars.compile(templateString, {
        strict: true
      });
      const fields = job.fields || [];

      let uploadUrl = job.uploadUrl;
      if (!uploadUrl) {
        const tdo = await serviceContext.dal.tdo.getTDO(context, {
          id: job.targetId,
          includePublic: true,
          applicationIds: [args.applicationId]
        });
        // TODO: remove the useVirtualAsset flag once the adapter can handle mpeg-dash
        const mediaAssetUri = await getJobStreamUrl(context, tdo, true);
        if (mediaAssetUri) {
          uploadUrl = mediaAssetUri;
        }
      }

      const params = _.assign(
        fields.reduce((c, x) => {
          c[x.fieldName] = x.fieldValue;
          return c;
        }, {}),
        // remove the null/undefined properties
        // to avoid the bug that null/undefined values will
        // overwrite the same values in "fields"
        // For example: "clusterId = null" will overwrite "fields.clusterId = rt-xxx..."
        _.pickBy(
          {
            ENGINE_ID: job.engineId,
            TARGET_ID: job.targetId,
            TDO_ID: job.targetId,
            UPLOAD_URL: uploadUrl,
            clusterId: job.clusterId,
            priority: job.priority
          },
          _.identity
        )
      );

      let payload;
      try {
        const payloadString = hTemplate(params);
        payload = JSON.parse(payloadString);
        if (!_.isObject(payload)) {
          throw new Error('template failed to generate valid JSON');
        }
      } catch (err) {
        logger.error('Failed to generate task from template', {
          err,
          params,
          template
        });
        throw new errors.InternalServerError({
          message: 'Invalid engine template',
          data: {
            engineId: job.engineId,
            error: err.message
          }
        });
      }

      // Check for unresolved template placeholders
      _.assign(
        payload,
        _.pickBy(
          {
            engineId: job.engineId,
            targetId: job.targetId,
            applicationId: args.applicationId,
            organizationId,
            clusterId: job.clusterId,
            notificationUris: job.notificationUris
          },
          _.identity
        )
      );

      const createdJob = await createJob(context, {
        input: payload
      });
      return createdJob;
    } catch (err) {
      emitCreateJobEvent(context, null, err);
      throw err;
    }
  }

  async function getJobStreamUrl(context, tdo, useVirtualAsset) {
    let primaryAsset = await serviceContext.dal.tdo.getPrimaryAsset(
      context,
      tdo,
      {
        assetType: 'media'
      }
    );

    // check for non-media primary assets (like doc/text)
    if (disablePrimaryAssetTypeEnforcement) {
      if (!primaryAsset || !primaryAsset.uri) {
        primaryAsset = await serviceContext.dal.tdo.getPrimaryAsset(
          context,
          tdo,
          {
            assetType: ''
          }
        );
      }
    }

    // Use primary asset if reprocessing and it's not virtual to skip WebStream Adapter
    if (
      primaryAsset &&
      primaryAsset.uri &&
      (useVirtualAsset ||
        _.get(primaryAsset, 'metadata.details.virtualAsset', false) !== true)
    ) {
      return resUtil.getSignedUrl(primaryAsset.uri);
    }
    const streams = await serviceContext.dal.tdo.getStreamData(context, tdo);
    if (streams.length > 0) {
      const preferDashStreams = _.get(
        serviceContext.config,
        'preferDashStreams',
        true
      );
      const dashStreams = _.filter(streams, (s) => {
        return s.protocol === 'dash';
      });
      if (preferDashStreams && dashStreams.length > 0) {
        return dashStreams[0].uri;
      } else {
        // otherwise just pick first one
        return streams[0].uri;
      }
    } else {
      if (primaryAsset && primaryAsset.uri) {
        return resUtil.getSignedUrl(primaryAsset.uri);
      }
    }
    return null;
  }

  function _assignTemplateFieldValues(fields, defaultFieldsObj) {
    if (_.isEmpty(fields)) {
      return defaultFieldsObj;
    }

    const fieldsObj = fields.reduce((c, x) => {
      c[x.fieldName] = x.fieldValue;
      return c;
    }, {});

    return _.assign(
      fieldsObj,
      // remove the null/undefined properties
      // to avoid the bug that null/undefined values will
      // overwrite the same values in "fields"
      // For example: "clusterId = null" will overwrite "fields.clusterId = rt-xxx..."
      _.pickBy(defaultFieldsObj, _.identity)
    );
  }

  async function launchDAGTemplate(context, args) {
    const { input: job } = args;
    const organizationId =
      args.organizationId ||
      _.get(context, '_authInfo.organization.organizationId');
    const requestorAppId =
      args.applicationId ||
      _.get(context, '_authInfo.applicationId') ||
      _.get(context, '_authInfo.groups[0].applicationId');

    if (!job.dagTemplateId) {
      throw new errors.InvalidInput({
        message: 'The dagTemplateId is requied'
      });
    }

    if (!job.targetId && !job.uploadUrl) {
      throw new errors.InvalidInput({
        message: 'targetId or uploadUrl are required',
        data: {
          job
        }
      });
    }

    if (
      !_.isEmpty(job.dagTemplateFields) &&
      !_.every(
        job.dagTemplateFields,
        (item) => _.has(item, 'fieldName') && _.has(item, 'fieldValue')
      )
    ) {
      throw new errors.InvalidInput({
        message: 'The dagTemplateFields format is incorrect.'
      });
    }

    try {
      const jobInput = {
        dagTemplateId: job.dagTemplateId,
        dagTemplateFields: job.dagTemplateFields,
        notificationUris: job.notificationUris,
        clusterId: job.clusterId,
        organizationId,
        applicationId: requestorAppId
      };

      if (job.targetId) {
        jobInput.targetId = job.targetId;
        jobInput.isReprocessJob = true;
      } else {
        jobInput.uploadUrl = job.uploadUrl;
      }

      return createJob(context, {
        input: jobInput,
        organizationId,
        applicationId: requestorAppId
      });
    } catch (err) {
      logger.error('[launchDAGTemplate] error: ', err);
      throw err;
    }
  }

  async function validateEngineAndClusterVersion(context, job, cluster) {
    if (_.isNil(cluster)) {
      cluster = await serviceContext.dal.cluster.getCluster(context, {
        id: job.clusterId
      });
    }

    // if the cluster has an edgeVersion, it needs to be compared with all the edgeVersion of the engines
    if (!_.isNil(cluster) && !_.isNil(cluster.edgeVersion)) {
      const engineIds = [];
      for (const task of job.tasks) {
        if (task.engineId) {
          engineIds.push(task.engineId);
        }
      }

      if (engineIds.length > 0) {
        const engines = await serviceContext.dal.engine.getEngines(context, {
          ids: engineIds
        });

        for (const engine of engines.records) {
          if (_.isNil(engine.edgeVersion)) {
            generateWarningMessageToResponse(context, {
              event: 'warning',
              errorName: 'edgeVersion missed',
              message: `engine ${engine.id} does not have a version defined`
            });
          } else if (engine.edgeVersion !== cluster.edgeVersion) {
            throw new errors.InvalidInput({
              message: `mismatched version between the engine ${engine.id} and the cluster ${cluster.id}`
            });
          } else if (engine.edgeVersion < DEFAULT_EDGE_VERSION) {
            throw new errors.InvalidInput({
              message: `cannot create any jobs for the engine ${engine.id} with edgeVersion less than ${DEFAULT_EDGE_VERSION}`
            });
          }
        }
      }
    } else if (!_.isNil(cluster) && _.isNil(cluster.edgeVersion)) {
      generateWarningMessageToResponse(context, {
        event: 'warning',
        errorName: 'edgeVersion missed',
        message: `cluster ${cluster.id} does not have a version defined`
      });
    }
  }

  function generateWarningMessageToResponse(context, warning) {
    // Add the warnings to response
    if (!context.requestInfo.warnings) {
      context.requestInfo.warnings = [];
    }
    context.requestInfo.warnings.push(warning);
  }

  return {
    createJob,
    launchSingleEngineJob,
    getJobStreamUrl,
    launchDAGTemplate,
    validateEngineAndClusterVersion
  };
};
