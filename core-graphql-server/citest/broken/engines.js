const helpers = require('../citest/helpers/index.js');
const GraphqlClient = require('./helpers/gql.js');

const config = helpers.config;
var fs = require('fs');
const validator = require('validator');
const _ = require('lodash');
const uuid = require('uuid');
var token;
var apiToken;
var env = config.env;
var authUrl = 'https://api.' + env + '.veritone.com/v1';
var url = config.graphql_url
  ? config.graphql_url
  : 'https://api.' + env + '.veritone.com/v1';
var signinResult;
var tdoId;
var assetId;
var engineId;
var buildId;
const userAgent = config.userAgent || 'core-graphql-server test';
const imageUrl =
  'https://dev-veritone-ugc.s3.amazonaws.com/dCJqaM5ZQ2y9eFpWIpUB_Veritone-stacked-logo-300x300.jpg';
const mediaFileUri =
  'https://veritone-docs-prod.s3.amazonaws.com/test-data/transcription/English_Canada_udhr.mp3';
const email = 'tester123@gmail.com';
const specifyEngineId = uuid.v4();
var debug = config.debug && config.debug == true;



describe('authenticate', () => {
  

  beforeAll(() => {
    var signinData = {
      userName: config.userName,
      password: config.password
    };
    var signinUrl = authUrl + '/admin/login';
    console.log('signing in to ' + signinUrl + ' as ' + config.userName);
    signinResult = chakram.post(signinUrl, signinData);

    return signinResult.then(function(respObj) {
      if (respObj.body) {
        token = respObj.body.token;
        apiToken = respObj.body.apiToken || config.apiToken || token;
        //    console.log(JSON.stringify(respObj.body));
      }
      console.log('got token ' + apiToken);
    });
  });

  it('signin should return 200', () => {
    return expect(signinResult).to.have.status(200);
  });

  it('should have API token in response', () => {
    console.log(apiToken);

    return expect(apiToken).toBeDefined();
  });

  it('should have token in response', () => {
    console.log(token);

    return expect(token).toBeDefined();
  });
});

var response = null;

describe('List engines', () => {
  var recResult;
  var errors = null;
  var listRecords;
  var count = 0;
  let body;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 10) {
                records{
              id
              ownerOrganizationId
              isPublic
              name
              description
              categoryId
              state
              price
              asset
              displayName
              validateUri
              executeUri
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
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have no errors', () => {
    return expect(_.get(body, 'errors')).to.be.undefined;
  });

  it('should have 10 records in response', () => {
    return expect(
      _.get(body, 'data.engines.records'),
      response
    ).toHaveLength(10);
  });
  it('should have count of 10', () => {
    return expect(
      _.get(body, 'data.engines.count'),
      response
    ).toEqual(10);
  });
});

describe('Get deployed engine and build info', () => {
  let res, body;
  

  beforeAll(() => {
    const options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(id: "d1bc57fe-675d-435d-9f4d-2f074485ec55" state: active) {
              records {
                id
                name
                taskMetrics {
                  cancelledCount
                  completedCount
                  failedCount
                  pendingCount
                  queuedCount
                  runningCount
                }
                builds(buildStatus: [available, deployed] status: ["deploying"] limit:1) {
                  count
                  records {
                    id
                    name
                    engine {
                      id
                    }
                    engineId
                  }
                }
              }
            count
        }
}
        `;
    let recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      res = respObj;
    });
  });

  it('return 200', () => {
    return expect(res, res).to.have.status(200);
  });

  it('should have 1 record in response', () => {
    return expect(_.get(body, 'data.engines.count'), res).toEqual(1);
  });
  it('should have 1 build in response', () => {
    return expect(
      _.get(body, 'data.engines.records[0].builds.count'),
      res
    ).toEqual(1);
  });
  it('should have correct engine id in build', () => {
    const engineId = _.get(body, 'data.engines.records[0].id');
    const engineIdInBuild = _.get(
      body,
      'data.engines.records[0].builds.records[0].engine.id'
    );
    return expect(engineIdInBuild, res).toEqual(engineId);
  });
  it('should return task metrics', () => {
    const metrics = _.get(body, 'data.engines.records[0].taskMetrics');

    return expect(metrics, res).to.contain.all.keys(
      'cancelledCount',
      'completedCount',
      'failedCount',
      'pendingCount',
      'queuedCount',
      'runningCount'
    );
  });
});

describe('Get engine metrics with invalid date range', () => {
  let res, body;
  

  beforeAll(() => {
    const options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 1 state: active) {
              records {
                id
                name
                taskMetrics(fromDateTime: "2017-09-14T15:58:36+00:00", toDateTime: "2018-09-14T15:58:36+00:00") {
                  cancelledCount
                  completedCount
                  failedCount
                  pendingCount
                  queuedCount
                  runningCount
                }
              }
            count
        }
}
        `;
    let recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      res = respObj;
    });
  });

  it('return 200', () => {
    return expect(res, res).to.have.status(200);
  });

  it('throws an error when an invalid date range is input', () => {
    return expect(_.get(body, 'errors[0].message'), res).toEqual(
      'max range between from and to date is one week'
    );
  });
});

