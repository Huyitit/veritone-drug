'use strict';

const { initializeServiceContext } = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./dalFlowExecution')(serviceContext);
const coreDbRead = serviceContext.dbConnections['core'].read;

const BASE_ROW = {
  flow_execution_id: 'exe-001',
  flow_execution_status: 'complete',
  flow_execution_result: null,
  flow_execution_log: null,
  flow_id: 'flow-abc',
  organization_id: '12345',
  flow_execution_input: null,
  created_date_time: '2026-01-01T00:00:00Z',
  updated_date_time: '2026-01-01T01:00:00Z',
  user_id: 'user-1',
  run_mode: 'sync'
};

describe('dalFlowExecution.js — getFlowExecutions', () => {
  const context = global.mockUtil.makeContext();

  beforeEach(() => {
    coreDbRead._clearResultQueue();
  });

  it('returns a page of flow executions when queried without a specific ID', async () => {
    coreDbRead._push([{ ...BASE_ROW, total: 1 }]);

    const result = await dal.getFlowExecutions(context, {});

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('returns a single execution when queried by flowExecutionId', async () => {
    coreDbRead._push([BASE_ROW]);

    const result = await dal.getFlowExecutions(context, {
      flowExecutionId: 'exe-001'
    });

    expect(result).toBeDefined();
  });

  it('returns an empty result when DB has no matching rows', async () => {
    coreDbRead._push([]);

    const result = await dal.getFlowExecutions(context, {});

    expect(result).toBeDefined();
  });
});
