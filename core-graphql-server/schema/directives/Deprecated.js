const _ = require('lodash');
const dateIdUtil = require('@veritone/core-server-base/date-id.js')();
const moment = require('moment');

module.exports = function create(directiveContext) {
  const errors = require('../../error')(directiveContext.appConfig);
  const serviceContext = directiveContext.serviceContext;
  if (!serviceContext)
    throw new Error(
      'no serviceContext available in ' + Object.keys(directiveContext)
    );
  const errorOnExpired =
    _.get(
      directiveContext.appConfig,
      'featureFlags.errorOnExpiredGraphQLField',
      false
    ) === true;

  return {
    name: 'deprecated',
    before: true,

    resolver(directiveArgs, fieldArgs, context, info) {
      const fieldName = info.fieldName;
      const type = info.parentType;
      const paramName = fieldArgs.__directiveArgName;

      // if the deprecated parameter was set internally by the server, don't warn.
      if (
        fieldArgs.__ignoreParamsForValidation &&
        fieldArgs.__ignoreParamsForValidation.includes(paramName)
      ) {
        return;
      }
      // if the deprecated parameter was not set, don't warn.
      if (paramName && _.isNil(fieldArgs[paramName])) {
        return;
      }

      const key = type + '.' + fieldName + (paramName ? '.' + paramName : '');
      // we don't want to emit N warnings for a single field for a single request.
      // so we'll keep a map of field to number.
      if (!context.requestInfo.deprecatedWarnings) {
        context.requestInfo.deprecatedWarnings = {};
      }
      if (!context.requestInfo.deprecatedWarnings[key]) {
        context.requestInfo.deprecatedWarnings[key] = 1;
        if (!context.requestInfo.warnings) {
          context.requestInfo.warnings = [];
        }
        // increment a metric
        serviceContext.metrics.incrementCounter(
          'graphQLQueryDeprecatedAPIWarning',
          { api: key }
        );

        const ds = new Date(directiveArgs.expirationDate);
        // the field has EXPIRED and can no longer be used at all.
        // request will generate an error.
        const expired = moment(ds).isBefore(moment());
        if (expired) {
          serviceContext.metrics.incrementCounter(
            'graphQLQueryExpiredAPIWarning',
            { api: key }
          );
        }

        const errorData = {
          expired,
          type,
          field: fieldName,
          parameter: paramName,
          deprecationDate: directiveArgs.deprecationDate,
          expirationDate: directiveArgs.expirationDate,
          reason: directiveArgs.reason,
          alternate: directiveArgs.alternate
        };

        if (expired && errorOnExpired) {
          // note that this will be logged as an error
          throw new errors.InvalidInput({
            message:
              'The field or parameter ' +
              key +
              ' has been deprecated and expired ' +
              'and can no longer be used. The API(s) ' +
              directiveArgs.alternate +
              ' should be used instead. See Veritone API documentation for additional details.',
            data: errorData
          });
        }

        // log it for reporting purposes
        serviceContext.messageUtil.emitEvent({
          event: 'warning',
          errorName: 'api_deprecated_field',
          errorData
        });
        // otherwise we just emit a warning in the response and continue.
        context.requestInfo.warnings.push({
          event: 'warning',
          errorName: 'api_deprecated_field',
          message:
            'The GraphQL query references a deprecated field or parameter, ' +
            key +
            '. ' +
            'The client that issues this query should be modified to use non-deprecated APIs. ' +
            'Reason:  ' +
            directiveArgs.reason +
            '. ' +
            'The API(s) ' +
            directiveArgs.alternate +
            ' should be used instead.' +
            'See Veritone API documentation for details. ' +
            'The API will EXPIRE on ' +
            directiveArgs.expirationDate +
            ' and will generate ' +
            'errors if used after that time.',
          data: errorData
        });
      } else {
        context.requestInfo.deprecatedWarnings[key]++;
      }
    },
    validator(directiveArgs, field, schema) {
      const reason = directiveArgs.reason;
      const stopDate = directiveArgs.expirationDate;
      const deprecationDate = directiveArgs.deprecationDate;
      const alt = directiveArgs.alternate;

      // stopDate is required
      if (!stopDate) {
        throw new Error(
          'expirationDate is required for deprecation on ' +
            field.type +
            '.' +
            field.name
        );
      }
      let parsedStopDate;
      try {
        parsedStopDate = new Date(stopDate);
      } catch (err) {
        throw new Error(
          'expirationDate is not valid on ' +
            field.type +
            '.' +
            field.name +
            ':  ' +
            err
        );
      }
      if (isNaN(parsedStopDate)) {
        throw new Error(
          'expirationDate is not valid on ' +
            field.type +
            '.' +
            field.name +
            ':  ' +
            stopDate
        );
      }
      // deprecationDate is required
      if (!deprecationDate) {
        throw new Error(
          'deprecationDate is required for deprecation on ' +
            field.type +
            '.' +
            field.name
        );
      }
      let parsedDeprecationDate;
      try {
        parsedDeprecationDate = new Date(deprecationDate);
      } catch (err) {
        throw new Error(
          'deprecationDate on ' +
            field.type +
            '.' +
            field.name +
            ' is not valid:  ' +
            err
        );
      }
      if (isNaN(parsedDeprecationDate)) {
        throw new Error(
          'deprecationDate on ' +
            field.type +
            '.' +
            field.name +
            ' is not valid:  ' +
            deprecationDate
        );
      }

      // deprecationDate cannot be in the future
      if (moment().add(7, 'day').isBefore(moment(parsedDeprecationDate))) {
        throw new Error(
          'deprecation date on ' +
            field.type +
            '.' +
            field.name +
            ' cannot be in the future:  ' +
            deprecationDate
        );
      }
      if (moment(parsedStopDate).isBefore(moment(parsedDeprecationDate))) {
        throw new Error(
          'expire date ' +
            stopDate +
            ' on ' +
            field.type +
            '.' +
            field.name +
            ' is before deprecation date ' +
            deprecationDate
        );
      }
      // reason is required
      if ((reason || '').trim().length < 1) {
        throw new Error(
          'reason is required for deprecation on ' +
            field.type +
            '.' +
            field.name
        );
      }
      // alternate is required
      if ((alt || '').trim().length < 1) {
        throw new Error(
          'alternate is required for deprecation on ' +
            field.type +
            '.' +
            field.name
        );
      }
    }
  };
};
