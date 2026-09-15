'use strict';

// Mock the four sub-module factories so the aggregator can be exercised without
// real app/dal/model/storage wiring. (cgql jest has `transform: {}` — no hoisting —
// so jest.mock() is declared before require('./index') and may close over these vars.)
var jobFactory = jest.fn();
var s3Factory = jest.fn();
var engineFactory = jest.fn();
var taskFactory = jest.fn();

jest.mock('./job', function () {
  return jobFactory;
});
jest.mock('./s3', function () {
  return s3Factory;
});
jest.mock('./engine', function () {
  return engineFactory;
});
jest.mock('./task', function () {
  return taskFactory;
});

var initBll = require('./index');

describe('core-job-server bll aggregator (index.js)', function () {
  var app, dal, model, engineRuntime, storage, bll;

  beforeEach(function () {
    jobFactory.mockReset().mockReturnValue('JOB_BLL');
    s3Factory.mockReset().mockReturnValue('S3_BLL');
    engineFactory.mockReset().mockReturnValue('ENGINE_BLL');
    taskFactory.mockReset().mockReturnValue('TASK_BLL');

    app = { name: 'app' };
    dal = { name: 'dal' };
    model = { name: 'model' };
    engineRuntime = { name: 'engineRuntime' };
    storage = { name: 'storage' };

    bll = initBll(app, dal, model, engineRuntime, storage);
  });

  it('exposes exactly the job, s3, engine and task bll modules', function () {
    expect(Object.keys(bll).sort()).toEqual(['engine', 'job', 's3', 'task']);
    expect(bll.job).toBe('JOB_BLL');
    expect(bll.s3).toBe('S3_BLL');
    expect(bll.engine).toBe('ENGINE_BLL');
    expect(bll.task).toBe('TASK_BLL');
  });

  it('wires each sub-module factory with its documented dependencies', function () {
    expect(jobFactory).toHaveBeenCalledWith(app, dal, model, engineRuntime);
    expect(s3Factory).toHaveBeenCalledWith(app, storage);
    expect(engineFactory).toHaveBeenCalledWith(app, dal, model);
    expect(taskFactory).toHaveBeenCalledWith(app, dal, model);
  });
});
