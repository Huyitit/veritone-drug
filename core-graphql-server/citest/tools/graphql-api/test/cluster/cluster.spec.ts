import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import {
  ClusterDateTimeField,
  ClusterOrderByField,
  ClusterStatus,
  CreateCluster,
  MediaStorageOption,
  OrderDirection,
  SetClusterPermission,
  StringMatch
} from '../../src/gql';
import { helpers } from '../../src/helpers';
import { safe } from '../../src/helpers/commonHelper';
import { getCitestMarker } from '../helpers/citestGlobals';
import {
  createIsolatedSuperadmin,
  IsolatedSuperadmin
} from '../helpers/superadminSession';

/**
 * Cluster, cluster-group and cluster-node operations, converted from the legacy
 * citest/cluster.spec.js.
 *
 * Two deliberate departures from the legacy spec, both required by the harness's
 * session rules:
 *
 *  - The spec may create its own collaborator org, and needs a superadmin
 *    identity for the cross-org cases, so it runs as a throwaway isolated
 *    superadmin rather than the shared citest superadmin.
 *  - Teardown soft-deletes that org (`updateOrganization` with status "deleted")
 *    instead of the legacy REST hard-delete (`helpers.deleteOrganization`), which
 *    terminates every session enrolled in the org. Teardown also only removes an
 *    org this run actually created — the legacy spec would delete a pre-existing
 *    shared "citest-org" it merely found.
 */
const citestMarker = getCitestMarker();
const testKey = citestMarker + Date.now().toString();

/** Seeded engine used for the job / job-template cases (WebRTC Push Adapter). */
const ENGINE_ID = 'd1bc57fe-675d-435d-9f4d-2f074485ec55';

/** Pre-existing collaborator org the legacy spec looked for by name. */
const TEST_ORG_NAME = 'citest-org';

/**
 * Foreign org ids the legacy spec hard-codes for the superadmin cross-org cases.
 * They are deliberately NOT resolved against the environment: the point of these
 * tests is that a superadmin may address an arbitrary organization id.
 */
const FOREIGN_ORG_ID = '17560';
const FOREIGN_COLLABORATOR_ORG_ID = '7862';

/** Base cluster input shared by the create cases. */
function baseClusterInput(overrides: Partial<CreateCluster>): CreateCluster {
  return {
    name: testKey,
    // type: ClusterType.Ami — uncomment when VE-16319 is DONE
    dockerCredentials: {},
    allowedEngines: [],
    ...overrides
  };
}

