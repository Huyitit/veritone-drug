const chaiExpect = require('chai').expect;
const mockUtil = require('../test/mockUtil.js')();
const _ = require('lodash');

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});

let context, resolver;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config
  };
  resolver = require('./Task.js')(serviceContext);
});

describe('Task.js', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      const query = require('./Task.js')(serviceContext);
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(26);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#failureMessage', () => {
    let taskObj;

    beforeEach(() => {
      taskObj = {
        status: 'failed',
        taskOutput: {
          failureReason: 'test_failure_reason',
          failureMessage: 'test failure message'
        }
      };
    });

    // The unserializable reason code is replaced; the engine's message is kept because it is the
    // only account of what went wrong.
    it(`should keep the reported message if failureReason doesn't match with any of taskFailureEnum values`, () => {
      const res = resolver.failureMessage(taskObj);
      chaiExpect(res).to.be.equal('test failure message');
    });

    it(`should return default failureMessage if an unmatched failureReason carries no message`, () => {
      const res = resolver.failureMessage({
        status: 'failed',
        taskOutput: { failureReason: 'test_failure_reason' }
      });
      chaiExpect(res).to.be.equal(
        `The failureReason doesn't match with any of taskFailureEnum values.`
      );
    });

    it('should return the personalized failureMessage if failureReason matches with any of taskFailureEnum values', () => {
      _.set(taskObj, 'taskOutput.failureReason', 'api_not_allowed');
      const res = resolver.failureMessage(taskObj);
      chaiExpect(res).to.be.equal('test failure message');
    });

    it('should return a default failureMessage if failureReason matches with any of taskFailureEnum values', () => {
      taskObj = {
        status: 'failed',
        taskOutput: {
          failureReason: 'api_not_allowed'
        }
      };
      const res = resolver.failureMessage(taskObj);
      chaiExpect(res).to.be.equal(
        'The engine received an authorization error from the Veritone API.'
      );
    });

    // A task with no stored failure info has no failure message, even when it really did fail.
    describe('when a failed task has no stored failureReason', () => {
      const noFailureInfo = {
        'no taskOutput key at all': {},
        'taskOutput is null': { taskOutput: null },
        'taskOutput without failure fields': {
          taskOutput: { startedDateTime: '2026-08-05T07:37:49Z' }
        },
        'taskOutput holding real engine output': {
          taskOutput: { url: 'https://example.com/media.mp4', read: 8552684 }
        }
      };

      Object.entries(noFailureInfo).forEach(([label, obj]) => {
        const failedTask = Object.assign({ status: 'failed' }, obj);

        it(`returns null failureMessage when ${label}`, () => {
          chaiExpect(resolver.failureMessage(failedTask)).to.be.null;
        });

        it(`returns no failureReason when ${label}`, () => {
          chaiExpect(resolver.failureReason(failedTask)).to.not.be.ok;
        });
      });
    });

    it('should keep a stored failureMessage that has no failureReason', () => {
      const res = resolver.failureMessage({
        status: 'failed',
        taskOutput: { failureMessage: 'engine died: OOM killed' }
      });
      chaiExpect(res).to.be.equal('engine died: OOM killed');
    });
  });

  // The resolvers used to read task_output without consulting status, so a previous attempt's
  // value was reported against a task that had since been requeued and was running fine.
  describe('#failureReason / #failureMessage status gating', () => {
    // Every case reuses this and varies only the status, so any null is down to the gate alone.
    const storedFailure = {
      failureReason: 'api_not_allowed',
      failureMessage: 'the previous attempt was rejected'
    };

    const suppressedStatuses = [
      // A/C 1
      'complete',
      // A/C 2 — pre-terminal / in flight
      'pending',
      'queued',
      'accepted',
      'running',
      'waiting',
      'resuming',
      'paused',
      'standby_pending',
      // terminal, but not a failure
      'cancelled'
    ];

    suppressedStatuses.forEach((status) => {
      it(`returns null failureReason and failureMessage for ${status}`, () => {
        const task = { status, taskOutput: storedFailure };
        chaiExpect(resolver.failureReason(task)).to.be.null;
        chaiExpect(resolver.failureMessage(task)).to.be.null;
      });
    });

    // The allowlist has to hold for statuses this schema has never heard of, since Core's
    // TaskStatus and the sender's enum have already drifted once. A deny-list would leak here.
    it('returns null for a status that is not in TaskStatus at all', () => {
      const task = { status: 'some_future_status', taskOutput: storedFailure };
      chaiExpect(resolver.failureReason(task)).to.be.null;
      chaiExpect(resolver.failureMessage(task)).to.be.null;
    });

    it('returns null when the task carries no status', () => {
      const task = { taskOutput: storedFailure };
      chaiExpect(resolver.failureReason(task)).to.be.null;
      chaiExpect(resolver.failureMessage(task)).to.be.null;
    });

    // Regression guard: the gate must not touch the case the fields exist for.
    it('reports a stored failure on a failed task', () => {
      const task = { status: 'failed', taskOutput: storedFailure };
      chaiExpect(resolver.failureReason(task)).to.equal('api_not_allowed');
      chaiExpect(resolver.failureMessage(task)).to.equal(
        'the previous attempt was rejected'
      );
    });

    // A/C 3. `aborted` stays in the allowlist precisely so this pair behaves differently: the
    // controller supplies a reason on some abort paths (invalid engine build cleanup) and that
    // signal must survive, while a cascade abort — which reports nothing — stays null.
    it('preserves a reason the controller supplied with an abort', () => {
      const task = { status: 'aborted', taskOutput: storedFailure };
      chaiExpect(resolver.failureReason(task)).to.equal('api_not_allowed');
      chaiExpect(resolver.failureMessage(task)).to.equal(
        'the previous attempt was rejected'
      );
    });

    it('returns null for an abort that reported no reason', () => {
      const task = { status: 'aborted', taskOutput: { warnings: [] } };
      chaiExpect(resolver.failureReason(task)).to.not.be.ok;
      chaiExpect(resolver.failureMessage(task)).to.be.null;
    });
  });

  describe('#executionLocation', function () {
    it('returns null when both taskExecutorId and taskExecutorData are absent', function () {
      const result = resolver.executionLocation({});
      chaiExpect(result).to.be.null;
    });

    it('returns object with empty id when only taskExecutorData is present', function () {
      const result = resolver.executionLocation({
        taskExecutorData: { cluster: 'us-west' }
      });
      chaiExpect(result).to.deep.equal({ id: '', data: { cluster: 'us-west' } });
    });

    it('returns object with id when taskExecutorId is present', function () {
      const result = resolver.executionLocation({ taskExecutorId: 'exec-123' });
      chaiExpect(result).to.deep.equal({ id: 'exec-123', data: undefined });
    });
  });
});
