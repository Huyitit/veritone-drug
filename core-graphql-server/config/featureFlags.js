//TODO: replace this with a featureFlag service and remove from config
const FEATURE_FLAGS = {
  featureFlags: {
    rateLimitOnUnhealthyServer: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    redisCacheEnabled: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    enforceWatchlistRangeLimits: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    sharedMention: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    allowSharedMentionById: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    sdRestEndpoint: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    adminEndpoint: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    enableClusterPreference: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    maxTDOAssetLimitWarnOnly: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    getTDOMetadataFromMediaPlatform: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    enabledAWSUrlSignErrorHandling: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    useNewUpdateTask: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    defaultTimezoneOffset: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    errorOnMessageFailure: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    maxSharedMentionId: {
      format: Number,
      default: 0,
      remoteConfig: 'aiware-controller'
    },
    enableRBACFeature: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    v2FoldersAvailable: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    enablePackageGrantLogic: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    skipPackageResourceValidation: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    canExportLogsOlderThan12Months: {
      format: Boolean,
      default: true,
      remoteConfig: 'aiware-controller'
    },
    enableStrictRoleValidation: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    readAuditEvents: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    virtualAssetEnabled: {
      format: Boolean,
      default: false,
      remoteConfig: 'aiware-controller'
    },
    // VE-24929 (BR-5): social-destination connect gate. A platform's connect entry stays OFF until its lowercase
    // Ayrshare platform key is added here — flip it on by adding the key once white-label is configured for that
    // network, so the hosted linking page never shows vendor branding. e.g. ['facebook', 'instagram', 'tiktok'].
    // YouTube is always enabled (pre-existing, not gated). A single array keeps this maintainable as new social
    // platforms are added: enabling one is a remote-config change, not a new flag.
    enabledDestinationConnects: {
      format: Array,
      default: [],
      remoteConfig: 'aiware-controller'
    }
  }
};

const { ConfigLoader } = require('@veritone/ts-config-lib');
class GraphQLServiceFeatureFlags {
  static async getFlags(provider) {
    return ConfigLoader.loadConfig(new GraphQLServiceFeatureFlags(), provider);
  }

  getServiceConfigSchema() {
    return FEATURE_FLAGS;
  }

  getStaticServiceConfigFile() {
    return null;
  }

  getResourceMap() {
    return new Map();
  }

  legacyConfigConvert(data, path) {
    return null;
  }
  postProcess(data) {
    return data;
  }
}

module.exports = GraphQLServiceFeatureFlags;
