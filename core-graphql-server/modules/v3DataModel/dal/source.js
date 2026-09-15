const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');
const uuid = require('uuid');
const funcPerms = require('@veritone/functional-permissions-lib');
const { supportedEvents } = require('@veritone/core-server-base/events-map');
const crypto = require('crypto');
const storage = require('../../../dal/storage.js');
const jwt = require('jsonwebtoken');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const dalStructuredData = serviceContext.dal.structuredData;
  const dbConnections = serviceContext.dbConnections;
  const logger = serviceContext.logger;

  const { parseUri } = require('../../../util/s3UrlParser.js')(serviceContext);
  const mainUtil = require('../../../util.js')();
  const errors = require('../../../error/index.js')(config);
  const messageUtil =
    serviceContext.messageUtil ||
    require('../../../messageUtil.js')(serviceContext);

  const sourceDbRead = dbConnections['media_platform'].read;
  const sourceDbWrite = dbConnections['media_platform'].write;
  const defaultOrg = _.get(config, 'db.constants.customerSuccessOrgId', 7682);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);

  async function getSource(context, args) {
    mainUtil.checkId(args.id, false, true);
    const res = await getSources(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Source'
        }
      });
    }
    return res.records[0];
  }

  /**
   * Gets query and params for getting sources
   * @param {*} context the context
   * @param {*} args the params
   * @param {*} groupId the groupId to check the permission
   * @returns an object { sql, values }
   */
  function getSourcesQuery(context, args, groupId) {
    const where = [];
    const values = [];
    const cmsPerms = funcPerms.permissions.cms;
    const userPerms = _.get(context, '_authInfo.permissionMasks', []);

    let sourceTypeIds = [];
    if (args.sourceTypeId) {
      sourceTypeIds.push(args.sourceTypeId);
    }
    if (args.sourceTypeIds) {
      sourceTypeIds = sourceTypeIds.concat(args.sourceTypeIds);
    }

    const privateMediaEnabled =
      _.get(context, '_authInfo.organization.kvp.features.privateMedia') ===
      'enabled';

    const permLevel = args.permission || 'viewer';
    let allowedPerms = [];
    if (permLevel === 'viewer') {
      allowedPerms = ['viewer', 'editor', 'owner'];
    } else if (permLevel === 'editor') {
      allowedPerms = ['editor', 'owner'];
    } else {
      allowedPerms = ['owner'];
    }
    const includeViewer = allowedPerms.includes('viewer');
    const isCS = funcPerms.util.hasAccessToAll(
      [cmsPerms.customerservice],
      userPerms
    );
    const isInternal = context._authInfo
      ? mainUtil.isInternalAPIKey(context._authInfo)
      : false;

    const includePublic = _.has(args, 'includePublic')
      ? args.includePublic && includeViewer
      : includeViewer;
    if (args.organizationId) {
      const or = [];
      if (includePublic) {
        or.push('s.is_public = TRUE');
      }
      if (privateMediaEnabled) {
        // VTN-9152 always allow -1 if private media enabled
        or.push('s.media_source_id = -1');
      }

      values.push(args.organizationId);
      or.push(`s.organization_id = \$${values.length}`);
      if (_.toString(args.organizationId) === _.toString(defaultOrg)) {
        or.push('s.organization_id IS NULL');
      }

      if (groupId) {
        // for org-scoped tokens we will allow access to a source
        // if there's an ACL row for it
        or.push(
          `a.permission IN (${allowedPerms
            .map((perm) => `'${perm}'`)
            .join(', ')})`
        );
      }
      if (isCS || isInternal) {
        // users with this `cms.customerservice` role also get access to private sources
        or.push('s.is_public = FALSE');
        or.push('s.is_public = TRUE');
      }
      where.push(`(${or.join(' OR ')})`);
    } else {
      if (!includePublic) {
        throw new errors.InvalidInput({
          message:
            'Either provide an organizationId or set includePublic to true to retrieve sources.'
        });
      }
      // internal api keys should be able to access private sources
      if (!isInternal) {
        where.push(`s.is_public = TRUE`);
      }
    }

    // need to look up group ID for application.
    // then insert join with ACLs. skip join if there is no application.

    if (args.correlationSchemaId) {
      values.push(args.correlationSchemaId);
      where.push(` s.correlation_schema_id = $${values.length} `);
    }

    let ids = [];
    // check the id field first
    if (!_.isNil(args.id)) {
      if (_.isArray(args.id)) {
        // keep the original logic
        if (!args.id.length) {
          throw new errors.InvalidInput({
            message:
              'The sources.id (ids) parameter, if set, must have either a ' +
              'scalar value or non-empty array. ' +
              'The value contained an empty array.'
          });
        }
        ids = args.id;
      } else {
        ids = [args.id];
      }
    } else if (_.isArray(args.ids) && !_.isEmpty(args.ids)) {
      ids = args.ids;
    }

    if (ids.length) {
      ids.forEach((id) => mainUtil.checkId(id, true, true));
      mainUtil.addSqlWhere('s.media_source_id', ids, where, values);
    }

    if (_.isArray(sourceTypeIds) && sourceTypeIds.length > 0) {
      sourceTypeIds.forEach((id) => mainUtil.checkId(id, true, true));
      mainUtil.addSqlWhere(
        's.media_source_type_id',
        sourceTypeIds,
        where,
        values
      );
    }
    // add clause for name match, if name was passed. case-insensitive.
    mainUtil.makeLikeClause(
      's.media_source_name',
      args.name,
      where,
      values,
      args.nameMatch,
      false
    );

    if (!_.isNil(args.hasContentTemplates)) {
      const op = args.hasContentTemplates === true ? 'IN' : 'NOT IN';
      where.push(
        `s.media_source_id ${op} (SELECT source_id FROM source_content_template GROUP BY source_id)`
      );
    }

    const fieldMap = {
      createdDateTime: 'date_created',
      modifiedDateTime: 'date_modified',
      name: 'media_source_name',
      id: 's.media_source_id',
      sourceTypeId: 'media_source_type_id',
      correlationSchemaId: 'correlation_schema_id'
    };

    let orderClause = [];
    const orders = args.orderBy || [];
    orders.forEach((order) => {
      const orderDir = order.direction || 'desc';
      const orderCol = fieldMap[order.field];
      // internal error. graphql enum prevents user error.
      if (!orderCol)
        throw new Error(
          'unknown source sort column in ' + JSON.stringify(args.orderBy)
        );
      orderClause.push(`${orderCol} ${orderDir}`);
    });
    // default to date created desc
    if (!orderClause.length) orderClause.push('date_created desc');

    // if this is a normal org-scoped token, we'll add a clause to the
    // ACL join restricting it to this org's group
    let aclJoin = '';
    if (groupId) {
      values.push(groupId);
      aclJoin = `AND a.acl = \$${values.length}`;
    }

    let storeConfigJoin = '';
    let storageConfigFilter = {};
    if (!_.isNil(args.storageConfigFilter)) {
      storageConfigFilter = parseStorageConfigFilter(args.storageConfigFilter);
      storeConfigJoin = ` JOIN media_source_storage sc ON sc.media_source_id = s.media_source_id`;
      mainUtil.addSqlWhere(
        'sc.bucket',
        storageConfigFilter.bucket,
        where,
        values
      );
      values.push(storageConfigFilter.key);
      where.push(
        `($${values.length} ILIKE (SELECT TRIM('/' FROM sc.key_prefix)) || '%')`
      );
      if (storageConfigFilter.returnAllMatching !== true) {
        // return only the longest prefix match
        args.limit = 1;
        orderClause = [`LENGTH((SELECT TRIM('/' FROM sc.key_prefix))) DESC`];
      }
    }

    let sql = `
SELECT
  ${mainUtil.makeSelectClause(sourceSelect)},
  a.permission,
  a.acl,
  a.media_source_id
FROM
  media_source s
LEFT OUTER JOIN
  media_source__acl a ON a.media_source_id = s.media_source_id ${aclJoin} ${storeConfigJoin}
`;

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')} `;
    }

    sql += `
ORDER BY ${orderClause.join(', ')}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;

    return { sql, sqlArgs: values };
  }

  function parseStorageConfigFilter(filter) {
    if (!_.isObject(filter)) {
      throw new errors.InvalidInput({
        message: 'invalid Storage config definition'
      });
    }
    if (_.isEmpty(filter.bucket) && _.isEmpty(filter.url)) {
      throw new errors.InvalidInput({
        message: 'invalid Storage config definition: url or bucket required'
      });
    }
    const result = { ...filter };
    if (filter.url) {
      const urlDetails = parseUri(filter.url);
      if (!urlDetails) {
        throw new errors.InvalidInput({
          message: 'Not a valid s3 URL',
          data: filter.url
        });
      }
      result.bucket = urlDetails.bucket;
      result.key = urlDetails.key;
      result.region = urlDetails.region || filter.region;
    }
    return result;
  }

  async function getSources(context, args) {
    // TODO do we need to handle multiple groups? seems there's only ever 1.
    let groupId = _.get(context, '_authInfo.groups[0].groupId');
    if (!groupId) {
      // context will not have a group if this an engine JWT.
      // look it up by org ID.
      groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        args.organizationId
      );
    }

    const { sql, sqlArgs } = getSourcesQuery(context, args, groupId);

    const res = await sourceDbRead.map(sql, sqlArgs, map);
    return mainUtil.toPage(args, res);
  }

  // this array identifies database columns in media_source that are really
  // specific to a source type and should be exposed only through the
  // details field.
  const sourceDetailColumns = [
    'liveTimezone',
    'youtubeChannelUrl',
    'stationChannel',
    'radioStationCode',
    'radioStreamUrl',
    'salesforceId',
    'biaStationCode',
    'stationCallSign',
    'stationBand',
    'homeMarketId',
    'youtubeChannelId',
    'youtubeChannelCreatedDate',
    'businessUnit'
  ];

  async function createSource(context, args) {
    const input = args.input;
    try {
      // Determine the source owner
      const data = context._authInfo || context.userInfo || context.tokenInfo;
      let ownerId =
          _.get(data, 'userId') ||
          _.get(data, 'user.userId', _.get(data, 'user.id'));
      // if no user ID found on token, get the default source owner
      if (!ownerId) {
        ownerId = await _getDefaultSourceOwnerForOrg(input.organizationId, context);
      }

      // details / metadata storage is currently mapped onto the legacy database
      // schema, which has type-specific columns on media_source and a general-purpose
      // kvp column. the kvp column value and all type-specific columns are mapped
      // to the details field in graphql. The logic below does this mapping.

      // we need to decompose the incoming details into key/value pairs
      // that have database columns in the old media_source schema and those
      // that do not have columns and will be put in the kvp json.
      const details = input.details || {};
      const kvp = _.omit(details, sourceDetailColumns);
      const kvpColumns = mapper.decamelizeRootKeys(
        _.pick(details, sourceDetailColumns)
      );
      const marketIds = details.marketIds;
      const networkIds = details.networkIds;
      delete kvp.networkIds;
      delete kvp.marketIds;

      // TODO validate details input against schema associated with source type!

      // contains basic column values including kvp
      let columnData = {
        kvp: kvp,
        media_source_name: input.name,
        organization_id: input.organizationId,
        is_public: input.isPublic,
        media_source_type_id: input.sourceTypeId,
        thumbnail_url: input.thumbnailUrl,
        details_schema_id: input.detailsSchemaId,
        correlation_schema_id: input.correlationSchemaId,
        correlation_sdo_id: input.correlationSDOId,
        state: input.state,
        created_by: ownerId,
        updated_by: ownerId,
        owned_by: ownerId,
      };

      if (input.storageConfig) {
        validateStorageConfig(input.storageConfig);
      }

      if (_.get(input, 'details.sourceFormat')) {
        await cacheSourceFormats();
        const sfid = await getSourceFormatId(
          _.get(input, 'details.sourceFormat'),
          input.sourceTypeId
        );
        columnData.media_source_format_id = sfid;
      }

      if (
        _.get(input, 'correlationSchemaId') &&
        !_.get(input, 'correlationSDOId')
      ) {
        // create the new SDO
        const sdo = await dalStructuredData.createStructuredData(
          {
            organizationId: input.organizationId,
            input: {
              data: input.details || {},
              schemaId: input.correlationSchemaId,
              applicationId: input.applicationId
            }
          },
          context
        );
        columnData.correlation_sdo_id = sdo.id;

        if (sdo.data) {
          columnData.kvp = Object.assign({}, columnData.kvp, sdo.data);
        }
      }

      if (
        (columnData.correlation_sdo_id || columnData.correlation_schema_id) &&
        !(columnData.correlation_sdo_id && columnData.correlation_schema_id)
      ) {
        throw new errors.InvalidInput({
          message:
            'correlationSDOId and correlationSchemaId are both required when adding source correlation',
          data: {
            objectId: args.input.id,
            objectType: input.correlationSDOId
              ? 'correlationSchemaId'
              : 'correlationSDOId'
          }
        });
      }

      // adds key/value pairs from details that have db columns
      columnData = Object.assign(kvpColumns, columnData);
      // if a live timezone wasn't set in details, apply a default here to db.
      // otherwise legacy Discovery client shows "undefined" for time zone
      // on any sj/programs that use it.
      if (!columnData.live_timezone) {
        columnData.live_timezone = 'UTC';
      }
      const tableName = 'media_source AS s';
      const { sql, values } = mainUtil.makeInsertSql(
        tableName,
        columnData,
        sourceSelect
      );
      // first create source to get its ID
      const res = await sourceDbWrite.map(sql, values, map);
      const id = res[0].id;

      // add an owner ACL because legacy program search requires it
      const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        input.organizationId
      );
      const ownerSql = `INSERT INTO media_source__acl (media_source_id, acl, permission) VALUES ($1, $2, $3)`;
      const aclRes = await sourceDbWrite.query(ownerSql, [
        id,
        groupId,
        'owner'
      ]);

      // handle market and network IDs
      if (networkIds) {
        await setNetworkIds(context, id, networkIds, false);
      }
      if (marketIds) {
        await setMarketIds(context, id, marketIds, false);
      }

      if (input.storageConfig) {
        await setStorageConfig(
          context,
          id,
          input.storageConfig,
          input.organizationId
        );
      }

      // now we need to handle content templates
      if (input.contentTemplates && input.contentTemplates.length) {
        const sqlParts = [];
        let allValues = [];

        for (let i = 0; i < input.contentTemplates.length; i++) {
          const template = input.contentTemplates[i];
          template.sourceId = id;
          template.organizationId = input.organizationId;
          let temp = await createContentTemplateSql(
            context,
            template,
            allValues
          );
          sqlParts.push(temp.sql);
          allValues = allValues.concat(temp.values);
        }

        const allSql = sqlParts.join(';\n');
        const ctRes = await sourceDbWrite.map(
          allSql,
          allValues,
          mapper.camelizeRootKeys
        );
      }

      if (input.collaborators) {
        const collabRes = await updateSourceCollaborators(
          res[0],
          input.collaborators,
          false
        );
      }

      const result = res[0];
      // emit event
      _emitPublicEvent(context, supportedEvents.MediaSourceCreate, result);

      return result;
    } catch (err) {
      _emitPublicEvent(
        context,
        supportedEvents.MediaSourceCreate,
        { status: 'failure', media_source_name: input.name },
        err
      );
      throw err;
    }
  }

  async function updateSource(context, args) {
    let res, oldSource;
    const input = args.input;
    try {
      // validate access to source
      const isInternalAPIKey = mainUtil.isInternalAPIKey(context._authInfo);
      oldSource = await getSource(context, {
        id: args.input.id,
        organizationId: args.input.organizationId,
        includePublic: true
      });
      // that will throw if user does not have any access.
      // if they do have access, now we need to check permissions.
      const perm = getSourcePermission(context, args, oldSource);
      // only owner, editor, or an internal key can update.
      if (!(perm === 'owner' || perm === 'editor' || isInternalAPIKey)) {
        throw new errors.NotAllowed({
          message:
            'The specified source is visible to you but is owned by ' +
            'another organization and cannot be updated.',
          data: {
            objectId: args.input.id,
            objectType: 'Source'
          }
        });
      }

      // only owners can change the public flag on a source or add collaborators
      if (
        !(perm === 'owner' || isInternalAPIKey) &&
        (_.has(args.input.isPublic) || _.has(args.input.collaborators))
      ) {
        throw new errors.NotAllowed({
          message:
            'The specified source is editable by you but is owned by ' +
            'another organization and cannot be shared.',
          data: {
            objectId: args.input.id,
            objectType: 'Source'
          }
        });
      }

      // assign audit field ids (created_by, updated_by, owned_by)
      const data = context._authInfo || context.userInfo || context.tokenInfo;
      let callingUserId =
          _.get(data, 'userId') ||
          _.get(data, 'user.userId', _.get(data, 'user.id'));

      const details = input.details || {};
      const kvp = _.omit(details, sourceDetailColumns);
      const kvpColumns = mapper.decamelizeRootKeys(
        _.pick(details, sourceDetailColumns)
      );
      input.organizationId = input.organizationId || oldSource.organizationId;

      const marketIds = details.marketIds;
      const networkIds = details.networkIds;
      delete kvp.networkIds;
      delete kvp.marketIds;

      // TODO validate the following:
      // if details is provided then a schema
      // ID is set
      // if details is provided then it complies
      // with schema
      // if schema ID provided but not details then
      // existing details must be validated

      // contains basic column values including kvp
      let columnData = {
        kvp: kvp,
        media_source_name: input.name,
        organization_id: input.organizationId,
        is_public: input.isPublic,
        thumbnail_url: input.thumbnailUrl,
        details_schema_id: input.detailsSchemaId,
        correlation_schema_id: input.correlationSchemaId,
        correlation_sdo_id: input.correlationSDOId,
        state: input.state,
        updated_by: callingUserId,
        owned_by: input.ownedBy,
      };

      if (_.get(input, 'details')) {
        let schemaId =
          _.get(input, 'correlationSchemaId') ||
          _.get(oldSource, 'correlationSchemaId');

        if (!schemaId) {
          // get the schema by the sourceTypeId
          // get media source type
          const sourceType = await getSourceType(context, {
            sourceTypeId: oldSource.sourceTypeId
          });

          schemaId = sourceType.configSchemaId;
        }

        schemaId = await _resolveCompatibleSchema(context, schemaId, oldSource);

        const newSdo = await dalStructuredData.createStructuredData(
          {
            organizationId: input.organizationId,
            input: {
              id: oldSource.correlationSdoId,
              data: details,
              schemaId,
              applicationId: input.applicationId
            }
          },
          context
        );

        columnData.correlation_schema_id = schemaId;
        columnData.correlation_sdo_id = newSdo.id;

        if (newSdo.data) {
          columnData.kvp = Object.assign({}, columnData.kvp, newSdo.data);
        }
      }

      if (_.get(input, 'details.sourceFormat')) {
        await cacheSourceFormats();
        const sfid = await getSourceFormatId(
          _.get(input, 'details.sourceFormat'),
          oldSource.sourceTypeId
        );
        columnData.media_source_format_id = sfid;
      }
      if (
        (input.correlationSDOId || input.correlationSchemaId) &&
        !(input.correlationSDOId && input.correlationSchemaId)
      ) {
        throw new errors.InvalidInput({
          message:
            'correlationSDOId and correlationSchemaId are both required when adding source correlation',
          data: {
            objectId: args.input.id,
            objectType: input.correlationSDOId
              ? 'correlationSchemaId'
              : 'correlationSDOId'
          }
        });
      }

      if (input.storageConfig) {
        validateStorageConfig(input.storageConfig);
      }

      // adds key/value pairs from details that have db columns
      columnData = Object.assign(kvpColumns, columnData);

      const tableName = 'media_source AS s';
      // validates id values inserted directly into SQL
      mainUtil.checkId(input.organizationId, false, true);
      mainUtil.checkId(input.id, false, true);

      // don't need to filter by org ID because we already checked for permissions
      let whereClause = `s.media_source_id = ${input.id}`;

      // tolerate legacy sources in DB that have null org ID.
      // treat as owned by veritone.
      if (
        _.isNil(oldSource.organizationId) &&
        _.toString(input.organizationId) === _.toString(defaultOrg)
      ) {
        whereClause = `s.organization_id IS NULL AND s.media_source_id = ${input.id}`;
      }
      const { sql, values } = mainUtil.makeUpdateSql(
        tableName,
        columnData,
        sourceSelect,
        whereClause,
        0,
        true
      );
      // only write to DB if an columns have changed.
      // if we're only updating extra-table data such as
      // collaborators, skip to avoid SQL error.
      if (Object.keys(columnData).length) {
        res = await sourceDbWrite.map(sql, values, map);
      }

      // handle market and network IDs
      if (networkIds) {
        await setNetworkIds(context, input.id, networkIds, true);
      }
      if (marketIds) {
        await setMarketIds(context, input.id, marketIds, true);
      }
      if (input.storageConfig) {
        await setStorageConfig(
          context,
          input.id,
          input.storageConfig,
          input.organizationId
        );
      }

      // now we need to handle content templates
      if (input.contentTemplates) {
        // this isn't the optimal method, but for now we are going to just
        // brute-force wipe all existing content templates off the source
        // and re-add. as a future optimization we can check to see if the
        // incoming sdo ids contain any that are already on the source and,
        // if so, don't change them. only add new, remove any that don't
        // exist, and create new for templates where data not sdoId was given.
        const deleteSql = `
