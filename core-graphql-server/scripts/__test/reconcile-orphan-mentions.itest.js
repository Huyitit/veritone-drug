#!/usr/bin/env node
/**
 * VE-24615 — local integration test harness for scripts/reconcile-orphan-mentions.js.
 *
 * DATA GENERATION + RESULT VERIFICATION. The reconcile script itself is run UNMODIFIED by the
 * operator between `seed` and `verify` — the destructive APPLY stays human-gated (appropriate for
 * a delete-in-prod script). This harness never touches the production script.
 *
 * Prereq: `make compose-citest-up` (Postgres `media_platform` with the Flyway'd `mention` table +
 * Elasticsearch). Connections default to the local compose stack; override with PG_CONN / ES_NODE.
 *
 * The fixture is seeded with mentionDate in 2025-06 — inside the reconcile script's DEFAULT window
 * (2025-01..2026-07) and older than MIN_AGE_HOURS — under a dedicated TEST org, so the operator can
 * run the script UNCHANGED (DRY_RUN=true, ORG_ID=null defaults) for the dry-run check with zero edits.
 * (MIN_AGE_HOURS behaviour needs a window including "now"; it is covered by the reconcile script's
 * standalone logic simulation, not this live fixture.)
 *
 * Usage:
 *   node scripts/__test/reconcile-orphan-mentions.itest.js seed
 *   # then run the reconcile script (see the RUNBOOK for connection flags):
 *   #   node scripts/reconcile-orphan-mentions.js …                     # dry-run
 *   #   node scripts/reconcile-orphan-mentions.js --apply --backup …    # delete + capture rollback
 *   node scripts/__test/reconcile-orphan-mentions.itest.js verify
 *   # optional rollback drill — replay the backup, then assert the pre-run state is back:
 *   #   node scripts/restore-orphan-mentions.js --apply --refresh …
 *   node scripts/__test/reconcile-orphan-mentions.itest.js verify-rollback
 *   node scripts/__test/reconcile-orphan-mentions.itest.js teardown
 */
const { Client } = require('es7');
const pgp = require('pg-promise')({ promiseLib: Promise });

const ES_NODE = process.env.ES_NODE || 'http://localhost:9200';
const PG_CONN =
  process.env.PG_CONN || 'postgres://postgres:postgres@localhost:5432/media_platform';

// ---- Fixture identity (isolated so teardown can never touch real data) ----
// mention.organization_id has an FK to organization, so we reuse the existing citest org (7682,
// created by R__00__citest_organization.sql). Isolation is by the unique fixture mention_date:
// the ES index bucket mention-2025.06 only ever holds June-2025 docs, and no baseline mention row
// uses this exact date, so scoping by (org, mention_date) touches only this fixture.
const TEST_ORG_ID = 7682;
const TEST_TU_ID = 888888;
const INDEX = 'mention-2025.06'; // bucket derived from mentionDate YYYY.MM
const ES_TYPE = '_doc';
const MENTION_DATE = '2025-06-15T12:00:00.000Z'; // in default window, older than MIN_AGE
// Orphan ES docs: fixed fake ids with NO row in `mention` (must be DELETED).
const ORPHAN_IDS = ['9000000000001', '9000000000002', '9000000000003'];
const VALID_COUNT = 2; // valid mentions seeded in both PG and ES (must be RETAINED)

const es = new Client({ node: ES_NODE });
const db = pgp(PG_CONN);

async function ensureIndex() {
  await es.indices.create(
    {
      index: INDEX,
      body: {
        mappings: {
          properties: {
            id: { type: 'long' },
            mentionDate: { type: 'date' },
            organizationId: { type: 'long' },
            trackingUnitId: { type: 'long' }
          }
        }
      }
    },
    { ignore: [400] } // already exists
  );
}

async function indexMentionDoc(id) {
  await es.index({
    index: INDEX,
    type: ES_TYPE,
    id: String(id),
    refresh: true,
    body: {
      id: Number(id),
      mentionDate: MENTION_DATE,
      organizationId: TEST_ORG_ID,
      trackingUnitId: TEST_TU_ID
    }
  });
}

