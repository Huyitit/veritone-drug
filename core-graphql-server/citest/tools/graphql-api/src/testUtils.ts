import { GraphqlClient } from './graphqlUtil';
import { ClusterType, MediaStorageOption, RunMode, IntervalUnit, EngineState, TaskStatus } from './gql/gql';

export interface TestContext {
  gqlClient: GraphqlClient;
  citestMarker: string;
  testName: string;
  createdResources: Map<string, string>;
  startDateTime: number;
  stopDateTime: number;
}

export interface TestResourceOptions {
  name?: string;
  cleanup?: boolean;
}

export interface TDOOptions extends TestResourceOptions {
  status?: string;
  startDateTime?: number;
  stopDateTime?: number;
}

export interface JobOptions extends TestResourceOptions {
  targetId?: string;
  engineId?: string;
  clusterId?: string;
  tasks?: Array<{ engineId: string; [key: string]: any }>;
}

export interface ClusterOptions extends TestResourceOptions {
  organizationId?: string;
  allowedEngines?: string[];
  type?: ClusterType;
  collaborators?: Array<{ organizationId: string; permission: any }>;
}

export interface ScheduledJobOptions extends TestResourceOptions {
  clusterId?: string;
  engineId?: string;
  runMode?: RunMode;
}

/**
 * Creates a test context with common setup
 */
export function createTestContext(featureName: string, testName?: string): TestContext {
  const citestMarker = `citest-should-delete-${featureName.toLowerCase().replace(/\s+/g, '-')}`;
  const finalTestName = testName || `${citestMarker}_test_${Date.now()}`;

  return {
    gqlClient: null as any, // Will be set in test setup
    citestMarker,
    testName: finalTestName,
    createdResources: new Map(),
    startDateTime: new Date(Date.now() - 2 * 60 * 60 * 1000).getTime() / 1000,
    stopDateTime: new Date(Date.now() - 1 * 60 * 60 * 1000).getTime() / 1000,
  };
}

/**
 * Test resource builder with automatic cleanup tracking
 */
export class TestResourceBuilder {
  constructor(private context: TestContext) {}

  /**
   * Creates a TDO for testing
   */
  async createTDO(options: TDOOptions = {}): Promise<string> {
    const result = await this.context.gqlClient.sdk.createTDO({
      input: {
        startDateTime: options.startDateTime || this.context.startDateTime,
        stopDateTime: options.stopDateTime || this.context.stopDateTime,
        status: options.status || 'uploaded'
      }
    });

    const tdoId = result?.data?.createTDO?.id as string;
    if (!tdoId) {
      throw new Error('Failed to create TDO');
    }

    if (options.cleanup !== false) {
      this.context.createdResources.set('tdo', tdoId);
    }

    return tdoId;
  }

  /**
   * Finds an active engine for testing
   */
  async findActiveEngine(category = 'cognition', createsTDO = false): Promise<string> {
    const enginesQuery = await this.context.gqlClient.sdk.engines({
      createsTDO,
      category,
      state: EngineState.Active,
      limit: 1
    });

    const engineId = enginesQuery.data.engines?.records?.[0]?.id as string;
    if (!engineId) {
      throw new Error(`No active ${category} engine found`);
    }

    return engineId;
  }

  /**
   * Creates a test cluster
   */
  async createCluster(options: ClusterOptions = {}): Promise<string> {
    const engineId = await this.findActiveEngine();

    const cluster = await this.context.gqlClient.sdk.createCluster({
      input: {
        name: options.name || `${this.context.citestMarker}_cluster_${Date.now()}`,
        organizationId: options.organizationId,
        allowedEngines: options.allowedEngines || [engineId],
        dockerCredentials: [],
        type: options.type || ClusterType.Rt,
        mediaStorage: MediaStorageOption.Core,
        collaborators: options.collaborators || [],
        tags: [],
      }
    });

    const clusterId = cluster.data.createCluster?.id as string;
    if (!clusterId) {
      throw new Error('Failed to create cluster');
    }

    if (options.cleanup !== false) {
      this.context.createdResources.set('cluster', clusterId);
    }

    return clusterId;
  }

  /**
   * Creates a job with optional TDO and engine setup
   */
  async createJob(options: JobOptions = {}): Promise<{ jobId: string; taskId?: string }> {
    let targetId = options.targetId;
    let engineId = options.engineId;

    if (!targetId) {
      targetId = await this.createTDO({ cleanup: false });
    }

    if (!engineId && !options.tasks?.length) {
      engineId = await this.findActiveEngine();
    }

    const tasks = options.tasks || [{ engineId: engineId! }];

    const job = await this.context.gqlClient.sdk.createJob({
      input: {
        targetId,
        clusterId: options.clusterId,
        tasks
      }
    });

    const jobId = job.data?.createJob?.id as string;
    if (!jobId) {
      throw new Error('Failed to create job');
    }

    const taskId = job.data?.createJob?.tasks?.records?.[0]?.id as string;

    if (options.cleanup !== false) {
      this.context.createdResources.set('job', jobId);
    }

    return { jobId, taskId };
  }

