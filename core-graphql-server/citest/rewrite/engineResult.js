const _ = require('lodash');
const moment = require('moment');
const helpers = require('../citest/helpers/index');

const config = helpers.config;
const env = config.env;

const testName = 'test_engineResults_' + Date.now();
const authUrl = helpers.authUrl;
const url = helpers.graphqlUrl;
const supertest = require('supertest')(url);

//const tdoFileUploadPath = './citest/videoplayback.mp4';
const engineResultPath = './citest/test_transcript.ttml';
const now = Date.now();
const nowMinus10 = now - 10 * 60 * 1000;
const nowMinus15 = now - 15 * 60 * 1000;
const nowMinus18 = now - 18 * 60 * 1000;
const nowMinus30 = now - 30 * 60 * 1000;


console.log('TestName is: ', testName);

let liveSourceTypeId, deadSourceTypeId, liveSourceId, deadSourceId;
let liveTDO1, liveTDO2, deadTDO1;
let liveTDO1Job, liveTDO1Task, liveTDO2Job, liveTDO2Task, deadTDO1Job, deadTDO1Task;
let liveTDO1Asset, liveTDO2Asset, deadTDO1Asset;
let watchlistId,
  singleTDOMention, // deadTDO1
  multiTDOMention; // liveTDO1 and liveTDO2

// engineId1 test case V2F results
const engineId1 = 'c3497af0-ac1c-421d-8b2e-618797093623'; // Object Detection - AC - V2F

const engineCategoryId1 = '088a31be-9bd6-4628-a6f0-e4004e362ea0';

let mediaStreamerHeader;

describe('authenicate', () => {
  
  it('sign in', done => {
    helpers
      .signin(authUrl)
      .then(({ token, apiToken, userId, organizationId }) => {
        options = helpers.requestOptions(token);
        mediaStreamerHeader = helpers.mediaStreamerHeader(token);
        done();
      })
      .catch(err => done(err));
  });
});

