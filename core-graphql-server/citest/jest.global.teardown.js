const cleanup = require('./helpers/cleanup/index');
module.exports = async () => {
  // VP-2581 (BE-18): close the Ayrshare mock started in jest.global.setup.js (same process), if any.
  if (global.__ayrshareMock__ && global.__ayrshareMock__.server) {
    await new Promise((resolve) => global.__ayrshareMock__.server.close(resolve));
  }
  // run teardown after CI test by default, prevent teardown when run CI test paralel on github workflow
  if (
    !process.env.CANCEL_TEAR_DOWN ||
    process.env.CANCEL_TEAR_DOWN.toLowerCase() === 'false'
  ) {
    console.log('Global teardown: Cleaning up test data...');
    // await cleanup.cleanup();
  }
};
