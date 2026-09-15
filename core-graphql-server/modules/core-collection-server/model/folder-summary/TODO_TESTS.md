# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model/folder-summary

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework

- **Runner**: Jest 29.7.0, babel-jest
- **Coverage command**: `pnpm test` (from `services/api/core-graphql-server/`)
- **Test file location**: next-to-source, same directory as the source file
- **Naming convention**: `*.spec.js`

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | medium | `converter.js:3 — convert (src has treeFolderId → sets folderSummaryObject)` | If the `dst.folderSummaryObject` assignment wrote wrong field names (e.g. `maxLevel` instead of `maxDepth`), folder summary API responses would carry incorrect depth and hasSubFolder flags, corrupting the folder tree UI. | converter.spec.js | (pending — framework will open PR) |
| 2 | implemented | medium | `converter.js:3 — convert (src.treeFolderId is falsy → no-op)` | If the `src.treeFolderId` guard were removed, `convert` would unconditionally set `folderSummaryObject` on every row, polluting non-tree-folder objects (e.g. root folders) with a spurious summary object. | converter.spec.js | (pending — framework will open PR) |
| 3 | implemented | medium | `converter.js:3 — convert (null dst or null src → no-op)` | If the `dst &&` or `src &&` null checks were removed, calling `convert(null, validSrc)` or `convert(validSrc, null)` would throw a `TypeError`, crashing any caller that passes incomplete row data. | converter.spec.js | (pending — framework will open PR) |
| 4 | implemented | medium | `folder-summary.js:5 — stringToInt (numeric string → integer)` | If the `_.isString(value)` branch and `parseInt` call were removed, `childFolders` and `childNonFolderObjects` values returned as strings from the DB would not be coerced to numbers, causing downstream arithmetic (total child count, pagination) to produce `NaN` or string concatenation. | folder-summary.spec.js | (pending — framework will open PR) |
| 5 | implemented | low | `folder-summary.js:1 — FolderSummary model dbKey mappings` | If the `dbKey` mappings for `treeObjectIds` (`tree_object_ids`) or `childFolders` (`child_folders`) were changed or removed, the DB column names would no longer match, silently returning `undefined` for those fields in all folder summary API responses. | folder-summary.spec.js | (pending — framework will open PR) |
