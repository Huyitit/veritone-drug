const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const defaultBatchTaskLimit = _.get(
    serviceContext,
    'config.paging.defaultBatchTaskLimit',
    1000
  );

  async function batchUsersByIds(context, keys) {
    const userMap = new Map();
    let uniqArray = _.uniq(keys);

    while (uniqArray.length > 0) {
      const userRes = await serviceContext.dal.admin.getUsersWithBasicInfo(
        {
          userIds: uniqArray.splice(0, defaultBatchTaskLimit)
        },
        context
      );
      if (userRes && _.isArray(userRes)) {
        // concat the task results
        for (const user of userRes) {
          userMap.set(user.id, user);
        }
      }
    }
    // this orders the return array using the order of the input array
    return _.map(keys, (key) => userMap.get(key));
  }

  return {
    batchUsersByIds
  };
};
