const chaiExpect = require('chai').expect;
const mockUtil = require('../../../../test/mockUtil.js')();

// BE-17 orchestration tests. The destination/destinationType/tdo/job/structuredData/destinationMediaConstraint
// DALs are mocked, so this verifies the orchestration (single-asset guard, CONNECTED guard, publishSchema
// validation, VE-26450 pre-flight duration enforcement, VE-26886 publish-rendition selection, and the shape of
// the Job/task created on the distribute engine) without a DB or a real engine.

describe('distributeAsset.js (BE-17)', function () {
  // Built once and reused across tests (full serviceContext construction is
  // expensive - ~35 DAL/BLL modules + caches). Every dal.* field this file
  // touches is unconditionally reassigned fresh in beforeEach regardless, so
  // sharing the base context introduces no cross-test leakage.
  const serviceContext = require('../../test/serviceContext.mock.js')();
  let context;
  let bll;
  let dalDestination;
  let dalDestinationType;
  let dalTdo;
  let dalJob;
  let dalStructuredData;
  let dalMediaConstraint;
  let dalAsset;
  let dalApplication;

  // dal.asset.getAssets now serves two callers: VE-26450's duration fallback scan (media assets) and
  // VE-26886's rendition selection (assetType 'dmh-rendition'). The real DAL filters by type, so the mock
  // must too — otherwise one feature's fixtures are fed to the other's logic and the test proves nothing.
  // Stored as thunks, not settled promises: building a rejected promise eagerly trips Node's
  // unhandled-rejection guard before the mock is ever called.
  let mediaAssets;
  let renditionAssets;
  const setMediaAssets = (page) => {
    mediaAssets = () => Promise.resolve(page);
  };
  const setMediaAssetsError = (err) => {
    mediaAssets = () => Promise.reject(err);
  };
  const setRenditions = (page) => {
    renditionAssets = () => Promise.resolve(page);
  };
  const setRenditionsError = (err) => {
    renditionAssets = () => Promise.reject(err);
  };
  const callsOfType = (isRendition) =>
    dalAsset.getAssets.mock.calls.filter(
      ([, a]) => ((a || {}).assetType === 'dmh-rendition') === isRendition
    );
  const mediaScanCalls = () => callsOfType(false);
  const renditionCalls = () => callsOfType(true);

  // VE-26886 — dmh-rendition rows as dal.asset.getAssets returns them (camelCase, metadata parsed,
  // createdDateTime in ms). Purpose lives at metadata.details.dmh.Purpose.
  function makeRendition(id, purpose, createdDateTime, overrides) {
    return {
      id,
      uri: `s3://bucket/${id}.mov`,
      contentType: 'video/quicktime',
      createdDateTime: createdDateTime || 1000,
      metadata: { details: { dmh: { Purpose: purpose, FileSize: 123456 } } },
      ...(overrides || {})
    };
  }

  beforeEach(function () {
    serviceContext._clearAll();
    context = mockUtil.makeContext();

    dalDestination = {
      loadOwnedDestination: jest.fn().mockResolvedValue({
        id: 'dest-1',
        status: 'CONNECTED',
        destinationTypeId: 'dt-1',
        vendorProfileId: 'pk-1'
      })
    };
    dalDestinationType = {
      getDestinationType: jest.fn().mockResolvedValue({
        id: 'dt-1',
        engineId: '16568b5f-2aaa-48e6-975b-2dec5f098a29',
        platform: 'youtube',
        publishSchemaId: null
      })
    };
    dalTdo = {
      getTDO: jest
        .fn()
        .mockImplementation((ctx, a) =>
          Promise.resolve({ id: a.id, applicationId: 'app-1', orgId: 1, jsondata: {} })
        ),
      // VE-26450: the pre-flight check resolves the SAME asset the engine does, via getPrimaryAsset.
      getPrimaryAsset: jest
        .fn()
        .mockResolvedValue({ id: 'asset-1', metadata: { mediaDuration: 13.145 } })
    };
    dalJob = {
      createJob: jest
        .fn()
        .mockImplementation((ctx, a) => Promise.resolve({ id: 'job-1', status: 'pending', _input: a.input }))
    };
    dalStructuredData = { getSchema: jest.fn().mockResolvedValue({ schema: {} }) };
    // VE-26450: applicationId is what actually enforces tenancy on getTDO (organizationId alone does not).
    dalApplication = { getAppIdFromOrgId: jest.fn().mockResolvedValue('app-1') };
    // VE-26450: default is "nothing declared", which must leave the pre-VE-26450 behaviour untouched.
    dalMediaConstraint = { getMediaConstraints: jest.fn().mockResolvedValue([]) };
    // Defaults: no media assets for the VE-26450 duration fallback, and no dmh-renditions for VE-26886
    // (a non-DMH TDO), which keeps the legacy primary-media path.
    setMediaAssets({ records: [], count: 0 });
    setRenditions({ records: [], count: 0 });
    dalAsset = {
      getAssets: jest
        .fn()
        .mockImplementation((ctx, a) =>
          (a || {}).assetType === 'dmh-rendition' ? renditionAssets() : mediaAssets()
        )
    };

    serviceContext.dal.destination = dalDestination;
    serviceContext.dal.destinationType = dalDestinationType;
    serviceContext.dal.tdo = dalTdo;
    serviceContext.dal.job = dalJob;
    serviceContext.dal.structuredData = dalStructuredData;
    serviceContext.dal.destinationMediaConstraint = dalMediaConstraint;
    serviceContext.dal.asset = dalAsset;
    serviceContext.dal.application = dalApplication;

    bll = require('./distributeAsset.js')(serviceContext);
  });

  it('creates one Job with a task on the distribute engine (no signedUrl) and returns it', async function () {
    const job = await bll.distributeAsset(context, {
      input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: { title: 'Hi' } }
    });

    expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    const ji = dalJob.createJob.mock.calls[0][1].input;
    chaiExpect(ji.targetId).to.equal('tdo-1');
    chaiExpect(ji.organizationId).to.exist;
    chaiExpect(ji.tasks).to.have.length(1);

    const task = ji.tasks[0];
    chaiExpect(task.engineId).to.equal('16568b5f-2aaa-48e6-975b-2dec5f098a29');
    chaiExpect(task.payload).to.deep.equal({
      tdoId: 'tdo-1',
      recordingId: 'tdo-1',
      destinationId: 'dest-1',
      platform: 'youtube',
      platformPayload: { title: 'Hi' }
    });
    // VE-25619 (VE-25263 AC3): the plaintext Ayrshare Profile-Key must NOT ride in the task payload — the engine
    // resolves it from core (VE-25611). `destinationId` stays so the fetch-from-core authz binding keeps working.
    chaiExpect(task.payload).to.not.have.property('vendorProfileId');
    chaiExpect(task.payload.destinationId).to.equal('dest-1');
    // Q-NEW-8: the resolver must NOT mint/send a media URL — the engine resolves it from the TDO.
    chaiExpect(task.payload).to.not.have.property('signedUrl');
    // VE-26886: no dmh-renditions on this TDO → no assetId key; engine falls through to primary media.
    chaiExpect(ji).to.not.have.property('sourceAssetId');
    chaiExpect(job.id).to.equal('job-1');

    // org-scoped TDO assertion happened — applicationId is what actually makes getTDO enforce ownership
    // (its check is skipped when the arg is absent), so it must be present.
    expect(dalTdo.getTDO).toHaveBeenCalledTimes(1);
    const tdoArg = dalTdo.getTDO.mock.calls[0][1];
    chaiExpect(tdoArg.id).to.equal('tdo-1');
    chaiExpect(tdoArg.organizationId).to.exist;
    chaiExpect(tdoArg.applicationId).to.equal('app-1');
    expect(dalApplication.getAppIdFromOrgId).toHaveBeenCalledTimes(1);
  });

  // VE-24929 (BL-3 task-payload contract): for the social platforms this ticket adds, the emitted task must carry the
  // destination type's `platform` VERBATIM (lowercase) and route by the type's `engineId` (not a hardcoded value), with
  // no signedUrl and no mediaType (the engine resolves media from the TDO and infers type). Contract ref:
  // U-SHARED-ENGINE code/implementation-summary.md.
  ['facebook', 'instagram', 'tiktok'].forEach(function (platform) {
    it(`emits platform '${platform}' verbatim and routes by the type's engineId`, async function () {
      dalDestinationType.getDestinationType.mockResolvedValue({
        id: 'dt-x',
        engineId: 'engine-uuid-xyz',
        platform,
        publishSchemaId: null
      });

      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: { caption: 'hi' } }
      });

      const task = dalJob.createJob.mock.calls[0][1].input.tasks[0];
      chaiExpect(task.engineId).to.equal('engine-uuid-xyz'); // from the type, not hardcoded
      chaiExpect(task.payload.platform).to.equal(platform); // verbatim, lowercase
      chaiExpect(task.payload.platformPayload).to.deep.equal({ caption: 'hi' });
      chaiExpect(task.payload).to.not.have.property('signedUrl');
      chaiExpect(task.payload).to.not.have.property('mediaType');
    });
  });

  it('rejects more than one TDO id (single-asset MVP) before touching anything else', async function () {
    await expect(
      bll.distributeAsset(context, {
        input: { tdoIds: ['a', 'b'], destinationId: 'dest-1', platformPayload: {} }
      })
    ).rejects.toThrow();

    expect(dalDestination.loadOwnedDestination).not.toHaveBeenCalled();
    expect(dalJob.createJob).not.toHaveBeenCalled();
  });

  it('rejects a context with no organization before loading the destination or TDO (security-coverage)', async function () {
    context = {};

    let threw = false;
    try {
      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });
    } catch (e) {
      threw = true;
      chaiExpect(e.message).to.contain('No organization');
    }
    chaiExpect(threw).to.equal(true);

    expect(dalDestination.loadOwnedDestination).not.toHaveBeenCalled();
    expect(dalTdo.getTDO).not.toHaveBeenCalled();
    expect(dalJob.createJob).not.toHaveBeenCalled();
  });

  it('rejects a destination that is not CONNECTED (no Job, no TDO check)', async function () {
    dalDestination.loadOwnedDestination.mockResolvedValue({
      id: 'dest-1',
      status: 'PENDING_OAUTH',
      destinationTypeId: 'dt-1',
      vendorProfileId: 'pk-1'
    });

    await expect(
      bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      })
    ).rejects.toThrow();

    expect(dalJob.createJob).not.toHaveBeenCalled();
    expect(dalTdo.getTDO).not.toHaveBeenCalled();
  });

  it('validates platformPayload against the publishSchema when the type defines one', async function () {
    dalDestinationType.getDestinationType.mockResolvedValue({
      id: 'dt-1',
      engineId: 'eng-x',
      platform: 'youtube',
      publishSchemaId: 'sch-1'
    });

    await bll.distributeAsset(context, {
      input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: { title: 'Hi' } }
    });

    expect(dalStructuredData.getSchema).toHaveBeenCalledTimes(1);
    chaiExpect(dalStructuredData.getSchema.mock.calls[0][1].id).to.equal('sch-1');
    expect(dalJob.createJob).toHaveBeenCalledTimes(1);
  });

  // VE-26450 — pre-flight media-constraint enforcement. Instagram Reels values as seeded in V3_300.
  describe('VE-26450 pre-flight duration enforcement', function () {
    const REELS = {
      id: 'mc-1',
      postType: 'reels',
      constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 900000 } } }
    };

    function declareReels(constraint) {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        constraint || REELS
      ]);
      dalDestinationType.getDestinationType.mockResolvedValue({
        id: 'dt-1',
        engineId: 'eng-x',
        platform: 'instagram',
        publishSchemaId: null
      });
    }

    function withDurationSeconds(seconds) {
      dalTdo.getPrimaryAsset.mockResolvedValue({
        id: 'asset-1',
        metadata: { mediaDuration: seconds }
      });
    }

    function distribute() {
      return bll.distributeAsset(context, {
        input: {
          tdoIds: ['tdo-1'],
          destinationId: 'dest-1',
          platformPayload: { caption: 'hi' }
        }
      });
    }

    it('rejects a publish over the declared maximum and creates NO Job', async function () {
      declareReels();
      withDurationSeconds(3197.06); // the VE-26208 asset

      await expect(distribute()).rejects.toThrow();

      // The acceptance criterion is "no task appears in Processing Center"; never reaching createJob is the
      // unit-level proxy for that.
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    it('carries the i18n key and params on the rejection (decision 3 contract)', async function () {
      declareReels();
      withDurationSeconds(3197.06);

      let err;
      try {
        await distribute();
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      // The client renders user-visible copy from these; renaming a param silently breaks it, so the names are
      // asserted rather than merely their presence.
      chaiExpect(err.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MAX');
      chaiExpect(err.data.i18nParams).to.deep.equal({
        platform: 'instagram',
        limitSeconds: 900,
        actualSeconds: 3198,
        limitMs: 900000,
        actualMs: 3197060
      });
      chaiExpect(err.data.constraint).to.equal('duration');
      chaiExpect(err.data.tdoId).to.equal('tdo-1');
      chaiExpect(err.data.destinationId).to.equal('dest-1');
      // Developer-facing fallback for API callers with no i18n bundle.
      chaiExpect(err.message).to.contain('900 seconds');
      chaiExpect(err.message).to.contain('3198 seconds');
    });

    it('rejects a publish under the declared minimum', async function () {
      declareReels();
      withDurationSeconds(1.5);

      let err;
      try {
        await distribute();
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MIN');
      chaiExpect(err.data.i18nParams.limitSeconds).to.equal(3);
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    it('allows a publish inside the declared range', async function () {
      declareReels();
      withDurationSeconds(13.145); // the VE-26202 asset — must remain publishable

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('allows a NULL duration through to the vendor backstop (expected case, not an edge case)', async function () {
      declareReels();
      // Both paths must yield nothing, or the default primary asset answers first and this asserts nothing.
      dalTdo.getPrimaryAsset.mockResolvedValue(null);
      setMediaAssets({
        records: [{ id: 'asset-1', metadata: {} }]
      });

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('allows the publish when the destination declares no constraints at all', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([]);
      withDurationSeconds(3197.06); // would violate Reels, but nothing is declared for this destination

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('allows the publish when a constraint row declares no duration bounds', async function () {
      declareReels({ id: 'mc-2', postType: 'reels', constraintSchema: { properties: {} } });
      withDurationSeconds(3197.06);

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      // No point paying for an asset read when there is nothing to compare against.
      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
      expect(mediaScanCalls()).toHaveLength(0);
    });

    it('queries constraints by destination type WITHOUT filtering on a post type', async function () {
      declareReels();
      withDurationSeconds(13.145);

      await distribute();

      expect(dalMediaConstraint.getMediaConstraints).toHaveBeenCalledTimes(1);
      const args = dalMediaConstraint.getMediaConstraints.mock.calls[0][1];
      chaiExpect(args.destinationTypeIds).to.deep.equal(['dt-1']);
      // Filtering by a hardcoded post type would silently find nothing for platforms that have no such type,
      // letting their publishes through unenforced. Post type is descriptive data on the row, not a lookup key.
      chaiExpect(args.postType).to.equal(undefined);
    });

    // Decision 5 ("Reels") answered a question about INSTAGRAM. These two guard against that answer leaking into
    // the lookup and quietly disabling enforcement on every other platform.
    ['tiktok', 'youtube', 'facebook'].forEach(function (platform) {
      it(`enforces duration for '${platform}' whose post type is not reels`, async function () {
        dalDestinationType.getDestinationType.mockResolvedValue({
          id: 'dt-9',
          engineId: 'eng-x',
          platform,
          publishSchemaId: null
        });
        dalMediaConstraint.getMediaConstraints.mockResolvedValue([
          { id: 'mc-9', postType: 'video', constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 60000 } } } }
        ]);
        withDurationSeconds(120); // over the 60s max

        let err;
        try {
          await distribute();
        } catch (e) {
          err = e;
        }

        chaiExpect(err, `${platform} publish should have been rejected`).to.exist;
        chaiExpect(err.data.i18nParams.platform).to.equal(platform);
        chaiExpect(err.data.i18nParams.limitSeconds).to.equal(60);
        expect(dalJob.createJob).not.toHaveBeenCalled();
      });
    });

    it('declines to guess when several post types are declared, rather than risk a wrong rejection', async function () {
      declareReels();
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        { id: 'mc-a', postType: 'reels', constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 900000 } } } },
        { id: 'mc-b', postType: 'stories', constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 60000 } } } }
      ]);
      withDurationSeconds(300); // legal as a Reel, illegal as a Story — no selector says which this is

      await distribute();

      // Falls through to the vendor backstop instead of enforcing the stricter row.
      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    // The duration measured must be the asset the platform names as primary, not whichever row Postgres returns.
    it('measures the primary media asset — the same one the engine resolves', async function () {
      declareReels();
      withDurationSeconds(13.145);

      await distribute();

      expect(dalTdo.getPrimaryAsset).toHaveBeenCalledTimes(1);
      const [, tdoArg, optsArg] = dalTdo.getPrimaryAsset.mock.calls[0];
      chaiExpect(tdoArg.id).to.equal('tdo-1');
      chaiExpect(optsArg.assetType).to.equal('media');
      // The unordered enumeration must not be consulted when the primary asset answers.
      expect(mediaScanCalls()).toHaveLength(0);
    });

    it('prefers the primary asset even when other media assets would give a different verdict', async function () {
      declareReels();
      // Primary is a publishable clip; a scan might have surfaced the over-length master instead.
      dalTdo.getPrimaryAsset.mockResolvedValue({ id: 'clip', metadata: { mediaDuration: 30 } });
      setMediaAssets({
        records: [{ id: 'master', metadata: { mediaDuration: 3197.06 } }]
      });

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('uses the scan when the TDO has EXACTLY ONE media asset (no selection to guess)', async function () {
      declareReels();
      dalTdo.getPrimaryAsset.mockResolvedValue(null);
      setMediaAssets({
        records: [{ id: 'asset-1', metadata: { mediaDuration: 3197.06 } }]
      });

      await expect(distribute()).rejects.toThrow();

      const args = mediaScanCalls()[0][1];
      chaiExpect(args.containerId).to.equal('tdo-1');
      chaiExpect(args.assetType).to.equal('media');
      chaiExpect(args.orderBy).to.equal('createdDateTime');
      chaiExpect(args.orderDirection).to.equal('desc');
      chaiExpect(args.limit).to.be.a('number');
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    // The platform's newest-media-as-primary rule is behind a feature flag that defaults to false, so choosing
    // for it here would measure one asset while the engine publishes another.
    it('declines to guess when the TDO has MORE THAN ONE media asset', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalTdo.getPrimaryAsset.mockResolvedValue(null);
      setMediaAssets({
        records: [
          { id: 'clip', metadata: { mediaDuration: 30 } },
          { id: 'master', metadata: { mediaDuration: 3197.06 } }
        ]
      });

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintFallthrough', {
        platform: 'instagram',
        reason: 'ambiguous_media_asset'
      });
      incrementCounter.mockRestore();
    });

    // The constraint read must fail open too, not just the asset read.
    it('allows the publish when the CONSTRAINT read throws, and counts it', async function () {
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalDestinationType.getDestinationType.mockResolvedValue({
        id: 'dt-1',
        engineId: 'eng-x',
        platform: 'instagram',
        publishSchemaId: null
      });
      dalMediaConstraint.getMediaConstraints.mockRejectedValue(new Error('statement timeout'));

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintFallthrough', {
        platform: 'instagram',
        reason: 'constraints_unreadable'
      });
      // Per-request skips must also emit the per-TDO denominator, or the rate is +Inf during an outage.
      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintEvaluated', {
        platform: 'instagram'
      });
      incrementCounter.mockRestore();
    });

    it('falls back when getPrimaryAsset resolves nothing at all', async function () {
      declareReels();
      dalTdo.getPrimaryAsset.mockResolvedValue(null);
      setMediaAssets({
        records: [{ id: 'asset-1', metadata: { mediaDuration: 13.145 } }]
      });

      await distribute();

      expect(mediaScanCalls()).toHaveLength(1);
      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    // A read failure must not fail a publish that would otherwise have succeeded.
    it('allows the publish when the asset read throws, and counts it as unreadable', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalTdo.getPrimaryAsset.mockRejectedValue(new Error('relation does not exist'));
      setMediaAssetsError(new Error('relation does not exist'));

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      const fallthrough = incrementCounter.mock.calls.find(
        (c) => c[0] === 'distributeMediaConstraintFallthrough'
      );
      chaiExpect(fallthrough, 'expected an unreadable-duration fallthrough').to.exist;
      chaiExpect(fallthrough[1].reason).to.equal('duration_unreadable');
      incrementCounter.mockRestore();
    });

    // 0 is a degenerate probe result, not a measurement — enforcing it would reject a publish the vendor accepts.
    [0, 0.0004].forEach(function (seconds) {
      it(`treats a duration of ${seconds}s as unknown rather than under-minimum`, async function () {
        declareReels();
        withDurationSeconds(seconds);

        await distribute();

        expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      });
    });

    // Tenancy on getTDO comes from applicationId, NOT organizationId: getTDO does not derive the app id (unlike
    // getTDOs) and the ACL WHERE block is gated on applicationIds, so org alone resolves any TDO in any org.
    it('resolves each TDO with the applicationId that actually enforces tenancy', async function () {
      declareReels();
      withDurationSeconds(13.145);

      await distribute();

      expect(dalApplication.getAppIdFromOrgId).toHaveBeenCalledTimes(1);
      expect(dalTdo.getTDO).toHaveBeenCalledTimes(1);
      const tdoArg = dalTdo.getTDO.mock.calls[0][1];
      chaiExpect(tdoArg.id).to.equal('tdo-1');
      chaiExpect(tdoArg.organizationId, 'org scope').to.exist;
      chaiExpect(
        tdoArg.applicationId,
        'applicationId is the filter that actually rejects a foreign TDO'
      ).to.equal('app-1');
    });

    // A nil applicationId does not narrow the ACL predicate, it removes it: getTDO gates the whole WHERE block
    // on applicationIds being present. Failing OPEN here — the policy everywhere else in this check — would
    // resolve any TDO in any org, so this one path fails closed, before a single id is resolved.
    it('rejects the publish when the org resolves to no application id, resolving no TDO', async function () {
      dalApplication.getAppIdFromOrgId.mockResolvedValue(null);
      declareReels();
      withDurationSeconds(13.145);

      let err;
      try {
        await distribute();
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err, 'expected the publish to be refused').to.exist;
      chaiExpect(err.name).to.equal('not_allowed');
      expect(dalTdo.getTDO).not.toHaveBeenCalled();
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    // Batching the authorizations through dal.tdo.getTDOs would be cheaper and is NOT equivalent: the batch
    // path lets package TDOs through for an access decision that only getTDO makes, so it would resolve another
    // org's package TDO. Pinned as a test because the cheaper call is the obvious-looking change.
    it('authorizes through getTDO, never the batch resolver that skips the package check', async function () {
      dalTdo.getTDOs = jest.fn();
      declareReels();
      withDurationSeconds(13.145);

      await distribute();

      expect(dalTdo.getTDOs).not.toHaveBeenCalled();
      expect(dalTdo.getTDO).toHaveBeenCalledTimes(1);
    });

    // The per-id fan-out cannot be exercised while the length !== 1 guard stands, so this asserts the guard
    // rather than pretending to cover it. mediaConstraintPolicy.spec.js covers the bulk shape directly.
    it('rejects a tdoIds list over the standing maximum, separately from the MVP guard', async function () {
      // Two distinct checks on purpose: lifting the single-asset guard must not remove the fan-out bound.
      const many = Array.from({ length: 101 }, (_v, i) => `tdo-${i}`);

      let err;
      try {
        await bll.distributeAsset(context, {
          input: { tdoIds: many, destinationId: 'dest-1', platformPayload: {} }
        });
      } catch (e) {
        err = e;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.data.max).to.equal(100);
      chaiExpect(err.data.count).to.equal(101);
      expect(dalDestination.loadOwnedDestination).not.toHaveBeenCalled();
    });

    it('cannot yet be reached with more than one TDO (the loop is guarded upstream)', async function () {
      await expect(
        bll.distributeAsset(context, {
          input: { tdoIds: ['a', 'b'], destinationId: 'dest-1', platformPayload: {} }
        })
      ).rejects.toThrow();
      expect(dalTdo.getTDO).not.toHaveBeenCalled();
    });

    it('counts an evaluation, giving the rejection and fallthrough counters a denominator', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      withDurationSeconds(13.145);

      await distribute();

      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintEvaluated', {
        platform: 'instagram'
      });
      incrementCounter.mockRestore();
    });

    it('does NOT count an evaluation when there is nothing to evaluate', async function () {
      // No declared bounds means nothing was ever a candidate, so counting it would inflate the denominator.
      declareReels({ id: 'mc-2', postType: 'reels', constraintSchema: { properties: {} } });
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');

      await distribute();

      expect(incrementCounter).not.toHaveBeenCalledWith(
        'distributeMediaConstraintEvaluated',
        expect.anything()
      );
      incrementCounter.mockRestore();
    });

    it('treats a magic-id TDO as unknown rather than scanning past its asset whitelist', async function () {
      declareReels();
      // getPrimaryAsset nulls the id when the primary asset is outside the magic id's whitelist; the scan knows
      // nothing about that whitelist, so running it would read an asset the caller was not granted.
      dalTdo.getTDO.mockResolvedValue({
        id: 'tdo-1',
        applicationId: 'app-1',
        orgId: 1,
        jsondata: {},
        magicIdData: { some: 'whitelist' }
      });
      dalTdo.getPrimaryAsset.mockResolvedValue(null);
      setMediaAssets({
        records: [{ id: 'not-whitelisted', metadata: { mediaDuration: 3197.06 } }]
      });

      await distribute();

      expect(mediaScanCalls()).toHaveLength(0);
      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('counts the magic-id skip under its own reason, not as an unstamped duration', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalTdo.getTDO.mockResolvedValue({
        id: 'tdo-1',
        applicationId: 'app-1',
        orgId: 1,
        jsondata: {},
        magicIdData: { some: 'whitelist' }
      });
      dalTdo.getPrimaryAsset.mockResolvedValue(null);

      await distribute();

      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintFallthrough', {
        platform: 'instagram',
        reason: 'magic_id_scope'
      });
      incrementCounter.mockRestore();
    });

    // The only cases where the > / >= choice is observable. Bounds are inclusive.
    it('allows a duration exactly equal to the declared maximum', async function () {
      declareReels();
      withDurationSeconds(900);

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    it('allows a duration exactly equal to the declared minimum', async function () {
      declareReels();
      withDurationSeconds(3);

      await distribute();

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
    });

    // A renamed counter degrades to a warn log in production, so the names and labels are asserted.
    it('emits the rejection counter with the platform and constraint labels', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      withDurationSeconds(3197.06);

      await expect(distribute()).rejects.toThrow();

      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintRejection', {
        platform: 'instagram',
        constraint: 'duration'
      });
      incrementCounter.mockRestore();
    });

    it('emits the fallthrough counter when the duration is unknown', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalTdo.getPrimaryAsset.mockResolvedValue({ id: 'a', metadata: {} });
      setMediaAssets({ records: [] });

      await distribute();

      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintFallthrough', {
        platform: 'instagram',
        reason: 'duration_unknown'
      });
      incrementCounter.mockRestore();
    });

    it('emits the fallthrough counter when several post types are declared', async function () {
      declareReels();
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        { id: 'a', postType: 'reels', constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 900000 } } } },
        { id: 'b', postType: 'stories', constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 60000 } } } }
      ]);
      withDurationSeconds(300);

      await distribute();

      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintFallthrough', {
        platform: 'instagram',
        reason: 'ambiguous_post_type'
      });
      expect(incrementCounter).toHaveBeenCalledWith('distributeMediaConstraintEvaluated', {
        platform: 'instagram'
      });
      incrementCounter.mockRestore();
    });
  });

  // VE-26886 — publish-rendition selection. Contract (module header of distributeAsset.js): Master, else
  // Proxy, never a Preview; the id rides as payload.assetId AND as the job's sourceAssetId (the edge task
  // path rewrites payload.assetId from task.source_asset_id); a TDO with renditions but no publishable
  // Master/Proxy is rejected; only a TDO with no renditions (or a failed lookup) falls through to the
  // primary media asset. Still no signedUrl at submit (Q-NEW-8).
  describe('publish rendition selection (VE-26886)', function () {
    const missCount = (reason) =>
      serviceContext.metrics.getValue('socialPublishRenditionMiss', 'reason', reason);

    describe('selectPublishRendition (pure policy)', function () {
      const { selectPublishRendition } = require('./distributeAsset.js');
      const ids = (renditions, opts) => {
        const picked = selectPublishRendition(renditions, opts);
        return picked ? picked.id : null;
      };

      const cases = [
        {
          name: 'Master beats Proxy and Preview',
          renditions: [makeRendition('pv', 'Preview'), makeRendition('m', 'Master'), makeRendition('p', 'Proxy')],
          expected: 'm'
        },
        {
          name: 'Proxy when no Master',
          renditions: [makeRendition('pv', 'Preview'), makeRendition('p', 'Proxy')],
          expected: 'p'
        },
        {
          name: 'Previews only → null',
          renditions: [makeRendition('pv1', 'Preview'), makeRendition('pv2', 'Preview')],
          expected: null
        },
        { name: 'empty list → null', renditions: [], expected: null },
        {
          name: 'Purpose is case-insensitive',
          renditions: [makeRendition('m', 'MASTER')],
          expected: 'm'
        },
        {
          name: 'Purpose is trimmed (ingest whitespace)',
          renditions: [makeRendition('m', ' Master '), makeRendition('p', 'Proxy')],
          expected: 'm'
        },
        {
          name: 'decorated Purpose is NOT matched (surfaced via purposesFound instead)',
          renditions: [makeRendition('m', 'Master (H.264)'), makeRendition('p', 'Proxy')],
          expected: 'p'
        },
        {
          name: 'row with no dmh details has no Purpose → not a candidate',
          renditions: [{ id: 'x', uri: 's3://b/x.mp4', contentType: 'video/mp4', createdDateTime: 1, metadata: {} }],
          expected: null
        },
        {
          name: 'Master with empty uri (file not landed) → Proxy',
          renditions: [makeRendition('m', 'Master', 2000, { uri: '' }), makeRendition('p', 'Proxy', 1000)],
          expected: 'p'
        },
        {
          name: 'Master in MXF → Proxy',
          renditions: [makeRendition('m', 'Master', 2000, { contentType: 'application/mxf' }), makeRendition('p', 'Proxy')],
          expected: 'p'
        },
        {
          name: 'MXF with content-type parameters and odd casing is still MXF',
          renditions: [
            makeRendition('m', 'Master', 2000, { contentType: 'APPLICATION/MXF; version=1' }),
            makeRendition('p', 'Proxy')
          ],
          expected: 'p'
        },
        {
          name: 'Master and Proxy both unsuitable → null (caller rejects)',
          renditions: [
            makeRendition('m', 'Master', 2000, { uri: '' }),
            makeRendition('p', 'Proxy', 1000, { contentType: 'video/mxf' })
          ],
          expected: null
        },
        {
          name: 'Master over the ceiling (dmh.FileSize) → Proxy',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } } }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          name: 'the larger of metadata.size and dmh.FileSize governs (metadata.size over the ceiling)',
          renditions: [
            makeRendition('m', 'Master', 2000, {
              metadata: { size: 50e9, details: { dmh: { Purpose: 'Master', FileSize: 100 } } }
            }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          name: 'the larger of metadata.size and dmh.FileSize governs (dmh.FileSize over the ceiling)',
          renditions: [
            makeRendition('m', 'Master', 2000, {
              metadata: { size: 100, details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } }
            }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          // bll/asset.updateAssetSizeError writes metadata.size = 0 on ANY size-probe failure (missing blob,
          // external URI with no content-length). It must not read as "0 bytes, under the ceiling".
          name: 'metadata.size 0 is the size-probe failure sentinel, not a size → dmh.FileSize governs',
          renditions: [
            makeRendition('m', 'Master', 2000, {
              metadata: { size: 0, details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } }
            }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          name: 'metadata.size 0 with no other size → unknown → Master alone is not selectable',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { size: 0, details: { dmh: { Purpose: 'Master' } } } })
          ],
          opts: { maxFileSizeBytes: 100 },
          expected: null
        },
        {
          // The ceiling is the only ProRes guard; an unknown Master size fails CLOSED to the Proxy.
          name: 'ceiling configured but Master size unknown → Proxy (fail closed)',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { details: { dmh: { Purpose: 'Master' } } } }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          name: 'non-numeric FileSize counts as unknown → Master alone is not selectable',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { details: { dmh: { Purpose: 'Master', FileSize: '50 GB' } } } })
          ],
          opts: { maxFileSizeBytes: 100 },
          expected: null
        },
        {
          // Number('   ') === 0; it must read as unknown, not as 0 bytes.
          name: 'whitespace FileSize counts as unknown, not as 0 bytes → Proxy',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { details: { dmh: { Purpose: 'Master', FileSize: '   ' } } } }),
            makeRendition('p', 'Proxy')
          ],
          opts: { maxFileSizeBytes: 1e9 },
          expected: 'p'
        },
        {
          // The Proxy is the small H.264 derivative the ceiling exists to fall back to; size-less Proxies stay
          // publishable or every size-less DMH TDO would fail.
          name: 'Proxy with unknown size stays selectable (the ceiling guards Masters)',
          renditions: [
            makeRendition('p', 'Proxy', 1000, { metadata: { details: { dmh: { Purpose: 'Proxy' } } } })
          ],
          opts: { maxFileSizeBytes: 100 },
          expected: 'p'
        },
        {
          name: 'ceiling 0 disables the size check',
          renditions: [
            makeRendition('m', 'Master', 2000, { metadata: { details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } } })
          ],
          opts: { maxFileSizeBytes: 0 },
          expected: 'm'
        },
        {
          name: 'newest Master wins',
          renditions: [makeRendition('old', 'Master', 1000), makeRendition('new', 'Master', 3000), makeRendition('mid', 'Master', 2000)],
          expected: 'new'
        },
        {
          name: 'Master wins over a NEWER Proxy (purpose outranks recency)',
          renditions: [makeRendition('m', 'Master', 1000), makeRendition('p', 'Proxy', 5000)],
          expected: 'm'
        },
        {
          name: 'string timestamps do not throw and stay deterministic',
          renditions: [
            makeRendition('old', 'Master', '2024-01-01T00:00:00Z'),
            makeRendition('new', 'Master', '2025-01-01T00:00:00Z')
          ],
          // Number('2025-…') is NaN → both coerce to 0 → id tie-break; the point is it must not throw and
          // must be deterministic. (mapAsset guarantees numeric ms today; this guards a future ES-backed fetch.)
          expected: 'old'
        }
      ];

      cases.forEach(({ name, renditions, opts, expected }) => {
        it(name, function () {
          chaiExpect(ids(renditions, opts)).to.equal(expected);
        });
      });

      // created_date_time has one-second resolution, so batch-registered Masters routinely share a
      // timestamp. What matters is stability across retries, not which secondary key is used.
      it('picks the same Master regardless of input order when timestamps tie', function () {
        const a = makeRendition('asset-master-aaa', 'Master', 1000);
        const z = makeRendition('asset-master-zzz', 'Master', 1000);
        const first = ids([a, z]);
        chaiExpect(ids([z, a])).to.equal(first);
        chaiExpect(first).to.be.oneOf(['asset-master-aaa', 'asset-master-zzz']);
      });
    });

    it('selects the Master, puts its id on the payload AND as the job sourceAssetId (no signedUrl)', async function () {
      setRenditions({
        records: [
          makeRendition('asset-preview', 'Preview'),
          makeRendition('asset-master', 'Master'),
          makeRendition('asset-proxy', 'Proxy')
        ],
        count: 3
      });

      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });

      // the rendition fetch is scoped to the org-asserted TDO and to dmh-renditions only, with an
      // explicit ordering (getAssets emits no ORDER BY unless asked, so the page would otherwise be
      // arbitrary heap order and the page cap could drop the Master).
      expect(renditionCalls()).toHaveLength(1);
      const assetArgs = renditionCalls()[0][1];
      chaiExpect(assetArgs.containerId).to.deep.equal(['tdo-1']);
      chaiExpect(assetArgs.assetType).to.equal('dmh-rendition');
      chaiExpect(assetArgs.orderBy).to.equal('createdDateTime');
      chaiExpect(assetArgs.orderDirection).to.equal('desc');

      const ji = dalJob.createJob.mock.calls[0][1].input;
      const task = ji.tasks[0];
      chaiExpect(task.payload.assetId).to.equal('asset-master');
      chaiExpect(task.payload).to.not.have.property('signedUrl');
      // `assetId` is a platform-reserved payload key: bll/task.createTaskPayload overwrites it with
      // task.source_asset_id on the edge path. The job-level sourceAssetId is what makes that agree.
      chaiExpect(ji.sourceAssetId).to.equal('asset-master');
      chaiExpect(missCount('no_suitable')).to.equal(0);
    });

    it('falls back to the Proxy rendition when no Master exists', async function () {
      setRenditions({
        records: [makeRendition('asset-preview', 'Preview'), makeRendition('asset-proxy', 'Proxy')],
        count: 2
      });

      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });

      const ji = dalJob.createJob.mock.calls[0][1].input;
      chaiExpect(ji.tasks[0].payload.assetId).to.equal('asset-proxy');
      chaiExpect(ji.sourceAssetId).to.equal('asset-proxy');
    });

    // Matches the engine (engines PR #1843), which refuses to fall back from an unresolvable assetId: a
    // DMH TDO whose Master/Proxy have not landed (or are unpublishable) must NOT silently publish the
    // Preview — that is the defect VE-26886 fixes. A failed publish is recoverable; a wrong public post is not.
    it('REJECTS the publish (no Job) when renditions exist but none is a publishable Master or Proxy', async function () {
      setRenditions({
        records: [makeRendition('asset-preview-1', 'Preview'), makeRendition('asset-preview-2', 'Preview')],
        count: 2
      });

      let err;
      try {
        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });
      } catch (e) {
        err = e;
      }
      chaiExpect(err).to.exist;
      // resource_conflict (in messageUtil.okErrors), not invalid_input: the request is fine, the TDO's
      // rendition state is not ready. Previews-only means the Master/Proxy may still land → retryable.
      chaiExpect(err.name).to.equal('resource_conflict');
      chaiExpect(err.message).to.contain('Master or Proxy');
      chaiExpect(err.data.renditionCount).to.equal(2);
      chaiExpect(err.data.purposesFound).to.deep.equal(['Preview']);
      chaiExpect(err.data.retryable).to.equal(true);
      chaiExpect(err.data.reasons).to.deep.equal(['no_master_or_proxy']);
      expect(dalJob.createJob).not.toHaveBeenCalled();
      chaiExpect(missCount('no_suitable')).to.equal(1);
    });

    it('rejects as NOT retryable when the only Master is permanently unpublishable and there is no Proxy', async function () {
      setRenditions({
        records: [makeRendition('asset-master-mxf', 'Master', 2000, { contentType: 'video/mxf' })],
        count: 1
      });

      let err;
      try {
        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });
      } catch (e) {
        err = e;
      }
      chaiExpect(err.name).to.equal('resource_conflict');
      chaiExpect(err.message).to.contain('Master or Proxy');
      chaiExpect(err.data.retryable).to.equal(false);
      chaiExpect(err.data.reasons).to.deep.equal(['non_publishable_container']);
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    it('rejects as retryable when the Master row exists but its file has not landed (empty uri)', async function () {
      setRenditions({
        records: [
          makeRendition('asset-preview', 'Preview'),
          makeRendition('asset-master-pending', 'Master', 2000, { uri: '' })
        ],
        count: 2
      });

      let err;
      try {
        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });
      } catch (e) {
        err = e;
      }
      chaiExpect(err.name).to.equal('resource_conflict');
      chaiExpect(err.data.retryable).to.equal(true);
      chaiExpect(err.data.reasons).to.deep.equal(['empty_uri']);
      expect(dalJob.createJob).not.toHaveBeenCalled();
    });

    describe('explainNoPublishRendition (pure)', function () {
      const { explainNoPublishRendition } = require('./distributeAsset.js');

      it('reports every distinct reason and stays retryable while any Master/Proxy file is pending', function () {
        const why = explainNoPublishRendition(
          [
            makeRendition('m1', 'Master', 3000, { uri: '' }),
            makeRendition('m2', 'Master', 2000, { contentType: 'application/mxf' }),
            makeRendition('p', 'Proxy', 1000, { metadata: { details: { dmh: { Purpose: 'Proxy', FileSize: 50e9 } } } })
          ],
          { maxFileSizeBytes: 1e9 }
        );
        chaiExpect(why.retryable).to.equal(true);
        chaiExpect(why.reasons).to.have.members(['empty_uri', 'non_publishable_container', 'over_size_ceiling']);
      });

      it('treats an unknown Master size as retryable (the size probe may still record it)', function () {
        const why = explainNoPublishRendition(
          [makeRendition('m', 'Master', 2000, { metadata: { size: 0, details: { dmh: { Purpose: 'Master' } } } })],
          { maxFileSizeBytes: 1e9 }
        );
        chaiExpect(why).to.deep.equal({ retryable: true, reasons: ['unknown_size'] });
      });

      it('is not retryable when every Master/Proxy has a file but is unpublishable', function () {
        const why = explainNoPublishRendition(
          [makeRendition('m', 'Master', 2000, { contentType: 'video/x-mxf' }), makeRendition('p', 'Proxy', 1000, { contentType: 'video/mxf' })],
          {}
        );
        chaiExpect(why).to.deep.equal({ retryable: false, reasons: ['non_publishable_container'] });
      });
    });

    it('caps and truncates the Purpose values echoed in the rejection (customer-writable metadata)', async function () {
      const records = [];
      for (let i = 0; i < 15; i++) {
        records.push(makeRendition(`asset-${i}`, `WeirdPurpose-${i}-${'x'.repeat(60)}`));
      }
      setRenditions({ records, count: records.length });

      let err;
      try {
        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });
      } catch (e) {
        err = e;
      }
      chaiExpect(err.data.purposesFound).to.have.length(10);
      chaiExpect(err.data.distinctPurposes).to.equal(15);
      err.data.purposesFound.forEach((p) => chaiExpect(p.length).to.be.at.most(40));
    });

    it('skips a Master over the configured size ceiling and selects the Proxy instead', async function () {
      // config.social.maxPublishRenditionFileSizeBytes is declared in config/config.js (default 4 GiB,
      // remote-config tunable); the test config has no `social` block, so set it explicitly here.
      serviceContext.config.social = { maxPublishRenditionFileSizeBytes: 1e9 };
      bll = require('./distributeAsset.js')(serviceContext);
      try {
        setRenditions({
          records: [
            makeRendition('asset-master-huge', 'Master', 2000, {
              metadata: { details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } }
            }),
            makeRendition('asset-proxy', 'Proxy', 1000)
          ],
          count: 2
        });

        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });

        const task = dalJob.createJob.mock.calls[0][1].input.tasks[0];
        chaiExpect(task.payload.assetId).to.equal('asset-proxy');
      } finally {
        serviceContext.config.social = undefined;
      }
    });

    // A remote-config typo must not silently disarm the only ProRes guard: Number('four gigs') || 0 would
    // have disabled the ceiling; instead the default (4 GiB) applies and the 50 GB Master is skipped.
    it('falls back to the default ceiling (guard stays ON) when the configured ceiling is unusable', async function () {
      serviceContext.config.social = { maxPublishRenditionFileSizeBytes: 'four gigs' };
      bll = require('./distributeAsset.js')(serviceContext);
      try {
        setRenditions({
          records: [
            makeRendition('asset-master-huge', 'Master', 2000, {
              metadata: { details: { dmh: { Purpose: 'Master', FileSize: 50e9 } } }
            }),
            makeRendition('asset-proxy', 'Proxy', 1000)
          ],
          count: 2
        });

        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });

        chaiExpect(dalJob.createJob.mock.calls[0][1].input.sourceAssetId).to.equal('asset-proxy');
      } finally {
        serviceContext.config.social = undefined;
      }
    });

    // Rollout lever (config social.rejectWhenNoPublishRendition=false): pre-VE-26886 behaviour, still counted.
    it('falls through to the primary media asset (no assetId) when the reject is disabled by config, and counts it', async function () {
      serviceContext.config.social = { rejectWhenNoPublishRendition: false };
      bll = require('./distributeAsset.js')(serviceContext);
      try {
        setRenditions({
          records: [makeRendition('asset-preview-1', 'Preview'), makeRendition('asset-preview-2', 'Preview')],
          count: 2
        });

        await bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        });

        const ji = dalJob.createJob.mock.calls[0][1].input;
        chaiExpect(ji).to.not.have.property('sourceAssetId');
        chaiExpect(ji.tasks[0].payload).to.not.have.property('assetId');
        chaiExpect(missCount('no_suitable')).to.equal(1);
      } finally {
        serviceContext.config.social = undefined;
      }
    });

    // The only tolerated lookup failure is a missing recording_asset partition (42P01): getAssets already
    // tried to create it, so the TDO predates the asset store and by construction has no renditions. That
    // must not turn a working publish into a 500; it is counted so the rate is visible.
    it('creates the Job without assetId/sourceAssetId when the partition is missing (pg 42P01), and counts it', async function () {
      const pgErr = new Error('relation "recording.recording_asset_2015_01_05" does not exist');
      pgErr.code = '42P01';
      setRenditionsError(pgErr);

      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      const ji = dalJob.createJob.mock.calls[0][1].input;
      chaiExpect(ji.tasks[0].payload).to.not.have.property('assetId');
      chaiExpect(ji).to.not.have.property('sourceAssetId');
      chaiExpect(missCount('lookup_error')).to.equal(1);
    });

    it('also recognises the DAL-wrapped form of 42P01 (data.internalData.code)', async function () {
      const wrapped = new Error('sql error');
      wrapped.data = { internalData: { code: '42P01' } };
      setRenditionsError(wrapped);

      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      chaiExpect(missCount('lookup_error')).to.equal(1);
    });

    // Any other asset-store failure must FAIL the publish. Falling through would omit assetId and the
    // engine would publish the primary media asset — the Preview — on a transient DB error, which is the
    // exact outcome VE-26886 exists to prevent (module header: a wrong public post is not recoverable).
    it('rethrows a non-partition lookup error and creates no Job (never degrades to the Preview)', async function () {
      const transient = new Error('Connection terminated unexpectedly');
      transient.code = '08006';
      setRenditionsError(transient);

      await expect(
        bll.distributeAsset(context, {
          input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
        })
      ).rejects.toThrow('Connection terminated unexpectedly');
      expect(dalJob.createJob).not.toHaveBeenCalled();
      chaiExpect(missCount('lookup_error')).to.equal(0);
    });

    // Magic ("vt-…") ids explicitly resolve in getTDO but would NaN out getAssets' recording_id::bigint
    // filter — the rendition fetch must use the resolved numeric id from the returned TDO.
    it('queries renditions by the resolved TDO id, not the raw (possibly magic) input id', async function () {
      dalTdo.getTDO.mockResolvedValue({ id: '424242', applicationId: 'app-1' });

      await bll.distributeAsset(context, {
        input: { tdoIds: ['vt-bWFnaWMtaWQ'], destinationId: 'dest-1', platformPayload: {} }
      });

      const assetArgs = renditionCalls()[0][1];
      chaiExpect(assetArgs.containerId).to.deep.equal(['424242']);
    });

    it('omits assetId and sourceAssetId when the TDO has no dmh-renditions (legacy non-DMH path), and counts it', async function () {
      // default dalAsset mock returns no records
      await bll.distributeAsset(context, {
        input: { tdoIds: ['tdo-1'], destinationId: 'dest-1', platformPayload: {} }
      });

      expect(dalJob.createJob).toHaveBeenCalledTimes(1);
      const ji = dalJob.createJob.mock.calls[0][1].input;
      chaiExpect(ji.tasks[0].payload).to.not.have.property('assetId');
      chaiExpect(ji).to.not.have.property('sourceAssetId');
      chaiExpect(missCount('no_renditions')).to.equal(1);
    });
  });
});
