# TODO_TESTS — services/api/core-graphql-server/config/init

## Test framework

- **Runner**: Jest.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `stubConfigGenerator.js — graphql-server stub-config emission` | A regression in the stub-config generator (wrong section names, missing resource entries, broken template-string fallback) would produce stub configs that fail at runtime load. Verify the documented output shape for a known schema input. | `config/init/stubConfigGenerator.spec.js` | [#4266](https://github.com/veritone/aiware-core/pull/4266) |
