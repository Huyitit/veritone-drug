const { StubInitGenerator, StubOutputFormat } = require('@veritone/ts-config-lib');
const ServiceConfig = require('../config');
const ServiceFeatureFlags = require('../featureFlags');

describe('stubConfigGenerator — config schema YAML output', () => {
  let configYaml;

  beforeAll(() => {
    const config = new ServiceConfig();
    configYaml = StubInitGenerator.processConfig(config.getServiceConfigSchema(), StubOutputFormat.yaml);
  });

  it('output begins with a top-level resources section', () => {
    expect(configYaml).toMatch(/^resources:/);
  });

  it('resources section contains nsq, minio, redis, and postgres entries', () => {
    expect(configYaml).toContain('resourceType: nsq');
    expect(configYaml).toContain('resourceType: minio');
    expect(configYaml).toContain('resourceType: redis');
    expect(configYaml).toContain('resourceType: postgres');
  });

  it('includes a configKeys section listing core application config keys', () => {
    expect(configYaml).toContain('configKeys:');
    expect(configYaml).toContain('key: applicationName');
    expect(configYaml).toContain('key: nodeEnv');
    expect(configYaml).toContain('key: port');
  });
});

describe('stubConfigGenerator — featureFlags schema YAML output', () => {
  let flagsYaml;

  beforeAll(() => {
    const featureFlags = new ServiceFeatureFlags();
    flagsYaml = StubInitGenerator.processConfig(featureFlags.getServiceConfigSchema(), StubOutputFormat.yaml);
  });

  it('featureFlags output has an empty resources list', () => {
    expect(flagsYaml).toMatch(/^resources: \[\]/m);
  });

  it('featureFlags configKeys section lists known feature flags', () => {
    expect(flagsYaml).toContain('configKeys:');
    expect(flagsYaml).toContain('key: featureFlags.rateLimitOnUnhealthyServer');
    expect(flagsYaml).toContain('key: featureFlags.redisCacheEnabled');
  });
});
