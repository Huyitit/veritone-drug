import { gql } from 'graphql-request';

// Scheduled job focused operations extracted from legacy helper queries.

export const SCHEDULED_JOB_GET_BY_ID = gql`
  query scheduledJobGetById($id: ID!) {
    scheduledJob(id: $id) {
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
  }
`;

export const SCHEDULED_JOB_GET_LIST = gql`
  query scheduledJobGetList(
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
        allJobTemplates(
          limit: $allJobTemplatesLimit
          offset: $allJobTemplatesOffset
        ) {
          count
        }
      }
    }
  }
`;

export const SCHEDULED_JOB_CREATE = gql`
  mutation scheduledJobCreate($input: CreateScheduledJob!) {
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
      collaborators {
        count
        records {
          permission
          organizationId
        }
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

export const SCHEDULED_JOB_CLONE = gql`
  mutation scheduledJobClone($input: CloneScheduledJob!) {
    cloneScheduledJob(input: $input) {
      id
      name
      description
      startDateTime
      stopDateTime
    }
  }
`;

export const SCHEDULED_JOB_REVERT = gql`
  mutation scheduledJobRevert($input: RevertScheduledJob!) {
    revertScheduledJob(input: $input) {
      id
      name
      description
      startDateTime
      stopDateTime
    }
  }
`;

export const SCHEDULED_JOB_UPDATE = gql`
  mutation scheduledJobUpdate($input: UpdateScheduledJob!) {
    updateScheduledJob(input: $input) {
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
      collaborators {
        count
        records {
          permission
          organizationId
        }
      }
      contentTemplates {
        data
        schemaId
      }
    }
  }
`;

export const SCHEDULED_JOB_DELETE = gql`
  mutation scheduledJobDelete($id: ID!) {
    deleteScheduledJob(id: $id) {
      id
      message
    }
  }
`;

export const SCHEDULED_JOB_LAUNCH = gql`
  mutation scheduledJobLaunch($input: LaunchScheduledJobs!) {
    launchScheduledJobs(input: $input) {
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
        assets {
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
  }
`;

export const SCHEDULED_JOB_CONTENT_TEMPLATE_CREATE = gql`
  mutation scheduledJobContentTemplateCreate(
    $input: CreateScheduledJobContentTemplate!
  ) {
    createScheduledJobContentTemplate(input: $input) {
      id
      scheduledJobId
      sdoId
      schemaId
    }
  }
`;

export const SCHEDULED_JOB_CONTENT_TEMPLATE_DELETE = gql`
  mutation scheduledJobContentTemplateDelete($id: ID!) {
    deleteScheduledJobContentTemplate(id: $id) {
      id
    }
  }
`;
