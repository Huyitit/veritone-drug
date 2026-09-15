const _ = require('lodash');
const helpers = require('../helpers/index.js');
const GraphqlClient = require('../helpers/gql.js');

const config = helpers.config;

// GLC-1673
describe('debug engine not found after created', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  it('try to duplicate', async () => {
    for (let i = 0; i < 10; ++i) {
      await createThenQueryEngine();
    }
  });

  async function createThenQueryEngine() {
    const createEngineQuery = `
    mutation($newEngineJson: CreateEngine!) {
      createEngine(input: $newEngineJson) {
        id
        name
        createdDateTime
        manifest
      }
    }`;

    const variables = {
      newEngineJson: {
        name: 'citest Untitled Flow',
        description: '',
        categoryId: 'c5458876-43d2-41e8-a340-f734702df04a',
        deploymentModel: 'NonNetworkIsolated',
        manifest: {
          runtime: 'nodeRed',
          engineMode: 'chunk',
          supportedInputTypes: ['application/json']
        }
      }
    };
    const engineRes = await gqlClient.query(createEngineQuery, variables);

    const createBuildQuery = `
    mutation($engineId: ID!, $manifest: JSONData, $taskRuntime: JSONData,
      $dockerImage: String, $JWTRights:JWTRightsField){
        createEngineBuild(input: {
          engineId: $engineId
          manifest: $manifest
          taskRuntime: $taskRuntime
          dockerImage: $dockerImage
        }){
          engineId
          id    
        }
        updateEngine(input: {
          id: $engineId
          jwtRights: $JWTRights}){
          name
          id
          jwtRights
        } 
      }
    `;
    const buildVarialbes = {
      engineId: `${engineRes.createEngine.id}`,
      manifest: {
        runtime: 'nodeRed',
        engineId: `${engineRes.createEngine.id}`,
        engineMode: 'chunk'
      },
      JWTRights: {
        roles: [
          {
            roleName: 'workflow',
            taskRights: [
              'job:create',
              'job:read',
              'job:update',
              'job:delete',
              'recording:create',
              'recording:read',
              'recording:update',
              'recording:delete',
              'mentions:create',
              'mentions:read',
              'mentions:update',
              'mentions:delete',
              'collection:create',
              'collection:read',
              'collection:update',
              'collection:delete',
              'asset:uri',
              'asset:all',
              'task:update',
              'report:create',
              'analytics:usage'
            ],
            assetRights: ['recording:update']
          }
        ]
      },
      taskRuntime: { edge: {}, nodeRed: { flows: [], package: {} } },
      dockerImage: 'registry.central.aiware.com/node-red-runner-v3:stable'
    };
    const buildRes = await gqlClient.query(createBuildQuery, buildVarialbes);

    const engineQuery = ` query {
        engine(id: "${engineRes.createEngine.id}") {  
          builds(id: "${buildRes.createEngineBuild.id}") {
            records {  
              status
            }      
          }   
        }  
      }
     `;

    const res = await gqlClient.query(engineQuery);
    const builds = _.get(res, 'engine.builds.records');
    expect(builds).toBeDefined();
    expect(builds[0].status).toBeDefined();
    await deleteEngine(engineRes.createEngine.id);
  }

  async function deleteEngine(engineId) {
    const deleteQuery = `mutation($engineId: ID!) {
      deleteEngine(id: $engineId) {
        id
        message
      }
    }`;

    const variables = {
      engineId: engineId
    };

    const res = await gqlClient.query(deleteQuery, variables);
    const deletedEngineId = _.get(res, 'deleteEngine.id');
    expect(deletedEngineId).toEqual(engineId);
  }
});
