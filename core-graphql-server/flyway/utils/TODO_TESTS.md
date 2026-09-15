# TODO_TESTS — core-graphql-server/flyway/utils

Curated by `worker-psd-aqa`. Each row is one proposed test addition with a clear regression statement.
Anyone (human or this agent) may add rows; only the agent updates the `Implemented` and `PR` columns.

Append-only at the bullet level: once a row exists, don't silently delete it. Implementation marks the row done.

## Analysis

1 file: `pullVeritoneTemplatesToFlyway.js`. Developer migration utility script — IIFE (`(async function main() {})()`), no module exports. Requires a live Mandrill API key (hardcoded placeholder `{{REPLACE_WITH_YOUR_ACTUAL_API_KEY}}`). Not a production runtime module.

Internal (unexported) pure functions with testable logic:
- `convertTemplateExprToHbs(template)` — 5 regex substitutions converting Mandrill merge tags to Handlebars syntax; a wrong regex would silently corrupt generated SQL email templates.
- `sanitizeJsonString(str)` — strips control chars, calls `convertTemplateExprToHbs`, JSON-encodes, escapes SQL single quotes; a regression in the escape logic would produce malformed SQL.
- `generateInsertSQL(template)` — composes a SQL VALUES tuple; calls both helpers above.

All three are testable in isolation but require exporting them from the module (currently file-scoped closures). Testing without export changes is out of scope for this agent.

## Test framework

- **Runner**: Jest 29 (`pnpm --filter core-graphql-server test`)
- **Test framework configured**: Jest (inherited from cgql service)

## Gaps

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|-----|
| 1 | blocked (needs refactor) | medium | `pullVeritoneTemplatesToFlyway.js:59 — convertTemplateExprToHbs` | A regex regression (e.g. the `*\|IF:var\|*` → `{{#if var}}` substitution breaks on nested/dotted keys) would silently generate broken Handlebars templates in the flyway SQL migration, corrupting production email template rendering. Requires exporting the function before it can be unit-tested. | n/a — refactor needed | Not exported; all logic is file-scoped |
| 2 | blocked (needs refactor) | low | `pullVeritoneTemplatesToFlyway.js:79 — sanitizeJsonString` | A regression in the SQL single-quote escaping (`replace(/'/g, "''")`) would produce malformed SQL when template content contains apostrophes, causing flyway migration failures. Requires exporting the function. | n/a — refactor needed | Not exported; all logic is file-scoped |
