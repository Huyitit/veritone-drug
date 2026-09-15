'use strict';

// VP-2581 — distributeAsset resolver orchestration (BE-17).
//
// VE-26450 adds a pre-flight media-constraint check between the TDO assertion and Job creation. Enforcement
// belongs HERE rather than only in the Distribute modal because this mutation cannot be bypassed — it is scoped
// aiware.destination.read and callable by any client holding that scope — so this is what actually guarantees no
// task slot or media pull is spent on a publish that was never viable.
//
// Distributing an asset is NOT a CRUD verb on Destination — it creates an aiWARE Job with one task on the
// DestinationType's distribute engine (UUID seeded in destination_type.engine_id). The engine picks the task
// up, resolves the TDO's media URL just-in-time, and posts to Ayrshare. There is NO Ayrshare call here, and
// (Q-NEW-8) the resolver does NOT mint a signed URL — it sends the TDO id and lets the engine resolve it from
// the TDO's primary media asset. The Job is returned immediately (Q-B2=D); success here means "submitted",
// not "vendor-accepted".

const _ = require('lodash');
const async = require('async-p');

// Standing upper bound on DistributeAssetInput.tdoIds, independent of the single-asset MVP guard below.
//
// This is a GUARDRAIL, not a reasoned capacity number. Each id still costs its own getTDO plus a primary-asset
// resolution; the fan-out is bounded-concurrent rather than sequential, so n=100 is roughly ten waves of round
// trips inside one synchronous mutation rather than several hundred in a row. Unreachable today behind the
// single-asset guard. Whoever lifts that guard should re-measure against the request timeout before trusting
// 100; do not read it as a capacity estimate.
const MAX_TDO_IDS = 100;

// How many TDO authorizations run at once. Every id needs its OWN getTDO call (see step 5 on why the batch
// getTDOs is not a safe substitute), so the only lever on wall-clock is concurrency. Ten is deliberately well
// under the read pool's size: this mutation shares that pool with every other in-flight request, and starving
// them to speed up one bulk publish is the wrong trade.
const TDO_AUTH_CONCURRENCY = 10;
const createSchemaValidator = require('../../validation/schemaValidator.js');
const createMediaConstraintPolicy = require('./mediaConstraintPolicy.js');

// Editing/interchange containers social vendors don't accept; a Master in one of these is skipped in
// favor of the Proxy. Matched on the bare media type (parameters such as "; version=1" stripped, case
// folded) because content types are stored verbatim from caller input. ProRes usually ships as
// video/quicktime, which is also the normal publishable Master container, so it can't be told apart by
// contentType — the size ceiling (config social.maxPublishRenditionFileSizeBytes) is the guard for it.
const NON_PUBLISHABLE_CONTENT_TYPES = new Set([
  'application/mxf',
  'application/x-mxf',
  'video/mxf',
  'video/x-mxf'
]);

// One page of dmh-renditions is fetched, newest first. getAssets cannot report a total (toPage sets count
// to the page length), so a full page is logged as possibly truncated. The per-TDO asset ceiling defaults
// to 100 (config.rateLimit.maxAssetsPerTDO) but is warn-only, so this can in principle be exceeded.
const RENDITION_PAGE_SIZE = 200;
// Purpose values are customer-writable metadata; cap what we echo into logs and error data.
const MAX_PURPOSES_REPORTED = 10;
const MAX_PURPOSE_LENGTH = 40;

