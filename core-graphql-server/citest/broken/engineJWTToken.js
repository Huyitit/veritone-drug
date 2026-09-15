const helpers = require('./helpers/index');
const GraphqlClient = require('./helpers/gql.js');

const _ = require('lodash');
const jwt = require('jsonwebtoken');

const config = helpers.config;
const env = config.env;
const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
const userAgent = config.userAgent || 'core-graphql-server test';

let engineId;
const variables = {
  resource: {}
};
const fileUploadName = 'movie.mp4';
const fileUploadPath = './citest/movie.mp4';
var supertest = require('supertest')(url);
let options, mediaStreamerHeader;
let apiTokenGot;
let engineJwtToken;
let tdoId;
let jobId;
let taskId;
let postAssetId;



describe('authenicate', () => {
  it('sign in', done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, userId, organizationId }) => {
        options = helpers.requestOptions(token);
        mediaStreamerHeader = helpers.mediaStreamerHeader(token);
        apiTokenGot = apiToken;
        expect(token).is.exist;
        done();
      })
      .catch(err => done(err));
  });
});

describe('Create a TDO and a job using TDO as target and including transcription engine', () => {
  

  it('should create a TDO into folder', () => {
    const curDateTime = Math.floor(Date.now() / 1000);
    var query = `mutation {
        createTDO(input: {
          status: "uploaded"
          isPublic: true
          startDateTime: ${curDateTime}
          stopDateTime: ${curDateTime + 300}
        }) {
            id
            createdDateTime
            modifiedDateTime
            applicationId
            security {
              global
            }
            startDateTime
            source
            sourceData {
              taskId
              sourceId
            }
            folders {
              treeObjectId
            }
            details
            jsondata
            metadata {
              ... on Program {
                id
                name
                liveImage
                image
              }
            }
            thumbnailUrl

        }
      }`;

    const result = await gqlClient.query(query);
      let tdoData;
      if (respObj.body.data && respObj.body.data.createTDO) {
        tdoId = respObj.body.data.createTDO.id;
        tdoData = respObj.body.data.createTDO;
      }
      expect(respObj, respObj).to.have.status(200);
      expect(tdoId, respObj).toBeDefined();
      variables.resource.tdoId = tdoId;
      expect(_.get(tdoData, 'security.global'), respObj).to.be.true;
      expect(_.get(tdoData, 'createdDateTime'), respObj).toBeDefined();
      expect(_.get(tdoData, 'modifiedDateTime'), respObj).toBeDefined();
      expect(_.get(tdoData, 'createdDateTime'), respObj).toEqual(
        _.get(tdoData, 'modifiedDateTime')
      );
    });
  });

  it('should get citest engine', () => {
    const query = `query {
      engines(createsTDO:false, state: [active], limit:1, name: "CITest Engine 20221219") {
        records {
          id
        }
      }
    }`;

    const result = await gqlClient.query(query);
      const engine = _.get(result, 'engines.records[0]');

      
      
      expect(engine).toBeDefined();
      expect(engine.id).toBeDefined();

      engineId = engine.id;
    });
  });

  it('should create a job', () => {
    let query = `
      mutation {
        createJob(input: {
          retries: 1
          targetId: "${tdoId}"
          tasks: [
            {
              engineId: "${engineId}"
              payload: {
                target: "it"
              }
            }
          ]
        }) {
          id
          targetId
          tasks {
            records {
              id
              targetId
              engineId
              order
              payload
              status
            }
          }
        }
      }`;

    const result = await gqlClient.query(query);
      let payload;
      let jobData;

      if (response.body && response.body.data && response.body.data.createJob) {
        jobId = response.body.data.createJob.id;
        taskId = response.body.data.createJob.tasks.records[0].id;
        payload = response.body.data.createJob.tasks.records[0].payload;
        jobData = response.body.data.createJob;
      }

      
      expect(jobId).toBeDefined();
      variables.resource.jobId = jobId;
      expect(taskId).toBeDefined();
      variables.resource.taskId = taskId;
      expect(payload).toBeDefined();
      expect(jobData.targetId).toEqual(tdoId);
    });
  });
});

