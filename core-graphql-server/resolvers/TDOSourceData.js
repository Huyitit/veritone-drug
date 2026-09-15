const validator = require('validator');

module.exports = function createFunction(serviceContext) {
  const dalEngine = serviceContext.dal.engine;

  // !!! note that some resolver functions on this type are defined
  // in the v3DataModel module, as they depend on the source and
  // scheduled job DALs.
  return {
    task: (object, args, context) =>
      object.taskId
        ? serviceContext.dal.task.getTask(context, { id: object.taskId })
        : null,
    engineId: async function getEngineId(object, args, context) {
      let res = null;
      if (object.taskId) {
        const task = await serviceContext.dal.task.getTask(context, {
          id: object.taskId
        });
        res = await dalEngine.getIdById(context, task.engineId);
      }
      return res;
    },
    engine: async function getEngine(object, args, context) {
      let res = null;
      if (object.taskId) {
        const task = await serviceContext.dal.task.getTask(context, {
          id: object.taskId
        });
        const engId = task.engineId;
        res = await dalEngine.getEngine(context, { id: engId });
      }
      return res;
    }
  };
};
