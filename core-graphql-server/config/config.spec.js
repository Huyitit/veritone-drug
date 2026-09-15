const { ConfigLoader } = require('@veritone/ts-config-lib');
const GraphQLServiceConfig = require('./config');
const GraphQLServiceFeatureFlags = require('./featureFlags');

describe('GraphQLServiceFeatureFlags#getServiceConfigSchema', () => {
  it('security-gated flags default to false', () => {
    const schema = new GraphQLServiceFeatureFlags().getServiceConfigSchema();
    const flags = schema.featureFlags;

    expect(flags.rateLimitOnUnhealthyServer.default).toBe(false);
    expect(flags.enableRBACFeature.default).toBe(false);
    expect(flags.virtualAssetEnabled.default).toBe(false);
  });
});

describe('GraphQLServiceConfig#getServiceConfigSchema', () => {
  it('oci.enabled defaults to false', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.oci.enabled.default).toBe(false);
  });

  it('jwt.ttl defaults to 7d, port defaults to 9000, nodeEnv defaults to prod', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.jwt.ttl.default).toBe('7d');
    expect(schema.port.default).toBe(9000);
    expect(schema.nodeEnv.default).toBe('prod');
  });

  it('assetSize.retryMaxAttempts defaults to 5 and retryInitialDelayMs defaults to 500', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.assetSize.retryMaxAttempts.default).toBe(5);
    expect(schema.assetSize.retryInitialDelayMs.default).toBe(500);
  });

  it('ayrshare config block has safe defaults with apiKey and privateKey marked sensitive', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.ayrshare.baseUrl.default).toBe('https://api.ayrshare.com');
    expect(schema.ayrshare.apiKey.default).toBeNull();
    expect(schema.ayrshare.apiKey.sensitive).toBe(true);
    expect(schema.ayrshare.privateKey.default).toBeNull();
    expect(schema.ayrshare.privateKey.sensitive).toBe(true);
    expect(schema.ayrshare.domain.default).toBeNull();
  });

  it('virtualAssetEndpoint, virtualAssetStaticEndpoint, and virtualAsset.jwt.secret have documented defaults', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.virtualAssetEndpoint.default).toBe('asset');
    expect(schema.virtualAssetStaticEndpoint.default).toBe('asset-static');
    expect(schema.virtualAsset.jwt.secret.default).toBeNull();
    expect(schema.virtualAsset.jwt.secret.secret).toBe(true);
    expect(schema.virtualAsset.jwt.secret.env).toBe('VIRTUAL_ASSET_JWT_SECRET');
  });

  it('s3/oci credential-id and cloud-provider fields default to null and are marked sensitive', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.s3.accessCredentialId.default).toBeNull();
    expect(schema.s3.accessCredentialId.sensitive).toBe(true);
    expect(schema.s3.cloudProvider.default).toBeNull();
    expect(schema.oci.accessCredentialId.default).toBeNull();
    expect(schema.oci.accessCredentialId.sensitive).toBe(true);
  });

  it('elastic.connection HTTP-agent tuning defaults (timeout, retries, pooling)', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.elastic.connection.requestTimeout.default).toBe(30000);
    expect(schema.elastic.connection.maxRetries.default).toBe(0);
    expect(schema.elastic.connection.maxSockets.default).toBe(25);
    expect(schema.elastic.connection.maxFreeSockets.default).toBe(10);
  });

  // VE-25603: the ANALYZE sweep on databaseQueryMonitor must stay opt-in and
  // its scope/budget tuning must not silently drift — a bad default here
  // means production tables get ANALYZE'd on every deployment, or the sweep
  // exceeds the shared NSQ message-timeout budget it splits with the kill sweep.
  it('queryMonitor.analyze{Enabled,StalenessDays,MaxTables,MaxRunMs} default to opt-out with documented tuning', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.queryMonitor.analyzeEnabled.default).toBe(false);
    expect(schema.queryMonitor.analyzeStalenessDays.default).toBe(15);
    expect(schema.queryMonitor.analyzeMaxTables.default).toBe(10);
    expect(schema.queryMonitor.analyzeMaxRunMs.default).toBe(40000);
  });

  // VE-25569: these shipped in the AuthPermissionType enum with the
  // distribution-center work but were missing from the whitelist, so
  // create/updateApplication rejected any application role carrying them.
  // This pins the shipped default; dalApplication.spec.js covers the
  // enforcement path that reads it.
  // VE-25263: engineTransitSecret is the shared AES-256-GCM key for encrypting
  // engine-bound scoped secrets in transit. It must default to null (fail-closed
  // when unset) and stay marked sensitive so it never appears in config dumps/logs.
  it('engineTransitSecret defaults to null and is marked sensitive', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();

    expect(schema.engineTransitSecret.default).toBeNull();
    expect(schema.engineTransitSecret.sensitive).toBe(true);
    expect(schema.engineTransitSecret.env).toBe('ENGINE_TRANSIT_SECRET');
  });

  it('rbac.permissions whitelists the destination permissions and does not blacklist them', () => {
    const schema = new GraphQLServiceConfig().getServiceConfigSchema();
    const destinationPermissions = [
      'AIWARE_DESTINATION_CREATE',
      'AIWARE_DESTINATION_READ',
      'AIWARE_DESTINATION_UPDATE',
      'AIWARE_DESTINATION_DELETE'
    ];

    expect(schema.rbac.permissions.whitelist.default).toEqual(
      expect.arrayContaining(destinationPermissions)
    );
    // Intersection, not expect.not.arrayContaining — the latter passes when
    // only some of the permissions are blacklisted.
    const blacklisted = schema.rbac.permissions.blacklist.default.filter((p) =>
      destinationPermissions.includes(p)
    );
    expect(blacklisted).toEqual([]);
  });
});

