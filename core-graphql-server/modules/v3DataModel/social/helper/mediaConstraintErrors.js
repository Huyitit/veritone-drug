'use strict';

const _ = require('lodash');

// VE-26450 — rejection copy for pre-flight media-constraint failures.
//
// Returns an i18n key plus parameters rather than a rendered sentence: DMH renders the toast through its own
// i18n layer, and VE-26583 inherits this shape for async failure copy. This deliberately differs from the
// sibling destinationConnectErrors.js, which returns English.
//
// The key strings and the `i18nParams` NAMES are a published contract — VE-26202 renders them. Adding a param
// is safe; renaming one silently breaks the client's copy. Pinned in the spec.

const I18N_KEYS = Object.freeze({
  DURATION_MAX: 'DISTRIBUTE.ERROR.MEDIA_DURATION_MAX',
  DURATION_MIN: 'DISTRIBUTE.ERROR.MEDIA_DURATION_MIN',
  // Safety net for a violated limit with no copy of its own. Unreachable while durationMs is the only
  // measurable property; a client that cannot resolve it should fall back to the developer `message`.
  GENERIC: 'DISTRIBUTE.ERROR.MEDIA_CONSTRAINT'
});

// Machine discriminator, not user-facing. Intended to align with VE-26584's INVALID_MEDIA failure category;
// the exact mapping should be agreed on that ticket.
const CONSTRAINT_DURATION = 'duration';

// Which declared property a validation failure is about, in the vocabulary the metric labels use.
const CONSTRAINT_BY_PROPERTY = Object.freeze({
  durationMs: CONSTRAINT_DURATION,
  widthPx: 'dimensions',
  heightPx: 'dimensions',
  aspectRatio: 'aspect_ratio'
});

// Which side of a declared range a JSON Schema keyword represents, per property. A property absent here has no
// copy of its own and falls back to GENERIC.
const BOUND_BY_PROPERTY = Object.freeze({
  durationMs: { maximum: 'DURATION_MAX', minimum: 'DURATION_MIN' }
});

// Rounded AWAY from the permitted range, never to-nearest, so the limit and the actual can never render as the
// same number while the verdict says they differ.
function msToSecondsFloor(ms) {
  return Math.floor(ms / 1000);
}

function msToSecondsCeil(ms) {
  return Math.ceil(ms / 1000);
}

/**
 * `message` is a DEVELOPER fallback, not user copy — distributeAsset is callable by clients holding no i18n
 * bundle. Durations are reported in seconds (for the copy) and milliseconds (so a client can reproduce the
 * verdict exactly against `Asset.fileData.mediaDurationMs`).
 *
 * @param {'DURATION_MAX'|'DURATION_MIN'} bound which side of the range was violated
 * @param {string} params.platform lowercase platform key; the client maps it to a display name
 */
function durationRejection(bound, params) {
  const { platform, limitMs, actualMs, destinationId, tdoId } = params;
  const isMax = bound === 'DURATION_MAX';
  // Too long: floor the limit, ceil the actual. Too short: ceil the limit, floor the actual.
  const limitSeconds = isMax ? msToSecondsFloor(limitMs) : msToSecondsCeil(limitMs);
  const actualSeconds = isMax ? msToSecondsCeil(actualMs) : msToSecondsFloor(actualMs);
  const platformLabel = platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : 'This destination';
  const clause = isMax
    ? `accepts videos up to ${limitSeconds} seconds`
    : `requires videos of at least ${limitSeconds} seconds`;

  return {
    message: `${platformLabel} ${clause}; this asset is ${actualSeconds} seconds.`,
    data: {
      i18nKey: I18N_KEYS[bound],
      i18nParams: {
        platform,
        limitSeconds,
        actualSeconds,
        limitMs,
        actualMs
      },
      constraint: CONSTRAINT_DURATION,
      destinationId,
      tdoId
    }
  };
}


/**
 * Translate one ajv validation error into the rejection payload the client renders.
 *
 * The limits are data; this mapping from a violated keyword to user copy is not, and is the one place a new
 * enforced property needs a code change — it needs a sentence written for it either way.
 *
 * Rejecting on an unmapped property is deliberate. Fail-open covers uncertainty about the MEASUREMENT; here the
 * value was measured and it violated a declared limit, so the only thing missing is the wording.
 *
 * @param {object} error one entry from ajv's `errors` — `instancePath`, `keyword`, `params`.
 * @param {object} params.facts the measured properties the schema was run against, for the actual value.
 * @returns {{message: string, data: object}} ready to pass to errors.InvalidInput.
 */
function rejectionFromValidationError(error, params) {
  const { facts, platform, destinationId, tdoId } = params;
  const property = _.trimStart(_.get(error, 'instancePath', ''), '/');
  const keyword = _.get(error, 'keyword');
  const actual = _.get(facts, property);

  const bound = _.get(BOUND_BY_PROPERTY, [property, keyword]);
  if (bound === 'DURATION_MAX' || bound === 'DURATION_MIN') {
    return durationRejection(bound, {
      platform,
      limitMs: _.get(error, 'params.limit'),
      actualMs: actual,
      destinationId,
      tdoId
    });
  }

  const platformLabel = platform
    ? platform.charAt(0).toUpperCase() + platform.slice(1)
    : 'This destination';
  return {
    message: `${platformLabel} does not accept this asset: ${property} ${_.get(error, 'message', 'is out of range')}.`,
    data: {
      i18nKey: I18N_KEYS.GENERIC,
      i18nParams: {
        platform,
        property,
        actual,
        // Whichever the violated keyword carries: a bound for minimum/maximum, the permitted set for enum.
        limit: _.get(error, 'params.limit'),
        allowedValues: _.get(error, 'params.allowedValues')
      },
      constraint: _.get(CONSTRAINT_BY_PROPERTY, property, property),
      destinationId,
      tdoId
    }
  };
}

/**
 * The metric label for a validation failure, so a rejection counter can be read per constraint kind.
 */
function constraintLabelFor(error) {
  const property = _.trimStart(_.get(error, 'instancePath', ''), '/');
  return _.get(CONSTRAINT_BY_PROPERTY, property, property || 'unknown');
}

module.exports = {
  durationRejection,
  rejectionFromValidationError,
  constraintLabelFor,
  I18N_KEYS,
  CONSTRAINT_DURATION,
  CONSTRAINT_BY_PROPERTY,
  BOUND_BY_PROPERTY
};
