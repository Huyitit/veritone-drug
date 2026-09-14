# Forward Traceability Requirements Traceability Matrix (RTM)
## Virtual Folder Hierarchy Operations (GraphQL API)

**Role:** Senior QA & API Test Architect  
**Scope:** Category A: Direct Folder Lifecycle & Hierarchy Operations

---

## Executive Summary & Coverage Metrics

This document establishes the **Forward Requirements Traceability Matrix (Forward RTM)** for the 6 core GraphQL folder hierarchy mutations specified in `.agents/contexts/folder_mutations.md` (lines 54–152):
1. `createFolder`
2. `updateFolder`
3. `moveFolder`
4. `moveFolders`
5. `deleteFolder`
6. `createRootFolders`

### Forward Traceability Definition
Forward traceability maps each functional, structural, concurrency, and security requirement directly to one or more test cases. This guarantees that:
- Every business requirement and architectural constraint has at least one validating test case.
- Zero feature requirements are left unverified or orphaned.
- All edge cases, optimistic locking safeguards, cycle prevention rules, and multi-tenant boundaries are covered.

### Overall Coverage Dashboard
- **Total Operations Analyzed:** 6
- **Total Requirements Defined:** 32
- **Total Test Cases Designed:** 34
- **Forward Requirements Coverage:** **100.0%** (All 32 requirements mapped to validating test cases)

```
┌─────────────────────────┬──────────────┬──────────────┬──────────────────┐
│ Operation Name          │ Requirements │ Test Cases   │ Coverage Ratio   │
├─────────────────────────┼──────────────┼──────────────┼──────────────────┤
│ 1. createFolder         │ 6            │ 6            │ 100% (6/6)       │
│ 2. updateFolder         │ 5            │ 5            │ 100% (5/5)       │
│ 3. moveFolder           │ 5            │ 6            │ 100% (5/5)       │
│ 4. moveFolders          │ 5            │ 6            │ 100% (5/5)       │
│ 5. deleteFolder         │ 6            │ 6            │ 100% (6/6)       │
│ 6. createRootFolders    │ 5            │ 5            │ 100% (5/5)       │
├─────────────────────────┼──────────────┼──────────────┼──────────────────┤
│ TOTAL                   │ 32           │ 34           │ 100.0%           │
└─────────────────────────┴──────────────┴──────────────┴──────────────────┘
```

---

## 1. Consolidated Forward Traceability Master Matrix

In accordance with Forward RTM standards, the table below maps each **Requirement ID (Rows)** to **Test Case IDs (Columns)** across all 6 operations.

| Requirement ID | REQ Description | TC-001 | TC-002 | TC-003 | TC-004 | TC-005 | TC-006 | Forward Coverage Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`createFolder`** | | | | | | | | |
| `REQ-CF-01` | Create child folder under root with valid inputs | **[X]** | | | | | | **Covered** |
| `REQ-CF-02` | Create multi-tier nested subfolder under child folder | | **[X]** | | | | | **Covered** |
| `REQ-CF-03` | Support all RootFolderType domains (cms, watchlist, etc.) | | | **[X]** | | | | **Covered** |
| `REQ-CF-04` | Reject missing/null mandatory `name` | | | | **[X]** | | | **Covered** |
| `REQ-CF-05` | Reject non-existent / invalid `parentId` | | | | | **[X]** | | **Covered** |
| `REQ-CF-06` | Tenant isolation: reject parentId in another tenant org | | | | | | **[X]** | **Covered** |
| **`updateFolder`** | | | | | | | | |
| `REQ-UF-01` | In-place folder rename with valid `id` & `name` | **[X]** | | | | | | **Covered** |
| `REQ-UF-02` | Preserve tree topology & hierarchy during rename | | **[X]** | | | | | **Covered** |
| `REQ-UF-03` | Reject update for non-existent / invalid folder `id` | | | **[X]** | | | | **Covered** |
| `REQ-UF-04` | Tenant boundary: prevent updating other org's folder | | | | **[X]** | | | **Covered** |
| `REQ-UF-05` | Reject missing or null required `id` | | | | | **[X]** | | **Covered** |
| **`moveFolder`** | | | | | | | | |
| `REQ-MF-01` | Relocate single folder to valid target destination | **[X]** | | | | | | **Covered** |
| `REQ-MF-02` | Enforce OCC: reject when `fromFolderId` != live parent | | **[X]** | | | | | **Covered** |
| `REQ-MF-03` | Enforce Tree Acyclicity: reject cycle / descendant move | | | **[X]** | **[X]** | | | **Covered** |
| `REQ-MF-04` | Reject relocation when `toFolderId` does not exist | | | | | **[X]** | | **Covered** |
| `REQ-MF-05` | Cross-tenant isolation: prevent move across orgs | | | | | | **[X]** | **Covered** |
| **`moveFolders`** | | | | | | | | |
| `REQ-MFS-01` | Bulk relocate multiple folders with 100% success | **[X]** | | | | | | **Covered** |
| `REQ-MFS-02` | Non-atomic partial success: segregate valid & invalid IDs | | **[X]** | | | | | **Covered** |
| `REQ-MFS-03` | Validate `rootFolderType` domain consistency in bulk | | | **[X]** | | | | **Covered** |
| `REQ-MFS-04` | Reject cycle-inducing IDs into `invalidFolderIds` | | | | **[X]** | | | **Covered** |
| `REQ-MFS-05` | Reject non-existent destination or empty folderIds array | | | | | **[X]** | **[X]** | **Covered** |
| **`deleteFolder`** | | | | | | | | |
| `REQ-DF-01` | Successfully delete empty leaf folder by `id` & `orderIndex` | **[X]** | | | | | | **Covered** |
| `REQ-DF-02` | Post-deletion verification: folder purged from hierarchy | | **[X]** | | | | | **Covered** |
| `REQ-DF-03` | Sibling sequence rebalancing upon folder removal | | | **[X]** | | | | **Covered** |
| `REQ-DF-04` | Root node immutability: prevent deletion of root anchors | | | | **[X]** | | | **Covered** |
| `REQ-DF-05` | Reject deletion of non-existent folder ID | | | | | **[X]** | | **Covered** |
| `REQ-DF-06` | Tenant isolation: prevent deleting foreign tenant folder | | | | | | **[X]** | **Covered** |
| **`createRootFolders`** | | | | | | | | |
| `REQ-CRF-01` | Bootstrap root folders for explicit `rootFolderType: cms` | **[X]** | | | | | | **Covered** |
| `REQ-CRF-02` | Default parameter behavior: defaults to `watchlist` | | **[X]** | | | | | **Covered** |
| `REQ-CRF-03` | Support all domain types (collection, app, resource) | | | **[X]** | | | | **Covered** |
| `REQ-CRF-04` | Idempotent / safe re-invocation on initialized org | | | | **[X]** | | | **Covered** |
| `REQ-CRF-05` | Tenant isolation: roots bound strictly to user's org | | | | | **[X]** | | **Covered** |

