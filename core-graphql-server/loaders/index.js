const DataLoader = require('dataloader');

module.exports = function createModule(serviceContext) {
  function createLoaders(context) {
    return {
      tasksByJobIds: new DataLoader((keys) =>
        serviceContext.loaders.task.batchTasksByJobIds(context, keys)
      ),
      usersById: new DataLoader((keys) =>
        serviceContext.loaders.user.batchUsersByIds(context, keys)
      ),
      // VE-26450 — collapses the per-destination-type media-constraint read into one query per request.
      mediaConstraintsByDestinationTypeId: new DataLoader((keys) =>
        serviceContext.loaders.mediaConstraint.batchMediaConstraintsByDestinationTypeIds(
          context,
          keys
        )
      ),
      dagTemplatesByJobIds: new DataLoader((keys) => {
        const jobIds = keys.map((key) => key.jobId);
        const organizationId = keys[0].organizationId;
        return serviceContext.loaders.dagTemplate.batchDagTemplatesByJobIds(
          context,
          jobIds,
          organizationId
        );
      }),
      dagTemplatesByIds: new DataLoader((keys) => {
        const ids = keys.map((key) => key.id);
        const organizationId = keys[0].organizationId;
        return serviceContext.loaders.dagTemplate.batchDagTemplatesByIds(
          context,
          ids,
          organizationId
        );
      })
    };
  }

  return {
    createLoaders
  };
};
