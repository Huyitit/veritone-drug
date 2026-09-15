'use strict';

const chaiExpect = require('chai').expect;

// Mock resolvers/util before requiring Mutation.js so the inner require()
// inside the factory gets the mock when the factory is invoked.
jest.mock('../../resolvers/util');
const resolversUtil = require('../../resolvers/util');

const createMutations = require('./Mutation.js');

describe('Mutation resolvers', () => {
  let mutations;
  let mockDal;
  let mockGetTokenType;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetTokenType = jest.fn();
    resolversUtil.mockImplementation(() => ({
      getTokenType: mockGetTokenType
    }));

    mockDal = {
      internalToken: {
        requestInternalToken: jest.fn(),
        approveInternalToken: jest.fn(),
        updateInternalToken: jest.fn(),
        revokeInternalToken: jest.fn()
      },
      queryMonitor: {
        queryMonitor: jest.fn()
      },
      scheduledEvent: {
        createScheduledEvent: jest.fn(),
        updateScheduledEvent: jest.fn(),
        deleteScheduledEvent: jest.fn()
      },
      asset: {
        setAssetStorageTags: jest.fn()
      }
    };

    mutations = createMutations({ dal: mockDal }, {});
  });

  describe('#setAssetStorageTags', () => {
    it('throws NotAllowed when the caller does not hold an internal token', () => {
      mockGetTokenType.mockReturnValue('user');

      const fn = () =>
        mutations.setAssetStorageTags(
          null,
          { input: { uri: 's3://bucket/key', tags: [] } },
          {}
        );

      chaiExpect(fn).to.throw();
    });

    it('delegates to dal.asset.setAssetStorageTags when the caller holds an internal token', () => {
      mockGetTokenType.mockReturnValue('internal');
      const args = { input: { uri: 's3://bucket/key', tags: ['tag1'] } };

      mutations.setAssetStorageTags(null, args, {});

      chaiExpect(mockDal.asset.setAssetStorageTags.mock.calls.length).to.equal(1);
      const [calledUri, calledTags] = mockDal.asset.setAssetStorageTags.mock.calls[0];
      chaiExpect(calledUri).to.equal('s3://bucket/key');
      chaiExpect(calledTags).to.deep.equal(['tag1']);
    });
  });

  describe('#requestInternalToken', () => {
    it('delegates to dal.internalToken.requestInternalToken with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { tag: 'my-service', rights: [] };

      mutations.requestInternalToken(null, args, context);

      chaiExpect(mockDal.internalToken.requestInternalToken.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.internalToken.requestInternalToken.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });
  });

  describe('#databaseQueryMonitor', () => {
    it('delegates to dal.queryMonitor.queryMonitor with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { enableAnalyze: true, maxTables: 10, stalenessDays: 15 };

      mutations.databaseQueryMonitor(null, args, context);

      chaiExpect(mockDal.queryMonitor.queryMonitor.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.queryMonitor.queryMonitor.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });
  });

  describe('remaining admin passthrough resolvers', () => {
    it('delegates approveInternalToken to dal.internalToken.approveInternalToken with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { token: 't1' };

      mutations.approveInternalToken(null, args, context);

      chaiExpect(mockDal.internalToken.approveInternalToken.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.internalToken.approveInternalToken.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });

    it('delegates updateInternalToken to dal.internalToken.updateInternalToken with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { token: 't1', input: { label: 'new-label' } };

      mutations.updateInternalToken(null, args, context);

      chaiExpect(mockDal.internalToken.updateInternalToken.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.internalToken.updateInternalToken.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });

    it('delegates revokeInternalToken to dal.internalToken.revokeInternalToken with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { token: 't1' };

      mutations.revokeInternalToken(null, args, context);

      chaiExpect(mockDal.internalToken.revokeInternalToken.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.internalToken.revokeInternalToken.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });

    it('delegates createScheduledEvent to dal.scheduledEvent.createScheduledEvent with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { input: { cron: '1 2 3 4 5 6' } };

      mutations.createScheduledEvent(null, args, context);

      chaiExpect(mockDal.scheduledEvent.createScheduledEvent.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.scheduledEvent.createScheduledEvent.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });

    it('delegates updateScheduledEvent to dal.scheduledEvent.updateScheduledEvent with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { id: 'se1', input: { cron: '1 2 3 4 5 6' } };

      mutations.updateScheduledEvent(null, args, context);

      chaiExpect(mockDal.scheduledEvent.updateScheduledEvent.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.scheduledEvent.updateScheduledEvent.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });

    it('delegates deleteScheduledEvent to dal.scheduledEvent.deleteScheduledEvent with the resolver context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { id: 'se1' };

      mutations.deleteScheduledEvent(null, args, context);

      chaiExpect(mockDal.scheduledEvent.deleteScheduledEvent.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.scheduledEvent.deleteScheduledEvent.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });
  });
});
