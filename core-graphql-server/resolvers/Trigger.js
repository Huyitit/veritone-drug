module.exports = function createFunction(serviceContext) {
  const db = serviceContext.dal.trigger;
  return {
    id: (obj) => '' + obj.eventTriggerId,
    event: (obj) => obj.eventName,
    target: (obj) => obj.targetName,
    createdDateTime: (obj) => obj.createdAtUtc,
    modifiedDateTime: (obj) => obj.updatedAtUtc,
    createdBy: (obj) => obj.createdBy || '',
    updatedBy: (obj) => obj.updatedBy || ''
  };
};
