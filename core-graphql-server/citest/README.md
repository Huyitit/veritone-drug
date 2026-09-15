# Integration tests

## Setup

An initial test harness is in place. The files are in `citest`. They are API-level
integration tests that run against a live server.
First copy `testconfig-template.json` into `testconfig.json` in graphql root directory
and fill in the appropriate values (username, etc.). The API token should be
an API key for the org your user belongs to. You can make one in the admin UI
if needed.

An example looks like this:

```
{
  "userName":"myemail+superadmin@veritone.com",
  "password":"changeme",
  "apiToken":"7682-human:522c10cf-ab14-1658-13c3-226ej21262ce-278c4596-1813-1cee-1d2d-5ba2a7143fa2",
  "env":"aws-dev",
  "graphql_url":"http://localhost:3000/graphql"
}
```

## Global Environmental Setup

When it is necessary to initialize and use global variables, use the jest global setup module, jest.global.setup.js. 
https://jestjs.io/docs/configuration#globalsetup-string

The exported anonoymous function in this file will execute and complete prior to any test. This includes the execution and completion of asynchronous functions. To make the global variables available, jest provides the 'global' variable which is accessible in all test modules. The following is an example that calls an asynchronous function in the jest global setup module in order to make the enablePackageGrantLogic feature flag available to all test modules.

```
module.exports = async () => {
  const env = config.env;
  const gqlClient = new GraphqlClient(env);
  let result = await gqlClient.connect();
  if (result.token) {
    result = await gqlClient.query(`query {graphqlServiceInfo {featureFlags}}`);
    const featureFlags = _.get(result, 'graphqlServiceInfo.featureFlags');
    global.enablePackageGrantLogic = _.get(
      featureFlags,
      'enablePackageGrantLogic',
      false
    );
  }
};
```

Based on this sample, all test modules can access global.enablePackageGrantLogic.

## The itif and describeif Pattern

In some cases, it is necessary to conditionally run a test. Rather than make the conditional check within the test, it is preferred
to make the conditional check prior to test execution. This provides the best way to correctly report the test as skipped, failed, or passed. If the variable servicing the conditional check must be gathered asynchronously, then review the 'Global Environmental Setup' section for instructions on how to initialize a jest, globally available, variable.

If not already added, place the following method definitions within the targetted spec file.

```
const itif = (condition, ...args) =>
  condition ? it(...args) : it.skip(...args);

const describeif = (condition, ...args) =>
  condition ? describe(...args) : describe.skip(...args);
```

Replace the 'it' or 'describe' method as necessary. The following example uses global.enablePackageGrantLogic to conditionally execute/skip a test.

```
itif(global.enablePackageGrantLogic, 'only run this test if enablePackageGrantLogic is true', () => { }
```

## Run

`npm run citest`

Please run this under bash.  This does not work under fish

## VP-2581 Distribution Center (destination.spec.js) — Ayrshare mock

`destination.spec.js` covers the destination catalog, CRUD + OAuth lifecycle, and `distributeAsset`. The
create/connect/update/delete flows call the Ayrshare HTTP API via the server-under-test. Because citest runs
against a server in a **separate process**, `jest.mock`/`nock` cannot intercept those calls (same constraint as
the orgInvite suite, which uses a real Mailpit server). Instead:

- `citest/helpers/ayrshareMock.js` is a tiny Express mock of the 5 Ayrshare profile endpoints, started in
  `jest.global.setup.js` when `AYRSHARE_MOCK=1` (bound `0.0.0.0:AYRSHARE_MOCK_PORT`, default 8790; closed in
  `jest.global.teardown.js`).
