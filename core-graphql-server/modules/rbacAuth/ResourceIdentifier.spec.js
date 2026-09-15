const createResourceIdentifier = require('./ResourceIdentifier');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('ResourceIdentifier resolvers', () => {
  let resolver;

  beforeEach(() => {
    const serviceContext = { config: defaultServiceContext.config };
    resolver = createResourceIdentifier(serviceContext);
  });

  it('resourceType returns obj.resourceType', () => {
    const obj = { resourceType: 'TDO', resourceId: 'tdo-1' };

    const result = resolver.resourceType(obj, {}, {});

    expect(result).toBe('TDO');
  });
});
