'use strict';

// VE-26450 — rejects a publish the platform will certainly refuse, before a Job or task is created, so no task
// slot or media pull is spent on it.
//
// The limits are a JSON Schema on the destination's constraint row, evaluated by the same ajv validator that
// checks platformPayload one step earlier in this mutation. Adding a limit is a change to that document.
//
// A property is checked only when the server can measure it — helper/mediaConstraintEnforcement.js holds that
// vocabulary. Unmeasurable properties are left out of the object handed to the validator, and JSON Schema skips
// what is absent, so a row may declare a vendor's documented dimension limits without rejecting anything on
// them. That is why the seed can carry them ahead of VE-26886 (rendition selection): the asset actually
// published is a downscaled preview, so a 480x270 preview of a 1920x1080 master would fail a dimension check a
// publish would have passed.
//
// FAIL-OPEN IS THE POLICY, not missing error handling. A wrong rejection forecloses a publish the vendor would
// have accepted; a missed one only costs what today already costs. So every path that cannot reach a confident
// verdict returns and lets the vendor be the backstop — including read failures. Those paths are counted, except
// the two that mean the destination was never subject to enforcement at all (no row, nothing enforceable
// declared), which would otherwise inflate the denominator.

const _ = require('lodash');
const async = require('async-p');
const mediaDuration = require('../../../../util/mediaDuration.js');
const mediaConstraintErrors = require('../helper/mediaConstraintErrors.js');
const enforcement = require('../helper/mediaConstraintEnforcement.js');
const createSchemaValidator = require('../../validation/schemaValidator.js');

// Two is enough: the scan is only trusted when it finds exactly one media asset, so a second row is all that is
// needed to detect ambiguity.
const MEDIA_ASSET_SCAN_LIMIT = 2;

// How many TDOs are measured at once during the gather pass. Each one is up to two reads (primary asset, then
// the fallback scan), so the wall-clock cost of a bulk publish is roughly ceil(n / this) round trips rather
// than n. Held at the same level as the caller's TDO authorization fan-out so the two passes place a
// comparable load on the read pool, which this mutation shares with every other in-flight request.
const DURATION_GATHER_CONCURRENCY = 10;

// Skip reasons. Carried on a `reason` label, not the rejection counter's `constraint` — these answer "why did
// enforcement not apply?", and ambiguous_post_type is not a constraint at all.
const FALLTHROUGH_UNKNOWN_DURATION = 'duration_unknown';
const FALLTHROUGH_UNREADABLE = 'duration_unreadable';
const FALLTHROUGH_AMBIGUOUS_ASSET = 'ambiguous_media_asset';
const FALLTHROUGH_MAGIC_ID_SCOPE = 'magic_id_scope';
const FALLTHROUGH_AMBIGUOUS_POST_TYPE = 'ambiguous_post_type';
const FALLTHROUGH_CONSTRAINTS_UNREADABLE = 'constraints_unreadable';
// The catch-all: the check threw something that was not a verdict. Always a defect in this module, never a
// property of the publish, which is why it is reported separately from the reads that can legitimately fail.
const FALLTHROUGH_CHECK_FAILED = 'check_failed';

// Marks the ONE error this module is allowed to escape with. A symbol rather than a field so it cannot collide
// with the rejection payload, cannot be serialized out to a client, and cannot be forged by an error bubbling up
// from a DAL — the containment below tests for exactly this, not for a shape that another failure might imitate.
const CONSTRAINT_VERDICT = Symbol('VE-26450 media constraint verdict');

