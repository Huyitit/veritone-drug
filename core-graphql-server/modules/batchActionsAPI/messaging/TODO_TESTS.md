# TODO_TESTS — services/api/core-graphql-server/modules/batchActionsAPI/messaging

## Test framework

- **Runner**: Jest.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `event-emitter.js — NSQ event publishing` | A regression in event-payload shape (e.g. missing batchId, wrong correlation key) would silently break downstream consumers tracking batch completion. Verify the documented event payload shape for known batch-state transitions. | `event-emitter.spec.js` | VE-24479 |
| 2 | implemented | medium | `event-emitter.js:43 — emitTDOSearchProcessCreated` | A regression removing `searchQuery` or `skipTdosAfterEventCreation` from the search-process event payload would silently break the eventing-service handler that drives dynamic-batch TDO discovery. | `event-emitter.spec.js` | VE-24479 |
