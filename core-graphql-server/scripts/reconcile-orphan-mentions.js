#!/usr/bin/env node
/**
 * VE-24615 — reconcile & delete orphan Elasticsearch mention documents.
 *
 * Deletes ES mention docs whose `mention_id` no longer has a row in the `mention` table
 * (orphans left behind by the pre-fix watchlist-deletion path). Bounded to a mentionDate
 * time range and processed in chunks. Dry-run by default; pass --apply to delete.
 *
 * Connections resolve from (first wins): --db / --es → --conf=<file> → ../server.json.
 * The one committed file runs unchanged in every environment. Note it must be run from a REPO
 * CHECKOUT, not a deployed pod: scripts/ is excluded by .dockerignore and node_modules is never
 * copied into the runtime image, so neither this file nor its deps exist there. Point it at the
 * target env with --db/--es (or --conf) over VPN/bastion. Run from a working directory OUTSIDE the
 * checkout — --backup/--out write customer content to cwd and are not gitignored.
 *   local docker : node scripts/reconcile-orphan-mentions.js --conf=/config/graphql.json
 *   local host   : node scripts/reconcile-orphan-mentions.js \
 *                    --es=http://localhost:9200 \
 *                    --db=postgres://postgres:postgres@localhost:5432/media_platform
 *   other env    : --conf=/path/to/that-env.json   (server.json / graphql.json shape)
 * Prod procedure (ITSM-gated), including the rollback contract: reconcile-orphan-mentions.ROLLBACK.md
 *
 * Safety model (two independent limits — a failure in either deletes LESS, never more):
 *   1) Time window — only docs with `mentionDate` in [--from, --to) are candidates.
 *   2) Per-batch DB confirmation — each candidate id must be confirmed ABSENT from `mention`
 *      (queried on the PRIMARY / write endpoint) before its exact { _index, _type, _id } is
 *      deleted. Never a wildcard index, never a date-derived index.
 * --min-age-hours clamps --to to now-N so freshly-indexed docs whose rows may not have replicated
 * are never treated as orphans. Re-running is idempotent (already-gone docs 404, ignored).
 * A real run (--apply) REQUIRES explicit --from and --to (no unbounded deletes).
 *
 * Rollback: --apply also REQUIRES --backup (or an explicit --no-backup opt-out). --backup captures
 * each orphan's full _source to ./reconcile-orphans-backup.ndjson — an ES bulk body using the
 * `create` action — fsync'd BEFORE the delete of that same batch, so no doc can be deleted without
 * a durable copy on disk. Replay it with scripts/restore-orphan-mentions.js (or a raw _bulk POST).
 * `create` means a replay can never clobber a doc that has since come back.
 *
 * Options:
 *   --apply                  actually delete (default: dry-run)
 *   --backup                 capture orphan _source to ./reconcile-orphans-backup.ndjson (cwd)
 *   --no-backup              explicit opt-out of the --apply backup requirement
 *   --from=<ISO> --to=<ISO>  mentionDate window (required with --apply)
 *   --org=<id>               scope to one organizationId
 *   --tu=<id,id,...>         scope to trackingUnitIds
 *   --chunk-hours=<n>        window size per pass (default 24)
 *   --min-age-hours=<n>      skip docs newer than now-N; 0 disables (default 24)
 *   --index=<pattern>        ES index pattern (default mention-*)
 *   --scroll-size=<n>        ES scroll page size (default 5000)
 *   --out                    write "<index>\t<_id>\t<mention_id>" per orphan to ./reconcile-orphans.tsv (cwd)
 *   --conf=<path>            config file (server.json/graphql.json shape) for connections
 *   --db=<conn>  --es=<node> direct connection overrides (win over --conf; URLs may embed creds)
 *   --help                   print this usage and exit
 */
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const moment = require('moment');
const pgp = require('pg-promise')({ promiseLib: Promise });
const pgConnStr = require('pg-connection-string');
const { Client } = require('es7');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));

