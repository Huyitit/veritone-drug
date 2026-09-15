# TODO_TESTS — media-server libraries/model/util

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | done | medium | `convert.js — value-conversion helpers` | A regression in the DB→API conversion (type-casts, key transforms) would silently corrupt library entity responses. Verify documented conversion happy paths. | convert.spec.js | VE-24492 |
| 2 | done | medium | `validate.js — model validation helpers` | A regression in validation rules would let invalid library/entity data into the system. Verify the documented invalid-input rejections. | validate.spec.js | VE-24492 |