describe('List engines in alphabetical order', () => {
  var recResult;
  var errors = null;
  var listRecords;
  var count = 0;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 10, orderBy:[{field:name, direction:asc}]) {
                records{
              id
              ownerOrganizationId
              ownerOrganization {
                id
              }
              isPublic
              name
              description
              categoryId
              state
              price
              asset
              displayName
              validateUri
              executeUri
            }
            count
            limit
            offset
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
      if (respObj.body && respObj.body) {
        listRecords = respObj.body.data.engines.records;
        count = respObj.body.data.engines.count;
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

  it('should have 10 records in response', () => {
    return expect(listRecords).toHaveLength(10);
  });
  it('should have count of 10', () => {
    return expect(count).toEqual(10);
  });

  it('should be ordered by name', () => {
    return expect(listRecords[0].name).to.be.below(
      listRecords[1].name
    );
  });
});

describe('Get engine with rating filter', () => {
  var recResult;
  
  let body;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 1, filter:{rating:[5]}) {
                records{
              id
              applicationId
              ownerOrganization {
                name
              }
              rating
              isPublic
              name
              description
              categoryId
              state
              price
              asset
              displayName
              validateUri
              executeUri
              validStateActions
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
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('has no errors', () => {
    return expect(_.get(body, 'errors')).to.be.undefined;
  });

  it('should have 1 records in response', () => {
    return expect(
      _.get(body, 'data.engines.records'),
      response
    ).toHaveLength(1);
  });

  it('should have rating of 5', () => {
    return expect(
      _.get(body, 'data.engines.records[0].rating'),
      response
    ).toEqual(5);
  });

  it('should have valid state actions', () => {
    return expect(
      _.get(body, 'data.engines.records[0].validStateActions'),
      response
    ).to.include.members(['edit', 'delete']);
  });
});

describe('Get engine with category filter', () => {
  var recResult;
  var errors = null;
  var listRecords;
  var count = 0;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 1, filter:{category:["Transcription"]}) {
                records{
              id
              applicationId
              ownerOrganization {
                name
              }
              rating
              isPublic
              name
              description
              categoryId
              category{
                name
              }
              state
              price
              asset
              displayName
              validateUri
              executeUri
            }
            count
            limit
            offset
        }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body && respObj.body) {
        listRecords = respObj.body.data.engines.records;
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

  it('has no errors', () => {
    return expect(errors).to.be.null;
  });

  it('should have 1 records in response', () => {
    return expect(listRecords).toHaveLength(1);
  });

  it('should be transcription category', () => {
    return expect(listRecords[0].category.name).toEqual(
      'Transcription'
    );
  });
});

describe('Get engine build manifest', () => {
  var recResult;
  
  let body;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(id: "d1bc57fe-675d-435d-9f4d-2f074485ec55" owned:false) {
              records{
                supportedScheduleTypes
                builds(status:["deployed"]) {
                  records{
                    manifest
                    supportedInputFormats
                    preferredInputFormat
                    outputFormats
                }
              }
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
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('has no errors', () => {
    return expect(_.get(body, 'errors')).to.be.undefined;
  });

  it('should have 1 records in response', () => {
    return expect(
      _.get(body, 'data.engines.records[0].builds.records'),
      response
    ).toHaveLength(1);
  });
});

describe('Get engine builds with orderBy', () => {
  var recResult;
  
  let body;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `
    query {
      engines(limit:10) {
        records {
          id
          builds(
            orderBy: [
              { 
                field: version
                direction: desc
              }
            ]
          ) {
            count
            records{
              id
              version
              modifiedDateTime
            }
          }
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
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('has no errors', () => {
    return expect(_.get(body, 'errors')).to.be.undefined;
  });

  it('should sortBy version', () => {
    const engines = _.get(body, 'data.engines');

    _.forEach(engines.records, engine => {
      if (_.get(engine, 'builds.count') > 1) {
        const records = _.get(engine, 'builds.records');
        return expect(
          parseInt(records[0].version),
          response
        ).to.be.above(parseInt(records[1].version));
      }
    });
  });
});

describe('List engine categories', () => {
  var recResult;
  let body;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engineCategories(limit:10) {
              records {
              id
              name
              description
              engineIds
              exportFormats {
                format
                label
                types
              }
              engines(orderBy: [
                  {
                    field: id
                    direction:desc
                  }
                ]
                filter: {
                  type: Cognition
                }
              ) {
                records {
                  id
                }
              }
              totalEngines
              class {
                id
                name
                description
                iconClass
              }
            }
        }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
      body = respObj.body;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should have no errors', () => {
    return expect(_.get(body, 'errors')).to.be.undefined;
  });

  it('should have 10 records in response', () => {
    return expect(
      _.get(body, 'data.engineCategories.records'),
      response
    ).toHaveLength(10);
  });
  it('should have engine IDs in two places', () => {
    return expect(
      _.get(body, 'data.engineCategories.records[0].engineIds'),
      response
    ).toBeDefined();
  });
  it('should have engine IDs in two places', () => {
    return expect(
      _.get(body, 'data.engineCategories.records[0].engines.records[0].id'),
      response
    ).toBeDefined();
  });
  it('should have export formats', () => {
    return expect(
      _.get(body, 'data.engineCategories.records[0].exportFormats'),
      response
    ).toBeDefined();
  });
  it('should have engine class', () => {
    return expect(
      _.filter(
        _.map(_.get(body, 'data.engineCategories.records'), 'class'),
        engineClass => !!engineClass
      ),
      response
    ).to.not.be.emptuy;
  });
});

describe('List engine categories by name', () => {
  
  let data;

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            goodCat:  engineCategories(name:"detection",limit:1) {
              records {
              id
              name
              description
              type {
                name
                description
              }
              totalEngines
              engines(limit:1) {
                count
                records {
                  id
                  categoryId
                  category {
                    id
                  }
                }
              }
            }
          }
            badCat:  engineCategories(name:"no_such_category!") {
              count
              records {
                id
              }
            }

}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      data = respObj.body;
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('has no errors', () => {
    return expect(data.errors).to.be.undefined;
  });
  it('should have 1 records in response', () => {
    let catId = _.get(data, 'data.goodCat.records[0].id');
    return expect(catId).toBeDefined();
  });
  it('should have no records for invalid category', () => {
    return expect(
      _.get(data, 'data.badCat.count'),
      response
    ).toEqual(0);
  });
  it('should have engines', () => {
    let tot = _.get(data, 'data.goodCat.records[0].totalEngines');
    let ct = _.get(data, 'data.goodCat.records[0].engines.count');
    expect(ct).toEqual(1);
    return expect(tot).to.be.above(1);
  });
  it('should be cognition engine type', () => {
    let ty = _.get(data, 'data.goodCat.records[0].type.name');
    return expect(ty).toEqual('Cognition');
  });
  it('should have nested category', () => {
    let id1 = _.get(
      data,
      'data.goodCat.records[0].engines.records[0].categoryId'
    );
    let id2 = _.get(
      data,
      'data.goodCat.records[0].engines.records[0].category.id'
    );
    expect(id1).toEqual(
      _.get(data, 'data.goodCat.records[0].id')
    );
    return expect(id1).toEqual(id2);
  });
});

describe('Get engine category by id', () => {
  const transcriptionCategoryId = '67cd4dd0-2f75-445d-a6f0-2f297d6cd182';
  let recResult;
  let data;

  beforeAll(() => {
    let options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    let query = `query engineCategory($categoryId: ID!){
      engineCategory(id: $categoryId) {
        id
        name
        description
        exportFormats {
          format
          label
          types
        }
        engineIds
        engines(orderBy: [
            {
              field: id
              direction:desc
            }
          ]
          filter: {
            type: Cognition
          }
        ) {
          records {
            id
          }
        }
        totalEngines
      }
    }
    `;
    recResult = chakram.post(
      url,
      { query: query, variables: { categoryId: transcriptionCategoryId } },
      options
    );
    return recResult.then(function(respObj) {
      data = respObj.body;
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('has no errors', () => {
    return expect(data.errors).to.be.undefined;
  });
  it('should return id matching id argument', () => {
    return expect(
      _.get(data, 'data.engineCategory.id'),
      response
    ).toEqual(transcriptionCategoryId);
  });
  it('should have export formats', () => {
    return expect(
      _.get(data, 'data.engineCategory.exportFormats'),
      response
    ).toBeDefined();
  });
});

describe('Get engine by category name', () => {
  var recResult;
  var errors = null;
  var listRecords;
  var count = 0;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `query {
            engines(limit: 1, category: "detection") {
                records{
              id
              applicationId

              isPublic
              name
              description
              categoryId
              state
              price
              asset
              displayName
              validateUri
              executeUri
            }
            count
            limit
            offset
        }
}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body && respObj.body) {
        listRecords = respObj.body.data.engines.records;
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

  it('has no errors', () => {
    return expect(errors).to.be.null;
  });

  it('should have 1 records in response', () => {
    return expect(listRecords).toHaveLength(1);
  });
});

const categoryId = '6faad6b7-0837-45f9-b161-2f6bf31b7a07';

describe('Create engine', () => {
  var recResult;
  var errors = null;
  var count = 0;
  var body;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };
    /*
fields: [
  {
    name:"number"
    type: Number
    max: 100
    min: 0.1
    step:1.1
    defaultValue: "34.1"
    label: "a number"
  }
]
*/
    var query = `mutation {
            createEngine(input: {
                name: "test engine"
                isPublic: false
                fields: [
                  {
                    name:"number"
                    type: Number
                    max: 100
                    min: 0.1
                    step:1.1
                    defaultValue: "34.1"
                    label: "a number"
                  }, {
                    name:"multi-picklist"
                    defaultValues: ["one","two"]
                    type: MultiPicklist
                    label: "test picklist"
                    options: [
                      {
                        key: "one"
                        value: "one"
                      }, {
                        key: "two"
                        value: "two"
                      }, {
                        key: "three"
                        value: "three"
                      }
                    ]
                  }, {
                    name: "test-schema-select"
                    type: SchemaSelection
                    label: "A test schema selection"
                  }
                ]
                logoPath: "${imageUrl}"
                iconPath: "${imageUrl}"
                description:  "test engine"
                deploymentModel: FullyNetworkIsolated
                categoryId: "${categoryId}"
                useCases: ["Use Case 1", "Use Case 2"]
                industries: ["Industry 1", "Industry 2"]
                manifest: {
                  engineMode: "stream",
                  supportedInputTypes: ["application/json", "audio/mp3"]
                }
                testingDetails: {
                  email: "${email}",
                  mediaFileUri:"${mediaFileUri}",
                  customFields: {
                    data1: "test value"
                  },
                  isCertified: false,
                  buildIdCertified: "test",
                  dataCertified: {
                    data1: 'test value'
                  }
                }
            }) {
                id
                fields {
                  name
                  type
                  max
                  min
                  step
                  defaultValue
                  defaultValues
                  label
                }
                category {
                  id
                }
                dependency {
                  dependencyType
                  assetType
                }
                logoPath
                iconPath
                signedLogoPath
                signedIconPath
                useCases
                industries
                manifest
                testingDetails {
                  email
                  mediaFileUri
                  customFields
                  isCertified
                  buildIdCertified
                  dataCertified
                }
            }
        }

        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      } else {
        engineId = _.get(respObj, 'body.data.createEngine.id');
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should not have errors', () => {
    return expect(errors).to.be.null;
  });

  it('should return engine ID', () => {
    console.log('new engine ID is ' + engineId);
    return expect(engineId).toBeDefined();
  });
  it('should return a field', () => {
    return expect(
      _.get(body, 'data.createEngine.fields[0].name'),
      response
    ).toEqual('number');
  });
  it('should return a field default', () => {
    return expect(
      _.get(body, 'data.createEngine.fields[0].defaultValue'),
      response
    ).toBeDefined();
  });
  it('should return category', () => {
    return expect(
      _.get(body, 'data.createEngine.category.id'),
      response
    ).toEqual(categoryId);
  });
  it('should return signedIconPath', () => {
    return expect(
      _.get(body, 'data.createEngine.signedIconPath').length,
      response
    ).to.be.greaterThan(_.get(body, 'data.createEngine.iconPath').length);
  });

  it('should return signedLogoPath', () => {
    return expect(
      _.get(body, 'data.createEngine.signedLogoPath').length,
      response
    ).to.be.greaterThan(_.get(body, 'data.createEngine.logoPath').length);
  });
  it('should return useCases', () => {
    return expect(
      _.get(body, 'data.createEngine.useCases'),
      response
    ).toHaveLength(2);
  });
  it('should return industries', () => {
    return expect(
      _.get(body, 'data.createEngine.industries'),
      response
    ).toHaveLength(2);
  });
  it('should return manifest', () => {
    return expect(
      _.get(body, 'data.createEngine.manifest'),
      response
    ).toEqual({
      engineMode: 'stream',
      supportedInputTypes: ['application/json', 'audio/mp3']
    });
  });
  it('should return testing details', () => {
    return expect(
      _.get(body, 'data.createEngine.testingDetails'),
      response
    ).toEqual({
      email: email,
      mediaFileUri: mediaFileUri,
      customFields: {
        data1: 'test value'
      },
      isCertified: false,
      buildIdCertified: 'test',
      dataCertified: {
        data1: 'test value'
      }
    });
  });
  /*
  it('should include dependency info - assetType', function() {
    return expect(_.get(body, 'data.createEngine.dependency.assetType')).toEqual('mp3');
  });
  it('should include dependency info - dependencyType', function() {
    return expect(_.get(body, 'data.createEngine.dependency.dependencyType')).toEqual('transcode');
  });
*/
});

describe('Create engine with specify engineId', () => {
  let recResult;
  let errors = null;
  let count = 0;
  let body;
  

  beforeAll(() => {
    const options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };
    const query = `mutation {
            createEngine(input: {
                id: "${specifyEngineId}"
                name: "test engine"
                isPublic: false
                fields: [
                  {
                    name:"number"
                    type: Number
                    max: 100
                    min: 0.1
                    step:1.1
                    defaultValue: "34.1"
                    label: "a number"
                  }, {
                    name:"multi-picklist"
                    defaultValues: ["one","two"]
                    type: MultiPicklist
                    label: "test picklist"
                    options: [
                      {
                        key: "one"
                        value: "one"
                      }, {
                        key: "two"
                        value: "two"
                      }, {
                        key: "three"
                        value: "three"
                      }
                    ]
                  }, {
                    name: "test-schema-select"
                    type: SchemaSelection
                    label: "A test schema selection"
                  }
                ]
                logoPath: "${imageUrl}"
                iconPath: "${imageUrl}"
                description:  "test engine"
                deploymentModel: FullyNetworkIsolated
                categoryId: "${categoryId}"
                testingDetails: {
                  email: "${email}",
                  mediaFileUri:"${mediaFileUri}",
                  customFields: {
                    language: "en"
                  }
                }
            }) {
                id
                fields {
                  name
                  type
                  max
                  min
                  step
                  defaultValue
                  defaultValues
                  label
                }
                category {
                  id
                }
                dependency {
                  dependencyType
                  assetType
                }
                logoPath
                iconPath
                testingDetails {
                  email
                  mediaFileUri
                  customFields
                  isCertified
                  buildIdCertified
                  dataCertified
                }
            }
        }

        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      body = respObj.body;
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should not have errors', () => {
    return expect(errors).to.be.null;
  });

  it('should return engine ID', () => {
    return expect(
      _.get(result, 'createEngine.id'),
      response
    ).toBeDefined();
  });

  it('should return exact engine ID', () => {
    return expect(
      _.get(result, 'createEngine.id'),
      response
    ).toEqual(specifyEngineId);
  });

  it('should return a field', () => {
    return expect(
      _.get(body, 'data.createEngine.fields[0].name'),
      response
    ).toEqual('number');
  });
  it('should return a field default', () => {
    return expect(
      _.get(body, 'data.createEngine.fields[0].defaultValue'),
      response
    ).toBeDefined();
  });
  it('should return category', () => {
    return expect(
      _.get(body, 'data.createEngine.category.id'),
      response
    ).toEqual(categoryId);
  });
  it('should return email', () => {
    return expect(
      _.get(body, 'data.createEngine.testingDetails.email'),
      response
    ).toEqual(email);
  });
  it('should return isCertified', () => {
    return expect(
      _.get(body, 'data.createEngine.testingDetails.isCertified'),
      response
    ).to.toBe(false);
  });
});

