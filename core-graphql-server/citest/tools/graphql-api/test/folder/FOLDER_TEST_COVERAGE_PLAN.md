# Folder Test Coverage — Findings & Improvement Plan

This document records a coverage audit of `test/folder/` (this directory, including
`RBAC/`) against the Folder surface in `schema/schema.graphql` (`Folder`, `FolderOverview`,
`FolderSummaryDetail`, `FolderList`, the `rootFolders`/`folder`/`folderOverview`/
`folderSummaryDetails` queries, and `createFolder`/`updateFolder`/`moveFolder(s)`/
`deleteFolder`/`createRootFolders`/`createFolderContentTemplate` mutations).

**Scope note**: per direction from the team, **folder sharing is explicitly out of scope**
for this pass. `RBAC/folderShare.spec.ts` and the "share folder" sections inside
`folderNonOlp.spec.ts`, `RBAC/folderOlp.spec.ts`, `RBAC/folderSwitchOLP.spec.ts`,
`folders.spec.ts`, and `foldersV2.spec.ts` are intentionally excluded from this audit and
from the plan below — they are not analyzed for gaps here.

## Headline finding

Excluding sharing, **Folder already has unusually mature coverage** compared to other
topics — it uses named test-case IDs (`A1`–`A62` in `folderNonOlp.spec.ts`, `FO1`–`FO51` in
`RBAC/folderOlp.spec.ts`) that systematically walk create/update/move/delete across
owner/admin/cms/restricted-user roles, both folder versions (V1/V2), OLP and non-OLP
configurations, ACE inheritance, multi-org isolation, and V1↔V2 conversion. The gaps found
below are narrow and specific, not structural.

## Current coverage — inventory (non-share)

| File | Covers |
|---|---|
| `folders.spec.ts` | V1 CRUD, content templates, folderOverview/folderSummaryDetails, childWatchlists, folderPath+TDO, super-admin cross-org create |
| `foldersV2.spec.ts` | Same shape as `folders.spec.ts` but for V2 folders, plus Application Folders (file/unfile) and a V1→V2 switch scenario |
| `folderNonOlp.spec.ts` | `A1`–`A62`: exhaustive create/update/move/move-bulk validation matrix (bad input, inaccessible IDs, wrong role) across V1/V2, non-OLP orgs |
| `RBAC/folderOlp.spec.ts` | `FO1`–`FO51`: same shape as above but for OLP-enabled orgs, with explicit ACE-grant-then-retry sequences |
| `RBAC/folderSwitchOLP.spec.ts` | Behavior when an org is switched from non-OLP to OLP mid-suite; permission-grant-then-retry sequences |
| `RBAC/folderInherit.spec.ts` | ACE inheritance flag on parent→child folders and TDOs filed in them |
| `RBAC/folderAdminRbac.spec.ts`, `RBAC/folderUserRbac.spec.ts` | Auth-group/permission-set CRUD, JWT-scoped folder access, per-resource ACE grants for restricted users |
| `folderConversion.spec.ts` | Root-folder identity across V1 (shared per user across orgs) vs. V2 (isolated per org), and single-org V1↔V2 switch preserving folder id/name |
| `folderMultiOrg.spec.ts` | Same user, root folder behavior across two orgs, each independently switchable V1/V2 |
| `folderUserRootTreeObjectId.spec.ts` | `createRootFolders` idempotency and `treeObjectId` stability/uniqueness across orgs |
| `folderSearchContent.spec.ts` | TDO filed in a folder is/isn't searchable by other orgs (the non-share half of this file) |
| `watchlist.spec.ts` | Watchlist CRUD/subscriptions/CSP — folder involvement is only "get watchlist root folder ID" |

## Gap analysis (non-share)

### P1 — untested `Folder` fields

- **`childCollections`** — declared on `Folder` (paginated, with a `name` filter) but has
  **zero** call sites anywhere in `test/folder/`. Nothing verifies a `Collection` filed
  under a folder is actually returned here.
- **`childApplications`** — same situation: `foldersV2.spec.ts`'s "Application Folders"
  block calls `fileApplication`/`unfileApplication` and only asserts the mutation's return
  value, never reads `Folder.childApplications` back to confirm the read side (list
  contains it after filing, is empty after unfiling, pagination works).
