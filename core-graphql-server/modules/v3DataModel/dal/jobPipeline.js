const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');
const LocalTime = require('js-joda').LocalTime;
const moment = require('moment');
const humps = require('humps');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const dalJobTemplate = serviceContext.dal.jobTemplate;
  const dalTaskTemplate = serviceContext.dal.taskTemplate;
  const dalJob = serviceContext.dal.job;
  const dalTDO = serviceContext.dal.tdo;
  const util = require('../../../util.js')();
  const errors = require('../../../error')(config);
  const dbRead = dbConnections['core'].read;
  const magicIdUtil = require('@veritone/core-server-base/parser.recording-id.js')(
    {
      config
    }
  );
  const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
  const dalUtil = require('../../../dal/util')(config, serviceContext);

  // needed to validate scheduled jobs
  const dalSource = serviceContext.dal.source;
  const dalSourceType = serviceContext.dal.sourceType;

  /*
If both JobPipelineID and ParentJobID are specified, or none is specified, throw a 400 error

If JobPipelineID is specified:
  Check that userID/appID can access the given pipeline (see pseudo-code below)
    If no access return an error
  Query Job table for all jobs that has the given JobPipelineID and "isTemplate = true" and "stageNum = 1"
    If none found return an error (job pipeline setup incorrectly)
  Gather list of template jobs for all results found in step (c)

Continue to step #4

If ParentJobID is specified:
  Query Job table for a job with the given jobID and "isTemplate = false"
    If none found return an error (either job pipeline setup incorrectly, or caller gives incorrect ParentJobId)
  Get JobPipelineId and JobPipelineStage for the job found
  Check that userID/appID can access the given pipeline (see pseudo-code below)
      If no access return an error
  Query Job table for all jobs where with the JobPipelineID found in step (c) and "isTemplate = true" and JobPipelineStage is 1 greater than the JobPipelineStage found in step (c)
    If none found return an error (no more jobs in pipeline) (caller can usually ignore this error as harmless)
  Gather list of template jobs for all results found in step (f)

Continue to step #4

For each template job found:
Query Task table for all tasks with the given jobID and jobPipelineId (from template job) and "isTemplate = true"
If none found return an error (job pipeline set up incorrectly)
Use template job to create a new actual job in Job table
Set isTemplate to false in new actual job
If correlationID is given, set it in new actual job
Save the jobID to return to caller
For each template task found in step (a)
Use template task to create a new actual task in Task table
Set isTemplate to false in new actual task
If correlationID is given, set it in new actual task
Use the data in Payload to replace the placeholders in payload field of new actual task (if applicable)
Gather all jobIDs from step 4(c)(iii) into a list and return to caller

Check pipeline access:

Query JobPipeline table for given jobPipelineID
If none found return an error
If IsPublic for the found pipeline is true, return true
If orgID of userID/appID in CollaboratorOrgIDs, return true
Return false
*/

  async function createAllScheduledJobs(context, args) {
    const input = args.input;
    const scheduledJobId = input.scheduledJobId;

    // validate input
    if (!scheduledJobId) {
      throw new errors.InvalidInput({
        message: 'scheduledJobId is required on ' + 'launchScheduledJobs.'
      });
    }
    return createPipelineJobs(context, args, true, true);
  }

  /**
   * common implementation function for createNextPipelineJobs and
   * createAllPipelineJobs.
   * @param context the graphql resolver context
   * @param args the graphql mutation arguments
   * @param fromStage true if the the function should create and
   *    return jobs for all stages greater than or equal to the
   *    jobPipelineStage parameter value. false if it should create
   *    only jobs in the given stage (or parentJob.stage+1 if parentJobId
   *    is specified).
   * @param createTDO Whether or not to create a TDO automatically
   *    for the jobs in this pipeline. If true, a TDO will be created
   *    with default settings and then injected into the job pipeline
   *    via the targetData input structure.
   */
  async function createPipelineJobs(context, args, fromStageBool, createTDO) {
    const input = args.input;
    const parentJobId = input.parentJobId;
    const organizationId = input.organizationId;
    let jobPipelineId = input.jobPipelineId;
    const scheduledJobId = input.scheduledJobId;
    let fromStage = fromStageBool;
    let stage = input.jobPipelineStage || 1;
    let tdoCreateInput = args.input.createTargetInfo || {};

    if (args.input.createTargetInfo && args.input.targetInfo) {
      throw new errors.InvalidInput({
        message:
          'Supply either createTargetInfo or targetInfo to ' +
          'launchScheduledJobs, but not both.'
      });
    }

    // if a scheduled job ID was provided, validate that it exists.
    // we don't need to do anything with it but pass into createJob.

    let sourceId;
    if (scheduledJobId) {
      // TODO cache this? maybe not that useful
      const scheduledJob = await serviceContext.dal.scheduledJob.getScheduledJob(
        context,
        {
          id: scheduledJobId,
          organizationId: organizationId
        }
      );

      // called with master token or orgless token
      // attempt to get app id from org id
      if (scheduledJob && scheduledJob.organizationId && !args.applicationId) {
        const appId = await serviceContext.dal.application.getAppIdFromOrgId(
          scheduledJob.organizationId
        );
        if (appId) {
          args.applicationId = appId;
        }
      }

      if (scheduledJob) {
        sourceId = scheduledJob.primarySourceId;

        if (tdoCreateInput && !tdoCreateInput.name) {
          tdoCreateInput.name = scheduledJob.name;
        }
        // if the scheduled job has image URLs set, copy them into create
        // TDO input.
        tdoCreateInput.thumbnailUrl = scheduledJob.programLiveImage;
        tdoCreateInput.sourceImageUrl = scheduledJob.programImage;

        if (sourceId) {
          // TODO cache source
          const source = await dalSource.getSource(context, {
            id: sourceId,
            organizationId,
            includePublic: util.isInternalAPIKey(context.requestContext)
          });
          tdoCreateInput.isPublic = _.get(source, 'isPublic', false) === true;
        }
      }
    }

    // if a parent job was provided, retrieve it
    // and use it to set pipeline ID and stage
    if (parentJobId) {
      // first get the parent job to validate its existence and
      // retrieve its template ID
      const parentJob = await serviceContext.dal.job.getJob(context, {
        id: parentJobId,
        applicationId: args.input.applicationId
      });
      const templateId = parentJob.templateId;
      if (!templateId) {
        throw new errors.InvalidInput({
          message:
            'The specified job ID is not part of a job pipeline and ' +
            'is not a parent job. Only jobs that were launched from a job template ' +
            'that is part of a job pipeline can be passed to this mutation.',
          data: {
            objectId: parentJobId,
            objectType: 'Job',
            jobInfo: parentJob
          }
        });
      }
      input.parentJobClusterId = parentJob.clusterId;
      if (!input.scheduledJobId) {
        input.scheduledJobId = parentJob.scheduledJobId;
      }

      const parentInfo = await getParentJobInfo(context, templateId);
      stage = parentInfo.jobPipelineStage + 1;
    }

    // get template jobs for next stage
    const getJobArgs = {
      jobPipelineId: jobPipelineId,
      jobPipelineStage: stage,
      applicationId: args.applicationId,
      scheduledJobId: scheduledJobId,
      jobPipelineStageOperator: fromStage ? 'from' : 'equal'
    };
    const jobTemplates = await dalJobTemplate.getJobTemplates(
      context,
      getJobArgs
    );

    const jobTemplateToJobIdMap = {};
    const jobIds = [];
    context.jobSyncMoment = context.jobSyncMoment || moment.utc();
    let forceSkipTDOCreation;
    for (let i = 0; i < jobTemplates.records.length; i++) {
      const jobTemplate = jobTemplates.records[i];
      // VTN-11358 - don't duplicate the same job template ID
      if (jobTemplateToJobIdMap[jobTemplate.id]) {
        serviceContext.logger.warn(
          'duplicate job template id ' + jobTemplate.id + ' will be ignored!'
        );
        continue;
      }

      const newId = dateIdUtil.generateJobId(context.jobSyncMoment.unix());
      jobTemplateToJobIdMap[jobTemplate.id] = newId;
      jobIds.push(newId);
      tdoCreateInput = Object.assign(
        tdoCreateInput,
        _.get(jobTemplate, 'jobConfig.createTDOInput', {})
      );
      const createTDOOnLaunch = _.get(
        jobTemplate,
        'jobConfig.createTDOOnLaunch'
      );
      if (createTDOOnLaunch !== undefined) {
        createTDO = createTDOOnLaunch;
        if (forceSkipTDOCreation === undefined) {
          forceSkipTDOCreation = !createTDOOnLaunch;
        } else {
          forceSkipTDOCreation = forceSkipTDOCreation & !createTDOOnLaunch;
        }
      }
      createTDO = _.get(jobTemplate, 'jobConfig.createTDOOnLaunch', createTDO);
      // get task templates for this job template
      const taskTemplateArgs = {
        jobTemplateId: jobTemplate.id
      };
      const taskTemplates = await dalTaskTemplate.getTaskTemplates(
        context,
        taskTemplateArgs
      );

      taskTemplates.records.forEach((taskTemplate) => {
        const templatePayload = taskTemplate.payload || {};
        if (templatePayload.sourceRequiresScanPipeline) {
          createTDO = false;
        }
      });
    }

    // if necessary, create a TDO
    if (createTDO && !input.targetInfo) {
      let orgId = args.organizationId;
      if (!orgId)
        orgId = await serviceContext.dal.organization.getOrgIdFromAppId(
          args.applicationId
        );

      // Use recordStartTime from the payload if provided (RFC3339 string),
      // otherwise default to current time in ms.
      const payloadRecordStartTime = _.get(input, 'payload.recordStartTime');
      const parsedStartTime = payloadRecordStartTime
        ? new Date(payloadRecordStartTime).getTime()
        : null;
      const startDateTime = (parsedStartTime && !isNaN(parsedStartTime))
        ? parsedStartTime
        : Date.now(); // cur time in ms.
      // this is passed to dalTDO.createTDO, which will convert the
      // value into the underlying database format if necessary.
      let tdoInput = {
        applicationId: args.applicationId,
        organizationId: orgId,
        status: 'recording',
        // make sure we set job IDs in source data so that
        // engine JWTs can access the new TDO
        sourceData: {
          jobIds: jobIds,
          sourceId: sourceId, // might be empty
          scheduledJobId: input.scheduledJobId
        },
        startDateTime: startDateTime,
        stopDateTime: startDateTime // set to 0-length TDO.
        // stop time is adjusted during ingestion.
      };
      if (tdoCreateInput) {
        tdoInput = Object.assign(tdoCreateInput, tdoInput);
      }

      // create the TDO
      const tdo = await dalTDO.createTDO(context, {
        input: tdoInput,
        // Skip initial indexing by default but don't persist flag
        skipIndexing: _.get(input, 'createTDO', false) !== true
      });
      // now set it as target on the input to create jobs
      input.targetInfo = {
        targetId: tdo.id
      };
    }

    const newJobs = [];
    const jobTemplateToCreatedJobId = {};

    // for each job template, get template tasks
    for (let i = 0; i < jobTemplates.records.length; i++) {
      const jobTemplate = jobTemplates.records[i];
      // VTN-11358 - don't create a job for the duplicate job template IDs
      if (jobTemplateToCreatedJobId[jobTemplate.id]) {
        serviceContext.logger.warn(
          'duplicate job template id ' +
            jobTemplate.id +
            ' skipped for job create!'
        );
        continue;
      }
      const newJob = await launchNewJobFromTemplate(
        context,
        jobTemplate,
        input,
        jobTemplateToJobIdMap[jobTemplate.id],
        input.scheduledJobId,
        forceSkipTDOCreation
      );
      jobTemplateToCreatedJobId[jobTemplate.id] = newJob.id;
      newJobs.push(newJob);
    }

    return newJobs;
  }

  async function getScheduleParams(context, scheduledJob) {
    // TODO temporary for Q1 R/T release. do not risk failing a job
    // because of an error in this logic. instead fall back on default
    // behavior (assuming that duration is set directly in task payload
    // or passed in by caller in jobPayload).
    try {
      return getScheduleParamsUnsafe(context, scheduledJob);
    } catch (err) {
      logger.error(
        'unable to compute scheduled job duration, falling back on defaults:  ' +
          err,
        err
      );
      return {};
    }
  }

  async function getScheduleParamsUnsafe(context, scheduledJob) {
    let res = {};
    // if no schedule job applies, just return out now
    if (!scheduledJob) return res;
    const scheduledJobId = scheduledJob.id;

    // first get the schedule parts
    const scheduleParts = await serviceContext.dal.scheduledJob.getScheduleParts(
      context,
      {
        id: scheduledJobId,
        scheduledJob: scheduledJob
      }
    );

    // capture current time now so that we use a consistent test timestamp
    // across schedule parts.
    const now = new Date();
    // if there's only one schedule part, we always use it to determine duration.
    // for this reason, among others, we do NOT override any duration info
    // set in the task payload.
    const onlyOne = scheduleParts.length === 1;
    for (let i = 0; i < scheduleParts.length; i++) {
      const scheduleParams = getScheduleParamsOnPart(
        now,
        scheduleParts[i],
        scheduledJob,
        onlyOne
      );
      // we'll take the first one that returns any data. it's a match.
      if (scheduleParams) {
        res = scheduleParams;
        break;
      }
    }
    return res;
  }

  function copyKeysToPlaceholder(object) {
    const keys = Object.keys(object);
    keys.forEach((key) => {
      const newKey = humps.decamelize(key).toUpperCase();
      object[newKey] = object[key];
    });
    return object;
  }

  // determines whether or not recording schedule
  // parameters have already been set on the
  // specified parameter set.
  function isScheduleSet(params) {
    // this are the fields that crontab-generator sets.
    // if payload already has start and stop time
    // OR start time and duration, skip.
    return (
      (_.has(params, 'recordStartTime') && _.has(params, 'recordStopTime')) ||
      (_.has(params, 'recordStartTime') && _.has(params, 'recordEndTime')) ||
      (_.has(params, 'recordStartTime') && _.has(params, 'recordDuration'))
    );
  }

  function getScheduleParamsOnPart(
    dateTime,
    schedulePart,
    scheduledJob,
    onlyOne = false
  ) {
    let res = null;
    const hour = dateTime.getHours();
    const minutes = dateTime.getMinutes();
    const seconds = dateTime.getSeconds();
    const totalNow = seconds + minutes * 60 + hour * 3600;

    if (schedulePart.scheduleType === 'Weekly') {
      // if we got a "weekly" part, we need to see if the current time
      // fits within its window.
      const dayOfWeek = dateTime.getDay(); // 0-6; matches our usage
      // does day match? if so, check start time.
      if (dayOfWeek === schedulePart.scheduledDayAsInt) {
        const startTime = LocalTime.parse(schedulePart.startTime);
        const totalStartSched =
          startTime.second() +
          startTime.minute() * 60 +
          startTime.hour() * 3600;

        let totalStopSched = Number.MAX_SAFE_INTEGER;
        if (schedulePart.stopTime) {
          const stopTime = LocalTime.parse(schedulePart.stopTime);
          totalStopSched =
            stopTime.second() + stopTime.minute() * 60 + stopTime.hour() * 3600;
        }

        const hour24 = 24 * 60 * 60;
        let durationSeconds = schedulePart.stopTime
          ? totalStopSched >= totalStartSched
            ? totalStopSched - totalStartSched // start < stop - just subtract
            : hour24 - totalStartSched + totalStopSched
          : // stop < start! means a roll-over, like from 10PM to 1AM.
            // value is (24hours - start + stop).
            0;

        if (
          (totalNow >= totalStartSched && totalNow <= totalStopSched) ||
          onlyOne
        ) {
          // need to set absolute start and stop times
          // copy the date
          const temp = new Date(dateTime.getTime());
          temp.setHours(0);
          temp.setMinutes(0);
          temp.setSeconds(0);
          temp.setMilliseconds(0);
          const base = temp.getTime(); // midnight
          const stopTime = schedulePart.stopTime
            ? moment(base + totalStopSched * 1000).toISOString()
            : null;
          // recordStartTime only makes sense if there is a stop time
          // or a duration. If not, this is the payload for a non-stream
          // adapter like the S3 adapter.
          let recordStartTime;
          if (durationSeconds > 0) {
            recordStartTime = moment(
              base + totalStartSched * 1000
            ).toISOString();
          }
          res = copyKeysToPlaceholder({
            // VTN-10456 defines this format
            recordStartTime: recordStartTime,
            recordEndTime: stopTime
          });
        }
      }
    } else if (schedulePart.scheduleType === 'Interval') {
      // always match? this only works with Q1 2018 assumption in CMS UI,
      // that there is only one schedule part.

      // for an interval-driven schedule part, we need to figure out
      // if the current time is in or near a scheduled interval.

      const unitMap = {
        Seconds: 1,
        Minutes: 60,
        Hours: 60 * 60,
        Days: 60 * 60 * 24,
        Weeks: 60 * 60 * 24 * 7,
        Months: 60 * 60 * 24 * 30 // TODO doesn't really work!
      };
      // time in sec of repeat interval
      const repeatIntervalDurationSec = schedulePart.repeatInterval
        ? schedulePart.repeatInterval * unitMap[schedulePart.repeatIntervalUnit]
        : 0;

      // now get diff in sec between job start time and current time
      const jobStartDateTime = new Date(scheduledJob.startDateTime); // as Date

      // now get totalTimeSec % repeatIntervalSec.
      const jobStartDateTimeSec = Math.floor(jobStartDateTime.getTime() / 1000);
      const diffSec =
        Math.floor(dateTime.getTime() / 1000) - jobStartDateTimeSec;
      // this value holds the number of seconds since the last
      // interval boundary.
      let secondsSinceLastIntervalBoundary =
        diffSec % repeatIntervalDurationSec;
      // we need to test if the current time is within some window from
      // the last interval boundary.
      // if the schedule part has a duration, use it.
      // if not then assume that if the interval started <= 5 minutes ago
      // then we use this schedule part.
      const testDuration = schedulePart.durationSeconds || 60 * 5;

      // if schedule part was configured with a daily start time instead of
      // repeat interval, check that against current time now.
      if (schedulePart.startTime) {
        const startTime = LocalTime.parse(schedulePart.startTime);
        const totalStartSched =
          startTime.second() +
          startTime.minute() * 60 +
          startTime.hour() * 3600;
        // (re-)set secondsSinceLastIntervalBoundary to the time elapsed
        // since configured start time.
        secondsSinceLastIntervalBoundary = totalNow - totalStartSched;
      }

      // is this less than job durationSec? if so, trigger and user durationSec.
      if (secondsSinceLastIntervalBoundary < testDuration || onlyOne) {
        const startTime = new Date(); // start current job now
        let stopTime;
        if (schedulePart.durationSeconds) {
          stopTime = new Date(
            startTime.getTime() + schedulePart.durationSeconds * 1000
          );
        }
        // recordStartTime only makes sense if there is a stop time
        // or a duration. If not, this is the payload for a non-stream
        // adapter like the S3 adapter.
        let recordStartTime;
        if (schedulePart.durationSeconds || stopTime) {
          recordStartTime = moment(startTime.getTime()).toISOString();
        }
        res = copyKeysToPlaceholder({
          recordStartTime: recordStartTime,
          recordEndTime: stopTime
            ? moment(stopTime.getTime()).toISOString()
            : null
        });
      }
    }
    /*
    {
      start_time: "08:00",
      end_time: "09:00",
      schedule_type: 'Weekly',
      scheduled_day: n (1-7)
    }
    OR
    {
      repeat_interval_unit: x,
      repeat_interval: n,
      schedule_type: 'Interval',
      duration_seconds: n,
      time_of_day: "08:00"
    }
    */

    return res;
  }

  async function launchNewJobFromTemplate(
    context,
    jobTemplate,
    pipelineInput,
    newJobId = null,
    scheduledJobId = null,
    forceSkipTDOCreation = false
  ) {
    // need to force job ID
    context.jobSyncMoment = context.jobSyncMoment || moment.utc();
    const jobId =
      newJobId || dateIdUtil.generateJobId(context.jobSyncMoment.unix());

    // has tdoId, startOffsetMs, and endOffsetMs
    const tdoInfo = pipelineInput.targetInfo;
    let tdoId = null;
    const realtimeIngestionTasks = await getRealtimeIngestionTasks(
      jobTemplate.id
    );
    let mustCreateTDO = false;

    if (tdoInfo) {
      tdoId = tdoInfo.targetId;
      // create magic ID if start/end offset were provided
      if (tdoInfo.startOffsetMs || tdoInfo.stopOffsetMs) {
        const generativeAssetParamList = [
          {
            startDateTime: tdoInfo.startOffsetMs
              ? tdoInfo.startOffsetMs / 1000
              : 0,
            stopDateTime: tdoInfo.stopOffsetMs
              ? tdoInfo.stopOffsetMs / 1000
              : null
          }
        ];
        tdoId = magicIdUtil.createRecordingId(
          tdoId,
          null,
          generativeAssetParamList
        );
      }
    } else if (!forceSkipTDOCreation) {
      // might need to create a TDO. we do this if there are any
      // real-time ingestion tasks in the task list and the job template
      // was launched without a target TDO.
      if (realtimeIngestionTasks.length > 0) mustCreateTDO = true;
      // Offline ingestion also requires a tdo to be a created
      if (
        _.get(pipelineInput, 'payload.mode') === 'offline' &&
        _.has(pipelineInput, 'payload.url')
      )
        mustCreateTDO = true;
    }

    // determine job duration from schedule, if possible.
    // these values will be used to expand placeholders in the
    // task templates. they will NOT be injected directly into
    // task payloads. Thus, it's up to the job template creator
    // to make sure placeholder settings are added as needed
    // by the engine used by a given task.

    // we only do this if the scheduling parameters are
    // not already set on the incoming payload.
    let isSet = isScheduleSet(pipelineInput.payload);
    let scheduledJob;
    if (pipelineInput.scheduledJobId) {
      scheduledJob = await serviceContext.dal.scheduledJob.getScheduledJob(
        context,
        {
          id: scheduledJobId || pipelineInput.scheduledJobId
        }
      );

      const sourceTypeId = _.get(scheduledJob, 'primarySourceTypeId');
      let sourceType;
      if (sourceTypeId) {
        // Don't risk failing job if source type could not be fetched
        try {
          // TODO cache source type
          sourceType = await dalSourceType.getSourceType(context, {
            id: sourceTypeId
          });
        } catch (err) {
          logger.error('Unable to compute source type: ', err);
        }
      }

      const isLive = _.get(sourceType, 'isLive', false) === true;

      // only set schedule info for recurring or continuous mode
      // and if sourceType isLive
      if (
        !(
          scheduledJob.runMode === 'Recurring' ||
          scheduledJob.runMode === 'Continuous'
        ) ||
        (sourceType && !isLive)
      ) {
        isSet = true;
      }
    }

    const scheduleParams = isSet
      ? {} // empty so that we don't attempt to compute and overwrite
      : await getScheduleParams(context, scheduledJob);
    const jobPayload = pipelineInput.payload
      ? Object.assign(scheduleParams, pipelineInput.payload)
      : null; // should this be {}?

    const isOfflineIngest =
      _.get(jobTemplate, 'jobConfig.ingestionMode', 1) === 2;

    // get task templates for this job template
    const taskTemplateArgs = {
      jobTemplateId: jobTemplate.id
    };
    const taskTemplates = await dalTaskTemplate.getTaskTemplates(
      context,
      taskTemplateArgs
    );
    const taskInput = [];
    // to create child task with parent task IDs,
    // we need to force all IDs here and pass to core-job.
    // just generate IDs here, store in map, create parent task if it
    // hasn't already been created.
    const templateToRealTaskIdMap = {};
    taskTemplates.records.forEach((taskTemplate) => {
      const taskId = dateIdUtil.generateTaskId(jobId);
      templateToRealTaskIdMap[taskTemplate.id] = taskId;

      if (_.get(taskTemplate, 'payload.sourceRequiresScanPipeline')) {
        mustCreateTDO = false;
      }
    });
    taskTemplates.records.forEach((taskTemplate) => {
      const templatePayload = taskTemplate.payload || {};

      // Need to overwrite templatePayload with values from launch jobPayload on realtime jobs
      Object.assign(templatePayload, jobPayload);

      const taskPayload = jobPayload
        ? util.expandJsonVariables(templatePayload, jobPayload)
        : templatePayload;

      // never set mode ingest on a offline job?
      // detect bad combination of job config + task payload
      if (isOfflineIngest && taskPayload.mode === 'ingest') {
        const event = {
          event: 'ingestModeWarning',
          level: 'warn',
          jobId,
          jobTemplateId: jobTemplate.id,
          taskTemplateId: taskTemplate.id,
          scheduledJobId: scheduledJob.id,
          offlineTaskId: taskPayload.offlineTaskId,
          taskPayload: taskPayload,
          jobConfig: jobTemplate.jobConfig,
          jobPayload,
          timestamp: moment().toISOString(),
          requestId: context.requestContext.requestId,
          correlationId: context.requestContext.correlationId
        };
        // log the warning
        if (
          _.get(
            serviceContext,
            'config.featureFlags.errorOnIngestModeWarn',
            false
          ) === true
        ) {
          throw new errors.InvalidInput({
            message: 'Ingest mode is incompatible with job config.',
            data: event
          });
        } else {
          // if we have a offlineTaskId then set mode.
          if (taskPayload.offlineTaskId) taskPayload.mode = 'offline';
          // then log the warning
          // console.log(JSON.stringify(event));
        }
        // otherwise do nothing. we can't safely fix this job.
        // it'll error out later on.
      }
      // force a task ID
      const taskId = templateToRealTaskIdMap[taskTemplate.id];
      const parentTaskId = taskTemplate.parentTaskId
        ? templateToRealTaskIdMap[taskTemplate.parentTaskId]
        : null;

      taskInput.push({
        engineId: taskTemplate.engineId,
        payload: taskPayload,
        buildId: taskTemplate.buildId,
        taskId: taskId,
        parentTaskId: parentTaskId,
        notificationUris: taskTemplate.notificationUris || []
      });
    });

    // try to determine app ID. we'll take it from the auth context (via
    // pipeline input) if present, and otherwise use app ID off the job template.
    const appId = pipelineInput.applicationId || jobTemplate.applicationId;
    // create the TDO now. we have all the info needed to set source data.
    if (mustCreateTDO) {
      const rtTask = realtimeIngestionTasks[0];
      // create a TDO and set target info
      // Use recordStartTime from the payload if provided (RFC3339 string),
      // otherwise default to current time in ms.
      const payloadRecordStartTime = _.get(pipelineInput, 'payload.recordStartTime');

      const parsedStartTime = payloadRecordStartTime
        ? new Date(payloadRecordStartTime).getTime()
        : null;
      const now = (parsedStartTime && !isNaN(parsedStartTime))
        ? parsedStartTime
        : Date.now();

      const sourceId =
        pipelineInput.sourceId || _.get(rtTask, 'payload.sourceId');

      // determine if TDO should be public
      // should inherit publicity from either source
      // or createTargetInfo permissions (createTargetInfo.details.veritone-permissions.isPublic)
      let isPublic = _.get(
        pipelineInput,
        'createTargetInfo.details.veritone-permissions.isPublic'
      );
      let source;
      if (sourceId) {
        source = await dalSource.getSource(context, {
          id: sourceId,
          organizationId: pipelineInput.organizationId,
          includePublic: util.isInternalAPIKey(context.requestContext)
        });
        isPublic = _.get(source, 'isPublic', false) === true;
      }

      let tdoInput = {
        applicationId: appId,
        startDateTime: now,
        stopDateTime: now,
        status: 'recording',
        sourceData: {
          taskId: rtTask ? templateToRealTaskIdMap[rtTask.id] : null, // ID of the ingestion task
          // ID of the source, if we can identify one.
          sourceId,
          clusterId: jobTemplate.clusterId || pipelineInput.parentJobClusterId,
          // ID of the scheduled job, if one was passed in.
          scheduledJobId: pipelineInput.scheduledJobId
        },
        isPublic,
        thumbnailUrl: scheduledJob ? scheduledJob.programLiveImage : null,
        sourceImageUrl: scheduledJob ? scheduledJob.programImage : null,
        organizationId: pipelineInput.organizationId,
        __cachedSource: source
      };

      tdoInput = Object.assign(
        _.get(jobTemplate, 'jobConfig.createTDOInput', {}),
        _.get(pipelineInput, 'createTargetInfo', {}),
        tdoInput
      );

      const tdo = await serviceContext.dal.tdo.createTDO(context, {
        input: tdoInput
      });
      // set the TDO ID that will be set as target on the new job
      tdoId = tdo.id;

      // last, we need to inject the new TDO ID as the target for all tasks.
      taskInput.forEach((task) => {
        if (!task.payload) task.payload = {};
        if (task.payload.recordingId) {
          logger.warn(
            'template task ' +
              rtTask.id +
              ' already has a TDO ID:  ' +
              task.payload.recordingId
          );
        }
        task.payload.recordingId = task.payload.tdoId = tdoId;
      });
    }

    const createJobInput = {
      input: {
        targetId: tdoId,
        applicationId: appId,
        tasks: taskInput,
        id: jobId,
        templateId: jobTemplate.id,
        skipDecider: jobTemplate.skipDecider,
        clusterId: jobTemplate.clusterId,
        jobConfig: jobTemplate.jobConfig,
        scheduledJobId: scheduledJobId || pipelineInput.scheduledJobId,
        scheduledJobAppId: scheduledJob ? scheduledJob.appApplicationId : null,
        notificationUris: jobTemplate.notificationUris
      }
    };
    const newJob = await dalJob.createJob(context, createJobInput);

    return newJob;
  }

  /**
   * Gets all real-time ingestion tasks on a given job template
   */
  async function getRealtimeIngestionTasks(jobTemplateId) {
    const args = [jobTemplateId];
    const whereAnd = [];
    whereAnd.push(`t.job_template_id = $${args.length}`);

    const sql = `
SELECT
  e.engine_id,
  t.task_template_id AS id,
  t.task_payload AS payload
FROM
  job_new.engine e
  INNER JOIN job_new.task_template t ON e.engine_id = t.engine_id
  INNER JOIN job_new.build b ON e.engine_id = b.engine_id
  INNER JOIN job_new.engine_category ec ON e.engine_category_id = ec.engine_category_id
WHERE
  b.build_state = 'deployed' AND
  b.manifest->>'engineMode'= 'stream' AND
  ec.engine_type_id = '0ab2745b-ca6b-43c9-befd-0ef1d28cb96d' AND
  t.job_template_id = $${args.length}
    `;
    const res = await dbRead.query(sql, args);
    return res;
  }

  async function launchJobTemplates(context, args) {
    const input = args.input;
    const payload = input.payload;
    const jobTemplateIds = input.ids;
    const scheduledJobId = input.scheduledJobId;
    const newJobs = [];

    if (input.createTargetInfo && input.targetInfo) {
      throw new errors.InvalidInput({
        message:
          'Supply either createTargetInfo or targetInfo to launchJobTemplates, but not both.'
      });
    }

    const jtRes = await dalJobTemplate.getJobTemplates(context, {
      id: jobTemplateIds
    });
    const jobTemplates = jtRes.records;

    for (let i = 0; i < jobTemplates.length; i++) {
      const jobTemplate = jobTemplates[i];
      const res = await launchNewJobFromTemplate(context, jobTemplate, input);
      newJobs.push(res);
    }

    return newJobs;
  }

  /**
   * Gets pipeline and stage info for the specified job template ID,
   * which is the template for the parent job of a job we're starting now.
   */
  async function getParentJobInfo(context, parentJobTemplateId) {
    const jobTable = dalUtil.generateJobTablePartition(parentJobTemplateId);
    const range = dateIdUtil.getEpochRange(parentJobTemplateId);

    const args = [];
    const where = [];

    where.push('is_template = TRUE');
    util.addSqlWhere('job_id', parentJobTemplateId, where, args);

    if (range.start && range.end) {
      where.push(
        `(created_date_time BETWEEN $${args.length + 1} AND $${
          args.length + 2
        })`
      );
      args.push(range.start, range.end);
    }

    const sql = `
SELECT
  job_pipeline_stage,
  job_pipeline_id,
  scheduled_job_id
FROM
  ${jobTable}
WHERE
    ${where.join(' AND ')}
    `;

    const res = await dbRead.map(sql, args, mapper.camelizeRootKeys);
    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: parentJobTemplateId,
          objectType: 'JobTemplate'
        }
      });
    }
    return res[0];
  }

  return {
    createAllScheduledJobs,
    launchJobTemplates,
    getParentJobInfo,
    getScheduleParams,
    getScheduleParamsUnsafe,
    getScheduleParamsOnPart
  };
};
