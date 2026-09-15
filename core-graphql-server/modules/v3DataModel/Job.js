module.exports = function createFunction(serviceContext) {
  const dalJobTemplate = serviceContext.dal.jobTemplate;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    template(object, args, context) {
      return object.templateId
        ? cache.get(context, { id: object.templateId }, 'JobTemplate', () =>
            dalJobTemplate.getJobTemplate(context, { id: object.templateId })
          )
        : null;
    },
    scheduledJob(object, args, context) {
      return object.scheduledJobId
        ? cache.get(
            context,
            { id: object.scheduledJobId },
            'ScheduledJob',
            () =>
              serviceContext.dal.scheduledJob.getScheduledJob(context, {
                id: object.scheduledJobId
              })
          )
        : null;
    }
  };
};
