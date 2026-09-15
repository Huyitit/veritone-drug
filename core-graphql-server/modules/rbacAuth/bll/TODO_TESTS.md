# TODO_TESTS — services/api/core-graphql-server/modules/rbacAuth/bll

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework

- **Runner**: Jest 29.7.0 (`"jest": "^29.7.0"` in `services/api/core-graphql-server/package.json`).
- **Coverage command**: `pnpm --filter core-graphql-server test --coverage` (NOTE: the pnpm workspace package name
  is `core-graphql-server`, no `@veritone/` prefix — `pnpm --filter @veritone/core-graphql-server` fails to resolve).
- **Test file location convention**: next-to-source `*.spec.js` (e.g. `auditHelpers.js` → `auditHelpers.spec.js`,
  `rbacAuth.bll.js` → `rbacAuth.bll.spec.js`), consistent with the rest of `core-graphql-server`.
- **Gotcha — `transform: {}`**: the root cgql Jest config sets `"transform": {}`, so `jest.mock(...)` calls are
  **NOT auto-hoisted**. `auditHelpers.spec.js` places its `jest.mock('@veritone/core-server-base/events-map.js', …)`
  call at the very top of the file, before the `require('./auditHelpers.js')` — new specs must follow the same
  ordering or the mock silently doesn't apply and the real `events-map.js` values leak through.
- **Mocking pattern**: both files export `module.exports = function create...(serviceContext) { ... return {...} }`
  factories (the dominant cgql resolver/bll-factory shape). Tests call the factory directly with a hand-built
  `serviceContext` stub (`{ logger: {error: jest.fn()}, messageUtil: {buildActionInfo: jest.fn(...), emitPublicEvent:
  jest.fn()} }` for `auditHelpers.js`) — no DI container, no supertest/nock needed for this layer. This matches the
  general cgql "resolver-factory unit-test recipe" (call the factory with a plain fake, invoke returned methods
  directly, mock only the DAL/messageUtil/events-map boundary).
- **Fixtures**: inline literals in each `it(...)` body; no `__fixtures__/` folder in this directory.
- **Naming style**: `it('should <do X>')` — short imperative sentences (see `auditHelpers.spec.js`), NOT the fuller
  `it('does X when Y')` style used in some other cgql specs — match whichever file you're adding rows to.
- **`rbacAuth.bll.js` is NOT re-catalogued in full for this pass.** The file is ~4,300 lines with 100+ exported
  functions and has been under active, extensive test coverage since this state row's `First seen` (2026-05-23,
  `0 / 0` prior to this PR — i.e. it was previously judged fully covered). This investigation is scoped to the
  **diff introduced by VE-19358 / #4244**: new audit-emission call sites (`emitAuthGroupEvent` /
  `emitAuthPermissionSetEvent`) wired into 8 mutation functions. Only that diff is catalogued below. A full
  re-catalog of the other ~95 exported functions is out of scope for a single investigate pass (see AGENT.md
  "Don't read every file twice" / time-box guidance) and would duplicate the directory's pre-existing (untracked,
  because previously 0/0) coverage.

## Coverage map — `auditHelpers.js` (12-function factory, all new in VE-19358 / #4244)

`auditHelpers.spec.js` (NEW, +354 lines, same PR) covers:

- `emitAuthGroupEvent`: `create` (private-user-AuthGroup variant only) success case, `addMember` failure case,
  invalid-payload guard (`payload` is `null`). **NOT covered: `update`, `delete`, `removeMember` actions at all; the
  generic (non-private-user) `create` success message; the unmapped-action no-op guard
  (`if (!ev || !eventsMap[ev] || !supportedEvents[ev]) return;`); the synchronous-throw and promise-rejection
  branches of the `try { messageUtil.emitPublicEvent(...) } catch` wrapper.**
- `emitAuthPermissionSetEvent`: `delete` failure case only. **NOT covered: `create`, `update` actions; any success
  case; the invalid-payload guard; the unmapped-action guard; the throw/rejection-catch branches.**
- `buildAuthGroupActionDetails`: `create` (private-user variant) and `addMember` branches only. **NOT covered:
  `update`, `delete`, `removeMember`, or the `default: ''` fallback for an unrecognized action.**
