/**
 * VP-2581 — Distribution Center: DestinationType DAL (BE-10).
 *
 * Read-only access to the seeded `public.destination_type` catalog. Types are
 * provisioned via Flyway, not user-CRUD.
 *
 * The destination tables live in the `platform` Flyway DB, which maps to the
 * `core` pg connection (see config/service.yml flyway.db.platform.dbKey: core).
 *
 * NOTE: config/publish Schemas are NOT joined in SQL here. Schemas live in
 * `data_registries` (structured_data DB, `third_party` connection) — a separate
 * connection — so they are resolved in the DestinationType field resolver
 * (DestinationType.js -> dal.structuredData.getSchema), mirroring
 * SourceType.sourceSchema. This DAL only reads destination_type rows.
 */
const _ = require('lodash');
const mapper = require('../../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const { config, dbConnections } = serviceContext;
  const mainUtil = require('../../../../util.js')(serviceContext);
  const errors = require('../../../../error/index.js')(config);

  const dbRead = dbConnections['core'].read;

  function map(row) {
    return mapper.camelizeRootKeys(row);
  }

  // created_at/updated_at are aliased so they camelize to the SDL field names
  // createdDateTime / modifiedDateTime.
  const destinationTypeSelect = `
    dt.id,
    dt.name,
    dt.platform,
    dt.vendor_capability,
    dt.icon_class,
    dt.engine_id,
    dt.config_schema_id,
    dt.publish_schema_id,
    dt.is_public,
    dt.created_at AS created_date_time,
    dt.updated_at AS modified_date_time
  `;

  async function getDestinationTypes(context, args = {}) {
    const values = [];
    const where = ['dt.deleted_at IS NULL'];

    if (!_.isNil(args.ids) && args.ids.length) {
      args.ids.forEach((id) => mainUtil.checkId(id, true));
      mainUtil.addSqlWhere('dt.id', args.ids, where, values);
    }
    mainUtil.addSqlWhere('dt.vendor_capability', args.vendorCapability, where, values);
    mainUtil.addSqlWhere('dt.platform', args.platform, where, values);

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const sql = `
      SELECT
        ${destinationTypeSelect}
      FROM
        public.destination_type AS dt
      ${whereClause}
      ORDER BY dt.name
    `;

    return dbRead.map(sql, values, map);
  }

  async function getDestinationType(context, args) {
    mainUtil.checkId(args.id, false);

    const records = await getDestinationTypes(context, { ids: [args.id] });
    if (!records.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'DestinationType'
        }
      });
    }
    return records[0];
  }

  return {
    getDestinationType,
    getDestinationTypes
  };
};
