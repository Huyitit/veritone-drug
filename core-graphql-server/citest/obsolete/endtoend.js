const fs = require('fs');
const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');
const config = helpers.config;


const env = config.env;
const uuid = require('uuid');
const _ = require('lodash');
const testName = 'test_endtoend_mention_generated_' + Date.now();
const url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
const authUrl = `https://api.${env}.veritone.com/v1`;
const rootFolderType = 'cms';
const testStateObject = {
  testId: null,
  testName: null,
  testDescription: null,
  testParentId: null,
  testOrderIndex: 0
};
const userAgent = config.userAgent || 'core-graphql-server test';
var supertest = require('supertest')(url);

const fileUploadName = 'videoplayback.mp4';
const fileUploadPath = './citest/videoplayback.mp4';
const variables = {
  cogSearch: {
    mentionStatusId: 1,
    profile: {
      and: [
        {
          state: {
            search: 'football',
            language: 'en'
          },
          engineCategoryId: '67cd4dd0-2f75-445d-a6f0-2f297d6cd182'
        }
      ]
    }
  }
};
const timePause = 180000; //ms
let apiTokenGot;
let options;
let watchlistId;
let cognitiveSearchId;
let folderId;
let tdoId;
let postAssetId;
let noCreatesTDOEngineId;
let jobId;
let taskId;


console.log('TestName is: ', testName);

describe('authenicate', () => {
  
  it('sign in', done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, userId, organizationId }) => {
        options = helpers.requestOptions(token);
        apiTokenGot = apiToken;
        expect(token).is.exist;
        done();
      })
      .catch(err => done(err));
  });
});

describe('create a watchlist', () => {
  
  let gotUserId;

  it('should create a watchlist', () => {
    const query = `
          mutation createWatchlist($cogSearch: CreateCognitiveSearchInWatchlist!) {
            createWatchlist(input: {
              startDateTime: "2019-12-28T00:00:00.000Z"
              stopDateTime: "2019-12-28T22:48:57.000Z"
              name: "${testName}"
              sourceTypeIds: [1, 2, 3, 4, 5]
              searchIndex: global
              details: {
                targetAudience: {
                  age: 25
                },
                programIds: [1749, 1585],
                marketIds: [87, 24]
              }
              cognitiveSearches: [$cogSearch]
            }) {
              id
              details
              query
              searchIndex
              subscriptions {
                id
              }
              folders {
                id
              }
              cognitiveSearches {
                id
              }
              sourceIds
            }
        }`;

    const varString = JSON.stringify(variables);
    return chakram
      .post(url, { query, variables: varString }, options)
      .then(response => {
        let body = response.body;
        
        expect(body.data.createWatchlist).toBeDefined();
        watchlistId = body.data.createWatchlist.id;
        cognitiveSearchId = _.get(
          body,
          'data.createWatchlist.cognitiveSearches[0].id'
        );
        expect(cognitiveSearchId).toBeDefined();
        expect(body.errors).to.be.undefined;
        expect(
          _.get(body, 'data.createWatchlist.searchIndex'),
          response
        ).toEqual('global');
        //expect(_.get(body, 'data.createWatchlist.subscriptions[0].id')).toBeDefined();
      });
  });
});

