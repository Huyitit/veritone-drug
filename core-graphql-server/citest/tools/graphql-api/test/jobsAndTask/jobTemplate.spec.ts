import { helpers } from '../../src/helpers/index';
const moment = require('moment');
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  BuildStatus,
  EngineState,
  TemporalDataObjectDateTimeField
} from '../../src/gql';
import * as _ from 'lodash';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';

let jobTemplateId: string | null = null;
let taskTemplateId: string | null = null;
let jobTemplateIdNotificationUris: string | null = null;
let taskTemplateIdNotificationUris: string | null = null;

let noCreatesTDOEngineId: string | null = null;
let isJobTemplateUpdated = false;
let isJobTemplateNotificationUrisUpdated = false;

let sdkClient: GraphqlClient;
let requestHeaders: Record<string, string> | undefined;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;

describe('citest_jobs: Job Template tests', () => {
  let tdoId: string | null = null;
  const jobIds: string[] = [];
  beforeAll(async () => {
    const env = config.env;

    const bootstrapClient = await createGraphqlClient(
      AuthType.SESSION_TOKEN,
      env
    );

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = isolatedSuperadmin.client;

    expect(sdkClient.sessionToken).toBeDefined();
    requestHeaders = isolatedSuperadmin.options;

    const time = moment.utc().subtract(2, 'day');
    const newTdoRes = await sdkClient.sdk.createTDO(
      {
        input: {
          status: 'uploaded',
          isPublic: true,
          startDateTime: time.toISOString(),
          stopDateTime: time.clone().add(3, 'm').toISOString()
        }
      },
      requestHeaders
    );
    tdoId = _.get(newTdoRes, 'data.createTDO.id', null);
    expect(tdoId).toBeDefined();

    noCreatesTDOEngineId = await getEngine();
    expect(noCreatesTDOEngineId).toBeDefined();
  });

  afterAll(async () => {
    if (taskTemplateIdNotificationUris) {
      await safe('deleteTaskTemplate', async () =>
        sdkClient.sdk.deleteTaskTemplate({
          id: taskTemplateIdNotificationUris!
        })
      );
    }

    if (jobIds.length) {
      const promises = jobIds.map((jobId) =>
        safe('deleteJob', async () =>
          sdkClient.sdk.cancelJob({ id: jobId }, requestHeaders)
        )
      );
      await Promise.all(promises);
    }

    if (jobTemplateIdNotificationUris) {
      await safe('deleteJobTemplate', async () =>
        sdkClient.sdk.deleteJobTemplate({
          id: jobTemplateIdNotificationUris!
        })
      );
    }

    if (tdoId) {
      await safe('deleteTDO', async () =>
        sdkClient.sdk.deleteTDO({ id: tdoId! }, requestHeaders)
      );
    }

    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  it('Finds engine that does not create TDO', async () => {
    if (_.isNil(noCreatesTDOEngineId)) {
      noCreatesTDOEngineId = await getEngine();
    }
    expect(noCreatesTDOEngineId).toBeDefined();
  });

  it('creates a job template', async () => {
    jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    expect(jobTemplateId).toBeDefined();
  });

  it('creates a job template - include notificationUris', async () => {
    jobTemplateIdNotificationUris = await createJobTemplateNotificationUris(
      sdkClient,
      requestHeaders
    );
    expect(jobTemplateIdNotificationUris).toBeDefined();
  });

  it('creates a job template with correct errors on invalid input', async () => {
    const createJobTemplatePromise = sdkClient.sdk.createJobTemplate(
      {
        input: {
          taskTemplates: [
            {
              engineId: noCreatesTDOEngineId!,
              payload: { foo: 'bar' },
              payloadString: '{"foo":1}'
            }
          ]
        }
      },
      requestHeaders
    );

    await expect(createJobTemplatePromise).rejects.toThrow('invalid_input');
  });

  it('creates a job template with correct errors on invalid input', async () => {
    const createJobTemplatePromise = sdkClient.sdk.createJobTemplate(
      {
        input: {
          taskTemplates: [
            {
              engineId: noCreatesTDOEngineId!,
              payloadString: '{"foo"}'
            }
          ]
        }
      },
      requestHeaders
    );

    await expect(createJobTemplatePromise).rejects.toThrow('invalid_input');
  });

  it('updates a job template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    }

    const updateJobTempRes = await sdkClient.sdk.updateJobTemplate({
      input: {
        id: jobTemplateId!,
        jobConfig: {
          createTDOInput: { details: { tags: ['foo'] } },
          jobPipelineStage: 1
        },
        notificationUris: ['www.com']
      }
    });

    const result = _.get(updateJobTempRes, 'data.updateJobTemplate');
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
      jobTemplateIdNotificationUris = await createJobTemplateNotificationUris(
        sdkClient,
        requestHeaders
      );
    }

    const updateJobTempRes = await sdkClient.sdk.updateJobTemplate({
      input: {
        id: jobTemplateIdNotificationUris!,
        notificationUris: ['http://localhost1', 'http://localhost2']
      }
    });

    const result = _.get(updateJobTempRes, 'data.updateJobTemplate');

    expect(_.get(result, 'id')).toBeDefined();
    expect(_.get(result, 'notificationUris')).toHaveLength(2);
    expect(_.get(result, 'notificationUris[1]')).toEqual('http://localhost2');

    isJobTemplateNotificationUrisUpdated = true;
  });

  it('adds a task template', async () => {
    taskTemplateId = await addTaskTemplate();
    expect(taskTemplateId).toBeDefined();
  });

  it('adds a task template - notificationUris', async () => {
    taskTemplateIdNotificationUris =
      await addTaskTemplateNotificationUris();
    expect(taskTemplateIdNotificationUris).toBeDefined();
  });

  it('updates a task template', async () => {
    if (_.isNil(taskTemplateId)) {
      taskTemplateId = await addTaskTemplate();
    }

    const updateTaskTemplateRes = await sdkClient.sdk.updateTaskTemplate({
      input: { id: taskTemplateId!, payload: { foo2: 'bar3' } }
    });

    const result = _.get(updateTaskTemplateRes, 'data.updateTaskTemplate');
    taskTemplateId = _.get(result, 'id');
    expect(taskTemplateId).toBeDefined();
    expect(_.get(result, 'jobTemplateId')).toEqual(jobTemplateId);
    expect(_.get(result, 'payload.foo2')).toEqual('bar3');
  });

  it('updates a task template - notificationUris', async () => {
    if (_.isNil(taskTemplateIdNotificationUris)) {
      taskTemplateIdNotificationUris =
        await addTaskTemplateNotificationUris();
    }

    const updateTaskTemplateRes = await sdkClient.sdk.updateTaskTemplate({
      input: {
        id: taskTemplateIdNotificationUris!,
        notificationUris: [
          'http://localhostTask',
          'http://localhostTask1',
          'http://localhostTask2'
        ]
      }
    });

    const result = _.get(updateTaskTemplateRes, 'data.updateTaskTemplate');
    expect(result).toBeDefined();
    expect(result.id).toEqual(taskTemplateIdNotificationUris);
    expect(result.notificationUris).toHaveLength(3);
    expect(result?.notificationUris?.[2]).toEqual('http://localhostTask2');
  });

  it('updates a task template with correct errors on invalid input', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    }

    const taskPromise = sdkClient.sdk.updateTaskTemplate({
      input: {
        id: taskTemplateId!,
        payload: { foo: 'bar' },
        payloadString: '{"foo":1}'
      }
    });

    await expect(taskPromise).rejects.toThrow('invalid_input');
  });

  it('updates a task template with correct errors on invalid input', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    }

    const taskPromise = sdkClient.sdk.updateTaskTemplate({
      input: {
        id: taskTemplateId!,
        payloadString: '{"foo"}'
      }
    });

    await expect(taskPromise).rejects.toThrow('invalid_input');
  });

  it('launches a job template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    }

    const createJobs = await sdkClient.sdk.launchJobTemplates(
      { input: { ids: [jobTemplateId!], targetInfo: { targetId: tdoId! } } },
      requestHeaders
    );

    const jobs = _.get(createJobs, 'data.launchJobTemplates');
    expect(jobs).toBeDefined();
    expect(jobs).toHaveLength(1);
    const jobId = _.get(jobs, '[0].id');
    expect(jobId).toBeTruthy();
    jobIds.push(jobId!);
  });

  it('launches a job template - notificationUris', async () => {
    if (_.isNil(jobTemplateIdNotificationUris)) {
      jobTemplateIdNotificationUris = await createJobTemplateNotificationUris(
        sdkClient,
        requestHeaders
      );
    }

    const result = await sdkClient.sdk.launchJobTemplates(
      {
        input: {
          ids: [jobTemplateIdNotificationUris!],
          targetInfo: { targetId: tdoId! }
        }
      },
      requestHeaders
    );

    const launchJobTemplates = _.get(result, 'data.launchJobTemplates');

    expect(launchJobTemplates).toBeDefined();
    expect(launchJobTemplates).toHaveLength(1);
    const jobId = _.get(launchJobTemplates, '[0].id');
    expect(jobId).toBeTruthy();
    jobIds.push(jobId!);
    if (isJobTemplateNotificationUrisUpdated) {
      expect(launchJobTemplates?.[0]?.notificationUris).toHaveLength(2);
      expect(launchJobTemplates?.[0]?.notificationUris?.[1]).toEqual(
        'http://localhost2'
      );
    }
  });

  it('launches a job template with createTargetInfo', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
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

    const result = await sdkClient.sdk.launchJobTemplates(
      {
        input: {
          ids: [jobTemplateId!],
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
      },
      requestHeaders
    );

    const launchJobTemplates = _.get(result, 'data.launchJobTemplates');
    const jobId = _.get(launchJobTemplates, '[0].id');
    expect(jobId).toBeTruthy();
    jobIds.push(jobId!);
    expect(_.get(launchJobTemplates, '[0].target')).toBeDefined();
    expect(_.get(launchJobTemplates, '[0].target.name')).toEqual(
      `${citestMarker} test name`
    );
    expect(_.get(launchJobTemplates, '[0].target.isPublic')).toEqual(true);
    const targetId = _.get(launchJobTemplates, '[0].target.id');
    expect(targetId).toBeTruthy();
    await safe('deleteTDO', async () =>
      sdkClient.sdk.deleteTDO({ id: targetId! }, requestHeaders)
    );
  });

  it('gets a job and task template', async () => {
    if (_.isNil(jobTemplateId)) {
      jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
    }

    if (_.isNil(taskTemplateId)) {
      taskTemplateId = await addTaskTemplate();
    }

    const [taskTemplate, jobTemplateRes] = await Promise.all([
      sdkClient.sdk.taskTemplate({ id: taskTemplateId! }, requestHeaders),
      sdkClient.sdk.jobTemplate({ id: jobTemplateId! }, requestHeaders)
    ]);
    const jobTemplate = _.get(jobTemplateRes, 'data.jobTemplate');

    expect(_.get(taskTemplate, 'data.taskTemplate.jobTemplateId')).toEqual(
      jobTemplateId
    );
    expect(_.get(taskTemplate, 'data.taskTemplate.id')).toEqual(taskTemplateId);
    expect(_.get(jobTemplate, 'id')).toEqual(jobTemplateId);
    expect(_.get(jobTemplate, 'taskTemplates.count')).toEqual(2);
    if (isJobTemplateUpdated) {
      expect(
        _.get(jobTemplate, 'jobConfig.createTDOInput.details.tags')
      ).toEqual(['foo']);
    }
  });

  it('deletes a task template', async () => {
    await safe('deleteTaskTemplate', async () =>
      sdkClient.sdk.deleteTaskTemplate({
        id: taskTemplateId!
      })
    );
  });

  it('cleans up all objects created', async () => {
    if (tdoId) {
      await safe('deleteTDO', async () => {
        await sdkClient.sdk.deleteTDO({ id: tdoId! }, requestHeaders);
        tdoId = null;
      });
    }

    await safe('deleteJobTemplate', async () =>
      sdkClient.sdk.deleteJobTemplate({
        id: jobTemplateId!
      })
    );
  });
});