- The server-under-test must be booted so its adapter targets that mock (`AYRSHARE_BASE_URL`), and citest must run
  with `AYRSHARE_MOCK=1`. The mock enable-toggle is decoupled from `AYRSHARE_BASE_URL` because the citest side and
  the server side use different hostnames for the same mock in Docker.

  ```
  # server-under-test env (host process)
  AYRSHARE_BASE_URL=http://localhost:8790 AYRSHARE_API_KEY=dummy AYRSHARE_PRIVATE_KEY=dummy AYRSHARE_DOMAIN=dummy
  # server-under-test env (Docker container — reach the host mock)
  AYRSHARE_BASE_URL=http://host.docker.internal:8790 AYRSHARE_API_KEY=dummy AYRSHARE_PRIVATE_KEY=dummy AYRSHARE_DOMAIN=dummy
  # citest env (starts the mock on 0.0.0.0:8790)
  AYRSHARE_MOCK=1 npm run citest
  ```

  **Note for the dockerized server-under-test (`local.yml`)**: `host.docker.internal` does NOT resolve inside the
  container on Linux Docker by default — it needs an `extra_hosts: ["host.docker.internal:host-gateway"]` entry
  (Docker Engine 20.10+), which `local.yml` doesn't set. Use the repo-root override file instead of setting the env
  vars by hand:

  ```
  # bring the stack up (or recreate just graphql) with the Ayrshare env + extra_hosts merged in
  docker compose -f local.yml -f local-ayrshare-override.yml up -d            # full stack
  docker compose -f local.yml -f local-ayrshare-override.yml up -d graphql    # just recreate graphql

  # then run citest with the mock enabled
  cd services/api/core-graphql-server
  AYRSHARE_MOCK=1 npm run citest ./citest/tools/graphql-api/test/destination/
  ```

Without `AYRSHARE_MOCK` the Ayrshare-backed tests **self-skip** (the seeded-catalog reads and the guard/not-found
negatives still run). The seed rows (Flyway `V3_291`/`V3_292` + structured_data `V1_13`) must be applied to the
test DB.

**In CI** this is already wired in `ci/citest.yml` (not the shared `ci-common-services.yml`, which `local.yml` also
extends): the `citest-runner` service sets `AYRSHARE_MOCK=1` (jest starts the mock in-container on `0.0.0.0:8790`)
and the `graphql` service sets `AYRSHARE_BASE_URL=http://citest-runner:8790` + dummy creds — the two containers are
peers on the compose network, so no `host.docker.internal` is needed.

## Notes

Currently running individual tests (from a file) is not recommended due to the obsergved pattern of setup/teardown done in tests rather than beforeEach/beforeAll/afterEach/afterAll. In the best case your test will fail due to missing setup, at worst the data won't be cleaned up after the test.
jest test_file --projects citest

## Folder structure

/citest - tests that run as part of ci and whose failure aborts the build/deploy pipeline
/citest/data - test resources (ex. binary files, configs etc.)
/citest/broken - obsolete or invalid legacy tests, these needs to be examined and either deleted or fixed/reworked and promoted to the root folder
/citest/obsolete - tests for features/functionality that are in the process of deprecation.

## Debug

Visual studio launch settings for debugging a test file:

```
{
    "type": "node",
    "name": "citests-jest-file",
    "request": "launch",
    "args": [
        "${file}",
        "--runInBand",
        "-t",
        "--testPathIgnorePatterns="
    ],
    "console": "integratedTerminal",
    "internalConsoleOptions": "neverOpen",
    "program": "${workspaceFolder}/node_modules/jest/bin/jest",
    "env": {
        "TESTS_USER": "myemail+superadmin@veritone.com",
        "TESTS_PASSWORD": "changeme",
        "TESTS_TOKEN": "7682-human:522c10cf-ab14-1658-13c3-226ej21262ce-278c4596-1813-1cee-1d2d-5ba2a7143fa2",
        "TESTS_ENV": "aws-dev",
        TESTS_SERVER_URI: "http://localhost:3000/graphql"
    }
}
```

## Running locally with coverage

- Setup the following environment variables:

```
TESTS_USER - as above
TESTS_PASSWORD - as above
TESTS_TOKEN - as above
ENVIRONMENT=dev
AWS_ACCESS_KEY_ID - your AWS access key ID
AWS_SECRET_ACCESS_KEY - your AWS secret access key
```

- Uncomment `// rtCov.init();` line in server.js
- Start the dependencies in Docker:

```
// To startup
docker-compose up -d

// To shutdown
docker-compose down

// To restart, used to flush cache and queue
docker-compose restart
```

- Run `./local_ci_test.sh` 