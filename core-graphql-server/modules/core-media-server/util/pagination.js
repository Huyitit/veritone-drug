'use strict';

const _ = require('lodash');

module.exports = function init(pagingOptions) {
  return {
    enforceParams,
    toPaginationEnvelope
  };

  function enforceParams(params) {
    _.defaults(params, {
      limit: pagingOptions.defaultLimit,
      offset: 0
    });

    params.limit = Math.min(params.limit, pagingOptions.maxLimit);
    params.offset = Math.max(params.offset, 0);

    return params;
  }

  function toPaginationEnvelope(results, offset, totalResults) {
    return {
      from: offset,
      to: results.length ? offset + results.length - 1 : offset,
      totalResults,
      results
    };
  }
};