async function getEngine(): Promise<string> {
  const engineData = await sdkClient.sdk.engines({
    createsTDO: false,
    category: 'Transcription',
    state: [EngineState.Active],
    limit: 10,
    buildStatus: [BuildStatus.Deployed]
  });

  const tdoData = await sdkClient.sdk.temporalDataObjects({
    limit: 1,
    dateTimeFilter: [
      {
        field: TemporalDataObjectDateTimeField.StartDateTime,
        fromDateTime: moment().subtract(7, 'day').toISOString()
      }
    ]
  });

  let engineId: string | null = null;
  const tdoId = _.get(tdoData, 'data.temporalDataObjects.records[0].id');
  expect(tdoId).toBeDefined();

  const engines = _.get(engineData, 'data.engines.records');
  expect(engines).toBeDefined();

  engines?.forEach((engine: any) => {
    const builds = _.get(engine, 'builds.records');
    expect(builds).toBeDefined();
    if (builds.length) {
      engineId = engine.id;
    }
  });

  expect(engineId).toBeDefined();
  return engineId!;
}

async function createJobTemplate(
  client: GraphqlClient,
  headers?: Record<string, string>
): Promise<string> {
  const result = await client.sdk.createJobTemplate(
    {
      input: {
        jobConfig: {
          createTDOInput: { details: { tags: ['foo', 'bar'] } },
          jobPipelineStage: 1
        },
        taskTemplates: [
          { engineId: noCreatesTDOEngineId!, payload: { foo: 'bar' } }
        ]
      }
    },
    headers
  );

  const jobTemplate = _.get(result, 'data.createJobTemplate');
  const newJobTemplateId = _.get(jobTemplate, 'id');
  expect(newJobTemplateId).toBeDefined();
  expect(_.get(jobTemplate, 'jobConfig.createTDOInput.details.tags')).toEqual([
    'foo',
    'bar'
  ]);
  expect(_.get(jobTemplate, 'jobPipelineId')).toBeNull();

  return newJobTemplateId;
}