function normalizeContentType(contentType) {
  return String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function purposeOf(asset) {
  return _.trim(String(_.get(asset, 'metadata.details.dmh.Purpose', ''))).toLowerCase();
}

// Both size fields are UNTRUSTED and neither is "the platform's own": metadata.size originates as caller
// input (dal/asset.createAsset copies fileData.size / fileSize into it) and the lazy size probe writes 0
// there on ANY failure (bll/asset.updateAssetSizeError), so a stored 0 is a failure sentinel, not a size;
// dmh.FileSize is vendor metadata. Only a strictly positive finite number counts as known — this also
// discards '', '   ' and anything else Number() coerces to 0 — and when both fields are known the LARGER
// wins: the ceiling exists to keep oversized files off the payload, so the conservative reading is the
// safe one. Returns null when no usable size exists.
function fileSizeOf(asset) {
  const known = [
    _.get(asset, 'metadata.size'),
    _.get(asset, 'metadata.details.dmh.FileSize')
  ]
    .filter((raw) => raw !== undefined && raw !== null)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  return known.length ? Math.max(...known) : null;
}

// Documented default of config social.maxPublishRenditionFileSizeBytes, and the fail-SAFE value when the
// configured ceiling is unusable: a remote-config typo must not silently disarm the only ProRes guard.
const DEFAULT_MAX_PUBLISH_RENDITION_BYTES = 4294967296;

function summarizePurposes(renditions) {
  const all = _.uniq(
    renditions.map((a) =>
      _.truncate(String(_.get(a, 'metadata.details.dmh.Purpose', '(none)')), {
        length: MAX_PURPOSE_LENGTH
      })
    )
  );
  return { purposesFound: _.take(all, MAX_PURPOSES_REPORTED), distinctPurposes: all.length };
}

const PG_UNDEFINED_TABLE = '42P01';

const PUBLISH_PURPOSES = ['master', 'proxy'];

function unsuitableReason(asset, ceiling, purpose) {
  if (!_.trim(asset.uri || '')) return 'empty_uri';
  if (NON_PUBLISHABLE_CONTENT_TYPES.has(normalizeContentType(asset.contentType)))
    return 'non_publishable_container';
  if (ceiling > 0) {
    const size = fileSizeOf(asset);
    if (size === null) return purpose === 'master' ? 'unknown_size' : null;
    if (size > ceiling) return 'over_size_ceiling';
  }
  return null;
}

function selectPublishRendition(renditions, { maxFileSizeBytes } = {}) {
  const ceiling = Number(maxFileSizeBytes) || 0;
  const newestFirst = (a, b) =>
    (Number(b.createdDateTime) || 0) - (Number(a.createdDateTime) || 0) ||
    String(b.id).localeCompare(String(a.id));

  for (const wanted of PUBLISH_PURPOSES) {
    const matches = (renditions || [])
      .filter(
        (asset) =>
          purposeOf(asset) === wanted &&
          unsuitableReason(asset, ceiling, wanted) === null
      )
      .sort(newestFirst);
    if (matches.length) return matches[0];
  }
  return null;
}

function explainNoPublishRendition(renditions, { maxFileSizeBytes } = {}) {
  const ceiling = Number(maxFileSizeBytes) || 0;
  const candidates = (renditions || []).filter((asset) =>
    PUBLISH_PURPOSES.includes(purposeOf(asset))
  );
  if (!candidates.length) {
    return { retryable: true, reasons: ['no_master_or_proxy'] };
  }
  const reasons = _.uniq(
    candidates
      .map((asset) => unsuitableReason(asset, ceiling, purposeOf(asset)))
      .filter(Boolean)
  );
  return {
    retryable: reasons.includes('empty_uri') || reasons.includes('unknown_size'),
    reasons
  };
}

module.exports = function createDistributeAsset(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../../error/index.js')(config);
  const resUtil = require('../../../../resolvers/util.js')(serviceContext);
  const schemaValidator = createSchemaValidator(serviceContext);
  const mediaConstraintPolicy = createMediaConstraintPolicy(serviceContext);
  // Schemas are provisioned globally under the customer-success org (same as dal/destination.validateDetails).
  const defaultOrg = _.get(config, 'db.constants.customerSuccessOrgId', 7682);

  const dalDestination = serviceContext.dal.destination;
  const dalDestinationType = serviceContext.dal.destinationType;

  function countMiss(reason) {
    serviceContext.metrics.incrementCounter('socialPublishRenditionMiss', { reason });
  }

  // Size ceiling in bytes (0 = disabled), read per call so remote config stays live. Unset means "not
  // configured" and takes the default. Anything that is not a non-negative integer is a misconfiguration:
  // logged once, and the default is used so the guard stays ON — Number('four gigs') || 0 would have
  // silently disabled it.
  let warnedInvalidCeiling = false;
  function resolveSizeCeiling() {
    const raw = _.get(config, 'social.maxPublishRenditionFileSizeBytes');
    if (raw === undefined || raw === null) return DEFAULT_MAX_PUBLISH_RENDITION_BYTES;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
    if (!warnedInvalidCeiling) {
      warnedInvalidCeiling = true;
      serviceContext.logger.error(
        'distributeAsset: config social.maxPublishRenditionFileSizeBytes is not a non-negative integer; using the default ceiling',
        { configured: String(raw).slice(0, 40), fallbackBytes: DEFAULT_MAX_PUBLISH_RENDITION_BYTES }
      );
    }
    return DEFAULT_MAX_PUBLISH_RENDITION_BYTES;
  }

  // Rollout lever (module header). Only an explicit false disables the reject.
  function rejectWhenNoPublishRendition() {
    return _.get(config, 'social.rejectWhenNoPublishRendition', true) !== false;
  }

  async function distributeAsset(context, args) {
    const input = args.input;
    const { tdoIds, destinationId, platformPayload } = input;

    // 1. Single-asset MVP (Q-NEW-9). The plural `tdoIds` is the forward-compat shape for bulk distribute;
    //    the server hard-errors on >1 until bulk lands (O-11).
    //
    //    MAX_TDO_IDS is a SEPARATE, standing bound (VE-26450). Steps 5 and 6 are O(n) sequential round trips
    //    over this caller-supplied list, so whoever relaxes the MVP guard below must not silently also remove
    //    the only limit on that fan-out. Keeping the two checks distinct is the point.
    if (Array.isArray(tdoIds) && tdoIds.length > MAX_TDO_IDS) {
      throw new errors.InvalidInput({
        message: `distributeAsset accepts at most ${MAX_TDO_IDS} TDO ids per request.`,
        data: { count: tdoIds.length, max: MAX_TDO_IDS }
      });
    }
    if (!Array.isArray(tdoIds) || tdoIds.length !== 1) {
      throw new errors.InvalidInput({
        message: 'distributeAsset accepts exactly one TDO id for MVP (tdoIds length must be 1).',
        data: { count: Array.isArray(tdoIds) ? tdoIds.length : 0 }
      });
    }
    const tdoId = tdoIds[0];

    const orgId = resUtil.getOrgFromAuthContext(context);
    if (!orgId) {
      throw new errors.NotAllowed({ message: 'No organization in auth context.' });
    }

    // 2. Load the org-owned destination (NotFound if absent / not in caller's org); must be CONNECTED.
    const destination = await dalDestination.loadOwnedDestination(context, destinationId);
    if (destination.status !== 'CONNECTED') {
      throw new errors.InvalidInput({
        message: `Destination ${destinationId} is not connected (status: ${destination.status}); complete the OAuth connection before distributing.`,
        data: { destinationId, status: destination.status }
      });
    }

    // 3. Resolve the DestinationType for the engine id, platform, and publishSchema.
    const destinationType = await dalDestinationType.getDestinationType(context, {
      id: destination.destinationTypeId
    });

    // 4. Validate platformPayload against the publishSchema (BE-09; a nil/`{}` schema imposes no constraints).
    //    Same fetch path as dal/destination.validateDetails (schemas live in structured_data, customer-success org).
    if (destinationType.publishSchemaId) {
      const schema = await serviceContext.dal.structuredData.getSchema(context, {
        id: destinationType.publishSchemaId,
        organizationId: defaultOrg,
        _skipAccessCheck: true
      });
      await schemaValidator.validateAgainstSchema(schema.schema, platformPayload);
    }

    // 5. Assert EVERY id resolves to a TDO the caller may access (rejects cross-org / non-TDO assets — O-21).
    //
    //    `applicationId` is the tenancy filter, despite the name: a TDO's application_id holds the owning
    //    ORGANIZATION's GUID (dal/tdo.js:602). getTDO neither derives it from organizationId (getTDOs does) nor
    //    applies its ACL WHERE block without it, so organizationId alone resolves any TDO in any org.
    //
    //    Every id, not just tdoIds[0], because step 7 reads each TDO's media and dal.asset.getAssets applies no
    //    org filter of its own. Steps 6 and 7 reuse these records rather than re-fetching.
    //
    //    ONE getTDO PER ID, never the batch getTDOs: the batch lets package rows through for an access check
    //    that only getTDO makes (dal/tdo.js:3354, 2468), and only getTDO parses the magic ids step 7 needs.
    //    Bounded concurrency buys back the round trips. Results are written back by index to stay aligned.
    const applicationId = await serviceContext.dal.application.getAppIdFromOrgId(orgId);
    // Fail CLOSED, unlike step 7: a nil applicationId does not weaken that filter, it removes it. Reaching this
    // means the org's sso_group row exists with a null application_id — getAppIdFromOrgId throws NotFound for a
    // missing row.
    if (_.isNil(applicationId)) {
      throw new errors.NotAllowed({
        message: `Organization ${orgId} has no application id; cannot authorize the requested TDOs.`,
        data: { organizationId: orgId }
      });
    }

    const tdos = new Array(tdoIds.length);
    await async.eachLimit(
      tdoIds.map((id, index) => ({ id, index })),
      async ({ id, index }) => {
        tdos[index] = await serviceContext.dal.tdo.getTDO(context, {
          id,
          organizationId: orgId,
          applicationId
        });
      },
      TDO_AUTH_CONCURRENCY
    );

    // 6. Pre-flight media constraints (VE-26450). Duration only; dimensions/aspect are declared but not
    //    enforced — applying them to the rendition selected in step 7 is follow-up work. Throws InvalidInput
    //    before any Job exists, so a rejected submission leaves no task in Processing Center. Takes the
    //    authorized TDO records from step 5 — it never resolves an id itself. Fails OPEN on any uncertainty
    //    (nothing declared, no bounds, ambiguous post type, duration unknown or unreadable), deferring to the
    //    vendor rejection rather than risk a wrong block.
    await mediaConstraintPolicy.assertPublishAllowed(context, {
      tdos,
      destinationTypeId: destination.destinationTypeId,
      platform: destinationType.platform,
      destinationId
    });

    // 7. VE-26886 — select the publish rendition. The only tolerated asset-store failure is a missing
    //    recording_asset partition (42P01), which means the TDO predates the asset store and so has no
    //    renditions; every other error is rethrown, because degrading here would publish the Preview.
    let renditions = null;
    try {
      // getAssets emits no ORDER BY unless asked, so without it the page is arbitrary heap order and could
      // drop the Master on rendition-heavy TDOs.
      const renditionPage = await serviceContext.dal.asset.getAssets(context, {
        containerId: [tdos[0].id],
        assetType: 'dmh-rendition',
        orderBy: 'createdDateTime',
        orderDirection: 'desc',
        limit: RENDITION_PAGE_SIZE
      });
      renditions = _.get(renditionPage, 'records') || [];
    } catch (err) {
      // pg-promise errors carry `code`; DAL-wrapped errors carry it under data.internalData.
      const code = err.code || _.get(err, 'data.internalData.code');
      if (code !== PG_UNDEFINED_TABLE) throw err;
      countMiss('lookup_error');
      serviceContext.logger.warn(
        'distributeAsset: recording_asset partition missing for TDO; treating it as having no dmh-renditions',
        { tdoId, error: err.message }
      );
    }

    let publishRendition = null;
    if (renditions) {
      if (renditions.length >= RENDITION_PAGE_SIZE) {
        serviceContext.logger.warn(
          'distributeAsset: dmh-rendition page is full; older renditions may have been truncated',
          { tdoId, pageSize: RENDITION_PAGE_SIZE }
        );
      }
      if (renditions.length === 0) {
        countMiss('no_renditions');
        serviceContext.logger.info(
          'distributeAsset: TDO has no dmh-renditions; using the primary media asset',
          { tdoId }
        );
      } else {
        const policy = { maxFileSizeBytes: resolveSizeCeiling() };
        publishRendition = selectPublishRendition(renditions, policy);
        if (!publishRendition) {
          countMiss('no_suitable');
          const why = explainNoPublishRendition(renditions, policy);
          const data = {
            tdoId,
            renditionCount: renditions.length,
            ...summarizePurposes(renditions),
            ...why
          };
          if (!rejectWhenNoPublishRendition()) {
            // Operator back-out (social.rejectWhenNoPublishRendition=false): pre-VE-26886 behaviour, still counted.
            serviceContext.logger.warn(
              'distributeAsset: dmh-renditions present but none is a publish-suitable Master/Proxy; rejection disabled by config, falling back to the primary media asset',
              data
            );
          } else {
            serviceContext.logger.warn(
              'distributeAsset: dmh-renditions present but none is a publish-suitable Master/Proxy; rejecting',
              data
            );
            // resource_conflict, not invalid_input: the request is well-formed; the TDO's rendition state is
            // what conflicts. It is in messageUtil.okErrors, so it is not counted as an unexpected error.
            throw new errors.ResourceConflict({
              message:
                `TDO ${tdoId} has ${renditions.length} dmh-rendition(s) but none is a publish-suitable Master or ` +
                `Proxy (${why.reasons.join(', ')}). Refusing to publish the Preview; ` +
                (why.retryable
                  ? 'retry once the Master or Proxy rendition has landed.'
                  : 'a publishable Master or Proxy rendition must be added first.'),
              data
            });
          }
        }
      }
    }
    if (publishRendition) {
      serviceContext.logger.info('distributeAsset: selected publish rendition', {
        tdoId,
        assetId: publishRendition.id,
        purpose: _.get(publishRendition, 'metadata.details.dmh.Purpose'),
        contentType: publishRendition.contentType,
        fileSize: fileSizeOf(publishRendition)
      });
    }

    // 8. Create one Job with one task on the distribute engine. No signedUrl (Q-NEW-8) — the engine resolves
    //    the media URL just-in-time from `assetId` when present, else the TDO's primary media asset, so the
    //    task must carry recordingId/tdoId (ENG-02). createJob derives applicationId from organizationId and
    //    validates the target TDO belongs to that app. sourceAssetId keeps payload.assetId intact on the edge
    //    path, where createTaskPayload rewrites it from task.source_asset_id.
    return serviceContext.dal.job.createJob(context, {
      input: {
        organizationId: orgId,
        targetId: tdoId,
        ...(publishRendition ? { sourceAssetId: publishRendition.id } : {}),
        tasks: [
          {
            engineId: destinationType.engineId,
            payload: {
              tdoId,
              recordingId: tdoId,
              destinationId,
              platform: destinationType.platform,
              platformPayload,
              ...(publishRendition ? { assetId: publishRendition.id } : {})
            }
          }
        ]
      }
    });
  }

  return { distributeAsset };
};

module.exports.selectPublishRendition = selectPublishRendition;
module.exports.explainNoPublishRendition = explainNoPublishRendition;
module.exports.RENDITION_PAGE_SIZE = RENDITION_PAGE_SIZE;
