# Engine Test Plan

Audit of `test/engine/` coverage against the Engine/Build GraphQL surface
(`schema/schema.graphql`), plus a plan for 5 new spec files to close the gaps.

## What's covered today

| File | Covers |
|---|---|
| `basicEngine.spec.ts` | Full lifecycle: create, update, enable/disable, builds (create/deploy/pause/approve/etc.), templates, single-engine job launch, schema attach, teardown |
| `orgAdmin/orgAdminBasicEngine.spec.ts` | Same as above, different auth context (near-duplicate) |
| `engineBuild.spec.ts` | Narrower build-only flow: create → build → deploy |
| `orgAdmin/orgAdminEngineBuild.spec.ts` | Same, different auth context (near-duplicate) |
| `basicEngineResult.spec.ts` | `engineResults` smoke test — the one real assertion is currently `it.skip`'d |
| `engineNotFound.spec.ts` | One historical bug regression |

**Bottom line**: every file re-walks the same happy path (twice). Read/query filters, the
workflow state machine, and authorization/negative paths are almost untested.

## Key gaps

| Gap | Why it matters | Priority |
|---|---|---|
| No cross-org denial test | Nothing proves a private engine is actually invisible to another org | P0 |
| No missing-scope test | Nothing proves `@scopes` actually blocks a token lacking `developer.engine.*`/`developer.build.*` rights | P0 |
| No nonexistent-id test | Unknown whether reads return `null` or writes throw `NotFound` | P0 |
| `engineResults` read assertion is skipped | The one test that reads real data is disabled | P0 |
| `engineWorkflow` transitions untested directly | Only exercised indirectly via other mutations; invalid transitions never asserted | P0 |
| `EngineFilter` (16 fields) untested | Declared in schema, never queried by any spec | P1 |
| `engineCategories`/`engineCategory`/`engineOverview` untested as targets | Only ever used as setup helpers | P1 |
| ~15 `Engine` fields never read back | e.g. `taskMetrics`, `entityTags`, `signedIconPath`, GPU/CPU fields, `manifest` — accepted on create, never queried after | P1 |
| Two pairs of near-duplicate spec files | `basicEngine`/`orgAdmin` and `engineBuild`/`orgAdmin` — drift risk | P2 |

Other services touch "Engine" too (`core-eventing-service` drives the real build→active state
transition async; `core-search-server` aggregates engine usage; `core-admin-server`'s usage route
is a dead stub) — none of that changes the gaps above, it's just confirmed not double-covered
elsewhere.

## Actors used below

| Actor | What it is | How to create | Used for |
|---|---|---|---|
| **Org A** | A user with the Developer Editor role, in its own isolated test org | 1. Bootstrap a throwaway superadmin (`createIsolatedSuperadmin`). 2. Use it to create a new org + one user in that org with role `Developer Editor` (`912e377e-f4a4-4184-8db1-baa9670d8081`) via `setupTestOrgAndUser`. 3. Log in as that user — this session is "Org A" for the rest of the suite. | Primary actor everywhere |
| **Org B** | Same role, a *second* isolated org | Same 3 steps as Org A, run a second time, so it lands in its own separate org | Proving cross-org isolation only |
| **Restricted token** | A real API token, minted with one scope deliberately left out | 1. Take Org A's full developer rights list (`developer.engine.create/update/delete`, `developer.build.create/update/delete`). 2. Remove the one scope under test. 3. `POST {core_admin_url}/admin/tokens` with the remaining rights as the token's `json.rights` — this returns a token scoped to everything except that one permission. | Proving scope enforcement only |

Not used anywhere: an org-admin role — engine/build mutations don't gate on it.

⚠ = expected behavior isn't confirmed from the schema/docs alone; the test should assert
whatever the real behavior turns out to be and flag it if surprising, not assume.

## Proposed new files

