# TODO_TESTS — core-media-server/service/libraries/bll

TESTED: 4 of 8 files.

## Gaps

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `entity-identifier-type.js — entity identifier-type lookups` | A regression in the identifier-type mapping (e.g. dropping a known type) would silently break library-entity dedup. Verify documented type-string ↔ id mappings. | entity-identifier-type.spec.js | VE-24472 |
| 2 | implemented | medium | `library-collaborator.js — collaborator permissions` | A regression in the collaborator-permission model could silently grant the wrong access to library collaborators. Verify documented permission shape + the role-to-permission mapping. | library-collaborator.spec.js | VE-24472 |
| 3 | implemented | medium | `library-engine-model.js — library engine bindings` | A regression in the library↔engine binding shape would surface as engines failing to identify their target library. | library-engine-model.spec.js | VE-24472 |
| 4 | implemented | low | `index.js — bll aggregator` | Verify documented re-exports. | index.spec.js | VE-24472 |