DELETE FROM
source_content_template
WHERE
source_id = $1`;
        // note that we already authorized access to this source so we can
        // safely delete all templates attached to it without the extra
        // org ID check against source table.
        const sqlParts = [deleteSql];
        let allValues = [_.toString(input.id)];

        for (let i = 0; i < input.contentTemplates.length; i++) {
          const template = input.contentTemplates[i];
          template.sourceId = input.id;
          template.organizationId = input.organizationId;
          let temp = await createContentTemplateSql(
            context,
            template,
            allValues
          );
          sqlParts.push(temp.sql);
          allValues = allValues.concat(temp.values);
        }
        const allSql = sqlParts.join(';\n');
        const ctRes = await sourceDbWrite.map(
          allSql,
          allValues,
          mapper.camelizeRootKeys
        );
      }

      // access for this was validated above (owners only)
      if (input.collaborators) {
        const collabRes = await updateSourceCollaborators(
          oldSource,
          input.collaborators,
          true
        );
      }

      if (
        !_.isNil(input.correlationSDOId) &&
        input.correlationSDOId !== oldSource.correlationSdoId
      ) {
        emitCorrelateSourceEvent(
          input.id,
          input.correlationSchemaId,
          input.correlationSDOId
        );
      }
      await clearDetails(context, { id: input.id });
      const event = {
        organizationId: input.organizationId,
        id: input.id,
        type: 'program',
        event: 'source_updated',
        nameChanged: input.name !== oldSource.name
      };
      serviceContext.messageUtil.emitEvent(event, 'events');

      // emit event
      if (_.isArray(res) && res.length > 0) {
        _emitPublicEvent(context, supportedEvents.MediaSourceUpdate, { ...res[0], name: oldSource.name });
      }

      // get fresh copy
      return getSource(context, {
        id: input.id,
        organizationId: oldSource.organizationId,
        includePublic: true
      });
    } catch (err) {
      if (!res) {
        res = {};
      }
      _emitPublicEvent(
        context,
        supportedEvents.MediaSourceUpdate,
        { ...res, status: 'failure', name: oldSource?.name },
        err
      );
      throw err;
    }
  }

  async function deleteSource(context, args) {
    let res;
    try {
      mainUtil.checkId(args.id, false, true);
      mainUtil.checkId(args.organizationId, false, true);
      // validate access to source first.
      // first get the source. anyone will viewer right will get this far.
      const testSource = await getSource(
        context,
        Object.assign({ includePublic: true }, args)
      );
      const permission = getSourcePermission(context, args, testSource);
      // only owners can delete a source.
      if (permission !== 'owner') {
        throw new errors.NotAllowed({
          message:
            'The specified source is visible to you but is owned by ' +
            'another organization and cannot be deleted.',
          data: {
            objectId: args.id,
            objectType: 'Source'
          }
        });
      }

      // delete storage config and associated external secrets
      await deleteStorageConfig(args.id, args.organizationId);

      const sql = `
  DELETE FROM source_content_template
  WHERE source_id = $1;
  
  DELETE FROM market__media_source WHERE media_source_id = $1;
  
  DELETE FROM media_source__network WHERE media_source_id = $1;
  
  DELETE FROM media_source
  WHERE
    media_source_id = $1 AND organization_id = $2
  RETURNING media_source_id AS id, media_source_name AS name, media_source_type_id
      `;
      res = await sourceDbWrite.query(sql, [args.id, args.organizationId]);
      const event = {
        organizationId: args.organizationId,
        id: args.id,
        type: 'program',
        event: 'source_deleted'
      };
      serviceContext.messageUtil.emitEvent(event, 'events');

      // emit event
      if (_.isArray(res) && res.length > 0) {
        _emitPublicEvent(context, supportedEvents.MediaSourceDelete, res[0]);
      }

      return {
        id: args.id,
        message: 'Source deleted'
      };
    } catch (err) {
      let errRes = res;
      if (!res) {
        errRes = {};
      } else if (_.isArray(res) && res.length > 0) {
        errRes = res[0];
      }
      _emitPublicEvent(
        context,
        supportedEvents.MediaSourceDelete,
        { ...errRes, status: 'failure', media_source_id: args.id },
        err
      );
      throw err;
    }
  }

  const sourceSelect = {
    's.media_source_id': 'id',
    's.media_source_name': 'name',
    's.media_source_type_id': 'source_type_id',
    's.organization_id': null,
    's.date_created': 'created_date_time',
    's.date_modified': 'modified_date_time',
    's.is_public': null,
    's.kvp': null,
    's.thumbnail_url': null,
    's.live_timezone': null,
    's.youtube_channel_url': null,
    's.station_channel': null,
    's.radio_station_code': null,
    's.radio_stream_url': null,
    's.salesforce_id': null,
    's.bia_station_code': null,
    's.station_call_sign': null,
    's.station_band': null,
    's.home_market_id': null,
    's.youtube_channel_id': null,
    's.youtube_channel_created_date': null,
    's.business_unit': null,
    's.ingest_cluster_id': null,
    's.ingestion_options': null,
    's.media_source_format_id': null,
    's.correlation_schema_id': null,
    's.correlation_sdo_id': null,
    's.state': null,
    's.created_by': null,
    's.updated_by': null,
    's.owned_by': null,
  };

  async function getSourceType(context, args) {
    mainUtil.checkId(args.sourceTypeId, false, true);
    const sql = `
      SELECT
        media_source_type_id,
        media_source_type_name,
        config_schema_id,
        owner_organization_id,
        is_public,
        is_live
      FROM
        media_source_type
      WHERE
        media_source_type_id = $1
    `;

    const res = await sourceDbRead.map(
      sql,
      [args.sourceTypeId],
      mapper.camelizeRootKeys
    );

    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.sourceTypeId,
          objectType: 'SourceType'
        }
      });
    }

    return res[0];
  }

  async function getSourceIdsForSchedule(context, args, scheduledJobId) {
    // task table query needs to be filtered by app ID to be efficient.
    // we also only want to pull source info from tasks and jobs owned
    // by the caller's org.
    const appId = _.get(context, '_authInfo.groups[0].applicationId');

    let res = [];
    if (
      _.get(
        config,
        'featureFlags.getSourceIdsForScheduleFromTaskTable',
        false
      ) === true
    ) {
      // first we query tasks table to get any tasks run from this
      // scheduled job with a sourceId in the payload
      const sql = `
