# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model/collection

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework

- **Runner**: Jest 29.7.0, babel-jest
- **Coverage command**: `pnpm test` (from `services/api/core-graphql-server/`)
- **Test file location**: next-to-source, same directory as the source file
- **Naming convention**: `*.spec.js`
- **Mocking pattern**: `jest.spyOn` or `jest.fn`; no `jest.mock` of internal modules

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium | `collection.js:1 — Collection model (_postgresConfig field mapping)` | If the `_postgresConfig` field mapping (`folder_id → folderId`) or `primaryKey` were changed, `fromDb()` would map the DB primary key to the wrong JS property, silently returning undefined IDs on all collection fetch operations. | `collection.spec.js` | VE-24511 |
| 2 | implemented | medium | `collection.js:39 — organizationId field presence` | `organizationId` has `type: 'number'` with no `required` constraint. If the field were removed, org-scoped query builders that access `model.fields.organizationId` would receive `undefined`, causing un-scoped queries that could expose cross-tenant collections. | `collection.spec.js` | VE-24511 |
| 3 | implemented | low | `program.js:1 — Program model (programId type)` | If `programId` type were changed from `'number'` to `'string'`, program-lookup queries filtering by numeric ID would receive a coerced string, causing type mismatches in downstream SQL comparisons. | `program.spec.js` | VE-24511 |
| 4 | implemented | low | `index.js — re-export` | If `index.js` stopped re-exporting `Collection`, all callers importing the directory would receive `undefined`, causing silent runtime failures at the module level. | `collection.spec.js` | VE-24511 |