if (ARGS.help) {
  // The header comment above is the authoritative usage; print a compact form here.
  console.log(
    'usage: reconcile-orphan-mentions.js [--apply] [--backup|--no-backup] [--from=ISO --to=ISO]\n' +
      '       [--org=ID] [--tu=IDs] [--chunk-hours=N] [--min-age-hours=N] [--index=PATTERN]\n' +
      '       [--scroll-size=N] [--out] [--conf=PATH] [--db=CONN] [--es=NODE]\n' +
      '       (--apply requires --from/--to and --backup; see file header for details)'
  );
  process.exit(0);
}

// ------------------------- run config (flags override defaults) -------------------------
const DRY_RUN = !ARGS.apply; // dry-run unless --apply
const START_DATE = ARGS.from || '2025-01-01T00:00:00Z'; // inclusive
const END_DATE = ARGS.to || '2026-07-01T00:00:00Z'; // exclusive
const CHUNK_HOURS = ARGS['chunk-hours'] != null ? Number(ARGS['chunk-hours']) : 24;
const MIN_AGE_HOURS = ARGS['min-age-hours'] != null ? Number(ARGS['min-age-hours']) : 24;
const ORG_ID = ARGS.org != null ? Number(ARGS.org) : null;
const TRACKING_UNIT_IDS = ARGS.tu ? String(ARGS.tu).split(',').map(s => Number(s.trim())) : null;
const MENTION_INDEX = ARGS.index || 'mention-*'; // public (mention-YYYY.MM) + private (mention-private-*)
const SCROLL_SIZE = ARGS['scroll-size'] != null ? Number(ARGS['scroll-size']) : 5000;
// --out is a boolean opt-in. The audit list is written to a FIXED file name in the cwd; the path is
// a string constant (no operator-controlled input), so there is no path-traversal / arbitrary-write
// surface. `cd` to the desired directory before running to control where it lands.
const WRITE_ORPHAN_LOG = Boolean(ARGS.out);
// --backup likewise writes a FIXED file name in the cwd (same no-operator-path rationale as --out).
const WRITE_BACKUP = Boolean(ARGS.backup);
const BACKUP_FILE = 'reconcile-orphans-backup.ndjson';
const ORPHAN_LOG_FILE = 'reconcile-orphans.tsv';

// ------------------------- connections -------------------------
// Lazily load the config file only when a direct --db/--es override is NOT supplied, so a run with
// both --db and --es needs no config file at all (and never touches an unrendered server.json).
let _fileConfig;
function fileConfig() {
  if (_fileConfig) return _fileConfig;
  const p = ARGS.conf
    ? path.resolve(process.cwd(), ARGS.conf)
    : path.resolve(__dirname, '../server.json');
  _fileConfig = require(p);
  return _fileConfig;
}

// mention table lives in the media_platform DB. Use the WRITE (primary) endpoint for the existence
// check so replica lag can't turn a just-inserted mention into a false orphan.
const dbConn = ARGS.db || fileConfig().db.media_platform.write;
const dbConfig = pgConnStr.parse(dbConn);
dbConfig.max = 1;
const db = pgp(dbConfig);

let esNode;
let esAuth;
if (ARGS.es) {
  esNode = ARGS.es; // URL may embed credentials (http://user:pass@host:9200)
  esAuth = undefined;
} else {
  const c = _.get(fileConfig(), 'elastic.connection', {});
  esNode = c.host;
  esAuth = c.username ? { username: c.username, password: c.password } : undefined;
}
const es = new Client({ node: esNode, auth: esAuth });

function buildQuery(windowStart, windowEnd) {
  const must = [
    { range: { mentionDate: { gte: windowStart.toISOString(), lt: windowEnd.toISOString() } } }
  ];
  if (ORG_ID != null) must.push({ term: { organizationId: ORG_ID } });
  if (TRACKING_UNIT_IDS) must.push({ terms: { trackingUnitId: TRACKING_UNIT_IDS } });
  return { bool: { must } };
}

// Confirm which of these mention_ids still exist in the DB (queried on primary).
async function existingMentionIds(ids) {
  const rows = await db.query(
    'SELECT mention_id FROM mention WHERE mention_id = ANY($1::bigint[])',
    [ids]
  );
  return new Set(rows.map(r => String(r.mention_id)));
}

