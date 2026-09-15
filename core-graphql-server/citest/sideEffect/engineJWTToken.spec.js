const helpers = require('../helpers/index');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;

const _ = require('lodash');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const citestMarker = global.citestMarker || 'citest-should-delete';

describe('Engine JWT Token', () => {
  let orgGuid, userId;
  let authGroupId, authPermissionSetId;

  let gqlClient;
  let hasRBACAuthModule = false;
  let useRBACFeature = false;
  let engineId;
  let tdoId, sourceId, sourceOwnerId;
  let jobId;
  let taskId;
  const variables = {
    resource: {}
  };
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();

    result = await gqlClient.query(`
      query {
        me {
          id
          name
          organization {
            id
            guid
            jsondata
          }
        }
    }`);

    expect(result.me).toBeDefined();
    useRBACFeature =
      _.get(result, 'me.organization.jsondata.features.enableRBACFeature') ===
      'enabled';
    orgGuid = _.get(result, 'me.organization.guid');
    userId = _.get(result, 'me.id');

    const introspectionQuery = await gqlClient.query(`
      {
        __type(name: "AuthPermissionSet") {
          name
        }
    }`);

    hasRBACAuthModule = _.has(introspectionQuery, '__type.name');
  });

  describe('Create a TDO and a job using TDO as target and including transcription engine', () => {
    it('should create a TDO into folder', async () => {
      // create a source first
      const createSourceQuery = `
        mutation {
          createSource(input: {
            sourceTypeId: 5
            name: "${citestMarker}-source-${uuid.v4()}"
            isPublic: true
          }) {
            id
            ownedBy
          }
        }
      `;
      const sourceResult = await gqlClient.query(createSourceQuery);
      if (sourceResult.errors) {
        console.log(JSON.stringify(sourceResult.errors, null, 2));
      }
      sourceId = _.get(sourceResult, 'createSource.id');
      sourceOwnerId = _.get(sourceResult, 'createSource.ownedBy');
      expect(sourceId).toBeDefined();
      expect(sourceOwnerId).toBeDefined();

      const curDateTime = Math.floor(Date.now() / 1000);
      var query = `mutation {
          createTDO(input: {
            status: "uploaded"
            isPublic: true
            startDateTime: ${curDateTime}
            stopDateTime: ${curDateTime + 300}
            sourceData: {
                sourceId: "${sourceId}"
            }
          }) {
            id
          }
        }`;

      const result = await gqlClient.query(query);

      expect(result.createTDO).toBeDefined();
      expect(result.createTDO.id).toBeDefined();

      tdoId = result.createTDO.id;
      variables.resource.tdoId = tdoId;
    });

    it('should get citest engine', async () => {
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

    it('should create a job', async () => {
      let query = `
        mutation {
          createJob(input: {
            targetId: "${tdoId}"
            skipDecider:true
            tasks: [{
              engineId: "${engineId}"
              payload: {
                engineReturnValue: true
              }
            }]
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

      expect(result.createJob).toBeDefined();
      expect(result.createJob.id).toBeDefined();
      expect(result.createJob.targetId).toEqual(tdoId);
      expect(result.createJob.tasks.records.length).toBeGreaterThan(0);
      expect(result.createJob.tasks.records[0].id).toBeDefined();
      expect(result.createJob.tasks.records[0].payload).toBeDefined();

      jobId = result.createJob.id;
      taskId = result.createJob.tasks.records[0].id;
      variables.resource.jobId = jobId;
      variables.resource.taskId = taskId;
    });
  });

  describe('Get engine JWT Token', () => {
    it('create auth group with a member (current user)', async () => {
      if (useRBACFeature) {
        const query = `
          mutation {
            authGroupCreate(input: {
              name: "${citestMarker}-auth-group-${uuid.v4()}"
              description: "desc"
              ownerOrganization: "${orgGuid}"
              members: {
                id: "${userId}",
                memberType: User
              }
            }) {
              id
              name
            }
          }
        `;

        const result = await gqlClient.query(query);
        expect(result.authGroupCreate.id).toBeDefined();
        authGroupId = _.get(result, 'authGroupCreate.id');
      }
    });

    it('create auth permission set', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
          authPermissionSetCreate(input: {
            name: "${citestMarker}-permission-test-${uuid.v4()}",
            description: "desc"
            permissions: [RECORDING_READ, CMS_ACCESS, CMS_MEDIA_READ]
          }){
            id
            permissions
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.authPermissionSetCreate.id).toBeDefined();
        expect(result.authPermissionSetCreate.permissions).toEqual(
          expect.arrayContaining([
            'RECORDING_READ',
            'CMS_ACCESS',
            'CMS_MEDIA_READ'
          ])
        );

        authPermissionSetId = result.authPermissionSetCreate.id;
      }
    });

    it('add ACEs to resources', async () => {
      if (useRBACFeature) {
        const query = `mutation  {
          addACEsToResources(
            ids:["test-ACE-${uuid.v4()}", "test-ACE-${uuid.v4()}"], 
            resourceType: TDO
            entries: [{
              member: {id: "${authGroupId}", memberType: Group}, 
              permissionSetID: "${authPermissionSetId}"}
            ]) {
            records {
              id
              objectType
              permissionSet {
                id
              }
              objectType
            }
          }
        }`;

        const result = await gqlClient.query(query);
        expect(result.addACEsToResources.records.length).toEqual(2);
        expect(result.addACEsToResources.records[1].permissionSet.id).toEqual(
          authPermissionSetId
        );
      }
    });

    it('should get an engine JWT token', async () => {
      const query = `
        mutation getEngineJWT($resource: GetEngineJWTResource!) {
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
        }
      `;

      const result = await gqlClient.query(query, variables);
      const getEngineJWT = _.get(result, 'getEngineJWT');

      expect(getEngineJWT.token).toBeDefined();
      let decodeToken = jwt.decode(getEngineJWT.token);
      expect(_.get(decodeToken, 'scope[0].resources.recordingIds[0]')).toEqual(
        variables.resource.tdoId
      );
      expect(_.get(decodeToken, 'scope[1].resources.jobIds[0]')).toEqual(
        variables.resource.jobId
      );
      expect(_.get(decodeToken, 'scope[1].resources.taskIds[0]')).toEqual(
        variables.resource.taskId
      );
      expect(_.get(decodeToken, 'scope[1].resources.sourceIds[0]')).toEqual(
        sourceId
      );
      expect(_.get(decodeToken, 'userId')).toEqual(
          userId
      );

      if (useRBACFeature) {
        expect(decodeToken.authGroups).toEqual(expect.any(Array));
      }
    });
  });

  it('should delete TDO', async () => {
    var query = `mutation {
        deleteTDO(id: "${tdoId}") {
            id
        }
      }`;

    const result = await gqlClient.query(query);
  });

  it('should delete source', async () => {
    var query = `mutation {
        deleteSource(id: "${sourceId}") {
            id
        }
      }`;

    const result = await gqlClient.query(query);
  });
});
