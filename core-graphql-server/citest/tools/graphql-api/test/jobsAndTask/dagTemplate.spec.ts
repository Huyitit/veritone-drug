import * as _ from 'lodash';
import {
  AuthType,
  createGraphqlClient,
  GraphqlClient
} from '../../src/graphqlUtil';
import { ClusterStatus, ClusterType, UpdateJobsStatus } from '../../src/gql';
import { safe } from '../../src/helpers/commonHelper';
import { createIsolatedSuperadmin } from '../helpers/superadminSession';

const citestMarker = (global as any).citestMarker || 'citest-should-delete';
const testName = citestMarker + '-test_dag_template_intergration_' + Date.now();

const testOrgId = 14954;
const testClusterName = citestMarker + Date.now();

const sampleDagTemplate = `
{
  "tasks": [
    {
      "engineId": "{{{firstEngineId}}}",
      "payload": {
        "url": "{{{UPLOAD_URL}}}"
      },
      "executionPreferences": {
        {{#if priorityOfFirst}} "priority": {{minus priorityOfFirst 5}} {{/if}}
      },
      "ioFolders": [
        {
          "referenceId": "wsa-output",
          "mode": "stream",
          "type": "output"
        }
      ]
    },
    {
      "engineId": "{{{secondEngineId}}}",
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
        "parentCompleteBeforeStarting": true
      },
      "ioFolders": [
        {
          "referenceId": "pb-input",
          "mode": "stream",
          "type": "input"
        }
      ]
    },
    {
      "engineId": "8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440",
      "payload": {
        "ffmpegTemplate": "video",
        "customFFMPEGProperties": {
          "chunkSizeInSeconds": {{#if chunkSizeInSeconds}} "{{{chunkSizeInSeconds}}}" {{else}} "300" {{/if}}
        }
      },
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
        "parentCompleteBeforeStarting": true
      },
      "ioFolders": [
        {
          "referenceId": "si-input",
          "mode": "stream",
          "type": "input"
        },
        {
          "referenceId": "si-output",
          "mode": "chunk",
          "type": "output"
        }
      ]
    },
    {
      "engineId": "8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3",
      "executionPreferences": {
        {{#if priority}} "priority": {{{priority}}}, {{/if}}
        "parentCompleteBeforeStarting": true
      },
      "ioFolders": [
        {
          "referenceId": "ow-input",
          "mode": "chunk",
          "type": "input"
        }
      ]
    }
  ],
  "routes": [
    {
      "parentIoFolderReferenceId": "wsa-output",
      "childIoFolderReferenceId": "pb-input"
    },
    {
      "parentIoFolderReferenceId": "wsa-output",
      "childIoFolderReferenceId": "si-input"
    },
    {
      "parentIoFolderReferenceId": "si-output",
      "childIoFolderReferenceId": "ow-input"
    }
  ]
}
`;

