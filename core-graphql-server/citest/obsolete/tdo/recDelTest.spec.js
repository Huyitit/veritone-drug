const fs = require('fs');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const tdoHelper = require('../helpers/tdo.js');
const { safe } = require('../helpers/cleanup/utils');

const {
  generateEngineActivated,
  deleteEngineInfoGenerated
} = require('../helpers/engine.js');
const config = helpers.config;
const env = config.env;
const _ = require('lodash');
const moment = require('moment');

const mediaFile = fs.readFileSync('./citest/data/movie_clip.mov');
let engineInfo = null;
const citestMarker = global.citestMarker || 'citest-should-delete';
const isLocal = env.includes('local');

describe('citest_tdo: TDO delete test', () => {
  let options, userOptions, mediaStreamerHeader;
  const authUrl = `https://api.${env}.veritone.com/v1`;
  const url = config.graphql_url || authUrl;
  let tdoId, assetId, jobId, applicationId, taskId, assetUri, engineId;
  let uploadUrl1, uploadUrl2, getUrl1, getUrl2;
  let sourceId;
  let organizationId;
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    organizationId = result.organizationId;
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    const engineName = `${citestMarker}-citest-engine-${Date.now()}-${organizationId}`;

    engineInfo = await generateEngineActivated(gqlClient, {
      engineName
    });
  });

  afterAll(async () => {
    await safe('delete engine build and engine', async () => {
      await deleteEngineInfoGenerated(gqlClient, {
        engineBuildId: engineInfo.engineBuild.id,
        engineId: engineInfo.engine.id
      });
    });
  });

  it(' get URL and an engine', async () => {
    // update to ignore sourceTypeId = 5
    // since recDelTest.spec.js and source.spec.js may run in parallel
    // so the Source in source.spec.js might be get here
    // when it was deleted in source.spec.js
    // So it will cause the citest failure (The requested object was not found)
    const query = ` query {
    getSignedWritableUrls(number: 2 path: "tdo_apitest" type: "asset") {
      bucket
      key
      expiresInSeconds
      expiresAtDateTime
      url
      getUrl
      unsignedUrl
    }
    engines(name: "${engineInfo.engine.name}" libraryRequired: false state: active owned: true limit:1) {
      records {
        id
        name
      }
    }
    sources(limit:1, includePublic: false, permission:owner) {
      records {
        id
      }
    }
  }
  `;

    const result = await gqlClient.query(query);

    uploadUrl1 = _.get(result, 'getSignedWritableUrls[0].url');
    uploadUrl2 = _.get(result, 'getSignedWritableUrls[1].url');
    getUrl1 = _.get(result, 'getSignedWritableUrls[0].unsignedUrl');
    getUrl2 = _.get(result, 'getSignedWritableUrls[1].unsignedUrl');
    engineId = _.get(result, 'engines.records[0].id');
    expect(engineId).toBeDefined();
    sourceId = _.get(result, 'sources.records[0].id');
    expect(sourceId).toBeDefined();
  });

  const runOnlyInMinioLocalCompose = (signedUrl) => {
    return signedUrl && signedUrl.includes('//minio:9000');
  };

  it('upload first file', async () => {
    if (runOnlyInMinioLocalCompose(uploadUrl1)) {
      if (isLocal) return;
      await helpers
        .supertest(uploadUrl1)
        .put('')
        .attach('file', './citest/data/movie_clip.mov')
        .expect(200);
    }
  });

  it('upload next file', async () => {
    if (runOnlyInMinioLocalCompose(uploadUrl1)) {
      if (isLocal) return;

      await helpers
        .supertest(uploadUrl2)
        .put('')
        .attach('file', './citest/data/movie_clip.mov')
        .expect(200);
    }
  });

  it('create a TDO', async () => {
    const startDateTime = moment().subtract(60, 'minute');
    const stopDateTime = moment().subtract(30, 'minute');
    const query = `
mutation {
  createTDO(input: {
    	status: "uploaded",
      name: "${citestMarker}-${startDateTime.unix()}",
    	startDateTime: ${startDateTime.unix()}
    	stopDateTime: ${stopDateTime.valueOf()}
      assets: [{
        assetType: "media"
        contentType: "video/quicktime"
        uri: "${getUrl1}"
      }, {
        assetType: "media"
        contentType: "video/quicktime"
        uri: "${getUrl2}"
        setAsPrimary: true
      }]
      sourceData: {
        sourceId: "${sourceId}"
      }
  }) {
    	id
      startDateTime
      stopDateTime
      applicationId
      isPublic
      organizationId
      organization {
        id
      }
      assets {
        records {
          id
        }
      }
      primaryAsset(assetType: "media") {
        id
      }
  }
}`;
    const result = await gqlClient.query(query);

    tdoId = _.get(result, 'createTDO.id', null);
    expect(tdoId).toBeDefined();
    expect(_.get(result, 'createTDO.isPublic')).toEqual(false);
    expect(_.get(result, 'createTDO.organizationId')).toBeDefined();
    expect(_.get(result, 'createTDO.organization.id')).toBeDefined();
    expect(_.get(result, 'createTDO.assets.records[0].id')).toBeDefined();
    expect(_.get(result, 'createTDO.assets.records[1].id')).toBeDefined();
    expect(_.get(result, 'createTDO.primaryAsset.id')).toBeDefined();
    // below checks that we converted a couple of different integer date formats correctly --
    // ms and also the legacy epoch/seconds format.
    expect(_.get(result, 'createTDO.startDateTime')).toEqual(
      moment(startDateTime.unix() * 1000).toISOString()
    );
    expect(_.get(result, 'createTDO.stopDateTime')).toEqual(
      stopDateTime.toISOString()
    );
  });

  it('upload an asset', async () => {
    const query = `
    mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "video/mp4"
        description: "my test asset"
        jsondata: {
          size: 3372034
          fileName: "sw8-short.mov"
        }
        type: "media"
      }) {
        id
        uri
        type
        signedUri
      }
    }`;
    const result = await gqlClient.uploadFile(
      query,
      'movie.mp4',
      './citest/data/movie.mp4'
    );
    assetId = _.get(result, 'createAsset.id', null);
    expect(assetId).toBeDefined();
    assetUri = _.get(result, 'createAsset.signedUri', null);
    const now = moment.utc();
    expect(assetUri).toEqual(
      expect.stringContaining(
        `/${organizationId}/asset/${now.year()}/${now.month()}/${now.day()}/${tdoId}`
      )
    );
  });

  it('fail to create asset with overlarge metadata', async () => {
    const query = `mutation CreateAsset($details: JSONData) {
createAsset(input: {
    containerId: "${tdoId}"
    assetType: "media"
    uri: "http://localhost/"
    details: $details
  }) {
    id
  }
}
`;
    const variables = {
      details: {
        // make details too big
        str: _.pad('test', 1200000)
      }
    };
    await expect(gqlClient.query(query, variables)).rejects.toThrow(
      'invalid_input'
    );
  });

  it('fail to create TDO with overlarge metadata', async () => {
    const query = `mutation CreateTDO($details: JSONData) {
createTDO(input: {
    name: "${citestMarker}-${moment().toISOString()}"
    startDateTime: "${moment().subtract(1, 'hour').toISOString()}"
    stopDateTime: "${moment().toISOString()}"
    details: $details
  }) {
    id
  }
}
`;
    const variables = {
      details: {
        // make details too big
        str: _.pad('test', 1200000)
      }
    };

    await expect(gqlClient.query(query, variables)).rejects.toThrow(
      'invalid_input'
    );
  });

  it('create a job', async () => {
    const query = `mutation {
createJob(input: {
  targetId: "${tdoId}"
  tasks: [
    {
      engineId: "${engineId}"
    }
    ]
  }) {
    id
    tasks {
      records {
        id
      }
    }
  }
}
`;
    const result = await gqlClient.query(query);
    jobId = _.get(result, 'createJob.id', null);
    expect(jobId).toBeDefined();
    taskId = _.get(result, 'createJob.tasks.records[0].id', null);
  });

  it('update the task', async () => {
    const query = `mutation {
updateTask(input: {
  id: "${taskId}"
  status: complete
  jobId: "${jobId}"
  output: {
    foo: "bar"
  }
}) {
    id
    status
    output
  }
}
`;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateTask.id')).toEqual(taskId);
  });

  it('delete task data', async () => {
    const query = `
mutation {
  cleanupTDO(id: "${tdoId}", options: [engineResults]) {
    id
    message
  }
}
`;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'cleanupTDO.id')).toEqual(tdoId);
  });

  it('delete search index data', async () => {
    const query = `
mutation {
  cleanupTDO(id: "${tdoId}", options: [searchIndex]) {
    id
    message
  }
}
`;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'cleanupTDO.id')).toEqual(tdoId);
  });

  it('find task output deleted', async () => {
    const query = `
query {
  task(id:"${taskId}") {
    id
    output
  }
  asset(id:"${assetId}") {
    id
    transform(transformFunction: JSON)
  }
}
`;
    const result = await gqlClient.query(query);

    // TODO when we turn errorOnInvalidTransformContentType on by default,
    // switch this error condition. for now it's in warn-only mode.
    //expect(_.get(response, 'body.errors.length')).toEqual(1);
    //expect(_.get(response, 'body.errors[0].name')).toEqual('invalid_input');
    expect(_.get(result, 'task.id')).toEqual(taskId);
    expect(_.get(result, 'task.output.foo')).not.toBeDefined();
    expect(_.get(result, 'asset.id')).toEqual(assetId);
    expect(_.get(result, 'asset.transform')).toEqual('');
  });

  it('delete asset data', async () => {
    const query = `
mutation {
  cleanupTDO(id: "${tdoId}", options: [storage]) {
    id
    message
  }
}
`;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'cleanupTDO.id')).toEqual(tdoId);
  });

  it('find S3 object deleted', async () => {
    if (isLocal) return;
    await helpers.supertest(assetUri).get('').expect(404);
  });

  it('find asset content deleted but not asset', async () => {
    const query = `
query {
  asset(id:"${assetId}") {
    id
    uri
    signedUri
  }
  temporalDataObject(id:"${tdoId}") {
    id
  }
}
`;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'temporalDataObject.id')).toEqual(tdoId);
    expect(_.get(result, 'asset.id')).toEqual(assetId);
    expect(_.get(result, 'asset.uri')).toEqual(null);
    expect(_.get(result, 'asset.signedUri')).toEqual(null);
  });

  it('delete the TDO', async () => {
    // updates job status and delete TDO
    const result = await tdoHelper.processTDODeletion(gqlClient, tdoId);

    expect(_.get(result, 'deleteTDO.id')).toEqual(tdoId);
  });

  it('find TDO and asset to be deleted', async () => {
    const query = `
  query {
    temporalDataObject(id:"${tdoId}") {
      id
    }
    asset(id:"${assetId}") {
      id
      uri
      signedUri
    }
  }
  `;
    await expect(gqlClient.query(query)).rejects.toThrow('not_found');
  });

  it(' enforce max offset and also filter by date/time correctly', async () => {
    const toDateTimeMom = moment().subtract(7, 'days');
    const toDateTime = toDateTimeMom.toISOString();
    const fromDateTime = moment().subtract(10, 'days').toISOString();
    const query = `
    query {
      temporalDataObjects(offset: 10000) {
        count
      }
      dateTimeFilterTest: temporalDataObjects(
        sourceId: "${sourceId}"
        dateTimeFilter: [{
          fromDateTime: "${fromDateTime}"
          toDateTime:   "${toDateTime}"
          field: startDateTime
        }]
        orderBy: startDateTime
        orderDirection: desc
        limit:1
        ) {
        records {
          startDateTime
        }
      }
    }
    `;
    await expect(gqlClient.query(query)).rejects.toThrow('max_tdo_offset');
  });
});