describe('create a TDO and upload a video asset', () => {
  

  it('should create root folders', () => {
    const query = `mutation {
          createRootFolders(rootFolderType: ${rootFolderType}) {
            id
            description
            treeObjectId
            rootFolderTypeId
            typeId
          }
        }`;

    console.log('Creating Root Folder....');
    const result = await gqlClient.query(query);
      
      expect(response.body.data.createRootFolders).toBeDefined();
      const rootFolders = response.body.data.createRootFolders;
      testStateObject.testParentId = rootFolders[1].treeObjectId;
    });

  it('should create a folder for TDO', () => {
    testStateObject.testName = testName + '-folders';
    testStateObject.testDescription = testName + '-folders-description';

    const query = `mutation {
          createFolder(input: {
            name: "${testStateObject.testName}",
            description: "${testStateObject.testDescription}",
            parentId: "${testStateObject.testParentId}",
            orderIndex: ${testStateObject.testOrderIndex},
            rootFolderType: ${rootFolderType}
          }) {
            id
            treeObjectId
            name
            description
            createdDateTime
            modifiedDateTime
            status
            ownerId
            maxDepth
            orderIndex
          }
        }`;
    console.log('Creating folder for TDO');
    const result = await gqlClient.query(query);
      testStateObject.testId = response.body.data.createFolder.treeObjectId;
      
      expect(response.body.data.createFolder.id).toBeDefined();
      expect(response.body.data.createFolder.name).toEqual(
        testStateObject.testName
      );
      folderId = response.body.data.createFolder.treeObjectId;
      console.log('folderId=', folderId);
    });

  it('should create a TDO into folder', () => {
    const folderIdSet = folderId ? `parentFolderId: "${folderId}"` : '';
    const stopDateTime = Math.floor(Date.now() / 1000);
    const startDateTime = stopDateTime - 10000;
    var query = `mutation {
        createTDO(input: {
          status: "uploaded"
          isPublic: true
          startDateTime: ${startDateTime}
          stopDateTime: ${stopDateTime}
          ${folderIdSet}
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
    console.log('Creating TDO....');
    const result = await gqlClient.query(query);
      let tdoData;
      if (respObj.body.data && respObj.body.data.createTDO) {
        tdoId = respObj.body.data.createTDO.id;
        console.log('tdoId=' + tdoId);
        tdoData = respObj.body.data.createTDO;
      }
      expect(respObj, respObj).to.have.status(200);
      expect(tdoId, respObj).toBeDefined();
      expect(_.get(tdoData, 'security.global'), respObj).to.be.true;
      expect(_.get(tdoData, 'createdDateTime'), respObj).toBeDefined();
      expect(_.get(tdoData, 'modifiedDateTime'), respObj).toBeDefined();
      expect(_.get(tdoData, 'createdDateTime'), respObj).toEqual(
        _.get(tdoData, 'modifiedDateTime')
      );
      expect(
        _.get(tdoData, 'folders[0].treeObjectId'),
        respObj
      ).toEqual(folderId);
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
      .set(options.headers)
      .field('query', query)
      .field('filename', fileUploadName)
      .attach('file', fileUploadPath)
      .expect(200);

    return result.then(function(respObj) {
      if (respObj.body && respObj.body.data && respObj.body.data.createAsset) {
        postAssetId = respObj.body.data.createAsset.id;
      }
      console.log('AssetId is: ', postAssetId);
      expect(postAssetId, respObj).toBeDefined();
    });
  });
});

describe('create a job using TDO as target and indluding a transcription engine', () => {
  

  // Try API get engines which has buildStatus = "deploy" but not ok

  it('should create a job', () => {
    let query = `
      mutation {
        createJob(input: {
          retries: 1
          targetId: "${tdoId}"
          tasks: [
            {
              engineId: "insert-into-index"
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

    console.log('Creating a job....');
    const result = await gqlClient.query(query);
      let payload;
      let jobData;

      if (response.body && response.body.data && response.body.data.createJob) {
        jobId = response.body.data.createJob.id;
        taskId = response.body.data.createJob.tasks.records[0].id;
        payload = response.body.data.createJob.tasks.records[0].payload;
        jobData = response.body.data.createJob;
      }
      console.log('jobId=', jobId);
      
      expect(jobId).toBeDefined();
      expect(taskId).toBeDefined();
      expect(payload).toBeDefined();
      expect(jobData.targetId).toEqual(tdoId);
  });
});

describe.skip(`Pause for ${timePause /
  60000} minutes to allow the engine run`, function() {
  //
  this.timeout(timePause + 30000);

  console.log(`Starting delay ${timePause / 60000} mins....`);
  it(`should be pause for ${timePause / 60000} mins`, done => {
    setTimeout(() => {
      expect(1).toEqual(1);
      console.log('Done delay');
      done();
    }, timePause);
  });
});

describe.skip('Verify transcript asset exists on TDO and Mention in Watchlist', function() {
  

  it('should get asset type transcript on TDO', () => {
    let query = `query {
      temporalDataObjects(id: "${tdoId}") {
        records {
          assets(type: "transcript") {
            records {
            id
            type
            jsondata
            contentType
            name
            fileData {
              size
              originalFileUri
              md5sum
            }
            description
            sourceData {
              name
              taskId
            }
            details
            uri
            signedUri
            t2Json: transform(transformFunction:Transcript2JSON)
            x2Json: transform(transformFunction:XML2JSON)
            plain: transform(transformFunction: JSON)
          }
          }
        }
      }

      job(id: "${jobId}") {
        id
        status
        tasks {
          records {
            id
            status
            engine {
              id
              name
            }
            payload
            output
            log {
              uri
              text
            }
          }
        }
      }
    }`;

    console.log('Getting transcript asset on TDO....');
    const result = await gqlClient.query(query);
      
      // first verify that job completed. if not error now.
      expect(_.get(result, 'job.status')).toEqual('complete');
      expect(
        _.get(
          response,
          'body.data.temporalDataObjects.records[0].assets.records[0].id'
        )
      ).toBeDefined();
      expect(
        _.get(
          response,
          'body.data.temporalDataObjects.records[0].assets.records[0].jsondata'
        )
      ).to.have.property('size');
  });

  it('should get mention in watchlist', () => {
    let query = `query {
      watchlists(id: ${watchlistId}) {
        records{
          id
          name
          cognitiveSearches {
            id
            mentionStatusId
            mentionStatus {
              id
              name
            }
            profile
          }
          mentions {
            count
            records {
              id
            }
          }
        }
      }
    }`;

    console.log('Verifing has mention created in Watchlist...');
    const result = await gqlClient.query(query);
      
      expect(
        _.get(
          response,
          'body.data.watchlists.records[0].mentions.records[0].id'
        )
      ).toBeDefined();
  });
});

describe('delete artifacts created during the test', () => {
  

  it('should delete watchlist', () => {
    let body;
    const query = `
        mutation {
            deleteWatchlist(id: "${watchlistId}") {
                id
                message
            }
        }`;

    console.log('Deleting watchlist....');
    const result = await gqlClient.query(query);
      console.log(JSON.stringify(response.body));
      
      body = response.body;
      expect(body.errors).to.be.undefined;
      expect(body.data.deleteWatchlist).toBeDefined();
      expect(body.data.deleteWatchlist.id).toEqual(
        watchlistId
      );
  });

  it('should delete TDO test folder', () => {
    const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
    console.log('Deleting folder....');
    const result = await gqlClient.query(query);
      testStateObject.testIsDeleted = true;
      
      expect(response.body.data.deleteFolder.id).toEqual(
        testStateObject.testId
      );
  });

  it('should delete asset', () => {
    var query = `mutation {
        deleteAsset(id: "${postAssetId}") {
            id
            message
        }
      }`;

    console.log('Deleting Asset....');
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

  it('should delete TDO', () => {
    var query = `mutation {
        deleteTDO(id: "${tdoId}") {
            id
        }
      }`;
    console.log('Deleting TDO....');
    const result = await gqlClient.query(query);
  });
});
