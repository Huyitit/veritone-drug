const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const moment = require('moment');
const tdoHelper = require('../../helpers/tdo.js');
const engineHelper = require('../../helpers/engine.js');
const jobHelper = require('../../helpers/job.js');
const taskHelper = require('../../helpers/task.js');
const config = helpers.config;
const _ = require('lodash');
const { safe } = require('../../helpers/cleanup/utils');
let jobTemplateId,
  taskTemplateId,
  jobTemplateIdNotificationUris,
  taskTemplateIdNotificationUris;
let noCreatesTDOEngineId,
  isJobTemplateUpdated,
  isJobTemplateNotificationUrisUpdated;
const citestMarker = global.citestMarker || 'citest-should-delete';

const jobIds = [];

describe('citest_jobs: Job Template tests', () => {
  let tdoId;
  let createdTdoIds = [];
  let gqlClient;

  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    // Tdo
    const time = moment.utc().subtract(2, 'day');
    const newTdo = await tdoHelper.helpCreateTDO(
      { gqlClient },
      {
        status: 'uploaded',
        isPublic: true,
        startDateTime: time.toISOString(),
        stopDateTime: time.add(3, 'm').toISOString()
      }
    );
    tdoId = newTdo.id;
    expect(tdoId).toBeDefined();

    // Engine
    noCreatesTDOEngineId = await getEngine(gqlClient);
    expect(noCreatesTDOEngineId).toBeDefined();
  });

  afterAll(async () => {
    if (jobIds.length) {
      for (const jobId of jobIds) {
        await safe(`cancel job ${jobId}`, async () =>
          jobHelper.helpCancelJob({ gqlClient }, { jobId })
        );
      }
    }

    // Delete TDO
    for (const createdTdoId of createdTdoIds) {
      await safe(`delete created target ${createdTdoId}`, async () =>
        tdoHelper.helpDeleteTDO({ gqlClient }, { id: createdTdoId })
      );
    }

    if (tdoId) {
      await safe(`delete TDO ${tdoId}`, async () =>
        tdoHelper.helpDeleteTDO({ gqlClient }, { id: tdoId })
      );
    }
  });

  it('Finds engine that does not create TDO', async () => {
    if (_.isNil(noCreatesTDOEngineId)) {
      noCreatesTDOEngineId = await getEngine(gqlClient);
    }
    expect(noCreatesTDOEngineId).toBeDefined();
  });

  it('creates a job template', async () => {
    jobTemplateId = await createJobTemplate(gqlClient);
    expect(jobTemplateId).toBeDefined();
  });

  it('creates a job template - include notificationUris', async () => {
    jobTemplateIdNotificationUris =
      await createJobTemplateNotificationUris(gqlClient);
    expect(jobTemplateIdNotificationUris).toBeDefined();
  });

  it('fails to create job template when payload and payloadString are both provided', async () => {
    const createJobTemplatePromise = jobHelper.helpCreateJobTemplate(
      { gqlClient },
      {
        taskTemplates: [
          {
            engineId: noCreatesTDOEngineId,
            payload: { foo: 'bar' },
            payloadString: `{"foo":1}`
          }
        ]
      }
    );

    await expect(createJobTemplatePromise).rejects.toThrow('invalid_input');
  });

  it('fails to create job template when payloadString is invalid JSON', async () => {
    const createJobTemplatePromise = jobHelper.helpCreateJobTemplate(
      { gqlClient },
      {
        taskTemplates: [
          {
            engineId: noCreatesTDOEngineId,
            payloadString: `{"foo"}`
          }
        ]
      }
    );

    await expect(createJobTemplatePromise).rejects.toThrow('invalid_input');
  });

  it('updates a job template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    const result = await jobHelper.helpUpdateJobTemplate(
      { gqlClient },
      {
        id: jobTemplateId,
        jobConfig: {
          createTDOInput: { details: { tags: ['foo'] } },
          jobPipelineStage: 1
        },
        notificationUris: ['www.com']
      }
    );

    jobTemplateId = _.get(result, 'id');
    expect(jobTemplateId).toBeDefined();
    expect(_.get(result, 'jobConfig.createTDOInput.details.tags')).toEqual([
      'foo'
    ]);
    expect(_.get(result, 'notificationUris')).toEqual(['www.com']);
    isJobTemplateUpdated = true;
  });

  it('updates a job template - notificationUris', async () => {
    if (_.isNil(jobTemplateIdNotificationUris)) {
      jobTemplateIdNotificationUris =
        await createJobTemplateNotificationUris(gqlClient);
    }

    const result = await jobHelper.helpUpdateJobTemplate(
      { gqlClient },
      {
        id: jobTemplateIdNotificationUris,
        notificationUris: ['http://localhost1', 'http://localhost2']
      }
    );

    expect(_.get(result, 'id')).toBeDefined();
    expect(_.get(result, 'notificationUris')).toHaveLength(2);
    expect(_.get(result, 'notificationUris[1]')).toEqual('http://localhost2');

    isJobTemplateNotificationUrisUpdated = true;
  });

  it('adds a task template', async () => {
    taskTemplateId = await addTaskTemplate(gqlClient);
    expect(taskTemplateId).toBeDefined();
  });

  it('adds a task template - notificationUris', async () => {
    taskTemplateIdNotificationUris =
      await addTaskTemplateNotificationUris(gqlClient);
    expect(taskTemplateIdNotificationUris).toBeDefined();
  });

  it('updates a task template', async () => {
    if (_.isNil(taskTemplateId)) {
      taskTemplateId = await addTaskTemplate(gqlClient);
    }

    const result = await taskHelper.helpUpdateTaskTemplate(
      { gqlClient },
      { id: taskTemplateId, payload: { foo2: 'bar3' } }
    );

    taskTemplateId = _.get(result, 'id');
    expect(taskTemplateId).toBeDefined();
    expect(_.get(result, 'jobTemplateId')).toEqual(jobTemplateId);
    expect(_.get(result, 'payload.foo2')).toEqual('bar3');
  });

  it('updates a task template - notificationUris', async () => {
    if (_.isNil(taskTemplateIdNotificationUris)) {
      taskTemplateIdNotificationUris =
        await addTaskTemplateNotificationUris(gqlClient);
    }

    const result = await taskHelper.helpUpdateTaskTemplate(
      { gqlClient },
      {
        id: taskTemplateIdNotificationUris,
        notificationUris: [
          'http://localhostTask',
          'http://localhostTask1',
          'http://localhostTask2'
        ]
      }
    );

    const updateTaskTemplate = result;

    expect(updateTaskTemplate).toBeDefined();
    expect(updateTaskTemplate.id).toEqual(taskTemplateIdNotificationUris);
    expect(updateTaskTemplate.notificationUris).toHaveLength(3);
    expect(updateTaskTemplate.notificationUris[2]).toEqual(
      'http://localhostTask2'
    );
  });

  it('fails to update task template when payload and payloadString are both provided', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    const taskPromise = taskHelper.helpUpdateTaskTemplate(
      { gqlClient },
      {
        id: taskTemplateId,
        payload: { foo: 'bar' },
        payloadString: `{"foo":1}`
      }
    );

    await expect(taskPromise).rejects.toThrow('invalid_input');
  });

  it('fails to update task template when payloadString is invalid JSON', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    const taskPromise = taskHelper.helpUpdateTaskTemplate(
      { gqlClient },
      { id: taskTemplateId, payloadString: `{"foo"}` }
    );
    await expect(taskPromise).rejects.toThrow('invalid_input');
  });

  it('launches a job template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    const result = await jobHelper.helpLaunchJobTemplates(
      { gqlClient },
      { ids: [jobTemplateId], targetInfo: { targetId: tdoId } }
    );

    const launchJobTemplates = result;

    expect(launchJobTemplates).toBeDefined();
    expect(launchJobTemplates).toHaveLength(1);

    const jobId = _.get(launchJobTemplates, '[0].id');
    expect(jobId).toBeDefined();
    jobIds.push(jobId);
  });

  it('launches a job template - notificationUris', async () => {
    if (_.isNil(jobTemplateIdNotificationUris)) {
      jobTemplateIdNotificationUris =
        await createJobTemplateNotificationUris(gqlClient);
    }

    const result = await jobHelper.helpLaunchJobTemplates(
      { gqlClient },
      { ids: [jobTemplateIdNotificationUris], targetInfo: { targetId: tdoId } }
    );

    const launchJobTemplates = result;

    expect(launchJobTemplates).toBeDefined();
    expect(launchJobTemplates).toHaveLength(1);
    const jobId = _.get(launchJobTemplates, '[0].id');
    expect(jobId).toBeDefined();
    jobIds.push(jobId);

    if (isJobTemplateNotificationUrisUpdated) {
      expect(launchJobTemplates[0].notificationUris).toHaveLength(2);
      expect(launchJobTemplates[0].notificationUris[1]).toEqual(
        'http://localhost2'
      );
    }
  });

  it('launches a job template with createTargetInfo', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    const variables = {
      details: {
        'veritone-permissions': {
          acls: [
            {
              groupId: 'ea738f5b-9f52-45f3-8db8-3167bfd625fe',
              permission: 'owner'
            }
          ],
          isPublic: true
        },
        tags: []
      }
    };

    const result = await jobHelper.helpLaunchJobTemplates(
      { gqlClient },
      {
        ids: [jobTemplateId],
        createTargetInfo: {
          name: `${citestMarker} test name`,
          details: variables.details
        },
        payload: {
          mode: 'offline',
          url: 'https://cdn.filestackcontent.com/NGe98IbjSh6Xbwm7Lf0l',
          offlineTaskId: 'not_available',
          recordStartTime: moment().valueOf(),
          recordEndTime: moment().add(10, 's').valueOf()
        }
      }
    );

    expect(_.get(result, '[0].target')).toBeDefined();
    expect(_.get(result, '[0].target.name')).toEqual(
      citestMarker + ' test name'
    );
    const createdTargetId = _.get(result, '[0].target.id');
    expect(createdTargetId).toBeDefined();
    createdTdoIds.push(createdTargetId);

    expect(_.get(result, '[0].target.isPublic')).toEqual(true);
    const jobId = _.get(result, '[0].id');
    expect(jobId).toBeDefined();
    jobIds.push(jobId);
  });

  it('gets a job and task template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(gqlClient);
    }

    if (_.isNil(taskTemplateId)) {
      taskTemplateId = await addTaskTemplate(gqlClient);
    }

    const [task, job] = await Promise.all([
      taskHelper.helpGetTaskTemplateById({ gqlClient }, { taskTemplateId }),
      jobHelper.helpGetJobTemplateById({ gqlClient }, { jobTemplateId })
    ]);

    expect(_.get(task, 'jobTemplateId')).toEqual(jobTemplateId);
    expect(_.get(task, 'id')).toEqual(taskTemplateId);
    expect(_.get(job, 'id')).toEqual(jobTemplateId);
    expect(_.get(job, 'taskTemplates.count')).toEqual(2);
    if (isJobTemplateUpdated) {
      expect(_.get(job, 'jobConfig.createTDOInput.details.tags')).toEqual([
        'foo'
      ]);
    }
  });

  it('deletes a task template', async () => {
    if (_.isNil(taskTemplateId)) {
      return;
    }

    const deleteTaskTemplatePromise = taskHelper.helpDeleteTaskTemplate(
      { gqlClient },
      { taskTemplateId }
    );
    await expect(deleteTaskTemplatePromise).rejects.toThrow('not_implemented');
    /*
    const errors = _.get(response, 'body.errors');
    expect(errors, "errors [" + JSON.stringify(errors) + "] to be undefined").to.be.undefined;
    expect(_.get(result, 'deleteTaskTemplate.id')).toEqual(
      taskTemplateId
    );
    */
  });

  it('cleans up all objects created', async () => {
    await tdoHelper.helpDeleteTDO({ gqlClient }, { id: tdoId });
    tdoId = null;

    if (_.isNil(taskTemplateId)) {
      return;
    }

    const deleteJobTemplatePromise = jobHelper.helpDeleteJobTemplate(
      { gqlClient },
      { jobTemplateId }
    );
    await expect(deleteJobTemplatePromise).rejects.toThrow('not_implemented');
  });
});

