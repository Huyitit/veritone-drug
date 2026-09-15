#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

const RESOURCE_TEMPLATES = {
  sdo: {
    variable: 'sdoId',
    type: 'string',
    dependencies: ['schema', 'dataRegistry'],
    setup: `
  it('creates a data registry', async () => {
    const result = await gqlClient.sdk.createDataRegistry({
      input: {
        name: \`\${citestMarker}-test-data-registry-\${uuidv4()}\`,
        description: \`\${citestMarker}-test-data-registry-\${uuidv4()}\`,
        source: \`\${citestMarker}-test-data-registry-source-\${uuidv4()}\`
      }
    });

    dataRegistryId = result?.data?.createDataRegistry?.id as string;
    expect(dataRegistryId).toBeDefined();
  });

  it('creates a schema', async () => {
    const result = await gqlClient.sdk.createSchema({
      input: {
        id: uuidv4(),
        majorVersion: 1,
        minorVersion: 0,
        status: SchemaStatus.Published,
        dataRegistryId: dataRegistryId,
        definition: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      }
    });

    schemaId = result?.data?.createSchema?.id as string;
    expect(schemaId).toBeDefined();
  });

  it('creates a SDO', async () => {
    const result = await gqlClient.sdk.createStructuredData({
      input: {
        schemaId: schemaId,
        data: {
          name: 'test'
        }
      }
    });

    sdoId = result?.data?.createStructuredData?.id as string;
    expect(sdoId).toBeDefined();
  });`,
    cleanup: `
  it('deletes the SDO', async () => {
    const result = await gqlClient.sdk.deleteStructuredData({ id: sdoId, schemaId: schemaId });
    expect(result?.data?.deleteStructuredData?.id).toBe(sdoId);
  });`
  },

  tdo: {
    variable: 'tdoId',
    type: 'string',
    setup: `
  it('creates a TDO', async () => {
    const result = await gqlClient.sdk.createTDO({
      input: {
        startDateTime: startDateTime,
        stopDateTime: stopDateTime,
        status: 'uploaded'
      }
    });

    tdoId = result?.data?.createTDO?.id as string;
    expect(tdoId).toBeDefined();
  });`,
    cleanup: `
  it('deletes the TDO', async () => {
    const result = await gqlClient.sdk.deleteTDO({ id: tdoId });
    expect(result?.data?.deleteTDO?.id).toBe(tdoId);
  });`
  },

  job: {
    variable: 'jobId',
    type: 'string',
    dependencies: ['tdo', 'engine'],
    setup: `
  it('creates a job', async () => {
    const job = await gqlClient.sdk.createJob({
      input: {
        targetId: tdoId,
        tasks: [
          {
            engineId: engineId,
          }
        ]
      }
    });

    jobId = job.data?.createJob?.id as string;
    expect(jobId).toBeDefined();

    if (job.data?.createJob?.tasks?.records?.length > 0) {
      taskId = job.data?.createJob?.tasks.records[0]?.id as string;
    }
  });`
  },

  engine: {
    variable: 'engineId',
    type: 'string',
    setup: `
  it('finds an active engine', async () => {
    const enginesQuery = await gqlClient.sdk.engines({
      createsTDO: false,
      category: "cognition",
      state: EngineState.Active,
      limit: 1
    });

    engineId = enginesQuery.data.engines?.records?.[0]?.id as string;
    expect(engineId).toBeDefined();
  });`
  },

  cluster: {
    variable: 'clusterId',
    type: 'string',
    dependencies: ['engine'],
    setup: `
  it('creates a test cluster', async () => {
    const cluster = await gqlClient.sdk.createCluster({
      input: {
        name: \`\${citestMarker}_cluster_\${Date.now()}\`,
        allowedEngines: [engineId],
        dockerCredentials: [],
        type: ClusterType.Rt,
        mediaStorage: MediaStorageOption.Core,
        tags: [],
      }
    });

    clusterId = cluster.data.createCluster?.id as string;
    expect(clusterId).toBeDefined();
  });`,
    cleanup: `
  it('deletes the cluster', async () => {
    const result = await gqlClient.sdk.deleteCluster({ id: clusterId });
    expect(result?.data?.deleteCluster?.id).toBe(clusterId);
  });`
  },

  scheduledJob: {
    variable: 'scheduledJobId',
    type: 'string',
    dependencies: ['cluster', 'engine'],
    setup: `
  it('creates a scheduled job', async () => {
    const scheduledJob = await gqlClient.sdk.createScheduledJob({
      input: {
        name: testName,
        jobTemplates: [
          {
            clusterId: clusterId,
            taskTemplates: [
              {
                engineId: engineId
              }
            ]
          }
        ],
        runMode: RunMode.Recurring,
        recurringScheduleParts: [
          {
            repeatIntervalUnit: IntervalUnit.Hours,
            repeatInterval: 1
          }
        ]
      }
    });

    scheduledJobId = scheduledJob.data.createScheduledJob?.id as string;
    expect(scheduledJobId).toBeDefined();
  });`,
    cleanup: `
  it('deletes the scheduled job', async () => {
    const result = await gqlClient.sdk.deleteScheduledJob({ id: scheduledJobId });
    expect(result?.data?.deleteScheduledJob?.id).toBe(scheduledJobId);
  });`
  }
};

const TEST_OPERATION_TEMPLATES = {
  'create-and-update': `
  it('updates the created resource', async () => {
    // TODO: Add your update operation here
    // Example: const result = await gqlClient.sdk.updateSomething({ ... });
    // expect(result).toBeDefined();
  });`,

  'query-operations': `
  it('queries the created resources', async () => {
    // TODO: Add your query operations here
    // Example: const result = await gqlClient.sdk.getSomething({ ... });
    // expect(result.data).toBeDefined();
  });`,

  'error-handling': `
  it('handles error cases properly', async () => {
    try {
      // TODO: Add operation that should fail
      // const result = await gqlClient.sdk.invalidOperation({ ... });
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });`,

  'state-transitions': `
  it('handles state transitions correctly', async () => {
    // TODO: Add operations that change resource state
    // Example: Update status, verify state changes
  });`
};

