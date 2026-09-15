const chaiExpect = require('chai').expect;
const mockUtil = require('../../../test/mockUtil.js')();

const serviceContext = require('../../../test/serviceContext.mock.js')();

const coreDbRead = serviceContext.dbConnections['core'].read;
const coreDbWrite = serviceContext.dbConnections['core'].write;

const dal = require('./taskTemplate.js')(serviceContext);

const mockRow = {
  id: '18125119_taskABC',
  job_template_id: '18125119_jobDEF',
  application_id: 'app-1',
  created_date_time: '2024-01-01T00:00:00Z',
  modified_date_time: '2024-01-01T00:00:00Z',
  payload: { key: 'value' },
  engine_id: 'engine-1',
  notification_uris: {}
};

beforeEach(function () {
  coreDbRead._clearResultQueue();
  coreDbWrite._clearResultQueue();
});

describe('#taskTemplate', function () {
  describe('#require', function () {
    it('should load module and expose expected functions', function () {
      chaiExpect(dal).to.be.a('object');
      chaiExpect(typeof dal.getTaskTemplate).to.equal('function');
      chaiExpect(typeof dal.getTaskTemplates).to.equal('function');
      chaiExpect(typeof dal.createTaskTemplate).to.equal('function');
      chaiExpect(typeof dal.updateTaskTemplate).to.equal('function');
      chaiExpect(typeof dal.deleteTaskTemplate).to.equal('function');
      chaiExpect(typeof dal.createTaskTemplateSql).to.equal('function');
    });
  });

  describe('#getTaskTemplates', function () {
    it('should return paginated task templates matching the query', async function () {
      coreDbRead._push([mockRow]);

      const result = await dal.getTaskTemplates({}, { id: mockRow.id, limit: 10, offset: 0 });

      chaiExpect(result).to.exist;
      chaiExpect(result.records).to.have.length(1);
      chaiExpect(result.records[0].id).to.equal(mockRow.id);
      chaiExpect(result.records[0].jobTemplateId).to.equal(mockRow.job_template_id);
    });

    it('should return empty records when no task template matches the given id', async function () {
      coreDbRead._push([]);

      const result = await dal.getTaskTemplates({}, { id: '18125119_nonexistent', limit: 10, offset: 0 });

      chaiExpect(result.records).to.have.length(0);
      chaiExpect(result.count).to.equal(0);
    });
  });

  describe('#getTaskTemplate', function () {
    it('should throw NotFound when no template matches the given id', async function () {
      coreDbRead._push([]);

      try {
        await dal.getTaskTemplate({}, { id: '18125119_missing' });
        chaiExpect.fail('should have thrown NotFound');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });

    it('should return the first matching task template', async function () {
      coreDbRead._push([mockRow]);

      const result = await dal.getTaskTemplate({}, { id: mockRow.id });

      chaiExpect(result).to.exist;
      chaiExpect(result.id).to.equal(mockRow.id);
    });
  });

  describe('#createTaskTemplate', function () {
    it('should throw InvalidInput when both payload and payloadString are provided', async function () {
      try {
        await dal.createTaskTemplate({}, {
          input: {
            jobTemplateId: '18125119_job',
            payload: { k: 'v' },
            payloadString: '{"k":"v"}'
          }
        });
        chaiExpect.fail('should have thrown InvalidInput');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('should throw InvalidInput when jobTemplateId is missing', async function () {
      try {
        await dal.createTaskTemplate({}, { input: { payload: { k: 'v' } } });
        chaiExpect.fail('should have thrown InvalidInput');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.include('job template id');
      }
    });

    it('should throw InvalidInput when payloadString contains invalid JSON', async function () {
      try {
        await dal.createTaskTemplate({}, {
          input: {
            jobTemplateId: '18125119_job',
            payloadString: 'not-valid-json'
          }
        });
        chaiExpect.fail('should have thrown InvalidInput');
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('should insert a task template row and return the created record', async function () {
      coreDbWrite._push([mockRow]);

      const result = await dal.createTaskTemplate({}, {
        input: {
          jobTemplateId: mockRow.job_template_id,
          payload: { engineId: 'engine-x' }
        }
      });

      chaiExpect(result).to.exist;
      chaiExpect(result.id).to.equal(mockRow.id);
    });
  });

  describe('#deleteTaskTemplate', function () {
    it('should throw NotImplemented when called', async function () {
      try {
        await dal.deleteTaskTemplate({}, { id: '18125119_task' });
        chaiExpect.fail('should have thrown NotImplemented');
      } catch (err) {
        chaiExpect(err.name).to.equal('not_implemented');
      }
    });
  });
});
