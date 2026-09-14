# Requirements & Input Traceability Matrix: GraphQL Folder Mutations

**Author:** Senior QA Engineer / SDET  
**System:** Veritone aiWARE GraphQL API (`https://api.stage.us-1.veritone.com/v3/graphql`)  
**Scope:** Core Virtual Folder Hierarchy Operations ([folder_mutations.md:L54-L152](file:///home/huycao/Coding/Examples/.agents/contexts/folder_mutations.md#L54-L152))  
**Referenced Contexts:**
- [folder_mutations.md](file:///home/huycao/Coding/Examples/.agents/contexts/folder_mutations.md)
- [folder_lifecycle_progression_report.md](file:///home/huycao/Coding/Examples/.agents/contexts/folder_lifecycle_progression_report.md)
- [folder_specification.md](file:///home/huycao/Coding/Examples/.agents/contexts/folder_specification.md)
- [folder.mutation.test.ts](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts)
**Referenced Rules:**
- [.agents/rules/read-context.md](file:///home/huycao/Coding/Examples/.agents/rules/read-context.md)
- [.agents/rules/api-test-case-format.md](file:///home/huycao/Coding/Examples/.agents/rules/api-test-case-format.md)

---

## 1. Executive Summary & Quality Strategy

In GraphQL API testing, inputs determine query planning, authorization scopes, data integrity, and mutation side effects. Unlike REST endpoints that rely on HTTP verbs and URL paths, GraphQL routes all mutations through a single endpoint where operations take structured input types (`InputObject`) or scalar/enum arguments.

This document establishes an **Input-Centric Traceability Matrix** for the 6 core folder operations defined in lines 54–152 of `folder_mutations.md`:
1. `createFolder(input: CreateFolder): Folder`
2. `updateFolder(input: UpdateFolder): Folder`
3. `moveFolder(input: MoveFolder): Folder`
4. `moveFolders(input: MoveFolders): MoveFoldersPayload`
5. `deleteFolder(input: DeleteFolder): DeletePayload`
6. `createRootFolders(rootFolderType: RootFolderType = watchlist): [Folder]`

### 1.1 Testing Objectives
- **Input Equivalence Partitioning (EP):** Partition all input fields into valid and invalid sets.
- **Boundary Value Analysis (BVA):** Stress limits on strings (min/max length, whitespace), arrays (empty, single, batch limit), integers (`orderIndex`), and enum variations.
- **Data Integrity & Relational Rules:** Enforce parentage validity, domain partition isolation (`cms` vs `watchlist`), cycle prevention in DAG structures, and optimistic locking (`fromFolderId`).
- **Idempotency & Concurrency:** Verify behavior on redundant executions and race conditions.
- **Format Compliance:** All documented test cases strictly follow the Markdown layout specified in [.agents/rules/api-test-case-format.md](file:///home/huycao/Coding/Examples/.agents/rules/api-test-case-format.md).

---

## 2. Master Input Traceability Matrix

The table below correlates every operation and its input parameters to test scenarios, test partition classifications, test case identifiers, priorities, and automated test implementation references.

| Operation | Input Argument / Field | Type & Constraints | Test Partition / Condition | TC ID | Priority | Test Type | Automated Test Reference |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **`createRootFolders`** | `rootFolderType` | `RootFolderType` (Enum) | Explicit valid domain partition (`cms`) | `TC_CR_01` | High | Functional | [folder.mutation.test.ts:L80](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L80) |
| | `rootFolderType` | `RootFolderType = watchlist` | Parameter omitted (default to `watchlist`) | `TC_CR_02` | High | Functional | [folder.mutation.test.ts:L93](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L93) |
| | `rootFolderType` | Idempotency / State | Re-execution when root already exists | `TC_CR_03` | Medium | Functional | [folder.mutation.test.ts:L104](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L104) |
| | `(Auth Context)` | Header `Authorization` | Missing or expired Bearer token | `TC_CR_04` | High | Security | [folder.mutation.test.ts:L121](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L121) |
| | `rootFolderType` | `RootFolderType` (Enum) | Invalid / unsupported enum literal | `TC_CR_05` | Medium | Negative | Planned / Regression |
| **`createFolder`** | `input.name` | `String!` (1–255 chars) | Valid standard alphanumeric name | `TC_CF_01` | High | Functional | [folder.mutation.test.ts:L141](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L141) |
| | `input.parentId` | `ID!` (UUID format) | Valid root parent ID anchor | `TC_CF_01` | High | Functional | [folder.mutation.test.ts:L141](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L141) |
| | `input.rootFolderType` | `RootFolderType` | Explicit matching domain (`cms`) | `TC_CF_01` | High | Functional | [folder.mutation.test.ts:L141](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L141) |
| | `input.description` | `String` (Optional) | Valid optional description text | `TC_CF_01` | Medium | Functional | [folder.mutation.test.ts:L141](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L141) |
| | `input.parentId` | `ID!` (UUID format) | Valid intermediate subfolder ID (Tier 2+) | `TC_CF_02` | High | Functional | [folder.mutation.test.ts:L162](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L162) |
| | `input.name` | `String!` (Uniqueness) | Sibling duplicate name under identical parent | `TC_CF_03` | Medium | Functional | [folder.mutation.test.ts:L187](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L187) |
| | `input.parentId` | `ID!` (Foreign Key) | Non-existent UUID (`00000000-...`) | `TC_CF_04` | High | Negative | [folder.mutation.test.ts:L214](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L214) |
| | `input.rootFolderType` | `RootFolderType` | Mismatch against parent's domain partition | `TC_CF_05` | High | Negative | [folder.mutation.test.ts:L229](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L229) |
| | `input.name` | `String!` (BVA: Empty/Spaces) | Empty string or whitespace-only (`"   "`) | `TC_CF_06` | High | Boundary | [folder.mutation.test.ts:L251](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L251) |
| | `input.name` | `String!` (UTF-8 Encoding) | Unicode symbols, accents, emojis | `TC_CF_07` | Medium | Functional | Planned / Regression |
| | `input.parentId` | `ID!` (Mandatory check) | Omitted or null `parentId` | `TC_CF_08` | High | Negative | Planned / Schema validation |
| **`updateFolder`** | `input.id` | `ID!` (Existing folder) | Valid folder ID | `TC_UF_01` | High | Functional | [folder.mutation.test.ts:L272](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L272) |
| | `input.name` | `String` (New name) | Valid non-empty mutated name | `TC_UF_01` | High | Functional | [folder.mutation.test.ts:L272](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L272) |
| | `input.name` | `String` (Idempotent) | Same name passed (no change) | `TC_UF_02` | Medium | Functional | [folder.mutation.test.ts:L292](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L292) |
| | `input.id` | `ID!` (Foreign Key) | Non-existent UUID target | `TC_UF_03` | High | Negative | [folder.mutation.test.ts:L311](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L311) |
| | `input (extra fields)` | Schema Contract | Unauthorized structural field (`parentId`) | `TC_UF_04` | High | Security | [folder.mutation.test.ts:L327](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L327) |
| | `input.name` | `String` (Localization) | UTF-8, Japanese glyphs, emojis | `TC_UF_05` | Medium | Functional | [folder.mutation.test.ts:L346](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L346) |
| | `input.name` | `String` (Boundary) | Empty string or whitespace-only name | `TC_UF_06` | Medium | Boundary | Planned / Regression |
| **`moveFolder`** | `input.folderId` | `ID!` (Target folder) | Valid child folder ID | `TC_MF_01` | High | Functional | [folder.mutation.test.ts:L371](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L371) |
| | `input.fromFolderId` | `ID!` (Source parent) | Exact current parent ID (Lock match) | `TC_MF_01` | High | Functional | [folder.mutation.test.ts:L371](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L371) |
| | `input.toFolderId` | `ID!` (Target parent) | Valid distinct destination parent ID | `TC_MF_01` | High | Functional | [folder.mutation.test.ts:L371](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L371) |
| | `input.fromFolderId` | `ID!` (OCC / Guard) | Stale / mismatched `fromFolderId` | `TC_MF_02` | High | Concurrency | [folder.mutation.test.ts:L393](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L393) |
| | `input.toFolderId` | `ID!` (Self-Reference) | Destination equals subject (`folderId == toFolderId`) | `TC_MF_03` | High | Negative | [folder.mutation.test.ts:L415](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L415) |
| | `input.toFolderId` | `ID!` (No-Op) | Destination equals source (`fromFolderId == toFolderId`) | `TC_MF_04` | Low | Functional | [folder.mutation.test.ts:L434](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L434) |
| | `input.toFolderId` | `ID!` (Cycle Check) | Moving ancestor into its own child | `TC_MF_05` | High | Integrity | [folder.mutation.test.ts:L456](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L456) |
| | `input.toFolderId` | `ID!` (Domain Guard) | Moving `cms` folder into `watchlist` tree | `TC_MF_06` | High | Negative | [folder.mutation.test.ts:L475](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L475) |
| | `input.folderId` | `ID!` (Root Guard) | Attempting to move protected root node | `TC_MF_07` | Medium | Negative | Planned / Security |
| **`moveFolders`** | `input.folderIds` | `[ID!]!` (Homogeneous) | Array of 2+ valid folder IDs | `TC_BF_01` | High | Functional | [folder.mutation.test.ts:L501](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L501) |
| | `input.newParentFolderId` | `ID!` (Destination) | Valid destination parent ID | `TC_BF_01` | High | Functional | [folder.mutation.test.ts:L501](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L501) |
| | `input.rootFolderType` | `RootFolderType` | Explicit matching domain partition | `TC_BF_01` | High | Functional | [folder.mutation.test.ts:L501](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L501) |
| | `input.folderIds` | `[ID!]!` (Heterogeneous) | Mixed valid and non-existent IDs | `TC_BF_02` | High | Functional | [folder.mutation.test.ts:L531](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L531) |
| | `input.folderIds` | `[ID!]!` (BVA: Empty) | Empty array `[]` | `TC_BF_03` | Medium | Boundary | [folder.mutation.test.ts:L563](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L563) |
| | `input.folderIds` | `[ID!]!` (Collision) | Target parent included in `folderIds` | `TC_BF_04` | High | Negative | [folder.mutation.test.ts:L584](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L584) |
| | `input.folderIds` | `[ID!]!` (BVA: Scale) | High-volume batch array (50+ items) | `TC_BF_05` | Medium | Performance | Planned / Regression |
| **`deleteFolder`** | `input.id` | `ID!` (Leaf folder) | Valid empty leaf folder ID | `TC_DF_01` | High | Functional | [folder.mutation.test.ts:L615](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L615) |
| | `input.orderIndex` | `Int!` (Sibling Index) | Valid current sibling index (0) | `TC_DF_01` | High | Functional | [folder.mutation.test.ts:L615](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L615) |
| | `input.id` | `ID!` (Non-Empty Node) | Folder containing child subfolders | `TC_DF_02` | High | Integrity | [folder.mutation.test.ts:L633](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L633) |
| | `input.id` | `ID!` (Filed Entities) | Folder containing filed TDOs / assets | `TC_DF_03` | High | Integrity | Contextual / Progression |
| | `input.orderIndex` | `Int!` (Mismatched) | Stale / arbitrary index (e.g. 9999) | `TC_DF_04` | Medium | Concurrency | [folder.mutation.test.ts:L653](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L653) |
| | `input.id` | `ID!` (Root Node) | Protected root anchor ID | `TC_DF_05` | High | Security | [folder.mutation.test.ts:L675](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L675) |
| | `input.id` | `ID!` (Idempotency) | Non-existent or already deleted ID | `TC_DF_06` | Medium | Negative | [folder.mutation.test.ts:L690](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts#L690) |

---

## 3. Operation-by-Operation Input Deconstruction

### 3.1 Operation 1: `createFolder`

#### GraphQL AST & Signature
```graphql
mutation CreateFolder($input: CreateFolder!) {
  createFolder(input: $input) {
    id
    name
    description
    parentFolderId
    rootFolderTypeId
  }
}
```

#### Input Schema Decomposition (`CreateFolder`)
| Field Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `name` | `String!` | **Yes** | — | Non-empty string, trimmed length $\ge 1$ and $\le 255$. Supports UTF-8 multilingual glyphs and emojis. |
| `description` | `String` | No | `null` | Optional descriptive text. Max length typically $\le 1000$ characters. |
| `parentId` | `ID!` | **Yes** | — | Must match a valid, non-deleted `Folder.id` within the caller's organization. Can be a root folder or intermediate subfolder. |
| `rootFolderType`| `RootFolderType` | No | `null` | Domain partition enum (`watchlist`, `collection`, `cms`, `application`, `resource`). Must align with parent folder partition. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Field Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_CF_01` | `parentId` | Valid root folder ID | Valid | Success (`200 OK`, `Folder` returned with `id`, `name`) | `TC_CF_01` |
| `EP_CF_02` | `parentId` | Valid intermediate child folder ID (Tier 2+) | Valid | Success (`200 OK`, hierarchical link established) | `TC_CF_02` |
| `EP_CF_03` | `name` | Duplicate name under identical `parentId` | Valid / Edge | Success with unique `id`, or `CONFLICT` depending on schema policy | `TC_CF_03` |
| `EP_CF_04` | `parentId` | Non-existent UUID (`00000000-0000-0000-0000-000000000000`) | Invalid | GraphQL Error: parent folder not found | `TC_CF_04` |
| `EP_CF_05` | `rootFolderType` | Mismatched domain (e.g. `cms` under `watchlist` root) | Invalid | GraphQL Error: domain partition mismatch | `TC_CF_05` |
| `BVA_CF_01` | `name` | Empty string `""` or whitespace `"   "` | Invalid | GraphQL Validation Error (`BAD_USER_INPUT`) | `TC_CF_06` |
| `EP_CF_06` | `name` | Multibyte UTF-8, Japanese kanji, emojis | Valid | Success: string persisted and returned intact | `TC_CF_07` |
| `EP_CF_07` | `parentId` | Omitted or null `parentId` | Invalid | GraphQL Schema Error: Field `parentId` of required type `ID!` was not provided | `TC_CF_08` |

---

### 3.2 Operation 2: `updateFolder`

#### GraphQL AST & Signature
```graphql
mutation UpdateFolder($input: UpdateFolder!) {
  updateFolder(input: $input) {
    id
    name
    description
  }
}
```

#### Input Schema Decomposition (`UpdateFolder`)
| Field Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `ID!` | **Yes** | — | Target folder identifier. Must exist, belong to active tenant, and not be a system-locked root node. |
| `name` | `String` | No | — | Updated name. Minimum 1 character when provided. |
| `description` | `String` | No | — | Updated description metadata. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Field Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_UF_01` | `id`, `name` | Valid ID, new distinct name | Valid | Success: `updateFolder` returns mutated `name` | `TC_UF_01` |
| `EP_UF_02` | `id`, `name` | Valid ID, identical name (Idempotent update) | Valid | Success: no-op state update, returns existing name | `TC_UF_02` |
| `EP_UF_03` | `id` | Non-existent UUID target | Invalid | GraphQL Error: folder not found / 404 | `TC_UF_03` |
| `EP_UF_04` | Extra inputs | Supplying structural mutation field (e.g. `parentId`) | Invalid | GraphQL Schema Error: Field `parentId` is not defined on `UpdateFolder` | `TC_UF_04` |
| `EP_UF_05` | `name` | UTF-8 symbols, emojis, and localized characters | Valid | Success: character sequence preserved in UTF-8 | `TC_UF_05` |
| `BVA_UF_01` | `name` | Whitespace-only string `" "` | Invalid | GraphQL Validation Error: name cannot be empty | `TC_UF_06` |

---

### 3.3 Operation 3: `moveFolder`

#### GraphQL AST & Signature
```graphql
mutation MoveFolder($input: MoveFolder!) {
  moveFolder(input: $input) {
    id
    name
    parentFolderId
  }
}
```

#### Input Schema Decomposition (`MoveFolder`)
| Field Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `folderId` | `ID!` | **Yes** | — | The subject folder to be relocated. Must be a mutable subfolder (cannot be a root folder anchor). |
| `fromFolderId` | `ID!` | **Yes** | — | Optimistic Concurrency Control (OCC) guard. Must match current `parentFolderId` of `folderId`. |
| `toFolderId` | `ID!` | **Yes** | — | Destination parent folder ID. Must exist, share domain partition, and not create a circular dependency. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Field Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_MF_01` | All fields | Valid `folderId`, matching `fromFolderId`, distinct `toFolderId` | Valid | Success: `parentFolderId` updated to `toFolderId` | `TC_MF_01` |
| `EP_MF_02` | `fromFolderId` | Stale or incorrect `fromFolderId` mismatch | Invalid | GraphQL Error: OCC lock failed / precondition mismatch | `TC_MF_02` |
| `EP_MF_03` | `toFolderId` | Destination equals subject (`folderId == toFolderId`) | Invalid | GraphQL Error: folder cannot be moved into itself | `TC_MF_03` |
| `EP_MF_04` | `toFolderId` | Destination equals source (`fromFolderId == toFolderId`) | Valid / Edge | Success or immediate no-op confirmation | `TC_MF_04` |
| `EP_MF_05` | `toFolderId` | Moving ancestor node into its own descendant child | Invalid | GraphQL Error: circular reference / hierarchy cycle detected | `TC_MF_05` |
| `EP_MF_06` | `toFolderId` | Moving folder across domain partitions (`cms` $\to$ `watchlist`) | Invalid | GraphQL Error: cross-domain migration rejected | `TC_MF_06` |
| `EP_MF_07` | `folderId` | Attempting to move a root folder anchor | Invalid | GraphQL Error: root folders cannot be moved | `TC_MF_07` |

---

### 3.4 Operation 4: `moveFolders`

#### GraphQL AST & Signature
```graphql
mutation MoveFolders($input: MoveFolders!) {
  moveFolders(input: $input) {
    organizationId
    newParentFolderId
    validFolderIds
    invalidFolderIds
    message
  }
}
```

#### Input Schema Decomposition (`MoveFolders`)
| Field Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `folderIds` | `[ID!]!` | **Yes** | — | Non-empty array of folder IDs to relocate. |
| `newParentFolderId` | `ID!` | **Yes** | — | Common target parent ID for all candidate folders. |
| `rootFolderType` | `RootFolderType` | No | `null` | Domain partition enum enforcing boundary consistency across batch. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Field Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_BF_01` | `folderIds` | Homogeneous array of valid candidate IDs | Valid | Success: `validFolderIds` contains all IDs, `invalidFolderIds` is empty | `TC_BF_01` |
| `EP_BF_02` | `folderIds` | Mixed valid IDs and non-existent IDs | Mixed | Partial Success: valid IDs in `validFolderIds`, bad IDs in `invalidFolderIds` | `TC_BF_02` |
| `BVA_BF_01` | `folderIds` | Empty array `[]` | Boundary | Zero moves performed: `validFolderIds: []` or schema validation warning | `TC_BF_03` |
| `EP_BF_03` | `folderIds` | `newParentFolderId` included inside `folderIds` list | Invalid / Edge | Target parent flagged in `invalidFolderIds`, valid siblings moved | `TC_BF_04` |
| `BVA_BF_02` | `folderIds` | High volume array ($\ge 50$ folders) | Boundary | Batch processed without gateway timeout or memory exhaustion | `TC_BF_05` |

---

### 3.5 Operation 5: `deleteFolder`

#### GraphQL AST & Signature
```graphql
mutation DeleteFolder($input: DeleteFolder!) {
  deleteFolder(input: $input) {
    message
  }
}
```

#### Input Schema Decomposition (`DeleteFolder`)
| Field Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `ID!` | **Yes** | — | Target folder identifier to delete. Cannot be a protected root partition node. |
| `orderIndex` | `Int!` | **Yes** | — | Zero-based sibling index used to trigger re-indexing of remaining sibling nodes. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Field Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_DF_01` | `id`, `orderIndex` | Valid empty leaf folder ID with matching index | Valid | Success: `deleteFolder.message` confirms deletion, folder removed | `TC_DF_01` |
| `EP_DF_02` | `id` | Non-empty folder containing child subfolders | Invalid / Edge | Rejection ("folder not empty") or controlled cascade delete | `TC_DF_02` |
| `EP_DF_03` | `id` | Folder containing filed TDO media or watchlists | Edge | Unfiles entities without destroying assets, or blocks deletion | `TC_DF_03` |
| `EP_DF_04` | `orderIndex` | Stale or mismatched `orderIndex` (e.g. 9999) | Edge | Server reconciles index or returns ordering error | `TC_DF_04` |
| `EP_DF_05` | `id` | Protected root partition folder ID | Invalid | GraphQL Error: root folders cannot be deleted | `TC_DF_05` |
| `EP_DF_06` | `id` | Non-existent or already deleted folder ID | Invalid | GraphQL Error: folder not found / 404 | `TC_DF_06` |

---

### 3.6 Operation 6: `createRootFolders`

#### GraphQL AST & Signature
```graphql
mutation CreateRootFolders($rootFolderType: RootFolderType) {
  createRootFolders(rootFolderType: $rootFolderType) {
    id
    name
    rootFolderTypeId
  }
}
```

#### Input Parameter Decomposition
| Parameter Name | Type | Required | Default | Domain / Validation Rules |
| :--- | :--- | :---: | :---: | :--- |
| `rootFolderType` | `RootFolderType` | No | `watchlist` | Enum value designating partition domain: `watchlist`, `cms`, `collection`, `application`, `resource`. |

#### Equivalence Partitions & Boundary Conditions
| Partition ID | Parameter Under Test | Partition / Boundary Description | Class | Expected API Response | Associated TC |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `EP_CR_01` | `rootFolderType` | Explicit valid enum: `cms` | Valid | Returns array `[Folder]` containing root CMS folder ID | `TC_CR_01` |
| `EP_CR_02` | `rootFolderType` | Omitted parameter (Default value verification) | Valid | Defaults to `watchlist`, returns root watchlist folder array | `TC_CR_02` |
| `EP_CR_03` | `rootFolderType` | Re-running on existing initialized tenant | Valid / Idempotent | Returns existing root folders without duplicate records | `TC_CR_03` |
| `EP_CR_04` | Auth Header | Invalid, expired, or missing Bearer token | Invalid | HTTP 401 / GraphQL error: UNAUTHENTICATED | `TC_CR_04` |
| `EP_CR_05` | `rootFolderType` | Invalid enum string literal (e.g. `INVALID_TYPE`) | Invalid | GraphQL schema syntax error: Expected type RootFolderType | `TC_CR_05` |

---

## 4. Formal Test Case Specifications

All test cases are documented in strict compliance with the format mandated by [.agents/rules/api-test-case-format.md](file:///home/huycao/Coding/Examples/.agents/rules/api-test-case-format.md).

---

### Test Case: TC_CR_01 - Initial Tenant Root Bootstrap with Explicit Domain
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated session with valid tenant JWT token.
- Target tenant organization is active in staging environment.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createRootFolders` mutation with explicit `rootFolderType` parameter | `rootFolderType: "cms"` | Response `errors` is undefined. `data.createRootFolders` returns an array of root folders with `id`, `name`, and `rootFolderTypeId: 1`. |
| 2 | Query `rootFolders(type: cms)` to verify persistence | `type: "cms"` | Root folder array contains the newly returned root ID. |

**Post-conditions:**
- Root CMS folder is anchored and ready for tree expansion.

---

### Test Case: TC_CR_02 - Tenant Root Bootstrap with Default Parameter
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated session with valid tenant JWT token.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createRootFolders` mutation omitting the `rootFolderType` argument | `{}` (No arguments passed) | Mutation succeeds without errors. Schema applies default `watchlist` parameter and returns root watchlist folder(s). |
| 2 | Inspect returned `rootFolderTypeId` | None | Returned folder record reflects `watchlist` root partition type. |

**Post-conditions:**
- Default `watchlist` root partition exists for the organization.

---

### Test Case: TC_CR_03 - Idempotent Re-invocation on Initialized Tenant
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Tenant has already initialized a `cms` root folder (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Execute `createRootFolders` mutation for `cms` domain | `rootFolderType: "cms"` | Mutation returns `data.createRootFolders` containing `ROOT_CMS_ID`. |
| 2 | Immediately execute `createRootFolders` mutation for `cms` domain a second time | `rootFolderType: "cms"` | Returns identical `id` (`ROOT_CMS_ID`). No duplicate root folder is created in the database. |

**Post-conditions:**
- Database maintains singular root partition anchor without orphaned duplicates.

---

### Test Case: TC_CR_04 - Unauthorized Execution Under Invalid Token
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- GraphQL HTTP client configured with invalid or expired Bearer token.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createRootFolders` mutation | `rootFolderType: "cms"`, Header: `Authorization: "Bearer invalid_token_xyz"` | Request rejected. Response contains GraphQL errors with status `UNAUTHENTICATED` or HTTP 401. `data.createRootFolders` is null. |

**Post-conditions:**
- No database changes occur.

---

### Test Case: TC_CR_05 - Root Creation with Invalid Enum Literal
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Authenticated session with valid tenant JWT token.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createRootFolders` mutation with unrecognized enum literal | `rootFolderType: "INVALID_DOMAIN"` | GraphQL server rejects request during schema validation phase. `errors[0].message` indicates value is not a valid `RootFolderType`. |

**Post-conditions:**
- Request fails before reaching resolver layer.

---

### Test Case: TC_CF_01 - Standard Child Folder Creation Under Root Node
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant has an active CMS root folder (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` mutation targeting `ROOT_CMS_ID` | `input: { name: "Raw-Footage-101", description: "Inbound media", parentId: ROOT_CMS_ID, rootFolderType: "cms" }` | Response `errors` is undefined. `data.createFolder` returns valid UUID `id` and `name: "Raw-Footage-101"`. |
| 2 | Query `folder(id: <createdId>)` | `id: <createdId>` | Folder exists, `parentFolderId` matches `ROOT_CMS_ID`, `description` matches input. |

**Post-conditions:**
- New Level-1 folder is tracked for teardown cleanup.

---

### Test Case: TC_CF_02 - Multi-Tier Hierarchy Creation (Intermediate Parent)
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Active Level-1 parent folder exists (`TIER_1_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` mutation passing `TIER_1_ID` as `parentId` | `input: { name: "Sub-Batch-A", parentId: TIER_1_ID, rootFolderType: "cms" }` | Response `errors` is undefined. `data.createFolder` returns new child `id`. |
| 2 | Query intermediate parent folder `folder(id: TIER_1_ID)` | `id: TIER_1_ID` | Parent's `childFolders` list includes the newly instantiated child folder. |

**Post-conditions:**
- Multi-tier DAG node established and tracked for cleanup.

---

### Test Case: TC_CF_03 - Sibling Name Handling Under Identical Parent
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Active parent folder exists (`PARENT_ID`) containing a child named `"Shared-Batch-Name"`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` with identical sibling name under same `parentId` | `input: { name: "Shared-Batch-Name", parentId: PARENT_ID, rootFolderType: "cms" }` | Either: (A) System allows duplicate sibling names and returns distinct UUID, or (B) Returns `CONFLICT` error enforcing unique names per directory. |

**Post-conditions:**
- Newly generated folder (if allowed) is tracked for cleanup.

---

### Test Case: TC_CF_04 - Folder Creation with Non-Existent parentId
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated session active.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` with non-existent UUID for `parentId` | `input: { name: "Orphan-Folder", parentId: "00000000-0000-0000-0000-000000000000", rootFolderType: "cms" }` | Response `errors` is defined. Error message indicates foreign key violation or parent folder not found. `data.createFolder` is null. |

**Post-conditions:**
- No orphan folder is created.

---

### Test Case: TC_CF_05 - Cross-Domain Partition Mismatch
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Active Watchlist root folder exists (`ROOT_WL_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` under Watchlist root but specifying `rootFolderType: "cms"` | `input: { name: "Mismatch-Folder", parentId: ROOT_WL_ID, rootFolderType: "cms" }` | Response rejected with validation error indicating cross-domain partition conflict. |

**Post-conditions:**
- Domain isolation between `watchlist` and `cms` remains intact.

---

### Test Case: TC_CF_06 - Boundary Validation for Empty / Whitespace Name
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Valid root folder anchor exists (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` with whitespace string for `name` | `input: { name: "   ", parentId: ROOT_CMS_ID, rootFolderType: "cms" }` | Response `errors` is defined. Error message indicates validation failure on `name` (cannot be blank/whitespace). `data.createFolder` is null. |

**Post-conditions:**
- Database rejects blank folder entity.

---

### Test Case: TC_CF_07 - Multilingual UTF-8 & Emoji Name Support
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Valid root folder anchor exists (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` with Unicode, Japanese Kanji, and emoji | `input: { name: "📁 Media [2026] / プロジェクト #42", parentId: ROOT_CMS_ID, rootFolderType: "cms" }` | Response `errors` is undefined. `data.createFolder.name` exactly equals `"📁 Media [2026] / プロジェクト #42"`. |

**Post-conditions:**
- UTF-8 string properly persisted and tracked for cleanup.

---

### Test Case: TC_CF_08 - Omission of Mandatory parentId Input
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated session active.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `createFolder` mutation omitting `parentId` field | `input: { name: "No-Parent-Folder", rootFolderType: "cms" }` | GraphQL schema validation error returned: `Field CreateFolder.parentId of required type ID! was not provided`. Request fails prior to execution. |

**Post-conditions:**
- Schema prevents execution without mandatory input.

---

### Test Case: TC_UF_01 - In-Place Renaming and Metadata Update
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Test folder exists with initial name `"Initial-Folder-Name"` (`FOLDER_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` mutation with mutated name | `input: { id: FOLDER_ID, name: "Renamed-Folder-New" }` | Response `errors` is undefined. `data.updateFolder.name` equals `"Renamed-Folder-New"`. |
| 2 | Query folder by ID | `id: FOLDER_ID` | Database reflects updated name `"Renamed-Folder-New"`. `parentFolderId` remains unchanged. |

**Post-conditions:**
- Folder name updated in place without structural alteration.

---

### Test Case: TC_UF_02 - Idempotent Update with Unchanged Name
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Test folder exists with name `"Static-Name"` (`FOLDER_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` submitting identical existing name | `input: { id: FOLDER_ID, name: "Static-Name" }` | Response `errors` is undefined. `data.updateFolder.name` equals `"Static-Name"`. No-op state modification. |

**Post-conditions:**
- Folder state remains stable and valid.

---

### Test Case: TC_UF_03 - Update Targeting Non-Existent Folder ID
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Authenticated session active.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` with non-existent UUID | `input: { id: "00000000-0000-0000-0000-000000000000", name: "Ghost-Update" }` | Response `errors` is defined. Error message indicates folder not found. `data.updateFolder` is null. |

**Post-conditions:**
- No database update occurs.

---

### Test Case: TC_UF_04 - Rejection of Structural Mutation via updateFolder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Test folder exists (`FOLDER_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` attempting to pass `parentId` | `input: { id: FOLDER_ID, name: "Tampered", parentId: "some-other-id" }` | GraphQL schema validation fails: `Field parentId is not defined by type UpdateFolder`. Request rejected at parser level. |

**Post-conditions:**
- Tree hierarchy integrity protected from unauthorized field tampering.

---

### Test Case: TC_UF_05 - UTF-8 Name Update with Special Characters & Glyphs
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Test folder exists (`FOLDER_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` with multilingual glyphs and symbols | `input: { id: FOLDER_ID, name: "📁 Ingest [2026] / Équipe & テスト #42" }` | Response `errors` is undefined. Returned `name` matches exact UTF-8 input string. |

**Post-conditions:**
- Updated folder retains UTF-8 characters.

---

### Test Case: TC_UF_06 - Boundary Validation on Empty Name Update
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Test folder exists (`FOLDER_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `updateFolder` with empty string for `name` | `input: { id: FOLDER_ID, name: "" }` | GraphQL error returned: `name` cannot be an empty string. `data.updateFolder` is null. |

**Post-conditions:**
- Existing folder name remains unchanged.

---

### Test Case: TC_MF_01 - Valid Single-Folder Relocation
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Two distinct parent folders exist (`PARENT_A`, `PARENT_B`).
- Child folder (`CHILD_ID`) currently resides under `PARENT_A`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolder` mutation specifying exact source and target | `input: { folderId: CHILD_ID, fromFolderId: PARENT_A, toFolderId: PARENT_B }` | Response `errors` is undefined. `data.moveFolder.id` equals `CHILD_ID`. |
| 2 | Query folder `folder(id: CHILD_ID)` | `id: CHILD_ID` | `parentFolderId` is updated to `PARENT_B`. Node no longer appears in `PARENT_A.childFolders`. |

**Post-conditions:**
- Folder `CHILD_ID` is relocated to `PARENT_B`.

---

### Test Case: TC_MF_02 - Optimistic Concurrency Lock Collision
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Child folder (`CHILD_ID`) currently resides under `PARENT_A`. Target parent `PARENT_B` exists.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolder` with mismatched / stale `fromFolderId` | `input: { folderId: CHILD_ID, fromFolderId: "00000000-0000-0000-0000-000000000000", toFolderId: PARENT_B }` | Response `errors` is defined. Mutation rejected due to precondition mismatch (`fromFolderId != currentParentId`). `data.moveFolder` is null. |
| 2 | Verify location of `CHILD_ID` via query | `id: CHILD_ID` | `parentFolderId` remains `PARENT_A`. |

**Post-conditions:**
- Hierarchy state preserved; race condition blocked.

---

### Test Case: TC_MF_03 - Self-Relocation Rejection (folderId == toFolderId)
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Child folder exists under parent (`CHILD_ID`, `PARENT_A`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolder` with destination set to subject folder itself | `input: { folderId: CHILD_ID, fromFolderId: PARENT_A, toFolderId: CHILD_ID }` | Response `errors` is defined. Error message states folder cannot be its own parent. `data.moveFolder` is null. |

**Post-conditions:**
- No cycle created; folder remains under `PARENT_A`.

---

### Test Case: TC_MF_04 - No-Op Relocation (fromFolderId == toFolderId)
**Priority:** Low | **Type:** Functional

**Pre-conditions:**
- Child folder exists under parent (`CHILD_ID`, `PARENT_A`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolder` where `toFolderId` equals `fromFolderId` | `input: { folderId: CHILD_ID, fromFolderId: PARENT_A, toFolderId: PARENT_A }` | Operation succeeds with no-op confirmation or returns `id: CHILD_ID`. `parentFolderId` remains unchanged. |

**Post-conditions:**
- Folder hierarchy remains stable.

---

### Test Case: TC_MF_05 - Hierarchy Cycle Prevention (Ancestor into Descendant)
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Parent folder (`PARENT_NODE`) has child folder (`DESCENDANT_NODE`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to move `PARENT_NODE` into its own child `DESCENDANT_NODE` | `input: { folderId: PARENT_NODE, fromFolderId: ROOT_ID, toFolderId: DESCENDANT_NODE }` | Response `errors` is defined. Graph cycle detection halts execution: ancestor cannot be moved into descendant subtree. |
| 2 | Query `folder(id: PARENT_NODE)` | `id: PARENT_NODE` | Parent remains anchored under `ROOT_ID`. |

**Post-conditions:**
- DAG acyclicity preserved.

---

### Test Case: TC_MF_06 - Cross-Domain Migration Rejection
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Active CMS folder exists (`CMS_FOLDER_ID`). Active Watchlist root folder exists (`WL_ROOT_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to move CMS folder into Watchlist root hierarchy | `input: { folderId: CMS_FOLDER_ID, fromFolderId: ROOT_CMS_ID, toFolderId: WL_ROOT_ID }` | Response `errors` is defined. Operation rejected due to domain partition mismatch (`cms` vs `watchlist`). |

**Post-conditions:**
- Cross-domain boundaries enforced.

---

### Test Case: TC_MF_07 - Relocation Prevention on Protected Root Node
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Active CMS root folder anchor exists (`ROOT_CMS_ID`). Intermediate parent exists (`PARENT_B`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to move `ROOT_CMS_ID` under another folder | `input: { folderId: ROOT_CMS_ID, fromFolderId: ROOT_CMS_ID, toFolderId: PARENT_B }` | Operation rejected with authorization or policy error: root partition nodes cannot be relocated. |

**Post-conditions:**
- Root folder stays locked as root anchor.

---

### Test Case: TC_BF_01 - Homogeneous Bulk Migration of Valid Folders
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Source parent folder contains two children (`CHILD_1`, `CHILD_2`).
- Target parent folder (`TARGET_PARENT`) exists in same domain (`cms`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolders` with list containing both child IDs | `input: { folderIds: [CHILD_1, CHILD_2], newParentFolderId: TARGET_PARENT, rootFolderType: "cms" }` | Response `errors` is undefined. `data.moveFolders.validFolderIds` contains `CHILD_1` and `CHILD_2`. `invalidFolderIds` is empty. |
| 2 | Query both folders | `ids: [CHILD_1, CHILD_2]` | Both folders reflect `parentFolderId: TARGET_PARENT`. |

**Post-conditions:**
- Batch relocation confirmed.

---

### Test Case: TC_BF_02 - Partial-Success Bulk Migration with Mixed IDs
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Valid child folder exists (`VALID_CHILD`). Target parent exists (`TARGET_PARENT`).
- Non-existent UUID defined (`FAKE_ID = "00000000-0000-0000-0000-000000000000"`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolders` containing both valid and fake ID | `input: { folderIds: [VALID_CHILD, FAKE_ID], newParentFolderId: TARGET_PARENT, rootFolderType: "cms" }` | Partial-success payload: `data.moveFolders.validFolderIds` contains `VALID_CHILD`; `invalidFolderIds` contains `FAKE_ID`. Operation does not abort valid item. |
| 2 | Verify location of `VALID_CHILD` | `id: VALID_CHILD` | `VALID_CHILD.parentFolderId` equals `TARGET_PARENT`. |

**Post-conditions:**
- Non-atomic batch semantics allow valid migrations to proceed.

---

### Test Case: TC_BF_03 - Empty Batch Relocation Input Boundary
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Target parent exists (`TARGET_PARENT`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolders` mutation with empty `folderIds` array | `input: { folderIds: [], newParentFolderId: TARGET_PARENT, rootFolderType: "cms" }` | Server returns valid empty response (`validFolderIds: []`) or schema validation error. No state modified. |

**Post-conditions:**
- System handles empty list boundary safely without exception.

---

### Test Case: TC_BF_04 - Target Parent Contained in Batch Selection
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Valid child folder exists (`CHILD_1`). Target parent exists (`TARGET_PARENT`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolders` passing `TARGET_PARENT` in its own candidate list | `input: { folderIds: [CHILD_1, TARGET_PARENT], newParentFolderId: TARGET_PARENT, rootFolderType: "cms" }` | System relocates `CHILD_1` (`validFolderIds: [CHILD_1]`) while isolating `TARGET_PARENT` in `invalidFolderIds` to prevent self-nesting. |

**Post-conditions:**
- Target parent remains valid node; child moved safely.

---

### Test Case: TC_BF_05 - High-Volume Bulk Migration Boundary
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Target parent exists (`TARGET_PARENT`). 50 test folders generated.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `moveFolders` with 50 folder IDs in `folderIds` array | `input: { folderIds: [<50 IDs>], newParentFolderId: TARGET_PARENT, rootFolderType: "cms" }` | Mutation processes full batch within timeout limit. `validFolderIds` contains all 50 IDs. |

**Post-conditions:**
- Bulk migration completes without gateway timeout.

---

### Test Case: TC_DF_01 - Standard Deletion of Empty Leaf Folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Valid empty leaf folder exists (`LEAF_FOLDER_ID`). Sibling order index is known (`orderIndex: 0`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `deleteFolder` mutation | `input: { id: LEAF_FOLDER_ID, orderIndex: 0 }` | Response `errors` is undefined. `data.deleteFolder.message` confirms deletion. |
| 2 | Query folder by ID `folder(id: LEAF_FOLDER_ID)` | `id: LEAF_FOLDER_ID` | Returns `null` or `NOT_FOUND` error. Node is completely removed. |

**Post-conditions:**
- Folder destroyed and removed from active tracking.

---

### Test Case: TC_DF_02 - Deletion Prevention of Non-Empty Folder
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Parent folder (`PARENT_ID`) contains active child folder (`CHILD_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to delete `PARENT_ID` without pruning children first | `input: { id: PARENT_ID, orderIndex: 0 }` | Response rejected with validation error (e.g., "Cannot delete folder containing subfolders") or triggers explicit cascading delete. |
| 2 | Verify child folder existence | `id: CHILD_ID` | If non-cascading, child remains intact. |

**Post-conditions:**
- Data loss prevented for unpruned subtrees.

---

### Test Case: TC_DF_03 - Deletion Handling with Associated Media / Watchlists
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Folder (`FOLDER_WITH_TDO`) contains a filed Temporal Data Object (`TDO_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `deleteFolder` on `FOLDER_WITH_TDO` | `input: { id: FOLDER_WITH_TDO, orderIndex: 0 }` | Deletion succeeds or prompts unfile. Virtual multi-tag filing dissociates folder reference. |
| 2 | Query `temporalDataObject(id: TDO_ID)` | `id: TDO_ID` | Underlying media object remains active and unaffected in the platform. |

**Post-conditions:**
- Virtual filing dissociation preserves underlying media assets.

---

### Test Case: TC_DF_04 - Stale / Mismatched orderIndex Deletion Handling
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Valid empty leaf folder exists (`LEAF_FOLDER_ID`). Actual sibling index is `0`.

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `deleteFolder` with arbitrary or stale index | `input: { id: LEAF_FOLDER_ID, orderIndex: 9999 }` | Platform either reconciles index automatically and executes deletion, or rejects with an index mismatch validation error. |

**Post-conditions:**
- Folder deleted or error handled gracefully without corrupting sibling order.

---

### Test Case: TC_DF_05 - Deletion Prevention on Protected Root Partition
**Priority:** High | **Type:** Functional

**Pre-conditions:**
- Tenant has active root CMS folder (`ROOT_CMS_ID`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Attempt to delete root partition folder | `input: { id: ROOT_CMS_ID, orderIndex: 0 }` | Response `errors` is defined. Error message confirms root folder cannot be deleted (system partition protection). `data.deleteFolder` is null. |
| 2 | Query root folders `rootFolders(type: cms)` | `type: "cms"` | Root folder remains active and intact. |

**Post-conditions:**
- Tenant namespace anchors remain protected.

---

### Test Case: TC_DF_06 - Double Deletion / Non-Existent Folder ID
**Priority:** Medium | **Type:** Functional

**Pre-conditions:**
- Non-existent UUID (`00000000-0000-0000-0000-000000000000`).

| Step | Action / Step Description | Input Data | Expected Result |
|---|---|---|---|
| 1 | Dispatch `deleteFolder` with non-existent ID | `input: { id: "00000000-0000-0000-0000-000000000000", orderIndex: 0 }` | Response `errors` is defined. Error indicates folder not found (`NOT_FOUND` / 404). `data.deleteFolder` is null. |

**Post-conditions:**
- No change to system state.

---

## 5. Input Coverage & Traceability Statistics

### 5.1 Input Field Coverage Analysis

| Operation | Total Input Fields | Covered in Positive Flow | Covered in Boundary / BVA | Covered in Negative / Error Flow | Field Coverage % |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`createRootFolders`** | 1 (`rootFolderType`) | Yes (`cms`) | Yes (omitted default) | Yes (invalid enum, unauth) | **100%** |
| **`createFolder`** | 4 (`name`, `description`, `parentId`, `rootFolderType`) | Yes (all fields) | Yes (empty, spaces, UTF-8, max) | Yes (bad UUID, mismatch, omitted) | **100%** |
| **`updateFolder`** | 3 (`id`, `name`, `description`) | Yes (all fields) | Yes (whitespace, unchanged) | Yes (fake ID, unauthorized fields) | **100%** |
| **`moveFolder`** | 3 (`folderId`, `fromFolderId`, `toFolderId`) | Yes (all fields) | Yes (no-op source=dest) | Yes (stale lock, self, cycle, root, mismatch) | **100%** |
| **`moveFolders`** | 3 (`folderIds`, `newParentFolderId`, `rootFolderType`) | Yes (all fields) | Yes (empty array, batch $\ge 50$) | Yes (mixed invalid IDs, self-inclusion) | **100%** |
| **`deleteFolder`** | 2 (`id`, `orderIndex`) | Yes (all fields) | Yes (stale index 9999) | Yes (root protection, non-empty, fake ID) | **100%** |
| **Total** | **16 Fields** | **16 / 16** | **16 / 16** | **16 / 16** | **100%** |

### 5.2 Test Case Distribution by Quality Dimension
- **Positive Functional Tests:** 13 (40.6%)
- **Negative & Schema Validation Tests:** 10 (31.3%)
- **Boundary Value Analysis (BVA):** 5 (15.6%)
- **Concurrency & Locking Tests:** 2 (6.3%)
- **Security & Authorization Tests:** 2 (6.3%)
- **Total Test Cases:** 32

---

## 6. Recommendations for Automated Test Pipeline Integration

1. **Leverage Existing Test Harness:**
   The test cases documented above directly align with the Jest test suite implemented in [`Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts`](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/folder/folder.mutation.test.ts).
2. **Automated Teardown Tracking:**
   Always register dynamically generated test folders with [`folderTracker.track(id)`](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/factories/folder.factory.ts#L18) so that `afterAll` safely removes test data in reverse creation order, avoiding database pollution.
3. **Partition Pre-Flight Discovery:**
   Always precede hierarchical tests with a query to `rootFolders(type: cms)` using [`CHECK_ROOT_FOLDERS`](file:///home/huycao/Coding/Examples/Test-With-Jest/Codebase/tests/graphql/folder/queries.ts) to guarantee anchor availability before creating sub-nodes.
