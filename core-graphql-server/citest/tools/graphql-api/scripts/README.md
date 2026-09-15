# GraphQL API Test Template System

A comprehensive test template generator for creating focused integration tests with minimal boilerplate and sequential execution to avoid race conditions.

## 🚀 Quick Start

### Generate a New Test

```bash
# Interactive template generator
./scripts/create-test.sh

# Or run directly with Node
node scripts/create-test-template.js
```

### Run Your Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/your-new-test.spec.ts
```

## 📁 Project Structure

```
graphql-api/
├── scripts/
│   ├── create-test-template.js    # Interactive test generator
│   ├── create-test.sh            # Shell wrapper script
│   └── README.md                 # This file
├── src/
│   ├── testUtils.ts              # Test utilities and helpers
│   └── graphqlUtil.ts            # GraphQL client setup
└── test/
    ├── basicJob.spec.ts          # Original comprehensive test
    ├── example-job-workflow.spec.ts  # Modern pattern example
    └── your-new-tests.spec.ts    # Generated tests
```

## 🛠️ Template Generator Features

### Available Resources

The template generator can automatically set up these resources:

- **TDO** - Temporal Data Objects for test targets
- **Job** - Processing jobs with tasks
- **Engine** - Active engines for processing
- **Cluster** - Compute clusters for job execution
- **Scheduled Job** - Recurring job templates

### Available Operation Types

- **create-and-update** - Resource creation and modification workflows
- **query-operations** - Data retrieval and filtering tests
- **error-handling** - Error scenarios and validation
- **state-transitions** - Status changes and workflow validation

### Generated Test Structure

```typescript
describe('Your Feature Test', () => {
  let gqlClient: GraphqlClient;
  let resourceId: string;

  beforeAll(async () => {
    gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
  });

  // Setup resources (in dependency order)
  it('creates required resources', async () => {
    // Auto-generated setup code
  });

  // Your test operations
  it('performs your test operations', async () => {
    // TODO: Add your test logic
  });

  // Cleanup resources (in reverse order)
  it('cleans up resources', async () => {
    // Auto-generated cleanup code
  });
});
```

## 🧪 Test Utilities

### IntegrationTestHelper

A comprehensive helper class that combines resource management, assertions, and cleanup:

```typescript
import { IntegrationTestHelper } from '../src/testUtils';

const testHelper = new IntegrationTestHelper('my-feature', 'specific-test');

describe('My Feature Test', () => {
  beforeAll(async () => {
    const gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN);
    testHelper.setClient(gqlClient);
  });

  afterAll(async () => {
    await testHelper.cleanup(); // Automatically cleans up all resources
  });

  it('creates resources easily', async () => {
    const tdoId = await testHelper.resources.createTDO();
    const { jobId, taskId } = await testHelper.resources.createJob();
    
    testHelper.assertions.expectResourceCreated(jobId);
  });
});
```

### TestResourceBuilder

Create test resources with automatic dependency resolution:

```typescript
const builder = new TestResourceBuilder(context);

// Creates TDO with default test data
const tdoId = await builder.createTDO();

// Creates job with TDO and engine automatically
const { jobId, taskId } = await builder.createJob();

// Creates cluster with required engine
const clusterId = await builder.createCluster();
```

### TestAssertions

Common assertion patterns:

```typescript
const assertions = new TestAssertions(context);

// Verify resource creation
assertions.expectResourceCreated(resourceId);

// Verify GraphQL operation success
assertions.expectOperationSuccess(result);

// Verify operation errors
assertions.expectOperationError(result, 'expected error message');

// Verify task status transitions
assertions.expectTaskStatus(task, TaskStatus.Complete);
```

### TestUtils

Utility functions for common test operations:

```typescript
// Wait for conditions with timeout
await TestUtils.waitFor(async () => {
  const job = await gqlClient.sdk.job({ id: jobId });
  return job.data.job?.status === 'complete';
});

// Retry operations with backoff
const result = await TestUtils.retry(async () => {
  return await someUnreliableOperation();
}, 3, 1000);