describe('citest_cluster: cluster tests', () => {
  let sa: IsolatedSuperadmin;
  let superClient: GraphqlClient;
  /** `Authorization` header carrying the API token rather than a session token. */
  let apiTokenHeaders: Record<string, string>;

  let userId: string;
  let testOrgId: string;
  let createdTestOrg = false;

  let clusterId: string | null = null;
  let clusterNoTagsId: string | null = null;
  let clusterAnotherOrgId: string | null = null;
  let clusterGroupId: string | null = null;
  let clusterIdInGroup1: string | null = null;
  let clusterIdInGroup2: string | null = null;

  let nodeId1: string | null = null;
  let nodeId2: string | null = null;

  /** Clusters created outside the named variables above (error-path fallout). */
  const strayClusterIds: string[] = [];

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    expect(bootstrapClient.sessionToken).toBeDefined();

    sa = await createIsolatedSuperadmin(bootstrapClient);
    superClient = sa.client;
    userId = sa.userId;

    /**
     * Match the throwaway org's billing posture to the shared citest org the
     * legacy spec ran in (org 7682, `isLimitEnforced: false`). A freshly created
     * org defaults to limits ENFORCED with no budget, which leaves engine
     * processing paused and makes `createJob` fail with object_limit_exceeded —
     * an artefact of the isolated-superadmin setup, not of anything under test.
     * `remainingBudget` must be sent alongside it; `updateOrganization` rejects
     * `isLimitEnforced` on its own with "Remaining budget is required".
     */
    await superClient.sdk.updateOrganization({
      input: { id: sa.orgId, isLimitEnforced: false, remainingBudget: 0 }
    });

    /**
     * The legacy spec's "internal api token" case authenticated with the api
     * token from the REST signin, whose fallback chain is
     * `body.apiToken || config.apiToken || token`. Neither the REST signin nor
     * the GraphQL `userLogin` returns an apiToken on a local stack, so that chain
     * resolves to `config.apiToken` — which is what actually exercised the
     * api-token path. `helpers.signin` reproduces the same chain, so it is used
     * here rather than `createGraphqlClient(AuthType.USER_API_TOKEN)`, which
     * reads `userLogin.apiToken` directly and would send `Bearer null`.
     */
    const signinResult = await helpers.signin(superClient.authUrl);
    const apiToken: string | null = signinResult?.apiToken ?? null;
    if (!apiToken) {
      throw new Error('signin returned no api token for the api-token case');
    }
    apiTokenHeaders = helpers.requestOptions(apiToken).headers;

    const existing = await superClient.sdk.organizations({
      name: TEST_ORG_NAME
    });
    const foundOrgId =
      existing?.data?.organizations?.records?.[0]?.id ?? null;

    if (foundOrgId) {
      testOrgId = foundOrgId;
    } else {
      const created = await superClient.sdk.createOrganization({
        input: {
          name: `${citestMarker}-org`,
          metadata: {},
          businessUnit: 'Test'
        }
      });
      const createdOrgId = created?.data?.createOrganization?.id ?? null;
      if (!createdOrgId) {
        throw new Error('createOrganization returned no org id');
      }
      testOrgId = createdOrgId;
      createdTestOrg = true;
    }
  });

  afterAll(async () => {
    const clusterIds = [
      clusterId,
      clusterNoTagsId,
      clusterAnotherOrgId,
      clusterGroupId,
      clusterIdInGroup1,
      clusterIdInGroup2,
      ...strayClusterIds
    ].filter((id): id is string => Boolean(id));

    for (const id of clusterIds) {
      await safe(`delete cluster ${id}`, () =>
        superClient.sdk.deleteCluster({ id })
      );
    }

    if (createdTestOrg) {
      await safe('soft-delete collaborator organization', () =>
        superClient.sdk.updateOrganization({
          input: { id: testOrgId, status: 'deleted' }
        })
      );
    }

    await sa.cleanup();
  });

  it('create a cluster group', async () => {
    const result = await superClient.sdk.createCluster({
      input: baseClusterInput({
        containerTag: 'test',
        memorySize: '1gb',
        storageSize: '8gb',
        collaborators: [
          {
            organizationId: testOrgId,
            permission: SetClusterPermission.Viewer
          }
        ],
        tags: ['foo', 'bar'],
        subscriptions: [{ userId, isActive: true }],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge'
        },
        mediaStoragePath: '../mnnt/tt',
        mediaStorage: MediaStorageOption.Core,
        restartTimeUTC: '04:00',
        isGroup: true
      })
    });

    const createCluster = result?.data?.createCluster ?? null;
    clusterGroupId = createCluster?.id ?? null;
    expect(clusterGroupId).not.toBeNull();
    expect(createCluster?.collaborators?.count).toEqual(1);
    expect(createCluster?.collaborators?.records?.[0]?.organizationId).toEqual(
      testOrgId.toString()
    );
    expect(createCluster?.collaborators?.records?.[0]?.permission).toEqual(
      'viewer'
    );
    expect(createCluster?.tags?.length).toEqual(2);
    expect(createCluster?.tags?.[0]).toEqual('foo');
    expect(createCluster?.isGroup).toEqual(true);
  });

  it('create 2 clusters into a group', async () => {
    const groupMemberInput = baseClusterInput({
      clusterGroupId: clusterGroupId as string,
      status: ClusterStatus.Active
    });

    const result = await superClient.sdk.createClustersInGroup({
      input1: groupMemberInput,
      input2: groupMemberInput
    });

    const clusterInGroup1 = result?.data?.clusterInGroup1 ?? null;
    const clusterInGroup2 = result?.data?.clusterInGroup2 ?? null;

    clusterIdInGroup1 = clusterInGroup1?.id ?? null;
    clusterIdInGroup2 = clusterInGroup2?.id ?? null;

    expect(clusterIdInGroup1).not.toBeNull();
    expect(clusterIdInGroup2).not.toBeNull();
    expect(clusterInGroup1?.isGroup).toEqual(false);
    expect(clusterInGroup2?.isGroup).toEqual(false);

    expect(clusterInGroup1?.clusterGroupId).toEqual(clusterGroupId);
    expect(clusterInGroup2?.clusterGroupId).toEqual(clusterGroupId);
  });

  it('throw error when creating an invalid cluster into a group', async () => {
    /**
     * Both creates are sent in ONE serially-executed mutation, matching the
     * legacy spec: the first targets a cluster group id that is really a plain
     * cluster (not_found), the second tries to nest a group inside a group.
     *
     * Caught rather than asserted with `.rejects` so that if the server does let
     * one of the two through, the resulting cluster is registered for teardown
     * instead of leaking — the legacy spec had no such safety net.
     */
    let caught: unknown = null;
    try {
      await superClient.sdk.createClustersInGroup({
        input1: baseClusterInput({
          clusterGroupId: clusterIdInGroup1 as string
        }),
        input2: baseClusterInput({
          clusterGroupId: clusterGroupId as string,
          isGroup: true
        })
      });
    } catch (err) {
      caught = err;
      for (const id of partialClusterIds(err)) {
        strayClusterIds.push(id);
      }
    }

    expect(caught).not.toBeNull();
    expect(String(caught)).toContain('not_found');
  });

  it('create a cluster with tags', async () => {
    const result = await superClient.sdk.createCluster({
      input: baseClusterInput({
        containerTag: 'test',
        paused: true,
        memorySize: '1gb',
        storageSize: '8gb',
        collaborators: [
          {
            organizationId: testOrgId,
            permission: SetClusterPermission.Viewer
          }
        ],
        tags: ['foo', 'bar'],
        subscriptions: [{ userId, isActive: true }],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge'
        },
        mediaStoragePath: '../mnnt/tt',
        mediaStorage: MediaStorageOption.Core,
        restartTimeUTC: '04:00'
      })
    });

    const createCluster = result?.data?.createCluster ?? null;
    clusterId = createCluster?.id ?? null;
    expect(clusterId).not.toBeNull();
    expect(createCluster?.collaborators?.count).toEqual(1);
    expect(createCluster?.collaborators?.records?.[0]?.organizationId).toEqual(
      testOrgId.toString()
    );
    expect(createCluster?.collaborators?.records?.[0]?.permission).toEqual(
      'viewer'
    );
    expect(createCluster?.tags?.length).toEqual(2);
    expect(createCluster?.tags?.[0]).toEqual('foo');
  });

  it('create a cluster that did not have tags', async () => {
    const result = await superClient.sdk.createCluster({
      input: baseClusterInput({
        containerTag: 'test',
        paused: true,
        memorySize: '1gb',
        storageSize: '8gb',
        tags: [],
        collaborators: [
          {
            organizationId: testOrgId,
            permission: SetClusterPermission.Viewer
          }
        ],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge',
          managementNodeId: ''
        }
      })
    });

    const createCluster = result?.data?.createCluster ?? null;
    clusterNoTagsId = createCluster?.id ?? null;
    expect(clusterNoTagsId).not.toBeNull();
    expect(createCluster?.collaborators?.count).toEqual(1);
    expect(createCluster?.collaborators?.records?.[0]?.organizationId).toEqual(
      testOrgId.toString()
    );
    expect(createCluster?.collaborators?.records?.[0]?.permission).toEqual(
      'viewer'
    );
  });

  it('create a cluster for another org as superadmin', async () => {
    const result = await superClient.sdk.createCluster({
      input: baseClusterInput({
        organizationId: FOREIGN_ORG_ID,
        containerTag: 'test',
        paused: true,
        memorySize: '1gb',
        storageSize: '8gb',
        tags: [],
        collaborators: [
          {
            organizationId: FOREIGN_COLLABORATOR_ORG_ID,
            permission: SetClusterPermission.Viewer
          }
        ],
        clusterConfig: {
          restartTimeUTC: '03:00',
          mediaStoragePath: '../mnnt/',
          mediaStorage: 'edge',
          managementNodeId: ''
        }
      })
    });

    const createCluster = result?.data?.createCluster ?? null;
    clusterAnotherOrgId = createCluster?.id ?? null;
    expect(clusterAnotherOrgId).not.toBeNull();
    expect(createCluster?.collaborators?.count).toEqual(1);
    expect(createCluster?.organizationId).toEqual(FOREIGN_ORG_ID);
    expect(createCluster?.collaborators?.records?.[0]?.permission).toEqual(
      'viewer'
    );
  });

  it('create clusterNode in cluster', async () => {
    const node1 = await superClient.sdk.createClusterNode({
      input: {
        clusterId: clusterId as string,
        name: `${citestMarker}-node1`,
        metrics: {
          mbRam: 8966,
          mbDisk: 874197,
          version: '0.1.0',
          bundleId: 'NOT_FOUND',
          cpuCount: 4,
          bundleDate: 'NOT_FOUND',
          ipExternal: '18.209.46.115',
          ipInternal: '10.0.191.109',
          ansibleVersion: 'ansible 2.5.15'
        },
        nodeConfig: {
          ram: 'foo',
          mbRom: 'fa'
        }
      }
    });
    const createNode1 = node1?.data?.createClusterNode ?? null;
    expect(createNode1).not.toBeNull();
    expect(createNode1?.id).toBeDefined();
    expect(createNode1?.clusterId).toBeDefined();
    expect(createNode1?.createdDateTime).toBeDefined();
    expect(createNode1?.modifiedDateTime).toBeDefined();

    const node2 = await superClient.sdk.createClusterNode({
      input: {
        clusterId: clusterId as string,
        name: `${citestMarker}-node2`,
        metrics: {
          cpuCount: 33,
          mbRam: 8967,
          mbDisk: 874197
        },
        nodeConfig: {
          ram: 'foo2',
          mbRom: 'fa2'
        }
      }
    });
    const createNode2 = node2?.data?.createClusterNode ?? null;
    expect(createNode2).not.toBeNull();
    expect(createNode2?.id).toBeDefined();
    expect(createNode2?.clusterId).toBeDefined();
    expect(createNode2?.createdDateTime).toBeDefined();
    expect(createNode2?.modifiedDateTime).toBeDefined();
  });

  it('create a job in cluster', async () => {
    const job = await superClient.sdk.createJob({
      input: {
        clusterId: clusterId as string,
        tasks: [{ engineId: ENGINE_ID }]
      }
    });
    const createJob = job?.data?.createJob ?? null;
    expect(createJob).not.toBeNull();
    expect(createJob?.id).toBeDefined();
    expect(createJob?.clusterId).toEqual(clusterId);

    const jobTemplate = await superClient.sdk.createJobTemplate({
      input: {
        clusterId: clusterId as string,
        taskTemplates: [{ engineId: ENGINE_ID }]
      }
    });
    const createJobTemplate = jobTemplate?.data?.createJobTemplate ?? null;
    expect(createJobTemplate).not.toBeNull();
    expect(createJobTemplate?.id).toBeDefined();
    expect(createJobTemplate?.clusterId).toEqual(clusterId);
  });

  it('create a job in cluster Group', async () => {
    const result = await superClient.sdk.createJob({
      input: {
        clusterId: clusterGroupId as string,
        tasks: [{ engineId: ENGINE_ID }]
      }
    });
    const createJob = result?.data?.createJob ?? null;
    expect(createJob).not.toBeNull();
    expect(createJob?.id).toBeDefined();
    // The group routes the job onto one of its member clusters.
    expect(
      createJob?.clusterId === clusterIdInGroup1 ||
        createJob?.clusterId === clusterIdInGroup2
    ).toEqual(true);
  });

  it('get a cluster', async () => {
    const result = await superClient.sdk.clusterDetail({
      id: clusterId as string
    });
    const cluster = result?.data?.cluster ?? null;

    expect(cluster).not.toBeNull();
    expect(cluster?.id).toEqual(clusterId);
    /**
     * The jobs/tasks assertions the legacy spec carried stay disabled:
     *   expect(cluster.jobs.records[0].id).toBeDefined();
     *   expect(cluster.tasks.records[0].id).toBeDefined();
     * The job created above is dispatched asynchronously, so it is not reliably
     * attached to the cluster by the time this test runs. Re-enabling it needs a
     * poll/wait, not a bare read.
     */
    expect(cluster?.clusterConfig).toBeDefined();
    expect(cluster?.stateLastUpdatedDateTime).toBeDefined();
    expect(cluster?.mediaStorage).toBeDefined();
    // clusterConfig.mediaStoragePath wins over the top-level input value.
    expect(cluster?.mediaStoragePath).toEqual('../mnnt/');
    expect(cluster?.targetStatus).toBeFalsy();

    nodeId1 = cluster?.nodes?.records?.[0]?.id ?? null;
    nodeId2 = cluster?.nodes?.records?.[1]?.id ?? null;
    expect(nodeId1).not.toBeNull();
    expect(nodeId2).not.toBeNull();
  });

  it('get a Cluster Group', async () => {
    const result = await superClient.sdk.clusterGroup({
      id: clusterGroupId as string
    });
    const cluster = result?.data?.cluster ?? null;

    expect(cluster).not.toBeNull();
    expect(cluster?.id).toEqual(clusterGroupId);
    expect(cluster?.isGroup).toEqual(true);
    expect(cluster?.clusterGroupId).toBeFalsy();
    expect(cluster?.clusters?.count).toEqual(2);
    expect(cluster?.clusters?.records?.[0]?.isGroup).toEqual(false);
    expect(cluster?.clusters?.records?.[0]?.clusterGroupId).toEqual(
      clusterGroupId
    );
    expect(cluster?.clusters?.records?.[1]?.isGroup).toEqual(false);
    expect(cluster?.clusters?.records?.[1]?.clusterGroupId).toEqual(
      clusterGroupId
    );
  });

  it('update state in cluster', async () => {
    const result = await superClient.sdk.updateClusterState({
      input: {
        id: clusterId as string,
        nodes: [
          { nodeId: nodeId1 as string, metrics: { mbRam: 1 } },
          { nodeId: nodeId2 as string, metrics: { mbRam: 2 } }
        ],
        state: { st: 'foo' },
        targetStatus: ClusterStatus.Deploying
      }
    });

    const updateClusterState = result?.data?.updateClusterState ?? null;
    expect(updateClusterState).not.toBeNull();
    expect(updateClusterState?.nodes?.records?.[0]?.id).toBeDefined();
    expect(updateClusterState?.nodes?.records?.[0]?.metrics?.mbRam).toEqual(1);
    expect(updateClusterState?.nodes?.records?.[1]?.id).toBeDefined();
    expect(updateClusterState?.nodes?.records?.[1]?.metrics?.mbRam).toEqual(2);
    expect(updateClusterState?.targetStatus).toEqual(ClusterStatus.Deploying);
  });

  it('pause a cluster', async () => {
    const result = await superClient.sdk.pauseCluster({
      input: { id: clusterId as string }
    });
    expect(result?.data?.pauseCluster).toBeDefined();
    expect(result?.data?.pauseCluster?.id).toEqual(clusterId);
  });

  it('unpause a cluster', async () => {
    const result = await superClient.sdk.unpauseCluster({
      input: { id: clusterId as string }
    });
    expect(result?.data?.unpauseCluster).toBeDefined();
    expect(result?.data?.unpauseCluster?.id).toEqual(clusterId);
  });

  it('update a cluster', async () => {
    const result = await superClient.sdk.updateCluster({
      input: {
        id: clusterId as string,
        name: `${testKey}1`,
        collaborators: [
          {
            organizationId: testOrgId,
            permission: SetClusterPermission.None
          }
        ],
        clusterConfig: { serviceToken: 'token' },
        tags: ['foo', 'bar'],
        status: ClusterStatus.Active,
        serviceToken: 'token1',
        mediaStoragePath: '../mnnt/ttn',
        restartTimeUTC: '02:00',
        subscriptions: []
      }
    });

    const updateCluster = result?.data?.updateCluster ?? null;
    expect(updateCluster?.id).toEqual(clusterId);
    // Validate properties updated
    expect(updateCluster?.name).toEqual(`${testKey}1`);
    expect(updateCluster?.collaborators?.count).toEqual(0);
    // Validate properties that must NOT have been updated
    expect(updateCluster?.containerTag).toEqual('test');
    expect(updateCluster?.tags?.length).toEqual(2);
    expect(updateCluster?.tags?.[0]).toEqual('foo');
    expect(updateCluster?.mediaStoragePath).toEqual('../mnnt/ttn');
    expect(updateCluster?.subscriptions?.count).toEqual(0);
    expect(updateCluster?.clusterConfig?.serviceToken).toEqual('token');
  });

  it('update a cluster of another org as super admin', async () => {
    const result = await superClient.sdk.updateCluster({
      input: {
        id: clusterAnotherOrgId as string,
        name: `${testKey}1`,
        collaborators: [
          {
            organizationId: FOREIGN_ORG_ID,
            permission: SetClusterPermission.None
          }
        ],
        clusterConfig: { serviceToken: 'token' },
        tags: ['foo', 'bar'],
        status: ClusterStatus.Active,
        serviceToken: 'token1',
        mediaStoragePath: '../mnnt/ttn',
        restartTimeUTC: '02:00',
        subscriptions: []
      }
    });

    const updateCluster = result?.data?.updateCluster ?? null;
    expect(updateCluster?.id).toEqual(clusterAnotherOrgId);
    expect(updateCluster?.name).toEqual(`${testKey}1`);
    expect(updateCluster?.organizationId).toEqual(FOREIGN_ORG_ID);
  });

  it('update a cluster of another org use internal api token', async () => {
    // Same update as above, but authenticated by API token rather than session
    // token — the legacy spec's `gqlClient.query(query, undefined, true)`.
    const result = await superClient.sdk.updateCluster(
      {
        input: {
          id: clusterAnotherOrgId as string,
          name: `${testKey}1`,
          collaborators: [
            {
              organizationId: FOREIGN_ORG_ID,
              permission: SetClusterPermission.None
            }
          ],
          clusterConfig: { serviceToken: 'token' },
          tags: ['foo', 'bar'],
          status: ClusterStatus.Active,
          serviceToken: 'token1',
          mediaStoragePath: '../mnnt/ttn',
          restartTimeUTC: '02:00',
          subscriptions: []
        }
      },
      apiTokenHeaders
    );

    const updateCluster = result?.data?.updateCluster ?? null;
    expect(updateCluster?.id).toEqual(clusterAnotherOrgId);
    expect(updateCluster?.name).toEqual(`${testKey}1`);
    expect(updateCluster?.organizationId).toEqual(FOREIGN_ORG_ID);
  });

  it('update a cluster config and keep tags', async () => {
    const result = await superClient.sdk.updateCluster({
      input: {
        id: clusterId as string,
        managementNodeID: nodeId1 as string
      }
    });

    const updateCluster = result?.data?.updateCluster ?? null;
    expect(updateCluster?.id).toEqual(clusterId);
    // Validate properties updated
    expect(updateCluster?.managementNodeID).toEqual(nodeId1);
    expect(updateCluster?.clusterConfig?.managementNodeId).toEqual(nodeId1);
    // Validate properties that must NOT have been updated
    expect(updateCluster?.tags?.length).toEqual(2);
    expect(updateCluster?.tags?.[0]).toEqual('foo');
  });

  it('update a cluster to status failure', async () => {
    const result = await superClient.sdk.updateCluster({
      input: {
        id: clusterId as string,
        status: ClusterStatus.Failure
      }
    });

    const updateCluster = result?.data?.updateCluster ?? null;
    expect(updateCluster?.id).toEqual(clusterId);
    expect(updateCluster?.status).toEqual(ClusterStatus.Failure);
  });

  it('get clusters', async () => {
    const time = new Date(Date.now() + 60 * 1000).toISOString();

    const single = await superClient.sdk.cluster({
      id: clusterNoTagsId as string
    });
    const cluster = single?.data?.cluster ?? null;
    expect(cluster).not.toBeNull();
    expect(cluster?.mediaStoragePath).toEqual('../mnnt/');

    const filtered = await superClient.sdk.clusters({
      id: clusterId as string,
      tagMatch: StringMatch.StartsWith,
      tags: ['fo', 'ba', 'bar'],
      orderBy: [
        { field: ClusterOrderByField.Name, direction: OrderDirection.Asc }
      ],
      dateTimeFilter: [
        { toDateTime: time, field: ClusterDateTimeField.CreatedDateTime }
      ]
    });
    const clusters = filtered?.data?.clusters?.records?.[0] ?? null;
    expect(clusters).not.toBeNull();
    // Validate properties updated
    expect(clusters?.name).toEqual(`${testKey}1`);
    expect(clusters?.collaborators?.count).toEqual(0);
    // Validate properties that must NOT have been updated
    expect(clusters?.containerTag).toEqual('test');
    expect(clusters?.tags?.length).toEqual(2);
    expect(clusters?.tags?.[0]).toEqual('foo');
    expect(clusters?.clusterConfig).toBeDefined();
    expect(clusters?.stateLastUpdatedDateTime).toBeDefined();
    expect(clusters?.mediaStorage).toBeDefined();
    expect(clusters?.targetStatus).toEqual(ClusterStatus.Deploying);

    const activeInGroup = await superClient.sdk.clusters({
      clusterGroupId: clusterGroupId as string,
      clusterGroupIds: [clusterGroupId as string],
      status: ClusterStatus.Active
    });
    const clusterActiveInAGroup = activeInGroup?.data?.clusters ?? null;
    expect(clusterActiveInAGroup?.count).toEqual(2);
    expect(clusterActiveInAGroup?.records?.[0]?.isGroup).toEqual(false);
    expect(clusterActiveInAGroup?.records?.[0]?.clusterGroupId).toEqual(
      clusterGroupId
    );
    expect(clusterActiveInAGroup?.records?.[0]?.status).toEqual(
      ClusterStatus.Active
    );

    const groups = await superClient.sdk.clusters({ isGroup: true, limit: 1 });
    const allClusterGroup = groups?.data?.clusters?.records?.[0] ?? null;
    expect(allClusterGroup?.isGroup).toEqual(true);
    expect(allClusterGroup?.clusterGroupId).toBeFalsy();
  });

  it('get all clusters of another org as superadmin', async () => {
    const result = await superClient.sdk.clusters({
      organizationId: FOREIGN_ORG_ID
    });
    expect(result?.data?.clusters?.records?.[0]?.organizationId).toEqual(
      FOREIGN_ORG_ID
    );
  });

  it('get cluster tags in use by this organization', async () => {
    const result = await superClient.sdk.clusterTags({
      matchType: StringMatch.StartsWith,
      match: 'fo'
    });
    const clusterTags = result?.data?.clusterTags ?? null;
    expect(clusterTags).not.toBeNull();
    expect(clusterTags?.length).toBeGreaterThan(0);
  });
});

/**
 * Pulls any cluster ids that a partially-successful `createClustersInGroup`
 * mutation still managed to create, so they can be torn down. graphql-request
 * exposes the partial payload on the thrown ClientError's `response.data`.
 */
function partialClusterIds(err: unknown): string[] {
  const clientError = err as {
    response?: {
      data?: {
        clusterInGroup1?: { id?: string | null } | null;
        clusterInGroup2?: { id?: string | null } | null;
      } | null;
    } | null;
  };
  const data = clientError?.response?.data ?? null;
  return [data?.clusterInGroup1?.id, data?.clusterInGroup2?.id].filter(
    (id): id is string => Boolean(id)
  );
}
