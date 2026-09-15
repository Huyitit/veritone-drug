# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model/mention

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Test framework

- **Runner**: Jest 29.7.0, babel-jest
- **Coverage command**: `pnpm test` (from `services/api/core-graphql-server/`)
- **Test file location**: next-to-source, same directory as the source file
- **Naming convention**: `*.spec.js`
- **Note**: `mention.js` uses `embeddedModel` / `embeddedModelArray` helpers from `../util/`. Tests for those helpers live in `../util/TODO_TESTS.md`; these rows cover the mention-specific schema contract.
- **Note**: `modules/core-collection-server/` is excluded from the standard jest run (`testPathIgnorePatterns`). Run tests via `node_modules/.bin/jest --testPathIgnorePatterns "/node_modules/" "modules/core-collection-server/model/mention"` from the `core-graphql-server/` service root.

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | high [security-coverage] | `mention.js:23 — Mention model (organizationId required validation)` | If the `presence: true` + `length: { minimum: 1 }` validation on `organizationId` were removed, mention operations without an organizationId would be accepted, violating tenant isolation and potentially surfacing cross-org mentions in search results. | mention.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 2 | implemented | medium | `mention.js:1 — Mention model (mentionSnippets embeddedModelArray)` | If the `embeddedModelArray` declaration for `mentionSnippets` were replaced with a plain `type: '*'` field, incoming mention payloads with snippets would skip `MentionSnippet` validation (required fields: startTime, endTime, text), silently accepting malformed snippet data that breaks rendering. | mention.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 3 | implemented | medium | `mention-snippet-hit.js:1 — MentionSnippetHit required fields` | If any of `startTime`, `endTime`, or `queryTerm` lost `required: true`, search hit highlights without all three fields would pass model validation, causing the search results renderer to fail with missing data at display time. | mention-snippet-hit.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 4 | implemented | medium | `mention-snippet.js:1 — MentionSnippet required fields + embedded hits` | If `startTime`, `endTime`, or `text` required constraints were removed, malformed snippets (e.g. a snippet with no text) could be persisted, breaking mention-search result rendering. Also verifies the `hits` field uses `embeddedModelArray(MentionSnippetHit)` so hit entries are validated on input. | mention-snippet.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 5 | implemented | medium | `user-snippet.js:1 — UserSnippet required fields` | If any of `startTime`, `endTime`, or `text` required constraints were removed, user-authored snippets with missing fields could be saved, breaking user-snippet display in the mention timeline. | user-snippet.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 6 | implemented | low | `fingerprint.js:1 — Fingerprint (fingerprintId required)` | If `required: true` on `fingerprintId` were removed, fingerprint models without an ID would pass validation, breaking fingerprint-based lookup operations that assume a non-null ID for DB queries. | fingerprint.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 7 | implemented | low | `ad-creative.js:1 — AdCreative schema fields` | If the `adId` or `isci` fields were removed from the schema, ad-creative data in mention API responses would stop deserializing those fields, silently dropping advertiser tracking identifiers. | ad-creative.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
| 8 | implemented | low | `index.js — re-export` | If `index.js` stopped re-exporting `Mention`, all callers importing the mention module directory would receive `undefined`, causing silent runtime failures at the caller module level. | index.spec.js | [#3967](https://github.com/veritone/aiware-core/pull/3967) |
