module.exports = function createFunction(serviceContext) {
  const dalJobPipeline = serviceContext.dal.jobPipeline;
  const dalTaskTemplate = serviceContext.dal.taskTemplate;
  const mainUtil = require('../../util.js')(serviceContext);
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    taskTemplates: (object, args, context) => {
      const _args = Object.assign({ jobTemplateId: object.id }, args);
      return cache.get(context, _args, 'TaskTemplates', () =>
        dalTaskTemplate.getTaskTemplates(context, _args)
      );
    },
    createdDateTime: (obj) => mainUtil.fixDateTime(obj.createdDateTime),
    modifiedDateTime: (obj) => mainUtil.fixDateTime(obj.modifiedDateTime)
  };
};
