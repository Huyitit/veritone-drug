module.exports = function createFunction(serviceContext) {
  return {
    mentionStatus: (obj) => {
      return serviceContext.dal.watchlist.getMentionStatusOption({
        id: obj.mentionStatusId
      });
    },
    profile: (obj) => obj.profile,
    query: (object) =>
      object.query
        ? object.query
        : serviceContext.dal.watchlist.toV3Query(object.profile)
  };
};