SELECT
  t.task_payload->>'sourceId'::TEXT AS id
FROM
  job_new.task t
LEFT JOIN job_new.job j
  ON j.job_id = t.job_id
WHERE
  j.scheduled_job_id = $1::TEXT AND
  t.task_payload->>'sourceId' IS NOT NULL AND
  t.application_id = $2
    `;

      res = await dbConnections['core'].read.query(sql, [
        scheduledJobId,
        appId
      ]);
    }
    // now we get the direct primary source ID from program table
    const sql2 = `
SELECT
  primary_media_source_id AS id
FROM
  program
WHERE
  program_id = $1 AND primary_media_source_id IS NOT NULL
    `;

    const res2 = await sourceDbRead.query(sql2, [scheduledJobId]);

    // combine results of previous two queries
    const final = res
      .filter((row) => !_.isNil(row.sourceId))
      .map((row) => row.sourceId);
    if (res2.length) final.push(res2[0].id);

    // now we have a list of source IDs
    return final;
  }

  async function getSourcesForSchedule(context, args, scheduleId) {
    // first get the list of source IDs for this scheduled job
    const ids = await getSourceIdsForSchedule(context, args, scheduleId);

    // now use that list to get all sources
    const sources = ids.length
      ? await getSources(
        context,
        Object.assign(
          {
            organizationId: args.organizationId,
            id: ids
          },
          args
        )
      )
      : {
        offset: args.offset,
        limit: args.limit,
        count: 0,
        records: []
      };

    return sources;
  }

  const contentTemplateSelectData = {
    source_content_template_id: 'id',
    source_id: null,
    sdo_id: null,
    data_registry_id: 'schema_id',
    created_date_time: null,
    date_modified: 'modified_date_time'
  };

  async function createSourceContentTemplate(context, args) {
    const input = args.input;
    if (!input.organizationId) input.organizationId = args.organizationId;
    // validate access to source
    const source = await getSource(context, {
      id: input.sourceId,
      organizationId: input.organizationId
    });
    const { sql, values } = await createContentTemplateSql(context, input, []);

    const res = await sourceDbWrite.map(sql, values, mapper.camelizeRootKeys);

    return res[0];
  }

  async function deleteSourceContentTemplate(context, args) {
    // in this query, we make sure that we only delete a source content
    // template associated with a source that the caller's org owns.
    const sql = `
