# `citest` Workflow & Architecture Report

Welcome to the team! The `citest` directory (`core-graphql-server/citest`) is the home for Continuous Integration (CI) and API-level end-to-end (E2E) tests. These tests execute against a live, running server and are crucial for the deployment pipeline, as a failure here will abort the build.

Here is a breakdown of the overall testing workflow and an explanation of why each component in this directory exists.

## 1. Overall Workflow

1. **Setup & Initialization (`jest.global.setup.js` & `jest.global.teardown.js`)**: Before any tests run, Jest initializes global variables and boots up any necessary mock servers (such as a local Mailpit server for emails or the Ayrshare Express mock for distribution tests). The teardown script ensures these servers and connections are closed gracefully.
2. **Configuration (`testconfig.json` & `jest.config.js`)**: The environment relies on a configuration file (typically copied from `testconfig-template.json`) that provides authentication credentials (e.g., `userName`, `apiToken`), environment details (`aws-dev`), and the target GraphQL server URL.
3. **Execution (`npm run citest`)**: The tests are executed using Jest. The test runner discovers all tests across the subdirectories and uses the custom `citest-sequencer.js` to potentially order their execution.
4. **GraphQL Operations (`tools/graphql-api`)**: Rather than writing raw, error-prone GraphQL query strings, newer tests utilize a strongly-typed GraphQL client generated from the schema, ensuring type safety and code readability.
5. **Assertions & Side Effects**: The tests perform operations via the GraphQL API and assert not just the immediate response, but also the resulting side effects in the system (e.g., checking if RBAC permissions are correctly applied, or if an organization invite was properly dispatched).

---

## 2. Directory Structure & Components

### The Core Test Runner & Configuration
- **`jest.config.js`**, **`jest.setup.js`**, **`citest-sequencer.js`**: These files instruct Jest on how to find the tests, how to sequence them, and how to set up the test environment.
- **`jest.global.setup.js`** & **`jest.global.teardown.js`**: They manage the heavy lifting before the test suite begins. They establish global variables (like fetching feature flags to decide whether to run certain tests using `itif`/`describeif` patterns) and boot local mock servers in isolated processes.

### Test Suites & Feature Domains
- **`orgInvite/`**: Tests focusing on the Organization Invitation flow. Since this relies on emails, it interacts with a live Mailpit mock server.
- **`package/`**: Contains queries and tests specifically validating the packaging and monetization features.
- **`sideEffect/`**: This is a critical directory containing tests that validate the secondary consequences of API calls. For example, it includes tests for RBAC (Role-Based Access Control) to ensure that creating a user or a folder applies the correct permissions (`rbac.folder.spec.js`, `rbac.tdo.spec.js`).
- **`rewrite/`**: Tests related to dataset and engine result rewriting mechanisms.

### Utilities & Helpers
- **`tools/graphql-api/`**: A modern, type-safe interface for executing GraphQL calls in tests. It uses `bun` and code generation (`codegen.ts`) to create a TypeScript client from the GraphQL schema. This exists to reduce boilerplate, prevent syntax typos, and make it easier for both humans and AI to write integration tests.
- **`helpers/`**: Contains utility modules (e.g., `user.js`, `organization.js`, `engine.js`, `ayrshareMock.js`) that abstract away the complexity of setting up test data. If a test needs an organization, a user, and a job, it calls these helpers instead of cluttering the test file with setup logic.
- **`mocks/` & `data/`**: These folders store static test resources. `mocks/` contains JSON responses or payloads (like `license-plate.json`), while `data/` houses binary files or configuration templates used during file upload tests or mock responses.

### Maintenance & Legacy
- **`broken/`**: Houses tests that are obsolete, invalid, or currently failing due to outdated assumptions. These are kept around to be either investigated, fixed, and promoted back, or permanently deleted.
- **`obsolete/`**: Tests for features and functionalities that are actively in the process of deprecation. 
- **`local-docker/`**: Contains configurations or scripts relevant for running the integrated test suite locally against Docker containers.

## 3. Best Practices & Tips for New Devs

- **Avoid Global Setup in Individual Tests**: The README explicitly warns against running a single test file if that test incorrectly relies on `beforeEach` or setup within the test itself rather than the global setup. It can lead to leaked data or missing context.
- **Conditional Testing (`itif` / `describeif`)**: If your test relies on a feature flag, use the conditional testing pattern described in the `README.md` to skip the test cleanly rather than failing it when the feature is disabled.
- **Type-Safe Queries**: When writing new tests, lean into `tools/graphql-api/` rather than writing raw string templates. It's safer and easier to maintain.
