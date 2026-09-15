const _ = require('lodash');
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');

module.exports = function createModule(serviceContext) {
  const { logger } = serviceContext;
  const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';
  const parseFormat = 'ddd MMM DD HH:mm:ss YYYY';
  const printFormat = 'YYYY-MM-DDTHH:mm:ss';

  function createEvents(registryId, req) {
    const results = [];
    const events = _.get(req, 'body.playlist.entry');
    for (const event of events) {
      const res = camelizeRootKeys(event['$']);
      res.startDateTime = moment(res.startTime, parseFormat).format(
        printFormat
      );
      if (_.isString(res.duration)) {
        res.duration = parseInt(res.duration);
      }
      res.endDateTime = moment(res.startDateTime)
        .add(res.duration, 'ms')
        .format(printFormat);
      res.stationId = res.stationId.replace('_', '-');
      res.id = uuidv5(res.id, uuidNamespace);
      results.push(res);
    }

    return results;
  }

  function camelizeRootKeys(entity) {
    const result = {};
    Object.entries(entity).forEach(([key, value]) => {
      _.set(result, _.camelCase(key), value);
    });
    return result;
  }

  return {
    createEvents
  };
};
