const mockLoadConfig = jest.fn();
jest.mock('@veritone/ts-config-lib', () => ({
  ConfigLoader: { loadConfig: mockLoadConfig }
}));

const GraphQLServiceFeatureFlags = require('./featureFlags');

describe('GraphQLServiceFeatureFlags config schema', () => {
  const schema = new GraphQLServiceFeatureFlags().getServiceConfigSchema();
  const flags = schema.featureFlags;

  it('exposes the documented flag defaults and formats', () => {
    expect(flags.redisCacheEnabled).toEqual({
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    });
    expect(flags.rateLimitOnUnhealthyServer.default).toBe(false);
    expect(flags.enableRBACFeature.default).toBe(false);
    expect(flags.maxSharedMentionId).toEqual({
      format: Number,
      default: 0,
      remoteConfig: 'aiware-controller'
    });
  });

  it('declares every flag against the aiware-controller remote config with a Boolean/Number/Array format', () => {
    const entries = Object.values(flags);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.remoteConfig).toBe('aiware-controller');
      expect([Boolean, Number, Array]).toContain(entry.format);
      expect(entry).toHaveProperty('default');
    }
  });

  it('declares enabledDestinationConnects as an array flag defaulting to empty (VE-24929, BR-5)', () => {
    expect(flags.enabledDestinationConnects).toEqual({
      format: Array,
      default: [],
      remoteConfig: 'aiware-controller'
    });
  });
});

describe('GraphQLServiceFeatureFlags accessors', () => {
  const instance = new GraphQLServiceFeatureFlags();

  it('has no static service config file', () => {
    expect(instance.getStaticServiceConfigFile()).toBeNull();
  });

  it('returns an empty resource map', () => {
    const map = instance.getResourceMap();
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  it('does not convert legacy config', () => {
    expect(instance.legacyConfigConvert({ some: 'data' }, 'path')).toBeNull();
  });

  it('passes post-process data through unchanged', () => {
    const data = { a: 1 };
    expect(instance.postProcess(data)).toBe(data);
  });
});

describe('GraphQLServiceFeatureFlags.getFlags', () => {
  beforeEach(() => mockLoadConfig.mockReset());

  it('loads config via ConfigLoader with a service-flags instance and the provider', async () => {
    mockLoadConfig.mockResolvedValue({ redisCacheEnabled: true });
    const result = await GraphQLServiceFeatureFlags.getFlags('providerX');

    expect(result).toEqual({ redisCacheEnabled: true });
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    const [instanceArg, providerArg] = mockLoadConfig.mock.calls[0];
    expect(instanceArg).toBeInstanceOf(GraphQLServiceFeatureFlags);
    expect(providerArg).toBe('providerX');
  });
});
