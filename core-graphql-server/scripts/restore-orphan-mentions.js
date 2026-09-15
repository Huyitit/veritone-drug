#!/usr/bin/env node
/**
 * VE-24615 — rollback for scripts/reconcile-orphan-mentions.js.
 *
 * Replays ./reconcile-orphans-backup.ndjson (written by that script's --backup) back into
 * Elasticsearch, restoring the exact { _index, _type, _id, _source } of every doc it deleted.
 * Dry-run by default; pass --apply to write. Connections resolve exactly as they do for the
 * reconcile script: --db / --es → --conf=<file> → ../server.json (this script needs ES only).
 *
 * The backup is a literal ES bulk body using the `create` action, so a replay only ever fills
 * holes: any doc that has since come back (re-indexed by mentionSync) reports version_conflict
 * and is left untouched. That makes restore idempotent and safe to re-run. --overwrite switches
 * to `index` (last-writer-wins) — only for a deliberate "force the backup state back" decision.
 *
 * A restored doc is an ORPHAN again by definition: it has no `mention` row. Rollback puts the
 * pre-run state back (search returns it, the mention still 404s in GraphQL); it does not repair
 * anything. Restore only to undo an incorrect/over-scoped delete.
 *
 * Options:
 *   --apply           actually index (default: dry-run — parse, validate, report, write nothing)
 *   --overwrite       use `index` instead of `create` (clobbers docs that are already back)
 *   --chunk=<n>       docs per bulk request (default 1000)
 *   --refresh         refresh the touched indices when done so the restore is visible to search
 *   --conf=<path>     config file (server.json/graphql.json shape) for connections
 *   --es=<node>       direct ES override (wins over --conf; URL may embed credentials)
 *   --help            print this usage and exit
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const _ = require('lodash');
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
  console.log(
    'usage: restore-orphan-mentions.js [--apply] [--overwrite] [--chunk=N] [--refresh]\n' +
      '       [--conf=PATH] [--es=NODE]   (see file header for details)'
  );
  process.exit(0);
}

const DRY_RUN = !ARGS.apply;
const OVERWRITE = Boolean(ARGS.overwrite);
const CHUNK = ARGS.chunk != null ? Number(ARGS.chunk) : 1000;
const DO_REFRESH = Boolean(ARGS.refresh);
// Fixed file name in the cwd, matching the reconcile script's --backup (no operator-supplied path,
// so no path-traversal surface). `cd` to the directory holding the backup before running.
const BACKUP_FILE = 'reconcile-orphans-backup.ndjson';

let _fileConfig;
function fileConfig() {
  if (_fileConfig) return _fileConfig;
  const p = ARGS.conf
    ? path.resolve(process.cwd(), ARGS.conf)
    : path.resolve(__dirname, '../server.json');
  _fileConfig = require(p);
  return _fileConfig;
}

let esNode;
let esAuth;
if (ARGS.es) {
  esNode = ARGS.es;
  esAuth = undefined;
} else {
  const c = _.get(fileConfig(), 'elastic.connection', {});
  esNode = c.host;
  esAuth = c.username ? { username: c.username, password: c.password } : undefined;
}
const es = new Client({ node: esNode, auth: esAuth });

// Parse the NDJSON bulk body back into { action, doc } pairs, validating as we go. A malformed
// backup must fail loudly here rather than half-restore: nothing is sent until the whole file parses.
async function readBackup() {
  if (!fs.existsSync(BACKUP_FILE)) {
    throw new Error(`${BACKUP_FILE} not found in ${process.cwd()} — cd to the directory holding it.`);
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(BACKUP_FILE),
    crlfDelay: Infinity
  });

  const entries = [];
  let pendingMeta = null;
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`${BACKUP_FILE}:${lineNo} — not valid JSON: ${err.message}`);
    }
    if (!pendingMeta) {
      const meta = parsed.create || parsed.index;
      if (!meta || !meta._index || meta._id == null) {
        throw new Error(`${BACKUP_FILE}:${lineNo} — expected a bulk action line with _index/_id.`);
      }
      pendingMeta = meta;
    } else {
      entries.push({ meta: pendingMeta, source: parsed });
      pendingMeta = null;
    }
  }
  if (pendingMeta) {
    throw new Error(`${BACKUP_FILE} — truncated: action line at EOF has no source line.`);
  }
  return entries;
}

async function restoreChunk(entries) {
  const action = OVERWRITE ? 'index' : 'create';
  const body = [];
  for (const e of entries) {
    body.push({ [action]: { _index: e.meta._index, _type: e.meta._type, _id: e.meta._id } });
    body.push(e.source);
  }
  const res = await es.bulk({ refresh: false, body }, { ignore: [404] });

  let restored = 0;
  let conflicts = 0;
  const errors = [];
  for (const item of _.get(res, 'body.items', [])) {
    const r = item[action];
    if (!r) continue;
    if (r.result === 'created' || r.result === 'updated') restored++;
    else if (r.status === 409) conflicts++;
    else if (r.status >= 400) errors.push(`${r._index}/${r._id}: ${JSON.stringify(r.error)}`);
  }
  return { restored, conflicts, errors };
}

async function run() {
  const entries = await readBackup();
  const indices = [...new Set(entries.map(e => e.meta._index))];

  console.log(
    `[restore] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY (WRITE)'} file=./${BACKUP_FILE} ` +
      `docs=${entries.length} action=${OVERWRITE ? 'index (OVERWRITE)' : 'create'} ` +
      `indices=${JSON.stringify(indices)}`
  );

  if (DRY_RUN) {
    console.log(`[restore] DONE mode=DRY-RUN parsed=${entries.length} restored=0 (nothing written)`);
    return;
  }
  if (!entries.length) return;

  let restoredTotal = 0;
  let conflictTotal = 0;
  const errorsTotal = [];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const res = await restoreChunk(slice);
    restoredTotal += res.restored;
    conflictTotal += res.conflicts;
    errorsTotal.push(...res.errors);
    console.log(
      `[restore] chunk ${i / CHUNK + 1} docs=${slice.length} restored=${res.restored} ` +
        `alreadyPresent=${res.conflicts} errors=${res.errors.length}`
    );
  }

  // The bulk writes use refresh:false; without this the restore is durable but not yet searchable.
  if (DO_REFRESH && indices.length) {
    await es.indices.refresh({ index: indices.join(',') }, { ignore: [404] });
    console.log(`[restore] refreshed ${indices.join(',')}`);
  }

  for (const e of errorsTotal.slice(0, 20)) console.error(`  restore error ${e}`);
  console.log(
    `[restore] DONE mode=APPLY parsed=${entries.length} restored=${restoredTotal} ` +
      `alreadyPresent=${conflictTotal} errors=${errorsTotal.length}`
  );
  if (errorsTotal.length) process.exitCode = 1;
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
