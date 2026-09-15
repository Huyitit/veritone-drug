const _ = require('lodash');
const chaiExpect = require('chai').expect;
const mockUtil = require('../../../../test/mockUtil.js')();

// VE-26450 — the pre-flight check exercised DIRECTLY, with more than one TDO.
//
// distributeAsset.spec.js already covers the single-TDO verdicts through the mutation. It cannot cover these:
// the mutation's MVP guard rejects any request naming more than one id, so the bulk shape of this module — the
// free-checks / gather / assert ordering, the bounded concurrency, and one TDO's read failure not deciding the
// others — is only reachable by calling the policy itself. That shape is what has to hold when the guard lifts,
// so it is pinned now rather than discovered then.

describe('mediaConstraintPolicy.js (VE-26450 bulk pipeline)', function () {
  const serviceContext = require('../../test/serviceContext.mock.js')();
  let context;
  let policy;
  let dalTdo;
  let dalAsset;
  let dalMediaConstraint;

  // Instagram Reels, as seeded in V3_300.
  const REELS = {
    id: 'mc-1',
    postType: 'reels',
    constraintSchema: {
      properties: { durationMs: { minimum: 3000, maximum: 900000 } }
    }
  };

  // Duration is stamped in SECONDS on the asset and compared in milliseconds.
  function tdoWithSeconds(id, seconds) {
    return { id, applicationId: 'app-1', jsondata: {}, _seconds: seconds };
  }

  function invoke(tdos, overrides) {
    return policy.assertPublishAllowed(
      context,
      Object.assign(
        {
          tdos,
          destinationTypeId: 'dt-1',
          platform: 'instagram',
          destinationId: 'dest-1'
        },
        overrides
      )
    );
  }

  beforeEach(function () {
    serviceContext._clearAll();
    context = mockUtil.makeContext();

    // Each TDO reports its own duration, so a test can put the offending asset anywhere in the list.
    dalTdo = {
      getPrimaryAsset: jest.fn().mockImplementation((ctx, tdo) =>
        Promise.resolve({ id: `asset-${tdo.id}`, metadata: { mediaDuration: tdo._seconds } })
      )
    };
    dalAsset = { getAssets: jest.fn().mockResolvedValue({ records: [] }) };
    dalMediaConstraint = { getMediaConstraints: jest.fn().mockResolvedValue([REELS]) };

    serviceContext.dal.tdo = dalTdo;
    serviceContext.dal.asset = dalAsset;
    serviceContext.dal.destinationMediaConstraint = dalMediaConstraint;

    policy = require('./mediaConstraintPolicy.js')(serviceContext);
  });

  describe('free checks run before any media read', function () {
    // The regression this guards: re-deciding enforceability per TDO instead of once, which makes a
    // no-op destination cost one primary-asset resolution per asset in the request.
    it('reads no media when the declared row constrains no duration', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        { id: 'mc-2', postType: 'video', constraintSchema: { properties: {} } }
      ]);

      await invoke([
        tdoWithSeconds('tdo-1', 10),
        tdoWithSeconds('tdo-2', 10),
        tdoWithSeconds('tdo-3', 10)
      ]);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
      expect(dalAsset.getAssets).not.toHaveBeenCalled();
    });

    it('reads no media when the destination declares nothing', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([]);

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 10)]);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
    });

    it('reads no media when several post-type rows make the applicable row ambiguous', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        REELS,
        {
          id: 'mc-3',
          postType: 'stories',
          constraintSchema: { properties: { durationMs: { minimum: 3000, maximum: 60000 } } }
        }
      ]);

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 10)]);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
    });

    // An unresolved record last in the list must not cost the measurement of everything before it. It also must
    // not block the publish: a malformed argument is this module's defect, and only a verdict may reject.
    it('abandons the check on an unresolved TDO record without measuring or blocking', async function () {
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      const tdos = [tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 10), { jsondata: {} }];

      await invoke(tdos);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
      expect(incrementCounter).toHaveBeenCalledWith(
        'distributeMediaConstraintFallthrough',
        { platform: 'instagram', reason: 'check_failed' }
      );
      incrementCounter.mockRestore();
    });
  });

  // The module claims uncertainty never blocks a publish. Every other fail-open path covers a failure someone
  // anticipated; these pin the claim against the ones nobody did.
  describe('containment — only a verdict escapes', function () {
    // Reaches the catch-all, unlike the read failure above it, which the constraint read's own guard handles.
    // A DAL that starts returning a different shape is the realistic version of "a failure nobody anticipated".
    it('allows the publish when a DAL returns a shape the check does not expect', async function () {
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalMediaConstraint.getMediaConstraints.mockResolvedValue(null);

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 10)]);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
      // One unit per TDO, so the fallthrough keeps a denominator it can be read against.
      const checkFailed = incrementCounter.mock.calls.filter(
        (c) =>
          c[0] === 'distributeMediaConstraintFallthrough' &&
          c[1].reason === 'check_failed'
      );
      chaiExpect(checkFailed).to.have.length(2);
      incrementCounter.mockRestore();
    });

    // An anticipated failure must keep reporting its own specific reason rather than being flattened into the
    // catch-all — the two say different things to whoever triages the metric.
    it('leaves an anticipated read failure reporting its own reason', async function () {
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');
      dalMediaConstraint.getMediaConstraints.mockImplementation(() => {
        throw new Error('relation does not exist');
      });

      await invoke([tdoWithSeconds('tdo-1', 10)]);

      const reasons = incrementCounter.mock.calls
        .filter((c) => c[0] === 'distributeMediaConstraintFallthrough')
        .map((c) => c[1].reason);
      chaiExpect(reasons).to.contain('constraints_unreadable');
      chaiExpect(reasons).to.not.contain('check_failed');
      incrementCounter.mockRestore();
    });

    it('still rejects a real constraint verdict', async function () {
      // The containment must not swallow the one error the check exists to produce.
      let err;
      try {
        await invoke([tdoWithSeconds('tdo-1', 3600)]);
      } catch (error) {
        err = error;
      }

      chaiExpect(err, 'expected the over-length asset to be rejected').to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(err.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MAX');
    });
  });

  describe('gather pass', function () {
    it('measures every TDO in the request, not just the first', async function () {
      const tdos = [
        tdoWithSeconds('tdo-1', 10),
        tdoWithSeconds('tdo-2', 20),
        tdoWithSeconds('tdo-3', 30)
      ];

      await invoke(tdos);

      expect(dalTdo.getPrimaryAsset).toHaveBeenCalledTimes(3);
      const measured = dalTdo.getPrimaryAsset.mock.calls.map(([, tdo]) => tdo.id);
      chaiExpect(measured.sort()).to.deep.equal(['tdo-1', 'tdo-2', 'tdo-3']);
    });

    // The point of the gather/assert split: n measurements cost about ceil(n / limit) waves, not n round trips.
    // Asserting the calls overlap is what distinguishes that from the sequential shape.
    it('runs the measurements concurrently rather than one at a time', async function () {
      let inFlight = 0;
      let peak = 0;
      dalTdo.getPrimaryAsset.mockImplementation(
        (ctx, tdo) =>
          new Promise((resolve) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            Promise.resolve().then(() => {
              inFlight--;
              resolve({ id: `asset-${tdo.id}`, metadata: { mediaDuration: tdo._seconds } });
            });
          })
      );

      const tdos = [];
      for (let i = 0; i < 8; i++) {
        tdos.push(tdoWithSeconds(`tdo-${i}`, 10));
      }
      await invoke(tdos);

      chaiExpect(peak).to.be.above(1);
    });

    // Bounded, because this mutation shares the read pool with every other in-flight request.
    it('holds the measurements to the concurrency limit', async function () {
      let inFlight = 0;
      let peak = 0;
      dalTdo.getPrimaryAsset.mockImplementation(
        (ctx, tdo) =>
          new Promise((resolve) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            Promise.resolve().then(() => {
              inFlight--;
              resolve({ id: `asset-${tdo.id}`, metadata: { mediaDuration: tdo._seconds } });
            });
          })
      );

      const tdos = [];
      for (let i = 0; i < 40; i++) {
        tdos.push(tdoWithSeconds(`tdo-${i}`, 10));
      }
      await invoke(tdos);

      chaiExpect(peak).to.be.at.most(10);
    });

    // Fail-open, per TDO. One unreadable asset must not decide the request, in either direction: it neither
    // rejects the publish nor excuses the assets that ARE measurable.
    it('keeps checking the other TDOs when one measurement throws', async function () {
      dalTdo.getPrimaryAsset.mockImplementation((ctx, tdo) => {
        if (tdo.id === 'tdo-1') {
          return Promise.reject(new Error('relation "asset_p123" does not exist'));
        }
        return Promise.resolve({
          id: `asset-${tdo.id}`,
          metadata: { mediaDuration: tdo._seconds }
        });
      });

      const tdos = [tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 3197.06)];

      await expect(invoke(tdos)).rejects.toThrow();
      expect(dalTdo.getPrimaryAsset).toHaveBeenCalledTimes(2);
    });

    it('allows the publish when the only unreadable TDO is the one that failed', async function () {
      dalTdo.getPrimaryAsset.mockRejectedValue(new Error('relation does not exist'));
      dalAsset.getAssets.mockRejectedValue(new Error('relation does not exist'));

      await expect(
        invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 20)])
      ).resolves.toBeUndefined();
    });
  });

  // The reads a rejected publish does not need are the ones worth not doing: the mutation stops at the first
  // violation regardless.
  describe('short-circuit — no reads for a request already decided', function () {
    it('stops measuring once an earlier TDO has decided the request', async function () {
      // 12 assets, window of 10: the offender is in the first window, so the second must never be read.
      const tdos = [tdoWithSeconds('tdo-0', 3600)].concat(
        _.range(1, 12).map((i) => tdoWithSeconds(`tdo-${i}`, 10))
      );

      await expect(invoke(tdos)).rejects.toThrow();

      const measured = dalTdo.getPrimaryAsset.mock.calls.map((c) => c[1].id);
      chaiExpect(measured).to.have.length(10);
      chaiExpect(measured).to.not.contain('tdo-10');
      chaiExpect(measured).to.not.contain('tdo-11');
    });

    it('still measures every TDO when none of them violates', async function () {
      const tdos = _.range(0, 12).map((i) => tdoWithSeconds(`tdo-${i}`, 10));

      await invoke(tdos);

      chaiExpect(dalTdo.getPrimaryAsset.mock.calls).to.have.length(12);
    });

    // Windowing must not let completion order pick the reported TDO: the earliest violating index wins, the
    // same one the un-windowed version named.
    it('reports the earliest violating TDO even when a later window also violates', async function () {
      const tdos = _.range(0, 12).map((i) =>
        tdoWithSeconds(`tdo-${i}`, i === 3 || i === 11 ? 3600 : 10)
      );

      let err;
      try {
        await invoke(tdos);
      } catch (error) {
        err = error;
      }

      chaiExpect(err.data.tdoId).to.equal('tdo-3');
    });
  });

  describe('assert pass', function () {
    it('rejects on an over-length asset anywhere in the list', async function () {
      const tdos = [
        tdoWithSeconds('tdo-1', 10),
        tdoWithSeconds('tdo-2', 20),
        tdoWithSeconds('tdo-3', 3197.06) // the VE-26208 asset, over the 15-minute Reels ceiling
      ];

      await expect(invoke(tdos)).rejects.toThrow();
    });

    it('names the offending TDO, not the first one in the list', async function () {
      const tdos = [tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 1)];

      let thrown;
      try {
        await invoke(tdos);
      } catch (err) {
        thrown = err;
      }
      chaiExpect(thrown).to.exist;
      chaiExpect(thrown.data.tdoId).to.equal('tdo-2');
      chaiExpect(thrown.data.i18nKey).to.equal('DISTRIBUTE.ERROR.MEDIA_DURATION_MIN');
    });

    it('allows a publish where every asset is within bounds', async function () {
      const tdos = [
        tdoWithSeconds('tdo-1', 3),
        tdoWithSeconds('tdo-2', 450),
        tdoWithSeconds('tdo-3', 900)
      ];

      await expect(invoke(tdos)).resolves.toBeUndefined();
    });
  });


  describe('declared but unmeasurable properties', function () {
    // The seed carries the vendor's documented dimension limits ahead of VE-26886. They must be inert: the
    // published asset is a downscaled preview, so checking them would reject publishes that succeed.
    it('does not enforce a dimension limit the server cannot yet measure', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        {
          id: 'mc-4',
          postType: 'reels',
          constraintSchema: {
            properties: {
              durationMs: { minimum: 3000, maximum: 900000 },
              widthPx: { minimum: 100000 }
            }
          }
        }
      ]);

      // Comfortably inside the duration bounds; the absurd width floor must not matter.
      await expect(invoke([tdoWithSeconds('tdo-1', 10)])).resolves.toBeUndefined();
    });

    it('reads no media at all when only unmeasurable properties are constrained', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        {
          id: 'mc-5',
          postType: 'reels',
          constraintSchema: { properties: { widthPx: { minimum: 320 } } }
        }
      ]);

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 20)]);

      expect(dalTdo.getPrimaryAsset).not.toHaveBeenCalled();
    });
  });

  describe('malformed declarations', function () {
    // A seed defect must not block publishes — same trade as unreadable metadata.
    it('allows the publish when the declared schema cannot be compiled', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        {
          id: 'mc-6',
          postType: 'reels',
          constraintSchema: {
            properties: { durationMs: { minimum: 3000, maximum: 'not-a-number' } }
          }
        }
      ]);

      await expect(invoke([tdoWithSeconds('tdo-1', 3197.06)])).resolves.toBeUndefined();
    });
  });

  // A check whose failure mode is being invisible has to be legible in the logs, and the log call itself must
  // not be the thing that goes quiet.
  describe('logging', function () {
    it('logs the rejection, naming the limit, the measurement and the row', async function () {
      const info = jest.spyOn(serviceContext.app.logger, 'info');

      await expect(invoke([tdoWithSeconds('tdo-1', 3600)])).rejects.toThrow();

      const entry = info.mock.calls.map((c) => c[0]).find((p) => /VE-26450/.test(p.message));
      chaiExpect(entry, 'a blocked publish must leave a trace').to.exist;
      chaiExpect(entry.tdoId).to.equal('tdo-1');
      chaiExpect(entry.constraintId).to.equal('mc-1');
      chaiExpect(entry.platform).to.equal('instagram');
      chaiExpect(entry.facts.durationMs, 'what we measured').to.equal(3600000);
      chaiExpect(entry.violation.keyword, 'which bound it broke').to.equal('maximum');
      chaiExpect(entry.violation.params.limit).to.equal(900000);
      info.mockRestore();
    });

    // The regression this guards: routing logs through a path lookup that yields undefined when the wiring
    // moves, which deletes the logging silently rather than failing.
    it('falls back to the console rather than dropping a line when no logger is wired', async function () {
      const app = serviceContext.app;
      const logger = serviceContext.logger;
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      serviceContext.app = {};
      serviceContext.logger = undefined;

      try {
        await expect(invoke([tdoWithSeconds('tdo-1', 3600)])).rejects.toThrow();
        chaiExpect(consoleLog.mock.calls.length, 'the line must land somewhere').to.be.greaterThan(0);
      } finally {
        serviceContext.app = app;
        serviceContext.logger = logger;
        consoleLog.mockRestore();
      }
    });

    it('uses serviceContext.logger when app.logger is absent', async function () {
      const app = serviceContext.app;
      const info = jest.spyOn(serviceContext.logger, 'info');
      serviceContext.app = {};

      try {
        await expect(invoke([tdoWithSeconds('tdo-1', 3600)])).rejects.toThrow();
        chaiExpect(info.mock.calls.length).to.be.greaterThan(0);
      } finally {
        serviceContext.app = app;
        info.mockRestore();
      }
    });

    it('does not let a throwing logger decide the publish', async function () {
      const warn = jest.spyOn(serviceContext.app.logger, 'warn').mockImplementation(() => {
        throw new Error('log transport down');
      });
      dalMediaConstraint.getMediaConstraints.mockImplementation(() => {
        throw new Error('relation does not exist');
      });

      // The read failure falls through; the logger blowing up while reporting it must not turn that into a block.
      await invoke([tdoWithSeconds('tdo-1', 10)]);
      warn.mockRestore();
    });
  });

  describe('metrics', function () {
    // The rejection and fallthrough rates are only readable against a per-TDO denominator, so a bulk request
    // has to count one evaluation per asset rather than one per request.
    it('counts one evaluation per TDO', async function () {
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');

      await invoke([
        tdoWithSeconds('tdo-1', 10),
        tdoWithSeconds('tdo-2', 20),
        tdoWithSeconds('tdo-3', 30)
      ]);

      const evaluated = incrementCounter.mock.calls.filter(
        ([name]) => name === 'distributeMediaConstraintEvaluated'
      );
      chaiExpect(evaluated).to.have.length(3);
      incrementCounter.mockRestore();
    });

    it('counts no evaluation when the free checks disqualify enforcement', async function () {
      dalMediaConstraint.getMediaConstraints.mockResolvedValue([
        { id: 'mc-2', postType: 'video', constraintSchema: { properties: {} } }
      ]);
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 20)]);

      expect(incrementCounter).not.toHaveBeenCalledWith(
        'distributeMediaConstraintEvaluated',
        expect.anything()
      );
      incrementCounter.mockRestore();
    });

    it('counts a fallthrough per unreadable TDO', async function () {
      dalTdo.getPrimaryAsset.mockRejectedValue(new Error('relation does not exist'));
      dalAsset.getAssets.mockRejectedValue(new Error('relation does not exist'));
      const incrementCounter = jest.spyOn(serviceContext.metrics, 'incrementCounter');

      await invoke([tdoWithSeconds('tdo-1', 10), tdoWithSeconds('tdo-2', 20)]);

      const unreadable = incrementCounter.mock.calls.filter(
        ([name, labels]) =>
          name === 'distributeMediaConstraintFallthrough' &&
          labels.reason === 'duration_unreadable'
      );
      chaiExpect(unreadable).to.have.length(2);
      incrementCounter.mockRestore();
    });
  });
});
