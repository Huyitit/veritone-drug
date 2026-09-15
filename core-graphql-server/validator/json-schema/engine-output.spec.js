const chaiExpect = require('chai').expect;
const { Validator } = require('jsonschema');

const schemas = require('./engine-output.js');

// Register every exported sub-schema by its id so $ref resolution works — mirrors how
// validator/index.js consumes these (new Validator(); v.addSchema(schema, schema.id)).
function makeValidator() {
  const v = new Validator();
  Object.values(schemas).forEach((s) => {
    if (s && s.id) {
      v.addSchema(s, s.id);
    }
  });
  return v;
}

describe('validator/json-schema/engine-output.js', function () {
  let v;

  beforeEach(function () {
    v = makeValidator();
  });

  describe('engineOutput schema shape (TODO #1)', function () {
    it('keeps the documented structural invariants (guards schema loosening)', function () {
      chaiExpect(schemas.engineOutput.properties.series.items.$ref).to.equal(
        '/Series'
      );
      chaiExpect(schemas.engineOutput.properties.sentiment.$ref).to.equal(
        '/Sentiment'
      );
      chaiExpect(schemas.engineOutput.properties.object.items.$ref).to.equal(
        '/Object'
      );
      chaiExpect(schemas.series.required).to.deep.equal([
        'startTimeMs',
        'stopTimeMs'
      ]);
    });
  });

  describe('series schema (TODO #2)', function () {
    it('accepts an entry with startTimeMs + stopTimeMs', function () {
      const res = v.validate(
        { startTimeMs: 0, stopTimeMs: 1000 },
        schemas.series
      );
      chaiExpect(res.valid).to.equal(true);
    });

    it('rejects an entry missing a required field (stopTimeMs)', function () {
      const res = v.validate({ startTimeMs: 0 }, schemas.series);
      chaiExpect(res.valid).to.equal(false);
    });
  });

  describe('sentiment schema (TODO #3 — anyOf enforcement)', function () {
    it('accepts a sentiment with positiveValue only', function () {
      const res = v.validate({ positiveValue: 0.9 }, schemas.sentiment);
      chaiExpect(res.valid).to.equal(true);
    });

    it('rejects an empty sentiment (neither positiveValue nor negativeValue)', function () {
      const res = v.validate({}, schemas.sentiment);
      chaiExpect(res.valid).to.equal(false);
    });
  });

  describe('uuid schema (TODO #4 — pattern)', function () {
    it('accepts a valid UUIDv4 string', function () {
      const res = v.validate(
        '9b2e1f7a-3c4d-4a2b-8f1e-2c3d4e5f6a7b',
        schemas.uuid
      );
      chaiExpect(res.valid).to.equal(true);
    });

    it('rejects a non-UUIDv4 string', function () {
      const res = v.validate('not-a-uuid', schemas.uuid);
      chaiExpect(res.valid).to.equal(false);
    });
  });
});