// Insert one media + mention row (mirrors R__21__citest_insert_into_mention.sql), returning the
// auto-generated mention_id. JSON blobs are constant literals (no injection surface).
async function insertValidMention() {
  return db.tx(async t => {
    const media = await t.one(
      `INSERT INTO media (
         media_start_time, media_stop_time, status, transcode_source,
         transcode_percent_complete, transcribe_source, transcribe_percent_complete,
         media_source_id, date_created, date_modified, program_id, owner_application_id, is_public
       ) VALUES (
         '2020-01-05 14:49:42', '2020-01-05 14:52:42', 'uploaded', 'zencoder',
         0, 'mavis', 0,
         -1, now(), now(), -1, 'ed075985-bc94-406b-8639-44d1da42c3fb', true
       ) RETURNING media_id`
    );
    const mention = await t.one(
      `INSERT INTO mention (
         mention_status_id, mention_snippets, organization_id, program_id, media_id,
         media_source_id, media_source_type_id, mention_date, is_match, hit_start_date,
         hit_end_date, mention_end_date, metadata, mention_hit_count, created_at, updated_at
       ) VALUES (
         1, '[{"startTime":1,"endTime":2,"text":"itest"}]', $/orgId/, -1, $/mediaId/,
         -1, 5, $/mentionDate/, true, $/mentionDate/,
         $/mentionDate/, $/mentionDate/, '{"itest":true}', 1, now(), now()
       ) RETURNING mention_id`,
      { orgId: TEST_ORG_ID, mediaId: media.media_id, mentionDate: MENTION_DATE }
    );
    return { mentionId: String(mention.mention_id), mediaId: media.media_id };
  });
}

async function validMentionIds() {
  const rows = await db.query(
    'SELECT mention_id FROM mention WHERE organization_id = $1 AND mention_date = $2 ORDER BY mention_id',
    [TEST_ORG_ID, MENTION_DATE]
  );
  return rows.map(r => String(r.mention_id));
}

async function esExists(id) {
  const res = await es.exists({ index: INDEX, type: ES_TYPE, id: String(id) }, { ignore: [404] });
  return res.body === true;
}

async function esSource(id) {
  const res = await es.get({ index: INDEX, type: ES_TYPE, id: String(id) }, { ignore: [404] });
  return res.body && res.body.found ? res.body._source : null;
}

// What indexMentionDoc() wrote — a restore must reproduce this byte-for-byte, not an approximation.
function expectedSource(id) {
  return {
    id: Number(id),
    mentionDate: MENTION_DATE,
    organizationId: TEST_ORG_ID,
    trackingUnitId: TEST_TU_ID
  };
}

// Remove any prior fixture state so seed always yields exactly this fixture (isolation-proof).
async function cleanup() {
  await es.deleteByQuery(
    {
      index: INDEX,
      refresh: true,
      conflicts: 'proceed',
      body: { query: { term: { organizationId: TEST_ORG_ID } } }
    },
    { ignore: [404] }
  );
  const removed = await db.query(
    'DELETE FROM mention WHERE organization_id = $1 AND mention_date = $2 RETURNING media_id',
    [TEST_ORG_ID, MENTION_DATE]
  );
  const mediaIds = removed.map(r => r.media_id).filter(id => id != null);
  if (mediaIds.length) {
    await db.query('DELETE FROM media WHERE media_id = ANY($1::bigint[])', [mediaIds]);
  }
  return removed.length;
}