DELETE FROM source_content_template sct
WHERE sct.source_content_template_id = $1
AND sct.source_id IN
  (select source_id FROM media_source WHERE organization_id = $2)
RETURNING source_content_template_id AS id, source_id;
    `;
    const res = await sourceDbWrite.query(sql, [args.id, args.organizationId]);
    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectType: 'SourceContentTemplate',
          objectId: args.id
        }
      });
    }
    return {
      id: args.id,
      message: 'SourceContentTemplate deleted from source ' + res[0].source_id
    };
  }

  async function createContentTemplateSql(context, input, sqlValues) {
    let sdoId = input.sdoId;
    // if data was provided we need to create a new SDO
    if (input.data) {
      if (sdoId) {
        throw new errors.InvalidInput({
          message:
            'Only one of CreateSourceContentTemplate data or sdoId can be provided.'
        });
      }
      const sdo = await dalStructuredData.createStructuredData(
        {
          organizationId: input.organizationId,
          input: {
            data: input.data,
            schemaId: input.schemaId,
            id: uuid.v4(),
            synchronous: true
          }
        },
        context
      );
      sdoId = sdo.id;
    } else if (!sdoId) {
      throw new errors.InvalidInput({
        message:
          'One of CreateSourceContentTemplate data or sdoId must be provided.'
      });
    }
    const columnData = {
      source_id: input.sourceId,
      data_registry_id: input.schemaId,
      sdo_id: sdoId
    };

    return mainUtil.makeInsertSql(
      'source_content_template',
      columnData,
      contentTemplateSelectData,
      sqlValues.length
    );
  }

  async function getSourceContentTemplates(context, args) {
    const sourceId = args.id;
    const sql = `
