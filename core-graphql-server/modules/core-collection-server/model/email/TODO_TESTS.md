# TODO_TESTS — services/api/core-graphql-server/modules/core-collection-server/model/email

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
| 1 | implemented | medium | `email-options.js:7 — validateTemplateId (toEmail present with addresses, templateId missing)` | If the final templateId validation guard were removed, emails with a non-empty `toEmail` recipient list could be dispatched without a template ID, sending blank or malformed emails to end users. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
| 2 | implemented | medium | `email-options.js:7 — validateTemplateId (toEmail absent → templateId not required)` | If the `_.has(attributes, 'toEmail')` check were removed, payloads with no `toEmail` field would require a `templateId`, blocking valid non-email notification payloads from passing model validation. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
| 3 | implemented | medium | `email-options.js:7 — validateTemplateId (toEmail is empty array → templateId not required)` | If the `toEmail.length === 0` early-return branch were removed, payloads with an empty recipient list would require a templateId, producing unexpected validation errors for legitimate zero-recipient calls. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
| 4 | implemented | medium | `email-options.js:7 — validateTemplateId (toEmail whitespace-only string — converter interaction)` | The converter transforms whitespace-only `toEmail` to `['']` (non-empty array); the `toEmail.trim() === ''` branch is dead code. Actual behavior: whitespace-only toEmail still requires templateId after conversion. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
| 5 | implemented | low | `email-options.js:1 — toEmail convertOneOrManyCommaDelimitedString converter` | If the `convert: converters.convertOneOrManyCommaDelimitedString` were removed from the `toEmail` field, comma-delimited multi-recipient strings would not be split into arrays, silently delivering to only the first recipient or failing downstream. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
| 6 | implemented | low | `index.js — re-export` | If `index.js` stopped re-exporting `EmailOptions`, all callers importing the directory would receive `undefined`, causing silent runtime failures. | `email-options.spec.js` | https://github.com/veritone/aiware-core/pull/4006 |
