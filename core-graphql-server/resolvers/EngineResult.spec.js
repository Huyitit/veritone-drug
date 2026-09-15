const chaiExpect = require('chai').expect;
const _ = require('lodash');
const fs = require('fs');
const httpMock = require('node-mocks-http');
const moment = require('moment');
const mockUtil = require('../test/mockUtil.js')();
const errors = require('../error')({});

// get mock base service context
const serviceContext = require('../test/serviceContext.mock.js')();
const appId = 'a4fa5950-c3b4-47eb-9808-10ed295d2695';

const coreDbWrite = serviceContext.dbConnections['core'].write;
const coreDbRead = serviceContext.dbConnections['core'].read;
let engineResultModule = require('./EngineResult.js')(serviceContext);

const context = mockUtil.makeContext();

// A retention-dropped partition surfaces as PG 42P01 (undefined_table), either as a
// wrapped InternalServerError (code under data.internalData.code) or a raw pg error
// (code on err.code). The resolver must map only that to null and rethrow the rest.
function sqlError(pgCode) {
  return new errors.InternalServerError({
    message: 'An internal server error occurred.',
    data: {
      internalData: {
        type: 'sql',
        code: pgCode,
        db: 'platform'
      }
    }
  });
}

function rawPgError(pgCode) {
  const err = new Error(`relation does not exist (${pgCode})`);
  err.code = pgCode;
  return err;
}

describe('EngineResult.js', function () {
  beforeEach(() => {
    serviceContext._clearAll();
    _.set(serviceContext, 'config.maxAssetsLimitEnabled', true);
    _.set(serviceContext, 'config.maxAssetsLimit', 101);
    _.set(serviceContext, 'librariesService.getLibraries', () =>
      Promise.resolve({
        totalResults: 0,
        results: []
      })
    );
  });

  afterAll(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should load module', () => {
    chaiExpect(engineResultModule).to.be.a('object');
    chaiExpect(typeof engineResultModule.tdo).to.equal('function');
    chaiExpect(typeof engineResultModule.engine).to.equal('function');
    chaiExpect(typeof engineResultModule.libraryId).to.equal('function');
    chaiExpect(typeof engineResultModule.library).to.equal('function');
    chaiExpect(typeof engineResultModule.startOffsetMs).to.equal('function');
    chaiExpect(typeof engineResultModule.stopOffsetMs).to.equal('function');
  });

  describe('#engine', function () {
    it('should return null when engineId is missing', async () => {
      const res = await engineResultModule.engine(
        { tdoId: 123, engineId: null },
        {},
        context
      );
      chaiExpect(res).to.equal(null);
    });

    it('should get engine by id, including deleted engines', async () => {
      const getEngine = jest.fn().mockResolvedValue({
        id: 'engine-123',
        name: 'Test Engine'
      });
      _.set(serviceContext, 'dal.engine.getEngine', getEngine);

      const res = await engineResultModule.engine(
        { tdoId: 123, engineId: 'engine-123' },
        {},
        mockUtil.makeContext()
      );

      chaiExpect(res.id).to.equal('engine-123');
      expect(getEngine).toHaveBeenCalledWith(expect.anything(), {
        id: 'engine-123',
        includeDeleted: true,
        adminView: true
      });
    });
  });

  it('should load libraryId', async () => {
    _.set(serviceContext, 'dal.task.getTask', () =>
      Promise.resolve({
        payload: { libraryId: 357 }
      })
    );
    const res = await engineResultModule.libraryId(
      { taskId: 123 },
      {},
      serviceContext
    );
    chaiExpect(res).to.equal(357);
  });

  it('should load library', async () => {
    _.set(serviceContext, 'dal.task.getTask', () =>
      Promise.resolve({
        payload: { libraryId: 357 }
      })
    );

    _.set(serviceContext, 'dal.library.getLibrary', ({ id }) =>
      Promise.resolve({
        id,
        name: 'Test Name'
      })
    );

    const res = await engineResultModule.library(
      { taskId: 123 },
      {},
      serviceContext
    );
    chaiExpect(res.id).to.equal(357);
    chaiExpect(res.name).to.equal('Test Name');
  });

  // VE-26285: libraryId/library read the task from a partitioned table; a retention-
  // dropped partition (PG 42P01) previously failed the whole engineResults query.
  describe.each([['libraryId'], ['library']])('#%s dropped-partition handling', (field) => {
    it('returns null without querying when the record has no taskId', () => {
      const getTask = jest.fn();
      _.set(serviceContext, 'dal.task.getTask', getTask);
      chaiExpect(engineResultModule[field]({ taskId: null }, {}, serviceContext)).to.equal(null);
      expect(getTask).not.toHaveBeenCalled();
    });

    it('returns null when the task carries no libraryId', async () => {
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockResolvedValue({ payload: {} }));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).resolves.toBeNull();
    });

    it('returns null when the task partition has been dropped (PG 42P01)', async () => {
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(sqlError('42P01')));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).resolves.toBeNull();
    });

    it('returns null for a raw pg error carrying the code on err.code', async () => {
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(rawPgError('42P01')));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).resolves.toBeNull();
    });

    it('rethrows unrelated SQL failures instead of masking them as null', async () => {
      const err = sqlError('40001');
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(err));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).rejects.toBe(err);
    });

    it('rethrows a known PG error that is not a dropped partition', async () => {
      const err = sqlError('42703');
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(err));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).rejects.toBe(err);
    });

    it('rethrows a typed not_found (task absent from a live partition)', async () => {
      const err = new errors.NotFound({ data: { objectId: 't1' } });
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(err));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).rejects.toBe(err);
    });

    it('rethrows non-SQL errors', async () => {
      const err = new Error('Connection timeout');
      _.set(serviceContext, 'dal.task.getTask', jest.fn().mockRejectedValue(err));
      await expect(
        engineResultModule[field]({ taskId: 't1' }, {}, serviceContext)
      ).rejects.toBe(err);
    });
  });

  it('#library returns null when the library partition has been dropped (PG 42P01)', async () => {
    _.set(
      serviceContext,
      'dal.task.getTask',
      jest.fn().mockResolvedValue({ payload: { libraryId: 'lib-123' } })
    );
    const getLibrary = jest.fn().mockRejectedValue(sqlError('42P01'));
    _.set(serviceContext, 'dal.library.getLibrary', getLibrary);

    await expect(
      engineResultModule.library({ taskId: 't1' }, {}, serviceContext)
    ).resolves.toBeNull();
    expect(getLibrary).toHaveBeenCalledWith({ id: 'lib-123' });
  });
});
