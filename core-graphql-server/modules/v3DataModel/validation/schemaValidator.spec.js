const chaiExpect = require('chai').expect;
const Ajv = require('ajv');

const serviceContext = require('../test/serviceContext.mock.js')();
const createSchemaValidator = require('./schemaValidator.js');

const { validateAgainstSchema } = createSchemaValidator(serviceContext);

const youtubeSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['title', 'categoryId'],
  properties: {
    title: { type: 'string', maxLength: 100 },
    description: { type: 'string', maxLength: 5000 },
    categoryId: { type: 'string', enum: ['1', '22', '24'] },
    visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
    madeForKids: { type: 'boolean' }
  }
};

describe('schemaValidator.js (BE-09)', function () {
  describe('#require', function () {
    it('should expose validateAgainstSchema', function () {
      chaiExpect(createSchemaValidator(serviceContext)).to.be.a('object');
      chaiExpect(validateAgainstSchema).to.be.a('function');
    });
  });

  describe('#validateAgainstSchema — no-constraint schemas', function () {
    it('passes when the schema is null (no schema -> skip)', async function () {
      chaiExpect(await validateAgainstSchema(null, { anything: true })).to.equal(
        true
      );
    });

    it('passes when the schema is an empty object {} (configSchema label-only)', async function () {
      chaiExpect(await validateAgainstSchema({}, { label: 'x' })).to.equal(true);
    });

    it('accepts a stringified schema (Schema.schema can come back as text)', async function () {
      const res = await validateAgainstSchema(JSON.stringify(youtubeSchema), {
        title: 'Hello',
        categoryId: '22'
      });
      chaiExpect(res).to.equal(true);
    });
  });

  describe('#validateAgainstSchema — valid payloads', function () {
    it('passes a complete, conformant YouTube payload', async function () {
      const res = await validateAgainstSchema(youtubeSchema, {
        title: 'My video',
        description: 'desc',
        categoryId: '22',
        visibility: 'private',
        madeForKids: false
      });
      chaiExpect(res).to.equal(true);
    });

    it('passes when only the required fields are present', async function () {
      const res = await validateAgainstSchema(youtubeSchema, {
        title: 'Minimal',
        categoryId: '24'
      });
      chaiExpect(res).to.equal(true);
    });
  });

  describe('#validateAgainstSchema — invalid payloads throw invalid_input', function () {
    async function expectInvalid(schema, data) {
      let err;
      try {
        await validateAgainstSchema(schema, data);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err, 'expected a validation error to be thrown').to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      return err;
    }

    it('throws when a required field is missing (no categoryId)', async function () {
      await expectInvalid(youtubeSchema, { title: 'No category' });
    });

    it('throws when an enum value is out of range', async function () {
      await expectInvalid(youtubeSchema, {
        title: 'Bad category',
        categoryId: '999'
      });
    });

    it('throws when a field has the wrong type', async function () {
      await expectInvalid(youtubeSchema, {
        title: 'Wrong type',
        categoryId: '22',
        madeForKids: 'yes'
      });
    });
  });

  describe('#validateAgainstSchema — uncompilable schema throws internal_error (VE-24929 ajv8 catch branch)', function () {
    it('throws errors.InternalServerError when the schema itself fails to compile (invalid regex pattern)', async function () {
      const uncompilableSchema = {
        type: 'object',
        properties: {
          title: { type: 'string', pattern: '[' }
        }
      };

      let err;
      try {
        await validateAgainstSchema(uncompilableSchema, { title: 'anything' });
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err, 'expected a compile error to be thrown').to.exist;
      chaiExpect(err.name).to.equal('internal_error');
    });
  });

  // The validator cache exists to stop ajv recompiling a schema it has already seen and retaining the result
  // forever. Both halves are behavioural, so both are asserted here rather than left to the header comment.
  describe('#validateAgainstSchema — compiled-validator cache', function () {
    let compileSpy;

    // A distinct document per test, so the first validation in each is a guaranteed miss.
    function uniqueSchema(marker) {
      return {
        type: 'object',
        properties: { [`f_${marker}`]: { type: 'string', maxLength: 4 } }
      };
    }

    beforeEach(function () {
      // The instance under test resolves `compile` through the prototype at call time, so spying here
      // intercepts it without reaching into the module.
      compileSpy = jest.spyOn(Ajv.prototype, 'compile');
    });

    afterEach(function () {
      compileSpy.mockRestore();
    });

    it('compiles an identical document once, however many times it is validated', async function () {
      const marker = `same_${Date.now()}`;

      // Separate objects with equal content — what a per-request DB read actually hands us, and what ajv's own
      // identity-keyed cache could never match.
      await validateAgainstSchema(uniqueSchema(marker), { [`f_${marker}`]: 'ok' });
      await validateAgainstSchema(uniqueSchema(marker), { [`f_${marker}`]: 'ok' });
      await validateAgainstSchema(uniqueSchema(marker), { [`f_${marker}`]: 'ok' });

      chaiExpect(compileSpy).to.have.property('mock');
      chaiExpect(compileSpy.mock.calls.length).to.equal(1);
    });

    it('shares one compilation between the object and stringified forms of a document', async function () {
      const marker = `str_${Date.now()}`;
      const schema = uniqueSchema(marker);

      await validateAgainstSchema(schema, { [`f_${marker}`]: 'ok' });
      await validateAgainstSchema(JSON.stringify(schema), { [`f_${marker}`]: 'ok' });

      chaiExpect(compileSpy.mock.calls.length).to.equal(1);
    });

    it('recompiles when the document changes, so an edited schema is never served stale', async function () {
      const marker = `edit_${Date.now()}`;
      const schema = uniqueSchema(marker);

      await validateAgainstSchema(schema, { [`f_${marker}`]: 'ok' });

      const edited = JSON.parse(JSON.stringify(schema));
      edited.properties[`f_${marker}`].maxLength = 8;
      await validateAgainstSchema(edited, { [`f_${marker}`]: 'ok' });

      chaiExpect(compileSpy.mock.calls.length).to.equal(2);

      // And the new bound is the one that applies.
      await validateAgainstSchema(schema, { [`f_${marker}`]: 'toolong' }).then(
        () => chaiExpect.fail('the original document should still reject over maxLength 4'),
        (err) => chaiExpect(err.name).to.equal('invalid_input')
      );
      chaiExpect(await validateAgainstSchema(edited, { [`f_${marker}`]: 'toolong' })).to.equal(true);
    });

    it('hands evicted schemas back to ajv so its own registry stays bounded', async function () {
      const removeSpy = jest.spyOn(Ajv.prototype, 'removeSchema');
      const overflow = createSchemaValidator.COMPILED_SCHEMA_CACHE_MAX + 1;

      for (let i = 0; i < overflow; i++) {
        await validateAgainstSchema(uniqueSchema(`evict_${i}`), {});
      }

      // Without the dispose hook ajv would retain every one of these compilations for the life of the process.
      chaiExpect(removeSpy.mock.calls.length).to.be.greaterThan(0);
      removeSpy.mockRestore();
    });
  });
});
