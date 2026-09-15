# TODO_TESTS — core-graphql-server/validator/json-schema

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

Source files (depth-1): `engine-output.js` — exports JSON Schema definition objects (uuid, confidence, tag, word,
vector, object, series, attribute, engineOutput, sentiment). No executable functions; pure schema data.
Test approach: use a JSON schema validator (the `jsonschema` package already in the service's dependency tree,
as used by `validator/index.js`) to verify that known valid payloads pass and known invalid payloads fail.
Test framework: Jest 29.7.0, next-to-source `*.spec.js` (`engine-output.spec.js`).

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | done | medium | `engine-output.js — engine-output JSON schema validator` | A regression in the engine-output schema (e.g. loosening a required field or accepting an invalid type) would let malformed engine output corrupt downstream consumers. Verify documented valid + invalid examples. | `engine-output.spec.js` (1 case) | VE-23621 |
| 2 | done | medium | `engine-output.js — series schema: valid entry (startTimeMs + stopTimeMs) passes; missing required field fails` | A regression that drops `startTimeMs`/`stopTimeMs` from required would let malformed engine output bypass validation and corrupt downstream consumers. | `engine-output.spec.js` (2 cases) | VE-23621 |
| 3 | done | medium | `engine-output.js — sentiment schema: anyOf enforcement (requires positiveValue OR negativeValue)` | A regression that removes the `anyOf` constraint would silently accept sentiment objects with neither field, producing invalid sentiment data in results. | `engine-output.spec.js` (2 cases) | VE-23621 |
| 4 | done | low | `engine-output.js — uuid schema: pattern rejects non-UUIDv4 strings` | A regression that weakens the UUID pattern would allow malformed IDs to pass validation and propagate as entity references. | `engine-output.spec.js` (2 cases) | VE-23621 |