// Durable, ordered backup of the docs about to be deleted. Written as an ES bulk body with the
// `create` action so a replay restores only what is still missing (409 on anything already back).
// writeSync+fsyncSync (not a stream) so the bytes are on disk BEFORE the delete they protect —
// a crash between the two must leave a backup with extra docs, never a delete with none.
function openBackup() {
  const fd = fs.openSync(BACKUP_FILE, 'w');
  return {
    writeBatch(docs) {
      if (!docs.length) return;
      let buf = '';
      for (const d of docs) {
        buf += `${JSON.stringify({ create: { _index: d._index, _type: d._type, _id: d._id } })}\n`;
        buf += `${JSON.stringify(d._source)}\n`;
      }
      fs.writeSync(fd, buf);
      fs.fsyncSync(fd);
    },
    close() {
      fs.closeSync(fd);
    }
  };
}

async function processWindow(windowStart, windowEnd, orphanLog, backup) {
  let scanned = 0;
  let orphans = 0;
  let deleted = 0;

  // 1. Scroll every ES mention doc in this time window. ES _id IS the mention_id (see
  //    mentionSync/es-util index()), so hit metadata alone (_index/_type/_id) is enough to decide
  //    and to delete — _source is fetched only when it has to be captured for rollback.
  let resp = await es.search(
    {
      index: MENTION_INDEX,
      scroll: '2m',
      size: SCROLL_SIZE,
      _source: Boolean(backup),
      body: { query: buildQuery(windowStart, windowEnd) }
    },
    { ignore: [404] }
  );
  let scrollId = _.get(resp, 'body._scroll_id');
  let hits = _.get(resp, 'body.hits.hits', []);

  try {
    while (hits.length) {
      scanned += hits.length;

      // 2. Map mention_id -> its exact ES doc coordinates.
      const idToDocs = new Map();
      for (const h of hits) {
        const mid = String(h._id);
        if (!idToDocs.has(mid)) idToDocs.set(mid, []);
        idToDocs.get(mid).push({ _index: h._index, _type: h._type, _id: h._id, _source: h._source });
      }

      // 3. Compare against the DB: anything not present is an orphan.
      const existing = await existingMentionIds([...idToDocs.keys()]);
      const ops = [];
      const doomed = [];
      for (const [mid, docs] of idToDocs) {
        if (existing.has(mid)) continue;
        orphans += docs.length;
        for (const d of docs) {
          if (orphanLog) orphanLog.write(`${d._index}\t${d._id}\t${mid}\n`);
          doomed.push(d);
          ops.push({ delete: { _index: d._index, _type: d._type, _id: d._id } });
        }
      }

      // 4. Back the batch up BEFORE deleting it — ordering is the whole point (see openBackup).
      if (backup) backup.writeBatch(doomed);

      // 5. Delete the orphans by their exact { _index, _type, _id } (only when not a dry run).
      if (!DRY_RUN && ops.length) {
        const bulk = await es.bulk({ refresh: false, body: ops }, { ignore: [404] });
        for (const item of _.get(bulk, 'body.items', [])) {
          const r = item.delete;
          if (r && r.result === 'deleted') {
            deleted++;
          } else if (r && r.status && r.status >= 400 && r.status !== 404) {
            console.error(`  delete error ${r._index}/${r._id}: ${JSON.stringify(r.error)}`);
          }
        }
      }

      resp = await es.scroll({ scroll_id: scrollId, scroll: '2m' });
      scrollId = _.get(resp, 'body._scroll_id');
      hits = _.get(resp, 'body.hits.hits', []);
    }
  } finally {
    if (scrollId) {
      await es.clearScroll({ body: { scroll_id: [scrollId] } }).catch(() => undefined);
    }
  }

  return { scanned, orphans, deleted };
}

