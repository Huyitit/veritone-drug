# TODO_TESTS — v3DataModel/social/dal

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

Test framework: Mocha + Chai, matching `destination.spec.js` / `destinationType.spec.js` in this directory —
next-to-source `*.spec.js`, service context via `../../../test/serviceContext.mock.js` +
`serviceContext.dbConnections['core'].{read,write}._push([...])` fixtures, `mainUtil`/`resUtil` real (not mocked).

`destinationType.js` (read-only seeded catalog, no org scoping by design) is fully covered — no gap.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | high [security-coverage] | `destination.js:74-82 — requireOrg` | A context with no organization (nil `orgId`) would fall through to a query/write instead of throwing `NotAllowed`, since none of `getDestinations`/`getDestination`/`createDestination`/`updateDestination`/`deleteDestination`'s tests exercise a missing-org context — this guard is the sole org-isolation gate shared by all five CRUD entry points. | destination.spec.js | (pending — framework will open PR) |
| 2 | implemented | medium | `destination.js:211-214 — updateDestination (no-op early return)` | An `updateDestination` call whose input has no defined columns (e.g. only `id`) would issue a needless `UPDATE ... RETURNING` write instead of short-circuiting to the already-loaded row, since no test exercises the "nothing to update" branch. | destination.spec.js | (pending — framework will open PR) |
| 3 | implemented | high [security-coverage] | `destination.js:168-175, 216-223 — createDestination/updateDestination (VE-25263 encrypt-on-write)` | `createDestination`/`updateDestination` now compute `profileKeyCrypto.encrypt(input.vendorProfileId)` and `.hmac(...)` and pass the results as the `vendor_profile_id`/`vendor_profile_id_hmac` columns instead of the raw plaintext — but the existing `#createDestination`/`#updateDestination` specs use a mock DB whose queued write-result is asserted only via `map()`'s decrypt-on-read path, never by inspecting what was actually handed to the write call. A regression that reverted to storing `input.vendorProfileId` in plaintext (or dropped the HMAC computation, breaking the uniqueness index) would pass every current test in this file. Needs a test that captures the columns object passed into the DB write call and asserts `vendor_profile_id !== input.vendorProfileId` (ciphertext, `::`-delimited) and `vendor_profile_id_hmac === profileKeyCrypto.hmac(input.vendorProfileId)`, for both create and the update-when-vendorProfileId-is-defined branch. | destination.spec.js | VE-25866 (pending PR) |

