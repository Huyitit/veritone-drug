const _ = require('lodash');
const moment = require('moment');
const { v5: uuidv5 } = require('uuid');
module.exports = function createModule(serviceContext) {
  const { logger } = serviceContext;
  const uuidNamespace = 'a3adfc18-628e-4c2e-96c6-e3bfc541a913';
  const dateFormat = 'YYYY-MM-DD';

  /**
   Events come as:400 |EventID|CartID|Title|Artist|Category|Length|
   Example: 400 | 0524|104744|48499-RA-ELGK|ELK GROVE KIA|COM|00:00:59|

   EventID is unique for every playout event in each given day
   CartID is unique for every cut of audio loaded into the system
   Title and Artist are Title and Artist
   Category is the way Audio Vault stores carts
   COM category is local spots, anything else is not
   Length is the duration of the cut.

   * @param registryId
   * @param req
   */
  function createEvents(registryId, req) {
    const event = _.get(req, 'body.data');
    if (_.isNil(event) && !_.isString(event)) {
      throw new Error('Invalid content body for Audio Vault');
    }
    const [, eventId, cartId, title, artist, category, length] = event.split(
      '|'
    );
    const duration = moment.duration(length);
    const now = moment();
    const res = {
      id: uuidv5(eventId + now.format(dateFormat), uuidNamespace),
      eventId,
      cartId,
      title,
      artist,
      category,
      length,
      startDateTime: now.toISOString(),
      duration: duration.asMilliseconds(),
      stopDateTime: now.add(duration).toISOString(),
      stationName: 'KHTK-AM' // Hard coded for now
    };

    return [res];
  }

  return {
    createEvents
  };
};
