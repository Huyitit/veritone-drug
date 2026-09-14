# Investigation Report: Folder-Related Mutations in Veritone aiWARE

## Executive Summary

To satisfy the requirement of finding all GraphQL mutations relating to **"folder"**, an exhaustive analysis was performed across all three partition files:
- [mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html)
- [mutations_part2.html](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html)
- [mutations_part3.html](file:///home/huycao/Coding/Examples/mutations/mutations_part3.html)

A total of **21 mutations** directly operate on folders, manage folder templates, or file/unfile platform entities (TDOs, Watchlists, Applications, Collections) into virtual folder hierarchies.

### Which Parts Relate to Your Requirement?

| File Partition | Total Mutations in Part | Folder Mutations Found | Relationship Level | Primary Functional Scope |
| :--- | :---: | :---: | :---: | :--- |
| **[mutations_part2.html](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html)** | 120 | **15** | **Primary (Dominant Part)** | Contains ~71% of all folder mutations: folder updates, relocations, bulk moves, deletions, root folders, folder sharing, folder content templates, and TDO/watchlist filing. |
| **[mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html)** | 120 | **6** | **Secondary (Creation & Subtypes)** | Contains `createFolder`, application filing, and folder-backed collection management (`createCollection`, `updateCollection`, `shareCollection`). |
| **[mutations_part3.html](file:///home/huycao/Coding/Examples/mutations/mutations_part3.html)** | 121 | **0** | **None** | Focuses exclusively on Compute Clusters, Ingest Slugs, Low-Code Flow Automate, Object ACLs, and Audit Logs. |

---

## 1. Master Catalog of All 21 Folder-Related Mutations

| # | Mutation Name | Part | Line # | Global Op # | Input Type | Return Type | Category |
| :-: | :--- | :---: | :---: | :-: | :--- | :--- | :--- |
| 1 | [`createFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1674) | Part 1 | L1674 | #119 | `CreateFolder` | `Folder` | Folder Lifecycle |
| 2 | [`updateFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L56) | Part 2 | L56 | #123 | `UpdateFolder` | `Folder` | Folder Lifecycle |
| 3 | [`moveFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L74) | Part 2 | L74 | #124 | `MoveFolder` | `Folder` | Tree Reorganization |
| 4 | [`moveFolders`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L94) | Part 2 | L94 | #125 | `MoveFolders` | `MoveFoldersPayload` | Tree Reorganization |
| 5 | [`deleteFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L122) | Part 2 | L122 | #126 | `DeleteFolder` | `DeletePayload` | Folder Lifecycle |
| 6 | [`createRootFolders`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L252) | Part 2 | L252 | #141 | `RootFolderType` | `[Folder]` | Folder Hierarchy |
| 7 | [`shareFolder`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L451) | Part 2 | L451 | #156 | `ShareFolderInput` | `Folder` | Cross-Tenant Sharing |
| 8 | [`createFolderContentTemplate`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L797) | Part 2 | L797 | #171 | `CreateFolderContentTemplate!` | `FolderContentTemplate!` | Folder Templates |
| 9 | [`updateFolderContentTemplate`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L798) | Part 2 | L798 | #172 | `UpdateFolderContentTemplate!` | `FolderContentTemplate!` | Folder Templates |
| 10 | [`deleteFolderContentTemplate`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L799) | Part 2 | L799 | #173 | `ID!` | `DeletePayload!` | Folder Templates |
| 11 | [`fileTemporalDataObject`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L278) | Part 2 | L278 | #143 | `FileTemporalDataObject!` | `TemporalDataObject` | Media/TDO Filing |
| 12 | [`unfileTemporalDataObject`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L306) | Part 2 | L306 | #144 | `UnfileTemporalDataObject!` | `TemporalDataObject` | Media/TDO Filing |
| 13 | [`moveTemporalDataObject`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L328) | Part 2 | L328 | #145 | `MoveTemporalDataObject!` | `TemporalDataObject` | Media/TDO Filing |
| 14 | [`createWatchlist`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L364) | Part 2 | L364 | #147 | `CreateWatchlist!` | `Watchlist` | Watchlist Filing |
| 15 | [`fileWatchlist`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L427) | Part 2 | L427 | #154 | `FileWatchlist!` | `Watchlist` | Watchlist Filing |
| 16 | [`unfileWatchlist`](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L427) | Part 2 | L427 | #155 | `UnfileWatchlist!` | `Watchlist` | Watchlist Filing |
| 17 | [`fileApplication`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L654) | Part 1 | L654 | #47 | `FileApplication!` | `Application` | App Filing |
| 18 | [`unfileApplication`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L673) | Part 1 | L673 | #48 | `UnfileApplication!` | `Application` | App Filing |
| 19 | [`createCollection`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1590) | Part 1 | L1590 | #106 | `CreateCollection` | `Collection` | Collection (Folder Subtype) |
| 20 | [`updateCollection`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1610) | Part 1 | L1610 | #107 | `UpdateCollection` | `Collection` | Collection (Folder Subtype) |
| 21 | [`shareCollection`](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1648) | Part 1 | L1648 | #109 | `ShareCollection` | `Share` | Collection (Folder Subtype) |

---

## 2. Detailed Technical Evidence by Category

### Category A: Direct Folder Lifecycle & Hierarchy Operations

#### 1. `createFolder`
- **Location:** [mutations_part1.html:L1674](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1674) (Local #119, Global #119)
- **Signature:** `createFolder(input: CreateFolder): Folder`
- **Description:** Creates a new folder in the virtual directory tree.
- **Evidence Snippet:**
```graphql
mutation {
  createFolder(input: {
    name: "example",
    description: "example",
    parentId: "2ac28573-917a-4c4b-be91-a0ac64cbc982",
    rootFolderType: cms
  }) {
    id
    name
  }
}
```

#### 2. `updateFolder`
- **Location:** [mutations_part2.html:L56](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L56) (Local #3, Global #123)
- **Signature:** `updateFolder(input: UpdateFolder): Folder`
- **Description:** Updates the name or metadata of an existing folder.
- **Evidence Snippet:**
```graphql
mutation {
  updateFolder(input: {
    id: "d551fbd6-7354-4b0e-abfb-654ab8583be2",
    name: "new name"
  }) {
    name
  }
}
```

#### 3. `moveFolder`
- **Location:** [mutations_part2.html:L74](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L74) (Local #4, Global #124)
- **Signature:** `moveFolder(input: MoveFolder): Folder`
- **Description:** Moves a folder from one parent folder to another.
- **Evidence Snippet:**
```graphql
mutation {
  moveFolder(input: {
    folderId: "68a5833a-f573-41fe-840a-adb5f6888e2d",
    fromFolderId: "3104f61f-4bd1-4175-9fe6-27436d591c54",
    toFolderId: "ad7839a7-d088-4202-9db1-5ed4992f915d"
  }) {
    id
    name
  }
}
```

#### 4. `moveFolders`
- **Location:** [mutations_part2.html:L94](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L94) (Local #5, Global #125)
- **Signature:** `moveFolders(input: MoveFolders): MoveFoldersPayload`
- **Description:** Moves multiple folders simultaneously to a new parent folder.
- **Evidence Snippet:**
```graphql
mutation {
  moveFolders(input: {
    folderIds: ["0c4c2765-1817-40a7-bd6d-bf6362a384ba", "183f64e7-d519-4948-99d9-977657cce0c8"],
    newParentFolderId: "22d2c53a-d33e-47d8-a77e-f64f5c3db7c8",
    rootFolderType: cms
  }) {
    message
  }
}
```

#### 5. `deleteFolder`
- **Location:** [mutations_part2.html:L122](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L122) (Local #6, Global #126)
- **Signature:** `deleteFolder(input: DeleteFolder): DeletePayload`
- **Description:** Deletes a folder by ID.
- **Evidence Snippet:**
```graphql
mutation {
  deleteFolder(input: {
    id: "d551fbd6-7354-4b0e-abfb-654ab8583be2",
    orderIndex: 1
  }) {
    message
  }
}
```

#### 6. `createRootFolders`
- **Location:** [mutations_part2.html:L252](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L252) (Local #21, Global #141)
- **Signature:** `createRootFolders(rootFolderType: RootFolderType = watchlist): [Folder]`
- **Description:** Initializes default root directory folders for an organization.
- **Evidence Snippet:**
```graphql
mutation {
  createRootFolders(rootFolderType: watchlist) {
    id
    rootFolderTypeId
  }
}
```

#### 7. `shareFolder`
- **Location:** [mutations_part2.html:L451](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L451) (Local #36, Global #156)
- **Signature:** `shareFolder(input: ShareFolderInput): Folder`
- **Description:** Shares a folder with other tenant organizations (Requires superadmin).

---

### Category B: Folder Content Templates

#### 8. `createFolderContentTemplate`
- **Location:** [mutations_part2.html:L797](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L797) (Local #51, Global #171)
- **Signature:** `createFolderContentTemplate(input: CreateFolderContentTemplate!): FolderContentTemplate!`
- **Description:** Creates a predefined content template inside a folder for standardizing sub-structure and metadata.

#### 9. `updateFolderContentTemplate`
- **Location:** [mutations_part2.html:L798](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L798) (Local #52, Global #172)
- **Signature:** `updateFolderContentTemplate(input: UpdateFolderContentTemplate!): FolderContentTemplate!`
- **Description:** Updates an existing folder content template by ID.

#### 10. `deleteFolderContentTemplate`
- **Location:** [mutations_part2.html:L799](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L799) (Local #53, Global #173)
- **Signature:** `deleteFolderContentTemplate(id: ID!): DeletePayload!`
- **Description:** Deletes a folder content template by ID.

---

### Category C: Content Filing (Associating Entities with Folders)

In Veritone aiWARE, media assets and watchlists follow a virtual multi-tag filing architecture: entities can be filed into zero, one, or multiple folders without physical duplication.

#### 11. `fileTemporalDataObject`
- **Location:** [mutations_part2.html:L278](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L278) (Local #23, Global #143)
- **Signature:** `fileTemporalDataObject(input: FileTemporalDataObject!): TemporalDataObject`
- **Description:** Associates a media object (TDO) with a folder.
- **Evidence Snippet:**
```graphql
mutation {
  fileTemporalDataObject(input: {
    tdoId: "1580388995",
    folderId: "9d639f1b-a0d4-47b0-8149-3568f048f320"
  }) {
    id
    name
  }
}
```

#### 12. `unfileTemporalDataObject`
- **Location:** [mutations_part2.html:L306](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L306) (Local #24, Global #144)
- **Signature:** `unfileTemporalDataObject(input: UnfileTemporalDataObject!): TemporalDataObject`
- **Description:** Disassociates a TDO from a folder without destroying the TDO or its underlying media assets.
- **Evidence Snippet:**
```graphql
mutation {
  unfileTemporalDataObject(input: {
    tdoId: "1580388995",
    folderId: "9d639f1b-a0d4-47b0-8149-3568f048f320"
  }) {
    id
    name
  }
}
```

#### 13. `moveTemporalDataObject`
- **Location:** [mutations_part2.html:L328](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L328) (Local #25, Global #145)
- **Signature:** `moveTemporalDataObject(input: MoveTemporalDataObject!): TemporalDataObject`
- **Description:** Re-points a TDO from `oldFolderId` to `newFolderId`.
- **Evidence Snippet:**
```graphql
mutation {
  moveTemporalDataObject(input: {
    tdoId: "1580388995",
    oldFolderId: "9d639f1b-a0d4-47b0-8149-3568f048f320",
    newFolderId: "2408c5b0-3375-4089-9407-3507d4b4703b"
  }) {
    id
    name
  }
}
```

#### 14. `createWatchlist`
- **Location:** [mutations_part2.html:L364](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L364) (Local #27, Global #147)
- **Signature:** `createWatchlist(input: CreateWatchlist!): Watchlist`
- **Description:** Creates a watchlist under a specified parent folder (`parentFolderId`).

#### 15. `fileWatchlist`
- **Location:** [mutations_part2.html:L427](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L427) (Local #34, Global #154)
- **Signature:** `fileWatchlist(input: FileWatchlist!): Watchlist`
- **Description:** Files an existing watchlist into a specific folder directory.

#### 16. `unfileWatchlist`
- **Location:** [mutations_part2.html:L427](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html#L427) (Local #35, Global #155)
- **Signature:** `unfileWatchlist(input: UnfileWatchlist!): Watchlist`
- **Description:** Removes a watchlist from a folder directory.
- **Evidence Snippet:**
```graphql
mutation {
  unfileWatchlist(input: {
    watchlistId: "325786",
    folderId: "9d639f1b-a0d4-47b0-8149-3568f048f320"
  }) {
    id
    folders {
      folderPath {
        id
      }
    }
  }
}
```

#### 17. `fileApplication` & 18. `unfileApplication`
- **Location:** [mutations_part1.html:L654](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L654) & [L673](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L673) (Local #47 & #48, Global #47 & #48)
- **Signatures:** `fileApplication(input: FileApplication!): Application` / `unfileApplication(input: UnfileApplication!): Application`
- **Description:** Organizes applications into organizational folder categories.

---

### Category D: Collections (Folder-Derived Specialized Types)

In the aiWARE schema, `Collection` is an abstraction layered over the folder system. Notice that collection inputs explicitly take `folderId`, `folderDescription`, and `parentFolderId`:

#### 19. `createCollection`
- **Location:** [mutations_part1.html:L1590](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1590) (Local #106, Global #106)
- **Signature:** `createCollection(input: CreateCollection): Collection`
- **Evidence Snippet:**
```graphql
mutation {
  createCollection(input: {
    name: "example",
    folderDescription: "example",
    image: "",
    parentFolderId: "d551fbd6-7354-4b0e-abfb-654ab8583be2"
  }) {
    id
  }
}
```

#### 20. `updateCollection`
- **Location:** [mutations_part1.html:L1610](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1610) (Local #107, Global #107)
- **Signature:** `updateCollection(input: UpdateCollection): Collection`
- **Evidence Snippet:**
```graphql
mutation {
  updateCollection(input: {
    folderId: "242361",
    name: "new name",
    folderDescription: "new description"
  }) {
    id
  }
}
```

#### 21. `shareCollection`
- **Location:** [mutations_part1.html:L1648](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html#L1648) (Local #109, Global #109)
- **Signature:** `shareCollection(input: ShareCollection): Share`
- **Description:** Shares a collection folder across organizations (`folderId: "242599"`).

---

## 3. Key Takeaway & Architecture Guidance

If your development task involves **Folders**:
1. **Primary Focus:** Load and inspect **[mutations_part2.html](file:///home/huycao/Coding/Examples/mutations/mutations_part2.html)**. It contains the operational core of the folder subsystem: updates, deletions, single and bulk moves, folder sharing, folder templates, and media/watchlist filing.
2. **Creation Primitives:** Refer to **[mutations_part1.html](file:///home/huycao/Coding/Examples/mutations/mutations_part1.html)** specifically for `createFolder` and collection-based folder structures.
3. **Ignore Part 3:** Do not spend time searching [mutations_part3.html](file:///home/huycao/Coding/Examples/mutations/mutations_part3.html) for folder capabilities, as it contains 0 folder operations.
