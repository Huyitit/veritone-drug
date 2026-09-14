# Load Testing Scenarios: Virtual Folder Hierarchy GraphQL Operations

This document establishes the official performance and load testing scenarios for the Veritone aiWARE Virtual Folder Hierarchy GraphQL API, adhering to the standard specification in [.agents/rules/api-test-case-format.md](file:///home/huycao/Coding/Examples/.agents/rules/api-test-case-format.md) and contextual operational models in [.agents/contexts/folder_lifecycle_progression_report.md](file:///home/huycao/Coding/Examples/.agents/contexts/folder_lifecycle_progression_report.md).

These scenarios define the Virtual User (VU) load profiles, concurrency models, operational steps, pacing, and SLA/SLO thresholds to be executed by **k6**.

---

## Performance Thresholds & Global Service Level Objectives (SLOs)

All scenarios evaluate the following baseline thresholds:
- **`http_req_duration` (Latency):**
  - Smoke: `p(95) < 1000ms`, `p(99) < 2000ms`
  - Load: `p(95) < 1500ms`, `p(99) < 3000ms`
  - Stress: `p(95) < 2500ms`, `p(99) < 5000ms`
- **`http_req_failed` (HTTP Errors):** `rate < 0.01` (< 1% error rate)
- **`checks` (GraphQL & Schema Assertions):** `rate > 0.99` (> 99% pass rate)
- **`graphql_error_rate`:** `rate < 0.01` (< 1% GraphQL business error rate)

---

## Scenario 1: Realistic End-to-End Lifecycle Progression

### Test Case: TC_LT_01 - Full Folder Lifecycle Multi-VU User Journey
**Priority:** High | **Type:** E2E

**Load Profile:**
- **Executor:** Ramping VUs (`ramping-vus`)
- **Stages:**
  - Ramp-up: 0 to 10 VUs over 30s
  - Steady State: 10 VUs sustained for 1m
  - Ramp-down: 10 to 0 VUs over 15s
- **Pacing:** 500ms - 1000ms sleep between workflow steps per VU

**Pre-conditions:**
- Valid tenant authentication token `{{AUTH_TOKEN}}` obtained via `USER_LOGIN` in k6 `setup()`.
- CMS root folder anchor `{{ROOT_CMS_ID}}` verified or initialized via `CHECK_ROOT_FOLDERS` / `CREATE_ROOT_FOLDERS`.
- Unique run identifier `{{RUN_ID}}` generated for the test session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Create primary top-level folders A and B under CMS root | Mutation: `CREATE_FOLDER`<br>Inputs: `name: "k6-run-{{RUN_ID}}-vu{{VU}}-A"`, `parentId: "{{ROOT_CMS_ID}}"`, `rootFolderType: cms` (repeat for Folder B) | HTTP 200. Both folders returned with valid UUIDs `{{FOLDER_A_ID}}`, `{{FOLDER_B_ID}}`, `parentFolderId == {{ROOT_CMS_ID}}`. Response time p95 < 1200ms. |
| 2 | Create nested child sub-folders 1 and 2 under Folder A | Mutation: `CREATE_FOLDER`<br>Inputs: `name: "Sub-1"`, `parentId: "{{FOLDER_A_ID}}"`, `rootFolderType: cms` (repeat for Sub-2) | HTTP 200. Both sub-folders returned with valid UUIDs `{{SUB_1_ID}}`, `{{SUB_2_ID}}`. Parent linkage verified. |
| 3 | Perform in-place metadata update on Sub-Folder 2 | Mutation: `UPDATE_FOLDER`<br>Inputs: `id: "{{SUB_2_ID}}"`, `name: "Sub-2-Archived"` | HTTP 200. Updated folder object returned with `name == "Sub-2-Archived"`. |
| 4 | Relocate Sub-Folder 1 from Folder A to Folder B with OCC | Mutation: `MOVE_FOLDER`<br>Inputs: `folderId: "{{SUB_1_ID}}"`, `fromFolderId: "{{FOLDER_A_ID}}"`, `toFolderId: "{{FOLDER_B_ID}}"` | HTTP 200. Sub-Folder 1 relocated; response confirms `parentFolderId == {{FOLDER_B_ID}}`. |
| 5 | Perform bulk migration of remaining child nodes | Mutation: `MOVE_FOLDERS`<br>Inputs: `folderIds: ["{{SUB_2_ID}}"]`, `newParentFolderId: "{{FOLDER_B_ID}}"`, `rootFolderType: cms` | HTTP 200. Returns `MoveFoldersPayload` with `validFolderIds` containing `{{SUB_2_ID}}` and empty `invalidFolderIds`. |
| 6 | Query folder overview metrics for hierarchy validation | Query: `GET_FOLDER_OVERVIEW`<br>Inputs: `ids: ["{{FOLDER_A_ID}}", "{{FOLDER_B_ID}}"]` | HTTP 200. Folder A reports 0 child folders; Folder B reports 2 child folders. Query latency p95 < 400ms. |
| 7 | Prune and delete empty Folder A and populated Folder B | Mutation: `DELETE_FOLDER`<br>Inputs: `id: "{{FOLDER_A_ID}}"`, `orderIndex: 0` (followed by `{{FOLDER_B_ID}}`) | HTTP 200. Both deletions return confirmation message `Deleted successfully`. |

**Post-conditions:**
- Subtrees created during the iteration are deleted.
- Global `teardown()` validates 0 orphaned folders with prefix `k6-run-{{RUN_ID}}`.
- Error rate < 1%, overall p95 latency < 1500ms.

---

## Scenario 2: High-Concurrency Folder Hierarchy Creation

### Test Case: TC_LT_02 - Concurrent Multi-Tier Tree Expansion Burst
**Priority:** High | **Type:** Functional

**Load Profile:**
- **Executor:** Constant VUs (`constant-vus`)
- **Concurrency:** 20 - 50 concurrent VUs
- **Duration:** 1 minute
- **Pacing:** 100ms - 250ms sleep (aggressive write injection)

**Pre-conditions:**
- Valid tenant session `{{AUTH_TOKEN}}`.
- CMS root folder anchor `{{ROOT_CMS_ID}}`.
- Pre-allocated batch run prefix `{{RUN_ID}}`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Concurrently instantiate Tier-1 folder nodes under CMS root | Mutation: `CREATE_FOLDER`<br>Input: `name: "k6-burst-{{RUN_ID}}-{{VU}}-{{ITER}}"`, `parentId: "{{ROOT_CMS_ID}}"`, `rootFolderType: cms` | HTTP 200. Unique folder UUID created with zero primary key collisions. Latency p95 < 1000ms under 50 VUs. |
| 2 | Immediately attach child sub-folder to the newly created node | Mutation: `CREATE_FOLDER`<br>Input: `name: "Child-Node"`, `parentId: "{{NEW_FOLDER_ID}}"`, `rootFolderType: cms` | HTTP 200. Child node created with immediate read-after-write consistency. No dangling reference errors. |
| 3 | Query parent folder details to confirm child record insertion | Query: `GET_FOLDER`<br>Input: `id: "{{NEW_FOLDER_ID}}"` | HTTP 200. `folder.childFolders.records` contains newly created child node. Latency p95 < 500ms. |

**Post-conditions:**
- All created folder IDs are registered under `k6-burst-{{RUN_ID}}` prefix.
- Sustained write throughput exceeds 40 requests/sec with error rate < 1%.
- Swept during k6 `teardown()`.

---

## Scenario 3: Read-Heavy Hierarchy Traversal & Overview Queries

### Test Case: TC_LT_03 - High-Throughput Tree Traversal & Overview Query Load
**Priority:** Medium | **Type:** Functional

**Load Profile:**
- **Executor:** Ramping Arrival Rate (`ramping-arrival-rate`)
- **Target Rate:** 50 to 150 iterations/sec
- **Max VUs:** 30 VUs
- **Duration:** 2 minutes

**Pre-conditions:**
- Pre-seeded folder tree: 5 parent folders and 25 subfolders pre-created in `setup()`.
- Valid tenant token `{{AUTH_TOKEN}}`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Query root partition anchor | Query: `CHECK_ROOT_FOLDERS`<br>Input: `type: cms` | HTTP 200. Cache-optimized response returning CMS root partition. Response time p95 < 300ms. |
| 2 | Concurrently fetch folder hierarchy details | Query: `GET_FOLDER`<br>Input: `id: "{{SEEDED_FOLDER_ID}}"` | HTTP 200. Returns folder node with `childFolders.records` array populated. Latency p95 < 400ms. |
| 3 | Batch query folder overview counts across multiple IDs | Query: `GET_FOLDER_OVERVIEW`<br>Input: `ids: ["{{ID_1}}", "{{ID_2}}", "{{ID_3}}", "{{ID_4}}"]` | HTTP 200. Returns aggregated child folder counts for all requested IDs in a single batch query. Response time p95 < 500ms. |

**Post-conditions:**
- Database read replicas maintain sub-500ms response times without degradation.
- Zero cache stampede or connection pool starvation issues.
- Pre-seeded test folders are cleaned up during `teardown()`.

---

## Scenario 4: Concurrency-Controlled Folder Relocation & Bulk Migration

### Test Case: TC_LT_04 - Concurrent Relocation & Optimistic Concurrency Control (OCC)
**Priority:** High | **Type:** Functional

**Load Profile:**
- **Executor:** Constant VUs (`constant-vus`)
- **Concurrency:** 15 concurrent VUs
- **Duration:** 45 seconds
- **Pacing:** 200ms

**Pre-conditions:**
- Two dedicated destination buckets: `Bucket-Alpha` and `Bucket-Beta` provisioned under CMS root.
- 30 mobile folders created across the two buckets.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Concurrently relocate single folders between Alpha and Beta | Mutation: `MOVE_FOLDER`<br>Input: `folderId: "{{NODE_ID}}"`, `fromFolderId: "{{CURRENT_PARENT}}"`, `toFolderId: "{{TARGET_PARENT}}"` | HTTP 200. Successful relocation with atomic parent pointer update. Latency p95 < 1200ms. |
| 2 | Intentional race condition test: Submit duplicate move with stale `fromFolderId` | Mutation: `MOVE_FOLDER`<br>Input: `folderId: "{{NODE_ID}}"`, `fromFolderId: "{{OBSOLETE_PARENT}}"`, `toFolderId: "{{TARGET_PARENT}}"` | Expected GraphQL rejection (HTTP 200 with `errors` array). Optimistic lock catches stale parent mismatch. No silent corruption or orphan states. |
| 3 | Concurrently execute bulk migration of 5 folders | Mutation: `MOVE_FOLDERS`<br>Input: `folderIds: ["{{ID_1}}", "{{ID_2}}", ...]`, `newParentFolderId: "{{TARGET_PARENT}}"`, `rootFolderType: cms` | HTTP 200. Returns `validFolderIds` list with migrated IDs. Partial success semantics handled cleanly without transaction deadlock. |

**Post-conditions:**
- Directory tree acyclicity remains intact (no loops, no dangling nodes).
- OCC accurately detects concurrent write conflicts.
- Destination buckets and child nodes cleaned up in `teardown()`.

---

## Scenario 5: Batch Destruction & Hierarchy Cleanup Stress

### Test Case: TC_LT_05 - High-Throughput Folder Destruction & Rebalancing
**Priority:** Medium | **Type:** Functional

**Load Profile:**
- **Executor:** Shared Iterations (`shared-iterations`)
- **Iterations:** 100 folder deletions
- **Concurrency:** 10 VUs
- **Duration:** Max 1 minute

**Pre-conditions:**
- Batch of 100 test folders pre-generated under CMS root tagged with `k6-purge-{{RUN_ID}}-*`.
- Valid tenant token `{{AUTH_TOKEN}}`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Concurrently execute single folder deletions across VUs | Mutation: `DELETE_FOLDER`<br>Input: `id: "{{TARGET_ID}}"`, `orderIndex: 0` | HTTP 200. Returns confirmation message `Deleted successfully`. Sibling sequence rebalancing completes within SLA (p95 < 800ms). |
| 2 | Query deleted folder to verify immediate tombstoning | Query: `GET_FOLDER`<br>Input: `id: "{{TARGET_ID}}"` | HTTP 200. Returns `folder: null` or GraphQL not found error. Immediate consistency verified. |

**Post-conditions:**
- All 100 test folders destroyed from the database.
- Zero lock escalation or table-level locks observed.
- Root folder child count reflects accurate decrement.

---

## Summary of Scenarios & CLI Invocation Matrix

| Scenario ID | Test Focus | Target Operations | Default VUs | Target Duration | NPM Script / Flag |
|---|---|---|---|---|---|
| **TC_LT_01** | Full Lifecycle Progression | All 6 Lifecycle Operations | 10 VUs | 1m 45s | `npm run test:load` (Default) |
| **TC_LT_02** | Write Ingestion Burst | `createFolder` + `folder` | 20-50 VUs | 1m | `npm run test:load -- -e SCENARIO=burst` |
| **TC_LT_03** | Read-Heavy Query Load | `folder`, `folderOverview`, `rootFolders` | 30 VUs | 2m | `npm run test:load -- -e SCENARIO=read` |
| **TC_LT_04** | OCC Relocation & Bulk Move | `moveFolder`, `moveFolders` | 15 VUs | 45s | `npm run test:load -- -e SCENARIO=move` |
| **TC_LT_05** | Bulk Deletion & Destruction | `deleteFolder` | 10 VUs | 1m | `npm run test:load -- -e SCENARIO=delete` |
