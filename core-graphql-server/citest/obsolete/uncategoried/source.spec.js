const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const config = helpers.config;

const env = config.env;
const uuid = require('uuid');
const _ = require('lodash');
const s3 = require('../../../modules/core-job-server/bll/s3');
const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '-' + Date.now();

const authUrl = `https://api.${env}.veritone.com/v1`;
const url = config.graphql_url || authUrl;
const thumbnailUrl = 'https://veritone.com/test.jpg';

const correlationSDOId = uuid.v4();
const correlationSchemaId = uuid.v4();
let organizationId;
const citestOrgName = citestMarker + '-org-7e59cb5b2f52c763bc846471fe5942e4';
let citestOrg_1, citestOrg_2;
let apiToken;
let schemaCreated;

describe('citest_source: Source and source type tests', () => {
  let options;
  let sourceId;

  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    apiToken = result.apiToken;
    expect(result.token).toBeDefined();
    organizationId = _.get(result, 'organizationId');
    const citestOrgQuery = `query {
      organizations(name: "${citestOrgName}") {
        records {
          id
        }
      }
    }
    `;
    const citestOrgsResult = await gqlClient.query(citestOrgQuery);
    if (_.get(citestOrgsResult, 'organizations.records').length) {
      [citestOrg_1, citestOrg_2] = _.get(
        citestOrgsResult,
        'organizations.records'
      );
      citestOrg_1;
      citestOrg_2;
    } else {
      const createCitestOrgs = `mutation {
        citestOrg_1: createOrganization(input: {
          name: "${citestOrgName}-1"
          metadata: {}
          businessUnit: "citest"
        }) {
          id
        }
        citestOrg_2: createOrganization(input: {
          name: "${citestOrgName}-2"
          metadata: {}
          businessUnit: "citest"
        }) {
          id
        }
      }`;
      const citestOrgsResult = await gqlClient.query(createCitestOrgs);
      citestOrg_1 = _.get(citestOrgsResult, 'citestOrg_1');
      citestOrg_2 = _.get(citestOrgsResult, 'citestOrg_2');
    }
  });

  afterAll(async () => {
    const query = `mutation {
        updateSchemaState(input: {
          id:"${schemaCreated.createDatasetSchema.schema.id}",
          status: deleted,
          breakingChanges: false
        }) {
          id
          status
          createdDateTime
          modifiedDateTime
          validActions
        }
      }`;
    const result = await gqlClient.query(query);
    expect(
      _.get(result.updateSchemaState.id),
      schemaCreated.createDatasetSchema.schema.id
    );
    expect(_.get(result.updateSchemaState.status), 'deleted');
  });

  it('find source types', async () => {
    var query = `query {
        id18: sourceType(id: 18) {
          categoryId
          category {
            id
            name
          }
          supportedRunModes
        }
        id11: sourceType(id: 11) {
          categoryId
          category {
            id
            name
          }
        }
        sourceType(id: 5) {
           id
           name
           sourceSchemaId
           sourceSchema {
             id
             definition
             status
           }
           iconClass
           isLive
           requiresScanPipeline
           supportedRunModes
         }
       	sourceTypes(limit: 5) {
           records {
             id
             sourceSchemaId
             sourceSchema {
               id
               definition
               status
             }
             name
             isLive
             requiresScanPipeline
             supportedRunModes
             categoryId
             category {
               id
               name
             }
           }
         }

         sourceTypeCategories {
           records {
             id
             name
           }
         }
         sourceTypeCategory(id: 1) {
           id
           name
         }
      }
          `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'id18.categoryId')).toEqual('3');
    expect(_.get(result, 'id18.category.id')).toEqual('3');
    expect(_.get(result, 'id18.category.name')).toBeDefined();
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.not.arrayContaining(['Now'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Once'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Recurring'])
    );
    expect(_.get(result, 'id18.supportedRunModes')).toEqual(
      expect.arrayContaining(['Continuous'])
    );

    expect(_.get(result, 'id11.categoryId')).toEqual('5');
    expect(_.get(result, 'id11.category.id')).toEqual('5');
    expect(_.get(result, 'id11.category.name')).toBeDefined();

    expect(_.get(result, 'sourceTypeCategories.records[0].id')).toBeDefined();
    expect(_.get(result, 'sourceTypeCategories.records[0].name')).toBeDefined();
    expect(_.get(result, 'sourceTypeCategory.id')).toEqual('1');
    expect(_.get(result, 'sourceTypeCategory.name')).toBeDefined();

    expect(_.get(result, 'sourceType.id')).toEqual('5');
    expect(_.get(result, 'sourceType.name')).toEqual('General');
    expect(_.get(result, 'sourceType.iconClass')).toBeDefined();
    expect(_.get(result, 'sourceType.supportedRunModes')).toEqual(
      expect.arrayContaining(['Now'])
    );
    // should be at least 5 source types
    expect(_.get(result, 'sourceTypes.records[4]')).toBeDefined();
  });

  it('should create a source', async () => {
    const query = `
mutation {
  createSource1: createSource(input: {

    sourceTypeId: 5
    name: "${testName}-test2"
    collaborators: []
  }) {
    id
  }
  createSource(input: {
    sourceTypeId: 5
    name: "${testName}"
    isPublic:true
    details: {
      liveTimezone: "PST"
      foo: "bar"
      sourceFormat: "Miscellaneous"
      marketIds: [24, 13]
      networkIds: [70, 32]
    }
    thumbnailUrl: "${thumbnailUrl}"
    correlationSDOId: "${correlationSDOId}",
    correlationSchemaId: "${correlationSchemaId}"
    collaborators: [
      {
        organizationId: ${organizationId}
        permission: viewer
      }
    ]
    state: {
      foo: "bar"
    }
  }) {
    id
    name
    isPublic
    details
    thumbnailUrl
    sourceTypeId
    sourceType {
      id
      name
    }
    organizationId
    organization {
      id
      name
    }
    details
    correlationSDOId
    correlationSchemaId
    permission
    collaborators (orderBy: permission orderDirection: asc){
      records {
        organizationId
        permission
      }
    }
    state
    createdBy
    updatedBy
    ownedBy
  }
}
            `;
    const result = await gqlClient.query(query);

    sourceId = _.get(result, 'createSource.id');
    expect(sourceId).toBeDefined();
    expect(_.get(result, 'createSource.sourceTypeId')).toEqual('5');
    expect(_.get(result, 'createSource.thumbnailUrl')).toEqual(thumbnailUrl);
    expect(_.get(result, 'createSource.name')).toEqual(testName);
    expect(_.get(result, 'createSource.organizationId')).toBeDefined();
    expect(_.get(result, 'createSource.organization.id')).toBeDefined();
    expect(_.get(result, 'createSource.organization.name')).toBeDefined();
    expect(_.get(result, 'createSource.isPublic')).toEqual(true);
    expect(_.get(result, 'createSource.details.liveTimezone')).toEqual('PST');
    expect(_.get(result, 'createSource.details.foo')).toEqual('bar');
    expect(_.get(result, 'createSource.correlationSchemaId')).toEqual(
      correlationSchemaId
    );
    expect(_.get(result, 'createSource.correlationSDOId')).toEqual(
      correlationSDOId
    );
    expect(_.get(result, 'createSource.permission')).toEqual('owner');
    expect(
      _.get(result, 'createSource.collaborators.records[0].permission')
    ).toEqual('owner');
    expect(
      _.get(result, 'createSource.collaborators.records[1].permission')
    ).toEqual('viewer');
    expect(_.get(result, 'createSource.state.foo')).toEqual('bar');
    expect(_.get(result, 'createSource.details.sourceFormat')).toEqual(
      'Miscellaneous'
    );
    expect(
      JSON.stringify(_.get(result, 'createSource.details.marketIds'))
    ).toEqual('[13,24]');
    expect(
      JSON.stringify(_.get(result, 'createSource.details.networkIds'))
    ).toEqual('[32,70]');
    expect(_.get(result, 'createSource.createdBy')).toBeDefined();
    expect(_.get(result, 'createSource.updatedBy')).toBeDefined();
    expect(_.get(result, 'createSource.ownedBy')).toBeDefined();
  });

  it('should update a source', async () => {
    const schemaNameIdentifier = uuid.v4();
    const newSDOId = uuid.v4();
    // a new schema needs to exist before to be added in updateSource mutation
    const createDatasetSchemaQuery = `mutation {
      createDatasetSchema(
        input: {
          name: "${citestMarker}-schema-${schemaNameIdentifier}"
          description: "schema citest description"
          schema: {
            properties: {
              liveTimezone: {
                type: "string",
                required: true
              },
              foo: {
                type: "string",
                required: true
              },
              sourceFormat: {
                type: "string",
                required: true
              },
              marketIds: {
                type: "array",
                required: true
              },
              networkIds: {
                type: "array",
                required: true
              }
            }
          }
          tags: []
        }
      ) {
        datasetId
        name
        description
        tags {
          name
          value
        }
        schema {
          id
          dataRegistryId
          definition
        }
      }
    }`;
    schemaCreated = await gqlClient.query(createDatasetSchemaQuery);

    const newUrl = thumbnailUrl.replace('ver', 'ver2');
    const query = `
  mutation {
    updateSource(input: {
      id: "${sourceId}"
      name: "${testName}-2"
      isPublic: false
      details: {
        liveTimezone: "EST"
        foo: "bar2"
        sourceFormat: "Classical"
        marketIds: [53, 13, 24]
        networkIds: [70, 32, 39]
      }
      thumbnailUrl: "${newUrl}"
      correlationSDOId: "${newSDOId}",
      correlationSchemaId: "${schemaCreated.createDatasetSchema.schema.id}"
      collaborators: [
        {
          organizationId: ${citestOrg_1.id}
          permission: viewer
        }, {
          organizationId: ${organizationId}
          permission: editor
        }, {
          organizationId: ${citestOrg_2.id}
          permission: none
        }
      ]
      state: {
        foo: "baz"
      }
    }) {
      id
      name
      isPublic
      details
      thumbnailUrl
      sourceTypeId
      sourceType {
        id
        name
      }
      organizationId
      organization {
        id
        name
      }
      details
      correlationSDOId
      correlationSchemaId
      permission
      collaborators(orderBy: permission orderDirection: asc) {
        records {
          organizationId
          permission
        }
      }
      state
      createdBy
      updatedBy
      ownedBy
    }
  }
              `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'updateSource.id')).toEqual(sourceId);
    expect(_.get(result, 'updateSource.sourceTypeId')).toEqual('5');
    expect(_.get(result, 'updateSource.thumbnailUrl')).toEqual(newUrl);

    expect(_.get(result, 'updateSource.name')).toEqual(testName + '-2');
    expect(_.get(result, 'updateSource.organizationId')).toBeDefined();
    expect(_.get(result, 'updateSource.isPublic')).toEqual(false);
    expect(_.get(result, 'updateSource.details.liveTimezone')).toEqual('EST');
    expect(_.get(result, 'updateSource.details.foo')).toEqual('bar2');

    expect(_.get(result, 'updateSource.correlationSchemaId')).toEqual(
      schemaCreated.createDatasetSchema.schema.id
    );
    // a new sdo is created, its id will be the same that the old one
    expect(_.get(result, 'updateSource.correlationSDOId')).toEqual(
      correlationSDOId
    );
    // created source has 2 collaborators: citest user org as owner and viewer
    // update op sets 2 more, thus the number of records should be 4, not 3
    expect(_.get(result, 'updateSource.collaborators.records')).toHaveLength(4);
    expect(_.get(result, 'updateSource.state.foo')).toEqual('baz');
    expect(_.get(result, 'updateSource.details.sourceFormat')).toEqual(
      'Classical'
    );
    expect(
      JSON.stringify(_.get(result, 'updateSource.details.marketIds'))
    ).toEqual('[13,24,53]');
    expect(
      JSON.stringify(_.get(result, 'updateSource.details.networkIds'))
    ).toEqual('[32,39,70]');
    expect(_.get(result, 'updateSource.createdBy')).toBeDefined();
    expect(_.get(result, 'updateSource.updatedBy')).toBeDefined();
    expect(_.get(result, 'updateSource.ownedBy')).toBeDefined();
  });

  it('should get a source', async () => {
    const query = `
  query {
    source(id: "${sourceId}") {
      id
      details
      thumbnailUrl
      details
      permission
      createdBy
      updatedBy
      ownedBy
      collaborators (orderBy:
        permission
        orderDirection: asc
      ){
        records {
          organizationId
          permission
        }
      }
    }
  }
              `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'source.id')).toEqual(sourceId);
    expect(_.get(result, 'source.createdBy')).toBeDefined();
    expect(_.get(result, 'source.updatedBy')).toBeDefined();
    expect(_.get(result, 'source.ownedBy')).toBeDefined();
    expect(_.get(result, 'source.collaborators.records')).toHaveLength(4);
  });
  it('should get a source - API token', async () => {
    const query = `
  query {
    source(id: "${sourceId}") {
      id
      details
      thumbnailUrl
      details
      permission
    }
  }
              `;
    // in ai13s we cannot expect test token to belong to the same org as the citest user
    const tokenAuth =
      config.env === 'ai13s' ? { Authorization: `Bearer ${apiToken}` } : true;
    const result = await gqlClient.query(query, null, tokenAuth);

    expect(_.get(result, 'source.id')).toEqual(sourceId);
    expect(_.get(result, 'source.permission')).toEqual('owner');
  });

  //FIXME: needs more validation
  it('should get sources', async () => {
    const query = `
  query {
    sources(
      name: "source"
      nameMatch: endsWith
      orderBy: [
      {
        field: sourceTypeId,
        direction: asc
      }, {
        field: name,
        direction: asc
      }, {
        field: createdDateTime
        direction: desc
      }, {
        field: modifiedDateTime
        direction: desc
      }, {
        field: id
        direction: asc
      }
    ]) {
      records {
      id
      details
      thumbnailUrl
      details
      permission
    }
    count
    }
  }
              `;
    await gqlClient.query(query);
  });

  it('should delete a source', async () => {
    const query = `
  mutation {
    deleteSource(id: "${sourceId}") {
      id
      message
    }
  }
              `;
    const result = await gqlClient.query(query);

    expect(_.get(result, 'deleteSource.id')).toEqual(sourceId);
    expect(_.get(result, 'deleteSource.message')).toBeDefined();
  });

  describe('source storage tests', () => {
    let s3SourceID;
    it('should create a source', async () => {
      const query = /* GraphQL */ `
  mutation {
    createSource: createSource(input: {
      sourceTypeId: 5
      name: "${testName}-storage"
      isPublic: false
      collaborators: [
        {
          organizationId: ${organizationId}
          permission: viewer
        }
      ]
      storageConfig: {
        type: aws_s3
        bucket: "test-bucket"
        signedUrlExpiresInSeconds: 3600,
        region: "us-west-2",
        credentials: {
          roleArn: "arn:aws:iam::123456789012:role/role-name"
        }
      }
    }) {
      id
      state
    }
  }
              `;
      const result = await gqlClient.query(query);
      s3SourceID = _.get(result, 'createSource.id');
      expect(s3SourceID).toBeDefined();
    });

    it('should update a source with new storage config', async () => {
      const query = /* GraphQL */ `
    mutation {
      updateSource(input: {
        id: "${s3SourceID}"
        storageConfig: {
          type: aws_s3
          bucket: "test-bucket2"
          keyPrefix: "test-folder"
          signedUrlExpiresInSeconds: 120,
          credentials: {
            accessKeyId: "access-key_test"
            secretAccessKey: "secret-key_test"
          }
        }
      }) {
        id
      }
    }`;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'updateSource.id')).toEqual(s3SourceID);
    });

    it('should get the source using storage config filter', async () => {
      const query = `
    query {
      sources(storageConfigFilter: {
        type: aws_s3
        bucket: "test-bucket2"
        key: "test-folder"
      }) {
        records {
          id
        }
      }
    }
                `;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'sources.records.length')).toEqual(1);
      expect(_.get(result, 'sources.records[0].id')).toEqual(s3SourceID);
    });

    it('should get the source using storage config filter url', async () => {
      const query = /* GraphQL */ `
        query {
          sources(
            storageConfigFilter: {
              type: aws_s3
              url: "https://s3.amazonaws.com/test-bucket2/test-folder/test.jpg"
            }
          ) {
            records {
              id
            }
          }
        }
      `;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'sources.records.length')).toEqual(1);
      expect(_.get(result, 'sources.records[0].id')).toEqual(s3SourceID);
    });

    it('should get a signed url from source', async () => {
      const query = `
    query {
      source(id: "${s3SourceID}") {
        id
        getStorageSignedUrl(input: {
          access: GET,
          key: "test.jpg"
          expiresInSeconds: 100
        }) {
          url
          expiresInSeconds
          access
        }
      }
    }`;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'source.id')).toEqual(s3SourceID);
      expect(_.get(result, 'source.getStorageSignedUrl.access')).toEqual('GET');
      expect(
        _.get(result, 'source.getStorageSignedUrl.expiresInSeconds')
      ).toEqual(100);
      expect(_.get(result, 'source.getStorageSignedUrl.url', '')).toEqual(
        expect.stringContaining(
          'https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=access-key_test'
        )
      );
    });

    it('should get a signed url from source', async () => {
      const query = `
    query {
      source(id: "${s3SourceID}") {
        id
        getStorageSignedUrl(input: {
          access: PUT,
          url: "https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg",
          expiresInSeconds: 12200
        }) {
          url
          expiresInSeconds
          access
        }
      }
    }`;
      const result = await gqlClient.query(query);
      expect(_.get(result, 'source.id')).toEqual(s3SourceID);
      expect(_.get(result, 'source.getStorageSignedUrl.access')).toEqual('PUT');
      expect(
        _.get(result, 'source.getStorageSignedUrl.expiresInSeconds')
      ).toEqual(120);
      expect(_.get(result, 'source.getStorageSignedUrl.url', '')).toEqual(
        expect.stringContaining(
          'https://test-bucket2.s3.us-west-2.amazonaws.com/test-folder/test.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=access-key_test'
        )
      );
    });

    afterAll(async () => {
      if (s3SourceID) {
        const query = `
        mutation {
          deleteSource(id: "${s3SourceID}") {
            id
            message
          }
        }`;
        const result = await gqlClient.query(query);
        expect(_.get(result, 'deleteSource.id')).toEqual(s3SourceID);
        expect(_.get(result, 'deleteSource.message')).toBeDefined();
      }
    });
  });

  describe('Engine JWT source operations', () => {
    let engineId;
    let buildId;
    let engineJwtToken;
    let engineSourceId;
    let jobId;

    beforeAll(async () => {
      const engineRights = {
        roles: [
          {
            roleName: 'adapter',
            taskRights: [
              'job:create',
              'job.read',
              'cms.access',
              'cms.sources.read',
              'cms.sources.update',
              'superadmin',
              'aiware.superadmin'
            ],
            assetRights: [
              'recording:create',
              'recording:update'
            ]
          }
        ]
      };

      const createEngineMutation = `mutation($input: CreateEngine!) {
        createEngine(input: $input) {
          id
          name
          isPublic
        }
      }`;

      const createEngineVariables = {
        input: {
          name: `engine-jwt-test-${uuid.v4()}`,
          categoryId: '4be1a1b2-653d-4eaa-ba18-747a265305d8',
          deploymentModel: 'FullyNetworkIsolated',
          isPublic: false,
          jwtRights: engineRights
        }
      };

      let result = await gqlClient.query(createEngineMutation, createEngineVariables);
      expect(result.createEngine).toBeDefined();
      engineId = result.createEngine.id;

      const createBuildMutation = `mutation($input: CreateBuild!) {
        createEngineBuild(input: $input) {
          id
          status
        }
      }`;

      const createBuildVariables = {
        input: {
          engineId: engineId,
          taskRuntime: {
            nodeRed: true
          },
          manifest: {
            runtime: 'NodeRed'
          }
        }
      };

      result = await gqlClient.query(createBuildMutation, createBuildVariables);
      expect(result.createEngineBuild).toBeDefined();
      buildId = result.createEngineBuild.id;

      const submitBuildMutation = `mutation($input: UpdateBuild!) {
        updateEngineBuild(input: $input) {
          id
          status
        }
      }`;

      const submitBuildVariables = {
        input: {
          id: buildId,
          engineId: engineId,
          action: 'submit'
        }
      };

      result = await gqlClient.query(submitBuildMutation, submitBuildVariables);
      expect(result.updateEngineBuild).toBeDefined();

      const deployBuildVariables = {
        input: {
          id: buildId,
          engineId: engineId,
          action: 'deploy'
        }
      };

      result = await gqlClient.query(submitBuildMutation, deployBuildVariables);
      expect(result.updateEngineBuild).toBeDefined();
      expect(result.updateEngineBuild.status).toEqual('deployed');

      const createJobMutation = `mutation($input: CreateJob!) {
        createJob(input: $input) {
          id
        }
      }`;

      const createJobVariables = {
        input: {
          name: 'engine-jwt-test-job',
          tasks: [
            {
              engineId: engineId
            }
          ]
        }
      };

      result = await gqlClient.query(createJobMutation, createJobVariables);
      expect(result.createJob).toBeDefined();
      jobId = result.createJob.id;

      const jwtMutation = `
        mutation getEngineJWT($resource: GetEngineJWTResource!) {
          getEngineJWT(input: {
            engineId: "${engineId}"
            resource: $resource
          }) {
            token
          }
        }
      `;

      const jwtResult = await gqlClient.query(jwtMutation, {
        resource: {
          jobId: jobId
        }
      });

      engineJwtToken = _.get(jwtResult, 'getEngineJWT.token');
      expect(engineJwtToken).toBeDefined();
    });

    it('should create a source with an engine JWT', async () => {
      const sourceName = `${citestMarker}-engine-source-${uuid.v4()}`;
      const query = `
        mutation {
          createSource(input: {
            name: "${sourceName}"
            sourceTypeId: "5"
            isPublic: true
          }) {
            id
            name
            sourceTypeId
            createdBy
            updatedBy
            ownedBy
          }
        }
      `;

      const result = await gqlClient.query(query, null, {
        headers: {
          Authorization: `Bearer ${engineJwtToken}`
        }
      });

      engineSourceId = _.get(result, 'createSource.id');
      expect(engineSourceId).toBeDefined();
      expect(_.get(result, 'createSource.name')).toEqual(sourceName);
      expect(_.get(result, 'createSource.sourceTypeId')).toEqual('5');
      expect(_.get(result, 'createSource.createdBy')).toBeDefined();
      expect(_.get(result, 'createSource.updatedBy')).toBeDefined();
      expect(_.get(result, 'createSource.ownedBy')).toBeDefined();
      expect(_.get(result, 'createSource.createdBy')).toEqual(_.get(result, 'createSource.updatedBy'));
      expect(_.get(result, 'createSource.createdBy')).toEqual(_.get(result, 'createSource.ownedBy'));
    });

    it('should update a source with an engine JWT', async () => {
      const updatedName = `${citestMarker}-updated-engine-source-${uuid.v4()}`;
      const query = `
        mutation {
          updateSource(input: {
            id: "${engineSourceId}"
            name: "${updatedName}"
          }) {
            id
            name
          }
        }
      `;

      const result = await gqlClient.query(query, null, {
        headers: {
          Authorization: `Bearer ${engineJwtToken}`
        }
      });

      expect(_.get(result, 'updateSource.id')).toEqual(engineSourceId);
      expect(_.get(result, 'updateSource.name')).toEqual(updatedName);
    });

    afterAll(async () => {
      if (engineSourceId) {
        try {
          const query = `
            mutation {
              deleteSource(id: "${engineSourceId}") {
                id
              }
            }
          `;
          await gqlClient.query(query);
        } catch (err) {
          console.warn('Failed to delete engine source:', err.message);
        }
      }
      if (jobId) {
        try {
          const query = `
            mutation {
              cancelJob(id: "${jobId}") {
                id
              }
            }
          `;
          await gqlClient.query(query);
        } catch (err) {
          console.warn('Failed to cancel test job:', err.message);
        }
      }
      if (engineId) {
        try {
          const query = `
            mutation($id: ID!) {
              deleteEngine(id: $id) {
                id
                message
              }
            }
          `;
          await gqlClient.query(query, { id: engineId });
        } catch (err) {
          console.warn('Failed to delete test engine:', err.message);
        }
      }
    });
  });
});
