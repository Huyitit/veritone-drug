const { createError } = require('apollo-errors');

const uuid = require('uuid');
const _ = require('lodash');

module.exports = function createFunction(config) {
  const loginUri = _.get(config, 'services.loginPageUri', '');
  const options = {
    showPath: true,
    showLocations: true
  };

  return {
    NotFound: createError('not_found', {
      message: 'The requested object was not found',
      options
    }),

    ServiceFailure: createError('service_failure', {
      message: 'A service operation failed',
      options
    }),

    ServiceUnavailable: createError('service_unavailable', {
      message:
        'A required service could not be reached. This error can indicate a temporary outage or a misconfiguration.',
      options
    }),

    ResourceUnavailable: createError('resource_unavailable', {
      message:
        'An external resource required to provide requested data was not available.',
      options
    }),

    InternalServerError: createError('internal_error', {
      message: 'The server experienced an internal error',
      options
    }),

    NotAllowed: createError('not_allowed', {
      message:
        'The authenticated user does not have permission to perform the operation',
      options
    }),

    ObjectLimitExceeded: createError('object_limit_exceeded', {
      message:
        'The size of an object or number of objects contained within has ' +
        'exceeded the limit allowed.'
    }),

    CapacityExceeded: createError('capacity_exceeded', {
      message:
        'Server capacity allocated to the client was exceeded while processing the request.',
      options
    }),

    RequestTimeout: createError('request_timeout', {
      message:
        'The request to the GraphQL server exceeded the maximum time allowed.',
      options
    }),
    SqlQueryTimeout: createError('sql_query_timeout', {
      message: 'SQL query exceeded the maximum time allowed.',
      options
    }),
    SqlError: createError('sql_error', {
      message: 'An error occurred while executing the SQL statement.',
      options
    }),
    AuthenticationError: createError('authentication_error', {
      message:
        'The client did not supply a valid authentication token or the token was not of the type required for the requested operation. ' +
        'Supply a token if using the API or log in at ' +
        loginUri +
        ' to continue.',
      options
    }),
    AuthorizationError: createError('authorization_error', {
      message: 'The client requested access to an object that is not permitted',
      options
    }),

    InvalidInput: createError('invalid_input', {
      message: 'The provided input failed validation checks.',
      options
    }),

    NotImplemented: createError('not_implemented', {
      message:
        'The requested query, mutation, or field is not available on this server. ' +
        'The cause may be a configuration issue or operational problem affecting a required subsystem.',
      options
    }),

    ResourceConflict: createError('resource_conflict', {
      message:
        'The requested mutation could not be executed because of a conflict with ' +
        'an existing resource, such as duplicate name or ID.',
      options
    }),

    RateLimited: createError('rate_limited', {
      message: 'The request was subject to rate limiting.',
      options
    }),

    UnavailableFunds: createError('unavailable_funds', {
      message: 'Unvailable funds for current organization'
    }),

    nestedResourcesCycleDetected: createError(
      'nested_resources_cycle_detected',
      {
        message:
          'The requested mutation could not be execute because of a nested resource cycle detected'
      }
    ),

    elasticSearchConnectionFails: createError('elasticsearch_error', {
      message: 'Unable to connect to elastic search',
      options
    }),

    newErrorId: function newErrorId() {
      return uuid.v4();
    }
  };
};