async function seed() {
  await ensureIndex();
  await cleanup(); // start from a known-clean fixture regardless of prior runs

  // Valid mentions: DB row + matching ES doc (must survive reconcile).
  const validIds = [];
  for (let i = 0; i < VALID_COUNT; i++) {
    const { mentionId } = await insertValidMention();
    await indexMentionDoc(mentionId);
    validIds.push(mentionId);
  }

  // Orphan ES docs: no DB row (must be deleted by reconcile).
  for (const id of ORPHAN_IDS) {
    await indexMentionDoc(id);
  }

  console.log('[itest] seeded fixture:');
  console.log(`  index=${INDEX} org=${TEST_ORG_ID}`);
  console.log(`  valid (RETAIN) mention_ids = ${JSON.stringify(validIds)}`);
  console.log(`  orphan (DELETE) ids        = ${JSON.stringify(ORPHAN_IDS)}`);
  console.log(
    `  expected reconcile: scanned=${validIds.length + ORPHAN_IDS.length} orphans=${ORPHAN_IDS.length}`
  );
  const scope =
    '--org=7682 --from=2025-06-01T00:00:00Z --to=2025-07-01T00:00:00Z';
  console.log('\nNext: run the script against this stack (pick your connection flags):');
  console.log(`  # local host:   node scripts/reconcile-orphan-mentions.js ${scope} \\`);
  console.log('                    --es=http://localhost:9200 --db=postgres://postgres:postgres@localhost:5432/media_platform');
  console.log(`  # local docker: node scripts/reconcile-orphan-mentions.js ${scope} --conf=/config/graphql.json`);
  console.log('  # add --apply to delete (dry-run by default)');
  console.log('Then: node scripts/__test/reconcile-orphan-mentions.itest.js verify');
}

async function verify() {
  const failures = [];

  // 1. Orphans must be gone.
  for (const id of ORPHAN_IDS) {
    if (await esExists(id)) failures.push(`orphan ${id} still present in ES (expected deleted)`);
  }

  // 2. Valid mentions must remain in ES...
  const validIds = await validMentionIds();
  if (validIds.length !== VALID_COUNT) {
    failures.push(`expected ${VALID_COUNT} valid mention rows in DB, found ${validIds.length}`);
  }
  for (const id of validIds) {
    if (!(await esExists(id))) failures.push(`valid mention ${id} missing from ES (wrongly deleted)`);
  }

  // 3. ...and the script must never have touched the DB rows.
  if (validIds.length !== VALID_COUNT) {
    failures.push('valid mention DB rows changed — reconcile must not write to the DB');
  }

  if (failures.length) {
    console.error('[itest] FAIL');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[itest] PASS — ${ORPHAN_IDS.length} orphans deleted, ${validIds.length} valid mentions retained, DB untouched.`
    );
  }
}

// Rollback drill: after restore-orphan-mentions.js --apply, the fixture must be back to its exact
// post-seed state — same ids, same _source — and the valid mentions must still be intact.
async function verifyRollback() {
  const failures = [];

  for (const id of ORPHAN_IDS) {
    const src = await esSource(id);
    if (!src) {
      failures.push(`orphan ${id} not restored to ES`);
      continue;
    }
    const want = expectedSource(id);
    const got = JSON.stringify(src, Object.keys(want).sort());
    if (got !== JSON.stringify(want, Object.keys(want).sort())) {
      failures.push(`orphan ${id} restored with wrong _source: ${JSON.stringify(src)}`);
    }
  }

  const validIds = await validMentionIds();
  if (validIds.length !== VALID_COUNT) {
    failures.push(`expected ${VALID_COUNT} valid mention rows in DB, found ${validIds.length}`);
  }
  for (const id of validIds) {
    if (!(await esExists(id))) failures.push(`valid mention ${id} missing from ES after restore`);
  }

  if (failures.length) {
    console.error('[itest] ROLLBACK FAIL');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[itest] ROLLBACK PASS — ${ORPHAN_IDS.length} deleted docs restored with identical _source, ` +
        `${validIds.length} valid mentions intact.`
    );
  }
}

async function teardown() {
  const n = await cleanup();
  console.log(`[itest] teardown complete — removed ${n} fixture mentions.`);
}

async function main() {
  const cmd = process.argv[2];
  const commands = { seed, verify, 'verify-rollback': verifyRollback, teardown };
  if (!commands[cmd]) {
    console.error('usage: reconcile-orphan-mentions.itest.js <seed|verify|verify-rollback|teardown>');
    process.exitCode = 2;
    return;
  }
  await commands[cmd]();
}

main()
  .then(() => pgp.end())
  .catch(err => {
    console.error(err);
    pgp.end();
    process.exitCode = 1;
  });
