const ErrorCodes = require('./ErrorCodes.js');
const uuid = require('uuid');
const rpErrors = require('request-promise/errors');
const StatusCodeError = rpErrors.StatusCodeError;

/**
 * Simple error type to represent errors that are generated locally,
 * within core-graphql-server, and thus contain additional information
 * that can be used to format a better error construct in the graphql
 * result payload.
 */
function LocalError(
  errorType,
  message = null,
  data = {},
  originalError = null
) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.errorType = errorType || ErrorCodes.internal_error;
  this.data = data;
  this.message = message || this.errorType.message;
  this.errorCode = this.errorType.code;
  this.originalError = originalError;
  if (originalError) extractFromError(originalError, this);
  this.errorId = uuid.v4();
}
LocalError.prototype = Object.create(Error.prototype);
LocalError.prototype.name = 'LocalError';

function extractFromError(error, self) {
  if (error instanceof StatusCodeError) {
    const status = error.statusCode;
    switch (status) {
      case 403:
        self.errorCode = ErrorCodes.not_allowed.code;
        self.message = error.message;
        break;
      case 404:
        self.errorCode = ErrorCodes.not_found.code;
        self.message = error.message;
        break;
      case 400:
        self.errorCode = ErrorCodes.invalid_input.code;
        self.message = error.message;
        // TODO maybe wrong; this could mean a bug in core-graphql-server
        break;
      case 401:
        self.errorCode = ErrorCodes.authentication_error.code;
        self.message = ErrorCodes.authentication_error.message;
        //self.message = error.message;
        break;
      case 500:
        self.errorCode = ErrorCodes.service_failure;
        self.message = error.message;
        break;
      case 502:
      case 503:
        self.errorCode = ErrorCodes.service_unavailable.code;
        self.message = ErrorCodes.service_unavailable.message;
        break;
      default:
        break;
    }
  }
}
module.exports = {
  LocalError: LocalError
};
