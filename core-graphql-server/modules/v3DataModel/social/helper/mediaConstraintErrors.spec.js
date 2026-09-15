const chaiExpect = require('chai').expect;
const mediaConstraintErrors = require('./mediaConstraintErrors.js');
const { durationRejection, I18N_KEYS, CONSTRAINT_DURATION } = mediaConstraintErrors;

// VE-26450 — the key strings and param NAMES are a published contract: VE-26202 renders them and VE-26583
// inherits the shape, so renaming one silently breaks a client's copy. These tests are what make that a contract
// rather than a convention.
describe('mediaConstraintErrors.js (VE-26450)', function () {
  const base = {
    platform: 'instagram',
    destinationId: 'dest-1',
    tdoId: 'tdo-1'
  };

  it('returns the DURATION_MAX key and the full param set for an over-limit asset', function () {
    const { data } = durationRejection('DURATION_MAX', {
      ...base,
      limitMs: 900000,
      actualMs: 3197060
    });

    chaiExpect(data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MAX');
    chaiExpect(data.i18nParams).to.deep.equal({
      platform: 'instagram',
      limitSeconds: 900,
      // Ceiled away from the limit: 3197.06s reports as 3198, so it can never equal a floored limit.
      actualSeconds: 3198,
      limitMs: 900000,
      actualMs: 3197060
    });
  });

  it('returns the DURATION_MIN key for an under-limit asset', function () {
    const { data } = durationRejection('DURATION_MIN', {
      ...base,
      limitMs: 3000,
      actualMs: 1500
    });

    chaiExpect(data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MIN');
    // MIN violation: ceil the limit, floor the actual — again away from the permitted range.
    chaiExpect(data.i18nParams.limitSeconds).to.equal(3);
    chaiExpect(data.i18nParams.actualSeconds).to.equal(1);
  });

  it('never renders the limit and the actual as the same number at the boundary', function () {
    // Rounding to-nearest rendered "up to 900 seconds; this asset is 900 seconds" — copy contradicting itself.
    const { data, message } = durationRejection('DURATION_MAX', {
      ...base,
      limitMs: 900000,
      actualMs: 900001
    });

    chaiExpect(data.i18nParams.limitSeconds).to.equal(900);
    chaiExpect(data.i18nParams.actualSeconds).to.equal(901);
    chaiExpect(data.i18nParams.actualSeconds).to.be.greaterThan(data.i18nParams.limitSeconds);
    chaiExpect(message).to.not.contain('900 seconds; this asset is 900 seconds');
    // ms is still carried so a client can reproduce the verdict exactly.
    chaiExpect(data.i18nParams.actualMs).to.be.greaterThan(data.i18nParams.limitMs);
  });

  it('does the same at the minimum boundary', function () {
    const { data } = durationRejection('DURATION_MIN', {
      ...base,
      limitMs: 3000,
      actualMs: 2999
    });

    chaiExpect(data.i18nParams.limitSeconds).to.equal(3);
    chaiExpect(data.i18nParams.actualSeconds).to.equal(2);
  });

  it('tags the constraint class, sharing vocabulary with VE-26584 INVALID_MEDIA', function () {
    const { data } = durationRejection('DURATION_MAX', {
      ...base,
      limitMs: 900000,
      actualMs: 3197060
    });

    chaiExpect(data.constraint).to.equal(CONSTRAINT_DURATION);
    chaiExpect(data.constraint).to.equal('duration');
  });

  it('carries the destination and TDO ids for correlation', function () {
    const { data } = durationRejection('DURATION_MAX', {
      ...base,
      limitMs: 900000,
      actualMs: 3197060
    });

    chaiExpect(data.destinationId).to.equal('dest-1');
    chaiExpect(data.tdoId).to.equal('tdo-1');
  });

  it('keeps a readable English message for API callers holding no i18n bundle', function () {
    const { message } = durationRejection('DURATION_MAX', {
      ...base,
      limitMs: 900000,
      actualMs: 3197060
    });

    // Matches the acceptance criterion's worked example: names the constraint AND the actual value.
    chaiExpect(message).to.equal(
      'Instagram accepts videos up to 900 seconds; this asset is 3198 seconds.'
    );
  });

  it('degrades gracefully when the platform key is missing', function () {
    const { message, data } = durationRejection('DURATION_MIN', {
      platform: null,
      limitMs: 3000,
      actualMs: 1000,
      destinationId: 'dest-1',
      tdoId: 'tdo-1'
    });

    chaiExpect(message).to.contain('This destination');
    chaiExpect(data.i18nParams.platform).to.equal(null);
  });

  it('exposes both keys under the DISTRIBUTE.ERROR namespace used by the DMH toast', function () {
    Object.values(I18N_KEYS).forEach(function (key) {
      chaiExpect(key).to.match(/^DISTRIBUTE\.ERROR\./);
    });
  });

  // VE-26450 — the bridge from a validator failure to the published copy contract. The keys and i18nParams names
  // are what VE-26202 renders, so this is where a rename would be caught.
  describe('rejectionFromValidationError', function () {
    function ajvError(instancePath, keyword, params) {
      return { instancePath, keyword, params, message: `must be ${keyword} ${params.limit}` };
    }

    it('maps a durationMs maximum onto the published DURATION_MAX contract', function () {
      const rejection = mediaConstraintErrors.rejectionFromValidationError(
        ajvError('/durationMs', 'maximum', { limit: 900000 }),
        { facts: { durationMs: 3197060 }, platform: 'instagram', destinationId: 'dest-1', tdoId: 'tdo-1' }
      );

      chaiExpect(rejection.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MAX');
      chaiExpect(rejection.data.i18nParams.limitMs).to.equal(900000);
      chaiExpect(rejection.data.i18nParams.actualMs).to.equal(3197060);
      chaiExpect(rejection.data.i18nParams.limitSeconds).to.equal(900);
      chaiExpect(rejection.data.i18nParams.actualSeconds).to.equal(3198);
      chaiExpect(rejection.data.constraint).to.equal('duration');
      chaiExpect(rejection.data.tdoId).to.equal('tdo-1');
    });

    it('maps a durationMs minimum onto DURATION_MIN', function () {
      const rejection = mediaConstraintErrors.rejectionFromValidationError(
        ajvError('/durationMs', 'minimum', { limit: 3000 }),
        { facts: { durationMs: 1200 }, platform: 'instagram', destinationId: 'dest-1', tdoId: 'tdo-1' }
      );

      chaiExpect(rejection.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MIN');
      chaiExpect(rejection.data.i18nParams.limitMs).to.equal(3000);
      chaiExpect(rejection.data.i18nParams.actualMs).to.equal(1200);
    });

    it('produces the SAME payload the direct duration helper does', function () {
      // Two ways into the same copy would drift; the ajv path must delegate rather than rebuild it.
      const viaAjv = mediaConstraintErrors.rejectionFromValidationError(
        ajvError('/durationMs', 'maximum', { limit: 900000 }),
        { facts: { durationMs: 3197060 }, platform: 'instagram', destinationId: 'd', tdoId: 't' }
      );
      const direct = mediaConstraintErrors.durationRejection('DURATION_MAX', {
        platform: 'instagram',
        limitMs: 900000,
        actualMs: 3197060,
        destinationId: 'd',
        tdoId: 't'
      });

      chaiExpect(viaAjv).to.deep.equal(direct);
    });

    it('still rejects a violated limit that has no copy of its own', function () {
      // Fail-open covers uncertainty about the MEASUREMENT. Here the value was measured and it broke a declared
      // limit, so the only thing missing is the wording — allowing the publish would be the wrong read.
      const rejection = mediaConstraintErrors.rejectionFromValidationError(
        { instancePath: '/aspectRatio', keyword: 'enum', params: { allowedValues: [0.5625, 1.7778] } },
        { facts: { aspectRatio: 1 }, platform: 'tiktok', destinationId: 'dest-1', tdoId: 'tdo-1' }
      );

      chaiExpect(rejection.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_CONSTRAINT');
      chaiExpect(rejection.data.i18nParams.property).to.equal('aspectRatio');
      chaiExpect(rejection.data.i18nParams.actual).to.equal(1);
      chaiExpect(rejection.data.i18nParams.allowedValues).to.deep.equal([0.5625, 1.7778]);
      chaiExpect(rejection.data.constraint).to.equal('aspect_ratio');
    });
  });

  describe('constraintLabelFor', function () {
    it('labels a duration failure so the rejection counter reads per constraint kind', function () {
      chaiExpect(
        mediaConstraintErrors.constraintLabelFor({ instancePath: '/durationMs', keyword: 'maximum' })
      ).to.equal('duration');
    });

    it('falls back to the property name for a kind with no label yet', function () {
      chaiExpect(
        mediaConstraintErrors.constraintLabelFor({ instancePath: '/bitrateKbps', keyword: 'maximum' })
      ).to.equal('bitrateKbps');
    });
  });
});
