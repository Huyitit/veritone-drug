/**
 * VP-2581 / VE-24929 — server-side JSON-Schema validation helper (BE-09).
 *
 * Validates `Destination.details` (against configSchema) and `distributeAsset.platformPayload` (against publishSchema)
 * against the relevant `Schema.definition`.
 *
 * VE-24929 switched the engine to **ajv8 (draft-07) + ajv-formats**, configured to match the FE's default
 * `@rjsf/validator-ajv8` (allErrors, strict:false, standard formats) so FE and server reach the SAME accept/reject
 * verdict — validation is "consistent across FE and server" (R-P5 / BR-2), with no draft-07 feature cap (the schema-
 * driven "future platforms are data-only" thesis, US-X4). This replaces the prior structured-data `jsonschema` engine
 * for Distribution Center schemas; `structureddata/model/validator.js` is untouched and still serves other callers.
 *
 * Consumed by: dal/destination.js (BE-11), distributeAsset resolver (BE-17).
 */
const _ = require('lodash');
const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const LRU = require('lru-cache');

// ONE instance and ONE validator cache for the whole process, both module-level on purpose.
//
// The factory below is called per consumer (dal/destination, distributeAsset, mediaConstraintPolicy, ...), and
// only `errors` actually varies with serviceContext. Building an Ajv per consumer multiplied the retention
// described next by the number of consumers.
//
// Mirrors the FE's default @rjsf/validator-ajv8 instance: ajv8 draft-07, all errors, non-strict, standard formats.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Compiled validators, keyed by the CONTENT of the schema rather than by object identity.
//
// ajv's own `_cache` is a Map keyed on the schema OBJECT, and every call here hands it a freshly parsed/omitted
// object, so that cache could never hit: each validation paid full codegen plus `new Function`, and left a
// SchemaEnv behind that nothing ever removed. In a long-lived GraphQL process that is unbounded heap growth on
// a hot path, and VE-26450 added a second compile per publish on top of it.
//
// Content keying also makes staleness impossible without a TTL: an edited schema document hashes differently
// and therefore compiles fresh. Only the bound is a policy choice. `dispose` is what keeps the fix real — it
// hands the retained schema object back to ajv so its internal registry shrinks with this cache instead of
// growing forever underneath it.
const COMPILED_SCHEMA_CACHE_MAX = 250;
const compiledSchemas = new LRU({
  max: COMPILED_SCHEMA_CACHE_MAX,
  dispose: (entry) => {
    try {
      ajv.removeSchema(entry.schema);
    } catch (ignored) {
      // Eviction is bookkeeping; a failure here must never surface as a validation error.
    }
  }
});

/**
 * Compile `schema`, reusing an earlier compilation of an identical document.
 *
 * @param {object} schema - a self-contained JSON Schema, already stripped of `$id`.
 * @returns {Function} ajv validate function. Its `errors` property is per-call state that callers MUST read
 *   synchronously — validators are shared across concurrent requests, and the next `validate()` overwrites it.
 */
function compileCached(schema) {
  const key = crypto
    .createHash('sha1')
    .update(JSON.stringify(schema))
    .digest('hex');

  const cached = compiledSchemas.get(key);
  if (cached) {
    return cached.validate;
  }

  const validate = ajv.compile(schema);
  compiledSchemas.set(key, { validate, schema });
  return validate;
}

module.exports = function createSchemaValidator(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../error/index.js')(config);

  /**
   * Validate `data` against a JSON-Schema `definition`.
   *
   * @param {object|string|null} definition - JSON Schema as an object or stringified object. A nil or empty (`{}`)
   *   schema imposes no constraints and passes (configSchema is `{}` for label-only Connect forms — Q-NEW-3=A).
   * @param {*} data - value to validate. When the schema is non-empty, `undefined` data is validated as `{}`.
   * @returns {Promise<boolean>} resolves `true` when valid.
   * @throws errors.InvalidInput on a schema mismatch; errors.InternalServerError on an uncompilable schema.
   */
  async function validateAgainstSchema(definition, data) {
    if (_.isNil(definition)) {
      return true;
    }

    const parsed = _.isString(definition) ? JSON.parse(definition) : definition;

    // An empty schema (`{}`) means "no constraints" — skip validation entirely.
    if (_.isPlainObject(parsed) && _.isEmpty(parsed)) {
      return true;
    }

    // Self-contained schemas: drop `$id` so recompiling an equivalent schema can't collide in ajv's cache.
    const schema = _.omit(parsed, ['$id']);
    let validate;
    try {
      validate = compileCached(schema);
    } catch (err) {
      throw new errors.InternalServerError({
        message: `Invalid publishSchema/configSchema definition: ${err && err.message}`
      });
    }

    // `validate.errors` belongs to the validator, which is now shared, so it is read in the same synchronous
    // step as the call that set it. Nothing may await between these two lines.
    const valid = validate(_.isUndefined(data) ? {} : data);
    if (!valid) {
      throw new errors.InvalidInput({
        message: 'The provided JSON had validation errors.',
        data: { validationErrors: validate.errors }
      });
    }
    return true;
  }

  /**
   * The same check, returning the failures instead of throwing.
   *
   * A caller that renders its own copy per failure needs the ajv error objects — `instancePath`, `keyword` and
   * `params.limit` — which the thrown form only carries as opaque diagnostic data. VE-26450's media-constraint
   * check turns each one into a distinct i18n key.
   *
   * @returns {Promise<{valid: boolean, errors: Array<object>}>} `errors` is empty when valid.
   * @throws errors.InternalServerError on an uncompilable schema, matching validateAgainstSchema.
   */
  async function collectValidationErrors(definition, data) {
    try {
      await validateAgainstSchema(definition, data);
      return { valid: true, errors: [] };
    } catch (err) {
      const validationErrors = _.get(err, 'data.validationErrors');
      if (!_.isArray(validationErrors)) {
        throw err;
      }
      return { valid: false, errors: validationErrors };
    }
  }

  return { validateAgainstSchema, collectValidationErrors };
};

// Exported so the spec can pin the actual bound rather than a copy of it.
module.exports.COMPILED_SCHEMA_CACHE_MAX = COMPILED_SCHEMA_CACHE_MAX;
