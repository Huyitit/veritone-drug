const _ = require('lodash');
const mapper = require('../../../dal/mapper.js');

module.exports = function createFunction(serviceContext) {
  const resUtil = require('../../../resolvers/util.js')(serviceContext);
  const util = require('../../../util.js')();
  const errors = require('../../../error')(serviceContext.config);
  const dagTemplateReturning = {
    template_id: 'id',
    name: null,
    description: null,
    cognitive_category_id: null,
    mime_type: null,
    dag: null,
    dag_language: 'dag_template_language',
    organization_id: 'target_organization_id',
    tags: null
  };
  const dagTemplateSelect = `
    dt.template_id AS id,
    dt.name,
    dt.description,
    dt.cognitive_category_id,
    dt.mime_type,
    dt.dag,
    dt.dag_language AS dag_template_language,
    dt.organization_id AS target_organization_id,
    dt.deleted_date as deleted_date_time,
    dt.created_date as created_date_time,
    dt.updated_date as modified_date_time,
    dt.tags
  `;

  async function getDagTemplates(context, args) {
    const defaultLimit = _.get(
      serviceContext,
      'config.paging.defaultLimit',
      30
    );
    const whereAnd = [];
    const values = [];
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (args.organizationId && !isSuperAdmin) {
      values.push(args.organizationId);
      whereAnd.push(
        `(dt.organization_id = \$${values.length} OR dto.organization_id = \$${values.length})`
      );
    }

    util.addSqlWhere('dt.template_id', args.id, whereAnd, values);
    util.addSqlWhere(
      'dt.cognitive_category_id',
      args.cognitiveCategoryId,
      whereAnd,
      values
    );
    util.addSqlWhere('dt.mimeType', args.mimeType, whereAnd, values);
    util.makeLikeClause(
      'dt.name',
      args.name,
      whereAnd,
      values,
      'contains',
      false
    );
    whereAnd.push('deleted_date is null');

    const whereOrTags = [];
    let unnestTagsField = '';
    if (args.tags) {
      _.forEach(args.tags, (tag) => {
        // add clause for tag match, if tag was passed. case-insensitive.
        util.makeLikeClause(
          'tag',
          tag,
          whereOrTags,
          values,
          args.tagMatch,
          false
        );
      });
    }
    if (whereOrTags.length) {
      whereAnd.push(`(${whereOrTags.join(' OR ')})`);
      unnestTagsField = ', unnest(dt.tags) tag';
    }

    const whereClause = whereAnd.length
      ? ' WHERE\n   ' + whereAnd.join(' AND ')
      : '';
    const orderClause = [];

    orderClause.push('dt.created_date desc');

    const sql = `
      SELECT DISTINCT
        ${dagTemplateSelect}
      FROM job_new.dag_template dt
        LEFT JOIN job_new.dag_template__organization dto ON dto.template_id = dt.template_id
        ${unnestTagsField}
      ${whereClause}
      ORDER BY
        ${orderClause.join(', ')}
      OFFSET ${args.offset || 0}
      LIMIT ${args.limit || defaultLimit}
    `;
    const rows = await serviceContext.dbConnections['core'].read.map(
      sql,
      values,
      mapper.camelizeRootKeys
    );

    return util.toPage(args, rows);
  }

  async function createDagTemplateDb(context, dagTemplate) {
    const columnData = {
      name: dagTemplate.name,
      description: dagTemplate.description || '',
      cognitive_category_id: dagTemplate.cognitiveCategoryId,
      mime_type: dagTemplate.mimeType,
      dag: dagTemplate.dag,
      dag_language: dagTemplate.dagTemplateLanguage,
      organization_id: dagTemplate.targetOrganizationId,
      tags: _.isEmpty(dagTemplate.tags) ? null : dagTemplate.tags
    };

    const { sql, values } = util.makeInsertSql(
      'job_new.dag_template',
      columnData,
      dagTemplateReturning
    );

    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  function updateDagTemplateDb(dagTemplate) {
    const columnData = {
      name: dagTemplate.name,
      description: dagTemplate.description,
      cognitive_category_id: dagTemplate.cognitiveCategoryId,
      mime_type: dagTemplate.mimeType,
      dag: dagTemplate.dag,
      dag_language: dagTemplate.dagTemplateLanguage,
      tags: _.isArray(dagTemplate.tags)
        ? _.isEmpty(dagTemplate.tags)
          ? {}
          : dagTemplate.tags
        : dagTemplate.tags
    };

    const { sql, values } = util.makeUpdateSql(
      'job_new.dag_template',
      columnData,
      dagTemplateReturning,
      `template_id = '${dagTemplate.id}'`
    );
    return serviceContext.dbConnections['core'].write.one(
      sql,
      values,
      mapper.camelizeRootKeys
    );
  }

  async function deleteDagTemplate(context, args) {
    const currEpochTime = parseInt(new Date() / 1000, 10);
    const sql = `UPDATE job_new.dag_template
      SET deleted_date = $1
      WHERE template_id = $2
        and organization_id = $3
        and deleted_date is null
      RETURNING template_id as id`;
    const values = [currEpochTime, args.id, args.organizationId];
    try {
      const deletedDagTemplate = await serviceContext.dbConnections[
        'core'
      ].write.one(sql, values, mapper.camelizeRootKeys);

      return {
        id: deletedDagTemplate.id,
        message: 'DAG Template deleted'
      };
    } catch (err) {
      if (_.get(err, 'data.internalData.code') === 0) {
        serviceContext.logger.error(err);
        throw new errors.NotAllowed({
          message: 'Template not available or incorrect OrgId.'
        });
      }
      throw err;
    }
  }

  async function addDagTemplateToOrganization(context, args) {
    const dagTemplateId = _.get(args, 'input.dagTemplateId');
    const orgId = _.get(args, 'input.organizationId');

    if (!dagTemplateId || !orgId) {
      throw new errors.InvalidInput({
        message: 'dagTemplateId and organizationId is required'
      });
    }

    let sql = `INSERT INTO job_new.dag_template__organization
      (
        template_id,
        organization_id
      ) VALUES (
        $1,
        $2
      );`;

    try {
      await serviceContext.dbConnections['core'].write.query(sql, [
        dagTemplateId,
        orgId
      ]);
    } catch (error) {
      serviceContext.logger.error(error);
    }

    return getDagTemplateOrganizations(context, { id: dagTemplateId });
  }

  async function getDagTemplateOrganizations(context, args) {
    util.checkId(args.id, false);

    const sql = `SELECT 	organization_id
      FROM 	  job_new.dag_template__organization dto
      WHERE 	template_id = $1;`;
    const res = await serviceContext.dbConnections['core'].read.map(
      sql,
      [args.id],
      mapper.camelizeRootKeys
    );

    return {
      dagTemplateId: args.id,
      organizationIds: _.map(res, (o) => o.organizationId)
    };
  }

  async function removeDagTemplateFromOrganization(context, args) {
    const dagTemplateId = _.get(args, 'input.dagTemplateId');
    const orgId = _.get(args, 'input.organizationId');

    if (!dagTemplateId || !orgId) {
      throw new errors.InvalidInput({
        message: 'dagTemplateId and organizationId is required'
      });
    }

    const sql = `DELETE FROM job_new.dag_template__organization
      WHERE	organization_id = $1
        AND template_id = $2
      RETURNING template_id, organization_id;`;

    try {
      await serviceContext.dbConnections['core'].write.map(
        sql,
        [orgId, dagTemplateId],
        mapper.camelizeRootKeys
      );
    } catch (error) {
      serviceContext.logger.error(error);
    }

    return getDagTemplateOrganizations(context, { id: dagTemplateId });
  }

  return {
    createDagTemplateDb,
    getDagTemplates,
    updateDagTemplateDb,
    deleteDagTemplate,
    addDagTemplateToOrganization,
    removeDagTemplateFromOrganization
  };
};