describe('Get engines', () => {
  
  let data;
  const limit = 2;

  beforeAll(() => {
    const options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    const query = `query {
            engines(limit: ${limit}, libraryRequired: true) {
                records{
              id
              ownerOrganizationId
              applicationId
              isPublic
              libraryRequired
              name
              description
              categoryId
              state
              price
              asset
              displayName
              validateUri
              executeUri
              category {
                  id
                  libraryEntityIdentifierTypeIds
                  libraryEntityIdentifierTypes {
                    records {
                      id
                      label
                    }
                  }
              }
              testingDetails {
                email
                mediaFileUri
                customFields
                isCertified
                buildIdCertified
                dataCertified
              }
            }
            count
            limit
            offset
        }

        engine(id: "${engineId}") {
          id
          categoryId
          category {
            id
          }
          dependency {
            dependencyType
            assetType
          }
          testingDetails {
            email
            mediaFileUri
            customFields
            isCertified
            buildIdCertified
            dataCertified
          }
        }


}
        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      data = respObj.body;
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });
  it('should return no errors in response', () => {
    return expect(data.errors).to.be.undefined;
  });
  it(`should have ${limit} records in response`, () => {
    return expect(_.get(data, 'data.engines.records')).toHaveLength(limit);
  });
  it(`should have count of ${limit}`, () => {
    return expect(
      _.get(data, 'data.engines.count'),
      response
    ).toEqual(limit);
  });
  it('should return an engine', () => {
    return expect(_.get(data, 'data.engine.id')).toEqual(
      engineId
    );
  });
  it('should return an engine category', () => {
    return expect(
      _.get(data, 'data.engine.category.id'),
      response
    ).toEqual(categoryId);
  });
  it('should return an engine categoryId', () => {
    return expect(
      _.get(data, 'data.engine.categoryId'),
      response
    ).toEqual(categoryId);
  });
  it('should return testing details', () => {
    return expect(_.get(data, 'data.engine.testingDetails'))
      .toBeDefined();
  });
  /*
  it('should include dependency info - assetType', function() {
    return expect(_.get(body, 'data.engine.dependency.assetType')).toEqual('mp3');
  });
  it('should include dependency info - dependencyType', function() {
    return expect(_.get(body, 'data.engine.dependency.dependencyType')).toEqual('transcode');
  });
*/
});

describe('Update engine', () => {
  var recResult;
  var errors = null;
  var count = 0;
  
  var response;
  var newId;
  var body;
  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };
    /*
fields: [
  {
    name:"number"
    type: Number
    max: 100
    min: 0.1
    step:1.1
    defaultValue: "34.1"
    label: "a number"
  },
  {
    type:Picklist
    name:"a_picklist"
    label:"A Picklist"
    options: [
      {
        key: "foo"
        value: "bar"
      }, {
        key: "foo2"
        value: "bar2"
      }
    ]
  }
]

*/
    var query = `mutation {
            updateEngine(input: {
                id: "${engineId}"
                isPublic: false
                description:  "updated test engine"
                libraryRequired: true
                fields: [
                  {
                    name:"number"
                    type: Number
                    max: 100
                    min: 0.1
                    step:1.1
                    defaultValue: "34.1"
                    label: "a number"
                  },
                  {
                    type:Picklist
                    name:"a_picklist"
                    label:"A Picklist"
                    options: [
                      {
                        key: "foo"
                        value: "bar"
                      }, {
                        key: "foo2"
                        value: "bar2"
                      }
                    ]
                  }
                ]
                logoPath: "https://fakelogo.url"
                iconPath: "https://fakeicon.url"
                useCases: ["Use Case Foo", "Use Case Bar"]
                industries: ["Industry Foo", "Industry Bar"]
                manifest: {
                  engineMode: "chunk",
                  supportedInputTypes: ["application/json", "audio/mp4"]
                }
            }) {
                id
                libraryRequired
                fields {
                  name
                  type
                  max
                  min
                  step
                  defaultValue
                  label
                  options {
                    key
                    value
                  }
                }
                isPublic
                dependency {
                  assetType
                  dependencyType
                }
                logoPath
                iconPath
                useCases
                industries
                manifest
            }
        }

        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body && respObj.body && respObj.body.data) {
        body = respObj.body;
        newId = respObj.body.data.updateEngine.id;
      } else {
        console.log('no records in ' + JSON.stringify(respObj.body));
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should not have errors', () => {
    return expect(errors).to.be.null;
  });

  it('should return engine ID', () => {
    return expect(newId).toEqual(engineId);
  });
  it('should return updated fields', () => {
    return expect(
      _.get(body, 'data.updateEngine.fields'),
      response
    ).toHaveLength(2);
  });
  it('should return libraryRequired', () => {
    return expect(
      _.get(body, 'data.updateEngine.libraryRequired'),
      response
    ).toEqual(true);
  });
  it('should return updated field options', () => {
    return expect(
      _.get(body, 'data.updateEngine.fields[1].options[1].key'),
      response
    ).toEqual('foo2');
  });
  it('should return updated logoPath', () => {
    return expect(
      _.get(body, 'data.updateEngine.logoPath'),
      response
    ).toEqual('https://fakelogo.url');
  });
  it('should return updated iconPath', () => {
    return expect(
      _.get(body, 'data.updateEngine.iconPath'),
      response
    ).toEqual('https://fakeicon.url');
  });
  it('should return updated useCases', () => {
    return expect(
      _.get(body, 'data.updateEngine.useCases'),
      response
    ).toEqual(['Use Case Foo', 'Use Case Bar']);
  });
  it('should return updated industries', () => {
    return expect(
      _.get(body, 'data.updateEngine.industries'),
      response
    ).toEqual(['Industry Foo', 'Industry Bar']);
  });
  it('should return updated manifest', () => {
    return expect(
      _.get(body, 'data.updateEngine.manifest'),
      response
    ).toEqual({
      engineMode: 'chunk',
      supportedInputTypes: ['application/json', 'audio/mp4']
    });
  });
  /*
  it('should include dependency info - assetType', function() {
    return expect(_.get(body, 'data.updateEngine.dependency.assetType')).toEqual('wav');
  });
  it('should include dependency info - dependencyType', function() {
    return expect(_.get(body, 'data.updateEngine.dependency.dependencyType')).toEqual('transcode');
  });
  */
});

