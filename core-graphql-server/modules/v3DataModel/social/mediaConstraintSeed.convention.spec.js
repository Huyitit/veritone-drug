'use strict';

// VE-26450 — guard for the destination_media_constraint SEED convention.
//
// The values in this seed are load-bearing in a way that fails QUIETLY. A duration accidentally declared in
// seconds rather than milliseconds does not error — it just makes the check pass almost everything, and the
// symptom is the original defect coming back with a green test suite. A keyword ajv does not recognise is
// ignored rather than rejected, so a typo like "maximumm" silently enforces nothing. And `required` would turn
// an unmeasurable property from skipped into rejected, inverting the fail-open policy. None of that is caught
// by a unit test of the code, so it is asserted against the SQL itself.

const fs = require('fs');
const path = require('path');
const chaiExpect = require('chai').expect;
const Ajv = require('ajv');
const enforcement = require('./helper/mediaConstraintEnforcement.js');

const SQL_DIR = path.join(__dirname, '..', '..', '..', 'flyway', 'db', 'platform', 'sql');
const DDL_FILE = 'V3_299__create_destination_media_constraint.sql';
const SEED_FILE = 'V3_300__seed_destination_media_constraints.sql';

function read(file) {
  return fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '');
}

/**
 * One entry per seeded row: the two ids, the post type, and the PARSED constraint document.
 *
 * Matching on the literal shape rather than splitting the tuple positionally: a JSON document contains commas
 * and parentheses, so a positional split reads the wrong field the moment a limit is added. The document can
 * contain no `'`, which is what makes the non-greedy match up to `'::jsonb` exact.
 */
function seededRows(bare) {
  const ROW = /\(\s*'([0-9a-f-]{36})'::uuid,\s*'([0-9a-f-]{36})'::uuid,\s*'([^']*)',\s*'(\{[\s\S]*?\})'::jsonb,\s*'(\{[\s\S]*?\})'::jsonb/gi;
  const rows = [];
  let match;
  while ((match = ROW.exec(bare)) !== null) {
    rows.push({
      id: match[1].toLowerCase(),
      destinationTypeId: match[2].toLowerCase(),
      postType: match[3],
      schemaText: match[4],
      schema: JSON.parse(match[4]),
      recommendedText: match[5],
      recommended: JSON.parse(match[5])
    });
  }
  return rows;
}

/** Every {property, keyword, value} triple declared across a document. */
function declaredLimits(schema) {
  const properties = (schema && schema.properties) || {};
  return Object.keys(properties).flatMap((property) =>
    Object.keys(properties[property]).map((keyword) => ({
      property,
      keyword,
      value: properties[property][keyword]
    }))
  );
}

