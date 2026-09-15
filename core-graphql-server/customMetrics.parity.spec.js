'use strict';

const fs = require('fs');
const path = require('path');
const chaiExpect = require('chai').expect;

// VE-26450 — guards a failure mode that is silent in production and invisible in CI.
//
// `metrics.js#check()` throws when a counter name is not registered, and callers that must never break a request
// guard their increments — so an unregistered or mislabelled counter degrades to a warn log and records nothing.
// customMetrics.js and test/metrics.mock.js are two hand-maintained lists, so a name in the mock but absent from
// the registry passes every test and no-ops in production.
//
// A blanket subset assertion across both lists is not meaningful: customMetrics.js spreads
// `app.promMetric.metricsCounters` from the shared server library, which the harness stubs differently, so the
// two legitimately differ by ~14 names. This spec asserts the counters application code actually increments —
// add to the list when new ones are introduced.
describe('customMetrics.js / test/metrics.mock.js parity', function () {
  // Each counter paired with the EXACT label set its call sites pass. Real prom-client throws
  // `Added label "x" is not included in initial labelset`, and the harness's counters do no label validation, so
  // a uniform label bag here would hide a mismatch.
  const APPLICATION_COUNTERS = [
    { name: 'distributeMediaConstraintEvaluated', labels: { platform: 'instagram' } },
    {
      name: 'distributeMediaConstraintRejection',
      labels: { platform: 'instagram', constraint: 'duration' }
    },
    {
      name: 'distributeMediaConstraintFallthrough',
      labels: { platform: 'instagram', reason: 'duration_unknown' }
    }
  ];

  function realCounterNames() {
    const sc = require('./test/serviceContext.mock.js')();
    return Object.keys(require('./customMetrics.js')(sc).metricsCounters || {});
  }

  function mockCounterNames() {
    const sc = require('./test/serviceContext.mock.js')();
    require('./test/metrics.mock.js')(sc);
    return Object.keys(sc.metricsCounters || {});
  }

  it('registers each application-incremented counter in BOTH registries', function () {
    const real = realCounterNames();
    const mock = mockCounterNames();

    chaiExpect(real.length, 'customMetrics registered nothing').to.be.greaterThan(0);
    chaiExpect(mock.length, 'metrics mock registered nothing').to.be.greaterThan(0);

    APPLICATION_COUNTERS.forEach(function (counter) {
      chaiExpect(
        real,
        `${counter.name} is missing from customMetrics.js — code incrementing it records nothing in production`
      ).to.include(counter.name);
      chaiExpect(
        mock,
        `${counter.name} is missing from test/metrics.mock.js — metrics.check() throws, the guard swallows it, ` +
          'and no test can observe the counter'
      ).to.include(counter.name);
    });
  });

  it('declares labelNames covering every label its call sites pass', function () {
    // Cannot be checked by incrementing: the harness mocks prom-client itself, so counters built under it have
    // no real `.inc`. Read the declarations from source instead.
    const source = fs.readFileSync(path.join(__dirname, 'customMetrics.js'), 'utf8');

    APPLICATION_COUNTERS.forEach(function (counter) {
      const at = source.indexOf(counter.name + ': new client.Counter');
      chaiExpect(at, `${counter.name} is not declared as a Counter in customMetrics.js`).to.be.greaterThan(-1);

      const block = source.slice(at, source.indexOf('}),', at));
      const match = block.match(/labelNames:\s*\[([^\]]*)\]/);
      const declared = match
        ? match[1].split(',').map((t) => t.trim().replace(/['"]/g, '')).filter(Boolean)
        : [];

      Object.keys(counter.labels).forEach(function (label) {
        chaiExpect(
          declared,
          `${counter.name} call sites pass "${label}" but labelNames is [${declared.join(', ')}] — real ` +
            'prom-client throws on an undeclared label, and the guarded increment swallows it'
        ).to.include(label);
      });
    });
  });

  it('real prom-client does reject an undeclared label (why the check above matters)', function () {
    // Against prom-client directly, so this cannot pass merely because a mock is permissive.
    const client = require('prom-client');
    const counter = new client.Counter({
      name: 've26450_parity_probe',
      help: 'probe',
      labelNames: ['platform'],
      registers: []
    });

    chaiExpect(function () {
      counter.inc({ platform: 'instagram' });
    }, 'a declared label must be accepted').to.not.throw();
    chaiExpect(function () {
      counter.inc({ platform: 'instagram', undeclared: 'x' });
    }, 'an undeclared label must throw').to.throw(/not included in initial labelset/);
  });

  it('the harness resolves those counters by name through the real metrics.js', function () {
    // Only exercises name resolution — the harness's counters accept any labels, which is why labelNames are
    // asserted from source above.
    const sc = require('./test/serviceContext.mock.js')();
    APPLICATION_COUNTERS.forEach(function (counter) {
      chaiExpect(function () {
        sc.metrics.incrementCounter(counter.name, counter.labels);
      }, `${counter.name} not resolvable via metrics.incrementCounter`).to.not.throw();
    });
  });
});