/**
 * get an engine for testing
 * @param {*} gqlClient gqlClient
 * @returns engineId
 */
async function getEngine(gqlClient) {
  const engineData = await engineHelper.helpGetEngines(
    { gqlClient },
    {
      createsTDO: false,
      category: 'Transcription',
      state: ['active'],
      limit: 10,
      buildStatus: ['deployed']
    }
  );

  const tdoData = await tdoHelper.helpGetTDOs(
    { gqlClient },
    {
      limit: 1,
      dateTimeFilter: [
        {
          field: 'startDateTime',
          fromDateTime: moment().subtract(7, 'day').toISOString()
        }
      ]
    }
  );

  let noCreatesTDOEngineId;
  const tdoId = _.get(tdoData, 'records[0].id');
  expect(tdoId).toBeDefined();
  const engines = _.get(engineData, 'engines.records');
  expect(engines).toBeDefined();
  engines.forEach((engine) => {
    const builds = _.get(engine, 'builds.records');
    expect(builds).toBeDefined();
    if (builds.length) {
      noCreatesTDOEngineId = engine.id;
    }
  });

  expect(noCreatesTDOEngineId).toBeDefined();

  return noCreatesTDOEngineId;
}

/**
 * Create a job template
 * @param {*} gqlClient gqlClient
 * @returns jobTemplateId
 */
