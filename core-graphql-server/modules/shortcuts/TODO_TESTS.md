# TODO_TESTS — shortcuts module

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework (core-graphql-server)

- **Runner**: Jest 29 (`jest --coverage --maxWorkers=50%`)
- **Coverage command**: `pnpm --filter core-graphql-server test`
- **Test file location**: `*.spec.js` next-to-source (`index.spec.js` alongside `index.js`)
- **Naming**: `*.spec.js`
- **Mocking**: `jest.mock` for `veritone-json-schemas` (VALIDATORS) + in-constructor `../../dal/engineCategory`; `jest.fn()` collaborators; express `req/res` (node-mocks-http for `res`)
- **Fixtures**: inline literals in `beforeEach`; shared helpers in `../../test/mockUtil.js`

## Gap analysis

**1 source file**: `index.js` — `Shortcuts` class with `validateEngineOutput` HTTP handler (Express `req/res`).

- **Tested**: 1 of 1 — `index.spec.js` (5 tests) covers the constructor shape + all 4 `validateEngineOutput` branches
- **Untested**: none

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | done | low | `index.js — shortcuts module factory` | Verify documented module shape. | `index.spec.js` (1 case) | VE-23446 |
| 2 | done | medium | `index.js:14 — validateEngineOutput: missing validationContract + wrong array shape` | A regression in the guard clause (lines 18–33) would silently accept malformed input instead of returning 400 INVALID_INPUT with `must have one and only one validationContract`. | `index.spec.js` (1 case) | VE-23446 |
| 3 | done | medium | `index.js:14 — validateEngineOutput: unsupported validationContract` | A regression that removes the engine-category or validator lookup check (lines 43–51) would return a 200 instead of the documented 400 NOT_FOUND. | `index.spec.js` (1 case) | VE-23446 |
| 4 | done | medium | `index.js:14 — validateEngineOutput: valid input passing schema validation` | A regression that drops the `valid=true` path (lines 56–61) would fail to return the `{ data: results }` shape, breaking any consumer that inspects the result. | `index.spec.js` (1 case) | VE-23446 |
| 5 | done | medium | `index.js:14 — validateEngineOutput: validator returns invalid result` | A regression in the invalid-result branch (lines 62–74) would drop the `validationErrors` field or return the wrong status code, silently masking validation failures. | `index.spec.js` (1 case) | VE-23446 |
