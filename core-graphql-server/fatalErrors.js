const _ = require('lodash');
const moment = require('moment');

// see VTN-10784
module.exports = function createFunction(serviceContext) {
  const app = serviceContext.app;
  const messageUtil = serviceContext.messageUtil;
  const metrics = serviceContext.metrics;

  const fatalErrorIdentifiers = _.get(
    serviceContext,
    'config.server.fatalErrorIdentifiers',
    {
      // 9/24/2018 observed in prod during PMI test run.
      // cause unclear. did not affect all requests.
      // probably similar ot the EROFS error below.
      'Unknown system error -117': 'disk_failure',
      "UNKNOWN: unknown error, open '/tmp/": 'disk_failure',
      'ENOSPC: no space left on device': 'disk_failure',

      // 9/16/2018, observed in prod on ec2 instances
      // hardware failure caused aws to mark disk as r/o?
      // affects asset upload via S3 API and core-server-base putAsset.
      "EROFS: read-only file system, open '/tmp/": 'disk_failure',

      // thrown by ts-messaging when it loses connection to nsq.
      // rare but observed in prod 9/22/2018 during PMI test run.
      //'Producer is no longer connected': 'nsq_connect_failure',

      // observed on multiple containers 3/7/2019, correlated to error spike
      // and several containers being killed due to timeout on response to
      // health check.
      //'all producers are disconnected': 'nsq_connect_failure',

      // 11/13/2018, observed in prod on a single ec2 instance.
      // several containers consistently logged this error and failed
      // asset upload and URL signing requests.
      'Missing credentials in config': 'aws_credential_failure',
      'Could not load credentials from any providers': 'aws_credential_failure'
    }
  );

  let server;
  const errorCounts = {};

  const errorWindowSec = _.get(
    app,
    'config.server.fatalErrorCheckWindowSeconds',
    60
  );
  const maxFatalErrorCount = _.get(app, 'config.server.maxFatalErrorCount', 5);
  const enableCrashOnFatalError = _.get(
    app,
    'config.server.crashOnTooManyFatalError',
    true
  );
  const timeBeforeExitSec = _.get(
    app,
    'config.server.timeBeforeExitOnCrashSec',
    30
  );

  function clearErrorCount() {
    Object.keys(errorCounts).forEach((key) => (errorCounts[key] = 0));
  }

  function init(_server) {
    server = _server;

    // set up timer to clear error counts periodically
    if (enableCrashOnFatalError) {
      setInterval(clearErrorCount, errorWindowSec * 1000);
      serviceContext.logger.info(
        `SERVER shutdown on too many fatal errors is enabled. This does NOT mean the server is shutting down now. maxFatalErrorCount:  ${maxFatalErrorCount}, errorWindowSec:  ${errorWindowSec}, fatalErrorIdentifiers: ${JSON.stringify(
          fatalErrorIdentifiers
        )}`
      );
    }
  }

  function checkError(error) {
    let res = 0; // 0 is not fatal error. return value used for unit test only.

    const errorStrings = Object.keys(fatalErrorIdentifiers);
    for (let i = 0; enableCrashOnFatalError && i < errorStrings.length; i++) {
      const str = errorStrings[i];
      const dstr = _.get(error, 'data.internalData.message', '');
      const sstr = _.get(error, 'data.internalData.originalStack', '');

      // check if the error matches one of our tags
      if (
        (error.stack && error.stack.includes(str)) ||
        (error.message && error.message.includes(str)) ||
        dstr.includes(str) ||
        sstr.includes(str)
      ) {
        // if it does, increment our count.
        // note that count is zeroed out periodically.
        const ct = errorCounts[str] || 0;
        errorCounts[str] = ct + 1;

        // increment prometheus counter
        const symName = fatalErrorIdentifiers[str];
        metrics.incrementCounter('fatalError', { errorIdentifier: symName });

        // set flag on error so that isFatal is logged
        error.isFatal = true;
        error.fatalErrorIdentifer = symName;
        error.fatalErrorText = str;

        res = 1; // 1 is fatal error

        // if incidence exceeds the count allowed, crash now.
        if (errorCounts[str] > maxFatalErrorCount) {
          res = 2; // 2 is fatal error that triggers shutdown

          // emit the event here because we won't make it to the
          // log in main error handler.
          messageUtil.emitErrorEvent(error);

          // initiate shutdown if we haven't already
          if (!serviceContext.monitoring.isShutdownInProgress()) {
            serviceContext.monitoring.setShutdownInProgress(true);

            // emit event to logs
            messageUtil.emitCrashEvent(
              `TOO MANY FATAL ERRORS:  the incidence of the fatal error ${symName} "${str}" within the past ${errorWindowSec} seconds has exceeded the maximum allowed, ${maxFatalErrorCount}. This server will exit to force recovery. Shutting down server... Process will exit in ${timeBeforeExitSec} seconds.`
            );

            // TODO this code is similar to the SIGTERM handling
            // code in server.js and can be factored into a common module.

            // boom
            // first attempt to shut down the server gracefully
            server.close(() => {
              messageUtil.emitEvent({
                message:
                  'Server shut down gracefully with no requests in progress.',
                errorType: symName,
                errorMessage: str,
                numFatalErrors: errorCounts[str],
                numFatalErrorsAllowed: maxFatalErrorCount,
                timeWindowSec: errorWindowSec
              });
              process.exit(1);
            });
            // give it time to finish processing requests, then exit process
            setTimeout(() => {
              const numR = metrics.getValue('concurrentRequests');
              messageUtil.emitEvent({
                message:
                  'Server could not shut down cleanly in time. Process is exiting NOW with ' +
                  numR +
                  ' requests in progress.',
                requestsInProcess: numR,
                errorType: symName,
                errorMessage: str,
                numFatalErrors: errorCounts[str],
                numFatalErrorsAllowed: maxFatalErrorCount,
                timeWindowSec: errorWindowSec
              });
              process.exit(1);
            }, timeBeforeExitSec * 1000);
          }
        }
      }
    }
    return res;
  }

  return {
    init,
    checkError
  };
};
