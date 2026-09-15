const helpers = require('../../helpers/index');
const GraphqlClient = require('../../helpers/gql.js');
const clusterHelper = require('../../helpers/cluster.js');
const jobHelper = require('../../helpers/job.js');
const config = helpers.config;

const _ = require('lodash');
const { safe } = require('../../helpers/cleanup/utils');
const citestMarker = global.citestMarker || 'citest-should-delete';
const testName = citestMarker + '-test_dag_template_intergration_' + Date.now();

let dagTemplateId;
const testOrgId = 14954;
const testClusterName = citestMarker + Date.now();
let clusterId, jobId;
const sampleDagTemplate =
  '{\\"tasks\\": [\\n  {\\n    \\"engineId\\": \\"{{{firstEngineId}}}\\",\\n    \\"payload\\": {\\n      \\"url\\": \\"{{{UPLOAD_URL}}}\\"\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priorityOfFirst}} \\"priority\\":{{minus priorityOfFirst 5}} {{/if}}\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"wsa-output\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"{{{secondEngineId}}}\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"pb-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440\\",\\n    \\"payload\\": {\\n      \\"ffmpegTemplate\\": \\"video\\",\\n      \\"customFFMPEGProperties\\": {\\n        \\"chunkSizeInSeconds\\": {{#if chunkSizeInSeconds}} \\"{{{chunkSizeInSeconds}}}\\" {{else}} \\"300\\" {{/if}}\\n      }\\n    },\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"si-input\\",\\n        \\"mode\\": \\"stream\\",\\n        \\"type\\": \\"input\\"\\n      },\\n      {\\n        \\"referenceId\\": \\"si-output\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"output\\"\\n      }\\n    ]\\n  },\\n  {\\n    \\"engineId\\": \\"8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3\\",\\n    \\"executionPreferences\\": {\\n      {{#if priority}} \\"priority\\":{{{priority}}}, {{/if}}\\n      \\"parentCompleteBeforeStarting\\": true\\n    },\\n    \\"ioFolders\\": [\\n      {\\n        \\"referenceId\\": \\"ow-input\\",\\n        \\"mode\\": \\"chunk\\",\\n        \\"type\\": \\"input\\"\\n      }\\n    ]\\n  }\\n],\\n\\"routes\\": [\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"pb-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"wsa-output\\",\\n    \\"childIoFolderReferenceId\\": \\"si-input\\"\\n  },\\n  {\\n    \\"parentIoFolderReferenceId\\": \\"si-output\\",\\n    \\"childIoFolderReferenceId\\": \\"ow-input\\"\\n  }\\n]}';

