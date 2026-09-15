const _ = require('lodash');
const { TEST_CONFIG } = require('./config');

async function deleteEngines(gqlClient, adminOptions) {
  try {
    console.log('Starting engine delete...');

    const engines = await getEngineToDelete(gqlClient, adminOptions);

    if (engines.length === 0) {
      console.log('No organizations found for engine cleanup');
      return;
    }

    for (const engine of engines) {
      await processDeleteEngine(gqlClient, adminOptions, engine);
    }

    console.log('Engine cleanup completed');
  } catch (error) {
    console.error('Error in Engine cleanup:', error.message);
    throw error;
  }
}

async function getEngineToDelete(gqlClient, adminOptions) {
  const gql = `
        query {
  engines(filter: { name: "${TEST_CONFIG.userNamePrefix}" nameMatch: contains } limit: 100) {
    records{
      id
      name
      tasks {
        records {
          id
          name
          status
        }
      }
      builds{
      records{
        name
        id
        status
      }
    }  
    }
  }
}
    `;
  const result = await gqlClient.query(gql, {}, adminOptions);
  return _.get(result, 'engines.records');
}

async function processDeleteEngine(gqlClient, adminOptions, engine) {
  const { id: engineId, tasks: engineTasks, builds: engineBuilds } = engine;
  const tasks = _.get(engineTasks, 'records');
  await Promise.all(
    tasks.map((task) => abortEngineTask(gqlClient, adminOptions, task))
  );
  const builds = _.get(engineBuilds, 'records');
  await Promise.all(
    builds.map((build) =>
      deleteEngineBuild(gqlClient, adminOptions, build, engineId)
    )
  );
  await deleteEngine(gqlClient, adminOptions, engineId);
  console.log(`Aborted all tasks for engine ${engineId}`);
}

async function abortEngineTask(gqlClient, adminOptions, task) {
  const { id: taskId, status: taskStatus } = task;
  const outputData = JSON.stringify({ test: 'true' });
  try {
    if (taskStatus === 'aborted') {
      console.log('Task already aborted skipping ', taskId);
      return;
    }
    const mutationGql = `
        mutation {
  updateTask (input: {
    id: "${taskId}",
  	outputString: ${JSON.stringify(outputData)},
    status: aborted
  }) {
    id
    status
  }
}
    `;
    const result = await gqlClient.query(mutationGql, {}, adminOptions);
    const status = _.get(result, 'updateTask.status');
    if (status !== 'aborted') {
      return new Error('Aborting unsuccessfully');
    }
    console.log('Abort successfully for task: ', taskId);
  } catch (err) {
    console.error(
      `Failed to abort engine task for task ${taskId}`,
      err.message
    );
  }
}

async function deleteEngineBuild(
  gqlClient,
  adminOptions,
  engineBuild,
  engineId
) {
  const { id: engineBuildId } = engineBuild;
  try {
    const mutationGql = `
        mutation {
      deleteEngineBuild: deleteEngineBuild(input: {
        id: "${engineBuildId}"
        engineId: "${engineId}"
      }) {
        id
        message
      }
}
    `;
    const result = await gqlClient.query(mutationGql, {}, adminOptions);
    const message = _.get(result, 'deleteEngineBuild.message');
    if (!message || message !== `Engine build ${engineBuildId} deleted`) {
      return new Error(`Failed deleting engineBuild ${engineBuildId}`);
    }
  } catch (err) {
    console.error(
      `Failed to delete engine build ${engineBuildId}`,
      err.message
    );
  }
}

async function deleteEngine(gqlClient, adminOptions, engineId) {
  try {
    const mutationGql = `
        mutation {
      deleteEngine: deleteEngine(id: "${engineId}") {
        id
        message
      }
    }`;

    const result = await gqlClient.query(mutationGql, {}, adminOptions);
    const message = _.get(result, 'deleteEngine.message');
    if (!message || message !== `engine ${engineId} deleted`) {
      return new Error(`Failed deleting engine ${engineId}`);
    }
  } catch (err) {
    console.error(`Failed to delete engine ${engineId}`, err.message);
  }
}

module.exports = {
  deleteEngines
};
