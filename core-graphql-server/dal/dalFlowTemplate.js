const _ = require('lodash');
const table = 'job_new.flow_templates';
const mapper = require('./mapper.js');

module.exports = function createFunction(serviceContext) {
  const mainUtil = require('../util.js')(serviceContext);
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);

  function throwOrgIdRequiredError() {
    throw new errors.InvalidInput({
      message: 'organizationId field required when the flow is private'
    });
  }

  async function getFlowTemplates(context, args) {
    const organizationId = mainUtil.getOrganizationId(context);
    if (args.showPublic !== false) {
      args.showPublic = true;
    }

    return await getFlowsTemplatesDb(context, args, organizationId);
  }

  async function getFlowsTemplatesDb(context, args, organizationId) {
    // Access check
    // a. caller owns the template
    let queryArgs = [_.toString(organizationId)];
    let accessConditions = ['f.organization_id = $1'];
    const filterConditions = [];

    // b. the template is public
    if (args.showPublic) {
      accessConditions.push('f.public = true');
    }

    const useEngineGrantFlagEnabled = await _getUseEngineGrantFlag(context);
    const tokenType = resUtil.getTokenType(context);
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    // c. the caller has access to a package that includes the template
    if (
      useEngineGrantFlagEnabled &&
      !(tokenType === 'internal' && isSuperAdmin)
    ) {
      queryArgs.push(parseInt(organizationId, 10));
      accessConditions.push(/*sql*/ `(f.flow_id IN (
      SELECT pr.resource_id::uuid FROM aiware.package__resource pr
      JOIN  aiware.package p ON p.package_id = pr.package_id 
      LEFT JOIN aiware.package__organization po ON po.package_id = pr.package_id AND po.grant_type != 'DENY'::aiware.aiw_package_grant_enum
      WHERE pr.resource_type = 'automate_template' AND (po.organization_id = $${queryArgs.length} OR p.organization_id = $${queryArgs.length})))`);
    }

    // skip access check for the orgless token.
    if (_.isNil(organizationId) && tokenType === 'internal') {
      queryArgs = [];
      accessConditions = [];
    }

    // add all available access vectors
    if (accessConditions.length > 0) {
      filterConditions.push([`(${accessConditions.join(' OR ')})`]);
    }

    // user filters
    if (args.id) {
      queryArgs.push(args.id);
      filterConditions.push(`f.flow_id = $${queryArgs.length}`);
    } else {
      if (args.categories) {
        queryArgs.push(args.categories);
        filterConditions.push(`f.categories && $${queryArgs.length}`);
      }
      if (args.tags) {
        queryArgs.push(args.tags);
        filterConditions.push(`f.tags && $${queryArgs.length}`);
      }
      if (args.title) {
        queryArgs.push(`%${args.title}%`);
        filterConditions.push(`f.title ILIKE $${queryArgs.length}`);
      }
      if (args.authors) {
        queryArgs.push(args.authors);
        filterConditions.push(`f.author = ANY($${queryArgs.length})`);
      }
    }

    let limit = args.limit ? args.limit : 100;
    let offset = args.offset ? args.offset : 0;
    queryArgs.push(limit, offset);

    let sql = /*sql*/ `SELECT
      f.flow_id as id,
      f.title,
      f.sub_title as subtitle,
      f.description,
      f.image,
      f.categories,
      f.flow,
      f.package,
      f.screenshots,
      f.organization_id as organizationId,
      f.tags,
      f.author,
      f.public,
      f.learn_more_link as learnMoreLink,
      f.logo, f.created_date_time as created,
      f.modified_date_time as modified
      FROM job_new.flow_templates f
    `;

    if (filterConditions.length > 0) {
      sql += ' WHERE ' + filterConditions.join(' AND ');
    }

    sql += `
      ORDER BY f.public, f.created_date_time
      LIMIT $${queryArgs.length - 1}
      OFFSET $${queryArgs.length};
    `;

    const res = await serviceContext.dbConnections['core'].read.query(
      sql,
      queryArgs
    );

    const flowTemplates = res.map((record) => mapper.mapFlow(record));
    return mainUtil.toPage(args, flowTemplates);
  }

  function checkBase64(data) {
    var base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    if (!base64regex.test(data)) {
      throw new errors.InvalidInput({
        message: 'Invalid Flow Format. Must be base64 encoded'
      });
    }
  }

  async function _getUseEngineGrantFlag(context) {
    const requesterOrg = _.get(context, '_authInfo.organization');
    const useEngineGrant = await mainUtil.isEnableFeatureInOrganization(
      context,
      requesterOrg,
      _.get(requesterOrg, 'organizationId'),
      ['enablePackageGrantLogic', 'useEngineGrant']
    );
    if (!useEngineGrant) {
      return false;
    }
    return true;
  }

  async function createFlowTemplate(context, args) {
    const input = args.input;
    if (!input.organizationId) throwOrgIdRequiredError();
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (input.public && !isSuperAdmin) {
      throw new errors.InvalidInput({
        message: 'Insufficient permission to create public template'
      });
    }
    checkBase64(input.flow);

    const columnData = {
      title: input.title || '',
      sub_title: input.subtitle || '',
      description: input.description || '',
      tags: input.tags,
      learn_more_link: input.learnMoreLink,
      organization_id: input.organizationId,
      image: input.image || '',
      screenshots: input.screenshots,
      categories: input.categories,
      author: input.author,
      public: input.public || false,
      flow: input.flow,
      package: input.package,
      flow_id: input.id
    };

    const flowReturning = {
      flow_id: 'id',
      title: 'title',
      sub_title: 'subtitle',
      description: 'description',
      tags: 'tags',
      learn_more_link: 'learnMoreLink',
      image: 'image',
      organization_id: 'organizationId',
      screenshots: 'screenshots',
      categories: 'categories',
      author: 'author',
      public: 'public',
      flow: 'flow',
      package: 'package',
      created_date_time: 'created'
    };

    // make and run script for creating flow
    const { sql, values } = mainUtil.makeInsertSql(
      table,
      columnData,
      flowReturning
    );

    let newFlow = await serviceContext.dbConnections['core'].write.query(
      sql,
      values
    );

    newFlow = _.get(newFlow, '0');
    if (newFlow) return mapper.mapFlow(newFlow);
    throw new Error('failed to create flow template');
  }

  async function updateFlowTemplate(context, args) {
    const input = args.input;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    if (input.public && !isSuperAdmin) {
      throw new errors.InvalidInput({
        message: 'Insufficient permission to update public template'
      });
    }
    if (input.flow) {
      checkBase64(input.flow);
    }
    if (!input.organizationId) throwOrgIdRequiredError();
    const columnData = {};
    if (input.title) columnData.title = input.title;
    if (input.subtitle) columnData.sub_title = input.subtitle;
    if (input.description) columnData.description = input.description;
    if (input.tags) columnData.tags = input.tags;
    if (input.learnMoreLink) columnData.learn_more_link = input.learnMoreLink;
    if (input.image) columnData.image = input.image;
    columnData.organization_id = input.organizationId;
    if (input.screenshots) columnData.screenshots = input.screenshots;
    if (input.categories) columnData.categories = input.categories;
    if (input.author) columnData.author = input.author;
    columnData.public = input.public;
    if (input.flow) columnData.flow = input.flow;
    if (input.package) columnData.package = input.package;
    columnData.modified_date_time = new Date().toISOString();

    const flowReturning = {
      flow_id: 'id',
      title: 'title',
      sub_title: 'subtitle',
      description: 'description',
      tags: 'tags',
      learn_more_link: 'learnMoreLink',
      image: 'image',
      organization_id: 'organizationId',
      screenshots: 'screenshots',
      categories: 'categories',
      author: 'author',
      public: 'public',
      flow: 'flow',
      package: 'package',
      created_date_time: 'created',
      modified_date_time: 'modified'
    };

    let whereClause = ` flow_id = '${input.id}' `;
    if (!isSuperAdmin) {
      whereClause += ` AND organization_id = '${input.organizationId}' `;
    }
    // make and run script for update flow ---
    const { sql, values } = mainUtil.makeUpdateSql(
      table,
      columnData,
      flowReturning, // select data
      whereClause
    );

    let updatedFlow = await serviceContext.dbConnections['core'].write.query(
      sql,
      values
    );

    updatedFlow = _.get(updatedFlow, '0');

    if (updateFlowTemplate) {
      return mapper.mapFlow(updatedFlow);
    } else {
      _throwTemplateNotFoundErr(input.id);
    }
  }

  async function deleteFlowTemplate(context, args) {
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);
    const templateDataResponse = await getFlowTemplates(context, args);
    const flowTemplate = _.get(templateDataResponse, 'records[0]');
    if (!flowTemplate || (!isSuperAdmin && flowTemplate.isPublic)) {
      _throwTemplateNotFoundErr(args.id);
    }
    let sql = `DELETE FROM
     job_new.flow_templates
    `;
    var queryArgs = [];
    sql += ' WHERE flow_id = $1 ';
    queryArgs.push(args.id);

    if (!isSuperAdmin) {
      sql += ' AND organization_id = $2 ';
      queryArgs.push(
        args.organizationId || mainUtil.getOrganizationId(context)
      );
    }
    sql += 'RETURNING flow_id as id;';

    let deleted = await serviceContext.dbConnections['core'].write.query(
      sql,
      queryArgs
    );
    const deletedFlow = _.get(deleted, '0');
    if (deletedFlow) {
      return deletedFlow;
    } else {
      _throwTemplateNotFoundErr(args.id);
    }
  }

  function _throwTemplateNotFoundErr(id) {
    throw new errors.NotFound({
      message: 'flowTemplate not found or access denied',
      data: {
        objectId: id,
        objectType: 'flowTemplate'
      }
    });
  }

  return {
    getFlowTemplates: getFlowTemplates,
    createFlowTemplate: createFlowTemplate,
    updateFlowTemplate: updateFlowTemplate,
    deleteFlowTemplate: deleteFlowTemplate
  };
};
