# RUNBOOK — reconcile-orphan-mentions.js (local test)

Hands-on run of `scripts/reconcile-orphan-mentions.js` so you can watch progress and inspect the
ES/DB data before/after. The `scripts/__test/reconcile-orphan-mentions.itest.js` harness generates a
controlled fixture (2 valid mentions + 3 orphans) and verifies the result.

- **Ticket:** VE-24615
- **Orphan** = an ES `mention-*` doc whose `mention_id` has **no** row in the `mention` table. The
  script deletes those, scoped to a `mentionDate` window, **dry-run by default** (add `--apply`).
- **Rollback:** `--apply` requires `--backup`, which captures each deleted doc's full `_source` to
  `./reconcile-orphans-backup.ndjson`; `scripts/restore-orphan-mentions.js` replays it. Methodology
  and trigger conditions: [`reconcile-orphan-mentions.ROLLBACK.md`](./reconcile-orphan-mentions.ROLLBACK.md).

## How connections resolve (one file, every environment)

The script reads DB/ES connections from, first-match-wins:

1. `--db=<conn>` / `--es=<node>` — direct overrides (URLs may embed credentials)
2. `--conf=<path>` — a config file in `server.json` / `graphql.json` shape
3. `../server.json` — the default (rendered in a deployed pod)

So the same committed file runs anywhere — pick the flags for where you're pointing it:

| Target | Connection flags |
|--------|------------------|
| Local host (stack on localhost) | `--es=http://localhost:9200 --db=postgres://postgres:postgres@localhost:5432/media_platform` |
| Local graphql **container** | `--conf=/config/graphql.json` |
| Any other env (dev/stage/prod) | `--conf=/path/to/that-env-config.json`, or `--es`/`--db` directly |

Run it from a **repo checkout**, not a deployed pod — `scripts/` is excluded from the build context
by `.dockerignore`, and `node_modules` is never copied into the runtime image, so neither the script
nor its dependencies exist in a running pod. For dev/stage/prod that means a host on VPN or a bastion
with access to the target ES and the Postgres **primary**.

For anything other than the local fixture, run from a working directory **outside the checkout** and
set `umask 077` first: `--backup` and `--out` write to the current directory, the backup contains
customer mention content, and neither filename is gitignored.

Run `node scripts/reconcile-orphan-mentions.js --help` for all options.

---

## 0. Prerequisites

Postgres + Elasticsearch reachable. From the service dir:

```bash
cd /Users/apple/veritone/aiware-core/services/api/core-graphql-server   # run all commands from here
curl -sf localhost:9200 >/dev/null && echo "ES up"
docker exec aiware-core-postgres-1 psql -U postgres -d media_platform -c "select count(*) from mention;"
```

## 1. Seed the fixture

```bash
node scripts/__test/reconcile-orphan-mentions.itest.js seed
```

Creates, under org `7682` / date `2025-06-15`, in index `mention-2025.06`: 2 **valid** mentions
(DB row + ES doc, must be RETAINED) and 3 **orphan** ES docs (`9000000000001..3`, no DB row, must be
DELETED). The seed is self-cleaning, so it always yields exactly this fixture.

## 2. Inspect BEFORE

```bash
# ES: 5 fixture docs searchable (2 valid + 3 orphans)
curl -s 'localhost:9200/mention-2025.06/_count' -H 'content-type: application/json' \
  -d '{"query":{"term":{"organizationId":7682}}}'

# ES: an orphan exists → "found" : true
curl -s 'localhost:9200/mention-2025.06/_doc/9000000000001?pretty' | grep '"found"'

# DB: the 2 valid rows (orphans have no row)
docker exec aiware-core-postgres-1 psql -U postgres -d media_platform \
  -c "select mention_id, mention_date from mention where organization_id=7682 and mention_date='2025-06-15T12:00:00Z';"
```

## 3. Run — DRY-RUN first (nothing is deleted)

Pick the connection flags for your target from the table above. Examples use local host; for the
graphql container swap in `--conf=/config/graphql.json` (and run via
`docker compose -f local.yml exec graphql …`).

```bash
node scripts/reconcile-orphan-mentions.js \
  --org=7682 --from=2025-06-01T00:00:00Z --to=2025-07-01T00:00:00Z \
  --es=http://localhost:9200 \
  --db=postgres://postgres:postgres@localhost:5432/media_platform
```

Watch one `[reconcile] window …` line per day; the `2025-06-15` window shows `scanned=5 orphans=3`,
ending `DONE mode=DRY-RUN scanned=5 orphans=3 deleted=0`. Re-run the Step-2 count — still 5.