// Generate unique test names
const testName = TestUtils.generateTestName('my-test');
```

## 📝 Best Practices

### 1. Sequential Test Structure

Tests run in sequence to avoid server-side race conditions:

```typescript
describe('Feature Test', () => {
  // ✅ Good: Sequential setup, operations, cleanup
  it('step 1: setup resources', async () => { /* ... */ });
  it('step 2: perform operations', async () => { /* ... */ });
  it('step 3: cleanup resources', async () => { /* ... */ });
});
```

### 2. Resource Lifecycle Management

Always clean up resources in reverse order of creation:

```typescript
// ✅ Good: Automatic cleanup with testHelper
afterAll(async () => {
  await testHelper.cleanup();
});

// ✅ Good: Manual cleanup in reverse order
afterAll(async () => {
  if (scheduledJobId) await gqlClient.sdk.deleteScheduledJob({ id: scheduledJobId });
  if (jobId) { /* jobs usually auto-cleanup */ }
  if (clusterId) await gqlClient.sdk.deleteCluster({ id: clusterId });
  if (tdoId) await gqlClient.sdk.deleteTDO({ id: tdoId });
});
```

### 3. Test Naming Convention

Use descriptive names that reflect the test purpose:

```typescript
// ✅ Good
describe('Job Lifecycle Integration Test', () => {
  it('creates job with valid engine and TDO', async () => {});
  it('updates task status through processing workflow', async () => {});
  it('handles job completion and cleanup', async () => {});
});

// ❌ Avoid
describe('test', () => {
  it('test 1', async () => {});
});
```

### 4. Error Handling

Test both success and failure scenarios:

```typescript
it('handles invalid engine ID gracefully', async () => {
  try {
    const result = await gqlClient.sdk.createJob({
      input: { targetId: tdoId, tasks: [{ engineId: 'invalid' }] }
    });
    
    // Expect errors in response
    testHelper.assertions.expectOperationError(result, 'engine');
  } catch (error) {
    // Or expect thrown exception
    expect(error).toBeDefined();
  }
});
```

### 5. Test Data Management

Use consistent test markers for cleanup:

```typescript
const citestMarker = 'citest-should-delete-my-feature';
const testName = `${citestMarker}_test_${Date.now()}`;

// All test resources should include the marker
const cluster = await gqlClient.sdk.createCluster({
  input: {
    name: `${citestMarker}_cluster_${Date.now()}`,
    // ...
  }
});
```

## 🔧 Customization

### Adding New Resource Types

Extend the `RESOURCE_TEMPLATES` object in `create-test-template.js`:

```javascript
RESOURCE_TEMPLATES.myResource = {
  variable: 'myResourceId',
  type: 'string',
  dependencies: ['engine'], // Optional dependencies
  setup: `
  it('creates my resource', async () => {
    // Resource creation code
  });`,
  cleanup: `
  it('deletes my resource', async () => {
    // Resource cleanup code
  });`
};
```

### Adding New Operation Templates

Extend the `TEST_OPERATION_TEMPLATES` object:

```javascript
TEST_OPERATION_TEMPLATES['my-operation'] = `
  it('performs my operation', async () => {
    // Test operation code
  });`;
```

### Extending TestUtils

Add custom utilities to the `testUtils.ts` file:

```typescript
export class CustomTestUtils {
  static async waitForJobCompletion(gqlClient: GraphqlClient, jobId: string): Promise<void> {
    await TestUtils.waitFor(async () => {
      const job = await gqlClient.sdk.job({ id: jobId });
      return job.data.job?.status === 'complete';
    });
  }
}
```

## 📚 Examples

See `test/example-job-workflow.spec.ts` for a complete example using the modern pattern with:

- Resource setup with dependencies
- Multiple operation types
- Error handling scenarios
- State transition testing
- Automatic cleanup

## 🐛 Troubleshooting

### Common Issues

1. **Resource Creation Fails**
   - Check that required dependencies are created first
   - Verify authentication and permissions
   - Ensure test data is valid

2. **Cleanup Failures**
   - Resources may have dependencies preventing deletion
   - Some resources might not exist (creation failed)
   - Check resource state before cleanup

3. **Race Conditions**
   - Use sequential test structure (avoid parallel execution)
   - Add wait conditions for async operations
   - Use retry logic for unreliable operations

### Debug Mode

Enable verbose logging for troubleshooting:

```typescript
// Add to test setup
beforeAll(async () => {
  if (process.env.TEST_DEBUG) {
    console.log('Test context:', testHelper.context);
  }
});
```

Run with debug output:
```bash
TEST_DEBUG=1 npm test
```
