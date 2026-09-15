import { gql } from 'graphql-request';

// Job management operations

export const CREATE_JOB = gql`
  mutation createJob($input: CreateJob!) {
    createJob(input: $input) {
      id
      name
      description
      status
      routes {
        endpoint
        parentIoFolderReferenceId
        childIoFolderReferenceId
        options
      }
      createdDateTime
      modifiedDateTime
      targetId
      jobConfig
      clusterId
      notificationUris
      tasks {
        records {
          id
          status
          engineId
          payload
          output
          notificationUris
        }
      }
    }
  }
`;

export const GET_JOB = gql`
  query job($id: ID!) {
    job(id: $id) {
      id
      name
      status
      createdDateTime
      modifiedDateTime
      targetId
      clusterId
      applicationId
      templateId
      dagTemplate {
        id
        name
      }
      tasks {
        records {
          id
          status
          engineId
          payload
          output
          createdDateTime
          modifiedDateTime
          failureReason
          taskPayload
          parentTaskId
          buildId
          ioFolders {
            referenceId
            type
            mode
          }
        }
        count
        offset
        limit
      }
    }
  }
`;

export const GET_JOBS = gql`
  query jobs(
    $hasTargetTDO: Boolean
    $offset: Int
    $limit: Int
    $id: ID
    $status: [JobStatusFilter!]
    $applicationStatus: String
    $targetId: ID
    $clusterId: ID
    $scheduledJobIds: [ID!]
    $hasScheduledJobId: Boolean
    $orderBy: [JobSortField!]
    $applicationId: ID
    $applicationIds: [ID]
    $dagTemplateIds: [ID]
    $dateTimeFilter: [JobDateTimeFilter!]
    $engineIds: [ID!]
    $engineCategoryIds: [ID!]
  ) {
    jobs(
      hasTargetTDO: $hasTargetTDO
      id: $id
      applicationStatus: $applicationStatus
      offset: $offset
      limit: $limit
      status: $status
      targetId: $targetId
      clusterId: $clusterId
      scheduledJobIds: $scheduledJobIds
      hasScheduledJobId: $hasScheduledJobId
      orderBy: $orderBy
      applicationId: $applicationId
      applicationIds: $applicationIds
      dagTemplateIds: $dagTemplateIds
      dateTimeFilter: $dateTimeFilter
      engineIds: $engineIds
      engineCategoryIds: $engineCategoryIds
    ) {
      records {
        id
        name
        status
        createdDateTime
        modifiedDateTime
        targetId
        templateId
        clusterId
        applicationId
        target {
          id
          name
          status
        }
        dagTemplate {
          id
          name
        }
      }
      count
      offset
      limit
    }
  }
`;

export const LAUNCH_JOB_TEMPLATE = gql`
  mutation launchJobTemplates($input: LaunchJobTemplates!) {
    launchJobTemplates(input: $input) {
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
  }
`;

export const LAUNCH_SINGLE_ENGINE_JOB = gql`
  mutation launchSingleEngineJob($input: SingleEngineJobInput!) {
    launchSingleEngineJob(input: $input) {
      id
      name
      description
      targetId
      status
      clusterId
      tasks {
        count
        records {
          id
          engineId
          executionPreferences {
            priority
          }
        }
      }
    }
  }
`;

export const CANCEL_JOB = gql`
  mutation cancelJob($id: ID!) {
    cancelJob(id: $id) {
      id
      message
    }
  }
`;

export const GET_TASK = gql`
  query task($id: ID!) {
    task(id: $id) {
      id
      jobId
      engineId
      status
      payload
      output
      taskOutput
      completedDateTime
      warnings {
        reason
        message
        referenceId
      }
      createdDateTime
      modifiedDateTime
      failureReason
      taskPayload
      parentTaskId
      buildId
      ioFolders {
        referenceId
        type
        mode
      }
      engine {
        id
        name
        category {
          name
        }
      }
    }
  }
`;

