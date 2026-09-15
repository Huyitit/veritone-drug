'use strict';

/**
 * VE-26450 — the single definition of which media constraints the server enforces.
 *
 * Shared by the pre-flight check (which decides whether to compare a value) and the
 * `MediaConstraint.enforcedConstraints` API field (which tells clients what is safe to gate on). If those two
 * ever disagree, a client either blocks a publish the server never validated or stops gating on one it does.
 */

const _ = require('lodash');

// Mirrors the MediaConstraintClass enum in v3DataModel.graphql; parity is asserted in the spec.
const MEDIA_CONSTRAINT_CLASS = Object.freeze({
  DURATION: 'DURATION',
  DIMENSIONS: 'DIMENSIONS',
  ASPECT_RATIO: 'ASPECT_RATIO'
});

/**
 * The vocabulary a `constraint_schema` document may constrain, and whether the server can currently measure it.
 *
 * NOT redundant with ajv: the object handed to the validator is built FROM this map, via `enforcedProperties`,
 * not from the document. A property set `measurable: false` is never measured, so it never enters that object,
 * and JSON Schema skips what is absent — the row's rule for it is inert even though ajv sees it. That is what
 * lets the seed carry a vendor's documented dimension limits today without rejecting anything on them, and it
 * is also why `required` is banned from these documents: it would make an absent property fail instead of skip.
 * `enforcedConstraints` reads the same map, so the API can never claim a guarantee the check does not make.
 *
 * DIMENSIONS and ASPECT_RATIO stay false because the published asset is a downscaled preview rendition — a
 * 480x270 preview of a 1920x1080 master would be rejected for a publish that would have succeeded. Flipping
 * either to true, plus adding a measurer, is the whole of the enforcement change once VE-26886 makes the
 * published rendition knowable; the spec asserts those two halves never drift apart.
 *
 * A property absent from this map is unknown to the server. CI rejects one in a seeded document rather than
 * letting it sit there reading as enforced.
 */
const CONSTRAINT_PROPERTIES = Object.freeze({
  durationMs: { class: MEDIA_CONSTRAINT_CLASS.DURATION, measurable: true },
  widthPx: { class: MEDIA_CONSTRAINT_CLASS.DIMENSIONS, measurable: false },
  heightPx: { class: MEDIA_CONSTRAINT_CLASS.DIMENSIONS, measurable: false },
  aspectRatio: { class: MEDIA_CONSTRAINT_CLASS.ASPECT_RATIO, measurable: false }
});

/**
 * Keywords a seeded document may use. Deliberately far narrower than draft-07, because ajv accepts the whole
 * vocabulary and `strict: false` will not warn about the rest:
 *   - `required` would turn an unmeasurable property from skipped into rejected, inverting the fail-open policy.
 *   - `additionalProperties: false` would reject the measured object for carrying a property the row happens
 *     not to constrain.
 * Enforced by CI against the seed (mediaConstraintSeed.convention.spec.js), not at runtime — a document already
 * in the database is trusted, and failing a publish over a schema defect would be the same wrong trade.
 */
const ALLOWED_SCHEMA_KEYWORDS = Object.freeze(['minimum', 'maximum', 'enum']);

/**
 * Property names a document actually constrains. Only a top-level `properties` map is read: nesting a rule
 * under `allOf`/`if` would hide it from this list, and a limit the API cannot name is one a client cannot gate
 * on. CI rejects those keywords for the same reason.
 */
function constrainedProperties(constraint) {
  const properties = _.get(constraint, 'constraintSchema.properties');
  if (!_.isPlainObject(properties)) {
    return [];
  }
  return Object.keys(properties).filter((name) =>
    _.isPlainObject(properties[name]) && !_.isEmpty(properties[name])
  );
}

/**
 * Properties this row will actually be checked against — constrained AND measurable. This is the set the
 * pre-flight check measures, so the two cannot drift.
 */
function enforcedProperties(constraint) {
  return constrainedProperties(constraint).filter((name) =>
    _.get(CONSTRAINT_PROPERTIES, [name, 'measurable']) === true
  );
}

/**
 * False when the row constrains nothing the server can measure — the check would compare nothing, so claiming a
 * class would overstate the guarantee. YouTube's row is this case: no documented duration limit for regular
 * video.
 */
function isEnforcing(constraint) {
  return enforcedProperties(constraint).length > 0;
}

/**
 * @param {object} constraint
 * @param {boolean} [options.ambiguous] several post-type rows for one destination type, where the check skips
 *   enforcement entirely — so nothing may be reported as enforced.
 */
function enforcedConstraintClasses(constraint, options = {}) {
  if (options.ambiguous) {
    return [];
  }
  return _.uniq(
    enforcedProperties(constraint).map((name) => CONSTRAINT_PROPERTIES[name].class)
  );
}

module.exports = {
  isEnforcing,
  enforcedProperties,
  constrainedProperties,
  enforcedConstraintClasses,
  CONSTRAINT_PROPERTIES,
  ALLOWED_SCHEMA_KEYWORDS,
  MEDIA_CONSTRAINT_CLASS
};
