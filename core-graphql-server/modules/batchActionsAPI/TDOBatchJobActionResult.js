module.exports = function createFunction(serviceContext) {
  const dalJob = serviceContext.dal.job;
  const dalTdo = serviceContext.dal.tdo;

  return {
    async job(root, args, context) {
      return await dalJob.getJob(context, { id: root.actionId });
    },
    async temporalDataObject(root, args, context) {
      return await dalTdo.getTDO(context, { id: root.targetId });
    }
  };
};
