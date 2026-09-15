/// <reference lib="ES2017" />

/**
 * The project tsconfig under `citest/tools/graphql-api` does not pin
 * `lib`/`target` and does not bundle `@types/node`. Pull in the ES2017 lib
 * (Promise constructor, Array#find, Object.values, ...) and declare just the
 * shape of `process.env` that this file reads. Jest + ts-jest run with the
 * correct lib at runtime; these directives only keep the IDE LSP quiet.
 */
declare const process: { env: { [key: string]: string | undefined } };
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '@api/src/graphqlUtil';
import { safe } from '@citest/helpers/cleanup/utils';
import { deleteTdos } from '@api/test/helpers/tdoCleanup';
import {
  BatchProcessDateTimeField,
  BatchProcessItemStatus,
  BatchProcessOrderField,
  BatchProcessStatus,
  OrderDirection,
  TemplateLanguage
} from '@api/src/gql/gql';
import type { ServerFeatureFlags } from '@api/test/helpers/featureFlags';

/**
 * Feature-flag and marker globals, published by jest.global.setup.js and the
 * Bun preload; read synchronously so `describeif` sees real values at
 * collection time.
 */
interface CitestGlobals extends ServerFeatureFlags {
  citestMarker?: string;
}
const citestGlobals = globalThis as unknown as CitestGlobals;

/**
 * CITEST for TDO batch actions API. This test only runs on environments
 * that enable the enableBatchActionsAPI feature flag.
 */

interface Cluster {
  id: string;
  /** Schema type is Int, not String — see `Cluster.edgeVersion` in gql.ts. */
  edgeVersion?: number | null;
}

interface DagTemplate {
  id: string;
  cognitiveCategoryId?: string;
  targetOrganizationId?: string;
}

interface TemporalDataObjectRecord {
  id: string;
  name?: string;
}

interface PaginatedTdos {
  records: TemporalDataObjectRecord[];
  count: number;
  offset: number;
  limit: number;
}

interface BatchJobDetails {
  batchId: string;
}

interface ExecuteJobTemplateResult {
  id: string;
  status: string;
  concurrency: number;
  itemsCompleted: number;
  itemsFailed: number;
  itemsTotal: number;
  itemsRunning: number;
  itemsPending: number;
  details: BatchJobDetails;
}

interface BatchCreationResult {
  id: string;
  selectionCriteria: {
    tdoIds?: string[];
    searchQuery?: Record<string, unknown>;
  };
  isMutable: boolean;
  temporalDataObjects: PaginatedTdos;
  temporalDataObjectsIds: {
    records: string[];
    count: number;
    offset: number;
    limit: number;
  };
  executeJobTemplate: ExecuteJobTemplateResult;
}

interface BatchProcessJob {
  id: string;
  name?: string;
  status?: string;
}

interface BatchProcessTemporalDataObject {
  id: string;
  organizationId?: string;
  name?: string;
  status?: string;
}

interface BatchProcessAction {
  targetId?: string;
  actionId?: string;
  status?: string;
  details?: Record<string, unknown>;
  job?: BatchProcessJob;
  temporalDataObject?: BatchProcessTemporalDataObject;
}

interface BatchProcessActions {
  records: BatchProcessAction[];
  offset: number;
  limit: number;
  count: number;
}

interface BatchProcess {
  id: string;
  status: string;
  details: BatchJobDetails;
  concurrency: number;
  itemsCompleted: number;
  itemsFailed: number;
  itemsTotal: number;
  itemsRunning: number;
  itemsPending: number;
  TDOBatch: {
    id: string;
    isMutable: boolean;
    selectionCriteria: {
      tdoIds?: string[];
      searchQuery?: Record<string, unknown>;
    };
    temporalDataObjects: PaginatedTdos;
    temporalDataObjectsIds: {
      records: string[];
      count: number;
      offset: number;
      limit: number;
    };
  };
  actions?: BatchProcessActions;
}

let batchCreated: BatchCreationResult;
let orgId: string;
const startTime = new Date().toISOString();

