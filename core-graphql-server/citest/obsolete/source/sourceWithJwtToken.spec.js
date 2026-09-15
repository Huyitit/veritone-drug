const helpers = require('../helpers/index');
const orgHelpers = require('../helpers/organization');
const userHelpers = require('../helpers/user');
const dataRegistyHelpers = require('../helpers/dataRegistry');
const schemaHelpers = require('../helpers/schema');
const sdoHelpers = require('../helpers/sdo');
const folderHelpers = require('../helpers/folder');
const engineHelpers = require('../helpers/engine');
const jobHelpers = require('../helpers/job');
const sourceHelpers = require('../helpers/sourceHelper');
const GraphqlClient = require('../helpers/gql');
const chakram = require('chakram');
const config = helpers.config;
const _ = require('lodash');
const uuid = require('uuid');
const role = require('../../dal/role');

const citestMarker = global.citestMarker || 'citest-should-delete';
let gqlClient;

const engineId = '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255';
const testPassword = 'testUserPassword';

const testSchemaInput = {
  $id: 'http://example.com/example.json',
  type: 'object',
  definitions: {},
  $schema: 'http://json-schema.org/draft-07/schema#',
  properties: {
    name: {
      type: 'string',
      title: 'Name'
    },
    phone: {
      type: 'string',
      title: 'Phone'
    }
  }
};

