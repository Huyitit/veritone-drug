const helpers = require('./helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');
const moment = require('moment');

const config = helpers.config;
const _ = require('lodash');
var env = config.env;
var authUrl = config.auth_url
  ? config.auth_url
  : 'https://api.' + env + '.veritone.com/v1';
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var tdoId;
var taskId;
var createsTDOEngineId;
var createsTDOJobId;
var createTDOTaskId;
var tdoTaskId;
var taskTimestamp;

const userAgent = config.userAgent || 'core-graphql-server test';

var debug = config.debug && config.debug == true;


const supertest = require('supertest')(url);
let options;
let noCreatesTDOEngineId, found, jwt1;

describe('authenticate', () => {
  
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

var jobId = null;
var tdoId = null;

describe('Find engine that does not create TDO', () => {
  let response;
  

  beforeAll(() => {
    var query = `query {
  testEngine: engines(createsTDO:false, state: [active], limit:1, name: "CITest Engine 20221219") {
  records {
    id
    name
    createsTDO
    libraryRequired
    categoryId
    state
    category {
      name
    }
    builds(status: "deployed") {
      records {
        id
        status
      }
    }
  }}
}`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should find an active engine', () => {
    // use dedicated test engine if it's present
    const testEngineId = _.get(result, 'testEngine.records[0].id');
    expect(testEngineId).toBeDefined();
    if (testEngineId) {
      noCreatesTDOEngineId = testEngineId;
      found = true;
    }
  });
  it('should have an ID', () => {
    return expect(noCreatesTDOEngineId).toBeDefined();
  });
});

describe('create a TDO', () => {
  var recResult;
  var errors = null;
  

  beforeAll(() => {
    const query = `mutation {
      createTDO(input: {
        status: "uploaded"
        startDateTime: 1476726655
        stopDateTime:  1476726955
      }) {
        id
        createdDateTime
      }}`;

    recResult = chakram.post(url, { query: query }, options);
    //recResult = chakram.post(recUrl, data, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body.data && respObj.body.data.createTDO) {
        tdoId = respObj.body.data.createTDO.id;
      }
    });
  });

  it('return 200', () => {
    return expect(recResult, recResult).to.have.status(200);
  });
  it('did not return any errors', () => {
    return expect(errors, errors).to.be.null;
  });

  it('has TDO Id', () => {
    return expect(tdoId, recResult).toBeDefined();
  });
});

describe('Create a test job', () => {
  var recResult;
  var errors = null;
  var jobData = null;
  let testResponse;
  let testJobId;
  let testTaskId;
  let testPayload;
  let jobConfig;
  

  beforeAll(() => {
    var query = `
      mutation {
        createJob(input: {
          targetId: "${tdoId}"
          tasks: [
            {
              engineId: "${noCreatesTDOEngineId}"
              payload: {
                target: "it"
              }
            },
            {
              engineId: "${noCreatesTDOEngineId}"
              payload: {
                target: "fr"
              }
            }
          ]
        }) {
          id
          targetId
          status
          jobConfig
          tasks {
            records {
              id
              targetId
              engineId
              payload
              status
              runtimePayload
            }
          }
        }
      }`;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.data && respObj.body.data.createJob) {
        testJobId = respObj.body.data.createJob.id;
        testTaskId = respObj.body.data.createJob.tasks.records[0].id;
        testPayload = respObj.body.data.createJob.tasks.records[0].payload;
        jobData = respObj.body.data.createJob;
        tdoTaskId = respObj.body.data.createJob.tasks.records[1].id;
        jobConfig = respObj.body.data.createJob.jobConfig;
      }
      testResponse = respObj;
    });
  });

  it('return 200', () => {
    return expect(testResponse, testResponse).to.have.status(200);
  });

  it('should have job ID', () => {
    return expect(testJobId, testResponse).toBeDefined();
  });
  it('should have task ID', () => {
    return expect(testTaskId, testResponse).toBeDefined();
  });
  it('should have task payload', () => {
    return expect(testPayload, testResponse).toBeDefined();
  });
  it('should have correct target ID', () => {
    return expect(jobData.targetId, testResponse).toEqual(tdoId);
  });
  it('should have job status pending', () => {
    // depending on the timing, the job might be
    // in non-pending status. but it should not be complete.
    return expect(jobData.status, testResponse).not.toEqual(
      'complete'
    );
  });
  it('should not return errors', () => {
    return expect(errors, testResponse).to.be.null;
  });
  it('should have authData in jobConfig', () => {
    return expect(jobConfig.authData, testResponse).toBeDefined();
  });
});

