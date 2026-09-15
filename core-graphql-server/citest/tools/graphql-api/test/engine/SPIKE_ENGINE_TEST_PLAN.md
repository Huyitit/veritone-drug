# Engine Test Coverage — Findings & Improvement Plan

This document records the coverage audit performed against `test/engine/` (this directory) and
the schema's Engine/Build surface (`schema/schema.graphql`, types `Engine`, `Build`,
`EngineCategory`, `EngineClass`, `EngineDependency`, plus the `engines`/`engine`/`recentBuilds`/
`engineOverview`/`engineCategories`/`engineCategory` queries and `createEngine`/`updateEngine`/
`deleteEngine`/`createEngineBuild`/`updateEngineBuild`/`deleteEngineBuild`/`engineWorkflow`
mutations). It's meant to be read alongside the actual spec files — it doesn't restate what's
already obvious from the code, only what's covered, what's missing, and in what order to close
the gaps. Same format as `../tdo/TDO_TEST_COVERAGE_PLAN.md` and `../folder/FOLDER_TEST_COVERAGE_PLAN.md`.

## Current coverage — inventory

| File | Covers |
|---|---|
| `basicEngine.spec.ts` | Full engine lifecycle as a citest-owned org: create (transcription, invalid category/name), update (incl. `jwtRights` deny path), enable/disable, `isPublic` toggling, build create/deploy/invalidate/pause/unpause/approve/disapprove, `nodeRed` runtime builds, `taskRuntime` default-to-`{edge:{}}` behavior, engine templates, single-engine job launch (incl. `fields.clusterId` legacy form), `edgeVersion` mismatch rejection, input/output schema attach with `NotFound` cases, `getEngineJWT` superadmin-permission filtering, Hub-token engine/build creation and package auto-creation, and final teardown (delete builds/engine/cluster/package) |
| `orgAdmin/orgAdminBasicEngine.spec.ts` | Same lifecycle as `basicEngine.spec.ts` but run as an org-admin-scoped actor instead of citest superadmin — largely a parallel/duplicate suite over the same surface with a different auth context |
| `engineBuild.spec.ts` | Narrower "new build process" flow: create engine, create build with `dockerImage` on a private engine, deploy, `taskRuntime` null-vs-default-edge behavior, predefined build id |
| `orgAdmin/orgAdminEngineBuild.spec.ts` | Same "new build process" flow as `engineBuild.spec.ts`, org-admin-scoped |
| `basicEngineResult.spec.ts` | `engineResults` query smoke test: create TDO, create/verify engine result asset (incl. user-edited and "broken" malformed asset), one `it.skip` on `engineResults` itself, media-streamer download/streams endpoints against an engine result asset |
| `engineNotFound.spec.ts` | Regression check for a specific "engine not found after created" bug, plus duplicate-create handling |

**Headline observation**: coverage is deep but narrow — nearly every spec file re-walks the same
"create → build → deploy → enable" happy path (twice, once per auth context), while the read/query
surface (`engines` list filters, `engineCategories`, `engineOverview`, `EngineFilter`), the
`engineWorkflow` state machine's declared transitions, and negative/authorization paths are almost
entirely untested. `basicEngineResult.spec.ts` also has a live `it.skip` on the one test that
actually asserts `engineResults` return data.

## Gap analysis

Findings are grouped by priority. "Untested" below means: no assertion anywhere in `test/engine/`
exercises this — confirmed by grepping the spec files for the field/argument/enum-value name, not
just skimming test titles.

### P0 — authorization / negative paths (almost no coverage today)

- No test reads, updates, or deletes an **engine owned by another organization** and asserts
  denial — `isPublic: false` (the default) engines should be invisible/unmodifiable cross-org, but
  nothing in `test/engine/` proves it. `orgAdmin/orgAdminBasicEngine.spec.ts` runs as a *different*
  auth context but always against engines that context itself created.
- No test uses a token lacking `developer.engine.create` / `developer.engine.update` /
  `developer.engine.delete` / `developer.build.create` / `developer.build.update` /
  `developer.build.delete` and asserts the `@scopes` directive actually denies the mutation — every
  existing spec runs with a fully-privileged token.
- `updateEngine`/`deleteEngine`/`createEngineBuild`/etc. against a **nonexistent** `id` — behavior
  (null vs. `NotFound` error) is untested for the engine itself (schema-attach cases in
  `basicEngine.spec.ts:1005/1028/1070/1089` cover `NotFound` only for `schemaId`, not for the
  engine/build id arguments).
- `engineWorkflow` transitions attempted **out of order** (e.g. `deploy` from `draft` without
  passing through `ready`, or any action once `state: deleted`) are never asserted to be rejected —
  only the "happy path forward" transitions are exercised, and only implicitly via
  `updateEngine`/build actions, never via the `engineWorkflow` mutation directly with an explicit
  `EngineWorkflowAction` value.
- `basicEngineResult.spec.ts:155` — `it.skip('get engine results', ...)` is the one test that reads
  back `engineResults` data; it's currently disabled, so the read path is unverified in CI.

### P1 — untested query filters on `engines`

