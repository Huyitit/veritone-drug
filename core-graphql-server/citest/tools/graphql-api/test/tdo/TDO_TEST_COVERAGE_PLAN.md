# TDO Test Coverage — Findings & Improvement Plan

This document records the coverage audit performed against `test/tdo/` (this directory) and
the schema's TDO surface (`schema/schema.graphql`, types `TemporalDataObject`, `CreateTDO`,
`UpdateTDO`, plus the `temporalDataObjects`/`temporalDataObject` queries and
`createTDO`/`createTDOWithAsset`/`updateTDO`/`deleteTDO`/`cleanupTDO` mutations). It's meant
to be read alongside the actual spec files — it doesn't restate what's already obvious from
the code, only what's covered, what's missing, and in what order to close the gaps.

## Current coverage — inventory

| File | Covers |
|---|---|
| `aiwareTdoPermissions.spec.ts` | Happy-path create/get/update TDO, create-with-asset, asset CRUD, engine results, signed URLs, upload status, clone-request listing, folder file/unfile/move |
| `fileTDO.spec.ts` | Folder filing lifecycle (file/refile/unfile/move), not-found error, delete cascades out of folder |
| `recDelTest.spec.ts` | Full delete cascade (task/search-index/S3/asset data), oversized-metadata rejection, `cleanupTDO`, `dateTimeFilter` + max-offset enforcement |
| `recordingResource.spec.ts` | Org-token vs. orgless-token create/update/delete, content-type auto-detection |
| `requestCloneTdos.spec.ts` | `requestClone`/`refreshClone` with `tdoIds` filter, asset-mapping exclusions |
| `tdoRBAC.spec.ts` | New-RBAC-feature-gated happy path (create/get/update/move/delete), only runs when `useRBACFeature` flag is on |
| `batchActionsApi.spec.ts` | TDO lists as batch-action targets |
| `virtualAsset.spec.ts`, `virtualAssetE2E.spec.ts`, `virtualAssetPromotion.spec.ts` | Asset URL virtualization/promotion — TDO creation is only setup scaffolding here, not the thing under test |

**Headline observation**: coverage skews heavily toward happy-path CRUD and the
asset-storage-virtualization tangent (3 of 10 files). Query-filter surface, authorization
*denial* paths, and several mutation input fields declared in the schema are essentially
untested.

## Gap analysis

Findings are grouped by priority. "Untested" below means: no assertion anywhere in
`test/tdo/` exercises this — confirmed by grepping the spec files for the field/argument
name, not just skimming test titles.

### P0 — authorization / negative paths (almost no coverage today)

- No test attempts to read, update, delete, or `cleanupTDO` a TDO **across organizations**
  without `includePublic`/`isPublic` — i.e. nothing confirms the isolation actually holds.
- `isPublic: true` on `createTDO` is never tested end-to-end: another org should be able to
  **read** it via `includePublic: true` but **not** update/delete it. Untested both ways.
- No test uses a token that lacks the required role (`AIWARE_TDO_READ` / write) and asserts
  the `@requireAuthRole` directive actually denies the request. `tdoRBAC.spec.ts` only
  exercises the *granted* path, and only when the newer `useRBACFeature` flag is on — the
  default/legacy auth path (what most orgs run) has **zero** denial coverage.
- `temporalDataObject(id: <nonexistent>)` — behavior (null vs. error) isn't asserted;
  `fileTDO.spec.ts` only tests "not found" in the *filing* mutation, not the base query.

### P1 — untested query filters on `temporalDataObjects`

All of these arguments are already wired into the `GET_TDOS` SDK query
(`src/queries/extracted/tdo.ts`) — they're declared but never exercised with a real
assertion in any spec:

- `sourceId`, `programId`, `scheduledJobId` — filter by ingestion source / program / job
- `sampleMedia`
- `mentionId` — TDOs associated with a specific mention
- `ids` (plural list form) as distinct from singular `id`
- `orderBy` values other than the default, combined with `orderDirection: asc`
- Normal pagination correctness (`count` vs. `records.length`, requesting page 2 and
  confirming no overlap/gap with page 1) — today only the *max-offset-exceeded* edge case
  is covered (`recDelTest.spec.ts`), not ordinary paging

### P1 — untested nested fields on `TemporalDataObject`