  /**
   * Creates a scheduled job
   */
  async createScheduledJob(options: ScheduledJobOptions = {}): Promise<string> {
    let clusterId = options.clusterId;
    let engineId = options.engineId;

    if (!clusterId) {
      clusterId = await this.createCluster({ cleanup: false });
    }

    if (!engineId) {
      engineId = await this.findActiveEngine();
    }

    const scheduledJob = await this.context.gqlClient.sdk.createScheduledJob({
      input: {
        name: options.name || this.context.testName,
        jobTemplates: [
          {
            clusterId,
            taskTemplates: [{ engineId }]
          }
        ],
        runMode: options.runMode || RunMode.Recurring,
        recurringScheduleParts: [
          {
            repeatIntervalUnit: IntervalUnit.Hours,
            repeatInterval: 1
          }
        ]
      }
    });

    const scheduledJobId = scheduledJob.data.createScheduledJob?.id as string;
    if (!scheduledJobId) {
      throw new Error('Failed to create scheduled job');
    }

    if (options.cleanup !== false) {
      this.context.createdResources.set('scheduledJob', scheduledJobId);
    }

    return scheduledJobId;
  }
}

/**
 * Common test assertions
 */
export class TestAssertions {
  constructor(private context: TestContext) {}

  /**
   * Asserts that a resource was created successfully
   */
  expectResourceCreated(resourceId: string, resourceType?: string): void {
    expect(resourceId).toBeDefined();
    expect(resourceId).not.toBe('');
    if (resourceType) {
      expect(resourceId).toMatch(new RegExp(`^[a-f0-9-]+$`)); // Basic UUID-like format
    }
  }

  /**
   * Asserts that a GraphQL operation succeeded
   */
  expectOperationSuccess(result: any): void {
    expect(result.errors).toBeUndefined();
    expect(result.data).toBeDefined();
  }

  /**
   * Asserts that a GraphQL operation failed with expected error
   */
  expectOperationError(result: any, errorMessage?: string): void {
    expect(result.errors).toBeDefined();
    if (errorMessage) {
      expect(JSON.stringify(result.errors)).toContain(errorMessage);
    }
  }

  /**
   * Asserts task status transition
   */
  expectTaskStatus(task: any, expectedStatus: TaskStatus): void {
    expect(task.status).toBe(expectedStatus);
    expect(task.id).toBeDefined();
  }
}

/**
 * Utility functions for common test operations
 */
export class TestUtils {
  /**
   * Waits for a condition to be met with timeout
   */
  static async waitFor(
    condition: () => Promise<boolean>,
    timeoutMs = 30000,
    intervalMs = 1000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }

  /**
   * Retries an operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Generates test data with random suffix
   */
  static generateTestName(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Deep clones an object for test data manipulation
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * Cleanup helper for test resources
 */
export async function cleanupTestResources(context: TestContext): Promise<void> {
  const errors: Error[] = [];

  // Cleanup in reverse order of creation
  const cleanupOrder = ['scheduledJob', 'job', 'cluster', 'tdo'];

  for (const resourceType of cleanupOrder) {
    const resourceId = context.createdResources.get(resourceType);
    if (!resourceId) continue;

    try {
      switch (resourceType) {
        case 'tdo':
          await context.gqlClient.sdk.deleteTDO({ id: resourceId });
          break;
        case 'job':
          // Jobs are typically cleaned up automatically or don't need explicit deletion
          break;
        case 'cluster':
          await context.gqlClient.sdk.deleteCluster({ id: resourceId });
          break;
        case 'scheduledJob':
          await context.gqlClient.sdk.deleteScheduledJob({ id: resourceId });
          break;
      }
    } catch (error) {
      errors.push(new Error(`Failed to cleanup ${resourceType} ${resourceId}: ${error}`));
    }
  }

  if (errors.length > 0) {
    console.warn('Cleanup warnings:', errors.map(e => e.message));
  }
}

/**
 * Complete test helper that combines all utilities
 */
export class IntegrationTestHelper {
  public readonly context: TestContext;
  public readonly resources: TestResourceBuilder;
  public readonly assertions: TestAssertions;

  constructor(featureName: string, testName?: string) {
    this.context = createTestContext(featureName, testName);
    this.resources = new TestResourceBuilder(this.context);
    this.assertions = new TestAssertions(this.context);
  }

  /**
   * Sets the GraphQL client (typically called in beforeAll)
   */
  setClient(gqlClient: GraphqlClient): void {
    this.context.gqlClient = gqlClient;
  }

  /**
   * Cleanup all created resources (typically called in afterAll)
   */
  async cleanup(): Promise<void> {
    await cleanupTestResources(this.context);
  }
}

/**
 * Test data fixtures for common scenarios
 */
export const TEST_FIXTURES = {
  basicTDO: {
    status: 'uploaded',
    duration: 3600 // 1 hour
  },

  processingJob: {
    name: 'Test Processing Job',
    description: 'Integration test job for processing workflow'
  },

  scheduledJobRecurring: {
    runMode: RunMode.Recurring,
    intervalHours: 1
  }
};
