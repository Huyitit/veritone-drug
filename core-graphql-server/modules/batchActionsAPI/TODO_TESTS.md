# TODO_TESTS — services/api/core-graphql-server/modules/batchActionsAPI

## Test framework

- **Runner**: Jest. Tests next-to-source.
- **Naming**: `<file>.spec.js` next to source (see bll/ for reference pattern).
- **Mocking**: `jest.fn()` on `serviceContext.bll.*` and `serviceContext.dal.*` dependencies. Use `serviceContext.mock.js` pattern from `test/serviceContext.mock.js`.
- **Pattern**: Feature-flag tests use `_.get(serviceContext, 'config.featureFlags.enableBatchActionsAPI', false)`.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `Mutation.js — createTDOBatch and cancelTDOBatchProcess resolvers` | A regression in batch-action mutations would silently break the admin UI's batch-job flow. Verify: (a) when feature flag is off, throws `NotImplemented`; (b) when flag is on, delegates createTDOBatch to `bll.tdoBatch.createBatch` and cancelTDOBatchProcess to `bll.tdoBatch.cancelTdoBatchProcess` with correct args. | `Mutation.spec.js` |  |
| 2 | implemented | medium | `Query.js — TDOBatch and TDOBatchProcesses query resolvers` | A regression in batch-action queries (TDOBatch, TDOBatchProcesses) would surface as broken progress reporting in the admin UI. Verify: (a) feature flag off → throws `NotImplemented`; (b) flag on → delegates to `bll.tdoBatch.getTdoBatch` / `bll.tdoBatch.getBatchProcesses`. | `Query.spec.js` |  |
| 3 | implemented | medium | `TDOBatchJobProcess.js — TDOBatch field resolver` | A regression in the TDOBatchJobProcess TDOBatch resolver (sets `args.id = root.batchId` before delegating) would produce queries with wrong batch IDs. Verify the field resolver passes the correct batchId from root. | `TDOBatchJobProcess.spec.js` |  |
| 4 | implemented | medium | `TDOBatchProcess.js — TDOBatch and actions field resolvers` | A regression in the TDOBatchProcess resolvers would silently stall batch orchestration reporting. Verify TDOBatch field passes batchId; actions field passes batchProcessId and organizationId. | `TDOBatchProcess.spec.js` |  |
| 5 | implemented | low | `index.js — module aggregator` | A regression dropping a resolver or DAL wiring would break GraphQL schema stitching at server startup. Verify the documented public exports: typeDefs, resolvers (Query, Mutation, TDOBatch, TDOBatchProcess, TDOBatchJobProcess, TDOBatchJobActionResult). | `index.spec.js` |  |
| 6 | implemented | medium | `TDOBatch.js — executeJobTemplate, temporalDataObjects, temporalDataObjectsIds resolvers` | A regression in TDOBatch field resolvers would break the batch execution entry points. Verify: executeJobTemplate delegates to `bll.executeJobTemplate.exec`; temporalDataObjects calls `util.checkMaxTDOLimit` and then `bll.tdoBatch.getTdosForBatch`; temporalDataObjectsIds calls `bll.tdoBatch.getBatchItemsId`. | `TDOBatch.spec.js` |  |
| 7 | implemented | medium | `TDOBatchJobActionResult.js — job and temporalDataObject field resolvers` | A regression in the field resolvers for TDOBatchJobActionResult would surface broken job/TDO lookups in batch-result pagination. Verify job resolver uses `root.actionId` and temporalDataObject uses `root.targetId` to lookup the right records. | `TDOBatchJobActionResult.spec.js` |  |
