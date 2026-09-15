# TODO_TESTS — media-server libraries/model

13 source files, **none tested.** This entire model subtree lacks specs.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implementing | medium | `library.js — Library model` | Verify documented field shape + required-fields (org-scope field critical). | VE-22929 |  |
| 2 | implementing | medium | `library-type.js / library-type-entity-identifier-type-link.js` | Verify documented schema + the type-link join shape. | VE-22929 |  |
| 3 | implementing | medium | `library-summary.js / library-collaborator.js / library-engine-model.js` | Library-association model family; verify documented schemas. | VE-22929 |  |
| 4 | implementing | medium | `entity.js / entity-summary.js / entity-type.js / entity-identifier.js / entity-identifier-type.js` | Entity model family — large; verify the documented schema for each. | VE-22929 |  |
| 5 | implementing | medium | `organization.js — module-scoped Organization view` | Verify documented field shape; the org-scope field is critical for cross-tenant isolation. | VE-22929 |  |
| 6 | implementing | low | `index.js — re-exports` | Verify documented re-exports. | VE-22929 |  |
