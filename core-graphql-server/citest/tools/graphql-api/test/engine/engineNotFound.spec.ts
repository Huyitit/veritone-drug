import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { DeploymentModel, JwtRightsField } from '../../src/gql';

/**
 * GLC-1673 regression: an engine was intermittently not readable immediately
 * after being created. Converted from the legacy
 * citest/debug/engineNotFound.spec.js — the create/build/read/delete cycle is run
 * ten times in a row to try to reproduce that race.
 */

/** Seeded engine category the legacy spec used (a nodeRed flow category). */
const CATEGORY_ID = 'c5458876-43d2-41e8-a340-f734702df04a';

const JWT_RIGHTS: JwtRightsField = {
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
};

describe('debug engine not found after created', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(gqlClient.sessionToken).toBeDefined();
  });

  async function deleteEngine(engineId: string): Promise<void> {
    const result = await gqlClient.sdk.deleteEngine({ id: engineId });
    expect(result?.data?.deleteEngine?.id).toEqual(engineId);
  }

  async function createThenQueryEngine(): Promise<void> {
    const engineRes = await gqlClient.sdk.createEngine({
      input: {
        name: 'citest Untitled Flow',
        description: '',
        categoryId: CATEGORY_ID,
        deploymentModel: DeploymentModel.NonNetworkIsolated,
        manifest: {
          runtime: 'nodeRed',
          engineMode: 'chunk',
          supportedInputTypes: ['application/json']
        }
      }
    });
    const engineId = engineRes?.data?.createEngine?.id ?? null;
    if (!engineId) {
      throw new Error('createEngine returned no engine id');
    }

    const buildRes = await gqlClient.sdk.createEngineBuild({
      input: {
        engineId,
        manifest: {
          runtime: 'nodeRed',
          engineId,
          engineMode: 'chunk'
        },
        taskRuntime: { edge: {}, nodeRed: { flows: [], package: {} } },
        dockerImage: 'registry.central.aiware.com/node-red-runner-v3:stable'
      }
    });
    const buildId = buildRes?.data?.createEngineBuild?.id ?? null;
    if (!buildId) {
      throw new Error('createEngineBuild returned no build id');
    }

    const updateRes = await gqlClient.sdk.updateEngine({
      input: { id: engineId, jwtRights: JWT_RIGHTS }
    });
    expect(updateRes?.data?.updateEngine?.id).toEqual(engineId);

    const buildsRes = await gqlClient.sdk.engineBuilds({
      engineId,
      buildId
    });
    const builds = buildsRes?.data?.engine?.builds?.records ?? null;
    expect(builds).not.toBeNull();
    expect(builds?.[0]?.status).toBeDefined();

    await deleteEngine(engineId);
  }

  it('try to duplicate', async () => {
    for (let i = 0; i < 10; ++i) {
      await createThenQueryEngine();
    }
  });
});