function generateTestFile(config) {
  const { testName, featureName, resources, operations, description } = config;

  // Determine all variables needed
  const allVariables = new Set();
  const setupSteps = [];
  const cleanupSteps = [];
  const imports = new Set(['createGraphqlClient', 'AuthType', 'GraphqlClient', 'getSdk']);

  // Add base variables
  allVariables.add('citestMarker');
  allVariables.add('testName');
  allVariables.add('startDateTime');
  allVariables.add('stopDateTime');
  allVariables.add('gqlClient');

  // Process resources and their dependencies
  function addResource(resourceName) {
    if (!RESOURCE_TEMPLATES[resourceName]) return;

    const resource = RESOURCE_TEMPLATES[resourceName];
    allVariables.add(resource.variable);

    // Add dependencies first
    if (resource.dependencies) {
      resource.dependencies.forEach((dep) => addResource(dep));
    }

    if (resource.setup) {
      setupSteps.push(resource.setup);
    }
    if (resource.cleanup) {
      cleanupSteps.unshift(resource.cleanup); // Cleanup in reverse order
    }

    // Add imports based on resource type
    if (resourceName === 'engine') {
      imports.add('EngineState');
    }
    if (resourceName === 'cluster') {
      imports.add('ClusterType');
      imports.add('MediaStorageOption');
    }
    if (resourceName === 'scheduledJob') {
      imports.add('RunMode');
      imports.add('IntervalUnit');
    }
    if (resourceName === 'job') {
      allVariables.add('taskId');
    }
    if (resourceName === 'sdo') {
      allVariables.add('dataRegistryId');
      allVariables.add('schemaId');
    }
  }

  resources.forEach(addResource);

  // Generate variable declarations
  const variableDeclarations = Array.from(allVariables)
    .filter((v) => !['gqlClient', 'citestMarker', 'testName', 'startDateTime', 'stopDateTime'].includes(v))
    .map((v) => `  ${v}: string`)
    .join(',\n');

  // Generate operation tests
  const operationTests = operations
    .map(
      (op) =>
        TEST_OPERATION_TEMPLATES[op] ||
        `
  it('performs ${op}', async () => {
    // TODO: Implement ${op} test
  });`
    )
    .join('\n');

  const template = `import { createGraphqlClient, AuthType, GraphqlClient } from '../src/graphqlUtil';
import { v4 as uuidv4 } from 'uuid';

let
${variableDeclarations};

const citestMarker = \`citest-should-delete-${featureName.toLowerCase().replace(/\s+/g, '-')}\`;
const startDateTime = new Date(Date.now() - 2 * 60 * 60 * 1000).getTime() / 1000
const stopDateTime = new Date(Date.now() - 1 * 60 * 60 * 1000).getTime() / 1000
const testName = \`\${citestMarker}_${testName.toLowerCase().replace(/\s+/g, '_')}_\` + Date.now();

describe('${description}', () => {
  let gqlClient: GraphqlClient;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  // Setup resources${setupSteps.join('')}
${operationTests}

  // Cleanup resources${cleanupSteps.join('')}
});
`;

  return template;
}

async function main() {
  console.log('🚀 GraphQL API Test Template Generator\n');

  const testName = await ask('Test name (e.g., "job-lifecycle"): ');
  const featureName = await ask('Feature being tested (e.g., "Job Management"): ');
  const description = await ask('Test description: ');

  console.log('\nAvailable resources:');
  Object.keys(RESOURCE_TEMPLATES).forEach((key, index) => {
    console.log(`  ${index + 1}. ${key}`);
  });

  const resourcesInput = await ask('\nSelect resources (comma-separated numbers or names): ');
  const resources = resourcesInput
    .split(',')
    .map((r) => r.trim())
    .map((r) => {
      const num = parseInt(r);
      if (!isNaN(num)) {
        return Object.keys(RESOURCE_TEMPLATES)[num - 1];
      }
      return r;
    })
    .filter((r) => RESOURCE_TEMPLATES[r]);

  console.log('\nAvailable operation types:');
  Object.keys(TEST_OPERATION_TEMPLATES).forEach((key, index) => {
    console.log(`  ${index + 1}. ${key}`);
  });

  const operationsInput = await ask('\nSelect operations (comma-separated numbers or names): ');
  const operations = operationsInput
    .split(',')
    .map((r) => r.trim())
    .map((r) => {
      const num = parseInt(r);
      if (!isNaN(num)) {
        return Object.keys(TEST_OPERATION_TEMPLATES)[num - 1];
      }
      return r;
    })
    .filter((r) => TEST_OPERATION_TEMPLATES[r]);

  const config = {
    testName,
    featureName,
    description,
    resources,
    operations
  };

  const testContent = generateTestFile(config);
  const fileName = `${testName.replace(/\s+/g, '-')}.spec.ts`;
  const filePath = path.join(__dirname, '..', 'test', fileName);

  fs.writeFileSync(filePath, testContent);

  console.log(`\n✅ Test file created: test/${fileName}`);
  console.log('\n📋 Next steps:');
  console.log('1. Review the generated test file');
  console.log('2. Replace TODO comments with actual test logic');
  console.log('3. Run the test to verify it works');
  console.log('4. Add any custom assertions or operations needed');

  rl.close();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { generateTestFile, RESOURCE_TEMPLATES, TEST_OPERATION_TEMPLATES };