describe('citest_jobs: dag template tests', () => {
  let sdkClient: GraphqlClient;
  let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
  let dagTemplateId: string;
  let clusterId: string;
  let jobId: string;

  beforeAll(async () => {
    const bootstrapClient = await createGraphqlClient(AuthType.SESSION_TOKEN);

    isolatedSuperadmin = await createIsolatedSuperadmin(bootstrapClient);
    sdkClient = isolatedSuperadmin.client;

    expect(sdkClient.sessionToken).toBeDefined();
  });

  afterAll(async () => {
    if (jobId) {
      await safe(`update job to queued`, () =>
        sdkClient.sdk.updateJobs({
          input: { ids: [jobId], status: UpdateJobsStatus.Queued }
        })
      );

      await safe(`cancel job`, () => sdkClient.sdk.cancelJob({ id: jobId }));
    }

    if (dagTemplateId) {
      await safe('delete dag template', () =>
        sdkClient.sdk.deleteDagTemplate({ id: dagTemplateId })
      );
    }

    if (clusterId) {
      await safe('delete cluster', () =>
        sdkClient.sdk.deleteCluster({ id: clusterId })
      );
    }

    if (isolatedSuperadmin) {
      await isolatedSuperadmin.cleanup();
    }
  });

  it('should create a DAG template', async () => {
    const result = await sdkClient.sdk.createDagTemplate({
      input: {
        name: testName,
        dag: sampleDagTemplate,
        dagTemplateLanguage: 'Handlebars',
        tags: ['foo', 'bar']
      }
    });

    const createDagTemplate = _.get(result, 'data.createDagTemplate');
    expect(createDagTemplate).toBeDefined();
    expect(createDagTemplate.id).toBeDefined();
    expect(createDagTemplate.tags).toEqual(['foo', 'bar']);
    dagTemplateId = _.get(createDagTemplate, 'id');
  });

  it('should add DAG template to organization', async () => {
    const result: any = await sdkClient.sdk.addDagTemplateToOrganization({
      input: {
        organizationId: `${testOrgId}`,
        dagTemplateId
      }
    });

    const addDagTemplateToOrganization = _.get(
      result,
      'data.addDagTemplateToOrganization'
    );
    expect(addDagTemplateToOrganization).toBeDefined();
    expect(addDagTemplateToOrganization.dagTemplateId).toEqual(dagTemplateId);
    expect(addDagTemplateToOrganization.organizationIds).toEqual([
      testOrgId.toString()
    ]);
  });

  it('should remove DAG template from organization', async () => {
    const result: any = await sdkClient.sdk.removeDagTemplateFromOrganization({
      input: {
        dagTemplateId,
        organizationId: `${testOrgId}`
      }
    });

    const removeDagTemplateFromOrganization = _.get(
      result,
      'data.removeDagTemplateFromOrganization'
    );
    expect(removeDagTemplateFromOrganization).toBeDefined();
    expect(removeDagTemplateFromOrganization.dagTemplateId).toEqual(
      dagTemplateId
    );
    expect(removeDagTemplateFromOrganization.organizationIds).toEqual([]);
  });

  it('should get DAG template by id', async () => {
    const result: any = await sdkClient.sdk.dagTemplate({ id: dagTemplateId });
    const dagTemplate = _.get(result, 'data.dagTemplate');
    expect(dagTemplate).toBeDefined();
    expect(dagTemplate.id).toEqual(dagTemplateId);
    expect(dagTemplate.name).toEqual(testName);
    expect(dagTemplate.dag.template).toBeDefined();
    expect(dagTemplate.dagTemplateLanguage).toEqual('Handlebars');
  });

  it('should update DAG template', async () => {
    const dagName = citestMarker + ' test dag 1';

    const result: any = await sdkClient.sdk.updateDagTemplate({
      input: {
        id: dagTemplateId,
        name: dagName,
        mimeType: 'video/mp4',
        tags: ['bar']
      }
    });

    const updateDagTemplate = _.get(result, 'data.updateDagTemplate');
    expect(updateDagTemplate).toBeDefined();
    expect(updateDagTemplate.id).toEqual(dagTemplateId);
    expect(updateDagTemplate.name).toEqual(dagName);
    expect(updateDagTemplate.mimeType).toEqual('video/mp4');
    expect(updateDagTemplate.tags).toEqual(['bar']);
  });

  it('should get list DAG templates', async () => {
    const result: any = await sdkClient.sdk.dagTemplates({ limit: 1 });

    const dagTemplates = _.get(result, 'data.dagTemplates');
    expect(dagTemplates).toBeDefined();
    expect(dagTemplates.count).toEqual(1);
    expect(dagTemplates.records.length).toEqual(1);
  });

  it('should create a new cluster for testing', async () => {
    const result: any = await sdkClient.sdk.createCluster({
      input: {
        name: testClusterName,
        edgeVersion: 3,
        status: ClusterStatus.Active,
        organizationId: `${testOrgId}`,
        type: ClusterType.Rt,
        allowedEngines: [],
        dockerCredentials: {}
      }
    });

    const createCluster = _.get(result, 'data.createCluster');
    expect(createCluster).toBeDefined();
    expect(createCluster.id).toBeDefined();

    clusterId = createCluster.id;
  });

  it('should launch multiple engines job with DAG template', async () => {
    const result: any = await sdkClient.sdk.launchDAGTemplate({
      input: {
        uploadUrl: 'http://localhost',
        clusterId,
        dagTemplateId,
        dagTemplateFields: [
          {
            fieldName: 'firstEngineId',
            fieldValue: '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
          },
          {
            fieldName: 'secondEngineId',
            fieldValue: '352556c7-de07-4d55-b33f-74b1cf237f25'
          },
          { fieldName: 'priorityOfFirst', fieldValue: '5' } // test math of handlebars-helpers
        ]
      }
    });

    const createJob = _.get(result, 'data.launchDAGTemplate');
    expect(createJob).toBeDefined();
    expect(createJob.id).toBeDefined();
    jobId = createJob.id;
    expect(createJob.targetId).toBeDefined();
    expect(_.get(createJob, 'tasks.count')).toEqual(4);
    expect(createJob.routes.length).toEqual(3);
  });
});
