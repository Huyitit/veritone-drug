const SERVICE_CONFIG = {
  // Service environment
  applicationName: {
    format: 'String',
    default: 'core-graphql-server',
    remoteConfig: 'aiware-controller'
  },
  apiVersionPath: {
    format: 'String',
    default: '/v3',
    remoteConfig: 'aiware-controller'
  },
  // Route path segment for stateful (Redis-backed) virtual-asset URIs.
  virtualAssetEndpoint: {
    format: 'String',
    default: 'asset',
    remoteConfig: 'aiware-controller'
  },
  // Route path segment for STATELESS virtual-asset URIs (payload carried in the
  // JWT; no Redis, no access event). Minted by core-admin / core-search.
  // @sminkov — VE-24702
  virtualAssetStaticEndpoint: {
    format: 'String',
    default: 'asset-static',
    remoteConfig: 'aiware-controller'
  },
  subscriptionPath: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  nodeEnv: {
    doc: 'The service environment',
    format: 'String',
    default: 'prod',
    remoteConfig: 'aiware-controller'
  },
  nodeJsEnv: {
    doc: 'The express js environment var',
    format: ['production', 'development', 'test', 'local'],
    default: 'production',
    env: 'NODE_ENV'
  },
  port: {
    doc: 'The port the service listens for incoming tcp connections',
    format: 'port',
    default: 9000,
    env: 'SERVICE_PORT',
    arg: 'service-port',
    remoteConfig: 'aiware-controller'
  },
  edgeClusterID: {
    doc: 'The default cluster when core is ran in that cluster',
    format: 'String',
    default: '',
    env: 'AIWARE_CLUSTER_ID',
    remoteConfig: 'aiware-controller'
  },
  // VP-2581: Ayrshare social-posting API credentials. The primary source is the encrypted
  // sso.external_credential row (service_type='ayrshare'); these env-mapped values are the
  // local-dev / fallback path. In deploy they are injected from cluster secrets by aiware-charts
  // (AYRSHARE_API_KEY / AYRSHARE_PRIVATE_KEY) on clusters where .Values.ayrshare.enabled is true.
  ayrshare: {
    // Base URL for the Ayrshare REST API. Defaults to the real service; overridable via AYRSHARE_BASE_URL
    // so integration tests (citest) can point the adapter at a localhost mock without touching real Ayrshare.
    // The default preserves existing behavior exactly — nothing changes unless the env var is set.
    baseUrl: {
      doc: 'Ayrshare REST API base URL (override for local/integration testing).',
      format: '*',
      default: 'https://api.ayrshare.com',
      env: 'AYRSHARE_BASE_URL'
    },
    apiKey: {
      doc: 'Ayrshare primary API key (Bearer token)',
      format: '*',
      default: null,
      env: 'AYRSHARE_API_KEY',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    privateKey: {
      doc: 'Ayrshare account RSA private key (for generateJWT hosted connect URL)',
      format: '*',
      default: null,
      env: 'AYRSHARE_PRIVATE_KEY',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    // Non-secret account identifier passed to generateJWT alongside privateKey. Provisioned as a plain
    // (not secretKeyRef) per-cluster value by aiware-charts; must match the account that owns the keys.
    domain: {
      doc: 'Ayrshare account identifier (non-secret) for the generateJWT hosted connect URL',
      format: '*',
      default: null,
      env: 'AYRSHARE_DOMAIN',
      remoteConfig: 'aiware-controller'
    },
    // VE-26069. The generateJWT hosted connect URL is a signed token whose expiry the vendor does not return,
    // so the adapter computes one from this TTL and persists it on the destination. Declared here (rather than
    // left as an undeclared _.get default) so the vendor's 5-minute default can actually be overridden if
    // Ayrshare changes it, and so convict coerces the env value to Number rather than handing the adapter a
    // string that would make `Date.now() + ttl` concatenate. Deliberately env-only, unlike its apiKey/privateKey/
    // domain siblings: the adapter resolves this once at construction, so a hot-updated remoteConfig value would
    // not be picked up anyway. Changing it needs a redeploy.
    connectUrlTtlMs: {
      doc: 'Assumed TTL, in ms, of the Ayrshare hosted connect URL (vendor default is 5 minutes).',
      format: 'nat',
      default: 5 * 60 * 1000,
      env: 'AYRSHARE_CONNECT_URL_TTL_MS'
    }
  },
  allowedOriginHosts: {
    format: 'Array',
    default: [],
    remoteConfig: 'aiware-controller:service:subdomains'
  },
  // Cookie names
  auth: {
    jwtCookieName: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller',
      scope: 'cluster'
    },
    jwtRefreshCookieName: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller',
      scope: 'cluster'
    },
    userTokenCookieName: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller',
      scope: 'cluster'
    },
    useInsecureCookie: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    domain: {
      format: 'String',
      remoteConfig: 'aiware-controller:service:domain',
      default: '.veritone.com'
    }
  },
  tmpdir: {
    format: 'String',
    default: '/tmp',
    remoteConfig: 'aiware-controller'
  },
  metricsRange: {
    defaultRange: {
      format: 'int',
      default: 30,
      remoteConfig: 'aiware-controller'
    },
    maxRange: {
      format: 'int',
      default: 90,
      remoteConfig: 'aiware-controller'
    }
  },
  server: {
    rateLimit: {
      intervalRequestLimit: {
        format: 'nat',
        default: 1000,
        remoteConfig: 'aiware-controller'
      },
      tokenRequestLimit: {
        format: 'nat',
        default: 100,
        remoteConfig: 'aiware-controller'
      }
    },
    heartbeatEnabled: {
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller'
    },
    redisHeartbeatEnabled: {
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller'
    },
    maxRequestCost: {
      format: 'int',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    uploadSizeLimit: {
      format: 'int',
      default: 1073741824,
      remoteConfig: 'aiware-controller'
    },
    // Ceiling (bytes) for a single proxied (non-browser) virtual-asset
    // download. A proxied transfer pins a connection on this pod for its whole
    // duration, so an oversized monolithic download can outlive a deploy and
    // truncate; above this we return 413 and steer the caller to a ranged
    // fetch. Consumed by routes/virtualAsset.js. Default 2 GiB; overridable at
    // runtime via the edge-controller (remoteConfig). Jira: VE-20263
    maxProxyContentSize: {
      format: 'int',
      default: 2147483648,
      remoteConfig: 'aiware-controller'
    },
    disableGlobalRequestSizeLimit: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    structuredDataPostSizeLimit: {
      format: 'int',
      default: 5242880,
      remoteConfig: 'aiware-controller'
    },
    headers: {
      csp: {
        paths: {
          format: Array,
          default: ['/graphqldocs'],
          remoteConfig: 'aiware-controller'
        },
        value: {
          format: 'String',
          default:
            "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
          remoteConfig: 'aiware-controller'
        }
      }
    }
  },
  maxRequestCost: {
    format: 'nat',
    default: 1000,
    remoteConfig: 'aiware-controller'
  },
  cache: {
    stdTTLSec: {
      format: 'int',
      default: 30,
      remoteConfig: 'aiware-controller'
    },
    checkPeriodSec: {
      format: 'int',
      default: 30,
      remoteConfig: 'aiware-controller'
    }
  },
  'veritone-api': {
    baseUri: {
      format: '*',
      default: '',
      env: 'CORE_API_URI',
      remoteConfig: 'aiware-controller:service',
      serviceName: '_apigateway',
      serviceRoute: ''
    }
  },
  loginRoute: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: 'login-app',
    serviceRoute: '/login'
  },
  logoutRoute: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: 'aiware',
    serviceRoute: '/logout'
  },
  mediaDetailsRoute: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: 'cms-app',
    serviceRoute: '/#/media-details'
  },
  switchAppRoute: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: 'core-admin-server',
    serviceRoute: '/api/admin/switch-app'
  },
  seatLimitDomainIgnoreList: {
    format: 'Array',
    default: [
      'veritone.com',
      'setacinq.vn',
    ],
    remoteConfig: 'aiware-controller',
  },
  oktaAuth: {
    oktaCallbackUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'core-graphql-server',
      serviceRoute: '/auth/authorization-code-callback'
    }
  },
  requireComplexPassword: {
    format: Boolean,
    default: false,
    remoteConfig: 'aiware-controller'
  },
  aiware: {
    enabled: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    organizationApplicationId: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    clusterMemoryLimit: {
      format: 'int',
      default: 0,
      remoteConfig: 'aiware-controller'
    },
    defaultCluster: {
      name: {
        format: 'String',
        default: '',
        remoteConfig: 'aiware-controller'
      },
      memory: {
        format: 'int',
        default: 0,
        remoteConfig: 'aiware-controller'
      },
      disk: {
        format: 'int',
        default: 0,
        remoteConfig: 'aiware-controller'
      }
    }
  },
  log: {
    level: {
      format: [
        'debug',
        'trace',
        'info',
        'warn',
        'error',
        'DEBUG',
        'TRACE',
        'INFO',
        'WARN',
        'ERROR'
      ],
      default: 'warn',
      env: 'LOG_LEVEL',
      remoteConfig: 'aiware-controller'
    }
  },
  dnsZone: {
    external: {
      format: '*',
      default: '',
      env: 'EXTERNAL_DNS_ZONE',
      remoteConfig: 'aiware-controller'
    }
  },

  useMediaTableSourceHack: {
    format: Boolean,
    default: false,
    remoteConfig: 'aiware-controller'
  },

  ingestSlug: {
    mutationBatchLimit: {
      doc: 'Maximum number of files allowed per ingest mutation request',
      format: 'nat',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    validationTtlMin: {
      doc: 'Time-to-live in minutes for validation cache entries',
      format: 'nat',
      default: 5,
      remoteConfig: 'aiware-controller'
    }
  },

  defaultPmiClusterId: {
    format: 'String',
    default: '',
    remoteConfig: 'aiware-controller'
  },

  publicDnsZoneName: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  publicDnsZoneName2: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },

  wwwRoot: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: '_apigateway',
    serviceRoute: ''
  },

  apiRoot: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller:service',
    serviceName: '_apigateway',
    serviceRoute: '',
    env: 'VERITONE_BASE_URI'
  },

  storageEndpoint: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },

  source: {
    jwtExpiresIn: {
      format: 'String',
      default: '6h',
      remoteConfig: 'aiware-controller'
    }
  },

  jwt: {
    secret: {
      format: '*',
      secret: true,
      default: null,
      remoteConfig: 'aiware-controller',
      env: 'JWT_SECRET',
      scope: 'edge'
    },
    ttl: {
      format: String,
      default: '7d',
      remoteConfig: 'aiware-controller',
      env: 'JWT_TTL'
    },
    sdoTokenTtlSec: {
      format: 'nat',
      default: 43200,
      remoteConfig: 'aiware-controller'
    }
  },

  // Virtual-asset URIs are signed with this secret and resolved by
  // routes/virtualAsset.js. Must be identical across every service that mints
  // virtual URIs (core-graphql, core-admin, core-search). Falls back to
  // jwt.secret when null. @sminkov — VE-24702
  virtualAsset: {
    jwt: {
      secret: {
        doc: 'Shared secret for signing/verifying virtual-asset JWTs.',
        format: '*',
        secret: true,
        default: null,
        remoteConfig: 'aiware-controller',
        env: 'VIRTUAL_ASSET_JWT_SECRET'
      }
    }
  },

  queue: {
    nsqd: {
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller:resource'
    },
    nsqlookupdDiscovery: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller:resource'
    },
    nsqlookupds: {
      format: 'Array',
      default: [],
      remoteConfig: 'aiware-controller:resource'
    }
  },

  // Eventing
  messaging: {
    enable: {
      doc: 'Enable grapqhl to send events',
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller'
    },
    name: {
      format: String,
      default: 'nsq',
      remoteConfig: 'aiware-controller'
    },
    nsqdHost: {
      doc: 'The address of nsqd to publish messages to',
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller:resource'
    },
    nsqdPort: {
      doc: 'Nsqd tcp port',
      format: 'port',
      default: 4150,
      remoteConfig: 'aiware-controller:resource'
    },
    nsqlookupds: {
      doc: 'List of nsqlookupd to discover nsqds hosting event topics',
      format: 'Array',
      default: ['nsqlookupd.service.consul:4161'],
      remoteConfig: 'aiware-controller:resource'
    },
    maxInFlight: {
      format: 'int',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    nsqlookupdDiscovery: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller:resource'
    },
    tls: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller:resource'
    },
    tlsVerification: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller:resource'
    },
    idleTimeout: {
      format: 'int',
      default: 1800,
      remoteConfig: 'aiware-controller'
    },
    connectionTimeout: {
      format: 'int',
      default: 7200,
      remoteConfig: 'aiware-controller'
    }
  },

  //TODO: deprecate
  mandrillAPIKey: {
    format: String,
    default: '',
    remoteConfig: 'aiware-controller',
    sensitive: true
  },

  defaultEmailProvider: {
    connectionString: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller'
    },
    emailFrom: {
      format: String,
      default: 'support@veritone.com',
      env: 'EMAIL_FROM_DEFAULT',
      remoteConfig: 'aiware-controller'
    },
    emailFromNoReply: {
      format: String,
      default: 'do-not-reply@veritone.com',
      remoteConfig: 'aiware-controller'
    },
    notificationEmail: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller'
    }
  },

  decryptKeyDefault: {
    format: String,
    default: 'b7c3f2d49867e8f14ce04c3e5a9655d3196b870ad6ea34829b5e3e9abfa0c87c',
    remoteConfig: 'aiware-controller',
    sensitive: true
  },

  // VE-25263: shared symmetric secret for encrypting engine-bound scoped secrets (the Ayrshare Profile-Key)
  // in transit. The same value is provisioned to the distribute engine by aiware-charts; the engine decrypts
  // the destinationVendorProfile response with it. Distinct from decryptKeyDefault (which is at-rest only).
  // No default: the resolver fails closed and returns no secret when this is unset.
  engineTransitSecret: {
    doc: 'Shared secret for AES-256-GCM transit encryption of engine-bound scoped secrets.',
    format: '*',
    default: null,
    env: 'ENGINE_TRANSIT_SECRET',
    sensitive: true,
    remoteConfig: 'aiware-controller'
  },

  // Storage
  minio: {
    enabled: {
      doc: 'MinIO available and enabled',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller:resource'
    },
    enableUrlSigning: {
      doc: 'Sign MinIO backed uris',
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller:resource'
    },
    signedUrlExpires: {
      doc: 'Expiration of the signed MinIO Uri',
      format: 'int',
      default: 604800,
      remoteConfig: 'aiware-controller:resource'
    },
    accessKey: {
      doc: 'MinIO access key',
      format: '*',
      default: '',
      sensitive: true,
      remoteConfig: 'aiware-controller:resource'
    },
    secretKey: {
      doc: 'MinIO secret key',
      format: '*',
      default: '',
      sensitive: true,
      remoteConfig: 'aiware-controller:resource'
    },
    bucket: {
      doc: 'MinIO bucket name to use',
      format: String,
      default: 'aiware',
      remoteConfig: 'aiware-controller:resource'
    },
    path: {
      doc: 'Path within the MinIO bucket used to store assets',
      format: 'String',
      default: 'asset',
      remoteConfig: 'aiware-controller:resource'
    },
    endPoint: {
      doc: 'MinIO endpoint',
      format: '*',
      default: 'minio-1',
      remoteConfig: 'aiware-controller:resource'
    },
    port: {
      doc: 'MinIO port',
      format: 'port',
      default: 9101,
      remoteConfig: 'aiware-controller:resource'
    },
    secure: {
      doc: 'Secured MinIO',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller:resource'
    }
  },
  s3: {
    bucket: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    signedUrlExpires: {
      doc: 'Expiration of the signed MinIO Uri',
      format: 'int',
      default: 604800,
      remoteConfig: 'aiware-controller'
    },
    accessKey: {
      doc: 's3 access key',
      format: '*',
      default: null,
      env: 'AWS_S3_ACCESS_KEY',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    secretKey: {
      doc: 's3 secret key',
      format: '*',
      default: null,
      env: 'AWS_S3_SECRET_KEY',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    accessCredentialId: {
      doc: 'The external credential id for s3 type credentials.',
      format: '*',
      default: null,
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    cloudProvider: {
      doc: 'aws, oci, azure, or minio',
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller'
    },
    region: {
      format: 'String',
      default: 'us-east-1',
      remoteConfig: 'aiware-controller'
    },

    //TODO: the following is not compatible with the current settings
    buckets: {
      format: 'array-settings',
      default: [],
      remoteConfig: 'aiware-controller',
      children: {
        key: {
          format: String,
          default: null
        },
        name: {
          format: String,
          default: null
        },
        path: {
          format: '*',
          default: null
        },
        signedUrlExpires: {
          format: 'int',
          default: 10800
        },
        region: {
          format: '*',
          default: null
        },
        preventS3SignerReuse: {
          format: Boolean,
          default: false
        },
        fallback: {
          accessKey: {
            doc: 'Access key',
            format: '*',
            default: null,
            sensitive: true
          },
          secretKey: {
            doc: 'Secret key',
            format: '*',
            default: null,
            sensitive: true
          },
          accessCredentialId: {
            doc: 'The external credential id for s3 type credentials.',
            format: '*',
            default: null,
            sensitive: true
          },
          bucketName: {
            doc: 'Reference name to bucket defined in s3.buckets',
            format: '*',
            default: null
          },
          cloudProvider: {
            doc: 'aws, oci, azure, or minio',
            format: '*',
            default: null,
          },
          region: {
            doc: 'Cloud provider region',
            format: '*',
            default: null,
          }
        }
      }
    },
    useDbCredentialForAll: {
      doc: 'Enable db credential for all',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    buildTestReportBucket: {
      format: '*',
      default: 'vda-build-test-reports',
      remoteConfig: 'aiware-controller'
    },
    buildManifestBucket: {
      format: '*',
      default: 'vda-engine-config',
      remoteConfig: 'aiware-controller'
    }
  },
  azure_blob: {
    enabled: {
      doc: 'Azure blob storage available and enabled',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableUrlSigning: {
      doc: 'Enable signing of azure blob urls',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    endpointSuffix: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    account: {
      sensitive: true,
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    key: {
      sensitive: true,
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller',
      env: 'AZURE_BLOB_ACCESS_KEY'
    },
    container: {
      format: 'String',
      default: 'recording',
      remoteConfig: 'aiware-controller'
    },
    path: {
      format: 'String',
      default: 'assets',
      remoteConfig: 'aiware-controller'
    },
    maxRetry: {
      format: 'nat',
      default: 3,
      remoteConfig: 'aiware-controller'
    },
    signedUrlExpires: {
      format: 'int',
      default: 10800,
      remoteConfig: 'aiware-controller'
    },
    timeout: {
      format: 'int',
      default: 3000000,
      remoteConfig: 'aiware-controller'
    }
  },
  oci: {
    enabled: {
      doc: 'OCI available and enabled',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableUrlSigning: {
      doc: 'Sign OCI backed uris',
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller'
    },
    signedUrlExpires: {
      doc: 'Expiration of the signed OCI Uri',
      format: 'int',
      default: 604800,
      remoteConfig: 'aiware-controller'
    },
    accessKey: {
      doc: 'OCI access key',
      format: '*',
      default: '',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    secretKey: {
      doc: 'OCI secret key',
      format: '*',
      default: '',
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    accessCredentialId: {
      doc: 'External credential id for OCI. Overrides the top-level s3.accessCredentialId for OCI-provider buckets when no inline OCI keys are set.',
      format: '*',
      default: null,
      sensitive: true,
      remoteConfig: 'aiware-controller'
    },
    bucket: {
      doc: 'OCI bucket name to use',
      format: String,
      default: 'aiware',
      remoteConfig: 'aiware-controller'
    },
    path: {
      doc: 'Path within the OCI bucket used to store assets',
      format: 'String',
      default: 'asset',
      remoteConfig: 'aiware-controller'
    },
    endPoint: {
      doc: 'OCI endpoint',
      format: '*',
      default: 'oci-1',
      remoteConfig: 'aiware-controller'
    },
    port: {
      doc: 'OCI port',
      format: 'port',
      default: 9101,
      remoteConfig: 'aiware-controller'
    },
    secure: {
      doc: 'Secured OCI',
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    namespace: {
      doc: 'OCI namespace',
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    region: {
      doc: 'OCI region',
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    }
  },

  signedUrlOverrideEngines: {
    format: Array,
    default: [],
    remoteConfig: 'aiware-controller'
  },

  flyway: {
    migrate: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    validateOnMigrate: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    path: {
      format: 'String',
      default: '/usr/local/bin/flyway',
      remoteConfig: 'aiware-controller'
    },
    rootOrgId: {
      format: 'int',
      default: 1,
      remoteConfig: 'aiware-controller'
    },
    failOnError: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    migrateAndQuit: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    db: {
      sso: {
        ignoreMigrationPatterns: {
          format: 'String',
          default: '*:missing, *:ignored',
          remoteConfig: 'aiware-controller'
        },
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      audience: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      cms: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      platform: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      media_platform: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      subscription: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      },
      structured_data: {
        validateOnMigrate: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        }
      }
    }
  },
  queryMonitor: {
    enableKill: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    queryDurationSecondsKill: {
      format: 'nat',
      default: 30,
      remoteConfig: 'aiware-controller'
    },
    queryDurationSecondsTerminate: {
      format: 'nat',
      default: 60,
      remoteConfig: 'aiware-controller'
    },
    analyzeEnabled: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    analyzeStalenessDays: {
      format: 'nat',
      default: 15,
      remoteConfig: 'aiware-controller'
    },
    analyzeMaxTables: {
      format: 'nat',
      default: 10,
      remoteConfig: 'aiware-controller'
    },
    // Both sweeps share one NSQ message budget (messaging.msgTimeout is 60s), so
    // stop starting new tables past this point rather than risk a requeue
    // mid-run that would repeat the kill sweep too.
    analyzeMaxRunMs: {
      format: 'nat',
      default: 40000,
      remoteConfig: 'aiware-controller'
    }
  },

  // Service dependencies
  services: {
    coreAdminUri: {
      type: '*',
      default: '',
      remoteConfig: 'aiware-controller:service',
      serviceName: 'core-admin-server',
      serviceRoute: '/api/admin/'
    },
    elasticLogClusterUri: {
      // FIXME: move this to resources, or rewrite the whole
      // audit event hack
      type: '*',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    'core-search-server': {
      uri: {
        type: '*',
        default: '',
        remoteConfig: 'aiware-controller:service',
        serviceName: 'core-search-server',
        serviceRoute: '/api/'
      },
      token: {
        type: '*',
        default: '',
        remoteConfig: 'aiware-controller',
        sensitive: true
      }
    },
    'media-streamer': {
      uri: {
        type: '*',
        default: '',
        remoteConfig: 'aiware-controller:service',
        serviceName: 'media-streamer',
        serviceRoute: '/media-streamer/'
      }
    },
    loginPageUri: {
      type: '*',
      default: '',
      remoteConfig: 'aiware-controller:service',
      serviceName: 'admin-app',
      serviceRoute: '/login/#/'
    },
    workflowBaseUri: {
      type: '*',
      default: '', //workflow.@@INTERNAL_DNS_ZONE@@
      remoteConfig: 'aiware-controller:service',
      serviceName: 'workflow-app',
      serviceRoute: '/'
    },
    workflowManagementApiUri: {
      type: '*',
      default: '', //api-workflow.@@INTERNAL_DNS_ZONE@@
      remoteConfig: 'aiware-controller:service',
      serviceName: 'workflow-api',
      serviceRoute: '/'
    }
  },

  featureFlags: {
    maxTDOAssetLimitWarnOnly: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    getTDOMetadataFromMediaPlatform: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableNativeMPEGDash: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    signedWritableUrlOverride: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableAppEventFeature: {
      format: 'Boolean',
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableBatchActionsAPI: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    networkIsolated: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enableDefaultDesktopApp: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    enableStrictRoleValidation: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    }
  },
  enableRequestEntryLog: {
    format: 'Boolean',
    default: false,
    remoteConfig: 'aiware-controller'
  },
  pageUris: {
    loginUri: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    resetPasswordUri: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    collectionsShareLinkUrl: {
      type: '*',
      default: '',
      remoteConfig: 'aiware-controller:service',
      serviceName: 'collections-app',
      serviceRoute: '/share/'
    },
    discoveryShareLinkUrl: {
      type: '*',
      default: '',
      remoteConfig: 'aiware-controller:service',
      serviceName: 'discovery-app',
      serviceRoute: '/media-detail/#/sharedMention/enterprise/'
    }
  },

  appUris: {
    desktopAppUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'desktop-app',
      serviceRoute: ''
    },
    adminAppUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'admin-app',
      serviceRoute: ''
    },
    automateAppUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'automate-app',
      serviceRoute: ''
    },
    cmsAppUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'cms',
      serviceRoute: ''
    }
  },

  automateServices: {
    automateControllerUrl: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller:service',
      serviceName: 'automate-controller'
    },
    controllerNodeRedImage: {
      format: 'String',
      default: 'registry.central.aiware.com/node-red-runner-v3:stable',
      remoteConfig: 'aiware-controller'
    },
    controllerNodeRedImageStudio: {
      format: 'String',
      default: 'registry.central.aiware.com/node-red-v3:stable',
      remoteConfig: 'aiware-controller'
    }
  },

  // Data sources
  //- Redis
  coreAdminRedis: {
    host: {
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller:resource'
    },
    port: {
      format: 'port',
      default: 6379,
      remoteConfig: 'aiware-controller:resource'
    },
    password: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller:resource',
      sensitive: true
    },
    user: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller:resource',
      sensitive: true
    }
  },
  redis: {
    host: {
      format: '*',
      default: '',
      remoteConfig: 'aiware-controller:resource'
    },
    port: {
      format: 'port',
      default: 6379,
      remoteConfig: 'aiware-controller:resource'
    },
    password: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller:resource',
      sensitive: true
    },
    user: {
      format: String,
      default: '',
      remoteConfig: 'aiware-controller:resource',
      sensitive: true
    },
    features: {
      checkDeletion: {
        enabled: {
          format: Boolean,
          default: true,
          remoteConfig: 'aiware-controller'
        },
        resourceTypes: {
          format: Array,
          default: ['TemporalDataObject', 'TemporalDataObject.details'],
          remoteConfig: 'aiware-controller'
        },
        ttlMin: {
          format: 'Number',
          default: 1,
          remoteConfig: 'aiware-controller'
        }
      },
      temporalDataObject: {
        nonSegmentAssetCount: {
          ttlMin: {
            format: 'int',
            default: 360,
            remoteConfig: 'aiware-controller'
          }
        }
      },
    }
  },
  //- Elastic
  elastic: {
    connection: {
      host: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      username: {
        format: String,
        default: '',
        remoteConfig: 'aiware-controller:resource',
        sensitive: true
      },
      password: {
        format: String,
        default: '',
        remoteConfig: 'aiware-controller:resource',
        sensitive: true
      },
      apiVersion: {
        format: String,
        default: '6.0',
        remoteConfig: 'aiware-controller:resource'
      },
      requestTimeout: {
        format: 'int',
        default: 30000,
        remoteConfig: 'aiware-controller:resource'
      },
      maxRetries: {
        format: 'int',
        default: 0,
        remoteConfig: 'aiware-controller:resource'
      },
      maxSockets: {
        format: 'int',
        default: 25,
        remoteConfig: 'aiware-controller:resource'
      },
      maxFreeSockets: {
        format: 'int',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      headers: {
        accept: {
          format: String,
          default: 'application/vnd.elasticsearch+json;compatible-with=7',
          remoteConfig: 'aiware-controller:resource'
        },
        contentType: {
          format: String,
          default: 'application/vnd.elasticsearch+json;compatible-with=7',
          remoteConfig: 'aiware-controller:resource'
        }
      }
    }
  },

  taskTypeCacheRefreshIntervalMs: {
    format: 'int',
    default: 120000,
    remoteConfig: 'aiware-controller'
  },

  //- Postgres
  db: {
    queryTimeoutMillis: {
      format: 'nat',
      default: 45000,
      remoteConfig: 'aiware-controller:resource'
    },
    audience: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    cms: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    core: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    core_gqm: {
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 2,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    media_platform: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    media_platform_gqm: {
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 2,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    sso: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    subscription: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 10,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    third_party: {
      read: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      pool: {
        max: {
          format: 'nat',
          default: 10,
          remoteConfig: 'aiware-controller:resource'
        }
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    third_party_gqm: {
      write: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller:resource'
      },
      max: {
        format: 'nat',
        default: 2,
        remoteConfig: 'aiware-controller:resource'
      },
      queryTimeoutMillis: {
        format: 'nat',
        default: 45000,
        remoteConfig: 'aiware-controller:resource'
      }
    },
    constants: {
      customerSuccessOrgId: {
        format: 'nat',
        default: 1,
        remoteConfig: 'aiware-controller:resource'
      }
    }
  },

  notifyOnUploadFailures: {
    format: Boolean,
    default: false,
    remoteConfig: 'aiware-controller'
  },

  // Database partitioning settings
  taskTablePartitionActiveDate: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  jobTablePartitionActiveDate: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  sharedUrlPartitionActiveDate: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  recordingAssetTablePartitionActiveDate: {
    format: '*',
    default: null,
    remoteConfig: 'aiware-controller'
  },
  defaultRealTimeCluster: {
    format: 'String',
    default: undefined,
    remoteConfig: 'aiware-controller'
  },
  recordingWeekConfig: {
    weeklyIdsDateActive: {
      format: '*',
      default: null,
      remoteConfig: 'aiware-controller'
    },
    weekOffset: {
      format: 'int',
      default: 0,
      remoteConfig: 'aiware-controller'
    }
  },
  // DEPRECATED/OBSOLETE config settings
  // Media formats
  mediaFormats: {
    format: Array,
    default: [],
    remoteConfig: 'aiware-controller'
  },

  // iron-io
  engineRuntime: {
    iron: {
      token: {
        format: '*',
        default: '',
        secret: true,
        remoteConfig: 'aiware-controller'
      },
      projectId: {
        format: '*',
        default: '',
        remoteConfig: 'aiware-controller'
      },
      defaultRuntime: {
        cluster: {
          format: '*',
          default: '',
          remoteConfig: 'aiware-controller'
        }
      }
    }
  },

  // rateLimit
  rateLimit: {
    tokenType: {
      default: {
        format: 'int',
        default: 5000,
        remoteConfig: 'aiware-controller'
      }
    }
  },

  sentryIo: {
    dsn: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    httpTrace: {
      format: 'Boolean',
      default: true,
      remoteConfig: 'aiware-controller'
    },
    sampleRate: {
      format: 'Number',
      default: 1.0,
      remoteConfig: 'aiware-controller'
    }
  },

  // OpenId Connects
  openid: {
    keyCredential: {
      format: '*',
      default:
        '3i8nli:0a38799ef36e4175b54f926bf1a40c20b-4251-45f3-bd55-a78f071d00d6',
      secret: true,
      remoteConfig: 'aiware-controller',
      env: 'OPENID_KEY_CREDENTIAL'
    },
    allowedRedirectTargets: {
      format: Array,
      default: ['*.aiware.run', '*.veritone.com'],
      remoteConfig: 'aiware-controller'
    },
    redisOpenidAllowedRedirectTargetsTtl: {
      format: 'Number',
      default: 86400,
      remoteConfig: 'aiware-controller'
    },
    redisOpenidExternalCredentialTtl: {
      format: 'Number',
      default: 86400,
      remoteConfig: 'aiware-controller'
    }
  },

  adminApiVersionPath: {
    format: 'String',
    default: '/api',
    remoteConfig: 'aiware-controller'
  },
  organizationInvite: {
    expirationDate: {
      format: 'Number',
      default: 7,
      remoteConfig: 'aiware-controller'
    },
    // JWT TTL for admin approval links on request-to-join invites (hours). Default 168 = 7 days.
    adminActionTokenExpirationHours: {
      format: 'Number',
      default: 168,
      remoteConfig: 'aiware-controller'
    },
    // JWT TTL for invitee email-verification links on auto-approved request-to-join (hours).
    emailVerificationTokenExpirationHours: {
      format: 'Number',
      default: 24,
      remoteConfig: 'aiware-controller'
    },
    // Handlebars template name for email to the invitee on a normal invitation (welcome / accept).
    // Used when notifying the invitee directly: admin-approved invites, resends, admin approve of a
    // pending request. Merge KVP: invitation link, org name, optional message, support URL,
    // expiration text, policy links (organization invite BLL _sendEmail).
    orgInviteEmailTemplate: {
      format: 'String',
      default: 'new-organization-invitations',
      remoteConfig: 'aiware-controller'
    },
    // Handlebars template for email to each org admin when a non-admin submitted an invite that is
    // still pending review (`submitted`). Merge KVP: link to review requests, count of submitted invites.
    orgInviteRequestEmailTemplate: {
      format: 'String',
      default: 'new-organization-invite-requests',
      remoteConfig: 'aiware-controller'
    },
    // Handlebars template emailed to org admins when request-to-join needs admin approval (invite
    // still `submitted`). Merge KVP includes admin_action_token, desktop_url_approve, desktop_url_deny,
    // policy URLs, etc.
    selfServiceAdminActionEmailTemplate: {
      format: 'String',
      default: 'self-service-org-invite-admin-action',
      remoteConfig: 'aiware-controller'
    },
    // Path on the public DNS zone root (https://{dnsZone}/) for approve/deny links. Resolved with
    // `new URL(route, https://{dnsZone}/)`. Query params action=approve|deny and token=<jwt> are appended.
    selfServiceAdminActionDesktopRoute: {
      format: 'String',
      default: 'ui/auth/signup/review',
      remoteConfig: 'aiware-controller'
    },
    // Handlebars template for the requester when request-to-join is pending org approval (`submitted`).
    // Merge KVP is org- and invitee-centric (no admin token).
    selfServiceInviteeUnderReviewEmailTemplate: {
      format: 'String',
      default: 'self-service-org-invite-under-review',
      remoteConfig: 'aiware-controller'
    },
    // Handlebars template for the requester when request-to-join auto-approves (`approved`). Merge KVP:
    // email_verification_token, verify_url, org name, policy URLs, etc.
    selfServiceEmailVerificationEmailTemplate: {
      format: 'String',
      default: 'self-service-org-invite-email-verification',
      remoteConfig: 'aiware-controller'
    },
    // Path on the public DNS zone root (https://{dnsZone}/) for email verification deep link.
    // Resolved with `new URL(route, origin)`; query param token=<jwt> is appended.
    selfServiceEmailVerificationDesktopRoute: {
      format: 'String',
      default: 'ui/auth/signup/verify',
      remoteConfig: 'aiware-controller'
    },
    urlToSupport: {
      format: 'String',
      default: 'support@veritone.com',
      remoteConfig: 'aiware-controller'
    },
    urlPrivacyPolicy: {
      format: 'String',
      default: 'https://www.veritone.com/privacy/',
      remoteConfig: 'aiware-controller'
    },
    urlTermService: {
      format: 'String',
      default: 'https://www.veritone.com/terms/',
      remoteConfig: 'aiware-controller'
    },
    urlToLearnMore: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    },
    linkToOrgInviteResetPassword: {
      format: 'String',
      default: '',
      remoteConfig: 'aiware-controller'
    }
  },
  rbac: {
    defaultPolicies: {
      authGroups: {
        format: 'array-settings',
        children: {
          name: {
            format: String,
            default: null
          },
          description: {
            format: String,
            default: null
          },
          suffix: {
            format: String,
            default: ''
          },
          defaultGroup: {
            format: String,
            default: ''
          }
        },
        remoteConfig: 'aiware-controller',
        default: [
          {
            name: 'orgAdmin',
            suffix: 'Administrators',
            description:
              'This group is created by default for all Administrators of this Organization and can not be removed.',
            defaultGroup: 'orgAdmin'
          },
          {
            name: 'orgAllAccess',
            suffix: 'Users',
            description:
              'This Group is created by default and represents all users of this Organization.',
            defaultGroup: 'orgAllAccess'
          }
        ]
      },
      permissionSets: {
        format: 'array-settings',
        children: {
          name: {
            format: String,
            default: null
          },
          description: {
            format: String,
            default: null
          },
          permissions: {
            format: Array,
            default: []
          }
        },
        remoteConfig: 'aiware-controller',
        default: [
          {
            name: 'aiWARE Administrator',
            description:
              'This Permission Set allows people to search, view, edit, delete and change permission to any object. It also allows Administrative control to users, organizations, apps and engines.',
            permissions: ['ADMIN_ACCESS', 'ADMIN_CREATE_APPLICATION_JWT', 'ADMIN_GROUP_CREATE', 'ADMIN_GROUP_DELETE', 'ADMIN_GROUP_READ', 'ADMIN_GROUP_UPDATE', 'ADMIN_ORG_CREATE', 'ADMIN_ORG_READ', 'ADMIN_ORG_UPDATE', 'ADMIN_PROFILE_READ', 'ADMIN_PROFILE_UPDATE', 'ADMIN_ROLES_CREATE', 'ADMIN_ROLES_DELETE', 'ADMIN_ROLES_READ', 'ADMIN_ROLES_UPDATE', 'ADMIN_USER_CREATE', 'ADMIN_USER_DELETE', 'ADMIN_USER_READ', 'ADMIN_USER_UPDATE', 'ADMIN_UI_LEGACY_ACCESS', 'AIWARE_ADMIN_ADMIN', 'AIWARE_ADMIN_CREATE_APPLICATION_JWT', 'AIWARE_FLOW_CREATE', 'AIWARE_FLOW_DELETE', 'AIWARE_FLOW_READ', 'AIWARE_FLOW_UPDATE', 'AIWARE_FOLDER_CREATE', 'AIWARE_FOLDER_DELETE', 'AIWARE_FOLDER_READ', 'AIWARE_FOLDER_UPDATE', 'AIWARE_FOLDER_FILE', 'AIWARE_GROUP_CREATE', 'AIWARE_GROUP_DELETE', 'AIWARE_JOB_CREATE', 'AIWARE_JOB_DELETE', 'AIWARE_JOB_READ', 'AIWARE_JOB_UPDATE', 'AIWARE_SCHEDULED_JOB_CREATE', 'AIWARE_SCHEDULED_JOB_DELETE', 'AIWARE_SCHEDULED_JOB_READ', 'AIWARE_SCHEDULED_JOB_UPDATE', 'AIWARE_SCHEMA_CREATE', 'AIWARE_SCHEMA_DELETE', 'AIWARE_SCHEMA_READ', 'AIWARE_SCHEMA_SEARCH', 'AIWARE_SCHEMA_UPDATE', 'AIWARE_SDO_CREATE', 'AIWARE_SDO_DELETE', 'AIWARE_SDO_READ', 'AIWARE_SDO_UPDATE', 'AIWARE_SOURCES_CREATE', 'AIWARE_SOURCES_DELETE', 'AIWARE_SOURCES_READ', 'AIWARE_SOURCES_UPDATE', 'AIWARE_TASK_CREATE', 'AIWARE_TASK_DELETE', 'AIWARE_TASK_READ', 'AIWARE_TASK_UPDATE', 'AIWARE_TDO_CREATE', 'AIWARE_TDO_DELETE', 'AIWARE_TDO_READ', 'AIWARE_TDO_SEARCH', 'AIWARE_TDO_UPDATE', 'AIWARE_USER_CREATE', 'AIWARE_USER_DELETE', 'AIWARE_AUDIT_LOG_READ', 'AIWARE_PERMISSIONS_SET', 'AIWARE_PACKAGE_CREATE', 'AIWARE_PACKAGE_UPDATE', 'AIWARE_PACKAGE_DELETE', 'AIWARE_PACKAGE_READ', 'AIWARE_PERMISSIONS_GET', 'AIWARE_SLUG_CREATE', 'AIWARE_SLUG_READ', 'AIWARE_SLUG_UPDATE', 'AIWARE_SLUG_DELETE']
          },
          {
            name: 'aiWARE - Create',
            description:
              'This Permission Set allows people to create aiWARE objects at the System level.',

            permissions: ['AIWARE_JOB_CREATE','AIWARE_TASK_CREATE','AIWARE_FOLDER_CREATE','AIWARE_TDO_CREATE','AIWARE_FLOW_CREATE','AIWARE_SDO_CREATE','AIWARE_SOURCE_CREATE','AIWARE_SCHEDULED_JOB_CREATE', 'AIWARE_FOLDER_FILE', 'AIWARE_SCHEMA_CREATE', 'AIWARE_SOURCES_CREATE']
          },
          {
            name: 'aiWARE Full Access',
            description:
              'This Permission Set allows people to search, view, edit, delete and change permissions to any object.',
            permissions: ['AIWARE_FLOW_DELETE', 'AIWARE_FLOW_READ', 'AIWARE_FLOW_UPDATE', 'AIWARE_FOLDER_DELETE', 'AIWARE_FOLDER_READ', 'AIWARE_FOLDER_UPDATE', 'AIWARE_JOB_DELETE', 'AIWARE_JOB_READ', 'AIWARE_JOB_UPDATE', 'AIWARE_SCHEDULED_JOB_DELETE', 'AIWARE_SCHEDULED_JOB_READ', 'AIWARE_SCHEDULED_JOB_UPDATE', 'AIWARE_SCHEMA_DELETE', 'AIWARE_SCHEMA_READ', 'AIWARE_SCHEMA_SEARCH', 'AIWARE_SCHEMA_UPDATE', 'AIWARE_SDO_DELETE', 'AIWARE_SDO_READ', 'AIWARE_SDO_UPDATE', 'AIWARE_SOURCES_DELETE', 'AIWARE_SOURCES_READ', 'AIWARE_SOURCES_UPDATE', 'AIWARE_TASK_DELETE', 'AIWARE_TASK_READ', 'AIWARE_TASK_UPDATE', 'AIWARE_TDO_DELETE', 'AIWARE_TDO_READ', 'AIWARE_TDO_SEARCH', 'AIWARE_TDO_UPDATE', 'AIWARE_FOLDER_FILE', 'AIWARE_PERMISSIONS_SET', 'AIWARE_PERMISSIONS_GET', 'AIWARE_SLUG_CREATE', 'AIWARE_SLUG_READ', 'AIWARE_SLUG_UPDATE', 'AIWARE_SLUG_DELETE']
          },
          {
            name: 'aiWARE Read Only',
            description:
              'This Permission Set only allows people to search and view, but can’t edit, delete or change permissions',
            permissions: ['AIWARE_FLOW_READ','AIWARE_FOLDER_READ','AIWARE_JOB_READ','AIWARE_SCHEMA_READ','AIWARE_SCHEMA_SEARCH','AIWARE_SDO_READ','AIWARE_SOURCES_READ','AIWARE_TASK_READ','AIWARE_TDO_READ','AIWARE_TDO_SEARCH', 'AIWARE_PERMISSIONS_GET']
          }
        ]
      },
      policies: {
        format: 'array-settings',
        children: {
          authGroupName: {
            format: String,
            default: null
          },
          permissionSetName: {
            format: String,
            default: null
          },
          scope: {
            format: String,
            default: null
          }
        },
        remoteConfig: 'aiware-controller',
        default: [
          {
            authGroupName: 'orgAdmin',
            permissionSetName: 'aiWARE Administrator',
            scope: 'Organization'
          },
          {
            authGroupName: 'orgAdmin',
            permissionSetName: 'aiWARE Full Access',
            scope: 'Resource'
          },
          {
            authGroupName: 'orgAdmin',
            permissionSetName: 'aiWARE Full Access',
            scope: 'RootFolder'
          },
          {
            authGroupName: 'orgAllAccess',
            permissionSetName: 'aiWARE - Create',
            scope: 'Organization'
          },
          {
            authGroupName: 'orgAllAccess',
            permissionSetName: 'aiWARE Read Only',
            scope: 'RootFolder'
          },
          {
            authGroupName: 'orgAllAccess',
            permissionSetName: 'aiWARE Read Only',
            scope: 'SDO'
          }
        ]
      }
    },
    permissions: {
      whitelist: {
        remoteConfig: 'aiware-controller',
        format: Array,
        default: [
          'NO_ACCESS',
          'ADMIN_ACCESS',
          'ADMIN_GROUP_CREATE',
          'ADMIN_GROUP_DELETE',
          'ADMIN_GROUP_READ',
          'ADMIN_GROUP_UPDATE',
          'ADMIN_ORG_READ',
          'ADMIN_PROFILE_READ',
          'ADMIN_PROFILE_UPDATE',
          'ADMIN_ROLES_READ',
          'ADMIN_USER_CREATE',
          'ADMIN_USER_DELETE',
          'ADMIN_USER_READ',
          'ADMIN_USER_UPDATE',
          'ADMIN_UI_LEGACY_ACCESS',
          'ADVERTISER_ACCESS',
          'AIWARE_ADMIN_ADMIN',
          'AIWARE_ADMIN_SUPERADMIN',
          'AIWARE_DESTINATION_CREATE',
          'AIWARE_DESTINATION_DELETE',
          'AIWARE_DESTINATION_READ',
          'AIWARE_DESTINATION_UPDATE',
          'AIWARE_FLOW_CREATE',
          'AIWARE_FLOW_DELETE',
          'AIWARE_FLOW_READ',
          'AIWARE_FLOW_UPDATE',
          'AIWARE_FOLDER_CREATE',
          'AIWARE_FOLDER_DELETE',
          'AIWARE_FOLDER_FILE',
          'AIWARE_FOLDER_READ',
          'AIWARE_FOLDER_UPDATE',
          'AIWARE_GROUP_CREATE',
          'AIWARE_GROUP_DELETE',
          'AIWARE_JOB_CREATE',
          'AIWARE_JOB_DELETE',
          'AIWARE_JOB_READ',
          'AIWARE_JOB_UPDATE',
          'AIWARE_SCHEDULED_JOB_CREATE',
          'AIWARE_SCHEDULED_JOB_DELETE',
          'AIWARE_SCHEDULED_JOB_READ',
          'AIWARE_SCHEDULED_JOB_UPDATE',
          'AIWARE_SCHEMA_CREATE',
          'AIWARE_SCHEMA_DELETE',
          'AIWARE_SCHEMA_READ',
          'AIWARE_SCHEMA_SEARCH',
          'AIWARE_SCHEMA_UPDATE',
          'AIWARE_SDO_CREATE',
          'AIWARE_SDO_DELETE',
          'AIWARE_SDO_READ',
          'AIWARE_SDO_UPDATE',
          'AIWARE_SOURCES_CREATE',
          'AIWARE_SOURCES_DELETE',
          'AIWARE_SOURCES_READ',
          'AIWARE_SOURCES_UPDATE',
          'AIWARE_TASK_CREATE',
          'AIWARE_TASK_DELETE',
          'AIWARE_TASK_READ',
          'AIWARE_TASK_UPDATE',
          'AIWARE_TDO_CREATE',
          'AIWARE_TDO_DELETE',
          'AIWARE_TDO_READ',
          'AIWARE_TDO_SEARCH',
          'AIWARE_TDO_UPDATE',
          'AIWARE_SLUG_CREATE',
          'AIWARE_SLUG_DELETE',
          'AIWARE_SLUG_READ',
          'AIWARE_SLUG_UPDATE',
          'AIWARE_USER_CREATE',
          'AIWARE_USER_DELETE',
          'AIWARE_USER_UPDATE',
          'AIWARE_USER_READ',
          'ANALYTICS_ACCESS',
          'ANALYTICS_DASHBOARD_UPDATE',
          'ANALYTICS_DASHBOARD_VIEW',
          'ASSET_ALL',
          'ASSET_URI',
          'BROADCASTER_ACCESS',
          'CMS_ACCESS',
          'CMS_ANALYTICS_READ',
          'CMS_CONTENTTEMPLATE_CREATE',
          'CMS_CONTENTTEMPLATE_DELETE',
          'CMS_CONTENTTEMPLATE_READ',
          'CMS_CONTENTTEMPLATE_UPDATE',
          'CMS_JOB_CREATE',
          'CMS_JOB_DELETE',
          'CMS_JOB_READ',
          'CMS_JOB_UPDATE',
          'CMS_MEDIA_CREATE',
          'CMS_MEDIA_DELETE',
          'CMS_MEDIA_DOWNLOAD',
          'CMS_MEDIA_READ',
          'CMS_MEDIA_SHARE',
          'CMS_MEDIA_UPDATE',
          'CMS_RECORDING_CREATE',
          'CMS_RECORDING_DELETE',
          'CMS_RECORDING_READ',
          'CMS_RECORDING_UPDATE',
          'CMS_REPORT_CREATE',
          'CMS_SOURCES_DELETE',
          'CMS_SOURCES_READ',
          'CMS_SOURCES_UPDATE',
          'CMS_TASK_CREATE',
          'CMS_TASK_DELETE',
          'CMS_TASK_READ',
          'CMS_TASK_UPDATE',
          'CMS_WORKFLOWS_CREATE',
          'CMS_WORKFLOWS_DELETE',
          'CMS_WORKFLOWS_READ',
          'CMS_WORKFLOWS_UPDATE',
          'COLLECTIONS_ACCESS',
          'COLLECTIONS_COLLECTIONS_CREATE',
          'COLLECTIONS_COLLECTIONS_DELETE',
          'COLLECTIONS_COLLECTIONS_READ',
          'COLLECTIONS_COLLECTIONS_SHARE',
          'COLLECTIONS_COLLECTIONS_UPDATE',
          'COLLECTIONS_MENTIONS_CREATE',
          'COLLECTIONS_MENTIONS_DELETE',
          'COLLECTIONS_MENTIONS_DOWNLOAD',
          'COLLECTIONS_MENTIONS_READ',
          'COLLECTIONS_MENTIONS_SHARE',
          'COLLECTIONS_MENTIONS_UPDATE',
          'COLLECTIONS_USERS_READ',
          'DEVELOPER_ACCESS',
          'DEVELOPER_BUILD_APPROVE',
          'DEVELOPER_BUILD_CREATE',
          'DEVELOPER_BUILD_DELETE',
          'DEVELOPER_BUILD_DEPLOY',
          'DEVELOPER_BUILD_DISAPPROVE',
          'DEVELOPER_BUILD_INVALIDATE',
          'DEVELOPER_BUILD_PAUSE',
          'DEVELOPER_BUILD_READ',
          'DEVELOPER_BUILD_SUBMIT',
          'DEVELOPER_BUILD_UNPAUSE',
          'DEVELOPER_BUILD_UPDATE',
          'DEVELOPER_BUILD_UPLOAD',
          'DEVELOPER_DOCKER_ADMIN',
          'DEVELOPER_DOCKER_ORG_PUSH',
          'DEVELOPER_DOCKER_ORG_PULL',
          'DEVELOPER_DOCKER_ORG_USER_PUSH',
          'DEVELOPER_DOCKER_ORG_USER_PULL',
          'DEVELOPER_ENGINE_CREATE',
          'DEVELOPER_ENGINE_DELETE',
          'DEVELOPER_ENGINE_DISABLE',
          'DEVELOPER_ENGINE_ENABLE',
          'DEVELOPER_ENGINE_READ',
          'DEVELOPER_ENGINE_UPDATE',
          'DEVELOPER_TASK_CREATE',
          'DEVELOPER_TASK_READ',
          'DEVELOPER_TASK_UPDATE',
          'DISCOVERY_ACCESS',
          'DISCOVERY_ANALYTICS_DOWNLOAD',
          'DISCOVERY_ANALYTICS_READ',
          'DISCOVERY_ANALYTICS_SHARE',
          'DISCOVERY_FOLDER_CREATE',
          'DISCOVERY_FOLDER_DELETE',
          'DISCOVERY_FOLDER_READ',
          'DISCOVERY_FOLDER_SHARE',
          'DISCOVERY_FOLDER_UPDATE',
          'DISCOVERY_MENTIONS_CREATE',
          'DISCOVERY_MENTIONS_DELETE',
          'DISCOVERY_MENTIONS_DOWNLOAD',
          'DISCOVERY_MENTIONS_READ',
          'DISCOVERY_MENTIONS_SHARE',
          'DISCOVERY_MENTIONS_UPDATE',
          'DISCOVERY_RESULTS_DOWNLOAD',
          'DISCOVERY_RESULTS_READ',
          'DISCOVERY_RESULTS_SHARE',
          'JOB_CREATE',
          'JOB_DELETE',
          'JOB_READ',
          'JOB_UPDATE',
          'MENTIONS_CREATE',
          'MENTIONS_DELETE',
          'MENTIONS_DOWNLOAD',
          'MENTIONS_READ',
          'MENTIONS_SHARE',
          'MENTIONS_UPDATE',
          'POLITICS_ACCESS',
          'RECORDING_CREATE',
          'RECORDING_DELETE',
          'RECORDING_READ',
          'RECORDING_UPDATE',
          'SOURCE_UPDATE',
          'TASK_CREATE',
          'TASK_DELETE',
          'TASK_READ',
          'TASK_UPDATE',
          'AIWARE_PACKAGE_CREATE',
          'AIWARE_PACKAGE_READ',
          'AIWARE_PACKAGE_UPDATE',
          'AIWARE_PACKAGE_DELETE',
          'AIWARE_PROCESSING_CENTER_ACCESS',
          'AIWARE_RESOURCE_CENTER_ACCESS',
          'AIWARE_AUDIT_LOG_READ',
          'WORKFLOW_CREATE'
        ]
      },
      blacklist: {
        remoteConfig: 'aiware-controller',
        format: Array,
        default: [
          'ADMIN_CREATE_APPLICATION_JWT',
          'AIWARE_ADMIN_CREATE_APPLICATION_JWT',
          'ADMIN_ORG_CREATE',
          'ADMIN_ORG_UPDATE',
          'ADMIN_ROLES_CREATE',
          'ADMIN_ROLES_DELETE',
          'ADMIN_ROLES_UPDATE',
          'CMS_CUSTOMERSERVICE',
          'SUPERADMIN',
          'VERITONE_FINANCEADMIN',
          'VERITONE_SUPERADMIN',
          'AIWARE_ADMIN_INSTANCE_ADMIN'
        ]
      }
    }
  },
  folder: {
    maxFolderForGettingOverview: {
      format: 'int',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    maxFolderForGettingSummaryDetail: {
      format: 'int',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    maxDepth: {
      doc: 'Maximum V1 folder nesting depth enforced when creating or moving folders. WARNING: Decreasing this number may impact ability to move deeply nested folders.',
      format: 'int',
      default: 5,
      remoteConfig: 'aiware-controller'
    }
  },
  system: {
    rootOrg: {
      // The roles which should be only available for the root org
      roleIds: {
        format: Array,
        default: [
          'cb18eb9c-3264-434a-8a8d-e6b2d680f66e', // Desktop Superadmin
          '3459c3de-493f-443a-8ad0-ddb9f3f6c76d', // Customer Service
          '37b18322-74bf-4ae4-a46f-2cc407a9966c' // Finance Admin
        ],
        remoteConfig: 'aiware-controller'
      },
      orgIds: {
        format: Array,
        default: [],
        remoteConfig: 'aiware-controller'
      }
    }
  },
  instanceAuditLog: {
    maximumTimeWindowLengthDays: {
      format: 'int',
      default: 365,
      remoteConfig: 'aiware-controller'
    },
    defaultTimeWindowLengthDays: {
      format: 'int',
      default: 15,
      remoteConfig: 'aiware-controller'
    },
    elasticSearchSink: {
      requestRetryCount: {
        format: 'int',
        default: 3,
        remoteConfig: 'aiware-controller'
      }
    }
  },
  localCache: {
    // default
    ttlMin: {
      format: 'int',
      default: 2,
      remoteConfig: 'aiware-controller'
    },
    maxSize: {
      format: 'int',
      default: 1000,
      remoteConfig: 'aiware-controller'
    },
    // rbac related caches
    rbacAuthPermissionSets: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      },
    },
    rbacAuthGroups: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      },
    },
    rbacAclForResources: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      },
    },
    rbacAclHasPermissions: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      },
    },
    rbacAuthGroupsForMember: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      }
    },
    rbacAuthGroupsForOrgPermissions: {
      ttlMin: {
        format: 'int',
        default: 2,
        remoteConfig: 'aiware-controller'
      },
      maxSize: {
        format: 'int',
        default: 10000,
        remoteConfig: 'aiware-controller'
      }
    }
  },
  social: {
    maxPublishRenditionFileSizeBytes: {
      doc:
        'Largest dmh-rendition (bytes) distributeAsset will select as the publish file; a Master over this is ' +
        'skipped in favor of the Proxy. This is the guard against editing-format ProRes Masters, which share ' +
        'the video/quicktime container with publishable H.264 Masters and cannot be told apart by contentType. ' +
        'Default 4 GiB: a 1080p ProRes 422 HQ Master exceeds it within a few minutes of runtime while H.264 ' +
        'publish Masters rarely approach it, and it is under every supported social platform\'s upload limit ' +
        'except YouTube. 0 disables the ceiling.',
      format: 'int',
      default: 4294967296,
      remoteConfig: 'aiware-controller'
    },
    rejectWhenNoPublishRendition: {
      doc:
        'When a DMH TDO has dmh-renditions but none is a publish-suitable Master/Proxy, distributeAsset rejects the ' +
        'publish (resource_conflict, data.retryable) instead of letting the engine publish the primary media asset, ' +
        'which for DMH content is the Preview (VE-26886). ' +
        'Back-out lever, not a gate: the engine-side assetId precedence (engines#1843) is merged, so true is the ' +
        'intended setting. Set false only to restore the pre-VE-26886 warn-and-fall-through if a tenant\'s ' +
        'dmh.Purpose vocabulary turns out not to be Master/Proxy/Preview.',
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    }
  },
  assetSize: {
    retryMaxAttempts: {
      doc: 'Maximum number of retry attempts when fetching asset size returns a not-found error',
      format: 'int',
      default: 5,
      remoteConfig: 'aiware-controller'
    },
    retryInitialDelayMs: {
      doc: 'Initial back-off delay in milliseconds for asset size not-found retries (doubles each attempt)',
      format: 'int',
      default: 500,
      remoteConfig: 'aiware-controller'
    }
  }
};