---

## 2. Operation 1: `createFolder`

### 2.1. Technical Specification
- **GraphQL Mutation Signature:** `createFolder(input: CreateFolder): Folder`
- **Input Object Fields:**
  - `name: String!` (Folder title)
  - `description: String` (Optional metadata description)
  - `parentId: ID!` (Anchor parent ID: root folder or child folder)
  - `rootFolderType: RootFolderType` (Enum: `cms`, `watchlist`, `collection`, `application`, `resource`)
- **Return Type:** `Folder { id, name, parentFolderId, rootFolderTypeId }`

### 2.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-CF-01` | Functional | Top-Level Child Creation | A folder can be created under an active root folder with valid name, description, parentId, and rootFolderType. Returns non-null `id`, matching `name`, and `parentFolderId` equal to the root ID. |
| `REQ-CF-02` | Functional / Hierarchy | Multi-Tier Subfolder Creation | A subfolder can be created under an existing intermediate child folder. Returns non-null `id`, matching `name`, and child's `parentFolderId` equal to the intermediate folder's `id`. |
| `REQ-CF-03` | Data Integrity | Domain Partition Compliance | Mutation accepts all valid `RootFolderType` values (`cms`, `watchlist`, `collection`, `application`, `resource`) per specification. |
| `REQ-CF-04` | Validation | Mandatory Name Field | Request missing `name` or supplying null/empty string fails with GraphQL validation error (`BAD_USER_INPUT` or field validation error). |
| `REQ-CF-05` | Validation | Valid Parent ID Verification | Request supplying non-existent or malformed UUID for `parentId` fails with GraphQL error. |
| `REQ-CF-06` | Security | Tenant Isolation Boundary | User cannot create a folder under a `parentId` belonging to another tenant organization. Request fails with authorization error. |

### 2.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-CF-001 | TC-CF-002 | TC-CF-003 | TC-CF-004 | TC-CF-005 | TC-CF-006 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-CF-01` | **X** | | | | | | **100% Covered** |
| `REQ-CF-02` | | **X** | | | | | **100% Covered** |
| `REQ-CF-03` | | | **X** | | | | **100% Covered** |
| `REQ-CF-04` | | | | **X** | | | **100% Covered** |
| `REQ-CF-05` | | | | | **X** | | **100% Covered** |
| `REQ-CF-06` | | | | | | **X** | **100% Covered** |

### 2.4. Detailed Test Cases

---

