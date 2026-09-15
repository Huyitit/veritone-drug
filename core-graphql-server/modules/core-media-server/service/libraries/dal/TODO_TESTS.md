# TODO_TESTS — media-server libraries/dal

TESTED: 9 of 12 files.

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | high [security-coverage] | `organization.js — org-scoped library queries` | A regression in the org-id filter on library queries would silently expose libraries across organizations — a tenant-isolation hazard. Verify every query carries the documented org-scope filter. | `organization.spec.js` | [#3909](https://github.com/veritone/aiware-core/pull/3909) |
| 2 | implemented | medium | `library-type.subquery.js — library-type subquery builder` | A regression in the subquery SQL composition would surface as wrong library-type filtering. Verify documented SQL shape for a known input. | `library-type.subquery.spec.js` | [#3909](https://github.com/veritone/aiware-core/pull/3909) |
| 4 | implemented | medium | `library.js — libraries query with last_trained_date_time orderBy` | A regression in the subquery that computes last-trained date (e.g. wrong join condition, missing `deleted_date_time IS NULL` guard, or wrong column) would silently return libraries in wrong order when sorted by last training time; this test calls `getLibraries({ orderBy: 'last_trained_date_time' })` with a mock DB and asserts the generated SQL contains the `MAX(lem.created_date_time)` subquery against `library_engine_model`. | `library.spec.js` | VE-24518 |
| 3 | blocked (needs refactor) | low | `index.js — re-exports` | Verify documented re-exports. | `n/a — integration setup required` | `initLibrariesDals requires real DB connection objects; wiring all 8+ DAL deps in a unit test requires test-only shim code that is out of scope for this agent` |
