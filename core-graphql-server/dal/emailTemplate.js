const _ = require('lodash');
const mapper = require('./mapper.js');
const Handlebars = require('handlebars');

module.exports = function createFunction(serviceContext, config) {
  const errors = require('../error')(config);
  const mainUtil = require('../util.js')(serviceContext);
  const resUtil = require('../resolvers/util.js')(serviceContext);

  const emailTemplateReturning = {
    email_template_id: null,
    organization_guid: null,
    code: null,
    lang: null,
    default_args: null,
    default_from_name: null,
    default_subject: null,
    updated_by: null,
    created_date: null,
    updated_date: null
  };

  async function emailTemplateCreate(input, context) {
    if (!input.id) {
      throw new Error('Email Template Id is required');
    }

    const pageResult = await getEmailTemplates(context, {
      ids: [input.id],
      organizationGuid: input.organizationGuid
    });
    const emailTemplate = pageResult?.records?.[0];

    if (!_.isEmpty(emailTemplate)) {
      throw new Error('Email Template already exists');
    }
    if (input.lang === 'Handlebars') {
      try {
        const template = Handlebars.compile(input.code, { strict: true });
        template(input.defaultArgs || {});
      } catch (err) {
        throw new Error(
          `Invalid Handlebars template: ${err.message}. All template variables must have a corresponding defaultArg.`
        );
      }
    }
    const clientInfo = resUtil.getClientInfo(context);
    // column data
    const columnData = {
      email_template_id: input.id,
      organization_guid: input.organizationGuid || null,
      code: input.code ? JSON.stringify(input.code) : null,
      lang: input.lang || null,
      default_args: input.defaultArgs
        ? JSON.stringify(input.defaultArgs)
        : null,
      default_from_name: input.defaultFromName || null,
      default_subject: input.defaultSubject || null,
      updated_by: clientInfo.id
    };

    const { sql, values } = mainUtil.makeInsertSql(
      'aiware.email_template',
      columnData,
      emailTemplateReturning
    );

    try {
      const result = await serviceContext.dbConnections['core'].write.map(
        sql,
        values,
        mapper.mapEmailTemplate
      );
      return result[0];
    } catch (err) {
      serviceContext.logger.error(err);
      throw new Error('Error creating email template');
    }
  }

  async function getEmailTemplate(context, options) {
    if (!options.id) {
      throw new Error('Email Template Id is required');
    }
    options.ids = [options.id];
    const pageResult = await getEmailTemplates(context, options);
    const emailTemplate = pageResult?.records?.[0];

    if (!emailTemplate) {
      throw new Error('Email template not found');
    }

    return emailTemplate;
  }

  async function getEmailTemplates(context, options) {
    try {
      const { sql, args } = await _getEmailTemplatesQuery(context, options);
      const rows = await serviceContext.dbConnections['core'].read.map(
        sql,
        args,
        mapper.mapEmailTemplate
      );
      return mainUtil.toPage(options, rows);
    } catch (err) {
      serviceContext.logger.error(err);
      throw new Error('Error getting email template');
    }
  }

  async function _getEmailTemplatesQuery(context, options) {
    const { ids, limit, offset, orderBy, organizationGuid } = options;
    let sql = `
    SELECT
      et.email_template_id,
      et.organization_guid,
      et.code,
      et.lang,
      et.default_args,
      et.default_from_name,
      et.default_subject,
      et.updated_by,
      et.created_date,
      et.updated_date
    FROM
      aiware.email_template et
  `;
    const args = [];
    const where = [];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      args.push(ids);
      where.push(`et.email_template_id = ANY($${args.length})`);
    }

    if (organizationGuid) {
      args.push(organizationGuid);
      where.push(`et.organization_guid = $${args.length}`);
    } else {
      where.push('et.organization_guid IS NULL');
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    if (orderBy && orderBy.field) {
      const columnMapping = {
        email_template_id: 'et.email_template_id',
        code: 'et.code',
        createdDateTime: 'et.created_date',
        modifiedDateTime: 'et.updated_date'
      };
      const { field, direction } = orderBy;

      if (columnMapping[field]) {
        sql += ` ORDER BY ${columnMapping[field]} ${
          direction === 'asc' ? 'ASC' : 'DESC'
        }`;
      }
    }

    // Apply limit if provided
    if (Number.isInteger(limit)) {
      args.push(limit);
      sql += ` LIMIT $${args.length}`;
    }

    // Apply offset if provided
    if (Number.isInteger(offset)) {
      args.push(offset);
      sql += ` OFFSET $${args.length}`;
    }

    return { sql, args };
  }

  async function emailTemplateUpdate(args, context) {
    const { id, organizationGuid } = args;
    if (!id) {
      throw new Error('Email Template Id is required');
    }

    const emailTemplate = await getEmailTemplate(context, {
      id,
      organizationGuid
    });
    if (_.isEmpty(emailTemplate)) {
      throw new errors.NotFound({
        message: 'Email Template not found',
        data: {
          id
        }
      });
    }

    const updatedValues = _.merge(emailTemplate, args);

    if (updatedValues.lang === 'Handlebars') {
      try {
        const template = Handlebars.compile(updatedValues.code, { strict: true });
        template(updatedValues.defaultArgs || {});
      } catch (err) {
        throw new Error(
          `Invalid Handlebars template: ${err.message}. All template variables must have a corresponding defaultArg.`
        );
      }
    }

    let updatedEmailTemplate;
    try {
      const { sql, values } = await _emailTemplateUpdateQuery(
        updatedValues,
        context
      );
      updatedEmailTemplate = await serviceContext.dbConnections[
        'core'
      ].write.map(sql, values, mapper.mapEmailTemplate);
    } catch (err) {
      serviceContext.logger.error(err);
      throw new Error('Error updating email template');
    }

    updatedEmailTemplate = _.get(updatedEmailTemplate, '0');

    return updatedEmailTemplate;
  }

  async function _emailTemplateUpdateQuery(input, context) {
    const {
      id,
      code,
      lang,
      defaultFromName,
      defaultSubject,
      defaultArgs,
      organizationGuid
    } = input;
    const clientInfo = resUtil.getClientInfo(context);
    const columnData = {
      code: code ? JSON.stringify(code) : null,
      lang: lang || null,
      default_args: defaultArgs ? JSON.stringify(defaultArgs) : null,
      default_from_name: defaultFromName || null,
      default_subject: defaultSubject || null,
      updated_by: clientInfo.id
    };

    const selectData = {
      email_template_id: 'email_template_id',
      code: null,
      lang: null,
      default_args: null,
      default_from_name: null,
      default_subject: null,
      organization_guid: null,
      updated_by: null,
      created_date: null,
      updated_date: null
    };
    const filteredValues = Object.values(columnData).filter(
      (data) => data !== null && data !== undefined
    );
    const whereClause = `
    email_template_id = $${filteredValues.length + 1}
    ${
      organizationGuid
        ? `AND organization_guid = $${filteredValues.length + 2}`
        : `AND organization_guid IS NULL`
    }
  `;

    const { sql, values } = mainUtil.makeUpdateSql(
      'aiware.email_template',
      columnData,
      selectData,
      whereClause
    );
    values.push(id);
    values.push(organizationGuid);
    return { sql, values };
  }

  async function emailTemplateDelete(options, context) {
    const { id, organizationGuid } = options;

    if (!id) {
      throw new Error('emailTemplateId is required');
    }
    // organizationGuid is required here, so this can only delete org-scoped templates.
    // Global templates (null organization_guid) are intentionally not deletable through
    // this path — the DELETE below matches organization_guid = $2 and has no null org to
    // match. See the emailTemplateDelete schema doc comment.
    if (!organizationGuid) {
      throw new Error('organizationGuid is required');
    }

    let deleteResult;
    try {
      const deleteEmailTemplateSql = `
        DELETE FROM aiware.email_template
        WHERE email_template_id = $1 AND organization_guid = $2
        RETURNING *
      `;

      deleteResult = await serviceContext.dbConnections['core'].write.map(
        deleteEmailTemplateSql,
        [id, organizationGuid],
        mapper.mapEmailTemplate
      );

      if (_.isEmpty(deleteResult)) {
        throw new errors.InternalServerError({
          message:
            'Email template deletion was not successful, check template id and try again'
        });
      } else {
        return deleteResult?.[0];
      }
    } catch (error) {
      serviceContext.logger.error(error);
      throw new errors.InternalServerError(error);
    }
  }

  return {
    emailTemplateCreate,
    emailTemplateUpdate,
    emailTemplateDelete,
    getEmailTemplates,
    getEmailTemplate,
    _getEmailTemplatesQuery,
    _emailTemplateUpdateQuery
  };
};
