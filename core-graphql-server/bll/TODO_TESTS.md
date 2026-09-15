# TODO_TESTS — services/api/core-graphql-server/bll

## Test framework

- **Runner**: Jest. Tests live NEXT-TO-SOURCE as `<name>.spec.js`.

## Coverage map (depth-1)

TESTED (most): application, cluster, dagTemplate, emailProvider, engine, job, mailbox, notification, openidConnect, organizationInvite, organizationInvite.selfService, organizationRegistration, task, user.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `asset.js — isNotFoundError, retryOnNotFound, getAssetSize` | A regression in the asset business logic (e.g. wrong S3 URL composition, missing auth check) would surface as broken asset upload/download flows. All three public functions tested: isNotFoundError (error-code + statusCode paths), retryOnNotFound (5 cases incl. back-off and non-retryable propagation), getAssetSize (7 cases incl. metadata shortcut, blob, external HEAD, retries, fakeId). | `asset.spec.js` | [#3897](https://github.com/veritone/aiware-core/pull/3897) |
| 2 | implemented | high [security-coverage] | `organizationInvite.js:402 — createOrganizationInvite` | The new `enableStrictRoleValidation` feature-flag guard around `dal.organizationInvite.validateApplicationRolesExist(...)` would silently stop enforcing (flag on) or start enforcing (flag off) role-existence validation on invite creation without any test noticing — existing specs only exercise the flag-undefined (falsy) path. | `organizationInvite.spec.js` | [#4492](https://github.com/veritone/aiware-core/pull/4492) |
| 3 | implemented | high [security-coverage] | `organizationInvite.js:1118 — updateOrganizationInvite` | The same `enableStrictRoleValidation` guard around `dal.organizationInvite.validateApplicationRolesExist(...)` on the invite update/approve action path would silently stop or start enforcing role-existence validation without any test noticing — existing specs only exercise the flag-undefined (falsy) path. | `organizationInvite.spec.js` | [#4492](https://github.com/veritone/aiware-core/pull/4492) |
