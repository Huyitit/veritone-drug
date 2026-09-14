# Engineering Report & Progression Guide: Virtual Folder Hierarchy Mutations

**Author:** Senior Software Engineer  
**Scope:** Core Folder Lifecycle & Hierarchy Operations ([folder_mutations_report.md:L52-L152](file:///home/huycao/Coding/Examples/mutations/folder_mutations_report.md#L52-L152))  
**Target API:** Veritone aiWARE GraphQL API  
**Referenced Operations:** `createRootFolders`, `createFolder`, `updateFolder`, `moveFolder`, `moveFolders`, `deleteFolder`

---

## Executive Summary

In enterprise multi-tenant architectures like Veritone aiWARE, virtual folder hierarchies serve as the organizational backbone for digital asset management (DAM), temporal data objects (TDOs), continuous intelligence watchlists, and applications. Rather than using physical POSIX storage paths, aiWARE employs an acyclic graph of virtual folder entities anchored by designated root nodes per domain partition (`cms`, `watchlist`, etc.).

Lines 52–152 of `folder_mutations_report.md` delineate **Category A: Direct Folder Lifecycle & Hierarchy Operations**, comprising **6 fundamental mutations**:
1. [`createRootFolders`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L252) — Bootstraps tenant-level root folder anchors.
2. [`createFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1674) — Instantiates child folders within the virtual tree.
3. [`updateFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L56) — In-place modification of folder names and metadata.
4. [`moveFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L74) — Concurrency-controlled single-folder relocation with optimistic locking.
5. [`moveFolders`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L94) — High-throughput batch folder migration with partial-success semantics.
6. [`deleteFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L122) — Destructive removal with sibling sequence rebalancing.

This report delivers a deep technical breakdown of these 6 operations, evaluates all operational states and edge cases, and prescribes an **end-to-end operational progression** to interact with them safely, deterministically, and idempotently in production.

---

## 1. Deep Architectural Analysis of the 6 Mutations

```
               ┌────────────────────────────────────────────────────────┐
               │         1. createRootFolders (Tenant Anchor)           │
               │         rootFolderType: watchlist | cms                │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │            2. createFolder (Tree Expansion)            │
               │         parentId: <RootID> | <ParentFolderID>          │
               └───────────────┬───────────────────────┬────────────────┘
                               │                       │
                               ▼                       ▼
   ┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
   │       3. updateFolder (In-Place)       │ │     4. moveFolder (Single Relocate)    │
   │       id, name, metadata               │ │     folderId, fromFolderId, toFolderId │
   └────────────────────────────────────────┘ └───────────────────┬────────────────────┘
                                                                  │
                                                                  ▼
                                              ┌────────────────────────────────────────┐
                                              │      5. moveFolders (Bulk Relocate)    │
                                              │      folderIds[], newParentFolderId    │
                                              └───────────────────┬────────────────────┘
                                                                  │
                                                                  ▼
                                              ┌────────────────────────────────────────┐
                                              │       6. deleteFolder (Destruction)    │
                                              │       id, orderIndex                   │
                                              └────────────────────────────────────────┘
```

### 1.1. `createRootFolders`
* **Signature:** `createRootFolders(rootFolderType: RootFolderType = watchlist): [Folder]`
* **Location:** [mutations_part2.html:L252](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L252) (Local #21, Global #141)
* **Architectural Purpose:** Initializes organizational root namespaces. Unlike standard file systems where root `/` is immutable and singular, aiWARE segregates hierarchies by domain partitions via the `RootFolderType` enum (`watchlist`, `cms`).
* **Key Design Characteristics:**
  - Returns an array `[Folder]` containing IDs and `rootFolderTypeId`.
  - Scoped strictly to the active tenant organization context (resolved from user session/JWT or `switchOrg`).
  - Idempotency & Initialization: Serves as the precondition for all subsequent hierarchical folder and content filing operations.

### 1.2. `createFolder`
* **Signature:** `createFolder(input: CreateFolder): Folder`
* **Location:** [mutations_part1.html:L1674](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1674) (Local #119, Global #119)
* **Architectural Purpose:** Creates a node in the virtual directory DAG.
* **Key Design Characteristics:**
  - Requires `parentId` referencing either an existing root folder or an existing intermediate folder.
  - Takes `rootFolderType` (e.g., `cms`, `watchlist`) to enforce domain partitioning consistency.
  - Optional `description` field for operational metadata.
  - Emits node identifiers used by downstream entity filing (`fileTemporalDataObject`, `fileWatchlist`, etc.).

### 1.3. `updateFolder`
* **Signature:** `updateFolder(input: UpdateFolder): Folder`
* **Location:** [mutations_part2.html:L56](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L56) (Local #3, Global #123)
* **Architectural Purpose:** In-place mutation of folder name and attributes without altering tree topology.
* **Key Design Characteristics:**
  - Decoupled from structural movement: Does NOT alter parentage (`parentId` is immutable via `updateFolder`; tree modifications must go through `moveFolder`/`moveFolders`).
  - Minimal payload response (returns modified `Folder` fields).

### 1.4. `moveFolder`
* **Signature:** `moveFolder(input: MoveFolder): Folder`
* **Location:** [mutations_part2.html:L74](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L74) (Local #4, Global #124)
* **Architectural Purpose:** Single-node relocation within the directory tree.
* **Key Design Characteristics:**
  - **Explicit Optimistic Concurrency Control:** Notice the input schema requires three explicit IDs:
    ```graphql
    input MoveFolder {
      folderId: ID!
      fromFolderId: ID!
      toFolderId: ID!
    }
    ```
    Requiring `fromFolderId` is a senior architectural safeguard. If client A attempts to move folder X from parent A to parent B while client B concurrently moved folder X to parent C, the server detects the precondition mismatch (`fromFolderId != currentParentId`) and rejects the stale write.
  - Cycle detection: Enforces tree acyclicity (preventing an ancestor from being moved into its own subtree).

### 1.5. `moveFolders`
* **Signature:** `moveFolders(input: MoveFolders): MoveFoldersPayload`
* **Location:** [mutations_part2.html:L94](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L94) (Local #5, Global #125)
* **Architectural Purpose:** High-throughput batch relocation of multiple folders into a designated destination parent.
* **Key Design Characteristics:**
  - **Non-Atomic Partial-Success Semantics:** Rather than rolling back the entire batch upon encountering a single invalid node, the API returns a structured result:
    ```graphql
    type MoveFoldersPayload {
      organizationId: ID
      newParentFolderId: ID
      validFolderIds: [ID!]
      invalidFolderIds: [ID!]
      message: String
    }
    ```
  - Takes `rootFolderType` to validate boundary rules across the bulk set.
  - Reduces round-trip latency when reorganizing large workspace structures.

### 1.6. `deleteFolder`
* **Signature:** `deleteFolder(input: DeleteFolder): DeletePayload`
* **Location:** [mutations_part2.html:L122](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L122) (Local #6, Global #126)
* **Architectural Purpose:** Deletion of a folder node.
* **Key Design Characteristics:**
  - Requires `id` and `orderIndex`.
  - The inclusion of `orderIndex` reflects index-based sibling rebalancing: deleting an element at index $K$ triggers sibling shifting among remaining child folders.
  - Returns `DeletePayload` containing status and confirmation message.

---

## 2. Comprehensive Matrix of Operational Cases & Edge Conditions

To build resilient client applications, the engineering team must account for all operational states, boundaries, and failure modes across these 6 mutations:

| Mutation | Case ID | Scenario Description | Expected Outcome / Error Mode | Mitigation / Best Practice |
| :--- | :---: | :--- | :--- | :--- |
| **`createRootFolders`** | **CR-1** | Initial tenant bootstrap (`rootFolderType: watchlist` or `cms`) | `200 OK`, returns array of root `Folder` objects with IDs and `rootFolderTypeId` | Cache root IDs in application session context. |
| | **CR-2** | Invocation with default parameter (no argument provided) | Defaults to `watchlist`, returns default root folders | Always specify explicit `rootFolderType` in automated pipelines to prevent domain ambiguity. |
| | **CR-3** | Idempotent re-run on already initialized tenant | Returns existing root folders without creating duplicate entries | Safe to use as a pre-flight sanity check before bootstrapping workspace trees. |
| | **CR-4** | Execution under invalid/unauthorized tenant token | Auth / Organization context error (`FORBIDDEN` / `UNAUTHORIZED`) | Verify active tenant organization context before triggering root provisioning. |
| **`createFolder`** | **CF-1** | Standard child folder creation under root | Returns new `Folder` with generated UUID and `parentId` = root ID | Inspect returned `id` and store in local tree graph. |
| | **CF-2** | Deeply nested hierarchy creation ($N$-level subfolder) | Returns child folder linked to intermediate parent | Validate parent existence; construct parents sequentially before children. |
| | **CF-3** | Sibling name collision (same name under same parent) | Server either permits duplicate names with unique IDs or throws `CONFLICT` | Enforce client-side uniqueness validation if required by product UX. |
| | **CF-4** | Non-existent or deleted `parentId` | GraphQL validation error: parent not found / foreign key violation | Query parent using `folder(id: ...)` before initiating creation. |
| | **CF-5** | Mismatched `rootFolderType` (e.g., `cms` folder created under `watchlist` root) | Domain mismatch validation error | Ensure child `rootFolderType` strictly inherits from parent's root domain. |
| | **CF-6** | Boundary payloads (empty string name, whitespace, 255+ characters) | Schema validation error (`BAD_USER_INPUT`) | Sanitize and trim strings; validate minimum length $\ge 1$. |
| **`updateFolder`** | **UF-1** | In-place renaming | Returns updated `Folder` with mutated `name` | Re-fetch or locally patch active UI tree state. |
| | **UF-2** | Idempotent update (same name / no change) | Succeeds with no-op state modification | Avoid unnecessary network round-trips if client model has not changed. |
| | **UF-3** | Targeting non-existent `id` | `NOT_FOUND` error | Verify folder existence before issuing update. |
| | **UF-4** | Attempting to mutate structural fields (e.g., passing `parentId`) | Ignored or rejected (schema only exposes mutable metadata) | Structure changes must be routed through `moveFolder` / `moveFolders`. |
| | **UF-5** | Special characters, Unicode, emojis in name | Stored and sanitized in UTF-8 encoding | Test localization and character encoding across all client viewers. |
| **`moveFolder`** | **MF-1** | Valid single move between distinct parents | Returns `Folder` with updated `parentFolderId` = `toFolderId` | Update local DAG references. |
| | **MF-2** | Optimistic lock collision (`fromFolderId != currentParentId`) | Precondition validation failed; move rejected | Fetch latest state via `folder(id: ...)` and prompt user for conflict resolution. |
| | **MF-3** | Self-move (`folderId == toFolderId`) | Rejection: folder cannot be its own parent | Client-side guard: disable drag-and-drop onto self. |
| | **MF-4** | No-op move (`fromFolderId == toFolderId`) | Succeeds without state change or returns immediate confirmation | Discard drag-and-drop operations where source equals destination. |
| | **MF-5** | Cycle creation (moving parent into its own descendant) | Tree cycle detected; operation aborted | Perform client-side ancestor check before dispatching mutation. |
| | **MF-6** | Cross-domain move (moving `cms` folder into `watchlist` tree) | Cross-domain migration blocked | Validate `rootFolderType` parity between source and destination. |
| **`moveFolders`** | **BF-1** | Homogeneous valid batch move | `validFolderIds` contains all IDs, `invalidFolderIds` is empty, success message returned | Batch UI update across all selected nodes. |
| | **BF-2** | Partial failure (some valid, some non-existent or conflicting) | Valid nodes moved; invalid nodes listed in `invalidFolderIds`; partial success message | Parse `invalidFolderIds`, maintain partial success in UI, notify user of failed items. |
| | **BF-3** | Empty batch array (`folderIds: []`) | No-op success or validation warning | Short-circuit client request if selection array is empty. |
| | **BF-4** | Destination folder included in batch list (`newParentFolderId ∈ folderIds`) | Target folder flagged in `invalidFolderIds`; valid siblings processed | Filter out `newParentFolderId` from `folderIds` prior to submission. |
| | **BF-5** | Large batch size (e.g., 500+ folders) | Latency spike or gateway timeout | Chunk bulk migrations into batches of $\le 50$ folders. |
| **`deleteFolder`** | **DF-1** | Deletion of empty leaf folder with valid `orderIndex` | Returns `DeletePayload` with confirmation | Remove node from client cache; decrement parent's `childFoldersCount`. |
| | **DF-2** | Deletion of non-empty folder containing child subfolders | System either cascades deletion or rejects with "folder not empty" | Query `folderOverview` first. If restricted, prompt user or prune children bottom-up. |
| | **DF-3** | Deletion of folder containing filed media/watchlists | Media objects remain intact in platform; folder association removed (or deletion blocked) | Audit filed assets via `folderSummaryDetails` before triggering deletion. |
| | **DF-4** | Mismatched / Stale `orderIndex` | Rejection or index mismatch error | Query latest sibling order before issuing delete. |
| | **DF-5** | Deletion of root folder initialized by `createRootFolders` | System privilege / policy violation (root nodes protected) | Restrict UI deletion action on any node where `isRoot == true`. |
| | **DF-6** | Double deletion / targeting already deleted folder | `NOT_FOUND` error | Handle 404 gracefully in idempotent deletion handlers. |

---

## 3. Recommended Operational Progression

To interact with these mutations reliably in an automated pipeline, test suite, or user interface, implement the following **6-Phase Progressive Flow**. Each phase incorporates read-side query verification ([queries_part1.html:L1169-L1376](file:///home/huycao/Coding/Examples/queries_part1.html#L1169)) to guarantee consistency.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: BOOTSTRAP & ROOT INITIALIZATION                                               │
│   1. Query rootFolders(type: cms)                                                      │
│   2. If empty -> Execute createRootFolders(rootFolderType: cms)                        │
│   3. Capture ROOT_ID                                                                   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: TREE CONSTRUCTION & EXPANSION                                                 │
│   1. Execute createFolder(parentId: ROOT_ID, name: "Raw Footage")      -> FOLDER_A     │
│   2. Execute createFolder(parentId: ROOT_ID, name: "Staging")          -> FOLDER_B     │
│   3. Execute createFolder(parentId: FOLDER_A, name: "Sub-Batch 1")     -> FOLDER_A1    │
│   4. Execute createFolder(parentId: FOLDER_A, name: "Sub-Batch 2")     -> FOLDER_A2    │
│   5. Verify via folder(id: FOLDER_A) { childFolders { records { id } } }               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: IN-PLACE MAINTENANCE & METADATA EVOLUTION                                     │
│   1. Execute updateFolder(id: FOLDER_A2, name: "Sub-Batch 2 - Archived")               │
│   2. Verify name change via folder(id: FOLDER_A2)                                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: CONCURRENCY-SAFE SINGLE RELOCATION                                            │
│   1. Query current parent of FOLDER_A1 (confirm parent == FOLDER_A)                    │
│   2. Execute moveFolder(folderId: FOLDER_A1, fromFolderId: FOLDER_A, toFolderId: FOLDER_B)
│   3. Verify FOLDER_A1.parentFolderId == FOLDER_B                                       │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: BULK MIGRATION & REBALANCING                                                  │
│   1. Collect candidate IDs [FOLDER_A2, ...]                                            │
│   2. Execute moveFolders(folderIds: [...], newParentFolderId: FOLDER_B, rootFolderType: cms)
│   3. Evaluate validFolderIds vs invalidFolderIds in MoveFoldersPayload                 │
│   4. Reconcile any invalid items                                                       │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: DESTRUCTION & HIERARCHY PRUNING                                               │
│   1. Query folderOverview(ids: [FOLDER_A1]) to check child counts                      │
│   2. Execute deleteFolder(id: FOLDER_A1, orderIndex: 1)                                │
│   3. Execute deleteFolder(id: FOLDER_B, orderIndex: 1)                                 │
│   4. Confirm deletion via folder(id: FOLDER_A1) -> null / NOT_FOUND                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. End-to-End Implementation Script & GraphQL Evidence

Below is the complete GraphQL progression with concrete requests, payload structures, and verification queries.

### Phase 1: Bootstrap & Root Discovery

Before creating custom folders, discover or provision the root partition.

#### Step 1.1: Discover Existing Root Folders (Pre-check Query)
```graphql
query CheckRootFolders {
  rootFolders(type: cms) {
    id
    typeId
    rootFolderTypeId
    name
  }
}
```

#### Step 1.2: Initialize Root Folders (Mutation)
If no root exists for the organization in the required domain:
```graphql
mutation BootstrapRootFolders {
  createRootFolders(rootFolderType: cms) {
    id
    rootFolderTypeId
    name
  }
}
```
*Expected Response:*
```json
{
  "data": {
    "createRootFolders": [
      {
        "id": "2ac28573-917a-4c4b-be91-a0ac64cbc982",
        "rootFolderTypeId": 1,
        "name": "Root CMS"
      }
    ]
  }
}
```
*Record Anchor:* `ROOT_ID = "2ac28573-917a-4c4b-be91-a0ac64cbc982"`

---

### Phase 2: Tree Construction & Hierarchy Expansion

Build a multi-tier hierarchy: 2 top-level folders under root, plus 2 child folders under the first folder.

#### Step 2.1: Create Primary Top-Level Folders
```graphql
mutation CreateWorkspaceFolders {
  folderA: createFolder(input: {
    name: "Raw Footage",
    description: "Inbound unedited media streams",
    parentId: "2ac28573-917a-4c4b-be91-a0ac64cbc982",
    rootFolderType: cms
  }) {
    id
    name
    parentFolderId
  }

  folderB: createFolder(input: {
    name: "Staging Pipeline",
    description: "Media undergoing engine analysis",
    parentId: "2ac28573-917a-4c4b-be91-a0ac64cbc982",
    rootFolderType: cms
  }) {
    id
    name
    parentFolderId
  }
}
```
*Recorded Identifiers:*
- `FOLDER_A = "68a5833a-f573-41fe-840a-adb5f6888e2d"`
- `FOLDER_B = "ad7839a7-d088-4202-9db1-5ed4992f915d"`

#### Step 2.2: Create Sub-Folders under Folder A
```graphql
mutation CreateSubFolders {
  sub1: createFolder(input: {
    name: "Camera-Unit-01",
    description: "Daily ingest batch 1",
    parentId: "68a5833a-f573-41fe-840a-adb5f6888e2d",
    rootFolderType: cms
  }) {
    id
    name
  }

  sub2: createFolder(input: {
    name: "Camera-Unit-02",
    description: "Daily ingest batch 2",
    parentId: "68a5833a-f573-41fe-840a-adb5f6888e2d",
    rootFolderType: cms
  }) {
    id
    name
  }
}
```
*Recorded Identifiers:*
- `SUB_A1 = "0c4c2765-1817-40a7-bd6d-bf6362a384ba"`
- `SUB_A2 = "183f64e7-d519-4948-99d9-977657cce0c8"`

#### Step 2.3: Verification Query (Hierarchy Traversal)
```graphql
query VerifyHierarchy {
  folder(id: "68a5833a-f573-41fe-840a-adb5f6888e2d") {
    id
    name
    childFolders {
      records {
        id
        name
      }
    }
  }
}
```

---

### Phase 3: In-Place Mutation (Renaming & Metadata)

Update folder attributes without touching tree topology.

#### Step 3.1: Execute In-Place Rename
```graphql
mutation RenameSubFolder {
  updateFolder(input: {
    id: "0c4c2765-1817-40a7-bd6d-bf6362a384ba",
    name: "Camera-Unit-01 [Priority Ingest]"
  }) {
    id
    name
  }
}
```

#### Step 3.2: Verify In-Place Update
```graphql
query VerifyRename {
  folder(id: "0c4c2765-1817-40a7-bd6d-bf6362a384ba") {
    id
    name
    parentFolderId
  }
}
```
*Expected Result:* `name` is updated; `parentFolderId` remains `"68a5833a-f573-41fe-840a-adb5f6888e2d"`.

---

### Phase 4: Single-Folder Concurrency-Safe Relocation

Move `SUB_A1` from `FOLDER_A` into `FOLDER_B`.

#### Step 4.1: Execute `moveFolder` with Optimistic Locking
```graphql
mutation MoveSingleFolderSafely {
  moveFolder(input: {
    folderId: "0c4c2765-1817-40a7-bd6d-bf6362a384ba",
    fromFolderId: "68a5833a-f573-41fe-840a-adb5f6888e2d",
    toFolderId: "ad7839a7-d088-4202-9db1-5ed4992f915d"
  }) {
    id
    name
    parentFolderId
  }
}
```
*Expected Response:*
```json
{
  "data": {
    "moveFolder": {
      "id": "0c4c2765-1817-40a7-bd6d-bf6362a384ba",
      "name": "Camera-Unit-01 [Priority Ingest]",
      "parentFolderId": "ad7839a7-d088-4202-9db1-5ed4992f915d"
    }
  }
}
```

*Concurrency Edge Case Note:* If another process has moved `SUB_A1` to a different parent in the interim, the mutation fails immediately because `fromFolderId` does not match the live database state.

---

### Phase 5: High-Throughput Bulk Relocation

Relocate multiple folders simultaneously using `moveFolders`.

#### Step 5.1: Execute `moveFolders`
Suppose we have `SUB_A2` and another folder `SUB_A3` that need to be moved to `FOLDER_B`:
```graphql
mutation BulkMigrateFolders {
  moveFolders(input: {
    folderIds: [
      "183f64e7-d519-4948-99d9-977657cce0c8",
      "d551fbd6-7354-4b0e-abfb-654ab8583be2"
    ],
    newParentFolderId: "ad7839a7-d088-4202-9db1-5ed4992f915d",
    rootFolderType: cms
  }) {
    organizationId
    newParentFolderId
    validFolderIds
    invalidFolderIds
    message
  }
}
```

#### Step 5.2: Handle Response Payload & Partial Success
```json
{
  "data": {
    "moveFolders": {
      "organizationId": "7682",
      "newParentFolderId": "ad7839a7-d088-4202-9db1-5ed4992f915d",
      "validFolderIds": [
        "183f64e7-d519-4948-99d9-977657cce0c8"
      ],
      "invalidFolderIds": [
        "d551fbd6-7354-4b0e-abfb-654ab8583be2"
      ],
      "message": "Partially moved input folders to the parent folder."
    }
  }
}
```
*Client Handling Logic:*
```typescript
if (payload.invalidFolderIds && payload.invalidFolderIds.length > 0) {
  logger.warn('Bulk move encountered invalid folders:', payload.invalidFolderIds);
  // Re-sync failed nodes with remote state
  await syncFolderNodes(payload.invalidFolderIds);
}
// Optimistically update validFolderIds in UI tree
treeState.reparentNodes(payload.validFolderIds, payload.newParentFolderId);
```

---

### Phase 6: Destruction & Hierarchy Pruning

Cleanly decommission folders without leaving dangling child references.

#### Step 6.1: Pre-Deletion Inspection Query
Check child folders and non-folder objects (TDOs, watchlists) before deletion:
```graphql
query CheckFolderContents {
  folderOverview(ids: ["0c4c2765-1817-40a7-bd6d-bf6362a384ba"]) {
    childFoldersCount
    childNonFolderObjectsCount
  }
}
```

#### Step 6.2: Execute Leaf Folder Deletion
Once confirmed that `childFoldersCount == 0` (or after relocating children):
```graphql
mutation DeleteLeafFolder {
  deleteFolder(input: {
    id: "0c4c2765-1817-40a7-bd6d-bf6362a384ba",
    orderIndex: 1
  }) {
    message
  }
}
```

#### Step 6.3: Post-Deletion Verification Query
```graphql
query VerifyDeletion {
  folder(id: "0c4c2765-1817-40a7-bd6d-bf6362a384ba") {
    id
  }
}
```
*Expected Result:* The folder returns `null` or produces a `NOT_FOUND` GraphQL error, confirming termination.

---

## 5. Senior Engineering Architecture Recommendations

1. **Tree Acyclicity (Cycle Prevention):**
   Prior to dispatching `moveFolder` or `moveFolders`, perform a client-side DAG check: ensure `toFolderId` is neither equal to `folderId` nor present in `folderId`'s downstream subtree. While the server enforces cycle validation, catching this on the client eliminates needless network round-trips.

2. **Optimistic Locking Enforcement:**
   Always preserve the `parentFolderId` alongside folder entities in the client state cache. Never supply a hardcoded or guessed `fromFolderId` to `moveFolder`; always use the verified current parent ID. If `moveFolder` throws a concurrency mismatch, invalidate the local cache and re-fetch the subtree via `folder(id: ...)`.

3. **Batch Partitioning:**
   When using `moveFolders`, cap the batch size at **50 items** per mutation invocation. Large bulk relocations can introduce lock contention on parent directory nodes. Furthermore, always inspect `invalidFolderIds` to handle non-atomic partial completions.

4. **Deletion Hygiene & Content Preservation:**
   Because virtual folders host associations to platform assets (`fileTemporalDataObject`, `fileWatchlist`), deleting a folder must be preceded by a call to `folderOverview` or `folderSummaryDetails`. Determine whether filed media should be unfiled via `unfileTemporalDataObject` or moved to an archive parent before invoking `deleteFolder`.

5. **Root Node Immutability:**
   Never expose `deleteFolder` on nodes returned by `createRootFolders`. Root folders represent organization-level top-level namespaces; attempting to delete them typically triggers authorization errors or breaks filing cascades across downstream services.

---

## 6. Document Reference & Links
- Source Mutations Report: [folder_mutations_report.md](file:///home/huycao/Coding/Examples/mutations/folder_mutations_report.md)
- Primary GraphQL Spec Partition: [mutations_part2.html](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html)
- Secondary Creation Partition: [mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html)
- Read-Side Queries: [queries_part1.html](file:///home/huycao/Coding/Examples/queries_part1.html)
- Context Mirror: [.agents/contexts/folder_mutations.md](file:///home/huycao/Coding/Examples/.agents/contexts/folder_mutations.md)
