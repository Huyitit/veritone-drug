# Folder V2 — Nested Folder Test Plan

**Ticket**: [VP-1262](https://veritone.atlassian.net/browse/VP-1262) — Folders V2 PubSec Rollout for Nested Folders
**Not this doc**: general V1/V2 migration testing — see the signed-off Confluence
["Folder v2 test plan"](https://veritone.atlassian.net/wiki/spaces/~7120202827129119ca4dc8af70ab0828421d8c/pages/4408573956/Folder+v2+test+plan).
This plan covers only **nested/hierarchy** behavior in **V2**, which that plan doesn't test.

## Why this plan exists

PubSec orgs will build deep folder trees. Before rollout we need to know: does depth actually
work in V2 — safely and correctly? (Performance at depth is out of scope for this plan; see the
existing external k6 load test, `runall/load-citest/src/nestedV2Folders.js`, for that.) Digging
into the code turned up three things worth flagging to product/architecture before we go further:

1. **V1 limits how deep a folder tree can go (5 levels by default). V2 has no limit at all.**
   Is that intentional, or does V2 need the same guardrail before PubSec starts building trees?
2. **Permission inheritance does not update after the fact — confirmed.** When a folder is
   created, it copies permissions from its parent *at that moment* (`@authInherit`,
   `inheritResourceACEs` in `rbacAuth.bll.js`/`authACE.dal.js`), inserting an independent
   `rbac_acl` row on the child. Revoking an ACE (`removeACEsFromResources` /
   `deleteACLForResources`) deletes only the exact row matching the ACE id passed in — there is no
   cascade to any row a descendant already copied. Confirmed by both a live test run (NFD-12) and
   a source trace: a folder that inherited access while the grant was active keeps that access
   indefinitely after the grant is revoked, until someone explicitly revokes the ACE on that folder
   too. This is a real security gap, not a hypothesis — see NFD-12's corrected expected result
   below and NFD-9 covering the grant-side mirror of this same gap.
3. A recent perf fix (VE-27880) touched how the platform finds "which folder is this file in"
   for content filed deep in a tree — worth a direct regression test, not just trusting the fix.

Everything else in this plan exists to answer those three questions with actual test evidence.

## What we're testing

- **Depth limits** — confirm V2 really has none today (not a bug to "fix," just something to
  prove and document)
- **Permission inheritance across levels** — does a grant/revoke at the top actually reach folders
  several levels down, both when they already existed and when they're created after?
- **Moving folders around** — can you accidentally move a folder into its own subfolder? What
  happens when you try to bulk-move a mix of valid and invalid folders?
- **Cross-org isolation at depth** — a folder buried 5 levels deep in Org A must be just as
  invisible to Org B as the root folder is. This is the PubSec-critical one.
- **Finding filed content at depth** — TDOs/watchlists/etc. filed deep in a tree, or filed in more
  than one folder, need to resolve correctly (this is what VE-27880 touched)

## What we're NOT testing here

- V1 ↔ V2 migration/parity — already covered by the signed-off Confluence plan
- V1 depth behavior itself — mentioned above only as context for Question 1, not something this
  plan re-tests
- Folder sharing — out of scope repo-wide (see `FOLDER_TEST_COVERAGE_PLAN.md`)
- Basic non-nested CRUD — already covered by `folderNonOlp.spec.ts` and `RBAC/folderOlp.spec.ts`
- Performance/load testing at depth — covered separately by the existing external k6 load test
  (`runall/load-citest/src/nestedV2Folders.js`), not by this plan or its citest spec

## How we'll test it

1. First, build a small helper to create an N-levels-deep folder chain — nothing like this exists
   in the test helpers today, and almost every case below needs it.
2. Add the functional cases as a new spec (`folderNestedDepth.spec.ts`) and extend
   `RBAC/folderInherit.spec.ts` for the permission-inheritance cases — it already has single-level
   setup we can build on.
3. If a case confirms "V2 has no depth limit," mark it **Observed**, not **Fail** — it's not a bug
   until product says it should be one.

## Where we'll test it

- **Stage** for functional cases.
- A **PubSec-representative org/environment** for the cross-org isolation cases — ideally one of
  the 5 environments named in VP-1262 (Azure Stage, Gov-1, Gov-2, US-3, CA), or the closest safe
  stand-in.

## Actors used below

Based on the real setup pattern in `RBAC/folderInherit.spec.ts`.

| Actor | What it is | How to create | Used for |
|---|---|---|---|
| **Org A** | Primary isolated test org, RBAC + V2 folders enabled | 1. `createIsolatedSuperadmin(gqlClient)` to get a throwaway superadmin session. 2. `setupTestOrgAndUser(isoClient, { orgInput: { metadata: { features: { enableRBACFeature: 'enabled' } }, ... }, userInputs: [...] })` to create the org plus its users in one call. 3. Separately set `v2FoldersEnabled: 'enabled'` on the org's feature metadata (as done in `foldersV2.spec.ts`/`folderConversion.spec.ts`) | Primary actor everywhere |
| **Org B** | Second isolated org, same setup | Same steps as Org A, run a second time so it's a fully separate org | Cross-org isolation only (NEST-PUBSEC-*, renumbered `NFD-18.x`–`NFD-21.x` below) |
| **Admin user** | A user who can create/move/delete folders freely | One of `setupTestOrgAndUser`'s `userInputs`, given the two folder-admin `roleIds` used in `folderInherit.spec.ts` (`032218c3-d47e-4287-9d16-7bb867c01266`, `cf2ed945-176b-4dd9-943e-22fcb1cf684f`) | Building the folder chains under test |
| **Restricted user** | A user with no roles by default, granted access only where the test needs it | Created with `roleIds: []`; then grant a folder-scoped ACE via `addACEsToResources` (with or without the `inherit` option) at whichever folder level the case is testing | The mid-level grant/revoke cases (`NFD-9`–`NFD-17`) |
| **Isolated superadmin** | Throwaway superadmin session | `createIsolatedSuperadmin(gqlClient)` | Bootstrapping Org A/B, toggling `v2FoldersEnabled` |

Not covered here: the **instance-level** `v2FoldersAvailable` flag — that's environment-wide, not
something a test toggles per-run; confirm it's already on in whichever stage environment is used.

## Test cases

Flat `NFD-` numbering across the whole plan. Update **Status** as testing executes (`Not Tested` /
`Pass` / `Fail` / `Blocked` / `Observed` — see "How we'll test it," step 3, for when to use
`Observed`).

### Depth limits

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-1 | Create a folder chain multi levels deep succeeds | P0 | Not Tested | Org A created, V2 folders enabled; Admin user logged in | 1. As Admin user, call `createFolder` repeatedly, each new folder's parent = the previous one, until the chain is 10 levels deep.<br>2. Note whether any create call errors.<br>3. Query the deepest folder to confirm it exists. | All 10 creates succeed with no depth-limit error; deepest folder is readable — confirms V2 has no enforcement today (Question 1) |
| NFD-2 | `Folder.maxDepth` is a static pass-through, not computed | P2 | Not Tested | Reuse NFD-1's 10-level chain | 1. Query `folder(id)` for the root, a mid-level, and the leaf folder, selecting `maxDepth`.<br>2. Compare the three values. | Same value returned regardless of actual depth |
| NFD-3 | `FolderSummaryDetail.depth` is correct at each level | P2 | Not Tested | Reuse NFD-1's chain | 1. Query `folderSummaryDetails` for root, mid, and leaf, selecting `depth`.<br>2. Compare against each folder's actual position in the chain. | Depth increases by 1 per level; confirm whether root reports 0 or 1 |

### Moving folders (cycle prevention & bulk semantics)

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-4 | `moveFolder` rejects moving a folder into its own descendant | P1 | Not Tested | Org A has chain Parent → Child → Grandchild | 1. As Admin user, call `moveFolder` to move Parent under Grandchild. | Rejected: `ResourceConflict` — "Cannot move parent folder into its own subfolder" |
| NFD-5 | `moveFolders` bulk: one invalid folder, rest valid | P1 | Not Tested | Org A has chain Parent → Child → Grandchild, plus an unrelated folder Other | 1. Call `moveFolders` with `folderIds: [Parent, Other]`, `newParentFolderId: Grandchild`.<br>2. Inspect `invalidFolderIds` and each folder's parent afterward. | Parent is reported invalid and not moved; Other is successfully moved |
| NFD-6 | `moveFolders` bulk: every folder invalid | P2 | Not Tested | Two chains, each folder in the list is an ancestor of its own destination | 1. Call `moveFolders` with a list where every folder is an ancestor of the given destination. | `invalidFolderIds` contains all requested ids; none moved; no error thrown |
| NFD-7 | `moveFolders` bulk: every folder valid | P2 | Not Tested | Org A has 3 independent folders + one unrelated destination folder | 1. Call `moveFolders` with all 3 folder ids and the destination.<br>2. Inspect the response and each folder's new parent. | All 3 moved successfully; `invalidFolderIds` empty; success message returned |
| NFD-8 | Moving a subtree cascades path/depth to every descendant | P1 | Not Tested | Org A has chain A → B → C, plus separate destination folder D | 1. Move A (with descendants B, C) under D.<br>2. Query C's ancestor chain/depth after the move. | C's path/depth correctly reflects D → A → B → C, not just A's own record |

### Permission inheritance across levels

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-9 | Create child folder before granting root folder access - child folder does not inherit access | P0 | Not Tested | Org A: Root → L1 → L2 → L3 chain already exists (created before any grant); Restricted user has no roles | 1. Grant Restricted user an ACE at Root with the inherit option, with L1/L2/L3 already existing.<br>2. As Restricted user, read L3. | Access denied — `@authInherit` only fires from the `createFolder` resolver at creation time, so a grant made after the fact has nothing to copy onto already-existing descendants; this is the grant-side mirror of NFD-11's revoke-side finding, completing the "both when they already existed and when they're created after" coverage called out under "What we're testing" above |
| NFD-10 | Create child folder after granting root folder access - child folder inherits access | P1 | Not Tested | Org A: Root exists, L1/L2/L3 not yet created; Restricted user has no roles | 1. Grant Restricted user an ACE at Root with the inherit option.<br>2. Create L1 → L2 → L3 under Root (after the grant).<br>3. As Restricted user, read L3. | Restricted user can access L3 |
| NFD-11 | Granting ACE without the inherit option — cannot access child folder | P0 | Not Tested | Org A: Root exists, L1/L2/L3 not yet created; Restricted user has no roles | 1. Grant Restricted user an ACE at Root with NO `inherit` option (`options: []`).<br>2. Create L1 → L2 → L3 under Root (after the grant), same as NFD-10.<br>3. As Restricted user, read L3. | Access denied — the negative control for NFD-10: identical setup and timing, only the `inherit` option differs. Without this case, nothing in the suite actually proves the `inherit` flag is what enables propagation rather than every grant cascading regardless of the flag (`containsInheritFlag`/`auth_inherit`, `authACE.dal.js:171-181`) |
| NFD-12 | Revoking a root ACE after descendants already exist -- loses access to root, still accessible to descendants | P0 | Observed | Continue from NFD-10 — L3 is accessible to Restricted user | 1. Revoke Restricted user's ACE at Root.<br>2. As Restricted user, read Root again.<br>3. As Restricted user, read L3 again. | **Question 2 answered — this is the confirmed security gap.** Restricted user is correctly denied at Root (its own `rbac_acl` row was the one actually deleted) but KEEPS access to L3, since the revoke never touches L3's independently-copied row (confirmed by source trace of `deleteACLForResources`, `authACE.dal.js:399-439`, plus a live NFD-12 run confirming both outcomes). Not a code bug — this is how copy-on-create inheritance is designed to work today — but it is a real access-control gap PubSec needs to sign off on before rollout, not something to silently accept |
| NFD-13 | Revoking a root ACE before descendants exist - lose access to rootFolder, can not access new descendants | P0 | Not Tested | Org A: Root exists, L1/L2/L3 not yet created; Restricted user has no roles | 1. Grant Restricted user an ACE at Root with the inherit option.<br>2. Revoke that ACE.<br>3. Create L1 → L2 → L3 under Root (after the revoke).<br>4. As Restricted user, read L3. | Access denied — completes the temporal matrix alongside NFD-9/NFD-10/NFD-12: `@authInherit` copies whatever's currently in `rbac_acl` on the parent at `createFolder` time, and the row is gone (hard-deleted by `deleteACLForResources`, not superseded) once revoked, so a folder created after the revoke has nothing to inherit. This is the case that would catch a regression where revoke doesn't fully delete the row (soft-delete/tombstone/stale-cache) before the next `inheritResourceACEs` copy runs |
| NFD-14 | Mid-level grant doesn't grant access upward | P1 | Not Tested | Org A has chain Root → L1 → L2; Restricted user has no roles | 1. Grant Restricted user an ACE at L1 only.<br>2. As Restricted user, read Root. | Access denied |
| NFD-15 | Mid-level grant cascades downward to later-created folders | P1 | Not Tested | Continue from NFD-14 — ACE already granted at L1 | 1. Create L2 under L1 (after the grant).<br>2. As Restricted user, read L2. | Restricted user can access L2 |
| NFD-16 | Mid-level grant after a descendant already exists does NOT retroactively grant access | P1 | Not Tested | Org A has chain Root → L1 → L2; L2 already exists before any grant; Restricted user has no roles | 1. Grant Restricted user an ACE at L1 only, with L2 already existing.<br>2. As Restricted user, read L2. | Access denied — mid-level mirror of NFD-9: `@authInherit` only fires at `createFolder` time, so a grant at L1 made after L2 already exists has nothing to copy onto it, the same as at root. Completes the mid-level pair alongside NFD-14 (doesn't leak up) and NFD-15 (does reach later-created children) |
| NFD-17 | Moving a subtree re-derives (or doesn't) ACEs for the moved folder's children | P0 | Not Tested | Org A has subtree X → Y (X has an ACE granted to Restricted user); destination folder Z has different ACEs, not granted to Restricted user | 1. Move X (with child Y) under Z.<br>2. As Restricted user, attempt to read X and Y after the move. | Document actual behavior — confirm whether X/Y reflect Z's ACEs or keep the old ones; undocumented in code today |

### Cross-org isolation at depth (PubSec-critical)

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-18.1 | Cross-org isolation denies `folder` (read) at every depth level | P0 | Not Tested | Org A and Org B each have an independent 3+ level folder chain | 1. As an Org B user, attempt to read each folder in Org A's chain, one per depth level. | Denied at every level, not just the root |
| NFD-18.2 | Cross-org isolation denies `updateFolder` at every depth level | P0 | Not Tested | Org A and Org B each have an independent 3+ level folder chain | 1. As an Org B user, attempt to update each folder in Org A's chain, one per depth level. | Denied at every level, not just the root |
| NFD-18.3 | Cross-org isolation denies `deleteFolder` at every depth level | P0 | Not Tested | Org A and Org B each have an independent 3+ level folder chain | 1. As an Org B user, attempt to delete each folder in Org A's chain, one per depth level. | Denied at every level, not just the root |
| NFD-19.1 | Cross-org `moveFolder` is rejected at every depth level | P0 | Not Tested | Org A has an independent 3+ level folder chain; Org B has a folder | 1. As an Org B user, attempt `moveFolder` for each folder in Org A's chain, one per depth level, as source (destination is Org B's folder). | Rejected at every level — swept by depth to match NFD-18.x/20/21.x, since a deeply-nested source isn't guaranteed to be denied the same way as a root-adjacent one if any part of the check walks the ancestor chain |
| NFD-19.2 | Cross-org `moveFolders` (bulk) is rejected at every depth level | P0 | Not Tested | Org A has an independent 3+ level folder chain; Org B has a folder | 1. As an Org B user, attempt `moveFolders` for each folder in Org A's chain, one per depth level, as source (destination is Org B's folder). | Rejected at every level — swept by depth, same reason as NFD-19.1 |
| NFD-20 | Cross-org `createFolder` is rejected at every depth level | P0 | Not Tested | Org A has an independent 3+ level folder chain; Org B is a separate isolated org | 1. As an Org B user, attempt `createFolder` with `parentId` set to each folder in Org A's chain, one per depth level. | Rejected at every level — without this case nothing proves Org B can't attach a new folder as a child inside Org A's tree at any depth, which would be a structural breach worse than a denied read. Swept by depth to match NFD-18.x, since a deeply-nested target isn't guaranteed to be denied the same way as a root-adjacent one if any part of the check walks the ancestor chain |
| NFD-21.1 | Cross-org ACE grant (`addACEsToResources`) is rejected at every depth level | P0 | Not Tested | Org A has an independent 3+ level folder chain; Org B is a separate isolated org, with its own permission set | 1. As an Org B user, attempt `addACEsToResources` against each folder in Org A's chain, one per depth level, granting an Org B user access. | Rejected at every level — the sharpest gap in this section: if this succeeded, Org B could grant itself permanent access to Org A's data, bypassing every other isolation check here |
| NFD-21.2 | Cross-org ACE revoke (`removeACEsFromResources`) is rejected at every depth level | P0 | Not Tested | Org A has an independent 3+ level folder chain, with an ACE granted to an Org A user at each level; Org B is a separate isolated org | 1. As an Org B user, attempt `removeACEsFromResources` against the ACE on each folder in Org A's chain, one per depth level. | Rejected at every level — split from NFD-21.1 for the same reason as the other cross-org action splits: grant and revoke are independent code paths, and a masked failure in either is the exact "Org B can now touch Org A's data" scenario this section exists to catch |

### Finding filed content at depth

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-22 | TDO filed at a leaf folder is visible via ancestor chain at every level | P2 | Not Tested | Org A has chain Root → L1 → L2 (leaf); a TDO exists | 1. File the TDO into L2.<br>2. Query the TDO's ancestor-chain field.<br>3. Confirm Root, L1, L2 all appear. | TDO appears correctly at every ancestor level |
| NFD-23 | A TDO can only be filed into 1 folder - filing into a second folder is rejected | P0 | Not Tested | Org A has folders F1 (depth 2) and F2 (depth 4); a TDO is filed into F1 | 1. Attempt to file the same TDO into F2 (a second folder).<br>2. Confirm the TDO is still only filed in F1, not F2. | Rejected (`"already been filed elsewhere"`) — confirmed via source trace: `fileTemporalDataObject` always enforces single-parent for TDOs in both the V1 and V2 code paths (`dalFolder.js:2238` → `dalFolderV2.js:433`, `fileFolderItem(..., allowMultipleParents=false)` hardcoded, no way to override from this mutation). `allowMultipleParents=true` is only ever passed from two internal callers — `dal/package.js:5266` (package output auto-filing) and `dal/dalApplication.js:1265` (the `fileApplication` mutation) — never from `fileTemporalDataObject`, so the VE-27880 "object filed in 2+ folders" scenario for a TDO is not reachable through the public API this suite exercises |
| NFD-24.1 | TDO parent-folder lookup works | P1 | Not Tested | Org A has one folder with a TDO filed into it | 1. Query the parent folder for the TDO. | Resolves correctly, not regressed by the VE-27880 change |
| NFD-24.2 | Watchlist parent-folder lookup works | P1 | Not Tested | Org A has one folder with a watchlist filed into it | 1. Query the parent folder for the watchlist. | Resolves correctly, not regressed by the VE-27880 change |
| NFD-24.3 | Collection parent-folder lookup works | P1 | Not Tested | Org A has one folder with a collection filed into it | 1. Query the parent folder for the collection. | Resolves correctly, not regressed by the VE-27880 change — split from a combined TDO/watchlist/collection/application test, same masking reason as the other combined-test splits. The application case is dropped rather than split out as a 4th sub-case: `Application` has no reverse `folder`/`folders` field in the schema, so there's no object-side parent-folder lookup to test for it; filing coverage for Application is instead handled from the folder side by NFD-25.3 (`childApplications`) |
| NFD-25.1 | `childCollections` returns correctly at depth | P2 | Not Tested | Org A has a deeply nested folder (3+ levels) with a collection filed into it | 1. Query `childCollections` on that folder. | Returns the filed collection correctly, no unexpected auth gap |
| NFD-25.2 | `childWatchlists` returns correctly at depth | P2 | Not Tested | Org A has a deeply nested folder (3+ levels) with a watchlist filed into it | 1. Query `childWatchlists` on that folder. | Returns the filed watchlist correctly, no unexpected auth gap |
| NFD-25.3 | `childApplications` returns correctly at depth | P2 | Not Tested | Org A has a deeply nested folder (3+ levels) with an application filed into it via `fileApplication` | 1. Query `childApplications` on that folder. | Returns the filed application correctly — strengthened from a placeholder `toBeDefined()` check: `fileApplication` (`dalApplication.js:1265`) is the one mutation in this schema that actually supports filing an object into a folder (`allowMultipleParents: true`), so this can now assert real content instead of just "the field resolves" |

### Misc nesting-dependent behavior

| ID | Title | Priority | Status | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|---|
| NFD-26 | Deleting a folder with content/descendants still filed is rejected | P2 | Not Tested | Org A has a nested folder with a child folder and a filed TDO still present | 1. Attempt `deleteFolder` on the parent while the child folder/TDO still exists. | Rejected; record the exact error text |
| NFD-27 | Deleting a folder succeeds once it's actually empty | P2 | Not Tested | Org A has a nested folder with a child folder and a filed TDO, same as NFD-26 | 1. Delete the filed TDO and the child folder first, so the parent is genuinely empty.<br>2. Attempt `deleteFolder` on the (now-empty) parent. | Succeeds — the mirror of NFD-26: without this case, nothing proves `deleteFolder` actually works at depth once its blocking condition is cleared, only that the block itself fires |
| NFD-28.1 | Watchlist read succeeds identically at depth vs. at root | P2 | Not Tested | Shared fixture (`beforeAll`): Org A has a deeply nested leaf folder (3+ levels) and a root-level folder, each with its own watchlist filed into it | 1. Query the deep watchlist by id.<br>2. Query the root watchlist by id. | Both resolve correctly, no unexpected auth gap |
| NFD-28.2 | `updateWatchlist` succeeds identically at depth vs. at root | P2 | Not Tested | Same shared fixture as NFD-28.1 | 1. Update the deep watchlist's name.<br>2. Update the root watchlist's name. | Both updates succeed — split from a combined read+folder-lookup test into `.1`/`.2` (read/update), restructured with `beforeAll`/`afterAll` instead of the shared-`let`-variables pattern used by NFD-9–12 so the fixture dependency is structural rather than ordering-dependent. Folder-lookup was dropped as redundant with NFD-24.2/NFD-25.2; `updateWatchlist` is new — everything else tested for watchlists in this plan is read-only, so this is the first case proving a write isn't depth-sensitive either |

**Prerequisite**: none of the depth-dependent cases above can be authored efficiently without a
reusable N-deep folder chain builder (see "How we'll test it," step 1) — no such helper exists in
`citest/tools/graphql-api/src/` today.

## Done when

- Every P0/P1 case above has a recorded pass/fail.
- Someone with authority has actually answered the three questions at the top — not left them
  implicit.
- NFD-18.1/18.2/18.3/19.1/19.2/20/21.1/21.2 pass on a PubSec-representative environment before we touch any of the 5 real target
  orgs.

## Details (for whoever implements the tests)

Exact function names, error messages, config keys, migration files, and commit references live in
the git history for `dal/dalFolder.js` / `dal/dalFolderV2.js` /
`flyway/db/media_platform/sql/V2_28__v2_folder_tables.sql` / commit `3fa8e02b7b` (VE-27880). Kept
out of this doc on purpose so it stays a plan, not a code dump.
