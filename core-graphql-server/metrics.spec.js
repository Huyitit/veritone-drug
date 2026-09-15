const chaiExpect = require('chai').expect;

const createMetrics = require('./metrics.js');

// A prometheus-like counter/gauge with jest.fn() collaborators + a configurable get().values.
function fakeCounter(values) {
  return {
    inc: jest.fn(),
    dec: jest.fn(),
    set: jest.fn(),
    reset: jest.fn(),
    observe: jest.fn(),
    get: jest.fn(() => ({ values: values || [] }))
  };
}

function makeMetrics(metricsCounters) {
  return createMetrics({ metricsCounters });
}

describe('metrics.js', function () {
  describe('module shape', function () {
    it('exposes the documented prometheus helper functions', function () {
      const m = makeMetrics({});
      [
        'getValue',
        'incrementCounter',
        'resetCounter',
        'incrementGauge',
        'decrementGauge',
        'resetGauge',
        'observeHistogram'
      ].forEach((fn) => chaiExpect(typeof m[fn]).to.equal('function'));
    });
  });

  describe('check() guard (drops/renames a documented metric)', function () {
    it('throws "unknown prometheus metric" when the metric is not registered', function () {
      const m = makeMetrics({ graphql_operations_total: fakeCounter() });
      chaiExpect(function () {
        m.incrementCounter('errors_total', { type: 'query' });
      }).to.throw('unknown prometheus metric errors_total');
    });
  });

  describe('delegation to the prometheus object', function () {
    it('incrementCounter calls counter.inc(labels)', function () {
      const c = fakeCounter();
      const m = makeMetrics({ graphql_operations_total: c });
      m.incrementCounter('graphql_operations_total', { type: 'query' });
      chaiExpect(c.inc.mock.calls.length).to.equal(1);
      chaiExpect(c.inc.mock.calls[0][0]).to.deep.equal({ type: 'query' });
    });

    it('observeHistogram calls histogram.observe(labels, value)', function () {
      const h = fakeCounter();
      const m = makeMetrics({ request_duration: h });
      m.observeHistogram('request_duration', 1.5, { route: '/graphql' });
      chaiExpect(h.observe.mock.calls.length).to.equal(1);
      chaiExpect(h.observe.mock.calls[0]).to.deep.equal([
        { route: '/graphql' },
        1.5
      ]);
    });

    it('resetGauge sets the gauge to the given value (default 0)', function () {
      const g = fakeCounter();
      const m = makeMetrics({ active_connections: g });
      m.resetGauge('active_connections');
      chaiExpect(g.set.mock.calls[0][0]).to.equal(0);
    });
  });

  describe('getValue aggregation', function () {
    it('sums all values when no label filter is given', function () {
      const c = fakeCounter([
        { value: 15, labels: { type: 'mutation' } },
        { value: 373, labels: { type: 'field' } },
        { value: 22, labels: { type: 'query' } }
      ]);
      const m = makeMetrics({ graphql_operations_total: c });
      chaiExpect(m.getValue('graphql_operations_total')).to.equal(410);
    });

    it('returns the matching value for a labelName + labelValue', function () {
      const c = fakeCounter([
        { value: 15, labels: { type: 'mutation' } },
        { value: 22, labels: { type: 'query' } }
      ]);
      const m = makeMetrics({ graphql_operations_total: c });
      chaiExpect(
        m.getValue('graphql_operations_total', 'type', 'query')
      ).to.equal(22);
    });
  });
});
