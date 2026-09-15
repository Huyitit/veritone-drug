'use strict';

const createFunction = require('./db');

describe('dbWriteTx', () => {
  it('acquires a write connection and returns operational tx object when no openTx is provided', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue(null),
      done: jest.fn(),
    };
    const serviceContext = {
      dbConnections: {
        mydb: { write: { connect: jest.fn().mockResolvedValue(mockClient) } },
      },
    };

    const { dbWriteTx } = createFunction(serviceContext);
    const tx = await dbWriteTx('mydb', null);

    expect(serviceContext.dbConnections.mydb.write.connect).toHaveBeenCalledTimes(1);
    expect(tx.client).toBe(mockClient);
    expect(typeof tx.begin).toBe('function');
    expect(typeof tx.commit).toBe('function');
    expect(typeof tx.rollback).toBe('function');
    expect(typeof tx.done).toBe('function');
  });

  it('reuses the existing client and returns no-op begin/commit/rollback/done when openTx is provided', async () => {
    const mockClient = {};
    const openTx = { client: mockClient };
    const serviceContext = { dbConnections: {} };

    const { dbWriteTx } = createFunction(serviceContext);
    const tx = await dbWriteTx('anydb', openTx);

    expect(tx.client).toBe(mockClient);
    expect(tx.begin()).toBeUndefined();
    expect(tx.commit()).toBeUndefined();
    expect(tx.rollback()).toBeUndefined();
    expect(tx.done()).toBeUndefined();
  });
});
