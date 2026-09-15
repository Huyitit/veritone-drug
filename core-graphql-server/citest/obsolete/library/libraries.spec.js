const _ = require('lodash');
const moment = require('moment');
const helpers = require('../../helpers/index.js');
const GraphqlClient = require('../../helpers/gql.js');

const config = helpers.config;
var fs = require('fs');
var appKey = Date.now();

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
var debug = config.debug && config.debug == true;

var newLibraryTypeId = 'people';
var newEntityIdentifierTypeId = 'face';
var newLibraryId;
var newEntityId;
var newEngineModelId;
var supertest = require('supertest')(url);
const imageUrl = 'https://www.veritone.com/images/logo.svg';
let libraryEngineModelEngineId;
let writeableSignedUrl;
let writeableUnsignedUrl;
let getSignedUrl;
let secondLibraryId, secondEngineModelId;
let organizationId;
let newEntityIdentifierId;
const citestMarker = global.citestMarker || 'citest-should-delete';
describe('library tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    apiToken = result.apiToken;
  });

  var response = null;

  it('Select an engine', async () => {
    const query = `
query {
  engines(limit: 1, libraryRequired:true) {
    count
    records {
      id
    }
  }
  me {
    organizationId
  }
}
        `;
    const result = await gqlClient.query(query);
    libraryEngineModelEngineId = _.get(result, 'engines.records[0].id');
    expect(libraryEngineModelEngineId).toBeDefined();
    organizationId = _.get(result, 'me.organizationId');
  });

  it('List library types', async () => {
    const query = `query {
  libraryTypes {
      records {
    	id
    	label
        entityIdentifierTypes {
            id
            label
            description
        }
    }
    count
    offset
    limit
  }
libraryType(id: "${newLibraryTypeId}") {
  id
  label
  entityIdentifierTypes {
    id
    label
    description
  }
}
}
        `;
    const result = await gqlClient.query(query);
    expect(result.libraryTypes.count).toBeGreaterThan(1);
    expect(_.get(result, 'libraryType.id')).toBeDefined();
  });

  /*
  describe('create a entity identifier type', function() {

    var records = null;

    before('request', function() {
      var options = {
        headers: {
          Authorization: 'Bearer ' + token,
          'User-Agent': 'curl/7.51.0'
        }
      };

      const query = `mutation {
        createEntityIdentifierType(input: {
          id: "testentityidentifiertype_${appKey}"
          label: "test entity identifier ${appKey}"
          labelPlural: "test entity identifers"
          dataType: image
        })  {
          id
          label
        }
      }

      `;
      const result = await gqlClient.query(query);

        if (respObj.body && result.createEntityIdentifierType) {
          records = result.createEntityIdentifierType;
          newEntityIdentifierTypeId = records.id;
          
        }
      });
    });

    it('return 200', function() {
      expect(recResult).to.have.status(200);
    });
    it('did not return any errors', function() {
      expect(errors).to.be.null;
    });
    it('returned an ID', function() {
      expect(newEntityIdentifierTypeId).toBeDefined();
    });
  });

  describe('create a library type', function() {

    var records = null;

    before('request', function() {
      var options = {
        headers: {
          Authorization: 'Bearer ' + token,
          'User-Agent': 'curl/7.51.0',
        }
      };

      const query = `mutation {
        createLibraryType(input: {
          id: "testlibrarytype${appKey}"
          label: "testlibrarytype${appKey}"
          entityType: {
            name: "test entity"
            namePlural: "test entities"
            schema: {}
          }
          entityIdentifierTypeIds: ["${newEntityIdentifierTypeId}"]

        })  {
          id
          label
        }
      }

      `;
      const result = await gqlClient.query(query);

        if (respObj.body && result.createLibraryType) {
          records = result.createLibraryType;
          newLibraryTypeId = records.id;
          
        }
      });
    });

    it('return 200', function() {
      expect(recResult).to.have.status(200);
    });
    it('did not return any errors', function() {
      expect(errors).to.be.null;
    });
    it('returned an ID', function() {
      expect(newLibraryTypeId).toBeDefined();
    });
  });
  */

  it('create a library', async () => {
    const query = `mutation {
      createLibrary(input: {
        name: "${citestMarker}-testlibrary${appKey}"
        libraryTypeId: "${newLibraryTypeId}"
        coverImageUrl: "${imageUrl}"
      })  {
        id
        name
        coverImageUrl
      }
    }`;
    const result = await gqlClient.query(query);
    newLibraryId = _.get(result, 'createLibrary.id');
    expect(newLibraryId).toBeDefined();
    const url = _.get(result, 'createLibrary.coverImageUrl');
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('cover'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('create a second library', async () => {
    const query = `mutation {
      createLibrary(input: {
        name: "${citestMarker}-testlibrary${appKey}"
        libraryTypeId: "${newLibraryTypeId}"
        coverImageUrl: "${imageUrl}"
      })  {
        id
        name
        coverImageUrl
      }
    }

    `;
    const result = await gqlClient.query(query);
    secondLibraryId = _.get(result, 'createLibrary.id');
    expect(secondLibraryId).toBeDefined();
    expect(_.get(result, 'createLibrary.coverImageUrl')).toBeDefined();
  });

  it('create a library - bad type', async () => {
    const query = `mutation {
      createLibrary(input: {
        name: "${citestMarker}-testlibrary${appKey}"
        libraryTypeId: "nonexistent_library_type_134235q4545"
      })  {
        id
      }
    }

    `;
    expect(async () => gqlClient.query(query)).rejects.toThrow('not_found');
  });

  it('create a library engine model', async () => {
    const query = `mutation {
      createLibraryEngineModel(input: {
        libraryId: "${newLibraryId}"
        engineId: "${libraryEngineModelEngineId}"
        trainStatus: pending
        dataUrl: "${imageUrl}"
        accuracy: 75
      })  {
        id
        trainStatus
        libraryId
        engineId
        dataUrl
      }
    }

    `;
    const result = await gqlClient.query(query);

    const records = result.createLibraryEngineModel;
    newEngineModelId = records.id;

    expect(newEngineModelId).toBeDefined();
    const url = records.dataUrl;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('library-engine-data-model'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('get a writeable signedUrl', async () => {
    const query = `query {
      getSignedWritableUrl {
        url
        unsignedUrl
        bucket
        getUrl
      }
    }`;

    const result = await gqlClient.query(query);
    const records = result.getSignedWritableUrl;
    writeableSignedUrl = records.url;
    writeableUnsignedUrl = records.unsignedUrl;
    getSignedUrl = records.getUrl;

    expect(writeableSignedUrl).toBeDefined();
    expect(writeableUnsignedUrl).toBeDefined();
  });

  it('upload a file(any file) using writeable signed url', async () => {
    if (env.includes('local')) {
      return;
    }
    const result = await helpers
      .supertest(writeableSignedUrl)
      .put('')
      .send({
        test: 'test object'
      })
      .expect(200);
    expect(result).toBeDefined();
  });

  it('create a library engine model with unsigned url', async () => {
    const query = `mutation {
      createLibraryEngineModel(input: {
        libraryId: "${secondLibraryId}"
        engineId: "${libraryEngineModelEngineId}"
        trainStatus: pending
        dataUrl: "${writeableUnsignedUrl}"
        accuracy: 75
      })  {
        id
        trainStatus
        libraryId
        engineId
        dataUrl
      }
    }

    `;
    const result = await gqlClient.query(query);
    const records = result.createLibraryEngineModel;
    secondEngineModelId = records.id;
    expect(secondEngineModelId).toBeDefined();
    expect(records.dataUrl).toBeDefined();
  });

  it('get a library engine model', async () => {
    const query = `query {
      libraryEngineModel(id:  "${newEngineModelId}") {
        id
     engine {
       id
       name
     }
     engineId
     library {
       id
       name
     }
     libraryId
     libraryVersion
     contentType
     trainJobId
     trainStatus
     dataUrl
     jsondata
     createdDateTime
     modifiedDateTime
        accuracy
      }
    }

    `;
    const result = await gqlClient.query(query);
    const records = result.libraryEngineModel;
    newEngineModelId = records.id;
    expect(newEngineModelId).toBeDefined();
    expect(records.accuracy).toEqual(75);
  });

  it('get a second library engine model', async () => {
    const query = `query {
      libraryEngineModel(id:  "${secondEngineModelId}") {
        id
     engine {
       id
       name
     }
     engineId
     library {
       id
       name
     }
     libraryId
     libraryVersion
     contentType
     trainJobId
     trainStatus
     dataUrl
     jsondata
     createdDateTime
     modifiedDateTime
        accuracy
      }
    }

    `;
    const result = await gqlClient.query(query);
    const records = result.libraryEngineModel;
    secondEngineModelId = records.id;
    expect(secondEngineModelId).toBeDefined();
    expect(records.accuracy).toEqual(75);
  });

  it('update a library', async () => {
    const query = `mutation {
      updateLibrary(input: {
        id: "${newLibraryId}"
        description: "${citestMarker}-test library renamed"
        coverImageUrl: ""
      })  {
        id
        description
        name
        coverImageUrl
        organizationId
        version
        modifiedDateTime
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'updateLibrary.id')).toEqual(newLibraryId);
    expect(_.get(result, 'updateLibrary.description')).toEqual(
      citestMarker + '-test library renamed'
    );
    expect(_.get(result, 'updateLibrary.name')).toEqual(
      `${citestMarker}-testlibrary${appKey}`
    );
    expect(_.get(result, 'updateLibrary.coverImageUrl')).toEqual(null);
  });

  it('publish a library', async () => {
    let theId;
    let newVersion;
    const query = `mutation {
      publishLibrary(id: "${newLibraryId}")  {
        id
        version
      }
    }
    `;
    const result = await gqlClient.query(query);

    const record = result.publishLibrary;
    theId = record.id;
    newVersion = record.version;
    expect(theId).toEqual(newLibraryId);
    expect(newVersion).toEqual(1);
  });

  it('update a library engine model', async () => {
    var records = null;

    var theId;
    var theStatus;
    var theUrl;
    var accuracy;

    const query = `mutation {
      updateLibraryEngineModel(input: {
        id: "${newEngineModelId}"
        trainStatus: complete
        accuracy: 90
      })  {
        id
        trainStatus
        dataUrl
        accuracy
      }
    }

    `;
    const result = await gqlClient.query(query);

    expect(result.updateLibraryEngineModel).toBeDefined();
    records = result.updateLibraryEngineModel;
    theId = records.id;
    theStatus = records.trainStatus;
    theUrl = records.dataUrl;
    accuracy = records.accuracy;
    expect(theId).toEqual(newEngineModelId);
    expect(theStatus).toEqual('complete');
    // note that URL will change after file is ingested and stored to S3
    expect(theUrl).toBeDefined();
    expect(accuracy).toEqual(90);
  });

  it('update a library engine model with data file', async () => {
    const query = `mutation {
      updateLibraryEngineModel(input: {
        id: "${newEngineModelId}"
        contentType: "application/octet-stream"
      })  {
        id
        trainStatus
        dataUrl
        contentType
        createdDateTime
        modifiedDateTime
      }
    }

    `;
    const result = await gqlClient.uploadFile(
      query,
      'beatles.facebox',
      './citest/data/beatles.facebox'
    );
    const theId = result.updateLibraryEngineModel.id;
    const theUrl = result.updateLibraryEngineModel.dataUrl;
    expect(theId).toEqual(newEngineModelId);
    expect(_.get(result, 'updateLibraryEngineModel.contentType')).toEqual(
      'application/octet-stream'
    );

    const modifiedDateTime = _.get(
      result,
      'updateLibraryEngineModel.modifiedDateTime'
    );
    expect(modifiedDateTime).toBeDefined();
    // expect(moment(modifiedDateTime).isBefore(moment.utc())).toEqual(true);

    const createdDateTime = _.get(
      result,
      'updateLibraryEngineModel.createdDateTime'
    );
    expect(createdDateTime).toBeDefined();
    expect(moment(createdDateTime).isBefore(moment.utc())).toEqual(true);

    const url = theUrl;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('library-engine-data-model'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('get a library engine model', async () => {
    const query = `query {
      libraryEngineModel(
        id: "${newEngineModelId}"
      )  {
        id
        trainStatus
        dataUrl
        contentType
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'libraryEngineModel.id')).toEqual(newEngineModelId);
    expect(_.get(result, 'libraryEngineModel.trainStatus')).toEqual('complete');
    expect(_.get(result, 'libraryEngineModel.dataUrl')).toBeDefined();
    expect(_.get(result, 'libraryEngineModel.contentType')).toEqual(
      'application/octet-stream'
    );
  });

  it('update a library engine mode with a signedUri in our bucket', async () => {
    const query = `mutation {
      updateLibraryEngineModel(input: {
        id: "${newEngineModelId}"
        dataUrl: "${getSignedUrl}"
      })  {
        id
        dataUrl
      }
    }

    `;
    const result = await gqlClient.query(query);
    const records = result.updateLibraryEngineModel;
    const theId = records.id;
    const theUrl = records.dataUrl;
    expect(theId).toEqual(newEngineModelId);
    // note that URL will change after file is ingested and stored to S3
    expect(theUrl).toBeDefined();
  });

  it('create an entity', async () => {
    const query = `mutation {
      ent1: createEntity(input: {
        libraryId: "${newLibraryId}"
        name: "${citestMarker}-test entity ${appKey}"
        description: "test description"
        jsondata: {
          foo: "bar"
        }
        profileImageUrl: "${imageUrl}"
      })  {
        id
        name
        createdDateTime
        modifiedDateTime
        description
        jsondata
        profileImageUrl
      }
    }

    `;
    const result = await gqlClient.query(query);
    const newEntity = _.get(result, 'ent1');
    newEntityId = newEntity ? newEntity.id : null;
    expect(newEntityId).toBeDefined();
    expect(_.get(newEntity, 'jsondata.foo')).toEqual('bar');
    expect(newEntity.description).toEqual('test description');
    const url = newEntity.profileImageUrl;
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('profile'));
    expect(url).toEqual(expect.stringContaining('entity'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('create an entity - jsonstring', async () => {
    const query = `mutation {
      createEntity(input: {
        libraryId: "${newLibraryId}"
        name: "${citestMarker}-test entity ${appKey}-2"
        jsonstring: "{ \\\"foo\\\": \\\"bar\\\" }"
      })  {
        id
        name
        createdDateTime
        modifiedDateTime
        jsondata
        jsonstring
      }
    }

    `;
    const result = await gqlClient.query(query);
    expect(_.get(result, 'createEntity.id')).toBeDefined();
    expect(_.get(result, 'createEntity.jsondata.foo')).toEqual('bar');
  });

  it('find an entity by name', async () => {
    const query = `query {
      library(id: "${newLibraryId}") {
        id
        version
        entities(name: "test entity ${appKey}") {
          records {
            id
            name
          }
        }

        byId: entities(ids: ["${newEntityId}"]) {
          records {
            id
            name
          }
        }

        v1: engineModels(libraryVersion: 1) {
          count
        }
        current: engineModels(currentVersion: true) {
          count
        }
        complete: engineModels(trainStatus: complete) {
          count
        }
        queued: engineModels(trainStatus: queued) {
          count
        }
        latest: engineModels(lastModified:true ) {
           count
           records {
             id
             trainStatus
             libraryVersion
           }
        }
        # used by core-job-server
        engineIdComplete: engineModels (trainStatus: complete, engineId: "${libraryEngineModelEngineId}", limit: 1) {
          count
          records {
            engineId
            id
          }
        }
      }
    }

    `;
    const result = await gqlClient.query(query);
    const theEntId = _.get(result, 'library.entities.records[0].id');
    const theOtherEntId = _.get(result, 'library.byId.records[0].id');
    expect(theEntId).toEqual(newEntityId);

    expect(theOtherEntId).toEqual(newEntityId);

    expect(_.get(result, 'library.latest.count')).toEqual(1);

    expect(_.get(result, 'library.queued.count')).toEqual(0);

    expect(_.get(result, 'library.complete.count')).toEqual(1);

    expect(_.get(result, 'library.engineIdComplete.count')).toEqual(1);
  });

  it('update an entity', async () => {
    var records = null;

    var theId;
    var theDescription;
    var theJsondata;

    const query = `mutation {
      updateEntity(input: {
        id: "${newEntityId}"
        name: "${citestMarker}-test entity renamed"
        jsondata: {
          foo: "bar"
        }
        profileImageUrl: "${imageUrl}"
      })  {
        id

        name
        jsondata
        libraryId
        isPublished
        modifiedDateTime
        profileImageUrl
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.updateEntity;
    theId = records.id;
    theDescription = records.name;
    theJsondata = records.jsondata;

    expect(theId).toEqual(newEntityId);

    expect(theDescription).toEqual(citestMarker + '-test entity renamed');

    expect(_.get(theJsondata, 'foo')).toEqual('bar');

    const url = _.get(records, 'profileImageUrl');
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('entity'));
    expect(url).toEqual(expect.stringContaining('profile'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('create an entity identifier - no file', async () => {
    var records = null;
    var body;
    const query = `mutation {
      createEntityIdentifier(input: {
        entityId: "${newEntityId}"
        identifierTypeId: "${newEntityIdentifierTypeId}"
        contentType: "image/jpeg"

        url: "${imageUrl}"
        jsondata: {
          foo: "bar"
        }
        profileUpdateMode: ifNotSet
      })  {
        id
        url
        jsondata
        jsonstring
        entity {
          id
          profileImageUrl
        }
      }

      byReference: createEntityIdentifier(input: {
        entityId: "${newEntityId}"
        identifierTypeId: "${newEntityIdentifierTypeId}"
        contentType: "image/jpeg"
        storeReference: true
        url: "${imageUrl}"
        jsondata: {
          foo: "bar"
        }
        profileUpdateMode: none
      }) {
        id
      }
    }

    `;

    const result = await gqlClient.query(query);
    records = result.createEntityIdentifier;
    newEntityIdentifierId = records.id;

    expect(newEntityIdentifierId).toBeDefined();

    expect(_.get(result, 'createEntityIdentifier.jsondata.foo')).toEqual('bar');

    expect(
      _.get(result, 'createEntityIdentifier.entity.profileImageUrl')
    ).toBeDefined();
  });

  it('update an entity identifier - no file', async () => {
    const query = `mutation {
      updateEntityIdentifier(input: {
        id: "${newEntityIdentifierId}"
        title: "${citestMarker}-new test_name"
        url: "https://www.veritone.com/wp/wp-content/uploads/2017/05/veritoneregistered16.png"
        jsondata: {
          foo: "bar"
          contentType:"foo"
        }
      })  {
        id
        url
        jsondata
        jsonstring
      }
    }

    `;
    const result = await gqlClient.query(query);
    const records = result.updateEntityIdentifier;
    const theId = records.id;
    const theUrl = records.url;
    const theJsondata = records.jsondata;

    expect(theId).toEqual(newEntityIdentifierId);
    expect(theUrl).toEqual(
      'https://www.veritone.com/wp/wp-content/uploads/2017/05/veritoneregistered16.png'
    );
    expect(_.get(theJsondata, 'foo')).toEqual('bar');
  });
  it('create an entity identifier - with file', async () => {
    const query = `
mutation {
  createEntityIdentifier(input: {
    entityId: "${newEntityId}"
    identifierTypeId: "${newEntityIdentifierTypeId}"
    contentType: "image/jpeg"
    jsonstring: "{ \\\"foo\\\":\\\"bar\\\" }"
  }) {
    id
    url
    jsondata
    jsonstring
  }
}`;

    const result = await gqlClient.uploadFile(
      query,
      'wed2.jpeg',
      './citest/data/wed2.jpeg'
    );
    const postAssetId = result.createEntityIdentifier.id;
    expect(postAssetId).toBeDefined();
    expect(_.get(result, 'createEntityIdentifier.jsondata.foo')).toEqual('bar');
    const url = _.get(result, 'createEntityIdentifier.url');
    expect(url).toBeDefined();
    expect(url).toEqual(expect.stringContaining('entity-identifier'));
    const now = moment.utc();
    const dayStr = `${now.year()}/${now.month()}/${now.day()}`;
    expect(url).toEqual(expect.stringContaining(dayStr));
    expect(url).toEqual(expect.stringContaining(newLibraryId));
    expect(url).toEqual(expect.stringContaining(organizationId));
  });

  it('get entity and identifiers', async () => {
    const query = `query {

  entity(id: "${newEntityId}") {
    id
    profileImageUrl
    isPublished
    jsondata
    createdDateTime
    modifiedDateTime
    description
    libraryId
    library {
      id
      name
    }
    summary {
            identifierCountsByType
          }
    identifiers {
      records {
        id
        identifierType {
          id
          label
          labelPlural
          dataType
        }
        identifierTypeId
        isPriority
        url
        contentType
        jsondata
      }
    }
  }

  entityById: entities(ids: ["${newEntityId}"]) {
    records {
      id
    }
  }

  entities(libraryIds: ["${newLibraryId}"]) {
    records {
      id
    }
  }
}
        `;
    const result = await gqlClient.query(query);

    expect(result.entity.identifiers.records.length).toEqual(3);

    expect(result.entity.summary).toBeDefined();

    expect(result.entity.description).toEqual('test description');

    expect(result.entity.library).toBeDefined();
  });

  it('List libraries', async () => {
    const query = `query {
            libraries(limit: 1) {
             count
             records {
             	id
             	name
             	organizationId
              entities {
                records {
                  id
                  libraryId
                }
              }
              collaborators {
        records {
          libraryId
          organizationId
          status
          organization {
            id
            name
          }
        }
      }
               libraryType {
                 id
                 label
                 entityIdentifierTypes {
                   id
                   label
                 }
               }

             }
           }
}
        `;
    const result = await gqlClient.query(query);

    const records = result.libraries.records;

    expect(records).toHaveLength(1);

    expect(records[0].organizationId).toBeDefined();
  });

  it('Find library by library type', async () => {
    const query = `query {
            libraries(limit: 1, type:"people") {
             count
             records {
             	id
             	name
               summary {
                 entityCount
                 unpublishedEntityCount
                 lastTrainedVersion
                 lastTrainedDateTime
               }
               libraryType {
                 id
                 label
                 entityIdentifierTypes {
                   id
                   label
                 }
               }

             }
           }
}
        `;
    const result = await gqlClient.query(query);

    const records = result.libraries.records;

    expect(records).toHaveLength(1);

    expect(records[0].summary).toBeDefined();

    expect(records[0].libraryType.id).toEqual('people');
  });

  it('Find libraries by entity identifier type id', async () => {
    const query = `query {
            libraries(limit: 1, entityIdentifierTypeIds: ["face"]) {
             count
             records {
             	id
             	name
               libraryType {
                 id
                 label
                 entityIdentifierTypes {
                   id
                   label
                 }
               }

             }
           }
}
        `;
    const result = await gqlClient.query(query);

    const records = result.libraries.records;

    expect(records).toHaveLength(1);

    expect(records[0].libraryType.entityIdentifierTypes[0].id).toEqual('face');
  });

  it('List libraries big query', async () => {
    const query = `query {
 libraries(limit: 1) {
  records {
    engineModels {
      records {
        id
        jsondata
        trainStatus
        libraryId
        libraryVersion
        trainJobId
        createdDateTime
        modifiedDateTime
        dataUrl
        library {
          id
          name
        }
      }
    }
  }
}
}
        `;
    const result = await gqlClient.query(query);

    const records = result.libraries.records;
    expect(records).toHaveLength(1);
  });

  it('query library and entity', async () => {
    const query = `query {
 library(id: "${newLibraryId}") {
   id
   summary {
     entityCount
     unpublishedEntityCount
     lastTrainedVersion
     lastTrainedDateTime
   }
      entities(id:"${newEntityId}") {
        records {
          id
          name
          createdDateTime
          summary {
            identifierCountsByType
          }
          identifiers {
            records {
              id
              identifierTypeId
              identifierType {
                id
                label
              }
              url
              jsondata
              title
              contentType
            }
          }
        }
        offset
        limit
        count
      }
      libraryTypeId
      libraryType {
        id
        label
      }
    }
  }

        `;
    const result = await gqlClient.query(query);
    const records = result.library;
    expect(records.entities.records.length).toEqual(1);

    expect(records.entities.records[0].identifiers.records.length).toEqual(3);

    expect(records.summary).toBeDefined();

    expect(records.entities.records[0].summary).toBeDefined();

    expect(_.get(records, 'summary.entityCount')).toEqual(2);

    expect(_.get(records, 'summary.unpublishedEntityCount')).toEqual(2);
  });

  // FIXME: bad test
  it('Get library and sorted entities', async () => {
    const orderBy = 'createdDateTime';
    let createEntityQuery = `mutation {
      createEntity(input: {
        libraryId: "${newLibraryId}"
        name: "${citestMarker}-test entity ${appKey} 2"
      })  {
        id
        name
        createdDateTime
        modifiedDateTime
      }
    }

    `;
    let getLibraryAssetsQuery = `
    {
      library(id:"${newLibraryId}") {
        entities (orderBy: ${orderBy}, orderDirection: desc){
          records {
            id
            name
            ${orderBy}
          }
        }
      }
    }
    `;

    await gqlClient.query(createEntityQuery);
    const result2 = await gqlClient.query(getLibraryAssetsQuery);
    const records = result2.library.entities.records;
    expect(records.length).toBeGreaterThan(1);
  });

  it('delete an entity identifier', async () => {
    var records = null;

    var theId;
    const query = `mutation {
      deleteEntityIdentifier(id: "${newEntityIdentifierId}")  {
        id
        message
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.deleteEntityIdentifier;
    theId = records.id;
    expect(theId).toEqual(newEntityIdentifierId);
  });

  it('delete an entity', async () => {
    var records = null;

    var theId;
    const query = `mutation {
      deleteEntity(id: "${newEntityId}")  {
        id
        message
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.deleteEntity;
    theId = records.id;

    expect(theId).toEqual(newEntityId);
  });

  it('delete a library engine model', async () => {
    var records = null;

    var theId;
    const query = `mutation {
      deleteLibraryEngineModel(id: "${newEngineModelId}")  {
        id
        message
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.deleteLibraryEngineModel;
    theId = records.id;
    expect(theId).toEqual(newEngineModelId);
  });

  it('delete second library engine model', async () => {
    var records = null;

    var theId;
    const query = `mutation {
      deleteLibraryEngineModel(id: "${secondEngineModelId}")  {
        id
        message
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.deleteLibraryEngineModel;
    theId = records.id;

    expect(theId).toEqual(secondEngineModelId);
  });

  it('delete a library', async () => {
    var records = null;

    var theId;
    const query = `mutation {
      deleteLibrary(id: "${newLibraryId}")  {
        id
        message
      }
    }

    `;
    const result = await gqlClient.query(query);
    records = result.deleteLibrary;
    theId = records.id;
    expect(theId).toEqual(newLibraryId);
  });
});
