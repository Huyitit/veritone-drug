# TODO_TESTS — core-media-server/util

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | medium | `storage.s3.js — S3 storage wrapper` | A regression in S3 URL composition / signing would silently break media upload/download. Verify documented bucket/key composition + signing call args. | storage.s3.spec.js | VE-24483 |
| 2 | implemented | medium | `route-util.js — route helper utilities` | A regression in the route helpers would surface across all media-server endpoints. Verify documented helper signatures. | route-util.spec.js | VE-24483 |
| 3 | implemented | medium | `pagination.js — cursor/limit parser` | A regression in pagination parsing (e.g. negative limit accepted, cursor signature corruption) would surface as broken pagination + potential offset-based info-disclosure. Verify boundary cases. | pagination.spec.js | VE-24483 |
