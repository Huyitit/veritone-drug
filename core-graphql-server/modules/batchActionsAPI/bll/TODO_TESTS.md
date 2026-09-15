# TODO_TESTS — services/api/core-graphql-server/modules/batchActionsAPI/bll

## Test framework

- **Runner**: Jest. Tests next-to-source.
- **Naming**: `<file>.spec.js` (e.g. `util.spec.js`).
- **Mocking**: `serviceContext.mock.js` from `test/serviceContext.mock.js`; `jest.fn()` on JWT, mainUtil, resUtil collaborators.
- **Pattern**: Arrange / Act / Assert with `jest.fn` stubs for DAL/JWT.

## Coverage map

TESTED: executeJobTemplate, tdoBatch.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | low | `util.js — shared utility helpers` | A regression in the bll-shared utilities would surface across both batch-action BLL files. Verify the documented helpers: hasOperationsRightForBatchExecutions, isAValidOrganization, createBatchJwtToken. | `util.rights.spec.js` (isAValidOrganization cases) | VE-24813/[#4319](https://github.com/veritone/aiware-core/pull/4319) |
| 2 | implemented | high [security-coverage] | `util.js:41 — createBatchJwtToken` | A regression that drops or weakens the `scope` claim (actions: job:create/read/update/delete), replaces the issuer, or extends expiry would allow a forged or over-permissioned token to reach eventing-service. Verify: signed payload contains correct `contentOrganizationId`, `scope.actions` match `batchOperations`, issuer is `core-graphql-server`, expiresIn is `1d`; throws `NotAllowed` when userId or organizationGuid is missing from context. | `util.spec.js` | VE-24812/[#4318](https://github.com/veritone/aiware-core/pull/4318) |
| 3 | implemented | high [security-coverage] | `util.js:66 — hasOperationsRightForBatchExecutions` | A regression that weakens the rights-intersection check (e.g. partial match instead of full match) would allow users with fewer than all 4 batch operations to execute batch actions. Verify: returns true only when all 4 rights are present; returns false on partial match; returns true for superAdmin regardless of rights. | `util.rights.spec.js` | VE-24813/[#4319](https://github.com/veritone/aiware-core/pull/4319) |
