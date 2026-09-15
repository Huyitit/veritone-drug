const _ = require('lodash');

// task
async function helpGetTaskById(client, { taskId }) {
  const { gqlClient, options } = client;

  const query = `query {
    task (id: "${taskId}") {
      id
      name
      description
      taskOutput
      warnings {
        reason,
        message,
        referenceId
      }
      childTasks {
        id
        name
        description
        taskOutput,
        warnings {
          reason,
          message,
          referenceId
        }
      }
    }
  }`;
  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'task');
}

// tasks
async function helpGetTasks(client, input) {
  const { gqlClient, options } = client;

  const query = `query (
    $id: ID
    $taskTemplateId: ID
    $jobId: ID
    $applicationIds: [ID]
    $engineId: [ID]
    $dateTimeFilter: [TaskDateTimeFilter!]
    $offset: Int = 0
    $limit: Int = 30
  ) {
    tasks (
      id: $id
      taskTemplateId: $taskTemplateId
      jobId: $jobId
      applicationIds: $applicationIds
      engineId: $engineId
      dateTimeFilter: $dateTimeFilter
      offset: $offset
      limit: $limit
    ){
      records {
        id
        name
        description
        status
        applicationId
        engineId
        createdDateTime
        modifiedDateTime
        childTasks {
          id
          name
        }
        
      }
    }
  }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'tasks.records');
}

// taskTemplate
async function helpGetTaskTemplateById(client, { taskTemplateId }) {
  const { gqlClient, options } = client;

  const query = `query {
    taskTemplate (id: "${taskTemplateId}") {
      id
      jobTemplateId
      childTasks {
        records {
          id
          engineId
        }
      }
    }
  }`;

  const result = await gqlClient.query(query, {}, options);
  return _.get(result, 'taskTemplate');
}

// createTaskLog
async function helpCreateTaskLog(client, input) {
  const { gqlClient, options } = client;

  const mutation = `mutation ($input: CreateTaskLog!) {
    createTaskLog (input: $input){
      uri
      text
      jsondata
    }
  }`;

  const result = await gqlClient.query(mutation, { input }, options);
  return _.get(result, 'createTaskLog');
}

// updateTask
async function helpUpdateTask(client, input) {
  const { gqlClient, options } = client;

  const mutation = `mutation ($input: UpdateTask) {
    updateTask (input: $input){
      id
      name
      description
      status
      notificationUris
      failureReason
      failureMessage
      taskOutput,
      modifiedDateTime
      startedDateTime
      completedDateTime
      warnings {
        reason,
        message,
        referenceId
      }
      childTasks {
        id
        name
        description
      }
    }
  }`;

  const result = await gqlClient.query(mutation, { input }, options);
  return _.get(result, 'updateTask');
}

// addTasksToJobs
async function helpAddTasksToJobs(client, input) {
  const { gqlClient, options } = client;

  const mutation = `mutation ($input: AddTasksToJobs) {
    addTasksToJobs (input: $input){
      createdTasks {
        id
        name
        description
      }
    }
  }`;

  const result = await gqlClient.query(mutation, { input }, options);
  return _.get(result, 'addTasksToJobs.createdTasks');
}

// createTaskTemplate
async function helpCreateTaskTemplate(client, input) {
  const { gqlClient, options } = client;

  const mutation = `mutation ($input: CreateTaskTemplate!) {
    createTaskTemplate (input: $input){
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
  }`;

  const result = await gqlClient.query(mutation, { input }, options);
  return _.get(result, 'createTaskTemplate');
}

// updateTaskTemplate
async function helpUpdateTaskTemplate(client, input) {
  const { gqlClient, options } = client;

  const mutation = `mutation ($input: UpdateTaskTemplate!) {
    updateTaskTemplate (input: $input){
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
  }`;

  const result = await gqlClient.query(mutation, { input }, options);
  return _.get(result, 'updateTaskTemplate');
}

// deleteTaskTemplate
async function helpDeleteTaskTemplate(client, { taskTemplateId }) {
  const { gqlClient, options } = client;

  const mutation = `mutation {
    deleteTaskTemplate (id: "${taskTemplateId}") {
      id
    }
  }`;

  const result = await gqlClient.query(mutation, {}, options);
  return _.get(result, 'deleteTaskTemplate');
}

async function helpAppendWarningToTask(client, input) {
  const { gqlClient, options } = client;
  const query = `mutation appendWarningToTask (
      $taskId: ID
      $reason: String!
      $message: String
      $referenceId: ID
    ) {
      appendWarningToTask (
        taskId: $taskId
        reason: $reason
        message: $message
        referenceId: $referenceId
      )
    }`;

  const result = await gqlClient.query(query, input, options);
  return _.get(result, 'appendWarningToTask');
}

module.exports = {
  helpGetTasks,
  helpGetTaskById,
  helpGetTaskTemplateById,
  helpCreateTaskLog,
  helpUpdateTask,
  helpAddTasksToJobs,
  helpCreateTaskTemplate,
  helpUpdateTaskTemplate,
  helpDeleteTaskTemplate,
  helpAppendWarningToTask
};