async function createJobTemplate(gqlClient) {
  const result = await jobHelper.helpCreateJobTemplate(
    { gqlClient },
    {
      jobConfig: {
        createTDOInput: { details: { tags: ['foo', 'bar'] } },
        jobPipelineStage: 1
      },
      taskTemplates: [
        { engineId: noCreatesTDOEngineId, payload: { foo: 'bar' } }
      ]
    }
  );

  const jobTemplateId = _.get(result, 'id');
  expect(jobTemplateId).toBeDefined();
  expect(_.get(result, 'jobConfig.createTDOInput.details.tags')).toEqual([
    'foo',
    'bar'
  ]);
  expect(_.get(result, 'jobPipelineId')).toBeNull();

  return jobTemplateId;
}

/**
 * Create a job template
 * @param {*} gqlClient gqlClient
 * @returns jobTemplateId
 */
async function createJobTemplateNotificationUris(gqlClient) {
  const result = await jobHelper.helpCreateJobTemplate(
    { gqlClient },
    {
      jobConfig: { createTDOInput: { details: { tags: ['foo', 'bar'] } } },
      notificationUris: ['http://localhost1'],
      taskTemplates: [
        {
          engineId: noCreatesTDOEngineId,
          notificationUris: ['http://localhostTask']
        }
      ]
    }
  );

  const createJobTemplate = result;

  expect(createJobTemplate).toBeDefined();
  expect(createJobTemplate.notificationUris).toHaveLength(1);
  expect(createJobTemplate.notificationUris[0]).toEqual('http://localhost1');

  const taskTemplates = _.get(createJobTemplate, 'taskTemplates.records');

  expect(taskTemplates).toHaveLength(1);
  expect(taskTemplates[0].notificationUris).toHaveLength(1);
  expect(taskTemplates[0].notificationUris[0]).toEqual('http://localhostTask');

  return createJobTemplate.id;
}

