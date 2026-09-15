const fs = require('fs');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const tdoHelper = require('../helpers/tdo.js');
const { createIsolatedSuperadmin } = require('../helpers/superadminSession');

const config = helpers.config;
const env = config.env;

const _ = require('lodash');
const https = require('https');
const extract = require('extract-zip');
const rimraf = require('rimraf');
const util = require('../../util.js')({});
const now = Date.now();
const nowMinus15 = now - 15 * 60 * 1000;
const nowMinus30 = now - 30 * 60 * 1000;

const authUrl = config.core_admin_url || `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || `https://api.${env}.veritone.com/v3/graphql`;
const eventingEnabled = helpers.canTestEventing();

let engineId;
let engineDisplayName;
let engineSnackName;
const sourceId = -1; // private source
const tempFolder = `/tmp/citest-${Date.now()}`;
const videoUploadName = 'movie.mp4';
const videoUploadPath = './citest/data/movie.mp4';
const formats = ['srt', 'ttml', 'txt', 'vtt'];

let tdoId, jobId, taskId, assetId;
let exportRequestId, assetUri;
let exportRequestId2, assetUri2; // media includes

let userTokenAuth;

const variables = {
  engineResultJson: {
    output: {
      generatedDateUTC: '0001-01-01T00:00:00Z',
      series: [
        {
          startTimeMs: 80,
          stopTimeMs: 330,
          words: [
            {
              word: 'Language',
              confidence: 0.36,
              bestPath: true,
              utteranceLength: 1
            }
          ],
          language: 'en'
        },
        {
          startTimeMs: 370,
          stopTimeMs: 540,
          words: [
            {
              word: 'is',
              confidence: 0.64,
              bestPath: true,
              utteranceLength: 1
            }
          ],
          language: 'en'
        }
      ]
    }
  }
};

async function downloadFile(uri, fileName) {
  return new Promise((resolve, reject) => {
    https.get(uri, (response) => {
      const file = fs.createWriteStream(fileName);
      response.pipe(file);
      file.on('error', (err) => {
        reject(err);
      });
      file.on('finish', () => {
        resolve(fileName);
      });
    });
  });
}