- `assets(sourceTaskId: ...)`, `assets(includeVirtualMediaAsset: false)`
- `assetCount`
- `primaryAsset(assetType: ...)`
- `security` (read of the ACL / global-public flag)
- `tasks(...)` / `jobs(...)` queried **from** a TDO (as opposed to querying `Job`/`Task`
  directly, which other topics' tests do cover)
- `folders` / `foldersTreeObjectIds` **read back from the TDO** (existing tests only cover
  the folder-side filing mutations, never assert the TDO reflects the membership)
- `details(path: "...")` — the JSONPath-scoped variant, only bare `details` is used today
- `sourceData` — provenance of which task/engine created the TDO
- Regression check that deprecated fields (`mediaId`, `metadata`, `jsondata`) still resolve
  without error, since they're deprecated but not removed

### P1 — untested mutation input fields

- `createTDO` fields never exercised: `contentTemplates`, `addToIndex`, `launchProgram`,
  `sourceData` (`SetTDOSourceData`), and `parentFolderId` combined with a caller who lacks
  folder-file permission (should be denied, not silently ignored)
- `updateTDO` fields never exercised: `primaryAsset` (`SetPrimaryAsset`),
  `flags: [preventTrim]`, `addToIndex`
- `cleanupTDO` — only the default options path (`[storage, searchIndex]`) is asserted;
  each `TDOCleanupOption` value should be tested individually (e.g. `storage` only should
  leave search-index data intact, and vice versa)
- `deleteTDO` idempotency — deleting an already-deleted or nonexistent TDO id

### P2 — cross-topic integration (documented in the relationship docs, not tested from the TDO side)

- `createTDOWithAsset` immediately followed by an `assets` sub-query that includes
  engine-output-shaped assets, not just the one asset created inline
- A TDO produced by real `Job`/`Task` execution — `recDelTest.spec.ts` already creates a
  job against a TDO, but never asserts `TDO.sourceData`, `TDO.tasks`, or `TDO.jobs`
  afterward; it only checks deletion side effects
- The `mentionId` filter's actual linkage to a `Mention`/`Watchlist` (see
  `docs/graphql-topic-relationships.md` §"Watchlist ↔ Mention ↔ Collection")

## Proposed plan

| # | File | Priority | Scope |
|---|---|---|---|
| 1 | New: `test/tdo/tdoAuthorization.spec.ts` | P0 | Cross-org and role-based denial matrix for read/update/delete/cleanup; `isPublic`/`includePublic` visibility rules (both directions); nonexistent-id read behavior |
| 2 | New: `test/tdo/tdoQueryFilters.spec.ts` | P1 | One `describe` per filter (`sourceId`, `programId`, `scheduledJobId`, `sampleMedia`, `mentionId`, `ids`, `orderBy`/`orderDirection`), each seeding 2–3 distinguishable TDOs; plus ordinary pagination correctness |
| 3 | New: `test/tdo/tdoFields.spec.ts` | P1 | Nested-field coverage: `assetCount`, `primaryAsset`, `security`, `details(path:)`, `folders`/`foldersTreeObjectIds`, `sourceData`, deprecated-field smoke checks |
| 4 | Extend `recDelTest.spec.ts` (or new `test/tdo/tdoCleanup.spec.ts`) | P1 | Parametrize `cleanupTDO` over each `TDOCleanupOption` individually; add a `deleteTDO` idempotency case |
| 5 | Extend `aiwareTdoPermissions.spec.ts` | P1 | Add `createTDO` cases for `contentTemplates`, `addToIndex`, `launchProgram`, `sourceData`; add `updateTDO` cases for `primaryAsset` and `flags` |
| 6 | Extend `recDelTest.spec.ts` | P2 | After existing job/task creation, assert `TDO.sourceData`/`TDO.tasks`/`TDO.jobs` reflect the real execution, not just deletion side effects |

**Suggested order**: 1 → 2 → 3 → 4 first — they're independent of each other and highest
signal (auth correctness and unexercised filter/field surface). 5 and 6 are natural
follow-ups once the new files establish the seeding/teardown patterns.

## References

- Schema source of truth: `schema/schema.graphql` (`TemporalDataObject`, `CreateTDO`,
  `UpdateTDO`, `TDOCleanupOption`, `UpdateTDOFlag`)
- Existing SDK query surface: `src/queries/extracted/tdo.ts` (note: `GET_TDOS` already
  declares every filter argument listed above as a gap — the gap is in test coverage, not
  SDK plumbing)
- Topic/relationship context: `../../../../docs/graphql-topics-overview.md` §1
  (Recordings & Media) and `../../../../docs/graphql-topic-relationships.md`
  (TDO ↔ Asset ↔ Folder ↔ Mention)
