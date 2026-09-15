# TODO_TESTS — services/api/core-graphql-server/loaders

## Test framework

- **Runner**: Jest. Tests next-to-source.

## Coverage map (depth-1)

TESTED: dagTemplate (dagTemplate.spec.js), task (task.spec.js). UNTESTED: user.js, index.js (aggregator). Note: engine.js + job.js removed by VE-19680 revert (2026-06-23).

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `user.js — user DataLoader` | A regression in the user DataLoader (e.g. cache key collisions, missing tenant scoping) would silently return cross-tenant user data — a data-leak hazard. Verify the documented cache key shape + per-request scoping. | loaders/user.spec.js | VE-24471 |
| 2 | implemented | low | `index.js — loader aggregator` | A regression that drops a loader from createLoaders would break callers destructuring from the loaders index. Verify current loaders present: tasksByJobIds, usersById, dagTemplatesByJobIds, dagTemplatesByIds. (engine+job loaders removed by VE-19680 revert 2026-06-23.) | loaders/index.spec.js | VE-24471 |
