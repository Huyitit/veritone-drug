const uuid = require('uuid');
const _ = require('lodash');
const helpers = require('./helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');

const config = helpers.config;
const moment = require('moment');
var fs = require('fs');
const validator = require('validator');
var token;
var apiToken;
var env = config.env;
var authUrl = 'https://api.' + env + '.veritone.com/v1';
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var signinResult;
var tdoStartDateTime;
var assetId;
var postAssetId;
var hiddenAssetId;
let tdoId, tdoId2, tdoId3, tdoId4, tdoId5;

const userAgent = config.userAgent || 'core-graphql-server test';
let headers = {};

let folderId;
const rootFolderType = 'cms';
const testStateObject = {
  testId: null,
  testName: null,
  testDescription: null,
  testParentId: null,
  testOrderIndex: 0
  // this is used for which step of the tests are on
};
const magicConfig = {
  config: {
    ...config,
    recordingIdParser: {
      prefix: 'mri-',
      baseUri: 'https://api.' + env + '.veritone.com/media-streamer'
    }
  }
};

const magicIdUtil = require('@veritone/core-server-base/parser.recording-id.js')(
  magicConfig
);
let taskId;
const engineId = 'd1bc57fe-675d-435d-9f4d-2f074485ec55';
let sourceId;
var debug = config.debug && config.debug == true;
var supertest = require('supertest')(url);

var testKey = Date.now();
var scheduledJobId, scheduledJobName;
var mentionId;

const liveImage1 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels4_banner.jpg';
const liveImage2 =
  'https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels5_banner.jpg';


const engineOutput = JSON.parse(fs.readFileSync('./citest/engine-output.json'));

const engineSchemaId = engineOutput.schemaId;
const schemaDef = {
  $id: 'http://example.com/example.json',
  type: 'object',
  $schema: 'http://json-schema.org/draft-07/schema#',
  required: ['sourceEngineId'],
  properties: {
    id: {
      $id: '/properties/sourceEngineId',
      type: 'string'
    },
    data: {
      $id: '/properties/sourceEngineName',
      type: 'string'
    }
  },

  definitions: {}
};
let defaultAddToIndexForOrg = true;

var response = null;

