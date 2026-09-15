const chaiExpect = require('chai').expect;
const _ = require('lodash');
const httpMock = require('node-mocks-http');
// get mock base service context
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
const dal = require('./processTemplate.js')(serviceContext);

describe('dal/processTemplate.js test', function () {
  const context = mockUtil.makeContext();
  const processTemplateId = 392;
  const organizationId = 7682;
  const processTemplateName = 'Full length TV Games';
  const taskList =
    '[{"taskTypeId":"fc004413-89f0-132a-60b2-b94522fb7e66"},{"taskTypeId":"762bf9a0-fc08-7fbb-4ba0-21a3cee6edaf"}]';

  beforeEach(() => {
    Object.keys(serviceContext.dbConnections).forEach((key) => {
      const conn = serviceContext.dbConnections[key];
      if (conn.read) conn.read._clearResultQueue();
      if (conn.write) conn.write._clearResultQueue();
    });
    serviceContext.redisCache.markCacheDirty(true);
  });

  describe('#require', function () {
    it('should load module', function () {
      // validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(5);
    });
  });

  describe('test #getProcessTemplate', function () {
    it('should get a process template successfully', async function () {
      let res, err;
      let options = {
        organizationId,
        id: processTemplateId
      };

      serviceContext.dbConnections['cms'].read._push([
        {
          process_template_id: 392,
          organization_id: 7682,
          process_template_name: processTemplateName,
          task_list:
            '[{"taskTypeId":"fc004413-89f0-132a-60b2-b94522fb7e66"},{"taskTypeId":"762bf9a0-fc08-7fbb-4ba0-21a3cee6edaf"}]'
        }
      ]);

      try {
        res = await dal.getProcessTemplate(options, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res).to.equal('object');
      chaiExpect(res.id).to.equal(processTemplateId);
      chaiExpect(res.organizationId).to.equal(organizationId);
      chaiExpect(res.name).to.equal(processTemplateName);
      chaiExpect(res.taskList).to.equal(taskList);
    });

    it('should throw error when processTemplate not found', async function () {
      let res, err;
      let options = {
        organizationId,
        id: processTemplateId
      };

      serviceContext.dbConnections['cms'].read._push([]);

      try {
        res = await dal.getProcessTemplate(options, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.message).to.equal('Process template not found');
    });
  });

  describe('test #getProcessTemplates', function () {
    it('should get list processTemplates successfully', async function () {
      let res, err;
      let options = {
        organizationId,
        id: processTemplateId
      };

      serviceContext.dbConnections['cms'].read._push([
        {
          process_template_id: 392,
          organization_id: 7682,
          process_template_name: processTemplateName,
          task_list:
            '[{"taskTypeId":"fc004413-89f0-132a-60b2-b94522fb7e66"},{"taskTypeId":"762bf9a0-fc08-7fbb-4ba0-21a3cee6edaf"}]'
        },
        {
          process_template_id: 392,
          organization_id: 7682,
          process_template_name: processTemplateName,
          task_list:
            '[{"taskTypeId":"fc004413-89f0-132a-60b2-b94522fb7e66"},{"taskTypeId":"762bf9a0-fc08-7fbb-4ba0-21a3cee6edaf"}]'
        }
      ]);

      try {
        res = await dal.getProcessTemplates(options, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res.records).to.equal('object');
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(processTemplateId);
      chaiExpect(res.records[0].organizationId).to.equal(organizationId);
      chaiExpect(res.records[0].name).to.equal(processTemplateName);
      chaiExpect(res.records[0].taskList).to.equal(taskList);
    });
  });

  describe('test #createProcessTemplate', function () {
    it('should create a processTemplate successfully', async function () {
      let res, err;
      let args = {
        input: {
          name: processTemplateName,
          taskList
        },
        organizationId
      };

      serviceContext.dbConnections['cms'].write._push([
        {
          process_template_id: 392,
          organization_id: 7682,
          process_template_name: processTemplateName,
          task_list: taskList
        }
      ]);

      try {
        res = await dal.createProcessTemplate(args, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res).to.equal('object');
      chaiExpect(res.id).to.equal(processTemplateId);
      chaiExpect(res.organizationId).to.equal(organizationId);
      chaiExpect(res.name).to.equal(processTemplateName);
      chaiExpect(res.taskList).to.equal(taskList);
    });
  });

  describe('test #updateProcessTemplate', function () {
    it('should update a processTemplate successfully', async function () {
      let res, err;
      let args = {
        input: {
          id: processTemplateId,
          taskList
        }
      };

      serviceContext.dbConnections['cms'].write._push([
        {
          process_template_id: 392,
          organization_id: 7682,
          process_template_name: processTemplateName,
          task_list: taskList
        }
      ]);

      try {
        res = await dal.updateProcessTemplate(args, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res).to.equal('object');
      chaiExpect(res.id).to.equal(processTemplateId);
      chaiExpect(res.organizationId).to.equal(organizationId);
      chaiExpect(res.name).to.equal(processTemplateName);
      chaiExpect(res.taskList).to.equal(taskList);
    });
  });

  describe('test #deleteProcessTemplate', function () {
    it('should delete a processTemplate successfully', async function () {
      let res, err;
      let options = {
        id: processTemplateId,
        organizationId
      };

      serviceContext.dbConnections['cms'].write._push([
        {
          process_template_id: 392
        }
      ]);

      try {
        res = await dal.deleteProcessTemplate(options, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res).to.equal('object');
      chaiExpect(res.id).to.equal(processTemplateId);
    });

    it('should throw error when id is undefined', async function () {
      let res, err;
      let options = {
        organizationId
      };

      serviceContext.dbConnections['cms'].write._push([]);

      try {
        res = await dal.deleteProcessTemplate(options, context);
      } catch (error) {
        err = error;
      }

      chaiExpect(err).to.exist;
      chaiExpect(res).to.be.undefined;
      chaiExpect(err.message).to.equal('Process Template ID is required');
    });
  });
});