- `buildPermissionSetActionDetails`: `update` branch only. **NOT covered: `create`, `delete`, or the `default: ''`
  fallback.**
- `normalizeAuditUser`: one input shape (uppercase `memberType`, `firstName`/`lastName` present, `scimConnectId`
  present). **NOT covered: the `jsondata.firstName`/`member.jsondata.firstName` fallback chain, the `connectId`
  fallback (vs `scimConnectId`), or a non-`'user'` `memberType` (which should omit the `userId` field).**
- `getAuditUserDisplayName` / `getAuditUserDisplayNames`: only indirectly exercised (via
  `buildAuthGroupMemberAddActionDetails`) for the single-user, full-name-present path. **NOT covered: the
  zero-users `'unknown user'` fallback, the multi-user `', '`-joined format, or the `connectId`/`userId`/`memberId`
  fallback chain in `getAuditUserDisplayName` when no name fields are present.**
- `getAuthGroupId`, `getPermissionSetId`, `getFirstAuditUser`, `getAuditUsers`, `isPrivateUserAuthGroupCreate`:
  only indirectly exercised (via the above) for their "happy" branch. Not tested directly for their fallback/edge
  branches (missing `id` field, non-array `audit.users`, `isPrivateUserAuthGroup: false`, 2+-user arrays).

## Coverage map — `rbacAuth.bll.js` (audit-emission wiring diff only)

