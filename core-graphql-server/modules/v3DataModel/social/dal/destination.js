/**
 * VP-2581 — Distribution Center: Destination DAL (BE-11).
 *
 * Org-scoped CRUD over `public.destination` (in the `core` pg connection — the
 * `platform` Flyway DB; see config/service.yml flyway.db.platform.dbKey: core).
 *
 * Conventions:
 *  - All reads/writes are scoped to the caller's organization (org inferred from
 *    the auth context, never from client input — see application-design.md §2).
 *  - Soft-delete via `deleted_at`; every query filters `deleted_at IS NULL`.
 *  - No foreign keys (aiware-core policy); `destination_type_id` is a logical ref.
 *  - `details` is validated against the DestinationType.configSchema on every
 *    write via the BE-09 schema validator.
 *
 * The OAuth/vendor orchestration (minting vendorProfileId, oauthUrl, flipping
 * status) lives in the resolvers (BE-14/BE-15, Batch 3); this DAL persists the
 * values those resolvers assemble.
 */
const _ = require('lodash');
const mapper = require('../../../../dal/mapper.js');
const createSchemaValidator = require('../../validation/schemaValidator.js');

module.exports = function createFunction(serviceContext) {
  const { config, dbConnections } = serviceContext;
  const mainUtil = require('../../../../util.js')(serviceContext);
  const resUtil = require('../../../../resolvers/util.js')(serviceContext);
  const errors = require('../../../../error/index.js')(config);
  const schemaValidator = createSchemaValidator(serviceContext);
  // VE-25263: encrypt/decrypt/HMAC of the Ayrshare Profile-Key (vendor_profile_id) at the DAL boundary.
  const profileKeyCrypto = require('./profileKeyCrypto.js')(serviceContext);

  const dbRead = dbConnections['core'].read;
  const dbWrite = dbConnections['core'].write;

  const defaultOrg = _.get(config, 'db.constants.customerSuccessOrgId', 7682);

  // Status literals a caller may exclude via updateDestination's `notStatus` (see the WHERE predicate there).
  // Callers pass a KEY, never a value, so nothing client-derived can reach the predicate even indirectly; the
  // value itself is still bound as a parameter, so this is an intent guard rather than the injection defence.
  //
  // Null-prototype on purpose: a plain literal would resolve inherited keys ('constructor', 'toString',
  // '__proto__'), so a lookup would return something truthy, pass the allowlist check, and bind a Function into
  // the query — the predicate would then match nothing and the guard would silently degrade to a no-op, which is
  // exactly the race it exists to close.
  const STATUS = Object.freeze(
    Object.assign(Object.create(null), {
      PENDING_OAUTH: 'PENDING_OAUTH',
      CONNECTED: 'CONNECTED',
      DISCONNECTED: 'DISCONNECTED',
      ERROR: 'ERROR'
    })
  );

  function map(row) {
    const mapped = mapper.camelizeRootKeys(row);
    // VE-25263: vendor_profile_id is stored encrypted; decrypt transparently on read (fail-closed on failure),
    // so callers (resolvers, distributeAsset) see plaintext and need no change.
    if (!_.isNil(mapped.vendorProfileId)) {
      mapped.vendorProfileId = profileKeyCrypto.decrypt(mapped.vendorProfileId);
    }
    return mapped;
  }

  // created_at/updated_at aliased so they camelize to createdDateTime/modifiedDateTime.
  // `updated_at` is auto-maintained by a DB trigger on every row update.
  const destinationSelect = `
    d.id,
    d.organization_id,
    d.destination_type_id,
    d.label,
    d.details,
    d.vendor_profile_id,
    d.platform_account_label,
    d.status,
    d.oauth_url,
    d.oauth_url_expires_at,
    d.created_by_user_id,
    d.created_at AS created_date_time,
    d.updated_at AS modified_date_time
  `;

  // Columns echoed back by makeInsertSql/makeUpdateSql RETURNING; aliases match `map`.
  const destinationSelectData = {
    id: null,
    organization_id: null,
    destination_type_id: null,
    label: null,
    details: null,
    vendor_profile_id: null,
    platform_account_label: null,
    status: null,
    oauth_url: null,
    oauth_url_expires_at: null,
    created_by_user_id: null,
    created_at: 'created_date_time',
    updated_at: 'modified_date_time'
  };

  function requireOrg(context) {
    const orgId = resUtil.getOrgFromAuthContext(context);
    if (_.isNil(orgId)) {
      throw new errors.NotAllowed({
        message: 'An organization context is required for destination access.'
      });
    }
    return orgId;
  }

  /**
   * Validate `details` against the DestinationType's configSchema (BE-09).
   * A `{}`/absent configSchema imposes no constraints (label-only Connect form).
   */
  async function validateDetails(context, destinationTypeId, details) {
    const destinationType = await serviceContext.dal.destinationType.getDestinationType(
      context,
      { id: destinationTypeId }
    );
    if (!destinationType.configSchemaId) {
      return;
    }
    const schema = await serviceContext.dal.structuredData.getSchema(context, {
      id: destinationType.configSchemaId,
      organizationId: defaultOrg,
      _skipAccessCheck: true
    });
    await schemaValidator.validateAgainstSchema(schema.schema, details);
  }

  async function getDestinations(context, args = {}) {
    const orgId = requireOrg(context);
    const values = [];
    const where = ['d.deleted_at IS NULL'];
    mainUtil.addSqlWhere('d.organization_id', orgId, where, values);

    const sql = `
      SELECT
        ${destinationSelect}
      FROM
        public.destination AS d
      WHERE ${where.join(' AND ')}
      ORDER BY d.created_at DESC
    `;
    return dbRead.map(sql, values, map);
  }

  async function getDestination(context, args) {
    mainUtil.checkId(args.id, false);
    const orgId = requireOrg(context);

    const sql = `
      SELECT
        ${destinationSelect}
      FROM
        public.destination AS d
      WHERE
        d.id = $1
        AND d.organization_id = $2
        AND d.deleted_at IS NULL
    `;
    const rows = await dbRead.map(sql, [args.id, orgId], map);
    // Nullable query field: absent / other-org / soft-deleted -> null (not an error).
    return rows.length ? rows[0] : null;
  }

  // Internal: load a destination the caller owns, or throw NotFound (for mutations).
  async function loadOwnedDestination(context, id) {
    const destination = await getDestination(context, { id });
    if (!destination) {
      throw new errors.NotFound({
        data: { objectId: id, objectType: 'Destination' }
      });
    }
    return destination;
  }

  async function createDestination(context, args) {
    const input = args.input;
    const orgId = requireOrg(context);
    mainUtil.checkId(input.destinationTypeId, false);

    await validateDetails(context, input.destinationTypeId, input.details);

    const createdByUserId = await resUtil.getUserIdFromAuthContext(context);

    // VE-25263: encrypt the Profile-Key at rest and compute its deterministic HMAC (uniqueness index).
    const encryptedVendorProfileId = _.isNil(input.vendorProfileId)
      ? undefined
      : profileKeyCrypto.encrypt(input.vendorProfileId);
    const vendorProfileIdHmac = _.isNil(input.vendorProfileId)
      ? undefined
      : profileKeyCrypto.hmac(input.vendorProfileId);

    const columns = {
      // Optional pre-generated id (BE-14: the OAuth orchestrator mints it so the Ayrshare
      // Profile refId can reference the destination id before insert). Omitted -> DB gen_random_uuid().
      id: input.id,
      organization_id: orgId,
      destination_type_id: input.destinationTypeId,
      label: input.label,
      details: input.details,
      vendor_profile_id: encryptedVendorProfileId,
      vendor_profile_id_hmac: vendorProfileIdHmac,
      platform_account_label: input.platformAccountLabel,
      // status column defaults to 'PENDING_OAUTH' in the DB when omitted.
      status: input.status,
      oauth_url: input.oauthUrl,
      oauth_url_expires_at: input.oauthUrlExpiresAt,
      created_by_user_id: createdByUserId
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'public.destination',
      columns,
      destinationSelectData
    );
    const res = await dbWrite.map(sql, values, map);
    return res[0];
  }

  // `args.notStatus` (optional, a STATUS key) folds a status guard into the UPDATE's own predicate, so a
  // caller that checked the status before a slow vendor round-trip cannot clobber a row that changed
  // underneath it (VE-26675). Returns undefined when the predicate excludes the row — the caller decides
  // what that means.
  async function updateDestination(context, args) {
    const input = args.input;
    mainUtil.checkId(input.id, false);

    const notStatus = args.notStatus;
    if (!_.isUndefined(notStatus) && !STATUS[notStatus]) {
      throw new errors.InvalidInput({
        message: `Unknown destination status '${notStatus}'.`
      });
    }

    const existing = await loadOwnedDestination(context, input.id);

    // Partial details update: merge onto current details, then re-validate.
    let mergedDetails;
    if (!_.isUndefined(input.details)) {
      mergedDetails = Object.assign({}, existing.details, input.details);
      await validateDetails(context, existing.destinationTypeId, mergedDetails);
    }

    // VE-25263: when the Profile-Key is (re)set, encrypt it and recompute the HMAC together. Partial-update
    // semantics — undefined means "leave unchanged", so both columns stay untouched when it's omitted.
    const encryptedVendorProfileId = _.isUndefined(input.vendorProfileId)
      ? undefined
      : profileKeyCrypto.encrypt(input.vendorProfileId);
    const vendorProfileIdHmac = _.isUndefined(input.vendorProfileId)
      ? undefined
      : profileKeyCrypto.hmac(input.vendorProfileId);

    const columns = {
      label: input.label,
      details: mergedDetails,
      // Connection-lifecycle fields (set by completeDestinationConnection / detach in Batch 3).
      // updated_at is bumped automatically by the DB trigger — never set here.
      status: input.status,
      platform_account_label: input.platformAccountLabel,
      vendor_profile_id: encryptedVendorProfileId,
      vendor_profile_id_hmac: vendorProfileIdHmac,
      oauth_url: input.oauthUrl,
      oauth_url_expires_at: input.oauthUrlExpiresAt
    };

    // Nothing to update -> return the loaded row unchanged, unless the guard already excludes it, so callers
    // handle one empty-result shape either way. NOTE this branch is a stale read (`existing` comes from the
    // read connection), NOT the atomic guarantee the predicate below gives — it issues no statement to check
    // against. That is sound only because `notStatus` is meaningful solely on a write; a caller wanting the
    // atomic guard must supply at least one column.
    if (!Object.values(columns).some((v) => !_.isUndefined(v))) {
      return !_.isUndefined(notStatus) && existing.status === STATUS[notStatus]
        ? undefined
        : existing;
    }

    // The status guard lives in the predicate, not just in the caller's earlier read: between that read and
    // this write the row can be flipped by a concurrent mutation (completeDestinationConnection), and an
    // unconditional UPDATE would overwrite it.
    const whereParams = [input.id, requireOrg(context)];
    let where = `id = $${1} AND organization_id = $${2} AND deleted_at IS NULL`;
    if (!_.isUndefined(notStatus)) {
      whereParams.push(STATUS[notStatus]);
      where += ` AND status <> $${whereParams.length}`;
    }
    const { sql, values } = mainUtil.makeUpdateSql(
      'public.destination',
      columns,
      destinationSelectData,
      where,
      whereParams.length, // SET params are numbered after the WHERE params above
      false,
      // allow explicit-null clears for the oauth fields when flipping to CONNECTED
      { oauth_url: true, oauth_url_expires_at: true, platform_account_label: true }
    );
    const res = await dbWrite.map(sql, [...whereParams, ...values], map);
    return res[0];
  }

  async function deleteDestination(context, args) {
    mainUtil.checkId(args.id, false);
    const orgId = requireOrg(context);

    // Soft-delete; idempotent on the deleted_at IS NULL guard.
    // updated_at is bumped automatically by the DB trigger.
    const sql = `
      UPDATE public.destination
      SET deleted_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await dbWrite.query(sql, [args.id, orgId]);
    if (!rows.length) {
      throw new errors.NotFound({
        data: { objectId: args.id, objectType: 'Destination' }
      });
    }
    return { id: args.id, message: 'Destination deleted' };
  }

  return {
    getDestination,
    getDestinations,
    loadOwnedDestination,
    createDestination,
    updateDestination,
    deleteDestination
  };
};
