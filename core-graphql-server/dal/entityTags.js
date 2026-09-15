const _ = require('lodash');
const mapper = require('./mapper.js');

module.exports = function createFunction(serviceContext) {
  const { config } = serviceContext;
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(config);

  async function _updateEntityTagsDb(tagData) {
    const {
      entityId,
      organizationId,
      entityType,
      userId,
      entityTags
    } = tagData;

    let valuesSql = [];
    const values = [entityId, entityType, organizationId, userId];

    let sql = `
      DELETE
        from job_new.entity_tags
      WHERE
        entity_id = $1
      AND
        entity_type = $2
      AND
        organization_id = $3;
    `;

    if (entityTags.length > 0) {
      entityTags.forEach((tag, index) => {
        valuesSql.push(
          `($1, $2, $3, $${values.length + 1}, $${values.length + 2}, $4, $4)`
        );

        values.push(tag.tagKey, tag.tagValue || null);
      });

      valuesSql = valuesSql.join(',');

      sql += `
         INSERT INTO job_new.entity_tags (
        entity_id,
        entity_type,
        organization_id,
        tag_key,
        tag_value,
        created_by,
        modified_by
      )
      VALUES
          ${valuesSql}
      ON CONFLICT (organization_id, entity_type, entity_id, tag_key)
      DO UPDATE SET
        tag_value = EXCLUDED.tag_value,
        modified_by = EXCLUDED.modified_by
      RETURNING
        entity_id,
        entity_type,
        organization_id,
        tag_key,
        tag_value;
      `;
    }

    const results = await serviceContext.dbConnections['core'].write.query(
      sql,
      values
    );

    return results;
  }

  async function updateEntityTags(tagData, newObject, context) {
    if (_.isNil(tagData.entityTags)) return;

    const userId =
      _.get(context, 'requestContext.userInfo.userId') ||
      _.get(context, 'requestContext.tokenInfo.applicationId', 'system');

    tagData.userId = userId;

    const updatedTags = await doUpdateEntityTags(tagData);
    newObject.entityTags = updatedTags;
  }

  async function doUpdateEntityTags(tagData) {
    try {
      return await _updateEntityTagsDb(tagData);
    } catch (err) {
      serviceContext.logger.error(err);
      throw new errors.InternalServerError(err);
    }
  }

  async function getEntityTags(entityId, entityType, orgId) {
    const sql = `
      SELECT
        entity_type,
        tag_key,
        tag_value
      FROM
        job_new.entity_tags
      WHERE
        entity_id = $1
      AND
        entity_type = $2
      AND
        organization_id = $3;
    `;

    return await serviceContext.dbConnections['core'].read.map(
      sql,
      [entityId, entityType, orgId],
      mapper.mapEntityTags
    );
  }

  async function getMatchedEntityTags(options) {
    let sql = `
      SELECT
        DISTINCT(et.tag_key),
        et.tag_value
      FROM
        job_new.entity_tags et
      WHERE
        et.tag_key ~ $1
      AND
        et.organization_id = $2
    `;

    const args = [`${options.input.tagKey}.*`, options.organizationId];

    if (options.input.entityType) {
      sql += ` AND et.entity_type = $3`;
      args.push(options.input.entityType);
    }

    sql += ` ORDER BY et.tag_key`;

    if (Number.isInteger(options.limit)) {
      args.push(options.limit);
      sql += ` LIMIT \$${args.length}`;
    }
    if (Number.isInteger(options.offset)) {
      args.push(options.offset);
      sql += ` OFFSET \$${args.length}`;
    }

    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.mapEntityTags
    );

    return mainUtil.toPage(options, rows);
  }

  async function getEntityIdsByTagKeys(tagKeys, orgId, entityType) {
    let sql = `
      SELECT
        DISTINCT(et.entity_id),
        et.entity_type
      FROM
        job_new.entity_tags et
      WHERE
        et.tag_key = ANY($1)
      AND
        et.organization_id = $2
    `;

    const args = [tagKeys, orgId];

    if (entityType) {
      sql += ` AND et.entity_type = $3`;
      args.push(entityType);
    }

    const res = await serviceContext.dbConnections['core'].read.map(
      sql,
      args,
      mapper.camelizeRootKeys
    );

    return _.map(res, 'entityId');
  }

  return {
    updateEntityTags,
    doUpdateEntityTags,
    getEntityTags,
    getMatchedEntityTags,
    getEntityIdsByTagKeys
  };
};