SELECT
  ${mainUtil.makeSelectClause(contentTemplateSelectData)}
FROM
  source_content_template
WHERE
  source_id = $1
    `;
    // note that this query is only used on a source object, which has
    // already been authorized.
    const res = await sourceDbRead.map(
      sql,
      [sourceId],
      mapper.camelizeRootKeys
    );
    return res;
  }

  function map(row) {
    return mapper.camelizeRootKeys(row);
  }

  function emitCorrelateSourceEvent(
    sourceId,
    correlationSchemaId,
    correlationSDOId
  ) {
    const event = {
      serviceName: 'core-graphql-server',
      event: 'correlate_source',
      type: 'correlation',
      sourceId,
      correlationSchemaId,
      correlationSDOId
    };
    const topic = 'CorrelationTopic';
    messageUtil.emitEvent(event, topic);
  }

  // gets the current user's permission level for the provided source.
  function getSourcePermission(context, args, source) {
    const contextOrgId = _.get(
      context,
      '_authInfo.organization.organizationId'
    );
    const currentOrgId = _.get(args, 'organizationId', contextOrgId);

    const data = context._authInfo || context.userInfo || context.tokenInfo;
    let contextUserId =
        _.get(data, 'userId') ||
        _.get(data, 'user.userId', _.get(data, 'user.id'));

    // if user's org owns the source, or their ID is assigned as the source owner, return owner
    if (_.toString(source.organizationId) === _.toString(currentOrgId) || contextUserId === _.toString(source.ownedBy)) {
      return 'owner';
    }
    // if source doesn't have an org, treat it as veritone-owned.
    if (
      _.toString(currentOrgId) === _.toString(defaultOrg) &&
      _.isNil(source.organizationId)
    ) {
      return 'owner';
    }

    // allow customer service role owner rights to all sources
    // VTN-10353 - CS is demoted.
    /*if (resUtil.isCSAdmin(context._authInfo)) {
      return 'owner';
    }*/

    // if there was an acl with permission, just return that
    // make this check after the owner checks so that a sharing entry
    // for the user's own org doesn't overwrite their real rights.
    if (source.permission) return source.permission;

    // otherwise it's viewer (someone else's public source)
    return 'viewer';
  }

  async function getCollaborators(context, args, source) {
    const perm = getSourcePermission(context, args, source);
    const sourceOrgId = _.toString(source.organizationId || defaultOrg);
    const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
      sourceOrgId
    );

    const where = [];
    const values = [];
    mainUtil.addSqlWhere('media_source_id', source.id, where, values);
    if (perm !== 'owner') mainUtil.addSqlWhere('acl', groupId, where, values);

    const sql = `
SELECT
  media_source_id AS source_id,
  acl AS group_id,
  permission
FROM
  media_source__acl
WHERE
  ${where.join(' AND ')}
    `;

    let orgIdFound = false;
    const dbres = await sourceDbRead.map(sql, values, mapper.camelizeRootKeys);
    for (let i = 0; i < dbres.length; i++) {
      const row = dbres[i];
      row.organizationId = await getOrgIdForGroupId(row.groupId);
      if (row.organizationId === sourceOrgId) orgIdFound = true;
    }

    // make sure there's an owner collaborator
    if (!orgIdFound) {
      dbres.push({
        organizationId: sourceOrgId,
        permission: 'owner',
        groupId
      });
    }
    // we're going to just sort in memory since it's more flexible --
    // in the db we don't have access to organizationId -- and the result
    // set is not paged and will not be large.
    const sortBy = args.orderBy || 'organizationId';
    let sorted = _.sortBy(dbres, [sortBy]);
    if ((args.orderDirection || 'asc') === 'desc') sorted = sorted.reverse();
    return mainUtil.toPage(args, sorted);
  }

  async function updateSourceCollaborators(
    source,
    collaborators,
    clearExisting
  ) {
    if (!(collaborators && collaborators.length)) {
      return [];
    }
    const values = [source.id];
    const sqlParts = [];

    // first map all the org IDs in the incoming list to groupId
    for (let i = 0; i < collaborators.length; i++) {
      const collaborator = collaborators[i];
      collaborator.groupId = await getGroupIdForOrgId(
        collaborator.organizationId
      );
    }

    if (clearExisting) {
      // if necessary, make a SQL statement that clears any existing
      // entries for the org IDs in the update.
      // never clear the owner org's acl.
      const groupId = await serviceContext.dal.organization.getGroupIdForOrgId(
        source.organizationId
      );
      const groupIds = collaborators.map(
        (collaborator) => collaborator.groupId
      );
      const aclArgs = [];
      groupIds.forEach((groupId) => {
        values.push(groupId);
        aclArgs.push(`\$${values.length}`);
      });
      values.push(groupId);
      sqlParts.push(`
DELETE FROM media_source__acl
WHERE media_source_id = $1
AND acl IN (${aclArgs.join(',')}) AND acl != \$${values.length}`);
    }

    // now we need to add each one
    collaborators.forEach((collaborator) => {
      if (collaborator.permission === 'none') return;
      values.push(collaborator.groupId);
      values.push(collaborator.permission);
      sqlParts.push(`
INSERT INTO media_source__acl (media_source_id, acl, permission)
VALUES ($1, \$${values.length - 1}, \$${values.length})
RETURNING *
      `);
    });

    const sql = sqlParts.join('\n;');
    const res = await sourceDbWrite.query(sql, values);
    return res;
  }

  async function getOrgIdForGroupId(groupId) {
    return serviceContext.dal.organization.getOrgIdForGroupId(groupId);
  }

  async function getGroupIdForOrgId(orgId) {
    return serviceContext.dal.organization.getGroupIdForOrgId(orgId);
  }

  let sourceFormatCache;

  async function cacheSourceFormats() {
    if (sourceFormatCache) return sourceFormatCache;

    sourceFormatCache = {};
    const sql = `
select
  media_source_format_id AS id,
  media_source_format_name AS name
FROM media_source_format`;
    const res = await sourceDbRead.query(sql);

    res.forEach((row) => {
      sourceFormatCache[_.toString(row.id)] = row.name;
      sourceFormatCache[row.name] = row.id;
    });
  }

  async function getSourceFormatId(sourceFormatName, sourceTypeId) {
    if (!sourceFormatName) return null;
    const sql = `
select
  media_source_format_id AS id
from
  media_source_format
where
  media_source_format_name ILIKE $1 and media_source_type_id = $2
    `;
    const vars = [sourceFormatName, sourceTypeId];
    const res = await sourceDbRead.map(sql, vars, (row) => row.id);

    if (!res.length) {
      throw new errors.NotFound({
        message:
          sourceFormatName +
          ' is not a known source format for  source type ' +
          sourceTypeId
      });
    }
    return res.length ? res[0] : null;
  }

  async function getSourceFormatName(sourceFormatId) {
    await cacheSourceFormats();
    return sourceFormatCache[_.toString(sourceFormatId)];
  }

  async function getDetails(context, object) {
    let res = await serviceContext.redisCache.get('SourceDetails', object.id);
    if (!res) {
      res = await getDetailsFromDb(context, object);
      await serviceContext.redisCache.set('SourceDetails', object.id, res);
    }
    return res;
  }

  async function clearDetails(context, object) {
    await serviceContext.redisCache.clear('SourceDetails', object.id);
  }

  async function getDetailsFromDb(context, object) {
    const res = object.kvp || {};
    sourceDetailColumns.forEach((key) => {
      if (!_.isNil(object[key])) {
        res[key] = object[key];
      }
    });
    // TODO sign URLs if needed

    // source format gets special handling. we map the string to and from
    // an ID column. the old table is just used as an indirection; it's
    // overkill. we simplify it here.
    // the create and update methods handle the mapping also.
    if (object.mediaSourceFormatId) {
      const sourceFormat = await getSourceFormatName(
        object.mediaSourceFormatId
      );
      // To resolve the cache issue in UK for CI test
      if (sourceFormat) {
        res.sourceFormat = sourceFormat;
      }
    }

    const marketIds = await getMarketIds(context, object);
    if (marketIds.length) res.marketIds = marketIds;
    const networkIds = await getNetworkIds(context, object);
    if (networkIds.length) res.networkIds = networkIds;

    return res;
  }

  async function getMarketIds(context, source) {
    const sql = `
