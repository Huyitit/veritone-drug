# TODO_TESTS — webhooks module

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework (webhooks — core-graphql-server)

- **Runner**: Jest 29 (`pnpm --filter core-graphql-server test`)
- **Coverage command**: `pnpm --filter core-graphql-server test`
- **Test file location**: next-to-source `*.spec.js` (`fastspring.spec.js`)
- **Mocking**: serviceContext DI; `jest.fn()` for `dbConnections.write.query`; express req/res via `node-mocks-http`
- **Assertions**: chai `expect` (pattern across this service)
- **Source**: 1 file — `fastspring.js` exports `Fastspring` class with 3 public methods

## Gap analysis

1 of 1 source file tested. `Fastspring` class: `isValidSignature`, `handleOrderCompleted`, `handleEvents` now covered by `fastspring.spec.js` (7 tests).

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | done | high [security-coverage] | `fastspring.js:10 — isValidSignature: HMAC verification` | A regression removing or misimplementing the HMAC-SHA256 check would accept unsigned or forged webhook payloads and let attackers trigger billing-state mutations. Verify correct-signature → true, wrong-signature → false, missing-rawBody → false. | `fastspring.spec.js` (3 cases) | VE-23502 |
| 2 | done | medium | `fastspring.js:23 — handleOrderCompleted: account-profile guard` | A regression removing the `sss-redact-*` profile prefix check (line ~36) would apply billing mutations to non-SSS organizations. Verify that events for orgs without the `sss-redact` prefix return false without mutating the DB. | `fastspring.spec.js` (1 case) | VE-23502 |
| 3 | done | medium | `fastspring.js:73 — handleEvents: request dispatch and filter` | A regression in the event-filter predicate (unprocessed + orgId + subscription type) would silently accept malformed payloads or skip valid events, returning 202 with an empty ID list instead of the documented processedIds. Verify empty-body → 400, no-processable-events → 400, valid-subscription-order.completed → 202 with id in response. | `fastspring.spec.js` (3 cases) | VE-23502 |
