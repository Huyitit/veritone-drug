const createMockServiceContext = require('../modules/v3DataModel/test/serviceContext.mock.js');
const { parsePaginationArgs } = require('./paginationParser')(
  createMockServiceContext
);
const { InvalidInput } = require('../error')(createMockServiceContext.config);

describe('#parsePaginationArgs', function () {
  it('should throw error if limit is less than or equal to 0', function () {
    expect(() => parsePaginationArgs({ limit: 0 })).toThrow(InvalidInput);
    expect(() => parsePaginationArgs({ limit: -1 })).toThrow(InvalidInput);
  });
  it('should throw error if offset is less than 0', function () {
    expect(() => parsePaginationArgs({ offset: -1 })).toThrow(InvalidInput);
  });
  it('should not throw error if limit and offset are valid', function () {
    expect(() => parsePaginationArgs({ limit: 1, offset: 0 })).not.toThrow();
  });
  it('should not throw error if limit and offset are not provided', function () {
    expect(() => parsePaginationArgs({})).not.toThrow();
  });
});