SELECT
  market_id AS id
FROM
  market__media_source
WHERE
  media_source_id = $1
ORDER BY id asc
    `;
    return sourceDbRead.map(sql, [source.id], (row) => row.id);
  }

  async function setMarketIds(context, sourceId, marketIds, clearExisting) {
    const allSql = [];
    const values = [sourceId];
    if (clearExisting === true) {
      allSql.push(`
DELETE FROM market__media_source WHERE media_source_id = $1
      `);
    }
    marketIds.forEach((marketId) => {
      values.push(marketId);
      allSql.push(`
INSERT INTO market__media_source
  (market_id, media_source_id)
VALUES
  (\$${values.length}, $1)
      `);
    });
    return sourceDbWrite.query(allSql.join(';\n'), values);
  }

  async function setNetworkIds(context, sourceId, networkIds, clearExisting) {
    const allSql = [];
    const values = [sourceId];
    if (clearExisting === true) {
      allSql.push(`
DELETE FROM media_source__network WHERE media_source_id = $1
      `);
    }
    networkIds.forEach((networkId) => {
      values.push(networkId);
      allSql.push(`
INSERT INTO media_source__network
  (network_id, media_source_id)
VALUES
  (\$${values.length}, $1)
      `);
    });
    return sourceDbWrite.query(allSql.join(';\n'), values);
  }

  async function getNetworkIds(context, source) {
    const sql = `
SELECT
  network_id AS id
FROM
  media_source__network
WHERE
  media_source_id = $1
