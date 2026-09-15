# TODO_TESTS — services/api/core-graphql-server/error

## Test framework

- **Runner**: Jest. Tests live next-to-source.
- **Naming**: `<file>.spec.js` next to source.
- **Mocking**: `jest.fn()` / `jest.spyOn`. No external DB needed — all pure in-memory.
- **Pattern**: Arrange / Act / Assert with `expect()`.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `LocalError.js — error class shape` | A regression that changes `this.name`/`this.status` constants or breaks the error-class inheritance would mis-route the GraphQL error formatter. Verify constructor contract + name/status invariants. | `error/LocalError.spec.js` | (pending — framework will open PR) |
| 2 | implemented | low | `index.js — re-exports` | A regression that drops a re-export would break consumers destructuring from `require('./error')`. | `error/index.spec.js` | (pending — framework will open PR) |
| 3 | implemented | medium | `LocalError.js — extractFromError HTTP status mapping` | A regression that mis-maps a 403 → 401 (or any status code boundary) in `extractFromError` would silently assign the wrong `errorCode`/`message` to an error surfaced to the GraphQL client. Verify each branch: 400→invalid_input, 401→authentication_error, 403→not_allowed, 404→not_found, 500→service_failure, 502/503→service_unavailable. | `error/LocalError.spec.js` | (pending — framework will open PR) |
| 4 | implemented | medium | `index.js — AuthenticationError loginUri interpolation` | A regression that drops the `loginUri` from the `AuthenticationError.message` template would remove the sign-in link from the error response, breaking user-facing auth flows. Verify message includes the URI when config.services.loginPageUri is set. | `error/index.spec.js` | (pending — framework will open PR) |