function resolveRange() {
  const start = moment.utc(START_DATE, moment.ISO_8601, true);
  const end = moment.utc(END_DATE, moment.ISO_8601, true);
  if (!start.isValid() || !end.isValid()) {
    throw new Error('--from and --to must be valid ISO-8601 timestamps.');
  }
  if (!end.isAfter(start)) {
    throw new Error(`--to (${END_DATE}) must be after --from (${START_DATE}).`);
  }
  // Never delete unbounded: a real run must declare its window explicitly.
  if (!DRY_RUN && (!ARGS.from || !ARGS.to)) {
    throw new Error('A real run (--apply) requires explicit --from and --to.');
  }
  // Never delete without a rollback path. Opting out has to be a deliberate, auditable keystroke.
  if (!DRY_RUN && !WRITE_BACKUP && !ARGS['no-backup']) {
    throw new Error(
      'A real run (--apply) requires --backup (writes ./reconcile-orphans-backup.ndjson for rollback). ' +
        'Pass --no-backup only if you have accepted running without one.'
    );
  }

  // Replica-lag guard: clamp the end so recently-indexed docs are left alone.
  let effectiveEnd = end;
  if (MIN_AGE_HOURS > 0) {
    const cutoff = moment.utc().subtract(MIN_AGE_HOURS, 'hours');
    if (cutoff.isBefore(effectiveEnd)) {
      console.log(
        `[reconcile] MIN_AGE_HOURS=${MIN_AGE_HOURS}: clamping --to ${end.toISOString()} -> ${cutoff.toISOString()}`
      );
      effectiveEnd = cutoff;
    }
  }
  return { start, effectiveEnd };
}

async function run() {
  const { start, effectiveEnd } = resolveRange();

  console.log(
    `[reconcile] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY (DELETE)'} index=${MENTION_INDEX} ` +
      `range=[${start.toISOString()}, ${effectiveEnd.toISOString()}) chunkHours=${CHUNK_HOURS} ` +
      `org=${ORG_ID != null ? ORG_ID : 'ALL'} tus=${TRACKING_UNIT_IDS || 'ALL'}`
  );

  if (!start.isBefore(effectiveEnd)) {
    console.log('[reconcile] nothing to do — window is empty after MIN_AGE_HOURS clamp.');
    return;
  }

  const orphanLog = WRITE_ORPHAN_LOG ? fs.createWriteStream(ORPHAN_LOG_FILE, { flags: 'w' }) : null;
  const backup = WRITE_BACKUP ? openBackup() : null;
  if (backup) {
    console.log(`[reconcile] backup: capturing orphan _source to ./${BACKUP_FILE}`);
  }
  let scannedTotal = 0;
  let orphanTotal = 0;
  let deletedTotal = 0;

  let windowStart = start.clone();
  while (windowStart.isBefore(effectiveEnd)) {
    const windowEnd = moment.min(windowStart.clone().add(CHUNK_HOURS, 'hours'), effectiveEnd);
    try {
      const res = await processWindow(windowStart, windowEnd, orphanLog, backup);
      scannedTotal += res.scanned;
      orphanTotal += res.orphans;
      deletedTotal += res.deleted;
      console.log(
        `[reconcile] window [${windowStart.toISOString()}, ${windowEnd.toISOString()}) ` +
          `scanned=${res.scanned} orphans=${res.orphans}${DRY_RUN ? '' : ` deleted=${res.deleted}`}`
      );
    } catch (err) {
      // Fail observably and recoverably: the operator resumes from this exact window.
      // The partial backup stays on disk and still covers everything deleted so far.
      console.error(
        `[reconcile] FAILED in window [${windowStart.toISOString()}, ${windowEnd.toISOString()}). ` +
          `Resume with --from='${windowStart.toISOString()}'.` +
          (backup ? ` Backup so far: ./${BACKUP_FILE} (rename it before resuming — a resume truncates it).` : '')
      );
      if (backup) backup.close();
      if (orphanLog) orphanLog.end();
      throw err;
    }
    windowStart = windowEnd;
  }

  if (orphanLog) orphanLog.end();
  if (backup) backup.close();
  console.log(
    `[reconcile] DONE mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'} scanned=${scannedTotal} ` +
      `orphans=${orphanTotal} deleted=${deletedTotal}`
  );
  if (backup) {
    console.log(
      `[reconcile] backup written: ./${BACKUP_FILE} (${orphanTotal} docs) — ` +
        'restore with `node scripts/restore-orphan-mentions.js --apply` from this directory.'
    );
  }
}

run()
  .then(() => {
    pgp.end();
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    pgp.end();
    process.exit(1);
  });
