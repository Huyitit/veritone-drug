# TODO_TESTS — services/api/core-graphql-server/modules/v3DataModel/social/vendor

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

**Test framework**: Jest 29.7.0 (root cgql config), assertions mixed `chai@4.3.10` `expect`/jest matchers per
existing file (`ayrshareAdapter.spec.js` uses chai's `expect`, `publishVendorProfile.spec.js` uses jest's
`expect`/`jest.fn`/`jest.mock`) — match whichever style the touched spec file already uses. Test placement:
next-to-source (`<name>.spec.js`). `jest.mock('request-promise')` at module scope; `serviceContext.mock.js` (two
levels up: `../../test/serviceContext.mock.js`) provides the fake context; a fresh adapter is built per-test via
`makeAdapter()` when a specific env/config permutation is needed, otherwise a module-scoped `adapter` is reused.

**Coverage note**: both files already carry unusually thorough test suites (6 tests for `publishVendorProfile.js`'s
6-function registry; ~20 tests for `ayrshareAdapter.js` covering createProfile/getConnectUrl/verifyConnection/
detachAccount/updateProfileLabel, lazy-credential handling, DB-credential decrypt, and a dedicated logging-safety
block). The gaps below are genuine uncovered branches found by reading `ayrshareAdapter.js` line-by-line against
its spec — `publishVendorProfile.js` has no gap (every exported behavior — default vendor, case-insensitivity,
factory caching, unregistered-vendor throw, missing-method throw — has a directly corresponding test).

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium | `ayrshareAdapter.js:189 — verifyConnection` (connected:false filter) | The account-filter predicate `a.connected !== false` would stop excluding an explicitly disconnected account (`{ platform: 'youtube', connected: false }`) from the connected-accounts list, so a severed/disconnected social account would still be reported as connected instead of `'PENDING'`. | `ayrshareAdapter.spec.js` (connected:false filter case) | VE-26411 |
| 2 | implemented | medium | `ayrshareAdapter.js:36 — loadCreds` (DB-read failure fallback) | If `serviceContext.dbConnections['sso'].read.map` rejects (a real Postgres/network failure, not just "no rows"), the function should catch it, log a `logger.warn`, and fall through to the env-var credential fallback rather than letting the rejection propagate and break every profile operation; this path currently has zero direct test coverage (only the happy DB-read and the "no DB, use env" paths are tested). | `ayrshareAdapter.spec.js` (DB read failure fallback case) | VE-26411 |
| 3 | implemented | low | `ayrshareAdapter.js:204 — verifyConnection` (label fallback chain) | The label-resolution fallback chain (`displayName` → `username` → `res.displayNames[0].displayName` → the bare `expected` platform string) only has its first branch (`displayName`) under test; a regression breaking the `username`/`displayNames[0].displayName`/final-fallback branches would silently return the wrong (or an empty) `connectedAccountLabel` for accounts whose Ayrshare response shape omits `displayName`. | `ayrshareAdapter.spec.js` (3 fallback-branch cases) | VE-26411 |
