# ROLLBACK — reconcile-orphan-mentions.js

Rollback methodology for the VE-24615 orphan-mention cleanup. This is the document the change
ticket references; the operational steps for the run itself are in
[`reconcile-orphan-mentions.RUNBOOK.md`](./reconcile-orphan-mentions.RUNBOOK.md) (local fixture),
[`reconcile-orphan-mentions.DRILL.md`](./reconcile-orphan-mentions.DRILL.md) (cluster drill) and
[`reconcile-orphan-mentions.STAGE.md`](./reconcile-orphan-mentions.STAGE.md) (shared environments).

- **Ticket:** VE-24615
- **Blast radius:** Elasticsearch `mention-*` documents only.
- **Rollback mechanism:** document-level backup + replay (`--backup` → `restore-orphan-mentions.js`).
- **Rollback window:** bounded by the retention of the backup file — see §8. Technically the file is
  replayable indefinitely; operationally it must not be, because of what it contains.

> **The backup contains customer content.** Each line is a complete `mention` document `_source`:
> broadcast transcript text (`snippets[].text`), media URLs, organization and program metadata, and
> permission ACLs. Treat the file as customer data from the moment it is written — see §8 for
> handling, retention and destruction. This is not an ordinary ops artifact.

---

## 1. What the change can and cannot touch

| System | Effect | Rollback |
|---|---|---|
| Postgres `media_platform` | **None.** The script only performs an existence check against the `mention` table. It has no `INSERT`/`UPDATE`/`DELETE` path. | N/A — nothing to roll back |
| Elasticsearch `mention-*` docs | Deletes documents whose `mention_id` has no `mention` row | Replay the backup (§3) |
| Media, assets, S3 | **None** — never touched by this script | N/A |
| Application config / deploys | **None** — no service restart, no schema change, no feature flag | N/A |

Because the DB is read-only in this path, **a DB dump is not the safety net** and is not required.
Only ES documents are at risk, and only the ones the script proves are already orphaned.

## 2. Why a delete here is low-consequence even before rollback

Every deleted document is, by construction, one whose `mention_id` returns *"Mention not found"*
from Core GraphQL. These are the documents causing the reported bug: search returns them, every
downstream read of them fails. Deleting one removes a broken search result; it cannot remove a
working mention, because a working mention has a DB row and is therefore never a candidate.

## 3. The rollback mechanism

`--apply` requires `--backup` (or an explicit, auditable `--no-backup`). With `--backup`, for each
batch the script:

1. fetches the full `_source` of every doc it has confirmed is an orphan,
2. appends `{"create":{"_index":…,"_type":…,"_id":…}}` + the source line to
   `./reconcile-orphans-backup.ndjson`, and **`fsync`s it to disk**,
3. only then issues the bulk delete for that same batch.

The ordering is the guarantee: a crash between (2) and (3) leaves a backup containing *more* docs
than were deleted — never a delete with no backup. The file is a literal ES `_bulk` body.

The `create` action means a replay only fills holes — any document that has since been re-indexed
reports `version_conflict` (409) and is left untouched. Restore is therefore idempotent and cannot
clobber newer state.

### Where to run it from

Run from a working directory **outside any git checkout**. The scripts resolve their dependencies
from their own path, so the working directory only determines where the artifacts land:

```bash
umask 077                       # backup and TSV are created 0600, not world-readable
mkdir -p ~/ve-24615-run && cd ~/ve-24615-run
REPO=/path/to/aiware-core/services/api/core-graphql-server
```

Writing these files inside the repo puts customer transcripts in a dirty working tree, one
`git add -A` away from being committed. They are not covered by `.gitignore`.

### Restore procedure

```bash
# 1. Dry-run — parses and validates the whole file, writes nothing
node "$REPO/scripts/restore-orphan-mentions.js" --es="$ES"

# 2. Check the reported index list before writing anything
#    Every entry must be a mention-* index. Anything else means the archived
#    file was altered — stop, the restore writes wherever the file says.

# 3. Restore
node "$REPO/scripts/restore-orphan-mentions.js" --apply --refresh --es="$ES"
```