export const GET_TASKS = gql`
  query tasks(
    $jobId: ID
    $engineId: [ID]
    $dateTimeFilter: [TaskDateTimeFilter!]
    $applicationIds: [ID]
    $offset: Int
    $limit: Int
  ) {
    tasks(
      jobId: $jobId
      engineId: $engineId
      dateTimeFilter: $dateTimeFilter
      applicationIds: $applicationIds
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        jobId
        engineId
        applicationId
        status
        payload
        output
        createdDateTime
        modifiedDateTime
        failureReason
        buildId
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_TASK = gql`
  mutation updateTask($input: UpdateTask!) {
    updateTask(input: $input) {
      id
      name
      description
      status
      notificationUris
      failureReason
      failureMessage
      taskOutput
      modifiedDateTime
      startedDateTime
      completedDateTime
      warnings {
        reason
        message
        referenceId
      }
      childTasks {
        id
        name
        description
      }
    }
  }
`;

export const UPDATE_JOBS_STATUS = gql`
  mutation updateJobs($input: UpdateJobs!) {
    updateJobs(input: $input) {
      count
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
  }
`;

export const RETRY_JOB = gql`
  mutation retryJob($id: ID!, $clusterId: ID) {
    retryJob(id: $id, clusterId: $clusterId) {
      id
      status
      modifiedDateTime
      targetId
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
  }
`;

export const CREATE_SCHEDULED_JOB = gql`
  mutation createScheduledJob($input: CreateScheduledJob!) {
    createScheduledJob(input: $input) {
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
        count
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
    }
  }
`;

export const GET_SCHEDULED_JOB = gql`
  query scheduledJob($id: ID!) {
    scheduledJob(id: $id) {
      id
      name
      runMode
      isActive
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_SCHEDULED_JOBS = gql`
  query scheduledJobs(
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
    scheduledJobs(
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
    ) {
      records {
        id
        name
        runMode
        isActive
        createdDateTime
        modifiedDateTime
        allJobTemplates(
          limit: $allJobTemplatesLimit
          offset: $allJobTemplatesOffset
        ) {
          count
        }
      }
      count
      offset
      limit
    }
  }
`;

export const UPDATE_SCHEDULED_JOB = gql`
  mutation updateScheduledJob($input: UpdateScheduledJob!) {
    updateScheduledJob(input: $input) {
      id
      name
      runMode
      isActive
      modifiedDateTime
    }
  }
`;

export const DELETE_SCHEDULED_JOB = gql`
  mutation deleteScheduledJob($id: ID!) {
    deleteScheduledJob(id: $id) {
      id
      message
    }
  }
`;

export const LAUNCH_SCHEDULED_JOBS = gql`
  mutation launchScheduledJobs($input: LaunchScheduledJobs!) {
    launchScheduledJobs(input: $input) {
      id
      tasks {
        records {
          id
          status
        }
      }
    }
  }
`;

export const CREATE_CLUSTER = gql`
  mutation createCluster($input: CreateCluster!) {
    createCluster(input: $input) {
      id
      name
      type
      organizationId
      memorySizeBytes
      storageSizeBytes
      paused
      containerTag
      allowedEngines
      createdDateTime
      modifiedDateTime
      collaborators {
        count
        records {
          organizationId
          permission
        }
      }
      subscriptions {
        count
        records {
          userId
          emailAddress
          id
          createdDateTime
          modifiedDateTime
          isActive
        }
      }
      tags
      status
      clusterConfig
      mediaStorage
      mediaStoragePath
      restartTimeUTC
      isGroup
      clusterGroupId
      edgeVersion
    }
  }
`;

/**
 * Creates two clusters inside the same cluster group in ONE request, under
 * aliases. Kept as a single operation (rather than two `createCluster` calls)
 * because the group-membership negatives rely on both creates being evaluated in
 * the same serially-executed mutation, the way the legacy citest exercised them.
 */
export const CREATE_CLUSTERS_IN_GROUP = gql`
  mutation createClustersInGroup(
    $input1: CreateCluster!
    $input2: CreateCluster!
  ) {
    clusterInGroup1: createCluster(input: $input1) {
      id
      name
      isGroup
      clusterGroupId
    }
    clusterInGroup2: createCluster(input: $input2) {
      id
      name
      isGroup
      clusterGroupId
    }
  }
`;

export const GET_CLUSTER = gql`
  query cluster($id: ID!) {
    cluster(id: $id) {
      id
      name
      type
      organizationId
      memorySizeBytes
      storageSizeBytes
      paused
      containerTag
      allowedEngines
      createdDateTime
      modifiedDateTime
      collaborators {
        count
        records {
          organizationId
          permission
        }
      }
      tags
      status
      clusterConfig
      state
      stateLastUpdatedDateTime
      mediaStorage
      mediaStoragePath
      managementNodeID
      restartTimeUTC
      targetStatus
      edgeVersion
    }
  }
`;

/**
 * Cluster read that additionally walks the cluster's jobs, tasks and nodes.
 * Separate from GET_CLUSTER so the common read does not pay for (or depend on)
 * those three list resolvers.
 */
export const GET_CLUSTER_DETAIL = gql`
  query clusterDetail($id: ID!) {
    cluster(id: $id) {
      id
      jobs {
        records {
          id
        }
      }
      tasks {
        records {
          id
        }
      }
      clusterConfig
      state
      stateLastUpdatedDateTime
      mediaStorage
      mediaStoragePath
      managementNodeID
      restartTimeUTC
      nodes {
        records {
          id
          metrics
        }
      }
      targetStatus
    }
  }
`;

/** Reads a cluster group together with the clusters it contains. */
export const GET_CLUSTER_GROUP = gql`
  query clusterGroup($id: ID!) {
    cluster(id: $id) {
      id
      name
      isGroup
      clusterGroupId
      clusters {
        count
        records {
          id
          isGroup
          clusterGroupId
        }
      }
    }
  }
`;

export const GET_CLUSTERS = gql`
  query clusters(
    $id: ID
    $name: String
    $type: ClusterType
    $nameMatch: StringMatch = contains
    $offset: Int = 0
    $limit: Int = 30
    $tagMatch: StringMatch = startsWith
    $tags: [String!]
    $dateTimeFilter: [ClusterDateTimeFilter!]
    $orderBy: [ClusterOrderBy!]
    $organizationId: ID
    $clusterGroupId: ID
    $clusterGroupIds: [ID]
    $isGroup: Boolean = false
    $status: ClusterStatus
    $allowedEngines: [ID!]
    $edgeVersion: Int
  ) {
    clusters(
      id: $id
      name: $name
      type: $type
      nameMatch: $nameMatch
      offset: $offset
      limit: $limit
      tagMatch: $tagMatch
      tags: $tags
      dateTimeFilter: $dateTimeFilter
      orderBy: $orderBy
      organizationId: $organizationId
      clusterGroupId: $clusterGroupId
      clusterGroupIds: $clusterGroupIds
      isGroup: $isGroup
      status: $status
      allowedEngines: $allowedEngines
      edgeVersion: $edgeVersion
    ) {
      records {
        id
        name
        type
        default
        organizationId
        memorySizeBytes
        storageSizeBytes
        paused
        containerTag
        allowedEngines
        createdDateTime
        modifiedDateTime
        collaborators {
          count
          records {
            organizationId
            permission
          }
        }
        tags
        status
        isGroup
        clusterGroupId
        clusterConfig
        state
        stateLastUpdatedDateTime
        mediaStorage
        mediaStoragePath
        managementNodeID
        restartTimeUTC
        targetStatus
      }
      count
      offset
      limit
    }
  }
`;

export const GET_CLUSTER_TAGS = gql`
  query clusterTags($matchType: StringMatch, $match: String!) {
    clusterTags(matchType: $matchType, match: $match)
  }
`;

export const UPDATE_CLUSTER = gql`
  mutation updateCluster($input: UpdateCluster!) {
    updateCluster(input: $input) {
      id
      name
      type
      organizationId
      memorySizeBytes
      storageSizeBytes
      paused
      containerTag
      allowedEngines
      modifiedDateTime
      collaborators {
        count
        records {
          organizationId
          permission
        }
      }
      subscriptions {
        count
        records {
          isActive
        }
      }
      tags
      status
      clusterConfig
      mediaStoragePath
      managementNodeID
      restartTimeUTC
      edgeVersion
    }
  }
`;

export const UPDATE_CLUSTER_STATE = gql`
  mutation updateClusterState($input: UpdateClusterState!) {
    updateClusterState(input: $input) {
      id
      name
      nodes {
        records {
          id
          metrics
        }
      }
      targetStatus
    }
  }
`;

export const PAUSE_CLUSTER = gql`
  mutation pauseCluster($input: PauseCluster!) {
    pauseCluster(input: $input) {
      id
      name
    }
  }
`;

export const UNPAUSE_CLUSTER = gql`
  mutation unpauseCluster($input: UnpauseCluster!) {
    unpauseCluster(input: $input) {
      id
      name
    }
  }
`;

export const DELETE_CLUSTER = gql`
  mutation deleteCluster($id: ID!) {
    deleteCluster(id: $id) {
      id
      message
    }
  }
`;

export const CREATE_CLUSTER_NODE = gql`
  mutation createClusterNode($input: CreateClusterNode!) {
    createClusterNode(input: $input) {
      id
      name
      clusterId
      nodeConfig
      createdDateTime
      modifiedDateTime
    }
  }
`;

export const GET_ENGINE_JWT = gql`
  mutation getEngineJWT($input: getEngineJWT!) {
    getEngineJWT(input: $input) {
      token
      engineId
    }
  }
`;

export const APPEND_WARNING_TO_TASK = gql`
  mutation appendWarningToTask(
    $taskId: ID
    $reason: String!
    $message: String
    $referenceId: ID
  ) {
    appendWarningToTask(
      taskId: $taskId
      reason: $reason
      message: $message
      referenceId: $referenceId
    )
  }
`;

export const CREATE_JOB_TEMPLATE = gql`
  mutation createJobTemplate($input: CreateJobTemplate!) {
    createJobTemplate(input: $input) {
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
  }
`;

export const GET_JOB_TEMPLATE = gql`
  query jobTemplate($id: ID!) {
    jobTemplate(id: $id) {
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
  }
`;

export const GET_JOB_TEMPLATES = gql`
  query jobTemplates(
    $scheduledJobId: ID
    $engineId: ID
    $engineType: [EngineTypeFilter!]
    $offset: Int = 0
    $limit: Int = 30
  ) {
    jobTemplates(
      scheduledJobId: $scheduledJobId
      engineId: $engineId
      engineType: $engineType
      offset: $offset
      limit: $limit
    ) {
      records {
        id
        taskTemplates {
          records {
            id
            engineId
          }
        }
      }
      count
      offset
      limit
    }
  }
`;

export const ADD_TASKS_TO_JOBS = gql`
  mutation addTasksToJobs($input: AddTasksToJobs) {
    addTasksToJobs(input: $input) {
      createdTasks {
        id
        name
        description
      }
    }
  }
`;

export const CREATE_TASK_TEMPLATE = gql`
  mutation createTaskTemplate($input: CreateTaskTemplate!) {
    createTaskTemplate(input: $input) {
      id
      jobTemplateId
      engineId
      payload
      notificationUris
      childTasks {
        records {
          id
          engineId
        }
      }
    }
  }
`;

export const UPDATE_TASK_TEMPLATE = gql`
  mutation updateTaskTemplate($input: UpdateTaskTemplate!) {
    updateTaskTemplate(input: $input) {
      id
      jobTemplateId
      engineId
      payload
      notificationUris
      childTasks {
        records {
          id
          engineId
        }
      }
    }
  }
`;

export const GET_TASK_TEMPLATE = gql`
  query taskTemplate($id: ID!) {
    taskTemplate(id: $id) {
      id
      jobTemplateId
      childTasks {
        records {
          id
          engineId
        }
      }
    }
  }
`;

export const DELETE_TASK_TEMPLATE = gql`
  mutation deleteTaskTemplate($id: ID!) {
    deleteTaskTemplate(id: $id) {
      id
    }
  }
`;

export const UPDATE_JOB_TEMPLATE = gql`
  mutation updateJobTemplate($input: UpdateJobTemplate!) {
    updateJobTemplate(input: $input) {
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
  }
`;

export const DELETE_JOB_TEMPLATE = gql`
  mutation deleteJobTemplate($id: ID!) {
    deleteJobTemplate(id: $id) {
      id
    }
  }
`;

export const GET_JOB_PIPELINE = gql`
  query getJob($id: ID, $status: [JobStatusFilter!], $limit: Int = 30) {
    jobs(id: $id, status: $status, limit: $limit) {
      records {
        id
      }
    }
  }
`;