### Test Case: TC-CF-001 - Verify successful creation of top-level folder under root folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated user session with valid tenant organization token.
- A root folder exists for domain `cms` (retrieved via `rootFolders(type: cms)` -> `ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createFolder` mutation with valid name, description, root parentId, and rootFolderType | `input: { name: "Raw Footage", description: "Inbound unedited media streams", parentId: ROOT_CMS_ID, rootFolderType: cms }` | HTTP 200; `data.createFolder` contains non-null `id`, `name == "Raw Footage"`, and `parentFolderId == ROOT_CMS_ID`. |
| 2 | Query folder hierarchy to verify child folder attachment | Query: `folder(id: ROOT_CMS_ID) { childFolders { records { id name } } }` | `childFolders.records` contains newly created folder `id` and `name == "Raw Footage"`. |

**Post-conditions:**
- New folder entity exists in database under `ROOT_CMS_ID`.

---

### Test Case: TC-CF-002 - Verify successful creation of multi-tier nested subfolder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Intermediate child folder `FOLDER_A` exists under root folder (`FOLDER_A_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createFolder` mutation using `FOLDER_A_ID` as `parentId` | `input: { name: "Camera-Unit-01", description: "Daily ingest batch 1", parentId: FOLDER_A_ID, rootFolderType: cms }` | HTTP 200; `data.createFolder` returns valid `id`, `name == "Camera-Unit-01"`, and `parentFolderId == FOLDER_A_ID`. |
| 2 | Query intermediate parent folder to confirm child relationship | Query: `folder(id: FOLDER_A_ID) { childFolders { records { id name } } }` | Intermediate parent returns subfolder with matching `id` and `name`. |

**Post-conditions:**
- Multi-tier folder hierarchy branch `Root -> FOLDER_A -> Camera-Unit-01` is established.

---

### Test Case: TC-CF-003 - Verify folder creation across all supported RootFolderType domain partitions
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated tenant user session.
- Root folders provisioned for `watchlist`, `collection`, `application`, and `resource`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Create folder for `watchlist` partition | `input: { name: "Watchlist Alpha", parentId: ROOT_WL_ID, rootFolderType: watchlist }` | HTTP 200; Folder created successfully in `watchlist` partition. |
| 2 | Create folder for `collection` partition | `input: { name: "Collection Archive", parentId: ROOT_COLL_ID, rootFolderType: collection }` | HTTP 200; Folder created successfully in `collection` partition. |
| 3 | Create folder for `application` partition | `input: { name: "App Manifests", parentId: ROOT_APP_ID, rootFolderType: application }` | HTTP 200; Folder created successfully in `application` partition. |
| 4 | Create folder for `resource` partition | `input: { name: "Shared Resources", parentId: ROOT_RES_ID, rootFolderType: resource }` | HTTP 200; Folder created successfully in `resource` partition. |

**Post-conditions:**
- Domain-partitioned folders created without cross-partition pollution.

---

### Test Case: TC-CF-004 - Verify validation error when mandatory name field is missing or empty
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Valid root folder `ROOT_CMS_ID` exists.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createFolder` with empty string name | `input: { name: "", parentId: ROOT_CMS_ID, rootFolderType: cms }` | Returns GraphQL error indicating name cannot be empty. `data.createFolder` is null. |
| 2 | Execute `createFolder` omitting `name` parameter | `input: { parentId: ROOT_CMS_ID, rootFolderType: cms }` | Returns GraphQL syntax/validation error: Field `CreateFolder.name` of required type `String!` was not provided. |

**Post-conditions:**
- No new folder record is inserted into database.

---

### Test Case: TC-CF-005 - Verify error response when parentId does not exist or is malformed
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated tenant user session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createFolder` with random non-existent UUID as `parentId` | `input: { name: "Ghost Folder", parentId: "00000000-0000-0000-0000-000000000000", rootFolderType: cms }` | Returns GraphQL error: Parent folder not found. `data.createFolder` is null. |
| 2 | Execute `createFolder` with malformed string as `parentId` | `input: { name: "Invalid Parent", parentId: "invalid-uuid-123", rootFolderType: cms }` | Returns GraphQL validation error: Invalid ID format. |

**Post-conditions:**
- Database remains unmodified.

---

### Test Case: TC-CF-006 - Verify tenant isolation prevents creating folder under foreign organization parent
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant A authenticated (`Organization A`).
- Tenant B (`Organization B`) has folder `FOLDER_ORG_B_ID`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | As Tenant A, execute `createFolder` targeting `FOLDER_ORG_B_ID` | `input: { name: "Intruder Folder", parentId: FOLDER_ORG_B_ID, rootFolderType: cms }` | Returns authorization/not-found error (e.g., `403 Forbidden` or `Folder not found`). No folder created. |
| 2 | Query `FOLDER_ORG_B_ID` as Tenant B | Query: `folder(id: FOLDER_ORG_B_ID) { childFolders { records { name } } }` | Tenant B's folder contains no child named "Intruder Folder". |

**Post-conditions:**
- Cross-tenant boundaries remain strictly enforced.

---

## 3. Operation 2: `updateFolder`

### 3.1. Technical Specification
- **GraphQL Mutation Signature:** `updateFolder(input: UpdateFolder): Folder`
- **Input Object Fields:**
  - `id: ID!` (Identifier of target folder to modify)
  - `name: String` (New folder title)
- **Return Type:** `Folder { id, name, parentFolderId }`

### 3.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-UF-01` | Functional | In-Place Attribute Mutation | Updating an existing folder with a new `name` successfully modifies the folder entity and returns updated `name`. |
| `REQ-UF-02` | Architecture | Topology Immutability | In-place update must NOT alter tree topology. `parentFolderId` and existing child/sibling links remain identical. |
| `REQ-UF-03` | Validation | Non-Existent ID Handling | Attempting to update a non-existent folder ID returns a GraphQL error (`NOT_FOUND`). |
| `REQ-UF-04` | Security | Tenant Boundary Enforcement | Prevent updating a folder owned by another tenant organization. Request fails with authorization error. |
| `REQ-UF-05` | Validation | Required ID Parameter | Mutation submitted without `id` or with null `id` is rejected with GraphQL schema validation error. |

### 3.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-UF-001 | TC-UF-002 | TC-UF-003 | TC-UF-004 | TC-UF-005 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-UF-01` | **X** | | | | | **100% Covered** |
| `REQ-UF-02` | | **X** | | | | **100% Covered** |
| `REQ-UF-03` | | | **X** | | | **100% Covered** |
| `REQ-UF-04` | | | | **X** | | **100% Covered** |
| `REQ-UF-05` | | | | | **X** | **100% Covered** |

### 3.4. Detailed Test Cases

---

### Test Case: TC-UF-001 - Verify in-place renaming of existing folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Existing folder `FOLDER_TARGET` exists with name `"Sub-Batch 2"`, ID `"183f64e7-d519-4948-99d9-977657cce0c8"`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `updateFolder` with valid `id` and updated `name` | `input: { id: "183f64e7-d519-4948-99d9-977657cce0c8", name: "Sub-Batch 2 - Archived" }` | HTTP 200; `data.updateFolder.name == "Sub-Batch 2 - Archived"`. |
| 2 | Query folder directly via `folder(id)` to verify persistence | Query: `folder(id: "183f64e7-d519-4948-99d9-977657cce0c8") { id name }` | Persisted entity returns `name == "Sub-Batch 2 - Archived"`. |

**Post-conditions:**
- Folder title updated in database; no new entities created.

---

### Test Case: TC-UF-002 - Verify tree hierarchy topology is preserved during folder rename
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Existing folder `SUB_A1` exists under parent `FOLDER_A_ID`.
- Child folders exist under `SUB_A1`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Query initial state of `SUB_A1` | Query: `folder(id: SUB_A1_ID) { id parentFolderId childFolders { records { id } } }` | Captures baseline `parentFolderId == FOLDER_A_ID` and child count. |
| 2 | Execute `updateFolder` to change name | `input: { id: SUB_A1_ID, name: "Camera-Unit-01 [Priority Ingest]" }` | HTTP 200; Name updated. |
| 3 | Query `SUB_A1` state after mutation | Query: `folder(id: SUB_A1_ID) { id parentFolderId childFolders { records { id } } }` | `parentFolderId` remains `FOLDER_A_ID`; child folders list and count remain intact. |

**Post-conditions:**
- Tree topology is completely unchanged.

---

### Test Case: TC-UF-003 - Verify error handling when updating non-existent folder ID
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated user session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `updateFolder` with non-existent UUID | `input: { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", name: "Non-existent" }` | Returns GraphQL error: Folder not found. `data.updateFolder` is null. |

**Post-conditions:**
- Database remains unmodified.

---

### Test Case: TC-UF-004 - Verify tenant isolation prevents updating folder belonging to another organization
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Folder `FOLDER_ORG_B_ID` belongs to Tenant B.
- Active session is authenticated as Tenant A.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | As Tenant A, execute `updateFolder` targeting `FOLDER_ORG_B_ID` | `input: { id: FOLDER_ORG_B_ID, name: "Hijacked Folder Name" }` | Returns error: unauthorized or folder not found. `data.updateFolder` is null. |
| 2 | Switch session to Tenant B and query folder | Query: `folder(id: FOLDER_ORG_B_ID) { name }` | Original name preserved; no modification occurred. |

**Post-conditions:**
- Cross-tenant folder data is protected against unauthorized writes.

---

### Test Case: TC-UF-005 - Verify schema rejection when required id field is omitted or null
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated user session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `updateFolder` with null `id` | `input: { id: null, name: "New Title" }` | GraphQL schema error: Expected non-null value for `UpdateFolder.id`. |
| 2 | Execute `updateFolder` omitting `id` | `input: { name: "New Title" }` | GraphQL syntax error: Field `UpdateFolder.id` of required type `ID!` was not provided. |

**Post-conditions:**
- Request rejected at GraphQL validation layer.

---

## 4. Operation 3: `moveFolder`

### 4.1. Technical Specification
- **GraphQL Mutation Signature:** `moveFolder(input: MoveFolder): Folder`
- **Input Object Fields:**
  - `folderId: ID!` (Identifier of the folder to be moved)
  - `fromFolderId: ID!` (Expected current parent ID - Optimistic Concurrency Control token)
  - `toFolderId: ID!` (Destination parent folder ID)
- **Return Type:** `Folder { id, name, parentFolderId }`

### 4.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-MF-01` | Functional | Single-Node Relocation | Relocating a folder with verified `fromFolderId` to a valid `toFolderId` updates its parentage and reflects under target parent. |
| `REQ-MF-02` | Concurrency | Optimistic Locking Enforcement | Mutation requires `fromFolderId`. If live database parent does NOT match `fromFolderId`, server rejects with concurrency mismatch error. |
| `REQ-MF-03` | Integrity / DAG | Tree Acyclicity Enforcement | Server rejects relocating a folder into itself (`toFolderId == folderId`) or into any of its downstream descendants. |
| `REQ-MF-04` | Validation | Target Existence Check | Relocating to a non-existent `toFolderId` or moving a non-existent `folderId` is rejected with NOT_FOUND error. |
| `REQ-MF-05` | Security | Tenant Boundary Relocation | Reject relocation when target destination `toFolderId` or moving `folderId` belongs to a different organization context. |

### 4.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-MF-001 | TC-MF-002 | TC-MF-003 | TC-MF-004 | TC-MF-005 | TC-MF-006 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-MF-01` | **X** | | | | | | **100% Covered** |
| `REQ-MF-02` | | **X** | | | | | **100% Covered** |
| `REQ-MF-03` | | | **X** | **X** | | | **100% Covered** |
| `REQ-MF-04` | | | | | **X** | | **100% Covered** |
| `REQ-MF-05` | | | | | | **X** | **100% Covered** |

### 4.4. Detailed Test Cases

---

### Test Case: TC-MF-001 - Verify successful relocation of folder to valid new parent
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `FOLDER_A` exists as current parent of `SUB_A1` (`fromFolderId == FOLDER_A_ID`).
- `FOLDER_B` exists as destination parent (`toFolderId == FOLDER_B_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolder` with valid IDs and matching current parent | `input: { folderId: SUB_A1_ID, fromFolderId: FOLDER_A_ID, toFolderId: FOLDER_B_ID }` | HTTP 200; `data.moveFolder` returns `id == SUB_A1_ID`, `parentFolderId == FOLDER_B_ID`. |
| 2 | Query old parent `FOLDER_A` child list | Query: `folder(id: FOLDER_A_ID) { childFolders { records { id } } }` | `SUB_A1_ID` is no longer present under `FOLDER_A`. |
| 3 | Query new parent `FOLDER_B` child list | Query: `folder(id: FOLDER_B_ID) { childFolders { records { id } } }` | `SUB_A1_ID` is now present in `FOLDER_B.childFolders.records`. |

**Post-conditions:**
- `SUB_A1` parent pointer is updated to `FOLDER_B_ID` in database.

---

### Test Case: TC-MF-002 - Verify Optimistic Concurrency Control rejects stale fromFolderId
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `SUB_A1` currently resides under `FOLDER_B_ID` (having been moved earlier).
- Client A attempts a move using stale cached parent `FOLDER_A_ID`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolder` supplying stale `fromFolderId: FOLDER_A_ID` | `input: { folderId: SUB_A1_ID, fromFolderId: FOLDER_A_ID, toFolderId: FOLDER_C_ID }` | HTTP 200 with GraphQL error: Precondition failed / Current parent mismatch (`fromFolderId` does not match live parent). `data.moveFolder` is null. |
| 2 | Query `SUB_A1` parentage | Query: `folder(id: SUB_A1_ID) { parentFolderId }` | `parentFolderId` remains `FOLDER_B_ID`; stale write was safely thwarted. |

**Post-conditions:**
- Database remains consistent; no corrupted parentage.

---

### Test Case: TC-MF-003 - Verify cycle prevention: moving folder into itself
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Folder `FOLDER_A` exists under root.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolder` with `toFolderId` identical to `folderId` | `input: { folderId: FOLDER_A_ID, fromFolderId: ROOT_ID, toFolderId: FOLDER_A_ID }` | Returns GraphQL error: Cannot move folder into itself (Cycle detected). `data.moveFolder` is null. |

**Post-conditions:**
- Folder hierarchy remains an acyclic DAG.

---

### Test Case: TC-MF-004 - Verify cycle prevention: moving ancestor folder into its own descendant
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Hierarchy exists: `Root -> FOLDER_A -> SUB_A1 -> LEAF_A1_1`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to move ancestor `FOLDER_A` into descendant `LEAF_A1_1` | `input: { folderId: FOLDER_A_ID, fromFolderId: ROOT_ID, toFolderId: LEAF_A1_1_ID }` | Returns GraphQL error: Cycle detected / Destination folder is a descendant of the source folder. |
| 2 | Query `FOLDER_A` parentage | Query: `folder(id: FOLDER_A_ID) { parentFolderId }` | `parentFolderId` remains `ROOT_ID`. |

**Post-conditions:**
- Hierarchy integrity preserved; no orphaned circular subgraphs.

---

### Test Case: TC-MF-005 - Verify error response when destination toFolderId does not exist
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Valid folder `SUB_A1_ID` exists with verified parent `FOLDER_A_ID`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolder` with non-existent `toFolderId` | `input: { folderId: SUB_A1_ID, fromFolderId: FOLDER_A_ID, toFolderId: "99999999-9999-9999-9999-999999999999" }` | Returns GraphQL error: Destination folder not found. `data.moveFolder` is null. |

**Post-conditions:**
- Source folder remains in original location.

---

### Test Case: TC-MF-006 - Verify cross-tenant isolation prevents moving folder to foreign organization
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant A owns `FOLDER_A_ID`.
- Tenant B owns `FOLDER_B_ID`.
- User session is authenticated as Tenant A.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | As Tenant A, attempt to move `FOLDER_A_ID` into Tenant B's `FOLDER_B_ID` | `input: { folderId: FOLDER_A_ID, fromFolderId: ROOT_A_ID, toFolderId: FOLDER_B_ID }` | Returns authorization/not-found error. Move rejected. |
| 2 | Query `FOLDER_A_ID` parentage | Query: `folder(id: FOLDER_A_ID) { parentFolderId }` | `parentFolderId` remains `ROOT_A_ID`. |

**Post-conditions:**
- Cross-tenant boundaries strictly maintained.

---

## 5. Operation 4: `moveFolders`

### 5.1. Technical Specification
- **GraphQL Mutation Signature:** `moveFolders(input: MoveFolders): MoveFoldersPayload`
- **Input Object Fields:**
  - `folderIds: [ID!]!` (List of folder IDs to relocate, recommended max batch 50)
  - `newParentFolderId: ID!` (Target parent folder ID)
  - `rootFolderType: RootFolderType` (Enum: `cms`, `watchlist`, etc.)
- **Return Type:**
  ```graphql
  type MoveFoldersPayload {
    organizationId: ID
    newParentFolderId: ID
    validFolderIds: [ID!]
    invalidFolderIds: [ID!]
    message: String
  }
  ```

### 5.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-MFS-01` | Functional / Bulk | High-Throughput Bulk Relocation | Bulk relocation of valid folders into `newParentFolderId` succeeds, returning all IDs in `validFolderIds` and empty `invalidFolderIds`. |
| `REQ-MFS-02` | Architecture | Non-Atomic Partial-Success Semantics | If a batch contains mixed valid and invalid/stale/inaccessible IDs, valid folders are relocated, invalid IDs are returned in `invalidFolderIds`, without rolling back valid items. |
| `REQ-MFS-03` | Data Integrity | Domain Partition Validation | Relocation enforces `rootFolderType` boundary consistency across the candidate folder batch. |
| `REQ-MFS-04` | Integrity / DAG | Batch Cycle Detection Handling | Any folder ID in the batch that would introduce a cycle (e.g., moving ancestor into descendant) is categorized under `invalidFolderIds`. |
| `REQ-MFS-05` | Validation | Target & Batch Constraints | Rejects requests with non-existent `newParentFolderId` or malformed/empty `folderIds` array. |

### 5.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-MFS-001 | TC-MFS-002 | TC-MFS-003 | TC-MFS-004 | TC-MFS-005 | TC-MFS-006 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-MFS-01` | **X** | | | | | | **100% Covered** |
| `REQ-MFS-02` | | **X** | | | | | **100% Covered** |
| `REQ-MFS-03` | | | **X** | | | | **100% Covered** |
| `REQ-MFS-04` | | | | **X** | | | **100% Covered** |
| `REQ-MFS-05` | | | | | **X** | **X** | **100% Covered** |

### 5.4. Detailed Test Cases

---

### Test Case: TC-MFS-001 - Verify successful bulk relocation of multiple valid sibling folders
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Existing folders `SUB_A1` and `SUB_A2` exist under `FOLDER_A`.
- Target destination folder `FOLDER_B` exists in same tenant org and `cms` partition.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` with list of valid folder IDs | `input: { folderIds: [SUB_A1_ID, SUB_A2_ID], newParentFolderId: FOLDER_B_ID, rootFolderType: cms }` | HTTP 200; `data.moveFolders.validFolderIds` contains both IDs; `invalidFolderIds` is empty; `newParentFolderId == FOLDER_B_ID`. |
| 2 | Query target destination `FOLDER_B` | Query: `folder(id: FOLDER_B_ID) { childFolders { records { id } } }` | Both `SUB_A1_ID` and `SUB_A2_ID` are present in `FOLDER_B` child records. |

**Post-conditions:**
- Both folders relocated; tree reflects updated parentage for all batch items.

---

### Test Case: TC-MFS-002 - Verify non-atomic partial-success semantics with mixed valid and invalid IDs
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `SUB_A2_ID` is a valid folder.
- `GHOST_ID` ("d551fbd6-7354-4b0e-abfb-654ab8583be2") does not exist or belongs to another tenant.
- Target parent `FOLDER_B_ID` exists.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` with combination of valid and invalid IDs | `input: { folderIds: [SUB_A2_ID, GHOST_ID], newParentFolderId: FOLDER_B_ID, rootFolderType: cms }` | HTTP 200; `validFolderIds` contains `[SUB_A2_ID]`; `invalidFolderIds` contains `[GHOST_ID]`; `message` indicates partial success. |
| 2 | Verify valid folder was relocated | Query: `folder(id: SUB_A2_ID) { parentFolderId }` | `parentFolderId == FOLDER_B_ID`. |

**Post-conditions:**
- Valid folder successfully moved; invalid ID flagged without rolling back valid operation.

---

### Test Case: TC-MFS-003 - Verify domain partition rootFolderType enforcement in bulk move
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Folder `WL_FOLDER_ID` exists in `watchlist` partition.
- Target parent `CMS_PARENT_ID` exists in `cms` partition.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` attempting to move watchlist folder into CMS parent | `input: { folderIds: [WL_FOLDER_ID], newParentFolderId: CMS_PARENT_ID, rootFolderType: cms }` | `WL_FOLDER_ID` is placed into `invalidFolderIds` due to domain partition mismatch. |

**Post-conditions:**
- Domain partitions remain isolated.

---

### Test Case: TC-MFS-004 - Verify batch cycle detection separates cycle-inducing folder into invalidFolderIds
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `FOLDER_A` is the parent of `SUB_A1`.
- Batch contains valid sibling `FOLDER_C` and ancestor `FOLDER_A`.
- Target is `SUB_A1`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` targeting `SUB_A1` as new parent | `input: { folderIds: [FOLDER_C_ID, FOLDER_A_ID], newParentFolderId: SUB_A1_ID, rootFolderType: cms }` | HTTP 200; `validFolderIds` contains `[FOLDER_C_ID]`; `invalidFolderIds` contains `[FOLDER_A_ID]` (cycle detected). |
| 2 | Confirm `FOLDER_A` parent is unchanged | Query: `folder(id: FOLDER_A_ID) { parentFolderId }` | `parentFolderId` is unchanged; acyclic graph preserved. |

**Post-conditions:**
- Tree acyclicity maintained; valid sibling moved successfully.

---

### Test Case: TC-MFS-005 - Verify error response when newParentFolderId does not exist
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Valid folders `SUB_A1_ID`, `SUB_A2_ID` exist.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` targeting non-existent parent UUID | `input: { folderIds: [SUB_A1_ID], newParentFolderId: "88888888-8888-8888-8888-888888888888", rootFolderType: cms }` | Returns GraphQL error: Target parent folder not found. `data.moveFolders` is null. |

**Post-conditions:**
- Candidate folders remain in their original positions.

---

### Test Case: TC-MFS-006 - Verify validation error when folderIds array is empty
**Priority:** Low | **Type:** Functional

**Pre-conditions:**
- Valid target parent `FOLDER_B_ID` exists.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `moveFolders` with empty array `[]` | `input: { folderIds: [], newParentFolderId: FOLDER_B_ID, rootFolderType: cms }` | Returns validation error: `folderIds` must contain at least one ID. |

**Post-conditions:**
- No database operation executed.

---

## 6. Operation 5: `deleteFolder`

### 6.1. Technical Specification
- **GraphQL Mutation Signature:** `deleteFolder(input: DeleteFolder): DeletePayload`
- **Input Object Fields:**
  - `id: ID!` (Identifier of folder to delete)
  - `orderIndex: Int` (Sibling index for sequence rebalancing)
- **Return Type:** `DeletePayload { message: String }`

### 6.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-DF-01` | Functional | Leaf Folder Deletion | Successfully deletes an empty leaf folder with valid `id` and `orderIndex`, returning confirmation message. |
| `REQ-DF-02` | Architecture | Post-Deletion Verification | Once deleted, subsequent queries for the folder entity return `null` or a `NOT_FOUND` GraphQL error. |
| `REQ-DF-03` | Data Integrity | Sibling Index Rebalancing | Deleting an element at `orderIndex: K` re-indexes remaining siblings to prevent sparse indexing gaps. |
| `REQ-DF-04` | Security / Guard | Root Node Immutability | Rejects deletion requests targeting root folder anchors created by `createRootFolders`. |
| `REQ-DF-05` | Validation | Non-Existent Folder Handling | Attempting to delete a non-existent folder ID returns a GraphQL error. |
| `REQ-DF-06` | Security | Tenant Boundary Protection | Users cannot delete folders belonging to another tenant organization. Request rejected with authorization error. |

### 6.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-DF-001 | TC-DF-002 | TC-DF-003 | TC-DF-004 | TC-DF-005 | TC-DF-006 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-DF-01` | **X** | | | | | | **100% Covered** |
| `REQ-DF-02` | | **X** | | | | | **100% Covered** |
| `REQ-DF-03` | | | **X** | | | | **100% Covered** |
| `REQ-DF-04` | | | | **X** | | | **100% Covered** |
| `REQ-DF-05` | | | | | **X** | | **100% Covered** |
| `REQ-DF-06` | | | | | | **X** | **100% Covered** |

### 6.4. Detailed Test Cases

---

### Test Case: TC-DF-001 - Verify successful deletion of empty leaf folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Empty leaf folder `LEAF_FOLDER_ID` exists under parent `FOLDER_B`.
- Pre-check `folderOverview(ids: [LEAF_FOLDER_ID])` confirms `childFoldersCount == 0` and `childNonFolderObjectsCount == 0`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `deleteFolder` mutation with valid ID and orderIndex | `input: { id: LEAF_FOLDER_ID, orderIndex: 1 }` | HTTP 200; `data.deleteFolder.message` is non-null and confirms deletion. |
| 2 | Query parent folder `FOLDER_B` child list | Query: `folder(id: FOLDER_B_ID) { childFolders { records { id } } }` | `LEAF_FOLDER_ID` is no longer in parent's `childFolders` records. |

**Post-conditions:**
- Folder entity removed from directory tree.

---

### Test Case: TC-DF-002 - Verify post-deletion query confirms folder is completely purged
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `LEAF_FOLDER_ID` was successfully deleted in TC-DF-001.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute read query for deleted folder ID | Query: `folder(id: LEAF_FOLDER_ID) { id name }` | `data.folder` returns `null` or GraphQL returns `NOT_FOUND` error. |

**Post-conditions:**
- Confirmation that no zombie or cached folder references exist.

---

### Test Case: TC-DF-003 - Verify sibling order index rebalancing upon intermediate folder deletion
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Parent `FOLDER_X` has 3 child folders at ordered indices: `Child_1` (index 1), `Child_2` (index 2), `Child_3` (index 3).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `deleteFolder` on `Child_2` | `input: { id: Child_2_ID, orderIndex: 2 }` | HTTP 200; Deletion succeeds. |
| 2 | Query remaining siblings under `FOLDER_X` | Query: `folder(id: FOLDER_X_ID) { childFolders { records { id orderIndex } } }` | Exactly 2 records returned: `Child_1` remains at index 1; `Child_3` is re-indexed from 3 down to 2. |

**Post-conditions:**
- Sibling indexing sequence is continuous with no gap.

---

### Test Case: TC-DF-004 - Verify root node immutability prevents deleting root folder anchors
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant root anchor `ROOT_CMS_ID` exists (from `createRootFolders`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to delete root anchor folder via `deleteFolder` | `input: { id: ROOT_CMS_ID, orderIndex: 1 }` | Returns GraphQL error: Cannot delete root folder anchor (Operation not permitted). `data.deleteFolder` is null. |
| 2 | Query root folder | Query: `rootFolders(type: cms) { id }` | `ROOT_CMS_ID` remains active and intact. |

**Post-conditions:**
- Organizational root anchor remains protected.

---

### Test Case: TC-DF-005 - Verify error response when deleting non-existent folder ID
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated user session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `deleteFolder` with non-existent UUID | `input: { id: "00000000-dead-beef-0000-000000000000", orderIndex: 1 }` | Returns GraphQL error: Folder not found. `data.deleteFolder` is null. |

**Post-conditions:**
- Database state unchanged.

---

### Test Case: TC-DF-006 - Verify tenant isolation prevents deleting another organization's folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant B owns folder `FOLDER_ORG_B_ID`.
- Active session is authenticated as Tenant A.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | As Tenant A, execute `deleteFolder` on Tenant B's folder | `input: { id: FOLDER_ORG_B_ID, orderIndex: 1 }` | Returns authorization/not-found error. Deletion rejected. |
| 2 | Verify as Tenant B that folder still exists | Query: `folder(id: FOLDER_ORG_B_ID) { id }` | Folder is intact and accessible to Tenant B. |

**Post-conditions:**
- Cross-tenant folder security intact.

---

## 7. Operation 6: `createRootFolders`

### 7.1. Technical Specification
- **GraphQL Mutation Signature:** `createRootFolders(rootFolderType: RootFolderType = watchlist): [Folder]`
- **Input Arguments:**
  - `rootFolderType: RootFolderType = watchlist` (Supported values: `watchlist`, `collection`, `cms`, `application`, `resource`)
- **Return Type:** `[Folder] { id, rootFolderTypeId, name }`

### 7.2. Requirements Definition

| Requirement ID | Category | Requirement Description | Acceptance Criteria |
|---|---|---|---|
| `REQ-CRF-01` | Functional / Bootstrap | Explicit Domain Root Initialization | Initializes root folders for a specified partition (e.g., `cms`), returning an array of root `Folder` objects with valid `id`, `rootFolderTypeId`, and `name`. |
| `REQ-CRF-02` | Architecture | Default Parameter Value Behavior | When `rootFolderType` argument is omitted, defaults to `watchlist` per schema specification. |
| `REQ-CRF-03` | Data Integrity | Full Domain Partition Support | Supports all 5 standard domain partitions: `watchlist`, `collection`, `cms`, `application`, `resource`. |
| `REQ-CRF-04` | Idempotency | Safe Multi-Invocation / Idempotency | Re-executing `createRootFolders` for an already initialized domain partition does not produce duplicate root folders or corrupted data. |
| `REQ-CRF-05` | Security | Tenant Scoping | Generated root folders are strictly bound to the active user's authenticated tenant organization. |

### 7.3. Forward Traceability Matrix (Rows -> Requirement ID, Columns -> Test Case ID)

| Requirement ID | TC-CRF-001 | TC-CRF-002 | TC-CRF-003 | TC-CRF-004 | TC-CRF-005 | Coverage Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQ-CRF-01` | **X** | | | | | **100% Covered** |
| `REQ-CRF-02` | | **X** | | | | **100% Covered** |
| `REQ-CRF-03` | | | **X** | | | **100% Covered** |
| `REQ-CRF-04` | | | | **X** | | **100% Covered** |
| `REQ-CRF-05` | | | | | **X** | **100% Covered** |

### 7.4. Detailed Test Cases

---

### Test Case: TC-CRF-001 - Verify initialization of CMS root folders with explicit argument
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Newly provisioned tenant organization without initialized CMS root.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createRootFolders` with explicit `rootFolderType: cms` | `rootFolderType: cms` | HTTP 200; `data.createRootFolders` returns non-empty array of `Folder` entities with non-null `id`, `name`, and valid `rootFolderTypeId`. |
| 2 | Query root folders for CMS partition | Query: `rootFolders(type: cms) { id name rootFolderTypeId }` | Returns the newly created root folder matching the returned `id`. |

**Post-conditions:**
- CMS root folder anchor established for tenant.

---

### Test Case: TC-CRF-002 - Verify default parameter behavior defaults to watchlist
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Newly provisioned tenant organization without initialized watchlist root.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createRootFolders` omitting `rootFolderType` argument | None (default) | HTTP 200; Returns array of root folders initialized for `watchlist` domain partition. |
| 2 | Query root folders for watchlist domain | Query: `rootFolders(type: watchlist) { id rootFolderTypeId }` | Returns the root folder created by the default parameter mutation. |

**Post-conditions:**
- Watchlist root folder created by default.

---

### Test Case: TC-CRF-003 - Verify initialization across collection, application, and resource domains
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated tenant user session.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Initialize `collection` root folder | `rootFolderType: collection` | HTTP 200; Returns root folder for `collection`. |
| 2 | Initialize `application` root folder | `rootFolderType: application` | HTTP 200; Returns root folder for `application`. |
| 3 | Initialize `resource` root folder | `rootFolderType: resource` | HTTP 200; Returns root folder for `resource`. |

**Post-conditions:**
- All domain partition root anchors are active and distinct.

---

### Test Case: TC-CRF-004 - Verify idempotent re-invocation on already initialized tenant domain
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- `CMS` root folder is already initialized (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createRootFolders(rootFolderType: cms)` again | `rootFolderType: cms` | HTTP 200; Returns existing root folder array or gracefully handles re-initialization without creating duplicate conflicting roots. |
| 2 | Query `rootFolders(type: cms)` | Query: `rootFolders(type: cms) { id }` | Exactly one root folder anchor returned for CMS; no duplicate entries. |

**Post-conditions:**
- Root folder integrity maintained without duplicate root anchors.

---

### Test Case: TC-CRF-005 - Verify tenant scoping ensures root folders belong solely to authenticated org
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant A initializes CMS root (`ROOT_A_ID`).
- Tenant B initializes CMS root (`ROOT_B_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Query `rootFolders(type: cms)` as Tenant A | Tenant A Token | Returns array containing only `ROOT_A_ID`. |
| 2 | Query `rootFolders(type: cms)` as Tenant B | Tenant B Token | Returns array containing only `ROOT_B_ID`. `ROOT_A_ID` is not visible. |

**Post-conditions:**
- Strict organizational multi-tenancy enforced at root level.

---

## 8. Senior QA Recommendations & Execution Strategy

1. **Strict Dependency Flow:**
   Always run test suites following the 6-phase operational progression:
   `createRootFolders` (Phase 1) ➔ `createFolder` (Phase 2) ➔ `updateFolder` (Phase 3) ➔ `moveFolder` (Phase 4) ➔ `moveFolders` (Phase 5) ➔ `deleteFolder` (Phase 6).
2. **Read-Side Validation Coupling:**
   Never assert mutation success purely based on mutation return payloads. Always pair each mutation with a corresponding read query (`rootFolders`, `folder(id)`, `childFolders.records`, or `folderOverview`) to confirm live persistence in the virtual directory tree.
3. **Optimistic Locking Automated Rig:**
   For `moveFolder`, incorporate concurrency race simulations: dispatch two concurrent moves with the same `fromFolderId` to ensure the second request reliably fails with a concurrency mismatch rather than overwriting data silently.
4. **Partial-Success Error Handling for Batch Moves:**
   For `moveFolders`, assert both `validFolderIds` and `invalidFolderIds` explicitly. Never assume an all-or-nothing rollback in bulk APIs.
5. **Acyclicity & Security Sanity:**
   Execute cyclic graph and cross-tenant penetration test cases in every CI/CD regression run to prevent directory structure corruptions and data leakage.
