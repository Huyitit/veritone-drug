'use strict';

// VE-24929 (U-SHARED-CORE, BL-4 / BR-7) — guard for the additive destination_type SEED convention.
//
// Social destinations are added as DATA via additive Flyway migrations in flyway/db/platform/sql (the VP-2581
// foundation seeds YouTube at V3_292; Facebook/Instagram/TikTok are seeded at V3_295). This test scans every
// destination_type SEED and enforces the convention so a future seed can't silently break it:
//   1. platform value is LOWERCASE (BR-1: engine-registry lookup, completeDestinationConnection match, catalog filter).
//   2. the seed is ADDITIVE only — no DDL (CREATE/ALTER/DROP TABLE, ADD COLUMN). Schema changes (e.g. the engine_id
//      unique-index drop, V3_294) live in their OWN migration, not in a seed.
//   3. every row REUSES the shared generic distribute engine UUID — no new job_new.engine row (Q-AD4 / VE-24797:
//      one engine serves every platform, so engine_id is intentionally shared).

const fs = require('fs');
const path = require('path');
const chaiExpect = require('chai').expect;

const SQL_DIR = path.join(__dirname, '..', '..', '..', 'flyway', 'db', 'platform', 'sql');
const GENERIC_ENGINE_UUID = '16568b5f-2aaa-48e6-975b-2dec5f098a29';

// Strip line comments and ::type casts so a positional VALUES parse is reliable.
function preprocess(sql) {
  return sql
    .replace(/--[^\n]*/g, '') // line comments
    .replace(/::[a-zA-Z_][\w.]*/g, '') // ::uuid / ::public.engine_state casts
    .replace(/\s+/g, ' ');
}

// Read the parenthesized tuple starting at/after `from`, respecting single-quoted strings (which may contain '(' ')'
// e.g. the name 'YouTube (Ayrshare)') and escaped '' quotes. Returns the inner text, or null.
function readParenTuple(s, from) {
  let i = from;
  while (i < s.length && s[i] !== '(') i++;
  if (i >= s.length) return null;
  i++;
  let depth = 1;
  let inQuote = false;
  let buf = '';
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === "'" && s[i + 1] === "'") {
        buf += "''";
        i++;
      } else if (ch === "'") {
        inQuote = false;
        buf += ch;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      buf += ch;
    } else if (ch === '(') {
      depth++;
      buf += ch;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return buf;
      buf += ch;
    } else {
      buf += ch;
    }
  }
  return null;
}

// Split a tuple on top-level commas, respecting quotes/nesting.
function splitTopLevel(tuple) {
  const parts = [];
  let buf = '';
  let inQuote = false;
  let depth = 0;
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    if (inQuote) {
      if (ch === "'" && tuple[i + 1] === "'") {
        buf += "''";
        i++;
      } else if (ch === "'") {
        inQuote = false;
        buf += ch;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      buf += ch;
    } else if (ch === '(') {
      depth++;
      buf += ch;
    } else if (ch === ')') {
      depth--;
      buf += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

// Extract every platform value from all `INSERT INTO public.destination_type (cols) VALUES (row), (row), …`
// statements in a preprocessed SQL string (supports multi-row VALUES).
function extractPlatformValues(cleanSql) {
  const results = [];
  const colRe = /INSERT\s+INTO\s+public\.destination_type\s*\(([^)]*)\)\s*VALUES\s*/gi;
  let m;
  while ((m = colRe.exec(cleanSql)) !== null) {
    const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
    const idx = cols.indexOf('platform');
    let cursor = colRe.lastIndex;
    while (cursor < cleanSql.length) {
      while (cursor < cleanSql.length && /[\s,]/.test(cleanSql[cursor])) cursor++;
      if (cleanSql[cursor] !== '(') break; // end of the VALUES list
      const tuple = readParenTuple(cleanSql, cursor);
      if (tuple === null) {
        results.push({ ok: false });
        break;
      }
      cursor += tuple.length + 2; // advance past this "(...)"
      const vals = splitTopLevel(tuple);
      if (idx === -1 || idx >= vals.length) {
        results.push({ ok: false });
        continue;
      }
      const unquoted = vals[idx].replace(/^'([^']*)'$/, '$1');
      results.push({ ok: true, value: unquoted });
    }
  }
  return results;
}

function destinationTypeSeedFiles() {
  if (!fs.existsSync(SQL_DIR)) {
    return [];
  }
  return fs
    .readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(SQL_DIR, f), 'utf8') }))
    .filter((f) => /INTO\s+public\.destination_type/i.test(f.sql));
}

describe('social destination_type seed convention (BL-4 / BR-7)', function () {
  const files = destinationTypeSeedFiles();

  it('finds the YouTube (V3_292) and social (V3_295) seeds', function () {
    const names = files.map((f) => f.name);
    chaiExpect(names).to.include('V3_292__seed_youtube_ayrshare_destination_type.sql');
    chaiExpect(names).to.include('V3_295__seed_social_destinations.sql');
  });

  files.forEach(function (file) {
    describe(file.name, function () {
      const clean = preprocess(file.sql);

      it('seeds only LOWERCASE platform values (BR-1)', function () {
        const platforms = extractPlatformValues(clean);
        chaiExpect(platforms.length, 'expected at least one destination_type INSERT').to.be.greaterThan(0);
        platforms.forEach(function (p) {
          chaiExpect(p.ok, `could not parse a platform value in ${file.name}`).to.equal(true);
          chaiExpect(p.value, `platform '${p.value}' must be lowercase`).to.equal(p.value.toLowerCase());
          chaiExpect(p.value).to.match(/^[a-z0-9_]+$/);
        });
      });

      it('is additive — contains no DDL (BR-7)', function () {
        chaiExpect(clean).to.not.match(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
        chaiExpect(clean).to.not.match(/\bADD\s+COLUMN\b/i);
      });

      it('reuses the shared generic engine UUID — no new engine row (Q-AD4 / VE-24797)', function () {
        chaiExpect(file.sql, 'destination_type seed should reference the shared generic engine UUID').to.include(
          GENERIC_ENGINE_UUID
        );
        chaiExpect(file.sql, 'a destination_type seed must not also INSERT a new engine row').to.not.match(
          /INSERT\s+INTO\s+job_new\.engine/i
        );
      });
    });
  });
});