describe('GraphQLServiceConfig.parseRedisConnectionString', () => {
  it('parses a redis URI with user credentials into host/port/user/password', () => {
    const result = GraphQLServiceConfig.parseRedisConnectionString(
      'redis://myuser:s3cr3t@redis.host.example:6380'
    );

    expect(result).toEqual({
      user: 'myuser',
      password: 's3cr3t',
      host: 'redis.host.example',
      port: 6380
    });
  });

  it('parses a redis URI without credentials with empty user and password', () => {
    const result = GraphQLServiceConfig.parseRedisConnectionString(
      'redis://cache.internal:6379'
    );

    expect(result).toEqual({ user: '', password: '', host: 'cache.internal', port: 6379 });
  });

  it('returns null for a non-Redis connection string', () => {
    const result = GraphQLServiceConfig.parseRedisConnectionString(
      'postgres://user:pass@db.example:5432/mydb'
    );

    expect(result).toBeNull();
  });
});

describe('GraphQLServiceConfig#getResourceMap', () => {
  it('redis handler parses the connection string and sets resourceMap for a known resource name', () => {
    const config = new GraphQLServiceConfig();
    const map = config.getResourceMap();
    const resourceMap = {};

    map.get('redis')(resourceMap, 'redis', {
      URI: 'redis://cache.internal:6379'
    });

    expect(resourceMap.redis).toEqual({
      user: '',
      password: '',
      host: 'cache.internal',
      port: 6379
    });
  });

  it('redis handler ignores an unrecognized resource name', () => {
    const config = new GraphQLServiceConfig();
    const map = config.getResourceMap();
    const resourceMap = {};

    map.get('redis')(resourceMap, 'someOtherResource', {
      URI: 'redis://cache.internal:6379'
    });

    expect(resourceMap).toEqual({});
  });

  it('es handler sets elastic.connection.host from the resource URI', () => {
    const config = new GraphQLServiceConfig();
    const map = config.getResourceMap();
    const resourceMap = {};

    map.get('es')(resourceMap, 'es', { URI: 'https://es.internal:9200' });

    expect(resourceMap.elastic.connection.host).toBe('https://es.internal:9200');
  });
});

describe('GraphQLServiceConfig#legacyConfigConvert', () => {
  it('returns s3.buckets nested structure unchanged when buckets is already an array', () => {
    const buckets = [{ key: 'primary', name: 'my-bucket' }];
    const data = { s3: { buckets } };
    const converter = new GraphQLServiceConfig();

    const result = converter.legacyConfigConvert(data, 's3.buckets');

    expect(result).toEqual({ s3: { buckets } });
  });

  it('returns null for a non-s3.buckets path', () => {
    const data = { db: { core: { read: 'postgres://localhost/core' } } };
    const converter = new GraphQLServiceConfig();

    const result = converter.legacyConfigConvert(data, 'db.core.read');

    expect(result).toBeNull();
  });

  it('converts s3.buckets from object-keyed form to array with key field merged in', () => {
    const data = {
      s3: {
        buckets: {
          primary: { name: 'primary-bucket', region: 'us-east-1' },
          secondary: { name: 'secondary-bucket', region: 'us-west-2' }
        }
      }
    };
    const converter = new GraphQLServiceConfig();

    const result = converter.legacyConfigConvert(data, 's3.buckets');

    expect(result.s3.buckets).toHaveLength(2);
    expect(result.s3.buckets).toContainEqual({
      key: 'primary',
      name: 'primary-bucket',
      region: 'us-east-1'
    });
    expect(result.s3.buckets).toContainEqual({
      key: 'secondary',
      name: 'secondary-bucket',
      region: 'us-west-2'
    });
  });
});

