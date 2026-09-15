# TODO_TESTS — widget

Only a non-`.spec` `widget.spec.js`-shape file exists; depth-1 source files are not directly covered.

| # | Status | Priority | Subject | Regression this test would catch | Implemented | PR |
|---|--------|----------|---------|----------------------------------|-------------|----|
| 1 | implemented | low | `widget.js — Widget model schema` | Verify documented fields + required-fields. | widget.spec.js (rows #1–#4) | VE-24370 |
| 2 | implemented | low | `index.js — re-exports` | Verify documented re-exports. |  widget.spec.js (rows #1–#4) | VE-24370 |
| 3 | implemented | medium | `widget.js:68 — validateHexColor` (private validator via createModel validate field) | A non-hex-format color string (e.g., `"red"` or a 7-char string) would pass backgroundColor/borderColor/textColor field validation on Widget instead of returning an error. | widget.spec.js (rows #1–#4) | VE-24370 |
| 4 | implemented | medium | `widget.js:84 — validateStringArray` (private validator via createModel validate field) | A non-array value, or an array containing an empty string, would pass the seoTags validation on Widget instead of returning an error. | widget.spec.js (rows #1–#4) | VE-24370 |