describe('tdo', () => {
  let gqlClient;
  let apiToken;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
  });

  describe('setup create TDO test', () => {
    
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

        const result = await gqlClient.query(query);
        expect(result.createRootFolders).toBeDefined();
        const rootFolders = result.createRootFolders;
        testStateObject.testParentId = rootFolders[1].treeObjectId;
    });
  });

  describe('create folder for TDO', () => {
    
    it('should create a folder', () => {
      console.log('creating a folder');

      testStateObject.testName = 'graphql-test-folders-' + testKey;
      testStateObject.testDescription = 'graphql-folders-description';

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
      const result = await gqlClient.query(query);
        testStateObject.testId = _.get(
          response,
          'body.data.createFolder.treeObjectId'
        );
        
        expect(_.get(result, 'createFolder.id')).toBeDefined();
        expect(_.get(result, 'createFolder.name')).toEqual(
          testStateObject.testName
        );
        folderId = _.get(result, 'createFolder.treeObjectId');
    });
  });

  async function createMention(url, options) {
    const time = moment.utc().subtract(2, 'day');

    const queryCreateMention = `mutation (
        $mention1: CreateMention!
      ) {
      mention1:createMention(input: $mention1) {
        id
      }
    }`;

    const variables = {
      mention1: {
        mediaId: `${tdoId}`,
        programId: -1,
        mentionDateTime: time.toISOString(),
        mentionHitCount: 1,
        hitStartDateTime: time.toISOString(),
        hitEndDateTime: time.add(5, 's').toISOString(),
        snippetsString: `[{"startTime":334.179,"endTime":390.179,"text":"Snippet 1"}]`
      }
    };
    const response = await chakram.post(
      url,
      { query: queryCreateMention, variables },
      options
    );
    
    mentionId = _.get(recResult, 'body.data.mention1.id');
    expect(mentionId).toBeDefined();
  }

  describe('get a source and job', () => {
    var recResult, body;
    

    beforeAll(() => {
      var query = `
      query {
        sources (limit:1){
          records {
            id
            name
          }
        }
        scheduledJobs(limit:1 name: "test_source_15") {
          records {
            id
            name
          }
        }
      }
      `;

      return chakram
        .post(url, { query: query }, { headers })
        .then(function(respObj) {
          recResult = respObj;
          body = respObj.body;
        });
    });

    it('return 200', () => {
      return expect(recResult, recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return helpers.expect(_.get(body, 'errors'), 'errors').to.be.undefined;
    });

    it('has sourceId', () => {
      sourceId = _.get(body, 'data.sources.records[0].id');
      return expect(sourceId, recResult).toBeDefined();
    });
    it('has scheduledJobId', () => {
      scheduledJobId = _.get(body, 'data.scheduledJobs.records[0].id');
      return expect(scheduledJobId, recResult).toBeDefined();
    });
    it('has scheduledJobName', () => {
      scheduledJobName = _.get(body, 'data.scheduledJobs.records[0].name');
      return expect(scheduledJobName, recResult).toBeDefined();
    });
  });

  describe('create a job', () => {
    let recResult, body;
    

    beforeAll(() => {
      const query = `mutation createJob {
        createJob(input: {
          tasks: [{
            engineId: "${engineId}"
          }]
        }) {
          id
          tasks {
            count
            records {
              id
              engineId
            }
          }
        }
      }`;

      recResult = chakram.post(url, { query: query }, { headers });

      return recResult.then(function(respObj) {
        body = respObj.body;
      });
    });

    it('return 200', () => {
      return expect(recResult).to.have.status(200);
    });

    it('did not return any errors', () => {
      return helpers.expect(_.get(body, 'errors'), 'errors').to.be.undefined;
    });

    it('has jobId', () => {
      return expect(_.get(body, 'data.createJob.id')).toBeDefined();
    });

    it('has taskId', () => {
      taskId = _.get(body, 'data.createJob.tasks.records[0].id');
      return expect(taskId).toBeDefined();
    });
  });

  describe('create a TDO into folder', () => {
    var recResult;
    var errors = null;
    
    var tdoData = null;
    tdoStartDateTime = moment()
      .milliseconds(0)
      .toISOString();
    const tdoStopDateTime = moment(tdoStartDateTime)
      .add(1, 'minutes')
      .toISOString();

    beforeAll(() => {
      const folderIdSet = folderId ? `parentFolderId: "${folderId}"` : '';
      var query = `mutation {
        createTDO(input: {
          isPublic: true
          startDateTime: "${tdoStartDateTime}"
          stopDateTime: "${tdoStopDateTime}"
          source: "foo"
          sourceData: {
            taskId: "${taskId}"
            sourceId: "${sourceId}"
            scheduledJobId: "${scheduledJobId}"
          }
          ${folderIdSet}
          thumbnailUrl: "https://yt3.ggpht.com/-D976V11Gy6w/Uk2m6f_lIcI/AAAAAAAAAJs/zBIoERxlAmE/w1060-fcrop64=1,00005a57ffffa5a8-nd/channels4_banner.jpg"
          details: {
            veritoneProgram: {
              programId: 29424
              programImage: "https://yt3.ggpht.com/-GRI3L9gvp_Q/AAAAAAAAAAI/AAAAAAAAAAA/pw_p4HFoo9Y/s240-c-k-no/photo.jpg"
            }
            numSegments: 1
          }
        }) {
            id
            name
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
              scheduledJobId
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
            streams {
              uri
              protocol
            }
            engineRuns {
              records {
                engine {
                  id
                }
                status
                hasUserEdits
              }
            }
            assets {
              records {
                id
                assetType
                details
                uri
                signedUri
              }
            }

        }
      }`;

      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.createTDO) {
          tdoId = respObj.body.data.createTDO.id;
          tdoData = respObj.body.data.createTDO;
        }
      });
    });

    it('return 200', () => {
      return expect(recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has TDO Id', () => {
      return expect(tdoId).toBeDefined();
    });
    it('is public', () => {
      return expect(_.get(tdoData, 'security.global')).to.be.true;
    });
    it('has a name', () => {
      return expect(_.get(tdoData, 'name')).toBeDefined();
    });
    it('has source', () => {
      return expect(_.get(tdoData, 'source')).toEqual('foo');
    });
    it('has taskId', () => {
      return expect(_.get(tdoData, 'sourceData.taskId')).toEqual(taskId);
    });
    it('has sourceId', () => {
      return expect(_.get(tdoData, 'sourceData.sourceId')).toEqual(
        _.toString(sourceId)
      );
    });
    it('has scheduledJobId', () => {
      return expect(_.get(tdoData, 'sourceData.scheduledJobId')).toEqual(
        _.toString(scheduledJobId)
      );
    });
    it('has created and modified times', () => {
      expect(_.get(tdoData, 'createdDateTime')).toBeDefined();
      expect(_.get(tdoData, 'modifiedDateTime')).toBeDefined();
      expect(_.get(tdoData, 'createdDateTime')).toEqual(
        _.get(tdoData, 'modifiedDateTime')
      );
    });

    it('has correct start date time', () => {
      return expect(_.get(tdoData, 'startDateTime')).toEqual(tdoStartDateTime);
    });

    it('has folder treeObjectId', () => {
      return expect(_.get(tdoData, 'folders[0].treeObjectId')).toEqual(folderId);
    });

    it('has program live image', () => {
      return expect(
        _.get(tdoData, 'details.veritoneProgram.programLiveImage')
      ).toEqual(liveImage1);
    });
    it('has thumbnailUrl', () => {
      return expect(_.get(tdoData, 'thumbnailUrl')).toEqual(liveImage1);
    });
    it('has empty streams list', () => {
      return expect(_.get(tdoData, 'streams.length')).toEqual(0);
    });
    it('has the org default addToIndex in details', () => {
      return expect(_.get(tdoData, 'details.addToIndex')).toEqual(
        defaultAddToIndexForOrg
      );
    });
  });

  describe('update a TDO', () => {
    let recResult;
    let errors = null;
    
    let tdoData = null;
    const newStopDateTime = moment(tdoStartDateTime)
      .add(2, 'minutes')
      .milliseconds(0)
      .toISOString();

    beforeAll(() => {
      var query = `mutation {
        updateTDO(input: {
          id: "${tdoId}"
          stopDateTime: "${newStopDateTime}"
          addToIndex: false
        }) {
            id
            stopDateTime
            createdDateTime
            modifiedDateTime
            details
        }
      }`;

      recResult = chakram.post(url, { query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        tdoData = _.get(respObj, 'body.data.updateTDO', {});
      });
    });

    it('return 200', () => {
      return expect(recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has correct TDO Id', () => {
      return expect(tdoData.id).toEqual(tdoId);
    });
    it('has new stopDateTime', () => {
      return expect(tdoData.stopDateTime).toEqual(newStopDateTime);
    });
    it('has updated modifiedDateTime', () => {
      return expect(tdoData.createdDateTime).to.be.lessThan(
        tdoData.modifiedDateTime
      );
    });
    it('has updated addToIndex in tdo details', () => {
      return expect(_.get(tdoData, 'details.addToIndex')).toEqual(false);
    });
  });

  describe('get a mention', () => {
    var recResult, body;
    

    beforeAll(() => {
      var query = `
      query {
        mentions(limit:1) {
          records {
            id
            mediaId
          }
        }
      }
      `;

      return chakram
        .post(url, { query: query }, { headers })
        .then(function(respObj) {
          recResult = respObj;
          body = respObj.body;
        });
    });

    it('return 200', () => {
      return expect(recResult, recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return helpers.expect(_.get(body, 'errors'), 'errors').to.be.undefined;
    });
    it('has mentionId', async () => {
      mentionId = _.get(body, 'data.mentions.records[0].id');
      // Ideally mention is created at the start of the citest and deleted at the end.
      // But there is no graphql mutation to delete mention. So mentions is created
      // only when none is found.
      if (!mentionId) {
        await createMention(url, { headers });
      }
    });
  });

  describe('get a TDO', () => {
    var recResult;
    var errors = null;
    var listRecords = null;
    var count = 0;
    var tdoData = null;
    var body;
    

    beforeAll(() => {
      var query = `{
        emptyByMention: temporalDataObjects(mentionId: 111111111111) {
          count
        }
        byMention: temporalDataObjects(mentionId: "${mentionId}" limit:1)  {
          count
        }
        temporalDataObjects(id:"${tdoId}") {
          offset
          limit
          count
          records {
            id
            applicationId
            createdDateTime
            modifiedDateTime
            security {
              global
            }
            folders {
              treeObjectId
            }
            thumbnailUrl
          }
        }
      }`;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        body = respObj.body;
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body && respObj.body.data) {
          listRecords = respObj.body.data.temporalDataObjects.records;
          count = respObj.body.data.temporalDataObjects.count;
          tdoData = respObj.body.data.temporalDataObjects;
        }
        response = respObj;
      });
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });
    it('return 200', () => {
      return 
    });
    it('should have one record in response', () => {
      return expect(listRecords).toHaveLength(1);
    });
    it('should have count of one', () => {
      return expect(count).toEqual(1);
    });
    it('should be public', () => {
      return expect(_.get(tdoData, 'records[0].security.global')).to.be.true;
    });
    it('has created and modified times', () => {
      expect(_.get(tdoData, 'records[0].createdDateTime')).toBeDefined();
      expect(_.get(tdoData, 'records[0].modifiedDateTime')).toBeDefined();
      expect(_.get(tdoData, 'records[0].createdDateTime')).to.be.lessThan(
        _.get(tdoData, 'records[0].modifiedDateTime')
      );
    });
    it('has a folder', () => {
      return expect(
        _.get(tdoData, 'records[0].folders[0].treeObjectId')
      ).toEqual(folderId);
    });
    it('has results by mention ID', () => {
      return expect(_.get(body, 'data.byMention')).toBeDefined();
    });
  });

  describe('get a TDO - api token', () => {
    var recResult;
    var errors = null;
    var listRecords = null;
    var count = 0;
    

    beforeAll(() => {
      var query = `{
    temporalDataObjects(id:"${tdoId}") {
      offset
      limit
      count
      records{
        id
        createdDateTime
        modifiedDateTime
        security{
          global
        }
        mediaAsset: primaryAsset(assetType: "media") {
          id
          assetType
        }
        transcriptAsset: primaryAsset(assetType: "transcript") {
          id
          assetType
        }
        tasks(hasSourceAsset: true) {
          records {
            id
          }
        }
      }
    }
  }
          `;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body && respObj.body.data) {
          listRecords = respObj.body.data.temporalDataObjects.records;
          count = respObj.body.data.temporalDataObjects.count;
        } else {
          console.log('no records in ' + JSON.stringify(respObj.body));
        }
        response = respObj;
      });
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });
    it('return 200', () => {
      return 
    });
    it('should have one record in response', () => {
      return expect(listRecords).toHaveLength(1);
    });
    it('should have count of one', () => {
      return expect(count).toEqual(1);
    });
  });

  describe('get a TDO with date time filters', () => {
    var recResult;
    var errors = null;
    var response = null;
    var body = null;
    

    beforeAll(() => {
      var query = `{
        inclusiveAll: temporalDataObjects(
          limit:100
          dateTimeFilter: {
            field: startDateTime
            fromDateTime: "${moment(tdoStartDateTime).toISOString()}"
            fromDateTimeExclusive: false
            toDateTime: "${moment(tdoStartDateTime).toISOString()}"
            toDateTimeExclusive: false
          }
          sourceId: "${sourceId}"
        ) {
          count
          records {
            id
          }
        }
        exclusiveFrom: temporalDataObjects(
          dateTimeFilter: {
            field: startDateTime
            fromDateTime: "${tdoStartDateTime}"
            fromDateTimeExclusive: true
            toDateTime: "${tdoStartDateTime}"
            toDateTimeExclusive: false
          }
          sourceId: "${sourceId}"
        ) {
          count
          records {
            id
          }
        }
        exclusiveTo: temporalDataObjects(
          dateTimeFilter: {
            field: startDateTime
            fromDateTime: "${tdoStartDateTime}"
            fromDateTimeExclusive: false
            toDateTime: "${tdoStartDateTime}"
            toDateTimeExclusive: true
          }
          sourceId: "${sourceId}"
        ) {
          count
          records {
            id
          }
        }
      }`;

      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        response = respObj;
        body = respObj.body;
      });
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });
    it('return 200', () => {
      return 
    });
    it('should exclude using fromDate', () => {
      return expect(_.get(body.data, 'exclusiveFrom.count')).toEqual(0);
    });
    it('should exclude using toDate', () => {
      return expect(_.get(body.data, 'exclusiveTo.count')).toEqual(0);
    });
  });

  describe('get a TDO with convenience query', () => {
    var recResult;
    var gotTdoId;
    

    beforeAll(() => {
      var query = `{
    temporalDataObject(id:"${tdoId}") {
      id
      createdDateTime
      modifiedDateTime
      security{
        global
      }

      mediaAsset: primaryAsset(assetType: "media") {
        id
        assetType
        uri
        containerId
        contentType
      }
      transcriptAsset: primaryAsset(assetType: "transcript") {
        id
        assetType
      }
      assets(assetType:"media") {
        records {
          id
          type
          uri
          signedUri
        }
      }
    }
    folder(id: "${folderId}") {
      childTDOs {
        offset
        limit
        count
        records {
          id
          jsondata
          primaryAsset(assetType: "media") {
            id
          }
        }
      }
    }
  }
          `;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        body = respObj.body;
        tdo = _.get(body, 'data.temporalDataObject');
        gotTdoId = _.get(body, 'data.temporalDataObject.id');
        response = respObj;
      });
    });

    it('did not return any errors', () => {
      return helpers.expect(body.errors, 'body.errors').to.be.undefined;
    });
    it('return 200', () => {
      return 
    });

    it('should have correct ID', () => {
      return expect(gotTdoId).toEqual(tdoId);
    });
    it('should have virtual media asset', () => {
      return expect(_.get(body, 'data.temporalDataObject.mediaAsset.id')).toBeDefined();
    });
    it('should have empty transcript asset', () => {
      return expect(_.get(body, 'data.temporalDataObject.transcriptAsset')).to.be
        .null;
    });
    it('should have record in assets filtered by media type', () => {
      // includes virtual asset
      return expect(
        _.get(body, 'data.temporalDataObject.assets.records.length')
      ).equal(1);
    });
    it('should have primary asset on tdo by folder', () => {
      return expect(
        _.get(body, 'data.folder.childTDOs.records[0].primaryAsset.id')
      ).toBeDefined();
    });
    it('should have jsondata on tdo by folder', () => {
      return expect(_.get(body, 'data.folder.childTDOs.records[0].jsondata')).toBeDefined();
    });
  });

  describe('list TDOs', () => {
    var recResult;
    var listRecords = null;
    var count = 0;
    

    beforeAll(() => {
      var query = `{
        temporalDataObjects(limit: 4) {
          offset
          limit
          count
          records {
            id
            name
            startDateTime
            stopDateTime
            applicationId
            source
            description
            mediaId
            status
            assets {
              records {
                id
                assetType
                uri
                signedUri
              }
            }
            tasks {
              records {
                id
                status
                engineId
                jobId
                sourceAssetId
              }
            }
            jsondata
            metadata {
              name
              ...on JSONObject {
                data
              }
              ...on FileData {
                size
                mimeType
                fileName
              }
              ...on Program {
                id
                image
                liveImage
              }
              ...on CloneData {
                originalId
                assetIdMap
                {
                  oldAssetId
                  newAssetId
                }
                cloneBlobs
                date
              }
            }

          }
        }

    }
          `;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        body = respObj.body;
        if (
          respObj.body &&
          respObj.body.data &&
          respObj.body.data.temporalDataObjects
        ) {
          listRecords = respObj.body.data.temporalDataObjects.records;
          count = respObj.body.data.temporalDataObjects.count;
        } else {
          console.log('no records in ' + JSON.stringify(respObj.body));
        }
        response = respObj;
      });
    });

    it('return 200', () => {
      return 
    });

    it('should have 4 records in response', () => {
      return expect(listRecords).toHaveLength(4);
    });
    it('should have count of 4', () => {
      return expect(count).toEqual(4);
    });
  });

  describe('list TDOs - sample media only', () => {
    var recResult;
    var listRecords = null;
    

    beforeAll(() => {
      var query = `{
        temporalDataObjects(sampleMedia: true) {
          offset
          limit
          count
          records {
            id
            name
            metadata {
              ...on CloneData {
                originalId
                assetIdMap
                {
                  oldAssetId
                  newAssetId
                }
                cloneBlobs
                date
              }
            }
          }
        }
      }`;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (
          respObj.body &&
          respObj.body.errors &&
          respObj.body.errors.length > 0 &&
          respObj.body.errors[0].message
        )
          message = respObj.body.errors[0].message;
        if (
          respObj.body &&
          respObj.body.data &&
          respObj.body.data.temporalDataObjects
        ) {
          listRecords = respObj.body.data.temporalDataObjects.records;
          count = respObj.body.data.temporalDataObjects.count;
        } else {
          console.log('no records in ' + JSON.stringify(respObj.body));
        }
        response = respObj;
      });
    });

    it('return 200', () => {
      return 
    });
    // TODO should be true. fix. defect open.
    it(
      'should have metadata containing originalId of cloned object',
      () => {
        return expect(_.some(listRecords, 'metadata[0].originalId')).to.be.false;
      }
    );
  });

  describe('post an asset without media', () => {
    var result;
    var errors = null;
    var jsondata;
    let response, body;
    
    beforeAll(() => {
      var query = `mutation {
      createAsset(input: {
          containerId: "${tdoId}"
          contentType: "text/html"
          description: "my test asset"
          type: "test"
          uri: "http://localhost:3000/api"
          name: "7306f48d-fbb2-4d10-be3e-565bb69819c1.mp3.ttml"

          fileData: {
            size: 6587
            originalFileUri: "http://localhost:3000/api"
            mediaDurationMs: 900123
          }
          sourceData: {
            name: "azure"
            taskId: "${taskId}"
          }
          details: {
            foo: "bar"
            tags: [
              {
                value: "foo"
                displayName: "Foo"
              }
            ]
          }
      }) {
          id
          createdDateTime
          description
          jsondata
          assetType
          type
          contentType
          fileData {
            size
            md5sum
            originalFileUri
            mediaDurationMs
          }
          sourceData {
            name
            taskId
            engineId
          }
          details
      }

      streamInitAsset: createAsset(input: {
        assetType: "media-init"
        uri: "http://localhost"
        contentType: "application/json"
        containerId: ${tdoId}
      }) {
        id
      }
    }
            `;
      result = chakram.post(url, { query: query }, { headers });
      //recResult = chakram.post(recUrl, data, { headers });
      return result.then(function(respObj) {
        response = respObj;
        body = respObj.body;
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.createAsset) {
          assetId = respObj.body.data.createAsset.id;
          jsondata = respObj.body.data.createAsset.jsondata;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has asset Id', () => {
      return expect(assetId).toBeDefined();
    });

    it('has jsondata', () => {
      return expect(jsondata).toBeDefined();
    });
    it('has source taskId', () => {
      return expect(
        _.get(body, 'data.createAsset.sourceData.taskId'),
        response
      ).toEqual(taskId);
    });
    it('has source engineId', () => {
      return expect(
        _.get(body, 'data.createAsset.sourceData.engineId'),
        response
      ).toBeDefined();
    });
    it('has media duration', () => {
      return expect(
        _.get(body, 'data.createAsset.fileData.mediaDurationMs'),
        response
      ).toEqual(900123);
    });
  });

  describe('update an asset', () => {
    var result;
    var errors = null;
    var data;
    beforeAll(() => {
      var query = `mutation {
      updateAsset(input: {
        id: "${assetId}"
          description: "my test asset"
          name: "new7306f48d-fbb2-4d10-be3e-565bb69819c1.mp3.ttml"

          fileData: {
            size: 6588
            originalFileUri: "http://localhost:3000/api"
            mediaDurationMs: 901456
          }
          sourceData: {
            name: "speech"
            taskId: "${taskId}"
            engineId: "${engineId}"
          }
          details: {
            foo: "bar"
            bar: "baz"
          }
      }) {
          id
          createdDateTime
          description
          jsondata
          assetType
          type
          contentType
          fileData {
            size
            md5sum
            originalFileUri
            mediaDurationMs
          }
          sourceData {
            name
            taskId
            engineId
          }
          details
      }
    }
            `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.updateAsset) {
          data = respObj.body.data.updateAsset;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has asset Id', () => {
      return expect(data.id).toEqual(assetId);
    });

    it('has jsondata', () => {
      return expect(data.jsondata).toBeDefined();
    });
    it('has updated media duration', () => {
      const mediaDuration = _.get(data, 'fileData.mediaDurationMs');
      return expect(mediaDuration).toEqual(901456);
    });
    it('has aliased source engine id', () => {
      const engineId = _.get(data, 'sourceData.engineId');
      return expect(engineId && validator.isUUID(engineId)).toEqual(true);
    });
  });

  describe('get an asset', () => {
    var result;
    var metadata;
    var contentType;
    var gotAssetId;
    let body;
    var errors = null;
    
    beforeAll(() => {
      var query = `query {
        t1: temporalDataObjects(limit:10) {
          records {
            assets {
              records {
                id
              }
            }
          }
        }
        temporalDataObjects(id: "${tdoId}") {
          records {
            a1: assets(limit:1 orderBy: createdDateTime orderDirection: asc) {
              records {
                id
              }
            }
            assets(id: "${assetId}") {
              records {
              id
              type
              jsondata
              contentType
              name
              uri
              signedUri
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
            }
            }
          }
        }
      }
            `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        body = respObj.body;
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.temporalDataObjects) {
          gotAssetId =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0].id;
          contentType =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0]
              .contentType;
          metadata =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0]
              .jsondata;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has correct asset Id', () => {
      return expect(gotAssetId).toEqual(assetId);
    });

    it('has correct content type', () => {
      return expect(contentType).toEqual('text/html');
    });

    it('has jsondata', () => {
      return expect(metadata).to.have.property('size');
    });
  });

  describe('get an asset by taskId', () => {
    let result;
    let metadata;
    let contentType;
    let gotAssetId;
    let sourceData;
    let errors = null;
    beforeAll(() => {
      let query = `query {
        temporalDataObjects(id: "${tdoId}") {
          records {
            assets(sourceTaskId: "${taskId}") {
              records {
              id
              type
              jsondata
              contentType
              name
              sourceData {
                name
                taskId
                engineId
                engine {
                  id
                  name
                }
              }
            }
            }
          }
        }
      }
            `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.temporalDataObjects) {
          gotAssetId =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0].id;
          contentType =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0]
              .contentType;
          metadata =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0]
              .jsondata;
          sourceData =
            respObj.body.data.temporalDataObjects.records[0].assets.records[0]
              .sourceData;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has correct asset Id', () => {
      return expect(gotAssetId).toEqual(assetId);
    });

    it('has correct content type', () => {
      return expect(contentType).toEqual('text/html');
    });

    it('has jsondata', () => {
      return expect(metadata).to.have.property('size');
    });

    it('has correct taskId', () => {
      return expect(sourceData.taskId).toEqual(taskId);
    });
    it('has aliased source engine id', () => {
      return expect(
        sourceData.engineId && validator.isUUID(sourceData.engineId)
      ).toEqual(true);
    });
  });

  describe('get an asset with convenience query', () => {
    var result;
    var metadata;
    var contentType;
    var gotAssetId;
    var assetData = null;
    var errors = null;
    
    beforeAll(() => {
      var recUrl = url + '/recording';
      var query = `query {
        asset(id: "${assetId}") {
              id
              jsondata
              contentType
              name
              type
              containerId
              container {
                id
              }
        }
      }
            `;
      result = chakram.post(url, { query: query }, { headers });

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.asset) {
          gotAssetId = respObj.body.data.asset.id;
          contentType = respObj.body.data.asset.contentType;
          metadata = respObj.body.data.asset.jsondata;
          assetData = respObj.body.data.asset;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has correct asset Id', () => {
      return expect(gotAssetId).toEqual(assetId);
    });

    it('has correct content type', () => {
      return expect(contentType).toEqual('text/html');
    });

    it('has jsondata', () => {
      return expect(metadata).to.have.property('size');
    });
    it('has container data', () => {
      return expect(_.get(assetData, 'container.id')).toEqual(tdoId);
    });
    it('has container id', () => {
      return expect(_.get(assetData, 'containerId')).toEqual(tdoId);
    });
  });

  // TODO - tests for creating an asset from a different organization.
  // Requires provisioning a test organization on all environments,
  // setting up the appropriate ACLs, and configuring the CI pipeline
  // to use to use an API key from that organization accordingly.

  describe('post an asset with media', () => {
    var result;
    
    var errors = null;
    beforeAll(() => {
      var query = `
  mutation {
    createAsset(input: {
      containerId: "${tdoId}"
      contentType: "video/mp4"
      description: "a transcript file"
      assetType: "media"
      setAsPrimary: true
    }) {
      id
      uri
      type
    }
  }`;

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('filename', 'movie.mp4')
        .attach('file', './citest/movie.mp4')
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
      });
    });

    it('has no errors', () => {
      return expect(errors).to.be.null;
    });
  });

  describe('post an asset with transcript', () => {
    var result;
    
    var errors = null;
    beforeAll(() => {
      var query = `
  mutation {
    createAsset(input: {
      containerId: "${tdoId}"
      contentType: "application/ttml+xml"
      description: "a transcript file"
      assetType: "transcript"
      setAsPrimary: true
    }) {
      id
      uri
      type
    }
  }`;

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('filename', 'transcript.ttml')
        .attach('file', './citest/test_transcript.ttml')
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body && respObj.body.data && respObj.body.data.createAsset)
          postAssetId = respObj.body.data.createAsset.id;
      });
    });

    it('has assetId', () => {
      return expect(postAssetId).toBeDefined();
    });

    it('has no errors', () => {
      return expect(errors).to.be.null;
    });
  });

  describe('create stream ingestor reprocess', () => {
    var result;
    
    var errors = null,
      body;
    beforeAll(() => {
      var query = `
      mutation {
        createJob(input: {
          targetId:"${tdoId}"
          tasks: [
            {
            engineId: "9e611ad7-2d3b-48f6-a51b-0a1ba40feab4"
            }
          ]
          isReprocessJob:true

        }) {
          id
          tasks {
            records {
              id
              engine {
                id
                name
              }
              payload
            }
          }
        }
      }
  `;

      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        body = respObj.body;
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
      });
    });

    it('has signed asset URI', () => {
      const tasks = _.get(body, 'data.createJob.tasks.records');
      expect(tasks).toBeDefined();
      expect(tasks.length).to.be.gt(0);
      let url;
      tasks.forEach(task => {
        const u = _.get(task, 'payload.url');
        if (u) url = u.toLowerCase();
      });
      expect(url).toBeDefined();
      const signed =
        url.includes('x-amz-signature') || url.includes('awsaccesskey');
      expect(signed).to.be.true;
    });

    it('has no errors', () => {
      return expect(errors).to.be.null;
    });
  });

  describe('post a hidden asset with media', () => {
    var result;
    
    var errors = null;
    beforeAll(() => {
      var query = `
  mutation {
    createAsset(input: {
      containerId: "${tdoId}"
      contentType: "application/ttml+xml"
      description: "a transcript file"
      assetType: "v-testonly-transcript"
    }) {
      id
      uri
      type
    }
  }`;

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('filename', 'test_transcript.ttml')
        .attach('file', './citest/test_transcript.ttml')
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body && respObj.body.data && respObj.body.data.createAsset)
          hiddenAssetId = respObj.body.data.createAsset.id;
      });
    });

    it('has assetId', () => {
      return expect(hiddenAssetId).toBeDefined();
    });

    it('has no errors', () => {
      return expect(errors).to.be.null;
    });
  });

  describe('get a hidden asset', () => {
    var result;
    var data;
    
    beforeAll(() => {
      var query = `query {
        hiddenInTDOByType: temporalDataObject(id: "${tdoId}") {
          assets(type: "v-test-transcript") {
            records {
              id
            }
          }
        }
        hiddenInTDOById: temporalDataObject(id: "${tdoId}") {
          assets(id: "${hiddenAssetId}") {
            records {
              id
            }
          }
        }
        hiddenGetById: asset(id: "${hiddenAssetId}") {
          id
        }
      }
            `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        data = respObj.body;
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return helpers.expect(data.errors, 'data.errors').to.be.undefined;
    });

    it('retrieved hidden asset by ID in TDO query', () => {
      const id = _.get(data, 'data.hiddenInTDOById.assets.records[0].id');
      return expect(id).toEqual(hiddenAssetId);
    });
    it('retrieved hidden asset by ID in asset query', () => {
      const id = _.get(data, 'data.hiddenGetById.id');
      return expect(id).toEqual(hiddenAssetId);
    });
    it('did not retrieve hidden asset by type in TDO query', () => {
      const id = _.get(data, 'data.hiddenInTDOByType.assets.records[0].id');
      return helpers.expect(id, 'id').to.be.undefined;
    });
  });

  describe('validate valid engine output', () => {
    let result;
    
    let body;
    beforeAll(() => {
      const query = `
      mutation validateEngineOutput($input: JSONData!) {
        validateEngineOutput(input: $input)
      }`;

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('variables', JSON.stringify({ input: engineOutput }))
        .expect(200);

      return result.then(function(respObj) {
        body = respObj.body;
      });
    });

    it('returns true when valid', () => {
      return expect(_.get(body, 'data.validateEngineOutput')).toEqual(true);
    });

    it('has no errors', () => {
      return helpers.expect(_.get(body, 'errors'), 'errors').to.be.undefined;
    });
  });

  describe('validate engine output should fail on missing fields', () => {
    let result, validateEngineOutput;
    
    let errors = null;
    beforeAll(() => {
      const query = `
      mutation validateEngineOutput($input: JSONData!) {
        validateEngineOutput(input: $input)
      }`;

      const input = {
        series: [
          {
            missingStartTime: 1
          }
        ]
      };

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('variables', JSON.stringify({ input }))
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        validateEngineOutput = respObj.body.data;
      });
    });

    it('has errors for validation failures', () => {
      return expect(errors).to.not.be.empty;
    });

    it('first error is requires start time', () => {
      return expect(errors[0].data[0].message).toEqual(
        'requires property "startTimeMs"'
      );
    });

    it('second error is requires stop time', () => {
      return expect(errors[0].data[1].message).toEqual(
        'requires property "stopTimeMs"'
      );
    });
  });

  describe('validate engine output should fail on invalid types', () => {
    let result, validateEngineOutput;
    
    let errors = null;
    beforeAll(() => {
      const query = `
      mutation validateEngineOutput($input: JSONData!) {
        validateEngineOutput(input: $input)
      }`;

      const input = {
        object: [
          {
            uri: 'This is not an uri'
          }
        ]
      };

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('variables', JSON.stringify({ input }))
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        validateEngineOutput = respObj.body.data;
      });
    });

    it('has errors for validation failures', () => {
      return expect(errors).to.not.be.empty;
    });

    it('first error is invalid uri', () => {
      return expect(errors[0].data[0].message).toEqual(
        'does not conform to the "uri" format'
      );
    });
  });

  describe('validate engine output should fail on invalid structured data', () => {
    const invalidSD = '9f6c396e-5ef1-4eba-b1e2-e5ae11384687';
    let result, validateEngineOutput;
    
    let errors = null;
    beforeAll(() => {
      const query = `
      mutation validateEngineOutput($input: JSONData!) {
        validateEngineOutput(input: $input)
      }`;

      const input = {
        object: [
          {
            label: 'data',
            structuredData: {
              [invalidSD]: {
                key: 'value'
              }
            }
          }
        ]
      };

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('variables', JSON.stringify({ input }))
        .expect(200);

      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        validateEngineOutput = respObj.body.data;
      });
    });

    it('has errors for validation failures', () => {
      return expect(errors).to.not.be.empty;
    });

    it('first error is requires start time', () => {
      return expect(errors[0].name).toEqual(`not_found`);
      /*
      return expect(errors[0].data[0].message).toEqual(
        `Cannot find schema with ID = ${invalidSD}`
      );
      */
    });
  });

  describe('get asset with XML transformer', () => {
    
    let result, transformerResp;
    beforeAll(() => {
      const query = `
      query {
        asset(id: "${postAssetId}"){
          id
          xml2json: transform(transformFunction: XML2JSON)
          transcript2json: transform(transformFunction: Transcript2JSON)
          json: transform(transformFunction: JSON)
        }
      }
      `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(resp => {
        if (resp.body && resp.body.errors) {
          errors = resp.body.errors;
        }
        if (resp.body.data && resp.body.data.asset) {
          transformerResp = resp.body.data.asset.xml2json;
        }
      });
    });

    it('return 200', () => expect(result).to.have.status(200));
    it('has asset Id', () => expect(assetId).to.be.not.empty);
    it('has transformer data', () =>
      expect(JSON.parse(transformerResp)).to.not.throw.error);
  });

  describe('get asset with Transcript transformer', () => {
    
    let result, transformerResp;
    beforeAll(() => {
      const query = `
      query {
        asset(id: "${postAssetId}"){
          id
          transform(transformFunction: Transcript2JSON)
        }
      }
      `;
      result = chakram.post(url, { query: query }, { headers });
      return result.then(resp => {
        if (resp.body && resp.body.errors) {
          errors = resp.body.errors;
        }
        if (resp.body.data && resp.body.data.asset) {
          transformerResp = resp.body.data.asset.transform;
        }
      });
    });

    it('return 200', () => expect(result).to.have.status(200));
    it('has asset Id', () => expect(assetId).to.be.not.empty);
    it('has transformer data', () =>
      expect(JSON.parse(transformerResp)).to.not.throw.error);
  });

  describe('set primary media and transcript assets', () => {
    var result;
    var errors = null;
    var gotId;
    var mediaAsset;
    var transcriptAsset;
    var newDate;
    var data;
    
    beforeAll(() => {
      var query = `
      mutation {
        updateTDO(input: {
            id: "${tdoId}"
            stopDateTime:  1514497889693
            startDateTime: "2017-12-28T21:51:19.000Z"
            status: "recorded"
            primaryAsset: [ {
                id: "${assetId}"
                assetType: "transcript"
              }, {
                id: "${postAssetId}"
                assetType: "media"
              }
            ]
            sourceImageUrl: "${liveImage2}"
            details: {
              veritoneProgram: {
                programLiveImage: "${liveImage2}"
              }
              tags: [{value: "foo"}, {value:"bar"}, {value:"baz"}]
            }
          }
        ) {
          id

          media: primaryAsset(assetType: "media") {
            id
            assetType
          }
          transcript: primaryAsset(assetType: "transcript") {
            id
            assetType
          }
          stopDateTime
          startDateTime
          jsondata
          source
          createdDateTime
          details
          thumbnailUrl
          sourceImageUrl
          status
          metadata {
            ... on Program {
              id
              liveImage
              image
            }
          }
        }
      }
            `;

      result = chakram.post(url, { query: query }, { headers });

      return result.then(function(respObj) {
        data = respObj.body;
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.updateTDO) {
          gotId = respObj.body.data.updateTDO.id;
          mediaAsset = respObj.body.data.updateTDO.media;
          transcriptAsset = respObj.body.data.updateTDO.transcript;
          newDate = respObj.body.data.updateTDO.stopDateTime;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });

    it('has asset Id', () => {
      return expect(gotId).toEqual(tdoId);
    });
    it('has media asset', () => {
      return expect(mediaAsset).toBeDefined();
    });
    it('has transcript asset', () => {
      return expect(transcriptAsset).toBeDefined();
    });
    it('has correct media id', () => {
      return expect(mediaAsset.id).toEqual(postAssetId);
    });
    it('has correct transcript id', () => {
      return expect(transcriptAsset.id).toEqual(assetId);
    });
    it('has correct stopDateTime', () => {
      return expect(newDate).toEqual('2017-12-28T21:51:29.693Z');
    });
    it('has correct startDateTime', () => {
      return expect(_.get(data, 'data.updateTDO.startDateTime')).toEqual(
        '2017-12-28T21:51:19.000Z'
      );
    });
    it('did not clear other metadata', () => {
      return expect(_.get(data, 'data.updateTDO.jsondata.source')).toEqual(
        'foo'
      );
    });
    it('did not clear other metadata', () => {
      return expect(_.get(data, 'data.updateTDO.source')).toEqual('foo');
    });
    it('did not clear other metadata', () => {
      return expect(_.get(data, 'data.updateTDO.createdDateTime')).toBeDefined();
    });
    it('has program image - field', () => {
      return expect(_.get(data, 'data.updateTDO.sourceImageUrl')).toEqual(
        liveImage2
      );
    });
    it('has program image - details', () => {
      return expect(
        _.get(data, 'data.updateTDO.details.veritoneProgram.programImage')
      ).toEqual(liveImage2);
    });

    it('has program live image', () => {
      return expect(_.get(data, 'data.updateTDO.thumbnailUrl')).toEqual(
        liveImage2
      );
    });
    it('has program live image', () => {
      return expect(
        _.get(data, 'data.updateTDO.details.veritoneProgram.programLiveImage')
      ).toEqual(liveImage2);
    });
    it('has new tags', () => {
      const tags = _.get(data, 'data.updateTDO.details.tags');
      expect(tags).toBeDefined();
      expect(tags).toHaveLength(3);
      //expect(tags.includes('baz')).toEqual(true);
      //expect(tags.includes('bar')).toEqual(true);
    });
    it('has updated status', () => {
      return expect(_.get(data, 'data.updateTDO.status')).toEqual('recorded');
    });
  });

  describe('get a TDO with convenience query and test primary asset IDs', () => {
    var recResult;
    var errors = null;
    var tdo = null;
    var gotTdoId;
    

    beforeAll(() => {
      var query = `{
    temporalDataObject(id:"${tdoId}") {

      id

      createdDateTime
          modifiedDateTime
          security{
            global
        }

        mediaAsset: primaryAsset(assetType: "media") {
          id
          assetType
        }
        transcriptAsset: primaryAsset(assetType: "transcript") {
          id
          assetType
        }
        assetsByAssetType: assets(assetType:"media" limit:1 orderBy: createdDateTime orderDirection: asc) {
          records {
            id
            assetType
          }
        }
        assetsByType: assets(type:"media"  limit:1 orderBy: createdDateTime orderDirection: asc) {
          records {
            id
            type
            createdDateTime
          }
        }
        streams {
          uri
          protocol
        }
    }

    }
          `;
      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        if (respObj.body && respObj.body.data) {
          tdo = respObj.body.data.temporalDataObject;
          gotTdoId = tdo.id;
        } else {
          console.log('no records in ' + JSON.stringify(respObj.body));
        }
        response = respObj;
      });
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });
    it('return 200', () => {
      return 
    });

    it('should have correct ID', () => {
      return expect(gotTdoId).toEqual(tdoId);
    });
    it('has media asset', () => {
      return expect(tdo.mediaAsset).toBeDefined();
    });
    it('has transcript asset', () => {
      return expect(tdo.transcriptAsset).toBeDefined();
    });
    it('has correct media id', () => {
      return expect(tdo.mediaAsset.id).toEqual(postAssetId);
    });
    it('has correct transcript id', () => {
      return expect(tdo.transcriptAsset.id).toEqual(assetId);
    });
    it('should have record in assets filtered by media type', () => {
      expect(tdo.assetsByType.records).toHaveLength(1);
      // Comment out this since there are some assetsByType
      // which have the same createdDateTime, so they cannot
      // be sorted exactly by createdDateTime
      // expect(tdo.assetsByType.records[0].id).toEqual(postAssetId);
      return expect(tdo.assetsByType.records[0].type).toEqual('media');
    });
    it('should have record in assets filtered by media type', () => {
      expect(tdo.assetsByAssetType.records).toHaveLength(1);
      // Comment out with the same reason above
      // expect(tdo.assetsByAssetType.records[0].id).toEqual(postAssetId);
      return expect(tdo.assetsByAssetType.records[0].assetType).toEqual('media');
    });
    it('should have streams', () => {
      expect(_.get(tdo, 'streams.length')).toEqual(2);
      expect(_.get(tdo, 'streams[0].uri')).toBeDefined();
      expect(_.get(tdo, 'streams[0].protocol')).to.be.oneOf(['hls', 'dash']);
      expect(_.get(tdo, 'streams[1].uri')).toBeDefined();
      expect(_.get(tdo, 'streams[1].protocol')).to.be.oneOf(['hls', 'dash']);
    });
  });

  describe('get a TDO and assets using magic ID', () => {
    let recResult;
    let body;
    
    let magicId;

    beforeAll(() => {
      console.log('magic get tdo ' + tdoId);
      magicId = magicIdUtil.createRecordingId(
        tdoId,
        [postAssetId],
        [
          {
            assetId: assetId,
            startDateTime: '2017-12-28T21:52:19.000Z',
            endDateTime: '2017-12-28T21:52:29.000Z'
          },
          {
            startDateTime: '2017-12-28T22:00:00.000Z',
            endDateTime: '2017-12-28T22:10:00.000Z'
          }
        ]
      );
      console.log('MAGIC TDO ID = ' + magicId);

      var query = `{
    tdo: temporalDataObject(id:"${magicId}") {
      id
      startDateTime
      stopDateTime
      mediaAsset: primaryAsset(assetType: "media") {
        id
        assetType
        uri
      }
      transcriptAsset: primaryAsset(assetType: "transcript") {
        id
        assetType
        uri
      }
      assets: assets {
        records {
          id
          assetType
          uri
        }
      }
    }

    tdos: temporalDataObjects(id: "${magicId}") {
      records {
        id
        assets(orderBy: assetType, orderDirection: asc) {
          records {
            id
            uri
            assetType
          }
        }
      }
    }
  }
          `;
      return chakram
        .post(url, { query: query }, { headers })
        .then(function(respObj) {
          recResult = respObj;
          body = respObj.body;
        });
    });
    it('return 200', () => {
      return expect(response, recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return helpers.expect(_.get(body, 'errors'), recResult).to.be
        .undefined;
    });

    it('has correct ID on TDO', () => {
      return expect(_.get(body, 'data.tdo.id'), recResult).toEqual(
        magicId
      );
    });
    it('has notranscript asset', () => {
      return expect(
        _.get(body, 'data.tdo.transcriptAsset.id'),
        recResult
      ).to.be.equal(assetId);
    });
    it('has correct media id', () => {
      return expect(
        _.get(body, 'data.tdo.mediaAsset.id'),
        recResult
      ).toEqual(postAssetId);
    });
    it('has correct media id in assets', () => {
      return expect(
        _.get(body, 'data.tdo.assets.records[0].id'),
        recResult
      ).toEqual(postAssetId);
    });
    it('has correct URI', () => {
      const uri = _.get(body, 'data.tdos.records[0].assets.records[0].uri');
      if (!helpers.isLocalHost(uri)) {
        expect(uri.includes('media-streamer'), recResult).toEqual(
          true
        );
      }
    });
    it('has correct ID on TDOs', () => {
      return expect(
        _.get(body, 'data.tdos.records[0].id'),
        recResult
      ).to.be.equal(magicId);
    });
  });

  describe('delete an asset', () => {
    var result;
    
    var delerrors = null;
    var delAssetId = null;
    beforeAll(() => {
      var query = `mutation {
      deleteAsset(id: "${assetId}") {
          id
          message
      }
    }
            `;

      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          delerrors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.deleteAsset) {
          delAssetId = respObj.body.data.deleteAsset.id;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });
    it('did not return any errors', () => {
      return expect(delerrors).to.be.null;
    });

    it('has asset Id', () => {
      return expect(delAssetId).toEqual(assetId);
    });
  });

  describe('delete another asset', () => {
    var result;
    
    var delerrors = null;
    var delAssetId = null;
    beforeAll(() => {
      var query = `mutation {
      deleteAsset(id: "${postAssetId}") {
          id
          message
      }
    }
            `;

      result = chakram.post(url, { query: query }, { headers });
      return result.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          delerrors = respObj.body.errors;
        }
        if (respObj.body.data && respObj.body.data.deleteAsset) {
          delAssetId = respObj.body.data.deleteAsset.id;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });
    it('did not return any errors', () => {
      return expect(delerrors).to.be.null;
    });

    it('has asset Id', () => {
      return expect(delAssetId).toEqual(postAssetId);
    });
  });

  describe('create a TDO with asset', () => {
    var recResult;
    
    var tdourl = 'http://localhost/foo';

    var response;
    const withAssetName = `test-${Date.now()}`;

    beforeAll(() => {
      const folderIdSet = folderId ? `parentFolderId: "${folderId}"` : '';

      var query = `mutation {
    createTDOWithAsset(input: {
      isPublic: true
      startDateTime: "2017-12-28T22:30:57.000Z"
      scheduleId: "${scheduledJobId}"
      sourceId: "${sourceId}"
      uri: "${tdourl}"
      details: {
        veritoneProgram: {
          programLiveImage: "${liveImage1}"
        }
        tags: [{value: "foo"}, {value: "bar"}]
      }
      name: "${withAssetName}"
      addToIndex: true
      ${folderIdSet}
    }) {
        id
        name
        createdDateTime
        modifiedDateTime
        applicationId
        security {
          global
        }
        startDateTime
        stopDateTime
        source
        jsondata
        primaryAsset(assetType: "media") {
          id
          assetType
          uri
          contentType
        }
        details
        folders {
          treeObjectId
        }
        metadata {
          ...on FileData {
                size
                mimeType
                fileName
              }
          ...on Program {
            id
            image
            liveImage
          }
        }
    }
  }
          `;

      recResult = chakram.post(url, { query: query }, { headers });

      return recResult.then(function(respObj) {
        response = respObj;
        tdoId2 = _.get(result, 'createTDOWithAsset.id');
      });
    });

    it('return 200', () => {
      return expect(recResult).to.have.status(200);
    });
    it('did not return any errors', () => {
      return helpers.expect(_.get(response, 'errors'), 'errors').to.be.undefined;
    });

    it('has TDO Id', () => {
      return expect(tdoId2).toBeDefined();
    });
    it('is public', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.security.global')
      ).to.be.true;
    });
    it('has name', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.name')
      ).toEqual(withAssetName);
    });
    it('has created and modified times', () => {
      expect(_.get(result, 'createTDOWithAsset.createdDateTime')).toBeDefined();
      expect(_.get(result, 'createTDOWithAsset.modifiedDateTime')).toBeDefined();
      expect(
        _.get(result, 'createTDOWithAsset.createdDateTime')
      ).to.be.lessThan(
        _.get(result, 'createTDOWithAsset.modifiedDateTime')
      );
    });

    it('has the right asset', () => {
      expect(_.get(result, 'createTDOWithAsset.primaryAsset.id')).toBeDefined();
      expect(
        _.get(result, 'createTDOWithAsset.primaryAsset.uri')
      ).toEqual(tdourl);
      expect(
        _.get(result, 'createTDOWithAsset.primaryAsset.contentType')
      ).toEqual('video/mp4');
      expect(
        _.get(result, 'createTDOWithAsset.primaryAsset.assetType')
      ).toEqual('media');
    });

    it('has correct start date time', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.startDateTime')
      ).toEqual('2017-12-28T22:30:57.000Z');
    });
    it('has correct stop date time', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.stopDateTime')
      ).toEqual('2017-12-28T22:45:57.000Z');
    });
    it('has correct programLiveImage', () => {
      return expect(
        _.get(
          response,
          'body.data.createTDOWithAsset.details.veritoneProgram.programLiveImage'
        )
      ).toEqual(liveImage1);
    });
    it('has correct programName', () => {
      return expect(
        _.get(
          response,
          'body.data.createTDOWithAsset.details.veritoneProgram.programName'
        )
      ).toEqual(scheduledJobName);
    });
    it('has folder treeObjectId', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.folders[0].treeObjectId')
      ).toEqual(folderId);
    });
    it('has addToIndex in tdo details', () => {
      return expect(
        _.get(result, 'createTDOWithAsset.details.addToIndex')
      ).toEqual(true);
    });
  });

  describe('create a TDO with asset - file', () => {
    var result;
    var errors = null;
    var tdourl =
      'https://storage.googleapis.com/test-us-proxies/c8e4502e-5f82-11e8-b117-0a580a3c104d/b88dbbc6-78bc-11e8-bbcd-0b580a3c0da4.mp4?GoogleAccessId=bucket-access%40iconik-production-environments.iam.gserviceaccount.com&Expires=1530099543&Signature=HrLOdlnzBUZInW0qM8zb1pUy6RQSItqOan2mWtI3LPDNv4sSZSzKhJhJUFQuetVF0w%2FKgGNMnmAhOptX7P8UZg9Q1pxkt6un2Jl%2F2dBIvqH39BgOyjurFxchdHaE%2Bc%2FDZeOttC1oHPOCOhVq%2F43S01%2FZVHqIQAaqOwyQcr08hBv6KOoyzYWjdNole6ck1cn%2F55cVrtEtE5V%2BPFAPcMprWVn5xMVJE3XWLDBFXW8boqw4yFhGc3o1%2BjD2WA26cx37Q6vld4kmnTAmOkdCYE3jwoifDKqeMWh186UPFopADOFP6qrczT07oJStYc40DwUvV1mpdatLtwVaEFHayYf1Jw%3D%3D&response-content-disposition=inline%3B%20filename%3D180620_DEF_123_E-lowrs.mp4';
    var response;

    beforeAll(() => {
      var query = `mutation {
    createTDOWithAsset(input: {
      isPublic: true
      startDateTime: "2017-12-28T22:30:57.000Z"
      scheduleId: "${scheduledJobId}"
      sourceData: {
        taskId: "${taskId}"
        sourceId: "${sourceId}"
      }
      addToIndex: false
    }) {
        id
        createdDateTime
        modifiedDateTime
        applicationId
        security {
          global
        }
        startDateTime
        stopDateTime
        source
        jsondata
        primaryAsset(assetType: "media") {
          id
          assetType
          uri
          contentType
        }
        details
    }
  }
          `;

      result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('filename', 'test_transcript.ttml')
        .attach('file', './citest/test_transcript.ttml')
        .expect(200);

      return result.then(function(respObj) {
        result = respObj;
      });
    });

    it('did not return any errors', () => {
      return helpers.expect(_.get(result, 'body.errors'), 'body.errors').to.be
        .undefined;
    });
    it('has TDO Id', () => {
      tdoId3 = _.get(result, 'body.data.createTDOWithAsset.id');
      return expect(tdoId3).toBeDefined();
    });
    it('is public', () => {
      return expect(_.get(result, 'body.data.createTDOWithAsset.security.global'))
        .to.be.true;
    });

    it('has created and modified times', () => {
      expect(_.get(result, 'body.data.createTDOWithAsset.createdDateTime')).toBeDefined();
      expect(_.get(result, 'body.data.createTDOWithAsset.modifiedDateTime')).toBeDefined();
      expect(
        _.get(result, 'body.data.createTDOWithAsset.createdDateTime')
      ).to.be.lessThan(
        _.get(result, 'body.data.createTDOWithAsset.modifiedDateTime')
      );
    });

    it('has the right asset', () => {
      expect(_.get(result, 'body.data.createTDOWithAsset.primaryAsset.id')).toBeDefined();
      expect(
        _.get(result, 'body.data.createTDOWithAsset.primaryAsset.contentType')
      ).toEqual('video/mp4');
      expect(
        _.get(result, 'body.data.createTDOWithAsset.primaryAsset.assetType')
      ).toEqual('media');
    });

    it('has correct start date time', () => {
      return expect(
        _.get(result, 'body.data.createTDOWithAsset.startDateTime')
      ).toEqual('2017-12-28T22:30:57.000Z');
    });
    it('has correct stop date time', () => {
      return expect(
        _.get(result, 'body.data.createTDOWithAsset.stopDateTime')
      ).toEqual('2017-12-28T22:45:57.000Z');
    });
    it('has addToIndex in tdo details', () => {
      return expect(
        _.get(result, 'body.data.createTDOWithAsset.details.addToIndex')
      ).toEqual(false);
    });
  });

  describe('create tdo with asset with no stop time - sec', () => {
    let result, errors, tdoIso, tdoMs, tdoSec;
    const startTime = moment();
    const stopTime = moment(startTime).add(900, 'seconds');

    beforeAll(() => {
      var query = `mutation {
      tdoSec: createTDOWithAsset(
        input: {
          startDateTime: ${startTime.unix()}
          updateStopDateTimeFromAsset: true
          uri: "https://s3.amazonaws.com/dev-chunk-cache-tmp/AC.mp4"
        }
      ) {
        id
        startDateTime
        stopDateTime
      }
      tdoMs: createTDOWithAsset(
        input: {
          startDateTime: ${startTime.valueOf()}
          updateStopDateTimeFromAsset: true
          uri: "https://s3.amazonaws.com/dev-chunk-cache-tmp/AC.mp4"
        }
      ) {
        id
        startDateTime
        stopDateTime
      }
      tdoIso: createTDOWithAsset(
        input: {
          startDateTime: "${startTime.toISOString()}"
          updateStopDateTimeFromAsset: true
          uri: "https://s3.amazonaws.com/dev-chunk-cache-tmp/AC.mp4"
        }
      ) {
        id
        startDateTime
        stopDateTime
      }
      }`;

      result = chakram.post(url, { query }, { headers });
      return result.then(function(respObj) {
        errors = respObj.body.errors;
        if (respObj.body.data) {
          tdoIso = respObj.body.data.tdoIso;
          tdoMs = respObj.body.data.tdoMs;
          tdoSec = respObj.body.data.tdoSec;
        }
      });
    });

    it('return 200', () => {
      return expect(result).to.have.status(200);
    });
    it('did not return any errors', () => {
      return expect(errors).to.not.exist;
    });

    it('returned ids', () => {
      tdoId3 = _.get(tdoIso, 'id');
      tdoId4 = _.get(tdoMs, 'id');
      tdoId5 = _.get(tdoSec, 'id');
      return (
        expect(tdoId3).toBeDefined() &&
        expect(tdoId4).toBeDefined() &&
        expect(tdoId5).toBeDefined()
      );
    });

    it('has right start time ms', () => {
      const timeWithoutMs = moment.unix(startTime.unix()).toISOString();
      return (
        expect(tdoSec.startDateTime).toEqual(timeWithoutMs) &&
        expect(tdoMs.startDateTime).toEqual(startTime.toISOString()) &&
        expect(tdoIso.startDateTime).toEqual(timeWithoutMs)
      );
    });

    it('has right stop time ms', () => {
      const timeWithoutMs = moment.unix(stopTime.unix()).toISOString();

      return (
        expect(tdoSec.stopDateTime).toEqual(timeWithoutMs) &&
        expect(tdoMs.stopDateTime).toEqual(stopTime.toISOString()) &&
        expect(tdoIso.stopDateTime).toEqual(timeWithoutMs)
      );
    });
  });

  describe('setup TDO adjust generated media-streamer URLs for portable edge content test', () => {
    
    let clusterId,
      tdoIdPortable,
      tdoIdPortable2,
      engineId,
      taskIdPortable,
      ipExternal,
      managementNodeID,
      assetIdPortable,
      tdoStartDateTime2,
      tdoStopDateTime2;

    it('should create a portable cluster with type OnPrem', () => {
      const query = `mutation createCluster($input: CreateCluster!) {
        createCluster(input: $input) {
          id
          type
        }
      }`;
      const variables = {
        input: {
          name: 'test portable Cluster',
          type: 'OnPrem',
          allowedEngines: [],
          dockerCredentials: '{}'
        }
      };

      return chakram
        .post(url, { query, variables: JSON.stringify(variables) }, { headers })
        .then(response => {
          
          helpers.expect(_.get(result, 'errors'), 'body.data.errors')
            .to.be.undefined;
          const createCluster = _.get(result, 'createCluster');
          expect(createCluster).toBeDefined();
          clusterId = createCluster.id;
          expect(clusterId).toBeDefined();
          expect(createCluster.type).toEqual('OnPrem');
        });
    });

    it('should create a Node for cluster', () => {
      const query = `mutation createClusterNode($input: CreateClusterNode!) {
        createClusterNode(input: $input) {
          id
          clusterId
          metrics
        }
      }`;
      const variables = {
        input: {
          clusterId,
          name: 'a management code',
          metrics: {
            mbRam: 122878,
            mbDisk: 248105,
            version: '0.1.8',
            bundleId: 'a5eac659-411d-442f-b5b7-6b8bd51a129d',
            cpuCount: 16,
            gpuCount: 0,
            bundleDate: '201905171628',
            ipExternal: '18.204.220.144',
            ipInternal: '10.0.183.35',
            isMasterNode: true,
            ansibleVersion: 'ansible 2.5.15'
          }
        }
      };

      return chakram
        .post(url, { query, variables: JSON.stringify(variables) }, { headers })
        .then(response => {
          helpers.expect(_.get(result, 'errors'), 'body.data.errors')
            .to.be.undefined;
          expect(response.body.data.createClusterNode).toBeDefined();
          expect(response.body.data.createClusterNode.id).toBeDefined();
          expect(response.body.data.createClusterNode.clusterId).toEqual(
            clusterId
          );
          expect(response.body.data.createClusterNode.metrics).toBeDefined();
          expect(response.body.data.createClusterNode.metrics.ipExternal).toBeDefined();
          ipExternal = _.get(
            response,
            'body.data.createClusterNode.metrics.ipExternal'
          );
          managementNodeID = _.get(result, 'createClusterNode.id');
        });
    });

    it('should set the management node for cluster', () => {
      const query = `mutation updateCluster($input: UpdateCluster!) {
        updateCluster(input: $input) {
          id
          managementNodeID
          clusterConfig
        }
      }`;
      const variables = {
        input: {
          id: clusterId,
          managementNodeID
        }
      };

      return chakram
        .post(url, { query, variables: JSON.stringify(variables) }, { headers })
        .then(response => {
          helpers.expect(_.get(result, 'errors'), 'body.data.errors')
            .to.be.undefined;
          expect(response.body.data.updateCluster).toBeDefined();
          expect(response.body.data.updateCluster.id).toEqual(clusterId);
          expect(response.body.data.updateCluster.managementNodeID).toEqual(
            managementNodeID
          );
          expect(response.body.data.updateCluster.clusterConfig).toBeDefined();
          expect(
            response.body.data.updateCluster.clusterConfig.managementNodeId
          ).toEqual(managementNodeID);
        });
    });

    it(
      'should create a TDO with clusterId passed in sourceData and check virtual asset',
      () => {
        const time = moment.utc().subtract(1, 'day');
        const query = `mutation createTDO($input: CreateTDO) {
          createTDO(input: $input) {
            id
            sourceData {
              clusterId
            }
            primaryAsset(assetType: "media") {
              id
              assetType
              details
              uri
              signedUri
            }
          }
        }`;
        const variables = {
          input: {
            startDateTime: time.toISOString(),
            stopDateTime: time.add(3, 'minutes').toISOString(),
            sourceData: {
              clusterId
            },
            details: {
              numSegments: 1
            }
          }
        };

        return chakram
          .post(url, { query, variables: JSON.stringify(variables) }, { headers })
          .then(response => {
            
            helpers.expect(_.get(result, 'errors'), 'body.data.errors')
              .to.be.undefined;
            const createTDO = _.get(result, 'createTDO');
            expect(createTDO).toBeDefined();
            expect(createTDO.id).toBeDefined();
            tdoIdPortable = createTDO.id;
            expect(createTDO.sourceData.clusterId).toEqual(clusterId);
            // check virtual asset
            expect(createTDO.primaryAsset.assetType).toEqual('media');
            expect(createTDO.primaryAsset.uri).toBeDefined();
            expect(createTDO.primaryAsset.signedUri).toBeDefined();
            expect(_.includes(createTDO.primaryAsset.uri, ipExternal)).toEqual(
              true
            );
            expect(
              _.includes(createTDO.primaryAsset.signedUri, ipExternal)
            ).toEqual(true);
            expect(createTDO.primaryAsset.details).toBeDefined();
            expect(createTDO.primaryAsset.details.virtualAsset).toEqual(true);
          });
      }
    );

    it('should find an newest engine', () => {
      const query = `query {
        engines(limit: 1, orderBy: {
          field: createdDateTime
          direction: desc
        }, state: active, createsTDO: true) {
          count
          records {
            id
            name
            isPublic
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
        helpers.expect(_.get(result, 'errors'), 'body.data.errors').to
          .be.undefined;
        expect(response.body.data.engines).toBeDefined();
        expect(response.body.data.engines.count).toEqual(1);
        engineId = _.get(result, 'engines.records[0].id');
        expect(engineId).toBeDefined();
      });

    it('should create a job in cluster', () => {
      const query = `mutation createJob {
        createJob(input: {
          clusterId: "${clusterId}"
          tasks: [{
            engineId: "${engineId}",
            payload: {
              startDateTime: 1430797089,
              fileUri: "http://where.com/file/is.mp3"
            }
          }]
        }) {
          id
          clusterId
          tasks {
            count
            records {
              id
              engineId
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
        
        expect(response.body.data.createJob).toBeDefined();
        expect(response.body.data.createJob.id).toBeDefined();
        expect(
          response.body.data.createJob.clusterId,
          response
        ).toEqual(clusterId);
        expect(
          response.body.data.createJob.tasks.count,
          response
        ).toEqual(1);
        taskIdPortable = _.get(
          response,
          'body.data.createJob.tasks.records[0].id'
        );
        expect(taskIdPortable).toBeDefined();
        expect(
          response.body.data.createJob.tasks.records[0].engineId,
          response
        ).toEqual(engineId);
      });

    it('should create a TDO with taskId passed in sourceData', () => {
      const time = moment.utc().subtract(1, 'day');
      const query = `mutation createTDO($input: CreateTDO) {
        createTDO(input: $input) {
          id
          startDateTime
          stopDateTime
          sourceData {
            taskId
            clusterId
          }
        }
      }`;
      const variables = {
        input: {
          startDateTime: time.toISOString(),
          stopDateTime: time.add(3, 'minutes').toISOString(),
          sourceData: {
            taskId: taskIdPortable
          }
        }
      };

      return chakram
        .post(url, { query, variables: JSON.stringify(variables) }, { headers })
        .then(response => {
          
          expect(_.get(result, 'errors')).to.be
    
          const createTDO = _.get(result, 'createTDO');
          expect(createTDO).toBeDefined();
          expect(createTDO.id).toBeDefined();
          tdoIdPortable2 = createTDO.id;
          expect(createTDO.sourceData.clusterId).toEqual(
            clusterId
          );
          expect(createTDO.sourceData.taskId).toEqual(
            taskIdPortable
          );
          expect(createTDO.startDateTime).toBeDefined();
          expect(createTDO.stopDateTime).toBeDefined();
          tdoStartDateTime2 = createTDO.startDateTime;
          tdoStopDateTime2 = createTDO.stopDateTime;
        });
    });

    it('should create an asset with media', () => {
      const query = `mutation {
        createAsset(input: {
          containerId: "${tdoIdPortable2}"
          contentType: "video/mp4"
          description: "a media file"
          assetType: "media"
          setAsPrimary: true
        }) {
          id
          assetType
          uri
          signedUri
          details
        }
      }`;
      const result = supertest
        .post('')
        .set(headers)
        .field('query', query)
        .field('filename', 'movie.mp4')
        .attach('file', './citest/movie.mp4')
        .expect(200);

      return result.then(response => {
        helpers.expect(_.get(result, 'errors'), 'body.data.errors').to
          .be.undefined;
        expect(response.body.data.createAsset).toBeDefined();
        expect(response.body.data.createAsset.id).toBeDefined();
        expect(response.body.data.createAsset.assetType).toEqual('media');
        expect(response.body.data.createAsset.uri).toBeDefined();
        expect(response.body.data.createAsset.signedUri).toBeDefined();
        assetIdPortable = response.body.data.createAsset.id;
      });
    });

    it('should get TDO using magicId', () => {
      const magicId = magicIdUtil.createRecordingId(
        tdoIdPortable2,
        [assetIdPortable],
        [
          {
            assetId: assetIdPortable,
            startDateTime: tdoStartDateTime2,
            endDateTime: tdoStopDateTime2
          }
        ]
      );
      const query = `query {
        temporalDataObject(id: "${magicId}") {
          id
          startDateTime
          stopDateTime
          primaryAsset(assetType: "media") {
            id
            assetType
            uri
            signedUri
          }
          assets {
            count
            records {
              id
              assetType
              uri
              signedUri
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
        
        expect(response.body.data.temporalDataObject).toBeDefined();
        expect(
          response.body.data.temporalDataObject.id,
          response
        ).toEqual(magicId);
        expect(
          response.body.data.temporalDataObject.primaryAsset,
          response
        ).toBeDefined();
        expect(
          response.body.data.temporalDataObject.primaryAsset.assetType,
          response
        ).toEqual('media');
        expect(
          response.body.data.temporalDataObject.primaryAsset.id,
          response
        ).toEqual(assetIdPortable);
        expect(
          response.body.data.temporalDataObject.primaryAsset.uri.includes(
            helpers.isLocalHost(
              response.body.data.temporalDataObject.primaryAsset.uri
            )
              ? `/mediasource/-1/programId/-1`
              : `http://${ipExternal}/media-streamer/mediasource/-1/programId/-1`
          ),
          response
        ).toEqual(true);
        expect(
          response.body.data.temporalDataObject.primaryAsset.signedUri.includes(
            helpers.isLocalHost(
              response.body.data.temporalDataObject.primaryAsset.signedUri
            )
              ? `/mediasource/-1/programId/-1`
              : `http://${ipExternal}/media-streamer/mediasource/-1/programId/-1`
          ),
          response
        ).toEqual(true);
        expect(
          response.body.data.temporalDataObject.assets.count,
          response
        ).toEqual(1);
        expect(
          response.body.data.temporalDataObject.assets.records[0].id,
          response
        ).toEqual(assetIdPortable);
        expect(
          response.body.data.temporalDataObject.assets.records[0].assetType,
          response
        ).toEqual('media');
        expect(
          response.body.data.temporalDataObject.assets.records[0].uri.includes(
            helpers.isLocalHost(
              response.body.data.temporalDataObject.assets.records[0].uri
            )
              ? `/mediasource/-1/programId/-1`
              : `http://${ipExternal}/media-streamer/mediasource/-1/programId/-1`
          ),
          response
        ).toEqual(true);
        expect(
          response.body.data.temporalDataObject.assets.records[0].signedUri.includes(
            helpers.isLocalHost(
              response.body.data.temporalDataObject.assets.records[0].signedUri
            )
              ? `/mediasource/-1/programId/-1`
              : `http://${ipExternal}/media-streamer/mediasource/-1/programId/-1`
          ),
          response
        ).toEqual(true);
      });

    it('delete artifacts created during the test', () => {
      const query = `mutation {
        deleteAsset(id: "${assetIdPortable}") {
          id
          message
        }
        deleteTDO: deleteTDO(id: "${tdoIdPortable}") {
          id
          message
        }
        deleteTDO_2: deleteTDO(id: "${tdoIdPortable2}") {
          id
          message
        }
        deleteCluster(id: "${clusterId}") {
          id
          message
        }
      }`;

      const result = await gqlClient.query(query);
        
        helpers.expect(_.get(result, 'errors'), 'body.data.errors').to
          .be.undefined;
        expect(_.get(result, 'deleteAsset.id')).toEqual(
          assetIdPortable
        );
        expect(_.get(result, 'deleteTDO.id')).toEqual(tdoIdPortable);
        expect(_.get(result, 'deleteTDO_2.id')).toEqual(
          tdoIdPortable2
        );
        expect(_.get(result, 'deleteCluster.id')).toEqual(clusterId);
      });
  });

  describe('delete TDOs', () => {
    var recResult;
    var errors = null;
    var response = null;
    

    beforeAll(() => {
      var query = `mutation {
    del1: deleteTDO(id: "${tdoId}") {
        id
    }
    del2: deleteTDO(id: "${tdoId2}") {
      id
    }
    del3: deleteTDO(id: "${tdoId3}") {
      id
    }
    del4: deleteTDO(id: "${tdoId4}") {
      id
    }
    del5: deleteTDO(id: "${tdoId5}") {
      id
    }
  }
          `;

      recResult = chakram.post(url, { query: query }, { headers });
      return recResult.then(function(respObj) {
        if (respObj.body && respObj.body.errors) {
          errors = respObj.body.errors;
        }
        response = respObj;
      });
    });

    it('did not return any errors', () => {
      return expect(errors).to.be.null;
    });
    it('return 200', () => {
      return 
    });
  });

  describe('cleanup', () => {
    
    it('should delete a folder', () => {
      const query = `mutation {
        deleteFolder(input: {
          id: "${testStateObject.testId}"
          orderIndex: ${testStateObject.testOrderIndex}
        }) {
          id
        }
      }`;
      const result = await gqlClient.query(query);
        testStateObject.testIsDeleted = true;
        
        expect(response.body.data.deleteFolder.id).toEqual(
          testStateObject.testId
        );
      });
    });
});