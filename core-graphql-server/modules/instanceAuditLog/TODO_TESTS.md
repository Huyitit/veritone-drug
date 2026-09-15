# TODO_TESTS — instanceAuditLog module

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `index.js — module factory` | A regression in audit-log module wiring (resolvers, typeDefs) would silently break audit-log queries from the admin UI. Verify documented module shape. | `index.spec.js` (module factory / createModule) | VE-23679/[#4377](https://github.com/veritone/aiware-core/pull/4377) |