- **`childWatchlists`** — only the `name` (singular) filter is exercised
  (`folders.spec.ts`/`foldersV2.spec.ts`). The `names` (list) and `nameMatch`
  (`contains`/`exact`) arguments declared on this field are untested.
- **`childFolders` `nameMatch`** — the `names` list filter is tested with its default
  match mode; `nameMatch: exact` is never explicitly selected and compared against
  `contains` to confirm the two modes actually behave differently.

### P1 — `maxDepth` is read but never enforced in a test

`maxDepth` appears in three response-shape queries (`folders.spec.ts`,
`foldersV2.spec.ts`) but no test creates a folder chain deep enough to hit the limit and
asserts the platform actually rejects it. This is a real behavioral gap, not just a
field-selection one — if enforcement regresses, nothing here would catch it.

### P2 — V2's `orderIndex` no-op isn't asserted anywhere (not a bug — a doc/regression gap)

`folderNonOlp.spec.ts`'s `A9 - 2 folder should auto indexed, not have same orderIndex`
contains `if (version === 'v2') return;`. Investigated directly against the source (not
just the test): this is **correct, not a gap in test logic** — `orderIndex` was
deliberately deprecated for V2 at the schema-storage layer, confirmed by:

- `flyway/db/media_platform/sql/V2_28__v2_folder_tables.sql`, the table's own creation
  migration, states it in the header comment: `-- NOTE: Features deprecated / 1. Sharing
  though still in the model / 2. order index`. The `v2_folder` table has **no
  `order_index` column** at all.
- `dal/dalFolderV2.js` never reads or writes `orderIndex` anywhere in the file — not in
  `folderColumns` (the create INSERT column map), not in `validateCreateFolderInput`, not
  in `deleteFolder`/`updateFolder`/`moveFolders`, and `mapper.mapFolderV2` never sets it on
  the object returned to GraphQL.
- Contrast with V1's `dal/dalFolder.js`, where `evilInsertTreeObject` does a real
  ordered-list insert against the legacy `tree_object` table (`UPDATE tree_object SET
  order_index = order_index + 1 WHERE ... order_index >= $newIndex`, then insert the new
  row at that index) — that shifting behavior is exactly what `A9` exists to verify, and it
  has no V2 counterpart to test.

**What's actually missing** isn't a fix to `A9`'s logic, it's that nothing *documents this
as intentional in the codebase itself*, and nothing asserts the no-op behavior positively:
- The GraphQL schema doesn't flag it — `input DeleteFolder { id: ID!, orderIndex: Int! }`
  is still **required**, and `CreateFolder.orderIndex: Int = 0` has no `@deprecated`
  directive, so a caller (or a future schema reader) has no signal from the schema alone
  that this field does nothing for V2 folders.
- No test asserts the no-op directly — e.g. that two V2 folders created back-to-back both
  come back with the same (absent/default) `orderIndex`, and that passing an arbitrary
  `orderIndex` to `createFolder`/`deleteFolder` on a V2 org has no effect on ordering or
  causes no error. Today that behavior is only implied by `A9`'s early return, so if V2
  ordering were ever accidentally reintroduced (or removed further, e.g. rejected as
  invalid input), nothing here would catch the change either way.

### P2 — content-template negative paths

`createFolderContentTemplate`/`updateFolderContentTemplate` only have one negative case
today ("throw folder content template not found after deleting"). Untested:
- Create a content template referencing a nonexistent or inaccessible `StructuredDataObject`
  id — should fail, not silently succeed with a dangling reference.
- Update a content template with a wrong/nonexistent template id.
- The misspelled legacy mutations (`createFolderContentTempate`,
  `updateFolderContentTempate`, `deleteFolderContentTempate`) are only exercised in
  `folders.spec.ts` (V1); `foldersV2.spec.ts` and the RBAC files only use the correctly
  spelled variants. Not a bug, but worth a one-line regression case confirming the legacy
  spelling still works on V2 too, since it's presumably kept only for backward
  compatibility and nothing currently proves that for V2.

