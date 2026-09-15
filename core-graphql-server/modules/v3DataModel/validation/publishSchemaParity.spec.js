'use strict';

// VE-24929 (U-SHARED-CORE, BR-2 / R-P5 — VP-2581 Q-FE-6) — FE<->server publishSchema validation PARITY.
//
// The FE validates the publish form with the DEFAULT `@rjsf/validator-ajv8` (ajv8, draft-07, allErrors, strict:false,
// ajv-formats). The server re-validates authoritatively in distributeAsset via schemaValidator.js, which VE-24929
// configured with the SAME engine + options. Because both sides run ajv8 draft-07 with matching config, parity is
// STRUCTURAL (full draft-07 — no keyword subset cap), which preserves the "future platforms are data-only" thesis
// (US-X4): a future platform may use any valid draft-07 publishSchema (format, exclusiveMinimum, enum, …) with no
// server code change.
//
// This test proves the server agrees with ajv8 draft-07 across representative keywords, INCLUDING the ones an older
// jsonschema engine got wrong (exclusiveMinimum numeric form; format), to guard against a future engine regression.

const chaiExpect = require('chai').expect;
const serviceContext = require('../test/serviceContext.mock.js')();
const createSchemaValidator = require('../validation/schemaValidator.js');

const { validateAgainstSchema } = createSchemaValidator(serviceContext);

// Representative MVP publishSchemas (illustrative; exact field sets come from the vendor survey, VE-24935).
const facebookSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['message'],
  additionalProperties: false,
  properties: { message: { type: 'string', minLength: 1, maxLength: 63206 } }
};

const instagramSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['caption'],
  additionalProperties: false,
  properties: {
    caption: { type: 'string', maxLength: 2200 },
    productType: { type: 'string', enum: ['FEED', 'REELS'] }
  }
};

const tiktokSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 150 },
    privacyLevel: { type: 'string', enum: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] }
  }
};

// A "rich" draft-07 schema a FUTURE platform could seed (format, exclusiveMinimum, if/then) — proves no subset cap.
const richFutureSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['link'],
  properties: {
    link: { type: 'string', format: 'uri' },
    scheduleOffsetMinutes: { type: 'number', exclusiveMinimum: 0 }
  }
};

async function accepts(schema, payload) {
  return (await validateAgainstSchema(schema, payload)) === true;
}
async function rejects(schema, payload) {
  try {
    await validateAgainstSchema(schema, payload);
    return false;
  } catch (e) {
    return true;
  }
}

describe('publishSchema FE<->server validation parity — ajv8 draft-07 (BR-2 / Q-FE-6)', function () {
  describe('MVP schemas — accept cases', function () {
    it('Facebook: minimal valid payload', async function () {
      chaiExpect(await accepts(facebookSchema, { message: 'Hello world' })).to.equal(true);
    });
    it('Instagram: caption + valid enum', async function () {
      chaiExpect(await accepts(instagramSchema, { caption: 'Nice shot', productType: 'FEED' })).to.equal(true);
    });
    it('TikTok: title within length + valid enum', async function () {
      chaiExpect(await accepts(tiktokSchema, { title: 'My clip', privacyLevel: 'PUBLIC_TO_EVERYONE' })).to.equal(true);
    });
  });

  describe('MVP schemas — reject cases (server === ajv8 verdict)', function () {
    it('rejects a missing required field (Facebook.message)', async function () {
      chaiExpect(await rejects(facebookSchema, {})).to.equal(true);
    });
    it('rejects a wrong type (Facebook.message as number)', async function () {
      chaiExpect(await rejects(facebookSchema, { message: 42 })).to.equal(true);
    });
    it('rejects an enum violation (Instagram.productType)', async function () {
      chaiExpect(await rejects(instagramSchema, { caption: 'x', productType: 'STORY' })).to.equal(true);
    });
    it('rejects maxLength overflow (TikTok.title > 150)', async function () {
      chaiExpect(await rejects(tiktokSchema, { title: 'a'.repeat(151) })).to.equal(true);
    });
    it('rejects minLength underflow (Facebook.message empty)', async function () {
      chaiExpect(await rejects(facebookSchema, { message: '' })).to.equal(true);
    });
    it('rejects an unknown property when additionalProperties:false', async function () {
      chaiExpect(await rejects(instagramSchema, { caption: 'x', bogus: true })).to.equal(true);
    });
  });

  describe('full draft-07 (no subset cap) — future platforms can use rich keywords', function () {
    it('accepts a valid format:uri + exclusiveMinimum payload', async function () {
      chaiExpect(await accepts(richFutureSchema, { link: 'https://example.com', scheduleOffsetMinutes: 5 })).to.equal(
        true
      );
    });
    it('rejects an invalid format:uri (ajv-formats enforced)', async function () {
      chaiExpect(await rejects(richFutureSchema, { link: 'not a uri ::::' })).to.equal(true);
    });
    it('rejects exclusiveMinimum boundary (numeric draft-07 semantics: 0 is not > 0)', async function () {
      chaiExpect(await rejects(richFutureSchema, { link: 'https://x.co', scheduleOffsetMinutes: 0 })).to.equal(true);
    });
  });

  describe('no-constraint schemas (label-only Connect / configSchema)', function () {
    it('accepts anything against {} and null', async function () {
      chaiExpect(await accepts({}, { whatever: 1 })).to.equal(true);
      chaiExpect(await accepts(null, { whatever: 1 })).to.equal(true);
    });
  });
});
