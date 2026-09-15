# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server

## Test framework

- **Runner**: Jest. Tests next-to-source per repo convention.

## Coverage map

**No existing specs anywhere in this module subtree.** This is a substantial test-coverage gap.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implementing | medium | `core-collection-util.js — module utility helpers` | A regression in the collection-utility helpers would cascade across the entire module. Verify the documented public helper signatures + happy paths. | VE-22928 |  |
| 2 | implementing | medium | `core-collection-util.js:26 — getMentionSnippetText (non-object input)` | Passing a non-object to `getMentionSnippetText` would return undefined instead of null, breaking callers that check `=== null`. | VE-22928 |  |
| 3 | implementing | medium | `core-collection-util.js:26 — getMentionSnippetText (userSnippets vs mentionSnippets)` | Removing the `userSnippets` priority branch would cause user-provided snippet overrides to be ignored, falling back to auto-generated snippets for all mentions. | VE-22928 |  |
| 4 | implementing | medium | `core-collection-util.js:60 — getShareButtonText (mediaSourceTypeId branch)` | A regression in the mediaSourceTypeId→type mapping would return an empty string for TV/YouTube/radio/podcast mentions instead of "Watch"/"Listen to", breaking share email copy. | VE-22928 |  |
| 5 | implementing | medium | `core-collection-util.js:121 — errorToFolderErrorObject (errorType→httpStatus mapping)` | A regression in the errorType switch would return HTTP 500 for `read_access_only` instead of 403, causing the UI to show a generic error for permission failures. | VE-22928 |  |
| 6 | implementing | medium | `core-collection-util.js:182 — convertToPlainObject (Date skip)` | A regression removing the `skipInstances` guard would cause Date objects in the result to be converted to plain `{}` instead of kept as Date instances, breaking date-comparison logic downstream. | VE-22928 |  |
