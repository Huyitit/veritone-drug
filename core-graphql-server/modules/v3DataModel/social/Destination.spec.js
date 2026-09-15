'use strict';

const serviceContext = require('../../../test/serviceContext.mock.js')();
const mockGetDestinationType = jest.fn();
serviceContext.dal = serviceContext.dal || {};
serviceContext.dal.destinationType = { getDestinationType: mockGetDestinationType };

const resolvers = require('./Destination.js')(serviceContext);

function makeContext() {
  return { loaders: { usersById: { load: jest.fn() } } };
}

beforeEach(() => mockGetDestinationType.mockReset());

describe('v3DataModel Destination field resolvers', () => {
  describe('destinationType', () => {
    it('loads the destination type by id when destinationTypeId is present', () => {
      mockGetDestinationType.mockReturnValue('the-type');
      const context = makeContext();
      const result = resolvers.destinationType({ destinationTypeId: 'dt1' }, {}, context);
      expect(mockGetDestinationType).toHaveBeenCalledWith(context, { id: 'dt1' });
      expect(result).toBe('the-type');
    });

    it('returns null when destinationTypeId is absent', () => {
      expect(resolvers.destinationType({}, {}, makeContext())).toBeNull();
      expect(mockGetDestinationType).not.toHaveBeenCalled();
    });
  });

  describe('details', () => {
    it('parses a JSON string into an object', () => {
      expect(resolvers.details({ details: '{"a":1}' })).toEqual({ a: 1 });
    });

    it('passes an already-parsed object through unchanged', () => {
      const obj = { a: 1 };
      expect(resolvers.details({ details: obj })).toBe(obj);
    });
  });

  describe('createdBy', () => {
    it('loads the creating user via the loader when createdByUserId is present', () => {
      const context = makeContext();
      context.loaders.usersById.load.mockReturnValue('the-user');
      const result = resolvers.createdBy({ createdByUserId: 'u1' }, {}, context);
      expect(context.loaders.usersById.load).toHaveBeenCalledWith('u1');
      expect(result).toBe('the-user');
    });

    it('returns null when createdByUserId is absent', () => {
      const context = makeContext();
      expect(resolvers.createdBy({}, {}, context)).toBeNull();
      expect(context.loaders.usersById.load).not.toHaveBeenCalled();
    });
  });
});
