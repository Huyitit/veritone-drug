# How to Run Specific Test Spec Files in `core-graphql-server`

> **Audience**: QA Engineers & Developers running integration tests in this repository  
> **Target Project**: `citest` / `core-graphql-server`  
> **Test Frameworks**: Jest & Bun Test  
> **Author**: Senior API QA Lead  

---

## Table of Contents
1. [Prerequisites & Setup](#1-prerequisites--setup)
2. [Command Reference: Running a Specific Test File](#2-command-reference-running-a-specific-test-file)
   - [Method 1: Using Jest via `npm run citest` (Recommended for CI Alignment)](#method-1-using-jest-via-npm-run-citest-recommended-for-ci-alignment)
   - [Method 2: Using `bun test` (Fast Local Developer Iteration)](#method-2-using-bun-test-fast-local-developer-iteration)
3. [Running Specific Test Cases (`it` / `describe` Filters)](#3-running-specific-test-cases-it--describe-filters)
4. [Debugging a Test File in VS Code](#4-debugging-a-test-file-in-vs-code)
5. [Important Gotchas & Best Practices](#5-important-gotchas--best-practices)

---

## 1. Prerequisites & Setup

Integration tests in `citest` run against a live running GraphQL server instance.

Before executing any test spec file:

1. **Create `testconfig.json`**:
   Copy `testconfig-template.json` to `testconfig.json` in the `core-graphql-server` root directory:
   ```bash
   cp testconfig-template.json testconfig.json
   ```
2. **Configure Credentials**:
   Ensure `testconfig.json` points to your target server environment (e.g. `http://localhost:3000/graphql` or stage):
   ```json
   {
     "userName": "myemail+superadmin@veritone.com",
     "password": "changeme",
     "apiToken": "YOUR_API_TOKEN_HERE",
     "env": "aws-dev",
     "graphql_url": "http://localhost:3000/graphql"
   }
   ```

---

## 2. Command Reference: Running a Specific Test File

### Method 1: Using Jest via `npm run citest` (Recommended for CI Alignment)

From the root directory (`core-graphql-server`):

```bash
# Run a specific test spec file
npm run citest -- citest/tools/graphql-api/test/folder/RBAC/folderUserRbac.spec.ts
```

Or directly using `npx jest`:

```bash
npx jest citest/tools/graphql-api/test/folder/RBAC/folderUserRbac.spec.ts --projects citest --runInBand
```

> **Flags Explained**:
> - `--projects citest`: Tells Jest to load [`citest/jest.config.js`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/jest.config.js).
> - `--runInBand`: Executes tests sequentially in a single process (prevents race conditions and user session interference).

---

### Method 2: Using `bun test` (Fast Local Developer Iteration)

The sub-package [`citest/tools/graphql-api/package.json`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/package.json) is configured for `bun`:

```bash
# Navigate to the graphql-api tool directory
cd citest/tools/graphql-api

# Run a specific test spec file with bun
bun test test/folder/RBAC/folderUserRbac.spec.ts
```

---

## 3. Running Specific Test Cases (`it` / `describe` Filters)

To run a **single test case** (`it` block) inside a spec file without running the entire suite, use the `-t` or `--testNamePattern` filter:

### Using Jest:
```bash
npm run citest -- citest/tools/graphql-api/test/folder/RBAC/folderUserRbac.spec.ts -t "should get cms root folder"
```

### Using Bun:
```bash
cd citest/tools/graphql-api
bun test test/folder/RBAC/folderUserRbac.spec.ts -t "should get cms root folder"
```

---

## 4. Debugging a Test File in VS Code

Add the following launch configuration to your `.vscode/launch.json` to set breakpoints in VS Code:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Specific Test Spec",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "${file}",
        "--projects",
        "citest",
        "--runInBand",
        "--testTimeout=70000"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

Open the target spec file (e.g., [`folderUserRbac.spec.ts`](file:///home/huycao/Repos/veritone-drug/core-graphql-server/citest/tools/graphql-api/test/folder/RBAC/folderUserRbac.spec.ts)), set breakpoints, and launch **Debug Specific Test Spec** in VS Code.

---

## 5. Important Gotchas & Best Practices

1. **Always Use `--runInBand`**:
   Integration tests share server state and impersonate global/isolated users. Running spec files in parallel worker processes will cause authentication session collisions.
2. **Be Mindful of `beforeAll` Dependencies**:
   Tests inside a spec file depend on the suite-level `beforeAll` hook to bootstrap organizations and users. Avoid using `fit` or `it.only` if dependent variable state (e.g. `cmsRootFolderId` or `newFolderId`) is populated by an earlier `it` block in the same suite.
3. **Environment Shell**:
   Run test commands under `bash` (or `zsh`). `fish` shell syntax can mangle flag parameters.
