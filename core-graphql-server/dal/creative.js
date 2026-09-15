const mapper = require('../dal/mapper'),
  _ = require('lodash'),
  moment = require('moment');

module.exports = function createFunction(serviceContext) {
  const { dbConnections, config } = serviceContext;
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')();
  const creativeColumns = {
    creative_id: 'id',
    creative_name: 'name',
    creative_keywords: '"keywords"',
    organization_id: '"organizationId"',
    advertiser_id: '"advertiserId"',
    brand_id: '"brandId"',
    start_date: '"startDate"',
    stop_date: '"stopDate"',
    date_created: '"createdDateTime"',
    date_modified: '"modifiedDateTime"'
  };

  async function getCreative(args, context) {
    if (!args.id) {
      throw new errors.InvalidInput({
        message: 'Invalid creativeId',
        data: {
          objectId: args.id,
          objectType: 'Creative'
        }
      });
    }

    const orgId =
      args.organizationId ||
      _.get(context, 'requestContext.userInfo.organization.organizationId');

    const sql = `SELECT ${mainUtil.makeSelectClause(creativeColumns)}
    FROM creative
    WHERE creative_id = $1
      AND organization_id = $2`;
    const creative = await dbConnections['media_platform'].read.map(
      sql,
      [args.id, orgId],
      mapper.camelizeRootKeys
    );

    if (creative.length > 0) {
      return _.get(creative, '0');
    } else {
      throw new errors.NotFound({
        data: {
          objectId: args.id,
          objectType: 'Creative'
        }
      });
    }
  }

  async function createCreative(args) {
    const { input, organizationId } = args;

    const columnData = {
      creative_name: input.name,
      creative_keywords: input.keywords,
      organization_id: organizationId,
      brand_id: input.brandId,
      advertiser_id: input.advertiserId
    };
    const { sql, values } = mainUtil.makeInsertSql(
      'creative',
      columnData,
      creativeColumns
    );
    const newCreative = await dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return _.get(newCreative, '0');
  }

  async function updateCreative(args) {
    const { input, organizationId } = args;

    if (!input.id) {
      throw new errors.InvalidInput({
        message: 'Invalid id',
        data: {
          objectId: input.id,
          objectType: 'CreativeId'
        }
      });
    }

    const columns = {
      creative_name: input.name,
      creative_keywords: input.keywords,
      brand_id: input.brandId,
      advertiser_id: input.advertiserId,
      date_modified: moment.utc().toISOString()
    };
    const { sql, values } = mainUtil.makeUpdateSql(
      'creative',
      columns,
      creativeColumns,
      `creative_id = ${input.id} AND organization_id = ${organizationId}`
    );
    const updatedCreative = await dbConnections['media_platform'].write.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return _.get(updatedCreative, '0');
  }

  async function deleteCreative(args) {
    const { id, organizationId } = args;

    if (!id) {
      throw new errors.InvalidInput({
        message: 'Creative ID is required'
      });
    }
    const sql = `
      DELETE FROM
        creative
      WHERE creative_id = $1
        AND organization_id = $2
      RETURNING
        creative_id as id
    `;
    const deletedCreative = await dbConnections[
      'media_platform'
    ].write.query(sql, [id, organizationId]);

    return _.get(deletedCreative, '0');
  }

  return {
    getCreative,
    createCreative,
    updateCreative,
    deleteCreative
  };
};