describe('destination_media_constraint seed convention (VE-26450)', function () {
  describe(DDL_FILE, function () {
    const sql = read(DDL_FILE);

    it('keys the table by (destination_type_id, post_type)', function () {
      // Without the post-type key, "Instagram: 3-900s" would wrongly allow a 300-second Story. The key is the
      // whole reason this is a table rather than columns on destination_type.
      chaiExpect(stripComments(sql)).to.match(
        /UNIQUE INDEX[\s\S]*?destination_type_id,\s*post_type/i
      );
    });

    it('stores the limits as a JSONB object, so a new limit is a row edit', function () {
      chaiExpect(stripComments(sql)).to.match(/constraint_schema\s+JSONB\s+NOT NULL/i);
      // A scalar or array would compile in ajv as something other than a schema, and the failure would be a
      // fall-through rather than an error.
      chaiExpect(stripComments(sql)).to.match(
        /CHECK\s*\(\s*jsonb_typeof\(constraint_schema\)\s*=\s*'object'\s*\)/i
      );
    });

    it('declares duration in milliseconds, matching Asset.fileData.mediaDurationMs', function () {
      chaiExpect(sql).to.contain('MILLISECONDS');
      // No seconds-denominated duration column may exist, or the unit contract has two answers.
      chaiExpect(stripComments(sql)).to.not.match(/duration_(min|max)_s(ec(onds)?)?\b/i);
    });

    it('keeps rejection thresholds and advisory values in SEPARATE columns', function () {
      // Anything inside constraint_schema is enforced the moment its property becomes measurable, so an
      // advisory target sharing that document would start rejecting media the platform accepts.
      chaiExpect(stripComments(sql)).to.match(/recommended_media\s+JSONB\s+NOT NULL/i);
      chaiExpect(stripComments(sql)).to.match(
        /CHECK\s*\(\s*jsonb_typeof\(recommended_media\)\s*=\s*'object'\s*\)/i
      );
    });

    it('constrains post_type to lowercase in the DATABASE, not only in CI', function () {
      // The lowercase rule also has to hold against a manual operator INSERT, which no file-based test can see.
      chaiExpect(stripComments(sql)).to.match(/CHECK\s*\(\s*post_type\s*=\s*lower\(post_type\)/i);
      chaiExpect(stripComments(sql), 'empty string must be rejected too').to.match(
        /post_type\s*<>\s*''/
      );
    });

    it('has no foreign key on destination_type_id (house perf policy)', function () {
      chaiExpect(stripComments(sql)).to.not.match(/REFERENCES\s+public\.destination_type/i);
    });

    it('is soft-deletable, so enforcement can be disabled without a code deploy', function () {
      chaiExpect(sql).to.contain('deleted_at');
    });
  });

  describe(SEED_FILE, function () {
    const sql = read(SEED_FILE);
    const bare = stripComments(sql);
    const rows = seededRows(bare);

    it('parses into rows at all — a silent parse failure would vacate every assertion below', function () {
      chaiExpect(rows.length, 'no seeded rows matched').to.be.greaterThan(0);
      // Every VALUES tuple must have been matched, or the ones that were not go unchecked.
      const tupleCount = (bare.match(/::uuid,\s*'[^']*'::uuid/g) || []).length;
      chaiExpect(rows.length, 'some VALUES tuples were not parsed').to.equal(tupleCount);
    });

    it('is additive DATA only — no DDL (schema changes belong in their own migration)', function () {
      chaiExpect(bare).to.not.match(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
      chaiExpect(bare).to.not.match(/\bADD\s+COLUMN\b/i);
    });

    it('is idempotent', function () {
      chaiExpect(bare).to.match(/ON CONFLICT[\s\S]*DO UPDATE/i);
    });

    it('uses lowercase post_type values', function () {
      rows.forEach(function (row) {
        chaiExpect(row.postType, `post_type '${row.postType}' must be lowercase`).to.equal(
          row.postType.toLowerCase()
        );
      });
    });

    it('declares every constraint document as a compilable JSON Schema', function () {
      // An uncompilable document makes the check fall through to the vendor — enforcement off, with only a warn
      // log to show for it.
      const ajv = new Ajv({ allErrors: true, strict: false });
      rows.forEach(function (row) {
        chaiExpect(function () {
          ajv.compile(row.schema);
        }, `${row.postType} (${row.destinationTypeId}) does not compile`).to.not.throw();
      });
    });

    it('constrains only properties the server recognises', function () {
      // An unrecognised property reads as a declared limit but is never measured, so it silently enforces
      // nothing while appearing in the API.
      const known = Object.keys(enforcement.CONSTRAINT_PROPERTIES);
      rows.forEach(function (row) {
        Object.keys(row.schema.properties || {}).forEach(function (property) {
          chaiExpect(known, `unknown constrained property '${property}'`).to.contain(property);
        });
      });
    });

    it('uses only the keywords the check supports', function () {
      // ajv accepts all of draft-07 and `strict: false` warns about nothing, so a typo like "maximumm" compiles
      // clean and enforces nothing.
      rows.forEach(function (row) {
        declaredLimits(row.schema).forEach(function (limit) {
          chaiExpect(
            enforcement.ALLOWED_SCHEMA_KEYWORDS,
            `${row.postType}.${limit.property} uses unsupported keyword '${limit.keyword}'`
          ).to.contain(limit.keyword);
        });
      });
    });

    it('NEVER declares `required`, which would invert the fail-open policy', function () {
      // A property the server cannot measure is left out of the object being validated. With `required`, that
      // absence becomes a rejection — blocking a publish precisely when we know least about it.
      rows.forEach(function (row) {
        chaiExpect(row.schemaText, `${row.postType} declares required`).to.not.contain('required');
      });
      chaiExpect(bare, 'seed must not declare required anywhere').to.not.contain('"required"');
    });

    it('declares every bound as a NUMBER, never a quoted string', function () {
      // ajv ignores a `maximum` whose value is a string, so a quoted bound disables that limit silently.
      rows.forEach(function (row) {
        declaredLimits(row.schema).forEach(function (limit) {
          if (limit.keyword === 'enum') {
            chaiExpect(Array.isArray(limit.value), `${limit.property}.enum must be an array`).to.equal(true);
            limit.value.forEach(function (v) {
              chaiExpect(typeof v, `${limit.property}.enum member must be a number`).to.equal('number');
            });
            return;
          }
          chaiExpect(
            typeof limit.value,
            `${row.postType}.${limit.property}.${limit.keyword} must be a number`
          ).to.equal('number');
        });
      });
    });

    it('declares EVERY duration bound at millisecond magnitude, not seconds', function () {
      // Every social duration limit worth declaring is at least a second, so any bound below 1000 is
      // unconverted seconds — which would make the check pass almost everything.
      rows.forEach(function (row) {
        declaredLimits(row.schema)
          .filter((limit) => limit.property === 'durationMs')
          .forEach(function (limit) {
            chaiExpect(
              limit.value,
              `duration bound ${limit.value} for '${row.postType}' looks like SECONDS, not milliseconds`
            ).to.be.at.least(1000);
          });
      });
    });

    it('never declares a minimum above its own maximum', function () {
      // Such a row rejects every asset, which is the worst outcome available to this check.
      rows.forEach(function (row) {
        Object.entries(row.schema.properties || {}).forEach(function ([property, rule]) {
          if (typeof rule.minimum === 'number' && typeof rule.maximum === 'number') {
            chaiExpect(
              rule.minimum,
              `${row.postType}.${property} declares a minimum above its maximum — nothing can pass`
            ).to.be.at.most(rule.maximum);
          }
        });
      });
    });


    it('declares advisory targets as plain values, NEVER as rules', function () {
      // The two columns are adjacent and both JSONB. A target encoded as a rule
      // ({"widthPx":{"const":1080}}) would be interchangeable with the enforced document, and handing the wrong
      // one to the validator would reject every asset that is not exactly on-target.
      const KEYWORDS = ['minimum', 'maximum', 'enum', 'const', 'properties', 'required', 'type'];
      rows.forEach(function (row) {
        Object.entries(row.recommended).forEach(function ([key, value]) {
          chaiExpect(
            typeof value,
            `${row.postType}.${key} must be a plain number, not a rule`
          ).to.equal('number');
        });
        KEYWORDS.forEach(function (keyword) {
          chaiExpect(
            row.recommendedText,
            `${row.postType} advisory values must not read as a JSON Schema ('${keyword}')`
          ).to.not.contain(`"${keyword}"`);
        });
      });
    });

    it('keys advisory targets by the same vocabulary the limits use', function () {
      // So a client can line "recommended 1080 wide" up against "must be 320-1920 wide" without a mapping.
      const known = Object.keys(enforcement.CONSTRAINT_PROPERTIES);
      rows.forEach(function (row) {
        Object.keys(row.recommended).forEach(function (key) {
          chaiExpect(known, `unknown advisory key '${key}' for '${row.postType}'`).to.contain(key);
        });
      });
    });

    it('declares at most ONE row per destination type, since nothing selects a post type', function () {
      // The runtime declines to guess between multiple post types (it falls through to the vendor backstop), so a
      // second row for the same destination type silently DISABLES enforcement for that platform. Catch it here
      // rather than in production. Lift this once a post type is selectable at publish time.
      const typeIds = rows.map((row) => row.destinationTypeId);
      const dupes = typeIds.filter((id, i) => typeIds.indexOf(id) !== i);
      chaiExpect(dupes, 'more than one constraint row for the same destination type').to.deep.equal([]);
    });

    it('never labels a non-Instagram platform with the Instagram-specific "reels" post type', function () {
      // Decision 5 answered "Reels" for Instagram. TikTok and YouTube have no Reels; mislabelling their rows
      // would make the data lie about what the limits describe even though the lookup no longer filters on it.
      const INSTAGRAM_TYPE_ID = 'b0cc0c8e-409b-44d5-9d0f-389144aa53e0';
      rows
        .filter((row) => row.postType === 'reels')
        .forEach(function (row) {
          chaiExpect(row.destinationTypeId, 'only Instagram may be labelled "reels"').to.equal(
            INSTAGRAM_TYPE_ID
          );
        });
    });
  });
});