describe('citest_jobs: source data citest with jwt token', () => {
  let superAdminOptions, superToken;
  let dataRegistryId, schemaId;
  let engineCategoryId;
  let jwtToken, jwtTokenOptions;
  let userToken, userOptions;
  let orgData, userData, jobData;
  let userSourceId, jwtSourceId;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    let result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
    superToken = result.token;
    superAdminOptions = helpers.requestOptions(superToken);
  });

  afterAll(async () => {
    // delete source
    if (userSourceId) {
      await sourceHelpers.helpDeleteSource(
        { gqlClient, options: userOptions },
        userSourceId
      );
    }

    if (jwtSourceId) {
      await sourceHelpers.helpDeleteSource(
        { gqlClient, options: jwtTokenOptions },
        jwtSourceId
      );
    }

    // delete job
    if (jobData && jobData.id) {
      await jobHelpers.helpCancelJob(
        { gqlClient, options: userOptions },
        { jobId: jobData.id }
      );
    }

    if (userData && userData.id) {
      await userHelpers.deleteUser(
        { gqlClient, options: superAdminOptions },
        userData.id
      );
    }

    if (orgData && orgData.id) {
      await orgHelpers.deleteOrganization(
        { gqlClient, options: superAdminOptions },
        orgData.id
      );
    }
  });

  it('create new org', async () => {
    orgData = await orgHelpers.createTestOrganization(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-org-${uuid.v4()}`,
        businessUnit: 'Legal',
        kvp: {
          test: 'value',
          billing: {
            pausedProcessing: false
          }
        },
        applications: [
          {
            applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
            applicationKey: 'cms'
          },
          {
            applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
            applicationKey: 'discovery'
          }
        ]
      }
    );
    expect(orgData).toBeDefined();
    expect(orgData.id).toBeDefined();
    expect(orgData.guid).toBeDefined();
    expect(orgData.name).toContain(`${citestMarker}-org-`);
  });

  it('create non admin user for org', async () => {
    userData = await userHelpers.helpCreateUser(
      { gqlClient, options: superAdminOptions },
      {
        name: `${citestMarker}-user-${uuid.v4()}`,
        organizationId: orgData.id,
        password: testPassword,
        orgId: orgData.id,
        roleIds: ['cf2ed945-176b-4dd9-943e-22fcb1cf684f']
      }
    );

    expect(userData).toBeDefined();
    expect(userData.id).toBeDefined();
    expect(userData.name).toContain(`${citestMarker}-user-`);
    const userId = userData.id;

    const loginResult = await userHelpers.loginUser(
      { gqlClient, options: superAdminOptions },
      {
        userName: userData.name,
        password: testPassword
      }
    );

    expect(loginResult).toBeDefined();
    expect(loginResult.token).toBeDefined();
    userToken = loginResult.token;
    userOptions = helpers.requestOptions(userToken);
  });

  it('create job with engine', async () => {
    const query = `mutation createJob{
        createJob(input: {
          name: "${citestMarker}-job-${uuid.v4()}",
          tasks: [{engineId: "${engineId}"}]
        }) {
          id
        }
      }`;
    const result = await gqlClient.query(query, {}, userOptions);

    expect(result).toBeDefined();
    expect(result.createJob).toBeDefined();
    expect(result.createJob.id).toBeDefined();
    jobData = result.createJob;
  });

  it('user create source', async () => {
    const createSourceResult = await sourceHelpers.helpCreateSource(
      { gqlClient, options: userOptions },
      {
        sourceTypeId: 1,
        name: `${citestMarker}-source-${uuid.v4()}`
      }
    );

    expect(createSourceResult).toBeDefined();
    expect(createSourceResult.id).toBeDefined();
    userSourceId = createSourceResult.id;
  });

  it('generate engine JWT', async () => {
    const query = `mutation getEngineJWT{
        getEngineJWT(input: {
          engineId: "${engineId}"
          resource: {
            jobId: "${jobData.id}"
          }
        }) {
          engineId
          token
    
        }
      }
    `;

    const result = await gqlClient.query(query, {}, userOptions);
    expect(result.getEngineJWT).toBeDefined();
    expect(result.getEngineJWT.engineId).toEqual(engineId);
    expect(result.getEngineJWT.token).toBeDefined();
    jwtToken = result.getEngineJWT.token;
    jwtTokenOptions = helpers.requestOptions(jwtToken);
  });

  it('update user source with Engine JWT', async () => {
    const updateSourceResult = await sourceHelpers.helpUpdateSource(
      { gqlClient, options: jwtTokenOptions },
      {
        id: userSourceId,
        name: `${citestMarker}-source-updated-${uuid.v4()}`
      }
    );

    expect(updateSourceResult).toBeDefined();
    expect(updateSourceResult.id).toBeDefined();
  });

  it('create jwt source with Engine JWT', async () => {
    const createSourceResult = await sourceHelpers.helpCreateSource(
      { gqlClient, options: jwtTokenOptions },
      {
        sourceTypeId: 1,
        name: `${citestMarker}-source-${uuid.v4()}`
      }
    );

    expect(createSourceResult).toBeDefined();
    expect(createSourceResult.id).toBeDefined();
    jwtSourceId = createSourceResult.id;
  });

  it('update jwt source with Engine JWT', async () => {
    const updateSourceResult = await sourceHelpers.helpUpdateSource(
      { gqlClient, options: jwtTokenOptions },
      {
        id: jwtSourceId,
        name: `${citestMarker}-source-updated-${uuid.v4()}`
      }
    );

    expect(updateSourceResult).toBeDefined();
    expect(updateSourceResult.id).toBeDefined();
  });

  it('getSourceJWT should always return ownerId for user source', async () => {
    const query = `mutation getSourceJWT($sourceId: ID!) {
      getSourceJWT(sourceId: $sourceId) {
        token
        sourceId
        organizationId
        ownerId
      }
    }`;

    const result = await gqlClient.query(
      query,
      { sourceId: userSourceId },
      superAdminOptions
    );

    expect(result.getSourceJWT).toBeDefined();
    expect(result.getSourceJWT.token).toBeDefined();
    expect(result.getSourceJWT.sourceId).toBe(userSourceId);
    expect(result.getSourceJWT.organizationId).toBeDefined();
    expect(result.getSourceJWT.ownerId).toBeDefined();
    expect(result.getSourceJWT.ownerId).not.toBeNull();
  });

  it('getSourceJWT should always return ownerId for jwt source', async () => {
    const query = `mutation getSourceJWT($sourceId: ID!) {
      getSourceJWT(sourceId: $sourceId) {
        token
        sourceId
        organizationId
        ownerId
      }
    }`;

    const result = await gqlClient.query(
      query,
      { sourceId: jwtSourceId },
      superAdminOptions
    );

    expect(result.getSourceJWT).toBeDefined();
    expect(result.getSourceJWT.token).toBeDefined();
    expect(result.getSourceJWT.sourceId).toBe(jwtSourceId);
    expect(result.getSourceJWT.organizationId).toBeDefined();
    expect(result.getSourceJWT.ownerId).toBeDefined();
    expect(result.getSourceJWT.ownerId).not.toBeNull();
  });
});
