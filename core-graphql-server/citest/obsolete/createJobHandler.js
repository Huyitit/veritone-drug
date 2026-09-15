const { get } = require('lodash');
const { NewGQL } = require('../helpers/gql');

describe('Create job handler', () => {
  // create TDO
  // get an engine
  // create job subscribe
  // wait for cache refresh
  // create asset
  // wait for job
  // get job

  const gql = NewGQL();
  let tdoId = null;
  let engineId = null;
  let assetId = null;
  beforeAll(async () => {
    const query = `{
      engines(state: active, libraryRequired: false) {
          records {
              id
              builds {
                  records {
                    id
                  }
              }
          }
      }
  }`;
    const { engines: { records } } = await gql(query);
    for (let r of records) {
      const { id, builds } = r;
      if (builds.records.length > 0) {
        engineId = id;
        return;
      }
    }
    throw new Error('could not get an engine with deployed build');
  });

  beforeAll(async () => {
    const now = new Date();
    const startDateTime = now.toISOString();
    const stopDateTime = new Date(now.getTime() + 15 * 60e3).toISOString();
    const query = `mutation {
      createTDO(input: {
        startDateTime: "${startDateTime}",
        stopDateTime: "${stopDateTime}",
        source: ""
      }) {
        id
      }
    }`;
    const { createTDO } = await gql(query);
    tdoId = createTDO.id;
  });
  afterAll(async () => {
    const query = `
    mutation {
      deleteTDO(id: "${tdoId}") {
        id
      }
    }`;
    await gql(query);
  });

  beforeAll(async () => {
    const now = new Date().toISOString();
    const querySubscribeEvent = `mutation {
      subscribeEvent(input: {
        eventType: "asset",
        eventName: "AssetUploaded",
        application: "system",
        delivery: {
          name: CreateJob,
          params: {
            targetId: "${tdoId}",
            engineId: "${engineId}",
            startAt: "${now}"
          }
        }
        conditions: {
          operator: "and",
          conditions: [
            { field: "recordingId", value: "${tdoId}", operator: "eq" }
          ]
        }
      })
    }`;
    const { subscribeEvent } = await gql(querySubscribeEvent);
    console.log('[subscribeEvent]', subscribeEvent);
    // wait for routing cache
    await sleep(3000);
    const queryCreateAsset = `mutation ($input: CreateAsset!) {
      createAsset(input: $input) {
        id
      }
    }`;
    const input = {
      containerId: tdoId,
      contentType: 'image/png',
      assetType: 'image',
      uri: 'http://'
    };
    const { createAsset: { id } } = await gql(queryCreateAsset, { input });
    assetId = id;
    console.log('[CreatedAsset]', assetId);
  });

  async function GetJob() {
    const query = `query ($tdoId: ID, $engineId: ID!) {
      jobs (targetId: $tdoId, engineIds: [$engineId]) {
        records { 
          applicationId
          tasks { records { targetId engineId payload } } 
        }
      }
    }`;
    console.log(`[CheckJobs] target ${tdoId} engine ${engineId}`);
    const { jobs: { records } } = await gql(query, { tdoId, engineId });
    return Array.isArray(records) ? records[0] : null;
  }

  const sleep = (t = 1000) => new Promise(r => setTimeout(r, t));
  async function GetJobPayload(retry) {
    const job = await GetJob();
    if (!job) {
      retry--;
      if (retry < 1) {
        throw new Error(`no job was created`);
      }
      console.log(`[GetJobPayload] retry ${retry}`);
      await sleep(2000);
      // wait for 2 seconds
      return GetJobPayload(retry);
    }
    return get(job, 'tasks.records[0].payload');
  }

  it('should create job', async () => {
    await sleep(2000);
    const payload = await GetJobPayload(3);
    if (!payload) {
      throw new Error('job was created without payload');
    }
    const assetIdInJob = get(payload, 'AssetUploaded.assetId');
    if (assetIdInJob != assetId) {
      throw new Error(`expect assetId ${assetId} get ${assetIdInJob}`);
    }
  });
});

describe('delete artifacts created during the test', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
  });

  it('unsubscribe from the event', async () => {
   
  });
});
