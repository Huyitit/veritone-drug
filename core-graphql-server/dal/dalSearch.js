const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const userAgent = config.userAgent || 'core-graphql-server 1.0.0';
  const errors = require('../error')(config);
  const InvalidInput = errors.InvalidInput;
  const dalUtil = require('./util.js')(config, serviceContext);

  const searchErrorMessage =
    'The search service returned an error. Most likely, there ' +
    'was a problem with the query specified in the "search" parameter. ' +
    'Review your, query, make any necessary adjustments, and try again.';

  const timeoutErrorMessage =
    'The search service is temporarily unavailable due to a timeout. Please try again later.';

  function getToken(context) {
    return context.requestContext.authToken;
  }

  async function searchMentions(context, input) {
    const uri = config.services['core-search-server'].uri;
    const token = getToken(context);

    const { aggregate } = input.search || {};

    const path = aggregate ? 'search/mention/aggregate' : 'search/mention';
    function map(data) {
      return { jsondata: data };
    }

    try {
      const res = await dalUtil.httpCall(
        `${uri}${path}`,
        context,
        input.search,
        map,
        'POST',
        false
      );
      return res;
    } catch (err) {
      const errorDetails = _.get(err, 'data.errorDetails');
      const isTimeout = Array.isArray(errorDetails) && errorDetails.some(d => d.reason === 'Request timed out');
      err.message = isTimeout ? timeoutErrorMessage : searchErrorMessage;
      if (!err.data) err.data = {};
      err.data.validationErrors = _.get(err, 'error.error.errors');
      throw err;
    }
  }

  async function searchMedia(context, input) {
    const uri = config.services['core-search-server'].uri;
    const token = getToken(context);

    const { aggregate } = input.search || {};

    const path = aggregate ? 'search/aggregate' : 'search';

    function map(data) {
      return { jsondata: data };
    }
    try {
      const res = await dalUtil.httpCall(
        `${uri}${path}`,
        context,
        input.search,
        map,
        'POST',
        false
      );
      return res;
    } catch (err) {
      const errorDetails = _.get(err, 'data.errorDetails');
      const isTimeout = Array.isArray(errorDetails) && errorDetails.some(d => d.reason === 'Request timed out');
      err.message = isTimeout ? timeoutErrorMessage : searchErrorMessage;
      if (!err.data) err.data = {};
      err.data.validationErrors = _.get(err, 'error.error.errors');
      throw err;
    }
  }

  return {
    searchMentions: searchMentions,
    searchMedia: searchMedia
  };
};