`EngineFilter` and the `engines`/`engine` query arguments are declared in schema but not
exercised by any spec:

- `filter.name` + `filter.nameMatch` (`startsWith`/`exact`/etc.), and the deprecated
  `filter.exactName` fallback behavior
- `filter.state` (list of `EngineState`) as a *query* filter — state values are only ever asserted
  as the *result* of a mutation, never used to filter a list
- `filter.category` (by name) vs. the top-level `categoryId` argument — both exist, neither is
  tested for correctness or precedence
- `filter.libraryRequired`, `filter.isPublic`, `filter.isCertified`, `filter.deploymentModel(s)`,
  `filter.distributionTypes`, `filter.mode`, `filter.priceMin`/`priceMax`,
  `filter.supportedInputFormats`, `filter.manifestRuntime`
- `filter.dateTimeFilter`, `filter.entityTags` + `filter.entityTagOperation` (AND/OR)
- `filter.engineTemplateInputTypes` (`matchAny` true/false semantics)
- Top-level `engines(ownedByOrg:, requiresLibrary:, createsTdo:, name:, categoryId:, categoryName:,
  state:, orderBy:)` arguments — none are covered; only `engines(limit:2)` and `engine(id:)` by
  direct id are used anywhere, both as setup/lookup helpers rather than as the thing under test
- Ordinary pagination correctness (`count` vs. `records.length`, page 2 vs. page 1 overlap) is
  never checked for `engines`

### P1 — untested query surface beyond `engines`/`engine`

- `engineCategories` / `engineCategory` — used only indirectly (`"get transcription category id"`
  helper steps in every spec file); none of `engineCategories`' own arguments (`ids`, `type`,
  `orderBy`) or `EngineCategory`'s fields are asserted as the test target
- `engineOverview` — declared in schema, zero references in `test/engine/`
- `recentBuilds` (referenced in `EngineBuildOrderBy`/`BuildStatus` context) and `libraryEngineModel`
  — not exercised from this directory
- `getEngineJWT` is covered for the superadmin-permission-filtering case
  (`basicEngine.spec.ts:1122`) but not for a normal non-superadmin token's rights shape

### P1 — untested nested fields on `Engine`

- `dependency` (`EngineDependency`) — schema notes the create/update input paths are currently
  disabled server-side, but the **read** field itself is never queried
- `taskMetrics(fromDateTime, toDateTime)` — untested, including the documented 7-day max range
  constraint
- `standaloneJobTemplates(type:)` and the `createEngineJobTemplate`-shaped input — untested
- `validStateActions` — never asserted against the engine's current `state`, even though several
  specs manually walk state transitions where this would catch drift
- `entityTags` read-back after `createEngine`/`updateEngine` with `entityTags` input — input is
  accepted by both mutations but never round-tripped through a query
- `preferredInputFormat` / `supportedInputFormats` / `outputFormats` / `supportedSourceTypes` /
  `hasScanPhase` / `deployedVersion` — all documented as "populated once a build is deployed", and
  every spec *does* deploy a build, but none of these fields are queried afterward
- `signedIconPath` / `signedLogoPath` — untested despite `iconPath`/`logoPath` being set on create
- `cpuResourceMcpu`, `gpuSupported`, `gpuRequired`, `gpuModel`, `gpuDriverVersion`,
  `kernelVersion`, `distributionType` — accepted on `CreateEngine`/`UpdateEngine` input but never
  read back
- `manifest`, `testingDetails`, `useCases`, `industries`, `website` — same pattern: accepted on
  input, never asserted on read

### P2 — structural / suite-hygiene

- `basicEngine.spec.ts` and `orgAdmin/orgAdminBasicEngine.spec.ts` are near-duplicates of the same
  ~1,450/~1,000 line lifecycle walk; likewise `engineBuild.spec.ts` and
  `orgAdmin/orgAdminEngineBuild.spec.ts`. Any new coverage added to one side tends to silently drift
  from the other. Worth flagging for a follow-up dedup (e.g. a shared parametrized helper run under
  both auth contexts) rather than continuing to hand-maintain two copies — out of scope for this
  plan's proposed additions, but called out since new P0/P1 files below would otherwise become a
  third near-duplicate if not designed against this.
- `engineNotFound.spec.ts` is a regression test for one historical bug; fine as-is, just noting it's
  not a general-purpose home for new "not found" cases (those belong in the new authorization spec
  below, scoped to the current schema surface, not the historical repro).

## Cross-service context (repo-wide scan)

This plan's scope is the `core-graphql-server` citest suite, but "Engine" isn't owned end-to-end
by this service — several other services in the monorepo implement or observe part of the engine
lifecycle. Scanned repo-wide (`grep -ril engine` per service) to make sure the gaps above are
actually gaps in *this* service's contract, not things already covered elsewhere under a different
name:

| Service | Role in the Engine lifecycle | Existing test coverage |
|---|---|---|
| `services/eventing/core-eventing-service` | Owns the **other half of `engineWorkflow`**: `handler/engine-topic/event-handlers.ts` (`engineBuildDeploySuccess`) consumes the build-deploy-success event, calls back into this service's GraphQL API (`ctx.gql.getEngineBuild`) to read the manifest, then drives `updateBuildState('deployed')` / `updateEngineState('active')` and the default `taskRuntime: {edge:{}}` fallback directly in Postgres. This is the actual mechanism behind the `"engine state should be in 'active' state"` assertions in `basicEngine.spec.ts`/`engineBuild.spec.ts` — those specs only observe the *result* through the GraphQL read path, they never see this transition happen. `handler/engineOutput/` separately turns cognitive engine task results into exported files (docx/srt/ttml/txt/vtt/vlf) — downstream of `engineResults`, not the same surface. | Well covered on its own side: `test/handlers/engine-topic/*.spec.ts` (269 + 40 lines) and `test/handlers/engineOutput/*.spec.*` (187 + 485 + 1,903 lines) |
| `services/api/core-search-server` | Aggregates engine usage for recording search (`recording.search.js`: `engineTypeAggregation()`, `processEngineData()` — minutes-processed-per-engine buckets). Separate query surface (search API, not GraphQL `engines`/`engineOverview`), consumed for reporting/aggregation dashboards, not engine CRUD. | Own unit specs (`test/recording.search.spec.js`, `test/aggregation-helper.spec.js`) |
| `services/api/core-admin-server` | `route/engine-usage.js` — `GET /api/admin/engine-usage`, explicitly marked `@deprecated`/`// TODO: remove` and currently hardcoded to return `{totalDuration: 0, totalCost: 0}`. Not a real data path today. | `test/route.engine-usage.spec.js` (asserts the stub response) |

**Conclusion**: none of this changes the gap analysis above — the GraphQL API's own query/mutation
surface (`EngineFilter`, `engineWorkflow` transitions, authorization) is still untested from the
citest side regardless of what the eventing service verifies internally. The one thing worth
carrying forward: any new `engineWorkflow`/build-deploy spec added under item 3 below should treat
`core-eventing-service`'s `engineBuildDeploySuccess` handler as the reason state transitions can
have async, eventually-consistent latency (it's driven by a queued message, not a synchronous side
effect of the mutation) — tests asserting post-deploy state should poll/retry rather than assume
immediate consistency, consistent with how the existing specs already wait after `updateEngineBuild`
deploy actions.

## Proposed plan

| # | File | Priority | Scope |
|---|---|---|---|
| 1 | Un-skip `basicEngineResult.spec.ts:155` (`'get engine results'`) | P0 | Restore the disabled assertion on `engineResults` read data, or replace it if it's disabled because the shape genuinely changed — either way, close the gap rather than leave it skipped |
| 2 | New: `test/engine/engineAuthorization.spec.ts` | P0 | Cross-org read/update/delete denial matrix for engines and builds (`isPublic: false` isolation, both directions once `isPublic: true`); scope-denial matrix for `createEngine`/`updateEngine`/`deleteEngine`/`createEngineBuild`/`updateEngineBuild`/`deleteEngineBuild` against a token missing the relevant `developer.engine.*`/`developer.build.*` scope; nonexistent-id behavior for `engine`, `updateEngine`, `deleteEngine`, `createEngineBuild`/`updateEngineBuild`/`deleteEngineBuild` |
| 3 | New: `test/engine/engineWorkflow.spec.ts` | P0 | Drive `engineWorkflow`'s only two real actions (`enable`/`disable`) directly, asserting rejection when invalid for the current state; cross-check the separate read-only `validStateActions` enum against state at each step, including after delete (via `deleteEngine`, not `engineWorkflow` — see note below) and after deploy (via `updateEngineBuild`, eventually consistent per the eventing dependency above) |
| 4 | New: `test/engine/engineQueryFilters.spec.ts` | P1 | One `describe` per `EngineFilter` field (`name`/`nameMatch`, `state`, `category`/`categoryId` precedence, `libraryRequired`, `isPublic`, `isCertified`, `deploymentModel(s)`, `distributionTypes`, `mode`, `priceMin`/`priceMax`, `supportedInputFormats`, `manifestRuntime`, `dateTimeFilter`, `entityTags`+`entityTagOperation`, `engineTemplateInputTypes.matchAny`) plus top-level `engines(...)` arguments (`ownedByOrg`, `requiresLibrary`, `createsTdo`), each seeding 2–3 distinguishable engines; plus ordinary pagination correctness |
| 5 | New: `test/engine/engineFields.spec.ts` | P1 | Nested-field read-back coverage after a full create→build→deploy cycle: `dependency`, `taskMetrics` (incl. 7-day range constraint), `standaloneJobTemplates`, `entityTags`, `signedIconPath`/`signedLogoPath`, `preferredInputFormat`/`supportedInputFormats`/`outputFormats`/`supportedSourceTypes`/`hasScanPhase`/`deployedVersion`, `cpuResourceMcpu`/`gpu*`/`kernelVersion`/`distributionType`, `manifest`/`testingDetails`/`useCases`/`industries`/`website` |
| 6 | New: `test/engine/engineCategoryAndOverview.spec.ts` | P1 | `engineCategories`/`engineCategory` as the test target (not a setup helper): `ids`, `type`, `orderBy` args, `EngineCategory` fields; `engineOverview`; `getEngineJWT` rights shape for a normal (non-superadmin) token |
| 7 | Follow-up (not scoped here) | P2 | Dedup `basicEngine.spec.ts` / `orgAdmin/orgAdminBasicEngine.spec.ts` and `engineBuild.spec.ts` / `orgAdmin/orgAdminEngineBuild.spec.ts` into a shared parametrized lifecycle helper run under both auth contexts |