/**
 * Retrieves a GraphQL client authenticated as the configured superadmin.
 */
async function getGraphqlClient(): Promise<GraphqlClient> {
  const gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  orgId = gqlClient.sessionToken ? 'test-org' : 'unknown';
  return gqlClient;
}

const citestMarker = citestGlobals.citestMarker || 'citest-should-delete';

/**
 * Conditional describe block that only runs if the feature flag is enabled.
 */
const describeif = (condition: boolean, name: string, fn: () => void): void => {
  if (condition) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
};

/**
 * Helper to retrieve the organization ID from the authenticated client.
 */
async function extractOrgId(gqlClient: GraphqlClient): Promise<string> {
  const result = await gqlClient.sdk.me({});
  return result?.data?.me?.organizationId?.toString() || '';
}

/**
 * Sleep utility for polling operations.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create temporary TDOs for batch testing.
 */
async function createTdos(gqlClient: GraphqlClient): Promise<string[]> {
  /**
   * Four identical TDOs. The pre-conversion version aliased them into one
   * mutation (`tdo1:`/`tdo2:`/...), which a static document cannot express;
   * four typed calls in parallel are equivalent and let each one be checked.
   */
  const tdoInput = {
    status: 'uploaded',
    startDateTime: 1682050619,
    stopDateTime: 1682052419,
    addToIndex: true,
    isPublic: true,
    contentTemplates: [
      {
        schemaId: 'f4e3bb04-f84d-45ad-a088-5942f731eda2',
        data: { name: 'test-0205-dev', userId: '19592130' }
      }
    ]
  };

  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      gqlClient.sdk.createTDO({ input: tdoInput })
    )
  );

  const tdoList = results
    .map((r) => r?.data?.createTDO?.id ?? null)
    .filter((id): id is string => Boolean(id));

  expect(tdoList.length).toEqual(4);
  return tdoList;
}



/**
 * Handlebars DAG the batch template is built from. Carried over verbatim from
 * the pre-conversion inline mutation — it was a GraphQL string literal nested
 * inside a TS template literal, so it was double-escaped; here it is a single
 * JSON-escaped TS string with the same decoded value (5 tasks, 4 routes).
 */
const DAG_DEFINITION = "{\"targetId\": \"{{{TARGET_ID}}}\",\n\"clusterId\":\"rt-9d7a5d1b-ffe0-4d71-a982-190522cdf272\",\"tasks\":[{\"engineId\":\"9e611ad7-2d3b-48f6-a51b-0a1ba40fe255\",\"ioFolders\":[{\"referenceId\":\"0_0 OUTPUT\",\"mode\":\"stream\",\"type\":\"output\"}],\"executionPreferences\":{\"parentCompleteBeforeStarting\":null}},{\"engineId\":\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\",\"ioFolders\":[{\"referenceId\":\"1_0 OUTPUT\",\"mode\":\"chunk\",\"type\":\"output\"},{\"referenceId\":\"1_0 INPUT\",\"mode\":\"stream\",\"type\":\"input\"}],\"executionPreferences\":{\"parentCompleteBeforeStarting\":true},\"payload\":{\"ffmpegTemplate\":\"audio\"}},{\"engineId\":\"352556c7-de07-4d55-b33f-74b1cf237f25\",\"ioFolders\":[{\"referenceId\":\"1_1 INPUT\",\"mode\":\"stream\",\"type\":\"input\"}],\"executionPreferences\":{\"parentCompleteBeforeStarting\":true}},{\"engineId\":\"bbb11671-e21e-4e0f-a790-2ef1841ee554\",\"ioFolders\":[{\"referenceId\":\"2_0 OUTPUT\",\"mode\":\"chunk\",\"type\":\"output\"},{\"referenceId\":\"2_0 INPUT\",\"mode\":\"chunk\",\"type\":\"input\"}],\"executionPreferences\":{\"parentCompleteBeforeStarting\":true},\"payload\":{\"keywords\":null,\"advancedPunctuation\":\"true\",\"diarization\":null,\"speakerChangeSensitivity\":\"0.4\",\"entitiesRecognition\":\"false\"}},{\"engineId\":\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\",\"ioFolders\":[{\"referenceId\":\"3_0 INPUT\",\"mode\":\"chunk\",\"type\":\"input\"}],\"executionPreferences\":{\"parentCompleteBeforeStarting\":true}}],\"routes\":[{\"parentIoFolderReferenceId\":\"0_0 OUTPUT\",\"childIoFolderReferenceId\":\"1_0 INPUT\"},{\"parentIoFolderReferenceId\":\"0_0 OUTPUT\",\"childIoFolderReferenceId\":\"1_1 INPUT\"},{\"parentIoFolderReferenceId\":\"1_0 OUTPUT\",\"childIoFolderReferenceId\":\"2_0 INPUT\"},{\"parentIoFolderReferenceId\":\"2_0 OUTPUT\",\"childIoFolderReferenceId\":\"3_0 INPUT\"}]}";

