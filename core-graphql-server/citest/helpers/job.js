const _ = require('lodash');
// jobs
async function helpGetJobs(client, input) {
  const { gqlClient, options } = client;
  const { isShowTarget } = input;
  const query = `
    query (
        $hasTargetTDO: Boolean
        $id: ID
        $status: [JobStatusFilter!]
        $applicationStatus: String
        $offset: Int = 0
        $limit: Int = 30
        $applicationId: ID
        $targetId: ID
        $clusterId: ID
        $scheduledJobIds: [ID!]
        $hasScheduledJobId: Boolean
        $orderBy: [JobSortField!]
        $dateTimeFilter: [JobDateTimeFilter!]
        $applicationIds: [ID]
        $engineIds: [ID!]
        $engineCategoryIds: [ID!]
        $dagTemplateIds: [ID]){
      jobs(
        hasTargetTDO: $hasTargetTDO
        id: $id
        status: $status
        applicationStatus: $applicationStatus
        offset: $offset
        limit: $limit
        applicationId: $applicationId
        targetId: $targetId
        clusterId: $clusterId
        scheduledJobIds: $scheduledJobIds
        hasScheduledJobId: $hasScheduledJobId
        orderBy: $orderBy
        dateTimeFilter: $dateTimeFilter
        applicationIds: $applicationIds
        engineIds: $engineIds
        engineCategoryIds: $engineCategoryIds
        dagTemplateIds: $dagTemplateIds
      ) {
          count
          records {
            id
            name
            description
            clusterId
            status
            dagTemplate {
              id
              name
            }
            ${
              isShowTarget
                ? `target {
                    id
                    name
                    status
                  }`
                : ``
            }
        }
      }
    }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'jobs');
}

// job
async function helpGetJobById(client, { jobId }, output) {
  const { gqlClient, options } = client;
  const showTask = output?.showTask;

  const query = `query {
    job(id: "${jobId}") {
      id
      name
      description
      status
      clusterId
      modifiedDateTime
      templateId
      target {
        id
        name
        status
      }
      ${
        showTask
          ? `tasks {
              records {
                id
                engineId
                payload
                runtimePayload
                status
              }
            }`
          : ''
      }
      dagTemplate {
        id
        name
      }
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'job');
}

// updateJobs
async function helpUpdateJobs(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: UpdateJobs!) {
    updateJobs (input: $input){
      records {
        id
        name
        description
        status
        clusterId
        notificationUris
        tasks {
          count
          records {
            id
            notificationUris
            status
            engine {
              id
              name
            }
            taskOutput
          }
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'updateJobs.records');
}

// createJob
async function helpCreateJob(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: CreateJob) {
    createJob (input: $input){
      id
      name
      description
      status
      clusterId
      scheduledJobId
      targetId
      jobConfig
      routes {
        parentIoFolderReferenceId
        childIoFolderReferenceId
      }
      tasks {
        records {
          id
          engineId
          order
          payload
          status,
          notificationUris
        }
      }
      notificationUris
      templateId
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'createJob');
}

// cancelJob
async function helpCancelJob(client, { jobId }) {
  const { gqlClient, options } = client;

  const query = `mutation {
    cancelJob (id: "${jobId}"){
      id
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'cancelJob');
}

// retryJob
async function helpRetryJob(client, { jobId, clusterId }) {
  const { gqlClient, options } = client;

  const query = `mutation ($id: ID!, $clusterId: ID) {
    retryJob (id: $id, clusterId: $clusterId){
      id
      name
      description
      targetId
      status
      routes {
        parentIoFolderReferenceId
        childIoFolderReferenceId
        endpoint
        options
      }
      tasks {
        records {
          id
          status
          isClone
          targetId
          order
        }
      }
    }
  }`;

  const result = await gqlClient.query(
    query,
    { id: jobId, clusterId },
    options
  );
  return _.get(result, 'retryJob');
}

// launchSingleEngineJob
async function helpLaunchSingleEngineJob(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: SingleEngineJobInput!) {
    launchSingleEngineJob (input: $input){
      id
      name
      description
      targetId
      status
      clusterId
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'launchSingleEngineJob');
}

// scheduledJob
async function helpGetScheduledJobById(client, { scheduledJobId }) {
  const { gqlClient, options } = client;

  const query = `query {
    scheduledJob (id: "${scheduledJobId}") {
      id
      name
      description
      allJobTemplates {
        records {
          id
        }
      }
      jobs {
        records {
          id
          name
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'scheduledJob');
}

// scheduledJobs
async function helpGetScheduledJobs(client, input) {
  const { gqlClient, options } = client;

  const query = `query (
    $id: ID
    $name: String
    $runMode: RunMode
    $isActive: Boolean
    $engineId: ID
    $engineCategoryId: ID
    $engineType: [EngineTypeFilter!]
    $offset: Int = 0
    $limit: Int = 30
    $dateTimeFilter: [ScheduledJobDateTimeFilter!]
    $partTimeFilter: [ScheduledJobPartTimeFilter!]
    $primarySourceId: [ID!]
    $primarySourceTypeId: [ID!]
    $hasJobTemplate: Boolean
    $hasRunningJobs: Boolean
    $orderBy: [ScheduledJobOrderBy!]
    $permission: ScheduledJobPermission = viewer
    $clusterId: ID
    $includeOwnedOnly: Boolean = false
    $createdBy: ID
    $allJobTemplatesLimit: Int
    $allJobTemplatesOffset: Int
  ) {
    scheduledJobs (
      id: $id
      name: $name
      runMode: $runMode
      isActive: $isActive
      engineId: $engineId
      engineCategoryId: $engineCategoryId
      engineType: $engineType
      offset: $offset
      limit: $limit
      dateTimeFilter: $dateTimeFilter
      partTimeFilter: $partTimeFilter
      primarySourceId: $primarySourceId
      primarySourceTypeId: $primarySourceTypeId
      hasJobTemplate: $hasJobTemplate
      hasRunningJobs: $hasRunningJobs
      orderBy: $orderBy
      permission: $permission
      clusterId: $clusterId
      includeOwnedOnly: $includeOwnedOnly
      createdBy: $createdBy
    ){
      count
      records {
        id
        name
        description
        details
        parts {
          scheduledDay
          startTime
          stopTime
          scheduleType
          repeatInterval
          repeatIntervalUnit
        }
        permission
        jobs {
          records {
            id
            name
            description
          }
        }
        allJobTemplates(limit: $allJobTemplatesLimit, offset: $allJobTemplatesOffset) {
          count
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'scheduledJobs');
}

// createScheduledJob
async function helpCreateScheduledJob(client, input, output) {
  const { gqlClient, options } = client;
  const isCollaborator = output?.isCollaborator;

  const query = `mutation ($input: CreateScheduledJob!) {
    createScheduledJob (input: $input){
      id
      name
      description
      startDateTime
      stopDateTime
      primarySourceId
      jobTemplateIds
      details
      isPublic
      jobs {
        records {
          id
          jobConfig
          targetId
          status
          tasks {
            records {
              id
              status
              notificationUris
            }
          }
          notificationUris
        }
      }
      contentTemplates {
        data
        schemaId
      }
      ${
        isCollaborator
          ? `collaborators {
              count
              records {
                permission
                organizationId
              }
            }`
          : ''
      }
      affiliates {
        count
        records {
          sourceId
          scheduledJobId
          scheduledDay
          startTime
          stopTime
          status
          startDateTime
          stopDateTime
        }
      }
      jobs{
        records{
            targetId
          }
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'createScheduledJob');
}

// cloneScheduledJob
async function helpCloneScheduledJob(client, { scheduledJobId }) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: CloneScheduledJob!) {
    cloneScheduledJob (input: $input){
      id
      name
      description
      startDateTime
      stopDateTime
    }
  }`;

  const result = await gqlClient.query(
    query,
    { input: { id: scheduledJobId } },
    options
  );
  return _.get(result, 'cloneScheduledJob');
}

// revertScheduledJob
async function helpRevertScheduledJob(client, { scheduledJobId }) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: RevertScheduledJob!) {
    revertScheduledJob (input: $input){
      id
      name
      description
      startDateTime
      stopDateTime
    }
  }`;

  const result = await gqlClient.query(
    query,
    { input: { id: scheduledJobId } },
    options
  );
  return _.get(result, 'revertScheduledJob');
}

// updateScheduledJob
async function helpUpdateScheduledJob(client, input, output) {
  const { gqlClient, options } = client;
  const isCollaborator = output?.isCollaborator;

  const query = `mutation ($input: UpdateScheduledJob!) {
    updateScheduledJob (input: $input){
      id
      name
      description
      startDateTime
      stopDateTime
      details
      isPublic
      isActive
      jobPipelineIds
      primarySourceId
      ingestionStatus
      ingestionStatusId
      jobTemplateIds
      allJobTemplates {
        records {
          id
        }
      }
      ${
        isCollaborator
          ? `collaborators {
              count
              records {
                permission
                organizationId
              }
            }`
          : ''
      }
      contentTemplates {
        data
        schemaId
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'updateScheduledJob');
}

// deleteScheduledJob
async function helpDeleteScheduledJob(client, { scheduledJobId }) {
  const { gqlClient, options } = client;

  const query = `mutation  {
    deleteScheduledJob (id: "${scheduledJobId}"){
      id
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'deleteScheduledJob');
}

// launchScheduledJobs
async function helpLaunchScheduledJobs(client, input, output) {
  const { gqlClient, options } = client;
  const assetType = output?.assetType;

  const query = `mutation ($input: LaunchScheduledJobs!) {
    launchScheduledJobs (input: $input){
      id
      name
      description
      status
      jobConfig
      tasks {
        records {
          id
          status
          engine {
            id
            name
          }
        }
      }
      templateId
      scheduledJobId
      scheduledJob {
        id
      }
      target {
        id
        assets ${assetType ? `(assetType: "${assetType}")` : ''} {
          count
        }
        sourceData {
          scheduledJobId
          sourceId
        }
        thumbnailUrl
        sourceImageUrl
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'launchScheduledJobs');
}

// jobTemplate
async function helpGetJobTemplateById(client, { jobTemplateId }) {
  const { gqlClient, options } = client;

  const query = `query {
    jobTemplate (id: "${jobTemplateId}"){
      id
      jobPipelineId
      taskTemplates {
        count
        records {
          id
          engineId
        }
      }
      jobConfig
    }
  }`;
  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'jobTemplate');
}
// jobTemplates
async function helpGetJobTemplates(client, input) {
  const { gqlClient, options } = client;

  const query = `query (
    $scheduledJobId: ID
    $engineId: ID
    $engineType: [EngineTypeFilter!]
    $offset: Int = 0
    $limit: Int = 30
  ) {
    jobTemplates (
      scheduledJobId: $scheduledJobId
      engineId: $engineId
      engineType: $engineType
      offset: $offset
      limit: $limit
    ){
      records {
        id
       	taskTemplates {
          records {
            id
            engineId
          }
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'jobTemplates');
}

// createScheduledJobContentTemplate
async function helpCreateScheduledJobContentTemplate(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: CreateScheduledJobContentTemplate!) {
    createScheduledJobContentTemplate (input: $input){
      id
      scheduledJobId
      sdoId
      schemaId
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'createScheduledJobContentTemplate');
}

// deleteScheduledJobContentTemplate
async function helpDeleteScheduledJobContentTemplate(
  client,
  { scheduledJobContentTemplateId }
) {
  const { gqlClient, options } = client;

  const query = `mutation {
    deleteScheduledJobContentTemplate (id: "${scheduledJobContentTemplateId}"){
      id
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'deleteScheduledJobContentTemplate');
}

// createJobTemplate
async function helpCreateJobTemplate(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: CreateJobTemplate!) {
    createJobTemplate (input: $input){
      id
      clusterId
      jobConfig
      jobPipelineId
      notificationUris
      taskTemplates {
        records {
          id
          engineId
          notificationUris
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'createJobTemplate');
}

// updateJobTemplate
async function helpUpdateJobTemplate(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: UpdateJobTemplate!) {
    updateJobTemplate (input: $input){
      id
      clusterId
      jobConfig
      jobPipelineId
      taskTemplates {
        records {
          id
          engineId
        }
      }
      notificationUris
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'updateJobTemplate');
}

// deleteJobTemplate
async function helpDeleteJobTemplate(client, { jobTemplateId }) {
  const { gqlClient, options } = client;

  const query = `mutation {
    deleteJobTemplate (id: "${jobTemplateId}"){
      id
    }
  }`;
  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'deleteJobTemplate');
}

// launchJobTemplates
async function helpLaunchJobTemplates(client, input) {
  const { gqlClient, options } = client;

  const query = `mutation ($input: LaunchJobTemplates!) {
    launchJobTemplates (input: $input){
      id
      name
      description
      status
      target {
        id
        details
        name
        isPublic
      }
      notificationUris
    }
  }`;

  const result = await gqlClient.query(query, { input }, options);
  return _.get(result, 'launchJobTemplates');
}

module.exports = {
  helpGetJobs,
  helpGetJobById,
  helpCreateJob,
  helpUpdateJobs,
  helpCancelJob,
  helpRetryJob,
  helpLaunchSingleEngineJob,
  helpGetScheduledJobById,
  helpGetScheduledJobs,
  helpCreateScheduledJob,
  helpCloneScheduledJob,
  helpRevertScheduledJob,
  helpUpdateScheduledJob,
  helpDeleteScheduledJob,
  helpLaunchScheduledJobs,
  helpGetJobTemplateById,
  helpGetJobTemplates,
  helpCreateScheduledJobContentTemplate,
  helpDeleteScheduledJobContentTemplate,
  helpCreateJobTemplate,
  helpUpdateJobTemplate,
  helpDeleteJobTemplate,
  helpLaunchJobTemplates
};
