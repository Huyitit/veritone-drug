const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');

const mockUtil = require('../../../test/mockUtil.js')();
const mockSql = require('../../../test/mockSql.js')();
// get mock base service context
const serviceContext = require('../../../test/serviceContext.mock.js')();
serviceContext.dal.taskTemplate = require('./taskTemplate.js')(serviceContext);
serviceContext.dal.cluster = require('../dal/cluster.js')(serviceContext);

const dbResults = require('../../../test/jobTemplateRows.json');

const coreDbRead = serviceContext.dbConnections['core'].read;
const coreDbWrite = serviceContext.dbConnections['core'].write;
const jobTemplate = require('./jobTemplate.js')(serviceContext);

function validate(args, rowsIn, result) {
  chaiExpect(result).to.exist;
  chaiExpect(result.records).to.exist;
  chaiExpect(result.records.length).to.equal(rowsIn.length);
  chaiExpect(result.count).to.equal(rowsIn.length);
  chaiExpect(result.offset).to.equal(args.offset);
  chaiExpect(result.limit).to.equal(args.limit);
}

beforeEach(function () {
  coreDbRead._clearResultQueue();
});

describe('#jobTemplate', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(jobTemplate).to.be.a('object');
      chaiExpect(Object.keys(jobTemplate).length).to.equal(7);

      chaiExpect(typeof jobTemplate.getJobTemplate).to.equal('function');
      chaiExpect(typeof jobTemplate.getJobTemplates).to.equal('function');
      chaiExpect(typeof jobTemplate.createJobTemplate).to.equal('function');
      chaiExpect(typeof jobTemplate.updateJobTemplate).to.equal('function');
      chaiExpect(typeof jobTemplate.deleteJobTemplate).to.equal('function');
    });
  });

  describe('getJobTemplate', function () {
    it('should get a job template', async function () {
      const dbRow = dbResults.oneRow[0];
      coreDbRead._push(dbResults.oneRow);
      const res = await jobTemplate.getJobTemplate(
        {},
        { id: '18125119_m1dODVWA5Q' }
      );
      chaiExpect(res).to.exist;

      chaiExpect(res).to.deep.include({
        id: dbRow.id,
        targetId: '123',
        applicationId: dbRow.application_id,
        createdDateTime: dbRow.created_date_time,
        modifiedDateTime: dbRow.modified_date_time,
        clusterId: dbRow.cluster_id,
        clientApplicationId: dbRow.client_application_id
      });
    });

    it('should throw on not found', async function () {
      coreDbRead._push([]);
      // TODO there is a better way to expect an async function
      // to throw/reject but it's not working
      try {
        await jobTemplate.getJobTemplate({}, { id: '18125119_m1dODVWA5Q' });
        expect.fail();
      } catch (err) {
        chaiExpect(err.name).to.equal('not_found');
      }
    });
  });

  describe('createJobTemplateSql', function () {
    // context, args, valIndex=0
    it('should get valid SQL with forced ID', function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const template = dbResults.oneRow[0];
      const args = {
        input: {
          id: template.id,
          applicationId: template.application_id,
          jobConfig: { foo: 'bar' },
          clusterId: template.cluster_id,
          taskTemplates: [
            {
              id: template.id + 'asdflasdf',
              engineId: 'daff9b87-4e1b-4266-b37d-36a3de296f20'
            },
            {
              engineId: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
              payload: {
                foo: 'bar'
              }
            }
          ]
        }
      };
      const { sql, values } = jobTemplate.createJobTemplateSql(
        context,
        args,
        0
      );
      mockSql.parseSQL(sql, values);
    });
  });

  describe('createJobTemplate', function () {
    it('should create job template', async function () {
      //coreDbWrite._push([{id: '18125119_m1dODVWA5Q' }]);
      const context = mockUtil.getGraphQLContext(null, 'user');
      const template = dbResults.oneRow[0];
      const args = {
        input: {
          id: template.id,
          applicationId: template.application_id,
          jobConfig: { foo: 'bar' },
          clusterId: template.cluster_id,
          taskTemplates: [
            {
              id: template.id + 'asdflasdf',
              engineId: 'daff9b87-4e1b-4266-b37d-36a3de296f20'
            },
            {
              engineId: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
              payload: {
                foo: 'bar'
              }
            }
          ]
        }
      };
      // coreDbRead._push([
      //   // engine for job
      //   {
      //     id: 'daff9b87-4e1b-4266-b37d-36a3de296f20',
      //     category_id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //     name: 'Awesome Engine'
      //   }
      // ]);
      // coreDbRead._push(
      //   [
      //     // engine category
      //     {
      //       id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //       name: 'Awesome Engines',
      //       engine_ids: [
      //         'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //         'daff9b87-4e1b-4266-b37d-36a3de296f20'
      //       ],
      //       engine_alias_ids: [
      //         'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //         'daff9b87-4e1b-4266-b37d-36a3de296f20'
      //       ]
      //     }
      //   ],
      //   false
      // ); // engine categories query can't be parsed :(
      // coreDbRead._push([
      //   // engine for job
      //   {
      //     id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //     category_id: 'aacc9b87-4e1b-4266-b37d-36a3de296f10',
      //     name: 'More Awesome Engine'
      //   }
      // ]);
      coreDbRead._push(
        [
          {
            id: template.cluster_id,
            organization_id: 7682,
            name: 'Awesome Cluster'
          }
        ],
        true,
        ['organization_id']
      );
      coreDbWrite._push([
        {
          id: template.id,
          application_id: template.application_id,
          job_config: { foo: 'bar' },
          cluster_id: template.cluster_id
        }
      ]);
      const res = await jobTemplate.createJobTemplate(context, args);
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(template.id);
    });
  });

  describe('deleteJobTemplate', function () {
    it('should delete job template', async function () {
      coreDbWrite._push([{ id: '18125119_m1dODVWA5Q' }]);
      try {
        await jobTemplate.deleteJobTemplate({}, { id: '18125119_m1dODVWA5Q' });
        expect.fail();
      } catch (err) {
        chaiExpect(err.name).to.equal('not_implemented');
      }
    });
  });

  describe('getJobTemplates', function () {
    it('should get job templates for user - empty', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const args = {
        offset: 10,
        limit: 100
      };

      // push a fake empty result
      coreDbRead._push([]);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, [], res);
    });

    it('should get job templates for user', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const args = {
        offset: 10,
        limit: 100,
        applicationId: '784ecd92-4e31-41eb-8a80-6b73bfdf4914',
        organizationId: 7682
      };
      const dbRows = dbResults.manyRows;
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });

    it('should get job templates for user by id', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const args = {
        offset: 10,
        limit: 100,
        applicationId: '784ecd92-4e31-41eb-8a80-6b73bfdf4914',
        organizationId: 7682,
        id: dbResults.oneRow[0].id
      };
      const dbRows = dbResults.manyRows;
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });

    it('should get job templates for user by engine type', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const args = {
        offset: 10,
        limit: 100,
        applicationId: '784ecd92-4e31-41eb-8a80-6b73bfdf4914',
        organizationId: 7682,
        engineType: 'Cognition'
      };
      const dbRows = dbResults.manyRows;
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });

    it('should get job templates for user by engine ID', async function () {
      const context = mockUtil.getGraphQLContext(null, 'user');
      const args = {
        offset: 10,
        limit: 100,
        applicationId: '784ecd92-4e31-41eb-8a80-6b73bfdf4914',
        organizationId: 7682,
        engineId: '184ecd92-4e31-41eb-8a80-6b73bfdf4911'
      };
      const dbRows = dbResults.manyRows;
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });

    it('should get job templates for internal token', async function () {
      const context = mockUtil.getGraphQLContext(null, 'api_internal');
      const args = {
        offset: 10,
        limit: 100
      };
      const dbRows = dbResults.manyRows;
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });

    it('should get job templates for internal token - by pipelineId', async function () {
      const context = mockUtil.getGraphQLContext(null, 'api_internal');
      const args = {
        jobPipelineId: '4a2a5cfb-aeb7-4c9a-89ff-c42e36f5e465',
        offset: 10,
        limit: 100
      };
      const dbRows = dbResults.manyRows;
      dbRows.forEach((row) => {
        row.job_pipeline_id = args.jobPipelineId;
        row.job_pipeline_stage = 1;
      });
      // push a fake empty result
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
      res.records.forEach((row) =>
        chaiExpect(row.jobPipelineId).to.equal(args.jobPipelineId)
      );
    });

    it('should get job templates for internal token - by scheduledJobId', async function () {
      const context = mockUtil.getGraphQLContext(null, 'api_internal');
      const args = {
        scheduledJobId: '100011',
        offset: 10,
        limit: 100
      };
      const dbRows = dbResults.manyRows;
      coreDbRead._push(dbRows);
      const res = await jobTemplate.getJobTemplates(context, args);
      validate(args, dbRows, res);
    });
  });
});