/**
 * Create a DAG template for batch processing.
 */
async function createDagTemplate(gqlClient: GraphqlClient): Promise<DagTemplate> {
  const dagResult = await gqlClient.sdk.createDagTemplate({
    input: {
      targetOrganizationId: orgId,
      name: `${citestMarker} Webstream Speechmatics Reprocess Template`,
      description: 'English Transcription',
      tags: ['transcription'],
      dagTemplateLanguage: TemplateLanguage.Handlebars,
      dag: DAG_DEFINITION
    }
  });
  const dagCreated = dagResult?.data?.createDagTemplate as DagTemplate;
  expect(dagCreated).toBeDefined();
  expect(dagCreated.id).toBeDefined();
  expect(dagCreated.targetOrganizationId).toEqual(orgId);
  return dagCreated;
}

/**
 * Delete a DAG template after testing.
 */
async function deleteDagTemplate(
  gqlClient: GraphqlClient,
  dagTemplateId: string
): Promise<void> {
  const dagResult = await gqlClient.sdk.deleteDagTemplate({
    id: dagTemplateId
  });
  const dagDeleted = dagResult?.data?.deleteDagTemplate;
  expect(dagDeleted).toBeDefined();
  expect(dagDeleted.id).toEqual(dagTemplateId);
  expect(dagDeleted.message).toEqual('DAG Template deleted');
}

/**
 * Create a cluster for batch processing.
 */
async function createCluster(gqlClient: GraphqlClient): Promise<Cluster> {
  const testName = citestMarker + '_engine_' + Date.now();
  const cluster = await gqlClient.sdk.createCluster({
    input: {
      name: `${testName}_cluster`,
      allowedEngines: [],
      dockerCredentials: {},
      organizationId: orgId
    }
  });
  const clusterCreated = cluster?.data?.createCluster as Cluster;
  expect(clusterCreated).toBeDefined();
  expect(clusterCreated.id).toBeDefined();
  return clusterCreated;
}

/**
 * Delete a cluster after testing.
 */
async function deleteCluster(
  gqlClient: GraphqlClient,
  clusterId: string
): Promise<void> {
  const cluster = await gqlClient.sdk.deleteCluster({ id: clusterId });
  const clusterDeleted = cluster?.data?.deleteCluster;
  expect(clusterDeleted).toBeDefined();
  expect(clusterDeleted.id).toEqual(clusterId);
}

/**
 * Build a GraphQL query for creating a batch with dynamic TDO list.
 */
function dynamicBatchVariables(
  tdoList: string[],
  dagTemplate: DagTemplate,
  cluster: Cluster
) {
  return {
    input: {
      name: `${citestMarker} my new dynamic batch`,
      batchSelector: {
        searchQuery: {
          index: ['mine'],
          limit: 500,
          offset: 0,
          query: {
            operator: 'or',
            conditions: tdoList.map((tdo) => ({
              field: 'recordingId',
              operator: 'query_string',
              value: tdo
            }))
          },
          sort: [{ field: 'recordingId', order: 'desc' }]
        }
      },
      orgId,
      createdBy: 'rootUser'
    },
    tdoLimit: 1,
    tdoIdLimit: 2,
    jobTemplate: {
      concurrency: 100,
      processDefinition: {
        dagTemplateId: dagTemplate.id,
        clusterId: cluster.id
      }
    }
  };
}

