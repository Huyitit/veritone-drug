const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('./test/mockUtil.js')();

const mainUtil = require('./util.js')();

// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();
_.set(serviceContext, 'config.server.heartbeatEnabled', true);
_.set(serviceContext, 'config.server.redisHeartbeatEnabled', true);

// turn off config refresh interval() (the refresh code is still tested)
_.set(serviceContext, 'config.rateLimit.enableConfigRefresh', false);

// disable interval functions for most tests
_.set(serviceContext, 'config.server.heartbeatEnabled', false);
_.set(serviceContext, 'config.server.redisHeartbeatEnabled', false);
_.set(serviceContext, 'config.server.runtimeStatsEnabled', false);

let monitoring;

const realDateNow = Date.now.bind(global.Date);

function reset() {
  monitoring = require('./monitoring.js')(serviceContext);
  serviceContext.messageUtil._clearCounter();
  serviceContext.metrics._clearMetrics();
  _.set(serviceContext, 'config.healthCheck', {
    runtimeStatsEnabled: false,
    failOnMemUsage: false,
    minFreeMemPercent: 5,
    maxAverageResponseTimeMs: 1000,
    minRequestsForResponseTime: 50
  });
  _.set(serviceContext, 'config.healthCheck.failOn.memUsage', false);
  _.set(serviceContext, 'config.healthCheck.failOn.responseTime', false);
  _.set(serviceContext, 'config.healthCheck.failOn.timeout', false);
  monitoring.setStartupInProgress(false);
}

