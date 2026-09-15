const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  async function batchDagTemplatesByJobIds(context, jobIds, organizationId) {
    const defaultBatchLimit = 100;
    const dagTemplatesMap = new Map();
    let uniqJobIds = _.uniq(jobIds);
    for (let i = 0; i < uniqJobIds.length; i += defaultBatchLimit) {
      const batchJobIds = uniqJobIds.slice(i, i + defaultBatchLimit);

      const dagTemplateIdsByJobId = await serviceContext.dal.jobDagTemplate.getDagTemplateIdsByJobIds(
        context,
        { ids: batchJobIds, limit: defaultBatchLimit }
      );
      if (
        dagTemplateIdsByJobId &&
        Array.isArray(dagTemplateIdsByJobId.records) &&
        dagTemplateIdsByJobId.records.length
      ) {
        const dagTemplateIds = dagTemplateIdsByJobId.records.map(
          (item) => item.dagTemplateId
        );
        const dagTemplates = await serviceContext.dal.dagTemplate.getDagTemplates(
          context,
          {
            id: dagTemplateIds,
            organizationId,
            limit: defaultBatchLimit
          }
        );

        if (
          dagTemplates &&
          Array.isArray(dagTemplates.records) &&
          dagTemplates.records.length
        ) {
          for (const dagTemplate of dagTemplates.records) {
            const relatedJobIds = dagTemplateIdsByJobId.records
              .filter((item) => item.dagTemplateId === dagTemplate.id)
              .map((item) => item.jobId);
            for (const jobId of relatedJobIds) {
              dagTemplatesMap.set(jobId, dagTemplate);
            }
          }
        }
      }
    }
    return _.map(jobIds, (key) => dagTemplatesMap.get(key));
  }

  async function batchDagTemplatesByIds(
    context,
    dagTemplateIds,
    organizationId
  ) {
    const defaultBatchLimit = 100;
    const dagTemplatesMap = new Map();
    let uniqDagTemplateIds = _.uniq(dagTemplateIds);
    for (let i = 0; i < uniqDagTemplateIds.length; i += defaultBatchLimit) {
      const batchDagTemplateIds = uniqDagTemplateIds.slice(
        i,
        i + defaultBatchLimit
      );
      const dagTemplates = await serviceContext.dal.dagTemplate.getDagTemplates(
        context,
        {
          id: batchDagTemplateIds,
          organizationId,
          limit: defaultBatchLimit
        }
      );

      if (
        dagTemplates &&
        Array.isArray(dagTemplates.records) &&
        dagTemplates.records.length
      ) {
        for (const dagTemplate of dagTemplates.records) {
          dagTemplatesMap.set(dagTemplate.id, dagTemplate);
        }
      }
    }
    return _.map(dagTemplateIds, (key) => dagTemplatesMap.get(key));
  }

  return {
    batchDagTemplatesByJobIds,
    batchDagTemplatesByIds
  };
};
