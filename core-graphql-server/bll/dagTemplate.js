const mime = require('mime-types');
const _ = require('lodash');
const Handlebars = require('handlebars');
const helpers = require('@veritone/core-server-base/handlebars-helpers');
helpers.register(Handlebars);

module.exports = function createFunction(serviceContext) {
  const errors = require('../error')(serviceContext.config);
  const resUtil = require('../resolvers/util.js')(serviceContext);

  async function getDagTemplate(context, args) {
    if (!args.id)
      throw new errors.InvalidInput({ message: 'dagTemplateId is required' });

    const res = await serviceContext.dal.dagTemplate.getDagTemplates(
      context,
      args
    );
    if (!res.count) {
      throw new errors.NotFound({
        message: 'The DAG template was not found',
        data: {
          objectType: 'dagTemplate',
          objectId: args.id
        }
      });
    }
    return res.records[0];
  }

  async function createDagTemplate(context, args) {
    const input = args.input;
    const requestorOrgId = args.organizationId;
    const isSuperAdmin = resUtil.isSuperAdmin(context._authInfo);

    if (input.mimeType && !mime.extension(input.mimeType)) {
      throw new errors.InvalidInput({ message: 'Invalid mimeType' });
    }

    const templateString = validateAndParseTemplate(input);

    try {
      Handlebars.compile(templateString, { strict: true });
    } catch (error) {
      throw new errors.InvalidInput({
        message: 'fail to compile the input DAG template',
        data: {
          dag: input.dag,
          dagTemplateLanguage: input.dagTemplateLanguage
        }
      });
    }

    const dagTemplate = {
      name: input.name,
      description: input.description,
      cognitiveCategoryId: input.cognitiveCategoryId,
      mimeType: input.mimeType,
      dag: { template: templateString },
      dagTemplateLanguage: input.dagTemplateLanguage,
      targetOrganizationId: isSuperAdmin
        ? input.targetOrganizationId
          ? input.targetOrganizationId
          : requestorOrgId
        : requestorOrgId,
      tags: input.tags
    };

    const res = await serviceContext.dal.dagTemplate.createDagTemplateDb(
      context,
      dagTemplate
    );

    return res;
  }

  async function updateDagTemplate(context, args) {
    const input = args.input;

    if (input.mimeType && !mime.extension(input.mimeType)) {
      throw new errors.InvalidInput({ message: 'Invalid mimeType' });
    }

    const templateString = validateAndParseTemplate(input);

    if (templateString) input.dag = { template: templateString };

    // get to check dag template is not found
    await getDagTemplate(context, { id: input.id });

    const updatedDagTemplate = await serviceContext.dal.dagTemplate.updateDagTemplateDb(
      input
    );

    return updatedDagTemplate;
  }

  function validateAndParseTemplate(input) {
    const template = input.dag;
    let templateString;

    if (template) {
      if (_.isString(template) && input.dagTemplateLanguage) {
        if (input.dagTemplateLanguage !== 'Handlebars') {
          throw new errors.NotImplemented({
            message: 'This DAG template uses unsupported templating language',
            data: {
              dagTemplateLanguage: input.dagTemplateLanguage
            }
          });
        }

        templateString = template;
      } else {
        if (!_.isString(template)) templateString = JSON.stringify(template);

        // default dagTemplateLanguage should be Handlebars
        if (!input.dagTemplateLanguage)
          input.dagTemplateLanguage = 'Handlebars';
      }

      try {
        Handlebars.compile(templateString, { strict: true });
      } catch (error) {
        throw new errors.InvalidInput({
          message: 'fail to compile the input DAG template',
          data: {
            dag: input.dag,
            dagTemplateLanguage: input.dagTemplateLanguage
          }
        });
      }
    }

    return templateString;
  }

  return {
    getDagTemplate,
    createDagTemplate,
    updateDagTemplate
  };
};