module.exports = function createMediaConstraintPolicy(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../../error/index.js')(config);
  const schemaValidator = createSchemaValidator(serviceContext);

  // Every log in this module goes through here.
  //
  // `_.invoke(serviceContext, 'app.logger.warn', ...)` — what this replaces — returns undefined when any part of
  // that path is missing, so a wiring change would have silently deleted the logging on a check whose whole
  // failure mode is being invisible. This resolves a logger explicitly and falls back to the console rather than
  // to nothing: a log line in the wrong sink is recoverable, a log line that never happened is not.
  const LOG_FALLBACK_LEVELS = { error: 'error', warn: 'warn', info: 'log', debug: 'debug' };

  function log(level, payload) {
    const logger =
      _.get(serviceContext, 'app.logger') || _.get(serviceContext, 'logger');
    try {
      if (_.isFunction(_.get(logger, level))) {
        logger[level](payload);
        return;
      }
      // The alternative to console here is discarding the line — the exact failure this function prevents.
      // biome-ignore lint/suspicious/noConsole: deliberate last resort when no logger is wired
      console[LOG_FALLBACK_LEVELS[level] || 'log'](payload);
    } catch (ignored) {
      // A logger that throws must not decide a publish. Nothing further to try.
    }
  }

  // Guarded because metrics.check() throws on an unregistered counter name, and observability must never fail a
  // publish. The cost is that a missing or mislabelled counter degrades to a warn log — customMetrics.parity.spec.js
  // is what catches that instead.
  function count(metric, labels) {
    try {
      _.invoke(serviceContext, 'metrics.incrementCounter', metric, labels);
    } catch (err) {
      log('warn', {
        message: 'VE-26450: failed to increment media-constraint metric',
        metric,
        err: err && err.message
      });
    }
  }

  function countFallthrough(platform, reason) {
    count('distributeMediaConstraintFallthrough', {
      platform: platform || 'unknown',
      reason
    });
  }

  function countEvaluated(platform) {
    count('distributeMediaConstraintEvaluated', { platform: platform || 'unknown' });
  }

  /**
   * A skip that happens once per REQUEST, counted in per-TDO units so it shares a denominator with the rest.
   * These publishes did reach the check with something to evaluate — the read failed, not the applicability.
   */
  function countRequestSkip(platform, reason, tdoCount) {
    for (let i = 0; i < tdoCount; i++) {
      countEvaluated(platform);
      countFallthrough(platform, reason);
    }
  }

  /**
   * Duration of the asset that will be published, or null when it cannot be established without guessing.
   *
   * Primary path is `dal.tdo.getPrimaryAsset` — the platform's canonical resolver, which honours
   * `jsondata.mediaAsset`, the segmented-TDO virtual asset, and the magic-id whitelist.
   *
   * It returns nothing for a non-segmented TDO with no `jsondata.mediaAsset`, which the ACs call out. The scan
   * below covers that, but ONLY when the TDO has exactly one media asset: the platform's own
   * newest-media-as-primary rule is behind `config.featureFlags.newestMediaAsPrimary`, which defaults to false,
   * so applying it here would measure one asset while the engine publishes another. With a single asset there is
   * nothing to guess.
   *
   * Never keys on `contentType` — it reports video/mp4 for a .f4v object, so it does not describe the file.
   *
   * @param {object} tdo an ALREADY-AUTHORIZED TDO record
   */
  async function resolvePublishedDurationMs(context, tdo) {
    const primary = await serviceContext.dal.tdo.getPrimaryAsset(context, tdo, {
      assetType: 'media'
    });
    const primaryMs = mediaDuration.secondsToMs(
      _.get(primary, 'metadata.mediaDuration')
    );
    if (_.isFinite(primaryMs)) {
      return { value: primaryMs, reason: null };
    }

    // No duration stamped yet is an unknown, not an ambiguity — no point scanning for a different asset than the
    // one the platform already named.
    if (primary) {
      return { value: null, reason: FALLTHROUGH_UNKNOWN_DURATION };
    }

    // The scan does not honour the magic-id asset whitelist, so it could read an asset the caller was not
    // granted.
    if (tdo.magicIdData) {
      return { value: null, reason: FALLTHROUGH_MAGIC_ID_SCOPE };
    }

    const page = await serviceContext.dal.asset.getAssets(context, {
      containerId: tdo.id,
      assetType: 'media',
      orderBy: 'createdDateTime',
      orderDirection: 'desc',
      limit: MEDIA_ASSET_SCAN_LIMIT
    });
    const records = _.get(page, 'records') || [];

    if (records.length !== 1) {
      // Zero: nothing to measure. More than one: any choice guesses at what the engine will send.
      return {
        value: null,
        reason: records.length ? FALLTHROUGH_AMBIGUOUS_ASSET : FALLTHROUGH_UNKNOWN_DURATION
      };
    }

    const onlyMs = mediaDuration.secondsToMs(
      _.get(records[0], 'metadata.mediaDuration')
    );
    return _.isFinite(onlyMs)
      ? { value: onlyMs, reason: null }
      : { value: null, reason: FALLTHROUGH_UNKNOWN_DURATION };
  }

  /**
   * How each declared property is measured off a TDO. A property named in a constraint document but absent here
   * is never measured and therefore never enforced, which is what `measurable: false` means in
   * mediaConstraintEnforcement.CONSTRAINT_PROPERTIES. Adding a measurer and flipping that flag are the two
   * halves of enabling a new check.
   */
  const MEASURERS = {
    durationMs: resolvePublishedDurationMs
  };

  /**
   * A non-positive duration is a degenerate probe result, not a measurement — the write path guards on a falsy
   * value, so a stored 0 cannot come from the normal ffprobe pass. Enforcing it would reject as "too short" a
   * publish the vendor would accept. Dimensions and ratios are positive for the same reason.
   */
  function isUsableMeasurement(value) {
    return _.isFinite(value) && value > 0;
  }

  /**
   * GATHER pass — measure one window of TDOs, decide nothing.
   *
   * Separated from the verdict pass so the reads in a window happen together rather than one TDO at a time. Each
   * measurement is up to two round trips and they do not depend on each other, so a bulk publish costs roughly
   * ceil(n / DURATION_GATHER_CONCURRENCY) waves rather than n sequential trips — which is what keeps a large
   * request inside the mutation's timeout.
   *
   * A read failure becomes an empty fact set with a fallthrough reason rather than an exception: the partitioned
   * asset table has a real missing-partition failure mode, and a publish that used to succeed must not start
   * failing because validation could not read metadata. One TDO's unreadable metadata must also not abandon the
   * check for the others, which a rejecting promise here would do.
   *
   * @param {Array<object>} params.tdos ALREADY-AUTHORIZED TDO records. Takes records rather than ids because
   *   `dal.asset.getAssets` applies no organization filter of its own — an id-taking version would read any
   *   org's assets.
   * @param {Array<string>} params.properties the enforced property names to measure, from the constraint row.
   * @returns {Array<{facts: object, reason: ?string}>} aligned with `params.tdos` by index.
   */
  async function gatherFacts(context, params) {
    const { tdos, properties, platform } = params;
    const gathered = new Array(tdos.length);

    await async.eachLimit(
      tdos.map((tdo, index) => ({ tdo, index })),
      async ({ tdo, index }) => {
        const facts = {};
        let reason = null;
        try {
          for (const property of properties) {
            const measured = await MEASURERS[property](context, tdo);
            if (isUsableMeasurement(measured.value)) {
              facts[property] = measured.value;
            } else {
              reason = reason || measured.reason || FALLTHROUGH_UNKNOWN_DURATION;
            }
          }
        } catch (err) {
          reason = FALLTHROUGH_UNREADABLE;
          log('warn', {
            message:
              'VE-26450: could not measure media for pre-flight check; allowing the publish and ' +
              'deferring to the vendor rejection',
            tdoId: tdo.id,
            platform,
            err: err && err.message,
            // 42P01 is the missing-partition case this guard exists for; without it the log cannot confirm that.
            errCode: _.get(err, 'data.internalData.code')
          });
        }
        gathered[index] = { facts, reason };
      },
      DURATION_GATHER_CONCURRENCY
    );

    return gathered;
  }

  /**
   * ASSERT pass — run the declared schema over one TDO's measured facts.
   *
   * Performs no reads of its own. Throws on the FIRST violation: `allErrors` gives every failure, but the
   * mutation rejects the publish either way and one clear sentence beats a list the client has to rank.
   *
   * @param {object} params.gathered one entry from gatherFacts, aligned with `params.tdo`.
   */
  async function assertFactsSatisfySchema(context, params) {
    const { tdo, gathered, constraint, platform, destinationId } = params;
    const { facts, reason } = gathered;

    // Nothing measurable came back, so there is nothing to compare — the vendor stays the backstop.
    if (_.isEmpty(facts)) {
      countFallthrough(platform, reason || FALLTHROUGH_UNKNOWN_DURATION);
      return;
    }

    // A property that could not be measured is simply absent, and JSON Schema does not check what is absent.
    // That is the per-property half of fail-open, and why the seeded documents must never use `required`.
    if (reason) {
      countFallthrough(platform, reason);
    }

    let result;
    try {
      result = await schemaValidator.collectValidationErrors(
        constraint.constraintSchema,
        facts
      );
    } catch (err) {
      // An uncompilable document is a seed defect. Blocking publishes over it would be the same wrong trade as
      // blocking them over unreadable metadata, so it is logged and allowed.
      countFallthrough(platform, FALLTHROUGH_CONSTRAINTS_UNREADABLE);
      log('warn', {
        message:
          'VE-26450: declared media constraint schema could not be evaluated; allowing the publish and ' +
          'deferring to the vendor rejection',
        constraintId: constraint.id,
        platform,
        err: err && err.message
      });
      return;
    }

    if (result.valid) {
      return;
    }

    const violation = result.errors[0];
    count('distributeMediaConstraintRejection', {
      platform: platform || 'unknown',
      constraint: mediaConstraintErrors.constraintLabelFor(violation)
    });

    const rejection = new errors.InvalidInput(
      mediaConstraintErrors.rejectionFromValidationError(violation, {
        facts,
        platform,
        destinationId,
        tdoId: tdo.id
      })
    );
    rejection[CONSTRAINT_VERDICT] = true;

    // The one outcome that changes what the caller gets, and until now the only one that left no trace: every
    // other log here records a reason the check did NOT decide. Without this, a user reporting "it says my video
    // is too long" leaves nothing to look up — not which limit, not what we measured, not which row declared it.
    // At info because a correct rejection is the feature working, not a fault.
    log('info', {
      message:
        'VE-26450: rejecting publish pre-flight — asset violates a declared media constraint',
      constraintId: constraint.id,
      constraint: _.get(rejection, 'data.constraint'),
      platform,
      destinationId,
      tdoId: tdo.id,
      facts,
      violation: _.pick(violation, ['instancePath', 'keyword', 'params'])
    });

    throw rejection;
  }

  /**
   * The check itself: everything free first, then reads and verdicts interleaved a window at a time.
   *
   * The ordering is the point. Every condition that can disqualify enforcement without touching the database is
   * settled before a single media read happens, so a destination that declares nothing, declares nothing
   * measurable, or declares an ambiguous set costs the same whether the request names one TDO or a hundred.
   * Past that point no read is issued for a TDO once an earlier one has already decided the request.
   *
   * Throws only through assertFactsSatisfySchema. Anything else that escapes is a defect, and the wrapper below
   * is what stops it reaching the caller.
   *
   * @param {Array<object>} params.tdos resolved, org-scoped TDO records — one per id in DistributeAssetInput.
   *   The caller authorizes every id, not just the first.
   */
  async function evaluatePublish(context, params) {
    const { tdos, destinationTypeId, platform, destinationId } = params;

    // ---- Pass 1: free checks. No I/O below this line until the constraint read. ----

    if (!destinationTypeId) {
      throw new errors.InvalidInput({
        message: 'Cannot validate media constraints: destination has no destination type.',
        data: { destinationId }
      });
    }
    if (!Array.isArray(tdos) || !tdos.length) {
      return;
    }

    // Validated for the WHOLE list up front: a caller that passed an unresolved record at position 99 should
    // learn that before the first 98 are measured.
    for (const tdo of tdos) {
      if (!_.get(tdo, 'id')) {
        throw new errors.InvalidInput({
          message: 'Media-constraint check requires a resolved TDO record.',
          data: { destinationId }
        });
      }
    }

    // Fetched once, not per TDO — the constraint depends on the destination, not the asset. Guarded because a
    // statement timeout here would otherwise turn every distributeAsset into an error for the duration.
    let constraints;
    try {
      constraints = await serviceContext.dal.destinationMediaConstraint.getMediaConstraints(
        context,
        { destinationTypeIds: [destinationTypeId] }
      );
    } catch (err) {
      countRequestSkip(platform, FALLTHROUGH_CONSTRAINTS_UNREADABLE, tdos.length);
      log('warn', {
        message:
          'VE-26450: could not read declared media constraints; allowing the publish and deferring to the ' +
          'vendor rejection',
        destinationTypeId,
        platform,
        err: err && err.message,
        errCode: _.get(err, 'data.internalData.code')
      });
      return;
    }

    // Nothing declared — no enforcement. Not counted: this destination was never a candidate, so counting it
    // would make the metric useless for spotting a genuinely broken check.
    if (!constraints.length) {
      return;
    }

    // Nothing in the request says which post type this publish is, so picking one risks enforcing Stories limits
    // (3-60s) on a Reel. CI asserts one row per destination type; this branch exists so a bad seed degrades
    // safely rather than blocking valid publishes.
    if (constraints.length > 1) {
      countRequestSkip(platform, FALLTHROUGH_AMBIGUOUS_POST_TYPE, tdos.length);
      log('warn', {
        message:
          'VE-26450: multiple media-constraint rows declared for one destination type and no post-type ' +
          'selector exists; skipping pre-flight enforcement rather than guessing',
        destinationTypeId,
        platform,
        postTypes: constraints.map((c) => c.postType)
      });
      return;
    }

    const constraint = constraints[0];

    // Shared with MediaConstraint.enforcedConstraints so the API cannot claim a guarantee this does not make.
    // Hoisted above the gather pass: a row constraining nothing the server can measure (YouTube's) compares
    // nothing, so measuring the media first would be pure waste, once per TDO.
    const properties = enforcement.enforcedProperties(constraint);
    if (!properties.length) {
      return;
    }

    // Before any outcome is known, so the rejection and fallthrough counters have a denominator. Counted for
    // the whole request even though a rejection may stop later windows from being measured: the denominator
    // answers "how many publishes were subject to enforcement", not "how many reads happened".
    for (let i = 0; i < tdos.length; i++) {
      countEvaluated(platform);
    }

    // ---- Passes 2 and 3: gather then assert, one concurrency window at a time. ----
    //
    // Windowed rather than "measure everything, then compare everything": the mutation rejects on the first
    // violation, so measuring the remaining TDOs buys reads whose results are discarded. A publish whose first
    // asset is over-length used to cost n measurements; it now costs one window.
    //
    // The window is what keeps that cheap WITHOUT making the verdict depend on which read finished first. A
    // whole window is measured before any of it is compared, and windows run in index order, so the TDO
    // reported is always the earliest violating one in the request — the same TDO the un-windowed version
    // named. Concurrency within a window is unchanged, so a request where everything passes does the same
    // number of waves it always did.
    for (const window of _.chunk(tdos, DURATION_GATHER_CONCURRENCY)) {
      const gathered = await gatherFacts(context, {
        tdos: window,
        properties,
        platform
      });

      for (let i = 0; i < window.length; i++) {
        await assertFactsSatisfySchema(context, {
          tdo: window[i],
          gathered: gathered[i],
          constraint,
          platform,
          destinationId
        });
      }
    }
  }

  /**
   * Gate for one publish. A REJECTED verdict is the only thing that leaves this function.
   *
   * Every fail-open path inside the check handles a failure mode someone thought of — an unreadable constraint
   * row, unmeasurable media, an uncompilable document. This is what makes "uncertainty never blocks a publish" a
   * property of the module rather than a claim about the paths that happen to exist today: a DAL contract that
   * changes shape, a lodash call on an unexpected record, a bug added here next quarter would otherwise turn a
   * working publish into a hard error, which is precisely the trade this check exists to avoid.
   *
   * Deliberately NOT keyed on the error class: a NotFound or InvalidInput from a DAL call would pass an
   * `instanceof` test while having nothing to do with a constraint. Only the verdict tagged at its throw site
   * re-raises; everything else is counted, logged, and allowed through to the vendor backstop.
   */
  async function assertPublishAllowed(context, params) {
    try {
      return await evaluatePublish(context, params);
    } catch (err) {
      if (err && err[CONSTRAINT_VERDICT]) {
        throw err;
      }

      // At least one unit even when the TDO list is what was malformed — a skip nobody can see is the same as
      // no skip at all.
      const tdoCount = Math.max(1, _.get(params, 'tdos.length', 0));
      const platform = _.get(params, 'platform');
      countRequestSkip(platform, FALLTHROUGH_CHECK_FAILED, tdoCount);
      log('error', {
        message:
          'VE-26450: media-constraint pre-flight check failed unexpectedly; allowing the publish and deferring ' +
          'to the vendor rejection. This is a defect in the check, not a property of the publish.',
        destinationTypeId: _.get(params, 'destinationTypeId'),
        destinationId: _.get(params, 'destinationId'),
        platform,
        tdoCount,
        err: err && err.message,
        stack: err && err.stack
      });
    }
  }

  // resolvePublishedDurationMs is deliberately not exported: it reads a TDO's media with no ownership check of
  // its own, so a caller holding only an id could turn it into a cross-org duration oracle.
  return {
    assertPublishAllowed
  };
};