describe('Export request tests', () => {
  let gqlClient;
  let session;

  // T46: This suite previously ran on the SHARED superadmin session
  // (sys_graphql_citest_superadmin), which is an admin MEMBER of every test org it creates
  // (createOrganization enrolls the caller via addAdminToOrganization). Many concurrent specs
  // (MAX_WORKERS=2) delete their test org in teardown; org-delete enumerates all active members
  // of that org and calls removeAllUserSessions(userId) on each — which is GLOBAL, not
  // org-scoped, and DELetes every one of the superadmin's session tokens, including this
  // suite's, at any point during the run. Bearer validation is per-token-key existence, so a
  // killed token can never recover. This is the exact T14/T10/T12 mechanism, hitting this file
  // (see T46). Fix: use a throwaway superadmin that is a member of no org except its own, so no
  // other spec's org-delete/user-delete can ever enumerate or kill its session. See
  // helpers/superadminSession.js.
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    await gqlClient.connect();
    session = await createIsolatedSuperadmin({ gqlClient });
    gqlClient.userAuth = session.options; // preserve implicit-auth call sites below

    // This file also built its own explicit auth-header object (`userTokenAuth`) directly from
    // the shared connect() token instead of relying on gqlClient's implicit userAuth. Point it
    // at the isolated superadmin's session too, so those call sites are no longer collaterally
    // killable either.
    userTokenAuth = session.options;
  });

  afterAll(async () => {
    await session?.cleanup();
  });

  it('create TDOs', async () => {
    const query = `mutation {
      tdo: createTDO(input: {
        startDateTime: ${nowMinus30}
        stopDateTime: ${nowMinus15}
        sourceData: {
          sourceId: "${sourceId}"
        }
      }) {
        id
      }
    }`;
    const result = await gqlClient.query(query, null, userTokenAuth);
    tdoId = _.get(result, 'tdo.id');
    expect(tdoId).toBeDefined();
  });

  it('get dedicated engine for citest', async () => {
    const query = `query {
      engines(name: "citest") {
        records {
          id
          name
        }
      }
    }`;

    // T46: previously `true` (routes to gqlClient.tokenAuth), which is populated from the
    // SHARED superadmin's apiToken on every connect() call (including the bootstrap connect()
    // inside createIsolatedSuperadmin) — still a shared-session dependency. `engines` carries no
    // scope that requires that specific credential type, so use the isolated superadmin's
    // session explicitly instead.
    const result = await gqlClient.query(query, null, session.options);

    const engineGQLTest = _.get(result, 'engines.records[0]');

    expect(engineGQLTest).toBeDefined();
    expect(engineGQLTest.id).toBeDefined();
    expect(engineGQLTest.name).toBeDefined();

    engineId = engineGQLTest.id;
    engineDisplayName = engineGQLTest.name;
    engineSnackName = _.snakeCase(engineDisplayName);
    _.set(variables, 'engineResultJson.output.sourceEngineId', engineId);
    _.set(
      variables,
      'engineResultJson.output.sourceEngineName',
      engineDisplayName
    );
  });

  it('create a job', async () => {
    const query = `mutation {
      createJob: createJob(input: {
        retries: 1
        targetId: "${tdoId}"
        tasks: [{
          testTask: true
          engineId: "${engineId}"
          payload: {
            target: "it"
          }
        }]
      }) {
        id
        tasks (targetId: "${tdoId}") {
          records {
            id
          }
        }
      }
    }`;

    const result = await gqlClient.query(query, null, userTokenAuth);
    jobId = _.get(result, 'createJob.id');
    taskId = _.get(result, 'createJob.tasks.records[0].id');
    expect(jobId).toBeDefined();
  });

  // if getting 413 "Payload Too Large" in ai13s update nginx config in the cluster:
  // https://github.com/veritone/aiware-charts/pull/847/files#diff-e697c20399d8f7b93b8875c7c19c174c5aab5b223c8ccffbc2fe6f72c56bb4a5R38
  it('create asset with media', async () => {
    const queryWithVideo = `mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "video/mp4"
        description: "a video file"
        assetType: "media"
        setAsPrimary: true
      }) {
        id
        uri
        assetType
      }
    }`;

    const result = await gqlClient.uploadFile(
      queryWithVideo,
      videoUploadName,
      videoUploadPath
    );
    assetId = _.get(result, 'createAsset.id');
    expect(assetId).toBeDefined();
  });

  it('upload engine result', async () => {
    variables.engineResultJson.taskId = taskId;
    variables.engineResultJson.output.taskId = taskId;
    const query = `mutation($engineResultJson: UploadEngineResult!) {
      uploadEngineResult(input: $engineResultJson) {
        id
        jsondata
      }
    }`;

    const result = await gqlClient.query(query, variables, userTokenAuth);
    const uploadEngineResult = _.get(result, 'uploadEngineResult');
    expect(uploadEngineResult).toBeDefined();
  });

  it('return engine results', async () => {
    const query = `query {
      engineResults (
        tdoId: "${tdoId}"
        engineIds: ["${engineId}"]
      ) {
        records {
          tdoId
          engineId
          jsondata
        }
      }
    }`;
    const result = await gqlClient.query(query, null, userTokenAuth);
    const engineResults = _.get(result, 'engineResults');
    expect(engineResults).toBeDefined();
    expect(_.get(engineResults, 'records[0].jsondata')).toBeDefined();
  });

  it('create an export request', async () => {
    const query = `
      mutation {
        createExportRequest(input: {
        includeMedia: false,
        outputConfigurations: [{engineId: "${engineId}", formats: [{extension: "srt"},{extension: "ttml"}, {extension: "txt"}, {extension: "vtt"}]}],
        tdoData: [
          {
            tdoId: ${tdoId}
          }
        ]
        }) {
          id
          status
          requestorId
          organizationId
          createdDateTime
          modifiedDateTime
          assetUri
        }
      }
    `;

    const result = await gqlClient.query(query);
    exportRequestId = _.get(result, 'createExportRequest.id');
    expect(exportRequestId).toBeDefined();
    expect(_.get(result, 'createExportRequest.status')).toEqual('incomplete');
  });

  it('create an export request include media', async () => {
    const query = `
      mutation {
        createExportRequest(input: {
        includeMedia: true,
        outputConfigurations: [{engineId: "${engineId}", formats: [{extension: "srt"},{extension: "ttml"}, {extension: "txt"}, {extension: "vtt"}]}],
        tdoData: [
          {
            tdoId: ${tdoId}
          }
        ]
        }) {
          id
          status
          requestorId
          organizationId
          createdDateTime
          modifiedDateTime
          assetUri
        }
      }
    `;

    const result = await gqlClient.query(query);

    exportRequestId2 = _.get(result, 'createExportRequest.id');
    expect(exportRequestId2).toBeDefined();
    expect(_.get(result, 'createExportRequest.status')).toEqual('incomplete');
  });

  xit('get an export request and download result', async () => {
    const query = `
    query {
      exportRequest: exportRequest(id: "${exportRequestId}") {
        id
        status
        assetUri
        organizationId
        createdDateTime
        modifiedDateTime
      }
    }
    `;
    if (eventingEnabled) {
      // wait for core-eventing to process export request
      await util.sleep(5000);
    }

    const result = await gqlClient.query(query);
    expect(_.get(result, 'exportRequest.id')).toEqual(exportRequestId);
    if (eventingEnabled) {
      console.log('Testing core eventing occurred with Export Request...');
      expect(_.get(result, 'exportRequest.status')).toEqual('complete');
      assetUri = _.get(result, 'exportRequest.assetUri');
      expect(assetUri).toBeDefined();

      const fileName = `${tempFolder}/${exportRequestId}.zip`;

      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
      }
      // download export request and verify result
      await downloadFile(assetUri, fileName);

      extract(
        fileName,
        { dir: `${tempFolder}/${exportRequestId}` },
        function (err) {
          if (err) {
            expect.fail(`Cannot extract: ${fileName}`);
          }
          // check extract file with right format
          for (let i = 0; i < formats.length; i++) {
            const extension = formats[i];
            const filePath = `${tempFolder}/${exportRequestId}/${engineSnackName}/${extension}/${tdoId}.${extension}`;
            expect(fs.existsSync(filePath)).toEqual(true);
          }
        }
      );
    } else {
      console.log('Skip testing core eventing occurred with Export Request...');
    }
  });

  xit('get an export request for media includes the media', async () => {
    const query = `
    query {
      exportRequest: exportRequest(id: "${exportRequestId2}") {
        id
        status
        assetUri
        organizationId
        createdDateTime
        modifiedDateTime
      }
    }
    `;
    if (eventingEnabled) {
      // wait for core-eventing to process export request
      await util.sleep(5000);
    }

    const result = await gqlClient.query(query);
    expect(_.get(result, 'exportRequest.id')).toEqual(exportRequestId2);
    if (eventingEnabled) {
      console.log('Testing core eventing occurred with Export Request...');

      expect(
        _.get(result, 'exportRequest.status'),
        JSON.stringify(result, null, 2)
      ).toEqual('complete');
      assetUri2 = _.get(result, 'exportRequest.assetUri');
      expect(assetUri2).toBeDefined();

      const fileName2 = `${tempFolder}/${exportRequestId2}.zip`;

      if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
      }
      await downloadFile(assetUri2, fileName2);

      extract(
        fileName2,
        { dir: `${tempFolder}/${exportRequestId2}` },
        function (err) {
          if (err) {
            expect.fail(`Cannot extract: ${fileName2}`);
          }
          // check extract file with right format
          for (let i = 0; i < formats.length; i++) {
            const extension = formats[i];
            const filePath = `${tempFolder}/${exportRequestId2}/${engineSnackName}/${extension}/${tdoId}.${extension}`;
            expect(fs.existsSync(filePath)).toEqual(true);
          }
          // check download media file
          const mediaFilePath = `${tempFolder}/${exportRequestId2}/Media/${tdoId}.mp4`;
          expect(fs.existsSync(mediaFilePath)).toEqual(true);
        }
      );
    }
  });

  it('update an export request to downloaded', async () => {
    const query = `
    mutation {
      updateExportRequest: updateExportRequest(input: {
        id: "${exportRequestId}"
        status: downloaded
        assetUri: "${assetUri}"
      }) {
        id
        status
        assetUri
      }
      updateExportRequest2: updateExportRequest(input: {
        id: "${exportRequestId2}"
        status: downloaded
        assetUri: "${assetUri2}"
      }) {
        id
        status
        assetUri
      }
    }
      `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateExportRequest.id')).toEqual(exportRequestId);
    expect(_.get(result, 'updateExportRequest.status')).toEqual('downloaded');
    expect(_.get(result, 'updateExportRequest2.id')).toEqual(exportRequestId2);
    expect(_.get(result, 'updateExportRequest2.status')).toEqual('downloaded');
  });

  // cancel jobs
  it('cancel jobs if still running', async () => {
    const getQuery = `query {
      getJob: job(id: "${jobId}") { id status tasks { records {id status}}}
    }`;
    const result = await gqlClient.query(getQuery, null, userTokenAuth);
    // if the job is completed it can't be cancelled
    if (_.get(result, 'getJob.status') === 'complete') {
      return;
    }

    const cancelQuery = `mutation {
      cancelJob: cancelJob(id: "${jobId}") { id }
    }`;

    await gqlClient.query(cancelQuery, null, userTokenAuth);
  });
  // delete TDOs
  it('delete TDOs', async () => {
    // updates job status and delete TDO
    const result = await tdoHelper.processTDODeletion(gqlClient, tdoId);
    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
  });
  it('delete temp folder download export request', () => {
    if (fs.existsSync(tempFolder)) {
      rimraf(tempFolder, fs, (err) => {
        expect(err).toEqual(null);
      });
    }
  });
});
