module.exports = function createFunction(serviceContext) {
  const dalJobTemplate = serviceContext.dal.jobTemplate;
  const dalTaskTemplate = serviceContext.dal.taskTemplate;
  const cache = require('../../resolvers/cache.js')(serviceContext);

  return {
    jobTemplate: (object, args, context) =>
      object.jobTemplateId
        ? cache.get(context, { id: object.jobId }, 'JobTemplate', () =>
            dalJobTemplate.getJobTemplate(context, { id: object.jobTemplateId })
          )
        : null,
    parentTask: (object, args, context) =>
      object.parentTaskId
        ? cache.get(context, { id: object.parentTaskId }, 'TaskTemplate', () =>
            dalTaskTemplate.getTaskTemplate(context, {
              id: object.parentTaskId
            })
          )
        : null,
    childTasks: (object, args, context) => {
      const _args = Object.assign(
        {
          applicationId: object.applicationId,
          parentTaskId: object.id,
          jobTemplateId: object.jobTemplateId
        },
        args
      );

      return cache.get(context, _args, 'TaskTemplates', () =>
        dalTaskTemplate.getTaskTemplates(context, _args)
      );
    },
    childTaskIds: (object, args, context) => {
      const _args = {
        parentTaskId: object.id,
        applicationId: object.applicationId,
        offset: 0,
        limit: 500
      };
      return cache
        .get(context, _args, 'TaskTemplates', () =>
          dalTaskTemplate.getTaskTemplates(context, _args)
        )
        .then((res) => res.records.map((obj) => obj.id));
    },
    engine: (object, args, context) =>
      cache.get(context, { id: object.engineId }, 'Engine', () =>
        serviceContext.dal.engine.getEngine(context, { id: object.engineId })
      )
  };
};
