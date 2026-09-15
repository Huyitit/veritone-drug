/**
 * VP-2581 — DestinationType field resolvers (BE-10 support).
 *
 * `engine` joins job_new.engine by the engine slug; `configSchema`/`publishSchema`
 * resolve cross-connection from the structured_data DB (data_registries) — the same
 * pattern as SourceType.sourceSchema. The DAL deliberately does NOT join schemas in
 * SQL (different pg connection).
 */
const _ = require('lodash');

module.exports = function createFunction(serviceContext) {
  const dalSchema = serviceContext.dal.structuredData;
  const dalEngine = serviceContext.dal.engine;
  const cache = require('../../../resolvers/cache.js')(serviceContext);
  const defaultOrg = _.get(
    serviceContext.config,
    'db.constants.customerSuccessOrgId',
    7682
  );

  function resolveSchema(context, schemaId) {
    if (!schemaId) {
      return null;
    }
    const args = {
      id: schemaId,
      organizationId: defaultOrg,
      _skipAccessCheck: true
    };
    return cache.get(context, args, 'Schema', () =>
      dalSchema.getSchema(context, args)
    );
  }

  return {
    engine: (obj, args, context) =>
      obj.engineId ? dalEngine.getEngine(context, { id: obj.engineId }) : null,
    configSchema: (obj, args, context) =>
      resolveSchema(context, obj.configSchemaId),
    publishSchema: (obj, args, context) =>
      resolveSchema(context, obj.publishSchemaId),
    // VE-26450: same `core` connection as the type itself, so this is a plain read rather than the
    // cross-connection dance configSchema/publishSchema need. Non-null list; [] when nothing is declared.
    //
    // Batched, because this resolver runs once per type in the result: `destinationTypes { mediaConstraints }`
    // is otherwise one query per row for a table with a handful of them. The request-scoped loader is what makes
    // that one query; the DAL's TTL cache is what usually makes it none.
    //
    // Rows are tagged when several post types are declared for this type, because that is the state in which the
    // pre-flight check skips enforcement altogether — MediaConstraint.enforcedConstraints has to report nothing
    // enforced, and it cannot see its siblings from the row alone. Tagged onto copies: the DAL's rows are shared
    // between callers and frozen.
    mediaConstraints: async (obj, args, context) => {
      const rows = await context.loaders.mediaConstraintsByDestinationTypeId.load(
        obj.id
      );
      const ambiguous = rows.length > 1;
      return rows.map((row) => Object.assign({}, row, { _ambiguousPostType: ambiguous }));
    }
  };
};
