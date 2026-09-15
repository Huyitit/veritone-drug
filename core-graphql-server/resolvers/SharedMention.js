const _ = require('lodash');
const moment = require('moment');

module.exports = function (serviceContext) {
  return {
    id: (obj) => obj.id || obj.mentionId,
    organization: (obj, args, context, test) => {
      return obj.organizationId
        ? serviceContext.dal.organization
            .getOrganization(context, {
              id: obj.organizationId
            })
            .then((organization) => {
              return {
                id: organization.id,
                name: organization.name,
                jsondata: {
                  features: {
                    hideTranscriptOnSharing: _.get(
                      organization,
                      'jsondata.features.hideTranscriptOnSharing'
                    )
                  }
                }
              };
            })
        : null;
    },
    sourceId: (obj) => obj.sourceId || obj.mediaSourceId,
    sourceTypeId: (obj) => obj.sourceTypeId || obj.mediaSourceTypeId,
    scheduledJobId: (obj) => obj.scheduleId || obj.programId,
    temporalDataObject: async (obj, args, context) => {
      if (obj.mediaId) {
        const tdo = await serviceContext.dal.tdo.getTDO(context, {
          id: _.toString(obj.mediaId)
        });
        return {
          id: tdo.id,
          startDateTime: new Date(tdo.startDateTime).toISOString(),
          stopDateTime: new Date(tdo.stopDateTime).toISOString()
        };
      } else {
        return null;
      }
    },
    scheduledJob: async (obj, args, context) => {
      // We mapped program_id to schedule_id in mentions query
      const id = obj.scheduledJobId || obj.scheduleId;
      if (!id) return null;

      const sjDal = serviceContext.dal.scheduledJob;

      const scheduledJob = await sjDal.getScheduledJob(context, { id });
      const details = await sjDal.getDetails(scheduledJob, context);

      const result = _.pick(scheduledJob, ['id', 'name', 'programFormat']);
      result.details = _.pick(details, ['programImage', 'programLiveImage']);
      return result;
    },
    mentionDate: (obj) => coerceDateToUTC(obj.mentionDate),
    hitStartDateTime: (obj) => coerceDateToUTC(obj.hitStartDateTime),
    hitEndDateTime: (obj) => coerceDateToUTC(obj.hitEndDateTime),
    watchlist: (obj, args, context) => {
      return obj.watchlistId
        ? serviceContext.dal.watchlist
            .getWatchlist({ id: obj.watchlistId }, context)
            .then((watchlist) => {
              return {
                name: watchlist.name
              };
            })
        : null;
    },
    description: async (obj, args, context) => {
      // a shared mention can also be inside a collection
      const folderId =
        obj.folderId || _.get(obj, 'share.objectMetadata.collectionId');
      if (!folderId) return null;
      const collectionMention = await serviceContext.dal.collection.getCollectionMention(
        context,
        {
          folderId,
          mentionId: obj.id || obj.mentionId
        }
      );
      return _.get(collectionMention, 'description');
    }
  };
};

// postgres returns a time stamp without TZ so we coerce to UTC here while
// the value is in date object or string form ("2018-02-21 22:59"); we append "Z".
// the DateTime custom scalar code will then treat the value as UTC and
// format accordingly.
function coerceDateToUTC(date) {
  if (_.isDate(date)) {
    return moment(date).format('YYYY-MM-DDTHH:mm:ss') + 'Z';
  } else if (_.isString(date) && !_.endsWith(date, 'Z')) {
    return date + 'Z';
  } else {
    return date;
  }
}
