# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model

## Test framework

- **Runner**: Jest 29 (via `node_modules/.bin/jest --testPathIgnorePatterns "/node_modules/"` from core-graphql-server dir; this module is excluded from the main jest run).
- **Transform**: `{}` (no transform) — plain CommonJS `.js` test files only; no TypeScript.
- **Test file location**: next-to-source (`*.spec.js`).
- **Mocking**: no mocks needed; models are pure functions with lodash + validate.js collaborators.

## Gaps

5 depth-1 files untested. Model files are typically thin data-classes from `create-model`-style factories.

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 6 | implemented | medium | `date-range.js:17 — validateDateRangeStartDate (future date)` | A regression relaxing the future-date guard would allow `startDate >= now` to pass validation, silently accepting nonsensical query ranges. | date-range.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 7 | implemented | medium | `date-range.js:25 — validateDateRangeStartDate (startDate > endDate)` | A regression in the cross-field validation would allow `startDate > endDate`, producing inverted time ranges that return zero results silently. | date-range.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 8 | implemented | medium | `paging.js:51 — convertLimit (string input)` | A regression removing the `parseInt` conversion in `convertLimit` would cause string limit values (e.g. from query params) to fail the numeric validate, rejecting valid pagination requests. | paging.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 9 | implemented | medium | `paging.js:61 — validateLimit (out-of-range)` | A regression raising or removing `MAX_LIMIT` enforcement would allow callers to request arbitrarily large pages, causing memory pressure in the collection-query path. | paging.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 10 | implemented | medium | `paging.js:77 — convertOffset (undefined defaults to 0)` | A regression removing the `|| 0` default in `convertOffset` would return `undefined` offset to the DB query, causing a syntax error or unintended full-table scan. | paging.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 1 | implemented | low | `rating.js — rating model schema` | Verify documented field shape + required-fields. | rating.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 2 | implemented | low | `date-range.js — date range model` | Verify documented field shape; date validation if present. | date-range.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 3 | implemented | low | `comment.js — comment model` | Verify documented field shape + required-fields. | comment.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 4 | implemented | low | `paging.js — pagination model` | Verify documented field shape; default limit/offset constants. | paging.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
| 5 | implemented | low | `index.js — model aggregator` | Verify documented re-exports. | index.spec.js | [#3941](https://github.com/veritone/aiware-core/pull/3941) |
