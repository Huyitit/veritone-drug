const createModule = require('./index');

describe('rbacAuth module factory', () => {
  it('returns skeleton with empty resolvers when enableRBACFeature is false', () => {
    const serviceContext = {
      config: { featureFlags: { enableRBACFeature: false } }
    };

    const result = createModule(serviceContext);

    expect(result.resolvers).toEqual({});
    expect(Array.isArray(result.typeDefs)).toBe(true);
    expect(result.typeDefs[0]).toBeTruthy();
  });
});