/**
 * Build a GraphQL query for retrieving batch process status.
 */
function batchProcessVariables(id: string, status: BatchProcessStatus) {
  return {
    input: {
      id,
      status: [status],
      orderBy: [
        {
          field: BatchProcessOrderField.DateCreated,
          direction: OrderDirection.Desc
        }
      ],
      dateTimeFilter: [
        {
          field: BatchProcessDateTimeField.DateCreated,
          fromDateTime: startTime,
          toDateTime: new Date().toISOString()
        }
      ],
      limit: 2,
      offset: 0
    },
    tdoLimit: 1,
    tdoIdLimit: 2,
    actionOffset: 0,
    actionLimit: 2,
    actionStatus: BatchProcessItemStatus.Failed
  };
}

describeif(
  citestGlobals.enableBatchActionsAPI ?? false,
  'citest_tdo: batch actions',
  () => {
  let tdoList: string[] = [];
  let dagTemplate: DagTemplate;
  let cluster: Cluster;
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await getGraphqlClient();
    orgId = await extractOrgId(gqlClient);

    /**
     * Get some TDOs to be used as members of a new batch.
     */
    tdoList = await createTdos(gqlClient);
    dagTemplate = await createDagTemplate(gqlClient);
    cluster = await createCluster(gqlClient);
  });

  afterAll(async () => {
    /**
     * Cancel batch if it was created.
     */
    if (batchCreated) {
      await safe(`cancel batch ${batchCreated.id}`, async () => {
        const result = await gqlClient.sdk.cancelTDOBatchProcess({
          id: batchCreated.id
        });
        expect(result?.data?.cancelTDOBatchProcess?.id).toContain(
          batchCreated.id
        );
      });
    }

    /**
     * Delete DAG template if it was created.
     */
    if (dagTemplate) {
      await safe(`delete DAG template ${dagTemplate.id}`, async () => {
        await deleteDagTemplate(gqlClient, dagTemplate.id);
      });
    }

    /**
     * Delete cluster if it was created.
     */
    if (cluster) {
      await safe(`delete cluster ${cluster.id}`, async () => {
        await deleteCluster(gqlClient, cluster.id);
      });
    }

    /**
     * Delete TDOs if they were created.
     */
    if (tdoList.length) {
      await safe('delete TDOs', async () => {
        await deleteTdos(gqlClient, tdoList);
      });
    }
  });

  describe('#batch', function () {
    let dynamicBatchId: string;

    it('create a new batch with static tdo list and triggering a executeJobTemplate mutator', async () => {
      /**
       * Creating a new batch with static TDO list.
       */
      const result = await gqlClient.sdk.createTDOBatch({
        input: {
          name: `${citestMarker} my new ci test batch`,
          batchSelector: { tdoIds: tdoList },
          orgId,
          createdBy: 'rootUser'
        },
        tdoLimit: 1,
        tdoIdLimit: 2,
        jobTemplate: {
          concurrency: 100,
          processDefinition: {
            dagTemplateId: dagTemplate.id,
            clusterId: cluster.id
          }
        }
      });
      batchCreated = result?.data?.createTDOBatch as BatchCreationResult;
      expect(batchCreated).toBeDefined();
      expect(batchCreated.id).toBeDefined();
      expect(batchCreated.isMutable).toEqual(false);
      expect(batchCreated.selectionCriteria.tdoIds?.length).toEqual(
        tdoList.length
      );
      expect(batchCreated.temporalDataObjects.records.length).toEqual(1);
      expect(batchCreated.temporalDataObjects.records[0].id).toBeDefined();
      expect(batchCreated.temporalDataObjects.records[0].name).toBeDefined();
      expect(batchCreated.temporalDataObjects.count).toEqual(1);
      expect(batchCreated.temporalDataObjects.limit).toEqual(1);
      expect(batchCreated.temporalDataObjects.offset).toEqual(0);
      expect(batchCreated.temporalDataObjectsIds.records.length).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.count).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.limit).toEqual(2);
      expect(batchCreated.temporalDataObjectsIds.offset).toEqual(0);
      expect(batchCreated.executeJobTemplate.id).toBeDefined();
      expect(batchCreated.executeJobTemplate.status).toEqual('pending');
      expect(batchCreated.executeJobTemplate.concurrency).toEqual(100);
      expect(batchCreated.executeJobTemplate.itemsCompleted).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsFailed).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsTotal).toEqual(
        tdoList.length
      );
      expect(batchCreated.executeJobTemplate.itemsRunning).toEqual(0);
      expect(batchCreated.executeJobTemplate.itemsPending).toEqual(
        tdoList.length
      );
      expect(batchCreated.executeJobTemplate.details.batchId).toEqual(
        batchCreated.id
      );
    });

    it('get the new batch with static tdo list', async () => {
      /**
       * Getting the new batch created in the previous test.
       */
      const batchFound = await gqlClient.sdk.TDOBatch({
        id: batchCreated.id,
        tdoLimit: 1,
        tdoIdLimit: 2
      });
      const tdoBatch = batchFound?.data?.TDOBatch;
      expect(tdoBatch).toBeDefined();
      expect(tdoBatch?.id).toEqual(batchCreated.id);
      expect(tdoBatch?.selectionCriteria?.tdoIds?.length).toEqual(
        tdoList.length
      );
      expect(tdoBatch?.isMutable).toEqual(false);
      expect(tdoBatch?.temporalDataObjects?.records?.length).toEqual(1);
      expect(tdoBatch?.temporalDataObjects?.records?.[0]?.id).toBeDefined();
      expect(tdoBatch?.temporalDataObjects?.records?.[0]?.name).toBeDefined();
      expect(tdoBatch?.temporalDataObjects?.count).toEqual(1);
      expect(tdoBatch?.temporalDataObjects?.limit).toEqual(1);
      expect(tdoBatch?.temporalDataObjects?.offset).toEqual(0);
      expect(tdoBatch?.temporalDataObjectsIds?.records?.length).toEqual(2);
      expect(tdoBatch?.temporalDataObjectsIds?.count).toEqual(2);
      expect(tdoBatch?.temporalDataObjectsIds?.limit).toEqual(2);
      expect(tdoBatch?.temporalDataObjectsIds?.offset).toEqual(0);
    });

    it('creating a batch with dynamic tdo list and triggering a executeJobTemplate mutator', async () => {
      const result = await gqlClient.sdk.createTDOBatch(
        dynamicBatchVariables(tdoList, dagTemplate, cluster)
      );
      const dynamicBatch = result?.data?.createTDOBatch as BatchCreationResult;
      expect(dynamicBatch).toBeDefined();
      expect(dynamicBatch.id).toBeDefined();
      expect(dynamicBatch.isMutable).toEqual(true);
      expect(dynamicBatch.selectionCriteria.searchQuery).toBeDefined();
      expect(dynamicBatch.temporalDataObjects.records.length).toEqual(0);
      expect(dynamicBatch.temporalDataObjects.count).toEqual(0);
      expect(dynamicBatch.temporalDataObjects.limit).toEqual(1);
      expect(dynamicBatch.temporalDataObjects.offset).toEqual(0);
      expect(dynamicBatch.temporalDataObjectsIds.records.length).toEqual(0);
      expect(dynamicBatch.temporalDataObjectsIds.count).toEqual(0);
      expect(dynamicBatch.temporalDataObjectsIds.limit).toEqual(2);
      expect(dynamicBatch.temporalDataObjectsIds.offset).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.id).toBeDefined();
      expect(dynamicBatch.executeJobTemplate.status).toEqual('creating');
      expect(dynamicBatch.executeJobTemplate.concurrency).toEqual(100);
      expect(dynamicBatch.executeJobTemplate.itemsCompleted).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.itemsFailed).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.itemsTotal).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.itemsRunning).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.itemsPending).toEqual(0);
      expect(dynamicBatch.executeJobTemplate.details.batchId).toEqual(
        dynamicBatch.id
      );
      dynamicBatchId = dynamicBatch.id;
    });

    it('cancel batch', async () => {
      try {
        const result = await gqlClient.sdk.cancelTDOBatchProcess({
          id: dynamicBatchId
        });
        expect(result?.data?.cancelTDOBatchProcess?.id).toEqual(dynamicBatchId);
      } catch (error) {
        expect(`${error}`).toContain('not_found');
      }
    });
  });

  describe('#batch actions', function () {
    it('get the new batch process', async () => {
      /**
       * Getting the batch process triggered with the batch creation.
       * Its status at some point could be 'pending', 'inProgress' or 'completed'.
       */
      let batchProcess: BatchProcess | undefined;
      let status: BatchProcessStatus;
      const availableStatus: BatchProcessStatus[] = [
        BatchProcessStatus.Canceling,
        BatchProcessStatus.Canceled,
        BatchProcessStatus.Creating,
        BatchProcessStatus.Pending,
        BatchProcessStatus.Running,
        BatchProcessStatus.Completed,
        BatchProcessStatus.Failed,
        BatchProcessStatus.Aborted
      ];

      for (let i = 0; i < availableStatus.length; i++) {
        await sleep(500);

        status = availableStatus[i];
        const batchProcessFound = await gqlClient.sdk.TDOBatchProcesses(
          batchProcessVariables(batchCreated.executeJobTemplate.id, status)
        );
        const tdoBatchProcesses = batchProcessFound?.data?.TDOBatchProcesses;

        if (tdoBatchProcesses && Array.isArray(tdoBatchProcesses) && tdoBatchProcesses.length > 0) {
          batchProcess = tdoBatchProcesses[0] as BatchProcess;
          break;
        }
      }

      expect(batchProcess).toBeDefined();
      expect(batchProcess?.id).toBeDefined();
      expect(batchProcess?.concurrency).toEqual(100);

      if (batchProcess?.status === 'pending') {
        expect(batchProcess.itemsPending).toEqual(tdoList.length);
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }

      if (batchProcess?.status === 'running') {
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }

      if (batchProcess?.status === 'completed') {
        expect(
          (batchProcess.itemsCompleted || 0) + (batchProcess.itemsFailed || 0)
        ).toEqual(tdoList.length);
        expect(batchProcess.itemsTotal).toEqual(tdoList.length);
      }

      expect(batchProcess?.details?.batchId).toEqual(batchCreated.id);
      expect(batchProcess?.TDOBatch?.id).toEqual(batchCreated.id);
      expect(batchProcess?.TDOBatch?.isMutable).toEqual(false);
      expect(batchProcess?.TDOBatch?.selectionCriteria?.tdoIds?.length).toEqual(
        tdoList.length
      );
      expect(batchProcess?.TDOBatch?.temporalDataObjects?.records?.length).toEqual(
        1
      );
      expect(
        batchProcess?.TDOBatch?.temporalDataObjects?.records?.[0]?.id
      ).toBeDefined();
      expect(
        batchProcess?.TDOBatch?.temporalDataObjects?.records?.[0]?.name
      ).toBeDefined();
      expect(batchProcess?.TDOBatch?.temporalDataObjects?.count).toEqual(1);
      expect(batchProcess?.TDOBatch?.temporalDataObjects?.limit).toEqual(1);
      expect(batchProcess?.TDOBatch?.temporalDataObjects?.offset).toEqual(0);
      expect(
        batchProcess?.TDOBatch?.temporalDataObjectsIds?.records?.length
      ).toEqual(2);
      expect(batchProcess?.TDOBatch?.temporalDataObjectsIds?.count).toEqual(2);
      expect(batchProcess?.TDOBatch?.temporalDataObjectsIds?.limit).toEqual(2);
      expect(batchProcess?.TDOBatch?.temporalDataObjectsIds?.offset).toEqual(0);
    });
  });
});
