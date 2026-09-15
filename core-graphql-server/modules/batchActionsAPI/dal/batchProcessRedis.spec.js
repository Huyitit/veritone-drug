const redisGet = jest.fn();
const redisSet = jest.fn();

const serviceContext = require('../../../test/serviceContext.mock.js')();
serviceContext.redisClient = { get: redisGet, set: redisSet };

const dal = require('./batchProcessRedis.js')(serviceContext);

const KEY = 'core-graphql-server:TDOBatch:batchProcess:bp1';
const TTL = 10800;

function lastSetPayload() {
  const call = redisSet.mock.calls[redisSet.mock.calls.length - 1];
  return { key: call[0], obj: JSON.parse(call[1]), ex: call[2], ttl: call[3] };
}

beforeEach(() => {
  redisGet.mockReset();
  redisSet.mockReset();
});

describe('batchActionsAPI dal batchProcessRedis.updateBatchProcessObject', () => {
  it('throws InternalServerError when status is missing', async () => {
    await expect(dal.updateBatchProcessObject({}, { batchProcessId: 'bp1' })).rejects.toThrow(
      'status for redis object need to be passed as input param'
    );
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('creates a default object and persists it when the key is not cached', async () => {
    redisGet.mockImplementation((key, cb) => cb(null, null));
    await dal.updateBatchProcessObject({}, {
      batchProcessId: 'bp1',
      status: 'running',
      jobsRunning: 5,
      concurrency: 10
    });
    const { key, obj, ex, ttl } = lastSetPayload();
    expect(key).toBe(KEY);
    expect(obj).toEqual({ batchProcessId: 'bp1', status: 'running', jobsRunning: 5, concurrency: 10 });
    expect(ex).toBe('EX');
    expect(ttl).toBe(TTL);
  });

  it('defaults jobsRunning and concurrency to 0 when the key is absent and no counts are supplied', async () => {
    redisGet.mockImplementation((key, cb) => cb(null, null));
    await dal.updateBatchProcessObject({}, { batchProcessId: 'bp1', status: 'running' });
    const { obj } = lastSetPayload();
    expect(obj.jobsRunning).toBe(0);
    expect(obj.concurrency).toBe(0);
  });

  it('merges onto the cached object, overriding status but keeping existing counts when not supplied', async () => {
    redisGet.mockImplementation((key, cb) =>
      cb(null, JSON.stringify({ batchProcessId: 'bp1', status: 'pending', jobsRunning: 2, concurrency: 8 }))
    );
    await dal.updateBatchProcessObject({}, { batchProcessId: 'bp1', status: 'completed' });
    const { obj } = lastSetPayload();
    expect(obj.status).toBe('completed');
    expect(obj.jobsRunning).toBe(2);
    expect(obj.concurrency).toBe(8);
  });

  it('overrides the cached counts when the input supplies them', async () => {
    redisGet.mockImplementation((key, cb) =>
      cb(null, JSON.stringify({ batchProcessId: 'bp1', status: 'pending', jobsRunning: 2, concurrency: 8 }))
    );
    await dal.updateBatchProcessObject({}, {
      batchProcessId: 'bp1',
      status: 'running',
      jobsRunning: 6,
      concurrency: 12
    });
    const { obj } = lastSetPayload();
    expect(obj.jobsRunning).toBe(6);
    expect(obj.concurrency).toBe(12);
  });
});

describe('batchActionsAPI dal batchProcessRedis.createBatchProcessObject', () => {
  it('persists the serialized batch-process object with the prefixed key and TTL', async () => {
    redisSet.mockResolvedValue('OK');
    const result = await dal.createBatchProcessObject({}, {
      batchProcessId: 'bp1',
      status: 'pending',
      jobsRunning: 0,
      concurrency: 4
    });
    const { key, obj, ex, ttl } = lastSetPayload();
    expect(key).toBe(KEY);
    expect(obj).toEqual({ batchProcessId: 'bp1', status: 'pending', jobsRunning: 0, concurrency: 4 });
    expect(ex).toBe('EX');
    expect(ttl).toBe(TTL);
    expect(result).toBe('OK');
  });
});
