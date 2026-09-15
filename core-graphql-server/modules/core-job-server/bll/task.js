'use strict';

const _ = require('lodash');

module.exports = function init(app, dal, model) {
  if (!_.isObject(app) || !_.isObject(app.config)) {
    throw new Error('missing app');
  }
  if (!_.isObject(dal) || !_.every([dal.task], _.isObject)) {
    throw new Error('missing dal');
  }
  if (!_.isObject(model)) {
    throw new Error('missing model');
  }

  return {
    getEngineUsageForOrganization
  };

  /*
   * Gets engine usage for an organization based on their billing type.
   */
  function getEngineUsageForOrganization(
    applicationId,
    organization,
    dbClient,
    callback
  ) {
    if (!_.isFunction(callback)) {
      throw new Error('missing callback');
    }
    if (!_.isString(applicationId)) {
      callback(new Error('missing app id'));
      return;
    }
    if (!_.isObject(organization)) {
      callback(new Error('missing organization'));
      return;
    }
    const billingType = _.get(organization, 'kvp.billing.type') || 'monthly';
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let startEpoch, endEpoch;

    if (billingType === 'total') {
      startEpoch = null;
      endEpoch = null;
    } else if (billingType === 'yearly') {
      startEpoch = new Date(currentYear, 0, 1).getTime() / 1000;
      endEpoch = new Date(currentYear + 1, 0, 1).getTime() / 1000;
    } else if (billingType === 'monthly') {
      startEpoch = new Date(currentYear, currentMonth, 1).getTime() / 1000;
      endEpoch = new Date(currentYear, currentMonth + 1, 1).getTime() / 1000;
    }

    dal.task.getEngineUsageForOrganization(
      {
        applicationId: applicationId,
        startEpoch: startEpoch,
        endEpoch: endEpoch
      },
      dbClient,
      function getEngineUsageForOrganization(err, results) {
        if (err) {
          const error = { statusCode: 503 };
          callback(error);
          return;
        }

        results.billingType = billingType;
        results.startDateTime = startEpoch ? new Date(startEpoch * 1000) : null;
        results.endDateTime = endEpoch ? new Date(endEpoch * 1000) : null;
        callback(null, results);
      }
    );
  }
};
