import { helpers } from '../../src/helpers/index';
import {
  createGraphqlClient,
  AuthType,
  GraphqlClient
} from '../../src/graphqlUtil';
import * as _ from 'lodash';
import * as uuid from 'uuid';
import { OrganizationStatus } from '../../src/gql';

const config = helpers.config;
const citestMarker = (global as any).citestMarker || 'citest-should-delete';
let sdkClient: GraphqlClient;

const engineId = '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255';
const testPassword = 'testUserPassword';

const getRequestHeaders = (options: any) =>
  _.get(options, 'headers', undefined);

describe('citest_jobs: source data citest with jwt token', () => {
  let superAdminOptions: any = {};
  let superToken = '';
  let jwtToken: any, jwtTokenOptions: any;
  let userToken: any, userOptions: any;
  let orgData: any, userData: any, jobData: any;
  let userSourceId: any, jwtSourceId: any;

  beforeAll(async () => {
    const env = config.env;
    sdkClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);
    expect(sdkClient.sessionToken).toBeDefined();
    superToken = sdkClient.sessionToken!;
    superAdminOptions = helpers.requestOptions(superToken);
  });

  afterAll(async () => {
    // delete source
    if (userSourceId) {
      await sdkClient.sdk.deleteSource(
        { id: userSourceId },
        getRequestHeaders(userOptions)
      );
    }

    if (jwtSourceId) {
      await sdkClient.sdk.deleteSource(
        { id: jwtSourceId },
        getRequestHeaders(jwtTokenOptions)
      );
    }

    // delete job
    if (jobData && jobData.id) {
      await sdkClient.sdk.cancelJob(
        { id: jobData.id },
        getRequestHeaders(userOptions)
      );
    }

    if (userData && userData.id) {
      await sdkClient.sdk.deleteUser(
        { id: userData.id },
        getRequestHeaders(superAdminOptions)
      );
    }

    if (orgData && orgData.id) {
      await sdkClient.sdk.updateOrganization(
        { input: { id: orgData.id, status: OrganizationStatus.Deleted } },
        getRequestHeaders(superAdminOptions)
      );
    }
  });

  it('create new org', async () => {
    const createOrgRes = await sdkClient.sdk.createOrganization(
      {
        input: {
          name: `${citestMarker}-org-${uuid.v4()}`,
          businessUnit: 'Legal',
          metadata: {
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
      },
      getRequestHeaders(superAdminOptions)
    );

    orgData = _.get(createOrgRes, 'data.createOrganization');
    expect(orgData).toBeDefined();
    expect(orgData.id).toBeDefined();
    expect(orgData.guid).toBeDefined();
    expect(orgData.name).toContain(`${citestMarker}-org-`);
  });

  it('create non admin user for org', async () => {
    const createUserRes = await sdkClient.sdk.createUser(
      {
        input: {
          name: `${citestMarker}-user-${uuid.v4()}`,
          organizationId: orgData.id,
          password: testPassword,
          // orgId: orgData.id,
          roleIds: ['cf2ed945-176b-4dd9-943e-22fcb1cf684f']
        }
      },
      getRequestHeaders(superAdminOptions)
    );

    userData = _.get(createUserRes, 'data.createUser');

    expect(userData).toBeDefined();
    expect(userData.id).toBeDefined();
    expect(userData.name).toContain(`${citestMarker}-user-`);

    const loginResult = await sdkClient.sdk.userLogin(
      {
        input: {
          userName: userData.name,
          password: testPassword
        }
      },
      getRequestHeaders(superAdminOptions)
    );

    const loginData = _.get(loginResult, 'data.userLogin');

    expect(loginResult).toBeDefined();
    expect(loginData?.token).toBeDefined();
    userToken = loginData?.token;
    userOptions = helpers.requestOptions(userToken);
  });

  it('create job with engine', async () => {
    const result = await sdkClient.sdk.createJob(
      {
        input: {
          name: `${citestMarker}-job-${uuid.v4()}`,
          tasks: [{ engineId: engineId }]
        }
      },
      getRequestHeaders(userOptions)
    );

    const jobCreate = _.get(result, 'data.createJob');

    expect(result).toBeDefined();
    expect(jobCreate).toBeDefined();
    expect(jobCreate?.id).toBeDefined();
    jobData = jobCreate;
  });

  it('user create source', async () => {
    const createSourceResult = await sdkClient.sdk.createSource(
      {
        input: {
          sourceTypeId: '1',
          name: `${citestMarker}-source-${uuid.v4()}`
        }
      },
      getRequestHeaders(userOptions)
    );

    const sourceData = _.get(createSourceResult, 'data.createSource');

    expect(createSourceResult).toBeDefined();
    expect(sourceData?.id).toBeDefined();
    userSourceId = sourceData?.id;
  });

  it('generate engine JWT', async () => {
    const result = await sdkClient.sdk.getEngineJWT(
      {
        input: {
          engineId: engineId,
          resource: {
            jobId: jobData.id
          }
        }
      },
      getRequestHeaders(userOptions)
    );

    const engineJwt = _.get(result, 'data.getEngineJWT');
    expect(engineJwt).toBeDefined();
    expect(engineJwt.engineId).toEqual(engineId);
    expect(engineJwt.token).toBeDefined();
    jwtToken = engineJwt.token;
    jwtTokenOptions = helpers.requestOptions(jwtToken);
  });

  it('update user source with Engine JWT', async () => {
    const updateSourceResult = await sdkClient.sdk.updateSource(
      {
        input: {
          id: userSourceId,
          name: `${citestMarker}-source-updated-${uuid.v4()}`
        }
      },
      getRequestHeaders(jwtTokenOptions)
    );

    const sourceUpdate = _.get(updateSourceResult, 'data.updateSource');

    expect(updateSourceResult).toBeDefined();
    expect(sourceUpdate?.id).toBeDefined();
  });

  it('create jwt source with Engine JWT', async () => {
    const createSourceResult = await sdkClient.sdk.createSource(
      {
        input: {
          sourceTypeId: '1',
          name: `${citestMarker}-source-${uuid.v4()}`
        }
      },
      getRequestHeaders(jwtTokenOptions)
    );

    const sourceData = _.get(createSourceResult, 'data.createSource');

    expect(createSourceResult).toBeDefined();
    expect(sourceData?.id).toBeDefined();
    jwtSourceId = sourceData?.id;
  });

  it('update jwt source with Engine JWT', async () => {
    const updateSourceResult = await sdkClient.sdk.updateSource(
      {
        input: {
          id: jwtSourceId,
          name: `${citestMarker}-source-updated-${uuid.v4()}`
        }
      },
      getRequestHeaders(jwtTokenOptions)
    );

    const sourceUpdate = _.get(updateSourceResult, 'data.updateSource');

    expect(updateSourceResult).toBeDefined();
    expect(sourceUpdate?.id).toBeDefined();
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

    const result = await sdkClient.query(
      query,
      { sourceId: userSourceId },
      getRequestHeaders(superAdminOptions)
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

    const result = await sdkClient.query(
      query,
      { sourceId: jwtSourceId },
      getRequestHeaders(superAdminOptions)
    );

    expect(result.getSourceJWT).toBeDefined();
    expect(result.getSourceJWT.token).toBeDefined();
    expect(result.getSourceJWT.sourceId).toBe(jwtSourceId);
    expect(result.getSourceJWT.organizationId).toBeDefined();
    expect(result.getSourceJWT.ownerId).toBeDefined();
    expect(result.getSourceJWT.ownerId).not.toBeNull();
  });
});