`rbacAuth.bll.spec.js` (+561 lines, same PR) exercises the business logic of `updateAuthGroup` (describe block at
line 611) and `deleteAuthGroup` (line 684), but **`emitAuthGroupEvent`/`emitAuthPermissionSetEvent` are not
referenced anywhere in `rbacAuth.bll.spec.js`** (confirmed via grep) — no test spies on or asserts against the
audit-emission call sites for ANY of the 8 wired mutation functions. `authGroupRemoveMembers`,
`createAuthPermissionSet`, and `updateAuthPermissionSet` don't even have dedicated `describe` blocks. Per this
scan's task scope, only these 5 functions (named in the state.md gap note) are filed below —
`createAuthGroup`/`authGroupAddMembers`/`deleteAuthPermissionSet` audit wiring is understood to be a pre-existing
gap of the same shape but out of scope for this pass.

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | high [security-coverage] | `auditHelpers.js:167 — emitAuthGroupEvent` (`update`/`delete`/`removeMember` actions) | A regression that breaks the `update`/`delete`/`removeMember` branches of the AuthGroup audit-event map (wrong `eventsMap` key, dropped `event`/`type`/`targetType` field) would silently stop generating audit-log entries for AuthGroup permission changes — access-control mutations would go unaudited with no test to catch it. Cover success + failure for all three actions. | auditHelpers.spec.js | (merged — #4438) |
| 2 | implemented | high [security-coverage] | `auditHelpers.js:289 — emitAuthPermissionSetEvent` (`create`/`update` actions) | A regression in the `create`/`update` branches of the AuthPermissionSet audit-event map would silently stop generating audit-log entries when a permission set (an authorization-boundary object) is created or modified — currently only the `delete`-failure case is verified. | auditHelpers.spec.js | (merged — #4438) |
| 3 | implemented | medium | `auditHelpers.js:150 — buildAuthGroupActionDetails` (`update`/`delete`/`removeMember`/default branches) | A regression in the `update`/`delete`/`removeMember` action-details message branches (or the unknown-action `default: ''` fallback) would produce a blank or wrong audit message for those mutations, with no existing test asserting the exact wording. | auditHelpers.spec.js | (merged — #4438) |
| 4 | implemented | medium | `auditHelpers.js:276 — buildPermissionSetActionDetails` (`create`/`delete`/default branches) | A regression in the `create`/`delete` action-details branches (or the unknown-action fallback) would produce a wrong/blank audit message, uncaught by the existing single `update`-only test. | auditHelpers.spec.js | (merged — #4438) |
| 5 | implemented | medium | `auditHelpers.js:185,305 — emitAuthGroupEvent` / `emitAuthPermissionSetEvent` (unmapped-action no-op guard) | A regression that removes the `if (!ev || !eventsMap[ev] || !supportedEvents[ev]) return;` guard would throw (`Cannot read property 'event' of undefined`) instead of silently no-op'ing for an unrecognized action string. Verify an unmapped action neither throws nor calls `emitPublicEvent`. | auditHelpers.spec.js | (merged — #4438) |
| 6 | implemented | medium | `auditHelpers.js:227-245,335-356 — emitAuthGroupEvent` / `emitAuthPermissionSetEvent` (sync-throw and rejected-promise from `messageUtil.emitPublicEvent` are caught, not propagated) | A regression that lets a synchronous throw or a rejected promise from `messageUtil.emitPublicEvent` propagate (instead of being caught and logged via `serviceContext.logger.error`) would crash the calling mutation resolver on an audit-emission failure, turning an audit-logging problem into a full request failure. | auditHelpers.spec.js | (merged — #4438) |
| 7 | implemented | low | `auditHelpers.js:30 — normalizeAuditUser` (fallback field paths + non-`'user'` memberType) | A regression in the `jsondata.firstName`/`member.jsondata.firstName` fallback chain, the `connectId` fallback, or the `memberType !== 'user'` branch (which should omit `userId`) would silently drop display fields for SCIM-sourced or non-user audit entries. | auditHelpers.spec.js | (merged — #4438) |
| 8 | implemented | low | `auditHelpers.js:64,83 — getAuditUserDisplayName` / `getAuditUserDisplayNames` (name-fallback chain, empty-users `'unknown user'`, multi-user join) | A regression that stops returning `'unknown user'` for an empty audit-users array, breaks the `', '`-joined multi-user format, or breaks the `connectId`/`userId`/`memberId` fallback when no name fields are present would produce a confusing/blank audit message. | auditHelpers.spec.js | (merged — #4438) |
| 9 | implemented | high [security-coverage] | `rbacAuth.bll.js:950 — updateAuthGroup` (audit-emission wiring) | A regression that removes or misroutes the `emitAuthGroupEvent(context, auditPayload, null/err, 'update')` call inside `updateAuthGroup` would silently stop audit-logging AuthGroup permission renames/changes — no existing test spies on `emitAuthGroupEvent` for this path. | rbacAuth.bll.spec.js | (merged — #4420) |
| 10 | implemented | high [security-coverage] | `rbacAuth.bll.js:984 — deleteAuthGroup` (audit-emission wiring) | A regression that removes or misroutes the `emitAuthGroupEvent(context, auditPayload, null/err, 'delete')` call inside `deleteAuthGroup` would silently stop audit-logging AuthGroup deletions — a high-impact permission change with no audit trail and no existing test asserting the call happens. | rbacAuth.bll.spec.js | (merged — #4420) |
| 11 | implemented | high [security-coverage] | `rbacAuth.bll.js:1227 — authGroupRemoveMembers` (audit-emission wiring) | A regression that removes or misroutes the `emitAuthGroupEvent(context, auditPayload, null/err, 'removeMember')` call inside `authGroupRemoveMembers` would silently stop audit-logging member-removal from an AuthGroup — an access-revocation event going unaudited. No dedicated `describe` block exists for this function at all. | rbacAuth.bll.spec.js | (merged — #4420) |
| 12 | implemented | high [security-coverage] | `rbacAuth.bll.js:1431 — createAuthPermissionSet` (audit-emission wiring) | A regression that removes or misroutes the `emitAuthPermissionSetEvent(context, input, null/err, 'create')` call inside `createAuthPermissionSet` would silently stop audit-logging creation of a new permission set (a new authorization-boundary object). No dedicated `describe` block exists for this function at all. | rbacAuth.bll.spec.js | (merged — #4420) |
| 13 | implemented | high [security-coverage] | `rbacAuth.bll.js:1490 — updateAuthPermissionSet` (audit-emission wiring) | A regression that removes or misroutes the `emitAuthPermissionSetEvent(context, auditPayload, null/err, 'update')` call inside `updateAuthPermissionSet` would silently stop audit-logging modifications to a permission set's grants. No dedicated `describe` block exists for this function at all. | rbacAuth.bll.spec.js | (merged — #4420) |
