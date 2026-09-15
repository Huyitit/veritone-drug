# TODO_TESTS — services/api/core-graphql-server/modules/internalAPI/dal

Curated by `starlord-aqa` (automation; formerly the `worker-psd-aqa` VM agent). Each row is
one proposed test addition with a clear regression statement. Anyone (human or automation) may add
rows; only the automation updates `Implemented` and `PR`.

Append-only at the bullet level — implementation marks a row done, it never disappears.

## Test framework

- Runner: Jest 29.7.0 (root `core-graphql-server` project; `pnpm test` → `jest --coverage`).
- Test file location: co-located `*.spec.js` next to source (`internalToken.spec.js`,
  `scheduledEvent.spec.js`, `queryMonitor.spec.js` all live directly in this `dal/` dir).
- Mocking / fixtures: `require('../../../test/serviceContext.mock.js')()` builds a shared
  `serviceContext` mock with `dbConnections.<key>.{read,write}` fake pg-promise connections
  exposing `._push(rows, throwOnUnexpected, matchTokens, checkFunction)` to queue query results
  (and optionally assert/reject on the SQL issued) and `._clearAll()`/`._clearResultQueue()` to
  reset between tests. `require('../../../test/mockUtil.js')()` provides `makeContext()` for the
  GraphQL resolver `context` arg. No `sinon`/`nock` used in this dir — all DB/HTTP boundaries go
  through this shared connection mock.
- Assertion style: Chai's `chaiExpect(...).to...` (not Jest's built-in `expect`).
- Naming/describe convention: `describe('<file>.js — <fn>()')` or `#<fn>` nesting; `it('should
  ...')` sentences.
- Gotcha: `queryMonitor.spec.js`'s analyze-sweep block uses a `discoveryQueued` tracking array +
  `runSweep()` helper to auto-top-up any database's discovery query the test didn't explicitly
  queue — the mock throws on an unexpected/unqueued query, so any new database or new query path
  added to the analyze sweep must be wired through that helper too.

## Gap rows

### `queryMonitor.js`

The VE-25603 (#4480) ANALYZE-sweep addition is thoroughly covered by the 15+ new cases in
`queryMonitor.spec.js`'s "analyze sweep" `describe` block (never-analyzed-first ordering,
cross-database cap, time-budget deferral, per-table failure isolation, identifier quoting,
missing-connection skip, etc.) — no new rows needed there. The gaps below are in the
**pre-existing kill-sweep code** this run's full-file read also covered per Step 2.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | high | `queryMonitor.js:363-370 — queryDb kill-failure branch (summary.killFailure vs killFailed typo)` | The `else` arm of the kill-result check sets `queries[k].action = 'killFailed'` and increments `summary.killFailed++`, but `summary` is only ever initialized with a `killFailure: 0` field (never `killFailed`) — so this increments a fresh `undefined` property to `NaN` instead of the intended `killFailure` counter, which silently stays `0` forever. Zero existing test exercises the "neither `pg_cancel_backend` nor `pg_terminate_backend` truthy" case, so this has never surfaced. A test forcing a kill statement to return a falsy result row would both catch a future regression here and expose that the counter is already broken today (worth flagging to a human for a real code fix, not just a test). | `queryMonitor.spec.js` — VE-27378 row 1 | (PR pending — will be linked once opened this run) |
| 2 | implemented | low | `queryMonitor.js:249 — queryDb 'media' → 'media_platform' key rename` | A regression removing this rename would throw `no db configured for media` instead of routing to the `media_platform` connection whenever a caller passes the legacy `media` key. | `queryMonitor.spec.js` — "should route a legacy \"media\" db key to the media_platform connection instead of throwing" | VE-27611/#4632 |
| 3 | implemented | low | `queryMonitor.js:239-246 — formatSql truncation at 2000 chars` | A regression changing or dropping the 2000-char substring cap would let oversized `sql` text reach the GraphQL response / emitted event uninformed of the limit; no existing test asserts truncation at the boundary. | `queryMonitor.spec.js` — "should truncate an over-long query sql string to 2000 chars and strip newlines" | VE-27611/#4632 |

### `internalToken.js`

