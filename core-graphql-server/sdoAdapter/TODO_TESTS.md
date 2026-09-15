# TODO_TESTS — core-graphql-server/sdoAdapter

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

Source files (depth-1): `audioVault.js`, `csrdsAutomation.js`, `iMediaTouch.js`, `wideOrbit.js`.
Test framework: Jest 29.7.0, chai assertions, next-to-source `*.spec.js`. `serviceContext.mock.js` used for context.
TESTED: `wideOrbit.js` (wideOrbit.spec.js — 7 tests covering advertiser registry, playout, duplicates, errors).
UNTESTED: `audioVault.js`, `csrdsAutomation.js`, `iMediaTouch.js`.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium | `csrdsAutomation.js:10 — createEvents (valid playbackstate maps to result array)` | A regression in CSRDS field-mapping (startDateTime/endDateTime calculation, stationCallSign assignment, cutid-based UUID) would silently produce wrong events. Verify output shape against a known playbackstate fixture. | yes | [#3999](https://github.com/veritone/aiware-core/pull/3999) |
| 2 | implemented | medium | `iMediaTouch.js:11 — createEvents (valid playlist maps to result array)` | A regression in iMediaTouch XML-to-event mapping (camelized key names, duration parsing, stationId underscore replacement) would silently produce wrong events. Verify output shape against a known playlist entry fixture. | yes | [#3999](https://github.com/veritone/aiware-core/pull/3999) |
| 3 | implemented | medium | `audioVault.js:23 — createEvents (valid pipe-delimited event returns single-element array)` | A regression in AudioVault pipe-delimited parsing (field order, duration conversion, UUID generation) would silently drop or corrupt ingested events. Verify output shape for a known pipe-delimited string. | yes | [#3999](https://github.com/veritone/aiware-core/pull/3999) |
| 4 | implemented | medium | `audioVault.js:23 — createEvents (nil body throws Error)` | A regression in the nil-body guard would allow null/undefined event data to propagate into the pipe-split, causing an unhandled TypeError instead of the documented error. | yes | [#3999](https://github.com/veritone/aiware-core/pull/3999) |
| 5 | blocked (needs refactor) | medium | `iMediaTouch.js:33 — camelizeRootKeys (converts underscore keys to camelCase)` | A regression in camelizeRootKeys (wrong lodash camelCase mapping, key collision) would silently corrupt the event object returned by iMediaTouch. Verify known underscore → camelCase conversions. | no — function is not exported; cannot test without modifying production code |  |
| 6 | implemented | medium | `csrdsAutomation.js:36 — createEvents (first event startDateTime uses remaining/currenttime diff)` | A regression in the time-offset calculation for the first event (remaining minus length duration) would produce wrong startDateTime values for the leading event in a multi-event playlist. | yes | [#3999](https://github.com/veritone/aiware-core/pull/3999) |