## 4. Run — APPLY (delete for real)

Add `--apply` (a real run **requires** `--from`/`--to`, so it can never be unbounded, and
`--backup`, so it can never be irreversible):

```bash
node scripts/reconcile-orphan-mentions.js --apply --backup \
  --org=7682 --from=2025-06-01T00:00:00Z --to=2025-07-01T00:00:00Z \
  --es=http://localhost:9200 \
  --db=postgres://postgres:postgres@localhost:5432/media_platform
```

Expect `DONE mode=APPLY scanned=5 orphans=3 deleted=3`, followed by the backup path and doc count.
`./reconcile-orphans-backup.ndjson` now holds two lines per deleted doc (bulk action + `_source`).

Omitting `--backup` is refused with exit 1 before anything is scanned. `--no-backup` is the
deliberate opt-out and should not be used against a shared environment.

## 5. Inspect AFTER

```bash
# the script deletes with refresh:false — force a refresh so the search view catches up
curl -s -XPOST 'localhost:9200/mention-2025.06/_refresh' >/dev/null

# ES: only the 2 valid docs remain
curl -s 'localhost:9200/mention-2025.06/_count' -H 'content-type: application/json' \
  -d '{"query":{"term":{"organizationId":7682}}}'

# ES: an orphan now 404 → "found" : false
curl -s 'localhost:9200/mention-2025.06/_doc/9000000000001?pretty' | grep '"found"'

# DB: the 2 valid rows are untouched (the script never writes the DB)
docker exec aiware-core-postgres-1 psql -U postgres -d media_platform \
  -c "select mention_id from mention where organization_id=7682 and mention_date='2025-06-15T12:00:00Z';"

# automated check
node scripts/__test/reconcile-orphan-mentions.itest.js verify   # expect: PASS
```

## 6. Rollback drill (run this before any shared-environment apply)

Proves the backup taken in step 4 actually restores the pre-run state. Start from a completed
step 5 (orphans deleted, backup file present in the cwd).

```bash
# dry-run: parses and validates the whole backup, writes nothing
node scripts/restore-orphan-mentions.js --es=http://localhost:9200

# restore
node scripts/restore-orphan-mentions.js --apply --refresh --es=http://localhost:9200

# automated check — orphans back with identical _source, valid mentions intact
node scripts/__test/reconcile-orphan-mentions.itest.js verify-rollback   # expect: ROLLBACK PASS
```

Expect `DONE mode=APPLY parsed=3 restored=3 alreadyPresent=0 errors=0`.

Worth exercising the failure modes too — each must fail loudly and write nothing:

```bash
node scripts/reconcile-orphan-mentions.js --apply --org=7682 \
  --from=2025-06-01T00:00:00Z --to=2025-07-01T00:00:00Z --es=… --db=…   # no --backup → exit 1

node scripts/restore-orphan-mentions.js --apply --refresh --es=…   # re-run → restored=0 alreadyPresent=3
head -5 reconcile-orphans-backup.ndjson > t && mv t reconcile-orphans-backup.ndjson
node scripts/restore-orphan-mentions.js --apply --es=…              # truncated → exit 1
```

## 7. Cleanup

```bash
node scripts/__test/reconcile-orphan-mentions.itest.js teardown   # removes fixture DB rows + ES docs
rm -f reconcile-orphans.tsv reconcile-orphans-backup.ndjson
```

## Notes

- **Idempotent:** a second `--apply` deletes nothing new. An immediate re-run may still *report*
  `orphans=N` because of `refresh:false` (stale search view) while `deleted=0` — force `_refresh`
  (Step 5) to see the settled `scanned=2 orphans=0`.
- **Isolation:** the fixture uses the existing citest org `7682` and the unique date `2025-06-15`
  (`mention.organization_id` has an FK to `organization`, so a synthetic org id can't be used).
  Scope every run with `--org` + `--from`/`--to` to stay inside the fixture on a shared DB.
- **Other environments:** point `--conf` at that env's config (or pass `--db`/`--es`). Always
  DRY-RUN and review the counts / `--out` file before `--apply`, and archive the resulting
  `reconcile-orphans-backup.ndjson` off the operator host before closing the change ticket.
- **`--out`:** a boolean flag — writes the orphan audit list to `./reconcile-orphans.tsv` in the
  current working directory (fixed name, no operator-supplied path). `cd` to the desired output
  location before running.