const _ = require('lodash');

const { ConfigLoader } = require('@veritone/ts-config-lib');
const GraphQLServiceFeatureFlags = require('./featureFlags');
const {
  sanitizeCspValue,
  formatSanitizationWarnings
} = require('../util/contentSecurityPolicyUtil');

class GraphQLServiceConfig {
  static async getConfig(provider) {
    const config = await ConfigLoader.loadConfig(
      new GraphQLServiceConfig(),
      provider
    );
    const featureFlags = await GraphQLServiceFeatureFlags.getFlags();
    return _.merge({}, config, featureFlags);
  }

  getServiceConfigSchema() {
    return SERVICE_CONFIG;
  }

  getStaticServiceConfigFile() {
    return './config/service.yml';
  }

  getResourceMap() {
    const map = new Map();
    map.set('redis', (resourceMap, resourceName, data) => {
      const configMap = {
        redis: 'redis',
        coreAdminRedis: 'coreAdminRedis'
      };
      if (configMap[resourceName]) {
        const redisConfig = GraphQLServiceConfig.parseRedisConnectionString(
          data.URI
        );
        if (redisConfig) {
          _.set(resourceMap, configMap[resourceName], redisConfig);
        }
      }
    });
    map.set('es', (resourceMap, _resourceName, data) => {
      _.set(resourceMap, `elastic.connection.host`, data.URI);
    });
    return map;
  }