Expect `DONE mode=APPLY parsed=N restored=N alreadyPresent=0 errors=0`.
`--refresh` makes the restored docs immediately visible to search; without it the write is durable
but the search view lags until the next ES refresh interval.

For a large backup, raise the heap — the restore parses the whole file before writing anything:

```bash
node --max-old-space-size=8192 "$REPO/scripts/restore-orphan-mentions.js" --apply --refresh --es="$ES"
```

Keeping per-window backups small is the better answer; see §5.

### If the run was resumed, the backup is in parts

`restore-orphan-mentions.js` reads the fixed name `reconcile-orphans-backup.ndjson`. A resumed run
produces two or more files, and only the one still bearing that name is visible to the tool. The
backup is NDJSON, so the parts concatenate:

```bash
wc -l backup-part1.ndjson backup-part2.ndjson     # each MUST be even — see §4
cat backup-part1.ndjson backup-part2.ndjson > reconcile-orphans-backup.ndjson
node "$REPO/scripts/restore-orphan-mentions.js" --es="$ES"    # docs= must equal the sum of pairs
```

Concatenating a part with an odd line count misaligns every action/source pair after the join. Check
first.

### Raw replay, if node tooling is unavailable

The file is a bulk body and can be POSTed to the ES `_bulk` endpoint directly, then the indices
refreshed. Split it first if it exceeds the cluster's `http.max_content_length` (100 MB by default);
split on an even line boundary.

### What restore does *not* do

A restored document is an ORPHAN again by definition: it has no `mention` row. Rollback puts the
pre-run state back (search returns it, the mention still 404s in GraphQL); it does not repair
anything. Restore only to undo an incorrect or over-scoped delete.

It also does not restore the document's ES `_version`. `mentionSync` indexes with
`version_type: external`; a restored document returns at internal `_version: 1`. In practice this is
inert — a restored doc is an orphan, so the sync path short-circuits — but "exact pre-run state"
refers to `_index`/`_id`/`_source`, not versioning metadata.

## 4. Verifying the backup before you rely on it

Immediately after every apply, before the next window and before archiving:

```bash
wc -l backup-<window>.ndjson          # MUST equal exactly 2 × the reported deleted count
tail -c 200 backup-<window>.ndjson    # last line must be complete, well-formed JSON
```

An odd line count or a truncated tail means the file is incomplete. `restore-orphan-mentions.js`
fails closed on such a file rather than half-restoring, so detecting it here — while the documents
are still in ES on a dry run, or immediately after the apply — is the difference between a
recoverable and an unrecoverable situation.

## 5. Sizing so that rollback stays possible

Run large cleanups window by window, sized so each backup is comfortable to hold and replay.
Two properties drive this:

- The apply run opens the backup with truncate semantics on a **fixed filename**. Rename each
  window's file immediately after its apply, or the next window destroys it.
- The restore parses the whole file into memory before writing. Small per-window files keep every
  rollback tractable without heap flags.

## 6. Trigger conditions — when to roll back

Roll back if, after `--apply`:

- the `deleted=` count is materially larger than the `orphans=` count reviewed in the dry-run, or
- a spot-check finds a deleted `mention_id` that **does** resolve in Core GraphQL (i.e. a
  non-orphan was deleted — this should be impossible; it would mean the per-batch DB confirmation
  is querying the wrong database), or
- the backup line count does not equal 2 × the deleted count, or
- mention search error rates or result counts move in a way not explained by removing orphans, or
- the run is aborted mid-way and the decision is to return to the pre-run state rather than resume.

Otherwise there is nothing to undo: removing an orphan is the intended, verified outcome.

A post-check reporting `orphans=N` immediately after an apply is **not** a trigger — deletes use
`refresh: false`, so the search view lags. Refresh the indices and re-check before acting.

## 7. Guardrails that bound the damage before rollback is needed

Each of these fails *closed* — a fault in any one deletes **less**, never more.