| # | File | Priority | What it covers |
|---|---|---|---|
| 1 | Un-skip `basicEngineResult.spec.ts:155` | P0 | Re-enable the disabled `engineResults` assertion |
| 2 | `engineAuthorization.spec.ts` | P0 | Cross-org denial + missing-scope denial + nonexistent-id behavior |
| 3 | `engineWorkflow.spec.ts` | P0 | `engineWorkflow` enable/disable + `validStateActions` correctness + delete |
| 4 | `engineQueryFilters.spec.ts` | P1 | Every `EngineFilter` field + pagination |
| 5 | `engineFields.spec.ts` | P1 | Read-back of every field accepted on create/update |
| 6 | `engineCategoryAndOverview.spec.ts` | P1 | `engineCategories`, `engineCategory`, `engineOverview`, non-admin JWT rights |

**Order**: 1 → 2 → 3 first (cheap fix + highest-signal gaps), then 4 → 5 → 6 (independent of
each other). Dedup follow-up (P2, not a new file) picked up later.

---

## Test cases

Every case starts as **Not Tested**. Priority follows the file's priority from the table above
(P0 for files 2–3, P1 for files 4–6).

### 2. `engineAuthorization.spec.ts` (P0)

Base setup for this file: Org A creates a private engine `E1` + build `B1`, and a second engine
`E2` for the scope-denial cases. Org B is a separate isolated org (same role as Org A).

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| ENTC1 | Another org can't read a private engine | P0 | Not Tested | `E1` exists, owned by Org A, `isPublic: false` | 1. As Org B, query `engine(id: E1)`. | Returns `null` or an authorization error |
| ENTC2 | Another org can't update a private engine | P0 | Not Tested | Same as ENTC1 | 1. As Org B, call `updateEngine` on `E1`. | Denied |
| ENTC3 | Another org can't delete a private engine | P0 | Not Tested | Same as ENTC1 | 1. As Org B, call `deleteEngine` on `E1`. | Denied |
| ENTC4 | Another org can't build a private engine | P0 | Not Tested | Same as ENTC1 | 1. As Org B, call `createEngineBuild` with `engineId: E1`. | Denied |
| ENTC5 | Another org can't update a private engine's build | P0 | Not Tested | `B1` exists on `E1`, owned by Org A | 1. As Org B, call `updateEngineBuild` on `B1`. | Denied |
| ENTC6 | Another org can't delete a private engine's build | P0 | Not Tested | `B1` exists on `E1`, owned by Org A | 1. As Org B, call `deleteEngineBuild` on `B1`. | Denied |
| ENTC7 | A public engine is readable cross-org | P0 | Not Tested | `E1` exists (private) | 1. As Org A, call `updateEngine(isPublic: true)` on `E1`.<br>2. As Org B, query `engine(id: E1)`. | Succeeds (read-only) |
| ENTC8 | A public engine still can't be updated by another org | P0 | Not Tested | `E1` is now public (post-ENTC7) | 1. As Org B, call `updateEngine` on `E1`. | Denied |
| ENTC9 | A public engine still can't be deleted by another org | P0 | Not Tested | `E1` is now public (post-ENTC7) | 1. As Org B, call `deleteEngine` on `E1`. | Denied |
| ENTC10 | A public engine still can't be built by another org | P0 | Not Tested | `E1` is now public (post-ENTC7) | 1. As Org B, call `createEngineBuild` on `E1`. | Denied |
| ENTC11 | A token missing `developer.engine.create` is denied `createEngine` | P0 | Not Tested | None | 1. Mint an Org A token missing `developer.engine.create`.<br>2. Call `createEngine` with that token. | Rejected |
| ENTC12 | A token missing `developer.engine.update` is denied `updateEngine` | P0 | Not Tested | `E2` exists | 1. Mint an Org A token missing `developer.engine.update`.<br>2. Call `updateEngine` on `E2` with that token. | Rejected |
| ENTC13 | A token missing `developer.engine.delete` is denied `deleteEngine` | P0 | Not Tested | `E2` exists | 1. Mint an Org A token missing `developer.engine.delete`.<br>2. Call `deleteEngine` on `E2` with that token. | Rejected |
| ENTC14 | A token missing `developer.build.create` is denied `createEngineBuild` | P0 | Not Tested | `E2` exists | 1. Mint an Org A token missing `developer.build.create`.<br>2. Call `createEngineBuild` on `E2` with that token. | Rejected |
| ENTC15 | A token missing `developer.build.update` is denied `updateEngineBuild` | P0 | Not Tested | `E2` has a build `B2` | 1. Mint an Org A token missing `developer.build.update`.<br>2. Call `updateEngineBuild` on `B2` with that token. | Rejected |
| ENTC16 | A token missing `developer.build.delete` is denied `deleteEngineBuild` | P0 | Not Tested | `E2` has a build `B2` | 1. Mint an Org A token missing `developer.build.delete`.<br>2. Call `deleteEngineBuild` on `B2` with that token. | Rejected |
| ENTC17 | Reading a nonexistent engine | P0 | Not Tested | None | 1. As Org A, query `engine(id: <random nonexistent id>)`. | Returns `null` ⚠ |
| ENTC18 | Updating a nonexistent engine | P0 | Not Tested | None | 1. As Org A, call `updateEngine` with a nonexistent id. | `NotFound` error ⚠ |
| ENTC19 | Deleting a nonexistent engine | P0 | Not Tested | None | 1. As Org A, call `deleteEngine` with a nonexistent id. | `NotFound` error ⚠ |
| ENTC20 | Creating a build on a nonexistent engine | P0 | Not Tested | None | 1. As Org A, call `createEngineBuild` with a nonexistent `engineId`. | `NotFound` error |
| ENTC21 | Updating a nonexistent build | P0 | Not Tested | None | 1. As Org A, call `updateEngineBuild` with a nonexistent build id. | `NotFound` error |
| ENTC22 | Deleting a nonexistent build | P0 | Not Tested | None | 1. As Org A, call `deleteEngineBuild` with a nonexistent build id. | `NotFound` error |