  legacyConfigConvert(data, path) {
    if (path === 's3.buckets') {
      const buckets = _.get(data, path);
      if (Array.isArray(buckets)) {
        return _.pick(data, path);
      } else if (typeof buckets === 'object') {
        // legacy config where buckets are object
        const bucketArray = [];
        for (const key in buckets) {
          if (Object.prototype.hasOwnProperty.call(buckets, key)) {
            bucketArray.push(_.merge({ key }, buckets[key]));
          }
        }
        return _.set({}, path, bucketArray);
      }
    }
    return null;
  }

  static parseRedisConnectionString(connectionString) {
    const m = /redis:\/\/((?<user>[^:]+):(?<password>[^:@]+)@)?(?<host>[^:]+):(?<port>\d+).*/.exec(
      connectionString
    );
    if (m) {
      return {
        user: m.groups.user || '',
        password: m.groups.password || '',
        host: m.groups.host,
        port: parseInt(m.groups.port, 10)
      };
    }
    return null;
  }

  postProcess(data) {
    if (!_.isEmpty(data.edgeClusterID)) {
      // if running on aiWare update default cluster values
      if (_.isEmpty(data.defaultRealTimeCluster)) {
        data.defaultRealTimeCluster = data.edgeClusterID;
      }
      if (_.isEmpty(_.get(data, 'aiware.defaultCluster.id'))) {
        _.set(data, 'aiware.defaultCluster.id', data.edgeClusterID);
      }
    }
    _.set(
      data,
      'log.console.level',
      _.get(data, 'log.level', 'warn').toLowerCase()
    );
    GraphQLServiceConfig.sanitizeCspConfig(data);
    return data;
  }

  static sanitizeCspConfig(data) {
    try {
      const result = sanitizeCspValue(
        _.get(data, 'server.headers.csp.value', '')
      );

      if (result.dropped.length > 0) {
        _.set(data, 'server.headers.csp.value', result.value);
      }
      const warnings = formatSanitizationWarnings(result);
      if (warnings.length > 0) {
        _.set(data, 'server.headers.csp.sanitizationWarnings', warnings);
      }
    } catch (err) {
      _.set(data, 'server.headers.csp.sanitizationWarnings', [
        'CSP: sanitization of server.headers.csp.value failed, emitting the ' +
          `configured value unchanged: ${err.message}`
      ]);
    }
  }
}

module.exports = GraphQLServiceConfig;
