# TODO_TESTS — services/api/core-graphql-server/modules/batchActionsAPI/dal

## Test framework

- **Runner**: Jest.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `batchProcessRedis.js — Redis-backed progress store` | A regression in Redis key namespacing (e.g. cross-batch key collision) would silently merge progress across unrelated batches. Verify the documented key shape per batch. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
| 2 | implemented | high [security-coverage] | `tdoBatch.js — SQL queries (parameterized)` | A regression switching to string-concatenated SQL in the batch-state DAL would re-introduce a SQL-injection vector. Verify pg.query is invoked with parameterized args, NOT interpolated SQL. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
| 3 | implemented | medium | `tdoBatch.js:152 — getBatch` | Missing `input.id` would silently produce a WHERE clause with no batch_id filter, returning an arbitrary row instead of throwing. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
| 4 | implemented | medium | `tdoBatch.js:378 — updateBatchProcess` | Omitting `batchProcessId`, `organizationId`, or `status` would skip the mandatory-field guard and pass a null value into the DB UPDATE, corrupting the batch state. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
| 5 | implemented | medium | `batchProcessRedis.js:22 — updateBatchProcessObject (cache-miss branch)` | A regression in the cache-miss default object shape (missing `jobsRunning` or `concurrency` keys) would cause the cache entry to lack required fields, breaking status aggregation for a batch not yet in cache. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
| 6 | implemented | medium | `batchProcessRedis.js:22 — updateBatchProcessObject (status guard)` | Calling `updateBatchProcessObject` without a `status` field would succeed instead of throwing `InternalServerError`, leaving the Redis object in an undefined state. | VE-22476 | [#4003](https://github.com/veritone/aiware-core/pull/4003) |
