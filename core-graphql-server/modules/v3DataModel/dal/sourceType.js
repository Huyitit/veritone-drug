const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const { logger, config, dbConnections } = serviceContext;
  const mainUtil = require('../../../util.js')();
  const errors = require('../../../error/index.js')(config);

  const sourceDbRead = dbConnections['media_platform'].read;
  const sourceDbWrite = dbConnections['media_platform'].write;

  const messageUtil = serviceContext.messageUtil;

  function map(row) {
    return mapper.camelizeRootKeys(row);
  }

  const sourceTypeSelectData = {
    media_source_type_id: 'id',
    media_source_type_name: 'name',
    date_modified: 'modified_date_time',
    created_date_time: null,
    config_schema_id: 'source_schema_id',
    credential_type: null,
    owner_organization_id: 'organization_id',
    is_live: null,
    requires_scan_pipeline: null,
    is_public: null,
    media_source_type_category: 'category_id',
    icon_class: null
  };

  const sourceTypeSelect = `
  s.media_source_type_id AS id,
  s.media_source_type_name AS name,
  s.date_modified AS modified_date_time,
  s.created_date_time,
  s.config_schema_id AS source_schema_id,
  s.credential_type,
  s.owner_organization_id AS organization_id,
  s.requires_scan_pipeline,
  s.is_live,
  s.is_public,
  s.media_source_type_category AS category_id,
  s.icon_class
  `;

  async function getSourceType(context, args) {
    mainUtil.checkId(args.id, false, true);

    const res = await getSourceTypes(context, args);

    if (!res.count) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'SourceType'
        }
      });
    }
    return res.records[0];
  }

  async function getSourceTypes(context, args) {
    const values = [];
    const where = [];

    let sourceTypeIds = [];
    if (args.id) {
      sourceTypeIds.push(args.id);
    }
    if (args.ids) {
      sourceTypeIds = sourceTypeIds.concat(args.ids);
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
    mainUtil.addSqlWhere(
      's.media_source_type_category',
      args.categoryId,
      where,
      values
    );

    // is_live can be null, which means false.
    if (_.has(args, 'isLive')) {
      if (args.isLive === true) {
        mainUtil.addSqlWhere('s.is_live', args.isLive, where, values);
      } else {
        where.push(`(s.is_live IS NULL OR s.is_live = false)`);
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `
  SELECT
    ${sourceTypeSelect}
  FROM
    media_source_type AS s
  ${whereClause}
  ORDER BY media_source_type_id
  OFFSET ${args.offset || 0}
  LIMIT ${args.limit || 30}
    `;

    // TODO we fake details as empty on legacy schema
    const res = await sourceDbRead.map(sql, values, (row) =>
      Object.assign({ details: {} }, map(row))
    );

    return mainUtil.toPage(args, res);
  }

  async function createSourceType(context, args) {
    const input = args.input;

    const columns = {
      is_public: input.isPublic,
      owner_organization_id: input.organizationId,
      media_source_type_name: input.name,
      config_schema_id: input.sourceSchemaId,
      is_live: input.isLive,
      requires_scan_pipeline: input.requiresScanPipeline,
      credential_type: input.credentialType,
      media_source_type_category: input.categoryId
    };

    // validate input
    await getSourceTypeCategory(context, { id: input.categoryId });
    const { sql, values } = mainUtil.makeInsertSql(
      'media_source_type',
      columns,
      sourceTypeSelectData
    );
    const res = await sourceDbWrite.map(sql, values, map);

    return res[0];
  }

  async function updateSourceType(context, args) {
    const input = args.input;
    mainUtil.checkId(input.id, false, true); // require and validate ID
    mainUtil.checkId(input.organizationId, false, true); // require and validate ID
    const st = await getSourceType(context, {
      id: input.id,
      organizationId: input.organizationId
    });

    const columns = {
      is_public: input.isPublic,
      media_source_type_name: input.name,
      config_schema_id: input.sourceSchemaId,
      is_live: input.isLive,
      requires_scan_pipeline: input.requiresScanPipeline,
      credential_type: input.credentialType,
      media_source_type_category: input.categoryId
    };

    // if no data was modified, just return back the object now
    if (!_.compact(Object.values(columns)).length) {
      return st;
    }
    const where = `
media_source_type_id = ${input.id}
    `;
    const { sql, values } = mainUtil.makeUpdateSql(
      'media_source_type',
      columns,
      sourceTypeSelectData,
      where
    );

    const res = await sourceDbWrite.map(sql, values, map);
    const event = {
      organizationId: input.organizationId,
      id: input.id,
      type: 'program',
      event: 'source_type_updated'
    };
    messageUtil.emitEvent(event, 'events');
    return res[0];
  }

  async function deleteSourceType(context, args) {
    mainUtil.checkId(args.id, false, true); // require and validate ID
    mainUtil.checkId(args.organizationId, false, true);
    const sql = `
DELETE FROM
  media_source_type
WHERE
  media_source_type_id = $1
  AND owner_organization_id = $2
RETURNING
  media_source_type_id;
    `;
    const values = [args.id, args.organizationId];
    const res = await sourceDbWrite.query(sql, values);

    if (!res.length) {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'SourceType'
        }
      });
    }
    const event = {
      organizationId: args.organizationId,
      id: args.id,
      type: 'program',
      event: 'source_type_deleted'
    };
    messageUtil.emitEvent(event, 'events');
    return {
      id: args.id,
      message: 'SourceType deleted'
    };
  }

  // from a watchlist object, got all source type IDs.
  async function getCombinedSourceTypeIds(
    context,
    dalSource,
    dalSchedule,
    object
  ) {
    // first we get the source type ids diretly off watchlist
    const ids = object.sourceTypeIds || [];
    if (object.sourceTypeId && !ids.includes(object.sourceTypeId)) {
      ids.push(object.sourceTypeId);
    }
    // now get schedules and their IDs.
    const schedules = await dalSchedule.getSchedulesForWatchlist(
      context,
      { organizationId: object.organizationId, offset: 0, limit: 1000 },
      object.id
    );
    const sIds = schedules.records.map((sched) => sched.id);
    // now get all sources
    const sources = await dalSource.getSourcesForSchedule(context, {
      ids: sIds,
      organizationId: object.organizationId,
      offset: 0,
      limit: 1000
    });
    const idsFromSource = sources.records.map((source) => source.sourceTypeId);
    const allIds = _.concat(idsFromSource, ids);
    const result = _.uniqBy(allIds, (num) => num);

    return result;
  }

  function getSupportedRunModes(sourceType) {
    if (sourceType.id === 10) return ['Once']; // evil hack, see VTN-9857
    // see rules in VTN-8745, VTN-10799
    const res = [];
    if (!sourceType.isLive) res.push('Now');
    if (sourceType.isLive === true || sourceType.requiresScanPipeline) {
      res.push('Once');
      res.push('Recurring');
    }
    if (sourceType.isLive === true) res.push('Continuous');
    return res;
  }

  function getSourceTypeCategories(context, args) {
    // the list of source type categories is hard-coded and is based
    // on the original 5 source types.
    const data = {
      records: [
        {
          id: 1,
          name: 'Audio'
        },
        {
          id: 2,
          name: 'Broadcast TV'
        },
        {
          id: 3,
          name: 'YouTube'
        },
        {
          id: 4,
          name: 'Podcast'
        },
        {
          id: 5,
          name: 'General'
        }
      ],
      count: 5,
      offset: 0,
      limit: 30
    };

    // if we were given an ID, just filter
    if (args.id) {
      // handle array of
      const ids = _.isArray(args.id)
        ? args.id.map((id) => _.toString(id))
        : [_.toString(args.id)];
      data.records = data.records.filter((record) =>
        ids.includes(_.toString(record.id))
      );
      data.count = data.records.length;
    }
    return data;
  }

  function getSourceTypeCategory(context, args) {
    const res = getSourceTypeCategories(context, args);
    if (!res.count) {
      throw new errors.NotFound({
        message: 'The requested source type category does not exist.',
        data: {
          objectId: args.id,
          objectType: 'SourceTypeCategory'
        }
      });
    }
    return res.records[0];
  }

  async function getSourceTypeFormats(context, sourceType) {
    const sql = `
SELECT
  media_source_format_name AS name
FROM
  media_source_format
WHERE
  media_source_type_id = $1
    `;

    return sourceDbRead.map(sql, [sourceType.id], (row) => row.name);
  }

  async function getSourceTypeProgramFormats(context, sourceType) {
    const sql = `
SELECT
  program_format_name AS name
FROM
  program_format
WHERE
  media_source_type_id = $1
    `;

    return sourceDbRead.map(sql, [sourceType.id], (row) => row.name);
  }

  return {
    getSourceType,
    getSourceTypes,
    createSourceType,
    updateSourceType,
    deleteSourceType,
    getSupportedRunModes,
    getCombinedSourceTypeIds,
    getSourceTypeCategory,
    getSourceTypeCategories,
    getSourceTypeFormats,
    getSourceTypeProgramFormats
  };
};
