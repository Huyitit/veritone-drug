const validator = require('validator');
const _ = require('lodash');
const { parseResolveInfo } = require('graphql-parse-resolve-info');

module.exports = function createFunction(serviceContext) {
  const dalEngine = serviceContext.dal.engine;

  async function getEngineId(context, object) {
    let engineId = object.engineId;
    let overrideByTask = false;
    if (engineId) {
      try {
        // first try to get by engine ID
        await dalEngine.getEngine(context, { id: engineId });
      } catch (err) {
        // if that fails, the engineId value in the asset
        // metadata might be the value in the "asset" column,
        // which some engines put there.
        // search by asset tag and see if we find one.
        // we take the first, if there are multiple matches.
        const res = await dalEngine.getEngines(context, {
          assetTag: engineId
        });
        if (res.count) {
          engineId = res.records[0].id;
          // set this so that we'll use the task if possible,
          // since it's guaranteed to have the right engine ID.
          overrideByTask = true;
        }
      }
    }
    if ((!engineId || overrideByTask) && object.taskId) {
      const task = await serviceContext.dal.task.getTask(context, {
        id: object.taskId
      });
      engineId = task.engineId;
    }
    return dalEngine.getIdById(context, engineId);
  }

  return {
    task: (object, args, context) =>
      object.taskId
        ? serviceContext.dal.task.getTask(context, { id: object.taskId })
        : null,
    engine: async function get(object, args, context) {
      const engineId = await getEngineId(context, object);
      return engineId ? dalEngine.getEngine(context, { id: engineId }) : null;
    },
    engineId: (obj, args, context) => getEngineId(context, obj),
    schema: async (obj, args, context, resolveInfo) => {
      if (!obj.schemaId) {
        return null;
      }

      const parsed = resolveInfo && parseResolveInfo(resolveInfo);
      const requestedFields = parsed
        ? _.uniq(
            Object.values(parsed.fieldsByTypeName.Schema || {}).map(
              (field) => field.name
            )
          )
        : [];

      // id-only: schemaId === Schema.id, so we already have the answer.
      if (requestedFields.length === 1 && requestedFields[0] === 'id') {
        return { id: obj.schemaId };
      }

      // id and/or dataRegistryId only: the schema->registry mapping lives in
      // the Redis-cached schema row, so we can skip the heavier access-scoped
      // getSchema DB path.
      const LIGHT_FIELDS = ['id', 'dataRegistryId'];
      if (
        requestedFields.length &&
        _.difference(requestedFields, LIGHT_FIELDS).length === 0
      ) {
        const row =
          await serviceContext.dal.structuredData.getSchemaRowFromCache(
            obj.schemaId
          );
        return row
          ? { id: row.id, dataRegistryMetadataId: row.dataRegistryMetadataId }
          : null;
      }

      return serviceContext.dal.structuredData.getSchema(context, {
        id: obj.schemaId,
        organizationId: args.organizationId
      });
    }
  };
};