ORDER BY id asc
    `;
    return sourceDbRead.map(sql, [source.id], (row) => row.id);
  }

  async function _emitPublicEvent(context, eventName, data, error) {
    const mediaSourceName = data.name || data.media_source_name;
    const mediaSourceId = data.id || data.media_source_id;
    const actionMap = {
      [supportedEvents.MediaSourceCreate]: {
        name: 'create',
        describe: {
          'success': `Created source ${mediaSourceName}`,
          'failure': 'Failed to create new source',
        }
      },
      [supportedEvents.MediaSourceUpdate]: {
        name: 'update',
        describe: {
          'success': `Updated source ${mediaSourceName}`,
          'failure': `Failed to update source ${mediaSourceName}`,
        }
      },
      [supportedEvents.MediaSourceDelete]: {
        name: 'delete',
        describe: {
          'success': `Deleted source ${mediaSourceName}`,
          'failure': `Failed to delete source ${mediaSourceName}`,
        }
      }
    };
    if (!actionMap[eventName]) {
      throw new errors.InvalidInput({
        message: `Unsupported event: ${eventName}`
      });
    }
    data = data || {};
    // emit event
    const event = {
      mediaSourceId,
      mediaSourceName,
      mediaSourceTypeId: data.sourceTypeId || data.media_source_type_id,
      organizationId: data.organizationId,
      // actionInfo
      actionInfo: messageUtil.buildActionInfo(
        data.id || data.media_source_id,
        error,
        actionMap[eventName].name,
        !error ? 'success' : 'failure',
        !error ? actionMap[eventName].describe.success : actionMap[eventName].describe.failure
      )
    };
    try {
      await messageUtil.emitPublicEvent(eventName, 'system', context, event);
    } catch (ex) {
      logger.error(`failed to publish event: ${eventName}`, ex);
    }
  }

  function validateStorageConfig(storageConfig) {
    if (storageConfig.credentials && storageConfig.type === 'aws_s3') {
      if (
        !storageConfig.credentials.roleArn &&
        !(
          storageConfig.credentials.accessKeyId &&
          storageConfig.credentials.secretAccessKey
        )
      ) {
        throw new errors.InvalidInput({
          message:
            'roleArn or accessKeyId and secretAccessKey are required for storage credentials'
        });
      }
    }
  }

  async function getStorageConfig(sourceId) {
    const storageSql = /*sql*/ `SELECT storage_id, bucket, region, key_prefix, signed_url_ttl, details, external_credential_id FROM public.media_source_storage
      WHERE media_source_id = $1`;
    const res = await sourceDbWrite.query(storageSql, [sourceId]);
    if (res && res.length > 0) {
      return mapper.camelizeRootKeys(res[0]);
    }
    return null;
  }

  async function setStorageConfig(
    context,
    sourceId,
    storageConfig,
    organizationId
  ) {
    const {
      bucket,
      region,
      keyPrefix,
      signedUrlExpiresInSeconds,
      details,
      credentials
    } = storageConfig;

    const existingStorage = await getStorageConfig(sourceId);
    if (existingStorage && existingStorage.storageId) {
      if (credentials) {
        await setStorageCredentials(
          context,
          existingStorage.storageId,
          credentials,
          organizationId,
          existingStorage.externalCredentialId
        );
      }
      // update the existing storage
      const ownerSql = /*sql*/ `
        UPDATE public.media_source_storage
        SET bucket = $1, region = $2, key_prefix = $3, signed_url_ttl = $4, details = $5
        WHERE storage_id = $6;
      `;
      const res = await sourceDbWrite.query(ownerSql, [
        bucket || existingStorage.bucket,
        region || existingStorage.region,
        keyPrefix,
        signedUrlExpiresInSeconds,
        details,
        existingStorage.storageId
      ]);
      return existingStorage.storageId;
    }

    // create a new one
    const storageId = uuid.v4();
    let credentialId = null;
    if (credentials) {
      credentialId = await setStorageCredentials(
        context,
        storageId,
        credentials,
        organizationId
      );
    }

    const ownerSql = /*sql*/ `INSERT INTO public.media_source_storage
      (storage_id, media_source_id, bucket, region, key_prefix, signed_url_ttl, details, external_credential_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const res = await sourceDbWrite.query(ownerSql, [
      storageId,
      sourceId,
      bucket,
      region,
      keyPrefix,
      signedUrlExpiresInSeconds,
      details,
      credentialId
    ]);
    return storageId;
  }

  async function deleteStorageConfig(sourceId, organizationId) {
    const existingStorage = await getStorageConfig(sourceId);
    if (existingStorage && existingStorage.storageId) {
      if (existingStorage.externalCredentialId) {
        await deleteStorageCredentials(
          existingStorage.externalCredentialId,
          organizationId
        );
      }
      const deleteSql = /*sql*/ `
        DELETE FROM public.media_source_storage
        WHERE storage_id = $1;
      `;
      await sourceDbWrite.query(deleteSql, [existingStorage.storageId]);
    }
  }

  async function setStorageCredentials(
    context,
    storageId,
    credentials,
    organizationId,
    existingCredentialId
  ) {
    // get "created by" user or token ID
    const createdBy = resUtil.getClientInfo(context).id;

    // this is the unique key in the db, used in both credential_name and external_credential_id columns
    const credentialName =
      existingCredentialId || `storage-credentials-${storageId}`;

    // encrypt the credentials
    const str = JSON.stringify({
      type: 's3-credentials',
      payload: credentials
    });
    const cr = cipherTextConvert('encrypt', str);

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
    await serviceContext.dbConnections['sso'].write.query(sql, [
      's3',
      credentialName,
      cr,
      credentialName,
      organizationId,
      createdBy
    ]);
    return credentialName;
  }

  async function deleteStorageCredentials(
    existingCredentialId,
    organizationId
  ) {
    const sql = /*sql*/ `
      DELETE FROM external_credential 
      WHERE external_credential_id = $1 AND organization_id = $2;`;
    await serviceContext.dbConnections['sso'].write.query(sql, [
      existingCredentialId,
      String(organizationId)
    ]);
  }

  async function getStorageCredentials(credentialId, organizationId) {
    try {
      const sql = /*sql*/ `SELECT credentials_ciphertext FROM external_credential
      WHERE service_type = $1 AND credential_name = $2 AND organization_id = $3;`;

      const res = await serviceContext.dbConnections['sso'].read.query(sql, [
        's3',
        credentialId,
        String(organizationId)
      ]);
      const cipher = _.get(res, '[0].credentials_ciphertext');
      if (!cipher || !cipher.length) {
        return null;
      }
      const data = JSON.parse(cipherTextConvert('decrypt', cipher));
      if (data.type !== 's3-credentials') {
        throw new Error('Invalid credential type');
      }
      return data.payload;
    } catch (e) {
      serviceContext.logger.error('Error decrypting credentials', e);
      return null;
    }
  }

  function cipherTextConvert(operation, stringData) {
    const STORAGE_CRYPTO_CONFIG = {
      algorithm: 'aes-256-ctr',
      ivLength: 16,
      credentialTag: 's3-credentials',
      decryptKeyDefault:
        'MIIEpAIBAAKCAQEAqCrrzfGp1gwgFk4raJeTaOt8SIkYuaEYctBpmldlgonbGySf/5QA5v1Vajnt9D+8+TBK3lz6hBC49LiBa+q9fJsWP9pkPEk6irT8T6UXZZk6bJacI',
      decryptKeyConfig: 'config.s3.fileId'
    };
    // encrypt the credentials
    const key =
      process.env.CORE_GRAPHQL_DECRYPT_KEY ||
      _.get(
        serviceContext,
        STORAGE_CRYPTO_CONFIG.decryptKeyConfig,
        STORAGE_CRYPTO_CONFIG.decryptKeyDefault
      );
    const keyData = Buffer.from(key, 'base64').subarray(0, 32);

    if (operation === 'encrypt') {
      const iv = crypto.randomBytes(STORAGE_CRYPTO_CONFIG.ivLength);
      const cipher = crypto.createCipheriv(
        STORAGE_CRYPTO_CONFIG.algorithm,
        keyData,
        iv
      );
      let encryptedBuffer = cipher.update(stringData, 'utf8');
      encryptedBuffer = Buffer.concat([encryptedBuffer, cipher.final()]);
      return Buffer.concat([iv, encryptedBuffer]).toString('base64');
    } else if (operation === 'decrypt') {
      let cipherText = Buffer.from(stringData, 'base64');
      const iv = cipherText.subarray(0, STORAGE_CRYPTO_CONFIG.ivLength);
      const encryptedData = cipherText.subarray(STORAGE_CRYPTO_CONFIG.ivLength);
      let decipher = crypto.createDecipheriv(
        STORAGE_CRYPTO_CONFIG.algorithm,
        keyData,
        iv
      );
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    }
    return stringData;
  }

  function validateStorageSignedUrlInput(args) {
    if (!args.url && !args.key && args.access === 'GET') {
      throw new errors.InvalidInput({
        message:
          'Invalid input for storage signed URL - key or url is required for GET access',
        data: args
      });
    }
  }

  async function getStorageSignedUrl(context, source, args) {
    validateStorageSignedUrlInput(args.input);
    const storageConfig = await getStorageConfig(source.id);
    if (!storageConfig) {
      // Add the warnings to response and return null
      if (!context.requestInfo.warnings) {
        context.requestInfo.warnings = [];
      }
      context.requestInfo.warnings.push({
        event: 'warning',
        message:
          'SignedUrl requires storage configuration setup for the source',
        data: {
          sourceId: source.id
        }
      });
      return null;
    }

    let objKey = storageConfig.keyPrefix || '';
    if (objKey.length && !objKey.endsWith('/')) {
      objKey += '/';
    }
    if (args.input.url) {
      const urlDetails = parseUri(args.input.url);
      if (!urlDetails) {
        throw new errors.InvalidInput({
          message: 'Not a valid s3 URL',
          data: args.input.url
        });
      }
      if (
        urlDetails.region &&
        storageConfig.region &&
        urlDetails.region !== storageConfig.region
      ) {
        throw new errors.InvalidInput({
          message: 'Region URL does not match source config',
          data: {
            region: urlDetails.region,
            sourceRegion: storageConfig.region
          }
        });
      }
      if (urlDetails.bucket && urlDetails.bucket !== storageConfig.bucket) {
        throw new errors.InvalidInput({
          message: 'Bucket in URL does not match source bucket',
          data: {
            urlBucket: urlDetails.bucket,
            sourceBucket: storageConfig.bucket
          }
        });
      }
      if (urlDetails.key) {
        if (urlDetails.key.startsWith(objKey)) {
          objKey = urlDetails.key;
        } else {
          objKey += urlDetails.key;
        }
      }
    } else {
      if (args.input.key) {
        objKey += args.input.key;
      } else if (args.input.access === 'PUT') {
        objKey += uuid.v4();
      }
    }
    const credentials = await getStorageCredentials(
      storageConfig.externalCredentialId,
      source.organizationId
    );

    const signParams = {
      region: storageConfig.region || args.input.region,
      bucket: storageConfig.bucket,
      key: objKey,
      method: args.input.access,
      credentialOptions: credentials,
      ttl: Math.min(storageConfig.signedUrlTtl, args.input.expiresInSeconds)
    };

    const presignedUrl = await serviceContext.s3.presignUrl(signParams);
    return {
      url: presignedUrl,
      key: signParams.key,
      expiresInSeconds: signParams.ttl,
      expiresAtDateTime: new Date(Date.now() + signParams.ttl * 1000),
      access: args.input.access
    };
  }

  async function _getDefaultSourceOwnerForOrg(organizationId, context) {
    // First, try to fetch the oldest active org admin user
    let user = await serviceContext.dal.user.getDefaultOrgAdminUser(
        { organizationId: organizationId, getAppIdFromOrgId: true, excludeSuperAdmin: true},
        context
    )
    // If the org has no active org admin users, fetch the oldest active user
    if (_.isNil(user)) {
      const organizationGuid = await serviceContext.dal.application.getAppIdFromOrgId(
          organizationId
      );
      user = await serviceContext.dal.user.getOldestUserForOrg(organizationGuid);
    }
    // If the org has no active users, fallback to the oldest superadmin
    if (_.isNil(user)) {
      user = await serviceContext.dal.user.getOldestSuperAdmin();
    }

    return user.userId;
  }

  async function getSourceJWT(context, args) {
    const { sourceId, access } = args;

    if (_.isNil(sourceId)) {
      throw new errors.InvalidInput({
        message: 'The sourceId is required to get a JWT for a source.',
        data: {
          objectType: 'Source',
          objectId: sourceId
        }
      });
    }

    // Get the organization ID from the source.
    const sql = `SELECT 
        organization_id,
        owned_by
      FROM 
        media_source
      WHERE 
        media_source_id = $1`;

    let response;
    try {
      response = await sourceDbRead.map(
        sql,
        [sourceId],
        mapper.camelizeRootKeys
      );
    } catch (e) {
      throw new errors.InternalServerError({
        message: `An error occurred while retrieving the source. ${e.message}`,
        data: {
          objectId: sourceId,
          objectType: 'Source'
        }
      });
    }

    if (!response.length) {
      throw new errors.NotFound({
        message: 'The source for which the JWT was requested could not be found.',
        data: {
          objectId: sourceId,
          objectType: 'Source'
        }
      });
    }

    const organizationId = response[0].organizationId;
    let ownedBy = response[0].ownedBy;
    if (_.isNil(ownedBy)) {
      ownedBy = await _getDefaultSourceOwnerForOrg(organizationId, context);
    }
    const contentApplicationId = await serviceContext.dal.application.getAppIdFromOrgId(organizationId);
    const payload = {
      organizationId,
      ownedBy,
      contentApplicationId,
      access: access
    };

    const token = createJwtTokenForSource(sourceId, payload);

    return {
      token,
      sourceId,
      organizationId,
      ownerId: ownedBy
    };
  }

  function createJwtTokenForSource(sourceId, payload) {

    const jwtSecret = _.get(config, 'jwt.secret');
    const expiresIn = _.get(config, 'source.jwtExpiresIn', '6h');

    const { access } = payload;

    // Set actions based on access level (default is readwrite)
    let actions = access === 'read'
    ? [
        'aiware.folder.read',
        'aiware.slug.read',
        'aiware.source.read',
        'aiware.tdo.read',
        'aiware.job.read'
      ]
    : [
        'aiware.folder.create',
        'aiware.folder.delete',
        'aiware.folder.read',
        'aiware.folder.update',
        'aiware.slug.create',
        'aiware.slug.delete',
        'aiware.slug.read',
        'aiware.slug.update',
        'aiware.source.read',
        'aiware.tdo.create',
        'aiware.tdo.delete',
        'aiware.tdo.read',
        'aiware.tdo.update',
        'aiware.job.read',
        'aiware.job.create'
      ];

    // Security Fix: Defense-in-depth filter for restricted permissions
    const blacklist = _.get(
      config,
      'rbac.permissions.blacklist',
      []
    );
    actions = mainUtil.filterRestrictedPermissions(actions, blacklist);

    const token = jwt.sign(
      {
        contentOrganizationId: payload.organizationId,
        contentApplicationId: payload.contentApplicationId,
        userId: payload.ownedBy,
        scope: [
          {
            actions,
            resources: {
              sourceIds: [sourceId]
            }
          }
        ]
      },
      jwtSecret,
      {
        expiresIn: expiresIn,
        jwtid: uuid.v4(),
        subject: 'jwt-for-source'
      }
    );

    return token;
  }

  async function _resolveCompatibleSchema(context, currentSchemaId, oldSource) {
    if (!currentSchemaId) {
      throw new errors.InvalidInput({
        message:
          'This source cannot be edited. No schema is defined for it ' +
          '(no correlationSchemaId on the source or its source type). ' +
          'Please create a new source.',
        data: {
          sourceId: oldSource.id,
          sourceTypeId: oldSource.sourceTypeId
        }
      });
    }

    try {
      // Check if the current schema is still published
      const currentSchema = await dalStructuredData.getSchema(
        context,
        { id: currentSchemaId, _skipAccessCheck: true }
      );

      // If the current schema is published, return it
      if (currentSchema && currentSchema.status === 'published') {
        return currentSchemaId;
      }

      // If sourceTypeId is missing we cannot look up a replacement schema.
      if (!oldSource.sourceTypeId) {
        throw new errors.InvalidInput({
          message:
            'This source cannot be edited. Its schema is no longer published ' +
            'and the source has no source type to find a replacement. ' +
            'Please create a new source.',
          data: {
            sourceId: oldSource.id,
            currentSchemaId,
            schemaStatus: currentSchema ? currentSchema.status : 'unknown'
          }
        });
      }

      // If not, check the source type's schema
      const sourceType = await getSourceType(context, {
        sourceTypeId: oldSource.sourceTypeId
      });

      const sourceTypeSchemaId = sourceType.configSchemaId;
      if (!sourceTypeSchemaId || sourceTypeSchemaId === currentSchemaId) {
        throw new errors.InvalidInput({
          message:
            "This source cannot be edited. Its schema is no longer published " +
            "and the source type has no updated schema available. " +
            "Please create a new source.",
          data: {
            sourceId: oldSource.id,
            sourceTypeId: oldSource.sourceTypeId,
            currentSchemaId,
            schemaStatus: currentSchema ? currentSchema.status : 'unknown',
          }
        });
      }

      // Get the source type's current schema
      const sourceTypeSchema = await dalStructuredData.getSchema(
        context,
        { id: sourceTypeSchemaId, _skipAccessCheck: true }
      );

      // Source type schema is not published either, cannot migrate
      if (!sourceTypeSchema || sourceTypeSchema.status !== 'published') {
        throw new errors.InvalidInput({
          message:
            "This source cannot be edited. The source type\'s current schema " +
            "is no longer published. Please create a new source.",
          data: {
            sourceId: oldSource.id,
            sourceTypeId: oldSource.sourceTypeId,
            currentSchemaId,
            sourceTypeSchemaId,
            schemaStatus: sourceTypeSchema ? sourceTypeSchema.status : 'unknown',
          }
        });
      }

      // Verify both schemas belong to the same data registry, if not, throw error
      if (currentSchema.dataRegistryMetadataId !== sourceTypeSchema.dataRegistryMetadataId) {
        throw new errors.InvalidInput({
          message:
            "This source cannot be edited. The source type\'s schema belongs " +
            "to a different data registry than the source\'s current schema. " +
            "This source is no longer compatible with the source type. Please create a new source.",
          data: {
            sourceId: oldSource.id,
            sourceTypeId: oldSource.sourceTypeId,
            currentSchemaId,
            sourceTypeSchemaId,
            currentSchemaDataRegistryId: currentSchema.dataRegistryMetadataId,
            sourceTypeSchemaDataRegistryId: sourceTypeSchema.dataRegistryMetadataId
          }
        });
      }

      // Verify if it's a minor version update (same major version), if not, throw error
      if (currentSchema.majorVersion !== sourceTypeSchema.majorVersion) {
        throw new errors.InvalidInput({
          message:
            "This source cannot be edited. The source type\'s current schema has been " +
            "updated to a new major version than the source\'s current schema. " +
            "This source is no longer compatible with the source type. Please create a new source.",
          data: {
            sourceId: oldSource.id,
            currentSchemaId,
            sourceTypeSchemaId,
            currentSchemaVersion: `${currentSchema.majorVersion}.${currentSchema.minorVersion}`,
            sourceTypeSchemaVersion: `${sourceTypeSchema.majorVersion}.${sourceTypeSchema.minorVersion}`
          }
        });
      }

      // Verify if the source type schema is a newer minor version than the current schema
      if (sourceTypeSchema.minorVersion <= currentSchema.minorVersion) {
        throw new errors.InvalidInput({
          message:
            "This source cannot be edited. The source type\'s current schema " +
            "has a minor version that is not newer than the source\'s current schema. " +
            "This source is no longer compatible with the source type. Please create a new source.",
          data: {
            sourceId: oldSource.id,
            currentSchemaId,
            sourceTypeSchemaId,
            currentSchemaVersion: `${currentSchema.majorVersion}.${currentSchema.minorVersion}`,
            sourceTypeSchemaVersion: `${sourceTypeSchema.majorVersion}.${sourceTypeSchema.minorVersion}`
          }
        });
      }

      // All checks passed, return the source type's current schema ID
      return sourceTypeSchemaId;
    } catch (err) {
      // Re-throw known errors, log and throw generic error for unexpected ones
      if (err instanceof errors.InvalidInput) {
        throw err;
      }

      logger.warn(
        `_resolveCompatibleSchema: Error checking schema compatibility ` +
          `for source ${oldSource.id}, falling back to original schema ${currentSchemaId}`,
        err.message
      );

      return currentSchemaId;
    }
  }

  return {
    getSource,
    getSourcesQuery,
    getSources,
    createSource,
    updateSource,
    deleteSource,
    getSourceContentTemplates,
    createSourceContentTemplate,
    deleteSourceContentTemplate,
    getSourcesForSchedule,
    getSourcePermission,
    getDetails,
    getCollaborators,
    getStorageSignedUrl,
    getSourceJWT,

    //just for unit test
    updateSourceCollaborators,
    getSourceIdsForSchedule,
    cacheSourceFormats,
    getSourceFormatId,
    getDetailsFromDb,
    getMarketIds,
    setMarketIds,
    setNetworkIds,
    getNetworkIds,
    clearDetails,
    createContentTemplateSql,
    setStorageConfig,
    validateStorageConfig,
    setStorageCredentials,
    getStorageCredentials,
    cipherTextConvert,

    // exposed for testing
    _resolveCompatibleSchema
  };
};
