# TODO_TESTS — v3DataModel/validation

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

Test framework: Mocha + Chai (`chaiExpect`), matching `schemaValidator.spec.js` / `publishSchemaParity.spec.js` in
this directory — next-to-source `*.spec.js`, service context via `../test/serviceContext.mock.js`.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium [security-coverage] | `schemaValidator.js:52-56 — validateAgainstSchema (ajv.compile catch)` | A malformed/uncompilable `publishSchema`/`configSchema` definition (e.g. bad `$ref`, invalid keyword combination) would throw an unhandled ajv compile error instead of the documented `errors.InternalServerError`, since VE-24929's switch to ajv8 (#4419) added this catch branch with no test exercising it. | `schemaValidator.spec.js` | VE-25595 (pending — PR opening) |