async function addTaskTemplate(gqlClient) {
  if (_.isNil(jobTemplateId)) {
    jobTemplateId = await createJobTemplate(gqlClient);
  }

  const result = await taskHelper.helpCreateTaskTemplate(
    { gqlClient },
    {
      jobTemplateId: jobTemplateId,
      engineId: noCreatesTDOEngineId,
      payload: { foo2: 'bar2' }
    }
  );

  const taskTemplateId = _.get(result, 'id');
  expect(taskTemplateId).toBeDefined();
  expect(_.get(result, 'jobTemplateId')).toEqual(jobTemplateId);
  expect(_.get(result, 'payload.foo2')).toEqual('bar2');

  return taskTemplateId;
}

async function addTaskTemplateNotificationUris(gqlClient) {
  if (_.isNil(jobTemplateIdNotificationUris)) {
    jobTemplateIdNotificationUris =
      await createJobTemplateNotificationUris(gqlClient);
  }

  const result = await taskHelper.helpCreateTaskTemplate(
    { gqlClient },
    {
      jobTemplateId: jobTemplateIdNotificationUris,
      engineId: noCreatesTDOEngineId,
      notificationUris: ['http://localhostTask', 'http://localhostTask1']
    }
  );

  const createTaskTemplate = result;

  expect(createTaskTemplate).toBeDefined();
  expect(createTaskTemplate.id).toBeDefined();
  expect(createTaskTemplate.jobTemplateId).toEqual(
    jobTemplateIdNotificationUris
  );
  expect(createTaskTemplate.notificationUris).toHaveLength(2);
  expect(createTaskTemplate.notificationUris[1]).toEqual(
    'http://localhostTask1'
  );

  return createTaskTemplate.id;
}
