import { v4 as uuidv4 } from 'uuid';
import _, { get } from 'lodash';
import { helpers } from '../../../src/helpers';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../../src/graphqlUtil';
import { setupTestOrgAndUser } from '../../helpers/organization.helper';
import { createIsolatedSuperadmin } from '../../helpers/superadminSession';
import { safe } from '../../../src/helpers/commonHelper';
import {
  BuildUpdateAction,
  DeploymentModel,
  OrganizationType
} from '../../../src/gql';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const isDesktopAppEnabled = (global as any).enableDefaultDesktopApp ?? true;

const testName = `${citestMarker}_engine_${Date.now()}`;
const predefinedEngineBuildId = `${citestMarker}_build_id_${Date.now()}`;

const env = helpers.config.env;
const local = 'local';

const dockerImageUploaded =
  'registry.central.aiware.com/c308896d-3ba4-4b96-a95b-ad8fa4754888:838d1aa4-6a28-4a59-acf1-6ff346944299';

async function checkEngineBuildApprovedFromGetEngineBuildQuery(
  client: GraphqlClient,
  engineBuildId: string,
  headers?: any
) {
  let result: any;
  for (let i = 0; i < 5; i++) {
    await helpers.sleep(4000);
    result = await client.sdk.engineBuild(
      { id: engineBuildId },
      headers
    );
    if (result?.data?.engineBuild?.status !== 'fetching') break;
  }

  const engineBuild = _.get(result, 'data.engineBuild');
  expect(engineBuild).toBeDefined();
  expect(engineBuild?.id).toBeDefined();
  if (env.includes(local) && engineBuild?.status !== 'fetching') {
    await client.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId,
          engineId: engineBuild.engine.id,
          action: BuildUpdateAction.Submit
        }
      },
      headers
    );
    result = await client.sdk.engineBuild(
      { id: engineBuildId },
      headers
    );
  }
  expect(result?.data?.engineBuild?.status).toEqual('approved');
  return result?.data;
}

const createOrgAndUserInput = {
  orgInput: {
    name: `${citestMarker}-org-engine-${uuidv4()}`,
    businessUnit: 'Legal',
    types: [OrganizationType.Agency, OrganizationType.Broadcaster],
    metadata: {
      features: {
        enableRBACFeature: 'disabled'
      },
      billing: {
        pausedProcessing: false
      }
    },
    isLimitEnforced: true,
    remainingBudget: 10000,
    applications: [
      {
        applicationId: '8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5',
        applicationKey: 'cms'
      },
      isDesktopAppEnabled
        ? null
        : {
            applicationId: 'ea1d26ab-0d29-4e97-8ae7-d998a243374e',
            applicationKey: 'admin'
          },
      {
        applicationId: 'b9dba7b8-501a-4219-995b-5e6eadfb5ae0',
        applicationKey: 'developer'
      },
      {
        applicationId: '32babe30-fb42-11e4-89bc-27b69865858a',
        applicationKey: 'discovery'
      }
    ].filter((app) => app)
  },
  userInputs: [
    {
      name: `${citestMarker}-admin-user-${uuidv4()}@localhost`,
      password: 'testPassword',
      roleIds: [
        isDesktopAppEnabled ? null : 'ddca9b68-d775-4934-8ffd-7aecc779b652', // Admin
        '032218c3-d47e-4287-9d16-7bb867c01266' // Desktop
      ].filter((roleId) => roleId)
    }
  ]
};

