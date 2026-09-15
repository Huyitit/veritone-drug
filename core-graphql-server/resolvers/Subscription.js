const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalWatchlist = serviceContext.dal.watchlist,
    dalFolder = serviceContext.dal.folder;
  return {
    frequency: (obj) => dalWatchlist.getFrequencyMap().toKey[obj.frequencyId],
    contact: (obj) => {
      return {
        emailAddress: obj.emailAddress,
        phoneNumber: obj.mobileNumber,
        webhookUri: obj.webHookUri,
        userId: obj.userId
      };
    },
    scheduledDay: (obj) =>
      dalWatchlist.getDayOfWeekMap().toKey[obj.scheduledDay],
    unsubscribeHash: (obj) => obj.jsondata.unsubscribeHash,
    //scheduledTimeZone: obj => moment
    scheduledTime: (obj) => {
      if (!obj.scheduledTime) return null;
      return obj.scheduledTime;
      /*      const time = moment(obj.scheduledTime);
      const format = 'HH:mm:ssZ';
      return obj.scheduledTimeZone
        ? time.tz(obj.scheduledTimeZone).format(format)
        : time.format(format);
        */
    }
  };
};