describe('Get engine JWT Token', () => {
  

  it('should get an engine JWT token', () => {
    const query = `mutation getEngineJWT($resource: GetEngineJWTResource!) {
            getEngineJWT(input: {
              engineId: "${engineId}"
              resource: $resource
            }) {
              engineId
              token
              resource {
                applicationId
                tdoId
                jobId
                taskId
              }
            }
          }`;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        let body = response.body;
        
        expect(body.data.getEngineJWT.token).toBeDefined();
        engineJwtToken = _.get(body, 'data.getEngineJWT.token');
        let decodeToken = jwt.decode(engineJwtToken);
        expect(
          _.get(decodeToken, 'scope[0].resources.recordingIds[0]'),
          response
        ).toEqual(variables.resource.tdoId);
        expect(
          _.get(decodeToken, 'scope[1].resources.jobIds[0]'),
          response
        ).toEqual(variables.resource.jobId);
        expect(
          _.get(decodeToken, 'scope[1].resources.taskIds[0]'),
          response
        ).toEqual(variables.resource.taskId);
      });
  });
});

describe('Update task status and upload an asset using JWT Token', () => {
  
  let optionsJWTToken;

  beforeAll(() => {
    optionsJWTToken = {
      headers: {
        Authorization: 'Bearer ' + engineJwtToken,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };
  });

  it('should post an asset with media', () => {
    let query = `
        mutation {
          createAsset(input: {
            containerId: "${tdoId}"
            contentType: "video/mp4"
            description: "a media file"
            assetType: "media"
          }) {
            id
            uri
            type
          }
      }`;

    result = supertest
      .post('')
      .set(optionsJWTToken.headers)
      .field('query', query)
      .field('filename', fileUploadName)
      .attach('file', fileUploadPath)
      .expect(200);

    return result.then(function(respObj) {
      if (respObj.body && respObj.body.data && respObj.body.data.createAsset) {
        postAssetId = respObj.body.data.createAsset.id;
      }
      expect(postAssetId, respObj).toBeDefined();
    });
  });

  it('should update task status', () => {
    let query = `mutation {
      updateTask(input: {
        status: failed
        id:"${taskId}"
        jobId:"${jobId}"
      }) {
        output
        taskOutput
        taskPayload
        payload
        status
        id
      }
    }`;

    const result = await gqlClient.query(query);
      
      expect(_.get(result, 'updateTask.id')).toBeDefined();
    });
  });

  it('should hit media-streamer download endpoint', () => {
    return helpers
      .testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        tdoId,
        mediaStreamerHeader
      )
      .then(response => {
        
      })
      .catch(err => {
        expect(err, err).to.be.undefined;
      });
  });

  it('should hit media-streamer streams endpoint', () => {
    return helpers
      .testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        tdoId,
        'dash.mpd'
      )
      .then(response => {
        // TDO doesn't support stream protocol
        expect(response).to.have.status(422);
        expect(response.body.error).toEqual(
          'TDO does not support requested stream protocol'
        );
      })
      .catch(err => {
        expect(err, err).to.be.undefined;
      });
  });
});

describe('delete artifacts created during the test', () => {
  

  it('should delete asset', () => {
    var query = `mutation {
        deleteAsset(id: "${postAssetId}") {
            id
            message
        }
      }`;

    const result = await gqlClient.query(query);
      let delAssetId;
      if (
        response.body &&
        response.body.data &&
        response.body.data.deleteAsset
      ) {
        delAssetId = response.body.data.deleteAsset.id;
      }
      
      expect(delAssetId).toEqual(postAssetId);
    });
  });

  it('should delete TDO', () => {
    var query = `mutation {
        deleteTDO(id: "${tdoId}") {
            id
        }
      }`;

    const result = await gqlClient.query(query);
      
    });
  });
});
