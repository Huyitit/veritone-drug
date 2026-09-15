'use strict';

const dal = {
  task: { getTask: jest.fn() },
  engine: { getIdById: jest.fn(), getEngine: jest.fn() }
};
const resolvers = require('./TDOSourceData.js')({ dal });

const context = { reqId: 'r1' };

beforeEach(() => {
  dal.task.getTask.mockReset();
  dal.engine.getIdById.mockReset();
  dal.engine.getEngine.mockReset();
});

describe('TDOSourceData.task', () => {
  it('loads the task by id when taskId is present', () => {
    dal.task.getTask.mockReturnValue('task');
    expect(resolvers.task({ taskId: 't1' }, {}, context)).toBe('task');
    expect(dal.task.getTask).toHaveBeenCalledWith(context, { id: 't1' });
  });

  it('returns null when there is no taskId', () => {
    expect(resolvers.task({}, {}, context)).toBeNull();
    expect(dal.task.getTask).not.toHaveBeenCalled();
  });
});

describe('TDOSourceData.engineId', () => {
  it('resolves the engine id from the task engineId', async () => {
    dal.task.getTask.mockResolvedValue({ engineId: 'e1' });
    dal.engine.getIdById.mockResolvedValue('eid');
    const result = await resolvers.engineId({ taskId: 't1' }, {}, context);
    expect(dal.task.getTask).toHaveBeenCalledWith(context, { id: 't1' });
    expect(dal.engine.getIdById).toHaveBeenCalledWith(context, 'e1');
    expect(result).toBe('eid');
  });

  it('returns null when there is no taskId', async () => {
    expect(await resolvers.engineId({}, {}, context)).toBeNull();
    expect(dal.task.getTask).not.toHaveBeenCalled();
  });
});

describe('TDOSourceData.engine', () => {
  it('resolves the engine from the task engineId', async () => {
    dal.task.getTask.mockResolvedValue({ engineId: 'e1' });
    dal.engine.getEngine.mockResolvedValue('engine');
    const result = await resolvers.engine({ taskId: 't1' }, {}, context);
    expect(dal.engine.getEngine).toHaveBeenCalledWith(context, { id: 'e1' });
    expect(result).toBe('engine');
  });

  it('returns null when there is no taskId', async () => {
    expect(await resolvers.engine({}, {}, context)).toBeNull();
    expect(dal.engine.getEngine).not.toHaveBeenCalled();
  });
});
