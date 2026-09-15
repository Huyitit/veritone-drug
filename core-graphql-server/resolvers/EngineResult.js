const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const cache = require('./cache.js')(serviceContext);
  const dalPartitionGenerator = _.get(
    serviceContext,
    "app.dalPartitionGenerator",
  );

  function fixInt(value) {
    return _.isNil(value) ? value : Math.floor(value);
  }

  function handlePartitionDropped(err) {
    const pgErrorCodes = dalPartitionGenerator.pgErrorCodes;
    const errorCode = err.code || _.get(err, 'data.internalData.code');
    if (pgErrorCodes[errorCode] === pgErrorCodes['42P01']) {
      return null;
    }
    throw err;
  }

  return {
    tdo: (obj, args, context) =>
      serviceContext.dal.tdo.getTDO(context, {
        id: obj.tdoId
      }),
    engine: (obj, args, context) =>
      obj.engineId
        ? cache.get(context, { id: obj.engineId }, 'Engine', () =>
            serviceContext.dal.engine.getEngine(context, {
              id: obj.engineId,
              includeDeleted: true,
              adminView: true
            })
          )
        : null,
    libraryId: (obj, args, context) =>
      obj.taskId
        ? serviceContext.dal.task
            .getTask(context, {
              id: obj.taskId
            })
            .then((task) => {
              return _.get(task, 'payload.libraryId') || null;
            })
            .catch(handlePartitionDropped)
        : null,
    library: (obj, args, context) =>
      obj.taskId
        ? serviceContext.dal.task
            .getTask(context, {
              id: obj.taskId
            })
            .then((task) => {
              const libraryId = _.get(task, 'payload.libraryId');
              return libraryId
                ? serviceContext.dal.library.getLibrary({
                    id: libraryId
                  })
                : null;
            })
            .catch(handlePartitionDropped)
        : null,
    startOffsetMs: (obj) => fixInt(obj.startOffsetMs),
    stopOffsetMs: (obj) => fixInt(obj.stopOffsetMs)
  };
};