describe('citest_engine: org admin engine build new process testing', () => {
  let gqlClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let superToken: string;
  let superAdminOptions: any;
  let orgAdminOptions: any;
  let testSetup: any;
  let testOrg: any;

  let categoryId: string;
  let engineId1: string;
  let engineBuildId1: string;
  let engineBuildId2: string;
  let engineBuildId3: string;
  let enginePackage1: string;
  let automaticPackageCreation: any;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    // T21: This suite previously ran org/user setup AND several engine/engineBuild operations on
    // the SHARED superadmin session, which is an admin MEMBER of every test org it creates
    // (createOrganization enrolls the caller via addAdminToOrganization). This suite's own afterAll
    // then calls the real, session-killing delete via helpers.deleteOrganization(...), which
    // enumerates all active members of testOrg and calls removeAllUserSessions(userId) on each —
    // GLOBAL, not org-scoped — deleting every one of the shared superadmin's session tokens,
    // including tokens other concurrent specs depend on. Fix: bootstrap via a throwaway superadmin
    // that is a member of no org except its own, so this spec's own org-delete can never
    // collaterally kill a session anything else needs. See test/helpers/superadminSession.ts.
    isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
    superToken = isolatedSuperadmin.token;
    superAdminOptions = isolatedSuperadmin.options;

    testSetup = await setupTestOrgAndUser(
      isolatedSuperadmin.client,
      createOrgAndUserInput
    );

    testOrg = testSetup.org;
    expect(testOrg).toBeDefined();
    expect(testOrg.name).toContain(`${citestMarker}-org`);
    expect(testOrg.users).toBeDefined();
    expect(testOrg.users?.records?.length).toEqual(2);

    const adminUser = (testSetup.listOptions ?? []).find((user: any) =>
      user.userName?.includes('-admin-user-')
    );
    orgAdminOptions = adminUser?.requestOptions;

    // this feature is undefined in ai13s but the following code checks for "disabled" value
    automaticPackageCreation = _.get(
      testOrg,
      'jsondata.features.automaticPackageCreation'
    );
  });

  afterAll(async () => {
    if (engineBuildId1 && engineId1) {
      await safe(`delete engine build ${engineBuildId1}`, () =>
        gqlClient.sdk.deleteEngineBuild(
          { input: { id: engineBuildId1, engineId: engineId1 } },
          orgAdminOptions
        )
      );
    }

    if (engineBuildId2 && engineId1) {
      await safe(`delete engine build ${engineBuildId2}`, () =>
        gqlClient.sdk.deleteEngineBuild(
          { input: { id: engineBuildId2, engineId: engineId1 } },
          orgAdminOptions
        )
      );
    }

    if (engineBuildId3 && engineId1) {
      await safe(`delete engine build ${engineBuildId3}`, () =>
        gqlClient.sdk.deleteEngineBuild(
          { input: { id: engineBuildId3, engineId: engineId1 } },
          orgAdminOptions
        )
      );
    }

    if (predefinedEngineBuildId && engineId1) {
      await safe(`delete engine build ${predefinedEngineBuildId}`, () =>
        gqlClient.sdk.deleteEngineBuild(
          { input: { id: predefinedEngineBuildId, engineId: engineId1 } },
          orgAdminOptions
        )
      );
    }

    if (engineId1) {
      await safe(`delete engine ${engineId1}`, () =>
        gqlClient.sdk.deleteEngine({ id: engineId1 }, orgAdminOptions)
      );
    }

    if (testSetup?.listOptions?.length > 0) {
      for (const user of testSetup.listOptions) {
        await safe(`delete user ${user.userId}`, () =>
          gqlClient.sdk.deleteUser({ id: user.userId })
        );
      }
    }

    if (testOrg?.id) {
      await safe(`delete organization ${testOrg.id}`, () =>
        helpers.deleteOrganization(gqlClient.authUrl, testOrg.id, superToken)
      );
    }

    if (isolatedSuperadmin) {
      await safe('cleanup isolated superadmin', () =>
        isolatedSuperadmin.cleanup()
      );
    }
  });

  it('get transcription category id', async () => {
    const result = await gqlClient.sdk.engineCategories(
      { type: 'Cognition', name: 'Transcription', limit: 1 },
      orgAdminOptions
    );

    const engineCategories = result?.data?.engineCategories;
    expect(engineCategories).toBeDefined();
    expect(engineCategories?.count).toEqual(1);
    expect(engineCategories?.records).toHaveLength(1);
    expect(engineCategories?.records?.[0]?.id).toBeDefined();

    categoryId = engineCategories?.records?.[0]?.id as string;
  });

  it('create new engine - for testing build with new process', async () => {
    const result = await gqlClient.sdk.createEngine(
      {
        input: {
          name: testName,
          categoryId: categoryId,
          deploymentModel: DeploymentModel.FullyNetworkIsolated
        }
      },
      orgAdminOptions
    );

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
    const input: Record<string, any> = {
      engineId: engineId1,
      dockerImage: dockerImageUploaded
    };

    if (env.includes(local)) {
      input.taskRuntime = { nodeRed: true };
      input.manifest = { runtime: 'NodeRed' };
    }

    const result = await gqlClient.sdk.createEngineBuild(
      { input: input as any },
      orgAdminOptions
    );

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    const approved = await checkEngineBuildApprovedFromGetEngineBuildQuery(
      gqlClient,
      createdEngineBuild?.id!,
      orgAdminOptions
    );
    expect(approved.engineBuild.engine.state).toEqual('ready');
    engineBuildId1 = createdEngineBuild?.id!;
  });

  it('deploy engine build - new engine build process', async () => {
    const result = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId1,
          engineId: engineId1,
          action: BuildUpdateAction.Deploy
        }
      },
      orgAdminOptions
    );

    const updatedEngineBuild = _.get(result, 'data.updateEngineBuild');
    expect(updatedEngineBuild).toBeDefined();
    expect(updatedEngineBuild?.status).toEqual('deployed');
  });

  it('creates engine build with taskRuntime null and verifies default runtime { edge: {} }', async () => {
    const result = await gqlClient.sdk.createEngineBuild(
      {
        input: {
          engineId: engineId1,
          dockerImage: dockerImageUploaded,
          taskRuntime: null
        }
      },
      orgAdminOptions
    );

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    engineBuildId2 = createdEngineBuild?.id!;
    // Validate runtime default value
    expect(createdEngineBuild?.runtime).toEqual({ edge: {} });
  });

  it('creates engine build with default runtime { edge: {} }, updates taskRuntime to null and verifies default runtime { edge: {} }', async () => {
    const result = await gqlClient.sdk.createEngineBuild(
      { input: { engineId: engineId1, dockerImage: dockerImageUploaded } },
      orgAdminOptions
    );

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    // Validate runtime default value
    expect(createdEngineBuild?.runtime).toEqual({ edge: {} });
    engineBuildId3 = createdEngineBuild?.id!;

    const updateResult = await gqlClient.sdk.updateEngineBuild(
      {
        input: {
          id: engineBuildId3,
          engineId: engineId1,
          action: BuildUpdateAction.Upload,
          taskRuntime: null,
          dockerImage: dockerImageUploaded
        }
      },
      orgAdminOptions
    );

    expect(_.get(updateResult, 'data.updateEngineBuild.runtime')).toEqual({
      edge: {}
    });
  });

  it('engine state should be in `active` state and package should be created when applicable', async () => {
    const result = await gqlClient.sdk.engine(
      { id: engineId1 },
      orgAdminOptions
    );

    const engine = result?.data?.engine;
    expect(engine).toBeDefined();
    expect(engine?.id).toEqual(engineId1);
    expect(engine?.state).toEqual('active');

    if (!automaticPackageCreation || automaticPackageCreation === 'disabled') {
      return;
    }

    const packagesResult = await gqlClient.sdk.queryPackages(
      { primaryResourceId: engineId1 },
      orgAdminOptions
    );
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
    const result = await gqlClient.sdk.createEngineBuild(
      {
        input: {
          id: predefinedEngineBuildId,
          engineId: engineId1,
          dockerImage: `registry.central.aiware.com/${engineId1}/${predefinedEngineBuildId}`
        }
      },
      superAdminOptions
    );

    const createdEngineBuild = _.get(result, 'data.createEngineBuild');
    expect(createdEngineBuild).toBeDefined();
    expect(createdEngineBuild?.id).toEqual(predefinedEngineBuildId);
    expect(createdEngineBuild?.status).toEqual('approved');
    expect(createdEngineBuild?.engine?.state).toEqual('active');
  });
});