### 3. `engineWorkflow.spec.ts` (P0)

**Note**: `engineWorkflow` only accepts `enable`/`disable` — that's the whole mutation. The
separate, read-only `validStateActions` field lists `edit`/`delete`/`disable`/`enable`/`undelete`,
but `edit`→`updateEngine`, `delete`→`deleteEngine`, and **`undelete` has no mutation that
implements it anywhere in the schema** — flag this to the API owner rather than assume it works.

Base setup: Org A creates engine `E` (starts in `draft`). Cases progress it through real states in
order: draft → build+deploy → active → disable → delete (destructive, run last).

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| ENTC1 | Can't enable/disable a draft engine | P0 | Not Tested | `E` exists, `state: draft` | 1. Call `engineWorkflow(action: enable)` on `E`.<br>2. Call `engineWorkflow(action: disable)` on `E`. | Both rejected |
| ENTC2 | Draft engine's valid actions | P0 | Not Tested | `E` in `draft` | 1. Query `validStateActions` on `E`. | Returns `edit`, `delete` only |
| ENTC3 | Deploy eventually makes the engine active | P0 | Not Tested | `E` in `draft` | 1. Call `createEngineBuild` for `E`.<br>2. Call `updateEngineBuild(action: deploy)` on the new build.<br>3. Poll `engine(id: E){state}` on an interval, up to a bounded timeout. | Eventually becomes `active`; not `active` immediately after the deploy call returns ⚠ |
| ENTC4 | Active engine's valid actions | P0 | Not Tested | `E` confirmed `active` (post-ENTC3) | 1. Query `validStateActions` on `E`. | Returns `disable`, `edit`, `delete`; not `enable` |
| ENTC5 | Can't re-enable an already-active engine | P0 | Not Tested | `E` is `active` | 1. Call `engineWorkflow(action: enable)` on `E`. | Rejected or no-op ⚠ |
| ENTC6 | Disabled engine's valid actions | P0 | Not Tested | `E` is `active` | 1. Call `engineWorkflow(action: disable)` on `E`, wait for `state: disabled`.<br>2. Query `validStateActions` on `E`. | Returns `enable`, `edit`, `delete` |
| ENTC7 | Delete is the real terminal transition | P0 | Not Tested | `E` (or a fresh engine) not deleted | 1. Call `deleteEngine` on the engine. | Succeeds; `state` becomes `deleted` |
| ENTC8 | What a deleted engine's valid actions look like | P0 | Not Tested | Engine is `deleted` (post-ENTC7) | 1. Query `validStateActions` on the deleted engine. | Document whatever comes back — `undelete` may appear with no way to invoke it ⚠ |

