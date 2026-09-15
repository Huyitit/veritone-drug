import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { BuildUpdateAction, CreateBuild, DeploymentModel } from '../../src/gql';
import { helpers } from '../../src/helpers/index';
import { safe } from '../../src/helpers/commonHelper';
import config from '../../src/config';
import _ from 'lodash';

const citestMarker = 'citest-should-delete';
const testName = `${citestMarker}_engine_${Date.now()}`;
const predefinedEngineBuildId = `${citestMarker}_build_id_${Date.now()}`;

const env = config.env;
const local = 'local';

// docker image to be reused and avoiding uploading one image for each test
const dockerImageUploaded =
  'registry.central.aiware.com/c308896d-3ba4-4b96-a95b-ad8fa4754888:838d1aa4-6a28-4a59-acf1-6ff346944299';

async function checkEngineBuildApprovedFromGetEngineBuildQuery(
  client: GraphqlClient,
  engineBuildId: string
) {
  let result: any;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await client.sdk.engineBuild({ id: engineBuildId });
    if (result?.data?.engineBuild?.status !== 'fetching') break;
  }

  expect(result?.data?.engineBuild).toBeDefined();
  expect(result?.data?.engineBuild?.id).toBeDefined();
  if (env.includes(local) && result?.data?.engineBuild?.status !== 'fetching') {
    await client.sdk.updateEngineBuild({
      input: {
        id: engineBuildId,
        engineId: result?.data.engineBuild.engine.id,
        action: BuildUpdateAction.Submit
      }
    });
    result = await client.sdk.engineBuild({ id: engineBuildId });
  }
  expect(result?.data?.engineBuild?.status).toEqual('approved');
  return result?.data;
}