describe('citest_jobs: dag template tests', () => {
  let gqlClient;
  beforeAll(async () => {
    const env = config.env;
    gqlClient = new GraphqlClient(env);
    const result = await gqlClient.connect();
    expect(result.apiToken).toBeDefined();
    expect(result.token).toBeDefined();
  });

  afterAll(async () => {
    if (jobId) {
      await safe(`update job to queued`, () =>
        jobHelper.helpUpdateJobs(
          { gqlClient },
          { ids: [jobId], status: 'queued' }
        )
      );

      await safe(`cancel job`, () =>
        jobHelper.helpCancelJob({ gqlClient }, { jobId: jobId })
      );
    }

    if (dagTemplateId) {
      await safe('delete dag template', async () => {
        const query = `mutation {
          deleteDagTemplate(id: "${dagTemplateId}") {
            id
            message
          }
        }`;

        await gqlClient.query(query);
      });
    }

    if (clusterId) {
      await safe('delete cluster', async () =>
        clusterHelper.helpDeleteCluster({ gqlClient }, { clusterId })
      );
    }
  });

  it('should create a DAG template', async () => {
    const query = `mutation {
      createDagTemplate(input: {
        name: "${testName}"
        dag: "${sampleDagTemplate}"
        dagTemplateLanguage: "Handlebars"
        tags: ["foo", "bar"]
      }) {
        id
        name
        description
        cognitiveCategoryId
        mimeType
        dag
        dagTemplateLanguage
        targetOrganizationId
        tags
      }
    }`;

    const result = await gqlClient.query(query);
    const createDagTemplate = _.get(result, 'createDagTemplate');
    expect(createDagTemplate).toBeDefined();
    expect(createDagTemplate.id).toBeDefined();
    expect(createDagTemplate.tags).toEqual(['foo', 'bar']);
    dagTemplateId = _.get(createDagTemplate, 'id');
  });

  it('should add DAG template to organization', async () => {
    const query = `mutation {
      addDagTemplateToOrganization(input: {
        organizationId: ${testOrgId}
        dagTemplateId: "${dagTemplateId}"
      }) {
        dagTemplateId
        organizationIds
      }
    }`;

    const result = await gqlClient.query(query);
    const addDagTemplateToOrganization = _.get(
      result,
      'addDagTemplateToOrganization'
    );
    expect(addDagTemplateToOrganization).toBeDefined();
    expect(addDagTemplateToOrganization.dagTemplateId).toEqual(dagTemplateId);
    expect(addDagTemplateToOrganization.organizationIds).toEqual([
      testOrgId.toString()
    ]);
  });

  it('should remove DAG template from organization', async () => {
    const query = `mutation {
      removeDagTemplateFromOrganization(input: {
        dagTemplateId: "${dagTemplateId}"
        organizationId: ${testOrgId}
      }) {
        dagTemplateId
        organizationIds
      }
    }`;

    const result = await gqlClient.query(query);
    const removeDagTemplateFromOrganization = _.get(
      result,
      'removeDagTemplateFromOrganization'
    );
    expect(removeDagTemplateFromOrganization).toBeDefined();
    expect(removeDagTemplateFromOrganization.dagTemplateId).toEqual(
      dagTemplateId
    );
    expect(removeDagTemplateFromOrganization.organizationIds).toEqual([]);
  });

  it('should get DAG template by id', async () => {
    const query = `query {
      dagTemplate(id: "${dagTemplateId}") {
        id
        name
        description
        cognitiveCategoryId
        mimeType
        dag
        dagTemplateLanguage
        targetOrganizationId
      }
    }`;
    const result = await gqlClient.query(query);
    const dagTemplate = _.get(result, 'dagTemplate');
    expect(dagTemplate).toBeDefined();
    expect(dagTemplate.id).toEqual(dagTemplateId);
    expect(dagTemplate.name).toEqual(testName);
    expect(dagTemplate.dag.template).toBeDefined();
    expect(dagTemplate.dagTemplateLanguage).toEqual('Handlebars');
  });

  it('should update DAG template', async () => {
    const dagName = citestMarker + ' test dag 1';
    const query = `mutation {
      updateDagTemplate(input: {
        id: "${dagTemplateId}"
        name: "${dagName}"
        mimeType: "video/mp4"
        tags: ["bar"]
      }) {
        id
        name
        description
        cognitiveCategoryId
        mimeType
        dag
        dagTemplateLanguage
        targetOrganizationId
        tags
      }
    }`;

    const result = await gqlClient.query(query);
    const updateDagTemplate = _.get(result, 'updateDagTemplate');
    expect(updateDagTemplate).toBeDefined();
    expect(updateDagTemplate.id).toEqual(dagTemplateId);
    expect(updateDagTemplate.name).toEqual(dagName);
    expect(updateDagTemplate.mimeType).toEqual('video/mp4');
    expect(updateDagTemplate.tags).toEqual(['bar']);
  });

  it('should get list DAG templates', async () => {
    const query = `query {
      dagTemplates(limit: 1) {
        records {
          id
          name
          description
          cognitiveCategoryId
          mimeType
          dag
          dagTemplateLanguage
          targetOrganizationId
          tags
        }
        count
      }
    }`;

    const result = await gqlClient.query(query);
    const dagTemplates = _.get(result, 'dagTemplates');
    expect(dagTemplates).toBeDefined();
    expect(dagTemplates.count).toEqual(1);
    expect(dagTemplates.records.length).toEqual(1);
  });

  it('should create a new cluster for testing', async () => {
    // create a new
    const query = `mutation createCluster{
        createCluster(input:{
          name: "${testClusterName}",
          edgeVersion: 3,
          status:active,
          organizationId:${testOrgId},
          type:RT,
          allowedEngines:[],
          dockerCredentials: ""
        }) {
          id
        }
      }`;
    const result = await gqlClient.query(query);
    const createCluster = _.get(result, 'createCluster');
    expect(createCluster).toBeDefined();
    expect(createCluster.id).toBeDefined();

    clusterId = createCluster.id;
  });

  it('should launch multiple engines job with DAG template', async () => {
    const query = `mutation {
      launchDAGTemplate(input: {
        uploadUrl: "http://localhost",
        clusterId: "${clusterId}"
        dagTemplateId: "${dagTemplateId}"
        dagTemplateFields: [
          { fieldName: "firstEngineId", fieldValue: "9e611ad7-2d3b-48f6-a51b-0a1ba40fe255" },
          { fieldName: "secondEngineId", fieldValue: "352556c7-de07-4d55-b33f-74b1cf237f25" },
          { fieldName: "priorityOfFirst", fieldValue: "5" }, # test math of handlebars-helpers
        ]
      }) {
        id
        targetId
        tasks {
          count
          records {
            id
            engine {
              id
              name
            }
            payload
            executionPreferences {
              priority
            }
          }
        }
        routes {
          parentIoFolderReferenceId
          childIoFolderReferenceId
          endpoint
          options
        }
      }
    }`;
    const result = await gqlClient.query(query);
    const createJob = _.get(result, 'launchDAGTemplate');
    expect(createJob).toBeDefined();
    expect(createJob.id).toBeDefined();
    jobId = createJob.id;
    expect(createJob.targetId).toBeDefined();
    expect(_.get(createJob, 'tasks.count')).toEqual(4);
    expect(createJob.routes.length).toEqual(3);
  });
});

