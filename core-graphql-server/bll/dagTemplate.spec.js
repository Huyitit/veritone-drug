const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../test/mockUtil.js')();
const serviceContext = require('../modules/v3DataModel/test/serviceContext.mock.js')();

let dal, context;

beforeEach(function () {
  serviceContext._clearAll();
  context = mockUtil.makeContext();
});

describe('bll DAG template tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      dal = require('./dagTemplate.js')(serviceContext);
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(3);
      chaiExpect(typeof dal.createDagTemplate).to.equal('function');
      chaiExpect(typeof dal.getDagTemplate).to.equal('function');
      chaiExpect(typeof dal.updateDagTemplate).to.equal('function');
    });
  });

  describe('#createDagTemplate', function () {
    let args;

    beforeEach(function () {
      args = {
        input: {
          name: 'test',
          description: 'description',
          cognitiveCategoryId: 'cognitiveCategoryId',
          mimeType: 'text/html',
          dag: '{"foo": "bar"}',
          dagTemplateLanguage: 'dagTemplateLanguage',
          targetOrganizationId: 7682,
          tags: ['foo']
        },
        organizationId: 7682
      };
    });

    it('should throw invalid mimeType', async function () {
      let res, err;

      _.set(args, 'input.mimeType', 'invalid type');

      try {
        res = await dal.createDagTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid mimeType');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }
      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.undefined;
    });

    it('should create DAG template', async function () {
      let res, err;

      _.set(args, 'input.dagTemplateLanguage', 'Handlebars');
      serviceContext.dbConnections['core'].write._push([
        {
          id: 'templateId',
          name: args.input.name,
          description: args.input.description,
          cognitive_category_id: args.input.cognitiveCategoryId,
          mime_type: args.input.mimeType,
          dag: JSON.parse(args.input.dag),
          dag_template_language: args.input.dagTemplateLanguage,
          target_organization_id: args.organizationId
        }
      ]);

      try {
        res = await dal.createDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('templateId');
      chaiExpect(res.targetOrganizationId).to.equal(7682);
    });
  });

  describe('#getDagTemplate', function () {
    let args;

    beforeEach(function () {
      args = {
        id: 'templateId'
      };
    });

    it('should throw error templateId is required', async function () {
      let res, err;

      _.set(args, 'id', null);

      try {
        res = await dal.getDagTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('dagTemplateId is required');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.undefined;
    });

    it('should throw Dag Template is not found', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.getDagTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('The DAG template was not found');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.undefined;
    });

    it('should get DAG template by id', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push([
        {
          id: 'templateId1',
          name: 'name1',
          cognitive_category_id: 'cognitiveCategoryId1',
          mime_type: 'text/plain',
          dag_template_language: 'dagTemplateLanguage1',
          target_organization_id: 'targetOrganizationId1',
          deleted_date_time: null
        }
      ]);

      try {
        res = await dal.getDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('templateId1');
    });
  });

  describe('#updateDagTemplate', function () {
    let args;

    beforeEach(function () {
      args = {
        input: { id: 'templateId', mimeType: 'text/plain' }
      };
    });

    it('should throw error Invalid mimeType', async function () {
      let res, err;

      _.set(args, 'input.mimeType', 'invalid');

      try {
        res = await dal.updateDagTemplate(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal('Invalid mimeType');
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(res).to.be.undefined;
    });

    it('should update DAG template', async function () {
      let res, err;

      // getDagTemplate
      serviceContext.dbConnections['core'].read._push([{ id: 'templateId' }]);
      // updateDagTemplateDb
      serviceContext.dbConnections['core'].write._push([{ id: 'templateId' }]);

      try {
        res = await dal.updateDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('templateId');
    });

    it('should update DAG template if input is object.', async function () {
      let res, err;

      // getDagTemplate
      serviceContext.dbConnections['core'].read._push([{ id: 'templateId' }]);
      // updateDagTemplateDb
      serviceContext.dbConnections['core'].write._push([{ id: 'templateId' }]);

      try {
        args.input.dag = { foo: 'bars' };
        res = await dal.updateDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('templateId');
      chaiExpect(args.input.dag.template).to.equal('{"foo":"bars"}');
    });
  });
});
