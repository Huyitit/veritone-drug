# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model/collection-query

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework

- **Runner**: Jest 29.7.0, babel-jest
- **Coverage command**: `pnpm test` (from `services/api/core-graphql-server/`)
- **Test file location**: next-to-source, same directory as the source file
- **Naming convention**: `*.spec.js`

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | done | high [security-coverage] | `collection-bulk-query.js:44 — organizationId required validation` | If the `presence: true` or `length: { minimum: 1 }` constraint on `organizationId` were removed, bulk collection queries without an organizationId would be accepted, potentially returning collections across all tenants and violating data isolation. | `collection-bulk-query.spec.js` — "rejects a missing organizationId to enforce tenant isolation" | VE-23122 |
| 2 | done | medium | `collection-bulk-query.js:7 — validateCollectionId (array of valid numbers)` | If the numeric-array validation branch were removed, an array of valid integer collectionIds would no longer return `null` (pass), masking whether the validator was actually executed. Verify valid arrays pass and invalid arrays fail. | `collection-bulk-query.spec.js` — "returns null for an array of valid integer collectionIds" | VE-23122 |
| 3 | done | medium | `collection-bulk-query.js:7 — validateCollectionId (NaN element in array)` | If the `_.isNaN(collectionId)` check were removed, `NaN` array elements would silently pass validation and reach the DB layer, causing query failures with non-numeric SQL parameters. | `collection-bulk-query.spec.js` — "returns an error when a collectionId array contains a NaN element" | VE-23122 |
| 4 | done | medium | `collection-bulk-query.js:7 — validateCollectionId (Infinity element in array)` | If the `Number.POSITIVE_INFINITY` / `Number.NEGATIVE_INFINITY` guards were removed, infinite-valued IDs would pass validation, producing out-of-range values in SQL `IN(...)` clauses. | `collection-bulk-query.spec.js` — "returns an error when a collectionId array contains Infinity" | VE-23122 |
| 5 | done | medium | `collection-bulk-query.js:7 — validateCollectionId (non-array value)` | If the `else` branch were removed, a non-array collectionId (e.g. a plain string) would not produce the `'should be a String or Array of Strings'` error, silently accepting invalid input without rejection. | `collection-bulk-query.spec.js` — "returns an error when collectionId is a non-array value after conversion" | VE-23122 |