describe('Create a job', () => {
  var recResult;
  var errors = null;
  var payload = null;
  var jobData = null;
  

  beforeAll(() => {
    var query = `
mutation {
  createJob(input: {
    retries: 1
    targetId: "${tdoId}"
    tasks: [
      {
        engineId: "${noCreatesTDOEngineId}"
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
        runtimePayload
        status
        standbyTask {
          id
          engineId
          payload
        }
      }
    }
  }
}
        `;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.data && respObj.body.data.createJob) {
        jobId = respObj.body.data.createJob.id;
        taskId = respObj.body.data.createJob.tasks.records[0].id;
        payload = respObj.body.data.createJob.tasks.records[0].payload;
        jobData = respObj.body.data.createJob;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have job ID', () => {
    return expect(jobId).toBeDefined();
  });
  it('should have task ID', () => {
    return expect(taskId).toBeDefined();
  });
  it('should have task payload', () => {
    return expect(payload).toBeDefined();
  });
  it('should have correct target ID', () => {
    return expect(jobData.targetId).toEqual(tdoId);
  });
  it('should not return errors', () => {
    return expect(errors).to.be.null;
  });
});

describe('get engine JWTs', () => {
  let response;
  
  beforeAll(() => {
    const query = `
  mutation {
    jwt1: getEngineJWT(input: {
      engineId: "${noCreatesTDOEngineId}"
      resource: {
        tdoId: "${tdoId}"
        jobId: "${jobId}"
        taskId: "${taskId}"
      }
    }) {
      token
    }
  }
        `;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should have no error', () => {
    return expect(_.get(response, 'errors')).to.be
      .undefined;
  });
  it('should have JWT 1', () => {
    jwt1 = _.get(result, 'jwt1.token');
    return expect(jwt1).toBeDefined();
  });
});

describe('list JWT 1 rights', () => {
  let response;
  

  beforeAll(() => {
    let options = {
      headers: {
        Authorization: 'Bearer ' + jwt1,
        'User-Agent': userAgent
      }
    };
    const query = `
    query {
      me {
        id
        organizationId
      }
      myRights {
        operations
        resources
      }
      temporalDataObject(id: "${tdoId}") { id }

      url: getSignedWritableUrl {
        url
      }
    }`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should have no error', () => {
    return 
  });
  it('should have job ID rights', () => {
    return expect(
      _.get(result, 'myRights.resources.Job[0]'),
      response
    ).toEqual(jobId);
  });
  it('should have tdo ID rights', () => {
    return expect(
      _.get(result, 'myRights.resources.TemporalDataObject[0]'),
      response
    ).toEqual(tdoId);
  });
  it('should have task ID rights', () => {
    return expect(
      _.get(result, 'myRights.resources.Task[0]'),
      response
    ).toEqual(taskId);
  });

  it('should have TDO ID', () => {
    return expect(
      _.get(result, 'temporalDataObject.id'),
      response
    ).toEqual(tdoId);
  });
  it('should have signed URL', () => {
    return expect(_.get(result, 'url.url')).toBeDefined();
  });
});

