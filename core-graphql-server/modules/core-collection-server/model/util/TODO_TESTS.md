# TODO_TESTS — core-collection-server/model/util

## Code-duplication observation

**The 8 files in this dir mirror `lib/core-server-base/model/util/` by name** (validators.js, to-snake-case.js, to-camel-case.js, converters.js, create-model.js, convert-db-value.js, embedded-model.js, embedded-model-array.js). Parity was investigated 2026-07-06 (VE-24774): the two copies have **intentionally diverged** — see divergence summary below.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | wontfix (diverged — 2026-07-06) | medium | (cross-cutting) `model/util/*` ↔ `lib/core-server-base/model/util/*` parity | Files have diverged bilaterally — neither copy is a subset of the other. Parity is not achievable or desirable. See divergence summary below. | VE-24774 | — |
| 2 | implemented | low | `validators.js / converters.js / case transforms` (file-level) | If the duplication is intentional and the team prefers per-file unit tests in this module, file analogous specs to VE-21452's batch (validateString, toUnderscore, etc.). May be marked `wontfix` if VE-21452 tests are deemed sufficient via cross-reference. | `to-camel-case.spec.js`, `to-snake-case.spec.js` (validators/convert already specced) | VE-24519 |

## Divergence summary (verified 2026-07-06)

`diff lib/core-server-base/model/util/<file> services/api/core-graphql-server/modules/core-collection-server/model/util/<file>` confirms bilateral divergence across all 8 shared files. Each copy has been independently extended for its module's domain needs; the divergence is intentional.

| File | cgql-only additions | lib-only additions |
|------|--------------------|--------------------|
| `validators.js` | `validateUUID`, `validateOptionalUUID`, `validateOptionalEmailConstraint` (+ `require('validate.js')`); uses `_.isNull` | `validateNonEmptyString`; uses `_.isNil` throughout; drops validate.js |
| `converters.js` | — | Array-type guard before processing; `.trim()` on float parse; trailing comma |
| `convert-db-value.js` | — | Preserves dot-keys (e.g. `file`) unchanged during camelCase conversion |
| `to-camel-case.js` | — | Strips leading/trailing underscores from `dbKey` before conversion |
| `to-snake-case.js` | — | Lowercases initial uppercase character of `fieldKey` before conversion |
| `create-model.js` | — | `require('sanitize-html')`; minor comment/style differences |
| `embedded-model.js` | — | Trailing comma in object literal |
| `embedded-model-array.js` | — | Comment and style differences |

**Decision**: No parity test will be written. The copies serve different module boundaries and should continue to evolve independently. Row 1 is closed as wontfix.
