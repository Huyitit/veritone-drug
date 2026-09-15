---
name: js-to-ts-citest
description: Convert a legacy JS citest spec (citest/obsolete/<area>/*.spec.js) into its TS equivalent under citest/tools/graphql-api/test/<area>/*.spec.ts. Use when the user asks to "convert", "port", or "migrate" a citest JS spec to TypeScript, or references the JS-to-TS citest conversion pattern. Reuses the same test cases/assertions but rewires setup to createIsolatedSuperadmin, teardown to safe(), and GraphQL calls to the generated SDK (falling back to raw client.query only for operations the SDK doesn't cover).
argument-hint: "<path-to-js-spec-or-area-name>"
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# /js-to-ts-citest — Convert a legacy JS citest spec to TypeScript

The user invoked this with: $ARGUMENTS (a path to a `.spec.js` file under
`citest/obsolete/<area>/`, or just an area/file name to locate).

This repo is migrating its GraphQL API integration tests (`citest/`) from an old JS harness
(`citest/obsolete/<area>/*.spec.js`) to a new TS harness
(`citest/tools/graphql-api/test/<area>/*.spec.ts`). This skill ports one spec file at a time,
preserving its test cases and assertions while modernizing setup/teardown and API calls.

Reference example pair used to derive these rules — read both if you need to see a full diff:

- OLD: `citest/obsolete/folder/folderUserRootTreeObjectId.spec.js`
- NEW: `citest/tools/graphql-api/test/folder/folderUserRootTreeObjectId.spec.ts`

(Other converted pairs in the same `folder` area: `folderConversion`, `folderMultiOrg`,
`folderNonOlp`, `folderSearchContent`, `folders`, `foldersV2`, `watchlist` — cross-check
these for less-common patterns, e.g. raw-query fallback usage in `folderNonOlp.spec.ts`.)

## Step 1 — Locate source and destination

1. Resolve the JS source file under `citest/obsolete/<area>/<name>.spec.js`.
2. The destination is `citest/tools/graphql-api/test/<area>/<name>.spec.ts` (same area
   subfolder, same base filename, `.ts` extension). Create the area folder if it doesn't exist.
3. Read the JS file in full before converting anything.

## Step 2 — Rewrite imports

Drop all `require(...)` of the old JS helpers. Replace with the TS harness equivalents:

| Old JS                                                                                                    | New TS                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `require('../../helpers/index')` → `helpers.config`, `helpers.requestOptions`                             | `import { helpers } from '../../src/helpers'`                                                                                                                |
| `require('../../helpers/gql.js')` (`new GraphqlClient(env)` + `.connect()`)                               | `import { createGraphqlClient, AuthType, GraphqlClient, createClientWithUser } from '../../src/graphqlUtil'`                                                 |
| `require('../../helpers/cleanup/utils')` → `safe`                                                         | `import { safe } from '../../src/helpers/commonHelper'`                                                                                                      |
| `require('../../helpers/organization')` → `orgHelper.setupTestOrgAndUser`, `orgHelper.deleteOrganization` | `import { setupTestOrgAndUser } from '../helpers/organization.helper'` (deletion becomes an `sdk.updateOrganization({status: 'deleted'})` call — see Step 4) |
| `require('uuid')` (`uuid.v4()`)                                                                           | `import { v4 as uuidv4 } from 'uuid'`                                                                                                                        |
| `require('lodash')` (`_.find`, etc.)                                                                      | Prefer plain JS (`.find(...)`, destructuring) over pulling in lodash, unless the file already needs it for something non-trivial.                            |
| String enum values in inline queries/inputs (`agency`, `cms`, `deleted`)                                  | Generated enums from `../../src/gql` (or the operation's input type), e.g. `OrganizationType.Agency`, `RootFolderType.Cms`, `OrganizationStatus.Deleted`     |
| `globalThis.citestMarker \|\| 'citest-should-delete'`                                                     | `(global as any).citestMarker ?? 'citest-should-delete'`                                                                                                     |

Only import what the file actually uses — don't cargo-cult the full import list from the
reference example.

## Step 3 — Convert `beforeAll` setup to `createIsolatedSuperadmin`

**Every converted spec that needs a superadmin session MUST use `createIsolatedSuperadmin`
instead of the old shared `gqlClient.connect()` superadmin session.** This is a hard
correctness rule, not a style preference: a shared-session hard-delete of a test org
terminates every other spec's shared session in the shard (see the rationale comment block
at the top of `citest/tools/graphql-api/test/helpers/superadminSession.ts`).

Pattern:

```ts
let gqlClient: GraphqlClient;
let isolatedSuperadmin: Awaited<ReturnType<typeof createIsolatedSuperadmin>>;
let superOptions: Record<string, string>;

beforeAll(async () => {
  const env = helpers.config.env;
  gqlClient = await createGraphqlClient(AuthType.SESSION_TOKEN, env);

  isolatedSuperadmin = await createIsolatedSuperadmin(gqlClient);
  superOptions = isolatedSuperadmin.options;

  // ... org/user setup, routed through isolatedSuperadmin.client, not gqlClient ...
});
```

- `gqlClient` (the shared session) is used only to bootstrap `createIsolatedSuperadmin` — do
  not run test-org creation or mutations through it directly.
- Route all of the spec's actual setup work (`setupTestOrgAndUser`, direct `sdk.*` calls,
  `switchUserToOrganization`, etc.) through `isolatedSuperadmin.client`.
- `isolatedSuperadmin.options` replaces the old `superOptions` built from
  `helpers.requestOptions(superToken)`.
- If a helper needs raw request headers from a token string (e.g. after
  `switchUserToOrganization` returns a new token), use
  `helpers.requestOptions(token).headers` — note the new harness's `requestOptions` return
  shape nests headers under `.headers`, unlike the old JS harness which returned the headers
  object directly.

If the JS spec's `beforeAll` didn't need a superadmin at all (e.g. only used `adminOptions`
from an already-provisioned org), don't introduce `createIsolatedSuperadmin` — only add it
where the old code created/deleted an org via the shared superadmin session.

## Step 4 — Convert `afterAll` teardown to `safe`

Wrap every cleanup call in `safe(label, fn)` from `../../src/helpers/commonHelper` so one
failed cleanup doesn't abort the rest:

```ts
afterAll(async () => {
  for (const org of [testOrg1, testOrg2]) {
    if (org?.id) {
      await safe(`delete org ${org.id}`, () =>
        isolatedSuperadmin.client.sdk.updateOrganization(
          { input: { id: org.id, status: OrganizationStatus.Deleted } },
          superOptions,
        ),
      );
    }
  }

  await safe("cleanup isolated superadmin", () => isolatedSuperadmin.cleanup());
});
```

Rules:

- Org "deletion" is a **soft delete** via `sdk.updateOrganization({ input: { id, status:
OrganizationStatus.Deleted } }, superOptions)` — never the old REST hard-delete
  (`orgHelper.deleteOrganization` / `helpers.deleteOrganization`), which kills sessions.
- `isolatedSuperadmin.cleanup()` must be called last, inside its own `safe(...)`, after all
  spec-owned resources are torn down (it needs the spec's own teardown to have already run,
  per the JSDoc on `IsolatedSuperadmin.cleanup`).
- Convert every other ad hoc try/catch cleanup block in the old `afterAll` to `safe(...)` the
  same way — don't leave bare `await` cleanup calls that can throw and skip later cleanup steps.

## Step 5 — Convert GraphQL calls: SDK first, raw query as fallback

For every inline query/mutation string in the JS file:

1. **Check whether the generated SDK already has it.** Grep
   `citest/tools/graphql-api/src/gql/gql.ts` for the operation name (e.g.
   `grep -n "createRootFolders\|shareFolder" citest/tools/graphql-api/src/gql/gql.ts`) or check
   `citest/tools/graphql-api/src/gql/index.ts`. If it's exported, use
   `client.sdk.<operationName>(input, options)` — response shape is
   `{ data: { <operationName>: ... }, errors: [...] }`, so read through `res?.data?.<op>`.
2. **If the SDK does not expose it**, keep a raw string query/mutation and call it through
   `client.query(query, variables, options)` (same signature as the old harness) — do not
   invent an SDK call that doesn't exist. Check `citest/tools/graphql-api/src/queries/extracted/`
   for an existing reusable query builder for that operation before writing a new template
   string inline (see `folder.ts` in that directory, and its use as
   `shareTreeObjectQuery(...)` in `folderNonOlp.spec.ts`).
3. Prefer the isolated superadmin's client/sdk (`isolatedSuperadmin.client.sdk`) for
   superadmin-privileged calls, and the plain `gqlClient`/`client` for calls that don't need
   elevated rights, matching whichever client owned that call in the JS original.
4. Replace inline enum string literals in GraphQL variables (not raw query template strings)
   with the generated TS enum members where the SDK typing requires it (e.g.
   `rootFolderType: cms` → `{ rootFolderType: RootFolderType.Cms }`).

## Step 6 — Type the file

- Add types incrementally as needed to compile: `let x: any;` is acceptable for loosely-typed
  fixtures (org/user/folder objects returned from the API), but prefer inferring from `res.data`
  where cheap.
- Add non-null assertions (`!`) only where the JS logic already assumes definedness (e.g.
  right after an `expect(x).toBeDefined()`), not defensively everywhere.
- Convert helper functions used only within the file to typed local functions (see
  `tokenFromOptions`, `getUserRootFolder` in the reference example) rather than leaving them
  untyped.

## Step 7 — Verify

1. Confirm the new file type-checks: `cd citest/tools/graphql-api && npx tsc --noEmit` (or the
   project's existing lint/build script for this workspace — check `package.json` there first).
2. Diff test names/assertions against the JS original to confirm no test case, expectation, or
   edge case was dropped in the port.
3. Do **not** delete or modify the old `citest/obsolete/<area>/<name>.spec.js` file unless the
   user explicitly asks — leave the old JS spec in place until the user confirms the migration
   is complete and ready for removal.
