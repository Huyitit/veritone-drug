const _ = require('lodash');
const humps = require('humps');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const { promisify } = require('util');
const {
  eventsMap,
  supportedEvents
} = require('@veritone/core-server-base/events-map');
const { validateCreateJobInput } = require('@veritone/core-server-base/shared-input-validators.js')

module.exports = function createFunction(serviceContext) {
  const { config, logger } = serviceContext;
  const errors = require('../error')(config);
  const InvalidInput = errors.InvalidInput;
  const util = require('./util.js')(config, serviceContext);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const mapper = require('./mapper.js');
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const localCache = serviceContext.localCache;
  const Job = require('../modules/core-job-server/model/job');
  const Task = require('../modules/core-job-server/model/task');
  const engineLibraryModelValidatorGen = require('../modules/core-job-server/helper/engine-library-model-validator');
  const coreJobBll = serviceContext.coreJob.jobBll;
  const coreJobEventEmitter = serviceContext.coreJob.eventEmitter;
  const maxDepth = _.get(config, 'maxTaskStandbyDepth', 10);
  const dalPartitionGenerator = _.get(
    serviceContext,
    'app.dalPartitionGenerator'
  );
  const jobAuditAction = {
    create: 'create',
    update: 'update'
  };

  async function _getJobsQuery(context, options) {
    const sqlWhere = [];
    const args = [];
    let jobTable = 'job_new.job';
    let taskTable = 'job_new.task';

    if (options.applicationId && !options.applicationIds) {
      options.applicationIds = [options.applicationId];
    }

    if (!_.isNil(options.hasTargetTDO)) {
      if (options.hasTargetTDO === false) {
        sqlWhere.push(`recording_id IS NULL`);
      } else {
        sqlWhere.push(`recording_id IS NOT NULL`);
      }
    }
    mainUtil.addSqlWhere(
      'j.application_id',
      options.applicationIds,
      sqlWhere,
      args
    );
    mainUtil.addSqlWhere('j.job_id', options.id, sqlWhere, args);

    if (options.id) {
      const allIds = _.isArray(options.id) ? options.id : [options.id];
      let start, end;
      allIds.forEach((id) => {
        // add date range if we got a single ID
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
          `(j.created_date_time BETWEEN $${startParam} AND $${endParam})`
        );
      }

      // select from partition table if we got a single ID
      if (allIds.length === 1) {
        // table name for job
        jobTable = generateJobTablePartition(_.first(allIds));
        const getPartitionTables = await util.getPartitionTables(
          'job',
          'job_new',
          'core'
        );
        // the jobTable is formatted as job_new.job, job_new.job_2024_01_01, ..
        const tableName = jobTable.split('.')[1];
        if (!getPartitionTables.has(tableName)) {
          // Searching data is not in the retention window. Just return empty data
          return {
            offset: 0,
            limit: 30,
            records: [],
            count: 0
          };
        }

        // table name for task
        taskTable = util.generateTaskTablePartition(_.first(allIds));
      }
    }

    mainUtil.addSqlWhere('j.recording_id', options.targetId, sqlWhere, args);
    if (
      !(
        options.dateTimeFilter &&
        options.dateTimeFilter.find((el) => el.field === 'createdDateTime')
      )
    ) {
      // if we have the TDO use it to filter by start time
      let tdo = options.targetTdo;
      if (!tdo && options.targetId) {
        tdo = await serviceContext.dal.tdo.getTDO(context, {
          id: options.targetId,
          includePublic: true,
          applicationId: options.applicationId
        });
      }
      if (tdo && options.targetId && tdo.id !== options.targetId) {
        throw new errors.InternalServerError({
          message:
            'Both TDO and TDO id provided and do not match : ' +
            tdo.id +
            ' !== ' +
            options.targetId
        });
      }

      if (tdo && tdo.createdDateTime) {
        if (!options.dateTimeFilter) options.dateTimeFilter = [];
        options.dateTimeFilter.push({
          field: 'createdDateTime',
          fromDateTime: moment(tdo.createdDateTime)
            .subtract(1, 'day')
            .toISOString()
        });
      }
    }

    mainUtil.addSqlWhere('j.cluster_id', options.clusterId, sqlWhere, args);
    mainUtil.addSqlWhere('j.bundle_id', options.bundleId, sqlWhere, args);
    // combine these parameters to support internal and external parameter usage, just in case
    let sjIds = options.scheduledJobIds;
    if (options.scheduledJobId) {
      if (!sjIds) sjIds = [];
      sjIds.push(options.scheduledJobId);
    }
    // TODO get scheduled jobs and look at created datetime?
    if (sjIds) sjIds = sjIds.map((id) => _.toString(id));
    mainUtil.addSqlWhere('j.scheduled_job_id', sjIds, sqlWhere, args);

    if (options.includeDeleted !== true) {
      sqlWhere.push('j.deleted_date_time IS NULL');
    }

    // always filter out templates.
    // getJobTemplates is a different function in the
    // job templates DAL.
    sqlWhere.push(`j.is_template = false`);

    // if is in progress, add filter over 3 weeks
    // since a job can't be active (pending, running, queued) for that long
    const activeStatus = ['running', 'pending', 'queued'];
    mainUtil.addSqlWhere('j.job_status', options.status, sqlWhere, args);
    if (options.status) {
      const statusArray = _.isArray(options.status)
        ? options.status
        : [options.status];

      if (statusArray.every((status) => activeStatus.includes(status))) {
        if (!options.dateTimeFilter) options.dateTimeFilter = [];
        options.dateTimeFilter.push({
          field: 'createdDateTime',
          fromDateTime: moment().subtract(3, 'weeks').toISOString()
        });
      }
    }

    mainUtil.addDateTimeFilters('j', options, sqlWhere, null, 1000);

    if (options.hasScheduledJobId === true) {
      sqlWhere.push('j.scheduled_job_id IS NOT NULL');
    } else if (options.hasScheduledJobId === false) {
      sqlWhere.push('j.scheduled_job_id IS NULL');
    }
    let engineJoin = '';
    if (
      !_.isEmpty(options.engineIds) ||
      !_.isEmpty(options.engineCategoryIds)
    ) {
      const engineWhere = [];

      if (!_.isEmpty(options.engineIds)) {
        const ids = [];
        for (let ix = 0; ix < options.engineIds.length; ix++) {
          const id = options.engineIds[ix];
          const engine = await serviceContext.dal.engine.getEngine(
            context,
            {
              id: id
            },
            true
          ); // allow cached
          const i = args.push(engine.internalId);
          ids.push(`$${i}`);
          // account for alias IDs
          if (engine.aliasId && engine.internalId !== engine.aliasId) {
            const j = args.push(engine.aliasId);
            ids.push(`$${j}`);
          }
        }
        engineWhere.push(`t.engine_id IN (${ids.join(',')})`);
      }
      if (!_.isEmpty(options.engineCategoryIds)) {
        const ids = [];
        options.engineCategoryIds.forEach((id) => {
          const i = args.push(id);
          ids.push(`$${i}`);
        });
        engineWhere.push(
          `t.engine_id IN (SELECT engine_id from job_new.engine WHERE engine_category_id IN (${ids.join(
            ','
          )}))`
        );
      }
      engineJoin = `
JOIN ${taskTable} t ON t.job_id = j.job_id AND ${engineWhere.join(' AND ')}`;
      mainUtil.addDateTimeFilters('t', options, sqlWhere, null, 1000);
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
      const key = 'j.' + humps.decamelize(field.field);
      orderParts.push(key + ' ' + field.direction);
    });
    let jobDagTemplateJoin = '';
    if (_.isArray(options.dagTemplateIds) && options.dagTemplateIds.length) {
      jobDagTemplateJoin =
        'JOIN job_new.job_dag_template d ON d.job_id = j.job_id';

      args.push(options.dagTemplateIds);
      sqlWhere.push(`d.dag_template_id = ANY($${args.length}::text[])`);
    }

    const jobSelectData = {
      'j.job_id': null,
      'j.application_id': null,
      'j.recording_id': null,
      'j.bundle_id': null,
      'j.cluster_id': null,
      'j.created_date_time': null,
      'j.modified_date_time': null,
      'j.retries': null,
      'j.source_asset_id': null,
      'j.job_template_id': null,
      'j.scheduled_job_id': null,
      'j.skip_decider': null,
      'j.job_status': null,
      'j.deleted_date_time': null,
      'j.job_config': null,
      'j.notification_uris': null,
      'j.content_application_id': null
    };
    if (jobDagTemplateJoin.length) {
      jobSelectData['dag_template_id'] = null;
    }
    let sqlSubquery = `
      SELECT
        ${mainUtil.makeSelectClause(jobSelectData)}
      FROM 
        ${jobTable} j ${engineJoin} ${jobDagTemplateJoin}
      WHERE 
        ${sqlWhere.join(' AND ')}`;

    // skip group by if not joining
    if (engineJoin.length) {
      sqlSubquery += `
        GROUP BY j.job_id${
          jobDagTemplateJoin.length ? ', d.dag_template_id' : ''
        }`;
    }
    let sql = `
      WITH job_sub AS (
        ${sqlSubquery}
      )
      SELECT
        ${mainUtil.makeSelectClause(jobSelectData)}
      FROM 	job_sub j
    `;

    // no order needed for only single job return by jobId
    if (orderParts.length && _.isNil(options.id)) {
      sql += ` 
        ORDER BY ${orderParts.join(', ')}`;
    }

    sql += `
OFFSET ${options.offset || 0}
LIMIT ${options.limit || 30};`;

    return {
      sql,
      args
    };
  }

  async function getJobs(context, options) {
    let res;

    const queryBuilder = await _getJobsQuery(context, options);
    const { sql, args } = queryBuilder || {};
    // Return empty result page if no need to build/exectute the query
    if (_.isNil(sql) || _.isNil(args)) {
      return {
        offset: 0,
        limit: 30,
        records: [],
        count: 0
      };
    }

    try {
      res = await serviceContext.dbConnections['core'].read.map(
        sql,
        args,
        mapper.mapJob
      );
    } catch (err) {
      const errCode = _.get(err, 'data.internalData.code');
      if (errCode === '42P01') {
        logger.error('Partition not found', err);
        throw new errors.NotFound({
          message: 'Partition not found',
          data: {
            objectType: 'Job',
            objectId: options.id
          }
        });
      }
      throw new errors.InternalServerError(err);
    }

    return mainUtil.toPage(options, res);
  }

  async function getJob(context, args) {
    if (!args.id)
      throw new errors.InvalidInput({
        message: 'id parameter on job() is required and must be non-empty.'
      });
    const data = await getJobs(context, args);
    if (data.records && data.records.length) return data.records[0];
    throw new errors.NotFound({
      data: {
        objectId: args.id,
        objectType: 'Job'
      }
    });
  }

  const messageUtil = serviceContext.messageUtil;
  async function emitPublicCreateJobEvent(context, payload = {}, error = null) {
    const jobId = !error ? _.get(payload, 'id') : null;
    const defaultTimestamp = moment().unix();
    const timestampMs = !error
      ? util.dateTimeToISOString(
          _.get(payload, 'createdDateTime', defaultTimestamp)
        )
      : null;
    const event = {
      serviceName: 'core-graphql-server',
      event: eventsMap.JobCreate.event,
      type: eventsMap.JobCreate.type,
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
      supportedEvents.JobCreate,
      'system',
      context,
      event
    );
  }

  async function createJob(context, args) {
    const input = args.input;
    validateCreateJobInput(input, errors.InvalidInput);
    // if an internal token passed an org ID and application ID isn't set,
    // map them here.
    // we'll create the job in any org, but the target TDO MUST be accessible to the
    // org we're creating the job for.
    if (input.organizationId && !input.applicationId) {
      input.applicationId = await serviceContext.dal.application.getAppIdFromOrgId(
        input.organizationId
      );
      input.applicationIds = [input.applicationId];
    }

    if (!input.applicationId) {
      throw new errors.InvalidInput({
        message:
          'createJob can only be invoked in the context of ' +
          'an organization. An organization-scoped authentication token ' +
          'such as a user session or API key is required.'
      });
    }
    let tdo = null;
    if (input.targetId) {
      if (input.target) {
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
        id: input.targetId,
        includePublic: true,
        applicationIds: input.applicationIds
      });

      if (input.isReprocessJob) {
        const primaryAsset = await serviceContext.dal.tdo.getPrimaryAsset(
          context,
          tdo,
          {
            assetType: 'media'
          }
        );

        // Use primary asset if reprocessing and it's not virtual to skip WebStream Adapter
        if (
          primaryAsset &&
          primaryAsset.uri &&
          _.get(primaryAsset, 'metadata.details.virtualAsset', false) !== true
        ) {
          input.streamUrl = await resUtil.getSignedUrl(primaryAsset.uri);
        } else {
          const streams = await serviceContext.dal.tdo.getStreamData(
            context,
            tdo
          );

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
              input.streamUrl = dashStreams[0].uri;
            } else {
              // otherwise just pick first one
              input.streamUrl = streams[0].uri;
            }
          } else {
            if (primaryAsset && primaryAsset.uri) {
              input.streamUrl = await resUtil.getSignedUrl(primaryAsset.uri);
            }
          }
        }
      }
    } else if (input.target) {
      // if create tdo input was provided, create it now.

      // default startDateTime and stopDateTime
      if (!input.target.startDateTime)
        input.target.startDateTime = moment().valueOf();
      if (!input.target.stopDateTime)
        input.target.stopDateTime = input.target.startDateTime;

      const tdoInput = Object.assign(
        {
          applicationId: args.applicationId || input.applicationId,
          organizationId: args.organizationId
        },
        input.target
      );
      tdo = await serviceContext.dal.tdo.createTDO(context, {
        input: tdoInput
      });
      input.targetId = tdo.id;
    }

    const enableClusterPreference = _.get(
      config,
      'featureFlags.enableClusterPreference',
      false
    );
    // TODO: We need to filter out adding default cluster to iron jobs
    if (enableClusterPreference && !input.clusterId) {
      try {
        const orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          tdo ? tdo.applicationId : input.applicationId
        );
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
          input.clusterId = clusterPreference;
        }
      } catch (err) {
        // cluster preference err should not fail the creation of the job
        logger.warn('Failed to get cluster preference: ' + err);
      }
    }

    return createJobImpl(input, context, tdo).catch((err) => {
      // public event
      emitPublicCreateJobEvent(context, input, err);
      throw err;
    });
  }

  async function createJobImpl(input, context, tdo) {
    // tasks really should be required. without it core-job returns error.
    // instead of making breaking change to API we'll throw out here.
    if (!input.tasks || _.isEmpty(input.tasks)) {
      throw new errors.InvalidInput({
        message: 'CreateJob must have at least one task definition.'
      });
    }

    // make a JWT with the TDO as payload. we'll pass this to core-job-server,
    // which can verify the jwt and use the embedded TDO data instead of getting
    // the recording from core-recording-server.
    const token = tdo
      ? jwt.sign(tdo, serviceContext.config.jwt.secret, {
          expiresIn: 300, // 5 min
          jwtid: uuidv4(),
          subject: 'recording'
        })
      : undefined;

    input.jobConfig = input.jobConfig || {};
    input.jobConfig.isReprocessJob = !!input.isReprocessJob;

    if (!_.isNil(input.name)) input.jobConfig.name = input.name;
    if (!_.isNil(input.description))
      input.jobConfig.description = input.description;

    let organization = _.get(context, '_authInfo.organization');
    if (_.isNil(organization)) {
      try {
        organization = await serviceContext.dal.organization.getOrganization(
          context,
          {
            id: input.organizationId || input.applicationId
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

    if (input.clusterId) {
      const cluster = await serviceContext.dal.cluster.getCluster(context, {
        id: input.clusterId
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
              objectId: input.clusterId
            }
          });
        }

        // Get randomly a Cluster in Group
        const randomCluster =
          subClusters.records[Math.floor(Math.random() * subClusters.count)];

        input.clusterId = randomCluster.id;
      }
    }

    const body = {
      status: input.status,
      tasks: input.tasks
        ? _.map(input.tasks, function (task) {
            return mapTaskInput(
              task,
              0, // standbyNestLevel
              taskPayloadDefaults
            );
          })
        : [],
      recordingId: input.targetId || undefined,
      applicationId: tdo ? tdo.applicationId : input.applicationId,
      sourceAssetId: input.sourceAssetId,
      retries: input.retries,
      jobTemplateId: input.templateId,
      scheduledJobId: input.scheduledJobId,
      clusterId: input.clusterId,
      jobConfig: input.jobConfig,
      recordingToken: token,
      jobId: input.id,
      isReprocessJob: input.isReprocessJob,
      streamUrl: input.streamUrl,
      notificationUris: input.notificationUris
    };

    // Check the engine runtime (iron or v2f).
    // Use the newCreateJob for v2 job
    // And only keep run iron job in core-job-server
    const engineIds = _.compact(
      _.map(body.tasks, (task) => task.taskType || task.engineId)
    );
    const lstEngines = await serviceContext.dal.engine.getEngines(context, {
      ids: engineIds,
      organizationId: organization.id
    });

    // Check accessible for input engines
    const accessibleEngineIds = _.flatten(
      _.map(lstEngines.records, (engine) => [
        engine.internalId,
        engine.id,
        engine.aliasId
      ])
    );
    const forbiddenEngineIds = _.difference(engineIds, accessibleEngineIds);

    if (!_.isEmpty(forbiddenEngineIds)) {
      throw new errors.NotAllowed({
        message: `No access to engine${
          forbiddenEngineIds.length > 1 ? 's' : ''
        }: ${forbiddenEngineIds.join(', ')}`,
        data: {
          objectId: 'engineIds',
          objectData: engineIds.join(', ')
        }
      });
    }

    const authData = mainUtil.getAuthDataForJob(context);
    if (_.isNil(authData.applicationId) || _.isEmpty(authData.applicationId)) {
      if (input.scheduledJobAppId) {
        authData.applicationId = input.scheduledJobAppId;
      } else {
        const appApplication = await serviceContext.dal.engine.getAppApplicationFromEngines(
          lstEngines.records
        );
        if (!_.isEmpty(appApplication)) {
          authData.applicationId = appApplication[0].applicationId;
        }
      }
      authData.contentApplicationId = authData.applicationId;
    }

    if (_.isNil(body.jobConfig.authData)) {
      body.jobConfig.authData = authData;
    } else {
      body.jobConfig.authDataLaunch = authData;
    }

    return newCreateJob(context, body);
  }

  async function newCreateJob(context, jobBody) {
    const clientApplicationId = _.get(context, 'jwtToken.clientId'); // client application id (sso.application)
    const requestorOrganization = _.get(context, '_authInfo.organization');
    let organizationId = _.get(requestorOrganization, 'organizationId');
    const job = new Job(jobBody);
    const recordingToken = _.get(jobBody, 'recordingToken');
    let jobSyncMoment = moment(job.createdDateTime);

    job.contentApplicationId =
      _.get(jobBody, 'jobConfig.authDataLaunch.contentApplicationId') ||
      _.get(jobBody, 'jobConfig.authData.contentApplicationId');

    if (!jobSyncMoment.isValid()) {
      jobSyncMoment = moment.utc();
    }

    job.createdDateTime = jobSyncMoment.unix();

    if (job.jobId && !dateIdUtil.isValidDateId(job.jobId)) {
      const taskTablePartitionMoment = _.isString(
        _.get(config, 'taskTablePartitionActiveDate')
      )
        ? moment(_.get(config, 'taskTablePartitionActiveDate'))
        : null;

      if (
        taskTablePartitionMoment &&
        taskTablePartitionMoment.isValid() &&
        taskTablePartitionMoment.unix() <= job.createdDateTime
      ) {
        throw new errors.InvalidInput({
          message: 'invalid job id - not a date id',
          data: {
            objectId: 'jobId',
            objectData: job.jobId
          }
        });
      } else if (!validator.isUUID(job.jobId)) {
        throw new errors.InvalidInput({
          message: 'invalid job id - not a date id or uuid v4'
        });
      }
    }

    const jobId = job.jobId || dateIdUtil.generateJobId(job.createdDateTime);

    if (!job.applicationId) {
      throw new errors.InvalidInput({
        message: 'missing application id'
      });
    }

    if (!organizationId && job.applicationId) {
      try {
        organizationId = await serviceContext.dal.organization.getOrgIdFromAppId(
          job.applicationId
        );
      } catch (err) {
        logger.error(err);
        throw new errors.InvalidInput({
          message: `The applicationId, ${job.applicationId}, could not be mapped to an organization.`
        });
      }
    }

    //Generate tasks for each library of a type
    try {
      await util.engineLibraryTaskGenerator(job);
    } catch (error) {
      throw new errors.InternalServerError({
        message: 'Failed to generate tasks: ' + (error.message || error)
      });
    }

    // validate any forced task IDs
    for (let i = 0; i < job.tasks.length; i++) {
      if (job.tasks[i].taskId && !util.validateTaskId(job.tasks[i].taskId)) {
        throw new errors.InvalidInput({
          message: 'invalid task ID',
          data: {
            objectType: 'taskId',
            objectData: job.tasks[i].taskId
          }
        });
      }
    }

    const taskIdToBuildMap = {};
    const taskIdToEngineMap = {};
    const taskIdToEngineCategoryMap = {};
    const taskValidators = [
      engineLibraryModelValidatorGen(serviceContext.dal.library)
    ];
    const testJob = !!job.testJob;

    const validationPromise = promisify(job.validate.bind(job));
    let validationErrors = await validationPromise(
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

    let recording;
    if (job.recordingId) {
      if (recordingToken) {
        // see VTN-10313
        // if core-graphql-server passed a jwt with recording,
        // check it now and extract recording info.
        // this allows us to skip the call to core-recording-server, which
        // makes 2-3 heavyweight queries to pg. core-graphql-server just
        // got the TDO so no need to repeat here.
        try {
          recording = jwt.verify(
            recordingToken,
            serviceContext.config.jwt.secret
          );
        } catch (err) {
          logger.warn('failed to verify token! ' + err + ' ' + job.recordingId);
        }
      }

      // otherwise get it from db
      if (!recording) {
        recording = await serviceContext.dal.tdo.getTDO(context, {
          id: job.recordingId
        });
        recording.scheduledJobId =
          recording.scheduledJobId || _.get(recording, 'jsondata.programId');
      }

      if (
        recording.applicationId &&
        recording.applicationId !== job.applicationId
      ) {
        throw new errors.ResourceUnavailable({
          message: 'no access to recording',
          data: {
            objectType: 'targetId',
            objectData: job.recordingId
          }
        });
      }
    }

    let ignoreEngineLimit = false;
    if (recording && recording.scheduledJobId) {
      const results = await getCompletedJobsForRecording(recording.id);
      // no completed jobs for program recording
      // ignore engine limits for the first one create job for this recording
      if (!results.count || results.count === 0) {
        ignoreEngineLimit = true;
      }
    }

    if (!ignoreEngineLimit) {
      await checkProcessingLimitsForOrg(
        requestorOrganization,
        job.applicationId
      );
    }

    // note, this checks the _requestor_'s org if allowed to run this cluster
    if (organizationId && job.clusterId) {
      const cluster = await serviceContext.dal.cluster.getCluster(context, {
        id: job.clusterId
      });

      const collaboratingOrgIds = await serviceContext.dal.cluster.getCollaboratingOrgIds(
        context,
        {
          id: job.clusterId
        }
      );
      // FIXME: figure out if organizationId should be int or string and set that at the beginning of
      // type of organizationId might be string,
      // so we try to convert it to int to avoid type error of array.includes function.
      // Since collaboratingOrgIds is an array[int]
      const orgIdInt = _.isString(organizationId)
        ? _.toNumber(organizationId)
        : organizationId;
      if (
        cluster.organizationId !== orgIdInt &&
        !collaboratingOrgIds.includes(orgIdInt) &&
        cluster.isPublic !== true
      ) {
        throw new errors.NotAllowed({
          message: 'no access to cluster',
          data: {
            objectType: 'clusterId',
            objectData: job.clusterId
          }
        });
      }
    }

    // end of processing checks, resource access, and models validations
    let standbyTasks = [];
    job.tasks.forEach(function parseTask(task) {
      // allow caller to force taskId
      if (!task.taskId) {
        task.taskId = generateTaskId(jobId);
      }
      task.jobId = jobId;

      // parse standby task
      let standbyTasksForTask;
      try {
        standbyTasksForTask = parseStandbyTasksForTask(task, 1);
      } catch (err) {
        throw new errors.InvalidInput({
          message: 'invalid task id'
        });
      }

      if (_.isArray(standbyTasksForTask) && standbyTasksForTask.length > 0) {
        standbyTasks = standbyTasks.concat(standbyTasksForTask);
      }
    });

    if (_.isArray(standbyTasks) && standbyTasks.length > 0) {
      job.tasks = job.tasks.concat(standbyTasks);
    }
    await Promise.all(
      job.tasks.map(async function forEachTask(task) {
        await populateTaskWithEngineBuildInfo(task, organizationId, context);

        if (task.build) {
          task.buildId = task.build.id;
          taskIdToBuildMap[task.taskId] = task.build;
        }

        taskIdToEngineMap[task.taskId] = task.engine;
        taskIdToEngineCategoryMap[task.taskId] = task.category;
      })
    );

    if (!_.isNil(organizationId)) {
      await serviceContext.bll.job.checkProcessingLimitsForOrg(context, {
        organizationId,
        jobId: jobId,
        job
      });
    }

    const createJobPayload = {
      jobId: jobId,
      applicationId: job.applicationId,
      recordingId: job.recordingId,
      bundleId: job.bundleId,
      clusterId: job.clusterId,
      sourceAssetId: job.sourceAssetId,
      jobTemplateId: job.jobTemplateId,
      scheduledJobId: job.scheduledJobId,
      clientApplicationId: clientApplicationId,
      contentApplicationId: job.contentApplicationId,
      organizationId: organizationId,
      createdDateTime: job.createdDateTime,
      jobConfig: job.jobConfig,

      retries: job.retries ? job.retries : 0,
      skipDecider: job.skipDecider,
      notificationUris: job.notificationUris
    };

    async function _createJobAndTaskAsync() {
      const result = await serviceContext.dbConnections['core'].write.tx(
        'createJob',
        async (trans) => {
          const createdJob = await createJobDb(createJobPayload, trans);

          job.tasks.forEach((task, index) => {
            task.applicationId = createdJob.applicationId;
            task.recordingId = createdJob.recordingId;
            // createTaskPayload reads the TASK's sourceAssetId (and strips `assetId` from the delivered
            // payload when it is null), so the job-level value must be copied down or it never reaches
            // an edge engine.
            if (_.isNil(task.sourceAssetId) && !_.isNil(job.sourceAssetId))
              task.sourceAssetId = job.sourceAssetId;
            task.taskOrder = index; // task order is not used for task run dependency, just for the ui display
            task.testTask = task.testTask || testJob;
            task.taskPayload = task.taskPayload || {};
            task.taskStatus = task.taskStatus || 'pending';
            task.taskPayload.organizationId = organizationId;
            task.createdDateTime = job.createdDateTime;
            task.notificationUris = _.get(task, 'notificationUris', []);

            if (
              !mainUtil.hasPerm('recording:clone', context._authInfo) ||
              task.isClone
            ) {
              task.isClone = false;
            }
          });

          const createdTasks = await serviceContext.dal.task.createTasksDb(
            job.tasks,
            trans
          );
          const jobTaskMap = new Map(
            job.tasks.map((task) => [task.taskOrder, task])
          );
          const tasksRequiringPayloads = createdTasks.filter((task) =>
            _.get(taskIdToBuildMap[task.taskId], 'runtime.edge', false)
          );

          if (tasksRequiringPayloads.length) {
            await Promise.all(
              tasksRequiringPayloads.map(async (task) => {
                const engine = jobTaskMap.get(task.taskOrder).engine;
                task.payload = await serviceContext.bll.task.createTaskPayload(
                  context,
                  engine,
                  task
                );

                if (task.payload && _.isNumber(task.payload.organizationId)) {
                  task.payload.organizationId = task.payload.organizationId.toString();
                }
              })
            );
            await serviceContext.dal.task.updateTestTasks(
              tasksRequiringPayloads,
              trans
            );
          }

          createdJob.tasks = createdTasks;
          createdJob.status = coreJobBll.job.getJobStatusFromTaskStatuses(
            createdJob.tasks
          );
          await updateJobStatus(
            createdJob.jobId,
            createdJob.status,
            trans,
            context,
            createdJob.organizationId
          );
          coreJobEventEmitter.emitJobCreatedEvent(
            createdJob.jobId,
            organizationId,
            job.applicationId,
            context
          );
          emitPublicCreateJobEvent(context, {
            id: createdJob.jobId,
            createdDateTime: createdJob.createdDateTime
          });
          return createdJob;
        }
      );

      createJobAudit(context, result.jobId, jobAuditAction.create, {
        organizationId
      }).catch((err) => {
        logger.error('[createJobAudit] error:', err);
      });

      return result;
    }

    let createdJob;

    try {
      createdJob = await _createJobAndTaskAsync();
      return createdJob;
    } catch (error) {
      logger.error('Error when creating jobs and tasks', error);
      const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
      const errorCode = error.code || _.get(error, 'data.internalData.code');

      // catch the job or task partition table does not exists
      if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
        // try to create the job and task partition table if not exists
        await serviceContext.dal.jobTemplate.validateJobAndTaskTablePartition(
          moment.unix(job.createdDateTime)
        );

        // retry create job and tasks
        createdJob = await _createJobAndTaskAsync();
      } else {
        throw new errors.InternalServerError({
          message: 'Failed to create job: ' + (error.message || error)
        });
      }

      return createdJob;
    }
  }

  function mapTaskInput(task, standbyNestLevel = 0, taskPayloadDefaults) {
    const result = {};
    if (task.taskId) result.taskId = task.taskId;
    if (task.parentTaskId) result.parentTaskId = task.parentTaskId;
    if (task.engineId) result.engineId = task.engineId;
    if (task.taskType) result.taskType = task.taskType;
    if (task.isClone) result.isClone = task.isClone;
    if (task.buildId) result.buildId = task.buildId;
    if (task.testTask) result.testTask = task.testTask;
    if (task.payloadString && task.payload) {
      throw new InvalidInput({
        message: 'Only one of taskPayloadString and taskPayload is permitted',
        data: {
          fields: ['payloadString', 'payload'],
          type: 'CreateTask'
        }
      });
    }
    if (task.payloadString)
      result.taskPayload = Object.assign(
        {},
        JSON.parse(task.payloadString),
        taskPayloadDefaults
      );
    if (task.payload)
      result.taskPayload = Object.assign({}, task.payload, taskPayloadDefaults);

    if (!task.engineId && !task.taskType) {
      throw new errors.InvalidInput({
        message: 'One of engineId or taskType is required',
        data: {
          fields: ['taskType', 'engineId'],
          type: 'CreateTask'
        }
      });
    }
    if (task.engineId && task.taskType) {
      throw new InvalidInput({
        message: 'Only one of engineId and taskType is permitted',
        data: {
          fields: ['taskType', 'engineId'],
          type: 'CreateTask'
        }
      });
    }
    if (task.standbyTask) {
      if (standbyNestLevel > 10) {
        throw new errors.InvalidInput({
          message:
            'The job could not be created because the standby task ' +
            'nested exceeded the allowed level of 10.'
        });
      }
      result.standby = mapTaskInput(
        task.standbyTask,
        standbyNestLevel + 1,
        taskPayloadDefaults
      );
    }

    if (task.notificationUris) {
      result.notificationUris = task.notificationUris;
    }

    return result;
  }

  async function getJobTDOTargets(jobIds) {
    const TYPE = 'JobTDOTarget';
    if (!jobIds || !jobIds.length) {
      return [];
    }
    const res = [];
    const toGet = [];
    // first populate any we have cached
    jobIds.forEach((jobId) => {
      const tdoId = localCache.get(TYPE, jobId);
      if (tdoId) res.push(tdoId);
      else toGet.push(jobId);
    });
    // now retrieve any we don't have cached
    if (toGet.length > 0) {
      const idMap = await dbGetJobTDOTarget(toGet);
      idMap.forEach((idObj) => {
        res.push(idObj.tdo_id); // add TDO ID to our result
        localCache.set(TYPE, idObj.job_id, idObj.tdo_id); // cache it
      });
    }
    return res;
  }

  async function dbGetJobTDOTarget(jobIds) {
    let jobTable = 'job_new.job';
    const list = jobIds.map((id) => `'${id}'`).join(',');
    const whereAnd = [];
    const args = [];

    // select from partition table if we got a single ID
    if (_.isArray(jobIds) && jobIds.length == 1) {
      jobTable = generateJobTablePartition(_.first(jobIds));
    }

    whereAnd.push(`job_id IN (${list})`);
    jobIds.forEach((jobId) => {
      mainUtil.addPartitionRangeToArgs(
        jobId,
        'created_date_time',
        whereAnd,
        args
      );
    });
    const sql = `
      SELECT
        recording_id AS tdo_id,
        job_id
      FROM
        ${jobTable}
      WHERE
        ${whereAnd.join(' AND ')};`;
    const dbconn = serviceContext.dbConnections['core'].read;
    const res = await dbconn.query(sql, args);

    return res; // array of objects with tdo ID and job ID
  }

  async function checkProcessingLimitsForOrg(organization, applicationId) {
    let allowEngineOverage = true;
    let orgEngineLimit = 0;
    const orgFeatures = _.get(organization, 'kvp.features');

    if (orgFeatures) {
      if (_.isBoolean(orgFeatures.allowEngineOverage)) {
        allowEngineOverage = orgFeatures.allowEngineOverage;
      }
      if (_.isNumber(orgFeatures.engineLimit)) {
        orgEngineLimit = orgFeatures.engineLimit;
      }
    }

    if (allowEngineOverage) {
      return;
    }

    const pausedProcessing = _.get(
      organization,
      'kvp.billing.pausedProcessing'
    );

    if (pausedProcessing) {
      logger.debug('processing is paused', organization.organizationId);
      throw new errors.ObjectLimitExceeded({
        message:
          `Engine processing is paused for the organization ${organization.organizationId} ` +
          `(${organization.organizationName}) because usage limits have been ` +
          `exceeded. Purchase more capacity or contact Veritone support to continue.`
      });
    }

    const invalidBillingPeriod = checkOrgForInvalidBillingPeriod(organization);
    if (invalidBillingPeriod) {
      logger.debug(
        'invalid billing period for organization',
        organization.organizationId
      );
      throw new errors.NotAllowed({
        message: 'invalid billing period'
      });
    }

    const getEngineUsageForOrganizationPromise = promisify(
      coreJobBll.task.getEngineUsageForOrganization
    );
    const usage = await getEngineUsageForOrganizationPromise(
      applicationId,
      organization,
      null
    );

    // totalCost is in cents and orgEngineLimit in dollars.
    if (orgEngineLimit >= 1 && usage.totalCost >= orgEngineLimit * 100) {
      logger.debug(
        'engine limit exceeded for organization',
        organization.organizationId
      );
      throw new errors.ObjectLimitExceeded({
        message: 'engine limit exceeded'
      });
    }
  }

  function checkOrgForInvalidBillingPeriod(organization) {
    const now = new Date();
    let startDate = _.get(organization, 'kvp.billing.startDate');
    let expirationDate = _.get(organization, 'kvp.billing.expirationDate');
    let invalidBillingPeriod = false;
    if (startDate) {
      invalidBillingPeriod = invalidBillingPeriod || now < new Date(startDate);
    }
    if (expirationDate) {
      invalidBillingPeriod =
        invalidBillingPeriod || now > new Date(expirationDate);
    }
    return invalidBillingPeriod;
  }

  function generateTaskId(jobId) {
    if (dateIdUtil.isValidDateId(jobId)) {
      return dateIdUtil.generateTaskId(jobId);
    } else {
      return jobId + '-' + uuidv4();
    }
  }

  function parseStandbyTasksForTask(task, depth) {
    const standbyTask = task.standby;
    if (_.isObject(task.standby) && depth < maxDepth) {
      if (!standbyTask.taskId) {
        standbyTask.taskId = generateTaskId(task.jobId);
      } else if (!util.validateTaskId(standbyTask.taskId)) {
        throw new Error('invalid task ID');
      }
      standbyTask.jobId = task.jobId;
      standbyTask.taskStatus = standbyTask.taskStatus || 'standby_pending';
      standbyTask.standbyForTaskId = task.taskId;
      standbyTask.taskPayload = standbyTask.taskPayload || {};
      standbyTask.taskPayload.nestDepth = depth;
      return [new Task(standbyTask)].concat(
        parseStandbyTasksForTask(standbyTask, depth + 1) || []
      );
    }
    return null;
  }

  async function populateTaskWithEngineBuildInfo(
    task,
    requestorOrganizationId,
    context
  ) {
    const engineId = task.engineId;
    const buildId = task.buildId;
    let build;
    const engine = await serviceContext.dal.engine.getEngine(context, {
      id: engineId
    });

    task.engine = engine;
    // re-assign engine internalId into task
    // Since we might receive engine aliasId from task input.
    task.engineId = engine.internalId || engine.id || engine.aliasId;

    if (task.testTask) {
      return;
    }

    if (buildId) {
      if (
        !resUtil.isSuperAdmin(context._authInfo) &&
        requestorOrganizationId &&
        requestorOrganizationId !== engine.ownerOrganizationId
      ) {
        throw new errors.NotAllowed({
          message: 'no access to build',
          data: {
            objectType: 'buildId',
            objectData: buildId
          }
        });
      }

      build = await serviceContext.dal.engine.getEngineBuild(
        { id: buildId },
        context
      );

      if (build.status !== 'deployed') {
        throw new errors.NotAllowed({
          message: `The input build of engine ${engineId} must be in "deployed" status.`,
          data: {
            engineId: build.engineId,
            buildId: build.id,
            buildStatus: build.status
          }
        });
      }
    } else {
      const builds = await serviceContext.dal.engine.getEngineBuilds(
        {
          engineId: engine.internalId || engine.id,
          engineAliasId: engine.aliasId,
          status: ['deployed']
        },
        context
      );

      if (!builds || builds.count <= 0) {
        throw new errors.NotFound({
          message: `could not find active deployed build for engine ${engineId}`,
          data: {
            objectType: 'engineId',
            objectData: engineId
          }
        });
      }

      build = _.get(builds, 'records[0]');
    }
    task.build = build;

    const engineCategory = await serviceContext.dal.engineCategory.getEngineCategory(
      context,
      { id: engine.categoryId }
    );

    task.category = engineCategory;
    task.engineCategoryId = engine.categoryId;
  }

  async function createJobDb(job, dbTrans) {
    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['core'].write;
    }

    const jobReturning = {
      job_id: null,
      application_id: null,
      recording_id: null,
      bundle_id: null,
      cluster_id: null,
      source_asset_id: null,
      client_application_id: null,
      content_application_id: null,
      job_template_id: null,
      created_date_time: null,
      modified_date_time: null,
      retries: null,
      deleted_date_time: null,
      scheduled_job_id: null,
      organization_id: null,
      job_config: null,
      skip_decider: null,
      notification_uris: null
    };
    const columnData = {
      job_id: job.jobId,
      application_id: job.applicationId,
      recording_id: job.recordingId,
      bundle_id: job.bundleId,
      cluster_id: job.clusterId,
      source_asset_id: job.sourceAssetId,
      client_application_id: job.clientApplicationId,
      content_application_id: job.contentApplicationId,
      job_template_id: job.jobTemplateId,
      scheduled_job_id: job.scheduledJobId,
      organization_id: job.organizationId,
      job_config: job.jobConfig,
      created_date_time: job.createdDateTime,
      skip_decider: job.skipDecider,
      retries: job.retries,
      job_status: 'pending', //initial job status
      notification_uris: _.isEmpty(job.notificationUris)
        ? {}
        : job.notificationUris
    };

    const { sql, values } = mainUtil.makeInsertSql(
      generateJobTablePartition(job.jobId),
      columnData,
      jobReturning
    );

    return dbTrans.one(sql, values, mapper.mapJob);
  }

  function generateJobTablePartition(jobId) {
    if (
      dateIdUtil.isTablePartitionActive(
        config.jobTablePartitionActiveDate,
        jobId
      )
    ) {
      return dateIdUtil.getJobTablePartition(jobId);
    }
    return 'job_new.job';
  }

  async function updateJobStatus(
    jobId,
    status,
    dbTrans,
    context,
    organizationId
  ) {
    if (!dbTrans) {
      dbTrans = serviceContext.dbConnections['core'].write;
    }

    const args = [status];
    const whereAnd = [];
    let jobTable = 'job_new.job';

    if (jobId) {
      jobTable = generateJobTablePartition(jobId);
    }

    whereAnd.push(`job_id = $${args.push(jobId)}`);

    mainUtil.addPartitionRangeToArgs(
      jobId,
      'created_date_time',
      whereAnd,
      args
    );

    const updateJobStatusSql = `
  UPDATE
    ${jobTable}
  SET
    job_status = $1
  WHERE
    ${whereAnd.join(' AND ')}
    `;

    const result = await dbTrans.map(
      updateJobStatusSql,
      args,
      mapper.camelizeRootKeys
    );

    createJobAudit(context, jobId, jobAuditAction.update, {
      actionParams: {
        status
      },
      organizationId
    }).catch((err) => {
      logger.error('[createJobAudit] error:', err);
    });

    return result;
  }

  async function getCompletedJobsForRecording(tdoId) {
    if (!tdoId) {
      throw new errors.InvalidInput({
        message: 'tdoId is required',
        data: {
          objectType: 'tdoId',
          objectData: tdoId
        }
      });
    }

    const sql = `
      SELECT
        j.job_id,
        j.application_id,
        j.recording_id,
        j.bundle_id,
        j.cluster_id,
        j.created_date_time,
        j.modified_date_time,
        j.retries,
        j.deleted_date_time
      FROM
        job_new.job j
      LEFT OUTER JOIN
        job_new.task t ON t.job_id = j.job_id
      WHERE
        j.recording_id = $1
      AND
        t.task_status = 'complete'
      GROUP BY j.job_id
      ORDER BY j.created_date_time DESC`;
    const args = [tdoId];
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapJob
    );

    return mainUtil.toPage({}, rows);
  }

  async function createJobAudit(context, jobId, action, options) {
    const { actionParams, organizationId } = options || {};
    // for apiKey tokens with no users in their organization, use an empty UUID.
    const actor =
      _.get(options, 'actor') ||
      _.get(context, '_authInfo.userId') ||
      '00000000-0000-0000-0000-000000000000';

    if (_.isNil(jobId) || _.isNil(action) || _.isNil(organizationId)) {
      throw new errors.InvalidInput({
        message: `jobId, action and organizationId are required. Input parameters: jobId: ${jobId}, action: ${action}, organizationId: ${organizationId}`
      });
    }

    if (_.isNil(jobAuditAction[action])) {
      throw new errors.InvalidInput({
        message: 'job audit action has invalid value.'
      });
    }

    const columnData = {
      job_id: jobId,
      action_params: actionParams,
      organization_id: organizationId,
      action,
      actor
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'job_new.job_audit',
      columnData,
      {
        job_id: null,
        action_params: null,
        organization_id: null,
        action: null,
        actor: null,
        timestamp: null
      }
    );

    return await serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function getJobAudit(context, options) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const { jobId, action, actor, orderBy, organizationId } = options || {};

    const whereClause = [];
    const values = [];
    const orderClause = [];
    const orderByMap = {
      timestamp: 'timestamp'
    };

    if (_.isNil(jobId)) {
      throw new errors.InvalidInput({
        message: `jobId is required.`,
        data: options
      });
    }

    if (action && _.isNil(jobAuditAction[action])) {
      throw new errors.InvalidInput({
        message: 'job audit action has invalid value.'
      });
    }

    values.push(jobId);
    whereClause.push(`job_id = $${values.length}`);

    mainUtil.addSqlWhere('actor', actor, whereClause, values);
    mainUtil.addSqlWhere('action', action, whereClause, values);
    mainUtil.addSqlWhere(
      'organization_id',
      organizationId,
      whereClause,
      values
    );

    if (orderBy) {
      const col = orderByMap[orderBy.field];

      if (!col) {
        throw new errors.InternalServerError({
          message: 'Order by field does not support',
          data: {
            internalData: {
              orderByField: orderBy.field,
              knownFields: Object.keys(orderByMap)
            }
          }
        });
      }

      orderClause.push(`${col} ${_.get(orderBy, 'direction', '')}`);
    } else {
      orderClause.push(`${orderByMap.timestamp} DESC`);
    }

    const sql = `
      SELECT
        job_id,
        organization_id,
        action,
        action_params,
        actor,
        timestamp
      FROM
        job_new.job_audit
      WHERE ${whereClause.join(' AND ')}
      ${orderClause.length ? ` ORDER BY ${orderClause.join(', ')}` : ''}
      OFFSET ${options.offset || 0}
      LIMIT ${options.limit || defaultLimit};`;

    const results = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return mainUtil.toPage(options, results);
  }

  return {
    createJob,
    getJob,
    _getJobsQuery,
    getJobs,
    getJobTDOTargets,
    createJobAudit,
    getJobAudit,

    //only for unit-test
    newCreateJob,
    checkProcessingLimitsForOrg,
    parseStandbyTasksForTask,
    populateTaskWithEngineBuildInfo,
    createJobDb,
    generateJobTablePartition,
    updateJobStatus,
    getCompletedJobsForRecording,
    generateTaskId
  };
};