Zero unit tests exist for the token-issuance/approval/revocation state machine itself — only the
pure helpers (`getTokenTag`, `obscureToken`, `generateToken`, `listAllRights`, `validateTag`,
`validateRights`) are covered in `internalToken.spec.js`. This is the internal-admin-token rights
system; the gaps below are the actual request → approve → active / revoke lifecycle.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 4 | implemented | high [security-coverage] | `internalToken.js:386-441 — approveInternalToken self-approval guard` | The `user.id === json.requestorId` check throws `NotAllowed` ("You cannot approve your own token request"). A regression dropping or inverting this check would let a requester grant their own elevated rights without independent review — a privilege-escalation path with zero test coverage today. | `internalToken.spec.js` — VE-27378 row 4 | (PR pending — will be linked once opened this run) |
| 5 | implemented | high [security-coverage] | `internalToken.js:400-424 — approveInternalToken already-revoked / already-approved guards` | A regression to either `getTokenState(token) === 'revoked'` or the `state === 'pending' \|\| state === 'updatePending'` check would let a revoked token be re-approved (reviving revoked rights) or let an already-active token be "approved" again, silently skipping the intended one-shot approval semantics. | `internalToken.spec.js` — VE-27378 row 5 | (PR pending — will be linked once opened this run) |
| 6 | implemented | high [security-coverage] | `internalToken.js:443-462 — approveInternalToken rights swap on approval` | Approval moves `requestedRights`/`requested_rights` into `json.rights`, clears `isRevoked`/`isPending`/`requestId`, and stamps `approverId`/`approvedDateTime`. A regression leaving stale `requested_rights` in place, failing to clear `isPending`, or not recording `approverId` would break the audit trail for who approved which rights, or leave a token stuck in `pending` state after "approval." | `internalToken.spec.js` — VE-27378 row 6 | (PR pending — will be linked once opened this run) |
| 7 | implemented | medium [security-coverage] | `internalToken.js:478-527 — revokeInternalToken already-revoked guard + no self-revoke restriction` | A regression to the `getTokenState(token) === 'revoked'` guard would allow double-revocation to overwrite `revokerId`/`revokedDateTime` history. Also verify the documented asymmetry vs. approval: per the code comment ("any superadmin can revoke token; no check needed") a token owner CAN revoke their own token — a test should pin this intentional behavior so a future "fix" doesn't accidentally block legitimate self-revocation. | `internalToken.spec.js` — VE-27378 row 7 | (PR pending — will be linked once opened this run) |
| 8 | implemented | medium [security-coverage] | `internalToken.js:296-343 — updateInternalToken label-only change bypasses approval` | Only the `input.rights` branch sets `json.isPending = true`/`requestId`/`requestorId`; a label-only update (`input.label` with no `input.rights`) intentionally leaves the token's active rights and pending-state untouched. A regression merging these branches (e.g. always setting `isPending`, or never setting it for a rights change) would either force needless re-approval for a cosmetic label edit or — worse — let a rights change take effect without approval. | `internalToken.spec.js` — VE-27378 row 8 | (PR pending — will be linked once opened this run) |
| 9 | implemented | medium | `internalToken.js:218-233 — requestInternalToken tag validation + forced task_type:internal` | A regression to the `!validateTag(input.tag)` guard would accept malformed tags; a regression dropping the unconditional `input.rights.push('task_type:internal')` would issue a token unusable by the internal-token auth path (or, if the guard is inverted, could omit a right every internal token is documented to carry). | `internalToken.spec.js` — VE-27378 row 9 | (PR pending — will be linked once opened this run) |
| 10 | implemented | medium | `internalToken.js:251-265 — requestInternalToken / :329-343 updateInternalToken label validation` | `validateLabel` (untested directly, unlike its sibling `validateTag` which has 4 spec cases) gates `input.label` on both the create and update paths; a regression here would accept an over-length or malformed label into `tokenLabel`. | `internalToken.spec.js` — VE-27378 row 10 | (PR pending — will be linked once opened this run) |
| 11 | implemented | medium | `internalToken.js:369-384 — getTokenState 4-way classification` | The `isRevoked`/`isPending` truth table (pending / revoked / active / updatePending) backs both `approveInternalToken`'s and `revokeInternalToken`'s guards. No test directly exercises all 4 combinations; a regression to the `else if`/return ordering would misclassify a token's state and silently change which admin actions are permitted on it. | `internalToken.spec.js` — VE-27378 row 11 | (PR pending — will be linked once opened this run) |
| 12 | pending | low | `internalToken.js:27-165 — getInternalToken (singular, get-by-id) and mapNewToken` | Ground-truthed 2026-09-08: `getInternalTokens` (list) — id obfuscation default/opt-out + pagination — is now covered (`internalToken.spec.js` "#getInternalTokens() id obfuscation", VE-27611 row 12), which also exercises the shared `mapTokenImpl` row-mapper. The narrower residual gap is `getInternalToken` (singular, fetch-by-single-id) itself, which has zero direct test — a regression here (e.g. dropped obfuscation, wrong NotFound behavior) would go undetected. | | |

### `scheduledEvent.js`

`getScheduledEvents`/`createScheduledEvent`/`updateScheduledEvent`/`deleteScheduledEvent` each have
one happy-path test in `scheduledEvent.spec.js` (both `#updateScheduledEvent()` blocks are
identical copy-paste happy-path cases — no error-path coverage anywhere in the file).

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 13 | implemented | medium | `scheduledEvent.js:130-146 — normalizeSchedule cron/date-fallback/throw branches` | Every existing test passes `'1 2 3 4 5 6'`, which parses as a valid cron expression, so only the first `try` branch is ever exercised. A regression breaking the date-string fallback (`asDate.isValid()`) or the final `InvalidInput` throw for genuinely unparseable input would go undetected. | `scheduledEvent.spec.js` — VE-27378 row 13 | (PR pending — will be linked once opened this run) |
| 14 | implemented | medium | `scheduledEvent.js:148-160 — validatePayload empty/valid/invalid-JSON branches` | Every existing test passes a valid JSON string. The `_.isEmpty(payload)` passthrough and the `JSON.parse` failure → `InvalidInput` throw are both untested; a regression here would let malformed payload reach the DB write, or reject legitimately empty payloads. | `scheduledEvent.spec.js` — "should allow an empty payload through without throwing InvalidInput" + "should throw InvalidInput when payload is not valid JSON" | VE-27611/#4632 |
| 15 | pending | low | `scheduledEvent.js:50-61 — updateScheduledEvent NotFound propagation` | Ground-truthed 2026-09-08: `getScheduledEvent` (direct) and `deleteScheduledEvent` NotFound propagation are now covered (`scheduledEvent.spec.js` "#getScheduledEvent() not-found propagation", VE-27611 row 15). The residual gap is `updateScheduledEvent`, which also calls `getScheduledEvent` first to surface NotFound on an unknown `id` but has no test exercising that path. | | |
