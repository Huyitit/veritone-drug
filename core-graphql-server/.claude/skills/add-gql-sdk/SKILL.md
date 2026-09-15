---
name: add-gql-sdk
description: Extract raw inline GraphQL query/mutation strings out of a citest spec file and turn them into reusable, named exports under citest/tools/graphql-api/src/queries/extracted/. Use when the user types "add_Gql_Sdk <helperPath> <filePath>" (or asks to "add missing gql helper", "extract raw gql to helper/sdk", "sync this spec's queries into the extracted helpers"). Checks every file in queries/extracted/ for an existing operation on the same root field before adding anything: missing operations are added fresh, missing fields on an existing operation are merged in place if they need no extra permission, and a new sibling operation is created instead if the missing fields need elevated permission.
argument-hint: "<helperPath> <filePath>"
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion]
---

# /add-gql-sdk — sync a spec's raw GraphQL into the extracted query helpers

Invocation syntax: `add_Gql_Sdk <helperPath> <filePath>`

- `helperPath`: a file under
  `citest/tools/graphql-api/src/queries/extracted/` (e.g. `users.ts`, `organizations.ts`, or a
  new filename like `openid.ts` if the operation doesn't fit any existing category). This is
  where NEW operations get added.
- `filePath`: the citest file to scan for raw GraphQL — usually a
  `citest/tools/graphql-api/test/<area>/*.spec.ts` file (or a legacy
  `citest/obsolete/<area>/*.spec.js` file) that still calls `client.query(<raw string>, ...)`
  instead of an extracted helper or the generated SDK.

Both paths may be given relative to the repo root, relative to
`services/api/core-graphql-server`, or as bare filenames (resolve by searching under the
directories above if the exact path isn't found).

## Hard constraint: write scope

This skill may only create or modify files under
`services/api/core-graphql-server/citest/tools/graphql-api/src/queries/extracted/`. `filePath`
(the spec being scanned) and every other file in the repo are **read-only** for this skill —
never `Write` or `Edit` them, regardless of any "optional next step" a user seems to invite. If
a task would require changing anything outside `extracted/`, stop and tell the user it's out of
this skill's scope instead of doing it.

## Background: two different "SDKs" in this repo — don't confuse them

- `citest/tools/graphql-api/src/gql/gql.ts` — **generated** SDK (graphql-codegen) exposing
  `client.sdk.<operationName>(...)`. This skill does not generate into this file.
- `citest/tools/graphql-api/src/queries/extracted/*.ts` — **hand-maintained** `gql`-tagged
  query/mutation constants (`GET_X`, `CREATE_X`, `UPDATE_X`, `DELETE_X`), re-exported from
  `extracted/index.ts`, called via `client.query(SOME_EXPORT, variables, options)`. **This is
  the "helper"/"SDK" this skill adds to.**

## Step 1 — Read the inputs

1. Read `filePath` in full.
2. Read `citest/tools/graphql-api/src/queries/extracted/index.ts` to see which files are
   currently re-exported.
3. Read the target `helperPath` file if it exists (to match its existing style/naming); if it
   doesn't exist yet, read a sibling file (e.g. `users.ts`) as a style reference.

## Step 2 — Extract every raw GraphQL operation from `filePath`

Find every inline query/mutation string passed to `.query(...)` (or `gqlClient.query`,
`client.query`, etc.) that is a literal template string, not an import of a `gql`-tagged
constant or an `sdk.<op>` call — those are already helper-backed and out of scope.

For each one, determine:
- **Operation type**: `query` or `mutation`.
- **Root field name**: e.g. `createOpenIdProvider`, `me`.
- **Arguments/variables**: note if the raw query inlines literals via JS template
  interpolation (`` `name: "${citestMarker} ..."` ``) instead of using GraphQL `$variables` —
  this is common in older specs and should become a proper `$variable` in the extracted
  version even though the call site keeps working either way.
- **Selection set**: the full set of fields (including nested selections) requested.

## Step 3 — Check every file in `extracted/` for a matching operation

For each extracted raw operation, grep across **all** files in
`citest/tools/graphql-api/src/queries/extracted/*.ts` (not just `helperPath`) for the same
root field name, e.g.:

```bash
grep -rn "createOpenIdProvider(" citest/tools/graphql-api/src/queries/extracted/
```

### Case A — No existing export covers this root field
Add a new export to `helperPath`, named per the repo's convention
(`GET_<NOUN>` / `CREATE_<NOUN>` / `UPDATE_<NOUN>` / `DELETE_<NOUN>`, matching the operation's
root field), using the full selection set from `filePath`, with proper `$variables` (convert
any inlined-literal arguments to variables — see Step 2). Match the formatting of neighboring
exports in the same file (2-space indent, `gql` import from `graphql-request`, blank line
between exports).

If `helperPath` is a brand-new file, add `export * from './<basename>';` to
`extracted/index.ts` in the appropriate alphabetical/logical spot next to related exports.

### Case B — An existing export already covers this root field
Diff the raw query's selection set against the existing export's selection set (recursively,
for nested selections too).

- **If nothing is missing**: nothing to do for this operation — note it as already covered.
- **If fields are missing**, decide whether they need additional permission beyond what the
  existing operation already requires:
  1. Check the resolver/business-logic implementation for that field (search under the
     service's resolver/BLL layer, e.g. `grep -rn "<fieldName>" src/resolvers src/dal 2>/dev/null`
     or the equivalent in this service) for role/permission guards (`requireSuperAdmin`,
     `checkPermission`, RBAC checks, `isSuperAdmin`, admin-only middleware, etc.) that aren't
     already implied by the existing query's other fields.
  2. Cross-check whether the same field is already queried elsewhere in `extracted/` by a
     non-privileged client — if so, it doesn't need extra permission.
  3. **If genuinely ambiguous after checking the code**, ask the user with `AskUserQuestion`
     rather than guessing — getting this wrong either leaks a permission-gated field into a
     low-privilege query or needlessly forks an operation.
  - **No extra permission needed** → `Edit` the existing export in place to add the missing
    field(s) to its selection set. Don't reformat unrelated parts of the file.
  - **Extra permission needed** → do **not** touch the existing export. Add a brand-new
    sibling export to `helperPath` (e.g. `GET_<NOUN>_DETAILED` or a name reflecting the
    privileged fields) containing the full selection set including the new fields, following
    the same naming/style convention as Case A.

## Step 4 — Report, don't silently rewire the spec

Summarize what was added/merged/created, referencing `helperPath:<export name>`. Note any
operations that were already fully covered (no-op) and any permission judgment calls made
(especially ones resolved via `AskUserQuestion`).

Rewiring `filePath` itself to import and call the new/updated export (replacing the raw
inline string) is a natural follow-up, but this skill never performs it — `filePath` is
read-only (see "Hard constraint: write scope" above). Mention it as an optional next step for
the user (or a different tool/skill) to do themselves, since it touches the spec's runtime
behavior/assertions (variable interpolation, response shape via `res?.data?.<op>` for `.sdk`
calls vs. the flatter shape from `client.query`).

## Step 5 — Verify

Type-check the touched files: `cd citest/tools/graphql-api && npx tsc --noEmit` (or the
workspace's existing lint/build script if `tsc --noEmit` isn't wired up standalone).