describe('#monitoring', function () {
  afterEach(() => {
    global.Date.now = realDateNow;
  });
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      monitoring = require('./monitoring.js')(serviceContext);
      chaiExpect(monitoring).to.be.a('object');
      chaiExpect(Object.keys(monitoring).length).to.equal(19);
      chaiExpect(typeof monitoring.setup).to.equal('function');
      chaiExpect(typeof monitoring.isUnhealthy).to.equal('function');
      chaiExpect(typeof monitoring.getHeartbeatStats).to.equal('function');
      chaiExpect(typeof monitoring.healthCheck).to.equal('function');
      chaiExpect(typeof monitoring.setShutdownInProgress).to.equal('function');
      chaiExpect(typeof monitoring.recordRequest).to.equal('function');
      chaiExpect(typeof monitoring._clearIntervals).to.equal('function');
      chaiExpect(typeof monitoring._heartbeat).to.equal('function');
      chaiExpect(typeof monitoring._pushToRedis).to.equal('function');
      chaiExpect(typeof monitoring.isStartupInProgress).to.equal('function');
      chaiExpect(typeof monitoring.setStartupInProgress).to.equal('function');
      chaiExpect(typeof monitoring.isShutdownInProgress).to.equal('function');
      chaiExpect(typeof monitoring.getStatsSummary).to.equal('function');
      chaiExpect(typeof monitoring.RESPONSE_TIME).to.equal('number');
      chaiExpect(typeof monitoring.MEM_USAGE).to.equal('number');
      chaiExpect(typeof monitoring.SHUTDOWN_IN_PROGRESS).to.equal('number');
      chaiExpect(typeof monitoring.ADMIN_OVERRIDE).to.equal('number');
      chaiExpect(typeof monitoring.TIMEOUT).to.equal('number');

      chaiExpect(monitoring.isStartupInProgress()).to.be.true;
    });
  });

  describe('#setup', function () {
    it('should set up intervals', async function () {
      reset();
      _.set(serviceContext, 'config.server.heartbeatIntervalSec', 0.2);
      _.set(serviceContext, 'config.server.heartbeatEnabled', true);
      _.set(serviceContext, 'config.server.redisHeartbeatEnabled', true);
      _.set(serviceContext, 'config.server.redisHeartbeatIntervalSec', 0.2);
      _.set(serviceContext, 'config.healthCheck.runtimeStatsEnabled', true);
      _.set(serviceContext, 'config.healthCheck.runtimeStatsIntervalSec', 1);
      monitoring = require('./monitoring.js')(serviceContext);

      const now = Date.now();
      monitoring.setup();
      // wait for intervals to fire
      jest.advanceTimersByTime(250);
      global.Date.now = jest.fn(() => now + 250);

      // verify that 2 were set up:  heartbeat, redis report
      chaiExpect(Object.keys(monitoring._clearIntervals()).length).to.equal(2);

      // now verify that they did something
      // should have 1 message, for heartbeat.
      // we'll do more validation of heartbeat in that unit test.

      const elapsedMs = Date.now() - now;
      const expected = Math.floor(elapsedMs / 200);
      chaiExpect(serviceContext.messageUtil._counter()).to.be.above(0);
      chaiExpect(serviceContext.messageUtil._counter()).to.be.below(
        expected + 3
      );
    });
  });

  describe('#startup', function () {
    it('should set startupInProgress to false', () => {
      chaiExpect(monitoring.isUnhealthy()).to.equal(32);
      monitoring.setStartupInProgress(false);
      chaiExpect(monitoring.isUnhealthy()).equal(0);
      chaiExpect(monitoring.isStartupInProgress()).to.be.false;
    });
  });

  describe('#shutdownInProgress', function () {
    it('should set shutdown in progress', async function () {
      reset();
      chaiExpect(monitoring.isUnhealthy()).to.equal(0);
      monitoring.setShutdownInProgress(true);
      chaiExpect(monitoring.isUnhealthy()).to.equal(
        monitoring.SHUTDOWN_IN_PROGRESS
      );
    });
  });

  describe('#healthCheck', function () {
    it('should fail on admin override', async function () {
      reset();
      const start = moment().toISOString();
      let req = httpMock.createRequest({
        method: 'POST',
        url: '/?fail=1'
      });
      let res = mockUtil.getHttpResponse();
      monitoring.healthCheck(req, res, start);
      chaiExpect(res.statusCode).to.equal(403);
      req = mockUtil.getRequest(null, 'none');
      res = mockUtil.getHttpResponse();
      monitoring.healthCheck(req, res, start);
      chaiExpect(res.statusCode).to.equal(403);
      req = httpMock.createRequest({
        method: 'POST',
        url: '/?fail=0'
      });
      res = mockUtil.getHttpResponse();
      monitoring.healthCheck(req, res, start);
      chaiExpect(res.statusCode).to.equal(200);
    });

    it('should emit successful healthcheck event', async function () {
      reset();
      const req = mockUtil.getRequest(null, 'none');
      const res = mockUtil.getHttpResponse();
      const start = moment().toISOString();
      monitoring.recordRequest(5000);
      monitoring.recordRequest(150);
      monitoring.recordRequest(100);
      monitoring.recordRequest(50);
      monitoring._clearIntervals();
      monitoring.recordRequest(50);

      monitoring.healthCheck(req, res, start);
      chaiExpect(res.statusCode).to.equal(200);
      chaiExpect(res._isEndCalled()).to.be.true;
      chaiExpect(res._isJSON()).to.be.true;
      const body = res._getData();
      chaiExpect(body).to.exist;

      // validate request body
      chaiExpect(body.status).to.equal('ok');
      chaiExpect(body.serverIp).not.to.exist;
      chaiExpect(body.serverHostname).to.exist;
      chaiExpect(body.serverStartTime).to.equal(start);
      chaiExpect(body.timestamp).to.exist;
      chaiExpect(body.totalMemoryBytes).to.be.above(0);
      chaiExpect(body.freeMemoryBytes).to.be.above(0);
      chaiExpect(body.percentFreeMem).to.equal(
        Math.floor((body.freeMemoryBytes / body.totalMemoryBytes) * 100)
      );
      chaiExpect(body.minPercentFreeMem).to.equal(5);
      chaiExpect(body.lastAverageResponseTimeMs).to.equal(100);
      chaiExpect(body.maxAverageResponseTimeMs).to.equal(1000);
      chaiExpect(body.numRequests).to.equal(1);
      chaiExpect(body.lastAverageResponseCount).to.equal(4);
      chaiExpect(body.minRequestsForResponseTime).to.equal(50);

      // no message for this
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(0);
      // no metric for this
      chaiExpect(serviceContext.metrics.getValue('healthCheckFailed')).to.equal(
        0
      );
    });

    it('should emit failed healthcheck event', async function () {
      reset();
      const req = mockUtil.getRequest(null, 'none');
      const res = mockUtil.getHttpResponse();
      const start = moment().toISOString();
      monitoring.setShutdownInProgress(true);
      monitoring.recordRequest(5000);
      monitoring.recordRequest(150);
      monitoring.recordRequest(100);
      monitoring.recordRequest(50);
      monitoring._clearIntervals();
      monitoring.recordRequest(50);
      monitoring.healthCheck(req, res, start);
      chaiExpect(res.statusCode).to.equal(403);
      chaiExpect(res._isEndCalled()).to.be.true;
      chaiExpect(res._isJSON()).to.be.true;
      const body = res._getData();
      chaiExpect(body).to.exist;

      // validate request body
      chaiExpect(body.status).to.equal('shutdown');
      chaiExpect(body.serverIp).not.to.exist;
      chaiExpect(body.serverHostname).to.exist;
      chaiExpect(body.serverStartTime).to.equal(start);
      chaiExpect(body.timestamp).to.exist;
      chaiExpect(body.totalMemoryBytes).to.be.above(0);
      chaiExpect(body.freeMemoryBytes).to.be.above(0);
      chaiExpect(body.percentFreeMem).to.equal(
        Math.floor((body.freeMemoryBytes / body.totalMemoryBytes) * 100)
      );
      chaiExpect(body.minPercentFreeMem).to.equal(5);
      chaiExpect(body.lastAverageResponseTimeMs).to.equal(100);
      chaiExpect(body.maxAverageResponseTimeMs).to.equal(1000);
      chaiExpect(body.numRequests).to.equal(1);
      chaiExpect(body.lastAverageResponseCount).to.equal(4);
      chaiExpect(body.minRequestsForResponseTime).to.equal(50);

      // should have a message for this
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
      const event = serviceContext.messageUtil._messages()[0];
      chaiExpect(event.event).to.equal('unhealthy');
      delete event.event;
      // validate event data - should match response body
      Object.keys(event).forEach((key) => {
        chaiExpect(event[key]).to.equal(body[key]);
      });

      // should have incremented a counter for this
      chaiExpect(serviceContext.metrics.getValue('healthCheckFailed')).to.equal(
        1
      );
    });
  });

  describe('#heartbeat', function () {
    it('should emit heartbeat event', async function () {
      reset();
      monitoring._heartbeat();
      chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
      chaiExpect(serviceContext.messageUtil._messages()[0].event).to.equal(
        'heartbeat'
      );
    });
  });

  describe('#getHeartbeatStats', function () {
    it('get heartbeat stats from redis mock', async function () {
      reset();
      _.set(serviceContext, 'config.server.redisHeartbeatIntervalSec', 0.2);
      _.set(serviceContext, 'config.server.redisHeartbeatEnabled', true);
      monitoring = require('./monitoring.js')(serviceContext);

      await monitoring._pushToRedis();

      let stats = await monitoring.getHeartbeatStats();

      chaiExpect(Object.keys(stats).length).to.equal(26);
      // all zero at first, except for two control keys
      Object.keys(stats).forEach((key) => {
        if (key !== 'intervalSeconds' && key !== 'lastRefresh') {
          chaiExpect(stats[key]).to.equal(0);
        }
      });

      // now increment some metrics
      serviceContext.metrics.incrementCounter('request');
      serviceContext.metrics.incrementCounter('request');
      serviceContext.metrics.incrementCounter('operation');
      serviceContext.metrics.incrementCounter('operation');
      serviceContext.metrics.incrementCounter('error');
      serviceContext.metrics.incrementCounter('internalTokenError');
      serviceContext.metrics.incrementCounter('unexpectedError');
      // push stats to "redis"
      await monitoring._pushToRedis();
      // wait for window to complete
      //await mainUtil.sleep(200);
      const now = Date.now();

      global.Date.now = jest.fn(() => now + 200);
      jest.advanceTimersByTime(200);

      // get stats and verify they were updated
      stats = await monitoring.getHeartbeatStats();
      chaiExpect(stats.graphqlRequests).to.equal(2);
      chaiExpect(stats.graphqlOperations).to.equal(2);
      chaiExpect(stats.allError).to.equal(1);
      chaiExpect(stats.internalTokenError).to.equal(1);
      chaiExpect(stats.unexpectedError).to.equal(1);

      // now wait for next window and make sure stats are cleared
      global.Date.now = jest.fn(() => now + 450);
      jest.advanceTimersByTime(250);

      stats = await monitoring.getHeartbeatStats();
      chaiExpect(stats.graphqlRequests).to.equal(0);
    });
  });

  describe.skip('#isUnhealthy', function () {
    it('should return unhealthy on low mem', function () {
      reset();
      _.set(serviceContext, 'config.healthCheck.minFreeMemPercent', 100);

      monitoring = require('./monitoring.js')(serviceContext);
      chaiExpect(monitoring.isUnhealthy()).to.equal(monitoring.MEM_USAGE);
    });

    it('should return unhealthy on poor response time', async function () {
      reset();
      _.set(serviceContext, 'config.healthCheck.runtimeStatsEnabled', true);
      _.set(serviceContext, 'config.healthCheck.runtimeStatsIntervalSec', 1);
      _.set(serviceContext, 'config.healthCheck.maxAverageResponseTimeMs', 100);
      _.set(
        serviceContext,
        'config.healthCheck.minRequestsForResponseTime',
        10
      );

      monitoring = require('./monitoring.js')(serviceContext);
      chaiExpect(monitoring.isUnhealthy()).to.equal(0);
      // bad average but below min requests threshold => healthy
      monitoring._clearIntervals();
      for (let i = 0; i < 9; i++) {
        monitoring.recordRequest(101);
      }
      // clearing intervals mimics running the
      // stats interval function that "saves" values
      // over the last window.
      monitoring._clearIntervals();

      chaiExpect(monitoring.isUnhealthy()).to.equal(0);

      // bad response time, enough requests => unhealthy

      for (let i = 0; i < 11; i++) {
        monitoring.recordRequest(101);
      }

      monitoring._clearIntervals();
      chaiExpect(monitoring.isUnhealthy()).to.equal(monitoring.RESPONSE_TIME);

      // good average  => healthy
      monitoring._clearIntervals();
      for (let i = 0; i < 19; i++) {
        monitoring.recordRequest(90);
      }

      monitoring._clearIntervals();
      chaiExpect(monitoring.isUnhealthy()).to.equal(0);
    });
  });

  describe('#getStatsSummary', function () {
    it('should get stats', function () {
      const res = monitoring.getStatsSummary();
      chaiExpect(res).to.exist;
      chaiExpect(_.isNumber(res.timeouts)).to.be.true;
      chaiExpect(_.isNumber(res.requests)).to.be.true;
      chaiExpect(_.isNumber(res.dbTimeouts)).to.be.true;
      chaiExpect(_.isNumber(res.dbQueries)).to.be.true;
      chaiExpect(_.isNumber(res.timeouts)).to.be.true;
      chaiExpect(_.isNumber(res.percentFreeMem)).to.be.true;
      chaiExpect(_.isNumber(res.timeouts)).to.be.true;
      chaiExpect(_.isNumber(res.averageResponseTimeMs)).to.be.true;
      chaiExpect(res.shutdownInProgress).to.be.false;
    });
  });
});
