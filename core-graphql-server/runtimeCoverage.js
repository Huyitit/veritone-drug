const _ = require('lodash');

module.exports = function (app, config) {
  const coverageReportEnabled = config.LOCAL_TEST_COVERAGE_ENABLED === true;

  function init() {
    process.on('exit', writeCoverage);
    process.on('SIGTERM', writeCoverage);
    process.on('SIGQUIT', writeCoverage);

    addRoute();
  }

  function addRoute() {
    // USED FOR TESTING ONLY
    // enable coverage report endpoints
    app.get('/dump_coverage', (request, response, next) => {
      let status, d;
      try {
        //writeCoverage();
        response.status(200).send(global.__coverage__);
      } catch (err) {
        response.status(500).send({ error: err.stack });
      }
    });
  }

  function writeCoverage() {
    if (!_.has(global, '__coverage__')) {
      console.log(' COVERAGE NOT ENABLED! ');
      return;
    }

    try {
      require('fs').writeFileSync(
        '.nyc_output/out.json',
        new Buffer(JSON.stringify(global.__coverage__))
      );
    } catch (err) {
      console.log('COVERAGE REPORT ERROR!');
      console.log(err);
    }
  }

  if (coverageReportEnabled) {
    init();
  }

  return {
    init,
    writeCoverage
  };
};