### P2 — deletion with content still filed

`foldersV2.spec.ts`/`folders.spec.ts` delete watchlists and descendant folders *before*
deleting the parent, implying deletion is order-sensitive, but there's no explicit test
that asserts **what error you get** if you attempt to `deleteFolder` while it still has a
child TDO, watchlist, collection, or application filed in it. Right now that constraint is
inferred from test ordering, not verified directly.

### P2 — `FolderOrderBy` direction correctness

`RBAC/folderUserRbac.spec.ts` is the only file that passes `orderBy` to `childFolders`
(`CreatedDateTime`, `Name`), and it does so once. There's no test that seeds folders with
deliberately out-of-order names/creation times and asserts the returned order actually
matches `direction: asc` vs `desc` — today it's plausible the field is accepted but silently
ignored and nothing would catch it.

## Proposed plan

| # | File | Priority | Scope |
|---|---|---|---|
| 1 | Extend `foldersV2.spec.ts` "Application Folders" block | P1 | Add `childApplications` read-back assertions after `fileApplication`/`unfileApplication` |
| 2 | New: `test/folder/folderChildCollections.spec.ts` | P1 | First-ever coverage of `Folder.childCollections`: file a `Collection` into a folder (however that association is created — check `Collection.folder`/`Collection` mutations), assert it appears/disappears and paginates correctly |
| 3 | Extend `folders.spec.ts` / `foldersV2.spec.ts` "return childWatchlists" case | P1 | Add `names` (list) and `nameMatch: exact` vs `contains` sub-cases |
| 4 | Extend the "return childFolders" case in `folders.spec.ts` / `foldersV2.spec.ts` | P1 | Add an explicit `nameMatch: exact` query and confirm it excludes partial matches that `contains` includes |
| 5 | New case in `folderNonOlp.spec.ts` (or a small new file) | P1 | Create a folder chain deeper than `maxDepth` and assert rejection; confirm the boundary (exactly at `maxDepth` succeeds, one past fails) |
| 6 | Replace the `A9` early-out in `folderNonOlp.spec.ts` | P2 | Swap `if (version === 'v2') return;` for an explicit V2 assertion of the no-op: two V2 folders created back-to-back both resolve `orderIndex` the same (absent/default) way, and passing an arbitrary `orderIndex` to `createFolder`/`deleteFolder` on a V2 org neither errors nor affects ordering. Add a one-line comment citing `V2_28__v2_folder_tables.sql`'s deprecation note so the intent survives the next reader. Separately, consider adding `@deprecated` to `orderIndex` on the `CreateFolder`/`DeleteFolder` inputs in the schema itself (schema change, not a test change) |
| 7 | Extend content-template cases in `folders.spec.ts`/`foldersV2.spec.ts` | P2 | Add "create with nonexistent SDO id should fail" and "update with nonexistent template id should fail"; add a V2 case for the legacy-spelled mutations |
| 8 | New case near "delete a descendant folder before deleting its parent" | P2 | Explicitly attempt `deleteFolder` on a folder that still has a child TDO/watchlist filed in it and assert the specific error, rather than relying on test ordering to imply the constraint |
| 9 | Extend the `orderBy` case in `RBAC/folderUserRbac.spec.ts` | P2 | Seed folders with distinguishable names/creation times and assert both `asc` and `desc` actually reorder the `records` list, not just that the query is accepted |

**Suggested order**: 1 → 2 → 3 → 4 are cheap, additive assertions on existing setup/state
(no new fixtures needed) — do these first. 5 is the remaining high-value behavioral gap
(actual enforcement, not just field selection). 6–9 are lower-signal polish/documentation
and can follow.

## References

- Schema source of truth: `schema/schema.graphql` (`Folder`, `FolderOverview`,
  `FolderSummaryDetail`, `RootFolderType`, `FolderOrderBy`)
- Topic/relationship context: `../../../../docs/graphql-topics-overview.md` §10
  (Folders, Collections & Sharing) and `../../../../docs/graphql-topic-relationships.md`
  (TDO ↔ Folder)
- Companion audit for another topic, same format: `../tdo/TDO_TEST_COVERAGE_PLAN.md`
