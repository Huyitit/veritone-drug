const _ = require('lodash');
module.exports = function createFunction(serviceContext) {
  const dalScheduledJob = serviceContext.dal.scheduledJob;
  const dalSourceType = serviceContext.dal.sourceType;
  const dalSource = serviceContext.dal.source;
  const dalMention = serviceContext.dal.mention;
  const dalCreative = serviceContext.dal.creative;

  if (!dalScheduledJob) throw new Error('dalScheduledJob');
  if (!dalSourceType) throw new Error('dalSourceTYpe');
  if (!dalSource) throw new Error('dalSource');

  return {
    schedules: (obj, args, context) => {
      return serviceContext.dal.watchlist
        .populateDetails(obj)
        .then(function (det) {
          const pIds = det ? det.programIds : [];
          // if there are no program IDs, just return empty result now
          if (!pIds.length) {
            return {
              count: 0,
              offset: args.offset,
              limit: args.limit,
              records: []
            };
          }
          return dalScheduledJob.getScheduledJobs(
            context,
            Object.assign({ id: pIds }, args)
          );
        });
    },
    combinedSourceTypeIds: (object, args, context) => {
      return dalSourceType.getCombinedSourceTypeIds(
        context,
        dalSource,
        dalScheduledJob,
        object
      );
    },
    creative: async (obj, args, context) =>
      obj.creativeId
        ? dalCreative.getCreative(
            {
              id: obj.creativeId,
              organizationId: args.organizationId
            },
            context
          )
        : null
  };
};
