const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('./test/mockUtil.js')();
const mainUtil = require('./util.js')();
// get mock base service context
const serviceContext = require('./test/serviceContext.mock.js')();

let fatalErrors;

// mock process.exit to avoid killing test process
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
serviceContext.config.server.fatalErrorIdentifiers = {
  test_error: 'test_error'
};
serviceContext.config.server.fatalErrorCheckWindowSeconds = 1;
serviceContext.config.server.maxFatalErrorCount = 3;
serviceContext.config.server.crashOnTooManyFatalError = true;
serviceContext.config.server.timeBeforeExitOnCrashSec = 2;

let serverStatus = 0;
let serverShutdownWaitMs = 1000;

describe('#fatalErrors', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    serverStatus = 0;
    fatalErrors = require('./fatalErrors.js')(serviceContext);
    fatalErrors.init({
      close: (cb) => {
        serverStatus = 1; // shutting down
        setTimeout(() => {
          cb();
          serverStatus = 2; // shut down
        }, serverShutdownWaitMs);
      }
    });
  });

  describe('#require', function () {
    it('should load module', function () {
      expect(typeof fatalErrors).toBe('object');
      expect(Object.keys(fatalErrors).length).toBe(2);
      expect(typeof fatalErrors.init).toBe('function');
      expect(typeof fatalErrors.init).toBe('function');
    });
  });

  describe('#checkError - no crash', function () {
    it('should not trigger on non-fatal error', function () {
      expect(fatalErrors.checkError(new Error('not fatal'))).toBe(0);
    });
    it('should trigger but not crash on fatal error', function () {
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
    });
    it('should reset counter on interval', async function () {
      // increment twice
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      // wait 1 s
      jest.advanceTimersByTime(1000);

      // these should not trigger crash
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
    });
  });
  describe('#checkError - crash, clean shutdown', function () {
    it('should crash with clean shutdown', async function () {
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(2);
      expect(serverStatus).toBe(1); // shutdown initiated
      expect(serviceContext.messageUtil._counter()).toBe(2);
      jest.advanceTimersByTime(1000);

      expect(serviceContext.messageUtil._counter()).toBe(3);
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(serverStatus).toBe(2); // shutdown finished
    });
  });
  describe('#checkError - crash, hard shutdown', function () {
    it('should crash with hard shutdown', async function () {
      serverShutdownWaitMs = 4000;
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(1);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(2);
      expect(serverStatus).toBe(1); // shutdown initiated
      expect(serviceContext.messageUtil._counter()).toBe(2);
      jest.advanceTimersByTime(2200);

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(serverStatus).toBe(1); // shutdown never finished
      expect(serviceContext.messageUtil._counter()).toBe(4);
    });
  });
  describe('#checkError - no crash', function () {
    it('should be able to disable feature', async function () {
      serviceContext.config.server.crashOnTooManyFatalError = false;
      fatalErrors = require('./fatalErrors.js')(serviceContext);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
      expect(fatalErrors.checkError(new Error('test_error'))).toBe(0);
    });
  });
});