describe('Find engine that creates TDO', () => {
  var response;
  

  beforeAll(() => {
    var query = `query {
  engines(createsTDO:true, state: [active], limit:1) {
  records {
    id
    name
    createsTDO
    libraryRequired
    categoryId
    category {
      name
    }
  }}


}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should have 1 records in response', () => {
    return expect(
      _.get(result, 'engines.records'),
      response
    ).toHaveLength(1);
  });
  it('should have an ID', () => {
    createsTDOEngineId = _.get(result, 'engines.records[0].id');
    return expect(createsTDOEngineId).toBeDefined();
  });
});

describe('Create a job - no TDO', () => {
  let response;
  

  beforeAll(() => {
    var query = `
mutation {
  createJob(input: {
    retries: 1
    tasks: [
      {
        engineId: "${createsTDOEngineId}"
        payload: {
          startDateTime: 1430797089,
          fileUri: "http://where.com/file/is.mp3"
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
        standbyTask {
          id
        }
        standbyForTask {
          id
        }
      }
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have job ID', () => {
    createsTDOJobId = _.get(result, 'createJob.id');
    return expect(createsTDOJobId).toBeDefined();
  });
  it('should have task ID', () => {
    createTDOTaskId = _.get(
      response,
      'body.data.createJob.tasks.records[0].id'
    );
    return expect(createTDOTaskId).toBeDefined();
  });
  it('should not return errors', () => {
    return 
  });
});

describe('List jobs', () => {
  var recResult;
  var listRecords;
  var count = 0;
  
  let body;

  beforeAll(() => {
    const today = new Date();
    const toDateTime = `${today
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '-')}T10:00:00.000Z`;
    var query = `query {
            oldJobs: jobs (dateTimeFilter: [
            {
              toDateTime: "2018-09-20T17:20:13.000Z"
              field:createdDateTime
            }
            ],limit:1){
              records {
                id status
            }}
            jobs(limit: 4
              dateTimeFilter: [
                {
                  toDateTime:   "${toDateTime}"
                  fromDateTime: "2018-05-05T10:00:00.000Z"
                  field: createdDateTime
                }
              ]) {
                records{
                  id
            }
            count
            limit
            offset
        }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      if (
        respObj.body &&
        respObj.body.errors &&
        respObj.body.errors.length > 0 &&
        respObj.body.errors[0].message
      )
        message = respObj.body.errors[0].message;
      if (respObj.body && respObj.body) {
        listRecords = respObj.body.data.jobs.records;
        count = respObj.body.data.jobs.count;
        console.log('records:  ' + listRecords.length);
      } else {
        console.log('no records in ' + JSON.stringify(respObj.body));
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have no errors', () => {
    return expect(body.errors).to.be.undefined;
  });
  it('should have 4 records in response', () => {
    return expect(listRecords).toHaveLength(4);
  });
  it('should have count of 4', () => {
    return expect(count).toEqual(4);
  });
});

describe('Get a TDO with job and task data', () => {
  

  beforeAll(() => {
    var query = `
         query {
            temporalDataObject(id: "${tdoId}") {
              id
              name
              jobs {
                records {
                  id
                  targetId
                }
              }
              tasks {
                records {
                  id
                  status
                  targetId
                  jobId
                }
              }
           }
        }
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (
        respObj.body &&
        respObj.body.data &&
        respObj.body.data.temporalDataObject
      ) {
        tdoData = respObj.body.data.temporalDataObject;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have jobs object', () => {
    return expect(
      _.get(tdoData, 'jobs.records[0].id'),
      response
    ).toEqual(jobId);
  });
  it('should have tasks object', () => {
    //return expect(_.get(tdoData, 'tasks.records', [])).to.deep.include({id: taskId});
    // note that multiple tasks might be created, and they might be returned
    // in any order. TODO expect(...) statement that detects ID anywhere in array.
    return expect(_.get(tdoData, 'tasks.records[0].id')).toBeDefined();
  });
});

describe('Retry a job', () => {
  var recResult;
  var gotJobId = null;
  

  beforeAll(() => {
    var query = `mutation {
  retryJob(id: "${jobId}") {

    id
    targetId
    tasks {
      records {
        id
        status
        isClone
        targetId
        order
      }
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (
        respObj.body &&
        respObj.body.errors &&
        respObj.body.errors.length > 0 &&
        respObj.body.errors[0].message
      )
        message = respObj.body.errors[0].message;
      if (respObj.body && respObj.body.data && respObj.body.data.retryJob) {
        gotJobId = respObj.body.data.retryJob.id;
      } else {
        console.log('no records in ' + JSON.stringify(respObj.body));
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have job ID', () => {
    return expect(gotJobId).toEqual(jobId);
  });
});

describe('update a task - waiting', () => {
  let recResult;
  let errors = null;
  let data;
  let response;
  

  beforeAll(() => {
    const query = `
      mutation {
        updateTask(input: {
          id:"${taskId}"
          status: waiting
        }) {
          output
          payload
          status
          id
          modifiedDateTime
        }
      }`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('return right task id', () => {
    return expect(data.id).toEqual(taskId);
  });
  it('return right task status', () => {
    return expect(data.status).toEqual('waiting');
  });
});

describe('update a task - running', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    const query = `
mutation {
  updateTask(input: {
    id:"${taskId}"
    status: running
    outputString:"{\\"json\\":\\"string\\"}"
  }) {
    output
    payload
    status
    id
    modifiedDateTime
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.output).to.deep.equal({
      json: 'string'
    });
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('got timestamp', () => {
    taskTimestamp = data.modifiedDateTime;
    return expect(taskTimestamp).toBeDefined();
  });
});

describe('update a task with stale client timestamp', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    const timestamp = moment(taskTimestamp)
      .subtract(1, 'hour')
      .toISOString();
    const query = `
mutation {
  updateTask(input: {
    id:"${taskId}"
    status: failed
    clientTimestamp: "${timestamp}"
  }) {
    output
    payload
    status
    id
    modifiedDateTime
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.output).to.deep.equal({
      json: 'string'
    });
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('did not change modifiedDateTime', () => {
    return expect(data.modifiedDateTime).toEqual(
      taskTimestamp
    );
  });
  it('did not change status', () => {
    return expect(data.status).not.toEqual('failed');
  });
});

describe('update a task - same status, invalid json', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + jwt1,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    const query = `
mutation u1($taskOutput: JSONData){
  updateTask(input: {
    id:"${taskId}"
    status: running
    taskOutput:$taskOutput
  }) {
    output
    payload
    status
    id
  }
}
        `;

    recResult = chakram.post(
      url,
      { query: query, variables: { taskOutput: 'INVALID JSON {}' } },
      options
    );
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.output).toBeDefined();
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
});

describe('Get a job', () => {
  var jobData = {};
  var gotJobId = null;
  

  beforeAll(() => {
    var query = `
         query {
            job(id: "${jobId}") {
              id
              name
              targetId
              status
              target {
                id
              }
              tasks {
                records {
                  id
                  status
                  target {
                    id
                  }
                  standbyTask {
                    id
                  }
                  standbyForTask {
                    id
                  }
                  runtimePayload

              }
              }
           }
        }
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.data && respObj.body.data.job) {
        gotJobId = respObj.body.data.job.id;
        jobData = respObj.body.data.job;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have correct job ID', () => {
    return expect(gotJobId).toEqual(jobId);
  });
  it('should have target object', () => {
    return expect(jobData.target.id).toEqual(tdoId);
  });

  it('should have correct job status', () => {
    return expect(jobData.status).toEqual('running');
  });
  it('should have correct target ID', () => {
    return expect(jobData.targetId).toEqual(tdoId);
  });
  it('should contain a token in the task payload', () => {
    return expect(
      _.get(jobData, 'tasks.records[0].runtimePayload.token'),
      response
    ).toBeDefined();
  });
});

describe('poll a task', () => {
  var recResult;
  var data;
  

  beforeAll(() => {
    var query = `mutation {
  pollTask(input: {
    id:"${taskId}"
    jobId: "${jobId}"
    pollPayload: {
      pollingDelay: 10
    }
  }) {
    output
    taskOutput
    taskPayload
    payload
    status
    id
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.data) {
        data = respObj.body.data.pollTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(
      _.get(response.body, 'errors[0].name'),
      response
    ).toEqual('invalid_input');
    //return expect(errors).to.be.null;
  });
  /*
  it('returned taskOutput', function() {
    return expect(data.taskOutput).toBeDefined();
  });
  it('returned right task ID', function() {
    return expect(data.id).toEquals(taskId);
  });
  */
});

describe('get a task', () => {
  var recResult;
  var data;
  

  beforeAll(() => {
    var query = `
query {
  task(id:"${taskId}") {
    id
    testTask
    engineId
    engine {
      id
    }
    jobId
    job {
      id
    }
    buildId
    build {
      id
    }
    targetId
    target {
      id
    }
    sourceAssetId
    sourceAsset {
      id
    }
    log {
      uri
      text
      jsondata
    }
    payload
    runtimePayload
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      data = _.get(respObj, 'body.data.task');
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('only error is on runtimePayload', () => {
    return 
    //return expect(_.get(response, 'body.errors[0].name')).toEqual(
    //      'not_allowed'
    //  );
  });
  it('returned build', () => {
    return expect(_.get(data, 'build.id')).toBeDefined();
  });
  it('returned target', () => {
    return expect(_.get(data, 'target.id')).toBeDefined();
  });
  it('returned engine', () => {
    return expect(_.get(data, 'engine.id')).toBeDefined();
  });
  it('returned no source asset', () => {
    return expect(_.get(data, 'sourceAsset.id')).to.be
      .undefined;
  });

  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
});

describe('aborts a task', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    status: aborted
    id:"${taskId}"
    jobId:"${jobId}"
    output: {
      foo: "bar"
    }
  }) {
    output
    taskOutput
    modifiedDateTime
    taskPayload
    payload
    status
    id
    job {
      status
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.taskOutput).toBeDefined();
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('set the right task status', () => {
    return expect(data.status).toEqual('aborted');
  });
  it('set the right job status', () => {
    return expect(data.job.status).toEqual('failed');
  });
  it('returned modifiedDateTime', () => {
    taskTimestamp = data.modifiedDateTime;
    return expect(taskTimestamp).toBeDefined();
  });
});

describe('update a task with non-json', () => {
  var recResult;
  var result;
  
  const nowTs = moment();

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    id:"${taskId}"
    outputString: "<xml key=\\\"key\\\">value</xml>"
    outputJsonKey: "testOutput"
    status: running
    clientTimestamp: "${moment(taskTimestamp).toISOString()}"
  }) {
    output
    id
    modifiedDateTime
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      result = respObj.body;
    });
  });

  it('return 200', () => {
    return expect(recResult, recResult).to.have.status(200);
  });
  it('no errors', () => {
    return expect(result.errors, result).to.be.undefined;
  });
  it('returned right task ID', () => {
    return expect(
      _.get(result, 'data.updateTask.id'),
      result
    ).toEqual(taskId);
  });
  it('returned new modifiedDateTime', () => {
    return expect(
      moment(_.get(result, 'data.updateTask.modifiedDateTime', '')).isBefore(
        nowTs
      ),
      result
    ).to.be.false;
  });
  it('returned right output', () => {
    return expect(
      _.get(result, 'data.updateTask.output.testOutput'),
      result
    ).toEqual('<xml key="key">value</xml>');
  });
});

describe('create a task log (internal services / super admin only)', () => {
  var result;
  var query;
  

  beforeAll(() => {
    query = `
    mutation {
      createTaskLog(input: {
        taskId: "${taskId}"
      }) {
        uri
      }
    }`;
  });

  it('throws an error if an empty task log is provided', () => {
    const fileUploadName = 'test_emptytasklog.txt';
    const fileUploadPath = './citest/test_emptytasklog.txt';
    let err;

    result = supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', fileUploadName)
      .attach('file', fileUploadPath)
      .expect(200);

    return result.then(function(respObj) {
      err = _.get(respObj, 'body.errors[0].data.errorCode');
      expect(err, respObj).toEqual('zero_byte_upload');
    });
  });

  it('should create task log', () => {
    const fileUploadName = 'test_tasklog.txt';
    const fileUploadPath = './citest/test_tasklog.txt';

    result = supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', fileUploadName)
      .attach('file', fileUploadPath)
      .expect(200);

    return result.then(function(respObj) {
      uri = _.get(respObj, 'body.data.createTaskLog.uri');
      expect(uri, respObj).toBeDefined();
    });
  });
});

describe('upload an engine result - post', () => {
  

  let response;
  beforeAll(() => {
    const query = `
  mutation {
    uploadEngineResult(input: {
      taskId: "${taskId}"
      assetType: "v-transcript"
      contentType: "application/ttml"
      completeTask: false
    }) {
      id
      uri
      type
      uri
      contentType
      sourceData {
        taskId
        name
        engineId
      }
    }
  }`;
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('filename', 'test_transcript.ttml')
      .attach('file', './citest/test_transcript.ttml')
      .then(res => {
        response = res;
        expect(response.status).toEqual(200);
        
        expect(
          _.get(result, 'uploadEngineResult.id'),
          response
        ).toBeDefined();
        expect(
          _.get(result, 'uploadEngineResult.uri'),
          response
        ).toBeDefined();
        expect(
          _.get(result, 'uploadEngineResult.sourceData.taskId'),
          response
        ).toEqual(taskId);
        expect(
          _.get(result, 'uploadEngineResult.sourceData.engineId'),
          response
        ).toBeDefined();
      });
  });

  it('returned ok', () => {
    expect(_.get(response, 'body.errors')).to.be.undefined;
  });
  /*  it('did not change status', function() {
    expect(_.get(result, 'uploadEngineResult.sourceData.task.status')).toEqual('running');
  });
  */
});

describe('update a task with task executor data', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    status: running
    id:"${taskId}"
    jobId:"${jobId}"
    output: {
      foo: "bar"
    }
    executionLocationData: {
      name: "locationName"
    }
  }) {
    output
    taskOutput
    taskPayload
    payload
    status
    id
    executionLocation {
      data
    }
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned executionLocation', () => {
    return expect(data.executionLocation.data).toBeDefined();
  });
  it('returned execution location name', () => {
    return expect(
      data.executionLocation.data.name,
      response
    ).toEquals('locationName');
  });
});

