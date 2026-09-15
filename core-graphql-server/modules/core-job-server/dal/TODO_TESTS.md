# TODO_TESTS — core-job-server/dal

TESTED (7): build-capability, job, task, + 4 more.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | done | medium | `cluster.js — cluster DAL` | A regression in cluster scoping (e.g. cross-cluster row leakage) would surface as data crossing cluster boundaries. Verify the documented cluster-scope filter is present on every query. | `cluster.spec.js` (8 cases: shape, missing-callback, soft-delete scoped to cluster_id + deleted_date is null, empty→null, error→callback, pools.core fallback, pause/unpause paused flag) | VE-23626 |
| 2 | implemented | low | `index.js — dal aggregator` | Missing init guard validation would allow callers to pass bad state silently; missing shape check would let accidental removal of a sub-DAL go undetected. | `index.spec.js` (4 cases: throws on missing app/model/pools, shape check for all 8 sub-DAL keys) | VE-24485 |
| 3 | implemented | low | `old.js — deprecated DAL helpers` | Regressions in `camelizeRootKeys`/`decamelizeRootKeys` key-transform logic or `getSchemaName` would silently corrupt query results; `execute` error/success paths confirmed with pool mock. | `old.spec.js` (10 cases: getSchemaName, camelizeRootKeys/decamelizeRootKeys success+throw, execute success/error/params-omitted, executeRead/executeWrite delegation) | VE-24485 |