### 4. `engineQueryFilters.spec.ts` (P1)

Base setup: seed 5 engines (`citest-filter-*`), all owned by Org A:

| Seed | name | isPublic | deploymentModel | price | mode | manifest.runtime | libraryRequired | createsTDO | entityTags | state / build |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | `citest-filter-alpha` | true | FullyNetworkIsolated | 10 | Batch | default | true | true | `{env:prod}` | deployed → `active` |
| S2 | `citest-filter-alpha-2` | false | PartiallyNetworkIsolated | 50 | Stream | default | false | false | `{env:stage}` | `draft` |
| S3 | `citest-filter-beta` | false | FullyNetworkIsolated | 100 | Batch | `nodeRed` | false | false | `{env:prod}` | `draft` |
| S4 | `citest-filter-gamma-1` | false | FullyNetworkIsolated | 5 | Batch | default | false | false | none | `draft` (pagination filler) |
| S5 | `citest-filter-gamma-2` | false | FullyNetworkIsolated | 5 | Batch | default | false | false | none | `draft` (pagination filler) |

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| ENTC1 | Name filter matches by prefix | P1 | Not Tested | Seed set exists | 1. Query `engines(filter:{name:"citest-filter-alpha", nameMatch:startsWith})`. | Returns S1 and S2 |
| ENTC2 | Name filter matches exactly | P1 | Not Tested | Seed set exists | 1. Query `engines(filter:{name:"citest-filter-alpha", nameMatch:exact})`. | Returns S1 only |
| ENTC3 | Deprecated `exactName` filter still works | P1 | Not Tested | Seed set exists | 1. Query `engines(filter:{exactName:"citest-filter-beta"})` with no `name` given. | Returns S3 only |
| ENTC4 | State filter returns only matching engines | P1 | Not Tested | S1 deployed to `active` | 1. Query `engines(filter:{state:[active]})`. | Returns S1 only |
| ENTC5 | Category filter vs. category id argument precedence | P1 | Not Tested | Seed set exists | 1. Query `engines(categoryId: <otherCatId>, filter:{category:["S1's category name"]})` with deliberately mismatched values. | Document which one wins — unspecified today ⚠ |
| ENTC6 | `libraryRequired` filter returns correct subset | P1 | Not Tested | Seed set exists | 1. Query `filter.libraryRequired:true`.<br>2. Query `filter.libraryRequired:false`. | Correct subset each way |
| ENTC7 | `isPublic` filter returns correct subset | P1 | Not Tested | Seed set exists | 1. Query `filter.isPublic:true`.<br>2. Query `filter.isPublic:false`. | Correct subset each way |
| ENTC8 | `isCertified` filter returns correct subset | P1 | Not Tested | At least one seed marked certified | 1. Query `filter.isCertified:true`. | Only the certified seed(s) returned |
| ENTC9 | Deployment model filter, single value form | P1 | Not Tested | Seed set exists | 1. Query `filter.deploymentModel: FullyNetworkIsolated`. | Returns S1, S3, S4, S5 |
| ENTC10 | Deployment model filter, list form | P1 | Not Tested | Seed set exists | 1. Query `filter.deploymentModels:[FullyNetworkIsolated, PartiallyNetworkIsolated]`. | Returns all 5 seeds |
| ENTC11 | Distribution type filter | P1 | Not Tested | Seed set has varied `distributionType` | 1. Query `filter.distributionTypes:[<value>]`. | Only matching-distribution seeds returned |
| ENTC12 | Mode filter | P1 | Not Tested | Seed set exists | 1. Query `filter.mode:[Batch]`. | Returns S1, S3, S4, S5 (excludes S2) |
| ENTC13 | Price range filter | P1 | Not Tested | Seed set exists | 1. Query `filter.priceMin:10, filter.priceMax:50`. | Returns S1 and S2 only |
| ENTC14 | Input format filter needs a deployed build | P1 | Not Tested | S1 deployed with a build exposing a known input format | 1. Query `filter.supportedInputFormats:["<format>"]`. | Returns S1 only |
| ENTC15 | Runtime filter | P1 | Not Tested | Seed set exists | 1. Query `filter.manifestRuntime:["nodeRed"]`. | Returns S3 only |
| ENTC16 | Date filter excludes engines outside the window | P1 | Not Tested | Seed set exists, creation timestamps known | 1. Query `filter.dateTimeFilter` with a window excluding S4/S5's creation time. | S4/S5 excluded |
| ENTC17 | Tag filter, single tag AND | P1 | Not Tested | Seed set exists | 1. Query `entityTags:[{tagKey:"env",tagValue:"prod"}], entityTagOperation: AND`. | Returns S1 and S3 |
| ENTC18 | Tag filter, two tags AND | P1 | Not Tested | Seed set exists | 1. Query `entityTags` with two required tags that no single seed satisfies together, `entityTagOperation: AND`. | Returns empty |
| ENTC19 | Tag filter, two tags OR | P1 | Not Tested | Seed set exists | 1. Query `entityTags:[{tagKey:"env",tagValue:"prod"},{tagKey:"env",tagValue:"stage"}], entityTagOperation: OR`. | Returns S1, S2, S3 |
| ENTC20 | Template input-type filter, `matchAny: true` | P1 | Not Tested | S1 has a single-engine job template with known `supportedInputTypes` | 1. Query `engineTemplateInputTypes:{types:[...], matchAny:true}` with a mixed type list. | Returns S1 for any overlapping type |
| ENTC21 | Template input-type filter, `matchAny: false` | P1 | Not Tested | S1 has a single-engine job template with known `supportedInputTypes` | 1. Query `engineTemplateInputTypes:{types:[...], matchAny:false}` with the same mixed type list. | Returns S1 only if it supports all listed types |
| ENTC22 | Org-owned filter excludes other orgs' engines | P1 | Not Tested | S1 is public; Org B has its own unrelated public engine | 1. As Org A, query `engines(ownedByOrg:true, filter:{name:"citest-filter", nameMatch:startsWith})`. | Returns only Org A's seeds, excludes Org B's engine |
| ENTC23 | `requiresLibrary` argument agrees with `libraryRequired` filter | P1 | Not Tested | Seed set exists | 1. Query `engines(requiresLibrary:true)`.<br>2. Compare against ENTC6's `libraryRequired:true` result. | Same set — no divergence |
| ENTC24 | Creates-TDO filter | P1 | Not Tested | Seed set exists | 1. Query `engines(createsTdo:true)`. | Returns S1 only |
| ENTC25 | Pagination is correct | P1 | Not Tested | Seed set exists (5 engines) | 1. Query `engines(filter:{name:"citest-filter", nameMatch:startsWith}, limit:2)` and walk all pages via `offset`. | 3 pages total, `count` = 5, no id repeated or missing |