**Suggested order**: 1 → 2 → 3 first — cheapest fix plus the two highest-signal gaps (authorization
correctness and the state-machine's actual guarantees). 4 → 5 → 6 close out the declared-but-untested
read surface and are independent of each other. 7 is cleanup, not new coverage — pick up only once
the new files above establish where shared lifecycle setup should live, so it isn't designed twice.

## Detailed test cases & test flow (per proposed file)

Item 1 (un-skip `basicEngineResult.spec.ts:155`) and item 7 (dedup follow-up) aren't new spec
files, so they're not broken out below — item 1 is a one-line fix (re-enable, fix the assertion
if the shape drifted), item 7 is a refactor with no new assertions. Items 2–6 below.

### Roles / actors used in this plan

Every "Role" cell below resolves to one of these four concrete actors — no case uses a generic
"admin" or an org-admin role. Mint once per suite (see each file's "Suite-level setup"), reuse
across that file's cases:

| Actor | How it's minted | Effective permissions | Used in |
|---|---|---|---|
| **Org A actor** | `createIsolatedSuperadmin` (bootstrap) + `setupTestOrgAndUser`, creating one isolated test org and one user in it with `roleIds: ['912e377e-f4a4-4184-8db1-baa9670d8081']` (**Developer Editor** role) | Full `developer.engine.*`/`developer.build.*` scopes, scoped to its own org | Primary actor in all 5 new spec files |
| **Org B actor** | Identical pattern to Org A, in a **second**, separate isolated org | Same Developer Editor scopes as Org A, but a different org — proves cross-org isolation, not a privilege-level difference | `engineAuthorization.spec.ts` (ENTC1–7), `engineQueryFilters.spec.ts` (ENTC19) |
| **Org A restricted API token** | `POST {core_admin_url}/admin/tokens` (the `createToken` helper pattern from `auth/token.spec.ts`) with `json.rights` set to the full `developer.engine.*`/`developer.build.*` list **minus one scope under test** — a real, deliberately-incomplete API token, not a role-based user | Everything Org A actor has, except the one omitted scope | `engineAuthorization.spec.ts` only (ENTC8–13) |
| **Shared citest superadmin** (pre-existing, not newly minted) | The existing shared session (`sys_graphql_citest_superadmin@veritone.com`) already used by `basicEngine.spec.ts:1122` | Full instance-wide superadmin rights, `jwtRights` filtered accordingly | Referenced only as the contrast baseline in `engineCategoryAndOverview.spec.ts` ENTC8 — that case itself runs as the Org A actor, specifically to show the non-superadmin shape differs |

Explicitly **not used**: an org-admin role (`Admin`, roleId `ddca9b68-d775-4934-8ffd-7aecc779b652`)
— that's a separate application-admin concept, not a `developer.*` functional-permissions role, and
none of the `Engine`/`Build` mutations gate on it.

Each of the five new spec files mints its own Org A / Org B / restricted-token actors from scratch in
its own suite-level setup — nothing here is shared or reused across files.

### 2. `engineAuthorization.spec.ts` (P0)

**Suite-level setup** (once, before any case below):

- Resolve a transcription `categoryId`.
- **Org A actor**: via `createIsolatedSuperadmin` + `setupTestOrgAndUser`, create an isolated org
  and one user in it with roleIds `['912e377e-f4a4-4184-8db1-baa9670d8081']` (**Developer Editor**
  — the standard developer-scoped role used by the existing RBAC-style specs in this repo, e.g.
  `orgAdminPackage.spec.ts`). This is the primary actor for all "Org A" rows below.
- **Org B actor**: the same pattern — a second, separate isolated org with its own Developer
  Editor user. Same privilege tier as Org A, different org — this isolates *cross-org* denial
  specifically, not a role-level difference. (Not the `Admin`/org-admin role — that's a different
  concern, see the RBAC-permission cases below.)
- As Org A: `createEngine` a private engine `E1` (`isPublic: false`) and `createEngineBuild` a
  build `B1` for it; separately `createEngine` a second engine `E2` reserved for the scope-denial
  cases below.
- **Scope-restricted tokens** (for ENTC8–13 only): mint one API token per case via
  `POST {core_admin_url}/admin/tokens` (the `createToken` helper pattern from
  `auth/token.spec.ts`), each with `json.rights` set to the full list of `developer.engine.*`/
  `developer.build.*` rights **minus the one scope under test**. These are real, explicitly-scoped
  API tokens — not a role-based user and not a garbage/invalid token — because `@scopes` enforces
  API-token permissions from the rights provisioned directly on the token (per
  `resolvers/util.js`'s `NotAllowed` message), separately from user-role-derived permissions.
- Teardown at suite end: delete `B1`, `E1`, `E2`, and any engines created in ENTC8's case, as Org
  A; revoke the scope-restricted tokens; tear down both isolated orgs via
  `IsolatedSuperadmin.cleanup()`.

**Test cases**

| ID | Role | Precondition | Steps | Expected |
|---|---|---|---|---|
| ENTC1 | Org B actor (Developer Editor, own org) | `E1` exists, owned by Org A, `isPublic: false` | Query `engine(id: E1)` | `null` or an authorization error — not the engine's data |
| ENTC2 | Org B actor | Same as ENTC1 | Call `updateEngine(input:{id:E1, name:"x"})` | Denied |
| ENTC3 | Org B actor | Same as ENTC1 | Call `deleteEngine(id:E1)` | Denied |
| ENTC4 | Org B actor | Same as ENTC1 | Call `createEngineBuild(input:{engineId:E1,...})` | Denied |
| ENTC5 | Org B actor | `B1` exists on `E1`, owned by Org A | Call `updateEngineBuild(input:{id:B1,...})` then `deleteEngineBuild(input:{id:B1,engineId:E1})` | Both denied |
| ENTC6 | Org A actor, then Org B actor | `E1` exists (private) | As Org A: `updateEngine(input:{id:E1, isPublic:true})`. As Org B: query `engine(id:E1)` and `engines(filter:{name:"E1's name"})` | Both succeed for Org B (read only) |
| ENTC7 | Org B actor | `E1` is now `isPublic:true` (post-ENTC6) | Call `updateEngine`/`deleteEngine`/`createEngineBuild` on `E1` | All denied — public grants read, not write |
| ENTC8 | Org A — API token with `rights` explicitly excluding `developer.engine.create` | `categoryId` resolved | Call `createEngine(input:{categoryId,...})` using that token | Rejected with a scope/authorization error |
| ENTC9 | Org A — API token with `rights` excluding `developer.engine.update` | `E2` exists (created by the Org A user actor) | Call `updateEngine(input:{id:E2,...})` using that token | Rejected |
| ENTC10 | Org A — API token with `rights` excluding `developer.engine.delete` | `E2` exists | Call `deleteEngine(id:E2)` using that token | Rejected |
| ENTC11 | Org A — API token with `rights` excluding `developer.build.create` | `E2` exists | Call `createEngineBuild(input:{engineId:E2,...})` using that token | Rejected |
| ENTC12 | Org A — API token with `rights` excluding `developer.build.update` | `E2` has a build `B2` (created by the Org A user actor) | Call `updateEngineBuild(input:{id:B2,...})` using that token | Rejected |
| ENTC13 | Org A — API token with `rights` excluding `developer.build.delete` | `E2` has build `B2` | Call `deleteEngineBuild(input:{id:B2, engineId:E2})` using that token | Rejected |
| ENTC14 | Org A actor | None | Query `engine(id: <random nonexistent uuid>)` | Returns `null` (confirm actual contract, don't assume) |
| ENTC15 | Org A actor | None | Call `updateEngine(input:{id:<nonexistent>,...})` | `NotFound`-shaped error |
| ENTC16 | Org A actor | None | Call `deleteEngine(id:<nonexistent>)` | `NotFound` error, or confirm idempotent-success if that's the real contract |
| ENTC17 | Org A actor | None | Call `createEngineBuild(input:{engineId:<nonexistent>,...})` | `NotFound` error |
| ENTC18 | Org A actor | None | Call `updateEngineBuild(input:{id:<nonexistent>,...})` then `deleteEngineBuild(input:{id:<nonexistent>,engineId:E2})` | Both `NotFound` errors |

### 3. `engineWorkflow.spec.ts` (P0)

**Important schema correction** (caught during review of an earlier draft of this plan): `engineWorkflow`
and `validStateActions` are **not** the same enum, and only one of them is actually callable.

- `engineWorkflow(input:{id, action})` accepts **only `EngineWorkflowAction`: `enable` | `disable`**
  (`schema.graphql:17754`). That's the entire mutation surface.
- `validStateActions` (read-only, on `Engine`) returns `EngineStateAction` values — `edit` | `delete` |
  `disable` | `enable` | `undelete` (`schema.graphql:17300`) — describing what's *conceptually* allowed
  from the current state, not arguments you can pass back into `engineWorkflow`. `edit` maps to
  `updateEngine`, `delete` maps to the `deleteEngine` mutation, and **`undelete` has no mutation anywhere
  in the schema that implements it** (grepped `schema.graphql` for `undelete`; it only ever appears as an
  enum value). Treat `undelete` as an open question for the API owners, not a transition this suite can
  drive — see ENTC9.

So this suite tests three distinct things, not one enum walked end to end: (a) `engineWorkflow`
enable/disable enforcement, (b) `validStateActions` read-back tracking real state, (c) `deleteEngine` as
the actual terminal transition.

**Suite-level setup**: Org A actor (Developer Editor role, isolated org — same pattern as
`engineAuthorization.spec.ts`'s Org A setup, minted fresh for this file) resolves `categoryId`, then
`createEngine` (lands in `draft`) to get engine `E`. Cases progress `E` through real states in order:
ENTC1–3 (`draft`) → ENTC4–7 (build/deploy/`active`/`disable`) → ENTC8–9 (delete, destructive — run last).
Teardown: delete any leftover builds/`E` not already removed by the workflow itself.

**Test cases**

| ID | Role | Precondition | Steps | Expected |
|---|---|---|---|---|
| ENTC1 | Org A | `E` in `draft` | `engineWorkflow(action:enable)` | Rejected — `enable` isn't in `draft`'s `validStateActions` |
| ENTC2 | Org A | `E` in `draft` | `engineWorkflow(action:disable)` | Rejected |
| ENTC3 | Org A | `E` in `draft` | Query `validStateActions` | Includes `edit`/`delete`, excludes `enable`/`disable` |
| ENTC4 | Org A | `E` in `draft`; `createEngineBuild` build `B`, then `updateEngineBuild(action:deploy)` | Poll `engine(id:E){state}` (bounded timeout) | Eventually `active`; must **not** be `active` immediately after deploy returns (async, per eventing dependency) |
| ENTC5 | Org A | `E` confirmed `active` (post-ENTC4) | Query `validStateActions` | Includes `disable`/`edit`/`delete`, excludes `enable` |
| ENTC6 | Org A | `E` is `active` | `engineWorkflow(action:enable)` | Rejected — confirm actual contract (already-active re-enable may be rejected or idempotent; don't assume) |
| ENTC7 | Org A | `engineWorkflow(action:disable)` on `E`, wait for `state:disabled` | Query `validStateActions` | Includes `enable`/`edit`/`delete` |
| ENTC8 | Org A | `E` (or fresh `E2`) in any non-`deleted` state | `deleteEngine(id)` | Succeeds; `state` becomes `deleted` and/or engine becomes unreadable — confirm actual post-delete read contract |
| ENTC9 | Org A | Engine in `state:deleted` (post-ENTC8) | Query `validStateActions` | Confirms whatever the API actually returns for a deleted engine (`undelete` may still appear in the list even with no mutation to invoke it) — this case documents the gap, it does not assert recovery is possible |

### 4. `engineQueryFilters.spec.ts` (P1)

**Suite-level setup** (Org A actor — Developer Editor role, isolated org, run once): resolve `categoryId`.
Seed 5 uniquely-named engines under the citest org, name-prefixed `citest-filter-` so every query
below can scope to that prefix and ignore unrelated engines:

| Seed | name | isPublic | deploymentModel | price | mode | manifest.runtime | libraryRequired | createsTDO | entityTags | state / build |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | `citest-filter-alpha` | true | FullyNetworkIsolated | 10 | Batch | default | true | true | `{env:prod}` | deployed → `active` (also gives `supportedInputFormats` data) |
| S2 | `citest-filter-alpha-2` | false | PartiallyNetworkIsolated | 50 | Stream | default | false | false | `{env:stage}` | `draft` |
| S3 | `citest-filter-beta` | false | FullyNetworkIsolated | 100 | Batch | `nodeRed` | false | false | `{env:prod}` | `draft` |
| S4 | `citest-filter-gamma-1` | false | FullyNetworkIsolated | 5 | Batch | default | false | false | none | `draft` (pagination filler) |
| S5 | `citest-filter-gamma-2` | false | FullyNetworkIsolated | 5 | Batch | default | false | false | none | `draft` (pagination filler) |

Teardown: delete S1's build, then all 5 seeded engines, as Org A.

**Test cases**

| ID | Role | Precondition | Steps | Expected |
|---|---|---|---|---|
| ENTC1 | Org A | Seed set exists | Query `engines(filter:{name:"citest-filter-alpha", nameMatch:startsWith})` | Returns S1 and S2 only |
| ENTC2 | Org A | Seed set exists | Query `engines(filter:{name:"citest-filter-alpha", nameMatch:exact})` | Returns S1 only |
| ENTC3 | Org A | Seed set exists | Query `engines(filter:{exactName:"citest-filter-beta"})` (no `filter.name`) | Returns S3 only — deprecated fallback still works |
| ENTC4 | Org A | S1 deployed to `active` (post-suite-setup) | Query `engines(filter:{name:"citest-filter", nameMatch:startsWith, state:[active]})` | Returns S1 only, excludes S2–S5 (`draft`) |
| ENTC5 | Org A | S1's `categoryId` known | Query `engines(categoryId: <otherCatId>, filter:{category:["<S1's category name>"]})` with deliberately mismatched values | Document actual precedence (which one wins) — no assumption |
| ENTC6 | Org A | Seed set exists | Query `engines(filter:{name:"citest-filter", nameMatch:startsWith, libraryRequired:true})`, then `...libraryRequired:false` | First returns S1 only; second returns S2–S5 |
| ENTC7 | Org A | Seed set exists | Query with `filter.isPublic:true`, then `filter.isPublic:false` (both scoped by name prefix) | First returns S1 only; second returns S2–S5 |
| ENTC8 | Org A | At least one seed marked certified via `testingDetails`/`isCertified`-eligible path | Query `engines(filter:{isCertified:true})` scoped by prefix | Only the certified seed(s) returned |
| ENTC9 | Org A | Seed set exists | Query `filter.deploymentModel: FullyNetworkIsolated`, then `filter.deploymentModels:[FullyNetworkIsolated, PartiallyNetworkIsolated]` | First returns S1,S3,S4,S5; second returns all 5 |
| ENTC10 | Org A | Seed set has varied `distributionType` (extend seed table if needed) | Query `filter.distributionTypes:[<value>]` | Only matching-distribution seeds returned |
| ENTC11 | Org A | Seed set exists | Query `filter.mode:[Batch]` | Returns S1, S3, S4, S5 (excludes S2 `Stream`) |
| ENTC12 | Org A | Seed set exists | Query `filter.priceMin:10, filter.priceMax:50` | Returns S1 (10) and S2 (50); excludes S3 (100), S4/S5 (5) |
| ENTC13 | Org A | S1 deployed with a build exposing a known input format | Query `filter.supportedInputFormats:["<format>"]` | Only S1 returned |
| ENTC14 | Org A | Seed set exists | Query `filter.manifestRuntime:["nodeRed"]` | Returns S3 only |
| ENTC15 | Org A | Seed set exists, creation timestamps known | Query `filter.dateTimeFilter` with a window excluding S4/S5's creation time | S4/S5 excluded from result |
| ENTC16 | Org A | Seed set exists | Query `filter.entityTags:[{tagKey:"env",tagValue:"prod"}], entityTagOperation: AND` (single tag) then extend to 2 required tags none of the seeds satisfy together | Single-tag case returns S1 & S3; two-tag AND case returns empty |
| ENTC17 | Org A | Seed set exists | Query `filter.entityTags:[{tagKey:"env",tagValue:"prod"},{tagKey:"env",tagValue:"stage"}], entityTagOperation: OR` | Returns S1, S2, S3 |
| ENTC18 | Org A | S1 has a single-engine job template with known `supportedInputTypes` | Query `filter.engineTemplateInputTypes:{types:[...], matchAny:true}` then `matchAny:false` with a mixed type list | `matchAny:true` returns S1 for any overlapping type; `matchAny:false` only if S1 supports all listed types |
| ENTC19 | Org A actor, then Org B actor | S1 is `isPublic:true`; Org B has its own unrelated public engine | Org A queries `engines(ownedByOrg:true, filter:{name:"citest-filter",nameMatch:startsWith})` | Returns only citest-org-owned seeds, excludes Org B's public engine even though it'd otherwise be visible |
| ENTC20 | Org A | Seed set exists | Query `engines(requiresLibrary:true, filter:{name:"citest-filter",nameMatch:startsWith})` | Returns the same set as ENTC6's `libraryRequired:true` case (S1 only) — confirms no divergence |
| ENTC21 | Org A | Seed set exists | Query `engines(createsTdo:true, filter:{name:"citest-filter",nameMatch:startsWith})` | Returns S1 only |
| ENTC22 | Org A | Seed set exists (5 engines) | Query `engines(filter:{name:"citest-filter",nameMatch:startsWith}, limit:2)` and walk all pages via `offset` | 3 pages total, `count` = 5, no id appears twice, no id missing |

### 5. `engineFields.spec.ts` (P1)

**Suite-level setup** (Org A actor — Developer Editor role, isolated org): resolve `categoryId`, then
`createEngine` with `iconPath`, `logoPath`, `entityTags`, `cpuResourceMcpu`,
`gpuSupported`/`gpuRequired`/`gpuModel`/`gpuDriverVersion`, `kernelVersion`, `distributionType`,
`manifest`, `testingDetails`, `useCases`, `industries`, `website`, and `standaloneJobTemplates` all
populated on the input, yielding engine `E`. Run the "before deploy" cases (ENTC6) first, then
`createEngineBuild` + deploy `E` (reuse the deploy-and-wait pattern from `basicEngine.spec.ts`) for
the "after deploy" cases. Teardown: delete `E`'s build(s), then `E`.

**Test cases**

| ID | Role | Precondition | Steps | Expected |
|---|---|---|---|---|
| ENTC1 | Org A | `E` created with `iconPath`/`logoPath` set | Query `engine(id:E){signedIconPath, signedLogoPath}` | Resolve to signed URLs (or fall back to raw path per schema doc, if signing isn't applicable in citest env) |
| ENTC2 | Org A | `E` created with `entityTags:[{tagKey:"a",tagValue:"1"}]` | Query `engine(id:E){entityTags{tagKey tagValue}}` | Read-back matches exactly what was sent |
| ENTC3 | Org A | `E` exists with entityTags from ENTC2 | Call `updateEngine(input:{id:E, entityTags:[{tagKey:"b",tagValue:"2"}]})`, then re-query `entityTags` | Only the new tag(s) present — prior tags fully replaced |
| ENTC4 | Org A | `E` created with `cpuResourceMcpu`, `gpu*`, `kernelVersion`, `distributionType` set | Query `engine(id:E){cpuResourceMcpu gpuSupported gpuRequired gpuModel gpuDriverVersion kernelVersion distributionType}` | All values match create input |
| ENTC5 | Org A | `E` created with `manifest`, `testingDetails`, `useCases`, `industries`, `website` set | Query those fields on `engine(id:E)` | All values match create input |
| ENTC6 | Org A | `E` exists, **no build created/deployed yet** | Query `engine(id:E){preferredInputFormat supportedInputFormats outputFormats supportedSourceTypes hasScanPhase}` | Null/empty for all — per "cannot be populated without a deployed build" doc |
| ENTC7 | Org A | `E` has a build deployed (post-suite-setup step 2) | Re-query the same fields as ENTC6 | All populated, non-null |
| ENTC8 | Org A | `E` has build v1 deployed | Query `deployedVersion`, then create+deploy build v2, re-query `deployedVersion` | v1 case reflects v1; v2 case reflects v2 |
| ENTC9 | Org A | `E` has a deployed build with recorded task activity (or zero activity is acceptable) | Query `engine(id:E){taskMetrics(fromDateTime:"<3 days ago>", toDateTime:"<now>"){cancelledCount completedCount failedCount pendingCount queuedCount runningCount}}` | Returns `EngineTaskMetrics` with all counts ≥ 0 |
| ENTC10 | Org A | `E` exists | Query `taskMetrics(fromDateTime:"<10 days ago>", toDateTime:"<now>")` (>7-day range) | Rejected/validated per the documented max-range constraint |
| ENTC11 | Org A | `E` created with `standaloneJobTemplates` of both `type: Reprocess` and `type: Upload` | Query `standaloneJobTemplates(type: Reprocess)`, then `(type: Upload)` | Each call returns only templates of the requested type |
| ENTC12 | Org A | `E` exists (no dependency ever settable via API) | Query `engine(id:E){dependency{dependencyType assetType}}` | Returns `null`/default — schema notes the create/update path is currently server-disabled; this confirms the read side doesn't error |

### 6. `engineCategoryAndOverview.spec.ts` (P1)

**Suite-level setup**: Org A actor (Developer Editor role, isolated org). This suite is read-only against
existing/seeded categories — no engine/build teardown needed. Resolve at least 2 known category
ids up front (e.g. transcription + one other) for use as fixtures in the id-scoped cases.

**Test cases**

| ID | Role | Precondition | Steps | Expected |
|---|---|---|---|---|
| ENTC1 | Org A | Categories exist in the environment | Query `engineCategories(limit:2)` and walk pages via `offset` | `count` matches total, pages don't overlap |
| ENTC2 | Org A | Two known category ids resolved | Query `engineCategories(ids:[id1,id2])` | Returns exactly those two, in any order |
| ENTC3 | Org A | A category of a known `EngineType` exists | Query `engineCategories(type: <that type>)` | Only categories of the requested `EngineType` returned |
| ENTC4 | Org A | Multiple categories exist | Query `engineCategories(orderBy:[{field:...,direction:...}])` | Results sorted per the requested field/direction |
| ENTC5 | Org A | A known category id (e.g. transcription) | Query `engineCategory(id: <known>)` | Returns full `EngineCategory` shape (name, description, `EngineSearchConfiguration`, etc.) |
| ENTC6 | Org A | None | Query `engineCategory(id: <random nonexistent uuid>)` | `null` or `NotFound` — confirm actual contract |
| ENTC7 | Org A | None | Query `engineOverview{...}` | Returns the aggregate shape documented in the schema's inline example (counts by category/state) |
| ENTC8 | Org A actor (Developer Editor role, own session token — not an API token) | An engine `E` owned by Org A exists | Call `getEngineJWT(input:{...})` with the standard token | `jwtRights` includes the expected non-admin subset and excludes superadmin-only permissions — contrast case to `basicEngine.spec.ts:1122`'s existing test, which uses the shared citest superadmin session, not a Developer Editor org user |

## References

- Schema source of truth: `schema/schema.graphql` (`Engine`, `Build`, `CreateEngine`,
  `UpdateEngine`, `EngineFilter`, `EngineState`, `EngineWorkflow`, `EngineWorkflowAction`,
  `EngineStateAction`, `EngineCategory`, `EngineDependency`)
- Existing SDK query surface: `src/queries/extracted/` — check for existing generated engine/build
  operations before hand-writing raw GraphQL strings in the new spec files (per the `add-gql-sdk`/
  `apply-gql-sdk` conventions used elsewhere in this repo)
- Cross-service dependency: `services/eventing/core-eventing-service/src/handler/engine-topic/`
  (`engineBuildDeploySuccess`) drives the actual `active`/`deployed` state transition asynchronously
- Sibling coverage plans for format reference: `../tdo/TDO_TEST_COVERAGE_PLAN.md`,
  `../folder/FOLDER_TEST_COVERAGE_PLAN.md`
