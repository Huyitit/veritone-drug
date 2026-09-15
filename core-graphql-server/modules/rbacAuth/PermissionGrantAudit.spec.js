const createPermissionGrantAudit = require('./PermissionGrantAudit');
const createServiceContext = require('../../test/serviceContext.mock.js');
const defaultServiceContext = createServiceContext();

describe('PermissionGrantAudit resolvers', () => {
  let resolver;

  beforeEach(() => {
    const serviceContext = {
      bll: { rbacAuth: {} },
      config: defaultServiceContext.config
    };
    resolver = createPermissionGrantAudit(serviceContext);
  });

  it('reason returns default "Permission granted" when obj.reason is undefined', () => {
    const obj = { permission: 'READ' };

    const result = resolver.reason(obj, {}, {});

    expect(result).toBe('Permission granted');
  });
});