### 5. `engineFields.spec.ts` (P1)

Base setup: Org A creates engine `E` with every optional field populated (icon/logo, tags,
CPU/GPU, manifest, testing details, use cases, industries, website, job templates).

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| ENTC1 | Icon/logo signed URLs | P1 | Not Tested | `E` created with `iconPath`/`logoPath` set | 1. Query `engine(id:E){signedIconPath, signedLogoPath}`. | Resolves to a signed URL (or raw-path fallback) |
| ENTC2 | Tags round-trip on create | P1 | Not Tested | `E` created with `entityTags` set | 1. Query `engine(id:E){entityTags}`. | Matches the tags sent on create |
| ENTC3 | Tags fully replaced on update | P1 | Not Tested | `E` has tags from ENTC2 | 1. Call `updateEngine(entityTags:[...])` with a different tag set.<br>2. Re-query `entityTags`. | Only the new tags present, old ones gone |
| ENTC4 | Hardware fields round-trip | P1 | Not Tested | `E` created with CPU/GPU/kernel/distribution fields set | 1. Query `engine(id:E){cpuResourceMcpu gpuSupported gpuRequired gpuModel gpuDriverVersion kernelVersion distributionType}`. | All match create input |
| ENTC5 | Descriptive fields round-trip | P1 | Not Tested | `E` created with `manifest`/`testingDetails`/`useCases`/`industries`/`website` set | 1. Query those fields on `engine(id:E)`. | All match create input |
| ENTC6 | Build-derived fields are empty pre-deploy | P1 | Not Tested | `E` exists, no build deployed yet | 1. Query `engine(id:E){preferredInputFormat supportedInputFormats outputFormats supportedSourceTypes hasScanPhase}`. | Null/empty for all |
| ENTC7 | Build-derived fields populate post-deploy | P1 | Not Tested | `E` has a build deployed | 1. Re-query the same fields as ENTC6. | All populated |
| ENTC8 | Deployed version tracks the live build | P1 | Not Tested | `E` exists | 1. Deploy build v1 on `E`, query `deployedVersion`.<br>2. Deploy build v2 on `E`, re-query `deployedVersion`. | Reflects v1, then v2 |
| ENTC9 | Task metrics, valid range | P1 | Not Tested | `E` has a deployed build | 1. Query `engine(id:E){taskMetrics(fromDateTime: "<3 days ago>", toDateTime: "<now>")}`. | Returns `EngineTaskMetrics` with counts ≥ 0 |
| ENTC10 | Task metrics, range too wide | P1 | Not Tested | `E` exists | 1. Query `taskMetrics(fromDateTime: "<10 days ago>", toDateTime: "<now>")`. | Rejected/validated |
| ENTC11 | Job templates filtered by type | P1 | Not Tested | `E` created with `standaloneJobTemplates` of both `Reprocess` and `Upload` types | 1. Query `standaloneJobTemplates(type: Reprocess)`.<br>2. Query `standaloneJobTemplates(type: Upload)`. | Each returns only the matching type |
| ENTC12 | Dependency read doesn't error | P1 | Not Tested | `E` exists (write path server-disabled) | 1. Query `engine(id:E){dependency{dependencyType assetType}}`. | Returns `null`/default, no error |