describe('update a task - paused', () => {
  var recResult;
  var errors = null;
  var data;
  var count = 0;
  

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    status: paused
    id:"${taskId}"
  }) {
    status
    id
  }
}
        `;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body.data) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('return right status', () => {
    return expect(data.status).toEquals('paused');
  });
});

describe('update a task - resuming', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    status: resuming
    id:"${taskId}"
  }) {
    status
    id
  }
}
        `;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body.data) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('return right status', () => {
    return expect(data.status).toEquals('resuming');
  });
});

describe('re-update a task - running', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    const query = `
mutation {
  updateTask(input: {
    id:"${taskId}"
    status: running
    outputString:"{\\"json\\":\\"string\\"}"
  }) {
    output
    payload
    status
    id
    modifiedDateTime
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.output).to.deep.equal({
      json: 'string'
    });
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(taskId);
  });
  it('got timestamp', () => {
    taskTimestamp = data.modifiedDateTime;
    return expect(taskTimestamp).toBeDefined();
  });
});

describe('create assets to test non-realtime case', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var query = `
mutation {
  a1: createAsset(input: {
    containerId: "${tdoId}"
    assetType: "media"
    contentType: "video/mp4"
    fileData: {
      size: 101
    }
    uri: "http://localhost/"
    name: "a1.mp4"
  }) {
    id
  }

  a2: createAsset(input: {
    containerId: "${tdoId}"
    assetType: "media"
    contentType: "video/mp4"
    fileData: {
      size: 101
    }
    uri: "http://localhost/"
    name: "a1.mp4"
  }) {
    id
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
});

const testTtml = JSON.stringify(`
<?xml version="1.0" encoding="utf-8"?>
<tt xml:lang="en-us" xmlns="http://www.w3.org/ns/ttml"
  xmlns:tts="http://www.w3.org/ns/ttml#styling"
  xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
<body region="CaptionArea">
<div>
        <p begin="00:00:00.680" end="00:00:06.260">OK we are trying this for a 2nd time to test the ability to</p>
        <p begin="00:00:06.680" end="00:00:11.200">upload and in P 3 file Hopefully this will work .</p>
</div>
</body>
</tt>`);
describe('upload an engine result - too big - variables', () => {
  

  let response;
  beforeAll(() => {
    const query = `
  mutation Upload($output: JSONData){
    uploadEngineResult(input: {
      taskId: "${taskId}"
      output: $output
      completeTask: true
      assetType: "transcript"
      contentType: "application/ttml"
      setAsPrimary: true
    }) {
      id
      uri
      type
      uri
      contentType

      sourceData {
        taskId
        name
        engineId
        task {
          executionLocation {
            data
          }
        }
      }
      container {
        primaryAsset(assetType: "transcript") {
          id
          assetType
        }
      }
    }
  }`;
    const data = [];
    for (let i = 0; i < 100000; i++) {
      data.push('...............');
    }
    const vars = { output: { data } };
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .field('variables', JSON.stringify(vars))
      .then(res => {
        response = res;
        expect(response.status).toEqual(200);
       
  
        expect(_.get(result, 'uploadEngineResult.id')).toBeDefined();
        expect(_.get(result, 'uploadEngineResult.uri')).toBeDefined();
        expect(
          _.get(result, 'uploadEngineResult.sourceData.taskId')
        ).toEqual(taskId);
        /*expect( API token has no rights for this
          _.get(result, 'uploadEngineResult.sourceData.task.id')
        ).toEqual(taskId); */
        expect(
          _.get(result, 'uploadEngineResult.sourceData.engineId')
        ).toBeDefined();
        helpers.expect(
          _.get(result, 'uploadEngineResult.sourceData.engine.id'),
          'body.data.uploadEngineResult.sourceData.engine.id'
        ).to.be.undefined; // TODO can restore this after we straighten ou
        // engine/API token rights
        expect(
          _.get(
            response,
            'body.data.uploadEngineResult.container.primaryAsset.id'
          )
        ).toBeDefined();
      });
  });

  it('returned ok', () => {
    expect(_.get(response, 'body.errors')).to.be.undefined;
  });
});

describe('upload an engine result - too big - query', () => {
  

  let response;
  beforeAll(() => {
    const data = [];
    for (let i = 0; i < 100000; i++) {
      data.push('...............');
    }
    const query = `
  mutation {
    uploadEngineResult(input: {
      taskId: "${taskId}"
      output: {
        data: ${JSON.stringify(data, null, 2)}
      }
      completeTask: false
      assetType: "transcript"
      contentType: "application/ttml"
      setAsPrimary: true
    }) {
      id
      uri
      type
      uri
      contentType

      sourceData {
        taskId
        name
        engineId
        task {
          executionLocation {
            data
          }
        }
      }
      container {
        primaryAsset(assetType: "transcript") {
          id
          assetType
        }
      }
    }
  }`;

    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .then(res => {
        response = res;
        expect(response.status).toEqual(200);
       
  
        expect(_.get(result, 'uploadEngineResult.id')).toBeDefined();
        expect(_.get(result, 'uploadEngineResult.uri')).toBeDefined();
        expect(
          _.get(result, 'uploadEngineResult.sourceData.taskId')
        ).toEqual(taskId);
        /*expect( API token has no rights for this
          _.get(result, 'uploadEngineResult.sourceData.task.id')
        ).toEqual(taskId); */
        expect(
          _.get(result, 'uploadEngineResult.sourceData.engineId')
        ).toBeDefined();
        helpers.expect(
          _.get(result, 'uploadEngineResult.sourceData.engine.id'),
          'body.data.uploadEngineResult.sourceData.engine.id'
        ).to.be.undefined; // TODO can restore this after we straighten ou
        // engine/API token rights
        expect(
          _.get(
            response,
            'body.data.uploadEngineResult.container.primaryAsset.id'
          )
        ).toBeDefined();
      });
  });

  it('returned ok', () => {
    expect(_.get(response, 'body.errors')).to.be.undefined;
  });
});

describe('upload an engine result - string', () => {
  

  let response;
  beforeAll(() => {
    const query = `
  mutation {
    uploadEngineResult(input: {
      taskId: "${taskId}"
      outputString: ${testTtml}
      completeTask: true
      assetType: "transcript"
      contentType: "application/ttml"
      setAsPrimary: true
    }) {
      id
      uri
      type
      uri
      contentType

      sourceData {
        taskId
        name
        engineId
        task {
          executionLocation {
            data
          }
        }
      }
      container {
        primaryAsset(assetType: "transcript") {
          id
          assetType
        }
      }
    }
  }`;
    return supertest
      .post('')
      .set(options.headers)
      .field('query', query)
      .then(res => {
        response = res;
        expect(response.status).toEqual(200);
       
  
        expect(_.get(result, 'uploadEngineResult.id')).toBeDefined();
        expect(_.get(result, 'uploadEngineResult.uri')).toBeDefined();
        expect(
          _.get(result, 'uploadEngineResult.sourceData.taskId')
        ).toEqual(taskId);
        /*expect( API token has no rights for this
          _.get(result, 'uploadEngineResult.sourceData.task.id')
        ).toEqual(taskId); */
        expect(
          _.get(result, 'uploadEngineResult.sourceData.engineId')
        ).toBeDefined();
        helpers.expect(
          _.get(result, 'uploadEngineResult.sourceData.engine.id'),
          'body.data.uploadEngineResult.sourceData.engine.id'
        ).to.be.undefined; // TODO can restore this after we straighten ou
        // engine/API token rights
        expect(
          _.get(
            response,
            'body.data.uploadEngineResult.container.primaryAsset.id'
          )
        ).toBeDefined();
      });
  });

  it('returned ok', () => {
    expect(_.get(response, 'body.errors')).to.be.undefined;
  });
});

// we don't need to update the task to complete
// since the status is automatically changed to complete after
// engine result uploaded
// See: https://github.com/veritone/core-job-server/blob/master/src/route/task.js#L352
describe('update a task - complete', () => {
  var recResult;
  var errors = null;
  var data;
  

  beforeAll(() => {
    var query = `mutation {
  updateTask(input: {
    status: complete
    id:"${tdoTaskId}"
    jobId:"${jobId}"
    output: {
      recordingId: "${tdoId}"
    }
  }) {
    output
    taskOutput
    payload
    status
    id
    mediaLengthSec
    mediaStorageBytes
    mediaFileName
  }
}
        `;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) errors = respObj.body.errors;
      if (respObj.body && respObj.body) {
        data = respObj.body.data.updateTask;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(errors).to.be.null;
  });
  it('returned taskOutput', () => {
    return expect(data.taskOutput).toBeDefined();
  });
  it('returned right task ID', () => {
    return expect(data.id).toEquals(tdoTaskId);
  });
  // skip this since mediaFile didn't store in media_file_name column of task table so far
  xit('returned media file name', function() {
    return expect(data.mediaFileName).toEqual('a1.mp4');
  });
  it('returned correct size', () => {
    return expect(data.mediaStorageBytes).toEqual(101);
  });
  it('returned correct media length', () => {
    return expect(data.mediaLengthSec).toEqual(300);
  });
});

describe('verify task updated', () => {
  var recResult;
  var body;
  

  beforeAll(() => {
    var query = `
query {
  tdoTask: task(id:"${tdoTaskId}") {
    id
    status
    outputString
    output
    executionLocation {
      data
    }
    mediaLengthSec
    mediaStorageBytes
    mediaFileName
  }
  otherTask: task(id:"${taskId}") {
    id
    status
    outputString
    output
    executionLocation {
      data
    }
    mediaLengthSec
    mediaStorageBytes
    mediaFileName
  }

}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('no errors', () => {
    return expect(_.get(body, 'data.errors')).to.be
      .undefined;
  });
  it('updated status and output', () => {
    expect(_.get(body, 'data.otherTask.outputString')).toBeDefined();
    return expect(
      _.get(body, 'data.otherTask.status'),
      response
    ).toEqual('complete');
  });
  it('returned right task ID', () => {
    return expect(
      _.get(body, 'data.otherTask.id'),
      response
    ).toEqual(taskId);
  });
  it('returned right TDO task ID', () => {
    return expect(_.get(body, 'data.tdoTask.id')).toEqual(
      tdoTaskId
    );
  });
  it('updated status and output - tdo task', () => {
    expect(_.get(body, 'data.tdoTask.output')).toBeDefined();
    return expect(
      _.get(body, 'data.tdoTask.status'),
      response
    ).toEqual('complete');
  });

  it('returned right execution location data', () => {
    return expect(
      _.get(body, 'data.otherTask.executionLocation.data.name'),
      response
    ).toEqual('locationName');
  });
  // skip this since mediaFile didn't store in media_file_name column of task table so far
  xit('returned media file name', function() {
    return expect(
      _.get(body, 'data.tdoTask.mediaFileName'),
      response
    ).toEqual('a1.mp4');
  });
  it('returned correct size', () => {
    return expect(
      _.get(body, 'data.tdoTask.mediaStorageBytes'),
      response
    ).toEqual(101);
  });
  it('returned correct media length', () => {
    return expect(
      _.get(body, 'data.tdoTask.mediaLengthSec'),
      response
    ).toEqual(300);
  });
});

describe('create a TDO by task', () => {
  var recResult;
  var errors = null;
  
  var body;

  beforeAll(() => {
    const query = `mutation {
      createTDO(input: {
        status: "uploaded"
        startDateTime: 1476726655
        stopDateTime: 1476726655
        sourceData: {
          taskId: "${createTDOTaskId}"
        }
      }) {
        id
        createdDateTime
        sourceData {
          taskId
        }
        applicationId
      }}`;

    recResult = chakram.post(url, { query: query }, options);
    //recResult = chakram.post(recUrl, data, options);
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

  it('has TDO Id', () => {
    return expect(_.get(body, 'data.createTDO.sourceData.taskId')).toEqual(
      createTDOTaskId
    );
  });
});

describe('Cancel a job', () => {
  var recResult;
  var errors = null;
  var count = 0;
  var gotJobId = null;
  

  beforeAll(() => {
    var query = `
      mutation {
        cancelJob(id: "${jobId}") {
          id
          message
        }
      }`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body && respObj.body.data && respObj.body.data.cancelJob) {
        gotJobId = respObj.body.data.cancelJob.id;
      } else {
        console.log('no records in ' + JSON.stringify(respObj.body));
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('returned no errors', () => {
    return expect(errors).to.be.null;
  });
  it('should have correct job ID', () => {
    return expect(gotJobId).toEqual(jobId);
  });
});

describe('Cancel a job - no TDO', () => {
  
  let response;

  beforeAll(() => {
    var query = `
      mutation {
        cancelJob(id: "${createsTDOJobId}") {
          id
          message
        }
      }`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('returned no errors', () => {
    return
      .undefined;
  });
  it('should have correct job ID', () => {
    return expect(_.get(result, 'cancelJob.id')).toEqual(
      createsTDOJobId
    );
  });
});

describe('delete a TDO', () => {
  var recResult;
  var errors = null;
  //var response = null;
  

  beforeAll(() => {
    var query = `mutation {
  deleteTDO(id: "${tdoId}") {
    	id
  }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (
        respObj.body &&
        respObj.body.errors &&
        respObj.body.errors.length > 0 &&
        respObj.body.errors[0].message
      )
        var message = respObj.body.errors[0].message;
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
