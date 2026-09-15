# TODO_TESTS — root module

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `index.js — root schema module factory` | A regression in the root module's schema-stitching (missing typeDefs, mis-wired resolvers) would silently break a portion of the top-level GraphQL schema. Verify the documented module shape. | `index.spec.js` | VE-24517 |
