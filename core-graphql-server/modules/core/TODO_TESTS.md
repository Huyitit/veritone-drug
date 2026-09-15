# TODO_TESTS — services/api/core-graphql-server/modules/core

## Test framework

- **Runner**: Jest.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 2 | pending | medium | `index.js:302 — createModule(serviceContext)`, `loaders.mediaConstraint` wiring (VE-26450) | `serviceContext.loaders` gained a `mediaConstraint: require('../../loaders/mediaConstraint.js')(serviceContext)` entry alongside the existing `task`/`user`/`dagTemplate` loaders, but `index.spec.js` neither mocks `../../loaders/mediaConstraint.js` (unlike the other three loader mocks) nor asserts `loaders.mediaConstraint` is present on the returned/mutated `serviceContext` — the smoke test's own `mod`-shape assertions never look at `loaders` at all. A regression dropping this wiring, or a future change to the real (currently-unmocked) factory that throws during construction, would go undetected by this suite. | | |
| 1 | implemented | medium | `index.js — createModule(serviceContext)` | A regression in the core-schema module factory (e.g. failing to wire a documented resolver, mis-typing the schema slice key, or omitting the ProcessingProject/ProcessingDeliverables resolvers added 2026-06-23) would silently break a portion of the public GraphQL schema. Verify the returned module shape includes typeDefs + resolvers (including ProcessingProject, ProcessingDeliverable). | `modules/core/index.spec.js` | [VE-24659](https://veritone.atlassian.net/browse/VE-24659) |
