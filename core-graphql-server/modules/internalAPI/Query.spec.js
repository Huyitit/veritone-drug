'use strict';

const chaiExpect = require('chai').expect;

const createQueries = require('./Query.js');

describe('Query resolvers', () => {
  let queries;
  let mockDal;

  beforeEach(() => {
    mockDal = {
      internalToken: {
        getInternalTokens: jest.fn(),
        getInternalToken: jest.fn(),
        listAllRights: jest.fn()
      },
      scheduledEvent: {
        getScheduledEvent: jest.fn(),
        getScheduledEvents: jest.fn()
      }
    };

    queries = createQueries({ dal: mockDal });
  });

  describe('#internalTokens', () => {
    it('delegates to dal.internalToken.getInternalTokens with context and args', () => {
      const context = { _authInfo: { userId: 'u1' } };
      const args = { limit: 10 };

      queries.internalTokens(null, args, context);

      chaiExpect(mockDal.internalToken.getInternalTokens.mock.calls.length).to.equal(1);
      const [calledContext, calledArgs] = mockDal.internalToken.getInternalTokens.mock.calls[0];
      chaiExpect(calledContext).to.equal(context);
      chaiExpect(calledArgs).to.equal(args);
    });
  });
});
