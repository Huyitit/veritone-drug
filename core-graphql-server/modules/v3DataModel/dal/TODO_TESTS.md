# TODO_TESTS — v3DataModel/dal

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework (v3DataModel/dal — core-graphql-server)

- **Runner**: Jest 29 (via `pnpm --filter core-graphql-server test`)
- **Coverage command**: `pnpm --filter core-graphql-server test`
- **Test file location**: next-to-source `*.spec.js`
- **Mocking**: serviceContext DI — construct via `require('../../../test/serviceContext.mock.js')()`, override `serviceContext.dal.*` and `dbConnections` per-test
- **Assertions**: chai `expect` (not Jest's built-in `expect`) — use `require('chai').expect`
- **Fixtures**: JSON fixture files in `test/*.json`; mockSql from `test/mockSql.js`

## Gap analysis

All 10 source files now have test coverage. Implementation by `worker-psd-aqa` VE-22231.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium | `taskTemplate.js — task template DAL` | A regression in the task-template DAL (e.g. dropping org-scope on lookup) would silently expose cross-tenant task templates. Verify the documented SQL shape + org-scope filter. | `taskTemplate.spec.js` | [#3989](https://github.com/veritone/aiware-core/pull/3989) |
| 2 | implemented | medium | `dagTemplate.js — DAG template DAL (getDagTemplates / createDagTemplate / updateDagTemplate)` | A regression dropping the `isSuperAdmin`-gated `organization_id` scope filter (line ~41) would expose private DAG templates across tenants. Verify org-scoped vs super-admin access paths. | `dagTemplate.spec.js` | [#3989](https://github.com/veritone/aiware-core/pull/3989) |
| 3 | implemented | medium | `scheduledJob.js — scheduled job DAL (getScheduledJob / createScheduledJob / updateScheduledJob)` | A regression in the deterministic UUIDv5 ID generation or org-scope filter would create scheduled jobs attributed to the wrong organization or return jobs across tenants. | `scheduledJob.spec.js` (pre-existing comprehensive coverage) | (pre-existing) |
| 4 | implemented | medium | `sourceType.js — media source type DAL (getSourceTypes / createSourceType / updateSourceType)` | A regression in the `is_public` or `owner_organization_id` filter would expose restricted source types to unauthorized organizations. Verify public vs private visibility rules. | `sourceType.spec.js` (pre-existing — is_public visibility tests present) | (pre-existing) |
| 5 | obsolete (functions not found) | medium | `jobPipeline.js — job pipeline DAL (getJobPipelines / createJobPipeline)` | A regression in the access-gate logic (validateWriteAccess / validateReadAccess) would allow callers to create or read job pipelines they don't own. | n/a — validateWriteAccess/validateReadAccess not exported in current jobPipeline.js | n/a |
| 6 | implemented | medium | `source.js — getSourceJWT() null ownedBy fallback (PR #3916)` | A regression where the null-`ownedBy` fallback path does not call `_getDefaultSourceOwnerForOrg` would return a JWT without a valid owner ID, silently assigning sources to no owner. Verify that when the DB row has `ownedBy = null`, the function resolves to the default org-admin owner rather than propagating null. | `source.spec.js` | [#3989](https://github.com/veritone/aiware-core/pull/3989) |