describe('set up test suite', () => {
  // pick a live source type, a non-live source type, and an engine ID
  describe('find source types and transcription engine for test', () => {
    

    it('should get source types and engineId', () => {
      const query = `query {
        liveSourceType: sourceTypes(isLive: true, limit: 1) {
          records {
            id
            name
          }
        }
        deadSourceType: sourceTypes(isLive: false, limit: 1) {
          records {
            id
            name
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  
        liveSourceTypeId = _.get(
          response,
          'body.data.liveSourceType.records[0].id'
        );
        deadSourceTypeId = _.get(
          response,
          'body.data.deadSourceType.records[0].id'
        );
        expect(liveSourceTypeId).toBeDefined();
        expect(deadSourceTypeId).toBeDefined();
      });
    });
  });
  // create live and non-live sources
  describe('create sources', () => {
    
    it('should create new sources', () => {
      const query = `mutation {
        liveSource: createSource(input: {
          sourceTypeId: "${liveSourceTypeId}"
          name: "liveSource-${testName}"
        }) {
          id
        }
        deadSource: createSource(input: {
          sourceTypeId: "${deadSourceTypeId}"
          name: "deadSource-${testName}"
        }) {
          id
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  
        liveSourceId = _.get(result, 'liveSource.id');
        deadSourceId = _.get(result, 'deadSource.id');
        expect(liveSourceId).toBeDefined();
        expect(deadSourceId).toBeDefined();
    });
  });

  describe('create TDOs for test', () => {
    

    it('should create TDOs', () => {
      const query = `mutation {
        liveTDO1: createTDO(input: {
          startDateTime: ${nowMinus30}
          stopDateTime: ${nowMinus15}
          sourceData: {
            sourceId: "${liveSourceId}"
          }
        }) {
          id
          startDateTime
          stopDateTime
        }
        liveTDO2: createTDO(input: {
          startDateTime: ${nowMinus15}
          stopDateTime: ${now}
          sourceData: {
            sourceId: "${liveSourceId}"
          }
        }) {
          id
          startDateTime
          stopDateTime
        }
        deadTDO1: createTDO(input: {
          startDateTime: ${nowMinus30}
          stopDateTime: ${nowMinus15}
          sourceData: {
            sourceId: "${deadSourceId}"
          }
        }) {
          id
          startDateTime
          stopDateTime
        }
      }`;

      const result = await gqlClient.query(query);



        const body = response.body;
        liveTDO1 = _.get(result, 'liveTDO1.id');
        liveTDO2 = _.get(result, 'liveTDO2.id');
        deadTDO1 = _.get(result, 'deadTDO1.id');
        expect(liveTDO1).toBeDefined();
        expect(liveTDO2).toBeDefined();
        expect(deadTDO1).toBeDefined();
      });
  });

  describe('create a job for each TDO target', () => {
    

    it('should create a job per TDO', () => {
      const query = `mutation {
        liveTDO1Job: createJob(input: {
          retries: 1
          targetId: "${liveTDO1}"
          tasks: [{
            testTask: true
            engineId: "${engineId1}"
            payload: {
              target: "it"
            }
          }]
        }) {
          id
          tasks (targetId: "${liveTDO1}") {
            records {
              id
            }
          }
        }
        liveTDO2Job: createJob(input: {
          retries: 1
          targetId: "${liveTDO2}"
          tasks: [{
            testTask: true
            engineId: "${engineId1}"
            payload: {
              target: "it"
            }
          }]
        }) {
          id
          tasks (targetId: "${liveTDO2}") {
            records {
              id
            }
          }
        }
        deadTDO1Job: createJob(input: {
          retries: 1
          targetId: "${deadTDO1}"
          tasks: [{
            testTask: true
            engineId: "${engineId1}"
            payload: {
              target: "it"
            }
          }]
        }) {
          id
          tasks (targetId: "${deadTDO1}") {
            records {
              id
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        const body = response.body;
        if (body && body.data) {
          liveTDO1Job = body.data.liveTDO1Job.id;
          liveTDO2Job = body.data.liveTDO2Job.id;
          deadTDO1Job = body.data.deadTDO1Job.id;
          liveTDO1Task = body.data.liveTDO1Job.tasks.records[0].id;
          liveTDO2Task = body.data.liveTDO2Job.tasks.records[0].id;
          deadTDO1Task = body.data.deadTDO1Job.tasks.records[0].id;
        }
        [
          liveTDO1Job,
          liveTDO2Job,
          deadTDO1Job,
          liveTDO1Task,
          liveTDO2Task,
          deadTDO1Task
        ].forEach(id => expect(id).toBeDefined());
    });

  });

  function createEngineResult(taskId, targetId) {
    const query = `mutation {
      uploadEngineResult(input: {
        taskId: "${taskId}"
        assetType: "transcript"
        contentType: "application/ttml"
        completeTask: true
        setAsPrimary: true
      }) {
        id
        containerId
      }
    }`;

    let response, assetId, tdoId;
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', 'test_transcript.ttml')
      .attach('file', engineResultPath)
      .then(res => {
        response = res;
        // console.log(JSON.stringify(res.body, null, 2));
        expect(response.status).toEqual(200);
       
  

        assetId = _.get(result, 'uploadEngineResult.id');
        expect(assetId).toBeDefined();

        tdoId = _.get(result, 'uploadEngineResult.containerId');
        expect(tdoId).toBeDefined();
        expect(tdoId).toEqual(targetId);
        return { assetId, tdoId };
      });
  }
  function createEngineResultAsset(taskId, tdoId, engineId, filename) {
    const query = `mutation {
      createAsset(input: {
        containerId: "${tdoId}"
        contentType: "application/json"
        assetType: "vtn-standard"
        sourceData: {
          engineId: "${engineId}"
          taskId: "${taskId}"
        }
      }) {
        id
        uri
        transform(transformFunction: JSON)
      }
    }`;

    let response, assetId, assetUrl;
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', filename)
      .attach('file', `./citest/${filename}`)
      .then(res => {
        response = res;
        // console.log(JSON.stringify(res.body, null, 2));
        expect(response.status).toEqual(200);
       
  

        assetId = _.get(result, 'createAsset.id');
        expect(assetId).toBeDefined();

        assetUrl = _.get(result, 'createAsset.uri');
        expect(assetUrl).toBeDefined();
        return { assetId, assetUrl };
      });
  }

  function createUserEditedEngineResult(taskId, tdoId, engineId) {
    const query = `
mutation {
  userEditedAsset: createAsset(input: {
    containerId: "${tdoId}"
    contentType: "application/json"
    assetType: "vtn-standard"
    sourceData: {
      engineId: "${engineId}"
      taskId: "${taskId}"
    }
    isUserEdited: true
  }) {
    id
  }
}`;

    result = supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', 'engine_result1.json')
      .attach('file', './citest/engine_result1.json')
      .expect(200);

    return result.then(response => {
      // console.log(JSON.stringify(response.body, null, 2));
     

      let userEditedAssetId = _.get(result, 'userEditedAsset.id');
      expect(userEditedAssetId).toBeDefined();
      return { userEditedAssetId };
    });
  }

  describe('create results engine results', () => {
    

    it('should create engine result asset', async () => {
      let response = await createEngineResultAsset(
        liveTDO1Task,
        liveTDO1,
        engineId1,
        'engine_result1.json'
      );
      liveTDO1Asset = response.assetId;

      response = await createEngineResultAsset(
        liveTDO2Task,
        liveTDO2,
        engineId1,
        'engine_result1.json'
      );
      liveTDO2Asset = response.assetId;
    });

    it('should create user-edited engine result asset', async () => {
      let response = await createUserEditedEngineResult(
        deadTDO1Task,
        deadTDO1,
        engineId1
      );
      deadTDO1Asset = response.userEditedAssetId;
    });

    it('should update engine result with task output', async () => {});
  });

  // describe('create transcription engine results', function() {
  //   

  //   it('should add asset to TDO', async () => {
  //     let response = await createEngineResult(liveTDO1Task, liveTDO1);
  //     liveTDO1Asset = response.assetId;

  //     response = await createEngineResult(liveTDO2Task, liveTDO2);
  //     liveTDO2Asset = response.assetId;

  //     response = await createEngineResult(deadTDO1Task, deadTDO1);
  //     deadTDO1Asset = response.assetId;
  //   });
  // });

  describe('create watchlist for test', () => {
    

    it('should create a watchlist with both sources', () => {
      const nextMonth = moment
        .utc()
        .add(30, 'days')
        .toISOString();
      const query = `mutation {
        createWatchlist (input: {
          stopDateTime: "${nextMonth}"
          name: "${testName}"
          sourceTypeIds: [1, 2, 3, 4, 5]
          cognitiveSearches: [{
            mentionStatusId: 1,
            profile: {
              and: [{
                state: {
                  search: "football",
                  language: "en",
                  advancedOptions: {}
                },
                engineCategoryId: "${engineCategoryId1}"
              }]
            }
          }]
        }) {
          id
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        watchlistId = _.get(result, 'createWatchlist.id');
        expect(watchlistId).toBeDefined();
    });
  });

  describe('create mentions for test', () => {
    

    it('should create mentions', () => {
      console.log(
        `Multi Mention: { start: ${moment(
          nowMinus30
        ).toISOString()}, end: ${moment(nowMinus10).toISOString()}`
      );
      const query = `mutation {
        singleTDOMention: createMention(input: {
          mediaId: "${deadTDO1}"
          programId: 25451
          watchlistId: "${watchlistId}"
          mentionDateTime: "${moment(nowMinus18).toISOString()}"
          mentionEndDateTime: "${moment(nowMinus15).toISOString()}"
          mentionHitCount: 1
          snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":390.179,\\"text\\":\\" $25 $21 $free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
          cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
        }) {
          id
          mediaId
          mentionDate
          endDateTime
          hitStartDateTime
          hitEndDateTime
        }
        multiTDOMention: createMention(input: {
          mediaId: "${liveTDO2}"
          programId: 25451
          watchlistId: "${watchlistId}"
          mentionDateTime: "${moment(nowMinus30).toISOString()}"
          mentionEndDateTime: "${moment(now).toISOString()}"
          mentionHitCount: 1
          snippetsString: "[{\\"startTime\\":334.179,\\"endTime\\":1400.179,\\"text\\":\\" $25 $21 $free minutes from the airport polo is what's happening on the people station at the one o three keep the lights if you want to a story for your chance to win lunch for you in the office crew courtesy of Wendy's listen to the remote Abro show for your chance to score a lunchtime treat try Wendy's new chicken tenders and a side of saw some sauce try them together with fries in a drink for just five bucks that's what's on the people station feedlot overy joint. This Friday brief restaurant. Six years. My business will be here for you WANT to the national highway never recovered a little piece of the things we'd all do for lunch to leave for a solicitation to break my leg braces like that she will duck on Friday night but you will see one of these bricks three. Way. You want to be graced\\"}]",
          cognitiveEngineResultsString: "{\\"stationPlayout\\":{\\"documentCommon\\":{\\"station\\":\\"WVEE\\",\\"stationBand\\":\\"FM \\",\\"stationHeadline\\":\\"V-103\\",\\"publicStationId\\":17992},\\"series\\":[{\\"start\\":335000,\\"end\\":359000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":24000,\\"spotType\\":30000,\\"ufId\\":\\"A00084227447\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"V103-WENDYS ON AIR\\",\\"advertiser\\":\\"WH-WENDYS\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749435e+09,\\"absoluteEnd\\":1.509749459e+09},{\\"start\\":359000,\\"end\\":390000,\\"_is_query_hit_\\":true,\\"nextRadioEventType\\":\\"campaign\\",\\"duration\\":41000,\\"spotType\\":30000,\\"ufId\\":\\"P00068567344\\",\\"adHeadline\\":\\"\\",\\"adText\\":\\"N/A\\",\\"advertiser\\":\\"WRAITH\\",\\"songArtist\\":\\"\\",\\"songTitle\\":\\"\\",\\"songAlbum\\":\\"\\",\\"absoluteStart\\":1.509749459e+09,\\"absoluteEnd\\":1.5097495e+09}]}}"
        }) {
          id
          mediaId
          mentionDate
          endDateTime
          hitStartDateTime
          hitEndDateTime
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        singleTDOMention = _.get(result, 'singleTDOMention.id');
        expect(singleTDOMention).toBeDefined();
        expect(_.get(result, 'singleTDOMention.mediaId')).toEqual(
          deadTDO1
        );

        multiTDOMention = _.get(result, 'multiTDOMention.id');
        expect(multiTDOMention).toBeDefined();
        expect(_.get(result, 'multiTDOMention.mediaId')).toEqual(
          liveTDO2
        );
    });
});

function verifyEngineResults(engineResults, count) {
  expect(engineResults).toBeDefined();
  expect(engineResults.records).toBeDefined();
  expect(engineResults.records.length).toEqual(count);
}

function verifyTDOAndAsset(engineResults, tdoId, assetId) {
  const found = engineResults.records.find(tdo => tdo.tdoId === tdoId);
  expect(found).toBeDefined();
  expect(found.jsondata).toBeDefined();
  expect(found.tdo).toBeDefined();
  expect(found.tdo.id).toEqual(tdoId);
  expect(found.tdo.assets).toBeDefined();
  expect(found.tdo.assets.records[0].id).toEqual(assetId);
}

describe('run engine results tests', () => {
  describe('get engine results by live source with a time window', () => {
    
    const startOffsetMs = 1000;
    const stopOffsetMs = 2000;
    it('should return the correct startOffsetMs stopOffsetMs', () => {
      const query = `query {
        engineResults (
          tdoId: "${liveTDO1}"
          sourceId: "${liveSourceId}"
          startOffsetMs: ${startOffsetMs}
          stopOffsetMs: ${stopOffsetMs}
        ) {
          records {
            tdoId
            jsondata
            startOffsetMs
            stopOffsetMs
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
        expect(engineResults.records[0].startOffsetMs).toEqual(startOffsetMs);
        expect(engineResults.records[0].stopOffsetMs).toEqual(stopOffsetMs);
      });
    });
  });

  describe('get engine results by TDO with engine category', () => {
    
    it('should return by TDO with engine category  ', () => {
      const query = `query {
          engineResults (
            tdoId: "${liveTDO1}",
            engineCategoryIds: ["${engineCategoryId1}"]
            engineIds: ["${engineId1}"]
          ) {
            records {
              tdoId
              jsondata
              tdo {
                id
                assets {
                  records {
                    id
                  }
                }
              }
            }
          }
        }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
    });
  });

  describe('get engine results by TDO with multiple engines', () => {
    
    it(
      'should return the correct tdo - by TDO with multiple engines',
      () => {
        const query = `query {
          engineResults (
            tdoId: "${liveTDO1}"
            engineIds: ["${engineId1}"]
          ) {
            records {
              tdoId
              jsondata
              tdo {
                id
                assets {
                  records {
                    id
                  }
                }
              }
            }
          }
        }`;

        const result = await gqlClient.query(query);
          
         
    

          const engineResults = _.get(result, 'engineResults');
          verifyEngineResults(engineResults, 1);
          verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
        });
  });

  describe('get engine results by jobId', () => {
    

    it('should return the correct asset and tdo', () => {
      const query = `query {
        engineResults (
          jobId: "${liveTDO1Job}"
        ) {
          records {
            tdoId
            jsondata
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
      });
  });

  describe('get engine results by most recent job', () => {
    
    it('should return most recent job ', () => {
      const query = `query {
        engineResults (
          tdoId: "${liveTDO1}"
        ) {
          records {
            tdoId
            jsondata
            tdo {
              id
              jobs {
                records {
                  id
                }
              }
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;
      const result = await gqlClient.query(query);
        
       
  
        const engineResults = _.get(result, 'engineResults');
        const jobs = _.get(engineResults, 'records[0].tdo.jobs');
        expect(jobs.records[0].id).toEqual(liveTDO1Job);
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
      });
  });

  describe('get engine results by mention', () => {
    
    // - by mention, live source (no fallback TDO)
    // - by mention, non-live source
    it('should get results by mention', () => {
      const query = `query {
        singleTDOMention: engineResults(
          mentionId: "${singleTDOMention}"
          engineIds: ["${engineId1}"]
          sourceId: "${deadSourceId}"
        ) {
          records {
            tdoId
            jsondata
            engineId
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
        multiTDOMention: engineResults(
          mentionId: "${multiTDOMention}"
          engineIds: ["${engineId1}"]
          sourceId: "${liveSourceId}"
        ) {
          records {
            tdoId
            jsondata
            engineId
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;
      const result = await gqlClient.query(query);
        
       
  

        // by mention, non-live source
        const deadMentionResults = _.get(
          response,
          'body.data.singleTDOMention'
        );
        expect(deadMentionResults).toBeDefined();

        // verify two consecutive TDOs were returned
        const liveMentionResults = _.get(result, 'multiTDOMention');
        expect(liveMentionResults).toBeDefined();
      });
  });

  describe('get engine results by non-live source with fallback TDO', () => {
    
    it('should return engine results with fallback TDO', () => {
      const query = `query {
        engineResults (
          fallbackTdoId: "${deadTDO1}"
          engineIds: ["${engineId1}", ""]
        ) {
          records {
            tdoId
            jsondata
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, deadTDO1, deadTDO1Asset);
      });
  });

  describe('get engine results with and without ignoreUserEdited = true', () => {
    

    it('should return without ignoreUserEdited = true', () => {
      const query = `query {
        engineResults (
          ignoreUserEdited: false,
          tdoId: "${deadTDO1}",
          engineCategoryIds: ["${engineCategoryId1}"]
        ) {
          records {
            userEdited
            tdoId
            jsondata
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 1);
        verifyTDOAndAsset(engineResults, deadTDO1, deadTDO1Asset);
        //verify user edited - the data must have user-edited engine results
        expect(_.get(engineResults, 'records[0].userEdited')).to.be.true;
    });
    it('should ignoreUserEdited = true', () => {
      const query = `query {
        engineResults (
          ignoreUserEdited: true,
          tdoId: "${deadTDO1}",
          engineCategoryIds: ["${engineCategoryId1}"]
        ) {
          records {
            userEdited
            tdoId
            jsondata
            tdo {
              id
              assets {
                records {
                  id
                }
              }
            }
          }
        }
      }`;

      const result = await gqlClient.query(query);
        
       
  

        const engineResults = _.get(result, 'engineResults');
        verifyEngineResults(engineResults, 0);
        // verifyTDOAndAsset(engineResults, liveTDO1, liveTDO1Asset);
      });
  });

});

describe('test media-streamer endpoint', () => {
  it('should hit media-streamer download endpoint', () => {
    return Promise.all([
      helpers.testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        liveTDO1,
        mediaStreamerHeader
      ),
      helpers.testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        liveTDO2,
        mediaStreamerHeader
      ),
      helpers.testMediaStreamerDownload(
        helpers.mediaStreamerUrl,
        deadTDO1,
        mediaStreamerHeader
      )
    ])
      .then(response => {
        // all TDO didn't have a media/init asset
        for (var i = 0; i < response.length; i++) {
          expect(response[i]).to.have.status(404);
          expect(response[i].body.error).toEqual(
            'No files found with requested ID'
          );
        }
      })
      .catch(err => {
        helpers.expect(err, 'err').to.be.undefined;
      });
  });

  it('should hit media-streamer streams endpoint', () => {
    return Promise.all([
      helpers.testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        liveTDO1,
        'dash.mpd'
      ),
      helpers.testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        liveTDO2,
        'dash.mpd'
      ),
      helpers.testMediaStreamerStreams(
        helpers.mediaStreamerUrl,
        mediaStreamerHeader,
        deadTDO1,
        'dash.mpd'
      )
    ])
      .then(response => {
        // all TDO doesn't support stream protocol
        for (var i = 0; i < response.length; i++) {
          expect(response[i]).to.have.status(422);
          expect(response[i].body.error).toEqual(
            'TDO does not support requested stream protocol'
          );
        }
      })
      .catch(err => {
        helpers.expect(err, 'err').to.be.undefined;
      });
  });
});

describe('delete artifacts created during test', () => {
  

  // delete watchlist
  it('should delete watchlists', () => {
    const query = `mutation {
      deleteWatchlist(id: "${watchlistId}") { id }
    }`;
    const result = await gqlClient.query(query);
  });

  // cancel jobs
  // Skipped because it needs Edge to move jobs' tasks to be in proper states to be cancelled.
  // See https://github.com/veritone/core-job-server/blob/76ed71f02dd418a5ee97b133e3ea2c231eb8941e/src/bll/job.js#L130
  xit('should cancel jobs', function() {
    const query = `mutation {
      liveTDO1: cancelJob(id: "${liveTDO1Job}") { id }
      liveTDO2: cancelJob(id: "${liveTDO2Job}") { id }
      deadTDO1: cancelJob(id: "${deadTDO1Job}") { id }
    }`;

    const result = await gqlClient.query(query);
  });

  // delete TDOs
  it('should delete TDOs', () => {
    const query = `mutation {
      liveTDO1: deleteTDO(id: "${liveTDO1}") { id }
      liveTDO2: deleteTDO(id: "${liveTDO2}") { id }
      deadTDO1: deleteTDO(id: "${deadTDO1}") { id }
    }`;
    const result = await gqlClient.query(query);
  });

  // delete sources
  it('should delete sources', () => {
    const query = `mutation {
      liveSource: deleteSource(id: "${liveSourceId}") { id }
      deadSource: deleteSource(id: "${deadSourceId}") { id }
    }`;

    const result = await gqlClient.query(query);
  });
});
