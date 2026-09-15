// The canonical TaskFailureReason table: every reason a task may report, keyed by the value
// stored on task_output.failureReason, with the canned message used when the sender supplied none.
//
// Three-way synced by hand, and drift in any direction breaks reads:
//   - https://github.com/veritone/edge-messages/blob/master/failure_reason.go (the senders)
//   - the TaskFailureReason enum in schema/schema.graphql (GraphQL serialization)
//   - this map (dal/util.js#defineTaskOutputFailure resolves against it)
// Parity with the schema enum is asserted in util.spec.js.
//
// It lives in its own module, rather than inline in util.js, because it is pure generated-shaped
// data: a generator fed from failure_reason.go can overwrite this file wholesale without touching
// hand-written code.
module.exports = {
  internal_error: {
    failureReason: 'internal_error',
    failureMessage: 'The engine encountered an unexpected internal error.'
  },
  unknown: {
    failureReason: 'unknown',
    failureMessage: 'The cause of the failure could not be determined.'
  },
  url_not_found: {
    failureReason: 'url_not_found',
    failureMessage:
      'The engine attempted to download content from a URL provided in the task payload and received a 404.'
  },
  url_not_allowed: {
    failureReason: 'url_not_allowed',
    failureMessage:
      'The engine attempted to download content from a URL provided in the task payload and received a 401 or 403.'
  },
  url_timeout: {
    failureReason: 'url_timeout',
    failureMessage:
      'The engine attempted to download content from a URL provided in the task payload and the download timed out'
  },
  url_connection_refused: {
    failureReason: 'url_connection_refused',
    failureMessage:
      'The engine attempted to download content from a URL provided in the task payload and the connection was refused.'
  },
  url_error: {
    failureReason: 'url_error',
    failureMessage:
      'The engine attempted to download content from a URL provided in the task payload an received an error.'
  },
  invalid_data: {
    failureReason: 'invalid_data',
    failureMessage:
      'The input to the engine was incompatible with the engine requirements. For example, an input media file had an unsupported MIME type or the file was empty.'
  },
  rate_limited: {
    failureReason: 'rate_limited',
    failureMessage: 'An engine operation was subject to rate limiting.'
  },
  api_not_allowed: {
    failureReason: 'api_not_allowed',
    failureMessage:
      'The engine received an authorization error from the Veritone API.'
  },
  api_authentication_error: {
    failureReason: 'api_authentication_error',
    failureMessage:
      'The engine received an authentication error from the Veritone API using the token provided in the task payload.'
  },
  api_not_found: {
    failureReason: 'api_not_found',
    failureMessage:
      'The engine received a "not found" error from the Veritone API on a required object.'
  },
  api_error: {
    failureReason: 'api_error',
    failureMessage:
      'An unexpected error was received from the Veritone API, such as HTTP 500, HTTP 502, or an internal_error error.'
  },
  file_write_error: {
    failureReason: 'file_write_error',
    failureMessage:
      'The engine could not write temporary files to disk for processing due to disk space full or other system error.'
  },
  stream_read_error: {
    failureReason: 'stream_read_error',
    failureMessage:
      'The engine could not read from stream input for processing due to stream link broken or cannot connect to stream link.'
  },
  system_dependency_missing: {
    failureReason: 'system_dependency_missing',
    failureMessage:
      'The engine encountered a missing binary dependency or configuration, such as a missing executable or package or incompatible hardware.'
  },
  system_error: {
    failureReason: 'system_error',
    failureMessage:
      'The engine encountered an operating system, hardware, or other system-level error.'
  },
  heartbeat_timeout: {
    failureReason: 'heartbeat_timeout',
    failureMessage: `The engine failed to send heartbeat or Edge didn't receive it in time.`
  },
  chunk_timeout: {
    failureReason: 'chunk_timeout',
    failureMessage: `The engine failed to send chunk result, or Edge didn't receive it in time.`
  },
  other: {
    failureReason: 'other',
    failureMessage:
      'The error cause is known, but could not be mapped to a `TaskFailureReason` value.'
  },
  external_error: {
    failureReason: 'external_error',
    failureMessage:
      'The engine calls third party for processing and receives error.'
  },
  connection: {
    failureReason: 'connection',
    failureMessage:
      'The engine attempted to connect from a URL provided in the task payload and the connection was refused.'
  },
  unauthorized: {
    failureReason: 'unauthorized',
    failureMessage:
      'The engine received an authorization error from the Veritone API.'
  },
  api: {
    failureReason: 'api',
    failureMessage:
      'An unexpected error was received from the Veritone API, such as HTTP 500, HTTP 502, or an internal_error error.'
  },
  resources: {
    failureReason: 'resources',
    failureMessage: 'The engine encountered an resource-level error.'
  },
  not_found: {
    failureReason: 'not_found',
    failureMessage:
      'The engine received a "not found" error from the Veritone API on a required object.'
  },
  core_api: {
    failureReason: 'core_api',
    failureMessage: 'The engine encountered an unexpected core api error.'
  },
  bad_data: {
    failureReason: 'bad_data',
    failureMessage: 'The engine encountered an unexpected bad data error.'
  },
  scheduling: {
    failureReason: 'scheduling',
    failureMessage: 'The engine failed due to an scheduling error.'
  },
  //default failure reason
  task_validation: {
    failureReason: 'task_validation',
    failureMessage: `The failureReason doesn't match with any of taskFailureEnum values.`
  },
  license_error: {
    failureReason: 'license_error',
    failureMessage: `The engine failed due to an expired or invalid license.`
  },
  input_error: {
    failureReason: 'input_error',
    failureMessage:
      'The input to the engine was invalid, unsupported, or malformed.'
  },
  compatibility_error: {
    failureReason: 'compatibility_error',
    failureMessage:
      'The input was valid but incompatible with this engine, such as an unsupported format, codec, or language.'
  },
  download_error: {
    failureReason: 'download_error',
    failureMessage:
      'The engine could not obtain its input, such as a failed or timed-out download of content referenced by the task payload.'
  },
  vendor_error: {
    failureReason: 'vendor_error',
    failureMessage:
      'The engine received an error from a third-party service it depends on.'
  },
  platform_error: {
    failureReason: 'platform_error',
    failureMessage:
      'The engine received an unexpected error from the aiWARE platform.'
  },
  timeout: {
    failureReason: 'timeout',
    failureMessage: 'The engine, or one of its operations, timed out.'
  }
};