| Guardrail | Effect |
|---|---|
| Dry-run default | Nothing is deleted without an explicit `--apply` |
| `--from` / `--to` mandatory with `--apply` | No unbounded delete is expressible |
| `--min-age-hours` (default 24) | Clamps `--to` to `now-24h`, so freshly-indexed docs whose rows may not have replicated are never candidates |
| Per-batch DB confirmation on the **primary** | Each id is proven absent from `mention` on the write endpoint — replica lag cannot manufacture an orphan |
| Exact `{_index,_type,_id}` deletes | Never a wildcard index, never a date-derived index, never a delete-by-query |
| `--org` / `--tu` scoping | Restricts a run to one organization / tracking unit |
| `--backup` required with `--apply` | No delete without a durable rollback file |
| `umask 077` before the run | Backup and TSV are created `0600` rather than world-readable |
| `--out` audit TSV | Independent record of exactly what was targeted |

## 8. Handling, retention and destruction of the backup

The backup is customer data. It must be handled as such for its whole life, which is short by
design.

- **Classification:** contains full mention `_source` — transcript text, media URLs, organization
  and program metadata, permission ACLs.
- **At rest on the operator host:** `0600` (set `umask 077` before the run), in a directory outside
  any git checkout, on an encrypted volume.
- **Archive destination:** the approved encrypted store named on the change ticket, access limited
  to the change's named operators. Not Slack, not personal cloud storage, not an unencrypted bucket.
- **Retention:** until the change ticket is closed and the post-check has been signed off. It is not
  an indefinite artifact — the "rollback window" ends when the change does.
- **Destruction:** delete both the operator-host copy and the archive copy at change closure, and
  record the deletion on the ticket. On APFS/SSD, secure-erase tooling is not reliable; rely on
  full-disk encryption plus deletion rather than claiming a wipe.
- **If the run is performed on a laptop**, note that endpoint backup and sync services (Time
  Machine, iCloud, Spotlight) may replicate the file. Keep it on a volume excluded from those.

## 9. Durability of the rollback artifact

By default the only copy of the rollback data lives on the operator's filesystem — no replication,
no checksum, no owner. For a production delete that is a thin boundary.

**Recommended:** take an Elasticsearch snapshot of the affected `mention-*` indices into the
existing snapshot repository before `--apply`, and record the snapshot id on the change ticket. That
is the cluster-native durable boundary for an ES delete; the NDJSON backup remains the fine-grained,
document-level supplement, and is what you would actually replay for a partial undo.

If no snapshot is taken, make "archive the backup off the operator host" a **gate** before the next
window rather than a closing note.

## 10. Pre-run evidence to attach to the change ticket

1. `[reconcile] DONE mode=DRY-RUN scanned=… orphans=…` line from the scoped dry-run.
2. `reconcile-orphans.tsv` — every `index / _id / mention_id` that would be deleted. Rename it after
   the dry run; the apply run truncates the same filename.
3. Spot-check of 3–5 sampled ids from that TSV, each confirmed to return *"Mention not found"* from
   Core GraphQL (proof they are genuinely orphaned).
4. Backup line count = 2 × the orphan count, and where the file is archived.
5. ES snapshot id, if taken (§9).

## 11. Verification of the rollback path

The delete→restore loop is exercised end-to-end by the local harness and has been run against real
data. Full drill, including the failure modes, in the DRILL doc.

| Check | Result |
|---|---|
| `--apply` without `--backup` refuses, exit 1, nothing written | PASS |
| `--apply --backup` deletes only orphans, retains valid mentions, DB untouched | PASS |
| Backup captures full `_source` for every deleted doc | PASS |
| Restore replays backup — docs restored with byte-identical `_source` | PASS (83 real documents on stage, canonical sha256 `9bc2ef50…` on both sides) |
| Restore re-run is idempotent — `restored=0 alreadyPresent=N`, no clobber | PASS |
| Truncated backup file — fails loudly, exit 1, writes nothing | PASS |
| Corrupt (non-JSON) backup line — fails loudly, writes nothing | PASS |
| Missing backup file — fails loudly with the expected cwd hint | PASS |

Not yet exercised: a delete large enough to require multiple scroll pages *with* `--backup`, and a
multi-part (resumed) restore. Size prod windows conservatively until those are covered.
