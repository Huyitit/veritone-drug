const _ = require('lodash');
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');

module.exports = function createModule(serviceContext) {
  const { logger } = serviceContext;
  const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';
  const dateFormat = 'YYYY-MM-DDTHH:mm:ss';

  function createEvents(registryId, req) {
    const results = [];
    const playbackstate = _.get(req, 'body.playbackstate');
    const events = _.get(playbackstate, 'play');
    const currentTime = moment(
      _.get(playbackstate, 'currenttime'),
      'MM/DD/YY HH:mm:ss'
    );
    const remaining = moment.duration(_.get(playbackstate, 'remaining'));

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // We only have one station going through this integration
      // and they don't send this required information
      const res = Object.assign(
        {
          stationCallSign: 'WBNS',
          stationBand: 'FM'
        },
        _.omit(playbackstate, ['play']),
        event
      );
      const length = moment.duration(`00:${_.get(event, 'length')}`);
      res.id = uuidv5(
        _.get(event, 'cutid', JSON.stringify(event)),
        uuidNamespace
      );

      const diffInEvent = remaining.asSeconds() - length.asSeconds();

      if (i === 0) {
        res.startDateTime = moment(currentTime)
          .add(diffInEvent, 's')
          .format(dateFormat);
      } else {
        res.startDateTime = moment(results[i - 1].endDateTime);
      }

      res.endDateTime = moment(res.startDateTime)
        .add(remaining)
        .format(dateFormat);

      res.duration = length.asMilliseconds();

      results.push(res);
    }

    return results;
  }

  return {
    createEvents
  };
};
