let cleanupExecuted = false;
global.mockUtil = require('./test/mockUtil.js')();
global.serviceContextMap = {};
const path = require('path');
beforeEach(() => {
  cleanupExecuted = false;
});

afterEach(() => {
  const suiteKey = path.relative(process.cwd(), expect.getState().testPath);
  if (global.serviceContextMap[suiteKey]) {
    global.serviceContextMap[suiteKey]._clearAll();
    global.serviceContextMap[suiteKey]._clearAll();
  }
  cleanupExecuted = true;
});

afterAll(() => {
  if (!cleanupExecuted) {
    throw new Error('Cleanup was not executed after test cases');
  }
  const suiteKey = path.relative(process.cwd(), expect.getState().testPath);
  global.serviceContextMap[suiteKey] = undefined;
});
