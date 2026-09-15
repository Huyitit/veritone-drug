const jestExpect = global.expect;
const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const fs = require('fs');
const mockUtil = require('../test/mockUtil.js')();

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')({
  throwOnNoResultInQueue: false
});
const query = require('./Job.js')(serviceContext);

let context;
beforeEach(function () {
  context = {
    _authInfo: mockUtil.getGraphQLContext(null, 'user'),
    config: serviceContext.config,
    tracer: {
      startSpan: function () {
        return {
          setTag: function () {
            return;
          },
          finish: function () {
            return;
          }
        };
      }
    }
  };
});

afterAll(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('#Mutation', function () {
  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(query).to.be.a('object');
      const keys = Object.keys(query);
      chaiExpect(keys.length).to.equal(12);

      keys.forEach((key) => {
        chaiExpect(typeof query[key]).to.equal('function');
      });
    });
  });

  describe('#functions', function () {
    it('should call all resolver functions', async function () {
      const keys = Object.keys(query);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (typeof query[key] === 'function') {
          // it's a resolver function. call it.
          try {
            await query[key]({}, { id: '1' }, context);
          } catch (err) {
            // TODO fix mock dependencies and start failing
            // on TypeError
            if (err.name)
              serviceContext.logger.debug('ignoring error ' + err.name);
            else throw err;
          }
        }
      }
    });
  });
});

describe('#getJobStatusFromTaskStatuses', function () {
  let getTasksSpy;

  beforeEach(function () {
    getTasksSpy = jest.spyOn(serviceContext.dal.task, 'getTasks');
  });

  afterEach(function () {
    getTasksSpy.mockRestore();
  });

  it('returns cancelled when any task is cancelled regardless of other statuses', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'cancelled' }, { status: 'running' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('cancelled');
  });

  it('returns failed when any task is failed', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'failed' }, { status: 'complete' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('failed');
  });

  it('returns failed when any task is aborted', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'aborted' }, { status: 'complete' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('failed');
  });

  it('returns pending when all tasks are pending', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'pending' }, { status: 'pending' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('pending');
  });

  it('returns running when tasks are in a mixed in-progress state', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'running' }, { status: 'pending' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('running');
  });

  it('returns complete when all tasks are complete', async function () {
    getTasksSpy.mockResolvedValueOnce({
      records: [{ status: 'complete' }, { status: 'complete' }]
    });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('complete');
  });

  it('returns accepted when there are no tasks', async function () {
    getTasksSpy.mockResolvedValueOnce({ records: [] });
    const result = await query.status({ id: 'job-1' }, {}, context);
    jestExpect(result).toBe('accepted');
  });
});

describe('#dagTemplate', function () {
  let dagTemplatesByIds, dagTemplatesByJobIds;

  beforeEach(function () {
    dagTemplatesByIds = { load: jest.fn() };
    dagTemplatesByJobIds = { load: jest.fn() };
    context.loaders = { dagTemplatesByIds, dagTemplatesByJobIds };
  });

  it('calls dagTemplatesByIds.load when dagTemplateId is present on the job object', async function () {
    const orgId = _.get(context, '_authInfo.organization.organizationId');
    const expected = { id: 'tpl-1', name: 'myTemplate' };
    dagTemplatesByIds.load.mockResolvedValueOnce(expected);

    const result = await query.dagTemplate(
      { dagTemplateId: 'tpl-1', jobId: 'job-1' },
      {},
      context
    );

    jestExpect(dagTemplatesByIds.load).toHaveBeenCalledWith({
      id: 'tpl-1',
      organizationId: orgId
    });
    jestExpect(dagTemplatesByJobIds.load).not.toHaveBeenCalled();
    jestExpect(result).toEqual(expected);
  });

  it('calls dagTemplatesByJobIds.load when dagTemplateId is absent', async function () {
    const orgId = _.get(context, '_authInfo.organization.organizationId');
    const expected = { id: 'tpl-2', name: 'jobTemplate' };
    dagTemplatesByJobIds.load.mockResolvedValueOnce(expected);

    const result = await query.dagTemplate({ jobId: 'job-2' }, {}, context);

    jestExpect(dagTemplatesByJobIds.load).toHaveBeenCalledWith({
      jobId: 'job-2',
      organizationId: orgId
    });
    jestExpect(dagTemplatesByIds.load).not.toHaveBeenCalled();
    jestExpect(result).toEqual(expected);
  });
});