async function createJobTemplateNotificationUris(
  client: GraphqlClient,
  headers?: Record<string, string>
): Promise<string> {
  const result = await client.sdk.createJobTemplate(
    {
      input: {
        jobConfig: { createTDOInput: { details: { tags: ['foo', 'bar'] } } },
        notificationUris: ['http://localhost1'],
        taskTemplates: [
          {
            engineId: noCreatesTDOEngineId!,
            notificationUris: ['http://localhostTask']
          }
        ]
      }
    },
    headers
  );

  const jobTemplate = _.get(result, 'data.createJobTemplate');
  expect(jobTemplate).toBeDefined();
  expect(jobTemplate.notificationUris).toHaveLength(1);
  expect(jobTemplate?.notificationUris?.[0]).toEqual('http://localhost1');

  const taskTemplates = _.get(jobTemplate, 'taskTemplates.records');
  expect(taskTemplates).toHaveLength(1);
  expect(taskTemplates[0].notificationUris).toHaveLength(1);
  expect(taskTemplates?.[0]?.notificationUris?.[0]).toEqual('http://localhostTask');

  return jobTemplate.id;
}

async function addTaskTemplate(): Promise<string> {
  if (_.isNil(jobTemplateId)) {
    jobTemplateId = await createJobTemplate(sdkClient, requestHeaders);
  }

  const result = await sdkClient.sdk.createTaskTemplate({
    input: {
      jobTemplateId,
      engineId: noCreatesTDOEngineId,
      payload: { foo2: 'bar2' }
    }
  });

  const newTaskTemplateId = _.get(result, 'data.createTaskTemplate.id');
  expect(newTaskTemplateId).toBeDefined();
  expect(_.get(result, 'data.createTaskTemplate.jobTemplateId')).toEqual(
    jobTemplateId
  );
  expect(_.get(result, 'data.createTaskTemplate.payload.foo2')).toEqual('bar2');

  return newTaskTemplateId;
}

async function addTaskTemplateNotificationUris(): Promise<string> {
  if (_.isNil(jobTemplateIdNotificationUris)) {
    jobTemplateIdNotificationUris = await createJobTemplateNotificationUris(
      sdkClient,
      requestHeaders
    );
  }

  const createTaskTemplateRes = await sdkClient.sdk.createTaskTemplate({
    input: {
      jobTemplateId: jobTemplateIdNotificationUris,
      engineId: noCreatesTDOEngineId,
      notificationUris: ['http://localhostTask', 'http://localhostTask1']
    }
  });

  const result = _.get(createTaskTemplateRes, 'data.createTaskTemplate');
  expect(result).toBeDefined();
  expect(result.id).toBeDefined();
  expect(result.jobTemplateId).toEqual(jobTemplateIdNotificationUris);
  expect(result.notificationUris).toHaveLength(2);
  expect(result?.notificationUris?.[1]).toEqual('http://localhostTask1');

  return result.id;
}
