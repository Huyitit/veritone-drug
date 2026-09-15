const _ = require('lodash');
const validator = require('validator');
const humps = require('humps');
const uuid = require('uuid');
const moment = require('moment');

const mapper = require('./mapper.js');

module.exports = function createFunction(serviceContext) {
  const mapper = require('./mapper.js');
  const util = require('../util.js')(serviceContext);
  const logger = serviceContext.logger;
  const config = serviceContext.config;
  const dbConnections = serviceContext.dbConnections;
  const redisCache = serviceContext.redisCache;
  const groupToOrgCache = serviceContext.groupToOrgCache;
  const orgToGroupCache = serviceContext.orgToGroupCache;
  const appIdToOrgIdCache = serviceContext.appIdToOrgIdCache;
  const db = dbConnections['core'].write;
  const resUtil = require('../resolvers/util.js')(serviceContext);
  const errors = require('../error')(config);
  const dalUtil = require('./util')(config, serviceContext);
  // the following cache key is used in core-eventing olp-organization-topic handler. Changing it requires an update to the handler.
  const DATA_ORGANIZATION = 'DataOrganization';
  const {
    encryptObject,
    decryptObject
  } = require('@veritone/core-server-base/util.js')();
  const decryptKeyDefault =
    'MIIEpAIBAAKCAQEAqCrrzfGp1gwgFk4raJeTaOt8SIkYuaEYctBpmldlgonbGySf/5QA5v1Vajnt9D+8+TBK3lz6hBC49LiBa+q9fJsWP9pkPEk6irT8T6UXZZk6bJacI';
  const decryptKeyConfig = 'config.s3.fileId';

  const jobTable = 'job_new';
  const engineListKey = 'EngineList';

  async function getBlacklistForOrg(context, args) {
    if (!args.organizationId) throw new Error('organizationId is required');
    // given the org we need to make an object with org ID,
    // engines, and categories.
    const cats = await getEngineCategoryBlacklist(args);
    const engs = await getEngineBlacklist(args);
    return {
      organizationId: args.organizationId,
      engines: engs,
      engineCategories: cats
    };
  }

  function getEngineCategoryBlacklist(args) {
    const sql = `
			SELECT
				oecb.engine_category_id AS id,
                ec.engine_category_name AS name,
                ec.engine_category_description AS description,
                ec.icon_class,
                ec.editable,
                ec.video_only,
                ec.order,
                ec.elastic,
                ec.search,
                ec.data_field,
                ec.created_date AS created_date_time,
                ec.updated_date AS modified_date_time,
                ec.library_identifier_types
			FROM
				${jobTable}.organization__engine_category_blacklist oecb
			JOIN
				${jobTable}.engine_category ec
          ON ec.engine_category_id = oecb.engine_category_id
			WHERE
				oecb.organization_id = $1
			`;

    return db.map(sql, [args.organizationId], mapper.mapBlacklist);
  }

  async function getEngineBlacklist(args) {
    const sql = `
        SELECT
            oeb.engine_id as id,
            oeb.organization_id as organization_id,
            e.engine_alias_id as alias_id,
            e.engine_category_id as category_id,
            e.engine_name as name,
            e.engine_description as description,
            e.engine_state as state,
            e.engine_currency as currency,
            e.deployment_model,
            e.owner_organization_id,
            e.is_public,
            e.price,
            e.price_dimension,
            e.rating,
            e.website,
            e.logo_path,
            e.icon_path,
            e.order,
            e.dependency,
            e.core_job_data,
            e.fields,
            e.validation,
            e.application_id,
            e.asset,
            e.creates_recording,
            e.library_required,
            e.deleted,
            e.created_date as created_date_time,
            e.updated_date as modified_date_time
        FROM
            ${jobTable}.organization__engine_blacklist oeb
        JOIN
            ${jobTable}.engine e ON e.engine_id = oeb.engine_id
        WHERE
            oeb.organization_id = $1`;

    const values = [args.organizationId];
    return db.map(sql, values, mapper.mapBlacklist);
  }

  async function getEngineWhitelist(context, args, existingTask = null) {
    // TODO use this util.checkId(args.id, false);
    if (!args.id) throw new Error('id required');
    const sql = `
        SELECT
            oeb.engine_id as id,
            oeb.organization_id as organization_id,
            e.engine_alias_id as alias_id,
            e.engine_category_id as category_id,
            e.engine_name as name,
            e.engine_description as description,
            e.engine_state as state,
            e.engine_currency as currency,
            e.deployment_model,
            e.owner_organization_id,
            e.is_public,
            e.price,
            e.price_dimension,
            e.rating,
            e.website,
            e.logo_path,
            e.icon_path,
            e.order,
            e.dependency,
            e.core_job_data,
            e.fields,
            e.validation,
            e.application_id,
            e.asset,
            e.creates_recording,
            e.library_required,
            e.deleted,
            e.created_date as created_date_time,
            e.updated_date as modified_date_time
        FROM
            ${jobTable}.organization__engine oeb
        JOIN
            ${jobTable}.engine e ON e.engine_id = oeb.engine_id
        WHERE
            oeb.organization_id = $1
    `;

    const dbRead = _.isNil(existingTask) ? db.tx : existingTask;

    const engines = await dbRead('getEngineWhitelist', async (t) => {
      return await t.map(sql, [args.id], mapper.mapEngine);
    });

    return {
      organizationId: args.id,
      engines,
      engineCategories: []
    };
  }

  async function setEngineWhitelist(context, org, whitelist) {
    const orgId = org.organizationId;
    if (!orgId) throw new Error('org ID required');
    if (!_.get(whitelist, 'engineIds'))
      throw new Error('whitelist engineIds required');

    let del = makeDeleteFromWhitelistQuery(orgId, null);
    const engineIds = await fixEngineIds(context, whitelist.engineIds);
    let add = makeAddToWhitelistQuery(orgId, engineIds);
    const values = add.values.concat(del.values);
    const sql = del.sql + '\n;' + add.sql;
    const res = await db.query(sql, values);
    return res;
  }

  function makeDeleteFromWhitelistQuery(orgId, engineIds) {
    // no engine IDs means all
    const values = [orgId];
    let engineOr = '';
    if (engineIds) {
      const conditions = [];
      engineOr = ' AND (';
      engineIds.forEach((id) => {
        values.push(id);
        conditions.push(`engine_id = \$${values.length}`);
      });
      engineOr += conditions.join(' OR ') + ')\n';
    }
    const sql = `
DELETE FROM ${jobTable}.organization__engine
WHERE
  organization_id = $1
  ${engineOr}
RETURNING engine_id
;
    `;
    return { sql, values };
  }

  function makeAddToWhitelistQuery(orgId, engineIds) {
    const values = [orgId];
    let sql = '';
    engineIds.forEach((id) => {
      values.push(id);
      sql += `
INSERT INTO ${jobTable}.organization__engine
(
  organization_id,
  engine_id
) VALUES (
  $1,
  \$${values.length}
) ON CONFLICT DO NOTHING;
`;
    });
    return { sql, values };
  }

  function makeAddToBlacklistQuery(orgId, engineIds, engineCategoryIds) {
    const values = [orgId];
    let sql = '';
    (engineIds || []).forEach((id) => {
      values.push(id);
      sql += `
INSERT INTO ${jobTable}.organization__engine_blacklist
(
  organization_id,
  engine_id
) VALUES (
  $1,
  \$${values.length}
)
;
`;
    });
    (engineCategoryIds || []).forEach((id) => {
      values.push(id);
      sql += `
INSERT INTO ${jobTable}.organization__engine_category_blacklist
(
  organization_id,
  engine_category_id
) VALUES (
  $1,
  \$${values.length}
)
;
`;
    });

    return { sql, values };
  }

  function makeDeleteFromBlacklistQuery(orgId, engineIds, engineCategoryIds) {
    const values = [orgId];
    let sql = '';
    (engineIds || []).forEach((id) => {
      values.push(id);
      sql += `
DELETE FROM
  ${jobTable}.organization__engine_blacklist
WHERE
  organization_id = $1 AND
  engine_id = \$${values.length}
RETURNING
  organization_id, engine_id
;
`;
    });
    (engineCategoryIds || []).forEach((id) => {
      values.push(id);
      sql += `
DELETE FROM
  ${jobTable}.organization__engine_category_blacklist
WHERE
  organization_id = $1 AND
  engine_category_id = \$${values.length}
RETURNING
  organization_id, engine_category_id
;
`;
    });

    return { sql, values };
  }

  async function setEngineBlacklist(context, org, blacklist) {
    const orgId = org.organizationId;
    if (!orgId) throw new Error('org ID required');
    if (
      !(_.get(blacklist, 'engineIds') || _.get(blacklist, 'engineCategoryIds'))
    ) {
      throw new Error('blacklist engineIds required');
    }
    const engineIds = await fixEngineIds(context, blacklist.engineIds);
    let { sql, values } = makeAddToBlacklistQuery(
      orgId,
      engineIds,
      blacklist.engineCategoryIds
    );

    if (engineIds) {
      values.push(orgId);
      sql =
        `
DELETE FROM
  ${jobTable}.organization__engine_blacklist
WHERE
  organization_id = \$${values.length}
;
      ` + sql;
    }

    if (blacklist.engineCategoryIds) {
      values.push(orgId);
      sql =
        `
DELETE FROM
  ${jobTable}.organization__engine_category_blacklist
WHERE
  organization_id = \$${values.length}
;
      ` + sql;
    }

    const res = await db.query(sql, values);
    return res;
  }

  async function fixEngineIds(context, engineIds) {
    if (!engineIds) return engineIds;
    const res = [];
    for (let i = 0; i < engineIds.length; i++) {
      const eng = await serviceContext.dal.engine.getEngine(context, {
        id: engineIds[i]
      });
      res.push(eng.internalId || eng.id);
    }
    return res;
  }

  async function addToEngineBlacklist(context, args) {
    if (
      (args.toAdd.engineIds && args.toAdd.engineCategoryIds) ||
      !(args.toAdd.engineIds || args.toAdd.engineCategoryIds)
    ) {
      throw new errors.InvalidInput({
        message: 'Provide engineId or engineCategoryId, but not both.'
      });
    }

    const engineIds = await fixEngineIds(context, args.toAdd.engineIds);

    const { sql, values } = makeAddToBlacklistQuery(
      args.toAdd.organizationId,
      engineIds,
      args.toAdd.engineCategoryIds
    );
    const res = await db.query(sql, values);
    const bl = await getBlacklistForOrg(context, {
      organizationId: args.toAdd.organizationId
    });

    if (!_.isEmpty(engineIds)) {
      await serviceContext.redisCache.markCacheDirty(engineListKey);
    }

    return bl;
  }

  async function deleteFromEngineBlacklist(context, args) {
    const input = args.toDelete;
    if (
      (input.engineIds && input.engineCategoryIds) ||
      !(input.engineIds || input.engineCategoryIds)
    ) {
      throw new errors.InvalidInput({
        message: 'Provide engineId or engineCategoryId, but not both.'
      });
    }
    const engineIds = await fixEngineIds(context, input.engineIds);
    const { sql, values } = makeDeleteFromBlacklistQuery(
      input.organizationId,
      engineIds,
      input.engineCategoryIds
    );
    const res = await db.query(sql, values);
    const bl = await getBlacklistForOrg(context, {
      organizationId: input.organizationId
    });

    if (!_.isEmpty(engineIds)) {
      await serviceContext.redisCache.markCacheDirty(engineListKey);
    }

    return bl;
  }

  async function addToEngineWhitelist(
    context,
    args,
    promisesRef = null,
    existingDbWrite = null
  ) {
    const engineIds = await fixEngineIds(context, args.toAdd.engineIds);
    const ids = _.uniq(engineIds);

    const { sql, values } = makeAddToWhitelistQuery(
      args.toAdd.organizationId,
      ids
    );

    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? db.tx
        : existingDbWrite.task;

    const res = await dbWrite('addToEngineWhitelist', async (t) => {
      return await t.query(sql, values);
    });

    // emit event when engine is whitelist in org
    if (res) {
      const emitEngineWhitelistEventRef = () =>
        serviceContext.coreJob.eventEmitter.emitEngineForOrgEvent(
          serviceContext.coreJob.eventEmitter.eventNames.engineAddToOrgList,
          {
            userInfo: _.get(context, 'requestContext.userInfo'),
            tokenInfo: _.get(context, 'requestContext.tokenInfo'),
            action: 'addToWhitelist',
            engineIds
          }
        );

      if (_.isArray(promisesRef)) {
        promisesRef.push(emitEngineWhitelistEventRef);
      } else {
        await emitEngineWhitelistEventRef();
      }

      if (!_.isEmpty(ids)) {
        await serviceContext.redisCache.markCacheDirty(engineListKey);
      }
    }

    return getEngineWhitelist(
      context,
      { id: args.toAdd.organizationId },
      _.get(existingDbWrite, 'task')
    );
  }

  async function deleteFromEngineWhitelist(
    context,
    args,
    promisesRef = null,
    existingDbWrite = null
  ) {
    if (!args.toDelete.engineIds) throw new Error('engineIds required');
    const engineIds = await fixEngineIds(context, args.toDelete.engineIds);
    const { sql, values } = makeDeleteFromWhitelistQuery(
      args.toDelete.organizationId,
      engineIds
    );

    const dbWrite =
      _.isEmpty(existingDbWrite) || _.isNil(existingDbWrite.task)
        ? db.tx
        : existingDbWrite.task;

    const res = await dbWrite('deleteFromEngineWhitelist', async (t) => {
      return await t.query(sql, values);
    });

    if (res) {
      const emitEngineForOrgEventRef = () =>
        serviceContext.coreJob.eventEmitter.emitEngineForOrgEvent(
          serviceContext.coreJob.eventEmitter.eventNames
            .engineRemoveFromOrgList,
          {
            userInfo: _.get(context, 'requestContext.userInfo'),
            tokenInfo: _.get(context, 'requestContext.tokenInfo'),
            action: 'removeFromWhitelist',
            engineIds
          }
        );

      if (_.isArray(promisesRef)) {
        promisesRef.push(emitEngineForOrgEventRef());
      } else {
        await emitEngineForOrgEventRef();
      }

      await serviceContext.redisCache.markCacheDirty(engineListKey);
    }

    return getEngineWhitelist(
      context,
      { id: args.toDelete.organizationId },
      _.get(existingDbWrite, 'task')
    );
  }

  // get the org ID for a given group.
  // at this point, here is the only place in the code we care about groupId
  // because the legacy source "acl" is a group.
  // later, if the need arises, we can move this code to a common utility file.
  async function getOrgIdForGroupId(groupId) {
    let orgId = groupToOrgCache.get(groupId);
    if (_.isNil(orgId)) {
      const sql = `
SELECT kvp FROM sso_group WHERE group_id = $1
      `;

      const rows = await dbConnections['sso'].read.map(sql, [groupId], (row) =>
        _.toString(_.get(row, 'kvp.organizationId'))
      );
      if (rows.length) {
        orgId = rows[0];
        groupToOrgCache.set(groupId, orgId);
      }
    }
    return orgId;
  }

  async function getGroupIdForOrgId(orgId) {
    if (_.isNil(orgId)) return orgId;
    if (!(_.isString(orgId) || _.isNumber(orgId))) {
      throw new Error(
        'getGroupIdForOrgId got invalid argument:  ' + JSON.stringify(orgId)
      );
    }
    let groupId = orgToGroupCache.get(orgId);
    if (_.isNil(groupId)) {
      const sql = `
SELECT
  group_id
FROM sso_group
WHERE kvp->>'organizationId' = $1::text`;
      const rows = await dbConnections['sso'].read.map(sql, [orgId], (row) => {
        if (!row.group_id)
          throw new Error(
            `wrong group id result: ${JSON.stringify(row, null, 2)}`
          );
        return row.group_id;
      });
      if (rows.length) {
        groupId = rows[0];
        orgToGroupCache.set(orgId, groupId);
      }

      if (!groupId) {
        logger.error('null groupId' + JSON.stringify(rows), orgId);
        throw new errors.NotAllowed({
          data: { objectId: orgId, objectType: 'Organization' }
        });
      }
    }
    return groupId;
  }

  // query for count of an org's active users
  // excluding users that have a private role
  async function getUserCountForOrg(orgId) {
    const sql = `
    SELECT COUNT(*) AS total
    FROM sso_user u
    JOIN sso_user__sso_group ug ON u.user_id = ug.user_id
    JOIN sso_group g ON ug.group_id = g.group_id
    LEFT JOIN (
    	SELECT DISTINCT user_id, ur.application_id
      FROM sso_user_role ur
      JOIN role r ON r.role_id = ur.role_id
      WHERE r.is_private IS TRUE
      AND user_id IS NOT NULL
    ) sur ON sur.user_id = u.user_id AND sur.application_id = g.application_id
    WHERE sur.user_id IS NULL
    AND g.kvp->>'organizationId' = $1::text
    AND u.status = 'active'`;

    const rows = await dbConnections['sso'].read.map(
      sql,
      [orgId],
      (row) => row
    );

    return rows[0].total;
  }

  async function getMediaUsageMs(orgId) {
    const mediaUsage = await serviceContext.redisCache.get(
      'mediaUsageMs',
      `${orgId}-${moment().month() + 1}-${moment().year()}`
    );
    return mediaUsage;
  }

  async function getOrgIdFromAppId(applicationId) {
    let orgId = appIdToOrgIdCache.get(applicationId);
    if (orgId) return orgId;

    const sql = `
      SELECT
        kvp->>'organizationId'::text AS id
      FROM
        sso_group
      WHERE
        application_id = $1
    `;
    const res = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [applicationId],
      (row) => row.id
    );
    if (!res.length) {
      throw new errors.NotFound({
        data: { objectId: applicationId, objectType: 'Organization' }
      });
    }
    orgId = res[0];
    if (_.isNil(orgId)) {
      logger.error(
        `(getOrgIdFromAppId) Unable to get organizationId by applicationId '${applicationId}'`
      );
      return orgId;
    }

    appIdToOrgIdCache.set(applicationId, orgId);
    appIdToOrgIdCache.set(orgId, applicationId);
    return orgId;
  }

  /**
   * Get an organization by ID.
   * Hidden internal trick:  you can also pass an application ID and
   * the API will return the organization corresponding to the
   * organization.
   */
  async function getOrganization(context, args, skipCache) {
    util.checkId(args.id, false, true);

    if (_.isString(args.id) && validator.isUUID(args.id)) {
      // it's actually an application ID
      const orgId = await getOrgIdFromAppId(args.id);
      // swap IDs
      args.id = orgId;
    }

    // check L1 cache
    let res;
    if (skipCache !== true) {
      res = await redisCache.get(DATA_ORGANIZATION, args.id);
    }
    if (!res) {
      // get from DB
      const orgs = await getOrganizations(context, args);
      if (!(orgs.records && orgs.records.length)) {
        throw new errors.NotFound({
          data: { objectId: args.id, objectType: 'Organization' }
        });
      }
      res = orgs.records[0];
      await redisCache.set(DATA_ORGANIZATION, _.toString(args.id), res);
    }
    return res;
  }

  async function getMyOrganizations(context, args) {
    if (!validator.isUUID(args.userId)) {
      throw new errors.InvalidInput({
        message: `A user ID must be a valid UUID: ${args.userId}`
      });
    }
    const orgIdGuid = await getOrganizationIdAndGuidForUser(args.userId);
    let orgIdGuidMap = new Map();
    let orgIdPriorityMap = new Map();
    orgIdGuid.forEach((pair) => orgIdGuidMap.set(pair.id, pair.guid));
    orgIdGuid.forEach((pair) => orgIdPriorityMap.set(pair.id, pair.priority));
    args.id = [...orgIdGuidMap.keys()];
    const res = await getOrganizations(context, args);
    res.records.forEach((row) => {
      row.guid = orgIdGuidMap.get(row.id);
      row.priority = orgIdPriorityMap.get(row.id);
      if (_.isNil(row.organizationGuid)) {
        row.organizationGuid = row.guid;
      }
    });
    return res;
  }

  async function getOrganizationIdAndGuidForUser(userId) {
    const sql = `
      SELECT
        g.kvp->>'organizationId'::text AS id,
        g.application_id AS guid,
        ug.priority AS priority
      FROM
        sso_group g
      JOIN sso_user__sso_group ug ON g.group_id = ug.group_id
      WHERE
        ug.user_id = $1
    `;
    const res = await serviceContext.dbConnections['sso'].read.map(
      sql,
      [userId],
      (row) => {
        return {
          id: parseInt(row.id),
          guid: row.guid,
          priority: parseInt(row.priority)
        };
      }
    );
    return res;
  }

  async function getBusinessUnit(organizationId) {
    let sql = `SELECT business_unit FROM organization WHERE organization_id = $1`;
    const rows = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      [organizationId],
      mapper.mapOrganization
    );
    return rows.length > 0 ? rows[0].businessUnit : null;
  }

  async function getOrganizations(context, args) {
    const offset = args.offset || 0;

    let renamed = false;
    const renamedSql = `SELECT EXISTS (SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='organization' AND column_name='monthly_bytehrs_total')`;
    await serviceContext.dbConnections['media_platform'].read
      .query(renamedSql)
      .then((dbResult) => {
        if (!_.isObject(dbResult) || !_.isArray(dbResult)) {
          throw new Error('missing dbResult array');
        }

        renamed = dbResult[0].exists;
      });

    const saFields = args.isSuperAdmin
      ? `,
      o.billing_plan_id,
      o.billing_dirty,
      o.billing_updated_datetime,
      o.monthly_processing_hours_total,
      o.monthly_processing_bytes_total,
      o.monthly_processing_media_hours,
      o.current_storage_bytes,
      ${renamed ? 'o.monthly_bytehrs_total' : 'o.monthly_gbhr_total'},
      o.monthly_processing_lastran,
      o.monthy_storage_lastran,
      o.monthly_current_charge,
      ${renamed ? 'o.last_month_bytehrs_total' : 'o.last_month_gbhr_total'},
      o.monthly_processing_media_hours,
      o.monthly_processing_tasks,
      o.monthly_processing_bytes,
      o.storage_last_updated_timestamp
      `
      : '';
    let sql = `SELECT
                o.organization_id,
                o.organization_guid,
                o.organization_name,
                o.business_unit,
                o.kvp,
                o.date_created,
                o.date_modified,
                o.seat_limit,
                o.status,
                o.max_aiware_nodes,
                o.max_aiware_clusters,
                o.export_formats AS engine_category_export_formats,
                array_agg(t.organization_type_name) as organization_type,
                o.remaining_budget,
                o.is_limit_enforced,
                o.is_hub_managed,
                o.require_open_id,
                o.retention_days${saFields}
            FROM organization o
            LEFT JOIN organization_organization_type ot
              ON o.organization_id = ot.organization_id
            LEFT JOIN organization_type t
              ON ot.organization_type_id = t.organization_type_id`;
    let sqlWhere = [];
    let sqlParams = [];
    let sqlWhereAnd = [];

    if (args.id) {
      if (!_.isArray(args.id)) {
        args.id = [args.id];
      }

      for (let i = 0; i < args.id.length; i++) {
        let orgId = args.id[i];
        // if user passed an invalid ID, just return an empty list
        // without bothering to query DB
        try {
          util.checkId(orgId, false, true);
        } catch (err) {
          return {
            count: 0,
            records: [],
            offset: args.offset,
            limit: args.limit
          };
        }
        if (_.isString(orgId) && validator.isUUID(orgId)) {
          // it's actually an application ID
          try {
            orgId = await getOrgIdFromAppId(orgId);
          } catch (err) {
            // if the UUID could not be mapped to an org,
            // just return an empty list without bothering to query DB.
            return {
              count: 0,
              records: [],
              offset: args.offset,
              limit: args.limit
            };
          }
        }

        sqlParams.push(orgId);
        sqlWhere.push('o.organization_id = $' + sqlParams.length);
      }
    }

    util.addSqlWhere(
      'o.is_hub_managed',
      args.isHubManaged,
      sqlWhereAnd,
      sqlParams
    );

    util.makeLikeClause(
      'o.organization_name',
      args.name,
      sqlWhereAnd,
      sqlParams,
      args.nameMatch || 'exact',
      false
    );

    if (_.isString(args.kvpProperty) && args.kvpProperty.length) {
      args.kvpProperty = '{' + args.kvpProperty.replace(/\./g, ',') + '}';
      sqlParams.push(args.kvpProperty);
      if (_.isString(args.kvpValue) && args.kvpValue.length) {
        sqlParams.push(args.kvpValue);
        sqlWhere.push(
          `o.kvp#>>$${sqlParams.length - 1} = $${sqlParams.length}`
        );
      } else {
        sqlWhere.push(`o.kvp#>>$${sqlParams.length} is not null`);
      }
    }

    util.addSqlWhere('o.status', args.status, sqlWhereAnd, sqlParams);

    if (sqlWhere.length) {
      sql += ' WHERE (' + sqlWhere.join(' OR ') + ')';
    }

    if (sqlWhereAnd.length) {
      if (sqlWhere.length) {
        sql += ` AND ${sqlWhereAnd.join(' AND ')}`;
      } else {
        sql += ` WHERE ${sqlWhereAnd.join(' AND ')}`;
      }
    }

    sql += ' GROUP BY o.organization_id ORDER BY o.organization_name';

    if (Number.isInteger(args.limit)) {
      sql += ` LIMIT ${args.limit}`;
    }
    if (Number.isInteger(args.offset)) {
      sql += ` OFFSET ${args.offset}`;
    }

    const rows = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sqlParams,
      mapper.mapOrganization
    );
    return util.toPage(args, rows);
  }

  function bypassVisibilityCheck(context) {
    if (resUtil.isSuperAdmin(context._authInfo)) {
      return true;
    }

    const apiTokenType = resUtil.getTokenType(context);
    return ['apikey', 'internal', 'engineJWT'].includes(apiTokenType);
  }

  async function getOrganizationIntegrationConfig(context, args) {
    const { organizationId, integrationId } = args;

    // Value and data type validation
    util.checkId(organizationId, false, true);
    if (!_.isString(integrationId)) {
      throw new errors.InvalidInput({
        message: 'integrationId must be string'
      });
    }

    const where = [];
    const values = [];

    util.addSqlWhere('organization_id', organizationId, where, values);
    util.addSqlWhere('integration_id', integrationId, where, values);

    if (!bypassVisibilityCheck(context)) {
      util.addSqlWhere('user_visible', true, where, values);
    }

    const sql = `
      SELECT
        organization_id,
        integration_id,
        json as config,
        user_visible
      FROM organization_integration
      WHERE ${where.join(' AND ')}
    `;
    const integrationConfig = await dbConnections['media_platform'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    if (!integrationConfig || _.isEmpty(integrationConfig)) {
      throw new errors.NotFound({
        data: { objectId: args.integrationId, objectType: 'IntegrationConfig' }
      });
    }

    return _.get(integrationConfig, '0');
  }

  function setOrganizationIntegrationConfig(context, args) {
    const { organizationId, integrationId, userVisible, config } = args.input;

    // Value and data type validation
    util.checkId(organizationId, false, true);
    if (!_.isString(integrationId)) {
      throw new errors.InvalidInput({
        message: 'integrationId must be string',
        data: {
          objectType: 'integrationId',
          objectId: integrationId
        }
      });
    }
    if (!resUtil.isSuperAdmin(context._authInfo)) {
      throw new errors.NotAllowed({
        message: 'Only superadmin can set Organization Integration Config.'
      });
    }

    const sql = `
      INSERT INTO organization_integration (
        organization_id,
        integration_id,
        json,
        user_visible
      )
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (organization_id, integration_id)
		DO UPDATE SET "json" = $3, user_visible = $4
		RETURNING organization_id, integration_id, "json" as config, user_visible`;

    return dbConnections['media_platform'].write.one(
      sql,
      [organizationId, integrationId, config, userVisible],
      mapper.camelizeRootKeys
    );
  }

  async function deleteOrganizationIntegrationConfig(context, args) {
    const { organizationId, integrationId } = args.input;

    // Validation
    util.checkId(organizationId, false, true);
    if (!_.isString(integrationId)) {
      throw new errors.InvalidInput({
        message: 'integrationId must be string'
      });
    }
    if (!resUtil.isSuperAdmin(context._authInfo)) {
      throw new errors.NotAllowed({
        message: 'Only superadmin can set Organization Integration Config.'
      });
    }

    const sql = `
      DELETE FROM organization_integration
      WHERE
          organization_id = $1
      AND integration_id = $2
      `;
    const values = [organizationId, integrationId];

    await dbConnections['media_platform'].write.query(sql, values);

    return {
      organizationId: organizationId,
      integrationId: integrationId,
      message: 'Delete integration config successfully!'
    };
  }

  function validateOrgOktaChanges(oktaConfig, oldOktaConfig) {
    const nowEnabled =
      (_.isNil(oktaConfig.oktaAuthenticationEnabled) &&
        oldOktaConfig.oktaAuthenticationEnabled) ||
      oktaConfig.oktaAuthenticationEnabled === true;
    if (
      !nowEnabled &&
      (oktaConfig.clientSecret || oktaConfig.clientId || oktaConfig.oktaDomain)
    ) {
      throw new errors.InvalidInput({
        message:
          'oktaDomain, clientId, and clientSecret can only be set if Okta integration is ' +
          'being enabled or already has been enabled.',
        data: {
          oktaConfiguration: oktaConfig
        }
      });
    }
  }

  async function setOrgOktaConfiguration(context, organization, oktaConfig) {
    const clientInfo = resUtil.getClientInfo(context);

    // we do not allow superadmin to modify customer organization Okta config.
    if (_.toString(clientInfo.org) !== _.toString(organization.id)) {
      throw new errors.NotAllowed({
        message:
          'Only an organization administrator can modify Okta integration configuration.',
        data: {
          authenticatedOrganizationId: clientInfo.org,
          targetOrganizationId: organization.id,
          userId: clientInfo.id,
          userName: clientInfo.userName
        }
      });
    }
    const oldOktaConfig = await getOrgOktaConfiguration(context, organization);
    validateOrgOktaChanges(oktaConfig, oldOktaConfig);

    const oktaEnabled = oktaConfig.oktaAuthenticationEnabled;
    const loginAlias = oktaConfig.loginAlias;
    // only update KVP if we are changing the enabled flag in this update
    if (!_.isNil(oktaEnabled) || loginAlias) {
      // we have to set the entire JSON because it's a JSON type column and
      // not JSONB, so jsonb_set isn't available.
      if (!_.isNil(oktaEnabled)) {
        _.set(
          organization,
          'kvp.features.oktaAuthentication.enabled',
          oktaEnabled
        );
      }
      if (loginAlias) {
        _.set(
          organization,
          'kvp.features.oktaAuthentication.loginAlias',
          loginAlias
        );
      }

      // set in org KVP
      const sql = `
UPDATE organization SET kvp = $2
WHERE organization_id = $1
RETURNING organization_id AS id
      `;

      const dbres = await serviceContext.dbConnections[
        'media_platform'
      ].write.query(sql, [organization.id, organization.kvp]);
    }
    // if Okta is enabled, save the credentials
    if (
      oktaConfig.clientSecret ||
      oktaConfig.clientId ||
      oktaConfig.oktaDomain
    ) {
      await setOktaCredentials(
        context,
        organization,
        oktaConfig,
        oldOktaConfig
      );
    }
    return oktaConfig;
  }

  async function setOktaCredentials(
    context,
    organization,
    oktaConfig,
    oldOktaConfig
  ) {
    // if we're not setting both client secret and client ID,
    // get the old values from the db to make sure we don't clear them.
    if (
      !(oktaConfig.clientSecret && oktaConfig.clientId && oktaConfig.oktaDomain)
    ) {
      if (!oktaConfig.clientSecret)
        oktaConfig.clientSecret = oldOktaConfig.clientSecret;
      if (!oktaConfig.clientId) oktaConfig.clientId = oldOktaConfig.clientId;
      if (!oktaConfig.oktaDomain)
        oktaConfig.oktaDomain = oldOktaConfig.oktaDomain;
    }

    // get "created by" user or token ID
    const createdBy = resUtil.getClientInfo(context).id;

    // this is the unique key in the db, used in both credential_name and external_credential_id columns
    const credentialName =
      _.get(serviceContext, 'config.okta.credentialName', 'okta-credential') +
      '.' +
      organization.id;

    const key =
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(serviceContext, decryptKeyConfig, decryptKeyDefault);
    const credentials = {
      clientId: oktaConfig.clientId,
      clientSecret: oktaConfig.clientSecret,
      oktaDomain: oktaConfig.oktaDomain
    };
    // encrypt the credentials
    const cr = encryptObject(credentials, key);
    // save the encrypted credentials in the db using upsert
    const sql = `
INSERT INTO external_credential (
  service_type,
  credential_name,
  credentials_ciphertext,
  external_credential_id,
  organization_id,
  created_by
) VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  $6
)
ON CONFLICT (external_credential_id) DO
UPDATE SET credentials_ciphertext = $3
WHERE external_credential.service_type = $1 AND external_credential.credential_name = $2
    `;
    const dbrs = await serviceContext.dbConnections['sso'].write.query(sql, [
      'okta',
      credentialName,
      cr,
      credentialName,
      organization.id,
      createdBy
    ]);
  }

  async function getOktaCredentials(context, organization) {
    const credentialName =
      _.get(serviceContext, 'config.okta.credentialName', 'okta-credential') +
      '.' +
      organization.id;

    const decryptKey =
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(serviceContext, decryptKeyConfig, decryptKeyDefault);

    const sql = `
SELECT
  credentials_ciphertext
FROM
  external_credential
WHERE
  service_type = $1 AND
  credential_name = $2
ORDER BY created_date DESC
LIMIT 1
    `;

    const dbrs = await serviceContext.dbConnections['sso'].read.map(
      sql,
      ['okta', credentialName],
      (row) => row.credentials_ciphertext
    );

    if (!dbrs.length) return null;

    const cipherText = dbrs[0];
    return decryptObject(cipherText, decryptKey);
  }

  async function getOrgOktaConfiguration(context, organization) {
    if (!organization.kvp) {
      // kvp isn't hydrated - retrieve from db now
      const torg = await getOrganization(context, { id: organization.id });
      organization.kvp = torg.kvp;
    }
    let loginAlias;
    const enabled = _.get(
      organization,
      'kvp.features.oktaAuthentication.enabled',
      false
    );
    let clientId, clientSecret, oktaDomain;
    if (enabled) {
      loginAlias = _.get(
        organization,
        'kvp.features.oktaAuthentication.loginAlias'
      );
      // only if it's enabled do we get the client ID and secret
      // from the database
      try {
        const data = await getOktaCredentials(context, organization);

        if (data) {
          clientId = data.clientId;
          clientSecret = data.clientSecret;
          oktaDomain = data.oktaDomain;
        }
      } catch (error) {
        // on decrypt error, just warn and continue.
        logger.error(
          'Error retrieving okta credentials for ' +
            organization.id +
            ':  ' +
            error
        );
      }
    }
    return {
      oktaAuthenticationEnabled: enabled,
      oktaDomain,
      clientId,
      clientSecret,
      loginAlias
    };
  }

  async function getDefaultAddToIndexForOrg(context, orgId) {
    const org = await getOrganization(context, {
      id: orgId
    });

    // defaulted in code if there is no org value
    return _.get(org, 'jsondata.features.indexing.tdoDefault', true);
  }

  async function getRolesForOrg(options, context) {
    // get apps belonging to org and return the app keys
    const orgApps = await serviceContext.dal.application.getApplications({
      organizationId: options.organizationId,
      all: true
    });

    // get the app ids
    const orgAppIds = orgApps.records.map(function getAppKey(app) {
      return app.applicationId;
    });

    const queryOpts = {
      // organizationIds: `${options.organizationId}`,
      appIds: orgAppIds,
      isAppEventRole: options.isAppEventRole
    };

    const orgRoles = await getRoles(queryOpts, context);

    return dalUtil.validateRoles(context, orgRoles, options.organizationId);
  }

  function getRoles(options, context) {
    let sql = `
      SELECT 
        r.role_id,
        r.role_name,
        r.role_description,
        a.application_key AS app_name,
        r.application_id,
        r.permissions,
        r.organization_id
      FROM role r
      LEFT JOIN application a ON r.application_id = a.application_id
    `;
    const sqlWhere = [];
    const sqlParams = [];

    // default behavior is to exclude private roles unless requestor is a super-admin
    if (!resUtil.isSuperAdmin(context._authInfo)) {
      sqlWhere.push('r.is_private IS NOT TRUE');
    }

    if (_.isString(options.id) && options.id.length) {
      sqlParams.push(options.id);
      sqlWhere.push('r.role_id = $' + sqlParams.length);
    }
    if (_.isString(options.name) && options.name.length) {
      sqlParams.push(options.name);
      sqlWhere.push('r.role_name = $' + sqlParams.length);
    }

    if (_.isString(options.organizationIds) && options.organizationIds.length) {
      const trimmedOrgIds = dalUtil.splitTrim(options.organizationIds, ',');

      if (trimmedOrgIds.length) {
        const inClause = [];
        trimmedOrgIds.forEach(function setOrgIdInClause(orgId) {
          sqlParams.push(orgId);
          inClause.push('$' + sqlParams.length);
        });

        sqlWhere.push(
          '(r.organization_id IS NULL OR r.organization_id IN (' +
            inClause.join(',') +
            '))'
        );
      } else {
        sqlWhere.push('r.organization_id IS NULL');
      }
    }

    if (_.isArray(options.appKeys) && options.appKeys.length) {
      sqlParams.push(options.appKeys);
      sqlWhere.push(`a.application_key = ANY($${sqlParams.length}::text[])`);
    }

    if (_.isArray(options.appIds) && options.appIds.length) {
      sqlParams.push(options.appIds);
      sqlWhere.push(`r.application_id = ANY($${sqlParams.length}::uuid[])`);
    }

    if (!_.isNil(options.isAppEventRole)) {
      util.addSqlWhere(
        'r.is_app_event_role',
        options.isAppEventRole,
        sqlWhere,
        sqlParams
      );
    }

    if (sqlWhere.length) {
      sql += ' WHERE ' + sqlWhere.join(' AND ');
    }

    sql += ' ORDER BY r.organization_id, a.application_key, r.role_name';

    return serviceContext.dbConnections['sso'].read.map(
      sql,
      sqlParams,
      row => mapper.mapRole(row)
    );
  }

  async function setOrgRemainingBudget(
    context,
    orgId,
    remainingBudget,
    isLimitEnforced = null
  ) {
    if (_.isNil(orgId)) {
      throw new errors.InvalidInput({ message: 'OrganizationId is required' });
    }

    if (_.isNil(remainingBudget) || !_.isNumber(remainingBudget)) {
      throw new errors.InvalidInput({
        message: 'Remaining budget is required and should be a number'
      });
    }

    const { sql, values } = util.makeUpdateSql(
      'organization',
      {
        remaining_budget: remainingBudget,
        is_limit_enforced: isLimitEnforced
      },
      {
        organization_id: 'id',
        remaining_budget: null,
        is_limit_enforced: null
      },
      `organization_id  = ${orgId}`
    );

    const res = await serviceContext.dbConnections['media_platform'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    // Refresh the redis cache for organization
    if (!_.isNil(res) && !_.isNil(res.id)) {
      await redisCache.clear(DATA_ORGANIZATION, res.id);
    }

    return res;
  }

  async function incrementMonthlyCharge(_context, orgId, incrementValue) {
    if (_.isNil(orgId)) {
      throw new errors.InvalidInput({ message: 'OrganizationId is required' });
    }

    if (_.isNil(incrementValue) || !_.isNumber(incrementValue)) {
      throw new errors.InvalidInput({
        message: 'incrementValue is required and should be a number'
      });
    }

    const sql = /*sql*/ `
      UPDATE organization SET monthly_current_charge = monthly_current_charge + $2
      WHERE organization_id = $1
      RETURNING organization_id as id, monthly_current_charge;
    `;

    const res = await serviceContext.dbConnections['media_platform'].write.one(
      sql,
      [orgId, incrementValue],
      mapper.camelizeRootKeys
    );

    // Refresh the redis cache for organization
    if (!_.isNil(res) && !_.isNil(res.id)) {
      await redisCache.clear(DATA_ORGANIZATION, res.id);
    }
    return res;
  }

  async function updateOrganizationBilling(args, context) {
    let orgId = args.organizationId;
    if (args.targetOrganizationId) {
      const targetId = parseInt(args.targetOrganizationId, 10);
      if (
        resUtil.isSuperAdmin(context._authInfo) ||
        targetId === args.organizationId
      ) {
        orgId = targetId;
      } else {
        throw new errors.NotAllowed({
          message:
            'The authenticated user or token does not have privileges ' +
            'to modify the accessible applications list.',
          data: {
            type: 'updateOrganizationBilling',
            fields: ['targetApplicationId'],
            rights: util.listRights(context._authInfo)
          }
        });
      }
    }
    if (args.planId.length > 7) {
      throw new errors.InvalidInput({
        message: 'planId exceeds the maximum length of 7',
        data: {
          type: 'updateOrganizationBilling',
          fields: ['planId']
        }
      });
    }
    const { sql, values } = util.makeUpdateSql(
      'organization',
      {
        billing_plan_id: args.planId,
        billing_dirty: true
      },
      {
        organization_id: null,
        billing_plan_id: 'plan_id'
      },
      `organization_id  = ${orgId}`
    );

    const res = await serviceContext.dbConnections['media_platform'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    // Refresh the redis cache for organization
    if (!_.isNil(res) && !_.isNil(res.organizationId)) {
      await redisCache.clear(DATA_ORGANIZATION, res.organizationId);
    }

    return res;
  }

  async function updateOrganizationKvp(id, kvp, context) {
    const { sql, values } = util.makeUpdateSql(
      'organization',
      {
        kvp: kvp
      },
      {
        organization_id: null
      },
      `organization_id  = ${id}`
    );

    const res = await serviceContext.dbConnections['media_platform'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    // Refresh the redis cache for organization
    if (!_.isNil(res) && !_.isNil(res.organizationId)) {
      await redisCache.clear(DATA_ORGANIZATION, res.organizationId);
    }

    return res;
  }

  async function incrementMonthlyProcessing(context, args) {
    const orgId = args.orgId || args.organizationId;
    const monthlyProcessingMediaHours = _.get(
      args,
      'orgMonthlyProcessingMediaHours',
      0
    );
    const monthlyProcessingHoursTotal = _.get(
      args,
      'orgMonthlyProcessingHoursTotal',
      0
    );
    const monthlyProcessingTasks = _.get(args, 'orgMonthlyProcessingTasks', 0);
    const monthlyProcessingBytes = _.get(args, 'orgMonthlyProcessingBytes', 0);

    if (_.isNil(orgId)) {
      throw new errors.InvalidInput({ message: 'OrganizationId is required' });
    }

    const sql = /*sql*/ `
      UPDATE organization 
      SET   monthly_processing_media_hours = monthly_processing_media_hours + $2,
            monthly_processing_hours_total = monthly_processing_hours_total + $3,
            monthly_processing_tasks = monthly_processing_tasks + $4,
            monthly_processing_bytes = monthly_processing_bytes + $5
      WHERE organization_id = $1
      RETURNING organization_id as id;
    `;

    const res = await serviceContext.dbConnections['media_platform'].write.one(
      sql,
      [
        orgId,
        monthlyProcessingMediaHours,
        monthlyProcessingHoursTotal,
        monthlyProcessingTasks,
        monthlyProcessingBytes
      ],
      mapper.camelizeRootKeys
    );

    // Refresh the redis cache for organization
    if (!_.isNil(res) && !_.isNil(res.id)) {
      await redisCache.clear(DATA_ORGANIZATION, res.id);
    }

    return res;
  }

  async function setLastAssetUpdatedDate(_context, orgId, dateMoment) {
    if (_.isNil(orgId)) {
      return;
    }

    const sql = /*sql*/ `
      UPDATE organization SET storage_last_updated_timestamp = $2
      WHERE organization_id = $1
      AND storage_last_updated_timestamp < monthy_storage_lastran;
    `;

    const res = await serviceContext.dbConnections['media_platform'].write.any(
      sql,
      [orgId, dateMoment.toISOString()],
      mapper.camelizeRootKeys
    );
    return res;
  }

  async function allowedToEditOrganization(context, organizationId) {
    const organization = await getOrganization(context, {
      id: organizationId
    });

    // 404 - Not found
    if (_.isEmpty(organization)) {
      throw new errors.NotFound({
        data: {
          objectId: organizationId,
          objectType: 'Organization'
        }
      });
    }

    const requestor = resUtil.getClientInfo(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const isOrgAdmin = resUtil.isOrgAdmin(context._authInfo);
    const isOrgMember = requestor.org === organization.id;

    // Not authorized to edit this application
    if (!isSuperAdmin && !(isOrgAdmin && isOrgMember)) {
      throw new errors.NotAllowed({
        message:
          'The authenticated user or token does not have privileges ' +
          'to update this organization.'
      });
    }

    return organization;
  }

  async function setUserDefaultOrganization(context, args) {
    const { defaultOrganizationId } = args;
    const userId = _.get(context._authInfo, 'userId');

    // get groupId for the update statement
    const sqlOrgGuid = `
      SELECT sg.group_id
      FROM public.sso_group sg
      JOIN public.sso_user__sso_group sug ON sug.group_id = sg.group_id 
      WHERE kvp ->> 'organizationId' = $1 AND sug.user_id = $2
    `;

    let res;
    try {
      res = await serviceContext.dbConnections['sso'].read.one(
        sqlOrgGuid,
        [defaultOrganizationId, userId],
        mapper.camelizeRootKeys
      );
    } catch (err) {
      logger.error(err);
      throw new errors.AuthorizationError({
        data: {
          objectId: defaultOrganizationId
        }
      });
    }

    const groupId = _.get(res, 'groupId');

    // set default org
    const sqlUpdate = `
    WITH cte AS (
      SELECT 
          user_id,
          group_id,
          priority,
          (ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY CASE WHEN group_id = '${groupId}' THEN -1 ELSE priority END))-1 AS order
      FROM public.sso_user__sso_group 
      WHERE user_id = '${userId}'
    )
    UPDATE public.sso_user__sso_group SET priority = cte.order
    FROM cte
    WHERE public.sso_user__sso_group.group_id = cte.group_id 
      AND public.sso_user__sso_group.user_id = cte.user_id
    RETURNING *;
    `;

    let result;
    try {
      result = await serviceContext.dbConnections['sso'].write.many(
        sqlUpdate,
        [],
        mapper.camelizeRootKeys
      );
    } catch (err) {
      throw new errors.InternalServerError(err);
    }

    const org = await getOrganization(context, { id: defaultOrganizationId });
    if (Array.isArray(result)) {
      for (const r of result) {
        if (r.group_id === groupId) {
          // TODO: this should be moved to OrganizationInfo resolver?
          org.priority = r.priority;
        }
      }
    }
    return org;
  }

  async function getLoginConfiguration(graphqlArgs, internalArgs = {}) {
    // internalArgs are used by resolvers and other internal function calls that may need to
    // search by organizationId instead of slug; slug is the only permissible input by graphql
    if (_.isNil(graphqlArgs.slug) && _.isNil(internalArgs.organizationId)) {
      throw new errors.InternalServerError({
        message: 'getLoginConfiguration: slug or organizationId is required'
      });
    }

    const sqlWhere = [];
    const sqlParams = [];

    let sql = `
      SELECT
          lc.name,
          lc.slug,
          lc.logo,
          lc.login_button_style,
          lc.organization_id,
          lc.enabled,
          lc.hide_veritone_branding,
          o.organization_guid,
          o.organization_name,
          o.kvp
      FROM
          public.login_configuration lc
      LEFT JOIN 
          public.organization o ON lc.organization_id = o.organization_id
    `;

    if (!_.isNil(graphqlArgs.slug)) {
      util.addSqlWhere('lc.slug', graphqlArgs.slug, sqlWhere, sqlParams);
    }

    if (!_.isNil(internalArgs.organizationId)) {
      util.addSqlWhere(
        'o.organization_id',
        internalArgs.organizationId,
        sqlWhere,
        sqlParams
      );
    }

    if (_.isEmpty(sqlWhere) || _.isEmpty(sqlParams)) {
      throw new errors.InternalServerError({
        message: 'getLoginConfiguration: no where clauses added'
      });
    }

    sql += ' WHERE ' + sqlWhere.join(' AND ');

    const rows = await serviceContext.dbConnections['media_platform'].read.map(
      sql,
      sqlParams,
      mapper.mapLoginConfiguration
    );

    return rows.length < 1 ? null : rows[0];
  }

  function _validateAndMergeLoginConfig(inputLoginConfig, oldLoginConfig) {
    const intersection = _.mergeWith(
      {},
      inputLoginConfig,
      oldLoginConfig,
      (newObjValue, srcValue) => {
        if (!_.isNil(newObjValue) && _.isNil(srcValue)) {
          return newObjValue;
        }
        if (!_.isNil(newObjValue) && !_.isNil(srcValue)) {
          return newObjValue;
        }
        return srcValue;
      }
    );

    const missingFields = [];

    if (_.isNil(intersection.name)) {
      missingFields.push('name');
    }

    if (_.isNil(intersection.slug)) {
      missingFields.push('slug');
    }

    if (!_.isEmpty(missingFields)) {
      throw new errors.InvalidInput({
        message:
          'Missing one or more fields for setting login configuration for the first time.',
        data: {
          missingFields
        }
      });
    }

    return intersection;
  }

  async function setLoginConfiguration(
    context,
    organization,
    inputLoginConfig
  ) {
    util.checkId(organization.id, false, true);

    // get the old login configuration for the organization and merge with the new one
    const oldLoginConfig = await getLoginConfiguration(
      {},
      { organizationId: organization.id }
    );

    const newLoginConfig = _validateAndMergeLoginConfig(
      inputLoginConfig,
      oldLoginConfig
    );

    return await _setLoginConfigurationDb(
      context,
      organization,
      newLoginConfig
    );
  }

  async function _setLoginConfigurationDb(context, org, input) {
    const userId = await getUserId(context, org.id);
    const {
      name,
      slug,
      logo,
      buttonColor,
      buttonTextColor,
      enabled,
      hideVeritoneBranding
    } = input;

    const loginButtonStyle = {
      buttonColor,
      buttonTextColor
    };

    const columns = [
      'name',
      'slug',
      'logo',
      'login_button_style',
      'organization_id',
      'created_by',
      'modified_by',
      'enabled',
      'hide_veritone_branding'
    ];

    const sqlValues = [
      name, // $1
      slug, // $2
      logo, // $3
      loginButtonStyle, // $4
      org.id, // $5
      userId, // $6
      enabled, // $7
      hideVeritoneBranding
    ];

    const sql = `
      INSERT INTO public.login_configuration 
          (${columns.join(', ')})
      VALUES 
          ($1, $2, $3, $4, $5, $6, $6, $7, $8)
      ON CONFLICT
          (organization_id)
      DO UPDATE SET
        name = $1,
        slug = $2,
        logo = $3,
        login_button_style = $4,
        modified_by = $6,
        enabled = $7,
        hide_veritone_branding = $8
      RETURNING 
          ${columns.join(', ')};
    `;

    try {
      return await serviceContext.dbConnections[
        'media_platform'
      ].write.oneOrNone(sql, sqlValues, mapper.mapLoginConfiguration);
    } catch (error) {
      if (_.includes(error.message, 'duplicate')) {
        throw new errors.InvalidInput({
          message:
            'The provided slug already exists for another login configuration. Please choose a different slug and try again.',
          data: {
            field: 'slug',
            value: slug
          }
        });
      }
    }
  }

  /**
   * This deletes the login configuration
   * @param {*} context the current context
   * @param {*} args the input
   * @returns an object { id, message }
   */
  async function deleteLoginConfiguration(context, args) {
    const { organizationId } = args;
    const callerOrgId = resUtil.getOrgFromAuthContext(context);
    // Validation
    util.checkId(organizationId, false, true);
    if (
      !util.compareOrganizationIds(callerOrgId, organizationId) &&
      !resUtil.isSuperAdmin(context._authInfo)
    ) {
      throw new errors.NotAllowed({
        message:
          'Only superadmin can delete the login configuration for another organization.'
      });
    }

    const sql = `
      DELETE FROM public.login_configuration
      WHERE
        organization_id = $1
      RETURNING
        organization_id,
        name
    `;
    const values = [organizationId];

    const res = await serviceContext.dbConnections[
      'media_platform'
    ].write.oneOrNone(sql, values, mapper.camelizeRootKeys);

    if (!res) {
      throw new errors.NotFound({
        message: 'Login configuration not found for organization.',
        data: {
          organizationId
        }
      });
    }

    return {
      id: res.organizationId,
      message: `Organization Login Configuration (organization: ${res.organizationId}, loginConfiguration: '${res.name}') has been deleted`
    };
  }

  async function getUserId(context, organizationId) {
    const tokenInfo = _.get(context, 'requestContext.tokenInfo', {});
    const userInfo = _.get(context, 'requestContext.userInfo', {});
    let userId =
      _.get(context, '_authInfo.userId') ||
      userInfo.userId ||
      tokenInfo.userId ||
      tokenInfo.applicationId ||
      util.getOrganizationGuid(context);

    if (!_.isString(userId) || !validator.isUUID(userId)) {
      userId = await serviceContext.dal.application.getAppIdFromOrgId(
        organizationId
      );
    }
    if (_.isNil(userId)) {
      return '00000000-0000-0000-0000-000000000000';
    }
    return userId;
  }

  return {
    getEngineWhitelist,
    getEngineBlacklist,
    setEngineWhitelist,
    setEngineBlacklist,
    deleteFromEngineBlacklist,
    deleteFromEngineWhitelist,
    addToEngineBlacklist,
    addToEngineWhitelist,
    getBlacklistForOrg,
    getBusinessUnit,
    getGroupIdForOrgId,
    getOrgIdForGroupId,
    getOrgIdFromAppId,
    getOrganization,
    getOrganizations,
    getMyOrganizations,
    getUserCountForOrg,
    getMediaUsageMs,
    setOrganizationIntegrationConfig,
    deleteOrganizationIntegrationConfig,
    getOrganizationIntegrationConfig,
    setOrgOktaConfiguration,
    getOrgOktaConfiguration,
    getDefaultAddToIndexForOrg,
    getRolesForOrg,
    setOrgRemainingBudget,
    incrementMonthlyCharge,
    updateOrganizationBilling,
    updateOrganizationKvp,
    incrementMonthlyProcessing,
    setLastAssetUpdatedDate,
    allowedToEditOrganization,
    setUserDefaultOrganization,
    getOrganizationIdAndGuidForUser,
    getLoginConfiguration,
    setLoginConfiguration,
    deleteLoginConfiguration,
    // for unit-test only
    getRoles
  };
};
