/**
 * VE-26450 — read-only access to the seeded `public.destination_media_constraint` catalog (Flyway V3_299/V3_300,
 * not user-CRUD). Same `core` connection as destinationType.js, which is why the pre-flight check needs no
 * cross-connection read — unlike publishSchema, which lives in structured_data and is resolved in a field
 * resolver.
 *
 * Cached per destination type with a short TTL, because the rows are Flyway-seeded reference data read on the
 * publish path: without it every distributeAsset paid a query to learn limits that change on a deploy cadence,
 * not a request one. The TTL, rather than a permanent cache, is what keeps a row edit taking effect without a
 * restart — the whole point of moving the limits into the database.
 */
const _ = require('lodash');
const mapper = require('../../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const { config, dbConnections } = serviceContext;
  const mainUtil = require('../../../../util.js')(serviceContext);
  const errors = require('../../../../error/index.js')(config);

  const dbRead = dbConnections['core'].read;

  // No numeric coercion: every value column is JSONB, and pg parses JSONB numbers as numbers. A bound arriving
  // as a string would make ajv skip the keyword silently, so the seed's types are asserted in CI rather than
  // repaired here.
  function map(row) {
    return mapper.camelizeRootKeys(row);
  }

  const constraintSelect = `
    dmc.id,
    dmc.destination_type_id,
    dmc.post_type,
    dmc.constraint_schema,
    dmc.recommended_media
  `;

  // post_type is a short vendor keyword; bounded per the security baseline's max-length rule.
  const MAX_POST_TYPE_LENGTH = 64;

  // How long a cached row set is trusted. Short enough that editing a limit behaves like editing data rather
  // than shipping a release, long enough that a burst of publishes costs one query instead of one each.
  const CACHE_TTL_MS = _.get(config, 'social.mediaConstraintCacheTtlMs', 60000);

  // destinationTypeId -> { rows, expiresAt }. Bounded by the number of seeded destination types, which is
  // single digits; the guard below exists only so an unforeseen growth in that table cannot become a leak.
  const MAX_CACHED_TYPES = 1000;
  const rowCache = new Map();

  // Cached rows are shared by every caller, so they are frozen rather than trusted not to be written to. The
  // pre-flight check hands constraintSchema straight to ajv and the field resolver copies each row before
  // tagging it; a future caller that mutates instead would otherwise corrupt every later publish.
  function deepFreeze(value) {
    if (_.isObject(value) && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }

  function cachedRowsFor(id) {
    const entry = rowCache.get(id);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      rowCache.delete(id);
      return null;
    }
    return entry.rows;
  }

  function cacheRowsFor(id, rows) {
    if (rowCache.size >= MAX_CACHED_TYPES) {
      rowCache.clear();
    }
    rowCache.set(id, { rows, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /**
   * The query itself. Every caller-supplied value is parameterized; ids reach here only after checkId.
   */
  function queryConstraints(destinationTypeIds, postType) {
    const values = [];
    const where = ['dmc.deleted_at IS NULL'];

    mainUtil.addSqlWhere(
      'dmc.destination_type_id',
      destinationTypeIds,
      where,
      values
    );
    if (!_.isNil(postType)) {
      mainUtil.addSqlWhere('dmc.post_type', postType, where, values);
    }

    const sql = `
      SELECT
        ${constraintSelect}
      FROM
        public.destination_media_constraint AS dmc
      WHERE ${where.join(' AND ')}
      ORDER BY dmc.post_type
    `;

    return dbRead.map(sql, values, map);
  }

  /**
   * Returns [] when nothing is declared — callers read that as "allow", never as an error.
   *
   * `destinationTypeIds` is required and strictly validated for that reason: an unfiltered query returns every
   * platform's rows and a nullish id yields `IN (NULL)`, so either mistake would silently disable enforcement
   * rather than fail.
   *
   * Passing several ids costs ONE query, not one per id — which is what lets a DataLoader collapse the
   * `destinationTypes { mediaConstraints }` fan-out into a single read.
   */
  async function getMediaConstraints(context, args = {}) {
    if (_.isNil(args.destinationTypeIds) || !Array.isArray(args.destinationTypeIds)) {
      throw new errors.InvalidInput({
        message: 'getMediaConstraints requires a destinationTypeIds array.'
      });
    }
    // No ids requested means no rows — never every platform's rows.
    if (!args.destinationTypeIds.length) {
      return [];
    }
    // Required, not optional: checkId(id, true) tolerates null and would let a destination with a missing
    // destination_type_id bypass the check silently.
    args.destinationTypeIds.forEach((id) => mainUtil.checkId(id, false));

    if (!_.isNil(args.postType)) {
      if (
        typeof args.postType !== 'string' ||
        !args.postType.length ||
        args.postType.length > MAX_POST_TYPE_LENGTH
      ) {
        throw new errors.InvalidInput({
          message: `postType must be a non-empty string of at most ${MAX_POST_TYPE_LENGTH} characters.`
        });
      }
      // Uncached: the cache holds a type's COMPLETE row set, and caching a post-type-filtered subset under the
      // same key would serve that subset to the unfiltered callers that actually run enforcement. No caller
      // passes postType today; correctness here costs nothing.
      return queryConstraints(args.destinationTypeIds, args.postType);
    }

    const ids = _.uniq(args.destinationTypeIds.map(_.toString));
    const resolved = new Map();
    ids.forEach((id) => {
      const rows = cachedRowsFor(id);
      if (rows) {
        resolved.set(id, rows);
      }
    });

    const missing = ids.filter((id) => !resolved.has(id));
    if (missing.length) {
      const fetched = await queryConstraints(missing, null);
      const byId = _.groupBy(fetched, (row) => _.toString(row.destinationTypeId));
      // EVERY missed id is cached, including the ones that returned nothing. Caching only the hits would make
      // "declares no constraints" — the common case, and the one on the publish path — re-query every time.
      missing.forEach((id) => {
        const rows = deepFreeze(byId[id] || []);
        cacheRowsFor(id, rows);
        resolved.set(id, rows);
      });
    }

    // Sorted across the whole result, matching the SQL's ORDER BY rather than grouping by id.
    return _.sortBy(_.flatMap(ids, (id) => resolved.get(id) || []), 'postType');
  }

  return {
    getMediaConstraints
  };
};
