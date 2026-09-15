const fs = require('fs');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;
const moment = require('moment');
const env = config.env;
const uuid = require('uuid');
const _ = require('lodash');
const util = require('../util.js')();


const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;

const supertest = require('supertest')(url);

let tdoId;
let assetId;
let jobId;
let options, mediaStreamerHeader;

const startDateTime = moment()
  .subtract(2, 'hour')
  .unix();
const stopDateTime = moment()
  .subtract(1, 'hour')
  .unix();

const maxJobWaitMin = 5;
const maxJobWaitMs = 5 * 60 * 1000;

// this is a podcast asset set to public access
// TODO use our own media that is compatible with the engine
const testMediaUrl =
  'http://ondemand.abcnews.com/playback/abcnews/2019/01/190108_vod_dispatch_pence_700.mp4';
//'https://s3.amazonaws.com/prod-api.veritone.com/db42d17a-db77-4c16-8f9d-5043094f5fba';//"https://s3.amazonaws.com/prod-api.veritone.com/72aa0b03-7de0-4791-93f1-21ebe3dcd9a1";

describe('Disney use case tests', async () => {
  this.timeout(maxJobWaitMs + 10000);

  beforeAll(done => {
    const apiToken = config.apiToken;
    expect(apiToken).toBeDefined();
    options = helpers.requestOptions(apiToken);
    mediaStreamerHeader = helpers.mediaStreamerHeader(apiToken);
    done();
  });

  it('create a TDO', () => {
    let response;
    const query = `
mutation {
  createTDO(input: {
    startDateTime:${startDateTime},
    stopDateTime: ${stopDateTime}
  }) {
    id
    status
  }
}
    `;
    return chakram.post(url, { query: query }, options).then(response => {
      
      
      tdoId = _.get(result, 'createTDO.id');
      expect(tdoId).toBeDefined();
    });
  });

  it('create an asset', () => {
    const query = `
mutation {
  createAsset(input: {
    containerId:"${tdoId}",
    contentType: "video/quicktime",
    type: "media",
    uri:"${testMediaUrl}"
   }) {
     id, type, contentType, containerId, uri
   }
}
    `;
    return chakram.post(url, { query: query }, options).then(response => {
      
      
      assetId = _.get(result, 'createAsset.id');
      expect(assetId).toBeDefined();
    });
  });

  it('create a job', () => {
    const query = `
mutation {
  createJob(input: {
    targetId: "${tdoId}",
    tasks: [{
      engineId: "8fad081b-fbac-445f-afde-a3f8a53a55ee"
    }]
  }) {
    id,
    targetId,
    tasks {
      records {
        id,
        engineId,
        order,
        payload,
        status
      }
    }
  }
}
    `;
    return chakram.post(url, { query: query }, options).then(response => {
      
      
      jobId = _.get(result, 'createJob.id');
      expect(jobId).toBeDefined();
    });
  });

  it('query a job', () => {
    const query = `
query {
  job(id: "${jobId}") {
    id,
    status,
    tasks {
      records {
        id,
        status,
        engineId
      }
    }
  }
}
    `;
    return chakram.post(url, { query: query }, options).then(response => {
      
      
      expect(_.get(result, 'job.id')).toEqual(
        jobId
      );
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
        // the TDO didn't have a primaryAsset or initAsset
        expect(response).to.have.status(404);
        expect(response.body.error).toEqual(
          'No files found with requested ID'
        );
      })
      .catch(err => {
        helpers.expect(err, 'err').to.be.undefined;
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
        helpers.expect(err, 'err').to.be.undefined;
      });
  });

  it('delete the TDO', () => {
    const query = `
mutation {
  deleteTDO(id: "${tdoId}") {
    id
    message
  }
}
    `;
    return chakram.post(url, { query: query }, options).then(response => {
      
      
      expect(
        _.get(result, 'deleteTDO.id'),
        response
      ).toEqual(tdoId);
    });
  });
});