describe('Disable engine', () => {
  var recResult;
  var response;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `mutation {
      engineWorkflow(input: {
        id: "${engineId}"
        action: disable
      })  {
        id
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

  it('should have errors', () => {
    return expect(response.errors).to.not.be.null;
  });
});

describe('Enable engine', () => {
  var recResult;
  var response;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `mutation {
      engineWorkflow(input: {
        id: "${engineId}"
        action: enable
      })  {
        id
      }
    }`;

    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      response = respObj;
      console.log(JSON.stringify(response));
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have errors', () => {
    return expect(response.errors).to.not.be.null;
  });
});

describe('Delete engine', () => {
  var recResult;
  var errors = null;
  var newId;
  var count = 0;
  

  beforeAll(() => {
    var options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    var query = `mutation {
            ex1: deleteEngine(id:"${engineId}") {
                id
            }
            ex2: deleteEngine(id:"${specifyEngineId}") {
              id
            }
        }

        `;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      if (respObj.body && respObj.body && respObj.body.data) {
        newId = respObj.body.data.ex1.id;
        console.log('deleted ID:  ' + newId);
      } else {
        console.log('no records in ' + JSON.stringify(respObj.body));
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should not have errors', () => {
    return expect(errors).to.be.null;
  });

  it('should return engine ID', () => {
    return expect(newId).toEqual(engineId);
  });

  it('should return ex2 specifyEngineId', () => {
    return expect(
      _.get(result, 'ex2.id'),
      response
    ).toEqual(specifyEngineId);
  });
});

describe('Get Usage By TaskType', () => {
  let recResult;
  

  beforeAll(() => {
    const options = {
      headers: {
        Authorization: 'Bearer ' + token,
        'User-Agent': userAgent,
        Accept: '*/*'
      }
    };

    let query = `query {
      getUsageByTaskType {
        totalDuration
        totalCost
        usageItems {
          engineId
          cost
          duration
        }
        billingType
        startDateTime
        endDateTime
      }
    }`;
    recResult = chakram.post(url, { query: query }, options);
    return recResult.then(function(respObj) {
      if (respObj.body && respObj.body.errors) {
        errors = respObj.body.errors;
      }
      response = respObj;
    });
  });

  it('return 200', () => {
    return 
  });

  it('should have result', () => {
    return expect(response.body.data.getUsageByTaskType).toBeDefined();
  });
});