describe('GraphQLServiceConfig#postProcess', () => {
  it('copies edgeClusterID to defaultRealTimeCluster when defaultRealTimeCluster is empty', () => {
    const data = {
      edgeClusterID: 'cluster-abc',
      defaultRealTimeCluster: '',
      aiware: { defaultCluster: {} },
      log: { level: 'info' }
    };
    const converter = new GraphQLServiceConfig();

    converter.postProcess(data);

    expect(data.defaultRealTimeCluster).toBe('cluster-abc');
  });

  it('copies edgeClusterID to aiware.defaultCluster.id when it is empty', () => {
    const data = {
      edgeClusterID: 'cluster-abc',
      defaultRealTimeCluster: 'cluster-abc',
      aiware: { defaultCluster: {} },
      log: { level: 'info' }
    };
    const converter = new GraphQLServiceConfig();

    converter.postProcess(data);

    expect(data.aiware.defaultCluster.id).toBe('cluster-abc');
  });

  it('leaves defaultRealTimeCluster and aiware.defaultCluster.id untouched when edgeClusterID is empty', () => {
    const data = {
      edgeClusterID: '',
      defaultRealTimeCluster: '',
      aiware: { defaultCluster: {} },
      log: { level: 'info' }
    };
    const converter = new GraphQLServiceConfig();

    converter.postProcess(data);

    expect(data.defaultRealTimeCluster).toBe('');
    expect(data.aiware.defaultCluster.id).toBeUndefined();
  });

  it('sets log.console.level to the lowercased log.level value', () => {
    const data = {
      edgeClusterID: '',
      aiware: { defaultCluster: {} },
      log: { level: 'WARN' }
    };
    const converter = new GraphQLServiceConfig();

    converter.postProcess(data);

    expect(data.log.console.level).toBe('warn');
  });


  describe('server.headers.csp sanitization', () => {
    const makeData = (csp) => ({
      edgeClusterID: '',
      aiware: { defaultCluster: {} },
      log: { level: 'info' },
      server: { headers: { csp } }
    });
    const malformed =
      "default-src 'self' https://fonts.googleapis.com " +
      'https://fonts.gstatic.com *.us-3.veritone.com:443:8443';

    it('drops a malformed source and records a warning', () => {
      const data = makeData({ value: malformed });

      new GraphQLServiceConfig().postProcess(data);

      expect(data.server.headers.csp.value).toBe(
        "default-src 'self' https://fonts.googleapis.com " +
          'https://fonts.gstatic.com'
      );
      expect(data.server.headers.csp.sanitizationWarnings).toEqual([
        'CSP: dropped invalid source "*.us-3.veritone.com:443:8443" from ' +
          'directive "default-src" in server.headers.csp.value'
      ]);
    });

    it('leaves a healthy policy byte-identical and adds no warnings', () => {
      const healthy =
        "default-src 'self' https://fonts.googleapis.com " +
        'https://fonts.gstatic.com';
      const data = makeData({ value: healthy });

      new GraphQLServiceConfig().postProcess(data);

      expect(data.server.headers.csp.value).toBe(healthy);
      expect(
        data.server.headers.csp.sanitizationWarnings
      ).toBeUndefined();
    });

    it('tolerates config with no csp block at all', () => {
      const data = {
        edgeClusterID: '',
        aiware: { defaultCluster: {} },
        log: { level: 'info' }
      };

      expect(() => new GraphQLServiceConfig().postProcess(data)).not.toThrow();
    });
  });
});

describe('GraphQLServiceConfig.getConfig', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deep-merges the ConfigLoader result with feature flags', async () => {
    jest
      .spyOn(ConfigLoader, 'loadConfig')
      .mockResolvedValue({ port: 9000, nested: { a: 1 } });
    jest
      .spyOn(GraphQLServiceFeatureFlags, 'getFlags')
      .mockResolvedValue({ featureFlags: { enableRBACFeature: true } });

    const result = await GraphQLServiceConfig.getConfig();

    expect(result).toEqual({
      port: 9000,
      nested: { a: 1 },
      featureFlags: { enableRBACFeature: true }
    });
  });

  it('propagates a ConfigLoader.loadConfig rejection instead of masking it', async () => {
    jest
      .spyOn(ConfigLoader, 'loadConfig')
      .mockRejectedValue(new Error('config load failed'));
    jest
      .spyOn(GraphQLServiceFeatureFlags, 'getFlags')
      .mockResolvedValue({ featureFlags: {} });

    await expect(GraphQLServiceConfig.getConfig()).rejects.toThrow(
      'config load failed'
    );
  });
});
