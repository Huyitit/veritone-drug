'use strict';

const _ = require('lodash');

module.exports = function init() {
  const jobBundleScheduleDefinition = require('@veritone/core-server-base/model/util/create-model')(
    {
      recurringStartTime: { type: 'string' },
      recurringEndTime: { type: 'string' },
      repeatDaysTimeInMinutes: { type: 'number' },
      repeatDaysOfWeek: { type: '*' },
      repeatDaysOfMonth: { type: '*' },
      repeatMinutes: { type: 'number' }
    }
  );

  return jobBundleScheduleDefinition;
};