describe('citest_engine: Engine Build new process testing', () => {
  let gqlClient: GraphqlClient;
  let categoryId: string;
  let engineId1: string;
  let engineBuildId1: string;
  let engineBuildId2: string;
  let engineBuildId3: string;
  let enginePackage1: string;
  let automaticPackageCreation: any;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();

    const meQuery = `
      query {
        me {
          organization {
            jsondata
          }
        }
      }
    `;
    const meResult: any = await gqlClient.query(meQuery);
    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      meResult,
      'me.organization.jsondata.features.automaticPackageCreation'
    );
  });

  afterAll(async () => {
    // Delete engine builds and verify they are deleted
    await safe(`delete engine build ${engineBuildId1}`, () =>
      gqlClient.sdk.deleteEngineBuild({
        input: { id: engineBuildId1, engineId: engineId1 }
      })
    );

    await safe(`delete engine build ${engineBuildId2}`, () =>
      gqlClient.sdk.deleteEngineBuild({
        input: { id: engineBuildId2, engineId: engineId1 }
      })
    );

    await safe(`delete engine build ${engineBuildId3}`, () =>
      gqlClient.sdk.deleteEngineBuild({
        input: { id: engineBuildId3, engineId: engineId1 }
      })
    );

    await safe(`delete engine build ${predefinedEngineBuildId}`, () =>
      gqlClient.sdk.deleteEngineBuild({
        input: { id: predefinedEngineBuildId, engineId: engineId1 }
      })
    );

    // Delete engine and verify it is deleted
    await safe(`delete engine ${engineId1}`, () =>
      gqlClient.sdk.deleteEngine({ id: engineId1 })
    );
  });

  it('get transcription category id', async () => {
    const result = await gqlClient.sdk.engineCategories({
      type: 'Cognition',
      name: 'Transcription',
      limit: 1
    });

    const engineCategories = result?.data?.engineCategories;
    expect(engineCategories).toBeDefined();
    expect(engineCategories?.count).toEqual(1);
    expect(engineCategories?.records).toHaveLength(1);
    expect(engineCategories?.records?.[0]?.id).toBeDefined();

    categoryId = engineCategories?.records?.[0]?.id as string;
  });

  it('create new engine - for testing build with new process', async () => {
    const result = await gqlClient.sdk.createEngine({
      input: {
        name: testName,
        categoryId: categoryId,
        deploymentModel: DeploymentModel.FullyNetworkIsolated
      }
    });

    const createdEngine = result?.data?.createEngine;
    expect(createdEngine).toBeDefined();
    expect(createdEngine?.id).toBeDefined();
    expect(createdEngine?.name).toEqual(testName);
    expect(createdEngine?.categoryId).toEqual(categoryId);
    expect(createdEngine?.deploymentModel).toEqual('FullyNetworkIsolated');
    expect(createdEngine?.state).toEqual('pending');

    engineId1 = createdEngine?.id as string;
  });

  it('creates engine build - has dockerImage with private engine', async () => {
    const input: CreateBuild = {
      engineId: engineId1,
      dockerImage: dockerImageUploaded
    };

    if (env.includes(local)) {
      input.taskRuntime = { nodeRed: true };
      input.manifest = { runtime: 'NodeRed' };
    }

    const result = await gqlClient.sdk.createEngineBuild({ input: input });
    const createdEngineBuild = _.get(result, 'data.createEngineBuild');

    const approved = await checkEngineBuildApprovedFromGetEngineBuildQuery(
      gqlClient,
      createdEngineBuild?.id!
    );
    expect(approved.engineBuild.engine.state).toEqual('ready');
    engineBuildId1 = createdEngineBuild?.id!;
  });

  it('deploy engine build - new engine build process', async () => {
    const result = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildId1,
        engineId: engineId1,
        action: BuildUpdateAction.Deploy
      }
    });

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.status).toEqual('deployed');
  });

  it('creates engine build with taskRuntime null and verifies default runtime { edge: {} }', async () => {
    const result = await gqlClient.sdk.createEngineBuild({
      input: {
        engineId: engineId1,
        dockerImage: dockerImageUploaded,
        taskRuntime: null
      }
    });

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    engineBuildId2 = createdEngineBuild?.id!;
    // Validate runtime default value
    expect(createdEngineBuild?.runtime).toEqual({ edge: {} });
  });

  it('creates engine build with default runtime { edge: {} }, updates taskRuntime to null and verifies default runtime { edge: {} }', async () => {
    const result = await gqlClient.sdk.createEngineBuild({
      input: {
        engineId: engineId1,
        dockerImage: dockerImageUploaded
      }
    });

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    // Validate runtime default value
    expect(createdEngineBuild?.runtime!).toEqual({ edge: {} });
    engineBuildId3 = createdEngineBuild?.id!;

    const updateResult = await gqlClient.sdk.updateEngineBuild({
      input: {
        id: engineBuildId3,
        engineId: engineId1,
        action: BuildUpdateAction.Upload,
        taskRuntime: null,
        dockerImage: dockerImageUploaded
      }
    });

    expect(_.get(updateResult, 'data.updateEngineBuild.runtime')).toEqual({
      edge: {}
    });
  });

  it('engine state should be in `active` state and package should be created when applicable', async () => {
    const result = await gqlClient.sdk.engine({ id: engineId1 });

    const engine = result?.data?.engine;
    expect(engine).toBeDefined();
    expect(engine?.id).toEqual(engineId1);
    expect(engine?.state).toEqual('active');

    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    const packagesResult = await gqlClient.sdk.queryPackages({
      primaryResourceId: engineId1
    });
    const packages = packagesResult?.data?.packages;

    expect(packages).toBeDefined();
    expect(packages?.records).toBeDefined();
    expect(packages?.records?.length as number).toBeGreaterThan(0);
    expect(packages?.records?.[0]?.id).toBeDefined();
    expect(packages?.records?.[0]?.primaryResource).toBeDefined();
    expect(packages?.records?.[0]?.primaryResource?.resourceId).toEqual(
      engineId1
    );
    expect(packages?.records?.[0]?.primaryResource?.resourceType).toEqual(
      'engine'
    );
    enginePackage1 = packages?.records?.[0]?.id as string;
  });

  it('creates engine build - predefined build id', async () => {
    const result = await gqlClient.sdk.createEngineBuild({
      input: {
        id: predefinedEngineBuildId,
        engineId: engineId1,
        dockerImage: `registry.central.aiware.com/${engineId1}/${predefinedEngineBuildId}`
      }
    });

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild?.id).toEqual(predefinedEngineBuildId);
    expect(createdEngineBuild?.status).toEqual('approved');
    expect(createdEngineBuild?.engine?.state).toEqual('active');
  });
});
