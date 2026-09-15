# TODO_TESTS — services/api/core-graphql-server/.github/scripts

Curated by `starlord-aqa` (automation; formerly the `worker-psd-aqa` VM agent). Each row is
one proposed test addition with a clear regression statement. Anyone (human or automation) may add
rows; only the automation updates `Implemented` and `PR`.

Append-only at the bullet level — implementation marks a row done, it never disappears.

## Test framework

- Runner: Jest 29.7.0 (root `core-graphql-server` project — see `package.json`'s inline `"jest"`
  block; `testPathIgnorePatterns` excludes `/node_modules/`, `/_instrumented/`, `/citest/`). No
  `.github/scripts`-local jest config — this dir is covered by the repo-root project if a spec is
  added here.
- Coverage command: `pnpm test` → `jest --coverage --coverageDirectory=coverage`.
- Test-file convention: co-located `*.spec.js` next to the source file at the repo root (e.g.
  `buildinfo.spec.js` beside `buildinfo.js`) — no existing spec anywhere under `.github/scripts/`.
- Mocking: `jest.mock()` + `jest.resetModules()` + re-require inside `beforeEach` (see
  `buildinfo.spec.js`) — no Babel hoisting for the root jest project, so `jest.mock` calls must be
  written before the corresponding `require`/re-require, not relied on to hoist.
- Fixtures: inline, no shared fixture directory observed at this level.
- Gotcha: `shard-test-files.js` is a top-level script, not a module exporting functions — it reads
  `process.env.SHARD_INDEX`/`MAX_SHARDS` at require-time and calls `process.exit(1)` on invalid
  paths. Testing it requires either (a) invoking it via `child_process.execFileSync('node',
  [...])` with env vars set and capturing stdout/exit code, or (b) `jest.resetModules()` +
  `jest.mock('glob')` + stubbing `process.env`/`process.exit` before each `require(...)`, mirroring
  the `buildinfo.spec.js` pattern.
- **Discovery note**: repo-wide grep for `shard-test-files` (workflows, actions, Makefiles,
  Dockerfiles, compose files) found zero callers. `run-ci-test-shard.sh` (this file's sibling, a
  `.sh` so out of this task's production-file scope) is the file actually wired into
  `shard-citest.yml`'s `citest-runner.command`, and it shards via Jest's own `--shard` flag —
  not via this script. `shard-test-files.js` appears to be an orphaned/superseded sharding
  approach. Flagging for human triage rather than assuming it's live production code; rows below
  are filed at low priority accordingly.

| # | Status | Priority | Subject (file:line — function) | Regression this test would catch | Implemented | PR |
|---|--------|----------|--------------------------------|----------------------------------|-------------|----|
| 1 | implemented | low | `shard-test-files.js:10 — SHARD_INDEX/MAX_SHARDS validation` | Test would fail if a missing or non-numeric `SHARD_INDEX`/`MAX_SHARDS` stopped exiting 1 with "ERROR: SHARD_INDEX and MAX_SHARDS must be valid numbers." | `shard-test-files.spec.js` — "exits 1 with an error when SHARD_INDEX or MAX_SHARDS is not a valid number" (VE-27634 row 1) | (pending — framework will open PR) |
| 2 | implemented | low | `shard-test-files.js:17-20 — testPathIgnorePatterns filtering` | Test would fail if the glob-matched list stopped excluding files whose parent dir basename appears in `citest/jest.config.js`'s `testPathIgnorePatterns` | `shard-test-files.spec.js` — "excludes test files whose parent directory matches a testPathIgnorePatterns entry" (VE-27634 row 2) | (pending — framework will open PR) |
| 3 | implemented | low | `shard-test-files.js:22-27 — empty discovery error path` | Test would fail if zero matched test files stopped exiting 1 with "ERROR: No test files found" | `shard-test-files.spec.js` — "exits 1 with an error when no test files are found" (VE-27634 row 3) | (pending — framework will open PR) |
| 4 | implemented | low | `shard-test-files.js:29-34 — modulo shard selection` | Test would fail if `allTests.filter((_, i) => i % MAX_SHARDS === SHARD_INDEX - 1)` regressed to an off-by-one (e.g. `SHARD_INDEX` instead of `SHARD_INDEX - 1`), causing shard 1 to receive the wrong subset or shards to overlap/skip files | `shard-test-files.spec.js` — "selects files by (index % MAX_SHARDS === SHARD_INDEX - 1), not an off-by-one" (VE-27634 row 4) | (pending — framework will open PR) |
| 5 | implemented | low | `shard-test-files.js:31-36 — empty-selection error path and stdout contract` | Test would fail if a `MAX_SHARDS` larger than the file count stopped exiting 1 for the empty shard, or if the success path stopped emitting the exact `__TEST_FILES__ <space-separated paths>` line a caller greps for | `shard-test-files.spec.js` — "exits 1 for an oversized MAX_SHARDS..." + "emits the exact __TEST_FILES__ stdout contract..." (VE-27634 row 5) | (pending — framework will open PR) |