### 6. `engineCategoryAndOverview.spec.ts` (P1)

Read-only suite, no teardown needed.

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| ENTC1 | Category list pagination | P1 | Not Tested | Categories exist in the environment | 1. Query `engineCategories(limit:2)` and walk pages via `offset`. | `count` matches total, no overlap |
| ENTC2 | Category list filtered by id | P1 | Not Tested | Two known category ids resolved | 1. Query `engineCategories(ids:[id1,id2])`. | Returns exactly those two |
| ENTC3 | Category list filtered and sorted | P1 | Not Tested | A category of a known `EngineType` exists | 1. Query `engineCategories(type: <that type>, orderBy:[...])`. | Correct filter and sort order |
| ENTC4 | Single category lookup | P1 | Not Tested | A known category id (e.g. transcription) | 1. Query `engineCategory(id: <known>)`.<br>2. Query `engineCategory(id: <random nonexistent id>)`. | Full shape for the known id; `null` or `NotFound` for the nonexistent one ⚠ |
| ENTC5 | Aggregate overview | P1 | Not Tested | None | 1. Query `engineOverview{...}`. | Matches the schema's documented aggregate shape |
| ENTC6 | Non-admin JWT rights differ from superadmin's | P1 | Not Tested | An engine `E` owned by Org A exists | 1. Call `getEngineJWT` for `E`, using Org A's normal (non-superadmin) token. | `jwtRights` excludes superadmin-only permissions — contrast to the existing superadmin test in `basicEngine.spec.ts` |
