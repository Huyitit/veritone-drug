# TODO_TESTS — core-graphql-server/scripts

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

12 files. All are one-shot operational/migration CLI scripts or dev-tooling scripts. None export a reusable API.
`encryptCreds.js/decryptCreds.js/encryptOkta.js` delegate crypto logic to `@veritone/core-server-base/util.js` (tested there).
The `isolated-tests.util.js` is a CI sharding helper. Remaining files are pg scripts and Python tools.
Test-value assessment: encrypt/decrypt round-trip is the only gap with security-coverage relevance; all others are wontfix candidates.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | blocked (CLI runner, no exports) | high [security-coverage] | `encryptCreds.js / decryptCreds.js / encryptOkta.js — credential encryption utilities` | A regression in the encrypt/decrypt round-trip (wrong key derivation, wrong cipher mode) would silently corrupt stored credentials or weaken at-rest encryption. Verify round-trip identity + reject of tampered ciphertext. File as one combined spec. | n/a — refactor needed | `encryptCreds.js`, `decryptCreds.js`, and `encryptOkta.js` are CLI runners with no exports; actual encrypt/decrypt logic lives in `@veritone/core-server-base/util.js` — add tests there |
| 2 | wontfix | medium | `__userRoleRepair.js / recorrelate-tdos-by-source.js / bulk-update-tdo-public.js / bulk-program-source-update.js` | One-shot operational scripts. Tests are typically lower-value here (run-once, manual verification); these may be candidates for `wontfix`. File rows for traceability. | n/a | One-shot operational scripts with no exports — manual verification is the standard for these |
| 3 | wontfix | low | `api-coverage-report.js / local-config.js / isolated-tests.util.js` | Developer / CI helper scripts; low test-value. May be marked `wontfix`. | n/a | Developer/CI helpers with no exported API — no unit test value |
