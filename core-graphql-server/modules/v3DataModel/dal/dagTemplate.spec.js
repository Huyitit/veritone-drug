const chaiExpect = require('chai').expect;
const _ = require('lodash');
const mockUtil = require('../../../test/mockUtil.js')();
const serviceContext = require('../test/serviceContext.mock.js')();

let context;
const dal = require('./dagTemplate.js')(serviceContext);

beforeEach(function () {
  serviceContext._clearAll();
  context = mockUtil.makeContext();
});

describe('DAG Template tests', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(6);
      chaiExpect(typeof dal.getDagTemplates).to.equal('function');
      chaiExpect(typeof dal.deleteDagTemplate).to.equal('function');
      chaiExpect(typeof dal.addDagTemplateToOrganization).to.equal('function');
      chaiExpect(typeof dal.removeDagTemplateFromOrganization).to.equal(
        'function'
      );
    });
  });

  describe('#getDagTemplates', function () {
    let args;

    beforeEach(function () {
      args = {
        organizationId: 7682,
        tags: ['foo']
      };
    });

    it('should get list DagTemplates', async function () {
      let res, err;

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'templateId1',
            name: 'name1',
            cognitive_category_id: 'cognitiveCategoryId1',
            mime_type: 'text/plain',
            dag_template_language: 'dagTemplateLanguage1',
            target_organization_id: 'targetOrganizationId1',
            deleted_date_time: null
          },
          {
            id: 'templateId2',
            name: 'name2',
            cognitive_category_id: 'cognitiveCategoryId2',
            mime_type: 'video/mp4',
            dag_template_language: 'dagTemplateLanguage2',
            target_organization_id: 'targetOrganizationId2',
            deleted_date_time: null
          }
        ],
        false
      );

      try {
        res = await dal.getDagTemplates(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal('templateId1');
      chaiExpect(res.records[1].id).to.equal('templateId2');
    });

    it('should not apply org-scope filter when caller is a super admin', async function () {
      // A regression removing the `if (!isSuperAdmin)` guard would apply org filtering
      // for super admins too, preventing them from seeing templates across all orgs.
      context._authInfo.permissionMasks = [-2, 268427519, 1073741824, 5189619];

      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'crossOrgTemplateId',
            name: 'cross-org-template',
            cognitive_category_id: 'catId1',
            mime_type: 'text/plain',
            dag_template_language: 'json',
            target_organization_id: 'anotherOrgId',
            deleted_date_time: null
          }
        ],
        false
      );

      const res = await dal.getDagTemplates(context, { organizationId: 7682 });

      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.equal('crossOrgTemplateId');
    });
  });

  describe('#deleteDagTemplate', function () {
    let args;

    beforeEach(function () {
      args = { input: { id: 'templateId' } };
    });

    it('should delete DAG template by id', async function () {
      let res, err;

      serviceContext.dbConnections['core'].write._push([{ id: 'templateId' }]);

      try {
        res = await dal.deleteDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal('templateId');
      chaiExpect(res.message).to.equal('DAG Template deleted');
    });

    it('should throw error when Delete template not allowed.', async function () {
      let res, err;

      try {
        res = await dal.deleteDagTemplate(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#addDagTemplateToOrganization', function () {
    let args;

    beforeEach(function () {
      args = {
        input: {
          dagTemplateId: '337e843f-7587-4ec7-9017-7542efb80727',
          organizationId: 7682
        }
      };
    });

    it('should throw error when missing templateId', async function () {
      let res, err;

      _.set(args, 'input.dagTemplateId', null);

      try {
        res = await dal.addDagTemplateToOrganization(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'dagTemplateId and organizationId is required'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should add dag template to org', async function () {
      let res, err;

      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].read._push([
        { organization_id: 7682 }
      ]);

      try {
        res = await dal.addDagTemplateToOrganization(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.dagTemplateId).to.equal(
        '337e843f-7587-4ec7-9017-7542efb80727'
      );
      chaiExpect(res.organizationIds.length).to.equal(1);
      chaiExpect(res.organizationIds[0]).to.equal(7682);
    });
  });

  describe('#removeDagTemplateFromOrganization', function () {
    let args;

    beforeEach(function () {
      args = {
        input: {
          dagTemplateId: '337e843f-7587-4ec7-9017-7542efb80727',
          organizationId: 7682
        }
      };
    });

    it('should throw error when missing templateId', async function () {
      let res, err;

      _.set(args, 'input.dagTemplateId', null);

      try {
        res = await dal.removeDagTemplateFromOrganization(context, args);
      } catch (error) {
        chaiExpect(error.message).to.equal(
          'dagTemplateId and organizationId is required'
        );
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.name).to.equal('invalid_input');
    });

    it('should remove dag template from org', async function () {
      let res, err;

      serviceContext.dbConnections['core'].write._push([]);
      serviceContext.dbConnections['core'].read._push([]);

      try {
        res = await dal.addDagTemplateToOrganization(context, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.dagTemplateId).to.equal(
        '337e843f-7587-4ec7-9017-7542efb80727'
      );
      chaiExpect(res.organizationIds.length).to.equal(0);
    });
  });
});
